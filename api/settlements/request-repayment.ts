import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { ensureFeatureEnabled, ensureUserFeature } from "../_lib/runtimePolicy.js";
import { rateLimit, requireUser } from "../_lib/security.js";
import { adminDb } from "../_lib/supabaseAdmin.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "settlements/request-repayment");
    method(req, "POST");
    const user = await requireUser(req);
    await ensureFeatureEnabled("settlements", "Settlements are temporarily unavailable.");
    await ensureUserFeature(user.id, "SETTLEMENTS", "Your current plan does not include settlements.");
    await rateLimit(`settlements:action:${user.id}`, 120, 60 * 60);
    const body = bodyObject(req, { maxBytes: 128 * 1024 });
    const friendUserId = stringField(body, "friendUserId");
    const settlementEntityId = stringField(body, "settlementEntityId");
    const previousEventId = stringField(body, "previousEventId") || null;
    const clientMutationId = stringField(body, "clientMutationId");
    const amount = Number(body.amount) || 0;
    if (!friendUserId || !settlementEntityId || amount <= 0 || !Number.isFinite(amount)) throw new ApiError(400, "Friend, settlement, and repayment amount are required.");
    if (amount > 999999999) throw new ApiError(400, "Repayment amount is too large.");
    if (clientMutationId && clientMutationId.length > 140) throw new ApiError(400, "Client mutation ID is too long.");

    const db = adminDb();
    const { data: link, error: linkError } = await db
      .from("micham_friend_links")
      .select("id")
      .eq("owner_id", user.id)
      .eq("friend_id", friendUserId)
      .eq("status", "connected")
      .maybeSingle();
    if (linkError) throw linkError;
    if (!link) throw new ApiError(403, "Friend must accept the request before sharing settlements.");

    if (clientMutationId) {
      const { data: existing, error: existingError } = await db
        .from("micham_settlement_events")
        .select("*")
        .eq("requested_by", user.id)
        .eq("client_mutation_id", clientMutationId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        jsonOk(res, { event: existing });
        return;
      }
    }

    const { data: event, error } = await db
      .from("micham_settlement_events")
      .insert({
        owner_id: user.id,
        friend_id: friendUserId,
        settlement_entity_id: settlementEntityId,
        event_type: "repayment_requested",
        amount,
        previous_event_id: previousEventId,
        payload: typeof body.payload === "object" && body.payload ? body.payload : {},
        requested_by: user.id,
        client_mutation_id: clientMutationId || null,
      })
      .select("*")
      .single();
    if (error) throw error;
    jsonOk(res, { event });
  } catch (error) {
    handleError(res, error);
  }
}
