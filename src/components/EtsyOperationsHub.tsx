import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { ArchiveRestore, CheckCircle2, Clipboard, FileDown, FileUp, Image, LibraryBig, Plus, ShieldCheck, Sparkles, Upload, Workflow, X } from "lucide-react";
import KeywordResearchWorkspace from "./KeywordResearchWorkspace";
import ProductFactsGate from "./ProductFactsGate";
import EvidenceIntakeStepper, { type EvidenceUploadDraft } from "./EvidenceIntakeStepper";
import SellerDecisionCard from "./SellerDecisionCard";
import DecisionControlSummary from "./DecisionControlSummary";
import EtsyPresentationMode from "./EtsyPresentationMode";
import {
  DEFAULT_STATE,
  auditMissing,
  buildPrimaryDashboardSummary,
  buildSellerDecision,
  buildWorkingContext,
  collectDraftPackageIssues,
  collectDraftTagIssues,
  collectListingDraftApprovalIssues,
  createId,
  deriveActiveDesignContent,
  deriveActiveDraftState,
  deriveWorkingItemState,
  hydrateListingDrafts,
  hydrateKnownDesigns,
  hydrateKnownProducts,
  hydrateKeywordResearch,
  legacyMigration,
  listingBriefMissing,
  loadOperationsState,
  parseWorkbook,
  productFactGaps,
  saveOperationsState,
  shouldRunOcrBeforeConfirm,
  sourceAuthority,
  summarizeMetricStatus,
  type ContentPost,
  type Design,
  type EvidenceArtifact,
  type EvidenceKind,
  type EvidenceIntakeKind,
  type EvidenceSource,
  type EtsyOperationsState,
  type Product,
  type OperationsTab,
} from "../lib/etsyOperations";
import { buildDecisionControlState } from "../lib/decisionControl";

type UploadDraft = EvidenceUploadDraft;
const UPLOAD_DRAFT_KEY = "mygiftstyle-etsy-operations:upload-draft";
const EMPTY_UPLOAD: UploadDraft = { file: null, sourceUrl: "", kind: "shop-stats", source: "etsy", periodStart: "", periodEnd: "", targetType: "shop", targetId: "shop" };

const SOURCES: Array<{ id: EvidenceSource; label: string }> = [
  { id: "etsy", label: "Etsy first-party" }, { id: "erank", label: "eRank" }, { id: "everbee", label: "EverBee" }, { id: "owner", label: "Owner-provided" }, { id: "instagram", label: "Instagram Insights" }, { id: "pinterest", label: "Pinterest Analytics" }, { id: "facebook", label: "Facebook / Meta Insights" }, { id: "threads", label: "Threads Insights" },
];
const KINDS: Array<{ id: EvidenceKind; label: string }> = [
  { id: "shop-stats", label: "Shop Stats overview" }, { id: "listing-performance", label: "Listing performance" }, { id: "traffic-sources", label: "Traffic Sources / Etsy Search" }, { id: "keyword-research", label: "Keyword research" }, { id: "product-facts", label: "Product facts" }, { id: "cost-fulfilment", label: "Cost & fulfilment" }, { id: "design", label: "Design / mockup" }, { id: "social-results", label: "Social results" },
];

function loadUploadDraft(): UploadDraft {
  try {
    const saved = JSON.parse(sessionStorage.getItem(UPLOAD_DRAFT_KEY) ?? "{}") as Partial<Omit<UploadDraft, "file">>;
    return { ...EMPTY_UPLOAD, ...saved, file: null };
  } catch { return EMPTY_UPLOAD; }
}

const EMPTY_PRODUCT: Omit<Product, "id"> = { name: "", type: "Journal", material: "", size: "", productionMethod: "", fulfilmentSource: "", costSource: "", allowedClaims: "", blockedClaims: "", sourceNote: "" };
const EMPTY_DESIGN: Omit<Design, "id"> = { name: "", productId: "", recipient: "", occasion: "", mockupStatus: "missing", assetName: "" };
const EMPTY_POST: Omit<ContentPost, "id"> = { contentId: "", platform: "Pinterest", listingId: "", publishedOn: "", assetName: "", copy: "", cta: "", url: "", impressions: "", clicks: "", saves: "", outcome: "Attribution unconfirmed" };
const HISTORICAL_TAG_REFERENCE = "Etsy Sonnet Memory - Historical Source Register (Obsidian: Trevor/30 - Notes/Projects/Etsy/Reference). Historical eRank/EverBee and strategy context only.";
const DESIGN04_SEEDS = ["tell me your story journal", "mom story journal", "mom memory journal", "personalized journal for mom", "mom legacy journal"];
const DESIGN04_TAGS = ["tell me your story", "mom story journal", "mom memory journal", "mom keepsake journal", "memory book for mom", "mom legacy journal", "gift for mom", "family memory gift", "vegan leather gift", "lined journal", "journal for mom", "mother memory gift", "family legacy gift"];
const DESIGN04_DRAFT_PACKAGE = `TITLE\nPersonalized Mom Story Journal, Tell Me Your Story Gift for Mom, Custom Family Memory Keepsake, Vegan Leather Lined Notebook\n\nTAGS\n${DESIGN04_TAGS.join("\n")}\n\nDESCRIPTION\nGive Mom a meaningful place to keep the stories, memories, and advice your family wants to remember. This personalized vegan leather journal features the MD-1405 Design 04 printed cover, 200 lined pages, a brown elastic closure, and a ribbon bookmark.\n\nFAQ / ACCURACY NOTES\n- Printed cover design only; do not claim engraving, embossing, or debossing.\n- No guided prompts are included.\n- Production target: about 5 business days. Confirm destination-specific shipping at checkout.\n- Personalization wording is draft-only and must match the final custom-name setup before publishing.\n\nSOCIAL COPY\nA gift for Mom that makes space for the stories your family never wants to forget. Start a memory worth keeping.\n\nSTATUS\nDraft only — no Etsy publish, edit, or account connection.`;
const DEFAULT_ACTIVE_DESIGN_ID = "design-md1405-04-journal";
const ACTIVE_DESIGN_KEY = "mygiftstyle-etsy-operations:active-design";

function loadActiveDesignId() {
  try { return localStorage.getItem(ACTIVE_DESIGN_KEY) || DEFAULT_ACTIVE_DESIGN_ID; }
  catch { return DEFAULT_ACTIVE_DESIGN_ID; }
}

function dataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
function metricClass(status: EvidenceArtifact["metrics"][number]["status"]) { return status === "confirmed" ? "text-sage" : status === "confirmed-zero" ? "text-copper" : "text-brand"; }
function implementationTone(status: "ready" | "gated" | "draft" | "phase-2") {
  if (status === "ready") return "border-sage/25 bg-[#F3F8F4] text-sage";
  if (status === "draft") return "border-copper/25 bg-[#FFF9F3] text-copper";
  if (status === "phase-2") return "border-line bg-[#F4ECE4] text-muted";
  return "border-brand/25 bg-[#FFF1E8] text-brand";
}
function evidenceStateLabel(artifact: EvidenceArtifact) {
  if (artifact.ownerConfirmed) return artifact.ocrStatus === "unreadable" ? "owner confirmed · Codex visual review only" : "owner confirmed";
  if (artifact.mimeType.startsWith("image/") && artifact.ocrStatus === "unreadable") return "OCR unreadable · review before confirmation";
  if (artifact.mimeType.startsWith("image/") && artifact.ocrStatus === "pending" && artifact.contentText?.trim()) return "OCR complete · review before confirmation";
  if (shouldRunOcrBeforeConfirm(artifact)) return "OCR not run · review needed";
  return "saved locally · review needed";
}
function evidenceConfirmLabel(_artifact?: EvidenceArtifact) { return "Review before confirm"; }
function downloadJson(name: string, value: unknown) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); }

