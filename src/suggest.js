// Editor autocomplete popup for textareas: "[[" suggests notes, "#x" suggests
// tags (triggers in lib/suggest.mjs). The list sits under the caret; ↑/↓ move,
// Enter or Tab inserts, Esc closes. While it is open those keys belong to it,
// so the block editor's own Enter/arrow handling does not run.
//
//   attachSuggest(textarea, { items(kind, query) → [{ label, detail?, insert }] })

import { detectTrigger, applySuggestion } from '../lib/suggest.mjs';

let box = null;
let state = null; // { ta, trigger, rows, sel }

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

export function closeSuggest() {
  if (box) box.remove();
  box = null; state = null;
}

// Caret position in viewport px, via a mirror div with the textarea's styles.
function caretXY(ta) {
  const cs = getComputedStyle(ta);
  const m = document.createElement('div');
  for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderLeftWidth', 'boxSizing', 'tabSize', 'textIndent', 'wordSpacing']) m.style[p] = cs[p];
  m.style.position = 'absolute'; m.style.visibility = 'hidden'; m.style.whiteSpace = 'pre-wrap'; m.style.overflowWrap = 'break-word';
  m.style.width = `${ta.clientWidth}px`;
  m.textContent = ta.value.slice(0, ta.selectionStart);
  const mark = document.createElement('span'); mark.textContent = '​';
  m.append(mark);
  document.body.append(m);
  const r = ta.getBoundingClientRect();
  const x = r.left + mark.offsetLeft - ta.scrollLeft;
  const y = r.top + mark.offsetTop - ta.scrollTop;
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
  m.remove();
  return { x, y, lh };
}

function paint() {
  if (!state) return;
  const { ta, rows, sel } = state;
  if (!box) {
    box = el('ul', 'suggest');
    box.id = 'suggest-list';
    box.setAttribute('role', 'listbox');
    document.body.append(box);
  }
  box.replaceChildren();
  rows.forEach((r, i) => {
    const li = el('li', `suggest-item${i === sel ? ' selected' : ''}`);
    li.id = `suggest-opt-${i}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(i === sel));
    li.append(el('span', 'suggest-label', r.label));
    if (r.detail) li.append(el('span', 'suggest-detail', r.detail));
    li.addEventListener('mousedown', (e) => { e.preventDefault(); choose(i); });
    box.append(li);
  });
  ta.setAttribute('aria-activedescendant', `suggest-opt-${sel}`);
  ta.setAttribute('aria-controls', 'suggest-list');
  const { x, y, lh } = caretXY(ta);
  const w = box.offsetWidth; const h = box.offsetHeight;
  let top = y + lh + 4;
  if (top + h > window.innerHeight - 8) top = Math.max(8, y - h - 4);
  box.style.left = `${Math.max(8, Math.min(x, window.innerWidth - w - 8))}px`;
  box.style.top = `${top}px`;
  const s = box.children[sel];
  if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' });
}

function choose(i) {
  if (!state) return;
  const { ta, trigger, rows } = state;
  const r = rows[i];
  closeSuggest();
  if (!r) return;
  const { value, caret } = applySuggestion(ta.value, ta.selectionStart, trigger, r.insert);
  ta.value = value;
  ta.setSelectionRange(caret, caret);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

function update(ta, api) {
  const trigger = ta.selectionStart === ta.selectionEnd ? detectTrigger(ta.value, ta.selectionStart) : null;
  if (!trigger) { if (state && state.ta === ta) closeSuggest(); return; }
  const rows = api.items(trigger.kind, trigger.query).slice(0, 12);
  if (!rows.length) { closeSuggest(); return; }
  const keep = state && state.ta === ta && state.trigger.start === trigger.start ? Math.min(state.sel, rows.length - 1) : 0;
  state = { ta, trigger, rows, sel: keep };
  paint();
}

export function attachSuggest(ta, api) {
  ta.setAttribute('aria-autocomplete', 'list');
  ta.addEventListener('input', () => update(ta, api));
  ta.addEventListener('click', () => update(ta, api));
  ta.addEventListener('keyup', (e) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) update(ta, api); });
  ta.addEventListener('blur', () => { if (state && state.ta === ta) closeSuggest(); });
  // Capture phase: runs before the editor's own key handlers on this textarea.
  ta.addEventListener('keydown', (e) => {
    if (!state || state.ta !== ta) return;
    const n = state.rows.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      state.sel = (state.sel + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; paint();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      choose(state.sel);
    } else if (e.key === 'Escape') {
      closeSuggest();
    } else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
}
