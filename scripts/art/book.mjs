// The book and the window: every new asset, drawn as finals.
// Run: node scripts/art/book.mjs   (writes each asset to its slot path under public/assets/;
// also run by scripts/art/build.mjs). Approved by Joseph from the mock, 2026-11-14 ("Yes,
// build it"). scripts/art/book_mock.mjs composes the mock screens from these same functions.
//
// Rules: docs/specs/book-and-window.md sections 18 to 21 (the art-director's rulings, which
// win over sections 3, 7 and 12), and DESIGN.md. All boxes at 1x, inclusive.
//
//   font.ui.display     192x48 sheet, 12x16 cells, 16 a row, the 41 glyphs of
//                       DISPLAY_CHARS in that order from the top-left. Bone on transparent,
//                       recolored by code like font.ui.main. Glyph 10x14 in columns 0-9,
//                       rows 0-13. Capitals only (code upper-cases). Stems and horizontals
//                       2 px. For the cover's masthead only (18.5 D).
//   art.book.cover.art  240x128, 1 frame, Ink and Maroon only; transparent is the paper.
//                       At screen x8, y62. The accepted profile cover (21.1) with the two
//                       intake fixes: a rounder, shorter head with a plain face, and a
//                       rounded back with a slight stoop.
//   art.window.booth    256x72, 1 frame, at screen x0, y16. The accepted window picture
//                       (19.3, 20.1) without the clerk and the program. Includes the
//                       track's sign plate (art.hub.sign.plate's pixels) at x16-79, y28-39;
//                       "Windows" is set on it from data by code.
//   art.window.clerk    32x48, 2 frames (1 rest, 2 stamp), at screen x112, y34. Rows 46-47
//                       are blank: the counter (y80-87, in the booth) cuts him at the waist,
//                       so he can be drawn over the booth as is.
//   art.window.program  16x8, 1 frame, at screen x176, y72, lying on the counter.
import { Canvas, strip, writeSlot } from './png.mjs';
import { signPlate } from './hub.mjs';

