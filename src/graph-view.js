// Graph view: the vault's notes and links as an interactive force-directed
// graph on a <canvas>, like Obsidian's. Model and layout are pure
// (lib/graph.mjs); this file only draws and handles input.
//
//   createGraphView({ loadNotes, onOpen, onTag, onMissing }) -> view
//   view.el                       the element to put in the pane (kept alive
//                                 across re-renders so the layout persists)
//   view.show({ center, local })  (re)load notes; center = the open note's rel
//
// Mouse: drag a node to move it, drag the background to pan, wheel/pinch to
// zoom, hover highlights a node's neighbours, click opens it. Keyboard (canvas
// focused): arrows pan, + / - zoom, 0 fits. The filter field's Enter opens the
// first matching note.

import { buildGraph, localGraph, filterGraph, createSimulation, adjacency, DEFAULT_FORCES } from '../lib/graph.mjs';

// Colours come from the theme tokens in styles.css (read once per draw).
let COLORS = null;
function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return { note: v('--muted'), current: v('--accent'), tag: v('--ink-green'), missing: v('--line-strong'), link: v('--line-strong'), linkHi: v('--accent'), label: v('--text'), labelDim: v('--muted') };
}

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

function loadPrefs() {
  try { return { tags: false, unresolved: false, orphans: true, depth: 1, ...JSON.parse(localStorage.getItem('mufka-graph') || '{}') }; } catch { return { tags: false, unresolved: false, orphans: true, depth: 1 }; }
}
function savePrefs(p) { try { localStorage.setItem('mufka-graph', JSON.stringify(p)); } catch { /* ignore */ } }

