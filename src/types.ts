export type ProviderId = "codex" | "claude";
export type SnapshotStatus = "ok" | "stale" | "loading" | "unavailable" | "signed_out";
export type Language = "zh-CN" | "en";
export type WidgetTheme = "light" | "dark";
export type AppearancePreference = "system" | WidgetTheme;
export type WidgetSkin = "default" | "blur" | "computer";

export interface SupporterStatus {
  requestCode: string;
  active: boolean;
  message: string;
  unlockedSkin: Exclude<WidgetSkin, "default"> | null;
  unlockedSkins: Array<Exclude<WidgetSkin, "default">>;
  selectedSkin: WidgetSkin;
  availableSkins: WidgetSkin[];
}

export interface UsageWindow {
  remainingPercent: number;
  resetsAt: string | null;
  windowSeconds: number;
}

export interface ProviderSnapshot {
  provider: ProviderId;
  displayName: string;
  plan: string | null;
  shortWindow: UsageWindow | null;
  weeklyWindow: UsageWindow | null;
  resetCredits: number | null;
  resetCreditExpiresAt?: string[];
  updatedAt: string;
  status: SnapshotStatus;
  message: string | null;
}

export interface WidgetPreferences {
  locked: boolean;
  alwaysOnTop: boolean;
  stayExpanded: boolean;
  pinnedProvider: ProviderId | null;
  autoRotateSeconds: number;
  language: Language;
  appearance: AppearancePreference;
  license: string | null;
  licenses: string[];
  unlockedSkin: Exclude<WidgetSkin, "default"> | null;
  unlockedSkins: Array<Exclude<WidgetSkin, "default">>;
  selectedSkin: WidgetSkin;
}
