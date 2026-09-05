import { beginRequest, handleError, jsonOk, method, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { rateLimit, requireUser } from "../_lib/security.js";
import { adminDb } from "../_lib/supabaseAdmin.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "auth/delete-account");
    method(req, "POST");
    const user = await requireUser(req);
    await rateLimit(`auth:delete:${user.id}`, 3, 24 * 60 * 60);
    const { error } = await adminDb().from("micham_app_users").delete().eq("id", user.id);
    if (error) throw error;
    jsonOk(res, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}
