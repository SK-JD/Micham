import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  BarChart3,
  Bot,
  CalendarDays,
  ChevronDown,
  CircleUserRound,
  Download,
  Eye,
  EyeOff,
  Home,
  Image,
  LogOut,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Settings,
  Star,
  Sun,
  Trash2,
  Upload,
  UserPlus,
  Users,
  WalletCards,
} from "lucide-react";
import { StatCard } from "./components/StatCard";
import { accountBalance, budgetUsage, categorySpend, personBalance, sameDay, summarize } from "./lib/calculations";
import {
  createConnectionCode,
  pullCloudAppConfig,
} from "./lib/cloud";
import { db, initializeDatabase } from "./lib/db";
import { createId, nowIso } from "./lib/defaults";
import { formatDate, formatMoney } from "./lib/format";
import {
  ApiClientError,
  blockServerFriend,
  clearServerToken,
  ensureLocalProfileForServerUser,
  getServerToken,
  listServerFriends,
  loginServerAccount,
  pullServerSnapshot,
  pushServerSnapshot,
  registerServerAccount,
  requestServerFriend,
  requestServerPasswordReset,
  respondServerFriend,
  syncServerSnapshot,
  verifyServerFriend,
} from "./lib/serverApi";
import type {
  Account,
  AppConfig,
  Budget,
  Category,
  ImportPayload,
  Person,
  Profile,
  Repayment,
  RecurringTransaction,
  Settlement,
  Transaction,
  TransactionType,
} from "./lib/types";
import "./styles/index.css";

const defaultAppLogoUrl = new URL("../Logos/Micham_app_logo.svg", import.meta.url).href;
const defaultWordmarkUrl = new URL("../Logos/Micham_bottom_wordmark_tagline.svg", import.meta.url).href;
const defaultDarkWordmarkUrl = new URL("../Logos/Micham_bottom_wordmark_tagline_dark.svg", import.meta.url).href;

type View = "dashboard" | "daily" | "add" | "monthly" | "calendar" | "people" | "manage" | "settings" | "admin" | "ai";
type SessionRole = "guest" | "user" | "admin";
type Toast = { id: string; tone: "success" | "error" | "warning" | "info"; message: string };

interface Snapshot {
  config: AppConfig;
  profile?: Profile;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  recurring: RecurringTransaction[];
  people: Person[];
  settlements: Settlement[];
  repayments: Repayment[];
}

const emptySnapshot: Snapshot = {
  config: {
    id: "primary",
    appName: "Micham",
    tagline: "Micham evlo irukku?",
    logoText: "M",
    primaryColor: "#005f46",
    accentColor: "#64dcae",
    surfaceColor: "#f3fbf7",
    textColor: "#0f172a",
    defaultCurrency: "INR",
    adminId: "Admin",
    adminPassword: "Admin@123",
    syncEnabled: false,
    aiEnabled: false,
    groqApiKey: "",
    aiModel: "llama-3.1-8b-instant",
    themeMode: "light",
    updatedAt: nowIso(),
  },
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],
  recurring: [],
  people: [],
  settlements: [],
  repayments: [],
};

const LOGIN_LIMIT = { max: 5, windowMs: 15 * 60 * 1000 };
const AI_LIMIT = { max: 10, windowMs: 60 * 1000 };
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_LOGO_BYTES = 1024 * 1024;

function checkRateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const raw = localStorage.getItem(key);
  const attempts = raw ? (JSON.parse(raw) as number[]) : [];
  const recent = attempts.filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= max) {
    const retryAfterMs = windowMs - (now - recent[0]);
    return { allowed: false, retryAfterMs };
  }
  recent.push(now);
  localStorage.setItem(key, JSON.stringify(recent));
  return { allowed: true, retryAfterMs: 0 };
}

function resetRateLimit(key: string) {
  localStorage.removeItem(key);
}

function minutesFromMs(value: number) {
  return Math.max(1, Math.ceil(value / 60000));
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function belongsToProfile<T extends { ownerProfileId?: string; deletedAt?: string }>(item: T, profileId?: string, includeGlobal = false) {
  if (item.deletedAt) return false;
  if (!profileId) return includeGlobal && !item.ownerProfileId;
  return item.ownerProfileId === profileId || (includeGlobal && !item.ownerProfileId);
}

function uniqueById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

async function claimUnownedData(profileId: string) {
  const timestamp = nowIso();
  const [accounts, transactions, budgets, recurring, people, settlements, repayments] = await Promise.all([
    db.accounts.toArray(),
    db.transactions.toArray(),
    db.budgets.toArray(),
    db.recurringTransactions.toArray(),
    db.people.toArray(),
    db.settlements.toArray(),
    db.repayments.toArray(),
  ]);
  await db.transaction(
    "rw",
    [db.accounts, db.transactions, db.budgets, db.recurringTransactions, db.people, db.settlements, db.repayments],
    async () => {
      await db.accounts.bulkPut(accounts.filter((item) => !item.ownerProfileId).map((item) => ({ ...item, ownerProfileId: profileId, updatedAt: timestamp })));
      await db.transactions.bulkPut(transactions.filter((item) => !item.ownerProfileId).map((item) => ({ ...item, ownerProfileId: profileId, updatedAt: timestamp })));
      await db.budgets.bulkPut(budgets.filter((item) => !item.ownerProfileId).map((item) => ({ ...item, ownerProfileId: profileId, updatedAt: timestamp })));
      await db.recurringTransactions.bulkPut(recurring.filter((item) => !item.ownerProfileId).map((item) => ({ ...item, ownerProfileId: profileId, updatedAt: timestamp })));
      await db.people.bulkPut(people.filter((item) => !item.ownerProfileId).map((item) => ({ ...item, ownerProfileId: profileId, updatedAt: timestamp })));
      await db.settlements.bulkPut(settlements.filter((item) => !item.ownerProfileId).map((item) => ({ ...item, ownerProfileId: profileId, updatedAt: timestamp })));
      await db.repayments.bulkPut(repayments.filter((item) => !item.ownerProfileId).map((item) => ({ ...item, ownerProfileId: profileId, updatedAt: timestamp })));
    },
  );
}

async function createOrGetLocalProfile(config: AppConfig, email: string, displayName: string) {
  const loginId = `local:${email.trim().toLowerCase()}`;
  const existing = await db.profiles.where("loginId").equals(loginId).first();
  if (existing) return existing.id;

  const timestamp = nowIso();
  const profileId = createId();
  const passwordHash = await hashPassword(`local-${profileId}`);
  await db.transaction("rw", db.profiles, db.accounts, async () => {
    await db.profiles.put({
      id: profileId,
      loginId,
      passwordHash,
      connectionCode: createConnectionCode(),
      displayName: displayName.trim() || email.split("@")[0],
      currency: config.defaultCurrency,
      setupComplete: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      syncState: "local",
    });
    await db.accounts.put({
      id: createId(),
      ownerProfileId: profileId,
      name: "Cash",
      openingBalance: 0,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      syncState: "local",
    });
  });
  return profileId;
}

async function syncServerFriendsToLocal(profile: Profile) {
  if (!getServerToken() || !profile.connectedUserId) return;
  const result = await listServerFriends();
  const existingPeople = await db.people.where("ownerProfileId").equals(profile.id).toArray();
  const timestamp = nowIso();
  const rows: Person[] = [];

  for (const link of result.friends) {
    const friend = link.friend;
    if (!friend) continue;
    const existing =
      existingPeople.find((person) => person.friendUserId === link.friend_id) ||
      existingPeople.find((person) => person.inviteCode === friend.connection_code);
    if (existing && !existing.active && existing.status !== "blocked" && link.status !== "connected") continue;
    const requestDirection = link.status === "pending" ? (link.requested_by === profile.connectedUserId ? "outgoing" : "incoming") : undefined;
    rows.push({
      id: existing?.id ?? link.owner_person_id ?? createId(),
      ownerProfileId: profile.id,
      localDisplayName: friend.display_name,
      inviteCode: friend.connection_code,
      connectedUserId: friend.connection_code,
      friendUserId: link.friend_id,
      status: link.status === "pending" ? (requestDirection === "outgoing" ? "requested" : "pending") : link.status,
      verified: link.status === "connected",
      requestDirection,
      active: link.status !== "blocked",
      createdAt: existing?.createdAt ?? link.requested_at ?? timestamp,
      updatedAt: timestamp,
      syncState: "synced",
    });
  }

  if (rows.length) await db.people.bulkPut(rows);
}

function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("dashboard");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [sessionRole, setSessionRole] = useState<SessionRole>(() => (localStorage.getItem("micham_role") as SessionRole) || "guest");
  const [currentProfileId, setCurrentProfileId] = useState(() => localStorage.getItem("micham_profile_id") || "");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = (message: string, tone: Toast["tone"] = "info") => {
    const id = createId();
    setToasts((items) => [...items, { id, message, tone }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3200);
  };

  const refresh = async (profileId = currentProfileId, options: { syncCloud?: boolean } = {}) => {
    const [config, profiles, accounts, categories, transactions, budgets, recurring, people, settlements, repayments] = await Promise.all([
      db.appConfig.get("primary"),
      db.profiles.toArray(),
      db.accounts.toArray(),
      db.categories.toArray(),
      db.transactions.toArray(),
      db.budgets.toArray(),
      db.recurringTransactions.toArray(),
      db.people.toArray(),
      db.settlements.toArray(),
      db.repayments.toArray(),
    ]);
    const profile = profileId ? profiles.find((item) => item.id === profileId) : undefined;
    const nextSnapshot = {
      config: config ?? emptySnapshot.config,
      profile,
      accounts: uniqueById(accounts.filter((item) => belongsToProfile(item, profile?.id))),
      categories: uniqueById(categories.filter((item) => belongsToProfile(item, profile?.id, true))),
      transactions: uniqueById(transactions.filter((item) => belongsToProfile(item, profile?.id))),
      budgets: uniqueById(budgets.filter((item) => belongsToProfile(item, profile?.id))),
      recurring: uniqueById(recurring.filter((item) => belongsToProfile(item, profile?.id))),
      people: uniqueById(people.filter((item) => belongsToProfile(item, profile?.id))),
      settlements: uniqueById(settlements.filter((item) => belongsToProfile(item, profile?.id))),
      repayments: uniqueById(repayments.filter((item) => belongsToProfile(item, profile?.id))),
    };
    setSnapshot(nextSnapshot);

    if (options.syncCloud !== false && getServerToken() && nextSnapshot.config.syncEnabled && nextSnapshot.profile?.connectedUserId) {
      syncServerSnapshot(nextSnapshot)
        .then(() => syncServerFriendsToLocal(nextSnapshot.profile!))
        .catch((error: unknown) => {
          notify(error instanceof Error ? error.message : "Server sync failed.", "error");
        });
    } else if (options.syncCloud !== false && getServerToken() && nextSnapshot.profile?.connectedUserId) {
      syncServerFriendsToLocal(nextSnapshot.profile).catch((error: unknown) => {
        notify(error instanceof Error ? error.message : "Friend refresh failed.", "error");
      });
    }
  };

  useEffect(() => {
    initializeDatabase()
      .then(() => pullCloudAppConfig().catch(() => undefined))
      .then(() => refresh())
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!getServerToken() || !currentProfileId || !snapshot.profile?.connectedUserId) return undefined;
    const timer = window.setInterval(() => {
      pullServerSnapshot(currentProfileId)
        .then(() => syncServerFriendsToLocal(snapshot.profile!))
        .then(() => refresh(currentProfileId, { syncCloud: false }))
        .catch(() => undefined);
    }, 12000);
    return () => window.clearInterval(timer);
  }, [currentProfileId, snapshot.profile?.connectedUserId]);

  useEffect(() => {
    document.documentElement.style.setProperty("--brand", snapshot.config.primaryColor);
    document.documentElement.style.setProperty("--accent", snapshot.config.accentColor);
    document.documentElement.style.setProperty("--surface", snapshot.config.themeMode === "dark" ? "#071713" : snapshot.config.surfaceColor);
    document.documentElement.style.setProperty("--text", snapshot.config.themeMode === "dark" ? "#eafff7" : snapshot.config.textColor);
    document.documentElement.dataset.theme = snapshot.config.themeMode;
    document.title = snapshot.config.appName;
  }, [snapshot.config]);

  const currency = snapshot.profile?.currency ?? snapshot.config.defaultCurrency;
  const activeAccounts = snapshot.accounts.filter((account) => account.active);
  const balances = useMemo(
    () =>
      activeAccounts.map((account) => ({
        account,
        balance: accountBalance(account, snapshot.transactions),
      })),
    [activeAccounts, snapshot.transactions],
  );
  const totalBalance = balances.reduce((sum, item) => sum + item.balance, 0);
  const summary = summarize(snapshot.transactions, selectedDate);
  const logoutUser = () => {
    localStorage.removeItem("micham_role");
    localStorage.removeItem("micham_profile_id");
    clearServerToken();
    setSessionRole("guest");
    setCurrentProfileId("");
  };

  if (loading) return <Shell snapshot={snapshot}>Loading...</Shell>;

  if (sessionRole === "admin") {
    return (
      <Shell snapshot={snapshot}>
        <main className="mx-auto w-full max-w-6xl px-4 py-5">
          <AdminView
            snapshot={snapshot}
            onLogout={() => {
              localStorage.removeItem("micham_role");
              setSessionRole("guest");
            }}
            onDone={refresh}
          />
        </main>
      </Shell>
    );
  }

  if (sessionRole !== "user" || !snapshot.profile?.setupComplete) {
    return (
      <Shell snapshot={snapshot}>
        <AuthGate
          config={snapshot.config}
          notify={notify}
          onLogin={async (profileId) => {
            localStorage.setItem("micham_role", "user");
            localStorage.setItem("micham_profile_id", profileId);
            setSessionRole("user");
            setCurrentProfileId(profileId);
            await claimUnownedData(profileId);
            await refresh(profileId);
          }}
          onAdminLogin={async () => {
            localStorage.setItem("micham_role", "admin");
            setSessionRole("admin");
            await refresh("");
          }}
        />
      </Shell>
    );
  }

  return (
    <Shell snapshot={snapshot}>
      <div className="app-shell grid grid-rows-[auto_1fr_auto]">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <Wordmark config={snapshot.config} />
            </div>
            <button className="profile-button" title="Settings" onClick={() => setView("settings")}>
              <CircleUserRound size={22} />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-5">
          {view === "dashboard" && (
            <Dashboard
              snapshot={snapshot}
              balances={balances}
              currency={currency}
              totalBalance={totalBalance}
              summary={summary}
              onDone={refresh}
              onNavigate={setView}
            />
          )}
          {view === "add" && <AddView snapshot={snapshot} notify={notify} onDone={refresh} />}
          {view === "daily" && (
            <DailyView snapshot={snapshot} currency={currency} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />
          )}
          {view === "monthly" && <MonthlyView snapshot={snapshot} currency={currency} />}
          {view === "calendar" && (
            <CalendarView snapshot={snapshot} currency={currency} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />
          )}
          {view === "people" && <PeopleView snapshot={snapshot} currency={currency} notify={notify} onDone={refresh} />}
          {view === "manage" && <ManageView snapshot={snapshot} notify={notify} onDone={refresh} />}
          {view === "settings" && <SettingsView snapshot={snapshot} notify={notify} onDone={refresh} onLogout={logoutUser} onNavigate={setView} />}
          {view === "ai" && <AiChatView snapshot={snapshot} currency={currency} notify={notify} />}
        </main>

        <nav className="bottom-nav sticky bottom-0 z-20">
          <div className="bottom-nav-main mx-auto grid max-w-6xl grid-cols-5 gap-1 px-2 py-2 text-xs">
            <NavButton icon={<Home size={18} />} label="Home" active={view === "dashboard"} onClick={() => setView("dashboard")} />
            <NavButton icon={<Bot size={18} />} label="Chat" active={view === "ai"} disabled={!snapshot.config.aiEnabled} onClick={() => { if (snapshot.config.aiEnabled) setView("ai"); }} />
            <button className={`add-nav-button ${view === "add" ? "add-nav-button-active" : ""}`} onClick={() => setView("add")}>
              <Plus size={24} />
              <span>Add</span>
            </button>
            <NavButton icon={<BarChart3 size={18} />} label="Reports" active={view === "monthly"} onClick={() => setView("monthly")} />
            <NavButton icon={<Users size={18} />} label="Friends" active={view === "people"} onClick={() => setView("people")} />
          </div>
        </nav>
      </div>
      <ToastHost toasts={toasts} />
    </Shell>
  );
}

