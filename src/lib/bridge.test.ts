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

const coreApi = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => coreApi);

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
  windowApi.currentMonitor.mockReset();
  windowApi.windowMock.outerPosition.mockReset();
  windowApi.windowMock.outerSize.mockReset();
  windowApi.windowMock.scaleFactor.mockReset();
  windowApi.windowMock.setSize.mockReset();
  windowApi.windowMock.setPosition.mockReset();
  windowApi.windowMock.startDragging.mockReset();
  coreApi.invoke.mockReset();
  coreApi.invoke.mockResolvedValue(undefined);
  windowApi.calls.length = 0;
  windowApi.windowMock.setSize.mockImplementation(async (size: { width: number; height: number }) => {
    windowApi.calls.push(`size:${size.width}x${size.height}`);
  });
  windowApi.windowMock.setPosition.mockImplementation(async (position: { x: number; y: number }) => {
    windowApi.calls.push(`position:${position.x},${position.y}`);
  });
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

  it("uses the scale factor to calculate the physical expanded size", async () => {
    windowApi.windowMock.scaleFactor.mockResolvedValue(1.5);
    const { setWidgetExpanded } = await loadBridge();
    await setWidgetExpanded(true);
    expect(windowApi.windowMock.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 1320, y: 520 }),
    );
  });

  it("restores the exact pre-expansion position on collapse", async () => {
    windowApi.windowMock.outerPosition
      .mockResolvedValueOnce({ x: 1700, y: 900 })
      .mockResolvedValueOnce({ x: 1480, y: 680 });
    windowApi.windowMock.outerSize
      .mockResolvedValueOnce({ width: 100, height: 100 })
      .mockResolvedValueOnce({ width: 320, height: 320 });

    const { setWidgetExpanded } = await loadBridge();
    await setWidgetExpanded(true);
    await setWidgetExpanded(false);
    expect(windowApi.windowMock.setPosition).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: 1700, y: 900 }),
    );
  });

  it("collapses at the new top-right corner after the expanded card is dragged", async () => {
    windowApi.windowMock.outerPosition
      .mockResolvedValueOnce({ x: 20, y: 20 })
      .mockResolvedValueOnce({ x: 20, y: 20 })
      .mockResolvedValueOnce({ x: 1580, y: 20 });
    windowApi.windowMock.outerSize
      .mockResolvedValueOnce({ width: 100, height: 100 })
      .mockResolvedValueOnce({ width: 320, height: 320 });

    const { setWidgetExpanded, startDragging } = await loadBridge();
    await setWidgetExpanded(true);
    await startDragging();
    await setWidgetExpanded(false);

    expect(windowApi.windowMock.setPosition).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: 1800, y: 20 }),
    );
  });

  it("preserves a dragged position when monitor geometry was unavailable during expansion", async () => {
    windowApi.windowMock.outerPosition
      .mockResolvedValueOnce({ x: 20, y: 20 })
      .mockResolvedValueOnce({ x: 20, y: 20 })
      .mockResolvedValueOnce({ x: 1580, y: 20 });
    windowApi.windowMock.outerSize
      .mockResolvedValueOnce({ width: 100, height: 100 })
      .mockResolvedValueOnce({ width: 320, height: 320 });
    windowApi.currentMonitor
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        workArea: {
          position: { x: 0, y: 0 },
          size: { width: 1920, height: 1040 },
        },
      });

    const { setWidgetExpanded, startDragging } = await loadBridge();
    await setWidgetExpanded(true);
    await startDragging();
    await setWidgetExpanded(false);

    expect(windowApi.windowMock.setPosition).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: 1800, y: 20 }),
    );
  });

  it("ignores system repositioning when the user did not drag", async () => {
    windowApi.windowMock.outerPosition
      .mockResolvedValueOnce({ x: 20, y: 20 })
      .mockResolvedValueOnce({ x: 50, y: 20 });
    windowApi.windowMock.outerSize
      .mockResolvedValueOnce({ width: 100, height: 100 })
      .mockResolvedValueOnce({ width: 320, height: 320 });

    const { setWidgetExpanded } = await loadBridge();
    await setWidgetExpanded(true);
    await setWidgetExpanded(false);

    expect(windowApi.windowMock.setPosition).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: 20, y: 20 }),
    );
  });

  it("reuses the dragged restore position after a collapse positioning failure", async () => {
    windowApi.windowMock.outerPosition
      .mockResolvedValueOnce({ x: 20, y: 20 })
      .mockResolvedValueOnce({ x: 20, y: 20 })
      .mockResolvedValueOnce({ x: 1580, y: 20 })
      .mockResolvedValueOnce({ x: 1580, y: 20 });
    windowApi.windowMock.outerSize
      .mockResolvedValueOnce({ width: 100, height: 100 })
      .mockResolvedValueOnce({ width: 320, height: 320 })
      .mockResolvedValueOnce({ width: 100, height: 100 });
    windowApi.windowMock.setPosition
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("collapse position failed"))
      .mockResolvedValueOnce(undefined);

    const { setWidgetExpanded, startDragging } = await loadBridge();
    await setWidgetExpanded(true);
    await startDragging();
    await expect(setWidgetExpanded(false)).rejects.toThrow("collapse position failed");
    await setWidgetExpanded(false);

    expect(windowApi.windowMock.setPosition).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: 1800, y: 20 }),
    );
  });

  it("waits for the native drag command to finish before collapsing", async () => {
    let finishDrag!: () => void;
    coreApi.invoke.mockReturnValueOnce(new Promise<void>((resolve) => {
      finishDrag = resolve;
    }));
    windowApi.windowMock.outerPosition
      .mockResolvedValueOnce({ x: 20, y: 20 })
      .mockResolvedValueOnce({ x: 20, y: 20 })
      .mockResolvedValueOnce({ x: 1580, y: 20 });
    windowApi.windowMock.outerSize
      .mockResolvedValueOnce({ width: 100, height: 100 })
      .mockResolvedValueOnce({ width: 320, height: 320 });

    const { setWidgetExpanded, startDragging } = await loadBridge();
    await setWidgetExpanded(true);
    const dragging = startDragging();
    const collapsing = setWidgetExpanded(false);
    await vi.waitFor(() => expect(coreApi.invoke).toHaveBeenCalledWith("start_widget_dragging"));

    expect(windowApi.calls).toEqual([
      "size:320x320",
      "position:20,20",
    ]);

    finishDrag();
    await Promise.all([dragging, collapsing]);
    expect(windowApi.windowMock.setPosition).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: 1800, y: 20 }),
    );
  });

  it("starts a fresh placement cycle after a failed collapse is re-expanded", async () => {
    windowApi.windowMock.outerPosition
      .mockResolvedValueOnce({ x: 20, y: 20 })
      .mockResolvedValueOnce({ x: 20, y: 20 })
      .mockResolvedValueOnce({ x: 1580, y: 20 })
      .mockResolvedValueOnce({ x: 1800, y: 20 })
      .mockResolvedValueOnce({ x: 1580, y: 20 })
      .mockResolvedValueOnce({ x: 20, y: 700 });
    windowApi.windowMock.outerSize
      .mockResolvedValueOnce({ width: 100, height: 100 })
      .mockResolvedValueOnce({ width: 320, height: 320 })
      .mockResolvedValueOnce({ width: 100, height: 100 })
      .mockResolvedValueOnce({ width: 320, height: 320 });
    windowApi.windowMock.setPosition
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("collapse position failed"))
      .mockResolvedValue(undefined);

    const { setWidgetExpanded, startDragging } = await loadBridge();
    await setWidgetExpanded(true);
    await startDragging();
    await expect(setWidgetExpanded(false)).rejects.toThrow("collapse position failed");

    await setWidgetExpanded(true);
    await startDragging();
    await setWidgetExpanded(false);

    expect(windowApi.windowMock.setPosition).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: 20, y: 920 }),
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

  it("keeps the original orb position across repeated rapid expansion", async () => {
    let resolveFirstPosition!: (position: { x: number; y: number }) => void;
    const firstPosition = new Promise<{ x: number; y: number }>((resolve) => {
      resolveFirstPosition = resolve;
    });
    windowApi.windowMock.outerPosition
      .mockReturnValueOnce(firstPosition);

    const { setWidgetExpanded } = await loadBridge();
    const transitions = [
      setWidgetExpanded(true),
      setWidgetExpanded(true),
      setWidgetExpanded(false),
    ];
    resolveFirstPosition({ x: 1700, y: 900 });
    await Promise.all(transitions);

    expect(windowApi.windowMock.outerPosition).toHaveBeenCalledTimes(1);
    expect(windowApi.windowMock.setPosition).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: 1700, y: 900 }),
    );
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
    expect(windowApi.currentMonitor).not.toHaveBeenCalled();
    expect(windowApi.windowMock.outerPosition).not.toHaveBeenCalled();
    expect(windowApi.windowMock.outerSize).not.toHaveBeenCalled();
    expect(windowApi.windowMock.scaleFactor).not.toHaveBeenCalled();
    expect(windowApi.windowMock.setSize).not.toHaveBeenCalled();
    expect(windowApi.windowMock.setPosition).not.toHaveBeenCalled();
    expect(windowApi.windowMock.startDragging).not.toHaveBeenCalled();
  });
});
