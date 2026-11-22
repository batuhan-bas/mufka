// Canvas files (.canvas), as Obsidian writes them: the JSON Canvas format
// (jsoncanvas.org). { nodes: [...], edges: [...] }; a node is a text card,
// a file (a note or an image), a link or a group, placed by x / y / width /
// height. Fields Mufka does not know are kept as they are. Pure; no DOM.

export const NODE_TYPES = ['text', 'file', 'link', 'group'];
export const SIDES = ['top', 'right', 'bottom', 'left'];
// Obsidian's preset colours '1'…'6'; any "#rrggbb" works too.
export const PRESET_COLORS = ['1', '2', '3', '4', '5', '6'];

const num = (v, d) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d);

// → { nodes, edges, rest } (rest: other top-level keys), or { error }.
export function parseCanvas(text) {
  let data;
  if (!String(text || '').trim()) data = {};
  else {
    try { data = JSON.parse(text); } catch (e) { return { error: `This canvas is not valid JSON (${e.message})` }; }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'This canvas is not a JSON object' };
  const { nodes = [], edges = [], ...rest } = data;
  const seen = new Set();
  const outNodes = (Array.isArray(nodes) ? nodes : []).filter((n) => n && typeof n === 'object' && n.id != null && !seen.has(n.id) && seen.add(n.id))
    .map((n) => ({ ...n, id: String(n.id), type: NODE_TYPES.includes(n.type) ? n.type : 'text', x: num(n.x, 0), y: num(n.y, 0), width: Math.max(40, num(n.width, 250)), height: Math.max(30, num(n.height, 60)) }));
  const ids = new Set(outNodes.map((n) => n.id));
  const outEdges = (Array.isArray(edges) ? edges : []).filter((e) => e && typeof e === 'object' && ids.has(String(e.fromNode)) && ids.has(String(e.toNode)))
    .map((e) => ({ ...e, id: String(e.id ?? newId()), fromNode: String(e.fromNode), toNode: String(e.toNode) }));
  return { nodes: outNodes, edges: outEdges, rest };
}

// Written the way Obsidian writes it (tab-indented), so both apps' saves look alike.
export function stringifyCanvas(c) {
  return JSON.stringify({ nodes: c.nodes, edges: c.edges, ...(c.rest || {}) }, null, '\t');
}

export function newId(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 16; i++) s += '0123456789abcdef'[Math.floor(rand() * 16)];
  return s;
}

// The point in the middle of a side of a node.
export function anchor(n, side) {
  if (side === 'top') return { x: n.x + n.width / 2, y: n.y };
  if (side === 'bottom') return { x: n.x + n.width / 2, y: n.y + n.height };
  if (side === 'left') return { x: n.x, y: n.y + n.height / 2 };
  return { x: n.x + n.width, y: n.y + n.height / 2 };
}

// Sides that face each other, for an edge that names none.
export function facingSides(a, b) {
  const dx = (b.x + b.width / 2) - (a.x + a.width / 2);
  const dy = (b.y + b.height / 2) - (a.y + a.height / 2);
  if (Math.abs(dx) * (a.height + b.height) >= Math.abs(dy) * (a.width + b.width)) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

const OUT = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };
// A curve from p1 leaving through side1 to p2 entering through side2.
export function curve(p1, side1, p2, side2) {
  const d = Math.max(40, Math.min(160, Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2));
  const [ax, ay] = OUT[side1] || [0, 0];
  const [bx, by] = OUT[side2] || [0, 0];
  return `M${p1.x} ${p1.y} C ${p1.x + ax * d} ${p1.y + ay * d}, ${p2.x + bx * d} ${p2.y + by * d}, ${p2.x} ${p2.y}`;
}

// Where an edge runs: { from, to, fromSide, toSide, path, mid }.
export function edgeGeometry(c, e) {
  const a = c.nodes.find((n) => n.id === e.fromNode);
  const b = c.nodes.find((n) => n.id === e.toNode);
  if (!a || !b) return null;
  const [fs, ts] = facingSides(a, b);
  const fromSide = SIDES.includes(e.fromSide) ? e.fromSide : fs;
  const toSide = SIDES.includes(e.toSide) ? e.toSide : ts;
  const from = anchor(a, fromSide);
  const to = anchor(b, toSide);
  return { from, to, fromSide, toSide, path: curve(from, fromSide, to, toSide), mid: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 } };
}

// The box around nodes, or null.
export function bounds(nodes) {
  if (!nodes.length) return null;
  const x = Math.min(...nodes.map((n) => n.x));
  const y = Math.min(...nodes.map((n) => n.y));
  return { x, y, width: Math.max(...nodes.map((n) => n.x + n.width)) - x, height: Math.max(...nodes.map((n) => n.y + n.height)) - y };
}

const within = (n, g) => n.x >= g.x && n.y >= g.y && n.x + n.width <= g.x + g.width && n.y + n.height <= g.y + g.height;
// The nodes lying wholly inside a group (they move with it).
export function groupMembers(c, group) {
  return c.nodes.filter((n) => n.id !== group.id && within(n, group));
}

// Move nodes by dx / dy; a group takes the nodes inside it along.
export function moveNodes(c, ids, dx, dy) {
  const move = new Set(ids);
  for (const id of ids) {
    const n = c.nodes.find((x) => x.id === id);
    if (n && n.type === 'group') for (const m of groupMembers(c, n)) move.add(m.id);
  }
  return { ...c, nodes: c.nodes.map((n) => (move.has(n.id) ? { ...n, x: Math.round(n.x + dx), y: Math.round(n.y + dy) } : n)) };
}

// Nodes go with the edges that touch them.
export function removeItems(c, ids) {
  const gone = new Set(ids);
  return {
    ...c,
    nodes: c.nodes.filter((n) => !gone.has(n.id)),
    edges: c.edges.filter((e) => !gone.has(e.id) && !gone.has(e.fromNode) && !gone.has(e.toNode)),
  };
}

export function updateItem(c, id, fields) {
  return {
    ...c,
    nodes: c.nodes.map((n) => (n.id === id ? { ...n, ...fields } : n)),
    edges: c.edges.map((e) => (e.id === id ? { ...e, ...fields } : e)),
  };
}

// Groups first, so they lie under the cards (as in Obsidian), then in file order.
export function paintOrder(nodes) {
  return [...nodes.filter((n) => n.type === 'group'), ...nodes.filter((n) => n.type !== 'group')];
}

// A free spot for a new node near (x, y): moved down past what is there.
export function freeSpot(c, x, y, w, h) {
  let at = { x: Math.round(x), y: Math.round(y) };
  for (let i = 0; i < 50; i++) {
    const hit = c.nodes.find((n) => n.type !== 'group' && at.x < n.x + n.width && at.x + w > n.x && at.y < n.y + n.height && at.y + h > n.y);
    if (!hit) return at;
    at = { x: at.x, y: hit.y + hit.height + 30 };
  }
  return at;
}