// ---------------------------------------------------------------- display font (18.5 D)
// The first eleven glyphs below (C H U R I L D O W N S) are the ones the art-director accepted
// in the mock (19.1, 1-cover-masthead-compare); the rest are drawn in the same hand: 2 px
// stems and bars, round corners cut in 1-then-3 px steps, crossbars on rows 6-7 or 7-8.
export const DISPLAY_CHARS = " &'-.0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"; // ASCII order, 41
export const DISPLAY_CELL = { w: 12, h: 16, columns: 16 };
const DISPLAY = {
  // accepted in the mock
  C: ['...####...', '.########.', '###....###', '##......##', '##........', '##........', '##........',
    '##........', '##........', '##........', '##......##', '###....###', '.########.', '...####...'],
  H: ['##......##', '##......##', '##......##', '##......##', '##......##', '##......##', '##########',
    '##########', '##......##', '##......##', '##......##', '##......##', '##......##', '##......##'],
  U: ['##......##', '##......##', '##......##', '##......##', '##......##', '##......##', '##......##',
    '##......##', '##......##', '##......##', '##......##', '###....###', '.########.', '...####...'],
  R: ['########..', '#########.', '##.....###', '##......##', '##......##', '##.....###', '#########.',
    '########..', '##...###..', '##....###.', '##.....##.', '##.....###', '##......##', '##......##'],
  I: ['.########.', '.########.', '....##....', '....##....', '....##....', '....##....', '....##....',
    '....##....', '....##....', '....##....', '....##....', '....##....', '.########.', '.########.'],
  L: ['##........', '##........', '##........', '##........', '##........', '##........', '##........',
    '##........', '##........', '##........', '##........', '##........', '##########', '##########'],
  D: ['#######...', '########..', '##....###.', '##.....###', '##......##', '##......##', '##......##',
    '##......##', '##......##', '##......##', '##.....###', '##....###.', '########..', '#######...'],
  O: ['...####...', '.########.', '###....###', '##......##', '##......##', '##......##', '##......##',
    '##......##', '##......##', '##......##', '##......##', '###....###', '.########.', '...####...'],
  W: ['##......##', '##......##', '##......##', '##......##', '##......##', '##......##', '##..##..##',
    '##..##..##', '##..##..##', '##..##..##', '##.####.##', '###.##.###', '.###..###.', '..##..##..'],
  N: ['##......##', '###.....##', '####....##', '##.##...##', '##.##...##', '##..##..##', '##..##..##',
    '##...##.##', '##...##.##', '##....####', '##.....###', '##......##', '##......##', '##......##'],
  S: ['..######..', '.########.', '###....###', '##........', '###.......', '.#######..', '..#######.',
    '.......###', '........##', '........##', '........##', '###....###', '.########.', '..######..'],
  ' ': Array(14).fill('..........'),
  // new at intake
  A: ['...####...', '.########.', '###....###', '##......##', '##......##', '##......##', '##......##',
    '##########', '##########', '##......##', '##......##', '##......##', '##......##', '##......##'],
  B: ['########..', '#########.', '##.....###', '##......##', '##.....###', '#########.', '########..',
    '#########.', '##.....###', '##......##', '##......##', '##.....###', '#########.', '########..'],
  E: ['##########', '##########', '##........', '##........', '##........', '##........', '########..',
    '########..', '##........', '##........', '##........', '##........', '##########', '##########'],
  F: ['##########', '##########', '##........', '##........', '##........', '##........', '########..',
    '########..', '##........', '##........', '##........', '##........', '##........', '##........'],
  G: ['...####...', '.########.', '###....###', '##......##', '##........', '##........', '##...#####',
    '##...#####', '##......##', '##......##', '##......##', '###....###', '.########.', '...####...'],
  J: ['....######', '....######', '........##', '........##', '........##', '........##', '........##',
    '........##', '........##', '##......##', '##......##', '###....###', '.########.', '...####...'],
  K: ['##......##', '##.....###', '##....###.', '##...###..', '##..###...', '##.###....', '#####.....',
    '#####.....', '##.###....', '##..###...', '##...###..', '##....###.', '##.....###', '##......##'],
  M: ['##......##', '###....###', '####..####', '##.####.##', '##.####.##', '##..##..##', '##..##..##',
    '##......##', '##......##', '##......##', '##......##', '##......##', '##......##', '##......##'],
  P: ['########..', '#########.', '##.....###', '##......##', '##......##', '##.....###', '#########.',
    '########..', '##........', '##........', '##........', '##........', '##........', '##........'],
  Q: ['...####...', '.########.', '###....###', '##......##', '##......##', '##......##', '##......##',
    '##......##', '##...##.##', '##...##.##', '##....####', '###...####', '.#########', '...####.##'],
  T: ['##########', '##########', '....##....', '....##....', '....##....', '....##....', '....##....',
    '....##....', '....##....', '....##....', '....##....', '....##....', '....##....', '....##....'],
  V: ['##......##', '##......##', '##......##', '##......##', '##......##', '##......##', '##......##',
    '##......##', '###....###', '.##....##.', '.###..###.', '..##..##..', '..######..', '...####...'],
  X: ['##......##', '##......##', '###....###', '.##....##.', '.###..###.', '..######..', '...####...',
    '...####...', '..######..', '.###..###.', '.##....##.', '###....###', '##......##', '##......##'],
  Y: ['##......##', '##......##', '###....###', '.##....##.', '.###..###.', '..######..', '...####...',
    '....##....', '....##....', '....##....', '....##....', '....##....', '....##....', '....##....'],
  Z: ['##########', '##########', '........##', '.......###', '......###.', '.....###..', '....###...',
    '...###....', '..###.....', '.###......', '###.......', '##........', '##########', '##########'],
  // digits: tabular like everything in this font; a slashed zero, as in font.ui.main
  0: ['...####...', '.########.', '###....###', '##.....###', '##....####', '##...##.##', '##...##.##',
    '##..##..##', '##..##..##', '##.##...##', '####....##', '###....###', '.########.', '...####...'],
  1: ['....##....', '..####....', '.#####....', '.##.##....', '....##....', '....##....', '....##....',
    '....##....', '....##....', '....##....', '....##....', '....##....', '.########.', '.########.'],
  2: ['..######..', '.########.', '###....###', '##......##', '........##', '.......###', '......###.',
    '....####..', '..####....', '.###......', '###.......', '##........', '##########', '##########'],
  3: ['##########', '##########', '......###.', '.....###..', '....###...', '...######.', '...#######',
    '.......###', '........##', '........##', '##......##', '###....###', '.########.', '..######..'],
  4: ['......##..', '.....###..', '....####..', '...##.##..', '..##..##..', '.##...##..', '##....##..',
    '##########', '##########', '......##..', '......##..', '......##..', '......##..', '......##..'],
  5: ['##########', '##########', '##........', '##........', '########..', '#########.', '.......###',
    '........##', '........##', '........##', '##......##', '###....###', '.########.', '..######..'],
  6: ['...#####..', '.#######..', '###.......', '##........', '##........', '########..', '#########.',
    '###....###', '##......##', '##......##', '##......##', '###....###', '.########.', '..######..'],
  7: ['##########', '##########', '........##', '.......###', '......###.', '.....###..', '....###...',
    '....##....', '...###....', '...##.....', '...##.....', '...##.....', '...##.....', '...##.....'],
  8: ['..######..', '.########.', '###....###', '##......##', '###....###', '.########.', '.########.',
    '###....###', '##......##', '##......##', '##......##', '###....###', '.########.', '..######..'],
  9: ['..######..', '.########.', '###....###', '##......##', '##......##', '##......##', '###....###',
    '.#########', '..########', '........##', '........##', '.......###', '.#######..', '.#####....'],
  // punctuation a track's name can hold
  '&': ['..####....', '.######...', '###..###..', '##....##..', '###..###..', '.######...', '..###.....',
    '.#####..##', '###.###.##', '##...####.', '##....###.', '###..#####', '.#####.###', '..###...##'],
  "'": ['....##....', '....##....', '....##....', '...##.....', '...##.....', '..........', '..........',
    '..........', '..........', '..........', '..........', '..........', '..........', '..........'],
  '.': ['..........', '..........', '..........', '..........', '..........', '..........', '..........',
    '..........', '..........', '..........', '..........', '..........', '....##....', '....##....'],
  '-': ['..........', '..........', '..........', '..........', '..........', '..........', '..######..',
    '..######..', '..........', '..........', '..........', '..........', '..........', '..........'],
};
for (const ch of DISPLAY_CHARS) {
  const g = DISPLAY[ch];
  if (!g || g.length !== 14 || g.some((r) => r.length !== 10)) throw new Error(`display glyph ${JSON.stringify(ch)} is not 10x14`);
}
if (Object.keys(DISPLAY).length !== DISPLAY_CHARS.length) throw new Error('display glyphs and DISPLAY_CHARS differ');

