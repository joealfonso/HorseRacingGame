// Mock of the book and the window (docs/specs/book-and-window.md, ruled by section 18).
// A mock for Joseph to approve or reject the look. Nothing here is slot art yet: no file is
// written under public/, and nothing is added to slots.json or docs/ASSETS.md.
// Run: node scripts/art/book_mock.mjs
//
// Reuses, as drawn: the palette (png.mjs), font.ui.main, font.ui.small, art.ui.frame.box,
// art.ui.cursor.horseshoe, art.ui.marker.yours, art.ui.mark.pick, art.ui.focus.corner, and
// the track's accepted art under public/assets/art/ (clerk, sign plate, stand, board, people).
// Draws new, for this mock only: the cover picture (18.2 as revised by 19.2), the display font glyphs the
// masthead needs (18.5 D), the window booth (19.3), the 32x48 close-up clerk (19.3) and the program on the counter.
//
// Writes docs/mocks/book-and-window/<sheet>.png at 1x and <sheet>-3x.png nearest neighbor,
// plus <sheet>-gray(-3x).png where 18.6 asks for grayscale. Checks every sheet and exits 1
// on a failure: every pixel a palette color, the cover only Parchment, Ink and Maroon, and
// the window picture at most 8 colors in each 16x16 cell.
import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { deflateSync } from 'node:zlib';
import { Canvas, PALETTE, REPO, decodePng, rgb, slotPath, writePng } from './png.mjs';
import { FAN_RECOLORS } from './hub.mjs';

const OUT = join(REPO, 'docs', 'mocks', 'book-and-window');
const DATA = (f) => JSON.parse(readFileSync(join(REPO, 'src', 'data', f), 'utf8'));
const DAY = DATA('day.json');
const STABLE = DATA('stable.json');
const RD = DATA('raceDay.json');
const HUB = DATA('hub.json');
const fails = [];

// ------------------------------------------------------------- shipped art, as drawn
const HEX = Object.fromEntries(Object.entries(PALETTE).map(([n, h]) => [h.toUpperCase(), n]));
function load(slot) {
  const { w, h, data } = decodePng(readFileSync(slotPath(slot)));
  const c = new Canvas(w, h);
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3];
    if (a === 0) continue;
    if (a !== 255) throw new Error(`${slot}: alpha ${a}`);
    const hex = '#' + [0, 1, 2].map((k) => data[i * 4 + k].toString(16).padStart(2, '0')).join('').toUpperCase();
    if (!HEX[hex]) throw new Error(`${slot}: off-palette ${hex}`);
    c.set(i % w, Math.floor(i / w), HEX[hex]);
  }
  return c;
}
function sub(c, x0, y0, w, h) {
  const f = new Canvas(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f.set(x, y, c.get(x0 + x, y0 + y));
  return f;
}
const frame = (c, i, fw, fh = c.h) => sub(c, i * fw, 0, fw, fh);
function flipX(c) {
  const f = new Canvas(c.w, c.h);
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) f.set(c.w - 1 - x, y, c.get(x, y));
  return f;
}
function recolor(c, map) {
  const f = new Canvas(c.w, c.h);
  for (let i = 0; i < c.px.length; i++) f.px[i] = c.px[i] === null ? null : (map[c.px[i]] ?? c.px[i]);
  return f;
}

const A = {
  main: load('font.ui.main'),
  small: load('font.ui.small'),
  box: load('art.ui.frame.box'),
  shoe: load('art.ui.cursor.horseshoe'),
  yours: load('art.ui.marker.yours'),
  pick: load('art.ui.mark.pick'),
  corner: load('art.ui.focus.corner'),
  clerk: load('art.hub.clerk'),
  plate: load('art.hub.sign.plate'),
  // the track, for sheets 2 and 6
  crowd: load('art.race.bg.mid.crowd'),
  infield: load('art.race.bg.mid.infield'),
  flag: load('art.race.ambient.flag'),
  dirt: load('art.track.dirt.fast'),
  railFar: load('art.race.rail.far'),
  railNear: load('art.race.rail.near'),
  apron: load('art.hub.apron'),
  board: load('art.hub.tote.board'),
  upper: load('art.hub.stand.upper'),
  facade: load('art.hub.stand.facade'),
  gate: load('art.hub.paddock.gate'),
  cart: load('art.hub.cart'),
  regular: load('art.hub.regular'),
  bettor: load('art.hub.bettor.back'),
  fan: load('art.hub.fan.back'),
  bugler: load('art.hub.bugler'),
  vendor: load('art.hub.vendor'),
  railProgram: load('art.hub.rail.program'),
};
const PAPER_SHOE = recolor(frame(A.shoe, 0, 8), { Yellow: 'Gold', Gold: 'Auburn' }); // DESIGN, Cursor on paper
const NAVY_SHOE = frame(A.shoe, 0, 8);

// ------------------------------------------------------------- text
function text(dst, str, x, y, color = 'Bone') {
  [...str].forEach((ch, i) => {
    const n = ch.charCodeAt(0) - 32;
    if (n < 0 || n > 94) throw new Error(`no main glyph ${ch}`);
    dst.blit(recolor(sub(A.main, (n % 16) * 8, Math.floor(n / 16) * 8, 8, 8), { Bone: color }), x + i * 8, y);
  });
}
const textRight = (dst, str, last, y, color) => text(dst, str, last + 1 - str.length * 8, y, color);
const textCenter = (dst, str, y, color) => text(dst, str, Math.floor((256 - 8 * str.length) / 2), y, color);
const SMALL = '0123456789:./#- ';
function small(dst, str, x, y, color = 'Bone') {
  [...str].forEach((ch, i) => {
    const k = SMALL.indexOf(ch);
    if (k < 0) throw new Error(`no small glyph ${ch}`);
    dst.blit(recolor(sub(A.small, k * 4, 0, 4, 6), { Bone: color }), x + i * 4, y);
  });
}
// "Day" in the main font and "#12345" in the small font on its rows 2-6 (DESIGN).
function dayPair(dst, x, y, seed) {
  text(dst, 'Day', x, y, 'Ink');
  small(dst, `#${seed}`, x + 28, y + 2, 'Ink');
}
const dayPairRight = (dst, last, y, seed) => dayPair(dst, last + 1 - (28 + 4 * (seed.length + 1)), y, seed);

