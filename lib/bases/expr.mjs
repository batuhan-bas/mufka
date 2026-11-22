// The expression language of Obsidian Bases (filters, formulas, summaries):
// literals, note / file / formula properties, `this`, arithmetic, comparison,
// && || !, function calls, methods on values ("price.toFixed(2)",
// "file.hasTag('book')"), [index], list literals and /regex/. Dates are Luxon
// DateTimes; a date plus or minus a duration string ("1M", "2 weeks") moves
// it. Pure.
import { DateTime, Duration } from 'luxon';
import { Link } from '../dataview/values.mjs';
import { formatDate } from '../template.mjs';

export class BaseError extends Error {}

// --- parsing --------------------------------------------------------------------

const PUNCT = ['==', '!=', '>=', '<=', '&&', '||', '(', ')', '[', ']', ',', '.', '+', '-', '*', '/', '%', '>', '<', '!'];

function tokenize(src) {
  const out = [];
  let i = 0;
  const s = String(src);
  const prevValue = () => { const t = out[out.length - 1]; return t && (t.t === 'num' || t.t === 'str' || t.t === 'id' || t.v === ')' || t.v === ']'); };
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i += 1; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1; let v = '';
      while (j < s.length && s[j] !== c) { if (s[j] === '\\' && j + 1 < s.length) { v += s[j + 1]; j += 2; } else { v += s[j]; j += 1; } }
      if (j >= s.length) throw new BaseError('A text in quotes is not closed');
      out.push({ t: 'str', v }); i = j + 1; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
      const m = /^[0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?/i.exec(s.slice(i));
      out.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue;
    }
    if (c === '/' && !prevValue()) {
      const m = /^\/((?:\\.|[^/\\\n])+)\/([gimsuy]*)/.exec(s.slice(i));
      if (m) { out.push({ t: 're', v: new RegExp(m[1], m[2]) }); i += m[0].length; continue; }
    }
    const id = /^[A-Za-z_À-￿][\wÀ-￿-]*/.exec(s.slice(i));
    if (id) {
      // "a-b" is a name (Obsidian allows dashes in property names) unless
      // spaces show it is a subtraction.
      let name = id[0];
      while (name.endsWith('-')) name = name.slice(0, -1);
      out.push({ t: 'id', v: name }); i += name.length; continue;
    }
    const p = PUNCT.find((x) => s.startsWith(x, i));
    if (!p) throw new BaseError(`Unexpected "${c}"`);
    out.push({ t: 'p', v: p }); i += p.length;
  }
  return out;
}

const BINARY = [['||'], ['&&'], ['==', '!='], ['>', '<', '>=', '<='], ['+', '-'], ['*', '/', '%']];

export function parseExpr(src) {
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos];
  const isP = (v) => toks[pos] && toks[pos].t === 'p' && toks[pos].v === v;
  const expect = (v) => { if (!isP(v)) throw new BaseError(`Expected "${v}"`); pos += 1; };
  const binary = (level) => {
    if (level === BINARY.length) return unary();
    let left = binary(level + 1);
    while (toks[pos] && toks[pos].t === 'p' && BINARY[level].includes(toks[pos].v)) {
      const op = toks[pos].v; pos += 1;
      left = { k: 'bin', op, a: left, b: binary(level + 1) };
    }
    return left;
  };
  const unary = () => {
    if (isP('!')) { pos += 1; return { k: 'not', a: unary() }; }
    if (isP('-')) { pos += 1; return { k: 'neg', a: unary() }; }
    return postfix(primary());
  };
  const args = () => {
    const list = [];
    expect('(');
    if (!isP(')')) { list.push(binary(0)); while (isP(',')) { pos += 1; list.push(binary(0)); } }
    expect(')');
    return list;
  };
  const postfix = (node) => {
    for (;;) {
      if (isP('.')) {
        pos += 1;
        const t = peek();
        if (!t || t.t !== 'id') throw new BaseError('Expected a name after "."');
        pos += 1;
        node = isP('(') ? { k: 'method', obj: node, name: t.v, args: args() } : { k: 'member', obj: node, name: t.v };
      } else if (isP('[')) {
        pos += 1; const key = binary(0); expect(']');
        node = { k: 'index', obj: node, key };
      } else return node;
    }
  };
  const primary = () => {
    const t = peek();
    if (!t) throw new BaseError('The expression ends too soon');
    pos += 1;
    if (t.t === 'num') return { k: 'lit', v: t.v };
    if (t.t === 'str') return { k: 'lit', v: t.v };
    if (t.t === 're') return { k: 'lit', v: t.v };
    if (t.t === 'id') {
      if (t.v === 'true') return { k: 'lit', v: true };
      if (t.v === 'false') return { k: 'lit', v: false };
      if (t.v === 'null') return { k: 'lit', v: null };
      if (isP('(')) return { k: 'call', name: t.v, args: args() };
      return { k: 'name', name: t.v };
    }
    if (t.v === '(') { const e = binary(0); expect(')'); return e; }
    if (t.v === '[') {
      const items = [];
      if (!isP(']')) { items.push(binary(0)); while (isP(',')) { pos += 1; items.push(binary(0)); } }
      expect(']');
      return { k: 'list', items };
    }
    throw new BaseError(`Unexpected "${t.v}"`);
  };
  const e = binary(0);
  if (pos < toks.length) throw new BaseError(`Unexpected "${toks[pos].v}"`);
  return e;
}

