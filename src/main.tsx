import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Cloud,
  Copy,
  CreditCard,
  Database,
  Download,
  Eye,
  EyeOff,
  FileJson,
  Grid2X2,
  Home,
  Image,
  Info,
  IndianRupee,
  KeyRound,
  Link as LinkIcon,
  LogOut,
  Mail,
  MessageCircle,
  Monitor,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Settings,
  Star,
  Sun,
  Tags,
  Target,
  Trash2,
  Upload,
  User,
  UserPlus,
  Users,
  WalletCards,
} from "lucide-react";
import { StatCard } from "./components/StatCard";
import { buildInfo } from "./lib/buildInfo";
import { accountBalance, budgetUsage, categorySpend, personBalance, sameDay, summarize } from "./lib/calculations";
import { AboutSettingsPage } from "./views/settings/AboutSettingsPage";
import { DataSettingsPage } from "./views/settings/DataSettingsPage";
import { ProfileSettingsPage } from "./views/settings/ProfileSettingsPage";
import { SecuritySettingsPage } from "./views/settings/SecuritySettingsPage";
import { SettingsTabPage } from "./views/settings/SettingsTabPage";
import { SettingsTabs } from "./views/settings/SettingsTabs";
import { SyncCloudSettingsPage } from "./views/settings/SyncCloudSettingsPage";
import { ToolsSettingsPage } from "./views/settings/ToolsSettingsPage";
import type { SettingsTabKey } from "./views/settings/types";
import {
  createConnectionCode,
  pullCloudAppConfig,
} from "./lib/cloud";
import { db, initializeDatabase } from "./lib/db";
import { createId, nowIso } from "./lib/defaults";
import { formatDate, formatMoney } from "./lib/format";
import {
  ApiClientError,
  assignAdminUserPlan,
  blockServerFriend,
  bootstrapAdmin,
  changeServerPin,
  clearAdminToken,
  clearServerToken,
  clearServerReceipts,
  deleteServerAccount,
  emailServerDataExport,
  ensureLocalProfileForServerUser,
  getAdminCatalog,
  getAdminDashboard,
  getAdminMe,
  getAdminToken,
  getRuntimeConfig,
  getServerToken,
  getServerReceiptUsage,
  listAdminUsers,
  listServerFriends,
  loginAdminAccount,
  logoutAdminAccount,
  loginServerAccount,
  listServerSettlementEvents,
  mirrorServerFriendEntity,
  pullServerSnapshot,
  pushServerSnapshot,
  registerServerAccount,
  removeServerFriend,
  requestServerFriend,
  requestServerRepayment,
  requestServerPasswordReset,
  respondServerRepayment,
  respondServerFriend,
  revokeAdminUserSessions,
  saveAdminSetting,
  saveAdminAd,
  saveAdminAnnouncement,
  saveAdminFeature,
  saveAdminPlan,
  setAdminUserStatus,
  setAdminUserReceiptLimit,
  setAdminPlanFeature,
  subscribeServerPush,
  unsubscribeServerPush,
  signServerReceipt,
  syncServerSnapshot,
  uploadServerReceipt,
  verifyServerFriend,
  type AdminAccount,
  type AdminCatalog,
  type AdminDashboard,
  type AdminUserRow,
  type RuntimeConfig,
  type ServerSettlementEvent,
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
  ChatMessageRecord,
  Transaction,
  TransactionType,
} from "./lib/types";
import "./styles/index.css";

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[app-startup]", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="startup-error-screen">
        <section className="startup-error-card">
          <h1>Micham could not start</h1>
          <p>{this.state.error.message || "Restart the app and try again."}</p>
        </section>
      </div>
    );
  }
}

const defaultAppLogoUrl = new URL("../Logos/Micham_app_logo.svg", import.meta.url).href;
const defaultWordmarkUrl = new URL("../Logos/Micham_bottom_wordmark_tagline.svg", import.meta.url).href;
const defaultDarkWordmarkUrl = new URL("../Logos/Micham_bottom_wordmark_tagline_dark.svg", import.meta.url).href;

