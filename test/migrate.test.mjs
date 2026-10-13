import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, emptyStore, CURRENT_VERSION } from '../lib/migrate.mjs';

test('null / undefined -> empty valid store', () => {
  assert.deepEqual(migrate(null), emptyStore());
  assert.deepEqual(migrate(undefined), emptyStore());
});

test('bare array of items (version 0) upgrades and normalises', () => {
  const out = migrate([{ title: 'Eski plan' }]);
  assert.equal(out.version, CURRENT_VERSION);
  assert.equal(out.items.length, 1);
  const p = out.items[0];
  assert.equal(p.title, 'Eski plan');
  assert.equal(p.scope, 'day'); // default
  assert.equal(p.done, false);
  assert.equal(typeof p.id, 'string');
  assert.equal(typeof p.created, 'number');
});

test('versionless object with items upgrades', () => {
  const out = migrate({ items: [{ title: 'x', scope: 'week', key: '2026-W40' }] });
  assert.equal(out.version, CURRENT_VERSION);
  assert.equal(out.items[0].scope, 'week');
  assert.equal(out.items[0].key, '2026-W40');
});

test('old v1 data survives the upgrade to v2 (content preserved)', () => {
  const v1 = {
    version: 1,
    items: [{
      id: 'p-1', scope: 'month', key: '2026-10',
      title: 'Hedef', time: '', done: true, created: 123,
    }],
  };
  const out = migrate(v1);
  assert.equal(out.version, CURRENT_VERSION);
  assert.equal(out.items.length, 1);
  const p = out.items[0];
  assert.equal(p.id, 'p-1');
  assert.equal(p.title, 'Hedef');
  assert.equal(p.done, true);
  assert.equal(p.scope, 'month');
  // New fields appear with safe defaults; month plans never recur.
  assert.equal(p.recur, null);
  assert.deepEqual(p.doneDates, {});
  assert.deepEqual(p.exceptions, {});
  assert.equal(p.endTime, ''); // v3 field
});

test('v2 recurring plan survives upgrade to v3, gains empty endTime', () => {
  const v2 = {
    version: 2,
    items: [{
      id: 'r-1', scope: 'day', key: '2026-10-01',
      title: 'Spor', time: '07:00', done: false, created: 1,
      recur: { type: 'weekdays', days: [1, 3, 5] },
      doneDates: { '2026-10-02': true }, exceptions: { '2026-10-07': true },
    }],
  };
  const out = migrate(v2);
  assert.equal(out.version, CURRENT_VERSION);
  assert.deepEqual(out.items[0], { ...v2.items[0], endTime: '' });
});

test('v3 endTime is preserved', () => {
  const v3 = {
    version: 3,
    items: [{
      id: 'p-1', scope: 'day', key: '2026-10-04', title: 'Toplantı',
      time: '18:30', endTime: '19:30', done: false, created: 1,
      recur: null, doneDates: {}, exceptions: {},
    }],
  };
  assert.deepEqual(migrate(v3), v3);
});

test('invalid recurrence is dropped and maps emptied', () => {
  const out = migrate({ version: 2, items: [{
    scope: 'day', key: '2026-10-01', title: 'x',
    recur: { type: 'nonsense' }, doneDates: { a: true },
  }] });
  assert.equal(out.items[0].recur, null);
  assert.deepEqual(out.items[0].doneDates, {});
});

test('invalid scope falls back to day; bad fields coerced', () => {
  const out = migrate({ version: 1, items: [{ scope: 'decade', done: 1, time: 930 }] });
  const p = out.items[0];
  assert.equal(p.scope, 'day');
  assert.equal(p.done, true);
  assert.equal(p.time, ''); // non-string time dropped
});

test('non-array items yields empty list, not a throw', () => {
  const out = migrate({ version: 1, items: 'nope' });
  assert.deepEqual(out, emptyStore());
});