export default function EtsyOperationsHub({ initialTab = "today", presentationOnly = false }: { initialTab?: OperationsTab; presentationOnly?: boolean }) {
  const [workspaceMode, setWorkspaceMode] = useState<"presentation" | "prototype">(presentationOnly ? "presentation" : "prototype");
  const [operationsTab, setOperationsTab] = useState<OperationsTab>(initialTab);
  const [activeDesignId, setActiveDesignId] = useState(loadActiveDesignId);
  const [state, setState] = useState<EtsyOperationsState | null>(null);
  const [notice, setNotice] = useState("Loading local Operations Hub…");
  const [toast, setToast] = useState<string | null>(null);
  const [selectedListingId, setSelectedListingId] = useState("");
  const [auditPeriod, setAuditPeriod] = useState({ start: "", end: "" });
  const [upload, setUpload] = useState<UploadDraft>(loadUploadDraft);
  const [reviewArtifactId, setReviewArtifactId] = useState<string | null>(null);
  const [product, setProduct] = useState(EMPTY_PRODUCT);
  const [design, setDesign] = useState(EMPTY_DESIGN);
  const [post, setPost] = useState(EMPTY_POST);
  const [listingStudio, setListingStudio] = useState({ productId: "", designId: "", positioning: "", seeds: "", tags: "", packageText: "" });

  const showToast = (message: string) => { setNotice(message); setToast(message); };
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 6000); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => { try { localStorage.setItem(ACTIVE_DESIGN_KEY, activeDesignId); } catch { /* Active selection remains available for this session. */ } }, [activeDesignId]);
  useEffect(() => { try { const { file: _file, ...recoverableDraft } = upload; sessionStorage.setItem(UPLOAD_DRAFT_KEY, JSON.stringify(recoverableDraft)); } catch { /* The visible form remains usable when browser storage is unavailable. */ } }, [upload]);
  useEffect(() => {
    void (async () => {
      try {
        const loaded = await loadOperationsState();
        const migrated = hydrateListingDrafts(hydrateKeywordResearch(hydrateKnownDesigns(hydrateKnownProducts(legacyMigration(loaded)))));
        if (migrated !== loaded) await saveOperationsState(migrated);
        setState(migrated);
        setActiveDesignId((current) => migrated.designs.some((item) => item.id === current)
          ? current
          : migrated.designs.find((item) => item.id === DEFAULT_ACTIVE_DESIGN_ID)?.id ?? migrated.designs[0]?.id ?? "");
        setNotice(migrated.artifacts.length ? "Local evidence restored. Originals remain on this device." : "Journal baseline, Acrylic LED Plaque baseline, and MD-1405 Design 04 Journal are ready. Add dated evidence or keyword research next.");
      } catch {
        setState(DEFAULT_STATE);
        setNotice("Local browser storage is unavailable. Your input remains on screen but will not survive a reload.");
      }
    })();
  }, []);
  useEffect(() => { const syncFromResearchUpload = (event: Event) => { const next = (event as CustomEvent<{ state?: EtsyOperationsState }>).detail?.state; if (next) setState(next); }; window.addEventListener("etsy-operations-updated", syncFromResearchUpload); return () => window.removeEventListener("etsy-operations-updated", syncFromResearchUpload); }, []);
  useEffect(() => {
    if (!state) return;
    const activeDesign = state.designs.find((item) => item.id === activeDesignId);
    if (!activeDesign) return;
    setListingStudio((current) => current.designId === activeDesign.id ? current : {
      productId: activeDesign.productId,
      designId: activeDesign.id,
      positioning: "",
      seeds: "",
      tags: "",
      packageText: "",
    });
  }, [activeDesignId, state?.designs]);

  async function commit(next: EtsyOperationsState, message: string) { setState(next); try { await saveOperationsState(next); window.dispatchEvent(new Event("etsy-operations-updated")); showToast(message); } catch { showToast("Saved in this browser session only. IndexedDB could not be written."); } }
  const updateUpload = <K extends keyof UploadDraft>(key: K, value: UploadDraft[K]) => setUpload((current) => ({ ...current, [key]: value }));
  const updateProduct = <K extends keyof Omit<Product, "id">>(key: K, value: Omit<Product, "id">[K]) => setProduct((current) => ({ ...current, [key]: value }));
  const updateDesign = <K extends keyof Omit<Design, "id">>(key: K, value: Omit<Design, "id">[K]) => setDesign((current) => ({ ...current, [key]: value }));
  function chooseActiveDesign(nextDesignId: string) {
    if (!nextDesignId) return;
    setActiveDesignId(nextDesignId);
  }

  const auditGaps = useMemo(() => state ? auditMissing(state, selectedListingId, auditPeriod.start, auditPeriod.end) : [], [auditPeriod.end, auditPeriod.start, selectedListingId, state]);
  const seedKeywords = listingStudio.seeds.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
  const draftTags = listingStudio.tags.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
  const tagIssues = useMemo(() => {
    const product = state?.products.find((item) => item.id === listingStudio.productId);
    return collectDraftTagIssues(draftTags, product?.blockedClaims);
  }, [draftTags.join("|"), listingStudio.productId, state?.products]);
  const studioGaps = useMemo(() => state ? listingBriefMissing(state, listingStudio.productId, listingStudio.designId, seedKeywords) : [], [listingStudio.designId, listingStudio.productId, seedKeywords.join("|"), state]);
  const journal = state?.products.find((item) => item.id === "product-standard-journal");
  const journalEvidenceGaps = useMemo(() => state && journal ? productFactGaps(state, journal.id) : [], [journal, state]);

  function prepareEvidenceStep(kind: EvidenceIntakeKind) {
    if (!selectedListingId || !auditPeriod.start || !auditPeriod.end || auditPeriod.start > auditPeriod.end) { showToast("Choose a listing and valid comparable start/end dates first."); return; }
    if ((upload.file || upload.sourceUrl.trim()) && !window.confirm("Switch the evidence lane? This clears the unsaved file or source link; saved evidence is not affected.")) return;
    const targetType = kind === "shop-stats" ? "shop" : "listing";
    setUpload((current) => ({ ...current, file: null, sourceUrl: "", kind, source: "etsy", periodStart: auditPeriod.start, periodEnd: auditPeriod.end, targetType, targetId: targetType === "shop" ? "shop" : selectedListingId }));
    showToast(`${kind === "shop-stats" ? "Shop Stats" : kind === "listing-performance" ? "Listing Performance" : "Traffic Sources"} lane prepared for ${auditPeriod.start} → ${auditPeriod.end}. Add the export, save it, then review before confirmation.`);
  }

  function prepareJournalEvidence(kind: "product-facts" | "cost-fulfilment") {
    if (!journal) return;
    if ((upload.file || upload.sourceUrl.trim()) && !window.confirm("Switch the evidence lane? This clears the unsaved file or source link; saved evidence is not affected.")) return;
    setUpload((current) => ({ ...current, file: null, sourceUrl: "", kind, source: "owner", targetType: "product", targetId: journal.id }));
    showToast(kind === "product-facts" ? "Journal product-facts lane prepared. Add a product-page/specification screenshot or export, then date and save it." : "Journal cost-and-fulfilment lane prepared. Paste a dated supplier/official link or add a cost file, then save and confirm it.");
  }

  async function attestJournalBaseline() {
    if (!state || !journal) return;
    const alreadyRecorded = state.artifacts.some((item) => item.kind === "product-facts" && item.targetId === journal.id && item.fileName === "Journal baseline owner attestation" && item.ownerConfirmed);
    if (alreadyRecorded) { showToast("The Journal baseline attestation is already recorded. You can remove it from the evidence table if it is no longer current."); return; }
    const today = new Date().toISOString().slice(0, 10);
    const artifact: EvidenceArtifact = {
      id: createId("evidence"), kind: "product-facts", source: "owner", authority: "inference", fileName: "Journal baseline owner attestation", mimeType: "application/json", uploadedAt: new Date().toISOString(), periodStart: today, periodEnd: today, targetType: "product", targetId: journal.id, ownerConfirmed: true, ocrStatus: "not-needed", rows: null, headers: [], metrics: [],
      contentText: ["Owner baseline attestation — no source file attached.", `Material: ${journal.material}`, `Size/pages: ${journal.size}`, `Production method: ${journal.productionMethod}`, "Use a current supplier product page, screenshot, or export to replace this attestation when details change."].join("\n"),
    };
    await commit({ ...state, artifacts: [artifact, ...state.artifacts] }, "Journal owner baseline attestation recorded. It is local, removable, and not presented as supplier evidence.");
  }

  async function saveUpload() {
    const sourceUrl = upload.sourceUrl.trim();
    const isValidUrl = sourceUrl ? /^https?:\/\//i.test(sourceUrl) : false;
    if (!state || (!upload.file && !isValidUrl) || !upload.periodStart || !upload.periodEnd || !upload.targetId) { showToast("Choose a file or valid https:// source link, dated coverage, and a linked target before saving evidence."); return; }
    try {
      const file = upload.file;
      const isImage = Boolean(file?.type.startsWith("image/"));
      const buffer = file && !isImage ? await file.arrayBuffer() : null;
      const parsed = buffer ? await parseWorkbook(buffer) : { rows: null, headers: [], metrics: [], contentText: sourceUrl ? `Source link: ${sourceUrl}` : "" };
      const linkName = sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, "") : "source-link";
      const artifact: EvidenceArtifact = { id: createId("evidence"), kind: upload.kind, source: upload.source, authority: sourceAuthority(upload.source), fileName: file?.name ?? linkName, mimeType: file?.type || (sourceUrl ? "text/uri-list" : "application/octet-stream"), uploadedAt: new Date().toISOString(), periodStart: upload.periodStart, periodEnd: upload.periodEnd, targetType: upload.targetType, targetId: upload.targetId, ownerConfirmed: false, ocrStatus: isImage ? "pending" : "not-needed", ...parsed, ...(file ? { dataUrl: await dataUrl(file) } : {}), ...(sourceUrl ? { sourceUrl } : {}) };
      await commit({ ...state, artifacts: [artifact, ...state.artifacts] }, `${file?.name ?? linkName} saved locally. Confirm its values before using it in a decision.`);
      setUpload((current) => ({ ...current, file: null, sourceUrl: "" }));
    } catch { showToast("This file could not be parsed. Try a CSV/XLSX export or a PNG/JPG screenshot."); }
  }

  async function runOcr(artifact: EvidenceArtifact) {
    if (!state || !artifact.dataUrl) return;
    showToast("Reading screenshot locally…");
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      const result = await worker.recognize(artifact.dataUrl);
      await worker.terminate();
      const text = result.data.text.trim();
      const metrics = Array.from(text.matchAll(/([A-Za-z][A-Za-z ]{1,30})\s*[:\-]\s*([$%\d,.]+)/g)).map((match) => {
        const value = Number(match[2].replace(/[$,%\s,]/g, ""));
        return { label: match[1].trim(), value: Number.isFinite(value) ? value : null, status: !Number.isFinite(value) ? "invalid" as const : value === 0 ? "confirmed-zero" as const : "confirmed" as const };
      });
      const next = { ...artifact, contentText: text.slice(0, 25000), metrics, ownerConfirmed: artifact.ownerConfirmed, ocrStatus: text ? "pending" as const : "unreadable" as const };
      await commit({ ...state, artifacts: state.artifacts.map((item) => item.id === artifact.id ? next : item) }, text ? "OCR completed for review. Check the extracted values, then confirm this evidence." : "OCR could not read this screenshot. It is kept locally as visual reference; a CSV/XLSX is preferred for calculated metrics.");
    } catch {
      const next = { ...artifact, contentText: "", metrics: [], ownerConfirmed: artifact.ownerConfirmed, ocrStatus: "unreadable" as const };
      await commit({ ...state, artifacts: state.artifacts.map((item) => item.id === artifact.id ? next : item) }, "OCR failed locally. Review the screenshot before deciding whether to confirm it as visual-only evidence; use CSV/XLSX for calculated metrics.");
    }
  }

  function openArtifactReview(id: string) {
    setReviewArtifactId(id);
  }
  function confirmArtifact(id: string) {
    openArtifactReview(id);
  }
  async function confirmReviewedArtifact(id: string) {
    if (!state) return;
    const artifact = state.artifacts.find((item) => item.id === id);
    if (!artifact) return;
    if (reviewArtifactId !== id) { showToast("Open the evidence review before confirming it."); return; }
    if (shouldRunOcrBeforeConfirm(artifact)) { showToast("Run OCR for review first, or keep this screenshot unconfirmed."); return; }
    await commit({ ...state, artifacts: state.artifacts.map((item) => item.id === id ? { ...item, ownerConfirmed: true, ocrStatus: item.ocrStatus === "pending" ? "confirmed" : item.ocrStatus } : item) }, artifact.ocrStatus === "unreadable" ? "Visual-only evidence confirmed after review. It remains ineligible for calculated decisions." : "Evidence reviewed and owner-confirmed. It may now be checked for read-only downstream eligibility.");
    setReviewArtifactId(null);
  }
  async function removeArtifact(id: string) { if (!state || !window.confirm("Remove this local dashboard copy? Your original file is not deleted.")) return; if (reviewArtifactId === id) setReviewArtifactId(null); await commit({ ...state, artifacts: state.artifacts.filter((item) => item.id !== id) }, "Local dashboard copy removed. Original source file was not changed."); }
  async function addProduct() { if (!state || !product.name.trim()) { showToast("Give the product a name before adding it."); return; } const next = { ...state, products: [...state.products, { ...product, id: createId("product"), factsStatus: "baseline" as const }] }; await commit(next, "Product card saved. Link a design to continue."); setProduct(EMPTY_PRODUCT); }
  async function addDesign() { if (!state || !design.name.trim() || !design.productId) { showToast("Choose a product and give this design a name."); return; } await commit({ ...state, designs: [...state.designs, { ...design, id: createId("design") }] }, "Design linked to product. Add keyword research before preparing a listing brief."); setDesign(EMPTY_DESIGN); }
  async function addPost() { if (!state || !post.contentId.trim() || !post.listingId || !post.publishedOn) { showToast("Content ID, target listing and publish date are required for traceable social tracking."); return; } await commit({ ...state, posts: [{ ...post, id: createId("post") }, ...state.posts] }, "Social post saved. Platform metrics are context until Etsy attribution is confirmed."); setPost(EMPTY_POST); }
  async function saveListingDraft() {
    if (!state || !listingStudio.productId || !listingStudio.designId || !listingStudio.packageText.trim()) { showToast("Choose the product and design, then paste the complete Codex listing draft before saving."); return; }
    const evidenceIds = state.artifacts.filter((item) => item.ownerConfirmed && (item.targetId === listingStudio.productId || item.targetId === listingStudio.designId)).map((item) => item.id);
    await commit({ ...state, listingDrafts: [{ id: createId("listing-draft"), productId: listingStudio.productId, designId: listingStudio.designId, sourcePacket: listingStudio.packageText.trim(), tags: draftTags, evidenceIds, status: "draft", createdAt: new Date().toISOString() }, ...state.listingDrafts] }, "Codex listing draft saved locally. It has not been published or sent to Etsy.");
    setListingStudio((current) => ({ ...current, packageText: "" }));
  }
  async function approveListingDraft(id: string) {
    if (!state) return;
    const draft = state.listingDrafts.find((item) => item.id === id);
    if (!draft) return;
    const linkedLoop = state.keywordResearchLoops.find((item) => item.designId === draft.designId);
    const approvalSeeds = linkedLoop?.queries?.length ? linkedLoop.queries : draft.designId === DEFAULT_ACTIVE_DESIGN_ID ? DESIGN04_SEEDS : [];
    const approvalIssues = collectListingDraftApprovalIssues(state, draft, approvalSeeds);
    if (approvalIssues.length) {
      showToast(`Approval is blocked: ${approvalIssues[0]}.`);
      return;
    }
    if (!window.confirm("Mark this saved draft as approved for manual Etsy entry? This will not publish, edit, or connect to Etsy.")) return;
    await commit({ ...state, listingDrafts: state.listingDrafts.map((item) => item.id === id ? { ...item, status: "approved-for-manual-entry", approvedAt: new Date().toISOString() } : item) }, "Draft approved for manual Etsy entry only. Dashboard did not publish or edit Etsy.");
  }
  async function removeListingDraft(id: string) { if (!state || !window.confirm("Remove this saved local listing draft? This does not change Etsy.")) return; await commit({ ...state, listingDrafts: state.listingDrafts.filter((item) => item.id !== id) }, "Saved local listing draft removed. Etsy was not changed."); }

  function auditPacket() {
    if (!state) return "";
    const listing = state.listings.find((item) => item.id === selectedListingId);
    if (auditGaps.length) return ["ETSY MISSING-DATA REQUEST", `Listing: ${listing?.title ?? selectedListingId} (${selectedListingId})`, `Period: ${auditPeriod.start || "missing"} to ${auditPeriod.end || "missing"}`, "", "Please provide:", ...auditGaps.map((item) => `- ${item}`), "", "Do not make a performance conclusion until these Etsy first-party inputs are confirmed."].join("\n");
    const evidence = state.artifacts.filter((item) => item.ownerConfirmed && item.periodStart === auditPeriod.start && item.periodEnd === auditPeriod.end && (item.targetType === "shop" || item.targetId === selectedListingId));
    return ["ETSY READ-ONLY AUDIT PACKET", `Listing: ${listing?.title ?? selectedListingId} (${selectedListingId})`, `Period: ${auditPeriod.start} to ${auditPeriod.end}`, "", ...evidence.flatMap((item) => [`[${item.kind}] ${item.fileName}`, `Authority: ${item.authority}; Source: ${item.source}; OCR: ${item.ocrStatus}`, `Metrics: ${item.metrics.map((metric) => `${metric.label}=${metric.value ?? metric.status}`).join(", ") || "none parsed"}`, ""]), "Requested Codex output: evidence-backed listing diagnosis, missing limits, one primary test variable, and draft-only next steps.", "Safety boundary: no direct Etsy change, pricing action, ad action, or publication."].join("\n");
  }
  function sellerDecisionPacket() {
    return [
      "MYGIFTSTYLE SELLER DECISION BRIEF",
      `Listing: ${sellerDecision.listingTitle} (${sellerDecision.listingId || "not selected"})`,
      `Status: ${sellerDecision.status === "ready" ? "Evidence attached; choose a map row" : "Unknown / Collect data"}`,
      "",
      `What to update: ${sellerDecision.whatToUpdate}`,
      `When to update: ${sellerDecision.whenToUpdate}`,
      `Trigger signal: ${sellerDecision.triggerSignal}`,
      `Observation window: ${sellerDecision.observationWindow}`,
      `Measurable result: ${sellerDecision.measurableResult}`,
      "",
      "Required evidence:",
      ...sellerDecision.requiredEvidence.map((item) => `- ${item}`),
      ...(sellerDecision.missingEvidence.length ? ["", "Missing / invalid limits:", ...sellerDecision.missingEvidence.map((item) => `- ${item}`)] : []),
      "",
      "Safety boundary: local draft-only planning. No Etsy login, publish, edit, price change, ad change or attribution claim.",
    ].join("\n");
  }
  function listingPacket() { const selectedProduct = state?.products.find((item) => item.id === listingStudio.productId); const selectedDesign = state?.designs.find((item) => item.id === listingStudio.designId); return ["NEW ETSY LISTING BRIEF", `Readiness: ${studioGaps.length ? "blocked" : "ready for Codex draft"}`, `Missing: ${studioGaps.join("; ") || "none"}`, "", `Product: ${selectedProduct?.name ?? "not selected"}`, `Product facts: ${selectedProduct ? `${selectedProduct.material}; ${selectedProduct.size}; ${selectedProduct.productionMethod}` : "missing"}`, `Fulfilment/cost source: ${selectedProduct ? `${selectedProduct.fulfilmentSource}; ${selectedProduct.costSource}` : "missing"}`, `Allowed claims: ${selectedProduct?.allowedClaims || "missing"}`, `Blocked claims: ${selectedProduct?.blockedClaims || "missing"}`, `Design: ${selectedDesign?.name ?? "not selected"} — ${selectedDesign?.recipient || "recipient missing"}; ${selectedDesign?.occasion || "occasion missing"}`, `Positioning: ${listingStudio.positioning || "missing"}`, `Seed keywords (${seedKeywords.length}): ${seedKeywords.join(", ") || "missing"}`, `Historical tag reference: ${HISTORICAL_TAG_REFERENCE}`, "Tag decision rule: consult the historical reference for relevant lanes and rejected terms, then prefer current dated research evidence and product truth. Each Etsy tag must be 20 characters or fewer; do not adopt a historical keyword only because it appears in the archive.", `Pasted draft tags (${draftTags.length}): ${draftTags.join(", ") || "not yet pasted"}`, `Tag checker: ${tagIssues.join("; ") || "no limit, duplicate, or blocked-claim issue detected"}`, "", "Requested Codex draft: natural American English title, 13 tags, description, FAQ, personalization wording, thumbnail brief and social-copy options. Keep all output draft-only for owner approval."].join("\n"); }
  async function copy(text: string, success: string) { try { await navigator.clipboard.writeText(text); showToast(success); } catch { showToast("Copy failed. Browser clipboard permission may be blocked."); } }
  async function importBackup(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; try { const imported = JSON.parse(await file.text()) as EtsyOperationsState; if (imported.version !== 1 || !Array.isArray(imported.artifacts) || !window.confirm("Replace the current local dashboard state with this backup?")) return; await commit(imported, "Backup imported locally."); } catch { showToast("This is not a valid Etsy Operations Hub backup file."); } finally { event.target.value = ""; } }
  function openActiveListingBrief() {
    const activeDesign = state?.designs.find((item) => item.id === activeDesignId);
    if (!state || !activeDesign) { showToast("Choose an active design before opening a Listing Brief."); return; }
    const savedDraft = deriveActiveDraftState(state.listingDrafts, activeDesign.id).currentDraft;
    if (savedDraft) {
      setOperationsTab("results");
      showToast(savedDraft.status === "approved-for-manual-entry" ? `${activeDesign.name} is already approved for manual Etsy entry. Nothing was sent to Etsy.` : `A ${activeDesign.name} draft is already saved. Review it instead of creating a duplicate.`);
      return;
    }
    const linkedLoop = state.keywordResearchLoops.find((item) => item.designId === activeDesign.id);
    const isDesign04 = activeDesign.id === DEFAULT_ACTIVE_DESIGN_ID;
    setListingStudio({
      productId: activeDesign.productId,
      designId: activeDesign.id,
      positioning: isDesign04 ? "Mom / family legacy / memory gift. A printed journal that helps preserve stories and reflections without claiming guided prompts." : "",
      seeds: (linkedLoop?.queries?.length ? linkedLoop.queries : isDesign04 ? DESIGN04_SEEDS : []).join("\n"),
      tags: isDesign04 ? DESIGN04_TAGS.join("\n") : "",
      packageText: isDesign04 ? DESIGN04_DRAFT_PACKAGE : "",
    });
    setOperationsTab("results");
    showToast(isDesign04 ? "Design 04 Journal Listing Brief is ready for your draft review. Nothing was sent to Etsy." : `${activeDesign.name} Listing Studio opened. Add its own positioning and Codex draft; Design 04 demo content was not reused.`);
  }

  if (!state) return <section className="rounded-[26px] border border-line bg-panel p-6 text-sm text-muted">{notice}</section>;
  const renderedState = state;
  const selectedListing = state.listings.find((item) => item.id === selectedListingId);
  const reviewArtifact = reviewArtifactId ? state.artifacts.find((item) => item.id === reviewArtifactId) : undefined;
  const sellerDecision = buildSellerDecision(state, selectedListingId);
  const decisionControl = buildDecisionControlState(state.artifacts, selectedListing, auditPeriod);
  const eligibleArtifacts = state.artifacts.filter((item) => item.ownerConfirmed);
  const activeDesign = state.designs.find((item) => item.id === activeDesignId)
    ?? state.designs.find((item) => item.id === DEFAULT_ACTIVE_DESIGN_ID);
  const activeLoop = state.keywordResearchLoops.find((item) => item.designId === activeDesign?.id);
  const activeResearch = state.artifacts.filter((item) => item.kind === "keyword-research" && item.ownerConfirmed && (item.targetId === activeDesign?.id || item.targetId === activeDesign?.productId));
  const activeSeeds = activeLoop?.queries?.length
    ? activeLoop.queries
    : activeDesign?.id === DEFAULT_ACTIVE_DESIGN_ID
      ? DESIGN04_SEEDS
      : listingStudio.designId === activeDesign?.id
        ? seedKeywords
        : [];
  const activeBriefGaps = activeDesign ? listingBriefMissing(state, activeDesign.productId, activeDesign.id, activeSeeds) : ["choose an active design"];
  const hasKeywordDecision = activeLoop?.stage === "conclusion-ready" && Boolean(activeLoop.primaryKeyword);
  const activeDraftState = deriveActiveDraftState(state.listingDrafts, activeDesign?.id);
  const latestActiveDraft = activeDraftState.currentDraft;
  const hasDraft = activeDraftState.hasDraft;
  const savedDraftApprovalGaps = latestActiveDraft && activeDesign
    ? listingBriefMissing(state, latestActiveDraft.productId, latestActiveDraft.designId, activeSeeds)
    : [];
  const savedDraftProduct = latestActiveDraft ? state.products.find((item) => item.id === latestActiveDraft.productId) : undefined;
  const savedDraftTagIssues = latestActiveDraft
    ? collectDraftTagIssues(latestActiveDraft.tags, savedDraftProduct?.blockedClaims)
    : [];
  const savedDraftPackageIssues = latestActiveDraft
    ? collectDraftPackageIssues(latestActiveDraft.sourcePacket, savedDraftProduct?.blockedClaims)
    : [];
  const savedDraftBlockingIssue = savedDraftApprovalGaps[0] || savedDraftTagIssues[0] || savedDraftPackageIssues[0];
  const savedDraftReadyForApproval = Boolean(latestActiveDraft)
    && savedDraftApprovalGaps.length === 0
    && savedDraftTagIssues.length === 0
    && savedDraftPackageIssues.length === 0;
  const approvedActiveDraft = activeDraftState.approvedDraft && savedDraftReadyForApproval
    ? activeDraftState.approvedDraft
    : undefined;
  const hasApprovedDraft = Boolean(approvedActiveDraft);
  const activeDesignContent = deriveActiveDesignContent(
    state,
    activeDesign?.id,
    { designId: DEFAULT_ACTIVE_DESIGN_ID, sourcePacket: DESIGN04_DRAFT_PACKAGE },
    { designId: listingStudio.designId, sourcePacket: listingStudio.packageText },
  );
  const primaryDashboard = buildPrimaryDashboardSummary({
    designName: activeDesign?.name,
    researchCount: activeResearch.length,
    primaryKeyword: activeLoop?.stage === "conclusion-ready" ? activeLoop.primaryKeyword : undefined,
    supportingKeywordCount: activeLoop?.supportingKeywords?.length ?? 0,
    hasDraft,
    hasApprovedDraft,
    draftTitle: activeDesignContent.draftTitle,
    draftReadyForApproval: savedDraftReadyForApproval,
  });
  const socialListing = state.listings.find((item) => item.id === post.listingId);
  const workingDesign = activeDesign;
  const selectedProduct = state.products.find((item) => item.id === listingStudio.productId)
    ?? state.products.find((item) => item.id === design.productId)
    ?? (upload.targetType === "product" ? state.products.find((item) => item.id === upload.targetId) : undefined)
    ?? (workingDesign ? state.products.find((item) => item.id === workingDesign.productId) : undefined);
  const workingDesignSeeds = activeSeeds;
  const workingProductId = operationsTab === "library" ? selectedProduct?.id : workingDesign?.productId;
  const workingItemState = deriveWorkingItemState(state, workingDesign?.id, workingProductId, workingDesignSeeds);
  const currentStage = workingItemState.currentStage;
  const contextArtifacts = operationsTab === "analysis"
    ? state.artifacts.filter((item) => selectedListingId && (item.targetId === selectedListingId || item.targetType === "shop") && (!auditPeriod.start || item.periodStart === auditPeriod.start) && (!auditPeriod.end || item.periodEnd === auditPeriod.end))
    : operationsTab === "social"
      ? state.artifacts.filter((item) => item.kind === "social-results" && item.targetId === post.listingId)
      : operationsTab === "library"
        ? state.artifacts.filter((item) => item.targetId === selectedProduct?.id)
        : state.artifacts.filter((item) => item.targetId === workingDesign?.id || item.targetId === workingDesign?.productId);
  const contextOcrStatus = contextArtifacts.some((item) => item.mimeType.startsWith("image/") && item.ocrStatus === "unreadable")
    ? "unreadable" as const
    : contextArtifacts.some((item) => item.mimeType.startsWith("image/") && item.ocrStatus === "pending")
      ? "pending" as const
      : "none" as const;
  const workingContext = buildWorkingContext({
    tab: operationsTab,
    currentStage,
    designName: workingDesign?.name,
    selectedListingTitle: selectedListing?.title,
    selectedListingProtected: selectedListing?.protected,
    selectedProductName: selectedProduct?.name,
    socialListingTitle: socialListing?.title,
    briefGapCount: workingItemState.briefGapCount,
    researchCount: workingItemState.researchCount,
    hasKeywordDecision: workingItemState.hasKeywordDecision,
    hasDraft: workingItemState.hasDraft,
    hasApprovedDraft: workingItemState.hasApprovedDraft,
    auditGapCount: auditGaps.length,
    metricStatus: summarizeMetricStatus(contextArtifacts.filter((item) => item.ownerConfirmed)),
    ocrReviewStatus: contextOcrStatus,
    ownerConfirmationNeeded: contextArtifacts.some((item) => !item.ownerConfirmed),
    productEvidenceGapCount: workingItemState.productEvidenceGapCount,
  });
  const implementationLanes: Array<{
    scene: string;
    tab: OperationsTab;
    label: string;
    status: "ready" | "gated" | "draft" | "phase-2";
    statusLabel: string;
    detail: string;
    action: string;
  }> = [
    {
      scene: "01 · Mission",
      tab: "today",
      label: "今日下一步",
      status: "ready",
      statusLabel: "可直接使用",
      detail: "Working Context、current stage 同一個 next action 已經接通。",
      action: "查看今日下一步",
    },
    {
      scene: "02 · Evidence",
      tab: "research",
      label: "Research 資料",
      status: activeResearch.length ? "draft" : "gated",
      statusLabel: activeResearch.length ? "已有輸入" : "等證據解鎖",
      detail: activeResearch.length ? `已有 ${activeResearch.length} 份 confirmed research evidence；仍要由 owner 核對來源。` : "Evidence intake、OCR、確認流程已做；而家仍缺可作決策嘅 dated first-party evidence。",
      action: "進入 Research 資料",
    },
    {
      scene: "03 · Decide",
      tab: "analysis",
      label: "分析與決定",
      status: hasKeywordDecision ? "ready" : "gated",
      statusLabel: hasKeywordDecision ? "方向已就緒" : "Evidence-gated",
      detail: hasKeywordDecision ? "Primary、supporting 同 avoid keyword 已可作 draft wording。" : `Decision control 已接通，但仍有 ${decisionControl.blockers.length} 個 blocker，未應該作 live 結論。`,
      action: "查看分析狀態",
    },
    {
      scene: "04 · Draft",
      tab: "results",
      label: "Listing Brief",
      status: hasDraft ? "draft" : hasKeywordDecision ? "ready" : "gated",
      statusLabel: hasDraft ? "已有 local draft" : hasKeywordDecision ? "可以起 draft" : "等待 decision",
      detail: hasDraft ? "Draft register、tag checker 同 manual-entry review 已可用。" : "Listing Brief、product truth 同 tag checks 已做，但要等 evidence-backed direction。",
      action: "開啟 Listing Brief",
    },
    {
      scene: "05 · Approve",
      tab: "results",
      label: "Owner Gate",
      status: hasApprovedDraft ? "ready" : "draft",
      statusLabel: hasApprovedDraft ? "已批准手動輸入" : "Owner review required",
      detail: hasApprovedDraft ? "批准只代表 local manual entry，唔代表已經發佈 Etsy。" : "Owner approval、copy draft 同 manual Etsy entry boundary 已做；仍然由 owner 最後判斷。",
      action: "查看 Owner Gate",
    },
    {
      scene: "Phase 2",
      tab: "social",
      label: "Social tracking",
      status: "phase-2",
      statusLabel: "延後處理",
      detail: "Tracker 已有，但 attribution 未確認；唔放入明日核心 presentation flow。",
      action: "查看 Social tracking",
    },
  ];

  return <section id="etsy-operations-hub" className="scroll-mt-4 space-y-5" aria-label="Etsy Operations Hub">
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-3 shadow-card sm:flex-row sm:items-center sm:justify-between" aria-label="Dashboard view mode">
      <div className="px-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-copper">MyGiftStyle · Etsy Decision OS</p>
        <p className="mt-1 text-xs text-muted">{presentationOnly ? "明日簡報版 · 五幕故事：由證據走到店主批准。" : "由一個下一步開始日常店舖工作；需要簡報時再切換到五幕故事。"}</p>
      </div>
      {!presentationOnly && <div className="grid grid-cols-2 rounded-xl border border-line bg-[#F8F1EA] p-1" role="group" aria-label="選擇 Dashboard 顯示模式">
        <button type="button" aria-pressed={workspaceMode === "prototype"} onClick={() => setWorkspaceMode("prototype")} className={`min-h-11 rounded-lg px-4 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${workspaceMode === "prototype" ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}>工作區</button>
        <button type="button" aria-pressed={workspaceMode === "presentation"} onClick={() => setWorkspaceMode("presentation")} className={`min-h-11 rounded-lg px-4 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${workspaceMode === "presentation" ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}>五幕簡報</button>
      </div>}
    </div>

    {workspaceMode === "presentation" ? <EtsyPresentationMode
      evidenceCount={state.artifacts.length}
      confirmedEvidenceCount={eligibleArtifacts.length}
      blockerCount={decisionControl.blockers.length}
      decisionReady={decisionControl.status !== "blocked"}
      hasKeywordDecision={hasKeywordDecision}
      hasDraft={hasDraft}
      ownerApproved={hasApprovedDraft}
    /> : <>
    <details className="overflow-hidden rounded-[22px] border border-copper/25 bg-[#FFF9F3] shadow-card" aria-label="Implementation map">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:px-5">
        <span className="flex items-center gap-2 text-copper"><Workflow size={18} aria-hidden="true" /><span className="text-xs font-bold uppercase tracking-[0.16em]">Implementation map</span></span>
        <span className="text-xs font-bold text-ink">查看 6 個 lane 狀態 <span aria-hidden="true">↓</span></span>
      </summary>
      <div className="border-t border-copper/15 p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="mt-2 font-display text-2xl font-bold text-ink">五幕 story 對應六個可持續開發嘅 lanes</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">呢張 map 將「概念已講清楚」同「功能已 ready」分開；每格都可以直接跳去對應 workspace。</p>
        </div>
        <span className="shrink-0 rounded-full border border-copper/20 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-copper">Presentation → product</span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {implementationLanes.map((lane) => (
          <button key={`${lane.scene}-${lane.label}`} type="button" onClick={() => setOperationsTab(lane.tab)} className="group min-w-0 rounded-2xl border border-line bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-copper/35 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{lane.scene}</p><h3 className="mt-1 text-sm font-bold text-ink">{lane.label}</h3></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${implementationTone(lane.status)}`}>{lane.statusLabel}</span></div>
            <p className="mt-3 min-h-10 text-xs leading-5 text-muted">{lane.detail}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-ink group-hover:text-brand">{lane.action}<span aria-hidden="true">→</span></span>
          </button>
        ))}
      </div>
      </div>
    </details>
    <section aria-label="目前設計分析與行動" aria-live="polite" className="rounded-[26px] border border-line bg-panel p-4 shadow-card sm:p-5">
      <div className="mb-4 flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-copper">Analysis → decision → action</p>
          <h2 className="mt-1 font-display text-xl font-bold text-ink sm:text-2xl">由分析直接去到行動</h2>
        </div>
        <label className="w-full text-xs font-semibold text-ink sm:max-w-sm">
          Working Design · 目前設計
          <select value={activeDesign?.id ?? ""} onChange={(event) => chooseActiveDesign(event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-[#FBF7F2] px-3 py-2.5 text-sm font-normal text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            {state.designs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </div>
      {primaryDashboard.hasAnalysis ? <ol className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="目前設計到執行動作">
        <li className="min-w-0 rounded-2xl border border-line bg-[#FBF7F2] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-copper">01 · 目前設計</p><p className="mt-2 break-words text-sm font-bold leading-5 text-ink">{activeDesign?.name}</p><p className="mt-2 text-xs leading-5 text-muted">{activeDesign ? `${activeDesign.recipient || "未指定對象"} · ${activeDesign.occasion || "未指定場合"}` : ""}</p></li>
        <li className="min-w-0 rounded-2xl border border-line bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sage">02 · 分析重點</p><p className="mt-2 text-sm font-semibold leading-6 text-ink">{primaryDashboard.analysisFocus}</p></li>
        <li className="min-w-0 rounded-2xl border border-copper/25 bg-[#FFF9F3] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-copper">03 · 建議決定</p><p className="mt-2 text-sm font-bold leading-6 text-ink">{primaryDashboard.proposedDecision}</p></li>
        <li className="min-w-0 rounded-2xl border border-sage/25 bg-[#F3F8F4] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sage">04 · 執行動作</p><p className="mt-2 text-sm font-bold leading-5 text-ink">{primaryDashboard.actionLabel}</p><p className="mt-1 text-xs leading-5 text-muted">{primaryDashboard.actionDetail}</p>{primaryDashboard.actionTab && <button type="button" aria-label={`${primaryDashboard.actionLabel}：${activeDesign?.name ?? "目前設計"}`} onClick={() => { if (primaryDashboard.actionTab === "results" && hasKeywordDecision && !hasDraft) openActiveListingBrief(); else setOperationsTab(primaryDashboard.actionTab!); }} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white hover:bg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">{primaryDashboard.actionLabel}<span className="ml-1" aria-hidden="true">→</span></button>}</li>
      </ol> : <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="min-w-0 rounded-2xl border border-line bg-[#FBF7F2] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-copper">目前設計</p><p className="mt-2 break-words text-sm font-bold leading-5 text-ink">{activeDesign?.name ?? "未選擇設計"}</p></div>
        <p className="flex min-h-20 items-center rounded-2xl border border-line bg-white px-4 py-3 text-sm text-muted" role="status">{primaryDashboard.emptyMessage}</p>
      </div>}
      <details className="mt-4 rounded-2xl border border-line bg-[#FBF7F2]">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-xs font-bold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">
          資料與安全檢查（需要時先睇）
          <span className="text-muted" aria-hidden="true">↓</span>
        </summary>
        <div className="border-t border-line p-3">
          <div className="mb-3 grid gap-2 text-xs sm:grid-cols-2"><p className="rounded-xl bg-white px-3 py-2 text-muted"><span className="font-bold text-ink">內部階段：</span>{workingContext.stage}</p><p className="rounded-xl bg-white px-3 py-2 text-muted"><span className="font-bold text-ink">安全狀態：</span>{workingContext.status}</p></div>
          {activeBriefGaps.length > 0 && <details className="mb-3 rounded-xl border border-copper/20 bg-white"><summary className="cursor-pointer px-3 py-2 text-xs font-bold text-ink">查看資料缺口（{activeBriefGaps.length}）</summary><ul className="border-t border-line px-7 py-3 text-xs leading-5 text-muted">{activeBriefGaps.map((gap) => <li key={gap} className="list-disc">{gap}</li>)}</ul></details>}
          <DecisionControlSummary control={decisionControl} compact />
        </div>
      </details>
    </section>
    {operationsTab === "results" && <section className="rounded-[26px] border border-copper/25 bg-[#FFF9F3] p-5 shadow-card sm:p-6" aria-label="Listing Brief workspace status"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-copper">{activeDesign?.name ?? "Choose a design"} · Listing Brief</p><h3 className="mt-1 font-display text-2xl font-bold text-ink">{hasApprovedDraft ? "Approved for manual Etsy entry" : hasDraft ? "Saved draft ready for review" : hasKeywordDecision ? "Ready to create the draft" : "Waiting for a keyword decision"}</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{hasApprovedDraft ? "The current draft is the exact package approved for manual entry. Nothing has been published or connected." : hasDraft ? savedDraftReadyForApproval ? "Your current draft has the required product, research, tag, and blocked-claim checks. Review it, then approve only when you are satisfied." : `This saved draft still needs: ${savedDraftBlockingIssue}.` : hasKeywordDecision ? "The keyword decision is ready. Load the complete draft package below; no extra keyword typing is needed." : "Go to 分析與決定 first. The dashboard will show whether it needs deeper research or can create the Listing Brief."}</p></div><div className="flex shrink-0 flex-wrap gap-2">{hasApprovedDraft && approvedActiveDraft && <button type="button" onClick={() => void copy(approvedActiveDraft.sourcePacket, "Approved Listing Brief copied. You can keep it for later manual Etsy entry.")} className="rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white hover:bg-brand">Copy approved draft</button>}{!hasDraft && hasKeywordDecision && <button type="button" onClick={openActiveListingBrief} className="rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white hover:bg-brand">Load Listing Brief</button>}{hasDraft && !hasApprovedDraft && savedDraftReadyForApproval && latestActiveDraft && <button type="button" onClick={() => void approveListingDraft(latestActiveDraft.id)} className="rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white hover:bg-brand">Approve for manual entry</button>}{!hasKeywordDecision && !hasDraft && <button type="button" onClick={() => setOperationsTab("analysis")} className="rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white hover:bg-brand">Open analysis</button>}</div></div></section>}
    {hasDraft && <section className={`rounded-[26px] border p-5 shadow-card ${hasApprovedDraft ? "border-sage/25 bg-[#E8F0E6]" : savedDraftReadyForApproval ? "border-sage/25 bg-[#F3F8F4]" : "border-copper/25 bg-[#F9EEE4]"}`} aria-label="Active design manual entry status"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-sage">{activeDesign?.name ?? "Active design"} · manual entry status</p><h3 className="mt-1 text-xl font-bold text-ink">{hasApprovedDraft ? "已批准作手動輸入 Etsy" : savedDraftReadyForApproval ? "已準備好，等你批准" : "未可批准"}</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{hasApprovedDraft ? "目前顯示同複製嘅正是已批准草稿；此 dashboard 從未發佈、修改或連接 Etsy。" : savedDraftReadyForApproval ? "毋須再提供資料。你只需檢查目前草稿，然後按一次批准。" : `而家只需要處理：${savedDraftBlockingIssue}。`}</p></div><div className="flex shrink-0 flex-wrap gap-2">{hasApprovedDraft && approvedActiveDraft && <button type="button" onClick={() => void copy(approvedActiveDraft.sourcePacket, "Approved Listing Brief copied. You can keep it for later manual Etsy entry.")} className="rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white hover:bg-brand">Copy approved Listing Brief</button>}{!hasApprovedDraft && savedDraftReadyForApproval && latestActiveDraft && <button type="button" onClick={() => void approveListingDraft(latestActiveDraft.id)} className="rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white hover:bg-brand">Approve for manual Etsy entry</button>}{!hasApprovedDraft && !savedDraftReadyForApproval && <button type="button" onClick={() => setOperationsTab("results")} className="rounded-xl border border-line bg-white px-4 py-2.5 text-xs font-bold text-ink hover:bg-[#F8EDE4]">查看需要處理項目</button>}</div></div><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{[["產品、Design、research evidence", savedDraftApprovalGaps.length === 0], ["13 個有效 tags", savedDraftTagIssues.length === 0], ["Customer-facing blocked claims", savedDraftPackageIssues.length === 0], ["Owner approval", hasApprovedDraft]].map(([label, complete]) => <div key={label as string} className="rounded-xl border border-white bg-white/80 px-3 py-2 text-xs"><span className={`mr-1 font-bold ${complete ? "text-sage" : "text-copper"}`}>{complete ? "✓" : "•"}</span><span className="font-semibold text-ink">{label}</span><span className="ml-1 text-muted">{complete ? "完成" : "未完成"}</span></div>)}</div></section>}
    {toast && <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-50 flex max-w-[min(26rem,calc(100vw-2rem))] items-start gap-3 rounded-2xl border border-[#B9D7C0] bg-white p-4 shadow-xl"><CheckCircle2 size={20} className="mt-0.5 shrink-0 text-sage" aria-hidden="true" /><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-sage">Dashboard received it</p><p className="mt-1 text-sm font-semibold text-ink">{toast}</p></div><button type="button" onClick={() => setToast(null)} aria-label="Close confirmation" className="ml-1 rounded-md p-1 text-muted hover:bg-[#F8EDE4] hover:text-ink"><X size={16} /></button></div>}
    <nav className="grid grid-cols-3 gap-2 rounded-2xl border border-line bg-panel p-2 shadow-card sm:flex sm:flex-wrap" aria-label="Etsy workflow sections">{([ ["today", "今日下一步"], ["research", "Research 資料"], ["analysis", "分析與決定"], ["results", "Listing Brief"], ["library", "產品與資料"], ["social", "Social tracking"] ] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setOperationsTab(id)} aria-current={operationsTab === id ? "page" : undefined} className={`flex min-h-11 items-center justify-center rounded-xl px-2 py-2 text-center text-xs font-bold sm:px-4 sm:py-2.5 sm:text-sm ${operationsTab === id ? "bg-ink text-white" : "text-muted hover:bg-[#F8EDE4] hover:text-ink"}`}>{label}</button>)}</nav>
    {operationsTab === "analysis" && (
      <section className="rounded-[26px] border border-sage/25 bg-[#F3F8F4] p-5 shadow-card sm:p-6" aria-label="Codex keyword analysis status">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-sage">Codex analysis status</p>
            <h3 className="mt-1 font-display text-2xl font-bold text-ink">{hasKeywordDecision ? "Keyword decision is ready" : activeResearch.length ? "Research evidence received" : "Waiting for research input"}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{hasKeywordDecision ? "以下係 draft-only keyword decision；唔代表 Etsy demand、sales 或 conversion 保證。" : activeResearch.length ? "Codex 會先核對 evidence quality，再決定是否需要第二輪 research 或可得出 keyword conclusion。" : "你只需到 Research 資料 upload CSV／Excel，或者貼上 eRank／EverBee cap 圖。"}</p>
          </div>
          <button type="button" onClick={() => { if (hasKeywordDecision && !hasDraft) openActiveListingBrief(); else setOperationsTab(hasKeywordDecision ? "results" : "research"); }} className="shrink-0 rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white hover:bg-brand">{hasKeywordDecision ? hasDraft ? "查看 Listing Brief" : "開啟 Listing Brief" : "前往 Research 資料"}</button>
        </div>
        {hasKeywordDecision ? (
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-[#D9E7DE] bg-white p-4"><p className="text-xs font-bold text-sage">Primary</p><p className="mt-1 text-base font-bold text-ink">{activeLoop?.primaryKeyword}</p></div>
            <div className="rounded-2xl border border-[#D9E7DE] bg-white p-4"><p className="text-xs font-bold text-ink">Supporting</p><p className="mt-1 text-sm leading-5 text-muted">{activeLoop?.supportingKeywords?.join(", ") || "none recorded"}</p></div>
            <div className="rounded-2xl border border-[#F1D8C6] bg-white p-4"><p className="text-xs font-bold text-brand">Avoid / weak fit</p><p className="mt-1 text-sm leading-5 text-muted">{activeLoop?.avoidKeywords?.join(", ") || "none recorded"}</p></div>
            <p className="md:col-span-3 text-xs leading-5 text-muted">Confidence: low for SEO demand where screenshot OCR is partially ambiguous. Use this decision for draft wording only, not a performance claim.</p>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-[#D9E7DE] bg-white p-4 text-sm"><span className="font-bold text-ink">Evidence now: </span><span className="text-muted">{activeResearch.length} confirmed research file(s). {activeResearch.length ? "No manual keyword rows are needed." : "No research file has been confirmed yet."}</span></div>
        )}
      </section>
    )}
    <header className="rounded-[26px] border border-brand/25 bg-panel p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex items-center gap-2 text-brand"><LibraryBig size={18} /><span className="text-xs font-semibold uppercase tracking-[0.16em]">Etsy Operations Hub</span></div><h2 className="mt-2 font-display text-3xl font-bold text-ink">Evidence, product and launch decisions in one place</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Upload-only, private and owner-controlled. Etsy and social accounts are never connected; this dashboard prepares evidence packets and drafts for Codex.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => downloadJson(`mygiftstyle-etsy-backup-${new Date().toISOString().slice(0, 10)}.json`, state)} className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs font-bold text-ink hover:bg-[#F8EDE4]"><FileDown size={14} />Export backup</button><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs font-bold text-ink hover:bg-[#F8EDE4]"><ArchiveRestore size={14} />Import backup<input className="sr-only" type="file" accept="application/json,.json" onChange={importBackup} /></label></div></div>
      <div role="status" className="mt-4 rounded-xl border border-sage/25 bg-[#E8F0E6] px-4 py-3 text-xs font-semibold text-sage">{notice}</div>
    </header>

    <div hidden={operationsTab !== "results"} className="rounded-[26px] border border-sage/25 bg-[#F3F8F4] p-5 shadow-card" aria-label="Codex analysis and listing brief result">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#D9E7DE] bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sage">Codex analysis result</p>
          <h3 className="mt-1 text-xl font-bold text-ink">Keyword decision · draft-only</h3>
          {hasKeywordDecision ? <><p className="mt-3 text-xs font-bold text-sage">Primary</p><p className="mt-1 text-base font-bold text-ink">{activeLoop?.primaryKeyword}</p><p className="mt-3 text-xs font-bold text-ink">Supporting</p><p className="mt-1 text-sm text-muted">{activeLoop?.supportingKeywords?.join(", ") || "none recorded"}</p><p className="mt-3 text-xs font-bold text-brand">Avoid / weak fit</p><p className="mt-1 text-sm text-muted">{activeLoop?.avoidKeywords?.join(", ") || "none recorded"}</p><p className="mt-3 text-xs leading-5 text-muted">Confidence: low for SEO demand because screenshot metrics are partially OCR-ambiguous. The recommendation is safe for a draft, not a performance promise.</p></> : <p className="mt-3 text-sm text-muted">Codex has not reached a keyword conclusion yet. Open Research input to add CSV/XLSX or paste a screenshot.</p>}
        </div>
        <div className="rounded-2xl border border-copper/25 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-copper">Listing Brief draft review</p>
          <h3 className="mt-1 text-xl font-bold text-ink">{activeDesignContent.designName}</h3>
          <p className="mt-2 text-sm text-muted">A complete draft has title, checked tags, description, FAQ accuracy notes and social copy. It remains local until you choose to save it.</p>
          <div className="mt-3 rounded-xl bg-[#FBF7F2] p-3 text-xs leading-5 text-muted"><span className="font-bold text-ink">Draft title: </span>{activeDesignContent.draftTitle ?? "No draft title saved for this active design yet."}</div>
          <button type="button" onClick={openActiveListingBrief} className="mt-4 rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white hover:bg-brand">Load active Listing Brief for review</button>
          <p className="mt-2 text-xs text-muted">No Etsy account is connected. The next visible action after review is “Save local Codex draft”.</p>
        </div>
      </div>
    </div>

    <section hidden={operationsTab !== "today"} style={{ display: operationsTab === "today" ? undefined : "none" }} aria-label="Secondary analysis details">
      <details className="rounded-[26px] border border-line bg-[#FBF7F2] shadow-card">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-bold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:px-5">進階分析、資料來源與安全邊界<span className="text-muted" aria-hidden="true">↓</span></summary>
        <div className="border-t border-line p-4 sm:p-5">
          <SellerDecisionCard
        decision={sellerDecision}
        listings={state.listings}
        selectedListingId={selectedListingId}
        onSelectListing={setSelectedListingId}
        onOpenAnalysis={() => setOperationsTab("analysis")}
        onOpenResearch={() => setOperationsTab("research")}
        onCopy={() => void copy(sellerDecisionPacket(), "Seller decision brief copied. It remains local and draft-only.")}
        control={decisionControl}
      />
          <aside className="mt-4 rounded-2xl border border-line bg-white p-4" aria-label="Dashboard V1 boundary and acceptance">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink">V1 boundary · what can be accepted today</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2"><div><p className="text-xs font-bold text-sage">In this V1</p><ul className="mt-1 space-y-1 text-xs leading-5 text-muted"><li>• One next action routes to the exact tab.</li><li>• CSV/XLSX or pasted/uploaded screenshot is saved locally, confirmed, and recoverable.</li><li>• Codex outputs a visible deeper-research request or draft-only decision.</li><li>• A saved draft can only be copied or approved for manual Etsy entry.</li></ul></div><div><p className="text-xs font-bold text-copper">Intentionally not in V1</p><ul className="mt-1 space-y-1 text-xs leading-5 text-muted"><li>• No Etsy, eRank, EverBee, or social-account login or sync.</li><li>• No automatic publishing, editing, pricing, or attribution claim.</li><li>• Screenshot visual review is allowed; calculated metrics still require a structured export.</li></ul></div></div>
          </aside>
        </div>
      </details>
    </section>

    <div hidden={operationsTab !== "research"}>
      <EvidenceIntakeStepper
        state={state}
        selectedListingId={selectedListingId}
        period={auditPeriod}
        upload={upload}
        reviewArtifact={reviewArtifact}
        onSelectListing={setSelectedListingId}
        onPeriodChange={setAuditPeriod}
        onPrepareStep={prepareEvidenceStep}
        onUploadChange={updateUpload}
        onSaveUpload={() => void saveUpload()}
        onReviewArtifact={openArtifactReview}
        onRunOcr={(artifact) => void runOcr(artifact)}
        onConfirmArtifact={(id) => void confirmReviewedArtifact(id)}
        onCloseReview={() => setReviewArtifactId(null)}
        onRemoveArtifact={(id) => void removeArtifact(id)}
      />
    </div>
    {false && <section hidden={operationsTab !== "research"} style={{ display: operationsTab === "research" ? undefined : "none" }} className="rounded-[26px] border border-line bg-panel p-5 shadow-card sm:p-6" aria-label="Research evidence inbox">
      <div className="flex items-center gap-2 text-brand"><Upload size={18} /><span className="text-xs font-semibold uppercase tracking-[0.16em]">Evidence Inbox</span></div><h3 className="mt-2 font-display text-2xl font-bold text-ink">Save dated source evidence before asking Codex for a decision</h3>
      <div className="mt-5 rounded-2xl border border-[#D9E7DE] bg-[#F3F8F4] p-4" aria-label="Journal listing fast lane"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-sage">Journal listing fast lane</p><p className="mt-1 text-sm font-semibold text-ink">Complete only the next missing input; no manual product-data retyping.</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-ink">{journalEvidenceGaps.length} evidence item{journalEvidenceGaps.length === 1 ? "" : "s"} remaining</span></div><div className="mt-4 grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-[#D9E7DE] bg-white p-3"><p className="text-xs font-bold text-ink">1. Product facts</p><p className="mt-1 text-xs text-muted">Use a product-page/specification screenshot when available. Your earlier confirmed baseline can also be recorded as a removable owner attestation.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => prepareJournalEvidence("product-facts")} className="rounded-lg border border-line px-3 py-2 text-xs font-bold text-ink hover:bg-[#F8EDE4]">Prepare product facts</button><button type="button" onClick={() => void attestJournalBaseline()} className="rounded-lg bg-[#E8F0E6] px-3 py-2 text-xs font-bold text-sage hover:bg-[#D9E7DE]">Record owner baseline</button></div></div><div className="rounded-xl border border-[#D9E7DE] bg-white p-3"><p className="text-xs font-bold text-ink">2. Cost &amp; fulfilment</p><p className="mt-1 text-xs text-muted">Paste a dated Google Sheet or supplier link, or add a cost export. No screenshot is needed for a stable official page.</p><button type="button" onClick={() => prepareJournalEvidence("cost-fulfilment")} className="mt-3 rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white hover:bg-brand">Prepare cost source</button></div><div className="rounded-xl border border-[#D9E7DE] bg-white p-3"><p className="text-xs font-bold text-ink">3. Keyword research</p><p className="mt-1 text-xs text-muted">Paste screenshot or upload eRank/EverBee CSV. The dashboard runs OCR after your confirmation.</p><button type="button" onClick={() => setOperationsTab("research")} className="mt-3 rounded-lg border border-line px-3 py-2 text-xs font-bold text-ink hover:bg-[#F8EDE4]">Open keyword research</button></div></div></div>
      <div className="mt-5 grid gap-3 lg:grid-cols-3"><label className="text-xs font-semibold text-ink">Evidence type<select value={upload.kind} onChange={(event) => updateUpload("kind", event.target.value as EvidenceKind)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal"><option value="shop-stats">Shop Stats overview</option>{KINDS.filter((item) => item.id !== "shop-stats").map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="text-xs font-semibold text-ink">Source<select value={upload.source} onChange={(event) => updateUpload("source", event.target.value as EvidenceSource)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal">{SOURCES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="text-xs font-semibold text-ink">Linked target<select value={`${upload.targetType}:${upload.targetId}`} onChange={(event) => { const [targetType, targetId] = event.target.value.split(":"); setUpload((current) => ({ ...current, targetType: targetType as UploadDraft["targetType"], targetId })); }} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal"><option value="shop:shop">Entire shop</option>{renderedState.listings.map((item) => <option key={item.id} value={`listing:${item.id}`}>{item.title} ({item.id})</option>)}{renderedState.products.map((item) => <option key={item.id} value={`product:${item.id}`}>Product: {item.name}</option>)}</select></label><label className="text-xs font-semibold text-ink">Coverage start<input type="date" value={upload.periodStart} onChange={(event) => updateUpload("periodStart", event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" /></label><label className="text-xs font-semibold text-ink">Coverage end<input type="date" value={upload.periodEnd} onChange={(event) => updateUpload("periodEnd", event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" /></label><label className="flex cursor-pointer items-end"><span className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-3 py-2.5 text-xs font-bold text-white hover:bg-brand"><FileUp size={15} />{upload.file?.name || "Choose PNG, JPG, CSV or XLSX"}<input className="sr-only" type="file" accept=".csv,.tsv,.xlsx,.xls,image/png,image/jpeg" onChange={(event) => updateUpload("file", event.target.files?.[0] ?? null)} /></span></label><label className="text-xs font-semibold text-ink lg:col-span-3">Source link <span className="font-normal text-muted">(optional alternative to a file; use for a dated supplier or official page)</span><input type="url" inputMode="url" placeholder="https://…" value={upload.sourceUrl} onChange={(event) => updateUpload("sourceUrl", event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" aria-describedby="source-link-help" /><span id="source-link-help" className="mt-1 block font-normal text-muted">A link is a reference record only. Confirm it after checking the displayed source; add a CSV or screenshot when values need OCR or parsing.</span></label></div>
      <button type="button" onClick={() => void saveUpload()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white hover:bg-[#D94F0D]"><Upload size={15} />{upload.file ? "Save local evidence" : upload.sourceUrl.trim() ? "Save source link" : "Save local evidence"}</button>
      <div className="mt-5 overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[780px] text-left text-xs">
          <thead className="bg-[#F8F3ED] text-muted"><tr><th className="px-4 py-3">Evidence</th><th className="px-4 py-3">Scope / period</th><th className="px-4 py-3">Authority</th><th className="px-4 py-3">Data state</th><th className="px-4 py-3">Action</th></tr></thead>
          <tbody>{renderedState.artifacts.length === 0
            ? <tr><td colSpan={5} className="px-4 py-5 text-muted">No evidence stored yet. Start with a dated Etsy Shop Stats export.</td></tr>
            : renderedState.artifacts.map((artifact) => <tr key={artifact.id} className="border-t border-line align-top">
              <td className="px-4 py-3"><div className="font-semibold text-ink">{artifact.fileName}</div><div className="mt-1 text-muted">{KINDS.find((item) => item.id === artifact.kind)?.label}</div></td>
              <td className="px-4 py-3 text-muted">{artifact.targetId}<br />{artifact.periodStart || "no start"} → {artifact.periodEnd || "no end"}</td>
              <td className="px-4 py-3"><span className="rounded-full border border-line bg-white px-2 py-1 font-bold uppercase tracking-wide text-[10px]">{artifact.authority}</span><div className="mt-2 text-muted">{artifact.source}</div></td>
              <td className="px-4 py-3">{artifact.metrics.slice(0, 3).map((metric) => <div key={metric.label} className={metricClass(metric.status)}>{metric.label}: {metric.value ?? metric.status}</div>)}<div className="mt-1 text-muted">{evidenceStateLabel(artifact)}</div></td>
              <td className="px-4 py-3"><div className="flex flex-wrap gap-2">
                {shouldRunOcrBeforeConfirm(artifact) && <button type="button" onClick={() => void runOcr(artifact)} className="rounded-lg border border-line px-2 py-1 font-semibold text-ink">Run OCR</button>}
                {!artifact.ownerConfirmed && <button type="button" onClick={() => void confirmArtifact(artifact.id)} className="rounded-lg bg-[#E8F0E6] px-2 py-1 font-semibold text-sage">{evidenceConfirmLabel(artifact)}</button>}
                <button type="button" onClick={() => void removeArtifact(artifact.id)} aria-label={`Remove ${artifact.fileName}`} className="rounded-lg px-1 text-muted hover:text-brand"><X size={15} /></button>
              </div></td>
            </tr>)}</tbody>
         </table>
       </div>
    </section>}

    <section hidden={operationsTab !== "analysis"} style={{ display: operationsTab === "analysis" ? undefined : "none" }} className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]" aria-label="Listing analysis evidence gate">
      <article className="rounded-[26px] border border-brand/25 bg-panel p-5 shadow-card sm:p-6"><div className="flex items-center gap-2 text-brand"><ShieldCheck size={18} /><span className="text-xs font-semibold uppercase tracking-[0.16em]">Listing Audit</span></div><h3 className="mt-2 font-display text-2xl font-bold text-ink">First-party evidence gate</h3><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold text-ink">Listing<select value={selectedListingId} onChange={(event) => setSelectedListingId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal"><option value="">Select listing</option>{state.listings.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label className="text-xs font-semibold text-ink">Start<input type="date" value={auditPeriod.start} onChange={(event) => setAuditPeriod((current) => ({ ...current, start: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" /></label><label className="text-xs font-semibold text-ink">End<input type="date" value={auditPeriod.end} onChange={(event) => setAuditPeriod((current) => ({ ...current, end: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" /></label></div>{selectedListing?.protected && <div className="mt-4 rounded-xl border border-brand/25 bg-[#FFF1E8] p-3 text-xs font-semibold text-brand">Protected listing: dashboard can audit and draft only. Do not change Etsy until you explicitly reopen this observation.</div>}<div className={`mt-4 rounded-2xl border p-4 ${auditGaps.length ? "border-copper/25 bg-[#F9EEE4]" : "border-sage/25 bg-[#E8F0E6]"}`}><div className="font-semibold text-ink">{auditGaps.length ? `Still needed (${auditGaps.length})` : "Audit packet ready"}</div>{auditGaps.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">{auditGaps.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-2 text-xs text-sage">All required Etsy evidence is dated and owner-confirmed.</p>}</div><button type="button" onClick={() => void copy(auditPacket(), auditGaps.length ? "Missing-data request copied for Codex." : "Read-only audit packet copied for Codex.")} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white hover:bg-brand"><Clipboard size={15} />{auditGaps.length ? "Copy missing-data request" : "Copy Codex Audit Packet"}</button></article>
      <article className="rounded-[26px] border border-copper/25 bg-panel p-5 shadow-card sm:p-6"><div className="flex items-center gap-2 text-copper"><FileDown size={18} /><span className="text-xs font-semibold uppercase tracking-[0.16em]">Evidence health</span></div><h3 className="mt-2 font-display text-2xl font-bold text-ink">What the dashboard can safely use</h3><dl className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-line bg-[#FBF7F2] p-3"><dt className="text-xs text-muted">All artifacts</dt><dd className="mt-1 font-display text-2xl font-bold text-ink">{state.artifacts.length}</dd></div><div className="rounded-2xl border border-line bg-[#FBF7F2] p-3"><dt className="text-xs text-muted">Confirmed</dt><dd className="mt-1 font-display text-2xl font-bold text-ink">{eligibleArtifacts.length}</dd></div><div className="rounded-2xl border border-line bg-[#FBF7F2] p-3"><dt className="text-xs text-muted">Products</dt><dd className="mt-1 font-display text-2xl font-bold text-ink">{state.products.length}</dd></div><div className="rounded-2xl border border-line bg-[#FBF7F2] p-3"><dt className="text-xs text-muted">Designs</dt><dd className="mt-1 font-display text-2xl font-bold text-ink">{state.designs.length}</dd></div></dl><p className="mt-4 text-xs leading-5 text-muted">Primary = Etsy or a platform’s own export. eRank/EverBee are supplemental. Cross-platform attribution remains an inference unless a tracked source confirms it.</p></article>
    </section>

    <section hidden={operationsTab !== "library"} style={{ display: operationsTab === "library" ? undefined : "none" }} className="rounded-[26px] border border-line bg-panel p-5 shadow-card sm:p-6"><div className="flex items-center gap-2 text-brand"><LibraryBig size={18} /><span className="text-xs font-semibold uppercase tracking-[0.16em]">Product + Design Library</span></div><h3 className="mt-2 font-display text-2xl font-bold text-ink">Keep product truth attached to every design</h3><div className="mt-5 grid gap-5 xl:grid-cols-2"><div className="rounded-2xl border border-line bg-[#FBF7F2] p-4"><h4 className="font-bold text-ink">Add product</h4><div className="mt-3 grid gap-3 sm:grid-cols-2">{(["name", "type", "material", "size", "productionMethod", "fulfilmentSource", "costSource", "allowedClaims", "blockedClaims"] as const).map((key) => <label key={key} className="text-[11px] font-semibold capitalize text-muted">{key.replace(/([A-Z])/g, " $1")}<input value={product[key]} onChange={(event) => updateProduct(key, event.target.value)} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal text-ink" /></label>)}</div><button type="button" onClick={() => void addProduct()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-ink px-3 py-2 text-xs font-bold text-white hover:bg-brand"><Plus size={14} />Add product</button></div><div className="rounded-2xl border border-line bg-[#FBF7F2] p-4"><h4 className="font-bold text-ink">Add design</h4><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-[11px] font-semibold text-muted">Design name<input value={design.name} onChange={(event) => updateDesign("name", event.target.value)} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal text-ink" /></label><label className="text-[11px] font-semibold text-muted">Product<select value={design.productId} onChange={(event) => updateDesign("productId", event.target.value)} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal text-ink"><option value="">Select product</option>{state.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-[11px] font-semibold text-muted">Recipient<input value={design.recipient} onChange={(event) => updateDesign("recipient", event.target.value)} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal text-ink" /></label><label className="text-[11px] font-semibold text-muted">Occasion<input value={design.occasion} onChange={(event) => updateDesign("occasion", event.target.value)} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal text-ink" /></label><label className="text-[11px] font-semibold text-muted">Asset / preview name<input value={design.assetName} onChange={(event) => updateDesign("assetName", event.target.value)} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal text-ink" /></label><label className="text-[11px] font-semibold text-muted">Mockup status<select value={design.mockupStatus} onChange={(event) => updateDesign("mockupStatus", event.target.value as Design["mockupStatus"])} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal text-ink"><option value="missing">Missing</option><option value="ready">Ready</option></select></label></div><button type="button" onClick={() => void addDesign()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-ink px-3 py-2 text-xs font-bold text-white hover:bg-brand"><Image size={14} />Add design</button></div></div><div className="mt-5 grid gap-3 md:grid-cols-2">{state.products.map((item) => <article key={item.id} className="rounded-2xl border border-line bg-white p-4"><div className="font-bold text-ink">{item.name}</div><div className="mt-1 text-xs text-muted">{item.type} · {item.material || "material missing"} · {item.productionMethod || "production method missing"}</div><div className="mt-2 text-xs text-copper">Cost: {item.costSource || "missing"} · Fulfilment: {item.fulfilmentSource || "missing"}</div></article>)}{state.products.length === 0 && <p className="text-sm text-muted">No product cards yet. Add real product facts before starting a new listing.</p>}</div></section>

    <section hidden={operationsTab !== "results"} style={{ display: operationsTab === "results" ? undefined : "none" }} className="rounded-[26px] border border-copper/25 bg-panel p-5 shadow-card sm:p-6"><div className="flex items-center gap-2 text-copper"><Sparkles size={18} /><span className="text-xs font-semibold uppercase tracking-[0.16em]">New Listing Studio</span></div><h3 className="mt-2 font-display text-2xl font-bold text-ink">Build a research-ready brief, then ask Codex to draft</h3><div className="mt-5 grid gap-3 lg:grid-cols-2"><label className="text-xs font-semibold text-ink">Product<select value={listingStudio.productId} onChange={(event) => setListingStudio((current) => ({ ...current, productId: event.target.value, designId: "" }))} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal"><option value="">Select product</option>{state.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-xs font-semibold text-ink">Design<select value={listingStudio.designId} onChange={(event) => { setListingStudio((current) => ({ ...current, designId: event.target.value })); chooseActiveDesign(event.target.value); }} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal"><option value="">Select linked design</option>{state.designs.filter((item) => item.productId === listingStudio.productId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-xs font-semibold text-ink lg:col-span-2">Positioning / gift promise<textarea value={listingStudio.positioning} onChange={(event) => setListingStudio((current) => ({ ...current, positioning: event.target.value }))} className="mt-1.5 min-h-20 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" placeholder="Who is it for, what occasion, and why this product?" /></label><label className="text-xs font-semibold text-ink lg:col-span-2">5–15 seed keywords<textarea value={listingStudio.seeds} onChange={(event) => setListingStudio((current) => ({ ...current, seeds: event.target.value }))} className="mt-1.5 min-h-20 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" placeholder="Comma-separated seed keywords for eRank, EverBee or Etsy Marketplace Insights research" /></label></div><div className={`mt-4 rounded-2xl border p-4 ${studioGaps.length ? "border-copper/25 bg-[#F9EEE4]" : "border-sage/25 bg-[#E8F0E6]"}`}><div className="font-semibold text-ink">{studioGaps.length ? "Draft blocked until evidence is complete" : "Ready for a Codex draft package"}</div>{studioGaps.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">{studioGaps.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-2 text-xs text-sage">Copy the brief to Codex; its title, tags, description and social copy remain draft-only.</p>}</div><button type="button" onClick={() => void copy(listingPacket(), studioGaps.length ? "Blocked listing brief copied with its exact missing inputs." : "New listing brief copied for Codex draft generation.")} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white hover:bg-brand"><Clipboard size={15} />Copy Listing Brief</button></section>

    <aside hidden={operationsTab !== "results"} className="rounded-2xl border border-copper/25 bg-[#F9EEE4] p-4" aria-label="Historical tag reference"><div className="text-xs font-bold uppercase tracking-[0.12em] text-copper">Listing and tag reference</div><p className="mt-1 text-sm font-semibold text-ink">Every Listing Brief now carries the Etsy Sonnet historical keyword reference.</p><p className="mt-1 text-xs leading-5 text-muted">Use it to recognise relevant lanes and rejected terms, then let current dated research and product facts decide. Tags remain draft-only and must be 20 characters or fewer.</p></aside>
    <aside hidden={operationsTab !== "results"} className="rounded-2xl border border-line bg-panel p-4" aria-label="Draft tag checker"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-xs font-bold uppercase tracking-[0.12em] text-brand">Draft tag checker</div><p className="mt-1 text-sm font-semibold text-ink">Paste Codex’s draft tags once; the dashboard checks them before owner approval.</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${tagIssues.length ? "bg-[#FFF1E8] text-brand" : "bg-[#E8F0E6] text-sage"}`}>{tagIssues.length ? `${tagIssues.length} issue(s)` : draftTags.length ? "Ready to review" : "Paste tags"}</span></div><label className="mt-3 block text-xs font-semibold text-ink">Draft tags — one per line or comma-separated<textarea value={listingStudio.tags} onChange={(event) => setListingStudio((current) => ({ ...current, tags: event.target.value }))} className="mt-1.5 min-h-24 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" placeholder="Paste up to 13 draft tags from Codex" /></label><div className="mt-2 text-xs text-muted">{draftTags.length ? `${draftTags.length} tag(s) pasted` : "Optional until Codex has created a draft."} Etsy allows up to 13 tags, each 20 characters or fewer.</div>{tagIssues.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-brand">{tagIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}</aside>
    <aside hidden={operationsTab !== "results"} className="rounded-2xl border border-sage/25 bg-panel p-4" aria-label="Saved Codex listing drafts">
      <div className="text-xs font-bold uppercase tracking-[0.12em] text-sage">Saved Codex drafts</div>
      <p className="mt-1 text-sm font-semibold text-ink">Paste a complete Codex listing package once, save it locally, then approve only for manual Etsy entry.</p>
      <label className="mt-3 block text-xs font-semibold text-ink">Complete Codex listing draft<textarea value={listingStudio.packageText} onChange={(event) => setListingStudio((current) => ({ ...current, packageText: event.target.value }))} className="mt-1.5 min-h-32 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" placeholder="Paste the approved title, tags, description, FAQ and notes from Codex" /></label>
      <button type="button" onClick={() => void saveListingDraft()} className="mt-3 rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white hover:bg-brand">Save local Codex draft</button>
      <p className="mt-2 text-xs text-muted">Saving creates a local record only. Approval never publishes to Etsy.</p>
      {state.listingDrafts.length > 0 && (
        <div className="mt-4 space-y-2">
          {state.listingDrafts.map((draft) => {
            const linkedLoop = state.keywordResearchLoops.find((item) => item.designId === draft.designId);
            const approvalSeeds = linkedLoop?.queries?.length ? linkedLoop.queries : draft.designId === DEFAULT_ACTIVE_DESIGN_ID ? DESIGN04_SEEDS : [];
            const approvalIssues = collectListingDraftApprovalIssues(state, draft, approvalSeeds);
            const isApproved = draft.status === "approved-for-manual-entry";
            const isCurrentDraft = deriveActiveDraftState(state.listingDrafts, draft.designId).currentDraft?.id === draft.id;
            const canCopyApprovedDraft = isCurrentDraft && isApproved && approvalIssues.length === 0;
            return (
              <article key={draft.id} className="rounded-xl border border-line bg-[#FBF7F2] p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><div className="font-semibold text-ink">{state.designs.find((item) => item.id === draft.designId)?.name ?? draft.designId}</div><div className="mt-1 text-xs text-muted">Saved {draft.createdAt.slice(0, 10)} · {draft.tags.length} tags · {draft.evidenceIds.length} linked evidence record(s)</div></div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${canCopyApprovedDraft ? "bg-[#E8F0E6] text-sage" : "bg-[#F9EEE4] text-copper"}`}>{!isCurrentDraft ? "Superseded draft" : canCopyApprovedDraft ? "Manual entry approved" : isApproved ? "Approval blocked by current checks" : "Draft"}</span>
                </div>
                <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold text-ink">View saved package</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-white p-2 font-sans text-[11px] leading-4 text-muted">{draft.sourcePacket}</pre></details>
                {approvalIssues.length > 0 && <p className="mt-2 text-xs leading-5 text-brand">Owner Gate: {approvalIssues[0]}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {isCurrentDraft && !isApproved && <button type="button" onClick={() => void approveListingDraft(draft.id)} className="rounded-lg bg-[#E8F0E6] px-3 py-1.5 text-xs font-bold text-sage">Approve for manual Etsy entry</button>}
                  {canCopyApprovedDraft && <button type="button" onClick={() => void copy(draft.sourcePacket, "This exact approved Listing Brief was copied for later manual Etsy entry.")} className="rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-white hover:bg-brand">Copy this approved draft</button>}
                  <button type="button" onClick={() => void removeListingDraft(draft.id)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-brand hover:bg-[#FFF1E8]">Remove local draft</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </aside>
    <section hidden={operationsTab !== "social"} style={{ display: operationsTab === "social" ? undefined : "none" }} className="rounded-[26px] border border-line bg-panel p-5 shadow-card sm:p-6"><div className="flex items-center gap-2 text-copper"><CheckCircle2 size={18} /><span className="text-xs font-semibold uppercase tracking-[0.16em]">Social Campaign Tracker</span></div><h3 className="mt-2 font-display text-2xl font-bold text-ink">Phase 2: record content and outcomes without claiming attribution</h3><div className="mt-5 grid gap-3 md:grid-cols-3">{(["contentId", "assetName", "publishedOn", "copy", "cta", "url", "impressions", "clicks", "saves"] as const).map((key) => <label key={key} className="text-xs font-semibold text-ink">{key.replace(/([A-Z])/g, " $1")}<input type={key === "publishedOn" ? "date" : "text"} value={post[key]} onChange={(event) => setPost((current) => ({ ...current, [key]: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" /></label>)}<label className="text-xs font-semibold text-ink">Platform<select value={post.platform} onChange={(event) => setPost((current) => ({ ...current, platform: event.target.value as ContentPost["platform"] }))} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal"><option>Instagram</option><option>Pinterest</option><option>Facebook</option><option>Threads</option></select></label><label className="text-xs font-semibold text-ink">Target listing<select value={post.listingId} onChange={(event) => setPost((current) => ({ ...current, listingId: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal"><option value="">Select listing</option>{state.listings.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label className="text-xs font-semibold text-ink">Outcome<select value={post.outcome} onChange={(event) => setPost((current) => ({ ...current, outcome: event.target.value as ContentPost["outcome"] }))} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal"><option>Attribution unconfirmed</option><option>Repeat</option><option>Improve</option><option>Stop</option></select></label></div><button type="button" onClick={() => void addPost()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white hover:bg-brand"><Plus size={15} />Save social post</button><div className="mt-5 overflow-x-auto rounded-2xl border border-line"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-[#F8F3ED] text-muted"><tr><th className="px-4 py-3">Content</th><th className="px-4 py-3">Platform</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Signals</th><th className="px-4 py-3">Decision</th></tr></thead><tbody>{state.posts.length === 0 ? <tr><td colSpan={5} className="px-4 py-5 text-muted">No social posts recorded. Likes and followers are intentionally not decision metrics here.</td></tr> : state.posts.map((item) => <tr key={item.id} className="border-t border-line"><td className="px-4 py-3 font-semibold text-ink">{item.contentId}<div className="mt-1 font-normal text-muted">{item.publishedOn}</div></td><td className="px-4 py-3">{item.platform}</td><td className="px-4 py-3">{item.listingId}</td><td className="px-4 py-3">Impressions {item.impressions || "missing"} · Clicks {item.clicks || "missing"} · Saves {item.saves || "missing"}</td><td className="px-4 py-3 font-semibold text-copper">{item.outcome}</td></tr>)}</tbody></table></div></section>
    <div hidden={operationsTab !== "research"}><KeywordResearchWorkspace /></div>
    <div hidden={operationsTab !== "library"}><ProductFactsGate state={state} onCommit={commit} /></div>
    </>}
  </section>;
}
