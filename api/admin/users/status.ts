import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../../_lib/http";
import { auditAdmin, requireAdmin } from "../../_lib/adminSecurity";
import { adminDb } from "../../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "admin/users/status");
    method(req, "POST");
    const admin = await requireAdmin(req, "users.manage");
    const body = bodyObject(req);
    const userId = stringField(body, "userId");
    const status = stringField(body, "status").toUpperCase();
    const reason = stringField(body, "reason");
    const userStatus = status === "ACTIVE" ? "active" : status === "SUSPENDED" ? "blocked" : "";
    if (!userId || !userStatus) throw new ApiError(400, "User ID and ACTIVE or SUSPENDED status are required.");

    const { data: user, error } = await adminDb()
      .from("micham_app_users")
      .update({ status: userStatus, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select("id, email, display_name, status")
      .single();
    if (error) throw error;
    if (userStatus === "blocked") {
      await adminDb().from("micham_user_sessions").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).is("revoked_at", null);
    }
    await auditAdmin(req, admin, `user.${userStatus === "blocked" ? "suspend" : "activate"}`, "user", userId, { reason });
    jsonOk(res, { user });
  } catch (error) {
    handleError(res, error);
  }
}
