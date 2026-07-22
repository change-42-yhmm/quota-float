import { useMemo, useState, type CSSProperties } from "react";
import { DESKTOP_PALETTES, type DesktopPaletteName } from "../lib/desktopPalette";
import { quotaTier } from "../lib/format";
import type { Language, ProviderSnapshot, WidgetPreferences, WidgetSkin, WidgetTheme } from "../types";
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
const modes: Array<[Mode, string]> = [[74, "healthy"], [35, "caution"], [8, "critical"], ["weekly", "weekly"], ["healthy-orb", "healthyOrb"], ["caution-orb", "cautionOrb"], ["critical-orb", "criticalOrb"], ["weekly-orb", "weeklyOrb"], ["unavailable", "unavailable"], ["stale", "stale"], ["signed_out", "signedOut"], ["unavailable-orb", "unavailableOrb"], ["stale-orb", "staleOrb"], ["signed_out-orb", "signedOutOrb"]];
const fields = ["--cool", "--glow", "--warm", "--progress-start", "--progress-end"] as const;
const workbenchCopy = {
  "zh-CN": {
    widget: "组件", blur: "Blur 皮肤", computer: "Computer 皮肤", supporter: "支持者皮肤",
    previewState: "预览状态", previewTheme: "预览主题", language: "内容语言", light: "浅色", dark: "深色",
    geometryPreview: "几何预览", description: "配色为只读，始终来自桌面组件。以下几何调整仅用于此预览，并会在刷新后恢复默认。",
    source: "桌面来源：", cornerRadius: "圆角", mainNumber: "主数字", progressHeight: "进度条高度", brightness: "亮度", motion: "动效", reset: "重置几何设置",
    sourceValues: "桌面源数值", paletteMatrix: "配色矩阵", paletteDescription: "这些数值为只读。选择一个状态即可检查其生产环境外观；如需修改桌面配色，请编辑", preview: "预览", verification: "预览验证成功",
    healthy: "健康", caution: "注意", critical: "紧急", weekly: "每周", unavailable: "不可用", stale: "数据过期", signedOut: "未登录", healthyOrb: "健康圆形", cautionOrb: "注意圆形", criticalOrb: "紧急圆形", weeklyOrb: "每周圆形", unavailableOrb: "不可用圆形", staleOrb: "数据过期圆形", signedOutOrb: "未登录圆形",
  },
  en: {
    widget: "Widget", blur: "Blur skin", computer: "Computer skin", supporter: "Supporter skins",
    previewState: "Preview state", previewTheme: "Preview theme", language: "Content language", light: "Light", dark: "Dark",
    geometryPreview: "Geometry preview", description: "The palette is read-only and always comes from the desktop widget. Geometry changes below exist only in this preview and reset on refresh.",
    source: "Desktop source:", cornerRadius: "Corner radius", mainNumber: "Main number", progressHeight: "Progress height", brightness: "Brightness", motion: "Motion", reset: "Reset geometry",
    sourceValues: "Desktop source values", paletteMatrix: "Palette matrix", paletteDescription: "These values are read-only. Select a state to inspect its production appearance; edit", preview: "Preview", verification: "Preview verification success",
    healthy: "Healthy", caution: "Caution", critical: "Critical", weekly: "Weekly", unavailable: "Unavailable", stale: "Stale", signedOut: "Signed out", healthyOrb: "Healthy orb", cautionOrb: "Caution orb", criticalOrb: "Critical orb", weeklyOrb: "Weekly orb", unavailableOrb: "Unavailable orb", staleOrb: "Stale orb", signedOutOrb: "Signed out orb",
  },
} as const;

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
  const [language, setLanguage] = useState<Language>(() => query.get("language") === "en" ? "en" : "zh-CN");
  const [previewTab, setPreviewTab] = useState<"widget" | "blur" | "computer" | "supporter">("widget");
  const [celebrationKey, setCelebrationKey] = useState(0);
  const snapshot = useMemo(() => makeSnapshot(mode), [mode]);
  const active = paletteName(snapshot);
  const t = workbenchCopy[language];
  const isOrb = mode === "orb" || mode === "weekly-orb" || (typeof mode === "string" && mode.endsWith("-orb"));
  const style = (item: ProviderSnapshot) => {
    const palette = DESKTOP_PALETTES[theme][paletteName(item)];
    return { ...palette, "--card-radius": `${controls.radius}px`, "--number-size": `${controls.numberSize}px`, "--progress-height": `${controls.progressHeight}px`, "--card-brightness": `${controls.brightness}%`, "--motion-duration": `${controls.motion}s` } as CSSProperties;
  };
  const update = <K extends keyof Controls>(key: K, value: Controls[K]) => setControls((previous) => ({ ...previous, [key]: value }));
  const selectPalette = (nextTheme: WidgetTheme, name: DesktopPaletteName) => { setTheme(nextTheme); setMode(modeForPalette(name)); };
  const render = (item: ProviderSnapshot, skin: WidgetSkin = "default") => isOrb
    ? <QuotaOrb snapshot={item} language={language} onDrag={() => {}} onHover={() => {}} theme={theme} skin={skin} style={style(item)} />
    : <QuotaCard snapshot={item} preferences={{ ...preferences, language }} providerCount={1} onPrevious={() => {}} onNext={() => {}} onTogglePin={() => {}} onLock={() => {}} onToggleStayExpanded={() => {}} onDrag={() => {}} onHover={() => {}} theme={theme} skin={skin} style={style(item)} />;

  return <main className={`design-workbench design-workbench--${theme}`}>
    <section className="design-stage" aria-label={t.widget}>
      <div className="design-page-tabs" role="tablist" aria-label={t.widget}><button role="tab" aria-selected={previewTab === "widget"} className={previewTab === "widget" ? "is-active" : ""} onClick={() => setPreviewTab("widget")}>{t.widget}</button><button role="tab" aria-selected={previewTab === "blur"} className={previewTab === "blur" ? "is-active" : ""} onClick={() => setPreviewTab("blur")}>{t.blur}</button><button role="tab" aria-selected={previewTab === "computer"} className={previewTab === "computer" ? "is-active" : ""} onClick={() => setPreviewTab("computer")}>{t.computer}</button><button role="tab" aria-selected={previewTab === "supporter"} className={previewTab === "supporter" ? "is-active" : ""} onClick={() => setPreviewTab("supporter")}>{t.supporter}</button></div>
      {previewTab !== "supporter" ? <><div className="design-preview-switch" role="group" aria-label={t.previewState}>
        {modes.map(([value, label]) => <button key={label} className={mode === value ? "is-active" : ""} onClick={() => setMode(value)}>{t[label as keyof typeof t]}</button>)}
      </div>
      <div className="design-theme-switch" role="group" aria-label={t.previewTheme}>
        {(["light", "dark"] as const).map((value) => <button key={value} className={theme === value ? "is-active" : ""} onClick={() => setTheme(value)}>{value === "light" ? t.light : t.dark}</button>)}
      </div>
      <div className={isOrb ? "design-orb-frame" : "design-card-frame"}>{render(snapshot, previewTab === "blur" ? "blur" : previewTab === "computer" ? "computer" : "default")}</div></> : <><button className="design-success-preview" type="button" onClick={() => setCelebrationKey((value) => value + 1)}>{t.verification}</button><div className="design-supporter-frame"><SupporterPanel preview previewLanguage={language} celebrationKey={celebrationKey} onStatus={() => {}} /></div></>}
    </section>
    <aside className="design-controls">
      <header><p className="design-kicker">QUOTA FLOAT · PREVIEW</p><h1>{t.geometryPreview}</h1><p className="design-description">{t.description}</p></header>
      <div className="design-language-switch" role="group" aria-label={t.language}><span>{t.language}</span>{(["zh-CN", "en"] as const).map((value) => <button key={value} className={language === value ? "is-active" : ""} onClick={() => setLanguage(value)}>{value === "zh-CN" ? "中文" : "English"}</button>)}</div>
      <p className="design-source-note">{t.source} <code>DESKTOP_PALETTES.{theme}.{active}</code></p>
      <Range label={t.cornerRadius} value={controls.radius} min={18} max={64} unit="px" onChange={(value) => update("radius", value)} />
      <Range label={t.mainNumber} value={controls.numberSize} min={48} max={88} unit="px" onChange={(value) => update("numberSize", value)} />
      <Range label={t.progressHeight} value={controls.progressHeight} min={4} max={12} unit="px" onChange={(value) => update("progressHeight", value)} />
      <Range label={t.brightness} value={controls.brightness} min={70} max={125} unit="%" onChange={(value) => update("brightness", value)} />
      <Range label={t.motion} value={controls.motion} min={0} max={40} unit="s" onChange={(value) => update("motion", value)} />
      <button className="reset-design" onClick={() => setControls(defaults)}>{t.reset}</button>
    </aside>
    <section className="palette-matrix" aria-labelledby="palette-matrix-title">
      <header className="palette-matrix__header"><p className="design-kicker">{t.sourceValues}</p><h2 id="palette-matrix-title">{t.paletteMatrix}</h2><p>{t.paletteDescription} <code>src/lib/desktopPalette.ts</code>{language === "zh-CN" ? "。" : "."}</p></header>
      <div className="palette-matrix__themes">{(["light", "dark"] as const).map((matrixTheme) => <section className={`palette-theme palette-theme--${matrixTheme}`} key={matrixTheme} aria-label={`${matrixTheme} ${t.paletteMatrix}`}><h3>{matrixTheme === "light" ? t.light : t.dark}</h3>{names.map((name) => <PaletteCard key={name} theme={matrixTheme} name={name} label={t[name === "signed_out" ? "signedOut" : name]} previewLabel={t.preview} selected={theme === matrixTheme && active === name} onSelect={() => selectPalette(matrixTheme, name)} />)}</section>)}</div>
    </section>
  </main>;
}

function Range({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (value: number) => void }) {
  return <label className="range-control"><span>{label}<output>{value}{unit}</output></span><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function PaletteCard({ theme, name, label, previewLabel, selected, onSelect }: { theme: WidgetTheme; name: DesktopPaletteName; label: string; previewLabel: string; selected: boolean; onSelect: () => void }) {
  const palette = DESKTOP_PALETTES[theme][name];
  return <article className={`palette-card${selected ? " is-selected" : ""}`}><button type="button" className="palette-card__select" onClick={onSelect} aria-pressed={selected}><span>{label}</span><small>{previewLabel}</small></button><dl>{fields.map((field) => <div key={field}><dt>{field.replace("--", "")}</dt><dd><i style={{ backgroundColor: palette[field] }} aria-hidden="true" /><code>{palette[field]}</code></dd></div>)}</dl></article>;
}
