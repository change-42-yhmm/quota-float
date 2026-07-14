// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderSnapshot, WidgetPreferences } from "./types";

const bridge = vi.hoisted(() => ({
  fetchSnapshots: vi.fn(),
  getPreferences: vi.fn(),
  listenDesktopEvents: vi.fn(),
  setWidgetExpanded: vi.fn(),
  updatePreferences: vi.fn(),
}));

vi.mock("./lib/bridge", () => bridge);

import App from "./App";

const preferences: WidgetPreferences = {
  locked: false,
  panelVisible: true,
  expanded: true,
  alwaysOnTop: true,
  pinnedProvider: null,
  autoRotateSeconds: 12,
  language: "en",
};

const snapshot: ProviderSnapshot = {
  provider: "codex",
  displayName: "CODEX",
  plan: "PRO",
  weeklyWindow: {
    remainingPercent: 50,
    resetsAt: "2026-07-21T00:00:00Z",
    windowSeconds: 604_800,
  },
  resetCredits: 0,
  updatedAt: "2026-07-14T00:00:00Z",
  status: "ok",
  message: null,
};

beforeEach(() => {
  bridge.fetchSnapshots.mockResolvedValue([snapshot]);
  bridge.getPreferences.mockResolvedValue(preferences);
  bridge.listenDesktopEvents.mockResolvedValue(() => undefined);
  bridge.updatePreferences.mockResolvedValue(undefined);
  window.requestAnimationFrame = (callback: FrameRequestCallback) => window.setTimeout(callback, 0);
  window.cancelAnimationFrame = (handle: number) => window.clearTimeout(handle);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("panel mode transaction", () => {
  it("sends one native transaction for rapid clicks and focuses the new view", async () => {
    let finishResize: ((value: WidgetPreferences) => void) | undefined;
    bridge.setWidgetExpanded.mockImplementation(() => new Promise((resolve) => {
      finishResize = resolve;
    }));

    render(<App />);
    const collapse = await screen.findByRole("button", { name: "Collapse quota panel" });
    fireEvent.click(collapse);
    fireEvent.click(collapse);

    expect(bridge.setWidgetExpanded).toHaveBeenCalledTimes(1);
    expect(bridge.setWidgetExpanded).toHaveBeenCalledWith(false);
    expect(bridge.updatePreferences).not.toHaveBeenCalled();

    await act(async () => {
      finishResize?.({ ...preferences, expanded: false });
    });
    const expand = screen.getByRole("button", { name: "Expand quota panel" });
    await waitFor(() => expect(document.activeElement).toBe(expand));
  });

  it("keeps compact failures visible, restores focus, and does not issue a client rollback", async () => {
    bridge.getPreferences.mockResolvedValue({ ...preferences, expanded: false });
    bridge.setWidgetExpanded.mockRejectedValue("failed to save panel size; previous layout restored");
    render(<App />);

    const expand = await screen.findByRole("button", { name: "Expand quota panel" });
    fireEvent.click(expand);
    await screen.findByLabelText("Panel size change failed. The previous layout was kept.");
    expect(bridge.setWidgetExpanded).toHaveBeenCalledTimes(1);
    expect(bridge.setWidgetExpanded).toHaveBeenCalledWith(true);
    expect(bridge.updatePreferences).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(expand));
  });

  it("keeps both mode controls available while quota data is loading", async () => {
    bridge.fetchSnapshots.mockReturnValue(new Promise(() => undefined));
    bridge.setWidgetExpanded.mockResolvedValue({ ...preferences, expanded: false });
    render(<App />);

    const collapse = await screen.findByRole("button", { name: "Collapse quota panel" });
    expect(await screen.findByRole("button", { name: "Expand quota panel" })).toBeTruthy();
    fireEvent.click(collapse);
    await waitFor(() => expect(bridge.setWidgetExpanded).toHaveBeenCalledWith(false));
  });
});
