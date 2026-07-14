import { useMemo, useState, type CSSProperties } from "react";
import type { ProviderSnapshot, WidgetPreferences } from "../types";
import { QuotaCard, QuotaOrb } from "./QuotaCard";

const preview: ProviderSnapshot = {
  provider: "codex",
  displayName: "CODEX",
  plan: "PRO",
  weeklyWindow: { remainingPercent: 42, resetsAt: new Date(Date.now() + 3.2 * 86_400_000).toISOString(), windowSeconds: 604_800 },
  resetCredits: 1,
  resetCreditExpiresAt: [new Date(Date.now() + 9 * 86_400_000).toISOString()],
  updatedAt: new Date().toISOString(),
  status: "ok",
  message: null,
};
const preferences: WidgetPreferences = { locked: false, panelVisible: true, expanded: true, alwaysOnTop: true, pinnedProvider: "codex", autoRotateSeconds: 12, language: "en" };

interface Values {
  radius: number;
  numberSize: number;
  progressHeight: number;
  brightness: number;
  motion: number;
  cool: string;
  glow: string;
  warm: string;
}

type PreviewMode = 74 | 35 | 8 | "unavailable" | "stale" | "signed_out" | "orb";

const previewModes: Array<{ value: PreviewMode; label: string }> = [
  { value: 74, label: "74% Healthy" },
  { value: 35, label: "35% Caution" },
  { value: 8, label: "8% Critical" },
  { value: "unavailable", label: "Unavailable" },
  { value: "stale", label: "Stale" },
  { value: "signed_out", label: "Signed out" },
  { value: "orb", label: "Orb" },
];

const defaults: Values = { radius: 38, numberSize: 64, progressHeight: 6, brightness: 100, motion: 18, cool: "#7188bd", glow: "#fff4c3", warm: "#ff7653" };

function initialPreviewMode(): PreviewMode {
  const mode = new URLSearchParams(window.location.search).get("mode");
  if (mode === "healthy") return 74;
  if (mode === "caution") return 35;
  if (mode === "critical") return 8;
  if (mode === "unavailable" || mode === "stale" || mode === "signed_out" || mode === "orb") return mode;
  return 74;
}

export function DesignPlayground() {
  const [values, setValues] = useState(defaults);
  const [previewMode, setPreviewMode] = useState<PreviewMode>(() => initialPreviewMode());
  const params = new URLSearchParams(window.location.search);
  const screenshotMode = params.has("shot");
  const shotKind = params.get("shot");
  const showCreditTip = params.has("creditTip");
  const style = useMemo(() => ({
    "--card-radius": `${values.radius}px`,
    "--number-size": `${values.numberSize}px`,
    "--progress-height": `${values.progressHeight}px`,
    "--card-brightness": `${values.brightness}%`,
    "--motion-duration": `${values.motion}s`,
    "--cool": values.cool,
    "--glow": values.glow,
    "--warm": values.warm,
  }) as CSSProperties, [values]);

  const makePreview = (mode: PreviewMode): ProviderSnapshot => {
    if (mode === "orb") return preview;
    if (typeof mode === "number") {
      return { ...preview, weeklyWindow: preview.weeklyWindow ? { ...preview.weeklyWindow, remainingPercent: mode } : null };
    }
    if (mode === "stale") {
      return { ...preview, status: "stale", updatedAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(), message: "Refresh failed. Please try again later." };
    }
    return {
      ...preview,
      status: mode,
      weeklyWindow: null,
      resetCredits: null,
      message: mode === "signed_out" ? "Codex sign-in expired. Please sign in again." : "Quota is temporarily unavailable. It will retry in 30 seconds.",
    };
  };

  const activePreview = useMemo<ProviderSnapshot>(() => makePreview(previewMode), [previewMode]);

  const update = <K extends keyof Values>(key: K, value: Values[K]) => setValues((current) => ({ ...current, [key]: value }));

  if (screenshotMode) {
    if (shotKind === "states") {
      return (
        <div className="screenshot-stage screenshot-stage--states" style={style}>
          {[74, 35, 8].map((mode) => (
            <div className="design-card-frame" key={mode}>
              <QuotaCard snapshot={makePreview(mode as PreviewMode)} preferences={preferences} providerCount={1} onPrevious={() => {}} onNext={() => {}} onTogglePin={() => {}} onLanguage={() => {}} onHover={() => {}} onToggleExpanded={() => {}} isConsuming={mode === 35} />
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="screenshot-stage" style={style}>
        <div className={previewMode === "orb" ? "design-orb-frame" : "design-card-frame"}>
          {previewMode === "orb"
            ? <QuotaOrb snapshot={activePreview} language="en" onHover={() => {}} onToggleExpanded={() => {}} />
            : <QuotaCard snapshot={activePreview} preferences={preferences} providerCount={1} onPrevious={() => {}} onNext={() => {}} onTogglePin={() => {}} onLanguage={() => {}} onHover={() => {}} onToggleExpanded={() => {}} initialShowCreditTip={showCreditTip} />}
        </div>
      </div>
    );
  }

  return (
    <div className="design-workbench">
      <section className="design-stage" style={style}>
        <div className="design-preview-switch" aria-label="Quota status preview">
          {previewModes.map((mode) => (
            <button key={mode.value} className={previewMode === mode.value ? "is-active" : ""} onClick={() => setPreviewMode(mode.value)}>{mode.label}</button>
          ))}
        </div>
        <div className={previewMode === "orb" ? "design-orb-frame" : "design-card-frame"}>
          {previewMode === "orb"
            ? <QuotaOrb snapshot={activePreview} onHover={() => {}} onToggleExpanded={() => {}} />
            : <QuotaCard snapshot={activePreview} preferences={preferences} providerCount={1} onPrevious={() => {}} onNext={() => {}} onTogglePin={() => {}} onLanguage={() => {}} onHover={() => {}} onToggleExpanded={() => {}} />}
        </div>
      </section>
      <aside className="design-controls">
        <div>
          <p className="design-kicker">QUOTA FLOAT</p>
          <h1>Visual Tuning</h1>
          <p className="design-description">Preview changes live, then apply the chosen values to the desktop widget.</p>
        </div>
        <Range label="Radius" value={values.radius} min={24} max={64} unit="px" onChange={(v) => update("radius", v)} />
        <Range label="Main number" value={values.numberSize} min={56} max={110} unit="px" onChange={(v) => update("numberSize", v)} />
        <Range label="Progress" value={values.progressHeight} min={4} max={12} unit="px" onChange={(v) => update("progressHeight", v)} />
        <Range label="Brightness" value={values.brightness} min={70} max={125} unit="%" onChange={(v) => update("brightness", v)} />
        <Range label="Motion" value={values.motion} min={6} max={40} unit="s" onChange={(v) => update("motion", v)} />
        <div className="color-row">
          <Color label="Cool" value={values.cool} onChange={(v) => update("cool", v)} />
          <Color label="Glow" value={values.glow} onChange={(v) => update("glow", v)} />
          <Color label="Warm" value={values.warm} onChange={(v) => update("warm", v)} />
        </div>
        <button className="reset-design" onClick={() => setValues(defaults)}>Reset design</button>
      </aside>
    </div>
  );
}

function Range({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (value: number) => void }) {
  return <label className="range-control"><span>{label}<output>{value}{unit}</output></span><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="color-control"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} /><span>{label}</span></label>;
}
