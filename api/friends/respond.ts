import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../_lib/http";
import { rateLimit, requireUser } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "friends/respond");
    method(req, "POST");
    const user = await requireUser(req);
    await rateLimit(`friends:action:${user.id}`, 120, 60 * 60);
    const body = bodyObject(req);
    const friendUserId = stringField(body, "friendUserId");
    const action = stringField(body, "action");
    if (!friendUserId || !["accept", "reject"].includes(action)) throw new ApiError(400, "Friend user ID and valid action are required.");

    const db = adminDb();
    const { data: link, error: linkError } = await db
      .from("micham_friend_links")
      .select("requested_by, status")
      .eq("owner_id", user.id)
      .eq("friend_id", friendUserId)
      .maybeSingle();
    if (linkError) throw linkError;
    if (!link || link.status !== "pending") throw new ApiError(404, "Pending friend request was not found.");
    if (link.requested_by === user.id) throw new ApiError(403, "Wait for your friend to respond.");

    const status = action === "accept" ? "connected" : "removed";
    const { error } = await db
      .from("micham_friend_links")
      .update({ status, responded_at: new Date().toISOString(), blocked_by: null })
      .or(`and(owner_id.eq.${user.id},friend_id.eq.${friendUserId}),and(owner_id.eq.${friendUserId},friend_id.eq.${user.id})`);
    if (error) throw error;
    jsonOk(res, { status });
  } catch (error) {
    handleError(res, error);
  }
}
