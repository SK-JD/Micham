import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { db } from "./db";
import { createId, defaultConfig, nowIso } from "./defaults";
import type {
  Account,
  AppConfig,
  Budget,
  Category,
  Person,
  Profile,
  RecurringTransaction,
  Repayment,
  Settlement,
  Transaction,
} from "./types";

type EntityType =
  | "accounts"
  | "categories"
  | "transactions"
  | "budgets"
  | "recurringTransactions"
  | "people"
  | "settlements"
  | "repayments";

type CloudSnapshot = {
  profile?: Profile;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  recurring: RecurringTransaction[];
  people: Person[];
  settlements: Settlement[];
  repayments: Repayment[];
};

type CloudProfileRow = {
  id: string;
  local_profile_id?: string | null;
  email: string;
  display_name: string;
  currency: string;
  connection_code: string;
};

type CloudEntityRow = {
  entity_type: EntityType;
  entity_id: string;
  payload: Record<string, unknown>;
  deleted_at?: string | null;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const bundledSupabaseKey = supabasePublishableKey || supabaseAnonKey;
const CLOUD_SETTINGS_KEY = "micham_supabase_settings";

let supabaseClient: SupabaseClient | undefined;
let supabaseClientKey = "";

type CloudSettings = {
  url: string;
  anonKey: string;
};

function readStoredCloudSettings(): CloudSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(CLOUD_SETTINGS_KEY) || "{}") as Partial<CloudSettings>;
    return {
      url: parsed.url?.trim() || supabaseUrl?.trim() || "",
      anonKey: parsed.anonKey?.trim() || bundledSupabaseKey?.trim() || "",
    };
  } catch {
    return {
      url: supabaseUrl?.trim() || "",
      anonKey: bundledSupabaseKey?.trim() || "",
    };
  }
}

export function getCloudSettings() {
  return readStoredCloudSettings();
}

export function saveCloudSettings(settings: CloudSettings) {
  localStorage.setItem(CLOUD_SETTINGS_KEY, JSON.stringify({ url: settings.url.trim(), anonKey: settings.anonKey.trim() }));
  supabaseClient = undefined;
  supabaseClientKey = "";
}

export function isCloudConfigured() {
  const settings = readStoredCloudSettings();
  return Boolean(settings.url && settings.anonKey);
}

