import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));
const requestedCase = process.argv.find((argument) => argument.startsWith("--case="))?.slice("--case=".length);
let corePromise;
let promptCorePromise;

async function core() {
  if (!corePromise) {
    const dir = await mkdtemp(join(tmpdir(), "research-results-inbox-core-"));
    const outfile = join(dir, "etsy-operations.cjs");
    corePromise = build({
      entryPoints: [join(PROJECT_ROOT, "src", "lib", "etsyOperations.ts")],
      absWorkingDir: PROJECT_ROOT,
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile,
    }).then(() => import(`${pathToFileURL(outfile).href}?focused=1`));
  }
  return corePromise;
}

async function promptCore() {
  if (!promptCorePromise) {
    const dir = await mkdtemp(join(tmpdir(), "research-stage-prompt-core-"));
    const outfile = join(dir, "etsy-prompt-package.cjs");
    promptCorePromise = build({
      entryPoints: [join(PROJECT_ROOT, "src", "lib", "etsyPromptPackage.ts")],
      absWorkingDir: PROJECT_ROOT,
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile,
    }).then(() => import(`${pathToFileURL(outfile).href}?focused=1`));
  }
  return promptCorePromise;
}

function baseState(source) {
  const state = structuredClone(source.DEFAULT_STATE);
  state.products = [{ id: "product-journal", name: "Sample Printed Journal", type: "Journal" }];
  state.designs = [
    { id: "MD-1435", name: "MD-1435", productId: "product-journal", recipient: "Pastor", occasion: "Pastor appreciation", mockupStatus: "ready", assetName: "md-1435.png", sourceNote: "synthetic fixture" },
    { id: "MD-other", name: "Other design", productId: "product-journal", recipient: "Pastor", occasion: "Thank you", mockupStatus: "ready", assetName: "other.png", sourceNote: "synthetic fixture" },
  ];
  return source.hydrateResearchResults(state);
}

function roundFixture(source, overrides = {}) {
  return source.createResearchRound({
    id: overrides.id ?? "round-1",
    designId: overrides.designId ?? "MD-1435",
    productId: overrides.productId ?? "product-journal",
    roundNumber: overrides.roundNumber ?? 1,
    seedVersion: overrides.seedVersion ?? source.SHORT_INTENT_V2_VERSION,
    seedSnapshot: overrides.seedSnapshot ?? [...source.SHORT_INTENT_V2_SEEDS],
    now: overrides.now ?? "2026-08-24T00:00:00.000Z",
  });
}

function artifactFixture(overrides = {}) {
  return {
    id: overrides.id ?? "artifact-1",
    kind: "keyword-research",
    source: overrides.source ?? "erank",
    authority: "supplemental",
    fileName: overrides.fileName ?? "erank.csv",
    mimeType: overrides.mimeType ?? "text/csv",
    uploadedAt: "2026-08-24T00:00:00.000Z",
    periodStart: overrides.sourceDate ?? "2026-08-20",
    periodEnd: overrides.sourceDate ?? "2026-08-20",
    targetType: "design",
    targetId: overrides.designId ?? "MD-1435",
    ownerConfirmed: overrides.ownerConfirmed ?? true,
    ocrStatus: overrides.ocrStatus ?? "not-needed",
    rows: 1,
    headers: ["Keyword", "Search Volume", "Competition", "Trend", "Relevance"],
    metrics: [],
    contentText: overrides.contentText ?? "pastor appreciation,120,30,5,90",
    researchRoundId: overrides.roundId ?? "round-1",
    researchSeedVersion: overrides.seedVersion ?? "short-intent-v2",
    researchOriginatingQueries: [overrides.originatingQuery ?? "pastor appreciation"],
    researchSourceDate: overrides.sourceDate ?? "2026-08-20",
  };
}

function rawRow(overrides = {}) {
  return {
    phrase: overrides.phrase ?? "pastor appreciation journal",
    searchVolume: overrides.searchVolume ?? "120",
    competition: overrides.competition ?? "30",
    trend: overrides.trend ?? "5",
    relevanceScore: overrides.relevanceScore ?? "90",
  };
}

function batchArtifactFixture(round, batch, overrides = {}) {
  const sourceDate = overrides.sourceDate ?? "2026-08-20";
  const mimeType = overrides.mimeType ?? "image/png";
  const id = overrides.id ?? `batch-artifact-${overrides.ordinal ?? 1}`;
  return {
    ...artifactFixture({
      id,
      roundId: round.id,
      designId: round.designId,
      sourceDate,
      fileName: overrides.fileName ?? `${id}.${mimeType.startsWith("image/") ? "png" : "csv"}`,
      mimeType,
      contentText: overrides.contentText ?? `${id},120,30,5,90`,
      ownerConfirmed: overrides.ownerConfirmed ?? !mimeType.startsWith("image/"),
      ocrStatus: overrides.ocrStatus ?? (mimeType.startsWith("image/") ? "pending" : "not-needed"),
    }),
    researchBatchId: batch.id,
    researchArtifactOrdinal: overrides.ordinal ?? 1,
    researchSeedIds: batch.selectedSeedIds,
    ...(overrides.seedOverrideId ? { researchSeedOverrideId: overrides.seedOverrideId } : {}),
    researchCapturedAt: overrides.captureAt ?? "2026-08-24T16:30:45.000Z",
    researchCapturedAtHk: overrides.captureAtHk ?? "2026-08-25 00:30:45 HKT",
    researchRawRecovery: overrides.rawRecovery ?? {
      kind: mimeType.startsWith("image/") ? "screenshot" : "text",
      persisted: true,
      ...(mimeType.startsWith("image/") ? { thumbnailDataUrl: "data:image/png;base64,fixture" } : {}),
      reattachAction: mimeType.startsWith("image/") ? "file" : "paste",
    },
    ...(mimeType.startsWith("image/") ? { dataUrl: overrides.dataUrl ?? "data:image/png;base64,fixture" } : {}),
  };
}

async function schemaMigration() {
  const source = await core();
  const legacy = structuredClone(source.DEFAULT_STATE);
  delete legacy.researchRounds;
  delete legacy.researchResultRows;
  delete legacy.researchDuplicateAuditEvents;
  delete legacy.researchQueryTasks;
  delete legacy.researchGapAnalysisAttempts;
  const hydrated = source.hydrateResearchResults(legacy);
  assert.deepEqual(hydrated.researchRounds, []);
  assert.deepEqual(hydrated.researchResultRows, []);
  assert.deepEqual(hydrated.researchDuplicateAuditEvents, []);
  assert.deepEqual(hydrated.researchQueryTasks, []);
  assert.deepEqual(hydrated.researchGapAnalysisAttempts, []);
  assert.equal(hydrated.version, 1);
  assert.strictEqual(hydrated.artifacts, legacy.artifacts);
  assert.strictEqual(source.hydrateResearchResults(hydrated), hydrated);

  const malformed = { ...legacy, researchRounds: { bad: true }, researchResultRows: "bad", researchDuplicateAuditEvents: 7 };
  const recovered = source.hydrateResearchResults(malformed);
  assert.deepEqual(recovered.researchRounds, []);
  assert.deepEqual(recovered.researchResultRows, []);
  assert.deepEqual(recovered.researchDuplicateAuditEvents, []);
  assert.equal(recovered.artifacts.length, legacy.artifacts.length);
  assert.ok(recovered.researchRecoveryErrors.length >= 3);
  assert.equal(recovered.researchRecoveryQuarantine.length, 3);
  assert.deepEqual(recovered.researchRecoveryQuarantine.find((item) => item.collection === "researchRounds").rawPayload, { bad: true });
  const reloadedRecovery = source.hydrateResearchResults(JSON.parse(JSON.stringify(recovered)));
  assert.deepEqual(reloadedRecovery.researchRecoveryQuarantine, recovered.researchRecoveryQuarantine);
  assert.equal(recovered.gates.length, legacy.gates.length);
}

async function seedLineage() {
  const source = await core();
  assert.deepEqual([...source.SHORT_INTENT_V2_SEEDS], [
    "pastor appreciation",
    "pastor gift journal",
    "pastor prayer journal",
    "Christian pastor gift",
    "pastor thank you",
  ]);
  const first = roundFixture(source);
  const second = roundFixture(source, { id: "round-2", roundNumber: 2 });
  assert.equal(first.seedVersion, "short-intent-v2");
  assert.deepEqual(first.seedSnapshot, [...source.SHORT_INTENT_V2_SEEDS]);
  assert.notStrictEqual(first.seedSnapshot, source.SHORT_INTENT_V2_SEEDS);
  assert.equal(first.status, "draft-preview");
  assert.equal(second.roundNumber, 2);
  assert.notEqual(first.id, second.id);
  assert.throws(() => roundFixture(source, { seedSnapshot: source.SHORT_INTENT_V2_SEEDS.slice(0, 4) }), /exactly five/i);
  assert.throws(() => roundFixture(source, { seedSnapshot: ["pastor appreciation", "pastor appreciation", "a", "b", "c"] }), /unique|fixed/i);
  assert.throws(() => roundFixture(source, { seedSnapshot: ["alternate", ...source.SHORT_INTENT_V2_SEEDS.slice(1)] }), /fixed/i);
}

async function normalizationTruth() {
  const source = await core();
  assert.deepEqual(source.normalizeResearchField("", "number"), { raw: "", parsed: null, status: "missing" });
  assert.deepEqual(source.normalizeResearchField("Unknown", "number"), { raw: "Unknown", parsed: null, status: "source-unknown" });
  assert.deepEqual(source.normalizeResearchField("-", "number"), { raw: "-", parsed: null, status: "source-unknown" });
  assert.deepEqual(source.normalizeResearchField("bad", "number"), { raw: "bad", parsed: null, status: "invalid" });
  assert.deepEqual(source.normalizeResearchField("0", "number"), { raw: "0", parsed: 0, status: "confirmed-zero" });
  assert.deepEqual(source.normalizeResearchField("12.5", "number"), { raw: "12.5", parsed: 12.5, status: "confirmed" });
  assert.equal(source.assessResearchFreshness("2026-08-20", undefined, "2026-08-24").freshness, "not-assessed");
  assert.equal(source.assessResearchFreshness("2026-08-01", { scope: "erank", maxAgeDays: 7, basis: "owner policy", effectiveDate: "2026-08-24" }, "2026-08-24").freshness, "stale");
  for (const date of ["", "not-a-date", "2026-08-25"]) {
    const assessment = source.assessResearchFreshness(date, undefined, "2026-08-24");
    assert.equal(assessment.eligible, false, `${date || "blank"} date must be ineligible`);
    assert.equal(assessment.sourceDate, date);
  }
  const ocr = source.normalizeResearchResultRow({
    id: "row-ocr",
    round: roundFixture(source),
    artifact: artifactFixture({ mimeType: "image/png", ownerConfirmed: true, ocrStatus: "confirmed" }),
    originatingQuery: "pastor appreciation",
    raw: rawRow(),
    ocrOnly: true,
    now: "2026-08-24T00:00:00.000Z",
  });
  assert.equal(ocr.flags.ocrOnly, true);
  assert.equal(ocr.flags.unconfirmed, true);
  assert.equal(source.isResearchRowEligible(ocr), false);
  const confirmed = source.confirmResearchOcrField(ocr, "searchVolume", "120", "owner", "2026-08-24T01:00:00.000Z");
  assert.deepEqual(confirmed.fieldConfirmations[0], { field: "searchVolume", rawFieldOrKey: "120", confirmedValue: 120, confirmedBy: "owner", confirmedAt: "2026-08-24T01:00:00.000Z" });
  let minimallyConfirmed = source.confirmResearchOcrField(ocr, "phrase", "Keyword", "owner", "2026-08-24T01:00:00.000Z");
  for (const field of ["searchVolume", "competition", "trend", "relevanceScore"]) minimallyConfirmed = source.confirmResearchOcrField(minimallyConfirmed, field, field, "owner", "2026-08-24T01:00:00.000Z");
  assert.equal(source.isResearchRowEligible(minimallyConfirmed), true);

  const optionalRaw = rawRow({ competition: "", trend: "", relevanceScore: "" });
  let optionalOcr = source.normalizeResearchResultRow({ id: "row-ocr-optional", round: roundFixture(source), artifact: artifactFixture({ mimeType: "image/png", ownerConfirmed: false }), originatingQuery: "pastor appreciation", raw: optionalRaw, ocrOnly: true, now: "2026-08-24T00:00:00.000Z" });
  optionalOcr = source.confirmResearchOcrField(optionalOcr, "phrase", "Keyword", "owner", "2026-08-24T01:00:00.000Z");
  optionalOcr = source.confirmResearchOcrField(optionalOcr, "searchVolume", "Search Volume", "owner", "2026-08-24T01:00:00.000Z");
  assert.equal(optionalOcr.competition.status, "missing");
  assert.equal(optionalOcr.flags.unconfirmed, false);
  assert.equal(source.isResearchRowEligible(optionalOcr), true);
  assert.equal(source.deriveResearchOpportunity([optionalOcr]), "supported", "an optional-header row can support opportunity without trend/relevance columns");

  const sourceDataRound = roundFixture(source);
  const sourceUnknownRow = source.normalizeResearchResultRow({
    id: "row-source-unknown",
    round: sourceDataRound,
    artifact: artifactFixture({ id: "source-unknown-artifact", ownerConfirmed: true }),
    originatingQuery: "pastor appreciation",
    raw: rawRow({ searchVolume: "Unknown", competition: "Unknown", trend: "", relevanceScore: "" }),
    now: "2026-08-24T00:00:00.000Z",
  });
  assert.equal(sourceUnknownRow.searchVolume.status, "source-unknown");
  assert.equal(sourceUnknownRow.competition.status, "source-unknown");
  assert.equal(source.isResearchRowEligible(sourceUnknownRow), false);
  const legacyState = baseState(source);
  legacyState.researchResultRows = [{
    ...sourceUnknownRow,
    searchVolume: { ...sourceUnknownRow.searchVolume, status: "invalid" },
    competition: { ...sourceUnknownRow.competition, status: "invalid" },
  }];
  const hydratedLegacy = source.hydrateResearchResults(legacyState);
  assert.equal(hydratedLegacy.researchResultRows[0].searchVolume.status, "source-unknown", "saved eRank Unknown values migrate away from invalid");
  assert.equal(hydratedLegacy.researchResultRows[0].competition.status, "source-unknown");
  const usableRow = source.normalizeResearchResultRow({
    id: "row-source-usable",
    round: sourceDataRound,
    artifact: artifactFixture({ id: "source-usable-artifact", ownerConfirmed: true }),
    originatingQuery: "pastor gift journal",
    raw: rawRow({ searchVolume: "578", competition: "37527", trend: "", relevanceScore: "" }),
    now: "2026-08-24T00:00:00.000Z",
  });
  const partialSourceDataConclusion = source.buildResearchCoachConclusion({ round: sourceDataRound, rows: [sourceUnknownRow, usableRow], buyerOccasionFit: "supported", productFit: "supported", opportunity: "supported", now: "2026-08-24T03:00:00.000Z" });
  assert.equal(partialSourceDataConclusion.decision, "retain", "source-reported Unknown rows should not block an otherwise eligible exact-context signal");
  assert.equal(partialSourceDataConclusion.blockingTruth.length, 0);
  assert.match(partialSourceDataConclusion.evidenceBasis.join(" "), /reported Unknown/);
}

