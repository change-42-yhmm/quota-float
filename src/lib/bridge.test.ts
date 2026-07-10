import { beforeEach, describe, expect, it, vi } from "vitest";

const windowApi = vi.hoisted(() => {
  const calls: string[] = [];
  const windowMock = {
    outerPosition: vi.fn(),
    outerSize: vi.fn(),
    scaleFactor: vi.fn(),
    setSize: vi.fn(async (size: { width: number; height: number }) => {
      calls.push(`size:${size.width}x${size.height}`);
    }),
    setPosition: vi.fn(async (position: { x: number; y: number }) => {
      calls.push(`position:${position.x},${position.y}`);
    }),
    startDragging: vi.fn(),
  };
  return { calls, currentMonitor: vi.fn(), windowMock };
});

vi.mock("@tauri-apps/api/window", () => ({
  currentMonitor: windowApi.currentMonitor,
  getCurrentWindow: () => windowApi.windowMock,
  LogicalSize: class LogicalSize {
    constructor(public width: number, public height: number) {}
  },
  PhysicalPosition: class PhysicalPosition {
    constructor(public x: number, public y: number) {}
  },
}));

async function loadBridge() {
  vi.resetModules();
  return import("./bridge");
}

beforeEach(() => {
  vi.clearAllMocks();
  windowApi.calls.length = 0;
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  windowApi.windowMock.outerPosition.mockResolvedValue({ x: 1700, y: 900 });
  windowApi.windowMock.outerSize.mockResolvedValue({ width: 100, height: 100 });
  windowApi.windowMock.scaleFactor.mockResolvedValue(1);
  windowApi.currentMonitor.mockResolvedValue({
    workArea: {
      position: { x: 0, y: 0 },
      size: { width: 1920, height: 1040 },
    },
  });
});

describe("setWidgetExpanded", () => {
  it("expands a bottom-right orb toward the monitor interior", async () => {
    const { setWidgetExpanded } = await loadBridge();
    await setWidgetExpanded(true);
    expect(windowApi.windowMock.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 1480, y: 680 }),
    );
  });

  it("restores the exact pre-expansion position on collapse", async () => {
    const { setWidgetExpanded } = await loadBridge();
    await setWidgetExpanded(true);
    await setWidgetExpanded(false);
    expect(windowApi.windowMock.setPosition).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: 1700, y: 900 }),
    );
  });

  it("serializes rapid expand and collapse requests", async () => {
    const { setWidgetExpanded } = await loadBridge();
    await Promise.all([setWidgetExpanded(true), setWidgetExpanded(false)]);
    expect(windowApi.calls).toEqual([
      "size:320x320",
      "position:1480,680",
      "size:100x100",
      "position:1700,900",
    ]);
  });

  it("falls back to resize when monitor geometry is unavailable", async () => {
    windowApi.currentMonitor.mockResolvedValue(null);
    const { setWidgetExpanded } = await loadBridge();
    await setWidgetExpanded(true);
    expect(windowApi.calls).toEqual(["size:320x320"]);
    await setWidgetExpanded(false);
    expect(windowApi.calls).toEqual([
      "size:320x320",
      "size:100x100",
      "position:1700,900",
    ]);
  });

  it("retains the saved orb position when expansion positioning fails", async () => {
    windowApi.windowMock.setPosition.mockRejectedValueOnce(new Error("position failed"));
    const { setWidgetExpanded } = await loadBridge();
    await expect(setWidgetExpanded(true)).rejects.toThrow("position failed");
    await setWidgetExpanded(false);
    expect(windowApi.windowMock.setPosition).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: 1700, y: 900 }),
    );
  });

  it("keeps browser preview as a no-op", async () => {
    vi.stubGlobal("window", {});
    const { setWidgetExpanded } = await loadBridge();
    await setWidgetExpanded(true);
    expect(windowApi.windowMock.setSize).not.toHaveBeenCalled();
  });
});
