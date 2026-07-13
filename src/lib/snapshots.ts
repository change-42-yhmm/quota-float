import type { ProviderSnapshot } from "../types";

export function mergeSnapshots(current: ProviderSnapshot[], incoming: ProviderSnapshot[]): ProviderSnapshot[] {
  return incoming.map((next) => {
    if (next.status === "ok") return next;
    if (next.status === "signed_out") return next;
    const previous = current.find((item) => item.provider === next.provider && item.weeklyWindow);
    return previous
      ? { ...previous, status: "stale", message: next.message, updatedAt: previous.updatedAt }
      : next;
  });
}
