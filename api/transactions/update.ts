import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../_lib/http";
import { ensureRuntimeEnabled, ensureUserFeature } from "../_lib/runtimePolicy";
import { rateLimit, requireUser } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "transactions/update");
    method(req, "POST");
    const user = await requireUser(req);
    await ensureRuntimeEnabled("sync_enabled", "cloud_sync", "Cloud sync is temporarily unavailable.");
    await ensureUserFeature(user.id, "CLOUD_SYNC", "Your current plan does not include cloud sync.");
    await rateLimit(`transactions:update:${user.id}`, 240, 60 * 60);
    const body = bodyObject(req, { maxBytes: 256 * 1024 });
    const transactionId = stringField(body, "transactionId");
    const nextPayload = body.nextPayload && typeof body.nextPayload === "object" ? (body.nextPayload as Record<string, unknown>) : undefined;
    const editNote = stringField(body, "editNote");
    if (!transactionId || !nextPayload) throw new ApiError(400, "Transaction ID and next payload are required.");

    const db = adminDb();
    const { data: current, error: currentError } = await db
      .from("micham_entities")
      .select("payload")
      .eq("owner_id", user.id)
      .eq("entity_type", "transactions")
      .eq("entity_id", transactionId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) throw new ApiError(404, "Transaction was not found.");

    const timestamp = new Date().toISOString();
    const auditedPayload = {
      ...nextPayload,
      edited: true,
      editCount: Number(nextPayload.editCount || 0) + 1,
      lastEditedAt: timestamp,
      previousVersion: current.payload,
      updatedAt: timestamp,
    };
    const { error: revisionError } = await db.from("micham_transaction_revisions").insert({
      owner_id: user.id,
      transaction_id: transactionId,
      previous_payload: current.payload,
      next_payload: auditedPayload,
      edit_note: editNote || null,
    });
    if (revisionError) throw revisionError;

    const { error } = await db
      .from("micham_entities")
      .update({ payload: auditedPayload, updated_at: timestamp })
      .eq("owner_id", user.id)
      .eq("entity_type", "transactions")
      .eq("entity_id", transactionId);
    if (error) throw error;
    jsonOk(res, { transaction: auditedPayload });
  } catch (error) {
    handleError(res, error);
  }
}
