import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import * as XLSX from "xlsx";

let corePromise;
const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));
async function core() {
  if (!corePromise) {
    const dir = await mkdtemp(join(tmpdir(), "etsy-operations-core-"));
    const outfile = join(dir, "etsy-operations.cjs");
    corePromise = build({ entryPoints: [join(PROJECT_ROOT, "src", "lib", "etsyOperations.ts")], absWorkingDir: PROJECT_ROOT, bundle: true, platform: "node", format: "cjs", outfile })
      .then(async () => import(`${pathToFileURL(outfile).href}?v=1`));
  }
  return corePromise;
}

function addReadyDraftEvidence(state, designId, productId, includeKeyword = true) {
  const common = {
    source: "owner",
    authority: "inference",
    mimeType: "text/csv",
    uploadedAt: "2026-08-20T00:00:00.000Z",
    periodStart: "2026-08-20",
    periodEnd: "2026-08-20",
    ownerConfirmed: true,
    ocrStatus: "not-needed",
    rows: 1,
    headers: [],
    metrics: [],
  };
  const artifacts = [
    { ...common, id: `${designId}-facts`, kind: "product-facts", fileName: "facts.csv", targetType: "product", targetId: productId },
    { ...common, id: `${designId}-cost`, kind: "cost-fulfilment", fileName: "cost.csv", targetType: "product", targetId: productId },
  ];
  if (includeKeyword) artifacts.push({ ...common, id: `${designId}-keywords`, kind: "keyword-research", source: "erank", authority: "supplemental", fileName: "keywords.csv", targetType: "design", targetId: designId });
  state.artifacts.push(...artifacts);
}

