import { ApiError, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../_lib/http";
import { hashPassword, sha256 } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    method(req, "POST");
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
