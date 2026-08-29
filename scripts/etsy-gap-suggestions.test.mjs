import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import test from "node:test";

const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));

async function suggestionCore() {
  const dir = await mkdtemp(join(tmpdir(), "etsy-gap-suggestions-"));
  const outfile = join(dir, "etsy-gap-suggestions.cjs");
  await build({
    entryPoints: [join(PROJECT_ROOT, "src", "lib", "etsyGapSuggestions.ts")],
    absWorkingDir: PROJECT_ROOT,
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile,
  });
  return import(`${pathToFileURL(outfile).href}?gap-suggestion=1`);
}

test("in-product gap suggestions create exactly 25 new, explainable hypotheses", async () => {
  const { createInProductGapSuggestion } = await suggestionCore();
  const result = createInProductGapSuggestion({
    context: { designId: "MD-1435", productId: "product-journal", roundId: "round-2", seedVersion: "short-intent-v2" },
    dimension: { id: "faith-identity", label: "Faith identity", definition: "Faith identity language relevant to the buyer and recipient." },
    productName: "Sample Printed Journal",
    recipient: "Pastor",
    occasion: "Pastor appreciation",
    usedQueries: ["pastor appreciation", "pastor gift journal", "pastor prayer journal", "Christian pastor gift", "pastor thank you"],
    supportRows: [
      { rowId: "support-1", phrase: "pastor appreciation gift", originatingQuery: "pastor appreciation", intentDimensionId: "appreciation-thank-you", researchQueryTaskId: "task-1", confirmedSearchVolume: 500, confirmedCompetition: 42 },
      { rowId: "support-2", phrase: "pastor gift journal", originatingQuery: "pastor gift journal", intentDimensionId: "gift-intent", researchQueryTaskId: "task-2", confirmedSearchVolume: null, confirmedCompetition: null },
    ],
  });
  assert.equal(result.origin, "in-product-suggestion");
  assert.deepEqual(result.context, { designId: "MD-1435", productId: "product-journal", roundId: "round-2", seedVersion: "short-intent-v2" });
  assert.equal(result.rawDrafts.length, 25);
  assert.equal(new Set(result.rawDrafts.map((draft) => draft.query)).size, 25);
  assert.ok(result.rawDrafts.every((draft) => draft.targetDimension === "faith-identity"));
  assert.ok(result.rawDrafts.every((draft) => draft.supportingRowIds.length === 1 && ["support-1", "support-2"].includes(draft.supportingRowIds[0])));
  assert.ok(result.rawDrafts.every((draft) => draft.extensionLogic.includes("pastor")));
  assert.ok(!result.rawDrafts.some((draft) => draft.query === "pastor prayer journal"));
  assert.match(result.rationale, /No eRank metric is inferred/);
});

test("gap label wins over the selected design recipient when generating the missing lane", async () => {
  const { createInProductGapSuggestion } = await suggestionCore();
  const result = createInProductGapSuggestion({
    context: { designId: "MD-1405", productId: "product-journal", roundId: "round-2", seedVersion: "short-intent-v2" },
    dimension: { id: "gap-worship-leader", label: "worship leader journal", definition: "A worship leader recipient gap." },
    productName: "Standard Printed Journal",
    recipient: "Mom",
    usedQueries: ["christian pastor journal", "faith leader journal", "scripture pastor journal", "worship leader journal"],
    supportRows: [{ rowId: "support-1", phrase: "pastor prayer journal", originatingQuery: "pastor prayer journal", intentDimensionId: "faith-identity", researchQueryTaskId: "task-1", confirmedSearchVolume: null, confirmedCompetition: null }],
  });
  assert.equal(result.rawDrafts.length, 25);
  assert.ok(result.rawDrafts.every((draft) => !draft.query.includes("mom")), "the missing gap must not inherit the selected design recipient");
  assert.ok(result.rawDrafts.every((draft) => draft.query.includes("worship leader")), "a named recipient gap should keep every candidate inside that lane");
});

test("in-product suggestions fail closed without an exact active context", async () => {
  const { createInProductGapSuggestion } = await suggestionCore();
  assert.throws(() => createInProductGapSuggestion({
    context: { designId: "MD-1435", productId: "product-journal", roundId: "", seedVersion: "short-intent-v2" },
    dimension: { id: "faith-identity", label: "Faith identity", definition: "Faith identity language." },
    usedQueries: [],
    supportRows: [{ rowId: "support-1", phrase: "pastor gift", originatingQuery: "pastor gift", intentDimensionId: "gift-intent", researchQueryTaskId: "task-1", confirmedSearchVolume: 500, confirmedCompetition: 42 }],
  }), /exact active research context/i);
});

test("Research workspace exposes the in-product path and keeps JSON as fallback", async () => {
  const source = await readFile(join(PROJECT_ROOT, "src", "components", "KeywordResearchWorkspace.tsx"), "utf8");
  assert.match(source, /createInProductGapSuggestion/);
  assert.match(source, /Suggest next 25 gap keywords/);
  assert.match(source, /Dashboard uses this exact round/);
  assert.match(source, /Current research focus/);
  assert.match(source, /Working design record/);
  assert.match(source, /frozen inputs/);
  assert.match(source, /JSON remains only as an advanced fallback/);
  assert.match(source, /origin: "manual-json"/);
  assert.match(source, /origin: suggestion\.origin/);
  assert.match(source, /no round or task/);
  const suggestionFlow = source.slice(source.indexOf("async function suggestNextGapKeywords"), source.indexOf("async function previewResearchResults"));
  assert.ok(suggestionFlow.indexOf('if (attempt.status !== "proposal-ready")') < suggestionFlow.indexOf("await commit(next"), "the in-product flow must validate successfully before IndexedDB persistence");
  assert.match(suggestionFlow, /nothing was saved/);
  const fallbackFlow = source.slice(source.indexOf("async function saveGapAnalysisAttempt"), source.indexOf("async function suggestNextGapKeywords"));
  assert.ok(fallbackFlow.indexOf('if (attempt.status !== "proposal-ready")') < fallbackFlow.indexOf("await commit(next"), "the fallback flow must validate successfully before IndexedDB persistence");
  assert.match(fallbackFlow, /input was preserved and nothing was saved/);

  const operations = await readFile(join(PROJECT_ROOT, "src", "lib", "etsyOperations.ts"), "utf8");
  assert.match(operations, /Support-row metrics belong to the researched support phrase/);
  assert.match(operations, /confirmedSearchVolume: null,[\s\S]*confirmedCompetition: null/);
});
