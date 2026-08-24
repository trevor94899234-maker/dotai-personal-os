import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";

let corePromise;
const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));
async function core() {
  if (!corePromise) {
    const dir = await mkdtemp(join(tmpdir(), "coach-diagnosis-core-"));
    const outfile = join(dir, "etsy-operations.cjs");
    corePromise = build({ entryPoints: [join(PROJECT_ROOT, "src", "lib", "etsyOperations.ts")], absWorkingDir: PROJECT_ROOT, bundle: true, platform: "node", format: "cjs", outfile })
      .then(async () => import(`${pathToFileURL(outfile).href}?v=1`));
  }
  return corePromise;
}

const FRESH_PERIOD = { periodStart: "2026-08-01", periodEnd: "2026-08-20" };
const OLD_PERIOD = { periodStart: "2026-06-01", periodEnd: "2026-06-15" };
const AS_OF = "2026-08-23";

function artifact(overrides = {}) {
  return {
    id: "artifact",
    kind: "listing-performance",
    source: "etsy",
    authority: "primary",
    fileName: "artifact.csv",
    mimeType: "text/csv",
    uploadedAt: "2026-08-21T00:00:00.000Z",
    ...FRESH_PERIOD,
    targetType: "listing",
    targetId: "demo-listing-a",
    ownerConfirmed: true,
    ocrStatus: "not-needed",
    rows: 1,
    headers: [],
    metrics: [],
    contentText: "",
    ...overrides,
  };
}

function addComparableLanes(state, options = {}) {
  const period = options.period ?? FRESH_PERIOD;
  const performance = artifact({
    id: "performance",
    fileName: "performance.csv",
    ...period,
    metrics: options.metrics ?? [
      { label: "Views", value: 12, status: "confirmed" },
      { label: "Favorites", value: 1, status: "confirmed" },
      { label: "Orders", value: 1, status: "confirmed" },
      { label: "Revenue", value: 49, status: "confirmed" },
    ],
  });
  const shop = artifact({ id: "shop", kind: "shop-stats", fileName: "shop.csv", ...period, targetType: "shop", targetId: "shop" });
  const traffic = artifact({ id: "traffic", kind: "traffic-sources", fileName: "traffic.csv", ...period, ...(options.traffic ?? {}) });
  state.artifacts.push(performance, shop, traffic);
  return { performance, shop, traffic };
}

function diagnosisInput(overrides = {}) {
  return { activeDesignId: "demo-design-journal", selectedListingId: "demo-listing-a", ...FRESH_PERIOD, asOf: AS_OF, ...overrides };
}

test("Buyer and occasion are the first gate and block downstream keyword, listing, or image advice", async () => {
  const { DEFAULT_STATE, buildCoachDiagnosis } = await core();
  const state = structuredClone(DEFAULT_STATE);
  state.designs[0].recipient = "";
  state.designs[0].occasion = "";
  state.artifacts.push(artifact({ id: "market", kind: "keyword-research", source: "erank", authority: "supplemental", targetType: "design", targetId: state.designs[0].id }));
  const diagnosis = buildCoachDiagnosis(state, { activeDesignId: state.designs[0].id, asOf: AS_OF });
  assert.equal(diagnosis.stage, "Buyer / occasion");
  assert.equal(diagnosis.firstBrokenLink, "Buyer / occasion missing");
  assert.equal(diagnosis.nextAction.tab, "library");
  assert.doesNotMatch(diagnosis.nextAction.label, /keyword|listing|image/i);
  assert.deepEqual(Object.keys(diagnosis.nextAction).sort(), ["detail", "label", "tab"]);
});

test("New product or niche diagnosis requires an owner-confirmed target-matched market signal", async () => {
  const { DEFAULT_STATE, buildCoachDiagnosis } = await core();
  const state = structuredClone(DEFAULT_STATE);
  addComparableLanes(state);
  const withoutMarket = buildCoachDiagnosis(state, { activeDesignId: state.designs[0].id, asOf: AS_OF });
  assert.equal(withoutMarket.mode, "new-product-niche");
  assert.equal(withoutMarket.stage, "Demand evidence");
  assert.equal(withoutMarket.firstBrokenLink, "Market / buyer signal missing", "existing-listing stats must not substitute for market evidence");

  state.artifacts.push(artifact({ id: "market", kind: "keyword-research", source: "erank", authority: "supplemental", targetType: "design", targetId: state.designs[0].id, metrics: [{ label: "Views", value: 8, status: "confirmed" }] }));
  const withMarket = buildCoachDiagnosis(state, { activeDesignId: state.designs[0].id, asOf: AS_OF });
  assert.equal(withMarket.stage, "Product / niche fit");
  assert.equal(withMarket.firstBrokenLink, "Product / niche fit not evidenced");
  assert.ok(withMarket.evidence.known.some((item) => item.includes("Market signal")));
});

