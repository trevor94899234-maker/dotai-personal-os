import { CheckCircle2, Clipboard, FileSpreadsheet, Image, ScanText, SearchCheck, Trash2, Undo2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import {
  DEFAULT_STATE,
  alignResearchBatchToRound,
  createId,
  approveResearchRound,
  assessResearchFreshness,
  buildResearchCoachConclusion,
  bindResearchArtifactToQueryTask,
  computeResearchCoverage,
  createAdaptiveNextResearchRound,
  createResearchQueryTasks,
  createResearchBatch,
  createNextResearchRound,
  createResearchRound,
  confirmResearchOcrField,
  deserializeResearchPreview,
  deriveResearchOpportunity,
  deriveAdaptiveResearchAction,
  hydrateListingDrafts,
  hydrateKeywordResearch,
  hydrateKnownDesigns,
  hydrateKnownProducts,
  keywordEvidenceGaps,
  hydrateResearchResults,
  hongKongCalendarDate,
  hongKongCaptureDateTime,
  researchPastedScreenshotFileName,
  isListingBriefEligibleForResearchContext,
  isLatestResearchContext,
  legacyMigration,
  loadOperationsState,
  parseWorkbook,
  normalizeResearchResultRow,
  normalizeResearchField,
  mergeResearchRowsWithLineage,
  parseResearchDelimitedText,
  persistResearchStateAfterImmediatePublish,
  reduceResearchPreviewRecovery,
  RESEARCH_OCR_TIMEOUT_MS,
  removeResearchArtifactFromBatch,
  researchPreviewKey,
  researchFreshnessPolicyForContext,
  researchFreshnessPolicyScope,
  researchFocusLabelForRound,
  researchExactSeedIdForArtifact,
  researchRowsForContext,
  researchActiveInputForQueryTask,
  researchActiveInputLedgerForRound,
  researchIntentAnchorsForRound,
  researchRequiredDimensionsForRound,
  researchQueryTasksForContext,
  selectResearchSupportRowLedger,
  saveResearchResultBatch,
  saveOperationsState,
  runBoundedResearchOcr,
  sourceAuthority,
  upsertResearchFreshnessPolicy,
  validateAndRankGapCandidates,
  serializeResearchPreview,
  SHORT_INTENT_V2_VERSION,
  type EvidenceArtifact,
  type EvidenceSource,
  type KeywordResearchLoop,
  type EtsyOperationsState,
  type RawResearchResultRow,
  type ResearchContext,
  type ResearchFreshnessPolicy,
  type ResearchFieldConfirmation,
  type ResearchFitAssessment,
  type ResearchOcrLifecycle,
  type ResearchRound,
  type ResearchBatch,
  type ResearchQueryTask,
  type GapCandidateDraft,
} from "../lib/etsyOperations";
import { createInProductGapSuggestion } from "../lib/etsyGapSuggestions";
import { buildEtsyWorkflowPackage, type EtsyStageRequest } from "../lib/etsyPromptPackage";

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

type KeywordResearchWorkspaceProps = { selectedDesignId?: string; onSelectDesign?: (designId: string) => void; onFailClosedStateChange?: (state: EtsyOperationsState) => void; onStageRequestChange?: (request: EtsyStageRequest | null) => void };
type ResearchInputPreview = {
  id: string;
  /** Allocated at preview creation, never regenerated during a retry/save. */
  artifactId: string;
  artifactOrdinal: number;
  batch?: ResearchBatch;
  context: ResearchContext;
  source: "erank" | "everbee";
  captureAt: string;
  captureAtHk: string;
  sourceDate: string;
  sourceDateWasAutomatic: boolean;
  seedOverrideId?: string;
  originatingSeedId?: string;
  originatingQuery: string;
  researchQueryTaskId?: string;
  researchIntentDimensionId?: string;
  inputKind: "csv" | "xlsx" | "text" | "screenshot";
  fileName: string;
  previewDataUrl?: string;
  rawText: string;
  parsedRows: RawResearchResultRow[];
  fieldConfirmations: Record<string, ResearchFieldConfirmation[]>;
  freshnessPolicy?: ResearchFreshnessPolicy;
  ocrOnly: boolean;
  visualReviewOnly: boolean;
  ocrLifecycle?: ResearchOcrLifecycle;
  needsOriginalBytes: boolean;
  artifactStatus?: "preview" | "saved" | "duplicate-audited" | "conflicting" | "retry-needed" | "raw-reattach-required" | "visual-review-only";
  error?: string;
};

function starterQueries(recipient: string, productType: string) {
  const person = recipient.trim().toLowerCase() || "gift";
  const product = productType.toLowerCase().includes("journal") ? "journal" : productType.toLowerCase();
  return [`personalized ${person} ${product}`, `${person} memory ${product}`, `${person} keepsake ${product}`, `custom ${person} ${product}`, `${person} gift`];
}

function defaultLoop(recipient: string, productType: string): KeywordResearchLoop {
  return { designId: "", round: 1, stage: "seed-requested", queries: starterQueries(recipient, productType), requestReason: "Start with the exact recipient + story/memory intent. Use this round to see which wording has usable demand, click behavior, and manageable competition before expanding.", updatedAt: "" };
}

const PREVIEW_INDEX_KEY = "etsy-research-preview-index-v1";

export default function KeywordResearchWorkspace({ selectedDesignId: controlledDesignId, onSelectDesign, onFailClosedStateChange, onStageRequestChange }: KeywordResearchWorkspaceProps = {}) {
  const [state, setState] = useState<EtsyOperationsState | null>(null);
  const [localDesignId, setLocalDesignId] = useState("demo-design-journal");
  const selectedDesignId = controlledDesignId ?? localDesignId;
  const [source, setSource] = useState<EvidenceSource>("erank");
  const [researchDate, setResearchDate] = useState(() => hongKongCalendarDate());
  const [legacyFile, setLegacyFile] = useState<File | null>(null);
  const [verdictStage, setVerdictStage] = useState<"need-deeper-research" | "conclusion-ready">("need-deeper-research");
  const [verdictNote, setVerdictNote] = useState("");
  const [nextQueries, setNextQueries] = useState("");
  const [primaryKeyword, setPrimaryKeyword] = useState("");
  const [supportingKeywords, setSupportingKeywords] = useState("");
  const [avoidKeywords, setAvoidKeywords] = useState("");
  const [researchFiles, setResearchFiles] = useState<File[]>([]);
  const [pastedText, setPastedText] = useState("");
  const [selectedSeedIds, setSelectedSeedIds] = useState<string[]>([]);
  const [selectedIndividualAnchorIds, setSelectedIndividualAnchorIds] = useState<string[]>([]);
  const [activeQueryTaskId, setActiveQueryTaskId] = useState("");
  const [gapAnalysisText, setGapAnalysisText] = useState("");
  const [gapSuggestionBusy, setGapSuggestionBusy] = useState(false);
  const [selectedGapCandidateIds, setSelectedGapCandidateIds] = useState<string[]>([]);
  const [previewItems, setPreviewItems] = useState<ResearchInputPreview[]>([]);
  const [activeRoundId, setActiveRoundId] = useState("");
  const [freshnessPolicyEnabled, setFreshnessPolicyEnabled] = useState(false);
  const [freshnessMaxAgeDays, setFreshnessMaxAgeDays] = useState("30");
  const [freshnessBasis, setFreshnessBasis] = useState("");
  const [freshnessEffectiveDate, setFreshnessEffectiveDate] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [previewBatchBusy, setPreviewBatchBusy] = useState(false);
  const [previewBusyId, setPreviewBusyId] = useState("");
  const [lastPastedScreenshotName, setLastPastedScreenshotName] = useState("");
  const [previewFocusPending, setPreviewFocusPending] = useState(false);
  const [buyerOccasionFit, setBuyerOccasionFit] = useState<ResearchFitAssessment>("missing");
  const [productFit, setProductFit] = useState<ResearchFitAssessment>("missing");
  const [coachDraftBlocker, setCoachDraftBlocker] = useState("");
  const [zoomedResearchArtifactId, setZoomedResearchArtifactId] = useState("");
  const [zoomedPreviewId, setZoomedPreviewId] = useState("");
  const saveBusyRef = useRef(false);
  const previewFilesRef = useRef<Record<string, File>>({});
  const ocrAttemptRef = useRef<Record<string, number>>({});
  const previewRegionRef = useRef<HTMLElement>(null);
  const [notice, setNotice] = useState("Loading local research intake...");
  const [toast, setToast] = useState<string | null>(null);

  const announce = (message: string) => { setNotice(message); setToast(message); };
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 6000); return () => window.clearTimeout(timer); }, [toast]);

  useEffect(() => {
    const restore = () => void (async () => {
      try {
        const loaded = await loadOperationsState();
        const hydrated = hydrateResearchResults(hydrateListingDrafts(hydrateKeywordResearch(hydrateKnownDesigns(hydrateKnownProducts(legacyMigration(loaded))))));
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
  const savedResearchRounds = useMemo(() => (state?.researchRounds ?? [])
    .filter((round) => round.designId === selectedDesignId && round.productId === selectedProduct?.id && round.seedVersion === SHORT_INTENT_V2_VERSION)
    .sort((left, right) => right.roundNumber - left.roundNumber), [selectedDesignId, selectedProduct?.id, state?.researchRounds]);
  const nextResearchRoundNumber = (savedResearchRounds[0]?.roundNumber ?? 0) + 1;
  const draftResearchRoundId = selectedDesignId && selectedProduct ? `draft-${selectedDesignId}-${selectedProduct.id}-${nextResearchRoundNumber}` : "";
  const draftResearchRound = useMemo<ResearchRound | undefined>(() => {
    if (!selectedDesignId || !selectedProduct) return undefined;
    return createResearchRound({ id: draftResearchRoundId, designId: selectedDesignId, productId: selectedProduct.id, roundNumber: nextResearchRoundNumber });
  }, [draftResearchRoundId, nextResearchRoundNumber, selectedDesignId, selectedProduct]);
  const activeResearchRound = useMemo<ResearchRound | undefined>(() => {
    const saved = savedResearchRounds.find((round) => round.id === activeRoundId) ?? (!activeRoundId ? savedResearchRounds[0] : undefined);
    if (saved) return saved;
    return draftResearchRound;
  }, [activeRoundId, draftResearchRound, savedResearchRounds]);
  const activeResearchContext = activeResearchRound ? { designId: activeResearchRound.designId, productId: activeResearchRound.productId, roundId: activeResearchRound.id, seedVersion: activeResearchRound.seedVersion } : undefined;
  const activeResultRows = activeResearchContext ? researchRowsForContext(state?.researchResultRows ?? [], activeResearchContext) : [];
  const activeIntentAnchors = activeResearchRound ? researchIntentAnchorsForRound(activeResearchRound) : [];
  const activeInputLedger = activeResearchRound ? researchActiveInputLedgerForRound(activeResearchRound) : [];
  const activeQueryTasks = activeResearchContext ? researchQueryTasksForContext(state?.researchQueryTasks ?? [], activeResearchContext) : [];
  const activeQueryTask = activeQueryTasks.find((task) => task.id === activeQueryTaskId);
  const mergedResearchRows = mergeResearchRowsWithLineage(activeResultRows);
  const activeCoverage = activeResearchRound ? computeResearchCoverage(activeResearchRound, activeResultRows) : [];
  const activeSupportRowLedger = activeResearchRound ? selectResearchSupportRowLedger({ round: activeResearchRound, tasks: activeQueryTasks, rows: activeResultRows }) : [];
  const uncoveredResearchDimension = activeResearchRound
    ? researchRequiredDimensionsForRound(activeResearchRound).find((dimension) => !activeCoverage.some((item) => item.dimensionId === dimension.id && item.covered))
    : undefined;
  const canSuggestNextGap = Boolean(activeResearchRound
    && activeResearchContext
    && activeQueryTasks.length >= 3
    && activeQueryTasks.length <= 5
    && activeQueryTasks.every((task) => task.status === "received")
    && activeSupportRowLedger.length > 0
    && uncoveredResearchDimension);
  const latestGapAnalysis = activeResearchContext ? [...(state?.researchGapAnalysisAttempts ?? [])]
    .filter((attempt) => attempt.designId === activeResearchContext.designId && attempt.productId === activeResearchContext.productId && attempt.roundId === activeResearchContext.roundId && attempt.seedVersion === activeResearchContext.seedVersion)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] : undefined;
  const adaptiveAction = activeResearchRound && activeQueryTasks.length ? deriveAdaptiveResearchAction({ round: activeResearchRound, tasks: activeQueryTasks, rows: activeResultRows, conclusion: activeResearchRound.conclusion, gapAnalysis: latestGapAnalysis }) : undefined;
  const activeResearchArtifacts = useMemo(() => (state?.artifacts ?? [])
    .filter((artifact) => artifact.researchRoundId === activeResearchContext?.roundId && artifact.researchSeedVersion === activeResearchContext?.seedVersion && artifact.targetId === activeResearchContext?.designId)
    .sort((left, right) => (left.researchArtifactOrdinal ?? Number.MAX_SAFE_INTEGER) - (right.researchArtifactOrdinal ?? Number.MAX_SAFE_INTEGER) || left.uploadedAt.localeCompare(right.uploadedAt)), [activeResearchContext?.designId, activeResearchContext?.roundId, activeResearchContext?.seedVersion, state?.artifacts]);
  const zoomedResearchArtifact = activeResearchArtifacts.find((artifact) => artifact.id === zoomedResearchArtifactId);
  const listingBriefEligible = Boolean(state && activeResearchContext && isLatestResearchContext(state, activeResearchContext) && isListingBriefEligibleForResearchContext(state, activeResearchContext));
  const activePreviewKey = activeResearchContext ? researchPreviewKey(activeResearchContext) : "";
  const [previewHydratedKey, setPreviewHydratedKey] = useState("");

  useEffect(() => {
    if (!activeResearchRound) return;
    setActiveRoundId((current) => current || activeResearchRound.id);
  }, [activeResearchRound?.id]);

  useEffect(() => {
    const frozenInputIds = activeInputLedger.map((input) => input.id);
    if (!frozenInputIds.length) { setSelectedSeedIds([]); return; }
    setSelectedSeedIds((current) => {
      const retained = current.filter((id) => frozenInputIds.includes(id));
      return retained.length ? retained : [frozenInputIds[0]];
    });
  }, [activeResearchRound?.id, activeInputLedger.map((input) => input.id).join("|")]);

  useEffect(() => { setActiveRoundId(""); }, [selectedDesignId, selectedProduct?.id]);

  useEffect(() => {
    setSelectedIndividualAnchorIds([]);
    setActiveQueryTaskId((current) => activeQueryTasks.some((task) => task.id === current) ? current : activeQueryTasks[0]?.id ?? "");
  }, [activeResearchRound?.id, activeQueryTasks.map((task) => task.id).join("|")]);

  useEffect(() => {
    setSelectedGapCandidateIds([]);
  }, [activeResearchRound?.id, latestGapAnalysis?.id]);

  function individualStageRequestForTask(task: ResearchQueryTask): EtsyStageRequest | null {
    if (!activeResearchContext || !activeResearchRound) return null;
    return {
      stage: "product-research-individual",
      exactContext: {
        ...activeResearchContext,
        roundNumber: activeResearchRound.roundNumber,
        researchFocus: researchFocusLabelForRound(activeResearchRound),
        designName: selectedDesign?.name,
        productName: selectedProduct?.name,
        taskId: task.id,
        originatingQuery: task.query,
        intentDimensionId: task.intentDimensionId,
        taskStatus: task.status,
      },
      allowedInputs: [`Owner-provided ${task.source} export for exact task ${task.id}`],
      evidenceRefs: task.artifactIds,
      nextActionBoundary: `Owner attaches evidence to the exact task for “${task.query}”; filename and order are ignored.`,
    };
  }

  const stageRequest = useMemo<EtsyStageRequest | null>(() => {
    if (!activeResearchContext || !activeResearchRound) return null;
    const exactContext = { ...activeResearchContext, roundNumber: activeResearchRound.roundNumber, researchFocus: researchFocusLabelForRound(activeResearchRound), designName: selectedDesign?.name, productName: selectedProduct?.name };
    if (!activeQueryTasks.length) return { stage: "product-research-bulk", exactContext, allowedInputs: activeIntentAnchors.map((anchor) => `${anchor.ordinal}. ${anchor.query} [${anchor.intentDimensionId}]`), evidenceRefs: [], nextActionBoundary: "Owner runs the 5–8 anchors in Bulk, then explicitly selects exactly 3–5 Individual queries." };
    const visibleTask = activeQueryTask ?? activeQueryTasks.find((task) => task.status !== "received") ?? activeQueryTasks[0];
    if (activeQueryTasks.some((task) => task.status !== "received") && visibleTask) return individualStageRequestForTask(visibleTask);
    const supportRowLedger = selectResearchSupportRowLedger({ round: activeResearchRound, tasks: activeQueryTasks, rows: activeResultRows });
    if (!supportRowLedger.length) return null;
    return { stage: "product-research-analysis", exactContext, allowedInputs: [`Completed-query ledger: ${activeQueryTasks.map((task) => task.query).join(" | ")}`, `Coverage: ${activeCoverage.map((item) => `${item.dimensionId}=${item.covered}`).join(" | ")}`], evidenceRefs: [...new Set(activeResultRows.map((row) => row.artifactId))], supportRowLedger, nextActionBoundary: "Return one close-research, collect-missing-input, or propose-gap-round action using only supplied supportRowLedger rowId values; never create a round, task, or owner approval." };
  }, [activeCoverage, activeIntentAnchors, activeQueryTask, activeQueryTasks, activeResearchContext, activeResearchRound, activeResultRows, selectedDesign?.name, selectedProduct?.name]);

  const stageRequestSignature = JSON.stringify(stageRequest);
  useEffect(() => { onStageRequestChange?.(stageRequest); return () => onStageRequestChange?.(null); }, [onStageRequestChange, stageRequestSignature]);

  useEffect(() => {
    const savedPolicy = state && selectedProduct && (source === "erank" || source === "everbee")
      ? researchFreshnessPolicyForContext(state.researchFreshnessPolicies, source, selectedDesignId, selectedProduct.id)
      : undefined;
    setFreshnessPolicyEnabled(Boolean(savedPolicy));
    setFreshnessMaxAgeDays(savedPolicy ? String(savedPolicy.maxAgeDays) : "30");
    setFreshnessBasis(savedPolicy?.basis ?? "");
    setFreshnessEffectiveDate(savedPolicy?.effectiveDate ?? "");
  }, [selectedDesignId, selectedProduct?.id, source, state?.researchFreshnessPolicies]);

  useEffect(() => {
    setBuyerOccasionFit(activeResearchRound?.fitReview?.buyerOccasionFit ?? "missing");
    setProductFit(activeResearchRound?.fitReview?.productFit ?? "missing");
  }, [activeResearchRound?.id, activeResearchRound?.fitReview?.buyerOccasionFit, activeResearchRound?.fitReview?.productFit]);

  useEffect(() => {
    if (!activePreviewKey) { setPreviewItems([]); setPreviewHydratedKey(""); return; }
    try {
      const restored = deserializeResearchPreview<ResearchInputPreview[]>(sessionStorage.getItem(activePreviewKey) ?? "");
      setPreviewItems(Array.isArray(restored) ? restored.map((item) => ({
        ...item,
        fieldConfirmations: item.fieldConfirmations ?? {},
        visualReviewOnly: item.visualReviewOnly ?? (item.inputKind === "screenshot" && item.parsedRows.length === 0),
        artifactStatus: item.artifactStatus ?? "preview",
      })) : []);
    } catch { setPreviewItems([]); }
    setPreviewHydratedKey(activePreviewKey);
  }, [activePreviewKey]);

  useEffect(() => {
    if (!activePreviewKey || previewHydratedKey !== activePreviewKey) return;
    try {
      sessionStorage.setItem(activePreviewKey, serializeResearchPreview(previewItems));
      const index = deserializeResearchPreview<string[]>(sessionStorage.getItem(PREVIEW_INDEX_KEY) ?? "") ?? [];
      if (!index.includes(activePreviewKey)) sessionStorage.setItem(PREVIEW_INDEX_KEY, serializeResearchPreview([...index, activePreviewKey]));
    } catch { /* Editable in-memory preview remains available if session storage is unavailable. */ }
  }, [activePreviewKey, previewHydratedKey, previewItems]);

  useEffect(() => {
    if (!previewFocusPending || previewItems.length === 0) return;
    setPreviewFocusPending(false);
    window.requestAnimationFrame(() => {
      previewRegionRef.current?.focus();
      previewRegionRef.current?.scrollIntoView({ block: "start" });
    });
  }, [previewFocusPending, previewItems.length]);

  function publishFailClosedResearchState(next: EtsyOperationsState) {
    setState(next);
    onFailClosedStateChange?.(next);
  }

  async function commit(next: EtsyOperationsState, message: string, relockParentBeforePersistence = false) {
    const publish = relockParentBeforePersistence ? publishFailClosedResearchState : setState;
    const persisted = await persistResearchStateAfterImmediatePublish(next, publish, saveOperationsState);
    if (persisted) {
      window.dispatchEvent(new CustomEvent("etsy-operations-updated", { detail: { state: next } }));
      announce(message);
    } else {
      announce("Saved in this tab only. IndexedDB could not be written.");
    }
  }

  function currentFreshnessPolicy(): ResearchFreshnessPolicy | undefined {
    if (!freshnessPolicyEnabled) return undefined;
    const maxAgeDays = Number(freshnessMaxAgeDays);
    if (!Number.isInteger(maxAgeDays) || maxAgeDays < 0 || !freshnessBasis.trim() || !freshnessEffectiveDate.trim()) return undefined;
    if ((source !== "erank" && source !== "everbee") || !selectedProduct) return undefined;
    return { scope: researchFreshnessPolicyScope(source, selectedDesignId, selectedProduct.id), maxAgeDays, basis: freshnessBasis.trim(), effectiveDate: freshnessEffectiveDate.trim() };
  }

  async function runInboxOcr(file: File, previewId: string) {
    const attemptNumber = (ocrAttemptRef.current[previewId] ?? 0) + 1;
    ocrAttemptRef.current[previewId] = attemptNumber;
    const attemptId = `${previewId}:${attemptNumber}`;
    const dataUrl = await fileDataUrl(file);
    const outcome = await runBoundedResearchOcr({
      attemptId,
      image: dataUrl,
      prepareImage: async () => {
        try { return await enhanceScreenshotForOcr(dataUrl); }
        catch { return dataUrl; }
      },
      createWorker: async () => {
        const { createWorker } = await import("tesseract.js");
        return createWorker("eng");
      },
      timeoutMs: RESEARCH_OCR_TIMEOUT_MS,
    });
    return ocrAttemptRef.current[previewId] === attemptNumber ? outcome : null;
  }

  function ocrPreviewTruth(sourceForPreview: "erank" | "everbee", outcome: Awaited<ReturnType<typeof runInboxOcr>>, preservedRawText = "") {
    if (!outcome) return null;
    if (outcome.lifecycle.status === "visual-review-only") {
      return { rawText: preservedRawText, parsedRows: [] as RawResearchResultRow[], fieldConfirmations: {} as Record<string, ResearchFieldConfirmation[]>, visualReviewOnly: true, ocrLifecycle: outcome.lifecycle };
    }
    let parsedRows: RawResearchResultRow[] = [];
    try { parsedRows = parseResearchDelimitedText(outcome.text, sourceForPreview); }
    catch { /* OCR text remains editable but cannot create normalized rows until reparsed. */ }
    return { rawText: outcome.text, parsedRows, fieldConfirmations: {} as Record<string, ResearchFieldConfirmation[]>, visualReviewOnly: parsedRows.length === 0, ocrLifecycle: outcome.lifecycle };
  }

  async function copyActiveStagePacket(request = stageRequest) {
    if (!request) { announce("Open a valid Product Development Research stage before copying a packet."); return; }
    try { await copyText(await buildEtsyWorkflowPackage(request)); announce(`${request.stage} packet copied. It contains only this stage and one owner-controlled next action.`); }
    catch { announce("Clipboard permission is unavailable. The visible stage context remains on screen."); }
  }

  async function createIndividualTasks() {
    if (!state || !activeResearchRound || (source !== "erank" && source !== "everbee")) return;
    try {
      const selected = activeIntentAnchors.filter((anchor) => selectedIndividualAnchorIds.includes(anchor.id));
      const completedQueries = state.researchQueryTasks.filter((task) => task.status === "received").map((task) => task.query);
      const tasks = createResearchQueryTasks({ round: activeResearchRound, selectedQueries: selected.map((anchor) => ({ query: anchor.query, intentDimensionId: anchor.intentDimensionId, anchorId: anchor.id })), source, completedQueries });
      await commit({ ...state, researchQueryTasks: [...tasks, ...state.researchQueryTasks] }, `${tasks.length} exact Individual query tasks created in owner-selected order. No round or evidence was created.`);
      setActiveQueryTaskId(tasks[0]?.id ?? "");
    } catch (error) { announce(error instanceof Error ? error.message : "Individual tasks could not be created."); }
  }

  async function copyIndividualTaskPacket(task: ResearchQueryTask) {
    setActiveQueryTaskId(task.id);
    await copyActiveStagePacket(individualStageRequestForTask(task));
  }

  async function activateTaskUpload(task: ResearchQueryTask, files: File[]) {
    if (!state || !files.length) return;
    const now = new Date().toISOString();
    const nextTasks = state.researchQueryTasks.map((item) => item.id === task.id ? { ...item, status: "ready" as const, error: undefined, updatedAt: now } : item);
    setActiveQueryTaskId(task.id);
    setResearchFiles(files);
    await commit({ ...state, researchQueryTasks: nextTasks }, `Exact upload target activated for “${task.query}”. ${files.length} file(s) remain bound by task ID, not filename.`);
  }

  async function saveGapAnalysisAttempt() {
    if (!state || !activeResearchRound || !activeResearchContext) return;
    try {
      const parsed = JSON.parse(gapAnalysisText) as GapCandidateDraft[] | { rawGapCandidateDrafts?: GapCandidateDraft[] };
      const rawDrafts = Array.isArray(parsed) ? parsed : parsed.rawGapCandidateDrafts;
      if (!Array.isArray(rawDrafts)) throw new Error("Paste an array or rawGapCandidateDrafts from the product-research-analysis output.");
      const attempt = validateAndRankGapCandidates({ round: activeResearchRound, tasks: state.researchQueryTasks, rows: state.researchResultRows, rawDrafts, origin: "manual-json" });
      if (attempt.status !== "proposal-ready") {
        announce(`Fallback JSON failed deterministic validation with ${attempt.rejectionAudit.rejections.length} rejection(s); input was preserved and nothing was saved.`);
        return;
      }
      const adaptive = deriveAdaptiveResearchAction({ round: activeResearchRound, tasks: state.researchQueryTasks, rows: state.researchResultRows, conclusion: activeResearchRound.conclusion, gapAnalysis: attempt });
      const next = { ...state, researchGapAnalysisAttempts: [attempt, ...state.researchGapAnalysisAttempts], researchRounds: state.researchRounds.map((round) => round.id === activeResearchRound.id ? { ...round, adaptiveAction: adaptive, updatedAt: attempt.createdAt } : round) };
      await commit(next, `${attempt.rankedCandidates.length} valid ranked gap candidates saved for owner review; no round or task was created.`);
    } catch (error) { announce(error instanceof Error ? error.message : "Gap analysis JSON is invalid; input was preserved."); }
  }

  async function suggestNextGapKeywords() {
    if (gapSuggestionBusy || !state || !activeResearchRound || !activeResearchContext || !uncoveredResearchDimension) return;
    if (!canSuggestNextGap) {
      announce("完成 3–5 個 Individual 任務並保存至少一條 eligible structured row，先可以產生 gap 建議。");
      return;
    }
    setGapSuggestionBusy(true);
    try {
      const suggestion = createInProductGapSuggestion({
        context: activeResearchContext,
        dimension: uncoveredResearchDimension,
        supportRows: activeSupportRowLedger,
        usedQueries: [...activeInputLedger.map((input) => input.query), ...activeQueryTasks.map((task) => task.query)],
        productName: selectedProduct?.name,
        recipient: selectedDesign?.recipient,
        occasion: selectedDesign?.occasion,
      });
      const createdAt = new Date().toISOString();
      const attempt = validateAndRankGapCandidates({
        round: activeResearchRound,
        tasks: state.researchQueryTasks,
        rows: state.researchResultRows,
        rawDrafts: suggestion.rawDrafts,
        origin: suggestion.origin,
        id: createId("research-gap-analysis"),
        now: createdAt,
      });
      if (attempt.status !== "proposal-ready") {
        announce(`Dashboard gap suggestion failed deterministic validation with ${attempt.rejectionAudit.rejections.length} rejection(s); nothing was saved.`);
        return;
      }
      const adaptive = deriveAdaptiveResearchAction({ round: activeResearchRound, tasks: state.researchQueryTasks, rows: state.researchResultRows, conclusion: activeResearchRound.conclusion, gapAnalysis: attempt });
      const next = { ...state, researchGapAnalysisAttempts: [attempt, ...state.researchGapAnalysisAttempts], researchRounds: state.researchRounds.map((round) => round.id === activeResearchRound.id ? { ...round, adaptiveAction: adaptive, updatedAt: createdAt } : round) };
      await commit(next, `Dashboard 已按 ${suggestion.targetDimensionLabel} gap 產生並驗證 ${attempt.rankedCandidates.length} 個候選；未建立 round 或 task。`);
    } catch (error) {
      announce(error instanceof Error ? error.message : "Dashboard 暫時未能產生 gap candidates；原有資料及 JSON 備援保持不變。");
    } finally {
      setGapSuggestionBusy(false);
    }
  }

  async function previewResearchResults() {
    if (previewBatchBusy) return;
    if (!activeResearchContext || !activeResearchRound || (source !== "erank" && source !== "everbee")) { announce("Choose an active design, linked product, and research round first."); return; }
    const inputLedger = researchActiveInputLedgerForRound(activeResearchRound);
    if (activeQueryTasks.length && !activeQueryTask) { announce("Choose one exact Individual task upload target before creating a preview."); return; }
    if (!inputLedger.length) { announce("This round has no recoverable frozen active-input ledger. Start a new round before creating a Research Batch."); return; }
    const exactTaskInput = activeQueryTask ? researchActiveInputForQueryTask(activeResearchRound, activeQueryTask) : undefined;
    if (activeQueryTask && !exactTaskInput) { announce("The active Individual task does not match this round's exact frozen input, query, dimension, and context identity. Recreate the task from this exact round before previewing files."); return; }
    const effectiveSelectedSeedIds = exactTaskInput ? [exactTaskInput.id] : selectedSeedIds;
    if (!effectiveSelectedSeedIds.length) { announce("Select one or more frozen seeds for this exact Research Batch."); return; }
    if (effectiveSelectedSeedIds.some((id) => !inputLedger.some((input) => input.id === id))) { announce("The selected input does not match this round's frozen active-input identity. Select an input from this exact round before previewing files."); return; }
    const previewPolicy = currentFreshnessPolicy();
    if (freshnessPolicyEnabled && !previewPolicy) { announce("Complete the owner freshness policy before creating this source-scoped preview."); return; }
    const inputs: Array<{ file?: File; text?: string; name: string; kind: ResearchInputPreview["inputKind"] }> = researchFiles.map((item) => ({ file: item, name: item.name, kind: item.type.startsWith("image/") ? "screenshot" : /\.xlsx?$/i.test(item.name) ? "xlsx" : "csv" }));
    if (pastedText.trim()) inputs.push({ text: pastedText, name: "pasted-research.txt", kind: "text" });
    if (!inputs.length) { announce("Choose CSV/XLSX/screenshots or paste structured research text first."); return; }
    const existingBatch = previewItems.find((item) => item.batch
      && item.context.roundId === activeResearchContext.roundId
      && (activeQueryTask ? item.researchQueryTaskId === activeQueryTask.id : !item.researchQueryTaskId))?.batch;
    const preparedInputs = inputs.map((input, index) => ({ ...input, previewId: createId("research-preview"), artifactId: createId("research-artifact"), artifactOrdinal: (existingBatch?.artifactIds.length ?? 0) + index + 1 }));
    const createdAt = new Date().toISOString();
    const batchBase = existingBatch ?? createResearchBatch({ round: activeResearchRound, selectedSeedIds: effectiveSelectedSeedIds, now: createdAt });
    const batch: ResearchBatch = {
      ...batchBase,
      artifactIds: [...batchBase.artifactIds, ...preparedInputs.map((input) => input.artifactId)],
      updatedAt: createdAt,
    };
    setPreviewBatchBusy(true);
    if (inputs.some((input) => input.kind === "screenshot")) announce(`OCR started. Each screenshot reaches a terminal preview within ${RESEARCH_OCR_TIMEOUT_MS / 1000} seconds; valid sibling inputs settle independently.`);
    const tasks = preparedInputs.map(async (input) => {
      const id = input.previewId;
      const captureAt = new Date().toISOString();
      const captureDate = hongKongCalendarDate(captureAt);
      const sourceDate = researchDate;
      const inheritedSeedId = researchExactSeedIdForArtifact(batch, { researchSeedIds: batch.selectedSeedIds });
      const originatingSeed = inputLedger.find((input) => input.id === inheritedSeedId);
      let preview: ResearchInputPreview;
      try {
        let rawText = input.text ?? "";
        let parsedRows: RawResearchResultRow[] = [];
        let ocrOnly = false;
        let visualReviewOnly = false;
        let ocrLifecycle: ResearchOcrLifecycle | undefined;
        let previewDataUrl: string | undefined;
        if (input.file?.type.startsWith("image/")) {
          ocrOnly = true;
          previewFilesRef.current[id] = input.file;
          previewDataUrl = await fileDataUrl(input.file);
          const truth = ocrPreviewTruth(source, await runInboxOcr(input.file, id));
          if (!truth) throw new Error("A newer OCR attempt replaced this initial preview.");
          ({ rawText, parsedRows, visualReviewOnly, ocrLifecycle } = truth);
        } else if (input.file) {
          const parsed = await parseWorkbook(await input.file.arrayBuffer());
          rawText = parsed.contentText ?? "";
          parsedRows = parseResearchDelimitedText(rawText, source);
          previewFilesRef.current[id] = input.file;
        } else {
          parsedRows = parseResearchDelimitedText(rawText, source);
        }
        preview = { id, artifactId: input.artifactId, artifactOrdinal: input.artifactOrdinal, batch, context: activeResearchContext, source, captureAt, captureAtHk: hongKongCaptureDateTime(captureAt), sourceDate, sourceDateWasAutomatic: sourceDate === captureDate, originatingSeedId: inheritedSeedId, originatingQuery: activeQueryTask?.query ?? originatingSeed?.query ?? "Unmapped until one artifact seed override is selected", ...(activeQueryTask ? { researchQueryTaskId: activeQueryTask.id, researchIntentDimensionId: activeQueryTask.intentDimensionId } : {}), inputKind: input.kind, fileName: input.name, ...(previewDataUrl ? { previewDataUrl } : {}), rawText, parsedRows, fieldConfirmations: {}, freshnessPolicy: previewPolicy, ocrOnly, visualReviewOnly, ...(ocrLifecycle ? { ocrLifecycle } : {}), needsOriginalBytes: input.kind === "screenshot" || input.kind === "xlsx", artifactStatus: visualReviewOnly ? "visual-review-only" : "preview" };
      } catch (error) {
        preview = { id, artifactId: input.artifactId, artifactOrdinal: input.artifactOrdinal, batch, context: activeResearchContext, source, captureAt, captureAtHk: hongKongCaptureDateTime(captureAt), sourceDate, sourceDateWasAutomatic: sourceDate === captureDate, originatingSeedId: inheritedSeedId, originatingQuery: activeQueryTask?.query ?? originatingSeed?.query ?? "Unmapped until one artifact seed override is selected", ...(activeQueryTask ? { researchQueryTaskId: activeQueryTask.id, researchIntentDimensionId: activeQueryTask.intentDimensionId } : {}), inputKind: input.kind, fileName: input.name, rawText: input.text ?? "", parsedRows: [], fieldConfirmations: {}, freshnessPolicy: previewPolicy, ocrOnly: input.kind === "screenshot", visualReviewOnly: input.kind === "screenshot", needsOriginalBytes: input.kind === "screenshot" || input.kind === "xlsx", artifactStatus: "retry-needed", error: error instanceof Error ? error.message : "This input could not be parsed." };
        if (input.file) previewFilesRef.current[id] = input.file;
      }
      setPreviewItems((current) => [...current, preview]);
      return preview;
    });
    const next = await Promise.all(tasks);
    // A created preview owns its own editable/raw state. Clear the native
    // selection so pressing Create again cannot silently duplicate the same
    // screenshot or workbook into a new batch.
    setResearchFiles([]);
    setPastedText("");
    setLastPastedScreenshotName("");
    setPreviewBatchBusy(false);
    setPreviewFocusPending(true);
    announce(`${next.filter((item) => !item.error && !item.visualReviewOnly).length} structured preview item(s) ready; ${next.filter((item) => item.visualReviewOnly && !item.error).length} visual-review-only; ${next.filter((item) => item.error).length} need attention. Nothing has been saved to IndexedDB.`);
  }

  function reparsePreview(item: ResearchInputPreview) {
    try {
      const parsedRows = parseResearchDelimitedText(item.rawText, item.source);
      setPreviewItems((current) => current.map((preview) => preview.id === item.id ? { ...preview, parsedRows, fieldConfirmations: {}, visualReviewOnly: parsedRows.length === 0, error: undefined, artifactStatus: parsedRows.length === 0 ? "visual-review-only" : "preview" } : preview));
      announce(`${item.fileName} reparsed from the editable structured text. Review OCR fields again before save.`);
    } catch (error) {
      setPreviewItems((current) => reduceResearchPreviewRecovery(current, { type: "mark-error", id: item.id, error: error instanceof Error ? error.message : "Reparse failed." }));
    }
  }

  function discardResearchPreview(item: ResearchInputPreview) {
    if (!window.confirm(`Discard unsaved preview “${item.fileName}”? Saved artifacts are not affected.`)) return;
    const attached = previewFilesRef.current[item.id];
    delete previewFilesRef.current[item.id];
    setResearchFiles((current) => attached ? current.filter((file) => file !== attached) : current);
    if (lastPastedScreenshotName === item.fileName) setLastPastedScreenshotName("");
    setPreviewItems((current) => current
      .filter((preview) => preview.id !== item.id)
      .map((preview) => item.batch && preview.batch?.id === item.batch.id
        ? { ...preview, batch: removeResearchArtifactFromBatch(preview.batch, item.artifactId) }
        : preview));
    announce(`${item.fileName} unsaved preview discarded. Saved research was not changed.`);
  }

  async function retryPreview(item: ResearchInputPreview) {
    if (previewBusyId) return;
    setPreviewBusyId(item.id);
    try {
      const attached = previewFilesRef.current[item.id];
      if (item.inputKind === "screenshot") {
        if (!attached) throw new Error("Reattach the original screenshot before retrying OCR.");
        const truth = ocrPreviewTruth(item.source, await runInboxOcr(attached, item.id), item.rawText);
        if (!truth) return;
        setPreviewItems((current) => current.map((preview) => preview.id === item.id ? { ...preview, ...truth, error: undefined } : preview));
        announce(truth.visualReviewOnly
          ? truth.ocrLifecycle.message ?? `${item.fileName} remains ready for visual-review-only save.`
          : `${item.fileName} OCR finished within ${RESEARCH_OCR_TIMEOUT_MS / 1000} seconds. Parsed fields remain OCR-only and unconfirmed.`);
      } else if (item.inputKind === "xlsx" || (item.inputKind === "csv" && attached)) {
        if (!attached) throw new Error("Reattach the original source file before retrying parse.");
        const parsed = await parseWorkbook(await attached.arrayBuffer());
        const rawText = parsed.contentText ?? "";
        setPreviewItems((current) => current.map((preview) => preview.id === item.id ? { ...preview, rawText, parsedRows: parseResearchDelimitedText(rawText, item.source), fieldConfirmations: {}, error: undefined } : preview));
      } else {
        reparsePreview(item);
      }
    } catch (error) {
      setPreviewItems((current) => reduceResearchPreviewRecovery(current, { type: "mark-error", id: item.id, error: error instanceof Error ? error.message : "Retry failed." }));
    } finally { setPreviewBusyId((current) => current === item.id ? "" : current); }
  }

  function confirmPreviewField(item: ResearchInputPreview, rowIndex: number, field: ResearchFieldConfirmation["field"]) {
    if (!activeResearchRound) return;
    const raw = item.parsedRows[rowIndex];
    const attached = previewFilesRef.current[item.id];
    const artifact: EvidenceArtifact = { id: item.artifactId, kind: "keyword-research", source: item.source, authority: "supplemental", fileName: item.fileName, mimeType: attached?.type || "image/png", uploadedAt: item.captureAt, periodStart: item.sourceDate, periodEnd: item.sourceDate, targetType: "design", targetId: item.context.designId, ownerConfirmed: false, ocrStatus: "pending", rows: item.parsedRows.length, headers: [], metrics: [], researchSourceDate: item.sourceDate, researchBatchId: item.batch?.id, researchArtifactOrdinal: item.artifactOrdinal, researchSeedIds: item.batch?.selectedSeedIds, researchSeedOverrideId: item.seedOverrideId, researchCapturedAt: item.captureAt, researchCapturedAtHk: item.captureAtHk };
    try {
      const row = normalizeResearchResultRow({ round: activeResearchRound, batch: item.batch, artifact, originatingSeedId: item.originatingSeedId, originatingQuery: item.originatingQuery, raw, freshnessPolicy: item.freshnessPolicy, ocrOnly: true, fieldConfirmations: item.fieldConfirmations[String(rowIndex)] ?? [] });
      const confirmed = confirmResearchOcrField(row, field, `${field}:${row[field].raw}`, "owner", new Date().toISOString());
      setPreviewItems((current) => current.map((preview) => preview.id === item.id ? { ...preview, fieldConfirmations: { ...preview.fieldConfirmations, [String(rowIndex)]: confirmed.fieldConfirmations }, error: undefined } : preview));
    } catch (error) { announce(error instanceof Error ? error.message : "This OCR field cannot be confirmed."); }
  }

  async function saveResearchPreviews(onlyIds?: Set<string>) {
    if (saveBusyRef.current || !state || !activeResearchRound || !activeResearchContext) return;
    saveBusyRef.current = true;
    setSaveBusy(true);
    let accumulated = hydrateResearchResults(state);
    const failedIds = new Set<string>();
    const savedIds = new Set<string>();
    try {
      for (const preview of previewItems) {
        if (onlyIds && !onlyIds.has(preview.id)) continue;
        if (preview.context.designId !== activeResearchContext.designId || preview.context.productId !== activeResearchContext.productId || preview.context.roundId !== activeResearchContext.roundId || preview.context.seedVersion !== activeResearchContext.seedVersion || preview.error || !preview.batch) { failedIds.add(preview.id); continue; }
        const attached = previewFilesRef.current[preview.id];
        if (preview.needsOriginalBytes && !attached) { failedIds.add(preview.id); continue; }
        try {
          const saveBatch = alignResearchBatchToRound(preview.batch, activeResearchRound);
          if (preview.freshnessPolicy) accumulated = { ...accumulated, researchFreshnessPolicies: upsertResearchFreshnessPolicy(accumulated.researchFreshnessPolicies, preview.freshnessPolicy) };
          const ocrFullyConfirmed = !preview.visualReviewOnly && preview.parsedRows.length > 0 && preview.parsedRows.every((raw, rowIndex) => {
            const validFields = (["phrase", "searchVolume", "competition", "trend", "relevanceScore"] as const).filter((field) => {
              const truth = field === "phrase" ? normalizeResearchField(raw[field], "string") : normalizeResearchField(raw[field], "number");
              return truth.status === "confirmed" || truth.status === "confirmed-zero";
            });
            return validFields.every((field) => (preview.fieldConfirmations[String(rowIndex)] ?? []).some((confirmation) => confirmation.field === field));
          });
          const dataUrl = attached ? await fileDataUrl(attached) : undefined;
          const artifact: EvidenceArtifact = {
            id: preview.artifactId, kind: "keyword-research", source: preview.source, authority: "supplemental", fileName: preview.fileName, mimeType: preview.inputKind === "screenshot" ? attached?.type || "image/png" : preview.inputKind === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv", uploadedAt: preview.captureAt, periodStart: preview.sourceDate, periodEnd: preview.sourceDate, targetType: "design", targetId: activeResearchContext.designId, ownerConfirmed: !preview.ocrOnly || preview.visualReviewOnly || ocrFullyConfirmed, ocrStatus: preview.ocrOnly ? (preview.visualReviewOnly || preview.parsedRows.length === 0 ? "unreadable" : ocrFullyConfirmed ? "confirmed" : "pending") : "not-needed", rows: preview.visualReviewOnly ? 0 : preview.parsedRows.length, headers: [], metrics: [], contentText: preview.rawText, ...(dataUrl ? { dataUrl } : {}), researchRoundId: activeResearchContext.roundId, researchSeedVersion: activeResearchContext.seedVersion, researchOriginatingQueries: preview.originatingSeedId ? [preview.originatingQuery] : [], researchSourceDate: preview.sourceDate, researchFreshnessPolicy: preview.freshnessPolicy, researchBatchId: saveBatch.id, researchArtifactOrdinal: preview.artifactOrdinal, researchSeedIds: saveBatch.selectedSeedIds, researchSeedOverrideId: preview.seedOverrideId, researchArtifactStatus: preview.visualReviewOnly ? "visual-review-only" : "ready", researchCapturedAt: preview.captureAt, researchCapturedAtHk: preview.captureAtHk, researchRawRecovery: { kind: preview.inputKind === "screenshot" ? "screenshot" : preview.inputKind === "xlsx" ? "workbook" : "text", persisted: preview.inputKind === "screenshot" ? Boolean(dataUrl) : true, ...(preview.inputKind === "screenshot" && dataUrl ? { thumbnailDataUrl: dataUrl } : {}), reattachAction: preview.inputKind === "text" ? "paste" : "file", ...(dataUrl || preview.inputKind === "text" ? {} : { message: `Original ${preview.inputKind === "xlsx" ? "workbook" : "screenshot"} must be reattached for this exact artifact.` }) },
          };
          const queryTask = preview.researchQueryTaskId ? accumulated.researchQueryTasks.find((task) => task.id === preview.researchQueryTaskId) : undefined;
          const taskBoundArtifact = queryTask ? bindResearchArtifactToQueryTask(artifact, queryTask) : artifact;
          const exactSeedId = researchExactSeedIdForArtifact(saveBatch, taskBoundArtifact);
          const exactSeed = saveBatch.seedLedger.find((seed) => seed.id === exactSeedId);
          const rows = preview.visualReviewOnly ? [] : preview.parsedRows.map((raw, rowIndex) => normalizeResearchResultRow({ round: activeResearchRound, batch: saveBatch, artifact: taskBoundArtifact, queryTask, originatingSeedId: exactSeedId, originatingQuery: queryTask?.query ?? exactSeed?.query ?? preview.originatingQuery, raw, freshnessPolicy: preview.freshnessPolicy, ocrOnly: preview.ocrOnly, fieldConfirmations: preview.fieldConfirmations[String(rowIndex)] ?? [] }));
          const saveBase = accumulated.researchRounds.some((round) => round.id === activeResearchRound.id) ? accumulated : { ...accumulated, researchRounds: [activeResearchRound, ...accumulated.researchRounds] };
          const batch = saveBase.researchBatches.find((item) => item.id === saveBatch.id) ?? saveBatch;
          const saved = saveResearchResultBatch(saveBase, { round: activeResearchRound, batch, artifact: taskBoundArtifact, rows, attemptedFileOrSource: preview.fileName });
          accumulated = saved.state;
          savedIds.add(preview.id);
        } catch (error) {
          failedIds.add(preview.id);
          setPreviewItems((current) => current.map((item) => item.id === preview.id ? { ...item, artifactStatus: "retry-needed", error: error instanceof Error ? error.message : "Save failed for this item. Retry without re-entering metadata." } : item));
        }
      }
      if (!savedIds.size) {
        setPreviewItems((current) => current.map((item) => failedIds.has(item.id) ? { ...item, artifactStatus: "retry-needed", error: item.error ?? "Correct this exact item, then retry saving it. No research round or row was saved." } : item));
        announce("No Research Batch item was saved. Correct the visible source date, seed mapping, or original-file recovery action; nothing was persisted.");
        return;
      }
      const persisted = await persistResearchStateAfterImmediatePublish(accumulated, publishFailClosedResearchState, saveOperationsState);
      if (!persisted) {
        announce("IndexedDB save failed. Owner input and all parsed previews remain editable in this session for retry; Listing Brief stays locked.");
        return;
      }
      window.dispatchEvent(new CustomEvent("etsy-operations-updated", { detail: { state: accumulated } }));
      setPreviewItems((current) => current.filter((item) => !savedIds.has(item.id)).map((item) => failedIds.has(item.id) ? { ...item, error: item.error ?? (item.needsOriginalBytes && !previewFilesRef.current[item.id] ? "Reattach the original screenshot before save; its parsed text and metadata were preserved." : "Save failed for this item. Retry it without re-entering the metadata.") } : item));
      announce(`${savedIds.size} item(s) saved; ${failedIds.size} item(s) retained for retry. Exact duplicates add only an audit event.`);
    } catch {
      publishFailClosedResearchState(accumulated);
      announce("Research save failed. Owner input and all parsed previews remain editable in this session for retry; Listing Brief stays locked.");
    } finally {
      saveBusyRef.current = false;
      setSaveBusy(false);
    }
  }

  async function reattachSavedResearchArtifact(artifact: EvidenceArtifact, file: File) {
    if (!state) return;
    try {
      const dataUrl = await fileDataUrl(file);
      const next = {
        ...state,
        artifacts: state.artifacts.map((item) => item.id !== artifact.id ? item : {
          ...item,
          dataUrl,
          researchRawRecovery: {
            ...(item.researchRawRecovery ?? { kind: "screenshot" as const, reattachAction: "file" as const }),
            persisted: true,
            thumbnailDataUrl: dataUrl,
            message: undefined,
          },
          researchArtifactStatus: item.researchArtifactStatus === "raw-reattach-required" ? "saved" as const : item.researchArtifactStatus,
        }),
      };
      await commit(next, `${artifact.fileName} raw visual source was reattached to this exact artifact.`);
    } catch {
      announce(`Could not reattach ${artifact.fileName}. Its exact metadata and sibling artifacts remain unchanged.`);
    }
  }

  async function reviewResearchRound() {
    if (!state || !activeResearchRound || !activeResearchContext) return;
    if (!state.researchRounds.some((round) => round.id === activeResearchRound.id)) {
      const action = "Save this valid Research Batch before Coach review.";
      setCoachDraftBlocker(action);
      setPreviewFocusPending(true);
      announce(`${action} Draft previews remain editable and Listing Brief stays locked.`);
      return;
    }
    if (!state.researchBatches.some((batch) => batch.roundId === activeResearchRound.id && batch.designId === activeResearchContext.designId && batch.productId === activeResearchContext.productId && batch.seedVersion === activeResearchContext.seedVersion)) {
      const action = "Save this valid Research Batch before Coach review.";
      setCoachDraftBlocker(action);
      setPreviewFocusPending(true);
      announce(`${action} No conclusion was written.`);
      return;
    }
    setCoachDraftBlocker("");
    const exactRows = researchRowsForContext(state.researchResultRows, activeResearchContext);
    const opportunity = deriveResearchOpportunity(exactRows);
    const legacyConclusion = buildResearchCoachConclusion({ round: activeResearchRound, rows: state.researchResultRows, buyerOccasionFit, productFit, opportunity });
    const nextAdaptiveAction = activeQueryTasks.length ? deriveAdaptiveResearchAction({ round: activeResearchRound, tasks: state.researchQueryTasks, rows: state.researchResultRows, conclusion: legacyConclusion, gapAnalysis: latestGapAnalysis }) : undefined;
    const conclusion = nextAdaptiveAction ? {
      ...legacyConclusion,
      decision: nextAdaptiveAction.persistedDecision,
      nextAction: nextAdaptiveAction.nextAction,
      blockingTruth: nextAdaptiveAction.actionKind === "close-research" ? legacyConclusion.blockingTruth : [...new Set([...legacyConclusion.blockingTruth, nextAdaptiveAction.blockingInput ?? nextAdaptiveAction.reasonCodes[0]])],
      reviewSignal: nextAdaptiveAction.actionKind === "close-research" ? "Review the exact owner gate; no automatic transition occurs." : nextAdaptiveAction.actionKind === "propose-gap-round" ? "Review the proposal and explicitly select the next anchors; no round exists yet." : "Review after the first named missing input is corrected.",
    } : legacyConclusion;
    const status = conclusion.decision === "next-round" ? "next-round-needed" as const : "conclusion-ready" as const;
    const fitReview = { buyerOccasionFit, productFit, reviewedBy: "owner" as const, reviewedAt: conclusion.createdAt };
    await commit({ ...state, researchRounds: state.researchRounds.map((round) => round.id === activeResearchRound.id ? { ...round, conclusion, fitReview, ...(nextAdaptiveAction ? { adaptiveAction: nextAdaptiveAction } : {}), status, updatedAt: conclusion.createdAt } : round) }, `Coach conclusion: ${conclusion.decision}. ${nextAdaptiveAction ? `Adaptive action: ${nextAdaptiveAction.actionKind}.` : ""} One next action is shown for this exact round.`);
  }

  async function approveActiveResearchRound() {
    if (!state || !activeResearchContext || !activeResearchRound || activeResearchRound.conclusion?.decision !== "retain") return;
    if (!window.confirm(`Approve ${selectedDesign?.name ?? activeResearchContext.designId} Round ${activeResearchRound.roundNumber} (${activeResearchContext.seedVersion}) for Listing Brief?`)) return;
    try { await commit(approveResearchRound(state, activeResearchContext), "Exact research context approved. Listing Brief is unlocked only for this design, product, round and seed version."); }
    catch (error) { announce(error instanceof Error ? error.message : "This exact research round cannot be approved yet."); }
  }

  async function startNextResearchRound() {
    if (!state || !selectedDesignId || !selectedProduct) return;
    const hasUnsavedPreview = previewItems.some((preview) => preview.context.designId === selectedDesignId && preview.context.productId === selectedProduct.id && preview.context.roundId === activeResearchRound?.id);
    if (hasUnsavedPreview) {
      setCoachDraftBlocker("Save or discard the current editable Research Batch before opening a new round.");
      setPreviewFocusPending(true);
      announce("Save or discard the current editable Research Batch before opening a new round. Listing Brief stays locked.");
      return;
    }
    if (activeQueryTasks.length > 0) {
      if (adaptiveAction?.actionKind !== "propose-gap-round" || latestGapAnalysis?.status !== "proposal-ready") {
        announce("A valid owner-reviewable gap proposal is required before opening the next adaptive round.");
        return;
      }
      if (selectedGapCandidateIds.length < 5 || selectedGapCandidateIds.length > 8) {
        announce("Select 5–8 ranked gap candidates as the next round's frozen Bulk anchors.");
        return;
      }
      if (!window.confirm(`Approve these ${selectedGapCandidateIds.length} gap anchors and create isolated Round ${nextResearchRoundNumber}? No Individual task or Etsy action will be created.`)) return;
      try {
        const round = createAdaptiveNextResearchRound(state, {
          id: `draft-${selectedDesignId}-${selectedProduct.id}-${nextResearchRoundNumber}`,
          sourceRoundId: activeResearchRound?.id ?? "",
          gapAnalysisId: latestGapAnalysis.id,
          selectedGapCandidateIds,
          ownerApprovedBy: "owner",
        });
        await commit({ ...state, researchRounds: [round, ...state.researchRounds] }, `Round ${round.roundNumber} created from ${selectedGapCandidateIds.length} explicitly owner-approved gap anchors. Listing Brief is relocked; no Individual task was created.`, true);
        setActiveRoundId(round.id);
        setSelectedGapCandidateIds([]);
      } catch (error) {
        announce(error instanceof Error ? error.message : "The adaptive next round could not be created.");
      }
      return;
    }
    const round = createNextResearchRound(state, { id: `draft-${selectedDesignId}-${selectedProduct.id}-${nextResearchRoundNumber}`, designId: selectedDesignId, productId: selectedProduct.id });
    await commit({ ...state, researchRounds: [round, ...state.researchRounds] }, `Round ${nextResearchRoundNumber} saved as the latest working round. Listing Brief is relocked immediately; earlier approvals remain historical only.`, true);
    setActiveRoundId(round.id);
  }

  async function copyResearchTask() {
    if (!state || !selectedDesignId) return;
    if (!savedLoop) await commit({ ...state, keywordResearchLoops: [{ ...activeLoop, updatedAt: new Date().toISOString() }, ...state.keywordResearchLoops] }, `Round ${activeLoop.round} research list copied. Paste it into the ${source === "everbee" ? "EverBee" : "eRank"} bulk keyword tool, then return with a CSV or screenshot.`);
    try { await copyText(activeLoop.queries.join("\n")); announce(`Round ${activeLoop.round} research list copied.`); }
    catch { announce("Clipboard permission is unavailable. Select the visible keyword list and copy it manually."); }
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
    await commit({ ...state, keywordResearchLoops: [next, ...state.keywordResearchLoops.filter((item) => item.designId !== selectedDesignId)] }, verdictStage === "need-deeper-research" ? `Codex requested Round ${next.round}.` : "Codex keyword conclusion saved.");
    setVerdictNote(""); setNextQueries(""); setPrimaryKeyword(""); setSupportingKeywords(""); setAvoidKeywords("");
  }

  function acceptLegacyPastedScreenshot(event: ClipboardEvent<HTMLDivElement>) {
    const image = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));
    if (!image) { announce("No image was found in the clipboard. Copy a screenshot first, then press Ctrl+V here."); return; }
    setLegacyFile(new File([image], researchPastedScreenshotFileName(image.type), { type: image.type }));
    announce("Screenshot pasted into the legacy evidence flow. Save it after checking source and date.");
  }

  async function saveResearchEvidence() {
    if (!state || !selectedProduct || !legacyFile || !researchDate) { announce("Choose a source, research date and one CSV/XLSX or screenshot first."); return; }
    try {
      const isImage = legacyFile.type.startsWith("image/");
      const parsed = isImage ? { rows: null, headers: [], metrics: [], contentText: "" } : await parseWorkbook(await legacyFile.arrayBuffer());
      const artifact: EvidenceArtifact = { id: createId("keyword-evidence"), kind: "keyword-research", source, authority: sourceAuthority(source), fileName: legacyFile.name, mimeType: legacyFile.type || "application/octet-stream", uploadedAt: new Date().toISOString(), periodStart: researchDate, periodEnd: researchDate, targetType: "product", targetId: selectedProduct.id, ownerConfirmed: false, ocrStatus: isImage ? "pending" : "not-needed", ...parsed, dataUrl: await fileDataUrl(legacyFile) };
      await commit({ ...state, artifacts: [artifact, ...state.artifacts] }, `${legacyFile.name} saved locally. Check its source and date, then press Confirm.`);
      setLegacyFile(null);
    } catch { announce("This file could not be read. Retry, reattach, or use CSV/XLSX/PNG/JPG without losing the selected owner context."); }
  }

  async function copyOriginalScreenshotForCodex(artifact: EvidenceArtifact) {
    if (!artifact.dataUrl) { announce("This dashboard copy has no image data. Reattach the original screenshot."); return; }
    try {
      const response = await fetch(artifact.dataUrl);
      const image = await response.blob();
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Image clipboard unavailable");
      await navigator.clipboard.write([new ClipboardItem({ [image.type || artifact.mimeType || "image/png"]: image })]);
      announce("Original screenshot copied for Codex visual review only.");
    } catch { announce("This browser could not copy the image. Reattach or paste the original into Codex."); }
  }

  async function runOcr(artifact: EvidenceArtifact, confirmAfterOcr = false) {
    if (!state || !artifact.dataUrl) { announce("This screenshot has no local image data. Reattach it before retrying OCR."); return; }
    announce("Reading screenshot locally…");
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      let text = "";
      try {
        let prepared = artifact.dataUrl;
        try { prepared = await enhanceScreenshotForOcr(artifact.dataUrl); } catch { /* Preserve original. */ }
        text = (await worker.recognize(prepared)).data.text.trim();
      } finally { await worker.terminate(); }
      const metrics = Array.from(text.matchAll(/([A-Za-z][A-Za-z ]{1,30})\s*[:\-]\s*([$%\d,.]+)/g)).map((match) => { const value = Number(match[2].replace(/[$,%\s,]/g, "")); return { label: match[1].trim(), value: Number.isFinite(value) ? value : null, status: !Number.isFinite(value) ? "invalid" as const : value === 0 ? "confirmed-zero" as const : "confirmed" as const }; });
      const next = { ...artifact, ownerConfirmed: confirmAfterOcr, contentText: text.slice(0, 25000), metrics, ocrStatus: text ? (confirmAfterOcr ? "confirmed" as const : "pending" as const) : "unreadable" as const };
      await commit({ ...state, artifacts: state.artifacts.map((item) => item.id === artifact.id ? next : item) }, text ? "OCR completed. Review the extracted text." : "OCR unreadable. The screenshot remains visual-review evidence only.");
    } catch {
      await commit({ ...state, artifacts: state.artifacts.map((item) => item.id === artifact.id ? { ...item, ownerConfirmed: confirmAfterOcr || item.ownerConfirmed, contentText: "", metrics: [], ocrStatus: "unreadable" as const } : item) }, "OCR failed locally. The screenshot remains available for visual review or retry.");
    }
  }

  async function confirmEvidence(id: string) {
    if (!state) return;
    const artifact = state.artifacts.find((item) => item.id === id);
    if (!artifact) return;
    if (artifact.mimeType.startsWith("image/") && !artifact.contentText?.trim()) { await runOcr(artifact, true); return; }
    await commit({ ...state, artifacts: state.artifacts.map((item) => item.id === id ? { ...item, ownerConfirmed: true, ocrStatus: item.ocrStatus === "pending" ? "confirmed" : item.ocrStatus } : item) }, "Research evidence confirmed for the legacy packet.");
  }

  async function withdrawConfirmation(id: string) { if (state) await commit({ ...state, artifacts: state.artifacts.map((item) => item.id === id ? { ...item, ownerConfirmed: false } : item) }, "Confirmation withdrawn; the file remains available."); }
  async function removeEvidence(id: string) { if (!state) return; const artifact = state.artifacts.find((item) => item.id === id); if (!artifact || !window.confirm(`Remove ${artifact.fileName} from this local dashboard?`)) return; await commit({ ...state, artifacts: state.artifacts.filter((item) => item.id !== id) }, "Local dashboard copy removed; the original file was not changed."); }

  function acceptPastedScreenshot(event: ClipboardEvent<HTMLDivElement>) {
    const image = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));
    if (!image) { setNotice("No image was found in the clipboard. Copy a screenshot first, then press Ctrl+V here."); return; }
    const pasted = new File([image], researchPastedScreenshotFileName(image.type), { type: image.type });
    setResearchFiles((current) => [...current, pasted]);
    setLastPastedScreenshotName(pasted.name);
    announce("Screenshot pasted into Results Inbox. Review the adjacent confirmation, then create an editable preview.");
  }

  if (!state) return null;

  const screenshotCount = researchFiles.filter((file) => file.type.startsWith("image/")).length;
  const pasteScreenshotConfirmation = lastPastedScreenshotName
    ? `Screenshot pasted: ${lastPastedScreenshotName}. ${screenshotCount} screenshot${screenshotCount === 1 ? "" : "s"} selected.`
    : "No screenshot pasted yet. Focus the screenshot paste target above, then press Ctrl+V.";
  const structuredPreviewIds = new Set(previewItems.filter((item) => !item.visualReviewOnly && !item.error).map((item) => item.id));
  const coachNextAction = listingBriefEligible
    ? "Exact research context is already owner-approved. Review or copy the current local Listing Brief."
    : activeResearchRound?.conclusion?.nextAction ?? "Review this exact round after eligible evidence is saved.";
  const coachReviewSignal = listingBriefEligible
    ? "Owner approval is complete for this exact design, product, round and seed version."
    : activeResearchRound?.conclusion?.reviewSignal ?? "Review the exact context after the Coach conclusion is recorded.";

  return <section className="rounded-[26px] border border-brand/25 bg-panel p-5 shadow-card sm:p-6" aria-label="Keyword Research Workspace">
    {toast && <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-50 flex max-w-[min(26rem,calc(100vw-2rem))] items-start gap-3 rounded-2xl border border-[#B9D7C0] bg-white p-4 shadow-xl"><CheckCircle2 size={20} className="mt-0.5 shrink-0 text-sage" aria-hidden="true" /><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-sage">Dashboard received it</p><p className="mt-1 text-sm font-semibold text-ink">{toast}</p></div><button type="button" onClick={() => setToast(null)} aria-label="Close confirmation" className="ml-1 rounded-md p-1 text-muted hover:bg-[#F8EDE4] hover:text-ink"><X size={16} /></button></div>}
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div><div className="flex items-center gap-2 text-brand"><SearchCheck size={18} /><span className="text-xs font-semibold uppercase tracking-[0.16em]">Keyword research data intake</span></div><h3 className="mt-2 font-display text-2xl font-bold text-ink">Upload the export or screenshot; let Codex do the keyword work</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">No spreadsheet-style manual entry is required. The design selection only tells us which product and customer intent this research belongs to.</p></div>
      <label className="min-w-64 text-xs font-semibold text-ink">Working design record<select value={selectedDesignId} onChange={(event) => { if (controlledDesignId !== undefined) onSelectDesign?.(event.target.value); else setLocalDesignId(event.target.value); }} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal">{state.designs.filter((item) => !item.archivedAt).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </div>
    {activeResearchRound && <div className="mt-4 rounded-xl border border-brand/25 bg-[#FFF9F3] px-4 py-3" aria-label="Current research focus"><p className="text-xs font-bold uppercase tracking-[0.12em] text-brand">Current research focus · {researchFocusLabelForRound(activeResearchRound)}</p><p className="mt-1 text-xs leading-5 text-muted">今輪研究以 Round {activeResearchRound.roundNumber} 嘅 frozen inputs 為準；Working design record 只用作 exact lineage 綁定，唔會決定 keyword lane，亦唔會將 Mom 等其他設計方向混入今輪。</p></div>}
    <div role="status" className="mt-4 rounded-xl border border-sage/25 bg-[#E8F0E6] px-4 py-3 text-xs font-semibold text-sage">{notice}</div>
    <details className="mt-5 rounded-2xl border border-line bg-[#FBF7F2] p-4">
      <summary className="cursor-pointer text-sm font-bold text-ink">Legacy / optional · Existing keyword loop and Research Packet</summary>
      <p className="mt-2 text-xs leading-5 text-muted">Historical delivery-before-Inbox flow only. Use it to inspect older evidence; for the current acceptance path, use the Research Results Inbox below.</p>
      <section className="mt-4 rounded-2xl border border-[#D9E7DE] bg-[#F3F8F4] p-4" aria-label="Keyword research loop">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-sage">Keyword research loop</p><h4 className="mt-1 text-lg font-bold text-ink">Round {activeLoop.round}: {loopStage}</h4><p className="mt-1 text-xs text-muted">{activeLoop.requestReason}</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-ink">{confirmed.length} confirmed evidence file{confirmed.length === 1 ? "" : "s"}</span></div>
        {loopStage === "conclusion-ready" ? <div className="mt-3 grid gap-2 md:grid-cols-3"><p className="rounded-lg bg-white p-3 text-xs"><strong>Primary:</strong> {activeLoop.primaryKeyword || "missing"}</p><p className="rounded-lg bg-white p-3 text-xs"><strong>Supporting:</strong> {activeLoop.supportingKeywords?.join(", ") || "none"}</p><p className="rounded-lg bg-white p-3 text-xs"><strong>Avoid:</strong> {activeLoop.avoidKeywords?.join(", ") || "none"}</p></div> : <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]"><pre className="whitespace-pre-wrap rounded-xl border border-[#D9E7DE] bg-white p-3 font-sans text-sm leading-6 text-ink">{activeLoop.queries.join("\n")}</pre><button type="button" onClick={() => void copyResearchTask()} className="min-h-11 rounded-xl bg-ink px-4 py-2 text-xs font-bold text-white"><Clipboard size={15} className="mr-2 inline" />{isEvidenceQualityRetry ? "Copy same terms" : `Copy Round ${activeLoop.round} list`}</button></div>}
        {confirmed.length > 0 && loopStage !== "conclusion-ready" && <details className="mt-3 rounded-xl border border-[#D9E7DE] bg-white p-3"><summary className="cursor-pointer text-xs font-bold text-ink">Record legacy Codex result</summary><div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-xs font-semibold text-ink">Result<select value={verdictStage} onChange={(event) => setVerdictStage(event.target.value as typeof verdictStage)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal"><option value="need-deeper-research">Need deeper research</option><option value="conclusion-ready">Keyword conclusion ready</option></select></label><label className="text-xs font-semibold text-ink">Codex reasoning<textarea value={verdictNote} onChange={(event) => setVerdictNote(event.target.value)} className="mt-1.5 min-h-20 w-full rounded-xl border border-line px-3 py-2" /></label>{verdictStage === "need-deeper-research" ? <label className="text-xs font-semibold text-ink md:col-span-2">Exact next queries<textarea value={nextQueries} onChange={(event) => setNextQueries(event.target.value)} className="mt-1.5 min-h-20 w-full rounded-xl border border-line px-3 py-2" /></label> : <><label className="text-xs font-semibold text-ink">Primary keyword<input value={primaryKeyword} onChange={(event) => setPrimaryKeyword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-line px-3 py-2" /></label><label className="text-xs font-semibold text-ink">Supporting keywords<textarea value={supportingKeywords} onChange={(event) => setSupportingKeywords(event.target.value)} className="mt-1.5 min-h-16 w-full rounded-xl border border-line px-3 py-2" /></label><label className="text-xs font-semibold text-ink md:col-span-2">Avoid / weak relevance<textarea value={avoidKeywords} onChange={(event) => setAvoidKeywords(event.target.value)} className="mt-1.5 min-h-16 w-full rounded-xl border border-line px-3 py-2" /></label></>}</div><button type="button" onClick={() => void recordCodexVerdict()} className="mt-3 min-h-11 rounded-xl bg-ink px-4 py-2 text-xs font-bold text-white">Save Codex result</button></details>}
      </section>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px]"><label className="text-xs font-semibold text-ink">Research source<select value={source} onChange={(event) => setSource(event.target.value as EvidenceSource)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2"><option value="erank">eRank</option><option value="everbee">EverBee</option></select></label><label className="text-xs font-semibold text-ink">Research date<input type="date" value={researchDate} onChange={(event) => setResearchDate(event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2" /></label></div>
      <div className="mt-3 grid gap-3 md:grid-cols-3"><label className="rounded-xl border border-line bg-white p-3 text-center text-sm font-bold"><span className="flex min-h-11 cursor-pointer items-center justify-center gap-2"><FileSpreadsheet size={17} />Upload CSV / XLSX<input className="sr-only" type="file" accept=".csv,.tsv,.xlsx,.xls" onChange={(event) => setLegacyFile(event.target.files?.[0] ?? null)} /></span><span className="mt-1 block text-[11px] font-normal leading-4 text-muted">Legacy evidence flow: saves into Research files for this design.</span></label><label className="rounded-xl border border-line bg-white p-3 text-center text-sm font-bold"><span className="flex min-h-11 cursor-pointer items-center justify-center gap-2"><Image size={17} />Upload screenshot<input className="sr-only" type="file" accept="image/png,image/jpeg" onChange={(event) => setLegacyFile(event.target.files?.[0] ?? null)} /></span><span className="mt-1 block text-[11px] font-normal leading-4 text-muted">Legacy Upload screenshot → save, Confirm/OCR, then use the Research Packet. It does not create a Results Inbox preview.</span></label><div tabIndex={0} onPaste={acceptLegacyPastedScreenshot} className="min-h-11 rounded-xl border border-dashed border-brand/40 bg-white px-4 py-3 text-center text-sm font-bold outline-none focus:ring-2 focus:ring-brand"><Clipboard size={17} className="mr-2 inline" />Paste screenshot target<div className="mt-1 text-[11px] font-normal leading-4 text-muted">Legacy paste target → the same Research Packet evidence flow. Focus here, then press Ctrl+V.</div></div></div>
      <div className="mt-3 flex flex-wrap items-center gap-3"><span className="text-xs text-muted">{legacyFile ? `Selected: ${legacyFile.name}` : "No legacy-flow file selected"}</span><button type="button" disabled={!legacyFile} onClick={() => void saveResearchEvidence()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"><Upload size={14} />Save research evidence</button></div>
      <div className="mt-4 rounded-xl border border-line bg-white p-3"><h4 className="text-sm font-bold text-ink">Research files for this design</h4>{evidence.length ? <ul className="mt-3 space-y-2">{evidence.map((item) => { const usable = isUsableResearchEvidence(item); const needsOcr = item.mimeType.startsWith("image/") && !item.contentText?.trim() && item.ocrStatus !== "unreadable"; const visualOnly = item.mimeType.startsWith("image/") && item.ownerConfirmed && item.ocrStatus === "unreadable"; return <li key={item.id} className="rounded-lg border border-line bg-[#FBF7F2] p-3 text-xs"><div><strong>{item.fileName}</strong> · {usable ? "ready" : visualOnly ? "visual review only" : needsOcr ? "ready to OCR" : "awaiting confirmation"}</div>{item.contentText && <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-2 font-sans">{item.contentText.slice(0, 4000)}</pre>}<div className="mt-2 flex flex-wrap gap-2">{needsOcr && <button type="button" onClick={() => void (item.ownerConfirmed ? runOcr(item, true) : confirmEvidence(item.id))} className="min-h-11 rounded-lg bg-[#E8F0E6] px-3 py-2 font-bold text-sage"><ScanText size={13} className="mr-1 inline" />{item.ownerConfirmed ? "Run confirmed OCR" : "Confirm & run OCR"}</button>}{visualOnly && <button type="button" onClick={() => void copyOriginalScreenshotForCodex(item)} className="min-h-11 rounded-lg border border-line px-3 py-2 font-bold">Copy original screenshot</button>}{usable && <button type="button" onClick={() => void withdrawConfirmation(item.id)} className="min-h-11 rounded-lg border border-line px-3 py-2 font-bold"><Undo2 size={13} className="mr-1 inline" />Withdraw</button>}{!usable && !needsOcr && !visualOnly && <button type="button" onClick={() => void confirmEvidence(item.id)} className="min-h-11 rounded-lg bg-[#E8F0E6] px-3 py-2 font-bold text-sage">Confirm</button>}<button type="button" onClick={() => void removeEvidence(item.id)} className="min-h-11 rounded-lg px-3 py-2 font-bold text-brand"><Trash2 size={13} className="mr-1 inline" />Remove</button></div></li>; })}</ul> : <p className="mt-2 text-xs text-muted">No keyword-research file is linked yet.</p>}</div>
      <div className={`mt-3 rounded-xl border p-3 ${gaps.length ? "border-copper/25 bg-[#F9EEE4]" : "border-sage/25 bg-[#E8F0E6]"}`}><p className="text-xs font-bold text-ink">{gaps.length ? "Research Packet still has evidence gaps" : "Research Packet ready for Codex"}</p>{gaps.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-muted">{gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>}</div>
      <button type="button" disabled={packetEvidence.length === 0 || !stageRequest} onClick={() => void copyActiveStagePacket()} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"><Clipboard size={15} />Copy Codex Research Packet · current stage</button>
    </details>
    <section className="mt-5 min-w-0 rounded-2xl border border-[#D9E7DE] bg-[#F3F8F4] p-4" aria-label="Product Development Research Results Inbox" data-browser-matrix="1280x720 768x1024 390x844">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-sage">Primary acceptance path · Research Results Inbox</p><h4 className="mt-1 text-lg font-bold text-ink">Research focus · {researchFocusLabelForRound(activeResearchRound)} </h4><p className="mt-1 text-xs leading-5 text-muted">Exact design record: {selectedDesign?.name ?? "Choose design"} · {selectedProduct?.name ?? "linked product missing"}. 今次主要用呢個入口：Add research results → Create editable preview → Save reviewed structured preview。eRank 同 EverBee 係 supplemental signals；Etsy Stats 先係 performance truth。</p></div>
        <div className="flex flex-wrap gap-2"><label className="text-xs font-semibold text-ink">Active round<select value={activeResearchRound?.id ?? ""} onChange={(event) => setActiveRoundId(event.target.value)} className="mt-1 block min-h-11 rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal">{savedResearchRounds.map((round) => <option key={round.id} value={round.id}>Round {round.roundNumber} · {round.status}</option>)}{activeResearchRound && !savedResearchRounds.some((round) => round.id === activeResearchRound.id) && <option value={activeResearchRound.id}>Round {activeResearchRound.roundNumber} · draft-preview</option>}</select></label><button type="button" disabled={activeQueryTasks.length > 0} onClick={startNextResearchRound} className="min-h-11 self-end rounded-xl border border-line bg-white px-3 py-2 text-xs font-bold text-ink hover:bg-[#F8EDE4] disabled:cursor-not-allowed disabled:opacity-50">{activeQueryTasks.length > 0 ? "Use approved gap anchors below" : "New round"}</button></div>
      </div>
      {activeResearchRound && <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]"><div className="rounded-xl border border-[#D9E7DE] bg-white p-3"><div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-[#E8F0E6] px-2.5 py-1 font-bold text-sage">Round {activeResearchRound.roundNumber}</span><span className="rounded-full bg-[#FBF7F2] px-2.5 py-1 font-bold text-ink">{activeResearchRound.seedVersion}</span><span className="rounded-full bg-[#FBF7F2] px-2.5 py-1 font-bold text-ink">{activeResearchRound.status}</span></div><ol className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{activeInputLedger.map((input) => <li key={input.id} className="rounded-lg border border-line bg-[#FBF7F2] px-3 py-2 text-xs font-semibold text-ink">{input.ordinal}. {input.query}</li>)}</ol><p className="mt-2 text-[11px] text-muted">Frozen research inputs only — no alternate generation and no title/tag rewrite.</p></div><div className={`rounded-xl border px-4 py-3 text-xs font-bold ${listingBriefEligible ? "border-sage/30 bg-[#E8F0E6] text-sage" : "border-copper/30 bg-[#FFF9F3] text-copper"}`}>Listing Brief: {listingBriefEligible ? "unlocked for this exact context" : "locked"}</div></div>}
      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2" aria-label="Adaptive research funnel" data-responsive-primary-path="selection task-copy task-upload recovery coach">
        <fieldset className="rounded-xl border border-[#D9E7DE] bg-white p-3" disabled={activeQueryTasks.length > 0}><legend className="px-1 text-xs font-bold text-sage">1 · Bulk intent anchors</legend><p className="mt-1 text-xs text-muted">Run all {activeIntentAnchors.length} ordered anchors, then the owner selects exactly 3–5 Individual queries.</p><div className="mt-3 grid gap-2">{activeIntentAnchors.map((anchor) => <label key={anchor.id} className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-ink"><input type="checkbox" checked={selectedIndividualAnchorIds.includes(anchor.id)} onChange={(event) => setSelectedIndividualAnchorIds((current) => event.target.checked ? [...current, anchor.id] : current.filter((id) => id !== anchor.id))} /><span><strong>{anchor.ordinal}. {anchor.query}</strong><span className="block text-muted">{anchor.intentDimensionId}</span></span></label>)}</div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void copyActiveStagePacket()} className="min-h-11 rounded-xl border border-line px-3 py-2 text-xs font-bold text-ink">Copy Bulk packet</button><button type="button" disabled={selectedIndividualAnchorIds.length < 3 || selectedIndividualAnchorIds.length > 5 || activeQueryTasks.length > 0} onClick={() => void createIndividualTasks()} className="min-h-11 rounded-xl bg-ink px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Create {selectedIndividualAnchorIds.length} Individual tasks</button></div></fieldset>
        <section className="min-w-0 rounded-xl border border-[#D9E7DE] bg-white p-3" aria-label="Individual query tasks"><h5 className="text-xs font-bold text-sage">2 · Individual query tasks</h5><p className="mt-1 text-xs text-muted">Each upload target is bound by stable task ID, not filename or upload order.</p>{activeQueryTasks.length ? <ol className="mt-3 space-y-2">{activeQueryTasks.map((task) => <li key={task.id} className={`min-w-0 overflow-hidden rounded-lg border p-3 text-xs ${task.id === activeQueryTaskId ? "border-sage bg-[#F3F8F4]" : "border-line"}`}><p className="break-words font-bold text-ink">{task.selectedOrdinal}. {task.query}</p><p className="mt-1 break-all text-muted">{task.intentDimensionId} · {task.status} · {task.id}</p>{task.error && <p role="alert" aria-live="assertive" className="mt-1 text-brand">{task.error}</p>}<div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap"><button type="button" aria-label={`Copy Individual stage packet for ${task.query}`} onClick={() => void copyIndividualTaskPacket(task)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-3 py-2 font-bold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"><Clipboard size={14} className="mr-1" />Copy query packet</button><label aria-label={`Choose files for Individual query ${task.query}`} className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-line bg-white px-3 py-2 font-bold text-ink focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand">Choose files for this task<input className="sr-only" type="file" multiple accept=".csv,.tsv,.xlsx,.xls,image/png,image/jpeg" onChange={(event) => void activateTaskUpload(task, Array.from(event.target.files ?? []))} /></label></div></li>)}</ol> : <p className="mt-3 text-xs text-muted">No task exists until the owner selects 3–5 anchors.</p>}</section>
      </div>
      <div className="mt-4 rounded-xl border border-[#D9E7DE] bg-white p-3 text-xs text-muted"><strong className="text-ink">Merged decision view:</strong> {mergedResearchRows.length} unique phrase(s), {activeResultRows.length} lineage-preserving row(s). Raw history remains below.</div>
    </section>

    <section className="mt-5 rounded-2xl border border-line bg-[#FBF7F2] p-4" aria-label="Add research results">
      <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-brand">Add research results</p><h4 className="mt-1 font-semibold text-ink">Preview before save</h4><p className="mt-1 text-xs text-muted">Context switches and reload preserve parsed preview rows/text plus metadata in sessionStorage. Original screenshot bytes need reattachment only when required.</p></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2"><label className="text-xs font-semibold text-ink">Source<select value={source} onChange={(event) => setSource(event.target.value as EvidenceSource)} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal"><option value="erank">eRank</option><option value="everbee">EverBee</option></select></label><label className="text-xs font-semibold text-ink">Editable source date<input type="text" value={researchDate} onChange={(event) => setResearchDate(event.target.value)} placeholder="YYYY-MM-DD" className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" /><span className="mt-1 block font-normal text-muted">Prefilled from the automatic Hong Kong import/capture day; it is not a claim about the original measurement date. Blank, malformed, or future values remain editable but cannot save.</span></label></div>
      <fieldset className="mt-3 rounded-xl border border-line bg-white p-3"><legend className="px-1 text-xs font-bold text-ink">Research Batch · select one or more frozen inputs</legend><p className="mb-2 text-[11px] text-muted">One Results Inbox batch shares this exact context. With more than one inherited input, choose a per-artifact override below before rows can become eligible.</p><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{activeInputLedger.map((input) => <label key={input.id} className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-2 py-2 text-xs font-semibold text-ink"><input type="checkbox" checked={selectedSeedIds.includes(input.id)} onChange={(event) => setSelectedSeedIds((current) => event.target.checked ? [...current, input.id] : current.filter((id) => id !== input.id))} />{input.ordinal}. {input.query}</label>)}</div></fieldset>
      <label className="mt-3 flex min-h-11 items-center gap-2 text-xs font-semibold text-ink"><input type="checkbox" checked={freshnessPolicyEnabled} onChange={(event) => setFreshnessPolicyEnabled(event.target.checked)} />Apply an explicit owner freshness policy</label>
      {freshnessPolicyEnabled && <div className="grid gap-3 md:grid-cols-3"><label className="text-xs font-semibold text-ink">Maximum age (days)<input value={freshnessMaxAgeDays} onChange={(event) => setFreshnessMaxAgeDays(event.target.value)} inputMode="numeric" className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" /></label><label className="text-xs font-semibold text-ink">Policy basis<input value={freshnessBasis} onChange={(event) => setFreshnessBasis(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" /></label><label className="text-xs font-semibold text-ink">Effective date<input type="text" value={freshnessEffectiveDate} onChange={(event) => setFreshnessEffectiveDate(event.target.value)} placeholder="YYYY-MM-DD" className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" /></label></div>}
      <label className="mt-3 block text-xs font-semibold text-ink">Paste eRank/EverBee CSV-style text<textarea value={pastedText} onChange={(event) => setPastedText(event.target.value)} placeholder="Keyword,Search Volume,Competition,Trend,Relevance" className="mt-1.5 min-h-28 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal" /></label>
      <div className="mt-3 grid gap-3 md:grid-cols-3"><label className="rounded-xl border border-line bg-white p-3 text-center text-sm font-bold text-ink hover:bg-[#F8EDE4]"><span className="flex min-h-11 cursor-pointer items-center justify-center gap-2"><FileSpreadsheet size={17} />Add mixed files<input className="sr-only" multiple type="file" accept=".csv,.tsv,.xlsx,.xls,image/png,image/jpeg" onChange={(event) => { setResearchFiles(Array.from(event.target.files ?? [])); setLastPastedScreenshotName(""); }} /></span><span className="mt-1 block text-[11px] font-normal leading-4 text-muted">Results Inbox batch → CSV/XLSX or images, then Create editable preview.</span></label><label className="rounded-xl border border-line bg-white p-3 text-center text-sm font-bold text-ink hover:bg-[#F8EDE4]"><span className="flex min-h-11 cursor-pointer items-center justify-center gap-2"><Image size={17} />Add screenshots<input className="sr-only" multiple type="file" accept="image/png,image/jpeg" onChange={(event) => setResearchFiles((current) => [...current, ...Array.from(event.target.files ?? [])])} /></span><span className="mt-1 block text-[11px] font-normal leading-4 text-muted">Results Inbox Add screenshots → adds one or more files to this preview batch; it does not save legacy evidence.</span></label><div><div tabIndex={0} onPaste={acceptPastedScreenshot} aria-labelledby="results-inbox-paste-target-label" aria-describedby="results-inbox-paste-target-instruction results-inbox-paste-status" className="min-h-11 rounded-xl border border-dashed border-brand/40 bg-white px-4 py-3 text-center text-sm font-bold text-ink outline-none focus:ring-2 focus:ring-brand"><span id="results-inbox-paste-target-label"><Clipboard size={17} className="mr-2 inline" />Screenshot paste target</span><span id="results-inbox-paste-target-instruction" className="mt-1 block text-[11px] font-normal leading-4 text-muted">Results Inbox Paste screenshot → focus here, then press Ctrl+V to paste one clipboard image into this preview batch. Click places focus here; Enter or Space do not paste.</span></div><p id="results-inbox-paste-status" role="status" aria-live="polite" className={`mt-2 rounded-lg px-3 py-2 text-[11px] font-semibold ${lastPastedScreenshotName ? "bg-[#E8F0E6] text-sage" : "bg-white text-muted"}`}>{pasteScreenshotConfirmation}</p></div></div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><p className="text-xs text-muted">{researchFiles.length} file(s) selected. Blank, malformed, and future dates remain visible and ineligible.</p>{researchFiles.length > 0 && <button type="button" disabled={previewBatchBusy} onClick={() => { setResearchFiles([]); setLastPastedScreenshotName(""); announce("Selected research files cleared. Unsaved previews remain available until discarded."); }} className="min-h-11 rounded-lg border border-line px-3 py-2 text-xs font-bold text-ink hover:bg-[#F8EDE4] disabled:opacity-40">Clear selected files</button>}</div><button type="button" disabled={previewBatchBusy} onClick={() => void previewResearchResults()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white hover:bg-brand disabled:opacity-40"><SearchCheck size={15} />{previewBatchBusy ? `OCR/parse running · max ${RESEARCH_OCR_TIMEOUT_MS / 1000}s per screenshot…` : "Create editable preview"}</button></div>
    </section>

    {previewItems.length > 0 && <section ref={previewRegionRef} tabIndex={-1} className="mt-5 scroll-mt-4 rounded-2xl border border-copper/25 bg-[#FFF9F3] p-4 outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2" aria-label="Research results preview" aria-describedby="research-preview-next-action">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-semibold text-ink">Editable preview · not saved</h4><p className="mt-1 text-xs text-muted">IndexedDB round/result counts remain unchanged until an explicit save below.</p><p id="research-preview-next-action" className="mt-2 text-xs font-bold text-ink">Next action: {structuredPreviewIds.size > 0 ? "review the structured preview, then save the reviewed structured item(s)." : "use the single Save as visual evidence action in the terminal preview below."}</p></div>{structuredPreviewIds.size > 0 && <button type="button" disabled={saveBusy} onClick={() => void saveResearchPreviews(structuredPreviewIds)} className="min-h-11 rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40">{saveBusy ? "Saving…" : "Save reviewed structured preview"}</button>}</div>
      <ul className="mt-4 space-y-3">{previewItems.map((item) => {
        const freshness = assessResearchFreshness(item.sourceDate, item.freshnessPolicy);
        return <li key={item.id} className="rounded-xl border border-line bg-white p-3 text-xs">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold text-ink">#{item.artifactOrdinal || "?"} · {item.fileName}</p><p className="mt-1 text-muted">{item.source} · {item.sourceDate || "blank date"} · {freshness.issue ?? freshness.freshness} · {item.originatingQuery} · {item.parsedRows.length} row(s)</p><p className="mt-1 text-[11px] text-muted">Batch {item.batch?.id ?? "legacy preview"} · artifact {item.artifactId || item.id} · automatic capture {item.captureAtHk || "not available for historical preview"}</p><p className="mt-1 text-[11px] text-muted">Policy snapshot: {item.freshnessPolicy ? `${item.freshnessPolicy.basis} · ${item.freshnessPolicy.maxAgeDays} days · effective ${item.freshnessPolicy.effectiveDate}` : "not assessed"}</p></div><span className={`rounded-full px-2.5 py-1 font-bold ${item.error ? "bg-[#FFF1E8] text-brand" : item.visualReviewOnly ? "bg-[#FFF1E8] text-brand" : item.ocrOnly ? "bg-[#FFF9F3] text-copper" : "bg-[#E8F0E6] text-sage"}`}>{item.error ? "recoverable error" : item.visualReviewOnly ? "visual-review-only · 0 rows" : item.ocrOnly ? "OCR-only / field confirmation required" : item.artifactStatus ?? "ready to save"}</span></div>
          {item.inputKind === "screenshot" && item.previewDataUrl && <div className="mt-3 rounded-xl border border-line bg-[#FBF7F2] p-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-start"><img src={item.previewDataUrl} alt={`Preview of ${item.fileName}`} className="max-h-64 w-full max-w-sm rounded-lg border border-line bg-white object-contain sm:w-64" /><div><p className="font-bold text-ink">Check this screenshot before deciding</p><p className="mt-1 text-muted">{item.fileName} · {item.source} · captured {item.captureAtHk}</p><p className="mt-1 text-[11px] leading-4 text-muted">Review this exact file before Discard, Retry OCR, or Save.</p><button type="button" onClick={() => setZoomedPreviewId(item.id)} className="mt-2 min-h-11 rounded-lg border border-line px-3 py-2 font-bold text-ink">Zoom preview</button></div></div></div>}
          <div className="mt-3 grid gap-3 md:grid-cols-2"><label className="font-semibold text-ink">Editable source date<input value={item.sourceDate} onChange={(event) => setPreviewItems((current) => current.map((preview) => preview.id === item.id ? { ...preview, sourceDate: event.target.value, sourceDateWasAutomatic: false, error: undefined } : preview))} placeholder="YYYY-MM-DD" className="mt-1.5 min-h-11 w-full rounded-lg border border-line bg-white px-2 py-2 font-normal" /><span className="mt-1 block text-[11px] font-normal text-muted">{item.sourceDateWasAutomatic ? `Automatic import/capture default from ${item.captureAtHk}; amend only if the source measurement date differs.` : `Owner-amended; automatic capture remains ${item.captureAtHk}.`}</span></label><label className="font-semibold text-ink">Per-artifact seed override<select value={item.seedOverrideId ?? ""} onChange={(event) => setPreviewItems((current) => current.map((preview) => { if (preview.id !== item.id || !preview.batch) return preview; const seedOverrideId = event.target.value || undefined; const exactSeedId = researchExactSeedIdForArtifact(preview.batch, { researchSeedIds: preview.batch.selectedSeedIds, researchSeedOverrideId: seedOverrideId }); const exactSeed = preview.batch.seedLedger.find((seed) => seed.id === exactSeedId); return { ...preview, seedOverrideId, originatingSeedId: exactSeedId, originatingQuery: exactSeed?.query ?? "Unmapped until one frozen seed is selected", error: undefined }; }))} className="mt-1.5 min-h-11 w-full rounded-lg border border-line bg-white px-2 py-2 font-normal"><option value="">Use batch inheritance{item.batch && item.batch.selectedSeedIds.length > 1 ? " (rows remain unmapped)" : ""}</option>{(item.batch?.seedLedger ?? []).filter((seed) => item.batch?.selectedSeedIds.includes(seed.id)).map((seed) => <option key={seed.id} value={seed.id}>{seed.ordinal}. {seed.query}</option>)}</select><span className="mt-1 block text-[11px] font-normal text-muted">Every normalized row needs one frozen seed ID. A multi-seed inherited artifact is intentionally unmapped until you choose an override.</span></label></div>
          {item.error && <p role="alert" className="mt-2 text-brand">{item.error}</p>}
          {item.visualReviewOnly && <div role="status" className="mt-2 rounded-lg border border-brand/20 bg-[#FFF1E8] p-3 text-brand"><p className="font-bold">Terminal visual-review-only preview</p><p className="mt-1">{item.ocrLifecycle?.message ?? "No structured OCR rows are available. This screenshot can be saved only as unreadable visual evidence."}</p><p className="mt-1 text-[11px]">Filename, source, date, query, exact round context, freshness snapshot and editable raw text are preserved. Saving creates 0 normalized rows and cannot unlock Coach, Owner Gate or Listing Brief.</p><button type="button" disabled={saveBusy || Boolean(item.error) || (item.needsOriginalBytes && !previewFilesRef.current[item.id])} onClick={() => void saveResearchPreviews(new Set([item.id]))} className="mt-2 min-h-11 rounded-lg bg-ink px-3 py-2 font-bold text-white disabled:opacity-40">Save as visual evidence</button></div>}
          {item.needsOriginalBytes && !previewFilesRef.current[item.id] && <label className="mt-2 inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line px-3 py-2 font-bold text-ink">Reattach original {item.inputKind === "xlsx" ? "workbook" : "screenshot"} for artifact {item.artifactId || item.id}<input className="sr-only" type="file" accept={item.inputKind === "xlsx" ? ".xlsx,.xls" : "image/png,image/jpeg"} onChange={(event) => { const attached = event.target.files?.[0]; if (attached) { previewFilesRef.current[item.id] = attached; setPreviewItems((current) => reduceResearchPreviewRecovery(current, { type: "reattach", id: item.id }).map((preview) => preview.id === item.id ? { ...preview, artifactStatus: preview.visualReviewOnly ? "visual-review-only" : "preview" } : preview)); } }} /></label>}
          <label className="mt-3 block font-semibold text-ink">Editable raw structured text<textarea value={item.rawText} onChange={(event) => setPreviewItems((current) => current.map((preview) => preview.id === item.id ? { ...preview, rawText: event.target.value, fieldConfirmations: {} } : preview))} className="mt-1.5 min-h-32 w-full rounded-xl border border-line bg-[#FBF7F2] p-2 font-mono text-[11px] font-normal" placeholder="Keyword,Search Volume\nexample phrase,0" /></label>
          <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => reparsePreview(item)} className="min-h-11 rounded-lg border border-line px-3 py-2 font-bold text-ink">Reparse</button><button type="button" disabled={previewBusyId === item.id} onClick={() => void retryPreview(item)} className="min-h-11 rounded-lg border border-line px-3 py-2 font-bold text-ink disabled:opacity-40">{previewBusyId === item.id ? `Retrying · max ${RESEARCH_OCR_TIMEOUT_MS / 1000}s…` : item.inputKind === "screenshot" ? `Retry OCR · max ${RESEARCH_OCR_TIMEOUT_MS / 1000}s` : "Retry parse"}</button>{item.error && <button type="button" onClick={() => setPreviewItems((current) => reduceResearchPreviewRecovery(current, { type: "clear-save-error", id: item.id }))} className="min-h-11 rounded-lg border border-line px-3 py-2 font-bold text-copper">Clear save error</button>}</div>
          {item.ocrOnly && item.parsedRows.length > 0 && <div className="mt-3 rounded-xl border border-copper/25 bg-[#FFF9F3] p-3"><p className="font-bold text-ink">OCR field-level owner confirmation</p><p className="mt-1 text-muted">Confirm every parsed valid field actually supplied by this screenshot. Missing or invalid optional fields stay visible but do not create a fake confirmation.</p><ul className="mt-2 space-y-2">{item.parsedRows.map((raw, rowIndex) => <li key={`${item.id}-${rowIndex}`} className="rounded-lg border border-line bg-white p-2"><p className="font-semibold text-ink">Row {rowIndex + 1}: {String(raw.phrase || "missing phrase")}</p><div className="mt-2 flex flex-wrap gap-2">{(["phrase", "searchVolume", "competition", "trend", "relevanceScore"] as const).map((field) => { const truth = field === "phrase" ? normalizeResearchField(raw[field], "string") : normalizeResearchField(raw[field], "number"); const confirmedField = (item.fieldConfirmations[String(rowIndex)] ?? []).some((confirmation) => confirmation.field === field); return <button key={field} type="button" disabled={truth.status === "missing" || truth.status === "invalid" || confirmedField} onClick={() => confirmPreviewField(item, rowIndex, field)} className="min-h-11 rounded-lg border border-line px-3 py-2 text-left font-semibold text-ink disabled:opacity-55"><span className="block">{field}: {truth.raw || "blank"}</span><span className="block text-[10px] font-normal text-muted">{truth.status}{confirmedField ? " · owner confirmed" : ""}</span></button>; })}</div></li>)}</ul></div>}
          <button type="button" onClick={() => discardResearchPreview(item)} className="mt-2 min-h-11 rounded-lg px-3 py-2 font-bold text-brand hover:bg-[#FFF1E8]">Discard preview</button>
        </li>;
      })}</ul>
    </section>}

    <details className="mt-5 rounded-2xl border border-line bg-white p-4" aria-label="Research raw and normalized history">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-ink">Raw artifact and normalized row history · {activeResearchArtifacts.length} artifact(s), {activeResultRows.length} row(s)</summary>
    <section className="mt-5 rounded-2xl border border-line bg-white p-4" aria-label="Research Batch raw artifacts"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-semibold text-ink">Research Batch artifacts · exact active context</h4><p className="mt-1 text-xs text-muted">Stable identity, creation order, automatic capture time, raw source recovery and row status remain separate.</p></div><span className="rounded-full bg-[#FBF7F2] px-3 py-1 text-xs font-bold text-ink">{activeResearchArtifacts.length} artifact(s)</span></div>{activeResearchArtifacts.length > 0 ? <ul className="mt-4 grid gap-3 md:grid-cols-2">{activeResearchArtifacts.map((artifact) => { const raw = artifact.researchRawRecovery; const visual = artifact.mimeType.startsWith("image/"); const rawAvailable = Boolean(artifact.dataUrl || raw?.thumbnailDataUrl); return <li key={artifact.id} className="rounded-xl border border-line bg-[#FBF7F2] p-3 text-xs"><p className="font-bold text-ink">#{artifact.researchArtifactOrdinal ?? "?"} · {artifact.fileName}</p><p className="mt-1 text-muted">{artifact.researchArtifactStatus ?? "saved"} · batch {artifact.researchBatchId ?? "legacy"} · {artifact.researchCapturedAtHk ?? "capture unavailable"}</p><p className="mt-1 text-muted">Editable source date: {artifact.researchSourceDate || "blank"} · {artifact.researchSeedOverrideId ? "per-artifact override" : "batch inheritance"}</p>{visual && rawAvailable && <div className="mt-3 flex items-start gap-3"><img src={raw?.thumbnailDataUrl ?? artifact.dataUrl} alt={`Raw research screenshot: ${artifact.fileName}`} className="h-20 w-28 rounded-lg border border-line object-cover" /><button type="button" onClick={() => setZoomedResearchArtifactId(artifact.id)} className="min-h-11 rounded-lg border border-line px-3 py-2 font-bold text-ink">Zoom raw source</button></div>}{visual && !rawAvailable && <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-copper/40 bg-[#FFF9F3] px-3 py-2 font-bold text-copper">Reattach original screenshot for artifact {artifact.id}<input className="sr-only" type="file" accept="image/png,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) void reattachSavedResearchArtifact(artifact, file); }} /></label>}{visual && raw?.message && <p role="status" className="mt-2 text-brand">{raw.message}</p>}</li>; })}</ul> : <p className="mt-4 text-sm text-muted">No saved batch artifact exists for this exact design/product/round/version.</p>}</section>

    {zoomedResearchArtifact?.dataUrl && <div role="dialog" aria-modal="true" aria-label={`Zoomed raw source ${zoomedResearchArtifact.fileName}`} className="fixed inset-0 z-50 flex items-center justify-center bg-ink/75 p-4"><div className="max-h-full max-w-4xl overflow-auto rounded-xl bg-white p-3"><div className="mb-2 flex justify-end"><button type="button" onClick={() => setZoomedResearchArtifactId("")} className="min-h-11 rounded-lg border border-line px-3 py-2 text-xs font-bold text-ink">Close zoom</button></div><img src={zoomedResearchArtifact.dataUrl} alt={`Zoomed raw research screenshot: ${zoomedResearchArtifact.fileName}`} className="h-auto max-h-[80vh] w-auto max-w-full" /></div></div>}
    {previewItems.find((item) => item.id === zoomedPreviewId)?.previewDataUrl && <div role="dialog" aria-modal="true" aria-label={`Zoomed preview ${previewItems.find((item) => item.id === zoomedPreviewId)?.fileName ?? "screenshot"}`} className="fixed inset-0 z-50 flex items-center justify-center bg-ink/75 p-4"><div className="max-h-full max-w-5xl overflow-auto rounded-xl bg-white p-3"><div className="mb-2 flex items-center justify-between gap-3"><p className="text-sm font-bold text-ink">{previewItems.find((item) => item.id === zoomedPreviewId)?.fileName}</p><button type="button" onClick={() => setZoomedPreviewId("")} className="min-h-11 rounded-lg border border-line px-3 py-2 text-xs font-bold text-ink">Close zoom</button></div><img src={previewItems.find((item) => item.id === zoomedPreviewId)?.previewDataUrl} alt={`Zoomed preview ${previewItems.find((item) => item.id === zoomedPreviewId)?.fileName ?? "screenshot"}`} className="h-auto max-h-[82vh] w-auto max-w-full" /></div></div>}

    <section className="mt-5 rounded-2xl border border-line bg-white p-4" aria-label="Normalized research results"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-semibold text-ink">Normalized results · exact active context</h4><p className="mt-1 text-xs text-muted">Raw and parsed truth stay distinct from freshness, OCR, duplicate, conflict, and unmapped flags.</p></div><span className="rounded-full bg-[#FBF7F2] px-3 py-1 text-xs font-bold text-ink">{activeResultRows.length} row(s)</span></div><div className="mt-4 hidden max-w-full overflow-x-auto rounded-xl border border-line md:block"><table className="min-w-[980px] text-left text-xs"><thead className="bg-[#FBF7F2] text-muted"><tr><th className="px-3 py-2">Phrase / frozen seed</th><th className="px-3 py-2">Source / date</th><th className="px-3 py-2">Search volume</th><th className="px-3 py-2">Competition</th><th className="px-3 py-2">Trend</th><th className="px-3 py-2">Relevance</th><th className="px-3 py-2">Flags / artifact</th></tr></thead><tbody>{activeResultRows.map((row) => <tr key={row.id} className="border-t border-line align-top"><td className="px-3 py-2 font-semibold text-ink">{row.phrase.raw}<div className="mt-1 font-normal text-muted">{row.originatingQuery} · {row.originatingSeedId ?? "unmapped frozen seed"} · {row.phrase.status}</div></td><td className="px-3 py-2">{row.source}<div>{row.sourceDate || "blank"} · {row.flags.sourceDateIssue ?? row.flags.freshness}{row.flags.ageDays !== null ? ` · ${row.flags.ageDays}d` : ""}</div></td>{(["searchVolume", "competition", "trend", "relevanceScore"] as const).map((field) => <td key={field} className="px-3 py-2">{row[field].raw || "blank"}<div className="text-muted">{row[field].parsed ?? "—"} · {row[field].status}</div></td>)}<td className="px-3 py-2">{[row.flags.unmapped && "unmapped", row.flags.ocrOnly && "OCR-only", row.flags.unconfirmed && "unconfirmed", row.flags.stale && "stale", row.flags.duplicate && "duplicate", row.flags.conflicting && "conflicting"].filter(Boolean).join(", ") || "none"}<div className="mt-1 text-muted">{row.artifactId}</div></td></tr>)}</tbody></table></div><div className="mt-4 space-y-3 md:hidden">{activeResultRows.map((row) => <article key={row.id} className="rounded-xl border border-line bg-[#FBF7F2] p-3 text-xs"><h5 className="font-bold text-ink">{row.phrase.raw || "Missing phrase"}</h5><p className="mt-1 text-muted">{row.originatingQuery} · {row.originatingSeedId ?? "unmapped frozen seed"} · {row.source} · {row.sourceDate || "blank date"}</p><dl className="mt-3 grid grid-cols-2 gap-2">{(["searchVolume", "competition", "trend", "relevanceScore"] as const).map((field) => <div key={field} className="rounded-lg bg-white p-2"><dt className="font-semibold text-muted">{field}</dt><dd className="mt-1 text-ink">{row[field].raw || "blank"} · {row[field].status}</dd></div>)}</dl><p className="mt-2 text-brand">{[row.flags.unmapped && "unmapped", row.flags.ocrOnly && "OCR-only", row.flags.unconfirmed && "unconfirmed", row.flags.stale && "stale", row.flags.duplicate && "duplicate", row.flags.conflicting && "conflicting"].filter(Boolean).join(", ") || "No row flags"}</p></article>)}</div>{activeResultRows.length === 0 && <p className="mt-4 text-sm text-muted">No normalized row is saved for this exact design/product/round/version.</p>}</section>

    </details>

    <section className="mt-5 rounded-2xl border border-sage/25 bg-[#F3F8F4] p-4" aria-label="Shine Build-with-me Coach conclusion">
      {adaptiveAction && <div role="status" aria-live="polite" className="mb-4 rounded-xl border border-[#D9E7DE] bg-white p-3 text-sm"><p className="font-bold text-ink">Adaptive action · {adaptiveAction.actionKind}</p><p className="mt-1 text-xs text-muted">Persisted Coach decision: {adaptiveAction.persistedDecision} · repeat rate {(adaptiveAction.repeatRate * 100).toFixed(0)}% · coverage {adaptiveAction.coverage.filter((item) => item.covered).length}/{adaptiveAction.coverage.length}</p><p className="mt-2 text-xs font-semibold text-ink">Exactly one next action: {adaptiveAction.nextAction}</p></div>}
      {adaptiveAction?.actionKind !== "close-research" && activeQueryTasks.length > 0 && <details className="mb-4 min-w-0 rounded-xl border border-copper/25 bg-[#FFF9F3] p-3"><summary className="min-h-11 cursor-pointer py-2 text-xs font-bold text-copper">Next gap keywords · Dashboard suggestion</summary><div className="mt-3 rounded-xl border border-[#D9E7DE] bg-white p-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.12em] text-sage">1 · Suggest next 25 gap keywords</p><p className="mt-1 text-xs leading-5 text-muted">Dashboard uses this exact round, the uncovered gap, the product/recipient context, and eligible support rows to build exactly 25 raw drafts as transparent first-pass hypotheses. It does not invent eRank metrics and does not create a round or task.</p>{uncoveredResearchDimension ? <p className="mt-2 text-xs font-semibold text-ink">Current gap: {uncoveredResearchDimension.label}</p> : <p className="mt-2 text-xs font-semibold text-copper">No eligible uncovered gap is ready.</p>}</div><button type="button" disabled={!canSuggestNextGap || gapSuggestionBusy} onClick={() => void suggestNextGapKeywords()} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{gapSuggestionBusy ? "Building 25 candidates…" : latestGapAnalysis?.origin === "in-product-suggestion" ? "Suggest 25 again" : "Suggest next 25 gap keywords"}</button></div><p role="status" aria-live="polite" className="mt-3 text-xs leading-5 text-muted">{canSuggestNextGap ? "Ready: completed Individual evidence and an uncovered gap are available." : "Complete and save the exact Individual evidence first; the suggestion button will then activate."}</p></div><p className="mt-3 text-xs leading-5 text-muted">The normal path is now the button above. JSON remains only as an advanced fallback or recovery path; validation is deterministic, and fewer than 15 valid candidates yields collect-missing-input.</p><details className="mt-3 rounded-xl border border-line bg-white p-3"><summary className="min-h-11 cursor-pointer py-2 text-xs font-bold text-ink">Advanced fallback · paste 25 drafts as JSON</summary><textarea value={gapAnalysisText} onChange={(event) => setGapAnalysisText(event.target.value)} className="mt-3 min-h-32 w-full rounded-xl border border-line bg-white p-3 font-mono text-xs" aria-label="Exactly 25 raw gap candidate drafts JSON" placeholder='[{"query":"faith leader journal","targetDimension":"faith-identity","extensionLogic":"extend pastor evidence","supportingRowIds":["row-id"]}]' /><button type="button" onClick={() => void saveGapAnalysisAttempt()} className="mt-3 min-h-11 rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white">Validate fallback JSON</button></details>{latestGapAnalysis && <div className="mt-3 min-w-0 text-xs text-muted"><p>{latestGapAnalysis.origin === "in-product-suggestion" ? "Dashboard Coach suggestion" : "Fallback JSON attempt"} · {latestGapAnalysis.status} · {latestGapAnalysis.rankedCandidates.length} ranked candidate(s) · {latestGapAnalysis.rejectionAudit.rejections.length} rejection(s)</p>{latestGapAnalysis.rankedCandidates.length > 0 && <fieldset className="mt-3 rounded-xl border border-line bg-white p-3"><legend className="px-1 font-bold text-ink">Owner selection · freeze 5–8 anchors for the next round</legend><p className="mt-1 leading-5">Checking candidates creates nothing. The explicit approval button below creates one isolated round and relocks Listing Brief; Individual tasks still require a later 3–5 selection.</p><div className="mt-3 grid min-w-0 gap-2 md:grid-cols-2">{latestGapAnalysis.rankedCandidates.map((candidate) => <label key={candidate.id} className="flex min-h-11 min-w-0 items-start gap-2 rounded-lg border border-line px-3 py-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand"><input type="checkbox" checked={selectedGapCandidateIds.includes(candidate.id)} onChange={(event) => setSelectedGapCandidateIds((current) => { if (!event.target.checked) return current.filter((id) => id !== candidate.id); if (current.length >= 8) { announce("Select no more than 8 gap anchors."); return current; } return [...current, candidate.id]; })} /><span className="min-w-0 break-words"><strong className="text-ink">{candidate.query}</strong><span className="block break-all">{candidate.targetDimension} · rank {candidate.rawOrdinal}</span></span></label>)}</div><button type="button" disabled={selectedGapCandidateIds.length < 5 || selectedGapCandidateIds.length > 8} onClick={() => void startNextResearchRound()} className="mt-3 min-h-11 rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Approve {selectedGapCandidateIds.length} gap anchors and create next round</button></fieldset>}{latestGapAnalysis.rejectionAudit.rejections.length > 0 && <ul className="mt-2 list-disc break-words pl-5">{latestGapAnalysis.rejectionAudit.rejections.map((rejection) => <li key={`${rejection.rawOrdinal}-${rejection.reason}`}>Draft {rejection.rawOrdinal}: {rejection.reason}</li>)}</ul>}</div>}</details>}
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-sage">Shine Coach · Build-with-me</p><h4 className="mt-1 font-semibold text-ink">{activeResearchRound?.conclusion ? `Conclusion: ${activeResearchRound.conclusion.decision}` : "Review this exact round"}</h4></div><button type="button" onClick={() => void reviewResearchRound()} className="min-h-11 rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white">Run deterministic Coach review</button></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2"><label className="text-xs font-semibold text-ink">Buyer / occasion fit — owner review<select value={buyerOccasionFit} onChange={(event) => setBuyerOccasionFit(event.target.value as ResearchFitAssessment)} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal"><option value="missing">Missing</option><option value="weak">Weak</option><option value="supported">Supported</option></select></label><label className="text-xs font-semibold text-ink">Product fit — owner review<select value={productFit} onChange={(event) => setProductFit(event.target.value as ResearchFitAssessment)} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal"><option value="missing">Missing</option><option value="weak">Weak</option><option value="supported">Supported</option></select></label></div>
      <p className="mt-2 text-xs text-muted">Demand alone never produces Retain. Missing fit forces Next round; weak fit defers; only supported fit plus eligible opportunity can retain.</p>
      {coachDraftBlocker && <div role="alert" className="mt-3 rounded-xl border border-copper/30 bg-[#FFF9F3] p-3 text-sm text-copper"><p className="font-bold">Coach review is fail-closed</p><p className="mt-1">Exactly one next action: {coachDraftBlocker}</p></div>}
      {activeResearchRound?.conclusion && <div className="mt-4 rounded-xl border border-[#D9E7DE] bg-white p-3 text-sm"><p className="font-semibold text-ink">{activeResearchRound.conclusion.buyerProductFit}</p><p className="mt-2 text-xs text-muted">Evidence: {activeResearchRound.conclusion.evidenceBasis.join("; ") || "none eligible"}</p>{activeResearchRound.conclusion.blockingTruth.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-brand">{activeResearchRound.conclusion.blockingTruth.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}<div className="mt-3 rounded-lg bg-[#FBF7F2] p-3"><p className="text-xs font-bold text-ink">Exactly one next action</p><p className="mt-1 text-sm text-ink">{coachNextAction}</p><p className="mt-1 text-xs text-muted">Review signal: {coachReviewSignal}</p></div>{activeResearchRound.conclusion.decision === "retain" && !listingBriefEligible && <button type="button" onClick={() => void approveActiveResearchRound()} className="mt-3 min-h-11 rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white">Approve exact round for Listing Brief</button>}</div>}
      <details className="mt-4 rounded-xl border border-[#D9E7DE] bg-white p-3"><summary className="min-h-11 cursor-pointer py-2 text-xs font-bold text-ink">Round history, duplicate audit, and legacy evidence</summary><ul className="mt-2 space-y-2 text-xs text-muted">{savedResearchRounds.map((round) => <li key={round.id}>Round {round.roundNumber} · {round.seedVersion} · {round.status} · {round.artifactIds.length} artifact(s){round.fitReview ? ` · owner fit ${round.fitReview.buyerOccasionFit}/${round.fitReview.productFit}` : ""}</li>)}</ul><p className="mt-3 text-xs text-muted">Exact duplicate audit events: {state.researchDuplicateAuditEvents.length}. Raw evidence records remain: {evidence.length}.</p>{state.researchDuplicateAuditEvents.length > 0 && <ul className="mt-2 space-y-1 text-xs text-muted">{state.researchDuplicateAuditEvents.map((audit) => <li key={audit.id}>Attempted source: {audit.attemptedFileOrSource} · attempted {audit.attemptedAt} · last seen {audit.lastSeenAt} · count {audit.occurrenceCount}</li>)}</ul>}{savedLoop && <p className="mt-2 text-xs text-muted">Legacy keyword loop remains read-only: Round {savedLoop.round} · {savedLoop.queries.join(" / ")}</p>}</details>
    </section>
  </section>;
}
