import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";

const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SUPPORT_ROW_LEDGER = [{ rowId: "exact-row-1", phrase: "pastor appreciation gift", originatingQuery: "pastor appreciation", intentDimensionId: "appreciation-thank-you", researchQueryTaskId: "task-1", confirmedSearchVolume: 500, confirmedCompetition: 42 }];

async function promptCore() {
  const dir = await mkdtemp(join(tmpdir(), "etsy-system-prompt-"));
  const outfile = join(dir, "etsy-prompt-package.cjs");
  await build({ entryPoints: [join(PROJECT_ROOT, "src", "lib", "etsyPromptPackage.ts")], absWorkingDir: PROJECT_ROOT, bundle: true, platform: "node", format: "cjs", outfile });
  return import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
}

test("master Etsy System Prompt asset preserves the requested workflow limits", async () => {
  const prompt = await readFile(join(PROJECT_ROOT, "public", "etsy-seo-system-prompt.txt"), "utf8");
  assert.ok(prompt.startsWith("# Etsy SEO Keyword Research & Listing Expert Master System Prompt"));
  assert.doesNotMatch(prompt, /^好的/);
  assert.match(prompt, /Current Stage Lock/);
  assert.match(prompt, /每次最多生成 10 個 listings/);
  assert.match(prompt, /剛好提供 13 個 tags/);
  assert.match(prompt, /不超過 20 characters/);
  assert.match(prompt, /建議最低目標：105 characters/);
  assert.match(prompt, /理想範圍：115–135 characters/);
});

