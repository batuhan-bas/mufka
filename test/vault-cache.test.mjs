import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVaultCache } from '../lib/vault-cache.mjs';

function vault() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mufka-vc-'));
  const write = (rel, text) => { const abs = path.join(dir, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, text); };
  const listing = () => {
    const out = [];
    const walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const r = rel ? `${rel}/${e.name}` : e.name; const abs = path.join(d, e.name); if (e.isDirectory()) walk(abs, r); else if (e.name.endsWith('.md')) { const st = fs.statSync(abs); out.push({ rel: r, abs, mtime: st.mtimeMs, ctime: st.ctimeMs, size: st.size }); } } };
    walk(dir, '');
    return out;
  };
  return { dir, write, listing };
}

test('only changed notes are read again', () => {
  const v = vault();
  v.write('A.md', 'a'); v.write('F/B.md', 'b');
  let reads = 0;
  const c = createVaultCache({ read: (abs) => { reads += 1; return fs.readFileSync(abs, 'utf8'); } });
  assert.deepEqual(c.refresh(v.listing()), { read: 2, removed: 0 });
  assert.deepEqual(c.refresh(v.listing()), { read: 0, removed: 0 }, 'nothing changed: nothing read');
  v.write('A.md', 'a, longer');
  assert.equal(c.refresh(v.listing()).read, 1);
  assert.equal(reads, 3);
  assert.deepEqual(c.all().map((n) => [n.rel, n.content]).sort(), [['A.md', 'a, longer'], ['F/B.md', 'b']]);
});

test('since() gives what changed and what went after a version', () => {
  const v = vault();
  v.write('A.md', 'a'); v.write('B.md', 'b');
  const c = createVaultCache();
  c.refresh(v.listing());
  const first = c.since(-1);
  assert.equal(first.full, true);
  assert.equal(first.changed.length, 2);
  assert.deepEqual(c.since(first.version), { version: first.version, full: false, changed: [], removed: [] });
  v.write('B.md', 'b2 changed'); fs.rmSync(path.join(v.dir, 'A.md')); v.write('C.md', 'c');
  c.refresh(v.listing());
  const d = c.since(first.version);
  assert.deepEqual(d.changed.map((n) => n.rel).sort(), ['B.md', 'C.md']);
  assert.deepEqual(d.removed, ['A.md']);
});

test('saved, and loaded at the next start: unchanged notes are not read', () => {
  const v = vault();
  v.write('A.md', 'a'); v.write('B.md', 'b');
  const file = path.join(v.dir, '..', `${path.basename(v.dir)}-cache.json`);
  const c = createVaultCache({ file });
  c.refresh(v.listing());
  assert.equal(c.save(), true);
  assert.equal(c.save(), false, 'nothing new to save');
  let reads = 0;
  const next = createVaultCache({ file, read: (abs) => { reads += 1; return fs.readFileSync(abs, 'utf8'); } });
  assert.equal(next.load(), 2);
  next.refresh(v.listing());
  assert.equal(reads, 0);
  assert.equal(next.since(-1).changed.find((n) => n.rel === 'B.md').content, 'b');
  fs.writeFileSync(file, '{broken');
  assert.equal(createVaultCache({ file }).load(), 0, 'a broken cache is an empty one');
});
