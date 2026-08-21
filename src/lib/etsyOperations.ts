export type EvidenceSource = "etsy" | "erank" | "everbee" | "owner" | "instagram" | "pinterest" | "facebook" | "threads";
export type EvidenceKind = "shop-stats" | "listing-performance" | "traffic-sources" | "keyword-research" | "product-facts" | "cost-fulfilment" | "design" | "social-results";
export type EvidenceAuthority = "primary" | "supplemental" | "inference";
export type MetricStatus = "confirmed" | "confirmed-zero" | "missing" | "invalid";

export type Metric = { label: string; value: number | null; status: MetricStatus };
export type EvidenceArtifact = {
  id: string;
  kind: EvidenceKind;
  source: EvidenceSource;
  authority: EvidenceAuthority;
  fileName: string;
  mimeType: string;
  uploadedAt: string;
  periodStart: string;
  periodEnd: string;
  targetType: "shop" | "listing" | "product" | "design" | "campaign";
  targetId: string;
  ownerConfirmed: boolean;
  ocrStatus: "not-needed" | "pending" | "confirmed" | "unreadable";
  rows: number | null;
  headers: string[];
  metrics: Metric[];
  contentText?: string;
  dataUrl?: string;
  /** A read-only source reference when the owner uses a published product or supplier page instead of a file export. */
  sourceUrl?: string;
};

export function shouldRunOcrBeforeConfirm(artifact: EvidenceArtifact) {
  return artifact.mimeType.startsWith("image/")
    && artifact.ocrStatus === "pending"
    && !artifact.contentText?.trim();
}

export type Product = {
  id: string;
  name: string;
  type: string;
  material: string;
  size: string;
  productionMethod: string;
  fulfilmentSource: string;
  costSource: string;
  allowedClaims: string;
  blockedClaims: string;
  sourceNote: string;
  factsStatus?: "baseline" | "needs-update" | "confirmed-current";
  factsConfirmedAt?: string;
};

export type Design = { id: string; name: string; productId: string; recipient: string; occasion: string; mockupStatus: "missing" | "ready"; assetName: string; sourceNote?: string };
export type Listing = { id: string; title: string; protected: boolean; observationEnd?: string };
export type SellerDecisionMetric = { label: string; value: number | null; status: MetricStatus };
export type SellerMaintenanceRule = {
  id: string;
  label: string;
  coverage: "Supported" | "Partially supported" | "Not tracked";
  whenToCheck: string;
  triggerSignal: string;
  draftUpdate: string;
  requiredEvidence: string[];
  observationWindow: string;
  measurableResult: string;
};
export type SellerDecision = {
  status: "ready" | "collect-data";
  listingId: string;
  listingTitle: string;
  whatToUpdate: string;
  whenToUpdate: string;
  triggerSignal: string;
  requiredEvidence: string[];
  missingEvidence: string[];
  observationWindow: string;
  measurableResult: string;
  source: string;
  maintenanceMap: SellerMaintenanceRule[];
  signals: {
    views: SellerDecisionMetric;
    favorites: SellerDecisionMetric;
    orders: SellerDecisionMetric;
    revenue: SellerDecisionMetric;
  };
  protectedNote?: string;
};
export type EvidenceIntakeKind = "shop-stats" | "listing-performance" | "traffic-sources";
export type EvidenceIntakeStepStatus = "missing" | "review" | "confirmed" | "not-eligible";
export type EvidenceIntakeStep = {
  kind: EvidenceIntakeKind;
  label: string;
  instruction: string;
  targetLabel: string;
  status: EvidenceIntakeStepStatus;
  artifactIds: string[];
  selectedArtifactId?: string;
  detail: string;
};
export type ContentPost = { id: string; contentId: string; platform: "Instagram" | "Pinterest" | "Facebook" | "Threads"; listingId: string; publishedOn: string; assetName: string; copy: string; cta: string; url: string; impressions: string; clicks: string; saves: string; outcome: "Repeat" | "Improve" | "Stop" | "Attribution unconfirmed" };
export type OwnerGate = { id: string; subject: string; status: "draft" | "need-evidence" | "approved-for-draft"; evidenceIds: string[]; missing: string[]; nextStep: string };
export type KeywordRole = "seed" | "primary" | "supporting" | "avoid";
export type KeywordResearchStatus = "to-research" | "evidence-added" | "shortlisted" | "avoid";
export type KeywordResearch = { id: string; designId: string; phrase: string; source: "eRank" | "EverBee" | "Etsy Marketplace Insights" | "Other"; evidenceReference: string; demand: string; competition: string; relevance: "High" | "Medium" | "Low" | "Unrated"; status: KeywordResearchStatus; role: KeywordRole; note: string; createdAt: string };
export type KeywordResearchLoop = {
  designId: string;
  round: number;
  stage: "seed-requested" | "evidence-received" | "need-deeper-research" | "conclusion-ready";
  queries: string[];
  requestReason: string;
  codexVerdict?: string;
  primaryKeyword?: string;
  supportingKeywords?: string[];
  avoidKeywords?: string[];
  updatedAt: string;
};
export type ListingDraft = { id: string; productId: string; designId: string; sourcePacket: string; tags: string[]; evidenceIds: string[]; status: "draft" | "approved-for-manual-entry"; createdAt: string; approvedAt?: string };
export type EtsyOperationsState = { version: 1; migratedLegacy: boolean; artifacts: EvidenceArtifact[]; products: Product[]; designs: Design[]; listings: Listing[]; posts: ContentPost[]; gates: OwnerGate[]; keywordResearch: KeywordResearch[]; keywordResearchLoops: KeywordResearchLoop[]; listingDrafts: ListingDraft[] };
export type OperationsTab = "today" | "research" | "analysis" | "results" | "library" | "social";
export type WorkingContextTone = "ready" | "attention" | "protected" | "draft";
export type WorkingContext = { item: string; stage: string; status: string; tone: WorkingContextTone; action: string; actionTab?: OperationsTab };
export type WorkingContextInput = {
  tab: OperationsTab;
  currentStage: number;
  designName?: string;
  selectedListingTitle?: string;
  selectedListingProtected?: boolean;
  selectedProductName?: string;
  socialListingTitle?: string;
  briefGapCount: number;
  researchCount: number;
  hasKeywordDecision: boolean;
  hasDraft: boolean;
  hasApprovedDraft: boolean;
  auditGapCount: number;
  metricStatus?: MetricStatus;
  ocrReviewStatus: "none" | "pending" | "unreadable";
  ownerConfirmationNeeded: boolean;
  productEvidenceGapCount: number;
};

