import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  openUrl: vi.fn(async (_url: string) => {}),
  calls: [] as string[],
  invoke: vi.fn(async (command: string) => {
    api.calls.push(`start:${command}`);
    await Promise.resolve();
    api.calls.push(`end:${command}`);
  }),
  currentMonitor: vi.fn(async () => ({
    workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } },
  })),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: api.invoke }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: api.openUrl }));
vi.mock("@tauri-apps/api/window", () => ({ currentMonitor: api.currentMonitor }));

beforeEach(() => {
  vi.clearAllMocks();
  api.calls.length = 0;
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
});

describe("external links", () => {
  it("opens desktop links through the system browser", async () => {
    const { openExternalUrl } = await import("./bridge");
    await openExternalUrl("https://ko-fi.com/change42/shop");
    expect(api.openUrl).toHaveBeenCalledWith("https://ko-fi.com/change42/shop");
  });

  it("opens preview links without access to the opener window", async () => {
    const open = vi.fn();
    vi.stubGlobal("window", { open });
    const { openExternalUrl } = await import("./bridge");
    await openExternalUrl("https://x.com/Spacelooklook");
    expect(open).toHaveBeenCalledWith("https://x.com/Spacelooklook", "_blank", "noopener,noreferrer");
    expect(api.openUrl).not.toHaveBeenCalled();
  });
});

describe("widget transitions", () => {
  it("passes the monitor work area to the Rust expansion command", async () => {
    const { setWidgetExpanded } = await import("./bridge");
    await setWidgetExpanded(true);
    expect(api.invoke).toHaveBeenCalledWith("expand_widget", {
      workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } },
    });
  });

  it("serializes rapid expand and collapse requests", async () => {
    const { setWidgetExpanded } = await import("./bridge");
    await Promise.all([setWidgetExpanded(true), setWidgetExpanded(false)]);
    expect(api.calls).toEqual([
      "start:expand_widget",
      "end:expand_widget",
      "start:collapse_widget",
      "end:collapse_widget",
    ]);
  });
});
