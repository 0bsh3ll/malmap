// Minimal test: parse a tiny CSV with a Thread Create and check edges.
// Run: node test/trace-test.js

const fs = require("fs");

// Manually inline the parser logic (extracted from parser.js)
const HEADER_MAP = {
  "time of day": "timeOfDay", "process name": "processName",
  "pid": "pid", "operation": "operation", "path": "path",
  "result": "result", "detail": "detail", "tid": "tid",
};
const NUMERIC_FIELDS = new Set(["pid", "tid", "sequence", "sessionId"]);

function toCamelKey(header) {
  const words = String(header).replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/);
  if (words.length === 0 || words[0] === "") return "field";
  return words.map((w, i) => { const l = w.toLowerCase(); return i === 0 ? l : l.charAt(0).toUpperCase() + l.slice(1); }).join("");
}

function tokenizeCSV(text) {
  const rows = []; let row = []; let field = ""; let inQuotes = false; let sawAny = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { rows.push(row); row = []; sawAny = false; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') { if (text[i+1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; sawAny = true; }
    else if (ch === ",") { pushField(); sawAny = true; }
    else if (ch === "\n") { pushField(); if (sawAny || row.length > 1 || row[0] !== "") pushRow(); else row = []; }
    else { field += ch; sawAny = true; }
  }
  if (inQuotes || field !== "" || row.length > 0) { pushField(); if (sawAny || row.length > 1 || row[0] !== "") pushRow(); }
  return rows;
}

function parseProcmonCSV(text) {
  const errors = []; const events = [];
  if (typeof text !== "string" || text.trim() === "") return { columns: [], events, errors: [{ line: 0, message: "Empty input." }] };
  let clean = text;
  if (clean.charCodeAt(0) === 0xfeff) clean = clean.slice(1);
  clean = clean.replace(/\r\n?/g, "\n");
  const rows = tokenizeCSV(clean);
  if (rows.length === 0) return { columns: [], events, errors: [{ line: 0, message: "No rows found." }] };
  const columns = rows[0].map(h => h.trim());
  const fieldNames = columns.map(h => HEADER_MAP[h.toLowerCase()] || toCamelKey(h));
  const recognized = columns.some(h => HEADER_MAP[h.toLowerCase()] !== undefined);
  if (!recognized) { errors.push({ line: 1, message: "No recognizable ProcMon header columns found." }); return { columns, events, errors }; }
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]; const line = r + 1;
    if (cells.length !== columns.length) { errors.push({ line, message: `Expected ${columns.length} columns, got ${cells.length}.` }); continue; }
    const event = { raw: {} };
    for (let c = 0; c < columns.length; c++) {
      const value = cells[c].trim();
      event.raw[columns[c]] = value;
      const field = fieldNames[c];
      if (NUMERIC_FIELDS.has(field)) { const num = Number(value); event[field] = Number.isFinite(num) ? num : value; }
      else event[field] = value;
    }
    events.push(event);
  }
  return { columns, events, errors };
}

// Inline graph-builder.js logic
const SEVERITY_RANK = { low: 0, mid: 1, high: 2 };

function baseName(path) { if (!path) return ""; const parts = path.split(/[\\/]/); return parts[parts.length - 1] || path; }
function regLeaf(path) { if (!path) return ""; const parts = path.split("\\"); return parts[parts.length - 1] || path; }

function classifyOp(op) {
  const o = (op || "").toLowerCase();
  if (o.startsWith("reg")) return "registry";
  if (o.startsWith("tcp") || o.startsWith("udp")) return "network";
  if (o.includes("thread")) return "thread";
  if (o.startsWith("process")) return "process";
  return "file";
}

