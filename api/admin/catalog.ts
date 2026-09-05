import { beginRequest, handleError, jsonOk, method, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { requireAdmin } from "../_lib/adminSecurity.js";
import { adminDb } from "../_lib/supabaseAdmin.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "admin/catalog");
    method(req, "GET");
    await requireAdmin(req, "dashboard.view");
    const db = adminDb();
    const [
      plans,
      features,
      planFeatures,
      planLimits,
      flags,
      settings,
      placements,
      adConfigs,
      adPolicies,
      announcements,
    ] = await Promise.all([
      db.from("micham_plans").select("*").order("sort_order", { ascending: true }),
      db.from("micham_features").select("*").order("feature_key", { ascending: true }),
      db.from("micham_plan_features").select("*"),
      db.from("micham_plan_limits").select("*"),
      db.from("micham_feature_flags").select("*").order("flag_key", { ascending: true }),
      db.from("micham_system_settings").select("*").order("setting_key", { ascending: true }),
      db.from("micham_ad_placements").select("*").order("placement_key", { ascending: true }),
      db.from("micham_ad_configs").select("*").order("created_at", { ascending: false }),
      db.from("micham_plan_ad_policies").select("*"),
      db.from("micham_announcements").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    for (const result of [plans, features, planFeatures, planLimits, flags, settings, placements, adConfigs, adPolicies, announcements]) {
      if (result.error) throw result.error;
    }
    jsonOk(res, {
      plans: plans.data || [],
      features: features.data || [],
      planFeatures: planFeatures.data || [],
      planLimits: planLimits.data || [],
      flags: flags.data || [],
      settings: settings.data || [],
      adPlacements: placements.data || [],
      adConfigs: adConfigs.data || [],
      adPolicies: adPolicies.data || [],
      announcements: announcements.data || [],
    });
  } catch (error) {
    handleError(res, error);
  }
}
