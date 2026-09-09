import { beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../../_lib/http.js";
import { rateLimit, requireUser } from "../../_lib/security.js";
import { adminDb } from "../../_lib/supabaseAdmin.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "notifications/unsubscribe");
    method(req, "POST");
    const user = await requireUser(req);
    await rateLimit(`notifications:unsubscribe:${user.id}`, 60, 60 * 60);
    const body = bodyObject(req, { maxBytes: 16 * 1024 });
    const endpoint = stringField(body, "endpoint");
    if (!endpoint) {
      jsonOk(res, { ok: true });
      return;
    }
    const db = adminDb();
    const { error } = await db
      .from("micham_push_subscriptions")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("endpoint", endpoint);
    if (error) throw error;
    jsonOk(res, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}
