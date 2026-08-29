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
  /** Optional Product Development research lineage; legacy evidence remains valid without it. */
  researchRoundId?: string;
  researchSeedVersion?: string;
  researchOriginatingQueries?: string[];
  researchSourceDate?: string;
  researchFreshnessPolicy?: ResearchFreshnessPolicy;
  /** Additive Results Inbox batch lineage. Legacy artifacts deliberately remain valid without it. */
  researchBatchId?: string;
  researchArtifactOrdinal?: number;
  researchSeedIds?: string[];
  researchSeedOverrideId?: string;
  researchArtifactStatus?: ResearchArtifactStatus;
  researchCapturedAt?: string;
  researchCapturedAtHk?: string;
  researchRawRecovery?: ResearchRawRecovery;
  rawFingerprint?: string;
  /** Exact Individual task target. Filename and upload order have no authority. */
  researchQueryTaskId?: string;
  researchOriginatingQuery?: string;
  researchIntentDimensionId?: string;
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

export type Design = {
  id: string;
  name: string;
  productId: string;
  recipient: string;
  occasion: string;
  mockupStatus: "missing" | "ready";
  assetName: string;
  sourceNote?: string;
  previewDataUrl?: string;
  analysisText?: string;
  analysisBasis?: "local-ocr" | "safe-default";
  visualTone?: DesignVisualTone;
  visualShape?: DesignVisualShape;
  aspectRatio?: number;
  productSuggestionReason?: string;
  suggestedProductId?: string;
  archivedAt?: string;
};

export type DesignVisualTone = "dark" | "light" | "mixed" | "unknown";
export type DesignVisualShape = "square" | "rectangular";
export type DesignVisualProfile = {
  tone: DesignVisualTone;
  shape: DesignVisualShape;
  aspectRatio: number;
};

export type DesignProductRecommendation = {
  productId: string;
  productKind: "journal" | "acrylic";
  confidence: "high" | "medium";
  reason: string;
};

export type DesignSuggestion = {
  name: string;
  recipient: string;
  occasion: string;
  detectedText: string;
  basis: "local-ocr" | "safe-default";
};

const DESIGN_RECIPIENT_RULES: Array<[RegExp, string]> = [
  [/\bpastor\b|\bminister\b|\breverend\b|牧師|牧者/i, "Pastor"],
  [/\bgranddaughter\b|孫女/i, "Granddaughter"],
  [/\bgrandson\b|孫仔|孫兒/i, "Grandson"],
  [/\bdaughter(?:\s+in\s+law)?\b|女兒|媳婦/i, "Daughter"],
  [/\bson(?:\s+in\s+law)?\b|兒子|女婿/i, "Son"],
  [/\bwife\b|太太|妻子/i, "Wife"],
  [/\bhusband\b|老公|丈夫/i, "Husband"],
  [/\bmom\b|\bmum\b|\bmother\b|媽媽|母親/i, "Mom"],
  [/\bdad\b|\bfather\b|爸爸|父親/i, "Dad"],
  [/\bsister\b|姊妹|姐姐|妹妹/i, "Sister"],
  [/\bbrother\b|兄弟|哥哥|弟弟/i, "Brother"],
  [/\bbest\s+friend\b|\bfriend\b|朋友/i, "Friend"],
  [/\bsoulmate\b|\bpartner\b|伴侶/i, "Partner"],
];

