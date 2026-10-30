// Dataview in notes: ```dataview queries and `= expression` inline queries are
// run against the vault index (lib/dataview) and drawn in place; ```dataviewjs
// scripts run in the sandbox window (main.js) and come back as render ops. The
// index is rebuilt only when the vault or the open note's text changes.
import { buildIndex } from '../lib/dataview/index.mjs';
import { runQuery, runInline } from '../lib/dataview/query.mjs';
import { renderResult, renderValue, renderError } from '../lib/dataview/render.mjs';
import { indexToWire } from '../lib/dataview/dvjs.mjs';
import { fromWire } from '../lib/dataview/wire.mjs';
import { typeOf } from '../lib/dataview/values.mjs';

// getNotes(): [{ rel, content, mtime, ctime, size }] — the vault, with the open
// note's unsaved text. md(src) / mdBlock(src): Markdown as nodes (inline / blocks).
// runJs(payload): the sandbox call. wire(el): bind links and boxes in content
// that arrives after the note was mounted.
export function createDataview({ getNotes, md, mdBlock, runJs, wire }) {
  let cache = { notes: null, index: null, version: 0 };
  let snapshot = { version: -1, data: null };
  let sentVersion = -1;
  const jsResults = new Map(); // `${version}\0${rel}\0${code}` -> { ops, error }

  function index() {
    const notes = getNotes();
    if (cache.notes !== notes || !cache.index) {
      cache = { notes, index: buildIndex(notes), version: cache.version + 1 };
      jsResults.clear();
    }
    return cache.index;
  }

  const opts = () => ({ doc: document, md });

  function block(src, rel) {
    try {
      return renderResult(runQuery(src, { index: index(), thisRel: rel }), opts());
    } catch (err) {
      return renderError(err && err.message ? err.message : String(err), document);
    }
  }

  function inline(expr, rel) {
    const span = document.createElement('span');
    span.className = 'dv-inline';
    try {
      for (const n of renderValue(runInline(expr, { index: index(), thisRel: rel }), opts())) span.append(n);
    } catch (err) {
      span.classList.add('dv-error');
      span.textContent = `Dataview: ${err && err.message ? err.message : err}`;
    }
    return span;
  }

  // --- dataviewjs ---

  function valueNodes(v) {
    if (typeof v === 'string') return md(v);
    return renderValue(v, opts());
  }

  function drawOps(box, res) {
    box.replaceChildren();
    for (const op of res.ops || []) {
      try {
        if (op.op === 'paragraph') {
          const v = fromWire(op.value);
          if (typeof v === 'string') box.append(...mdBlock(v));
          else { const p = document.createElement('p'); p.append(...valueNodes(v)); box.append(p); }
        } else if (op.op === 'header') {
          const h = document.createElement(`h${op.level}`);
          h.append(...valueNodes(fromWire(op.value)));
          box.append(h);
        } else if (op.op === 'span') {
          const s = document.createElement('span');
          s.append(...valueNodes(fromWire(op.value)));
          box.append(s);
        } else if (op.op === 'el') {
          const e = document.createElement(op.tag);
          if (op.cls) e.className = op.cls;
          const v = fromWire(op.value);
          if (v != null) e.append(...valueNodes(v));
          box.append(e);
        } else if (op.op === 'list') {
          const ul = document.createElement('ul');
          ul.className = 'dv-list';
          for (const v of fromWire(op.values) || []) {
            const li = document.createElement('li');
            li.append(...valueNodes(v));
            ul.append(li);
          }
          box.append(ul);
        } else if (op.op === 'table') {
          const rows = (fromWire(op.rows) || []).map((r) => (typeOf(r) === 'array' ? r : [r]));
          box.append(renderResult({ type: 'table', idColumn: null, headers: op.headers || [], rows, count: rows.length }, opts()));
        } else if (op.op === 'tasks') {
          const tasks = (fromWire(op.tasks) || []).filter((t) => t && typeof t === 'object' && typeof t.text === 'string');
          let groups;
          if (op.groupByFile) {
            const by = new Map();
            for (const t of tasks) {
              if (!by.has(t.path)) by.set(t.path, { key: t.link && t.link.toFile ? t.link.toFile() : t.path, tasks: [] });
              by.get(t.path).tasks.push(t);
            }
            groups = [...by.values()];
          } else groups = [{ key: null, tasks }];
          box.append(renderResult({ type: 'task', groups, flat: !op.groupByFile }, opts()));
        } else if (op.op === 'query') {
          box.append(renderResult(fromWire(op.result), opts()));
        }
      } catch (err) {
        box.append(renderError(err && err.message ? err.message : String(err), document));
      }
    }
    if (res.error) box.append(renderError(res.error, document));
    if (wire) wire(box);
  }

  async function runScript(code, rel) {
    const idx = index();
    const version = cache.version;
    if (snapshot.version !== version) snapshot = { version, data: indexToWire(idx) };
    const call = (withSnapshot) => runJs({ version: String(version), snapshot: withSnapshot ? snapshot.data : null, code, thisRel: rel });
    let res = await call(sentVersion !== version);
    if (res && res.needSnapshot) res = await call(true);
    sentVersion = version;
    return res || { ops: [], error: 'The script did not run' };
  }

  function jsBlock(code, rel) {
    const box = document.createElement('div');
    box.className = 'dataview dv-js';
    index();
    const key = `${cache.version}\u0000${rel}\u0000${code}`;
    const done = jsResults.get(key);
    if (done) { drawOps(box, done); return box; }
    box.append(Object.assign(document.createElement('p'), { className: 'dv-empty', textContent: 'Running…' }));
    runScript(code, rel)
      .then((res) => { jsResults.set(key, res); drawOps(box, res); })
      .catch((err) => drawOps(box, { ops: [], error: err && err.message ? err.message : String(err) }));
    return box;
  }

  return {
    index,
    // Options for renderMarkdown, for a note at `rel`.
    optionsFor(rel) {
      return {
        blocks: { dataview: (src) => block(src, rel), dataviewjs: (src) => jsBlock(src, rel) },
        inlineQuery: (expr) => inline(expr, rel),
      };
    },
  };
}