// ------------------------------------------------------------- display font (18.5 D)
// font.ui.display: 12x16 cell, glyph 10x14 in columns 0-9 and rows 0-13, capitals only,
// stems and horizontal strokes 2 px. Drawn fresh for this mock. Only the glyphs the track
// name in day.json needs are drawn; all 41 are needed before intake.
const DISPLAY = {
  C: [
    '...####...',
    '.########.',
    '###....###',
    '##......##',
    '##........',
    '##........',
    '##........',
    '##........',
    '##........',
    '##........',
    '##......##',
    '###....###',
    '.########.',
    '...####...',
  ],
  H: [
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##########',
    '##########',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
  ],
  U: [
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '###....###',
    '.########.',
    '...####...',
  ],
  R: [
    '########..',
    '#########.',
    '##.....###',
    '##......##',
    '##......##',
    '##.....###',
    '#########.',
    '########..',
    '##...###..',
    '##....###.',
    '##.....##.',
    '##.....###',
    '##......##',
    '##......##',
  ],
  I: [
    '.########.',
    '.########.',
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '.########.',
    '.########.',
  ],
  L: [
    '##........',
    '##........',
    '##........',
    '##........',
    '##........',
    '##........',
    '##........',
    '##........',
    '##........',
    '##........',
    '##........',
    '##........',
    '##########',
    '##########',
  ],
  D: [
    '#######...',
    '########..',
    '##....###.',
    '##.....###',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##.....###',
    '##....###.',
    '########..',
    '#######...',
  ],
  O: [
    '...####...',
    '.########.',
    '###....###',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '###....###',
    '.########.',
    '...####...',
  ],
  W: [
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##..##..##',
    '##..##..##',
    '##..##..##',
    '##..##..##',
    '##.####.##',
    '###.##.###',
    '.###..###.',
    '..##..##..',
  ],
  N: [
    '##......##',
    '###.....##',
    '####....##',
    '##.##...##',
    '##.##...##',
    '##..##..##',
    '##..##..##',
    '##...##.##',
    '##...##.##',
    '##....####',
    '##.....###',
    '##......##',
    '##......##',
    '##......##',
  ],
  S: [
    '..######..',
    '.########.',
    '###....###',
    '##........',
    '###.......',
    '.#######..',
    '..#######.',
    '.......###',
    '........##',
    '........##',
    '........##',
    '###....###',
    '.########.',
    '..######..',
  ],
  ' ': Array(14).fill('..........'),
};
function display(dst, str, y, color) {
  const s = str.toUpperCase();
  const x0 = Math.floor((256 - 12 * s.length) / 2);
  [...s].forEach((ch, i) => {
    const g = DISPLAY[ch];
    if (!g) throw new Error(`no display glyph ${ch}`);
    g.forEach((row, ry) => [...row].forEach((p, rx) => { if (p === '#') dst.set(x0 + i * 12 + rx, y + ry, color); }));
  });
}

// ------------------------------------------------------------- cover picture (18.2)
// 240x128, Ink and Maroon only, paper (transparent) is the light. Built as masks so every
// part gets its Ink edge from its own silhouette, and the two-ink knockout (a 1 px paper line
// where Ink lies over a dark shape behind it) comes from the parts' owners.
const PW = 240;
const PH = 128;
const P = 'Parchment';
class Pic {
  constructor() {
    this.c = new Canvas(PW, PH);
    this.own = new Array(PW * PH).fill(null);
  }
  dark(x, y) { const v = this.c.get(x, y); return v === 'Ink' || v === 'Maroon'; }
}
const key = (x, y) => y * 1000 + x;
const unkey = (k) => [k % 1000, Math.floor(k / 1000)];
class Mask {
  constructor() { this.s = new Set(); }
  add(x, y) { if (x >= 0 && y >= 0 && x < PW && y < PH) this.s.add(key(x, y)); return this; }
  has(x, y) { return this.s.has(key(x, y)); }
  union(...ms) { for (const m of ms) for (const k of m.s) this.s.add(k); return this; }
  minus(m) { for (const k of m.s) this.s.delete(k); return this; }
  *[Symbol.iterator]() { for (const k of this.s) yield unkey(k); }
  rect(x, y, w, h) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.add(x + i, y + j); return this; }
  poly(pts) {
    const ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const cy = y + 0.5;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        if ((y1 <= cy && y2 > cy) || (y2 <= cy && y1 > cy)) xs.push(x1 + ((cy - y1) * (x2 - x1)) / (y2 - y1));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.ceil(xs[i] - 0.5); x <= Math.floor(xs[i + 1] - 0.5); x++) this.add(x, y);
      }
    }
    return this;
  }
  ellipse(cx, cy, rx, ry) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) this.add(x, y);
    }
    return this;
  }
  // A thick line: a w x w stamp along the Bresenham line from a to b.
  line([x0, y0], [x1, y1], w) {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    const o = Math.floor((w - 1) / 2);
    for (;;) {
      this.rect(x - o, y - o, w, w);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
    return this;
  }
  translate(dx, dy) { const m = new Mask(); for (const [x, y] of this) m.add(x + dx, y + dy); return m; }
}
// Paint a mask: pixels with a 4-neighbor outside `edgeOf` (default the mask) take `edge`, the
// rest `fill`. `color(x, y, isEdge)` may override per pixel. `knock(owner)` says which dark
// pixels behind get a 1 px paper line around the mask (8-neighbors).
function paint(pic, mask, { fill, edge = 'Ink', id, edgeOf = mask, color = null, knock = null }) {
  if (knock) {
    for (const [x, y] of mask) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const nx = x + i;
      const ny = y + j;
      if (mask.has(nx, ny) || nx < 0 || ny < 0 || nx >= PW || ny >= PH) continue;
      if (pic.dark(nx, ny) && knock(pic.own[ny * PW + nx])) {
        pic.c.set(nx, ny, P);
        pic.own[ny * PW + nx] = 'knock';
      }
    }
  }
  for (const [x, y] of mask) {
    const isEdge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => !edgeOf.has(x + i, y + j));
    const v = color ? color(x, y, isEdge) : isEdge ? edge : fill;
    pic.c.set(x, y, v);
    pic.own[y * PW + x] = id;
  }
}

