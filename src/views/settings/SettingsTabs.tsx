import type React from "react";
import type { SettingsTabKey } from "./types";
import { settingsTabs } from "./types";
import { CircleUserRound, Cloud, Database, Info, ShieldCheck, SlidersHorizontal } from "lucide-react";

const settingsTabIcons: Record<SettingsTabKey, React.ReactNode> = {
  profile: <CircleUserRound size={16} />,
  security: <ShieldCheck size={16} />,
  sync: <Cloud size={16} />,
  tools: <SlidersHorizontal size={16} />,
  data: <Database size={16} />,
  about: <Info size={16} />,
};

export function SettingsTabs({
  activeTab,
  onChange,
}: {
  activeTab: SettingsTabKey;
  onChange: (tab: SettingsTabKey) => void;
}) {
  return (
    <div className="settings-tabs" role="tablist" aria-label="Profile settings sections">
      {settingsTabs.map((tab) => (
        <button
          key={tab.key}
          className={activeTab === tab.key ? "settings-tab settings-tab-active" : "settings-tab"}
          type="button"
          onClick={() => onChange(tab.key)}
        >
          {settingsTabIcons[tab.key]}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
