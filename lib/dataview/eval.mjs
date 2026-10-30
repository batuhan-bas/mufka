// Evaluating Dataview expressions against a row: fields, `this`, operators and
// the function library (contains, length, date, dur, map, filter, join, …).
// Pure. Errors are DataviewErrors with a readable message.
import { DataviewError } from './parse.mjs';
import { linkValue } from './index.mjs';
import {
  DateTime, Duration, Link, isLink, isDate, isDuration, isArray, isObject, typeOf, truthy, compare, equals,
  toText, parseDate, parseDuration, canonicalName,
} from './values.mjs';

// ctx: { data (row fields), index, thisPage, thisRel, vars: Map }
export function evaluate(e, ctx) {
  switch (e.k) {
    case 'lit': return e.v;
    case 'datelit': return dateLiteral(e.v);
    case 'durlit': return parseDuration(e.v);
    case 'link': return linkValue(e.inner, ctx.thisRel || '', ctx.index ? ctx.index.relList : [], e.embed);
    case 'list': return e.items.map((x) => evaluate(x, ctx));
    case 'obj': {
      const o = {};
      for (const [k, x] of e.entries) o[k] = evaluate(x, ctx);
      return o;
    }
    case 'lambda': return { lambda: true, params: e.params, body: e.body, ctx };
    case 'var': return lookup(e.name, ctx);
    case 'field': return field(evaluate(e.obj, ctx), e.name, ctx);
    case 'index': {
      const obj = evaluate(e.obj, ctx);
      const idx = evaluate(e.idx, ctx);
      if (typeof idx === 'number') {
        if (isArray(obj) || typeof obj === 'string') return obj[idx < 0 ? obj.length + idx : idx] ?? null;
        return null;
      }
      return field(obj, toText(idx), ctx);
    }
    case 'un': {
      const v = evaluate(e.e, ctx);
      if (e.op === '!') return !truthy(v);
      if (typeof v === 'number') return -v;
      if (isDuration(v)) return v.negate();
      if (v == null) return null;
      throw new DataviewError(`Cannot negate a ${typeOf(v)}`);
    }
    case 'bin': return binary(e, ctx);
    case 'call': return call(e, ctx);
    default: throw new DataviewError('Unknown expression');
  }
}

export function dateLiteral(word) {
  const now = DateTime.now();
  switch (String(word).toLowerCase()) {
    case 'today': return now.startOf('day');
    case 'now': return now;
    case 'tomorrow': return now.startOf('day').plus({ days: 1 });
    case 'yesterday': return now.startOf('day').minus({ days: 1 });
    case 'sow': return now.startOf('week');
    case 'eow': return now.endOf('week');
    case 'som': return now.startOf('month');
    case 'eom': return now.endOf('month');
    case 'soq': return now.startOf('quarter');
    case 'eoq': return now.endOf('quarter');
    case 'soy': return now.startOf('year');
    case 'eoy': return now.endOf('year');
    default: return parseDate(word);
  }
}

function lookup(name, ctx) {
  if (ctx.vars && ctx.vars.has(name)) return ctx.vars.get(name);
  if (name === 'this') return ctx.thisPage || null;
  if (name === 'row') return ctx.data || null;
  const d = ctx.data || {};
  if (Object.prototype.hasOwnProperty.call(d, name)) return d[name];
  const c = canonicalName(name);
  if (Object.prototype.hasOwnProperty.call(d, c)) return d[c];
  return null;
}

const DATE_FIELDS = {
  year: (d) => d.year, month: (d) => d.month, day: (d) => d.day, hour: (d) => d.hour, minute: (d) => d.minute,
  second: (d) => d.second, millisecond: (d) => d.millisecond, week: (d) => d.weekNumber, weekyear: (d) => d.weekYear,
  weekday: (d) => d.weekday, quarter: (d) => d.quarter, epoch: (d) => d.toMillis(), timezone: (d) => d.zoneName,
};
// Without weeks: "8 days" stays 8 days, as Dataview shows it.
const DUR_UNITS = ['years', 'months', 'days', 'hours', 'minutes', 'seconds', 'milliseconds'];

