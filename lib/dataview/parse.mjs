// The Dataview query language (DQL): a tokenizer, an expression parser and the
// query parser. Queries look like
//   TABLE WITHOUT ID file.link AS "Day", hours FROM "Work" WHERE hours > 0 SORT file.day DESC
// Pure: returns a plain AST, or throws a DataviewError with a readable message.
import { parseDuration } from './values.mjs';

export class DataviewError extends Error {}

const DATE_WORDS = /^(today|now|tomorrow|yesterday|sow|eow|som|eom|soy|eoy|soq|eoq)$/i;
const DATE_ISO = /^\d{4}-\d{2}(?:-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?)?$/;
const ID_START = /[\p{L}\p{Emoji_Presentation}_]/u;
const ID_PART = /[\p{L}\p{Emoji_Presentation}\p{N}\p{M}_-]/u;
const TAG_PART = /[\p{L}\p{N}_/-]/u;
const OPS = ['=>', '!=', '<=', '>=', '&&', '||', '(', ')', '[', ']', '{', '}', ',', '.', ':', '=', '<', '>', '+', '-', '*', '/', '%', '!', '&', '|'];

export function tokenize(src) {
  const s = String(src);
  const out = [];
  let i = 0;
  const push = (t, v, extra) => out.push({ t, v, at: i, ...extra });
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    const start = i;
    // Links: [[...]] and ![[...]].
    if ((c === '[' && s[i + 1] === '[') || (c === '!' && s[i + 1] === '[' && s[i + 2] === '[')) {
      const embed = c === '!';
      const open = i + (embed ? 3 : 2);
      const close = s.indexOf(']]', open);
      if (close === -1) throw new DataviewError('A link is missing its closing ]]');
      out.push({ t: 'link', v: s.slice(open, close), embed, at: start });
      i = close + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let v = '';
      while (j < s.length && s[j] !== c) {
        if (s[j] === '\\' && j + 1 < s.length) {
          const n = s[j + 1];
          v += n === 'n' ? '\n' : n === 't' ? '\t' : n;
          j += 2;
        } else v += s[j++];
      }
      if (j >= s.length) throw new DataviewError('A string is missing its closing quote');
      out.push({ t: 'str', v, at: start });
      i = j + 1;
      continue;
    }
    if (/\d/.test(c)) {
      const m = /^\d+(?:\.\d+)?/.exec(s.slice(i));
      out.push({ t: 'num', v: Number(m[0]), at: start });
      i += m[0].length;
      continue;
    }
    if (c === '#' && i + 1 < s.length && TAG_PART.test(s[i + 1])) {
      let j = i + 1;
      while (j < s.length && TAG_PART.test(s[j])) j++;
      out.push({ t: 'tag', v: s.slice(i, j), at: start });
      i = j;
      continue;
    }
    if (ID_START.test(c)) {
      let j = i + 1;
      while (j < s.length && ID_PART.test(s[j])) j++;
      // A trailing dash belongs to the operator after it ("a- b").
      while (s[j - 1] === '-') j--;
      const word = s.slice(i, j);
      // date(today), date(2026-10-04), dur(3 days): literals, not calls.
      if ((word === 'date' || word === 'dur') && s[j] === '(') {
        const close = s.indexOf(')', j);
        const inner = close === -1 ? '' : s.slice(j + 1, close).trim();
        if (word === 'date' && (DATE_WORDS.test(inner) || DATE_ISO.test(inner))) {
          out.push({ t: 'date', v: inner, at: start });
          i = close + 1;
          continue;
        }
        if (word === 'dur' && inner && !/["(]/.test(inner) && parseDuration(inner)) {
          out.push({ t: 'dur', v: inner, at: start });
          i = close + 1;
          continue;
        }
      }
      out.push({ t: 'id', v: word, at: start });
      i = j;
      continue;
    }
    const op = OPS.find((o) => s.startsWith(o, i));
    if (!op) throw new DataviewError(`Unexpected character "${c}"`);
    out.push({ t: 'op', v: op, at: start });
    i += op.length;
  }
  out.push({ t: 'eof', v: null, at: s.length });
  return out;
}

