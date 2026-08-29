import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  BarChart3,
  Bot,
  CalendarDays,
  CircleUserRound,
  Download,
  Eye,
  EyeOff,
  Home,
  Image,
  LogOut,
  MoreHorizontal,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Settings,
  Sun,
  Trash2,
  Upload,
  UserPlus,
  Users,
  WalletCards,
} from "lucide-react";
import { StatCard } from "./components/StatCard";
import { accountBalance, budgetUsage, categorySpend, personBalance, sameDay, summarize } from "./lib/calculations";
import { db, initializeDatabase } from "./lib/db";
import { createId, nowIso } from "./lib/defaults";
import { formatDate, formatMoney } from "./lib/format";
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
    primaryColor: "#0878ff",
    accentColor: "#00a77f",
    surfaceColor: "#f8fafc",
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

function createConnectionCode() {
  return `MCH-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
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

async function createOrGetLocalProfile(config: AppConfig) {
  const loginId = "local-device";
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
      displayName: "Local User",
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

function inverseDirection(direction: "to_me" | "by_me") {
  return direction === "to_me" ? "by_me" : "to_me";
}

async function ensureMirrorPerson(ownerProfile: Profile, connectedProfile: Profile, syncEnabled: boolean) {
  const existingPeople = await db.people.toArray();
  const existing = existingPeople.find(
    (person) => person.ownerProfileId === ownerProfile.id && person.connectedUserId === connectedProfile.connectionCode && !person.deletedAt,
  );
  if (existing) return existing;

  const timestamp = nowIso();
  const person: Person = {
    id: createId(),
    ownerProfileId: ownerProfile.id,
    localDisplayName: connectedProfile.displayName,
    inviteCode: connectedProfile.connectionCode,
    connectedUserId: connectedProfile.connectionCode,
    status: "connected",
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    syncState: syncEnabled ? "queued" : "local",
  };
  await db.people.put(person);
  return person;
}

async function mirrorConnectedSettlement(profile: Profile | undefined, person: Person | undefined, settlement: Settlement, syncEnabled: boolean) {
  if (!profile?.connectionCode || !person?.connectedUserId || person.status !== "connected") return;
  const profiles = await db.profiles.toArray();
  const connectedProfile = profiles.find((item) => item.connectionCode === person.connectedUserId);
  if (!connectedProfile) return;

  const mirrorPerson = await ensureMirrorPerson(connectedProfile, profile, syncEnabled);
  const timestamp = nowIso();
  const mirrorSettlement: Settlement = {
    id: createId(),
    ownerProfileId: connectedProfile.id,
    personId: mirrorPerson.id,
    direction: inverseDirection(settlement.direction),
    originalAmount: settlement.originalAmount,
    repaidAmount: settlement.repaidAmount,
    linkedSettlementId: settlement.id,
    date: settlement.date,
    note: settlement.note,
    createdAt: timestamp,
    updatedAt: timestamp,
    syncState: syncEnabled ? "queued" : "local",
  };
  await db.transaction("rw", db.settlements, async () => {
    await db.settlements.put(mirrorSettlement);
    await db.settlements.update(settlement.id, { linkedSettlementId: mirrorSettlement.id, updatedAt: timestamp });
  });
}

async function mirrorConnectedRepayment(settlement: Settlement, person: Person | undefined, repayment: Repayment, totalRepaid: number, syncEnabled: boolean) {
  if (!settlement.linkedSettlementId || !person?.connectedUserId || person.status !== "connected") return;
  const linkedSettlement = await db.settlements.get(settlement.linkedSettlementId);
  if (!linkedSettlement) return;
  const timestamp = nowIso();
  const mirrorRepayment: Repayment = {
    id: createId(),
    ownerProfileId: linkedSettlement.ownerProfileId,
    settlementId: linkedSettlement.id,
    personId: linkedSettlement.personId,
    amount: repayment.amount,
    date: repayment.date,
    note: repayment.note,
    linkedRepaymentId: repayment.id,
    createdAt: timestamp,
    updatedAt: timestamp,
    syncState: syncEnabled ? "queued" : "local",
  };
  await db.transaction("rw", db.settlements, db.repayments, async () => {
    await db.repayments.put(mirrorRepayment);
    await db.repayments.update(repayment.id, { linkedRepaymentId: mirrorRepayment.id, updatedAt: timestamp });
    await db.settlements.update(linkedSettlement.id, { repaidAmount: totalRepaid, updatedAt: timestamp, syncState: syncEnabled ? "queued" : "local" });
  });
}

function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("dashboard");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [sessionRole, setSessionRole] = useState<SessionRole>(() => (sessionStorage.getItem("micham_role") as SessionRole) || "guest");
  const [currentProfileId, setCurrentProfileId] = useState(() => sessionStorage.getItem("micham_profile_id") || "");
  const [moreOpen, setMoreOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = (message: string, tone: Toast["tone"] = "info") => {
    const id = createId();
    setToasts((items) => [...items, { id, message, tone }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3200);
  };

  const refresh = async (profileId = currentProfileId) => {
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
    setSnapshot({
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
    });
  };

  useEffect(() => {
    initializeDatabase()
      .then(() => refresh())
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--brand", snapshot.config.primaryColor);
    document.documentElement.style.setProperty("--accent", snapshot.config.accentColor);
    document.documentElement.style.setProperty("--surface", snapshot.config.themeMode === "dark" ? "#0f172a" : snapshot.config.surfaceColor);
    document.documentElement.style.setProperty("--text", snapshot.config.themeMode === "dark" ? "#e5e7eb" : snapshot.config.textColor);
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
    sessionStorage.removeItem("micham_role");
    sessionStorage.removeItem("micham_profile_id");
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
              sessionStorage.removeItem("micham_role");
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
            sessionStorage.setItem("micham_role", "user");
            sessionStorage.setItem("micham_profile_id", profileId);
            setSessionRole("user");
            setCurrentProfileId(profileId);
            await claimUnownedData(profileId);
            await refresh(profileId);
          }}
          onAdminLogin={async () => {
            sessionStorage.setItem("micham_role", "admin");
            setSessionRole("admin");
            await refresh("");
          }}
        />
      </Shell>
    );
  }

  return (
    <Shell snapshot={snapshot}>
      <div className="grid min-h-screen grid-rows-[auto_1fr_auto]">
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
          {view === "settings" && <SettingsView snapshot={snapshot} notify={notify} onDone={refresh} onLogout={logoutUser} />}
          {view === "ai" && <AiChatView snapshot={snapshot} currency={currency} notify={notify} />}
        </main>

        <nav className="sticky bottom-0 z-20 border-t border-slate-200 bg-white">
          {moreOpen ? (
            <div className="mx-auto grid max-w-6xl grid-cols-2 gap-2 border-b border-slate-100 px-4 py-3 sm:grid-cols-4">
              <MoreButton icon={<CalendarDays size={18} />} label="Daily" onClick={() => { setView("daily"); setMoreOpen(false); }} />
              <MoreButton icon={<CalendarDays size={18} />} label="Calendar" onClick={() => { setView("calendar"); setMoreOpen(false); }} />
              <MoreButton icon={<Users size={18} />} label="Friends" onClick={() => { setView("people"); setMoreOpen(false); }} />
              <MoreButton icon={<SlidersHorizontal size={18} />} label="Manage" onClick={() => { setView("manage"); setMoreOpen(false); }} />
              <MoreButton icon={<Settings size={18} />} label="Settings" onClick={() => { setView("settings"); setMoreOpen(false); }} />
            </div>
          ) : null}
          <div className="mx-auto grid max-w-6xl grid-cols-5 gap-1 px-2 py-2 text-xs">
            <NavButton icon={<Home size={18} />} label="Home" active={view === "dashboard"} onClick={() => { setView("dashboard"); setMoreOpen(false); }} />
            <NavButton icon={<Bot size={18} />} label="Chat" active={view === "ai"} disabled={!snapshot.config.aiEnabled} onClick={() => { if (snapshot.config.aiEnabled) { setView("ai"); setMoreOpen(false); } }} />
            <button className={`add-nav-button ${view === "add" ? "add-nav-button-active" : ""}`} onClick={() => { setView("add"); setMoreOpen(false); }}>
              <Plus size={24} />
              <span>Add</span>
            </button>
            <NavButton icon={<BarChart3 size={18} />} label="Reports" active={view === "monthly"} onClick={() => { setView("monthly"); setMoreOpen(false); }} />
            <NavButton icon={<MoreHorizontal size={18} />} label="More" active={moreOpen || ["calendar", "people", "manage", "settings", "ai"].includes(view)} onClick={() => setMoreOpen((value) => !value)} />
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
  return (
    <div className="wordmark-wrap">
      <img src={defaultWordmarkUrl} alt={`${config.appName} wordmark`} />
      <span>{config.appName}</span>
      <small>{config.tagline}</small>
    </div>
  );
}

async function hashPassword(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
  const [currency, setCurrency] = useState(config.defaultCurrency);
  const [accounts, setAccounts] = useState([{ name: "Cash", openingBalance: 0 }]);
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

    const existing = await db.profiles.where("loginId").equals(normalizedLoginId).first();
    if (existing) {
      setFormError("An account already exists for this email.");
      notify("This login ID already exists.", "error");
      return;
    }

    const timestamp = nowIso();
    const profileId = createId();
    const passwordHash = await hashPassword(password);
    await db.transaction("rw", db.profiles, db.accounts, async () => {
      await db.profiles.put({
        id: profileId,
        loginId: normalizedLoginId,
        passwordHash,
        connectionCode: createConnectionCode(),
        displayName: displayName || normalizedLoginId.split("@")[0],
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
    notify("Local account created.", "success");
    await onLogin(profileId);
  };

  const useLocally = async () => {
    setFormError("");
    const profileId = await createOrGetLocalProfile(config);
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
        <Logo config={config} />
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
            <TextField label="Connection code" value={connectionCode} onChange={(value) => setConnectionCode(value.toUpperCase())} placeholder="MCH-ABCD-EFGH" />
            <TextField label="New password" value={newPassword} onChange={setNewPassword} type="password" />
            <TextField label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} type="password" />
            <button className="primary-button" onClick={resetPassword} disabled={!loginId || !connectionCode || !newPassword || !confirmPassword}>
              Reset Password
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
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <label className="field-label">Accounts</label>
                    <button className="small-button" onClick={() => setAccounts((items) => [...items, { name: "", openingBalance: 0 }])}>
                      <Plus size={16} /> Add
                    </button>
                  </div>
                  {accounts.map((account, index) => (
                    <div className="grid grid-cols-[1fr_120px] gap-2" key={index}>
                      <input
                        className="field-input"
                        value={account.name}
                        onChange={(event) =>
                          setAccounts((items) =>
                            items.map((item, itemIndex) => (itemIndex === index ? { ...item, name: event.target.value } : item)),
                          )
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

function MoreButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="more-button" onClick={onClick}>
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
  const activePeople = snapshot.people.filter((person) => person.active && person.status !== "blocked");
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
  const activePeople = snapshot.people.filter((person) => person.active && person.status !== "blocked");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [personId, setPersonId] = useState(activePeople[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"to_me" | "by_me">("to_me");
  const [note, setNote] = useState("");
  const openSettlements = snapshot.settlements.filter((settlement) => !settlement.deletedAt && settlement.repaidAmount < settlement.originalAmount);
  const [repaymentSettlementId, setRepaymentSettlementId] = useState(openSettlements[0]?.id ?? "");
  const [repaymentAmount, setRepaymentAmount] = useState("");
  const [repaymentNote, setRepaymentNote] = useState("");

  useEffect(() => {
    if (!activePeople.some((person) => person.id === personId)) setPersonId(activePeople[0]?.id ?? "");
  }, [activePeople, personId]);

  useEffect(() => {
    if (!openSettlements.some((settlement) => settlement.id === repaymentSettlementId)) setRepaymentSettlementId(openSettlements[0]?.id ?? "");
  }, [openSettlements, repaymentSettlementId]);

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
    await db.people.put({
      id: createId(),
      ownerProfileId: snapshot.profile?.id,
      localDisplayName: name.trim(),
      inviteCode: inviteCode.trim() || undefined,
      connectedUserId: inviteCode.trim() || undefined,
      status: inviteCode.trim() ? "pending" : "local",
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      syncState: snapshot.config.syncEnabled ? "queued" : "local",
    });
    setName("");
    setInviteCode("");
    notify(inviteCode ? "Friend request saved as pending." : "Local person added.", "success");
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
    await mirrorConnectedSettlement(
      snapshot.profile,
      snapshot.people.find((person) => person.id === personId),
      settlement,
      snapshot.config.syncEnabled,
    );
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
    await mirrorConnectedRepayment(
      settlement,
      snapshot.people.find((person) => person.id === settlement.personId),
      repayment,
      totalRepaid,
      snapshot.config.syncEnabled,
    );
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

  return (
    <div className="grid gap-5">
      <Panel title="Friends List">
        <div className="grid gap-3">
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <input className="field-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Friend name" />
            <input className="field-input" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="Connection code optional" />
            <button className="primary-button" onClick={addPerson} disabled={!name.trim()}>
              <UserPlus size={18} /> Add
            </button>
          </div>
          <div className="friends-grid">
            {snapshot.people.length === 0 ? <Empty text="No friends added yet." /> : null}
            {snapshot.people.map((person) => {
              const balance = personBalance(person, snapshot.settlements);
              const linked = snapshot.settlements.some((settlement) => settlement.personId === person.id);
              return (
                <div className="friend-card" key={person.id}>
                  <div className="friend-card-main">
                    <div>
                      <strong>{person.localDisplayName}</strong>
                      <p>{person.inviteCode ? person.inviteCode : "Local person"}</p>
                    </div>
                    <span className={`status-pill status-${person.status || "local"}`}>{person.active ? person.status || "local" : "hidden"}</span>
                  </div>
                  <div className="friend-balance">
                    <span>{balance >= 0 ? "Owed to you" : "You owe"}</span>
                    <strong>{formatMoney(Math.abs(balance), currency)}</strong>
                  </div>
                  <div className="friend-actions">
                    {person.status === "pending" ? (
                      <button className="small-button" onClick={() => updatePerson(person, { status: "connected" })}>Connect</button>
                    ) : null}
                    {person.status !== "blocked" ? (
                      <button className="small-button" onClick={() => updatePerson(person, { status: "blocked", active: false })}>Block</button>
                    ) : null}
                    <button className="small-button danger-button" onClick={() => removeOrHidePerson(person)}>
                      <Trash2 size={15} /> {linked ? "Hide" : "Remove"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Panel>
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
}: {
  snapshot: Snapshot;
  notify: (message: string, tone?: Toast["tone"]) => void;
  onDone: () => Promise<void>;
  onLogout: () => void;
}) {
  const [groqApiKey, setGroqApiKey] = useState(snapshot.config.groqApiKey ?? "");
  const [aiModel, setAiModel] = useState(snapshot.config.aiModel);
  const [syncEmail, setSyncEmail] = useState("");
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
    const isLocalProfile = snapshot.profile.loginId === "local-device";
    const normalizedEmail = syncEmail.trim().toLowerCase();
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
    const syncPasswordHash = isLocalProfile ? await hashPassword(syncPassword) : snapshot.profile.passwordHash;
    await db.transaction(
      "rw",
      [db.profiles, db.accounts, db.categories, db.transactions, db.budgets, db.recurringTransactions, db.people, db.settlements, db.repayments, db.appConfig],
      async () => {
        await db.profiles.update(snapshot.profile!.id, {
          connectedUserId: connectionCode,
          connectionCode,
          loginId: isLocalProfile ? normalizedEmail : snapshot.profile!.loginId,
          passwordHash: syncPasswordHash,
          displayName: isLocalProfile ? normalizedEmail.split("@")[0] : snapshot.profile!.displayName,
          updatedAt: timestamp,
          syncState: "queued",
        });
        await db.accounts.bulkPut(snapshot.accounts.map((item) => ({ ...item, syncState: "queued" as const, updatedAt: timestamp })));
        await db.categories.bulkPut(snapshot.categories.map((item) => ({ ...item, syncState: "queued" as const, updatedAt: timestamp })));
        await db.transactions.bulkPut(snapshot.transactions.map((item) => ({ ...item, syncState: "queued" as const, updatedAt: timestamp })));
        await db.budgets.bulkPut(snapshot.budgets.map((item) => ({ ...item, syncState: "queued" as const, updatedAt: timestamp })));
        await db.recurringTransactions.bulkPut(snapshot.recurring.map((item) => ({ ...item, syncState: "queued" as const, updatedAt: timestamp })));
        await db.people.bulkPut(snapshot.people.map((item) => ({ ...item, syncState: "queued" as const, updatedAt: timestamp })));
        await db.settlements.bulkPut(snapshot.settlements.map((item) => ({ ...item, syncState: "queued" as const, updatedAt: timestamp })));
        await db.repayments.bulkPut(snapshot.repayments.map((item) => ({ ...item, syncState: "queued" as const, updatedAt: timestamp })));
        await db.appConfig.update("primary", { syncEnabled: true, updatedAt: timestamp });
      },
    );
    setSyncEmail("");
    setSyncPassword("");
    notify(isLocalProfile ? "Account created. Local data is queued for sync." : "Connected locally. Your existing data is queued for cloud sync.", "success");
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
          {snapshot.config.syncEnabled ? <p className="text-sm text-amber-700">Sync unavailable. Your data is safely stored on this device.</p> : null}
          {snapshot.config.aiEnabled ? <p className="text-sm text-slate-600">AI Chat is enabled.</p> : null}
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
              <>
                <TextField label="Email" value={syncEmail} onChange={setSyncEmail} placeholder="you@example.com" />
                <TextField label="Password" value={syncPassword} onChange={setSyncPassword} type="password" />
              </>
            ) : null}
            <button className="primary-button" onClick={connectProfile}>
              <RefreshCw size={18} /> Create Account & Sync Local Data
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
        <div className="flex flex-wrap gap-3">
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
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
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

  return (
    <div className="select-field">
      <span>{label}</span>
      <div className="picker">
        <button type="button" className="picker-button" onClick={() => setOpen((item) => !item)}>
          <span>{selected?.label || "Choose"}</span>
          <MoreHorizontal size={18} />
        </button>
        {open ? (
          <div className="picker-menu">
            {options.map((option) => (
              <button
                type="button"
                className={option.value === value ? "picker-option picker-option-active" : "picker-option"}
                key={option.value}
                onPointerDown={(event) => {
                  event.preventDefault();
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
