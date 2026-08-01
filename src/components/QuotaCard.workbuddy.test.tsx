// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuotaCard } from "./QuotaCard";
import type { ProviderSnapshot, WidgetPreferences } from "../types";

const preferences: WidgetPreferences = {
  locked: false, alwaysOnTop: true, stayExpanded: false, pinnedProvider: "workbuddy",
  autoRotateSeconds: 12, language: "en", appearance: "system",
  license: null, licenses: [], unlockedSkin: null, unlockedSkins: [], selectedSkin: "default",
};

const snapshot: ProviderSnapshot = {
  provider: "workbuddy", displayName: "WORKBUDDY", plan: "CodeBuddy个人体验版",
  shortWindow: { remainingPercent: 0, resetsAt: null, windowSeconds: 2_592_000 },
  weeklyWindow: { remainingPercent: 0, resetsAt: null, windowSeconds: 604_800 },
  resetCredits: null, resetCreditExpiresAt: [],
  workbuddy: { monthlyRemaining: 0, monthlyTotal: 500, addonRemaining: 2086, addonTotal: 2086, expiringAddonRemaining: 186, expiringAddonExpiresAt: "2026-08-04T23:54:00+08:00" },
  updatedAt: new Date().toISOString(), status: "ok", message: null,
};

const noop = () => {};

describe("workbuddy card display", () => {
  it("strips the provider prefix from the plan label", () => {
    const { container } = render(<QuotaCard snapshot={snapshot} preferences={preferences} onLock={noop} onToggleStayExpanded={noop} onDrag={noop} onHover={noop} />);
    expect(container.querySelector(".eyebrow")?.textContent).toBe("WORKBUDDY · 个人体验版");
  });

  it("falls back when the plan is only the provider name", () => {
    const { container } = render(<QuotaCard snapshot={{ ...snapshot, plan: "workbuddy" }} preferences={preferences} onLock={noop} onToggleStayExpanded={noop} onDrag={noop} onHover={noop} />);
    expect(container.querySelector(".eyebrow")?.textContent).toBe("WORKBUDDY · ACCOUNT");
  });

  it("renders the monthly total smaller via a dedicated element", () => {
    const { container } = render(<QuotaCard snapshot={snapshot} preferences={preferences} onLock={noop} onToggleStayExpanded={noop} onDrag={noop} onHover={noop} />);
    const metric = container.querySelector(".primary-metric--points span");
    expect(metric?.textContent).toBe("0 / 500");
    expect(container.querySelector(".points-total")?.textContent).toBe(" / 500");
  });

  it("keeps the monthly label on a single line", () => {
    const { container } = render(<QuotaCard snapshot={snapshot} preferences={preferences} onLock={noop} onToggleStayExpanded={noop} onDrag={noop} onHover={noop} />);
    expect(container.querySelector(".workbuddy-monthly-label")?.textContent).toBe("Monthly points");
  });

  it("moves the monthly reset copy below the progress bar", () => {
    const { container } = render(<QuotaCard snapshot={snapshot} preferences={preferences} onLock={noop} onToggleStayExpanded={noop} onDrag={noop} onHover={noop} />);
    expect(container.querySelector(".updated")?.textContent).toBe("Monthly points");
    expect(container.querySelector(".updated")?.textContent).not.toContain("Resets on the 1st");
    expect(container.querySelector(".reset-time")?.textContent).toContain("Resets on the 1st of each month");
  });

  it("renders the addon points and expiry in the footer", () => {
    const { container } = render(<QuotaCard snapshot={snapshot} preferences={preferences} onLock={noop} onToggleStayExpanded={noop} onDrag={noop} onHover={noop} />);
    expect(container.querySelector(".weekly-metric strong")?.textContent).toBe("2,086");
    expect(container.querySelector(".reset-credit-row")?.textContent).toContain("186 points expire");
  });

  it("hides the expiring addon info when the remaining points are zero", () => {
    const { container } = render(
      <QuotaCard snapshot={{ ...snapshot, workbuddy: { ...snapshot.workbuddy!, expiringAddonRemaining: 0 } }} preferences={preferences} onLock={noop} onToggleStayExpanded={noop} onDrag={noop} onHover={noop} />
    );
    expect(container.querySelector(".reset-credit-row")?.textContent).not.toContain("points expire");
    expect(container.querySelector(".reset-credit-row")?.textContent).toContain("No add-on expiration is available");
  });

  it("shows the provider switch arrows on the card edges when switching is available", () => {
    const { container } = render(
      <QuotaCard snapshot={snapshot} preferences={preferences} canSwitch onPrevious={noop} onNext={noop} onLock={noop} onToggleStayExpanded={noop} onDrag={noop} onHover={noop} />
    );
    expect(container.querySelector(".provider-switch--prev")?.getAttribute("aria-label")).toBe("Previous service");
    expect(container.querySelector(".provider-switch--next")?.getAttribute("aria-label")).toBe("Next service");
  });

  it("hides the provider switch arrows when fewer than two providers are selectable", () => {
    const { container } = render(
      <QuotaCard snapshot={snapshot} preferences={preferences} onLock={noop} onToggleStayExpanded={noop} onDrag={noop} onHover={noop} />
    );
    expect(container.querySelector(".provider-switch--prev")).toBeNull();
    expect(container.querySelector(".provider-switch--next")).toBeNull();
  });
});