// One horse and rider, side on, facing right, in a 56x40 box: nose at box x55, cap top at
// box y0, hoof line box y39. Drawn at this size, never scaled from the race sprite.
const STRIDES = {
  // reach: forelegs forward, hinds back
  reach: {
    farFore: [[37, 23], [42, 29], [46, 33], [48, 35]],
    nearFore: [[39, 23], [45, 29], [50, 34], [53, 38]],
    farHind: [[17, 22], [13, 29], [9, 33], [6, 36]],
    nearHind: [[14, 22], [10, 30], [5, 35], [2, 38]],
  },
  // gather: legs folded under
  gather: {
    farFore: [[37, 23], [38, 30], [37, 35], [38, 38]],
    nearFore: [[39, 23], [44, 29], [41, 33], [38, 34]],
    farHind: [[18, 22], [16, 29], [21, 33], [24, 35]],
    nearHind: [[15, 22], [13, 29], [17, 34], [19, 38]],
  },
  // mid-stride: one foreleg leading
  mid: {
    farFore: [[37, 23], [37, 30], [36, 35], [37, 38]],
    nearFore: [[39, 23], [45, 28], [50, 31], [53, 33]],
    farHind: [[17, 22], [12, 29], [8, 33], [5, 35]],
    nearHind: [[15, 22], [11, 29], [12, 34], [13, 38]],
  },
};
function legMask(pts) {
  const m = new Mask();
  m.line(pts[0], pts[1], 3);
  m.line(pts[1], pts[2], 2);
  m.line(pts[2], pts[3], 2);
  const [hx, hy] = pts[3];
  m.rect(hx - 1, hy, 3, 2); // the hoof, 3 wide, to the hoof line
  return m;
}
function horse(pic, ox, oy, o) {
  const g = o.id;
  const T = (m) => m.translate(ox, oy);
  const S = STRIDES[o.stride];
  const bob = o.bob ?? 0; // the body rides 1 px higher in the gather, as in the race frames
  const body = new Mask()
    .ellipse(13, 19 + bob, 8, 6.5)
    .poly([[12, 13 + bob], [35, 12 + bob], [41, 14 + bob], [43, 18 + bob], [42, 23 + bob], [38, 25 + bob], [30, 25 + bob], [22, 24 + bob], [16, 24 + bob], [12, 25 + bob]])
    .poly([[33, 13 + bob], [39, 9], [44, 5], [48, 4], [49, 9], [45, 13], [43, 19 + bob], [39, 18 + bob]])
    .poly([[46, 4], [49, 3], [52, 6], [56, 9.5], [56, 12.5], [52, 12.5], [49, 11], [47, 10]])
    .add(47, 2).add(47, 3).add(48, 3);
  const tail = new Mask().line([7, 14 + bob], [3, 16 + bob], 3).line([3, 16 + bob], [1, 20 + bob], 2).line([1, 20 + bob], [0, 22 + bob], 1);
  const far = new Mask().union(legMask(S.farFore), legMask(S.farHind));
  const near = new Mask().union(legMask(S.nearFore), legMask(S.nearHind));
  const kneeY = (pts) => pts[1][1];
  const nearKnees = [S.nearFore, S.nearHind];
  const farKnees = [S.farFore, S.farHind];
  const coatAt = (legs, knees, x, y, isEdge, upper) => {
    // below the knee or hock: the points, Ink
    for (const pts of knees) if (legMaskCache(pts).has(x - ox, y - oy) && y - oy > kneeY(pts)) return 'Ink';
    return isEdge ? 'Ink' : upper;
  };
  const cache = new Map();
  function legMaskCache(pts) { const k = JSON.stringify(pts); if (!cache.has(k)) cache.set(k, legMask(pts)); return cache.get(k); }

  const otherHorse = (own) => own !== null && !String(own).startsWith(g + '.');

  // far legs, then tail, then body with the near legs, then cloth, then rider
  paint(pic, T(far), { id: `${g}.far`, color: (x, y, e) => coatAt(far, farKnees, x, y, e, o.farLeg) });
  paint(pic, T(tail), { id: `${g}.tail`, fill: 'Ink' });
  const coat = new Mask().union(body, near);
  const coatT = T(coat);
  paint(pic, T(near), { id: `${g}.near`, edgeOf: coatT, knock: (own) => own === `${g}.far`, color: (x, y, e) => coatAt(near, nearKnees, x, y, e, o.coat) });
  // a light coat takes Maroon on its shade side, the belly, as a two-ink print shades it
  paint(pic, T(body), { id: `${g}.body`, edgeOf: coatT, color: (x, y, e) => (e ? 'Ink' : o.belly && y - oy >= 21 + bob && x - ox < 44 ? o.belly : o.coat) });
  if (o.muzzle) { // an Ink muzzle, the last 3 columns of the head, so a light head reads on paper
    for (const [x, y] of T(body)) if (x - ox >= 53) pic.c.set(x, y, 'Ink');
  }
  if (o.coat !== 'Ink') {
    paint(pic, T(new Mask().line([35, 11 + bob], [46, 4], 2)), { id: `${g}.body`, fill: 'Ink' }); // the mane, Ink points
    pic.c.set(ox + 50, oy + 6, 'Ink'); // the 1 px eye
  }
  // saddlecloth, plain, no number
  const cloth = new Mask().rect(21, 12 + bob, 9, 7);
  paint(pic, T(cloth), { id: `${g}.cloth`, fill: o.cloth });
  // rider: the leg (breeches, Ink boot), the jacket with the arm, the cap
  const leg = new Mask().line([27, 10], [33, 12], 3).line([33, 12], [30, 15], 2).rect(28, 15, 3, 2);
  const knockRider = o.coat === 'Maroon' ? (own) => own === `${g}.body` || own === `${g}.cloth` : null;
  paint(pic, T(leg), { id: `${g}.leg`, knock: knockRider, color: (x, y, e) => (y - oy >= 15 ? 'Ink' : e ? 'Ink' : P) });
  const torso = new Mask().poly([[24.5, 9], [26, 6.5], [30, 4.5], [37, 2.5], [40, 3.5], [40, 6.5], [36, 7.5], [30, 10], [25.5, 11.5]]);
  const arm = new Mask().line([37, 5], [43, 7], 3);
  const jacket = new Mask().union(torso, arm);
  paint(pic, T(jacket), {
    id: `${g}.jacket`, knock: knockRider,
    color: (x, y, e) => {
      if (e) return 'Ink';
      const bx = x - ox;
      if (o.hoops && (bx === 29 || bx === 30 || bx === 33 || bx === 34)) return 'Maroon';
      return o.jacket;
    },
  });
  paint(pic, T(new Mask().rect(44, 6, 2, 2)), { id: `${g}.hands`, fill: 'Ink' }); // hands on the crest
  const cap = new Mask().ellipse(41.5, 2.2, 2.7, 2.2).add(44, 3).add(45, 3);
  paint(pic, T(cap), { id: `${g}.cap`, knock: knockRider, color: (x, y, e) => (x - ox === 45 ? 'Ink' : e ? 'Ink' : o.cap) });
  // hoof kick: three clods behind the hinds, a fixed pattern
  const [hx, hy] = S.nearHind[3];
  for (const [dx, dy, w] of [[-4, 0, 2], [-7, -2, 1], [-9, 1, 1]]) {
    for (let i = 0; i < w; i++) if (!pic.dark(ox + hx + dx + i, oy + hy + dy)) pic.c.set(ox + hx + dx + i, oy + hy + dy, 'Ink');
  }
  // the whole horse and rider, parted from any dark horse behind by a paper line
  const all = T(new Mask().union(body, near, far, tail, cloth, leg, jacket, cap));
  for (const [x, y] of all) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const nx = x + i;
    const ny = y + j;
    if (all.has(nx, ny) || nx < 0 || ny < 0 || nx >= PW || ny >= PH) continue;
    const own = pic.own[ny * PW + nx];
    if (pic.dark(nx, ny) && otherHorse(own) && String(own).match(/^h\d\./)) { pic.c.set(nx, ny, P); pic.own[ny * PW + nx] = 'knock'; }
  }
}

