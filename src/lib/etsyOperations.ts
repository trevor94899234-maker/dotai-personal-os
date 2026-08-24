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

export type ParsedEvidenceFile = Pick<EvidenceArtifact, "rows" | "headers" | "metrics" | "contentText">;
export type EvidenceClassificationField = "kind" | "source" | "target" | "periodStart" | "periodEnd";
export type EvidenceClassificationTarget = {
  targetType: EvidenceArtifact["targetType"];
  targetId: string;
  labels: string[];
};
export type EvidenceFileClassification = {
  kind?: EvidenceKind;
  source?: EvidenceSource;
  targetType?: EvidenceArtifact["targetType"];
  targetId?: string;
  periodStart?: string;
  periodEnd?: string;
  status: "classified" | "ambiguous";
  ambiguity: EvidenceClassificationField[];
  signals: string[];
};
export type EvidenceClassificationInput = EvidenceBatchFileLike & {
  headers?: string[];
  contentText?: string;
  targets?: EvidenceClassificationTarget[];
};

export const MAX_EVIDENCE_BATCH_FILES = 100;
export type EvidenceBatchStatus = "queued" | "processing" | "saved" | "error";
export type EvidenceBatchFileLike = { name: string; type?: string };
export type EvidenceBatchItem = {
  index: number;
  fileName: string;
  mimeType: string;
  status: EvidenceBatchStatus;
  detail: string;
};
export type EvidenceBatchResult<TFile, TResult> = {
  items: EvidenceBatchItem[];
  successes: Array<{ index: number; file: TFile; value: TResult }>;
  failures: Array<{ index: number; file: TFile; error: string }>;
};

export function isSupportedEvidenceFile(file: EvidenceBatchFileLike) {
  const name = file.name.toLowerCase();
  const type = file.type?.toLowerCase() ?? "";
  return type.startsWith("image/")
    || /\.(png|jpe?g|csv|tsv|xlsx?|xls)$/i.test(name)
    || ["text/csv", "text/tab-separated-values", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].includes(type);
}

export function createEvidenceBatchItems(files: EvidenceBatchFileLike[]): EvidenceBatchItem[] {
  return files.map((file, index) => ({
    index,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    status: "queued",
    detail: "Waiting to be processed.",
  }));
}

export async function processEvidenceBatch<TFile extends EvidenceBatchFileLike, TResult>(
  files: TFile[],
  processor: (file: TFile, index: number) => Promise<TResult>,
  onProgress?: (items: EvidenceBatchItem[]) => void,
): Promise<EvidenceBatchResult<TFile, TResult>> {
  if (files.length > MAX_EVIDENCE_BATCH_FILES) throw new Error(`Select no more than ${MAX_EVIDENCE_BATCH_FILES} files in one batch.`);
  const items = createEvidenceBatchItems(files);
  const successes: EvidenceBatchResult<TFile, TResult>["successes"] = [];
  const failures: EvidenceBatchResult<TFile, TResult>["failures"] = [];
  const publish = () => onProgress?.(items.map((item) => ({ ...item })));
  publish();
  for (const [index, file] of files.entries()) {
    items[index] = { ...items[index], status: "processing", detail: `Processing ${index + 1} of ${files.length}.` };
    publish();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    try {
      if (!isSupportedEvidenceFile(file)) throw new Error("Unsupported file type. Use PNG, JPG, CSV, TSV, XLS or XLSX.");
      const value = await processor(file, index);
      successes.push({ index, file, value });
      items[index] = { ...items[index], status: "saved", detail: "Saved as a separate local evidence record." };
    } catch (error) {
      const message = error instanceof Error ? error.message : "This file could not be processed.";
      failures.push({ index, file, error: message });
      items[index] = { ...items[index], status: "error", detail: message };
    }
    publish();
  }
  return { items, successes, failures };
}

