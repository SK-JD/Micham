import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Bot,
  CalendarDays,
  Download,
  Landmark,
  Lock,
  LogOut,
  Palette,
  Plus,
  RefreshCw,
  Settings,
  Upload,
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
  RecurringTransaction,
  Settlement,
  Transaction,
  TransactionType,
} from "./lib/types";
import "./styles/index.css";

type View = "dashboard" | "daily" | "monthly" | "calendar" | "people" | "settings" | "admin" | "ai";
type SessionRole = "guest" | "user" | "admin";

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
}

const emptySnapshot: Snapshot = {
  config: {
    id: "primary",
    appName: "Micham",
    tagline: "Micham la evlo irukku?",
    logoText: "M",
    primaryColor: "#2563eb",
    accentColor: "#16a34a",
    surfaceColor: "#f8fafc",
    textColor: "#0f172a",
    defaultCurrency: "INR",
    adminId: "Admin",
    adminPassword: "Admin@123",
    syncEnabled: false,
    aiEnabled: false,
    groqApiKey: "",
    aiModel: "llama-3.1-8b-instant",
    updatedAt: nowIso(),
  },
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],
  recurring: [],
  people: [],
  settlements: [],
};

function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("dashboard");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [sessionRole, setSessionRole] = useState<SessionRole>(() => (sessionStorage.getItem("micham_role") as SessionRole) || "guest");
  const [currentProfileId, setCurrentProfileId] = useState(() => sessionStorage.getItem("micham_profile_id") || "");

  const refresh = async (profileId = currentProfileId) => {
    const [config, profiles, accounts, categories, transactions, budgets, recurring, people, settlements] = await Promise.all([
      db.appConfig.get("primary"),
      db.profiles.toArray(),
      db.accounts.toArray(),
      db.categories.toArray(),
      db.transactions.toArray(),
      db.budgets.toArray(),
      db.recurringTransactions.toArray(),
      db.people.toArray(),
      db.settlements.toArray(),
    ]);
    const profile = profileId ? profiles.find((item) => item.id === profileId) : undefined;
    setSnapshot({
      config: config ?? emptySnapshot.config,
      profile,
      accounts: accounts.filter((item) => !item.deletedAt),
      categories: categories.filter((item) => !item.deletedAt),
      transactions: transactions.filter((item) => !item.deletedAt),
      budgets: budgets.filter((item) => !item.deletedAt),
      recurring: recurring.filter((item) => !item.deletedAt),
      people: people.filter((item) => !item.deletedAt),
      settlements: settlements.filter((item) => !item.deletedAt),
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
    document.documentElement.style.setProperty("--surface", snapshot.config.surfaceColor);
    document.documentElement.style.setProperty("--text", snapshot.config.textColor);
    document.title = snapshot.config.appName;
  }, [snapshot.config]);

  const currency = snapshot.profile?.currency ?? snapshot.config.defaultCurrency;
  const balances = useMemo(
    () =>
      snapshot.accounts.map((account) => ({
        account,
        balance: accountBalance(account, snapshot.transactions),
      })),
    [snapshot.accounts, snapshot.transactions],
  );
  const totalBalance = balances.reduce((sum, item) => sum + item.balance, 0);
  const summary = summarize(snapshot.transactions, selectedDate);

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
          onLogin={async (profileId) => {
            sessionStorage.setItem("micham_role", "user");
            sessionStorage.setItem("micham_profile_id", profileId);
            setSessionRole("user");
            setCurrentProfileId(profileId);
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
            <Logo config={snapshot.config} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold text-slate-950">{snapshot.config.appName}</h1>
              <p className="truncate text-xs text-slate-500">{snapshot.config.tagline}</p>
            </div>
            <button
              className="icon-button"
              title="Logout"
              onClick={() => {
                sessionStorage.removeItem("micham_role");
                sessionStorage.removeItem("micham_profile_id");
                setSessionRole("guest");
                setCurrentProfileId("");
              }}
            >
              <LogOut size={18} />
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
            />
          )}
          {view === "daily" && (
            <DailyView snapshot={snapshot} currency={currency} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />
          )}
          {view === "monthly" && <MonthlyView snapshot={snapshot} currency={currency} />}
          {view === "calendar" && (
            <CalendarView snapshot={snapshot} currency={currency} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />
          )}
          {view === "people" && <PeopleView snapshot={snapshot} currency={currency} onDone={refresh} />}
          {view === "settings" && <SettingsView snapshot={snapshot} onDone={refresh} />}
          {view === "ai" && <AiChatView snapshot={snapshot} currency={currency} />}
        </main>

        <nav className="sticky bottom-0 z-20 border-t border-slate-200 bg-white">
          <div className={`mx-auto grid max-w-6xl ${snapshot.config.aiEnabled ? "grid-cols-7" : "grid-cols-6"} gap-1 px-2 py-2 text-xs`}>
            <NavButton icon={<WalletCards size={18} />} label="Home" active={view === "dashboard"} onClick={() => setView("dashboard")} />
            <NavButton icon={<CalendarDays size={18} />} label="Daily" active={view === "daily"} onClick={() => setView("daily")} />
            <NavButton icon={<ArrowUpRight size={18} />} label="Month" active={view === "monthly"} onClick={() => setView("monthly")} />
            <NavButton icon={<CalendarDays size={18} />} label="Calendar" active={view === "calendar"} onClick={() => setView("calendar")} />
            <NavButton icon={<Users size={18} />} label="People" active={view === "people"} onClick={() => setView("people")} />
            {snapshot.config.aiEnabled ? <NavButton icon={<Bot size={18} />} label="AI" active={view === "ai"} onClick={() => setView("ai")} /> : null}
            <NavButton icon={<Settings size={18} />} label="Settings" active={view === "settings"} onClick={() => setView("settings")} />
          </div>
        </nav>
      </div>
    </Shell>
  );
}

