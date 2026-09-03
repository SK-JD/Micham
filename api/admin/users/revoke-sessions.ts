import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../../_lib/http";
import { auditAdmin, requireAdmin } from "../../_lib/adminSecurity";
import { adminDb } from "../../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "admin/users/revoke-sessions");
    method(req, "POST");
    const admin = await requireAdmin(req, "users.manage");
    const userId = stringField(bodyObject(req), "userId");
    if (!userId) throw new ApiError(400, "User ID is required.");
    const { error } = await adminDb().from("micham_user_sessions").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).is("revoked_at", null);
    if (error) throw error;
    await auditAdmin(req, admin, "user.revoke_sessions", "user", userId);
    jsonOk(res, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}