function normalizeClassificationText(value: string) {
  return value
    .toLowerCase()
    .replace(/[_/\\.-]+/g, " ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueClassificationCandidate<T extends string>(candidates: T[]) {
  const unique = Array.from(new Set(candidates));
  return unique.length === 1 ? unique[0] : undefined;
}

function normalizeIsoDate(value: string) {
  const match = value.match(/(20\d{2})[-_.](\d{2})[-_.](\d{2})/);
  if (!match) return undefined;
  const normalized = `${match[1]}-${match[2]}-${match[3]}`;
  return Number.isFinite(Date.parse(`${normalized}T00:00:00Z`)) ? normalized : undefined;
}

/**
 * Classify one supplied file without borrowing metadata from the rest of its
 * selection. Only explicit filename/header/content signals are accepted; every
 * unresolved or conflicting field remains visible for owner review.
 */
export function classifyEvidenceFile(input: EvidenceClassificationInput): EvidenceFileClassification {
  const fileText = normalizeClassificationText(input.name);
  const headerText = normalizeClassificationText((input.headers ?? []).join(" "));
  const contentText = normalizeClassificationText((input.contentText ?? "").slice(0, 25000));
  const corpus = [fileText, headerText, contentText].filter(Boolean).join(" ");
  const signals = [`File: ${input.name}`, `Type: ${input.type || "unknown"}`];

  const sourceRules: Array<[EvidenceSource, RegExp, string]> = [
    ["erank", /\be\s?rank\b/, "eRank named in file or content"],
    ["everbee", /\bever\s?bee\b/, "EverBee named in file or content"],
    ["instagram", /\binstagram\b/, "Instagram named in file or content"],
    ["pinterest", /\bpinterest\b/, "Pinterest named in file or content"],
    ["facebook", /\bfacebook\b|\bmeta insights?\b/, "Facebook or Meta Insights named in file or content"],
    ["threads", /\bthreads insights?\b/, "Threads Insights named in file or content"],
    ["owner", /\bowner provided\b|\bowner evidence\b/, "Owner-provided evidence named in file or content"],
    ["etsy", /\betsy\b|\bshop stats\b/, "Etsy or Shop Stats named in file or content"],
  ];
  const detectSources = (text: string, scope: string) => sourceRules.flatMap(([source, pattern, signal]) => pattern.test(text) ? [{ source, signal: `${signal} (${scope})` }] : []);
  const fileSources = detectSources(fileText, "filename");
  const fallbackSources = fileSources.length ? [] : detectSources([headerText, contentText].filter(Boolean).join(" "), "headers/content");
  const detectedSources = fileSources.length ? fileSources : fallbackSources;
  const sourceCandidates = detectedSources.map((item) => item.source);
  signals.push(...detectedSources.map((item) => item.signal));
  const source = uniqueClassificationCandidate(sourceCandidates);

  const detectKinds = (text: string, includeHeaderHeuristics: boolean, scope: string) => {
    const found: Array<{ kind: EvidenceKind; signal: string }> = [];
    const addKind = (kind: EvidenceKind, signal: string) => found.push({ kind, signal: `${signal} (${scope})` });
    if (/\bshop stats\b|\bstats overview\b|\bshop performance overview\b/.test(text)) addKind("shop-stats", "Shop Stats overview signal found");
    if (/\blisting performance\b|\blisting stats\b/.test(text)) addKind("listing-performance", "Listing performance signal found");
    if (/\btraffic sources?\b|\betsy search\b|\bsearch terms?\b/.test(text)) addKind("traffic-sources", "Traffic source or Etsy Search signal found");
    if (/\bkeyword research\b/.test(text) || (includeHeaderHeuristics && /\bkeyword\b/.test(headerText) && /\b(search|searches|volume|competition)\b/.test(headerText))) addKind("keyword-research", "Keyword research headers or label found");
    if (/\bproduct facts?\b|\bproduct specifications?\b/.test(text) || (includeHeaderHeuristics && /\bmaterial\b/.test(headerText) && /\b(size|dimensions|production method)\b/.test(headerText))) addKind("product-facts", "Product specification signal found");
    if (/\bcost (and )?fulfilment\b|\bcost (and )?fulfillment\b|\bsupplier cost\b|\bshipping cost\b/.test(text)) addKind("cost-fulfilment", "Cost or fulfilment signal found");
    if (/\bdesign mockup\b|\bmockup proof\b|\bdesign proof\b/.test(text)) addKind("design", "Design or mockup signal found");
    if (/\bsocial results?\b|\bsocial analytics\b/.test(text) || (includeHeaderHeuristics && ["instagram", "pinterest", "facebook", "threads"].includes(source ?? "") && /\b(clicks?|impressions?|reach|saves?|engagement)\b/.test(headerText))) addKind("social-results", "Social analytics signal found");
    if (!found.length && includeHeaderHeuristics && /\blisting id\b/.test(headerText) && /\bviews?\b/.test(headerText) && /\b(orders?|favorites?)\b/.test(headerText)) addKind("listing-performance", "Listing ID with performance metric headers found");
    return found;
  };
  const fileKinds = detectKinds(fileText, false, "filename");
  const fallbackKinds = fileKinds.length ? [] : detectKinds([headerText, contentText].filter(Boolean).join(" "), true, "headers/content");
  const detectedKinds = fileKinds.length ? fileKinds : fallbackKinds;
  const kindCandidates = detectedKinds.map((item) => item.kind);
  signals.push(...detectedKinds.map((item) => item.signal));
  const kind = uniqueClassificationCandidate(kindCandidates);

  const matchedTargets = (input.targets ?? []).filter((target) => {
    const labels = [target.targetId, ...target.labels]
      .map(normalizeClassificationText)
      .filter((label) => label.length >= 4);
    return labels.some((label) => corpus.includes(label));
  });
  if (!matchedTargets.length && kind === "shop-stats") {
    matchedTargets.push({ targetType: "shop", targetId: "shop", labels: ["Entire shop"] });
    signals.push("Shop Stats deterministically targets the entire shop");
  }
  const uniqueTargets = Array.from(new Map(matchedTargets.map((target) => [`${target.targetType}:${target.targetId}`, target])).values());
  const target = uniqueTargets.length === 1 ? uniqueTargets[0] : undefined;
  if (target) signals.push(`Target matched: ${target.targetType} ${target.targetId}`);

  const normalizedFileDates = Array.from(new Set((input.name.match(/20\d{2}[-_.]\d{2}[-_.]\d{2}/g) ?? []).map(normalizeIsoDate).filter((date): date is string => Boolean(date))));
  const rawContent = input.contentText ?? "";
  const labeledStart = normalizeIsoDate(rawContent.match(/(?:coverage\s+)?start(?:\s+date)?\s*[:=,]\s*(20\d{2}[-_.]\d{2}[-_.]\d{2})/i)?.[1] ?? "");
  const labeledEnd = normalizeIsoDate(rawContent.match(/(?:coverage\s+)?end(?:\s+date)?\s*[:=,]\s*(20\d{2}[-_.]\d{2}[-_.]\d{2})/i)?.[1] ?? "");
  const periodStarts: string[] = [];
  const periodEnds: string[] = [];
  if (normalizedFileDates.length === 1) {
    periodStarts.push(normalizedFileDates[0]);
    periodEnds.push(normalizedFileDates[0]);
    signals.push(`Single-date coverage found in filename: ${normalizedFileDates[0]}`);
  } else if (normalizedFileDates.length === 2) {
    const [start, end] = [...normalizedFileDates].sort();
    periodStarts.push(start);
    periodEnds.push(end);
    signals.push(`Date range found in filename: ${start} to ${end}`);
  } else if (normalizedFileDates.length > 2) {
    signals.push("More than two filename dates found; period needs owner review");
  }
  if (labeledStart) {
    periodStarts.push(labeledStart);
    signals.push(`Labeled start date found: ${labeledStart}`);
  }
  if (labeledEnd) {
    periodEnds.push(labeledEnd);
    signals.push(`Labeled end date found: ${labeledEnd}`);
  }
  const periodStart = uniqueClassificationCandidate(periodStarts);
  const periodEnd = uniqueClassificationCandidate(periodEnds);

  const ambiguity: EvidenceClassificationField[] = [];
  if (!kind) ambiguity.push("kind");
  if (!source) ambiguity.push("source");
  if (!target) ambiguity.push("target");
  if (!periodStart) ambiguity.push("periodStart");
  if (!periodEnd) ambiguity.push("periodEnd");
  return {
    kind,
    source,
    targetType: target?.targetType,
    targetId: target?.targetId,
    periodStart,
    periodEnd,
    status: ambiguity.length ? "ambiguous" : "classified",
    ambiguity,
    signals,
  };
}

export function isEvidenceFileClassificationReady(classification: EvidenceFileClassification) {
  return classification.status === "classified"
    && Boolean(classification.kind && classification.source && classification.targetType && classification.targetId && classification.periodStart && classification.periodEnd)
    && classification.periodStart! <= classification.periodEnd!;
}

export type EvidenceGroupMetricValue = { value: number | null; status: MetricStatus; artifactIds: string[] };
export type EvidenceGroupMetric = {
  canonicalLabel: string;
  displayLabel: string;
  value: number | null;
  status: MetricStatus | "conflict";
  artifactIds: string[];
  duplicateArtifactIds: string[];
  variants: EvidenceGroupMetricValue[];
};
export type EvidenceGroup = {
  key: string;
  source: EvidenceSource;
  kind: EvidenceKind;
  targetType: EvidenceArtifact["targetType"];
  targetId: string;
  periodStart: string;
  periodEnd: string;
  artifactIds: string[];
  confirmedArtifactIds: string[];
  eligibleArtifactIds: string[];
  unconfirmedArtifactIds: string[];
  ocrReviewOnlyArtifactIds: string[];
  metrics: EvidenceGroupMetric[];
  conflicts: string[];
  duplicateArtifactIds: string[];
  stale: boolean;
  ageDays: number | null;
};

export type CoachEvidenceInventory = {
  known: string[];
  dated: string[];
  missing: string[];
  invalid: string[];
  zero: string[];
  stale: string[];
  conflicting: string[];
  unconfirmed: string[];
  ocrReviewOnly: string[];
  duplicates: string[];
  protected: string[];
};
export type CoachDiagnosis = {
  mode: "existing-listing" | "new-product-niche";
  stage: string;
  firstBrokenLink: string;
  verdict: string;
  evidence: CoachEvidenceInventory;
  nextAction: { label: string; detail: string; tab: OperationsTab };
  reviewSignal: string;
};
export type CoachDiagnosisInput = {
  activeDesignId?: string;
  selectedListingId?: string;
  periodStart?: string;
  periodEnd?: string;
  asOf?: string;
  staleAfterDays?: number;
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
export type EvidenceIntakeStepStatus = "missing" | "review" | "confirmed" | "not-eligible" | "conflict";
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
  { id: "product-standard-journal", name: "Sample Printed Journal", type: "Journal", material: "Public demo placeholder — import owner-confirmed material details locally", size: "Public demo placeholder — confirm the exact variant before drafting", productionMethod: "Public demo placeholder — do not make production claims without local evidence", fulfilmentSource: "Private owner data required", costSource: "Private owner data required", allowedClaims: "sample personalized journal", blockedClaims: "engraved, embossed, debossed, unverified material, size, production, shipping, or price claims", sourceNote: "Public demo only. Import owner-confirmed product facts and cost evidence locally." },
  { id: "product-acrylic-led-plaque", name: "Sample Acrylic Display", type: "Acrylic Display", material: "Public demo placeholder — import owner-confirmed material details locally", size: "Public demo placeholder — confirm the exact variant before drafting", productionMethod: "Public demo placeholder — do not make production claims without local evidence", fulfilmentSource: "Private owner data required", costSource: "Private owner data required", allowedClaims: "sample personalized display", blockedClaims: "unverified material, size, production, shipping, lighting, or price claims", sourceNote: "Public demo only. Import owner-confirmed product facts and cost evidence locally." },
];

const KNOWN_DESIGNS: Design[] = [
  {
    id: "demo-design-journal",
    name: "Sample Family Journal Design",
    productId: "product-standard-journal",
    recipient: "Family member",
    occasion: "Sample keepsake occasion",
    mockupStatus: "ready",
    assetName: "sample-journal-preview.jpg",
    sourceNote: "Public demo only. Import the private owner design record and source evidence locally.",
  },
];

export const DEFAULT_STATE: EtsyOperationsState = {
  version: 1,
  migratedLegacy: false,
  artifacts: [],
  products: KNOWN_PRODUCT_CARDS,
  designs: KNOWN_DESIGNS,
  listings: [
    { id: "demo-listing-a", title: "Sample active listing", protected: true },
    { id: "demo-listing-b", title: "Sample protected comparison", protected: true },
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
  return state.products.length === 0 ? { ...state, products: [...KNOWN_PRODUCT_CARDS] } : state;
}

export function hydrateKnownDesigns(state: EtsyOperationsState): EtsyOperationsState {
  return state.designs.length === 0 ? { ...state, designs: [...KNOWN_DESIGNS] } : state;
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

const CANONICAL_METRIC_ALIASES: Record<string, string> = {
  view: "views",
  views: "views",
  "listing view": "views",
  "listing views": "views",
  visit: "visits",
  visits: "visits",
  favorite: "favorites",
  favorites: "favorites",
  favourite: "favorites",
  favourites: "favorites",
  "item favorite": "favorites",
  "item favorites": "favorites",
  order: "orders",
  orders: "orders",
  revenue: "revenue",
  sales: "revenue",
  "etsy revenue": "revenue",
  click: "clicks",
  clicks: "clicks",
  impression: "impressions",
  impressions: "impressions",
  save: "saves",
  saves: "saves",
  reach: "reach",
  engagement: "engagement",
  "conversion rate": "conversion-rate",
};

const CANONICAL_METRIC_LABELS: Record<string, string> = {
  views: "Views",
  visits: "Visits",
  favorites: "Favorites",
  orders: "Orders",
  revenue: "Revenue",
  clicks: "Clicks",
  impressions: "Impressions",
  saves: "Saves",
  reach: "Reach",
  engagement: "Engagement",
  "conversion-rate": "Conversion rate",
};

export function canonicalMetricLabel(label: string) {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9% ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return CANONICAL_METRIC_ALIASES[normalized] ?? normalized.replace(/\s+/g, "-");
}

export function evidenceAgeDays(periodEnd: string, asOf: string) {
  const end = Date.parse(`${periodEnd}T00:00:00Z`);
  const now = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(now) || end > now) return null;
  return Math.floor((now - end) / 86_400_000);
}

export function isEvidencePeriodStale(periodEnd: string, asOf: string, staleAfterDays?: number) {
  if (staleAfterDays === undefined || !Number.isFinite(staleAfterDays) || staleAfterDays < 0) return false;
  const ageDays = evidenceAgeDays(periodEnd, asOf);
  return ageDays !== null && ageDays > staleAfterDays;
}

export function deriveEvidenceGroups(
  artifacts: EvidenceArtifact[],
  options: { asOf?: string; staleAfterDays?: number } = {},
): EvidenceGroup[] {
  const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
  const buckets = new Map<string, EvidenceArtifact[]>();
  for (const artifact of artifacts) {
    const key = JSON.stringify([artifact.source, artifact.kind, artifact.targetType, artifact.targetId, artifact.periodStart, artifact.periodEnd]);
    buckets.set(key, [...(buckets.get(key) ?? []), artifact]);
  }
  return Array.from(buckets.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, groupedArtifacts]) => {
      const first = groupedArtifacts[0];
      const confirmedArtifacts = groupedArtifacts.filter((artifact) => artifact.ownerConfirmed);
      const readableArtifacts = confirmedArtifacts.filter((artifact) => !artifact.mimeType.startsWith("image/") || (artifact.ocrStatus === "confirmed" && Boolean(artifact.contentText?.trim())));
      const metricBuckets = new Map<string, Array<{ artifactId: string; metric: Metric }>>();
      for (const artifact of readableArtifacts) {
        for (const metric of artifact.metrics) {
          const canonical = canonicalMetricLabel(metric.label);
          metricBuckets.set(canonical, [...(metricBuckets.get(canonical) ?? []), { artifactId: artifact.id, metric }]);
        }
      }
      const metrics = Array.from(metricBuckets.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([canonicalLabel, entries]): EvidenceGroupMetric => {
          const variantBuckets = new Map<string, Array<{ artifactId: string; metric: Metric }>>();
          for (const entry of entries) {
            const variantKey = JSON.stringify([entry.metric.status, entry.metric.value]);
            variantBuckets.set(variantKey, [...(variantBuckets.get(variantKey) ?? []), entry]);
          }
          const variants = Array.from(variantBuckets.values()).map((variantEntries) => ({
            value: variantEntries[0].metric.value,
            status: variantEntries[0].metric.status,
            artifactIds: Array.from(new Set(variantEntries.map((entry) => entry.artifactId))),
          }));
          const duplicateArtifactIds = Array.from(new Set(variants.flatMap((variant) => variant.artifactIds.slice(1))));
          const conflict = variants.length > 1;
          return {
            canonicalLabel,
            displayLabel: CANONICAL_METRIC_LABELS[canonicalLabel] ?? entries[0].metric.label.trim(),
            value: conflict ? null : variants[0].value,
            status: conflict ? "conflict" : variants[0].status,
            artifactIds: Array.from(new Set(entries.map((entry) => entry.artifactId))),
            duplicateArtifactIds,
            variants,
          };
        });
      return {
        key,
        source: first.source,
        kind: first.kind,
        targetType: first.targetType,
        targetId: first.targetId,
        periodStart: first.periodStart,
        periodEnd: first.periodEnd,
        artifactIds: groupedArtifacts.map((artifact) => artifact.id),
        confirmedArtifactIds: confirmedArtifacts.map((artifact) => artifact.id),
        eligibleArtifactIds: confirmedArtifacts.filter(isEvidenceEligibleForDecision).map((artifact) => artifact.id),
        unconfirmedArtifactIds: groupedArtifacts.filter((artifact) => !artifact.ownerConfirmed).map((artifact) => artifact.id),
        ocrReviewOnlyArtifactIds: confirmedArtifacts.filter((artifact) => artifact.mimeType.startsWith("image/") && (artifact.ocrStatus !== "confirmed" || !artifact.contentText?.trim())).map((artifact) => artifact.id),
        metrics,
        conflicts: metrics.filter((metric) => metric.status === "conflict").map((metric) => metric.canonicalLabel),
        duplicateArtifactIds: Array.from(new Set(metrics.flatMap((metric) => metric.duplicateArtifactIds))),
        stale: isEvidencePeriodStale(first.periodEnd, asOf, options.staleAfterDays),
        ageDays: evidenceAgeDays(first.periodEnd, asOf),
      };
    });
}

