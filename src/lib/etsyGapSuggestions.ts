import type { GapCandidateDraft, RequiredIntentDimension, ResearchContext, ResearchSupportRowLedgerEntry } from "./etsyOperations";
import { normalizeResearchQuery } from "./etsyOperations";

export type InProductGapSuggestionInput = {
  context: ResearchContext;
  dimension: Pick<RequiredIntentDimension, "id" | "label" | "definition">;
  supportRows: ResearchSupportRowLedgerEntry[];
  usedQueries: readonly string[];
  productName?: string;
  recipient?: string;
  occasion?: string;
};

export type InProductGapSuggestion = {
  origin: "in-product-suggestion";
  context: ResearchContext;
  targetDimensionId: string;
  targetDimensionLabel: string;
  rawDrafts: GapCandidateDraft[];
  rationale: string;
};

const KNOWN_PRODUCT_PHRASES = [
  "acrylic plaque",
  "wall art",
  "canvas print",
  "photo keepsake",
  "keepsake",
  "journal",
  "notebook",
  "planner",
  "plaque",
  "ornament",
  "mug",
  "blanket",
  "tumbler",
  "keychain",
  "necklace",
  "print",
  "frame",
] as const;

const KNOWN_RECIPIENT_PHRASES = [
  "worship leader",
  "church leader",
  "youth pastor",
  "senior pastor",
  "best friend",
  "grandmother",
  "grandfather",
  "grandma",
  "grandpa",
  "daughter",
  "son",
  "wife",
  "husband",
  "mother",
  "father",
  "mom",
  "dad",
  "pastor",
  "minister",
  "reverend",
  "teacher",
  "friend",
  "couple",
  "parent",
] as const;

function cleanPhrase(value: string | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}'’-]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(value: string) {
  return cleanPhrase(value).split(/\s+/).filter(Boolean);
}

