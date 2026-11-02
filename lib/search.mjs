// Search across notes, with operators (as in Obsidian's search):
//
//   word other        both, anywhere in the title or the text
//   "two words"       this exact phrase
//   a OR b            either
//   -word             not this (also -file:x, -"phrase", -(a b))
//   (a OR b) c        grouping
//   /re+gex/          a regular expression
//   file:name         in the file name        path:Work/Plans   in the path
//   content:x         in the text only        tag:#x or #x      has the tag (or a nested one, #x/y)
//   line:(a b)        a and b on one line     section:(a b)     under one heading
//   task:x            in a task               task-todo:x       in an open task
//   task-done:x       in a done task          [prop]            has the property
//   [prop:value]      the property contains value
//
// Matching ignores case and treats I, İ, ı, i as one letter (foldCase). An
// operator name it does not know is plain text, so "https://x" still works.
// Pure: parseQuery() makes a tree, matchNote() tests a note against it, and
// snippetFor() finds the line to show under a result, with the hits marked.
import YAML from 'yaml';
import { foldCase } from './find.mjs';
import { scanTags } from './tags.mjs';

const FIELD_OPS = new Set(['file', 'path', 'content', 'line', 'section', 'task', 'task-todo', 'task-done', 'tag']);

// --- parsing ---------------------------------------------------------------

export function parseQuery(q) {
  const src = String(q || '');
  let i = 0;
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  const atEnd = () => { ws(); return i >= src.length; };

  function quoted() { // at '"'
    const end = src.indexOf('"', i + 1);
    const text = end === -1 ? src.slice(i + 1) : src.slice(i + 1, end);
    i = end === -1 ? src.length : end + 1;
    return { type: 'term', text };
  }
  function regex() { // at '/'; a lone slash or a bad pattern is plain text
    let j = i + 1;
    while (j < src.length && src[j] !== '/') j += src[j] === '\\' ? 2 : 1;
    if (j >= src.length || j === i + 1) return null;
    try {
      const re = new RegExp(src.slice(i + 1, j), 'iu');
      i = j + 1;
      return { type: 'regex', re };
    } catch { return null; }
  }
  function word() {
    const start = i;
    while (i < src.length && !/[\s()]/.test(src[i])) i++;
    return src.slice(start, i);
  }
  // The value after "op:": a group, a phrase, a regex or a word.
  function operand() {
    if (src[i] === '(') { i++; const n = orExpr(); ws(); if (src[i] === ')') i++; return n; }
    if (src[i] === '"') return quoted();
    if (src[i] === '/') { const r = regex(); if (r) return r; }
    return { type: 'term', text: word() };
  }
  function atom() {
    ws();
    const c = src[i];
    if (c === '(') { i++; const n = orExpr(); ws(); if (src[i] === ')') i++; return n; }
    if (c === '"') return quoted();
    if (c === '/') { const r = regex(); if (r) return r; }
    if (c === '[') {
      const end = src.indexOf(']', i);
      if (end !== -1) {
        const inner = src.slice(i + 1, end);
        i = end + 1;
        const k = inner.indexOf(':');
        const name = (k === -1 ? inner : inner.slice(0, k)).trim();
        const raw = k === -1 ? null : inner.slice(k + 1).trim().replace(/^"(.*)"$/, '$1');
        return { type: 'prop', name, value: raw ? { type: 'term', text: raw } : null };
      }
    }
    if (c === '#') {
      const w = word();
      if (w.length > 1) return { type: 'op', op: 'tag', arg: { type: 'term', text: w.slice(1) } };
      return { type: 'term', text: w };
    }
    const m = /^([a-z-]+):/i.exec(src.slice(i));
    if (m && FIELD_OPS.has(m[1].toLowerCase()) && i + m[0].length < src.length && !/\s/.test(src[i + m[0].length])) {
      i += m[0].length;
      return { type: 'op', op: m[1].toLowerCase(), arg: operand() };
    }
    return { type: 'term', text: word() };
  }
  function unary() {
    ws();
    if (src[i] === '-' && i + 1 < src.length && !/\s/.test(src[i + 1])) { i++; return { type: 'not', arg: unary() }; }
    return atom();
  }
  function andExpr() {
    const parts = [];
    for (;;) {
      if (atEnd() || src[i] === ')') break;
      if (/^OR(\s|$)/.test(src.slice(i)) && parts.length) break;
      const before = i;
      const n = unary();
      if (i === before) { i++; continue; } // never loop on a stray character
      if (!(n.type === 'term' && !n.text)) parts.push(n);
    }
    return parts.length === 1 ? parts[0] : { type: 'and', parts };
  }
  function orExpr() {
    const parts = [andExpr()];
    for (;;) {
      ws();
      if (!/^OR(\s|$)/.test(src.slice(i))) break;
      i += 2;
      parts.push(andExpr());
    }
    return parts.length === 1 ? parts[0] : { type: 'or', parts };
  }
  const tree = orExpr();
  while (!atEnd()) { i++; } // a stray ")" ends the query
  return tree;
}

