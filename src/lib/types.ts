export type TaskStatus = "todo" | "doing" | "done";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
  source?: "frontmatter" | "checkbox";
  sourceFile?: string;
}

export interface TodayPlan {
  date: string;
  taskIds: string[];
  note?: string;
}

export interface DailyNote {
  date: string;
  content: string;
}

export interface VaultHealth {
  inboxCount: number;
  orphanCount: number;
  recentAtomNotes: Array<{ title: string; date: string; path: string }>;
  lastSyncedAt: string;
}

export type AgentStatus = "idle" | "running" | "done" | "error";

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  status: AgentStatus;
  lastRun: string | null;
  outputCount: number;
  lastOutput?: string | null;
}

export type OwnerGateChoice = "pending" | "approve-draft" | "need-evidence";

export interface EvidenceFile {
  id: string;
  label: string;
  fileName: string | null;
  received: boolean;
  authority: "first-party" | "third-party";
  validation: "valid" | "invalid" | "missing" | "intake-only";
  missingHeaders: string[];
  usedInDecision: boolean;
}

export interface EvidenceInbox {
  version: number;
  coverageStart: string | null;
  coverageEnd: string;
  evidenceAsOf: string;
  completenessPct: number;
  requiredEvidenceIds: string[];
  missingTypes: string[];
  invalidFiles: string[];
  files: EvidenceFile[];
}

export interface TrustLedgerItem {
  id: string;
  label: string;
  value: number | null;
  authority: "first-party" | "third-party" | "derived-third-party" | "missing";
  quality: "verified" | "partial" | "invalid" | "missing" | "estimated" | "diagnostic";
  freshness: "fresh" | "stale" | "unknown";
  ageDays: number | null;
  source: string;
  note: string;
}

export interface EtsyDecision {
  version: number;
  mode: "historical-demo" | "owner-export";
  title: string;
  generatedAt: string;
  evidenceAsOf: string;
  evidenceInbox: EvidenceInbox;
  trustLedger: TrustLedgerItem[];
  source: {
    listingExport: string;
    listingRows: number;
    keywordExport: string | null;
    keywordRows: number;
    etsyStatsExport: string | null;
    etsyStatsRows: number;
    authority: string;
    limitations: string[];
  };
  metrics: {
    listings: number;
    totalViews: number | null;
    totalFavorites: number | null;
    zeroViewListings: number;
    zeroFavoriteListings: number;
    orders: number | null;
    revenue: number | null;
    duplicateTitleGroups: number;
    duplicateListings: number;
  };
  focus: {
    label: string;
    title: string;
    listingIds: string[];
    views: number | null;
    favorites: number | null;
    reason: string;
  };
  targets: {
    revenueIntent: { title: string; detail: string };
    evidence: { title: string; detail: string };
    production: { title: string; detail: string };
  };
  recommendation: {
    decision: string;
    confidence: "High" | "Medium" | "Low";
    rationale: string[];
    missingInputs: string[];
    liveActionAllowed: boolean;
  };
  ownerGate: {
    status: "pending";
    allowedActions: string[];
    note: string;
  };
  reportPath: string;
}
