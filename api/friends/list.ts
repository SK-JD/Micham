import { beginRequest, handleError, jsonOk, method, type ApiRequest, type ApiResponse } from "../_lib/http";
import { ensureFeatureEnabled, ensureUserFeature } from "../_lib/runtimePolicy";
import { rateLimit, requireUser } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "friends/list");
    method(req, "GET");
    const user = await requireUser(req);
    await ensureFeatureEnabled("friends", "Friends are temporarily unavailable.");
    await ensureUserFeature(user.id, "FRIENDS", "Your current plan does not include friends.");
    await rateLimit(`friends:list:${user.id}`, 300, 60 * 60);
    const { data, error } = await adminDb()
      .from("micham_friend_links")
      .select("friend_id, owner_person_id, friend_person_id, status, requested_by, requested_at, responded_at, blocked_by, friend:micham_app_users!micham_friend_links_friend_app_user_fkey(id, display_name, currency, connection_code, email_verified)")
      .eq("owner_id", user.id)
      .order("requested_at", { ascending: false });
    if (error) throw error;
    jsonOk(res, { friends: data || [] });
  } catch (error) {
    handleError(res, error);
  }
}
