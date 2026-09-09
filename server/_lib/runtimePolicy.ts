import { ApiError } from "./http.js";
import { adminDb } from "./supabaseAdmin.js";

function isDisabled(value: unknown) {
  return value === false || value === "false";
}

export async function ensureRuntimeEnabled(settingKey: string, flagKey: string, message: string) {
  const db = adminDb();
  const [setting, flag] = await Promise.all([
    db.from("micham_system_settings").select("value").eq("setting_key", settingKey).maybeSingle(),
    db.from("micham_feature_flags").select("enabled").eq("flag_key", flagKey).maybeSingle(),
  ]);
  if (setting.error) throw setting.error;
  if (flag.error) throw flag.error;
  if (isDisabled(setting.data?.value) || flag.data?.enabled === false) {
    throw new ApiError(503, message, "FEATURE_DISABLED", true);
  }
}

export async function ensureFeatureEnabled(flagKey: string, message: string) {
  const { data, error } = await adminDb().from("micham_feature_flags").select("enabled").eq("flag_key", flagKey).maybeSingle();
  if (error) throw error;
  if (data?.enabled === false) throw new ApiError(503, message, "FEATURE_DISABLED", true);
}

async function ensureDefaultSubscription(userId: string) {
  const db = adminDb();
  const { data: existing, error: existingError } = await db
    .from("micham_user_subscriptions")
    .select("id, plan_id")
    .eq("user_id", userId)
    .in("status", ["ACTIVE", "TRIAL"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing.plan_id as string;

  const { data: plan, error: planError } = await db.from("micham_plans").select("id").eq("is_default", true).eq("status", "ACTIVE").maybeSingle();
  if (planError) throw planError;
  if (!plan) return "";
  const { error: insertError } = await db.from("micham_user_subscriptions").insert({
    user_id: userId,
    plan_id: plan.id,
    status: "ACTIVE",
    source: "SYSTEM",
  });
  if (insertError && insertError.code !== "23505") throw insertError;
  return plan.id as string;
}

export async function ensureUserFeature(userId: string, featureKey: string, message: string) {
  const planId = await ensureDefaultSubscription(userId);
  if (!planId) return;
  const { data, error } = await adminDb()
    .from("micham_plan_features")
    .select("enabled")
    .eq("plan_id", planId)
    .eq("feature_key", featureKey)
    .maybeSingle();
  if (error) throw error;
  if (data?.enabled === false) throw new ApiError(403, message, "PLAN_FEATURE_DISABLED", false);
}

export async function getUserPlanLimit(userId: string, limitKey: string) {
  const planId = await ensureDefaultSubscription(userId);
  if (!planId) return null;
  const { data, error } = await adminDb()
    .from("micham_plan_limits")
    .select("limit_value")
    .eq("plan_id", planId)
    .eq("limit_key", limitKey)
    .maybeSingle();
  if (error) throw error;
  return data?.limit_value ?? null;
}
