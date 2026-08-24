import { ArrowRight, CircleAlert, Compass, ShieldCheck } from "lucide-react";
import type { CoachDiagnosis } from "../lib/etsyOperations";

type Props = {
  diagnosis: CoachDiagnosis;
  onAction: (tab: CoachDiagnosis["nextAction"]["tab"]) => void;
};

const INVENTORY_SECTIONS: Array<{
  key: keyof CoachDiagnosis["evidence"];
  label: string;
}> = [
  { key: "known", label: "Known / usable" },
  { key: "dated", label: "Date / age (neutral)" },
  { key: "missing", label: "Missing" },
  { key: "invalid", label: "Invalid" },
  { key: "zero", label: "Confirmed zero" },
  { key: "stale", label: "Stale" },
  { key: "conflicting", label: "Conflicting" },
  { key: "unconfirmed", label: "Unconfirmed · excluded" },
  { key: "ocrReviewOnly", label: "OCR / visual review only" },
  { key: "duplicates", label: "Exact duplicates used once" },
  { key: "protected", label: "Protected / read-only" },
];

export default function CoachDiagnosisCard({ diagnosis, onAction }: Props) {
  const evidenceCount = Object.values(diagnosis.evidence).reduce((total, items) => total + items.length, 0);
  return <section className="min-w-0 rounded-[26px] border border-copper/25 bg-[#FFF9F3] p-4 shadow-card sm:p-5" aria-label="Completed coach diagnosis" aria-labelledby="coach-diagnosis-title" aria-describedby="coach-diagnosis-verdict" data-coach-state="completed-diagnosis" data-conflict-state={diagnosis.evidence.conflicting.length ? "conflict" : "clear"} data-zero-state={diagnosis.evidence.zero.length ? "confirmed-zero" : "none"} data-ocr-state={diagnosis.evidence.ocrReviewOnly.length ? "ocr-needed" : "none"} data-protection-state={diagnosis.evidence.protected.length ? "protected" : "unprotected"}>
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-copper"><Compass size={18} aria-hidden="true" /><p className="text-[10px] font-bold uppercase tracking-[0.16em]">Shine Coach diagnosis · local report only</p></div>
        <h2 id="coach-diagnosis-title" className="mt-2 font-display text-xl font-bold text-ink sm:text-2xl">先修最早斷點，再做下一步</h2>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-muted">{diagnosis.mode === "existing-listing" ? "Existing listing · comparable first-party evidence" : "New product / niche · buyer and market signal required"}</p>
      </div>
      <span className="inline-flex min-h-8 shrink-0 items-center gap-2 self-start rounded-full border border-line bg-white px-3 py-1 text-xs font-bold text-ink"><ShieldCheck size={14} aria-hidden="true" />No live Etsy action</span>
    </div>

    <dl className="mt-4 grid min-w-0 gap-3 md:grid-cols-2">
      <div className="min-w-0 rounded-2xl border border-line bg-white p-4"><dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Current stage</dt><dd className="mt-2 break-words text-sm font-bold text-ink">{diagnosis.stage}</dd></div>
      <div className="min-w-0 rounded-2xl border border-brand/20 bg-[#FFF1E8] p-4"><dt className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-brand"><CircleAlert size={14} aria-hidden="true" />First broken link</dt><dd className="mt-2 break-words text-sm font-bold text-ink">{diagnosis.firstBrokenLink}</dd></div>
    </dl>

    <div className="mt-3 rounded-2xl border border-copper/20 bg-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-copper">Coach verdict</p>
      <p id="coach-diagnosis-verdict" className="mt-2 text-sm font-semibold leading-6 text-ink">{diagnosis.verdict}</p>
    </div>

    <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 rounded-2xl border border-sage/25 bg-[#F3F8F4] p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sage">One next action</p>
        <p className="mt-2 text-sm font-bold text-ink">{diagnosis.nextAction.label}</p>
        <p className="mt-1 text-xs leading-5 text-muted">{diagnosis.nextAction.detail}</p>
        <button type="button" onClick={() => onAction(diagnosis.nextAction.tab)} aria-label={`${diagnosis.nextAction.label}. ${diagnosis.nextAction.detail}`} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white hover:bg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 sm:w-auto">{diagnosis.nextAction.label}<ArrowRight size={15} aria-hidden="true" /></button>
      </div>
      <div className="min-w-0 rounded-2xl border border-line bg-white p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Review signal</p>
        <p className="mt-2 text-sm font-semibold leading-6 text-ink">{diagnosis.reviewSignal}</p>
      </div>
    </div>

    <details className="mt-3 min-w-0 rounded-2xl border border-line bg-white">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-xs font-bold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"><span>Evidence detail</span><span className="shrink-0 text-muted">{evidenceCount} item{evidenceCount === 1 ? "" : "s"}</span></summary>
      <div className="grid min-w-0 gap-3 border-t border-line p-4 sm:grid-cols-2">
        {INVENTORY_SECTIONS.map(({ key, label }) => {
          const items = diagnosis.evidence[key];
          return <section key={key} className="min-w-0 rounded-xl bg-[#FBF7F2] p-3" aria-label={label} data-evidence-state={key}><h3 className="text-xs font-bold text-ink">{label} · {items.length}</h3>{items.length ? <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-4 text-muted">{items.map((item) => <li key={item} className="break-words">{item}</li>)}</ul> : <p className="mt-2 text-[11px] text-muted">None in the current scope.</p>}</section>;
        })}
      </div>
    </details>
  </section>;
}
