// Pure graph view model: which nodes and links the vault has, a local
// neighbourhood of one note, filtering, and a small force-directed layout
// (no DOM, no dependency; the renderer draws it on a canvas).
//
// Nodes: { id, label, kind: 'note' | 'tag' | 'missing', rel? }
//   note    id = its rel ('Projects/Mufka.md')
//   tag     id = 'tag:<lowercase tag>'     (only with { tags: true })
//   missing id = 'missing:<link target>'   (a [[link]] to a note that does not
//           exist yet; only with { unresolved: true })
// Links: { source, target } between ids; one per pair (direction kept from the
// first occurrence), self-links dropped.

import { scanWikiLinks, parseWikiInner } from './links.mjs';
import { resolveLink } from './notestree.mjs';
import { scanTags } from './tags.mjs';

const ATTACHMENT_RE = /\.(?!md$)[A-Za-z0-9]{1,8}$/;

function titleOf(rel) {
  const base = rel.slice(rel.lastIndexOf('/') + 1);
  return base.replace(/\.md$/i, '');
}

// notes: [{ rel, content }]
export function buildGraph(notes, opts = {}) {
  const { tags = false, unresolved = false } = opts;
  const relList = notes.map((n) => ({ rel: n.rel }));
  const nodes = new Map();
  const links = [];
  const pairs = new Set();
  const resolved = new Map(); // folder + target -> rel (resolution depends on the folder only)
  const addLink = (a, b) => {
    if (a === b) return;
    const key = a < b ? `${a}\n${b}` : `${b}\n${a}`;
    if (pairs.has(key)) return;
    pairs.add(key);
    links.push({ source: a, target: b });
  };
  for (const n of notes) nodes.set(n.rel, { id: n.rel, label: titleOf(n.rel), kind: 'note', rel: n.rel });
  for (const n of notes) {
    scanWikiLinks(n.content, (inner) => {
      const { target } = parseWikiInner(inner);
      if (!target || ATTACHMENT_RE.test(target)) return;
      const key = `${n.rel.slice(0, n.rel.lastIndexOf('/') + 1)}\n${target}`;
      if (!resolved.has(key)) resolved.set(key, resolveLink(target, n.rel, relList));
      const to = resolved.get(key);
      if (to && nodes.has(to)) { addLink(n.rel, to); return; }
      if (!unresolved) return;
      const id = `missing:${target.toLowerCase()}`;
      if (!nodes.has(id)) nodes.set(id, { id, label: target.slice(target.lastIndexOf('/') + 1), kind: 'missing' });
      addLink(n.rel, id);
    });
    if (tags) {
      for (const t of scanTags(n.content)) {
        const id = `tag:${t.toLowerCase()}`;
        if (!nodes.has(id)) nodes.set(id, { id, label: `#${t}`, kind: 'tag' });
        addLink(n.rel, id);
      }
    }
  }
  return withDegrees({ nodes: [...nodes.values()], links });
}

function withDegrees(g) {
  const deg = new Map(g.nodes.map((n) => [n.id, 0]));
  for (const l of g.links) { deg.set(l.source, deg.get(l.source) + 1); deg.set(l.target, deg.get(l.target) + 1); }
  return { nodes: g.nodes.map((n) => ({ ...n, degree: deg.get(n.id) })), links: g.links };
}

// Ids within `depth` links of `centerId` (either direction), including it.
export function neighbourhood(graph, centerId, depth = 1) {
  const adj = adjacency(graph);
  const seen = new Set([centerId]);
  let frontier = [centerId];
  for (let d = 0; d < depth; d += 1) {
    const next = [];
    for (const id of frontier) for (const o of adj.get(id) || []) if (!seen.has(o)) { seen.add(o); next.push(o); }
    frontier = next;
  }
  return seen;
}

export function adjacency(graph) {
  const adj = new Map(graph.nodes.map((n) => [n.id, new Set()]));
  for (const l of graph.links) {
    if (adj.has(l.source)) adj.get(l.source).add(l.target);
    if (adj.has(l.target)) adj.get(l.target).add(l.source);
  }
  return adj;
}

// The local graph of one note: its neighbourhood, links inside it only.
export function localGraph(graph, centerId, depth = 1) {
  return subgraph(graph, neighbourhood(graph, centerId, depth));
}

