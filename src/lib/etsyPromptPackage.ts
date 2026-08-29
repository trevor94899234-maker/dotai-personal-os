import type { ResearchSupportRowLedgerEntry } from "./etsyOperations";

export const ETSY_SYSTEM_PROMPT_URL = "etsy-seo-system-prompt.txt";
export const ETSY_SYSTEM_PROMPT_HEADING = "# Etsy SEO Keyword Research & Listing Expert Master System Prompt";
export const ETSY_GLOBAL_POLICY_VERSION = "mygiftstyle-evidence-owner-v2";

export type EtsyStage = "product-research-bulk" | "product-research-individual" | "product-research-analysis" | "listing-brief" | "listing-audit" | "growth-launch";
export type EtsyStageRequest = { stage: EtsyStage; exactContext: Record<string, unknown>; allowedInputs: string[]; evidenceRefs: string[]; supportRowLedger?: ResearchSupportRowLedgerEntry[]; nextActionBoundary: string };
export type EtsyStagePacket = Omit<EtsyStageRequest, "nextActionBoundary"> & {
  globalPolicyVersion: typeof ETSY_GLOBAL_POLICY_VERSION;
  globalPolicy: string[];
  outputSchema: Record<string, unknown>;
  prohibitedTransitions: string[];
  nextActionBoundary: { instruction: string; ownerActionRequired: true; automaticTransition: false };
};

export type EtsyOperationsStageSelection = {
  operationsTab: string;
  workMode: string;
  researchStageRequest: EtsyStageRequest | null;
  analysisStageRequest: EtsyStageRequest | null;
  listingBriefStageRequest: EtsyStageRequest | null;
  listingAuditStageRequest: EtsyStageRequest | null;
  listingBriefUnlocked: boolean;
};

const GLOBAL_POLICY = [
  "Use only the exact visible Dashboard context; never mix a design, product, round, seed version, listing, or campaign.",
  "Etsy first-party Stats is performance truth; eRank and EverBee are supplemental research signals.",
  "Keep missing, invalid, confirmed-zero, stale, unconfirmed, OCR-only, duplicate, and conflicting distinct.",
  "Keep work local and draft-only. Do not log in, scrape, publish, edit listings, change ads, or perform live account actions.",
  "Only the owner may approve a transition; every automatic transition is prohibited.",
];

const STAGE_CONTRACT: Record<EtsyStage, { outputSchema: Record<string, unknown>; prohibitedTransitions: string[] }> = {
  "product-research-bulk": { outputSchema: { type: "BulkComparisonOutput", fields: ["comparedQueries", "evidenceGaps", "oneNextAction"] }, prohibitedTransitions: ["create-individual-task", "create-round", "generate-listing", "approve-gate"] },
  "product-research-individual": { outputSchema: { type: "IndividualResearchOutput", fields: ["taskId", "originatingQuery", "evidenceRefs", "parseStatus", "oneNextAction"] }, prohibitedTransitions: ["infer-lineage-from-filename", "satisfy-another-task", "create-round", "generate-listing"] },
  "product-research-analysis": { outputSchema: { type: "ResearchAnalysisOutput", fields: ["persistedDecision", "actionKind", "coverage", "repeatRate", "missingInput", "rawGapCandidateDrafts", "gapCandidateRejectionAudit", "rankedGapCandidates", "reasonCodes", "oneNextAction"], rawGapCandidateDrafts: { exactCountWhenGapExists: 25, itemFields: ["query", "targetDimension", "extensionLogic", "supportingRowIds"] }, rankedGapCandidates: { minimum: 15, maximum: 25, absentBelowMinimum: true } }, prohibitedTransitions: ["approve-owner-gate", "expose-partial-gap-proposal", "generate-listing", "create-round", "create-task"] },
  "listing-brief": { outputSchema: { type: "ListingBriefOutput", fields: ["title", "tags", "description", "claims", "evidenceIds", "oneNextAction"] }, prohibitedTransitions: ["publish", "edit-live-listing", "change-ads", "bypass-owner-gate", "switch-context"] },
  "listing-audit": { outputSchema: { type: "ListingAuditOutput", fields: ["observations", "evidenceGaps", "confidence", "oneNextAction"] }, prohibitedTransitions: ["mutate-product-research", "edit-live-listing", "change-ads", "publish"] },
  "growth-launch": { outputSchema: { type: "GrowthLaunchOutput", fields: ["proposedDecision", "missingInputs", "confidence", "oneNextTest"] }, prohibitedTransitions: ["mutate-product-research", "change-pricing", "publish", "change-ads", "account-operation"] },
};

