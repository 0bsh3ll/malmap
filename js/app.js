// MalMap — app wiring (Step 5).
// Renders a graph dataset with Vis.js, supports reloading from an imported
// ProcMon CSV, and drives the sidebar filters/legend + layout lock.

// Render the static Lucide icons in the shell (top bar, sidebar, status bar).
lucide.createIcons();

/* ---- Visual model ------------------------------------------------------ */
// Node pucks are uniform dark; severity drives the ring color in the SVG
// renderer (see node-renderer.js) and the puck size below.
const SEVERITY_SIZE = { high: 30, mid: 26, low: 22 };

function styleNode(n) {
  return {
    id: n.id,
    label: n.label,
    type: n.type,
    severity: n.severity,
    shape: "image",
    image: buildNodeImage(n),
    size: n.isHub ? 18 : (SEVERITY_SIZE[n.severity] || 22),
    font: {
      color: "#e6edf3",
      size: n.isHub ? 11 : 13,
      face: "Segoe UI",
      vadjust: n.isHub ? 0 : 4,
    },
  };
}

function styleEdge(e) {
  const isHub = e.label === "thread";
  return {
    from: e.from,
    to: e.to,
    label: e.label,
    arrows: isHub ? { to: { enabled: false } } : { to: { enabled: true, scaleFactor: 0.6 } },
    dashes: isHub,
    color: isHub ? { color: "#4a525e" } : { color: "#4a525e", highlight: "#8b98a8", hover: "#8b98a8" },
    font: { color: "#8b98a8", size: 11, strokeWidth: 4, strokeColor: "#0d1117", align: "middle" },
    smooth: { enabled: true, type: "continuous", roundness: 0.5 },
    width: isHub ? 1 : 1.5,
  };
}

/* ---- Network ------------------------------------------------------------ */
const nodes = new vis.DataSet([]);
const edges = new vis.DataSet([]);

const options = {
  autoResize: true,
  nodes: { borderWidthSelected: 4 },
  edges: { selectionWidth: 1.5 },
  interaction: { hover: true, dragNodes: true, zoomView: true, dragView: true, tooltipDelay: 120 },
  physics: {
    enabled: true,
    solver: "barnesHut",
    barnesHut: { gravitationalConstant: -8000, springLength: 140, springConstant: 0.04, damping: 0.4 },
    stabilization: { iterations: 200 },
  },
  manipulation: { enabled: false },
  layout: { improvedLayout: true },
};

const graphEl = document.getElementById("graph");
const emptyState = graphEl.querySelector(".empty-state");
if (emptyState) emptyState.remove();

const network = new vis.Network(graphEl, { nodes, edges }, options);
// Recenter once the force layout settles after each (re)load.
network.on("stabilizationIterationsDone", () => network.fit({ animation: true }));

/* ---- Node-type metadata (icons come from node-renderer.js TYPE_ICON) ---- */
const TYPE_ORDER = ["process", "file", "registry", "network", "thread"];
const TYPE_LABEL = {
  process: "Processes", file: "Files", registry: "Registry",
  network: "Network", thread: "Threads",
};

let typesPresent = [];
let activeTypes = new Set();

const counts = document.querySelectorAll(".statusbar__item strong");
const filtersEl = document.getElementById("nodeTypeFilters");
const legendEl = document.getElementById("legend");

/* ---- Filtering ---------------------------------------------------------- */
function applyFilters() {
  nodes.update(nodes.get().map((n) => ({ id: n.id, hidden: !activeTypes.has(n.type) })));
  const hiddenIds = new Set(nodes.get({ filter: (n) => n.hidden }).map((n) => n.id));
  edges.update(edges.get().map((e) => ({
    id: e.id,
    hidden: hiddenIds.has(e.from) || hiddenIds.has(e.to),
  })));
  if (counts[0]) counts[0].textContent = nodes.get({ filter: (n) => !n.hidden }).length;
  if (counts[1]) counts[1].textContent = edges.get({ filter: (e) => !e.hidden }).length;
}

function buildFilterUI(dataNodes) {
  filtersEl.innerHTML = "";
  typesPresent.forEach((type) => {
    const count = dataNodes.filter((n) => n.type === type).length;
    const row = document.createElement("button");
    row.type = "button";
    row.className = "filter-row" + (activeTypes.has(type) ? " is-on" : "");
    row.dataset.type = type;
    row.innerHTML = `
      <span class="filter-row__icon"><i data-lucide="${TYPE_ICON[type]}"></i></span>
      <span class="filter-row__label">${TYPE_LABEL[type] || type}</span>
      <span class="filter-row__count">${count}</span>
      <span class="filter-row__check"><i data-lucide="check"></i></span>`;
    row.addEventListener("click", () => {
      if (activeTypes.has(type)) activeTypes.delete(type);
      else activeTypes.add(type);
      row.classList.toggle("is-on", activeTypes.has(type));
      applyFilters();
    });
    filtersEl.appendChild(row);
  });
}