// `obj.name`: an object's field, a linked page's field, a date or duration
// part, or — on a list — that field of every element.
export function field(obj, name, ctx) {
  if (obj == null) return null;
  if (isArray(obj)) {
    const out = obj.map((x) => field(x, name, ctx));
    return out.some(isArray) ? out.flat(1) : out;
  }
  if (isLink(obj)) {
    const page = ctx.index ? ctx.index.page(obj.path) : null;
    return page ? field(page, name, ctx) : null;
  }
  if (isDate(obj)) {
    const f = DATE_FIELDS[name];
    return f ? f(obj) : null;
  }
  if (isDuration(obj)) {
    if (name === 'weeks' || name === 'week') return Math.floor(obj.as('weeks'));
    const unit = DUR_UNITS.find((u) => u === name || u.slice(0, -1) === name);
    return unit ? obj.shiftTo(...DUR_UNITS).normalize().get(unit) : null;
  }
  if (typeof obj === 'string') return name === 'length' ? obj.length : null;
  if (typeof obj === 'object') {
    if (Object.prototype.hasOwnProperty.call(obj, name)) return obj[name] ?? null;
    const c = canonicalName(name);
    if (Object.prototype.hasOwnProperty.call(obj, c)) return obj[c] ?? null;
  }
  return null;
}

function binary(e, ctx) {
  if (e.op === 'and') return truthy(evaluate(e.l, ctx)) && truthy(evaluate(e.r, ctx));
  if (e.op === 'or') return truthy(evaluate(e.l, ctx)) || truthy(evaluate(e.r, ctx));
  return applyOp(e.op, evaluate(e.l, ctx), evaluate(e.r, ctx));
}

export function applyOp(op, a, b) {
  switch (op) {
    case '=': return equals(a, b);
    case '!=': return !equals(a, b);
    case '<': return compare(a, b) < 0;
    case '>': return compare(a, b) > 0;
    case '<=': return compare(a, b) <= 0;
    case '>=': return compare(a, b) >= 0;
    default: break;
  }
  const ta = typeOf(a);
  const tb = typeOf(b);
  if (op === '+') {
    if (ta === 'string' || tb === 'string') return `${a == null ? '' : toText(a)}${b == null ? '' : toText(b)}`;
    if (ta === 'null' || tb === 'null') return null;
    if (ta === 'number' && tb === 'number') return a + b;
    if (ta === 'date' && tb === 'duration') return a.plus(b);
    if (ta === 'duration' && tb === 'date') return b.plus(a);
    if (ta === 'duration' && tb === 'duration') return a.plus(b);
    if (ta === 'array' && tb === 'array') return [...a, ...b];
    if (ta === 'array') return [...a, b];
    if (ta === 'object' && tb === 'object') return { ...a, ...b };
  }
  if (ta === 'null' || tb === 'null') return null;
  if (op === '-') {
    if (ta === 'number' && tb === 'number') return a - b;
    if (ta === 'date' && tb === 'date') return a.diff(b, DUR_UNITS).normalize();
    if (ta === 'date' && tb === 'duration') return a.minus(b);
    if (ta === 'duration' && tb === 'duration') return a.minus(b);
  }
  if (op === '*') {
    if (ta === 'number' && tb === 'number') return a * b;
    if (ta === 'duration' && tb === 'number') return Duration.fromMillis(a.as('milliseconds') * b);
    if (ta === 'number' && tb === 'duration') return Duration.fromMillis(b.as('milliseconds') * a);
  }
  if (op === '/') {
    if (ta === 'number' && tb === 'number') return a / b;
    if (ta === 'duration' && tb === 'number') return Duration.fromMillis(a.as('milliseconds') / b);
    if (ta === 'duration' && tb === 'duration') return a.as('milliseconds') / b.as('milliseconds');
  }
  if (op === '%' && ta === 'number' && tb === 'number') return a % b;
  throw new DataviewError(`Cannot use "${op}" on a ${ta} and a ${tb}`);
}

// Call a lambda (or a built-in passed as a value) with arguments.
export function callValue(fn, args) {
  if (fn && fn.lambda) {
    const vars = new Map(fn.ctx.vars || []);
    fn.params.forEach((p, i) => vars.set(p, args[i] ?? null));
    return evaluate(fn.body, { ...fn.ctx, vars });
  }
  if (typeof fn === 'function') return fn(...args);
  throw new DataviewError('Expected a function, like (x) => x.name');
}

