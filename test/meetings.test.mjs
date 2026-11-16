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

test('todoWhen: the day (and time) an action item names, counted from the meeting', async () => {
  const { todoWhen } = await import('../lib/meetings.mjs');
  const mon = new Date(2026, 10, 16); // Monday 16 Nov 2026
  const w = (t) => todoWhen(t, mon);
  assert.deepEqual(w('Send the deck to Ayşe by Friday'), { date: '2026-11-20', time: '' });
  assert.deepEqual(w('Call the designer tomorrow at 15:00'), { date: '2026-11-17', time: '15:00' });
  assert.deepEqual(w('Book the room for 25 Nov 09:30'), { date: '2026-11-25', time: '09:30' });
  assert.deepEqual(w('meet at 3pm on Wednesday'), { date: '2026-11-18', time: '15:00' });
  assert.deepEqual(w('Monday review'), { date: '2026-11-23', time: '' }, 'the same weekday is a week on');
  assert.deepEqual(w('Nov 3 launch'), { date: '2027-11-03', time: '' }, 'a day already past is next year');
  assert.deepEqual(w('deadline 2026-12-01'), { date: '2026-12-01', time: '' });
  assert.deepEqual(w('day after tomorrow'), { date: '2026-11-18', time: '' });
  // Turkish
  assert.deepEqual(w("yarın 10:00 Ayşe'yi ara"), { date: '2026-11-17', time: '10:00' });
  assert.deepEqual(w('Cumartesi pikniği'), { date: '2026-11-21', time: '' }, 'cumartesi, not cuma');
  assert.deepEqual(w('Pazartesi 14.30 sunum'), { date: '2026-11-23', time: '14:30' }, 'pazartesi, not pazar');
  assert.deepEqual(w('25 Kasım raporu'), { date: '2026-11-25', time: '' });
  // nothing to go on
  assert.equal(w('Review the budget'), null);
  assert.equal(w('Kasım raporunu bitir'), null, 'a month alone is not a day');
  assert.equal(w('at 15:00'), null, 'a time alone is not a day');
  assert.equal(w('the cumulative todays'), null, 'parts of words do not count');
});