test("XLSX parsing preserves confirmed zero, missing, and invalid metrics", async () => {
  const { parseWorkbook } = await core();
  const sheet = XLSX.utils.json_to_sheet([
    { Views: 0, Orders: 2, Revenue: "" },
    { Views: 0, Orders: "bad", Revenue: "" },
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Stats");
  const output = await parseWorkbook(XLSX.write(book, { type: "array", bookType: "xlsx" }));
  assert.deepEqual(output.metrics.find((item) => item.label === "Views"), { label: "Views", value: 0, status: "confirmed-zero" });
  assert.deepEqual(output.metrics.find((item) => item.label === "Orders"), { label: "Orders", value: null, status: "invalid" });
  assert.deepEqual(output.metrics.find((item) => item.label === "Revenue"), { label: "Revenue", value: null, status: "missing" });
});

test("Seller decision card stays Unknown until one comparable first-party window is complete", async () => {
  const { DEFAULT_STATE, buildSellerDecision } = await core();
  const decision = buildSellerDecision(structuredClone(DEFAULT_STATE), "demo-listing-a", "2026-08-16");
  assert.equal(decision.status, "collect-data");
  assert.match(decision.whatToUpdate, /Unknown \/ Collect data/);
  assert.equal(decision.signals.views.status, "missing");
  assert.ok(decision.missingEvidence.some((item) => item.includes("Listing Performance")));
});

test("Seller decision card preserves explicit zero without treating it as missing", async () => {
  const { DEFAULT_STATE, buildSellerDecision } = await core();
  const state = structuredClone(DEFAULT_STATE);
  const window = { periodStart: "2026-08-01", periodEnd: "2026-08-07" };
  state.artifacts = [
    { id: "performance", kind: "listing-performance", source: "etsy", authority: "primary", fileName: "performance.csv", mimeType: "text/csv", uploadedAt: "2026-08-08T00:00:00.000Z", ...window, targetType: "listing", targetId: "demo-listing-a", ownerConfirmed: true, ocrStatus: "not-needed", rows: 1, headers: ["Views", "Favorites", "Orders"], metrics: [{ label: "Views", value: 0, status: "confirmed-zero" }, { label: "Favorites", value: 0, status: "confirmed-zero" }, { label: "Orders", value: 0, status: "confirmed-zero" }, { label: "Revenue", value: 0, status: "confirmed-zero" }] },
    { id: "shop", kind: "shop-stats", source: "etsy", authority: "primary", fileName: "shop.csv", mimeType: "text/csv", uploadedAt: "2026-08-08T00:00:00.000Z", ...window, targetType: "shop", targetId: "shop", ownerConfirmed: true, ocrStatus: "not-needed", rows: 1, headers: [], metrics: [] },
    { id: "traffic", kind: "traffic-sources", source: "etsy", authority: "primary", fileName: "traffic.csv", mimeType: "text/csv", uploadedAt: "2026-08-08T00:00:00.000Z", ...window, targetType: "listing", targetId: "demo-listing-a", ownerConfirmed: true, ocrStatus: "not-needed", rows: 1, headers: [], metrics: [] },
  ];
  const decision = buildSellerDecision(state, "demo-listing-a", "2026-08-16");
  assert.equal(decision.signals.views.value, 0);
  assert.equal(decision.signals.views.status, "confirmed-zero");
  assert.equal(decision.signals.orders.status, "confirmed-zero");
  assert.equal(decision.missingEvidence.length, 0);
  assert.equal(decision.status, "ready");
  assert.match(decision.triggerSignal, /missing or invalid is not zero/i);
  assert.doesNotMatch(decision.whatToUpdate, /first-image/);
  assert.ok(decision.maintenanceMap.some((item) => item.id === "photos-video"));
});

test("Seller decision card blocks invalid metrics and only proposes one draft variable for a clean intent gap", async () => {
  const { DEFAULT_STATE, buildSellerDecision } = await core();
  const state = structuredClone(DEFAULT_STATE);
  state.listings[0].protected = false;
  const window = { periodStart: "2026-08-01", periodEnd: "2026-08-14" };
  const common = { source: "etsy", authority: "primary", uploadedAt: "2026-08-15T00:00:00.000Z", ...window, ownerConfirmed: true, ocrStatus: "not-needed", rows: 1, headers: [], metrics: [] };
  state.artifacts = [
    { id: "performance", kind: "listing-performance", fileName: "performance.csv", mimeType: "text/csv", ...common, targetType: "listing", targetId: "demo-listing-a", metrics: [{ label: "Views", value: 48, status: "confirmed" }, { label: "Favorites", value: 0, status: "confirmed-zero" }, { label: "Orders", value: 0, status: "confirmed-zero" }, { label: "Revenue", value: 0, status: "confirmed-zero" }] },
    { id: "shop", kind: "shop-stats", fileName: "shop.csv", mimeType: "text/csv", ...common, targetType: "shop", targetId: "shop" },
    { id: "traffic", kind: "traffic-sources", fileName: "traffic.csv", mimeType: "text/csv", ...common, targetType: "listing", targetId: "demo-listing-a" },
  ];
  const ready = buildSellerDecision(state, "demo-listing-a", "2026-08-16");
  assert.equal(ready.status, "ready");
  assert.match(ready.whatToUpdate, /static maintenance map/);
  assert.match(ready.observationWindow, /does not create a new threshold/);
  assert.doesNotMatch(ready.whatToUpdate, /first-image/);

  state.artifacts[0].metrics[1] = { label: "Favorites", value: null, status: "invalid" };
  const blocked = buildSellerDecision(state, "demo-listing-a", "2026-08-16");
  assert.equal(blocked.status, "collect-data");
  assert.ok(blocked.missingEvidence.some((item) => item.includes("Favorites is invalid")));
  assert.match(blocked.whatToUpdate, /Unknown \/ Collect data/);
});

test("Seller decision card keeps a protected listing inside its observation gate", async () => {
  const { DEFAULT_STATE, buildSellerDecision } = await core();
  const state = structuredClone(DEFAULT_STATE);
  state.listings[0].observationEnd = "2026-08-20";
  const window = { periodStart: "2026-08-01", periodEnd: "2026-08-14" };
  const common = { source: "etsy", authority: "primary", uploadedAt: "2026-08-15T00:00:00.000Z", ...window, ownerConfirmed: true, ocrStatus: "not-needed", rows: 1, headers: [], metrics: [] };
  state.artifacts = [
    { id: "performance", kind: "listing-performance", fileName: "performance.csv", mimeType: "text/csv", ...common, targetType: "listing", targetId: "demo-listing-a", metrics: [{ label: "Views", value: 48, status: "confirmed" }, { label: "Favorites", value: 0, status: "confirmed-zero" }, { label: "Orders", value: 0, status: "confirmed-zero" }] },
    { id: "shop", kind: "shop-stats", fileName: "shop.csv", mimeType: "text/csv", ...common, targetType: "shop", targetId: "shop" },
    { id: "traffic", kind: "traffic-sources", fileName: "traffic.csv", mimeType: "text/csv", ...common, targetType: "listing", targetId: "demo-listing-a" },
  ];
  const decision = buildSellerDecision(state, "demo-listing-a", "2026-08-16");
  assert.equal(decision.status, "ready");
  assert.match(decision.protectedNote, /unchanged until 2026-08-20/);
  assert.match(decision.protectedNote, /local draft/);
});

test("Working context routes missing inputs and OCR review to evidence intake", async () => {
  const { buildWorkingContext } = await core();
  const base = { tab: "today", currentStage: 2, designName: "public demo Journal", selectedListingTitle: "Parents 2-Book Set", selectedListingProtected: false, selectedProductName: "Journal", socialListingTitle: "", briefGapCount: 1, researchCount: 0, hasKeywordDecision: false, hasDraft: false, hasApprovedDraft: false, auditGapCount: 3, metricStatus: undefined, ocrReviewStatus: "none", ownerConfirmationNeeded: false, productEvidenceGapCount: 1 };
  assert.deepEqual(buildWorkingContext(base), { item: "public demo Journal", stage: "Today · Stage 2 of 5", status: "Missing inputs", tone: "attention", action: "Add the next missing input", actionTab: "research" });
  assert.equal(buildWorkingContext({ ...base, briefGapCount: 0, ocrReviewStatus: "pending" }).status, "OCR review needed");
  assert.equal(buildWorkingContext({ ...base, briefGapCount: 0, ocrReviewStatus: "unreadable" }).status, "OCR visual review only");
});

test("Working context keeps protected listings read-only and drafts local", async () => {
  const { buildWorkingContext } = await core();
  const base = { tab: "analysis", currentStage: 3, designName: "public demo Journal", selectedListingTitle: "Parents 2-Book Set", selectedListingProtected: true, selectedProductName: "Journal", socialListingTitle: "", briefGapCount: 0, researchCount: 1, hasKeywordDecision: true, hasDraft: false, hasApprovedDraft: false, auditGapCount: 0, metricStatus: undefined, ocrReviewStatus: "none", ownerConfirmationNeeded: false, productEvidenceGapCount: 0 };
  const protectedContext = buildWorkingContext(base);
  assert.equal(protectedContext.status, "Protected / read-only");
  assert.equal(protectedContext.action, "Prepare the read-only audit packet");
  const draftContext = buildWorkingContext({ ...base, tab: "results", selectedListingProtected: false, hasDraft: true });
  assert.equal(draftContext.status, "Draft only");
  assert.equal(draftContext.action, "Review and approve the saved draft");
});

test("Working context covers all six tabs without synthetic selections and routes every cross-tab action", async () => {
  const { buildWorkingContext } = await core();
  const base = { tab: "today", currentStage: 2, designName: undefined, selectedListingTitle: undefined, selectedListingProtected: false, selectedProductName: undefined, socialListingTitle: undefined, briefGapCount: 0, researchCount: 0, hasKeywordDecision: false, hasDraft: false, hasApprovedDraft: false, auditGapCount: 0, metricStatus: undefined, ocrReviewStatus: "none", ownerConfirmationNeeded: false, productEvidenceGapCount: 0 };
  assert.deepEqual(buildWorkingContext(base), { item: "No working item selected", stage: "Choose working context", status: "Missing target", tone: "attention", action: "Select or start a local research item", actionTab: "research" });
  assert.equal(buildWorkingContext({ ...base, tab: "research", designName: "Journal", researchCount: 1 }).actionTab, "analysis");
  assert.deepEqual(buildWorkingContext({ ...base, tab: "analysis" }), { item: "No working item selected", stage: "Listing selection", status: "Missing target", tone: "attention", action: "Select a listing for read-only analysis" });
  assert.equal(buildWorkingContext({ ...base, tab: "analysis", selectedListingTitle: "Listing", auditGapCount: 1 }).actionTab, "research");
  assert.equal(buildWorkingContext({ ...base, tab: "results" }).actionTab, "analysis");
  assert.equal(buildWorkingContext({ ...base, tab: "results", designName: "Journal", hasKeywordDecision: true }).actionTab, undefined);
  assert.equal(buildWorkingContext({ ...base, tab: "library", selectedProductName: "Journal", productEvidenceGapCount: 1 }).actionTab, "research");
  assert.equal(buildWorkingContext({ ...base, tab: "social" }).item, "No working item selected");
  assert.equal(buildWorkingContext({ ...base, tab: "social", socialListingTitle: "Listing" }).status, "Attribution unconfirmed");
});

test("Working context keeps invalid, confirmed zero, owner confirmation, and owner approval distinct", async () => {
  const { buildWorkingContext } = await core();
  const base = { tab: "research", currentStage: 2, designName: "Journal", selectedListingTitle: undefined, selectedListingProtected: false, selectedProductName: "Journal", socialListingTitle: undefined, briefGapCount: 0, researchCount: 1, hasKeywordDecision: false, hasDraft: false, hasApprovedDraft: false, auditGapCount: 0, metricStatus: undefined, ocrReviewStatus: "none", ownerConfirmationNeeded: false, productEvidenceGapCount: 0 };
  assert.equal(buildWorkingContext({ ...base, metricStatus: "invalid" }).status, "Invalid data");
  assert.equal(buildWorkingContext({ ...base, metricStatus: "confirmed-zero" }).status, "Confirmed zero");
  assert.equal(buildWorkingContext({ ...base, ownerConfirmationNeeded: true }).status, "Owner confirmation needed");
  assert.equal(buildWorkingContext({ ...base, tab: "results", hasDraft: true, hasApprovedDraft: true }).status, "Approved for manual entry");
});

test("Working item state cannot inherit public demo research, keyword, draft, or approval state", async () => {
  const { DEFAULT_STATE, deriveWorkingItemState } = await core();
  const state = structuredClone(DEFAULT_STATE);
  const demoDesignId = "demo-design-journal";
  state.designs.push({ id: "design-other", name: "Other journal design", productId: "product-standard-journal", recipient: "Friend", occasion: "Birthday", mockupStatus: "ready", assetName: "other.png" });
  state.artifacts.push({ id: "demo-keywords", kind: "keyword-research", source: "erank", authority: "supplemental", fileName: "demo.csv", mimeType: "text/csv", uploadedAt: "2026-08-15T00:00:00.000Z", periodStart: "2026-08-15", periodEnd: "2026-08-15", targetType: "design", targetId: demoDesignId, ownerConfirmed: true, ocrStatus: "not-needed", rows: 5, headers: ["Keyword"], metrics: [] });
  addReadyDraftEvidence(state, demoDesignId, "product-standard-journal", false);
  state.keywordResearchLoops.push({ designId: demoDesignId, round: 1, stage: "conclusion-ready", queries: ["one", "two", "three", "four", "five"], requestReason: "public demo only", primaryKeyword: "mom journal", updatedAt: "2026-08-15T00:00:00.000Z" });
  state.listingDrafts.push({ id: "design04-draft", productId: "product-standard-journal", designId: demoDesignId, sourcePacket: "public demo only", tags: [], evidenceIds: ["demo-keywords"], status: "approved-for-manual-entry", createdAt: "2026-08-15T00:00:00.000Z", approvedAt: "2026-08-15T00:00:00.000Z" });

  const design04 = deriveWorkingItemState(state, demoDesignId, "product-standard-journal", ["one", "two", "three", "four", "five"]);
  const other = deriveWorkingItemState(state, "design-other", "product-standard-journal", ["alpha", "beta", "gamma", "delta", "epsilon"]);
  assert.equal(design04.researchCount, 1);
  assert.equal(design04.hasKeywordDecision, true);
  assert.equal(design04.hasApprovedDraft, true);
  assert.equal(other.researchCount, 0);
  assert.equal(other.hasKeywordDecision, false);
  assert.equal(other.hasDraft, false);
  assert.equal(other.hasApprovedDraft, false);
  assert.ok(other.briefGapCount > 0, "unrelated public demo keyword evidence must not complete another design's brief");
});

test("Current draft approval never falls back to an older approved package", async () => {
  const { DEFAULT_STATE, deriveActiveDraftState, deriveWorkingItemState } = await core();
  const state = structuredClone(DEFAULT_STATE);
  const designId = "demo-design-journal";
  const productId = "product-standard-journal";
  const seeds = ["mom journal", "story journal", "memory journal", "family journal", "gift journal"];
  addReadyDraftEvidence(state, designId, productId);
  const olderApproved = { id: "older-approved", productId, designId, sourcePacket: "TITLE\nOlder approved package", tags: [], evidenceIds: [], status: "approved-for-manual-entry", createdAt: "2026-08-19T00:00:00.000Z", approvedAt: "2026-08-19T01:00:00.000Z" };
  const newerCurrent = { id: "newer-current", productId, designId, sourcePacket: "TITLE\nCurrent engraved journal\n\nDESCRIPTION\nAn engraved keepsake.", tags: [], evidenceIds: [], status: "draft", createdAt: "2026-08-20T00:00:00.000Z" };
  state.listingDrafts = [olderApproved, newerCurrent];

  let active = deriveActiveDraftState(state.listingDrafts, designId);
  assert.equal(active.currentDraft?.id, newerCurrent.id);
  assert.equal(active.hasApprovedDraft, false);
  assert.equal(active.approvedDraft, undefined, "the older approved package must not become the active copy source");
  assert.equal(deriveWorkingItemState(state, designId, productId, seeds).hasApprovedDraft, false);

  newerCurrent.status = "approved-for-manual-entry";
  active = deriveActiveDraftState(state.listingDrafts, designId);
  assert.equal(active.approvedDraft?.id, newerCurrent.id);
  assert.notEqual(active.approvedDraft?.id, olderApproved.id);
  assert.equal(deriveWorkingItemState(state, designId, productId, seeds).hasApprovedDraft, false, "a blocked current package is not approved even when its stored status says approved");
});

test("Owner Gate rejects blocked claims anywhere in the saved customer-facing package", async () => {
  const { DEFAULT_STATE, collectListingDraftApprovalIssues } = await core();
  const state = structuredClone(DEFAULT_STATE);
  const designId = "demo-design-journal";
  const productId = "product-standard-journal";
  const seeds = ["mom journal", "story journal", "memory journal", "family journal", "gift journal"];
  addReadyDraftEvidence(state, designId, productId);
  const packages = [
    ["title", "TITLE\nPersonalized Engraved Mom Journal\n\nDESCRIPTION\nA family keepsake."],
    ["description", "TITLE\nPersonalized Mom Story Journal\n\nDESCRIPTION\nAn engraved keepsake for Mom."],
    ["source packet", "TITLE\nPersonalized Mom Story Journal\n\nSOCIAL COPY\nChoose this engraved journal for Mom."],
  ];

  for (const [location, sourcePacket] of packages) {
    const draft = { id: `blocked-${location}`, productId, designId, sourcePacket, tags: [], evidenceIds: [], status: "draft", createdAt: "2026-08-20T00:00:00.000Z" };
    assert.deepEqual(
      collectListingDraftApprovalIssues(state, draft, seeds),
      ['Saved customer-facing package conflicts with blocked claim "engraved"'],
      `${location} blocked claim must stop Owner Gate approval`,
    );
  }
});

test("Active non-demo content uses its own Results package and Today labels", async () => {
  const { DEFAULT_STATE, deriveActiveDesignContent } = await core();
  const state = structuredClone(DEFAULT_STATE);
  const designId = "design-sunflower-teacher-journal";
  const designName = "Sunflower Teacher Gratitude Journal";
  const sourcePacket = `TITLE\n${designName} Gift\n\nDESCRIPTION\nA ${designName} keepsake for a teacher.`;
  const demoPacket = "TITLE\nPublic Demo Sample\n\nDESCRIPTION\npublic demo copy.";
  state.designs.push({ id: designId, name: designName, productId: "product-standard-journal", recipient: "Teacher", occasion: "Appreciation", mockupStatus: "ready", assetName: "sunflower-teacher.png" });
  state.listingDrafts.push({ id: "sunflower-current", productId: "product-standard-journal", designId, sourcePacket, tags: [], evidenceIds: [], status: "draft", createdAt: "2026-08-20T00:00:00.000Z" });

  const content = deriveActiveDesignContent(state, designId, { designId: "demo-design-journal", sourcePacket: demoPacket });
  assert.equal(content.designName, designName);
  assert.ok(content.todayLabel.includes(designName));
  assert.equal(content.designStepDetail, designName);
  assert.equal(content.draftTitle, `${designName} Gift`);
  assert.equal(content.sourcePacket, sourcePacket);
  assert.equal(JSON.stringify(content).includes("Public Demo Sample"), false);
  assert.equal(JSON.stringify(content).includes("public demo copy"), false);
});

test("Primary dashboard turns the active design state into analysis, decision, and business action", async () => {
  const { buildPrimaryDashboardSummary } = await core();
  const empty = buildPrimaryDashboardSummary({ designName: "Teacher design", researchCount: 0, supportingKeywordCount: 0, hasDraft: false, hasApprovedDraft: false, draftReadyForApproval: false });
  assert.deepEqual(empty, { hasAnalysis: false, emptyMessage: "暫未有足夠資料產生分析。" });
  assert.equal(empty.actionLabel, undefined, "missing data must not become a large primary data-collection action");

  const research = buildPrimaryDashboardSummary({ designName: "Teacher design", researchCount: 2, supportingKeywordCount: 0, hasDraft: false, hasApprovedDraft: false, draftReadyForApproval: false });
  assert.equal(research.hasAnalysis, true);
  assert.equal(research.actionLabel, "完成關鍵字取捨");
  assert.equal(research.actionTab, "research");
  assert.match(research.analysisFocus, /2 份 research input/);
  assert.doesNotMatch(JSON.stringify(research), /public demo|Collect|evidence blocked/i);

  const keyword = buildPrimaryDashboardSummary({ designName: "Teacher design", researchCount: 2, primaryKeyword: "teacher journal", supportingKeywordCount: 3, hasDraft: false, hasApprovedDraft: false, draftReadyForApproval: false });
  assert.match(keyword.analysisFocus, /teacher journal/);
  assert.match(keyword.proposedDecision, /teacher journal/);
  assert.equal(keyword.actionLabel, "建立 Listing Brief");

  const draft = buildPrimaryDashboardSummary({ designName: "Teacher design", researchCount: 2, primaryKeyword: "teacher journal", supportingKeywordCount: 3, hasDraft: true, hasApprovedDraft: false, draftTitle: "Teacher Story Journal", draftReadyForApproval: false });
  assert.equal(draft.actionLabel, "改善 Listing Brief 內容");
  assert.match(draft.analysisFocus, /Teacher Story Journal/);
});

test("Working Context currentStage follows the actual working design state", async () => {
  const { DEFAULT_STATE, buildWorkingContext, deriveWorkingItemState } = await core();
  const state = structuredClone(DEFAULT_STATE);
  const demoDesignId = "demo-design-journal";
  const otherDesignId = "design-other-stage";
  state.designs.push({ id: otherDesignId, name: "Other design", productId: "product-standard-journal", recipient: "Friend", occasion: "Birthday", mockupStatus: "ready", assetName: "other.png" });
  const evidence = (id, kind, targetType, targetId) => ({ id, kind, source: "owner", authority: "primary", fileName: `${id}.csv`, mimeType: "text/csv", uploadedAt: "2026-08-15T00:00:00.000Z", periodStart: "2026-08-15", periodEnd: "2026-08-15", targetType, targetId, ownerConfirmed: true, ocrStatus: "not-needed", rows: 1, headers: ["Keyword"], metrics: [] });
  state.artifacts.push(evidence("other-facts", "product-facts", "product", "product-standard-journal"), evidence("other-cost", "cost-fulfilment", "product", "product-standard-journal"), evidence("other-research", "keyword-research", "design", otherDesignId));
  const design04State = deriveWorkingItemState(state, demoDesignId, "product-standard-journal", []);
  const otherState = deriveWorkingItemState(state, otherDesignId, "product-standard-journal", ["one", "two", "three", "four", "five"]);
  assert.notEqual(design04State.currentStage, otherState.currentStage);
  assert.equal(design04State.currentStage, 1);
  assert.equal(otherState.currentStage, 3);
  assert.equal(buildWorkingContext({ tab: "today", currentStage: otherState.currentStage, designName: "Other design", selectedListingTitle: undefined, selectedListingProtected: false, selectedProductName: "Journal", socialListingTitle: undefined, briefGapCount: otherState.briefGapCount, researchCount: otherState.researchCount, hasKeywordDecision: otherState.hasKeywordDecision, hasDraft: otherState.hasDraft, hasApprovedDraft: otherState.hasApprovedDraft, auditGapCount: 0, metricStatus: undefined, ocrReviewStatus: "none", ownerConfirmationNeeded: false, productEvidenceGapCount: otherState.productEvidenceGapCount }).stage, "Codex analysis");
});

test("Working item state uses the selected library product instead of Journal evidence gaps", async () => {
  const { DEFAULT_STATE, buildWorkingContext, deriveWorkingItemState } = await core();
  const state = structuredClone(DEFAULT_STATE);
  state.products.push({ id: "product-other", name: "Other complete product", type: "Plaque", material: "Acrylic", size: "5x7", productionMethod: "Printed", fulfilmentSource: "Confirmed supplier", costSource: "Confirmed cost sheet", allowedClaims: "printed", blockedClaims: "engraved", sourceNote: "Owner-confirmed sources" });
  const evidence = (id, kind) => ({ id, kind, source: "owner", authority: "primary", fileName: `${id}.csv`, mimeType: "text/csv", uploadedAt: "2026-08-15T00:00:00.000Z", periodStart: "2026-08-15", periodEnd: "2026-08-15", targetType: "product", targetId: "product-other", ownerConfirmed: true, ocrStatus: "not-needed", rows: 1, headers: [], metrics: [] });
  state.artifacts.push(evidence("other-facts", "product-facts"), evidence("other-cost", "cost-fulfilment"));

  const journal = deriveWorkingItemState(state, undefined, "product-standard-journal");
  const other = deriveWorkingItemState(state, undefined, "product-other");
  assert.ok(journal.productEvidenceGapCount > 0);
  assert.equal(other.productEvidenceGapCount, 0);
  const base = { tab: "library", currentStage: 1, designName: undefined, selectedListingTitle: undefined, selectedListingProtected: false, selectedProductName: "Other complete product", socialListingTitle: undefined, briefGapCount: 0, researchCount: 0, hasKeywordDecision: false, hasDraft: false, hasApprovedDraft: false, auditGapCount: 0, metricStatus: undefined, ocrReviewStatus: "none", ownerConfirmationNeeded: false };
  assert.equal(buildWorkingContext({ ...base, productEvidenceGapCount: other.productEvidenceGapCount }).status, "Ready");
  assert.equal(buildWorkingContext({ ...base, selectedProductName: "Journal", productEvidenceGapCount: journal.productEvidenceGapCount }).status, "Missing inputs");
});

test("Working context exposes exactly four safe fields plus optional local routing", async () => {
  const { buildWorkingContext } = await core();
  const base = { currentStage: 3, designName: "Journal", selectedListingTitle: "Protected listing", selectedListingProtected: true, selectedProductName: "Journal", socialListingTitle: "Protected listing", briefGapCount: 0, researchCount: 1, hasKeywordDecision: true, hasDraft: true, hasApprovedDraft: false, auditGapCount: 0, metricStatus: undefined, ocrReviewStatus: "none", ownerConfirmationNeeded: false, productEvidenceGapCount: 0 };
  for (const tab of ["today", "research", "analysis", "results", "library", "social"]) {
    const context = buildWorkingContext({ ...base, tab });
    assert.deepEqual(Object.keys(context).sort(), [...(context.actionTab ? ["actionTab"] : []), "action", "item", "stage", "status", "tone"].sort());
    assert.doesNotMatch(context.action, /publish|live edit|price|ads|customer contact|external send/i);
  }
});

test("Metric status summary preserves invalid, missing, confirmed zero, and positive confirmation", async () => {
  const { summarizeMetricStatus } = await core();
  const artifact = (statuses) => ({ metrics: statuses.map((status) => ({ label: status, value: status === "confirmed-zero" ? 0 : null, status })) });
  assert.equal(summarizeMetricStatus([artifact(["confirmed-zero"])]), "confirmed-zero");
  assert.equal(summarizeMetricStatus([artifact(["confirmed-zero", "confirmed"])]), "confirmed");
  assert.equal(summarizeMetricStatus([artifact(["confirmed", "missing"])]), "missing");
  assert.equal(summarizeMetricStatus([artifact(["confirmed", "invalid"])]), "invalid");
});

test("Primary dashboard keeps six tabs, consolidated hierarchy, active-design binding, and native keyboard semantics", async () => {
  const source = await readFile(join(PROJECT_ROOT, "src", "components", "EtsyOperationsHub.tsx"), "utf8");
  for (const tab of ["today", "research", "analysis", "results", "library", "social"]) assert.ok(source.includes(`["${tab}",`), `missing ${tab} tab`);
  for (const label of ["目前設計", "分析重點", "建議決定", "執行動作"]) assert.ok(source.includes(label), `missing primary hierarchy label: ${label}`);
  assert.match(source, /buildPrimaryDashboardSummary\(\{/);
  assert.match(source, /designName: activeDesign\?\.name/);
  assert.match(source, /aria-label=\{`\$\{primaryDashboard\.actionLabel\}/);
  assert.match(source, /focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2/);
  assert.match(source, /grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4/);
  assert.doesNotMatch(source, />Current stage<|>Data status<|>One next action</);
  assert.doesNotMatch(source, /decisionControl\.nextAction\.label/);
  assert.match(source, /資料與安全檢查（需要時先睇）/);
  for (const field of ["briefGapCount", "researchCount", "hasKeywordDecision", "hasDraft", "hasApprovedDraft", "productEvidenceGapCount"]) {
    assert.ok(source.includes(`${field}: workingItemState.${field}`), `${field} is not bound to the working item`);
  }
  assert.match(source, /operationsTab === "library" \? selectedProduct\?\.id : workingDesign\?\.productId/);
  assert.doesNotMatch(source, /briefGapCount: design04BriefGaps|researchCount: design04Research|productEvidenceGapCount: journalEvidenceGaps/);
});

test("Presentation mode keeps a five-scene Traditional Chinese shell and hides development surfaces", async () => {
  const hub = await readFile(join(PROJECT_ROOT, "src", "components", "EtsyOperationsHub.tsx"), "utf8");
  const presentation = await readFile(join(PROJECT_ROOT, "src", "components", "EtsyPresentationMode.tsx"), "utf8");
  for (const scene of ["問題", "證據進場", "決策控制", "草稿輸出", "店主批准"]) {
    assert.ok(presentation.includes(scene), `missing presentation scene: ${scene}`);
  }
  assert.match(presentation, /概念簡報 · 工作流程展示版/);
  assert.match(presentation, /現有功能會按階段開發，明日只展示核心流程/);
  assert.match(presentation, /唔連接 Etsy、唔修改、唔改廣告、唔發佈/);
  assert.match(presentation, /text-\[9px\] font-bold leading-none sm:text-\[10px\]/);
  assert.doesNotMatch(presentation, /hidden text-\[10px\] font-bold sm:block/);
  assert.match(hub, /presentationOnly = false/);
  assert.match(hub, /presentationOnly \? "presentation" : "prototype"/);
  assert.match(hub, /!presentationOnly/);
  assert.doesNotMatch(presentation, /Prototype workspace|Explore prototype workspace|Historical report/i);
});

test("Implementation workspace exposes an implementation map without promoting Phase 2 social tracking", async () => {
  const source = await readFile(join(PROJECT_ROOT, "src", "components", "EtsyOperationsHub.tsx"), "utf8");
  assert.match(source, /aria-label="Implementation map"/);
  assert.match(source, /<details className="overflow-hidden[^>]+aria-label="Implementation map"/);
  for (const lane of ["今日下一步", "Research 資料", "分析與決定", "Listing Brief", "Owner Gate", "Social tracking"]) {
    assert.ok(source.includes(`label: "${lane}"`), `missing implementation lane: ${lane}`);
  }
  assert.match(source, /Presentation → product/);
  assert.match(source, /status: "phase-2"/);
  assert.match(source, /attribution 未確認/);
  assert.match(source, /onClick=\{\(\) => setOperationsTab\(lane\.tab\)\}/);
});

test("Actual workspace is the canonical Etsy entry point and legacy actions route back to it", async () => {
  const source = await readFile(join(PROJECT_ROOT, "src", "views", "EtsyDecisionView.tsx"), "utf8");
  assert.match(source, /useState<"workspace" \| "history">\("workspace"\)/);
  assert.match(source, /presentationOnly = false/);
  assert.match(source, /實際工作區 · 可以繼續開發/);
  assert.match(source, /<EtsyOperationsHub initialTab=\{workspaceStartTab\} presentationOnly=\{presentationOnly\} \/>/);
  assert.doesNotMatch(source, /歷史報告/);
  assert.match(source, /Open current evidence workflow/);
  assert.match(source, /Open current Owner Gate/);
  assert.doesNotMatch(source, /etsy-evidence-intake-draft/);
  assert.doesNotMatch(source, /onClick=\{\(\) => choose\(/);
});

test("Dashboard starts from two explicit routes and persists one shared working context", async () => {
  const hub = await readFile(join(PROJECT_ROOT, "src", "components", "EtsyOperationsHub.tsx"), "utf8");
  const research = await readFile(join(PROJECT_ROOT, "src", "components", "KeywordResearchWorkspace.tsx"), "utf8");
  for (const label of ["Existing Listing Audit", "New Product Development", "WORKING_CONTEXT_KEY", "selectedListingId", "periodStart", "periodEnd"]) assert.ok(hub.includes(label), `missing shared-context contract: ${label}`);
  assert.match(hub, /localStorage\.setItem\(WORKING_CONTEXT_KEY/);
  assert.match(hub, /aria-pressed=\{workMode === "listing-audit"\}/);
  assert.match(hub, /aria-pressed=\{workMode === "product-development"\}/);
  assert.match(hub, /KeywordResearchWorkspace selectedDesignId=\{activeDesignId\} onSelectDesign=\{chooseActiveDesign\}/);
  assert.match(research, /controlledDesignId \?\? localDesignId/);
  assert.doesNotMatch(research, /const \[selectedDesignId, setSelectedDesignId\]/);
});

test("Demo hydration seeds only empty collections and preserves existing owner records", async () => {
  const { DEFAULT_STATE, hydrateKnownDesigns, hydrateKnownProducts } = await core();
  const ownerState = {
    ...structuredClone(DEFAULT_STATE),
    products: [{ ...DEFAULT_STATE.products[0], id: "owner-product", name: "Private owner product" }],
    designs: [{ ...DEFAULT_STATE.designs[0], id: "owner-design", productId: "owner-product", name: "Private owner design" }],
  };
  assert.equal(hydrateKnownProducts(ownerState), ownerState);
  assert.equal(hydrateKnownDesigns(ownerState), ownerState);
  assert.deepEqual(hydrateKnownProducts({ ...ownerState, products: [] }).products.map((item) => item.id), DEFAULT_STATE.products.map((item) => item.id));
  assert.deepEqual(hydrateKnownDesigns({ ...ownerState, designs: [] }).designs.map((item) => item.id), DEFAULT_STATE.designs.map((item) => item.id));
});

test("Historical pipeline derives Evidence and Diagnose state from the loaded decision", async () => {
  const source = await readFile(join(PROJECT_ROOT, "src", "views", "EtsyDecisionView.tsx"), "utf8");
  assert.match(source, /const listingRows = decision\?\.source\.listingRows \?\? 0/);
  assert.match(source, /const duplicateGroups = decision\?\.metrics\.duplicateTitleGroups \?\? 0/);
  assert.match(source, /listingRows > 0 \? "complete" : "waiting"/);
  assert.match(source, /duplicateGroups > 0 \? "complete" : "waiting"/);
  assert.match(source, /No duplicate groups found/);
  assert.match(source, /\}, \[choice, decision\]\)/);
  assert.doesNotMatch(source, /Historical exports loaded|Duplicate risk ranked/);
});

test("Daily workflow follows one persisted active design and reuses the strict approval validator", async () => {
  const source = await readFile(join(PROJECT_ROOT, "src", "components", "EtsyOperationsHub.tsx"), "utf8");
  assert.match(source, /ACTIVE_DESIGN_KEY/);
  assert.match(source, /useState\(loadActiveDesignId\)/);
  assert.match(source, /value=\{activeDesign\?\.id \?\? ""\}/);
  assert.match(source, /function chooseActiveDesign\(nextDesignId: string\)[\s\S]*setActiveDesignId\(nextDesignId\)/);
  assert.match(source, /onChange=\{\(event\) => chooseActiveDesign\(event\.target\.value\)\}/);
  assert.match(source, /collectListingDraftApprovalIssues\(state, draft, approvalSeeds\)/);
  assert.match(source, /draft\.designId === DEFAULT_ACTIVE_DESIGN_ID \? DEMO_SEEDS : \[\]/);
});

test("Canonical evidence workflow has mobile cards and focuses the review heading", async () => {
  const source = await readFile(join(PROJECT_ROOT, "src", "components", "EvidenceIntakeStepper.tsx"), "utf8");
  assert.match(source, /aria-label="Saved evidence"/);
  assert.match(source, /grid gap-3 sm:hidden/);
  assert.match(source, /className="hidden sm:block"/);
  assert.match(source, /reviewHeadingRef\.current\?\.focus\(\)/);
  assert.match(source, /ref=\{reviewHeadingRef\} tabIndex=\{-1\}/);
});

test("Trust Ledger keeps the desktop table and uses stacked, breakable mobile cards", async () => {
  const source = await readFile(join(PROJECT_ROOT, "src", "views", "EtsyDecisionView.tsx"), "utf8");
  assert.match(source, /hidden overflow-x-auto rounded-2xl border border-line sm:block/);
  assert.match(source, /w-full min-w-\[720px\] border-collapse text-left text-xs/);
  assert.match(source, /grid gap-3 sm:hidden/);
  assert.match(source, /className="min-w-0 rounded-2xl border border-line bg-\[#FBF7F2\] p-4"/);
  assert.match(source, /className="mt-3 break-words font-display text-xl font-bold text-ink"/);
  assert.match(source, /className="mt-4 grid min-w-0 gap-3 text-xs"/);
  assert.match(source, /Source: \{item\.source\}/);
});

test("Audit packet gate requires three owner-confirmed Etsy first-party artifacts", async () => {
  const { DEFAULT_STATE, auditMissing } = await core();
  const base = structuredClone(DEFAULT_STATE);
  const artifact = (kind) => ({ id: kind, kind, source: "etsy", authority: "primary", fileName: `${kind}.csv`, mimeType: "text/csv", uploadedAt: "2026-08-09T00:00:00.000Z", periodStart: "2026-08-01", periodEnd: "2026-08-07", targetType: kind === "shop-stats" ? "shop" : "listing", targetId: kind === "shop-stats" ? "shop" : "demo-listing-a", ownerConfirmed: true, ocrStatus: "not-needed", rows: 1, headers: [], metrics: [] });
  assert.equal(auditMissing(base, "demo-listing-a", "2026-08-01", "2026-08-07").length, 3);
  base.artifacts = [artifact("shop-stats"), artifact("listing-performance"), artifact("traffic-sources")];
  assert.deepEqual(auditMissing(base, "demo-listing-a", "2026-08-01", "2026-08-07"), []);
  base.artifacts[1].ownerConfirmed = false;
  assert.deepEqual(auditMissing(base, "demo-listing-a", "2026-08-01", "2026-08-07"), ["Etsy Listing Performance"]);
});

test("New listing gate blocks missing product facts, linked design, and research evidence", async () => {
  const { DEFAULT_STATE, listingBriefMissing } = await core();
  const state = structuredClone(DEFAULT_STATE);
  assert.equal(listingBriefMissing(state, "product-1", "design-1", ["one", "two", "three", "four", "five"]).length, 3);
  state.products.push({ id: "product-1", name: "Journal", type: "Journal", material: "vegan leather", size: "5x8", productionMethod: "printed", fulfilmentSource: "Empire", costSource: "Empire Builder", allowedClaims: "printed", blockedClaims: "engraved", sourceNote: "owner screenshot", factsStatus: "confirmed-current" });
  state.designs.push({ id: "design-1", name: "Dad", productId: "product-1", recipient: "Dad", occasion: "Birthday", mockupStatus: "ready", assetName: "dad.png" });
  state.artifacts.push({ id: "keywords", kind: "keyword-research", source: "erank", authority: "supplemental", fileName: "keywords.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", uploadedAt: "2026-08-09T00:00:00.000Z", periodStart: "2026-08-01", periodEnd: "2026-08-07", targetType: "product", targetId: "product-1", ownerConfirmed: true, ocrStatus: "not-needed", rows: 1, headers: [], metrics: [] });
  assert.deepEqual(listingBriefMissing(state, "product-1", "design-1", ["one", "two", "three", "four", "five"]), []);
});

test("Product confirmation requires confirmed facts and cost evidence", async () => {
  const { DEFAULT_STATE, productFactGaps } = await core();
  const state = structuredClone(DEFAULT_STATE);
  const productId = "product-standard-journal";
  assert.deepEqual(productFactGaps(state, productId), ["owner-confirmed product facts evidence", "owner-confirmed cost and fulfilment evidence"]);
  const proof = (id, kind) => ({ id, kind, source: "owner", authority: "inference", fileName: `${id}.png`, mimeType: "image/png", uploadedAt: "2026-08-09T00:00:00.000Z", periodStart: "2026-08-09", periodEnd: "2026-08-09", targetType: "product", targetId: productId, ownerConfirmed: true, ocrStatus: "confirmed", rows: null, headers: [], metrics: [] });
  state.artifacts = [proof("facts", "product-facts"), proof("cost", "cost-fulfilment")];
  assert.deepEqual(productFactGaps(state, productId), []);
});

test("Keyword decision gate requires a bounded, evidence-backed primary and supporting choice", async () => {
  const { DEFAULT_STATE, keywordResearchGaps } = await core();
  const state = structuredClone(DEFAULT_STATE);
  const designId = "demo-design-journal";
  assert.deepEqual(keywordResearchGaps(state, designId), [
    "5–15 seed keywords",
    "at least one dated eRank, EverBee, or Etsy Marketplace Insights evidence reference",
    "one evidence-backed primary keyword",
    "at least one supporting keyword",
  ]);
  state.keywordResearch = ["one", "two", "three", "four", "five"].map((phrase, index) => ({
    id: `keyword-${index}`,
    designId,
    phrase,
    source: "eRank",
    evidenceReference: index === 0 ? "eRank screenshot 2026-08-09" : "",
    demand: "",
    competition: "",
    relevance: "High",
    status: "shortlisted",
    role: index === 0 ? "primary" : index === 1 ? "supporting" : "seed",
    note: "",
    createdAt: "2026-08-09T00:00:00.000Z",
  }));
  assert.deepEqual(keywordResearchGaps(state, designId), []);
});

test("Keyword upload gate accepts a confirmed research export linked to the design product", async () => {
  const { DEFAULT_STATE, keywordEvidenceGaps } = await core();
  const state = structuredClone(DEFAULT_STATE);
  const designId = "demo-design-journal";
  assert.equal(keywordEvidenceGaps(state, designId).length, 1);
  state.artifacts.push({ id: "erank-export", kind: "keyword-research", source: "erank", authority: "supplemental", fileName: "erank-journal-2026-08-09.csv", mimeType: "text/csv", uploadedAt: "2026-08-09T00:00:00.000Z", periodStart: "2026-08-09", periodEnd: "2026-08-09", targetType: "product", targetId: "product-standard-journal", ownerConfirmed: true, ocrStatus: "not-needed", rows: 25, headers: ["Keyword"], metrics: [], contentText: "Keyword,Searches\npersonalized mom journal,100" });
  assert.deepEqual(keywordEvidenceGaps(state, designId), []);
});

test("Keyword upload gate excludes a confirmed screenshot until OCR text is confirmed", async () => {
  const { DEFAULT_STATE, keywordEvidenceGaps } = await core();
  const state = structuredClone(DEFAULT_STATE);
  const designId = "demo-design-journal";
  const screenshot = { id: "erank-screenshot", kind: "keyword-research", source: "erank", authority: "supplemental", fileName: "results.png", mimeType: "image/png", uploadedAt: "2026-08-09T00:00:00.000Z", periodStart: "2026-08-09", periodEnd: "2026-08-09", targetType: "product", targetId: "product-standard-journal", ownerConfirmed: true, ocrStatus: "confirmed", rows: null, headers: [], metrics: [], contentText: "" };
  state.artifacts.push(screenshot);
  assert.equal(keywordEvidenceGaps(state, designId).length, 1);
  screenshot.ocrStatus = "unreadable";
  assert.equal(keywordEvidenceGaps(state, designId).length, 1);
  screenshot.ocrStatus = "confirmed";
  screenshot.contentText = "personalized mom journal";
  assert.deepEqual(keywordEvidenceGaps(state, designId), []);
});

test("OCR confirmation reuses completed text and only runs OCR for a pending image without text", async () => {
  const { shouldRunOcrBeforeConfirm } = await core();
  const screenshot = { id: "screenshot", kind: "design", source: "owner", authority: "inference", fileName: "mockup.png", mimeType: "image/png", uploadedAt: "2026-08-10T00:00:00.000Z", periodStart: "2026-08-10", periodEnd: "2026-08-10", targetType: "product", targetId: "product-standard-journal", ownerConfirmed: false, ocrStatus: "pending", rows: null, headers: [], metrics: [], contentText: "" };
  assert.equal(shouldRunOcrBeforeConfirm(screenshot), true);
  screenshot.contentText = "Personalized 2-Book Set";
  assert.equal(shouldRunOcrBeforeConfirm(screenshot), false);
  screenshot.contentText = "";
  screenshot.ocrStatus = "unreadable";
  assert.equal(shouldRunOcrBeforeConfirm(screenshot), false);
  screenshot.mimeType = "text/csv";
  screenshot.ocrStatus = "pending";
  assert.equal(shouldRunOcrBeforeConfirm(screenshot), false);
});

test("Listing draft migration adds a local draft register without changing existing evidence", async () => {
  const { DEFAULT_STATE, hydrateListingDrafts } = await core();
  const legacy = structuredClone(DEFAULT_STATE);
  delete legacy.listingDrafts;
  legacy.artifacts.push({ id: "existing", kind: "keyword-research", source: "erank", authority: "supplemental", fileName: "keywords.csv", mimeType: "text/csv", uploadedAt: "2026-08-09T00:00:00.000Z", periodStart: "2026-08-09", periodEnd: "2026-08-09", targetType: "product", targetId: "product-standard-journal", ownerConfirmed: true, ocrStatus: "not-needed", rows: 1, headers: [], metrics: [] });
  const migrated = hydrateListingDrafts(legacy);
  assert.deepEqual(migrated.listingDrafts, []);
  assert.equal(migrated.artifacts[0].id, "existing");
});

test("Keyword research-loop migration restores an empty local task queue without changing evidence", async () => {
  const { DEFAULT_STATE, hydrateKeywordResearch } = await core();
  const legacy = structuredClone(DEFAULT_STATE);
  delete legacy.keywordResearchLoops;
  legacy.artifacts.push({ id: "existing", kind: "keyword-research", source: "erank", authority: "supplemental", fileName: "keywords.csv", mimeType: "text/csv", uploadedAt: "2026-08-09T00:00:00.000Z", periodStart: "2026-08-09", periodEnd: "2026-08-09", targetType: "product", targetId: "product-standard-journal", ownerConfirmed: true, ocrStatus: "not-needed", rows: 1, headers: [], metrics: [] });
  const migrated = hydrateKeywordResearch(legacy);
  assert.deepEqual(migrated.keywordResearchLoops, []);
  assert.equal(migrated.artifacts[0].id, "existing");
});

test("Delivery evidence proves downstream eligibility and truth recomputation", async () => {
  const { DEFAULT_STATE, buildSellerDecision, isEvidenceEligibleForDecision } = await core();
  const state = structuredClone(DEFAULT_STATE);
  const window = { periodStart: "2026-08-01", periodEnd: "2026-08-07" };
  const artifact = (kind, targetType, targetId, metrics = []) => ({
    id: kind,
    kind,
    source: "etsy",
    authority: "primary",
    fileName: `${kind}.csv`,
    mimeType: "text/csv",
    uploadedAt: "2026-08-08T00:00:00.000Z",
    ...window,
    targetType,
    targetId,
    ownerConfirmed: true,
    ocrStatus: "not-needed",
    rows: 1,
    headers: [],
    metrics,
  });
  const performance = artifact("listing-performance", "listing", "demo-listing-a", [
    { label: "Views", value: 12, status: "confirmed" },
    { label: "Favorites", value: 0, status: "confirmed-zero" },
    { label: "Orders", value: 0, status: "confirmed-zero" },
    { label: "Revenue", value: 0, status: "confirmed-zero" },
  ]);
  state.artifacts = [performance, artifact("shop-stats", "shop", "shop"), artifact("traffic-sources", "listing", "demo-listing-a")];
  assert.equal(isEvidenceEligibleForDecision(performance), true);
  const decision = buildSellerDecision(state, "demo-listing-a", "2026-08-16");
  assert.equal(decision.status, "ready");
  assert.equal(decision.signals.views.value, 12);
  performance.metrics[0] = { label: "Views", value: null, status: "invalid" };
  const recomputed = buildSellerDecision(state, "demo-listing-a", "2026-08-16");
  assert.equal(recomputed.status, "collect-data");
  assert.equal(recomputed.signals.views.status, "invalid");
  console.log("eligible");
  console.log("truth");
});

test("Batch processor preserves empty, one-file, 20-image, and 50-workbook selections without truncation", async () => {
  const { processEvidenceBatch } = await core();
  const empty = await processEvidenceBatch([], async (file) => file.name);
  assert.deepEqual(empty.items, []);

  const one = await processEvidenceBatch([{ name: "one.csv", type: "text/csv" }], async (file) => file.name);
  assert.equal(one.successes.length, 1);
  assert.equal(one.items[0].status, "saved");

  const images = Array.from({ length: 20 }, (_, index) => ({ name: `capture-${index + 1}.png`, type: "image/png" }));
  const imageBatch = await processEvidenceBatch(images, async (file) => file.name);
  assert.equal(imageBatch.items.length, 20);
  assert.equal(imageBatch.successes.length, 20);
  assert.equal(imageBatch.items.every((item) => item.status === "saved"), true);

  const workbooks = Array.from({ length: 50 }, (_, index) => ({ name: `export-${index + 1}.xlsx`, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const workbookBatch = await processEvidenceBatch(workbooks, async (file) => file.name);
  assert.equal(workbookBatch.items.length, 50);
  assert.equal(workbookBatch.successes.length, 50);
  assert.equal(workbookBatch.items.at(-1).detail, "Saved as a separate local evidence record.");
});

test("Batch processor keeps successful files when another file fails and reports every final outcome", async () => {
  const { processEvidenceBatch } = await core();
  const snapshots = [];
  const files = [
    { name: "good-1.csv", type: "text/csv" },
    { name: "broken.xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    { name: "good-2.png", type: "image/png" },
  ];
  const result = await processEvidenceBatch(files, async (file) => {
    if (file.name === "broken.xlsx") throw new Error("Workbook parse failed");
    return file.name;
  }, (items) => snapshots.push(items));
  assert.deepEqual(result.successes.map((item) => item.file.name), ["good-1.csv", "good-2.png"]);
  assert.equal(result.failures.length, 1);
  assert.equal(result.items[1].status, "error");
  assert.match(result.items[1].detail, /Workbook parse failed/);
  assert.deepEqual(result.items.map((item) => item.status), ["saved", "error", "saved"]);
  assert.equal(snapshots.at(-1).every((item) => item.status === "saved" || item.status === "error"), true);
});

test("One mixed dump classifies every file independently across kinds, sources, targets, and periods", async () => {
  const { classifyEvidenceFile, isEvidenceFileClassificationReady } = await core();
  const targets = [
    { targetType: "shop", targetId: "shop", labels: ["entire shop", "shop stats"] },
    { targetType: "listing", targetId: "demo-listing-a", labels: ["demo-listing-a", "Sample active listing"] },
    { targetType: "listing", targetId: "demo-listing-b", labels: ["demo-listing-b", "Protected listing"] },
    { targetType: "product", targetId: "product-standard-journal", labels: ["product-standard-journal", "Standard Journal"] },
  ];
  const fixtures = [
    { name: "etsy-shop-stats-2026-08-01_to_2026-08-20.csv", type: "text/csv", headers: ["Visits", "Orders"], expected: ["shop-stats", "etsy", "shop", "shop", "2026-08-01", "2026-08-20"] },
    { name: "etsy-listing-performance-demo-listing-a-2026-07-01_to_2026-07-31.csv", type: "text/csv", headers: ["Listing ID", "Views", "Favorites", "Orders"], expected: ["listing-performance", "etsy", "listing", "demo-listing-a", "2026-07-01", "2026-07-31"] },
    { name: "etsy-traffic-sources-demo-listing-b-2026-06-01_to_2026-06-30.csv", type: "text/csv", headers: ["Traffic source", "Visits"], expected: ["traffic-sources", "etsy", "listing", "demo-listing-b", "2026-06-01", "2026-06-30"] },
    { name: "erank-keyword-research-product-standard-journal-2026-08-10.csv", type: "text/csv", headers: ["Keyword", "Searches", "Competition"], expected: ["keyword-research", "erank", "product", "product-standard-journal", "2026-08-10", "2026-08-10"] },
  ];
  const classifications = fixtures.map((fixture) => classifyEvidenceFile({ ...fixture, targets }));
  assert.deepEqual(classifications.map((item) => [item.kind, item.source, item.targetType, item.targetId, item.periodStart, item.periodEnd]), fixtures.map((fixture) => fixture.expected));
  assert.equal(classifications.every(isEvidenceFileClassificationReady), true);
  assert.equal(new Set(classifications.map((item) => `${item.source}|${item.kind}|${item.targetType}|${item.targetId}|${item.periodStart}|${item.periodEnd}`)).size, 4, "metadata must not bleed between files");
});

test("Ambiguous mixed-signal files stay provisional while valid siblings remain independently ready", async () => {
  const { classifyEvidenceFile, isEvidenceFileClassificationReady } = await core();
  const targets = [
    { targetType: "shop", targetId: "shop", labels: ["entire shop", "shop stats"] },
    { targetType: "listing", targetId: "demo-listing-a", labels: ["demo-listing-a"] },
  ];
  const valid = classifyEvidenceFile({ name: "etsy-listing-performance-demo-listing-a-2026-08-01_to_2026-08-20.csv", type: "text/csv", headers: ["Listing ID", "Views", "Orders"], targets });
  const ambiguous = classifyEvidenceFile({ name: "etsy-erank-traffic-sources-keyword-research-demo-listing-a-2026-08-01_to_2026-08-20.csv", type: "text/csv", headers: ["Keyword", "Searches", "Traffic source"], targets });
  const screenshot = classifyEvidenceFile({ name: "etsy-shop-stats-2026-08-01_to_2026-08-20.png", type: "image/png", targets });
  assert.equal(isEvidenceFileClassificationReady(valid), true);
  assert.equal(isEvidenceFileClassificationReady(screenshot), true, "a filename may classify screenshot lineage, but it does not create OCR or numeric truth");
  assert.equal(isEvidenceFileClassificationReady(ambiguous), false);
  assert.equal(ambiguous.status, "ambiguous");
  assert.equal(ambiguous.source, undefined, "conflicting Etsy/eRank signals must not silently choose a source");
  assert.equal(ambiguous.kind, undefined, "conflicting traffic/keyword signals must not silently choose a kind");
  assert.ok(ambiguous.ambiguity.includes("source"));
  assert.ok(ambiguous.ambiguity.includes("kind"));
});

test("Derived groups canonicalize labels, use exact duplicates once, and keep complementary metrics auditable", async () => {
  const { deriveEvidenceGroups } = await core();
  const common = { kind: "listing-performance", source: "etsy", authority: "primary", mimeType: "text/csv", uploadedAt: "2026-08-20T00:00:00.000Z", periodStart: "2026-08-01", periodEnd: "2026-08-20", targetType: "listing", targetId: "demo-listing-a", ownerConfirmed: true, ocrStatus: "not-needed", rows: 1, headers: [], contentText: "" };
  const artifacts = [
    { ...common, id: "views-a", fileName: "views-a.csv", metrics: [{ label: "Listing Views", value: 12, status: "confirmed" }] },
    { ...common, id: "views-b", fileName: "views-b.csv", metrics: [{ label: "views", value: 12, status: "confirmed" }] },
    { ...common, id: "orders", fileName: "orders.csv", metrics: [{ label: "Orders", value: 2, status: "confirmed" }] },
  ];
  const [group] = deriveEvidenceGroups(artifacts, { asOf: "2026-08-23" });
  assert.equal(group.metrics.length, 2);
  assert.deepEqual(group.metrics.map((metric) => metric.canonicalLabel), ["orders", "views"]);
  const views = group.metrics.find((metric) => metric.canonicalLabel === "views");
  assert.equal(views.value, 12, "cross-file totals must not be summed to 24");
  assert.equal(views.status, "confirmed");
  assert.deepEqual(views.artifactIds, ["views-a", "views-b"]);
  assert.deepEqual(views.duplicateArtifactIds, ["views-b"]);
  assert.deepEqual(group.duplicateArtifactIds, ["views-b"]);
  assert.equal(group.conflicts.length, 0);
});

test("Derived groups surface value or truth-status conflicts while excluding unconfirmed files", async () => {
  const { deriveEvidenceGroups } = await core();
  const common = { kind: "listing-performance", source: "etsy", authority: "primary", mimeType: "text/csv", uploadedAt: "2026-08-20T00:00:00.000Z", periodStart: "2026-08-01", periodEnd: "2026-08-20", targetType: "listing", targetId: "demo-listing-a", ocrStatus: "not-needed", rows: 1, headers: [], contentText: "" };
  const artifact = (id, value, status, ownerConfirmed = true) => ({ ...common, id, fileName: `${id}.csv`, ownerConfirmed, metrics: [{ label: "Views", value, status }] });
  let [group] = deriveEvidenceGroups([artifact("confirmed", 10, "confirmed"), artifact("unconfirmed", 999, "confirmed", false)], { asOf: "2026-08-23" });
  assert.equal(group.metrics[0].value, 10);
  assert.equal(group.metrics[0].status, "confirmed");
  assert.deepEqual(group.unconfirmedArtifactIds, ["unconfirmed"]);
  assert.deepEqual(group.conflicts, []);

  [group] = deriveEvidenceGroups([artifact("left", 10, "confirmed"), artifact("right", 11, "confirmed")], { asOf: "2026-08-23" });
  assert.equal(group.metrics[0].status, "conflict");
  assert.deepEqual(group.conflicts, ["views"]);

  [group] = deriveEvidenceGroups([artifact("zero-a", 0, "confirmed-zero"), artifact("zero-b", 0, "confirmed")], { asOf: "2026-08-23" });
  assert.equal(group.metrics[0].status, "conflict", "different truth statuses conflict even when the numeric value matches");
});

test("Derived grouping never bleeds across source, kind, target, or period; age is neutral unless owner configures staleness", async () => {
  const { deriveEvidenceGroups, isEvidencePeriodStale } = await core();
  const base = { source: "etsy", authority: "primary", fileName: "evidence.png", mimeType: "image/png", uploadedAt: "2026-06-02T00:00:00.000Z", periodStart: "2026-06-01", periodEnd: "2026-06-01", targetType: "listing", targetId: "demo-listing-a", ownerConfirmed: true, ocrStatus: "unreadable", rows: null, headers: [], metrics: [{ label: "Views", value: 3, status: "confirmed" }], contentText: "" };
  const artifacts = [
    { ...base, id: "old-ocr", kind: "listing-performance" },
    { ...base, id: "other-period", kind: "listing-performance", periodStart: "2026-08-01", periodEnd: "2026-08-01" },
    { ...base, id: "other-target", kind: "listing-performance", targetId: "demo-listing-b" },
    { ...base, id: "other-kind", kind: "traffic-sources" },
    { ...base, id: "other-source", kind: "listing-performance", source: "owner", authority: "inference" },
  ];
  const groups = deriveEvidenceGroups(artifacts, { asOf: "2026-08-23" });
  assert.equal(groups.length, 5);
  const old = groups.find((group) => group.artifactIds.includes("old-ocr"));
  assert.equal(old.stale, false, "age alone must not invent a stale decision policy");
  assert.equal(old.ageDays, 83);
  assert.equal(isEvidencePeriodStale("2026-06-01", "2026-08-23"), false);
  assert.deepEqual(old.ocrReviewOnlyArtifactIds, ["old-ocr"]);
  assert.equal(old.metrics.length, 0, "unreadable OCR metrics stay excluded from conclusions");
  const explicitlyConfigured = deriveEvidenceGroups(artifacts, { asOf: "2026-08-23", staleAfterDays: 30 }).find((group) => group.artifactIds.includes("old-ocr"));
  assert.equal(explicitlyConfigured.stale, true, "only explicit owner-configured input may assert stale");
});
