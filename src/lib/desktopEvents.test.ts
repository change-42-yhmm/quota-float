import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), listeners: new Map<string, (event: unknown) => void>() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async (name: string, callback: (event: unknown) => void) => { mocks.listeners.set(name, callback); return () => mocks.listeners.delete(name); }) }));
beforeEach(() => { mocks.listeners.clear(); mocks.invoke.mockReset(); vi.stubGlobal("window", { __TAURI_INTERNALS__: {} }); });
it("ignores forged skin grants and reads the backend preferences", async () => {
  const { listenDesktopEvents } = await import("./bridge");
  const saved = { selectedSkin: "default", unlockedSkins: [] };
  mocks.invoke.mockResolvedValue(saved);
  const onPreferences = vi.fn();
  const cleanup = await listenDesktopEvents({ onPreferences, onRefresh: vi.fn(), onUpdate: vi.fn() });
  mocks.listeners.get("preferences-changed")!({ payload: { selectedSkin: "nexus", unlockedSkins: ["nexus"] } });
  await vi.waitFor(() => expect(onPreferences).toHaveBeenCalledWith(saved));
  expect(mocks.invoke).toHaveBeenCalledWith("get_preferences");
  cleanup();
  expect(mocks.listeners.size).toBe(0);
});
it("does not accept an event payload when the backend read fails", async () => {
  const { listenDesktopEvents } = await import("./bridge");
  mocks.invoke.mockRejectedValue(new Error("offline"));
  const onPreferences = vi.fn();
  await listenDesktopEvents({ onPreferences, onRefresh: vi.fn(), onUpdate: vi.fn() });
  mocks.listeners.get("preferences-changed")!({ payload: { selectedSkin: "nexus", unlockedSkins: ["nexus"] } });
  await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalled());
  expect(onPreferences).not.toHaveBeenCalled();
});
