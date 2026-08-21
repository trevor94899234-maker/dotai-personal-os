import { useEffect, useRef } from "react";
import { ClipboardCheck, FileCheck2, FileUp, ShieldCheck, X } from "lucide-react";
import {
  EVIDENCE_INTAKE_REQUIREMENTS,
  buildEvidenceIntakeSteps,
  isEvidenceEligibleForDecision,
  shouldRunOcrBeforeConfirm,
  type EvidenceArtifact,
  type EvidenceIntakeKind,
  type EvidenceKind,
  type EvidenceSource,
  type EtsyOperationsState,
} from "../lib/etsyOperations";

export type EvidenceUploadDraft = {
  file: File | null;
  sourceUrl: string;
  kind: EvidenceKind;
  source: EvidenceSource;
  periodStart: string;
  periodEnd: string;
  targetType: EvidenceArtifact["targetType"];
  targetId: string;
};

export const EVIDENCE_SOURCES: Array<{ id: EvidenceSource; label: string }> = [
  { id: "etsy", label: "Etsy first-party" },
  { id: "erank", label: "eRank" },
  { id: "everbee", label: "EverBee" },
  { id: "owner", label: "Owner-provided" },
  { id: "instagram", label: "Instagram Insights" },
  { id: "pinterest", label: "Pinterest Analytics" },
  { id: "facebook", label: "Facebook / Meta Insights" },
  { id: "threads", label: "Threads Insights" },
];

export const EVIDENCE_KINDS: Array<{ id: EvidenceKind; label: string }> = [
  { id: "shop-stats", label: "Shop Stats overview" },
  { id: "listing-performance", label: "Listing performance" },
  { id: "traffic-sources", label: "Traffic Sources / Etsy Search" },
  { id: "keyword-research", label: "Keyword research" },
  { id: "product-facts", label: "Product facts" },
  { id: "cost-fulfilment", label: "Cost & fulfilment" },
  { id: "design", label: "Design / mockup" },
  { id: "social-results", label: "Social results" },
];

type Props = {
  state: EtsyOperationsState;
  selectedListingId: string;
  period: { start: string; end: string };
  upload: EvidenceUploadDraft;
  reviewArtifact?: EvidenceArtifact;
  onSelectListing: (listingId: string) => void;
  onPeriodChange: (period: { start: string; end: string }) => void;
  onPrepareStep: (kind: EvidenceIntakeKind) => void;
  onUploadChange: <K extends keyof EvidenceUploadDraft>(key: K, value: EvidenceUploadDraft[K]) => void;
  onSaveUpload: () => void;
  onReviewArtifact: (id: string) => void;
  onRunOcr: (artifact: EvidenceArtifact) => void;
  onConfirmArtifact: (id: string) => void;
  onCloseReview: () => void;
  onRemoveArtifact: (id: string) => void;
};

function statusLabel(status: ReturnType<typeof buildEvidenceIntakeSteps>[number]["status"]) {
  if (status === "confirmed") return "Confirmed · eligible";
  if (status === "review") return "Saved · review needed";
  if (status === "not-eligible") return "Confirmed · not decision-ready";
  return "Missing";
}

function statusClass(status: ReturnType<typeof buildEvidenceIntakeSteps>[number]["status"]) {
  if (status === "confirmed") return "border-sage/25 bg-[#E8F0E6] text-sage";
  if (status === "review") return "border-copper/25 bg-[#FFF9F3] text-copper";
  if (status === "not-eligible") return "border-brand/25 bg-[#FFF1E8] text-brand";
  return "border-line bg-white text-muted";
}

function artifactState(artifact: EvidenceArtifact) {
  if (artifact.ownerConfirmed && isEvidenceEligibleForDecision(artifact)) return "owner-confirmed · eligible";
  if (artifact.ownerConfirmed) return "owner-confirmed · not decision-ready";
  if (artifact.mimeType.startsWith("image/") && artifact.ocrStatus === "unreadable") return "unreadable · visual review only";
  if (artifact.mimeType.startsWith("image/") && artifact.ocrStatus === "pending" && artifact.contentText?.trim()) return "OCR complete · review before confirmation";
  if (shouldRunOcrBeforeConfirm(artifact)) return "OCR not run · review needed";
  return "saved locally · review needed";
}

