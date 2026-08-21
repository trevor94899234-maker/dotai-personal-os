import { ArrowRight, Clipboard, ShieldAlert } from "lucide-react";
import type { Listing, SellerDecision, SellerDecisionMetric } from "../lib/etsyOperations";
import type { DecisionControlState } from "../lib/decisionControl";
import DecisionControlSummary from "./DecisionControlSummary";

type SellerDecisionCardProps = {
  decision: SellerDecision;
  listings: Listing[];
  selectedListingId: string;
  onSelectListing: (listingId: string) => void;
  onOpenAnalysis: () => void;
  onOpenResearch: () => void;
  onCopy: () => void;
  control: DecisionControlState;
};

function displayMetric(metric: SellerDecisionMetric) {
  if (metric.status === "missing") return "Missing";
  if (metric.status === "invalid") return "Invalid";
  if (metric.status === "confirmed-zero") return "0 · confirmed zero";
  return String(metric.value ?? "Missing");
}

function metricTone(metric: SellerDecisionMetric) {
  if (metric.status === "invalid" || metric.status === "missing") return "text-brand";
  if (metric.status === "confirmed-zero") return "text-copper";
  return "text-sage";
}

export default function SellerDecisionCard({ decision, listings, selectedListingId, onSelectListing, onOpenAnalysis, onOpenResearch, onCopy, control }: SellerDecisionCardProps) {
  const ready = decision.status === "ready";
  return (
    <section className="mt-5 rounded-2xl border border-copper/25 bg-white p-4" aria-label="Seller decision card">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-copper">Seller maintenance map</p>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${ready ? "bg-[#E8F0E6] text-sage" : "bg-[#FFF1E8] text-brand"}`}>
              {ready ? "Evidence attached · choose a map row" : "Unknown / Collect data"}
            </span>
          </div>
          <h4 className="mt-1 text-lg font-bold text-ink">新手只需先回答五件事</h4>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted">更新咩、幾時更新、咩訊號觸發、要咩證據、睇幾耐同點樣判斷結果。所有建議仍然係本機 draft-only，唔會改 Etsy。</p>
        </div>
        <label className="w-full shrink-0 text-xs font-semibold text-ink lg:max-w-sm">
          Select listing for this decision
          <select value={selectedListingId} onChange={(event) => onSelectListing(event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-[#FBF7F2] px-3 py-2.5 text-sm font-normal text-ink">
            <option value="">Choose a listing</option>
            {listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.title} ({listing.id})</option>)}
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {([decision.signals.views, decision.signals.favorites, decision.signals.orders, decision.signals.revenue]).map((metric) => (
          <div key={metric.label} className="rounded-xl border border-line bg-[#FBF7F2] p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Etsy {metric.label}</div>
            <div className={`mt-1 font-display text-xl font-bold ${metricTone(metric)}`}>{displayMetric(metric)}</div>
          </div>
        ))}
      </div>
      <DecisionControlSummary control={control} />

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-[#D9E7DE] bg-[#F3F8F4] p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-sage">What to update</p>
          <p className="mt-1 text-sm font-bold leading-5 text-ink">{decision.whatToUpdate}</p>
        </article>
        <article className="rounded-xl border border-line bg-[#FBF7F2] p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink">When to update</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-ink">{decision.whenToUpdate}</p>
        </article>
        <article className="rounded-xl border border-line bg-[#FBF7F2] p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-copper">Trigger signal</p>
          <p className="mt-1 text-sm leading-5 text-muted">{decision.triggerSignal}</p>
        </article>
        <article className="rounded-xl border border-line bg-[#FBF7F2] p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-copper">Observation window</p>
          <p className="mt-1 text-sm leading-5 text-muted">{decision.observationWindow}</p>
        </article>
        <article className="rounded-xl border border-line bg-[#FBF7F2] p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-copper">Measurable result</p>
          <p className="mt-1 text-sm leading-5 text-muted">{decision.measurableResult}</p>
        </article>
        <article className="rounded-xl border border-line bg-[#FBF7F2] p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-copper">Required evidence</p>
          <ul className="mt-1 space-y-1 text-xs leading-5 text-muted">{decision.requiredEvidence.map((item) => <li key={item}>• {item}</li>)}</ul>
        </article>
      </div>

      <article className="mt-4 rounded-xl border border-line bg-[#FBF7F2] p-3" aria-label="Static seller maintenance map">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-copper">Static map · education and routing only</p>
            <p className="mt-1 text-sm font-bold text-ink">Dashboard does not choose the listing element for you</p>
          </div>
          <span className="rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-bold text-muted">No new threshold</span>
        </div>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {decision.maintenanceMap.map((rule) => (
            <article key={rule.id} className="rounded-xl border border-line bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h5 className="text-sm font-bold text-ink">{rule.label}</h5>
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${rule.coverage === "Supported" ? "bg-[#E8F0E6] text-sage" : rule.coverage === "Partially supported" ? "bg-[#F8EDE4] text-copper" : "bg-[#F4ECE4] text-muted"}`}>{rule.coverage}</span>
              </div>
              <dl className="mt-2 grid gap-2 text-xs leading-5">
                <div><dt className="font-bold text-ink">Check when</dt><dd className="text-muted">{rule.whenToCheck}</dd></div>
                <div><dt className="font-bold text-ink">Trigger / evidence</dt><dd className="text-muted">{rule.triggerSignal}</dd></div>
                <div><dt className="font-bold text-ink">Required evidence</dt><dd className="text-muted">{rule.requiredEvidence.join(" · ")}</dd></div>
                <div><dt className="font-bold text-ink">Draft update</dt><dd className="text-muted">{rule.draftUpdate}</dd></div>
                <div><dt className="font-bold text-ink">Observation / result</dt><dd className="text-muted">{rule.observationWindow} {rule.measurableResult}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </article>

      {decision.missingEvidence.length > 0 && <div className="mt-3 rounded-xl border border-copper/25 bg-[#F9EEE4] p-3" role="status">
        <div className="flex items-start gap-2"><ShieldAlert size={16} className="mt-0.5 shrink-0 text-brand" /><div><p className="text-xs font-bold text-ink">未足夠作結論</p><ul className="mt-1 space-y-1 text-xs leading-5 text-muted">{decision.missingEvidence.map((item) => <li key={item}>• {item}</li>)}</ul></div></div>
      </div>}

      {decision.protectedNote && <p className="mt-3 text-xs font-semibold leading-5 text-brand">{decision.protectedNote}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onCopy} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white hover:bg-brand"><Clipboard size={14} />Copy decision brief</button>
        <button type="button" onClick={ready ? onOpenAnalysis : onOpenResearch} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs font-bold text-ink hover:bg-[#F8EDE4]">{ready ? "Open analysis" : "Add missing evidence"}<ArrowRight size={14} /></button>
        <span className="text-[11px] leading-4 text-muted">Source: {decision.source}</span>
      </div>
    </section>
  );
}