const CLAUSES = new Set(['FROM', 'WHERE', 'SORT', 'GROUP', 'FLATTEN', 'LIMIT']);
const HEADERS = new Set(['TABLE', 'LIST', 'TASK', 'CALENDAR']);
const STOP_WORDS = new Set(['AS', 'ASC', 'ASCENDING', 'DESC', 'DESCENDING']);

class Parser {
  constructor(tokens, src) { this.tk = tokens; this.i = 0; this.src = src; }
  peek(o = 0) { return this.tk[Math.min(this.i + o, this.tk.length - 1)]; }
  next() { return this.tk[this.i++]; }
  isOp(v, o = 0) { const t = this.peek(o); return t.t === 'op' && t.v === v; }
  isWord(w, o = 0) { const t = this.peek(o); return t.t === 'id' && t.v.toUpperCase() === w; }
  eatOp(v) { if (this.isOp(v)) { this.i++; return true; } return false; }
  eatWord(w) { if (this.isWord(w)) { this.i++; return true; } return false; }
  expectOp(v) { if (!this.eatOp(v)) throw this.err(`Expected "${v}"`); }
  err(msg) {
    const t = this.peek();
    const near = t.t === 'eof' ? 'at the end' : `near "${this.src.slice(t.at, t.at + 20).split('\n')[0]}"`;
    return new DataviewError(`${msg} ${near}`);
  }
  // A word that ends an expression: a clause keyword or AS / ASC / DESC.
  atStop(o = 0) {
    const t = this.peek(o);
    if (t.t === 'eof') return true;
    if (t.t !== 'id') return false;
    const u = t.v.toUpperCase();
    return CLAUSES.has(u) || STOP_WORDS.has(u);
  }

