import { useMemo, useState, type CSSProperties } from "react";
import { DESKTOP_PALETTES, type DesktopPaletteName } from "../lib/desktopPalette";
import { quotaTier } from "../lib/format";
import type { ProviderSnapshot, WidgetPreferences, WidgetSkin, WidgetTheme } from "../types";
import { QuotaCard, QuotaOrb } from "./QuotaCard";
import { SupporterPanel } from "./SupporterPanel";

type ErrorMode = "unavailable" | "stale" | "signed_out";
type QuotaOrbMode = "healthy-orb" | "caution-orb" | "critical-orb";
type Mode = 74 | 35 | 8 | "orb" | "weekly" | "weekly-orb" | ErrorMode | QuotaOrbMode | `${ErrorMode}-orb`;
type Controls = { radius: number; numberSize: number; progressHeight: number; brightness: number; motion: number };

const base: ProviderSnapshot = {
  provider: "codex", displayName: "CODEX", plan: "PRO",
  shortWindow: { remainingPercent: 74, resetsAt: new Date(Date.now() + 78 * 60_000).toISOString(), windowSeconds: 18_000 },
  weeklyWindow: { remainingPercent: 42, resetsAt: new Date(Date.now() + 3.2 * 86_400_000).toISOString(), windowSeconds: 604_800 },
  resetCredits: 1, resetCreditExpiresAt: [], updatedAt: new Date().toISOString(), status: "ok", message: null,
};
const preferences: WidgetPreferences = { locked: false, alwaysOnTop: true, stayExpanded: false, pinnedProvider: "codex", autoRotateSeconds: 12, language: "en", appearance: "system", license: null, licenses: [], unlockedSkin: null, unlockedSkins: [], selectedSkin: "default" };
const defaults: Controls = { radius: 38, numberSize: 64, progressHeight: 6, brightness: 100, motion: 18 };
const names: DesktopPaletteName[] = ["healthy", "caution", "critical", "unavailable", "stale", "signed_out"];
const modes: Array<[Mode, string]> = [[74, "Healthy"], [35, "Caution"], [8, "Critical"], ["weekly", "Weekly"], ["healthy-orb", "Healthy orb"], ["caution-orb", "Caution orb"], ["critical-orb", "Critical orb"], ["weekly-orb", "Weekly orb"], ["unavailable", "Unavailable"], ["stale", "Stale"], ["signed_out", "Signed out"], ["unavailable-orb", "Unavailable orb"], ["stale-orb", "Stale orb"], ["signed_out-orb", "Signed out orb"]];
const stateLabels: Record<DesktopPaletteName, string> = { healthy: "Healthy", caution: "Caution", critical: "Critical", unavailable: "Unavailable", stale: "Stale", signed_out: "Signed out" };
const fields = ["--cool", "--glow", "--warm", "--progress-start", "--progress-end"] as const;

function makeSnapshot(mode: Mode): ProviderSnapshot {
  if (mode === "orb") return base;
  if (mode === "weekly" || mode === "weekly-orb") return { ...base, shortWindow: null };
  if (typeof mode === "number") return { ...base, shortWindow: { ...base.shortWindow!, remainingPercent: mode } };
  if (mode === "healthy-orb") return base;
  if (mode === "caution-orb") return { ...base, shortWindow: { ...base.shortWindow!, remainingPercent: 35 } };
  if (mode === "critical-orb") return { ...base, shortWindow: { ...base.shortWindow!, remainingPercent: 8 } };
  const isErrorOrb = typeof mode === "string" && mode.endsWith("-orb");
  const status: ErrorMode = isErrorOrb ? mode.replace("-orb", "") as ErrorMode : mode as ErrorMode;
  if (status === "stale") return { ...base, status: "stale", updatedAt: new Date(Date.now() - 7_200_000).toISOString(), message: "Refresh failed. Please try again later." };
  return { ...base, status, shortWindow: null, weeklyWindow: null, resetCredits: null, message: status === "signed_out" ? "Codex sign-in expired. Please sign in again." : "Quota is temporarily unavailable." };
}

