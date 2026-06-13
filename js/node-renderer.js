// MalMap — Defender Incident Graph node renderer.
// Produces an SVG data-URI per node: dark charcoal puck + centered white
// Lucide icon (encodes type) + a severity-colored ring. Fed to Vis.js via
// `shape: "image"`. The neon glow itself is applied in app.js via Vis shadow.

/* Lucide icon name per node type. */
const TYPE_ICON = {
  process:  "cpu",
  file:     "file",
  registry: "key-round",
  network:  "globe",
  thread:   "git-branch",
};

/* Severity -> ring color + stroke width. */
const RING = {
  high: { color: "#e8590c", width: 7 }, // orange-red, critical
  mid:  { color: "#f0a020", width: 6 }, // gold, warning
  low:  { color: "#4a525e", width: 3 }, // muted gray, normal
};

const PUCK_FILL = "#2b2f36";
const ICON_COLOR = "#e6edf3";

// Render canvas is large for retina crispness; Vis downsizes to node `size`.
const BOX = 120;

/**
 * Serialize a Lucide icon (IconNode format: [ [tag, attrs], ... ]) into SVG
 * markup, scaled/translated to sit centered inside the puck.
 */
// "key-round" -> "KeyRound", "cpu" -> "Cpu" (lucide.icons keys are PascalCase).
function toPascal(name) {
  return name.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}

function lucideInner(iconName, scale, tx, ty) {
  const L = window.lucide || {};
  const icons = L.icons || {};
  const pascal = toPascal(iconName);
  // Try aggregate map first, then direct PascalCase named export.
  const node = icons[pascal] || icons[iconName] || L[pascal] || null;
  if (!node) return ""; // graceful fallback: puck with no glyph
  const children = node
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs || {})
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
      return `<${tag} ${a} />`;
    })
    .join("");
  // Lucide icons use a 24x24 viewBox; wrap so we can position/scale as a unit.
  return `<g transform="translate(${tx} ${ty}) scale(${scale})"
             fill="none" stroke="${ICON_COLOR}" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">${children}</g>`;
}

/**
 * Build the full node image as a data-URI.
 * @param {{type:string, severity:string}} n
 */
function buildNodeImage(n) {
  const ring = RING[n.severity] || RING.low;
  const iconName = TYPE_ICON[n.type] || "circle";

  const c = BOX / 2;                       // center
  const r = c - ring.width / 2 - 4;        // puck radius (leave room for ring)

  // Icon: native 24px box -> render at ~46px, centered.
  const iconPx = 46;
  const scale = iconPx / 24;
  const offset = c - iconPx / 2;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${BOX}" height="${BOX}" viewBox="0 0 ${BOX} ${BOX}">
    <circle cx="${c}" cy="${c}" r="${r}" fill="${PUCK_FILL}"
            stroke="${ring.color}" stroke-width="${ring.width}" />
    ${lucideInner(iconName, scale, offset, offset)}
  </svg>`;

  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
