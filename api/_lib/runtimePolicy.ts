import { ApiError } from "./http";
import { adminDb } from "./supabaseAdmin";

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
