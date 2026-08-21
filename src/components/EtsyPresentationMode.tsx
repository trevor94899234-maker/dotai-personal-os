import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Database,
  FileText,
  Lightbulb,
  LockKeyhole,
  Search,
  ShieldCheck,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

type EtsyPresentationModeProps = {
  evidenceCount: number;
  confirmedEvidenceCount: number;
  blockerCount: number;
  decisionReady: boolean;
  hasKeywordDecision: boolean;
  hasDraft: boolean;
  ownerApproved: boolean;
};

type Scene = {
  eyebrow: string;
  title: string;
  shortTitle: string;
  promise: string;
  story: string;
  Icon: LucideIcon;
  accent: "brand" | "copper" | "sage";
};

const SCENES: Scene[] = [
  {
    eyebrow: "01 · 問題",
    title: "將分散嘅店舖資料，整理成一個清楚嘅下一步",
    shortTitle: "任務",
    promise: "一個安靜清晰嘅地方，決定今日最值得處理乜嘢。",
    story: "唔使再喺 Etsy、研究工具同筆記之間跳來跳去；店主由一個以任務為核心嘅畫面開始：我哋知道乜嘢、欠乜嘢，同埋下一步應該做乜嘢。",
    Icon: Lightbulb,
    accent: "brand",
  },
  {
    eyebrow: "02 · 證據進場",
    title: "由來源真實資料開始，而唔係 AI 猜測",
    shortTitle: "證據",
    promise: "每一個洞察都保留來源、日期同確認狀態。",
    story: "Etsy 第一方匯出資料優先；eRank、EverBee、截圖同店主筆記用作補充，而 missing、invalid、confirmed zero 會清楚分開。",
    Icon: Database,
    accent: "copper",
  },
  {
    eyebrow: "03 · 決策控制",
    title: "AI 比較證據，資料不足就停低",
    shortTitle: "決策",
    promise: "系統只建議一個行動，或者清楚解釋阻塞原因。",
    story: "決策層會檢查相關性、產品真實資料同資料質素；可以繼續到關鍵字方向、要求更深入研究，或者有意識咁暫停決定。",
    Icon: Search,
    accent: "sage",
  },
  {
    eyebrow: "04 · 草稿輸出",
    title: "將決定變成可以審閱嘅 Listing Brief",
    shortTitle: "草稿",
    promise: "策略變成實際草稿包，永遠唔會自動發佈。",
    story: "揀定嘅方向會整理成 title、tags、description、產品 claims 同 social copy 選項；輸出仍然係一份透明、可以追溯返證據嘅草稿。",
    Icon: FileText,
    accent: "copper",
  },
  {
    eyebrow: "05 · 店主批准",
    title: "最後嘅商業決定，由店主保留",
    shortTitle: "批准",
    promise: "AI 準備，店主審閱、批准，再手動執行。",
    story: "最後一道 gate 保護品牌語氣同商業判斷。呢個概念唔會連接 Etsy、修改 listing，亦唔會代店主發佈任何內容。",
    Icon: UserCheck,
    accent: "sage",
  },
];

const ACCENT = {
  brand: {
    icon: "bg-[#F8E0D3] text-brand",
    panel: "border-brand/20 bg-[#FFF1E8]",
    text: "text-brand",
  },
  copper: {
    icon: "bg-[#F5E5D4] text-copper",
    panel: "border-copper/20 bg-[#FFF9F3]",
    text: "text-copper",
  },
  sage: {
    icon: "bg-[#E5EFE4] text-sage",
    panel: "border-sage/20 bg-[#F3F8F4]",
    text: "text-sage",
  },
};

