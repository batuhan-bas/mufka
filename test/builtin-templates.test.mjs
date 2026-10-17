import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_TEMPLATES, templateChoices } from '../lib/builtin-templates.mjs';
import { applyTemplate } from '../lib/template.mjs';
import { sanitizeTitle } from '../lib/notespath.mjs';

const date = new Date(2026, 9, 17, 9, 5); // Saturday 17 October 2026, 09:05

test('nine built-in templates, each with a unique id and name', () => {
  assert.deepEqual(BUILTIN_TEMPLATES.map((t) => t.id), ['daily', 'meeting', 'weekly', 'project', 'book', 'recipe', 'habits', 'budget', 'travel']);
  assert.equal(new Set(BUILTIN_TEMPLATES.map((t) => t.name)).size, 9);
});

test('every template fills completely: frontmatter, sections, no title of its own (the note name is the title)', () => {
  for (const t of BUILTIN_TEMPLATES) {
    const title = applyTemplate(t.title, { title: '', date });
    const text = applyTemplate(t.text, { title, date });
    assert.ok(!text.includes('{{'), `${t.id}: unfilled variable`);
    assert.ok(text.startsWith('---\ntype: '), `${t.id}: no frontmatter`);
    assert.match(text, /\n## \S/, `${t.id}: no sections`);
    assert.ok(!/^# /m.test(text), `${t.id}: repeats the note title`);
    assert.ok(title.trim() && sanitizeTitle(title) === title, `${t.id}: suggested name "${title}" is not a clean file name`);
  }
});

test('dates come out as expected', () => {
  const fill = (id) => { const t = BUILTIN_TEMPLATES.find((x) => x.id === id); return applyTemplate(t.text, { title: 'X', date }); };
  assert.match(fill('daily'), /date: 2026-10-17/);
  assert.match(fill('weekly'), /week: 2026-W42/);
  assert.match(fill('budget'), /month: 2026-10/);
  assert.match(fill('meeting'), /- \*\*When:\*\* Saturday, 17 October 2026 · 09:05/);
  assert.equal(applyTemplate(BUILTIN_TEMPLATES.find((x) => x.id === 'meeting').title, { date }), '2026-10-17 Meeting');
});

test('templates in the vault come first and take the place of a built-in one by name', () => {
  const list = templateChoices([{ rel: 'Templates/Recipe.md', title: 'Recipe' }, { rel: 'Templates/Mine.md', title: 'Mine' }]);
  assert.deepEqual(list.slice(0, 2), [{ kind: 'vault', rel: 'Templates/Recipe.md', name: 'Recipe' }, { kind: 'vault', rel: 'Templates/Mine.md', name: 'Mine' }]);
  assert.equal(list.filter((c) => c.name === 'Recipe').length, 1);
  assert.equal(list.length, 2 + 8);
});

test('every checklist line is a real checkbox (no empty "- [ ]")', async () => {
  const { parseMarkdown } = await import('../lib/mdparse.mjs');
  const texts = (node, out = []) => { if (node.type === 'text') out.push(node.value); for (const c of node.children || []) texts(c, out); return out; };
  for (const t of BUILTIN_TEMPLATES) {
    const md = applyTemplate(t.text, { title: 'X', date });
    assert.ok(!texts(parseMarkdown(md)).some((v) => v.trim() === '[ ]'), `${t.id}: an empty task shows as text`);
  }
});
