import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readProps, setProp, deleteProp, renameProp, propType, aliasesOf, defaultValue } from '../lib/properties.mjs';

const NOTE = '---\n# kept comment\nstatus: active\ntags: [work, q4]\ndone: false\ncount: 3\ndate: 2026-11-01\n---\n# Body\ntext';

test('properties are read with a type for the editor', () => {
  const { props } = readProps(NOTE);
  assert.deepEqual(props.map((p) => [p.key, p.type]), [['status', 'text'], ['tags', 'tags'], ['done', 'checkbox'], ['count', 'number'], ['date', 'date']]);
  assert.deepEqual(props[1].value, ['work', 'q4']);
  assert.equal(readProps('no frontmatter').has, false);
  assert.ok(readProps('---\na: [unclosed\n---\n').error);
  assert.equal(propType('when', '2026-11-01 09:30'), 'datetime');
  assert.equal(propType('aliases', 'x'), 'list');
});

test('setting a value keeps the rest: order, comments, inline lists, the body', () => {
  const out = setProp(NOTE, 'status', 'done');
  assert.equal(out, NOTE.replace('status: active', 'status: done'));
  const out2 = setProp(NOTE, 'tags', ['work', 'q4', 'yeni']);
  assert.match(out2, /^tags: \[work, q4, yeni\]$/m);
  assert.ok(out2.includes('# kept comment') && out2.endsWith('---\n# Body\ntext'));
  assert.match(setProp(NOTE, 'done', true), /^done: true$/m);
});

test('a new property is added at the end; a note without properties gets them', () => {
  assert.match(setProp(NOTE, 'owner', 'Ayşe'), /date: 2026-11-01\nowner: Ayşe\n---/);
  assert.equal(setProp('# Title\n', 'tags', ['a']), '---\ntags:\n  - a\n---\n# Title\n');
  assert.match(setProp(NOTE, 'zip', '01234'), /zip: "01234"/, 'text that looks like a number stays text');
});

test('delete and rename', () => {
  assert.equal(deleteProp(NOTE, 'count'), NOTE.replace('count: 3\n', ''));
  assert.equal(deleteProp('---\na: 1\n---\nbody', 'a'), 'body', 'the last property takes the --- lines with it');
  assert.equal(renameProp(NOTE, 'status', 'durum'), NOTE.replace('status:', 'durum:'));
  assert.throws(() => renameProp(NOTE, 'status', 'tags'), /already/);
});

test('aliases, and default values', () => {
  assert.deepEqual(aliasesOf('---\naliases: [Bir, İki]\n---\n'), ['Bir', 'İki']);
  assert.deepEqual(aliasesOf('---\nalias: Tek\n---\n'), ['Tek']);
  assert.deepEqual(aliasesOf('---\naliases:\n  - A\n  -\n---\n'), ['A']);
  assert.deepEqual(aliasesOf('# none'), []);
  assert.deepEqual(defaultValue('tags'), []);
  assert.equal(defaultValue('owner'), '');
});

test('[[alias]] resolves to the note that has it; a real name wins', async () => {
  const { resolveLink } = await import('../lib/notestree.mjs');
  const { buildBacklinkIndex, backlinksFor } = await import('../lib/backlinks.mjs');
  const notes = [
    { rel: 'Work/Project Atlas.md', content: '---\naliases: [Atlas, PA]\n---\nbody' },
    { rel: 'Atlas Book.md', content: 'see [[pa]] and [[Atlas]]' },
    { rel: 'Atlas.md', content: 'a real note named Atlas' },
  ];
  const list = notes.map((n) => ({ rel: n.rel, aliases: (n.content.match(/aliases: \[(.*)\]/) || [, ''])[1].split(', ').filter(Boolean) }));
  assert.equal(resolveLink('pa', '', list), 'Work/Project Atlas.md');
  assert.equal(resolveLink('Atlas', '', list), 'Atlas.md');
  const idx = buildBacklinkIndex(notes);
  assert.deepEqual(backlinksFor(idx, 'Work/Project Atlas.md').map((b) => b.rel), ['Atlas Book.md']);
});

test('a list that was empty is written one item per line', () => {
  const start = setProp('# x\n', 'aliases', []);
  assert.equal(start, '---\naliases: []\n---\n# x\n');
  assert.equal(setProp(start, 'aliases', ['A']), '---\naliases:\n  - A\n---\n# x\n');
});