function paletteName(snapshot: ProviderSnapshot): DesktopPaletteName {
  if (snapshot.status === "unavailable" || snapshot.status === "stale" || snapshot.status === "signed_out") return snapshot.status;
  const tier = quotaTier(snapshot.shortWindow?.remainingPercent ?? snapshot.weeklyWindow?.remainingPercent ?? null);
  return tier === "unknown" ? "healthy" : tier;
}

function modeForPalette(name: DesktopPaletteName): Mode {
  return ({ healthy: 74, caution: 35, critical: 8, unavailable: "unavailable", stale: "stale", signed_out: "signed_out" })[name] as Mode;
}

export function DesignPlayground() {
  const query = new URLSearchParams(window.location.search);
  const [theme, setTheme] = useState<WidgetTheme>(() => query.get("theme") === "dark" ? "dark" : "light");
  const [mode, setMode] = useState<Mode>(() => (query.get("mode") as Mode) || 74);
  const [controls, setControls] = useState<Controls>(defaults);
  const [previewTab, setPreviewTab] = useState<"widget" | "blur" | "computer" | "supporter">("widget");
  const [celebrationKey, setCelebrationKey] = useState(0);
  const snapshot = useMemo(() => makeSnapshot(mode), [mode]);
  const active = paletteName(snapshot);
  const isOrb = mode === "orb" || mode === "weekly-orb" || (typeof mode === "string" && mode.endsWith("-orb"));
  const style = (item: ProviderSnapshot) => {
    const palette = DESKTOP_PALETTES[theme][paletteName(item)];
    return { ...palette, "--card-radius": `${controls.radius}px`, "--number-size": `${controls.numberSize}px`, "--progress-height": `${controls.progressHeight}px`, "--card-brightness": `${controls.brightness}%`, "--motion-duration": `${controls.motion}s` } as CSSProperties;
  };
  const update = <K extends keyof Controls>(key: K, value: Controls[K]) => setControls((previous) => ({ ...previous, [key]: value }));
  const selectPalette = (nextTheme: WidgetTheme, name: DesktopPaletteName) => { setTheme(nextTheme); setMode(modeForPalette(name)); };
  const render = (item: ProviderSnapshot, skin: WidgetSkin = "default") => isOrb
    ? <QuotaOrb snapshot={item} language="en" onDrag={() => {}} onHover={() => {}} theme={theme} skin={skin} style={style(item)} />
    : <QuotaCard snapshot={item} preferences={preferences} providerCount={1} onPrevious={() => {}} onNext={() => {}} onTogglePin={() => {}} onLock={() => {}} onToggleStayExpanded={() => {}} onDrag={() => {}} onHover={() => {}} theme={theme} skin={skin} style={style(item)} />;

  return <main className={`design-workbench design-workbench--${theme}`}>
    <section className="design-stage" aria-label="Widget preview">
      <div className="design-page-tabs" role="tablist" aria-label="Design preview pages"><button role="tab" aria-selected={previewTab === "widget"} className={previewTab === "widget" ? "is-active" : ""} onClick={() => setPreviewTab("widget")}>Widget</button><button role="tab" aria-selected={previewTab === "blur"} className={previewTab === "blur" ? "is-active" : ""} onClick={() => setPreviewTab("blur")}>Blur skin</button><button role="tab" aria-selected={previewTab === "computer"} className={previewTab === "computer" ? "is-active" : ""} onClick={() => setPreviewTab("computer")}>Computer skin</button><button role="tab" aria-selected={previewTab === "supporter"} className={previewTab === "supporter" ? "is-active" : ""} onClick={() => setPreviewTab("supporter")}>Supporter skins</button></div>
      {previewTab !== "supporter" ? <><div className="design-preview-switch" role="group" aria-label="Preview state">
        {modes.map(([value, label]) => <button key={label} className={mode === value ? "is-active" : ""} onClick={() => setMode(value)}>{label}</button>)}
      </div>
      <div className="design-theme-switch" role="group" aria-label="Preview theme">
        {(["light", "dark"] as const).map((value) => <button key={value} className={theme === value ? "is-active" : ""} onClick={() => setTheme(value)}>{value === "light" ? "Light" : "Dark"}</button>)}
      </div>
      <div className={isOrb ? "design-orb-frame" : "design-card-frame"}>{render(snapshot, previewTab === "blur" ? "blur" : previewTab === "computer" ? "computer" : "default")}</div></> : <><button className="design-success-preview" type="button" onClick={() => setCelebrationKey((value) => value + 1)}>Preview verification success</button><div className="design-supporter-frame"><SupporterPanel preview celebrationKey={celebrationKey} onStatus={() => {}} /></div></>}
    </section>
    <aside className="design-controls">
      <header><p className="design-kicker">QUOTA FLOAT · PREVIEW</p><h1>Geometry preview</h1><p className="design-description">The palette is read-only and always comes from the desktop widget. Geometry changes below exist only in this preview and reset on refresh.</p></header>
      <p className="design-source-note">Desktop source: <code>DESKTOP_PALETTES.{theme}.{active}</code></p>
      <Range label="Corner radius" value={controls.radius} min={18} max={64} unit="px" onChange={(value) => update("radius", value)} />
      <Range label="Main number" value={controls.numberSize} min={48} max={88} unit="px" onChange={(value) => update("numberSize", value)} />
      <Range label="Progress height" value={controls.progressHeight} min={4} max={12} unit="px" onChange={(value) => update("progressHeight", value)} />
      <Range label="Brightness" value={controls.brightness} min={70} max={125} unit="%" onChange={(value) => update("brightness", value)} />
      <Range label="Motion" value={controls.motion} min={0} max={40} unit="s" onChange={(value) => update("motion", value)} />
      <button className="reset-design" onClick={() => setControls(defaults)}>Reset geometry</button>
    </aside>
    <section className="palette-matrix" aria-labelledby="palette-matrix-title">
      <header className="palette-matrix__header"><p className="design-kicker">DESKTOP SOURCE VALUES</p><h2 id="palette-matrix-title">Palette matrix</h2><p>These values are read-only. Select a state to inspect its production appearance; edit <code>src/lib/desktopPalette.ts</code> to change the desktop palette.</p></header>
      <div className="palette-matrix__themes">{(["light", "dark"] as const).map((matrixTheme) => <section className={`palette-theme palette-theme--${matrixTheme}`} key={matrixTheme} aria-label={`${matrixTheme} palette`}><h3>{matrixTheme === "light" ? "Light" : "Dark"}</h3>{names.map((name) => <PaletteCard key={name} theme={matrixTheme} name={name} selected={theme === matrixTheme && active === name} onSelect={() => selectPalette(matrixTheme, name)} />)}</section>)}</div>
    </section>
  </main>;
}

function Range({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (value: number) => void }) {
  return <label className="range-control"><span>{label}<output>{value}{unit}</output></span><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function PaletteCard({ theme, name, selected, onSelect }: { theme: WidgetTheme; name: DesktopPaletteName; selected: boolean; onSelect: () => void }) {
  const palette = DESKTOP_PALETTES[theme][name];
  return <article className={`palette-card${selected ? " is-selected" : ""}`}><button type="button" className="palette-card__select" onClick={onSelect} aria-pressed={selected}><span>{stateLabels[name]}</span><small>Preview</small></button><dl>{fields.map((field) => <div key={field}><dt>{field.replace("--", "")}</dt><dd><i style={{ backgroundColor: palette[field] }} aria-hidden="true" /><code>{palette[field]}</code></dd></div>)}</dl></article>;
}
