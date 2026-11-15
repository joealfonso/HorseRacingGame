// Test support only: nothing in the game imports this file. A PNG reader and a tiny
// compositor that mirror what the scenes' Phaser calls do (frames from a sheet, flipX, a
// top-left crop, exact palette swaps, the fonts painted in one color with Ink kept, as
// src/render/recolor.ts paintGlyphs does), so a screen built from the pure modules and the
// shipped PNGs can be compared with an accepted mock pixel for pixel.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import paletteJson from '../data/palette.json';
import slotsJson from '../data/slots.json';
import { DISPLAY_CHARS, MAIN_CHARS, SMALL_CHARS } from './fontLayout';
import type { PageRect, PageText } from './page';

export const ROOT = new URL('../../', import.meta.url).pathname;

export interface Png { w: number; h: number; data: Uint8Array }

export function readPng(path: string): Png {
  const buf = readFileSync(path);
  let off = 8;
  let w = 0;
  let h = 0;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      if (body[8] !== 8 || body[9] !== 6) throw new Error(`${path}: only 8-bit RGBA`);
    } else if (type === 'IDAT') idat.push(body);
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const data = new Uint8Array(w * h * 4);
  const stride = w * 4;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? data[y * stride + i - 4] : 0;
      const b = y > 0 ? data[(y - 1) * stride + i] : 0;
      const c = i >= 4 && y > 0 ? data[(y - 1) * stride + i - 4] : 0;
      let v = raw[y * (stride + 1) + 1 + i];
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
  return { w, h, data };
}

const HEX = new Map(paletteJson.colors.map((c) => [c.name, parseInt(c.hex.slice(1), 16)]));
export const rgbOf = (name: string): number => {
  const v = HEX.get(name);
  if (v === undefined) throw new Error(`no palette color ${name}`);
  return v;
};
/** The palette color's name for an RGB value, or null if it is not a palette color. */
export const nameOf = (rgb: number): string | null => {
  for (const [n, v] of HEX) if (v === rgb) return n;
  return null;
};
const INK = rgbOf('Ink');

type Slot = { id: string; file: string | null; frameWidth?: number; frameHeight?: number; frames?: number; columns?: number };
const slots = new Map((slotsJson.slots as Slot[]).map((s) => [s.id, s]));
const pngs = new Map<string, Png>();
export const sheet = (id: string): Png => {
  let p = pngs.get(id);
  if (!p) { p = readPng(join(ROOT, 'public', slots.get(id)!.file!)); pngs.set(id, p); }
  return p;
};

export interface ImageOp {
  slot: string;
  frame: number;
  x: number;
  y: number;
  flipX?: boolean;
  crop?: { w: number; h: number };
  swaps?: readonly (readonly [string, string])[];
}

const FONTS = {
  main: { id: 'font.ui.main', w: 8, h: 8, chars: MAIN_CHARS },
  small: { id: 'font.ui.small', w: 4, h: 6, chars: SMALL_CHARS },
  display: { id: 'font.ui.display', w: 12, h: 16, chars: DISPLAY_CHARS },
} as const;

/** A 256x240 canvas of RGB values; -1 is unset. */
export class Frame {
  px = new Int32Array(256 * 240).fill(-1);
  set(x: number, y: number, rgb: number) { if (x >= 0 && y >= 0 && x < 256 && y < 240) this.px[y * 256 + x] = rgb; }
  fill(color: string) { this.px.fill(rgbOf(color)); }
  rects(list: readonly PageRect[]) { for (const r of list) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) this.set(x, y, rgbOf(r.color)); }
  image(op: ImageOp) {
    const slot = slots.get(op.slot)!;
    const p = sheet(op.slot);
    const fw = slot.frameWidth!;
    const fh = slot.frameHeight!;
    const cols = Math.min(slot.columns ?? slot.frames ?? 1, slot.frames ?? 1);
    const ox = (op.frame % cols) * fw;
    const oy = Math.floor(op.frame / cols) * fh;
    const swaps = new Map((op.swaps ?? []).map(([a, b]) => [rgbOf(a), rgbOf(b)]));
    const w = op.crop?.w ?? fw;
    const h = op.crop?.h ?? fh;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = op.flipX ? fw - 1 - x : x;
        const i = ((oy + y) * p.w + ox + sx) * 4;
        if (p.data[i + 3] === 0) continue;
        const rgb = (p.data[i] << 16) | (p.data[i + 1] << 8) | p.data[i + 2];
        this.set(op.x + x, op.y + y, swaps.get(rgb) ?? rgb);
      }
    }
  }
  text(t: PageText) {
    const F = t.display ? FONTS.display : t.small ? FONTS.small : FONTS.main;
    const p = sheet(F.id);
    const color = rgbOf(t.color);
    [...t.text].forEach((c, k) => {
      const n = F.chars.indexOf(c);
      if (n < 0) throw new Error(`no glyph ${c}`);
      const gx = (n % 16) * F.w;
      const gy = Math.floor(n / 16) * F.h;
      for (let y = 0; y < F.h; y++) {
        for (let x = 0; x < F.w; x++) {
          const i = ((gy + y) * p.w + gx + x) * 4;
          if (p.data[i + 3] < 128) continue;
          const rgb = (p.data[i] << 16) | (p.data[i + 1] << 8) | p.data[i + 2];
          this.set(t.x + k * F.w + x, t.y + y, rgb === INK ? INK : color);
        }
      }
    });
  }
  /** Every pixel that differs from the mock at `path` (a 256x240 RGBA PNG), as "x,y: got, mock". */
  diff(path: string): string[] {
    const mock = readPng(path);
    const out: string[] = [];
    for (let y = 0; y < 240; y++) {
      for (let x = 0; x < 256; x++) {
        const i = (y * 256 + x) * 4;
        const want = (mock.data[i] << 16) | (mock.data[i + 1] << 8) | mock.data[i + 2];
        const got = this.px[y * 256 + x];
        if (got !== want) out.push(`${x},${y}: got ${nameOf(got) ?? got.toString(16)}, mock ${nameOf(want) ?? want.toString(16)}`);
      }
    }
    return out;
  }
  /** The palette colors used in a box, by name. */
  colorsIn(x0: number, y0: number, x1: number, y1: number): Set<string> {
    const out = new Set<string>();
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.add(nameOf(this.px[y * 256 + x]) ?? `#${this.px[y * 256 + x].toString(16)}`);
    return out;
  }
}
