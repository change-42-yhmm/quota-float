import type { ProviderSnapshot, WidgetPreferences } from "../types";
import { calculateExpandedPosition } from "./windowPlacement";

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

const COLLAPSED_SIZE = 100;
const EXPANDED_SIZE = 320;

interface SavedPhysicalPosition {
  x: number;
  y: number;
}

let savedOrbPosition: SavedPhysicalPosition | null = null;
let widgetTransition: Promise<void> = Promise.resolve();

function enqueueWidgetTransition(operation: () => Promise<void>): Promise<void> {
  const next = widgetTransition.then(operation, operation);
  widgetTransition = next.catch(() => undefined);
  return next;
}

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
  await getCurrentWindow().startDragging();
}

async function applyWidgetExpanded(expanded: boolean): Promise<void> {
  const {
    currentMonitor,
    getCurrentWindow,
    LogicalSize,
    PhysicalPosition,
  } = await import("@tauri-apps/api/window");
  const currentWindow = getCurrentWindow();
  const logicalSize = expanded ? EXPANDED_SIZE : COLLAPSED_SIZE;

  if (!expanded) {
    await currentWindow.setSize(new LogicalSize(logicalSize, logicalSize));
    if (savedOrbPosition) {
      const restore = savedOrbPosition;
      await currentWindow.setPosition(new PhysicalPosition(restore.x, restore.y));
      savedOrbPosition = null;
    }
    return;
  }

  if (savedOrbPosition) {
    await currentWindow.setSize(new LogicalSize(logicalSize, logicalSize));
    return;
  }

  let originalPosition: SavedPhysicalPosition;
  try {
    const position = await currentWindow.outerPosition();
    originalPosition = { x: position.x, y: position.y };
  } catch {
    await currentWindow.setSize(new LogicalSize(logicalSize, logicalSize));
    return;
  }
  savedOrbPosition = originalPosition;

  let geometry: {
    monitor: Awaited<ReturnType<typeof currentMonitor>>;
    orbSize: { width: number; height: number };
    scaleFactor: number;
  };
  try {
    const [orbSize, scaleFactor, monitor] = await Promise.all([
      currentWindow.outerSize(),
      currentWindow.scaleFactor(),
      currentMonitor(),
    ]);
    geometry = { monitor, orbSize, scaleFactor };
  } catch {
    await currentWindow.setSize(new LogicalSize(logicalSize, logicalSize));
    return;
  }

  await currentWindow.setSize(new LogicalSize(logicalSize, logicalSize));
  if (!geometry.monitor) return;

  const target = calculateExpandedPosition(
    {
      x: originalPosition.x,
      y: originalPosition.y,
      width: geometry.orbSize.width,
      height: geometry.orbSize.height,
    },
    {
      width: Math.round(EXPANDED_SIZE * geometry.scaleFactor),
      height: Math.round(EXPANDED_SIZE * geometry.scaleFactor),
    },
    {
      x: geometry.monitor.workArea.position.x,
      y: geometry.monitor.workArea.position.y,
      width: geometry.monitor.workArea.size.width,
      height: geometry.monitor.workArea.size.height,
    },
  );
  await currentWindow.setPosition(new PhysicalPosition(target.x, target.y));
}

export function setWidgetExpanded(expanded: boolean): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  return enqueueWidgetTransition(() => applyWidgetExpanded(expanded));
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
