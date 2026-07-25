import { useEffect, useState } from "react";
import { fetchJson } from "../lib/fetchJson";
import type { Task, TaskStatus } from "../lib/types";

const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: "bg-line text-ink",
  doing: "bg-brand text-white",
  done: "bg-emerald-100 text-emerald-700"
};

export default function TasksView() {
  const [tasks, setTasks] = useState<Task[] | null>(null);

  useEffect(() => {
    fetchJson<Task[]>("data/tasks.json", []).then(setTasks);
  }, []);

  if (tasks === null) {
    return <div className="text-muted text-sm">Loading…</div>;
  }

  if (tasks.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Tasks</h1>
        <p className="text-muted text-sm">
          冇 task。跑 <code className="bg-line px-1 rounded">npm run sync:vault</code> 將 vault 嘅 task 拉入嚟。
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Tasks</h1>
      <p className="text-muted text-sm mb-6">{tasks.length} 個 task · 由 vault 同步</p>
      <ul className="space-y-2">
        {tasks.map((t) => (
          <li
            key={t.id}
            className="flex items-center gap-3 bg-panel border border-line rounded-xl p-3"
          >
            <span
              className={`text-xs px-2 py-0.5 rounded-md font-medium ${STATUS_COLOR[t.status]}`}
            >
              {t.status}
            </span>
            <span className={t.status === "done" ? "text-muted line-through" : ""}>
              {t.title}
            </span>
            <span className="ml-auto text-xs text-muted">{t.createdAt.slice(0, 10)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
