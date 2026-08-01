import { ArrowClockwise, ArrowsInSimple, ArrowsOutSimple, ClockCounterClockwise, CloudSlash, PushPin, PushPinSlash, SignIn, WarningCircle } from "@phosphor-icons/react";
import { memo, type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { clampPercent, quotaTier, stripProviderPrefix } from "../lib/format";
import { blurProgressSegments } from "../lib/blurSkin";
import { copy, normalizeLanguage } from "../lib/i18n";
import type { Language, ProviderSnapshot, WidgetPreferences, WidgetSkin, WidgetTheme } from "../types";
import { CodexCardBody, codexErrorCopy, CodexOrbErrorSymbol, ComputerErrorArtwork } from "./CodexCard";
import { formatPoints, WorkBuddyCardBody, workBuddyErrorCopy, WorkBuddySubtitle, workBuddyTotalPoints } from "./WorkBuddyCard";
import computerOrbBaseUrl from "../../assets/computer-orb-base.svg";
import computerOrbHealthyUrl from "../../assets/computer-orb-screen-healthy.svg";
import computerOrbCautionUrl from "../../assets/computer-orb-screen-caution.svg";
import computerOrbCriticalUrl from "../../assets/computer-orb-screen-critical.svg";
import computerOrbErrorScreenUrl from "../../assets/computer-orb-screen-error.svg";

interface Props {
  snapshot: ProviderSnapshot;
  preferences: WidgetPreferences;
  canSwitch?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  onLock: () => void;
  onToggleStayExpanded: () => void;
  onDrag: () => void;
  onHover: (hovered: boolean) => void;
  onRefresh?: () => void;
  isConsuming?: boolean;
  notice?: ReactNode;
  initialShowCreditTip?: boolean;
  theme?: WidgetTheme;
  skin?: WidgetSkin;
  style?: CSSProperties;
}

function StatusIcon({ status, expired = false }: { status: ProviderSnapshot["status"]; expired?: boolean }) {
  if (status === "signed_out") return <SignIn weight="duotone" />;
  if (status === "stale" || expired) return <ClockCounterClockwise weight="duotone" />;
  if (status === "unavailable") return <CloudSlash weight="duotone" />;
  return <WarningCircle weight="duotone" />;
}

// Lucide chevron glyphs (ISC license) — minimal angular marks for provider
// switching, mirroring the 《》 style the design requested.
function ProviderChevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {direction === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

function localizedBackendMessage(message: string | null, language: Language, provider: ProviderSnapshot["provider"]): string | null {
  if (!message) return null;
  if (language === "en") return message;
  const normalized = message.toLowerCase();
  if (normalized.includes("sign in") || normalized.includes("login")) return provider === "workbuddy" ? "WorkBuddy 登录已失效，请重新登录。" : "Codex 登录已失效，请重新登录。";
  if (normalized.includes("rate limited")) return "请求过于频繁，将稍后自动重试。";
  if (normalized.includes("network")) return "网络不可用，将自动重试。";
  if (normalized.includes("format")) return "额度响应格式已变化。";
  if (normalized.includes("missing the 5h")) return "额度响应缺少 5 小时窗口。";
  if (normalized.includes("refresh is already running")) return "额度正在刷新，请稍候。";
  return message;
}

function BlurProgress({ percent, label }: { percent: number; label: string }) {
  const segments = blurProgressSegments(percent);
  const availableCount = segments.filter(Boolean).length;
  return <div className="blur-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
    {segments.map((available, index) => {
      const endWeight = available && availableCount > 1 ? (index / (availableCount - 1)) * 100 : 0;
      return <i key={index} className={available ? "is-available" : "is-used"} style={available ? { "--blur-progress-end-weight": `${endWeight}%` } as CSSProperties : undefined} aria-hidden="true" />;
    })}
  </div>;
}

function ComputerProgress({ percent, label }: { percent: number; label: string }) {
  const segments = 34;
  const available = Math.round((Math.max(0, Math.min(100, percent)) / 100) * segments);
  return <div className="computer-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
    {Array.from({ length: segments }, (_, index) => {
      const endWeight = index < available && available > 1 ? (index / (available - 1)) * 100 : 0;
      return <i key={index} className={index < available ? "is-available" : "is-used"} style={index < available ? { "--computer-progress-end-weight": `${endWeight}%` } as CSSProperties : undefined} aria-hidden="true" />;
    })}
  </div>;
}

export const QuotaCard = memo(function QuotaCard({
  snapshot,
  preferences,
  canSwitch = false,
  onPrevious,
  onNext,
  onLock,
  onToggleStayExpanded,
  onDrag,
  onHover,
  onRefresh,
  isConsuming = false,
  notice = null,
  initialShowCreditTip = false,
  theme,
  skin = "default",
  style,
}: Props) {
  const language = normalizeLanguage(preferences.language);
  const t = copy[language];
  const workbuddy = snapshot.workbuddy ?? null;
  const isWorkBuddy = workbuddy !== null;
  const primary = snapshot.shortWindow ? clampPercent(snapshot.shortWindow.remainingPercent) : null;
  const weekly = snapshot.weeklyWindow ? clampPercent(snapshot.weeklyWindow.remainingPercent) : null;
  const displayPercent = primary ?? weekly;
  const displayWindow = snapshot.shortWindow ?? snapshot.weeklyWindow;
  const displayingWeeklyAsPrimary = primary === null && weekly !== null;
  const staleAge = Date.now() - new Date(snapshot.updatedAt).getTime();
  const staleExpired = snapshot.status === "stale" && staleAge > 30 * 60_000;
  const available = snapshot.status === "ok" || (snapshot.status === "stale" && !staleExpired);
  const tier = quotaTier(displayPercent);
  const indicatorState = isConsuming ? "active" : snapshot.status === "ok" ? "ok" : snapshot.status === "stale" ? "stale" : "error";
  const indicatorLabel = isConsuming
    ? t.active
    : snapshot.status === "ok"
      ? t.dataSynced
      : snapshot.status === "stale"
        ? t.dataStale
        : snapshot.status === "signed_out"
          ? t.notSignedIn
          : t.unavailableStatus;
  const message = localizedBackendMessage(snapshot.message, language, snapshot.provider);
  const primaryLabel = isWorkBuddy ? t.workbuddyMonthlyRemaining : displayingWeeklyAsPrimary ? t.weeklyAvailableLabel(displayPercent ?? 0) : t.availableLabel(displayPercent ?? 0);
  const errorCopy = isWorkBuddy
    ? workBuddyErrorCopy(t, snapshot.status, staleExpired, message)
    : codexErrorCopy(t, snapshot.status, staleExpired, message);
  const planLabel = snapshot.plan ? stripProviderPrefix(snapshot.plan) || t.accountFallback : t.accountFallback;

  const progress = displayPercent === null ? null : skin === "blur"
    ? <BlurProgress percent={displayPercent} label={primaryLabel} />
    : skin === "computer"
      ? <ComputerProgress percent={displayPercent} label={primaryLabel} />
      : <div className="progress" role="progressbar" aria-label={primaryLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={displayPercent}><span style={{ width: `${displayPercent}%` }} /></div>;

  return (
    <main
      className={`quota-card quota-card--${snapshot.status} quota-card--${tier}${isWorkBuddy ? " quota-card--workbuddy" : ""}${theme ? ` quota-card--theme-${theme}` : ""}${skin === "blur" ? " quota-card--skin-blur" : ""}${skin === "computer" ? " quota-card--skin-computer" : ""}`}
      style={style}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onMouseDown={(event) => { if (event.button === 0) void onDrag(); }}
    >
      <div className="aurora" aria-hidden="true" />
      {!preferences.locked && canSwitch && onPrevious && onNext ? (
        <>
          <button type="button" className="provider-switch provider-switch--prev" onClick={onPrevious} onMouseDown={(event) => event.stopPropagation()} aria-label={t.servicePrevious} title={t.servicePrevious}>
            <ProviderChevron direction="left" />
          </button>
          <button type="button" className="provider-switch provider-switch--next" onClick={onNext} onMouseDown={(event) => event.stopPropagation()} aria-label={t.serviceNext} title={t.serviceNext}>
            <ProviderChevron direction="right" />
          </button>
        </>
      ) : null}
      <span className="sr-only" aria-live="polite">{available && displayPercent !== null ? (isWorkBuddy ? t.workbuddyTotalPoints(formatPoints(workBuddyTotalPoints(workbuddy))) : displayingWeeklyAsPrimary ? t.weeklyAvailableLabel(displayPercent) : t.availableLabel(displayPercent)) : message}</span>
      {notice ? <div className="operation-notice" role="status">{notice}</div> : null}
      <header className="card-header">
        <div>
          <p className="eyebrow">{skin === "computer" && !isWorkBuddy ? "codex·plus" : `${snapshot.displayName} · ${planLabel}`}</p>
          {snapshot.status !== "stale" ? <p className="updated">{isWorkBuddy ? <WorkBuddySubtitle t={t} /> : displayingWeeklyAsPrimary ? t.weeklyShortRemaining : t.shortRemaining}</p> : null}
        </div>
        {!preferences.locked ? (
          <nav className="card-actions" aria-label={t.controls} onMouseDown={(event) => event.stopPropagation()}>
            <span className={`usage-indicator usage-indicator--${indicatorState}`} role="status" aria-label={indicatorLabel} title={indicatorLabel}><i /></span>
            <button className={preferences.stayExpanded ? "expand-button expand-button--active" : "expand-button"} onClick={onToggleStayExpanded} aria-pressed={preferences.stayExpanded} aria-label={preferences.stayExpanded ? t.keepExpandedOff : t.keepExpandedOn} title={preferences.stayExpanded ? t.keepExpandedOff : t.keepExpandedOn}>
              {preferences.stayExpanded ? <ArrowsInSimple weight="bold" /> : <ArrowsOutSimple />}
            </button>
            <button className={preferences.alwaysOnTop ? "pin-button pin-button--active" : "pin-button"} onClick={onLock} aria-pressed={preferences.alwaysOnTop} aria-label={preferences.alwaysOnTop ? t.pinOff : t.pinOn} title={preferences.alwaysOnTop ? t.pinOff : t.pinOn}>
              {preferences.alwaysOnTop ? <PushPin weight="fill" /> : <PushPinSlash />}
            </button>
          </nav>
        ) : null}
      </header>

      {available && displayPercent !== null ? (
        isWorkBuddy ? (
          <WorkBuddyCardBody workbuddy={workbuddy} t={t} language={language} skin={skin} primaryLabel={primaryLabel} progress={progress} />
        ) : (
          <CodexCardBody snapshot={snapshot} t={t} language={language} skin={skin} displayPercent={displayPercent} weekly={weekly} displayingWeeklyAsPrimary={displayingWeeklyAsPrimary} displayWindow={displayWindow} primaryLabel={primaryLabel} progress={progress} initialShowCreditTip={initialShowCreditTip} />
        )
      ) : (
        <section className="error-state" aria-live="polite">
          {skin === "computer" && !isWorkBuddy
            ? <div className="status-icon status-icon--computer" aria-hidden="true"><ComputerErrorArtwork status={snapshot.status} /></div>
            : <div className="status-icon" aria-hidden="true"><StatusIcon status={snapshot.status} expired={staleExpired} /></div>}
          <strong>{errorCopy.title}</strong>
          <p>{errorCopy.body}</p>
          {snapshot.status === "stale" ? (
            <button type="button" className="error-refresh-button" onMouseDown={(event) => event.stopPropagation()} onClick={onRefresh} disabled={!onRefresh} aria-label={t.refreshQuota}>
              <ArrowClockwise />
              <span>{t.refresh}</span>
            </button>
          ) : null}
        </section>
      )}
    </main>
  );
});

export const QuotaOrb = memo(function QuotaOrb({ snapshot, onDrag, onHover, language = "zh-CN", theme, skin = "default", style }: Pick<Props, "snapshot" | "onDrag" | "onHover" | "theme" | "skin" | "style"> & { language?: Language }) {
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<number | null>(null);
  const activeLanguage = normalizeLanguage(language);
  const t = copy[activeLanguage];
  const workbuddy = snapshot.workbuddy ?? null;
  const isWorkBuddy = workbuddy !== null;
  const primary = snapshot.shortWindow ? clampPercent(snapshot.shortWindow.remainingPercent) : null;
  const weekly = snapshot.weeklyWindow ? clampPercent(snapshot.weeklyWindow.remainingPercent) : null;
  const displayPercent = primary ?? weekly;
  const displayingWeeklyAsPrimary = primary === null && weekly !== null;
  const tier = quotaTier(displayPercent);
  const available = snapshot.status === "ok" && displayPercent !== null;
  const computerScreen = tier === "caution"
    ? computerOrbCautionUrl
    : tier === "critical"
      ? computerOrbCriticalUrl
      : computerOrbHealthyUrl;

  useEffect(() => {
    idleTimer.current = window.setTimeout(() => setIdle(true), 2000);
    return () => {
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    setIdle(false);
    onHover(true);
  };

  return (
    <main
      className={`quota-orb quota-card--${snapshot.status} quota-card--${tier}${isWorkBuddy ? " quota-orb--workbuddy" : ""}${theme ? ` quota-orb--theme-${theme}` : ""}${skin === "blur" ? " quota-orb--skin-blur" : ""}${skin === "computer" ? " quota-orb--skin-computer" : ""}${displayingWeeklyAsPrimary ? " quota-orb--weekly" : ""}${idle ? " quota-orb--idle" : ""}`}
      style={style}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => onHover(false)}
      onMouseDown={(event) => { if (event.button === 0) void onDrag(); }}
      aria-label={available ? (isWorkBuddy ? t.workbuddyTotalPoints(formatPoints(workBuddyTotalPoints(workbuddy))) : displayingWeeklyAsPrimary ? t.weeklyAvailableLabel(displayPercent!) : t.availableLabel(displayPercent!)) : localizedBackendMessage(snapshot.message, activeLanguage, snapshot.provider) ?? (isWorkBuddy ? t.workbuddyErrorUnavailable : t.unavailableStatus)}
    >
      <div className="aurora" aria-hidden="true" />
      {skin === "computer" ? <img className="computer-orb-base" src={computerOrbBaseUrl} alt="" aria-hidden="true" /> : null}
      {skin === "computer" ? <img className="computer-orb-screen" src={available ? computerScreen : computerOrbErrorScreenUrl} alt="" aria-hidden="true" /> : null}
      {available && displayingWeeklyAsPrimary && skin !== "computer" ? (
        <span className="orb-weekly-badge" aria-hidden="true">
          <svg viewBox="0 0 55 17" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7.3687 52.2894C13.0674 47.8486 17 38.4172 17 27.5C17 16.5828 13.0674 7.15141 7.3687 2.71063C3.88364 -0.00516105 0 3.58172 0 8L0 47C0 51.4183 3.88364 55.0052 7.3687 52.2894Z" fill="currentColor" transform="matrix(0 1 -1 0 55 0)" />
          </svg>
          <b>W</b>
        </span>
      ) : null}
      {available ? (
        <section className="orb-metric">
          <span>{isWorkBuddy ? formatPoints(workBuddyTotalPoints(workbuddy)) : displayPercent}</span>
          {!isWorkBuddy && skin !== "computer" ? <small>%</small> : null}
        </section>
      ) : (
        <section className="orb-unavailable">
          {skin === "computer" && !isWorkBuddy
            ? <CodexOrbErrorSymbol status={snapshot.status} />
            : <StatusIcon status={snapshot.status} />}
        </section>
      )}
    </main>
  );
});
