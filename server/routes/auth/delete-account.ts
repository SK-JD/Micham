import { beginRequest, handleError, jsonOk, method, type ApiRequest, type ApiResponse } from "../../_lib/http.js";
import { rateLimit, requireUser } from "../../_lib/security.js";
import { adminDb } from "../../_lib/supabaseAdmin.js";
import { receiptBucketName } from "../../_lib/receiptStorage.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "auth/delete-account");
    method(req, "POST");
    const user = await requireUser(req);
    await rateLimit(`auth:delete:${user.id}`, 3, 24 * 60 * 60);
    const db = adminDb();
    const { data: receiptFiles, error: receiptError } = await db
      .from("micham_receipt_files")
      .select("storage_path")
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (receiptError) throw receiptError;
    const receiptPaths = (receiptFiles ?? []).map((file) => String(file.storage_path)).filter(Boolean);
    if (receiptPaths.length) {
      const { error: storageError } = await db.storage.from(receiptBucketName()).remove(receiptPaths);
      if (storageError) throw storageError;
      const { error: markDeletedError } = await db
        .from("micham_receipt_files")
        .update({ deleted_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .in("storage_path", receiptPaths);
      if (markDeletedError) throw markDeletedError;
    }
    const { error } = await db.from("micham_app_users").delete().eq("id", user.id);
    if (error) throw error;
    jsonOk(res, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}
