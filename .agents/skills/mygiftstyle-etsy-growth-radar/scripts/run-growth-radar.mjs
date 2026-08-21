#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import {
  ETSY_STATS_HEADERS,
  EVERBEE_LISTING_HEADERS,
  countExplicitZero,
  evidenceConfidence,
  freshness,
  parseCsv,
  summarizeNumeric,
  validateHeaders,
} from "./evidence-core.mjs";

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
    "  [--keywords <csv>] [--etsy-stats <normalized-csv>]",
    "  [--search-terms <file>] [--traffic-sources <file>] [--share-and-save <file>]",
    "  [--coverage-start YYYY-MM-DD] [--coverage-end YYYY-MM-DD]",
    "  [--dashboard <json>] [--evidence-output <json>] [--report <md>] [--agents <json>]",
  ].join("\n");
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
  const evidenceRows = decision.evidenceInbox.files
    .map(
      (file) =>
        `| ${file.label} | ${file.received ? `\`${file.fileName}\`` : "Missing"} | ${file.authority} | ${file.validation} | ${file.usedInDecision ? "Yes" : "No"} |`,
    )
    .join("\n");
  const trustRows = decision.trustLedger
    .map(
      (item) =>
        `| ${item.label} | ${item.value ?? "Missing"} | ${item.authority} | ${item.quality} | ${item.quality === "missing" ? "n/a" : item.freshness} | ${item.source} |`,
    )
    .join("\n");
  return `---
date: ${decision.evidenceAsOf}
type: etsy-growth-radar
status: ${decision.mode}
tags: [etsy, growth-radar, evidence, decision]
---

# MyGiftStyle Etsy Growth Radar - ${decision.evidenceAsOf}

## 一句總結

> ${decision.recommendation.decision}；本報告不授權任何 live Etsy 改動。

## 資料狀態

- 模式：${decision.mode}
- Listing 來源：\`${decision.source.listingExport}\`
- Listing rows：${decision.source.listingRows}
- Keyword 來源：${decision.source.keywordExport ? `\`${decision.source.keywordExport}\`` : "未提供"}
- Keyword rows：${decision.source.keywordRows}
- Evidence as of：${decision.evidenceAsOf}
- 資料權威：${decision.source.authority}

## Evidence Inbox

- Coverage：${decision.evidenceInbox.coverageStart ?? "未提供"} 至 ${decision.evidenceInbox.coverageEnd}
- Completeness：${decision.evidenceInbox.completenessPct}%
- Missing types：${decision.evidenceInbox.missingTypes.join("、") || "None"}
- Invalid files：${decision.evidenceInbox.invalidFiles.join("、") || "None"}

| Evidence | File | Authority | Validation | Used in decision |
|---|---|---|---|---|
${evidenceRows}

## Trust Ledger

| Metric | Value | Authority | Quality | Freshness | Source |
|---|---:|---|---|---|---|
${trustRows}

## 店舖訊號

| 指標 | 結果 |
|---|---:|
| Listings | ${decision.metrics.listings} |
| Total views | ${decision.metrics.totalViews ?? "Missing"} |
| Zero-view listings | ${decision.metrics.zeroViewListings} |
| Zero-favorite listings | ${decision.metrics.zeroFavoriteListings} |
| Orders | ${decision.metrics.orders ?? "Missing"} |
| Revenue | ${decision.metrics.revenue ?? "Missing"} |
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

${decision.recommendation.missingInputs.length ? decision.recommendation.missingInputs.map((item) => `- ${item}`).join("\n") : "- None"}

## Confidence

${decision.recommendation.confidence}

## Owner approval gate

- 狀態：Pending
- 可批准：只批准定位分流 draft
- 不可視為批准：改 title、改 tags、改圖、改價、publish 或 ads

## 下一步

