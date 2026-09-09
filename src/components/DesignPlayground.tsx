import { SkinEffects } from "./SkinEffects";
import { useMemo, useState, type CSSProperties } from "react";
import { DESKTOP_PALETTES, type DesktopPaletteName } from "../lib/desktopPalette";
import { quotaTier } from "../lib/format";
import type { Language, ProviderSnapshot, WidgetPreferences, WidgetSkin, WidgetTheme } from "../types";
import { QuotaCard, QuotaOrb } from "./QuotaCard";
import { SupporterPanel } from "./SupporterPanel";

type ErrorMode = "unavailable" | "stale" | "signed_out";
type PreviewProvider = "codex" | "claude";
type PreviewBackground = "transparent" | "background-1" | "liquid" | "city" | "mechanical";
type QuotaOrbMode = "healthy-orb" | "caution-orb" | "critical-orb";
type Mode = 74 | 35 | 8 | "cost" | "cost-orb" | "orb" | "weekly" | "weekly-orb" | ErrorMode | QuotaOrbMode | `${ErrorMode}-orb`;
type GlassProgressState = "healthy" | "caution" | "critical";
type GlassProgressMaterial = { blur: number; transparency: number; baseStart: string; baseEnd: string; shadowX: number; shadowY: number; shadowBlur: number; shadowColor: string; shadowTransparency: number; highlight: number; glowSize: number; glowColor: string; glowTransparency: number };
type GlassNumberGradient = { start: string; end: string; angle: number };
type Controls = { radius: number; numberSize: number; progressHeight: number; brightness: number; motion: number; glassProgressState: GlassProgressState; glassProgress: Record<GlassProgressState, GlassProgressMaterial>; glassNumberGradient: Record<GlassProgressState, GlassNumberGradient> };