test("New-product market states keep invalid, missing, explicitly stale, OCR-only, and unconfirmed distinct", async () => {
  const { DEFAULT_STATE, buildCoachDiagnosis } = await core();
  const cases = [
    { label: "invalid", artifact: artifact({ id: "market-invalid", kind: "keyword-research", source: "erank", authority: "supplemental", targetType: "design", targetId: "demo-design-journal", metrics: [{ label: "Views", value: null, status: "invalid" }] }), broken: "Market evidence invalid", inventory: "invalid" },
    { label: "missing", artifact: artifact({ id: "market-missing", kind: "keyword-research", source: "erank", authority: "supplemental", targetType: "design", targetId: "demo-design-journal", metrics: [{ label: "Views", value: null, status: "missing" }] }), broken: "Market evidence value missing", inventory: "missing" },
    { label: "stale", artifact: artifact({ id: "market-stale", kind: "keyword-research", source: "erank", authority: "supplemental", targetType: "design", targetId: "demo-design-journal", ...OLD_PERIOD }), broken: "Market signal stale", inventory: "stale", input: { staleAfterDays: 30 } },
    { label: "ocr", artifact: artifact({ id: "market-ocr", kind: "keyword-research", source: "erank", authority: "supplemental", targetType: "design", targetId: "demo-design-journal", mimeType: "image/png", ocrStatus: "unreadable" }), broken: "Market OCR review incomplete", inventory: "ocrReviewOnly" },
    { label: "unconfirmed", artifact: artifact({ id: "market-unconfirmed", kind: "keyword-research", source: "erank", authority: "supplemental", targetType: "design", targetId: "demo-design-journal", ownerConfirmed: false }), broken: "Market evidence unconfirmed", inventory: "unconfirmed" },
  ];
  for (const scenario of cases) {
    const state = structuredClone(DEFAULT_STATE);
    state.artifacts.push(scenario.artifact);
    const diagnosis = buildCoachDiagnosis(state, { activeDesignId: state.designs[0].id, asOf: AS_OF, ...scenario.input });
    assert.equal(diagnosis.firstBrokenLink, scenario.broken, scenario.label);
    assert.ok(diagnosis.evidence[scenario.inventory].length > 0, `${scenario.label} inventory must stay visible`);
  }
});

test("Existing-listing diagnosis stays blocked until all three matching first-party lanes are present", async () => {
  const { DEFAULT_STATE, buildCoachDiagnosis } = await core();
  const state = structuredClone(DEFAULT_STATE);
  state.artifacts.push(artifact({ id: "performance" }));
  const diagnosis = buildCoachDiagnosis(state, diagnosisInput());
  assert.equal(diagnosis.mode, "existing-listing");
  assert.equal(diagnosis.firstBrokenLink, "Comparable first-party evidence incomplete");
  assert.equal(diagnosis.nextAction.tab, "research");
  assert.ok(diagnosis.evidence.missing.some((item) => item.includes("Shop Stats")));
  assert.ok(diagnosis.evidence.missing.some((item) => item.includes("Traffic Sources")));
});

test("Existing-listing diagnosis rejects mismatched periods instead of bleeding groups together", async () => {
  const { DEFAULT_STATE, buildCoachDiagnosis } = await core();
  const state = structuredClone(DEFAULT_STATE);
  addComparableLanes(state, { period: OLD_PERIOD });
  const diagnosis = buildCoachDiagnosis(state, diagnosisInput());
  assert.equal(diagnosis.firstBrokenLink, "Comparable first-party evidence incomplete");
  assert.ok(diagnosis.evidence.missing.length >= 3);
});

test("Conflicting grouped metrics block diagnosis while exact duplicates remain auditable and do not inflate totals", async () => {
  const { DEFAULT_STATE, buildCoachDiagnosis, deriveEvidenceGroups } = await core();
  const state = structuredClone(DEFAULT_STATE);
  addComparableLanes(state);
  state.artifacts.push(artifact({ id: "performance-conflict", fileName: "performance-conflict.csv", metrics: [{ label: "Listing Views", value: 99, status: "confirmed" }, { label: "Favorites", value: 1, status: "confirmed" }, { label: "Orders", value: 1, status: "confirmed" }] }));
  let diagnosis = buildCoachDiagnosis(state, diagnosisInput());
  assert.equal(diagnosis.firstBrokenLink, "Conflicting first-party evidence");
  assert.ok(diagnosis.evidence.conflicting.some((item) => item.includes("Views")));

  state.artifacts.at(-1).metrics[0].value = 12;
  diagnosis = buildCoachDiagnosis(state, diagnosisInput());
  assert.notEqual(diagnosis.firstBrokenLink, "Conflicting first-party evidence");
  assert.ok(diagnosis.evidence.duplicates.some((item) => item.includes("exact duplicate")));
  const performanceGroup = deriveEvidenceGroups(state.artifacts, { asOf: AS_OF }).find((group) => group.kind === "listing-performance");
  assert.equal(performanceGroup.metrics.find((metric) => metric.canonicalLabel === "views").value, 12);
});

