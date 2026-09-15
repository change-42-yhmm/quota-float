import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "@phosphor-icons/react";
import { activateSupporterLicense, getPreferences, getSupporterStatus, listenDesktopEvents, openExternalUrl } from "../lib/bridge";
import { normalizeLanguage } from "../lib/i18n";
import type { Language, SupporterStatus, WidgetSkin } from "../types";
import logoUrl from "../../assets/quota-float-logo.svg";
import blurThumbnailUrl from "../../assets/skin-blur.png";
import computerThumbnailUrl from "../../assets/skin-computer.png";
import glassThumbnailUrl from "../../assets/skin-glass.png";
import nexusThumbnailUrl from "../../assets/skin-nexus.png";
import likeIconUrl from "../../assets/点赞.svg";

const labels = { "zh-CN": { title: "版本更新", description: "现已支持 Claude 订阅与 API、GPT API 额度读取，Mac 状态栏可显示额度；新增 Glass 与 Nexus 两款皮肤供选择。", supporterSkins: "设计师皮肤", choose: "1. 皮肤预览（可点击大图查看）", device: "第一种方式：皮肤名称和复制设备码给设计师", purchaseMethod: "第二种方式", buy: "前往 Ko-fi 购买 ↗", creatorPlatforms: "设计师联系方式", license: "3. 收到反馈的许可证粘贴解锁", copy: "复制", copied: "已复制", loadingCode: "正在生成设备码…", codeUnavailable: "设备码暂时不可用", copyFailed: "复制失败，请重试。", owned: "拥有", placeholder: "粘贴完整的许可证 JSON", activate: "验证许可证", working: "正在验证…", ready: "皮肤可以在系统托盘选择。", verifying: "正在验证许可证与当前设备，请稍候。", activated: "许可证验证成功，已解锁对应皮肤。请在系统托盘主题菜单中启用。", failed: "许可证验证失败，请稍后重试。" }, en: { title: "Version updates", description: "Claude subscriptions and API, GPT API quota tracking, and Mac menu-bar quota display are now supported. Glass and Nexus skins are also available.", supporterSkins: "Designer skins", choose: "1. Skin preview (click to view full size)", device: "Option 1: Send the skin name and copied device code to the designer", purchaseMethod: "Option 2", buy: "Buy on Ko-fi ↗", creatorPlatforms: "Designer contact", license: "3. Paste the received license to unlock", copy: "Copy", copied: "Copied", loadingCode: "Generating device code…", codeUnavailable: "Device code is temporarily unavailable", copyFailed: "Copy failed. Try again.", owned: "Owned", placeholder: "Paste the complete license JSON", activate: "Verify license", working: "Verifying…", ready: "Choose skins from the system tray.", verifying: "Verifying the license for this device…", activated: "License verified. Enable the unlocked skin from the system-tray Theme menu.", failed: "License verification failed. Try again shortly." } } as const;
type PreviewSkin = Exclude<WidgetSkin, "default">;
// Keep prices in UI data rather than in the preview artwork. Update this table
// when storefront prices change; no online exchange-rate lookup is performed.
const choices: Array<{ id: PreviewSkin; name: Record<Language, string>; price: Record<Language, string>; thumbnail: string }> = [
  { id: "blur", name: { "zh-CN": "Blur", en: "Blur" }, price: { "zh-CN": "¥2", en: "$1" }, thumbnail: blurThumbnailUrl },
  { id: "computer", name: { "zh-CN": "Computer", en: "Computer" }, price: { "zh-CN": "¥4", en: "$2" }, thumbnail: computerThumbnailUrl },
  { id: "glass", name: { "zh-CN": "Glass", en: "Glass" }, price: { "zh-CN": "¥4", en: "$2" }, thumbnail: glassThumbnailUrl },
  { id: "nexus", name: { "zh-CN": "Nexus", en: "Nexus" }, price: { "zh-CN": "¥8", en: "$3" }, thumbnail: nexusThumbnailUrl },
];
const previewStatus: SupporterStatus = { requestCode: "QF1-DEMO-DEVICE-CODE", active: true, message: "Supporter licenses are active.", unlockedSkin: "blur", unlockedSkins: ["blur", "computer"], selectedSkin: "blur", availableSkins: ["default", "blur", "computer"] };

