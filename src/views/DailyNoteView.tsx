import { useEffect, useState } from "react";
import { fetchJson } from "../lib/fetchJson";
import type { DailyNote } from "../lib/types";

export default function DailyNoteView() {
  const [notes, setNotes] = useState<DailyNote[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<DailyNote[]>("data/daily-notes.json", []).then((list) => {
      const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
      setNotes(sorted);
      if (sorted.length > 0) setSelected(sorted[0].date);
    });
  }, []);

  if (notes === null) return <div className="text-muted text-sm">Loading…</div>;

  if (notes.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Daily Note</h1>
        <p className="text-muted text-sm">
          冇 daily note。Vault 嘅 <code className="bg-line px-1 rounded">40 - Daily/</code> 入面寫 markdown 然後 sync。
        </p>
      </div>
    );
  }

  const current = notes.find((n) => n.date === selected) ?? notes[0];

  return (
    <div className="flex gap-6">
      <aside className="w-48 shrink-0">
        <h1 className="text-2xl font-bold mb-4">Daily Note</h1>
        <ul className="space-y-1">
          {notes.map((n) => (
            <li key={n.date}>
              <button
                onClick={() => setSelected(n.date)}
                className={`w-full text-left px-2 py-1 rounded text-sm ${
                  n.date === selected ? "bg-brand text-white" : "text-ink hover:bg-line"
                }`}
              >
                {n.date}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <article className="flex-1 bg-panel border border-line rounded-xl p-6">
        <header className="mb-4 pb-4 border-b border-line">
          <h2 className="text-xl font-bold">{current.date}</h2>
        </header>
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink">
          {current.content}
        </pre>
      </article>
    </div>
  );
}
