// Shortcuts people set themselves (Settings → Shortcuts). A shortcut is
// written the Mac way, as the app's hints are (⌘E, ⇧⌘G, ⌥⌘[); lib/keys.mjs
// shows it as Ctrl+… elsewhere. ⌘ is Cmd or Ctrl, as everywhere in the app.
// overrides: { commandId: shortcut }, '' = no shortcut. Pure; no DOM.

const CODE_KEYS = {
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', Comma: ',', Period: '.', Semicolon: ';',
  Slash: '/', Quote: "'", Backquote: '`', Minus: '-', Equal: '=',
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Enter: '↵', Space: 'Space',
};

// The shortcut a key press makes, or null (no ⌘/Ctrl or ⌥, or a key alone).
export function comboOf(e) {
  const code = String(e.code || '');
  const key = /^Key([A-Z])$/.exec(code)?.[1] || /^Digit(\d)$/.exec(code)?.[1] || /^F\d{1,2}$/.exec(code)?.[0] || CODE_KEYS[code];
  if (!key) return null;
  const cmd = e.metaKey || e.ctrlKey;
  if (!cmd && !e.altKey) return null;
  return `${e.altKey ? '⌥' : ''}${e.shiftKey ? '⇧' : ''}${cmd ? '⌘' : ''}${key}`;
}

// Kept for the system and text editing.
export const RESERVED = { '⌘C': 'Copy', '⌘V': 'Paste', '⌘X': 'Cut', '⌘A': 'Select all', '⌘Z': 'Undo', '⇧⌘Z': 'Redo', '⌘Q': 'Quit', '⌘H': 'Hide', '⌘M': 'Minimize' };

export const idOf = (c) => c.id || c.label;
export const defaultKey = (c) => c.hint || '';
export function keyOf(c, overrides) {
  const id = idOf(c);
  return Object.prototype.hasOwnProperty.call(overrides, id) ? overrides[id] : defaultKey(c);
}

// The command a changed shortcut now runs (set by the person, not the app's own).
export function customCommand(combo, cmds, overrides) {
  return cmds.find((c) => keyOf(c, overrides) === combo && defaultKey(c) !== combo) || null;
}

// An app shortcut that no longer does anything: its command was given other
// keys (or none) and no command has it now.
export function freedDefault(combo, cmds, overrides) {
  return cmds.some((c) => defaultKey(c) === combo && keyOf(c, overrides) !== combo)
    && !cmds.some((c) => keyOf(c, overrides) === combo);
}

// Who else has these keys (not `id`).
export function takenBy(combo, cmds, overrides, id) {
  return cmds.find((c) => idOf(c) !== id && keyOf(c, overrides) === combo) || null;
}

// Give command `id` these keys ('' = none); a command that had them loses them.
export function assign(overrides, cmds, id, combo) {
  const next = { ...overrides };
  if (combo) {
    for (const c of cmds) if (idOf(c) !== id && keyOf(c, next) === combo) next[idOf(c)] = '';
  }
  const own = cmds.find((c) => idOf(c) === id);
  if (own && defaultKey(own) === combo) delete next[id]; else next[id] = combo;
  return next;
}

// Back to the app's own keys; a command that took them meanwhile lets go.
export function reset(overrides, cmds, id) {
  const own = cmds.find((c) => idOf(c) === id);
  return assign(overrides, cmds, id, own ? defaultKey(own) : '');
}