export type PrimaryDashboardSummary = {
  hasAnalysis: boolean;
  emptyMessage?: string;
  analysisFocus?: string;
  proposedDecision?: string;
  actionLabel?: string;
  actionDetail?: string;
  actionTab?: OperationsTab;
};

export type PrimaryDashboardSummaryInput = {
  designName?: string;
  researchCount: number;
  primaryKeyword?: string;
  supportingKeywordCount: number;
  hasDraft: boolean;
  hasApprovedDraft: boolean;
  draftTitle?: string;
  draftReadyForApproval: boolean;
};

export function deriveActiveDraftState(listingDrafts: ListingDraft[], designId?: string) {
  const activeDrafts = listingDrafts
    .map((draft, sourceIndex) => ({ draft, sourceIndex }))
    .filter(({ draft }) => Boolean(designId) && draft.designId === designId)
    .sort((left, right) => right.draft.createdAt.localeCompare(left.draft.createdAt) || left.sourceIndex - right.sourceIndex)
    .map(({ draft }) => draft);
  const currentDraft = activeDrafts[0];
  const approvedDraft = currentDraft?.status === "approved-for-manual-entry" ? currentDraft : undefined;
  return {
    activeDrafts,
    currentDraft,
    approvedDraft,
    hasDraft: Boolean(currentDraft),
    hasApprovedDraft: Boolean(approvedDraft),
  };
}

function blockedClaimList(blockedClaims = "") {
  return blockedClaims.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

export function collectDraftTagIssues(tags: string[], blockedClaims = "") {
  const seen = new Set<string>();
  const issues = tags.length > 13 ? [`${tags.length} tags pasted (Etsy limit: 13)`] : [];
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase();
    if (tag.length > 20) issues.push(`\"${tag}\" is ${tag.length} characters (Etsy limit: 20)`);
    if (seen.has(normalized)) issues.push(`\"${tag}\" is duplicated`);
    seen.add(normalized);
    for (const blocked of blockedClaimList(blockedClaims)) {
      if (normalized.includes(blocked)) issues.push(`\"${tag}\" conflicts with blocked claim \"${blocked}\"`);
    }
  }
  return issues;
}

