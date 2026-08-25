export type TransactionType = "expense" | "income" | "transfer";
export type CategoryKind = "expense" | "income";
export type BudgetPeriod = "monthly";
export type RecurringFrequency = "weekly" | "monthly" | "yearly";
export type OweDirection = "to_me" | "by_me";

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
  primaryColor: string;
  accentColor: string;
  surfaceColor: string;
  textColor: string;
  defaultCurrency: string;
  adminId: string;
  adminPassword: string;
  syncEnabled: boolean;
  aiEnabled: boolean;
  updatedAt: string;
}

export interface Profile extends BaseEntity {
  displayName: string;
  currency: string;
  connectedUserId?: string;
  setupComplete: boolean;
}

export interface Account extends BaseEntity {
  name: string;
  openingBalance: number;
  active: boolean;
}

export interface Category extends BaseEntity {
  name: string;
  kind: CategoryKind;
  parentId?: string;
  active: boolean;
}

export interface Transaction extends BaseEntity {
  type: TransactionType;
  amount: number;
  accountId?: string;
  toAccountId?: string;
  categoryId?: string;
  date: string;
  note: string;
  personIds?: string[];
}

export interface Budget extends BaseEntity {
  categoryId: string;
  amount: number;
  period: BudgetPeriod;
  active: boolean;
}

export interface RecurringTransaction extends BaseEntity {
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
  localDisplayName: string;
  connectedUserId?: string;
  active: boolean;
}

export interface Settlement extends BaseEntity {
  personId: string;
  direction: OweDirection;
  originalAmount: number;
  repaidAmount: number;
  transactionId?: string;
  date: string;
  note: string;
}

export interface SyncOperation extends BaseEntity {
  entity: string;
  entityId: string;
  action: "upsert" | "delete";
  payload: unknown;
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
  config: AppConfig;
}