function emptyCoachInventory(): CoachEvidenceInventory {
  return { known: [], dated: [], missing: [], invalid: [], zero: [], stale: [], conflicting: [], unconfirmed: [], ocrReviewOnly: [], duplicates: [], protected: [] };
}

function addUnique(items: string[], value: string) {
  if (!items.includes(value)) items.push(value);
}

function evidenceGroupLabel(group: EvidenceGroup) {
  const target = group.targetType === "shop" ? "shop" : `${group.targetType} ${group.targetId}`;
  return `${group.kind} · ${target} · ${group.periodStart || "no start"} → ${group.periodEnd || "no end"}`;
}

function populateCoachInventory(inventory: CoachEvidenceInventory, groups: EvidenceGroup[], artifacts: EvidenceArtifact[]) {
  const artifactsById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  for (const group of groups) {
    const label = evidenceGroupLabel(group);
    if (group.eligibleArtifactIds.length) addUnique(inventory.known, `${label} · owner-confirmed`);
    addUnique(inventory.dated, `${label} · ${group.ageDays === null ? "age unavailable" : `${group.ageDays} day${group.ageDays === 1 ? "" : "s"} since period end`}`);
    if (group.stale) addUnique(inventory.stale, label);
    for (const artifactId of group.unconfirmedArtifactIds) addUnique(inventory.unconfirmed, artifactsById.get(artifactId)?.fileName ?? artifactId);
    for (const artifactId of group.ocrReviewOnlyArtifactIds) addUnique(inventory.ocrReviewOnly, artifactsById.get(artifactId)?.fileName ?? artifactId);
    for (const metric of group.metrics) {
      const metricLabel = `${label} · ${metric.displayLabel}`;
      if (metric.status === "conflict") addUnique(inventory.conflicting, metricLabel);
      else if (metric.status === "invalid") addUnique(inventory.invalid, metricLabel);
      else if (metric.status === "missing") addUnique(inventory.missing, metricLabel);
      else {
        addUnique(inventory.known, `${metricLabel} = ${metric.value}`);
        if (metric.status === "confirmed-zero") addUnique(inventory.zero, metricLabel);
      }
      if (metric.duplicateArtifactIds.length) addUnique(inventory.duplicates, `${metricLabel} · ${metric.duplicateArtifactIds.length} exact duplicate file(s) ignored`);
    }
  }
}

