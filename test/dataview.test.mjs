import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, lineFields, inlineValue } from '../lib/dataview/index.mjs';
import { runQuery, runInline } from '../lib/dataview/query.mjs';
import { parseQuery, DataviewError } from '../lib/dataview/parse.mjs';
import { Link, isDate, isDuration, toText, parseDuration, canonicalName } from '../lib/dataview/values.mjs';

const vault = [
  { rel: 'Work/2026-09-22.md', content: '---\ntarih: 2026-09-22\nsaat: 9\nodak: "5"\ntags:\n  - work\n---\n# Day\n\nMood:: good\n\n## Left\n- [ ] Ship the build\n  - [x] Write notes\n- [x] Done thing ✅ 2026-09-22\n- plain item [due:: 2026-10-01]\n' },
  { rel: 'Work/2026-09-23.md', content: '---\ntarih: 2026-09-23\nsaat: 7\ndurum: taslak\ntags: [work, late]\n---\nSee [[2026-09-22]] and [[Ideas#Later|later]].\n\n- [ ] Call Ada 📅 2026-09-30\n' },
  { rel: 'Work/Overview.md', content: '# Overview\n' },
  { rel: 'Ideas.md', content: '---\naliases: [Thoughts]\nrating: 4\nrelated: "[[Work/Overview]]"\n---\n# Ideas\nEffort:: 2 hours\nTags here #idea/small\n\n```js\nfake:: no\n```\n' },
];
const index = buildIndex(vault);
const q = (src, thisRel = 'Work/Overview.md') => runQuery(src, { index, thisRel });

test('frontmatter and inline fields become page fields, with canonical names', () => {
  const p = index.page('Work/2026-09-22.md');
  assert.equal(p.saat, 9);
  assert.equal(p.odak, '5');
  assert.ok(isDate(p.tarih));
  assert.equal(p.tarih.toISODate(), '2026-09-22');
  assert.equal(p.Mood, 'good');
  assert.equal(p.mood, 'good');
  const i = index.page('Ideas.md');
  assert.ok(isDuration(i.effort));
  assert.equal(i.effort.as('minutes'), 120);
  assert.ok(i.related instanceof Link);
  assert.equal(i.related.path, 'Work/Overview.md');
  assert.equal(i.fake, undefined, 'fields inside code blocks are not read');
  assert.deepEqual(i.file.aliases, ['Thoughts']);
});

test('the file object: name, folder, tags with parents, links both ways, day', () => {
  const p = index.page('Work/2026-09-23.md');
  assert.equal(p.file.name, '2026-09-23');
  assert.equal(p.file.folder, 'Work');
  assert.equal(p.file.day.toISODate(), '2026-09-23');
  assert.deepEqual(p.file.etags.sort(), ['#late', '#work']);
  assert.deepEqual(p.file.outlinks.map((l) => l.path), ['Work/2026-09-22.md', 'Ideas.md']);
  assert.deepEqual(index.page('Work/2026-09-22.md').file.inlinks.map((l) => l.path), ['Work/2026-09-23.md']);
  assert.ok(index.page('Ideas.md').file.tags.includes('#idea'));
  assert.ok(index.page('Ideas.md').file.tags.includes('#idea/small'));
});

test('tasks and list items keep their tree, status and dates', () => {
  const p = index.page('Work/2026-09-22.md');
  assert.equal(p.file.tasks.length, 3);
  assert.equal(p.file.lists.length, 4);
  const ship = p.file.tasks[0];
  assert.equal(ship.text, 'Ship the build');
  assert.equal(ship.completed, false);
  assert.equal(ship.children.length, 1);
  assert.equal(ship.children[0].completed, true);
  assert.equal(ship.section.subpath, 'Left');
  assert.equal(p.file.tasks[2].completion.toISODate(), '2026-09-22');
  assert.equal(p.file.lists[3].due.toISODate(), '2026-10-01');
  assert.equal(index.page('Work/2026-09-23.md').file.tasks[0].due.toISODate(), '2026-09-30');
});

test('inline values: numbers, links, dates, durations, lists, text', () => {
  const ctx = { rel: 'Ideas.md', relList: index.relList };
  assert.equal(inlineValue('42', ctx), 42);
  assert.equal(inlineValue('true', ctx), true);
  assert.equal(inlineValue('[[Ideas]]', ctx).path, 'Ideas.md');
  assert.ok(isDate(inlineValue('2026-01-02', ctx)));
  assert.ok(isDuration(inlineValue('3 days', ctx)));
  assert.deepEqual(inlineValue('1, 2, 3', ctx), [1, 2, 3]);
  assert.equal(inlineValue('hello, world', ctx), 'hello, world');
  assert.deepEqual(lineFields('- [ ] task [due:: 2026-01-01] (prio:: high)').map((f) => f.key), ['due', 'prio']);
  assert.deepEqual(lineFields('**Status**:: open').map((f) => [f.key, f.raw]), [['Status', 'open']]);
  assert.deepEqual(lineFields('see https://example.com'), []);
});

test('TABLE: FROM a folder, WITHOUT ID, AS names, WHERE and SORT', () => {
  const r = q('TABLE WITHOUT ID file.link AS "Day", saat AS "Hours", durum FROM "Work" WHERE tarih SORT tarih DESC');
  assert.equal(r.type, 'table');
  assert.equal(r.idColumn, null);
  assert.deepEqual(r.headers, ['Day', 'Hours', 'durum']);
  assert.deepEqual(r.rows.map((x) => [x[0].path, x[1], x[2]]), [['Work/2026-09-23.md', 7, 'taslak'], ['Work/2026-09-22.md', 9, null]]);
});