const DESIGN_OCCASION_RULES: Array<[RegExp, string]> = [
  [/\bpastor(?:'s)?\s+appreciation\b|\bpastor\b|\bminister\b|\breverend\b|牧師|牧者/i, "Pastor appreciation"],
  [/mother'?s\s+day|母親節/i, "Mother's Day"],
  [/father'?s\s+day|父親節/i, "Father's Day"],
  [/valentine'?s\s+day|情人節/i, "Valentine's Day"],
  [/\bbirthday\b|生日/i, "Birthday"],
  [/\banniversary\b|周年|週年/i, "Anniversary"],
  [/\bwedding\b|結婚|婚禮/i, "Wedding"],
  [/\bgraduation\b|畢業/i, "Graduation"],
  [/\bchristmas\b|聖誕/i, "Christmas"],
  [/\bretirement\b|退休/i, "Retirement"],
  [/\bmemorial\b|\bin memory of\b|紀念/i, "Memorial"],
];

function designNameFromFile(fileName: string) {
  const withoutImageExtension = fileName.replace(/\.(?:png|jpe?g|webp)$/i, "");
  const withoutCopySuffix = withoutImageExtension.replace(/\s+(?:的複本|copy(?:\s*\(\d+\))?)$/i, "");
  return withoutCopySuffix.replace(/\.psd$/i, "").trim() || "Untitled design";
}

export function inferDesignSuggestion(fileName: string, ocrText: string): DesignSuggestion {
  const detectedText = ocrText.replace(/\s+/g, " ").trim().slice(0, 1200);
  const searchable = detectedText || designNameFromFile(fileName);
  const recipient = DESIGN_RECIPIENT_RULES.find(([pattern]) => pattern.test(searchable))?.[1] ?? "Gift recipient";
  const occasion = DESIGN_OCCASION_RULES.find(([pattern]) => pattern.test(searchable))?.[1] ?? "Everyday appreciation";
  return {
    name: designNameFromFile(fileName),
    recipient,
    occasion,
    detectedText,
    basis: detectedText ? "local-ocr" : "safe-default",
  };
}

export function recommendDesignProduct(products: Product[], profile: DesignVisualProfile): DesignProductRecommendation | null {
  const journal = products.find((product) => /journal/i.test(`${product.name} ${product.type}`));
  const acrylic = products.find((product) => /acrylic|plaque|display/i.test(`${product.name} ${product.type}`));
  let product: Product | undefined;
  let productKind: DesignProductRecommendation["productKind"];
  let confidence: DesignProductRecommendation["confidence"];
  let reason: string;

  if (profile.tone === "dark" && profile.shape === "rectangular") {
    product = journal;
    productKind = "journal";
    confidence = "high";
    reason = "Dark artwork and a rectangular layout usually fit a printed journal.";
  } else if (profile.tone === "light" && profile.shape === "square") {
    product = acrylic;
    productKind = "acrylic";
    confidence = "high";
    reason = "Light artwork and a square layout usually fit an LED acrylic display.";
  } else if (profile.tone === "dark" || profile.shape === "rectangular") {
    product = journal;
    productKind = "journal";
    confidence = "medium";
    reason = profile.tone === "dark"
      ? "Dark artwork usually prints more clearly on a journal."
      : "A rectangular layout usually fits a journal.";
  } else if (profile.tone === "light" || profile.shape === "square") {
    product = acrylic;
    productKind = "acrylic";
    confidence = "medium";
    reason = profile.tone === "light"
      ? "Light artwork usually stands out on an LED acrylic display."
      : "A square layout usually fits an acrylic display.";
  } else {
    return null;
  }

  return product ? { productId: product.id, productKind, confidence, reason } : null;
}
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
export type ResearchContext = { designId: string; productId: string; roundId: string; seedVersion: string };
export type ResearchOwnerGateContext = ResearchContext & { gateType: "research-to-listing-brief"; approvedAt: string };
export type OwnerGate = { id: string; subject: string; status: "draft" | "need-evidence" | "approved-for-draft"; evidenceIds: string[]; missing: string[]; nextStep: string; researchContext?: ResearchOwnerGateContext };
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
export type ListingDraft = { id: string; productId: string; designId: string; sourcePacket: string; tags: string[]; evidenceIds: string[]; status: "draft" | "approved-for-manual-entry"; createdAt: string; approvedAt?: string; researchContext?: ResearchContext };
export type ResearchTruthStatus = "confirmed" | "confirmed-zero" | "missing" | "invalid" | "source-unknown";
export type ResearchField<T> = { raw: string; parsed: T | null; status: ResearchTruthStatus };
export function researchTruthStatusLabel(status: ResearchTruthStatus) {
  return status === "source-unknown" ? "source reported Unknown" : status;
}
export type ResearchSource = "erank" | "everbee";
export type ResearchRoundStatus = "draft-preview" | "saved-awaiting-review" | "next-round-needed" | "conclusion-ready" | "owner-approved";
export type ResearchDecision = "retain" | "defer" | "next-round";
export type ResearchFitAssessment = "supported" | "weak" | "missing";
export type ResearchFitReview = {
  buyerOccasionFit: ResearchFitAssessment;
  productFit: ResearchFitAssessment;
  reviewedBy: "owner";
  reviewedAt: string;
};
export type ResearchConclusion = {
  decision: ResearchDecision;
  buyerProductFit: string;
  evidenceBasis: string[];
  blockingTruth: string[];
  nextAction: string;
  reviewSignal: string;
  createdAt: string;
};
export type ResearchActionKind = "close-research" | "collect-missing-input" | "propose-gap-round";
export type ResearchIntentAnchorOrigin = "round-1-seed" | "owner-approved-gap";
export type ResearchIntentAnchor = {
  id: string;
  roundId: string;
  ordinal: number;
  query: string;
  intentDimensionId: string;
  origin: ResearchIntentAnchorOrigin;
  sourceGapCandidateId?: string;
  sourceTargetDimensionId?: string;
  sourceGapAnalysisId?: string;
};
export type RequiredIntentDimension = {
  id: string;
  label: string;
  ordinal: number;
  definition: string;
  anchorIds: string[];
};
export type ResearchQueryTaskStatus = "pending" | "ready" | "received" | "error";
export type ResearchQueryTask = ResearchContext & {
  id: string;
  selectedOrdinal: number;
  query: string;
  normalizedQuery: string;
  intentDimensionId: string;
  anchorId?: string;
  source: ResearchSource;
  status: ResearchQueryTaskStatus;
  artifactIds: string[];
  error?: string;
  createdAt: string;
  updatedAt: string;
};
export type GapCandidateDraft = { query: string; targetDimension: string; extensionLogic: string; supportingRowIds: string[] };
export type ResearchSupportRowLedgerEntry = {
  rowId: string;
  phrase: string;
  originatingQuery: string;
  intentDimensionId: string;
  researchQueryTaskId: string;
  confirmedSearchVolume: number | null;
  confirmedCompetition: number | null;
};
export const RESEARCH_SUPPORT_ROW_LEDGER_LIMIT = 25;
export type GapCandidate = GapCandidateDraft & {
  id: string;
  rawOrdinal: number;
  normalizedQuery: string;
  supportingEligibleRowCount: number;
  confirmedSearchVolume: number | null;
  confirmedCompetition: number | null;
};
export type GapCandidateRejectionReason =
  | "raw-count-not-25" | "completed-query-duplicate" | "candidate-duplicate"
  | "covered-target" | "unknown-target" | "missing-extension-logic"
  | "empty-support" | "missing-support" | "inactive-support"
  | "ineligible-support" | "unstructured-support" | "cross-context-support"
  | "non-completed-support" | "support-covers-target" | "non-researchable-phrase";
export type GapCandidateRejection = {
  reason: GapCandidateRejectionReason;
  rawOrdinal: number;
  normalizedQuery?: string;
  targetDimension?: string;
  supportingRowIds: string[];
};
export type GapCandidateRejectionAudit = { rawCount: number; acceptedRawOrdinals: number[]; rejections: GapCandidateRejection[] };
export type ResearchGapAnalysisOrigin = "manual-json" | "in-product-suggestion";
export type ResearchGapAnalysisAttempt = ResearchContext & {
  id: string;
  rawDrafts: GapCandidateDraft[];
  rejectionAudit: GapCandidateRejectionAudit;
  rankedCandidates: GapCandidate[];
  status: "invalid" | "insufficient-valid" | "proposal-ready";
  createdAt: string;
  origin?: ResearchGapAnalysisOrigin;
};
export type AdaptiveResearchAction = {
  persistedDecision: ResearchDecision;
  actionKind: ResearchActionKind;
  reasonCodes: string[];
  nextAction: string;
  coverage: Array<{ dimensionId: string; covered: boolean; rowIds: string[] }>;
  repeatRate: number;
  blockingInput?: string;
  gapProposal?: GapCandidate[];
  rejectionAudit?: GapCandidateRejectionAudit;
};
export type ResearchRound = {
  id: string;
  designId: string;
  productId: string;
  roundNumber: number;
  seedVersion: string;
  seedSnapshot: [string, string, string, string, string];
  /** New rounds freeze identity as well as display text. Missing ledgers are historical/unmapped. */
  seedLedger?: ResearchSeedLedgerEntry[];
  status: ResearchRoundStatus;
  artifactIds: string[];
  conclusion?: ResearchConclusion;
  fitReview?: ResearchFitReview;
  /** Optional adaptive funnel state. Historical rounds remain valid without it. */
  intentAnchors?: ResearchIntentAnchor[];
  requiredIntentDimensions?: RequiredIntentDimension[];
  adaptiveAction?: AdaptiveResearchAction;
  sourceRoundId?: string;
  sourceGapAnalysisId?: string;
  adaptiveOwnerApproval?: {
    approvedBy: "owner";
    approvedAt: string;
    selectedGapCandidateIds: string[];
  };
  ownerGateId?: string;
  createdAt: string;
  updatedAt: string;
};
export type ResearchSeedLedgerEntry = { id: string; ordinal: number; query: string };
export type ResearchActiveInputLedgerEntry = ResearchSeedLedgerEntry & {
  anchorId: string;
  intentDimensionId: string;
  origin: ResearchIntentAnchorOrigin;
};

/**
 * The frozen queries describe the research lane; a saved design record only
 * supplies the stable identity used to keep evidence isolated.
 */
export function researchFocusLabelForRound(round: Pick<ResearchRound, "seedSnapshot" | "intentAnchors"> | undefined) {
  const persistedQueries = Array.isArray(round?.intentAnchors) && round.intentAnchors.length >= 5
    ? round.intentAnchors.map((anchor) => anchor.query)
    : [];
  const queries = persistedQueries.length ? persistedQueries : (round?.seedSnapshot ?? []);
  const hasPastor = queries.some((query) => /\bpastor\b/i.test(query));
  const hasWorshipLeader = queries.some((query) => /\bworship\s+leader\b/i.test(query));
  if (hasPastor && hasWorshipLeader) return "Pastor + worship leader";
  if (hasPastor) return "Pastor";
  if (hasWorshipLeader) return "Worship leader";
  return queries.length ? "Current frozen research lane" : "No active research focus";
}

export type ResearchBatchStatus = "draft-preview" | "saved" | "partial" | "conflicting";
export type ResearchArtifactStatus = "preview" | "ready" | "saved" | "visual-review-only" | "duplicate-audited" | "conflicting" | "retry-needed" | "raw-reattach-required";
export type ResearchRawRecovery = {
  kind: "screenshot" | "workbook" | "text";
  persisted: boolean;
  thumbnailDataUrl?: string;
  reattachAction?: "file" | "paste";
  message?: string;
};
export type ResearchBatch = {
  id: string;
  designId: string;
  productId: string;
  roundId: string;
  seedVersion: string;
  seedLedger: ResearchSeedLedgerEntry[];
  selectedSeedIds: string[];
  artifactIds: string[];
  status: ResearchBatchStatus;
  createdAt: string;
  createdAtHk: string;
  updatedAt: string;
};
export type ResearchFreshness = "not-assessed" | "current" | "stale";
export type ResearchFreshnessPolicy = { scope: string; maxAgeDays: number; basis: string; effectiveDate: string };
export type ResearchFieldConfirmation = {
  field: "phrase" | "searchVolume" | "competition" | "trend" | "relevanceScore";
  rawFieldOrKey: string;
  confirmedValue: string | number;
  confirmedBy: "owner";
  confirmedAt: string;
};
export type ResearchEvidenceMedium = "structured-export" | "structured-text" | "ocr-image";
export type ResearchResultRow = {
  id: string;
  roundId: string;
  artifactId: string;
  designId: string;
  productId: string;
  seedVersion: string;
  researchBatchId?: string;
  originatingSeedId?: string;
  originatingQuery: string;
  researchQueryTaskId?: string;
  researchOriginatingQuery?: string;
  intentDimensionId?: string;
  source: ResearchSource;
  sourceDate: string;
  phrase: ResearchField<string>;
  searchVolume: ResearchField<number>;
  competition: ResearchField<number>;
  trend: ResearchField<number>;
  relevanceScore: ResearchField<number>;
  flags: {
    stale: boolean;
    freshness: ResearchFreshness;
    ageDays: number | null;
    sourceDateIssue?: "blank" | "malformed" | "future";
    unconfirmed: boolean;
    unmapped: boolean;
    ocrOnly: boolean;
    duplicate: boolean;
    conflicting: boolean;
  };
  fieldConfirmations: ResearchFieldConfirmation[];
  evidenceMedium: ResearchEvidenceMedium;
  lineageKey: string;
  contentFingerprint: string;
  /** Historical evidence retained after a same-value, higher-quality row becomes authoritative for decisions. */
  supersededByRowId?: string;
  createdAt: string;
};
export type ResearchDuplicateAuditEvent = {
  id: string;
  existingArtifactId: string;
  existingRowId: string;
  fingerprint: string;
  attemptedFileOrSource: string;
  attemptedAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  researchBatchId?: string;
  attemptedArtifactId?: string;
  kind?: "row" | "artifact";
};
export type ResearchRecoveryRecord = { id: string; collection: string; rawPayload: unknown; recoveredAt: string; message: string };
export type EtsyOperationsState = { version: 1; migratedLegacy: boolean; artifacts: EvidenceArtifact[]; products: Product[]; designs: Design[]; listings: Listing[]; posts: ContentPost[]; gates: OwnerGate[]; keywordResearch: KeywordResearch[]; keywordResearchLoops: KeywordResearchLoop[]; listingDrafts: ListingDraft[]; researchRounds: ResearchRound[]; researchBatches: ResearchBatch[]; researchResultRows: ResearchResultRow[]; researchQueryTasks: ResearchQueryTask[]; researchGapAnalysisAttempts: ResearchGapAnalysisAttempt[]; researchDuplicateAuditEvents: ResearchDuplicateAuditEvent[]; researchFreshnessPolicies: ResearchFreshnessPolicy[]; researchRecoveryErrors?: string[]; researchRecoveryQuarantine?: ResearchRecoveryRecord[] };
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
  researchRounds: [],
  researchBatches: [],
  researchResultRows: [],
  researchQueryTasks: [],
  researchGapAnalysisAttempts: [],
  researchDuplicateAuditEvents: [],
  researchFreshnessPolicies: [],
};

export function hydrateKeywordResearch(state: EtsyOperationsState): EtsyOperationsState {
  const keywordResearch = Array.isArray(state.keywordResearch) ? state.keywordResearch : [];
  const keywordResearchLoops = Array.isArray(state.keywordResearchLoops) ? state.keywordResearchLoops : [];
  return keywordResearch === state.keywordResearch && keywordResearchLoops === state.keywordResearchLoops ? state : { ...state, keywordResearch, keywordResearchLoops };
}

export function hydrateListingDrafts(state: EtsyOperationsState): EtsyOperationsState {
  return Array.isArray(state.listingDrafts) ? state : { ...state, listingDrafts: [] };
}

const RESEARCH_OPTIONAL_COLLECTIONS = ["researchRounds", "researchBatches", "researchResultRows", "researchQueryTasks", "researchGapAnalysisAttempts", "researchDuplicateAuditEvents", "researchFreshnessPolicies"] as const;

export function researchMalformedOptionalCollections(state: EtsyOperationsState) {
  const raw = state as EtsyOperationsState & Record<string, unknown>;
  return RESEARCH_OPTIONAL_COLLECTIONS.filter((key) => raw[key] !== undefined && !Array.isArray(raw[key]));
}

/**
 * Additive V1 hydration for Product Development research results. Missing
 * optional collections are empty; malformed collections are ignored with a
 * visible recovery note while every legacy collection is retained by reference.
 */
export function hydrateResearchResults(state: EtsyOperationsState): EtsyOperationsState {
  const raw = state as EtsyOperationsState & Record<string, unknown>;
  const malformed = researchMalformedOptionalCollections(state);
  const researchRounds = Array.isArray(raw.researchRounds) ? raw.researchRounds as ResearchRound[] : [];
  const researchBatches = Array.isArray(raw.researchBatches) ? raw.researchBatches as ResearchBatch[] : [];
  const durableArtifacts = Array.isArray(raw.artifacts) ? raw.artifacts as EvidenceArtifact[] : state.artifacts;
  const durableArtifactIdsByBatch = new Map<string, Set<string>>();
  for (const artifact of durableArtifacts) {
    if (!artifact.researchBatchId) continue;
    const artifactIds = durableArtifactIdsByBatch.get(artifact.researchBatchId) ?? new Set<string>();
    artifactIds.add(artifact.id);
    durableArtifactIdsByBatch.set(artifact.researchBatchId, artifactIds);
  }
  let researchBatchesChanged = false;
  const hydratedResearchBatches = researchBatches.map((batch) => {
    const declaredArtifactIds = Array.isArray(batch.artifactIds) ? batch.artifactIds : [];
    const durableArtifactIds = durableArtifactIdsByBatch.get(batch.id) ?? new Set<string>();
    const artifactIds = declaredArtifactIds.filter((id) => durableArtifactIds.has(id));
    if (artifactIds.length === declaredArtifactIds.length && Array.isArray(batch.artifactIds)) return batch;
    researchBatchesChanged = true;
    return { ...batch, artifactIds };
  });
  const researchResultRows = Array.isArray(raw.researchResultRows) ? raw.researchResultRows as ResearchResultRow[] : [];
  let researchRowsChanged = false;
  const hydratedResearchResultRows = researchResultRows.map((row) => {
    const fields = {
      searchVolume: normalizeResearchField(row.searchVolume?.raw, "number"),
      competition: normalizeResearchField(row.competition?.raw, "number"),
      trend: normalizeResearchField(row.trend?.raw, "number"),
      relevanceScore: normalizeResearchField(row.relevanceScore?.raw, "number"),
    };
    const changed = (Object.keys(fields) as Array<keyof typeof fields>).some((field) => {
      const current = row[field];
      const next = fields[field];
      return current.raw !== next.raw || current.parsed !== next.parsed || current.status !== next.status;
    });
    if (!changed) return row;
    researchRowsChanged = true;
    const next = { ...row, ...fields };
    return { ...next, contentFingerprint: researchEvidenceFingerprint(next) };
  });
  const stableResearchResultRows = researchRowsChanged ? hydratedResearchResultRows : researchResultRows;
  const researchQueryTasks = Array.isArray(raw.researchQueryTasks) ? raw.researchQueryTasks as ResearchQueryTask[] : [];
  let researchTasksChanged = false;
  const hydratedResearchQueryTasks = researchQueryTasks.map((task) => {
    const exactRound = researchRounds.find((round) => round.id === task.roundId
      && round.designId === task.designId
      && round.productId === task.productId
      && round.seedVersion === task.seedVersion);
    if (!exactRound) return task;
    const exactInput = researchActiveInputLedgerForRound(exactRound).find((input) => normalizeResearchQuery(input.query) === task.normalizedQuery
      && input.intentDimensionId === task.intentDimensionId);
    if (!exactInput || exactInput.anchorId === task.anchorId) return task;
    researchTasksChanged = true;
    return { ...task, anchorId: exactInput.anchorId };
  });
  const researchGapAnalysisAttempts = Array.isArray(raw.researchGapAnalysisAttempts) ? raw.researchGapAnalysisAttempts as ResearchGapAnalysisAttempt[] : [];
  const researchDuplicateAuditEvents = Array.isArray(raw.researchDuplicateAuditEvents) ? raw.researchDuplicateAuditEvents as ResearchDuplicateAuditEvent[] : [];
  const researchFreshnessPolicies = Array.isArray(raw.researchFreshnessPolicies) ? raw.researchFreshnessPolicies as ResearchFreshnessPolicy[] : [];
  const currentErrors = Array.isArray(raw.researchRecoveryErrors) ? raw.researchRecoveryErrors as string[] : [];
  const currentQuarantine = Array.isArray(raw.researchRecoveryQuarantine) ? raw.researchRecoveryQuarantine as ResearchRecoveryRecord[] : [];
  const recoveredAt = new Date().toISOString();
  const quarantineAdditions = malformed.map((collection) => {
    const rawPayload = raw[collection];
    const id = researchFingerprint({ collection, rawPayload });
    return { id, collection, rawPayload, recoveredAt, message: `${collection} was malformed and was recovered as an empty optional collection.` };
  }).filter((record) => !currentQuarantine.some((item) => item.id === record.id));
  const researchRecoveryQuarantine = quarantineAdditions.length ? [...currentQuarantine, ...quarantineAdditions] : currentQuarantine;
  const recoveryErrors = malformed.length
    ? [...new Set([...currentErrors, ...malformed.map((key) => `${key} was malformed and was recovered as an empty optional collection.`)])]
    : currentErrors;
  const errorsUnchanged = malformed.length === 0 && (raw.researchRecoveryErrors === undefined || recoveryErrors === raw.researchRecoveryErrors);
  const quarantineUnchanged = malformed.length === 0 && (raw.researchRecoveryQuarantine === undefined || researchRecoveryQuarantine === raw.researchRecoveryQuarantine);
  if (
    researchRounds === raw.researchRounds
    && !researchBatchesChanged
    && stableResearchResultRows === raw.researchResultRows
    && !researchTasksChanged
    && researchGapAnalysisAttempts === raw.researchGapAnalysisAttempts
    && researchDuplicateAuditEvents === raw.researchDuplicateAuditEvents
    && researchFreshnessPolicies === raw.researchFreshnessPolicies
    && errorsUnchanged
    && quarantineUnchanged
  ) return state;
  return {
    ...state,
    researchRounds,
    researchBatches: hydratedResearchBatches,
    researchResultRows: stableResearchResultRows,
    researchQueryTasks: researchTasksChanged ? hydratedResearchQueryTasks : researchQueryTasks,
    researchGapAnalysisAttempts,
    researchDuplicateAuditEvents,
    researchFreshnessPolicies,
    ...(recoveryErrors.length ? { researchRecoveryErrors: recoveryErrors } : {}),
    ...(researchRecoveryQuarantine.length ? { researchRecoveryQuarantine } : {}),
  };
}

export const SHORT_INTENT_V2_VERSION = "short-intent-v2" as const;
export const SHORT_INTENT_V2_SEEDS = [
  "pastor appreciation",
  "pastor gift journal",
  "pastor prayer journal",
  "Christian pastor gift",
  "pastor thank you",
] as const;

export function createResearchSeedLedger(seedSnapshot: readonly string[] = SHORT_INTENT_V2_SEEDS): ResearchSeedLedgerEntry[] {
  const seeds = seedSnapshot.map((query) => query.trim());
  if (seeds.length !== 5 || seeds.some((query) => !query) || new Set(seeds.map((query) => query.toLocaleLowerCase())).size !== 5) {
    throw new Error("A research seed ledger requires five unique nonblank frozen seeds.");
  }
  return seeds.map((query, index) => ({ id: createId("research-seed"), ordinal: index + 1, query }));
}

/**
 * Old rounds intentionally do not receive inferred IDs: text alone is not
 * enough to prove exact lineage. New rounds always receive this immutable ledger.
 */
export function researchSeedLedgerForRound(round: ResearchRound) {
  const ledger = round.seedLedger;
  if (!Array.isArray(ledger) || ledger.length !== 5) return [] as ResearchSeedLedgerEntry[];
  const snapshotMatches = ledger.every((seed, index) => seed.ordinal === index + 1 && seed.query === round.seedSnapshot[index] && Boolean(seed.id));
  return snapshotMatches ? ledger : [] as ResearchSeedLedgerEntry[];
}

export function researchSeedForRound(round: ResearchRound, seedId: string | undefined, query: string) {
  const ledger = researchActiveInputLedgerForRound(round);
  if (seedId) return ledger.find((seed) => seed.id === seedId && seed.query === query.trim());
  return ledger.find((seed) => seed.query === query.trim());
}

export const ROUND_ONE_INTENT_DIMENSION_BLUEPRINT = [
  { id: "product-role", label: "Product / role", definition: "The product language and recipient role used by the buyer." },
  { id: "gift-intent", label: "Gift intent", definition: "An explicit gift-seeking intent for the recipient." },
  { id: "use-case", label: "Use case", definition: "How the recipient will use the product." },
  { id: "faith-identity", label: "Faith identity", definition: "Faith identity language that is relevant to the buyer and recipient." },
  { id: "appreciation-thank-you", label: "Appreciation / thank-you", definition: "Appreciation or thank-you occasion language." },
] as const;

export function normalizeResearchQuery(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function exactResearchContext(item: ResearchContext, context: ResearchContext) {
  return item.designId === context.designId && item.productId === context.productId && item.roundId === context.roundId && item.seedVersion === context.seedVersion;
}

export function researchIntentAnchorsForRound(round: ResearchRound): ResearchIntentAnchor[] {
  const persisted = round.intentAnchors;
  if (Array.isArray(persisted) && persisted.length >= 5 && persisted.length <= 8) {
    const normalized = persisted.map((anchor) => normalizeResearchQuery(anchor.query));
    const valid = persisted.every((anchor, index) => anchor.roundId === round.id && anchor.ordinal === index + 1 && Boolean(anchor.id && anchor.intentDimensionId && normalized[index]))
      && new Set(normalized).size === persisted.length;
    if (valid) return persisted;
  }
  if (round.seedVersion !== SHORT_INTENT_V2_VERSION) return [];
  const ledger = researchSeedLedgerForRound(round);
  if (ledger.length !== ROUND_ONE_INTENT_DIMENSION_BLUEPRINT.length) return [];
  return ledger.map((seed, index) => ({
    id: `research-anchor:${seed.id}`,
    roundId: round.id,
    ordinal: index + 1,
    query: seed.query,
    intentDimensionId: ROUND_ONE_INTENT_DIMENSION_BLUEPRINT[index].id,
    origin: "round-1-seed",
  }));
}

/**
 * Canonical immutable input identity for the active round. Round 1 keeps the
 * original five-seed IDs; an owner-approved adaptive round instead projects
 * its persisted gap-anchor IDs without rewriting the historical seed ledger.
 */
export function researchActiveInputLedgerForRound(round: ResearchRound): ResearchActiveInputLedgerEntry[] {
  const anchors = researchIntentAnchorsForRound(round);
  const seedLedger = researchSeedLedgerForRound(round);
  if (!round.sourceGapAnalysisId) {
    if (anchors.length !== seedLedger.length) return [];
    const exactRoundOneProjection = anchors.every((anchor, index) => {
      const seed = seedLedger[index];
      return anchor.origin === "round-1-seed"
        && anchor.id === `research-anchor:${seed?.id}`
        && anchor.ordinal === seed?.ordinal
        && anchor.query === seed?.query;
    });
    return exactRoundOneProjection ? anchors.map((anchor, index) => ({
      id: seedLedger[index].id,
      ordinal: anchor.ordinal,
      query: anchor.query,
      anchorId: anchor.id,
      intentDimensionId: anchor.intentDimensionId,
      origin: anchor.origin,
    })) : [];
  }
  const approvedCandidateIds = round.adaptiveOwnerApproval?.approvedBy === "owner"
    ? round.adaptiveOwnerApproval.selectedGapCandidateIds
    : [];
  const approvedCandidateIdSet = new Set(approvedCandidateIds);
  const exactAdaptiveProjection = anchors.length >= 5
    && anchors.length <= 8
    && approvedCandidateIdSet.size === anchors.length
    && anchors.every((anchor) => anchor.origin === "owner-approved-gap"
      && anchor.sourceGapAnalysisId === round.sourceGapAnalysisId
      && Boolean(anchor.sourceGapCandidateId && approvedCandidateIdSet.has(anchor.sourceGapCandidateId)));
  return exactAdaptiveProjection ? anchors.map((anchor) => ({
    id: anchor.id,
    ordinal: anchor.ordinal,
    query: anchor.query,
    anchorId: anchor.id,
    intentDimensionId: anchor.intentDimensionId,
    origin: anchor.origin,
  })) : [];
}

/** Exact task-to-input match used by preview and regression tests. */
export function researchActiveInputForQueryTask(round: ResearchRound, task: ResearchQueryTask) {
  const context: ResearchContext = { designId: round.designId, productId: round.productId, roundId: round.id, seedVersion: round.seedVersion };
  if (!exactResearchContext(task, context)) return undefined;
  return researchActiveInputLedgerForRound(round).find((input) => input.anchorId === task.anchorId
    && input.intentDimensionId === task.intentDimensionId
    && normalizeResearchQuery(input.query) === task.normalizedQuery);
}

export function researchRequiredDimensionsForRound(round: ResearchRound): RequiredIntentDimension[] {
  const anchors = researchIntentAnchorsForRound(round);
  if (Array.isArray(round.requiredIntentDimensions) && round.requiredIntentDimensions.length >= 5 && round.requiredIntentDimensions.length <= 8) {
    const valid = round.requiredIntentDimensions.every((dimension, index) => dimension.ordinal === index + 1
      && Boolean(dimension.id && dimension.label && dimension.definition)
      && dimension.anchorIds.length > 0
      && dimension.anchorIds.every((anchorId) => anchors.some((anchor) => anchor.id === anchorId && anchor.intentDimensionId === dimension.id)));
    if (valid && new Set(round.requiredIntentDimensions.map((dimension) => dimension.id)).size === round.requiredIntentDimensions.length) return round.requiredIntentDimensions;
  }
  if (round.seedVersion !== SHORT_INTENT_V2_VERSION || anchors.length !== 5) return [];
  return ROUND_ONE_INTENT_DIMENSION_BLUEPRINT.map((dimension, index) => ({
    ...dimension,
    ordinal: index + 1,
    anchorIds: [anchors[index].id],
  }));
}

export function createResearchQueryTasks(input: {
  round: ResearchRound;
  selectedQueries: Array<{ query: string; intentDimensionId: string; anchorId?: string }>;
  source: ResearchSource;
  completedQueries?: readonly string[];
  now?: string;
}): ResearchQueryTask[] {
  const anchors = researchIntentAnchorsForRound(input.round);
  const activeInputs = researchActiveInputLedgerForRound(input.round);
  if (anchors.length < 5 || anchors.length > 8 || activeInputs.length !== anchors.length) throw new Error("Bulk comparison requires 5–8 valid ordered intent anchors.");
  if (input.selectedQueries.length < 3 || input.selectedQueries.length > 5) throw new Error("Select exactly 3–5 Individual queries before creating tasks.");
  const completed = new Set((input.completedQueries ?? []).map(normalizeResearchQuery));
  const seen = new Set<string>();
  const context: ResearchContext = { designId: input.round.designId, productId: input.round.productId, roundId: input.round.id, seedVersion: input.round.seedVersion };
  const now = input.now ?? new Date().toISOString();
  return input.selectedQueries.map((selection, index) => {
    const normalizedQuery = normalizeResearchQuery(selection.query);
    if (!normalizedQuery || seen.has(normalizedQuery)) throw new Error(`Individual query ${index + 1} is blank or duplicated.`);
    if (completed.has(normalizedQuery)) throw new Error(`Individual query ${index + 1} already exists in completed-query history.`);
    const anchor = selection.anchorId ? anchors.find((item) => item.id === selection.anchorId) : anchors.find((item) => normalizeResearchQuery(item.query) === normalizedQuery && item.intentDimensionId === selection.intentDimensionId);
    const activeInput = anchor ? activeInputs.find((item) => item.anchorId === anchor.id && item.intentDimensionId === selection.intentDimensionId && normalizeResearchQuery(item.query) === normalizedQuery) : undefined;
    if (!anchor || !activeInput || anchor.intentDimensionId !== selection.intentDimensionId || normalizeResearchQuery(anchor.query) !== normalizedQuery) throw new Error(`Individual query ${index + 1} does not match an active Bulk anchor.`);
    seen.add(normalizedQuery);
    return {
      ...context,
      id: createId("research-query-task"),
      selectedOrdinal: index + 1,
      query: selection.query.trim(),
      normalizedQuery,
      intentDimensionId: selection.intentDimensionId,
      anchorId: anchor.id,
      source: input.source,
      status: "pending" as const,
      artifactIds: [],
      createdAt: now,
      updatedAt: now,
    };
  });
}

export function researchQueryTasksForContext(tasks: ResearchQueryTask[], context: ResearchContext) {
  return tasks.filter((task) => exactResearchContext(task, context)).sort((left, right) => left.selectedOrdinal - right.selectedOrdinal || left.id.localeCompare(right.id));
}

export function bindResearchArtifactToQueryTask(artifact: EvidenceArtifact, task: ResearchQueryTask): EvidenceArtifact {
  if (artifact.researchRoundId !== task.roundId || artifact.researchSeedVersion !== task.seedVersion || artifact.targetId !== task.designId || artifact.source !== task.source) {
    throw new Error("This artifact does not match the exact Individual query task target. Reassign it explicitly before save.");
  }
  return {
    ...artifact,
    researchQueryTaskId: task.id,
    researchOriginatingQuery: task.query,
    researchIntentDimensionId: task.intentDimensionId,
    researchOriginatingQueries: [task.query],
  };
}

export function updateResearchQueryTaskFromArtifact(task: ResearchQueryTask, artifact: EvidenceArtifact, status: ResearchQueryTaskStatus, now = new Date().toISOString()): ResearchQueryTask {
  if (artifact.researchQueryTaskId !== task.id || normalizeResearchQuery(artifact.researchOriginatingQuery ?? "") !== task.normalizedQuery) {
    return { ...task, status: "error", error: "Artifact/query mismatch. Use explicit reassignment; filename and order are ignored.", updatedAt: now };
  }
  const artifactIds = task.artifactIds.includes(artifact.id) ? task.artifactIds : [...task.artifactIds, artifact.id];
  return { ...task, status, artifactIds, error: status === "error" ? task.error : undefined, updatedAt: now };
}

export function createResearchBatch(input: {
  id?: string;
  round: ResearchRound;
  selectedSeedIds: readonly string[];
  now?: string;
}): ResearchBatch {
  const ledger = researchActiveInputLedgerForRound(input.round);
  if (!ledger.length) throw new Error("This round has no canonical frozen input identity. Start a new round before creating a Research Batch.");
  const selectedSeedIds = [...new Set(input.selectedSeedIds)];
  if (!selectedSeedIds.length || selectedSeedIds.some((id) => !ledger.some((seed) => seed.id === id))) {
    throw new Error("Select one or more frozen seeds for this exact Research Batch.");
  }
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.id ?? createId("research-batch"),
    designId: input.round.designId,
    productId: input.round.productId,
    roundId: input.round.id,
    seedVersion: input.round.seedVersion,
    seedLedger: ledger.map(({ id, ordinal, query }) => ({ id, ordinal, query })),
    selectedSeedIds,
    artifactIds: [],
    status: "draft-preview",
    createdAt: now,
    createdAtHk: hongKongCaptureDateTime(now),
    updatedAt: now,
  };
}

export function researchBatchMatchesContext(batch: ResearchBatch, context: ResearchContext) {
  return batch.designId === context.designId
    && batch.productId === context.productId
    && batch.roundId === context.roundId
    && batch.seedVersion === context.seedVersion;
}

/**
 * Remove one unsaved preview from a batch without touching saved artifacts.
 * Preview batches live in session storage, so the UI uses this before a
 * sibling is saved; persistence separately filters against durable artifacts.
 */
export function removeResearchArtifactFromBatch(batch: ResearchBatch, artifactId: string): ResearchBatch {
  const artifactIds = batch.artifactIds.filter((id) => id !== artifactId);
  return artifactIds.length === batch.artifactIds.length ? batch : { ...batch, artifactIds };
}

/**
 * Recover a preview created while an unsaved draft round was being recreated.
 * The frozen tuple and order must still match exactly; only generated seed IDs
 * may be remapped to the current draft round's IDs.
 */
export function alignResearchBatchToRound(batch: ResearchBatch, round: ResearchRound): ResearchBatch {
  const context: ResearchContext = { designId: round.designId, productId: round.productId, roundId: round.id, seedVersion: round.seedVersion };
  if (!researchBatchMatchesContext(batch, context)) return batch;
  const roundLedger = researchActiveInputLedgerForRound(round);
  if (!roundLedger.length || batch.seedLedger.length !== roundLedger.length) return batch;
  const currentByKey = new Map(roundLedger.map((seed) => [`${seed.ordinal}:${seed.query}`, seed.id]));
  const remappedLedger = batch.seedLedger.map((seed) => ({ ...seed, id: currentByKey.get(`${seed.ordinal}:${seed.query}`) ?? "" }));
  if (remappedLedger.some((seed) => !seed.id) || batch.selectedSeedIds.some((id) => !batch.seedLedger.some((seed) => seed.id === id))) return batch;
  const remappedSelectedSeedIds = batch.selectedSeedIds.map((id) => {
    const seed = batch.seedLedger.find((item) => item.id === id)!;
    return currentByKey.get(`${seed.ordinal}:${seed.query}`) ?? id;
  });
  return { ...batch, seedLedger: roundLedger.map(({ id, ordinal, query }) => ({ id, ordinal, query })), selectedSeedIds: remappedSelectedSeedIds };
}

export function researchArtifactSeedIds(batch: ResearchBatch, artifact: Pick<EvidenceArtifact, "researchSeedIds" | "researchSeedOverrideId">) {
  const inherited = artifact.researchSeedIds?.length ? artifact.researchSeedIds : batch.selectedSeedIds;
  return artifact.researchSeedOverrideId ? [artifact.researchSeedOverrideId] : inherited;
}

/**
 * A batch may deliberately cover several seeds, but a normalised row needs one
 * immutable seed identity.  A single inherited seed is therefore exact; a
 * multi-seed artifact must be explicitly overridden before it can contribute
 * to a Coach decision.
 */
export function researchExactSeedIdForArtifact(batch: ResearchBatch, artifact: Pick<EvidenceArtifact, "researchSeedIds" | "researchSeedOverrideId">) {
  const seedIds = researchArtifactSeedIds(batch, artifact);
  return seedIds.length === 1 ? seedIds[0] : undefined;
}

export function createResearchRound(input: {
  id?: string;
  designId: string;
  productId: string;
  roundNumber: number;
  seedVersion?: string;
  seedSnapshot?: readonly string[];
  now?: string;
}): ResearchRound {
  const seedVersion = input.seedVersion ?? SHORT_INTENT_V2_VERSION;
  const seeds = (input.seedSnapshot ?? SHORT_INTENT_V2_SEEDS).map((seed) => seed.trim());
  if (seeds.length !== 5) throw new Error("A research round requires exactly five frozen seeds.");
  if (new Set(seeds.map((seed) => seed.toLocaleLowerCase())).size !== 5 || seeds.some((seed) => !seed)) throw new Error("Research seeds must be five unique nonblank values.");
  if (seedVersion !== SHORT_INTENT_V2_VERSION || seeds.some((seed, index) => seed !== SHORT_INTENT_V2_SEEDS[index])) throw new Error("short-intent-v2 uses the fixed approved seed tuple and order.");
  if (!input.designId || !input.productId || !Number.isInteger(input.roundNumber) || input.roundNumber < 1) throw new Error("Research round lineage requires a design, product, and positive round number.");
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.id ?? createId("research-round"),
    designId: input.designId,
    productId: input.productId,
    roundNumber: input.roundNumber,
    seedVersion,
    seedSnapshot: seeds as ResearchRound["seedSnapshot"],
    seedLedger: createResearchSeedLedger(seeds),
    status: "draft-preview",
    artifactIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Create a genuinely new isolated round number from persisted history only. */
export function createNextResearchRound(stateInput: Pick<EtsyOperationsState, "researchRounds">, input: {
  designId: string;
  productId: string;
  seedVersion?: string;
  id?: string;
  now?: string;
}) {
  const seedVersion = input.seedVersion ?? SHORT_INTENT_V2_VERSION;
  const previousRoundNumber = stateInput.researchRounds
    .filter((round) => round.designId === input.designId && round.productId === input.productId && round.seedVersion === seedVersion)
    .reduce((highest, round) => Math.max(highest, round.roundNumber), 0);
  return createResearchRound({ ...input, seedVersion, roundNumber: previousRoundNumber + 1 });
}

/**
 * Open a later adaptive round only from the latest persisted proposal and one
 * explicit owner-approved 5–8 candidate selection. The original five-seed
 * ledger remains untouched; the new round freezes separate gap-anchor and
 * dimension identities for truthful downstream coverage.
 */
export function createAdaptiveNextResearchRound(
  stateInput: Pick<EtsyOperationsState, "researchRounds" | "researchGapAnalysisAttempts" | "researchQueryTasks" | "researchResultRows">,
  input: {
    sourceRoundId: string;
    gapAnalysisId: string;
    selectedGapCandidateIds: readonly string[];
    ownerApprovedBy: "owner";
    id?: string;
    now?: string;
  },
) {
  const sourceRound = stateInput.researchRounds.find((round) => round.id === input.sourceRoundId);
  if (!sourceRound) throw new Error("The source research round is missing; no adaptive round was created.");
  const latestRound = stateInput.researchRounds
    .filter((round) => round.designId === sourceRound.designId && round.productId === sourceRound.productId && round.seedVersion === sourceRound.seedVersion)
    .sort((left, right) => right.roundNumber - left.roundNumber || right.createdAt.localeCompare(left.createdAt))[0];
  if (latestRound?.id !== sourceRound.id) throw new Error("Only the latest exact research round may open an adaptive next round.");
  const exactAttempts = stateInput.researchGapAnalysisAttempts
    .filter((attempt) => attempt.designId === sourceRound.designId && attempt.productId === sourceRound.productId && attempt.roundId === sourceRound.id && attempt.seedVersion === sourceRound.seedVersion)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
  const proposal = exactAttempts.find((attempt) => attempt.id === input.gapAnalysisId);
  if (!proposal || proposal.status !== "proposal-ready" || proposal.rankedCandidates.length < 15 || proposal.rankedCandidates.length > 25) {
    throw new Error("A valid 15–25 candidate proposal is required before an adaptive round can be created.");
  }
  if (exactAttempts[0]?.id !== proposal.id) throw new Error("Only the latest exact gap proposal may be approved.");
  const currentAdaptiveAction = deriveAdaptiveResearchAction({
    round: sourceRound,
    tasks: stateInput.researchQueryTasks,
    rows: stateInput.researchResultRows,
    conclusion: sourceRound.conclusion,
    gapAnalysis: proposal,
  });
  if (currentAdaptiveAction.actionKind !== "propose-gap-round" || currentAdaptiveAction.persistedDecision !== "next-round") {
    throw new Error("The latest round has no owner-reviewable gap proposal; no adaptive round was created.");
  }
  if (stateInput.researchRounds.some((round) => round.sourceGapAnalysisId === proposal.id)) {
    throw new Error("This gap proposal already created a round; reload the existing round instead.");
  }
  const selectedIds = [...input.selectedGapCandidateIds];
  if (selectedIds.length < 5 || selectedIds.length > 8 || new Set(selectedIds).size !== selectedIds.length) {
    throw new Error("Owner approval must select 5–8 unique gap candidates.");
  }
  const proposalById = new Map(proposal.rankedCandidates.map((candidate) => [candidate.id, candidate]));
  const selected = selectedIds.map((id) => proposalById.get(id));
  if (selected.some((candidate) => !candidate)) throw new Error("Every selected gap anchor must belong to the latest ranked proposal.");
  const candidates = selected as GapCandidate[];
  const normalizedQueries = candidates.map((candidate) => normalizeResearchQuery(candidate.query));
  if (normalizedQueries.some((query) => !query) || new Set(normalizedQueries).size !== candidates.length) {
    throw new Error("Owner-approved adaptive anchors must be 5–8 unique nonblank queries.");
  }
  const approvedAt = input.now ?? new Date().toISOString();
  if (input.ownerApprovedBy !== "owner" || !Number.isFinite(new Date(approvedAt).getTime())) {
    throw new Error("A valid explicit owner approval time is required.");
  }
  const round = createNextResearchRound(stateInput, {
    id: input.id,
    designId: sourceRound.designId,
    productId: sourceRound.productId,
    seedVersion: sourceRound.seedVersion,
    now: approvedAt,
  });
  const intentAnchors: ResearchIntentAnchor[] = candidates.map((candidate, index) => {
    const dimensionId = `gap-dimension:${researchFingerprint({ proposalId: proposal.id, candidateId: candidate.id })}`;
    return {
      id: `research-gap-anchor:${researchFingerprint({ roundId: round.id, candidateId: candidate.id })}`,
      roundId: round.id,
      ordinal: index + 1,
      query: candidate.query.trim(),
      intentDimensionId: dimensionId,
      origin: "owner-approved-gap",
      sourceGapCandidateId: candidate.id,
      sourceTargetDimensionId: candidate.targetDimension,
      sourceGapAnalysisId: proposal.id,
    };
  });
  const requiredIntentDimensions: RequiredIntentDimension[] = intentAnchors.map((anchor, index) => ({
    id: anchor.intentDimensionId,
    label: candidates[index].query.trim(),
    ordinal: index + 1,
    definition: `Owner-approved extension of ${candidates[index].targetDimension}: ${candidates[index].extensionLogic.trim()}`,
    anchorIds: [anchor.id],
  }));
  return {
    ...round,
    intentAnchors,
    requiredIntentDimensions,
    sourceRoundId: sourceRound.id,
    sourceGapAnalysisId: proposal.id,
    adaptiveOwnerApproval: { approvedBy: "owner" as const, approvedAt, selectedGapCandidateIds: selectedIds },
  };
}

export function normalizeResearchField(rawValue: unknown, kind: "string"): ResearchField<string>;
export function normalizeResearchField(rawValue: unknown, kind: "number"): ResearchField<number>;
export function normalizeResearchField(rawValue: unknown, kind: "string" | "number"): ResearchField<string> | ResearchField<number> {
  const raw = rawValue === null || rawValue === undefined ? "" : String(rawValue).trim();
  if (!raw) return { raw, parsed: null, status: "missing" };
  if (kind === "string") return { raw, parsed: raw, status: "confirmed" };
  if (/^(?:unknown|n\/?a|not available|[-—])$/i.test(raw)) return { raw, parsed: null, status: "source-unknown" };
  const parsed = Number(raw.replace(/[$,%\s,]/g, ""));
  if (!Number.isFinite(parsed)) return { raw, parsed: null, status: "invalid" };
  return { raw, parsed, status: parsed === 0 ? "confirmed-zero" : "confirmed" };
}

function strictResearchDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export function hongKongCalendarDate(value: Date | string | number = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: "year" | "month" | "day") => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** A human-readable, automatic import/capture value; source dates remain separate editable calendar fields. */
export function hongKongCaptureDateTime(value: Date | string | number = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: "year" | "month" | "day" | "hour" | "minute" | "second") => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")} HKT`;
}

export function researchPastedScreenshotFileName(mimeType: string, localDate = hongKongCalendarDate()) {
  const extension = mimeType === "image/jpeg" ? "jpg" : "png";
  const safeDate = strictResearchDate(localDate) ? localDate : hongKongCalendarDate();
  return `pasted-screenshot-${safeDate}.${extension}`;
}

export function assessResearchFreshness(sourceDate: string, policy?: ResearchFreshnessPolicy, nowDate = hongKongCalendarDate()) {
  const visible = sourceDate ?? "";
  const parsed = strictResearchDate(visible);
  const comparisonDate = policy?.effectiveDate || nowDate;
  const now = strictResearchDate(comparisonDate) ?? new Date(`${comparisonDate}T00:00:00.000Z`);
  if (!visible) return { sourceDate: visible, ageDays: null, freshness: "not-assessed" as const, stale: false, eligible: false, issue: "blank" as const };
  if (!parsed || !Number.isFinite(now.getTime())) return { sourceDate: visible, ageDays: null, freshness: "not-assessed" as const, stale: false, eligible: false, issue: "malformed" as const };
  const ageDays = Math.floor((now.getTime() - parsed.getTime()) / 86_400_000);
  if (ageDays < 0) return { sourceDate: visible, ageDays, freshness: "not-assessed" as const, stale: false, eligible: false, issue: "future" as const };
  if (!policy) return { sourceDate: visible, ageDays, freshness: "not-assessed" as const, stale: false, eligible: true };
  const stale = ageDays > Math.max(0, policy.maxAgeDays);
  return { sourceDate: visible, ageDays, freshness: stale ? "stale" as const : "current" as const, stale, eligible: !stale };
}

export function researchFreshnessPolicyScope(source: ResearchSource, designId: string, productId: string) {
  return `${source}:${designId}:${productId}`;
}

export function researchFreshnessPolicyForContext(policies: ResearchFreshnessPolicy[], source: ResearchSource, designId: string, productId: string) {
  const scope = researchFreshnessPolicyScope(source, designId, productId);
  return policies.find((policy) => policy.scope === scope);
}

export function upsertResearchFreshnessPolicy(policies: ResearchFreshnessPolicy[], policy: ResearchFreshnessPolicy) {
  return [policy, ...policies.filter((item) => item.scope !== policy.scope)];
}

export type RawResearchResultRow = { phrase: unknown; searchVolume: unknown; competition: unknown; trend: unknown; relevanceScore: unknown };

const RESEARCH_HEADER_ALIASES = {
  phrase: ["keyword", "keywords", "keyword phrase", "phrase", "search term", "tag"],
  searchVolume: ["search volume", "searches", "monthly searches", "avg searches", "volume"],
  competition: ["competition", "etsy competition", "competing listings", "listings", "kd"],
  trend: ["trend", "trend score", "search trend", "growth"],
  relevanceScore: ["relevance", "relevance score", "keyword score", "overall score", "score"],
} as const;

function normalizedResearchHeader(value: string) {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) { cells.push(value.trim()); value = ""; }
    else value += character;
  }
  cells.push(value.trim());
  return cells;
}

type ResearchTextSeparator = "," | "\t" | "ocr-columns";

function researchTextSeparator(header: string): ResearchTextSeparator {
  if (header.includes("\t")) return "\t";
  if (header.includes(",")) return ",";
  return "ocr-columns";
}

function parseResearchTextLine(line: string, separator: ResearchTextSeparator) {
  return separator === "ocr-columns"
    ? line.trim().split(/\s{2,}/).map((cell) => cell.trim())
    : parseDelimitedLine(line, separator);
}

export function assertResearchFixtureRows(rows: Array<Record<string, unknown>>) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("Research fixture requires at least one row.");
  const headers = Object.keys(rows[0]).map(normalizedResearchHeader);
  const hasPhrase = RESEARCH_HEADER_ALIASES.phrase.some((alias) => headers.includes(normalizedResearchHeader(alias)));
  const hasNumericSignal = (["searchVolume", "competition", "trend", "relevanceScore"] as const).some((field) => RESEARCH_HEADER_ALIASES[field].some((alias) => headers.includes(normalizedResearchHeader(alias))));
  if (!hasPhrase || !hasNumericSignal) throw new Error("Research fixture requires a phrase header and at least one recognized numeric signal header.");
  return true;
}

export function parseResearchDelimitedText(text: string, _source: ResearchSource): RawResearchResultRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("Research text requires a header row and at least one result row.");
  const separator = researchTextSeparator(lines[0]);
  const headers = parseResearchTextLine(lines[0], separator);
  const normalized = headers.map(normalizedResearchHeader);
  const indexes = Object.fromEntries(Object.entries(RESEARCH_HEADER_ALIASES).map(([field, aliases]) => [field, aliases.map(normalizedResearchHeader).map((alias) => normalized.indexOf(alias)).find((index) => index >= 0) ?? -1])) as Record<keyof RawResearchResultRow, number>;
  if (indexes.phrase < 0 || !([indexes.searchVolume, indexes.competition, indexes.trend, indexes.relevanceScore].some((index) => index >= 0))) throw new Error("Research fixture requires a phrase header and at least one recognized numeric signal header.");
  const rows = lines.slice(1).map((line) => parseResearchTextLine(line, separator));
  if (separator === "ocr-columns") {
    const firstNumericIndex = Math.min(...[indexes.searchVolume, indexes.competition, indexes.trend, indexes.relevanceScore].filter((index) => index >= 0));
    const requiredColumnCount = Math.max(indexes.phrase, firstNumericIndex) + 1;
    if (headers.length < requiredColumnCount || rows.some((cells) => cells.length < requiredColumnCount)) {
      throw new Error("OCR table text requires visible column gaps between the phrase and a recognized numeric signal.");
    }
  }
  return rows.map((cells) => {
    return {
      phrase: cells[indexes.phrase] ?? "",
      searchVolume: indexes.searchVolume >= 0 ? cells[indexes.searchVolume] ?? "" : "",
      competition: indexes.competition >= 0 ? cells[indexes.competition] ?? "" : "",
      trend: indexes.trend >= 0 ? cells[indexes.trend] ?? "" : "",
      relevanceScore: indexes.relevanceScore >= 0 ? cells[indexes.relevanceScore] ?? "" : "",
    };
  });
}

