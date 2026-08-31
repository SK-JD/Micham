import { handleError, jsonOk, method, type ApiRequest, type ApiResponse } from "../_lib/http";
import { requireUser } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    method(req, "GET");
    const user = await requireUser(req);
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
