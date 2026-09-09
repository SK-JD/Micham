import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../../_lib/http.js";
import { ensureFeatureEnabled, ensureUserFeature } from "../../_lib/runtimePolicy.js";
import { randomToken, rateLimit, requireUser } from "../../_lib/security.js";
import { decodeDataUrl, getReceiptUsage, receiptBucketName, safeReceiptName } from "../../_lib/receiptStorage.js";
import { adminDb } from "../../_lib/supabaseAdmin.js";

const relatedTypes = new Set(["transaction", "settlement"]);

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "storage/upload");
    method(req, "POST");
    const user = await requireUser(req);
    await ensureFeatureEnabled("receipts", "Receipts are temporarily unavailable.");
    await ensureUserFeature(user.id, "RECEIPTS", "Your current plan does not include receipts.");
    await rateLimit(`storage:upload:${user.id}`, 80, 60 * 60);
    const body = bodyObject(req, { maxBytes: 1200 * 1024 });
    const dataUrl = stringField(body, "dataUrl");
    const filename = safeReceiptName(stringField(body, "filename"));
    const relatedType = stringField(body, "relatedType");
    const relatedId = stringField(body, "relatedId");
    if (!relatedTypes.has(relatedType) || !relatedId) throw new ApiError(400, "Receipt owner record is invalid.");

    const { mime, buffer } = decodeDataUrl(dataUrl);
    const usage = await getReceiptUsage(user.id);
    if (usage.usedBytes + buffer.byteLength > usage.limitBytes) {
      throw new ApiError(413, "Receipt storage limit reached. Clear old receipts or ask admin to increase the limit.", "RECEIPT_STORAGE_LIMIT", false);
    }

    const db = adminDb();
    const date = new Date();
    const path = `${user.id}/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${randomToken().slice(0, 18)}-${filename}`;
    const { error: uploadError } = await db.storage.from(receiptBucketName()).upload(path, buffer, {
      cacheControl: "31536000",
      contentType: mime,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const uploadedAt = new Date().toISOString();
    const { error: insertError } = await db.from("micham_receipt_files").insert({
      user_id: user.id,
      storage_path: path,
      filename,
      mime_type: mime,
      size_bytes: buffer.byteLength,
      related_type: relatedType,
      related_id: relatedId,
      uploaded_at: uploadedAt,
    });
    if (insertError) {
      await db.storage.from(receiptBucketName()).remove([path]);
      throw insertError;
    }

    jsonOk(res, {
      receipt: { path, name: filename, size: buffer.byteLength, mime, uploadedAt },
      usage: await getReceiptUsage(user.id),
    });
  } catch (error) {
    handleError(res, error);
  }
}