test("six exact stage packets share global policy but retain stage-only schemas", async () => {
  const { buildEtsyStagePacket, buildEtsyWorkflowPackage } = await promptCore();
  const stages = ["product-research-bulk", "product-research-individual", "product-research-analysis", "listing-brief", "listing-audit", "growth-launch"];
  const packets = [];
  for (const stage of stages) {
    const request = { stage, exactContext: { stage, id: "fixture" }, allowedInputs: [`only:${stage}`], evidenceRefs: ["artifact-a", "artifact-a"], ...(stage === "product-research-analysis" ? { supportRowLedger: SUPPORT_ROW_LEDGER } : {}), nextActionBoundary: "Owner reviews one next action." };
    const packet = buildEtsyStagePacket(request);
    const output = await buildEtsyWorkflowPackage(request);
    packets.push(packet);
    assert.equal(packet.stage, stage);
    assert.equal(packet.nextActionBoundary.ownerActionRequired, true);
    assert.equal(packet.nextActionBoundary.automaticTransition, false);
    assert.deepEqual(packet.evidenceRefs, ["artifact-a"]);
    assert.match(output, new RegExp(`MYGIFTSTYLE STAGE PACKET . ${stage}`));
    assert.doesNotMatch(output, /# Etsy SEO Keyword Research & Listing Expert Master System Prompt/);
    if (stage === "product-research-analysis") {
      assert.match(output, /"rowId": "exact-row-1"/);
      for (const field of ["phrase", "originatingQuery", "intentDimensionId", "researchQueryTaskId", "confirmedSearchVolume", "confirmedCompetition"]) assert.ok(output.includes(`"${field}"`), `serialized support ledger field missing: ${field}`);
    }
  }
  assert.equal(new Set(packets.map((packet) => packet.globalPolicyVersion)).size, 1);
  assert.equal(new Set(packets.map((packet) => packet.outputSchema.type)).size, 6);
  const analysis = packets.find((packet) => packet.stage === "product-research-analysis");
  assert.equal(analysis.outputSchema.rawGapCandidateDrafts.exactCountWhenGapExists, 25);
  assert.deepEqual(analysis.outputSchema.rankedGapCandidates, { minimum: 15, maximum: 25, absentBelowMinimum: true });
});

test("stage packet creation fails closed without runtime master prompt concatenation", async () => {
  const sourceText = await readFile(join(PROJECT_ROOT, "src", "lib", "etsyPromptPackage.ts"), "utf8");
  const { buildEtsyStagePacket } = await promptCore();
  assert.doesNotMatch(sourceText, /fetch\(/);
  assert.throws(() => buildEtsyStagePacket({ stage: "invalid", exactContext: { id: "x" }, allowedInputs: ["x"], evidenceRefs: [], nextActionBoundary: "owner" }), /Unknown Etsy stage/i);
  assert.throws(() => buildEtsyStagePacket({ stage: "listing-brief", exactContext: {}, allowedInputs: ["x"], evidenceRefs: [], nextActionBoundary: "owner" }), /context is empty/i);
  assert.throws(() => buildEtsyStagePacket({ stage: "listing-audit", exactContext: { id: "x" }, allowedInputs: [], evidenceRefs: [], nextActionBoundary: "owner" }), /no allowed inputs/i);
  assert.throws(() => buildEtsyStagePacket({ stage: "growth-launch", exactContext: { id: "x" }, allowedInputs: ["x"], evidenceRefs: [], nextActionBoundary: "" }), /next-action boundary/i);
  assert.throws(() => buildEtsyStagePacket({ stage: "product-research-analysis", exactContext: { id: "x" }, allowedInputs: ["x"], evidenceRefs: [], nextActionBoundary: "owner" }), /support-row ledger/i);
  assert.throws(() => buildEtsyStagePacket({ stage: "product-research-analysis", exactContext: { id: "x" }, allowedInputs: ["x"], evidenceRefs: [], supportRowLedger: [], nextActionBoundary: "owner" }), /support-row ledger/i);
  assert.throws(() => buildEtsyStagePacket({ stage: "product-research-bulk", exactContext: { id: "x" }, allowedInputs: ["x"], evidenceRefs: [], supportRowLedger: SUPPORT_ROW_LEDGER, nextActionBoundary: "owner" }), /only for Product Research Analysis/i);
});

test("Hub stage shortcut fails closed for unsupported routes, incomplete Analysis, and locked Listing Brief", async () => {
  const { resolveEtsyOperationsStageRequest } = await promptCore();
  const base = { operationsTab: "today", workMode: "product-development", researchStageRequest: null, analysisStageRequest: null, listingBriefStageRequest: null, listingAuditStageRequest: null, listingBriefUnlocked: false };
  const growthLaunch = { stage: "growth-launch", exactContext: { id: "growth" }, allowedInputs: ["growth"], evidenceRefs: [], nextActionBoundary: "owner" };
  const incompleteAnalysis = { stage: "product-research-analysis", exactContext: { roundId: "round-1" }, allowedInputs: ["completed queries"], evidenceRefs: [], nextActionBoundary: "owner" };
  const completeAnalysis = { ...incompleteAnalysis, supportRowLedger: SUPPORT_ROW_LEDGER };
  const listingBrief = { stage: "listing-brief", exactContext: { roundId: "round-1", ownerGate: "exact-approved" }, allowedInputs: ["EXACT LISTING BRIEF CONTENT"], evidenceRefs: [], nextActionBoundary: "owner" };

  assert.equal(resolveEtsyOperationsStageRequest(base), null, "today is not silently treated as growth-launch");
  assert.equal(resolveEtsyOperationsStageRequest({ ...base, operationsTab: "unsupported-route", researchStageRequest: growthLaunch }), null);
  assert.equal(resolveEtsyOperationsStageRequest({ ...base, operationsTab: "analysis", analysisStageRequest: incompleteAnalysis }), null, "Analysis remains copy-disabled without a support-row ledger");
  assert.strictEqual(resolveEtsyOperationsStageRequest({ ...base, operationsTab: "analysis", analysisStageRequest: completeAnalysis }), completeAnalysis);
  assert.equal(resolveEtsyOperationsStageRequest({ ...base, operationsTab: "results", listingBriefStageRequest: listingBrief, listingBriefUnlocked: false }), null, "a supplied packet cannot bypass the locked owner gate");
  assert.strictEqual(resolveEtsyOperationsStageRequest({ ...base, operationsTab: "results", listingBriefStageRequest: listingBrief, listingBriefUnlocked: true }), listingBrief);
});

test("named Etsy handoff surfaces pass typed stage requests", async () => {
  const view = await readFile(join(PROJECT_ROOT, "src", "views", "EtsyDecisionView.tsx"), "utf8");
  const hub = await readFile(join(PROJECT_ROOT, "src", "components", "EtsyOperationsHub.tsx"), "utf8");
  const research = await readFile(join(PROJECT_ROOT, "src", "components", "KeywordResearchWorkspace.tsx"), "utf8");
  const audit = await readFile(join(PROJECT_ROOT, "src", "components", "ListingAuditWorkspace.tsx"), "utf8");
  const growth = await readFile(join(PROJECT_ROOT, "src", "components", "GrowthLaunchBoard.tsx"), "utf8");
  assert.match(view, /workspaceStageRequest/);
  assert.match(view, /const activeStageRequest = dashboardSurface === "workspace" \? workspaceStageRequest : runBriefStageRequest/);
  assert.match(view, /activeStageRequest\?\.stage \?\? "unavailable for this locked route"/);
  assert.match(view, /"Stage packet unavailable"/);
  assert.match(view, /onStageRequestChange=\{setWorkspaceStageRequest\}/);
  assert.match(view, /buildEtsyWorkflowPackage\(activeStageRequest\)/);
  assert.match(hub, /const \[researchStageRequest, setResearchStageRequest\] = useState<EtsyStageRequest \| null>/);
  assert.match(hub, /const visibleStageRequest = useMemo<EtsyStageRequest \| null>/);
  assert.match(hub, /resolveEtsyOperationsStageRequest\(\{ operationsTab, workMode, researchStageRequest, analysisStageRequest, listingBriefStageRequest, listingAuditStageRequest, listingBriefUnlocked \}\)/);
  assert.doesNotMatch(hub, /: "growth-launch" as const/, "unsupported Hub routes must not silently fall back to growth-launch");
  assert.match(hub, /onStageRequestChange\?\.\(visibleStageRequest\)/);
  assert.match(hub, /onStageRequestChange=\{setResearchStageRequest\}/);
  assert.doesNotMatch(hub, /workMode === "listing-audit" \? "listing-audit" : "product-research-analysis"/, "Product Development Research must not be hardcoded to Analysis");
  assert.match(research, /const stageRequest = useMemo<EtsyStageRequest/);
  assert.match(research, /individualStageRequestForTask\(visibleTask\)/);
  assert.match(research, /copyIndividualTaskPacket\(task/);
  assert.match(audit, /stage: "listing-audit"/);
  assert.match(growth, /stage: "growth-launch"/);
  for (const file of [view, hub, research, audit, growth]) assert.doesNotMatch(file, /buildEtsyWorkflowPackage\((?:text|brief|runBrief|packet|auditPackageText\(\))\)/, "raw runtime strings must not bypass the stage union");
});
