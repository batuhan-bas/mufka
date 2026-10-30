// Build configuration (electron-vite). The sources keep their places; this only
// points each process at its entry:
//   main.js          -> out/main/index.js
//   preload.js       -> out/preload/index.js (CommonJS, required by sandboxed preloads)
//   index.html       -> out/renderer/index.html
//   src/export.html  -> out/renderer/src/export.html (offscreen PDF export page)
import { resolve, join } from 'node:path';
import { cpSync } from 'node:fs';
import { defineConfig } from 'electron-vite';

const root = import.meta.dirname;

// Excalidraw's fonts, copied next to the built renderer so Draw never fetches
// them from a CDN (src/draw.js sets EXCALIDRAW_ASSET_PATH). The CJK fallback
// font (Xiaolai, 12 MB) is left out; such text uses a system font.
function excalidrawFonts() {
  return {
    name: 'mufka-excalidraw-fonts',
    apply: 'build',
    writeBundle(options) {
      const from = resolve(root, 'node_modules/@excalidraw/excalidraw/dist/prod/fonts');
      cpSync(from, join(options.dir, 'excalidraw/fonts'), { recursive: true, filter: (p) => !p.includes('Xiaolai') });
    },
  };
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: resolve(root, 'main.js') },
        // zod's sources carry comments Rollup cannot place ("contains an
        // annotation that Rollup cannot interpret"); harmless, so not shown.
        onwarn(warning, warn) {
          if (warning.code === 'INVALID_ANNOTATION' && /node_modules/.test(warning.id || '')) return;
          warn(warning);
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: { input: { index: resolve(root, 'preload.js') } },
    },
  },
  renderer: {
    root,
    plugins: [excalidrawFonts()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(root, 'index.html'),
          export: resolve(root, 'src/export.html'),
          sandbox: resolve(root, 'src/sandbox.html'),
        },
        // Excalidraw's dependencies mark themselves "use client" (React server
        // components); meaningless in a bundle, so not shown.
        onwarn(warning, warn) {
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
          warn(warning);
        },
      },
    },
  },
});