function groupMetric(group: EvidenceGroup | undefined, canonicalLabel: string) {
  return group?.metrics.find((metric) => metric.canonicalLabel === canonicalLabel);
}

export function buildCoachDiagnosis(state: EtsyOperationsState, input: CoachDiagnosisInput = {}): CoachDiagnosis {
  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
  const selectedListing = state.listings.find((listing) => listing.id === input.selectedListingId);
  const activeDesign = state.designs.find((design) => design.id === input.activeDesignId);
  const activeProduct = state.products.find((product) => product.id === activeDesign?.productId);
  const mode: CoachDiagnosis["mode"] = selectedListing ? "existing-listing" : "new-product-niche";
  const allGroups = deriveEvidenceGroups(state.artifacts, { asOf, ...(input.staleAfterDays === undefined ? {} : { staleAfterDays: input.staleAfterDays }) });
  const relevantGroups = mode === "existing-listing"
    ? allGroups.filter((group) => group.source === "etsy" && ["shop-stats", "listing-performance", "traffic-sources"].includes(group.kind) && (!input.periodStart || group.periodStart === input.periodStart) && (!input.periodEnd || group.periodEnd === input.periodEnd) && (group.targetType === "shop" || group.targetId === selectedListing?.id))
    : allGroups.filter((group) => Boolean(activeDesign) && (group.targetId === activeDesign?.id || group.targetId === activeDesign?.productId));
  const evidence = emptyCoachInventory();
  populateCoachInventory(evidence, relevantGroups, state.artifacts);
  if (selectedListing?.protected) addUnique(evidence.protected, `${selectedListing.title} (${selectedListing.id}) · read-only`);

  const diagnosis = (
    stage: string,
    firstBrokenLink: string,
    verdict: string,
    nextAction: CoachDiagnosis["nextAction"],
    reviewSignal: string,
  ): CoachDiagnosis => ({ mode, stage, firstBrokenLink, verdict, evidence, nextAction, reviewSignal });

  if (!activeDesign || !activeDesign.recipient.trim() || !activeDesign.occasion.trim()) {
    addUnique(evidence.missing, "Buyer, recipient and buying occasion");
    return diagnosis(
      activeDesign ? "Buyer / occasion" : "Choose working context",
      "Buyer / occasion missing",
      "先講清楚邊個買、送畀邊個同咩場合；未過呢關，唔應該跳去 keyword、listing 或圖片建議。",
      { label: "Define buyer + occasion", detail: "Open the existing Product + Design Library and complete one buyer/occasion hypothesis.", tab: "library" },
      "能用一句話講清楚誰買、送給誰、為甚麼場合。",
    );
  }
  addUnique(evidence.known, `Buyer / occasion · ${activeDesign.recipient} · ${activeDesign.occasion}`);

  if (mode === "existing-listing") {
    if (!input.periodStart || !input.periodEnd || input.periodStart > input.periodEnd) {
      addUnique(evidence.missing, "Comparable reporting period");
      return diagnosis(
        "Traffic / conversion diagnosis",
        "Comparable period missing",
        "先鎖定同一個 listing 同 reporting period，再收三條 Etsy first-party evidence lane。",
        { label: "Choose comparable evidence", detail: "Open the existing Research tab and choose the listing plus valid start/end dates.", tab: "research" },
        "Listing、start date 同 end date 已鎖定，而且三份來源使用同一期間。",
      );
    }
    const laneGroup = (kind: EvidenceIntakeKind) => relevantGroups
      .filter((group) => group.kind === kind && (kind === "shop-stats" ? group.targetType === "shop" : kind === "listing-performance" ? group.targetType === "listing" && group.targetId === selectedListing?.id : group.targetId === selectedListing?.id || group.targetType === "shop"))
      .sort((left, right) => Number(right.targetId === selectedListing?.id) - Number(left.targetId === selectedListing?.id))[0];
    const lanes = EVIDENCE_INTAKE_REQUIREMENTS.map((requirement) => ({ requirement, group: laneGroup(requirement.kind) }));
    for (const { requirement, group } of lanes) if (!group) addUnique(evidence.missing, `${requirement.label} · ${input.periodStart} → ${input.periodEnd}`);
    const conflictGroup = relevantGroups.find((group) => group.conflicts.length);
    if (conflictGroup) {
      return diagnosis(
        "Traffic / conversion diagnosis",
        "Conflicting first-party evidence",
        "同一 evidence group 有互相衝突嘅值或 truth status；未經 owner 解決前，Coach diagnosis 必須停止。",
        { label: "Resolve evidence conflict", detail: "Open the existing Research review and keep the conflicting files visible while the owner confirms the correct source.", tab: "research" },
        "每個 canonical metric 只剩一個 owner-confirmed truth value；exact duplicate 只使用一次。",
      );
    }
    const invalidGroup = lanes.find(({ group }) => group?.metrics.some((metric) => metric.status === "invalid"));
    if (invalidGroup?.group) {
      return diagnosis(
        "Traffic / conversion diagnosis",
        "Invalid first-party value",
        "Invalid 唔係零；先更正或換一份同期間 export，暫時唔作 traffic／conversion 判斷。",
        { label: "Replace invalid evidence", detail: "Open the existing Research review and replace the invalid file without deleting valid files.", tab: "research" },
        "三條 lane 沒有 invalid metric，confirmed zero 仍然保留為有效零值。",
      );
    }
    const missingMetricGroup = lanes.find(({ group }) => group?.metrics.some((metric) => metric.status === "missing"));
    if (missingMetricGroup?.group) {
      return diagnosis(
        "Traffic / conversion diagnosis",
        "First-party value missing",
        "Missing 唔係零；先補返缺失欄位，唔應該用其他檔案相加估算。",
        { label: "Complete missing evidence", detail: "Open the existing Research review and add a complete export for the same group.", tab: "research" },
        "Required fields are present or explicitly confirmed zero in every comparable lane。",
      );
    }
    const unavailableLane = lanes.find(({ group }) => !group?.eligibleArtifactIds.length);
    if (unavailableLane) {
      const hasOcrOnly = Boolean(unavailableLane.group?.ocrReviewOnlyArtifactIds.length);
      const hasUnconfirmed = Boolean(unavailableLane.group?.unconfirmedArtifactIds.length);
      return diagnosis(
        "Traffic / conversion diagnosis",
        hasOcrOnly ? "OCR review incomplete" : hasUnconfirmed ? "Owner confirmation missing" : "Comparable first-party evidence incomplete",
        hasOcrOnly
          ? "OCR-only／visual-only evidence 唔可以當 numeric truth；先完成 review 或提供 structured export。"
          : hasUnconfirmed
            ? "檔案已保存但未 owner-confirm；未確認 evidence 會保留可見，但排除於 diagnosis。"
            : "三條同期間 Etsy first-party lane 未齊，暫時保持 Unknown / Collect data。",
        { label: "Complete comparable evidence", detail: "Use the existing Evidence Intake Stepper; valid files stay saved even if another file failed.", tab: "research" },
        "Shop Stats、Listing Performance、Traffic Sources 全部同期間、owner-confirmed 並 decision-ready。",
      );
    }
    const staleGroup = lanes.find(({ group }) => group?.stale);
    if (staleGroup?.group) {
      return diagnosis(
        "Traffic / conversion diagnosis",
        "Comparable evidence stale",
        "呢個 first-party window 已超出目前本機 freshness review window；保留歷史值，但唔用作當前 Coach 結論。",
        { label: "Refresh comparable evidence", detail: "Open the existing Research tab and add a current owner-approved comparison window.", tab: "research" },
        "三條 lane 使用未過期、相同日期嘅 owner-confirmed evidence。",
      );
    }
    const performance = laneGroup("listing-performance");
    const views = groupMetric(performance, "views");
    const favorites = groupMetric(performance, "favorites");
    const orders = groupMetric(performance, "orders");
    for (const [label, metric] of [["Views", views], ["Favorites", favorites], ["Orders", orders]] as const) if (!metric) addUnique(evidence.missing, `Listing Performance ${label}`);
    if (!views || !favorites || !orders) {
      return diagnosis(
        "Traffic / conversion diagnosis",
        "Required listing metrics missing",
        "三條 evidence lane 已在，但 Listing Performance 未提供完整 Views、Favorites 同 Orders。",
        { label: "Add complete listing metrics", detail: "Open the existing Research review and add a complete Listing Performance export.", tab: "research" },
        "Views、Favorites、Orders 都有 confirmed 或 confirmed-zero truth state。",
      );
    }
    const protectedPrefix = selectedListing?.protected ? "呢個 listing 保持 protected／read-only。" : "";
    if (views.status === "confirmed-zero") {
      return diagnosis(
        "Traffic",
        "Traffic signal is confirmed zero",
        `${protectedPrefix} Views 係有效零值，代表目前未有足夠 discovery signal 去判 conversion；唔好先改圖片或價格。`,
        { label: "Review traffic evidence", detail: "Open the existing read-only Analysis tab and inspect buyer intent, search terms and listing coherence.", tab: "analysis" },
        "下一個 owner-approved period 有可比較 Search visits／Views；零值仍然保留為零。",
      );
    }
    if ((views.value ?? 0) > 0 && favorites.status === "confirmed-zero" && orders.status === "confirmed-zero") {
      return diagnosis(
        "Offer clarity / image conversion",
        "Intent signal not observed",
        `${protectedPrefix} 買家已有見到 listing，但 Favorites 同 Orders 仍係 confirmed zero；只可 draft-review 一個 offer 或 first-image message 變數，唔聲稱因果。`,
        { label: "Review one message variable", detail: "Open the existing read-only Analysis tab and choose one draft-only variable for owner review.", tab: "analysis" },
        "同一 owner-approved period 比較 Views、Favorites、Orders；只判訊號變化，不宣稱單一原因。",
      );
    }
    return diagnosis(
      "Learning",
      "No earlier evidence break found",
      `${protectedPrefix} Comparable first-party evidence 已齊；保留現有 truth，喺 read-only analysis 揀一個可驗證問題。`,
      { label: "Review the diagnosis", detail: "Open the existing Analysis tab; no Etsy change is performed here.", tab: "analysis" },
      "Owner confirms one draft-only question and a comparable first-party signal for the next review。",
    );
  }

  const marketGroups = relevantGroups.filter((group) => group.kind === "keyword-research" && ["etsy", "erank", "everbee"].includes(group.source));
  const marketConflict = marketGroups.find((group) => group.conflicts.length);
  if (marketConflict) {
    return diagnosis(
      "Demand evidence",
      "Market signal conflicts",
      "同一 market evidence group 出現衝突；先解決來源 truth，唔好開始設計或 listing copy。",
      { label: "Resolve market evidence", detail: "Open the existing Research tab and review the conflicting files.", tab: "research" },
      "每個 canonical metric 只剩一個 owner-confirmed truth value。",
    );
  }
  const usableMarketGroup = marketGroups.find((group) => group.eligibleArtifactIds.length && !group.stale && !group.metrics.some((metric) => metric.status === "missing" || metric.status === "invalid"));
  if (!usableMarketGroup) {
    const staleMarket = marketGroups.find((group) => group.stale);
    const invalidMarket = marketGroups.find((group) => group.metrics.some((metric) => metric.status === "invalid"));
    const missingMarket = marketGroups.find((group) => group.metrics.some((metric) => metric.status === "missing"));
    const ocrMarket = marketGroups.find((group) => group.ocrReviewOnlyArtifactIds.length);
    const unconfirmedMarket = marketGroups.find((group) => group.unconfirmedArtifactIds.length);
    addUnique(evidence.missing, "Owner-confirmed market / buyer signal for the selected target and period");
    return diagnosis(
      "Demand evidence",
      staleMarket ? "Market signal stale" : invalidMarket ? "Market evidence invalid" : missingMarket ? "Market evidence value missing" : ocrMarket ? "Market OCR review incomplete" : unconfirmedMarket ? "Market evidence unconfirmed" : "Market / buyer signal missing",
      staleMarket
        ? "Market evidence 仍可作歷史 context，但已過 freshness window；先 refresh，唔好投入 production。"
        : invalidMarket
          ? "Invalid market value 唔係零；先更正來源，唔可以用錯誤數值支持新 product／niche。"
          : missingMarket
            ? "Market evidence 有缺失欄位；missing 唔係 confirmed zero，先補完整來源。"
        : ocrMarket
          ? "Market screenshot 未完成 OCR review；visual-only evidence 唔可以當 numeric demand truth。"
          : unconfirmedMarket
            ? "Market file 已保存但未 owner-confirm；未確認 evidence 會排除於 Coach 結論。"
            : "Buyer/occasion 已清楚，但未有市場／買家訊號；先做最小 research，暫時唔好設計。",
      { label: "Collect one market signal", detail: "Open the existing Research tab and add one dated Etsy/eRank/EverBee source for this design or product.", tab: "research" },
      "有一份 owner-confirmed、target-matched market signal；如 owner 設定 freshness policy，亦要符合該明示規則。missing、invalid 同 OCR-only 仍分開。",
    );
  }
  addUnique(evidence.known, `Market signal · ${evidenceGroupLabel(usableMarketGroup)}`);
  const productGaps = activeProduct ? productFactGaps(state, activeProduct.id) : ["Linked product truth"];
  if (productGaps.length || activeDesign.mockupStatus !== "ready") {
    for (const gap of productGaps) addUnique(evidence.missing, gap);
    if (activeDesign.mockupStatus !== "ready") addUnique(evidence.missing, "Product-specific mockup or exact product proof");
    return diagnosis(
      "Product / niche fit",
      "Product / niche fit not evidenced",
      "Market signal 已在，但產品 truth、gift fit 或 exact mockup 未齊；先補 product/niche fit，唔好跳到 SEO 文案。",
      { label: "Complete product fit", detail: "Open the existing Product + Design Library and complete the missing product truth.", tab: "library" },
      "Product facts、cost/fulfilment、design recipient/occasion 同 exact mockup 都有 owner-confirmed support。",
    );
  }
  const loop = state.keywordResearchLoops.find((item) => item.designId === activeDesign.id);
  if (loop?.stage !== "conclusion-ready" || !loop.primaryKeyword) {
    return diagnosis(
      "Product / niche fit",
      "Market evidence not yet translated into a fit decision",
      "證據已齊到可以比較，但未形成 product/niche fit conclusion；先完成分析，唔好直接起 listing。",
      { label: "Review product / niche fit", detail: "Open the existing Analysis tab and complete the evidence-backed fit decision.", tab: "analysis" },
      "有一個 evidence-backed primary direction、supporting context 同清楚 avoid terms。",
    );
  }
  const draftState = deriveActiveDraftState(state.listingDrafts, activeDesign.id);
  if (!draftState.currentDraft) {
    return diagnosis(
      "Listing meaning",
      "Coherent listing message not drafted",
      "Buyer、market 同 fit direction 已齊；下一步只係建立一份 local Listing Brief，保持 design、title、tags、attributes、description、offer 同 images 意思一致。",
      { label: "Open Listing Brief", detail: "Use the existing Listing Brief workspace; nothing is published or sent to Etsy.", tab: "results" },
      "一份 local draft 清楚表達同一 buyer、occasion、product promise 同 evidence-backed keyword direction。",
    );
  }
  return diagnosis(
    "Learning",
    "Owner review is the next gate",
    "Coach sequence 已去到 local draft；保留 owner gate，先 review truth 同一致性，唔自動發佈。",
    { label: "Review local draft", detail: "Open the existing Listing Brief and use its current owner-controlled approval gate.", tab: "results" },
    "Owner confirms the draft is coherent and chooses whether it is approved for later manual entry。",
  );
}

