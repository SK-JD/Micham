import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../../_lib/http.js";
import { ensureFeatureEnabled, ensureUserFeature } from "../../_lib/runtimePolicy.js";
import { rateLimit, requireUser } from "../../_lib/security.js";
import { getReceiptUsage, receiptBucketName } from "../../_lib/receiptStorage.js";
import { adminDb } from "../../_lib/supabaseAdmin.js";

function dateBound(value: string, end = false) {
  if (!value) return "";
  const date = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, "Storage clear date range is invalid.");
  return date.toISOString();
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "storage/clear");
    method(req, "POST");
    const user = await requireUser(req);
    await ensureFeatureEnabled("receipts", "Receipts are temporarily unavailable.");
    await ensureUserFeature(user.id, "RECEIPTS", "Your current plan does not include receipts.");
    await rateLimit(`storage:clear:${user.id}`, 12, 60 * 60);
    const body = bodyObject(req);
    const from = dateBound(stringField(body, "fromDate"));
    const to = dateBound(stringField(body, "toDate"), true);
    const db = adminDb();
    let query = db.from("micham_receipt_files").select("storage_path,size_bytes").eq("user_id", user.id).is("deleted_at", null);
    if (from) query = query.gte("uploaded_at", from);
    if (to) query = query.lte("uploaded_at", to);
    const { data: files, error } = await query;
    if (error) throw error;
    const paths = (files ?? []).map((file) => String(file.storage_path));
    if (paths.length) {
      await db.storage.from(receiptBucketName()).remove(paths);
      const deletedAt = new Date().toISOString();
      const { error: updateError } = await db.from("micham_receipt_files").update({ deleted_at: deletedAt }).in("storage_path", paths).eq("user_id", user.id);
      if (updateError) throw updateError;
    }
    jsonOk(res, {
      ok: true,
      deleted: paths.length,
      freedBytes: (files ?? []).reduce((sum, file) => sum + Number(file.size_bytes || 0), 0),
      usage: await getReceiptUsage(user.id),
    });
  } catch (error) {
    handleError(res, error);
  }
}
