import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectTasks, parseTaskLine, dateRange, runTasksQuery, completeTaskLine } from '../lib/tasks-query.mjs';

const today = new Date(2026, 10, 22); // Sunday 22 November 2026
const notes = [
  { rel: 'Freelance.md', content: '---\ntags: [work]\n---\n# Clients\n- [ ] Send the invoice to Acme ⏫ 📅 2026-11-18\n- [x] Old thing ✅ 2026-11-01\n```\n- [ ] not a task, in code\n```\n' },
  { rel: 'Projects/Website.md', content: '## Hosting\n- [ ] Renew the domain #admin 🔁 every year 📅 2026-11-20\n  - [ ] A sub-task 📅 2026-11-30\n' },
  { rel: 'Projects/Mufka 1.14.md', content: '- [ ] Write the release notes 🔼 📅 2026-11-22\n- [/] Review the Bases PR 📅 2026-11-26 ⏳ 2026-11-25\n- [-] Dropped idea ❌ 2026-11-10\n' },
  { rel: 'Personal.md', content: '- [ ] Call the bank 🔽 📅 2026-11-26\n- [ ] Someday #later\n- [ ] Starts later 🛫 2026-12-01 📅 2026-12-05\n' },
];
const tasks = collectTasks(notes);
const run = (q) => runTasksQuery(q, tasks, today);
const names = (r) => r.groups.flatMap((g) => g.tasks.map((t) => t.description));

test('reading task lines in the emoji format', () => {
  const t = parseTaskLine('- [ ] Renew the domain #admin ⏫ 🔁 every year 📅 2026-11-20 ⏳ 2026-11-19', { rel: 'A/B.md', heading: 'Hosting' });
  assert.equal(t.description, 'Renew the domain #admin');
  assert.equal(t.priority, 'high');
  assert.equal(t.recurrence, 'every year');
  assert.equal(t.due, '2026-11-20');
  assert.equal(t.scheduled, '2026-11-19');
  assert.equal(t.happens, '2026-11-19');
  assert.deepEqual(t.tags, ['#admin']);
  assert.equal(t.folder, 'A/');
  assert.equal(t.statusType, 'TODO');
  assert.equal(parseTaskLine('- [/] x').statusType, 'IN_PROGRESS');
  assert.equal(parseTaskLine('just text'), null);
  assert.equal(tasks.length, 10);
  assert.ok(!tasks.some((x) => x.description.includes('in code')));
  assert.equal(tasks.find((x) => x.description === 'Send the invoice to Acme').heading, 'Clients');
});

test('dates in words', () => {
  assert.deepEqual(dateRange('today', today), { from: '2026-11-22', to: '2026-11-22' });
  assert.deepEqual(dateRange('next monday', today), { from: '2026-11-23', to: '2026-11-23' });
  assert.deepEqual(dateRange('last friday', today), { from: '2026-11-20', to: '2026-11-20' });
  assert.deepEqual(dateRange('this week', today), { from: '2026-11-16', to: '2026-11-22' });
  assert.deepEqual(dateRange('next month', today), { from: '2026-12-01', to: '2026-12-31' });
  assert.deepEqual(dateRange('in two weeks', today), { from: '2026-12-06', to: '2026-12-06' });
  assert.deepEqual(dateRange('3 days ago', today), { from: '2026-11-19', to: '2026-11-19' });
  assert.deepEqual(dateRange('2026-W48', today), { from: '2026-11-23', to: '2026-11-29' });
  assert.deepEqual(dateRange('2026-11-01 2026-11-15', today), { from: '2026-11-01', to: '2026-11-15' });
  assert.equal(dateRange('whenever', today), null);
});

