import type { ReactNode } from "react";
import type { SettingsTabKey } from "./types";

export function SettingsTabPage({
  tab,
  activeTab,
  children,
}: {
  tab: SettingsTabKey;
  activeTab: SettingsTabKey;
  children: ReactNode;
}) {
  if (tab !== activeTab) return null;
  return <>{children}</>;
}
