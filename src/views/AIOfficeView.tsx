import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Bot, CheckCircle2, Sparkles, Users } from "lucide-react";
import { fetchJson } from "../lib/fetchJson";
import type { Agent, AgentStatus } from "../lib/types";

const STATUS_COLOR: Record<AgentStatus, string> = {
  idle: "bg-[#F0E5D9] text-muted",
  running: "bg-brand text-white",
  done: "bg-[#E8F0E6] text-sage",
  error: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "idle",
  running: "running…",
  done: "done",
  error: "error",
};

const DOT_COLOR: Record<AgentStatus, string> = {
  idle: "bg-sand",
  running: "bg-brand animate-pulse",
  done: "bg-sage",
  error: "bg-red-500",
};

const EXEC_IDS = [
  "etsy-growth-radar",
  "content-creator",
  "meeting-organizer",
  "client-crm",
  "project-manager",
  "excel-analyst",
  "trend-research",
];
const SUPPORT_IDS = ["doc-processor", "finance", "data-consolidation", "whatsapp-secretary"];

const ETSY_POD_IDS = [
  "data-consolidation",
  "etsy-growth-radar",
  "excel-analyst",
  "trend-research",
  "content-creator",
  "project-manager",
];

const USE_CASES: Record<string, string> = {
  "etsy-growth-radar": "去重、排序證據、選一個 focus、寫 decision output",
  "content-creator": "在 positioning approved 後起草 listing／social copy",
  "meeting-organizer": "把導師 feedback 分成決定、行動和未解問題",
  "client-crm": "日後整理 buyer follow-up；不可把顧客私隱放入公開資料",
  "project-manager": "控制 WIP、owner gate、checkpoint 和下一個安全動作",
  "excel-analyst": "比較日期範圍、listing cohorts、baseline 和 test result",
  "trend-research": "分析 owner 匯出的 keyword／market evidence",
  "doc-processor": "把 reports、briefs 與 SOP 整成可交付文件",
  finance: "整理成本、margin 與 revenue；只用已確認數據",
  "data-consolidation": "合併 Etsy Stats、eRank、EverBee exports 並標示來源",
  "whatsapp-secretary": "整理訊息 follow-up；不自動代發",
};

function lastRunText(lastRun: string | null): string {
  if (!lastRun) return "未開工";
  return `上次跑：${lastRun.replace("T", " ")}`;
}

function OrgChip({ agent }: { agent: Agent }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2">
      <span className="leading-none">{agent.emoji}</span>
      <span className="truncate text-xs font-medium">{agent.name}</span>
      <span
        className={`ml-auto inline-block h-2 w-2 shrink-0 rounded-full ${DOT_COLOR[agent.status]}`}
        title={agent.status}
      />
    </div>
  );
}

