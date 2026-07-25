import { useEffect, useState } from "react";
import { fetchJson } from "../lib/fetchJson";
import type { Task, TodayPlan } from "../lib/types";

export default function TodayView() {
  const [plan, setPlan] = useState<TodayPlan | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    fetchJson<TodayPlan | null>("data/today.json", null).then(setPlan);
    fetchJson<Task[]>("data/tasks.json", []).then(setTasks);
  }, []);

  if (!plan) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Today</h1>
        <p className="text-muted text-sm">
          今日仲未有 plan。Plan 由 vault 嘅 daily note <code className="bg-line px-1 rounded">## Today's Plan</code> section 同步。
        </p>
      </div>
    );
  }

  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const planTasks = plan.taskIds.map((id) => taskById.get(id)).filter(Boolean) as Task[];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Today</h1>
      <p className="text-muted text-sm mb-6">{plan.date} · {planTasks.length} 件 focus</p>

      {plan.note && (
        <div className="mb-6 bg-panel border border-line rounded-xl p-4 text-sm">
          {plan.note}
        </div>
      )}

      <ol className="space-y-2">
        {planTasks.map((t, i) => (
          <li
            key={t.id}
            className="flex items-center gap-3 bg-panel border border-line rounded-xl p-3"
          >
            <span className="w-6 text-center text-muted text-sm font-mono">{i + 1}</span>
            <span className={t.status === "done" ? "text-muted line-through" : ""}>
              {t.title}
            </span>
            <span className="ml-auto text-xs text-muted">{t.status}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
