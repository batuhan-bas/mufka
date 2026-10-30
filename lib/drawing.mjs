// Drawings: Excalidraw scenes kept as notes in the format of Obsidian's
// Excalidraw plugin, so the same file opens in both — frontmatter
// (`excalidraw-plugin: parsed`), a "## Text Elements" list (text you wrote,
// searchable as Markdown) and the scene as LZ-compressed JSON in a
// "## Drawing" code block, between %% markers. Plain ```json blocks are read
// too. Pure: no DOM, no fs.
import LZString from 'lz-string';

export const DRAWING_FOLDER = 'Excalidraw';
export const DRAWING_SOURCE = 'https://mufka.app';

// "Folder/Sketch.excalidraw.md" (or a bare .excalidraw file).
export function isDrawingRel(rel) {
  return /\.excalidraw(\.md)?$/i.test(String(rel || ''));
}

// A note's text is a drawing when its frontmatter says so.
export function isDrawingText(text) {
  const t = String(text || '');
  if (!t.startsWith('---')) return false;
  const end = t.indexOf('\n---', 3);
  return end !== -1 && /^excalidraw-plugin\s*:/m.test(t.slice(0, end));
}

// The drawing's name as shown: the file name without ".excalidraw.md".
export function drawingTitle(rel) {
  return String(rel).slice(String(rel).lastIndexOf('/') + 1).replace(/\.md$/i, '').replace(/\.excalidraw$/i, '');
}

export function emptyScene() {
  return { type: 'excalidraw', version: 2, source: DRAWING_SOURCE, elements: [], appState: { gridSize: null, viewBackgroundColor: '#ffffff' }, files: {} };
}

// The scene in a drawing note: { elements, appState, files }. Missing or
// unreadable data gives an empty scene and `ok: false`.
export function parseDrawing(text) {
  const t = String(text || '');
  const compressed = /```compressed-json\s*\n([\s\S]*?)\n```/.exec(t);
  const plain = /```json\s*\n([\s\S]*?)\n```/.exec(t);
  let json = null;
  try {
    if (compressed) json = LZString.decompressFromBase64(compressed[1].replace(/\s+/g, ''));
    else if (plain) json = plain[1];
    else if (/^\s*\{/.test(t)) json = t; // a bare .excalidraw file
  } catch { json = null; }
  let scene = null;
  try { scene = json ? JSON.parse(json) : null; } catch { scene = null; }
  if (!scene || typeof scene !== 'object' || !Array.isArray(scene.elements)) return { ...emptyScene(), ok: !compressed && !plain && !json };
  return {
    type: 'excalidraw',
    version: scene.version || 2,
    source: scene.source || DRAWING_SOURCE,
    elements: scene.elements,
    appState: scene.appState && typeof scene.appState === 'object' ? scene.appState : {},
    files: scene.files && typeof scene.files === 'object' ? scene.files : {},
    ok: true,
  };
}

const HEADER = '==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: \'Decompress current Excalidraw file\'. For more info check in plugin settings under \'Saving\'';

// Keep the note's own frontmatter (with excalidraw-plugin set), or start one.
function frontmatterFor(prev) {
  const t = String(prev || '');
  if (t.startsWith('---')) {
    const end = t.indexOf('\n---', 3);
    if (end !== -1) {
      let fm = t.slice(4, end);
      if (!/^excalidraw-plugin\s*:/m.test(fm)) fm = `excalidraw-plugin: parsed\n${fm}`;
      return `---\n${fm.replace(/\n+$/, '')}\n---\n`;
    }
  }
  return '---\n\nexcalidraw-plugin: parsed\ntags: [excalidraw]\n\n---\n';
}

// The scene's saved state: what Excalidraw keeps between sessions.
function savedAppState(a) {
  const keep = ['gridSize', 'gridStep', 'gridModeEnabled', 'viewBackgroundColor', 'currentItemStrokeColor', 'currentItemBackgroundColor', 'currentItemFillStyle', 'currentItemStrokeWidth', 'currentItemStrokeStyle', 'currentItemRoughness', 'currentItemOpacity', 'currentItemFontFamily', 'currentItemFontSize', 'currentItemTextAlign', 'currentItemStartArrowhead', 'currentItemEndArrowhead', 'currentItemRoundness', 'scrollX', 'scrollY', 'zoom', 'theme'];
  const out = {};
  for (const k of keep) if (a && a[k] !== undefined) out[k] = a[k];
  return out;
}

// The note text for a scene. `prev` is the note's current text (its
// frontmatter is kept).
export function serializeDrawing(scene, prev) {
  const elements = (scene.elements || []).filter((e) => e && !e.isDeleted);
  const data = {
    type: 'excalidraw',
    version: 2,
    source: DRAWING_SOURCE,
    elements,
    appState: savedAppState(scene.appState),
    files: scene.files || {},
  };
  const texts = elements
    .filter((e) => e.type === 'text' && typeof e.text === 'string' && e.text.trim())
    .map((e) => `${e.text.trim()} ^${e.id}`);
  const packed = LZString.compressToBase64(JSON.stringify(data));
  const chunks = packed.match(/.{1,256}/g) || [''];
  return [
    frontmatterFor(prev),
    HEADER,
    '',
    '',
    '# Excalidraw Data',
    '',
    '## Text Elements',
    ...texts.flatMap((t) => [t, '']),
    '%%',
    '## Drawing',
    '```compressed-json',
    chunks.join('\n\n'),
    '```',
    '%%',
    '',
  ].join('\n');
}

// Where new drawings go: the Excalidraw plugin's folder setting, else Excalidraw/.
export function drawingFolder(pluginSettings) {
  const f = pluginSettings && typeof pluginSettings.folder === 'string' ? pluginSettings.folder.trim().replace(/^\/+|\/+$/g, '') : '';
  return f || DRAWING_FOLDER;
}
