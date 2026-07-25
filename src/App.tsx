import { useState } from "react";
import { CheckSquare, CalendarDays, BookOpen, Activity, Bot } from "lucide-react";
import TasksView from "./views/TasksView";
import TodayView from "./views/TodayView";
import DailyNoteView from "./views/DailyNoteView";
import VaultHealthView from "./views/VaultHealthView";
import AIOfficeView from "./views/AIOfficeView";

type View = "tasks" | "today" | "daily" | "vault" | "office";

const NAV: Array<{ id: View; label: string; icon: typeof CheckSquare }> = [
  { id: "today", label: "Today", icon: CalendarDays },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "daily", label: "Daily Note", icon: BookOpen },
  { id: "vault", label: "Vault Health", icon: Activity },
  { id: "office", label: "AI Office", icon: Bot }
];

export default function App() {
  const [view, setView] = useState<View>("today");

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-panel border-r border-line p-4 flex flex-col gap-1">
        <div className="text-navy font-bold text-lg mb-6">Personal OS</div>
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
              view === id ? "bg-brand text-white" : "text-ink hover:bg-line"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
        <div className="mt-auto text-xs text-muted pt-4 border-t border-line">
          Level 2 Skeleton<br />
          data: <code>public/data/</code>
        </div>
      </aside>

      <main className="flex-1 p-8 max-w-5xl">
        {view === "today" && <TodayView />}
        {view === "tasks" && <TasksView />}
        {view === "daily" && <DailyNoteView />}
        {view === "vault" && <VaultHealthView />}
        {view === "office" && <AIOfficeView />}
      </main>
    </div>
  );
}
