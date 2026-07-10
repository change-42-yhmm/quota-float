import type { ProviderSnapshot, WidgetPreferences } from "../types";

const defaultPreferences: WidgetPreferences = { locked: false, alwaysOnTop: true, pinnedProvider: null, autoRotateSeconds: 12, language: "zh-CN" };

const mockSnapshot: ProviderSnapshot = {
  provider: "codex",
  displayName: "CODEX",
  plan: "PRO",
  shortWindow: { remainingPercent: 74, resetsAt: new Date(Date.now() + 78 * 60_000).toISOString(), windowSeconds: 18_000 },
  weeklyWindow: { remainingPercent: 42, resetsAt: new Date(Date.now() + 3.2 * 86_400_000).toISOString(), windowSeconds: 604_800 },
  resetCredits: 1,
  resetCreditExpiresAt: [new Date(Date.now() + 9 * 86_400_000).toISOString()],
  updatedAt: new Date().toISOString(),
  status: "ok",
  message: null,
};

export const isTauri = () => "__TAURI_INTERNALS__" in window;

export async function fetchSnapshots(force = false): Promise<ProviderSnapshot[]> {
  if (!isTauri()) return [mockSnapshot];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ProviderSnapshot[]>(force ? "refresh_snapshots" : "get_snapshots");
}

export async function getPreferences(): Promise<WidgetPreferences> {
  if (!isTauri()) return defaultPreferences;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<WidgetPreferences>("get_preferences");
}

export async function updatePreferences(value: WidgetPreferences): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_preferences", { preferences: value });
}

export async function setClickThrough(locked: boolean): Promise<WidgetPreferences> {
  if (!isTauri()) return { ...defaultPreferences, locked };
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<WidgetPreferences>("set_widget_locked", { locked });
}

export async function setAlwaysOnTop(alwaysOnTop: boolean): Promise<WidgetPreferences> {
  if (!isTauri()) return { ...defaultPreferences, alwaysOnTop };
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<WidgetPreferences>("set_widget_always_on_top", { alwaysOnTop });
}

export async function startDragging(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const { invoke } = await import("@tauri-apps/api/core");
  const currentWindow = getCurrentWindow();
  await invoke("begin_widget_drag");
  await currentWindow.startDragging();
  let previous = await currentWindow.outerPosition();
  let stableTicks = 0;
  let attempts = 0;
  const finishWhenStable = window.setInterval(() => {
    void currentWindow.outerPosition()
      .then((next) => {
        attempts += 1;
        const stable = Math.abs(next.x - previous.x) <= 1 && Math.abs(next.y - previous.y) <= 1;
        stableTicks = stable ? stableTicks + 1 : 0;
        previous = next;
        if (stableTicks >= 3 || attempts >= 25) {
          window.clearInterval(finishWhenStable);
          void invoke("finish_widget_drag").catch(() => undefined);
        }
      })
      .catch(() => {
        window.clearInterval(finishWhenStable);
        void invoke("finish_widget_drag").catch(() => undefined);
      });
  }, 80);
}

export async function setWidgetExpanded(expanded: boolean): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke(expanded ? "expand_widget" : "collapse_widget");
}

export async function listenDesktopEvents(handlers: {
  onPreferences: (value: WidgetPreferences) => void;
  onRefresh: () => void;
}): Promise<() => void> {
  if (!isTauri()) return () => undefined;
  const { listen } = await import("@tauri-apps/api/event");
  const unlistenPreferences = await listen<WidgetPreferences>("preferences-changed", (event) => handlers.onPreferences(event.payload));
  const unlistenRefresh = await listen("refresh-requested", handlers.onRefresh);
  return () => { unlistenPreferences(); unlistenRefresh(); };
}
