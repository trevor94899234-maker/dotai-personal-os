import { useEffect, useRef } from "react";
import { ClipboardCheck, FileCheck2, FileUp, ShieldCheck, X } from "lucide-react";
import {
  EVIDENCE_INTAKE_REQUIREMENTS,
  buildEvidenceIntakeSteps,
  deriveEvidenceGroups,
  isEvidenceEligibleForDecision,
  shouldRunOcrBeforeConfirm,
  type EvidenceArtifact,
  type EvidenceBatchItem,
  type EvidenceFileClassification,
  type EvidenceIntakeKind,
  type EvidenceKind,
  type ParsedEvidenceFile,
  type EvidenceSource,
  type EtsyOperationsState,
} from "../lib/etsyOperations";

export type EvidenceUploadDraft = {
  files: File[];
  sourceUrl: string;
  kind: EvidenceKind;
  source: EvidenceSource;
  periodStart: string;
  periodEnd: string;
  targetType: EvidenceArtifact["targetType"];
  targetId: string;
};

export type EvidenceUploadFileDraft = {
  id: string;
  file: File;
  mimeType: string;
  parsed?: ParsedEvidenceFile;
  classification: EvidenceFileClassification;
  classificationConfirmed: boolean;
  status: "queued" | "inspecting" | "ready" | "needs-review" | "error";
  detail: string;
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
  fileDrafts: EvidenceUploadFileDraft[];
  batchItems: EvidenceBatchItem[];
  reviewArtifact?: EvidenceArtifact;
  onSelectListing: (listingId: string) => void;
  onPeriodChange: (period: { start: string; end: string }) => void;
  onPrepareStep: (kind: EvidenceIntakeKind) => void;
  onUploadChange: <K extends keyof EvidenceUploadDraft>(key: K, value: EvidenceUploadDraft[K]) => void;
  onSelectFiles: (files: File[]) => void;
  onFileClassificationChange: (index: number, patch: Partial<EvidenceFileClassification>) => void;
  onConfirmFileClassification: (index: number) => void;
  onRemoveFileDraft: (index: number) => void;
  onSaveUpload: () => void;
  onReviewArtifact: (id: string) => void;
  onRunOcr: (artifact: EvidenceArtifact) => void;
  onConfirmArtifact: (id: string) => void;
  onCloseReview: () => void;
  onRemoveArtifact: (id: string) => void;
};

function statusLabel(status: ReturnType<typeof buildEvidenceIntakeSteps>[number]["status"]) {
  if (status === "confirmed") return "Confirmed · eligible";
  if (status === "conflict") return "Conflict · diagnosis blocked";
  if (status === "review") return "Saved · review needed";
  if (status === "not-eligible") return "Confirmed · not decision-ready";
  return "Missing";
}

