import { db } from "./db";
import { createId, nowIso } from "./defaults";
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

export type ServerUser = {
  id: string;
  email: string;
  displayName: string;
  currency: string;
  connectionCode: string;
  emailVerified: boolean;
};

type ApiOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  token?: string;
};

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

type CloudEntityRow = {
  entity_type: EntityType;
  entity_id: string;
  payload: Record<string, unknown>;
  deleted_at?: string | null;
  updated_at?: string | null;
};

type SyncMutation = {
  clientMutationId: string;
  entityType: EntityType;
  entityId: string;
  action: "upsert" | "delete";
  payload: Record<string, unknown>;
};

export type ServerSettlementEvent = {
  id: string;
  owner_id: string;
  friend_id: string;
  settlement_entity_id: string;
  event_type: "owe_created" | "repayment_requested" | "repayment_confirmed" | "repayment_rejected" | "settlement_closed";
  amount: number | string;
  previous_event_id?: string | null;
  payload: Record<string, unknown>;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  requested_by?: string | null;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
  created_at: string;
};

const TOKEN_KEY = "micham_server_token";
const ADMIN_TOKEN_KEY = "micham_admin_token";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export class ApiClientError extends Error {
  status: number;
  code: string;
  requestId?: string;
  retryable: boolean;

  constructor(status: number, message: string, code = "REQUEST_FAILED", requestId?: string, retryable = status === 0 || status === 429 || status >= 500) {
    super(message);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryable = retryable;
  }
}

export function getServerToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setServerToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearServerToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY) || "";
}

export function setAdminToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function isServerSessionReady() {
  return Boolean(getServerToken());
}

async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const token = options.token ?? getServerToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    throw new ApiClientError(
      0,
      offline ? "You are offline. The app will keep local changes and sync later." : "Server is unavailable. Try again shortly.",
      offline ? "NETWORK_OFFLINE" : "NETWORK_ERROR",
      undefined,
      true,
    );
  }

  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    payload = { error: text || `HTTP ${response.status}` };
  }
  if (!response.ok) {
    const fallback =
      response.status === 404
        ? "Server API route was not found. Restart with `npm run dev`, not `npm run dev:ui`."
        : "Server request failed.";
    throw new ApiClientError(
      response.status,
      typeof payload.error === "string" ? payload.error : fallback,
      typeof payload.code === "string" ? payload.code : "REQUEST_FAILED",
      typeof payload.requestId === "string" ? payload.requestId : undefined,
      typeof payload.retryable === "boolean" ? payload.retryable : response.status === 429 || response.status >= 500,
    );
  }
  return payload as T;
}

export async function registerServerAccount(email: string, password: string, displayName: string, currency: string) {
  return apiFetch<{ user: ServerUser; emailDelivery?: { delivered: boolean; reason?: string } }>("/api/auth/register", {
    body: { email, password, displayName, currency },
  });
}

export async function loginServerAccount(email: string, password: string) {
  const result = await apiFetch<{ token: string; expiresAt: string; user: ServerUser }>("/api/auth/login", {
    body: { email, password },
  });
  setServerToken(result.token);
  return result;
}

export type AdminPermission =
  | "dashboard.view"
  | "admin.manage"
  | "users.view"
  | "users.manage"
  | "plans.manage"
  | "features.manage"
  | "settings.manage"
  | "ads.manage"
  | "announcements.manage"
  | "audit.view";

export type AdminAccount = {
  id: string;
  email: string;
  login_id?: string | null;
  display_name: string;
  role: "SUPER_ADMIN" | "ADMIN" | "SUPPORT" | "VIEWER";
  status: "ACTIVE" | "SUSPENDED";
  permissions?: AdminPermission[];
};

export type AdminDashboard = {
  stats: Record<string, number>;
  recentAudit: Array<{ id: string; action: string; target_type?: string | null; target_id?: string | null; created_at: string; metadata?: Record<string, unknown> }>;
};

export type AdminUserRow = {
  id: string;
  email: string;
  display_name: string;
  currency: string;
  connection_code: string;
  email_verified: boolean;
  status: string;
  created_at: string;
  updated_at: string;
};

export type AdminCatalog = {
  plans: Array<Record<string, unknown>>;
  features: Array<Record<string, unknown>>;
  planFeatures: Array<Record<string, unknown>>;
  planLimits: Array<Record<string, unknown>>;
  flags: Array<Record<string, unknown>>;
  settings: Array<Record<string, unknown>>;
  adPlacements: Array<Record<string, unknown>>;
  adConfigs: Array<Record<string, unknown>>;
  adPolicies: Array<Record<string, unknown>>;
  announcements: Array<Record<string, unknown>>;
};

