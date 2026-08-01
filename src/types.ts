export type ProviderId = "codex" | "workbuddy";
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

export interface WorkBuddyPoints {
  monthlyRemaining: number;
  monthlyTotal: number;
  addonRemaining: number;
  addonTotal: number;
  expiringAddonRemaining: number | null;
  expiringAddonExpiresAt: string | null;
}

export interface ProviderSnapshot {
  provider: ProviderId;
  displayName: string;
  plan: string | null;
  shortWindow: UsageWindow | null;
  weeklyWindow: UsageWindow | null;
  resetCredits: number | null;
  resetCreditExpiresAt?: string[];
  workbuddy?: WorkBuddyPoints | null;
  updatedAt: string;
  status: SnapshotStatus;
  message: string | null;
}

export interface WidgetPreferences {
  locked: boolean;
  alwaysOnTop: boolean;
  stayExpanded: boolean;
  pinnedProvider: ProviderId | null;
  /** Providers selectable in the tray menu; the card can switch among them. At least one is kept. */
  enabledProviders?: ProviderId[];
  autoRotateSeconds: number;
  language: Language;
  appearance: AppearancePreference;
  license: string | null;
  licenses: string[];
  unlockedSkin: Exclude<WidgetSkin, "default"> | null;
  unlockedSkins: Array<Exclude<WidgetSkin, "default">>;
  selectedSkin: WidgetSkin;
  supporterPromptFirstSeenAt?: string | null;
  supporterPromptShownAt?: string | null;
}
