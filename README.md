# Personal OS Dashboard

> 用 Obsidian 做 database 嘅個人 dashboard。Fork 呢個 repo，用 Codex 幫你改成自己嘅 Personal OS。

## MyGiftStyle Etsy Decision OS

`Etsy Decision` 是一個超越課堂 baseline 的個人化 view。它不複製 Etsy
Shop Stats，而是把店主提供的 Etsy、eRank 或 EverBee export 轉成：

- Revenue / Intent、Evidence、Production 三個每日 targets；
- 一個有證據、缺口、confidence 和 owner gate 的建議；
- AI 員工的 `running / done / error` 狀態及最新 output。

本功能不會登入 eRank／EverBee、不會修改 Etsy，也不會把歷史第三方資料
當成即時第一方結果。

正式 Skill：

```text
.agents/skills/mygiftstyle-etsy-growth-radar/
```

用 owner 已提供的 export 跑一次：

```powershell
npm.cmd run demo:etsy -- `
  --listings "C:\path\to\everbee-listings.csv" `
  --keywords "C:\path\to\keywords.csv" `
  --as-of 2026-07-12 `
  --dashboard public/data/etsy-decision.json `
  --report demo-output/2026-07-12-etsy-growth-radar.md `
  --agents public/data/agents.json
```

`public/data/` 保持不進 Git。Repository 內的 `public/demo/` 只保存不含客戶
資料的歷史 Demo summary，讓 clone 後仍可看到新功能。

**Live demo**: https://kennethlaw325.github.io/dotai-personal-os/

## 架構：一條 pipeline

```
Obsidian vault (markdown)  →  scripts/sync-vault.mjs  →  public/data/*.json  →  React app
```

- **Database** = Obsidian vault 入面嘅 markdown（folder 結構 + frontmatter）
- **Sync layer** = 一個 Node script（`fast-glob` 搵 file、`gray-matter` 讀 frontmatter）
- **Frontend** = Vite + React 18 + TypeScript + Tailwind
- 冇 server、冇 database server — build 出嚟係純靜態網站

## 點 run

```bash
# 1. 裝 dependencies
npm install

# 2. Sync sample vault → JSON（第一次必須跑，否則冇數據）
npm run sync:vault

# 3. 開 dev server
npm run dev
# 開 http://localhost:5173

# Production build + preview
npm run build
npm run preview        # http://localhost:4173
```

改咗 vault 入面嘅 markdown 之後，re-run `npm run sync:vault` 再 refresh 就見到新嘢。

## 用自己嘅 Obsidian vault

```bash
# Windows PowerShell:
$env:VAULT_DIR = "C:/path/to/your/vault"; npm run sync:vault

# Mac / Linux:
VAULT_DIR=/path/to/your/vault npm run sync:vault
```

你個 vault 需要有呢啲 folder（冇嗰啲 view 會顯示空）：

| Vault folder / file | 格式要求 | 餵邊個 view |
|------|------|------|
| `tasks/*.md` | 一個 task 一個 file，frontmatter：`id` `title` `status`（todo/doing/done）`created_at` | Tasks |
| `40 - Daily/<YYYY-MM-DD>.md` | daily note，frontmatter 可選 `task_ids: [...]` 或 body 有 `## Today's Plan` | Today + Daily Note |
| `00 - Inbox/` + `30 - Notes/` | 普通 markdown notes（wikilink 會用嚟計 orphan） | Vault Health |
| `AI-Office/` | agent roster + log（第三堂先用到；未有呢個 folder 都唔影響其他 view，AI Office 會顯示內置 roster） | AI Office |
| `_drafts/*.md` | frontmatter：`title` `platform` `status` `updated_at`（預留俾你自己加 view） | —（sync 咗但未有 view） |

## 咩 file 對應咩嘢

### Frontend（`src/`）

| File | 做咩 |
|------|------|
| `src/main.tsx` + `index.html` | App 入口 |
| `src/App.tsx` | 左邊 nav + view 切換 — **加新 view 喺呢度掛** |
| `src/views/TodayView.tsx` | Today 頁：今日 plan（讀 `today.json`） |
| `src/views/TasksView.tsx` | Tasks 頁：task board todo/doing/done（讀 `tasks.json`） |
| `src/views/DailyNoteView.tsx` | Daily Note 頁：過往 daily reflection（讀 `daily-notes.json`） |
| `src/views/VaultHealthView.tsx` | Vault Health 頁：inbox 堆積 + orphan notes（讀 `vault-health.json`） |
| `src/views/AIOfficeView.tsx` | AI Office 頁：AI 員工 org chart + 活動狀態（讀 `agents.json`） |
| `src/lib/fetchJson.ts` | 讀 `public/data/*.json` 嘅共用 helper |
| `src/lib/types.ts` | 所有 JSON 數據嘅 TypeScript type |
| `src/index.css` | Tailwind 入口 + global style |

**一頁一個功能**：每個 view 一個 file，只讀自己嗰個 JSON，互相唔依賴。加新功能 = `src/views/` 加一個 file + `App.tsx` nav 加一行。

### Sync + scripts（`scripts/`）

| File | 做咩 |
|------|------|
| `scripts/sync-vault.mjs` | 核心：scan vault → parse frontmatter → 寫 6 個 JSON 落 `public/data/`。加新 entity 跟住入面現有 pattern 抄 |
| `scripts/log-agent.mjs` | AI Office「著燈」：agent 做完嘢 append log，dashboard 顯示活動 |
| `scripts/security-audit.mjs` | 檢查 build 產物冇漏敏感嘢 |

### 數據 + 部署

| File / folder | 做咩 |
|------|------|
| `sample-vault/` | Demo 用 Obsidian vault（Harbour Lane 樣辦數據）— 想睇某個 view 要咩格式，入嚟抄 |
| `public/data/*.json` | sync 產物，frontend 直接 fetch。唔好手改，改 vault 再 sync |
| `.github/workflows/deploy.yml` | Push 上 main 就自動 build + deploy 上 GitHub Pages |
| `middleware.ts` | Security headers（Vercel deploy 先用到，GitHub Pages 唔行呢個） |
| `vite.config.ts` / `tailwind.config.js` / `tsconfig.json` | Build config，一般唔使掂 |

## 用 Codex 改呢個 project

Fork 咗之後，成個 codebase 就係你嘅。常見改法：

1. **加一個 view** — 叫 Codex：「跟 `src/views/TasksView.tsx` 嘅 pattern，加一個 Reading List view，數據喺 vault `reading/*.md` frontmatter」— 佢要改 `sync-vault.mjs`（加一個 sync function）+ `src/views/` 新 file + `App.tsx` nav
2. **改 vault 結構** — folder 名唔同？改 `sync-vault.mjs` 入面嘅 glob pattern 就得
3. **改樣** — Tailwind class 全部喺 view file 入面，逐個 view 改

## Scripts 一覽

| Command | 做咩 |
|------|------|
| `npm run dev` | Dev server（:5173） |
| `npm run sync:vault` | Vault → JSON |
| `npm run build` | Typecheck + production build 落 `dist/` |
| `npm run preview` | Serve `dist/`（:4173） |
| `npm run typecheck` | 淨 typecheck |
| `npm run test` | Scripts 嘅 node:test |
| `npm run security:audit` | Build 產物安全檢查 |