const parsed = new Map();
export function compile(src) {
  const key = String(src);
  if (!parsed.has(key)) {
    if (parsed.size > 2000) parsed.clear();
    parsed.set(key, parseExpr(key));
  }
  return parsed.get(key);
}

// --- values ---------------------------------------------------------------------

// A file in the vault as an expression sees it (`file`, `this`).
export class FileRef {
  constructor(info) { Object.assign(this, info); }
}

export const isDate = (v) => DateTime.isDateTime(v);
export const isDuration = (v) => Duration.isDuration(v);
const isList = Array.isArray;
const isObj = (v) => v != null && typeof v === 'object' && !isList(v) && !isDate(v) && !isDuration(v) && !(v instanceof Link) && !(v instanceof FileRef) && !(v instanceof RegExp);

export function typeName(v) {
  if (v == null) return 'null';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'boolean') return 'boolean';
  if (isDate(v)) return 'date';
  if (isDuration(v)) return 'duration';
  if (v instanceof Link) return 'link';
  if (v instanceof FileRef) return 'file';
  if (v instanceof RegExp) return 'regexp';
  if (isList(v)) return 'list';
  return 'object';
}

export function truthy(v) {
  if (v == null) return false;
  if (typeof v === 'string') return v.length > 0;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (isList(v)) return v.length > 0;
  if (isObj(v)) return Object.keys(v).length > 0;
  return Boolean(v);
}

export function isEmpty(v) {
  if (v == null) return true;
  if (typeof v === 'string' || isList(v)) return v.length === 0;
  if (isObj(v)) return Object.keys(v).length === 0;
  return false;
}

const DUR_UNITS = { y: 'years', year: 'years', years: 'years', M: 'months', month: 'months', months: 'months', w: 'weeks', week: 'weeks', weeks: 'weeks',
  d: 'days', day: 'days', days: 'days', h: 'hours', hour: 'hours', hours: 'hours', m: 'minutes', minute: 'minutes', minutes: 'minutes', s: 'seconds', second: 'seconds', seconds: 'seconds' };
export function parseDurationText(text) {
  const s = String(text).trim();
  if (!s) return null;
  const re = /(-?\d+(?:\.\d+)?)\s*([a-zA-Z]+)/g;
  const out = {}; let m; let used = '';
  while ((m = re.exec(s))) {
    const unit = DUR_UNITS[m[2]] || DUR_UNITS[m[2].toLowerCase() === 'm' ? m[2] : m[2].toLowerCase()];
    if (!unit) return null;
    out[unit] = (out[unit] || 0) + Number(m[1]);
    used += m[0];
  }
  if (!Object.keys(out).length || used.replace(/\s/g, '') !== s.replace(/[\s,]/g, '')) return null;
  return Duration.fromObject(out);
}

export function parseDateText(text) {
  const s = String(text).trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const d = DateTime.fromISO(s.replace(' ', 'T'));
  return d.isValid ? d : null;
}

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isDate(v)) return v.toMillis();
  if (isDuration(v)) return v.toMillis();
  if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

export function sameValue(a, b) {
  if (a == null || b == null) return a == null && b == null;
  if (a instanceof Link || b instanceof Link || a instanceof FileRef || b instanceof FileRef) {
    const p = (x) => (x instanceof Link ? x.path : x instanceof FileRef ? x.path : null);
    const pa = p(a); const pb = p(b);
    if (pa && pb) return pa === pb;
    const name = (x) => (x instanceof Link ? x.fileName() : x instanceof FileRef ? x.basename : String(x));
    return name(a) === name(b);
  }
  if (isDate(a) && isDate(b)) return a.toMillis() === b.toMillis();
  if (isList(a) && isList(b)) return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  if (typeof a === 'number' || typeof b === 'number') { const x = toNumber(a); const y = toNumber(b); return x != null && x === y; }
  return a === b || String(a) === String(b);
}

