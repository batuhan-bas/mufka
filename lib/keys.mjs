// Keyboard shortcuts as people read them on each system. The app writes them
// the Mac way (⌘O, ⇧⌘P, ⌥⌘←); on Windows and Linux they read Ctrl+O,
// Ctrl+Shift+P, Ctrl+Alt+←. The app itself accepts ⌘ or Ctrl everywhere.

const NAMES = { '⌃': 'Ctrl', '⌘': 'Ctrl', '⌥': 'Alt', '⇧': 'Shift' };
const ORDER = ['Ctrl', 'Alt', 'Shift'];

export function keyLabel(text, isMac) {
  if (isMac) return String(text);
  return String(text).replace(/([⌃⌥⇧⌘]+)(\S?)/g, (_m, mods, key) => {
    const names = [...new Set([...mods].map((c) => NAMES[c]))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    return `${names.join('+')}+${key}`;
  });
}