export function coverPicture({ regular = 'profile' } = {}) {
  const pic = new Pic();
  const c = pic.c;
  // hedge px68-238, py38-45, with 2-row bumps 6 px wide every 8 px on py36-37. Ink on its top
  // edge only, so it reads against the sky and sits on the far rail.
  const hedge = new Mask().rect(68, 38, 171, 8);
  for (let x = 69; x + 6 <= 239; x += 8) hedge.rect(x + 1, 36, 4, 1).rect(x, 37, 6, 1);
  paint(pic, hedge, { id: 'hedge', color: (x, y) => (hedge.has(x, y - 1) ? 'Maroon' : 'Ink') });
  // wire post px226-227, py16-48, and its plain disc px223-230, py10-17
  c.rect(226, 16, 2, 33, 'Ink');
  paint(pic, new Mask().ellipse(227, 14, 4, 4), { id: 'disc', fill: 'Maroon' });
  // far rail
  c.rect(62, 46, 177, 1, 'Ink');
  c.rect(62, 47, 177, 1, P);
  c.rect(62, 48, 177, 1, 'Ink');
  for (let x = 64; x <= 224; x += 16) c.rect(x, 46, 2, 7, 'Ink');
  // dirt fleck near the near rail, fixed: 1 px in each 8x4 block, rows offset by 4 px
  for (let x = 62; x < 239; x++) {
    if ((x - 62) % 8 === 3) c.set(x, 101, 'Ink');
    if ((x - 62) % 8 === 7) c.set(x, 105, 'Ink');
  }
  // three horses, back to front, noses at px128, px168, px208 (19.2)
  horse(pic, 128 - 55, 92 - 39, { id: 'h3', stride: 'mid', coat: P, belly: 'Maroon', muzzle: true, farLeg: 'Maroon', cloth: 'Maroon', jacket: 'Maroon', cap: P });
  horse(pic, 168 - 55, 98 - 39, { id: 'h2', stride: 'gather', coat: 'Maroon', farLeg: 'Ink', cloth: P, jacket: 'Ink', cap: P });
  horse(pic, 208 - 55, 104 - 39, { id: 'h1', stride: 'reach', coat: 'Ink', farLeg: 'Ink', cloth: P, jacket: P, hoops: true, cap: 'Maroon' });
  // near rail
  c.rect(62, 107, 177, 1, 'Ink');
  c.rect(62, 108, 177, 1, P);
  c.rect(62, 109, 177, 1, 'Ink');
  for (let x = 64; x <= 224; x += 16) c.rect(x, 107, 2, 3, 'Ink');
  // balcony front py110-126: Maroon, the Ink cord on py111, paper pennants every 16 px
  c.rect(0, 110, 239, 17, 'Maroon');
  c.rect(0, 111, 239, 1, 'Ink');
  const PEN = ['KPPPK', '.KPK.', '.KPK.', '..K..', '..K..'];
  for (let x = 8; x + 5 <= 239; x += 16) PEN.forEach((r, j) => [...r].forEach((p, i) => { if (p !== '.') c.set(x + i, 112 + j, p === 'K' ? 'Ink' : P); }));

  // The regular (20.2): in profile, facing right, seated, watching the race.
  const hooks = (pts) => { for (const [x, y] of pts) { c.set(x, y, 'Ink'); c.set(x + 1, y + 1, 'Ink'); c.set(x, y + 2, 'Ink'); } };
  if (regular === 'profile') {
    // torso py42-85 and lap py86-91 as one shape: round back, the bust out to px52
    const torso = new Mask().poly([[30, 42], [46, 42], [49, 44], [51, 47], [52.5, 50], [52.5, 70], [51, 76], [49, 82], [48, 86], [26, 86], [24.5, 78], [23.5, 64], [23, 54], [23.5, 48], [25, 45], [27, 43]]);
    const lap = new Mask().rect(26, 86, 38, 6).rect(64, 87, 1, 4);
    const arm = new Mask().line([47, 47], [47, 62], 5).line([47, 62], [52, 52], 4).line([52, 52], [55, 44], 4);
    const body = new Mask().union(torso, lap, arm);
    paint(pic, body, { id: 'reg', fill: 'Maroon' });
    // the 1 px paper slit parting the arm from the torso: behind the upper arm, under the forearm
    for (let y = 47; y <= 64; y++) if (!arm.has(44, y)) c.set(44, y, P);
    for (const [x, y] of arm) if (x >= 49 && !arm.has(x, y + 1) && torso.has(x, y + 1) && !arm.has(x - 1, y + 1)) c.set(x, y + 1, P);
    // bench seat px16-60, py92-94: a paper plank, Ink outline; Ink shins px58-63, py95-109
    c.rect(16, 92, 45, 3, 'Ink');
    c.rect(17, 93, 43, 1, P);
    c.rect(58, 95, 6, 15, 'Ink');
    // neck px34-41, py39-41: paper, Ink front and back
    c.rect(34, 39, 8, 3, P);
    c.set(34, 39, 'Ink'); c.set(34, 40, 'Ink'); c.set(34, 41, 'Ink');
    c.set(41, 39, 'Ink'); c.set(41, 40, 'Ink'); c.set(41, 41, 'Ink');
    // head px27-48, py19-38: curls at the back, the face at the front (DESIGN face rule:
    // the front edge curves out and back, a 1 px nose bump at py29 with the edge 1 px behind
    // it above and below)
    const back = { 19: 29, 20: 28, 33: 28, 34: 28, 35: 29, 36: 30, 37: 31, 38: 33 };
    const front = { 19: 45, 20: 46, 21: 47, 22: 47, 23: 47, 24: 47, 25: 47, 26: 47, 27: 47, 28: 47, 29: 48, 30: 47, 31: 47, 32: 47, 33: 46, 34: 46, 35: 45, 36: 44, 37: 42, 38: 41 };
    const head = new Mask();
    for (let y = 19; y <= 38; y++) head.rect(back[y] ?? 27, y, front[y] - (back[y] ?? 27) + 1, 1);
    paint(pic, head, { id: 'reg', fill: P, edgeOf: new Mask().union(head, new Mask().rect(0, 18, 80, 1), new Mask().rect(35, 39, 6, 1)) });
    // the hairline: a scalloped Ink edge between her curls and her face, toward the face
    // It sweeps from under the brim at the front back to behind the jaw, scalloped in 3-row steps.
    const hairline = { 19: 42, 20: 41, 21: 40, 22: 39, 23: 38, 24: 37, 35: 35, 36: 34, 37: 33, 38: 32 };
    for (let y = 19; y <= 38; y++) c.set(hairline[y] ?? (Math.floor((y - 25) / 3) % 2 === 0 ? 36 : 37), y, 'Ink');
    hooks([[30, 21], [35, 20], [29, 26], [33, 25], [30, 31]]);
    c.set(44, 26, 'Ink'); c.set(44, 27, 'Ink'); // one 1x2 eye
    // her program, held up beside her face: paper, Ink outline, its Maroon masthead band
    c.rect(53, 30, 8, 12, 'Ink');
    c.rect(54, 31, 6, 10, P);
    c.rect(54, 31, 6, 2, 'Maroon');
    // her hand on it: paper, Ink outline
    c.rect(53, 39, 4, 5, 'Ink');
    c.rect(54, 40, 2, 3, P);
  } else {
    // Fallback (20.2): she is out of the picture. Under the brim, a line of her curls and the
    // top of a Maroon shoulder at the picture's left edge.
    const shoulder = new Mask().poly([[1, 23], [30, 23], [36, 25], [38, 28], [30, 32], [16, 37], [1, 41]]);
    paint(pic, shoulder, { id: 'reg', fill: 'Maroon', edgeOf: new Mask().union(shoulder, new Mask().rect(0, 0, 1, 128)) });
    const curls = new Mask().rect(20, 19, 31, 3);
    for (let x = 20; x + 3 <= 51; x += 4) curls.rect(x, 22, 3, 1).add(x + 1, 23);
    paint(pic, curls, { id: 'reg', fill: P, edgeOf: new Mask().union(curls, new Mask().rect(0, 18, 80, 1)) });
    hooks([[24, 19], [31, 19], [38, 19], [45, 19]]);
  }
  // brim px0-71, py14-18: Ink top, Maroon, Ink underside; the outer 8 px each side droop 1 px
  for (let x = 0; x <= 71; x++) {
    const d = x < 8 || x > 63 ? 1 : 0;
    if (x >= 1 && x <= 70) c.set(x, 14 + d, 'Ink');
    for (const y of [15, 16]) c.set(x, y + d, x === 0 || x === 71 ? 'Ink' : 'Maroon');
    if (x >= 1 && x <= 70) c.set(x, 17 + d, 'Ink');
    if (x >= 3 && x <= 68) c.set(x, 18 + d, 'Ink');
  }
  for (const x of [7, 64]) c.set(x, 14, 'Ink'); // the step where the droop starts
  // crown px24-47, py0-13: a low dome, a lady's hat
  const crown = new Mask().poly([[24, 14], [24, 6], [25.5, 3], [28, 1], [31, 0], [41, 0], [44, 1], [46.5, 3], [48, 6], [48, 14]]);
  paint(pic, crown, { id: 'hat', fill: 'Maroon', edgeOf: new Mask().union(crown, new Mask().rect(0, 14, 80, 1)) });
  c.rect(25, 11, 22, 2, P); // hatband
  for (const [x, y] of [[41, 6], [42, 6], [40, 7], [43, 7], [40, 8], [43, 8], [41, 9], [42, 9], [42, 7], [41, 8], [42, 8]]) c.set(x, y, P); // the flower
  c.set(41, 7, 'Ink'); // 1 px Ink center
  // plate border: right and bottom whole; top py4 broken by the crown (px24-47); left px0
  // broken by the brim (stops at py13, resumes at py19)
  c.rect(239, 4, 1, 124, 'Ink');
  c.rect(0, 127, 240, 1, 'Ink');
  for (let x = 0; x < 240; x++) if (x < 24 || x > 47) c.set(x, 4, 'Ink');
  for (let y = 4; y <= 127; y++) if (y <= 13 || y >= 19) c.set(0, y, 'Ink');
  // paper is the light: transparent in the slot
  const out = new Canvas(PW, PH);
  for (let i = 0; i < c.px.length; i++) out.px[i] = c.px[i] === P ? null : c.px[i];
  return out;
}