/** One display glyph as a 12x16 cell, Bone on transparent (or `color`). */
export function displayGlyph(ch, color = 'Bone') {
  const g = DISPLAY[ch];
  if (!g) throw new Error(`no display glyph ${JSON.stringify(ch)}`);
  const c = new Canvas(DISPLAY_CELL.w, DISPLAY_CELL.h);
  g.forEach((row, y) => [...row].forEach((p, x) => { if (p === '#') c.set(x, y, color); }));
  return c;
}
export function displaySheet() {
  const { w, h, columns } = DISPLAY_CELL;
  const s = new Canvas(w * columns, h * Math.ceil(DISPLAY_CHARS.length / columns));
  [...DISPLAY_CHARS].forEach((ch, i) => s.blit(displayGlyph(ch), (i % columns) * w, Math.floor(i / columns) * h));
  return s;
}

// ---------------------------------------------------------------- cover picture
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
  // the leftmost x on row y, or null
  left(y) { let l = null; for (const [x, yy] of this) if (yy === y && (l === null || x < l)) l = x; return l; }
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
  const bob = o.bob ?? 0;
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
  const cache = new Map();
  const legMaskCache = (pts) => { const k = JSON.stringify(pts); if (!cache.has(k)) cache.set(k, legMask(pts)); return cache.get(k); };
  const coatAt = (knees, x, y, isEdge, upper) => {
    // below the knee or hock: the points, Ink
    for (const pts of knees) if (legMaskCache(pts).has(x - ox, y - oy) && y - oy > kneeY(pts)) return 'Ink';
    return isEdge ? 'Ink' : upper;
  };
  const otherHorse = (own) => own !== null && !String(own).startsWith(g + '.');

  // far legs, then tail, then body with the near legs, then cloth, then rider
  paint(pic, T(far), { id: `${g}.far`, color: (x, y, e) => coatAt(farKnees, x, y, e, o.farLeg) });
  paint(pic, T(tail), { id: `${g}.tail`, fill: 'Ink' });
  const coatT = T(new Mask().union(body, near));
  paint(pic, T(near), { id: `${g}.near`, edgeOf: coatT, knock: (own) => own === `${g}.far`, color: (x, y, e) => coatAt(nearKnees, x, y, e, o.coat) });
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