function researchFingerprint(value: unknown) {
  const text = JSON.stringify(value);
  let hash = 14695981039346656037n;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return `rr-${hash.toString(16).padStart(16, "0")}`;
}

function researchEvidenceMedium(artifact: EvidenceArtifact, ocrOnly: boolean): ResearchEvidenceMedium {
  if (ocrOnly || artifact.mimeType.startsWith("image/")) return "ocr-image";
  if (/\.(?:csv|xlsx?|xls)$/i.test(artifact.fileName) || /(?:csv|spreadsheet|excel)/i.test(artifact.mimeType)) return "structured-export";
  return "structured-text";
}

function normalizedResearchValues(row: Pick<ResearchResultRow, "phrase" | "searchVolume" | "competition" | "trend" | "relevanceScore">) {
  return {
    phrase: { parsed: row.phrase.parsed?.trim().toLocaleLowerCase() ?? null, status: row.phrase.status },
    searchVolume: { parsed: row.searchVolume.parsed, status: row.searchVolume.status },
    competition: { parsed: row.competition.parsed, status: row.competition.status },
    trend: { parsed: row.trend.parsed, status: row.trend.status },
    relevanceScore: { parsed: row.relevanceScore.parsed, status: row.relevanceScore.status },
  };
}

function normalizedResearchConfirmationTruth(confirmations: ResearchFieldConfirmation[]) {
  return [...confirmations]
    .map(({ field, rawFieldOrKey, confirmedValue, confirmedBy }) => ({ field, rawFieldOrKey, confirmedValue, confirmedBy }))
    .sort((left, right) => left.field.localeCompare(right.field) || left.rawFieldOrKey.localeCompare(right.rawFieldOrKey));
}