// ------------------------------------------------------------- window picture (19.3)
export function windowProgram() { // art.window.program, 16x8
  const c = new Canvas(16, 8);
  c.rect(0, 0, 16, 8, 'Ink');
  c.rect(1, 1, 14, 6, 'Parchment');
  c.rect(1, 1, 14, 2, 'Maroon');
  return c;
}
// art.window.clerk (19.3): clerk 2 of the track, close up, facing us. 32x48, 2 frames (rest,
// stamp). Drawn fresh at this size, never scaled from art.hub.clerk. Ink, Cocoa, Turf, Bone.
// Rows 0-45 show (y34-79); the counter cuts him at row 46 (y80).
export function windowClerk() {
  const key = { K: 'Ink', C: 'Cocoa', T: 'Turf', B: 'Bone' };
  const HEAD = [
    '................................', // 0
    '................................', // 1
    '..........KKKKKKKKKKKK..........', // 2  hair
    '........KKKKKKKKKKKKKKKK........', // 3
    '.......KKKKKKKKKKKKKKKKKK.......', // 4
    '......KKKKKKKKKKKKKKKKKKKK......', // 5
    '......KKKKCCCKKKKKKCCCCKKK......', // 6  face from here, a fringe of hair
    '......KKCCCCCCCKKCCCCCCCKK......', // 7
    '......KCCCCCCCCCCCCCCCCCCK......', // 8
    '......KCCCCCCCCCCCCCCCCCCK......', // 9
    '.....KKCCCCCCCCCCCCCCCCCCKK.....', // 10 ears
    '....KCKCCCCCCCCCCCCCCCCCCKCK....', // 11
    '....KCKCCCCKCCCCCCCCKCCCCKCK....', // 12 eyes, 1x2
    '....KCKCCCCKCCCCCCCCKCCCCKCK....', // 13
    '.....KKCCCCCCCCCCCCCCCCCCKK.....', // 14
    '......KCCCCCCCCCCCCCCCCCCK......', // 15
    '......KCCCCCCCCCCCCCCCCCCK......', // 16
    '......KCCCCCCCCCCCCCCCCCCK......', // 17
    '.......KCCCCCCCCCCCCCCCCK.......', // 18
    '........KCCCCCCCCCCCCCCK........', // 19
    '.........KKCCCCCCCCCCKK.........', // 20
    '..........KKKCCCCCCKKK..........', // 21
    '.........KBBBBKCCKBBBBK.........', // 22 Bone collar, the neck in its V
    '........KBBBBBBKKBBBBBBK........', // 23
    '.......KBBBBBBBBBBBBBBBBK.......', // 24
    '..KKKKKKKKKBBBBBBBBBBKKKKKKKKK..', // 25 shoulders, the jacket from here
    '.KTTTTTTTTTKBBBBBBBBKTTTTTTTTTK.', // 26 lapels close down to a V of shirt
    'KTTTTTTTTTTTKBBBBBBKTTTTTTTTTTTK', // 27
    'KTTTTTTTTTTTTKBBBBKTTTTTTTTTTTTK', // 28
    'KTTTTTTTTTTTTTKBBKTTTTTTTTTTTTTK', // 29
    'KTTTTTKTTTTTTTTKKTTTTTTTTKTTTTTK', // 30 Ink lines part the arms from the jacket
  ];
  const BODY = 'KTTTTTKTTTTTTTTTTTTTTTTTTKTTTTTK';
  const rows = [...HEAD];
  while (rows.length < 48) rows.push(BODY);
  const draw = (rs) => { const c = new Canvas(32, 48); c.draw(rs, key); return c; };
  // Rest: his right hand (our left) at the counter with a Bone ticket.
  const rest = [...rows];
  const hand = [
    [38, 'KTTTTKKKKKKKTTTTTTTTTTTTTKTTTTTK'],
    [39, 'KTTTKBBBBBBKKTTTTTTTTTTTTKTTTTTK'],
    [40, 'KTTKCBBBBBBKCKTTTTTTTTTTTKTTTTTK'],
    [41, 'KTKCCBBBBBBKCCKTTTTTTTTTTKTTTTTK'],
    [42, 'KTKCCKBBBBBKCCKTTTTTTTTTTKTTTTTK'],
    [43, 'KTKCCCKKKKKKCCKTTTTTTTTTTKTTTTTK'],
    [44, 'KTTKCCCCCCCCCKTTTTTTTTTTTKTTTTTK'],
    [45, 'KTTTKKKKKKKKKTTTTTTTTTTTTKTTTTTK'],
  ];
  for (const [y, r] of hand) rest[y] = r;
  // Stamp: the same, and his left hand (our right) down on the tote machine beside him.
  const stamp = [...rest];
  const press = [
    [32, 'KTTTTTKTTTTTTTTTTTTTTTTTTKTTTTKK'],
    [33, 'KTTTTTKTTTTTTTTTTTTTTTTTTKTTTKCK'],
    [34, 'KTTTTTKTTTTTTTTTTTTTTTTTTKTTKCCC'],
    [35, 'KTTTTTKTTTTTTTTTTTTTTTTTTKTKCCCC'],
    [36, 'KTTTTTKTTTTTTTTTTTTTTTTTTKTKCCCC'],
    [37, 'KTTTTTKTTTTTTTTTTTTTTTTTTKTTKKKK'],
  ];
  for (const [y, r] of press) stamp[y] = r;
  return [draw(rest), draw(stamp)];
}
export function booth() { // art.window.booth, 256x72, drawn at its screen rows y16-87
  const c = new Canvas(256, 240);
  c.rect(0, 16, 256, 64, 'Mist');
  c.blit(A.plate, 16, 28); // the track's sign plate, on the left wall
  c.rect(96, 30, 64, 2, 'Maroon');
  c.rect(96, 30, 2, 50, 'Maroon');
  c.rect(158, 30, 2, 50, 'Maroon');
  c.rect(98, 32, 60, 2, 'Dirt');
  c.rect(98, 34, 60, 46, 'Hay');
  // tote machine, redrawn at this scale, with its ticket tongue
  c.rect(144, 70, 12, 10, 'Slate');
  c.rect(144, 70, 12, 1, 'Ash');
  c.rect(148, 67, 4, 3, 'Bone');
  // counter
  c.rect(0, 80, 256, 1, 'Dirt Shade');
  c.rect(0, 81, 256, 7, 'Mud');
  return c;
}

