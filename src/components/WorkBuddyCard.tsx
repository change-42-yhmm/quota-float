import type { ReactNode } from "react";
import { formatDateTime } from "../lib/format";
import type { Copy } from "../lib/i18n";
import type { Language, SnapshotStatus, WidgetSkin, WorkBuddyPoints } from "../types";
import workBuddyLogoUrl from "../../assets/workbuddy.svg";

const pointFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
export const formatPoints = (value: number) => pointFormatter.format(value);

export function workBuddyTotalPoints(workbuddy: WorkBuddyPoints): number {
  return workbuddy.monthlyRemaining + workbuddy.addonRemaining;
}

export function WorkBuddySubtitle({ t }: { t: Copy }) {
  return <span className="workbuddy-monthly-label">{t.workbuddyMonthlyRemaining}</span>;
}

interface BodyProps {
  workbuddy: WorkBuddyPoints;
  t: Copy;
  language: Language;
  skin: WidgetSkin;
  primaryLabel: string;
  progress: ReactNode;
}

export function WorkBuddyCardBody({ workbuddy, t, language, skin, primaryLabel, progress }: BodyProps) {
  const expiry = workbuddy.expiringAddonRemaining !== null && workbuddy.expiringAddonRemaining > 0 && workbuddy.expiringAddonExpiresAt
    ? t.workbuddyExpires(formatPoints(workbuddy.expiringAddonRemaining), formatDateTime(workbuddy.expiringAddonExpiresAt, language))
    : t.workbuddyNoExpiringAddon;
  return (
    <>
      <section className="primary-metric primary-metric--points" aria-label={primaryLabel}>
        <span>{formatPoints(workbuddy.monthlyRemaining)}<small className="points-total"> / {formatPoints(workbuddy.monthlyTotal)}</small></span>
      </section>
      {progress}
      <p className="reset-time">{t.workbuddyMonthlyReset}</p>
      <footer className="card-footer">
        <div className="weekly-metric">
          <p>{t.workbuddyAddonPoints}</p>
          <strong>{formatPoints(workbuddy.addonRemaining)}</strong>
          <div className="reset-credit-row"><span>{expiry}</span></div>
        </div>
        {skin === "blur" ? null : <div className="workbuddy-mark" aria-hidden="true"><img src={workBuddyLogoUrl} alt="" /></div>}
      </footer>
    </>
  );
}

export function workBuddyErrorCopy(t: Copy, status: SnapshotStatus, staleExpired: boolean, message: string | null): { title: string; body: string } {
  return {
    title: status === "signed_out" ? t.workbuddySignInRequired : staleExpired ? t.staleExpired : t.temporarilyUnavailable,
    body: message ?? t.workbuddyErrorUnavailable,
  };
}
