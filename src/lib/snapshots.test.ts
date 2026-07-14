import { describe, expect, it } from "vitest";
import type { ProviderSnapshot } from "../types";
import { mergeSnapshots } from "./snapshots";

const success: ProviderSnapshot = {
  provider: "codex",
  displayName: "CODEX",
  plan: "PRO",
  weeklyWindow: { remainingPercent: 42, resetsAt: "2026-07-10T00:00:00Z", windowSeconds: 604_800 },
  resetCredits: 1,
  updatedAt: "2026-07-07T00:00:00Z",
  status: "ok",
  message: null,
};

describe("snapshot failure handling", () => {
  it("retains the last successful values during a transient failure", () => {
    const failure: ProviderSnapshot = { ...success, weeklyWindow: null, status: "unavailable", message: "Network unavailable", updatedAt: "2026-07-07T01:00:00Z" };
    expect(mergeSnapshots([success], [failure])[0]).toEqual({ ...success, status: "stale", message: "Network unavailable" });
  });

  it("shows a failure when no successful snapshot exists", () => {
    const signedOut: ProviderSnapshot = { ...success, weeklyWindow: null, status: "signed_out", message: "Please sign in" };
    expect(mergeSnapshots([], [signedOut])[0].status).toBe("signed_out");
  });

  it("does not hide an expired login behind stale quota data", () => {
    const signedOut: ProviderSnapshot = { ...success, weeklyWindow: null, status: "signed_out", message: "Please sign in" };
    expect(mergeSnapshots([success], [signedOut])[0].status).toBe("signed_out");
  });

  it("replaces stale data after recovery", () => {
    expect(mergeSnapshots([{ ...success, status: "stale" }], [{ ...success, weeklyWindow: { ...success.weeklyWindow!, remainingPercent: 88 } }])[0].weeklyWindow?.remainingPercent).toBe(88);
  });
});
