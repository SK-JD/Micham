import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, type ApiRequest, type ApiResponse } from "../_lib/http";
import { rateLimit, requireUser } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";

const entityTypes = new Set(["accounts", "categories", "transactions", "budgets", "recurringTransactions", "people", "settlements", "repayments"]);
const maxMutationsPerPush = 200;

function items(value: unknown) {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

function validateEntityId(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 140) throw new ApiError(400, `${label} is invalid.`);
  return value.trim();
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "sync/push");
    method(req, "POST");
    const user = await requireUser(req);
    await rateLimit(`sync:push:${user.id}`, 120, 60 * 60);
    const snapshot = bodyObject(req, { maxBytes: 2 * 1024 * 1024 });
    const profile = snapshot.profile && typeof snapshot.profile === "object" ? (snapshot.profile as Record<string, unknown>) : undefined;
    const db = adminDb();

    if (profile) {
      const { error: profileError } = await db.from("micham_profiles").upsert(
        {
          id: user.id,
          local_profile_id: String(profile.id || ""),
          email: user.email,
          display_name: user.display_name,
          currency: user.currency,
          connection_code: user.connection_code,
        },
        { onConflict: "id" },
      );
      if (profileError) throw profileError;
    }

    const rows: Array<Record<string, unknown>> = [];
    const mutations = items(snapshot.mutations);
    if (mutations.length > maxMutationsPerPush) throw new ApiError(400, `Sync can send at most ${maxMutationsPerPush} changes at once.`);

    const seen = new Set<string>();
    for (const mutation of mutations) {
      const entityType = String(mutation.entityType || mutation.entity || "");
      if (!entityTypes.has(entityType)) throw new ApiError(400, "Sync entity type is invalid.");
      const entityId = validateEntityId(mutation.entityId, "Sync entity ID");
      const action = mutation.action === "delete" ? "delete" : "upsert";
      const clientMutationId = validateEntityId(mutation.clientMutationId, "Client mutation ID");
      const dedupeKey = `${clientMutationId}:${entityType}:${entityId}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const payload = mutation.payload && typeof mutation.payload === "object" && !Array.isArray(mutation.payload)
        ? (mutation.payload as Record<string, unknown>)
        : {};
      rows.push({
        owner_id: user.id,
        entity_type: entityType,
        entity_id: entityId,
        payload: { ...payload, id: entityId, syncState: "synced", clientMutationId },
        deleted_at: action === "delete" ? new Date().toISOString() : payload.deletedAt || null,
      });
    }

    if (rows.length) {
      const { error } = await db.from("micham_entities").upsert(rows, { onConflict: "owner_id,entity_type,entity_id" });
      if (error) throw error;
    }
    jsonOk(res, { ok: true, synced: rows.length });
  } catch (error) {
    handleError(res, error);
  }
}
