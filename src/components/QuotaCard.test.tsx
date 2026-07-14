// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderSnapshot } from "../types";
import { QuotaOrb } from "./QuotaCard";

const baseSnapshot: ProviderSnapshot = {
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

function renderOrb(snapshot: ProviderSnapshot) {
  return render(
    <QuotaOrb
      snapshot={snapshot}
      language="zh-CN"
      onDrag={() => undefined}
      onHover={() => undefined}
      onToggleExpanded={() => undefined}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("compact quota view", () => {
  it.each([0, 50, 100])("renders the exact %s%% boundary without hiding it", (remainingPercent) => {
    renderOrb({
      ...baseSnapshot,
      weeklyWindow: { ...baseSnapshot.weeklyWindow!, remainingPercent },
    });
    expect(screen.getByText(String(remainingPercent))).toBeTruthy();
    expect(screen.getByRole("button", { name: "展开额度面板" })).toBeTruthy();
  });

  it("keeps a fresh stale percentage consistent with the expanded panel", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T00:20:00Z"));
    renderOrb({ ...baseSnapshot, status: "stale" });
    expect(screen.getByText("50")).toBeTruthy();
  });

  it("stops showing a stale percentage after the 30 minute accuracy boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T00:31:00Z"));
    renderOrb({ ...baseSnapshot, status: "stale" });
    expect(screen.queryByText("50")).toBeNull();
  });

  it.each(["signed_out", "unavailable"] as const)("shows an error glyph for %s", (status) => {
    renderOrb({ ...baseSnapshot, status, weeklyWindow: null, message: `${status} message` });
    expect(screen.queryByText("50")).toBeNull();
    expect(screen.getByLabelText(`${status} message`)).toBeTruthy();
  });

  it("starts the idle fade only after the compact view becomes active", () => {
    vi.useFakeTimers();
    const props = {
      snapshot: baseSnapshot,
      language: "zh-CN" as const,
      onDrag: () => undefined,
      onHover: () => undefined,
      onToggleExpanded: () => undefined,
    };
    const { container, rerender } = render(<QuotaOrb {...props} compactActive={false} />);
    act(() => vi.advanceTimersByTime(2500));
    expect(container.querySelector(".quota-orb")?.classList.contains("quota-orb--idle")).toBe(false);

    rerender(<QuotaOrb {...props} compactActive />);
    act(() => vi.advanceTimersByTime(2000));
    expect(container.querySelector(".quota-orb")?.classList.contains("quota-orb--idle")).toBe(true);
  });
});
