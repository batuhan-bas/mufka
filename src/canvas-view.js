// A canvas (lib/canvas.mjs) on screen: cards on a dotted board, dragged,
// resized, joined by arrows; pan by dragging the board or scrolling, zoom with
// ⌘/Ctrl + scroll or the buttons. Every change goes to o.onChange(data).
//
// o: { renderText(text) → nodes, renderFile(node) → element, onChange(data),
//      onOpenFile(file, event), onOpenUrl(url), pickNote() → Promise<path|null>,
//      askText({ heading, value, placeholder }) → Promise<string|null> }
import { edgeGeometry, anchor, curve, moveNodes, removeItems, updateItem, paintOrder, freeSpot, bounds, newId, PRESET_COLORS } from '../lib/canvas.mjs';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const colorClass = (c) => (PRESET_COLORS.includes(String(c)) ? ` cv-c${c}` : '');
const colorStyle = (c) => (c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : '');
const hostOf = (url) => { try { return new URL(url).host; } catch { return url; } };

export function createCanvasView(host, data, o) {
  let c = data;
  let view = { x: 0, y: 0, z: 1 };
  let sel = new Set();
  let editing = null; // id of the text card being typed in
  const undo = []; const redo = [];

  host.classList.add('cv');
  host.tabIndex = 0;
  const board = el('div', 'cv-board');
  const world = el('div', 'cv-world');
  const edges = svg('svg', { class: 'cv-edges', width: '1', height: '1' });
  const defs = svg('defs');
  const marker = svg('marker', { id: 'cv-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
  marker.append(svg('path', { d: 'M0 0L10 5L0 10z', fill: 'context-stroke' }));
  defs.append(marker);
  const nodesLayer = el('div', 'cv-nodes');
  const labels = el('div', 'cv-labels');
  world.append(edges, nodesLayer, labels);
  board.append(world);
  const pop = el('div', 'cv-pop'); pop.hidden = true;
  const tools = el('div', 'cv-tools');
  const zoom = el('div', 'cv-zoom');
  host.replaceChildren(board, pop, tools, zoom);

  const commit = (next) => { undo.push(c); if (undo.length > 100) undo.shift(); redo.length = 0; c = next; o.onChange(c); draw(); };
  const toWorld = (cx, cy) => { const r = board.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z }; };
  const applyView = () => {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
    board.style.backgroundSize = `${22 * view.z}px ${22 * view.z}px`;
    board.style.backgroundPosition = `${view.x}px ${view.y}px`;
    placePop();
  };
  const setZoom = (z, cx, cy) => {
    const r = board.getBoundingClientRect();
    const px = cx ?? r.left + r.width / 2; const py = cy ?? r.top + r.height / 2;
    const w = toWorld(px, py);
    view.z = Math.min(2.5, Math.max(0.15, z));
    view.x = px - r.left - w.x * view.z; view.y = py - r.top - w.y * view.z;
    applyView();
  };
  const fit = () => {
    const b = bounds(c.nodes);
    const r = board.getBoundingClientRect();
    if (!b || !r.width) { view = { x: r.width / 2 || 0, y: r.height / 2 || 0, z: 1 }; applyView(); return; }
    const z = Math.min(1, (r.width - 80) / b.width, (r.height - 120) / b.height);
    view.z = Math.max(0.15, z);
    view.x = (r.width - b.width * view.z) / 2 - b.x * view.z;
    view.y = (r.height - b.height * view.z) / 2 - b.y * view.z - 20;
    applyView();
  };
  const center = () => { const r = board.getBoundingClientRect(); return toWorld(r.left + r.width / 2, r.top + r.height / 2); };

  // --- drawing ---
  const nodeEls = new Map();
  function drawEdges() {
    edges.replaceChildren(defs);
    labels.replaceChildren();
    for (const e of c.edges) {
      const g = edgeGeometry(c, e);
      if (!g) continue;
      const on = sel.has(e.id);
      const group = svg('g', { class: `cv-edge${colorClass(e.color)}${on ? ' on' : ''}`, 'data-id': e.id });
      if (colorStyle(e.color)) group.style.color = e.color;
      const hit = svg('path', { d: g.path, class: 'cv-edge-hit' });
      const line = svg('path', { d: g.path, class: 'cv-edge-line' });
      if (e.toEnd !== 'none') line.setAttribute('marker-end', 'url(#cv-arrow)');
      if (e.fromEnd === 'arrow') line.setAttribute('marker-start', 'url(#cv-arrow)');
      group.append(hit, line);
      hit.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); select([e.id], ev.shiftKey); });
      hit.addEventListener('dblclick', (ev) => { ev.stopPropagation(); editLabel(e); });
      edges.append(group);
      if (e.label) {
        const l = el('div', `cv-edge-label${on ? ' on' : ''}`, e.label);
        l.style.left = `${g.mid.x}px`; l.style.top = `${g.mid.y}px`;
        l.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); select([e.id], ev.shiftKey); });
        l.addEventListener('dblclick', (ev) => { ev.stopPropagation(); editLabel(e); });
        labels.append(l);
      }
    }
  }
  function nodeBody(n) {
    if (n.type === 'text') {
      if (editing === n.id) {
        const ta = el('textarea', 'cv-edit');
        ta.value = n.text || '';
        ta.setAttribute('aria-label', 'Card text');
        ta.addEventListener('pointerdown', (ev) => ev.stopPropagation());
        ta.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Escape') { ev.preventDefault(); ta.blur(); } });
        ta.addEventListener('blur', () => {
          if (editing !== n.id) return;
          editing = null;
          if (ta.value !== (n.text || '')) commit(updateItem(c, n.id, { text: ta.value })); else draw();
          host.focus();
        });
        requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
        return [ta];
      }
      const md = el('div', 'cv-md md');
      md.append(...o.renderText(n.text || ''));
      return [md];
    }
    if (n.type === 'file') return [o.renderFile(n)];
    if (n.type === 'link') {
      const box = el('div', 'cv-link');
      const t = el('div', 'cv-link-text');
      t.append(el('b', null, hostOf(n.url || '')), el('span', 'cv-link-url', n.url || ''));
      const open = el('button', 'cv-link-open', '↗');
      open.type = 'button'; open.title = `Open ${n.url}`;
      open.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      open.addEventListener('click', () => o.onOpenUrl(n.url));
      box.append(el('span', 'cv-link-thumb'), t, open);
      return [box];
    }
    return [];
  }
  function drawNodes() {
    nodesLayer.replaceChildren();
    nodeEls.clear();
    for (const n of paintOrder(c.nodes)) {
      const d = el('div', `cv-node cv-${n.type}${colorClass(n.color)}${sel.has(n.id) ? ' on' : ''}`);
      d.dataset.id = n.id;
      if (colorStyle(n.color)) d.style.setProperty('--cv-color', n.color);
      place(d, n);
      if (n.type === 'group') {
        const lab = el('div', 'cv-group-label', n.label || '');
        lab.addEventListener('dblclick', (ev) => { ev.stopPropagation(); editLabel(n); });
        d.append(lab);
      } else d.append(...nodeBody(n));
      if (sel.has(n.id) && sel.size === 1 && editing !== n.id) {
        for (const side of ['top', 'right', 'bottom', 'left']) {
          const p = el('span', `cv-port cv-port-${side}`);
          p.dataset.side = side; p.title = 'Drag to another card to join them';
          p.addEventListener('pointerdown', (ev) => startEdge(ev, n, side));
          d.append(p);
        }
        const rs = el('span', 'cv-resize');
        rs.title = 'Drag to resize';
        rs.addEventListener('pointerdown', (ev) => startResize(ev, n));
        d.append(rs);
      }
      d.addEventListener('pointerdown', (ev) => startDrag(ev, n));
      d.addEventListener('dblclick', (ev) => { ev.stopPropagation(); openNode(n, ev); });
      nodesLayer.append(d);
      nodeEls.set(n.id, d);
    }
  }
  const place = (d, n) => { d.style.left = `${n.x}px`; d.style.top = `${n.y}px`; d.style.width = `${n.width}px`; d.style.height = `${n.height}px`; };
  function draw() { drawNodes(); drawEdges(); drawPop(); }

  // --- selection and its bar (colours, edit, delete) ---
  function select(ids, add) {
    if (add) for (const id of ids) { if (sel.has(id)) sel.delete(id); else sel.add(id); } else sel = new Set(ids);
    host.focus({ preventScroll: true });
    draw();
  }
  const itemOf = (id) => c.nodes.find((n) => n.id === id) || c.edges.find((e) => e.id === id);
  function drawPop() {
    pop.replaceChildren();
    const ids = [...sel];
    pop.hidden = !ids.length || !!editing;
    if (pop.hidden) return;
    for (const col of PRESET_COLORS) {
      const b = el('button', `cv-swatch cv-c${col}`); b.type = 'button';
      b.setAttribute('aria-label', `Colour ${col}`);
      b.addEventListener('click', () => commit(ids.reduce((acc, id) => updateItem(acc, id, { color: col }), c)));
      pop.append(b);
    }
    const none = el('button', 'cv-swatch cv-none'); none.type = 'button'; none.setAttribute('aria-label', 'No colour');
    none.addEventListener('click', () => commit(ids.reduce((acc, id) => { const { color, ...rest } = itemOf(id) || {}; return { ...acc, nodes: acc.nodes.map((n) => (n.id === id ? rest : n)), edges: acc.edges.map((e) => (e.id === id ? rest : e)) }; }, c)));
    pop.append(none, el('span', 'cv-sep'));
    const one = ids.length === 1 ? itemOf(ids[0]) : null;
    if (one && (one.type !== 'file')) {
      const ed = el('button', 'cv-pop-btn', 'Edit'); ed.type = 'button';
      ed.addEventListener('click', () => openNode(one));
      pop.append(ed);
    }
    if (one && one.type === 'file') {
      const op = el('button', 'cv-pop-btn', 'Open'); op.type = 'button';
      op.addEventListener('click', (ev) => o.onOpenFile(one.file, ev));
      pop.append(op);
    }
    const del = el('button', 'cv-pop-btn', 'Delete'); del.type = 'button';
    del.addEventListener('click', () => removeSelected());
    pop.append(del);
    placePop();
  }
  function placePop() {
    if (pop.hidden) return;
    const ids = [...sel];
    const ns = ids.map((id) => c.nodes.find((n) => n.id === id)).filter(Boolean);
    let at;
    if (ns.length) { const b = bounds(ns); at = { x: b.x, y: b.y }; } else {
      const e = c.edges.find((x) => x.id === ids[0]);
      const g = e && edgeGeometry(c, e);
      if (!g) { pop.hidden = true; return; }
      at = g.mid;
    }
    pop.style.left = `${Math.max(8, at.x * view.z + view.x)}px`;
    pop.style.top = `${Math.max(8, at.y * view.z + view.y - 46)}px`;
  }
  function removeSelected() {
    if (!sel.size) return;
    const ids = [...sel]; sel = new Set();
    commit(removeItems(c, ids));
    // The removed card may have held the focus; keep it on the board so
    // Cmd/Ctrl+Z reaches the board's undo, not the app's.
    host.focus({ preventScroll: true });
  }

  // --- opening, editing ---
  async function openNode(n, ev) {
    if (!n.type && n.fromNode) { editLabel(n); return; }
    if (n.type === 'text') { editing = n.id; sel = new Set([n.id]); draw(); return; }
    if (n.type === 'file') { o.onOpenFile(n.file, ev); return; }
    if (n.type === 'group' || n.type == null) { editLabel(n); return; }
    if (n.type === 'link') {
      const url = await o.askText({ heading: 'Link', value: n.url || '', placeholder: 'https://…' });
      if (url != null && url.trim() && url.trim() !== n.url) commit(updateItem(c, n.id, { url: url.trim() }));
    }
  }
  async function editLabel(item) {
    const isEdge = !!item.fromNode;
    const v = await o.askText({ heading: isEdge ? 'Arrow label' : 'Group name', value: item.label || '', placeholder: isEdge ? 'A word or two on the arrow' : 'Name' });
    if (v == null || v === (item.label || '')) return;
    if (v === '') { const { label, ...rest } = item; commit({ ...c, nodes: c.nodes.map((n) => (n.id === item.id ? rest : n)), edges: c.edges.map((e) => (e.id === item.id ? rest : e)) }); } else commit(updateItem(c, item.id, { label: v }));
  }

  // --- pointer work ---
  function drag(ev, onMove, onUp) {
    ev.preventDefault();
    // The window follows the pointer: the pressed element may be drawn again.
    const target = window;
    const start = { x: ev.clientX, y: ev.clientY };
    let moved = false;
    const move = (e) => { if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 3) return; moved = true; onMove(e, (e.clientX - start.x) / view.z, (e.clientY - start.y) / view.z); };
    const up = (e) => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); onUp(e, moved); };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }
  function startDrag(ev, n) {
    if (ev.button !== 0 || editing === n.id || ev.target.closest('a, button, .cv-port, .cv-resize, textarea')) return;
    ev.stopPropagation();
    if (editing) { document.activeElement?.blur?.(); }
    if (!sel.has(n.id)) select([n.id], ev.shiftKey);
    else host.focus({ preventScroll: true });
    const ids = [...sel].filter((id) => c.nodes.some((x) => x.id === id));
    let last = c;
    drag(ev, (e, dx, dy) => {
      last = moveNodes(c, ids, dx, dy);
      for (const m of last.nodes) { const d = nodeEls.get(m.id); if (d) place(d, m); }
      const keep = c; c = last; drawEdges(); placePop(); c = keep;
    }, (e, moved) => {
      if (moved) commit(last);
      else if (ev.detail < 2 && n.type === 'file' && ev.target.closest('.cv-file-title')) o.onOpenFile(n.file, ev);
    });
  }
  function startResize(ev, n) {
    ev.stopPropagation();
    let last = c;
    drag(ev, (e, dx, dy) => {
      last = updateItem(c, n.id, { width: Math.max(80, Math.round(n.width + dx)), height: Math.max(40, Math.round(n.height + dy)) });
      const m = last.nodes.find((x) => x.id === n.id);
      place(nodeEls.get(n.id), m);
      const keep = c; c = last; drawEdges(); c = keep;
    }, (e, moved) => { if (moved) commit(last); });
  }
  function startEdge(ev, n, side) {
    ev.stopPropagation();
    const temp = svg('path', { class: 'cv-edge-line cv-edge-temp', 'marker-end': 'url(#cv-arrow)' });
    edges.append(temp);
    const from = anchor(n, side);
    drag(ev, (e) => {
      const to = toWorld(e.clientX, e.clientY);
      temp.setAttribute('d', curve(from, side, to, 'left'));
    }, (e, moved) => {
      temp.remove();
      if (!moved) return;
      const hit = document.elementsFromPoint(e.clientX, e.clientY).map((x) => x.closest?.('.cv-node')).find((x) => x && x.dataset.id !== n.id);
      const to = hit && c.nodes.find((x) => x.id === hit.dataset.id);
      if (!to) return;
      const p = toWorld(e.clientX, e.clientY);
      const dist = { top: Math.abs(p.y - to.y), bottom: Math.abs(p.y - to.y - to.height), left: Math.abs(p.x - to.x), right: Math.abs(p.x - to.x - to.width) };
      const toSide = Object.entries(dist).sort((a, b) => a[1] - b[1])[0][0];
      const edge = { id: newId(), fromNode: n.id, fromSide: side, toNode: to.id, toSide };
      sel = new Set([edge.id]);
      commit({ ...c, edges: [...c.edges, edge] });
    });
  }
  board.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 && ev.button !== 1) return;
    if (editing) document.activeElement?.blur?.();
    host.focus({ preventScroll: true });
    const start = { ...view };
    drag(ev, (e, dx, dy) => { view.x = start.x + dx * view.z; view.y = start.y + dy * view.z; applyView(); }, (e, moved) => { if (!moved && sel.size) { sel = new Set(); draw(); } });
  });
  board.addEventListener('dblclick', (ev) => {
    if (ev.target !== board && ev.target !== world && ev.target !== nodesLayer) return;
    const p = toWorld(ev.clientX, ev.clientY);
    addNode({ type: 'text', text: '', x: p.x - 125, y: p.y - 30, width: 250, height: 60 }, true);
  });
  board.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    if (ev.ctrlKey || ev.metaKey) setZoom(view.z * Math.exp(-ev.deltaY * 0.01), ev.clientX, ev.clientY);
    else { view.x -= ev.deltaX; view.y -= ev.deltaY; applyView(); }
  }, { passive: false });
  host.addEventListener('keydown', (ev) => {
    if (ev.target.closest('textarea, input')) return;
    const mod = ev.metaKey || ev.ctrlKey;
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && sel.size) { ev.preventDefault(); ev.stopPropagation(); removeSelected(); return; }
    if (ev.key === 'Escape' && sel.size) { ev.stopPropagation(); sel = new Set(); draw(); return; }
    if (mod && ev.code === 'KeyZ') {
      ev.preventDefault(); ev.stopPropagation();
      const [from, to] = ev.shiftKey ? [redo, undo] : [undo, redo];
      if (!from.length) return;
      to.push(c); c = from.pop(); sel = new Set([...sel].filter((id) => itemOf(id))); o.onChange(c); draw();
      return;
    }
    if (mod && ev.code === 'KeyA') { ev.preventDefault(); ev.stopPropagation(); select(c.nodes.map((n) => n.id)); }
  });

  // --- adding ---
  function addNode(fields, edit) {
    const w = fields.width; const h = fields.height;
    const spot = fields.x != null ? { x: Math.round(fields.x), y: Math.round(fields.y) } : (() => { const m = center(); return freeSpot(c, m.x - w / 2, m.y - h / 2, w, h); })();
    const n = { id: newId(), ...fields, ...spot };
    sel = new Set([n.id]);
    if (edit) editing = n.id;
    commit({ ...c, nodes: [...c.nodes, n] });
  }
  const tool = (label, glyph, fn) => {
    const b = el('button', 'cv-tool'); b.type = 'button';
    b.append(el('i', null, glyph), el('span', null, label));
    b.addEventListener('click', fn);
    tools.append(b);
  };
  tool('Card', 'T', () => addNode({ type: 'text', text: '', width: 250, height: 60 }, true));
  tool('Note', '▤', async () => { const file = await o.pickNote(); if (file) addNode({ type: 'file', file, width: 400, height: 400 }); });
  tool('Link', '↗', async () => {
    const url = await o.askText({ heading: 'Add a link', value: '', placeholder: 'https://…' });
    if (url && url.trim()) addNode({ type: 'link', url: /^[a-z]+:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`, width: 300, height: 90 });
  });
  tool('Group', '▭', () => {
    const ns = [...sel].map((id) => c.nodes.find((n) => n.id === id)).filter(Boolean);
    const b = ns.length ? bounds(ns) : null;
    if (b) addNode({ type: 'group', label: 'Group', x: b.x - 30, y: b.y - 30, width: b.width + 60, height: b.height + 60 });
    else addNode({ type: 'group', label: 'Group', width: 500, height: 320 });
  });
  const zb = (label, glyph, fn) => { const b = el('button', 'cv-zoom-btn', glyph); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; b.addEventListener('click', fn); zoom.append(b); };
  zb('Zoom in', '+', () => setZoom(view.z * 1.25));
  zb('Zoom out', '−', () => setZoom(view.z / 1.25));
  zb('Fit to screen', '⤢', fit);

  draw();
  requestAnimationFrame(fit);
  return {
    // The file changed outside (another app): show it, keep the selection.
    setData(next) { if (editing) return; c = next; sel = new Set([...sel].filter((id) => itemOf(id))); draw(); },
    data: () => c,
  };
}