function buildLegend() {
  const typeItems = typesPresent.map((t) => `
      <div class="legend__item">
        <span class="legend__icon"><i data-lucide="${TYPE_ICON[t]}"></i></span>
        <span>${TYPE_LABEL[t] || t}</span>
      </div>`).join("");
  const sevItems = [["high", "Critical"], ["mid", "Warning"], ["low", "Normal"]].map(
    ([key, label]) => `
      <div class="legend__item">
        <span class="legend__ring" style="border-color:${RING[key].color}"></span>
        <span>${label}</span>
      </div>`).join("");
  legendEl.innerHTML = `
    <div class="legend__group-title">Node types</div>${typeItems}
    <div class="legend__group-title">Severity ring</div>${sevItems}`;
}

/* ---- Load / reload a graph dataset { nodes, edges } --------------------- */
function loadGraph(data) {
  nodes.clear();
  edges.clear();
  nodes.add(data.nodes.map(styleNode));
  edges.add(data.edges.map(styleEdge));

  typesPresent = TYPE_ORDER.filter((t) => data.nodes.some((n) => n.type === t));
  activeTypes = new Set(typesPresent.filter((t) => t === "process"));

  buildFilterUI(data.nodes);
  buildLegend();
  lucide.createIcons(); // render filter + legend icons
  applyFilters();
}

/* ---- Status indicator --------------------------------------------------- */
const statusEl = document.getElementById("status");
const statusLabel = document.getElementById("statusLabel");
function setStatus(text, state /* idle | loaded | error */) {
  statusLabel.textContent = text;
  statusEl.className = `status status--${state}`;
}

/* ---- Layout lock toggle ------------------------------------------------- */
let layoutLocked = false;
const lockToggle = document.getElementById("lockToggle");

function renderLockState() {
  lockToggle.classList.toggle("is-on", layoutLocked);
  lockToggle.setAttribute("aria-checked", String(layoutLocked));
  lockToggle.querySelector(".toggle__icon").innerHTML =
    `<i data-lucide="${layoutLocked ? "lock" : "lock-open"}"></i>`;
  lucide.createIcons();
}

if (lockToggle) {
  lockToggle.addEventListener("click", () => {
    layoutLocked = !layoutLocked;
    network.setOptions({ physics: { enabled: !layoutLocked } });
    renderLockState();
  });
}

function setLayoutLive() {
  layoutLocked = false;
  network.setOptions({ physics: { enabled: true } });
  renderLockState();
}

/* ---- Process-tree selector ---------------------------------------------- */
// After import we keep the full parsed graph and let the user pick which root
// process tree to view (large logs have many independent trees).
let fullGraph = null;
const treePanel = document.getElementById("treePanel");
const treeSelect = document.getElementById("treeSelect");

function populateTreeSelect(full) {
  treeSelect.innerHTML = "";
  const rootProcs = full.processes
    .filter((p) => full.roots.includes(p.pid))
    .sort((a, b) => b.descendantCount - a.descendantCount || a.name.localeCompare(b.name));
  for (const p of rootProcs) {
    const opt = document.createElement("option");
    opt.value = String(p.pid);
    opt.textContent = `${p.name} (P-${p.pid}) — ${p.descendantCount + 1} proc`;
    treeSelect.appendChild(opt);
  }
  const all = document.createElement("option");
  all.value = "*";
  all.textContent = `All processes (${full.processes.length})`;
  treeSelect.appendChild(all);
}

if (treeSelect) {
  treeSelect.addEventListener("change", () => {
    if (!fullGraph) return;
    loadGraph(extractProcessTree(fullGraph, treeSelect.value));
  });
}

/* ---- Spinner ------------------------------------------------------------ */
const spinnerEl = document.getElementById("spinner");

/* ---- Process tree picker modal ----------------------------------------- */
const treeModal = document.getElementById("treeModal");
const modalTreeList = document.getElementById("modalTreeList");
const modalLoadBtn = document.getElementById("modalLoadBtn");

let pendingStatus = null;

/* ---- Import CSV --------------------------------------------------------- */
const importBtn = document.getElementById("importBtn");
const fileInput = document.getElementById("fileInput");