  // --- expressions ---
  expr() { return this.or(); }
  or() {
    let l = this.and();
    while (this.isWord('OR') || this.isOp('||') || this.isOp('|')) { this.next(); l = { k: 'bin', op: 'or', l, r: this.and() }; }
    return l;
  }
  and() {
    let l = this.cmp();
    while (this.isWord('AND') || this.isOp('&&') || this.isOp('&')) { this.next(); l = { k: 'bin', op: 'and', l, r: this.cmp() }; }
    return l;
  }
  cmp() {
    let l = this.add();
    for (;;) {
      const t = this.peek();
      if (t.t === 'op' && ['=', '!=', '<', '>', '<=', '>='].includes(t.v)) { this.next(); l = { k: 'bin', op: t.v, l, r: this.add() }; } else return l;
    }
  }
  add() {
    let l = this.mul();
    for (;;) {
      const t = this.peek();
      if (t.t === 'op' && (t.v === '+' || t.v === '-')) { this.next(); l = { k: 'bin', op: t.v, l, r: this.mul() }; } else return l;
    }
  }
  mul() {
    let l = this.unary();
    for (;;) {
      const t = this.peek();
      if (t.t === 'op' && ['*', '/', '%'].includes(t.v)) { this.next(); l = { k: 'bin', op: t.v, l, r: this.unary() }; } else return l;
    }
  }
  unary() {
    if (this.eatOp('!')) return { k: 'un', op: '!', e: this.unary() };
    if (this.isWord('NOT') && !this.isOp('(', 1) && !this.isOp('.', 1)) { this.next(); return { k: 'un', op: '!', e: this.unary() }; }
    if (this.eatOp('-')) return { k: 'un', op: '-', e: this.unary() };
    return this.postfix(this.atom());
  }
  postfix(e) {
    for (;;) {
      if (this.isOp('.') && (this.peek(1).t === 'id' || this.peek(1).t === 'num')) {
        this.next();
        const t = this.next();
        e = { k: 'field', obj: e, name: String(t.v) };
      } else if (this.isOp('[')) {
        this.next();
        const idx = this.expr();
        this.expectOp(']');
        e = { k: 'index', obj: e, idx };
      } else if (this.isOp('(') && (e.k === 'var' || e.k === 'field' || e.k === 'lambda')) {
        this.next();
        const args = [];
        if (!this.isOp(')')) {
          do { args.push(this.expr()); } while (this.eatOp(','));
        }
        this.expectOp(')');
        e = { k: 'call', fn: e, args };
      } else return e;
    }
  }
  lambdaAhead() {
    if (!this.isOp('(')) return false;
    let j = 1;
    if (!this.isOp(')', j)) {
      for (;;) {
        if (this.peek(j).t !== 'id') return false;
        j++;
        if (this.isOp(',', j)) { j++; continue; }
        break;
      }
    }
    return this.isOp(')', j) && this.isOp('=>', j + 1);
  }
  atom() {
    const t = this.peek();
    if (t.t === 'num') { this.next(); return { k: 'lit', v: t.v }; }
    if (t.t === 'str') { this.next(); return { k: 'lit', v: t.v }; }
    if (t.t === 'date') { this.next(); return { k: 'datelit', v: t.v }; }
    if (t.t === 'dur') { this.next(); return { k: 'durlit', v: t.v }; }
    if (t.t === 'link') { this.next(); return { k: 'link', inner: t.v, embed: t.embed }; }
    if (t.t === 'tag') { this.next(); return { k: 'lit', v: t.v }; }
    if (this.lambdaAhead()) {
      this.next();
      const params = [];
      while (!this.isOp(')')) { params.push(this.next().v); this.eatOp(','); }
      this.next();
      this.next(); // =>
      return { k: 'lambda', params, body: this.expr() };
    }
    if (this.eatOp('(')) {
      const e = this.expr();
      this.expectOp(')');
      return e;
    }
    if (this.eatOp('[')) {
      const items = [];
      if (!this.isOp(']')) {
        do { items.push(this.expr()); } while (this.eatOp(','));
      }
      this.expectOp(']');
      return { k: 'list', items };
    }
    if (this.eatOp('{')) {
      const entries = [];
      if (!this.isOp('}')) {
        do {
          const key = this.next();
          if (key.t !== 'id' && key.t !== 'str') throw this.err('Expected a key');
          this.expectOp(':');
          entries.push([String(key.v), this.expr()]);
        } while (this.eatOp(','));
      }
      this.expectOp('}');
      return { k: 'obj', entries };
    }
    if (t.t === 'id') {
      this.next();
      const low = t.v.toLowerCase();
      if (low === 'true') return { k: 'lit', v: true };
      if (low === 'false') return { k: 'lit', v: false };
      if (low === 'null') return { k: 'lit', v: null };
      return { k: 'var', name: t.v };
    }
    throw this.err('Expected a value');
  }

  // --- FROM sources ---
  source() {
    let l = this.sourceAnd();
    while (this.isWord('OR')) { this.next(); l = { k: 'or', l, r: this.sourceAnd() }; }
    return l;
  }
  sourceAnd() {
    let l = this.sourceNot();
    while (this.isWord('AND')) { this.next(); l = { k: 'and', l, r: this.sourceNot() }; }
    return l;
  }
  sourceNot() {
    if (this.eatOp('-') || this.eatOp('!')) return { k: 'not', e: this.sourceNot() };
    const t = this.peek();
    if (t.t === 'str') { this.next(); return { k: 'folder', path: t.v }; }
    if (t.t === 'tag') { this.next(); return { k: 'tag', tag: t.v }; }
    if (t.t === 'link') { this.next(); return { k: 'linked', inner: t.v }; }
    if ((this.isWord('OUTGOING') || this.isWord('INCOMING')) && this.isOp('(', 1)) {
      const dir = this.next().v.toLowerCase();
      this.next();
      const l = this.next();
      if (l.t !== 'link') throw this.err(`${dir}() takes a [[link]]`);
      this.expectOp(')');
      return { k: dir === 'outgoing' ? 'outgoing' : 'linked', inner: l.v };
    }
    if (this.eatOp('(')) {
      const e = this.source();
      this.expectOp(')');
      return e;
    }
    throw this.err('Expected a folder ("…"), #tag or [[link]]');
  }

