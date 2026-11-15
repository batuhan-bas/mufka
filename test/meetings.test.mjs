import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meetingOf, meetingTodos, isMeetingNote } from '../lib/meetings.mjs';
import { meetingNote } from '../lib/wispr.mjs';

const note = [
  '---', 'type: meeting', 'date: 2026-11-16', 'time: 10:00', 'attendees: [Ayşe, "[[Mert]]", Can]', '---',
  '## Agenda', '1. Plan', '',
  '## Action items', '- [x] **Ayşe** — book the room', '- [ ] **Mert** — release notes', '- [ ] Follow up', '',
  '## Notes', '- [ ] not an action item', '',
].join('\n');

test('a meeting from the template: when, who, action items', () => {
  assert.deepEqual(meetingOf('Meetings/Plan.md', note), {
    rel: 'Meetings/Plan.md', date: '2026-11-16', time: '10:00', attendees: ['Ayşe', 'Mert', 'Can'], actions: { done: 1, total: 3 },
  });
  assert.deepEqual(meetingTodos(note).map((t) => t.text), ['**Mert** — release notes', 'Follow up']);
  assert.equal(note.split('\n')[meetingTodos(note)[1].line], '- [ ] Follow up');
  assert.equal(meetingOf('a.md', '---\ntype: book\n---\n'), null);
  assert.equal(isMeetingNote('# Notes\n\n## Action items\n- [ ] x\n'), false);
});

test('a meeting from Wispr Flow: its Tasks are the action items', () => {
  const w = meetingNote({ id: 'm1', title: 'Planning', start: '2026-11-16T07:00:00Z', end: '2026-11-16T07:45:00Z', attendees: ['Ayşe', 'Can'], todos: ['Send the deck', { text: 'Book the room', done: true }] }, { timeZone: 'Europe/Istanbul' });
  const m = meetingOf('Meetings/Planning.md', w);
  assert.deepEqual([m.date, m.time, m.attendees, m.actions], ['2026-11-16', '10:00–10:45', ['Ayşe', 'Can'], { done: 1, total: 2 }]);
  assert.deepEqual(meetingTodos(w).map((t) => t.text), ['Send the deck']);
});
