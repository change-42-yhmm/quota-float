// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuotaCard } from "./QuotaCard";
import type { ProviderSnapshot, WidgetPreferences } from "../types";

const preferences: WidgetPreferences = {
  locked: false, alwaysOnTop: true, stayExpanded: false, pinnedProvider: "codex",
  autoRotateSeconds: 12, language: "en", appearance: "system",
  license: null, licenses: [], unlockedSkin: null, unlockedSkins: [], selectedSkin: "default",
};

const snapshot: ProviderSnapshot = {
  provider: "codex", displayName: "CODEX", plan: "PRO",
  shortWindow: { remainingPercent: 74, resetsAt: new Date(Date.now() + 78 * 60_000).toISOString(), windowSeconds: 18_000 },
  weeklyWindow: { remainingPercent: 42, resetsAt: new Date(Date.now() + 3.2 * 86_400_000).toISOString(), windowSeconds: 604_800 },
  resetCredits: 2, resetCreditExpiresAt: [],
  updatedAt: new Date().toISOString(), status: "ok", message: null,
};

const noop = () => {};

describe("codex card display", () => {
  it("renders the percent metric with the plan eyebrow", () => {
    const { container } = render(<QuotaCard snapshot={snapshot} preferences={preferences} onLock={noop} onToggleStayExpanded={noop} onDrag={noop} onHover={noop} />);
    expect(container.querySelector(".eyebrow")?.textContent).toBe("CODEX · PRO");
    expect(container.querySelector(".primary-metric")?.textContent).toBe("74%");
    expect(container.querySelector(".points-total")).toBeNull();
  });

  it("renders the weekly footer with reset credits", () => {
    const { container } = render(<QuotaCard snapshot={snapshot} preferences={preferences} onLock={noop} onToggleStayExpanded={noop} onDrag={noop} onHover={noop} />);
    expect(container.querySelector(".weekly-metric strong")?.textContent).toBe("42%");
    expect(container.querySelector(".reset-credit-row")?.textContent).toContain("2 reset credits");
  });

  it("renders the codex error copy when unavailable", () => {
    const unavailable: ProviderSnapshot = { ...snapshot, status: "unavailable", shortWindow: null, weeklyWindow: null, resetCredits: null, message: null };
    const { container } = render(<QuotaCard snapshot={unavailable} preferences={preferences} onLock={noop} onToggleStayExpanded={noop} onDrag={noop} onHover={noop} />);
    expect(container.querySelector(".error-state strong")?.textContent).toBe("Unavailable");
    expect(container.querySelector(".error-state p")?.textContent).toContain("temporarily unavailable");
  });
});
