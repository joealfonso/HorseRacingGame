// Shared helpers for the art scripts: the master palette, a tiny pixel canvas,
// and a PNG encoder.
//
// The encoder writes RGBA PNGs with only IHDR, IDAT and IEND, so there are no
// gamma, ICC or time chunks for a browser to act on. The image data is wrapped in
// stored (uncompressed) deflate blocks with our own CRC and Adler checksums. That
// makes the bytes depend only on the pixels, never on the zlib build or the CPU,
// so rerunning any script gives identical files on any machine. The files are tiny,
// so skipping compression costs nothing that matters.
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

// The 42-color master palette from DESIGN.md, by name. No other color may appear.
export const PALETTE = {
  Ink: '#14111C', Coal: '#2E2A38', Slate: '#575464', Ash: '#8E8A98', Mist: '#C7C3CC', Bone: '#F6F0E2',
  Copper: '#C46A32', Auburn: '#8E4526', Mahogany: '#5C2B1A', Bitter: '#351812', Sheen: '#4B4D68', Roan: '#A87C72',
  Peach: '#F4C9A0', Tan: '#D29A68', Umber: '#9C6440', Cocoa: '#603A26',
  Parchment: '#EEDCAA', Dirt: '#C99C5E', 'Dirt Shade': '#9A6E3E', Mud: '#64452A', Synthetic: '#604A4C', 'Synthetic Light': '#8A6E6A',
  Leaf: '#9CD474', Grass: '#58A844', Turf: '#2E8038', Pine: '#1C4C2C', Hay: '#CDB85C',
  'Sky Pale': '#B0D8F6', Sky: '#5E9FE6', Dusk: '#EC9060',
  Red: '#D8302C', Maroon: '#842234', Orange: '#F2862A', Gold: '#DEA630', Yellow: '#F8DA3A', Lime: '#B8E020',
  Emerald: '#1AA85A', Turquoise: '#22BCB4', Royal: '#2A54D6', Navy: '#1C2A78', Purple: '#7A3AC2', Pink: '#F28CBA',
};

export function rgb(name) {
  const hex = PALETTE[name];
  if (!hex) throw new Error(`not a master palette color: ${name}`);
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

// Repo root and the public asset folder, found from this file's location.
export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ASSET_ROOT = join(REPO, 'public', 'assets');

// A slot id to its file: dots become slashes. art.race.gate -> public/assets/art/race/gate.png
export function slotPath(slot) {
  return join(ASSET_ROOT, ...slot.split('.')) + '.png';
}

// A pixel canvas holding palette names (or null for transparent).
export class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Array(w * h).fill(null);
  }
  set(x, y, color) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    if (color !== null) rgb(color); // throws on a non-palette name
    this.px[y * this.w + x] = color;
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.px[y * this.w + x];
  }
  rect(x, y, w, h, color) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color);
  }
  // Paint rows of characters. `key` maps a character to a palette name; '.' is skipped.
  draw(rows, key, ox = 0, oy = 0) {
    rows.forEach((row, j) => {
      [...row].forEach((ch, i) => {
        if (ch === '.' || ch === ' ') return;
        if (!(ch in key)) throw new Error(`no color for '${ch}'`);
        this.set(ox + i, oy + j, key[ch]);
      });
    });
  }
  // Copy another canvas on top, skipping its transparent pixels.
  blit(src, ox, oy) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const c = src.get(x, y);
      if (c !== null) this.set(ox + x, oy + y, c);
    }
  }
  colors() {
    return [...new Set(this.px.filter((c) => c !== null))];
  }
}

// Lay frames left to right into one strip, no padding.
export function strip(frames) {
  const w = frames[0].w;
  const h = frames[0].h;
  for (const f of frames) if (f.w !== w || f.h !== h) throw new Error('frames differ in size');
  const out = new Canvas(w * frames.length, h);
  frames.forEach((f, i) => out.blit(f, i * w, 0));
  return out;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(buf) {
  let a = 1;
  let b = 0;
  for (const v of buf) {
    a = (a + v) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

// zlib stream made of stored deflate blocks (no compression).
function zlibStored(data) {
  const parts = [Buffer.from([0x78, 0x01])];
  const MAX = 65535;
  for (let off = 0; off < data.length || off === 0; off += MAX) {
    const len = Math.min(MAX, data.length - off);
    const last = off + len >= data.length ? 1 : 0;
    const head = Buffer.alloc(5);
    head[0] = last;
    head.writeUInt16LE(len, 1);
    head.writeUInt16LE(~len & 0xffff, 3);
    parts.push(head, data.subarray(off, off + len));
    if (last) break;
  }
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(adler32(data));
  parts.push(tail);
  return Buffer.concat(parts);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function encodePng(canvas) {
  const { w, h } = canvas;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const c = canvas.get(x, y);
      if (c === null) {
        o += 4; // transparent black
      } else {
        const [r, g, b] = rgb(c);
        raw[o++] = r;
        raw[o++] = g;
        raw[o++] = b;
        raw[o++] = 255;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibStored(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Read back an 8-bit RGBA, non-interlaced PNG (what encodePng writes, and what
// the verify script expects). Returns { w, h, data } with 4 bytes per pixel.
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8;
  let w = 0;
  let h = 0;
  const idat = [];
  const types = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    types.push(type);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error('only 8-bit RGBA, no interlace');
    } else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const data = Buffer.alloc(w * h * 4);
  const stride = w * 4;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? data[y * stride + i - 4] : 0;
      const b = y > 0 ? data[(y - 1) * stride + i] : 0;
      const c = i >= 4 && y > 0 ? data[(y - 1) * stride + i - 4] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      data[y * stride + i] = v & 0xff;
    }
  }
  return { w, h, data, chunks: types };
}

// Write a canvas to a file path, making folders as needed.
export function writePng(path, canvas) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(canvas));
}

// Write a canvas to its slot's file and return the path.
export function writeSlot(slot, canvas) {
  const path = slotPath(slot);
  writePng(path, canvas);
  return path;
}