function scoreSeverity(ev) {
  const op = (ev.operation || "").toLowerCase();
  const lpath = (ev.path || "").toLowerCase();
  if (op === "regsetvalue" && /currentversion\\run|\\run\\|\\runonce/.test(lpath)) return "high";
  if (/^(createfile|writefile|setrenameinformationfile)$/.test(op) && /(\\temp\\|\\appdata\\|\\programdata\\)/.test(lpath) && /\.(exe|dll|scr|bat|cmd|ps1|vbs|js)$/.test(lpath)) return "high";
  if (op === "tcp connect" || op === "udp send") return "high";
  if (op.startsWith("process")) return "mid";
  if (/^reg(setvalue|createkey|deletekey|deletevalue|renamekey)$/.test(op)) return "mid";
  if (/^(writefile|createfile|deletefile|setrenameinformationfile)$/.test(op)) return "mid";
  return "low";
}

function buildGraphFromEvents(events) {
  const nodeMap = new Map();
  const edgeMap = new Map();
  const childPids = new Map();

  function ensureNode(id, label, type, severity) {
    let n = nodeMap.get(id);
    if (!n) nodeMap.set(id, { id, label, type, severity: severity || "low" });
    else if (SEVERITY_RANK[severity] > SEVERITY_RANK[n.severity]) n.severity = severity;
  }
  function addEdge(from, to, label) {
    if (!from || !to || from === to) return;
    const key = `${from}|${to}|${label}`;
    if (!edgeMap.has(key)) edgeMap.set(key, { from, to, label });
  }

  const hasTid = (ev) => ev.tid != null && ev.tid !== "";

  function execNode(pid, tid, name, severity) {
    const id = tid != null ? `x:${pid}:${tid}` : `x:${pid}:_`;
    const label = tid != null ? `${name}\n(P-${pid}, T-${tid})` : `${name}\n(P-${pid})`;
    ensureNode(id, label, "process", severity);
    const n = nodeMap.get(id);
    n.pid = pid;
    if (!n.procName) n.procName = name;
    return id;
  }

  const mainTid = new Map();
  for (const ev of events || []) {
    if (ev.pid == null || ev.pid === "" || !hasTid(ev)) continue;
    if (!mainTid.has(ev.pid)) mainTid.set(ev.pid, ev.tid);
  }

  for (const ev of events || []) {
    if (ev.pid == null || ev.pid === "" || !ev.processName) continue;
    const sev = scoreSeverity(ev);
    const op = ev.operation || "";
    const lop = op.toLowerCase();
    const path = ev.path || "";
    const type = classifyOp(op);
    const tid = hasTid(ev) ? ev.tid : null;
    const actorId = execNode(ev.pid, tid, ev.processName, sev);

    if (type === "thread") {
      const tm = /Thread ID:\s*(\d+)/i.exec(ev.detail || "");
      if (tm) {
        const newId = execNode(ev.pid, tm[1], ev.processName, sev);
        addEdge(actorId, newId, "new thread");
        console.log(`THREAD EDGE: ${actorId} -> ${newId} (detail: "${ev.detail}")`);
      } else {
        console.log(`THREAD NO MATCH: op=${op}, detail="${ev.detail}"`);
      }
      continue;
    }
    // rest of handling omitted for brevity — we only care about thread edges
  }

  return { nodes: [...nodeMap.values()], edges: [...edgeMap.values()] };
}

// === TEST ===
const csv = `"Time of Day","Process Name","PID","Operation","Path","Result","Detail","TID"
"12:32:36.8123979 PM","Explorer.EXE","3084","Thread Create","","SUCCESS","Thread ID: 1976","1544"`;

const { events, errors } = parseProcmonCSV(csv);
console.log("Events parsed:", events.length, "Errors:", errors.length);
console.log("Event 0:", JSON.stringify(events[0], null, 2));

const graph = buildGraphFromEvents(events);
console.log("Nodes:", graph.nodes.length);
console.log("Edges:", graph.edges.length);
graph.edges.forEach(e => console.log(`  ${e.from} -> ${e.to} [${e.label}]`));
graph.nodes.forEach(n => console.log(`  ${n.id} pid=${n.pid} type=${n.type}`));