// ------------------------------------------------------------- shared page pieces
function paper() { const c = new Canvas(256, 240); c.rect(0, 0, 256, 240, 'Parchment'); return c; }
const rule = (c, y) => c.rect(8, y, 240, 1, 'Ink');
function foot(c, prev, next) {
  if (prev) text(c, `< ${prev}`, 8, 226, 'Ink');
  text(c, 'Esc: close', 88, 226, 'Ink');
  if (next) textRight(c, `${next} >`, 247, 226, 'Ink');
}
const SEED = '12345';
const TRACK = DAY.races[0].track;
const COVER_LINE = 'Bugler finds a 13th note';

function cover({ eightByEight = false, picture = COVER } = {}) {
  const c = paper();
  c.rect(8, 8, 240, 36, 'Maroon');
  for (let x = 10; x <= 245; x++) { c.set(x, 10, 'Parchment'); c.set(x, 41, 'Parchment'); }
  for (let y = 10; y <= 41; y++) { c.set(10, y, 'Parchment'); c.set(245, y, 'Parchment'); }
  if (eightByEight) { // section 3 as first written: the name in the 8x8 font
    textCenter(c, TRACK, 15, 'Parchment');
    textCenter(c, 'Race Day Program', 28, 'Parchment');
  } else {
    if (TRACK.length > 19) fails.push('track name over 19 for the display font');
    display(c, TRACK, 14, 'Parchment');
    textCenter(c, 'Race Day Program', 31, 'Parchment');
  }
  dayPair(c, 8, 48, SEED);
  textRight(c, `${DAY.races.length} races today`, 247, 48, 'Ink');
  rule(c, 58);
  c.blit(picture, 8, 62);
  textCenter(c, COVER_LINE, 196, 'Ink');
  rule(c, 210);
  foot(c, null, 'News');
  return c;
}

function news() {
  const c = paper();
  text(c, 'Rail Talk', 8, 4, 'Maroon');
  dayPairRight(c, 247, 4, SEED);
  text(c, 'Gossip, facts and peanuts.', 8, 14, 'Ink');
  rule(c, 24);
  const items = [
    ['Bugler finds a 13th note', 'He is saving it for a special', 'occasion. Today is not it.'],
    ["Today's card", '8 races, all 1 1/4 miles on', 'fast dirt.'],
    ['Running in two races today', 'Mint Julep Lawsuit, races 2, 6', 'Hold My Oats, races 3, 7'],
    ['Pigeons hold the good seats', 'Ushers asked nicely. The', 'pigeons have declined.'],
    ["Yesterday's longest price", 'Sock In The Dryer won race 4', 'at 26-1.'],
  ];
  items.forEach(([h, b1, b2], k) => {
    for (const s of [h, b1, b2]) if (s.length > 30) fails.push(`news line over 30: ${s}`);
    text(c, h, 8, 30 + 36 * k, 'Maroon');
    text(c, b1, 8, 40 + 36 * k, 'Ink');
    text(c, b2, 8, 50 + 36 * k, 'Ink');
  });
  rule(c, 210);
  foot(c, 'Cover', 'Race 1');
  return c;
}

// ------------------------------------------------------------- race pages (5)
const byName = Object.fromEntries(STABLE.horses.map((h) => [h.name, h]));
const CLOTH = RD.saddlecloths.value;
const STYLE = RD.copy.card.styles;
function field(names) {
  return names.map((n, i) => { const h = byName[n]; if (!h) throw new Error(`not in stable.json: ${n}`); return { ...h, post: i + 1 }; });
}
// Race 3, the next race: 8 of the stable (none of them the two news says run in race 2 and 6
// except Hold My Oats, which news puts in races 3 and 7).
const R3 = field(['Gravy Subpoena', 'Hold My Oats', 'Legally A Horse', 'Sock In The Dryer', 'Goat Is In Charge', 'Lost The Remote', 'Paddock Gossip', 'Unexpected Banjo']);
const R3_ODDS = ['7-2', '9-2', '5-2', '8-1', '3-1', '12-1', '4-1', '26-1'];
const R5 = field(['Ten Items Or Less', 'Burgoo Weather', 'Smoke Alarm Chirp', 'Long Story Longer', 'Circling Back', 'Derby Hat Budget', 'Scenic Route', 'Reply All']);
const R2 = field(['Biscuit Emergency', 'Mint Julep Lawsuit', 'Porch Light On', 'Understudy', 'Decaf By Mistake', 'Take A Number', 'Polite Applause', 'Mayor Of Turn Two']);
const R2_ODDS = ['6-1', '5-2', '2-1', '9-1', '7-2', '15-1', '11-1', '4-1'];

function clothBlock(c, x, y, post) { // 16x17 program block: Ink border, fill, main-font number
  const cl = CLOTH[post - 1];
  c.rect(x, y, 16, 17, 'Ink');
  c.rect(x + 1, y + 1, 14, 15, cl.fill);
  text(c, String(post), x + 1 + Math.floor((14 - 6) / 2), y + 1 + Math.floor((15 - 7) / 2), cl.number);
}
function racePage(r, horses, odds, { right, cursor, tick = null, footL1 }) {
  const c = paper();
  const race = DAY.races[r - 1];
  text(c, `Race ${r} of ${DAY.races.length}`, 8, 4, 'Ink');
  if (right) textRight(c, right, 247, 4, 'Ink');
  text(c, race.name, 8, 14, 'Maroon');
  text(c, `${race.track}, 1 1/4 miles`, 8, 24, 'Ink');
  text(c, 'Dirt, fast, playing fair', 8, 34, 'Ink');
  for (const y of [44, 56, 210]) rule(c, y);
  const H = RD.copy.program.heads;
  text(c, H.speed, 40, 47, 'Ink');
  text(c, H.stamina, 98, 47, 'Ink');
  text(c, H.kick, 156, 47, 'Ink');
  textRight(c, H.odds, 247, 47, 'Ink');
  horses.forEach((h, i) => {
    const top = 58 + 19 * i;
    clothBlock(c, 20, top, h.post);
    text(c, h.name, 40, top, 'Ink');
    textRight(c, STYLE[h.style], 247, top, 'Maroon');
    [['speed', 40, 50], ['stamina', 98, 108], ['kick', 156, 166]].forEach(([k, nx, bx]) => {
      const v = h.stats[k];
      small(c, String(v).padStart(2, '0'), nx, top + 10, 'Ink');
      c.rect(bx, top + 12, 40, 1, 'Ash');
      c.rect(bx + 39, top + 11, 1, 3, 'Ash');
      const len = Math.min(40, Math.floor(((v - 1) * 40) / 99));
      if (len > 0) c.rect(bx, top + 11, len, 3, 'Ink');
    });
    textRight(c, odds ? odds[i] : '-', 247, top + 8, 'Ink');
  });
  if (tick !== null) c.blit(A.pick, 8, 58 + 19 * (tick - 1) + 5);
  if (cursor !== null && cursor !== tick) c.blit(PAPER_SHOE, 8, 58 + 19 * (cursor - 1) + 5);
  text(c, footL1 ?? horses[cursor - 1].blurb, 8, 214, 'Ink');
  foot(c, r > 1 ? `Race ${r - 1}` : 'News', r < 8 ? `Race ${r + 1}` : null);
  return c;
}

