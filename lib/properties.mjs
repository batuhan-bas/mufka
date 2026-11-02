// Note properties: the YAML frontmatter between the "---" lines at the top of
// a note, as Obsidian shows and edits them. Pure, on the note's text:
// readProps() lists them with a type for the editor, setProp/deleteProp/
// renameProp return the new text. Edits go through yaml's Document, so the
// properties not touched keep their order, style and comments.
import YAML from 'yaml';

// Warnings (a template's {{date}} read as a map key…) are not the user's
// business, and would land in the console.
const QUIET = { logLevel: 'error' };

function bounds(src) {
  const lines = String(src).split('\n');
  if (lines[0].replace(/\r$/, '') !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i].replace(/\r$/, '');
    if (l === '---' || l === '...') return { lines, end: i };
  }
  return null;
}

// The frontmatter's text, or null when the note has none.
export function frontmatterText(src) {
  const b = bounds(src);
  return b ? b.lines.slice(1, b.end).join('\n') : null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;

// How the editor shows a value.
export function propType(key, value) {
  const k = String(key).toLowerCase();
  if (k === 'tags' || k === 'tag') return 'tags';
  if (k === 'aliases' || k === 'alias') return 'list';
  if (Array.isArray(value)) return value.every((v) => v == null || typeof v !== 'object') ? 'list' : 'object';
  if (typeof value === 'boolean') return 'checkbox';
  if (typeof value === 'number') return 'number';
  if (value instanceof Date) return 'date';
  if (typeof value === 'string' && DATE.test(value)) return 'date';
  if (typeof value === 'string' && DATETIME.test(value)) return 'datetime';
  if (value != null && typeof value === 'object') return 'object';
  return 'text';
}

// { props: [{ key, value, type }] } (empty when there is no frontmatter), or
// { error } when the YAML cannot be read (the editor then offers the source).
export function readProps(src) {
  const text = frontmatterText(src);
  if (text == null) return { props: [], has: false };
  const doc = YAML.parseDocument(text, QUIET);
  if (doc.errors.length) return { error: doc.errors[0].message, has: true };
  const data = doc.toJS();
  if (data == null) return { props: [], has: true };
  if (typeof data !== 'object' || Array.isArray(data)) return { error: 'The properties are not a list of names and values', has: true };
  return { has: true, props: Object.entries(data).map(([key, value]) => ({ key, value, type: propType(key, value) })) };
}

// Change the frontmatter with `edit(doc)`; returns the new note text.
function withDoc(src, edit) {
  const b = bounds(src);
  const doc = b ? YAML.parseDocument(b.lines.slice(1, b.end).join('\n'), QUIET) : new YAML.Document({});
  if (doc.errors.length) throw new Error(doc.errors[0].message);
  if (doc.contents == null) doc.contents = doc.createNode({});
  edit(doc);
  const yaml = doc.contents && doc.contents.items && doc.contents.items.length ? doc.toString({ lineWidth: 0, flowCollectionPadding: false }).replace(/\n$/, '') : '';
  const head = yaml ? `---\n${yaml}\n---` : '';
  if (b) {
    const rest = b.lines.slice(b.end + 1).join('\n');
    return head ? `${head}\n${rest}` : rest.replace(/^\n/, '');
  }
  return head ? `${head}\n${src}` : src;
}

// The value as YAML should hold it: lists of strings, numbers, true/false.
function clean(value) {
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' ? v.trim() : v)).filter((v) => v !== '' && v != null);
  return value;
}

export function setProp(src, key, value) {
  return withDoc(src, (doc) => {
    const v = clean(value);
    const node = doc.get(key, true);
    // Keep an inline [a, b] list inline (an empty one is always written [] ).
    const flow = YAML.isCollection(node) && node.flow && node.items.length > 0;
    const created = doc.createNode(v);
    if (flow && YAML.isCollection(created)) created.flow = true;
    doc.set(key, created);
  });
}

export function deleteProp(src, key) {
  return withDoc(src, (doc) => { doc.delete(key); });
}

// Rename a property in place (its position kept). Refuses an existing name.
export function renameProp(src, from, to) {
  const name = String(to).trim();
  if (!name || name === from) return src;
  return withDoc(src, (doc) => {
    if (doc.has(name)) throw new Error(`There is already a property named “${name}”`);
    const pair = doc.contents.items.find((p) => (YAML.isScalar(p.key) ? p.key.value : p.key) === from);
    if (!pair) return;
    if (YAML.isScalar(pair.key)) pair.key.value = name; // keeps a comment above it
    else pair.key = doc.createNode(name);
  });
}

// A new property's starting value, by the name people usually give it.
export function defaultValue(key) {
  const k = String(key).toLowerCase();
  if (['tags', 'tag', 'aliases', 'alias', 'cssclasses'].includes(k)) return [];
  return '';
}

// Other names a note goes by (Obsidian "aliases"): [[alias]] links to it.
export function aliasesOf(src) {
  const text = frontmatterText(src);
  if (text == null || !/^(aliases|alias)\s*:/m.test(text)) return [];
  try {
    const data = YAML.parse(text);
    const v = data && (data.aliases ?? data.alias);
    const list = Array.isArray(v) ? v : (v == null ? [] : [v]);
    return list.map((a) => (a == null ? '' : String(a).trim())).filter(Boolean);
  } catch { return []; }
}
