// Find and replace in the open note (⌘F, ⌥⌘F). Matches are found in the
// note's source, which is what replacing changes. In the live preview they are
// highlighted in the rendered text with the CSS Custom Highlight API (nothing
// is added to the page); in the source view a copy of the text sits behind the
// transparent textarea with the matches marked.
import { findMatches, replaceMatches, matchAtOrAfter } from '../lib/find.mjs';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Text nodes of `root` and their offsets in its concatenated text.
function textIndex(root) {
  const nodes = [];
  let text = '';
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && n.parentElement.closest('style, script, .copy-btn') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walk.nextNode(); n; n = walk.nextNode()) { nodes.push({ node: n, at: text.length }); text += n.data; }
  return { nodes, text };
}
function pointAt(nodes, offset, isEnd) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const { node, at } = nodes[i];
    if (offset > at || (offset === at && !isEnd) || i === 0) return { node, offset: Math.min(offset - at, node.data.length) };
  }
  return null;
}
function rangesIn(root, query, opts) {
  const { nodes, text } = textIndex(root);
  if (!nodes.length) return [];
  return findMatches(text, query, opts).map((m) => {
    const r = document.createRange();
    const a = pointAt(nodes, m.start, false);
    const b = pointAt(nodes, m.end, true);
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset);
    return r;
  });
}

function lineStarts(src) {
  const out = [0];
  for (let i = src.indexOf('\n'); i !== -1; i = src.indexOf('\n', i + 1)) out.push(i + 1);
  return out;
}

const hasHighlights = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function';

