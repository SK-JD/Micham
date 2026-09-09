import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../../_lib/http.js";
import { hashPassword, rateLimit, requireUser, verifyPassword } from "../../_lib/security.js";
import { adminDb } from "../../_lib/supabaseAdmin.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "auth/change-pin");
    method(req, "POST");
    const user = await requireUser(req);
    await rateLimit(`auth:change-pin:${user.id}`, 8, 60 * 60);
    const body = bodyObject(req);
    const currentPin = stringField(body, "currentPin") || stringField(body, "currentPassword");
    const newPin = stringField(body, "newPin") || stringField(body, "newPassword");
    if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)) throw new ApiError(400, "PIN must be exactly 4 digits.");
    const db = adminDb();
    const { data: row, error } = await db.from("micham_app_users").select("password_hash").eq("id", user.id).maybeSingle();
    if (error) throw error;
    if (!row || !(await verifyPassword(currentPin, row.password_hash))) throw new ApiError(401, "Current PIN is incorrect.");
    const { error: updateError } = await db.from("micham_app_users").update({ password_hash: await hashPassword(newPin), updated_at: new Date().toISOString() }).eq("id", user.id);
    if (updateError) throw updateError;
    jsonOk(res, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}
