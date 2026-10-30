import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex } from '../lib/dataview/index.mjs';
import { indexToWire, indexFromWire, runScript } from '../lib/dataview/dvjs.mjs';
import { dataArray } from '../lib/dataview/data-array.mjs';
import { toWire, fromWire } from '../lib/dataview/wire.mjs';
import { Link, DateTime, Duration } from '../lib/dataview/values.mjs';

const vault = [
  { rel: 'Work/2026-09-22.md', content: '---\ntarih: 2026-09-22\nsaat: 9\n---\n- [ ] Ship\n- [x] Done\n' },
  { rel: 'Work/2026-09-23.md', content: '---\ntarih: 2026-09-23\nsaat: 0\n---\n- [ ] Call\n' },
  { rel: 'Work/Notes.md', content: '# Notes\n' },
];
// The sandbox only ever sees the vault after a trip through JSON.
const index = indexFromWire(JSON.parse(JSON.stringify(indexToWire(buildIndex(vault)))));
const run = (code) => runScript(code, index, 'Work/Notes.md');

test('values survive the trip to the sandbox', () => {
  const d = DateTime.fromISO('2026-09-22T10:30:00');
  const back = fromWire(JSON.parse(JSON.stringify(toWire({ d, u: Duration.fromObject({ hours: 2 }), l: new Link('A.md', { display: 'a' }), n: [1, 'x', null] }))));
  assert.equal(back.d.toMillis(), d.toMillis());
  assert.equal(back.u.as('minutes'), 120);
  assert.ok(back.l instanceof Link);
  assert.equal(back.l.display, 'a');
  assert.deepEqual(back.n, [1, 'x', null]);
  assert.equal(index.page('Work/2026-09-22.md').file.tasks.length, 2, 'tasks are rebuilt from the list items');
});

test('DataArray: fields of every element, where, sort, groupBy', () => {
  const a = dataArray([{ n: 'b', v: 2, tags: ['x'] }, { n: 'a', v: 1, tags: ['y', 'z'] }]);
  assert.deepEqual(a.n.array(), ['b', 'a']);
  assert.deepEqual(a.tags.array(), ['x', 'y', 'z']);
  assert.deepEqual(a.sort((x) => x.n).n.array(), ['a', 'b']);
  assert.deepEqual(a.sort((x) => x.v, 'desc').v.array(), [2, 1]);
  assert.equal(a.where((x) => x.v > 1).length, 1);
  assert.equal(a[0].n, 'b');
  assert.deepEqual([...a.map((x) => x.v)], [2, 1]);
  assert.equal(a.v.sum(), 3);
  const g = dataArray([1, 2, 3, 4]).groupBy((x) => x % 2);
  assert.deepEqual(g.key.array(), [0, 1]);
  assert.deepEqual(g[0].rows.array(), [2, 4]);
});

test('the Liberio total: pages, where, field lists, paragraph', async () => {
  const r = await run(`const p = dv.pages('"Work"').where(x => x.tarih);
const saatler = p.saat.array().map(Number).filter(n => !isNaN(n));
const toplam = saatler.reduce((a, b) => a + b, 0);
dv.paragraph(\`**Toplam:** \${toplam} saat · **Gün:** \${p.length}\`);`);
  assert.equal(r.error, null);
  assert.deepEqual(r.ops, [{ op: 'paragraph', value: '**Toplam:** 9 saat · **Gün:** 2' }]);
});

test('drawing: header, list, table and task list, with values on the wire', async () => {
  const r = await run(`dv.header(2, "Days");
dv.list(dv.pages('"Work"').file.name);
dv.table(["Day", "Hours"], dv.pages('"Work"').where(p => p.tarih).map(p => [p.file.link, p.saat]));
dv.taskList(dv.pages('"Work"').file.tasks.where(t => !t.completed), false);`);
  assert.equal(r.error, null);
  assert.deepEqual(r.ops.map((o) => o.op), ['header', 'list', 'table', 'tasks']);
  assert.deepEqual(r.ops[1].values, ['2026-09-22', '2026-09-23', 'Notes']);
  assert.equal(fromWire(r.ops[2].rows)[0][0].path, 'Work/2026-09-22.md');
  assert.deepEqual(fromWire(r.ops[3].tasks).map((t) => t.text), ['Ship', 'Call']);
});

test('current page, page lookup, queries, functions and luxon', async () => {
  const r = await run(`dv.paragraph(dv.current().file.name);
dv.paragraph(String(dv.page("2026-09-22").saat));
const q = await dv.query('LIST FROM "Work" WHERE saat > 0');
dv.paragraph(String(q.successful && q.value.values.length));
dv.paragraph(dv.func.upper("ok"));
dv.paragraph(dv.luxon.DateTime.fromISO("2026-01-02").toFormat("dd.MM"));
dv.paragraph(dv.date("2026-03-04").month);`);
  assert.equal(r.error, null);
  assert.deepEqual(r.ops.map((o) => fromWire(o.value)), ['Notes', '9', '1', 'OK', '02.01', 3]);
});

test('errors are reported, and what was drawn before them is kept', async () => {
  const r = await run('dv.paragraph("before"); dv.container.createEl("div");');
  assert.equal(r.ops.length, 1);
  assert.match(r.error, /dv\.container is not available/);
  assert.match((await run('dv.io.load("x")')).error, /cannot read files/);
  assert.match((await run('this is not js')).error, /Unexpected/);
});