function researchValueFingerprint(row: ResearchResultRow) {
  return researchFingerprint({ lineageKey: row.lineageKey, values: normalizedResearchValues(row) });
}

function researchEvidenceFingerprint(row: ResearchResultRow, artifact?: EvidenceArtifact) {
  const evidenceMedium = row.evidenceMedium ?? (artifact ? researchEvidenceMedium(artifact, row.flags.ocrOnly) : row.flags.ocrOnly ? "ocr-image" : "structured-text");
  return researchFingerprint({
    valueFingerprint: researchValueFingerprint(row),
    fields: { phrase: row.phrase, searchVolume: row.searchVolume, competition: row.competition, trend: row.trend, relevanceScore: row.relevanceScore },
    evidenceMedium,
    ocrOnly: row.flags.ocrOnly,
    unconfirmed: row.flags.unconfirmed,
    fieldConfirmations: normalizedResearchConfirmationTruth(row.fieldConfirmations ?? []),
  });
}

function researchEvidenceQuality(row: ResearchResultRow, artifact?: EvidenceArtifact) {
  if (row.flags.unconfirmed) return 0;
  const medium = row.evidenceMedium ?? (artifact ? researchEvidenceMedium(artifact, row.flags.ocrOnly) : row.flags.ocrOnly ? "ocr-image" : "structured-text");
  if (medium === "ocr-image") return 1;
  return medium === "structured-text" ? 2 : 3;
}

