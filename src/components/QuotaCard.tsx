import { ArrowClockwise, ArrowDown, ArrowsInSimple, ArrowsOutSimple, ClockCounterClockwise, CloudSlash, Info, PushPin, PushPinSlash, SignIn, WarningCircle } from "@phosphor-icons/react";
import { memo, type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { clampPercent, formatDateTime, formatResetDate, formatResetTime, quotaTier } from "../lib/format";
import { blurProgressSegments } from "../lib/blurSkin";
import { copy, normalizeLanguage } from "../lib/i18n";
import type { Language, Money, ProviderSnapshot, WidgetPreferences, WidgetSkin, WidgetTheme } from "../types";
import { ProviderMark } from "./ProviderMark";
import computerClaudeLogoUrl from "../../assets/computer-claude-logo.svg";
import computerGptLogoUrl from "../../assets/computer-gpt-logo.svg";
import computerOrbBaseUrl from "../../assets/computer-orb-base.svg";
import computerOrbHealthyUrl from "../../assets/computer-orb-screen-healthy.svg";
import computerOrbCautionUrl from "../../assets/computer-orb-screen-caution.svg";
import computerOrbCriticalUrl from "../../assets/computer-orb-screen-critical.svg";
import computerErrorUnavailableUrl from "../../assets/computer-error-unavailable.svg";
import computerErrorStaleUrl from "../../assets/computer-error-stale.svg";
import computerErrorSignedOutUrl from "../../assets/computer-error-signedout.svg";
import computerOrbErrorScreenUrl from "../../assets/computer-orb-screen-error.svg";
import computerOrbGptUrl from "../../assets/computer-orb-gpt.svg";
import nexusUnavailableUrl from "../../assets/Nexus-icon-unavailable.svg";
import nexusDataExpiredUrl from "../../assets/Nexus-icon-dataexpired.svg";
import nexusLoginUrl from "../../assets/Nexus-icon-login.svg";

interface Props {
  snapshot: ProviderSnapshot;
  preferences: WidgetPreferences;
  providerCount: number;
  onNext: () => void;
  onTogglePin: () => void;
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
  providerMarkVariant?: "default" | "glass";
  nexusPreview?: boolean;
  style?: CSSProperties;
}

function StatusIcon({ status, expired = false }: { status: ProviderSnapshot["status"]; expired?: boolean }) {
  if (status === "signed_out") return <SignIn weight="duotone" />;
  if (status === "stale" || expired) return <ClockCounterClockwise weight="duotone" />;
  if (status === "unavailable") return <CloudSlash weight="duotone" />;
  return <WarningCircle weight="duotone" />;
}

function ComputerErrorArtwork({ status }: { status: ProviderSnapshot["status"] }) {
  const src = status === "signed_out"
    ? computerErrorSignedOutUrl
    : status === "stale"
      ? computerErrorStaleUrl
      : computerErrorUnavailableUrl;
  return <img className={`computer-error-artwork computer-error-artwork--${status}`} src={src} alt="" />;
}

function NexusErrorArtwork({ status }: { status: ProviderSnapshot["status"] }) {
  const src = status === "signed_out"
    ? nexusLoginUrl
    : status === "stale"
      ? nexusDataExpiredUrl
      : nexusUnavailableUrl;
  return <div className={`nexus-error-decoration nexus-error-decoration--${status}`} aria-hidden="true">
    <span className="nexus-error-lettering">{status === "signed_out" ? "LOG IN" : status === "stale" ? <><span>DATA</span><span>EXPIRED</span></> : "UNAVAILABLE"}</span>
    <img className="nexus-error-artwork" src={src} alt="" />
  </div>;
}

function providerName(snapshot: ProviderSnapshot): string {
  if (snapshot.provider === "claude" || snapshot.provider === "claude_api") return "Claude";
  if (snapshot.provider === "openai_api") return "OpenAI";
  return "Codex";
}

function localizedBackendMessage(message: string | null, language: Language, provider: string): string | null {
  if (!message) return null;
  if (language === "en") return message;
  const normalized = message.toLowerCase();
  if (normalized.includes("sign in") || normalized.includes("login")) return `${provider} 登录已失效，请重新登录。`;
  if (normalized.includes("rate limited")) return "请求过于频繁，将稍后自动重试。";
  if (normalized.includes("network")) return "网络不可用，将自动重试。";
  if (normalized.includes("format")) return "额度响应格式已变化。";
  if (normalized.includes("missing the 5h")) return "额度响应缺少 5 小时窗口。";
  if (normalized.includes("refresh is already running")) return "额度正在刷新，请稍候。";
  return message;
}

function MoneyValue({ value, language, main = false }: { value: Money; language: Language; main?: boolean }) {
  try {
    const parts = new Intl.NumberFormat(language, { style: "currency", currency: value.currency, currencyDisplay: "narrowSymbol", maximumFractionDigits: 2 }).formatToParts(value.amount);
    const currency = parts.filter((part) => part.type === "currency").map((part) => part.value).join("");
    const number = parts.filter((part) => part.type !== "currency" && part.type !== "literal").map((part) => part.value).join("");
    return main
      ? <><small className="api-cost-currency">{currency}</small><span>{number}</span></>
      : <><small>{currency}</small>{number}</>;
  } catch {
    return main
      ? <><small className="api-cost-currency">{value.currency}</small><span>{value.amount.toFixed(2)}</span></>
      : <><small>{value.currency}</small>{value.amount.toFixed(2)}</>;
  }
}

function compactAmount(value: Money, language: Language): string {
  try {
    return new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value.amount);
  } catch {
    return value.amount.toFixed(2);
  }
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
  providerCount,
  onNext,
  onTogglePin: _onTogglePin,
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
  providerMarkVariant = "default",
  nexusPreview = false,
  style,
}: Props) {
  const [showCreditTip, setShowCreditTip] = useState(initialShowCreditTip);
  const language = normalizeLanguage(preferences.language);
  const t = copy[language];
  const provider = providerName(snapshot);
  const isCostCard = Boolean(snapshot.monthCost && snapshot.dayCost);
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
  const message = localizedBackendMessage(snapshot.message, language, provider);
  const headerTitle = isCostCard ? snapshot.displayName.replace(/\s+/g, "·") : skin === "computer" ? `${snapshot.displayName.toLowerCase()}·${(snapshot.plan ?? "plus").toLowerCase()}` : `${snapshot.displayName} · ${snapshot.plan ?? t.accountFallback}`;
  const headerSubtitle = isCostCard ? t.todayApiCostLabel : displayingWeeklyAsPrimary ? t.weeklyShortRemaining : t.shortRemaining;
  const creditExpirations = useMemo(() => (snapshot.resetCreditExpiresAt ?? []).map((value, index) => {
    return t.creditItem(index, formatDateTime(value, language));
  }), [language, snapshot.resetCreditExpiresAt, t]);
  const providerClass = snapshot.provider === "claude" || snapshot.provider === "claude_api" ? " provider--claude" : "";
  const computerProviderLogoUrl = providerClass ? computerClaudeLogoUrl : computerGptLogoUrl;
  const computerProviderLogoAlt = providerClass ? "Claude" : "GPT";

  return (
    <main
      className={`quota-card quota-card--${snapshot.status} quota-card--${tier}${providerClass}${theme ? ` quota-card--theme-${theme}` : ""}${skin === "blur" ? " quota-card--skin-blur" : ""}${skin === "computer" ? " quota-card--skin-computer" : ""}`}
      style={style}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onMouseDown={(event) => { if (event.button === 0) void onDrag(); }}
    >
      <div className="aurora" aria-hidden="true" />
      {nexusPreview && available ? <div className="nexus-quota-float" aria-hidden="true" /> : null}
      <span className="sr-only" aria-live="polite">{available && displayPercent !== null ? (displayingWeeklyAsPrimary ? t.weeklyAvailableLabel(displayPercent) : t.availableLabel(displayPercent)) : message}</span>
      {notice ? <div className="operation-notice" role="status">{notice}</div> : null}
      <header className="card-header">
        <div>
          <p className="eyebrow">{headerTitle}</p>
          {snapshot.status !== "stale" && (!nexusPreview || available) ? <p className="updated">{headerSubtitle}</p> : null}
        </div>
        {!preferences.locked ? (
          <nav className="card-actions" aria-label={t.controls} onMouseDown={(event) => event.stopPropagation()}>
            {providerCount > 1 ? <button onClick={onNext} aria-label={t.serviceNext}><ArrowDown /></button> : null}
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

      {isCostCard && snapshot.status === "ok" ? (
        <section className="api-cost-card" aria-label={t.monthApiCost}>
          <section className="primary-metric api-cost-metric"><MoneyValue value={snapshot.dayCost!} language={language} main /></section>
          <footer className="card-footer">
            <div className="weekly-metric">
              <p>{t.monthApiCost}</p>
              <strong className="api-cost-weekly-value"><MoneyValue value={snapshot.monthCost!} language={language} /></strong>
              <div className="reset-credit-row"><span>{t.syncedAt(formatDateTime(snapshot.updatedAt, language))}</span></div>
            </div>
            {skin === "blur" ? null : skin === "computer" ? <div className="computer-gpt-mark"><img src={computerProviderLogoUrl} alt={computerProviderLogoAlt} /></div> : <ProviderMark provider={snapshot.provider} variant={providerMarkVariant} nexusPercent={nexusPreview ? null : undefined} />}
          </footer>
        </section>
      ) : available && displayPercent !== null ? (
        <>
          <section className="primary-metric" aria-label={displayingWeeklyAsPrimary ? t.weeklyAvailableLabel(displayPercent) : t.availableLabel(displayPercent)}>
            <span>{displayPercent}</span><small>%</small>
          </section>
          {skin === "blur"
            ? <BlurProgress percent={displayPercent} label={displayingWeeklyAsPrimary ? t.weeklyAvailableLabel(displayPercent) : t.availableLabel(displayPercent)} />
            : skin === "computer"
              ? <ComputerProgress percent={displayPercent} label={displayingWeeklyAsPrimary ? t.weeklyAvailableLabel(displayPercent) : t.availableLabel(displayPercent)} />
            : <div className="progress" role="progressbar" aria-label={displayingWeeklyAsPrimary ? t.weeklyAvailableLabel(displayPercent) : t.availableLabel(displayPercent)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={displayPercent}><span style={{ width: `${displayPercent}%` }} /></div>}
          <p className="reset-time">{formatResetTime(displayWindow?.resetsAt ?? null, new Date(), language)}{displayWindow?.resetsAt ? ` · ${formatDateTime(displayWindow.resetsAt, language)}` : ""}</p>
          <footer className="card-footer">
            <div className="weekly-metric">
              {displayingWeeklyAsPrimary ? <p className="weekly-note"><Info weight="bold" aria-hidden="true" />{t.shortWindowUnavailable}</p> : <p>{t.weeklyUntil(formatResetDate(snapshot.weeklyWindow?.resetsAt ?? null, language))}</p>}
              <strong className={displayingWeeklyAsPrimary ? "weekly-value--unavailable" : undefined}>{displayingWeeklyAsPrimary ? "--" : weekly ?? "--"}<small>{displayingWeeklyAsPrimary || weekly === null ? "" : "%"}</small></strong>
              <div className="reset-credit-row" onMouseDown={(event) => event.stopPropagation()}>
                <span>{snapshot.resetCredits === null ? t.resetCreditUnknown : t.resetCredits(snapshot.resetCredits)}</span>
                {snapshot.resetCredits !== null && snapshot.resetCredits > 0 ? (
                  <button type="button" className="reset-credit-button" onClick={() => setShowCreditTip((value) => !value)} aria-expanded={showCreditTip} aria-label={t.view}>{t.view}</button>
                ) : null}
              </div>
              {showCreditTip ? (
                <div className="reset-credit-tip" role="status" onMouseDown={(event) => event.stopPropagation()}>
                  {creditExpirations.length > 0 ? creditExpirations.map((item) => <p key={item}>{item}</p>) : <p>{t.noCreditExpiration}</p>}
                </div>
              ) : null}
            </div>
            {skin === "blur" ? null : skin === "computer" ? <div className="computer-gpt-mark"><img src={computerProviderLogoUrl} alt={computerProviderLogoAlt} /></div> : <ProviderMark provider={snapshot.provider} variant={providerMarkVariant} nexusPercent={nexusPreview ? displayPercent : undefined} />}
          </footer>
        </>
      ) : (
        <section className="error-state" aria-live="polite">
          {nexusPreview ? <NexusErrorArtwork status={snapshot.status} /> : skin === "computer"
            ? <div className="status-icon status-icon--computer" aria-hidden="true"><ComputerErrorArtwork status={snapshot.status} /></div>
            : <div className="status-icon" aria-hidden="true"><StatusIcon status={snapshot.status} expired={staleExpired} /></div>}
          <strong>{snapshot.status === "signed_out" ? t.signedInRequired(provider) : staleExpired ? t.staleExpired : t.temporarilyUnavailable}</strong>
          {nexusPreview ? null : <p>{message ?? t.errorUnavailable}</p>}
          {snapshot.status === "stale" && !nexusPreview ? (
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
  const primary = snapshot.shortWindow ? clampPercent(snapshot.shortWindow.remainingPercent) : null;
  const weekly = snapshot.weeklyWindow ? clampPercent(snapshot.weeklyWindow.remainingPercent) : null;
  const displayPercent = primary ?? weekly;
  const isCostCard = Boolean(snapshot.monthCost && snapshot.dayCost);
  const displayingWeeklyAsPrimary = primary === null && weekly !== null;
  const tier = quotaTier(displayPercent);
  const available = snapshot.status === "ok" && (isCostCard || displayPercent !== null);
  const computerScreen = tier === "caution"
    ? computerOrbCautionUrl
    : tier === "critical"
      ? computerOrbCriticalUrl
      : computerOrbHealthyUrl;
  const computerOrbErrorSymbol = snapshot.status === "signed_out"
    ? computerOrbGptUrl
    : snapshot.status === "stale"
      ? computerErrorStaleUrl
      : computerErrorUnavailableUrl;
  const providerClass = snapshot.provider === "claude" || snapshot.provider === "claude_api" ? " provider--claude" : "";

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
      className={`quota-orb quota-card--${snapshot.status} quota-card--${tier}${providerClass}${theme ? ` quota-orb--theme-${theme}` : ""}${skin === "blur" ? " quota-orb--skin-blur" : ""}${skin === "computer" ? " quota-orb--skin-computer" : ""}${displayingWeeklyAsPrimary ? " quota-orb--weekly" : ""}${idle ? " quota-orb--idle" : ""}`}
      style={style}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => onHover(false)}
      onMouseDown={(event) => { if (event.button === 0) void onDrag(); }}
      aria-label={available ? (isCostCard ? t.todayApiCost(compactAmount(snapshot.dayCost!, activeLanguage)) : displayingWeeklyAsPrimary ? t.weeklyAvailableLabel(displayPercent!) : t.availableLabel(displayPercent!)) : localizedBackendMessage(snapshot.message, activeLanguage, providerName(snapshot)) ?? t.unavailableStatus}
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
          {isCostCard ? <span className="orb-cost-value">{compactAmount(snapshot.dayCost!, activeLanguage)}</span> : <><span>{displayPercent}</span>{skin !== "computer" ? <small>%</small> : null}</>}
        </section>
      ) : (
        <section className="orb-unavailable">
          {skin === "computer"
            ? <img className={`computer-orb-error-symbol computer-orb-error-symbol--${snapshot.status}`} src={computerOrbErrorSymbol} alt="" aria-hidden="true" />
            : <StatusIcon status={snapshot.status} />}
        </section>
      )}
    </main>
  );
});
