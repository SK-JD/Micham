import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../_lib/http";
import { ensureFeatureEnabled, ensureUserFeature, getUserPlanLimit } from "../_lib/runtimePolicy";
import { rateLimit, requireUser } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "friends/request");
    method(req, "POST");
    const user = await requireUser(req);
    await ensureFeatureEnabled("friends", "Friends are temporarily unavailable.");
    await ensureUserFeature(user.id, "FRIENDS", "Your current plan does not include friends.");
    await rateLimit(`friends:request:${user.id}`, 30, 60 * 60);
    const body = bodyObject(req);
    const connectionCode = stringField(body, "connectionCode").toUpperCase();
    const ownerPersonId = stringField(body, "ownerPersonId");
    if (!connectionCode) throw new ApiError(400, "Connection code is required.");

    const db = adminDb();
    const { data: friend, error: friendError } = await db
      .from("micham_app_users")
      .select("id, display_name, connection_code, status")
      .eq("connection_code", connectionCode)
      .neq("id", user.id)
      .maybeSingle();
    if (friendError) throw friendError;
    if (!friend || friend.status !== "active") throw new ApiError(404, "Friend connection code was not found.");

    const { data: blocked, error: blockError } = await db
      .from("micham_friend_links")
      .select("id")
      .or(`and(owner_id.eq.${user.id},friend_id.eq.${friend.id}),and(owner_id.eq.${friend.id},friend_id.eq.${user.id})`)
      .eq("status", "blocked")
      .maybeSingle();
    if (blockError) throw blockError;
    if (blocked) throw new ApiError(403, "This friend connection is blocked.");

    const friendLimit = await getUserPlanLimit(user.id, "friends_count");
    if (typeof friendLimit === "number") {
      const { count, error: countError } = await db
        .from("micham_friend_links")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id)
        .eq("status", "connected");
      if (countError) throw countError;
      if ((count || 0) >= friendLimit) throw new ApiError(403, "Your current plan has reached the friends limit.", "PLAN_LIMIT_REACHED", false);
    }

    const timestamp = new Date().toISOString();
    const { error } = await db.from("micham_friend_links").upsert(
      [
        {
          owner_id: user.id,
          friend_id: friend.id,
          owner_person_id: ownerPersonId || null,
          status: "pending",
          requested_by: user.id,
          requested_at: timestamp,
          responded_at: null,
          blocked_by: null,
        },
        {
          owner_id: friend.id,
          friend_id: user.id,
          status: "pending",
          requested_by: user.id,
          requested_at: timestamp,
          responded_at: null,
          blocked_by: null,
        },
      ],
      { onConflict: "owner_id,friend_id" },
    );
    if (error) throw error;
    jsonOk(res, { friend, status: "pending" });
  } catch (error) {
    handleError(res, error);
  }
}