export function getSupabaseClient() {
  const settings = readStoredCloudSettings();
  if (!settings.url || !settings.anonKey) return undefined;
  const nextClientKey = `${settings.url}|${settings.anonKey}`;
  if (supabaseClient && supabaseClientKey === nextClientKey) return supabaseClient;
  supabaseClientKey = nextClientKey;
  supabaseClient = createClient(settings.url, settings.anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
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

function requireClient() {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.");
  return client;
}

async function currentUserId(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user?.id) throw new Error("Cloud session is missing. Login again.");
  return data.user.id;
}

function entityItems(snapshot: CloudSnapshot): Array<{ type: EntityType; items: Array<Account | Category | Transaction | Budget | RecurringTransaction | Person | Settlement | Repayment> }> {
  return [
    { type: "accounts", items: snapshot.accounts },
    { type: "categories", items: snapshot.categories },
    { type: "transactions", items: snapshot.transactions },
    { type: "budgets", items: snapshot.budgets },
    { type: "recurringTransactions", items: snapshot.recurring },
    { type: "people", items: snapshot.people },
    { type: "settlements", items: snapshot.settlements },
    { type: "repayments", items: snapshot.repayments },
  ];
}

async function putEntity(type: EntityType, payloads: Record<string, unknown>[]) {
  switch (type) {
    case "accounts":
      await db.accounts.bulkPut(payloads as unknown as Account[]);
      break;
    case "categories":
      await db.categories.bulkPut(payloads as unknown as Category[]);
      break;
    case "transactions":
      await db.transactions.bulkPut(payloads as unknown as Transaction[]);
      break;
    case "budgets":
      await db.budgets.bulkPut(payloads as unknown as Budget[]);
      break;
    case "recurringTransactions":
      await db.recurringTransactions.bulkPut(payloads as unknown as RecurringTransaction[]);
      break;
    case "people":
      await db.people.bulkPut(payloads as unknown as Person[]);
      break;
    case "settlements":
      await db.settlements.bulkPut(payloads as unknown as Settlement[]);
      break;
    case "repayments":
      await db.repayments.bulkPut(payloads as unknown as Repayment[]);
      break;
  }
}

export async function ensureCloudProfile(profile: Profile) {
  const client = requireClient();
  const userId = await currentUserId(client);
  const email = profile.loginId === "local-device" ? `${userId}@local.micham` : profile.loginId;
  const { error } = await client.from("micham_profiles").upsert(
    {
      id: userId,
      local_profile_id: profile.id,
      email,
      display_name: profile.displayName,
      currency: profile.currency,
      connection_code: profile.connectionCode || createConnectionCode(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
  return userId;
}

export async function pushCloudSnapshot(snapshot: CloudSnapshot) {
  if (!snapshot.profile) throw new Error("Local profile is missing.");
  const client = requireClient();
  const userId = await ensureCloudProfile(snapshot.profile);

  for (const group of entityItems(snapshot)) {
    const rows = group.items.map((item) => ({
      owner_id: userId,
      entity_type: group.type,
      entity_id: item.id,
      payload: { ...item, syncState: "synced" },
      deleted_at: item.deletedAt ?? null,
    }));
    if (rows.length === 0) continue;
    const { error } = await client.from("micham_entities").upsert(rows, { onConflict: "owner_id,entity_type,entity_id" });
    if (error) throw error;
  }
}

export async function pullCloudEntities(localProfileId: string) {
  const client = requireClient();
  const userId = await currentUserId(client);
  const { data, error } = await client
    .from("micham_entities")
    .select("entity_type, entity_id, payload, deleted_at")
    .eq("owner_id", userId);
  if (error) throw error;

  const grouped = new Map<EntityType, Record<string, unknown>[]>();
  for (const row of (data ?? []) as CloudEntityRow[]) {
    const payload = {
      ...row.payload,
      ownerProfileId: localProfileId,
      deletedAt: row.deleted_at ?? (row.payload.deletedAt as string | undefined),
      syncState: "synced",
    };
    grouped.set(row.entity_type, [...(grouped.get(row.entity_type) ?? []), payload]);
  }

  await db.transaction(
    "rw",
    [db.accounts, db.categories, db.transactions, db.budgets, db.recurringTransactions, db.people, db.settlements, db.repayments],
    async () => {
      for (const [type, payloads] of grouped) await putEntity(type, payloads);
    },
  );
}

export async function syncCloudSnapshot(snapshot: CloudSnapshot) {
  if (!isCloudConfigured() || !snapshot.profile) return;
  await pushCloudSnapshot(snapshot);
  await pullCloudEntities(snapshot.profile.id);
  await db.transaction(
    "rw",
    [db.profiles, db.accounts, db.categories, db.transactions, db.budgets, db.recurringTransactions, db.people, db.settlements, db.repayments],
    async () => {
      await db.profiles.update(snapshot.profile!.id, { syncState: "synced", updatedAt: nowIso() });
      await db.accounts.bulkPut(snapshot.accounts.map((item) => ({ ...item, syncState: "synced" as const })));
      await db.categories.bulkPut(snapshot.categories.map((item) => ({ ...item, syncState: "synced" as const })));
      await db.transactions.bulkPut(snapshot.transactions.map((item) => ({ ...item, syncState: "synced" as const })));
      await db.budgets.bulkPut(snapshot.budgets.map((item) => ({ ...item, syncState: "synced" as const })));
      await db.recurringTransactions.bulkPut(snapshot.recurring.map((item) => ({ ...item, syncState: "synced" as const })));
      await db.people.bulkPut(snapshot.people.map((item) => ({ ...item, syncState: "synced" as const })));
      await db.settlements.bulkPut(snapshot.settlements.map((item) => ({ ...item, syncState: "synced" as const })));
      await db.repayments.bulkPut(snapshot.repayments.map((item) => ({ ...item, syncState: "synced" as const })));
    },
  );
}

export async function signUpCloudProfile(email: string, password: string, profile: Profile, snapshot: CloudSnapshot) {
  const client = requireClient();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error("Check your email to confirm the account, then login to sync this device.");
  if (!data.user?.id) throw new Error("Cloud account was not created.");
  await ensureCloudProfile({ ...profile, loginId: email, syncState: "queued" });
  await syncCloudSnapshot({ ...snapshot, profile: { ...profile, loginId: email, syncState: "queued" } });
  return data.user.id;
}

export async function signInCloudProfile(email: string, password: string, config: AppConfig) {
  const client = requireClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.user?.id) throw new Error("Cloud login failed.");

  const { data: cloudProfile, error: profileError } = await client
    .from("micham_profiles")
    .select("id, local_profile_id, email, display_name, currency, connection_code")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  const existing = await db.profiles.where("loginId").equals(email).first();
  const timestamp = nowIso();
  const profileId = existing?.id ?? cloudProfile?.local_profile_id ?? createId();
  const localProfile: Profile = {
    id: profileId,
    loginId: email,
    passwordHash: "",
    connectionCode: cloudProfile?.connection_code ?? createConnectionCode(),
    displayName: cloudProfile?.display_name ?? email.split("@")[0],
    currency: cloudProfile?.currency ?? config.defaultCurrency,
    connectedUserId: data.user.id,
    setupComplete: true,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    syncState: "synced",
  };
  await db.profiles.put(localProfile);
  await ensureCloudProfile(localProfile);
  await pullCloudEntities(profileId);
  return profileId;
}

export async function sendCloudPasswordReset(email: string) {
  const client = requireClient();
  const { error } = await client.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

export async function pullCloudAppConfig() {
  const client = getSupabaseClient();
  if (!client) return;
  const { data, error } = await client
    .from("micham_app_config")
    .select("payload")
    .eq("id", "primary")
    .maybeSingle();
  if (error) throw error;
  if (!data?.payload) return;
  await db.appConfig.put({
    ...defaultConfig,
    ...(data.payload as Partial<AppConfig>),
    id: "primary",
    updatedAt: nowIso(),
  });
}

export async function testCloudConnection() {
  const client = requireClient();
  const { error } = await client.from("micham_app_config").select("id").limit(1);
  if (error) throw error;

  const channel = client.channel("micham-connection-test");
  const status = await new Promise<string>((resolve) => {
    const timeout = window.setTimeout(() => resolve("TIMED_OUT"), 8000);
    channel.subscribe((state) => {
      if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(state)) {
        window.clearTimeout(timeout);
        resolve(state);
      }
    });
  });
  void client.removeChannel(channel);
  if (status !== "SUBSCRIBED") throw new Error(`Realtime test failed: ${status}`);
}

export async function connectCloudFriend(friendConnectionCode: string, ownerPersonId: string) {
  const client = requireClient();
  const { data, error } = await client.rpc("micham_connect_friend", {
    friend_connection_code: friendConnectionCode,
    owner_person_id: ownerPersonId,
  });
  if (error) throw error;
  return data as CloudProfileRow;
}

export async function mirrorCloudEntityToFriend(friendConnectionCode: string, entityType: EntityType, entityId: string, payload: Record<string, unknown>) {
  const client = requireClient();
  const { error } = await client.rpc("micham_mirror_friend_entity", {
    friend_connection_code: friendConnectionCode,
    mirrored_entity_type: entityType,
    mirrored_entity_id: entityId,
    mirrored_payload: payload,
  });
  if (error) throw error;
}

export function subscribeToCloudChanges(onChange: () => void) {
  const client = getSupabaseClient();
  if (!client) return () => undefined;

  const channel = client
    .channel("micham-cloud-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "micham_entities" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "micham_friend_links" }, onChange)
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
