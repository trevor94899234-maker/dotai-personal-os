import { useMemo, useState, type ChangeEvent } from "react";
import { CheckCircle2, Clipboard, FileUp, FlaskConical, Rocket, Search, ShieldCheck } from "lucide-react";
import { buildEtsyWorkflowPackage } from "../lib/etsyPromptPackage";

type EvidenceId = "product-facts" | "cost-sheet" | "erank-keywords" | "everbee-market" | "social-log";
type EvidenceRecord = { note: string; fileName?: string; preview?: string; updatedAt?: string };

const ITEMS: Array<{ id: EvidenceId; label: string; source: string; help: string; required: boolean }> = [
  { id: "product-facts", label: "Product facts", source: "Owner", help: "Product type, material, size, personalization, production method and target buyer.", required: true },
  { id: "cost-sheet", label: "Cost & fulfilment", source: "Empire / supplier", help: "Owner-controlled cost, shipping, production time and supplier conflict notes.", required: true },
  { id: "erank-keywords", label: "eRank keyword evidence", source: "Owner export", help: "Paste or upload keyword, search trend and competition evidence. Never enter login details.", required: true },
  { id: "everbee-market", label: "EverBee market evidence", source: "Owner export", help: "Paste or upload comparable listing evidence. Treat estimates as context, not Etsy truth.", required: true },
  { id: "social-log", label: "Social campaign log", source: "Owner log", help: "Content ID, platform, publish date, target listing and Share & Save link.", required: false },
];

const STORAGE_KEY = "etsy-growth-launch-board:v1";
function readEvidence(): Partial<Record<EvidenceId, EvidenceRecord>> {
  try { const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); return parsed && typeof parsed === "object" ? parsed : {}; } catch { return {}; }
}

