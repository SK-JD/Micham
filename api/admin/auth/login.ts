import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../../_lib/http";
import { auditAdmin, createAdminSession, permissionsForRole, verifyAdminPassword, type AdminRole, type AdminUser } from "../../_lib/adminSecurity";
import { isEmail, rateLimit } from "../../_lib/security";
import { adminDb } from "../../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  let auditEmail = "";
  try {
    beginRequest(req, res, "admin/auth/login");
    method(req, "POST");
    const body = bodyObject(req);
    const email = stringField(body, "email").toLowerCase();
    const password = stringField(body, "password");
    auditEmail = email;

    if (!isEmail(email)) throw new ApiError(400, "Enter a valid admin email.");
    await rateLimit(`admin:login:${email}`, 8, 15 * 60);

    const { data: admin, error } = await adminDb()
      .from("micham_admin_users")
      .select("id, email, display_name, password_hash, role, status")
      .eq("email", email)
      .maybeSingle();
    if (error) throw error;
    if (!admin || admin.status !== "ACTIVE" || !(await verifyAdminPassword(password, admin.password_hash))) {
      await auditAdmin(req, null, "admin.login_failed", "admin", undefined, { email: auditEmail });
      throw new ApiError(401, "Invalid admin email or password.");
    }

    const safeAdmin: AdminUser = {
      id: admin.id,
      email: admin.email,
      display_name: admin.display_name,
      role: admin.role as AdminRole,
      status: admin.status,
    };
    const session = await createAdminSession(safeAdmin, req);
    await adminDb().from("micham_admin_users").update({ last_login_at: new Date().toISOString() }).eq("id", admin.id);
    await auditAdmin(req, safeAdmin, "admin.login", "admin", admin.id);
    jsonOk(res, { admin: { ...safeAdmin, permissions: permissionsForRole(safeAdmin.role) }, session });
  } catch (error) {
    handleError(res, error);
  }
}
