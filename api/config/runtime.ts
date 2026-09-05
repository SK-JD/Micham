import { beginRequest, handleError, jsonOk, method, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { adminDb } from "../_lib/supabaseAdmin.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "config/runtime");
    method(req, "GET");
    const db = adminDb();
    const now = new Date().toISOString();
    const [settings, flags, announcements, adPlacements] = await Promise.all([
      db.from("micham_system_settings").select("setting_key, value").eq("is_public", true),
      db.from("micham_feature_flags").select("flag_key, enabled, rollout"),
      db
        .from("micham_announcements")
        .select("id, title, body, target, target_value, starts_at, ends_at")
        .eq("status", "ACTIVE")
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gte.${now}`)
        .order("created_at", { ascending: false })
        .limit(20),
      db.from("micham_ad_placements").select("placement_key, name, enabled"),
    ]);
    for (const result of [settings, flags, announcements, adPlacements]) {
      if (result.error) throw result.error;
    }
    jsonOk(res, {
      settings: Object.fromEntries((settings.data || []).map((item) => [item.setting_key, item.value])),
      flags: Object.fromEntries((flags.data || []).map((item) => [item.flag_key, { enabled: item.enabled, rollout: item.rollout }])),
      announcements: announcements.data || [],
      adPlacements: adPlacements.data || [],
    });
  } catch (error) {
    handleError(res, error);
  }
}