function reconcileResearchLineageConflicts(rows: ResearchResultRow[], lineageKey: string) {
  const active = rows.filter((row) => row.lineageKey === lineageKey && !row.supersededByRowId);
  const conflicting = new Set(active.map(researchValueFingerprint)).size > 1;
  return rows.map((row) => row.lineageKey !== lineageKey ? row : {
    ...row,
    flags: { ...row.flags, conflicting: !row.supersededByRowId && conflicting },
  });
}

export function normalizeResearchResultRow(input: {
  id?: string;
  round: ResearchRound;
  batch?: ResearchBatch;
  queryTask?: ResearchQueryTask;
  artifact: EvidenceArtifact;
  originatingSeedId?: string;
  originatingQuery: string;
  raw: RawResearchResultRow;
  freshnessPolicy?: ResearchFreshnessPolicy;
  ocrOnly?: boolean;
  fieldConfirmations?: ResearchFieldConfirmation[];
  now?: string;
}): ResearchResultRow {
  if (input.artifact.source !== "erank" && input.artifact.source !== "everbee") throw new Error("Research rows require eRank or EverBee supplemental source lineage.");
  const sourceDate = input.artifact.researchSourceDate ?? input.artifact.periodStart ?? "";
  const freshness = assessResearchFreshness(sourceDate, input.freshnessPolicy, hongKongCalendarDate(input.now ?? new Date()));
  const phrase = normalizeResearchField(input.raw.phrase, "string");
  const searchVolume = normalizeResearchField(input.raw.searchVolume, "number");
  const competition = normalizeResearchField(input.raw.competition, "number");
  const trend = normalizeResearchField(input.raw.trend, "number");
  const relevanceScore = normalizeResearchField(input.raw.relevanceScore, "number");
  const ocrOnly = input.ocrOnly ?? input.artifact.mimeType.startsWith("image/");
  const evidenceMedium = researchEvidenceMedium(input.artifact, ocrOnly);
  const fieldConfirmations = input.fieldConfirmations ?? [];
  const ownerConfirmed = input.artifact.ownerConfirmed;
  // Legacy rows can retain their historical query-only display mapping. New
  // batch rows never infer seed identity from text: a frozen ID is required.
  const mappedSeed = input.batch && !input.originatingSeedId
    ? undefined
    : researchSeedForRound(input.round, input.originatingSeedId, input.originatingQuery);
  const batchAllowsSeed = !input.batch || researchBatchMatchesContext(input.batch, {
    designId: input.round.designId,
    productId: input.round.productId,
    roundId: input.round.id,
    seedVersion: input.round.seedVersion,
  }) && researchArtifactSeedIds(input.batch, input.artifact).includes(mappedSeed?.id ?? "");
  const taskContext: ResearchContext = { designId: input.round.designId, productId: input.round.productId, roundId: input.round.id, seedVersion: input.round.seedVersion };
  const taskRequired = Boolean(input.artifact.researchQueryTaskId || input.artifact.researchOriginatingQuery || input.artifact.researchIntentDimensionId);
  const taskMatches = !taskRequired || Boolean(input.queryTask
    && exactResearchContext(input.queryTask, taskContext)
    && input.artifact.researchQueryTaskId === input.queryTask.id
    && normalizeResearchQuery(input.artifact.researchOriginatingQuery ?? "") === input.queryTask.normalizedQuery
    && input.artifact.researchIntentDimensionId === input.queryTask.intentDimensionId
    && normalizeResearchQuery(input.originatingQuery) === input.queryTask.normalizedQuery);
  const unmapped = !mappedSeed || !batchAllowsSeed || !taskMatches;
  const lineageParts = {
    designId: input.round.designId,
    productId: input.round.productId,
    roundId: input.round.id,
    seedVersion: input.round.seedVersion,
    originatingSeedId: mappedSeed?.id ?? "unmapped",
    originatingQuery: input.originatingQuery.trim(),
    ...(taskRequired ? { researchQueryTaskId: input.queryTask?.id ?? input.artifact.researchQueryTaskId ?? "unmapped-task" } : {}),
    source: input.artifact.source,
    sourceDate,
    phrase: phrase.raw.toLocaleLowerCase(),
  };
  const fields = { phrase, searchVolume, competition, trend, relevanceScore };
  const validFieldNames = RESEARCH_FIELDS.filter((name) => fields[name].status === "confirmed" || fields[name].status === "confirmed-zero");
  const ocrFieldsConfirmed = validFieldNames.every((name) => fieldConfirmations.some((confirmation) => confirmation.field === name));
  const row: ResearchResultRow = {
    id: input.id ?? createId("research-row"),
    roundId: input.round.id,
    artifactId: input.artifact.id,
    designId: input.round.designId,
    productId: input.round.productId,
    seedVersion: input.round.seedVersion,
    ...(input.batch ? { researchBatchId: input.batch.id } : {}),
    ...(mappedSeed ? { originatingSeedId: mappedSeed.id } : {}),
    originatingQuery: input.originatingQuery.trim(),
    ...(input.queryTask ? { researchQueryTaskId: input.queryTask.id, researchOriginatingQuery: input.queryTask.query, intentDimensionId: input.queryTask.intentDimensionId } : {}),
    source: input.artifact.source,
    sourceDate,
    ...fields,
    flags: {
      stale: freshness.stale,
      freshness: freshness.freshness,
      ageDays: freshness.ageDays,
      ...(freshness.issue ? { sourceDateIssue: freshness.issue } : {}),
      unconfirmed: unmapped || (ocrOnly ? !ocrFieldsConfirmed : !ownerConfirmed),
      unmapped,
      ocrOnly,
      duplicate: false,
      conflicting: false,
    },
    fieldConfirmations,
    evidenceMedium,
    lineageKey: researchFingerprint(lineageParts),
    contentFingerprint: "",
    createdAt: input.now ?? new Date().toISOString(),
  };
  return { ...row, contentFingerprint: researchEvidenceFingerprint(row, input.artifact) };
}

const RESEARCH_FIELDS = ["phrase", "searchVolume", "competition", "trend", "relevanceScore"] as const;

export function confirmResearchOcrField(row: ResearchResultRow, field: ResearchFieldConfirmation["field"], rawFieldOrKey: string, confirmedBy: "owner", confirmedAt: string): ResearchResultRow {
  const value = row[field].parsed;
  if (value === null || row[field].status === "missing" || row[field].status === "invalid") throw new Error(`${field} cannot be confirmed without a parsed value.`);
  const confirmation: ResearchFieldConfirmation = { field, rawFieldOrKey, confirmedValue: value, confirmedBy, confirmedAt };
  const fieldConfirmations = [...row.fieldConfirmations.filter((item) => item.field !== field), confirmation];
  const allEligibleFieldsConfirmed = RESEARCH_FIELDS
    .filter((name) => row[name].status === "confirmed" || row[name].status === "confirmed-zero")
    .every((name) => fieldConfirmations.some((item) => item.field === name));
  const confirmedRow = { ...row, fieldConfirmations, flags: { ...row.flags, unconfirmed: row.flags.ocrOnly ? !allEligibleFieldsConfirmed : false } };
  return { ...confirmedRow, contentFingerprint: researchEvidenceFingerprint(confirmedRow) };
}

export function isResearchRowEligible(row: ResearchResultRow) {
  const phraseEligible = row.phrase.status === "confirmed";
  const numericFields = (["searchVolume", "competition", "trend", "relevanceScore"] as const)
    .filter((field) => row[field].status === "confirmed" || row[field].status === "confirmed-zero");
  const validFields = RESEARCH_FIELDS.filter((field) => row[field].status === "confirmed" || row[field].status === "confirmed-zero");
  const ocrConfirmed = !row.flags.ocrOnly || validFields.every((field) => row.fieldConfirmations.some((confirmation) => confirmation.field === field));
  return phraseEligible && numericFields.length > 0 && ocrConfirmed && !row.flags.unconfirmed && !row.flags.unmapped && !row.flags.stale && !row.flags.sourceDateIssue && !row.flags.conflicting && !row.supersededByRowId;
}

const RESEARCH_NUMERIC_FIELDS = ["searchVolume", "competition", "trend", "relevanceScore"] as const;

function researchRowHasOnlySourceUnavailableMetrics(row: ResearchResultRow) {
  return RESEARCH_NUMERIC_FIELDS.every((field) => row[field].status === "missing" || row[field].status === "source-unknown");
}

function researchRowHasBlockingTruth(row: ResearchResultRow) {
  if (row.supersededByRowId) return false;
  if (researchRowHasOnlySourceUnavailableMetrics(row)) {
    return row.phrase.status !== "confirmed" || row.flags.unconfirmed || row.flags.unmapped || row.flags.stale || Boolean(row.flags.sourceDateIssue) || row.flags.conflicting;
  }
  return !isResearchRowEligible(row);
}

export function researchRowsForContext(rows: ResearchResultRow[], context: ResearchContext) {
  return rows.filter((row) => row.designId === context.designId && row.productId === context.productId && row.roundId === context.roundId && row.seedVersion === context.seedVersion);
}

export type MergedResearchResult = {
  normalizedPhrase: string;
  rowIds: string[];
  taskIds: string[];
  originatingQueries: string[];
  artifactIds: string[];
  rows: ResearchResultRow[];
};

export function mergeResearchRowsWithLineage(rows: ResearchResultRow[]): MergedResearchResult[] {
  const groups = new Map<string, ResearchResultRow[]>();
  for (const row of rows.filter((item) => !item.supersededByRowId)) {
    const key = normalizeResearchQuery(row.phrase.parsed ?? row.phrase.raw);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([normalizedPhrase, grouped]) => ({
    normalizedPhrase,
    rowIds: grouped.map((row) => row.id),
    taskIds: [...new Set(grouped.flatMap((row) => row.researchQueryTaskId ? [row.researchQueryTaskId] : []))],
    originatingQueries: [...new Set(grouped.map((row) => row.researchOriginatingQuery ?? row.originatingQuery))],
    artifactIds: [...new Set(grouped.map((row) => row.artifactId))],
    rows: grouped,
  }));
}

export function computeResearchCoverage(round: ResearchRound, rows: ResearchResultRow[]) {
  const context: ResearchContext = { designId: round.designId, productId: round.productId, roundId: round.id, seedVersion: round.seedVersion };
  const eligible = researchRowsForContext(rows, context).filter((row) => isResearchRowEligible(row) && Boolean(row.intentDimensionId));
  return researchRequiredDimensionsForRound(round).map((dimension) => ({
    dimensionId: dimension.id,
    covered: eligible.some((row) => row.intentDimensionId === dimension.id),
    rowIds: eligible.filter((row) => row.intentDimensionId === dimension.id).map((row) => row.id).sort(),
  }));
}

function confirmedResearchNumber(field: ResearchField<number>) {
  return (field.status === "confirmed" || field.status === "confirmed-zero") && field.parsed !== null && Number.isFinite(field.parsed)
    ? field.parsed
    : null;
}

/**
 * Compact, deterministic analysis input. It exposes only active structured rows
 * from received exact-context tasks, then round-robins the best rows per task so
 * one large export cannot crowd every other completed task/dimension out.
 */
