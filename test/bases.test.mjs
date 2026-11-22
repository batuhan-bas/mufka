import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { buildIndex } from '../lib/dataview/index.mjs';
import { parseBase, runBase, runView, propLabel, editableKey, cellInput, newNoteDefaults } from '../lib/bases/base.mjs';
import { parseExpr, evaluate, textOf, BaseError } from '../lib/bases/expr.mjs';

const now = DateTime.fromISO('2026-11-22T10:00:00');
const md = (props, body = '') => `---\n${props}\n---\n${body}`;
const notes = [
  { rel: 'Books/Sapiens.md', content: md('tags: [book]\nauthor: Yuval Noah Harari\nstatus: Reading\nstarted: 2026-11-02\nrating: 4\npages: 443'), mtime: Date.parse('2026-11-20') },
  { rel: 'Books/Dune.md', content: md('tags: [book]\nauthor: Frank Herbert\nstatus: To read\npages: 412'), mtime: Date.parse('2026-11-01') },
  { rel: 'Books/The Hobbit.md', content: md('tags: [book, classic]\nauthor: J. R. R. Tolkien\nstatus: Finished\nfinished: 2026-10-30\nrating: 5\npages: 310', 'See [[Dune]].'), mtime: Date.parse('2026-10-30') },
  { rel: 'Books/Old/1984.md', content: md('tags: [book/classic]\nauthor: George Orwell\nstatus: Finished\nfinished: 2025-12-01\nrating: 5\npages: 328'), mtime: Date.parse('2025-12-01') },
  { rel: 'Notes/Idea.md', content: md('status: Finished'), mtime: Date.parse('2026-11-21') },
];
const index = buildIndex(notes);
const run = (yaml, which, thisRel = 'Books/Books.base') => runBase(yaml, which, index, { thisRel, now });
const titles = (r) => r.groups.flatMap((g) => g.rows.map((x) => x.title));

test('filters: tags (nested too), folders, and / or / not, comparisons', () => {
  assert.deepEqual(titles(run('filters:\n  and:\n    - file.hasTag("book")\n')), ['1984', 'Dune', 'Sapiens', 'The Hobbit']);
  // "book/classic" is under #book, not under #classic.
  assert.deepEqual(titles(run('filters: file.hasTag("classic")')), ['The Hobbit']);
  assert.deepEqual(titles(run('filters:\n  and:\n    - file.inFolder("Books")\n    - not:\n        - file.inFolder("Books/Old")\n')), ['Dune', 'Sapiens', 'The Hobbit']);
  assert.deepEqual(titles(run('filters:\n  or:\n    - status == "Reading"\n    - rating > 4 && file.folder == "Books"\n')), ['Sapiens', 'The Hobbit']);
  assert.deepEqual(titles(run('filters: \'status != "Finished" && file.hasTag("book")\'')), ['Dune', 'Sapiens']);
  assert.deepEqual(titles(run('filters: file.mtime > now() - "1 week"')), ['Idea', 'Sapiens']);
  assert.deepEqual(titles(run('filters: file.hasLink("Dune")')), ['The Hobbit']);
});

test('views: columns, sort, limit, view filters, display names', () => {
  const base = `
filters: file.hasTag("book")
properties:
  note.rating:
    displayName: Stars
views:
  - type: table
    name: All
    order: [file.name, author, note.rating, file.folder]
    sort:
      - property: rating
        direction: DESC
      - property: file.name
        direction: ASC
  - type: cards
    name: Unread
    filters: 'status == "To read"'
    limit: 1
`;
  const r = run(base);
  assert.equal(r.view.name, 'All');
  assert.deepEqual(r.columns.map((c) => `${c.key}:${c.label}`), ['file.name:Name', 'note.author:author', 'note.rating:Stars', 'file.folder:Folder']);
  assert.deepEqual(titles(r), ['1984', 'The Hobbit', 'Sapiens', 'Dune']);
  const row = r.groups[0].rows[0];
  assert.equal(textOf(row.values['file.name']), '1984');
  assert.equal(row.values['file.name'].path, 'Books/Old/1984.md');
  assert.equal(row.values['file.folder'], 'Books/Old');
  const u = run(base, 'Unread');
  assert.equal(u.view.type, 'cards');
  assert.deepEqual(titles(u), ['Dune']);
  assert.equal(u.total, 1);
  assert.equal(run(base, 1).view.name, 'Unread');
});

test('formulas: arithmetic, other formulas, dates and durations, if(), methods', () => {
  const base = `
filters: file.hasTag("book")
formulas:
  per_star: 'if(rating, (pages / rating).toFixed(1))'
  long: 'pages > 400'
  label: 'author.split(" ").slice(-1)[0].upper() + " · " + formula.long'
  days: '(now() - started).days'
  due: '(date("2026-01-31") + "1M").format("YYYY-MM-DD")'
views:
  - type: table
    order: [file.name, formula.per_star, formula.label, formula.days, formula.due]
`;
  const r = run(base);
  const by = Object.fromEntries(r.groups[0].rows.map((x) => [x.title, x.values]));
  assert.equal(by['Sapiens']['formula.per_star'], '110.8');
  assert.equal(by['Dune']['formula.per_star'], null);
  assert.equal(by['Dune']['formula.label'], 'HERBERT · true');
  assert.equal(by['Sapiens']['formula.days'], 20);
  assert.equal(by['Sapiens']['formula.due'], '2026-02-28');
  assert.match(run('formulas:\n  a: formula.b\n  b: formula.a\nviews:\n  - order: [formula.a]\n').error, /uses itself/);
});