function isSafetyOnlyClaim(sentence: string, claim: string) {
  let matchAt = sentence.indexOf(claim);
  while (matchAt >= 0) {
    const before = sentence.slice(Math.max(0, matchAt - 80), matchAt).trim();
    const after = sentence.slice(matchAt + claim.length, matchAt + claim.length + 80).trim();
    const negatedBefore = /(?:^|\b)(?:no|not|never|without|avoid|exclude|do not|does not|must not|cannot|can't|don't|isn't|aren't)(?:\s+[a-z0-9']+){0,5}\s*$/.test(before);
    const negatedAfter = /^(?:[a-z0-9']+\s+){0,4}(?:is|are|was|were|will be|must be)?\s*(?:not|never)\s+(?:included|provided|offered|used|claimed|available)\b/.test(after);
    if (!negatedBefore && !negatedAfter) return false;
    matchAt = sentence.indexOf(claim, matchAt + claim.length);
  }
  return true;
}

export function collectDraftPackageIssues(sourcePacket: string, blockedClaims = "") {
  const normalizedSentences = sourcePacket
    .toLowerCase()
    .replace(/[’]/g, "'")
    .split(/[\n.!?]+/)
    .map((sentence) => sentence.replace(/[^a-z0-9']+/g, " ").trim())
    .filter(Boolean);
  const issues: string[] = [];
  for (const blocked of blockedClaimList(blockedClaims)) {
    const matchingSentences = normalizedSentences.filter((sentence) => sentence.includes(blocked));
    if (matchingSentences.some((sentence) => !isSafetyOnlyClaim(sentence, blocked))) {
      issues.push(`Saved customer-facing package conflicts with blocked claim \"${blocked}\"`);
    }
  }
  return issues;
}

export function extractListingDraftTitle(sourcePacket: string) {
  const lines = sourcePacket.split(/\r?\n/).map((line) => line.trim());
  const titleIndex = lines.findIndex((line) => line.toLowerCase() === "title");
  if (titleIndex >= 0) return lines.slice(titleIndex + 1).find((line) => Boolean(line));
  return undefined;
}

export function deriveActiveDesignContent(state: EtsyOperationsState, activeDesignId: string | undefined, demo: { designId: string; sourcePacket: string }, studio?: { designId: string; sourcePacket: string }) {
  const activeDesign = state.designs.find((item) => item.id === activeDesignId);
  const draftState = deriveActiveDraftState(state.listingDrafts, activeDesign?.id);
  const isDemoDesign = activeDesign?.id === demo.designId;
  const sourcePacket = draftState.currentDraft?.sourcePacket
    || (studio && studio.designId === activeDesign?.id ? studio.sourcePacket.trim() : "")
    || (isDemoDesign ? demo.sourcePacket : "");
  return {
    designId: activeDesign?.id,
    designName: activeDesign?.name ?? "Choose a design",
    isDemoDesign,
    todayLabel: activeDesign ? `Today’s next step · ${activeDesign.name}${isDemoDesign ? " example" : ""}` : "Today’s next step · Choose a design",
    designStepDetail: activeDesign?.name ?? "No design selected",
    sourcePacket,
    draftTitle: extractListingDraftTitle(sourcePacket),
  };
}

export function deriveWorkingItemState(state: EtsyOperationsState, designId?: string, productId?: string, seedKeywords: string[] = []) {
  const design = state.designs.find((item) => item.id === designId);
  const designProductId = design?.productId;
  const researchCount = design
    ? state.artifacts.filter((item) => item.kind === "keyword-research" && item.ownerConfirmed && (item.targetId === design.id || item.targetId === designProductId)).length
    : 0;
  const researchLoop = design ? state.keywordResearchLoops.find((item) => item.designId === design.id) : undefined;
  const draftState = deriveActiveDraftState(state.listingDrafts, design?.id);
  const briefGapCount = design ? listingBriefMissing(state, design.productId, design.id, seedKeywords).length : 0;
  const hasKeywordDecision = researchLoop?.stage === "conclusion-ready" && Boolean(researchLoop.primaryKeyword);
  const hasDraft = draftState.hasDraft;
  const hasApprovedDraft = Boolean(draftState.approvedDraft)
    && collectListingDraftApprovalIssues(state, draftState.approvedDraft!, seedKeywords).length === 0;
  return {
    briefGapCount,
    researchCount,
    hasKeywordDecision,
    hasDraft,
    hasApprovedDraft,
    productEvidenceGapCount: productId ? productFactGaps(state, productId).length : 0,
    currentStage: briefGapCount ? 1 : hasDraft ? 5 : hasKeywordDecision ? 4 : researchCount ? 3 : 2,
  };
}

export function buildPrimaryDashboardSummary(input: PrimaryDashboardSummaryInput): PrimaryDashboardSummary {
  if (!input.designName) {
    return { hasAnalysis: false, emptyMessage: "請先選擇一個設計。" };
  }
  if (input.hasApprovedDraft) {
    return {
      hasAnalysis: true,
      analysisFocus: input.draftTitle ? `目前已批准嘅 Listing Brief 係「${input.draftTitle}」。` : "目前 Listing Brief 已完成店主批准。",
      proposedDecision: "保留已批准版本，交由店主作最後手動上架檢查。",
      actionLabel: "檢查手動上架內容",
      actionDetail: "核對標題、tags、描述同商品承諾；Dashboard 唔會自動發佈。",
      actionTab: "results",
    };
  }
  if (input.hasDraft) {
    return {
      hasAnalysis: true,
      analysisFocus: input.draftTitle ? `已有本機 Listing Brief 草稿：「${input.draftTitle}」。` : "已有本機 Listing Brief 草稿可以繼續改善。",
      proposedDecision: input.draftReadyForApproval
        ? "內容已通過現有資料檢查，建議完成店主審批。"
        : "保留現有草稿，先改善客戶會見到嘅內容，再交畀店主批准。",
      actionLabel: input.draftReadyForApproval ? "檢查並批准 Listing Brief" : "改善 Listing Brief 內容",
      actionDetail: "集中檢查標題、tags、描述同產品承諾是否一致。",
      actionTab: "results",
    };
  }
  if (input.primaryKeyword) {
    const supporting = input.supportingKeywordCount ? `，另有 ${input.supportingKeywordCount} 個 supporting keyword` : "";
    return {
      hasAnalysis: true,
      analysisFocus: `關鍵字方向已收窄；目前主關鍵字係「${input.primaryKeyword}」${supporting}。`,
      proposedDecision: `用「${input.primaryKeyword}」作呢個設計嘅 listing 主方向。`,
      actionLabel: "建立 Listing Brief",
      actionDetail: "將已選關鍵字轉成標題、tags、描述同產品定位草稿。",
      actionTab: "results",
    };
  }
  if (input.researchCount > 0) {
    return {
      hasAnalysis: true,
      analysisFocus: `已收到 ${input.researchCount} 份 research input，可以開始比較搜尋意圖、相關度同競爭訊號。`,
      proposedDecision: "先收窄主關鍵字、supporting terms 同 avoid terms，再開始 listing 文案。",
      actionLabel: "完成關鍵字取捨",
      actionDetail: "揀出一個主方向，避免未有結論就直接改 listing。",
      actionTab: "research",
    };
  }
  return { hasAnalysis: false, emptyMessage: "暫未有足夠資料產生分析。" };
}

export function buildWorkingContext(input: WorkingContextInput): WorkingContext {
  const noItem = "No working item selected";
  const designItem = input.designName || noItem;
  const evidenceBlock = (item: string, stage: string, actionTab?: OperationsTab): WorkingContext | undefined => {
    if (input.ocrReviewStatus === "unreadable") return { item, stage: "Evidence review", status: "OCR visual review only", tone: "attention", action: "Review screenshot visually; do not use it for calculations", actionTab };
    if (input.ocrReviewStatus === "pending") return { item, stage: "Evidence review", status: "OCR review needed", tone: "attention", action: "Review screenshot before confirmation", actionTab };
    if (input.metricStatus === "invalid") return { item, stage, status: "Invalid data", tone: "attention", action: "Replace or correct the invalid evidence", actionTab };
    if (input.ownerConfirmationNeeded) return { item, stage, status: "Owner confirmation needed", tone: "attention", action: "Review and confirm the local evidence", actionTab };
    if (input.metricStatus === "missing") return { item, stage, status: "Missing inputs", tone: "attention", action: "Add the next missing evidence", actionTab };
    return undefined;
  };
  const confirmedZero = (item: string, stage: string): WorkingContext | undefined => input.metricStatus === "confirmed-zero"
    ? { item, stage, status: "Confirmed zero", tone: "ready", action: "Keep zero as evidence; do not treat it as missing" }
    : undefined;
  if (input.tab === "today") {
    if (!input.designName) return { item: noItem, stage: "Choose working context", status: "Missing target", tone: "attention", action: "Select or start a local research item", actionTab: "research" };
    const blocked = evidenceBlock(designItem, `Today · Stage ${input.currentStage} of 5`, "research");
    if (blocked) return blocked;
    if (input.briefGapCount) return { item: designItem, stage: `Today · Stage ${input.currentStage} of 5`, status: "Missing inputs", tone: "attention", action: "Add the next missing input", actionTab: "research" };
    const zero = confirmedZero(designItem, `Today · Stage ${input.currentStage} of 5`);
    if (zero) return zero;
    if (input.hasApprovedDraft) return { item: designItem, stage: "Owner review complete", status: "Approved for manual entry", tone: "ready", action: "Review manual-entry status", actionTab: "results" };
    if (input.hasDraft) return { item: designItem, stage: "Listing Brief review", status: "Draft only", tone: "draft", action: "Review the saved draft", actionTab: "results" };
    if (input.hasKeywordDecision) return { item: designItem, stage: "Keyword decision", status: "Ready for draft", tone: "ready", action: "Open Listing Brief", actionTab: "results" };
    if (input.researchCount) return { item: designItem, stage: "Codex analysis", status: "Evidence received", tone: "ready", action: "Review Codex analysis", actionTab: "analysis" };
    return { item: designItem, stage: "Research input", status: "Missing inputs", tone: "attention", action: "Add research data", actionTab: "research" };
  }
  if (input.tab === "research") {
    const blocked = evidenceBlock(designItem, "Evidence intake");
    if (blocked) return blocked;
    if (input.briefGapCount || input.productEvidenceGapCount) return { item: designItem, stage: "Evidence intake", status: "Missing inputs", tone: "attention", action: "Add the next missing evidence" };
    const zero = confirmedZero(designItem, "Evidence intake");
    if (zero) return zero;
    return { item: designItem, stage: "Keyword research", status: input.researchCount ? "Evidence received" : "Ready for input", tone: input.researchCount ? "ready" : "draft", action: input.researchCount ? "Continue to analysis" : "Add research data", actionTab: input.researchCount ? "analysis" : undefined };
  }
  if (input.tab === "analysis") {
    const item = input.selectedListingTitle || noItem;
    if (!input.selectedListingTitle) return { item, stage: "Listing selection", status: "Missing target", tone: "attention", action: "Select a listing for read-only analysis" };
    if (input.selectedListingProtected) return input.auditGapCount
      ? { item, stage: "Read-only listing audit", status: "Protected / read-only", tone: "protected", action: "Add missing first-party evidence", actionTab: "research" }
      : { item, stage: "Read-only listing audit", status: "Protected / read-only", tone: "protected", action: "Prepare the read-only audit packet" };
    const blocked = evidenceBlock(item, "Listing evidence gate", "research");
    if (blocked) return blocked;
    if (input.auditGapCount) return { item, stage: "Listing evidence gate", status: "Missing inputs", tone: "attention", action: "Add missing first-party evidence", actionTab: "research" };
    const zero = confirmedZero(item, "Read-only listing audit");
    if (zero) return zero;
    return { item, stage: "Read-only listing audit", status: "Audit packet ready", tone: "ready", action: "Prepare the read-only audit packet" };
  }
  if (input.tab === "results") {
    if (!input.designName) return { item: noItem, stage: "Listing Brief", status: "Missing target", tone: "attention", action: "Return to analysis", actionTab: "analysis" };
    if (input.hasApprovedDraft) return { item: designItem, stage: "Owner review complete", status: "Approved for manual entry", tone: "ready", action: "Copy the approved draft" };
    if (input.hasDraft) return { item: designItem, stage: "Listing Brief review", status: "Draft only", tone: "draft", action: "Review and approve the saved draft" };
    if (input.hasKeywordDecision) return { item: designItem, stage: "Listing Brief", status: "Ready for draft", tone: "ready", action: "Load the Listing Brief" };
    return { item: designItem, stage: "Listing Brief", status: "Missing keyword decision", tone: "attention", action: "Return to analysis", actionTab: "analysis" };
  }
  if (input.tab === "library") {
    const item = input.selectedProductName || noItem;
    if (!input.selectedProductName) return { item, stage: "Product truth review", status: "Missing target", tone: "attention", action: "Select a product or design" };
    const blocked = evidenceBlock(item, "Product truth review", "research");
    if (blocked) return blocked;
    if (input.productEvidenceGapCount) return { item, stage: "Product truth review", status: "Missing inputs", tone: "attention", action: "Review missing product evidence", actionTab: "research" };
    const zero = confirmedZero(item, "Product truth review");
    return zero ?? { item, stage: "Product truth review", status: "Ready", tone: "ready", action: "Review current product facts" };
  }
  return { item: input.socialListingTitle || noItem, stage: "Social tracking", status: input.socialListingTitle ? "Attribution unconfirmed" : "Missing target", tone: input.socialListingTitle ? "draft" : "attention", action: input.socialListingTitle ? "Record platform and Etsy outcomes" : "Select a target listing" };
}

export function summarizeMetricStatus(artifacts: EvidenceArtifact[]): MetricStatus | undefined {
  const statuses = artifacts.flatMap((artifact) => artifact.metrics.map((metric) => metric.status));
  if (statuses.includes("invalid")) return "invalid";
  if (statuses.includes("missing")) return "missing";
  if (statuses.includes("confirmed")) return "confirmed";
  if (statuses.includes("confirmed-zero")) return "confirmed-zero";
  return undefined;
}

const SELLER_MAINTENANCE_MAP: SellerMaintenanceRule[] = [
  { id: "photos-video", label: "Primary photo, other photos, listing video", coverage: "Partially supported", whenToCheck: "When the product, packaging or visual truth changes, or Etsy Search Visibility shows a photo issue.", triggerSignal: "Etsy first-party Search Visibility / listing view plus an exact product or design proof.", draftUpdate: "Prepare a local photo or visual-clarity review; Dashboard does not choose the image for you.", requiredEvidence: ["Etsy listing / Search Visibility evidence", "Exact product or design proof", "Owner confirmation before any manual entry"], observationWindow: "Use the same owner-approved comparison period as the evidence; no new Dashboard threshold.", measurableResult: "Check whether the Etsy issue is cleared and compare first-party Views, Favorites, Orders and Revenue without claiming causality." },
  { id: "metadata-copy", label: "Title, tags, attributes, category, description", coverage: "Supported", whenToCheck: "When product positioning or facts change, Etsy provides a listing/search suggestion, or dated research needs refreshing.", triggerSignal: "Etsy first-party listing / Stats / search-term evidence; eRank and EverBee remain supplemental.", draftUpdate: "Prepare one draft title, tag or description packet after product truth and keyword evidence are ready.", requiredEvidence: ["Etsy listing or Stats evidence", "Dated keyword research", "Product facts and blocked-claim rules"], observationWindow: "Use the same owner-approved comparison period; do not create a new minimum sample or winner rule.", measurableResult: "Review Etsy Search traffic / search terms and listing Views, Favorites, Orders and Revenue for the comparable period." },
  { id: "product-facts", label: "Product facts, personalization, allowed / blocked claims", coverage: "Supported", whenToCheck: "When supplier specifications, design content, personalization setup or production method changes.", triggerSignal: "Current official product / supplier source plus owner confirmation.", draftUpdate: "Update the local product facts and claims gate before drafting buyer-facing copy.", requiredEvidence: ["Official product or supplier source", "Owner-confirmed product facts", "Exact design proof when relevant"], observationWindow: "Re-check when the source or product changes; this is a truth check, not a performance experiment.", measurableResult: "The local facts, draft and manual-entry checklist agree; do not infer sales impact from alignment alone." },
  { id: "price-offer", label: "Price, offer, cost and fulfilment", coverage: "Partially supported", whenToCheck: "When cost, shipping, offer structure or an owner-approved commercial decision changes.", triggerSignal: "Official cost / fulfilment source and owner decision; Etsy Stats are the performance source.", draftUpdate: "Prepare a local price or offer review only; Dashboard does not calculate or publish a live price.", requiredEvidence: ["Official cost and fulfilment source", "Etsy first-party listing / Stats evidence", "Owner approval for any live action"], observationWindow: "Use the owner-approved observation period for the commercial decision; no automatic profit or conversion threshold.", measurableResult: "Review Orders, Revenue and available conversion fields; profit remains unknown until all fee and cost inputs are confirmed." },
  { id: "shipping-policy", label: "Shipping, processing time and policies", coverage: "Partially supported", whenToCheck: "When fulfilment time, shipping charge or policy changes, or Etsy shows a related visibility issue.", triggerSignal: "Etsy listing / Search Visibility evidence plus current supplier or policy source.", draftUpdate: "Prepare a local accuracy checklist for shipping, processing and policy wording.", requiredEvidence: ["Etsy listing / policy evidence", "Current supplier / fulfilment source", "Owner confirmation"], observationWindow: "Re-check after the relevant source or policy change using the same comparison period.", measurableResult: "Check issue status and first-party Orders / Revenue; do not claim the wording change caused the result." },
  { id: "inventory-seasonal", label: "Inventory, variation and seasonal wording", coverage: "Not tracked", whenToCheck: "When real inventory, variation availability, production capacity or seasonal relevance changes.", triggerSignal: "Owner or supplier current truth plus the Etsy listing state.", draftUpdate: "Record the missing input or prepare a manual checklist; this Dashboard does not manage inventory or variations.", requiredEvidence: ["Owner / supplier current truth", "Etsy listing evidence"], observationWindow: "Use the owner’s operational checkpoint; no automatic seasonal or inventory threshold.", measurableResult: "Review listing Views, search terms and Orders while confirming fulfilment can remain accurate." },
  { id: "service-review", label: "Messages, reviews, cases and customer-service status", coverage: "Not tracked", whenToCheck: "When buyer confusion, review themes, case activity or Etsy customer-service warnings appear.", triggerSignal: "Etsy first-party Messages, Reviews or Customer Service Stats.", draftUpdate: "Record a local issue summary and owner follow-up; no customer or account action is performed here.", requiredEvidence: ["Relevant Etsy first-party evidence", "Owner decision and response boundary"], observationWindow: "Use the service event or owner-approved review period; no automatic service score threshold.", measurableResult: "Review the relevant response, rating, case or on-time status; Dashboard does not attribute listing edits to it." },
  { id: "ads", label: "Etsy Ads", coverage: "Not tracked", whenToCheck: "Only when the owner has actually enabled Ads and wants a read-only review.", triggerSignal: "Etsy Ads first-party dashboard evidence.", draftUpdate: "Record an evidence request or draft analysis; never enable, disable or change budget here.", requiredEvidence: ["Etsy Ads evidence", "Owner confirmation of the active ad state"], observationWindow: "Use the owner-approved ad reporting period; no automatic ROAS or spend threshold.", measurableResult: "Review available impressions, clicks, orders, revenue and spend; missing fields stay missing." },
];

function emptySellerMetric(label: string): SellerDecisionMetric { return { label, value: null, status: "missing" }; }

function findSellerMetric(artifact: EvidenceArtifact | undefined, label: string, pattern: RegExp): SellerDecisionMetric {
  const metric = artifact?.metrics.find((item) => pattern.test(item.label.replace(/[_-]+/g, " ").trim()));
  return metric ? { label, value: metric.value, status: metric.status } : emptySellerMetric(label);
}

export function buildSellerDecision(state: EtsyOperationsState, listingId: string, asOf = new Date().toISOString().slice(0, 10)): SellerDecision {
  const listing = state.listings.find((item) => item.id === listingId);
  const performance = state.artifacts
    .filter((item) => item.kind === "listing-performance" && item.source === "etsy" && item.ownerConfirmed && item.targetId === listingId && item.periodStart && item.periodEnd)
    .sort((a, b) => `${b.periodEnd}${b.periodStart}`.localeCompare(`${a.periodEnd}${a.periodStart}`))[0];
  const periodStart = performance?.periodStart ?? "";
  const periodEnd = performance?.periodEnd ?? "";
  const signals = {
    views: findSellerMetric(performance, "Views", /^(listing\s*)?views?$/i),
    favorites: findSellerMetric(performance, "Favorites", /^(item\s*)?favorites?$/i),
    orders: findSellerMetric(performance, "Orders", /^orders?$/i),
    revenue: findSellerMetric(performance, "Revenue", /^(etsy\s*)?(revenue|sales)$/i),
  };
  const missingEvidence: string[] = [];
  if (!listing) missingEvidence.push("Select a listing");
  if (listing && !performance) missingEvidence.push("No owner-confirmed Etsy Listing Performance for a comparable period");
  if (performance) {
    for (const metric of [signals.views, signals.favorites, signals.orders]) if (metric.status === "missing" || metric.status === "invalid") missingEvidence.push(`Etsy Listing Performance ${metric.label} is ${metric.status}`);
    for (const step of buildEvidenceIntakeSteps(state, listingId, periodStart, periodEnd)) {
      if (step.status === "missing") missingEvidence.push(`${step.label} is missing for ${periodStart} → ${periodEnd}`);
      if (step.status === "review") missingEvidence.push(`${step.label} is awaiting owner review and confirmation`);
      if (step.status === "not-eligible") missingEvidence.push(`${step.label} is confirmed but not decision-ready; check missing, invalid, or unreadable data`);
    }
  }
  const protectedNote = listing?.protected
    ? listing.observationEnd && listing.observationEnd > asOf
      ? `Protected observation: keep the listing unchanged until ${listing.observationEnd}. Prepare only a local draft.`
      : "Protected observation: dashboard work remains read-only; prepare only a local draft."
    : undefined;
  return {
    status: missingEvidence.length ? "collect-data" : "ready",
    listingId,
    listingTitle: listing?.title ?? "No listing selected",
    whatToUpdate: missingEvidence.length
      ? "Unknown / Collect data — complete the evidence gate, then choose one applicable row in the static maintenance map."
      : "Choose one applicable row in the static maintenance map; Dashboard does not choose a listing element for you.",
    whenToUpdate: "When the matching owner-confirmed signal appears or the underlying product / fulfilment fact changes.",
    triggerSignal: "Match the signal to one map row. Missing or invalid is not zero, and third-party estimates do not replace Etsy first-party truth.",
    requiredEvidence: ["Etsy first-party listing / Shop Stats / Search Visibility evidence when performance is the signal", "Exact product, fulfilment or policy source when a fact changes", "Owner confirmation before any draft is approved for manual entry"],
    missingEvidence,
    observationWindow: "Use the same owner-approved comparison period as the evidence. This Dashboard does not create a new threshold, winner rule or automatic learning loop.",
    measurableResult: "Compare the same first-party fields before and after the owner-approved change. If a field is missing or invalid, keep the result Unknown / Collect data.",
    source: performance ? `Etsy first-party Listing Performance · ${periodStart} → ${periodEnd}` : "No comparable Etsy first-party window selected",
    maintenanceMap: SELLER_MAINTENANCE_MAP,
    signals,
    protectedNote,
  };
}

const DB_NAME = "mygiftstyle-etsy-operations";
const STORE_NAME = "state";
const STATE_KEY = "main";

const KNOWN_PRODUCT_CARDS: Product[] = [
  { id: "product-standard-journal", name: "Standard Printed Vegan Leather Journal", type: "Journal", material: "Vegan leather cover; brown elastic closure band; ribbon bookmark", size: "5.8 in × 8.5 in × 5/8 in; 100 sheets / 200 lined pages; 11.33 oz", productionMethod: "Printed cover design only; no engraving or embossing", fulfilmentSource: "Produced and shipped from the US; average production time: 5 business days", costSource: "Empire Builder working source (owner-confirmed 2026-07-31): USD 13.50 base; US USD 6.31; Canada USD 9.70; EU USD 9.22. Rest of World and additional item shipping remain open.", allowedClaims: "personalized, custom name, vegan leather journal, printed cover design, 200 lined pages", blockedClaims: "engraved, embossed, debossed, guided prompts, prompt journal, blank pages", sourceNote: "Owner-provided journal product screenshots and product rules (2026-06-29); Empire Builder cost authority (2026-07-31)." },
  { id: "product-acrylic-led-plaque", name: "Printed Acrylic LED Plaque", type: "Acrylic LED Plaque", material: "Premium acrylic with wooden LED base", size: "Chapter 60 example: 7 in / 17.8 cm high × 5.9 in / 149.86 mm wide; acrylic depth 0.1 in / 5 mm. Confirm by SKU before listing.", productionMethod: "Sharp, detailed printed design only; not engraved unless an exact SKU proves otherwise", fulfilmentSource: "Empire Builder Graphic Acrylic Square Plaque LED base; confirm final size and base details per SKU", costSource: "Empire Builder working source (owner-confirmed 2026-07-31): USD 12.00 for corded or battery LED base; US USD 6.31; Canada USD 9.70; EU USD 9.22. Rest of World and additional item shipping remain open.", allowedClaims: "personalized acrylic plaque, printed design, LED base, USB or battery option when the selected SKU provides it", blockedClaims: "engraved without SKU proof, unclear LED color claims, treating acrylic thickness as full product depth", sourceNote: "Owner-provided plaque sizing image and product documentation (2026-06-29); Empire Builder cost authority (2026-07-31)." },
];

const KNOWN_DESIGNS: Design[] = [
  {
    id: "design-md1405-04-journal",
    name: "MD-1405 Design 04 — Mom Tell Me Your Story (Journal)",
    productId: "product-standard-journal",
    recipient: "Mom",
    occasion: "Family legacy / memory gift",
    mockupStatus: "ready",
    assetName: "Design 04 / IMG_8184-Zoom.jpg",
    sourceNote: "Verified local preview: C:\\Users\\ctcc0\\Downloads\\Acrylic Plaque LED (Square) Design For Trevor Cheuk-20260707T154054Z-3-001\\MD-1405  Graphic Journal - Acrylic Plaque LED (Square) Design For Trevor Cheuk\\Design 04\\IMG_8184-Zoom.jpg",
  },
];

export const DEFAULT_STATE: EtsyOperationsState = {
  version: 1,
  migratedLegacy: false,
  artifacts: [],
  products: KNOWN_PRODUCT_CARDS,
  designs: KNOWN_DESIGNS,
  listings: [
    { id: "4517034664", title: "Mom and Dad 2-Book Set", protected: true },
    { id: "4524703935", title: "Parents duplicate listing", protected: true },
  ],
  posts: [],
  gates: [],
  keywordResearch: [],
  keywordResearchLoops: [],
  listingDrafts: [],
};

export function hydrateKeywordResearch(state: EtsyOperationsState): EtsyOperationsState {
  const keywordResearch = Array.isArray(state.keywordResearch) ? state.keywordResearch : [];
  const keywordResearchLoops = Array.isArray(state.keywordResearchLoops) ? state.keywordResearchLoops : [];
  return keywordResearch === state.keywordResearch && keywordResearchLoops === state.keywordResearchLoops ? state : { ...state, keywordResearch, keywordResearchLoops };
}

export function hydrateListingDrafts(state: EtsyOperationsState): EtsyOperationsState {
  return Array.isArray(state.listingDrafts) ? state : { ...state, listingDrafts: [] };
}

export function keywordResearchGaps(state: EtsyOperationsState, designId: string) {
  const records = (state.keywordResearch ?? []).filter((item) => item.designId === designId);
  const missing: string[] = [];
  if (records.length < 5 || records.length > 15) missing.push("5–15 seed keywords");
  if (!records.some((item) => item.evidenceReference.trim())) missing.push("at least one dated eRank, EverBee, or Etsy Marketplace Insights evidence reference");
  if (!records.some((item) => item.role === "primary")) missing.push("one evidence-backed primary keyword");
  if (!records.some((item) => item.role === "supporting")) missing.push("at least one supporting keyword");
  return missing;
}

export function keywordEvidenceGaps(state: EtsyOperationsState, designId: string) {
  const design = state.designs.find((item) => item.id === designId);
  const hasUsableResearch = state.artifacts.some((item) => item.kind === "keyword-research" && item.ownerConfirmed && (!item.mimeType.startsWith("image/") || (item.ocrStatus === "confirmed" && Boolean(item.contentText?.trim()))) && (item.targetId === designId || (design && item.targetId === design.productId)));
  return hasUsableResearch ? [] : ["a dated, owner-confirmed eRank, EverBee, or Etsy Marketplace Insights CSV/XLSX; screenshots must also have confirmed OCR text"];
}

export function hydrateKnownProducts(state: EtsyOperationsState): EtsyOperationsState {
  const missing = KNOWN_PRODUCT_CARDS.filter((card) => !state.products.some((product) => product.id === card.id));
  return missing.length ? { ...state, products: [...state.products, ...missing] } : state;
}

export function hydrateKnownDesigns(state: EtsyOperationsState): EtsyOperationsState {
  const missing = KNOWN_DESIGNS.filter((card) => !state.designs.some((design) => design.id === card.id));
  return missing.length ? { ...state, designs: [...state.designs, ...missing] } : state;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadOperationsState(): Promise<EtsyOperationsState> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(STATE_KEY);
    request.onsuccess = () => { db.close(); resolve((request.result as EtsyOperationsState | undefined) ?? DEFAULT_STATE); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function saveOperationsState(state: EtsyOperationsState) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(state, STATE_KEY);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}

export function sourceAuthority(source: EvidenceSource): EvidenceAuthority {
  if (source === "etsy" || source === "instagram" || source === "pinterest" || source === "facebook" || source === "threads") return "primary";
  if (source === "erank" || source === "everbee") return "supplemental";
  return "inference";
}

export function createId(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }

function numberStatus(value: unknown): { value: number | null; status: MetricStatus } {
  if (value === null || value === undefined || String(value).trim() === "") return { value: null, status: "missing" };
  const numeric = typeof value === "number" ? value : Number(String(value).replace(/[$,%\s,]/g, ""));
  if (!Number.isFinite(numeric)) return { value: null, status: "invalid" };
  return { value: numeric, status: numeric === 0 ? "confirmed-zero" : "confirmed" };
}

function isMetric(label: string) { return /^(visits?|views?|favorites?|orders?|revenue|conversion\s*rate|clicks?|impressions?|saves?|reach|engagement)$/i.test(label.replace(/[_-]+/g, " ").trim()); }

export async function parseWorkbook(buffer: ArrayBuffer): Promise<Pick<EvidenceArtifact, "rows" | "headers" | "metrics" | "contentText">> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) return { rows: 0, headers: [], metrics: [], contentText: "" };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const metrics = headers.filter(isMetric).slice(0, 12).map((label) => {
    const parsed = rows.map((row) => numberStatus(row[label]));
    if (parsed.some((item) => item.status === "invalid")) return { label, value: null, status: "invalid" as const };
    if (parsed.some((item) => item.status === "missing")) return { label, value: null, status: "missing" as const };
    const total = parsed.reduce((sum, item) => sum + (item.value ?? 0), 0);
    return { label, value: total, status: total === 0 ? "confirmed-zero" as const : "confirmed" as const };
  });
  return { rows: rows.length, headers, metrics, contentText: XLSX.utils.sheet_to_csv(firstSheet).slice(0, 25000) };
}

export const AUDIT_REQUIREMENTS: Array<{ kind: EvidenceKind; label: string }> = [
  { kind: "shop-stats", label: "Etsy Shop Stats overview" },
  { kind: "listing-performance", label: "Etsy Listing Performance" },
  { kind: "traffic-sources", label: "Traffic Sources / Etsy Search terms" },
];

export const EVIDENCE_INTAKE_REQUIREMENTS: Array<{ kind: EvidenceIntakeKind; label: string; instruction: string; targetLabel: string }> = [
  { kind: "shop-stats", label: "Etsy Shop Stats overview", instruction: "Export the shop-level Stats for the same start and end dates.", targetLabel: "Entire shop" },
  { kind: "listing-performance", label: "Etsy Listing Performance", instruction: "Export the selected listing’s performance for the same dates; this is the main listing signal.", targetLabel: "Selected listing" },
  { kind: "traffic-sources", label: "Traffic Sources / Etsy Search terms", instruction: "Export the traffic or Etsy Search view for the same dates; keep the source label visible.", targetLabel: "Shop or selected listing" },
];

function matchesIntakeTarget(artifact: EvidenceArtifact, kind: EvidenceIntakeKind, listingId: string) {
  if (kind === "shop-stats") return artifact.targetType === "shop";
  if (kind === "listing-performance") return artifact.targetType === "listing" && artifact.targetId === listingId;
  return artifact.targetType === "shop" || (artifact.targetType === "listing" && artifact.targetId === listingId);
}

export function isEvidenceEligibleForDecision(artifact: EvidenceArtifact) {
  if (!artifact.ownerConfirmed) return false;
  if (artifact.mimeType.startsWith("image/") && (artifact.ocrStatus !== "confirmed" || !artifact.contentText?.trim())) return false;
  return !artifact.metrics.some((metric) => metric.status === "missing" || metric.status === "invalid");
}

export function buildEvidenceIntakeSteps(state: EtsyOperationsState, listingId: string, periodStart: string, periodEnd: string): EvidenceIntakeStep[] {
  return EVIDENCE_INTAKE_REQUIREMENTS.map((requirement) => {
    const matches = state.artifacts
      .filter((artifact) => artifact.kind === requirement.kind && artifact.source === "etsy" && artifact.periodStart === periodStart && artifact.periodEnd === periodEnd && matchesIntakeTarget(artifact, requirement.kind, listingId))
      .sort((a, b) => `${b.uploadedAt}${b.id}`.localeCompare(`${a.uploadedAt}${a.id}`));
    const selected = matches.find((artifact) => isEvidenceEligibleForDecision(artifact)) ?? matches.find((artifact) => artifact.ownerConfirmed) ?? matches[0];
    const status: EvidenceIntakeStepStatus = !selected
      ? "missing"
      : isEvidenceEligibleForDecision(selected)
        ? "confirmed"
        : selected.ownerConfirmed
          ? "not-eligible"
          : "review";
    const detail = status === "confirmed"
      ? "Owner-confirmed and eligible for the read-only downstream packet."
      : status === "review"
        ? "Saved locally; open review and confirm only after checking the source, period, target and values."
        : status === "not-eligible"
          ? "Owner-confirmed, but not eligible for calculation until missing, invalid, or unreadable data is resolved."
          : "No matching Etsy first-party artifact is saved for this period.";
    return { ...requirement, status, artifactIds: matches.map((artifact) => artifact.id), selectedArtifactId: selected?.id, detail };
  });
}

export function auditMissing(state: EtsyOperationsState, listingId: string, periodStart: string, periodEnd: string) {
  return AUDIT_REQUIREMENTS.filter(({ kind }) => !state.artifacts.some((artifact) => artifact.kind === kind && artifact.source === "etsy" && artifact.ownerConfirmed && artifact.periodStart === periodStart && artifact.periodEnd === periodEnd && (artifact.targetType === "shop" || artifact.targetId === listingId))).map((item) => item.label);
}

export function productFactGaps(state: EtsyOperationsState, productId: string) {
  const product = state.products.find((item) => item.id === productId);
  const missing: string[] = [];
  if (!product || !product.material || !product.size || !product.productionMethod || !product.fulfilmentSource || !product.costSource || !product.sourceNote) missing.push("complete material, size, production, fulfilment, cost and source note");
  const confirmed = state.artifacts.filter((item) => item.ownerConfirmed && item.targetType === "product" && item.targetId === productId);
  if (!confirmed.some((item) => item.kind === "product-facts")) missing.push("owner-confirmed product facts evidence");
  if (!confirmed.some((item) => item.kind === "cost-fulfilment")) missing.push("owner-confirmed cost and fulfilment evidence");
  return missing;
}

export function listingBriefMissing(state: EtsyOperationsState, productId: string, designId: string, seedKeywords: string[]) {
  const product = state.products.find((item) => item.id === productId);
  const design = state.designs.find((item) => item.id === designId);
  const missing: string[] = [];
  const hasConfirmedProductFacts = state.artifacts.some((item) => item.targetType === "product" && item.targetId === productId && item.kind === "product-facts" && item.ownerConfirmed);
  const hasConfirmedCostAndFulfilment = state.artifacts.some((item) => item.targetType === "product" && item.targetId === productId && item.kind === "cost-fulfilment" && item.ownerConfirmed);
  if (!product || !product.material || !product.productionMethod || !product.fulfilmentSource || !product.costSource || !product.sourceNote) missing.push("complete product facts, fulfilment source, cost source and evidence note");
  else if (product.factsStatus !== "confirmed-current" && !hasConfirmedProductFacts) missing.push("owner-confirmed product facts evidence");
  else if (product.factsStatus !== "confirmed-current" && !hasConfirmedCostAndFulfilment) missing.push("owner-confirmed cost, shipping, and production-time source");
  if (!design || design.productId !== productId) missing.push("a design linked to the selected product");
  else if (design.mockupStatus !== "ready") missing.push("a product-specific mockup or exact product proof");
  if (seedKeywords.length < 5 || seedKeywords.length > 15) missing.push("5–15 seed keywords");
  if (!state.artifacts.some((item) => item.kind === "keyword-research" && item.ownerConfirmed && (item.targetId === designId || item.targetId === productId) && (!item.mimeType.startsWith("image/") || (item.ocrStatus === "confirmed" && Boolean(item.contentText?.trim()))))) missing.push("confirmed keyword research evidence with parsed data");
  return missing;
}

export function collectListingDraftApprovalIssues(state: EtsyOperationsState, draft: ListingDraft, seedKeywords: string[]) {
  const product = state.products.find((item) => item.id === draft.productId);
  return [
    ...listingBriefMissing(state, draft.productId, draft.designId, seedKeywords),
    ...collectDraftTagIssues(draft.tags, product?.blockedClaims),
    ...collectDraftPackageIssues(draft.sourcePacket, product?.blockedClaims),
  ];
}

export function legacyMigration(state: EtsyOperationsState): EtsyOperationsState {
  if (state.migratedLegacy) return state;
  const migrated = { ...state, migratedLegacy: true, artifacts: [...state.artifacts] };
  try {
    for (const listing of migrated.listings) {
      const raw = localStorage.getItem(`etsy-audit-workspace:${listing.id}`);
      const records = raw ? JSON.parse(raw) as Record<string, { fileName?: string; uploadedAt?: string; periodStart?: string; periodEnd?: string }> : {};
      for (const [kind, record] of Object.entries(records)) {
        if (!record.fileName || !AUDIT_REQUIREMENTS.some((item) => item.kind === kind)) continue;
        migrated.artifacts.push({ id: createId("legacy"), kind: kind as EvidenceKind, source: "owner", authority: "inference", fileName: record.fileName, mimeType: "legacy", uploadedAt: record.uploadedAt ?? new Date().toISOString(), periodStart: record.periodStart ?? "", periodEnd: record.periodEnd ?? "", targetType: "listing", targetId: listing.id, ownerConfirmed: false, ocrStatus: "not-needed", rows: null, headers: [], metrics: [] });
      }
    }
  } catch { /* Retain an empty migration marker; legacy records remain untouched. */ }
  return migrated;
}
