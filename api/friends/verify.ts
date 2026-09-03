import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../_lib/http";
import { ensureFeatureEnabled, ensureUserFeature } from "../_lib/runtimePolicy";
import { rateLimit, requireUser } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "friends/verify");
    method(req, "POST");
    const user = await requireUser(req);
    await ensureFeatureEnabled("friends", "Friends are temporarily unavailable.");
    await ensureUserFeature(user.id, "FRIENDS", "Your current plan does not include friends.");
    await rateLimit(`friends:verify:${user.id}`, 60, 60 * 60);
    const connectionCode = stringField(bodyObject(req), "connectionCode").toUpperCase();
    if (!connectionCode) throw new ApiError(400, "Connection code is required.");

    const { data: friend, error } = await adminDb()
      .from("micham_app_users")
      .select("id, display_name, currency, connection_code, email_verified, status")
      .eq("connection_code", connectionCode)
      .neq("id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!friend || friend.status !== "active") throw new ApiError(404, "No active user found for this connection code.");

    jsonOk(res, {
      friend: {
        displayName: friend.display_name,
        currency: friend.currency,
        connectionCode: friend.connection_code,
        emailVerified: friend.email_verified,
      },
    });
  } catch (error) {
    handleError(res, error);
  }
}