  name() {
    const t = this.next();
    if (t.t !== 'id' && t.t !== 'str') throw this.err('Expected a name');
    return String(t.v);
  }

  textOf(fromTok, toTok) { return this.src.slice(fromTok.at, toTok.at).trim(); }

  query() {
    const h = this.next();
    const type = h.t === 'id' ? h.v.toUpperCase() : '';
    if (!HEADERS.has(type)) throw new DataviewError('A query starts with TABLE, LIST, TASK or CALENDAR');
    const q = { type, withoutId: false, fields: [], source: null, ops: [] };
    if ((type === 'TABLE' || type === 'LIST') && this.isWord('WITHOUT') && this.isWord('ID', 1)) { this.i += 2; q.withoutId = true; }
    if (type === 'TABLE' && !this.atStop()) {
      do {
        const from = this.peek();
        const e = this.expr();
        const text = this.textOf(from, this.peek());
        const as = this.eatWord('AS') ? this.name() : null;
        q.fields.push({ e, name: as != null ? as : text });
      } while (this.eatOp(','));
    } else if (type === 'LIST' && !this.atStop()) {
      q.fields.push({ e: this.expr(), name: 'value' });
    } else if (type === 'CALENDAR') {
      q.fields.push({ e: this.expr(), name: 'date' });
    }
    while (this.peek().t !== 'eof') {
      if (this.eatWord('FROM')) {
        if (q.source) throw this.err('Only one FROM is allowed');
        q.source = this.source();
      } else if (this.eatWord('WHERE')) {
        q.ops.push({ op: 'where', e: this.expr() });
      } else if (this.eatWord('SORT')) {
        const keys = [];
        do {
          const e = this.expr();
          let dir = 1;
          if (this.eatWord('DESC') || this.eatWord('DESCENDING')) dir = -1;
          else if (this.eatWord('ASC') || this.eatWord('ASCENDING')) dir = 1;
          keys.push({ e, dir });
        } while (this.eatOp(','));
        q.ops.push({ op: 'sort', keys });
      } else if (this.isWord('GROUP') && this.isWord('BY', 1)) {
        this.i += 2;
        const from = this.peek();
        const e = this.expr();
        const text = this.textOf(from, this.peek());
        q.ops.push({ op: 'group', e, name: this.eatWord('AS') ? this.name() : null, text });
      } else if (this.eatWord('FLATTEN')) {
        const from = this.peek();
        const e = this.expr();
        const text = this.textOf(from, this.peek());
        q.ops.push({ op: 'flatten', e, name: this.eatWord('AS') ? this.name() : text });
      } else if (this.eatWord('LIMIT')) {
        const n = this.expr();
        q.ops.push({ op: 'limit', e: n });
      } else {
        throw this.err('Expected FROM, WHERE, SORT, GROUP BY, FLATTEN or LIMIT');
      }
    }
    return q;
  }
}

export function parseQuery(src) {
  const text = String(src);
  return new Parser(tokenize(text), text).query();
}

// A FROM source on its own ('"Folder"', '#tag', '[[Note]]'…), as dv.pages() takes it.
export function parseSource(src) {
  const text = String(src);
  if (!text.trim()) return null;
  const p = new Parser(tokenize(text), text);
  const s = p.source();
  if (p.peek().t !== 'eof') throw p.err('Unexpected text');
  return s;
}

export function parseExpression(src) {
  const text = String(src);
  const p = new Parser(tokenize(text), text);
  const e = p.expr();
  if (p.peek().t !== 'eof') throw p.err('Unexpected text');
  return e;
}