export type RuntimeConfig = {
  settings: Record<string, unknown>;
  flags: Record<string, { enabled: boolean; rollout?: Record<string, unknown> }>;
  announcements: Array<{
    id: string;
    title: string;
    body: string;
    target: "ALL" | "PLAN" | "USER";
    target_value?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
  }>;
  adPlacements: Array<{ placement_key: string; name: string; enabled: boolean }>;
};

async function adminFetch<T>(path: string, options: ApiOptions = {}) {
  return apiFetch<T>(path, { ...options, token: options.token ?? getAdminToken() });
}

export async function bootstrapAdmin(setupToken: string, email: string, password: string, displayName: string, loginId?: string) {
  return apiFetch<{ admin: AdminAccount }>("/api/admin/auth/bootstrap", {
    body: { setupToken, email, password, displayName, loginId },
  });
}

export async function loginAdminAccount(email: string, password: string) {
  const result = await apiFetch<{ admin: AdminAccount; session: { token: string; expiresAt: string } }>("/api/admin/auth/login", {
    body: { email, password },
  });
  setAdminToken(result.session.token);
  return result;
}

export async function logoutAdminAccount() {
  try {
    return await adminFetch<{ ok: true }>("/api/admin/auth/logout", { body: {} });
  } finally {
    clearAdminToken();
  }
}

export async function getAdminMe() {
  return adminFetch<{ admin: AdminAccount }>("/api/admin/auth/me");
}

export async function getAdminDashboard() {
  return adminFetch<AdminDashboard>("/api/admin/dashboard");
}

export async function getAdminCatalog() {
  return adminFetch<AdminCatalog>("/api/admin/catalog");
}

export async function listAdminUsers(params: { q?: string; status?: string; page?: number; pageSize?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.status) query.set("status", params.status);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  return adminFetch<{ users: AdminUserRow[]; page: number; pageSize: number; total: number }>(`/api/admin/users/list${query.size ? `?${query}` : ""}`);
}

export async function setAdminUserStatus(userId: string, status: "ACTIVE" | "SUSPENDED", reason = "") {
  return adminFetch<{ user: AdminUserRow }>("/api/admin/users/status", { body: { userId, status, reason } });
}

export async function revokeAdminUserSessions(userId: string) {
  return adminFetch<{ ok: true }>("/api/admin/users/revoke-sessions", { body: { userId } });
}

export async function assignAdminUserPlan(userId: string, planCode: string) {
  return adminFetch<{ subscription: Record<string, unknown>; plan: Record<string, unknown> }>("/api/admin/users/assign-plan", { body: { userId, planCode } });
}

export async function saveAdminSetting(settingKey: string, value: unknown, isPublic = true, description = "") {
  return adminFetch<{ setting: Record<string, unknown> }>("/api/admin/settings/save", { body: { settingKey, value, isPublic, description } });
}

export async function saveAdminPlan(plan: { code: string; name: string; description?: string; status?: string; isDefault?: boolean; sortOrder?: number; metadata?: Record<string, unknown> }) {
  return adminFetch<{ plan: Record<string, unknown> }>("/api/admin/plans/save", { body: plan });
}

export async function saveAdminFeature(feature: { featureKey: string; name: string; description?: string; status?: string }) {
  return adminFetch<{ feature: Record<string, unknown> }>("/api/admin/features/save", { body: feature });
}

export async function setAdminPlanFeature(planCode: string, featureKey: string, enabled: boolean, config: Record<string, unknown> = {}) {
  return adminFetch<{ planFeature: Record<string, unknown> }>("/api/admin/features/set-plan", { body: { planCode, featureKey, enabled, config } });
}

export async function saveAdminAnnouncement(announcement: {
  id?: string;
  title: string;
  body: string;
  status?: string;
  target?: string;
  targetValue?: string;
  startsAt?: string;
  endsAt?: string;
}) {
  return adminFetch<{ announcement: Record<string, unknown> }>("/api/admin/announcements/save", { body: announcement });
}

export async function saveAdminAd(ad: {
  placementKey: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  provider?: string;
  configStatus?: string;
  config?: Record<string, unknown>;
}) {
  return adminFetch<{ placement: Record<string, unknown>; config?: Record<string, unknown> | null }>("/api/admin/ads/save", { body: ad });
}

export async function getRuntimeConfig() {
  return apiFetch<RuntimeConfig>("/api/config/runtime");
}

export async function requestServerPasswordReset(email: string) {
  return apiFetch<{ ok: true }>("/api/auth/request-reset", { body: { email } });
}

export async function deleteServerAccount() {
  return apiFetch<{ ok: true }>("/api/auth/delete-account", { body: {} });
}

