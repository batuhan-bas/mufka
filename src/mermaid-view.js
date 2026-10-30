// ```mermaid diagrams in notes: drawn in the sandbox window (main.js) and shown
// here as an image of the SVG, so nothing in the diagram can run or reach out.
// Drawn diagrams are remembered by their source.
const MAX_CACHED = 100;

export function createMermaid({ render }) {
  const cache = new Map(); // source -> { svg } | { error }

  function draw(box, code, res) {
    box.replaceChildren();
    if (res && res.svg) {
      const img = document.createElement('img');
      img.className = 'mermaid-img';
      img.alt = 'Diagram';
      const vb = /viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/.exec(res.svg);
      if (vb) { img.width = Math.round(Number(vb[1])); img.height = Math.round(Number(vb[2])); }
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(res.svg)}`;
      box.append(img);
      return;
    }
    const err = document.createElement('div');
    err.className = 'mermaid-error';
    err.textContent = `Mermaid: ${(res && res.error) || 'the diagram could not be drawn'}`;
    const pre = document.createElement('pre');
    const c = document.createElement('code');
    c.textContent = code;
    pre.append(c);
    box.append(err, pre);
  }

  function block(code) {
    const box = document.createElement('div');
    box.className = 'mermaid-box';
    const done = cache.get(code);
    if (done) { draw(box, code, done); return box; }
    box.append(Object.assign(document.createElement('p'), { className: 'dv-empty', textContent: 'Drawing…' }));
    Promise.resolve(render(code))
      .then((res) => {
        if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value);
        cache.set(code, res);
        draw(box, code, res);
      })
      .catch((e) => draw(box, code, { error: e && e.message ? e.message : String(e) }));
    return box;
  }

  return { block };
}
