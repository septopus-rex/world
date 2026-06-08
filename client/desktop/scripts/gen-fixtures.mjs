// Generates tiny, self-contained demo fixtures for the model+texture pipeline:
//   public/assets/pyramid.gltf  — a colored square pyramid (embedded buffer, no .bin)
//   public/assets/checker.png   — a 64x64 power-of-two checkerboard
// Run once: `node scripts/gen-fixtures.mjs`. Deterministic; safe to re-run.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
mkdirSync(outDir, { recursive: true });

// ── 1. pyramid.gltf ─────────────────────────────────────────────────────────
// Square base + apex at +Y, VERTICALLY CENTERED at the origin (base at -H/2, apex
// at +H/2) so the model's bounds-center matches the center-origin placeholder box
// it swaps in for — otherwise the swapped model floats. Flat-shaded: each triangle
// gets its own 3 vertices + face normal, so lighting reads as crisp facets.
const A = 1.0, H = 1.6; // half-base, height
const base = [[-A, -H / 2, -A], [A, -H / 2, -A], [A, -H / 2, A], [-A, -H / 2, A]];
const apex = [0, H / 2, 0];

const tris = [
  [base[0], base[1], apex], // +Z-ish side
  [base[1], base[2], apex],
  [base[2], base[3], apex],
  [base[3], base[0], apex],
  [base[0], base[2], base[1]], // base (two tris, facing -Y)
  [base[0], base[3], base[2]],
];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

const positions = [], normals = [], indices = [];
for (const [p0, p1, p2] of tris) {
  const n = norm(cross(sub(p1, p0), sub(p2, p0)));
  for (const p of [p0, p1, p2]) { positions.push(...p); normals.push(...n); }
}
for (let i = 0; i < positions.length / 3; i++) indices.push(i);

const posF32 = new Float32Array(positions);
const nrmF32 = new Float32Array(normals);
const idxU16 = new Uint16Array(indices);

// Pack: [positions][normals][indices], 4-byte aligned (float sections keep idx 2-aligned).
const posBytes = Buffer.from(posF32.buffer);
const nrmBytes = Buffer.from(nrmF32.buffer);
let idxBytes = Buffer.from(idxU16.buffer);
const pad = (4 - ((posBytes.length + nrmBytes.length + idxBytes.length) % 4)) % 4;
const buffer = Buffer.concat([posBytes, nrmBytes, idxBytes, Buffer.alloc(pad)]);

const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < positions.length; i += 3)
  for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], positions[i + k]); max[k] = Math.max(max[k], positions[i + k]); }

const gltf = {
  asset: { version: '2.0', generator: 'septopus gen-fixtures' },
  scenes: [{ nodes: [0] }],
  scene: 0,
  nodes: [{ mesh: 0, name: 'DemoPyramid' }],
  meshes: [{ name: 'pyramid', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
  materials: [{
    name: 'orange',
    pbrMetallicRoughness: { baseColorFactor: [0.95, 0.45, 0.1, 1], metallicFactor: 0.0, roughnessFactor: 0.7 },
    emissiveFactor: [0.30, 0.12, 0.02], // glows so it's visible regardless of scene lights
  }],
  buffers: [{ byteLength: buffer.length, uri: 'data:application/octet-stream;base64,' + buffer.toString('base64') }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
    { buffer: 0, byteOffset: posBytes.length, byteLength: nrmBytes.length, target: 34962 },
    { buffer: 0, byteOffset: posBytes.length + nrmBytes.length, byteLength: idxBytes.length, target: 34963 },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min, max },
    { bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
    { bufferView: 2, componentType: 5123, count: indices.length, type: 'SCALAR' },
  ],
};
writeFileSync(join(outDir, 'pyramid.gltf'), JSON.stringify(gltf));

// ── 2. checker.png (64x64, 8x8 cells, RGB) ──────────────────────────────────
function png(width, height, rgbAt) {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = rgbAt(x, y);
      const o = row + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const crcTable = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
    return t;
  })();
  const crc32 = (buf) => { let c = ~0; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (~c) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const checker = png(64, 64, (x, y) => {
  const cell = ((x >> 3) + (y >> 3)) & 1;
  return cell ? [60, 130, 200] : [235, 235, 245]; // blue / off-white tiles
});
writeFileSync(join(outDir, 'checker.png'), checker);

console.log('wrote', join(outDir, 'pyramid.gltf'), 'and checker.png');