export default function GrowthLaunchBoard() {
  const [evidence, setEvidence] = useState(() => readEvidence());
  const [notice, setNotice] = useState<string | null>(null);
  const required = ITEMS.filter((item) => item.required);
  const received = required.filter((item) => Boolean(evidence[item.id]?.note.trim() || evidence[item.id]?.fileName));
  const launchReady = received.length === required.length;
  const progress = Math.round((received.length / required.length) * 100);
  const nextMissing = required.find((item) => !evidence[item.id]?.note.trim() && !evidence[item.id]?.fileName);

  function persist(next: Partial<Record<EvidenceId, EvidenceRecord>>) { setEvidence(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
  function updateNote(id: EvidenceId, note: string) { persist({ ...evidence, [id]: { ...evidence[id], note, updatedAt: new Date().toISOString() } }); setNotice(null); }
  function handleFile(id: EvidenceId, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    const save = (preview = "") => { persist({ ...evidence, [id]: { ...evidence[id], note: evidence[id]?.note ?? "", fileName: file.name, preview: preview.slice(0, 6000), updatedAt: new Date().toISOString() } }); setNotice(`${file.name} saved to the local growth evidence board.`); event.target.value = ""; };
    if (/\.(csv|tsv|txt|json)$/i.test(file.name)) { const reader = new FileReader(); reader.onload = () => save(typeof reader.result === "string" ? reader.result : ""); reader.readAsText(file); } else save();
  }
  function clearItem(id: EvidenceId) { const next = { ...evidence }; delete next[id]; persist(next); setNotice("Local evidence item cleared."); }
  const brief = useMemo(() => [
    "ETSY GROWTH & LAUNCH BRIEF",
    `Generated: ${new Date().toISOString()}`,
    `Launch readiness: ${progress}%`,
    `Recommended next action: ${launchReady ? "Owner decision gate" : `Collect ${nextMissing?.label ?? "missing evidence"}`}`,
    "",
    ...ITEMS.flatMap((item) => { const record = evidence[item.id]; return [`[${item.label}]`, `Source: ${item.source}`, `File: ${record?.fileName ?? "none"}`, `Note: ${record?.note.trim() || "none"}`, ""]; }),
    "Decision boundary: research and drafting only; owner approves Etsy publishing, pricing and ads.",
  ].join("\n"), [evidence, launchReady, nextMissing?.label, progress]);
  async function copyBrief() { try { await navigator.clipboard.writeText(await buildEtsyWorkflowPackage({ stage: "growth-launch", exactContext: { board: "etsy-growth-launch", readinessPct: progress }, allowedInputs: [brief], evidenceRefs: ITEMS.flatMap((item) => evidence[item.id]?.fileName ? [evidence[item.id]!.fileName!] : []), nextActionBoundary: launchReady ? "Owner reviews the proposed decision; no live action occurs." : `Collect ${nextMissing?.label ?? "the first missing evidence item"}.` })); setNotice("Growth-launch stage packet copied. Paste it into Codex to start the decision review."); } catch { setNotice("Copy failed. The growth-launch packet or browser clipboard is unavailable."); } }

  return (
    <section className="rounded-[26px] border border-copper/25 bg-panel p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><div className="flex items-center gap-2 text-copper"><Rocket size={18} /><span className="text-xs font-semibold uppercase tracking-[0.16em]">Growth & launch control board</span></div><h2 className="mt-2 font-display text-2xl font-bold text-ink">From evidence to the next product decision</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Keep first-party Etsy evidence separate from eRank and EverBee context. The board stops at an owner decision; it never publishes or changes the shop.</p></div>
        <div className={`rounded-xl border px-3 py-2 text-sm font-bold ${launchReady ? "border-sage/25 bg-[#E8F0E6] text-sage" : "border-copper/25 bg-[#F9EEE4] text-copper"}`}>{progress}% launch evidence ready</div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-sage/25 bg-[#EEF3EC] p-4"><Search size={17} className="text-sage" /><div className="mt-3 text-sm font-bold text-ink">Audit existing listing</div><div className="mt-1 text-xs leading-5 text-muted">Use Etsy Stats, listing performance and traffic evidence above. Protect listings with sales, favorites or organic visits.</div></div>
        <div className="rounded-2xl border border-brand/20 bg-[#FFF1E8] p-4"><FlaskConical size={17} className="text-brand" /><div className="mt-3 text-sm font-bold text-ink">Choose one growth test</div><div className="mt-1 text-xs leading-5 text-muted">One primary variable per weekly cycle: thumbnail, offer, keyword cluster, price presentation or traffic source.</div></div>
        <div className="rounded-2xl border border-copper/25 bg-[#F9EEE4] p-4"><Rocket size={17} className="text-copper" /><div className="mt-3 text-sm font-bold text-ink">Launch new product</div><div className="mt-1 text-xs leading-5 text-muted">Move to drafting only when product facts, cost truth, keyword evidence and market context are present.</div></div>
      </div>

      <div className="mt-5 rounded-2xl border border-line bg-[#FBF7F2] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-bold text-ink">Current next action</div><span className="text-xs font-bold text-copper">{launchReady ? "Owner decision gate" : `Collect: ${nextMissing?.label}`}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E9DED3]"><div className="h-full rounded-full bg-copper transition-all" style={{ width: `${progress}%` }} /></div></div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {ITEMS.map((item) => { const record = evidence[item.id]; const receivedItem = Boolean(record?.note.trim() || record?.fileName); return <article key={item.id} className="rounded-2xl border border-line bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex items-center gap-2"><span className="text-sm font-bold text-ink">{item.label}</span>{item.required && <span className="rounded-full bg-[#FFF1E8] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-brand">required</span>}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">{item.source}</div></div>{receivedItem ? <CheckCircle2 size={18} className="text-sage" /> : <FileUp size={18} className="text-copper" />}</div><p className="mt-2 text-xs leading-5 text-muted">{item.help}</p><textarea value={record?.note ?? ""} onChange={(event) => updateNote(item.id, event.target.value)} placeholder="Paste evidence notes or key rows here…" className="mt-3 min-h-24 w-full rounded-xl border border-line bg-[#FBF7F2] px-3 py-2 text-xs text-ink outline-none focus:border-brand" /><div className="mt-2 flex flex-wrap items-center gap-2"><label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-bold text-ink hover:bg-[#F8EDE4]"><FileUp size={14} />{record?.fileName ? "Replace file" : "Upload export"}<input type="file" accept=".csv,.tsv,.txt,.json,.xlsx,.pdf,image/*" className="sr-only" onChange={(event) => handleFile(item.id, event)} /></label>{record?.fileName && <span className="max-w-[220px] truncate text-[11px] text-sage">{record.fileName}</span>}{receivedItem && <button type="button" onClick={() => clearItem(item.id)} className="ml-auto text-[11px] font-semibold text-muted hover:text-brand">Clear</button>}</div></article>; })}
      </div>

      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-copper/25 bg-[#F9EEE4] p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-copper" /><div><div className="text-sm font-bold text-ink">Owner-controlled decision package</div><div className="mt-1 text-xs leading-5 text-muted">Copy the collected evidence into Codex for a proposed decision, missing inputs, confidence and one next test.</div></div></div><button type="button" onClick={copyBrief} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white hover:bg-brand"><Clipboard size={15} />Copy growth brief</button></div>
      {notice && <div role="status" className="mt-3 rounded-xl border border-sage/25 bg-[#E8F0E6] px-4 py-3 text-xs font-semibold text-sage">{notice}</div>}
    </section>
  );
}
