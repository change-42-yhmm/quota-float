import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, ClipboardText, Copy, FileArrowUp, Key, ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import "./copy-feedback.css";
import "./copy-feedback.css";

type Skin = "blur" | "computer";
type View = "issue" | "ledger";
type IssuedLicense = { license: string; licenseId: string; issuedAt: string; devicePrefix: string; ledgerPath?: string; ledgerError?: string };
type LedgerRecord = { issuedAt: string; buyerName: string; orderNumber: string; skinId: Skin; deviceRequestCode: string; licenseId: string; keyId: string; status: "issued" | "cancelled"; cancelledAt?: string; cancellationNote?: string };
const DEVICE_CODE = /^QF1-[A-Z0-9-]{8,}$/i;

export function App() {
  const [view, setView] = useState<View>("issue");
  const [skinId, setSkinId] = useState<Skin>("blur");
  const [deviceCode, setDeviceCode] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [keyName, setKeyName] = useState("");
  const [issued, setIssued] = useState<IssuedLicense | null>(null);
  const [records, setRecords] = useState<LedgerRecord[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const copyTimerRef = useRef<number | null>(null);
  const validCode = DEVICE_CODE.test(deviceCode.trim());
  const canIssue = validCode && privateKey.trim().length > 0 && buyerName.trim().length > 0 && orderNumber.trim().length > 0 && !busy;
  const preview = useMemo(() => deviceCode.trim().slice(0, 16) || "QF1-…", [deviceCode]);
  const loadLedger = async () => {
    try { setRecords(await invoke<LedgerRecord[]>("list_ledger")); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "无法读取本地签发台账。"); }
  };
  useEffect(() => { if (view === "ledger") void loadLedger(); }, [view]);
  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
  }, []);

  async function issue() {
    if (!canIssue) return;
    setBusy(true); setError(null); setNotice(null); setCopied(false);
    try {
      const result = await invoke<IssuedLicense>("issue_license", { skinId, deviceHash: deviceCode.trim(), buyerName: buyerName.trim(), orderNumber: orderNumber.trim(), privateKey: privateKey.trim() });
      setIssued(result); setPrivateKey(""); setKeyName("");
      setNotice(result.ledgerError ? `许可证已签发，但台账未写入：${result.ledgerError}` : "许可证已签发并写入本地台账；私钥已从当前界面清除。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "签发失败，请检查设备码和私钥。"); }
    finally { setBusy(false); }
  }

  async function copyLicense() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.license);
      setError(null);
      setNotice("许可证 JSON 已复制到剪贴板。");
      setCopied(true);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 1800);
    } catch {
      setCopied(false);
      setNotice(null);
      setError("复制失败，请手动选择许可证 JSON 后复制。");
    }
  }

  useEffect(() => {
    if (!issued) return;
    const button = document.querySelector<HTMLButtonElement>(".copy-button");
    if (!button) return;
    button.classList.toggle("is-copied", copied);
    button.setAttribute("aria-label", copied ? "许可证 JSON 已复制" : "复制许可证 JSON");
    const handleCopy = (event: MouseEvent) => {
      event.stopPropagation();
      void copyLicense();
    };
    button.addEventListener("click", handleCopy);
    return () => button.removeEventListener("click", handleCopy);
  }, [issued, copied]);

  useEffect(() => {
    if (!issued) return;
    const button = document.querySelector<HTMLButtonElement>(".copy-button");
    if (!button) return;
    button.classList.toggle("is-copied", copied);
    button.setAttribute("aria-label", copied ? "许可证 JSON 已复制" : "复制许可证 JSON");
    const handleCopy = (event: MouseEvent) => {
      event.stopPropagation();
      void copyLicense();
    };
    button.addEventListener("click", handleCopy);
    return () => button.removeEventListener("click", handleCopy);
  }, [issued, copied]);

  async function cancel(record: LedgerRecord) {
    if (!window.confirm(`确认取消订单「${record.orderNumber}」的本地台账记录吗？这不会使已经激活的客户端许可证失效。`)) return;
    setBusy(true); setError(null);
    try { await invoke("cancel_issuance", { licenseId: record.licenseId }); await loadLedger(); setNotice("已取消本地台账记录。说明：取消仅用于运营记录，不会让客户端许可证失效。"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "无法取消该台账记录。"); }
    finally { setBusy(false); }
  }

  return <main className="issuer-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><ShieldCheck size={25} weight="fill" /></span><div><strong>Quota Float</strong><span>Maintainer Issuer</span></div></div><div className="offline"><span />离线签发器</div></header>
    <nav className="issuer-nav" aria-label="签发器页面"><button className={view === "issue" ? "is-active" : ""} onClick={() => setView("issue")}>签发许可证</button><button className={view === "ledger" ? "is-active" : ""} onClick={() => setView("ledger")}>签发台账</button></nav>
    {view === "issue" ? <><section className="hero"><div><p className="overline">维护者专用</p><h1>签发支持者许可证</h1><p>为用户提供的设备请求码生成已签名的 Blur 或 Computer 许可证。</p></div><div className="security-note"><Key size={20} /><span>私钥仅用于本次签名<br />不会保存、上传或打包</span></div></section>
    <section className="workspace"><div className="form-panel"><div className="step"><span>01</span><div><h2>选择皮肤</h2><p>许可证只解锁内置支持者皮肤。</p></div></div><div className="skin-options">{(["blur", "computer"] as Skin[]).map((skin) => <button type="button" className={skinId === skin ? "skin selected" : "skin"} key={skin} onClick={() => { setSkinId(skin); setIssued(null); }}><span className={`skin-swatch ${skin}`} /><strong>{skin === "blur" ? "Blur" : "Computer"}</strong><small>{skin === "blur" ? "柔焦渐变" : "像素终端"}</small></button>)}</div><div className="step"><span>02</span><div><h2>设备与订单</h2><p>订单名称、订单号、设备码与签发时间都会记录在本地台账。</p></div></div><label className="field"><span>设备请求码</span><textarea value={deviceCode} onChange={(event) => { setDeviceCode(event.target.value.toUpperCase().trim()); setIssued(null); }} placeholder="QF1-XXXX-XXXX-XXXX-XXXX" rows={2} />{deviceCode && !validCode && <em>请输入完整且有效的 QF1 请求码。</em>}</label><div className="order-fields"><label className="field"><span>订单名称</span><input value={buyerName} onChange={(event) => setBuyerName(event.target.value)} placeholder="例如：张三" maxLength={120} /></label><label className="field"><span>订单号</span><input value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} placeholder="例如：#1024" maxLength={120} /></label></div><div className="step"><span>03</span><div><h2>导入私钥并签发</h2><p>从受控电脑的加密位置临时读取 Ed25519 私钥。</p></div></div><input ref={fileRef} className="hidden" type="file" accept=".key,.txt" onChange={async (event) => { const file = event.currentTarget.files?.[0]; if (file) { setPrivateKey((await file.text()).trim()); setKeyName(file.name); } }} /><button className="key-button" type="button" onClick={() => fileRef.current?.click()}><FileArrowUp size={19} />{keyName || "从文件导入私钥"}<small>{keyName ? "已临时读取" : "Base64 · 32-byte seed"}</small></button><button className="issue-button" type="button" disabled={!canIssue} onClick={() => void issue()}>{busy ? "正在签名…" : `签发 ${skinId === "blur" ? "Blur" : "Computer"} 许可证`}<CheckCircle size={20} weight="bold" /></button>{!canIssue && !busy && <p className="hint">请填写设备码、订单名称、订单号，并导入私钥后再签发。</p>}{(error || notice) && <p className={error ? "message error" : "message"}>{error ?? notice}</p>}</div><aside className="result-panel"><div className="result-heading"><ClipboardText size={22} /><div><h2>许可证输出</h2><p>{issued ? `已绑定 ${issued.devicePrefix}` : `将绑定 ${preview}`}</p></div></div>{issued ? <><pre>{issued.license}</pre><div className="result-meta"><span>许可证 ID</span><code>{issued.licenseId}</code><span>签发时间</span><code>{new Date(issued.issuedAt).toLocaleString("zh-CN", { hour12: false })}</code>{issued.ledgerPath && <><span>本地台账</span><code title={issued.ledgerPath}>{issued.ledgerPath}</code></>}</div><button className="copy-button" type="button" onClick={() => void navigator.clipboard.writeText(issued.license)}> <Copy size={18} />复制许可证 JSON</button></> : <div className="empty"><WarningCircle size={28} /><p>完成左侧三步后，已签名的许可证 JSON 会显示在这里，并自动写入本地台账。</p></div>}<footer>请仅将许可证 JSON 发送给提供该设备码的用户。不要发送私钥。</footer></aside></section></> : <section className="ledger-panel"><header><p className="overline">本地记录</p><h1>签发台账</h1><p>“已取消”只表示维护者本地记录已取消，不会让已激活的客户端许可证失效。</p></header><div className="ledger-warning"><WarningCircle size={18} />取消后如需继续使用，运营上应要求用户重新提供设备码并重新签发；客户端本身不会自动失效。</div>{records.length ? <div className="ledger-table-wrap"><table><thead><tr><th>状态</th><th>订单名称</th><th>订单号</th><th>皮肤</th><th>设备码</th><th>签发时间</th><th>操作</th></tr></thead><tbody>{records.map((record) => <tr key={record.licenseId}><td><span className={`ledger-status ${record.status}`}>{record.status === "issued" ? "已签发" : "已取消"}</span></td><td>{record.buyerName}</td><td>{record.orderNumber}</td><td>{record.skinId}</td><td><code>{record.deviceRequestCode}</code></td><td>{new Date(record.issuedAt).toLocaleString("zh-CN", { hour12: false })}</td><td>{record.status === "issued" ? <button className="cancel-button" disabled={busy} onClick={() => void cancel(record)}>取消记录</button> : <small>{record.cancelledAt ? `取消于 ${new Date(record.cancelledAt).toLocaleString("zh-CN", { hour12: false })}` : "已取消"}</small>}</td></tr>)}</tbody></table></div> : <div className="ledger-empty">暂无新格式的签发记录。新的许可证会在签发后自动显示在此。</div>}{(error || notice) && <p className={error ? "message error" : "message"}>{error ?? notice}</p>}</section>}
  </main>;
}
