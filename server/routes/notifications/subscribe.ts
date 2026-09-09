import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, type ApiRequest, type ApiResponse } from "../../_lib/http.js";
import { rateLimit, requireUser } from "../../_lib/security.js";
import { adminDb } from "../../_lib/supabaseAdmin.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "notifications/subscribe");
    method(req, "POST");
    const user = await requireUser(req);
    await rateLimit(`notifications:subscribe:${user.id}`, 30, 60 * 60);
    const body = bodyObject(req, { maxBytes: 64 * 1024 });
    const subscription = body.subscription;
    if (!subscription || typeof subscription !== "object" || Array.isArray(subscription)) {
      throw new ApiError(400, "Push subscription is required.");
    }
    const endpoint = typeof (subscription as { endpoint?: unknown }).endpoint === "string"
      ? (subscription as { endpoint: string }).endpoint
      : "";
    if (!endpoint) throw new ApiError(400, "Push endpoint is required.");

    const db = adminDb();
    const rawAgent = req.headers["user-agent"];
    const userAgent = Array.isArray(rawAgent) ? rawAgent[0] : rawAgent;
    const { error } = await db.from("micham_push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint,
        subscription,
        user_agent: userAgent || null,
        active: true,
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
    if (error) throw error;
    jsonOk(res, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}
