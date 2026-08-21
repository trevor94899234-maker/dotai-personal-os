import type { EvidenceArtifact, Listing } from "./etsyOperations";

export const DECISION_CONTROL_EVIDENCE_KINDS = ["shop-stats", "listing-performance", "traffic-sources"] as const;
export const DECISION_CONTROL_DELIVERY_REVISION = "2026-08-21-human-gate-clarity-revision-3" as const;
export type DecisionControlEvidenceKind = typeof DECISION_CONTROL_EVIDENCE_KINDS[number];
export type EvidenceTruth = "missing" | "invalid" | "confirmed" | "confirmed-zero" | "ocr-unreadable" | "period-mismatch" | "target-mismatch" | "owner-unconfirmed";
export type DecisionBlockerCode = "MISSING_EVIDENCE" | "INVALID_EVIDENCE" | "OCR_UNREADABLE" | "PERIOD_MISMATCH" | "TARGET_MISMATCH" | "OWNER_UNCONFIRMED";
export type DecisionControlBlocker = {
  code: DecisionBlockerCode;
  truth: Exclude<EvidenceTruth, "confirmed" | "confirmed-zero">;
  evidenceKind?: DecisionControlEvidenceKind;
  message: string;
};
export type DecisionControlState = {
  status: "blocked" | "decision-ready";
  selectedListing: { id: string; title: string } | null;
  comparablePeriod: { start: string; end: string };
  truth: Record<DecisionControlEvidenceKind, EvidenceTruth>;
  blockers: DecisionControlBlocker[];
  nextAction: { kind: "report-only"; label: string; detail: string };
};

export const DECISION_CONTROL_EVIDENCE_LABELS: Record<DecisionControlEvidenceKind, string> = {
  "shop-stats": "Shop stats",
  "listing-performance": "Listing performance",
  "traffic-sources": "Traffic sources",
};

export const DECISION_CONTROL_TRUTH_LABELS: Record<EvidenceTruth, string> = {
  missing: "Missing",
  invalid: "Invalid",
  confirmed: "Confirmed",
  "confirmed-zero": "Confirmed zero",
  "ocr-unreadable": "OCR-unreadable",
  "period-mismatch": "Period mismatch",
  "target-mismatch": "Target mismatch",
  "owner-unconfirmed": "Owner-unconfirmed",
};

export const DECISION_CONTROL_TRUTH_DESCRIPTIONS: Record<EvidenceTruth, string> = {
  missing: "no usable record supplied",
  invalid: "a supplied value is unusable",
  confirmed: "usable evidence",
  "confirmed-zero": "valid 0, not missing",
  "ocr-unreadable": "visual review only, not calculation evidence",
  "period-mismatch": "record is outside the selected dates",
  "target-mismatch": "record is for another listing or shop",
  "owner-unconfirmed": "local evidence still needs owner confirmation",
};

export const DECISION_CONTROL_TRUTH_KEY = "Missing = no usable record; Invalid = a supplied value is unusable; Confirmed zero = valid 0, not missing; Confirmed = usable evidence; OCR-unreadable = visual review only, not calculation evidence; Owner-unconfirmed = local review still needed; Target mismatch = another listing/shop; Period mismatch = outside the selected dates.";

export function formatDecisionTruth(truth: EvidenceTruth) {
  return `${DECISION_CONTROL_TRUTH_LABELS[truth]} — ${DECISION_CONTROL_TRUTH_DESCRIPTIONS[truth]}`;
}

export function decisionControlStatusSummary(control: Pick<DecisionControlState, "status" | "blockers">) {
  if (control.status === "decision-ready") return "Ready because all three local evidence lanes match the selected listing/shop scope and comparable period; confirmed zero remains valid evidence.";
  const reasons = [...new Set(control.blockers.map((blocker) => blocker.message))];
  return reasons.length
    ? `Blocked because ${reasons.join("; ")}.`
    : "Blocked because the local evidence gate is not satisfied.";
}

type BlockableTruth = Exclude<EvidenceTruth, "confirmed" | "confirmed-zero">;

