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

export interface EtsyDecision {
  version: number;
  mode: "historical-demo" | "live-owner-export";
  title: string;
  generatedAt: string;
  evidenceAsOf: string;
  source: {
    listingExport: string;
    listingRows: number;
    keywordExport: string | null;
    keywordRows: number;
    authority: string;
    limitations: string[];
  };
  metrics: {
    listings: number;
    totalViews: number;
    zeroViewListings: number;
    zeroFavoriteListings: number;
    duplicateTitleGroups: number;
    duplicateListings: number;
  };
  focus: {
    label: string;
    title: string;
    listingIds: string[];
    views: number;
    favorites: number;
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
