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
}
