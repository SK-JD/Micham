export type TransactionType = "expense" | "income" | "transfer";
export type CategoryKind = "expense" | "income";
export type BudgetPeriod = "monthly";
export type RecurringFrequency = "weekly" | "monthly" | "yearly";
export type OweDirection = "to_me" | "by_me";
export type FriendStatus = "local" | "pending" | "requested" | "connected" | "blocked" | "removed";
export type SettlementStatus = "open" | "pending_settlement" | "settled" | "rejected";

export interface TransactionVersion {
  type: TransactionType;
  amount: number;
  accountId?: string;
  toAccountId?: string;
  categoryId?: string;
  date: string;
  note: string;
  editedAt: string;
}

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  syncState: "local" | "queued" | "synced";
}

export interface AppConfig {
  id: "primary";
  appName: string;
  tagline: string;
  logoText: string;
  logoImage?: string;
  primaryColor: string;
  accentColor: string;
  surfaceColor: string;
  textColor: string;
  defaultCurrency: string;
  adminId: string;
  adminPassword: string;
  syncEnabled: boolean;
  aiEnabled: boolean;
  groqApiKey?: string;
  aiModel: string;
  themeMode: "light" | "dark";
  updatedAt: string;
}

export interface Profile extends BaseEntity {
  loginId: string;
  passwordHash: string;
  connectionCode: string;
  displayName: string;
  currency: string;
  connectedUserId?: string;
  lastSyncCursor?: string;
  setupComplete: boolean;
}

export interface Account extends BaseEntity {
  ownerProfileId?: string;
  name: string;
  openingBalance: number;
  active: boolean;
}

export interface Category extends BaseEntity {
  ownerProfileId?: string;
  name: string;
  kind: CategoryKind;
  parentId?: string;
  active: boolean;
}

export interface Transaction extends BaseEntity {
  ownerProfileId?: string;
  type: TransactionType;
  amount: number;
  accountId?: string;
  toAccountId?: string;
  categoryId?: string;
  date: string;
  note: string;
  receiptName?: string;
  receiptData?: string;
  personIds?: string[];
  edited?: boolean;
  editCount?: number;
  lastEditedAt?: string;
  previousVersion?: TransactionVersion;
}

export interface Budget extends BaseEntity {
  ownerProfileId?: string;
  categoryId: string;
  amount: number;
  period: BudgetPeriod;
  active: boolean;
}

export interface RecurringTransaction extends BaseEntity {
  ownerProfileId?: string;
  type: TransactionType;
  amount: number;
  accountId: string;
  categoryId?: string;
  frequency: RecurringFrequency;
  nextDate: string;
  note: string;
  active: boolean;
}

export interface Person extends BaseEntity {
  ownerProfileId?: string;
  localDisplayName: string;
  nickname?: string;
  serverDisplayName?: string;
  inviteCode?: string;
  connectedUserId?: string;
  status: FriendStatus;
  verified?: boolean;
  requestDirection?: "incoming" | "outgoing";
  friendUserId?: string;
  active: boolean;
}

export interface Settlement extends BaseEntity {
  ownerProfileId?: string;
  personId: string;
  direction: OweDirection;
  originalAmount: number;
  repaidAmount: number;
  accountId?: string;
  categoryId?: string;
  transactionId?: string;
  linkedSettlementId?: string;
  friendUserId?: string;
  status?: SettlementStatus;
  pendingRepaymentAmount?: number;
  parentSettlementId?: string;
  confirmedAt?: string;
  confirmedBy?: string;
  date: string;
  note: string;
}

export interface Repayment extends BaseEntity {
  ownerProfileId?: string;
  settlementId: string;
  personId: string;
  amount: number;
  accountId?: string;
  transactionId?: string;
  date: string;
  note: string;
  linkedRepaymentId?: string;
  friendUserId?: string;
  status?: "pending" | "confirmed" | "rejected";
  parentRepaymentId?: string;
  confirmedAt?: string;
  confirmedBy?: string;
}

export interface ChatMessageRecord extends BaseEntity {
  ownerProfileId?: string;
  role: "user" | "assistant";
  content: string;
}

export interface SyncOperation extends BaseEntity {
  entity: string;
  entityId: string;
  action: "upsert" | "delete";
  payload: unknown;
  clientMutationId?: string;
  retryCount?: number;
  lastAttemptAt?: string;
  error?: string;
}

export interface ImportPayload {
  exportedAt: string;
  app: string;
  profile?: Profile;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  recurringTransactions: RecurringTransaction[];
  people: Person[];
  settlements: Settlement[];
  repayments?: Repayment[];
  chatMessages?: ChatMessageRecord[];
  config: AppConfig;
}
