// The Excalidraw editor for Draw mode (src/draw.js), loaded only when a
// drawing is opened: React, Excalidraw and its fonts (copied next to the app,
// see electron.vite.config.mjs) never touch the network.
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw, MainMenu, exportToSvg, hashElementsVersion } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';

// A scene's version: changes when any element or file does.
export function sceneVersion(elements, files, appState) {
  return `${hashElementsVersion(elements || [])}:${Object.keys(files || {}).length}:${appState ? appState.viewBackgroundColor : ''}`;
}

// Mount the editor into `host`. `opts`: { scene, onChange(scene), onLink(url),
// menu: [{ label, run }] }. Returns { replace(scene), unmount() }.
export function mountDrawing(host, opts) {
  const root = createRoot(host);
  let api = null;
  let shown = opts.scene;
  let last = sceneVersion(shown.elements, shown.files, shown.appState);

  const render = () => root.render(h(Excalidraw, {
    key: 'scene',
    initialData: {
      elements: shown.elements,
      appState: { ...shown.appState, theme: 'dark' },
      files: shown.files,
      scrollToContent: !shown.appState || shown.appState.scrollX == null,
    },
    theme: 'dark',
    langCode: 'en-US',
    autoFocus: true,
    excalidrawAPI: (a) => { api = a; },
    UIOptions: { canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false } },
    onChange: (elements, appState, files) => {
      const v = sceneVersion(elements, files, appState);
      if (v === last) return;
      last = v;
      opts.onChange({ elements, appState, files });
    },
    onLinkOpen: (element, event) => {
      const url = element && element.link;
      if (!url) return;
      event.preventDefault();
      opts.onLink(url);
    },
  }, h(MainMenu, null,
    ...(opts.menu || []).map((m) => h(MainMenu.Item, { key: m.label, onSelect: m.run }, m.label)),
    h(MainMenu.Separator, { key: 'sep' }),
    h(MainMenu.DefaultItems.Export, { key: 'export' }),
    h(MainMenu.DefaultItems.SaveAsImage, { key: 'image' }),
    h(MainMenu.DefaultItems.SearchMenu, { key: 'search' }),
    h(MainMenu.DefaultItems.ClearCanvas, { key: 'clear' }),
    h(MainMenu.Separator, { key: 'sep2' }),
    h(MainMenu.DefaultItems.ChangeCanvasBackground, { key: 'bg' }),
    h(MainMenu.DefaultItems.Help, { key: 'help' }),
  )));
  render();

  return {
    // The file changed elsewhere (Obsidian, a sync): show the new scene.
    replace(scene) {
      shown = scene;
      last = sceneVersion(scene.elements, scene.files, scene.appState);
      if (api) {
        if (scene.files) api.addFiles(Object.values(scene.files));
        api.updateScene({ elements: scene.elements, appState: { viewBackgroundColor: scene.appState.viewBackgroundColor } });
      }
    },
    unmount() { root.unmount(); },
  };
}

// A drawing as SVG text, for a preview in a note (shown as an image).
export async function drawingSvg(scene) {
  const svg = await exportToSvg({
    elements: (scene.elements || []).filter((e) => !e.isDeleted),
    appState: { ...scene.appState, exportBackground: true, exportWithDarkMode: true, exportPadding: 16 },
    files: scene.files || {},
  });
  return new XMLSerializer().serializeToString(svg);
}