// Ordering for sorting and < >: null last, numbers, dates, text.
export function compareValues(a, b) {
  if (a == null || a === '') return b == null || b === '' ? 0 : 1;
  if (b == null || b === '') return -1;
  if (isDate(a) && isDate(b)) return a.toMillis() - b.toMillis();
  if (isDuration(a) && isDuration(b)) return a.toMillis() - b.toMillis();
  const x = toNumber(a); const y = toNumber(b);
  if (x != null && y != null && typeof a !== 'string' && typeof b !== 'string') return x - y;
  if (typeof a === 'number' && y != null) return a - y;
  if (typeof b === 'number' && x != null) return x - b;
  return textOf(a).localeCompare(textOf(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function textOf(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (isDate(v)) return v.hour || v.minute || v.second ? v.toFormat('yyyy-MM-dd HH:mm') : v.toFormat('yyyy-MM-dd');
  if (isDuration(v)) return durationText(v);
  if (v instanceof Link) return v.display || v.fileName();
  if (v instanceof FileRef) return v.basename;
  if (v instanceof RegExp) return String(v);
  if (isList(v)) return v.map(textOf).join(', ');
  return JSON.stringify(v);
}

function durationText(d) {
  const ms = Math.abs(d.toMillis());
  const sign = d.toMillis() < 0 ? '-' : '';
  const units = [['day', 86400000], ['hour', 3600000], ['minute', 60000], ['second', 1000]];
  for (const [u, n] of units) if (ms >= n) { const k = Math.floor(ms / n); return `${sign}${k} ${u}${k === 1 ? '' : 's'}`; }
  return '0 seconds';
}

const asDuration = (v) => (isDuration(v) ? v : typeof v === 'string' ? parseDurationText(v) : null);

function applyOp(op, a, b) {
  switch (op) {
    case '==': return sameValue(a, b);
    case '!=': return !sameValue(a, b);
    case '>': return a != null && b != null && compareValues(a, b) > 0;
    case '<': return a != null && b != null && compareValues(a, b) < 0;
    case '>=': return a != null && b != null && compareValues(a, b) >= 0;
    case '<=': return a != null && b != null && compareValues(a, b) <= 0;
    case '+': {
      if (isDate(a)) { const d = asDuration(b); return d ? a.plus(d) : null; }
      if (isDuration(a)) { const d = asDuration(b); return d ? a.plus(d) : null; }
      if (typeof a === 'number' && typeof b === 'number') return a + b;
      if (isList(a)) return a.concat(isList(b) ? b : [b]);
      if (a == null && b == null) return null;
      return textOf(a) + textOf(b);
    }
    case '-': {
      if (isDate(a) && isDate(b)) return Duration.fromMillis(a.toMillis() - b.toMillis());
      if (isDate(a)) { const d = asDuration(b); return d ? a.minus(d) : null; }
      if (isDuration(a)) { const d = asDuration(b); return d ? a.minus(d) : null; }
      break;
    }
    case '*':
      if (isDuration(a) && typeof b === 'number') return Duration.fromMillis(a.toMillis() * b);
      break;
    case '/':
      if (isDuration(a) && typeof b === 'number') return b ? Duration.fromMillis(a.toMillis() / b) : null;
      break;
    default: break;
  }
  const x = toNumber(a); const y = toNumber(b);
  if (x == null || y == null) return null;
  if (op === '-') return x - y;
  if (op === '*') return x * y;
  if (op === '/') return y === 0 ? null : x / y;
  if (op === '%') return y === 0 ? null : x % y;
  return null;
}

// --- evaluation -------------------------------------------------------------------
//
// ctx: {
//   note(name) → the row's note property (undefined when it has none),
//   file: FileRef of the row, formula(name) → a formula's value,
//   thisFile: FileRef, thisNote(name), resolve(text) → vault path or null,
//   fileAt(path) → FileRef or null, now: DateTime, vars: { value, index, acc, values }
// }

export function evaluate(node, ctx) {
  switch (node.k) {
    case 'lit': return node.v;
    case 'list': return node.items.map((x) => evaluate(x, ctx));
    case 'not': return !truthy(evaluate(node.a, ctx));
    case 'neg': { const v = toNumber(evaluate(node.a, ctx)); return v == null ? null : -v; }
    case 'bin': {
      if (node.op === '&&') return truthy(evaluate(node.a, ctx)) && truthy(evaluate(node.b, ctx));
      if (node.op === '||') { const a = evaluate(node.a, ctx); return truthy(a) ? a : evaluate(node.b, ctx); }
      return applyOp(node.op, evaluate(node.a, ctx), evaluate(node.b, ctx));
    }
    case 'name': return nameValue(node.name, ctx);
    case 'member': return memberOf(node.obj, node.name, ctx);
    case 'index': {
      const o = evaluate(node.obj, ctx); const k = evaluate(node.key, ctx);
      if (isList(o)) { const i = toNumber(k); return i == null ? null : o[i < 0 ? o.length + i : i] ?? null; }
      if (typeof o === 'string') { const i = toNumber(k); return i == null ? null : o[i] ?? null; }
      return field(o, textOf(k), ctx);
    }
    case 'call': return callGlobal(node.name, node.args, ctx);
    case 'method': return callMethod(node.obj, node.name, node.args, ctx);
    default: throw new BaseError('Cannot read this expression');
  }
}

function nameValue(name, ctx) {
  const vars = ctx.vars || {};
  if (name in vars) return vars[name];
  if (name === 'file') return ctx.file;
  if (name === 'this') return ctx.thisFile;
  if (name === 'note' || name === 'formula') return { __scope: name };
  const v = ctx.note(name);
  return v === undefined ? null : v;
}

function memberOf(objNode, name, ctx) {
  // note.x / formula.x / this.x: scopes, not values.
  if (objNode.k === 'name' && !(ctx.vars && objNode.name in ctx.vars)) {
    if (objNode.name === 'note') { const v = ctx.note(name); return v === undefined ? null : v; }
    if (objNode.name === 'formula') return ctx.formula(name);
    if (objNode.name === 'this' && name !== 'file') {
      if (ctx.thisFile && name in FILE_FIELDS) return field(ctx.thisFile, name, ctx);
      const v = ctx.thisNote ? ctx.thisNote(name) : undefined;
      return v === undefined ? null : v;
    }
  }
  return field(evaluate(objNode, ctx), name, ctx);
}

const FILE_FIELDS = { name: 1, basename: 1, path: 1, folder: 1, ext: 1, size: 1, ctime: 1, mtime: 1, tags: 1, links: 1, embeds: 1, backlinks: 1, properties: 1, file: 1 };

function field(o, name, ctx) {
  if (o == null) return null;
  if (o.__scope === 'note') { const v = ctx.note(name); return v === undefined ? null : v; }
  if (o.__scope === 'formula') return ctx.formula(name);
  if (o instanceof FileRef) {
    if (name === 'file') return o;
    if (name === 'backlinks') return o.backlinks ? o.backlinks() : [];
    if (name === 'properties') return o.properties || {};
    if (name in FILE_FIELDS) return o[name] ?? null;
    if (o === ctx.thisFile && ctx.thisNote) { const v = ctx.thisNote(name); return v === undefined ? null : v; }
    return null;
  }
  if (typeof o === 'string' && name === 'length') return o.length;
  if (isList(o) && name === 'length') return o.length;
  if (isDate(o)) {
    if (['year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond'].includes(name)) return o[name];
    return null;
  }
  if (isDuration(o)) {
    const units = { years: 'years', months: 'months', weeks: 'weeks', days: 'days', hours: 'hours', minutes: 'minutes', seconds: 'seconds', milliseconds: 'milliseconds' };
    return units[name] ? Math.floor(o.as(units[name])) : null;
  }
  if (o instanceof Link) {
    const f = ctx.fileAt ? ctx.fileAt(o.path) : null;
    return f ? field(f, name, ctx) : null;
  }
  if (isObj(o)) {
    if (name in o) return o[name];
    const k = Object.keys(o).find((x) => x.toLowerCase() === name.toLowerCase());
    return k ? o[k] : null;
  }
  return null;
}

function callGlobal(name, argNodes, ctx) {
  const a = () => argNodes.map((x) => evaluate(x, ctx));
  switch (name) {
    case 'if': {
      const [c, t, f] = argNodes;
      if (!c) throw new BaseError('if() needs a condition');
      return truthy(evaluate(c, ctx)) ? (t ? evaluate(t, ctx) : null) : (f ? evaluate(f, ctx) : null);
    }
    case 'now': return ctx.now || DateTime.now();
    case 'today': return (ctx.now || DateTime.now()).startOf('day');
    case 'date': { const [v] = a(); return isDate(v) ? v : v == null ? null : parseDateText(textOf(v)); }
    case 'duration': { const [v] = a(); return isDuration(v) ? v : parseDurationText(textOf(v)); }
    case 'number': { const [v] = a(); return toNumber(v); }
    case 'list': { const [v] = a(); return v == null ? [] : isList(v) ? v : [v]; }
    case 'max': { const n = a().flat().map(toNumber).filter((x) => x != null); return n.length ? Math.max(...n) : null; }
    case 'min': { const n = a().flat().map(toNumber).filter((x) => x != null); return n.length ? Math.min(...n) : null; }
    case 'link': {
      const [p, display] = a();
      if (p instanceof FileRef) return new Link(p.path, { display: display == null ? null : textOf(display) });
      if (p instanceof Link) return display == null ? p : p.withDisplay(textOf(display));
      const t = textOf(p).replace(/^\[\[|\]\]$/g, '');
      if (/^https?:\/\//i.test(t)) return { __url: t, display: display == null ? null : textOf(display) };
      const rel = ctx.resolve ? ctx.resolve(t) : null;
      return new Link(rel || `${t}.md`, { display: display == null ? null : textOf(display) });
    }
    case 'file': {
      const [p] = a();
      if (p instanceof FileRef) return p;
      const t = p instanceof Link ? p.path : textOf(p).replace(/^\[\[|\]\]$/g, '');
      const rel = p instanceof Link ? p.path : (ctx.resolve ? ctx.resolve(t) : null) || t;
      return ctx.fileAt ? ctx.fileAt(rel) : null;
    }
    case 'image': { const [p] = a(); return { __image: p instanceof Link ? p.path : textOf(p) }; }
    case 'icon': { const [n] = a(); return { __icon: textOf(n) }; }
    case 'html': case 'escapeHTML': { const [v] = a(); return textOf(v); }
    case 'random': return Math.random();
    default: throw new BaseError(`Unknown function ${name}()`);
  }
}

const listArg = (args) => (args.length === 1 && isList(args[0]) ? args[0] : args);

function callMethod(objNode, name, argNodes, ctx) {
  const o = evaluate(objNode, ctx);
  const a = () => argNodes.map((x) => evaluate(x, ctx));
  // Any type.
  if (name === 'isTruthy') return truthy(o);
  if (name === 'isType') { const [t] = a(); return typeName(o) === String(t).toLowerCase(); }
  if (name === 'toString') return textOf(o);
  if (name === 'isEmpty') return isEmpty(o);

  if (o instanceof FileRef) {
    if (name === 'hasTag') {
      const want = a().map((t) => textOf(t).replace(/^#/, '').toLowerCase());
      return (o.tags || []).some((t) => { const x = t.replace(/^#/, '').toLowerCase(); return want.some((w) => x === w || x.startsWith(`${w}/`)); });
    }
    if (name === 'inFolder') {
      const f = textOf(a()[0]).replace(/^\/+|\/+$/g, '');
      return !f || o.folder === f || o.folder.startsWith(`${f}/`);
    }
    if (name === 'hasProperty') { const [p] = a(); return Object.keys(o.properties || {}).some((k) => k.toLowerCase() === textOf(p).toLowerCase()); }
    if (name === 'hasLink') {
      const [x] = a();
      const target = x instanceof FileRef ? x.path : x instanceof Link ? x.path : (ctx.resolve ? ctx.resolve(textOf(x)) : null) || textOf(x);
      return (o.links || []).some((l) => sameValue(l, x instanceof FileRef || x instanceof Link ? x : new Link(target)) || l.path === target);
    }
    if (name === 'asLink') { const [d] = a(); return new Link(o.path, { display: d == null ? null : textOf(d) }); }
    throw new BaseError(`Files have no ${name}()`);
  }
  if (o instanceof Link) {
    if (name === 'asFile') return ctx.fileAt ? ctx.fileAt(o.path) : null;
    if (name === 'linksTo') { const [x] = a(); const f = ctx.fileAt ? ctx.fileAt(o.path) : null; return f ? (f.links || []).some((l) => sameValue(l, x)) : false; }
    throw new BaseError(`Links have no ${name}()`);
  }
  if (isList(o)) {
    if (name === 'filter' || name === 'map') {
      const body = argNodes[0];
      if (!body) throw new BaseError(`${name}() needs an expression`);
      const run = (value, index) => evaluate(body, { ...ctx, vars: { ...(ctx.vars || {}), value, index } });
      return name === 'filter' ? o.filter((v, i) => truthy(run(v, i))) : o.map(run);
    }
    if (name === 'reduce') {
      const [body, init] = argNodes;
      if (!body) throw new BaseError('reduce() needs an expression');
      let acc = init ? evaluate(init, ctx) : null;
      o.forEach((value, index) => { acc = evaluate(body, { ...ctx, vars: { ...(ctx.vars || {}), value, index, acc } }); });
      return acc;
    }
    const args = a();
    switch (name) {
      case 'contains': return o.some((x) => sameValue(x, args[0]));
      case 'containsAll': return args.every((y) => o.some((x) => sameValue(x, y)));
      case 'containsAny': return args.some((y) => o.some((x) => sameValue(x, y)));
      case 'join': return o.map(textOf).join(args[0] == null ? ', ' : textOf(args[0]));
      case 'flat': return o.flat(Infinity);
      case 'reverse': return [...o].reverse();
      case 'slice': return o.slice(toNumber(args[0]) ?? 0, args[1] == null ? undefined : toNumber(args[1]));
      case 'sort': return [...o].sort(compareValues);
      case 'unique': return o.filter((x, i) => o.findIndex((y) => sameValue(x, y)) === i);
      // Summary helpers (values.mean() …).
      case 'mean': case 'average': { const n = o.map(toNumber).filter((x) => x != null); return n.length ? n.reduce((s, x) => s + x, 0) / n.length : null; }
      case 'sum': return o.map(toNumber).filter((x) => x != null).reduce((s, x) => s + x, 0);
      case 'min': { const n = o.map(toNumber).filter((x) => x != null); return n.length ? Math.min(...n) : null; }
      case 'max': { const n = o.map(toNumber).filter((x) => x != null); return n.length ? Math.max(...n) : null; }
      default: throw new BaseError(`Lists have no ${name}()`);
    }
  }
  const args = a();
  if (typeof o === 'string') {
    switch (name) {
      case 'contains': return o.includes(textOf(args[0]));
      case 'containsAll': return listArg(args).every((x) => o.includes(textOf(x)));
      case 'containsAny': return listArg(args).some((x) => o.includes(textOf(x)));
      case 'startsWith': return o.startsWith(textOf(args[0]));
      case 'endsWith': return o.endsWith(textOf(args[0]));
      case 'lower': return o.toLowerCase();
      case 'upper': return o.toUpperCase();
      case 'title': return o.replace(/\S+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
      case 'trim': return o.trim();
      case 'reverse': return [...o].reverse().join('');
      case 'repeat': return o.repeat(Math.max(0, toNumber(args[0]) || 0));
      case 'slice': return o.slice(toNumber(args[0]) ?? 0, args[1] == null ? undefined : toNumber(args[1]));
      case 'replace': return args[0] instanceof RegExp ? o.replace(args[0], textOf(args[1])) : o.split(textOf(args[0])).join(textOf(args[1]));
      case 'split': { const parts = o.split(args[0] instanceof RegExp ? args[0] : textOf(args[0])); return args[1] == null ? parts : parts.slice(0, toNumber(args[1])); }
      default: break;
    }
  }
  if (o instanceof RegExp && name === 'matches') return o.test(textOf(args[0]));
  if (typeof o === 'number') {
    switch (name) {
      case 'abs': return Math.abs(o);
      case 'ceil': return Math.ceil(o);
      case 'floor': return Math.floor(o);
      case 'round': { const d = toNumber(args[0]) || 0; const f = 10 ** d; return Math.round(o * f) / f; }
      case 'toFixed': return o.toFixed(Math.max(0, Math.min(20, toNumber(args[0]) || 0)));
      default: break;
    }
  }
  if (isDate(o)) {
    switch (name) {
      case 'date': return o.startOf('day');
      case 'time': return o.toFormat('HH:mm:ss');
      case 'format': return formatDate(o.toJSDate(), textOf(args[0] ?? 'YYYY-MM-DD'));
      case 'relative': return o.toRelative({ base: ctx.now || DateTime.now() }) || '';
      default: break;
    }
  }
  if (isObj(o)) {
    if (name === 'keys') return Object.keys(o);
    if (name === 'values') return Object.values(o);
  }
  if (o == null) return null;
  throw new BaseError(`${typeName(o)} has no ${name}()`);
}
