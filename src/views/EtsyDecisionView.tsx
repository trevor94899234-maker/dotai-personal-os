import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  CheckCircle2,
  Clipboard,
  ClipboardCheck,
  Database,
  FileSearch,
  LockKeyhole,
  PackageCheck,
  Radio,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Workflow,
} from "lucide-react";
import { fetchJson } from "../lib/fetchJson";
import type { Agent, EtsyDecision, OwnerGateChoice } from "../lib/types";
import type { OperationsTab } from "../lib/etsyOperations";
import EtsyOperationsHub from "../components/EtsyOperationsHub";

const TARGETS = [
  {
    key: "revenueIntent" as const,
    label: "Revenue / Intent",
    icon: TrendingUp,
    tone: "border-sage/25 bg-[#EEF3EC]",
    iconTone: "text-sage",
    number: "01",
  },
  {
    key: "evidence" as const,
    label: "Evidence",
    icon: Database,
    tone: "border-copper/25 bg-[#F8EDE4]",
    iconTone: "text-copper",
    number: "02",
  },
  {
    key: "production" as const,
    label: "Production",
    icon: PackageCheck,
    tone: "border-brand/20 bg-[#FFF1E8]",
    iconTone: "text-brand",
    number: "03",
  },
];

const CREW_ROLES: Record<string, { label: string; task: string }> = {
  "data-consolidation": {
    label: "Evidence intake",
    task: "合併 Etsy Stats、eRank 與 EverBee owner exports",
  },
  "etsy-growth-radar": {
    label: "Decision engine",
    task: "去重、排序訊號、指出證據缺口",
  },
  "excel-analyst": {
    label: "Measurement",
    task: "比較日期區間、listing cohorts 與 test baseline",
  },
  "trend-research": {
    label: "Market context",
    task: "用已匯出的 keyword evidence 補充市場背景",
  },
  "content-creator": {
    label: "Draft studio",
    task: "依 approved positioning 起草 title、copy 與 social brief",
  },
  "project-manager": {
    label: "Control tower",
    task: "維護 WIP、owner gate、期限及下一個 checkpoint",
  },
};

const CREW_ORDER = [
  "data-consolidation",
  "etsy-growth-radar",
  "excel-analyst",
  "trend-research",
  "content-creator",
  "project-manager",
];

function gateLabel(choice: OwnerGateChoice) {
  if (choice === "approve-draft") return "Draft approved locally";
  if (choice === "need-evidence") return "More evidence requested";
  return "Pending owner decision";
}

function statusDot(status: Agent["status"]) {
  if (status === "done") return "bg-sage";
  if (status === "running") return "bg-brand animate-pulse";
  if (status === "error") return "bg-rose";
  return "bg-sand";
}

type PipelineState = "complete" | "active" | "waiting" | "locked";

const PIPELINE_TONE: Record<PipelineState, string> = {
  complete: "border-sage/25 bg-[#EEF3EC] text-sage",
  active: "border-brand/30 bg-[#FFF1E8] text-brand",
  waiting: "border-copper/25 bg-[#F8EDE4] text-copper",
  locked: "border-line bg-[#F4ECE4] text-muted",
};

function validationTone(validation: EtsyDecision["evidenceInbox"]["files"][number]["validation"]) {
  if (validation === "valid") return "border-sage/25 bg-[#E8F0E6] text-sage";
  if (validation === "invalid") return "border-rose/25 bg-[#FFF0EC] text-rose";
  if (validation === "intake-only") return "border-copper/25 bg-[#F8EDE4] text-copper";
  return "border-line bg-[#F4ECE4] text-muted";
}

function trustTone(quality: EtsyDecision["trustLedger"][number]["quality"]) {
  if (quality === "verified") return "border-sage/25 bg-[#E8F0E6] text-sage";
  if (quality === "invalid" || quality === "missing") {
    return "border-rose/25 bg-[#FFF0EC] text-rose";
  }
  return "border-copper/25 bg-[#F8EDE4] text-copper";
}

