import { CheckCircle2, Clipboard, FileSpreadsheet, Image, ScanText, SearchCheck, Trash2, Undo2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState, type ClipboardEvent } from "react";
import {
  DEFAULT_STATE,
  createId,
  hydrateListingDrafts,
  hydrateKeywordResearch,
  hydrateKnownDesigns,
  hydrateKnownProducts,
  keywordEvidenceGaps,
  legacyMigration,
  loadOperationsState,
  parseWorkbook,
  saveOperationsState,
  sourceAuthority,
  type EvidenceArtifact,
  type EvidenceSource,
  type KeywordResearchLoop,
  type EtsyOperationsState,
} from "../lib/etsyOperations";

function copyText(value: string) { return navigator.clipboard?.writeText(value) ?? Promise.reject(new Error("Clipboard is unavailable")); }
function fileDataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
function isUsableResearchEvidence(artifact: EvidenceArtifact) { return artifact.ownerConfirmed && (!artifact.mimeType.startsWith("image/") || (artifact.ocrStatus === "confirmed" && Boolean(artifact.contentText?.trim()))); }
function enhanceScreenshotForOcr(dataUrl: string) {
  return new Promise<string>((resolve, reject) => {
    const source = new window.Image();
    source.onload = () => {
      const scale = Math.min(2, 3200 / Math.max(source.naturalWidth, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) { reject(new Error("Canvas is unavailable")); return; }
      context.filter = "grayscale(1) contrast(1.8)";
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    source.onerror = () => reject(new Error("Screenshot could not be prepared"));
    source.src = dataUrl;
  });
}

function artifactLines(artifact: EvidenceArtifact) {
  return [
    `[${artifact.source.toUpperCase()} - ${artifact.fileName}]`,
    `Coverage: ${artifact.periodStart || "missing"} to ${artifact.periodEnd || "missing"}; uploaded: ${artifact.uploadedAt}; authority: ${artifact.authority}; parsed rows: ${artifact.rows ?? "n/a"}`,
    `Headers: ${artifact.headers.join(", ") || "not available"}`,
    `Parsed metrics: ${artifact.metrics.map((metric) => `${metric.label}=${metric.value ?? metric.status}`).join(", ") || "none"}`,
    `Extracted source text:\n${artifact.contentText?.slice(0, 25000) || "No parsed text. This owner-confirmed screenshot is included for Codex visual review only; do not treat it as parsed metrics."}`,
    "",
  ];
}

function starterQueries(recipient: string, productType: string) {
  const person = recipient.trim().toLowerCase() || "gift";
  const product = productType.toLowerCase().includes("journal") ? "journal" : productType.toLowerCase();
  return [`personalized ${person} ${product}`, `${person} memory ${product}`, `${person} keepsake ${product}`, `custom ${person} ${product}`, `${person} gift`];
}

function defaultLoop(recipient: string, productType: string): KeywordResearchLoop {
  return { designId: "", round: 1, stage: "seed-requested", queries: starterQueries(recipient, productType), requestReason: "Start with the exact recipient + story/memory intent. Use this round to see which wording has usable demand, click behavior, and manageable competition before expanding.", updatedAt: "" };
}

type KeywordResearchWorkspaceProps = { selectedDesignId?: string; onSelectDesign?: (designId: string) => void };

export default function KeywordResearchWorkspace({ selectedDesignId: controlledDesignId, onSelectDesign }: KeywordResearchWorkspaceProps = {}) {
  const [state, setState] = useState<EtsyOperationsState | null>(null);
  const [localDesignId, setLocalDesignId] = useState("demo-design-journal");
  const selectedDesignId = controlledDesignId ?? localDesignId;
  const [source, setSource] = useState<EvidenceSource>("erank");
  const [researchDate, setResearchDate] = useState(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("Loading local research intake...");
  const [toast, setToast] = useState<string | null>(null);
  const [verdictStage, setVerdictStage] = useState<"need-deeper-research" | "conclusion-ready">("need-deeper-research");
  const [verdictNote, setVerdictNote] = useState("");
  const [nextQueries, setNextQueries] = useState("");
  const [primaryKeyword, setPrimaryKeyword] = useState("");
  const [supportingKeywords, setSupportingKeywords] = useState("");
  const [avoidKeywords, setAvoidKeywords] = useState("");

  const announce = (message: string) => { setNotice(message); setToast(message); };
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 6000); return () => window.clearTimeout(timer); }, [toast]);

  useEffect(() => {
    const restore = () => void (async () => {
      try {
        const loaded = await loadOperationsState();
        const hydrated = hydrateListingDrafts(hydrateKeywordResearch(hydrateKnownDesigns(hydrateKnownProducts(legacyMigration(loaded)))));
        if (hydrated !== loaded) await saveOperationsState(hydrated);
        setState(hydrated);
        if (!hydrated.designs.some((item) => item.id === selectedDesignId)) {
          const fallbackId = hydrated.designs[0]?.id ?? "";
          if (controlledDesignId !== undefined) onSelectDesign?.(fallbackId); else setLocalDesignId(fallbackId);
        }
        setNotice("Upload a CSV/XLSX or screenshot once. Codex will analyze the source data; you do not need to type one row per keyword.");
      } catch { setState(DEFAULT_STATE); setNotice("Browser storage is unavailable. Your uploaded research packet will not survive a reload."); }
    })();
    restore();
    window.addEventListener("etsy-operations-updated", restore);
    return () => window.removeEventListener("etsy-operations-updated", restore);
  }, []);

  const selectedDesign = state?.designs.find((item) => item.id === selectedDesignId);
  const selectedProduct = state?.products.find((item) => item.id === selectedDesign?.productId);
  const evidence = useMemo(() => (state?.artifacts ?? []).filter((item) => item.kind === "keyword-research" && (item.targetId === selectedDesignId || item.targetId === selectedProduct?.id)), [selectedDesignId, selectedProduct?.id, state?.artifacts]);
  const confirmed = evidence.filter(isUsableResearchEvidence);
  const visualReviewEvidence = evidence.filter((item) => item.ownerConfirmed && item.mimeType.startsWith("image/") && item.ocrStatus === "unreadable");
  const packetEvidence = [...confirmed, ...visualReviewEvidence];
  const gaps = useMemo(() => state && selectedDesignId ? keywordEvidenceGaps(state, selectedDesignId) : [], [selectedDesignId, state]);
  const savedLoop = state?.keywordResearchLoops.find((item) => item.designId === selectedDesignId);
  const activeLoop = useMemo(() => {
    const fallback = defaultLoop(selectedDesign?.recipient ?? "", selectedProduct?.type ?? "Journal");
    return savedLoop ?? { ...fallback, designId: selectedDesignId };
  }, [savedLoop, selectedDesign?.recipient, selectedDesignId, selectedProduct?.type]);
  const evidenceArrivedForActiveRound = packetEvidence.some((item) => new Date(item.uploadedAt).getTime() >= new Date(activeLoop.updatedAt).getTime());
  const loopStage = (activeLoop.stage === "seed-requested" || activeLoop.stage === "need-deeper-research") && evidenceArrivedForActiveRound ? "evidence-received" as const : activeLoop.stage;
  const isEvidenceQualityRetry = loopStage === "need-deeper-research" && /data-quality retry|capture the existing|upload its csv/i.test(activeLoop.requestReason);

  async function commit(next: EtsyOperationsState, message: string) {
    setState(next);
    try { await saveOperationsState(next); window.dispatchEvent(new CustomEvent("etsy-operations-updated", { detail: { state: next } })); announce(message); }
    catch { announce("Saved in this tab only. IndexedDB could not be written."); }
  }

  async function copyResearchTask() {
    if (!state || !selectedDesignId) return;
    if (!savedLoop) await commit({ ...state, keywordResearchLoops: [{ ...activeLoop, updatedAt: new Date().toISOString() }, ...state.keywordResearchLoops] }, `Round ${activeLoop.round} research list copied. Paste it into the ${source === "everbee" ? "EverBee" : "eRank"} bulk keyword tool, then return with a CSV or screenshot.`);
    try { await copyText(activeLoop.queries.join("\n")); announce(`Round ${activeLoop.round} research list copied. Paste it into the ${source === "everbee" ? "EverBee" : "eRank"} bulk keyword tool.`); }
    catch { announce("Clipboard permission is unavailable. Select the visible keyword list and copy it manually."); }
  }

  async function copyOriginalScreenshotForCodex(artifact: EvidenceArtifact) {
    if (!artifact.dataUrl) { announce("This dashboard copy has no image data. Paste or upload the original screenshot again."); return; }
    try {
      const response = await fetch(artifact.dataUrl);
      const image = await response.blob();
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Image clipboard is unavailable");
      await navigator.clipboard.write([new ClipboardItem({ [image.type || artifact.mimeType || "image/png"]: image })]);
      announce("Original screenshot copied. Paste it directly into this Codex chat for visual review; it will not be treated as calculated CSV data.");
    } catch {
      announce("This browser could not copy the image. The screenshot remains in this dashboard; paste the same original image into Codex chat for visual review, or use CSV/XLSX for calculated metrics.");
    }
  }

  async function recordCodexVerdict() {
    if (!state || !selectedDesignId) return;
    const note = verdictNote.trim();
    const queries = nextQueries.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
    const support = supportingKeywords.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
    const avoid = avoidKeywords.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
    if (!note) { announce("Add the Codex reasoning so the next research decision is traceable."); return; }
    if (verdictStage === "need-deeper-research" && (queries.length < 1 || queries.length > 15)) { announce("For a deeper round, provide 1–15 exact queries to research next."); return; }
    if (verdictStage === "conclusion-ready" && !primaryKeyword.trim()) { announce("Choose one primary keyword before saving the conclusion."); return; }
    const next: KeywordResearchLoop = verdictStage === "need-deeper-research"
      ? { designId: selectedDesignId, round: activeLoop.round + 1, stage: "need-deeper-research", queries, requestReason: note, codexVerdict: note, updatedAt: new Date().toISOString() }
      : { designId: selectedDesignId, round: activeLoop.round, stage: "conclusion-ready", queries: activeLoop.queries, requestReason: activeLoop.requestReason, codexVerdict: note, primaryKeyword: primaryKeyword.trim(), supportingKeywords: support, avoidKeywords: avoid, updatedAt: new Date().toISOString() };
    await commit({ ...state, keywordResearchLoops: [next, ...state.keywordResearchLoops.filter((item) => item.designId !== selectedDesignId)] }, verdictStage === "need-deeper-research" ? `Codex requested Round ${next.round}. The exact next queries are now ready to copy.` : "Codex keyword conclusion saved. Primary, supporting and avoid terms are visible below.");
    setVerdictNote(""); setNextQueries(""); setPrimaryKeyword(""); setSupportingKeywords(""); setAvoidKeywords("");
  }

  function acceptPastedScreenshot(event: ClipboardEvent<HTMLDivElement>) {
    const image = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));
    if (!image) { setNotice("No image was found in the clipboard. Copy a screenshot first, then press Ctrl+V here."); return; }
    const extension = image.type === "image/jpeg" ? "jpg" : "png";
    setFile(new File([image], `pasted-screenshot-${new Date().toISOString().slice(0, 10)}.${extension}`, { type: image.type }));
    setNotice("Screenshot pasted. Press Save research evidence when the source and date are correct.");
  }

  async function saveResearchEvidence() {
    if (!state || !selectedProduct || !file || !researchDate) { setNotice("Choose a source, research date and one CSV/XLSX or screenshot first."); return; }
    try {
      const isImage = file.type.startsWith("image/");
      const parsed = isImage ? { rows: null, headers: [], metrics: [], contentText: "" } : await parseWorkbook(await file.arrayBuffer());
      const artifact: EvidenceArtifact = { id: createId("keyword-evidence"), kind: "keyword-research", source, authority: sourceAuthority(source), fileName: file.name, mimeType: file.type || "application/octet-stream", uploadedAt: new Date().toISOString(), periodStart: researchDate, periodEnd: researchDate, targetType: "product", targetId: selectedProduct.id, ownerConfirmed: false, ocrStatus: isImage ? "pending" : "not-needed", ...parsed, dataUrl: await fileDataUrl(file) };
      await commit({ ...state, artifacts: [artifact, ...state.artifacts] }, `${file.name} saved locally. Check its source and date, then press Confirm.`);
      setFile(null);
    } catch { setNotice("This file could not be read. Try CSV/XLSX or a PNG/JPG screenshot."); }
  }

  async function confirmEvidence(id: string) {
    if (!state) return;
    const artifact = state.artifacts.find((item) => item.id === id);
    if (!artifact) return;
    if (artifact.mimeType.startsWith("image/") && !artifact.contentText?.trim()) { await runOcr(artifact, true); return; }
    await commit({ ...state, artifacts: state.artifacts.map((item) => item.id === id ? { ...item, ownerConfirmed: true, ocrStatus: item.ocrStatus === "pending" ? "confirmed" : item.ocrStatus } : item) }, "Research evidence confirmed. The Codex Research Packet is now ready.");
  }

  async function runOcr(artifact: EvidenceArtifact, confirmAfterOcr = false) {
    if (!state || !artifact.dataUrl) { setNotice("This screenshot has no local image data. Upload or paste it again, then run OCR."); return; }
    setNotice("Reading screenshot locally...");
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      let preparedImage = artifact.dataUrl;
      try { preparedImage = await enhanceScreenshotForOcr(artifact.dataUrl); } catch { /* Keep the original image if canvas enhancement is unavailable. */ }
      const result = await worker.recognize(preparedImage);
      await worker.terminate();
      const text = result.data.text.trim();
      const metrics = Array.from(text.matchAll(/([A-Za-z][A-Za-z ]{1,30})\s*[:\-]\s*([$%\d,.]+)/g)).map((match) => {
        const value = Number(match[2].replace(/[$,%\s,]/g, ""));
        return { label: match[1].trim(), value: Number.isFinite(value) ? value : null, status: !Number.isFinite(value) ? "invalid" as const : value === 0 ? "confirmed-zero" as const : "confirmed" as const };
      });
      const next = { ...artifact, ownerConfirmed: confirmAfterOcr, contentText: text.slice(0, 25000), metrics, ocrStatus: text ? (confirmAfterOcr ? "confirmed" as const : "pending" as const) : "unreadable" as const };
      await commit({ ...state, artifacts: state.artifacts.map((item) => item.id === artifact.id ? next : item) }, text ? (confirmAfterOcr ? "OCR completed and this confirmed screenshot is now ready for the Codex Research Packet." : "OCR completed. Check the extracted text, then press Confirm to include this screenshot in the packet.") : (confirmAfterOcr ? "OCR could not read this screenshot. It is now confirmed for Codex visual review only; use CSV/XLSX when you need calculated metrics." : "OCR could not read this screenshot. Keep it as reference or upload a CSV/XLSX export."));
    } catch {
      const next = { ...artifact, ownerConfirmed: confirmAfterOcr ? true : artifact.ownerConfirmed, contentText: "", metrics: [], ocrStatus: "unreadable" as const };
      await commit({ ...state, artifacts: state.artifacts.map((item) => item.id === artifact.id ? next : item) }, confirmAfterOcr ? "OCR failed locally. This owner-confirmed screenshot is ready for Codex visual review only; use CSV/XLSX for calculated metrics." : "OCR failed locally. Keep this screenshot for visual review or use CSV/XLSX for calculated metrics.");
    }
  }

  async function withdrawConfirmation(id: string) {
    if (!state) return;
    await commit({ ...state, artifacts: state.artifacts.map((item) => item.id === id ? { ...item, ownerConfirmed: false } : item) }, "Confirmation withdrawn. This file is excluded from the Codex Research Packet, but remains available for review.");
  }

  async function removeEvidence(id: string) {
    if (!state) return;
    const artifact = state.artifacts.find((item) => item.id === id);
    if (!artifact || !window.confirm(`Remove ${artifact.fileName} from this local dashboard? The original file on your computer will not be deleted.`)) return;
    await commit({ ...state, artifacts: state.artifacts.filter((item) => item.id !== id) }, "Local dashboard copy removed. The original source file was not changed.");
  }

  const packet = [
    "MYGIFTSTYLE KEYWORD RESEARCH PACKET - ANALYZE, DO NOT PUBLISH",
    `Product: ${selectedProduct?.name ?? "Missing"}`,
    `Design: ${selectedDesign?.name ?? "Missing"}`,
    `Recipient / occasion: ${selectedDesign ? `${selectedDesign.recipient} / ${selectedDesign.occasion}` : "Missing"}`,
    "Evidence authority: eRank and EverBee are supplemental. Do not infer Etsy orders, revenue, or conversion from them.",
    "",
    ...packetEvidence.flatMap(artifactLines),
    "",
    "Requested Codex output: extract and compare keyword opportunities from the supplied evidence; identify 5-15 relevant seeds, recommend one primary and supporting terms with reasons, flag unsupported claims or weak relevance, then prepare a draft-only listing brief. Do not publish or edit Etsy.",
  ].join("\n");

  if (!state) return null;

  return <section className="rounded-[26px] border border-brand/25 bg-panel p-5 shadow-card sm:p-6" aria-label="Keyword Research Workspace">
    {toast && <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-50 flex max-w-[min(26rem,calc(100vw-2rem))] items-start gap-3 rounded-2xl border border-[#B9D7C0] bg-white p-4 shadow-xl"><CheckCircle2 size={20} className="mt-0.5 shrink-0 text-sage" aria-hidden="true" /><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-sage">Dashboard received it</p><p className="mt-1 text-sm font-semibold text-ink">{toast}</p></div><button type="button" onClick={() => setToast(null)} aria-label="Close confirmation" className="ml-1 rounded-md p-1 text-muted hover:bg-[#F8EDE4] hover:text-ink"><X size={16} /></button></div>}
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div><div className="flex items-center gap-2 text-brand"><SearchCheck size={18} /><span className="text-xs font-semibold uppercase tracking-[0.16em]">Keyword research data intake</span></div><h3 className="mt-2 font-display text-2xl font-bold text-ink">Upload the export or screenshot; let Codex do the keyword work</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">No spreadsheet-style manual entry is required. The design selection only tells us which product and customer intent this research belongs to.</p></div>
      <label className="min-w-64 text-xs font-semibold text-ink">Working design<select value={selectedDesignId} onChange={(event) => { if (controlledDesignId !== undefined) onSelectDesign?.(event.target.value); else setLocalDesignId(event.target.value); }} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal">{state.designs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </div>
    <div role="status" className="mt-4 rounded-xl border border-sage/25 bg-[#E8F0E6] px-4 py-3 text-xs font-semibold text-sage">{notice}</div>
    <section className="mt-5 rounded-2xl border border-[#D9E7DE] bg-[#F3F8F4] p-4" aria-label="Keyword research loop">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-sage">Keyword research loop</p><h4 className="mt-1 text-lg font-bold text-ink">Round {activeLoop.round}: {loopStage === "seed-requested" ? "start with these seeds" : loopStage === "evidence-received" ? "data received — Codex analysis is next" : loopStage === "need-deeper-research" ? "run the deeper research request" : "keyword conclusion ready"}</h4></div><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-ink">{confirmed.length} confirmed evidence file{confirmed.length === 1 ? "" : "s"}</span></div>
      {loopStage === "conclusion-ready" ? <div className="mt-4 grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-[#D9E7DE] bg-white p-3"><p className="text-xs font-bold text-sage">Primary keyword</p><p className="mt-1 text-sm font-bold text-ink">{activeLoop.primaryKeyword || "missing"}</p></div><div className="rounded-xl border border-[#D9E7DE] bg-white p-3"><p className="text-xs font-bold text-ink">Supporting</p><p className="mt-1 text-sm text-muted">{activeLoop.supportingKeywords?.join(", ") || "none recorded"}</p></div><div className="rounded-xl border border-[#D9E7DE] bg-white p-3"><p className="text-xs font-bold text-brand">Avoid / weak fit</p><p className="mt-1 text-sm text-muted">{activeLoop.avoidKeywords?.join(", ") || "none recorded"}</p></div><p className="md:col-span-3 text-xs leading-5 text-muted">{activeLoop.codexVerdict}</p></div> : <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]"><div><p className="text-sm font-semibold text-ink">{loopStage === "evidence-received" ? "Your research data is ready. Copy the Codex Research Packet below, paste it into this chat, then Codex will write either a deeper request or a conclusion here." : isEvidenceQualityRetry ? `Your only next action: reopen the existing ${source === "everbee" ? "EverBee" : "eRank"} result below, then upload its CSV or one tight screenshot of the table (Keyword through KD). Do not search new terms yet.` : `Your only next action: run these exact ${source === "everbee" ? "EverBee" : "eRank"} bulk queries.`}</p><p className="mt-1 text-xs leading-5 text-muted">Why this round: {activeLoop.requestReason}</p><pre className="mt-3 whitespace-pre-wrap rounded-xl border border-[#D9E7DE] bg-white p-3 font-sans text-sm leading-6 text-ink">{activeLoop.queries.join("\n")}</pre></div>{loopStage !== "evidence-received" && <button type="button" onClick={() => void copyResearchTask()} className="h-fit rounded-xl bg-ink px-4 py-3 text-xs font-bold text-white hover:bg-brand"><Clipboard size={15} className="mr-2 inline" />{isEvidenceQualityRetry ? "Copy same terms" : `Copy Round ${activeLoop.round} list`}</button>}</div>}
      {confirmed.length > 0 && loopStage !== "conclusion-ready" && <details className="mt-4 rounded-xl border border-[#D9E7DE] bg-white p-3"><summary className="cursor-pointer text-sm font-bold text-ink">Codex result — record the next research request or keyword conclusion</summary><p className="mt-2 text-xs leading-5 text-muted">You do not need to type this. After analysing your packet in chat, Codex writes the decision back here so the next action stays visible.</p><div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-xs font-semibold text-ink">Result<select value={verdictStage} onChange={(event) => setVerdictStage(event.target.value as typeof verdictStage)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal"><option value="need-deeper-research">Need deeper research</option><option value="conclusion-ready">Keyword conclusion ready</option></select></label><label className="text-xs font-semibold text-ink">Codex reasoning<textarea value={verdictNote} onChange={(event) => setVerdictNote(event.target.value)} placeholder="Why the data is sufficient or what needs checking next" className="mt-1.5 min-h-20 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" /></label>{verdictStage === "need-deeper-research" ? <label className="text-xs font-semibold text-ink md:col-span-2">Exact next queries (1–15, one per line)<textarea value={nextQueries} onChange={(event) => setNextQueries(event.target.value)} placeholder="Enter the precise Round 2 terms Codex requested" className="mt-1.5 min-h-24 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" /></label> : <><label className="text-xs font-semibold text-ink">Primary keyword<input value={primaryKeyword} onChange={(event) => setPrimaryKeyword(event.target.value)} placeholder="One chosen primary term" className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" /></label><label className="text-xs font-semibold text-ink">Supporting keywords<textarea value={supportingKeywords} onChange={(event) => setSupportingKeywords(event.target.value)} placeholder="Comma-separated supporting terms" className="mt-1.5 min-h-20 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" /></label><label className="text-xs font-semibold text-ink md:col-span-2">Avoid / weak relevance<textarea value={avoidKeywords} onChange={(event) => setAvoidKeywords(event.target.value)} placeholder="Terms not to use, with poor evidence or weak product fit" className="mt-1.5 min-h-20 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" /></label></>} </div><button type="button" onClick={() => void recordCodexVerdict()} className="mt-3 rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white hover:bg-brand">Save Codex result</button></details>}
    </section>
    <div className="mt-5 rounded-2xl border border-line bg-[#FBF7F2] p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_180px]"><label className="text-xs font-semibold text-ink">Research source<select value={source} onChange={(event) => setSource(event.target.value as EvidenceSource)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal"><option value="erank">eRank</option><option value="everbee">EverBee</option></select></label><label className="text-xs font-semibold text-ink">Research date<input type="date" value={researchDate} onChange={(event) => setResearchDate(event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" /></label></div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm font-bold text-ink hover:bg-[#F8EDE4]"><FileSpreadsheet size={17} />Upload CSV / XLSX<input className="sr-only" type="file" accept=".csv,.tsv,.xlsx,.xls" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm font-bold text-ink hover:bg-[#F8EDE4]"><Image size={17} />Upload screenshot<input className="sr-only" type="file" accept="image/png,image/jpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
        <div role="button" tabIndex={0} onPaste={acceptPastedScreenshot} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") event.currentTarget.focus(); }} className="cursor-text rounded-xl border border-dashed border-brand/40 bg-white px-4 py-3 text-center text-sm font-bold text-ink outline-none focus:ring-2 focus:ring-brand"><Clipboard size={17} className="mr-2 inline" />Paste screenshot (Ctrl+V)<div className="mt-1 text-[11px] font-normal text-muted">Click here, then paste your cap image.</div></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3"><span className="text-xs text-muted">{file ? `Selected: ${file.name}` : "No file selected"}</span><button type="button" disabled={!file} onClick={() => void saveResearchEvidence()} className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white hover:bg-brand disabled:cursor-not-allowed disabled:opacity-40"><Upload size={14} />Save research evidence</button></div>
      <p className="mt-3 text-xs leading-5 text-muted">The file is linked to {selectedProduct?.name ?? "the selected product"}. A screenshot may be uploaded or pasted when an export is slow; confirm it after checking the source and date.</p>
    </div>
    <div className="mt-5 rounded-2xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-semibold text-ink">Research files for this design</h4><p className="mt-1 text-xs text-muted">Confirm a screenshot once: the dashboard runs OCR locally and, when text is found, automatically prepares it for Codex. Withdraw keeps a file but excludes it; Remove deletes only this dashboard copy.</p></div><span className="rounded-full border border-line bg-[#FBF7F2] px-3 py-1 text-xs font-bold text-ink">{confirmed.length} usable / {evidence.length} uploaded</span></div>
      {evidence.length ? <ul className="mt-4 space-y-2">{evidence.map((item) => {
        const usable = isUsableResearchEvidence(item);
        const needsOcr = item.mimeType.startsWith("image/") && !item.contentText?.trim() && item.ocrStatus !== "unreadable";
        const visualReviewOnly = item.mimeType.startsWith("image/") && item.ownerConfirmed && item.ocrStatus === "unreadable";
        return <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-[#FBF7F2] px-3 py-2 text-xs">
          <div><span className="font-semibold text-ink">{item.fileName}</span><span className="ml-2 text-muted">{item.source} - {item.periodStart || "date missing"} - {usable ? "ready for Codex" : visualReviewOnly ? "Codex visual review only" : needsOcr ? "ready to OCR" : "awaiting confirmation"}</span>{item.contentText?.trim() && <details className="mt-2 max-w-xl text-muted"><summary className="cursor-pointer font-semibold text-ink">Review extracted OCR text</summary><pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-white p-2 font-sans text-[11px] leading-4">{item.contentText.slice(0, 4000)}</pre></details>}</div>
          <div className="flex flex-wrap items-center gap-2">
            {needsOcr && <button type="button" onClick={() => void (item.ownerConfirmed ? runOcr(item, true) : confirmEvidence(item.id))} className="inline-flex items-center gap-1 rounded-lg bg-[#E8F0E6] px-2.5 py-1.5 font-bold text-sage"><ScanText size={13} />{item.ownerConfirmed ? "Run confirmed OCR" : "Confirm & run OCR"}</button>}
            {visualReviewOnly && <button type="button" onClick={() => void copyOriginalScreenshotForCodex(item)} className="inline-flex items-center gap-1 rounded-lg bg-[#E8F0E6] px-2.5 py-1.5 font-bold text-sage"><Clipboard size={13} />Copy original screenshot</button>}
            {item.mimeType.startsWith("image/") && !needsOcr && !visualReviewOnly && <button type="button" onClick={() => void runOcr(item, item.ownerConfirmed)} className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-1.5 font-bold text-ink hover:bg-[#F8EDE4]"><ScanText size={13} />Improve OCR</button>}
            {usable ? <><span className="inline-flex items-center gap-1 font-semibold text-sage"><CheckCircle2 size={13} />Confirmed</span><button type="button" onClick={() => void withdrawConfirmation(item.id)} className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-1.5 font-bold text-ink hover:bg-[#F8EDE4]"><Undo2 size={13} />Withdraw</button></> : !needsOcr && !visualReviewOnly && <button type="button" onClick={() => void confirmEvidence(item.id)} className="rounded-lg bg-[#E8F0E6] px-3 py-1.5 font-bold text-sage">Confirm</button>}
            <button type="button" onClick={() => void removeEvidence(item.id)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-bold text-brand hover:bg-[#FFF1E8]"><Trash2 size={13} />Remove</button>
          </div>
        </li>;
      })}</ul> : <p className="mt-4 text-sm text-muted">No keyword-research file is linked to this product yet.</p>}
    </div>
    <div className={`mt-5 rounded-2xl border p-4 ${gaps.length ? "border-copper/25 bg-[#F9EEE4]" : "border-sage/25 bg-[#E8F0E6]"}`}>
      <div className="font-semibold text-ink">{gaps.length ? visualReviewEvidence.length ? "Screenshot visual-review packet is ready; calculated metrics still need an export" : "Research packet is waiting for one confirmed file" : "Research packet ready for Codex"}</div>
      {gaps.length ? <><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">{gaps.map((item) => <li key={item}>{item}</li>)}</ul>{visualReviewEvidence.length > 0 && <p className="mt-3 text-xs leading-5 text-copper">You may send the visual-review packet now. Codex can read the original image, but this dashboard will not turn it into calculated metrics or mark a keyword conclusion as high confidence without structured evidence.</p>}</> : <p className="mt-2 text-xs text-sage">Copy the packet and paste it into this chat. Codex will do the extraction, comparison, keyword selection, and draft preparation.</p>}
    </div>
    <button type="button" disabled={packetEvidence.length === 0} onClick={() => void copyText(packet).then(() => setNotice(visualReviewEvidence.length ? "Visual-review packet copied. Paste this text into Codex first, then click Copy original screenshot and paste the image as a second message." : "Codex Research Packet copied. Paste it into this chat for analysis.")).catch(() => setNotice("Clipboard permission is unavailable. Please retry or select the packet text manually."))} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white hover:bg-brand disabled:cursor-not-allowed disabled:opacity-40"><Clipboard size={15} />{visualReviewEvidence.length ? "Copy visual-review packet" : "Copy Codex Research Packet"}</button>
  </section>;
}
