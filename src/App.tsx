import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QuotaCard, QuotaOrb } from "./components/QuotaCard";
import { fetchSnapshots, getPreferences, listenDesktopEvents, setWidgetExpanded, updatePreferences } from "./lib/bridge";
import { needsFastRefresh } from "./lib/format";
import { copy, nextLanguage, normalizeLanguage } from "./lib/i18n";
import { mergeSnapshots } from "./lib/snapshots";
import type { ProviderSnapshot, WidgetPreferences } from "./types";

const DEFAULT_PREFS: WidgetPreferences = { locked: false, panelVisible: true, expanded: true, alwaysOnTop: true, pinnedProvider: null, autoRotateSeconds: 12, language: "zh-CN" };

export default function App() {
  const [snapshots, setSnapshots] = useState<ProviderSnapshot[]>([]);
  const [preferences, setPreferences] = useState(DEFAULT_PREFS);
  const [activeIndex, setActiveIndex] = useState(0);
  const [consumingProviders, setConsumingProviders] = useState<Set<string>>(() => new Set());
  const [operationError, setOperationError] = useState<string | null>(null);
  const [resizing, setResizing] = useState(false);
  const failures = useRef(0);
  const resizeInFlight = useRef(false);
  const focusAfterResize = useRef<boolean | null>(null);
  const previousWeekly = useRef(new Map<string, number>());
  const consumptionTimers = useRef(new Map<string, number>());
  const language = normalizeLanguage(preferences.language);
  const t = copy[language];

  const refresh = useCallback(async (force = false) => {
    try {
      const values = await fetchSnapshots(force);
      const hasFailure = values.some((item) => item.status !== "ok");
      if (hasFailure) failures.current += 1;
      else failures.current = 0;
      for (const item of values) {
        const nextWeekly = item.weeklyWindow?.remainingPercent;
        const previous = previousWeekly.current.get(item.provider);
        if (nextWeekly !== undefined && previous !== undefined && nextWeekly < previous) {
          setConsumingProviders((current) => new Set(current).add(item.provider));
          const oldTimer = consumptionTimers.current.get(item.provider);
          if (oldTimer !== undefined) window.clearTimeout(oldTimer);
          const timer = window.setTimeout(() => {
            setConsumingProviders((current) => { const next = new Set(current); next.delete(item.provider); return next; });
            consumptionTimers.current.delete(item.provider);
          }, 5 * 60_000);
          consumptionTimers.current.set(item.provider, timer);
        }
        if (nextWeekly !== undefined) previousWeekly.current.set(item.provider, nextWeekly);
      }
      setSnapshots((current) => mergeSnapshots(current, values));
    } catch {
      failures.current += 1;
      setSnapshots((current) => current.length > 0
        ? current.map((item) => ({ ...item, status: "stale", message: "Refresh failed. Please try again later." }))
        : [{ provider: "codex", displayName: "CODEX", plan: null, weeklyWindow: null, resetCredits: null, resetCreditExpiresAt: [], updatedAt: new Date().toISOString(), status: "unavailable", message: "Quota is temporarily unavailable. It will retry automatically." }]);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
    void getPreferences().then((value) => {
      const next = { ...DEFAULT_PREFS, ...value, language: normalizeLanguage(value.language) };
      setPreferences(next);
    }).catch(() => setOperationError("Unable to read settings. Defaults are in use."));
    return () => { for (const timer of consumptionTimers.current.values()) window.clearTimeout(timer); consumptionTimers.current.clear(); };
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    let cleanup: () => void = () => {};
    void listenDesktopEvents({ onPreferences: (value) => {
      const next = { ...DEFAULT_PREFS, ...value, language: normalizeLanguage(value.language) };
      setPreferences(next);
    }, onRefresh: () => void refresh(true) }).then((value) => {
      if (cancelled) value(); else cleanup = value;
    }).catch(() => setOperationError("Desktop event listener failed to start."));
    return () => { cancelled = true; cleanup(); };
  }, [refresh]);

  const refreshMs = useMemo(() => {
    const backoff = failures.current === 0 ? 5 * 60_000 : Math.min(30 * 60_000, 30_000 * 2 ** (failures.current - 1));
    if (failures.current === 0 && snapshots.some((item) => item.status === "ok" && needsFastRefresh(item))) return 60_000;
    return backoff;
  }, [snapshots]);

  useEffect(() => {
    const id = window.setInterval(() => void refresh(), refreshMs);
    return () => window.clearInterval(id);
  }, [refresh, refreshMs]);

  useEffect(() => {
    const refreshWhenActive = () => { if (document.visibilityState === "visible") void refresh(true); };
    window.addEventListener("focus", refreshWhenActive);
    document.addEventListener("visibilitychange", refreshWhenActive);
    return () => {
      window.removeEventListener("focus", refreshWhenActive);
      document.removeEventListener("visibilitychange", refreshWhenActive);
    };
  }, [refresh]);

  useEffect(() => {
    if (preferences.pinnedProvider || snapshots.length < 2) return;
    const id = window.setInterval(() => setActiveIndex((value) => (value + 1) % snapshots.length), preferences.autoRotateSeconds * 1000);
    return () => window.clearInterval(id);
  }, [preferences.autoRotateSeconds, preferences.pinnedProvider, snapshots.length]);

  const current = preferences.pinnedProvider
    ? snapshots.find((item) => item.provider === preferences.pinnedProvider) ?? snapshots[0]
    : snapshots[activeIndex % Math.max(1, snapshots.length)];

  const savePreferences = useCallback((next: WidgetPreferences) => {
    const previous = preferences;
    setPreferences(next);
    setOperationError(null);
    void updatePreferences(next).catch(() => { setPreferences(previous); setOperationError("Settings could not be saved. Previous state restored."); });
  }, [preferences]);

  useEffect(() => {
    const expanded = focusAfterResize.current;
    if (resizing || expanded === null) return;
    focusAfterResize.current = null;
    const frame = window.requestAnimationFrame(() => {
      const view = expanded ? ".widget-view--expanded" : ".widget-view--compact";
      document.querySelector<HTMLButtonElement>(`${view} .panel-resize-button`)?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [preferences.expanded, resizing]);

  const changeExpanded = useCallback((expanded: boolean) => {
    if (resizeInFlight.current) return;
    resizeInFlight.current = true;
    setResizing(true);
    setOperationError(null);
    void setWidgetExpanded(expanded)
      .then((next) => {
        focusAfterResize.current = next.expanded;
        setPreferences({ ...DEFAULT_PREFS, ...next, language: normalizeLanguage(next.language) });
      })
      .catch((error) => {
        focusAfterResize.current = !expanded;
        const needsReopen = String(error).includes("reopen the widget");
        setOperationError(needsReopen
          ? "Panel size change failed. Reopen the widget to restore its layout."
          : "Panel size change failed. The previous layout was kept.");
      })
      .finally(() => {
        resizeInFlight.current = false;
        setResizing(false);
      });
  }, []);

  if (!current) {
    return (
      <>
        <div className="widget-view widget-view--expanded">
          <div className="loading-card" aria-label={t.loadingQuota} aria-busy="true">
            <button type="button" className="panel-resize-button" onClick={() => changeExpanded(false)} disabled={resizing} aria-label={t.collapsePanel} title={t.collapsePanel}>−</button>
            {operationError ? <p className="operation-notice" role="status">{operationError}</p> : null}
            <span /><span /><span />
          </div>
        </div>
        <div className="widget-view widget-view--compact">
          <div className="quota-orb loading-orb" aria-label={t.loadingQuota} aria-busy="true">
            <button type="button" className="panel-resize-button orb-resize-button" onClick={() => changeExpanded(true)} disabled={resizing} aria-label={t.expandPanel} title={t.expandPanel}>+</button>
            {operationError ? <span className="orb-operation-notice" role="status" aria-label={operationError} title={operationError}>!</span> : null}
            <span /><span /><span />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="widget-view widget-view--expanded">
        <QuotaCard
          snapshot={current}
          preferences={preferences}
          providerCount={snapshots.length}
          onPrevious={() => setActiveIndex((value) => (value - 1 + snapshots.length) % snapshots.length)}
          onNext={() => setActiveIndex((value) => (value + 1) % snapshots.length)}
          onTogglePin={() => savePreferences({ ...preferences, pinnedProvider: preferences.pinnedProvider ? null : current.provider })}
          onLanguage={() => savePreferences({ ...preferences, language: nextLanguage(language) })}
          onHover={() => {}}
          onRefresh={() => refresh(true)}
          isConsuming={consumingProviders.has(current.provider)}
          notice={operationError}
          onToggleExpanded={() => changeExpanded(false)}
          resizeDisabled={resizing}
        />
      </div>
      <div className="widget-view widget-view--compact">
        <QuotaOrb
          snapshot={current}
          language={language}
          onHover={() => {}}
          onToggleExpanded={() => changeExpanded(true)}
          resizeDisabled={resizing}
          notice={operationError}
          compactActive={!preferences.expanded}
        />
      </div>
    </>
  );
}
