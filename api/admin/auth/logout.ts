import { beginRequest, handleError, jsonOk, method, type ApiRequest, type ApiResponse, authToken } from "../../_lib/http";
import { auditAdmin, requireAdmin } from "../../_lib/adminSecurity";
import { adminDb } from "../../_lib/supabaseAdmin";
import { sha256 } from "../../_lib/security";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "admin/auth/logout");
    method(req, "POST");
    const admin = await requireAdmin(req, "dashboard.view");
    await adminDb().from("micham_admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("token_hash", sha256(authToken(req)));
    await auditAdmin(req, admin, "admin.logout", "admin", admin.id);
    jsonOk(res, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}
