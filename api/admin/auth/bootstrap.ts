import { ApiError, beginRequest, bodyObject, handleError, jsonCreated, method, stringField, type ApiRequest, type ApiResponse } from "../../_lib/http.js";
import { adminDb } from "../../_lib/supabaseAdmin.js";
import { auditAdmin, createAdminPasswordHash } from "../../_lib/adminSecurity.js";
import { isEmail } from "../../_lib/security.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "admin/auth/bootstrap");
    method(req, "POST");
    const setupToken = process.env.ADMIN_SETUP_TOKEN?.trim();
    if (!setupToken) throw new ApiError(503, "Admin bootstrap is not configured.");

    const body = bodyObject(req);
    if (stringField(body, "setupToken") !== setupToken) throw new ApiError(403, "Invalid admin setup token.");

    const email = stringField(body, "email").toLowerCase();
    const loginId = stringField(body, "loginId").toLowerCase() || email;
    const password = stringField(body, "password");
    const displayName = stringField(body, "displayName") || email.split("@")[0] || "Admin";
    if (!isEmail(email)) throw new ApiError(400, "Enter a valid admin email.");
    if (password.length < 12) throw new ApiError(400, "Admin password must be at least 12 characters.");

    const db = adminDb();
    const { count, error: countError } = await db.from("micham_admin_users").select("id", { count: "exact", head: true });
    if (countError) throw countError;
    if ((count || 0) > 0) throw new ApiError(409, "Admin bootstrap is already complete.");

    const { data: admin, error } = await db
      .from("micham_admin_users")
      .insert({
        email,
        login_id: loginId,
        display_name: displayName,
        password_hash: await createAdminPasswordHash(password),
        role: "SUPER_ADMIN",
      })
      .select("id, email, display_name, role, status, created_at")
      .single();
    if (error) throw error;
    await auditAdmin(req, null, "admin.bootstrap", "admin", admin.id, { email });
    jsonCreated(res, { admin });
  } catch (error) {
    handleError(res, error);
  }
}
