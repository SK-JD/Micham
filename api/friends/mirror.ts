import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../_lib/http";
import { ensureFeatureEnabled, ensureUserFeature } from "../_lib/runtimePolicy";
import { rateLimit, requireUser } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";

const allowedMirrorEntityTypes = new Set(["settlements", "repayments"]);

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "friends/mirror");
    method(req, "POST");
    const user = await requireUser(req);
    await ensureFeatureEnabled("friends", "Friends are temporarily unavailable.");
    await ensureUserFeature(user.id, "FRIENDS", "Your current plan does not include friends.");
    await ensureFeatureEnabled("settlements", "Settlements are temporarily unavailable.");
    await ensureUserFeature(user.id, "SETTLEMENTS", "Your current plan does not include settlements.");
    await rateLimit(`friends:mirror:${user.id}`, 240, 60 * 60);
    const body = bodyObject(req, { maxBytes: 256 * 1024 });
    const connectionCode = stringField(body, "connectionCode").toUpperCase();
    const entityType = stringField(body, "entityType");
    const entityId = stringField(body, "entityId");
    const payload = body.payload && typeof body.payload === "object" ? (body.payload as Record<string, unknown>) : undefined;
    if (!connectionCode || !entityType || !entityId || !payload) {
      throw new ApiError(400, "Connection code, entity type, entity ID, and payload are required.");
    }
    if (!allowedMirrorEntityTypes.has(entityType)) {
      throw new ApiError(400, "This entity type cannot be shared with a friend.");
    }
    if (entityId.length > 120) {
      throw new ApiError(400, "Entity ID is too long.");
    }
    if (entityType === "settlements") {
      if (typeof payload.linkedSettlementId !== "string" || typeof payload.friendUserId !== "string") {
        throw new ApiError(400, "Shared settlement payload is invalid.");
      }
      if (payload.friendUserId !== user.id) {
        throw new ApiError(403, "Shared settlement source is invalid.");
      }
      const amount = Number(payload.originalAmount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999) {
        throw new ApiError(400, "Shared settlement amount is invalid.");
      }
    }
    if (entityType === "repayments") {
      if (typeof payload.linkedRepaymentId !== "string" || typeof payload.friendUserId !== "string") {
        throw new ApiError(400, "Shared repayment payload is invalid.");
      }
      if (payload.friendUserId !== user.id) {
        throw new ApiError(403, "Shared repayment source is invalid.");
      }
      const amount = Number(payload.amount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999) {
        throw new ApiError(400, "Shared repayment amount is invalid.");
      }
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