export default function EtsyDecisionView({ onOpenOffice, presentationOnly = false }: { onOpenOffice?: () => void; presentationOnly?: boolean }) {
  const [dashboardSurface, setDashboardSurface] = useState<"workspace" | "history">("workspace");
  const [workspaceStartTab, setWorkspaceStartTab] = useState<OperationsTab>("today");
  const [decision, setDecision] = useState<EtsyDecision | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [choice, setChoice] = useState<OwnerGateChoice>("pending");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    async function load() {
      const [live, roster] = await Promise.all([
        fetchJson<EtsyDecision | null>("data/etsy-decision.json", null),
        fetchJson<Agent[]>("data/agents.json", []),
      ]);
      const next =
        live?.version === 2 && live.evidenceInbox && live.trustLedger
          ? live
          : await fetchJson<EtsyDecision | null>("demo/etsy-decision-sample.json", null);
      setDecision(next);
      setAgents(roster);
      if (next) {
        const saved = localStorage.getItem(`etsy-owner-gate:${next.evidenceAsOf}`);
        if (saved === "approve-draft" || saved === "need-evidence") setChoice(saved);
      }
    }
    load();
  }, []);

  const evidenceAge = useMemo(() => {
    if (!decision) return null;
    const then = new Date(`${decision.evidenceAsOf}T00:00:00Z`).getTime();
    return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
  }, [decision]);

  const crew = useMemo(() => {
    const byId = new Map(agents.map((agent) => [agent.id, agent]));
    return CREW_ORDER.map((id) => byId.get(id)).filter((agent): agent is Agent => !!agent);
  }, [agents]);

  const runBrief = useMemo(() => {
    if (!decision) return "";
    return [
      "使用 MyGiftStyle Etsy Growth Radar 處理下一輪 Decision OS。",
      `目前 focus：${decision.focus.title}`,
      `證據日期：${decision.evidenceAsOf}`,
      "只分析我提供的 Etsy Stats／eRank／EverBee exports 或 screenshots。",
      "先核對來源日期、第一方/第三方權重、active test protection 及重複 listing。",
      "輸出：proposed decision、evidence、missing inputs、confidence、下一個安全 checkpoint。",
      "不可登入、scrape、批量操作、改 listing 或 publish；所有 live action 等 owner 明確批准。",
    ].join("\n");
  }, [decision]);

  const pipeline = useMemo(() => {
    const gateState: PipelineState = choice === "pending" ? "waiting" : "complete";
    return [
      {
        label: "Evidence",
        detail: "Historical exports loaded",
        state: "complete" as PipelineState,
      },
      {
        label: "Diagnose",
        detail: "Duplicate risk ranked",
        state: "complete" as PipelineState,
      },
      {
        label: "Draft",
        detail: "Positioning brief only",
        state: "active" as PipelineState,
      },
      {
        label: "Owner Gate",
        detail: gateLabel(choice),
        state: gateState,
      },
      {
        label: "Live Etsy",
        detail: "Owner action only",
        state: "locked" as PipelineState,
      },
      {
        label: "Learn",
        detail: "Wait for new evidence",
        state: "waiting" as PipelineState,
      },
    ];
  }, [choice]);

  async function copyRunBrief() {
    try {
      await navigator.clipboard.writeText(runBrief);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2200);
    } catch {
      setCopyState("failed");
    }
  }

  if (!decision) {
    return (
      <div className="rounded-[28px] border border-dashed border-line bg-panel p-10 text-center shadow-card">
        <h1 className="font-display text-2xl font-bold">Etsy Decision OS</h1>
        <p className="mt-2 text-sm text-muted">
          尚未有 Growth Radar output。執行 Etsy Skill 後再重新整理。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 lg:space-y-8">
      <section className="rounded-[26px] border border-line bg-panel p-4 shadow-card sm:p-5" aria-label="Etsy Dashboard home">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-[0.16em] text-copper">MyGiftStyle · 店主控制</p>
            <h1 className="mt-1 font-display text-2xl font-bold text-ink sm:text-3xl">由今日一個清楚決定開始</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              {presentationOnly
                ? "明日簡報只展示由證據到店主批准嘅五幕故事，將工作流程講清楚，唔用未完成嘅功能搶走主線。"
                : "呢個係可以日常使用嘅 MyGiftStyle 工作區：由下一步開始，接住處理證據、決策、Listing Brief 同店主批准。"}
            </p>
          </div>
          <span className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-copper/25 bg-[#F8EDE4] px-4 py-2.5 text-xs font-bold text-copper">
            {presentationOnly ? "明日簡報版 · 五幕故事" : "實際工作區 · 可以繼續開發"}
          </span>
        </div>
      </section>

      {dashboardSurface === "workspace" ? (
        <EtsyOperationsHub initialTab={workspaceStartTab} presentationOnly={presentationOnly} />
      ) : (
        <>
      <section className="relative overflow-hidden rounded-[30px] border border-copper/30 bg-gradient-to-br from-[#2A1711] via-[#4B2A20] to-[#713B26] p-6 text-cream shadow-brand sm:p-8 lg:p-10">
        <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full border border-cream/10 bg-brand/10" />
        <div className="absolute -bottom-28 right-24 h-64 w-64 rounded-full border border-cream/10 bg-copper/10" />
        <div className="relative grid gap-8 xl:grid-cols-[1.5fr_0.8fr] xl:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-cream/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.17em]">
                MyGiftStyle · Decision Control Room
              </span>
              <span className="rounded-full bg-brand px-3 py-1 text-[11px] font-semibold text-white">
                {decision.mode === "historical-demo"
                  ? "Historical demo · not live"
                  : "Owner export · local read-only"}
              </span>
            </div>
            <h2 className="mt-5 max-w-4xl font-display text-4xl font-bold leading-[1.05] text-white sm:text-5xl lg:text-6xl">
              One safe decision,
              <span className="block text-[#F3B287]">before another Etsy change.</span>
            </h2>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-cream/70 sm:text-base">
              將 Etsy、eRank、EverBee 與營運紀錄分層整理。Codex 與 AI Office 做機械檢查、
              建議和 QA；你保留商業判斷、帳戶權限及所有 live action。
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={copyRunBrief}
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-black/15 transition hover:-translate-y-0.5 hover:bg-[#D94F0D]"
              >
                {copyState === "copied" ? <ClipboardCheck size={17} /> : <Clipboard size={17} />}
                {copyState === "copied"
                  ? "已複製 Codex brief"
                  : copyState === "failed"
                    ? "複製失敗，請再試"
                    : "複製下一輪 Codex brief"}
              </button>
              {onOpenOffice && (
                <button
                  type="button"
                  onClick={onOpenOffice}
                  className="inline-flex items-center gap-2 rounded-xl border border-cream/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  <Users size={17} />
                  查看 AI Office 分工
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-2xl border border-cream/15 bg-black/15 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-cream/55">
                <LockKeyhole size={14} />
                Live action
              </div>
              <div className="mt-2 text-xl font-bold text-white">Locked</div>
              <div className="mt-1 text-xs text-cream/55">Owner publishes manually</div>
            </div>
            <div className="rounded-2xl border border-cream/15 bg-black/15 p-4 backdrop-blur-sm">
              <div className="text-xs uppercase tracking-[0.14em] text-cream/55">Evidence</div>
              <div className="mt-2 text-xl font-bold text-white">{decision.evidenceAsOf}</div>
              <div className="mt-1 text-xs text-[#F3B287]">{evidenceAge} days old</div>
            </div>
            <div className="rounded-2xl border border-cream/15 bg-black/15 p-4 backdrop-blur-sm">
              <div className="text-xs uppercase tracking-[0.14em] text-cream/55">
                First-party gaps
              </div>
              <div className="mt-2 text-xl font-bold text-white">
                {decision.recommendation.missingInputs.length}
              </div>
              <div className="mt-1 text-xs text-cream/55">Must resolve before live work</div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-line bg-panel p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-brand">
              <Workflow size={18} />
              <span className="text-xs font-semibold uppercase tracking-[0.16em]">
                Decision pipeline
              </span>
            </div>
            <h2 className="mt-2 font-display text-2xl font-bold text-ink">
              Evidence → decision → owner action → learning
            </h2>
          </div>
          <div className="text-xs text-muted">OS 記錄狀態；Etsy 不是自動執行端</div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {pipeline.map((stage, index) => (
            <div
              key={stage.label}
              className={`relative rounded-2xl border p-3.5 ${PIPELINE_TONE[stage.state]}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-70">
                  0{index + 1}
                </span>
                {stage.state === "locked" ? (
                  <LockKeyhole size={14} />
                ) : stage.state === "complete" ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <Radio size={14} />
                )}
              </div>
              <div className="mt-4 text-sm font-bold text-ink">{stage.label}</div>
              <div className="mt-1 text-xs leading-5 opacity-80">{stage.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 2xl:grid-cols-[0.9fr_1.1fr]">
        <article className="min-w-0 rounded-[24px] border border-line bg-panel p-5 shadow-card sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-brand">
                <Database size={18} />
                <span className="text-xs font-semibold uppercase tracking-[0.16em]">
                  Evidence Inbox
                </span>
              </div>
              <h2 className="mt-2 font-display text-2xl font-bold">Owner-provided evidence only</h2>
            </div>
            <div className="rounded-2xl border border-line bg-[#F8F3ED] px-4 py-3 text-right">
              <div className="font-display text-3xl font-bold text-ink">
                {decision.evidenceInbox.completenessPct}%
              </div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted">complete</div>
            </div>
          </div>

          <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#EDE3D8]">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${decision.evidenceInbox.completenessPct}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted">
            <span>
              Coverage: {decision.evidenceInbox.coverageStart ?? "Missing start"} →{" "}
              {decision.evidenceInbox.coverageEnd}
            </span>
            <span>{decision.evidenceInbox.invalidFiles.length} invalid file(s)</span>
          </div>

          <div className="mt-5 rounded-2xl border border-dashed border-brand/35 bg-[#FFF7F0] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-ink">Historical evidence summary</div>
                <div className="mt-1 text-xs leading-5 text-muted">
                  呢度只保留舊 snapshot 作參考。新 evidence 必須經 Current workspace 嘅 review、owner confirmation 同 eligibility gate。
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setWorkspaceStartTab("research"); setDashboardSurface("workspace"); }}
                className="min-h-11 rounded-xl bg-brand px-3.5 py-2 text-xs font-bold text-white transition hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                Open current evidence workflow
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            {decision.evidenceInbox.files.map((file) => (
              <div key={file.id} className="rounded-2xl border border-line bg-[#FBF7F2] p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{file.label}</span>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${validationTone(file.validation)}`}
                  >
                    {file.validation}
                  </span>
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                    {file.authority}
                  </span>
                </div>
                <div className="mt-1 break-all text-xs text-muted">
                  {file.fileName ?? "No file received"}
                </div>
                {file.missingHeaders.length > 0 && (
                  <div className="mt-2 text-xs leading-5 text-rose">
                    Missing headers: {file.missingHeaders.join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </article>

        <article className="min-w-0 rounded-[24px] border border-line bg-panel p-5 shadow-card sm:p-6">
          <div className="flex items-center gap-2 text-copper">
            <ShieldCheck size={18} />
            <span className="text-xs font-semibold uppercase tracking-[0.16em]">
              Trust Ledger
            </span>
          </div>
          <h2 className="mt-2 font-display text-2xl font-bold">每個數字都要交代來源</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Missing 不等於 0；estimated 不等於 Etsy backend fact；超過 30 日會標示 stale。
          </p>

          <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-line sm:block">
            <table className="w-full min-w-[720px] border-collapse text-left text-xs">
              <thead className="bg-[#F8F3ED] text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Metric</th>
                  <th className="px-4 py-3 font-semibold">Value</th>
                  <th className="px-4 py-3 font-semibold">Authority</th>
                  <th className="px-4 py-3 font-semibold">Quality</th>
                  <th className="px-4 py-3 font-semibold">Freshness</th>
                </tr>
              </thead>
              <tbody>
                {decision.trustLedger.map((item) => {
                  const currentFreshness =
                    item.quality === "missing"
                      ? "n/a"
                      : evidenceAge !== null && evidenceAge > 30
                        ? "stale"
                        : item.freshness;
                  return (
                    <tr key={item.id} className="border-t border-line align-top">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-ink">{item.label}</div>
                        <div className="mt-1 max-w-xs leading-5 text-muted">{item.note}</div>
                      </td>
                      <td className="px-4 py-3 font-display text-lg font-bold text-ink">
                        {item.value ?? "Missing"}
                      </td>
                      <td className="px-4 py-3 text-muted">{item.authority}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${trustTone(item.quality)}`}
                        >
                          {item.quality}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                            currentFreshness === "stale"
                              ? "border-rose/25 bg-[#FFF0EC] text-rose"
                              : currentFreshness === "n/a"
                                ? "border-line bg-[#F4ECE4] text-muted"
                                : "border-sage/25 bg-[#E8F0E6] text-sage"
                          }`}
                        >
                          {currentFreshness}
                        </span>
                        <div className="mt-2 max-w-[190px] break-all text-[10px] leading-4 text-muted">
                          {item.source}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-5 grid gap-3 sm:hidden" aria-label="Trust Ledger mobile view">
            {decision.trustLedger.map((item) => {
              const currentFreshness =
                item.quality === "missing"
                  ? "n/a"
                  : evidenceAge !== null && evidenceAge > 30
                    ? "stale"
                    : item.freshness;
              return (
                <article key={item.id} className="min-w-0 rounded-2xl border border-line bg-[#FBF7F2] p-4">
                  <div className="min-w-0">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-ink">{item.label}</h3>
                      <p className="mt-1 break-words text-xs leading-5 text-muted">{item.note}</p>
                    </div>
                    <div className="mt-3 break-words font-display text-xl font-bold text-ink">
                      {item.value ?? "Missing"}
                    </div>
                  </div>
                  <dl className="mt-4 grid min-w-0 gap-3 text-xs">
                    <div className="min-w-0">
                      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Authority</dt>
                      <dd className="mt-1 break-words text-ink">{item.authority}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Quality</dt>
                      <dd className="mt-1">
                        <span className={`inline-flex max-w-full rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${trustTone(item.quality)}`}>
                          {item.quality}
                        </span>
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Freshness</dt>
                      <dd className="mt-1">
                        <span
                          className={`inline-flex max-w-full rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                            currentFreshness === "stale"
                              ? "border-rose/25 bg-[#FFF0EC] text-rose"
                              : currentFreshness === "n/a"
                                ? "border-line bg-[#F4ECE4] text-muted"
                                : "border-sage/25 bg-[#E8F0E6] text-sage"
                          }`}
                        >
                          {currentFreshness}
                        </span>
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 break-all text-[10px] leading-4 text-muted">Source: {item.source}</p>
                </article>
              );
            })}
          </div>
        </article>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Listings scanned", decision.metrics.listings, "whole snapshot"],
          ["Total views", decision.metrics.totalViews, "third-party context"],
          ["Zero favorites", decision.metrics.zeroFavoriteListings, "needs traffic context"],
          ["Duplicate groups", decision.metrics.duplicateTitleGroups, "diagnostic signal"],
        ].map(([label, value, note]) => (
          <div key={label} className="rounded-[22px] border border-line bg-panel p-5 shadow-card">
            <div className="text-xs font-medium text-muted">{label}</div>
            <div className="mt-2 font-display text-3xl font-bold text-ink">
              {value ?? "Missing"}
            </div>
            <div className="mt-1 text-[11px] text-copper">{note}</div>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 size={18} className="text-brand" />
          <h2 className="font-display text-2xl font-bold">今日三個 Targets</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {TARGETS.map(({ key, label, icon: Icon, tone, iconTone, number }) => (
            <article key={key} className={`rounded-[24px] border p-5 shadow-card ${tone}`}>
              <div className="flex items-start justify-between gap-3">
                <div className={`flex items-center gap-2 ${iconTone}`}>
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/70">
                    <Icon size={18} />
                  </span>
                  <span className="text-sm font-semibold">{label}</span>
                </div>
                <span className="font-display text-2xl font-bold text-ink/15">{number}</span>
              </div>
              <h3 className="mt-5 text-lg font-bold text-ink">{decision.targets[key].title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{decision.targets[key].detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[24px] border border-rose/25 bg-[#FFF8F3] p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-rose">
              <AlertTriangle size={18} />
              <span className="text-sm font-semibold">{decision.focus.label}</span>
            </div>
            <h2 className="mt-2 max-w-5xl font-display text-xl font-bold leading-8 text-ink sm:text-2xl">
              {decision.focus.title}
            </h2>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-muted">{decision.focus.reason}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {decision.focus.listingIds.map((id) => (
                <code key={id} className="rounded-lg border border-line bg-white px-2.5 py-1.5">
                  Listing {id}
                </code>
              ))}
            </div>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-3">
            <div className="min-w-28 rounded-2xl border border-line bg-white px-4 py-4 text-center">
              <div className="font-display text-3xl font-bold text-ink">
                {decision.focus.views ?? "Missing"}
              </div>
              <div className="text-xs text-muted">combined views</div>
            </div>
            <div className="min-w-28 rounded-2xl border border-line bg-white px-4 py-4 text-center">
              <div className="font-display text-3xl font-bold text-ink">
                {decision.focus.favorites ?? "Missing"}
              </div>
              <div className="text-xs text-muted">favorites</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.45fr_0.85fr]">
        <article className="rounded-[24px] border border-line bg-panel p-5 shadow-card sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-copper">
                Proposed decision
              </div>
              <h2 className="mt-2 font-display text-2xl font-bold">建議決定</h2>
            </div>
            <span className="rounded-full border border-copper/25 bg-[#F8EDE4] px-3 py-1.5 text-xs font-semibold text-copper">
              {decision.recommendation.confidence} confidence
            </span>
          </div>
          <p className="mt-5 text-xl font-bold leading-8 text-ink">
            {decision.recommendation.decision}
          </p>
          <ul className="mt-4 space-y-3 text-sm text-muted">
            {decision.recommendation.rationale.map((item) => (
              <li key={item} className="flex gap-2.5">
                <Check size={16} className="mt-0.5 shrink-0 text-sage" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 rounded-2xl border border-line bg-[#F8F3ED] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Latest output
            </div>
            <code className="mt-2 block break-all text-xs text-ink">{decision.reportPath}</code>
          </div>
        </article>

        <article className="rounded-[24px] border border-copper/25 bg-[#F9EEE4] p-5 shadow-card sm:p-6">
          <div className="flex items-center gap-2 text-copper">
            <ShieldCheck size={19} />
            <span className="text-xs font-semibold uppercase tracking-[0.16em]">Historical Owner Gate</span>
          </div>
          <h2 className="mt-2 font-display text-2xl font-bold">舊判斷紀錄，只供參考</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            呢個 snapshot 唔再接受批准。現行 Owner Gate 只會喺 Current workspace 驗證 product truth、evidence 同 tags 後記錄。
          </p>
          <div
            className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-semibold ${
              choice === "approve-draft"
                ? "border-sage/25 bg-[#E8F0E6] text-sage"
                : choice === "need-evidence"
                  ? "border-brand/20 bg-[#FFF1E8] text-brand"
                  : "border-line bg-white/70 text-muted"
            }`}
          >
            {gateLabel(choice)}
          </div>
          <button
            type="button"
            onClick={() => { setWorkspaceStartTab("results"); setDashboardSurface("workspace"); }}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            Open current Owner Gate <ArrowRight size={15} aria-hidden="true" />
          </button>
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-[24px] border border-brand/20 bg-[#FFF4EC] p-5 shadow-card sm:p-6">
          <div className="flex items-center gap-2 text-brand">
            <FileSearch size={18} />
            <span className="text-xs font-semibold uppercase tracking-[0.16em]">
              Evidence debt
            </span>
          </div>
          <h2 className="mt-2 font-display text-2xl font-bold">Missing first-party inputs</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-muted">
            {decision.recommendation.missingInputs.map((item) => (
              <li key={item} className="flex gap-2.5">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-brand" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-[24px] border border-line bg-panel p-5 shadow-card sm:p-6">
          <div className="flex items-center gap-2 text-copper">
            <Sparkles size={18} />
            <span className="text-xs font-semibold uppercase tracking-[0.16em]">
              AI Office mission pod
            </span>
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="font-display text-2xl font-bold">一個任務，{crew.length} 位員工接力</h2>
            {onOpenOffice && (
              <button
                type="button"
                onClick={onOpenOffice}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand"
              >
                Open full office <ArrowRight size={14} />
              </button>
            )}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {crew.map((agent) => {
              const role = CREW_ROLES[agent.id];
              return (
                <div key={agent.id} className="rounded-2xl border border-line bg-[#FBF7F2] p-3.5">
                  <div className="flex items-center gap-2">
                    <span>{agent.emoji}</span>
                    <span className="text-sm font-semibold">{agent.name}</span>
                    <span className={`ml-auto h-2 w-2 rounded-full ${statusDot(agent.status)}`} />
                  </div>
                  <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-copper">
                    {role?.label}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-muted">{role?.task}</div>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="rounded-[26px] border border-line bg-panel p-5 shadow-card sm:p-6">
        <div className="flex items-center gap-2 text-brand">
          <Bot size={18} />
          <span className="text-xs font-semibold uppercase tracking-[0.16em]">
            Integration ladder
          </span>
        </div>
        <h2 className="mt-2 font-display text-2xl font-bold">
          Codex 可以接入，但每一級都有不同安全界線
        </h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              level: "Level 1 · Active now",
              title: "Owner exports",
              detail: "你下載 CSV／screenshots；Skill 分析、QA、寫報告及更新員工狀態。",
              icon: Database,
              tone: "border-sage/25 bg-[#EEF3EC] text-sage",
            },
            {
              level: "Level 2 · Future",
              title: "Official API read-only",
              detail: "App 獲批及 OAuth 後，只讀 shop/listing/order 所需欄位；token 不進 Dashboard。",
              icon: ShieldCheck,
              tone: "border-copper/25 bg-[#F8EDE4] text-copper",
            },
            {
              level: "Level 3 · Future",
              title: "Order events",
              detail: "用已簽署 webhook 觸發學習／提醒，不用高頻 polling，也不自動改 listing。",
              icon: Radio,
              tone: "border-brand/20 bg-[#FFF1E8] text-brand",
            },
            {
              level: "Level 4 · Locked",
              title: "Write & publish",
              detail: "任何 title、price、image、SEO 或 publish 都必須先 draft、QA、逐項 owner approval。",
              icon: LockKeyhole,
              tone: "border-line bg-[#F4ECE4] text-muted",
            },
          ].map(({ level, title, detail, icon: Icon, tone }) => (
            <article key={level} className={`rounded-2xl border p-4 ${tone}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em]">{level}</span>
                <Icon size={16} />
              </div>
              <h3 className="mt-4 text-base font-bold text-ink">{title}</h3>
              <p className="mt-2 text-xs leading-5 text-muted">{detail}</p>
            </article>
          ))}
        </div>
        <div className="mt-5 rounded-2xl border border-line bg-[#F8F3ED] p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={17} className="mt-0.5 shrink-0 text-brand" />
            <div>
              <div className="text-sm font-semibold">Source trust rule</div>
              <p className="mt-1 text-xs leading-5 text-muted">
                {decision.source.authority}. {decision.source.limitations.join(" · ")}
              </p>
            </div>
          </div>
        </div>
      </section>
        </>
      )}
    </div>
  );
}
