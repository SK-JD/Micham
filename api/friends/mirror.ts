import { ApiError, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../_lib/http";
import { requireUser } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    method(req, "POST");
    const user = await requireUser(req);
    const body = bodyObject(req);
    const connectionCode = stringField(body, "connectionCode").toUpperCase();
    const entityType = stringField(body, "entityType");
    const entityId = stringField(body, "entityId");
    const payload = body.payload && typeof body.payload === "object" ? (body.payload as Record<string, unknown>) : undefined;
    if (!connectionCode || !entityType || !entityId || !payload) {
      throw new ApiError(400, "Connection code, entity type, entity ID, and payload are required.");
    }

    const db = adminDb();
    const { data: friend, error: friendError } = await db
      .from("micham_app_users")
      .select("id")
      .eq("connection_code", connectionCode)
      .neq("id", user.id)
      .maybeSingle();
    if (friendError) throw friendError;
    if (!friend) throw new ApiError(404, "Friend connection code was not found.");

    const { data: link, error: linkError } = await db
      .from("micham_friend_links")
      .select("id")
      .eq("owner_id", user.id)
      .eq("friend_id", friend.id)
      .eq("status", "connected")
      .maybeSingle();
    if (linkError) throw linkError;
    if (!link) throw new ApiError(403, "Friend is not connected.");

    const { error } = await db.from("micham_entities").upsert(
      {
        owner_id: friend.id,
        entity_type: entityType,
        entity_id: entityId,
        payload,
        deleted_at: payload.deletedAt || null,
      },
      { onConflict: "owner_id,entity_type,entity_id" },
    );
    if (error) throw error;
    jsonOk(res, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}
