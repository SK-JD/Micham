import { ApiError, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../_lib/http";
import { requireUser } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    method(req, "POST");
    const user = await requireUser(req);
    const body = bodyObject(req);
    const connectionCode = stringField(body, "connectionCode").toUpperCase();
    const ownerPersonId = stringField(body, "ownerPersonId");
    if (!connectionCode) throw new ApiError(400, "Friend connection code is required.");

    const db = adminDb();
    const { data: friend, error: friendError } = await db
      .from("micham_app_users")
      .select("id, email, display_name, currency, connection_code")
      .eq("connection_code", connectionCode)
      .neq("id", user.id)
      .maybeSingle();
    if (friendError) throw friendError;
    if (!friend) throw new ApiError(404, "Friend connection code was not found.");

    const { error } = await db.from("micham_friend_links").upsert(
      [
        { owner_id: user.id, friend_id: friend.id, owner_person_id: ownerPersonId || null, status: "connected" },
        { owner_id: friend.id, friend_id: user.id, status: "connected" },
      ],
      { onConflict: "owner_id,friend_id" },
    );
    if (error) throw error;
    jsonOk(res, { friend });
  } catch (error) {
    handleError(res, error);
  }
}