export function SupporterPanel({ onStatus, preview = false, previewLanguage, celebrationKey = 0 }: { onStatus: (status: SupporterStatus) => void; preview?: boolean; previewLanguage?: Language; celebrationKey?: number }) {
  const [status, setStatus] = useState<SupporterStatus | null>(null); const [requestedSkin, setRequestedSkin] = useState<PreviewSkin>("blur"); const [license, setLicense] = useState(""); const [busy, setBusy] = useState(false); const [copied, setCopied] = useState(false); const [language, setLanguage] = useState<Language>("zh-CN"); const [message, setMessage] = useState(""); const [statusError, setStatusError] = useState(false); const [showLike, setShowLike] = useState(false); const t = labels[language];
  useEffect(() => { if (preview) { setStatus(previewStatus); return; } void getSupporterStatus().then((value) => { setStatus(value); setStatusError(false); onStatus(value); }).catch(() => setStatusError(true)); }, [preview]);
  useEffect(() => { if (previewLanguage) { setLanguage(previewLanguage); return; } void getPreferences().then((value) => setLanguage(normalizeLanguage(value.language))); let cleanup = () => {}; void listenDesktopEvents({ onPreferences: (value) => setLanguage(normalizeLanguage(value.language)), onRefresh: () => {}, onUpdate: () => {} }).then((unlisten) => { cleanup = unlisten; }); return () => cleanup(); }, [previewLanguage]);
  const celebrate = () => { setShowLike(false); window.requestAnimationFrame(() => setShowLike(true)); window.setTimeout(() => setShowLike(false), 1_600); };
  useEffect(() => { if (celebrationKey > 0) celebrate(); }, [celebrationKey]);
  const activate = () => { if (!license.trim()) return; setBusy(true); setMessage(t.verifying); void activateSupporterLicense(license).then((value) => { setStatus(value); onStatus(value); setLicense(""); setMessage(t.activated); celebrate(); }).catch(() => setMessage(t.failed)).finally(() => setBusy(false)); };
  const previewDialog = useRef<HTMLDialogElement>(null);
  const selectedPreview = choices.find((skin) => skin.id === requestedSkin)!;
  const deviceCode = status?.requestCode;
  const copyCode = () => { if (!deviceCode) return; void navigator.clipboard.writeText(deviceCode).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }).catch(() => setMessage(t.copyFailed)); };
  return <main className="supporter-panel" aria-label={t.title}>
    {showLike ? <img className="supporter-like-burst" src={likeIconUrl} alt="" aria-hidden="true" /> : null}
    <dialog ref={previewDialog} className="skin-preview-dialog" aria-label={selectedPreview.name[language]} onClick={(event) => { if (event.target === event.currentTarget) previewDialog.current?.close(); }}><button type="button" autoFocus onClick={() => previewDialog.current?.close()} aria-label={language === "zh-CN" ? "关闭预览" : "Close preview"}>×</button><img src={selectedPreview.thumbnail} alt={selectedPreview.name[language]} /></dialog>
    <header className="supporter-brand"><div className="supporter-logo"><img src={logoUrl} alt="Quota Float" /><span>Quota-float</span></div></header>
    <h1>{t.title}</h1>
    <p className="supporter-description">{t.description}</p>
    <section className="supporter-workflow">
      <h2>{t.supporterSkins}</h2>
      <div className="supporter-step"><span>{t.choose}</span><div className="supporter-skins">{choices.map((skin) => { const owned = status?.availableSkins.some((id) => id === skin.id) ?? false; return <button key={skin.id} type="button" disabled={busy} className={`${requestedSkin === skin.id ? "is-selected" : ""}${owned ? " is-owned" : ""}`} aria-pressed={requestedSkin === skin.id} aria-haspopup="dialog" onClick={() => { setRequestedSkin(skin.id); previewDialog.current?.showModal(); }}><img src={skin.thumbnail} alt={skin.name[language]} /><span className="skin-choice-price" aria-label={`${skin.name[language]} ${skin.price[language]}`}><b>{skin.name[language]}</b><strong>{skin.price[language]}</strong></span>{owned ? <em className="skin-owned-badge">{t.owned}</em> : null}</button>; })}</div></div>
      <div className="supporter-step"><span>{t.device}</span><div className="supporter-code"><code>{deviceCode ?? (statusError ? t.codeUnavailable : t.loadingCode)}</code><button type="button" disabled={!deviceCode} onClick={copyCode} aria-live="polite">{copied ? t.copied : t.copy}</button></div></div>
      <section className="supporter-platforms" aria-label={t.creatorPlatforms}>
        <strong>{t.creatorPlatforms}</strong>
        <div className="supporter-platform-grid">
          <article className="supporter-platform-card"><div><b>小红书</b><span>Change设计师</span><small>350939939</small></div><a className="supporter-platform-link" href="https://xhslink.cn/o/7iGbWDEkuMO" onClick={(event) => { event.preventDefault(); void openExternalUrl(event.currentTarget.href); }} aria-label="打开小红书主页"><ArrowUpRight aria-hidden="true" size={13} weight="bold" /></a></article>
          <article className="supporter-platform-card"><div><b>抖音</b><span>Change | UI设计师</span><small>1872422843</small></div><a className="supporter-platform-link" href="https://v.douyin.com/Wsw9ZoB87uI/" onClick={(event) => { event.preventDefault(); void openExternalUrl(event.currentTarget.href); }} aria-label="打开抖音主页"><ArrowUpRight aria-hidden="true" size={13} weight="bold" /></a></article>
          <article className="supporter-platform-card"><div><b>X</b><span>@Spacelooklook</span></div><a className="supporter-platform-link" href="https://x.com/Spacelooklook" onClick={(event) => { event.preventDefault(); void openExternalUrl(event.currentTarget.href); }} aria-label="打开 X 主页"><ArrowUpRight aria-hidden="true" size={13} weight="bold" /></a></article>
        </div>
      </section>
      <section className="supporter-step"><span>{t.purchaseMethod}</span><a className="supporter-purchase" href="https://ko-fi.com/change42/shop" onClick={(event) => { event.preventDefault(); void openExternalUrl(event.currentTarget.href); }}>{t.buy}</a></section>
      <label className="supporter-step"><span>{t.license}</span><textarea value={license} onChange={(event) => setLicense(event.target.value)} placeholder={t.placeholder} rows={4} /></label>
    </section>
    <button type="button" className="supporter-primary" disabled={busy || !license.trim()} onClick={activate}>{busy ? t.working : t.activate}</button>
    <p className="supporter-status" role="status">{message || t.ready}</p>
    <section className="supporter-legal" aria-label={language === "zh-CN" ? "许可提示" : "License notice"}><strong>{language === "zh-CN" ? "许可与使用提醒" : "License and use reminder"}</strong><p>{language === "zh-CN" ? "许可证绑定当前设备，请勿公开分享；仅解锁皮肤，不改变额度或账户权限。服务状态以官方页面为准，换机或求助请携设备码联系开发者。" : "Keep your device-bound license private. It unlocks skins only, without changing quotas or account permissions. Check official pages for service status. For a new device or help, contact the developer with your device code."}</p></section>
  </main>;
}
