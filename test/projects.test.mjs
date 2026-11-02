import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectsSettings, taskProgress, projectOf, daysLeft, projectColumns, projectStats } from '../lib/projects.mjs';

const P = (status, due = '', tasks = '- [x] a\n- [ ] b\n  - [x] c') => `---\ntype: project\nstatus: ${status}\nstart: 2026-10-01\ndue: ${due}\n---\n## Tasks\n${tasks}\n\`\`\`\n- [ ] in code\n\`\`\`\n`;
const NOW = new Date(2026, 10, 2, 12);

test('settings and progress', () => {
  assert.deepEqual(projectsSettings('folder: /Projects/\ntemplate: Mine'), { folder: 'Projects', template: 'Mine' });
  assert.deepEqual(taskProgress(P('active')), { done: 2, total: 3 });
  assert.deepEqual(taskProgress('1. [x] a\n> - [ ] b'), { done: 1, total: 2 });
});

test('projectOf: status named as the board names it', () => {
  const p = projectOf('Projects/Site.md', P('active', '2026-11-20'));
  assert.equal(p.status, 'Active');
  assert.equal(p.due, '2026-11-20');
  assert.equal(p.total, 3);
  assert.equal(projectOf('x', P('on hold')).status, 'On hold');
  assert.equal(projectOf('x', P('')).status, 'Planning');
  assert.equal(projectOf('x', P('Blocked')).status, 'Blocked');
  assert.equal(projectOf('x', '---\ntype: book\n---\n'), null);
  assert.equal(projectOf('x', '# no'), null);
});

test('daysLeft, columns and numbers', () => {
  assert.equal(daysLeft('2026-11-05', NOW), 3);
  assert.equal(daysLeft('2026-10-30', NOW), -3);
  assert.equal(daysLeft('', NOW), null);
  const ps = [projectOf('a', P('active', '2026-11-20')), projectOf('b', P('active', '2026-11-04')), projectOf('c', P('Blocked')), projectOf('d', P('done', '2026-10-01')), projectOf('e', P('planning', '2026-10-30'))];
  const cols = projectColumns(ps);
  assert.deepEqual(cols.map((c) => c.stage), ['Planning', 'Active', 'On hold', 'Blocked', 'Done']);
  assert.deepEqual(cols[1].items.map((p) => p.rel), ['b', 'a']);
  assert.deepEqual(projectStats(ps, NOW), { active: 2, dueSoon: 1, late: 1, done: 1, total: 5 });
});
