// A keyboard-first picker in a modal, used by the quick switcher (Cmd+O) and
// the command palette (Cmd+P). Plain DOM, user text only via textContent.
//
//   openPalette({
//     id,                      'switcher' | 'commands' (for the e2e and CSS)
//     placeholder, footer,     strings
//     items(query) → [{ label, detail?, hint?, indices?, run() }]
//     onShiftEnter?(query)     Shift+Enter (e.g. "create a note named …")
//     empty?(query) → { label, run() } | null   the row to show when nothing matches
//     keepEditor?              true: an open editor stays open underneath (its
//                              blur does not commit), e.g. to insert at its caret
//   })
//
// ↑/↓ (or Ctrl+P/N) move, Enter runs, Esc or a click outside closes; focus
// returns to where it was.

let current = null;

import { keyLabel } from '../lib/keys.mjs';

const IS_MAC = Boolean(window.planner && window.planner.isMac);
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

// label with the matched characters wrapped in <mark>.
function labelNode(text, indices) {
  const span = el('span', 'palette-label');
  if (!indices || !indices.length) { span.textContent = text; return span; }
  const hit = new Set(indices);
  const chars = [...text];
  let run = ''; let runHit = false;
  const flush = () => {
    if (!run) return;
    if (runHit) span.append(el('mark', null, run)); else span.append(document.createTextNode(run));
    run = '';
  };
  chars.forEach((c, i) => { const h = hit.has(i); if (h !== runHit) { flush(); runHit = h; } run += c; });
  flush();
  return span;
}

export function closePalette() {
  if (!current) return;
  const { layer, restore } = current;
  current = null;
  layer.remove();
  if (restore && restore.isConnected) restore.focus();
}

export function isPaletteOpen() { return Boolean(current); }
// True while a palette that wants the editor kept open is showing.
export function paletteKeepsEditor() { return Boolean(current && current.keepEditor); }

export function openPalette(opts) {
  closePalette();
  const restore = document.activeElement;
  const layer = el('div', 'palette-layer');
  const box = el('div', `palette palette-${opts.id}`);
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', opts.placeholder);
  const input = el('input', 'palette-input');
  input.type = 'text';
  input.id = 'palette-input';
  input.placeholder = opts.placeholder;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-controls', 'palette-list');
  input.setAttribute('aria-autocomplete', 'list');
  input.spellcheck = false;
  const list = el('ul', 'palette-list');
  list.id = 'palette-list';
  list.setAttribute('role', 'listbox');
  box.append(input, list);
  if (opts.footer) box.append(el('div', 'palette-footer', keyLabel(opts.footer, IS_MAC)));
  layer.append(box);
  document.body.append(layer);

  let rows = [];
  let sel = 0;

  function paint() {
    const q = input.value;
    rows = opts.items(q).slice(0, 200);
    if (!rows.length && opts.empty) { const e = opts.empty(q); if (e) rows = [{ ...e, isEmptyRow: true }]; }
    if (sel >= rows.length) sel = Math.max(0, rows.length - 1);
    list.replaceChildren();
    if (!rows.length) { list.append(el('li', 'palette-none', 'No matches')); input.removeAttribute('aria-activedescendant'); return; }
    rows.forEach((r, i) => {
      const li = el('li', `palette-item${i === sel ? ' selected' : ''}${r.isEmptyRow ? ' create' : ''}`);
      li.id = `palette-opt-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === sel));
      const main = el('div', 'palette-main');
      main.append(labelNode(r.label, r.indices));
      if (r.hint) main.append(el('span', 'palette-hint', keyLabel(r.hint, IS_MAC)));
      li.append(main);
      if (r.detail) li.append(el('div', 'palette-detail', r.detail));
      li.addEventListener('mousemove', () => { if (sel !== i) { sel = i; paint(); } });
      li.addEventListener('mousedown', (e) => { e.preventDefault(); run(i); });
      list.append(li);
    });
    input.setAttribute('aria-activedescendant', `palette-opt-${sel}`);
    const s = list.children[sel];
    if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' });
  }

  function run(i) {
    const r = rows[i];
    if (!r) return;
    closePalette();
    r.run();
  }

  input.addEventListener('input', () => { sel = 0; paint(); });
  input.addEventListener('keydown', (e) => {
    const down = e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n');
    const up = e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p');
    if (down || up) {
      e.preventDefault();
      if (rows.length) { sel = (sel + (down ? 1 : -1) + rows.length) % rows.length; paint(); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey && opts.onShiftEnter && input.value.trim()) { const q = input.value; closePalette(); opts.onShiftEnter(q); return; }
      run(sel);
    } else if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation(); closePalette();
    } else if (e.key === 'Tab') {
      e.preventDefault(); // focus stays in the dialog
    }
  });
  layer.addEventListener('mousedown', (e) => { if (e.target === layer) { e.preventDefault(); closePalette(); } });

  current = { layer, restore, keepEditor: Boolean(opts.keepEditor) };
  paint();
  input.focus();
}