function Shell({ snapshot, children }: { snapshot: Snapshot; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--surface)] text-[var(--text)]" style={{ background: snapshot.config.surfaceColor }}>
      {children}
    </div>
  );
}

function Logo({ config }: { config: AppConfig }) {
  if (config.logoImage) {
    return <img className="h-10 w-10 shrink-0 rounded-lg object-cover" src={config.logoImage} alt={`${config.appName} logo`} />;
  }

  return (
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg font-bold text-white" style={{ background: config.primaryColor }}>
      {config.logoText.slice(0, 3)}
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
  onLogin,
  onAdminLogin,
}: {
  config: AppConfig;
  onLogin: (profileId: string) => Promise<void>;
  onAdminLogin: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register" | "connect">("login");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [currency, setCurrency] = useState(config.defaultCurrency);
  const [accounts, setAccounts] = useState([{ name: "Cash", openingBalance: 0 }]);

  const login = async () => {
    if (loginId === config.adminId && password === config.adminPassword) {
      await onAdminLogin();
      return;
    }

    const passwordHash = await hashPassword(password);
    const profile = await db.profiles.where("loginId").equals(loginId).first();
    if (!profile || profile.passwordHash !== passwordHash) {
      alert("Invalid login.");
      return;
    }
    await onLogin(profile.id);
  };

  const register = async () => {
    const existing = await db.profiles.where("loginId").equals(loginId).first();
    if (existing) {
      alert("This login ID already exists.");
      return;
    }

    const timestamp = nowIso();
    const profileId = createId();
    const passwordHash = await hashPassword(password);
    await db.transaction("rw", db.profiles, db.accounts, async () => {
      await db.profiles.put({
        id: profileId,
        loginId,
        passwordHash,
        displayName: displayName || loginId,
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
            name: account.name.trim(),
            openingBalance: Number(account.openingBalance) || 0,
            active: true,
            createdAt: timestamp,
            updatedAt: timestamp,
            syncState: "local" as const,
          })),
      );
    });
    await onLogin(profileId);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-8">
      <div className="mb-8 flex items-center gap-3">
        <Logo config={config} />
        <div>
          <h1 className="text-2xl font-semibold">{config.appName}</h1>
          <p className="text-slate-500">{config.tagline}</p>
        </div>
      </div>

      <Panel title={mode === "register" ? "Create Local Account" : mode === "connect" ? "Connect With Us" : "Login"}>
        {mode === "connect" ? (
          <div className="grid gap-4">
            <TextField label="Email or phone" value={loginId} onChange={setLoginId} placeholder="you@example.com" />
            <TextField label="Password" value={password} onChange={setPassword} type="password" />
            <button className="primary-button" onClick={() => setMode("register")}>
              Continue with local setup
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            <TextField label="Login ID" value={loginId} onChange={setLoginId} placeholder="Your login ID" />
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
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="secondary-button" onClick={() => setMode(mode === "register" ? "login" : "register")}>
            {mode === "register" ? "Back to login" : "Create local account"}
          </button>
          <button className="secondary-button" onClick={() => setMode("connect")}>
            <RefreshCw size={18} /> Connect With Us
          </button>
        </div>
      </Panel>
    </div>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`nav-button ${active ? "nav-button-active" : ""}`} onClick={onClick}>
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
          <div>
            <h1 className="text-2xl font-semibold">{config.appName}</h1>
            <p className="text-slate-500">{config.tagline}</p>
          </div>
        </div>
        <div className="grid gap-3">
          <button className="choice-button" onClick={() => setMode("offline")}>
            <WalletCards />
            <span>Use Offline</span>
          </button>
          <button className="choice-button" onClick={() => setMode("connect")}>
            <RefreshCw />
            <span>Connect With Us</span>
          </button>
        </div>
      </div>
    );
  }

  if (mode === "connect") {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-8">
        <Panel title="Connect With Us">
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
}: {
  snapshot: Snapshot;
  balances: { account: Account; balance: number }[];
  currency: string;
  totalBalance: number;
  summary: ReturnType<typeof summarize>;
  onDone: () => Promise<void>;
}) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total balance" value={formatMoney(totalBalance, currency)} icon={<WalletCards size={20} />} />
        <StatCard label="Month income" value={formatMoney(summary.monthlyIncome, currency)} icon={<ArrowDownLeft size={20} />} />
        <StatCard label="Month expenses" value={formatMoney(summary.monthlyExpenses, currency)} icon={<ArrowUpRight size={20} />} />
        <StatCard label="Today spent" value={formatMoney(summary.todaySpend, currency)} icon={<CalendarDays size={20} />} />
      </div>

      <QuickTransaction snapshot={snapshot} onDone={onDone} />

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