function OrgChart({ agents }: { agents: Agent[] }) {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const exec = EXEC_IDS.map((id) => byId.get(id)).filter((agent): agent is Agent => !!agent);
  const support = SUPPORT_IDS.map((id) => byId.get(id)).filter(
    (agent): agent is Agent => !!agent,
  );

  return (
    <section className="rounded-[26px] border border-line bg-panel p-5 shadow-card sm:p-6">
      <div className="flex items-center gap-2 text-copper">
        <Users size={18} />
        <span className="text-xs font-semibold uppercase tracking-[0.16em]">Company map</span>
      </div>
      <h2 className="mt-2 font-display text-2xl font-bold">AI 員工架構圖</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
        人類 CEO 定方向，AI 員工處理機械工作；每次執行都要留下狀態、output 和下一個 handoff。
      </p>
      <div className="mt-6 flex flex-col items-center">
        <div className="rounded-2xl border border-copper/25 bg-[#F8EDE4] px-6 py-3 text-center">
          <div className="text-sm font-semibold">👤 Trevor · Human CEO</div>
          <div className="text-xs text-muted">策略、風險、批准、live action</div>
        </div>
        <div className="h-5 w-px bg-line" />
        <div className="rounded-2xl border border-line bg-[#F8F3ED] px-6 py-3 text-center">
          <div className="text-sm font-semibold">🪽 Codex · Control layer</div>
          <div className="text-xs text-muted">理解目標、派工、驗證、回報</div>
        </div>
        <div className="h-5 w-px bg-line" />
        <div className="grid w-full gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-[#FBF7F2] p-4">
            <div className="mb-3 text-xs font-semibold text-copper">
              執行層 · {exec.length} 條產出線
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {exec.map((agent) => (
                <OrgChip key={agent.id} agent={agent} />
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-[#FBF7F2] p-4">
            <div className="mb-3 text-xs font-semibold text-copper">
              支援層 · {support.length} 個專業支援
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {support.map((agent) => (
                <OrgChip key={agent.id} agent={agent} />
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

  const etsyPod = useMemo(() => {
    if (!agents) return [];
    const byId = new Map(agents.map((agent) => [agent.id, agent]));
    return ETSY_POD_IDS.map((id) => byId.get(id)).filter(
      (agent): agent is Agent => !!agent,
    );
  }, [agents]);

  if (agents === null) {
    return <div className="text-sm text-muted">Loading…</div>;
  }

  if (agents.length === 0) {
    return (
      <div className="rounded-[26px] border border-line bg-panel p-8 shadow-card">
        <h1 className="font-display text-3xl font-bold">AI Office</h1>
        <p className="mt-3 text-sm text-muted">
          冇員工名冊。完成一次 vault sync 後會補回 roster。
        </p>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const ranToday = agents.filter((agent) => agent.lastRun?.startsWith(today)).length;
  const totalOutput = agents.reduce((sum, agent) => sum + (agent.outputCount || 0), 0);
  const doneCount = agents.filter((agent) => agent.status === "done").length;

  return (
    <div className="space-y-6 lg:space-y-8">
      <section className="relative overflow-hidden rounded-[30px] border border-copper/30 bg-gradient-to-br from-[#2A1711] via-[#4B2A20] to-[#713B26] p-6 text-cream shadow-brand sm:p-8">
        <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full border border-cream/10 bg-brand/10" />
        <div className="relative grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-[#F3B287]">
              <Bot size={18} />
              <span className="text-xs font-semibold uppercase tracking-[0.17em]">
                MyGiftStyle AI Office
              </span>
            </div>
            <h1 className="mt-3 font-display text-4xl font-bold text-white sm:text-5xl">
              Skills become useful
              <span className="block text-[#F3B287]">when they share one mission.</span>
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-cream/65">
              員工不是十個獨立按鈕。Control layer 先把一個 business question 拆成 evidence、
              diagnosis、draft、QA 和 owner gate，再由不同 Skill 接力。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              ["Ran today", `${ranToday}/${agents.length}`],
              ["Done", doneCount],
              ["Outputs", totalOutput],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-cream/15 bg-black/15 p-4">
                <div className="text-[10px] uppercase tracking-[0.12em] text-cream/50">
                  {label}
                </div>
                <div className="mt-2 font-display text-2xl font-bold text-white">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[26px] border border-brand/20 bg-[#FFF4EC] p-5 shadow-card sm:p-6">
        <div className="flex items-center gap-2 text-brand">
          <Sparkles size={18} />
          <span className="text-xs font-semibold uppercase tracking-[0.16em]">
            Etsy mission pod
          </span>
        </div>
        <h2 className="mt-2 font-display text-2xl font-bold">
          Decision OS 最值得先試的六位員工
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          一個完整 run 應由資料合併開始，經過 Growth Radar、分析和研究，才到內容草稿及專案控制。
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {etsyPod.map((agent, index) => (
            <article key={agent.id} className="rounded-2xl border border-line bg-panel p-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">{agent.emoji}</span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{agent.name}</div>
                  <code className="text-[10px] text-muted">{agent.id}</code>
                </div>
                <span className={`ml-auto h-2 w-2 rounded-full ${DOT_COLOR[agent.status]}`} />
              </div>
              <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-copper">
                Step {index + 1}
              </div>
              <p className="mt-1 text-xs leading-5 text-muted">{USE_CASES[agent.id]}</p>
              {index < etsyPod.length - 1 && (
                <div className="mt-3 flex items-center gap-1 text-[10px] font-semibold text-brand">
                  handoff <ArrowRight size={12} />
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <OrgChart agents={agents} />

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-copper">
              <CheckCircle2 size={17} />
              <span className="text-xs font-semibold uppercase tracking-[0.16em]">Roster</span>
            </div>
            <h2 className="mt-1 font-display text-2xl font-bold">全部員工</h2>
          </div>
          <div className="text-xs text-muted">{agents.length} skills registered</div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <li
              key={agent.id}
              className="flex flex-col gap-3 rounded-[22px] border border-line bg-panel p-4 shadow-card"
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl leading-none">{agent.emoji}</span>
                <div className="min-w-0">
                  <div className="truncate font-semibold">{agent.name}</div>
                  <div className="truncate text-xs text-muted">
                    <code>{agent.id}</code>
                  </div>
                </div>
                <span
                  className={`ml-auto rounded-lg px-2 py-1 text-[10px] font-semibold ${STATUS_COLOR[agent.status]}`}
                >
                  {STATUS_LABEL[agent.status]}
                </span>
              </div>
              <p className="min-h-10 text-xs leading-5 text-muted">
                {USE_CASES[agent.id] ?? "按 Skill contract 完成指定工作並留下 output。"}
              </p>
              <div className="flex items-center border-t border-line pt-3 text-[11px] text-muted">
                <span>{lastRunText(agent.lastRun)}</span>
                <span className="ml-auto">output ×{agent.outputCount || 0}</span>
              </div>
              {agent.lastOutput && (
                <code className="break-all rounded-lg bg-[#F8F3ED] px-2 py-1.5 text-[10px] text-ink">
                  {agent.lastOutput}
                </code>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