function call(e, ctx) {
  if (e.fn.k === 'var') {
    const name = e.fn.name;
    if (ctx.vars && ctx.vars.has(name)) return callValue(ctx.vars.get(name), e.args.map((a) => evaluate(a, ctx)));
    const f = FUNCTIONS[name.toLowerCase()];
    if (!f) throw new DataviewError(`No function called ${name}()`);
    return f(e.args.map((a) => evaluate(a, ctx)), ctx);
  }
  return callValue(evaluate(e.fn, ctx), e.args.map((a) => evaluate(a, ctx)));
}

// --- functions -------------------------------------------------------------------

// Apply a one-value function to every element when given a list (Dataview
// "vectorizes" most functions this way).
const vec = (f) => (args, ctx) => (isArray(args[0]) ? args[0].map((x) => f([x, ...args.slice(1)], ctx)) : f(args, ctx));

const listOf = (args) => (args.length === 1 && isArray(args[0]) ? args[0] : args);
const nums = (l) => l.filter((x) => typeof x === 'number');
const str = (v) => (v == null ? '' : typeof v === 'string' ? v : toText(v));
const want = (cond, msg) => { if (!cond) throw new DataviewError(msg); };

function regex(p, flags = '') {
  try { return new RegExp(p, flags); } catch { throw new DataviewError(`Not a valid regular expression: ${p}`); }
}

function containsValue(hay, needle, mode) {
  if (hay == null) return false;
  if (isArray(hay)) {
    if (mode === 'exact') return hay.some((x) => equals(x, needle));
    return hay.some((x) => (typeof x === 'string' && typeof needle === 'string'
      ? (mode === 'i' ? x.toLowerCase().includes(needle.toLowerCase()) : x.includes(needle))
      : equals(x, needle) || (isLink(x) && isLink(needle) && x.path === needle.path)));
  }
  if (typeof hay === 'string') {
    if (mode === 'i') return hay.toLowerCase().includes(str(needle).toLowerCase());
    return hay.includes(str(needle));
  }
  if (isLink(hay)) return isLink(needle) ? hay.path === needle.path : hay.path.includes(str(needle));
  if (isObject(hay)) return Object.prototype.hasOwnProperty.call(hay, str(needle));
  return equals(hay, needle);
}

function toDate(v, fmt, ctx) {
  if (v == null) return null;
  if (isDate(v)) return v;
  if (isLink(v)) {
    const page = ctx.index ? ctx.index.page(v.path) : null;
    return page ? page.file.day : null;
  }
  if (typeof v === 'number') return DateTime.fromMillis(v);
  if (typeof v === 'string') {
    if (fmt) {
      const d = DateTime.fromFormat(v, fmt);
      return d.isValid ? d : null;
    }
    return dateLiteral(v.trim());
  }
  return null;
}

const OPERATOR_FNS = { '+': (a, b) => applyOp('+', a, b), '-': (a, b) => applyOp('-', a, b), '*': (a, b) => applyOp('*', a, b), '/': (a, b) => applyOp('/', a, b), '&': (a, b) => truthy(a) && truthy(b), '|': (a, b) => truthy(a) || truthy(b) };

