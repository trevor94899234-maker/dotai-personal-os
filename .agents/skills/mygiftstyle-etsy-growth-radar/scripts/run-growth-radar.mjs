#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";

const EMPLOYEE_ID = "etsy-growth-radar";
const EMPLOYEE_NAME = "Etsy Growth Radar";
const EMPLOYEE_EMOJI = "🧭";

function localTimestamp() {
  const now = new Date();
  const part = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${part(now.getMonth() + 1)}-${part(now.getDate())}T${part(
    now.getHours(),
  )}:${part(now.getMinutes())}`;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      out[key.slice(2)] = true;
    } else {
      out[key.slice(2)] = value;
      i += 1;
    }
  }
  return out;
}

function usage() {
  return [
    "Usage:",
    "node run-growth-radar.mjs --listings <csv> --as-of YYYY-MM-DD",
    "  [--keywords <csv>] [--dashboard <json>] [--report <md>] [--agents <json>]",
  ].join("\n");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "").trim() : header.trim(),
  );
  return rows
    .slice(1)
    .filter((values) => values.some((value) => value.trim() !== ""))
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
    );
}

function numberValue(value) {
  const parsed = Number(String(value ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function listingId(url) {
  return String(url ?? "").match(/\/listing\/(\d+)/)?.[1] ?? "not-confirmed";
}

async function ensureParent(path) {
  await mkdir(dirname(path), { recursive: true });
}

async function updateAgent(path, status, outputCount, lastOutput = null) {
  await ensureParent(path);
  let rows = [];
  try {
    rows = JSON.parse(await readFile(path, "utf8"));
    if (!Array.isArray(rows)) rows = [];
  } catch {
    rows = [];
  }

  let row = rows.find((item) => item.id === EMPLOYEE_ID);
  if (!row) {
    row = {
      id: EMPLOYEE_ID,
      name: EMPLOYEE_NAME,
      emoji: EMPLOYEE_EMOJI,
      status: "idle",
      lastRun: null,
      outputCount: 0,
    };
    rows.push(row);
  }

  Object.assign(row, {
    name: EMPLOYEE_NAME,
    emoji: EMPLOYEE_EMOJI,
    status,
    lastRun: localTimestamp(),
    outputCount,
    lastOutput,
  });
  await writeFile(path, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
}

function markdownReport(decision) {
  const ids = decision.focus.listingIds.map((id) => `\`${id}\``).join("、");
  return `---
date: ${decision.evidenceAsOf}
type: etsy-growth-radar
status: historical-demo
tags: [etsy, demo, growth-radar, decision]
---

# MyGiftStyle Etsy Growth Radar - ${decision.evidenceAsOf}

## 一句總結

> 先補回 Etsy 第一方證據，再為最高訊號的重複標題群組製作定位分流草稿；本報告不授權任何 live Etsy 改動。

## 資料狀態

- 模式：歷史真實資料 Demo，並非即時店舖狀態
- Listing 來源：\`${decision.source.listingExport}\`
- Listing rows：${decision.source.listingRows}
- Keyword 來源：${decision.source.keywordExport ? `\`${decision.source.keywordExport}\`` : "未提供"}
- Keyword rows：${decision.source.keywordRows}
- Evidence as of：${decision.evidenceAsOf}
- 資料權威：${decision.source.authority}

## 店舖訊號

| 指標 | 結果 |
|---|---:|
| Listings | ${decision.metrics.listings} |
| Total views | ${decision.metrics.totalViews} |
| Zero-view listings | ${decision.metrics.zeroViewListings} |
| Zero-favorite listings | ${decision.metrics.zeroFavoriteListings} |
| Exact-title duplicate groups | ${decision.metrics.duplicateTitleGroups} |
| Listings inside duplicate groups | ${decision.metrics.duplicateListings} |

## 今日三個 Targets

### Revenue / Intent

${decision.targets.revenueIntent.detail}

### Evidence

${decision.targets.evidence.detail}

### Production

${decision.targets.production.detail}

## Focus cluster

- 標籤：${decision.focus.label}
- Listings：${ids}
- Combined views：${decision.focus.views}
- Combined favorites：${decision.focus.favorites}
- Title：${decision.focus.title}

## 建議決定

**${decision.recommendation.decision}**

${decision.recommendation.rationale.map((item) => `- ${item}`).join("\n")}

## 缺少資料

${decision.recommendation.missingInputs.map((item) => `- ${item}`).join("\n")}

## Confidence

${decision.recommendation.confidence}

## Owner approval gate

- 狀態：Pending
- 可批准：只批准定位分流 draft
- 不可視為批准：改 title、改 tags、改圖、改價、publish 或 ads

## 下一步

