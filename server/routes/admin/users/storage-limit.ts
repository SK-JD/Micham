import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../../../_lib/http.js";
import { requireAdmin } from "../../../_lib/adminSecurity.js";
import { adminDb } from "../../../_lib/supabaseAdmin.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "admin/users/storage-limit");
    method(req, "POST");
    await requireAdmin(req, "users.manage");
    const body = bodyObject(req);
    const userId = stringField(body, "userId");
    const limitMb = Number(body.limitMb);
    if (!userId || !Number.isFinite(limitMb) || limitMb <= 0 || limitMb > 2048) {
      throw new ApiError(400, "Enter a receipt limit between 1 MB and 2048 MB.");
    }
    const limitBytes = Math.round(limitMb * 1024 * 1024);
    const { error } = await adminDb().from("micham_user_storage_limits").upsert(
      { user_id: userId, limit_bytes: limitBytes, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    if (error) throw error;
    jsonOk(res, { ok: true, limitBytes });
  } catch (error) {
    handleError(res, error);
  }
}
