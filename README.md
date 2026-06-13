# MalMap

An interactive process and malware behavior visualizer inspired by ProcDot and Microsoft Defender Blast Radius. Parses ProcMon CSV exports into a real-time, filterable graph.

## Features

- **CSV Import** — Drag-and-drop or browse to load a ProcMon CSV file
- **Interactive Graph** — Powered by vis.js; pan, zoom, drag nodes, tooltips
- **Process Tree Explorer** — Pick a root process to view only its sub-tree
- **Node Type Filters** — Toggle process, file, registry, network, and thread nodes on/off
- **Severity Rings** — Color-coded halos (red = critical, yellow = warning, green = normal) around process nodes
- **Auto-Arrange** — Switch between force-directed and left-to-right hierarchical layout
- **Layout Lock** — Freeze the physics engine after the graph settles

## Quick Start

Open `index.html` in any modern browser:

```bash
open index.html
```

## Usage

1. Click **Import CSV** (top bar) and select a ProcMon CSV export
2. The graph renders with processes as nodes, operations as edges
3. Use the **sidebar** to filter by node type
4. Select a specific **process tree** from the dropdown to isolate a sub-graph
5. Toggle **Arrange** for a hierarchical left-to-right view

## Data Format

ProcMon CSV with the following columns (order-independent):

```
"Time of Day","Process Name","PID","Operation","Path","Result","Detail"
```

All columns are preserved; unrecognized ones get auto-derived camelCase keys.

## Tech Stack

- Vanilla HTML / CSS / JavaScript
- [vis.js](https://visjs.org) (Network module via CDN)
- [Lucide](https://lucide.dev) icons

## License

MIT
