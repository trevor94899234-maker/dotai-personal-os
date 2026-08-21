---
name: mygiftstyle-etsy-growth-radar
description: Turn owner-provided Etsy Stats, eRank, or EverBee exports and screenshots into one evidence-backed daily Etsy decision brief for MyGiftStyle. Use when the owner says 今日開工, 今日 Etsy 做甚麼, 下一步, asks for an Etsy daily review, or provides fresh Etsy/eRank/EverBee data for prioritisation. Do not use this skill to log in to external services, scrape data, publish listings, change prices, run ads, or contact customers.
---

# MyGiftStyle Etsy Growth Radar

Run a safe, owner-controlled daily decision workflow from files the owner has
already supplied or exported.

## Read first

1. Read the nearest applicable `AGENT.md` or `AGENTS.md`.
2. Read the current Etsy `handoff.md`, `OPERATING_DASHBOARD.md`, `DECISIONS.md`,
   and `04-SOP/daily-growth-review-and-keyword-gate.md` when available.
3. Treat current owner-provided Etsy first-party facts as stronger than any
   eRank or EverBee estimate.

## Input gate

Accept:

- Etsy Stats or listing-performance exports/screenshots;
- eRank or EverBee CSV exports;
- current listing facts and owner decisions;
- an explicitly approved historical snapshot for a labelled demo.

Before analysis:

1. Record every source name and evidence date.
2. Mark missing first-party Etsy inputs.
3. Mark historical or third-party inputs as non-live.
4. Do not replace a requested missing input with adjacent data unless the owner
   explicitly authorises an assumptions-based route.

## Workflow

1. Check active tests, review dates, and `do not touch` listings.
2. Order signals as: orders/revenue, carts/buyer questions, favorites, Etsy
   search visits/terms, views/impressions, then social outbound clicks.
3. Identify one diagnosis only.
4. Select exactly three targets:
   - `Revenue / Intent`: the work closest to a qualified buying signal;
   - `Evidence`: the most important missing or overdue measurement;
   - `Production`: one draft, asset, or QA package only.
5. Recommend one main action with evidence, missing inputs, confidence, and
   owner-approval status.
6. Never claim a price, image, SEO, or conversion conclusion when impressions
   or first-party evidence are insufficient.
7. Stop before any live Etsy or social action.

## Deterministic CSV run

When a compatible EverBee listing CSV is supplied, run:

```text
node .agents/skills/mygiftstyle-etsy-growth-radar/scripts/run-growth-radar.mjs \
  --listings <everbee-listings.csv> \
  --keywords <optional-keywords.csv> \
  --etsy-stats <optional-normalized-etsy-stats.csv> \
  --search-terms <optional-owner-export-or-screenshot> \
  --traffic-sources <optional-owner-export-or-screenshot> \
  --coverage-start YYYY-MM-DD \
  --coverage-end YYYY-MM-DD \
  --as-of YYYY-MM-DD \
  --dashboard public/data/etsy-decision.json \
  --evidence-output public/data/etsy-evidence.json \
  --report demo-output/YYYY-MM-DD-etsy-growth-radar.md \
  --agents public/data/agents.json
```

Evidence Inbox v1 uses a strict normalized first-party CSV adapter with these
headers: `Listing ID`, `Listing Name`, `Views`, `Visits`, `Favorites`, `Orders`,
and `Revenue`. Blank numeric cells are `missing`; invalid text is `invalid`;
only an explicit numeric zero is zero. Search terms, traffic sources, and Share
& Save are intake-only in v1: their presence and authority are recorded, but
their contents are not merged into metric totals.

The script records `running`, writes the decision JSON and Traditional Chinese
report, then records `done` with the output path. On failure it records `error`.

Read [references/output-contract.md](references/output-contract.md) before
changing the dashboard schema or report structure.

## Output rules

- Discuss strategy in Traditional Chinese / Cantonese-style.
- Keep Etsy-facing copy in natural American English.
- Label the result `draft`, `historical demo`, or `owner-approved` accurately.
- Include sources, dates, limitations, confidence, and missing inputs.
- Generate an evidence manifest and Trust Ledger before presenting metrics.
- Derive confidence from validated first-party focus rows; do not hard-code it.
- End with 2-3 prioritised next actions and mark the recommended option.
- Never record a completed draft as a published listing.
