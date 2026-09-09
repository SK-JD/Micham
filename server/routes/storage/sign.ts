import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../../_lib/http.js";
import { ensureFeatureEnabled, ensureUserFeature } from "../../_lib/runtimePolicy.js";
import { rateLimit, requireUser } from "../../_lib/security.js";
import { receiptBucketName } from "../../_lib/receiptStorage.js";
import { adminDb } from "../../_lib/supabaseAdmin.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "storage/sign");
    method(req, "POST");
    const user = await requireUser(req);
    await ensureFeatureEnabled("receipts", "Receipts are temporarily unavailable.");
    await ensureUserFeature(user.id, "RECEIPTS", "Your current plan does not include receipts.");
    await rateLimit(`storage:sign:${user.id}`, 240, 60 * 60);
    const body = bodyObject(req);
    const path = stringField(body, "path");
    if (!path) throw new ApiError(400, "Receipt path is required.");
    const db = adminDb();
    const { data: file, error: fileError } = await db
      .from("micham_receipt_files")
      .select("id")
      .eq("user_id", user.id)
      .eq("storage_path", path)
      .is("deleted_at", null)
      .maybeSingle();
    if (fileError) throw fileError;
    if (!file) throw new ApiError(404, "Receipt was not found.");
    const expiresIn = 60 * 10;
    const { data, error } = await db.storage.from(receiptBucketName()).createSignedUrl(path, expiresIn, { download: false });
    if (error || !data?.signedUrl) throw error || new ApiError(500, "Receipt could not be opened.");
    jsonOk(res, { url: data.signedUrl, expiresIn });
  } catch (error) {
    handleError(res, error);
  }
}