test('group by, group order, summaries (built-in and custom)', () => {
  const base = `
filters: file.hasTag("book")
summaries:
  rounded: 'values.mean().round(1)'
views:
  - type: table
    order: [file.name, rating, pages]
    groupBy:
      property: status
      direction: ASC
    summaries:
      rating: Average
      pages: Sum
  - type: table
    name: Two groups
    groupBy: { property: status }
    groupOrder: [Reading, Finished]
    summaries:
      pages: rounded
`;
  const r = run(base);
  assert.deepEqual(r.groups.map((g) => `${g.label}:${g.rows.map((x) => x.title).join('+')}`), ['Finished:1984+The Hobbit', 'Reading:Sapiens', 'To read:Dune']);
  assert.deepEqual(r.summaries['note.rating'], { name: 'Average', value: 4.67 });
  assert.deepEqual(r.summaries['note.pages'], { name: 'Sum', value: 1493 });
  assert.equal(r.groups[0].summaries['note.pages'].value, 638);
  const t = run(base, 'Two groups');
  assert.deepEqual(t.groups.map((g) => g.label), ['Reading', 'Finished']);
  assert.equal(t.summaries['note.pages'].value, 373.3);
});

test('this: the base file, or the note it is embedded in', () => {
  assert.deepEqual(titles(run('filters: file.inFolder(this.file.folder)\n', null, 'Books/Old/Shelf.base')), ['1984']);
  assert.deepEqual(titles(run('filters: file.hasLink(this)\n', null, 'Books/Dune.md')), ['The Hobbit']);
  assert.deepEqual(titles(run('filters: status == this.status && file.name != this.file.name\n', null, 'Books/The Hobbit.md')), ['1984', 'Idea']);
});

test('expressions on their own', () => {
  const ctx = { note: () => undefined, file: null, formula: () => null, now };
  const ev = (s) => evaluate(parseExpr(s), ctx);
  assert.equal(ev('1 + 2 * 3'), 7);
  assert.equal(ev('(10 % 4) - -1'), 3);
  assert.equal(ev('"a:b:c".replace(/:/g, "-")'), 'a-b-c');
  assert.equal(ev('[1, 2, 3, 4].filter(value > 2).map(value * 10).join("|")'), '30|40');
  assert.equal(ev('[1, 2, 3].reduce(acc + value, 0)'), 6);
  assert.equal(ev('"hello world".title()'), 'Hello World');
  assert.equal(ev('today().format("DD.MM.YYYY")'), '22.11.2026');
  assert.equal(ev('(3.14159).round(2)'), 3.14);
  assert.equal(ev('list("x").length'), 1);
  assert.equal(ev('!"" && true'), true);
  assert.equal(ev('date("2026-11-22") == today()'), true);
  assert.throws(() => parseExpr('1 +'), BaseError);
  assert.throws(() => evaluate(parseExpr('nope()'), ctx), /Unknown function/);
});

test('errors read as messages; defaults; editable columns', () => {
  assert.match(run('views: [').error, /not valid YAML/);
  assert.match(run('filters: file.hasTag(').error, /Expected|ends too soon/);
  const r = run('');
  assert.deepEqual(r.columns.map((c) => c.key), ['file.name']);
  assert.equal(r.total, 5);
  assert.equal(parseBase('views:\n  - type: cards\n').views[0].name, 'Table');
  assert.equal(propLabel(parseBase(''), 'file.mtime'), 'Modified');
  assert.equal(editableKey('note.rating'), 'rating');
  assert.equal(editableKey('rating'), 'rating');
  assert.equal(editableKey('file.name'), null);
  assert.equal(editableKey('formula.x'), null);
});

test('typed cells, and what a new note from a view gets', () => {
  assert.equal(cellInput(3, '4'), 4);
  assert.equal(cellInput('x', '2.5'), 2.5);
  assert.equal(cellInput('x', 'Reading'), 'Reading');
  assert.deepEqual(cellInput(['a'], 'a, b ,'), ['a', 'b']);
  assert.equal(cellInput(false, 'true'), true);
  const config = parseBase('filters:\n  and:\n    - file.inFolder("Books/")\n    - file.hasTag("book")\nviews:\n  - name: Reading\n    filters: \'status == "Reading"\'\n  - name: Rated\n    filters:\n      or:\n        - rating == 5\n');
  assert.deepEqual(newNoteDefaults(config, 'Reading', 'X'), { folder: 'Books', props: [['tags', ['book']], ['status', 'Reading']] });
  assert.deepEqual(newNoteDefaults(config, 'Rated', 'X'), { folder: 'Books', props: [['tags', ['book']]] });
  assert.deepEqual(newNoteDefaults(parseBase('filters: rating == 5'), 0, 'Here'), { folder: 'Here', props: [['rating', 5]] });
});
