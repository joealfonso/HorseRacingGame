import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import slotsJson from '../data/slots.json';
import paletteJson from '../data/palette.json';
import { loadHub } from '../data/hubLoad';
import { dayWith, ctx, drawnOf, programOf, rd } from './betKit';
import { HUB_PEOPLE, hubBackdrop, hubFills, hubSprites, type HubImage } from './hubPicture';
import { hubScreen, idleClock, initialHubState } from './hubScreen';
import { MAIN_CHARS, SMALL_CHARS } from './fontLayout';
import type { PageRect, PageText } from './page';

// The track drawn headless from the pure modules and the shipped PNGs, in the order the
// scene draws it, against the accepted mock docs/mocks/track-hub/a-windows.png (race 3,
// the mock's prices, focus on Windows, the first frame). Pixel for pixel. Test support
// below (a PNG reader and a tiny compositor) mirrors what the scene's Phaser calls do:
// frames from a sheet, flipX, a top-left crop, exact palette swaps, and the fonts painted
// in one color with Ink kept (src/render/recolor.ts paintGlyphs).

const ROOT = new URL('../../', import.meta.url).pathname;
const hub = loadHub();

interface Png { w: number; h: number; data: Uint8Array }
function readPng(path: string): Png {
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
const rgbOf = (name: string): number => {
  const v = HEX.get(name);
  if (v === undefined) throw new Error(`no palette color ${name}`);
  return v;
};
const INK = rgbOf('Ink');

type Slot = { id: string; file: string | null; frameWidth?: number; frameHeight?: number; frames?: number; columns?: number };
const slots = new Map((slotsJson.slots as Slot[]).map((s) => [s.id, s]));
const pngs = new Map<string, Png>();
const sheet = (id: string): Png => {
  let p = pngs.get(id);
  if (!p) { p = readPng(join(ROOT, 'public', slots.get(id)!.file!)); pngs.set(id, p); }
  return p;
};

/** A 256x240 canvas of RGB values; -1 is unset. */
class Frame {
  px = new Int32Array(256 * 240).fill(-1);
  set(x: number, y: number, rgb: number) { if (x >= 0 && y >= 0 && x < 256 && y < 240) this.px[y * 256 + x] = rgb; }
  rects(list: readonly PageRect[]) { for (const r of list) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) this.set(x, y, rgbOf(r.color)); }
  image(op: HubImage) {
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
    const small = t.small === true;
    const p = sheet(small ? 'font.ui.small' : 'font.ui.main');
    const [cw, ch, chars] = small ? [4, 6, SMALL_CHARS] : [8, 8, MAIN_CHARS];
    const color = rgbOf(t.color);
    [...t.text].forEach((c, k) => {
      const n = chars.indexOf(c);
      if (n < 0) throw new Error(`no glyph ${c}`);
      const gx = (n % 16) * cw;
      const gy = Math.floor(n / 16) * ch;
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const i = ((gy + y) * p.w + gx + x) * 4;
          if (p.data[i + 3] < 128) continue;
          const rgb = (p.data[i] << 16) | (p.data[i + 1] << 8) | p.data[i + 2];
          this.set(t.x + k * cw + x, t.y + y, rgb === INK ? INK : color);
        }
      }
    });
  }
}

describe('the track at race 3, focus on Windows, matches the accepted mock pixel for pixel', () => {
  const MOCK_ODDS = ['5-2', '9-2', '7-2', '26-1', '3-1', '8-1', '4-1', '12-1']; // scripts/art/hub_mock.mjs
  const sc = hubScreen({
    hub, rd, ctx, day: dayWith(10000), drawn: drawnOf()[2], program: programOf(3), state: initialHubState(hub),
    seconds: 0, reducedMotion: false, cursorFrames: 2,
  });

  it('every pixel', () => {
    const f = new Frame();
    f.rects(hubFills(sc.sky));
    for (const op of hubBackdrop()) f.image(op);
    for (const op of hubSprites(hub, rd, idleClock(0), 0, false)) f.image(op);
    f.rects(sc.bar);
    const B = hub.box.value.frame; // as Art.box draws it
    for (let ty = 0; ty < B.tilesH; ty++) {
      for (let tx = 0; tx < B.tilesW; tx++) {
        const col = tx === 0 ? 0 : tx === B.tilesW - 1 ? 2 : 1;
        const row = ty === 0 ? 0 : ty === B.tilesH - 1 ? 2 : 1;
        f.image({ slot: 'art.ui.frame.box', frame: row * 3 + col, x: B.x + tx * 8, y: B.y + ty * 8 });
      }
    }
    f.image({ slot: 'art.ui.cursor.horseshoe', frame: sc.cursorFrame, ...sc.cursor });
    const prices = sc.board.posts.map((p) => ({ ...p.price, text: MOCK_ODDS[p.post - 1] }));
    for (const t of [...sc.status, ...sc.voice, ...sc.doors, sc.sign, sc.board.header, ...sc.board.posts.map((p) => p.digit), ...prices]) f.text(t);
    for (const c of sc.corners) f.image({ slot: 'art.ui.focus.corner', frame: c.frame === 'top' ? 0 : 1, x: c.x, y: c.y, flipX: c.flipX });

    const mock = readPng(join(ROOT, 'docs/mocks/track-hub/a-windows.png'));
    const diffs: string[] = [];
    for (let y = 0; y < 240; y++) {
      for (let x = 0; x < 256; x++) {
        const i = (y * 256 + x) * 4;
        const want = (mock.data[i] << 16) | (mock.data[i + 1] << 8) | mock.data[i + 2];
        const got = f.px[y * 256 + x];
        if (got !== want) diffs.push(`${x},${y}: got ${got.toString(16)}, mock ${want.toString(16)}`);
      }
    }
    expect(diffs.length, diffs.slice(0, 10).join('\n')).toBe(0);
  });
});

describe('the people', () => {
  it('every person in hub.json\'s idle order has a place in the picture', () => {
    const ids = new Set(HUB_PEOPLE.map((p) => p.id));
    for (const id of hub.idle.value.order) expect(ids.has(id), id).toBe(true);
  });

  it('a person on their idle turn shows frame 1 (the idle), everyone else frame 0', () => {
    const at4 = hubSprites(hub, rd, idleClock(0), 4.25, false);
    const regular = at4.find((o) => o.x === 56 && o.y === 48)!;
    expect(regular.frame).toBe(1);
    expect(at4.filter((o) => o.slot.startsWith('art.hub.') && o.frame !== 0)).toHaveLength(1);
    expect(hubSprites(hub, rd, idleClock(0), 4.25, true).filter((o) => o.slot.startsWith('art.hub.')).every((o) => o.frame === 0)).toBe(true);
  });
});