export function createGraphView({ loadNotes, onOpen, onTag, onMissing }) {
  const prefs = { linkDistance: DEFAULT_FORCES.linkDistance, repel: DEFAULT_FORCES.repel, ...loadPrefs() };
  const root = el('div', 'graph-view');
  const canvas = el('canvas', 'graph-canvas');
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Graph of notes and links');
  root.append(canvas);

  // --- controls (top-right panel) ---
  const panel = el('div', 'graph-controls');
  const modeGroup = el('div', 'graph-mode');
  const globalBtn = el('button', 'btn', 'Global'); globalBtn.type = 'button';
  const localBtn = el('button', 'btn', 'Local'); localBtn.type = 'button';
  modeGroup.append(globalBtn, localBtn);
  const depthSel = el('select', 'graph-depth');
  depthSel.setAttribute('aria-label', 'Depth');
  for (const d of [1, 2, 3]) { const o = el('option', null, `Depth ${d}`); o.value = String(d); depthSel.append(o); }
  const filter = el('input', 'graph-filter');
  filter.type = 'search'; filter.placeholder = 'Filter notes'; filter.setAttribute('aria-label', 'Filter notes');
  const check = (key, label) => {
    const lab = el('label', 'graph-check');
    const box = el('input'); box.type = 'checkbox'; box.checked = Boolean(prefs[key]); box.dataset.pref = key;
    box.addEventListener('change', () => { prefs[key] = box.checked; savePrefs(prefs); rebuild(); });
    lab.append(box, document.createTextNode(` ${label}`));
    return lab;
  };
  const slider = (key, label, min, max) => {
    const lab = el('label', 'graph-slider');
    const r = el('input'); r.type = 'range'; r.min = String(min); r.max = String(max); r.value = String(prefs[key]); r.dataset.pref = key;
    r.addEventListener('input', () => { prefs[key] = Number(r.value); savePrefs(prefs); if (sim) sim.setForces({ [key]: prefs[key] }); wake(); });
    lab.append(el('span', null, label), r);
    return lab;
  };
  const fitBtn = el('button', 'btn quiet', 'Fit'); fitBtn.type = 'button';
  const stats = el('div', 'graph-stats');
  panel.append(modeGroup, depthSel, filter,
    check('tags', 'Tags'), check('unresolved', 'Unresolved links'), check('orphans', 'Orphans'),
    slider('linkDistance', 'Link distance', 20, 200), slider('repel', 'Repel', 50, 1500), fitBtn, stats);
  root.append(panel);

  // --- state ---
  let notes = [];
  let center = null;
  let local = false;
  let full = null;   // whole vault graph (before local/filter)
  let sim = null;
  let adj = new Map();
  let view = { k: 1, x: 0, y: 0 }; // screen = world * k + (x, y) + canvas centre
  let hover = null;
  let drag = null;   // { node?, pan?, sx, sy, moved }
  let raf = 0;
  let needsFit = true;
  let width = 0; let height = 0; let dpr = 1;

  function rebuild() {
    full = buildGraph(notes, { tags: prefs.tags, unresolved: prefs.unresolved });
    let g = full;
    if (local && center && g.nodes.some((n) => n.id === center)) g = localGraph(g, center, prefs.depth);
    g = filterGraph(g, { query: filter.value, orphans: prefs.orphans || local });
    const old = sim ? new Map(sim.nodes.map((n) => [n.id, n])) : new Map();
    sim = createSimulation(g, { linkDistance: prefs.linkDistance, repel: prefs.repel });
    let kept = 0;
    for (const n of sim.nodes) { const o = old.get(n.id); if (o) { n.x = o.x; n.y = o.y; kept += 1; } }
    if (kept > sim.nodes.length / 2) sim.reheat(0.3); // mostly the same graph: gentle
    adj = adjacency(g);
    hover = null;
    stats.textContent = `${g.nodes.filter((n) => n.kind === 'note').length} notes · ${g.links.length} links`;
    globalBtn.setAttribute('aria-pressed', String(!local));
    localBtn.setAttribute('aria-pressed', String(local));
    localBtn.disabled = !center;
    depthSel.hidden = !local;
    depthSel.value = String(prefs.depth);
    needsFit = true;
    wake();
  }

  // --- geometry ---
  const toScreen = (n) => ({ x: n.x * view.k + view.x + width / 2, y: n.y * view.k + view.y + height / 2 });
  const toWorld = (sx, sy) => ({ x: (sx - width / 2 - view.x) / view.k, y: (sy - height / 2 - view.y) / view.k });
  const radius = (n) => 3.5 + Math.sqrt(n.degree || 0) * 1.6;
  function nodeAt(sx, sy) {
    if (!sim) return null;
    const p = toWorld(sx, sy);
    let best = null; let bestD = Infinity;
    for (const n of sim.nodes) {
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      const hit = radius(n) + 4 / view.k;
      if (d < hit && d < bestD) { best = n; bestD = d; }
    }
    return best;
  }
  function fit() {
    if (!sim || !sim.nodes.length || !width) return;
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const n of sim.nodes) { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y); }
    const w = Math.max(maxX - minX, 1); const h = Math.max(maxY - minY, 1);
    // Leave the controls panel's column free when the pane is wide enough.
    const side = !panel.hidden && width > 640 ? panel.offsetWidth + 24 : 0;
    view.k = Math.min(2.5, Math.max(0.1, Math.min((width - side - 80) / w, (height - 80) / h)));
    view.x = -((minX + maxX) / 2) * view.k - side / 2;
    view.y = -((minY + maxY) / 2) * view.k;
  }

  // --- drawing ---
  function draw() {
    COLORS = COLORS || themeColors();
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!sim) return;
    const focus = hover || (drag && drag.node) || null;
    const near = focus ? adj.get(focus.id) || new Set() : null;
    const lit = (n) => !focus || n === focus || near.has(n.id);

    ctx.lineWidth = Math.max(0.6, Math.min(1.5, view.k));
    for (const l of sim.links) {
      const a = toScreen(l.source); const b = toScreen(l.target);
      const hi = focus && (l.source === focus || l.target === focus);
      ctx.strokeStyle = hi ? COLORS.linkHi : COLORS.link;
      ctx.globalAlpha = focus && !hi ? 0.25 : 1;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (const n of sim.nodes) {
      const p = toScreen(n);
      const r = radius(n) * Math.max(0.6, Math.min(1.6, view.k));
      ctx.globalAlpha = lit(n) ? 1 : 0.2;
      ctx.fillStyle = n === focus || n.id === center ? COLORS.current
        : n.kind === 'tag' ? COLORS.tag : n.kind === 'missing' ? COLORS.missing : COLORS.note;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    }
    // Labels fade in with zoom; the hovered node and its neighbours always show.
    const fade = Math.max(0, Math.min(1, (view.k - 0.6) / 0.5));
    ctx.font = '11px "Avenir Next", "Helvetica Neue", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const n of sim.nodes) {
      const show = focus ? lit(n) : fade > 0;
      if (!show) continue;
      const p = toScreen(n);
      const r = radius(n) * Math.max(0.6, Math.min(1.6, view.k));
      ctx.globalAlpha = focus ? 1 : fade;
      ctx.fillStyle = n === focus ? COLORS.label : COLORS.labelDim;
      ctx.fillText(n.label, p.x, p.y + r + 3);
    }
    ctx.globalAlpha = 1;
  }

  function frame() {
    raf = 0;
    if (!root.isConnected) return; // left the graph view: stop until shown again
    if (sim && sim.alpha > 0.005) sim.tick();
    if (needsFit && sim && sim.alpha < 0.5) { fit(); needsFit = false; }
    draw();
    if ((sim && sim.alpha > 0.005) || drag) raf = requestAnimationFrame(frame);
  }
  function wake() { if (!raf) raf = requestAnimationFrame(frame); }

  function resize() {
    const r = root.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    width = r.width; height = r.height;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    wake();
  }
  new ResizeObserver(resize).observe(root);

  // --- input ---
  const local2 = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    canvas.focus();
    const p = local2(e);
    const n = nodeAt(p.x, p.y);
    drag = { node: n, sx: p.x, sy: p.y, vx: view.x, vy: view.y, moved: false };
    canvas.setPointerCapture(e.pointerId);
    if (n) { n.fx = n.x; n.fy = n.y; sim.reheat(0.3); }
    wake();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = local2(e);
    if (drag) {
      if (Math.hypot(p.x - drag.sx, p.y - drag.sy) > 3) drag.moved = true;
      if (drag.node) { const w = toWorld(p.x, p.y); drag.node.fx = w.x; drag.node.fy = w.y; sim.reheat(0.3); }
      else { view.x = drag.vx + (p.x - drag.sx); view.y = drag.vy + (p.y - drag.sy); }
      wake();
      return;
    }
    const n = nodeAt(p.x, p.y);
    if (n !== hover) { hover = n; canvas.style.cursor = n ? 'pointer' : 'grab'; wake(); }
  });
  const endDrag = () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.node) { d.node.fx = null; d.node.fy = null; }
    if (d.node && !d.moved) activate(d.node);
    wake();
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { if (!drag && hover) { hover = null; wake(); } });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local2(e);
    const before = toWorld(p.x, p.y);
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002));
    view.k = Math.min(6, Math.max(0.05, view.k * factor));
    view.x = p.x - width / 2 - before.x * view.k;
    view.y = p.y - height / 2 - before.y * view.k;
    needsFit = false;
    wake();
  }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const step = 40;
    const zoom = (f) => { view.k = Math.min(6, Math.max(0.05, view.k * f)); view.x *= f; view.y *= f; };
    if (e.key === 'ArrowLeft') view.x += step;
    else if (e.key === 'ArrowRight') view.x -= step;
    else if (e.key === 'ArrowUp') view.y += step;
    else if (e.key === 'ArrowDown') view.y -= step;
    else if (e.key === '+' || e.key === '=') zoom(1.2);
    else if (e.key === '-') zoom(1 / 1.2);
    else if (e.key === '0') fit();
    else return;
    e.preventDefault(); needsFit = false; wake();
  });

  function activate(n) {
    if (n.kind === 'note') onOpen(n.id);
    else if (n.kind === 'tag') onTag(n.label.slice(1));
    else if (n.kind === 'missing' && onMissing) onMissing(n.label);
  }

  globalBtn.addEventListener('click', () => { local = false; rebuild(); });
  localBtn.addEventListener('click', () => { if (center) { local = true; rebuild(); } });
  depthSel.addEventListener('change', () => { prefs.depth = Number(depthSel.value); savePrefs(prefs); rebuild(); });
  filter.addEventListener('input', rebuild);
  filter.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !sim) return;
    const first = sim.nodes.filter((n) => n.kind === 'note').sort((a, b) => b.degree - a.degree)[0];
    if (first) { e.preventDefault(); onOpen(first.id); }
  });
  fitBtn.addEventListener('click', () => { fit(); needsFit = false; wake(); });

  // For the e2e: where a node is on screen (CSS px relative to the viewport).
  root.graphApi = {
    screenPos(id) {
      const n = sim && sim.node(id);
      if (!n) return null;
      const r = canvas.getBoundingClientRect();
      const p = toScreen(n);
      return { x: r.left + p.x, y: r.top + p.y };
    },
    ids: () => (sim ? sim.nodes.map((n) => n.id) : []),
    settled: () => Boolean(sim) && sim.alpha <= 0.005,
    zoom: () => view.k,
  };

  return {
    el: root,
    async show({ center: c, local: l } = {}) {
      center = c || null;
      if (l != null) local = Boolean(l) && Boolean(center);
      if (!center) local = false;
      const res = await loadNotes();
      notes = Array.isArray(res) ? res : [];
      rebuild();
      resize();
    },
    focusCanvas() { canvas.focus(); },
  };
}
