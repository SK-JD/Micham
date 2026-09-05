import { beginRequest, handleError, jsonOk, method, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { requireUser } from "../_lib/security.js";
import { adminDb } from "../_lib/supabaseAdmin.js";

type SubscriptionWithPlan = {
  id: string;
  status: string;
  current_period_start: string;
  current_period_end: string | null;
  plan?: { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "account/entitlements");
    method(req, "GET");
    const user = await requireUser(req);
    const db = adminDb();
    const { data: subscription, error: subError } = await db
      .from("micham_user_subscriptions")
      .select("id, status, current_period_start, current_period_end, plan:micham_plans(id, code, name)")
      .eq("user_id", user.id)
      .in("status", ["ACTIVE", "TRIAL"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError) throw subError;

    const typedSubscription = subscription as SubscriptionWithPlan | null;
    const plan = Array.isArray(typedSubscription?.plan) ? typedSubscription?.plan[0] : typedSubscription?.plan;
    const planId = plan?.id;
    const [features, limits, adPolicies] = planId
      ? await Promise.all([
          db.from("micham_plan_features").select("feature_key, enabled, config").eq("plan_id", planId),
          db.from("micham_plan_limits").select("limit_key, limit_value").eq("plan_id", planId),
          db.from("micham_plan_ad_policies").select("placement_key, allowed, config").eq("plan_id", planId),
        ])
      : await Promise.all([
          Promise.resolve({ data: [], error: null }),
          Promise.resolve({ data: [], error: null }),
          Promise.resolve({ data: [], error: null }),
        ]);
    for (const result of [features, limits, adPolicies]) {
      if (result.error) throw result.error;
    }
    jsonOk(res, {
      subscription: typedSubscription,
      features: Object.fromEntries((features.data || []).map((item) => [item.feature_key, { enabled: item.enabled, config: item.config }])),
      limits: Object.fromEntries((limits.data || []).map((item) => [item.limit_key, item.limit_value])),
      adPolicies: Object.fromEntries((adPolicies.data || []).map((item) => [item.placement_key, { allowed: item.allowed, config: item.config }])),
    });
  } catch (error) {
    handleError(res, error);
  }
}