test('TABLE with the File column and a computed field', () => {
  const r = q('TABLE saat * 2 AS double FROM #work SORT file.name');
  assert.equal(r.idColumn, 'File');
  assert.deepEqual(r.rows.map((x) => x[1]), [18, 14]);
});

test('LIST: plain, with a value, and grouped', () => {
  assert.deepEqual(q('LIST FROM "Work" SORT file.name ASC').items.map((i) => i.id.path), ['Work/2026-09-22.md', 'Work/2026-09-23.md', 'Work/Overview.md']);
  assert.deepEqual(q('LIST saat FROM #work SORT saat').items.map((i) => i.value), [7, 9]);
  const g = q('LIST FROM "Work" WHERE tarih GROUP BY tarih.month');
  assert.equal(g.groups.length, 1);
  assert.equal(g.groups[0].key, 9);
  assert.equal(g.groups[0].items.length, 2);
});

test('TASK: WHERE on tasks, grouped by file, children kept under their task', () => {
  const r = q('TASK FROM "Work" WHERE !completed GROUP BY file.link');
  assert.equal(r.type, 'task');
  assert.deepEqual(r.groups.map((g) => [g.key.path, g.tasks.map((t) => t.text)]), [
    ['Work/2026-09-22.md', ['Ship the build']],
    ['Work/2026-09-23.md', ['Call Ada 📅 2026-09-30']],
  ]);
  assert.equal(r.groups[0].tasks[0].children[0].text, 'Write notes');
  const due = q('TASK WHERE due AND due < date(2026-10-01)');
  assert.deepEqual(due.groups.flatMap((g) => g.tasks.map((t) => t.text)), ['Call Ada 📅 2026-09-30']);
});

test('FROM: tags, links in and out, and/or/not', () => {
  const rels = (src) => q(src).items.map((i) => i.id.path).sort();
  assert.deepEqual(rels('LIST FROM #late'), ['Work/2026-09-23.md']);
  assert.deepEqual(rels('LIST FROM [[2026-09-22]]'), ['Work/2026-09-23.md']);
  assert.deepEqual(rels('LIST FROM outgoing([[2026-09-23]])'), ['Ideas.md', 'Work/2026-09-22.md']);
  assert.deepEqual(rels('LIST FROM "Work" AND -#late'), ['Work/2026-09-22.md', 'Work/Overview.md']);
  assert.deepEqual(rels('LIST FROM #late OR "Ideas"'), ['Ideas.md', 'Work/2026-09-23.md']);
});

test('FLATTEN and LIMIT', () => {
  const r = q('TABLE WITHOUT ID file.name, t FROM #work FLATTEN file.etags AS t SORT file.name, t LIMIT 2');
  assert.deepEqual(r.rows, [['2026-09-22', '#work'], ['2026-09-23', '#late']]);
});

test('functions: strings, lists, dates, lambdas', () => {
  const v = (src) => runInline(src, { index, thisRel: 'Ideas.md' });
  assert.equal(v('length(this.file.aliases)'), 1);
  assert.equal(v('contains(this.file.tags, "#idea")'), true);
  assert.equal(v('upper("ab") + lower("CD")'), 'ABcd');
  assert.deepEqual(v('map([1, 2, 3], (x) => x * 2)'), [2, 4, 6]);
  assert.deepEqual(v('filter([1, 2, 3], (x) => x > 1)'), [2, 3]);
  assert.equal(v('sum([1, 2, 3])'), 6);
  assert.equal(v('round(10 / 3, 2)'), 3.33);
  assert.equal(v('join(["a", "b"], "-")'), 'a-b');
  assert.equal(v('regexreplace("a1b2", "[0-9]", "")'), 'ab');
  assert.equal(v('dateformat(date(2026-09-22), "yyyy/MM/dd")'), '2026/09/22');
  assert.equal(v('(date(2026-09-30) - date(2026-09-22)).days'), 8);
  assert.equal(v('date(2026-09-22) + dur(2 days) = date(2026-09-24)'), true);
  assert.equal(v('default(this.missing, "none")'), 'none');
  assert.equal(v('choice(this.rating > 3, "good", "bad")'), 'good');
  assert.equal(v('this.related.file.name'), 'Overview');
  assert.equal(v('[[Work/2026-09-22]].saat'), 9);
  assert.equal(toText(v('dur(90 minutes)')), '1 hour, 30 minutes');
});

test('parse errors are readable', () => {
  assert.throws(() => parseQuery('TABLE FROM'), DataviewError);
  assert.throws(() => parseQuery('SELECT x'), /starts with TABLE, LIST, TASK or CALENDAR/);
  assert.throws(() => q('TABLE x FROM "Work" WHERE nosuch(1)'), /No function called nosuch/);
});

test('helpers: durations and canonical names', () => {
  assert.equal(parseDuration('1h 30m').as('minutes'), 90);
  assert.equal(parseDuration('nonsense'), null);
  assert.equal(canonicalName('Due Date'), 'due-date');
  assert.equal(canonicalName('**Status**'), 'status');
});