// The regular, seated in profile, facing right, watching the race (20.2, accepted in 21.1),
// with the two intake fixes of 21.1.
function regularProfile(pic) {
  const c = pic.c;
  // Torso, shoulders at py38 (fix 1: up from py42, so the torso keeps its bottom at py85 and
  // gains 4 rows). The accepted outline, its upper points raised 4 rows.
  const torsoPoly = new Mask().poly([[30, 38], [46, 38], [49, 40], [51, 43], [52.5, 46], [52.5, 70], [51, 76], [49, 82], [48, 86], [26, 86],
    [24.5, 78], [23.5, 64], [23, 50], [23.5, 44], [25, 41], [27, 39]]);
  // Fix 2, a rounded back: the top-back corner steps in by 3, 2 and 1 px over the torso's
  // first three rows, and the back edge goes out 1 px on torso rows 8 to 20, a slight stoop.
  const torso = new Mask();
  for (let y = 38; y <= 86; y++) {
    const l = torsoPoly.left(y);
    if (l === null) continue;
    let r = l;
    while (torsoPoly.has(r + 1, y)) r++;
    const row = y - 38;
    const nl = row < 3 ? l + [3, 2, 1][row] : row >= 8 && row <= 20 ? l - 1 : l;
    torso.rect(nl, y, r - nl + 1, 1);
  }
  const lap = new Mask().rect(26, 86, 38, 6).rect(64, 87, 1, 4);
  const arm = new Mask().line([47, 47], [47, 62], 5).line([47, 62], [52, 52], 4).line([52, 52], [55, 44], 4);
  paint(pic, new Mask().union(torso, lap, arm), { id: 'reg', fill: 'Maroon' });
  // the 1 px paper slit parting the arm from the torso: behind the upper arm, under the forearm
  for (let y = 47; y <= 64; y++) if (!arm.has(44, y)) c.set(44, y, P);
  for (const [x, y] of arm) if (x >= 49 && !arm.has(x, y + 1) && torso.has(x, y + 1) && !arm.has(x - 1, y + 1)) c.set(x, y + 1, P);
  // bench seat px16-60, py92-94: a paper plank, Ink outline; Ink shins px58-63, py95-109
  c.rect(16, 92, 45, 3, 'Ink');
  c.rect(17, 93, 43, 1, P);
  c.rect(58, 95, 6, 15, 'Ink');
  // neck px34-41, py35-37 (fix 1: up from py39-41): paper, Ink front and back
  c.rect(34, 35, 8, 3, P);
  for (let y = 35; y <= 37; y++) { c.set(34, y, 'Ink'); c.set(41, y, 'Ink'); }
  // Head py19-34, 16 rows (fix 1: was py19-38), chin at py34. A round back; the face's front
  // edge by the face rule: it curves out and back, a 1 px nose bump at px48 with the edge
  // 1 px behind it above and below.
  const back = { 19: 30, 20: 28, 21: 27, 31: 28, 32: 29, 33: 31, 34: 33 };
  const front = { 19: 45, 20: 46, 21: 47, 22: 47, 23: 47, 24: 47, 25: 47, 26: 47, 27: 47, 28: 48, 29: 47, 30: 47, 31: 46, 32: 45, 33: 44, 34: 42 };
  const head = new Mask();
  for (let y = 19; y <= 34; y++) head.rect(back[y] ?? 27, y, front[y] - (back[y] ?? 27) + 1, 1);
  paint(pic, head, { id: 'reg', fill: P, edgeOf: new Mask().union(head, new Mask().rect(0, 18, 80, 1), new Mask().rect(35, 35, 6, 1)) });
  // The hairline: a clean Ink edge between her curls and her face. A short fringe under the
  // brim, then scalloped in 3-row steps (each step bulges 1 px toward the face at its middle
  // row), then back behind the jaw. The face in front of it is plain paper, at least 11 px
  // wide (px37-47) on every row from the eye down to the nose.
  const hairline = { 19: 38, 20: 37, 32: 35, 33: 34 };
  for (let y = 19; y <= 33; y++) c.set(hairline[y] ?? ((y - 21) % 3 === 1 ? 36 : 35), y, 'Ink');
  // Curl hooks in the back third only (px28-33), clear of the hairline.
  for (const [x, y] of [[31, 20], [28, 24], [32, 25], [29, 29]]) { c.set(x, y, 'Ink'); c.set(x + 1, y + 1, 'Ink'); c.set(x, y + 2, 'Ink'); }
  c.set(44, 25, 'Ink'); c.set(44, 26, 'Ink'); // one 1x2 eye
  // her program, held up beside her face: paper, Ink outline, its Maroon masthead band
  c.rect(53, 30, 8, 12, 'Ink');
  c.rect(54, 31, 6, 10, P);
  c.rect(54, 31, 6, 2, 'Maroon');
  // her hand on it: paper, Ink outline
  c.rect(53, 39, 4, 5, 'Ink');
  c.rect(54, 40, 2, 3, P);
}