1. **建議：**由店主提供兩個 focus listings 的同一日期範圍 Etsy Stats。
2. 取得 first-party evidence 後，完成 primary lane 與 supporting lane 的分流草稿。
3. 未有 owner 明確批准前，不執行 live Etsy 改動。
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.listings || !args["as-of"]) {
    throw new Error(usage());
  }

  const cwd = process.cwd();
  const listingsPath = resolve(cwd, args.listings);
  const keywordsPath = args.keywords ? resolve(cwd, args.keywords) : null;
  const dashboardPath = resolve(cwd, args.dashboard ?? "public/data/etsy-decision.json");
  const reportPath = resolve(
    cwd,
    args.report ?? `demo-output/${args["as-of"]}-etsy-growth-radar.md`,
  );
  const agentsPath = resolve(cwd, args.agents ?? "public/data/agents.json");

  await updateAgent(agentsPath, "running", 0, null);

  try {
    const listings = parseCsv(await readFile(listingsPath, "utf8")).filter(
      (row) => row["Product Name"],
    );
    const keywords = keywordsPath
      ? parseCsv(await readFile(keywordsPath, "utf8")).filter((row) => row.Keyword)
      : [];

    if (listings.length === 0) {
      throw new Error("No compatible EverBee listing rows were found.");
    }

    const groups = new Map();
    for (const row of listings) {
      const title = row["Product Name"].trim();
      const group = groups.get(title) ?? [];
      group.push(row);
      groups.set(title, group);
    }

    const duplicates = [...groups.entries()]
      .filter(([, rows]) => rows.length > 1)
      .map(([title, rows]) => ({
        title,
        rows,
        views: rows.reduce((sum, row) => sum + numberValue(row["Total Views"]), 0),
        favorites: rows.reduce(
          (sum, row) => sum + numberValue(row["Total Favorites"]),
          0,
        ),
      }))
      .sort((a, b) => b.views - a.views || b.rows.length - a.rows.length);

    const focus = duplicates[0];
    if (!focus) {
      throw new Error("No exact-title duplicate group was found in the listing export.");
    }

    const reportRelative = relative(cwd, reportPath).replaceAll("\\", "/");
    const decision = {
      version: 1,
      mode: "historical-demo",
      title: "MyGiftStyle Etsy Decision OS",
      generatedAt: new Date().toISOString(),
      evidenceAsOf: args["as-of"],
      source: {
        listingExport: basename(listingsPath),
        listingRows: listings.length,
        keywordExport: keywordsPath ? basename(keywordsPath) : null,
        keywordRows: keywords.length,
        authority: "EverBee third-party historical snapshot",
        limitations: [
          "Not live Etsy data",
          "Estimated sales and conversion are not Etsy first-party facts",
          "Carts, buyer questions, orders, revenue, and search terms are missing",
        ],
      },
      metrics: {
        listings: listings.length,
        totalViews: listings.reduce(
          (sum, row) => sum + numberValue(row["Total Views"]),
          0,
        ),
        zeroViewListings: listings.filter(
          (row) => numberValue(row["Total Views"]) === 0,
        ).length,
        zeroFavoriteListings: listings.filter(
          (row) => numberValue(row["Total Favorites"]) === 0,
        ).length,
        duplicateTitleGroups: duplicates.length,
        duplicateListings: duplicates.reduce((sum, group) => sum + group.rows.length, 0),
      },
      focus: {
        label: "Cannibalization Risk",
        title: focus.title,
        listingIds: focus.rows.map((row) => listingId(row["Product Link"])),
        views: focus.views,
        favorites: focus.favorites,
        reason:
          "這組完全相同標題在所提供 snapshot 中有最高的 combined views，但未有 favorite 訊號。",
      },
      targets: {
        revenueIntent: {
          title: "保護現有最強意圖訊號",
          detail:
            "先聚焦最高 views 的完全相同標題群組；取得相同時段 Etsy 第一方證據前，不分拆或重寫 listing。",
        },
        evidence: {
          title: "補回 Etsy 第一方表現",
          detail:
            "以完全相同日期範圍，收集兩個 focus listings 的 views、visits、favorites、carts、orders、revenue、search terms 及 traffic source。",
        },
        production: {
          title: "只做一份定位分流 brief",
          detail:
            "草擬一個 primary Parents Memory Book Set lane 及一個清楚不同的 supporting lane；不 publish，也不修改 listings。",
        },
      },
      recommendation: {
        decision: "任何 live Etsy 改動前，需要更多第一方證據",
        confidence: "Medium",
        rationale: [
          `${focus.rows.length} 個 listings 使用完全相同的 title。`,
          `所提供 snapshot 顯示這組有 ${focus.views} combined views、${focus.favorites} favorites。`,
          "這個訊號可用來排序，但不足以作 conversion 或 pricing 結論。",
        ],
        missingInputs: [
          "兩個 listings 同一時段的 Etsy 第一方 views 與 visits",
          "Favorites、carts、buyer questions、orders 與 revenue",
          "Etsy search terms 與 traffic source",
          "目前 listing 狀態及任何 active test protection",
        ],
        liveActionAllowed: false,
      },
      ownerGate: {
        status: "pending",
        allowedActions: ["Approve draft only", "Need more evidence"],
        note:
          "Dashboard 選擇只是本機 Demo 狀態，不會修改 Etsy，也不是永久商業批准紀錄。",
      },
      reportPath: reportRelative,
    };

    await ensureParent(dashboardPath);
    await ensureParent(reportPath);
    await writeFile(dashboardPath, `${JSON.stringify(decision, null, 2)}\n`, "utf8");
    await writeFile(reportPath, markdownReport(decision), "utf8");
    await updateAgent(agentsPath, "done", 1, reportRelative);

    console.log(
      JSON.stringify(
        {
          status: "done",
          dashboard: dashboardPath,
          report: reportPath,
          focusListingIds: decision.focus.listingIds,
          metrics: decision.metrics,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await updateAgent(agentsPath, "error", 0, null);
    throw error;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