export function selectResearchSupportRowLedger(input: {
  round: ResearchRound;
  tasks: ResearchQueryTask[];
  rows: ResearchResultRow[];
}): ResearchSupportRowLedgerEntry[] {
  const context: ResearchContext = { designId: input.round.designId, productId: input.round.productId, roundId: input.round.id, seedVersion: input.round.seedVersion };
  const completedTasks = researchQueryTasksForContext(input.tasks, context).filter((task) => task.status === "received");
  const completedTaskById = new Map(completedTasks.map((task) => [task.id, task]));
  const rowsByTask = new Map(completedTasks.map((task) => [task.id, [] as ResearchResultRow[]]));
  for (const row of researchRowsForContext(input.rows, context)) {
    const task = row.researchQueryTaskId ? completedTaskById.get(row.researchQueryTaskId) : undefined;
    const originatingQuery = row.researchOriginatingQuery ?? row.originatingQuery;
    if (!task
      || !isResearchRowEligible(row)
      || Boolean(row.supersededByRowId)
      || row.evidenceMedium === "ocr-image"
      || row.intentDimensionId !== task.intentDimensionId
      || normalizeResearchQuery(originatingQuery) !== task.normalizedQuery) continue;
    rowsByTask.get(task.id)?.push(row);
  }
  const compareRows = (left: ResearchResultRow, right: ResearchResultRow) => {
    const leftVolume = confirmedResearchNumber(left.searchVolume);
    const rightVolume = confirmedResearchNumber(right.searchVolume);
    const leftCompetition = confirmedResearchNumber(left.competition);
    const rightCompetition = confirmedResearchNumber(right.competition);
    return (rightVolume ?? Number.NEGATIVE_INFINITY) - (leftVolume ?? Number.NEGATIVE_INFINITY)
      || (leftCompetition ?? Number.POSITIVE_INFINITY) - (rightCompetition ?? Number.POSITIVE_INFINITY)
      || normalizeResearchQuery(left.phrase.parsed ?? left.phrase.raw).localeCompare(normalizeResearchQuery(right.phrase.parsed ?? right.phrase.raw))
      || left.id.localeCompare(right.id);
  };
  for (const rows of rowsByTask.values()) rows.sort(compareRows);
  const ledger: ResearchSupportRowLedgerEntry[] = [];
  for (let rowIndex = 0; ledger.length < RESEARCH_SUPPORT_ROW_LEDGER_LIMIT; rowIndex += 1) {
    let added = false;
    for (const task of completedTasks) {
      const row = rowsByTask.get(task.id)?.[rowIndex];
      if (!row) continue;
      ledger.push({
        rowId: row.id,
        phrase: String(row.phrase.parsed ?? row.phrase.raw).trim(),
        originatingQuery: row.researchOriginatingQuery ?? row.originatingQuery,
        intentDimensionId: task.intentDimensionId,
        researchQueryTaskId: task.id,
        confirmedSearchVolume: confirmedResearchNumber(row.searchVolume),
        confirmedCompetition: confirmedResearchNumber(row.competition),
      });
      added = true;
      if (ledger.length === RESEARCH_SUPPORT_ROW_LEDGER_LIMIT) break;
    }
    if (!added) break;
  }
  return ledger;
}

function researchRepeatRate(rows: ResearchResultRow[]) {
  const eligible = rows.filter(isResearchRowEligible);
  if (!eligible.length) return 0;
  const unique = new Set(eligible.map((row) => normalizeResearchQuery(row.phrase.parsed ?? row.phrase.raw))).size;
  return (eligible.length - unique) / eligible.length;
}

