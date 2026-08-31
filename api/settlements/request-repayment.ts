import { ApiError, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../_lib/http";
import { requireUser } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    method(req, "POST");
    const user = await requireUser(req);
    const body = bodyObject(req);
    const friendUserId = stringField(body, "friendUserId");
    const settlementEntityId = stringField(body, "settlementEntityId");
    const previousEventId = stringField(body, "previousEventId") || null;
    const amount = Number(body.amount) || 0;
    if (!friendUserId || !settlementEntityId || amount <= 0) throw new ApiError(400, "Friend, settlement, and repayment amount are required.");

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
      })
      .select("*")
      .single();
    if (error) throw error;
    jsonOk(res, { event });
  } catch (error) {
    handleError(res, error);
  }
}