async function localDateBoundary() {
  const source = await core();
  const utcPreviousDay = new Date("2026-08-24T16:30:00.000Z");
  const hongKongToday = source.hongKongCalendarDate(utcPreviousDay);
  assert.equal(hongKongToday, "2026-08-25", "Hong Kong calendar day must advance even while UTC remains on the prior date");
  assert.deepEqual(source.assessResearchFreshness("2026-08-25", undefined, hongKongToday), {
    sourceDate: "2026-08-25",
    ageDays: 0,
    freshness: "not-assessed",
    stale: false,
    eligible: true,
  });
  assert.equal(source.researchPastedScreenshotFileName("image/png", hongKongToday), "pasted-screenshot-2026-08-25.png");
  assert.equal(source.researchPastedScreenshotFileName("image/jpeg", hongKongToday), "pasted-screenshot-2026-08-25.jpg");
  const row = source.normalizeResearchResultRow({
    id: "row-hkt-boundary",
    round: roundFixture(source),
    artifact: artifactFixture({ sourceDate: "2026-08-25" }),
    originatingQuery: "pastor appreciation",
    raw: rawRow(),
    now: utcPreviousDay.toISOString(),
  });
  assert.equal(row.flags.sourceDateIssue, undefined, "normalization must use the Hong Kong calendar day rather than the UTC date prefix");
  assert.equal(row.flags.ageDays, 0);
}

async function truthRecompute() {
  const source = await core();
  const text = "Keyword,Search Volume,Competition,Trend,Relevance\npastor appreciation journal,0,bad,,88";
  const parsed = source.parseResearchDelimitedText(text, "erank");
  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0], rawRow({ searchVolume: "0", competition: "bad", trend: "", relevanceScore: "88" }));
  const row = source.normalizeResearchResultRow({ id: "row-recompute", round: roundFixture(source), artifact: artifactFixture({ contentText: text }), originatingQuery: "pastor appreciation", raw: parsed[0], now: "2026-08-24T00:00:00.000Z" });
  assert.equal(row.searchVolume.status, "confirmed-zero");
  assert.equal(row.competition.status, "invalid");
  assert.equal(row.trend.status, "missing");
  assert.equal(row.relevanceScore.parsed, 88);
  const independentlyExpected = {
    phrase: { raw: "pastor appreciation journal", parsed: "pastor appreciation journal", status: "confirmed" },
    searchVolume: { raw: "0", parsed: 0, status: "confirmed-zero" },
    competition: { raw: "bad", parsed: null, status: "invalid" },
    trend: { raw: "", parsed: null, status: "missing" },
    relevanceScore: { raw: "88", parsed: 88, status: "confirmed" },
  };
  for (const [field, expected] of Object.entries(independentlyExpected)) assert.deepEqual(row[field], expected);
  assert.deepEqual(source.parseResearchDelimitedText("Keyword,Search Volume\npastor journal,0", "erank"), [rawRow({ phrase: "pastor journal", searchVolume: "0", competition: "", trend: "", relevanceScore: "" })]);
  assert.deepEqual(source.parseResearchDelimitedText("Keyword,Search Trend,Avg. Searches,Avg. Clicks,Avg. CTR,Etsy Competition,KD,Google Searches\npastor gift journal,up,2400,120,5%,37200,10,2400", "erank"), [rawRow({ phrase: "pastor gift journal", searchVolume: "2400", competition: "37200", trend: "up", relevanceScore: "" })]);
  assert.deepEqual(source.parseResearchDelimitedText("Keywords,Avg Searches,Avg Clicks,Avg CTR,Etsy Competition,Keyword Difficulty,Google Searches\npastor gift,578,564,98%,37527,91,2400", "erank"), [rawRow({ phrase: "pastor gift", searchVolume: "578", competition: "37527", trend: "", relevanceScore: "" })]);
  assert.deepEqual(source.parseResearchDelimitedText("Phrase,Competition\npastor journal,bad", "everbee"), [rawRow({ phrase: "pastor journal", searchVolume: "", competition: "bad", trend: "", relevanceScore: "" })]);
  assert.throws(() => source.parseResearchDelimitedText("Keyword,Notes\npastor journal,no numeric signal", "erank"), /numeric signal/i);
  assert.throws(() => source.parseResearchDelimitedText("Search Volume\n10", "erank"), /phrase/i);
  assert.throws(() => source.assertResearchFixtureRows([{ Search: "missing known headers" }]), /header|fixture/i);
}

async function draftBatchSeedRecovery() {
  const source = await core();
  const firstRound = roundFixture(source);
  const driftedLedger = source.createResearchSeedLedger();
  const batch = source.createResearchBatch({ round: firstRound, selectedSeedIds: [firstRound.seedLedger[0].id] });
  const aligned = source.alignResearchBatchToRound({ ...batch, seedLedger: driftedLedger, selectedSeedIds: [driftedLedger[0].id] }, firstRound);
  assert.deepEqual(aligned.seedLedger, firstRound.seedLedger);
  assert.deepEqual(aligned.selectedSeedIds, [firstRound.seedLedger[0].id]);
  const wrong = { ...batch, seedLedger: source.createResearchSeedLedger(["wrong one", "wrong two", "wrong three", "wrong four", "wrong five"]) };
  assert.equal(source.alignResearchBatchToRound(wrong, firstRound), wrong, "a changed frozen tuple must remain blocked");
}

async function ocrTableCandidates() {
  const source = await core();
  const text = [
    "Keyword                 Search Volume  Etsy Competition  Relevance Score",
    "pastor appreciation journal  1,200          37,200            88",
    "pastor prayer journal        0              8,100             0",
  ].join("\n");
  const parsed = source.parseResearchDelimitedText(text, "erank");
  assert.deepEqual(parsed, [
    rawRow({ phrase: "pastor appreciation journal", searchVolume: "1,200", competition: "37,200", trend: "", relevanceScore: "88" }),
    rawRow({ phrase: "pastor prayer journal", searchVolume: "0", competition: "8,100", trend: "", relevanceScore: "0" }),
  ]);
  assert.throws(() => source.parseResearchDelimitedText("Keyword  Search Volume\npastor journal 120", "erank"), /visible column gaps/i);

  const candidate = source.normalizeResearchResultRow({
    id: "row-ocr-table",
    round: roundFixture(source),
    artifact: artifactFixture({ mimeType: "image/png", ownerConfirmed: false, ocrStatus: "confirmed", contentText: text }),
    originatingQuery: "pastor appreciation",
    raw: parsed[0],
    ocrOnly: true,
    now: "2026-08-24T00:00:00.000Z",
  });
  assert.equal(candidate.flags.ocrOnly, true);
  assert.equal(candidate.flags.unconfirmed, true);
  assert.equal(candidate.fieldConfirmations.length, 0);
  assert.equal(source.isResearchRowEligible(candidate), false, "parsed OCR candidates remain ineligible until the owner confirms each parsed field");
}

async function previewRecovery() {
  const source = await core();
  const context = { designId: "MD-1435", productId: "product-journal", roundId: "round-1", seedVersion: "short-intent-v2" };
  const preview = {
    context,
    source: "erank",
    sourceDate: "2026-08-20",
    originatingQuery: "pastor appreciation",
    inputKind: "csv",
    fileName: "erank.csv",
    rawText: "牧師,0",
    parsedRows: [rawRow({ searchVolume: "0" })],
    errors: [],
    needsOriginalBytes: false,
  };
  const restored = source.deserializeResearchPreview(source.serializeResearchPreview(preview));
  assert.deepEqual(restored, preview);
  assert.match(source.researchPreviewKey(context), /MD-1435.*round-1.*short-intent-v2/);
  assert.notEqual(source.researchPreviewKey(context), source.researchPreviewKey({ ...context, roundId: "round-2" }));
  assert.equal(source.deserializeResearchPreview("{bad"), null);
  const filePreview = { ...preview, inputKind: "xlsx", needsOriginalBytes: true };
  assert.equal(source.deserializeResearchPreview(source.serializeResearchPreview(filePreview)).needsOriginalBytes, true);

  const scopedErank = { scope: source.researchFreshnessPolicyScope("erank", "MD-1435", "product-journal"), maxAgeDays: 7, basis: "owner eRank policy", effectiveDate: "2026-08-24" };
  const scopedEverbee = { scope: source.researchFreshnessPolicyScope("everbee", "MD-1435", "product-journal"), maxAgeDays: 30, basis: "owner EverBee policy", effectiveDate: "2026-08-24" };
  const policies = source.upsertResearchFreshnessPolicy(source.upsertResearchFreshnessPolicy([], scopedErank), scopedEverbee);
  assert.deepEqual(source.researchFreshnessPolicyForContext(policies, "erank", "MD-1435", "product-journal"), scopedErank);
  assert.deepEqual(source.researchFreshnessPolicyForContext(policies, "everbee", "MD-1435", "product-journal"), scopedEverbee);
  assert.equal(source.researchFreshnessPolicyForContext(policies, "erank", "MD-other", "product-journal"), undefined);
  const previewWithPolicy = { ...preview, freshnessPolicy: scopedErank };
  assert.deepEqual(source.deserializeResearchPreview(source.serializeResearchPreview(previewWithPolicy)).freshnessPolicy, scopedErank);

  const recoveryItems = ["csv", "xlsx", "text", "screenshot"].map((inputKind, index) => ({ id: `preview-${index}`, inputKind, rawText: `owner-${inputKind}`, ...(index === 1 ? { error: "old save error" } : {}) }));
  const cleared = source.reduceResearchPreviewRecovery(recoveryItems, { type: "clear-save-error", id: "preview-1" });
  assert.equal(cleared[1].error, undefined);
  assert.equal(cleared[0].rawText, "owner-csv");
  const settled = await source.settleResearchPreviewAttempts(recoveryItems, async (item) => { if (item.inputKind === "xlsx") throw new Error("broken workbook"); });
  assert.deepEqual(settled.successfulIds, ["preview-0", "preview-2", "preview-3"]);
  assert.deepEqual(settled.failures, [{ id: "preview-1", error: "broken workbook" }]);
  assert.equal(recoveryItems[1].rawText, "owner-xlsx");
}

async function researchBatchArtifacts() {
  const source = await core();
  const round = roundFixture(source);
  let state = baseState(source);
  state.researchRounds = [round];
  const [firstSeed, secondSeed] = round.seedLedger;
  const batch = source.createResearchBatch({ id: "batch-round-1", round, selectedSeedIds: [firstSeed.id, secondSeed.id], now: "2026-08-24T16:30:45.000Z" });
  assert.equal(batch.createdAtHk, "2026-08-25 00:30:45 HKT");
  assert.deepEqual(batch.selectedSeedIds, [firstSeed.id, secondSeed.id], "one batch retains one-or-many ordered frozen seed IDs");

  const artifacts = Array.from({ length: 11 }, (_, index) => {
    const ordinal = index + 1;
    const seed = ordinal % 2 ? firstSeed : secondSeed;
    return batchArtifactFixture(round, batch, {
      id: `batch-artifact-${ordinal}`,
      ordinal,
      seedOverrideId: seed.id,
      fileName: ordinal === 11 ? "optional-export.csv" : `screenshot-${ordinal}.png`,
      mimeType: ordinal === 11 ? "text/csv" : "image/png",
      contentText: `unique raw artifact ${ordinal}`,
    });
  });
  const batchWithArtifacts = { ...batch, artifactIds: artifacts.map((artifact) => artifact.id) };
  for (const [index, artifact] of artifacts.entries()) {
    const seed = index % 2 ? secondSeed : firstSeed;
    const row = source.normalizeResearchResultRow({
      id: `batch-row-${index + 1}`,
      round,
      batch: batchWithArtifacts,
      artifact,
      originatingSeedId: seed.id,
      originatingQuery: seed.query,
      raw: rawRow({ phrase: `batch phrase ${index + 1}` }),
      ocrOnly: artifact.mimeType.startsWith("image/"),
      now: "2026-08-24T16:30:45.000Z",
    });
    const saved = source.saveResearchResultBatch(state, { round, batch: batchWithArtifacts, artifact, rows: [row], attemptedFileOrSource: artifact.fileName, now: "2026-08-24T16:30:45.000Z" });
    state = saved.state;
  }
  assert.equal(state.researchBatches.length, 1, "all siblings share one durable Results Inbox batch");
  assert.deepEqual(state.researchBatches[0].artifactIds, artifacts.map((artifact) => artifact.id));
  assert.deepEqual(state.artifacts.filter((artifact) => artifact.researchBatchId === batch.id).map((artifact) => artifact.researchArtifactOrdinal).sort((left, right) => left - right), Array.from({ length: 11 }, (_, index) => index + 1));
  assert.equal(state.artifacts.filter((artifact) => artifact.researchBatchId === batch.id && artifact.mimeType.startsWith("image/")).every((artifact) => artifact.researchRawRecovery?.thumbnailDataUrl && artifact.dataUrl), true, "each screenshot keeps a distinct persisted raw thumbnail/source");
  assert.equal(state.researchResultRows.every((row) => row.originatingSeedId === firstSeed.id || row.originatingSeedId === secondSeed.id), true, "every saved batch row has an exact frozen seed ID");

  const unmappedArtifact = batchArtifactFixture(round, batchWithArtifacts, { id: "batch-multi-inherited", ordinal: 12, fileName: "two-seed.csv", mimeType: "text/csv", contentText: "two seed raw" });
  const unmapped = source.normalizeResearchResultRow({ round, batch: batchWithArtifacts, artifact: unmappedArtifact, originatingQuery: firstSeed.query, raw: rawRow({ phrase: "needs explicit override" }), now: "2026-08-24T16:30:45.000Z" });
  assert.equal(unmapped.originatingSeedId, undefined);
  assert.equal(unmapped.flags.unmapped, true);
  assert.equal(source.isResearchRowEligible(unmapped), false, "a multi-seed inherited row is fail-closed until exact mapping");

  const exactDuplicateArtifact = batchArtifactFixture(round, batchWithArtifacts, { id: "duplicate-new-id", ordinal: 13, seedOverrideId: firstSeed.id, fileName: artifacts[0].fileName, mimeType: artifacts[0].mimeType, contentText: artifacts[0].contentText });
  const exactDuplicateRow = source.normalizeResearchResultRow({ round, batch: batchWithArtifacts, artifact: exactDuplicateArtifact, originatingSeedId: firstSeed.id, originatingQuery: firstSeed.query, raw: rawRow({ phrase: "batch phrase 1" }), ocrOnly: true, now: "2026-08-24T16:30:45.000Z" });
  const audited = source.saveResearchResultBatch(state, { round, batch: batchWithArtifacts, artifact: exactDuplicateArtifact, rows: [exactDuplicateRow], attemptedFileOrSource: exactDuplicateArtifact.fileName, now: "2026-08-24T16:31:00.000Z" });
  assert.equal(audited.state.researchResultRows.length, state.researchResultRows.length, "exact raw duplicate adds no second normalised row");
  assert.equal(audited.state.researchDuplicateAuditEvents.some((event) => event.kind === "artifact" && event.attemptedArtifactId === exactDuplicateArtifact.id), true);

  const conflictArtifact = batchArtifactFixture(round, batchWithArtifacts, { id: "batch-conflict", ordinal: 14, seedOverrideId: firstSeed.id, fileName: "changed.csv", mimeType: "text/csv", contentText: "changed raw" });
  const conflictRow = source.normalizeResearchResultRow({ round, batch: batchWithArtifacts, artifact: conflictArtifact, originatingSeedId: firstSeed.id, originatingQuery: firstSeed.query, raw: rawRow({ phrase: "batch phrase 1", searchVolume: "999" }), now: "2026-08-24T16:32:00.000Z" });
  const conflicted = source.saveResearchResultBatch(audited.state, { round: audited.state.researchRounds[0], batch: batchWithArtifacts, artifact: conflictArtifact, rows: [conflictRow], attemptedFileOrSource: conflictArtifact.fileName, now: "2026-08-24T16:32:00.000Z" });
  assert.equal(conflicted.state.researchBatches[0].status, "conflicting");
  assert.equal(conflicted.state.researchResultRows.filter((row) => row.lineageKey === conflictRow.lineageKey).every((row) => row.flags.conflicting), true, "changed lineage remains visible and blocks decisions");
}

