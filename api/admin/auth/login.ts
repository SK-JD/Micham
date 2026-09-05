import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../../_lib/http.js";
import { auditAdmin, createAdminSession, permissionsForRole, verifyAdminPassword, type AdminRole, type AdminUser } from "../../_lib/adminSecurity.js";
import { rateLimit } from "../../_lib/security.js";
import { adminDb } from "../../_lib/supabaseAdmin.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  let auditLogin = "";
  try {
    beginRequest(req, res, "admin/auth/login");
    method(req, "POST");
    const body = bodyObject(req);
    const login = stringField(body, "email").toLowerCase();
    const password = stringField(body, "password");
    auditLogin = login;

    if (!login) throw new ApiError(400, "Enter an admin login.");
    await rateLimit(`admin:login:${login}`, 8, 15 * 60);

    const { data: admin, error } = await adminDb()
      .from("micham_admin_users")
      .select("id, email, login_id, display_name, password_hash, role, status")
      .or(`email.eq.${login},login_id.eq.${login}`)
      .maybeSingle();
    if (error) throw error;
    if (!admin || admin.status !== "ACTIVE" || !(await verifyAdminPassword(password, admin.password_hash))) {
      await auditAdmin(req, null, "admin.login_failed", "admin", undefined, { login: auditLogin });
      throw new ApiError(401, "Invalid admin login or password.");
    }

    const safeAdmin: AdminUser = {
      id: admin.id,
      email: admin.email,
      login_id: admin.login_id,
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
