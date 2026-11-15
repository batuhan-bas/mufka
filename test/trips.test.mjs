import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tripOf, tripTime, tripDays } from '../lib/trips.mjs';
import { BUILTIN_TEMPLATES } from '../lib/builtin-templates.mjs';

const trip = (props, body = '') => `---\ntype: trip\n${props}\n---\n${body}`;

test('a trip: where, when, packing and bookings', () => {
  const body = [
    '## Bookings', '| What | Details | Confirmation | Done |', '|---|---|---|---|',
    '| ✈️ Flight | IST → LIS | XK29 | ✅ |', '| 🏨 Stay | Alfama | 88 | yes |', '| 🚗 Car | | | |', '| 🛡️ Insurance | | | no |', '',
    '## Packing list', '**Documents**', '- [x] Passport', '- [x] Tickets', '- [ ] Adapter', '',
    '## Places to see', '- [ ] Not packing',
  ].join('\n');
  assert.deepEqual(tripOf('Trips/Lisbon.md', trip('destination: Lisbon, Portugal\nfrom: 2026-11-27\nto: 2026-12-03', body)), {
    rel: 'Trips/Lisbon.md', destination: 'Lisbon, Portugal', from: '2026-11-27', to: '2026-12-03',
    packing: { done: 2, total: 3 }, bookings: { done: 2, total: 4 },
  });
  assert.equal(tripOf('a.md', '---\ntype: book\n---\n'), null);
});

test('before, during and after the trip', () => {
  const t = { from: '2026-11-27', to: '2026-12-03' };
  const at = (m, d) => tripTime(t, new Date(2026, m, d, 15));
  assert.deepEqual(at(10, 15), { when: 'before', days: 12 });
  assert.deepEqual(at(10, 26), { when: 'before', days: 1 });
  assert.deepEqual(at(10, 27), { when: 'during', day: 1, of: 7 });
  assert.deepEqual(at(11, 3), { when: 'during', day: 7, of: 7 });
  assert.deepEqual(at(11, 5), { when: 'after', days: 2 });
  assert.equal(tripTime({ from: '', to: '' }), null);
  // A day trip (no end date).
  assert.deepEqual(tripTime({ from: '2026-11-27', to: '' }, new Date(2026, 10, 27, 9)), { when: 'during', day: 1, of: 1 });
  assert.equal(tripDays(t), 7);
  assert.equal(tripDays({ from: '2026-11-27', to: '' }), 0);
});

test('the Travel plan template is a trip with its packing list and bookings', () => {
  const text = BUILTIN_TEMPLATES.find((x) => x.id === 'travel').text;
  const t = tripOf('Trip.md', text.replace(/\{\{[^}]+\}\}/g, ''));
  assert.ok(t.packing.total > 5 && t.packing.done === 0);
  assert.equal(t.bookings.total, 4);
});
