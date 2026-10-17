// Colours and icons for folders and notes in the sidebar tree. Pure: no DOM,
// no storage. The renderer keeps one map per notes folder:
//   { [rel]: { color?: string, icon?: string } }
// where `color` is a palette id and `icon` is a picker icon id or an emoji.
// Nothing is written into the vault itself.

// The guide line under a folder takes the colour of its level; these are the
// same five colours, plus three more to choose from.
export const PALETTE = [
  { id: 'indigo', name: 'Indigo', hex: '#6f7cf0' },
  { id: 'teal', name: 'Teal', hex: '#3fb5a4' },
  { id: 'amber', name: 'Amber', hex: '#d9a13b' },
  { id: 'violet', name: 'Violet', hex: '#b383f2' },
  { id: 'coral', name: 'Coral', hex: '#e0786b' },
  { id: 'green', name: 'Green', hex: '#4cc38a' },
  { id: 'blue', name: 'Blue', hex: '#5aa9e6' },
  { id: 'pink', name: 'Pink', hex: '#e07bb5' },
];
const LEVELS = ['indigo', 'teal', 'amber', 'violet', 'coral'];

// Icons offered in the picker (names in src/icons.js).
export const TREE_ICONS = [
  'tiFileText', 'tiStar', 'tiHeart', 'tiBriefcase', 'tiBookOpen', 'tiLightbulb', 'tiFlag', 'tiUser',
  'tiUsers', 'tiCode', 'tiMusic', 'tiCamera', 'tiImage', 'tiGlobe', 'tiMapPin', 'tiPlane',
  'tiCoffee', 'tiUtensils', 'tiDumbbell', 'tiGraduationCap', 'tiWallet', 'tiShoppingCart', 'tiRocket', 'tiTarget',
  'tiArchive', 'tiInbox', 'tiPenLine', 'tiSparkles', 'tiLeaf', 'tiFlame', 'tiMic', 'tiFilm',
  'tiGamepad2', 'tiPalette', 'tiCalendarDays', 'tiCircleCheck', 'tiHouse', 'tiListTodo', 'tiBrain', 'tiSun',
];

export function paletteHex(id) {
  const c = PALETTE.find((p) => p.id === id);
  return c ? c.hex : null;
}

function depthOf(rel) { return rel.split('/').length - 1; }
function parentOf(rel) { const i = rel.lastIndexOf('/'); return i === -1 ? '' : rel.slice(0, i); }

// A folder's own colour: the one chosen for it, else its level's.
export function folderColor(rel, styles) {
  const own = styles[rel] && paletteHex(styles[rel].color);
  return own || paletteHex(LEVELS[depthOf(rel) % LEVELS.length]);
}

// A row's colour, used for its icon and its selected background. A note takes
// its own colour, else the colour of the folder it sits in (the guide beside
// it); a note at the top level has none (null: the theme's accent).
export function rowColor(rel, type, styles) {
  if (type === 'folder') return folderColor(rel, styles);
  const own = styles[rel] && paletteHex(styles[rel].color);
  if (own) return own;
  const parent = parentOf(rel);
  return parent ? folderColor(parent, styles) : null;
}

// An icon value is either a picker id or a short emoji (one grapheme).
export function isIconId(value) { return TREE_ICONS.includes(value); }
export function cleanEmoji(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const first = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(t)][0].segment;
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(first) ? first : '';
}

// Set or clear one field; empty entries are dropped. Returns a new map.
export function setStyle(styles, rel, field, value) {
  const next = { ...styles };
  const entry = { ...(next[rel] || {}) };
  if (value) entry[field] = value; else delete entry[field];
  if (Object.keys(entry).length) next[rel] = entry; else delete next[rel];
  return next;
}

// A rename or move: the item and everything under it keep their style.
export function remapStyles(styles, oldRel, newRel) {
  const next = {};
  for (const [rel, s] of Object.entries(styles)) {
    if (rel === oldRel) next[newRel] = s;
    else if (rel.startsWith(`${oldRel}/`)) next[newRel + rel.slice(oldRel.length)] = s;
    else next[rel] = s;
  }
  return next;
}

// Forget items that no longer exist (deleted outside Mufka, say).
export function pruneStyles(styles, existing) {
  const keep = new Set(existing);
  const next = {};
  for (const [rel, s] of Object.entries(styles)) if (keep.has(rel)) next[rel] = s;
  return next;
}
