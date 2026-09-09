import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../../_lib/http.js";
import { ensureFeatureEnabled, ensureUserFeature } from "../../_lib/runtimePolicy.js";
import { rateLimit, requireUser } from "../../_lib/security.js";
import { sendPushToUser } from "../../_lib/pushNotifications.js";
import { adminDb } from "../../_lib/supabaseAdmin.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "friends/respond");
    method(req, "POST");
    const user = await requireUser(req);
    await ensureFeatureEnabled("friends", "Friends are temporarily unavailable.");
    await ensureUserFeature(user.id, "FRIENDS", "Your current plan does not include friends.");
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
    const bodyText = action === "accept" ? `${user.display_name} accepted your friend request.` : `${user.display_name} rejected your friend request.`;
    void sendPushToUser(friendUserId, {
      title: action === "accept" ? "Friend request accepted" : "Friend request rejected",
      body: bodyText,
      tag: `friend-${action}`,
      url: "/",
    });
    jsonOk(res, { status });
  } catch (error) {
    handleError(res, error);
  }
}