async function discardSiblingLineage() {
  const source = await core();
  const round = roundFixture(source);
  let state = baseState(source);
  state.researchRounds = [round];
  const seed = round.seedLedger[0];
  const batch = source.createResearchBatch({ id: "discard-batch", round, selectedSeedIds: [seed.id], now: "2026-08-24T16:30:45.000Z" });
  const kept = batchArtifactFixture(round, batch, { id: "kept-preview", ordinal: 1, seedOverrideId: seed.id, fileName: "kept.csv", mimeType: "text/csv", contentText: "kept raw" });
  const discardedId = "discarded-preview";
  const previewBatch = { ...batch, artifactIds: [kept.id, discardedId] };
  const prunedBatch = source.removeResearchArtifactFromBatch(previewBatch, discardedId);
  assert.deepEqual(prunedBatch.artifactIds, [kept.id], "discard removes only the selected unsaved artifact from the preview batch");

  const row = source.normalizeResearchResultRow({
    id: "kept-row",
    round,
    batch: prunedBatch,
    artifact: kept,
    originatingSeedId: seed.id,
    originatingQuery: seed.query,
    raw: rawRow({ phrase: "kept preview phrase" }),
    now: "2026-08-24T16:30:45.000Z",
  });
  const saved = source.saveResearchResultBatch(state, {
    round,
    batch: prunedBatch,
    artifact: kept,
    rows: [row],
    attemptedFileOrSource: kept.fileName,
    now: "2026-08-24T16:30:45.000Z",
  });
  state = saved.state;
  assert.deepEqual(state.researchBatches[0].artifactIds, [kept.id], "saving one sibling never persists the discarded sibling ID");
  const tainted = {
    ...state,
    researchBatches: state.researchBatches.map((savedBatch) => ({ ...savedBatch, artifactIds: [kept.id, discardedId] })),
  };
  const reloaded = source.hydrateResearchResults(structuredClone(tainted));
  assert.deepEqual(reloaded.researchBatches[0].artifactIds, [kept.id], "reload preserves only the durable sibling lineage");
  assert.equal(reloaded.researchBatches[0].artifactIds.includes(discardedId), false);
}

async function captureTimeRecovery() {
  const source = await core();
  const round = roundFixture(source);
  let state = baseState(source);
  state.researchRounds = [round];
  const seed = round.seedLedger[0];
  const batch = source.createResearchBatch({ id: "capture-batch", round, selectedSeedIds: [seed.id], now: "2026-08-24T16:30:45.000Z" });
  const screenshot = batchArtifactFixture(round, batch, { id: "capture-shot", ordinal: 1, seedOverrideId: seed.id, sourceDate: "2026-08-20", captureAt: "2026-08-24T16:30:45.000Z", captureAtHk: "2026-08-25 00:30:45 HKT" });
  const visualSaved = source.saveResearchResultBatch(state, { round, batch: { ...batch, artifactIds: [screenshot.id] }, artifact: screenshot, rows: [], attemptedFileOrSource: screenshot.fileName, now: screenshot.researchCapturedAt });
  assert.equal(visualSaved.state.artifacts[0].researchCapturedAtHk, "2026-08-25 00:30:45 HKT");
  assert.equal(visualSaved.state.artifacts[0].researchSourceDate, "2026-08-20", "automatic capture time and editable measurement/source date remain distinct");
  const reloaded = source.hydrateResearchResults(structuredClone(visualSaved.state));
  assert.equal(reloaded.artifacts[0].researchRawRecovery.thumbnailDataUrl, "data:image/png;base64,fixture");
  assert.equal(reloaded.artifacts[0].dataUrl, "data:image/png;base64,fixture", "local raw screenshot survives reload-equivalent hydration");

  for (const [id, sourceDate] of [["blank", ""], ["malformed", "not-a-date"], ["future", "2026-08-26"]]) {
    const invalid = batchArtifactFixture(round, batch, { id, ordinal: 2, seedOverrideId: seed.id, sourceDate, fileName: `${id}.png` });
    assert.throws(() => source.saveResearchResultBatch(visualSaved.state, { round, batch, artifact: invalid, rows: [], attemptedFileOrSource: invalid.fileName, now: "2026-08-24T16:30:45.000Z" }), /source date|Correct/i, `${id} source dates fail closed without clearing saved siblings`);
  }
  const missingRaw = batchArtifactFixture(round, batch, { id: "missing-raw", ordinal: 3, seedOverrideId: seed.id, dataUrl: undefined, rawRecovery: { kind: "screenshot", persisted: false, reattachAction: "file", message: "Reattach this exact screenshot." } });
  assert.throws(() => source.saveResearchResultBatch(visualSaved.state, { round, batch, artifact: missingRaw, rows: [], attemptedFileOrSource: missingRaw.fileName }), /Reattach the original screenshot/i);
  assert.equal(visualSaved.state.artifacts.length, 1, "a failed raw-recovery sibling never removes the saved screenshot");
}