function independentlyResearchable(query: string) {
  const queryTokens = tokens(query);
  return queryTokens.length >= 2
    && queryTokens.length <= 4
    && queryTokens.every((token) => /^[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*$/u.test(token));
}

function inferProduct(input: InProductGapSuggestionInput, combinedText: string) {
  const explicit = cleanPhrase(input.productName);
  const explicitProduct = KNOWN_PRODUCT_PHRASES.find((phrase) => explicit.includes(phrase));
  if (explicitProduct) return explicitProduct;
  const observedProduct = KNOWN_PRODUCT_PHRASES.find((phrase) => combinedText.includes(phrase));
  return observedProduct ?? "journal";
}

function inferRecipient(input: InProductGapSuggestionInput, combinedText: string) {
  const gapText = cleanPhrase(`${input.dimension.label} ${input.dimension.definition}`);
  const gapRecipient = KNOWN_RECIPIENT_PHRASES.find((phrase) => gapText.includes(phrase));
  if (gapRecipient) return gapRecipient;
  const explicit = cleanPhrase(input.recipient);
  if (explicit && tokens(explicit).length <= 3) return explicit;
  return KNOWN_RECIPIENT_PHRASES.find((phrase) => combinedText.includes(phrase)) ?? "faith leader";
}

function dimensionFamily(dimension: InProductGapSuggestionInput["dimension"]) {
  const text = `${dimension.id} ${dimension.label} ${dimension.definition}`.toLocaleLowerCase("en-US");
  if (/appreciation|thank/.test(text)) return "appreciation" as const;
  if (/use[- ]case|prayer|devotional|reflection|study/.test(text)) return "use-case" as const;
  if (/faith|christian|bible|scripture|worship|ministry|spiritual|church/.test(text)) return "faith" as const;
  if (/gift|occasion|sender|emotional|recipient|buyer/.test(text)) return "gift" as const;
  return "product" as const;
}

function extensionLabel(family: ReturnType<typeof dimensionFamily>) {
  if (family === "appreciation") return "Appreciation and thank-you extension";
  if (family === "use-case") return "Use-case extension";
  if (family === "faith") return "Faith-identity extension";
  if (family === "gift") return "Buyer-intent and recipient extension";
  return "Product and long-tail extension";
}

/**
 * Build a transparent first-pass proposal without inventing eRank metrics.
 * The output is deliberately still a hypothesis: the existing deterministic
 * validator remains the only path that can persist a proposal for owner review.
 */
export function createInProductGapSuggestion(input: InProductGapSuggestionInput): InProductGapSuggestion {
  if (!input.context.designId || !input.context.productId || !input.context.roundId || !input.context.seedVersion) throw new Error("The exact active research context is missing.");
  if (!input.dimension.id || !input.dimension.label.trim()) throw new Error("The uncovered research dimension is missing.");
  if (!Array.isArray(input.supportRows) || input.supportRows.length === 0) throw new Error("A built-in gap suggestion needs at least one eligible support row.");

  const combinedText = [input.productName, input.recipient, input.occasion, ...input.supportRows.flatMap((row) => [row.phrase, row.originatingQuery])]
    .filter(Boolean)
    .map((value) => cleanPhrase(String(value)))
    .join(" ");
  const product = inferProduct(input, combinedText);
  const recipient = inferRecipient(input, combinedText);
  const recipientTokens = tokens(recipient);
  const compactRecipient = recipientTokens.length > 1 ? recipientTokens[recipientTokens.length - 1] : recipient;
  const productTokens = tokens(product);
  const compactProduct = productTokens[productTokens.length - 1] ?? "journal";
  const occasion = cleanPhrase(input.occasion);
  const family = dimensionFamily(input.dimension);
  const gapLabel = cleanPhrase(input.dimension.label);
  const gapTargetsRecipient = Boolean(gapLabel && gapLabel.includes(recipient));
  const supportRows = input.supportRows.filter((row) => row.rowId && (row.phrase.trim() || row.originatingQuery.trim()));
  if (!supportRows.length) throw new Error("The eligible support-row ledger has no usable phrase to explain an extension.");

  const usedQueries = new Set(input.usedQueries.map(normalizeResearchQuery).filter(Boolean));
  const seen = new Set<string>();
  const rawDrafts: GapCandidateDraft[] = [];
  let supportIndex = 0;
  const add = (query: string, kind = extensionLabel(family)) => {
    const cleaned = cleanPhrase(query);
    const normalized = normalizeResearchQuery(cleaned);
    if (!independentlyResearchable(cleaned) || !normalized || usedQueries.has(normalized) || seen.has(normalized)) return;
    const support = supportRows[supportIndex % supportRows.length];
    supportIndex += 1;
    const supportPhrase = (support.phrase || support.originatingQuery).trim();
    rawDrafts.push({
      query: cleaned,
      targetDimension: input.dimension.id,
      extensionLogic: `${kind}: extend the exact support phrase “${supportPhrase}” into the uncovered ${input.dimension.label} gap with a distinct, researchable buyer-intent phrase.`,
      supportingRowIds: [support.rowId],
    });
    seen.add(normalized);
  };

  const addMany = (queries: string[], kind = extensionLabel(family)) => queries.forEach((query) => add(query, kind));
  if (family === "faith") {
    if (gapTargetsRecipient && tokens(gapLabel).length <= 4) {
      addMany([
        gapLabel,
        `christian ${gapLabel}`,
        `scripture ${gapLabel}`,
        `prayer ${gapLabel}`,
        `devotional ${gapLabel}`,
        `ministry ${gapLabel}`,
        `spiritual ${gapLabel}`,
        `personalized ${gapLabel}`,
        `custom ${gapLabel}`,
        `meaningful ${gapLabel}`,
        `thoughtful ${gapLabel}`,
        `unique ${gapLabel}`,
        `lasting ${gapLabel}`,
        `${recipient} journal gift`,
        `${recipient} journal keepsake`,
        `${recipient} bible journal`,
        `${recipient} prayer journal`,
        `${recipient} scripture journal`,
        `${recipient} ministry journal`,
        `${recipient} devotional journal`,
        `${recipient} christian gift`,
        `${recipient} bible gift`,
        `${recipient} prayer gift`,
        `${recipient} journal idea`,
        `${recipient} journal notes`,
        `${recipient} church journal`,
        `${recipient} recognition gift`,
      ]);
    } else {
      addMany([
        `christian ${recipient} ${compactProduct}`,
        `${recipient} faith ${compactProduct}`,
        `${recipient} bible ${compactProduct}`,
        `${recipient} scripture ${compactProduct}`,
        `${recipient} worship ${compactProduct}`,
        `${recipient} ministry ${compactProduct}`,
        `faith leader ${compactProduct}`,
        `christian faith ${compactProduct}`,
        `${recipient} devotional ${compactProduct}`,
        `${recipient} prayer ${compactProduct}`,
        `worship leader ${compactProduct}`,
        `church leader ${compactProduct}`,
        `spiritual leader ${compactProduct}`,
        `${recipient} reflection ${compactProduct}`,
        `christian ministry gift`,
        `${recipient} prayer gift`,
        `${recipient} scripture gift`,
        `${recipient} christian gift`,
        `faith based ${compactProduct}`,
        `${recipient} bible gift`,
      ]);
    }
  } else if (family === "appreciation") {
    addMany([
      `${recipient} appreciation gift`,
      `${recipient} thank you gift`,
      `thank you ${recipient} gift`,
      `appreciation gift for ${recipient}`,
      `thank you gift for ${recipient}`,
      `${recipient} appreciation ${compactProduct}`,
      `${recipient} thank you ${compactProduct}`,
      `meaningful ${recipient} gift`,
      `thoughtful ${recipient} gift`,
      `${recipient} ministry gift`,
      `church leader gift`,
      `pastor appreciation keepsake`,
      `${recipient} keepsake gift`,
      `personalized ${recipient} gift`,
      `custom ${recipient} gift`,
      `${recipient} recognition gift`,
      `${recipient} service gift`,
      `lasting ${recipient} gift`,
      `${recipient} memory gift`,
      `${recipient} gratitude gift`,
    ]);
  } else if (family === "use-case") {
    addMany([
      `${recipient} prayer ${compactProduct}`,
      `${recipient} devotional ${compactProduct}`,
      `${recipient} scripture ${compactProduct}`,
      `${recipient} reflection ${compactProduct}`,
      `${recipient} ministry ${compactProduct}`,
      `${recipient} worship ${compactProduct}`,
      `${recipient} study ${compactProduct}`,
      `${recipient} notes ${compactProduct}`,
      `prayer ${recipient} keepsake`,
      `devotional ${recipient} gift`,
      `scripture ${recipient} gift`,
      `faith reflection ${compactProduct}`,
      `ministry notes ${compactProduct}`,
      `worship notes ${compactProduct}`,
      `christian study ${compactProduct}`,
      `${recipient} quiet time ${compactProduct}`,
      `church ministry ${compactProduct}`,
      `faith journey ${compactProduct}`,
      `prayer keepsake gift`,
      `devotional keepsake gift`,
    ]);
  } else if (family === "gift") {
    addMany([
      `personalized ${recipient} gift`,
      `custom ${recipient} gift`,
      `meaningful ${recipient} gift`,
      `thoughtful ${recipient} gift`,
      `unique ${recipient} gift`,
      `${recipient} keepsake gift`,
      `${recipient} memory gift`,
      `${recipient} gift idea`,
      `gift for ${recipient}`,
      `gift from family ${recipient}`,
      `gift for ${recipient} ${compactProduct}`,
      `${recipient} birthday gift`,
      `${recipient} holiday gift`,
      `${recipient} appreciation gift`,
      `${recipient} thank you gift`,
      `custom ${recipient} keepsake`,
      `personalized ${recipient} keepsake`,
      `lasting ${recipient} keepsake`,
      `${recipient} celebration gift`,
      `${recipient} meaningful keepsake`,
    ]);
  } else {
    addMany([
      `${recipient} ${compactProduct}`,
      `custom ${recipient} ${compactProduct}`,
      `personalized ${recipient} ${compactProduct}`,
      `${recipient} keepsake ${compactProduct}`,
      `${recipient} memory ${compactProduct}`,
      `meaningful ${recipient} ${compactProduct}`,
      `faith ${recipient} ${compactProduct}`,
      `custom ${recipient} keepsake`,
      `personalized ${recipient} keepsake`,
      `unique ${recipient} ${compactProduct}`,
      `${recipient} gift ${compactProduct}`,
      `gift ${recipient} ${compactProduct}`,
      `custom ${compactRecipient} gift`,
      `personalized ${compactRecipient} gift`,
      `lasting ${compactRecipient} keepsake`,
      `thoughtful ${compactRecipient} gift`,
      `christian ${compactRecipient} ${compactProduct}`,
      `faith ${compactRecipient} ${compactProduct}`,
      `prayer ${compactRecipient} ${compactProduct}`,
      `scripture ${compactRecipient} ${compactProduct}`,
    ]);
  }

  const fallbackModifiers = ["personalized", "custom", "meaningful", "thoughtful", "unique", "lasting", "faith", "christian", "prayer", "devotional", "scripture", "ministry", "worship", "keepsake", "reflection", "bible", "church", "appreciation", "gratitude", "memory"];
  const fallbackTargets = [
    `${compactRecipient} ${compactProduct}`,
    `${compactRecipient} gift`,
    `${compactProduct} gift`,
    `${compactRecipient} keepsake`,
  ];
  fallbackModifiers.forEach((modifier) => fallbackTargets.forEach((target) => {
    add(`${modifier} ${target}`);
    add(`${target} ${modifier}`);
  }));
  if (occasion) {
    addMany([`${occasion} ${compactRecipient} gift`, `gift for ${compactRecipient} ${occasion}`, `${occasion} ${compactProduct} gift`], "Occasion extension");
  }

  if (rawDrafts.length < 25) throw new Error(`The built-in Coach could only create ${rawDrafts.length} new researchable candidates for this gap. Add a clearer recipient or product description, then try again.`);
  return {
    origin: "in-product-suggestion",
    context: { ...input.context },
    targetDimensionId: input.dimension.id,
    targetDimensionLabel: input.dimension.label,
    rawDrafts: rawDrafts.slice(0, 25),
    rationale: `Generated from the exact ${input.dimension.label} gap, the current product/recipient context, and ${supportRows.length} eligible support row(s). No eRank metric is inferred; every candidate remains a hypothesis until researched.`,
  };
}
