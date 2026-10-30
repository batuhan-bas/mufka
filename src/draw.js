// Draw mode: Excalidraw drawings, each a note in the Obsidian Excalidraw
// plugin's format (lib/drawing.mjs). The editor (src/draw-app.js) loads on
// first use and stays mounted while the same drawing is shown; every change is
// written back to the note after a short pause.
import { parseDrawing, serializeDrawing } from '../lib/drawing.mjs';
import { icon } from './icons.js';

const SAVE_DELAY_MS = 600;
let appModule = null;

// Excalidraw's fonts come from the app (main.js serves them as mufka-font:),
// never from a CDN.
function loadApp() {
  if (!appModule) {
    // Excalidraw lists its CDN after the local copy in every font face; drop
    // it, so nothing is ever requested from the network.
    const NativeFontFace = window.FontFace;
    const LocalFontFace = function FontFace(family, source, descriptors) {
      const src = typeof source === 'string'
        ? source.split(/,\s*(?=url\()/).filter((part) => !/^url\(https?:/i.test(part.trim())).join(', ')
        : source;
      return new NativeFontFace(family, src, descriptors);
    };
    LocalFontFace.prototype = NativeFontFace.prototype;
    window.FontFace = LocalFontFace;
    window.EXCALIDRAW_ASSET_PATH = import.meta.env.DEV
      ? `${location.origin}/node_modules/@excalidraw/excalidraw/dist/prod/`
      : 'mufka-font://excalidraw/';
    appModule = import('./draw-app.js');
  }
  return appModule;
}

// live: the mounted drawing — { rel, host, handle, text, timer, pending }.
let live = null;

function flush() {
  if (!live || !live.pending) return;
  clearTimeout(live.timer);
  const scene = live.pending;
  live.pending = null;
  live.text = serializeDrawing(scene, live.text);
  live.save(live.rel, live.text);
}

// Leave the drawing: save what is pending and take the editor down.
export function closeDrawing() {
  if (!live) return;
  flush();
  if (live.handle) live.handle.unmount();
  live = null;
}

// The note changed on disk: show it, unless it is what we last wrote.
export function drawingChanged(rel, text) {
  if (!live || live.rel !== rel || text === live.text || live.pending) return;
  live.text = text;
  if (live.handle) live.handle.replace(parseDrawing(text));
}

function emptyState(container, api) {
  const box = document.createElement('div');
  box.className = 'tk-empty draw-empty';
  box.append(icon('tiPenLine', { size: 34 }));
  const h = document.createElement('h2');
  h.textContent = 'Draw';
  const p = document.createElement('p');
  p.textContent = `Sketches and diagrams. Each drawing is a note in ${api.folder}/, in the format of Obsidian's Excalidraw plugin, so it opens there too.`;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn primary';
  b.textContent = 'New drawing';
  b.addEventListener('click', () => api.newDrawing());
  box.append(h, p, b);
  container.append(box);
}

// api: { rel, text, folder, save(rel, text), newDrawing(), menu: [{ label, run }],
// openLink(url) }
export function renderDraw(container, api) {
  if (!api.rel) { closeDrawing(); emptyState(container, api); return; }
  if (live && live.rel !== api.rel) closeDrawing();
  if (!live) {
    const host = document.createElement('div');
    host.className = 'draw-host';
    live = { rel: api.rel, host, handle: null, text: api.text, timer: null, pending: null, save: api.save };
    const mine = live;
    loadApp().then((mod) => {
      if (live !== mine) return;
      mine.handle = mod.mountDrawing(host, {
        scene: parseDrawing(api.text),
        menu: api.menu,
        onLink: api.openLink,
        onChange: (scene) => {
          mine.pending = scene;
          clearTimeout(mine.timer);
          mine.timer = setTimeout(() => { if (live === mine) flush(); }, SAVE_DELAY_MS);
        },
      });
    }).catch((err) => {
      host.textContent = `The drawing editor could not load: ${err && err.message ? err.message : err}`;
    });
  }
  live.save = api.save;
  container.append(live.host);
}

// A drawing as an image for a note (![[Sketch.excalidraw]]). `onOpen` opens it in Draw.
export function drawingPreview(text, onOpen) {
  const box = document.createElement('div');
  box.className = 'draw-embed';
  box.title = 'Open in Draw';
  box.append(Object.assign(document.createElement('p'), { className: 'dv-empty', textContent: 'Drawing…' }));
  box.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onOpen(); });
  box.addEventListener('mousedown', (e) => e.stopPropagation());
  loadApp()
    .then((mod) => mod.drawingSvg(parseDrawing(text)))
    .then((svg) => {
      const img = document.createElement('img');
      img.className = 'draw-embed-img';
      img.alt = 'Drawing';
      const vb = /viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/.exec(svg);
      if (vb) { img.width = Math.round(Number(vb[1])); img.height = Math.round(Number(vb[2])); }
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      box.replaceChildren(img);
    })
    .catch((err) => { box.textContent = `Drawing could not be shown: ${err && err.message ? err.message : err}`; });
  return box;
}
