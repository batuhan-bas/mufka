import { test } from 'node:test';
import assert from 'node:assert/strict';
import LZString from 'lz-string';
import { parseDrawing, serializeDrawing, isDrawingRel, isDrawingText, drawingTitle, emptyScene, drawingFolder } from '../lib/drawing.mjs';

// A file as the Obsidian Excalidraw plugin writes it.
const plugin = (scene) => `---

excalidraw-plugin: parsed
tags: [excalidraw]

---
==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠==


## Drawing
\`\`\`compressed-json
${LZString.compressToBase64(JSON.stringify(scene)).match(/.{1,64}/g).join('\n\n')}
\`\`\`
%%`;

const rect = { id: 'r1', type: 'rectangle', x: 1, y: 2, width: 30, height: 20, version: 3, isDeleted: false };
const text = { id: 't1', type: 'text', x: 0, y: 0, text: 'Hello there', version: 1, isDeleted: false };

test('names and kinds of drawing files', () => {
  assert.equal(isDrawingRel('Excalidraw/Sketch.excalidraw.md'), true);
  assert.equal(isDrawingRel('a.excalidraw'), true);
  assert.equal(isDrawingRel('Notes/Plan.md'), false);
  assert.equal(drawingTitle('Excalidraw/Drawing 2026-10-14 21.22.22.excalidraw.md'), 'Drawing 2026-10-14 21.22.22');
  assert.equal(isDrawingText(plugin(emptyScene())), true);
  assert.equal(isDrawingText('---\ntags: [x]\n---\n# Note'), false);
  assert.equal(drawingFolder(null), 'Excalidraw');
  assert.equal(drawingFolder({ folder: '/Art/Sketches/' }), 'Art/Sketches');
});

test('reads the plugin format, compressed (in chunks) or plain JSON', () => {
  const d = parseDrawing(plugin({ type: 'excalidraw', version: 2, elements: [rect], appState: { viewBackgroundColor: '#fff' } }));
  assert.equal(d.ok, true);
  assert.deepEqual(d.elements.map((e) => e.id), ['r1']);
  assert.equal(d.appState.viewBackgroundColor, '#fff');
  const plain = parseDrawing('---\nexcalidraw-plugin: parsed\n---\n%%\n## Drawing\n```json\n{"type":"excalidraw","elements":[{"id":"x"}]}\n```\n%%');
  assert.deepEqual(plain.elements, [{ id: 'x' }]);
  assert.equal(parseDrawing('---\nexcalidraw-plugin: parsed\n---\n```compressed-json\nnot-data\n```').ok, false);
});

test('writes what the plugin reads, keeps the frontmatter, lists text, drops deleted elements', () => {
  const prev = '---\nexcalidraw-plugin: parsed\ntags: [excalidraw, mine]\ncssclasses: wide\n---\nold body';
  const out = serializeDrawing({ elements: [rect, text, { ...rect, id: 'gone', isDeleted: true }], appState: { viewBackgroundColor: '#123', selectedElementIds: { r1: true } }, files: {} }, prev);
  assert.match(out, /^---\nexcalidraw-plugin: parsed\ntags: \[excalidraw, mine\]\ncssclasses: wide\n---\n/);
  assert.match(out, /## Text Elements\nHello there \^t1\n/);
  assert.match(out, /%%\n## Drawing\n```compressed-json\n[\s\S]+\n```\n%%\n$/);
  const back = parseDrawing(out);
  assert.deepEqual(back.elements.map((e) => e.id), ['r1', 't1']);
  assert.equal(back.appState.viewBackgroundColor, '#123');
  assert.equal(back.appState.selectedElementIds, undefined, 'only lasting settings are saved');
  assert.equal(isDrawingText(serializeDrawing(emptyScene(), '')), true);
});