export function buildEvidenceIntakeSteps(state: EtsyOperationsState, listingId: string, periodStart: string, periodEnd: string): EvidenceIntakeStep[] {
  return EVIDENCE_INTAKE_REQUIREMENTS.map((requirement) => {
    const matches = state.artifacts
      .filter((artifact) => artifact.kind === requirement.kind && artifact.source === "etsy" && artifact.periodStart === periodStart && artifact.periodEnd === periodEnd && matchesIntakeTarget(artifact, requirement.kind, listingId))
      .sort((a, b) => `${b.uploadedAt}${b.id}`.localeCompare(`${a.uploadedAt}${a.id}`));
    const groups = deriveEvidenceGroups(matches);
    const conflict = groups.some((group) => group.conflicts.length > 0);
    const selected = matches.find((artifact) => isEvidenceEligibleForDecision(artifact)) ?? matches.find((artifact) => artifact.ownerConfirmed) ?? matches[0];
    const status: EvidenceIntakeStepStatus = !selected
      ? "missing"
      : conflict
        ? "conflict"
      : isEvidenceEligibleForDecision(selected)
        ? "confirmed"
        : selected.ownerConfirmed
          ? "not-eligible"
          : "review";
    const detail = status === "conflict"
      ? "Conflicting values or truth statuses exist in this exact source / kind / target / period group. Owner resolution is required before diagnosis."
      : status === "confirmed"
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
