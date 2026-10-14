// Build configuration (electron-vite). The sources keep their places; this only
// points each process at its entry:
//   main.js          -> out/main/index.js
//   preload.js       -> out/preload/index.js (CommonJS, required by sandboxed preloads)
//   index.html       -> out/renderer/index.html
//   src/export.html  -> out/renderer/src/export.html (offscreen PDF export page)
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';

const root = import.meta.dirname;

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
    build: {
      rollupOptions: {
        input: {
          index: resolve(root, 'index.html'),
          export: resolve(root, 'src/export.html'),
        },
      },
    },
  },
});
