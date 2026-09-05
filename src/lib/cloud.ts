import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { db } from "./db";
import { defaultConfig, nowIso } from "./defaults";
import type { AppConfig } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const bundledSupabaseKey = supabasePublishableKey || supabaseAnonKey;

let supabaseClient: SupabaseClient | undefined;

export function getSupabaseClient() {
  if (!supabaseUrl?.trim() || !bundledSupabaseKey?.trim()) return undefined;
  if (supabaseClient) return supabaseClient;
  supabaseClient = createClient(supabaseUrl.trim(), bundledSupabaseKey.trim(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 8,
      },
    },
  });
  return supabaseClient;
}

export function createConnectionCode() {
  const part = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MCH-${part()}-${part()}`;
}

export async function pullCloudAppConfig() {
  const client = getSupabaseClient();
  if (!client) return;
  const { data, error } = await client.from("micham_app_config").select("payload").eq("id", "primary").maybeSingle();
  if (error) throw error;
  if (!data?.payload) return;
  const localConfig = await db.appConfig.get("primary");
  await db.appConfig.put({
    ...defaultConfig,
    ...(data.payload as Partial<AppConfig>),
    themeMode: localConfig?.themeMode ?? defaultConfig.themeMode,
    syncEnabled: localConfig?.syncEnabled ?? defaultConfig.syncEnabled,
    aiEnabled: localConfig?.aiEnabled ?? defaultConfig.aiEnabled,
    groqApiKey: localConfig?.groqApiKey ?? defaultConfig.groqApiKey,
    aiModel: localConfig?.aiModel ?? defaultConfig.aiModel,
    id: "primary",
    updatedAt: nowIso(),
  });
}
