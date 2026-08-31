import { handleError, jsonOk, method, type ApiRequest, type ApiResponse } from "../_lib/http";
import { requireUser } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    method(req, "GET");
    const user = await requireUser(req);
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
