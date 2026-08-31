import { ApiError, bodyObject, handleError, jsonOk, stringField, type ApiRequest, type ApiResponse } from "../_lib/http";
import { sha256 } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";

function html(res: ApiResponse, status: number, title: string, message: string) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const body = `<!doctype html>
<html>
  <head>
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body{margin:0;min-height:100vh;display:grid;place-items:center;background:#052d22;color:#eafff7;font-family:Arial,sans-serif}
      main{max-width:420px;padding:28px;border:1px solid #0abf8f;border-radius:14px;background:#073d2f}
      h1{margin:0 0 10px;font-size:24px} p{line-height:1.5;color:#a7f3d0}
    </style>
  </head>
  <body><main><h1>${title}</h1><p>${message}</p></main></body>
</html>`;
  const response = res.status(status) as ApiResponse & { send?: (body: string) => void };
  if (response.send) response.send(body);
  else response.json({ html: body });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    if (!["GET", "POST"].includes(req.method || "")) throw new ApiError(405, "Method not allowed.");
    const token =
      req.method === "GET"
        ? String(Array.isArray(req.query?.token) ? req.query?.token[0] : req.query?.token || "").trim()
        : stringField(bodyObject(req), "token");
    if (!token) throw new ApiError(400, "Verification token is required.");

    const db = adminDb();
    const { data: row, error } = await db
      .from("micham_email_tokens")
      .select("id, user_id, expires_at, used_at")
      .eq("token_hash", sha256(token))
      .eq("token_type", "verify_email")
      .maybeSingle();
    if (error) throw error;
    if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) throw new ApiError(400, "Verification link is invalid or expired.");

    await db.from("micham_app_users").update({ email_verified: true, updated_at: new Date().toISOString() }).eq("id", row.user_id);
    await db.from("micham_email_tokens").update({ used_at: new Date().toISOString() }).eq("id", row.id);
    if (req.method === "GET") {
      html(res, 200, "Email verified", "Your Micham account is ready. Return to the app and login.");
      return;
    }
    jsonOk(res, { ok: true });
  } catch (error) {
    if (req.method === "GET") {
      html(res, error instanceof ApiError ? error.status : 500, "Verification failed", error instanceof Error ? error.message : "Server error.");
      return;
    }
    handleError(res, error);
  }
}