export async function emailServerDataExport() {
  return apiFetch<{ ok: true; emailDelivery?: { delivered: boolean; reason?: string } }>("/api/export/email", { body: {} });
}

export async function ensureLocalProfileForServerUser(user: ServerUser, config: AppConfig) {
  const existing = await db.profiles.where("loginId").equals(user.email).first();
  const timestamp = nowIso();
  const profileId = existing?.id ?? createId();
  const profile: Profile = {
    id: profileId,
    loginId: user.email,
    passwordHash: existing?.passwordHash ?? "",
    connectionCode: user.connectionCode,
    displayName: user.displayName || user.email.split("@")[0],
    currency: user.currency || config.defaultCurrency,
    connectedUserId: user.id,
    setupComplete: true,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    syncState: "synced",
  };
  await db.profiles.put(profile);
  return profile;
}

function entityItems(snapshot: CloudSnapshot): Array<{
  type: EntityType;
  items: Array<Account | Category | Transaction | Budget | RecurringTransaction | Person | Settlement | Repayment>;
}> {
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

function profileCursorKey(localProfileId: string) {
  return `micham_sync_cursor_${localProfileId}`;
}

function getProfileCursor(localProfileId: string) {
  return localStorage.getItem(profileCursorKey(localProfileId)) || "";
}

function setProfileCursor(localProfileId: string, cursor: string) {
  if (cursor) localStorage.setItem(profileCursorKey(localProfileId), cursor);
}

function entityItemsFromSnapshot(snapshot: CloudSnapshot) {
  return entityItems(snapshot).flatMap((group) => group.items.map((item) => ({ type: group.type, item })));
}

export async function queuePendingLocalMutations(snapshot: CloudSnapshot) {
  if (!snapshot.profile) return;
  const timestamp = nowIso();
  const rows = entityItemsFromSnapshot(snapshot)
    .filter(({ item }) => item.syncState !== "synced")
    .map(({ type, item }) => ({
      id: `${type}:${item.id}`,
      entity: type,
      entityId: item.id,
      action: item.deletedAt ? ("delete" as const) : ("upsert" as const),
      payload: item,
      clientMutationId: `${type}:${item.id}:${item.updatedAt || timestamp}`,
      retryCount: 0,
      createdAt: item.createdAt || timestamp,
      updatedAt: item.updatedAt || timestamp,
      syncState: "queued" as const,
    }));
  if (rows.length) await db.syncQueue.bulkPut(rows);
}

export async function pushQueuedServerMutations(snapshot: CloudSnapshot) {
  if (!getServerToken() || !snapshot.profile) return { ok: true, synced: 0 };
  await queuePendingLocalMutations(snapshot);
  const queued = await db.syncQueue.orderBy("updatedAt").limit(200).toArray();
  if (!queued.length) return { ok: true, synced: 0 };
  const timestamp = nowIso();
  await db.syncQueue.bulkPut(queued.map((item) => ({ ...item, lastAttemptAt: timestamp, retryCount: (item.retryCount || 0) + 1 })));
  const mutations: SyncMutation[] = queued.map((item) => ({
    clientMutationId: item.clientMutationId || item.id,
    entityType: item.entity as EntityType,
    entityId: item.entityId,
    action: item.action,
    payload: (item.payload && typeof item.payload === "object" ? item.payload : {}) as Record<string, unknown>,
  }));
  let result: { ok: true; synced: number };
  try {
    result = await apiFetch<{ ok: true; synced: number }>("/api/sync/push", { body: { profile: snapshot.profile, mutations } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed.";
    await db.syncQueue.bulkPut(
      queued.map((item) => ({
        ...item,
        lastAttemptAt: timestamp,
        retryCount: (item.retryCount || 0) + 1,
        error: message,
        syncState: "queued" as const,
      })),
    );
    throw error;
  }
  await db.transaction(
    "rw",
    [db.syncQueue, db.accounts, db.categories, db.transactions, db.budgets, db.recurringTransactions, db.people, db.settlements, db.repayments, db.profiles],
    async () => {
      await db.syncQueue.bulkDelete(queued.map((item) => item.id));
      if (snapshot.profile) await db.profiles.update(snapshot.profile.id, { syncState: "synced", updatedAt: timestamp });
      for (const operation of queued) {
        if (operation.action === "delete") continue;
        const payload = operation.payload && typeof operation.payload === "object"
          ? { ...(operation.payload as Record<string, unknown>), syncState: "synced" }
          : undefined;
        if (!payload) continue;
        await putEntity(operation.entity as EntityType, [payload]);
      }
    },
  );
  return result;
}

export async function pushServerSnapshot(snapshot: CloudSnapshot) {
  return pushQueuedServerMutations(snapshot);
}

export async function pullServerSnapshot(localProfileId: string) {
  return pullServerChanges(localProfileId);
}

export async function pullServerChanges(localProfileId: string) {
  const cursor = getProfileCursor(localProfileId);
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=500` : "?limit=500";
  const result = await apiFetch<{
    profile?: {
      id: string;
      local_profile_id?: string | null;
      email: string;
      display_name: string;
      currency: string;
      connection_code: string;
    } | null;
    entities: CloudEntityRow[];
    cursor?: string;
    hasMore?: boolean;
  }>(`/api/sync/pull${query}`);

  const grouped = new Map<EntityType, Record<string, unknown>[]>();
  const localPeople = await db.people.where("ownerProfileId").equals(localProfileId).toArray();
  for (const row of result.entities ?? []) {
    const friendUserId = typeof row.payload.friendUserId === "string" ? row.payload.friendUserId : "";
    const localFriend = friendUserId ? localPeople.find((person) => person.friendUserId === friendUserId) : undefined;
    const payload = {
      ...row.payload,
      ownerProfileId: localProfileId,
      personId: localFriend?.id ?? row.payload.personId,
      deletedAt: row.deleted_at ?? (row.payload.deletedAt as string | undefined),
      syncState: "synced",
    };
    grouped.set(row.entity_type, [...(grouped.get(row.entity_type) ?? []), payload]);
  }

  await db.transaction(
    "rw",
    [db.accounts, db.categories, db.transactions, db.budgets, db.recurringTransactions, db.people, db.settlements, db.repayments, db.profiles],
    async () => {
      for (const [type, payloads] of grouped) await putEntity(type, payloads);
      if (result.cursor) {
        await db.profiles.update(localProfileId, { lastSyncCursor: result.cursor, updatedAt: nowIso() });
        setProfileCursor(localProfileId, result.cursor);
      }
    },
  );
  return result;
}

export async function syncServerSnapshot(snapshot: CloudSnapshot) {
  if (!getServerToken() || !snapshot.profile) return;
  await pushQueuedServerMutations(snapshot);
  await pullServerChanges(snapshot.profile.id);
}

export async function verifyServerFriend(connectionCode: string) {
  const result = await apiFetch<{
    friend: { displayName: string; currency: string; connectionCode: string; emailVerified: boolean };
  }>("/api/friends/verify", { body: { connectionCode } });
  return result.friend;
}

export async function requestServerFriend(connectionCode: string, ownerPersonId: string) {
  const result = await apiFetch<{
    friend: { id: string; display_name: string; connection_code: string; status: string };
    status: "pending";
  }>("/api/friends/request", { body: { connectionCode, ownerPersonId } });
  return result;
}

export async function respondServerFriend(friendUserId: string, action: "accept" | "reject") {
  return apiFetch<{ status: "connected" | "removed" }>("/api/friends/respond", { body: { friendUserId, action } });
}

export async function blockServerFriend(friendUserId: string) {
  return apiFetch<{ status: "blocked" }>("/api/friends/block", { body: { friendUserId } });
}

export async function removeServerFriend(friendUserId: string) {
  return apiFetch<{ status: "removed" }>("/api/friends/remove", { body: { friendUserId } });
}

export async function mirrorServerFriendEntity(connectionCode: string, entityType: EntityType, entityId: string, payload: Record<string, unknown>) {
  return apiFetch<{ ok: true }>("/api/friends/mirror", {
    body: { connectionCode, entityType, entityId, payload },
  });
}

export async function listServerFriends() {
  return apiFetch<{
    friends: Array<{
      friend_id: string;
      owner_person_id?: string | null;
      friend_person_id?: string | null;
      status: "pending" | "connected" | "blocked" | "removed";
      requested_by?: string | null;
      requested_at?: string | null;
      responded_at?: string | null;
      blocked_by?: string | null;
      friend?: {
        id: string;
        display_name: string;
        currency: string;
        connection_code: string;
        email_verified: boolean;
      } | null;
    }>;
  }>("/api/friends/list");
}

export async function listServerSettlementEvents() {
  return apiFetch<{ events: ServerSettlementEvent[] }>("/api/settlements/list");
}

export async function requestServerRepayment(
  friendUserId: string,
  settlementEntityId: string,
  amount: number,
  payload: Record<string, unknown>,
  previousEventId?: string,
  clientMutationId?: string,
) {
  return apiFetch<{ event: ServerSettlementEvent }>("/api/settlements/request-repayment", {
    body: { friendUserId, settlementEntityId, amount, payload, previousEventId, clientMutationId },
  });
}

export async function respondServerRepayment(eventId: string, action: "accept" | "reject") {
  return apiFetch<{ event: ServerSettlementEvent }>("/api/settlements/respond-repayment", {
    body: { eventId, action },
  });
}