if (importBtn && fileInput) {
  importBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    spinnerEl.classList.add("is-visible");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { events, errors } = parseProcmonCSV(String(reader.result));
        if (!events.length) {
          setStatus(`${file.name} — no events parsed`, "error");
          spinnerEl.classList.remove("is-visible");
          return;
        }
        fullGraph = buildGraphFromEvents(events);
        populateTreeSelect(fullGraph);
        treePanel.hidden = false;
        setLayoutLive();

        spinnerEl.classList.remove("is-visible");

        if (fullGraph.roots.length > 1) {
          pendingStatus = { name: file.name, events: events.length, roots: fullGraph.roots.length, errors: errors.length };
          modalTreeList.innerHTML = "";
          const rootProcs = fullGraph.processes
            .filter((p) => fullGraph.roots.includes(p.pid))
            .sort((a, b) => b.descendantCount - a.descendantCount || a.name.localeCompare(b.name));

          rootProcs.forEach((p, i) => {
            const label = document.createElement("label");
            label.className = "modal__option";
            label.innerHTML = `
              <input type="radio" name="treeRoot" value="${p.pid}" ${i === 0 ? "checked" : ""}>
              <span class="modal__option-label">${p.name} (P-${p.pid})</span>
              <span class="modal__option-count">${p.descendantCount + 1} procs</span>`;
            modalTreeList.appendChild(label);
          });

          // "All processes" option
          const allLabel = document.createElement("label");
          allLabel.className = "modal__option";
          allLabel.innerHTML = `
            <input type="radio" name="treeRoot" value="*">
            <span class="modal__option-label">All processes</span>
            <span class="modal__option-count">${fullGraph.processes.length} procs</span>`;
          modalTreeList.appendChild(allLabel);

          treeModal.classList.add("is-visible");
        } else {
          const errNote = errors.length ? `, ${errors.length} skipped` : "";
          setStatus(`${file.name} — ${events.length} events, ${fullGraph.roots.length} trees${errNote}`, "loaded");
          loadGraph(extractProcessTree(fullGraph, treeSelect.value));
        }
      } catch (err) {
        console.error("Import failed:", err);
        setStatus(`${file.name} — parse failed`, "error");
        spinnerEl.classList.remove("is-visible");
      }
    };
    reader.onerror = () => {
      setStatus(`${file.name} — read failed`, "error");
      spinnerEl.classList.remove("is-visible");
    };
    reader.readAsText(file);
    fileInput.value = "";
  });
}

if (modalLoadBtn) {
  modalLoadBtn.addEventListener("click", () => {
    const selected = modalTreeList.querySelector('input[name="treeRoot"]:checked');
    if (!selected) return;
    const s = pendingStatus;
    const errNote = s.errors ? `, ${s.errors} skipped` : "";
    setStatus(`${s.name} — ${s.events} events, ${s.roots} trees${errNote}`, "loaded");
    loadGraph(extractProcessTree(fullGraph, selected.value));
    treeModal.classList.remove("is-visible");
  });
}

/* ---- Auto-arrange (hierarchical left-to-right) -------------------------- */
// On: roots (e.g. explorer.exe) on the left, descendant/newer processes to the
// right. Off: restore the free force layout, respecting the Lock toggle.
let arranged = false;
const arrangeBtn = document.getElementById("arrangeBtn");

if (arrangeBtn) {
  arrangeBtn.addEventListener("click", () => {
    arranged = !arranged;
    if (arranged) {
      // Place hub nodes at level 1 (same as threads) so hub→thread edges
      // don't push everything an extra level to the right.
      nodes.update(
        nodes.get({ filter: (n) => n.isHub }).map((n) => ({ id: n.id, level: 1 })),
      );
      network.setOptions({
        layout: {
          hierarchical: {
            enabled: true,
            direction: "LR",
            sortMethod: "directed",
            shakeTowards: "roots",
            levelSeparation: 200,
            nodeSpacing: 110,
          },
        },
        physics: false,
      });
    } else {
      // Remove explicit level from hub nodes (let physics engine place them).
      nodes.update(
        nodes.get({ filter: (n) => n.isHub }).map((n) => ({ id: n.id, level: undefined })),
      );
      network.setOptions({
        layout: { hierarchical: { enabled: false } },
        physics: { enabled: !layoutLocked },
      });
    }
    arrangeBtn.classList.toggle("is-active", arranged);
    arrangeBtn.setAttribute("aria-pressed", String(arranged));
    network.fit({ animation: true });
  });
}

/* ---- Initial load: mock telemetry --------------------------------------- */
loadGraph(MALMAP_MOCK);
