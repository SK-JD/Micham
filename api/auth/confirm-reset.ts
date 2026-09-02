import { ApiError, bodyObject, handleError, jsonOk, stringField, type ApiRequest, type ApiResponse } from "../_lib/http";
import { hashPassword, sha256 } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";

function html(res: ApiResponse, status: number, body: string) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const response = res.status(status) as ApiResponse & { send?: (body: string) => void };
  if (response.send) response.send(body);
  else response.json({ html: body });
}

function resetPage(token: string, message = "") {
  return `<!doctype html>
<html>
  <head>
    <title>Reset Micham password</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body{margin:0;min-height:100vh;display:grid;place-items:center;background:#052d22;color:#eafff7;font-family:Arial,sans-serif}
      main{max-width:420px;width:calc(100% - 32px);padding:24px;border:1px solid #0abf8f;border-radius:14px;background:#073d2f}
      h1{margin:0 0 10px;font-size:24px} p{line-height:1.5;color:#a7f3d0}
      label{display:grid;gap:6px;margin-top:14px;color:#d1fae5;font-weight:700}
      input{min-height:44px;border-radius:8px;border:1px solid #0abf8f;background:#052d22;color:#eafff7;padding:0 12px;font:inherit}
      button{width:100%;min-height:46px;margin-top:18px;border:0;border-radius:8px;background:#0abf8f;color:#052d22;font-weight:800;font:inherit}
      .msg{color:#fbbf24}
    </style>
  </head>
  <body>
    <main>
      <h1>Reset password</h1>
      <p>Set a new Micham password. After saving, return to the app and login again.</p>
      ${message ? `<p class="msg">${message}</p>` : ""}
      <label>New password<input id="password" type="password" minlength="8" autocomplete="new-password" /></label>
      <label>Confirm password<input id="confirm" type="password" minlength="8" autocomplete="new-password" /></label>
      <button id="save">Save password</button>
      <script>
        document.getElementById("save").addEventListener("click", async () => {
          const password = document.getElementById("password").value;
          const confirm = document.getElementById("confirm").value;
          if (password.length < 8) return alert("Password must be at least 8 characters.");
          if (password !== confirm) return alert("Passwords do not match.");
          const response = await fetch("/api/auth/confirm-reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: ${JSON.stringify(token)}, password })
          });
          const result = await response.json().catch(() => ({}));
          document.querySelector("main").innerHTML = response.ok
            ? "<h1>Password changed</h1><p>Your password has been updated. Return to Micham and login.</p>"
            : "<h1>Reset failed</h1><p>" + (result.error || "Unable to reset password.") + "</p>";
        });
      </script>
    </main>
  </body>
</html>`;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    if (!["GET", "POST"].includes(req.method || "")) throw new ApiError(405, "Method not allowed.");
    if (req.method === "GET") {
      const token = String(Array.isArray(req.query?.token) ? req.query?.token[0] : req.query?.token || "").trim();
      if (!token) throw new ApiError(400, "Reset token is required.");
      html(res, 200, resetPage(token));
      return;
    }
    const body = bodyObject(req);
    const token = stringField(body, "token");
    const password = stringField(body, "password");
    if (!token) throw new ApiError(400, "Reset token is required.");
    if (password.length < 8) throw new ApiError(400, "Password must be at least 8 characters.");

    const db = adminDb();
    const { data: row, error } = await db
      .from("micham_email_tokens")
      .select("id, user_id, expires_at, used_at")
      .eq("token_hash", sha256(token))
      .eq("token_type", "reset_password")
      .maybeSingle();
    if (error) throw error;
    if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) throw new ApiError(400, "Reset link is invalid or expired.");

    await db.from("micham_app_users").update({ password_hash: await hashPassword(password), updated_at: new Date().toISOString() }).eq("id", row.user_id);
    await db.from("micham_email_tokens").update({ used_at: new Date().toISOString() }).eq("id", row.id);
    await db.from("micham_user_sessions").update({ revoked_at: new Date().toISOString() }).eq("user_id", row.user_id);
    jsonOk(res, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}
