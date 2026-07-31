# Output contract

The deterministic script writes two artifacts.

## Dashboard JSON

`etsy-decision.json` contains:

- `mode`, `generatedAt`, and `evidenceAsOf`;
- source filenames, row counts, authority, and limitations;
- shop-level snapshot metrics;
- the highest-signal exact-title duplicate cluster;
- exactly three daily targets;
- one recommendation with confidence and missing inputs;
- an owner gate that never authorises a live Etsy change;
- the latest Markdown report path.

The Dashboard may store a local owner-gate selection in browser storage for
the Demo. That selection is a UI demonstration only and must not be described
as an Etsy change or durable business decision.

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
