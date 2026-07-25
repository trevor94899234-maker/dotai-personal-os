import { useEffect, useState } from "react";
import { fetchJson } from "../lib/fetchJson";
import type { Agent, AgentStatus } from "../lib/types";

const STATUS_COLOR: Record<AgentStatus, string> = {
  idle: "bg-line text-muted",
  running: "bg-brand text-white",
  done: "bg-emerald-100 text-emerald-700",
  error: "bg-red-100 text-red-700"
};

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "idle",
  running: "returning…",
  done: "done",
  error: "error"
};

const DOT_COLOR: Record<AgentStatus, string> = {
  idle: "bg-slate-300",
  running: "bg-brand",
  done: "bg-emerald-500",
  error: "bg-red-500"
};

// 架構圖分層（同 sample-vault AI-Office roster 一一對應）
const EXEC_IDS = ["content-creator", "meeting-organizer", "client-crm", "project-manager", "excel-analyst", "trend-research"];
const SUPPORT_IDS = ["doc-processor", "finance", "data-consolidation", "whatsapp-secretary"];

function lastRunText(lastRun: string | null): string {
  if (!lastRun) return "未開工";
  return `上次跑：${lastRun.replace("T", " ")}`;
}

function OrgChip({ agent }: { agent: Agent }) {
  return (
    <div className="flex items-center gap-2 bg-white border border-line rounded-lg px-2.5 py-1.5">
      <span className="leading-none">{agent.emoji}</span>
      <span className="text-xs font-medium truncate">{agent.name}</span>
      <span
        className={`ml-auto inline-block w-2 h-2 rounded-full shrink-0 ${DOT_COLOR[agent.status]}`}
        title={agent.status}
      />
    </div>
  );
}

function OrgChart({ agents }: { agents: Agent[] }) {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const exec = EXEC_IDS.map((id) => byId.get(id)).filter((a): a is Agent => !!a);
  const support = SUPPORT_IDS.map((id) => byId.get(id)).filter((a): a is Agent => !!a);

  return (
    <section className="mb-10">
      <h2 className="font-semibold mb-1">AI 員工架構圖</h2>
      <p className="text-muted text-xs mb-4">
        人類 CEO 定方向，Hermes 每日調度，執行層同支援層各司其職。狀態燈跟{" "}
        <code>agents.json</code> 實時著。
      </p>
      <div className="flex flex-col items-center">
        <div className="bg-panel border border-dashed border-line rounded-xl px-5 py-2.5 text-center">
          <div className="text-sm font-semibold">👤 CEO</div>
          <div className="text-xs text-muted">你 · 人類決策</div>
        </div>
        <div className="w-px h-4 bg-line" />
        <div className="bg-panel border border-line rounded-xl px-5 py-2.5 text-center">
          <div className="text-sm font-semibold">🪽 Hermes</div>
          <div className="text-xs text-muted">每日入口 · 統籌全團隊</div>
        </div>
        <div className="w-px h-4 bg-line" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full">
          <div className="bg-panel border border-line rounded-xl p-4">
            <div className="text-xs text-muted font-medium mb-2">執行層 · 六條產出線</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {exec.map((a) => (
                <OrgChip key={a.id} agent={a} />
              ))}
            </div>
          </div>
          <div className="bg-panel border border-line rounded-xl p-4">
            <div className="text-xs text-muted font-medium mb-2">支援層 · 四專業支援</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {support.map((a) => (
                <OrgChip key={a.id} agent={a} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function AIOfficeView() {
  const [agents, setAgents] = useState<Agent[] | null>(null);

  useEffect(() => {
    fetchJson<Agent[]>("data/agents.json", []).then(setAgents);
  }, []);

  if (agents === null) {
    return <div className="text-muted text-sm">Loading…</div>;
  }

  if (agents.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">AI Office</h1>
        <p className="text-muted text-sm">
          冇員工名冊。跑 <code className="bg-line px-1 rounded">npm run sync:vault</code> 會補返
          10-row roster（<code>public/data/agents.json</code>）。
        </p>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const ranToday = agents.filter((a) => a.lastRun?.startsWith(today)).length;
  const totalOutput = agents.reduce((sum, a) => sum + (a.outputCount || 0), 0);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">AI Office</h1>
      <p className="text-muted text-sm mb-6">
        今日 {ranToday}/{agents.length} 位員工跑過 · 總 output {totalOutput} · skill 收尾跑{" "}
        <code className="bg-line px-1 rounded">node scripts/log-agent.mjs &lt;id&gt; done &lt;n&gt;</code>{" "}
        就著燈
      </p>

      <OrgChart agents={agents} />

      <h2 className="font-semibold mb-3">全部員工</h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {agents.map((a) => (
          <li key={a.id} className="bg-panel border border-line rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl leading-none">{a.emoji}</span>
              <div className="min-w-0">
                <div className="font-semibold truncate">{a.name}</div>
                <div className="text-xs text-muted truncate">
                  <code>{a.id}</code>
                </div>
              </div>
              <span
                className={`ml-auto text-xs px-2 py-0.5 rounded-md font-medium ${STATUS_COLOR[a.status]}`}
              >
                {STATUS_LABEL[a.status]}
              </span>
            </div>
            <div className="flex items-center text-xs text-muted">
              <span>{lastRunText(a.lastRun)}</span>
              <span className="ml-auto">output ×{a.outputCount || 0}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
