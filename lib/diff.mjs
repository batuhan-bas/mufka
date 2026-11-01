// Line differences between two texts (the version history shows what a past
// version changes). Pure: used by the renderer.

// A line diff of `a` → `b`: [{ op: ' ' | '-' | '+', text }]. Common lines at
// both ends are trimmed first; past ~4M cells the middle is shown as removed
// then added rather than aligned.
export function lineDiff(a, b) {
  const x = String(a).split('\n');
  const y = String(b).split('\n');
  let start = 0;
  while (start < x.length && start < y.length && x[start] === y[start]) start++;
  let endX = x.length;
  let endY = y.length;
  while (endX > start && endY > start && x[endX - 1] === y[endY - 1]) { endX--; endY--; }
  const head = x.slice(0, start).map((text) => ({ op: ' ', text }));
  const tail = x.slice(endX).map((text) => ({ op: ' ', text }));
  const mx = x.slice(start, endX);
  const my = y.slice(start, endY);
  let mid;
  if (mx.length * my.length > 4e6) {
    mid = [...mx.map((text) => ({ op: '-', text })), ...my.map((text) => ({ op: '+', text }))];
  } else {
    // Longest common subsequence table, from the end.
    const w = my.length + 1;
    const lcs = new Uint32Array((mx.length + 1) * w);
    for (let i = mx.length - 1; i >= 0; i--) {
      for (let j = my.length - 1; j >= 0; j--) {
        lcs[i * w + j] = mx[i] === my[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
      }
    }
    mid = [];
    let i = 0;
    let j = 0;
    while (i < mx.length && j < my.length) {
      if (mx[i] === my[j]) { mid.push({ op: ' ', text: mx[i] }); i++; j++; }
      else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) { mid.push({ op: '-', text: mx[i] }); i++; }
      else { mid.push({ op: '+', text: my[j] }); j++; }
    }
    while (i < mx.length) mid.push({ op: '-', text: mx[i++] });
    while (j < my.length) mid.push({ op: '+', text: my[j++] });
  }
  return [...head, ...mid, ...tail];
}
