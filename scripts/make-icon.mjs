// Generate build/icon.png (1024x1024) with no dependencies, using only the
// Node 'zlib' built-in to encode a PNG. Run: node scripts/make-icon.mjs
// Then build/icon.icns is produced from it by scripts/make-icns.sh (macOS).
//
// Design: a saffron rounded tile holding a white planner page with a dark
// header, two binding rings, and a 3x3 grid of day dots — the top-centre dot
// is saffron ("today"), matching the app's rule that saffron means today.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const S = 1024;
const buf = Buffer.alloc(S * S * 4); // RGBA, transparent

const SAFFRON = [244, 196, 48, 255];
const INK = [43, 42, 38, 255];
const PAPER = [250, 248, 243, 255];

function set(x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
}

// Filled rounded rectangle. In each corner region, keep only pixels inside the
// corner's quarter-circle.
function roundRect(x0, y0, x1, y1, r, color) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      let cx = null; let cy = null;
      if (x < x0 + r && y < y0 + r) { cx = x0 + r; cy = y0 + r; }
      else if (x >= x1 - r && y < y0 + r) { cx = x1 - r - 1; cy = y0 + r; }
      else if (x < x0 + r && y >= y1 - r) { cx = x0 + r; cy = y1 - r - 1; }
      else if (x >= x1 - r && y >= y1 - r) { cx = x1 - r - 1; cy = y1 - r - 1; }
      if (cx !== null && (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      set(x, y, color);
    }
  }
}

function disc(cx, cy, r, color) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(x, y, color);
    }
  }
}

// Saffron tile.
roundRect(96, 96, 928, 928, 190, SAFFRON);

// Planner page.
roundRect(248, 300, 776, 792, 56, PAPER);
// Dark header band (square-cornered bottom, rounded top via overlap).
roundRect(248, 300, 776, 392, 56, INK);
roundRect(248, 360, 776, 392, 0, INK);

// Binding rings poking above the page.
roundRect(356, 250, 404, 338, 20, INK);
roundRect(620, 250, 668, 338, 20, INK);

// 3x3 grid of day dots; top-centre is "today" (saffron).
const cols = [368, 512, 656];
const rows = [500, 612, 724];
for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 3; c++) {
    const today = r === 0 && c === 1;
    disc(cols[c], rows[r], 34, today ? SAFFRON : INK);
  }
}

// --- PNG encode (truecolour + alpha, bit depth 8) ---
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 6;   // colour type RGBA
// compression/filter/interlace default 0

// Add a zero filter byte per scanline.
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const idat = deflateSync(raw, { level: 9 });

const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync('build', { recursive: true });
writeFileSync('build/icon.png', png);
console.log('wrote build/icon.png', png.length, 'bytes');
