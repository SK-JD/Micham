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
};

const TOKEN_KEY = "micham_server_token";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export class ApiClientError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
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
    throw new ApiClientError(0, "Server API is not running. Start local testing with `npm run dev` from this project.");
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
    throw new ApiClientError(response.status, typeof payload.error === "string" ? payload.error : fallback);
  }
  return payload as T;
}

export async function registerServerAccount(email: string, password: string, displayName: string, currency: string) {
  return apiFetch<{ user: ServerUser; emailDelivery?: { sent: boolean } }>("/api/auth/register", {
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

export async function requestServerPasswordReset(email: string) {
  return apiFetch<{ ok: true }>("/api/auth/request-reset", { body: { email } });
}

export async function deleteServerAccount() {
  return apiFetch<{ ok: true }>("/api/auth/delete-account", { body: {} });
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

export async function pushServerSnapshot(snapshot: CloudSnapshot) {
  const result = await apiFetch<{ ok: true; synced: number }>("/api/sync/push", { body: snapshot });
  const timestamp = nowIso();
  await db.transaction(
    "rw",
    [db.profiles, db.accounts, db.categories, db.transactions, db.budgets, db.recurringTransactions, db.people, db.settlements, db.repayments],
    async () => {
      if (snapshot.profile) await db.profiles.update(snapshot.profile.id, { syncState: "synced", updatedAt: timestamp });
      for (const group of entityItems(snapshot)) {
        await putEntity(group.type, group.items.map((item) => ({ ...item, syncState: "synced" })));
      }
    },
  );
  return result;
}

export async function pullServerSnapshot(localProfileId: string) {
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
  }>("/api/sync/pull");

  const grouped = new Map<EntityType, Record<string, unknown>[]>();
  for (const row of result.entities ?? []) {
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
  return result;
}

export async function syncServerSnapshot(snapshot: CloudSnapshot) {
  if (!getServerToken() || !snapshot.profile) return;
  await pushServerSnapshot(snapshot);
  await pullServerSnapshot(snapshot.profile.id);
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
  return apiFetch<{ status: "connected" | "blocked" }>("/api/friends/respond", { body: { friendUserId, action } });
}

export async function blockServerFriend(friendUserId: string) {
  return apiFetch<{ status: "blocked" }>("/api/friends/block", { body: { friendUserId } });
}

export async function removeServerFriend(friendUserId: string) {
  return apiFetch<{ status: "removed" }>("/api/friends/remove", { body: { friendUserId } });
}

export async function listServerFriends() {
  return apiFetch<{
    friends: Array<{
      friend_id: string;
      owner_person_id?: string | null;
      friend_person_id?: string | null;
      status: "pending" | "connected" | "blocked";
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