function hat(pic) {
  const c = pic.c;
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
}

/**
 * art.book.cover.art. `parts` is for previews only: 'all' (the asset), or 'regular' (her and
 * her hat alone, for the silhouette test).
 */
export function coverPicture({ parts = 'all' } = {}) {
  const pic = new Pic();
  const c = pic.c;
  if (parts === 'all') {
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
  }
  regularProfile(pic);
  hat(pic);
  if (parts === 'all') {
    // plate border: right and bottom whole; top py4 broken by the crown (px24-47); left px0
    // broken by the brim (stops at py13, resumes at py19)
    c.rect(239, 4, 1, 124, 'Ink');
    c.rect(0, 127, 240, 1, 'Ink');
    for (let x = 0; x < 240; x++) if (x < 24 || x > 47) c.set(x, 4, 'Ink');
    for (let y = 4; y <= 127; y++) if (y <= 13 || y >= 19) c.set(0, y, 'Ink');
  }
  // paper is the light: transparent in the slot
  const out = new Canvas(PW, PH);
  for (let i = 0; i < c.px.length; i++) out.px[i] = c.px[i] === P ? null : c.px[i];
  return out;
}

// ---------------------------------------------------------------- the window (19.3)
/** art.window.program, 16x8: Ink outline, Parchment, the cover's Maroon masthead band. */
export function windowProgram() {
  const c = new Canvas(16, 8);
  c.rect(0, 0, 16, 8, 'Ink');
  c.rect(1, 1, 14, 6, 'Parchment');
  c.rect(1, 1, 14, 2, 'Maroon');
  return c;
}

