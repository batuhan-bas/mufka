import { test } from 'node:test';
import assert from 'node:assert/strict';
import LZString from 'lz-string';
import { parseDrawing, serializeDrawing, isDrawingRel, isDrawingText, drawingTitle, emptyScene, drawingFolder, embeddedFiles, pastedImageName } from '../lib/drawing.mjs';

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

test('images as files of their own: listed under Embedded Files, not in the JSON', () => {
  const img = (id, fileId) => ({ id, type: 'image', fileId, x: 0, y: 0, width: 10, height: 10 });
  const dataURL = 'data:image/png;base64,iVBORw0KGgo=';
  const scene = { elements: [img('a', 'f1'), img('b', 'f2')], appState: {}, files: { f1: { id: 'f1', mimeType: 'image/png', dataURL }, f2: { id: 'f2', mimeType: 'image/png', dataURL }, gone: { id: 'gone', dataURL } } };
  const text = serializeDrawing(scene, '', { f1: 'Pasted Image 20261115173000_0.png' });
  assert.match(text, /## Embedded Files\nf1: \[\[Pasted Image 20261115173000_0\.png\]\]\n\n%%\n## Drawing/);
  assert.deepEqual(embeddedFiles(text), { f1: 'Pasted Image 20261115173000_0.png' });
  const back = parseDrawing(text);
  assert.deepEqual(Object.keys(back.files), ['f2'], 'f1 is a file of its own; f2 still inside; an unused one dropped');
  // Saving again without saying keeps what the note lists.
  assert.match(serializeDrawing(back, text), /f1: \[\[Pasted Image 20261115173000_0\.png\]\]/);
  // An image taken out of the drawing leaves the list.
  assert.doesNotMatch(serializeDrawing({ ...back, elements: [img('b', 'f2')] }, text), /Embedded Files/);
});

test('the plugin\'s Embedded Files lines, with ![[…]] or an alias, CRLF', () => {
  const t = '## Text Elements\r\n%%\r\n## Embedded Files\r\nabc123: [[Ekler/photo.jpg]]\r\ndef-456: ![[pic.png|100]]\r\n\r\n%%\r\n## Drawing\r\n';
  assert.deepEqual(embeddedFiles(t), { abc123: 'Ekler/photo.jpg', 'def-456': 'pic.png' });
  assert.deepEqual(embeddedFiles('no list'), {});
});

test('pasted image names', () => {
  assert.equal(pastedImageName(new Date(2026, 10, 15, 17, 30, 0), 0, 'image/png'), 'Pasted Image 20261115173000_0.png');
  assert.equal(pastedImageName(new Date(2026, 0, 2, 3, 4, 5), 2, 'image/jpeg'), 'Pasted Image 20260102030405_2.jpg');
});
