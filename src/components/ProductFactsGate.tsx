import { CheckCircle2, FileUp, Pencil, ShieldCheck, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { productFactGaps, type EtsyOperationsState, type Product } from "../lib/etsyOperations";

type Props = { state: EtsyOperationsState; onCommit: (next: EtsyOperationsState, message: string) => Promise<void>; onRecordBaseline: (product: Product) => Promise<void> };

const LABELS: Array<[keyof Omit<Product, "id" | "factsStatus" | "factsConfirmedAt">, string]> = [
  ["material", "Material"], ["size", "Final size / pages / weight"], ["productionMethod", "Production method"], ["fulfilmentSource", "Production & shipping"], ["costSource", "Cost source"], ["allowedClaims", "Allowed claims"], ["blockedClaims", "Blocked claims"], ["sourceNote", "Source / proof note"],
];

function statusLabel(product: Product) {
  if (product.factsStatus === "confirmed-current") return product.factsConfirmedAt ? `Confirmed ${product.factsConfirmedAt.slice(0, 10)}` : "Confirmed current";
  if (product.factsStatus === "needs-update") return "Needs update";
  return "Baseline — final check needed";
}

export default function ProductFactsGate({ state, onCommit, onRecordBaseline }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Product | null>(null);
  const selected = state.products.find((item) => item.id === selectedId) ?? null;
  const gaps = useMemo(() => selected ? productFactGaps(state, selected.id) : [], [selected, state]);

  function openReview(product: Product) { setSelectedId(product.id); setDraft({ ...product }); }
  async function markNeedsUpdate(product: Product) {
    await onCommit({ ...state, products: state.products.map((item) => item.id === product.id ? { ...item, factsStatus: "needs-update", factsConfirmedAt: undefined } : item) }, `${product.name} is marked as needing an update before it can be used for a final listing draft.`);
  }
  async function saveDraft() {
    if (!selected || !draft) return;
    await onCommit({ ...state, products: state.products.map((item) => item.id === selected.id ? { ...draft, factsStatus: "needs-update", factsConfirmedAt: undefined } : item) }, "Product facts updated locally. Upload and confirm fresh proof before approving them again.");
  }
  async function confirmCurrent() {
    if (!selected || gaps.length) return;
    await onCommit({ ...state, products: state.products.map((item) => item.id === selected.id ? { ...item, factsStatus: "confirmed-current", factsConfirmedAt: new Date().toISOString() } : item) }, "Current product facts are owner-confirmed for draft preparation. Etsy remains unchanged.");
  }

  return <section className="rounded-[26px] border border-sage/25 bg-panel p-5 shadow-card sm:p-6" aria-label="Product facts confirmation">
    <div className="flex items-center gap-2 text-sage"><ShieldCheck size={18} /><span className="text-xs font-semibold uppercase tracking-[0.16em]">Product facts owner gate</span></div>
    <h3 className="mt-2 font-display text-2xl font-bold text-ink">Confirm current facts only when a listing is nearly ready</h3>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Your existing journal and plaque details begin as baseline records. Use this gate before a final Codex listing draft, not before keyword research.</p>

    <div className="mt-5 grid gap-3 md:grid-cols-2">{state.products.map((product) => <article key={product.id} className="rounded-2xl border border-line bg-[#FBF7F2] p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="font-semibold text-ink">{product.name}</h4><p className="mt-1 text-xs text-muted">{product.type}</p></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${product.factsStatus === "confirmed-current" ? "border-sage/25 bg-[#E8F0E6] text-sage" : product.factsStatus === "needs-update" ? "border-brand/20 bg-[#FFF1E8] text-brand" : "border-copper/25 bg-[#F9EEE4] text-copper"}`}>{statusLabel(product)}</span></div><p className="mt-3 line-clamp-2 text-xs leading-5 text-muted">{product.size || "Size missing"} · {product.productionMethod || "Production method missing"}</p><p className="mt-3 text-xs leading-5 text-muted">If you already supplied these details, reuse them as a local owner attestation; no supplier file is claimed.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => openReview(product)} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-xs font-bold text-ink hover:bg-[#F8EDE4]"><Pencil size={13} />Review / update</button><button type="button" onClick={() => void onRecordBaseline(product)} className="inline-flex items-center gap-1.5 rounded-lg border border-sage/25 bg-[#E8F0E6] px-3 py-2 text-xs font-bold text-sage hover:bg-[#D9E7DE]"><CheckCircle2 size={13} />Reuse existing baseline</button><button type="button" onClick={() => void markNeedsUpdate(product)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-copper hover:bg-[#F9EEE4]"><TriangleAlert size={13} />Need update</button></div></article>)}</div>

    {selected && draft && <div className="mt-5 rounded-2xl border border-line bg-white p-4"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><div><h4 className="font-bold text-ink">Review: {selected.name}</h4><p className="mt-1 text-xs text-muted">Changing any field resets confirmation. Save only what you have evidence to support.</p></div><button type="button" onClick={() => { setSelectedId(null); setDraft(null); }} className="text-xs font-semibold text-muted hover:text-ink">Close</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{LABELS.map(([key, label]) => <label key={key} className="text-xs font-semibold text-ink">{label}<textarea value={draft[key] as string} onChange={(event) => setDraft((current) => current ? { ...current, [key]: event.target.value } : current)} className="mt-1.5 min-h-18 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal text-ink" /></label>)}</div><div className={`mt-4 rounded-xl border p-3 ${gaps.length ? "border-copper/25 bg-[#F9EEE4]" : "border-sage/25 bg-[#E8F0E6]"}`}><div className="flex items-center gap-2 font-semibold text-ink">{gaps.length ? <TriangleAlert size={15} className="text-copper" /> : <CheckCircle2 size={15} className="text-sage" />}{gaps.length ? "Confirmation is blocked" : "Ready for owner confirmation"}</div>{gaps.length ? <><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">{gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul><p className="mt-2 text-xs text-muted"><FileUp size={13} className="mr-1 inline" />Use Evidence Inbox above: upload `Product facts` and `Cost & fulfilment`, link each file to this product, then press Confirm on the evidence record.</p></> : <p className="mt-2 text-xs text-sage">The two dated evidence records are owner-confirmed. You can now lock this product's current facts for a draft-only listing brief.</p>}</div><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => void saveDraft()} className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-xs font-bold text-ink hover:bg-[#F8EDE4]"><Pencil size={14} />Save revised facts</button><button type="button" disabled={gaps.length > 0} onClick={() => void confirmCurrent()} className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white hover:bg-brand disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 size={14} />Confirm current facts</button></div></div>}
  </section>;
}