1. **建議：**先修正 Evidence Inbox 顯示的 missing 或 invalid inputs。
2. Evidence 完整後，再製作一份 owner-reviewed draft decision。
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
  const etsyStatsPath = args["etsy-stats"] ? resolve(cwd, args["etsy-stats"]) : null;
  const searchTermsPath = args["search-terms"] ? resolve(cwd, args["search-terms"]) : null;
  const trafficSourcesPath = args["traffic-sources"]
    ? resolve(cwd, args["traffic-sources"])
    : null;
  const shareAndSavePath = args["share-and-save"]
    ? resolve(cwd, args["share-and-save"])
    : null;
  const dashboardPath = resolve(cwd, args.dashboard ?? "public/data/etsy-decision.json");
  const evidenceOutputPath = resolve(
    cwd,
    args["evidence-output"] ?? "public/data/etsy-evidence.json",
  );
  const reportPath = resolve(
    cwd,
    args.report ?? `demo-output/${args["as-of"]}-etsy-growth-radar.md`,
  );
  const agentsPath = resolve(cwd, args.agents ?? "public/data/agents.json");

  await updateAgent(agentsPath, "running", 0, null);

  try {
    const listingCsv = parseCsv(await readFile(listingsPath, "utf8"));
    const listingValidation = validateHeaders(listingCsv.headers, EVERBEE_LISTING_HEADERS);
    if (!listingValidation.valid) {
      throw new Error(
        `EverBee listing CSV is missing required headers: ${listingValidation.missing.join(", ")}`,
      );
    }
    const listings = listingCsv.rows.filter((row) => row["Product Name"]);

    const keywordCsv = keywordsPath
      ? parseCsv(await readFile(keywordsPath, "utf8"))
      : { headers: [], rows: [] };
    const keywords = keywordCsv.rows.filter((row) => row.Keyword);

    const etsyStatsCsv = etsyStatsPath
      ? parseCsv(await readFile(etsyStatsPath, "utf8"))
      : { headers: [], rows: [] };
    const etsyStatsValidation = etsyStatsPath
      ? validateHeaders(etsyStatsCsv.headers, ETSY_STATS_HEADERS)
      : { valid: false, missing: ETSY_STATS_HEADERS };
    const etsyStatsRows = etsyStatsValidation.valid
      ? etsyStatsCsv.rows.filter((row) => String(row["Listing ID"] ?? "").trim())
      : [];

    for (const optionalPath of [searchTermsPath, trafficSourcesPath, shareAndSavePath]) {
      if (optionalPath) await access(optionalPath);
    }

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
        viewsSummary: summarizeNumeric(rows, "Total Views"),
        favoritesSummary: summarizeNumeric(rows, "Total Favorites"),
      }))
      .sort(
        (a, b) =>
          (b.viewsSummary.value ?? -1) - (a.viewsSummary.value ?? -1) ||
          b.rows.length - a.rows.length,
      );

    const focus = duplicates[0];
    if (!focus) {
      throw new Error("No exact-title duplicate group was found in the listing export.");
    }

    const focusListingIds = focus.rows.map((row) => listingId(row["Product Link"]));
    const firstPartyByListing = new Map(
      etsyStatsRows.map((row) => [String(row["Listing ID"]).trim(), row]),
    );
    const focusStatsRows = focusListingIds
      .map((id) => firstPartyByListing.get(id))
      .filter(Boolean);
    const focusRowsFound =
      etsyStatsValidation.valid &&
      focusListingIds.every((id) => id !== "not-confirmed" && firstPartyByListing.has(id));

    const usesFirstParty = etsyStatsValidation.valid && etsyStatsRows.length > 0;
    const metricRows = usesFirstParty ? etsyStatsRows : listings;
    const metricFields = usesFirstParty
      ? { views: "Views", favorites: "Favorites", orders: "Orders", revenue: "Revenue" }
      : {
          views: "Total Views",
          favorites: "Total Favorites",
          orders: null,
          revenue: null,
        };
    const viewsSummary = summarizeNumeric(metricRows, metricFields.views);
    const favoritesSummary = summarizeNumeric(metricRows, metricFields.favorites);
    const ordersSummary = metricFields.orders
      ? summarizeNumeric(metricRows, metricFields.orders)
      : { value: null, validRows: 0, missingRows: metricRows.length, invalidRows: 0, quality: "missing" };
    const revenueSummary = metricFields.revenue
      ? summarizeNumeric(metricRows, metricFields.revenue)
      : { value: null, validRows: 0, missingRows: metricRows.length, invalidRows: 0, quality: "missing" };

    const focusViewsSummary = focusRowsFound
      ? summarizeNumeric(focusStatsRows, "Views")
      : focus.viewsSummary;
    const focusFavoritesSummary = focusRowsFound
      ? summarizeNumeric(focusStatsRows, "Favorites")
      : focus.favoritesSummary;
    const focusNumericSummaries = focusRowsFound
      ? [
          summarizeNumeric(focusStatsRows, "Views"),
          summarizeNumeric(focusStatsRows, "Visits"),
          summarizeNumeric(focusStatsRows, "Favorites"),
          summarizeNumeric(focusStatsRows, "Orders"),
          summarizeNumeric(focusStatsRows, "Revenue"),
        ]
      : [];
    const confidence = evidenceConfidence({
      firstPartyStats: { valid: usesFirstParty },
      focusRowsFound,
      numericSummaries: focusNumericSummaries,
    });

    const makeEvidenceFile = ({
      id,
      label,
      path,
      authority,
      validation = path ? "intake-only" : "missing",
      missingHeaders = [],
      usedInDecision = false,
    }) => ({
      id,
      label,
      fileName: path ? basename(path) : null,
      received: Boolean(path),
      authority,
      validation,
      missingHeaders,
      usedInDecision,
    });

    const evidenceFiles = [
      makeEvidenceFile({
        id: "everbee-listings",
        label: "EverBee listing snapshot",
        path: listingsPath,
        authority: "third-party",
        validation: "valid",
        usedInDecision: true,
      }),
      makeEvidenceFile({
        id: "everbee-keywords",
        label: "Keyword context",
        path: keywordsPath,
        authority: "third-party",
        validation: keywordsPath ? (keywordCsv.headers.includes("Keyword") ? "valid" : "invalid") : "missing",
        missingHeaders: keywordsPath && !keywordCsv.headers.includes("Keyword") ? ["Keyword"] : [],
      }),
      makeEvidenceFile({
        id: "etsy-stats",
        label: "Normalized Etsy listing stats",
        path: etsyStatsPath,
        authority: "first-party",
        validation: etsyStatsPath ? (etsyStatsValidation.valid ? "valid" : "invalid") : "missing",
        missingHeaders: etsyStatsValidation.missing,
        usedInDecision: usesFirstParty,
      }),
      makeEvidenceFile({
        id: "etsy-search-terms",
        label: "Etsy search terms",
        path: searchTermsPath,
        authority: "first-party",
      }),
      makeEvidenceFile({
        id: "etsy-traffic-sources",
        label: "Etsy traffic sources",
        path: trafficSourcesPath,
        authority: "first-party",
      }),
      makeEvidenceFile({
        id: "share-and-save",
        label: "Share & Save",
        path: shareAndSavePath,
        authority: "first-party",
      }),
    ];

    const requiredEvidenceIds = [
      "everbee-listings",
      "etsy-stats",
      "etsy-search-terms",
      "etsy-traffic-sources",
    ];
    const requiredEvidence = evidenceFiles.filter((file) => requiredEvidenceIds.includes(file.id));
    const missingTypes = requiredEvidence
      .filter((file) => !file.received)
      .map((file) => file.label);
    const invalidFiles = evidenceFiles
      .filter((file) => file.received && file.validation === "invalid")
      .map((file) => file.label);
    const acceptedRequired = requiredEvidence.filter(
      (file) => file.received && file.validation !== "invalid",
    ).length;
    const evidenceInbox = {
      version: 1,
      coverageStart: args["coverage-start"] ?? null,
      coverageEnd: args["coverage-end"] ?? args["as-of"],
      evidenceAsOf: args["as-of"],
      completenessPct: Math.round((acceptedRequired / requiredEvidence.length) * 100),
      requiredEvidenceIds,
      missingTypes,
      invalidFiles,
      files: evidenceFiles,
    };

    const freshnessState = freshness(args["as-of"]);
    const metricAuthority = usesFirstParty ? "first-party" : "third-party";
    const metricSource = usesFirstParty ? basename(etsyStatsPath) : basename(listingsPath);
    const trustLedger = [
      {
        id: "total-views",
        label: "Total views",
        value: viewsSummary.value,
        authority: metricAuthority,
        quality: usesFirstParty ? viewsSummary.quality : "estimated",
        freshness: freshnessState.status,
        ageDays: freshnessState.ageDays,
        source: metricSource,
        note: usesFirstParty ? "Normalized owner-provided Etsy stats" : "EverBee context; not Etsy backend truth",
      },
      {
        id: "total-favorites",
        label: "Total favorites",
        value: favoritesSummary.value,
        authority: metricAuthority,
        quality: usesFirstParty ? favoritesSummary.quality : "estimated",
        freshness: freshnessState.status,
        ageDays: freshnessState.ageDays,
        source: metricSource,
        note: usesFirstParty ? "Explicit zero remains distinct from missing" : "EverBee context",
      },
      {
        id: "orders",
        label: "Orders",
        value: ordersSummary.value,
        authority: usesFirstParty ? "first-party" : "missing",
        quality: ordersSummary.quality,
        freshness: freshnessState.status,
        ageDays: freshnessState.ageDays,
        source: usesFirstParty ? metricSource : "Not provided",
        note: "Never inferred from EverBee estimated sales",
      },
      {
        id: "revenue",
        label: "Revenue",
        value: revenueSummary.value,
        authority: usesFirstParty ? "first-party" : "missing",
        quality: revenueSummary.quality,
        freshness: freshnessState.status,
        ageDays: freshnessState.ageDays,
        source: usesFirstParty ? metricSource : "Not provided",
        note: "Owner-provided Etsy value only",
      },
      {
        id: "duplicate-title-groups",
        label: "Duplicate title groups",
        value: duplicates.length,
        authority: "derived-third-party",
        quality: "diagnostic",
        freshness: freshnessState.status,
        ageDays: freshnessState.ageDays,
        source: basename(listingsPath),
        note: "Useful for prioritisation; not a conversion conclusion",
      },
    ];

    const missingInputs = [];
    if (!usesFirstParty) {
      missingInputs.push("Normalized Etsy first-party listing stats with the required v1 headers");
    } else if (!focusRowsFound) {
      missingInputs.push("First-party rows for every focus Listing ID");
    }
    if (usesFirstParty) {
      for (const [label, summary] of [
        ["Views", viewsSummary],
        ["Favorites", favoritesSummary],
        ["Orders", ordersSummary],
        ["Revenue", revenueSummary],
      ]) {
        if (summary.missingRows > 0 || summary.invalidRows > 0) {
          missingInputs.push(
            `${label}: ${summary.missingRows} missing row(s), ${summary.invalidRows} invalid row(s)`,
          );
        }
      }
    }
    if (!searchTermsPath) missingInputs.push("Etsy search terms for the same coverage period");
    if (!trafficSourcesPath) missingInputs.push("Etsy traffic sources for the same coverage period");
    if (!args["coverage-start"]) missingInputs.push("Coverage start date");
    missingInputs.push("Current active-test protection confirmation");

    const decisionText =
      confidence === "High"
        ? "第一方 listing evidence 已通過 v1 validation，可進入 draft-only decision review"
        : confidence === "Medium"
          ? "第一方 listing evidence 有 missing cells；修正後再進入 draft decision"
          : "任何 live Etsy 改動前，需要更多或更乾淨的第一方證據";

    const reportRelative = relative(cwd, reportPath).replaceAll("\\", "/");
    const decision = {
      version: 2,
      mode: usesFirstParty ? "owner-export" : "historical-demo",
      title: "MyGiftStyle Etsy Decision OS",
      generatedAt: new Date().toISOString(),
      evidenceAsOf: args["as-of"],
      evidenceInbox,
      trustLedger,
      source: {
        listingExport: basename(listingsPath),
        listingRows: listings.length,
        keywordExport: keywordsPath ? basename(keywordsPath) : null,
        keywordRows: keywords.length,
        etsyStatsExport: etsyStatsPath ? basename(etsyStatsPath) : null,
        etsyStatsRows: etsyStatsRows.length,
        authority: usesFirstParty
          ? "Owner-provided normalized Etsy first-party summary plus dated third-party context"
          : "EverBee third-party historical snapshot",
        limitations: usesFirstParty
          ? [
              "Normalized summary requires retained original Etsy evidence",
              "Intake-only files are recorded but not parsed into metric totals",
              "No live Etsy connection or write access",
            ]
          : [
              "Not live Etsy data",
              "Estimated sales and conversion are not Etsy first-party facts",
              "Orders and revenue are missing",
            ],
      },
      metrics: {
        listings: metricRows.length,
        totalViews: viewsSummary.value,
        totalFavorites: favoritesSummary.value,
        zeroViewListings: countExplicitZero(metricRows, metricFields.views),
        zeroFavoriteListings: countExplicitZero(metricRows, metricFields.favorites),
        orders: ordersSummary.value,
        revenue: revenueSummary.value,
        duplicateTitleGroups: duplicates.length,
        duplicateListings: duplicates.reduce((sum, group) => sum + group.rows.length, 0),
      },
      focus: {
        label: "Cannibalization Risk",
        title: focus.title,
        listingIds: focusListingIds,
        views: focusViewsSummary.value,
        favorites: focusFavoritesSummary.value,
        reason: focusRowsFound
          ? "重複標題群組已由同一 coverage period 的 normalized Etsy first-party rows補充。"
          : "這組由第三方 snapshot 排序；未有完整 first-party focus rows，不可作 conversion 結論。",
      },
      targets: {
        revenueIntent: {
          title: confidence === "High" ? "Review verified focus signal" : "保護現有最強意圖訊號",
          detail: focusRowsFound
            ? "只讀比較 focus listings 的 views、favorites、orders 與 revenue；仍不授權 live change。"
            : "先補齊 focus listings 的同期間 Etsy first-party rows，不分拆或重寫 listing。",
        },
        evidence: {
          title: `Evidence Inbox ${evidenceInbox.completenessPct}% complete`,
          detail: missingInputs.slice(0, 3).join("；") || "Required v1 evidence is complete.",
        },
        production: {
          title: confidence === "High" ? "準備一份 draft-only decision packet" : "暫停新的 listing production",
          detail:
            confidence === "High"
              ? "只整理 evidence、risk、rollback 與 owner gate；不 publish，也不修改 listings。"
              : "先修正 evidence debt；不以不完整資料起草新 title、price 或 SEO。",
        },
      },
      recommendation: {
        decision: decisionText,
        confidence,
        rationale: [
          `${focus.rows.length} 個 listings 使用完全相同的 title。`,
          `Focus signal source：${focusRowsFound ? "normalized Etsy first-party summary" : "EverBee third-party snapshot"}。`,
          `Evidence Inbox completeness：${evidenceInbox.completenessPct}%；invalid files：${invalidFiles.length}。`,
        ],
        missingInputs,
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
    await ensureParent(evidenceOutputPath);
    await ensureParent(reportPath);
    await writeFile(dashboardPath, `${JSON.stringify(decision, null, 2)}\n`, "utf8");
    await writeFile(evidenceOutputPath, `${JSON.stringify(evidenceInbox, null, 2)}\n`, "utf8");
    await writeFile(reportPath, markdownReport(decision), "utf8");
    await updateAgent(agentsPath, "done", 1, reportRelative);

    console.log(
      JSON.stringify(
        {
          status: "done",
          dashboard: dashboardPath,
          evidence: evidenceOutputPath,
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