// art.window.clerk: clerk 2 of the track, close up, facing us. 32x48, 2 frames (rest, stamp).
// Drawn fresh at this size, never scaled from art.hub.clerk. Ink, Cocoa, Turf, Bone. Rows 0-45
// show (screen y34-79); rows 46-47 are left blank because the counter cuts him there.
export const CLERK_SHOWN_ROWS = 46;
export function windowClerkFrames() {
  const ck = { K: 'Ink', C: 'Cocoa', T: 'Turf', B: 'Bone' };
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
  while (rows.length < CLERK_SHOWN_ROWS) rows.push(BODY);
  while (rows.length < 48) rows.push('.'.repeat(32));
  // Rest: his right hand (our left) at the counter with a Bone ticket.
  const rest = [...rows];
  for (const [y, r] of [
    [38, 'KTTTTKKKKKKKTTTTTTTTTTTTTKTTTTTK'],
    [39, 'KTTTKBBBBBBKKTTTTTTTTTTTTKTTTTTK'],
    [40, 'KTTKCBBBBBBKCKTTTTTTTTTTTKTTTTTK'],
    [41, 'KTKCCBBBBBBKCCKTTTTTTTTTTKTTTTTK'],
    [42, 'KTKCCKBBBBBKCCKTTTTTTTTTTKTTTTTK'],
    [43, 'KTKCCCKKKKKKCCKTTTTTTTTTTKTTTTTK'],
    [44, 'KTTKCCCCCCCCCKTTTTTTTTTTTKTTTTTK'],
    [45, 'KTTTKKKKKKKKKTTTTTTTTTTTTKTTTTTK'],
  ]) rest[y] = r;
  // Stamp: the same, and his left hand (our right) down on the tote machine beside him.
  const stamp = [...rest];
  for (const [y, r] of [
    [32, 'KTTTTTKTTTTTTTTTTTTTTTTTTKTTTTKK'],
    [33, 'KTTTTTKTTTTTTTTTTTTTTTTTTKTTTKCK'],
    [34, 'KTTTTTKTTTTTTTTTTTTTTTTTTKTTKCCC'],
    [35, 'KTTTTTKTTTTTTTTTTTTTTTTTTKTKCCCC'],
    [36, 'KTTTTTKTTTTTTTTTTTTTTTTTTKTKCCCC'],
    [37, 'KTTTTTKTTTTTTTTTTTTTTTTTTKTTKKKK'],
  ]) stamp[y] = r;
  const draw = (rs) => { const c = new Canvas(32, 48); c.draw(rs, ck); return c; };
  return [draw(rest), draw(stamp)];
}
export const windowClerk = () => strip(windowClerkFrames());

/** art.window.booth, 256x72, local y = screen y - 16. */
export function booth() {
  const c = new Canvas(256, 72);
  const Y = (y) => y - 16;
  c.rect(0, Y(16), 256, 64, 'Mist'); // the wall, y16-79
  c.blit(signPlate(), 16, Y(28)); // the track's sign plate on the left wall, x16-79, y28-39
  // the opening x96-159, y30-79: Maroon frame 2 px on the top and sides
  c.rect(96, Y(30), 64, 2, 'Maroon');
  c.rect(96, Y(30), 2, 50, 'Maroon');
  c.rect(158, Y(30), 2, 50, 'Maroon');
  // the lamp-lit booth: Dirt under the lintel, Hay below
  c.rect(98, Y(32), 60, 2, 'Dirt');
  c.rect(98, Y(34), 60, 46, 'Hay');
  // tote machine x144-155, y70-79, with its ticket tongue x148-151, y67-69
  c.rect(144, Y(70), 12, 10, 'Slate');
  c.rect(144, Y(70), 12, 1, 'Ash');
  c.rect(148, Y(67), 4, 3, 'Bone');
  // the wood counter y80-87
  c.rect(0, Y(80), 256, 1, 'Dirt Shade');
  c.rect(0, Y(81), 256, 7, 'Mud');
  return c;
}

// ---------------------------------------------------------------- all parts
export const PARTS = {
  'font.ui.display': displaySheet,
  'art.book.cover.art': () => coverPicture(),
  'art.window.booth': booth,
  'art.window.clerk': windowClerk,
  'art.window.program': windowProgram,
};

export function build() {
  return Object.entries(PARTS).map(([slot, fn]) => writeSlot(slot, fn()));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const p of build()) console.log(p);
}
