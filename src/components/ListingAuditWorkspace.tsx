import { useMemo, useState, type ChangeEvent, type ClipboardEvent } from "react";
import { createWorker } from "tesseract.js";
import { AlertCircle, CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, FileUp, LockKeyhole, RotateCcw, ShieldCheck } from "lucide-react";
import { buildEtsyWorkflowPackage } from "../lib/etsyPromptPackage";

type RequirementId = "shop-stats" | "listing-performance" | "traffic-sources";
type UploadAnalysis = { rows: number; headers: string[]; numeric: Array<{ label: string; value: number }> };
type UploadRecord = { fileName: string; uploadedAt: string; periodStart: string; periodEnd: string; size: number; pasted?: boolean; reviewed?: boolean; contentPreview?: string; analysis?: UploadAnalysis };
type Listing = { id: string; title: string; role: "canonical" | "no-touch"; tone: string };

const LISTINGS: Listing[] = [
  { id: "demo-listing-a", title: "Sample active listing", role: "canonical", tone: "border-brand/25 bg-[#FFF1E8]" },
  { id: "demo-listing-b", title: "Sample protected comparison", role: "no-touch", tone: "border-line bg-[#F8F3ED]" },
];

const REQUIREMENTS: Array<{ id: RequirementId; label: string; detail: string; scope: "shop" | "listing" | "traffic" }> = [
  { id: "shop-stats", label: "Shop Stats overview", detail: "Visits · Orders · Conversion Rate · Revenue", scope: "shop" },
  { id: "listing-performance", label: "Listing performance", detail: "Views · Favorites · Orders · Revenue", scope: "listing" },
  { id: "traffic-sources", label: "Traffic Sources / Etsy Search", detail: "來源渠道及 Etsy Search 數據", scope: "traffic" },
];
const EXPECTED_METRICS: Record<RequirementId, string[]> = {
  "shop-stats": ["visits", "orders", "conversion rate", "revenue"],
  "listing-performance": ["views", "favorites", "orders", "revenue"],
  "traffic-sources": ["visits", "views", "clicks", "impressions"],
};

