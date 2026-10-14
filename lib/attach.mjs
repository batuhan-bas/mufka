// Pure attachment helpers: image-type test, insertion Markdown, attachment URL,
// reference resolution, and unused-file detection. No DOM, no fs, no Electron —
// imported by the renderer, the export page, main.js, and node:test.
//
// Mufka adds attachments to the vault's attachment folder (lib/layout.mjs) and
// writes standard Markdown — images `![name](Attachments/file.png)`, other files
// `[name](Attachments/x.pdf)`, each path segment percent-encoded. Notes from other tools (Obsidian) may point anywhere in the
// vault, relative to the note or by bare name (`![[file.png]]`); see
// resolveAttachment.

export const ATTACH_SCHEME = 'mufka-att';
export const MAX_ATTACH_BYTES = 50 * 1024 * 1024; // 50 MB
const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg)$/i;

export function isImageName(name) { return IMAGE_RE.test(String(name || '')); }

// A browser URL for a vault-relative attachment path, served by the custom
// protocol registered in main.js (host "v", each segment percent-encoded).
export function attachUrl(rel) {
  return `${ATTACH_SCHEME}://v/${String(rel).split('/').map(encodeURIComponent).join('/')}`;
}

// The Markdown to insert for a freshly added attachment at vault path `rel`.
// With `relative` (attachments next to notes) the link is relative to the
// note's folder, otherwise it is the vault path; both resolve (resolveAttachment).
export function attachInsertText(rel, isImage = isImageName(rel), { noteDir = '', relative = false } = {}) {
  const name = rel.slice(rel.lastIndexOf('/') + 1);
  const target = relative && noteDir && rel.startsWith(`${noteDir}/`) ? rel.slice(noteDir.length + 1) : rel;
  return `${isImage ? '!' : ''}[${name}](${target.split('/').map(encodeURIComponent).join('/')})`;
}

// Normalise a vault-relative posix path ('.' and '..' resolved, no leading
// '/'); null if it would climb above the vault root.
export function normalizeRel(p) {
  const out = [];
  for (const seg of String(p).split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { if (!out.length) return null; out.pop(); continue; }
    out.push(seg);
  }
  return out.join('/');
}

const dirOf = (rel) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '');
const join = (dir, p) => (dir ? `${dir}/${p}` : p);

// The file to use for a bare name: one in the note's folder, else the shortest
// path, else alphabetical — like Obsidian's "shortest path" resolution.
function byName(name, files, noteDir) {
  const hits = [...files].filter((f) => f === name || f.endsWith(`/${name}`));
  if (!hits.length) return null;
  return hits.find((f) => dirOf(f) === noteDir)
    || hits.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))[0];
}

// Resolve a raw link/embed target (from Markdown) to an attachment descriptor:
// { url, rel, name, isImage, exists, local }. Remote http(s) targets are
// reported as { remote } (never loaded as files).
//   files:   vault-relative paths of every non-note file in the vault
//   noteDir: folder of the note containing the link ('' = vault root)
// A path (with '/') is tried relative to the note, then from the vault root; a
// bare name in `attachDir` first (where Mufka adds files), then anywhere.
// `local` is false for a path that climbs out of the vault.
export function resolveAttachment(raw, files, noteDir = '', attachDir = '') {
  const set = files instanceof Set ? files : new Set(files || []);
  const p = String(raw == null ? '' : raw).trim();
  if (/^https?:\/\//i.test(p)) return { remote: true };
  let target;
  try { target = decodeURIComponent(p); } catch { target = p; }
  const candidates = (target.includes('/')
    ? [join(noteDir, target), target.replace(/^\/+/, '')]
    : [join(attachDir, target), join(noteDir, target)]).map(normalizeRel);
  const inside = candidates.filter((c) => c);
  const found = inside.find((c) => set.has(c)) || byName(target.slice(target.lastIndexOf('/') + 1), set, noteDir);
  const rel = found || inside[0] || null;
  const name = target.slice(target.lastIndexOf('/') + 1);
  if (!rel) return { url: '', rel: null, name, isImage: isImageName(name), exists: false, local: false };
  return { url: attachUrl(rel), rel, name: rel.slice(rel.lastIndexOf('/') + 1), isImage: isImageName(rel), exists: Boolean(found), local: true };
}

// File types that run code when "opened" (scripts, apps, installers). Clicking
// such an attachment reveals it in Finder instead of opening it.
const EXECUTABLE_RE = /\.(app|command|tool|sh|bash|zsh|csh|terminal|pkg|mpkg|dmg|scpt|scptd|applescript|workflow|action|jar|py|rb|pl|js|mjs|php|exe|bat|cmd|ps1|vbs|run|bin|webloc|inetloc|fileloc)$/i;
export function isExecutableName(name) { return EXECUTABLE_RE.test(String(name || '')); }

// Plain data files an attachment click may open in their default app: images,
// audio, video, documents and text. Anything else (unknown types, scripts,
// apps, web pages) is revealed in Finder instead.
const OPENABLE_RE = new RegExp(`\\.(${[
  'png', 'jpe?g', 'gif', 'webp', 'svg', 'heic', 'heif', 'tiff?', 'bmp',
  'mp3', 'm4a', 'wav', 'aiff?', 'aac', 'flac', 'ogg', 'opus',
  'mp4', 'm4v', 'mov', 'webm',
  'pdf', 'epub', 'rtf', 'docx?', 'xlsx?', 'pptx?', 'odt', 'ods', 'odp', 'pages', 'numbers', 'key',
  'txt', 'md', 'csv', 'tsv', 'json', 'log', 'ya?ml', 'zip',
].join('|')})$`, 'i');
export function isOpenableDocument(name) { return OPENABLE_RE.test(String(name || '')); }

// All attachment file names referenced by a single note's content (basenames of
// link/image targets and [[embed]] inners, spaces decoded). Used to find unused
// files — intentionally conservative (counts code mentions too).
export function referencedBasenames(content) {
  const out = new Set();
  const text = String(content == null ? '' : content);
  const add = (raw) => {
    if (!raw) return;
    const t = raw.trim();
    if (/^https?:\/\//i.test(t)) return;
    let s;
    try { s = decodeURIComponent(t); } catch { s = t; }
    out.add(s.slice(s.lastIndexOf('/') + 1));
  };
  let m;
  const link = /!?\[[^\]]*\]\(([^)]+)\)/g;
  while ((m = link.exec(text))) add(m[1]);
  const embed = /!?\[\[([^\]]+)\]\]/g;
  while ((m = embed.exec(text))) add(m[1].split('|')[0].split('#')[0]);
  return out;
}

// File names in Ekler that no note references.
export function unusedAttachments(eklerNames, contents) {
  const referenced = new Set();
  for (const c of contents) for (const n of referencedBasenames(c)) referenced.add(n);
  return [...eklerNames].filter((n) => !referenced.has(n));
}