const base: ProviderSnapshot = {
  provider: "codex", displayName: "CODEX", plan: "PRO",
  shortWindow: { remainingPercent: 74, resetsAt: new Date(Date.now() + 78 * 60_000).toISOString(), windowSeconds: 18_000 },
  weeklyWindow: { remainingPercent: 42, resetsAt: new Date(Date.now() + 3.2 * 86_400_000).toISOString(), windowSeconds: 604_800 },
  resetCredits: 1, resetCreditExpiresAt: [], updatedAt: new Date().toISOString(), status: "ok", message: null,
};
const preferences: WidgetPreferences = { locked: false, alwaysOnTop: true, stayExpanded: false, pinnedProvider: "codex", autoRotateSeconds: 12, language: "en", appearance: "system", license: null, licenses: [], unlockedSkin: null, unlockedSkins: [], selectedSkin: "default" };
const healthyGlassProgress: GlassProgressMaterial = { blur: 4, transparency: 14, baseStart: "#fafafa", baseEnd: "#fafafa", shadowX: -6, shadowY: 12, shadowBlur: 20, shadowColor: "#333333", shadowTransparency: 30, highlight: 45, glowSize: 70, glowColor: "#ea8f53", glowTransparency: 0 };
const defaults: Controls = { radius: 38, numberSize: 64, progressHeight: 6, brightness: 100, motion: 18, glassProgressState: "healthy", glassProgress: { healthy: healthyGlassProgress, caution: { ...healthyGlassProgress, transparency: 31, baseStart: "#e5d094", baseEnd: "#e38e16" }, critical: { ...healthyGlassProgress, transparency: 60, baseStart: "#e8b0b0", baseEnd: "#ea0606" } }, glassNumberGradient: { healthy: { start: "#5b92ec", end: "#abccf7", angle: 135 }, caution: { start: "#e59b34", end: "#f3cf6d", angle: 135 }, critical: { start: "#eb6075", end: "#fba2a2", angle: 135 } } };
const names: DesktopPaletteName[] = ["healthy", "caution", "critical", "unavailable", "stale", "signed_out"];
const modes: Array<[Mode, string]> = [[74, "healthy"], [35, "caution"], [8, "critical"], ["cost", "apiCost"], ["weekly", "weekly"], ["unavailable", "unavailable"], ["stale", "stale"], ["signed_out", "signedOut"]];
const fields = ["--cool", "--glow", "--warm", "--progress-start", "--progress-end"] as const;
const workbenchCopy = {
  "zh-CN": {
    widget: "组件", blur: "Blur 皮肤", computer: "Computer 皮肤", glass: "Glass 皮肤", nexus: "Nexus 皮肤", supporter: "支持者皮肤",
    previewState: "预览状态", previewTheme: "预览主题", previewBackground: "预览背景", transparent: "透明", backgroundOne: "背景 1", backgroundLiquid: "液态玻璃", backgroundCity: "星际霓虹", backgroundMechanical: "机械", language: "内容语言", light: "浅色", dark: "深色", presentation: "展示模式", edit: "编辑模式",
    previewProvider: "预览来源", codex: "Codex", claude: "Claude",
    geometryPreview: "几何预览", description: "配色为只读，始终来自桌面组件。以下几何调整仅用于此预览，并会在刷新后恢复默认。",
    source: "桌面来源：", cornerRadius: "圆角", mainNumber: "主数字", progressHeight: "进度条高度", brightness: "亮度", motion: "动效", reset: "重置几何设置", numberGradient: "主数字 · 渐变", gradientStart: "渐变起点", gradientEnd: "渐变终点", gradientAngle: "渐变角度", progressMaterial: "动态条 · 玻璃材质", progressBlur: "Blur", progressTransparency: "Transparency", progressBaseColor: "Base Color", progressShadowX: "Shadow X", progressShadowY: "Shadow Y", progressShadowBlur: "Shadow Blur", progressShadowColor: "Shadow Color", progressShadowTransparency: "Shadow Transparency", progressHighlight: "Highlight", progressGlowSize: "Glow Size", progressGlowColor: "Glow Color", progressGlowTransparency: "Glow Transparency",
    sourceValues: "桌面源数值", paletteMatrix: "配色矩阵", paletteDescription: "这些数值为只读。选择一个状态即可检查其生产环境外观；如需修改桌面配色，请编辑", preview: "预览", verification: "预览验证成功",
    healthy: "健康", caution: "注意", critical: "紧急", apiCost: "API 成本", apiCostOrb: "API 成本圆形", weekly: "每周", unavailable: "不可用", stale: "数据过期", signedOut: "未登录", healthyOrb: "健康圆形", cautionOrb: "注意圆形", criticalOrb: "紧急圆形", weeklyOrb: "每周圆形", unavailableOrb: "不可用圆形", staleOrb: "数据过期圆形", signedOutOrb: "未登录圆形",
  },
  en: {
    widget: "Widget", blur: "Blur skin", computer: "Computer skin", glass: "Glass skin", nexus: "Nexus skin", supporter: "Supporter skins",
    previewState: "Preview state", previewTheme: "Preview theme", previewBackground: "Preview background", transparent: "Transparent", backgroundOne: "Background 1", backgroundLiquid: "Liquid glass", backgroundCity: "Interstellar neon", backgroundMechanical: "Mechanical", language: "Content language", light: "Light", dark: "Dark", presentation: "Present", edit: "Edit",
    previewProvider: "Preview source", codex: "Codex", claude: "Claude",
    geometryPreview: "Geometry preview", description: "The palette is read-only and always comes from the desktop widget. Geometry changes below exist only in this preview and reset on refresh.",
    source: "Desktop source:", cornerRadius: "Corner radius", mainNumber: "Main number", progressHeight: "Progress height", brightness: "Brightness", motion: "Motion", reset: "Reset geometry", numberGradient: "Main number · Gradient", gradientStart: "Gradient start", gradientEnd: "Gradient end", gradientAngle: "Gradient angle", progressMaterial: "Dynamic bar · Glass material", progressBlur: "Blur", progressTransparency: "Transparency", progressBaseColor: "Base Color", progressShadowX: "Shadow X", progressShadowY: "Shadow Y", progressShadowBlur: "Shadow Blur", progressShadowColor: "Shadow Color", progressShadowTransparency: "Shadow Transparency", progressHighlight: "Highlight", progressGlowSize: "Glow Size", progressGlowColor: "Glow Color", progressGlowTransparency: "Glow Transparency",
    sourceValues: "Desktop source values", paletteMatrix: "Palette matrix", paletteDescription: "These values are read-only. Select a state to inspect its production appearance; edit", preview: "Preview", verification: "Preview verification success",
    healthy: "Healthy", caution: "Caution", critical: "Critical", apiCost: "API cost", apiCostOrb: "API cost orb", weekly: "Weekly", unavailable: "Unavailable", stale: "Stale", signedOut: "Signed out", healthyOrb: "Healthy orb", cautionOrb: "Caution orb", criticalOrb: "Critical orb", weeklyOrb: "Weekly orb", unavailableOrb: "Unavailable orb", staleOrb: "Stale orb", signedOutOrb: "Signed out orb",
  },
} as const;