function metricText(artifact: EvidenceArtifact) {
  return artifact.metrics.length
    ? artifact.metrics.map((metric) => `${metric.label}: ${metric.value ?? metric.status}`).join(" · ")
    : "No parsed metrics; keep this source as context only until the relevant values are available.";
}

export default function EvidenceIntakeStepper({
  state,
  selectedListingId,
  period,
  upload,
  reviewArtifact,
  onSelectListing,
  onPeriodChange,
  onPrepareStep,
  onUploadChange,
  onSaveUpload,
  onReviewArtifact,
  onRunOcr,
  onConfirmArtifact,
  onCloseReview,
  onRemoveArtifact,
}: Props) {
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const steps = buildEvidenceIntakeSteps(state, selectedListingId, period.start, period.end);
  const confirmedSteps = steps.filter((step) => step.status === "confirmed").length;
  const periodReady = Boolean(selectedListingId && period.start && period.end && period.start <= period.end);
  const reviewHasDataProblem = reviewArtifact?.metrics.some((metric) => metric.status === "missing" || metric.status === "invalid");
  const reviewNeedsOcr = reviewArtifact ? shouldRunOcrBeforeConfirm(reviewArtifact) : false;
  useEffect(() => { if (reviewArtifact) reviewHeadingRef.current?.focus(); }, [reviewArtifact?.id]);

  return <div className="mt-5 space-y-5">
    <section className="rounded-2xl border border-brand/25 bg-[#FFF9F3] p-4" aria-label="Comparable Etsy evidence intake">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-brand"><ClipboardCheck size={18} aria-hidden="true" /><p className="text-xs font-bold uppercase tracking-[0.14em]">Evidence intake stepper</p></div>
          <h4 className="mt-1 text-xl font-bold text-ink">先鎖定一個 comparable period，再逐項 review</h4>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">只收 Etsy first-party 的三項同期間資料。Save 只係本機草稿；每份 evidence 都要先打開 review，核對 source、target、日期、OCR／數值，owner confirm 後先可以餵入 downstream decision card。</p>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${confirmedSteps === steps.length && periodReady ? "border-sage/25 bg-[#E8F0E6] text-sage" : "border-copper/25 bg-white text-copper"}`}>{periodReady ? `${confirmedSteps}/3 confirmed` : "Choose listing + dates"}</span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-xs font-semibold text-ink">Comparable listing<select value={selectedListingId} onChange={(event) => onSelectListing(event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" aria-describedby="intake-period-help"><option value="">Select listing</option>{state.listings.map((item) => <option key={item.id} value={item.id}>{item.title} ({item.id})</option>)}</select></label>
        <label className="text-xs font-semibold text-ink">Period start<input type="date" value={period.start} onChange={(event) => onPeriodChange({ ...period, start: event.target.value })} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" /></label>
        <label className="text-xs font-semibold text-ink">Period end<input type="date" value={period.end} onChange={(event) => onPeriodChange({ ...period, end: event.target.value })} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" /></label>
      </div>
      <p id="intake-period-help" className={`mt-2 text-xs leading-5 ${periodReady ? "text-muted" : "text-copper"}`}>{periodReady ? `All three exports must say ${period.start} → ${period.end}. Do not combine different date windows.` : "Choose a listing and valid start/end dates before preparing an intake lane."}</p>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {steps.map((step, index) => {
          const requirement = EVIDENCE_INTAKE_REQUIREMENTS[index];
          return <article key={step.kind} className="rounded-2xl border border-line bg-white p-4">
            <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step.status === "confirmed" ? "bg-sage text-white" : "bg-[#F8EDE4] text-brand"}`}>{step.status === "confirmed" ? "✓" : index + 1}</span><h5 className="text-sm font-bold text-ink">{requirement.label}</h5></div><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusClass(step.status)}`}>{statusLabel(step.status)}</span></div>
            <p className="mt-3 text-xs leading-5 text-muted">{requirement.instruction}</p>
            <p className="mt-2 text-[11px] font-semibold text-ink">Target: {requirement.targetLabel}</p>
            <p className="mt-2 text-xs leading-5 text-muted">{step.detail}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {step.selectedArtifactId && <button type="button" onClick={() => onReviewArtifact(step.selectedArtifactId!)} className="rounded-lg border border-line px-3 py-2 text-xs font-bold text-ink hover:bg-[#F8EDE4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">{step.status === "confirmed" ? "View confirmed review" : "Open review"}</button>}
              {step.status !== "confirmed" && <button type="button" disabled={!periodReady} onClick={() => onPrepareStep(step.kind)} className="rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white hover:bg-brand disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">Prepare this lane</button>}
            </div>
          </article>;
        })}
      </div>
      <p className="mt-4 rounded-xl border border-[#D9E7DE] bg-white px-3 py-2 text-xs leading-5 text-muted"><span className="font-bold text-ink">Gate:</span> {confirmedSteps === 3 && periodReady ? "This comparable packet is eligible for the read-only seller decision card." : "The seller decision card stays Unknown / Collect data until all three lanes are owner-confirmed and decision-ready."}</p>
    </section>

    {reviewArtifact && <section className="rounded-2xl border border-sage/25 bg-[#F3F8F4] p-4" aria-label="Review evidence before owner confirmation" aria-live="polite">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2 text-sage"><ShieldCheck size={18} aria-hidden="true" /><p className="text-xs font-bold uppercase tracking-[0.14em]">Review before owner confirmation</p></div><h4 ref={reviewHeadingRef} tabIndex={-1} className="mt-1 text-xl font-bold text-ink focus:outline-none">{reviewArtifact.fileName}</h4><p className="mt-1 text-xs text-muted">{EVIDENCE_KINDS.find((item) => item.id === reviewArtifact.kind)?.label ?? reviewArtifact.kind} · {reviewArtifact.source} · {reviewArtifact.authority}</p></div><button type="button" onClick={onCloseReview} className="self-start rounded-lg border border-line bg-white px-3 py-2 text-xs font-bold text-ink hover:bg-[#F8EDE4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">Close review</button></div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-line bg-white p-3"><dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Target</dt><dd className="mt-1 break-words text-sm font-bold text-ink">{reviewArtifact.targetId}</dd></div><div className="rounded-xl border border-line bg-white p-3"><dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Coverage</dt><dd className="mt-1 text-sm font-bold text-ink">{reviewArtifact.periodStart || "missing"} → {reviewArtifact.periodEnd || "missing"}</dd></div><div className="rounded-xl border border-line bg-white p-3"><dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Current state</dt><dd className="mt-1 text-sm font-bold text-ink">{artifactState(reviewArtifact)}</dd></div></dl>
      <div className="mt-3 rounded-xl border border-line bg-white p-3"><p className="text-xs font-bold text-ink">Parsed values</p><p className="mt-1 break-words text-xs leading-5 text-muted">{metricText(reviewArtifact)}</p>{reviewArtifact.contentText?.trim() && <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-ink">Show extracted source text</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-[#FBF7F2] p-3 text-[11px] leading-4 text-muted">{reviewArtifact.contentText}</pre></details>}</div>
      {reviewNeedsOcr && <p className="mt-3 rounded-xl border border-copper/25 bg-[#FFF9F3] p-3 text-xs leading-5 text-copper">This screenshot has not been read yet. Run local OCR for review, or keep it unconfirmed. OCR failure may be kept as visual reference but cannot make calculated metrics eligible.</p>}
      {reviewArtifact.ocrStatus === "unreadable" && <p className="mt-3 rounded-xl border border-brand/25 bg-[#FFF1E8] p-3 text-xs leading-5 text-brand">OCR is unreadable. Visual review can be confirmed as a source record, but this artifact will remain ineligible for calculated downstream decisions.</p>}
      {reviewHasDataProblem && <p className="mt-3 rounded-xl border border-brand/25 bg-[#FFF1E8] p-3 text-xs leading-5 text-brand">Missing and invalid fields remain distinct from confirmed zero. You may confirm this record for traceability, but it will not unlock a decision card until corrected evidence is added.</p>}
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={onCloseReview} className="rounded-xl border border-line bg-white px-4 py-2.5 text-xs font-bold text-ink hover:bg-[#F8EDE4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">Keep unconfirmed</button>{reviewNeedsOcr && <button type="button" onClick={() => onRunOcr(reviewArtifact)} className="rounded-xl border border-line bg-white px-4 py-2.5 text-xs font-bold text-ink hover:bg-[#F8EDE4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">Run OCR for review</button>}{!reviewArtifact.ownerConfirmed && !reviewNeedsOcr && <button type="button" onClick={() => onConfirmArtifact(reviewArtifact.id)} className="rounded-xl bg-sage px-4 py-2.5 text-xs font-bold text-white hover:bg-[#477C55] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2">{reviewArtifact.ocrStatus === "unreadable" ? "Confirm visual review only" : reviewHasDataProblem ? "Confirm record · not decision-ready" : "Confirm owner evidence"}</button>}{reviewArtifact.ownerConfirmed && <span className="inline-flex items-center gap-2 rounded-xl bg-[#E8F0E6] px-4 py-2.5 text-xs font-bold text-sage"><FileCheck2 size={15} aria-hidden="true" />Already owner-confirmed</span>}</div>
    </section>}

    <section className="rounded-2xl border border-line bg-white p-4" aria-label="Add local evidence">
      <div className="flex items-start gap-2"><FileUp size={18} className="mt-0.5 text-brand" aria-hidden="true" /><div><h4 className="text-lg font-bold text-ink">Add local evidence</h4><p className="mt-1 text-xs leading-5 text-muted">A prepared lane fills the three required Etsy fields. Other local research, product and social evidence can still use this same uploader.</p></div></div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3"><label className="text-xs font-semibold text-ink">Evidence type<select value={upload.kind} onChange={(event) => onUploadChange("kind", event.target.value as EvidenceKind)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal">{EVIDENCE_KINDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="text-xs font-semibold text-ink">Source<select value={upload.source} onChange={(event) => onUploadChange("source", event.target.value as EvidenceSource)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal">{EVIDENCE_SOURCES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="text-xs font-semibold text-ink">Linked target<select value={`${upload.targetType}:${upload.targetId}`} onChange={(event) => { const [targetType, targetId] = event.target.value.split(":"); onUploadChange("targetType", targetType as EvidenceUploadDraft["targetType"]); onUploadChange("targetId", targetId); }} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal"><option value="shop:shop">Entire shop</option>{state.listings.map((item) => <option key={item.id} value={`listing:${item.id}`}>{item.title} ({item.id})</option>)}{state.products.map((item) => <option key={item.id} value={`product:${item.id}`}>Product: {item.name}</option>)}</select></label><label className="text-xs font-semibold text-ink">Coverage start<input type="date" value={upload.periodStart} onChange={(event) => onUploadChange("periodStart", event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" /></label><label className="text-xs font-semibold text-ink">Coverage end<input type="date" value={upload.periodEnd} onChange={(event) => onUploadChange("periodEnd", event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" /></label><label className="flex cursor-pointer items-end"><span className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-3 py-2.5 text-xs font-bold text-white hover:bg-brand focus-within:ring-2 focus-within:ring-brand focus-within:ring-offset-2"><FileUp size={15} aria-hidden="true" />{upload.file?.name || "Choose PNG, JPG, CSV or XLSX"}<input className="sr-only" type="file" accept=".csv,.tsv,.xlsx,.xls,image/png,image/jpeg" onChange={(event) => onUploadChange("file", event.target.files?.[0] ?? null)} /></span></label><label className="text-xs font-semibold text-ink lg:col-span-3">Source link <span className="font-normal text-muted">(optional alternative to a file)</span><input type="url" inputMode="url" placeholder="https://…" value={upload.sourceUrl} onChange={(event) => onUploadChange("sourceUrl", event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" aria-describedby="source-link-help" /><span id="source-link-help" className="mt-1 block font-normal text-muted">A link is a reference record only. Add CSV/XLSX or a screenshot when values need parsing or OCR.</span></label></div>
      <button type="button" onClick={onSaveUpload} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white hover:bg-[#D94F0D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"><FileUp size={15} aria-hidden="true" />{upload.file ? "Save local evidence for review" : upload.sourceUrl.trim() ? "Save source link for review" : "Save local evidence for review"}</button>
    </section>

    <section className="grid gap-3 sm:hidden" aria-label="Saved evidence">
      {state.artifacts.length === 0 ? <p className="rounded-2xl border border-line bg-white p-4 text-sm text-muted">No evidence stored yet. Start with a dated Etsy Shop Stats export.</p> : state.artifacts.map((artifact) => <article key={artifact.id} className="min-w-0 rounded-2xl border border-line bg-white p-4">
        <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><h4 className="break-words text-sm font-bold text-ink">{artifact.fileName}</h4><p className="mt-1 text-xs text-muted">{EVIDENCE_KINDS.find((item) => item.id === artifact.kind)?.label ?? artifact.kind}</p></div><span className="shrink-0 rounded-full border border-line bg-[#FBF7F2] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted">{artifact.authority}</span></div>
        <dl className="mt-3 grid gap-2 text-xs"><div><dt className="font-bold text-ink">Scope / period</dt><dd className="mt-1 break-words text-muted">{artifact.targetId}<br />{artifact.periodStart || "no start"} → {artifact.periodEnd || "no end"}</dd></div><div><dt className="font-bold text-ink">Source</dt><dd className="mt-1 break-words text-muted">{artifact.source}</dd></div><div><dt className="font-bold text-ink">Data state</dt><dd className="mt-1 break-words text-muted">{metricText(artifact)}</dd><dd className="mt-1 font-semibold text-ink">{artifactState(artifact)}</dd></div></dl>
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2"><button type="button" onClick={() => onReviewArtifact(artifact.id)} className="min-h-11 rounded-xl border border-line px-3 py-2 text-xs font-bold text-ink hover:bg-[#F8EDE4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">{artifact.ownerConfirmed ? "View review" : "Review before confirm"}</button><button type="button" onClick={() => onRemoveArtifact(artifact.id)} aria-label={`Remove ${artifact.fileName}`} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-line text-muted hover:bg-[#FFF1E8] hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"><X size={16} aria-hidden="true" /></button></div>
      </article>)}
    </section>

    <div className="hidden sm:block">
    <div className="overflow-x-auto rounded-2xl border border-line"><table className="w-full min-w-[820px] text-left text-xs"><thead className="bg-[#F8F3ED] text-muted"><tr><th className="px-4 py-3">Evidence</th><th className="px-4 py-3">Scope / period</th><th className="px-4 py-3">Authority</th><th className="px-4 py-3">Data state</th><th className="px-4 py-3">Action</th></tr></thead><tbody>{state.artifacts.length === 0 ? <tr><td colSpan={5} className="px-4 py-5 text-muted">No evidence stored yet. Start with a dated Etsy Shop Stats export.</td></tr> : state.artifacts.map((artifact) => <tr key={artifact.id} className="border-t border-line align-top"><td className="px-4 py-3"><div className="font-semibold text-ink">{artifact.fileName}</div><div className="mt-1 text-muted">{EVIDENCE_KINDS.find((item) => item.id === artifact.kind)?.label ?? artifact.kind}</div></td><td className="px-4 py-3 text-muted">{artifact.targetId}<br />{artifact.periodStart || "no start"} → {artifact.periodEnd || "no end"}</td><td className="px-4 py-3"><span className="rounded-full border border-line bg-white px-2 py-1 font-bold uppercase tracking-wide text-[10px]">{artifact.authority}</span><div className="mt-2 text-muted">{artifact.source}</div></td><td className="px-4 py-3"><div className="break-words text-muted">{metricText(artifact)}</div><div className="mt-1 font-semibold text-ink">{artifactState(artifact)}</div></td><td className="px-4 py-3"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => onReviewArtifact(artifact.id)} className="rounded-lg border border-line px-2 py-1 font-semibold text-ink hover:bg-[#F8EDE4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">{artifact.ownerConfirmed ? "View review" : "Review before confirm"}</button><button type="button" onClick={() => onRemoveArtifact(artifact.id)} aria-label={`Remove ${artifact.fileName}`} className="rounded-lg px-1 text-muted hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"><X size={15} aria-hidden="true" /></button></div></td></tr>)}</tbody></table></div>
  </div></div>;
}