function Shell({ snapshot, children }: { snapshot: Snapshot; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--surface)] text-[var(--text)]">
      {children}
    </div>
  );
}

function Logo({ config }: { config: AppConfig }) {
  return <img className="app-logo-image" src={config.logoImage || defaultAppLogoUrl} alt={`${config.appName} logo`} />;
}

function Wordmark({ config }: { config: AppConfig }) {
  const wordmarkUrl = config.themeMode === "dark" ? defaultDarkWordmarkUrl : defaultWordmarkUrl;

  return (
    <div className="wordmark-wrap">
      <img src={wordmarkUrl} alt={`${config.appName} wordmark`} />
      <span>{config.appName}</span>
      <small>{config.tagline}</small>
    </div>
  );
}

async function hashPassword(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = crypto.subtle ? await crypto.subtle.digest("SHA-256", bytes) : sha256Fallback(bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function sha256Fallback(bytes: Uint8Array) {
  const words: number[] = [];
  const bitLength = bytes.length * 8;
  for (let i = 0; i < bytes.length; i += 1) words[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
  words[bytes.length >> 2] |= 0x80 << (24 - (bytes.length % 4) * 8);
  words[((bytes.length + 8) >> 6) * 16 + 15] = bitLength;

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const rightRotate = (n: number, x: number) => (x >>> n) | (x << (32 - n));

  for (let i = 0; i < words.length; i += 16) {
    const w = words.slice(i, i + 16);
    for (let j = 16; j < 64; j += 1) {
      const s0 = rightRotate(7, w[j - 15]) ^ rightRotate(18, w[j - 15]) ^ (w[j - 15] >>> 3);
      const s1 = rightRotate(17, w[j - 2]) ^ rightRotate(19, w[j - 2]) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let j = 0; j < 64; j += 1) {
      const s1 = rightRotate(6, e) ^ rightRotate(11, e) ^ rightRotate(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + k[j] + w[j]) | 0;
      const s0 = rightRotate(2, a) ^ rightRotate(13, a) ^ rightRotate(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  const out = new Uint8Array(32);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((word, index) => {
    out[index * 4] = word >>> 24;
    out[index * 4 + 1] = word >>> 16;
    out[index * 4 + 2] = word >>> 8;
    out[index * 4 + 3] = word;
  });
  return out.buffer;
}

function AuthGate({
  config,
  notify,
  onLogin,
  onAdminLogin,
}: {
  config: AppConfig;
  notify: (message: string, tone?: Toast["tone"]) => void;
  onLogin: (profileId: string) => Promise<void>;
  onAdminLogin: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [connectionCode, setConnectionCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [localName, setLocalName] = useState("");
  const [localEmail, setLocalEmail] = useState("");
  const [currency, setCurrency] = useState(config.defaultCurrency);
  const [formError, setFormError] = useState("");

  const login = async () => {
    setFormError("");
    const normalizedLoginId = loginId.trim().toLowerCase();
    const loginLimit = checkRateLimit(`micham_login_${normalizedLoginId || "blank"}`, LOGIN_LIMIT.max, LOGIN_LIMIT.windowMs);
    if (!loginLimit.allowed) {
      const message = `Too many login attempts. Try again in ${minutesFromMs(loginLimit.retryAfterMs)} minute(s).`;
      setFormError(message);
      notify(message, "error");
      return;
    }

    if (loginId.trim() === config.adminId && password === config.adminPassword) {
      resetRateLimit(`micham_login_${normalizedLoginId}`);
      await onAdminLogin();
      return;
    }

    if (!isValidEmail(normalizedLoginId)) {
      setFormError("Use your email address to login, or use the admin ID for admin login.");
      return;
    }

    try {
      const { user } = await loginServerAccount(normalizedLoginId, password);
      const profile = await ensureLocalProfileForServerUser(user, config);
      await pullServerSnapshot(profile.id);
      await syncServerFriendsToLocal(profile);
      resetRateLimit(`micham_login_${normalizedLoginId}`);
      notify("Account connected.", "success");
      await onLogin(profile.id);
      return;
    } catch (error) {
      const localProfile = await db.profiles.where("loginId").equals(normalizedLoginId).first();
      if (!localProfile) {
        const message = error instanceof Error ? error.message : "Login failed.";
        setFormError(message);
        notify(message, error instanceof ApiClientError && error.status === 403 ? "warning" : "error");
        return;
      }
    }

    const passwordHash = await hashPassword(password);
    const profile = await db.profiles.where("loginId").equals(normalizedLoginId).first();
    if (!profile || profile.passwordHash !== passwordHash) {
      setFormError("Invalid email or password.");
      notify("Invalid email or password.", "error");
      return;
    }
    if (!profile.connectionCode) {
      await db.profiles.update(profile.id, { connectionCode: createConnectionCode(), updatedAt: nowIso() });
    }
    resetRateLimit(`micham_login_${normalizedLoginId}`);
    await onLogin(profile.id);
  };

  const register = async () => {
    setFormError("");
    const normalizedLoginId = loginId.trim().toLowerCase();
    if (!isValidEmail(normalizedLoginId)) {
      setFormError("Enter a valid email address.");
      notify("Enter a valid email address.", "error");
      return;
    }
    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      notify("Password must be at least 8 characters.", "error");
      return;
    }

    try {
      await registerServerAccount(normalizedLoginId, password, displayName || normalizedLoginId.split("@")[0], currency);
      notify("Verification email sent. Verify your account, then login.", "success");
      setMode("login");
      setPassword("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Account could not be created.");
      notify(error instanceof Error ? error.message : "Account could not be created.", "error");
    }
  };

  const useLocally = async () => {
    setFormError("");
    const normalizedEmail = localEmail.trim().toLowerCase();
    if (!localName.trim()) {
      setFormError("Enter your name for local usage.");
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      setFormError("Enter a valid email for local usage.");
      return;
    }
    const profileId = await createOrGetLocalProfile(config, normalizedEmail, localName);
    notify("Using local device storage.", "success");
    await onLogin(profileId);
  };

  const resetPassword = async () => {
    setFormError("");
    const normalizedLoginId = loginId.trim().toLowerCase();
    if (!isValidEmail(normalizedLoginId)) {
      setFormError("Enter the email used for this local account.");
      return;
    }
    if (!connectionCode.trim()) {
      try {
        await requestServerPasswordReset(normalizedLoginId);
        notify("Password reset email sent.", "success");
        return;
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "Unable to send reset email.");
        notify(error instanceof Error ? error.message : "Unable to send reset email.", "error");
        return;
      }
    }
    const profile = await db.profiles.where("loginId").equals(normalizedLoginId).first();
    if (!profile || profile.connectionCode !== connectionCode.trim().toUpperCase()) {
      setFormError("Email and connection code do not match.");
      notify("Email and connection code do not match.", "error");
      return;
    }
    if (newPassword.length < 8) {
      setFormError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError("New password and confirmation do not match.");
      return;
    }
    await db.profiles.update(profile.id, { passwordHash: await hashPassword(newPassword), updatedAt: nowIso() });
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setConnectionCode("");
    setMode("login");
    notify("Password reset. Login with the new password.", "success");
  };

  const modeTitle = mode === "register" ? "Create your account" : mode === "reset" ? "Reset password" : "Welcome back";
  const modeSubtitle =
    mode === "register"
      ? "Use your email so this profile can be linked and recovered later."
      : mode === "reset"
        ? "Use your email and connection code to set a new local password."
        : "Use locally without signup, or login with email/admin ID.";

  return (
    <div className="auth-screen">
      <section className="auth-brand">
        <Wordmark config={config} />
      </section>

      <section className="auth-card">
        <div className="auth-heading">
          <p>{modeTitle}</p>
          <span>{modeSubtitle}</span>
        </div>
        <div className="auth-tabs">
          <button className={mode === "login" ? "auth-tab-active" : ""} onClick={() => setMode("login")}>Login</button>
          <button className={mode === "register" ? "auth-tab-active" : ""} onClick={() => setMode("register")}>Create</button>
          <button className={mode === "reset" ? "auth-tab-active" : ""} onClick={() => setMode("reset")}>Reset</button>
        </div>
        {formError ? <div className="form-error">{formError}</div> : null}
        {mode === "login" ? (
          <div className="local-entry">
            <div className="grid gap-3">
              <TextField label="Local name" value={localName} onChange={setLocalName} placeholder="Your name" />
              <TextField label="Local email" value={localEmail} onChange={setLocalEmail} placeholder="you@example.com" />
            </div>
            <button className="local-use-button" onClick={useLocally}>
              <WalletCards size={19} /> Use Locally
            </button>
            <p>Your data stays on this device until you create an account and enable sync.</p>
            <div className="auth-divider"><span>or login</span></div>
          </div>
        ) : null}
        {mode === "reset" ? (
          <div className="grid gap-4">
            <TextField label="Email" value={loginId} onChange={setLoginId} placeholder="you@example.com" />
            <TextField label="Connection code" value={connectionCode} onChange={(value) => setConnectionCode(value.toUpperCase())} placeholder="Optional for local reset" />
            {connectionCode ? (
              <>
                <TextField label="New password" value={newPassword} onChange={setNewPassword} type="password" />
                <TextField label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} type="password" />
              </>
            ) : null}
            <button className="primary-button" onClick={resetPassword} disabled={!loginId || Boolean(connectionCode && (!newPassword || !confirmPassword))}>
              {!connectionCode ? "Send Reset Email" : "Reset Password"}
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            <TextField label={mode === "register" ? "Email" : "Email or Admin ID"} value={loginId} onChange={setLoginId} placeholder={mode === "register" ? "you@example.com" : "you@example.com"} />
            <TextField label="Password" value={password} onChange={setPassword} type="password" />
            {mode === "register" ? (
              <>
                <TextField label="Display name" value={displayName} onChange={setDisplayName} placeholder="Your name" />
                <TextField label="Currency" value={currency} onChange={setCurrency} placeholder="INR" />
              </>
            ) : null}
            <button className="primary-button" onClick={mode === "register" ? register : login} disabled={!loginId || !password}>
              {mode === "register" ? "Create Account" : "Login"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function NavButton({
  icon,
  label,
  active,
  disabled = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`nav-button ${active ? "nav-button-active" : ""}`} disabled={disabled} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Onboarding({ config, onDone }: { config: AppConfig; onDone: () => Promise<void> }) {
  const [mode, setMode] = useState<"choice" | "offline" | "connect">("choice");
  const [displayName, setDisplayName] = useState("");
  const [currency, setCurrency] = useState(config.defaultCurrency);
  const [accounts, setAccounts] = useState([{ name: "Cash", openingBalance: 0 }]);

  const save = async () => {
    const timestamp = nowIso();
    const profileId = createId();
    await db.transaction("rw", db.profiles, db.accounts, async () => {
      await db.profiles.put({
        id: profileId,
        loginId: displayName || "local-user",
        passwordHash: await hashPassword("local-user"),
        connectionCode: createConnectionCode(),
        displayName: displayName || "Local User",
        currency,
        setupComplete: true,
        createdAt: timestamp,
        updatedAt: timestamp,
        syncState: "local",
      });
      await db.accounts.bulkPut(
        accounts
          .filter((account) => account.name.trim())
          .map((account) => ({
            id: createId(),
            ownerProfileId: profileId,
            name: account.name.trim(),
            openingBalance: Number(account.openingBalance) || 0,
            active: true,
            createdAt: timestamp,
            updatedAt: timestamp,
            syncState: "local" as const,
          })),
      );
    });
    await onDone();
  };

  if (mode === "choice") {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-8">
        <div className="mb-8 flex items-center gap-3">
          <Logo config={config} />
          <Wordmark config={config} />
        </div>
        <div className="grid gap-3">
          <button className="choice-button" onClick={() => setMode("offline")}>
            <WalletCards />
            <span>Use Offline</span>
          </button>
          <button className="choice-button" onClick={() => setMode("connect")}>
            <RefreshCw />
            <span>Create Account Later</span>
          </button>
        </div>
      </div>
    );
  }

  if (mode === "connect") {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-8">
        <Panel title="Create Account Later">
          <p className="text-sm text-slate-600">
            Supabase authentication is prepared for the next phase. Start offline now and connect this same local profile later
            without losing accounts or transactions.
          </p>
          <button className="primary-button mt-4" onClick={() => setMode("offline")}>
            Continue Offline
          </button>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <Panel title="Offline Setup">
        <div className="grid gap-4">
          <TextField label="Display name" value={displayName} onChange={setDisplayName} placeholder="Your name" />
          <TextField label="Currency" value={currency} onChange={setCurrency} placeholder="INR" />
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <label className="field-label">Accounts</label>
              <button
                className="small-button"
                onClick={() => setAccounts((items) => [...items, { name: "", openingBalance: 0 }])}
              >
                <Plus size={16} /> Add
              </button>
            </div>
            {accounts.map((account, index) => (
              <div className="grid grid-cols-[1fr_120px] gap-2" key={index}>
                <input
                  className="field-input"
                  value={account.name}
                  onChange={(event) =>
                    setAccounts((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, name: event.target.value } : item)))
                  }
                  placeholder="SBI Bank"
                />
                <input
                  className="field-input"
                  value={account.openingBalance}
                  type="number"
                  onChange={(event) =>
                    setAccounts((items) =>
                      items.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, openingBalance: Number(event.target.value) } : item,
                      ),
                    )
                  }
                  placeholder="18000"
                />
              </div>
            ))}
          </div>
          <button className="primary-button" onClick={save}>
            Start Tracking
          </button>
        </div>
      </Panel>
    </div>
  );
}

function Dashboard({
  snapshot,
  balances,
  currency,
  totalBalance,
  summary,
  onDone,
  onNavigate,
}: {
  snapshot: Snapshot;
  balances: { account: Account; balance: number }[];
  currency: string;
  totalBalance: number;
  summary: ReturnType<typeof summarize>;
  onDone: () => Promise<void>;
  onNavigate: (view: View) => void;
}) {
  return (
    <div className="grid gap-5">
      <section className="home-hero">
        <div>
          <p className="text-sm font-semibold opacity-80">Available balance</p>
          <h2>{formatMoney(totalBalance, currency)}</h2>
          <p className="text-sm opacity-80">
            Income {formatMoney(summary.monthlyIncome, currency)} · Expenses {formatMoney(summary.monthlyExpenses, currency)}
          </p>
        </div>
        <button className="hero-add-button" onClick={() => onNavigate("add")}>
          <Plus size={22} /> Add Transaction
        </button>
      </section>

      <div className="quick-actions-grid">
        <button className="action-tile action-expense" onClick={() => onNavigate("add")}>
          <ArrowUpRight size={20} />
          <span>Add Expense</span>
        </button>
        <button className="action-tile action-income" onClick={() => onNavigate("add")}>
          <ArrowDownLeft size={20} />
          <span>Add Income</span>
        </button>
        <button className="action-tile action-transfer" onClick={() => onNavigate("add")}>
          <ArrowRightLeft size={20} />
          <span>Transfer</span>
        </button>
        {snapshot.config.aiEnabled ? (
          <button className="action-tile action-ai" onClick={() => onNavigate("ai")}>
            <Bot size={20} />
            <span>AI Chat</span>
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Month savings" value={formatMoney(summary.monthlySavings, currency)} icon={<WalletCards size={20} />} />
        <StatCard label="Today spent" value={formatMoney(summary.todaySpend, currency)} icon={<CalendarDays size={20} />} />
        <StatCard label="Accounts" value={String(balances.length)} icon={<WalletCards size={20} />} />
      </div>

      <DashboardCharts snapshot={snapshot} currency={currency} />

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Panel title="Accounts">
          <div className="grid gap-2">
            {balances.map(({ account, balance }) => (
              <div className="row" key={account.id}>
                <span>{account.name}</span>
                <strong>{formatMoney(balance, currency)}</strong>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Recent Transactions">
          <TransactionList snapshot={snapshot} currency={currency} transactions={snapshot.transactions.slice(-6).reverse()} />
        </Panel>
      </div>
    </div>
  );
}

function DashboardCharts({ snapshot, currency }: { snapshot: Snapshot; currency: string }) {
  const categoryRows = categorySpend(snapshot.categories, snapshot.transactions).slice(0, 5);
  const maxCategory = Math.max(...categoryRows.map((item) => item.amount), 1);
  const days = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const dailyRows = Array.from({ length: days }, (_, index) => {
    const date = `${monthPrefix}-${String(index + 1).padStart(2, "0")}`;
    const amount = snapshot.transactions
      .filter((item) => item.type === "expense" && sameDay(item.date, date))
      .reduce((sum, item) => sum + item.amount, 0);
    return { day: index + 1, amount };
  });
  const maxDaily = Math.max(...dailyRows.map((item) => item.amount), 1);
  const month = summarize(snapshot.transactions);
  const totalFlow = Math.max(month.monthlyIncome + month.monthlyExpenses, 1);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
      <Panel title="Cash Flow">
        <div className="donut-layout">
          <div
            className="flow-ring"
            style={{
              background: `conic-gradient(var(--accent) 0 ${(month.monthlyIncome / totalFlow) * 360}deg, #ef4444 ${(month.monthlyIncome / totalFlow) * 360}deg 360deg)`,
            }}
          >
            <span>{formatMoney(month.monthlySavings, currency)}</span>
          </div>
          <div className="grid flex-1 gap-2">
            <div className="legend-row">
              <span><i className="legend-dot legend-income" />Income</span>
              <strong>{formatMoney(month.monthlyIncome, currency)}</strong>
            </div>
            <div className="legend-row">
              <span><i className="legend-dot legend-expense" />Expenses</span>
              <strong>{formatMoney(month.monthlyExpenses, currency)}</strong>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Top Categories">
        <div className="chart-list">
          {categoryRows.map(({ category, amount }) => (
            <div className="bar-row" key={category.id}>
              <div className="bar-row-header">
                <span>{category.name}</span>
                <strong>{formatMoney(amount, currency)}</strong>
              </div>
              <div className="bar-track">
                <span style={{ width: `${Math.max(6, (amount / maxCategory) * 100)}%` }} />
              </div>
            </div>
          ))}
          {categoryRows.length === 0 ? <Empty text="Add expenses to see category charts." /> : null}
        </div>
      </Panel>

      <Panel title="Daily Spending">
        <div className="daily-bars">
          {dailyRows.map((item) => (
            <div className="daily-bar" key={item.day} title={`${item.day}: ${formatMoney(item.amount, currency)}`}>
              <span style={{ height: `${Math.max(item.amount ? 8 : 2, (item.amount / maxDaily) * 100)}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-slate-500">
          <span>1</span>
          <span>{days}</span>
        </div>
      </Panel>

      <Panel title="Account Balance">
        <div className="chart-list">
          {snapshot.accounts.map((account) => {
            const balance = accountBalance(account, snapshot.transactions);
            const maxBalance = Math.max(...snapshot.accounts.map((item) => Math.abs(accountBalance(item, snapshot.transactions))), 1);
            return (
              <div className="bar-row" key={account.id}>
                <div className="bar-row-header">
                  <span>{account.name}</span>
                  <strong>{formatMoney(balance, currency)}</strong>
                </div>
                <div className="bar-track">
                  <span className={balance < 0 ? "danger-bar" : ""} style={{ width: `${Math.max(6, (Math.abs(balance) / maxBalance) * 100)}%` }} />
                </div>
              </div>
            );
          })}
          {snapshot.accounts.length === 0 ? <Empty text="Create an account to see balances." /> : null}
        </div>
      </Panel>
    </div>
  );
}

function AddView({
  snapshot,
  notify,
  onDone,
}: {
  snapshot: Snapshot;
  notify: (message: string, tone?: Toast["tone"]) => void;
  onDone: () => Promise<void>;
}) {
  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <div>
        <h2 className="page-title"><Plus size={24} /> Add Transaction</h2>
        <p className="text-sm text-slate-500">Record expense, income, or transfer quickly.</p>
      </div>
      <QuickTransaction snapshot={snapshot} notify={notify} onDone={onDone} />
      <SplitExpensePanel snapshot={snapshot} notify={notify} onDone={onDone} />
    </div>
  );
}

function SplitExpensePanel({
  snapshot,
  notify,
  onDone,
}: {
  snapshot: Snapshot;
  notify: (message: string, tone?: Toast["tone"]) => void;
  onDone: () => Promise<void>;
}) {
  const activePeople = snapshot.people.filter((person) => person.active && (person.status === "local" || person.status === "connected"));
  const [personId, setPersonId] = useState(activePeople[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const saveSplit = async () => {
    if (!personId) {
      notify("Add a friend/person before saving a split.", "error");
      return;
    }
    const timestamp = nowIso();
    await db.settlements.put({
      id: createId(),
      ownerProfileId: snapshot.profile?.id,
      personId,
      direction: "to_me",
      originalAmount: Number(amount) || 0,
      repaidAmount: 0,
      date: timestamp,
      note: note || "Split expense",
      createdAt: timestamp,
      updatedAt: timestamp,
      syncState: snapshot.config.syncEnabled ? "queued" : "local",
    });
    setAmount("");
    setNote("");
    notify("Split saved.", "success");
    await onDone();
  };

  return (
    <Panel title="Split Expense" icon={<Users size={18} />}>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <SelectField label="Person" value={personId} onChange={setPersonId}>
          {activePeople.map((person) => (
            <option key={person.id} value={person.id}>
              {person.localDisplayName}
            </option>
          ))}
        </SelectField>
        <input className="field-input" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Share amount" />
        <button className="primary-button" onClick={saveSplit} disabled={!personId || !amount}>
          Save Split
        </button>
      </div>
      <input className="field-input mt-3" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Dinner split, trip, rent..." />
    </Panel>
  );
}

function QuickTransaction({
  snapshot,
  notify,
  onDone,
}: {
  snapshot: Snapshot;
  notify?: (message: string, tone?: Toast["tone"]) => void;
  onDone: () => Promise<void>;
}) {
  const activeAccounts = snapshot.accounts.filter((account) => account.active);
  const expenseCategory = snapshot.categories.find((item) => item.kind === "expense");
  const incomeCategory = snapshot.categories.find((item) => item.kind === "income");
  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(activeAccounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(activeAccounts[1]?.id ?? "");
  const [categoryId, setCategoryId] = useState(expenseCategory?.id ?? "");
  const [note, setNote] = useState("");
  const [receiptName, setReceiptName] = useState("");
  const [receiptData, setReceiptData] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    setCategoryId(type === "income" ? incomeCategory?.id ?? "" : expenseCategory?.id ?? "");
  }, [type, expenseCategory?.id, incomeCategory?.id]);

  useEffect(() => {
    if (!activeAccounts.some((account) => account.id === accountId)) setAccountId(activeAccounts[0]?.id ?? "");
    if (!activeAccounts.some((account) => account.id === toAccountId)) setToAccountId(activeAccounts[1]?.id ?? activeAccounts[0]?.id ?? "");
  }, [activeAccounts, accountId, toAccountId]);

  const save = async () => {
    if (!snapshot.profile?.id) {
      notify?.("Login session is missing. Please login again.", "error");
      return;
    }
    if (type === "transfer" && accountId === toAccountId) {
      notify?.("Choose two different accounts for a transfer.", "error");
      return;
    }
    const numericAmount = Number(amount) || 0;
    let overBudget = false;
    if (type === "expense" && categoryId) {
      const activeBudget = snapshot.budgets.find((budget) => budget.active && budget.categoryId === categoryId);
      const category = snapshot.categories.find((item) => item.id === categoryId);
      if (activeBudget) {
        const usage = budgetUsage(activeBudget, snapshot.transactions);
        const projected = usage.spent + numericAmount;
        if (projected > activeBudget.amount) {
          const overBy = projected - activeBudget.amount;
          const shouldContinue = confirm(
            `${category?.name ?? "This category"} budget will exceed by ${formatMoney(overBy, snapshot.profile?.currency ?? snapshot.config.defaultCurrency)}. Save anyway?`,
          );
          if (!shouldContinue) {
            notify?.("Expense not saved.", "warning");
            return;
          }
          overBudget = true;
        }
      }
    }
    const timestamp = nowIso();
    const transactionDate = `${date}T${new Date().toTimeString().slice(0, 8)}`;
    await db.transactions.put({
      id: createId(),
      ownerProfileId: snapshot.profile?.id,
      type,
      amount: numericAmount,
      accountId,
      toAccountId: type === "transfer" ? toAccountId : undefined,
      categoryId: type === "transfer" ? undefined : categoryId,
      date: transactionDate,
      note,
      receiptName: receiptName || undefined,
      receiptData: receiptData || undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
      syncState: snapshot.config.syncEnabled ? "queued" : "local",
    });
    setAmount("");
    setNote("");
    setReceiptName("");
    setReceiptData("");
    notify?.(overBudget ? "Expense saved over budget." : `${type[0].toUpperCase() + type.slice(1)} saved.`, overBudget ? "warning" : "success");
    await onDone();
  };

  const attachReceipt = (file?: File) => {
    if (!file) return;
    setReceiptName(file.name);
    const reader = new FileReader();
    reader.onload = () => setReceiptData(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <Panel title="Quick Add" icon={<Plus size={18} />}>
      <div className="grid gap-4">
        <div className="segmented-control">
          {(["expense", "income", "transfer"] as TransactionType[]).map((item) => (
            <button className={type === item ? "segment-active" : ""} key={item} onClick={() => setType(item)}>
              {item === "expense" ? <ArrowUpRight size={17} /> : item === "income" ? <ArrowDownLeft size={17} /> : <ArrowRightLeft size={17} />}
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_150px_1fr_1fr_auto]">
          <input className="amount-input" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" />
          <input className="field-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <SelectField label="Account" value={accountId} onChange={setAccountId}>
            {activeAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </SelectField>
        {type === "transfer" ? (
          <SelectField label="To account" value={toAccountId} onChange={setToAccountId}>
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
          </SelectField>
        ) : (
          <SelectField label="Category" value={categoryId} onChange={setCategoryId}>
              {snapshot.categories
                .filter((category) => category.kind === (type === "income" ? "income" : "expense") && category.active)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
          </SelectField>
        )}
          <button className="primary-button" onClick={save} disabled={!amount || !accountId}>
            Save
          </button>
        </div>
        <div className="transaction-extra-grid">
          <label className="grid gap-1">
            <span className="field-label">Note</span>
            <input className="field-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Tea, fuel, rent..." />
          </label>
          <div className="receipt-control">
            <span className="field-label">Receipt</span>
            <label className="secondary-button cursor-pointer">
              <Image size={18} /> {receiptName ? "Change Receipt" : "Add Receipt"}
              <input className="hidden" type="file" accept="image/*" onChange={(event) => attachReceipt(event.target.files?.[0])} />
            </label>
            {receiptData ? <img className="receipt-preview" src={receiptData} alt={receiptName || "Receipt preview"} /> : null}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function DailyView({
  snapshot,
  currency,
  selectedDate,
  setSelectedDate,
}: {
  snapshot: Snapshot;
  currency: string;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
}) {
  const transactions = snapshot.transactions.filter((item) => sameDay(item.date, selectedDate));
  const daySummary = summarize(snapshot.transactions, selectedDate);
  return (
    <div className="grid gap-5">
      <input className="field-input w-full max-w-xs" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Income" value={formatMoney(daySummary.dailyIncome, currency)} />
        <StatCard label="Expenses" value={formatMoney(daySummary.dailyExpenses, currency)} />
        <StatCard label="Net" value={formatMoney(daySummary.dailyIncome - daySummary.dailyExpenses, currency)} />
      </div>
      <Panel title="Transactions">
        <TransactionList snapshot={snapshot} currency={currency} transactions={transactions} />
      </Panel>
    </div>
  );
}

function MonthlyView({ snapshot, currency }: { snapshot: Snapshot; currency: string }) {
  const [typeFilter, setTypeFilter] = useState<"all" | TransactionType>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const filteredTransactions = snapshot.transactions.filter((transaction) => {
    const typeMatch = typeFilter === "all" || transaction.type === typeFilter;
    const categoryMatch = categoryFilter === "all" || transaction.categoryId === categoryFilter;
    const accountMatch = accountFilter === "all" || transaction.accountId === accountFilter || transaction.toAccountId === accountFilter;
    return typeMatch && categoryMatch && accountMatch;
  });
  const summary = summarize(filteredTransactions);
  const spending = categorySpend(snapshot.categories, filteredTransactions);
  const accountRows = snapshot.accounts.map((account) => ({
    account,
    balance: accountBalance(account, filteredTransactions),
  }));

  const downloadReport = () => {
    const escapeCsv = (value: string | number | undefined) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = filteredTransactions.map((transaction) => {
      const account = snapshot.accounts.find((item) => item.id === transaction.accountId);
      const toAccount = snapshot.accounts.find((item) => item.id === transaction.toAccountId);
      const category = snapshot.categories.find((item) => item.id === transaction.categoryId);
      return [
        transaction.date,
        transaction.type,
        transaction.amount,
        account?.name,
        toAccount?.name,
        category?.name,
        transaction.note,
        transaction.receiptName,
      ].map(escapeCsv).join(",");
    });
    const csv = ["Date,Type,Amount,Account,To Account,Category,Note,Receipt", ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${snapshot.config.appName.toLowerCase()}-report.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Income" value={formatMoney(summary.monthlyIncome, currency)} />
        <StatCard label="Expenses" value={formatMoney(summary.monthlyExpenses, currency)} />
        <StatCard label="Savings" value={formatMoney(summary.monthlySavings, currency)} />
      </div>
      <Panel title="Report Filters" icon={<SlidersHorizontal size={18} />}>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
          <SelectField label="Type" value={typeFilter} onChange={(value) => setTypeFilter(value as "all" | TransactionType)}>
            <option value="all">All types</option>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
          </SelectField>
          <SelectField label="Category" value={categoryFilter} onChange={setCategoryFilter}>
            <option value="all">All categories</option>
            {snapshot.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Account" value={accountFilter} onChange={setAccountFilter}>
            <option value="all">All accounts</option>
            {snapshot.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </SelectField>
          <button className="primary-button" onClick={downloadReport} disabled={filteredTransactions.length === 0}>
            <Download size={18} /> Download
          </button>
        </div>
      </Panel>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Category Spending" icon={<BarChart3 size={18} />}>
          <div className="grid gap-2">
            {spending.map(({ category, amount }) => (
              <div className="row" key={category.id}>
                <span>{category.name}</span>
                <strong>{formatMoney(amount, currency)}</strong>
              </div>
            ))}
            {spending.length === 0 ? <Empty text="No spending this month." /> : null}
          </div>
        </Panel>
        <Panel title="Account Usage" icon={<WalletCards size={18} />}>
          <div className="chart-list">
            {accountRows.map(({ account, balance }) => {
              const maxBalance = Math.max(...accountRows.map((item) => Math.abs(item.balance)), 1);
              return (
                <div className="bar-row" key={account.id}>
                  <div className="bar-row-header">
                    <span>{account.name}</span>
                    <strong>{formatMoney(balance, currency)}</strong>
                  </div>
                  <div className="bar-track">
                    <span className={balance < 0 ? "danger-bar" : ""} style={{ width: `${Math.max(6, (Math.abs(balance) / maxBalance) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Budgets" icon={<WalletCards size={18} />}>
          <div className="grid gap-3">
            {snapshot.budgets
              .filter((budget) => budget.active)
              .map((budget) => {
                const category = snapshot.categories.find((item) => item.id === budget.categoryId);
                const usage = budgetUsage(budget, snapshot.transactions);
                return (
                  <div key={budget.id}>
                    <div className="row">
                      <span>{category?.name ?? "Category"}</span>
                      <strong>{formatMoney(usage.remaining, currency)} left</strong>
                    </div>
                    <div className="progress">
                      <span className={usage.remaining < 0 ? "danger-bar" : ""} style={{ width: `${Math.min(100, usage.percentage)}%` }} />
                    </div>
                  </div>
                );
              })}
            {snapshot.budgets.length === 0 ? <Empty text="Create budgets in Manage." /> : null}
          </div>
        </Panel>
        <Panel title="Transactions" icon={<Download size={18} />}>
          <TransactionList snapshot={snapshot} currency={currency} transactions={filteredTransactions.slice().reverse()} />
        </Panel>
      </div>
    </div>
  );
}

function CalendarView({
  snapshot,
  currency,
  selectedDate,
  setSelectedDate,
}: {
  snapshot: Snapshot;
  currency: string;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
}) {
  const start = new Date(`${selectedDate.slice(0, 7)}-01T00:00:00`);
  const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const dates = Array.from({ length: days }, (_, index) => `${selectedDate.slice(0, 7)}-${String(index + 1).padStart(2, "0")}`);
  return (
    <div className="grid gap-5">
      <input className="field-input w-full max-w-xs" type="month" value={selectedDate.slice(0, 7)} onChange={(event) => setSelectedDate(`${event.target.value}-01`)} />
      <div className="calendar-grid">
        {dates.map((date) => {
          const dailyTransactions = snapshot.transactions.filter((item) => sameDay(item.date, date));
          const dailySpend = dailyTransactions
            .filter((item) => item.type === "expense")
            .reduce((sum, item) => sum + item.amount, 0);
          const dailyIncome = dailyTransactions
            .filter((item) => item.type === "income")
            .reduce((sum, item) => sum + item.amount, 0);
          const calendarTone = dailySpend && dailyIncome ? "calendar-day-mixed" : dailyIncome ? "calendar-day-income" : dailySpend ? "calendar-day-expense" : "";
          return (
            <button className={`calendar-day ${calendarTone} ${date === selectedDate ? "calendar-day-active" : ""}`} key={date} onClick={() => setSelectedDate(date)}>
              <span>{Number(date.slice(-2))}</span>
              <strong>{dailySpend ? `-${formatMoney(dailySpend, currency)}` : dailyIncome ? `+${formatMoney(dailyIncome, currency)}` : ""}</strong>
            </button>
          );
        })}
      </div>
      <Panel title={formatDate(selectedDate)}>
        <TransactionList snapshot={snapshot} currency={currency} transactions={snapshot.transactions.filter((item) => sameDay(item.date, selectedDate))} />
      </Panel>
    </div>
  );
}

function PeopleView({
  snapshot,
  currency,
  notify,
  onDone,
}: {
  snapshot: Snapshot;
  currency: string;
  notify: (message: string, tone?: Toast["tone"]) => void;
  onDone: () => Promise<void>;
}) {
  const activePeople = snapshot.people.filter((person) => person.active && (person.status === "local" || person.status === "connected"));
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [verifiedFriend, setVerifiedFriend] = useState<{ displayName: string; connectionCode: string } | null>(null);
  const [personId, setPersonId] = useState(activePeople[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"to_me" | "by_me">("to_me");
  const [note, setNote] = useState("");
  const openSettlements = snapshot.settlements.filter((settlement) => !settlement.deletedAt && settlement.repaidAmount < settlement.originalAmount);
  const [repaymentSettlementId, setRepaymentSettlementId] = useState(openSettlements[0]?.id ?? "");
  const [repaymentAmount, setRepaymentAmount] = useState("");
  const [repaymentNote, setRepaymentNote] = useState("");
  const [friendConfirm, setFriendConfirm] = useState<{ type: "block" | "remove"; person: Person; linked?: boolean } | null>(null);

  useEffect(() => {
    if (!snapshot.profile?.connectedUserId || !getServerToken()) return;
    syncServerFriendsToLocal(snapshot.profile)
      .then(onDone)
      .catch(() => undefined);
  }, [snapshot.profile?.connectedUserId]);

  useEffect(() => {
    if (!activePeople.some((person) => person.id === personId)) setPersonId(activePeople[0]?.id ?? "");
  }, [activePeople, personId]);

  useEffect(() => {
    if (!openSettlements.some((settlement) => settlement.id === repaymentSettlementId)) setRepaymentSettlementId(openSettlements[0]?.id ?? "");
  }, [openSettlements, repaymentSettlementId]);

  const verifyFriendCode = async () => {
    const normalizedInviteCode = inviteCode.trim().toUpperCase();
    if (!normalizedInviteCode) {
      notify("Enter a connection code.", "error");
      return;
    }
    if (!getServerToken() || !snapshot.profile?.connectedUserId) {
      notify("Sync this profile to the server before sending friend requests.", "warning");
      return;
    }
    try {
      const friend = await verifyServerFriend(normalizedInviteCode);
      setVerifiedFriend({ displayName: friend.displayName, connectionCode: friend.connectionCode });
      setName(friend.displayName);
      notify(`Found ${friend.displayName}. Confirm to send request.`, "success");
    } catch (error) {
      setVerifiedFriend(null);
      notify(error instanceof Error ? error.message : "Friend code could not be verified.", "error");
    }
  };

  const addPerson = async () => {
    if (!name.trim()) {
      notify("Enter a friend name.", "error");
      return;
    }
    if (
      snapshot.people.some(
        (person) => person.active && person.localDisplayName.toLowerCase() === name.trim().toLowerCase(),
      )
    ) {
      notify("This friend already exists.", "error");
      return;
    }
    const timestamp = nowIso();
    const personId = createId();
    const normalizedInviteCode = inviteCode.trim().toUpperCase();
    if (normalizedInviteCode && verifiedFriend?.connectionCode !== normalizedInviteCode) {
      notify("Verify the connection code before sending the request.", "warning");
      return;
    }
    const person: Person = {
      id: personId,
      ownerProfileId: snapshot.profile?.id,
      localDisplayName: verifiedFriend?.displayName || name.trim(),
      inviteCode: normalizedInviteCode || undefined,
      connectedUserId: normalizedInviteCode || undefined,
      status: normalizedInviteCode ? "requested" : "local",
      requestDirection: normalizedInviteCode ? "outgoing" : undefined,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      syncState: snapshot.config.syncEnabled ? "queued" : "local",
    };
    await db.people.put(person);
    if (getServerToken() && snapshot.profile?.connectedUserId && normalizedInviteCode) {
      try {
        const friend = await requestServerFriend(normalizedInviteCode, personId);
        await db.people.update(personId, {
          localDisplayName: friend.friend.display_name || person.localDisplayName,
          connectedUserId: friend.friend.connection_code,
          friendUserId: friend.friend.id,
          status: "requested",
          verified: false,
          requestDirection: "outgoing",
          syncState: "synced",
          updatedAt: nowIso(),
        });
      } catch (error) {
        notify(error instanceof Error ? error.message : "Friend cloud connection failed.", "warning");
      }
    }
    setName("");
    setInviteCode("");
    setVerifiedFriend(null);
    notify(normalizedInviteCode ? "Friend request sent. Waiting for acceptance." : "Local person added.", "success");
    await onDone();
  };

  const addSettlement = async () => {
    if (!personId) {
      notify("Choose a friend first.", "error");
      return;
    }
    if (!Number(amount)) {
      notify("Enter a valid amount.", "error");
      return;
    }
    const timestamp = nowIso();
    const settlement: Settlement = {
      id: createId(),
      ownerProfileId: snapshot.profile?.id,
      personId,
      direction,
      originalAmount: Number(amount) || 0,
      repaidAmount: 0,
      date: timestamp,
      note,
      createdAt: timestamp,
      updatedAt: timestamp,
      syncState: snapshot.config.syncEnabled ? "queued" : "local",
    };
    await db.settlements.put(settlement);
    setAmount("");
    setNote("");
    notify("Owe/owed entry recorded.", "success");
    await onDone();
  };

  const addRepayment = async () => {
    const settlement = snapshot.settlements.find((item) => item.id === repaymentSettlementId);
    if (!settlement) {
      notify("Choose an owe/owed record.", "error");
      return;
    }
    const numericAmount = Number(repaymentAmount) || 0;
    const remaining = settlement.originalAmount - settlement.repaidAmount;
    if (!numericAmount || numericAmount > remaining) {
      notify(`Enter a returned amount up to ${formatMoney(remaining, currency)}.`, "error");
      return;
    }
    const timestamp = nowIso();
    const repayment: Repayment = {
      id: createId(),
      ownerProfileId: snapshot.profile?.id,
      settlementId: settlement.id,
      personId: settlement.personId,
      amount: numericAmount,
      date: timestamp,
      note: repaymentNote || "Returned money",
      createdAt: timestamp,
      updatedAt: timestamp,
      syncState: snapshot.config.syncEnabled ? "queued" : "local",
    };
    const totalRepaid = settlement.repaidAmount + numericAmount;
    await db.transaction("rw", db.settlements, db.repayments, async () => {
      await db.repayments.put(repayment);
      await db.settlements.update(settlement.id, {
        repaidAmount: totalRepaid,
        updatedAt: timestamp,
        syncState: snapshot.config.syncEnabled ? "queued" : "local",
      });
    });
    setRepaymentAmount("");
    setRepaymentNote("");
    notify("Returned money recorded.", "success");
    await onDone();
  };

  const updatePerson = async (person: Person, patch: Partial<Person>) => {
    await db.people.update(person.id, { ...patch, updatedAt: nowIso() });
    notify("Friend updated.", "success");
    await onDone();
  };

  const respondFriend = async (person: Person, action: "accept" | "reject") => {
    if (!person.friendUserId) return;
    try {
      const result = await respondServerFriend(person.friendUserId, action);
      await db.people.update(person.id, {
        status: result.status === "connected" ? "connected" : "blocked",
        verified: result.status === "connected",
        active: result.status === "connected",
        requestDirection: undefined,
        updatedAt: nowIso(),
        syncState: "synced",
      });
      notify(action === "accept" ? "Friend request accepted." : "Friend request rejected.", action === "accept" ? "success" : "warning");
      await onDone();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not update friend request.", "error");
    }
  };

  const removeOrHidePerson = async (person: Person) => {
    const linked =
      snapshot.settlements.some((settlement) => settlement.personId === person.id) ||
      snapshot.transactions.some((transaction) => transaction.personIds?.includes(person.id));
    await db.people.update(person.id, {
      active: false,
      deletedAt: linked ? undefined : nowIso(),
      updatedAt: nowIso(),
      syncState: snapshot.config.syncEnabled ? "queued" : "local",
    });
    notify(linked ? "Friend hidden because existing records use it." : "Friend removed.", "warning");
    await onDone();
  };

  const confirmFriendAction = async () => {
    if (!friendConfirm) return;
    const current = friendConfirm;
    setFriendConfirm(null);
    if (current.type === "block") {
      if (current.person.friendUserId && getServerToken()) {
        try {
          await blockServerFriend(current.person.friendUserId);
        } catch (error) {
          notify(error instanceof Error ? error.message : "Could not block this friend on server.", "error");
          return;
        }
      }
      await updatePerson(current.person, { status: "blocked", active: false, verified: false, syncState: "synced" });
      return;
    }
    await removeOrHidePerson(current.person);
  };

  return (
    <div className="grid gap-5">
      <Panel title="Friends List">
        <div className="grid gap-3">
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <input className="field-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Friend name" />
            <input
              className="field-input"
              value={inviteCode}
              onChange={(event) => {
                setInviteCode(event.target.value.toUpperCase());
                setVerifiedFriend(null);
              }}
              placeholder="Connection code optional"
            />
            {inviteCode.trim() ? (
              <button className="secondary-button" onClick={verifyFriendCode}>
                Verify
              </button>
            ) : (
              <button className="primary-button" onClick={addPerson} disabled={!name.trim()}>
                <UserPlus size={18} /> Add
              </button>
            )}
          </div>
          {verifiedFriend ? (
            <div className="verified-friend-banner">
              <span>Verified user</span>
              <strong>{verifiedFriend.displayName}</strong>
              <button className="primary-button" onClick={addPerson}>
                <UserPlus size={18} /> Send Request
              </button>
            </div>
          ) : null}
          {inviteCode.trim() && !verifiedFriend ? (
            <button className="primary-button" onClick={addPerson} disabled>
              <UserPlus size={18} /> Verify First
            </button>
          ) : null}
          <div className="friends-grid">
            {snapshot.people.length === 0 ? <Empty text="No friends added yet." /> : null}
            {snapshot.people.map((person) => {
              const balance = personBalance(person, snapshot.settlements);
              const linked = snapshot.settlements.some((settlement) => settlement.personId === person.id);
              return (
                <div className="friend-card" key={person.id}>
                  <div className="friend-card-main">
                    <div>
                      <strong className="inline-flex items-center gap-1">
                        {person.verified || person.status === "connected" ? <Star className="verified-star" size={15} fill="currentColor" /> : null}
                        {person.localDisplayName}
                      </strong>
                      <p>{person.inviteCode ? person.inviteCode : "Local person"}</p>
                    </div>
                    <span className={`status-pill status-${person.status || "local"}`}>{person.active ? person.status || "local" : "hidden"}</span>
                  </div>
                  <div className="friend-balance">
                    <span>{balance >= 0 ? "Owed to you" : "You owe"}</span>
                    <strong>{formatMoney(Math.abs(balance), currency)}</strong>
                  </div>
                  <div className="friend-actions">
                    {person.status === "requested" ? <span className="status-hint">Waiting for acceptance</span> : null}
                    {person.status === "pending" && person.requestDirection === "incoming" ? (
                      <>
                        <button className="small-button" onClick={() => respondFriend(person, "accept")}>Accept</button>
                        <button className="small-button danger-button" onClick={() => respondFriend(person, "reject")}>Reject</button>
                      </>
                    ) : null}
                    {person.status !== "blocked" ? (
                      <button className="small-button" onClick={() => setFriendConfirm({ type: "block", person })}>Block</button>
                    ) : null}
                    <button className="small-button danger-button" onClick={() => setFriendConfirm({ type: "remove", person, linked })}>
                      <Trash2 size={15} /> {linked ? "Hide" : "Remove"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Panel>
      {friendConfirm ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="confirm-dialog">
            <div>
              <strong>{friendConfirm.type === "block" ? "Block Friend" : friendConfirm.linked ? "Hide Friend" : "Remove Friend"}</strong>
              <p>
                {friendConfirm.type === "block"
                  ? `Block ${friendConfirm.person.localDisplayName}? Shared updates from this friend will stop.`
                  : `${friendConfirm.linked ? "Hide" : "Remove"} ${friendConfirm.person.localDisplayName}?`}
              </p>
            </div>
            <div className="confirm-actions">
              <button className="secondary-button" onClick={() => setFriendConfirm(null)}>Cancel</button>
              <button className="primary-button danger-action" onClick={confirmFriendAction}>
                {friendConfirm.type === "block" ? "Block" : friendConfirm.linked ? "Hide" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <Panel title="Owe / Owed">
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
            <SelectField label="Friend" value={personId} onChange={setPersonId}>
              {activePeople.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.localDisplayName}
                </option>
              ))}
            </SelectField>
            <SelectField label="Type" value={direction} onChange={(value) => setDirection(value as "to_me" | "by_me")}>
              <option value="to_me">They owe me</option>
              <option value="by_me">I owe them</option>
            </SelectField>
            <input className="field-input" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" />
            <input className="field-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Note" />
          </div>
          <button className="primary-button" onClick={addSettlement} disabled={!personId || !amount}>
            Record Owe / Owed
          </button>
          <div className="grid gap-2">
            {snapshot.settlements.slice(-8).reverse().map((settlement) => {
              const person = snapshot.people.find((item) => item.id === settlement.personId);
              return (
                <div className="manage-row" key={settlement.id}>
                  <div>
                    <strong>{person?.localDisplayName ?? "Friend"}</strong>
                    <p>{settlement.direction === "to_me" ? "They owe me" : "I owe them"} · {settlement.note || "No note"}</p>
                  </div>
                  <strong>{formatMoney(settlement.originalAmount - settlement.repaidAmount, currency)}</strong>
                </div>
              );
            })}
            {snapshot.settlements.length === 0 ? <Empty text="No owe/owed records yet." /> : null}
          </div>
        </div>
      </Panel>
      <Panel title="Returned Money" icon={<RefreshCw size={18} />}>
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-[1fr_140px_1fr_auto]">
            <SelectField label="Open record" value={repaymentSettlementId} onChange={setRepaymentSettlementId}>
              {openSettlements.map((settlement) => {
                const person = snapshot.people.find((item) => item.id === settlement.personId);
                const remaining = settlement.originalAmount - settlement.repaidAmount;
                return (
                  <option key={settlement.id} value={settlement.id}>
                    {person?.localDisplayName ?? "Friend"} - {formatMoney(remaining, currency)}
                  </option>
                );
              })}
            </SelectField>
            <input className="field-input" type="number" value={repaymentAmount} onChange={(event) => setRepaymentAmount(event.target.value)} placeholder="Returned" />
            <input className="field-input" value={repaymentNote} onChange={(event) => setRepaymentNote(event.target.value)} placeholder="Cash returned, UPI paid..." />
            <button className="primary-button" onClick={addRepayment} disabled={!repaymentSettlementId || !repaymentAmount}>
              Update
            </button>
          </div>
          <div className="history-table">
            <div className="history-row history-head">
              <span>Date</span>
              <span>Description</span>
              <span>Owed</span>
              <span>Returned</span>
              <span>Remaining</span>
            </div>
            {snapshot.settlements.slice().reverse().map((settlement) => {
              const person = snapshot.people.find((item) => item.id === settlement.personId);
              const repayments = snapshot.repayments.filter((repayment) => repayment.settlementId === settlement.id && !repayment.deletedAt);
              const rows = [
                {
                  id: settlement.id,
                  date: settlement.date,
                  description: `${person?.localDisplayName ?? "Friend"} - ${settlement.note || (settlement.direction === "to_me" ? "They owe me" : "I owe them")}`,
                  owed: settlement.originalAmount,
                  returned: 0,
                  remaining: settlement.originalAmount - settlement.repaidAmount,
                },
                ...repayments.map((repayment) => ({
                  id: repayment.id,
                  date: repayment.date,
                  description: repayment.note,
                  owed: 0,
                  returned: repayment.amount,
                  remaining: Math.max(0, settlement.originalAmount - repayments
                    .filter((item) => item.date <= repayment.date)
                    .reduce((sum, item) => sum + item.amount, 0)),
                })),
              ];
              return rows.map((row) => (
                <div className="history-row" key={row.id}>
                  <span>{formatDate(row.date)}</span>
                  <span>{row.description}</span>
                  <strong>{row.owed ? formatMoney(row.owed, currency) : "-"}</strong>
                  <strong>{row.returned ? formatMoney(row.returned, currency) : "-"}</strong>
                  <strong>{formatMoney(row.remaining, currency)}</strong>
                </div>
              ));
            })}
            {snapshot.settlements.length === 0 ? <Empty text="No owe/owed history yet." /> : null}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function ManageView({ snapshot, notify, onDone }: { snapshot: Snapshot; notify: (message: string, tone?: Toast["tone"]) => void; onDone: () => Promise<void> }) {
  const [categoryName, setCategoryName] = useState("");
  const [categoryKind, setCategoryKind] = useState<"expense" | "income">("expense");
  const [budgetCategoryId, setBudgetCategoryId] = useState(snapshot.categories.find((item) => item.kind === "expense")?.id ?? "");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountOpening, setAccountOpening] = useState("");
  const currency = snapshot.profile?.currency ?? snapshot.config.defaultCurrency;

  useEffect(() => {
    if (!budgetCategoryId) setBudgetCategoryId(snapshot.categories.find((item) => item.kind === "expense" && item.active)?.id ?? "");
  }, [budgetCategoryId, snapshot.categories]);

  const addCategory = async () => {
    const trimmedName = categoryName.trim();
    if (!trimmedName) {
      notify("Enter a category name.", "error");
      return;
    }
    if (snapshot.categories.some((category) => category.name.toLowerCase() === trimmedName.toLowerCase() && category.kind === categoryKind)) {
      notify("That category already exists.", "error");
      return;
    }
    const timestamp = nowIso();
    await db.categories.put({
      id: createId(),
      ownerProfileId: snapshot.profile?.id,
      name: trimmedName,
      kind: categoryKind,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      syncState: snapshot.config.syncEnabled ? "queued" : "local",
    });
    setCategoryName("");
    notify("Category added.", "success");
    await onDone();
  };

  const addAccount = async () => {
    const trimmedName = accountName.trim();
    if (!snapshot.profile?.id) return;
    if (!trimmedName) {
      notify("Enter an account name.", "error");
      return;
    }
    if (snapshot.accounts.some((account) => account.name.toLowerCase() === trimmedName.toLowerCase())) {
      notify("That account already exists.", "error");
      return;
    }
    const timestamp = nowIso();
    await db.accounts.put({
      id: createId(),
      ownerProfileId: snapshot.profile.id,
      name: trimmedName,
      openingBalance: Number(accountOpening) || 0,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      syncState: snapshot.config.syncEnabled ? "queued" : "local",
    });
    setAccountName("");
    setAccountOpening("");
    notify("Account added.", "success");
    await onDone();
  };

  const archiveAccount = async (account: Account) => {
    const linked = snapshot.transactions.some((item) => item.accountId === account.id || item.toAccountId === account.id);
    await db.accounts.update(account.id, {
      active: false,
      deletedAt: linked ? undefined : nowIso(),
      updatedAt: nowIso(),
      syncState: snapshot.config.syncEnabled ? "queued" : "local",
    });
    notify(linked ? "Account hidden from active use." : "Account removed.", "warning");
    await onDone();
  };

  const archiveCategory = async (category: Category) => {
    const linked = snapshot.transactions.some((item) => item.categoryId === category.id) || snapshot.budgets.some((item) => item.categoryId === category.id);
    await db.categories.update(category.id, {
      active: false,
      deletedAt: linked ? undefined : nowIso(),
      updatedAt: nowIso(),
      syncState: snapshot.config.syncEnabled ? "queued" : "local",
    });
    notify(linked ? "Category hidden because existing records use it." : "Category removed.", "warning");
    await onDone();
  };

  const addBudget = async () => {
    if (!budgetCategoryId || !Number(budgetAmount)) {
      notify("Choose category and enter budget amount.", "error");
      return;
    }
    const timestamp = nowIso();
    const existing = snapshot.budgets.find((budget) => budget.categoryId === budgetCategoryId && budget.active);
    if (existing) {
      await db.budgets.update(existing.id, {
        amount: Number(budgetAmount) || 0,
        updatedAt: timestamp,
        syncState: snapshot.config.syncEnabled ? "queued" : "local",
      });
      setBudgetAmount("");
      notify("Budget updated.", "success");
      await onDone();
      return;
    }
    await db.budgets.put({
      id: createId(),
      ownerProfileId: snapshot.profile?.id,
      categoryId: budgetCategoryId,
      amount: Number(budgetAmount) || 0,
      period: "monthly",
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      syncState: snapshot.config.syncEnabled ? "queued" : "local",
    });
    setBudgetAmount("");
    notify("Budget added.", "success");
    await onDone();
  };

  return (
    <div className="grid gap-5">
      <Panel title="Accounts">
        <div className="grid gap-3">
          <div className="grid gap-2 md:grid-cols-[1fr_140px_auto]">
            <input className="field-input" value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Cash, Bank, UPI wallet" />
            <input className="field-input" type="number" value={accountOpening} onChange={(event) => setAccountOpening(event.target.value)} placeholder="Opening" />
            <button className="primary-button" onClick={addAccount} disabled={!accountName.trim()}>
              <Plus size={18} /> Add
            </button>
          </div>
          <div className="manage-list">
            {snapshot.accounts.map((account) => {
              const linked = snapshot.transactions.some((item) => item.accountId === account.id || item.toAccountId === account.id);
              return (
                <div className="manage-row" key={account.id}>
                  <div>
                    <strong>{account.name}</strong>
                    <p>{account.active ? "Active" : "Hidden"} · Opening {formatMoney(account.openingBalance, currency)}</p>
                  </div>
                  {account.active ? (
                    <button className="small-button" onClick={() => archiveAccount(account)}>
                      {linked ? "Hide" : "Remove"}
                    </button>
                  ) : <span className="status-pill status-blocked">Hidden</span>}
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      <Panel title="Categories">
        <div className="grid gap-3">
          <div className="grid gap-2 md:grid-cols-[1fr_150px_auto]">
            <input className="field-input" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Category name" />
            <SelectField label="Type" value={categoryKind} onChange={(value) => setCategoryKind(value as "expense" | "income")}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </SelectField>
            <button className="primary-button" onClick={addCategory} disabled={!categoryName.trim()}>
              <Plus size={18} /> Add
            </button>
          </div>
          <div className="manage-list">
            {snapshot.categories.map((category) => (
              <div className="manage-row" key={category.id}>
                <div>
                  <strong>{category.name}</strong>
                  <p>{category.active ? "Active" : "Hidden"} · {category.kind}</p>
                </div>
                {category.active ? (
                  <button className="small-button" onClick={() => archiveCategory(category)}>
                    {snapshot.transactions.some((item) => item.categoryId === category.id) ? "Hide" : "Remove"}
                  </button>
                ) : <span className="status-pill status-blocked">Hidden</span>}
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="Budgets">
        <div className="grid gap-3">
          <div className="grid gap-2 md:grid-cols-[1fr_160px_auto]">
            <SelectField label="Category" value={budgetCategoryId} onChange={setBudgetCategoryId}>
              {snapshot.categories
                .filter((category) => category.kind === "expense" && category.active)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </SelectField>
            <input className="field-input" type="number" value={budgetAmount} onChange={(event) => setBudgetAmount(event.target.value)} placeholder="Monthly" />
            <button className="primary-button" onClick={addBudget} disabled={!budgetCategoryId || !budgetAmount}>
              Save
            </button>
          </div>
          <div className="grid gap-3">
            {snapshot.budgets.filter((budget) => budget.active).map((budget) => {
              const category = snapshot.categories.find((item) => item.id === budget.categoryId);
              const usage = budgetUsage(budget, snapshot.transactions);
              return (
                <div className="budget-card" key={budget.id}>
                  <div className="bar-row-header">
                    <span>{category?.name ?? "Category"}</span>
                    <strong>{formatMoney(usage.remaining, currency)} left</strong>
                  </div>
                  <div className="progress">
                    <span className={usage.remaining < 0 ? "danger-bar" : ""} style={{ width: `${Math.min(100, usage.percentage)}%` }} />
                  </div>
                  <p>{formatMoney(usage.spent, currency)} spent of {formatMoney(budget.amount, currency)}</p>
                </div>
              );
            })}
            {snapshot.budgets.filter((budget) => budget.active).length === 0 ? <Empty text="No budgets created yet." /> : null}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function SettingsView({
  snapshot,
  notify,
  onDone,
  onLogout,
  onNavigate,
}: {
  snapshot: Snapshot;
  notify: (message: string, tone?: Toast["tone"]) => void;
  onDone: () => Promise<void>;
  onLogout: () => void;
  onNavigate: (view: View) => void;
}) {
  const [groqApiKey, setGroqApiKey] = useState(snapshot.config.groqApiKey ?? "");
  const [aiModel, setAiModel] = useState(snapshot.config.aiModel);
  const savedLocalEmail = snapshot.profile?.loginId.startsWith("local:") ? snapshot.profile.loginId.slice("local:".length) : "";
  const [syncEmail, setSyncEmail] = useState(savedLocalEmail);
  const [syncPassword, setSyncPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const exportData = async () => {
    const { groqApiKey: _groqApiKey, ...exportableConfig } = snapshot.config;
    const payload: ImportPayload = {
      exportedAt: nowIso(),
      app: snapshot.config.appName,
      profile: snapshot.profile,
      accounts: snapshot.accounts,
      categories: snapshot.categories,
      transactions: snapshot.transactions,
      budgets: snapshot.budgets,
      recurringTransactions: snapshot.recurring,
      people: snapshot.people,
      settlements: snapshot.settlements,
      repayments: snapshot.repayments,
      config: exportableConfig,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${snapshot.config.appName.toLowerCase()}-export.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const importData = async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      notify("Import file is too large. Maximum size is 5 MB.", "error");
      return;
    }
    let payload: ImportPayload;
    try {
      payload = JSON.parse(await file.text()) as ImportPayload;
    } catch {
      notify("Import file is not valid JSON.", "error");
      return;
    }
    if (!payload.accounts || !payload.transactions || !payload.categories) {
      notify("Import file is not valid.", "error");
      return;
    }
    const duplicateIds = payload.transactions.filter((item) => snapshot.transactions.some((existing) => existing.id === item.id)).length;
    const shouldImport = confirm(`Import ${payload.transactions.length} transactions and ${payload.accounts.length} accounts? Duplicate transactions: ${duplicateIds}. Existing data will be merged.`);
    if (!shouldImport) return;
    await db.transaction(
      "rw",
      [db.accounts, db.categories, db.transactions, db.budgets, db.recurringTransactions, db.people, db.settlements, db.repayments],
      async () => {
        await db.accounts.bulkPut(payload.accounts);
        await db.categories.bulkPut(payload.categories);
        await db.transactions.bulkPut(payload.transactions);
        await db.budgets.bulkPut(payload.budgets ?? []);
        await db.recurringTransactions.bulkPut(payload.recurringTransactions ?? []);
        await db.people.bulkPut(payload.people ?? []);
        await db.settlements.bulkPut(payload.settlements ?? []);
        await db.repayments.bulkPut(payload.repayments ?? []);
      },
    );
    notify("Import completed.", "success");
    await onDone();
  };

  const updateConfigToggle = async (key: "syncEnabled" | "aiEnabled", value: boolean) => {
    if (key === "syncEnabled" && value && (!snapshot.profile?.connectedUserId || !getServerToken())) {
      notify("Create or login to a server account before enabling sync.", "warning");
      return;
    }
    await db.appConfig.update("primary", { [key]: value, updatedAt: nowIso() });
    notify(`${key === "aiEnabled" ? "AI Chat" : "Sync"} ${value ? "enabled" : "disabled"}.`, "success");
    await onDone();
  };

  const saveAiConfig = async () => {
    await db.appConfig.update("primary", { groqApiKey, aiModel, aiEnabled: Boolean(groqApiKey), updatedAt: nowIso() });
    notify("AI settings saved.", "success");
    await onDone();
  };

  const connectProfile = async () => {
    if (!snapshot.profile) return;
    const timestamp = nowIso();
    const connectionCode = snapshot.profile.connectionCode || createConnectionCode();
    const isLocalProfile = snapshot.profile.loginId === "local-device" || snapshot.profile.loginId.startsWith("local:");
    const normalizedEmail = (syncEmail || savedLocalEmail).trim().toLowerCase();
    if (isLocalProfile) {
      if (!isValidEmail(normalizedEmail)) {
        notify("Enter a valid email to create the account.", "error");
        return;
      }
      if (syncPassword.length < 8) {
        notify("Password must be at least 8 characters.", "error");
        return;
      }
      const existing = await db.profiles.where("loginId").equals(normalizedEmail).first();
      if (existing && existing.id !== snapshot.profile.id) {
        notify("An account already exists for this email.", "error");
        return;
      }
    }
    if (syncPassword.length < 8) {
      notify("Enter a cloud password with at least 8 characters.", "error");
      return;
    }
    const syncPasswordHash = isLocalProfile ? await hashPassword(syncPassword) : snapshot.profile.passwordHash;
    const cloudEmail = isLocalProfile ? normalizedEmail : snapshot.profile.loginId;
    const updatedProfile: Profile = {
      ...snapshot.profile,
      connectedUserId: snapshot.profile.connectedUserId,
      connectionCode,
      loginId: cloudEmail,
      passwordHash: syncPasswordHash,
      displayName: isLocalProfile ? normalizedEmail.split("@")[0] : snapshot.profile.displayName,
      updatedAt: timestamp,
      syncState: "queued",
    };
    let connectedUserId = snapshot.profile.connectedUserId;
    try {
      if (!getServerToken()) {
        try {
          await registerServerAccount(cloudEmail, syncPassword, updatedProfile.displayName, updatedProfile.currency);
          notify("Verification email sent. Verify your account, login, then tap Sync To Server again.", "success");
          return;
        } catch (error) {
          if (!(error instanceof ApiClientError) || error.status !== 409) throw error;
        }
        const { user } = await loginServerAccount(cloudEmail, syncPassword);
        connectedUserId = user.id;
        updatedProfile.connectedUserId = user.id;
        updatedProfile.connectionCode = user.connectionCode;
        updatedProfile.displayName = user.displayName;
        updatedProfile.currency = user.currency;
      }
      await pushServerSnapshot({ ...snapshot, profile: updatedProfile });
      await pullServerSnapshot(snapshot.profile.id);
      await syncServerFriendsToLocal({ ...updatedProfile, connectedUserId });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Account could not be synced.", error instanceof Error && error.message.toLowerCase().includes("verify") ? "warning" : "error");
      return;
    }
    await db.transaction(
      "rw",
      [db.profiles, db.accounts, db.categories, db.transactions, db.budgets, db.recurringTransactions, db.people, db.settlements, db.repayments, db.appConfig],
      async () => {
        await db.profiles.update(snapshot.profile!.id, {
          connectedUserId,
          connectionCode: updatedProfile.connectionCode,
          loginId: isLocalProfile ? normalizedEmail : snapshot.profile!.loginId,
          passwordHash: syncPasswordHash,
          displayName: updatedProfile.displayName,
          currency: updatedProfile.currency,
          updatedAt: timestamp,
          syncState: "synced",
        });
        await db.appConfig.update("primary", { syncEnabled: true, updatedAt: timestamp });
      },
    );
    setSyncEmail("");
    setSyncPassword("");
    notify(isLocalProfile ? "Account connected and local data synced." : "Latest local data synced.", "success");
    await onDone();
  };

  const changePassword = async () => {
    if (!snapshot.profile) return;
    if ((await hashPassword(currentPassword)) !== snapshot.profile.passwordHash) {
      notify("Current password is incorrect.", "error");
      return;
    }
    if (newPassword.length < 8) {
      notify("New password must be at least 8 characters.", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      notify("New password and confirmation do not match.", "error");
      return;
    }
    await db.profiles.update(snapshot.profile.id, { passwordHash: await hashPassword(newPassword), updatedAt: nowIso() });
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    notify("Password changed.", "success");
    await onDone();
  };

  const toggleDarkMode = async () => {
    const themeMode = snapshot.config.themeMode === "dark" ? "light" : "dark";
    await db.appConfig.update("primary", { themeMode, updatedAt: nowIso() });
    notify(`${themeMode === "dark" ? "Dark" : "Light"} mode enabled.`, "success");
    await onDone();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Profile">
        <div className="grid gap-2 text-sm">
          <div className="row">
            <span>Name</span>
            <strong>{snapshot.profile?.displayName}</strong>
          </div>
          <div className="row">
            <span>Email</span>
            <strong>{snapshot.profile?.loginId.startsWith("local:") ? snapshot.profile.loginId.slice("local:".length) : snapshot.profile?.loginId === "local-device" ? "Local only" : snapshot.profile?.loginId}</strong>
          </div>
          <div className="row">
            <span>Currency</span>
            <strong>{snapshot.profile?.currency}</strong>
          </div>
          <div className="row">
            <span>Connection Code</span>
            <strong>{snapshot.profile?.connectionCode || "Not created"}</strong>
          </div>
          <div className="row">
            <span>Theme</span>
            <button className="secondary-button" onClick={toggleDarkMode}>
              {snapshot.config.themeMode === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              {snapshot.config.themeMode === "dark" ? "Light" : "Dark"}
            </button>
          </div>
          <div className="row">
            <span>Sync</span>
            <label className="switch">
              <input checked={snapshot.config.syncEnabled} type="checkbox" onChange={(event) => updateConfigToggle("syncEnabled", event.target.checked)} />
              <span />
            </label>
          </div>
          <div className="row">
            <span>AI Chat</span>
            <label className="switch">
              <input checked={snapshot.config.aiEnabled} type="checkbox" onChange={(event) => updateConfigToggle("aiEnabled", event.target.checked)} />
              <span />
            </label>
          </div>
          {snapshot.config.syncEnabled && !getServerToken() ? <p className="text-sm text-amber-700">Login again to resume server sync.</p> : null}
          {snapshot.config.aiEnabled ? <p className="text-sm text-slate-600">AI Chat is enabled.</p> : null}
        </div>
      </Panel>

      <Panel title="Tools">
        <div className="settings-action-grid">
          <button className="more-button" onClick={() => onNavigate("daily")}>
            <CalendarDays size={18} />
            <span>Daily</span>
          </button>
          <button className="more-button" onClick={() => onNavigate("calendar")}>
            <CalendarDays size={18} />
            <span>Calendar</span>
          </button>
          <button className="more-button" onClick={() => onNavigate("manage")}>
            <SlidersHorizontal size={18} />
            <span>Manage</span>
          </button>
        </div>
      </Panel>

      <Panel title="Account">
        {snapshot.profile?.connectedUserId ? (
          <div className="grid gap-2">
            <div className="row">
              <span>Connected ID</span>
              <strong>{snapshot.profile.connectedUserId}</strong>
            </div>
            <button
              className="secondary-button"
              onClick={async () => {
                if (!snapshot.profile) return;
                clearServerToken();
                await db.profiles.update(snapshot.profile.id, { connectedUserId: undefined, updatedAt: nowIso() });
                await db.appConfig.update("primary", { syncEnabled: false, updatedAt: nowIso() });
                await onDone();
              }}
            >
              Disconnect Sync
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            <p className="text-sm text-slate-600">
              Create an account when you want this device data to be linked for future sync.
            </p>
            {snapshot.profile?.loginId === "local-device" ? (
              <TextField label="Email" value={syncEmail} onChange={setSyncEmail} placeholder="you@example.com" />
            ) : snapshot.profile?.loginId.startsWith("local:") ? (
              <div className="row">
                <span>Email</span>
                <strong>{snapshot.profile.loginId.slice("local:".length)}</strong>
              </div>
            ) : null}
            <TextField label="Create cloud password" value={syncPassword} onChange={setSyncPassword} type="password" />
            <button className="primary-button" onClick={connectProfile}>
              <RefreshCw size={18} /> Sync To Server
            </button>
          </div>
        )}
      </Panel>

      <Panel title="Change Password">
        <div className="grid gap-3">
          <TextField label="Current password" value={currentPassword} onChange={setCurrentPassword} type="password" />
          <TextField label="New password" value={newPassword} onChange={setNewPassword} type="password" />
          <TextField label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} type="password" />
          <button className="primary-button" onClick={changePassword}>
            Save Password
          </button>
        </div>
      </Panel>

      <Panel title="AI Chat">
        <div className="grid gap-3">
          <TextField label="Groq API key" value={groqApiKey} onChange={setGroqApiKey} type="password" placeholder="Paste API key" />
          <TextField label="Model" value={aiModel} onChange={setAiModel} placeholder="llama-3.1-8b-instant" />
          <p className="text-sm text-amber-700">
            For production, route AI through a protected server function. Browser-stored keys are only suitable for local testing.
          </p>
          <button className="primary-button" onClick={saveAiConfig}>
            <Bot size={18} /> Save AI Settings
          </button>
        </div>
      </Panel>

      <Panel title="Import / Export">
        <div className="settings-action-grid">
          <button className="secondary-button" onClick={exportData}>
            <Download size={18} /> Export JSON
          </button>
          <label className="secondary-button cursor-pointer">
            <Upload size={18} /> Import JSON
            <input className="hidden" type="file" accept="application/json" onChange={(event) => importData(event.target.files?.[0])} />
          </label>
          <button className="secondary-button danger-button" onClick={onLogout}>
            <LogOut size={18} /> Logout
          </button>
        </div>
      </Panel>
    </div>
  );
}

function AdminView({
  snapshot,
  onLogout,
  onDone,
}: {
  snapshot: Snapshot;
  onLogout: () => void;
  onDone: () => Promise<void>;
}) {
  const [form, setForm] = useState(snapshot.config);

  useEffect(() => setForm(snapshot.config), [snapshot.config]);

  const save = async () => {
    await db.appConfig.put({ ...form, id: "primary", updatedAt: nowIso() });
    await onDone();
  };

  const uploadLogo = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Upload an image file.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      alert("Logo image is too large. Maximum size is 1 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, logoImage: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Panel title="Application Configuration">
        <div className="grid gap-4">
          <TextField label="App name" value={form.appName} onChange={(value) => setForm({ ...form, appName: value })} />
          <TextField label="Tagline" value={form.tagline} onChange={(value) => setForm({ ...form, tagline: value })} />
          <TextField label="Logo text" value={form.logoText} onChange={(value) => setForm({ ...form, logoText: value })} />
          <div className="grid gap-2">
            <span className="field-label">App icon / image</span>
            <div className="flex flex-wrap gap-2">
              <label className="secondary-button cursor-pointer">
                <Upload size={18} /> Upload Image
                <input className="hidden" type="file" accept="image/*" onChange={(event) => uploadLogo(event.target.files?.[0])} />
              </label>
              {form.logoImage ? (
                <button className="secondary-button" onClick={() => setForm({ ...form, logoImage: undefined })}>
                  Use Text Logo
                </button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ColorField label="Primary color" value={form.primaryColor} onChange={(value) => setForm({ ...form, primaryColor: value })} />
            <ColorField label="Accent color" value={form.accentColor} onChange={(value) => setForm({ ...form, accentColor: value })} />
            <ColorField label="Surface color" value={form.surfaceColor} onChange={(value) => setForm({ ...form, surfaceColor: value })} />
            <ColorField label="Text color" value={form.textColor} onChange={(value) => setForm({ ...form, textColor: value })} />
          </div>
          <TextField label="Default currency" value={form.defaultCurrency} onChange={(value) => setForm({ ...form, defaultCurrency: value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Admin ID" value={form.adminId} onChange={(value) => setForm({ ...form, adminId: value })} />
            <TextField label="Admin password" value={form.adminPassword} onChange={(value) => setForm({ ...form, adminPassword: value })} type="password" />
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="primary-button" onClick={save}>
              <Palette size={18} /> Save Configuration
            </button>
            <button className="secondary-button" onClick={onLogout}>
              <LogOut size={18} /> Logout
            </button>
          </div>
        </div>
      </Panel>
      <Panel title="Preview">
        <div className="grid gap-4">
          <Logo config={form} />
          <div>
            <h2 className="text-2xl font-semibold">{form.appName}</h2>
            <p className="text-slate-500">{form.tagline}</p>
          </div>
          <button className="primary-button" style={{ background: form.primaryColor }}>
            Primary action
          </button>
          <button className="primary-button" style={{ background: form.accentColor }}>
            Accent action
          </button>
        </div>
      </Panel>
    </div>
  );
}

function AiChatView({ snapshot, currency, notify }: { snapshot: Snapshot; currency: string; notify: (message: string, tone?: Toast["tone"]) => void }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [imageContext, setImageContext] = useState("");

  const ask = async () => {
    if (!question.trim()) return;
    if (!snapshot.config.groqApiKey) {
      notify("Add the Groq API key in Settings.", "error");
      return;
    }
    const aiLimit = checkRateLimit("micham_ai_chat", AI_LIMIT.max, AI_LIMIT.windowMs);
    if (!aiLimit.allowed) {
      notify(`AI chat is rate limited. Try again in ${minutesFromMs(aiLimit.retryAfterMs)} minute(s).`, "error");
      return;
    }

    const balances = snapshot.accounts.map((account) => ({
      name: account.name,
      balance: accountBalance(account, snapshot.transactions),
    }));
    const monthSummary = summarize(snapshot.transactions);
    const spending = categorySpend(snapshot.categories, snapshot.transactions).map((item) => ({
      category: item.category.name,
      amount: item.amount,
    }));
    const people = snapshot.people.map((person) => ({
      name: person.localDisplayName,
      balance: personBalance(person, snapshot.settlements),
    }));
    const recentTransactions = snapshot.transactions.slice(-40).map((transaction) => ({
      type: transaction.type,
      amount: transaction.amount,
      date: transaction.date,
      account: snapshot.accounts.find((item) => item.id === transaction.accountId)?.name,
      toAccount: snapshot.accounts.find((item) => item.id === transaction.toAccountId)?.name,
      category: snapshot.categories.find((item) => item.id === transaction.categoryId)?.name,
      note: transaction.note,
    }));
    const context = { currency, balances, monthSummary, spending, people, recentTransactions };
    const userMessage = question.trim();
    setMessages((items) => [...items, { role: "user", content: userMessage }]);
    setQuestion("");
    setLoading(true);

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${snapshot.config.groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: snapshot.config.aiModel || "llama-3.1-8b-instant",
          messages: [
            {
              role: "system",
              content:
                "Answer only from the provided personal finance JSON. If the answer is not present, say that the local data does not contain enough information.",
            },
            { role: "user", content: `Finance data:\n${JSON.stringify(context)}\n\nAttached image context: ${imageContext || "none"}\n\nQuestion: ${userMessage}` },
          ],
          temperature: 0.1,
        }),
      });
      if (!response.ok) throw new Error(`Groq request failed: ${response.status}`);
      const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      setMessages((items) => [...items, { role: "assistant", content: data.choices?.[0]?.message?.content ?? "No answer returned." }]);
    } catch (error) {
      setMessages((items) => [
        ...items,
        { role: "assistant", content: error instanceof Error ? error.message : "AI request failed." },
      ]);
    } finally {
      setLoading(false);
      setImageContext("");
    }
  };

  const attachImage = (file?: File) => {
    if (!file) return;
    setImageContext(`User attached image '${file.name}'. Browser-only mode cannot read image contents yet; ask user to confirm extracted fields.`);
    notify("Image attached to chat context.", "success");
  };

  return (
    <div className="grid gap-5">
      <Panel title="AI Chat">
        <div className="grid min-h-[420px] grid-rows-[1fr_auto] gap-4">
          <div className="grid content-start gap-3">
            {messages.length === 0 ? <Empty text="Ask about spending, savings, balances, categories, or people." /> : null}
            {messages.map((message, index) => (
              <div className={`chat-message ${message.role === "user" ? "chat-message-user" : ""}`} key={index}>
                {message.content}
              </div>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <input
              className="field-input"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") ask();
              }}
              placeholder="How much did I spend this month?"
            />
            <label className="secondary-button cursor-pointer">
              <Image size={18} />
              <input className="hidden" type="file" accept="image/*" onChange={(event) => attachImage(event.target.files?.[0])} />
            </label>
            <button className="primary-button" onClick={ask} disabled={loading || !question.trim()}>
              <Bot size={18} /> {loading ? "Asking" : "Ask"}
            </button>
          </div>
          {imageContext ? <p className="text-sm text-slate-500">{imageContext}</p> : null}
        </div>
      </Panel>
    </div>
  );
}

function TransactionList({ snapshot, currency, transactions }: { snapshot: Snapshot; currency: string; transactions: Transaction[] }) {
  const [receipt, setReceipt] = useState<Transaction | null>(null);
  if (transactions.length === 0) return <Empty text="No transactions yet." />;
  return (
    <>
      <div className="grid gap-2">
        {transactions.map((transaction) => {
          const account = snapshot.accounts.find((item) => item.id === transaction.accountId);
          const toAccount = snapshot.accounts.find((item) => item.id === transaction.toAccountId);
          const category = snapshot.categories.find((item) => item.id === transaction.categoryId);
          return (
            <div className="transaction-row" key={transaction.id}>
              <div className="transaction-icon">
                {transaction.type === "transfer" ? <ArrowRightLeft size={16} /> : transaction.type === "income" ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{transaction.note || category?.name || transaction.type}</p>
                <p className="truncate text-xs text-slate-500">
                  {transaction.type === "transfer" ? `${account?.name} to ${toAccount?.name}` : `${account?.name ?? ""} ${category?.name ? `- ${category.name}` : ""}`} · {formatDate(transaction.date)}
                </p>
                {transaction.edited && transaction.previousVersion ? (
                  <p className="transaction-edit-note">
                    Edited · before {formatMoney(transaction.previousVersion.amount, currency)} on {formatDate(transaction.previousVersion.date)}
                  </p>
                ) : transaction.edited ? (
                  <p className="transaction-edit-note">Edited</p>
                ) : null}
                {transaction.receiptName ? (
                  <button className="receipt-link" type="button" onClick={() => setReceipt(transaction)}>
                    <Image size={14} /> {transaction.receiptName}
                  </button>
                ) : null}
              </div>
              <strong className={transaction.type === "income" ? "text-emerald-700" : transaction.type === "expense" ? "text-rose-700" : "text-slate-800"}>
                {formatMoney(transaction.amount, currency)}
              </strong>
            </div>
          );
        })}
      </div>
      {receipt ? <ReceiptViewer transaction={receipt} onClose={() => setReceipt(null)} /> : null}
    </>
  );
}

function ReceiptViewer({ transaction, onClose }: { transaction: Transaction; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="receipt-viewer">
        <div className="receipt-viewer-head">
          <div>
            <strong>{transaction.receiptName || "Receipt"}</strong>
            <p>{formatDate(transaction.date)}</p>
          </div>
          <button className="icon-button" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        {transaction.receiptData ? (
          <img src={transaction.receiptData} alt={transaction.receiptName || "Receipt"} />
        ) : (
          <Empty text="Receipt image data is not available for this older transaction." />
        )}
      </div>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="app-panel">
      <h2 className="panel-title">{icon}{title}</h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">{text}</p>;
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  return (
    <label className="grid gap-1">
      <span className="field-label">{label}</span>
      <span className="password-wrap">
        <input className="field-input" type={isPassword && visible ? "text" : type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
        {isPassword ? (
          <button type="button" onClick={() => setVisible((item) => !item)} title={visible ? "Hide password" : "Show password"}>
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        ) : null}
      </span>
    </label>
  );
}

function ToastHost({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toast-host">
      {toasts.map((toast) => (
        <div className={`toast toast-${toast.tone}`} key={toast.id}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pickerId = useMemo(() => createId(), []);
  const options = React.Children.toArray(children)
    .filter(React.isValidElement)
    .map((child) => {
      const props = child.props as { value?: string; children?: React.ReactNode };
      return {
        value: String(props.value ?? ""),
        label: String(props.children ?? props.value ?? ""),
      };
    })
    .filter((option) => option.value)
    .filter((option, index, items) => items.findIndex((item) => item.label.toLowerCase() === option.label.toLowerCase()) === index);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    const closeOtherPickers = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
    };
    window.addEventListener("micham-picker-open", closeOtherPickers);
    return () => window.removeEventListener("micham-picker-open", closeOtherPickers);
  }, [pickerId]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePress = () => setOpen(false);
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [open]);

  return (
    <div className="select-field">
      <span>{label}</span>
      <div className="picker" onPointerDown={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="picker-button"
          onClick={(event) => {
            event.stopPropagation();
            setOpen((item) => {
              const nextOpen = !item;
              if (nextOpen) window.dispatchEvent(new CustomEvent("micham-picker-open", { detail: pickerId }));
              return nextOpen;
            });
          }}
        >
          <span>{selected?.label || "Choose"}</span>
          <ChevronDown className={open ? "picker-chevron picker-chevron-open" : "picker-chevron"} size={18} />
        </button>
        {open ? (
          <div className="picker-menu" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            {options.map((option) => (
              <button
                type="button"
                className={option.value === value ? "picker-option picker-option-active" : "picker-option"}
                key={option.value}
                onClick={(event) => {
                  event.stopPropagation();
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1">
      <span className="field-label">{label}</span>
      <span className="grid grid-cols-[44px_1fr] gap-2">
        <input className="h-11 w-11 rounded-lg border border-slate-300 p-1" type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <input className="field-input" value={value} onChange={(event) => onChange(event.target.value)} />
      </span>
    </label>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