test("Unconfirmed conflicting-looking files stay visible but excluded when a valid confirmed group exists", async () => {
  const { DEFAULT_STATE, buildCoachDiagnosis } = await core();
  const state = structuredClone(DEFAULT_STATE);
  addComparableLanes(state);
  state.artifacts.push(artifact({ id: "unconfirmed-performance", fileName: "unconfirmed-performance.csv", ownerConfirmed: false, metrics: [{ label: "Views", value: 999, status: "confirmed" }] }));
  const diagnosis = buildCoachDiagnosis(state, diagnosisInput());
  assert.notEqual(diagnosis.firstBrokenLink, "Conflicting first-party evidence");
  assert.deepEqual(diagnosis.evidence.unconfirmed, ["unconfirmed-performance.csv"]);
});

test("Missing and invalid metrics block separately, while confirmed zero remains valid truth", async () => {
  const { DEFAULT_STATE, buildCoachDiagnosis } = await core();
  const invalidState = structuredClone(DEFAULT_STATE);
  addComparableLanes(invalidState, { metrics: [{ label: "Views", value: null, status: "invalid" }, { label: "Favorites", value: 0, status: "confirmed-zero" }, { label: "Orders", value: 0, status: "confirmed-zero" }] });
  const invalid = buildCoachDiagnosis(invalidState, diagnosisInput());
  assert.equal(invalid.firstBrokenLink, "Invalid first-party value");
  assert.ok(invalid.evidence.invalid.length > 0);

  const missingState = structuredClone(DEFAULT_STATE);
  addComparableLanes(missingState, { metrics: [{ label: "Views", value: null, status: "missing" }, { label: "Favorites", value: 0, status: "confirmed-zero" }, { label: "Orders", value: 0, status: "confirmed-zero" }] });
  const missing = buildCoachDiagnosis(missingState, diagnosisInput());
  assert.equal(missing.firstBrokenLink, "First-party value missing");
  assert.ok(missing.evidence.missing.some((item) => item.includes("Views")));

  const zeroState = structuredClone(DEFAULT_STATE);
  addComparableLanes(zeroState, { metrics: [{ label: "Views", value: 0, status: "confirmed-zero" }, { label: "Favorites", value: 0, status: "confirmed-zero" }, { label: "Orders", value: 0, status: "confirmed-zero" }, { label: "Revenue", value: 0, status: "confirmed-zero" }] });
  const zero = buildCoachDiagnosis(zeroState, diagnosisInput());
  assert.equal(zero.stage, "Traffic");
  assert.equal(zero.firstBrokenLink, "Traffic signal is confirmed zero");
  assert.ok(zero.evidence.zero.some((item) => item.includes("Views")));
  assert.equal(zero.evidence.protected.length, 1);
  assert.match(zero.verdict, /protected|read-only/i);
});

test("Stale and OCR-review-only comparable evidence remain distinct blockers", async () => {
  const { DEFAULT_STATE, buildCoachDiagnosis } = await core();
  const staleState = structuredClone(DEFAULT_STATE);
  addComparableLanes(staleState, { period: OLD_PERIOD });
  const stale = buildCoachDiagnosis(staleState, diagnosisInput({ ...OLD_PERIOD, staleAfterDays: 30 }));
  assert.equal(stale.firstBrokenLink, "Comparable evidence stale");
  assert.equal(stale.evidence.stale.length, 3);

  const ocrState = structuredClone(DEFAULT_STATE);
  addComparableLanes(ocrState, { traffic: { mimeType: "image/png", ocrStatus: "unreadable", contentText: "" } });
  const ocr = buildCoachDiagnosis(ocrState, diagnosisInput());
  assert.equal(ocr.firstBrokenLink, "OCR review incomplete");
  assert.deepEqual(ocr.evidence.ocrReviewOnly, ["traffic.csv"]);
});

test("Old evidence reports date and age neutrally when no owner freshness policy is supplied", async () => {
  const { DEFAULT_STATE, buildCoachDiagnosis } = await core();
  const state = structuredClone(DEFAULT_STATE);
  addComparableLanes(state, { period: OLD_PERIOD });
  const diagnosis = buildCoachDiagnosis(state, diagnosisInput(OLD_PERIOD));
  assert.notEqual(diagnosis.firstBrokenLink, "Comparable evidence stale");
  assert.equal(diagnosis.evidence.stale.length, 0);
  assert.equal(diagnosis.evidence.dated.length, 3);
  assert.ok(diagnosis.evidence.dated.every((item) => item.includes("days since period end")));
});

test("Coach card renders once in Today with progressive evidence detail and one native 44px action", async () => {
  const hub = await readFile(join(PROJECT_ROOT, "src", "components", "EtsyOperationsHub.tsx"), "utf8");
  const card = await readFile(join(PROJECT_ROOT, "src", "components", "CoachDiagnosisCard.tsx"), "utf8");
  assert.equal((hub.match(/<CoachDiagnosisCard/g) ?? []).length, 1);
  assert.match(hub, /operationsTab === "today" && <CoachDiagnosisCard/);
  assert.match(card, /<button type="button"/);
  assert.equal((card.match(/<button type="button"/g) ?? []).length, 1);
  assert.match(card, /min-h-11/);
  assert.match(card, /<details className=/);
  assert.match(card, /aria-labelledby="coach-diagnosis-title"/);
  assert.match(card, /focus-visible:ring-2/);
  assert.doesNotMatch(card, /publish|price|ads|OAuth|account sync/i);
});
