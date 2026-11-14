// Builds the MCP Apps view (mcp/ui/) into one self-contained HTML file,
// out/mcp-ui/view.html: hosts load nothing from elsewhere, so the script and
// the styles go inside it. The styles are Mufka's own (src/styles.css), with
// its light-theme blocks keyed to data-theme="light" as well, as the host sets
// the theme (which can differ from the system's). Run by `npm run build`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const repo = fileURLToPath(new URL('..', import.meta.url));
const out = path.join(repo, 'out', 'mcp-ui');

// "@media (prefers-color-scheme: light) { rules }" → the same rules under
// :root[data-theme="light"]; the dark tokens are the defaults already.
export function themeScoped(css) {
  const marker = '@media (prefers-color-scheme: light) {';
  let at;
  while ((at = css.indexOf(marker)) !== -1) {
    let depth = 0; let end = at + marker.length - 1;
    for (; end < css.length; end++) {
      if (css[end] === '{') depth += 1;
      else if (css[end] === '}') { depth -= 1; if (depth === 0) break; }
    }
    const inner = css.slice(at + marker.length, end);
    const scoped = inner.replace(/(^|})(\s*)([^{}@]+?)\s*\{/g, (_m, close, space, sel) => `${close}${space}${sel.split(',').map((x) => {
      const s = x.trim();
      return s.startsWith(':root') ? s.replace(':root', ':root[data-theme="light"]') : `:root[data-theme="light"] ${s}`;
    }).join(', ')} {`);
    css = css.slice(0, at) + scoped + css.slice(end + 1);
  }
  return css;
}

// Code blocks stay uncoloured in the view: highlight.js would add about half
// the file's size. lib/markdown.mjs falls back to plain text when this says no.
const noHighlight = {
  name: 'mufka-view-no-highlight',
  enforce: 'pre',
  resolveId(id, importer) {
    if (importer && /lib[\\/]markdown\.mjs$/.test(importer) && id === './highlight.mjs') return '\0mufka-no-highlight';
    return null;
  },
  load(id) {
    return id === '\0mufka-no-highlight' ? 'export const highlightCode = () => null;\nexport const hastToDom = () => [];\n' : null;
  },
};

const res = await build({
  configFile: false,
  logLevel: 'error',
  root: repo,
  plugins: [noHighlight],
  build: {
    write: false,
    minify: true,
    lib: { entry: path.join(repo, 'mcp', 'ui', 'view.js'), formats: ['iife'], name: 'MufkaView', fileName: () => 'view.js' },
  },
});
const js = [res].flat()[0].output.find((o) => o.type === 'chunk').code;
const css = themeScoped(fs.readFileSync(path.join(repo, 'src', 'styles.css'), 'utf8'))
  + fs.readFileSync(path.join(repo, 'mcp', 'ui', 'view.css'), 'utf8');
// Keep "</script>" or "</style>" in the bundle from closing the tags early.
const safe = (s, tag) => s.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mufka</title>
<style>${safe(css, 'style')}</style>
</head><body><div id="root"></div>
<script>${safe(js, 'script')}</script>
</body></html>
`;
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'view.html'), html);
console.log(`out/mcp-ui/view.html  ${(html.length / 1024).toFixed(1)} kB`);