test('filters: status, dates, priority, tags, paths, text, sub-items', () => {
  assert.deepEqual(names(run('done')), ['Old thing', 'Dropped idea']);
  assert.equal(run('not done').total, 8);
  assert.deepEqual(names(run('not done\ndue before today')), ['Send the invoice to Acme', 'Renew the domain #admin']);
  assert.deepEqual(names(run('due today')), ['Write the release notes']);
  assert.deepEqual(names(run('due on or before 2026-11-22\nnot done\nsort by due')), ['Send the invoice to Acme', 'Renew the domain #admin', 'Write the release notes']);
  assert.deepEqual(names(run('scheduled after yesterday')), ['Review the Bases PR']);
  // "Starts later" has not started; tasks without a start date have.
  assert.equal(names(run('not done\nstarts before next week')).length, 7);
  assert.deepEqual(names(run('happens on 2026-11-25')), ['Review the Bases PR']);
  assert.deepEqual(names(run('priority is above none')), ['Send the invoice to Acme', 'Write the release notes']);
  assert.deepEqual(names(run('priority is low')), ['Call the bank']);
  assert.deepEqual(names(run('tags include #admin')), ['Renew the domain #admin']);
  assert.deepEqual(names(run('tag does not include admin\nhas tags')), ['Someday #later']);
  assert.deepEqual(names(run('path includes projects/\nnot done\nexclude sub-items\nsort by description')), ['Renew the domain #admin', 'Review the Bases PR', 'Write the release notes']);
  assert.deepEqual(names(run('heading includes host\nis recurring')), ['Renew the domain #admin']);
  assert.deepEqual(names(run('description regex matches /^call/i')), ['Call the bank']);
  assert.deepEqual(names(run('no due date\nnot done')), ['Someday #later']);
  assert.deepEqual(names(run('status.type is IN_PROGRESS')), ['Review the Bases PR']);
});

test('AND / OR / NOT, sort, group, limit', () => {
  assert.deepEqual(names(run('(due today) OR (priority is high)\nsort by priority')), ['Send the invoice to Acme', 'Write the release notes']);
  assert.deepEqual(names(run('not done\n(path includes Personal) AND NOT (tags include later)\nsort by due reverse')), ['Starts later', 'Call the bank']);
  assert.deepEqual(names(run('NOT (done)\n(due after 2026-11-25) XOR (path includes Personal)')), ['Review the Bases PR', 'A sub-task', 'Someday #later']);
  const g = run('not done\nhas due date\ngroup by due\nlimit 6');
  assert.deepEqual(g.groups.map((x) => `${x.label}:${x.tasks.length}`), ['Overdue:2', '2026-11-22:1', '2026-11-26:2', '2026-11-30:1']);
  assert.equal(g.total, 7);
  assert.equal(g.shown, 6);
  assert.deepEqual(run('group by filename\nlimit groups 1').groups.map((x) => `${x.label}:${x.tasks.length}`), ['Freelance:1', 'Mufka 1.14:1', 'Personal:1', 'Website:1']);
  assert.deepEqual(run('not done\ngroup by tags').groups.map((x) => x.label), ['#admin', '#later', '(No tags)']);
  assert.ok(run('hide due date').hide.has('due date'));
});

test('errors name the line; ticking adds and removes the done date', () => {
  assert.match(run('not done\ngroup by urgency').error, /group by urgency.*line 2/);
  assert.match(run('due sometime soon').error, /could not read the date/);
  assert.match(run('wibble').error, /could not read "wibble" \(line 1\)/);
  assert.match(run('(not done').error, /not closed/);
  assert.equal(completeTaskLine('- [ ] Pay rent 📅 2026-11-30', true, '2026-11-22'), '- [x] Pay rent 📅 2026-11-30 ✅ 2026-11-22');
  assert.equal(completeTaskLine('- [x] Pay rent 📅 2026-11-30 ✅ 2026-11-22', false, '2026-11-23'), '- [ ] Pay rent 📅 2026-11-30');
  assert.equal(completeTaskLine('  - [ ] plain', true, '2026-11-22'), '  - [x] plain');
});
