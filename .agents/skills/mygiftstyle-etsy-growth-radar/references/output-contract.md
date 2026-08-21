# Output contract

The deterministic script writes two artifacts.

## Dashboard JSON

`etsy-decision.json` version 2 contains:

- `mode`, `generatedAt`, and `evidenceAsOf`;
- source filenames, row counts, authority, and limitations;
- an Evidence Inbox manifest with coverage, validation, completeness, missing
  types, invalid files, and whether each input was used in the decision;
- a Trust Ledger that gives every displayed metric a value, authority, quality,
  freshness, source, and limitation note;
- shop-level snapshot metrics;
- the highest-signal exact-title duplicate cluster;
- exactly three daily targets;
- one recommendation with confidence and missing inputs;
- an owner gate that never authorises a live Etsy change;
- the latest Markdown report path.

The Dashboard may store a local owner-gate selection in browser storage for
the Demo. That selection is a UI demonstration only and must not be described
as an Etsy change or durable business decision.

`etsy-evidence.json` contains the standalone Evidence Inbox manifest. It must
not contain raw customer data, credentials, order details, or private messages.

Confidence rules:

- `High`: valid normalized Etsy first-party input covers every focus Listing ID
  and all focus numeric fields are present and valid;
- `Medium`: valid first-party focus rows contain missing numeric cells;
- `Low`: no valid first-party input, missing focus Listing IDs, invalid numeric
  cells, or an invalid schema.

## Markdown report

The report must include:

1. historical/demo status;
2. input sources and dates;
3. shop signals;
4. Revenue / Intent, Evidence, and Production;
5. proposed decision;
6. evidence and limitations;
7. missing first-party inputs;
8. confidence;
9. owner approval gate;
10. next actions.

## Status logging

The employee id is `etsy-growth-radar`.

- Start: `running`, output count `0`.
- Success: `done`, output count `1`, latest output path recorded.
- Failure: `error`, output count `0`.

Do not include API keys, passwords, customer data, order details, or private
messages in dashboard JSON or the committed demo report.