export function normalizeEtsySystemPrompt(value: string) {
  const normalized = value.replace(/^\uFEFF/, "").trim();
  if (!normalized.startsWith(ETSY_SYSTEM_PROMPT_HEADING)) {
    throw new Error("The Etsy System Prompt asset is missing its expected heading.");
  }
  return normalized;
}

function hasExactContext(context: Record<string, unknown>) {
  return Object.keys(context).length > 0 && Object.values(context).some((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

export function buildEtsyStagePacket(request: EtsyStageRequest): EtsyStagePacket {
  if (!Object.hasOwn(STAGE_CONTRACT, request.stage)) throw new Error("Unknown Etsy stage; packet creation failed closed.");
  if (!hasExactContext(request.exactContext)) throw new Error("The current exact Dashboard context is empty.");
  if (!Array.isArray(request.allowedInputs) || request.allowedInputs.length === 0) throw new Error("The stage has no allowed inputs.");
  if (!request.nextActionBoundary.trim()) throw new Error("The stage requires one explicit next-action boundary.");
  if (request.stage === "product-research-analysis" && (!Array.isArray(request.supportRowLedger) || request.supportRowLedger.length === 0)) throw new Error("Product Research Analysis has no eligible support-row ledger; packet creation failed closed.");
  if (request.stage !== "product-research-analysis" && request.supportRowLedger !== undefined) throw new Error("A support-row ledger is allowed only for Product Research Analysis.");
  const contract = STAGE_CONTRACT[request.stage];
  return { stage: request.stage, globalPolicyVersion: ETSY_GLOBAL_POLICY_VERSION, globalPolicy: [...GLOBAL_POLICY], exactContext: request.exactContext, allowedInputs: [...request.allowedInputs], evidenceRefs: [...new Set(request.evidenceRefs.filter(Boolean))], ...(request.supportRowLedger ? { supportRowLedger: request.supportRowLedger.map((row) => ({ ...row })) } : {}), outputSchema: contract.outputSchema, prohibitedTransitions: [...contract.prohibitedTransitions], nextActionBoundary: { instruction: request.nextActionBoundary.trim(), ownerActionRequired: true, automaticTransition: false } };
}

function readyStageRequest(request: EtsyStageRequest | null, stages: EtsyStage[]) {
  if (!request || !stages.includes(request.stage)) return null;
  try {
    buildEtsyStagePacket(request);
    return request;
  } catch {
    return null;
  }
}

/** Resolve only explicitly supported Hub routes; incomplete or unknown routes stay copy-disabled. */
export function resolveEtsyOperationsStageRequest(selection: EtsyOperationsStageSelection): EtsyStageRequest | null {
  if (selection.workMode === "product-development" && selection.operationsTab === "research") {
    return readyStageRequest(selection.researchStageRequest, ["product-research-bulk", "product-research-individual", "product-research-analysis"]);
  }
  if (selection.workMode === "product-development" && selection.operationsTab === "analysis") {
    return readyStageRequest(selection.analysisStageRequest, ["product-research-analysis"]);
  }
  if (selection.workMode === "product-development" && selection.operationsTab === "results") {
    return selection.listingBriefUnlocked ? readyStageRequest(selection.listingBriefStageRequest, ["listing-brief"]) : null;
  }
  if (selection.workMode === "listing-audit" && (selection.operationsTab === "research" || selection.operationsTab === "analysis")) {
    return readyStageRequest(selection.listingAuditStageRequest, ["listing-audit"]);
  }
  return null;
}

export function serializeEtsyStagePacket(packet: EtsyStagePacket) {
  return [`MYGIFTSTYLE STAGE PACKET · ${packet.stage}`, `Global policy version: ${packet.globalPolicyVersion}`, "", "GLOBAL EVIDENCE / SAFETY / OWNER RULES", ...packet.globalPolicy.map((rule) => `- ${rule}`), "", "STAGE CONTRACT", JSON.stringify({ stage: packet.stage, exactContext: packet.exactContext, allowedInputs: packet.allowedInputs, evidenceRefs: packet.evidenceRefs, ...(packet.supportRowLedger ? { supportRowLedger: packet.supportRowLedger } : {}), outputSchema: packet.outputSchema, prohibitedTransitions: packet.prohibitedTransitions, nextActionBoundary: packet.nextActionBoundary }, null, 2)].join("\n");
}

/** Runtime callers receive only a typed stage packet; the protected master asset is never concatenated. */
export async function buildEtsyWorkflowPackage(request: EtsyStageRequest) {
  return serializeEtsyStagePacket(buildEtsyStagePacket(request));
}
