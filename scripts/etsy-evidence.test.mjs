import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  ETSY_STATS_HEADERS,
  evidenceConfidence,
  parseCsv,
  parseNumericCell,
  summarizeNumeric,
  validateHeaders,
} from "../.agents/skills/mygiftstyle-etsy-growth-radar/scripts/evidence-core.mjs";

const execFileAsync = promisify(execFile);

test("parseNumericCell keeps explicit zero distinct from missing", () => {
  assert.deepEqual(parseNumericCell("0"), { status: "valid", value: 0 });
  assert.deepEqual(parseNumericCell(""), { status: "missing", value: null });
});

test("parseNumericCell flags invalid values instead of coercing them to zero", () => {
  assert.deepEqual(parseNumericCell("not-a-number"), { status: "invalid", value: null });
});

test("summarizeNumeric reports verified, partial, and invalid row counts", () => {
  assert.deepEqual(summarizeNumeric([{ Views: "2" }, { Views: "" }], "Views"), {
    value: 2,
    validRows: 1,
    missingRows: 1,
    invalidRows: 0,
    quality: "partial",
  });
  assert.equal(summarizeNumeric([{ Views: "bad" }], "Views").quality, "invalid");
});

test("validateHeaders names every missing required Etsy column", () => {
  const result = validateHeaders(["Listing ID", "Views"], ETSY_STATS_HEADERS);
  assert.equal(result.valid, false);
  assert.deepEqual(result.missing, [
    "Listing Name",
    "Visits",
    "Favorites",
    "Orders",
    "Revenue",
  ]);
});

test("parseCsv supports quoted commas and a UTF-8 BOM", () => {
  const parsed = parseCsv('\uFEFFListing ID,Listing Name,Views\n123,"Mom, Dad",5\n');
  assert.deepEqual(parsed.headers, ["Listing ID", "Listing Name", "Views"]);
  assert.equal(parsed.rows[0]["Listing Name"], "Mom, Dad");
});

test("confidence is dynamic and never high without valid first-party focus rows", () => {
  const clean = { value: 1, validRows: 1, missingRows: 0, invalidRows: 0, quality: "verified" };
  assert.equal(
    evidenceConfidence({ firstPartyStats: { valid: false }, focusRowsFound: false, numericSummaries: [] }),
    "Low",
  );
  assert.equal(
    evidenceConfidence({ firstPartyStats: { valid: true }, focusRowsFound: true, numericSummaries: [clean] }),
    "High",
  );
});

test("Growth Radar integration produces an owner-export manifest and High confidence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "etsy-evidence-v1-"));
  try {
    const listings = join(dir, "listings.csv");
    const stats = join(dir, "etsy-stats.csv");
    const searchTerms = join(dir, "search-terms.csv");
    const traffic = join(dir, "traffic.csv");
    const dashboard = join(dir, "decision.json");
    const evidence = join(dir, "evidence.json");
    const report = join(dir, "report.md");
    const agents = join(dir, "agents.json");

    await writeFile(
      listings,
      "Product Name,Product Link,Total Views,Total Favorites\nSame title,https://www.etsy.com/listing/111,4,0\nSame title,https://www.etsy.com/listing/222,5,1\n",
      "utf8",
    );
    await writeFile(
      stats,
      "Listing ID,Listing Name,Views,Visits,Favorites,Orders,Revenue\n111,Primary,10,8,1,1,49.95\n222,Duplicate,2,2,0,0,0\n",
      "utf8",
    );
    await writeFile(searchTerms, "owner-provided search terms", "utf8");
    await writeFile(traffic, "owner-provided traffic sources", "utf8");

    const script = fileURLToPath(
      new URL(
        "../.agents/skills/mygiftstyle-etsy-growth-radar/scripts/run-growth-radar.mjs",
        import.meta.url,
      ),
    );
    await execFileAsync(process.execPath, [
      script,
      "--listings",
      listings,
      "--etsy-stats",
      stats,
      "--search-terms",
      searchTerms,
      "--traffic-sources",
      traffic,
      "--coverage-start",
      "2026-07-01",
      "--coverage-end",
      "2026-07-31",
      "--as-of",
      "2026-07-31",
      "--dashboard",
      dashboard,
      "--evidence-output",
      evidence,
      "--report",
      report,
      "--agents",
      agents,
    ]);

    const result = JSON.parse(await readFile(dashboard, "utf8"));
    assert.equal(result.mode, "owner-export");
    assert.equal(result.evidenceInbox.completenessPct, 100);
    assert.equal(result.recommendation.confidence, "High");
    assert.equal(result.metrics.totalViews, 12);
    assert.equal(result.metrics.orders, 1);
    assert.equal(result.recommendation.liveActionAllowed, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