function getEffectiveTheme(themeMode: AppConfig["themeMode"]) {
  if (themeMode !== "system") return themeMode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const THEME_MODE_KEY = "micham_theme_mode";

function shouldSendPushLikeNotification(message: string) {
  return /friend request|acknowledg|settlement|monthly report ready/i.test(message);
}

function formatNotificationTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = `${base64}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function rememberedThemeMode(value?: AppConfig["themeMode"]) {
  if (value) {
    localStorage.setItem(THEME_MODE_KEY, value);
    return value;
  }
  const stored = localStorage.getItem(THEME_MODE_KEY);
  return stored === "system" || stored === "light" || stored === "dark" ? stored : undefined;
}

type View = "dashboard" | "daily" | "add" | "monthly" | "calendar" | "people" | "manage" | "settings" | "admin" | "ai";
type SessionRole = "guest" | "user" | "admin";
type Toast = { id: string; tone: "success" | "error" | "warning" | "info"; message: string };
type AppNotification = { id: string; tone: Toast["tone"]; title: string; message: string; createdAt: string; read: boolean };

const fallbackRuntimeConfig: RuntimeConfig = {
  settings: {},
  flags: {},
  announcements: [],
  adPlacements: [],
};

const CURRENCY_OPTIONS = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "MYR"] as const;

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
    adminId: "Admin@sk",
    adminPassword: "2026",
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
const AI_CHAT_MESSAGE_LIMIT = 10;
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
const MAX_LOGO_BYTES = 1024 * 1024;
const MAX_RECEIPT_SOURCE_BYTES = 6 * 1024 * 1024;
const MAX_RECEIPT_COMPRESSED_BYTES = 900 * 1024;
const RECEIPT_IMAGE_MAX_SIDE = 1280;
const LOGO_IMAGE_MAX_SIDE = 512;

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read image."));
    reader.readAsDataURL(blob);
  });
}

async function loadBrowserImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Image could not be loaded."));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function compressImageFile(file: File, options: { maxSide: number; quality: number; maxBytes: number }) {
  const image = await loadBrowserImage(file);
  const scale = Math.min(1, options.maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image compression is not available in this browser.");
  context.drawImage(image, 0, 0, width, height);

  const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
  let quality = options.quality;
  let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, quality));
  while (blob && blob.size > options.maxBytes && quality > 0.46 && mimeType !== "image/png") {
    quality -= 0.08;
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, quality));
  }
  if (!blob) throw new Error("Image compression failed.");
  if (blob.size > options.maxBytes) throw new Error("Image is still too large after compression.");
  return blobToDataUrl(blob);
}

function applyServerReceipt<T extends { receiptName?: string; receiptData?: string; receiptPath?: string; receiptSize?: number; receiptMime?: string; receiptUploadedAt?: string }>(
  item: T,
  receipt?: { path: string; name: string; size: number; mime: string; uploadedAt: string },
) {
  if (!receipt) return item;
  return {
    ...item,
    receiptName: receipt.name,
    receiptData: undefined,
    receiptPath: receipt.path,
    receiptSize: receipt.size,
    receiptMime: receipt.mime,
    receiptUploadedAt: receipt.uploadedAt,
  };
}

async function maybeUploadReceipt(
  dataUrl: string,
  filename: string,
  relatedType: "transaction" | "settlement",
  relatedId: string,
  notify?: (message: string, tone?: Toast["tone"]) => void,
) {
  if (!dataUrl || !getServerToken()) return undefined;
  try {
    const { receipt } = await uploadServerReceipt({ dataUrl, filename: filename || "receipt.jpg", relatedType, relatedId });
    return receipt;
  } catch (error) {
    notify?.(error instanceof Error ? error.message : "Receipt could not be uploaded.", "error");
    throw error;
  }
}

async function openReceipt(record: { receiptData?: string; receiptPath?: string; receiptName?: string }, notify: (message: string, tone?: Toast["tone"]) => void) {
  try {
    if (record.receiptData) {
      const win = window.open();
      if (win) win.document.write(`<img src="${record.receiptData}" style="max-width:100%;height:auto" />`);
      else downloadDataUrl(record.receiptData, record.receiptName || "micham-receipt.jpg");
      return;
    }
    if (!record.receiptPath) {
      notify("No receipt attached.", "warning");
      return;
    }
    const { url } = await signServerReceipt(record.receiptPath);
    window.open(url, "_blank", "noopener,noreferrer");
  } catch (error) {
    notify(error instanceof Error ? error.message : "Receipt could not be opened.", "error");
  }
}

function downloadBlob(content: BlobPart, type: string, filename: string) {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

function escapeHtml(value: string | number | undefined | null) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function excelSheet(title: string, headers: string[], rows: Array<Array<string | number | undefined | null>>) {
  const headerHtml = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const rowHtml = rows
    .map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`)
    .join("");
  return `
    <div class="sheet">
      <h2>${escapeHtml(title)}</h2>
      <table>
        <thead><tr>${headerHtml}</tr></thead>
        <tbody>${rowHtml || `<tr><td colspan="${headers.length}">No data</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function excelWorkbook(title: string, sheets: string[]) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="ProgId" content="Excel.Sheet" />
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; }
    h1 { color: #005f46; }
    h2 { color: #005f46; margin-top: 24px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
    th { background: #dff7ec; color: #063d2f; font-weight: 700; }
    th, td { border: 1px solid #b9d8cc; padding: 8px; text-align: left; }
    .sheet { page-break-after: always; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${sheets.join("")}
</body>
</html>`;
}

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
  const [accounts, transactions, budgets, recurring, people, settlements, repayments, chatMessages] = await Promise.all([
    db.accounts.toArray(),
    db.transactions.toArray(),
    db.budgets.toArray(),
    db.recurringTransactions.toArray(),
    db.people.toArray(),
    db.settlements.toArray(),
    db.repayments.toArray(),
    db.chatMessages.toArray(),
  ]);
  await db.transaction(
    "rw",
    [db.accounts, db.transactions, db.budgets, db.recurringTransactions, db.people, db.settlements, db.repayments, db.chatMessages],
    async () => {
      await db.accounts.bulkPut(accounts.filter((item) => !item.ownerProfileId).map((item) => ({ ...item, ownerProfileId: profileId, updatedAt: timestamp })));
      await db.transactions.bulkPut(transactions.filter((item) => !item.ownerProfileId).map((item) => ({ ...item, ownerProfileId: profileId, updatedAt: timestamp })));
      await db.budgets.bulkPut(budgets.filter((item) => !item.ownerProfileId).map((item) => ({ ...item, ownerProfileId: profileId, updatedAt: timestamp })));
      await db.recurringTransactions.bulkPut(recurring.filter((item) => !item.ownerProfileId).map((item) => ({ ...item, ownerProfileId: profileId, updatedAt: timestamp })));
      await db.people.bulkPut(people.filter((item) => !item.ownerProfileId).map((item) => ({ ...item, ownerProfileId: profileId, updatedAt: timestamp })));
      await db.settlements.bulkPut(settlements.filter((item) => !item.ownerProfileId).map((item) => ({ ...item, ownerProfileId: profileId, updatedAt: timestamp })));
      await db.repayments.bulkPut(repayments.filter((item) => !item.ownerProfileId).map((item) => ({ ...item, ownerProfileId: profileId, updatedAt: timestamp })));
      await db.chatMessages.bulkPut(chatMessages.filter((item) => !item.ownerProfileId).map((item) => ({ ...item, ownerProfileId: profileId, updatedAt: timestamp })));
    },
  );
}

async function clearLocalProfileData(profileId: string) {
  const [accounts, categories, transactions, budgets, recurring, people, settlements, repayments, chatMessages] = await Promise.all([
    db.accounts.where("ownerProfileId").equals(profileId).primaryKeys(),
    db.categories.where("ownerProfileId").equals(profileId).primaryKeys(),
    db.transactions.where("ownerProfileId").equals(profileId).primaryKeys(),
    db.budgets.where("ownerProfileId").equals(profileId).primaryKeys(),
    db.recurringTransactions.where("ownerProfileId").equals(profileId).primaryKeys(),
    db.people.where("ownerProfileId").equals(profileId).primaryKeys(),
    db.settlements.where("ownerProfileId").equals(profileId).primaryKeys(),
    db.repayments.where("ownerProfileId").equals(profileId).primaryKeys(),
    db.chatMessages.where("ownerProfileId").equals(profileId).primaryKeys(),
  ]);
  await db.transaction(
    "rw",
    [db.profiles, db.accounts, db.categories, db.transactions, db.budgets, db.recurringTransactions, db.people, db.settlements, db.repayments, db.chatMessages],
    async () => {
      await db.accounts.bulkDelete(accounts as string[]);
      await db.categories.bulkDelete(categories as string[]);
      await db.transactions.bulkDelete(transactions as string[]);
      await db.budgets.bulkDelete(budgets as string[]);
      await db.recurringTransactions.bulkDelete(recurring as string[]);
      await db.people.bulkDelete(people as string[]);
      await db.settlements.bulkDelete(settlements as string[]);
      await db.repayments.bulkDelete(repayments as string[]);
      await db.chatMessages.bulkDelete(chatMessages as string[]);
      await db.profiles.delete(profileId);
    },
  );
}

async function createLocalProfile(config: AppConfig, displayName: string, currency = config.defaultCurrency) {
  const timestamp = nowIso();
  const profileId = createId();
  const passwordHash = await hashPassword(`local-${profileId}`);
  await db.transaction("rw", db.profiles, db.accounts, async () => {
    await db.profiles.put({
      id: profileId,
      loginId: `local:${profileId}`,
      passwordHash,
      connectionCode: createConnectionCode(),
      displayName: displayName.trim() || "Local User",
      currency,
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
    const requestDirection = link.status === "pending" ? (link.requested_by === profile.connectedUserId ? "outgoing" : "incoming") : undefined;
    const localStatus = link.status === "pending" ? (requestDirection === "outgoing" ? "requested" : "pending") : link.status;
    rows.push({
      id: existing?.id ?? link.owner_person_id ?? createId(),
      ownerProfileId: profile.id,
      localDisplayName: existing?.nickname || existing?.localDisplayName || friend.display_name,
      nickname: existing?.nickname,
      serverDisplayName: friend.display_name,
      inviteCode: friend.connection_code,
      connectedUserId: friend.connection_code,
      friendUserId: link.friend_id,
      status: localStatus,
      verified: link.status === "connected",
      requestDirection,
      active: link.status === "connected" || link.status === "pending",
      createdAt: existing?.createdAt ?? link.requested_at ?? timestamp,
      updatedAt: timestamp,
      syncState: "synced",
    });
  }

  if (rows.length) await db.people.bulkPut(rows);
}

async function syncPendingFriendMirrors(profile: Profile) {
  if (!getServerToken() || !profile.connectedUserId) return;
  const pending = await db.settlements
    .where("ownerProfileId")
    .equals(profile.id)
    .filter((settlement) => settlement.friendMirrorState === "queued" && !settlement.deletedAt)
    .toArray();
  if (!pending.length) return;
  const people = await db.people.where("ownerProfileId").equals(profile.id).toArray();
  for (const settlement of pending) {
    const person = people.find((item) => item.id === settlement.personId);
    if (person?.status !== "connected" || !person.connectedUserId || !person.friendUserId) continue;
    const mirroredSettlement: Settlement = {
      ...settlement,
      id: settlement.linkedSettlementId || `mirror-${settlement.id}`,
      ownerProfileId: undefined,
      personId: "",
      direction: settlement.direction === "to_me" ? "by_me" : "to_me",
      accountId: undefined,
      categoryId: undefined,
      transactionId: undefined,
      linkedSettlementId: settlement.id,
      friendUserId: profile.connectedUserId,
      friendMirrorState: "synced",
      friendMirrorError: undefined,
      syncState: "synced",
    };
    try {
      await mirrorServerFriendEntity(person.connectedUserId, "settlements", mirroredSettlement.id, { ...mirroredSettlement });
      await db.settlements.update(settlement.id, { friendMirrorState: "synced", friendMirrorError: undefined, updatedAt: nowIso() });
    } catch (error) {
      await db.settlements.update(settlement.id, {
        friendMirrorState: "queued",
        friendMirrorError: error instanceof Error ? error.message : "Friend sync failed.",
        updatedAt: nowIso(),
      });
    }
  }
}

async function uploadPendingReceipts(profile: Profile, notify?: (message: string, tone?: Toast["tone"]) => void) {
  if (!getServerToken() || !profile.connectedUserId) return;
  const [transactions, settlements] = await Promise.all([
    db.transactions.where("ownerProfileId").equals(profile.id).filter((item) => Boolean(item.receiptData && !item.receiptPath && !item.deletedAt)).toArray(),
    db.settlements.where("ownerProfileId").equals(profile.id).filter((item) => Boolean(item.receiptData && !item.receiptPath && !item.deletedAt)).toArray(),
  ]);
  for (const transaction of transactions.slice(0, 10)) {
    try {
      const receipt = await uploadServerReceipt({
        dataUrl: transaction.receiptData || "",
        filename: transaction.receiptName || "receipt.jpg",
        relatedType: "transaction",
        relatedId: transaction.id,
      });
      await db.transactions.update(transaction.id, {
        receiptName: receipt.receipt.name,
        receiptData: undefined,
        receiptPath: receipt.receipt.path,
        receiptSize: receipt.receipt.size,
        receiptMime: receipt.receipt.mime,
        receiptUploadedAt: receipt.receipt.uploadedAt,
        syncState: "queued",
        updatedAt: nowIso(),
      });
    } catch (error) {
      notify?.(error instanceof Error ? error.message : "A pending receipt could not be uploaded.", "warning");
    }
  }
  for (const settlement of settlements.slice(0, 10)) {
    try {
      const receipt = await uploadServerReceipt({
        dataUrl: settlement.receiptData || "",
        filename: settlement.receiptName || "receipt.jpg",
        relatedType: "settlement",
        relatedId: settlement.id,
      });
      await db.settlements.update(settlement.id, {
        receiptName: receipt.receipt.name,
        receiptData: undefined,
        receiptPath: receipt.receipt.path,
        receiptSize: receipt.receipt.size,
        receiptMime: receipt.receipt.mime,
        receiptUploadedAt: receipt.receipt.uploadedAt,
        syncState: "queued",
        updatedAt: nowIso(),
      });
    } catch (error) {
      notify?.(error instanceof Error ? error.message : "A pending shared-money receipt could not be uploaded.", "warning");
    }
  }
}

async function readSnapshot(profileId = ""): Promise<Snapshot> {
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
  return {
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
}

function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("dashboard");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [sessionRole, setSessionRole] = useState<SessionRole>(() => (localStorage.getItem("micham_role") as SessionRole) || "guest");
  const [currentProfileId, setCurrentProfileId] = useState(() => localStorage.getItem("micham_profile_id") || "");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState("");
  const [showTour, setShowTour] = useState(false);
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>(fallbackRuntimeConfig);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  const syncInFlightRef = React.useRef(false);
  const syncFailureCountRef = React.useRef(0);
  const snapshotRef = React.useRef(snapshot);

  const notify = (message: string, tone: Toast["tone"] = "info") => {
    const id = createId();
    const createdAt = nowIso();
    const title = tone === "error" ? "Action failed" : tone === "warning" ? "Needs attention" : tone === "success" ? "Done" : "Update";
    setToasts((items) => [...items, { id, message, tone }]);
    setNotifications((items) => [{ id, message, tone, title, createdAt, read: false }, ...items].slice(0, 40));
    if (shouldSendPushLikeNotification(message) && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      new Notification("Micham", { body: message, icon: "/icons/Micham_app_logo.svg", tag: id });
    }
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3200);
  };
  const dismissToast = (id: string) => setToasts((items) => items.filter((item) => item.id !== id));
  const unreadNotificationCount = notifications.filter((item) => !item.read).length;
  const toggleNotifications = () => {
    setShowNotifications((current) => {
      const next = !current;
      if (next) setNotifications((items) => items.map((item) => ({ ...item, read: true })));
      return next;
    });
  };
  const enablePushNotifications = async () => {
    if (pushBusy) return;
    const publicKey = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim();
    if (!publicKey) {
      notify("Push notification key is not configured.", "warning");
      return;
    }
    if (!getServerToken()) {
      notify("Login to cloud before enabling push notifications.", "warning");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      notify("Push notifications are not supported on this device.", "warning");
      return;
    }
    setPushBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        notify("Push notifications were not allowed.", "warning");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      if (existing) await unsubscribeServerPush(existing.endpoint).catch(() => undefined);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await subscribeServerPush(subscription);
      notify("Push notifications enabled.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Push notifications could not be enabled.", "error");
    } finally {
      setPushBusy(false);
    }
  };
  const previousViewRef = React.useRef<View>("dashboard");
  const navigateTo = (nextView: View) => {
    setView((currentView) => {
      if (currentView !== nextView) previousViewRef.current = currentView;
      return nextView;
    });
  };
  const navigateBack = () => setView(previousViewRef.current || "dashboard");

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const refresh = async (profileId = currentProfileId, options: { syncCloud?: boolean } = {}) => {
    const nextSnapshot = await readSnapshot(profileId);
    setSnapshot(nextSnapshot);

    if (options.syncCloud !== false && getServerToken() && nextSnapshot.config.syncEnabled && nextSnapshot.profile?.connectedUserId) {
      uploadPendingReceipts(nextSnapshot.profile, notify)
        .then(() => readSnapshot(currentProfileId))
        .then((receiptReadySnapshot) => syncServerSnapshot(receiptReadySnapshot))
        .then(async () => {
          await syncServerFriendsToLocal(nextSnapshot.profile!);
          await syncPendingFriendMirrors(nextSnapshot.profile!);
        })
        .catch((error: unknown) => {
          notify(error instanceof Error ? error.message : "Server sync failed.", "error");
        });
    } else if (options.syncCloud !== false && getServerToken() && nextSnapshot.profile?.connectedUserId) {
      syncServerFriendsToLocal(nextSnapshot.profile).then(() => syncPendingFriendMirrors(nextSnapshot.profile!)).catch((error: unknown) => {
        notify(error instanceof Error ? error.message : "Friend refresh failed.", "error");
      });
    }
  };

  useEffect(() => {
    initializeDatabase()
      .then(async () => {
        const mode = rememberedThemeMode();
        if (mode) await db.appConfig.update("primary", { themeMode: mode, updatedAt: nowIso() });
      })
      .then(() => pullCloudAppConfig().catch(() => undefined))
      .then(() => getRuntimeConfig().then(setRuntimeConfig).catch(() => fallbackRuntimeConfig))
      .then(() => refresh())
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!getServerToken() || !currentProfileId || !snapshot.config.syncEnabled || !snapshot.profile?.connectedUserId) return undefined;
    let cancelled = false;
    let timer = 0;

    const schedule = (delayMs: number) => {
      timer = window.setTimeout(run, delayMs);
    };
    const run = async () => {
      if (cancelled) return;
      const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
      if (document.hidden || isOffline || syncInFlightRef.current) {
        schedule(45000);
        return;
      }
      syncInFlightRef.current = true;
      try {
        const latestSnapshot = snapshotRef.current;
        if (!latestSnapshot.profile?.connectedUserId || !latestSnapshot.config.syncEnabled) {
          schedule(45000);
          return;
        }
        await uploadPendingReceipts(latestSnapshot.profile, notify);
        const receiptReadySnapshot = await readSnapshot(currentProfileId);
        await syncServerSnapshot(receiptReadySnapshot);
        await syncServerFriendsToLocal(latestSnapshot.profile);
        await syncPendingFriendMirrors(latestSnapshot.profile);
        await refresh(currentProfileId, { syncCloud: false });
        syncFailureCountRef.current = 0;
        schedule(45000);
      } catch {
        syncFailureCountRef.current += 1;
        const backoff = Math.min(5 * 60 * 1000, 15000 * 2 ** syncFailureCountRef.current);
        schedule(backoff + Math.floor(Math.random() * 3000));
      } finally {
        syncInFlightRef.current = false;
      }
    };

    schedule(5000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentProfileId, snapshot.config.syncEnabled, snapshot.profile?.connectedUserId]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => setSystemTheme(media.matches ? "dark" : "light");
    updateSystemTheme();
    media.addEventListener("change", updateSystemTheme);
    return () => media.removeEventListener("change", updateSystemTheme);
  }, []);

  useEffect(() => {
    const openManage = () => navigateTo("manage");
    window.addEventListener("micham:open-manage", openManage);
    return () => window.removeEventListener("micham:open-manage", openManage);
  }, []);

  useEffect(() => {
    const effectiveTheme = snapshot.config.themeMode === "system" ? systemTheme : snapshot.config.themeMode;
    document.documentElement.style.setProperty("--brand", snapshot.config.primaryColor);
    document.documentElement.style.setProperty("--accent", snapshot.config.accentColor);
    document.documentElement.style.setProperty("--surface", effectiveTheme === "dark" ? "#071713" : snapshot.config.surfaceColor);
    document.documentElement.style.setProperty("--text", effectiveTheme === "dark" ? "#eafff7" : snapshot.config.textColor);
    document.documentElement.dataset.theme = effectiveTheme;
    document.documentElement.dataset.themeMode = snapshot.config.themeMode;
    document.title = snapshot.config.appName;
  }, [snapshot.config, systemTheme]);

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
  const runtimeSettings = runtimeConfig?.settings ?? {};
  const runtimeFlags = runtimeConfig?.flags ?? {};
  const devModeUsers = Array.isArray(runtimeSettings.dev_mode_users) ? runtimeSettings.dev_mode_users.map(String) : [];
  const devModeEnabled =
    runtimeSettings.dev_mode_all === true ||
    Boolean(snapshot.profile?.connectedUserId && devModeUsers.includes(snapshot.profile.connectedUserId)) ||
    Boolean(snapshot.profile?.loginId && devModeUsers.includes(snapshot.profile.loginId));
  const runtimeFlag = (key: string) => runtimeFlags[key]?.enabled !== false;
  const registrationEnabled = runtimeFlag("registration") && runtimeSettings.registration_enabled !== false;
  const friendsEnabled = runtimeFlag("friends");
  const settlementsEnabled = runtimeFlag("settlements");
  const aiEnabled = snapshot.config.aiEnabled;
  const effectiveTheme = snapshot.config.themeMode === "system" ? systemTheme : snapshot.config.themeMode;
  const topbarWordmarkUrl = effectiveTheme === "dark" ? defaultDarkWordmarkUrl : defaultWordmarkUrl;
  const maintenanceMode = runtimeSettings.maintenance_mode === true;
  const logoutUser = () => {
    localStorage.removeItem("micham_role");
    localStorage.removeItem("micham_profile_id");
    clearServerToken();
    setSessionRole("guest");
    setCurrentProfileId("");
  };

  useEffect(() => {
    const handleExpiredSession = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      notify(detail?.message || "Session expired. Please login again.", "warning");
      logoutUser();
    };
    window.addEventListener("micham:session-expired", handleExpiredSession);
    return () => window.removeEventListener("micham:session-expired", handleExpiredSession);
  }, []);

  useEffect(() => {
    if (!devModeEnabled) return undefined;
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail || {};
      const path = typeof detail.path === "string" ? detail.path : "api";
      const status = typeof detail.status === "number" ? detail.status : 0;
      const requestId = typeof detail.requestId === "string" ? ` · ${detail.requestId}` : "";
      if (detail.ok) {
        notify(`${path} OK ${status}${requestId}`, "info");
        return;
      }
      const error = typeof detail.error === "string" ? ` · ${detail.error}` : "";
      notify(`${path} failed ${status}${error}${requestId}`, "error");
    };
    window.addEventListener("micham:api-debug", listener);
    return () => window.removeEventListener("micham:api-debug", listener);
  }, [devModeEnabled, snapshot.profile?.connectedUserId, snapshot.profile?.loginId]);

  if (loading) return <SplashScreen config={snapshot.config} />;

  if (sessionRole === "admin") {
    return (
      <Shell snapshot={snapshot}>
        <main className="mx-auto w-full max-w-6xl px-4 py-5">
          <AdminView
            snapshot={snapshot}
            notify={notify}
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
          registrationEnabled={registrationEnabled}
          notify={notify}
          onLogin={async (profileId) => {
            localStorage.setItem("micham_role", "user");
            localStorage.setItem("micham_profile_id", profileId);
            setSessionRole("user");
            setCurrentProfileId(profileId);
            await claimUnownedData(profileId);
            await db.appConfig.update("primary", { syncEnabled: true, updatedAt: nowIso() });
            await refresh(profileId);
            if (localStorage.getItem("micham_tour_seen") !== "true") setShowTour(true);
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
        <header className="app-header">
          <div className="app-topbar">
            <div className="brand-lockup">
              <img className="topbar-wordmark" src={topbarWordmarkUrl} alt={snapshot.config.appName} />
            </div>
            <div className="notification-wrap">
              <button className="icon-button notification-button" title="Notifications" onClick={toggleNotifications} type="button">
                <Bell size={18} />
                {unreadNotificationCount ? <span /> : null}
              </button>
              {showNotifications ? (
                <NotificationPopover
                  notifications={notifications}
                  pushBusy={pushBusy}
                  onEnablePush={enablePushNotifications}
                  onClear={() => setNotifications([])}
                  onClose={() => setShowNotifications(false)}
                />
              ) : null}
            </div>
            <button className="profile-button" title="Settings" onClick={() => navigateTo("settings")}>
              <CircleUserRound size={22} />
            </button>
          </div>
        </header>

        <main className="app-main">
          {view === "dashboard" && (
            <Dashboard
              snapshot={snapshot}
              balances={balances}
              currency={currency}
              totalBalance={totalBalance}
              summary={summary}
              onDone={refresh}
              onNavigate={navigateTo}
            />
          )}
          {view === "add" && <AddView snapshot={snapshot} notify={notify} onDone={refresh} onBack={navigateBack} />}
          {view === "daily" && (
            <DailyView snapshot={snapshot} currency={currency} selectedDate={selectedDate} setSelectedDate={setSelectedDate} notify={notify} onDone={refresh} />
          )}
          {view === "monthly" && <MonthlyView snapshot={snapshot} currency={currency} notify={notify} onDone={refresh} />}
          {view === "calendar" && (
            <CalendarView snapshot={snapshot} currency={currency} selectedDate={selectedDate} setSelectedDate={setSelectedDate} notify={notify} onDone={refresh} />
          )}
          <RuntimeAnnouncements runtimeConfig={runtimeConfig} />
          {maintenanceMode ? <div className="runtime-banner runtime-banner-warning"><strong>Maintenance mode</strong><span>Some online actions may be temporarily unavailable.</span></div> : null}
          {view === "people" && <PeopleView snapshot={snapshot} currency={currency} notify={notify} onDone={refresh} />}
          {view === "manage" && <ManageView snapshot={snapshot} notify={notify} onDone={refresh} onNavigate={navigateTo} />}
          {view === "settings" && (
            <SettingsView
              snapshot={snapshot}
              notify={notify}
              onDone={refresh}
              onLogout={logoutUser}
              onNavigate={navigateTo}
              onStartTour={() => setShowTour(true)}
              onProfileRestored={setCurrentProfileId}
            />
          )}
          {view === "ai" && <AiChatView snapshot={snapshot} currency={currency} notify={notify} onNavigate={navigateTo} onBack={navigateBack} />}
        </main>

        <nav className="bottom-nav sticky bottom-0 z-20">
          <div className="bottom-nav-main mx-auto grid max-w-6xl grid-cols-5 gap-1 px-2 py-2 text-xs">
            <NavButton icon={<Home size={18} />} label="Home" active={view === "dashboard"} onClick={() => navigateTo("dashboard")} />
            <NavButton icon={<CalendarDays size={18} />} label="Activity" active={view === "daily"} onClick={() => navigateTo("daily")} />
            <button className={`add-nav-button ${view === "add" ? "add-nav-button-active" : ""}`} onClick={() => navigateTo("add")}>
              <Plus size={24} />
              <span>Add</span>
            </button>
            <NavButton icon={<BarChart3 size={18} />} label="Insights" active={view === "monthly"} onClick={() => navigateTo("monthly")} />
            <NavButton icon={<Users size={18} />} label="People" active={view === "people"} disabled={!friendsEnabled && !settlementsEnabled} onClick={() => { if (friendsEnabled || settlementsEnabled) navigateTo("people"); }} />
          </div>
        </nav>
        {aiEnabled && view !== "ai" ? (
          <button className="ai-fab" onClick={() => navigateTo("ai")} title="Micham assistant" type="button">
            <Bot size={22} />
          </button>
        ) : null}
      </div>
      {busyMessage ? <BusyOverlay message={busyMessage} /> : null}
      {showTour ? <UserTour onClose={() => {
        localStorage.setItem("micham_tour_seen", "true");
        setShowTour(false);
      }} /> : null}
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
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

function SplashScreen({ config }: { config: AppConfig }) {
  const wordmarkUrl = getEffectiveTheme(config.themeMode) === "dark" ? defaultDarkWordmarkUrl : defaultWordmarkUrl;
  return (
    <div className="splash-screen">
      <div className="splash-mark">
        <img className="splash-logo" src={config.logoImage || defaultAppLogoUrl} alt={`${config.appName} logo`} />
        <img className="splash-wordmark" src={wordmarkUrl} alt={config.appName} />
        <span className="splash-pulse" />
      </div>
    </div>
  );
}

function BusyOverlay({ message }: { message: string }) {
  return (
    <div className="busy-overlay" role="status" aria-live="polite">
      <div className="busy-card">
        <span className="busy-spinner" />
        <strong>{message}</strong>
      </div>
    </div>
  );
}

function UserTour({ onClose }: { onClose: () => void }) {
  const steps = [
    {
      title: "Start From Home",
      body: "See balance, month savings, today spend, accounts, and quick actions in one place.",
      icon: <Home size={22} />,
    },
    {
      title: "Add Money Flow",
      body: "Use Add for expenses, income, transfers, receipts, and split or friend-related records.",
      icon: <Plus size={22} />,
    },
    {
      title: "Track Friends",
      body: "Send requests by connection code, set nicknames, record owe/owed, and approve repayments from both sides.",
      icon: <Users size={22} />,
    },
    {
      title: "Control Settings",
      body: "Manage sync, AI chat, PIN, export, account deletion, and local-to-cloud connection.",
      icon: <Settings size={22} />,
    },
  ];
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const isLast = index === steps.length - 1;
  return (
    <div className="tour-backdrop" role="dialog" aria-modal="true">
      <section className="tour-card">
        <div className="tour-icon">{step.icon}</div>
        <div className="tour-copy">
          <span>Step {index + 1} of {steps.length}</span>
          <h2>{step.title}</h2>
          <p>{step.body}</p>
        </div>
        <div className="tour-dots">
          {steps.map((item, dotIndex) => (
            <button key={item.title} className={dotIndex === index ? "tour-dot-active" : ""} aria-label={`Go to ${item.title}`} onClick={() => setIndex(dotIndex)} />
          ))}
        </div>
        <div className="tour-actions">
          <button className="secondary-button" onClick={onClose}>Skip</button>
          <button className="primary-button" onClick={() => (isLast ? onClose() : setIndex((value) => value + 1))}>
            {isLast ? "Finish Tour" : "Next"}
          </button>
        </div>
      </section>
    </div>
  );
}

function Logo({ config }: { config: AppConfig }) {
  return <img className="app-logo-image" src={config.logoImage || defaultAppLogoUrl} alt={`${config.appName} logo`} />;
}

function Wordmark({ config }: { config: AppConfig }) {
  const wordmarkUrl = getEffectiveTheme(config.themeMode) === "dark" ? defaultDarkWordmarkUrl : defaultWordmarkUrl;

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
  registrationEnabled,
  notify,
  onLogin,
  onAdminLogin,
}: {
  config: AppConfig;
  registrationEnabled: boolean;
  notify: (message: string, tone?: Toast["tone"]) => void;
  onLogin: (profileId: string) => Promise<void>;
  onAdminLogin: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [localName, setLocalName] = useState("");
  const [currency, setCurrency] = useState(config.defaultCurrency);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [showLocalUse, setShowLocalUse] = useState(false);
  const [busyAction, setBusyAction] = useState<"" | "login" | "register" | "local" | "reset">("");

  useEffect(() => {
    if (!registrationEnabled && mode === "register") setMode("login");
  }, [registrationEnabled, mode]);

  useEffect(() => {
    setFormError("");
    setFormSuccess("");
    setPassword("");
  }, [mode]);

  const login = async () => {
    if (busyAction) return;
    setBusyAction("login");
    setFormError("");
    setFormSuccess("");
    try {
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
        try {
          await loginAdminAccount(normalizedLoginId, password);
          resetRateLimit(`micham_login_${normalizedLoginId}`);
          await onAdminLogin();
          return;
        } catch {
          setFormError("Use your account email to login.");
          return;
        }
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
        setFormError("Invalid email or PIN.");
        notify("Invalid email or PIN.", "error");
        return;
      }
      if (!profile.connectionCode) {
        await db.profiles.update(profile.id, { connectionCode: createConnectionCode(), updatedAt: nowIso() });
      }
      resetRateLimit(`micham_login_${normalizedLoginId}`);
      await onLogin(profile.id);
    } finally {
      setBusyAction("");
    }
  };

  const register = async () => {
    if (busyAction) return;
    if (!registrationEnabled) {
      setFormError("Account creation is temporarily unavailable.");
      notify("Account creation is temporarily unavailable.", "warning");
      return;
    }
    setBusyAction("register");
    setFormError("");
    setFormSuccess("");
    try {
      const normalizedLoginId = loginId.trim().toLowerCase();
      if (!isValidEmail(normalizedLoginId)) {
        setFormError("Enter a valid email address.");
        notify("Enter a valid email address.", "error");
        return;
      }
      if (!/^\d{4}$/.test(password)) {
        setFormError("PIN must be exactly 4 digits.");
        notify("PIN must be exactly 4 digits.", "error");
        return;
      }
      await registerServerAccount(normalizedLoginId, password, displayName || normalizedLoginId.split("@")[0], currency);
      const message = "Verification email sent. Open your mail, verify the account, then login.";
      setFormSuccess(message);
      notify(message, "success");
      setMode("login");
      setPassword("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Account could not be created.");
      notify(error instanceof Error ? error.message : "Account could not be created.", "error");
    } finally {
      setBusyAction("");
    }
  };

  const useLocally = async () => {
    if (busyAction) return;
    setBusyAction("local");
    setFormError("");
    setFormSuccess("");
    try {
      if (!localName.trim()) {
        setFormError("Enter your name for local usage.");
        return;
      }
      const profileId = await createLocalProfile(config, localName, currency);
      notify("Using local device storage.", "success");
      await onLogin(profileId);
    } finally {
      setBusyAction("");
    }
  };

  const resetPassword = async () => {
    if (busyAction) return;
    setBusyAction("reset");
    setFormError("");
    setFormSuccess("");
    try {
      const normalizedLoginId = loginId.trim().toLowerCase();
      if (!isValidEmail(normalizedLoginId)) {
        setFormError("Enter the email used for this account.");
        return;
      }
      await requestServerPasswordReset(normalizedLoginId);
      const message = "PIN reset link sent to your email. Open the link, create a new PIN, then login.";
      notify(message, "success");
      setMode("login");
      window.setTimeout(() => setFormSuccess(message), 0);
      setPassword("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to send reset link.");
      notify(error instanceof Error ? error.message : "Unable to send reset link.", "error");
    } finally {
      setBusyAction("");
    }
  };

  const modeTitle = mode === "register" ? "Create your account" : mode === "reset" ? "Forgot PIN" : "Welcome back";
  const modeSubtitle =
    mode === "register"
      ? "Create a cloud account with your email and 4-digit PIN."
      : mode === "reset"
        ? "Enter your email and we will send a secure PIN reset link."
        : "Use locally without signup, or login with email.";

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
          {registrationEnabled ? <button className={mode === "register" ? "auth-tab-active" : ""} onClick={() => setMode("register")}>Create</button> : null}
        </div>
        {formError ? (
          <div className="form-message form-error">
            <span>{formError}</span>
            <button type="button" onClick={() => setFormError("")} aria-label="Close error">×</button>
          </div>
        ) : null}
        {formSuccess ? (
          <div className="form-message form-success">
            <span>{formSuccess}</span>
            <button type="button" onClick={() => setFormSuccess("")} aria-label="Close message">×</button>
          </div>
        ) : null}
        {mode === "login" ? (
          <div className="local-entry">
            <button className={`local-toggle ${showLocalUse ? "local-toggle-active" : ""}`} onClick={() => setShowLocalUse((value) => !value)}>
              <WalletCards size={19} /> Use Locally
              <ChevronDown size={18} />
            </button>
            {showLocalUse ? (
              <div className="local-panel">
                <div className="grid gap-3">
                  <TextField label="Local name" value={localName} onChange={setLocalName} placeholder="Your name" />
                  <CurrencySelect value={currency} onChange={setCurrency} />
                </div>
                <LoadingButton className="local-use-button" loading={busyAction === "local"} onClick={useLocally}>
                  Start Local Profile
                </LoadingButton>
                <p>Your data stays on this device until you create an account and enable sync.</p>
              </div>
            ) : null}
            <div className="auth-divider"><span>cloud login</span></div>
          </div>
        ) : null}
        {mode === "reset" ? (
          <div className="grid gap-4">
            <TextField label="Email" value={loginId} onChange={setLoginId} placeholder="you@example.com" />
            <LoadingButton className="primary-button" loading={busyAction === "reset"} onClick={resetPassword} disabled={!loginId}>
              Send Reset Link
            </LoadingButton>
            <button type="button" className="link-button" onClick={() => setMode("login")}>
              Back to login
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            <TextField label="Email" value={loginId} onChange={setLoginId} placeholder="you@example.com" />
            <TextField label="4-digit PIN" value={password} onChange={(value) => setPassword(value.replace(/\D/g, "").slice(0, 4))} type="password" />
            {mode === "register" ? (
              <>
                <TextField label="Display name" value={displayName} onChange={setDisplayName} placeholder="Your name" />
                <CurrencySelect value={currency} onChange={setCurrency} />
              </>
            ) : null}
            <LoadingButton className="primary-button" loading={busyAction === (mode === "register" ? "register" : "login")} onClick={mode === "register" ? register : login} disabled={!loginId || !password}>
              {mode === "register" ? "Create Account" : "Login"}
            </LoadingButton>
            {mode === "login" ? (
              <button type="button" className="link-button" onClick={() => setMode("reset")}>
                Forgot PIN?
              </button>
            ) : null}
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

function RuntimeAnnouncements({ runtimeConfig }: { runtimeConfig: RuntimeConfig }) {
  const dismissedKey = "micham_dismissed_announcements";
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(dismissedKey);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const visible = (runtimeConfig.announcements ?? []).filter((item) => !dismissed.includes(item.id)).slice(0, 2);
  if (visible.length === 0) return null;
  const dismiss = (id: string) => {
    const next = [...dismissed, id].slice(-50);
    setDismissed(next);
    localStorage.setItem(dismissedKey, JSON.stringify(next));
  };
  return (
    <div className="runtime-announcements">
      {visible.map((announcement) => (
        <div className="runtime-banner" key={announcement.id}>
          <div>
            <strong>{announcement.title}</strong>
            <span>{announcement.body}</span>
          </div>
          <button className="icon-button" title="Dismiss" onClick={() => dismiss(announcement.id)}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ))}
    </div>
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
        <Panel title="Use Locally First">
          <p className="text-sm text-slate-600">
            Start with local storage on this device. When you are ready, open Settings, create a 4-digit PIN, verify your email,
            and sync this same profile to the server.
          </p>
          <button className="primary-button mt-4" onClick={() => setMode("offline")}>
            Continue Locally
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
          <CurrencySelect value={currency} onChange={setCurrency} />
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
  const firstName = snapshot.profile?.displayName?.split(" ")[0] || "there";
  const topAccounts = balances.slice(0, 3);
  const recentTransactions = snapshot.transactions.slice(-3).reverse();
  return (
    <div className="app-page home-page">
      <div className="page-kicker">Good afternoon, {firstName}</div>
      <section className="home-hero">
        <div className="hero-month-pill">{new Date().toLocaleString("en", { month: "long" })}</div>
        <div>
          <p>Available balance</p>
          <h2>{formatMoney(totalBalance, currency)}</h2>
        </div>
        <div className="hero-mini-grid">
          <div>
            <span>Income</span>
            <strong>{formatMoney(summary.monthlyIncome, currency)}</strong>
          </div>
          <div>
            <span>Expenses</span>
            <strong>{formatMoney(summary.monthlyExpenses, currency)}</strong>
          </div>
        </div>
      </section>

      <div className="quick-actions-grid">
        <button className="action-tile action-expense" onClick={() => onNavigate("add")}>
          <ArrowUpRight size={20} />
          <span>Expense</span>
        </button>
        <button className="action-tile action-income" onClick={() => onNavigate("add")}>
          <ArrowDownLeft size={20} />
          <span>Income</span>
        </button>
        <button className="action-tile action-transfer" onClick={() => onNavigate("add")}>
          <ArrowRightLeft size={20} />
          <span>Transfer</span>
        </button>
      </div>

      <div className="section-head home-month-head">
        <span>This month</span>
        <button onClick={() => onNavigate("monthly")}>Insights</button>
      </div>
      <div className="mini-stat-grid home-month-stats">
        <div className="mini-stat-card">
          <span>Saved</span>
          <strong>{formatMoney(summary.monthlySavings, currency)}</strong>
          <p>{summary.monthlyIncome ? Math.max(0, Math.round((summary.monthlySavings / summary.monthlyIncome) * 100)) : 0}% of income</p>
        </div>
        <div className="mini-stat-card">
          <span>Spent today</span>
          <strong>{formatMoney(summary.todaySpend, currency)}</strong>
          <p>{summary.todaySpend ? "Tracked today" : "No expenses yet"}</p>
        </div>
      </div>

      <div className="section-head home-account-head">
        <span>Account snapshot</span>
        <button onClick={() => onNavigate("manage")}>All accounts</button>
      </div>
      <section className="snapshot-card home-account-snapshot">
        {topAccounts.map(({ account, balance }) => (
          <div className="snapshot-row" key={account.id}>
            <span className="snapshot-icon"><WalletCards size={15} /></span>
            <div>
              <strong>{account.name}</strong>
              <i><span style={{ width: `${Math.max(8, Math.min(100, Math.abs(balance / Math.max(totalBalance || 1, 1)) * 100))}%` }} /></i>
            </div>
            <b>{formatMoney(balance, currency)}</b>
          </div>
        ))}
        {topAccounts.length === 0 ? <Empty text="Create accounts to see the snapshot." /> : null}
      </section>

      <div className="section-head home-activity-head">
        <span>Recent activity</span>
        <button onClick={() => onNavigate("daily")}>See all</button>
      </div>
      <div className="home-activity-list">
        <TransactionList snapshot={snapshot} currency={currency} transactions={recentTransactions} notify={() => undefined} onDone={onDone} />
      </div>

      <button className="smart-insight" onClick={() => onNavigate(snapshot.config.aiEnabled ? "ai" : "monthly")}>
        <span><Bot size={16} /> Smart insight</span>
        <p>Your cash flow is positive. Check Insights for patterns or ask the assistant for guidance.</p>
      </button>
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
  onBack,
}: {
  snapshot: Snapshot;
  notify: (message: string, tone?: Toast["tone"]) => void;
  onDone: () => Promise<void>;
  onBack: () => void;
}) {
  return (
    <div className="app-page add-page">
      <div className="illustrated-page-head add-illustrated-head">
        <button className="back-button page-back-button" type="button" onClick={onBack} title="Back">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="page-title">Add Transaction</h2>
          <p className="page-subtitle">Record expense, income, or transfer quickly.</p>
        </div>
        <div className="page-head-icon-cluster" aria-hidden="true">
          <WalletCards size={30} />
          <IndianRupee size={20} />
        </div>
      </div>
      <QuickTransaction snapshot={snapshot} notify={notify} onDone={onDone} />
    </div>
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
  const [receiptProcessing, setReceiptProcessing] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [budgetWarning, setBudgetWarning] = useState<{ categoryName: string; overBy: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const activePeople = useMemo(
    () => snapshot.people.filter((person) => person.active && (person.status === "local" || person.status === "connected")),
    [snapshot.people],
  );
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitPersonIds, setSplitPersonIds] = useState<string[]>([]);

  useEffect(() => {
    setCategoryId(type === "income" ? incomeCategory?.id ?? "" : expenseCategory?.id ?? "");
  }, [type, expenseCategory?.id, incomeCategory?.id]);

  useEffect(() => {
    if (!activeAccounts.some((account) => account.id === accountId)) setAccountId(activeAccounts[0]?.id ?? "");
    if (!activeAccounts.some((account) => account.id === toAccountId)) setToAccountId(activeAccounts[1]?.id ?? activeAccounts[0]?.id ?? "");
  }, [activeAccounts, accountId, toAccountId]);

  useEffect(() => {
    if (type !== "expense") {
      setSplitEnabled(false);
      setSplitPersonIds([]);
    }
  }, [type]);

  useEffect(() => {
    setSplitPersonIds((items) => items.filter((id) => activePeople.some((person) => person.id === id)));
  }, [activePeople]);

  const toggleSplitPerson = (personId: string) => {
    setSplitPersonIds((items) => (items.includes(personId) ? items.filter((id) => id !== personId) : [...items, personId]));
  };

  const save = async (forceOverBudget = false) => {
    if (saving) return;
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
          if (!forceOverBudget) {
            setBudgetWarning({ categoryName: category?.name ?? "This category", overBy });
            return;
          }
          overBudget = true;
        }
      }
    }
    if (splitEnabled && splitPersonIds.length === 0) {
      notify?.("Choose at least one person for the split.", "error");
      return;
    }
    const timestamp = nowIso();
    const transactionDate = `${date}T${new Date().toTimeString().slice(0, 8)}`;
    const transactionId = createId();
    const splitShare = splitEnabled && splitPersonIds.length ? numericAmount / (splitPersonIds.length + 1) : 0;
    let transaction: Transaction = {
      id: transactionId,
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
      personIds: splitEnabled ? splitPersonIds : undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
      syncState: snapshot.config.syncEnabled ? "queued" : "local",
    };
    let splitSettlements: Settlement[] = splitEnabled
      ? splitPersonIds.map((personId) => ({
          id: createId(),
          ownerProfileId: snapshot.profile?.id,
          personId,
          direction: "to_me",
          originalAmount: Number(splitShare.toFixed(2)),
          repaidAmount: 0,
          accountId,
          categoryId,
          transactionId,
          receiptName: receiptName || undefined,
          receiptData: receiptData || undefined,
          date: transactionDate,
          note: note || "Split expense",
          createdAt: timestamp,
          updatedAt: timestamp,
          friendMirrorState: snapshot.config.syncEnabled ? "queued" : undefined,
          friendMirrorClientMutationId: `friend-mirror:${transactionId}:${personId}`,
          syncState: snapshot.config.syncEnabled ? "queued" : "local",
        }))
      : [];
    setSaving(true);
    try {
      const uploadedReceipt = await maybeUploadReceipt(receiptData, receiptName, "transaction", transactionId, notify);
      transaction = applyServerReceipt(transaction, uploadedReceipt);
      splitSettlements = splitSettlements.map((settlement) => applyServerReceipt(settlement, uploadedReceipt));
      await db.transaction("rw", db.transactions, db.settlements, async () => {
        await db.transactions.put(transaction);
        if (splitSettlements.length) await db.settlements.bulkPut(splitSettlements);
      });
      for (const settlement of splitSettlements) {
        const person = activePeople.find((item) => item.id === settlement.personId);
        if (person?.status !== "connected" || !person.connectedUserId || !snapshot.profile?.connectedUserId || !getServerToken()) continue;
        const mirroredSettlement: Settlement = {
          ...settlement,
          id: `mirror-${settlement.id}`,
          ownerProfileId: undefined,
          personId: "",
          direction: "by_me",
          accountId: undefined,
          categoryId: undefined,
          transactionId: undefined,
          linkedSettlementId: settlement.id,
          friendUserId: snapshot.profile.connectedUserId,
          syncState: "synced",
        };
        await mirrorServerFriendEntity(person.connectedUserId, "settlements", mirroredSettlement.id, { ...mirroredSettlement })
          .then(() => db.settlements.update(settlement.id, { friendMirrorState: "synced", friendMirrorError: undefined, updatedAt: nowIso() }))
          .catch((error: unknown) => {
            void db.settlements.update(settlement.id, {
              friendMirrorState: "queued",
              friendMirrorError: error instanceof Error ? error.message : "Friend sync failed.",
              updatedAt: nowIso(),
            });
            notify?.(error instanceof Error ? error.message : "Split was saved locally, but friend sync failed.", "warning");
          });
      }
      setAmount("");
      setNote("");
      setReceiptName("");
      setReceiptData("");
      setSplitEnabled(false);
      setSplitPersonIds([]);
      notify?.(
        overBudget
          ? "Expense saved over budget."
          : splitSettlements.length
            ? `Expense saved and split with ${splitSettlements.length} person(s).`
            : `${type[0].toUpperCase() + type.slice(1)} saved.`,
        overBudget ? "warning" : "success",
      );
      await onDone();
    } catch (error) {
      notify?.(error instanceof Error ? error.message : "Transaction could not be saved.", "error");
    } finally {
      setSaving(false);
    }
  };

  const attachReceipt = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify?.("Upload an image file for the receipt.", "error");
      return;
    }
    if (file.size > MAX_RECEIPT_SOURCE_BYTES) {
      notify?.("Receipt image is too large. Choose an image under 6 MB.", "error");
      return;
    }
    setReceiptProcessing(true);
    try {
      setReceiptName(file.name);
      const dataUrl = await compressImageFile(file, {
        maxSide: RECEIPT_IMAGE_MAX_SIDE,
        quality: 0.72,
        maxBytes: MAX_RECEIPT_COMPRESSED_BYTES,
      });
      setReceiptData(dataUrl);
      notify?.("Receipt compressed and attached.", "success");
    } catch (error) {
      setReceiptName("");
      setReceiptData("");
      notify?.(error instanceof Error ? error.message : "Receipt image could not be processed.", "error");
    } finally {
      setReceiptProcessing(false);
    }
  };

  return (
    <Panel className="transaction-sheet" title="Quick Add" icon={<Plus size={18} />}>
      <div className="quick-transaction-form">
        <div className="segmented-control transaction-type-cards">
          {(["expense", "income", "transfer"] as TransactionType[]).map((item) => (
            <button className={type === item ? "segment-active" : ""} key={item} onClick={() => setType(item)}>
              <span className="transaction-type-icon">
                {item === "expense" ? <ArrowUpRight size={24} /> : item === "income" ? <ArrowDownLeft size={24} /> : <ArrowRightLeft size={24} />}
              </span>
              <span>
                <strong>{item[0].toUpperCase() + item.slice(1)}</strong>
                <small>{item === "expense" ? "Money out" : item === "income" ? "Money in" : "Between accounts"}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="quick-field-grid">
          <label className="add-amount-shell">
            <span>Amount</span>
            <div>
              <IndianRupee size={28} />
              <input className="amount-input" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
            </div>
          </label>
          <label className="field-with-leading-icon">
            <span>Date</span>
            <div>
              <CalendarDays size={20} />
              <input className="field-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
          </label>
          <div className="field-with-leading-icon">
            <span>Account</span>
            <div>
              <CreditCard size={20} />
              <SelectField label="" value={accountId} onChange={setAccountId}>
                {activeAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>
        {type === "transfer" ? (
          <div className="field-with-leading-icon">
            <span>To account</span>
            <div>
              <CreditCard size={20} />
          <SelectField label="" value={toAccountId} onChange={setToAccountId}>
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
          </SelectField>
            </div>
          </div>
        ) : (
          <div className="field-with-leading-icon">
            <span>Category</span>
            <div>
              <Tags size={20} />
          <SelectField label="" value={categoryId} onChange={setCategoryId}>
              {snapshot.categories
                .filter((category) => category.kind === (type === "income" ? "income" : "expense") && category.active)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
          </SelectField>
            </div>
          </div>
        )}
          <button className="manage-inline-button" type="button" onClick={() => window.dispatchEvent(new CustomEvent("micham:open-manage"))}>
            <Grid2X2 size={20} /> Manage Categories <ChevronDown size={18} />
          </button>
        </div>
        <div className="transaction-extra-grid">
          <label className="field-with-leading-icon add-note-field">
            <span className="field-label">Note</span>
            <div>
              <FileJson size={20} />
              <input className="field-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Tea, fuel, rent..." />
            </div>
          </label>
          <div className="receipt-control">
            <span className="field-label">Receipt <small>(Optional)</small></span>
            <label className={`secondary-button cursor-pointer ${receiptProcessing ? "button-loading" : ""}`}>
              <span className="receipt-icon-badge"><Image size={24} /></span>
              <span>
                <strong>{receiptProcessing ? "Compressing" : receiptName ? "Change Receipt" : "Add Receipt"}</strong>
                <small>Upload a photo or screenshot</small>
              </span>
              <em>JPG, PNG</em>
              <input
                className="hidden"
                type="file"
                accept="image/*"
                disabled={receiptProcessing}
                onChange={(event) => {
                  void attachReceipt(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {receiptData ? <img className="receipt-preview" src={receiptData} alt={receiptName || "Receipt preview"} /> : null}
          </div>
        </div>
        {type === "expense" ? (
          <div className="split-inline-card">
            <div className="split-inline-head">
              <span className="split-icon-badge"><Users size={24} /></span>
              <div>
                <strong>Split with people</strong>
                <p>Create owe records from this expense.</p>
              </div>
              <label className="switch">
                <input checked={splitEnabled} type="checkbox" onChange={(event) => setSplitEnabled(event.target.checked)} />
                <span />
              </label>
            </div>
            {splitEnabled ? (
              activePeople.length ? (
                <div className="person-chip-grid">
                  {activePeople.map((person) => (
                    <button
                      className={`person-chip ${splitPersonIds.includes(person.id) ? "person-chip-active" : ""}`}
                      key={person.id}
                      type="button"
                      onClick={() => toggleSplitPerson(person.id)}
                    >
                      <Users size={15} />
                      {person.nickname || person.localDisplayName}
                    </button>
                  ))}
                </div>
              ) : (
                <Empty text="Add people in Friends before splitting." />
              )
            ) : null}
          </div>
        ) : null}
        <LoadingButton className="primary-button transaction-save-button" loading={saving} onClick={() => save()} disabled={!amount || !accountId || receiptProcessing}>
          <CheckCircle2 size={19} /> Save Transaction
        </LoadingButton>
      </div>
      {budgetWarning ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="confirm-modal">
            <strong>Budget Limit Warning</strong>
            <p>
              {budgetWarning.categoryName} will exceed by {formatMoney(budgetWarning.overBy, snapshot.profile?.currency ?? snapshot.config.defaultCurrency)}.
            </p>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setBudgetWarning(null)}>Cancel</button>
              <button
                className="primary-button"
                onClick={() => {
                  setBudgetWarning(null);
                  void save(true);
                }}
              >
                Save Anyway
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function DailyView({
  snapshot,
  currency,
  selectedDate,
  setSelectedDate,
  notify,
  onDone,
}: {
  snapshot: Snapshot;
  currency: string;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  notify: (message: string, tone?: Toast["tone"]) => void;
  onDone: () => Promise<void>;
}) {
  const [activityMode, setActivityMode] = useState<"daily" | "calendar">("daily");
  const [typeFilter, setTypeFilter] = useState<"all" | "you_owe" | "owes_you">("all");
  const [search, setSearch] = useState("");
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const start = new Date(`${selectedDate.slice(0, 7)}-01T00:00:00`);
  const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const monthDates = Array.from({ length: days }, (_, index) => `${selectedDate.slice(0, 7)}-${String(index + 1).padStart(2, "0")}`);
  const monthLabel = start.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const relatedSettlementIds = new Set(snapshot.settlements.map((settlement) => settlement.transactionId).filter(Boolean));
  const settlementRows = snapshot.settlements
    .filter((settlement) => !settlement.deletedAt)
    .map((settlement) => {
      const person = snapshot.people.find((item) => item.id === settlement.personId);
      const category = snapshot.categories.find((item) => item.id === settlement.categoryId);
      return {
        id: settlement.id,
        kind: settlement.direction === "by_me" ? "you_owe" : "owes_you",
        title: settlement.note || (settlement.direction === "by_me" ? "I owe them" : "They owe me"),
        meta: `${person?.localDisplayName ?? "Friend"} · ${category?.name ?? "Shared money"} · ${formatDate(settlement.date)}`,
        amount: settlement.originalAmount - settlement.repaidAmount,
        date: settlement.date,
        onClick: undefined as (() => void) | undefined,
      };
    });
  const transactionRows = snapshot.transactions
    .filter((transaction) => !transaction.deletedAt && !relatedSettlementIds.has(transaction.id))
    .map((transaction) => {
      const account = snapshot.accounts.find((accountItem) => accountItem.id === transaction.accountId);
      const category = snapshot.categories.find((categoryItem) => categoryItem.id === transaction.categoryId);
      return {
        id: transaction.id,
        kind: transaction.type,
        title: transaction.note || (transaction.type === "income" ? "Income" : transaction.type === "transfer" ? "Transfer" : "Expense"),
        meta: `${account?.name ?? "Account"} · ${category?.name ?? transaction.type} · ${formatDate(transaction.date)}`,
        amount: transaction.amount,
        date: transaction.date,
        onClick: () => setSelectedTransaction(transaction),
      };
    });
  const rows = [...settlementRows, ...transactionRows]
    .filter((item) => {
      const text = `${item.title} ${item.meta}`.toLowerCase();
      const filterMatch = typeFilter === "all" || item.kind === typeFilter;
      return filterMatch && text.includes(search.trim().toLowerCase());
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const youOwe = snapshot.settlements
    .filter((settlement) => !settlement.deletedAt && settlement.direction === "by_me")
    .reduce((sum, settlement) => sum + settlement.originalAmount - settlement.repaidAmount, 0);
  const owesYou = snapshot.settlements
    .filter((settlement) => !settlement.deletedAt && settlement.direction === "to_me")
    .reduce((sum, settlement) => sum + settlement.originalAmount - settlement.repaidAmount, 0);
  const net = owesYou - youOwe;
  return (
    <div className="app-page activity-page">
      <div>
        <h2 className="page-title">Activity</h2>
        <p className="page-subtitle">Every movement, in one place.</p>
      </div>
      <div className="activity-mode-tabs">
        <button className={activityMode === "daily" ? "activity-mode-active" : ""} type="button" onClick={() => setActivityMode("daily")}>
          <Sun size={16} /> Daily
        </button>
        <button className={activityMode === "calendar" ? "activity-mode-active" : ""} type="button" onClick={() => setActivityMode("calendar")}>
          <CalendarDays size={16} /> Calendar
        </button>
      </div>
      {activityMode === "calendar" ? (
        <section className="activity-calendar-card">
          <strong>{monthLabel}</strong>
          <div className="activity-calendar-weekdays">
            {["S", "M", "T", "W", "T", "F", "S"].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="activity-calendar-grid">
            {Array.from({ length: start.getDay() }, (_, index) => <span key={`blank-${index}`} />)}
            {monthDates.map((date) => {
              const dayTransactions = snapshot.transactions.filter((item) => sameDay(item.date, date));
              const daySettlements = snapshot.settlements.filter((item) => sameDay(item.date, date));
              const hasIncome = dayTransactions.some((item) => item.type === "income") || daySettlements.some((item) => item.direction === "to_me");
              const hasExpense = dayTransactions.some((item) => item.type === "expense") || daySettlements.some((item) => item.direction === "by_me");
              const hasRecord = hasIncome || hasExpense;
              const dayTone = hasIncome && hasExpense ? "activity-day-mixed" : hasIncome ? "activity-day-income" : hasExpense ? "activity-day-expense" : "";
              return (
                <button className={`${date === selectedDate ? "activity-day activity-day-active" : "activity-day"} ${dayTone}`} key={date} type="button" onClick={() => setSelectedDate(date)}>
                  {Number(date.slice(-2))}
                  {hasRecord ? <i /> : null}
                </button>
              );
            })}
          </div>
          <p>Tap a date to filter the list.</p>
        </section>
      ) : null}
      <input className="field-input activity-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search records" />
      <div className="filter-pills activity-filter-pills">
        {(["all", "you_owe", "owes_you"] as const).map((item) => (
          <button className={typeFilter === item ? "filter-pill-active" : ""} key={item} onClick={() => setTypeFilter(item)}>
            {item === "all" ? "All" : item === "you_owe" ? "You owe" : "Owes you"}
          </button>
        ))}
      </div>
      <div className="activity-money-grid">
        <div><span>You owe</span><strong className="money-negative">{formatMoney(youOwe, currency)}</strong></div>
        <div><span>Owes you</span><strong className="money-positive">{formatMoney(owesYou, currency)}</strong></div>
        <div><span>Net</span><strong className={net >= 0 ? "money-positive" : "money-negative"}>{formatMoney(Math.abs(net), currency)}</strong></div>
      </div>
      <div className="activity-record-list">
        {rows
          .filter((row) => activityMode === "daily" || sameDay(row.date, selectedDate))
          .map((row) => (
            <button className="activity-record-card" key={`${row.kind}-${row.id}`} type="button" onClick={() => row.onClick?.()}>
              <div>
                <strong>{row.title}</strong>
                <p>{row.meta}</p>
              </div>
              <span className={row.kind === "you_owe" || row.kind === "expense" ? "money-negative" : "money-positive"}>
                {row.kind === "you_owe" || row.kind === "expense" ? "-" : "+"}{formatMoney(row.amount, currency)}
              </span>
            </button>
          ))}
        {rows.length === 0 ? <Empty text="No records found." /> : null}
      </div>
      {selectedTransaction ? (
        <TransactionDetailsModal
          snapshot={snapshot}
          currency={currency}
          transaction={selectedTransaction}
          notify={notify}
          onDone={onDone}
          onClose={() => setSelectedTransaction(null)}
        />
      ) : null}
    </div>
  );
}

function MonthlyView({ snapshot, currency, notify, onDone }: { snapshot: Snapshot; currency: string; notify: (message: string, tone?: Toast["tone"]) => void; onDone: () => Promise<void> }) {
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
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const dailyRows = Array.from({ length: daysInMonth }, (_, index) => {
    const day = `${currentMonth}-${String(index + 1).padStart(2, "0")}`;
    const amount = filteredTransactions
      .filter((transaction) => transaction.type === "expense" && sameDay(transaction.date, day))
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    return { day: index + 1, amount };
  });
  const maxDailySpend = Math.max(...dailyRows.map((item) => item.amount), 1);
  const maxAccountBalance = Math.max(...accountRows.map((item) => Math.abs(item.balance)), 1);
  const topSpending = spending.slice(0, 3);
  const totalTopSpending = Math.max(topSpending.reduce((sum, item) => sum + item.amount, 0), 1);
  const categoryColors = ["#00815f", "#ff0050", "#a83fd9"];

  const downloadReport = () => {
    const filterLabel = [
      `Type: ${typeFilter === "all" ? "All types" : typeFilter}`,
      `Category: ${categoryFilter === "all" ? "All categories" : snapshot.categories.find((item) => item.id === categoryFilter)?.name ?? "Unknown"}`,
      `Account: ${accountFilter === "all" ? "All accounts" : snapshot.accounts.find((item) => item.id === accountFilter)?.name ?? "Unknown"}`,
    ].join(" | ");
    const transactionRows = filteredTransactions.map((transaction) => {
      const account = snapshot.accounts.find((item) => item.id === transaction.accountId);
      const toAccount = snapshot.accounts.find((item) => item.id === transaction.toAccountId);
      const category = snapshot.categories.find((item) => item.id === transaction.categoryId);
      return [
        formatDate(transaction.date),
        transaction.type,
        transaction.amount,
        account?.name,
        toAccount?.name,
        category?.name,
        transaction.note,
        transaction.receiptName,
      ];
    });
    const budgetRows = snapshot.budgets
      .filter((budget) => budget.active)
      .map((budget) => {
        const category = snapshot.categories.find((item) => item.id === budget.categoryId);
        const usage = budgetUsage(budget, filteredTransactions);
        return [category?.name, budget.amount, usage.spent, usage.remaining, `${Math.round(usage.percentage)}%`];
      });
    const workbook = excelWorkbook(`${snapshot.config.appName} Report`, [
      excelSheet("Summary", ["Metric", "Value"], [
        ["Generated", formatDate(nowIso())],
        ["Filters", filterLabel],
        ["Income", formatMoney(summary.monthlyIncome, currency)],
        ["Expenses", formatMoney(summary.monthlyExpenses, currency)],
        ["Savings", formatMoney(summary.monthlySavings, currency)],
        ["Transactions", filteredTransactions.length],
      ]),
      excelSheet("Transactions", ["Date", "Type", "Amount", "Account", "To Account", "Category", "Note", "Receipt"], transactionRows),
      excelSheet("Category Spending", ["Category", "Amount"], spending.map(({ category, amount }) => [category.name, amount])),
      excelSheet("Account Usage", ["Account", "Balance"], accountRows.map(({ account, balance }) => [account.name, balance])),
      excelSheet("Budgets", ["Category", "Budget", "Spent", "Remaining", "Used"], budgetRows),
    ]);
    downloadBlob(workbook, "application/vnd.ms-excel;charset=utf-8", `${snapshot.config.appName.toLowerCase()}-filtered-report.xls`);
    notify("Monthly report ready.", "success");
  };

  return (
    <div className="app-page insights-page">
      <div className="illustrated-page-head insights-illustrated-head">
        <div>
          <h2 className="page-title">Insights</h2>
          <p className="page-subtitle">Your money patterns at a glance.</p>
        </div>
        <div className="page-head-icon-cluster" aria-hidden="true">
          <BarChart3 size={30} />
          <Target size={20} />
        </div>
      </div>
      <div className="summary-card-grid insight-stat-grid insight-metric-grid">
        <div className="insight-metric-card">
          <span className="metric-icon metric-income"><ArrowDownLeft size={24} /></span>
          <small>Income</small>
          <strong>{formatMoney(summary.monthlyIncome, currency)}</strong>
          <p>+0% vs last month</p>
        </div>
        <div className="insight-metric-card">
          <span className="metric-icon metric-expense"><ArrowUpRight size={24} /></span>
          <small>Expenses</small>
          <strong>{formatMoney(summary.monthlyExpenses, currency)}</strong>
          <p>+0% vs last month</p>
        </div>
        <div className="insight-metric-card">
          <span className="metric-icon metric-savings"><WalletCards size={24} /></span>
          <small>Savings</small>
          <strong>{formatMoney(summary.monthlySavings, currency)}</strong>
          <p>+0% vs last month</p>
        </div>
      </div>
      <div className="insight-grid">
        <Panel className="insight-visual-card insight-daily-card" title="Daily Spending" icon={<BarChart3 size={18} />}>
          <p className="panel-helper">Your daily expense trend</p>
          <div className="daily-bars insight-daily-bars">
            {dailyRows.map((item) => (
              <div className="daily-bar" key={item.day} title={`${item.day}: ${formatMoney(item.amount, currency)}`}>
                <span style={{ height: `${Math.max(5, (item.amount / maxDailySpend) * 100)}%` }} />
              </div>
            ))}
          </div>
          <div className="chart-axis-row"><span>1 Sep</span><span>Today</span></div>
          <div className="insight-micro-stats">
            <div><BarChart3 size={18} /><span>Avg. Daily Spend</span><strong>{formatMoney(summary.monthlyExpenses / Math.max(daysInMonth, 1), currency)}</strong></div>
            <div><Target size={18} /><span>Total Expenses</span><strong>{formatMoney(summary.monthlyExpenses, currency)}</strong></div>
          </div>
        </Panel>
        <Panel className="insight-visual-card insight-link-card" title="Account Balance" icon={<WalletCards size={18} />}>
          <p className="panel-helper">Total across all accounts</p>
          <div className="chart-list">
            {accountRows.map(({ account, balance }) => {
              return (
                <div className="bar-row" key={account.id}>
                  <div className="bar-row-header">
                    <span>{account.name}</span>
                    <strong>{formatMoney(balance, currency)}</strong>
                  </div>
                  <div className="bar-track">
                    <span className={balance < 0 ? "danger-bar" : ""} style={{ width: `${Math.max(6, (Math.abs(balance) / maxAccountBalance) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel className="insight-visual-card" title="Top Categories" icon={<Tags size={18} />}>
          {topSpending.length ? (
            <div className="top-category-layout">
              <div
                className="mini-donut"
                style={{
                  background: `conic-gradient(${topSpending.map((item, index) => {
                    const start = topSpending.slice(0, index).reduce((sum, row) => sum + (row.amount / totalTopSpending) * 100, 0);
                    const end = start + (item.amount / totalTopSpending) * 100;
                    return `${categoryColors[index]} ${start}% ${end}%`;
                  }).join(", ")})`,
                }}
              >
                <span>{formatMoney(spending.reduce((sum, item) => sum + item.amount, 0), currency)}</span>
              </div>
              <div className="category-legend">
                {topSpending.map(({ category, amount }, index) => (
                  <div className="legend-row" key={category.id}>
                    <span><i style={{ background: categoryColors[index] }} />{category.name}</span>
                    <strong>{formatMoney(amount, currency)}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="insight-empty-illustration">
              <Tags size={34} />
              <strong>No spending this month.</strong>
              <p>Start adding transactions to see your top categories.</p>
            </div>
          )}
        </Panel>
        <Panel className="insight-visual-card" title="Budgets" icon={<Target size={18} />}>
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
            {snapshot.budgets.length === 0 ? (
              <button className="insight-empty-action" type="button" onClick={() => window.dispatchEvent(new CustomEvent("micham:open-manage"))}>
                <Plus size={20} />
                <span><strong>Create budgets in Manage</strong><small>Stay on track with your goals.</small></span>
              </button>
            ) : null}
          </div>
        </Panel>
      </div>
      <Panel className="insight-filter-card" title="Report Filters" icon={<SlidersHorizontal size={18} />}>
        <div className="report-filter-grid">
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
      <Panel className="insight-visual-card insight-transactions-card" title="Transactions" icon={<FileJson size={18} />}>
          <TransactionList snapshot={snapshot} currency={currency} transactions={filteredTransactions.slice().reverse()} notify={notify} onDone={onDone} />
      </Panel>
    </div>
  );
}

function CalendarView({
  snapshot,
  currency,
  selectedDate,
  setSelectedDate,
  notify,
  onDone,
}: {
  snapshot: Snapshot;
  currency: string;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  notify: (message: string, tone?: Toast["tone"]) => void;
  onDone: () => Promise<void>;
}) {
  const start = new Date(`${selectedDate.slice(0, 7)}-01T00:00:00`);
  const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const dates = Array.from({ length: days }, (_, index) => `${selectedDate.slice(0, 7)}-${String(index + 1).padStart(2, "0")}`);
  return (
    <div className="app-page calendar-page">
      <div>
        <h2 className="page-title"><CalendarDays size={24} /> Calendar</h2>
        <p className="page-subtitle">Daily income and spending by color.</p>
      </div>
      <Panel className="calendar-card" title="Month">
        <input className="field-input calendar-month-input" type="month" value={selectedDate.slice(0, 7)} onChange={(event) => setSelectedDate(`${event.target.value}-01`)} />
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
      </Panel>
      <Panel title={formatDate(selectedDate)}>
        <TransactionList snapshot={snapshot} currency={currency} transactions={snapshot.transactions.filter((item) => sameDay(item.date, selectedDate))} notify={notify} onDone={onDone} />
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
  const activeAccounts = snapshot.accounts.filter((account) => account.active);
  const expenseCategories = snapshot.categories.filter((category) => category.active && category.kind === "expense");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [verifiedFriend, setVerifiedFriend] = useState<{ displayName: string; connectionCode: string } | null>(null);
  const [personId, setPersonId] = useState(activePeople[0]?.id ?? "");
  const [accountId, setAccountId] = useState(activeAccounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState(expenseCategories[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"to_me" | "by_me">("to_me");
  const [note, setNote] = useState("");
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().slice(0, 10));
  const [settlementReceiptName, setSettlementReceiptName] = useState("");
  const [settlementReceiptData, setSettlementReceiptData] = useState("");
  const [settlementReceiptProcessing, setSettlementReceiptProcessing] = useState(false);
  const openSettlements = snapshot.settlements.filter((settlement) => !settlement.deletedAt && settlement.repaidAmount < settlement.originalAmount);
  const [repaymentSettlementId, setRepaymentSettlementId] = useState(openSettlements[0]?.id ?? "");
  const [repaymentAccountId, setRepaymentAccountId] = useState(activeAccounts[0]?.id ?? "");
  const [repaymentAmount, setRepaymentAmount] = useState("");
  const [repaymentNote, setRepaymentNote] = useState("");
  const [repaymentDate, setRepaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [friendConfirm, setFriendConfirm] = useState<{ type: "block" | "remove"; person: Person; linked?: boolean } | null>(null);
  const [showAllFriends, setShowAllFriends] = useState(false);
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);
  const [showRecordMoneyModal, setShowRecordMoneyModal] = useState(false);
  const [showSettleMoneyModal, setShowSettleMoneyModal] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null);
  const [selectedFriendId, setSelectedFriendId] = useState(activePeople[0]?.id ?? "");
  const [settleFriendScopeId, setSettleFriendScopeId] = useState("");
  const [detailPersonId, setDetailPersonId] = useState("");
  const [friendSearch, setFriendSearch] = useState("");
  const [settlementEvents, setSettlementEvents] = useState<ServerSettlementEvent[]>([]);
  const [eventAccounts, setEventAccounts] = useState<Record<string, string>>({});
  const [busyEventId, setBusyEventId] = useState("");
  const [busyAction, setBusyAction] = useState<"" | "verify" | "friend" | "record" | "settle" | "refresh" | "nickname" | "friend-action">("");
  const busyActionRef = React.useRef("");
  const [nicknameDraft, setNicknameDraft] = useState("");
  const filteredPeople = activePeople.filter((person) => {
    const text = `${person.localDisplayName} ${person.serverDisplayName ?? ""} ${person.inviteCode ?? ""} ${person.connectedUserId ?? ""}`.toLowerCase();
    return text.includes(friendSearch.trim().toLowerCase());
  });
  const visiblePeople = filteredPeople.slice(0, 4);
  const selectedFriend = activePeople.find((person) => person.id === selectedFriendId) ?? activePeople[0];
  const selectedFriendSettlements = selectedFriend
    ? snapshot.settlements.filter((settlement) => settlement.personId === selectedFriend.id && !settlement.deletedAt)
    : [];
  const selectedFriendRepayments = selectedFriend
    ? snapshot.repayments.filter((repayment) => repayment.personId === selectedFriend.id && !repayment.deletedAt)
    : [];
  const pendingEvents = settlementEvents.filter(
    (event) => event.status === "pending" && event.requested_by !== snapshot.profile?.connectedUserId,
  );
  const myPendingEvents = settlementEvents.filter(
    (event) => event.status === "pending" && event.requested_by === snapshot.profile?.connectedUserId,
  );

  useEffect(() => {
    if (!snapshot.profile?.connectedUserId || !getServerToken()) return;
    syncServerFriendsToLocal(snapshot.profile)
      .then(onDone)
      .catch(() => undefined);
  }, [snapshot.profile?.connectedUserId]);

  useEffect(() => {
    if (!activePeople.some((person) => person.id === personId)) setPersonId(activePeople[0]?.id ?? "");
    if (!activePeople.some((person) => person.id === selectedFriendId)) setSelectedFriendId(activePeople[0]?.id ?? "");
  }, [activePeople, personId]);

  useEffect(() => {
    setNicknameDraft(selectedFriend?.nickname || selectedFriend?.localDisplayName || "");
  }, [selectedFriend?.id]);

  useEffect(() => {
    if (!activeAccounts.some((account) => account.id === accountId)) setAccountId(activeAccounts[0]?.id ?? "");
    if (!activeAccounts.some((account) => account.id === repaymentAccountId)) setRepaymentAccountId(activeAccounts[0]?.id ?? "");
  }, [activeAccounts, accountId, repaymentAccountId]);

  useEffect(() => {
    if (!expenseCategories.some((category) => category.id === categoryId)) setCategoryId(expenseCategories[0]?.id ?? "");
  }, [expenseCategories, categoryId]);

  useEffect(() => {
    if (!openSettlements.some((settlement) => settlement.id === repaymentSettlementId)) setRepaymentSettlementId(openSettlements[0]?.id ?? "");
  }, [openSettlements, repaymentSettlementId]);

  const finalizeRepayment = async (
    settlement: Settlement,
    amountValue: number,
    noteValue: string,
    accountValue: string,
    dateValue: string,
    eventId: string,
  ) => {
    const existing = await db.repayments.where("linkedRepaymentId").equals(eventId).first();
    if (existing?.status === "confirmed") return false;
    const timestamp = nowIso();
    const transactionId = existing?.transactionId ?? createId();
    const repayment: Repayment = {
      id: existing?.id ?? createId(),
      ownerProfileId: snapshot.profile?.id,
      settlementId: settlement.id,
      personId: settlement.personId,
      amount: amountValue,
      accountId: accountValue,
      transactionId,
      date: dateValue,
      note: noteValue || "Returned money",
      linkedRepaymentId: eventId,
      friendUserId: settlement.friendUserId,
      status: "confirmed",
      confirmedAt: timestamp,
      confirmedBy: snapshot.profile?.connectedUserId,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      syncState: snapshot.config.syncEnabled ? "queued" : "local",
    };
    const transaction: Transaction = {
      id: transactionId,
      ownerProfileId: snapshot.profile?.id,
      type: settlement.direction === "to_me" ? "income" : "expense",
      amount: amountValue,
      accountId: accountValue,
      date: dateValue,
      note: repayment.note,
      personIds: [settlement.personId],
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      syncState: snapshot.config.syncEnabled ? "queued" : "local",
    };
    const currentRepaid = settlement.repaidAmount + amountValue;
    await db.transaction("rw", db.settlements, db.repayments, db.transactions, async () => {
      await db.repayments.put(repayment);
      await db.transactions.put(transaction);
      await db.settlements.update(settlement.id, {
        repaidAmount: Math.min(settlement.originalAmount, currentRepaid),
        status: currentRepaid >= settlement.originalAmount ? "settled" : "open",
        updatedAt: timestamp,
        syncState: snapshot.config.syncEnabled ? "queued" : "local",
      });
    });
    return true;
  };

  const applyServerSettlementEvents = async (events: ServerSettlementEvent[]) => {
    let changed = false;
    for (const event of events) {
      if (event.status === "rejected") {
        const pending = await db.repayments.where("linkedRepaymentId").equals(event.id).first();
        if (pending?.status === "pending") {
          await db.transaction("rw", db.repayments, db.settlements, async () => {
            await db.repayments.update(pending.id, { status: "rejected", updatedAt: nowIso(), syncState: snapshot.config.syncEnabled ? "queued" : "local" });
            await db.settlements.update(pending.settlementId, {
              status: "open",
              updatedAt: nowIso(),
              syncState: snapshot.config.syncEnabled ? "queued" : "local",
            });
          });
          changed = true;
        }
        continue;
      }
      if (event.status !== "accepted") continue;
      const amountValue = Number(event.amount) || Number(event.payload.amount) || 0;
      if (!amountValue) continue;
      const payload = event.payload || {};
      const localSettlementId = typeof payload.localSettlementId === "string" ? payload.localSettlementId : event.settlement_entity_id;
      const settlement =
        snapshot.settlements.find((item) => item.id === localSettlementId) ||
        snapshot.settlements.find((item) => item.id === event.settlement_entity_id);
      if (!settlement) continue;
      const accountValue =
        typeof payload.requesterAccountId === "string" && event.requested_by === snapshot.profile?.connectedUserId
          ? payload.requesterAccountId
          : eventAccounts[event.id] || activeAccounts[0]?.id || "";
      if (!accountValue) continue;
      const noteValue = typeof payload.note === "string" ? payload.note : "Returned money";
      const dateValue = typeof payload.date === "string" ? payload.date : event.created_at;
      changed = (await finalizeRepayment(settlement, amountValue, noteValue, accountValue, dateValue, event.id)) || changed;
    }
    if (changed) await onDone();
  };

  const refreshSettlementEvents = async () => {
    if (!getServerToken() || !snapshot.profile?.connectedUserId) return;
    try {
      const previousPending = settlementEvents.filter(
        (event) => event.status === "pending" && event.requested_by !== snapshot.profile?.connectedUserId,
      ).length;
      const result = await listServerSettlementEvents();
      setSettlementEvents(result.events);
      await applyServerSettlementEvents(result.events);
      const nextPending = result.events.filter(
        (event) => event.status === "pending" && event.requested_by !== snapshot.profile?.connectedUserId,
      ).length;
      if (nextPending > previousPending) notify("Settlement acknowledgement pending.", "info");
    } catch {
      // Friend events are a secondary sync channel; regular entity sync still runs.
    }
  };

  useEffect(() => {
    void refreshSettlementEvents();
  }, [snapshot.profile?.connectedUserId, snapshot.settlements.length, snapshot.repayments.length]);

  const verifyFriendCode = async () => {
    if (busyAction) return;
    const normalizedInviteCode = inviteCode.trim().toUpperCase();
    if (!normalizedInviteCode) {
      notify("Enter a connection code.", "error");
      return;
    }
    if (!getServerToken() || !snapshot.profile?.connectedUserId) {
      notify("Sync this profile to the server before sending friend requests.", "warning");
      return;
    }
    setBusyAction("verify");
    try {
      const friend = await verifyServerFriend(normalizedInviteCode);
      setVerifiedFriend({ displayName: friend.displayName, connectionCode: friend.connectionCode });
      setName(friend.displayName);
      notify(`Found ${friend.displayName}. Confirm to send request.`, "success");
    } catch (error) {
      setVerifiedFriend(null);
      notify(error instanceof Error ? error.message : "Friend code could not be verified.", "error");
    } finally {
      setBusyAction("");
    }
  };

  const addPerson = async () => {
    if (busyAction) return;
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
    setBusyAction("friend");
    try {
      await db.people.put(person);
      if (getServerToken() && snapshot.profile?.connectedUserId && normalizedInviteCode) {
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
      }
      setName("");
      setInviteCode("");
      setVerifiedFriend(null);
      notify(normalizedInviteCode ? "Friend request sent. Waiting for acceptance." : "Local person added.", "success");
      await onDone();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Friend could not be added.", "error");
    } finally {
      setBusyAction("");
    }
  };

  const addSettlement = async () => {
    if (busyAction || busyActionRef.current) return false;
    if (!personId) {
      notify("Choose a friend first.", "error");
      return false;
    }
    if (!Number(amount)) {
      notify("Enter a valid amount.", "error");
      return false;
    }
    if (direction === "to_me" && !accountId) {
      notify("Choose the account you paid from.", "error");
      return false;
    }
    const timestamp = nowIso();
    const recordDate = `${settlementDate}T${new Date().toTimeString().slice(0, 8)}`;
    const person = snapshot.people.find((item) => item.id === personId);
    const transactionId = direction === "to_me" ? createId() : undefined;
    const settlementId = createId();
    let settlement: Settlement = {
      id: settlementId,
      ownerProfileId: snapshot.profile?.id,
      personId,
      direction,
      originalAmount: Number(amount) || 0,
      repaidAmount: 0,
      accountId: direction === "to_me" ? accountId : undefined,
      categoryId: direction === "to_me" ? categoryId || undefined : undefined,
      transactionId,
      receiptName: settlementReceiptName || undefined,
      receiptData: settlementReceiptData || undefined,
      friendUserId: person?.friendUserId,
      friendMirrorState: person?.status === "connected" && snapshot.config.syncEnabled ? "queued" : undefined,
      friendMirrorClientMutationId: `friend-mirror:${settlementId}`,
      date: recordDate,
      note,
      createdAt: timestamp,
      updatedAt: timestamp,
      syncState: snapshot.config.syncEnabled ? "queued" : "local",
    };
    let transaction: Transaction | undefined = transactionId
      ? {
          id: transactionId,
          ownerProfileId: snapshot.profile?.id,
          type: "expense",
          amount: settlement.originalAmount,
          accountId,
          categoryId: categoryId || undefined,
          date: recordDate,
          note: note || `${person?.localDisplayName ?? "Friend"} owes me`,
          receiptName: settlementReceiptName || undefined,
          receiptData: settlementReceiptData || undefined,
          personIds: [personId],
          createdAt: timestamp,
          updatedAt: timestamp,
          syncState: snapshot.config.syncEnabled ? "queued" : "local",
        }
      : undefined;
    busyActionRef.current = "record";
    setBusyAction("record");
    try {
      const uploadedReceipt = await maybeUploadReceipt(settlementReceiptData, settlementReceiptName, "settlement", settlementId, notify);
      settlement = applyServerReceipt(settlement, uploadedReceipt);
      if (transaction) transaction = applyServerReceipt(transaction, uploadedReceipt);
      await db.transaction("rw", db.settlements, db.transactions, async () => {
        await db.settlements.put(settlement);
        if (transaction) await db.transactions.put(transaction);
      });
      if (person?.status === "connected" && person.connectedUserId && person.friendUserId && snapshot.profile?.connectedUserId && getServerToken()) {
        const mirroredSettlement: Settlement = {
          ...settlement,
          id: `mirror-${settlement.id}`,
          ownerProfileId: undefined,
          personId: "",
          direction: direction === "to_me" ? "by_me" : "to_me",
          accountId: undefined,
          categoryId: undefined,
          transactionId: undefined,
          linkedSettlementId: settlement.id,
          friendUserId: snapshot.profile.connectedUserId,
          syncState: "synced",
        };
        await mirrorServerFriendEntity(person.connectedUserId, "settlements", mirroredSettlement.id, { ...mirroredSettlement })
          .then(() => db.settlements.update(settlement.id, { friendMirrorState: "synced", friendMirrorError: undefined, updatedAt: nowIso() }))
          .catch((error: unknown) => {
            void db.settlements.update(settlement.id, {
              friendMirrorState: "queued",
              friendMirrorError: error instanceof Error ? error.message : "Friend sync failed.",
              updatedAt: nowIso(),
            });
            notify(error instanceof Error ? error.message : "Saved locally. Friend sync will retry later.", "warning");
          });
      }
      setAmount("");
      setNote("");
      setSettlementDate(new Date().toISOString().slice(0, 10));
      setSettlementReceiptName("");
      setSettlementReceiptData("");
      notify("Owe/owed entry recorded.", "success");
      await onDone();
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Owe/owed entry could not be recorded.", "error");
      return false;
    } finally {
      busyActionRef.current = "";
      setBusyAction("");
    }
  };

  const addRepayment = async () => {
    if (busyAction || busyActionRef.current) return false;
    const settlement = snapshot.settlements.find((item) => item.id === repaymentSettlementId);
    if (!settlement) {
      notify("Choose an owe/owed record.", "error");
      return false;
    }
    const numericAmount = Number(repaymentAmount) || 0;
    const remaining = settlement.originalAmount - settlement.repaidAmount;
    if (!numericAmount || numericAmount > remaining) {
      notify(`Enter a returned amount up to ${formatMoney(remaining, currency)}.`, "error");
      return false;
    }
    if (!repaymentAccountId) {
      notify("Choose the account for this returned money.", "error");
      return false;
    }
    const existingPending = await db.repayments
      .where("settlementId")
      .equals(settlement.id)
      .filter((repayment) => repayment.status === "pending" && !repayment.deletedAt)
      .first();
    if (existingPending) {
      notify("This record already has a repayment waiting for acknowledgement.", "warning");
      return false;
    }
    const timestamp = `${repaymentDate}T${new Date().toTimeString().slice(0, 8)}`;
    const person = snapshot.people.find((item) => item.id === settlement.personId);
    busyActionRef.current = "settle";
    setBusyAction("settle");
    try {
      if (person?.status === "connected" && person.connectedUserId && person.friendUserId && snapshot.profile?.connectedUserId && getServerToken()) {
        const repaymentId = `repayment:${settlement.id}:${numericAmount}:${repaymentDate}:${repaymentAccountId}:${(repaymentNote || "").trim()}`.slice(0, 138);
        const remoteSettlementId = settlement.linkedSettlementId || `mirror-${settlement.id}`;
        const payload = {
          amount: numericAmount,
          date: timestamp,
          note: repaymentNote || "Returned money",
          localSettlementId: settlement.id,
          remoteSettlementId,
          requesterAccountId: repaymentAccountId,
          requesterUserId: snapshot.profile.connectedUserId,
          requesterName: snapshot.profile.displayName,
        };
        const { event } = await requestServerRepayment(person.friendUserId, remoteSettlementId, numericAmount, payload, undefined, repaymentId);
        const pendingRepayment: Repayment = {
          id: repaymentId,
          ownerProfileId: snapshot.profile?.id,
          settlementId: settlement.id,
          personId: settlement.personId,
          amount: numericAmount,
          accountId: repaymentAccountId,
          friendUserId: settlement.friendUserId,
          date: timestamp,
          note: repaymentNote || "Returned money",
          linkedRepaymentId: event.id,
          status: "pending",
          createdAt: nowIso(),
          updatedAt: nowIso(),
          syncState: snapshot.config.syncEnabled ? "queued" : "local",
        };
        await db.transaction("rw", db.repayments, db.settlements, async () => {
          await db.repayments.put(pendingRepayment);
          await db.settlements.update(settlement.id, {
            status: "pending_settlement",
            updatedAt: nowIso(),
            syncState: snapshot.config.syncEnabled ? "queued" : "local",
          });
        });
        setRepaymentAmount("");
        setRepaymentNote("");
        setRepaymentDate(new Date().toISOString().slice(0, 10));
        await refreshSettlementEvents();
        notify("Repayment request sent. Waiting for friend acknowledgement.", "success");
        await onDone();
        return true;
      }
      await finalizeRepayment(settlement, numericAmount, repaymentNote || "Returned money", repaymentAccountId, timestamp, createId());
      setRepaymentAmount("");
      setRepaymentNote("");
      setRepaymentDate(new Date().toISOString().slice(0, 10));
      notify("Returned money recorded.", "success");
      await onDone();
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Returned money could not be updated.", "error");
      return false;
    } finally {
      busyActionRef.current = "";
      setBusyAction("");
    }
  };

  const respondRepayment = async (event: ServerSettlementEvent, action: "accept" | "reject") => {
    if (busyEventId) return;
    setBusyEventId(event.id);
    try {
      const result = await respondServerRepayment(event.id, action);
      if (action === "reject") {
        notify("Repayment request rejected.", "warning");
        await refreshSettlementEvents();
        return;
      }
      const settlement =
        snapshot.settlements.find((item) => item.id === event.settlement_entity_id) ||
        snapshot.settlements.find((item) => item.id === event.payload.localSettlementId);
      const accountValue = eventAccounts[event.id] || activeAccounts[0]?.id || "";
      if (!settlement || !accountValue) {
        notify("Choose an account and make sure the shared record is synced before accepting.", "error");
        return;
      }
      await finalizeRepayment(
        settlement,
        Number(result.event.amount) || Number(event.amount) || 0,
        typeof event.payload.note === "string" ? event.payload.note : "Returned money",
        accountValue,
        typeof event.payload.date === "string" ? event.payload.date : event.created_at,
        event.id,
      );
      notify("Repayment acknowledged and added to your account.", "success");
      await refreshSettlementEvents();
      await onDone();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not update repayment request.", "error");
    } finally {
      setBusyEventId("");
    }
  };

  const updatePerson = async (person: Person, patch: Partial<Person>) => {
    await db.people.update(person.id, { ...patch, updatedAt: nowIso() });
    notify("Friend updated.", "success");
    await onDone();
  };

  const respondFriend = async (person: Person, action: "accept" | "reject") => {
    if (busyAction) return;
    if (!person.friendUserId) return;
    setBusyAction("friend-action");
    try {
      const result = await respondServerFriend(person.friendUserId, action);
      await db.people.update(person.id, {
        status: result.status === "connected" ? "connected" : "removed",
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
    } finally {
      setBusyAction("");
    }
  };

  const removeOrHidePerson = async (person: Person) => {
    const linked =
      snapshot.settlements.some((settlement) => settlement.personId === person.id) ||
      snapshot.transactions.some((transaction) => transaction.personIds?.includes(person.id));
    await db.people.update(person.id, {
      active: false,
      status: person.status === "blocked" ? "blocked" : "removed",
      deletedAt: linked ? undefined : nowIso(),
      updatedAt: nowIso(),
      syncState: snapshot.config.syncEnabled ? "queued" : "local",
    });
    if (person.friendUserId && getServerToken()) {
      await removeServerFriend(person.friendUserId).catch((error: unknown) => {
        notify(error instanceof Error ? error.message : "Server friend removal failed.", "warning");
      });
    }
    notify(linked ? "Friend hidden because existing records use it." : "Friend removed.", "warning");
    await onDone();
  };

  const confirmFriendAction = async () => {
    if (!friendConfirm || busyAction) return;
    const current = friendConfirm;
    setBusyAction("friend-action");
    try {
      if (current.type === "block") {
        if (current.person.friendUserId && getServerToken()) {
          await blockServerFriend(current.person.friendUserId);
        }
        await updatePerson(current.person, { status: "blocked", active: false, verified: false, syncState: "synced" });
      } else {
        await removeOrHidePerson(current.person);
      }
      setFriendConfirm(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Friend action failed.", "error");
    } finally {
      setBusyAction("");
    }
  };

  const saveNickname = async () => {
    if (busyAction) return;
    if (!selectedFriend) return;
    const nickname = nicknameDraft.trim();
    if (!nickname) {
      notify("Enter a nickname for this friend.", "error");
      return;
    }
    setBusyAction("nickname");
    try {
      await db.people.update(selectedFriend.id, {
        localDisplayName: nickname,
        nickname,
        updatedAt: nowIso(),
        syncState: snapshot.config.syncEnabled ? "queued" : "local",
      });
      notify("Friend nickname updated.", "success");
      await onDone();
    } finally {
      setBusyAction("");
    }
  };

  const refreshPeople = async () => {
    if (busyAction) return;
    setBusyAction("refresh");
    try {
      if (snapshot.profile?.connectedUserId && getServerToken()) {
        const previousIncoming = snapshot.people.filter((person) => person.active && person.status === "pending" && person.requestDirection === "incoming").length;
        await syncServerFriendsToLocal(snapshot.profile);
        await syncPendingFriendMirrors(snapshot.profile);
        await refreshSettlementEvents();
        const updatedPeople = await db.people.where("ownerProfileId").equals(snapshot.profile.id).toArray();
        const nextIncoming = updatedPeople.filter((person) => person.active && person.status === "pending" && person.requestDirection === "incoming").length;
        if (nextIncoming > previousIncoming) notify("New friend request received.", "info");
      }
      await onDone();
      notify("People refreshed.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "People refresh failed.", "error");
    } finally {
      setBusyAction("");
    }
  };

  const attachSettlementReceipt = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("Upload an image file for the receipt.", "error");
      return;
    }
    if (file.size > MAX_RECEIPT_SOURCE_BYTES) {
      notify("Receipt image is too large. Choose an image under 6 MB.", "error");
      return;
    }
    setSettlementReceiptProcessing(true);
    try {
      setSettlementReceiptName(file.name);
      const dataUrl = await compressImageFile(file, {
        maxSide: RECEIPT_IMAGE_MAX_SIDE,
        quality: 0.72,
        maxBytes: MAX_RECEIPT_COMPRESSED_BYTES,
      });
      setSettlementReceiptData(dataUrl);
      notify("Receipt compressed and attached.", "success");
    } catch (error) {
      setSettlementReceiptName("");
      setSettlementReceiptData("");
      notify(error instanceof Error ? error.message : "Receipt image could not be processed.", "error");
    } finally {
      setSettlementReceiptProcessing(false);
    }
  };

  const totalPeopleBalance = activePeople.reduce((sum, person) => sum + personBalance(person, snapshot.settlements), 0);
  const openRecordCount = snapshot.settlements.filter((settlement) => !settlement.deletedAt && settlement.repaidAmount < settlement.originalAmount).length;
  const primaryFriend = activePeople.find((person) => personBalance(person, snapshot.settlements) !== 0) || activePeople[0];
  const detailPerson = activePeople.find((person) => person.id === detailPersonId);
  const detailBalance = detailPerson ? personBalance(detailPerson, snapshot.settlements) : 0;
  const detailSettlements = detailPerson
    ? snapshot.settlements.filter((settlement) => settlement.personId === detailPerson.id && !settlement.deletedAt)
    : [];
  const detailOpenSettlements = detailSettlements.filter((settlement) => settlement.repaidAmount < settlement.originalAmount);
  const detailYouOwe = detailSettlements
    .filter((settlement) => settlement.direction === "by_me")
    .reduce((sum, settlement) => sum + settlement.originalAmount - settlement.repaidAmount, 0);
  const detailOwesYou = detailSettlements
    .filter((settlement) => settlement.direction === "to_me")
    .reduce((sum, settlement) => sum + settlement.originalAmount - settlement.repaidAmount, 0);
  const scopedOpenSettlements = settleFriendScopeId
    ? openSettlements.filter((settlement) => settlement.personId === settleFriendScopeId)
    : openSettlements;
  const copyFriendCode = async (person: Person) => {
    const code = person.inviteCode || person.connectedUserId || "";
    if (!code) {
      notify("Connection code is not available.", "warning");
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      notify("Friend code copied.", "success");
    } catch {
      notify(`Friend code: ${code}`, "info");
    }
  };
  const openRecordMoney = (friendId?: string) => {
    const targetFriendId = friendId || selectedFriendId || primaryFriend?.id || activePeople[0]?.id || "";
    setPersonId(targetFriendId);
    setDirection("to_me");
    setAmount("");
    setNote("");
    setSettlementDate(new Date().toISOString().slice(0, 10));
    setSettlementReceiptName("");
    setSettlementReceiptData("");
    setShowRecordMoneyModal(true);
  };
  const openSettleMoney = (friendId?: string) => {
    const friendOpenSettlements = friendId ? openSettlements.filter((settlement) => settlement.personId === friendId) : openSettlements;
    setSettleFriendScopeId(friendId || "");
    setSelectedFriendId(friendId || selectedFriendId || primaryFriend?.id || activePeople[0]?.id || "");
    setRepaymentSettlementId(friendOpenSettlements[0]?.id ?? "");
    setRepaymentAmount("");
    setRepaymentNote("");
    setRepaymentDate(new Date().toISOString().slice(0, 10));
    setShowSettleMoneyModal(true);
  };
  const closeSettleMoney = () => {
    setShowSettleMoneyModal(false);
    setSettleFriendScopeId("");
  };

  return (
    <div className="app-page people-page">
      {detailPerson ? (
        <div className="subpage-title-row">
          <button className="back-button" type="button" onClick={() => setDetailPersonId("")} title="Back to people">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="page-title">People</h2>
            <p className="page-subtitle">Friend ledger and profile.</p>
          </div>
        </div>
      ) : (
        <div className="illustrated-page-head people-illustrated-head">
          <div>
            <h2 className="page-title">People</h2>
            <p className="page-subtitle">Shared money without the confusion.</p>
          </div>
          <div className="page-head-icon-cluster" aria-hidden="true">
            <Users size={30} />
            <IndianRupee size={20} />
          </div>
        </div>
      )}
      {detailPerson ? (
      <>
        <section className="person-profile-card">
          <div className="person-profile-avatar">{detailPerson.localDisplayName.slice(0, 2).toUpperCase()}</div>
          <strong>
            {detailPerson.verified || detailPerson.status === "connected" ? <Star className="verified-star" size={15} fill="currentColor" /> : null}
            {detailPerson.localDisplayName}
          </strong>
          <p>Verified name: {detailPerson.serverDisplayName || detailPerson.localDisplayName}</p>
          <button className="connection-code-pill" type="button" onClick={() => void copyFriendCode(detailPerson)}>
            {detailPerson.inviteCode || detailPerson.connectedUserId || "Local friend"} <Copy size={14} />
          </button>
          <div className="person-balance-chip">
            <span>Overall balance</span>
            <strong>{detailBalance >= 0 ? formatMoney(detailBalance, currency) : `-${formatMoney(Math.abs(detailBalance), currency)}`}</strong>
            <p>{detailBalance >= 0 ? "They owe you" : "You owe them"}</p>
          </div>
          <div className="person-metrics">
            <div><span>You owe</span><strong>{formatMoney(detailYouOwe, currency)}</strong></div>
            <div><span>Owes you</span><strong>{formatMoney(detailOwesYou, currency)}</strong></div>
            <div><span>Records</span><strong>{detailOpenSettlements.length}</strong></div>
          </div>
        </section>
        <div className="person-action-row">
          <button className="primary-button" onClick={() => openSettleMoney(detailPerson.id)}>
            <ArrowRightLeft size={17} /> Settle up
          </button>
          <button className="secondary-button" onClick={() => openRecordMoney(detailPerson.id)}>
            <FileJson size={17} /> Record
          </button>
        </div>
        <section className="compact-section">
          <span className="section-kicker">Nickname</span>
          <div className="nickname-card">
            <input className="field-input" value={nicknameDraft} onChange={(event) => setNicknameDraft(event.target.value)} placeholder="Friend nickname" />
            <LoadingButton className="secondary-button" loading={busyAction === "nickname"} onClick={saveNickname} disabled={!nicknameDraft.trim() || nicknameDraft.trim() === detailPerson.localDisplayName}>
              Save nickname
            </LoadingButton>
          </div>
        </section>
        <section className="compact-section">
          <span className="section-kicker">Open Records</span>
          <div className="friend-mini-list">
            {detailOpenSettlements.map((settlement) => (
              <button className="person-record-row" key={settlement.id} onClick={() => setSelectedSettlement(settlement)} type="button">
                <div>
                  <strong>{settlement.note || (settlement.direction === "to_me" ? "They owe me" : "I owe them")}</strong>
                  <p>
                    {snapshot.categories.find((category) => category.id === settlement.categoryId)?.name || "Shared money"} · {formatDate(settlement.date)} · {settlement.direction === "to_me" ? "They owe me" : "I owe them"}
                    {settlement.status === "pending_settlement" ? " · Waiting for acknowledgement" : ""}
                  </p>
                </div>
                <span className={settlement.direction === "to_me" ? "money-positive" : "money-negative"}>
                  {formatMoney(settlement.originalAmount - settlement.repaidAmount, currency)}
                </span>
              </button>
            ))}
            {detailOpenSettlements.length === 0 ? <Empty text="No open records for this friend." /> : null}
          </div>
        </section>
        <div className="person-danger-row">
          {detailPerson.status !== "blocked" ? (
            <button className="secondary-button" disabled={busyAction === "friend-action"} onClick={() => setFriendConfirm({ type: "block", person: detailPerson })}>
              Block
            </button>
          ) : null}
          <button className="secondary-button danger-button" disabled={busyAction === "friend-action"} onClick={() => setFriendConfirm({ type: "remove", person: detailPerson, linked: detailSettlements.length > 0 })}>
            <Trash2 size={15} /> {detailSettlements.length ? "Hide" : "Remove"}
          </button>
        </div>
      </>
      ) : (
      <>
      <section className="people-balance-card">
        <span>Overall balance</span>
        <strong>{totalPeopleBalance >= 0 ? `You are owed ${formatMoney(totalPeopleBalance, currency)}` : `You owe ${formatMoney(Math.abs(totalPeopleBalance), currency)}`}</strong>
        <p>Settle up, split up, stay in sync.</p>
        <div className="people-balance-mini-grid">
          <div><ArrowUpRight size={24} /><span>You owe</span><strong>{formatMoney(snapshot.settlements.filter((item) => !item.deletedAt && item.direction === "by_me").reduce((sum, item) => sum + item.originalAmount - item.repaidAmount, 0), currency)}</strong></div>
          <div><ArrowDownLeft size={24} /><span>Owed to you</span><strong>{formatMoney(snapshot.settlements.filter((item) => !item.deletedAt && item.direction === "to_me").reduce((sum, item) => sum + item.originalAmount - item.repaidAmount, 0), currency)}</strong></div>
        </div>
      </section>
      <div className="people-action-row">
        <button className="primary-button" onClick={() => setShowAddFriendModal(true)}>
          <UserPlus size={19} /> Add Friend <ChevronDown size={18} />
        </button>
        <button className="secondary-button" onClick={() => openRecordMoney(primaryFriend?.id)}>
          <FileJson size={18} /> Record <ChevronDown size={18} />
        </button>
        <LoadingButton className="secondary-button" loading={busyAction === "refresh"} onClick={refreshPeople}>
          <RefreshCw size={18} /> Refresh <ChevronDown size={18} />
        </LoadingButton>
      </div>
      <label className="people-search-wrap">
        <Search size={20} />
        <input className="field-input people-search" value={friendSearch} onChange={(event) => setFriendSearch(event.target.value)} placeholder="Search friends or code..." />
      </label>
      <Panel className="people-section-card people-list-card" title={`Friends · ${filteredPeople.length}`}>
        <div className="grid gap-3">
          <div className="friends-grid">
            {filteredPeople.length === 0 ? (
              <div className="friends-empty-state">
                <Users size={38} />
                <strong>{activePeople.length === 0 ? "No friends added yet." : "No friends matched your search."}</strong>
                <p>Add your friends to start tracking shared expenses together.</p>
                <button className="secondary-button" type="button" onClick={() => setShowAddFriendModal(true)}>
                  <Plus size={18} /> Add Your First Friend
                </button>
              </div>
            ) : null}
            {visiblePeople.map((person) => {
              const balance = personBalance(person, snapshot.settlements);
              const linked = snapshot.settlements.some((settlement) => settlement.personId === person.id);
              return <FriendCard key={person.id} person={person} balance={balance} currency={currency} linked={linked} busy={busyAction === "friend-action"} onOpen={(target) => {
                setSelectedFriendId(target.id);
                setDetailPersonId(target.id);
              }} onRespond={respondFriend} onConfirm={setFriendConfirm} />;
            })}
          </div>
          {filteredPeople.length > 4 ? (
            <button className="secondary-button w-full" onClick={() => setShowAllFriends(true)}>
              Show all friends
            </button>
          ) : null}
        </div>
      </Panel>
      {showAddFriendModal ? (
        <ListModal title="Add Person" onClose={() => setShowAddFriendModal(false)}>
          <div id="friend-create-form" className="modal-form-grid">
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
            {verifiedFriend ? (
              <div className="verified-friend-banner">
                <span>Verified user</span>
                <strong>{verifiedFriend.displayName}</strong>
              </div>
            ) : null}
            {inviteCode.trim() ? (
              <LoadingButton className="secondary-button" loading={busyAction === "verify"} onClick={verifyFriendCode}>
                Verify Connection Code
              </LoadingButton>
            ) : null}
            <LoadingButton className="primary-button" loading={busyAction === "friend"} onClick={async () => {
              const shouldClose = !inviteCode.trim() || verifiedFriend;
              await addPerson();
              if (shouldClose) setShowAddFriendModal(false);
            }} disabled={!name.trim() || (Boolean(inviteCode.trim()) && !verifiedFriend)}>
              <UserPlus size={18} /> {inviteCode.trim() ? "Send Request" : "Add Local Person"}
            </LoadingButton>
          </div>
        </ListModal>
      ) : null}
      {showAllFriends ? (
        <ListModal title="All Friends" onClose={() => setShowAllFriends(false)}>
          <div className="friends-grid">
            {activePeople.map((person) => {
              const balance = personBalance(person, snapshot.settlements);
              const linked = snapshot.settlements.some((settlement) => settlement.personId === person.id);
              return <FriendCard key={person.id} person={person} balance={balance} currency={currency} linked={linked} busy={busyAction === "friend-action"} onOpen={(target) => {
                setSelectedFriendId(target.id);
                setDetailPersonId(target.id);
                setShowAllFriends(false);
              }} onRespond={respondFriend} onConfirm={setFriendConfirm} />;
            })}
          </div>
        </ListModal>
      ) : null}
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
              <LoadingButton className="primary-button danger-action" loading={busyAction === "friend-action"} onClick={confirmFriendAction}>
                {friendConfirm.type === "block" ? "Block" : friendConfirm.linked ? "Hide" : "Remove"}
              </LoadingButton>
            </div>
          </div>
        </div>
      ) : null}
      {pendingEvents.length || myPendingEvents.length ? (
        <Panel title="Acknowledgements" icon={<RefreshCw size={18} />}>
          <div className="grid gap-3">
            {pendingEvents.map((event) => {
              const amountValue = Number(event.amount) || Number(event.payload.amount) || 0;
              const friend = snapshot.people.find((person) => person.friendUserId === event.requested_by);
              return (
                <div className="approval-card" key={event.id}>
                  <div>
                    <strong>{friend?.localDisplayName ?? (typeof event.payload.requesterName === "string" ? event.payload.requesterName : "Friend")} marked returned money</strong>
                    <p>{formatMoney(amountValue, currency)} · {typeof event.payload.note === "string" ? event.payload.note : "Returned money"}</p>
                  </div>
                  <SelectField label="Add to account" value={eventAccounts[event.id] || activeAccounts[0]?.id || ""} onChange={(value) => setEventAccounts((items) => ({ ...items, [event.id]: value }))}>
                    {activeAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </SelectField>
                  <div className="friend-actions">
                    <button className="secondary-button" disabled={busyEventId === event.id} onClick={() => respondRepayment(event, "reject")}>
                      Reject
                    </button>
                    <LoadingButton className="primary-button" loading={busyEventId === event.id} onClick={() => respondRepayment(event, "accept")}>
                      Accept & Add
                    </LoadingButton>
                  </div>
                </div>
              );
            })}
            {myPendingEvents.map((event) => (
              <div className="approval-card approval-card-muted" key={event.id}>
                <div>
                  <strong>Waiting for friend acknowledgement</strong>
                  <p>{formatMoney(Number(event.amount) || Number(event.payload.amount) || 0, currency)} · {typeof event.payload.note === "string" ? event.payload.note : "Returned money"}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
      </>
      )}
      {showRecordMoneyModal ? (
        <ListModal title="Record Shared Money" onClose={() => setShowRecordMoneyModal(false)}>
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
            {direction === "to_me" ? (
              <>
                <SelectField label="Paid from account" value={accountId} onChange={setAccountId}>
                  {activeAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField label="Expense category" value={categoryId} onChange={setCategoryId}>
                  {expenseCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </SelectField>
              </>
            ) : null}
            <input className="field-input" type="date" value={settlementDate} onChange={(event) => setSettlementDate(event.target.value)} />
            <input className="field-input" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" />
            <input className="field-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Note" />
          </div>
          <div className="receipt-control">
            <span className="field-label">Receipt</span>
            <label className={`secondary-button cursor-pointer ${settlementReceiptProcessing ? "button-loading" : ""}`}>
              <Image size={18} /> {settlementReceiptProcessing ? "Compressing" : settlementReceiptName ? "Change Receipt" : "Add Receipt"}
              <input
                className="hidden"
                type="file"
                accept="image/*"
                disabled={settlementReceiptProcessing}
                onChange={(event) => {
                  void attachSettlementReceipt(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {settlementReceiptData ? (
              <div className="receipt-preview-row">
                <img className="receipt-preview" src={settlementReceiptData} alt={settlementReceiptName || "Receipt preview"} />
                <button className="small-button" onClick={() => downloadDataUrl(settlementReceiptData, settlementReceiptName || "micham-owe-receipt.jpg")}>
                  <Download size={15} /> Download
                </button>
              </div>
            ) : null}
          </div>
          <LoadingButton className="primary-button" loading={busyAction === "record"} onClick={async () => {
            const saved = await addSettlement();
            if (saved) setShowRecordMoneyModal(false);
          }} disabled={!personId || !amount || settlementReceiptProcessing}>
            Record Owe / Owed
          </LoadingButton>
        </div>
        </ListModal>
      ) : null}
      {showSettleMoneyModal ? (
        <ListModal title="Settle Returned Money" onClose={closeSettleMoney}>
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_140px_1fr_auto]">
            <SelectField label="Open record" value={repaymentSettlementId} onChange={setRepaymentSettlementId}>
              {scopedOpenSettlements.map((settlement) => {
                const person = snapshot.people.find((item) => item.id === settlement.personId);
                const remaining = settlement.originalAmount - settlement.repaidAmount;
                return (
                  <option key={settlement.id} value={settlement.id}>
                    {person?.localDisplayName ?? "Friend"} - {formatMoney(remaining, currency)}
                  </option>
                );
              })}
            </SelectField>
            <SelectField label="Money account" value={repaymentAccountId} onChange={setRepaymentAccountId}>
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </SelectField>
            <input className="field-input" type="number" value={repaymentAmount} onChange={(event) => setRepaymentAmount(event.target.value)} placeholder="Returned" />
            <input className="field-input" type="date" value={repaymentDate} onChange={(event) => setRepaymentDate(event.target.value)} />
            <input className="field-input" value={repaymentNote} onChange={(event) => setRepaymentNote(event.target.value)} placeholder="Cash returned, UPI paid..." />
            <LoadingButton className="primary-button" loading={busyAction === "settle"} onClick={async () => {
              const saved = await addRepayment();
              if (saved) closeSettleMoney();
            }} disabled={!repaymentSettlementId || !repaymentAmount}>
              Update
            </LoadingButton>
          </div>
          {scopedOpenSettlements.length === 0 ? <Empty text={settleFriendScopeId ? "No open records for this friend." : "No open records to settle."} /> : null}
        </div>
        </ListModal>
      ) : null}
      {selectedSettlement ? (
        <SettlementDetailModal
          settlement={selectedSettlement}
          snapshot={snapshot}
          currency={currency}
          notify={notify}
          onDone={onDone}
          onClose={() => setSelectedSettlement(null)}
        />
      ) : null}
    </div>
  );
}

function SettlementDetailModal({
  settlement,
  snapshot,
  currency,
  notify,
  onDone,
  onClose,
}: {
  settlement: Settlement;
  snapshot: Snapshot;
  currency: string;
  notify: (message: string, tone?: Toast["tone"]) => void;
  onDone: () => Promise<void>;
  onClose: () => void;
}) {
  const person = snapshot.people.find((item) => item.id === settlement.personId);
  const activeAccounts = snapshot.accounts.filter((account) => account.active);
  const expenseCategories = snapshot.categories.filter((category) => category.active && category.kind === "expense");
  const [amount, setAmount] = useState(String(settlement.originalAmount));
  const [date, setDate] = useState(settlement.date.slice(0, 10));
  const [direction, setDirection] = useState<"to_me" | "by_me">(settlement.direction);
  const [accountId, setAccountId] = useState(settlement.accountId || activeAccounts[0]?.id || "");
  const [categoryId, setCategoryId] = useState(settlement.categoryId || expenseCategories[0]?.id || "");
  const [note, setNote] = useState(settlement.note || "");
  const [receiptName, setReceiptName] = useState(settlement.receiptName || "");
  const [receiptData, setReceiptData] = useState(settlement.receiptData || "");
  const [receiptProcessing, setReceiptProcessing] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "delete">("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const repayments = snapshot.repayments.filter((repayment) => repayment.settlementId === settlement.id && !repayment.deletedAt);
  const canModify = settlement.repaidAmount <= 0 && repayments.length === 0 && settlement.status !== "settled";
  const remaining = Math.max(0, settlement.originalAmount - settlement.repaidAmount);

  const attachReceipt = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("Upload an image file for the receipt.", "error");
      return;
    }
    if (file.size > MAX_RECEIPT_SOURCE_BYTES) {
      notify("Receipt image is too large. Choose an image under 6 MB.", "error");
      return;
    }
    setReceiptProcessing(true);
    try {
      setReceiptName(file.name);
      setReceiptData(await compressImageFile(file, {
        maxSide: RECEIPT_IMAGE_MAX_SIDE,
        quality: 0.72,
        maxBytes: MAX_RECEIPT_COMPRESSED_BYTES,
      }));
      notify("Receipt compressed and attached.", "success");
    } catch (error) {
      setReceiptName("");
      setReceiptData("");
      notify(error instanceof Error ? error.message : "Receipt image could not be processed.", "error");
    } finally {
      setReceiptProcessing(false);
    }
  };

  const mirrorSettlementUpdate = async (patch: Partial<Settlement>) => {
    if (!person?.status || person.status !== "connected" || !person.connectedUserId || !snapshot.profile?.connectedUserId || !getServerToken()) return;
    const mirrored: Settlement = {
      ...settlement,
      ...patch,
      id: settlement.linkedSettlementId || `mirror-${settlement.id}`,
      ownerProfileId: undefined,
      personId: "",
      direction: (patch.direction || settlement.direction) === "to_me" ? "by_me" : "to_me",
      accountId: undefined,
      categoryId: undefined,
      transactionId: undefined,
      linkedSettlementId: settlement.id,
      friendUserId: snapshot.profile.connectedUserId,
      syncState: "synced",
    };
    await mirrorServerFriendEntity(person.connectedUserId, "settlements", mirrored.id, { ...mirrored });
  };

  const saveSettlement = async () => {
    if (busy) return;
    if (!canModify) {
      notify("This record already has settlement activity. Create a returned-money update instead.", "warning");
      return;
    }
    const numericAmount = Number(amount) || 0;
    if (!numericAmount) {
      notify("Enter a valid amount.", "error");
      return;
    }
    if (direction === "to_me" && !accountId) {
      notify("Choose the account used for this shared expense.", "error");
      return;
    }
    const timestamp = nowIso();
    const updatedDate = `${date}T${new Date().toTimeString().slice(0, 8)}`;
      const uploadedReceipt = await maybeUploadReceipt(receiptData, receiptName, "settlement", settlement.id, notify);
      const patch: Partial<Settlement> = applyServerReceipt({
        direction,
        originalAmount: numericAmount,
        accountId: direction === "to_me" ? accountId : undefined,
        categoryId: direction === "to_me" ? categoryId || undefined : undefined,
        receiptName: receiptName || undefined,
        receiptData: receiptData || undefined,
        date: updatedDate,
        note,
        updatedAt: timestamp,
        syncState: snapshot.config.syncEnabled ? "queued" : "local",
      }, uploadedReceipt);
    setBusy("save");
    try {
      await db.transaction("rw", db.settlements, db.transactions, async () => {
        await db.settlements.update(settlement.id, patch);
        if (settlement.transactionId) {
          const transaction = await db.transactions.get(settlement.transactionId);
          if (transaction) {
            await db.transactions.update(transaction.id, {
              type: "expense",
              amount: numericAmount,
              accountId: direction === "to_me" ? accountId : transaction.accountId,
              categoryId: direction === "to_me" ? categoryId || undefined : transaction.categoryId,
              date: updatedDate,
              note: note || transaction.note,
              receiptName: receiptName || undefined,
              receiptData: receiptData || undefined,
              personIds: [settlement.personId],
              edited: true,
              editCount: (transaction.editCount || 0) + 1,
              lastEditedAt: timestamp,
              previousVersion: {
                type: transaction.type,
                amount: transaction.amount,
                accountId: transaction.accountId,
                toAccountId: transaction.toAccountId,
                categoryId: transaction.categoryId,
                date: transaction.date,
                note: transaction.note,
                editedAt: timestamp,
              },
              updatedAt: timestamp,
              syncState: snapshot.config.syncEnabled ? "queued" : "local",
            });
          }
        }
      });
      await mirrorSettlementUpdate(patch);
      notify("Shared record updated.", "success");
      await onDone();
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Shared record could not be updated.", "error");
    } finally {
      setBusy("");
    }
  };

  const deleteSettlement = async () => {
    if (busy) return;
    if (!canModify) {
      notify("This record cannot be deleted after repayment activity starts.", "warning");
      return;
    }
    const timestamp = nowIso();
    setBusy("delete");
    try {
      await db.transaction("rw", db.settlements, db.transactions, async () => {
        await db.settlements.update(settlement.id, {
          deletedAt: timestamp,
          updatedAt: timestamp,
          syncState: snapshot.config.syncEnabled ? "queued" : "local",
        });
        if (settlement.transactionId) {
          await db.transactions.update(settlement.transactionId, {
            deletedAt: timestamp,
            updatedAt: timestamp,
            syncState: snapshot.config.syncEnabled ? "queued" : "local",
          });
        }
      });
      await mirrorSettlementUpdate({ deletedAt: timestamp, updatedAt: timestamp });
      notify("Shared record deleted.", "warning");
      await onDone();
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Shared record could not be deleted.", "error");
    } finally {
      setBusy("");
    }
  };

  return (
    <ListModal title="Shared Money Details" onClose={onClose}>
      <div className="settlement-detail-modal">
        <div className="settlement-detail-summary">
          <div>
            <span>{person?.localDisplayName || "Friend"}</span>
            <strong>{formatMoney(remaining, currency)}</strong>
            <p>{settlement.direction === "to_me" ? "They owe you" : "You owe them"} · {formatDate(settlement.date)}</p>
          </div>
          <span className={`status-pill status-${settlement.status || "open"}`}>{settlement.status || "open"}</span>
        </div>
        {!canModify ? <p className="form-hint">Repayment has started, so the original shared record is locked. Use settlement updates for further changes.</p> : null}
        <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
          <SelectField label="Type" value={direction} onChange={(value) => setDirection(value as "to_me" | "by_me")}>
            <option value="to_me">They owe me</option>
            <option value="by_me">I owe them</option>
          </SelectField>
          <input className="field-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={!canModify} />
          {direction === "to_me" ? (
            <>
              <SelectField label="Paid from account" value={accountId} onChange={setAccountId}>
                {activeAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Expense category" value={categoryId} onChange={setCategoryId}>
                {expenseCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </SelectField>
            </>
          ) : null}
          <input className="field-input" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" disabled={!canModify} />
          <input className="field-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Note" disabled={!canModify} />
        </div>
        <div className="receipt-control">
          <span className="field-label">Receipt</span>
          <label className={`secondary-button cursor-pointer ${receiptProcessing ? "button-loading" : ""}`}>
            <Image size={18} /> {receiptProcessing ? "Compressing" : receiptName ? "Change Receipt" : "Add Receipt"}
            <input
              className="hidden"
              type="file"
              accept="image/*"
              disabled={!canModify || receiptProcessing}
              onChange={(event) => {
                void attachReceipt(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
          {receiptData ? (
            <div className="receipt-preview-row">
              <img className="receipt-preview" src={receiptData} alt={receiptName || "Receipt"} />
              <button className="small-button" onClick={() => downloadDataUrl(receiptData, receiptName || "micham-shared-money-receipt.jpg")}>
                <Download size={15} /> Download
              </button>
            </div>
          ) : settlement.receiptPath ? (
            <button className="secondary-button" type="button" onClick={() => void openReceipt(settlement, notify)}>
              <Image size={18} /> Open Receipt
            </button>
          ) : <Empty text="No receipt attached." />}
        </div>
        <div className="modal-actions modal-actions-spread">
          {confirmDelete ? (
            <>
              <button className="secondary-button" onClick={() => setConfirmDelete(false)}>Cancel Delete</button>
              <LoadingButton className="primary-button danger-action" loading={busy === "delete"} onClick={deleteSettlement}>Confirm Delete</LoadingButton>
            </>
          ) : (
            <>
              <button className="secondary-button danger-button" onClick={() => setConfirmDelete(true)} disabled={!canModify}>
                <Trash2 size={16} /> Delete
              </button>
              <LoadingButton className="primary-button" loading={busy === "save"} onClick={saveSettlement} disabled={!canModify || receiptProcessing}>
                Save Changes
              </LoadingButton>
            </>
          )}
        </div>
      </div>
    </ListModal>
  );
}

function ManageView({
  snapshot,
  notify,
  onDone,
  onNavigate,
}: {
  snapshot: Snapshot;
  notify: (message: string, tone?: Toast["tone"]) => void;
  onDone: () => Promise<void>;
  onNavigate: (view: View) => void;
}) {
  const [categoryName, setCategoryName] = useState("");
  const [categoryKind, setCategoryKind] = useState<"expense" | "income">("expense");
  const [manageTab, setManageTab] = useState<"accounts" | "categories" | "budgets">("accounts");
  const [budgetCategoryId, setBudgetCategoryId] = useState(snapshot.categories.find((item) => item.kind === "expense")?.id ?? "");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountOpening, setAccountOpening] = useState("");
  const [showAccountsModal, setShowAccountsModal] = useState(false);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
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
    <div className="app-page manage-page">
      <div className="subpage-title-row">
        <button className="back-button" type="button" onClick={() => onNavigate("settings")} title="Back to settings">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="page-title"><SlidersHorizontal size={24} /> Manage</h2>
          <p className="page-subtitle">Accounts, categories, and budgets in one place.</p>
        </div>
      </div>
      <div className="manage-tabs" role="tablist" aria-label="Manage sections">
        <button className={manageTab === "accounts" ? "manage-tab manage-tab-active" : "manage-tab"} type="button" onClick={() => setManageTab("accounts")}>
          <WalletCards size={16} /> Accounts
        </button>
        <button className={manageTab === "categories" ? "manage-tab manage-tab-active" : "manage-tab"} type="button" onClick={() => setManageTab("categories")}>
          <Tags size={16} /> Categories
        </button>
        <button className={manageTab === "budgets" ? "manage-tab manage-tab-active" : "manage-tab"} type="button" onClick={() => setManageTab("budgets")}>
          <Target size={16} /> Budgets
        </button>
      </div>
      {manageTab === "accounts" ? (
      <Panel className="manage-card" title="Accounts">
        <div className="grid gap-3">
          <div className="manage-create-form">
            <input className="field-input" value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Cash, Bank, UPI wallet" />
            <input className="field-input" type="number" value={accountOpening} onChange={(event) => setAccountOpening(event.target.value)} placeholder="Opening" />
            <button className="primary-button" onClick={addAccount} disabled={!accountName.trim()}>
              <Plus size={18} /> Add
            </button>
          </div>
          <div className="manage-list">
            {snapshot.accounts.slice(0, 3).map((account) => {
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
          {snapshot.accounts.length > 3 ? (
            <button className="secondary-button w-full" onClick={() => setShowAccountsModal(true)}>Show all accounts</button>
          ) : null}
        </div>
      </Panel>
      ) : null}

      {manageTab === "categories" ? (
      <Panel className="manage-card" title="Categories">
        <div className="grid gap-3">
          <div className="manage-create-form">
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
            {snapshot.categories.slice(0, 3).map((category) => (
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
          {snapshot.categories.length > 3 ? (
            <button className="secondary-button w-full" onClick={() => setShowCategoriesModal(true)}>Show all categories</button>
          ) : null}
        </div>
      </Panel>
      ) : null}

      {manageTab === "budgets" ? (
      <Panel className="manage-card" title="Budgets">
        <div className="grid gap-3">
          <div className="manage-create-form">
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
      ) : null}
      {showAccountsModal ? (
        <ListModal title="All Accounts" onClose={() => setShowAccountsModal(false)}>
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
        </ListModal>
      ) : null}
      {showCategoriesModal ? (
        <ListModal title="All Categories" onClose={() => setShowCategoriesModal(false)}>
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
        </ListModal>
      ) : null}
    </div>
  );
}

function SettingsView({
  snapshot,
  notify,
  onDone,
  onLogout,
  onNavigate,
  onStartTour,
  onProfileRestored,
}: {
  snapshot: Snapshot;
  notify: (message: string, tone?: Toast["tone"]) => void;
  onDone: (profileId?: string) => Promise<void>;
  onLogout: () => void;
  onNavigate: (view: View) => void;
  onStartTour: () => void;
  onProfileRestored: (profileId: string) => void;
}) {
  const [groqApiKey, setGroqApiKey] = useState(snapshot.config.groqApiKey ?? "");
  const [aiModel, setAiModel] = useState(snapshot.config.aiModel);
  const [syncEmail, setSyncEmail] = useState("");
  const [syncPassword, setSyncPassword] = useState("");
  const [profileName, setProfileName] = useState(snapshot.profile?.displayName ?? "");
  const [profileCurrency, setProfileCurrency] = useState(snapshot.profile?.currency ?? snapshot.config.defaultCurrency);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busyAction, setBusyAction] = useState<"" | "sync" | "password" | "delete">("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ payload: ImportPayload; duplicateIds: number } | null>(null);
  const [storageUsage, setStorageUsage] = useState<{ usedBytes: number; limitBytes: number; remainingBytes: number; fileCount: number } | null>(null);
  const [storageFrom, setStorageFrom] = useState("");
  const [storageTo, setStorageTo] = useState("");
  const [settingsTab, setSettingsTab] = useState<SettingsTabKey>("profile");

  useEffect(() => {
    setProfileName(snapshot.profile?.displayName ?? "");
    setProfileCurrency(snapshot.profile?.currency ?? snapshot.config.defaultCurrency);
  }, [snapshot.profile?.id, snapshot.profile?.displayName, snapshot.profile?.currency, snapshot.config.defaultCurrency]);

  const exportData = async () => {
    const { groqApiKey: _groqApiKey, ...exportableConfig } = snapshot.config;
    const chatMessages = snapshot.profile?.id
      ? await db.chatMessages.where("ownerProfileId").equals(snapshot.profile.id).toArray()
      : [];
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
      chatMessages,
      config: exportableConfig,
    };
    downloadBlob(JSON.stringify(payload, null, 2), "application/json", `${snapshot.config.appName.toLowerCase()}-backup.json`);
    notify("Backup file downloaded.", "success");
  };

  const importData = async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      notify("Import file is too large. Maximum size is 25 MB.", "error");
      return;
    }
    let payload: ImportPayload;
    try {
      payload = JSON.parse(await file.text()) as ImportPayload;
    } catch {
      notify("Import file is not valid JSON.", "error");
      return;
    }
    if (!Array.isArray(payload.accounts) || !Array.isArray(payload.transactions) || !Array.isArray(payload.categories)) {
      notify("Import file is not valid.", "error");
      return;
    }
    const duplicateIds = payload.transactions.filter((item) => snapshot.transactions.some((existing) => existing.id === item.id)).length;
    setPendingImport({ payload, duplicateIds });
  };

  const confirmImportData = async () => {
    if (!pendingImport) return;
    const { payload } = pendingImport;
    setPendingImport(null);
    await db.transaction(
      "rw",
      [db.profiles, db.appConfig, db.accounts, db.categories, db.transactions, db.budgets, db.recurringTransactions, db.people, db.settlements, db.repayments, db.chatMessages],
      async () => {
        if (payload.profile) await db.profiles.put(payload.profile);
        if (payload.config) await db.appConfig.put({ ...payload.config, groqApiKey: undefined, updatedAt: nowIso() });
        await db.accounts.bulkPut(payload.accounts);
        await db.categories.bulkPut(payload.categories);
        await db.transactions.bulkPut(payload.transactions);
        await db.budgets.bulkPut(payload.budgets ?? []);
        await db.recurringTransactions.bulkPut(payload.recurringTransactions ?? []);
        await db.people.bulkPut(payload.people ?? []);
        await db.settlements.bulkPut(payload.settlements ?? []);
        await db.repayments.bulkPut(payload.repayments ?? []);
        await db.chatMessages.bulkPut(payload.chatMessages ?? []);
      },
    );
    if (payload.profile?.id) {
      localStorage.setItem("micham_role", "user");
      localStorage.setItem("micham_profile_id", payload.profile.id);
      onProfileRestored(payload.profile.id);
    }
    notify("Import completed.", "success");
    await onDone(payload.profile?.id);
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
    if (busyAction) return;
    if (!snapshot.profile) return;
    setBusyAction("sync");
    try {
      const timestamp = nowIso();
      const connectionCode = snapshot.profile.connectionCode || createConnectionCode();
      const isLocalProfile = snapshot.profile.loginId === "local-device" || snapshot.profile.loginId.startsWith("local:");
      const normalizedEmail = syncEmail.trim().toLowerCase();

      if (snapshot.profile.connectedUserId) {
        if (!getServerToken()) {
          notify("Login again to refresh the server session before syncing.", "warning");
          return;
        }
        await uploadPendingReceipts(snapshot.profile, notify);
        await pushServerSnapshot(await readSnapshot(snapshot.profile.id));
        await pullServerSnapshot(snapshot.profile.id);
        await syncServerFriendsToLocal(snapshot.profile);
        await db.appConfig.update("primary", { syncEnabled: true, updatedAt: timestamp });
        setSyncPassword("");
        notify("Latest local data synced.", "success");
        await onDone();
        return;
      }

      if (!isLocalProfile) {
        notify("Login again with this email before syncing.", "warning");
        return;
      }
      if (!isValidEmail(normalizedEmail)) {
        notify("Enter a valid email to create the account.", "error");
        return;
      }
      if (!/^\d{4}$/.test(syncPassword)) {
        notify("PIN must be exactly 4 digits.", "error");
        return;
      }
      const existing = await db.profiles.where("loginId").equals(normalizedEmail).first();
      if (existing && existing.id !== snapshot.profile.id) {
        notify("An account already exists for this email.", "error");
        return;
      }
      const syncPasswordHash = await hashPassword(syncPassword);
      const updatedProfile: Profile = {
        ...snapshot.profile,
        connectionCode,
        loginId: normalizedEmail,
        passwordHash: syncPasswordHash,
        displayName: snapshot.profile.displayName || normalizedEmail.split("@")[0],
        updatedAt: timestamp,
        syncState: "queued",
      };
      let connectedUserId = snapshot.profile.connectedUserId;
      if (!getServerToken()) {
        try {
          await registerServerAccount(normalizedEmail, syncPassword, updatedProfile.displayName, updatedProfile.currency);
          notify("Verification email sent. Verify your account, login, then tap Sync To Server again.", "success");
          return;
        } catch (error) {
          if (!(error instanceof ApiClientError) || error.status !== 409) throw error;
        }
        const { user } = await loginServerAccount(normalizedEmail, syncPassword);
        connectedUserId = user.id;
        updatedProfile.connectedUserId = user.id;
        updatedProfile.connectionCode = user.connectionCode;
        updatedProfile.displayName = user.displayName;
        updatedProfile.currency = user.currency;
      }
      await uploadPendingReceipts(updatedProfile, notify);
      const uploadReadySnapshot = await readSnapshot(snapshot.profile.id);
      await pushServerSnapshot({ ...uploadReadySnapshot, profile: updatedProfile });
      await pullServerSnapshot(snapshot.profile.id);
      await syncServerFriendsToLocal({ ...updatedProfile, connectedUserId });
      await db.transaction(
        "rw",
        [db.profiles, db.accounts, db.categories, db.transactions, db.budgets, db.recurringTransactions, db.people, db.settlements, db.repayments, db.appConfig],
        async () => {
          await db.profiles.update(snapshot.profile!.id, {
            connectedUserId,
            connectionCode: updatedProfile.connectionCode,
            loginId: normalizedEmail,
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
      notify("Account connected and local data synced.", "success");
      await onDone();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Account could not be synced.", error instanceof Error && error.message.toLowerCase().includes("verify") ? "warning" : "error");
    } finally {
      setBusyAction("");
    }
  };

  const changePassword = async () => {
    if (busyAction) return;
      if (!snapshot.profile) return;
      setBusyAction("password");
      try {
      if (!/^\d{4}$/.test(newPassword)) {
        notify("New PIN must be exactly 4 digits.", "error");
        return;
      }
      if (newPassword !== confirmPassword) {
        notify("New PIN and confirmation do not match.", "error");
        return;
      }
      if (snapshot.profile.connectedUserId) {
        if (!getServerToken()) {
          notify("Login again before changing the cloud PIN.", "warning");
          return;
        }
        await changeServerPin(currentPassword, newPassword);
      } else if ((await hashPassword(currentPassword)) !== snapshot.profile.passwordHash) {
          notify("Current PIN is incorrect.", "error");
          return;
        }
      if (!snapshot.profile.connectedUserId) {
        await db.profiles.update(snapshot.profile.id, { passwordHash: await hashPassword(newPassword), updatedAt: nowIso() });
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      notify("PIN changed.", "success");
      await onDone();
    } finally {
      setBusyAction("");
    }
  };

  const deleteAccount = async () => {
    if (busyAction || !snapshot.profile) return;
    setBusyAction("delete");
    try {
      if (snapshot.profile.connectedUserId && !getServerToken()) {
        notify("Login again before deleting the server account.", "warning");
        return;
      }
      if (snapshot.profile.connectedUserId) {
        await emailServerDataExport();
        await deleteServerAccount();
      }
      await clearLocalProfileData(snapshot.profile.id);
      clearServerToken();
      localStorage.removeItem("micham_role");
      localStorage.removeItem("micham_profile_id");
      notify("Account deleted.", "warning");
      onLogout();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Account could not be deleted.", "error");
    } finally {
      setBusyAction("");
      setDeleteConfirm(false);
    }
  };

  const setThemeMode = async (themeMode: AppConfig["themeMode"]) => {
    rememberedThemeMode(themeMode);
    await db.appConfig.update("primary", { themeMode, updatedAt: nowIso() });
    notify(`${themeMode === "system" ? "System" : themeMode === "dark" ? "Dark" : "Light"} theme enabled.`, "success");
    await onDone();
  };

  const copyConnectionCode = async () => {
    const code = snapshot.profile?.connectionCode;
    if (!code) {
      notify("Connection code is not available.", "warning");
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      notify("Connection code copied.", "success");
    } catch {
      notify(`Connection code: ${code}`, "info");
    }
  };

  const saveProfile = async () => {
    if (!snapshot.profile) return;
    const name = profileName.trim();
    if (!name) {
      notify("Enter your profile name.", "error");
      return;
    }
    await db.profiles.update(snapshot.profile.id, {
      displayName: name,
      currency: profileCurrency || snapshot.config.defaultCurrency,
      updatedAt: nowIso(),
      syncState: snapshot.config.syncEnabled ? "queued" : "local",
    });
    notify("Profile updated.", "success");
    setShowProfileEdit(false);
    await onDone();
  };

  const refreshStorageUsage = async () => {
    if (!snapshot.profile?.connectedUserId || !getServerToken()) {
      notify("Connect this profile to cloud before checking receipt storage.", "warning");
      return;
    }
    setBusyAction("sync");
    try {
      const result = await getServerReceiptUsage();
      setStorageUsage(result.usage);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Receipt storage could not be checked.", "error");
    } finally {
      setBusyAction("");
    }
  };

  const clearReceiptStorage = async () => {
    if (!snapshot.profile?.connectedUserId || !getServerToken()) {
      notify("Connect this profile to cloud before clearing receipt storage.", "warning");
      return;
    }
    setBusyAction("delete");
    try {
      const result = await clearServerReceipts(storageFrom || undefined, storageTo || undefined);
      setStorageUsage(result.usage);
      notify(`${result.deleted} receipt file(s) cleared.`, result.deleted ? "warning" : "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Receipt storage could not be cleared.", "error");
    } finally {
      setBusyAction("");
    }
  };

  return (
    <div className="app-page settings-page">
      <div className="illustrated-page-head settings-illustrated-head">
        <div>
          <h2 className="page-title"><CircleUserRound size={24} /> Profile & Settings</h2>
          <p className="page-subtitle">Profile, sync, app tools, and account safety.</p>
        </div>
      </div>
      <SettingsTabs activeTab={settingsTab} onChange={setSettingsTab} />
      <SettingsTabPage tab="profile" activeTab={settingsTab}>
      <ProfileSettingsPage>
      <Panel className="settings-card settings-profile-card profile-figma-card" title="Profile" icon={<CircleUserRound size={18} />}>
        <div className="settings-profile">
          <div className="settings-profile-hero">
            <div className="profile-avatar">{snapshot.profile?.displayName?.slice(0, 1).toUpperCase() || "M"}</div>
            <div>
              <strong>{snapshot.profile?.displayName}</strong>
              <p>{snapshot.profile?.connectedUserId ? "Cloud account" : "Local profile"}</p>
            </div>
            <button className="small-button settings-edit-button" onClick={() => setShowProfileEdit(true)} type="button">
              Edit
            </button>
          </div>
          <div className="profile-detail-list">
            <div className="profile-detail-row">
              <User size={21} />
              <span>Name</span>
              <strong className="compact-value">{snapshot.profile?.displayName}</strong>
            </div>
            <div className="profile-detail-row">
              <Mail size={21} />
              <span>Email</span>
              <strong className="compact-value" title={snapshot.profile?.loginId}>
                {snapshot.profile?.loginId.startsWith("local:") || snapshot.profile?.loginId === "local-device" ? "Local only" : snapshot.profile?.loginId}
              </strong>
            </div>
            <button className="profile-detail-row profile-detail-action" type="button" onClick={() => setShowProfileEdit(true)}>
              <IndianRupee size={21} />
              <span>Currency</span>
              <strong className="compact-value">{snapshot.profile?.currency}</strong>
              <ChevronDown size={18} />
            </button>
            <div className="profile-detail-row">
              <LinkIcon size={21} />
              <span>Connection Code</span>
              <strong className="compact-value">{snapshot.profile?.connectionCode || "Not created"}</strong>
              <button className="icon-button" onClick={() => void copyConnectionCode()} type="button" title="Copy connection code">
                <Copy size={15} />
              </button>
            </div>
          </div>
          <section className="settings-subcard">
            <div className="settings-subcard-head">
              <Palette size={22} />
              <div>
                <strong>Appearance</strong>
                <p>Choose how the app looks.</p>
              </div>
            </div>
            <div className="theme-mode-control">
              {(["system", "light", "dark"] as AppConfig["themeMode"][]).map((mode) => (
                <button
                  className={snapshot.config.themeMode === mode ? "theme-mode-active" : ""}
                  key={mode}
                  onClick={() => void setThemeMode(mode)}
                  type="button"
                >
                  {mode === "system" ? <Monitor size={15} /> : mode === "light" ? <Sun size={15} /> : <Moon size={15} />}
                  {mode[0].toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </section>
          <section className="settings-subcard">
            <div className="settings-subcard-head">
              <Settings size={22} />
              <div>
                <strong>App Settings</strong>
                <p>Manage app features.</p>
              </div>
            </div>
            <div className="settings-toggle-list">
              <div className="settings-toggle-row">
                <Cloud size={21} />
                <div>
                  <strong>Sync</strong>
                  <span>Keep your data in sync across devices.</span>
                </div>
                <label className="switch">
                  <input checked={snapshot.config.syncEnabled} type="checkbox" onChange={(event) => updateConfigToggle("syncEnabled", event.target.checked)} />
                  <span />
                </label>
              </div>
              <div className="settings-toggle-row">
                <MessageCircle size={21} />
                <div>
                  <strong>AI Chat</strong>
                  <span>Enable AI assistant in the app.</span>
                </div>
                <label className="switch">
                  <input checked={snapshot.config.aiEnabled} type="checkbox" onChange={(event) => updateConfigToggle("aiEnabled", event.target.checked)} />
                  <span />
                </label>
              </div>
            </div>
          </section>
          {snapshot.config.syncEnabled && !getServerToken() ? <p className="text-sm text-amber-700">Login again to resume server sync.</p> : null}
          {snapshot.config.aiEnabled ? <p className="text-sm text-slate-600">AI Chat is enabled.</p> : null}
          <button className="settings-signout-button" type="button" onClick={() => setLogoutConfirm(true)}>
            <LogOut size={19} /> Sign Out
          </button>
        </div>
      </Panel>
      {showProfileEdit ? (
        <ListModal title="Edit Profile" onClose={() => setShowProfileEdit(false)}>
          <div className="modal-form-grid">
            <TextField label="Name" value={profileName} onChange={setProfileName} placeholder="Your name" />
            <CurrencySelect value={profileCurrency} onChange={setProfileCurrency} />
            <button className="primary-button" onClick={() => void saveProfile()}>Save Profile</button>
          </div>
        </ListModal>
      ) : null}
      </ProfileSettingsPage>
      </SettingsTabPage>

      <SettingsTabPage tab="tools" activeTab={settingsTab}>
      <ToolsSettingsPage>
      <Panel className="settings-card" title="Tools" icon={<SlidersHorizontal size={18} />}>
        <div className="settings-tool-list">
          <button className="more-button" onClick={() => onNavigate("manage")}>
            <SlidersHorizontal size={18} />
            <span>
              <strong>Manage</strong>
              <small>Accounts, categories and budgets in one place</small>
            </span>
          </button>
          <button className="more-button" onClick={onStartTour}>
            <CircleUserRound size={18} />
            <span>
              <strong>App tour</strong>
              <small>Walk through the basics again</small>
            </span>
          </button>
        </div>
        <p className="settings-muted-note">Daily and Calendar views now live in the Activity tab.</p>
      </Panel>
      </ToolsSettingsPage>
      </SettingsTabPage>

      <SettingsTabPage tab="sync" activeTab={settingsTab}>
      <SyncCloudSettingsPage>
      <Panel className="settings-card" title="Cloud Account" icon={<Cloud size={18} />}>
        {snapshot.profile?.connectedUserId ? (
          <div className="grid gap-3">
            <div className="row">
              <span>Connected ID</span>
              <strong>{snapshot.profile.connectedUserId}</strong>
            </div>
            <LoadingButton className="primary-button" loading={busyAction === "sync"} onClick={connectProfile}>
              <RefreshCw size={18} /> Sync Now
            </LoadingButton>
            <div className="settings-action-grid">
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
              <button className="secondary-button danger-button" onClick={() => setDeleteConfirm(true)}>
                <Trash2 size={18} /> Delete & Email Export
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            <p className="text-sm text-slate-600">
              Create an account when you want this device data to be linked for future sync.
            </p>
            <TextField label="Email" value={syncEmail} onChange={setSyncEmail} placeholder="you@example.com" />
            <TextField label="Create or enter cloud PIN" value={syncPassword} onChange={(value) => setSyncPassword(value.replace(/\D/g, "").slice(0, 4))} type="password" />
            <LoadingButton className="primary-button" loading={busyAction === "sync"} onClick={connectProfile}>
              <RefreshCw size={18} /> Sync To Server
            </LoadingButton>
            <button className="secondary-button danger-button" onClick={() => setDeleteConfirm(true)}>
              <Trash2 size={18} /> Delete Local Account
            </button>
          </div>
        )}
      </Panel>
      <Panel className="settings-card" title="AI Assistant" icon={<Bot size={18} />}>
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
      </SyncCloudSettingsPage>
      </SettingsTabPage>

      <SettingsTabPage tab="security" activeTab={settingsTab}>
      <SecuritySettingsPage>
      <Panel className="settings-card" title="Change PIN" icon={<KeyRound size={18} />}>
        <div className="grid gap-3">
          <TextField label="Current PIN" value={currentPassword} onChange={(value) => setCurrentPassword(value.replace(/\D/g, "").slice(0, 4))} type="password" />
          <TextField label="New PIN" value={newPassword} onChange={(value) => setNewPassword(value.replace(/\D/g, "").slice(0, 4))} type="password" />
          <TextField label="Confirm PIN" value={confirmPassword} onChange={(value) => setConfirmPassword(value.replace(/\D/g, "").slice(0, 4))} type="password" />
          <LoadingButton className="primary-button" loading={busyAction === "password"} onClick={changePassword}>
            Save PIN
          </LoadingButton>
        </div>
      </Panel>
      </SecuritySettingsPage>
      </SettingsTabPage>

      <SettingsTabPage tab="data" activeTab={settingsTab}>
      <DataSettingsPage>
      <Panel className="settings-card" title="Receipt Storage" icon={<Database size={18} />}>
        <div className="grid gap-3">
          <div className="settings-profile">
            <div className="row">
              <span>Used</span>
              <strong>{storageUsage ? `${(storageUsage.usedBytes / 1024 / 1024).toFixed(2)} MB` : "Not checked"}</strong>
            </div>
            <div className="row">
              <span>Limit</span>
              <strong>{storageUsage ? `${(storageUsage.limitBytes / 1024 / 1024).toFixed(0)} MB` : "Cloud profile required"}</strong>
            </div>
            <div className="row">
              <span>Files</span>
              <strong>{storageUsage?.fileCount ?? "-"}</strong>
            </div>
          </div>
          <LoadingButton className="secondary-button" loading={busyAction === "sync"} onClick={refreshStorageUsage}>
            <RefreshCw size={18} /> Check Storage
          </LoadingButton>
          <div className="settings-action-grid">
            <TextField label="From date" value={storageFrom} onChange={setStorageFrom} type="date" />
            <TextField label="To date" value={storageTo} onChange={setStorageTo} type="date" />
          </div>
          <LoadingButton className="secondary-button danger-button" loading={busyAction === "delete"} onClick={clearReceiptStorage}>
            <Trash2 size={18} /> Clear Receipt Storage
          </LoadingButton>
        </div>
      </Panel>

      <Panel className="settings-card" title="Import / Export" icon={<FileJson size={18} />}>
        <div className="settings-file-actions">
          <button className="settings-action-card" onClick={exportData}>
            <Download size={20} />
            <strong>Export backup</strong>
            <span>Save app data as JSON</span>
          </button>
          <label className="settings-action-card cursor-pointer">
            <Upload size={20} />
            <strong>Import backup</strong>
            <span>Restore exported app data</span>
            <input className="hidden" type="file" accept="application/json" onChange={(event) => importData(event.target.files?.[0])} />
          </label>
        </div>
      </Panel>
      </DataSettingsPage>
      </SettingsTabPage>

      <SettingsTabPage tab="about" activeTab={settingsTab}>
      <AboutSettingsPage>
      <Panel className="settings-card" title="App Version" icon={<Info size={18} />}>
        <div className="settings-profile">
          <div className="row">
            <span>Version</span>
            <strong>{buildInfo.version}</strong>
          </div>
          <div className="row">
            <span>Build</span>
            <strong>{buildInfo.build}</strong>
          </div>
          <div className="row">
            <span>Channel</span>
            <strong>{buildInfo.channel}</strong>
          </div>
        </div>
      </Panel>
      <div className="app-credit">Made with <span aria-label="heart">❤️</span> by SURIYAKANTH</div>
      </AboutSettingsPage>
      </SettingsTabPage>
      {logoutConfirm ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="confirm-dialog">
            <div>
              <strong>Logout</strong>
              <p>Your local data stays on this device. Login again to continue with this profile.</p>
            </div>
            <div className="confirm-actions">
              <button className="secondary-button" onClick={() => setLogoutConfirm(false)}>Cancel</button>
              <button className="primary-button danger-action" onClick={onLogout}>
                Logout
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {deleteConfirm ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="confirm-dialog">
            <div>
              <strong>Delete Account</strong>
              <p>
                This will delete this account from the server when connected, clear this profile data from this device, and logout.
                Before deleting a connected account, Micham emails your full data export to the account email.
              </p>
            </div>
            <div className="confirm-actions">
              <button className="secondary-button" onClick={() => setDeleteConfirm(false)}>Cancel</button>
              <LoadingButton className="primary-button danger-action" loading={busyAction === "delete"} onClick={deleteAccount}>
                {snapshot.profile?.connectedUserId ? "Email Export & Delete" : "Delete Local Data"}
              </LoadingButton>
            </div>
          </div>
        </div>
      ) : null}
      {pendingImport ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="confirm-modal">
            <strong>Import Data</strong>
            <p>
              Import {pendingImport.payload.transactions.length} transactions and {pendingImport.payload.accounts.length} accounts.
              {pendingImport.duplicateIds ? ` ${pendingImport.duplicateIds} duplicate transactions will be merged.` : " Existing data will be kept."}
              {pendingImport.payload.profile ? " The exported profile will also be restored." : ""}
            </p>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setPendingImport(null)}>Cancel</button>
              <button className="primary-button" onClick={() => void confirmImportData()}>Import</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AdminView({
  snapshot,
  notify,
  onLogout,
  onDone,
}: {
  snapshot: Snapshot;
  notify: (message: string, tone?: Toast["tone"]) => void;
  onLogout: () => void;
  onDone: () => Promise<void>;
}) {
  const [form, setForm] = useState(snapshot.config);
  const [logoProcessing, setLogoProcessing] = useState(false);
  const [admin, setAdmin] = useState<AdminAccount | null>(null);
  const [adminMode, setAdminMode] = useState<"login" | "setup">("login");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminName, setAdminName] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [catalog, setCatalog] = useState<AdminCatalog | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [adminError, setAdminError] = useState("");
  const [planForm, setPlanForm] = useState({ code: "", name: "", description: "", status: "ACTIVE", isDefault: false, sortOrder: "100" });
  const [featureForm, setFeatureForm] = useState({ featureKey: "", name: "", description: "", status: "ACTIVE", planCode: "FREE", enabled: true });
  const [settingForm, setSettingForm] = useState({ settingKey: "", value: "true", description: "", isPublic: true });
  const [announcementForm, setAnnouncementForm] = useState({ title: "", body: "", status: "DRAFT", target: "ALL", targetValue: "", startsAt: "", endsAt: "" });
  const [adForm, setAdForm] = useState({ placementKey: "", name: "", description: "", enabled: false, provider: "INTERNAL", configStatus: "INACTIVE", config: "{}" });

  useEffect(() => setForm(snapshot.config), [snapshot.config]);

  const loadAdminConsole = async () => {
    setBusy("load-admin");
    setAdminError("");
    try {
      const [{ admin: currentAdmin }, dashboardResult, catalogResult, userResult] = await Promise.all([
        getAdminMe(),
        getAdminDashboard(),
        getAdminCatalog(),
        listAdminUsers({ q: userSearch, pageSize: 20 }),
      ]);
      setAdmin(currentAdmin);
      setDashboard(dashboardResult);
      setCatalog(catalogResult);
      setUsers(userResult.users);
    } catch (error) {
      setAdmin(null);
      setAdminError(error instanceof Error ? error.message : "Admin console could not be loaded.");
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    if (getAdminToken()) void loadAdminConsole();
  }, []);

  const serverAdminLogin = async () => {
    setBusy("admin-login");
    setAdminError("");
    try {
      const result = await loginAdminAccount(adminEmail.trim().toLowerCase(), adminPassword);
      setAdmin(result.admin);
      setAdminPassword("");
      notify("Admin session started.", "success");
      await loadAdminConsole();
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Admin login failed.");
      notify(error instanceof Error ? error.message : "Admin login failed.", "error");
    } finally {
      setBusy("");
    }
  };

  const setupServerAdmin = async () => {
    setBusy("admin-setup");
    setAdminError("");
    try {
      await bootstrapAdmin(setupToken.trim(), adminEmail.trim().toLowerCase(), adminPassword, adminName || adminEmail.split("@")[0]);
      setSetupToken("");
      setAdminPassword("");
      setAdminMode("login");
      notify("Admin created. Login with the admin email.", "success");
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Admin setup failed.");
      notify(error instanceof Error ? error.message : "Admin setup failed.", "error");
    } finally {
      setBusy("");
    }
  };

  const refreshUsers = async () => {
    setBusy("users");
    try {
      const result = await listAdminUsers({ q: userSearch, pageSize: 20 });
      setUsers(result.users);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Users could not be loaded.", "error");
    } finally {
      setBusy("");
    }
  };

  const parseJsonValue = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  };

  const parseObjectValue = (value: string) => {
    const parsed = parseJsonValue(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  };

  const reloadCatalog = async () => {
    setBusy("catalog");
    try {
      setCatalog(await getAdminCatalog());
    } catch (error) {
      notify(error instanceof Error ? error.message : "Catalog could not be loaded.", "error");
    } finally {
      setBusy("");
    }
  };

  const submitPlan = async () => {
    setBusy("plan");
    try {
      await saveAdminPlan({
        code: planForm.code,
        name: planForm.name,
        description: planForm.description,
        status: planForm.status,
        isDefault: planForm.isDefault,
        sortOrder: Number(planForm.sortOrder) || 100,
      });
      setPlanForm({ code: "", name: "", description: "", status: "ACTIVE", isDefault: false, sortOrder: "100" });
      notify("Plan saved.", "success");
      await loadAdminConsole();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Plan could not be saved.", "error");
    } finally {
      setBusy("");
    }
  };

  const submitFeature = async () => {
    setBusy("feature");
    try {
      await saveAdminFeature({
        featureKey: featureForm.featureKey,
        name: featureForm.name,
        description: featureForm.description,
        status: featureForm.status,
      });
      if (featureForm.planCode) await setAdminPlanFeature(featureForm.planCode, featureForm.featureKey, featureForm.enabled);
      setFeatureForm({ featureKey: "", name: "", description: "", status: "ACTIVE", planCode: "FREE", enabled: true });
      notify("Feature saved.", "success");
      await loadAdminConsole();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Feature could not be saved.", "error");
    } finally {
      setBusy("");
    }
  };

  const submitSetting = async () => {
    setBusy("setting");
    try {
      await saveAdminSetting(settingForm.settingKey, parseJsonValue(settingForm.value), settingForm.isPublic, settingForm.description);
      setSettingForm({ settingKey: "", value: "true", description: "", isPublic: true });
      notify("Setting saved.", "success");
      await loadAdminConsole();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Setting could not be saved.", "error");
    } finally {
      setBusy("");
    }
  };

  const submitAnnouncement = async () => {
    setBusy("announcement");
    try {
      await saveAdminAnnouncement({
        title: announcementForm.title,
        body: announcementForm.body,
        status: announcementForm.status,
        target: announcementForm.target,
        targetValue: announcementForm.targetValue,
        startsAt: announcementForm.startsAt,
        endsAt: announcementForm.endsAt,
      });
      setAnnouncementForm({ title: "", body: "", status: "DRAFT", target: "ALL", targetValue: "", startsAt: "", endsAt: "" });
      notify("Announcement saved.", "success");
      await loadAdminConsole();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Announcement could not be saved.", "error");
    } finally {
      setBusy("");
    }
  };

  const submitAd = async () => {
    setBusy("ad");
    try {
      await saveAdminAd({
        placementKey: adForm.placementKey,
        name: adForm.name,
        description: adForm.description,
        enabled: adForm.enabled,
        provider: adForm.provider,
        configStatus: adForm.configStatus,
        config: parseObjectValue(adForm.config),
      });
      setAdForm({ placementKey: "", name: "", description: "", enabled: false, provider: "INTERNAL", configStatus: "INACTIVE", config: "{}" });
      notify("Ad placement saved.", "success");
      await loadAdminConsole();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Ad placement could not be saved.", "error");
    } finally {
      setBusy("");
    }
  };

  const save = async () => {
    await db.appConfig.put({ ...form, id: "primary", updatedAt: nowIso() });
    await onDone();
  };

  const uploadLogo = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("Upload an image file.", "error");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      notify("Logo image is too large. Maximum size is 1 MB.", "error");
      return;
    }
    setLogoProcessing(true);
    try {
      const dataUrl = await compressImageFile(file, {
        maxSide: LOGO_IMAGE_MAX_SIDE,
        quality: 0.82,
        maxBytes: MAX_LOGO_BYTES,
      });
      setForm((current) => ({ ...current, logoImage: dataUrl }));
      notify("Logo image optimized.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Logo image could not be processed.", "error");
    } finally {
      setLogoProcessing(false);
    }
  };

  return (
    <div className="admin-console">
      {!admin ? (
        <Panel title="Server Admin">
          <div className="grid gap-4">
            <div className="segmented-control">
              <button className={adminMode === "login" ? "segment-active" : ""} onClick={() => setAdminMode("login")}>Login</button>
              <button className={adminMode === "setup" ? "segment-active" : ""} onClick={() => setAdminMode("setup")}>First setup</button>
            </div>
            {adminError ? <div className="form-error">{adminError}</div> : null}
            <TextField label="Admin login" value={adminEmail} onChange={setAdminEmail} placeholder="Admin@sk" />
            <TextField label="Admin password" value={adminPassword} onChange={setAdminPassword} type="password" />
            {adminMode === "setup" ? (
              <>
                <TextField label="Display name" value={adminName} onChange={setAdminName} placeholder="Owner" />
                <TextField label="Setup token" value={setupToken} onChange={setSetupToken} type="password" />
                <LoadingButton className="primary-button" loading={busy === "admin-setup"} onClick={setupServerAdmin}>
                  Create Server Admin
                </LoadingButton>
              </>
            ) : (
              <LoadingButton className="primary-button" loading={busy === "admin-login"} onClick={serverAdminLogin}>
                Login to Server Admin
              </LoadingButton>
            )}
            <button className="secondary-button" onClick={onLogout}>
              <LogOut size={18} /> Exit Admin
            </button>
          </div>
        </Panel>
      ) : (
        <>
          <Panel title="Admin Dashboard" icon={<BarChart3 size={18} />}>
            <div className="admin-head">
              <div>
                <strong>{admin.display_name}</strong>
                <p>{admin.email} · {admin.role}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <LoadingButton className="secondary-button" loading={busy === "load-admin"} onClick={loadAdminConsole}>
                  <RefreshCw size={18} /> Refresh
                </LoadingButton>
                <button
                  className="secondary-button"
                  onClick={async () => {
                    await logoutAdminAccount();
                    clearAdminToken();
                    setAdmin(null);
                    notify("Admin logged out.", "success");
                  }}
                >
                  <LogOut size={18} /> Logout
                </button>
              </div>
            </div>
            <div className="admin-stat-grid">
              {Object.entries(dashboard?.stats || {}).map(([key, value]) => (
                <div className="admin-stat" key={key}>
                  <span>{key.replace(/([A-Z])/g, " $1").trim()}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Users" icon={<Users size={18} />}>
            <div className="admin-users-toolbar">
              <input className="field-input" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Search user, email, or connection code" />
              <LoadingButton className="secondary-button" loading={busy === "users"} onClick={refreshUsers}>
                Search
              </LoadingButton>
            </div>
            <div className="admin-user-list">
              {users.map((user) => (
                <div className="admin-user-row" key={user.id}>
                  <div>
                    <strong>{user.display_name}</strong>
                    <p>
                      {user.email} · {user.status} · {user.connection_code}
                      {user.receipt_storage_limit_bytes ? ` · receipts ${(user.receipt_storage_limit_bytes / 1024 / 1024).toFixed(0)} MB` : ""}
                    </p>
                  </div>
                  <div className="admin-user-actions">
                    <button
                      className="small-button"
                      onClick={async () => {
                        const nextStatus = user.status === "active" ? "SUSPENDED" : "ACTIVE";
                        await setAdminUserStatus(user.id, nextStatus, "Admin console change");
                        await refreshUsers();
                      }}
                    >
                      {user.status === "active" ? "Suspend" : "Activate"}
                    </button>
                    <button
                      className="small-button"
                      onClick={async () => {
                        await revokeAdminUserSessions(user.id);
                        notify("User sessions revoked.", "success");
                      }}
                    >
                      Revoke
                    </button>
                    <button
                      className="small-button"
                      onClick={async () => {
                        await assignAdminUserPlan(user.id, "FREE");
                        notify("Free plan assigned.", "success");
                      }}
                    >
                      Free
                    </button>
                    {[25, 100].map((limitMb) => (
                      <button
                        className="small-button"
                        key={limitMb}
                        onClick={async () => {
                          await setAdminUserReceiptLimit(user.id, limitMb);
                          notify(`Receipt limit set to ${limitMb} MB.`, "success");
                          await refreshUsers();
                        }}
                      >
                        {limitMb} MB
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {users.length === 0 ? <Empty text="No users found." /> : null}
            </div>
          </Panel>

          <Panel title="Plans and Controls" icon={<SlidersHorizontal size={18} />}>
            <div className="admin-management-grid">
              <div className="admin-manager-card">
                <h3>Plan</h3>
                <TextField label="Code" value={planForm.code} onChange={(value) => setPlanForm({ ...planForm, code: value.toUpperCase() })} placeholder="FREE" />
                <TextField label="Name" value={planForm.name} onChange={(value) => setPlanForm({ ...planForm, name: value })} placeholder="Free" />
                <TextField label="Description" value={planForm.description} onChange={(value) => setPlanForm({ ...planForm, description: value })} />
                <div className="admin-inline-grid">
                  <SelectField label="Status" value={planForm.status} onChange={(value) => setPlanForm({ ...planForm, status: value })}>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="ARCHIVED">Archived</option>
                  </SelectField>
                  <TextField label="Sort" value={planForm.sortOrder} onChange={(value) => setPlanForm({ ...planForm, sortOrder: value })} type="number" />
                </div>
                <label className="admin-check-row">
                  <input type="checkbox" checked={planForm.isDefault} onChange={(event) => setPlanForm({ ...planForm, isDefault: event.target.checked })} />
                  Default active plan
                </label>
                <LoadingButton className="primary-button" loading={busy === "plan"} onClick={submitPlan} disabled={!planForm.code || !planForm.name}>
                  Save Plan
                </LoadingButton>
              </div>

              <div className="admin-manager-card">
                <h3>Feature</h3>
                <TextField label="Feature key" value={featureForm.featureKey} onChange={(value) => setFeatureForm({ ...featureForm, featureKey: value.toUpperCase() })} placeholder="CLOUD_SYNC" />
                <TextField label="Name" value={featureForm.name} onChange={(value) => setFeatureForm({ ...featureForm, name: value })} />
                <TextField label="Description" value={featureForm.description} onChange={(value) => setFeatureForm({ ...featureForm, description: value })} />
                <div className="admin-inline-grid">
                  <SelectField label="Status" value={featureForm.status} onChange={(value) => setFeatureForm({ ...featureForm, status: value })}>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </SelectField>
                  <TextField label="Plan code" value={featureForm.planCode} onChange={(value) => setFeatureForm({ ...featureForm, planCode: value.toUpperCase() })} />
                </div>
                <label className="admin-check-row">
                  <input type="checkbox" checked={featureForm.enabled} onChange={(event) => setFeatureForm({ ...featureForm, enabled: event.target.checked })} />
                  Enabled on plan
                </label>
                <LoadingButton className="primary-button" loading={busy === "feature"} onClick={submitFeature} disabled={!featureForm.featureKey || !featureForm.name}>
                  Save Feature
                </LoadingButton>
              </div>

              <div className="admin-manager-card">
                <h3>Runtime Setting</h3>
                <TextField label="Setting key" value={settingForm.settingKey} onChange={(value) => setSettingForm({ ...settingForm, settingKey: value })} placeholder="maintenance_mode" />
                <TextField label="JSON value" value={settingForm.value} onChange={(value) => setSettingForm({ ...settingForm, value })} placeholder="true" />
                <TextField label="Description" value={settingForm.description} onChange={(value) => setSettingForm({ ...settingForm, description: value })} />
                <label className="admin-check-row">
                  <input type="checkbox" checked={settingForm.isPublic} onChange={(event) => setSettingForm({ ...settingForm, isPublic: event.target.checked })} />
                  Public runtime setting
                </label>
                <LoadingButton className="primary-button" loading={busy === "setting"} onClick={submitSetting} disabled={!settingForm.settingKey}>
                  Save Setting
                </LoadingButton>
              </div>
            </div>

            <div className="admin-catalog-grid">
              <div>
                <h3>Current plans</h3>
                {(catalog?.plans || []).map((plan) => (
                  <button className="runtime-setting-row" key={String(plan.id)} onClick={() => setPlanForm({
                    code: String(plan.code || ""),
                    name: String(plan.name || ""),
                    description: String(plan.description || ""),
                    status: String(plan.status || "ACTIVE"),
                    isDefault: plan.is_default === true,
                    sortOrder: String(plan.sort_order || 100),
                  })}>
                    <span>{String(plan.code)}</span>
                    <strong>{String(plan.status)}</strong>
                  </button>
                ))}
              </div>
              <div>
                <h3>Current features</h3>
                {(catalog?.features || []).slice(0, 10).map((feature) => (
                  <button className="runtime-setting-row" key={String(feature.feature_key)} onClick={() => setFeatureForm({
                    featureKey: String(feature.feature_key || ""),
                    name: String(feature.name || ""),
                    description: String(feature.description || ""),
                    status: String(feature.status || "ACTIVE"),
                    planCode: "FREE",
                    enabled: true,
                  })}>
                    <span>{String(feature.feature_key)}</span>
                    <strong>{String(feature.status)}</strong>
                  </button>
                ))}
              </div>
              <div>
                <h3>Runtime toggles</h3>
                {(catalog?.settings || []).map((setting) => (
                  <button
                    className="runtime-setting-row"
                    key={String(setting.setting_key)}
                    onClick={async () => {
                      const nextValue = setting.value === true ? false : setting.value === false ? true : setting.value;
                      await saveAdminSetting(String(setting.setting_key), nextValue, setting.is_public === true, String(setting.description || ""));
                      notify("Runtime setting saved.", "success");
                      await loadAdminConsole();
                    }}
                  >
                    <span>{String(setting.setting_key)}</span>
                    <strong>{JSON.stringify(setting.value)}</strong>
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          <Panel title="Announcements and Ads" icon={<Upload size={18} />}>
            <div className="admin-management-grid">
              <div className="admin-manager-card">
                <h3>Announcement</h3>
                <TextField label="Title" value={announcementForm.title} onChange={(value) => setAnnouncementForm({ ...announcementForm, title: value })} />
                <label className="grid gap-1">
                  <span className="field-label">Body</span>
                  <textarea className="field-input admin-textarea" value={announcementForm.body} onChange={(event) => setAnnouncementForm({ ...announcementForm, body: event.target.value })} />
                </label>
                <div className="admin-inline-grid">
                  <SelectField label="Status" value={announcementForm.status} onChange={(value) => setAnnouncementForm({ ...announcementForm, status: value })}>
                    <option value="DRAFT">Draft</option>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="ACTIVE">Active</option>
                    <option value="ARCHIVED">Archived</option>
                  </SelectField>
                  <SelectField label="Target" value={announcementForm.target} onChange={(value) => setAnnouncementForm({ ...announcementForm, target: value })}>
                    <option value="ALL">All</option>
                    <option value="PLAN">Plan</option>
                    <option value="USER">User</option>
                  </SelectField>
                </div>
                <TextField label="Target value" value={announcementForm.targetValue} onChange={(value) => setAnnouncementForm({ ...announcementForm, targetValue: value })} placeholder="Optional" />
                <div className="admin-inline-grid">
                  <TextField label="Starts at" value={announcementForm.startsAt} onChange={(value) => setAnnouncementForm({ ...announcementForm, startsAt: value })} type="datetime-local" />
                  <TextField label="Ends at" value={announcementForm.endsAt} onChange={(value) => setAnnouncementForm({ ...announcementForm, endsAt: value })} type="datetime-local" />
                </div>
                <LoadingButton className="primary-button" loading={busy === "announcement"} onClick={submitAnnouncement} disabled={!announcementForm.title || !announcementForm.body}>
                  Save Announcement
                </LoadingButton>
              </div>

              <div className="admin-manager-card">
                <h3>Ad Placement</h3>
                <TextField label="Placement key" value={adForm.placementKey} onChange={(value) => setAdForm({ ...adForm, placementKey: value.toUpperCase() })} placeholder="HOME_BANNER" />
                <TextField label="Name" value={adForm.name} onChange={(value) => setAdForm({ ...adForm, name: value })} />
                <TextField label="Description" value={adForm.description} onChange={(value) => setAdForm({ ...adForm, description: value })} />
                <div className="admin-inline-grid">
                  <TextField label="Provider" value={adForm.provider} onChange={(value) => setAdForm({ ...adForm, provider: value.toUpperCase() })} />
                  <SelectField label="Config status" value={adForm.configStatus} onChange={(value) => setAdForm({ ...adForm, configStatus: value })}>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </SelectField>
                </div>
                <label className="grid gap-1">
                  <span className="field-label">Config JSON</span>
                  <textarea className="field-input admin-textarea" value={adForm.config} onChange={(event) => setAdForm({ ...adForm, config: event.target.value })} />
                </label>
                <label className="admin-check-row">
                  <input type="checkbox" checked={adForm.enabled} onChange={(event) => setAdForm({ ...adForm, enabled: event.target.checked })} />
                  Placement enabled
                </label>
                <LoadingButton className="primary-button" loading={busy === "ad"} onClick={submitAd} disabled={!adForm.placementKey}>
                  Save Ad Placement
                </LoadingButton>
              </div>
            </div>

            <div className="admin-catalog-grid">
              <div>
                <h3>Announcements</h3>
                {(catalog?.announcements || []).slice(0, 8).map((announcement) => (
                  <p key={String(announcement.id)}><strong>{String(announcement.title)}</strong> · {String(announcement.status)} · {String(announcement.target)}</p>
                ))}
              </div>
              <div>
                <h3>Ad placements</h3>
                {(catalog?.adPlacements || []).map((placement) => (
                  <button className="runtime-setting-row" key={String(placement.placement_key)} onClick={() => setAdForm({
                    placementKey: String(placement.placement_key || ""),
                    name: String(placement.name || ""),
                    description: String(placement.description || ""),
                    enabled: placement.enabled === true,
                    provider: "INTERNAL",
                    configStatus: "INACTIVE",
                    config: "{}",
                  })}>
                    <span>{String(placement.placement_key)}</span>
                    <strong>{placement.enabled ? "on" : "off"}</strong>
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          <Panel title="Audit Log" icon={<Download size={18} />}>
            <div className="admin-user-list">
              {(dashboard?.recentAudit || []).map((entry) => (
                <div className="admin-user-row" key={entry.id}>
                  <div>
                    <strong>{entry.action}</strong>
                    <p>{entry.target_type || "system"} · {entry.target_id || "none"} · {formatDate(entry.created_at)}</p>
                  </div>
                  <code className="admin-audit-code">{JSON.stringify(entry.metadata || {})}</code>
                </div>
              ))}
              {(dashboard?.recentAudit || []).length === 0 ? <Empty text="No audit records yet." /> : null}
            </div>
          </Panel>
        </>
      )}

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
                <Upload size={18} /> {logoProcessing ? "Optimizing" : "Upload Image"}
                <input
                  className="hidden"
                  type="file"
                  accept="image/*"
                  disabled={logoProcessing}
                  onChange={(event) => {
                    void uploadLogo(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
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
    </div>
  );
}

function AiChatView({
  snapshot,
  currency,
  notify,
  onBack,
}: {
  snapshot: Snapshot;
  currency: string;
  notify: (message: string, tone?: Toast["tone"]) => void;
  onNavigate: (view: View) => void;
  onBack: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [imageContext, setImageContext] = useState("");

  useEffect(() => {
    let cancelled = false;
    void db.chatMessages
      .where("ownerProfileId")
      .equals(snapshot.profile?.id ?? "")
      .sortBy("createdAt")
      .then((items) => {
        if (!cancelled) setMessages(items);
      });
    return () => {
      cancelled = true;
    };
  }, [snapshot.profile?.id]);

  const addChatMessage = async (role: "user" | "assistant", content: string) => {
    const timestamp = nowIso();
    const message: ChatMessageRecord = {
      id: createId(),
      ownerProfileId: snapshot.profile?.id,
      role,
      content,
      createdAt: timestamp,
      updatedAt: timestamp,
      syncState: "local",
    };
    await db.chatMessages.put(message);
    setMessages((items) => [...items, message]);
  };

  const clearChat = async () => {
    if (!snapshot.profile?.id) return;
    const keys = await db.chatMessages.where("ownerProfileId").equals(snapshot.profile.id).primaryKeys();
    await db.chatMessages.bulkDelete(keys);
    setMessages([]);
    notify("Chat cleared.", "success");
  };

  const ask = async () => {
    if (!question.trim()) return;
    if (messages.length + 2 > AI_CHAT_MESSAGE_LIMIT) {
      notify("Chat limit reached. Clear the chat to ask more.", "warning");
      return;
    }
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
    await addChatMessage("user", userMessage);
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
      await addChatMessage("assistant", data.choices?.[0]?.message?.content ?? "No answer returned.");
    } catch (error) {
      await addChatMessage("assistant", error instanceof Error ? error.message : "AI request failed.");
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
    <div className="ai-page">
      <div className="ai-page-header">
        <button className="icon-button" onClick={onBack} title="Back">
          <ArrowLeft size={18} />
        </button>
        <Logo config={snapshot.config} />
        <div className="min-w-0 flex-1">
          <h2>Micham assistant</h2>
          <p>Ask about your money</p>
        </div>
        <button className="icon-button" onClick={() => void clearChat()} disabled={messages.length === 0 || loading} title="Clear chat">
          <Trash2 size={17} />
        </button>
      </div>
      <div className="ai-chat-shell">
        <div className="ai-message-list">
          {messages.length === 0 ? (
            <div className="ai-empty-state">
              <Bot size={24} />
              <strong>Your money, explained</strong>
              <p>Ask about spending, savings, or shared expenses.</p>
              <button type="button" onClick={() => setQuestion("How much can I safely save this month?")}>How much can I safely save this month?</button>
              <button type="button" onClick={() => setQuestion("Where is most of my money sitting?")}>Where is most of my money sitting?</button>
              <button type="button" onClick={() => setQuestion("How should I settle up with my friends?")}>How should I settle up with my friends?</button>
            </div>
          ) : null}
          {messages.map((message) => (
            <div className={`chat-message ${message.role === "user" ? "chat-message-user" : ""}`} key={message.id}>
              {message.content}
            </div>
          ))}
        </div>
        <div className="ai-composer">
          <input
            className="field-input"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") ask();
            }}
            placeholder="Ask about your money..."
          />
          <label className="icon-button cursor-pointer">
            <Image size={18} />
            <input className="hidden" type="file" accept="image/*" onChange={(event) => attachImage(event.target.files?.[0])} />
          </label>
          <button className="ai-send-button" onClick={() => void ask()} disabled={loading || !question.trim() || messages.length + 2 > AI_CHAT_MESSAGE_LIMIT} title="Ask">
            {loading ? <span className="button-spinner" /> : <ArrowDownLeft size={18} />}
          </button>
        </div>
        <p className="ai-limit-note">{messages.length}/{AI_CHAT_MESSAGE_LIMIT} messages. Clear chat to continue after the limit.</p>
        {imageContext ? <p className="ai-limit-note">{imageContext}</p> : null}
      </div>
    </div>
  );
}

function TransactionList({
  snapshot,
  currency,
  transactions,
  notify,
  onDone,
}: {
  snapshot: Snapshot;
  currency: string;
  transactions: Transaction[];
  notify: (message: string, tone?: Toast["tone"]) => void;
  onDone: () => Promise<void>;
}) {
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const pressTimers = React.useRef<Record<string, number>>({});

  const clearLongPress = (transactionId: string) => {
    const timer = pressTimers.current[transactionId];
    if (timer) window.clearTimeout(timer);
    delete pressTimers.current[transactionId];
  };

  if (transactions.length === 0) return <Empty text="No transactions yet." />;
  return (
    <>
      <div className="transaction-list">
        {transactions.map((transaction) => {
          const account = snapshot.accounts.find((item) => item.id === transaction.accountId);
          const toAccount = snapshot.accounts.find((item) => item.id === transaction.toAccountId);
          const category = snapshot.categories.find((item) => item.id === transaction.categoryId);
          const amountPrefix = transaction.type === "income" ? "+" : transaction.type === "expense" ? "-" : "";
          return (
            <div
              className={`transaction-row transaction-${transaction.type}`}
              key={transaction.id}
              onClick={() => setSelectedTransaction(transaction)}
              onDoubleClick={() => setSelectedTransaction(transaction)}
              onPointerCancel={() => clearLongPress(transaction.id)}
              onPointerDown={() => {
                clearLongPress(transaction.id);
                pressTimers.current[transaction.id] = window.setTimeout(() => setSelectedTransaction(transaction), 520);
              }}
              onPointerLeave={() => clearLongPress(transaction.id)}
              onPointerUp={() => clearLongPress(transaction.id)}
              role="button"
              tabIndex={0}
              title="Long press to view details"
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedTransaction(transaction);
                }
              }}
            >
              <div className="transaction-icon">
                {transaction.type === "transfer" ? <ArrowRightLeft size={16} /> : transaction.type === "income" ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
              </div>
              <div className="transaction-copy">
                <p>{transaction.note || category?.name || transaction.type}</p>
                <span>
                  {transaction.type === "transfer" ? `${account?.name} to ${toAccount?.name}` : `${account?.name ?? ""} ${category?.name ? `- ${category.name}` : ""}`} · {formatDate(transaction.date)}
                </span>
                {transaction.edited && transaction.previousVersion ? (
                  <p className="transaction-edit-note">
                    Edited · before {formatMoney(transaction.previousVersion.amount, currency)} on {formatDate(transaction.previousVersion.date)}
                  </p>
                ) : transaction.edited ? (
                  <p className="transaction-edit-note">Edited</p>
                ) : null}
                {transaction.receiptName ? (
                  <button
                    className="receipt-link"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedTransaction(transaction);
                    }}
                  >
                    <Image size={14} /> {transaction.receiptName}
                  </button>
                ) : null}
              </div>
              <strong className="transaction-amount">
                {amountPrefix}{formatMoney(transaction.amount, currency)}
              </strong>
            </div>
          );
        })}
      </div>
      {selectedTransaction ? (
        <TransactionDetailsModal
          snapshot={snapshot}
          currency={currency}
          transaction={selectedTransaction}
          notify={notify}
          onDone={onDone}
          onClose={() => setSelectedTransaction(null)}
        />
      ) : null}
    </>
  );
}

function TransactionDetailsModal({
  snapshot,
  currency,
  transaction,
  notify,
  onDone,
  onClose,
}: {
  snapshot: Snapshot;
  currency: string;
  transaction: Transaction;
  notify: (message: string, tone?: Toast["tone"]) => void;
  onDone: () => Promise<void>;
  onClose: () => void;
}) {
  const account = snapshot.accounts.find((item) => item.id === transaction.accountId);
  const toAccount = snapshot.accounts.find((item) => item.id === transaction.toAccountId);
  const category = snapshot.categories.find((item) => item.id === transaction.categoryId);
  const typeLabel = transaction.type[0].toUpperCase() + transaction.type.slice(1);
  const activeAccounts = snapshot.accounts.filter((item) => item.active);
  const activePeople = snapshot.people.filter((item) => item.active && (item.status === "local" || item.status === "connected"));
  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState(String(transaction.amount || ""));
  const [editDate, setEditDate] = useState(transaction.date.slice(0, 10));
  const [editAccountId, setEditAccountId] = useState(transaction.accountId ?? activeAccounts[0]?.id ?? "");
  const [editToAccountId, setEditToAccountId] = useState(transaction.toAccountId ?? activeAccounts[1]?.id ?? activeAccounts[0]?.id ?? "");
  const [editCategoryId, setEditCategoryId] = useState(transaction.categoryId ?? "");
  const [editNote, setEditNote] = useState(transaction.note ?? "");
  const [editPersonIds, setEditPersonIds] = useState<string[]>(transaction.personIds ?? []);
  const [editBusy, setEditBusy] = useState(false);

  const saveEdit = async () => {
    if (editBusy) return;
    const numericAmount = Number(editAmount) || 0;
    if (!numericAmount) {
      notify("Enter a valid amount.", "error");
      return;
    }
    if (!editAccountId) {
      notify("Choose an account.", "error");
      return;
    }
    if (transaction.type === "transfer" && editAccountId === editToAccountId) {
      notify("Choose two different accounts for a transfer.", "error");
      return;
    }
    const timestamp = nowIso();
    const editedDate = `${editDate}T${transaction.date.slice(11, 19) || new Date().toTimeString().slice(0, 8)}`;
    const existingSplitSettlements = snapshot.settlements.filter((settlement) => settlement.transactionId === transaction.id && !settlement.deletedAt);
    const removedActiveSettlements = existingSplitSettlements.filter(
      (settlement) => !editPersonIds.includes(settlement.personId) && settlement.repaidAmount > 0,
    );
    if (removedActiveSettlements.length) {
      notify("A split person with returned money cannot be removed. Settle or edit the open balance first.", "warning");
      return;
    }
    const splitShare = transaction.type === "expense" && editPersonIds.length ? Number((numericAmount / (editPersonIds.length + 1)).toFixed(2)) : 0;
    setEditBusy(true);
    try {
      await db.transaction("rw", db.transactions, db.settlements, async () => {
        await db.transactions.update(transaction.id, {
          amount: numericAmount,
          accountId: editAccountId,
          toAccountId: transaction.type === "transfer" ? editToAccountId : undefined,
          categoryId: transaction.type === "transfer" ? undefined : editCategoryId || undefined,
          date: editedDate,
          note: editNote,
          personIds: editPersonIds.length ? editPersonIds : undefined,
          edited: true,
          editCount: (transaction.editCount ?? 0) + 1,
          lastEditedAt: timestamp,
          previousVersion: {
            type: transaction.type,
            amount: transaction.amount,
            accountId: transaction.accountId,
            toAccountId: transaction.toAccountId,
            categoryId: transaction.categoryId,
            date: transaction.date,
            note: transaction.note,
            editedAt: timestamp,
          },
          updatedAt: timestamp,
          syncState: snapshot.config.syncEnabled ? "queued" : "local",
        });
        if (transaction.type === "expense") {
          for (const settlement of existingSplitSettlements) {
            if (!editPersonIds.includes(settlement.personId)) {
              await db.settlements.update(settlement.id, {
                deletedAt: timestamp,
                updatedAt: timestamp,
                syncState: snapshot.config.syncEnabled ? "queued" : "local",
              });
              continue;
            }
            await db.settlements.update(settlement.id, {
              originalAmount: splitShare,
              accountId: editAccountId,
              categoryId: editCategoryId || undefined,
              date: editedDate,
              note: editNote || settlement.note || "Split expense",
              updatedAt: timestamp,
              syncState: snapshot.config.syncEnabled ? "queued" : "local",
            });
          }
          const existingPersonIds = new Set(existingSplitSettlements.map((settlement) => settlement.personId));
          const newSettlements = editPersonIds
            .filter((personId) => !existingPersonIds.has(personId))
            .map((personId) => ({
              id: createId(),
              ownerProfileId: snapshot.profile?.id,
              personId,
              direction: "to_me" as const,
              originalAmount: splitShare,
              repaidAmount: 0,
              accountId: editAccountId,
              categoryId: editCategoryId || undefined,
              transactionId: transaction.id,
              receiptName: transaction.receiptName,
              receiptData: transaction.receiptData,
              date: editedDate,
              note: editNote || "Split expense",
              createdAt: timestamp,
              updatedAt: timestamp,
              syncState: snapshot.config.syncEnabled ? "queued" as const : "local" as const,
            }));
          if (newSettlements.length) await db.settlements.bulkPut(newSettlements);
        }
      });
      notify("Transaction updated.", "success");
      setEditing(false);
      await onDone();
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Transaction could not be updated.", "error");
    } finally {
      setEditBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="transaction-detail-modal">
        <div className="receipt-viewer-head">
          <div>
            <strong>{transaction.note || category?.name || typeLabel}</strong>
            <p>{typeLabel} · {formatDate(transaction.date)}</p>
          </div>
          <button className="icon-button" onClick={onClose} title="Close">
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {editing ? (
          <div className="transaction-edit-form">
            <input className="amount-input" type="number" value={editAmount} onChange={(event) => setEditAmount(event.target.value)} placeholder="Amount" />
            <input className="field-input" type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} />
            <SelectField label="Account" value={editAccountId} onChange={setEditAccountId}>
              {activeAccounts.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </SelectField>
            {transaction.type === "transfer" ? (
              <SelectField label="To account" value={editToAccountId} onChange={setEditToAccountId}>
                {activeAccounts.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </SelectField>
            ) : (
              <SelectField label="Category" value={editCategoryId} onChange={setEditCategoryId}>
                {snapshot.categories
                  .filter((item) => item.active && item.kind === transaction.type)
                  .map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
              </SelectField>
            )}
            <input className="field-input" value={editNote} onChange={(event) => setEditNote(event.target.value)} placeholder="Note" />
            {transaction.type === "expense" ? (
              <div className="person-chip-grid">
                {activePeople.length ? activePeople.map((person) => (
                  <button
                    className={`person-chip ${editPersonIds.includes(person.id) ? "person-chip-active" : ""}`}
                    key={person.id}
                    type="button"
                    onClick={() => setEditPersonIds((items) => (items.includes(person.id) ? items.filter((id) => id !== person.id) : [...items, person.id]))}
                  >
                    <Users size={15} />
                    {person.nickname || person.localDisplayName}
                  </button>
                )) : <Empty text="No people available for split edits." />}
              </div>
            ) : null}
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setEditing(false)}>Cancel</button>
              <LoadingButton className="primary-button" loading={editBusy} onClick={() => void saveEdit()}>Save Changes</LoadingButton>
            </div>
          </div>
        ) : (
          <>
        <div className="transaction-detail-summary">
          <span>{typeLabel}</span>
          <strong className={transaction.type === "income" ? "text-emerald-700" : transaction.type === "expense" ? "text-rose-700" : "text-slate-800"}>
            {formatMoney(transaction.amount, currency)}
          </strong>
        </div>
        <div className="transaction-detail-grid">
          <div>
            <span>Account</span>
            <strong>{account?.name ?? "Not available"}</strong>
          </div>
          {transaction.type === "transfer" ? (
            <div>
              <span>To account</span>
              <strong>{toAccount?.name ?? "Not available"}</strong>
            </div>
          ) : (
            <div>
              <span>Category</span>
              <strong>{category?.name ?? "Not selected"}</strong>
            </div>
          )}
          <div>
            <span>Date</span>
            <strong>{formatDate(transaction.date)}</strong>
          </div>
          <div>
            <span>Sync</span>
            <strong>{transaction.syncState ?? "local"}</strong>
          </div>
        </div>
        {transaction.note ? (
          <div className="transaction-detail-note">
            <span>Note</span>
            <p>{transaction.note}</p>
          </div>
        ) : null}
        {transaction.edited ? (
          <div className="transaction-detail-note">
            <span>Edit history</span>
            <p>
              Edited{transaction.previousVersion ? ` from ${formatMoney(transaction.previousVersion.amount, currency)} on ${formatDate(transaction.previousVersion.date)}` : ""}.
            </p>
          </div>
        ) : null}
        <div className="transaction-receipt-section">
          <h3><Image size={18} /> Receipt</h3>
          {transaction.receiptData ? (
            <div className="receipt-preview-row">
              <img src={transaction.receiptData} alt={transaction.receiptName || "Receipt"} />
              <button className="small-button" onClick={() => downloadDataUrl(transaction.receiptData || "", transaction.receiptName || "micham-receipt.jpg")}>
                <Download size={15} /> Download
              </button>
            </div>
          ) : transaction.receiptPath ? (
            <button className="secondary-button" type="button" onClick={() => void openReceipt(transaction, notify)}>
              <Image size={18} /> Open Receipt
            </button>
          ) : (
            <Empty text={transaction.receiptName ? "Receipt image data is not available for this older transaction." : "No receipt attached."} />
          )}
        </div>
        <div className="modal-actions">
          <button className="secondary-button" onClick={() => setEditing(true)}>Edit Transaction</button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}

function Panel({ title, icon, children, className = "" }: { title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`app-panel ${className}`}>
      <h2 className="panel-title">{icon}{title}</h2>
      {children}
    </section>
  );
}

function ListModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="list-modal">
        <div className="receipt-viewer-head">
          <strong>{title}</strong>
          <button className="small-button" onClick={onClose}>Close</button>
        </div>
        <div className="list-modal-body">{children}</div>
      </div>
    </div>
  );
}

function FriendCard({
  person,
  balance,
  currency,
  linked,
  busy,
  onOpen,
  onRespond,
  onConfirm,
}: {
  person: Person;
  balance: number;
  currency: string;
  linked: boolean;
  busy?: boolean;
  onOpen?: (person: Person) => void;
  onRespond: (person: Person, action: "accept" | "reject") => void | Promise<void>;
  onConfirm: (value: { type: "block" | "remove"; person: Person; linked?: boolean }) => void;
}) {
  const statusLabel = person.active ? person.status || "local" : "hidden";
  return (
    <div className="friend-card friend-card-clickable" role="button" tabIndex={0} onClick={() => onOpen?.(person)} onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") onOpen?.(person);
    }}>
      <div className="friend-card-main">
        <div className="friend-avatar">{person.localDisplayName.slice(0, 2).toUpperCase()}</div>
        <div className="friend-card-copy">
          <div className="friend-title-line">
            <strong>
              {person.verified || person.status === "connected" ? <Star className="verified-star" size={14} fill="currentColor" /> : null}
              {person.localDisplayName}
            </strong>
            <span className={`status-pill status-${statusLabel}`}>{statusLabel}</span>
          </div>
          <p>{person.serverDisplayName && person.serverDisplayName !== person.localDisplayName ? `${person.serverDisplayName} · ${person.inviteCode}` : person.inviteCode ? person.inviteCode : "Local connection"}</p>
        </div>
        <ChevronRight className="friend-card-chevron" size={18} />
      </div>
      <div className="friend-balance-grid">
        <div><span>You owe</span><strong className="money-negative">{balance < 0 ? formatMoney(Math.abs(balance), currency) : formatMoney(0, currency)}</strong></div>
        <div><span>Owes you</span><strong className="money-positive">{balance > 0 ? formatMoney(balance, currency) : formatMoney(0, currency)}</strong></div>
        <div><span>Balance</span><strong className={balance >= 0 ? "money-positive" : "money-negative"}>{balance >= 0 ? formatMoney(balance, currency) : `-${formatMoney(Math.abs(balance), currency)}`}</strong></div>
      </div>
      <div className="friend-actions">
        {person.status === "requested" ? <span className="status-hint">Waiting for acceptance</span> : null}
        {person.status === "pending" && person.requestDirection === "incoming" ? (
          <>
            <LoadingButton className="small-button" loading={Boolean(busy)} onClick={(event) => {
              event.stopPropagation();
              void onRespond(person, "accept");
            }}>Accept</LoadingButton>
            <LoadingButton className="small-button danger-button" loading={Boolean(busy)} onClick={(event) => {
              event.stopPropagation();
              void onRespond(person, "reject");
            }}>Reject</LoadingButton>
          </>
        ) : null}
      </div>
    </div>
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
  inputMode,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  return (
    <label className="grid gap-1">
      <span className="field-label">{label}</span>
      <span className="password-wrap">
        <input
          className="field-input"
          type={isPassword && visible ? "text" : type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          inputMode={inputMode ?? (label.toLowerCase().includes("pin") ? "numeric" : undefined)}
          maxLength={maxLength ?? (label.toLowerCase().includes("pin") ? 4 : undefined)}
          autoComplete={label.toLowerCase().includes("pin") ? "one-time-code" : undefined}
        />
        {isPassword ? (
          <button type="button" onClick={() => setVisible((item) => !item)} title={visible ? "Hide password" : "Show password"}>
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        ) : null}
      </span>
    </label>
  );
}

function LoadingButton({
  className,
  loading,
  disabled,
  children,
  onClick,
}: {
  className: string;
  loading: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>;
}) {
  return (
    <button className={className} onClick={onClick} disabled={disabled || loading}>
      {loading ? <span className="button-spinner" /> : null}
      {children}
    </button>
  );
}

function NotificationPopover({
  notifications,
  pushBusy,
  onEnablePush,
  onClear,
  onClose,
}: {
  notifications: AppNotification[];
  pushBusy: boolean;
  onEnablePush: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const permission = typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";
  return (
    <section className="notification-popover" role="dialog" aria-label="Notifications">
      <div className="notification-popover-head">
        <div>
          <strong>Notifications</strong>
          <span>{notifications.length ? `${notifications.length} recent update${notifications.length === 1 ? "" : "s"}` : "No updates yet"}</span>
        </div>
        <button type="button" className="icon-button icon-button-small" onClick={onClose} aria-label="Close notifications">×</button>
      </div>
      {permission !== "granted" && permission !== "unsupported" ? (
        <LoadingButton className="secondary-button notification-enable-button" loading={pushBusy} onClick={onEnablePush}>
          <Bell size={16} /> Enable device alerts
        </LoadingButton>
      ) : null}
      <div className="notification-list">
        {notifications.length ? notifications.slice(0, 8).map((item) => (
          <article className={`notification-item notification-item-${item.tone}`} key={item.id}>
            <span className="notification-dot" />
            <div>
              <strong>{item.title}</strong>
              <p>{item.message}</p>
              <small>{formatNotificationTime(item.createdAt)}</small>
            </div>
          </article>
        )) : <Empty text="Friend requests, settlement updates, and reports will appear here." />}
      </div>
      {notifications.length ? (
        <button type="button" className="text-button notification-clear-button" onClick={onClear}>Clear notifications</button>
      ) : null}
    </section>
  );
}

function ToastHost({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toast-host">
      {toasts.map((toast) => (
        <div className={`toast toast-${toast.tone}`} key={toast.id}>
          <span>{toast.message}</span>
          <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Close notification">×</button>
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
            {options.length === 0 ? (
              <div className="picker-empty">
                <span>No {label.toLowerCase()} values yet.</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpen(false);
                    window.dispatchEvent(new CustomEvent("micham:open-manage"));
                  }}
                >
                  Add in Manage
                </button>
              </div>
            ) : null}
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

function CurrencySelect({ label = "Currency", value, onChange }: { label?: string; value: string; onChange: (value: string) => void }) {
  return (
    <SelectField label={label} value={value || "INR"} onChange={onChange}>
      {CURRENCY_OPTIONS.map((currency) => (
        <option key={currency} value={currency}>
          {currency}
        </option>
      ))}
    </SelectField>
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
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
