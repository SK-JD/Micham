export type SettingsTabKey = "profile" | "security" | "sync" | "tools" | "data" | "about";

export type SettingsTab = {
  key: SettingsTabKey;
  label: string;
};

export const settingsTabs: SettingsTab[] = [
  { key: "profile", label: "Profile" },
  { key: "security", label: "Security" },
  { key: "sync", label: "Sync & Cloud" },
  { key: "tools", label: "Tools" },
  { key: "data", label: "Data" },
  { key: "about", label: "About" },
];