const isEmpty = (n) => n.type === 'and' && !n.parts.length;
export function isEmptyQuery(tree) { return isEmpty(tree); }

// Plain words only (no operators, phrases or exclusions): the query can also
// be a note name to open or create, and searched in plan titles.
export function isPlainQuery(tree) {
  if (tree.type === 'term') return true;
  return tree.type === 'and' && tree.parts.every((p) => p.type === 'term');
}

// --- matching --------------------------------------------------------------

function frontmatterEnd(lines) {
  if (lines[0] !== '---') return -1;
  for (let k = 1; k < lines.length; k++) if (lines[k] === '---' || lines[k] === '...') return k;
  return -1;
}

const TASK = /^\s*(?:[-*+]|\d+[.)])\s+\[(.)\]\s?/;

// A note as search sees it; derived parts are made once, when first needed.
// note: { rel, title, content }
// Folded texts are kept between searches (typing a query searches the same
// notes again on every key): by text, a bounded number.
const FOLDED = new Map();
function foldedText(s) {
  let f = FOLDED.get(s);
  if (f === undefined) {
    f = foldCase(s);
    if (FOLDED.size > 20000) FOLDED.delete(FOLDED.keys().next().value);
    FOLDED.set(s, f);
  }
  return f;
}

export function searchDoc(note) {
  const content = note.content || '';
  const memo = {};
  const once = (k, fn) => (k in memo ? memo[k] : (memo[k] = fn()));
  return {
    title: note.title || '',
    path: note.rel || '',
    content,
    folded: foldedText,
    get lines() { return once('lines', () => content.split('\n')); },
    get body() { return once('body', () => this.lines.slice(frontmatterEnd(this.lines) + 1)); },
    get sections() {
      return once('sections', () => {
        const out = [];
        let cur = [];
        let fence = false;
        for (const l of this.body) {
          if (/^\s*(```|~~~)/.test(l)) fence = !fence;
          if (!fence && /^#{1,6}\s/.test(l) && cur.length) { out.push(cur.join('\n')); cur = []; }
          cur.push(l);
        }
        if (cur.length) out.push(cur.join('\n'));
        return out;
      });
    },
    tasks(kind) {
      return once(`tasks:${kind}`, () => this.body.filter((l) => {
        const m = TASK.exec(l);
        if (!m) return false;
        const done = m[1] !== ' ';
        return kind === 'task' || (kind === 'task-done' ? done : !done);
      }).map((l) => l.replace(TASK, '')));
    },
    get tags() { return once('tags', () => scanTags(content).map(foldCase)); },
    get props() {
      return once('props', () => {
        const ls = this.lines;
        const end = frontmatterEnd(ls);
        if (end === -1) return {};
        try {
          const y = YAML.parse(ls.slice(1, end).join('\n'));
          const out = {};
          if (y && typeof y === 'object') for (const [k, v] of Object.entries(y)) out[foldCase(k)] = v;
          return out;
        } catch { return {}; }
      });
    },
  };
}

function propText(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(propText).join(' ');
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// fields: the texts a plain word may be in (title and text, or one line…).
function test(n, doc, fields) {
  switch (n.type) {
    case 'and': return n.parts.every((p) => test(p, doc, fields));
    case 'or': return n.parts.some((p) => test(p, doc, fields));
    case 'not': return !test(n.arg, doc, fields);
    case 'term': {
      const w = foldCase(n.text);
      return fields.some((f) => doc.folded(f).includes(w));
    }
    case 'regex': return fields.some((f) => { n.re.lastIndex = 0; return n.re.test(f); });
    case 'prop': {
      const v = doc.props[foldCase(n.name)];
      if (v === undefined) return false;
      return n.value ? test(n.value, doc, [propText(v)]) : true;
    }
    case 'op': {
      const a = n.arg;
      switch (n.op) {
        case 'file': return test(a, doc, [doc.title]);
        case 'path': return test(a, doc, [doc.path]);
        case 'content': return test(a, doc, [doc.content]);
        case 'line': return doc.body.some((l) => test(a, doc, [l]));
        case 'section': return doc.sections.some((s) => test(a, doc, [s]));
        case 'task': case 'task-todo': case 'task-done': {
          const ts = doc.tasks(n.op);
          return a.type === 'term' && !a.text ? ts.length > 0 : ts.some((l) => test(a, doc, [l]));
        }
        case 'tag': {
          if (a.type !== 'term') return test(a, doc, doc.tags);
          const w = foldCase(a.text.replace(/^#/, ''));
          return doc.tags.some((t) => t === w || t.startsWith(`${w}/`));
        }
        default: return false;
      }
    }
    default: return false;
  }
}

export function matchNote(tree, doc) {
  if (isEmpty(tree)) return false;
  return test(tree, doc, [doc.title, doc.content]);
}

// --- what to mark -------------------------------------------------------------

// The words and patterns a hit is shown for: those that must be in the text,
// not the excluded ones, nor names, paths, tags or properties.
export function hitTerms(tree) {
  const out = [];
  const walk = (n, neg, inText) => {
    if (n.type === 'and' || n.type === 'or') n.parts.forEach((p) => walk(p, neg, inText));
    else if (n.type === 'not') walk(n.arg, !neg, inText);
    else if (n.type === 'op') { if (!['file', 'path', 'tag'].includes(n.op)) walk(n.arg, neg, true); }
    else if (!neg && inText && n.type === 'term' && n.text) out.push({ text: n.text });
    else if (!neg && inText && n.type === 'regex') out.push({ re: n.re });
  };
  walk(tree, false, true);
  return out;
}

// [{ start, end }] of every hit of `terms` in `line`, sorted, not overlapping.
export function hitsIn(line, terms) {
  const all = [];
  const fl = foldCase(line);
  for (const t of terms) {
    if (t.text) {
      const w = foldCase(t.text);
      for (let k = fl.indexOf(w); k !== -1; k = fl.indexOf(w, k + w.length)) all.push({ start: k, end: k + w.length });
    } else {
      const re = new RegExp(t.re.source, 'giu');
      for (const m of line.matchAll(re)) if (m[0]) all.push({ start: m.index, end: m.index + m[0].length });
    }
  }
  all.sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  for (const h of all) if (!out.length || h.start >= out[out.length - 1].end) out.push(h);
  return out;
}

// The first line of the text with a hit, cut to about `max` characters
// around it: { text, hits: [{ start, end }] } or null.
export function snippetFor(doc, terms, max = 120) {
  if (!terms.length) return null;
  for (const raw of doc.body) {
    const hits = hitsIn(raw, terms);
    if (!hits.length) continue;
    const lead = raw.length - raw.trimStart().length;
    let from = lead;
    if (hits[0].start - from > max / 3) from = hits[0].start - Math.floor(max / 3);
    const to = Math.min(raw.trimEnd().length, from + max);
    const pre = from > lead ? '…' : '';
    const text = pre + raw.slice(from, to) + (to < raw.trimEnd().length ? '…' : '');
    const shift = pre.length - from;
    return {
      text,
      hits: hits.filter((h) => h.start >= from && h.end <= to).map((h) => ({ start: h.start + shift, end: h.end + shift })),
    };
  }
  return null;
}