function independentlyResearchableQuery(query: string) {
  const tokens = query.normalize("NFKC").trim().split(/\s+/).filter(Boolean);
  return tokens.length >= 2 && tokens.length <= 4 && tokens.every((token) => /^[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*$/u.test(token));
}

export function validateAndRankGapCandidates(input: {
  round: ResearchRound;
  tasks: ResearchQueryTask[];
  rows: ResearchResultRow[];
  rawDrafts: GapCandidateDraft[];
  origin?: ResearchGapAnalysisOrigin;
  id?: string;
  now?: string;
}): ResearchGapAnalysisAttempt {
  const context: ResearchContext = { designId: input.round.designId, productId: input.round.productId, roundId: input.round.id, seedVersion: input.round.seedVersion };
  const rawCount = input.rawDrafts.length;
  const emptyAudit = { rawCount, acceptedRawOrdinals: [] as number[], rejections: [] as GapCandidateRejection[] };
  if (rawCount !== 25) {
    return { ...context, id: input.id ?? createId("research-gap-analysis"), rawDrafts: input.rawDrafts, rejectionAudit: { ...emptyAudit, rejections: [{ reason: "raw-count-not-25", rawOrdinal: 0, supportingRowIds: [] }] }, rankedCandidates: [], status: "invalid", createdAt: input.now ?? new Date().toISOString(), ...(input.origin ? { origin: input.origin } : {}) };
  }
  const dimensions = researchRequiredDimensionsForRound(input.round);
  const coverage = computeResearchCoverage(input.round, input.rows);
  const covered = new Set(coverage.filter((item) => item.covered).map((item) => item.dimensionId));
  const dimensionOrder = new Map(dimensions.map((dimension) => [dimension.id, dimension.ordinal]));
  const exactTasks = researchQueryTasksForContext(input.tasks, context);
  const completedTaskIds = new Set(exactTasks.filter((task) => task.status === "received").map((task) => task.id));
  const completedQueries = new Set(exactTasks.filter((task) => task.status === "received").map((task) => task.normalizedQuery));
  const allRowsById = new Map(input.rows.map((row) => [row.id, row]));
  const exactRows = researchRowsForContext(input.rows, context);
  const exactRowsById = new Map(exactRows.map((row) => [row.id, row]));
  const seenDrafts = new Set<string>();
  const valid: GapCandidate[] = [];
  const rejections: GapCandidateRejection[] = [];
  for (let index = 0; index < input.rawDrafts.length; index += 1) {
    const draft = input.rawDrafts[index];
    const rawOrdinal = index + 1;
    const normalizedQuery = normalizeResearchQuery(draft.query ?? "");
    const supportIds = Array.isArray(draft.supportingRowIds) ? [...draft.supportingRowIds] : [];
    let reason: GapCandidateRejectionReason | undefined;
    if (completedQueries.has(normalizedQuery)) reason = "completed-query-duplicate";
    else if (seenDrafts.has(normalizedQuery)) reason = "candidate-duplicate";
    else if (!dimensionOrder.has(draft.targetDimension)) reason = "unknown-target";
    else if (covered.has(draft.targetDimension)) reason = "covered-target";
    else if (!draft.extensionLogic?.trim()) reason = "missing-extension-logic";
    else if (!supportIds.length) reason = "empty-support";
    else if (!independentlyResearchableQuery(draft.query ?? "")) reason = "non-researchable-phrase";
    const supports = supportIds.map((id) => exactRowsById.get(id)).filter((row): row is ResearchResultRow => Boolean(row));
    if (!reason) {
      const firstMissing = supportIds.find((id) => !allRowsById.has(id));
      const firstCrossContext = supportIds.find((id) => allRowsById.has(id) && !exactRowsById.has(id));
      const firstInactive = supports.find((row) => Boolean(row.supersededByRowId));
      const firstIneligible = supports.find((row) => !isResearchRowEligible(row));
      const firstUnstructured = supports.find((row) => row.evidenceMedium === "ocr-image");
      const firstNonCompleted = supports.find((row) => !row.researchQueryTaskId || !completedTaskIds.has(row.researchQueryTaskId));
      const firstCoveringTarget = supports.find((row) => row.intentDimensionId === draft.targetDimension);
      if (firstMissing) reason = "missing-support";
      else if (firstCrossContext) reason = "cross-context-support";
      else if (firstInactive) reason = "inactive-support";
      else if (firstIneligible) reason = "ineligible-support";
      else if (firstUnstructured) reason = "unstructured-support";
      else if (firstNonCompleted) reason = "non-completed-support";
      else if (firstCoveringTarget) reason = "support-covers-target";
      else {
        const supportLanguage = supports.flatMap((row) => normalizeResearchQuery(row.phrase.parsed ?? row.phrase.raw).split(" ")).filter((token) => token.length >= 3);
        const extension = normalizeResearchQuery(draft.extensionLogic);
        if (!supportLanguage.some((token) => extension.includes(token))) reason = "missing-extension-logic";
      }
    }
    if (reason) {
      rejections.push({ reason, rawOrdinal, ...(normalizedQuery ? { normalizedQuery } : {}), targetDimension: draft.targetDimension, supportingRowIds: supportIds });
      seenDrafts.add(normalizedQuery);
      continue;
    }
    seenDrafts.add(normalizedQuery);
    valid.push({
      ...draft,
      id: `gap-candidate:${researchFingerprint({ context, rawOrdinal, normalizedQuery, targetDimension: draft.targetDimension })}`,
      rawOrdinal,
      normalizedQuery,
      supportingEligibleRowCount: supports.length,
      // Support-row metrics belong to the researched support phrase, never to
      // this unresearched candidate hypothesis.
      confirmedSearchVolume: null,
      confirmedCompetition: null,
    });
  }
  valid.sort((left, right) => (dimensionOrder.get(left.targetDimension) ?? Number.MAX_SAFE_INTEGER) - (dimensionOrder.get(right.targetDimension) ?? Number.MAX_SAFE_INTEGER)
    || right.supportingEligibleRowCount - left.supportingEligibleRowCount
    || left.normalizedQuery.localeCompare(right.normalizedQuery)
    || left.rawOrdinal - right.rawOrdinal);
  const proposalReady = valid.length >= 15;
  return {
    ...context,
    id: input.id ?? createId("research-gap-analysis"),
    rawDrafts: input.rawDrafts,
    rejectionAudit: { rawCount, acceptedRawOrdinals: valid.map((candidate) => candidate.rawOrdinal), rejections },
    rankedCandidates: proposalReady ? valid.slice(0, 25) : [],
    status: proposalReady ? "proposal-ready" : "insufficient-valid",
    createdAt: input.now ?? new Date().toISOString(),
    ...(input.origin ? { origin: input.origin } : {}),
  };
}

export function deriveAdaptiveResearchAction(input: {
  round: ResearchRound;
  tasks: ResearchQueryTask[];
  rows: ResearchResultRow[];
  conclusion?: ResearchConclusion;
  gapAnalysis?: ResearchGapAnalysisAttempt;
}): AdaptiveResearchAction {
  const context: ResearchContext = { designId: input.round.designId, productId: input.round.productId, roundId: input.round.id, seedVersion: input.round.seedVersion };
  const tasks = researchQueryTasksForContext(input.tasks, context);
  const exactRows = researchRowsForContext(input.rows, context);
  const coverage = computeResearchCoverage(input.round, input.rows);
  const repeatRate = researchRepeatRate(exactRows);
  const base = { coverage, repeatRate };
  if (tasks.length < 3 || tasks.length > 5) {
    const blockingInput = "Select exactly 3–5 Individual queries from the active Bulk anchors.";
    return { ...base, persistedDecision: "next-round", actionKind: "collect-missing-input", reasonCodes: ["individual-task-count"], nextAction: blockingInput, blockingInput };
  }
  for (const task of tasks) {
    const taskRows = exactRows.filter((row) => row.researchQueryTaskId === task.id);
    const lineageBlocker = taskRows.find((row) => row.flags.conflicting || row.flags.unmapped || normalizeResearchQuery(row.researchOriginatingQuery ?? "") !== task.normalizedQuery);
    if (lineageBlocker) {
      const blockingInput = `Correct the explicit task assignment for query “${task.query}”.`;
      return { ...base, persistedDecision: "next-round", actionKind: "collect-missing-input", reasonCodes: ["task-lineage-blocker"], nextAction: blockingInput, blockingInput };
    }
    if (task.status !== "received") {
      const blockingInput = task.status === "error" ? `Recover the error on Individual query “${task.query}”.` : `Upload the owner export to the exact task for “${task.query}”.`;
      return { ...base, persistedDecision: "next-round", actionKind: "collect-missing-input", reasonCodes: [`task-${task.status}`], nextAction: blockingInput, blockingInput };
    }
    if (!taskRows.some((row) => isResearchRowEligible(row) && row.evidenceMedium !== "ocr-image")) {
      const blockingInput = `Collect one eligible structured row for Individual query “${task.query}”.`;
      return { ...base, persistedDecision: "next-round", actionKind: "collect-missing-input", reasonCodes: ["task-no-eligible-structured-row"], nextAction: blockingInput, blockingInput };
    }
  }
  const uncovered = coverage.filter((item) => !item.covered);
  if (uncovered.length) {
    const gap = researchRequiredDimensionsForRound(input.round).find((dimension) => dimension.id === uncovered[0].dimensionId);
    if (input.gapAnalysis?.status === "proposal-ready" && exactResearchContext(input.gapAnalysis, context) && input.gapAnalysis.rankedCandidates.length >= 15 && input.gapAnalysis.rankedCandidates.length <= 25) {
      return { ...base, persistedDecision: "next-round", actionKind: "propose-gap-round", reasonCodes: ["named-intent-gap"], nextAction: `Review the ${input.gapAnalysis.rankedCandidates.length} ranked candidates for the named ${gap?.label ?? uncovered[0].dimensionId} gap; no round or task is created automatically.`, gapProposal: input.gapAnalysis.rankedCandidates, rejectionAudit: input.gapAnalysis.rejectionAudit };
    }
    const blockingInput = `Collect one corrected product-research-analysis output with exactly 25 raw drafts for the named ${gap?.label ?? uncovered[0].dimensionId} gap.`;
    return { ...base, persistedDecision: "next-round", actionKind: "collect-missing-input", reasonCodes: [input.gapAnalysis?.rejectionAudit.rejections[0]?.reason ?? "gap-analysis-missing"], nextAction: blockingInput, blockingInput, ...(input.gapAnalysis ? { rejectionAudit: input.gapAnalysis.rejectionAudit } : {}) };
  }
  const persistedDecision = input.conclusion?.decision ?? "next-round";
  if (persistedDecision === "retain") return { ...base, persistedDecision, actionKind: "close-research", reasonCodes: [repeatRate >= 0.5 ? "coverage-complete-high-repeat" : "coverage-complete"], nextAction: "Ask the owner to review and approve this exact retained research context." };
  if (persistedDecision === "defer") return { ...base, persistedDecision, actionKind: "close-research", reasonCodes: ["coverage-complete-defer"], nextAction: "Close research and pause or redirect this concept; Listing Brief stays locked." };
  const blockingInput = input.conclusion?.nextAction ?? "Resolve the first evidence or fit blocker for this exact context.";
  return { ...base, persistedDecision, actionKind: "collect-missing-input", reasonCodes: ["legacy-decision-blocker"], nextAction: blockingInput, blockingInput };
}

export function deriveResearchOpportunity(rows: ResearchResultRow[]): ResearchFitAssessment {
  const eligible = rows.filter(isResearchRowEligible);
  if (!eligible.length) return "missing";
  return eligible.some((row) => (row.searchVolume.parsed ?? 0) > 0 || (row.trend.parsed ?? 0) > 0 || (row.relevanceScore.parsed ?? 0) > 0) ? "supported" : "weak";
}

export function saveResearchResultBatch(stateInput: EtsyOperationsState, input: {
  round: ResearchRound;
  batch?: ResearchBatch;
  artifact: EvidenceArtifact;
  rows: ResearchResultRow[];
  attemptedFileOrSource: string;
  now?: string;
}) {
  const state = hydrateResearchResults(stateInput);
  const now = input.now ?? new Date().toISOString();
  const context: ResearchContext = { designId: input.round.designId, productId: input.round.productId, roundId: input.round.id, seedVersion: input.round.seedVersion };
  if (!state.researchRounds.some((round) => round.id === input.round.id)) {
    throw new Error("Save the exact active research round before saving a Research Batch.");
  }
  if (input.batch && !researchBatchMatchesContext(input.batch, context)) throw new Error("Research Batch context does not match this exact active round.");
  const queryTask = input.artifact.researchQueryTaskId ? state.researchQueryTasks.find((task) => task.id === input.artifact.researchQueryTaskId) : undefined;
  if (input.artifact.researchQueryTaskId && (!queryTask
    || !exactResearchContext(queryTask, context)
    || normalizeResearchQuery(input.artifact.researchOriginatingQuery ?? "") !== queryTask.normalizedQuery
    || input.artifact.researchIntentDimensionId !== queryTask.intentDimensionId)) {
    throw new Error("This file is attached to the wrong Individual task. Explicitly reassign it; filename and upload order cannot create lineage.");
  }
  if (queryTask && input.rows.some((row) => row.researchQueryTaskId !== queryTask.id || normalizeResearchQuery(row.researchOriginatingQuery ?? "") !== queryTask.normalizedQuery || row.intentDimensionId !== queryTask.intentDimensionId)) {
    throw new Error("Normalized rows do not match the exact Individual task/query target.");
  }
  if (input.batch) {
    const roundLedger = researchActiveInputLedgerForRound(input.round);
    const batchLedgerIsExact = input.batch.seedLedger.length === roundLedger.length
      && input.batch.seedLedger.every((seed, index) => seed.id === roundLedger[index]?.id && seed.ordinal === roundLedger[index]?.ordinal && seed.query === roundLedger[index]?.query);
    if (!batchLedgerIsExact || !input.batch.selectedSeedIds.length || input.batch.selectedSeedIds.some((id) => !roundLedger.some((seed) => seed.id === id))) {
      throw new Error("Research Batch seed identity is not valid for this exact frozen round.");
    }
  }
  const sourceDate = input.artifact.researchSourceDate ?? input.artifact.periodStart ?? "";
  // Keep save-time validation deterministic: callers may supply a capture/save
  // timestamp for tests or an imported artifact, so future-date checks must use
  // that same clock rather than the machine's current calendar date.
  const dateCheck = assessResearchFreshness(sourceDate, input.artifact.researchFreshnessPolicy, hongKongCalendarDate(now));
  if (!dateCheck.eligible) throw new Error(`Correct the ${dateCheck.issue ?? "stale"} source date before saving this artifact.`);
  const artifact = {
    ...input.artifact,
    ...(input.batch ? { researchBatchId: input.batch.id, researchSeedIds: input.artifact.researchSeedIds ?? input.batch.selectedSeedIds } : {}),
    rawFingerprint: input.artifact.rawFingerprint ?? researchFingerprint({
      contentText: input.artifact.contentText,
      dataUrl: input.artifact.dataUrl,
      sourceDate,
      fileName: input.artifact.fileName,
      mimeType: input.artifact.mimeType,
    }),
  };
  if (input.batch) {
    const batch = input.batch;
    const artifactSeedIds = researchArtifactSeedIds(batch, artifact);
    if (!artifactSeedIds.length || artifactSeedIds.some((id) => !batch.selectedSeedIds.includes(id))) {
      throw new Error("Choose a valid inherited seed or per-artifact override before saving.");
    }
    if (!artifact.researchArtifactOrdinal || artifact.researchArtifactOrdinal < 1) {
      throw new Error("This preview is missing its stable artifact order. Recreate that item without clearing its siblings.");
    }
    if (!artifact.researchCapturedAt || !artifact.researchCapturedAtHk) {
      throw new Error("This preview is missing its automatic Hong Kong capture time. Recreate that item without clearing its siblings.");
    }
    if (artifact.mimeType.startsWith("image/") && (!artifact.dataUrl || artifact.researchRawRecovery?.persisted === false)) {
      throw new Error("Reattach the original screenshot for this exact artifact before saving; sibling batch items remain available.");
    }
  }
  const exactRawArtifact = state.artifacts.find((item) => item.researchRoundId === context.roundId
    && item.researchSeedVersion === context.seedVersion
    && item.targetId === context.designId
    && item.rawFingerprint === artifact.rawFingerprint);
  const batchInput = input.batch;
  const updateBatch = (current: ResearchBatch[], status: ResearchBatchStatus, artifactId?: string) => {
    if (!batchInput) return current;
    const currentBatch = current.find((item) => item.id === batchInput.id);
    const base = currentBatch ?? batchInput;
    // The incoming batch may still contain unsaved sibling preview IDs. Only
    // durable artifacts may be carried forward; the current artifact is the
    // sole new ID allowed into this save operation.
    const savedArtifactIds = new Set(state.artifacts
      .filter((item) => item.researchBatchId === batchInput.id)
      .map((item) => item.id));
    const retainedArtifactIds = base.artifactIds.filter((id) => savedArtifactIds.has(id));
    const artifactIds = artifactId
      ? [...new Set([...retainedArtifactIds, artifactId])]
      : retainedArtifactIds;
    const next = { ...base, artifactIds, status, updatedAt: now };
    return [next, ...current.filter((item) => item.id !== next.id)];
  };
  if (exactRawArtifact) {
    const existingRow = state.researchResultRows.find((row) => row.artifactId === exactRawArtifact.id);
    const fingerprint = artifact.rawFingerprint;
    const existingAudit = state.researchDuplicateAuditEvents.find((audit) => audit.existingArtifactId === exactRawArtifact.id && audit.fingerprint === fingerprint && audit.kind === "artifact");
    const audit = existingAudit
      ? state.researchDuplicateAuditEvents.map((item) => item.id === existingAudit.id ? { ...item, attemptedFileOrSource: input.attemptedFileOrSource, attemptedAt: now, lastSeenAt: now, occurrenceCount: item.occurrenceCount + 1, ...(input.batch ? { researchBatchId: input.batch.id, attemptedArtifactId: artifact.id } : {}) } : item)
      : [{ id: researchFingerprint({ existingArtifactId: exactRawArtifact.id, fingerprint, kind: "artifact" }), existingArtifactId: exactRawArtifact.id, existingRowId: existingRow?.id ?? `raw:${exactRawArtifact.id}`, fingerprint, attemptedFileOrSource: input.attemptedFileOrSource, attemptedAt: now, lastSeenAt: now, occurrenceCount: 1, kind: "artifact" as const, ...(input.batch ? { researchBatchId: input.batch.id, attemptedArtifactId: artifact.id } : {}) }, ...state.researchDuplicateAuditEvents];
    return { state: { ...state, researchBatches: updateBatch(state.researchBatches, "partial"), researchDuplicateAuditEvents: audit }, savedCount: 0, duplicateCount: 1, conflictCount: 0 };
  }
  let rows = [...state.researchResultRows];
  let audits = [...state.researchDuplicateAuditEvents];
  let savedCount = 0;
  let duplicateCount = 0;
  let conflictCount = 0;
  let decisionAffectingCount = 0;
  for (let candidate of input.rows) {
    if (input.batch) {
      const permittedSeedIds = researchArtifactSeedIds(input.batch, artifact);
      const contextMatches = candidate.researchBatchId === input.batch.id
        && candidate.roundId === context.roundId
        && candidate.designId === context.designId
        && candidate.productId === context.productId
        && candidate.seedVersion === context.seedVersion;
      if (!contextMatches || !candidate.originatingSeedId || !permittedSeedIds.includes(candidate.originatingSeedId)) {
        candidate = { ...candidate, researchBatchId: input.batch.id, flags: { ...candidate.flags, unmapped: true, unconfirmed: true } };
      }
    }
    const artifactForRow = (row: ResearchResultRow) => row.artifactId === artifact.id ? artifact : state.artifacts.find((item) => item.id === row.artifactId);
    const candidateFingerprint = researchEvidenceFingerprint(candidate, artifact);
    const exact = rows.find((row) => researchEvidenceFingerprint(row, artifactForRow(row)) === candidateFingerprint);
    if (exact) {
      duplicateCount += 1;
      rows = rows.map((row) => row.id === exact.id ? { ...row, flags: { ...row.flags, duplicate: true } } : row);
      const existingAudit = audits.find((audit) => audit.existingRowId === exact.id && audit.fingerprint === candidateFingerprint);
      audits = existingAudit
        ? audits.map((audit) => audit.id === existingAudit.id ? { ...audit, attemptedFileOrSource: input.attemptedFileOrSource, attemptedAt: now, lastSeenAt: now, occurrenceCount: audit.occurrenceCount + 1, ...(input.batch ? { researchBatchId: input.batch.id, attemptedArtifactId: artifact.id } : {}) } : audit)
        : [{ id: researchFingerprint({ existingRowId: exact.id, fingerprint: candidateFingerprint }), existingArtifactId: exact.artifactId, existingRowId: exact.id, fingerprint: candidateFingerprint, attemptedFileOrSource: input.attemptedFileOrSource, attemptedAt: now, lastSeenAt: now, occurrenceCount: 1, kind: "row" as const, ...(input.batch ? { researchBatchId: input.batch.id, attemptedArtifactId: artifact.id } : {}) }, ...audits];
      continue;
    }
    const candidateValueFingerprint = researchValueFingerprint(candidate);
    const sameValueRows = rows.filter((row) => row.lineageKey === candidate.lineageKey && researchValueFingerprint(row) === candidateValueFingerprint);
    const candidateQuality = researchEvidenceQuality(candidate, artifact);
    const betterExisting = sameValueRows
      .filter((row) => !row.supersededByRowId && researchEvidenceQuality(row, artifactForRow(row)) > candidateQuality)
      .sort((left, right) => researchEvidenceQuality(right, artifactForRow(right)) - researchEvidenceQuality(left, artifactForRow(left)) || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))[0];
    let nextCandidate = { ...candidate, contentFingerprint: candidateFingerprint };
    if (betterExisting) {
      nextCandidate = { ...nextCandidate, supersededByRowId: betterExisting.id };
    } else {
      rows = rows.map((row) => row.lineageKey === candidate.lineageKey
        && researchValueFingerprint(row) === candidateValueFingerprint
        && researchEvidenceQuality(row, artifactForRow(row)) < candidateQuality
        ? { ...row, supersededByRowId: candidate.id, flags: { ...row.flags, conflicting: false } }
        : row);
      decisionAffectingCount += 1;
    }
    rows.push(nextCandidate);
    rows = reconcileResearchLineageConflicts(rows, candidate.lineageKey);
    if (!nextCandidate.supersededByRowId && rows.some((row) => row.id === candidate.id && row.flags.conflicting)) conflictCount += 1;
    savedCount += 1;
  }
  // A non-identical raw artifact whose rows are exact duplicates is still an
  // auditable batch artifact. Only the earlier exact-raw branch omits it.
  const shouldSaveArtifact = savedCount > 0 || input.rows.length === 0 || Boolean(input.batch && duplicateCount > 0);
  const savedArtifact = {
    ...artifact,
    researchArtifactStatus: conflictCount ? "conflicting" as const : input.rows.length === 0 ? "visual-review-only" as const : savedCount ? "saved" as const : "duplicate-audited" as const,
  };
  const artifacts = shouldSaveArtifact && !state.artifacts.some((item) => item.id === artifact.id) ? [savedArtifact, ...state.artifacts] : state.artifacts;
  const duplicateOnlyAttempt = input.rows.length > 0 && savedCount === 0 && duplicateCount === input.rows.length;
  const researchRounds = state.researchRounds.map((round) => {
    if (round.id !== input.round.id) return round;
    const artifactIds = shouldSaveArtifact && !round.artifactIds.includes(artifact.id) ? [...round.artifactIds, artifact.id] : round.artifactIds;
    if (duplicateOnlyAttempt) return { ...round, artifactIds, updatedAt: now };
    if (decisionAffectingCount === 0) return { ...round, artifactIds, updatedAt: now };
    return {
      ...round,
      status: (conflictCount ? "next-round-needed" : "saved-awaiting-review") as ResearchRoundStatus,
      artifactIds,
      conclusion: undefined,
      ownerGateId: undefined,
      updatedAt: now,
    };
  });
  const batchStatus: ResearchBatchStatus = conflictCount ? "conflicting" : duplicateOnlyAttempt ? "partial" : savedCount < input.rows.length ? "partial" : "saved";
  const researchQueryTasks = queryTask && shouldSaveArtifact && !duplicateOnlyAttempt
    ? state.researchQueryTasks.map((task) => task.id !== queryTask.id ? task : updateResearchQueryTaskFromArtifact(task, savedArtifact, rows.some((row) => row.artifactId === artifact.id && isResearchRowEligible(row)) ? "received" : "error", now))
    : state.researchQueryTasks;
  return { state: { ...state, artifacts, researchRounds, researchBatches: updateBatch(state.researchBatches, batchStatus, shouldSaveArtifact ? artifact.id : undefined), researchResultRows: rows, researchQueryTasks, researchDuplicateAuditEvents: audits }, savedCount, duplicateCount, conflictCount };
}

