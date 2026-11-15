import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const publicDir = path.resolve(process.cwd(), 'public');
fs.mkdirSync(publicDir, { recursive: true });

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, pixelFn) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y, width, height);
      const idx = rowStart + 1 + x * 4;
      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pointInPolygon(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0];
    const yi = pts[i][1];
    const xj = pts[j][0];
    const yj = pts[j][1];
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function renderBadgePixel(x, y, size, maskable) {
  const nx = x / size;
  const ny = y / size;
  const scale = maskable ? 0.72 : 0.88;
  const sx = (nx - 0.5) / scale + 0.5;
  const sy = (ny - 0.5) / scale + 0.5;

  // Deep teal background (#0F766E) with subtle vertical gradient
  const rBg = Math.round(15 + sy * 4);
  const gBg = Math.round(118 - ny * 18);
  const bBg = Math.round(110 - ny * 12);

  if (!maskable) {
    // Rounded corners for standard icons
    const radius = 0.21;
    const cx = nx < radius ? radius : nx > 1 - radius ? 1 - radius : nx;
    const cy = ny < radius ? radius : ny > 1 - radius ? 1 - radius : ny;
    const dist = Math.hypot(nx - cx, ny - cy);
    if (dist > radius) {
      return [0, 0, 0, 0];
    }
  }

  // Mortarboard diamond top
  const cap = [
    [0.5, 0.25],
    [0.77, 0.37],
    [0.5, 0.49],
    [0.23, 0.37],
  ];
  if (pointInPolygon(sx, sy, cap)) {
    return [255, 255, 255, 255];
  }

  // Academic shield / base below cap
  const base = [
    [0.33, 0.45],
    [0.5, 0.525],
    [0.67, 0.45],
    [0.67, 0.63],
    [0.5, 0.73],
    [0.33, 0.63],
  ];
  if (pointInPolygon(sx, sy, base)) {
    return [204, 251, 241, 255];
  }

  // Gold tassel on right
  if (sx >= 0.70 && sx <= 0.74 && sy >= 0.40 && sy <= 0.62) {
    return [253, 230, 138, 255];
  }
  if (Math.hypot(sx - 0.72, sy - 0.635) <= 0.032) {
    return [253, 230, 138, 255];
  }

  return [rBg, gBg, bBg, 255];
}

const targets = [
  { name: 'pwa-192x192.png', size: 192, maskable: false },
  { name: 'pwa-512x512.png', size: 512, maskable: false },
  { name: 'pwa-maskable-512x512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180, maskable: false },
];

for (const t of targets) {
  const png = encodePNG(t.size, t.size, (x, y, w) => renderBadgePixel(x, y, w, t.maskable));
  fs.writeFileSync(path.join(publicDir, t.name), png);
  console.log(`Generated public/${t.name} (${t.size}x${t.size})`);
}