function statusClass(status: ReturnType<typeof buildEvidenceIntakeSteps>[number]["status"]) {
  if (status === "confirmed") return "border-sage/25 bg-[#E8F0E6] text-sage";
  if (status === "conflict") return "border-brand/25 bg-[#FFF1E8] text-brand";
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
  fileDrafts,
  batchItems,
  reviewArtifact,
  onSelectListing,
  onPeriodChange,
  onPrepareStep,
  onUploadChange,
  onSelectFiles,
  onFileClassificationChange,
  onConfirmFileClassification,
  onRemoveFileDraft,
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
  const groups = deriveEvidenceGroups(state.artifacts);
  const duplicateCount = groups.reduce((total, group) => total + group.duplicateArtifactIds.length, 0);
  const conflictCount = groups.reduce((total, group) => total + group.conflicts.length, 0);
  const unconfirmedCount = groups.reduce((total, group) => total + group.unconfirmedArtifactIds.length, 0);
  const staleCount = groups.filter((group) => group.stale).length;
  const confirmedZeroCount = groups.reduce((total, group) => total + group.metrics.filter((metric) => metric.status === "confirmed-zero").length, 0);
  const ocrNeededCount = state.artifacts.filter((artifact) => shouldRunOcrBeforeConfirm(artifact)).length;
  const protectedCount = state.listings.filter((listing) => listing.protected).length;
  const readyFileDrafts = fileDrafts.filter((item) => item.status === "ready").length;
  const ambiguousFileDrafts = fileDrafts.filter((item) => item.status === "needs-review").length;
  const inspectingFileDrafts = fileDrafts.filter((item) => item.status === "queued" || item.status === "inspecting").length;
  const intakeErrorDrafts = fileDrafts.filter((item) => item.status === "error").length;
  const completedBatchItems = batchItems.filter((item) => item.status === "saved" || item.status === "error").length;
  const savedBatchItems = batchItems.filter((item) => item.status === "saved").length;
  const failedBatchItems = batchItems.filter((item) => item.status === "error").length;
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
      <div className="flex items-start gap-2"><FileUp size={18} className="mt-0.5 text-brand" aria-hidden="true" /><div><h4 className="text-lg font-bold text-ink">Add local evidence</h4><p className="mt-1 text-xs leading-5 text-muted">Choose one mixed dump. Every file is inspected and classified independently before save; unresolved metadata stays visible on that file and never inherits another file's values.</p></div></div>
      <label className="mt-4 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-ink px-3 py-2.5 text-xs font-bold text-white hover:bg-brand focus-within:ring-2 focus-within:ring-brand focus-within:ring-offset-2"><FileUp size={15} className="shrink-0" aria-hidden="true" /><span className="min-w-0 truncate">{fileDrafts.length ? `${fileDrafts.length} supplied file${fileDrafts.length === 1 ? "" : "s"}` : "Choose mixed images and CSV/XLSX files"}</span><input className="sr-only" aria-label="Choose mixed evidence files" type="file" multiple accept=".csv,.tsv,.xlsx,.xls,image/png,image/jpeg" onChange={(event) => onSelectFiles(Array.from(event.target.files ?? []))} /></label>

      {fileDrafts.length > 0 && <section className="mt-4 rounded-2xl border border-line bg-[#FBF7F2] p-4" aria-label="Mixed evidence file inventory" aria-live="polite" data-evidence-state={ambiguousFileDrafts ? "ambiguous-review" : inspectingFileDrafts ? "classifying" : intakeErrorDrafts ? "partial-error" : "mixed-files-ready"}>
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h5 className="text-sm font-bold text-ink">What was supplied and how it was classified</h5><p className="mt-1 text-[11px] leading-4 text-muted">{readyFileDrafts} ready · {ambiguousFileDrafts} need owner review · {inspectingFileDrafts} inspecting · {intakeErrorDrafts} errors</p></div><span className="rounded-full border border-line bg-white px-3 py-1 text-[10px] font-bold uppercase text-muted">Per-file lineage</span></div>
        <div className="mt-3 grid gap-3">{fileDrafts.map((draft, index) => {
          const classification = draft.classification;
          const targetValue = classification.targetType && classification.targetId ? `${classification.targetType}:${classification.targetId}` : "";
          const controlsDisabled = draft.status === "queued" || draft.status === "inspecting" || draft.status === "error";
          return <fieldset key={draft.id} className="min-w-0 rounded-xl border border-line bg-white p-3" aria-label={`Classification for ${draft.file.name}`} data-evidence-state={draft.status} data-ocr-state={draft.mimeType.startsWith("image/") ? "ocr-needed-after-save" : "not-needed"}>
            <legend className="max-w-full px-1 text-xs font-bold text-ink"><span className="break-words">{draft.file.name}</span></legend>
            <div className="flex flex-wrap items-start justify-between gap-2"><p className="break-words text-[11px] leading-4 text-muted">{draft.mimeType} · {draft.detail}{draft.mimeType.startsWith("image/") ? " Screenshot: OCR needed after save; no numeric truth yet." : ""}</p><output className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${draft.status === "ready" ? "bg-[#E8F0E6] text-sage" : draft.status === "error" ? "bg-[#FFF1E8] text-brand" : "bg-[#FFF9F3] text-copper"}`} aria-label={`${draft.file.name} classification status`}>{draft.status === "ready" ? draft.classificationConfirmed ? "Provisional · owner-corrected" : "Provisional · inferred" : draft.status === "needs-review" ? "Ambiguous · owner review" : draft.status}</output></div>
            {classification.signals.length > 0 && <details className="mt-2"><summary className="min-h-11 cursor-pointer py-3 text-[11px] font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">Classification signals</summary><ul className="list-disc space-y-1 pl-5 text-[11px] leading-4 text-muted">{classification.signals.map((signal) => <li key={signal}>{signal}</li>)}</ul></details>}
            {classification.ambiguity.length > 0 && <p className="mt-2 rounded-lg border border-copper/25 bg-[#FFF9F3] p-2 text-[11px] leading-4 text-copper" role="status">Ambiguous or missing: {classification.ambiguity.join(", ")}. Complete the controls and confirm only this file.</p>}
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-[11px] font-semibold text-ink">Evidence type<select disabled={controlsDisabled} aria-label={`${draft.file.name} evidence type`} value={classification.kind ?? ""} onChange={(event) => onFileClassificationChange(index, { kind: event.target.value as EvidenceKind || undefined })} className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-2 text-xs font-normal disabled:bg-[#F4ECE4]"><option value="">Choose type</option>{EVIDENCE_KINDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label className="text-[11px] font-semibold text-ink">Source<select disabled={controlsDisabled} aria-label={`${draft.file.name} evidence source`} value={classification.source ?? ""} onChange={(event) => onFileClassificationChange(index, { source: event.target.value as EvidenceSource || undefined })} className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-2 text-xs font-normal disabled:bg-[#F4ECE4]"><option value="">Choose source</option>{EVIDENCE_SOURCES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label className="text-[11px] font-semibold text-ink">Linked target<select disabled={controlsDisabled} aria-label={`${draft.file.name} linked target`} value={targetValue} onChange={(event) => { const [targetType, targetId] = event.target.value.split(":"); onFileClassificationChange(index, { targetType: targetType as EvidenceUploadDraft["targetType"] || undefined, targetId: targetId || undefined }); }} className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-2 text-xs font-normal disabled:bg-[#F4ECE4]"><option value="">Choose target</option><option value="shop:shop">Entire shop</option>{state.listings.map((item) => <option key={item.id} value={`listing:${item.id}`}>{item.title} ({item.id})</option>)}{state.products.map((item) => <option key={item.id} value={`product:${item.id}`}>Product: {item.name}</option>)}{state.designs.map((item) => <option key={item.id} value={`design:${item.id}`}>Design: {item.name}</option>)}</select></label>
              <label className="text-[11px] font-semibold text-ink">Coverage start<input disabled={controlsDisabled} aria-label={`${draft.file.name} coverage start`} type="date" value={classification.periodStart ?? ""} onChange={(event) => onFileClassificationChange(index, { periodStart: event.target.value || undefined })} className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-2 text-xs font-normal disabled:bg-[#F4ECE4]" /></label>
              <label className="text-[11px] font-semibold text-ink">Coverage end<input disabled={controlsDisabled} aria-label={`${draft.file.name} coverage end`} type="date" value={classification.periodEnd ?? ""} onChange={(event) => onFileClassificationChange(index, { periodEnd: event.target.value || undefined })} className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-2 text-xs font-normal disabled:bg-[#F4ECE4]" /></label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">{draft.status === "needs-review" && <button type="button" onClick={() => onConfirmFileClassification(index)} className="min-h-11 rounded-xl bg-sage px-3 py-2 text-xs font-bold text-white hover:bg-[#477C55] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2" aria-label={`Confirm classification for ${draft.file.name}`}>Confirm this file classification</button>}<button type="button" disabled={inspectingFileDrafts > 0} onClick={() => onRemoveFileDraft(index)} className="min-h-11 rounded-xl border border-line bg-white px-3 py-2 text-xs font-bold text-ink hover:bg-[#FFF1E8] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" aria-label={`Remove unsaved file ${draft.file.name}`}>Remove file</button></div>
          </fieldset>;
        })}</div>
      </section>}

      <details className="mt-4 rounded-2xl border border-line bg-white"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-bold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><span>Source link alternative</span><span className="text-muted">Owner-entered metadata</span></summary><div className="grid gap-3 border-t border-line p-3 lg:grid-cols-3"><label className="text-xs font-semibold text-ink">Evidence type<select value={upload.kind} onChange={(event) => onUploadChange("kind", event.target.value as EvidenceKind)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal">{EVIDENCE_KINDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="text-xs font-semibold text-ink">Source<select value={upload.source} onChange={(event) => onUploadChange("source", event.target.value as EvidenceSource)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal">{EVIDENCE_SOURCES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="text-xs font-semibold text-ink">Linked target<select value={`${upload.targetType}:${upload.targetId}`} onChange={(event) => { const [targetType, targetId] = event.target.value.split(":"); onUploadChange("targetType", targetType as EvidenceUploadDraft["targetType"]); onUploadChange("targetId", targetId); }} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal"><option value="shop:shop">Entire shop</option>{state.listings.map((item) => <option key={item.id} value={`listing:${item.id}`}>{item.title} ({item.id})</option>)}{state.products.map((item) => <option key={item.id} value={`product:${item.id}`}>Product: {item.name}</option>)}</select></label><label className="text-xs font-semibold text-ink">Coverage start<input type="date" value={upload.periodStart} onChange={(event) => onUploadChange("periodStart", event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" /></label><label className="text-xs font-semibold text-ink">Coverage end<input type="date" value={upload.periodEnd} onChange={(event) => onUploadChange("periodEnd", event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" /></label><label className="text-xs font-semibold text-ink lg:col-span-3">Source link<input type="url" inputMode="url" placeholder="https://…" value={upload.sourceUrl} onChange={(event) => onUploadChange("sourceUrl", event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" aria-describedby="source-link-help" /><span id="source-link-help" className="mt-1 block font-normal text-muted">A source link is a separate alternative. Its metadata comes only from these explicit owner controls.</span></label></div></details>

      <button type="button" onClick={onSaveUpload} disabled={fileDrafts.length > 0 && (readyFileDrafts === 0 || inspectingFileDrafts > 0)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white hover:bg-[#D94F0D] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"><FileUp size={15} aria-hidden="true" />{fileDrafts.length ? inspectingFileDrafts ? "Wait for file classification" : `Save ${readyFileDrafts} ready file${readyFileDrafts === 1 ? "" : "s"}` : upload.sourceUrl.trim() ? "Save source link for review" : "Save local evidence for review"}</button>
      {fileDrafts.length > 0 && ambiguousFileDrafts + intakeErrorDrafts > 0 && <p className="mt-2 text-[11px] leading-4 text-muted">Ready files can save now. The other {ambiguousFileDrafts + intakeErrorDrafts} file{ambiguousFileDrafts + intakeErrorDrafts === 1 ? "" : "s"} stay visible and unsaved until corrected or removed.</p>}
      {batchItems.length > 0 && <section className="mt-4 rounded-2xl border border-line bg-[#FBF7F2] p-4" aria-label={failedBatchItems > 0 && savedBatchItems > 0 ? "Evidence batch partial error" : "Evidence batch progress"} aria-live="polite" data-evidence-state={failedBatchItems > 0 && savedBatchItems > 0 ? "partial-error" : completedBatchItems === batchItems.length ? "save-complete" : "saving"}>
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold text-ink">Batch progress · {completedBatchItems}/{batchItems.length} complete</p><p className="text-xs font-semibold text-muted">{savedBatchItems} saved · {failedBatchItems} failed</p></div>
        <progress className="mt-3 h-2 w-full accent-[#5C8C65]" max={batchItems.length} value={completedBatchItems}>{completedBatchItems} of {batchItems.length}</progress>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">{batchItems.map((item) => <li key={`${item.index}-${item.fileName}`} className="min-w-0 rounded-xl border border-line bg-white p-3" aria-label={`${item.fileName}: ${item.status}`} data-evidence-state={item.status}><div className="flex items-start justify-between gap-2"><span className="min-w-0 break-words text-xs font-bold text-ink">{item.fileName}</span><span className={`shrink-0 text-[10px] font-bold uppercase ${item.status === "saved" ? "text-sage" : item.status === "error" ? "text-brand" : "text-copper"}`}>{item.status}</span></div><p className="mt-1 break-words text-[11px] leading-4 text-muted">{item.detail}</p></li>)}</ul>
      </section>}
      <details className="mt-4 rounded-2xl border border-line bg-white"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-bold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><span>Derived evidence inventory</span><span className="text-muted">{groups.length} groups · {conflictCount} conflicts</span></summary><div className="border-t border-line p-3"><dl className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4"><div aria-label="Duplicate evidence state" data-evidence-state="duplicate"><dt className="font-bold text-ink">Exact duplicates</dt><dd className="mt-1 text-muted">{duplicateCount} ignored after audit</dd></div><div aria-label="Conflict evidence state" data-evidence-state="conflict"><dt className="font-bold text-ink">Conflicts</dt><dd className="mt-1 text-muted">{conflictCount} block diagnosis</dd></div><div aria-label="Confirmed zero evidence state" data-evidence-state="confirmed-zero"><dt className="font-bold text-ink">Confirmed zero</dt><dd className="mt-1 text-muted">{confirmedZeroCount} valid zero metrics</dd></div><div aria-label="OCR needed evidence state" data-evidence-state="ocr-needed"><dt className="font-bold text-ink">OCR needed</dt><dd className="mt-1 text-muted">{ocrNeededCount} files need local review</dd></div><div aria-label="Protected listing state" data-evidence-state="protected"><dt className="font-bold text-ink">Protected</dt><dd className="mt-1 text-muted">{protectedCount} read-only listings</dd></div><div><dt className="font-bold text-ink">Unconfirmed</dt><dd className="mt-1 text-muted">{unconfirmedCount} visible, excluded</dd></div><div><dt className="font-bold text-ink">Stale by explicit policy</dt><dd className="mt-1 text-muted">{staleCount}; no automatic threshold</dd></div><div><dt className="font-bold text-ink">Dates / age</dt><dd className="mt-1 text-muted">Reported neutrally per group</dd></div></dl>{conflictCount > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-brand">{groups.flatMap((group) => group.conflicts.map((metric) => <li key={`${group.key}-${metric}`}>{group.kind} · {group.targetId} · {group.periodStart} → {group.periodEnd} · {metric}</li>))}</ul>}{groups.length > 0 && <ul className="mt-3 space-y-1 text-[11px] leading-4 text-muted" aria-label="Neutral evidence age inventory">{groups.map((group) => <li key={group.key}>{group.kind} · {group.targetId} · ends {group.periodEnd || "unknown"} · {group.ageDays === null ? "age unavailable" : `${group.ageDays} days old`}</li>)}</ul>}</div></details>
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