// api: {
//   active() -> is a note open in the note view,
//   src() -> its source, rel() -> its path, mode() -> 'blocks' | 'source',
//   blocksRoot() -> the preview's .blocks, sourceArea() -> the source textarea,
//   scroller -> the scrolling pane,
//   prepare() -> close any block being edited (so the preview shows),
//   replaceSource(text) -> save the note's new source (blocks view), undoable,
//   focusMatch(match) -> leave the bar with the caret on this match,
//   toast(text),
// }
export function createFindBar(host, api) {
  const s = { open: false, transient: false, query: '', caseSensitive: false, replace: false, pos: 0, matches: [], cur: -1, rel: null };

  host.classList.add('find-bar');
  host.hidden = true;
  const box = el('div', 'find-box');
  box.setAttribute('role', 'search');
  box.setAttribute('aria-label', 'Find in note');
  const row1 = el('div', 'find-row');
  const input = el('input', 'find-input');
  input.type = 'text'; input.id = 'find-input'; input.placeholder = 'Find in note';
  input.setAttribute('aria-label', 'Find in note');
  input.spellcheck = false;
  const count = el('span', 'find-count');
  count.setAttribute('aria-live', 'polite');
  const btn = (label, title, cls = '') => {
    const b = el('button', `find-btn ${cls}`, label); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title);
    return b;
  };
  const caseBtn = btn('Aa', 'Match case', 'find-case');
  caseBtn.setAttribute('aria-pressed', 'false');
  const prevBtn = btn('↑', 'Previous match (⇧Enter)');
  const nextBtn = btn('↓', 'Next match (Enter)');
  const replToggle = btn('⇄', 'Replace (⌥⌘F)', 'find-repl-toggle');
  replToggle.setAttribute('aria-pressed', 'false');
  const closeBtn = btn('×', 'Close (Esc)');
  row1.append(input, count, caseBtn, prevBtn, nextBtn, replToggle, closeBtn);
  const row2 = el('div', 'find-row find-row-replace');
  const rinput = el('input', 'find-input');
  rinput.type = 'text'; rinput.id = 'find-replace-input'; rinput.placeholder = 'Replace with';
  rinput.setAttribute('aria-label', 'Replace with');
  rinput.spellcheck = false;
  const replOne = el('button', 'btn quiet find-act', 'Replace'); replOne.type = 'button'; replOne.title = 'Replace this match (Enter)';
  const replAll = el('button', 'btn quiet find-act', 'All'); replAll.type = 'button'; replAll.title = 'Replace all matches (⌘Enter)';
  row2.append(rinput, replOne, replAll);
  box.append(row1, row2);
  host.append(box);

  function clearMarks() {
    if (hasHighlights) { CSS.highlights.delete('find-match'); CSS.highlights.delete('find-current'); }
    document.querySelectorAll('.find-block').forEach((b) => b.classList.remove('find-block'));
    const back = document.getElementById('find-backdrop');
    if (back) back.remove();
    document.querySelectorAll('.note-editor.finding').forEach((t) => t.classList.remove('finding'));
  }

  function updateCount() {
    const n = s.matches.length;
    count.textContent = !s.query ? '' : n ? `${s.cur + 1} of ${n}` : 'No results';
    box.classList.toggle('none', !!s.query && !n);
    for (const b of [prevBtn, nextBtn, replOne, replAll]) b.disabled = !n;
  }

  // Bring a rectangle into the middle third of the pane when it is out of view.
  function reveal(rect) {
    const sc = api.scroller;
    const view = sc.getBoundingClientRect();
    const top = view.top + 96; // under the bar
    if (rect.top >= top && rect.bottom <= view.bottom - 24) return;
    sc.scrollTop += rect.top - view.top - view.height / 3;
  }

  function markBlocks(scroll) {
    const root = api.blocksRoot();
    if (!root) return;
    const src = api.src();
    const starts = lineStarts(src);
    const blocks = [...root.querySelectorAll(':scope > [data-block-start]')];
    const all = [];
    let current = null;
    const curM = s.matches[s.cur];
    blocks.forEach((b, i) => {
      const ranges = rangesIn(b, s.query, { caseSensitive: s.caseSensitive });
      all.push(...ranges);
      if (!curM) return;
      const from = starts[Number(b.dataset.blockStart)] ?? Infinity;
      const nextStart = blocks[i + 1] ? starts[Number(blocks[i + 1].dataset.blockStart)] ?? src.length + 1 : src.length + 1;
      if (curM.start < from || curM.start >= nextStart) return;
      // The k-th match of this block in the source is the k-th in its text,
      // unless some are hidden in markup (a link's address): then mark the block.
      const inBlock = s.matches.filter((m) => m.start >= from && m.start < nextStart);
      const k = inBlock.indexOf(curM);
      if (ranges.length === inBlock.length) current = ranges[k];
      else { b.classList.add('find-block'); current = b; }
    });
    if (hasHighlights) {
      CSS.highlights.set('find-match', new Highlight(...all));
      if (current instanceof Range) { const h = new Highlight(current); h.priority = 1; CSS.highlights.set('find-current', h); }
    }
    if (scroll && current) reveal(current.getBoundingClientRect());
  }

  function markSource(scroll) {
    const ta = api.sourceArea();
    if (!ta) return;
    if (!ta.dataset.findWired) {
      ta.dataset.findWired = '1';
      ta.addEventListener('input', () => { if (s.open) { s.pos = ta.selectionStart; refresh(); } });
      ta.addEventListener('scroll', () => { const b = document.getElementById('find-backdrop'); if (b) b.scrollTop = ta.scrollTop; });
    }
    const wrap = ta.parentElement;
    wrap.classList.add('find-src-host');
    const back = el('div', 'find-backdrop');
    back.id = 'find-backdrop';
    back.setAttribute('aria-hidden', 'true');
    const cs = getComputedStyle(ta);
    for (const p of ['font', 'letterSpacing', 'padding', 'borderWidth', 'boxSizing', 'tabSize']) back.style[p] = cs[p];
    back.style.left = `${ta.offsetLeft}px`; back.style.top = `${ta.offsetTop}px`;
    back.style.width = `${ta.offsetWidth}px`; back.style.height = `${ta.offsetHeight}px`;
    const text = ta.value;
    let at = 0;
    let curEl = null;
    s.matches.forEach((m, i) => {
      back.append(text.slice(at, m.start));
      const mk = el('mark', i === s.cur ? 'find-mark current' : 'find-mark', text.slice(m.start, m.end));
      if (i === s.cur) curEl = mk;
      back.append(mk);
      at = m.end;
    });
    back.append(`${text.slice(at)}\n`);
    wrap.insertBefore(back, ta);
    ta.classList.add('finding');
    back.scrollTop = ta.scrollTop;
    if (scroll && curEl) {
      const off = curEl.offsetTop;
      if (off < ta.scrollTop || off > ta.scrollTop + ta.clientHeight - 40) { ta.scrollTop = Math.max(0, off - ta.clientHeight / 3); back.scrollTop = ta.scrollTop; }
    }
  }

  // Re-find in the current text and redraw. Called after every render.
  function refresh(scroll = false) {
    clearMarks();
    if (!s.open) return;
    if (!api.active()) { close({ keepFocus: true }); return; }
    if (api.rel() !== s.rel) {
      if (s.transient) { close({ keepFocus: true }); return; } // shown for a search result: that note only
      s.rel = api.rel(); s.pos = 0;
    }
    const src = api.mode() === 'source' && api.sourceArea() ? api.sourceArea().value : api.src();
    s.matches = findMatches(src, s.query, { caseSensitive: s.caseSensitive });
    const exact = s.matches.findIndex((m) => m.start === s.pos);
    s.cur = exact !== -1 ? exact : matchAtOrAfter(s.matches, s.pos);
    if (s.cur !== -1) s.pos = s.matches[s.cur].start;
    updateCount();
    if (!s.query) return;
    if (api.mode() === 'source') markSource(scroll); else markBlocks(scroll);
  }

  function step(d) {
    const n = s.matches.length;
    if (!n) return;
    s.cur = (s.cur + d + n) % n;
    s.pos = s.matches[s.cur].start;
    refresh(true);
  }

  function setReplace(on) {
    s.replace = on;
    box.classList.toggle('replacing', on);
    replToggle.setAttribute('aria-pressed', String(on));
  }

  // query: look for this (from a search result); focus: false leaves the
  // keyboard where it is.
  function open({ replace = false, query = null, focus = true } = {}) {
    if (!api.active()) return false;
    api.prepare();
    const wasOpen = s.open;
    s.open = true;
    s.transient = !focus && (!wasOpen || s.transient);
    s.rel = api.rel();
    host.hidden = false;
    if (replace) setReplace(true);
    else if (query != null && !wasOpen) setReplace(false);
    // Start from the selected text, if any (as in every editor).
    const sel = query ?? String(window.getSelection() || '').trim();
    if (sel && !sel.includes('\n') && sel.length < 200) { s.query = sel; input.value = sel; }
    if (query != null) s.pos = 0;
    else if (!wasOpen) {
      const sc = api.scroller.getBoundingClientRect();
      s.pos = 0;
      // Begin at the first match in view rather than at the top of the note.
      const root = api.mode() === 'blocks' && api.blocksRoot();
      if (root) {
        const first = [...root.querySelectorAll(':scope > [data-block-start]')].find((b) => b.getBoundingClientRect().bottom > sc.top + 60);
        if (first) s.pos = lineStarts(api.src())[Number(first.dataset.blockStart)] || 0;
      }
    }
    refresh(true);
    if (focus) { const f = replace && s.query ? rinput : input; f.focus(); f.select(); }
    return true;
  }

  function close({ keepFocus = false } = {}) {
    const m = s.matches[s.cur];
    s.open = false;
    host.hidden = true;
    clearMarks();
    s.matches = []; s.cur = -1;
    if (!keepFocus && m && api.active()) api.focusMatch(m);
  }

  function replaceCurrent() {
    const m = s.matches[s.cur];
    if (!m) return;
    const rep = rinput.value;
    s.pos = m.start + rep.length;
    if (api.mode() === 'source' && api.sourceArea()) editSource(m.start, m.end, rep);
    else api.replaceSource(api.src().slice(0, m.start) + rep + api.src().slice(m.end));
    refresh(true);
    rinput.focus();
  }

  function replaceAll() {
    const n = s.matches.length;
    if (!n) return;
    const rep = rinput.value;
    if (api.mode() === 'source' && api.sourceArea()) {
      const ta = api.sourceArea();
      editSource(0, ta.value.length, replaceMatches(ta.value, s.matches, rep));
    } else api.replaceSource(replaceMatches(api.src(), s.matches, rep));
    s.pos = 0;
    refresh();
    api.toast(`Replaced ${n} ${n === 1 ? 'match' : 'matches'}. ⌘Z in the note undoes it.`);
    rinput.focus();
  }

  // Edit the source textarea the way typing does, so its own undo and
  // autosave see the change.
  function editSource(from, to, text) {
    const ta = api.sourceArea();
    const top = ta.scrollTop;
    ta.focus();
    ta.setSelectionRange(from, to);
    if (!document.execCommand(text ? 'insertText' : 'delete', false, text)) {
      ta.setRangeText(text, from, to, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    ta.scrollTop = top;
  }

  box.addEventListener('focusin', () => { s.transient = false; });
  input.addEventListener('input', () => { s.query = input.value; refresh(true); });
  const keys = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Enter' && e.target === rinput) {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) replaceAll(); else replaceCurrent();
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
  };
  input.addEventListener('keydown', keys);
  rinput.addEventListener('keydown', keys);
  caseBtn.addEventListener('click', () => {
    s.caseSensitive = !s.caseSensitive;
    caseBtn.setAttribute('aria-pressed', String(s.caseSensitive));
    refresh(true);
    input.focus();
  });
  prevBtn.addEventListener('click', () => step(-1));
  nextBtn.addEventListener('click', () => step(1));
  replToggle.addEventListener('click', () => { setReplace(!s.replace); (s.replace ? rinput : input).focus(); });
  closeBtn.addEventListener('click', () => close());
  replOne.addEventListener('click', replaceCurrent);
  replAll.addEventListener('click', replaceAll);

  return {
    open,
    close,
    refresh: () => { if (s.open) refresh(); },
    isOpen: () => s.open,
    contains: (node) => host.contains(node),
  };
}