const DEFAULT_PERIOD = { start: "2026-08-01", end: "2026-08-07" };
function storageKey(listingId: string) { return `etsy-audit-workspace:${listingId}`; }
function readUploads(listingId: string): Partial<Record<RequirementId, UploadRecord>> {
  try { const value = JSON.parse(localStorage.getItem(storageKey(listingId)) ?? "{}"); return value && typeof value === "object" ? value : {}; } catch { return {}; }
}
function formatBytes(bytes: number) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`; return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
function isMetricHeader(label: string) { return /^(visits?|views?|favorites?|orders?|revenue|quantity|price|sales|conversion\s*rate|clicks?|impressions?)$/i.test(label.replace(/[_-]+/g, " ").trim()); }
function parseCsvAnalysis(text: string): UploadAnalysis | undefined {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return undefined;
  const split = (line: string) => line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map((cell) => cell.replace(/^\"|\"$/g, "").trim());
  const headers = split(lines[0]);
  const numeric = headers.map((label, index) => ({ label, value: lines.slice(1).reduce((sum, line) => { const value = Number(split(line)[index]?.replace(/[$,%]/g, "")); return Number.isFinite(value) ? sum + value : sum; }, 0) })).filter((item) => item.value !== 0 && isMetricHeader(item.label)).slice(0, 8);
  return { rows: lines.length - 1, headers, numeric };
}
function parsePastedAnalysis(text: string): UploadAnalysis | undefined {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return undefined;
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(delimiter).map((cell) => cell.trim().replace(/^\"|\"$/g, ""));
  const numeric = headers.map((label, index) => ({ label, value: lines.slice(1).reduce((sum, line) => { const value = Number((line.split(delimiter)[index] ?? "").replace(/[$,%]/g, "").trim()); return Number.isFinite(value) ? sum + value : sum; }, 0) })).filter((item) => item.value !== 0 && isMetricHeader(item.label)).slice(0, 8);
  return { rows: lines.length - 1, headers, numeric };
}
function normalizeMetric(label: string) { return label.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim(); }
function missingMetrics(requirementId: RequirementId, analysis?: UploadAnalysis) { const labels = new Set((analysis?.numeric ?? []).map((item) => normalizeMetric(item.label))); return EXPECTED_METRICS[requirementId].filter((metric) => !labels.has(metric)); }

export default function ListingAuditWorkspace() {
  const [selectedId, setSelectedId] = useState(LISTINGS[0].id);
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const [uploads, setUploads] = useState(() => readUploads(LISTINGS[0].id));
  const [notice, setNotice] = useState<string | null>(null);
  const [auditRequested, setAuditRequested] = useState(false);
  const [pasteTarget, setPasteTarget] = useState<RequirementId | null>(null);
  const [pasteValue, setPasteValue] = useState("");
  const [pastedImage, setPastedImage] = useState<string | null>(null);
  const selected = LISTINGS.find((listing) => listing.id === selectedId) ?? LISTINGS[0];
  const validPeriod = period.start === DEFAULT_PERIOD.start && period.end === DEFAULT_PERIOD.end;
  const receivedCount = REQUIREMENTS.filter((requirement) => uploads[requirement.id]).length;
  const pendingReview = REQUIREMENTS.some((requirement) => uploads[requirement.id]?.pasted && uploads[requirement.id]?.reviewed !== true);
  const allMetricsReady = REQUIREMENTS.every((requirement) => Boolean(uploads[requirement.id]?.analysis) && missingMetrics(requirement.id, uploads[requirement.id]?.analysis).length === 0);
  const complete = receivedCount === REQUIREMENTS.length && validPeriod && !pendingReview;
  const nextAction = !validPeriod ? "Set the audit period to 2026-08-01 → 2026-08-07" : receivedCount < REQUIREMENTS.length ? `Upload ${REQUIREMENTS.length - receivedCount} missing evidence item(s)` : pendingReview ? "Review and confirm the OCR results" : allMetricsReady ? "Prepare the read-only audit" : "Prepare audit with evidence gaps clearly marked";
  const status = useMemo(() => {
    if (auditRequested && complete) return { label: "Audit ready", tone: "text-sage" };
    if (!validPeriod) return { label: "Date range needs attention", tone: "text-brand" };
    if (pendingReview) return { label: "OCR review required", tone: "text-brand" };
    if (receivedCount === REQUIREMENTS.length && !allMetricsReady) return { label: "Ready with evidence gaps", tone: "text-copper" };
    if (receivedCount === 0) return { label: "Waiting for uploads", tone: "text-copper" };
    return { label: `${REQUIREMENTS.length - receivedCount} upload(s) missing`, tone: "text-brand" };
  }, [allMetricsReady, auditRequested, complete, pendingReview, receivedCount, validPeriod]);

  function selectListing(id: string) { setSelectedId(id); setUploads(readUploads(id)); setNotice(null); setAuditRequested(false); }
  function confirmOcr(requirementId: RequirementId) { const record = uploads[requirementId]; if (!record) return; const next = { ...uploads, [requirementId]: { ...record, reviewed: true } }; setUploads(next); localStorage.setItem(storageKey(selectedId), JSON.stringify(next)); setNotice("OCR 結果已確認，可以納入 read-only audit"); setAuditRequested(false); }
  function reanalyse(requirementId: RequirementId) { const record = uploads[requirementId]; if (!record?.contentPreview) { setNotice("No local content available to re-analyse"); return; } const analysis = record.pasted ? parsePastedAnalysis(record.contentPreview) : parseCsvAnalysis(record.contentPreview); const next = { ...uploads, [requirementId]: { ...record, analysis, reviewed: record.pasted ? false : record.reviewed } }; setUploads(next); localStorage.setItem(storageKey(selectedId), JSON.stringify(next)); setNotice("Local data re-analysed"); setAuditRequested(false); }
  function auditPackageText() { return [`ETSY READ-ONLY AUDIT PACKAGE`, `Listing: ${selected.title} (${selected.id})`, `Period: ${period.start} to ${period.end}`, `Generated: ${new Date().toISOString()}`, "", ...REQUIREMENTS.flatMap((requirement) => { const record = uploads[requirement.id]; const analysis = record?.analysis; const missing = missingMetrics(requirement.id, analysis); return [`[${requirement.label}]`, `Status: ${!record ? "missing" : record.pasted ? (record.reviewed ? "OCR confirmed" : "OCR pending") : "CSV received"}`, `File: ${record?.fileName ?? "none"}`, `Rows: ${analysis?.rows ?? "not parsed"}`, `Headers: ${analysis?.headers.join(", ") || "none"}`, `Metrics: ${analysis?.numeric.map((item) => `${item.label}=${item.value}`).join(", ") || "none"}`, `Evidence gaps: ${missing.join(", ") || "none"}`, ""]; })].join("\n"); }
  async function copyAuditPackage() { try { await navigator.clipboard.writeText(await buildEtsyWorkflowPackage({ stage: "listing-audit", exactContext: { listingId: selected.id, periodStart: period.start, periodEnd: period.end }, allowedInputs: [auditPackageText()], evidenceRefs: REQUIREMENTS.flatMap((requirement) => uploads[requirement.id]?.fileName ? [uploads[requirement.id]!.fileName] : []), nextActionBoundary: nextAction })); setNotice("Read-only listing-audit stage packet copied. Paste it into Codex for analysis."); } catch { setNotice("Copy failed. The listing-audit packet or browser clipboard is unavailable."); } }
  function updatePeriod(event: ChangeEvent<HTMLInputElement>) { setPeriod((current) => ({ ...current, [event.target.name]: event.target.value })); setNotice(null); setAuditRequested(false); }
  function handleUpload(requirementId: RequirementId, event: ChangeEvent<HTMLInputElement>) {
    const uploadedFile = event.target.files?.[0];
    if (uploadedFile && (uploadedFile.name.toLowerCase().endsWith(".csv") || uploadedFile.name.toLowerCase().endsWith(".tsv"))) {
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === "string" ? reader.result : "";
        const analysis = parseCsvAnalysis(text);
        const next = { ...uploads, [requirementId]: { fileName: uploadedFile.name, uploadedAt: new Date().toISOString(), periodStart: period.start, periodEnd: period.end, size: uploadedFile.size, analysis, contentPreview: text.slice(0, 4000) } };
        setUploads(next); localStorage.setItem(storageKey(selectedId), JSON.stringify(next)); setNotice(`${uploadedFile.name} saved; local analysis completed`); setAuditRequested(false); event.target.value = "";
      };
      reader.readAsText(uploadedFile);
      return;
    }
    const file = event.target.files?.[0]; if (!file) return;
    const next = { ...uploads, [requirementId]: { fileName: file.name, uploadedAt: new Date().toISOString(), periodStart: period.start, periodEnd: period.end, size: file.size } };
    setUploads(next); localStorage.setItem(storageKey(selectedId), JSON.stringify(next)); setNotice(`${file.name} 已留在本機 browser draft；未上傳到外部服務。`); setAuditRequested(false); event.target.value = "";
  }
  function handleImagePaste(event: ClipboardEvent<HTMLDivElement>) {
    const image = Array.from(event.clipboardData.items).map((item) => item.kind === "file" ? item.getAsFile() : null).find((file): file is File => Boolean(file?.type.startsWith("image/")));
    if (!image) return;
    event.preventDefault();
    const reader = new FileReader();
    reader.onload = () => setPastedImage(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(image);
    setPasteValue("");
    setNotice("已貼上圖片預覽；請按 Save pasted screenshot 保存。");
  }
  function savePastedData(requirementId: RequirementId) {
    if (pastedImage) {
      setNotice("正在本機 OCR 分析截圖…");
      void (async () => {
        const worker = await createWorker("eng");
        const result = await worker.recognize(pastedImage);
        const text = result.data.text.trim();
        const next = { ...uploads, [requirementId]: { fileName: "pasted-screenshot.png", uploadedAt: new Date().toISOString(), periodStart: period.start, periodEnd: period.end, size: Math.round(pastedImage.length * 0.75), pasted: true, contentPreview: text.slice(0, 4000), analysis: parsePastedAnalysis(text) } };
        localStorage.setItem(storageKey(selectedId), JSON.stringify(next));
        await worker.terminate();
        setUploads(next); setPasteTarget(null); setPastedImage(null); setNotice(text ? "截圖已儲存，Dashboard 已完成本機 OCR 分析" : "截圖已儲存，但 OCR 未讀到文字"); setAuditRequested(false);
      })();
      return;
    }
    if (pastedImage) {
      const next = { ...uploads, [requirementId]: { fileName: "pasted-screenshot.png", uploadedAt: new Date().toISOString(), periodStart: period.start, periodEnd: period.end, size: Math.round(pastedImage.length * 0.75), pasted: true, contentPreview: pastedImage } };
      try { localStorage.setItem(storageKey(selectedId), JSON.stringify(next)); } catch { setNotice("圖片太大，browser 無法保存；請改用較細 screenshot 或 CSV。"); return; }
      setUploads(next); setPasteTarget(null); setPastedImage(null); setNotice("已保存 pasted screenshot 到本機 browser draft；未上傳到外部服務。"); setAuditRequested(false); return;
    }
    const text = pasteValue.trim();
    if (!text) return;
    const next = { ...uploads, [requirementId]: { fileName: "pasted-data.txt", uploadedAt: new Date().toISOString(), periodStart: period.start, periodEnd: period.end, size: new Blob([text]).size, pasted: true, contentPreview: text.slice(0, 4000), analysis: parsePastedAnalysis(text) } };
    setUploads(next); localStorage.setItem(storageKey(selectedId), JSON.stringify(next)); setPasteTarget(null); setPasteValue(""); setPastedImage(null); setNotice("已保存 pasted data 到本機 browser draft；未上傳到外部服務。"); setAuditRequested(false);
  }
  function resetListing() { localStorage.removeItem(storageKey(selectedId)); setUploads({}); setPasteTarget(null); setPasteValue(""); setPastedImage(null); setAuditRequested(false); setNotice("呢個 listing 嘅本機 upload draft 已清除；原始檔案冇被刪除。"); }
  function requestAudit() {
    if (!validPeriod) { setNotice("Audit 暫停：請先用 2026-08-01 至 2026-08-07 嘅資料期間。"); return; }
    if (!complete) { setNotice("Audit 暫停：請先補齊所有三類資料。"); return; }
    setAuditRequested(true); setNotice("資料完整度已達 100%；下一步可以交由 Codex 做 read-only audit。");
  }

  return (
    <section className="rounded-[26px] border border-brand/25 bg-panel p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-brand"><ClipboardCheck size={18} /><span className="text-xs font-semibold uppercase tracking-[0.16em]">Listing audit workspace</span></div>
          <h2 className="mt-2 font-display text-2xl font-bold text-ink">逐個 listing 收資料，再開 audit</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">先選 listing，再按資料期間逐項補交。檔案只保留喺本機 browser draft；Dashboard 唔會登入 Etsy、發布或自動修改任何內容。</p>
        </div>
        <div className={`flex items-center gap-2 text-sm font-bold ${status.tone}`}>{complete ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}{status.label}</div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {LISTINGS.map((listing) => { const active = listing.id === selectedId; return (
          <button key={listing.id} type="button" onClick={() => selectListing(listing.id)} aria-pressed={active} className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${listing.tone} ${active ? "ring-2 ring-brand ring-offset-2 ring-offset-[#F7F0E8]" : ""}`}>
            <div className="flex items-start gap-3"><span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/75 text-brand"><ChevronRight size={17} /></span><span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="font-semibold text-ink">{listing.title}</span><span className="rounded-full bg-white/75 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{listing.role}</span></span><span className="mt-1 block font-mono text-xs text-muted">{listing.id}</span></span></div>
          </button>
        ); })}
      </div>

      <div className="mt-5 grid gap-4 rounded-2xl border border-line bg-[#FBF7F2] p-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <label className="text-xs font-semibold text-ink">Audit period start<span className="mt-1.5 flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 font-normal"><CalendarDays size={15} className="text-muted" /><input name="start" type="date" value={period.start} onChange={updatePeriod} className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" /></span></label>
        <label className="text-xs font-semibold text-ink">Audit period end<span className="mt-1.5 flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 font-normal"><CalendarDays size={15} className="text-muted" /><input name="end" type="date" value={period.end} onChange={updatePeriod} className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" /></span></label>
        <div className={`rounded-xl border px-3 py-2 text-xs ${validPeriod ? "border-sage/25 bg-[#E8F0E6] text-sage" : "border-brand/25 bg-[#FFF1E8] text-brand"}`}>{validPeriod ? "符合 8 月 8 日 Day 7 audit" : "目標：2026-08-01 → 2026-08-07"}</div>
      </div>

      <div className="mt-5 rounded-2xl border border-copper/25 bg-[#FFF8F1] p-4"><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-copper">Next action</div><div className="mt-1 text-base font-bold text-ink">{nextAction}</div><div className="mt-2 text-xs leading-5 text-muted">CSV is first-party evidence. Screenshot OCR remains provisional until you confirm it. Missing metrics will be carried into the audit as evidence gaps, not silently treated as zero.</div></div>

      <details className="mt-4 rounded-2xl border border-line bg-white p-4"><summary className="cursor-pointer text-sm font-bold text-ink">What to capture from Etsy</summary><div className="mt-3 grid gap-3 text-xs leading-5 text-muted md:grid-cols-3"><div><div className="font-semibold text-ink">1. Shop Stats overview</div>Stats overview for the audit period: Visits, Orders, Conversion Rate, Revenue. Upload CSV where available.</div><div><div className="font-semibold text-ink">2. Listing performance</div>Shop Manager → Stats → Shoppers viewed your listings. Capture the locally selected listing with Views, Favorites, Orders and Revenue.</div><div><div className="font-semibold text-ink">3. Traffic / Etsy Search</div>Capture Traffic Sources and Etsy Search terms for the same period. Include the column headings and all visible figures.</div></div></details>

      <div className="mt-5 space-y-3">
        {REQUIREMENTS.map((requirement) => { const record = uploads[requirement.id]; return (
          <div key={requirement.id} className="rounded-2xl border border-line bg-white p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${record ? "bg-[#E8F0E6] text-sage" : "bg-[#FFF1E8] text-brand"}`}>{record ? <CheckCircle2 size={17} /> : <FileUp size={17} />}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-ink">{requirement.label}</span><span className="rounded-full border border-line px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{requirement.scope}</span></div><div className="mt-1 text-xs leading-5 text-muted">{requirement.detail}</div>{record && <div className="mt-2 break-all text-xs text-sage">{record.fileName} · {formatBytes(record.size)} · {record.periodStart} → {record.periodEnd}</div>}</div></div><div className="flex shrink-0 flex-wrap gap-2"><button type="button" onClick={() => { setPasteTarget(pasteTarget === requirement.id ? null : requirement.id); setPasteValue(""); setPastedImage(null); }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-[#FBF7F2] px-3 py-2 text-xs font-bold text-ink transition hover:bg-[#F8EDE4]">Paste data / image</button><label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-brand/25 bg-[#FFF7F0] px-3 py-2 text-xs font-bold text-brand transition hover:bg-[#FFF1E8]"><FileUp size={15} />{record ? "Replace file" : "Upload file"}<input type="file" accept=".csv,.tsv,.json,image/*,.pdf" className="sr-only" onChange={(event) => handleUpload(requirement.id, event)} /></label></div></div>{pasteTarget === requirement.id && <div className="mt-4 border-t border-line pt-4"><div role="button" tabIndex={0} onPaste={handleImagePaste} className="rounded-xl border border-dashed border-brand/35 bg-[#FFF7F0] px-3 py-3 text-xs leading-5 text-muted outline-none focus:ring-2 focus:ring-brand"><span className="font-semibold text-ink">Copy screenshot → click here → Ctrl+V</span><br />圖片會即時預覽，然後按 Save pasted screenshot。</div>{pastedImage && <img src={pastedImage} alt="Pasted screenshot preview" className="mt-3 max-h-64 w-full rounded-xl border border-line object-contain" />}<label className="mt-3 block text-xs font-semibold text-ink">或者 paste copied text<textarea autoFocus={!pastedImage} value={pasteValue} onChange={(event) => setPasteValue(event.target.value)} placeholder="由 Etsy copy 文字、CSV rows 或 search terms，直接貼喺呢度……" className="mt-1.5 min-h-24 w-full rounded-xl border border-line bg-[#FBF7F2] px-3 py-2 text-xs font-normal text-ink outline-none focus:border-brand" /></label><div className="mt-2 flex flex-wrap items-center gap-2"><button type="button" onClick={() => savePastedData(requirement.id)} disabled={!pasteValue.trim() && !pastedImage} className="rounded-xl bg-ink px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Save pasted {pastedImage ? "screenshot" : "data"}</button><span className="text-[11px] text-muted">會記錄日期、listing 同資料類型；只保存喺本機。</span></div></div>}</div>
        ); })}
      </div>

      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-copper/25 bg-[#F9EEE4] p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-copper" /><div><div className="text-sm font-semibold text-ink">{selected.title} · {receivedCount}/{REQUIREMENTS.length} files received</div><div className="mt-1 text-xs leading-5 text-muted">只有日期正確及三類資料齊全，Audit gate 先會開啟；{selected.role === "no-touch" ? "此 listing 只作 observation，不代表批准修改。" : "此 listing 仍然只可 read-only audit。"}</div></div></div><div className="flex shrink-0 flex-wrap gap-2"><button type="button" onClick={resetListing} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-muted hover:bg-white hover:text-ink"><RotateCcw size={14} /> Clear local draft</button><button type="button" onClick={requestAudit} className="inline-flex items-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-xs font-bold text-white transition hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50" disabled={!complete}><LockKeyhole size={14} /> {auditRequested ? "Audit gate ready" : "Prepare read-only audit"}</button></div></div>
      {pendingReview && <div className="mt-4 rounded-2xl border border-brand/25 bg-[#FFF1E8] p-4"><div className="text-sm font-bold text-brand">OCR result review required</div><div className="mt-1 text-xs leading-5 text-muted">請核對截圖讀到嘅文字及數字；確認後先可以開始 audit。</div>{REQUIREMENTS.filter((requirement) => uploads[requirement.id]?.pasted && uploads[requirement.id]?.reviewed !== true).map((requirement) => <button key={requirement.id} type="button" onClick={() => confirmOcr(requirement.id)} className="mt-3 mr-2 rounded-xl bg-brand px-3 py-2 text-xs font-bold text-white">Confirm {requirement.label}</button>)}</div>}
      {receivedCount > 0 && <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-bold text-ink">Send data to Codex</div><div className="mt-1 text-xs leading-5 text-muted">Copy a structured read-only audit package containing source status, metrics and evidence gaps. No Etsy login data is included.</div></div><button type="button" onClick={copyAuditPackage} className="shrink-0 rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white hover:bg-brand">Copy audit package</button></div>}
      {notice && <div role="status" className="mt-3 rounded-xl border border-sage/25 bg-[#E8F0E6] px-4 py-3 text-xs font-semibold text-sage">{notice}</div>}
      <div className="mt-4 rounded-2xl border border-line bg-[#FBF7F2] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-bold text-ink">Data quality summary</div><div className="text-xs font-semibold text-muted">{Math.round((receivedCount / REQUIREMENTS.length) * 100)}% received · {allMetricsReady ? "ready" : "metrics incomplete"}</div></div><div className="mt-3 grid gap-2 lg:grid-cols-3">{REQUIREMENTS.map((requirement) => { const record = uploads[requirement.id]; const analysis = record?.analysis; const missing = missingMetrics(requirement.id, analysis); const statusLabel = !record ? "Missing" : record.pasted && !record.reviewed ? "OCR pending review" : !analysis ? "Received" : missing.length ? "Partial" : record.pasted ? "OCR confirmed" : "CSV verified"; const statusTone = !record || statusLabel === "Partial" || statusLabel === "OCR pending review" ? "text-brand" : statusLabel === "Received" ? "text-copper" : "text-sage"; return <div key={requirement.id} className="rounded-xl border border-line bg-white p-3"><div className="flex items-start justify-between gap-2"><div className="text-xs font-semibold text-ink">{requirement.label}</div><span className={`text-[10px] font-bold uppercase tracking-[0.08em] ${statusTone}`}>{statusLabel}</span></div>{analysis ? <><div className="mt-2 text-xs text-muted">{analysis.rows} rows · {analysis.headers.length} headers</div><div className="mt-1 break-words text-[10px] leading-4 text-muted">Fields: {analysis.headers.slice(0, 5).join(", ")}{analysis.headers.length > 5 ? "…" : ""}</div>{analysis.numeric.length > 0 && <div className="mt-1 text-[10px] font-semibold text-sage">Metrics: {analysis.numeric.map((item) => `${item.label} ${item.value}`).join(" · ")}</div>}{missing.length > 0 && <div className="mt-1 text-[10px] font-semibold text-brand">Missing metrics: {missing.join(", ")}</div>}</> : record ? <div className="mt-2 text-xs text-copper">File received; no structured analysis</div> : <div className="mt-2 text-xs text-muted">Upload required</div>}{record?.contentPreview && <button type="button" onClick={() => reanalyse(requirement.id)} className="mt-2 rounded-lg border border-line px-2 py-1 text-[10px] font-bold text-ink hover:bg-[#F8EDE4]">Re-analyse</button>}</div>; })}</div></div>
      {auditRequested && complete && <div className="mt-4 rounded-2xl border border-sage/25 bg-[#EEF3EC] p-4"><div className="text-sm font-bold text-sage">Dashboard analysis preview</div><div className="mt-3 grid gap-2 sm:grid-cols-3">{REQUIREMENTS.map((requirement) => { const analysis = uploads[requirement.id]?.analysis; return <div key={requirement.id} className="rounded-xl border border-sage/20 bg-white/70 p-3"><div className="text-xs font-semibold text-ink">{requirement.label}</div>{analysis ? <><div className="mt-2 text-lg font-bold text-ink">{analysis.rows} rows</div><div className="mt-1 text-[11px] leading-4 text-muted">{analysis.numeric.length ? analysis.numeric.map((item) => `${item.label}: ${item.value}`).join(" · ") : "Headers found; no numeric totals"}</div></> : <div className="mt-2 text-xs text-copper">已接收，圖片 OCR 尚未加入</div>}</div>; })}</div></div>}
    </section>
  );
}
