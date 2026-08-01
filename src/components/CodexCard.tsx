import { Info } from "@phosphor-icons/react";
import { useMemo, useState, type ReactNode } from "react";
import { formatDateTime, formatResetDate, formatResetTime } from "../lib/format";
import type { Copy } from "../lib/i18n";
import type { Language, ProviderSnapshot, SnapshotStatus, UsageWindow, WidgetSkin } from "../types";
import { ProviderMark } from "./ProviderMark";
import computerGptLogoUrl from "../../assets/computer-gpt-logo.svg";
import computerErrorUnavailableUrl from "../../assets/computer-error-unavailable.svg";
import computerErrorStaleUrl from "../../assets/computer-error-stale.svg";
import computerErrorSignedOutUrl from "../../assets/computer-error-signedout.svg";
import computerOrbGptUrl from "../../assets/computer-orb-gpt.svg";

export function ComputerErrorArtwork({ status }: { status: SnapshotStatus }) {
  const src = status === "signed_out"
    ? computerErrorSignedOutUrl
    : status === "stale"
      ? computerErrorStaleUrl
      : computerErrorUnavailableUrl;
  return <img className={`computer-error-artwork computer-error-artwork--${status}`} src={src} alt="" />;
}

export function CodexOrbErrorSymbol({ status }: { status: SnapshotStatus }) {
  const src = status === "signed_out"
    ? computerOrbGptUrl
    : status === "stale"
      ? computerErrorStaleUrl
      : computerErrorUnavailableUrl;
  return <img className={`computer-orb-error-symbol computer-orb-error-symbol--${status}`} src={src} alt="" aria-hidden="true" />;
}

interface BodyProps {
  snapshot: ProviderSnapshot;
  t: Copy;
  language: Language;
  skin: WidgetSkin;
  displayPercent: number;
  weekly: number | null;
  displayingWeeklyAsPrimary: boolean;
  displayWindow: UsageWindow | null;
  primaryLabel: string;
  progress: ReactNode;
  initialShowCreditTip: boolean;
}

export function CodexCardBody({ snapshot, t, language, skin, displayPercent, weekly, displayingWeeklyAsPrimary, displayWindow, primaryLabel, progress, initialShowCreditTip }: BodyProps) {
  const [showCreditTip, setShowCreditTip] = useState(initialShowCreditTip);
  const creditExpirations = useMemo(() => (snapshot.resetCreditExpiresAt ?? []).map((value, index) => {
    return t.creditItem(index, formatDateTime(value, language));
  }), [language, snapshot.resetCreditExpiresAt, t]);
  return (
    <>
      <section className="primary-metric" aria-label={primaryLabel}>
        <span>{displayPercent}</span><small>%</small>
      </section>
      {progress}
      <p className="reset-time">{`${formatResetTime(displayWindow?.resetsAt ?? null, new Date(), language)}${displayWindow?.resetsAt ? ` · ${formatDateTime(displayWindow.resetsAt, language)}` : ""}`}</p>
      <footer className="card-footer">
        <div className="weekly-metric">
          {displayingWeeklyAsPrimary ? <p className="weekly-note"><Info weight="bold" aria-hidden="true" />{t.shortWindowUnavailable}</p> : <p>{t.weeklyUntil(formatResetDate(snapshot.weeklyWindow?.resetsAt ?? null, language))}</p>}
          <strong className={displayingWeeklyAsPrimary ? "weekly-value--unavailable" : undefined}>{displayingWeeklyAsPrimary ? "--" : weekly ?? "--"}<small>{displayingWeeklyAsPrimary || weekly === null ? "" : "%"}</small></strong>
          <div className="reset-credit-row" onMouseDown={(event) => event.stopPropagation()}>
            <span>{snapshot.resetCredits === null ? t.resetCreditUnknown : t.resetCredits(snapshot.resetCredits)}</span>
            {snapshot.resetCredits !== null && snapshot.resetCredits > 0 ? <button type="button" className="reset-credit-button" onClick={() => setShowCreditTip((value) => !value)} aria-expanded={showCreditTip} aria-label={t.view}>{t.view}</button> : null}
          </div>
          {showCreditTip ? <div className="reset-credit-tip" role="status" onMouseDown={(event) => event.stopPropagation()}>{creditExpirations.length > 0 ? creditExpirations.map((item) => <p key={item}>{item}</p>) : <p>{t.noCreditExpiration}</p>}</div> : null}
        </div>
        {skin === "blur" ? null : skin === "computer" ? <div className="computer-gpt-mark"><img src={computerGptLogoUrl} alt="GPT" /></div> : <ProviderMark />}
      </footer>
    </>
  );
}

export function codexErrorCopy(t: Copy, status: SnapshotStatus, staleExpired: boolean, message: string | null): { title: string; body: string } {
  return {
    title: status === "signed_out" ? t.signedInRequired : staleExpired ? t.staleExpired : t.temporarilyUnavailable,
    body: message ?? t.errorUnavailable,
  };
}