const blockerFor: Record<BlockableTruth, { code: DecisionBlockerCode; message: string }> = {
  missing: { code: "MISSING_EVIDENCE", message: "Add the missing owner-provided evidence" },
  invalid: { code: "INVALID_EVIDENCE", message: "Replace or correct the invalid evidence" },
  "ocr-unreadable": { code: "OCR_UNREADABLE", message: "Review the screenshot visually before confirmation" },
  "period-mismatch": { code: "PERIOD_MISMATCH", message: "Provide evidence for the selected comparable period" },
  "target-mismatch": { code: "TARGET_MISMATCH", message: "Provide evidence for the selected listing or shop target" },
  "owner-unconfirmed": { code: "OWNER_UNCONFIRMED", message: "Review and confirm the local evidence" },
};

function isBlockable(truth: EvidenceTruth): truth is BlockableTruth {
  return truth !== "confirmed" && truth !== "confirmed-zero";
}

function matchesTarget(kind: DecisionControlEvidenceKind, artifact: EvidenceArtifact, listingId: string | undefined) {
  if (kind === "shop-stats") return artifact.targetType === "shop" && artifact.targetId === "shop";
  if (!listingId) return false;
  if (kind === "listing-performance") return artifact.targetType === "listing" && artifact.targetId === listingId;
  return (artifact.targetType === "shop" && artifact.targetId === "shop") || (artifact.targetType === "listing" && artifact.targetId === listingId);
}

function newestFirst(a: EvidenceArtifact, b: EvidenceArtifact) {
  return `${b.uploadedAt}\u0000${b.id}`.localeCompare(`${a.uploadedAt}\u0000${a.id}`);
}

function truthFor(kind: DecisionControlEvidenceKind, artifacts: EvidenceArtifact[], listingId: string | undefined, period: { start: string; end: string }): EvidenceTruth {
  const candidates = artifacts.filter((artifact) => artifact.kind === kind);
  if (!candidates.length) return "missing";

  const targetCandidates = candidates.filter((artifact) => matchesTarget(kind, artifact, listingId));
  if (!targetCandidates.length) return "target-mismatch";
  if (!period.start || !period.end || period.start > period.end) return "period-mismatch";

  const datedCandidates = targetCandidates.filter((artifact) => artifact.periodStart === period.start && artifact.periodEnd === period.end);
  if (!datedCandidates.length) return "period-mismatch";

  const artifact = [...datedCandidates].sort(newestFirst)[0];
  if (artifact.ocrStatus === "unreadable") return "ocr-unreadable";
  if (!artifact.ownerConfirmed) return "owner-unconfirmed";
  if (!artifact.metrics.length) return "missing";
  if (artifact.metrics.some((metric) => metric.status === "invalid")) return "invalid";
  if (artifact.metrics.some((metric) => metric.status === "missing")) return "missing";
  return artifact.metrics.every((metric) => metric.status === "confirmed-zero") ? "confirmed-zero" : "confirmed";
}

function addBlocker(blockers: DecisionControlBlocker[], truth: BlockableTruth, evidenceKind?: DecisionControlEvidenceKind) {
  const { code, message } = blockerFor[truth];
  if (!blockers.some((blocker) => blocker.code === code)) blockers.push({ code, truth, evidenceKind, message });
}

export function buildDecisionControlState(artifacts: EvidenceArtifact[], listing: Listing | undefined, period: { start: string; end: string }): DecisionControlState {
  const selectedListing = listing ? { id: listing.id, title: listing.title } : null;
  const relevant = artifacts.filter((artifact) => DECISION_CONTROL_EVIDENCE_KINDS.includes(artifact.kind as DecisionControlEvidenceKind));
  const truth = Object.fromEntries(DECISION_CONTROL_EVIDENCE_KINDS.map((kind) => [kind, truthFor(kind, relevant, listing?.id, period)])) as Record<DecisionControlEvidenceKind, EvidenceTruth>;
  const blockers: DecisionControlBlocker[] = [];

  for (const kind of DECISION_CONTROL_EVIDENCE_KINDS) {
    const laneTruth = truth[kind];
    if (isBlockable(laneTruth)) addBlocker(blockers, laneTruth, kind);
  }
  if (!selectedListing) addBlocker(blockers, "target-mismatch");
  if (!period.start || !period.end || period.start > period.end) addBlocker(blockers, "period-mismatch");

  const status = blockers.length ? "blocked" : "decision-ready";
  const nextAction = blockers.length
    ? { kind: "report-only" as const, label: "Collect and confirm evidence", detail: blockers[0].message }
    : { kind: "report-only" as const, label: "Prepare the read-only decision report", detail: "Review the evidence-backed result locally; no Etsy change is performed." };
  return { status, selectedListing, comparablePeriod: period, truth, blockers, nextAction };
}
