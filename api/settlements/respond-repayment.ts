import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../_lib/http";
import { ensureFeatureEnabled, ensureUserFeature } from "../_lib/runtimePolicy";
import { rateLimit, requireUser } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "settlements/respond-repayment");
    method(req, "POST");
    const user = await requireUser(req);
    await ensureFeatureEnabled("settlements", "Settlements are temporarily unavailable.");
    await ensureUserFeature(user.id, "SETTLEMENTS", "Your current plan does not include settlements.");
    await rateLimit(`settlements:action:${user.id}`, 120, 60 * 60);
    const body = bodyObject(req);
    const eventId = stringField(body, "eventId");
    const action = stringField(body, "action");
    if (!eventId || !["accept", "reject"].includes(action)) throw new ApiError(400, "Event ID and valid action are required.");

    const db = adminDb();
    const { data: event, error: eventError } = await db
      .from("micham_settlement_events")
      .select("id, owner_id, friend_id, requested_by, status")
      .eq("id", eventId)
      .maybeSingle();
    if (eventError) throw eventError;
    if (!event || event.status !== "pending") throw new ApiError(404, "Pending settlement request was not found.");
    if (event.requested_by === user.id) throw new ApiError(403, "Wait for your friend to acknowledge this settlement.");
    if (![event.owner_id, event.friend_id].includes(user.id)) throw new ApiError(403, "You cannot respond to this settlement.");

    const { data: updated, error } = await db
      .from("micham_settlement_events")
      .update({
        status: action === "accept" ? "accepted" : "rejected",
        event_type: action === "accept" ? "repayment_confirmed" : "repayment_rejected",
        acknowledged_by: user.id,
        acknowledged_at: new Date().toISOString(),
      })
      .eq("id", eventId)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!updated) throw new ApiError(409, "This settlement request was already handled.");
    jsonOk(res, { event: updated });
  } catch (error) {
    handleError(res, error);
  }
}
