import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../_lib/http";
import { rateLimit, requireUser } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "friends/block");
    method(req, "POST");
    const user = await requireUser(req);
    await rateLimit(`friends:action:${user.id}`, 120, 60 * 60);
    const friendUserId = stringField(bodyObject(req), "friendUserId");
    if (!friendUserId) throw new ApiError(400, "Friend user ID is required.");
    const { error } = await adminDb()
      .from("micham_friend_links")
      .update({ status: "blocked", blocked_by: user.id, responded_at: new Date().toISOString() })
      .or(`and(owner_id.eq.${user.id},friend_id.eq.${friendUserId}),and(owner_id.eq.${friendUserId},friend_id.eq.${user.id})`);
    if (error) throw error;
    jsonOk(res, { status: "blocked" });
  } catch (error) {
    handleError(res, error);
  }
}
