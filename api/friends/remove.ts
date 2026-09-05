import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { ensureFeatureEnabled, ensureUserFeature } from "../_lib/runtimePolicy.js";
import { rateLimit, requireUser } from "../_lib/security.js";
import { adminDb } from "../_lib/supabaseAdmin.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "friends/remove");
    method(req, "POST");
    const user = await requireUser(req);
    await ensureFeatureEnabled("friends", "Friends are temporarily unavailable.");
    await ensureUserFeature(user.id, "FRIENDS", "Your current plan does not include friends.");
    await rateLimit(`friends:action:${user.id}`, 120, 60 * 60);
    const friendUserId = stringField(bodyObject(req), "friendUserId");
    if (!friendUserId) throw new ApiError(400, "Friend user ID is required.");

    const { error } = await adminDb()
      .from("micham_friend_links")
      .update({ status: "removed", responded_at: new Date().toISOString(), blocked_by: null })
      .or(`and(owner_id.eq.${user.id},friend_id.eq.${friendUserId}),and(owner_id.eq.${friendUserId},friend_id.eq.${user.id})`);
    if (error) throw error;
    jsonOk(res, { status: "removed" });
  } catch (error) {
    handleError(res, error);
  }
}
