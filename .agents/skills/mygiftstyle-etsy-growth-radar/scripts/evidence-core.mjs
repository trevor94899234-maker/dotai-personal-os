export const EVERBEE_LISTING_HEADERS = [
  "Product Name",
  "Product Link",
  "Total Views",
  "Total Favorites",
];

export const ETSY_STATS_HEADERS = [
  "Listing ID",
  "Listing Name",
  "Views",
  "Visits",
  "Favorites",
  "Orders",
  "Revenue",
];

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "").trim() : header.trim(),
  );
  const records = rows
    .slice(1)
    .filter((values) => values.some((value) => value.trim() !== ""))
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
    );

  return { headers, rows: records };
}

export function validateHeaders(headers, requiredHeaders) {
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  return { valid: missing.length === 0, missing };
}

export function parseNumericCell(value) {
  const raw = String(value ?? "").trim();
  if (raw === "") return { status: "missing", value: null };
  const parsed = Number(raw.replace(/[$,%\s,]/g, ""));
  if (!Number.isFinite(parsed)) return { status: "invalid", value: null };
  return { status: "valid", value: parsed };
}

export function summarizeNumeric(rows, field) {
  let value = 0;
  let validRows = 0;
  let missingRows = 0;
  let invalidRows = 0;

  for (const row of rows) {
    const parsed = parseNumericCell(row[field]);
    if (parsed.status === "valid") {
      value += parsed.value;
      validRows += 1;
    } else if (parsed.status === "missing") {
      missingRows += 1;
    } else {
      invalidRows += 1;
    }
  }

  const quality =
    invalidRows > 0 ? "invalid" : missingRows > 0 ? "partial" : validRows > 0 ? "verified" : "missing";
  return { value: validRows > 0 ? value : null, validRows, missingRows, invalidRows, quality };
}

export function countExplicitZero(rows, field) {
  return rows.reduce((count, row) => {
    const parsed = parseNumericCell(row[field]);
    return count + (parsed.status === "valid" && parsed.value === 0 ? 1 : 0);
  }, 0);
}

export function evidenceConfidence({ firstPartyStats, focusRowsFound, numericSummaries }) {
  if (!firstPartyStats?.valid) return "Low";
  const hasInvalid = numericSummaries.some((summary) => summary.invalidRows > 0);
  const hasMissing = numericSummaries.some((summary) => summary.missingRows > 0);
  if (!focusRowsFound || hasInvalid) return "Low";
  if (hasMissing) return "Medium";
  return "High";
}

export function freshness(asOf, now = new Date()) {
  const timestamp = new Date(`${asOf}T00:00:00Z`).getTime();
  if (!Number.isFinite(timestamp)) return { status: "unknown", ageDays: null };
  const ageDays = Math.max(0, Math.floor((now.getTime() - timestamp) / 86_400_000));
  return { status: ageDays > 30 ? "stale" : "fresh", ageDays };
}
