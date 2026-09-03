import { beginRequest, handleError, jsonOk, method, type ApiRequest, type ApiResponse } from "../_lib/http";
import { rateLimit, requireUser } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "settlements/list");
    method(req, "GET");
    const user = await requireUser(req);
    await rateLimit(`settlements:list:${user.id}`, 300, 60 * 60);
    const { data, error } = await adminDb()
      .from("micham_settlement_events")
      .select("*")
      .or(`owner_id.eq.${user.id},friend_id.eq.${user.id}`)
      .order("created_at", { ascending: false });
    if (error) throw error;
    jsonOk(res, { events: data || [] });
  } catch (error) {
    handleError(res, error);
  }
}
