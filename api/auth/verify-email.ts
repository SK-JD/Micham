import { ApiError, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../_lib/http";
import { sha256 } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    method(req, "POST");
    const token = stringField(bodyObject(req), "token");
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
    jsonOk(res, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}
