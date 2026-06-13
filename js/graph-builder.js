// MalMap — event → graph transform (Step 5).
// Turns normalized ProcMon events (from parser.js) into ProcDOT-style
// nodes/edges: process nodes act on file / registry / network / thread /
// child-process nodes, with edges labeled by the operation.
//
//   const { nodes, edges } = buildGraphFromEvents(events);

const SEVERITY_RANK = { low: 0, mid: 1, high: 2 };

/* ---- Helpers ------------------------------------------------------------ */
function baseName(path) {
  if (!path) return "";
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
function regLeaf(path) {
  if (!path) return "";
  const parts = path.split("\\");
  return parts[parts.length - 1] || path;
}

// Target node type implied by the operation name.
function classifyOp(op) {
  const o = (op || "").toLowerCase();
  if (o.startsWith("reg")) return "registry";
  if (o.startsWith("tcp") || o.startsWith("udp")) return "network";
  if (o.includes("thread")) return "thread";
  if (o.startsWith("process")) return "process";
  return "file"; // CreateFile, ReadFile, WriteFile, CloseFile, ...
}

/* ---- Severity heuristic (single tunable function) ----------------------- */
// HIGH = classic malware tells, MID = process/registry/file mutations,
// LOW = reads/queries/closes/everything else. Easy to extend later.
function scoreSeverity(ev) {
  const op = (ev.operation || "").toLowerCase();
  const lpath = (ev.path || "").toLowerCase();

  // HIGH
  if (op === "regsetvalue" && /currentversion\\run|\\run\\|\\runonce/.test(lpath)) return "high";
  if (/^(createfile|writefile|setrenameinformationfile)$/.test(op) &&
      /(\\temp\\|\\appdata\\|\\programdata\\)/.test(lpath) &&
      /\.(exe|dll|scr|bat|cmd|ps1|vbs|js)$/.test(lpath)) return "high";
  if (op === "tcp connect" || op === "udp send") return "high";

  // MID
  if (op.startsWith("process")) return "mid";
  if (/^reg(setvalue|createkey|deletekey|deletevalue|renamekey)$/.test(op)) return "mid";
  if (/^(writefile|createfile|deletefile|setrenameinformationfile)$/.test(op)) return "mid";

  // LOW
  return "low";
}

/* ---- Builder ------------------------------------------------------------ */
function buildGraphFromEvents(events) {
  const nodeMap = new Map(); // id -> { id, label, type, severity, pid?, procName? }
  const edgeMap = new Map(); // "from|to|label" -> { from, to, label }
  const childPids = new Map(); // parentPid -> Set(childPid)  (process spawn tree)

  function ensureNode(id, label, type, severity) {
    let n = nodeMap.get(id);
    if (!n) {
      nodeMap.set(id, { id, label, type, severity: severity || "low" });
    } else if (SEVERITY_RANK[severity] > SEVERITY_RANK[n.severity]) {
      n.severity = severity;
    }
  }
  function addEdge(from, to, label) {
    if (!from || !to || from === to) return;
    const key = `${from}|${to}|${label}`;
    if (!edgeMap.has(key)) edgeMap.set(key, { from, to, label });
  }

  const hasTid = (ev) => ev.tid != null && ev.tid !== "";

  // An execution node IS a (process, thread). A single-threaded process shows
  // as one node; additional threads are sibling nodes with the same PID.
  function execNode(pid, tid, name, severity) {
    const id = tid != null ? `x:${pid}:${tid}` : `x:${pid}:_`;
    const label = tid != null
      ? `${name}\n(P-${pid}, T-${tid})`
      : `${name}\n(P-${pid})`;
    ensureNode(id, label, "process", severity);
    const n = nodeMap.get(id);
    n.pid = pid;                          // tag for process-tree filtering
    if (!n.procName) n.procName = name;
    return id;
  }

  // Pass 1: the "main thread" of each PID = the first TID seen for it.
  const mainTid = new Map();
  for (const ev of events || []) {
    if (ev.pid == null || ev.pid === "" || !hasTid(ev)) continue;
    if (!mainTid.has(ev.pid)) mainTid.set(ev.pid, ev.tid);
  }

  // Pass 2: build nodes/edges. Actions originate from the acting (pid, tid).
  for (const ev of events || []) {
    if (ev.pid == null || ev.pid === "" || !ev.processName) continue;

    const sev = scoreSeverity(ev);
    const op = ev.operation || "";
    const lop = op.toLowerCase();
    const path = ev.path || "";
    const type = classifyOp(op);
    const tid = hasTid(ev) ? ev.tid : null;

    const actorId = execNode(ev.pid, tid, ev.processName, sev);

    // Thread Create -> sibling thread node (same PID, new TID) via "new thread".
    if (type === "thread") {
      const tm = /Thread ID:\s*(\d+)/i.exec(ev.detail || "");
      if (tm) {
        const newId = execNode(ev.pid, tm[1], ev.processName, sev);
        addEdge(actorId, newId, "new thread");
      }
      continue;
    }

    // Process Create / Start -> establish parent-child edges.
    if (lop.startsWith("process")) {
      if (lop === "process start") {
        // Process Start: event PID is the child, detail has "Parent PID: <parent>"
        const pm = /Parent PID:\s*(\d+)/i.exec(ev.detail || "");
        if (pm) {
          const parentPid = Number(pm[1]);
          const childPid = ev.pid;
          const childTid = mainTid.has(childPid) ? mainTid.get(childPid) : null;
          const parentTid = mainTid.has(parentPid) ? mainTid.get(parentPid) : null;
          const childName = ev.processName || "process";
          const parentId = execNode(parentPid, parentTid, "process", "low");
          const childId = execNode(childPid, childTid, childName, sev);
          addEdge(parentId, childId, op);
          if (!childPids.has(parentPid)) childPids.set(parentPid, new Set());
          childPids.get(parentPid).add(childPid);
        }
        continue;
      }
      // Process Create: event PID is the parent, detail has "PID: <child>"
      const m = /PID:\s*(\d+)/i.exec(ev.detail || "");
      if (m) {
        const childPid = Number(m[1]);
        const childTid = mainTid.has(childPid) ? mainTid.get(childPid) : null;
        const childId = execNode(childPid, childTid, baseName(path) || "process", sev);
        addEdge(actorId, childId, op);
        if (!childPids.has(ev.pid)) childPids.set(ev.pid, new Set());
        childPids.get(ev.pid).add(childPid);
      } else if (path) {
        const fid = `f:${path}`;
        ensureNode(fid, baseName(path), "file", sev);
        addEdge(actorId, fid, op);
      }
      continue;
    }

    if (!path) continue; // nothing to connect to

    let targetId, label;
    if (type === "registry") { targetId = `r:${path}`; label = regLeaf(path); }
    else if (type === "network") { targetId = `n:${path}`; label = path; }
    else { targetId = `f:${path}`; label = baseName(path); }

    ensureNode(targetId, label, type, sev);
    addEdge(actorId, targetId, op);
  }

  // ---- Process hierarchy metadata ----
  // One entry per distinct PID (threads of a PID are grouped).
  const procMap = new Map(); // pid -> { pid, name, severity, threadCount }
  for (const n of nodeMap.values()) {
    if (n.pid == null) continue;
    let p = procMap.get(n.pid);
    if (!p) { p = { pid: n.pid, name: n.procName, severity: n.severity, threadCount: 0 }; procMap.set(n.pid, p); }
    p.threadCount++;
    if (SEVERITY_RANK[n.severity] > SEVERITY_RANK[p.severity]) p.severity = n.severity;
  }

  // Roots = PIDs that are never a child of another process in the capture.
  const allChildren = new Set();
  for (const kids of childPids.values()) for (const k of kids) allChildren.add(k);
  const roots = [...procMap.keys()].filter((pid) => !allChildren.has(pid));

  // Descendant process count per PID (BFS over the spawn tree).
  for (const p of procMap.values()) {
    const seen = new Set([p.pid]);
    const queue = [p.pid];
    while (queue.length) {
      const kids = childPids.get(queue.shift());
      if (kids) for (const k of kids) if (!seen.has(k)) { seen.add(k); queue.push(k); }
    }
    p.descendantCount = seen.size - 1;
  }

  return {
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
    processes: [...procMap.values()],
    roots,
    childPids,
  };
}

/**
 * Subgraph for one process tree: the chosen root PID, all descendant processes
 * (their thread nodes), and every file/registry/network target they touch.
 * rootPid === "*" returns the whole graph.
 */
function extractProcessTree(full, rootPid) {
  if (rootPid === "*") return { nodes: full.nodes, edges: full.edges };

  const root = Number(rootPid);
  const includePids = new Set([root]);
  const queue = [root];
  while (queue.length) {
    const kids = full.childPids.get(queue.shift());
    if (kids) for (const k of kids) if (!includePids.has(k)) { includePids.add(k); queue.push(k); }
  }

  const byId = new Map(full.nodes.map((n) => [n.id, n]));
  const nodeIds = new Set();
  for (const n of full.nodes) if (n.pid != null && includePids.has(n.pid)) nodeIds.add(n.id);

  // Pull in target nodes (no pid) connected to an included execution node.
  for (const e of full.edges) {
    if (nodeIds.has(e.from) && !nodeIds.has(e.to) && byId.get(e.to)?.pid == null) nodeIds.add(e.to);
    if (nodeIds.has(e.to) && !nodeIds.has(e.from) && byId.get(e.from)?.pid == null) nodeIds.add(e.from);
  }

  return {
    nodes: full.nodes.filter((n) => nodeIds.has(n.id)),
    edges: full.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to)),
  };
}

// Expose globally (classic script).
window.buildGraphFromEvents = buildGraphFromEvents;
window.extractProcessTree = extractProcessTree;