// ------------------------------------------------------------- the window (7)
function navyBox(c, x, y, tw, th) {
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    const col = tx === 0 ? 0 : tx === tw - 1 ? 2 : 1;
    const row = ty === 0 ? 0 : ty === th - 1 ? 2 : 1;
    c.blit(sub(A.box, col * 8, row * 8, 8, 8), x + tx * 8, y + ty * 8);
  }
}
function statusBar(c, race, bank) {
  c.rect(0, 0, 256, 15, 'Navy');
  c.rect(0, 15, 256, 1, 'Ash');
  text(c, `Race ${race} of 8`, 4, 4);
  textRight(c, `Bank ${bank}`, 251, 4);
}
function stripBox(c, x, y, post) { // the race HUD strip box: 12x10, Ash border, small number
  const cl = CLOTH[post - 1];
  c.rect(x, y, 12, 10, 'Ash');
  c.rect(x + 1, y + 1, 10, 8, cl.fill);
  small(c, String(post), x + 4, y + 2, cl.number);
}
const TORN = [0, 0, 1, 2, 1, 1, 0, 1, 2, 2, 1, 0, 0, 0, 1, 1, 2, 1, 0, 1, 1, 2, 1, 0];
function slip(c, lines) {
  for (let x = 8; x <= 247; x++) {
    const o = TORN[(x - 8) % 24];
    c.set(x, 209 + o, 'Ink');
    for (let y = 210 + o; y < 235; y++) c.set(x, y, 'Bone');
  }
  c.rect(8, 209, 1, 27, 'Ink');
  c.rect(247, 209, 1, 27, 'Ink');
  c.rect(8, 235, 240, 1, 'Ink');
  lines.forEach((s, i) => text(c, s, 16, [215, 225][i], 'Ink'));
}
function windowScreen({ mode, focus = 1, pending = false, line, bank = '$100.00' }) {
  const c = new Canvas(256, 240);
  c.rect(0, 0, 256, 240, 'Ink');
  const b = booth();
  c.blit(sub(b, 0, 16, 256, 72), 0, 16);
  // the still picture's cells, before the sprites go on
  checkCells(c, 'window booth', 16, 88);
  statusBar(c, 3, bank);
  text(c, 'Windows', 20, 30);
  c.blit(sub(CLERK[mode === 'placed' ? 1 : 0], 0, 0, 32, 46), 112, 34); // the counter cuts him at y80
  c.blit(windowProgram(), 176, 72);
  navyBox(c, 0, 88, 32, 19);
  text(c, line, 20, 98);
  R3.forEach((h, i) => {
    const top = 112 + 11 * i;
    stripBox(c, 20, top - 1, h.post);
    text(c, h.name, 36, top);
    textRight(c, pending ? '-' : R3_ODDS[i], 247, top);
  });
  c.rect(8, 202, 240, 1, 'Ash');
  if (mode === 'choosing') {
    c.blit(NAVY_SHOE, 8, 112 + 11 * (focus - 1));
    textRight(c, 'Esc: back', 247, 220);
  } else {
    c.blit(A.yours, 8, 112 + 11 * (focus - 1));
    const h = R3[focus - 1];
    if (mode === 'ticket') {
      c.blit(NAVY_SHOE, 8, 208);
      text(c, `< $10 >  on #${h.post}`, 20, 208);
      textRight(c, 'Enter: bet', 247, 208);
      text(c, '$10 to win pays $37.00', 20, 220);
    } else {
      slip(c, [`Race 3, $10 to win on #${h.post}`, `${h.name} at ${R3_ODDS[focus - 1]}`]);
    }
  }
  return c;
}

// ------------------------------------------------------------- the track (sheets 2 and 6)
function trackScreen(focus) {
  const c = new Canvas(256, 240);
  c.rect(0, 176, 256, 64, 'Ink');
  c.rect(0, 16, 256, 24, 'Sky');
  c.rect(0, 40, 256, 24, 'Sky Pale');
  c.blit(A.infield, 91, 56);
  for (let x = 123; x < 256; x += 16) c.blit(sub(A.infield, 0, 0, Math.min(16, 256 - x), 32), x, 56);
  c.rect(112, 88, 144, 8, 'Grass');
  for (let x = 112; x < 256; x += 16) c.blit(Math.floor(x / 16) % 2 ? flipX(A.railFar) : A.railFar, x, 88);
  for (let y = 96; y < 118; y += 16) for (let x = 112; x < 256; x += 16) c.blit(sub(A.dirt, 0, 0, 16, Math.min(16, 118 - y)), x, y);
  for (let x = 112; x < 256; x += 16) c.blit(sub(Math.floor(x / 16) % 2 ? flipX(A.railNear) : A.railNear, 0, 0, 16, 4), x, 118);
  for (let y = 122; y < 176; y += 16) for (let x = 112; x < 256; x += 16) c.blit(sub(A.apron, 0, 0, 16, Math.min(16, 176 - y)), x, y);
  for (let y = 152; y < 176; y += 16) for (let x = 0; x < 112; x += 16) c.blit(sub(A.apron, 0, 0, 16, Math.min(16, 176 - y)), x, y);
  c.blit(A.board, 124, 32);
  c.blit(A.upper, 0, 24);
  c.blit(A.facade, 0, 96);
  c.blit(A.plate, 24, 100);
  c.blit(A.gate, 112, 140);
  c.blit(A.cart, 184, 144);
  for (let x = 0; x < 112; x += 16) {
    const odd = Math.floor(x / 16) % 2 === 1;
    const f = frame(A.crowd, odd ? 1 : 0, 16);
    c.blit(odd ? flipX(f) : f, x, 32);
  }
  c.blit(frame(A.flag, 0, 8), 115, 59);
  const clerk = frame(A.clerk, 0, 16);
  const fan = frame(A.fan, 0, 16);
  for (const [img, x, y] of [
    [frame(A.regular, 0, 16), 56, 48], [clerk, 16, 120], [recolor(clerk, { Peach: 'Cocoa' }), 52, 120],
    [recolor(clerk, { Peach: 'Tan' }), 88, 120], [A.bettor, 36, 128], [A.railProgram, 192, 115],
    [recolor(fan, FAN_RECOLORS.A), 124, 108], [flipX(recolor(fan, FAN_RECOLORS.B)), 140, 108],
    [recolor(fan, FAN_RECOLORS.C), 228, 108], [frame(A.bugler, 0, 16), 128, 146], [frame(A.vendor, 0, 16), 216, 144],
  ]) c.blit(img, x, y);
  statusBar(c, 3, '$100.00');
  text(c, 'Windows', 28, 102);
  text(c, 'Race 3', 132, 36);
  R3_ODDS.forEach((o, i) => {
    const j = i % 4;
    const y = i < 4 ? 50 : 60;
    small(c, String(i + 1), 132 + 30 * j, y, 'Orange');
    small(c, o, 138 + 30 * j, y, 'Bone');
  });
  navyBox(c, 0, 176, 32, 8);
  // 18.1 item 7: voice rows at y185 and y194, menu rows at y206, y215, y224
  const L = HUB.copy.lookables.regular;
  if (focus === 'regular') {
    c.blit(NAVY_SHOE, 8, 185);
    text(c, L.name, 20, 185);
    text(c, L.lines[1], 20, 194);
  } else {
    text(c, 'Race 3 is up.', 20, 185);
    text(c, "Sun's out. Hats are out.", 20, 194);
  }
  text(c, 'Read Race 3', 20, 206);
  text(c, 'Bet Race 3', 20, 215);
  text(c, 'Just watch Race 3', 20, 224);
  if (focus === 'read') c.blit(NAVY_SHOE, 8, 206);
  if (focus === 'bet') c.blit(NAVY_SHOE, 8, 215);
  const boxFor = { bet: [4, 98, 107, 145], regular: [52, 44, 75, 75] }[focus];
  if (boxFor) {
    const [x0, y0, x1, y1] = boxFor;
    const top = frame(A.corner, 0, 8);
    const bot = frame(A.corner, 1, 8);
    c.blit(top, x0, y0); c.blit(flipX(top), x1 - 7, y0); c.blit(bot, x0, y1 - 7); c.blit(flipX(bot), x1 - 7, y1 - 7);
  }
  return c;
}

