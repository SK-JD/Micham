import { beginRequest, handleError, jsonOk, method, type ApiRequest, type ApiResponse } from "../_lib/http";
import { ensureRuntimeEnabled } from "../_lib/runtimePolicy";
import { rateLimit, requireUser } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "sync/pull");
    method(req, "GET");
    const user = await requireUser(req);
    await ensureRuntimeEnabled("sync_enabled", "cloud_sync", "Cloud sync is temporarily unavailable.");
    await rateLimit(`sync:pull:${user.id}`, 300, 60 * 60);
    const db = adminDb();
    const cursor = String(Array.isArray(req.query?.cursor) ? req.query?.cursor[0] : req.query?.cursor || "").trim();
    const limit = Math.min(500, Math.max(1, Number(Array.isArray(req.query?.limit) ? req.query?.limit[0] : req.query?.limit || 500) || 500));
    let entityQuery = db
      .from("micham_entities")
      .select("entity_type, entity_id, payload, deleted_at, updated_at")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: true })
      .limit(limit);
    if (cursor) entityQuery = entityQuery.gt("updated_at", cursor);
    const [{ data: profile, error: profileError }, { data: entities, error: entityError }] = await Promise.all([
      db.from("micham_profiles").select("id, local_profile_id, email, display_name, currency, connection_code").eq("id", user.id).maybeSingle(),
      entityQuery,
    ]);
    if (profileError) throw profileError;
    if (entityError) throw entityError;
    const rows = entities || [];
    const nextCursor = rows.reduce((latest, row) => {
      const value = typeof row.updated_at === "string" ? row.updated_at : "";
      return value > latest ? value : latest;
    }, cursor || "");
    jsonOk(res, { profile, entities: rows, cursor: nextCursor, hasMore: rows.length === limit });
  } catch (error) {
    handleError(res, error);
  }
}
