import { handleError, jsonOk, method, type ApiRequest, type ApiResponse } from "../_lib/http";
import { requireUser } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    method(req, "GET");
    const user = await requireUser(req);
    const db = adminDb();
    const [{ data: profile, error: profileError }, { data: entities, error: entityError }] = await Promise.all([
      db.from("micham_profiles").select("id, local_profile_id, email, display_name, currency, connection_code").eq("id", user.id).maybeSingle(),
      db.from("micham_entities").select("entity_type, entity_id, payload, deleted_at").eq("owner_id", user.id),
    ]);
    if (profileError) throw profileError;
    if (entityError) throw entityError;
    jsonOk(res, { profile, entities: entities || [] });
  } catch (error) {
    handleError(res, error);
  }
}