function QuickTransaction({ snapshot, onDone }: { snapshot: Snapshot; onDone: () => Promise<void> }) {
  const expenseCategory = snapshot.categories.find((item) => item.kind === "expense");
  const incomeCategory = snapshot.categories.find((item) => item.kind === "income");
  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(snapshot.accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(snapshot.accounts[1]?.id ?? "");
  const [categoryId, setCategoryId] = useState(expenseCategory?.id ?? "");
  const [note, setNote] = useState("");

  useEffect(() => {
    setCategoryId(type === "income" ? incomeCategory?.id ?? "" : expenseCategory?.id ?? "");
  }, [type, expenseCategory?.id, incomeCategory?.id]);

  const save = async () => {
    const timestamp = nowIso();
    await db.transactions.put({
      id: createId(),
      type,
      amount: Number(amount) || 0,
      accountId,
      toAccountId: type === "transfer" ? toAccountId : undefined,
      categoryId: type === "transfer" ? undefined : categoryId,
      date: timestamp,
      note,
      createdAt: timestamp,
      updatedAt: timestamp,
      syncState: snapshot.config.syncEnabled ? "queued" : "local",
    });
    setAmount("");
    setNote("");
    await onDone();
  };

  return (
    <Panel title="Quick Add">
      <div className="grid gap-3 md:grid-cols-[140px_1fr_1fr_1fr_auto]">
        <select className="field-input" value={type} onChange={(event) => setType(event.target.value as TransactionType)}>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="transfer">Transfer</option>
        </select>
        <input className="field-input" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" />
        <select className="field-input" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          {snapshot.accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        {type === "transfer" ? (
          <select className="field-input" value={toAccountId} onChange={(event) => setToAccountId(event.target.value)}>
            {snapshot.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        ) : (
          <select className="field-input" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            {snapshot.categories
              .filter((category) => category.kind === (type === "income" ? "income" : "expense") && category.active)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </select>
        )}
        <button className="primary-button" onClick={save} disabled={!amount || !accountId}>
          Save
        </button>
      </div>
      <input className="field-input mt-3" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Note" />
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
  const summary = summarize(snapshot.transactions);
  const spending = categorySpend(snapshot.categories, snapshot.transactions);
  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Income" value={formatMoney(summary.monthlyIncome, currency)} />
        <StatCard label="Expenses" value={formatMoney(summary.monthlyExpenses, currency)} />
        <StatCard label="Savings" value={formatMoney(summary.monthlySavings, currency)} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Category Spending">
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
        <Panel title="Budgets">
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
                      <span style={{ width: `${usage.percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            {snapshot.budgets.length === 0 ? <Empty text="Create budgets in Settings." /> : null}
          </div>
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
          const dailySpend = snapshot.transactions
            .filter((item) => item.type === "expense" && sameDay(item.date, date))
            .reduce((sum, item) => sum + item.amount, 0);
          return (
            <button className={`calendar-day ${date === selectedDate ? "calendar-day-active" : ""}`} key={date} onClick={() => setSelectedDate(date)}>
              <span>{Number(date.slice(-2))}</span>
              <strong>{dailySpend ? formatMoney(dailySpend, currency) : ""}</strong>
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

function PeopleView({ snapshot, currency, onDone }: { snapshot: Snapshot; currency: string; onDone: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [personId, setPersonId] = useState(snapshot.people[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"to_me" | "by_me">("to_me");
  const [note, setNote] = useState("");

  const addPerson = async () => {
    const timestamp = nowIso();
    await db.people.put({
      id: createId(),
      localDisplayName: name,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      syncState: snapshot.config.syncEnabled ? "queued" : "local",
    });
    setName("");
    await onDone();
  };

  const addSettlement = async () => {
    const timestamp = nowIso();
    await db.settlements.put({
      id: createId(),
      personId,
      direction,
      originalAmount: Number(amount) || 0,
      repaidAmount: 0,
      date: timestamp,
      note,
      createdAt: timestamp,
      updatedAt: timestamp,
      syncState: snapshot.config.syncEnabled ? "queued" : "local",
    });
    setAmount("");
    setNote("");
    await onDone();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="People">
        <div className="grid gap-3">
          <div className="flex gap-2">
            <input className="field-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Local display name" />
            <button className="primary-button" onClick={addPerson} disabled={!name.trim()}>
              Add
            </button>
          </div>
          {snapshot.people.map((person) => (
            <div className="row" key={person.id}>
              <span>{person.localDisplayName}</span>
              <strong>{formatMoney(personBalance(person, snapshot.settlements), currency)}</strong>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Owe / Owed">
        <div className="grid gap-3">
          <select className="field-input" value={personId} onChange={(event) => setPersonId(event.target.value)}>
            {snapshot.people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.localDisplayName}
              </option>
            ))}
          </select>
          <select className="field-input" value={direction} onChange={(event) => setDirection(event.target.value as "to_me" | "by_me")}>
            <option value="to_me">Someone owes me</option>
            <option value="by_me">I owe someone</option>
          </select>
          <input className="field-input" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" />
          <input className="field-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Note" />
          <button className="primary-button" onClick={addSettlement} disabled={!personId || !amount}>
            Record
          </button>
        </div>
      </Panel>
    </div>
  );
}

function SettingsView({ snapshot, onDone }: { snapshot: Snapshot; onDone: () => Promise<void> }) {
  const [categoryName, setCategoryName] = useState("");
  const [categoryKind, setCategoryKind] = useState<"expense" | "income">("expense");
  const [budgetCategoryId, setBudgetCategoryId] = useState(snapshot.categories.find((item) => item.kind === "expense")?.id ?? "");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [connectId, setConnectId] = useState("");
  const [connectPassword, setConnectPassword] = useState("");
  const [groqApiKey, setGroqApiKey] = useState(snapshot.config.groqApiKey ?? "");
  const [aiModel, setAiModel] = useState(snapshot.config.aiModel);

  const addCategory = async () => {
    const timestamp = nowIso();
    await db.categories.put({
      id: createId(),
      name: categoryName,
      kind: categoryKind,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      syncState: snapshot.config.syncEnabled ? "queued" : "local",
    });
    setCategoryName("");
    await onDone();
  };

  const addBudget = async () => {
    const timestamp = nowIso();
    await db.budgets.put({
      id: createId(),
      categoryId: budgetCategoryId,
      amount: Number(budgetAmount) || 0,
      period: "monthly",
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      syncState: snapshot.config.syncEnabled ? "queued" : "local",
    });
    setBudgetAmount("");
    await onDone();
  };

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
    const payload = JSON.parse(await file.text()) as ImportPayload;
    if (!payload.accounts || !payload.transactions || !payload.categories) {
      alert("Import file is not valid.");
      return;
    }
    const duplicateIds = payload.transactions.filter((item) => snapshot.transactions.some((existing) => existing.id === item.id)).length;
    const shouldImport = confirm(`Import ${payload.transactions.length} transactions and ${payload.accounts.length} accounts? Duplicate transactions: ${duplicateIds}. Existing data will be merged.`);
    if (!shouldImport) return;
    await db.transaction(
      "rw",
      [db.accounts, db.categories, db.transactions, db.budgets, db.recurringTransactions, db.people, db.settlements],
      async () => {
        await db.accounts.bulkPut(payload.accounts);
        await db.categories.bulkPut(payload.categories);
        await db.transactions.bulkPut(payload.transactions);
        await db.budgets.bulkPut(payload.budgets ?? []);
        await db.recurringTransactions.bulkPut(payload.recurringTransactions ?? []);
        await db.people.bulkPut(payload.people ?? []);
        await db.settlements.bulkPut(payload.settlements ?? []);
      },
    );
    await onDone();
  };

  const updateConfigToggle = async (key: "syncEnabled" | "aiEnabled", value: boolean) => {
    await db.appConfig.update("primary", { [key]: value, updatedAt: nowIso() });
    await onDone();
  };

  const saveAiConfig = async () => {
    await db.appConfig.update("primary", { groqApiKey, aiModel, aiEnabled: Boolean(groqApiKey), updatedAt: nowIso() });
    await onDone();
  };

  const connectProfile = async () => {
    if (!snapshot.profile || !connectId || !connectPassword) return;
    const timestamp = nowIso();
    await db.transaction(
      "rw",
      [db.profiles, db.accounts, db.categories, db.transactions, db.budgets, db.recurringTransactions, db.people, db.settlements, db.appConfig],
      async () => {
        await db.profiles.update(snapshot.profile!.id, {
          connectedUserId: connectId,
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
        await db.appConfig.update("primary", { syncEnabled: true, updatedAt: timestamp });
      },
    );
    setConnectPassword("");
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
            <TextField label="Connect ID" value={connectId} onChange={setConnectId} placeholder="Email or phone" />
            <TextField label="Password" value={connectPassword} onChange={setConnectPassword} type="password" />
            <button className="primary-button" onClick={connectProfile} disabled={!connectId || !connectPassword}>
              <RefreshCw size={18} /> Connect With Us
            </button>
          </div>
        )}
      </Panel>

      <Panel title="AI Chat">
        <div className="grid gap-3">
          <TextField label="Groq API key" value={groqApiKey} onChange={setGroqApiKey} type="password" placeholder="Paste API key" />
          <TextField label="Model" value={aiModel} onChange={setAiModel} placeholder="llama-3.1-8b-instant" />
          <button className="primary-button" onClick={saveAiConfig}>
            <Bot size={18} /> Save AI Settings
          </button>
        </div>
      </Panel>

      <Panel title="Categories">
        <div className="grid gap-3">
          <div className="grid grid-cols-[1fr_120px_auto] gap-2">
            <input className="field-input" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Category name" />
            <select className="field-input" value={categoryKind} onChange={(event) => setCategoryKind(event.target.value as "expense" | "income")}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            <button className="primary-button" onClick={addCategory} disabled={!categoryName.trim()}>
              Add
            </button>
          </div>
          {snapshot.categories.map((category) => (
            <div className="row" key={category.id}>
              <span>{category.name}</span>
              <strong>{category.kind}</strong>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Budgets">
        <div className="grid gap-3">
          <select className="field-input" value={budgetCategoryId} onChange={(event) => setBudgetCategoryId(event.target.value)}>
            {snapshot.categories
              .filter((category) => category.kind === "expense")
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </select>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input className="field-input" type="number" value={budgetAmount} onChange={(event) => setBudgetAmount(event.target.value)} placeholder="Monthly amount" />
            <button className="primary-button" onClick={addBudget} disabled={!budgetCategoryId || !budgetAmount}>
              Add
            </button>
          </div>
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

function AiChatView({ snapshot, currency }: { snapshot: Snapshot; currency: string }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    if (!question.trim()) return;
    if (!snapshot.config.groqApiKey) {
      alert("Add the Groq API key in Settings.");
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
            { role: "user", content: `Finance data:\n${JSON.stringify(context)}\n\nQuestion: ${userMessage}` },
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
    }
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
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              className="field-input"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") ask();
              }}
              placeholder="How much did I spend this month?"
            />
            <button className="primary-button" onClick={ask} disabled={loading || !question.trim()}>
              <Bot size={18} /> {loading ? "Asking" : "Ask"}
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function TransactionList({ snapshot, currency, transactions }: { snapshot: Snapshot; currency: string; transactions: Transaction[] }) {
  if (transactions.length === 0) return <Empty text="No transactions yet." />;
  return (
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
            </div>
            <strong className={transaction.type === "income" ? "text-emerald-700" : transaction.type === "expense" ? "text-rose-700" : "text-slate-800"}>
              {formatMoney(transaction.amount, currency)}
            </strong>
          </div>
        );
      })}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-slate-950">{title}</h2>
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
  return (
    <label className="grid gap-1">
      <span className="field-label">{label}</span>
      <input className="field-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
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
