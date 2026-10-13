// Pure data migration. No DOM, no Electron. Imported by main, renderer, tests.
// The on-disk format is { version, items: [...] }. Bump CURRENT_VERSION and add
// a step when the shape changes; every step takes the whole object and returns
// the next version's object. Old files must always survive.

import { normalizeRecur } from './recur.mjs';

export const CURRENT_VERSION = 3;

const SCOPES = new Set(['day', 'week', 'month']);

// One function per upgrade: steps[n] turns a version-n object into version-(n+1).
const steps = {
  // 0 -> 1: earliest readable shape. Accept a bare array of items or a
  // versionless object and normalise it into the versioned container.
  0(data) {
    const items = Array.isArray(data) ? data : (data && data.items) || [];
    return { version: 1, items };
  },
  // 1 -> 2: add recurrence support. Existing plans gain no recurrence and
  // empty per-date maps; this is handled by normalizeItem, so the step only
  // needs to carry the items forward and bump the version.
  1(data) {
    return { version: 2, items: Array.isArray(data.items) ? data.items : [] };
  },
  // 2 -> 3: add an optional end time to plans. normalizeItem fills it in, so
  // the step just carries items forward and bumps the version.
  2(data) {
    return { version: 3, items: Array.isArray(data.items) ? data.items : [] };
  },
};

function cleanDateMap(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v) out[k] = true;
  }
  return out;
}

function normalizeItem(raw, index) {
  const item = raw && typeof raw === 'object' ? raw : {};
  const scope = SCOPES.has(item.scope) ? item.scope : 'day';
  const recur = normalizeRecur(item.recur);
  return {
    id: typeof item.id === 'string' && item.id ? item.id : `legacy-${index}-${Date.now()}`,
    scope,
    key: typeof item.key === 'string' ? item.key : '',
    title: typeof item.title === 'string' ? item.title : '',
    time: typeof item.time === 'string' ? item.time : '',
    endTime: typeof item.endTime === 'string' ? item.endTime : '',
    done: Boolean(item.done),
    created: typeof item.created === 'number' ? item.created : Date.now(),
    // Recurrence only applies to day-scoped plans; others keep it null.
    recur: scope === 'day' ? recur : null,
    doneDates: recur ? cleanDateMap(item.doneDates) : {},
    exceptions: recur ? cleanDateMap(item.exceptions) : {},
  };
}

// Read any historical value into the current, validated shape.
export function migrate(data) {
  let obj = data;
  let version = (obj && typeof obj === 'object' && typeof obj.version === 'number')
    ? obj.version
    : 0;

  while (version < CURRENT_VERSION) {
    const step = steps[version];
    if (!step) break;
    obj = step(obj);
    version = obj.version;
  }

  const items = Array.isArray(obj && obj.items) ? obj.items : [];
  return {
    version: CURRENT_VERSION,
    items: items.map(normalizeItem),
  };
}

// Fresh, empty, valid store.
export function emptyStore() {
  return { version: CURRENT_VERSION, items: [] };
}
