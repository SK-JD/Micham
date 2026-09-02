import Dexie, { type Table } from "dexie";
import type {
  Account,
  AppConfig,
  Budget,
  Category,
  Person,
  Profile,
  Repayment,
  RecurringTransaction,
  Settlement,
  SyncOperation,
  Transaction,
} from "./types";
import { defaultConfig, seedCategories } from "./defaults";

class MichamDatabase extends Dexie {
  appConfig!: Table<AppConfig, string>;
  profiles!: Table<Profile, string>;
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  budgets!: Table<Budget, string>;
  recurringTransactions!: Table<RecurringTransaction, string>;
  people!: Table<Person, string>;
  settlements!: Table<Settlement, string>;
  repayments!: Table<Repayment, string>;
  syncQueue!: Table<SyncOperation, string>;

  constructor() {
    super("micham_local_database");
    this.version(1).stores({
      appConfig: "id, updatedAt",
      profiles: "id, connectedUserId, setupComplete, updatedAt",
      accounts: "id, active, updatedAt",
      categories: "id, kind, parentId, active, updatedAt",
      transactions: "id, type, accountId, toAccountId, categoryId, date, updatedAt",
      budgets: "id, categoryId, active, updatedAt",
      recurringTransactions: "id, accountId, categoryId, active, nextDate, updatedAt",
      people: "id, connectedUserId, active, updatedAt",
      settlements: "id, personId, direction, date, updatedAt",
      syncQueue: "id, entity, entityId, action, updatedAt",
    });
    this.version(2).stores({
      appConfig: "id, updatedAt",
      profiles: "id, loginId, connectedUserId, setupComplete, updatedAt",
      accounts: "id, active, updatedAt",
      categories: "id, kind, parentId, active, updatedAt",
      transactions: "id, type, accountId, toAccountId, categoryId, date, updatedAt",
      budgets: "id, categoryId, active, updatedAt",
      recurringTransactions: "id, accountId, categoryId, active, nextDate, updatedAt",
      people: "id, connectedUserId, active, updatedAt",
      settlements: "id, personId, direction, date, updatedAt",
      syncQueue: "id, entity, entityId, action, updatedAt",
    });
    this.version(3).stores({
      appConfig: "id, updatedAt",
      profiles: "id, loginId, connectedUserId, setupComplete, updatedAt",
      accounts: "id, ownerProfileId, active, updatedAt",
      categories: "id, ownerProfileId, kind, parentId, active, updatedAt",
      transactions: "id, ownerProfileId, type, accountId, toAccountId, categoryId, date, updatedAt",
      budgets: "id, ownerProfileId, categoryId, active, updatedAt",
      recurringTransactions: "id, ownerProfileId, accountId, categoryId, active, nextDate, updatedAt",
      people: "id, ownerProfileId, connectedUserId, active, updatedAt",
      settlements: "id, ownerProfileId, personId, direction, date, updatedAt",
      syncQueue: "id, entity, entityId, action, updatedAt",
    });
    this.version(4).stores({
      appConfig: "id, updatedAt",
      profiles: "id, loginId, connectedUserId, setupComplete, updatedAt",
      accounts: "id, ownerProfileId, active, updatedAt",
      categories: "id, ownerProfileId, kind, parentId, active, updatedAt",
      transactions: "id, ownerProfileId, type, accountId, toAccountId, categoryId, date, updatedAt",
      budgets: "id, ownerProfileId, categoryId, active, updatedAt",
      recurringTransactions: "id, ownerProfileId, accountId, categoryId, active, nextDate, updatedAt",
      people: "id, ownerProfileId, connectedUserId, active, updatedAt",
      settlements: "id, ownerProfileId, personId, direction, linkedSettlementId, date, updatedAt",
      repayments: "id, ownerProfileId, settlementId, personId, linkedRepaymentId, date, updatedAt",
      syncQueue: "id, entity, entityId, action, updatedAt",
    });
    this.version(5).stores({
      appConfig: "id, updatedAt",
      profiles: "id, loginId, connectedUserId, setupComplete, updatedAt",
      accounts: "id, ownerProfileId, active, updatedAt",
      categories: "id, ownerProfileId, kind, parentId, active, updatedAt",
      transactions: "id, ownerProfileId, type, accountId, toAccountId, categoryId, date, updatedAt",
      budgets: "id, ownerProfileId, categoryId, active, updatedAt",
      recurringTransactions: "id, ownerProfileId, accountId, categoryId, active, nextDate, updatedAt",
      people: "id, ownerProfileId, connectedUserId, friendUserId, active, updatedAt",
      settlements: "id, ownerProfileId, personId, direction, linkedSettlementId, date, updatedAt",
      repayments: "id, ownerProfileId, settlementId, personId, linkedRepaymentId, date, updatedAt",
      syncQueue: "id, entity, entityId, action, updatedAt",
    });
  }
}

export const db = new MichamDatabase();

export async function initializeDatabase() {
  const config = await db.appConfig.get("primary");
  if (!config) {
    await db.appConfig.put(defaultConfig);
  } else if (
    (config.primaryColor === "#2563eb" && config.accentColor === "#16a34a") ||
    (config.primaryColor === "#0878ff" && config.accentColor === "#00a77f")
  ) {
    await db.appConfig.update("primary", {
      primaryColor: defaultConfig.primaryColor,
      accentColor: defaultConfig.accentColor,
      updatedAt: defaultConfig.updatedAt,
    });
  }

  const categoryCount = await db.categories.count();
  if (categoryCount === 0) await db.categories.bulkPut(seedCategories());
}
