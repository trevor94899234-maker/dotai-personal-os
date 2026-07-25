#!/usr/bin/env node
/**
 * sync-vault.mjs
 *
 * 將 Obsidian vault 嘅指定 folder 同 frontmatter pattern 轉做 JSON，
 * 寫入 public/data/ 比 React frontend 讀。
 *
 * 用法：
 *   node scripts/sync-vault.mjs                 # 讀 sample-vault/
 *   VAULT_DIR=/abs/path node scripts/sync-vault.mjs
 *
 * 教學重點（Day 1 H3）：
 *  - 同學睇得明每一步：scan → parse frontmatter → transform → write JSON
 *  - 唔用 ORM、唔用 framework，純 fast-glob + gray-matter
 *  - 學員之後可以加 entity（reading list / habit / project）跟同一 pattern
 */

import { readFile, writeFile, mkdir, realpath } from "node:fs/promises";
import { join, dirname, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import fg from "fast-glob";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const VAULT_DIR = process.env.VAULT_DIR || join(ROOT, "sample-vault");
const OUT_DIR = join(ROOT, "public", "data");

// Defensive guard: forbid syncing Kenneth's real Obsidian vault into public/data/.
// Rule source: ~/.claude/memory/feedback_dotai_no_real_vault_sync.md (2026-05-29).
// 學員 fork 自己 vault 唔受影響（path 唔含呢個 keyword）。
// 如 vault path 日後移動，喺 sync command 加 ALLOW_REAL_VAULT=1 環境變數 override。
//
// M2 fix: strict opt-in — only literal '1' bypasses (ALLOW_REAL_VAULT=0/false/anything-else still blocks).
// L6 fix: realpath() resolves symlinks before regex test, defeats mklink junction bypass.
const FORBIDDEN_VAULT_PATTERNS = [/Desktop[\\/]Obsidian/i];

async function checkVaultGuard() {
  if (process.env.ALLOW_REAL_VAULT === "1") return;

  let resolved = VAULT_DIR;
  try {
    resolved = await realpath(VAULT_DIR);
  } catch {
    // VAULT_DIR doesn't exist yet — fall through, regex test on raw string
  }

  const blocked = FORBIDDEN_VAULT_PATTERNS.some((p) => p.test(VAULT_DIR) || p.test(resolved));
  if (blocked) {
    console.error(`❌ Refusing to sync real Obsidian vault: ${VAULT_DIR}`);
    if (resolved !== VAULT_DIR) console.error(`   (resolved via symlink to: ${resolved})`);
    console.error(`   Production deploy only allows sample-vault/.`);
    console.error(`   Override (本機 dev only, 唔好 commit public/data/) with ALLOW_REAL_VAULT=1.`);
    process.exit(1);
  }
}

const toPosix = (p) => p.split("\\").join("/");

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function readMarkdown(absPath) {
  const raw = await readFile(absPath, "utf8");
  const parsed = matter(raw);
  return { frontmatter: parsed.data, body: parsed.content, raw };
}

/**
 * Tasks 兩種來源都食：
 *  - `tasks/*.md` 一個 file 一個 task，用 frontmatter（id / title / status / created_at）
 *  - Obsidian Tasks plugin 風格 checkbox：vault 任何 .md 入面嘅 `- [ ]` / `- [x]` / `- [/]` line
 * 兩個 source 合埋寫入 tasks.json。
 */
async function syncTasks() {
  const tasks = [];

  // Source 1: frontmatter tasks
  const fmFiles = await fg("tasks/*.md", { cwd: VAULT_DIR, absolute: true });
  for (const f of fmFiles) {
    const { frontmatter } = await readMarkdown(f);
    if (!frontmatter.id || !frontmatter.title) continue;
    tasks.push({
      id: String(frontmatter.id),
      title: String(frontmatter.title),
      status: frontmatter.status || "todo",
      createdAt: frontmatter.created_at || new Date().toISOString(),
      source: "frontmatter"
    });
  }

  // Source 2: Obsidian Tasks plugin checkbox syntax — scan vault 全部 .md
  // 支援 - [ ] todo / - [/] doing / - [x] done
  const allFiles = await fg("**/*.md", {
    cwd: VAULT_DIR,
    absolute: true,
    ignore: ["node_modules/**", "tasks/**"]  // tasks/ 已經由 source 1 食咗
  });
  const CHECKBOX_RE = /^(\s*)-\s+\[([ x/-])\]\s+(.+?)\s*$/i;
  for (const f of allFiles) {
    const raw = await readFile(f, "utf8");
    const lines = raw.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(CHECKBOX_RE);
      if (!m) continue;
      const [, , state, title] = m;
      const status =
        state === "x" || state === "X" ? "done" :
        state === "/" || state === "-" ? "doing" :
        "todo";
      // ID = file path + line number hash（穩定，同一 line 再 sync 同一 ID）
      const rel = toPosix(relative(VAULT_DIR, f));
      const id = `cb:${rel}:${i + 1}`;
      tasks.push({
        id,
        title: title.trim(),
        status,
        createdAt: new Date().toISOString(),
        source: "checkbox",
        sourceFile: rel
      });
    }
  }

  await writeFile(join(OUT_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));
  const fmCount = tasks.filter((t) => t.source === "frontmatter").length;
  const cbCount = tasks.filter((t) => t.source === "checkbox").length;
  console.log(`  tasks.json ← ${tasks.length} tasks (${fmCount} frontmatter + ${cbCount} checkbox)`);
}