export default function EtsyPresentationMode({
  evidenceCount,
  confirmedEvidenceCount,
  blockerCount,
  decisionReady,
  hasKeywordDecision,
  hasDraft,
  ownerApproved,
}: EtsyPresentationModeProps) {
  const [activeScene, setActiveScene] = useState(0);
  const scene = SCENES[activeScene];
  const tone = ACCENT[scene.accent];
  const SceneIcon = scene.Icon;

  const sceneSignals = [
    { label: "分散輸入", value: "一條工作流程", detail: "證據 → 決策 → 草稿 → 批准" },
    { label: "已收到證據", value: `${evidenceCount} 筆資料`, detail: `${confirmedEvidenceCount} 筆店主已確認` },
    { label: "決策狀態", value: decisionReady ? "可以繼續" : `${blockerCount} 個阻塞`, detail: decisionReady ? "證據 gate 已通過" : "系統會安全暫停" },
    { label: "草稿狀態", value: hasDraft ? "已有 Brief" : hasKeywordDecision ? "已揀定方向" : "概念流程", detail: "唔會自動操作 Etsy" },
    { label: "店主 gate", value: ownerApproved ? "已手動批准" : "需要店主批准", detail: "Live action 保持鎖定" },
  ];
  const signal = sceneSignals[activeScene];

  const goTo = (index: number) => setActiveScene(Math.max(0, Math.min(SCENES.length - 1, index)));

  return (
    <div className="overflow-hidden rounded-[32px] border border-[#E8D8CA] bg-[#FFFDF9] shadow-[0_24px_70px_rgba(74,48,34,0.12)]">
      <header className="relative overflow-hidden border-b border-[#E8D8CA] bg-[#2F2925] px-5 py-6 text-white sm:px-8 lg:px-10 lg:py-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-copper/20 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-sage/20 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold tracking-[0.18em] text-[#F5D8C6]">概念簡報</span>
              <span className="rounded-full border border-[#9EBB9C]/35 bg-[#9EBB9C]/10 px-3 py-1 text-[10px] font-bold tracking-[0.16em] text-[#CFE0CC]">五幕故事</span>
            </div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.22em] text-[#E9A174]">MyGiftStyle · Etsy Decision OS</p>
            <h2 className="mt-2 max-w-2xl font-display text-3xl font-bold leading-[1.05] text-white sm:text-4xl lg:text-5xl">由店舖證據，走到一個由店主批准嘅決定。</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#D8CEC7] sm:text-base">將 Etsy 資料同研究整理成清晰、有證據支持嘅 Listing Brief，同時保留所有 live action 由人控制。</p>
          </div>
        </div>
      </header>

      <div className="border-b border-[#E8D8CA] bg-[#F8F1EA] px-4 py-4 sm:px-7 lg:px-9">
        <ol className="grid grid-cols-5 gap-1.5" aria-label="簡報五幕">
          {SCENES.map((item, index) => {
            const Icon = item.Icon;
            const isActive = index === activeScene;
            const isPast = index < activeScene;
            return (
              <li key={item.shortTitle}>
                <button type="button" aria-current={isActive ? "step" : undefined} aria-label={`第 ${index + 1} 幕：${item.shortTitle}`} onClick={() => goTo(index)} className={`group flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${isActive ? "bg-white text-ink shadow-sm" : "text-muted hover:bg-white/60 hover:text-ink"}`}>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${isActive ? ACCENT[item.accent].icon : isPast ? "bg-[#E5EFE4] text-sage" : "bg-white text-muted"}`}>{isPast ? <CheckCircle2 size={14} aria-hidden="true" /> : <Icon size={13} aria-hidden="true" />}</span>
                  <span className="text-[9px] font-bold leading-none sm:text-[10px]">{item.shortTitle}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <main className="grid min-h-[440px] gap-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
        <section className="flex flex-col justify-between p-5 sm:p-8 lg:p-10" aria-live="polite">
          <div>
            <div className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${tone.icon}`}><SceneIcon size={23} aria-hidden="true" /></div>
            <p className={`mt-6 text-xs font-bold uppercase tracking-[0.18em] ${tone.text}`}>{scene.eyebrow}</p>
            <h3 className="mt-2 max-w-3xl font-display text-3xl font-bold leading-tight text-ink sm:text-4xl">{scene.title}</h3>
            <p className="mt-4 max-w-2xl text-lg font-semibold leading-7 text-ink">{scene.promise}</p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">{scene.story}</p>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#E8D8CA] pt-5">
            <button type="button" onClick={() => goTo(activeScene - 1)} disabled={activeScene === 0} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-xs font-bold text-ink transition hover:bg-[#F8F1EA] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <ArrowLeft size={15} aria-hidden="true" /> 上一幕
            </button>
            <span className="text-xs font-semibold text-muted">第 {activeScene + 1} / {SCENES.length} 幕</span>
            <button type="button" onClick={() => goTo(activeScene + 1)} disabled={activeScene === SCENES.length - 1} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white transition hover:bg-brand disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">
              下一幕 <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        </section>

        <aside className="border-t border-[#E8D8CA] bg-[#F6EEE7] p-5 sm:p-8 lg:border-l lg:border-t-0 lg:p-9" aria-label="本幕重點">
          <div className={`rounded-[24px] border p-5 ${tone.panel}`}>
            <p className={`text-[10px] font-bold tracking-[0.16em] ${tone.text}`}>觀眾應該記得嘅重點</p>
            <p className="mt-3 font-display text-2xl font-bold leading-tight text-ink">{signal.value}</p>
            <p className="mt-2 text-sm font-semibold text-ink">{signal.label}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{signal.detail}</p>
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex gap-3 rounded-2xl border border-white bg-white/75 p-4">
              <ShieldCheck size={19} className="mt-0.5 shrink-0 text-sage" aria-hidden="true" />
              <div><p className="text-xs font-bold text-ink">證據先於建議</p><p className="mt-1 text-[11px] leading-4 text-muted">來源權威同缺少資料都會清楚顯示。</p></div>
            </div>
            <div className="flex gap-3 rounded-2xl border border-white bg-white/75 p-4">
              <LockKeyhole size={19} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
              <div><p className="text-xs font-bold text-ink">Live action 保持鎖定</p><p className="mt-1 text-[11px] leading-4 text-muted">唔連接 Etsy、唔修改、唔改廣告、唔發佈。</p></div>
            </div>
          </div>

          <div className="mt-6 border-t border-[#DDCFC3] pt-4">
            <p className="text-[10px] font-bold tracking-[0.16em] text-muted">簡報提示</p>
            <p className="mt-2 text-xs leading-5 text-ink">先講呢張卡嘅結果，再用一句話講清楚工作流程。詳細功能只作支援資料，唔係主線。</p>
          </div>
        </aside>
      </main>

      <footer className="flex flex-col gap-2 border-t border-[#E8D8CA] bg-white px-5 py-4 text-[11px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span className="font-semibold text-ink">概念簡報 · 工作流程展示版</span>
        <span>現有功能會按階段開發，明日只展示核心流程。</span>
      </footer>
    </div>
  );
}