export const FUNCTIONS = {
  // constructors
  object: (args) => {
    const o = {};
    for (let i = 0; i + 1 < args.length; i += 2) o[str(args[i])] = args[i + 1];
    return o;
  },
  list: (args) => [...args],
  array: (args) => [...args],
  date: vec((args, ctx) => toDate(args[0], args[1], ctx)),
  dur: vec((args) => (isDuration(args[0]) ? args[0] : args[0] == null ? null : parseDuration(str(args[0])))),
  number: vec((args) => {
    const v = args[0];
    if (typeof v === 'number') return v;
    const m = /-?\d+(?:\.\d+)?/.exec(str(v));
    return m ? Number(m[0]) : null;
  }),
  string: vec((args) => (args[0] == null ? null : str(args[0]))),
  link: vec((args, ctx) => {
    const v = args[0];
    if (v == null) return null;
    const base = isLink(v) ? v : (() => {
      const rel = ctx.index ? ctx.index.resolve(str(v).replace(/\.md$/i, ''), ctx.thisRel) : null;
      return new Link(rel || (/\.md$/i.test(str(v)) ? str(v) : `${str(v)}.md`));
    })();
    return args[1] != null ? base.withDisplay(str(args[1])) : base;
  }),
  embed: vec((args) => (isLink(args[0]) ? args[0].withEmbed(args[1] == null ? true : truthy(args[1])) : null)),
  elink: (args) => (args[0] == null ? null : `[${args[1] != null ? str(args[1]) : str(args[0])}](${str(args[0])})`),
  typeof: (args) => typeOf(args[0]),

  // numbers
  round: vec((args) => {
    if (typeof args[0] !== 'number') return null;
    const p = 10 ** (Number(args[1]) || 0);
    return Math.round(args[0] * p) / p;
  }),
  trunc: vec((args) => (typeof args[0] === 'number' ? Math.trunc(args[0]) : null)),
  floor: vec((args) => (typeof args[0] === 'number' ? Math.floor(args[0]) : null)),
  ceil: vec((args) => (typeof args[0] === 'number' ? Math.ceil(args[0]) : null)),
  min: (args) => {
    const l = listOf(args).filter((x) => x != null);
    return l.length ? l.reduce((a, b) => (compare(a, b) <= 0 ? a : b)) : null;
  },
  max: (args) => {
    const l = listOf(args).filter((x) => x != null);
    return l.length ? l.reduce((a, b) => (compare(a, b) >= 0 ? a : b)) : null;
  },
  sum: (args) => {
    const l = listOf(args).filter((x) => x != null);
    if (!l.length) return 0;
    return l.reduce((a, b) => applyOp('+', a, b));
  },
  product: (args) => nums(listOf(args)).reduce((a, b) => a * b, 1),
  average: (args) => {
    const l = listOf(args).filter((x) => x != null);
    if (!l.length) return null;
    const total = l.reduce((a, b) => applyOp('+', a, b));
    return applyOp('/', total, l.length);
  },
  reduce: (args) => {
    const [l, op] = args;
    if (!isArray(l) || !l.length) return null;
    const f = typeof op === 'string' ? OPERATOR_FNS[op] : (a, b) => callValue(op, [a, b]);
    want(f, `reduce() does not know the operator "${op}"`);
    return l.reduce((a, b) => f(a, b));
  },
  minby: (args) => {
    const [l, fn] = args;
    if (!isArray(l) || !l.length) return null;
    return l.reduce((a, b) => (compare(callValue(fn, [a]), callValue(fn, [b])) <= 0 ? a : b));
  },
  maxby: (args) => {
    const [l, fn] = args;
    if (!isArray(l) || !l.length) return null;
    return l.reduce((a, b) => (compare(callValue(fn, [a]), callValue(fn, [b])) >= 0 ? a : b));
  },
  currencyformat: (args) => {
    if (typeof args[0] !== 'number') return null;
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: str(args[1] || 'USD') }).format(args[0]); } catch { return String(args[0]); }
  },

  // lists and objects
  contains: (args) => containsValue(args[0], args[1], 'plain'),
  icontains: (args) => containsValue(args[0], args[1], 'i'),
  econtains: (args) => containsValue(args[0], args[1], 'exact'),
  containsword: vec((args) => {
    if (typeof args[0] !== 'string') return false;
    const w = str(args[1]).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return regex(`(^|[^\\p{L}\\p{N}])${w}($|[^\\p{L}\\p{N}])`, 'iu').test(args[0]);
  }),
  length: (args) => {
    const v = args[0];
    if (v == null) return 0;
    if (isArray(v) || typeof v === 'string') return v.length;
    if (isObject(v)) return Object.keys(v).length;
    return 1;
  },
  extract: (args) => {
    const o = {};
    for (const k of args.slice(1)) o[str(k)] = isObject(args[0]) ? args[0][str(k)] ?? null : null;
    return o;
  },
  sort: (args) => {
    if (!isArray(args[0])) return args[0];
    const l = [...args[0]];
    if (args[1] != null) return l.sort((a, b) => compare(callValue(args[1], [a]), callValue(args[1], [b])));
    return l.sort(compare);
  },
  reverse: (args) => (isArray(args[0]) ? [...args[0]].reverse() : typeof args[0] === 'string' ? [...args[0]].reverse().join('') : args[0]),
  nonnull: (args) => listOf(args).filter((x) => x != null),
  unique: (args) => {
    const out = [];
    for (const x of listOf(args)) if (!out.some((y) => equals(x, y))) out.push(x);
    return out;
  },
  flat: (args) => (isArray(args[0]) ? args[0].flat(args[1] == null ? 1 : Number(args[1])) : args[0]),
  slice: (args) => (isArray(args[0]) || typeof args[0] === 'string' ? args[0].slice(args[1] ?? 0, args[2] ?? undefined) : null),
  firstvalue: (args) => listOf(args).find((x) => x != null) ?? null,
  all: (args) => {
    const l = isArray(args[0]) ? args[0] : [args[0]];
    return args[1] != null ? l.every((x) => truthy(callValue(args[1], [x]))) : l.every(truthy);
  },
  any: (args) => {
    const l = isArray(args[0]) ? args[0] : [args[0]];
    return args[1] != null ? l.some((x) => truthy(callValue(args[1], [x]))) : l.some(truthy);
  },
  none: (args) => {
    const l = isArray(args[0]) ? args[0] : [args[0]];
    return args[1] != null ? !l.some((x) => truthy(callValue(args[1], [x]))) : !l.some(truthy);
  },
  filter: (args) => (isArray(args[0]) ? args[0].filter((x) => truthy(callValue(args[1], [x]))) : args[0]),
  map: (args) => (isArray(args[0]) ? args[0].map((x) => callValue(args[1], [x])) : args[0]),
  join: (args) => (isArray(args[0]) ? args[0].map(str).join(args[1] == null ? ', ' : str(args[1])) : str(args[0])),

  // strings
  lower: vec((args) => (typeof args[0] === 'string' ? args[0].toLowerCase() : args[0])),
  upper: vec((args) => (typeof args[0] === 'string' ? args[0].toUpperCase() : args[0])),
  regextest: (args) => regex(str(args[0])).test(str(args[1])),
  regexmatch: (args) => regex(`^(?:${str(args[0])})$`).test(str(args[1])),
  regexreplace: vec((args) => (args[0] == null ? null : str(args[0]).replace(regex(str(args[1]), 'g'), str(args[2])))),
  replace: vec((args) => (args[0] == null ? null : str(args[0]).split(str(args[1])).join(str(args[2])))),
  split: (args) => {
    if (args[0] == null) return [];
    const parts = str(args[0]).split(regex(str(args[1])));
    return args[2] != null ? parts.slice(0, Number(args[2])) : parts;
  },
  startswith: vec((args) => str(args[0]).startsWith(str(args[1]))),
  endswith: vec((args) => str(args[0]).endsWith(str(args[1]))),
  padleft: vec((args) => str(args[0]).padStart(Number(args[1]) || 0, args[2] == null ? ' ' : str(args[2]))),
  padright: vec((args) => str(args[0]).padEnd(Number(args[1]) || 0, args[2] == null ? ' ' : str(args[2]))),
  substring: vec((args) => str(args[0]).substring(Number(args[1]) || 0, args[2] == null ? undefined : Number(args[2]))),
  truncate: vec((args) => {
    const s = str(args[0]);
    const n = Number(args[1]) || 0;
    const suffix = args[2] == null ? '...' : str(args[2]);
    return s.length > n ? s.slice(0, Math.max(0, n - suffix.length)) + suffix : s;
  }),

  // utilities
  default: (args) => {
    const [v, d] = args;
    if (isArray(v)) return v.map((x) => (x == null ? d : x));
    return v == null ? d : v;
  },
  ldefault: (args) => (args[0] == null ? args[1] : args[0]),
  choice: (args) => (truthy(args[0]) ? args[1] : args[2]),
  striptime: vec((args) => (isDate(args[0]) ? args[0].startOf('day') : null)),
  localtime: vec((args) => (isDate(args[0]) ? args[0].toLocal() : null)),
  dateformat: vec((args) => (isDate(args[0]) ? args[0].toFormat(str(args[1])) : null)),
  durationformat: vec((args) => (isDuration(args[0]) ? args[0].toFormat(str(args[1])) : null)),
  meta: vec((args) => (isLink(args[0]) ? { display: args[0].display, embed: args[0].embed, path: args[0].path, subpath: args[0].subpath, type: args[0].type } : null)),
  hash: (args) => {
    let h = 0;
    for (const ch of args.map(str).join('|')) h = (Math.imul(31, h) + ch.codePointAt(0)) | 0;
    return Math.abs(h);
  },
};