function makeSnapshot(mode: Mode, provider: PreviewProvider): ProviderSnapshot {
  const source = provider === "claude" ? { provider: "claude" as const, displayName: "CLAUDE", plan: "PRO" } : {};
  if (mode === "orb") return { ...base, ...source };
  if (mode === "cost") return { ...base, ...source, provider: provider === "claude" ? "claude_api" : "openai_api", displayName: provider === "claude" ? "CLAUDE API" : "OPENAI API", plan: null, monthCost: { amount: 12.34, currency: "USD" }, dayCost: { amount: 0.83, currency: "USD" } };
  if (mode === "cost-orb") return { ...base, ...source, provider: provider === "claude" ? "claude_api" : "openai_api", displayName: provider === "claude" ? "CLAUDE API" : "OPENAI API", plan: null, monthCost: { amount: 12.34, currency: "USD" }, dayCost: { amount: 0.83, currency: "USD" } };
  if (mode === "weekly" || mode === "weekly-orb") return { ...base, ...source, shortWindow: null };
  if (typeof mode === "number") return { ...base, ...source, shortWindow: { ...base.shortWindow!, remainingPercent: mode } };
  if (mode === "healthy-orb") return { ...base, ...source };
  if (mode === "caution-orb") return { ...base, ...source, shortWindow: { ...base.shortWindow!, remainingPercent: 35 } };
  if (mode === "critical-orb") return { ...base, ...source, shortWindow: { ...base.shortWindow!, remainingPercent: 8 } };
  const isErrorOrb = typeof mode === "string" && mode.endsWith("-orb");
  const status: ErrorMode = isErrorOrb ? mode.replace("-orb", "") as ErrorMode : mode as ErrorMode;
  if (status === "stale") return { ...base, ...source, status: "stale", updatedAt: new Date(Date.now() - 7_200_000).toISOString(), message: "Refresh failed. Please try again later." };
  return { ...base, ...source, status, shortWindow: null, weeklyWindow: null, resetCredits: null, message: status === "signed_out" ? `${provider === "claude" ? "Claude" : "Codex"} sign-in expired. Please sign in again.` : "Quota is temporarily unavailable." };
}

function paletteName(snapshot: ProviderSnapshot): DesktopPaletteName {
  if (snapshot.status === "unavailable" || snapshot.status === "stale" || snapshot.status === "signed_out") return snapshot.status;
  const tier = quotaTier(snapshot.shortWindow?.remainingPercent ?? snapshot.weeklyWindow?.remainingPercent ?? null);
  return tier === "unknown" ? "healthy" : tier;
}

function modeForPalette(name: DesktopPaletteName): Mode {
  return ({ healthy: 74, caution: 35, critical: 8, unavailable: "unavailable", stale: "stale", signed_out: "signed_out" })[name] as Mode;
}

function glassProgressStateForMode(mode: Mode): GlassProgressState | null {
  return mode === 74 || mode === "healthy-orb" || mode === "cost" || mode === "cost-orb"
    ? "healthy"
    : mode === 35 || mode === "caution-orb" || mode === "weekly" || mode === "weekly-orb"
      ? "caution"
      : mode === 8 || mode === "critical-orb"
        ? "critical"
        : null;
}

function modeForGlassProgressState(state: GlassProgressState): Mode {
  return state === "healthy" ? 74 : state === "caution" ? 35 : 8;
}

function hexToRgb(value: string): string {
  const hex = value.replace("#", "");
  return `${parseInt(hex.slice(0, 2), 16)} ${parseInt(hex.slice(2, 4), 16)} ${parseInt(hex.slice(4, 6), 16)}`;
}