// ------------------------------------------------------------- checks and output
function checkCells(c, name, y0, y1) {
  for (let cy = y0; cy < y1; cy += 16) for (let cx = 0; cx < 256; cx += 16) {
    const set = new Set();
    for (let y = cy; y < Math.min(cy + 16, y1); y++) for (let x = cx; x < cx + 16; x++) set.add(c.get(x, y));
    set.delete(null);
    if (set.size > 8) fails.push(`${name}: cell x${cx} y${cy} has ${set.size} colors`);
  }
}
function scale(c, k) {
  const o = new Canvas(c.w * k, c.h * k);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.px[y * o.w + x] = c.px[Math.floor(y / k) * c.w + Math.floor(x / k)];
  return o;
}
function row(cs, gap = 8) { // side by side on the Ink desk
  const w = cs.reduce((s, c) => s + c.w, 0) + gap * (cs.length - 1);
  const h = Math.max(...cs.map((c) => c.h));
  const o = new Canvas(w, h);
  o.rect(0, 0, w, h, 'Ink');
  let x = 0;
  for (const c of cs) { o.blit(c, x, 0); x += c.w + gap; }
  return o;
}
function stack(cs, gap = 8) {
  const w = Math.max(...cs.map((c) => c.w));
  const h = cs.reduce((s, c) => s + c.h, 0) + gap * (cs.length - 1);
  const o = new Canvas(w, h);
  o.rect(0, 0, w, h, 'Ink');
  let y = 0;
  for (const c of cs) { o.blit(c, 0, y); y += c.h + gap; }
  return o;
}
// Grayscale copies are a test print, not game art: written with their own encoder, luma 601.
function writeGray(path, c) {
  const raw = Buffer.alloc((c.w * 4 + 1) * c.h);
  let o = 0;
  for (let y = 0; y < c.h; y++) {
    raw[o++] = 0;
    for (let x = 0; x < c.w; x++) {
      const [r, g, b] = rgb(c.get(x, y));
      const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      raw[o++] = l; raw[o++] = l; raw[o++] = l; raw[o++] = 255;
    }
  }
  const crcT = Array.from({ length: 256 }, (_, n) => { let v = n; for (let k = 0; k < 8; k++) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1; return v >>> 0; });
  const crc = (buf) => { let v = 0xffffffff; for (const b of buf) v = crcT[(v ^ b) & 0xff] ^ (v >>> 8); return (v ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const k = Buffer.alloc(4); k.writeUInt32BE(crc(td)); return Buffer.concat([l, td, k]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(c.w, 0); ih.writeUInt32BE(c.h, 4); ih[8] = 8; ih[9] = 6;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
const written = [];
function sheet(name, c, { gray = false, only = null } = {}) {
  if (c.px.some((p) => p === null)) fails.push(`${name}: transparent pixels left`);
  if (only) {
    const extra = c.colors().filter((x) => !only.includes(x));
    if (extra.length) fails.push(`${name}: colors outside ${only.join(', ')}: ${extra.join(', ')}`);
  }
  writePng(join(OUT, `${name}.png`), c);
  writePng(join(OUT, `${name}-3x.png`), scale(c, 3));
  written.push(`${name}.png`, `${name}-3x.png`);
  if (gray) {
    writeGray(join(OUT, `${name}-gray.png`), c);
    writeGray(join(OUT, `${name}-gray-3x.png`), scale(c, 3));
    written.push(`${name}-gray.png`, `${name}-gray-3x.png`);
  }
}

const COVER = coverPicture();
const CLERK = windowClerk();

export function build() {
  if (COVER.colors().some((x) => x !== 'Ink' && x !== 'Maroon')) fails.push('cover picture: a color other than Ink and Maroon');
  const coverPage = cover();
  const COVER_INKS = ['Parchment', 'Ink', 'Maroon'];
  sheet('1-cover', coverPage, { gray: true, only: COVER_INKS });
  // the masthead alone, display font over the 8x8 font, so the reason for the font shows
  const mast = (c) => sub(c, 0, 0, 256, 48);
  sheet('1-cover-masthead-compare', stack([mast(coverPage), mast(cover({ eightByEight: true }))]), { only: COVER_INKS });
  sheet('1-cover-picture', (() => { const c = paper(); c.blit(COVER, 8, 62); return sub(c, 0, 56, 256, 140); })(), { only: COVER_INKS });
  sheet('1-cover-hat-only', cover({ picture: coverPicture({ regular: 'hatOnly' }) }), { only: COVER_INKS });
  sheet('2-cover-and-track', row([coverPage, trackScreen('read')]));
  sheet('3-news', news());
  const r3 = racePage(3, R3, R3_ODDS, { right: 'Enter: to window', cursor: 1 });
  sheet('4a-race3-prices-posted', r3, { gray: true });
  sheet('4b-race5-prices-later', racePage(5, R5, null, { right: 'Prices later', cursor: 1 }));
  sheet('4c-race2-run', racePage(2, R2, R2_ODDS, { right: 'Winner: #5', cursor: 1, tick: 3 }));
  sheet('5a-window-choosing', windowScreen({ mode: 'choosing', focus: 1, line: 'Race 3. Who do you like?' }));
  const ticket = windowScreen({ mode: 'ticket', focus: 3, line: "Pencil's sharp. Ready." });
  sheet('5b-window-ticket-open', ticket, { gray: true });
  sheet('5c-window-bet-beat', windowScreen({ mode: 'placed', focus: 3, line: 'There you go. Enjoy it.', bank: '$90.00' }));
  sheet('5d-window-prices-pending', windowScreen({ mode: 'choosing', focus: 1, pending: true, line: RD.copy.program.pending }));
  sheet('6a-track-read-focused', trackScreen('read'));
  sheet('6b-track-bet-focused', trackScreen('bet'));
  sheet('6c-track-lookable-focused', trackScreen('regular'));
  sheet('7-path', row([coverPage, news(), r3, ticket]));
  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const w of build()) console.log(join(OUT, w));
  if (fails.length) {
    for (const f of fails) console.error('FAIL', f);
    process.exit(1);
  }
  console.log('checks passed');
}
