// A note changed on disk while it was open in Mufka (an AI client added to it
// over MCP, a sync, another editor), and Mufka is about to save over it.
//
// Text only added at the end (append_to_note, a Wispr sync) is kept: Mufka
// saves its own text with that addition. Any other change is a conflict:
// Mufka's text is saved and the version on disk goes to the note's version
// history (main.js keeps it before every save).

// `base`: the text before the outside change, `local`: Mufka's text,
// `disk`: what the file holds now.
export function mergeOutside(local, base, disk) {
  if (disk === base || disk === local) return { kind: 'same', text: local };
  if (!disk.startsWith(base)) return { kind: 'conflict', text: local };
  const tail = disk.slice(base.length);
  const sep = local === '' || local.endsWith('\n') || tail.startsWith('\n') ? '' : '\n';
  return { kind: 'appended', text: `${local}${sep}${tail}` };
}

// Saving `content` over a file that holds `disk` (null: no file yet). `last`:
// what Mufka itself last wrote there; `base`: the text the editor started from.
// Either one matching the disk means nothing changed outside Mufka.
export function resolveSave(content, disk, { last, base } = {}) {
  const known = [last, base].filter((t) => typeof t === 'string');
  if (disk == null || !known.length || disk === content || known.includes(disk)) return { kind: 'same', text: content };
  const before = known.find((t) => disk.startsWith(t));
  return before == null ? { kind: 'conflict', text: content } : mergeOutside(content, before, disk);
}