function todayString() {
  // 用本機 timezone（學員 default 想要 local），可以用 TODAY=YYYY-MM-DD 覆寫
  if (process.env.TODAY) return process.env.TODAY;
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function syncToday() {
  const today = todayString();
  const dailyPath = join(VAULT_DIR, "40 - Daily", `${today}.md`);
  let plan = null;
  try {
    const { frontmatter, body } = await readMarkdown(dailyPath);
    const planMatch = body.match(/##\s+Today's Plan\s*\n([\s\S]*?)(?=\n##|$)/);
    let taskIds = [];
    if (frontmatter.task_ids && Array.isArray(frontmatter.task_ids)) {
      taskIds = frontmatter.task_ids.map(String);
    } else if (planMatch) {
      taskIds = planMatch[1]
        .split("\n")
        .map((l) => l.match(/\[\[(.*?)\]\]/)?.[1])
        .filter(Boolean);
    }
    plan = {
      date: today,
      taskIds,
      note: frontmatter.note || ""
    };
  } catch {
    // no daily file today
  }
  await writeFile(join(OUT_DIR, "today.json"), JSON.stringify(plan, null, 2));
  console.log(`  today.json ← ${plan ? `${plan.taskIds.length} task refs` : "no plan"}`);
}

async function syncDailyNotes() {
  const files = await fg("40 - Daily/*.md", { cwd: VAULT_DIR, absolute: true });
  const notes = [];
  for (const f of files) {
    const { body } = await readMarkdown(f);
    const date = basename(f, ".md");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    notes.push({ date, content: body.trim() });
  }
  await writeFile(join(OUT_DIR, "daily-notes.json"), JSON.stringify(notes, null, 2));
  console.log(`  daily-notes.json ← ${notes.length} notes`);
}

async function syncVaultHealth() {
  const inbox = await fg("00 - Inbox/*.md", { cwd: VAULT_DIR });
  const recent = await fg("30 - Notes/*.md", { cwd: VAULT_DIR, absolute: true });
  recent.sort().reverse();
  const recentAtomNotes = recent.slice(0, 5).map((f) => {
    const name = basename(f, ".md");
    const dateMatch = name.match(/^(\d{4}-\d{2}-\d{2})/);
    return {
      title: name.replace(/^\d{4}-\d{2}-\d{2}\s*/, ""),
      date: dateMatch?.[1] || "",
      path: toPosix(relative(VAULT_DIR, f))
    };
  });

  // orphan = note in 30 - Notes/ with 0 inbound wikilinks (best-effort).
  const allNotes = await fg("**/*.md", { cwd: VAULT_DIR, absolute: true, ignore: ["node_modules/**"] });
  const titles = new Map();
  for (const f of allNotes) {
    titles.set(basename(f, ".md"), f);
  }
  const referenced = new Set();
  for (const f of allNotes) {
    const raw = await readFile(f, "utf8");
    for (const m of raw.matchAll(/\[\[([^\]|#]+)/g)) {
      const target = m[1].trim();
      if (titles.has(target)) referenced.add(target);
    }
  }
  const atomNotes = (await fg("30 - Notes/*.md", { cwd: VAULT_DIR })).map((f) =>
    basename(f, ".md")
  );
  const orphanCount = atomNotes.filter((n) => !referenced.has(n)).length;

  const data = {
    inboxCount: inbox.length,
    orphanCount,
    recentAtomNotes,
    lastSyncedAt: new Date().toISOString()
  };
  await writeFile(join(OUT_DIR, "vault-health.json"), JSON.stringify(data, null, 2));
  console.log(`  vault-health.json ← inbox ${data.inboxCount} / orphan ${orphanCount} / recent ${recentAtomNotes.length}`);
}

// content-drafts.json: 冇專屬 dashboard view，但保留 sync 俾學員自己加
// Content Pipeline view（data source = _drafts/）。
async function syncContentDrafts() {
  const files = await fg("_drafts/*.md", { cwd: VAULT_DIR, absolute: true });
  const drafts = [];
  for (const f of files) {
    const { frontmatter } = await readMarkdown(f);
    if (!frontmatter.title || !frontmatter.platform) continue;
    drafts.push({
      id: String(frontmatter.id || basename(f, ".md")),
      title: String(frontmatter.title),
      platform: String(frontmatter.platform),
      status: String(frontmatter.status || "idea"),
      updatedAt: frontmatter.updated_at || new Date().toISOString()
    });
  }
  await writeFile(join(OUT_DIR, "content-drafts.json"), JSON.stringify(drafts, null, 2));
  console.log(`  content-drafts.json ← ${drafts.length} drafts`);
}

// agents.json 唔係由 vault 派生——係 log-agent.mjs 寫嘅「員工運作狀態」。
// sync 唔會 overwrite 佢；只喺唔存在時 seed 一個 10-row idle roster
// （roster 定義 AI Office 頁面上嘅員工卡）。
const AGENT_ROSTER = [
  ["content-creator", "內容創作", "✍️"],
  ["meeting-organizer", "會議整理", "🗒️"],
  ["doc-processor", "文書處理", "📄"],
  ["client-crm", "客戶 CRM 跟進", "🤝"],
  ["project-manager", "Project Manager", "📋"],
  ["finance", "Finance", "💰"],
  ["excel-analyst", "Excel 數據分析", "📊"],
  ["trend-research", "Trend Research", "🔭"],
  ["data-consolidation", "Data Consolidation", "🧩"],
  ["whatsapp-secretary", "WhatsApp 私人秘書", "💬"]
];

async function seedAgentsIfMissing() {
  const out = join(OUT_DIR, "agents.json");
  try {
    await readFile(out, "utf8");
    console.log("  agents.json — 已存在，保留運作狀態（sync 唔郁佢）");
  } catch {
    const rows = AGENT_ROSTER.map(([id, name, emoji]) => ({
      id, name, emoji, status: "idle", lastRun: null, outputCount: 0
    }));
    await writeFile(out, JSON.stringify(rows, null, 2) + "\n");
    console.log(`  agents.json ← seed ${rows.length}-row idle roster`);
  }
}

async function main() {
  await checkVaultGuard();
  console.log(`📚 syncing vault: ${VAULT_DIR}`);
  console.log(`📤 output dir:    ${OUT_DIR}`);
  await ensureDir(OUT_DIR);
  await syncTasks();
  await syncToday();
  await syncDailyNotes();
  await syncVaultHealth();
  await syncContentDrafts();
  await seedAgentsIfMissing();
  console.log("✅ sync done");
}

main().catch((err) => {
  console.error("❌ sync failed:", err);
  process.exit(1);
});
