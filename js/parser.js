// MalMap — ProcMon CSV parser engine (Step 4).
// Turns raw Process Monitor CSV text into normalized event objects.
// Pure module: no DOM, no graph wiring (that's Step 5).
//
// Usage:  const { columns, events, errors } = parseProcmonCSV(text);
//
// ProcMon's default export is fully double-quoted, comma-separated, with the
// Detail/Path fields often containing commas *inside* the quotes — so a real
// quoted-CSV tokenizer is required, not split(",").

/* Canonical-name OVERRIDES for the headers the app/graph builder relies on.
   Any column NOT listed here still gets an auto-derived camelCase field (see
   toCamelKey) plus its verbatim value in `raw` — so every column is captured,
   not just a fixed list. */
const HEADER_MAP = {
  "time of day":  "timeOfDay",
  "process name": "processName",
  "pid":          "pid",
  "operation":    "operation",
  "path":         "path",
  "result":       "result",
  "detail":       "detail",
  "tid":          "tid",
};

// Fields coerced to Number when parseable (explicit allow-list — never coerce
// arbitrary columns, which could mangle durations, IPs, integrity labels, etc.)
const NUMERIC_FIELDS = new Set(["pid", "tid", "sequence", "sessionId"]);

/* Derive a stable camelCase field key from any header string.
   "Relative Time" -> relativeTime, "Date & Time" -> dateTime,
   "Authentication ID" -> authenticationId, "Event Class" -> eventClass. */
function toCamelKey(header) {
  const words = String(header)
    .replace(/[^A-Za-z0-9]+/g, " ") // drop &, punctuation, etc.
    .trim()
    .split(/\s+/);
  if (words.length === 0 || words[0] === "") return "field";
  return words
    .map((w, i) => {
      const lower = w.toLowerCase(); // normalize acronyms: "ID" -> "Id"
      return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

/**
 * Tokenize CSV text into an array of rows (each row an array of string cells).
 * Handles quoted fields, embedded commas/newlines, and "" escaped quotes.
 */
function tokenizeCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let sawAny = false; // did this row receive any cell content/separators?

  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { rows.push(row); row = []; sawAny = false; };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else { inQuotes = false; }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      sawAny = true;
    } else if (ch === ",") {
      pushField();
      sawAny = true;
    } else if (ch === "\n") {
      pushField();
      // Skip truly empty lines (no content, no separators).
      if (sawAny || row.length > 1 || row[0] !== "") pushRow();
      else { row = []; }
    } else {
      field += ch;
      sawAny = true;
    }
  }

  // Flush trailing field/row (file may not end with a newline).
  if (inQuotes || field !== "" || row.length > 0) {
    pushField();
    if (sawAny || row.length > 1 || row[0] !== "") pushRow();
  }

  return rows;
}

/**
 * Parse ProcMon CSV text into normalized events.
 * @param {string} text
 * @returns {{columns:string[], events:object[], errors:{line:number,message:string}[]}}
 */
function parseProcmonCSV(text) {
  const errors = [];
  const events = [];

  if (typeof text !== "string" || text.trim() === "") {
    return { columns: [], events, errors: [{ line: 0, message: "Empty input." }] };
  }

  // Strip UTF-8 BOM and normalize line endings.
  let clean = text;
  if (clean.charCodeAt(0) === 0xfeff) clean = clean.slice(1);
  clean = clean.replace(/\r\n?/g, "\n");

  const rows = tokenizeCSV(clean);
  if (rows.length === 0) {
    return { columns: [], events, errors: [{ line: 0, message: "No rows found." }] };
  }

  // Header row. Every column gets a field key: a canonical override when known,
  // otherwise an auto-derived camelCase key — so no column is ever dropped.
  const columns = rows[0].map((h) => h.trim());
  const fieldNames = columns.map((h) => HEADER_MAP[h.toLowerCase()] || toCamelKey(h));
  // Sanity gate: require at least one recognizable canonical ProcMon column.
  const recognized = columns.some((h) => HEADER_MAP[h.toLowerCase()] !== undefined);
  if (!recognized) {
    errors.push({ line: 1, message: "No recognizable ProcMon header columns found." });
    return { columns, events, errors };
  }

  // Data rows (header is line 1).
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const line = r + 1;

    if (cells.length !== columns.length) {
      errors.push({
        line,
        message: `Expected ${columns.length} columns, got ${cells.length}.`,
      });
      continue;
    }

    const event = { raw: {} };
    for (let c = 0; c < columns.length; c++) {
      const value = cells[c].trim();
      event.raw[columns[c]] = value;

      const field = fieldNames[c];
      if (NUMERIC_FIELDS.has(field)) {
        const num = Number(value);
        event[field] = Number.isFinite(num) ? num : value;
      } else {
        event[field] = value;
      }
    }
    events.push(event);
  }

  return { columns, events, errors };
}

// Expose globally for the app and the test harness (classic script).
window.parseProcmonCSV = parseProcmonCSV;