export function subgraph(graph, ids) {
  const keep = ids instanceof Set ? ids : new Set(ids);
  return withDegrees({
    nodes: graph.nodes.filter((n) => keep.has(n.id)),
    links: graph.links.filter((l) => keep.has(l.source) && keep.has(l.target)),
  });
}

// Filters, as in Obsidian's graph panel:
//   query    keep notes whose label/path contains it (case- and i/ı-folded);
//            tags and missing nodes stay only when linked to a kept note
//   orphans  false = drop nodes without links
export function filterGraph(graph, { query = '', orphans = true } = {}) {
  let g = graph;
  const q = fold(query.trim());
  if (q) {
    const hit = new Set(g.nodes.filter((n) => n.kind === 'note' && (fold(n.label).includes(q) || fold(n.id).includes(q))).map((n) => n.id));
    const keep = new Set(hit);
    for (const l of g.links) {
      if (hit.has(l.source) && !isNote(g, l.target)) keep.add(l.target);
      if (hit.has(l.target) && !isNote(g, l.source)) keep.add(l.source);
    }
    g = subgraph(g, keep);
  }
  if (!orphans) g = subgraph(g, new Set(g.nodes.filter((n) => n.degree > 0).map((n) => n.id)));
  return g;
}

function isNote(g, id) { return !id.startsWith('tag:') && !id.startsWith('missing:'); }

export function fold(s) { return String(s).replace(/[İIı]/g, 'i').toLowerCase(); }

// --- force layout -----------------------------------------------------------
//
// A velocity-Verlet style simulation like d3-force's defaults: many-body
// repulsion, spring links, a weak pull to the centre and velocity decay.
// Positions start on a phyllotaxis spiral, so a layout is deterministic.

export const DEFAULT_FORCES = { repel: 300, linkDistance: 60, linkStrength: 0.5, center: 0.04 };

export function createSimulation(graph, forces = {}) {
  const f = { ...DEFAULT_FORCES, ...forces };
  const index = new Map();
  const nodes = graph.nodes.map((n, i) => {
    const r = 10 * Math.sqrt(0.5 + i);
    const a = i * Math.PI * (3 - Math.sqrt(5));
    const node = { ...n, x: r * Math.cos(a), y: r * Math.sin(a), vx: 0, vy: 0, fx: null, fy: null };
    index.set(n.id, node);
    return node;
  });
  const links = graph.links
    .map((l) => ({ source: index.get(l.source), target: index.get(l.target) }))
    .filter((l) => l.source && l.target);
  let alpha = 1;

  function tick() {
    // Many-body repulsion (O(n²): fine for a personal vault of a few thousand).
    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j];
        let dx = b.x - a.x; let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 === 0) { dx = (j - i) * 0.01; dy = 0.01; d2 = dx * dx + dy * dy; }
        if (d2 > 250000) continue; // beyond ~500px the push is negligible
        const k = (f.repel * alpha) / Math.max(d2, 25);
        a.vx -= dx * k; a.vy -= dy * k;
        b.vx += dx * k; b.vy += dy * k;
      }
    }
    // Springs.
    for (const l of links) {
      const dx = l.target.x - l.source.x; const dy = l.target.y - l.source.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const k = ((d - f.linkDistance) / d) * f.linkStrength * alpha * 0.5;
      l.source.vx += dx * k; l.source.vy += dy * k;
      l.target.vx -= dx * k; l.target.vy -= dy * k;
    }
    // Centre pull, decay, integrate; pinned (dragged) nodes stay put.
    for (const n of nodes) {
      n.vx -= n.x * f.center * alpha; n.vy -= n.y * f.center * alpha;
      n.vx *= 0.6; n.vy *= 0.6;
      if (n.fx != null) { n.x = n.fx; n.y = n.fy; n.vx = 0; n.vy = 0; continue; }
      n.x += n.vx; n.y += n.vy;
    }
    alpha += (0 - alpha) * 0.0228; // d3's default decay: ~300 ticks to settle
    return alpha;
  }

  return {
    nodes, links, tick,
    get alpha() { return alpha; },
    reheat(a = 0.5) { alpha = Math.max(alpha, a); },
    setForces(next) { Object.assign(f, next); alpha = Math.max(alpha, 0.5); },
    node: (id) => index.get(id),
  };
}