async function draftCoachNextRound() {
  const source = await core();
  const round1 = roundFixture(source);
  const round3 = roundFixture(source, { id: "round-3", roundNumber: 3 });
  const next = source.createNextResearchRound({ researchRounds: [round1, round3] }, { id: "round-4", designId: round1.designId, productId: round1.productId, now: "2026-08-24T18:00:00.000Z" });
  assert.equal(next.roundNumber, 4, "new round uses max persisted numeric history plus one rather than display position");
  assert.notEqual(next.seedLedger[0].id, round1.seedLedger[0].id, "new round gets a new frozen ledger and isolated context");
  const research = await readFile(join(PROJECT_ROOT, "src", "components", "KeywordResearchWorkspace.tsx"), "utf8");
  assert.match(research, /Save this valid Research Batch before Coach review/);
  assert.match(research, /Coach review is fail-closed/);
  assert.match(research, /!state\.researchRounds\.some\(\(round\) => round\.id === activeResearchRound\.id\)/);
  assert.match(research, /createNextResearchRound\(state, \{ id: `draft-/);
  assert.match(research, /Save or discard the current editable Research Batch before opening a new round/);

  const context1 = { designId: round1.designId, productId: round1.productId, roundId: round1.id, seedVersion: round1.seedVersion };
  const retained = { ...round1, status: "conclusion-ready", conclusion: { decision: "retain", buyerProductFit: "supported", evidenceBasis: ["fixture"], blockingTruth: [], nextAction: "approve", reviewSignal: "gate" } };
  let approved = source.approveResearchRound({ ...baseState(source), researchRounds: [retained] }, context1, "gate-1", "2026-08-24T17:00:00.000Z");
  approved = { ...approved, researchRounds: [next, ...approved.researchRounds] };
  assert.equal(source.isLatestResearchContext(approved, context1), false);
  assert.equal(source.deriveListingBriefSurfaceAccess(approved, context1.designId, context1.productId).exactApproved, false, "the isolated next round immediately relocks visible Listing Brief access");
}

async function ocrFetchRejection() {
  const source = await core();
  const outcome = await source.runBoundedResearchOcr({
    attemptId: "fetch-rejection",
    image: "data:image/png;base64,broken",
    timeoutMs: 25,
    now: () => "2026-08-24T08:00:00.000Z",
    createWorker: async () => { throw new TypeError("Failed to fetch"); },
  });
  assert.equal(outcome.lifecycle.status, "visual-review-only");
  assert.equal(outcome.lifecycle.failureReason, "worker-load-failed");
  assert.match(outcome.lifecycle.message, /worker|assets/i);
  assert.equal(outcome.text, "");
}

async function ocrNeverSettlingWorker() {
  const source = await core();
  let terminateCount = 0;
  const worker = {
    recognize: async () => new Promise(() => {}),
    terminate: async () => { terminateCount += 1; },
  };
  const startedAt = Date.now();
  const outcome = await source.runBoundedResearchOcr({ attemptId: "never-settles", image: "image", timeoutMs: 20, createWorker: async () => worker });
  assert.equal(outcome.lifecycle.status, "visual-review-only");
  assert.equal(outcome.lifecycle.failureReason, "timed-out");
  assert.equal(terminateCount, 1, "a created non-settling worker must be terminated");
  assert.ok(Date.now() - startedAt < 500, "the OCR lifecycle must settle within a bounded test window");
}

async function ocrLateResolve() {
  const source = await core();
  let resolveRecognition;
  let terminateCount = 0;
  const recognition = new Promise((resolve) => { resolveRecognition = resolve; });
  const outcome = await source.runBoundedResearchOcr({
    attemptId: "late-recognition",
    image: "image",
    timeoutMs: 20,
    createWorker: async () => ({ recognize: async () => recognition, terminate: async () => { terminateCount += 1; } }),
  });
  assert.equal(outcome.lifecycle.status, "visual-review-only");
  assert.equal(outcome.lifecycle.failureReason, "timed-out");
  resolveRecognition({ data: { text: "Keyword,Search Volume\nlate result,999" } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(outcome.lifecycle.status, "visual-review-only", "late OCR completion cannot replace the terminal outcome");
  assert.equal(outcome.text, "");
  assert.equal(terminateCount, 1);

  let resolveWorker;
  let lateWorkerTerminations = 0;
  const lateWorkerPromise = new Promise((resolve) => { resolveWorker = resolve; });
  const lateWorkerOutcome = await source.runBoundedResearchOcr({ attemptId: "late-worker", image: "image", timeoutMs: 20, createWorker: async () => lateWorkerPromise });
  resolveWorker({ recognize: async () => ({ data: { text: "too late" } }), terminate: async () => { lateWorkerTerminations += 1; } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(lateWorkerOutcome.lifecycle.failureReason, "timed-out");
  assert.equal(lateWorkerTerminations, 1, "a worker created after timeout must be terminated without applying its result");
}

async function ocrSiblingRecovery() {
  const source = await core();
  let validSiblingSettled = false;
  let screenshotSettled = false;
  const items = [{ id: "failing-screenshot", kind: "screenshot" }, { id: "valid-csv", kind: "csv" }];
  const settling = source.settleResearchPreviewAttempts(items, async (item) => {
    if (item.kind === "csv") { validSiblingSettled = true; return; }
    const outcome = await source.runBoundedResearchOcr({
      attemptId: item.id,
      image: "image",
      timeoutMs: 25,
      createWorker: async () => ({ recognize: async () => new Promise(() => {}), terminate: async () => {} }),
    });
    screenshotSettled = outcome.lifecycle.status === "visual-review-only";
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(validSiblingSettled, true, "a valid sibling must settle while screenshot OCR is pending");
  assert.equal(screenshotSettled, false);
  const result = await settling;
  assert.deepEqual(result.successfulIds, ["failing-screenshot", "valid-csv"]);
  assert.equal(screenshotSettled, true);
}

async function ocrPreviewRoundTrip() {
  const source = await core();
  const preview = {
    id: "preview-visual",
    context: { designId: "MD-1435", productId: "product-journal", roundId: "round-1", seedVersion: "short-intent-v2" },
    source: "erank",
    sourceDate: "2026-08-20",
    originatingQuery: "pastor appreciation",
    inputKind: "screenshot",
    fileName: "failed-screenshot.png",
    rawText: "owner preserved OCR repair text",
    parsedRows: [],
    fieldConfirmations: {},
    freshnessPolicy: { scope: "erank:MD-1435:product-journal", maxAgeDays: 7, basis: "owner policy", effectiveDate: "2026-08-24" },
    ocrOnly: true,
    visualReviewOnly: true,
    needsOriginalBytes: true,
    ocrLifecycle: { status: "visual-review-only", attemptId: "preview-visual:1", completedAt: "2026-08-24T08:00:00.000Z", failureReason: "worker-load-failed", message: "OCR worker or language assets could not load." },
  };
  const restored = source.deserializeResearchPreview(source.serializeResearchPreview(preview));
  assert.deepEqual(restored, preview);
  assert.equal(restored.needsOriginalBytes, true, "reload must request screenshot reattachment while preserving all serializable context");
  assert.equal(restored.fieldConfirmations && Object.keys(restored.fieldConfirmations).length, 0);
}

async function ocrVisualOnlySave() {
  const source = await core();
  const round = roundFixture(source);
  let state = baseState(source);
  state.researchRounds = [round];
  const artifact = artifactFixture({ id: "visual-artifact", fileName: "failed.png", mimeType: "image/png", ownerConfirmed: true, ocrStatus: "unreadable", contentText: "owner preserved raw text" });
  artifact.rows = 0;
  artifact.headers = [];
  artifact.metrics = [];
  const saved = source.saveResearchResultBatch(state, { round, artifact, rows: [], attemptedFileOrSource: artifact.fileName, now: "2026-08-24T08:00:00.000Z" });
  assert.equal(saved.state.artifacts.some((item) => item.id === artifact.id && item.ocrStatus === "unreadable" && item.ownerConfirmed), true);
  assert.equal(saved.state.researchResultRows.length, 0, "visual-review-only save creates zero normalized rows and therefore zero confirmations");
  assert.equal(source.deriveResearchOpportunity(saved.state.researchResultRows), "missing");
  const conclusion = source.buildResearchCoachConclusion({ round: saved.state.researchRounds[0], rows: saved.state.researchResultRows, buyerOccasionFit: "supported", productFit: "supported", opportunity: "missing", now: "2026-08-24T08:01:00.000Z" });
  assert.equal(conclusion.decision, "next-round");
  assert.match(conclusion.blockingTruth.join(" "), /No saved result rows|opportunity signal/i);
  assert.throws(() => source.approveResearchRound(saved.state, { designId: round.designId, productId: round.productId, roundId: round.id, seedVersion: round.seedVersion }), /eligible retain/i);
  assert.equal(source.isListingBriefEligibleForResearchContext(saved.state, { designId: round.designId, productId: round.productId, roundId: round.id, seedVersion: round.seedVersion }), false);
}

async function ocrRetrySuccess() {
  const source = await core();
  const outcome = await source.runBoundedResearchOcr({
    attemptId: "retry-success",
    image: "image",
    timeoutMs: 25,
    createWorker: async () => ({ recognize: async () => ({ data: { text: "Keyword,Search Volume\npastor appreciation journal,120" } }), terminate: async () => {} }),
  });
  assert.equal(outcome.lifecycle.status, "succeeded");
  const parsed = source.parseResearchDelimitedText(outcome.text, "erank");
  const round = roundFixture(source);
  const artifact = artifactFixture({ id: "retry-artifact", fileName: "retry.png", mimeType: "image/png", ownerConfirmed: false, ocrStatus: "pending", contentText: outcome.text });
  let row = source.normalizeResearchResultRow({ id: "retry-row", round, artifact, originatingQuery: "pastor appreciation", raw: parsed[0], ocrOnly: true, fieldConfirmations: [], now: "2026-08-24T09:00:00.000Z" });
  assert.equal(row.flags.ocrOnly, true);
  assert.equal(row.flags.unconfirmed, true);
  assert.equal(row.fieldConfirmations.length, 0);
  assert.equal(source.isResearchRowEligible(row), false, "retry success remains OCR-only/unconfirmed until field confirmation");
  for (const field of ["phrase", "searchVolume"]) row = source.confirmResearchOcrField(row, field, field, "owner", "2026-08-24T09:01:00.000Z");
  assert.equal(source.isResearchRowEligible(row), true, "explicit field confirmation is the only OCR eligibility transition");
}

async function duplicateConflict() {
  const source = await core();
  const round = roundFixture(source);
  let state = baseState(source);
  state.researchRounds = [round];
  const firstArtifact = artifactFixture();
  const firstRow = source.normalizeResearchResultRow({ id: "row-1", round, artifact: firstArtifact, originatingQuery: "pastor appreciation", raw: rawRow(), now: "2026-08-24T00:00:00.000Z" });
  let result = source.saveResearchResultBatch(state, { round, artifact: firstArtifact, rows: [firstRow], attemptedFileOrSource: "erank.csv", now: "2026-08-24T00:00:00.000Z" });
  assert.equal(result.state.researchResultRows.length, 1);
  assert.equal(result.state.artifacts.filter((item) => item.id === firstArtifact.id).length, 1);

  const duplicateArtifact = artifactFixture({ id: "artifact-duplicate", fileName: "same.csv" });
  const duplicateRow = source.normalizeResearchResultRow({ id: "row-duplicate", round, artifact: duplicateArtifact, originatingQuery: "pastor appreciation", raw: rawRow(), now: "2026-08-24T01:00:00.000Z" });
  result = source.saveResearchResultBatch(result.state, { round, artifact: duplicateArtifact, rows: [duplicateRow], attemptedFileOrSource: "same.csv", now: "2026-08-24T01:00:00.000Z" });
  assert.equal(result.state.researchResultRows.length, 1);
  assert.equal(result.state.artifacts.some((item) => item.id === duplicateArtifact.id), false);
  assert.equal(result.state.researchDuplicateAuditEvents[0].existingRowId, "row-1");
  assert.equal(result.state.researchDuplicateAuditEvents[0].occurrenceCount, 1);
  assert.equal(result.savedCount, 0);
  assert.equal(result.duplicateCount, 1);

  result.state.researchRounds = result.state.researchRounds.map((item) => item.id === round.id ? { ...item, status: "owner-approved", ownerGateId: "gate-1" } : item);
  const approvedDuplicate = source.saveResearchResultBatch(result.state, { round: result.state.researchRounds[0], artifact: artifactFixture({ id: "artifact-duplicate-again", fileName: "same-again.csv" }), rows: [duplicateRow], attemptedFileOrSource: "same-again.csv", now: "2026-08-24T01:30:00.000Z" });
  assert.equal(approvedDuplicate.state.researchRounds[0].status, "owner-approved");
  assert.equal(approvedDuplicate.state.researchDuplicateAuditEvents[0].occurrenceCount, 2);
  result = approvedDuplicate;

  const conflictArtifact = artifactFixture({ id: "artifact-conflict", fileName: "changed.csv" });
  const conflictRow = source.normalizeResearchResultRow({ id: "row-conflict", round, artifact: conflictArtifact, originatingQuery: "pastor appreciation", raw: rawRow({ searchVolume: "121" }), now: "2026-08-24T02:00:00.000Z" });
  result = source.saveResearchResultBatch(result.state, { round, artifact: conflictArtifact, rows: [conflictRow], attemptedFileOrSource: "changed.csv", now: "2026-08-24T02:00:00.000Z" });
  assert.equal(result.state.researchResultRows.length, 2);
  assert.equal(result.state.artifacts.some((item) => item.id === conflictArtifact.id), true);
  assert.ok(result.state.researchResultRows.every((item) => item.flags.conflicting));
  assert.equal(result.state.researchRounds[0].status, "next-round-needed");
  assert.equal(result.state.researchRounds[0].ownerGateId, undefined);

  const upgradeRound = roundFixture(source, { id: "round-upgrade" });
  let upgradeState = baseState(source);
  upgradeState.researchRounds = [upgradeRound];
  const unconfirmedArtifact = artifactFixture({ id: "artifact-ocr-unconfirmed", roundId: upgradeRound.id, fileName: "visual.png", mimeType: "image/png", ownerConfirmed: false, ocrStatus: "pending" });
  const unconfirmedRow = source.normalizeResearchResultRow({ id: "row-ocr-unconfirmed", round: upgradeRound, artifact: unconfirmedArtifact, originatingQuery: "pastor appreciation", raw: rawRow(), ocrOnly: true, now: "2026-08-24T03:00:00.000Z" });
  let upgraded = source.saveResearchResultBatch(upgradeState, { round: upgradeRound, artifact: unconfirmedArtifact, rows: [unconfirmedRow], attemptedFileOrSource: "visual.png", now: "2026-08-24T03:00:00.000Z" });
  const structuredArtifact = artifactFixture({ id: "artifact-structured-upgrade", roundId: upgradeRound.id, fileName: "verified.csv", mimeType: "text/csv", ownerConfirmed: true });
  const structuredRow = source.normalizeResearchResultRow({ id: "row-structured-upgrade", round: upgradeRound, artifact: structuredArtifact, originatingQuery: "pastor appreciation", raw: rawRow(), now: "2026-08-24T04:00:00.000Z" });
  upgraded = source.saveResearchResultBatch(upgraded.state, { round: upgraded.state.researchRounds[0], artifact: structuredArtifact, rows: [structuredRow], attemptedFileOrSource: "verified.csv", now: "2026-08-24T04:00:00.000Z" });
  assert.equal(upgraded.state.researchResultRows.length, 2, "structured same-value evidence must not be swallowed by earlier OCR");
  assert.equal(upgraded.state.artifacts.some((item) => item.id === unconfirmedArtifact.id), true, "the original visual artifact remains auditable");
  assert.equal(upgraded.state.artifacts.some((item) => item.id === structuredArtifact.id), true, "the structured export keeps its own artifact lineage");
  assert.equal(upgraded.state.researchResultRows.find((item) => item.id === unconfirmedRow.id).supersededByRowId, structuredRow.id);
  assert.equal(upgraded.state.researchResultRows.find((item) => item.id === structuredRow.id).supersededByRowId, undefined);
  assert.equal(upgraded.state.researchResultRows.some((item) => item.flags.conflicting), false, "same normalized values at higher quality are an upgrade, not a conflict");
  assert.equal(source.isResearchRowEligible(upgraded.state.researchResultRows.find((item) => item.id === structuredRow.id)), true);
  assert.equal(source.deriveResearchOpportunity(upgraded.state.researchResultRows), "supported");
  const upgradeConclusion = source.buildResearchCoachConclusion({ round: upgraded.state.researchRounds[0], rows: upgraded.state.researchResultRows, buyerOccasionFit: "supported", productFit: "supported", opportunity: "supported", now: "2026-08-24T04:30:00.000Z" });
  assert.equal(upgradeConclusion.decision, "retain", "the superseded OCR blocker must not mask the eligible structured row");
  assert.deepEqual(upgradeConclusion.blockingTruth, []);
  upgraded.state.researchRounds = upgraded.state.researchRounds.map((item) => item.id === upgradeRound.id ? { ...item, status: "conclusion-ready", conclusion: upgradeConclusion } : item);
  upgraded.state = source.approveResearchRound(upgraded.state, { designId: upgradeRound.designId, productId: upgradeRound.productId, roundId: upgradeRound.id, seedVersion: upgradeRound.seedVersion }, "gate-upgrade", "2026-08-24T05:00:00.000Z");
  assert.equal(source.isListingBriefEligibleForResearchContext(upgraded.state, { designId: upgradeRound.designId, productId: upgradeRound.productId, roundId: upgradeRound.id, seedVersion: upgradeRound.seedVersion }), true);

  const confirmedRound = roundFixture(source, { id: "round-confirmed-ocr" });
  let confirmedState = baseState(source);
  confirmedState.researchRounds = [confirmedRound];
  const firstOcrArtifact = artifactFixture({ id: "artifact-first-ocr", roundId: confirmedRound.id, fileName: "first.png", mimeType: "image/png", ownerConfirmed: false, ocrStatus: "pending" });
  const firstOcrRow = source.normalizeResearchResultRow({ id: "row-first-ocr", round: confirmedRound, artifact: firstOcrArtifact, originatingQuery: "pastor appreciation", raw: rawRow(), ocrOnly: true, now: "2026-08-24T06:00:00.000Z" });
  let confirmedUpgrade = source.saveResearchResultBatch(confirmedState, { round: confirmedRound, artifact: firstOcrArtifact, rows: [firstOcrRow], attemptedFileOrSource: "first.png", now: "2026-08-24T06:00:00.000Z" });
  const confirmedOcrArtifact = artifactFixture({ id: "artifact-confirmed-ocr", roundId: confirmedRound.id, fileName: "confirmed.png", mimeType: "image/png", ownerConfirmed: true, ocrStatus: "confirmed" });
  let confirmedOcrRow = source.normalizeResearchResultRow({ id: "row-confirmed-ocr", round: confirmedRound, artifact: confirmedOcrArtifact, originatingQuery: "pastor appreciation", raw: rawRow(), ocrOnly: true, now: "2026-08-24T07:00:00.000Z" });
  for (const field of ["phrase", "searchVolume", "competition", "trend", "relevanceScore"]) confirmedOcrRow = source.confirmResearchOcrField(confirmedOcrRow, field, field, "owner", "2026-08-24T07:15:00.000Z");
  confirmedUpgrade = source.saveResearchResultBatch(confirmedUpgrade.state, { round: confirmedUpgrade.state.researchRounds[0], artifact: confirmedOcrArtifact, rows: [confirmedOcrRow], attemptedFileOrSource: "confirmed.png", now: "2026-08-24T07:30:00.000Z" });
  assert.equal(confirmedUpgrade.state.researchResultRows.length, 2, "fully confirmed OCR must not be swallowed by an earlier unconfirmed OCR row");
  assert.equal(confirmedUpgrade.state.researchResultRows.find((item) => item.id === firstOcrRow.id).supersededByRowId, confirmedOcrRow.id);
  assert.equal(source.isResearchRowEligible(confirmedUpgrade.state.researchResultRows.find((item) => item.id === confirmedOcrRow.id)), true);
  assert.equal(confirmedUpgrade.state.artifacts.some((item) => item.id === firstOcrArtifact.id), true);
  assert.equal(confirmedUpgrade.state.artifacts.some((item) => item.id === confirmedOcrArtifact.id), true);
}

async function lineageIsolation() {
  const source = await core();
  const round1 = roundFixture(source);
  const round2 = roundFixture(source, { id: "round-2", roundNumber: 2 });
  const wrongDesign = roundFixture(source, { id: "round-other", designId: "MD-other" });
  const rows = [round1, round2, wrongDesign].map((round, index) => source.normalizeResearchResultRow({ id: `row-${index}`, round, artifact: artifactFixture({ id: `artifact-${index}`, roundId: round.id, designId: round.designId }), originatingQuery: "pastor appreciation", raw: rawRow(), now: "2026-08-24T00:00:00.000Z" }));
  const exact = source.researchRowsForContext(rows, { designId: "MD-1435", productId: "product-journal", roundId: "round-1", seedVersion: "short-intent-v2" });
  assert.deepEqual(exact.map((item) => item.id), ["row-0"]);
}

async function ownerGate() {
  const source = await core();
  const prompt = await promptCore();
  const context = { designId: "MD-1435", productId: "product-journal", roundId: "round-1", seedVersion: "short-intent-v2" };
  const round = { ...roundFixture(source), status: "conclusion-ready", conclusion: { decision: "retain", buyerProductFit: "Pastor appreciation buyer and journal fit are supported.", evidenceBasis: ["structured supplemental rows"], blockingTruth: [], nextAction: "Approve this exact research round.", createdAt: "2026-08-24T00:00:00.000Z" } };
  let state = baseState(source);
  state.researchRounds = [round];
  const round1Draft = { id: "draft-round-1", productId: context.productId, designId: context.designId, sourcePacket: "TITLE\nPastor Appreciation Journal\n\nDESCRIPTION\nExact Round 1 package.", tags: [], evidenceIds: [], status: "draft", createdAt: "2026-08-24T00:30:00.000Z", researchContext: context };
  state.listingDrafts = [round1Draft];
  const listingBriefRequest = { stage: "listing-brief", exactContext: { ...context, ownerGate: "exact-approved" }, allowedInputs: [round1Draft.sourcePacket], evidenceRefs: [], nextActionBoundary: "Owner reviews the exact local Listing Brief." };
  const selectListingBrief = (listingBriefUnlocked) => prompt.resolveEtsyOperationsStageRequest({ operationsTab: "results", workMode: "product-development", researchStageRequest: null, analysisStageRequest: null, listingBriefStageRequest: listingBriefRequest, listingAuditStageRequest: null, listingBriefUnlocked });
  assert.equal(source.isListingBriefEligibleForResearchContext(state, context), false);
  let surface = source.deriveListingBriefSurfaceAccess(state, context.designId, context.productId, round1Draft);
  assert.equal(surface.exactApproved, false, "an unapproved latest round must lock every Listing Brief surface");
  assert.equal(surface.canRevealDraft, false);
  assert.equal(surface.metadataOnly, true);
  let selectedListingBrief = selectListingBrief(surface.exactApproved && surface.canRevealDraft);
  assert.equal(selectedListingBrief, null, "the global shortcut must expose no listing-brief request while locked");
  assert.equal(selectedListingBrief ? await prompt.buildEtsyWorkflowPackage(selectedListingBrief) : "", "", "locked Listing Brief content must not be copyable");
  const hydratedLocked = source.hydrateResearchResults(structuredClone(state));
  surface = source.deriveListingBriefSurfaceAccess(hydratedLocked, context.designId, context.productId, hydratedLocked.listingDrafts[0]);
  assert.equal(surface.canRevealDraft, false, "reload-equivalent hydrated state must remain locked");
  state = source.approveResearchRound(state, context, "gate-research-1", "2026-08-24T01:00:00.000Z");
  assert.equal(source.isListingBriefEligibleForResearchContext(state, context), true);
  surface = source.deriveListingBriefSurfaceAccess(state, context.designId, context.productId, state.listingDrafts[0]);
  assert.equal(surface.canRevealDraft, true, "the current draft for the exact approved context is visible");
  selectedListingBrief = selectListingBrief(surface.exactApproved && surface.canRevealDraft);
  assert.strictEqual(selectedListingBrief, listingBriefRequest, "the successful exact owner-approved flow remains available");
  assert.match(await prompt.buildEtsyWorkflowPackage(selectedListingBrief), /Exact Round 1 package/);
  assert.equal(source.isListingBriefEligibleForResearchContext(state, { ...context, designId: "MD-other" }), false);
  assert.equal(source.isListingBriefEligibleForResearchContext(state, { ...context, productId: "wrong" }), false);
  assert.equal(source.isListingBriefEligibleForResearchContext(state, { ...context, roundId: "round-2" }), false);
  assert.equal(source.isListingBriefEligibleForResearchContext(state, { ...context, seedVersion: "legacy-long-v1" }), false);
  const rehydrated = source.hydrateResearchResults(structuredClone(state));
  assert.equal(source.isListingBriefEligibleForResearchContext(rehydrated, context), true);
  const round2 = roundFixture(source, { id: "round-2", roundNumber: 2, now: "2026-08-24T02:00:00.000Z" });
  const relocked = { ...state, researchRounds: [round2, ...state.researchRounds] };
  assert.equal(source.latestResearchContextForDesignProduct(relocked, "MD-1435", "product-journal").roundId, "round-2");
  assert.equal(source.isLatestResearchContext(relocked, context), false);
  assert.throws(() => source.approveResearchRound(relocked, context), /latest working/i);
  assert.equal(source.isListingBriefEligibleForResearchContext(relocked, context), true, "historical approval remains visible on its own exact context");
  surface = source.deriveListingBriefSurfaceAccess(relocked, context.designId, context.productId, relocked.listingDrafts[0]);
  assert.equal(surface.exactApproved, false, "a newer unapproved round relocks the active Listing Brief surface");
  assert.equal(surface.canRevealDraft, false, "an older approved draft must not reveal through the newer round");
  assert.equal(surface.metadataOnly, true, "older draft history is retained as metadata only");
  selectedListingBrief = selectListingBrief(surface.exactApproved && surface.canRevealDraft);
  assert.equal(selectedListingBrief, null, "a newer round must remove the old listing-brief packet from the global shortcut");
  assert.equal(selectedListingBrief ? await prompt.buildEtsyWorkflowPackage(selectedListingBrief) : "", "");
  const rehydratedRelocked = source.hydrateResearchResults(structuredClone(relocked));
  assert.equal(source.deriveListingBriefSurfaceAccess(rehydratedRelocked, context.designId, context.productId, rehydratedRelocked.listingDrafts[0]).canRevealDraft, false, "newer-round relock survives hydration");

  const context2 = { ...context, roundId: round2.id };
  const approvableRound2 = { ...round2, status: "conclusion-ready", conclusion: { decision: "retain", buyerProductFit: "Pastor appreciation buyer and journal fit are supported.", evidenceBasis: ["structured supplemental rows"], blockingTruth: [], nextAction: "Approve this exact research round.", reviewSignal: "Owner approval recorded for this exact context." } };
  const round2Draft = { ...round1Draft, id: "draft-round-2", sourcePacket: "TITLE\nPastor Prayer Journal\n\nDESCRIPTION\nExact Round 2 package.", createdAt: "2026-08-24T02:30:00.000Z", researchContext: context2 };
  const exactRound2State = source.approveResearchRound({ ...relocked, researchRounds: [approvableRound2, ...relocked.researchRounds.filter((item) => item.id !== round2.id)], listingDrafts: [round2Draft, ...relocked.listingDrafts] }, context2, "gate-research-2", "2026-08-24T02:45:00.000Z");
  surface = source.deriveListingBriefSurfaceAccess(exactRound2State, context2.designId, context2.productId, exactRound2State.listingDrafts[0]);
  assert.equal(surface.exactApproved, true);
  assert.equal(surface.draftIsCurrent, true);
  assert.equal(surface.draftMatchesExactContext, true);
  assert.equal(surface.canRevealDraft, true, "only the exact approved latest context can reveal its current package");

  const eligibleRow = source.normalizeResearchResultRow({ id: "eligible-row", round: round2, artifact: artifactFixture({ id: "eligible-artifact", roundId: round2.id }), originatingQuery: "pastor appreciation", raw: rawRow({ competition: "", trend: "", relevanceScore: "" }), now: "2026-08-24T02:00:00.000Z" });
  const nextRound = source.buildResearchCoachConclusion({ round: round2, rows: [eligibleRow], buyerOccasionFit: "missing", productFit: "supported", opportunity: "supported", now: "2026-08-24T03:00:00.000Z" });
  const deferred = source.buildResearchCoachConclusion({ round: round2, rows: [eligibleRow], buyerOccasionFit: "weak", productFit: "supported", opportunity: "supported", now: "2026-08-24T03:00:00.000Z" });
  const retained = source.buildResearchCoachConclusion({ round: round2, rows: [eligibleRow], buyerOccasionFit: "supported", productFit: "supported", opportunity: "supported", now: "2026-08-24T03:00:00.000Z" });
  assert.equal(nextRound.decision, "next-round");
  assert.equal(deferred.decision, "defer");
  assert.equal(retained.decision, "retain");
  assert.equal([nextRound.nextAction].length, 1);
  assert.notEqual(source.buildResearchCoachConclusion({ round: round2, rows: [eligibleRow], buyerOccasionFit: "missing", productFit: "missing", opportunity: "supported" }).decision, "retain", "demand alone never retains");
  const legacyGateState = baseState(source);
  legacyGateState.gates = [{ id: "legacy", subject: "anything", status: "approved-for-draft", evidenceIds: [], missing: [], nextStep: "" }];
  assert.equal(source.isListingBriefEligibleForResearchContext(legacyGateState, context), false);
}

function approvedListingBriefFixture(source) {
  const context = { designId: "MD-1435", productId: "product-journal", roundId: "round-1", seedVersion: "short-intent-v2" };
  const round = { ...roundFixture(source), status: "conclusion-ready", conclusion: { decision: "retain", buyerProductFit: "Pastor appreciation buyer and journal fit are supported.", evidenceBasis: ["structured supplemental rows"], blockingTruth: [], nextAction: "Approve this exact research round.", createdAt: "2026-08-24T00:00:00.000Z" } };
  const draft = { id: "draft-round-1", productId: context.productId, designId: context.designId, sourcePacket: "TITLE\nPastor Appreciation Journal\n\nDESCRIPTION\nExact Round 1 package.", tags: [], evidenceIds: [], status: "draft", createdAt: "2026-08-24T00:30:00.000Z", researchContext: context };
  const initial = { ...baseState(source), researchRounds: [round], listingDrafts: [draft] };
  return { context, draft, state: source.approveResearchRound(initial, context, "gate-research-1", "2026-08-24T01:00:00.000Z") };
}

async function ownerGatePendingRelock() {
  const source = await core();
  const fixture = approvedListingBriefFixture(source);
  let parentState = fixture.state;
  assert.equal(source.deriveListingBriefSurfaceAccess(parentState, fixture.context.designId, fixture.context.productId, fixture.draft).canRevealDraft, true);
  const round2 = roundFixture(source, { id: "round-2", roundNumber: 2, now: "2026-08-24T02:00:00.000Z" });
  const relocked = { ...fixture.state, researchRounds: [round2, ...fixture.state.researchRounds] };
  let releasePersistence;
  const persistence = new Promise((resolve) => { releasePersistence = resolve; });
  let settled = false;
  const attempt = source.persistResearchStateAfterImmediatePublish(relocked, (next) => { parentState = next; }, () => persistence).then((result) => { settled = true; return result; });
  assert.strictEqual(parentState, relocked, "the Hub-facing state must publish synchronously before IndexedDB settles");
  assert.equal(source.deriveListingBriefSurfaceAccess(parentState, fixture.context.designId, fixture.context.productId, fixture.draft).canRevealDraft, false, "a pending new-round write must relock the older Listing Brief immediately");
  await Promise.resolve();
  assert.equal(settled, false, "the relock assertion must run while persistence is still pending");
  releasePersistence();
  assert.equal(await attempt, true);

  const research = await readFile(join(PROJECT_ROOT, "src", "components", "KeywordResearchWorkspace.tsx"), "utf8");
  const hub = await readFile(join(PROJECT_ROOT, "src", "components", "EtsyOperationsHub.tsx"), "utf8");
  assert.match(research, /onFailClosedStateChange\?\.\(next\)/);
  assert.match(research, /persistResearchStateAfterImmediatePublish\(accumulated, publishFailClosedResearchState, saveOperationsState\)/);
  assert.match(research, /Listing Brief is relocked immediately[^\n]+`, true\)/);
  assert.match(hub, /<KeywordResearchWorkspace[^>]+onFailClosedStateChange=\{setState\}/);
}

async function ownerGateFailureRelock() {
  const source = await core();
  const fixture = approvedListingBriefFixture(source);
  const approvedRound = fixture.state.researchRounds[0];
  const firstArtifact = artifactFixture({ id: "artifact-before-conflict", roundId: approvedRound.id });
  const firstRow = source.normalizeResearchResultRow({ id: "row-before-conflict", round: approvedRound, artifact: firstArtifact, originatingQuery: "pastor appreciation", raw: rawRow({ searchVolume: "120" }), now: "2026-08-24T01:10:00.000Z" });
  const stateWithEvidence = { ...fixture.state, artifacts: [firstArtifact, ...fixture.state.artifacts], researchResultRows: [firstRow] };
  const conflictArtifact = artifactFixture({ id: "artifact-conflict", roundId: approvedRound.id, contentText: "pastor appreciation,90,30,5,90" });
  const conflictRow = source.normalizeResearchResultRow({ id: "row-conflict", round: approvedRound, artifact: conflictArtifact, originatingQuery: "pastor appreciation", raw: rawRow({ searchVolume: "90" }), now: "2026-08-24T01:20:00.000Z" });
  const conflictState = source.saveResearchResultBatch(stateWithEvidence, { round: approvedRound, artifact: conflictArtifact, rows: [conflictRow], attemptedFileOrSource: "conflict.csv", now: "2026-08-24T01:20:00.000Z" }).state;
  let parentState = stateWithEvidence;
  const ownerPreview = { id: "preview-conflict", rawText: "pastor appreciation,90,30,5,90", sourceDate: "2026-08-24", error: undefined };
  const persisted = await source.persistResearchStateAfterImmediatePublish(conflictState, (next) => { parentState = next; }, async () => { throw new Error("IndexedDB unavailable"); });
  assert.equal(persisted, false);
  assert.strictEqual(parentState, conflictState, "a recoverable persistence failure must not roll the Hub back to the approved state");
  assert.equal(source.deriveListingBriefSurfaceAccess(parentState, fixture.context.designId, fixture.context.productId, fixture.draft).canRevealDraft, false, "a failed conflict save must leave the Hub locked");
  assert.equal(ownerPreview.rawText, "pastor appreciation,90,30,5,90", "owner input remains available for retry after persistence failure");
  assert.equal(ownerPreview.sourceDate, "2026-08-24");
  assert.equal(conflictState.researchResultRows.filter((row) => row.flags.conflicting).length, 2);
}

async function routeWipRegression() {
  const hub = await readFile(join(PROJECT_ROOT, "src", "components", "EtsyOperationsHub.tsx"), "utf8");
  const research = await readFile(join(PROJECT_ROOT, "src", "components", "KeywordResearchWorkspace.tsx"), "utf8");
  assert.match(hub, /operationsTab === "research" && workMode === "listing-audit"/);
  assert.match(hub, /operationsTab === "research" && workMode === "product-development"/);
  assert.match(hub, /operationsTab === "analysis" && workMode === "product-development"/);
  assert.match(hub, /operationsTab === "analysis" && workMode === "listing-audit"/);
  for (const anchor of ["Replace image", "Reanalyse", "Archive", "Restore", "activeDesigns"]) assert.ok(hub.includes(anchor), `protected WIP anchor missing: ${anchor}`);
  assert.match(research, /filter\(\(item\) => !item\.archivedAt\)/);
  for (const legacyAnchor of ["Keyword research loop", "Copy Codex Research Packet", "Confirm & run OCR", "Withdraw", "Remove"]) assert.ok(research.includes(legacyAnchor), `delivery-before-inbox behavior missing: ${legacyAnchor}`);
  for (const revisionAnchor of ["Reparse", "Clear save error", "Buyer / occasion fit", "Product fit", "field-level owner confirmation", "Save as visual evidence", "Retry OCR · max"]) assert.ok(research.includes(revisionAnchor), `revision behavior anchor missing: ${revisionAnchor}`);
  assert.match(research, /runInboxOcr[\s\S]*runBoundedResearchOcr/);
  assert.match(hub, /deriveListingBriefSurfaceAccess\(state, activeDesign\.id, activeDesign\.productId\)/);
  assert.match(hub, /const activeDesignContent = researchBriefEligible && \(!latestActiveDraft \|\| currentDraftContentVisible\)/);
  assert.match(hub, /const listingBriefResultSurfaceVisible = researchBriefEligible && \(!latestActiveDraft \|\| currentDraftContentVisible\)/);
  assert.match(hub, /coachDiagnosisBase\.nextAction\.tab === "results" && !listingBriefResultSurfaceVisible/);
  assert.match(hub, /listingBriefResultSurfaceVisible \? <div[\s\S]*Listing Brief draft review · locked/);
  assert.match(hub, /const canRevealSavedPackage = Boolean\(researchBriefEligible[\s\S]*draftSurfaceAccess\.canRevealDraft\)/);
  assert.match(hub, /canRevealSavedPackage \? <details[\s\S]*Historical metadata only/);
  assert.match(hub, /visibleStudioEligible \? <section[\s\S]*Listing Studio locked/);
}

async function ownerVisibleIntakeUx() {
  const research = await readFile(join(PROJECT_ROOT, "src", "components", "KeywordResearchWorkspace.tsx"), "utf8");
  assert.match(research, /Legacy \/ optional/);
  assert.match(research, /Primary acceptance path/);
  assert.match(research, /Review this exact file before Discard, Retry OCR, or Save/);
  for (const explanation of [
    "Legacy Upload screenshot",
    "Results Inbox Add screenshots",
    "Results Inbox Paste screenshot",
  ]) assert.ok(research.includes(explanation), `distinct screenshot-entry explanation missing: ${explanation}`);
  const pasteTargetStart = research.indexOf('<div tabIndex={0} onPaste={acceptPastedScreenshot}');
  const pasteTargetEnd = research.indexOf('</div><p id="results-inbox-paste-status"', pasteTargetStart);
  assert.ok(pasteTargetStart >= 0 && pasteTargetEnd > pasteTargetStart, "truthful Results Inbox screenshot paste target missing");
  const pasteTarget = research.slice(pasteTargetStart, pasteTargetEnd);
  assert.doesNotMatch(pasteTarget, /role="button"|onKeyDown=/, "paste target must not advertise or emulate a button action");
  assert.match(pasteTarget, /aria-labelledby="results-inbox-paste-target-label"/);
  assert.match(pasteTarget, /aria-describedby="results-inbox-paste-target-instruction results-inbox-paste-status"/);
  assert.match(pasteTarget, /Screenshot paste target[\s\S]*focus here, then press Ctrl\+V[\s\S]*Click places focus here; Enter or Space do not paste/);
  assert.ok(research.includes("No screenshot pasted yet. Focus the screenshot paste target above, then press Ctrl+V."), "initial adjacent status must state the next paste action");
  assert.match(research, /pasteScreenshotConfirmation[\s\S]*role="status"[\s\S]*aria-live="polite"/);
  assert.match(research, /screenshotCount[\s\S]*screenshot\$\{screenshotCount === 1 \? "" : "s"\} selected/);
  assert.match(research, /setPreviewFocusPending\(true\)/);
  assert.match(research, /previewRegionRef\.current\?\.focus\(\)/);
  assert.match(research, /ref=\{previewRegionRef\}[\s\S]*tabIndex=\{-1\}[\s\S]*Editable preview · not saved/);
  assert.match(research, /tabIndex=\{-1\} className="[^"]*focus:ring-2[^"]*focus:ring-brand/);
  assert.match(research, /structuredPreviewIds[\s\S]*saveResearchPreviews\(structuredPreviewIds\)/);
  assert.equal((research.match(/>Save as visual evidence<\/button>/g) ?? []).length, 1, "terminal visual-only UI must expose one visual-evidence save button");
  for (const retainedAction of ["Editable raw structured text", "Reparse", "Retry OCR · max", "Discard preview"]) assert.ok(research.includes(retainedAction), `visual-only recovery action missing: ${retainedAction}`);
  assert.match(research, /visualReviewOnly \? \[\] : preview\.parsedRows\.map/);
}

async function utf8NoSideEffects() {
  const source = await core();
  const canary = "牧師 · 未確認 · 🧭";
  assert.equal(source.deserializeResearchPreview(source.serializeResearchPreview({ value: canary })).value, canary);
  const files = await Promise.all([
    readFile(join(PROJECT_ROOT, "src", "lib", "etsyOperations.ts"), "utf8"),
    readFile(join(PROJECT_ROOT, "src", "components", "KeywordResearchWorkspace.tsx"), "utf8"),
    readFile(join(PROJECT_ROOT, "src", "components", "EtsyOperationsHub.tsx"), "utf8"),
  ]);
  const joined = files.join("\n");
  assert.doesNotMatch(joined, /fetch\([^)]*(?:etsy|erank|everbee)|etsy\.com\/api|oauth|publishListing|deploy\(/i);
  assert.ok(joined.includes("eRank") && joined.includes("EverBee"));
}

function adaptiveTaskFixture(source, count = 5) {
  const round = roundFixture(source);
  const anchors = source.researchIntentAnchorsForRound(round);
  const tasks = source.createResearchQueryTasks({
    round,
    selectedQueries: anchors.slice(0, count).map((anchor) => ({ query: anchor.query, intentDimensionId: anchor.intentDimensionId, anchorId: anchor.id })),
    source: "erank",
    now: "2026-08-24T00:10:00.000Z",
  });
  return { round, anchors, tasks };
}

function taskArtifactAndRow(source, round, task, ordinal, phrase = `${task.query} signal`) {
  const artifact = source.bindResearchArtifactToQueryTask(artifactFixture({
    id: `task-artifact-${ordinal}`,
    fileName: `owner-export-${99 - ordinal}.csv`,
    roundId: round.id,
    designId: round.designId,
    seedVersion: round.seedVersion,
    originatingQuery: task.query,
    contentText: `${phrase},${100 + ordinal},${30 + ordinal},5,90`,
  }), task);
  const activeInput = source.researchActiveInputForQueryTask(round, task);
  assert.ok(activeInput, "fixture task must retain exact canonical active-input identity");
  const row = source.normalizeResearchResultRow({
    id: `task-row-${ordinal}`,
    round,
    queryTask: task,
    artifact,
    originatingSeedId: activeInput.id,
    originatingQuery: task.query,
    raw: rawRow({ phrase, searchVolume: String(100 + ordinal), competition: String(30 + ordinal) }),
    now: "2026-08-24T01:00:00.000Z",
  });
  return { artifact, row };
}

async function adaptiveResearchFunnel() {
  const source = await core();
  const { round, anchors } = adaptiveTaskFixture(source, 3);
  assert.equal(anchors.length, 5);
  assert.deepEqual(anchors.map((anchor) => anchor.query), [...source.SHORT_INTENT_V2_SEEDS]);
  assert.deepEqual(anchors.map((anchor) => anchor.intentDimensionId), ["product-role", "gift-intent", "use-case", "faith-identity", "appreciation-thank-you"]);
  assert.deepEqual(anchors.map((anchor) => anchor.origin), Array(5).fill("round-1-seed"));
  for (const count of [3, 4, 5]) assert.equal(adaptiveTaskFixture(source, count).tasks.length, count);
  assert.throws(() => source.createResearchQueryTasks({ round, selectedQueries: anchors.slice(0, 2), source: "erank" }), /exactly 3.5/i);
  assert.throws(() => source.createResearchQueryTasks({ round, selectedQueries: [...anchors, anchors[0]], source: "erank" }), /exactly 3.5/i);
  assert.throws(() => source.createResearchQueryTasks({ round, selectedQueries: anchors.slice(0, 3), source: "erank", completedQueries: [anchors[1].query] }), /completed-query history/i);
  assert.throws(() => source.createResearchQueryTasks({ round, selectedQueries: [{ ...anchors[0], query: "not an active anchor" }, ...anchors.slice(1, 3)], source: "erank" }), /active Bulk anchor/i);

  const legacy = structuredClone(source.DEFAULT_STATE);
  delete legacy.researchQueryTasks;
  delete legacy.researchGapAnalysisAttempts;
  const migrated = source.hydrateResearchResults(legacy);
  assert.deepEqual(migrated.researchQueryTasks, []);
  assert.deepEqual(migrated.researchGapAnalysisAttempts, []);
  const malformed = source.hydrateResearchResults({ ...legacy, researchQueryTasks: { order: "filename" }, researchGapAnalysisAttempts: "partial" });
  assert.deepEqual(malformed.researchQueryTasks, []);
  assert.deepEqual(malformed.researchGapAnalysisAttempts, []);
  assert.ok(malformed.researchRecoveryQuarantine.some((item) => item.collection === "researchQueryTasks"));
  assert.ok(malformed.researchRecoveryQuarantine.some((item) => item.collection === "researchGapAnalysisAttempts"));
  const reloaded = source.hydrateResearchResults(JSON.parse(JSON.stringify(malformed)));
  assert.deepEqual(reloaded.researchRecoveryQuarantine, malformed.researchRecoveryQuarantine);
  assert.equal(legacy.researchRounds?.length ?? 0, 0, "task projection must not create a round automatically");
}

async function individualQueryLineage() {
  const source = await core();
  const { round, tasks } = adaptiveTaskFixture(source, 3);
  let state = baseState(source);
  state.researchRounds = [round];
  state.researchQueryTasks = tasks;
  const first = taskArtifactAndRow(source, round, tasks[0], 1, "shared buyer phrase");
  const saved = source.saveResearchResultBatch(state, { round, artifact: first.artifact, rows: [first.row], attemptedFileOrSource: "totally-unrelated-name.csv", now: "2026-08-24T01:10:00.000Z" });
  state = saved.state;
  assert.equal(state.researchQueryTasks.find((task) => task.id === tasks[0].id).status, "received");
  assert.deepEqual(state.researchQueryTasks.find((task) => task.id === tasks[0].id).artifactIds, [first.artifact.id]);
  assert.equal(state.researchResultRows[0].researchQueryTaskId, tasks[0].id);
  assert.equal(state.researchResultRows[0].researchOriginatingQuery, tasks[0].query);
  assert.equal(state.researchResultRows[0].intentDimensionId, tasks[0].intentDimensionId);

  const wrong = { ...first.artifact, id: "wrong-task-artifact", researchQueryTaskId: tasks[1].id };
  assert.throws(() => source.saveResearchResultBatch(state, { round, artifact: wrong, rows: [first.row], attemptedFileOrSource: "wrong.csv" }), /wrong Individual task|reassign/i);

  const second = taskArtifactAndRow(source, round, tasks[1], 2, "shared buyer phrase");
  const duplicateRawForSecond = { ...second.artifact, fileName: first.artifact.fileName, contentText: first.artifact.contentText };
  const duplicateAttempt = source.saveResearchResultBatch(state, { round, artifact: duplicateRawForSecond, rows: [second.row], attemptedFileOrSource: "same-raw-different-task.csv", now: "2026-08-24T01:20:00.000Z" });
  assert.equal(duplicateAttempt.savedCount, 0);
  assert.equal(duplicateAttempt.state.researchQueryTasks.find((task) => task.id === tasks[1].id).status, "pending", "an exact raw duplicate cannot satisfy another task");

  const merged = source.mergeResearchRowsWithLineage([first.row, second.row]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].taskIds.sort(), [tasks[0].id, tasks[1].id].sort());
  assert.deepEqual(merged[0].artifactIds.sort(), [first.artifact.id, second.artifact.id].sort());
  assert.deepEqual(merged[0].originatingQueries.sort(), [tasks[0].query, tasks[1].query].sort());
  const reloaded = source.hydrateResearchResults(JSON.parse(JSON.stringify(state)));
  const context = { designId: round.designId, productId: round.productId, roundId: round.id, seedVersion: round.seedVersion };
  assert.deepEqual(source.researchQueryTasksForContext(reloaded.researchQueryTasks, context).map((task) => [task.id, task.status]), state.researchQueryTasks.map((task) => [task.id, task.status]));
  const legacyTask = { ...tasks[0], anchorId: "research-anchor:legacy-seed-id", status: "ready" };
  const reconciled = source.hydrateResearchResults({ ...baseState(source), researchRounds: [round], researchQueryTasks: [legacyTask] });
  assert.equal(reconciled.researchQueryTasks[0].id, legacyTask.id, "anchor repair must preserve stable task identity");
  assert.equal(reconciled.researchQueryTasks[0].status, "ready", "anchor repair must preserve task progress");
  assert.equal(reconciled.researchQueryTasks[0].anchorId, source.researchIntentAnchorsForRound(round)[0].id, "exact query and dimension may reconcile a legacy anchor ID");
  assert.equal(source.updateResearchQueryTaskFromArtifact(tasks[2], first.artifact, "received").status, "error");
}

async function analysisSupportRowLedger() {
  const source = await core();
  const { round, tasks } = adaptiveTaskFixture(source, 5);
  const completedTasks = tasks.map((task, index) => index < 3 ? { ...task, status: "received", artifactIds: [`received-artifact-${index + 1}`] } : task);
  const eligibleRows = [];
  for (let taskIndex = 0; taskIndex < 3; taskIndex += 1) {
    for (let rowIndex = 0; rowIndex < 10; rowIndex += 1) {
      const ordinal = taskIndex * 20 + rowIndex + 1;
      const { row } = taskArtifactAndRow(source, round, completedTasks[taskIndex], ordinal, `${completedTasks[taskIndex].query} support ${rowIndex + 1}`);
      eligibleRows.push({
        ...row,
        id: `eligible-support-${taskIndex + 1}-${rowIndex + 1}`,
        ...(taskIndex === 0 && rowIndex === 9 ? {
          searchVolume: { raw: "9999", parsed: 9999, status: "confirmed" },
          competition: { raw: "", parsed: null, status: "missing" },
        } : {}),
      });
    }
  }
  const pendingRow = taskArtifactAndRow(source, round, tasks[3], 90, "pending task support").row;
  const template = eligibleRows[0];
  const excludedRows = [
    { ...template, id: "wrong-context-support", designId: "OTHER-DESIGN" },
    { ...template, id: "ineligible-support", flags: { ...template.flags, unconfirmed: true } },
    { ...template, id: "ocr-support", evidenceMedium: "ocr-image" },
    { ...template, id: "superseded-support", supersededByRowId: "replacement-row" },
    { ...pendingRow, id: "non-completed-support" },
  ];
  const ledger = source.selectResearchSupportRowLedger({ round, tasks: completedTasks, rows: [...excludedRows, ...eligibleRows] });
  assert.equal(ledger.length, source.RESEARCH_SUPPORT_ROW_LEDGER_LIMIT);
  assert.deepEqual(new Set(ledger.map((row) => row.researchQueryTaskId)), new Set(completedTasks.slice(0, 3).map((task) => task.id)), "the compact ledger must preserve every completed task");
  assert.deepEqual(new Set(ledger.map((row) => row.intentDimensionId)), new Set(completedTasks.slice(0, 3).map((task) => task.intentDimensionId)), "the compact ledger must preserve every completed dimension");
  assert.ok(ledger.some((row) => row.confirmedSearchVolume === 9999 && row.confirmedCompetition === null), "confirmed parsed metrics remain numeric and unavailable competition remains null");
  assert.deepEqual(Object.keys(ledger[0]), ["rowId", "phrase", "originatingQuery", "intentDimensionId", "researchQueryTaskId", "confirmedSearchVolume", "confirmedCompetition"]);
  for (const excludedId of excludedRows.map((row) => row.id)) assert.ok(!ledger.some((row) => row.rowId === excludedId), `excluded support row leaked: ${excludedId}`);
  const repeated = source.selectResearchSupportRowLedger({ round, tasks: [...completedTasks].reverse(), rows: [...eligibleRows].reverse() });
  assert.deepEqual(repeated, ledger, "equivalent row/task order must produce the same bounded ledger");
  assert.deepEqual(source.selectResearchSupportRowLedger({ round, tasks: completedTasks, rows: excludedRows }), [], "no exact active eligible structured received-task rows must fail closed");

  const research = await readFile(join(PROJECT_ROOT, "src", "components", "KeywordResearchWorkspace.tsx"), "utf8");
  assert.match(research, /selectResearchSupportRowLedger\(\{ round: activeResearchRound, tasks: activeQueryTasks, rows: activeResultRows \}\)/);
  assert.match(research, /if \(!supportRowLedger\.length\) return null;/);
  assert.match(research, /stage: "product-research-analysis"[\s\S]*evidenceRefs:[\s\S]*supportRowLedger/);
}

async function stagePromptContract() {
  const source = await promptCore();
  const stages = ["product-research-bulk", "product-research-individual", "product-research-analysis", "listing-brief", "listing-audit", "growth-launch"];
  const supportRowLedger = [{ rowId: "exact-row-1", phrase: "pastor appreciation gift", originatingQuery: "pastor appreciation", intentDimensionId: "appreciation-thank-you", researchQueryTaskId: "task-1", confirmedSearchVolume: 500, confirmedCompetition: 42 }];
  for (const stage of stages) {
    const request = { stage, exactContext: { designId: "MD-1435", stage }, allowedInputs: [`input:${stage}`], evidenceRefs: ["artifact-1", "artifact-1"], ...(stage === "product-research-analysis" ? { supportRowLedger } : {}), nextActionBoundary: "Owner reviews exactly one next action." };
    const packet = source.buildEtsyStagePacket(request);
    const serialized = await source.buildEtsyWorkflowPackage(request);
    assert.equal(packet.stage, stage);
    assert.equal(packet.nextActionBoundary.ownerActionRequired, true);
    assert.equal(packet.nextActionBoundary.automaticTransition, false);
    assert.deepEqual(packet.evidenceRefs, ["artifact-1"]);
    assert.match(serialized, new RegExp(`MYGIFTSTYLE STAGE PACKET . ${stage}`));
    assert.match(serialized, /Only the owner may approve a transition/);
    assert.doesNotMatch(serialized, /# Etsy SEO Keyword Research & Listing Expert Master System Prompt/);
    if (stage === "product-research-analysis") {
      assert.match(serialized, /"rowId": "exact-row-1"/);
      for (const field of ["phrase", "originatingQuery", "intentDimensionId", "researchQueryTaskId", "confirmedSearchVolume", "confirmedCompetition"]) assert.ok(serialized.includes(`"${field}"`), `serialized support ledger field missing: ${field}`);
    }
  }
  const analysis = source.buildEtsyStagePacket({ stage: "product-research-analysis", exactContext: { roundId: "round-1" }, allowedInputs: ["completed ledger"], evidenceRefs: [], supportRowLedger, nextActionBoundary: "Owner chooses." });
  assert.deepEqual(analysis.outputSchema.rawGapCandidateDrafts, { exactCountWhenGapExists: 25, itemFields: ["query", "targetDimension", "extensionLogic", "supportingRowIds"] });
  assert.deepEqual(analysis.outputSchema.rankedGapCandidates, { minimum: 15, maximum: 25, absentBelowMinimum: true });
  assert.ok(analysis.prohibitedTransitions.includes("create-round") && analysis.prohibitedTransitions.includes("create-task"));
  assert.throws(() => source.buildEtsyStagePacket({ stage: "product-research-analysis", exactContext: { roundId: "round-1" }, allowedInputs: ["completed ledger"], evidenceRefs: [], nextActionBoundary: "Owner chooses." }), /support-row ledger/i);
  assert.throws(() => source.buildEtsyStagePacket({ stage: "unknown", exactContext: { id: "x" }, allowedInputs: ["x"], evidenceRefs: [], nextActionBoundary: "owner" }), /Unknown Etsy stage/i);
  assert.throws(() => source.buildEtsyStagePacket({ stage: "listing-audit", exactContext: {}, allowedInputs: ["x"], evidenceRefs: [], nextActionBoundary: "owner" }), /context is empty/i);
  assert.throws(() => source.buildEtsyStagePacket({ stage: "growth-launch", exactContext: { id: "x" }, allowedInputs: [], evidenceRefs: [], nextActionBoundary: "owner" }), /no allowed inputs/i);
  const routeBase = { operationsTab: "today", workMode: "product-development", researchStageRequest: null, analysisStageRequest: null, listingBriefStageRequest: null, listingAuditStageRequest: null, listingBriefUnlocked: false };
  const incompleteAnalysis = { stage: "product-research-analysis", exactContext: { roundId: "round-1" }, allowedInputs: ["completed-query ledger"], evidenceRefs: [], nextActionBoundary: "Owner chooses." };
  const completeAnalysis = { ...incompleteAnalysis, supportRowLedger };
  const listingBrief = { stage: "listing-brief", exactContext: { roundId: "round-1", ownerGate: "exact-approved" }, allowedInputs: ["LOCKED LISTING BRIEF CONTENT"], evidenceRefs: [], nextActionBoundary: "Owner chooses." };
  assert.equal(source.resolveEtsyOperationsStageRequest(routeBase), null, "unsupported today route must not fall back to growth-launch");
  assert.equal(source.resolveEtsyOperationsStageRequest({ ...routeBase, operationsTab: "unsupported-route" }), null);
  assert.equal(source.resolveEtsyOperationsStageRequest({ ...routeBase, operationsTab: "analysis", analysisStageRequest: incompleteAnalysis }), null, "Analysis must remain unavailable without a non-empty support-row ledger");
  assert.strictEqual(source.resolveEtsyOperationsStageRequest({ ...routeBase, operationsTab: "analysis", analysisStageRequest: completeAnalysis }), completeAnalysis);
  assert.equal(source.resolveEtsyOperationsStageRequest({ ...routeBase, operationsTab: "results", listingBriefStageRequest: listingBrief }), null, "locked Listing Brief request must not be exposed");
  assert.strictEqual(source.resolveEtsyOperationsStageRequest({ ...routeBase, operationsTab: "results", listingBriefStageRequest: listingBrief, listingBriefUnlocked: true }), listingBrief);
}

async function adaptiveStopTruth() {
  const source = await core();
  const { round, tasks } = adaptiveTaskFixture(source, 5);
  const rows = tasks.map((task, index) => taskArtifactAndRow(source, round, task, index + 1).row);
  const received = tasks.map((task, index) => ({ ...task, status: "received", artifactIds: [`task-artifact-${index + 1}`] }));
  const retainConclusion = { decision: "retain", buyerProductFit: "Buyer and product fit supported.", evidenceBasis: ["eligible structured task rows"], blockingTruth: [], nextAction: "Ask owner to approve.", reviewSignal: "All exact task rows reviewed.", createdAt: "2026-08-24T02:00:00.000Z" };
  const close = source.deriveAdaptiveResearchAction({ round, tasks: received, rows, conclusion: retainConclusion });
  assert.equal(close.actionKind, "close-research");
  assert.ok(close.coverage.every((item) => item.covered));
  const defer = source.deriveAdaptiveResearchAction({ round, tasks: received, rows, conclusion: { ...retainConclusion, decision: "defer" } });
  assert.equal(defer.actionKind, "close-research");
  assert.equal(defer.persistedDecision, "defer");
  const pending = source.deriveAdaptiveResearchAction({ round, tasks, rows: [], conclusion: retainConclusion });
  assert.equal(pending.actionKind, "collect-missing-input");
  assert.match(pending.blockingInput, /Upload the owner export/);

  const roundReady = { ...round, status: "conclusion-ready", conclusion: retainConclusion, adaptiveAction: close };
  const context = { designId: round.designId, productId: round.productId, roundId: round.id, seedVersion: round.seedVersion };
  const state = { ...baseState(source), researchRounds: [roundReady], researchQueryTasks: received, researchResultRows: rows, artifacts: rows.map((row, index) => taskArtifactAndRow(source, round, tasks[index], index + 1).artifact) };
  const approved = source.approveResearchRound(state, context, "adaptive-gate", "2026-08-24T03:00:00.000Z");
  assert.equal(source.isListingBriefEligibleForResearchContext(approved, context), true);
  assert.throws(() => source.approveResearchRound({ ...state, researchQueryTasks: tasks }, context), /task-complete|closed|covered/i);

  const gapTasks = received.slice(0, 3);
  const gapRows = rows.slice(0, 3);
  const validDrafts = Array.from({ length: 25 }, (_, index) => ({ query: `faith angle ${index + 1}`, targetDimension: "faith-identity", extensionLogic: "extend pastor evidence", supportingRowIds: [gapRows[0].id] }));
  const proposal = source.validateAndRankGapCandidates({ round, tasks: gapTasks, rows: gapRows, rawDrafts: validDrafts, id: "gap-valid", now: "2026-08-24T04:00:00.000Z" });
  assert.equal(proposal.status, "proposal-ready");
  assert.equal(proposal.rankedCandidates.length, 25);
  const repeatedRanking = source.validateAndRankGapCandidates({ round, tasks: gapTasks, rows: gapRows, rawDrafts: structuredClone(validDrafts), id: "gap-valid-repeat", now: "2026-08-24T04:00:00.000Z" });
  assert.deepEqual(repeatedRanking.rankedCandidates.map((candidate) => candidate.rawOrdinal), proposal.rankedCandidates.map((candidate) => candidate.rawOrdinal), "ranking must be deterministic across equivalent runs");
  const proposeAction = source.deriveAdaptiveResearchAction({ round, tasks: gapTasks, rows: gapRows, conclusion: { ...retainConclusion, decision: "next-round" }, gapAnalysis: proposal });
  assert.equal(proposeAction.actionKind, "propose-gap-round");
  assert.equal(proposeAction.gapProposal.length, 25);
  const sourceRound = {
    ...round,
    status: "next-round-needed",
    conclusion: { ...retainConclusion, decision: "next-round" },
    adaptiveAction: pending,
  };
  const persistedProposalState = {
    researchRounds: [sourceRound],
    researchGapAnalysisAttempts: [proposal],
    researchQueryTasks: gapTasks,
    researchResultRows: gapRows,
  };
  assert.equal(sourceRound.adaptiveAction.actionKind, "collect-missing-input", "persisted round action may predate the displayed persisted proposal");
  assert.equal(source.deriveAdaptiveResearchAction({ round: sourceRound, tasks: gapTasks, rows: gapRows, conclusion: sourceRound.conclusion, gapAnalysis: proposal }).actionKind, "propose-gap-round", "displayed action is derived from the latest persisted proposal and exact task/row lineage");
  const adaptiveRound = source.createAdaptiveNextResearchRound(
    persistedProposalState,
    {
      id: "round-2-adaptive",
      sourceRoundId: sourceRound.id,
      gapAnalysisId: proposal.id,
      selectedGapCandidateIds: proposal.rankedCandidates.slice(0, 5).map((candidate) => candidate.id),
      ownerApprovedBy: "owner",
      now: "2026-08-24T04:30:00.000Z",
    },
  );
  const adaptiveAnchors = source.researchIntentAnchorsForRound(adaptiveRound);
  const adaptiveDimensions = source.researchRequiredDimensionsForRound(adaptiveRound);
  assert.equal(adaptiveRound.roundNumber, 2);
  assert.equal(persistedProposalState.researchQueryTasks.length, gapTasks.length, "creating an adaptive round does not create any Individual task");
  assert.deepEqual(adaptiveRound.seedSnapshot, [...source.SHORT_INTENT_V2_SEEDS], "adaptive round must not rewrite the fixed five-seed lineage");
  assert.equal(adaptiveAnchors.length, 5);
  assert.ok(adaptiveAnchors.every((anchor) => anchor.origin === "owner-approved-gap" && anchor.sourceGapAnalysisId === proposal.id));
  assert.equal(adaptiveDimensions.length, 5);
  assert.equal(new Set(adaptiveDimensions.map((dimension) => dimension.id)).size, 5, "later-round dimensions are frozen and unique even when candidates extend one source gap");
  assert.deepEqual(adaptiveRound.adaptiveOwnerApproval.selectedGapCandidateIds, proposal.rankedCandidates.slice(0, 5).map((candidate) => candidate.id));
  const adaptiveReload = source.hydrateResearchResults({ ...baseState(source), researchRounds: [adaptiveRound], researchGapAnalysisAttempts: [proposal] });
  assert.deepEqual(source.researchIntentAnchorsForRound(adaptiveReload.researchRounds[0]), adaptiveAnchors);
  const adaptiveInputs = source.researchActiveInputLedgerForRound(adaptiveReload.researchRounds[0]);
  assert.deepEqual(adaptiveInputs.map((input) => input.id), adaptiveAnchors.map((anchor) => anchor.id), "Round 2 active input IDs come from persisted owner-approved anchors");
  assert.deepEqual(adaptiveInputs.map((input) => input.query), adaptiveAnchors.map((anchor) => anchor.query));
  assert.deepEqual(adaptiveReload.researchRounds[0].seedSnapshot, [...source.SHORT_INTENT_V2_SEEDS], "Round 2 active inputs do not rewrite the original five-seed history");

  const adaptiveTasks = source.createResearchQueryTasks({
    round: adaptiveReload.researchRounds[0],
    selectedQueries: adaptiveAnchors.slice(0, 3).map((anchor) => ({ query: anchor.query, intentDimensionId: anchor.intentDimensionId, anchorId: anchor.id })),
    source: "erank",
    now: "2026-08-24T04:40:00.000Z",
  });
  const previewInput = source.researchActiveInputForQueryTask(adaptiveReload.researchRounds[0], adaptiveTasks[0]);
  assert.deepEqual(previewInput, adaptiveInputs[0], "Round 2 preview resolves exact task/query/dimension identity from the active input ledger");
  const adaptiveBatch = source.createResearchBatch({
    id: "round-2-batch",
    round: adaptiveReload.researchRounds[0],
    selectedSeedIds: [previewInput.id],
    now: "2026-08-24T04:45:00.000Z",
  });
  let adaptiveArtifact = batchArtifactFixture(adaptiveReload.researchRounds[0], adaptiveBatch, {
    id: "round-2-artifact",
    ordinal: 1,
    mimeType: "text/csv",
    fileName: "owner-arbitrary-name.csv",
    contentText: `${adaptiveTasks[0].query} signal,140,25,6,92`,
  });
  adaptiveArtifact = source.bindResearchArtifactToQueryTask(adaptiveArtifact, adaptiveTasks[0]);
  const adaptiveRow = source.normalizeResearchResultRow({
    id: "round-2-row",
    round: adaptiveReload.researchRounds[0],
    batch: adaptiveBatch,
    queryTask: adaptiveTasks[0],
    artifact: adaptiveArtifact,
    originatingSeedId: previewInput.id,
    originatingQuery: adaptiveTasks[0].query,
    raw: rawRow({ phrase: `${adaptiveTasks[0].query} signal`, searchVolume: "140", competition: "25", trend: "6", relevanceScore: "92" }),
    now: "2026-08-24T04:50:00.000Z",
  });
  assert.equal(adaptiveRow.flags.unmapped, false);
  const adaptiveState = {
    ...baseState(source),
    researchRounds: [adaptiveReload.researchRounds[0]],
    researchQueryTasks: adaptiveTasks,
    researchGapAnalysisAttempts: [proposal],
  };
  const adaptiveSaved = source.saveResearchResultBatch(adaptiveState, {
    round: adaptiveReload.researchRounds[0],
    batch: adaptiveBatch,
    artifact: adaptiveArtifact,
    rows: [adaptiveRow],
    attemptedFileOrSource: "owner-arbitrary-name.csv",
    now: "2026-08-24T04:55:00.000Z",
  });
  assert.equal(adaptiveSaved.savedCount, 1);
  const adaptiveSavedReload = source.hydrateResearchResults(JSON.parse(JSON.stringify(adaptiveSaved.state)));
  const reloadedRound = adaptiveSavedReload.researchRounds[0];
  const reloadedTask = adaptiveSavedReload.researchQueryTasks.find((task) => task.id === adaptiveTasks[0].id);
  assert.deepEqual(source.researchActiveInputLedgerForRound(reloadedRound), adaptiveInputs, "save/hydrate/reload preserves the immutable Round 2 input ledger");
  assert.equal(reloadedTask.anchorId, adaptiveAnchors[0].id);
  assert.equal(reloadedTask.status, "received");
  assert.equal(adaptiveSavedReload.researchBatches[0].selectedSeedIds[0], adaptiveInputs[0].id);
  assert.equal(adaptiveSavedReload.researchResultRows[0].originatingSeedId, adaptiveInputs[0].id);
  assert.equal(adaptiveSavedReload.researchResultRows[0].researchQueryTaskId, adaptiveTasks[0].id);
  assert.equal(adaptiveSavedReload.artifacts[0].researchQueryTaskId, adaptiveTasks[0].id);
  assert.throws(() => source.createAdaptiveNextResearchRound(persistedProposalState, { sourceRoundId: sourceRound.id, gapAnalysisId: proposal.id, selectedGapCandidateIds: proposal.rankedCandidates.slice(0, 4).map((candidate) => candidate.id), ownerApprovedBy: "owner" }), /5.8 unique gap candidates/i);
  assert.throws(() => source.createAdaptiveNextResearchRound(persistedProposalState, { sourceRoundId: sourceRound.id, gapAnalysisId: proposal.id, selectedGapCandidateIds: ["not-in-proposal", ...proposal.rankedCandidates.slice(0, 4).map((candidate) => candidate.id)], ownerApprovedBy: "owner" }), /latest ranked proposal/i);
  assert.throws(() => source.createAdaptiveNextResearchRound({ ...persistedProposalState, researchRounds: [adaptiveRound, sourceRound] }, { sourceRoundId: sourceRound.id, gapAnalysisId: proposal.id, selectedGapCandidateIds: proposal.rankedCandidates.slice(0, 5).map((candidate) => candidate.id), ownerApprovedBy: "owner" }), /latest exact research round|already created/i);
  assert.throws(() => source.createAdaptiveNextResearchRound(persistedProposalState, { sourceRoundId: "missing-round", gapAnalysisId: proposal.id, selectedGapCandidateIds: proposal.rankedCandidates.slice(0, 5).map((candidate) => candidate.id), ownerApprovedBy: "owner" }), /source research round is missing/i);
  assert.throws(() => source.createAdaptiveNextResearchRound({ ...persistedProposalState, researchGapAnalysisAttempts: [] }, { sourceRoundId: sourceRound.id, gapAnalysisId: proposal.id, selectedGapCandidateIds: proposal.rankedCandidates.slice(0, 5).map((candidate) => candidate.id), ownerApprovedBy: "owner" }), /valid 15.25 candidate proposal/i, "an unpersisted displayed proposal must fail closed");
  assert.throws(() => source.createAdaptiveNextResearchRound({ ...persistedProposalState, researchGapAnalysisAttempts: [repeatedRanking, proposal] }, { sourceRoundId: sourceRound.id, gapAnalysisId: proposal.id, selectedGapCandidateIds: proposal.rankedCandidates.slice(0, 5).map((candidate) => candidate.id), ownerApprovedBy: "owner" }), /latest exact gap proposal/i, "a stale persisted proposal must fail closed");

  const wrongCount = source.validateAndRankGapCandidates({ round, tasks: gapTasks, rows: gapRows, rawDrafts: validDrafts.slice(0, 24), id: "gap-24" });
  assert.equal(wrongCount.status, "invalid");
  assert.equal(wrongCount.rankedCandidates.length, 0);
  assert.equal(wrongCount.rejectionAudit.rejections[0].reason, "raw-count-not-25");
  const lowYieldDrafts = [...validDrafts.slice(0, 14), ...Array.from({ length: 11 }, (_, index) => ({ ...validDrafts[0], query: `faith angle ${index + 1}` }))];
  const lowYield = source.validateAndRankGapCandidates({ round, tasks: gapTasks, rows: gapRows, rawDrafts: lowYieldDrafts, id: "gap-low-yield" });
  assert.equal(lowYield.status, "insufficient-valid");
  assert.equal(lowYield.rankedCandidates.length, 0);
  assert.ok(lowYield.rejectionAudit.rejections.length >= 11);
  assert.throws(() => source.createAdaptiveNextResearchRound({ ...persistedProposalState, researchGapAnalysisAttempts: [lowYield] }, { sourceRoundId: sourceRound.id, gapAnalysisId: lowYield.id, selectedGapCandidateIds: [], ownerApprovedBy: "owner" }), /valid 15.25 candidate proposal/i, "a persisted non-proposal analysis must fail closed");
  const collect = source.deriveAdaptiveResearchAction({ round, tasks: gapTasks, rows: gapRows, conclusion: { ...retainConclusion, decision: "next-round" }, gapAnalysis: lowYield });
  assert.equal(collect.actionKind, "collect-missing-input");
  assert.ok(collect.rejectionAudit.rejections.length >= 11);
  const coveredTarget = source.validateAndRankGapCandidates({ round, tasks: gapTasks, rows: gapRows, rawDrafts: validDrafts.map((draft) => ({ ...draft, targetDimension: "product-role" })), id: "gap-covered-target" });
  assert.ok(coveredTarget.rejectionAudit.rejections.every((item) => item.reason === "covered-target" || item.reason === "candidate-duplicate"));
  assert.equal(approved.researchRounds.length, 1, "adaptive approval must not create a round automatically");
  assert.equal(approved.researchQueryTasks.length, 5, "adaptive approval must not create a task automatically");
}

async function primaryPathUi() {
  const research = await readFile(join(PROJECT_ROOT, "src", "components", "KeywordResearchWorkspace.tsx"), "utf8");
  for (const anchor of ["activeIntentAnchors", "activeInputLedger", "selectedIndividualAnchorIds", "createIndividualTasks", "activeQueryTasks", "activateTaskUpload", "activeQueryTaskId", "copyIndividualTaskPacket", "selectedGapCandidateIds", "createAdaptiveNextResearchRound", "mergeResearchRowsWithLineage", "computeResearchCoverage", "adaptiveAction", "saveGapAnalysisAttempt"]) assert.ok(research.includes(anchor), `adaptive primary-path UI contract missing: ${anchor}`);
  assert.match(research, /Primary acceptance path . Research Results Inbox/);
  assert.match(research, /exactly 3.5 Individual/i);
  assert.match(research, /task ID, not filename/i);
  assert.match(research, /aria-live="polite"/);
  assert.match(research, /<details[^>]+aria-label="Research raw and normalized history"[\s\S]*aria-label="Research Batch raw artifacts"[\s\S]*aria-label="Normalized research results"[\s\S]*<\/details>/);
  assert.match(research, /exactly 25 raw drafts/i);
  assert.match(research, /no round or task was created/i);
  assert.match(research, /min-h-11/);
  assert.match(research, /aria-label=\{`Copy Individual stage packet for \$\{task\.query\}`\}[\s\S]*Copy query packet/);
  assert.match(research, /aria-label=\{`Choose files for Individual query \$\{task\.query\}`\}/);
  assert.match(research, /Approve \{selectedGapCandidateIds\.length\} gap anchors and create next round/);
  assert.match(research, /window\.confirm\(`Approve these \$\{selectedGapCandidateIds\.length\} gap anchors/);
  assert.match(research, /const inputLedger = researchActiveInputLedgerForRound\(activeResearchRound\);/, "preview must use the canonical active-input ledger for Round 1 and adaptive rounds");
  assert.match(research, /researchActiveInputForQueryTask\(activeResearchRound, activeQueryTask\)/, "preview task identity must be enforced by a production helper");
  assert.doesNotMatch(research, /const (?:seed|input)Ledger = activeResearchRound\.seedLedger \?\? \[\];/, "preview must not read the historical seed ledger as current-round input identity");

  const requiredBrowserMatrix = [
    { width: 1280, height: 720 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ];
  assert.deepEqual(requiredBrowserMatrix.map(({ width, height }) => `${width}x${height}`), ["1280x720", "768x1024", "390x844"]);
  assert.match(research, /data-browser-matrix="1280x720 768x1024 390x844"/);
  assert.match(research, /data-responsive-primary-path="selection task-copy task-upload recovery coach"/);
  const funnelStart = research.indexOf('aria-label="Adaptive research funnel"');
  const funnelEnd = research.indexOf('Merged decision view:', funnelStart);
  const funnel = research.slice(funnelStart, funnelEnd);
  assert.ok(funnelStart >= 0 && funnelEnd > funnelStart, "adaptive primary-path source slice is missing");
  assert.match(funnel, /min-w-0/);
  assert.match(funnel, /overflow-hidden/);
  assert.match(funnel, /break-words/);
  assert.match(funnel, /focus-visible:outline|focus-within:outline/);
  assert.equal((funnel.match(/min-h-11/g) ?? []).length >= 5, true, "primary selection/copy/upload controls need 44px static targets before browser measurement");
}

async function verifierSmoke() {
  const source = await core();
  assert.equal(source.normalizeResearchField("0", "number").status, "confirmed-zero");
  assert.throws(() => source.assertResearchFixtureRows([{ nope: true }]), /header|fixture/i);
  await routeWipRegression();
  console.log("research-results-inbox focused: pass");
}

const cases = {
  "schema-migration": schemaMigration,
  "seed-lineage": seedLineage,
  "normalization-truth": normalizationTruth,
  "local-date-boundary": localDateBoundary,
  "truth-recompute": truthRecompute,
  "draft-batch-seed-recovery": draftBatchSeedRecovery,
  "ocr-table-candidates": ocrTableCandidates,
  "preview-recovery": previewRecovery,
  "research-batch-artifacts": researchBatchArtifacts,
  "discard-sibling-lineage": discardSiblingLineage,
  "capture-time-recovery": captureTimeRecovery,
  "draft-coach-next-round": draftCoachNextRound,
  "ocr-fetch-rejection": ocrFetchRejection,
  "ocr-never-settling-worker": ocrNeverSettlingWorker,
  "ocr-late-resolve": ocrLateResolve,
  "ocr-sibling-recovery": ocrSiblingRecovery,
  "ocr-preview-roundtrip": ocrPreviewRoundTrip,
  "ocr-visual-only-save": ocrVisualOnlySave,
  "ocr-retry-success": ocrRetrySuccess,
  "duplicate-conflict": duplicateConflict,
  "lineage-isolation": lineageIsolation,
  "owner-gate": ownerGate,
  "owner-gate-pending-relock": ownerGatePendingRelock,
  "owner-gate-failure-relock": ownerGateFailureRelock,
  "route-wip-regression": routeWipRegression,
  "owner-visible-intake-ux": ownerVisibleIntakeUx,
  "adaptive-research-funnel": adaptiveResearchFunnel,
  "individual-query-lineage": individualQueryLineage,
  "analysis-support-row-ledger": analysisSupportRowLedger,
  "stage-prompt-contract": stagePromptContract,
  "adaptive-stop-truth": adaptiveStopTruth,
  "primary-path-ui": primaryPathUi,
  "utf8-no-side-effects": utf8NoSideEffects,
  "verifier-smoke": verifierSmoke,
};

if (!requestedCase && process.env.NODE_TEST_CONTEXT) {
  for (const [name, run] of Object.entries(cases)) {
    await run();
    if (name !== "verifier-smoke") console.log(`research-results-inbox ${name}: pass`);
  }
} else if (!requestedCase || !Object.hasOwn(cases, requestedCase)) {
  console.error(`Unknown or missing --case. Available cases: ${Object.keys(cases).join(", ")}`);
  process.exit(2);
} else {
  try {
    await cases[requestedCase]();
    if (requestedCase !== "verifier-smoke") console.log(`research-results-inbox ${requestedCase}: pass`);
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  }
}
