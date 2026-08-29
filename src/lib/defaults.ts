import type { AppConfig, Category } from "./types";

export const nowIso = () => new Date().toISOString();

export const createId = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export const defaultConfig: AppConfig = {
  id: "primary",
  appName: "Micham",
  tagline: "Micham evlo irukku?",
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
  themeMode: "light",
  updatedAt: nowIso(),
};

export const seedCategories = (): Category[] => {
  const createdAt = nowIso();
  return [
    {
      id: createId(),
      name: "General Expense",
      kind: "expense",
      active: true,
      createdAt,
      updatedAt: createdAt,
      syncState: "local",
    },
    {
      id: createId(),
      name: "General Income",
      kind: "income",
      active: true,
      createdAt,
      updatedAt: createdAt,
      syncState: "local",
    },
  ];
};