export function buildResearchCoachConclusion(input: {
  round: ResearchRound;
  rows: ResearchResultRow[];
  buyerOccasionFit: ResearchFitAssessment;
  productFit: ResearchFitAssessment;
  opportunity: ResearchFitAssessment;
  now?: string;
}): ResearchConclusion {
  const context: ResearchContext = { designId: input.round.designId, productId: input.round.productId, roundId: input.round.id, seedVersion: input.round.seedVersion };
  const exactRows = researchRowsForContext(input.rows, context);
  const decisionRows = exactRows.filter((row) => !row.supersededByRowId);
  const eligibleRows = decisionRows.filter(isResearchRowEligible);
  const sourceUnavailableRows = decisionRows.filter((row) => !isResearchRowEligible(row) && researchRowHasOnlySourceUnavailableMetrics(row));
  const blockingTruth: string[] = [];
  if (!decisionRows.length) blockingTruth.push("No saved result rows exist for this exact research round.");
  if (decisionRows.length && !eligibleRows.length) blockingTruth.push("No eligible numeric research signal exists; the source reported Unknown or missing values for the selected rows.");
  if (decisionRows.some(researchRowHasBlockingTruth)) blockingTruth.push("Missing, invalid, OCR-only, unconfirmed, stale, future-dated, or conflicting truth remains.");
  if (input.buyerOccasionFit === "missing") blockingTruth.push("Buyer or buying occasion fit is missing.");
  if (input.productFit === "missing") blockingTruth.push("Product fit is missing.");
  if (input.opportunity === "missing") blockingTruth.push("The next targeted opportunity signal is missing.");
  let decision: ResearchDecision;
  let nextAction: string;
  if (blockingTruth.length) {
    decision = "next-round";
    nextAction = decisionRows.length ? "Resolve the first visible blocked truth for this exact round." : "Add one structured eRank or EverBee result for this exact round.";
  } else if (input.buyerOccasionFit === "weak" || input.productFit === "weak" || input.opportunity === "weak") {
    decision = "defer";
    nextAction = "Pause this concept and return to the Product Development shortlist.";
  } else {
    decision = "retain";
    nextAction = "Request owner approval for this exact design, product, round, and seed version.";
  }
  return {
    decision,
    buyerProductFit: `Buyer/occasion fit: ${input.buyerOccasionFit}; product fit: ${input.productFit}.`,
    evidenceBasis: decisionRows.length
      ? [`${decisionRows.length} active exact-context supplemental row(s) from eRank/EverBee.`, ...(sourceUnavailableRows.length ? [`${sourceUnavailableRows.length} row(s) reported Unknown or missing values and were excluded from numeric comparison.`] : [])]
      : [],
    blockingTruth,
    nextAction,
    reviewSignal: decision === "next-round" ? "Review when the named blocker has eligible exact-context evidence." : decision === "defer" ? "Review only if buyer, product, or opportunity evidence materially changes." : "Review the exact owner gate before opening Listing Brief.",
    createdAt: input.now ?? new Date().toISOString(),
  };
}

export function researchPreviewKey(context: ResearchContext) {
  return `etsy-research-preview:${encodeURIComponent(context.designId)}:${encodeURIComponent(context.productId)}:${encodeURIComponent(context.roundId)}:${encodeURIComponent(context.seedVersion)}`;
}

export function serializeResearchPreview(preview: unknown) { return JSON.stringify(preview); }
export function deserializeResearchPreview<T = Record<string, unknown>>(value: string): T | null {
  try {
    const parsed = JSON.parse(value) as T;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch { return null; }
}

export const RESEARCH_OCR_TIMEOUT_MS = 15_000;
export type ResearchOcrFailureReason = "worker-load-failed" | "recognize-failed" | "timed-out" | "unreadable";
export type ResearchOcrLifecycle = {
  status: "succeeded" | "visual-review-only";
  attemptId: string;
  completedAt: string;
  failureReason?: ResearchOcrFailureReason;
  message?: string;
};
export type ResearchOcrOutcome = { text: string; lifecycle: ResearchOcrLifecycle };
export type ResearchOcrWorker = {
  recognize: (image: unknown) => Promise<{ data: { text?: string } }>;
  terminate: () => Promise<unknown> | unknown;
};

class ResearchOcrTimeoutError extends Error {}

function researchOcrFailureMessage(reason: ResearchOcrFailureReason) {
  if (reason === "timed-out") return "OCR reached its bounded time limit. The screenshot is ready to save for visual review only.";
  if (reason === "unreadable") return "OCR returned no readable text. The screenshot is ready to save for visual review only.";
  if (reason === "worker-load-failed") return "OCR worker or language assets could not load. The screenshot is ready to save for visual review only.";
  return "OCR could not read this screenshot. The screenshot is ready to save for visual review only.";
}

async function terminateResearchOcrWorker(worker: ResearchOcrWorker, timeoutMs: number) {
  try {
    await Promise.race([
      Promise.resolve(worker.terminate()),
      new Promise<void>((resolve) => setTimeout(resolve, Math.max(1, Math.min(timeoutMs, 250)))),
    ]);
  } catch { /* Termination was requested; a worker cleanup fault must not trap the preview in loading. */ }
}

/**
 * One terminal, bounded OCR attempt shared by initial screenshot preview and Retry OCR.
 * Late worker/recognition settlement has no state callback and therefore cannot replace the returned terminal outcome.
 */
export async function runBoundedResearchOcr(input: {
  attemptId: string;
  image: unknown;
  createWorker: () => Promise<ResearchOcrWorker>;
  prepareImage?: () => Promise<unknown>;
  timeoutMs?: number;
  now?: () => string;
}): Promise<ResearchOcrOutcome> {
  const timeoutMs = Math.max(1, input.timeoutMs ?? RESEARCH_OCR_TIMEOUT_MS);
  const now = input.now ?? (() => new Date().toISOString());
  let worker: ResearchOcrWorker | undefined;
  let terminal = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const operation = (async () => {
    const image = input.prepareImage ? await input.prepareImage() : input.image;
    const created = await input.createWorker();
    if (terminal) {
      void terminateResearchOcrWorker(created, timeoutMs);
      throw new ResearchOcrTimeoutError();
    }
    worker = created;
    return created.recognize(image);
  })();
  // The raced operation can reject after timeout. Keep that late rejection handled.
  void operation.catch(() => undefined);

  try {
    const result = await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new ResearchOcrTimeoutError()), timeoutMs);
      }),
    ]);
    const text = String(result.data.text ?? "").trim();
    if (!text) {
      const failureReason: ResearchOcrFailureReason = "unreadable";
      return { text: "", lifecycle: { status: "visual-review-only", attemptId: input.attemptId, completedAt: now(), failureReason, message: researchOcrFailureMessage(failureReason) } };
    }
    return { text, lifecycle: { status: "succeeded", attemptId: input.attemptId, completedAt: now() } };
  } catch (error) {
    const failureReason: ResearchOcrFailureReason = error instanceof ResearchOcrTimeoutError
      ? "timed-out"
      : worker ? "recognize-failed" : "worker-load-failed";
    return { text: "", lifecycle: { status: "visual-review-only", attemptId: input.attemptId, completedAt: now(), failureReason, message: researchOcrFailureMessage(failureReason) } };
  } finally {
    terminal = true;
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    if (worker) await terminateResearchOcrWorker(worker, timeoutMs);
  }
}

export type ResearchPreviewRecoveryAction =
  | { type: "mark-error"; id: string; error: string }
  | { type: "clear-save-error" | "retry" | "reparse" | "reattach"; id: string };

export function reduceResearchPreviewRecovery<T extends { id: string; error?: string }>(items: T[], action: ResearchPreviewRecoveryAction) {
  return items.map((item) => item.id !== action.id ? item : action.type === "mark-error"
    ? { ...item, error: action.error }
    : { ...item, error: undefined });
}

export async function settleResearchPreviewAttempts<T extends { id: string }>(items: T[], attempt: (item: T) => Promise<void>) {
  const outcomes = await Promise.all(items.map(async (item) => {
    try { await attempt(item); return { id: item.id, ok: true as const }; }
    catch (error) { return { id: item.id, ok: false as const, error: error instanceof Error ? error.message : "Research preview action failed." }; }
  }));
  const successfulIds = outcomes.filter((outcome) => outcome.ok).map((outcome) => outcome.id);
  const failures = outcomes.filter((outcome): outcome is Extract<typeof outcomes[number], { ok: false }> => !outcome.ok).map((outcome) => ({ id: outcome.id, error: outcome.error }));
  return { successfulIds, failures };
}

export async function persistResearchStateAfterImmediatePublish<T>(next: T, publish: (value: T) => void, persist: (value: T) => Promise<void>) {
  publish(next);
  try {
    await persist(next);
    return true;
  } catch {
    return false;
  }
}

export function isListingBriefEligibleForResearchContext(stateInput: EtsyOperationsState, context: ResearchContext) {
  const state = hydrateResearchResults(stateInput);
  const round = state.researchRounds.find((item) => item.id === context.roundId && item.designId === context.designId && item.productId === context.productId && item.seedVersion === context.seedVersion);
  if (!round || round.status !== "owner-approved" || !round.ownerGateId) return false;
  const adaptiveTasks = researchQueryTasksForContext(state.researchQueryTasks, context);
  if (adaptiveTasks.length) {
    const gapAnalysis = [...state.researchGapAnalysisAttempts].filter((attempt) => exactResearchContext(attempt, context)).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    const adaptive = deriveAdaptiveResearchAction({ round, tasks: state.researchQueryTasks, rows: state.researchResultRows, conclusion: round.conclusion, gapAnalysis });
    if (round.conclusion?.decision !== "retain" || adaptive.actionKind !== "close-research" || adaptive.persistedDecision !== "retain" || adaptive.coverage.some((item) => !item.covered)) return false;
  }
  return state.gates.some((gate) => gate.id === round.ownerGateId
    && gate.status === "approved-for-draft"
    && gate.researchContext?.gateType === "research-to-listing-brief"
    && gate.researchContext.designId === context.designId
    && gate.researchContext.productId === context.productId
    && gate.researchContext.roundId === context.roundId
    && gate.researchContext.seedVersion === context.seedVersion);
}

export function latestResearchRoundForDesignProduct(stateInput: EtsyOperationsState, designId: string, productId: string) {
  const state = hydrateResearchResults(stateInput);
  return [...state.researchRounds]
    .filter((round) => round.designId === designId && round.productId === productId && round.seedVersion === SHORT_INTENT_V2_VERSION)
    .sort((left, right) => right.roundNumber - left.roundNumber || right.updatedAt.localeCompare(left.updatedAt))[0];
}

export function latestResearchContextForDesignProduct(stateInput: EtsyOperationsState, designId: string, productId: string): ResearchContext | undefined {
  const round = latestResearchRoundForDesignProduct(stateInput, designId, productId);
  return round ? { designId, productId, roundId: round.id, seedVersion: round.seedVersion } : undefined;
}

export function isLatestResearchContext(stateInput: EtsyOperationsState, context: ResearchContext) {
  const latest = latestResearchContextForDesignProduct(stateInput, context.designId, context.productId);
  return Boolean(latest && latest.roundId === context.roundId && latest.seedVersion === context.seedVersion);
}

export function deriveListingBriefSurfaceAccess(stateInput: EtsyOperationsState, designId: string, productId: string, draft?: ListingDraft) {
  const state = hydrateResearchResults(stateInput);
  const latestContext = latestResearchContextForDesignProduct(state, designId, productId);
  const exactApproved = Boolean(latestContext && isListingBriefEligibleForResearchContext(state, latestContext));
  const draftIsCurrent = Boolean(draft && deriveActiveDraftState(state.listingDrafts, designId).currentDraft?.id === draft.id);
  const draftMatchesExactContext = Boolean(draft?.researchContext && latestContext
    && draft.researchContext.designId === latestContext.designId
    && draft.researchContext.productId === latestContext.productId
    && draft.researchContext.roundId === latestContext.roundId
    && draft.researchContext.seedVersion === latestContext.seedVersion);
  const canRevealDraft = Boolean(draft && exactApproved && draftIsCurrent && draftMatchesExactContext);
  return {
    latestContext,
    exactApproved,
    draftIsCurrent,
    draftMatchesExactContext,
    canRevealDraft,
    metadataOnly: Boolean(draft) && !canRevealDraft,
  };
}

export function approveResearchRound(stateInput: EtsyOperationsState, context: ResearchContext, gateId = createId("research-gate"), approvedAt = new Date().toISOString()): EtsyOperationsState {
  const state = hydrateResearchResults(stateInput);
  if (!isLatestResearchContext(state, context)) throw new Error("Only the latest working research round can be owner-approved.");
  const round = state.researchRounds.find((item) => item.id === context.roundId && item.designId === context.designId && item.productId === context.productId && item.seedVersion === context.seedVersion);
  if (!round || round.status !== "conclusion-ready" || round.conclusion?.decision !== "retain" || round.conclusion.blockingTruth.length) throw new Error("Only an eligible retain conclusion for the exact context can be owner-approved.");
  const adaptiveTasks = researchQueryTasksForContext(state.researchQueryTasks, context);
  if (adaptiveTasks.length) {
    const gapAnalysis = [...state.researchGapAnalysisAttempts].filter((attempt) => exactResearchContext(attempt, context)).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    const adaptive = deriveAdaptiveResearchAction({ round, tasks: state.researchQueryTasks, rows: state.researchResultRows, conclusion: round.conclusion, gapAnalysis });
    if (adaptive.actionKind !== "close-research" || adaptive.persistedDecision !== "retain" || adaptive.coverage.some((item) => !item.covered)) throw new Error("Adaptive research must be retained, closed, fully covered, and task-complete before owner approval.");
  }
  const gate: OwnerGate = {
    id: gateId,
    subject: `Research approval: ${context.designId} / ${context.roundId}`,
    status: "approved-for-draft",
    evidenceIds: [...round.artifactIds],
    missing: [],
    nextStep: "Open the Listing Brief for this exact approved research context.",
    researchContext: { gateType: "research-to-listing-brief", ...context, approvedAt },
  };
  return {
    ...state,
    gates: [gate, ...state.gates.filter((item) => item.id !== gateId)],
    researchRounds: state.researchRounds.map((item) => item.id === round.id ? { ...item, status: "owner-approved" as const, ownerGateId: gateId, updatedAt: approvedAt } : item),
  };
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