export function DesignPlayground() {
  const query = new URLSearchParams(window.location.search);
  const [theme, setTheme] = useState<WidgetTheme>(() => query.get("theme") === "dark" ? "dark" : "light");
  const [mode, setMode] = useState<Mode>(() => (query.get("mode") as Mode) || 74);
  const [controls, setControls] = useState<Controls>(defaults);
  const [language, setLanguage] = useState<Language>(() => query.get("language") === "en" ? "en" : "zh-CN");
  const [previewTab, setPreviewTab] = useState<"widget" | "blur" | "computer" | "glass" | "nexus" | "supporter">("widget");
  const [previewProvider, setPreviewProvider] = useState<PreviewProvider>("codex");
  const [previewBackground, setPreviewBackground] = useState<PreviewBackground>("transparent");
  const [celebrationKey, setCelebrationKey] = useState(0);
  const [nexusButtons, setNexusButtons] = useState({ alwaysOnTop: preferences.alwaysOnTop, stayExpanded: preferences.stayExpanded });
  const [presentationMode, setPresentationMode] = useState(false);
  const snapshot = useMemo(() => makeSnapshot(mode, previewProvider), [mode, previewProvider]);
  const active = paletteName(snapshot);
  const t = workbenchCopy[language];
  const glassProgress = controls.glassProgress[controls.glassProgressState];
  const glassNumberGradient = controls.glassNumberGradient[controls.glassProgressState];
  const style = (item: ProviderSnapshot) => {
    const palette = DESKTOP_PALETTES[theme][paletteName(item)];
    return { ...palette, "--card-radius": `${controls.radius}px`, "--number-size": `${controls.numberSize}px`, "--progress-height": `${controls.progressHeight}px`, "--card-brightness": `${controls.brightness}%`, "--motion-duration": `${controls.motion}s`, "--glass-number-gradient-start": glassNumberGradient.start, "--glass-number-gradient-end": glassNumberGradient.end, "--glass-number-gradient-angle": `${glassNumberGradient.angle}deg`, "--glass-progress-blur": `${glassProgress.blur}px`, "--glass-progress-transparency": `${glassProgress.transparency}%`, "--glass-progress-base-start": glassProgress.baseStart, "--glass-progress-base-end": glassProgress.baseEnd, "--glass-progress-shadow-x": `${glassProgress.shadowX}px`, "--glass-progress-shadow-y": `${glassProgress.shadowY}px`, "--glass-progress-shadow-blur": `${glassProgress.shadowBlur}px`, "--glass-progress-shadow-color": hexToRgb(glassProgress.shadowColor), "--glass-progress-shadow-transparency": `${glassProgress.shadowTransparency / 100}`, "--glass-progress-highlight": `${glassProgress.highlight / 100}`, "--glass-progress-glow-size": `${glassProgress.glowSize}px`, "--glass-progress-glow-color": hexToRgb(glassProgress.glowColor), "--glass-progress-glow-transparency": `${glassProgress.glowTransparency / 100}` } as CSSProperties;
  };
  const update = <K extends keyof Controls>(key: K, value: Controls[K]) => setControls((previous) => ({ ...previous, [key]: value }));
  const updateGlassProgress = <K extends keyof GlassProgressMaterial>(key: K, value: GlassProgressMaterial[K]) => setControls((previous) => ({ ...previous, glassProgress: { ...previous.glassProgress, [previous.glassProgressState]: { ...previous.glassProgress[previous.glassProgressState], [key]: value } } }));
  const updateGlassNumberGradient = <K extends keyof GlassNumberGradient>(key: K, value: GlassNumberGradient[K]) => setControls((previous) => ({ ...previous, glassNumberGradient: { ...previous.glassNumberGradient, [previous.glassProgressState]: { ...previous.glassNumberGradient[previous.glassProgressState], [key]: value } } }));
  const selectMode = (next: Mode) => {
    setMode(next);
    const nextGlassProgressState = glassProgressStateForMode(next);
    if (nextGlassProgressState) setControls((previous) => ({ ...previous, glassProgressState: nextGlassProgressState }));
  };
  const selectGlassProgressState = (next: GlassProgressState) => {
    setControls((previous) => ({ ...previous, glassProgressState: next }));
    setMode(modeForGlassProgressState(next));
  };
  const selectPalette = (nextTheme: WidgetTheme, name: DesktopPaletteName) => {
    const nextMode = modeForPalette(name);
    setTheme(nextTheme);
    setMode(nextMode);
    const nextGlassProgressState = glassProgressStateForMode(nextMode);
    if (nextGlassProgressState) setControls((previous) => ({ ...previous, glassProgressState: nextGlassProgressState }));
  };
  const skin: WidgetSkin = previewTab === "blur" ? "blur" : previewTab === "computer" ? "computer" : "default";
  const renderCard = (item: ProviderSnapshot) => <QuotaCard snapshot={item} preferences={{ ...preferences, ...(previewTab === "nexus" ? nexusButtons : {}), language }} providerCount={1} onPrevious={() => {}} onNext={() => {}} onTogglePin={() => {}} onLock={() => { if (previewTab === "nexus") setNexusButtons((previous) => ({ ...previous, alwaysOnTop: !previous.alwaysOnTop })); }} onToggleStayExpanded={() => { if (previewTab === "nexus") setNexusButtons((previous) => ({ ...previous, stayExpanded: !previous.stayExpanded })); }} onDrag={() => {}} onHover={() => {}} theme={theme} skin={skin} nexusPreview={previewTab === "nexus"} providerMarkVariant={previewTab === "glass" || previewTab === "nexus" ? "glass" : "default"} style={style(item)} />;
  const renderOrb = (item: ProviderSnapshot) => <QuotaOrb snapshot={item} language={language} onDrag={() => {}} onHover={() => {}} theme={theme} skin={skin} style={style(item)} />;

  return <main className={`design-workbench design-workbench--${theme}`}>
    <section className={`design-stage design-stage--${previewTab} design-stage--background-${previewBackground}${presentationMode ? " design-stage--presentation" : ""}`} aria-label={t.widget}>
<SkinEffects />
      <button className="design-presentation-toggle" type="button" aria-pressed={presentationMode} onClick={() => setPresentationMode((value) => !value)}>{presentationMode ? t.edit : t.presentation}</button>
      <div className="design-selection-controls">
      <div className="design-page-tabs" role="tablist" aria-label={t.widget}><button role="tab" aria-selected={previewTab === "widget"} className={previewTab === "widget" ? "is-active" : ""} onClick={() => setPreviewTab("widget")}>{t.widget}</button><button role="tab" aria-selected={previewTab === "blur"} className={previewTab === "blur" ? "is-active" : ""} onClick={() => setPreviewTab("blur")}>{t.blur}</button><button role="tab" aria-selected={previewTab === "computer"} className={previewTab === "computer" ? "is-active" : ""} onClick={() => setPreviewTab("computer")}>{t.computer}</button><button role="tab" aria-selected={previewTab === "glass"} className={previewTab === "glass" ? "is-active" : ""} onClick={() => setPreviewTab("glass")}>{t.glass}</button><button role="tab" aria-selected={previewTab === "nexus"} className={previewTab === "nexus" ? "is-active" : ""} onClick={() => setPreviewTab("nexus")}>{t.nexus}</button><button role="tab" aria-selected={previewTab === "supporter"} className={previewTab === "supporter" ? "is-active" : ""} onClick={() => setPreviewTab("supporter")}>{t.supporter}</button></div>
      </div>
      {previewTab !== "supporter" ? <><div className="design-selection-controls"><div className="design-preview-switch" role="group" aria-label={t.previewState}>
        {modes.map(([value, label]) => <button key={label} className={mode === value ? "is-active" : ""} onClick={() => selectMode(value)}>{t[label as keyof typeof t]}</button>)}
      </div></div>
      <div className="design-preview-options">
        <div className="design-theme-switch" role="group" aria-label={t.previewTheme}>
          {(["light", "dark"] as const).map((value) => <button key={value} className={theme === value ? "is-active" : ""} onClick={() => setTheme(value)}>{value === "light" ? t.light : t.dark}</button>)}
        </div>
        <div className="design-theme-switch" role="group" aria-label={t.previewBackground}>
          {(["transparent", "background-1", "liquid", "city", "mechanical"] as const).map((value) => <button key={value} className={previewBackground === value ? "is-active" : ""} onClick={() => setPreviewBackground(value)}>{value === "transparent" ? t.transparent : value === "background-1" ? t.backgroundOne : value === "liquid" ? t.backgroundLiquid : value === "city" ? t.backgroundCity : t.backgroundMechanical}</button>)}
        </div>
        {previewTab === "blur" || previewTab === "computer" || previewTab === "glass" || previewTab === "nexus" ? <div className="design-theme-switch" role="group" aria-label={t.previewProvider}>
          {(["codex", "claude"] as const).map((value) => <button key={value} className={previewProvider === value ? "is-active" : ""} onClick={() => setPreviewProvider(value)}>{t[value]}</button>)}
        </div> : null}
      </div>
      <div className="design-preview-pair"><div className="design-orb-frame">{renderOrb(snapshot)}</div><div className="design-card-frame">{renderCard(snapshot)}</div></div></> : <><button className="design-success-preview" type="button" onClick={() => setCelebrationKey((value) => value + 1)}>{t.verification}</button><div className="design-supporter-frame"><SupporterPanel preview previewLanguage={language} celebrationKey={celebrationKey} onStatus={() => {}} /></div></>}
    </section>
    <aside className="design-controls">
      <header><p className="design-kicker">QUOTA FLOAT · PREVIEW</p><h1>{t.geometryPreview}</h1><p className="design-description">{t.description}</p></header>
      <div className="design-language-switch" role="group" aria-label={t.language}><span>{t.language}</span>{(["zh-CN", "en"] as const).map((value) => <button key={value} className={language === value ? "is-active" : ""} onClick={() => setLanguage(value)}>{value === "zh-CN" ? "中文" : "English"}</button>)}</div>
      <p className="design-source-note">{t.source} <code>DESKTOP_PALETTES.{theme}.{active}</code></p>
      <Range label={t.cornerRadius} value={controls.radius} min={18} max={64} unit="px" onChange={(value) => update("radius", value)} />
      <Range label={t.mainNumber} value={controls.numberSize} min={48} max={88} unit="px" onChange={(value) => update("numberSize", value)} />
      {previewTab !== "nexus" ? <Range label={t.progressHeight} value={controls.progressHeight} min={4} max={12} unit="px" onChange={(value) => update("progressHeight", value)} /> : null}
      <Range label={t.brightness} value={controls.brightness} min={70} max={125} unit="%" onChange={(value) => update("brightness", value)} />
      <Range label={t.motion} value={controls.motion} min={0} max={40} unit="s" onChange={(value) => update("motion", value)} />
      {previewTab === "glass" && snapshot.status === "ok" && !snapshot.monthCost ? <section className="glass-progress-controls glass-number-gradient-controls" aria-label={t.numberGradient}>
        <header><h2>{t.numberGradient}</h2></header>
        <Color label={t.gradientStart} value={glassNumberGradient.start} onChange={(value) => updateGlassNumberGradient("start", value)} />
        <Color label={t.gradientEnd} value={glassNumberGradient.end} onChange={(value) => updateGlassNumberGradient("end", value)} />
        <Range label={t.gradientAngle} value={glassNumberGradient.angle} min={0} max={360} unit="°" onChange={(value) => updateGlassNumberGradient("angle", value)} />
      </section> : null}
      {previewTab === "glass" && snapshot.status === "ok" && !snapshot.monthCost ? <section className="glass-progress-controls" aria-label={t.progressMaterial}>
        <header><h2>{t.progressMaterial}</h2><div role="group" aria-label={t.progressMaterial}>{(["healthy", "caution", "critical"] as const).map((state) => <button type="button" key={state} className={controls.glassProgressState === state ? "is-active" : ""} onClick={() => selectGlassProgressState(state)}>{t[state]}</button>)}</div></header>
        <Range label={t.progressBlur} value={glassProgress.blur} min={0} max={20} unit="px" onChange={(value) => updateGlassProgress("blur", value)} />
        <Range label={t.progressTransparency} value={glassProgress.transparency} min={0} max={100} unit="%" onChange={(value) => updateGlassProgress("transparency", value)} />
        <Color label={`${t.progressBaseColor} · A`} value={glassProgress.baseStart} onChange={(value) => updateGlassProgress("baseStart", value)} />
        <Color label={`${t.progressBaseColor} · B`} value={glassProgress.baseEnd} onChange={(value) => updateGlassProgress("baseEnd", value)} />
        <Range label={t.progressShadowX} value={glassProgress.shadowX} min={-30} max={30} unit="px" onChange={(value) => updateGlassProgress("shadowX", value)} />
        <Range label={t.progressShadowY} value={glassProgress.shadowY} min={-30} max={30} unit="px" onChange={(value) => updateGlassProgress("shadowY", value)} />
        <Range label={t.progressShadowBlur} value={glassProgress.shadowBlur} min={0} max={80} unit="px" onChange={(value) => updateGlassProgress("shadowBlur", value)} />
        <Color label={t.progressShadowColor} value={glassProgress.shadowColor} onChange={(value) => updateGlassProgress("shadowColor", value)} />
        <Range label={t.progressShadowTransparency} value={glassProgress.shadowTransparency} min={0} max={100} unit="%" onChange={(value) => updateGlassProgress("shadowTransparency", value)} />
        <Range label={t.progressHighlight} value={glassProgress.highlight} min={0} max={100} unit="%" onChange={(value) => updateGlassProgress("highlight", value)} />
        <Range label={t.progressGlowSize} value={glassProgress.glowSize} min={0} max={160} unit="px" onChange={(value) => updateGlassProgress("glowSize", value)} />
        <Color label={t.progressGlowColor} value={glassProgress.glowColor} onChange={(value) => updateGlassProgress("glowColor", value)} />
        <Range label={t.progressGlowTransparency} value={glassProgress.glowTransparency} min={0} max={100} unit="%" onChange={(value) => updateGlassProgress("glowTransparency", value)} />
      </section> : null}
      <button className="reset-design" onClick={() => setControls(defaults)}>{t.reset}</button>
    </aside>
    <section className="palette-matrix" aria-labelledby="palette-matrix-title" hidden>
      <header className="palette-matrix__header"><p className="design-kicker">{t.sourceValues}</p><h2 id="palette-matrix-title">{t.paletteMatrix}</h2><p>{t.paletteDescription} <code>src/lib/desktopPalette.ts</code>{language === "zh-CN" ? "。" : "."}</p></header>
      <div className="palette-matrix__themes">{(["light", "dark"] as const).map((matrixTheme) => <section className={`palette-theme palette-theme--${matrixTheme}`} key={matrixTheme} aria-label={`${matrixTheme} ${t.paletteMatrix}`}><h3>{matrixTheme === "light" ? t.light : t.dark}</h3>{names.map((name) => <PaletteCard key={name} theme={matrixTheme} name={name} label={t[name === "signed_out" ? "signedOut" : name]} previewLabel={t.preview} selected={theme === matrixTheme && active === name} onSelect={() => selectPalette(matrixTheme, name)} />)}</section>)}</div>
    </section>
  </main>;
}

function Range({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (value: number) => void }) {
  return <label className="range-control"><span>{label}<output>{value}{unit}</output></span><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="color-control color-control--glass"><span>{label}</span><input type="color" value={value} onChange={(event) => onChange(event.target.value)} /><code>{value}</code></label>;
}

function PaletteCard({ theme, name, label, previewLabel, selected, onSelect }: { theme: WidgetTheme; name: DesktopPaletteName; label: string; previewLabel: string; selected: boolean; onSelect: () => void }) {
  const palette = DESKTOP_PALETTES[theme][name];
  return <article className={`palette-card${selected ? " is-selected" : ""}`}><button type="button" className="palette-card__select" onClick={onSelect} aria-pressed={selected}><span>{label}</span><small>{previewLabel}</small></button><dl>{fields.map((field) => <div key={field}><dt>{field.replace("--", "")}</dt><dd><i style={{ backgroundColor: palette[field] }} aria-hidden="true" /><code>{palette[field]}</code></dd></div>)}</dl></article>;
}
