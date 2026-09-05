import { beginRequest, handleError, jsonOk, method, type ApiRequest, type ApiResponse } from "../../_lib/http.js";
import { permissionsForRole, requireAdmin } from "../../_lib/adminSecurity.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "admin/auth/me");
    method(req, "GET");
    const admin = await requireAdmin(req, "dashboard.view");
    jsonOk(res, { admin: { ...admin, permissions: permissionsForRole(admin.role) } });
  } catch (error) {
    handleError(res, error);
  }
}
