import { useState } from "react";
import {
  Activity,
  BookOpen,
  Bot,
  CalendarDays,
  CheckSquare,
  Compass,
  ExternalLink,
  LockKeyhole,
} from "lucide-react";
import TasksView from "./views/TasksView";
import TodayView from "./views/TodayView";
import DailyNoteView from "./views/DailyNoteView";
import VaultHealthView from "./views/VaultHealthView";
import AIOfficeView from "./views/AIOfficeView";
import EtsyDecisionView from "./views/EtsyDecisionView";

type View = "tasks" | "today" | "daily" | "vault" | "office" | "etsy";

const SHINEON_URL = import.meta.env.VITE_SHINEON_URL ?? "https://trevor94899234-maker.github.io/etsyshop-shineon-status/";

type NavigationItem =
  | { id: View; label: string; icon: typeof CheckSquare; href?: never }
  | { id: "shineon"; label: string; icon: typeof CheckSquare; href: string };

const NAV: NavigationItem[] = [
  { id: "today", label: "今日", icon: CalendarDays },
  { id: "etsy", label: "Etsy 決策", icon: Compass },
  { id: "office", label: "AI 辦公室", icon: Bot },
  { id: "tasks", label: "任務", icon: CheckSquare },
  { id: "daily", label: "每日筆記", icon: BookOpen },
  { id: "vault", label: "Vault 健康", icon: Activity },
  { id: "shineon", label: "ShineOn 監察", icon: ExternalLink, href: SHINEON_URL },
];

export default function App() {
  const [view, setView] = useState<View>("etsy");

  return (
    <div className="min-h-screen bg-canvas text-ink lg:flex">
      <aside className="border-b border-white/10 bg-espresso text-cream lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:block lg:px-5 lg:py-7">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand font-display text-lg font-bold text-white shadow-lg shadow-black/20">
              MG
            </div>
            <div>
              <div className="font-display text-lg font-bold tracking-wide text-white">
                MyGiftStyle
              </div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-cream/60">
                決策工作室
              </div>
            </div>
          </div>
          <div className="hidden items-center gap-1.5 rounded-full border border-cream/15 bg-white/5 px-2.5 py-1 text-[10px] text-cream/70 sm:flex lg:mt-5 lg:w-fit">
            <LockKeyhole size={11} />
            私密 · 店主控制
          </div>
        </div>

        <nav
          className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-4 pb-4 sm:px-6 lg:flex-col lg:overflow-visible lg:px-4"
          aria-label="Main navigation"
        >
          {NAV.map(({ id, label, icon: Icon, href }) => {
            const active = !href && view === id;
            const className = `flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition ${
              active
                ? "bg-brand text-white shadow-lg shadow-black/15"
                : "text-cream/75 hover:bg-white/10 hover:text-white"
            }`;
            return href ? (
              <a key={id} href={href} target="_blank" rel="noreferrer" className={className}>
                <Icon size={17} />
                {label}
              </a>
            ) : (
              <button key={id} type="button" onClick={() => setView(id as View)} aria-current={active ? "page" : undefined} className={className}>
                <Icon size={17} />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="hidden lg:absolute lg:bottom-0 lg:left-0 lg:right-0 lg:block lg:p-4">
          <div className="rounded-2xl border border-cream/15 bg-white/[0.06] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-cream">
              <span className="h-2 w-2 rounded-full bg-sage" />
              店主批准層
            </div>
            <p className="mt-2 text-xs leading-5 text-cream/55">
              AI 整理證據及草擬建議；所有 Etsy 實際操作仍由你決定。
            </p>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1520px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          {view === "today" && <TodayView />}
          {view === "etsy" && <EtsyDecisionView onOpenOffice={() => setView("office")} />}
          {view === "tasks" && <TasksView />}
          {view === "daily" && <DailyNoteView />}
          {view === "vault" && <VaultHealthView />}
          {view === "office" && <AIOfficeView />}
        </div>
      </main>
    </div>
  );
}
