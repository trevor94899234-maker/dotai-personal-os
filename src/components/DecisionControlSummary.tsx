import {
  DECISION_CONTROL_DELIVERY_REVISION,
  DECISION_CONTROL_EVIDENCE_KINDS,
  DECISION_CONTROL_EVIDENCE_LABELS,
  DECISION_CONTROL_TRUTH_KEY,
  decisionControlStatusSummary,
  formatDecisionTruth,
  type DecisionControlState,
} from "../lib/decisionControl";

type DecisionControlSummaryProps = {
  control: DecisionControlState;
  compact?: boolean;
};

export default function DecisionControlSummary({ control, compact = false }: DecisionControlSummaryProps) {
  return (
    <article className={`${compact ? "mt-3" : "mt-4"} rounded-xl border border-line bg-[#FBF7F2] p-3`} aria-label="Decision control explanation">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-copper">Deterministic decision control</p>
          <p className="mt-1 text-sm font-bold text-ink">{control.status === "blocked" ? "Blocked · evidence gate" : "Decision-ready · report-only"}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${control.status === "blocked" ? "bg-[#FFF1E8] text-brand" : "bg-[#E8F0E6] text-sage"}`}>
          {control.status === "blocked" ? "Why blocked" : "Why ready"}
        </span>
      </div>

      <p className="mt-2 break-words text-xs leading-5 text-muted">{decisionControlStatusSummary(control)}</p>

      {control.blockers.length > 0 && <ul className="mt-2 space-y-1 text-xs leading-5 text-muted" aria-label="Decision blockers">
        {control.blockers.map((blocker) => <li key={blocker.code}>• {blocker.code}: {blocker.message}</li>)}
      </ul>}

      <div className="mt-3 rounded-lg border border-line bg-white/70 p-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink">Truth by evidence lane</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {DECISION_CONTROL_EVIDENCE_KINDS.map((kind) => (
            <div key={kind} className="min-w-0 rounded-lg border border-line bg-[#FBF7F2] p-2">
              <p className="text-[10px] font-bold text-ink">{DECISION_CONTROL_EVIDENCE_LABELS[kind]}</p>
              <p className="mt-1 break-words text-[11px] leading-4 text-muted">{formatDecisionTruth(control.truth[kind])}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 break-words text-[11px] leading-4 text-muted"><span className="font-bold text-ink">Truth key: </span>{DECISION_CONTROL_TRUTH_KEY}</p>
      </div>

      <div className="mt-3 rounded-lg border border-copper/20 bg-white/70 p-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-copper">Next action · local / report-only</p>
        <p className="mt-1 break-words text-xs leading-5 text-ink"><span className="font-bold">{control.nextAction.label}:</span> {control.nextAction.detail}</p>
      </div>

      <p className="mt-2 break-words text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">Local source revision · {DECISION_CONTROL_DELIVERY_REVISION}</p>
    </article>
  );
}
