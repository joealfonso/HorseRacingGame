// Composes full-screen mocks of the track (docs/specs/track-hub.md section 4) from the
// parts in hub.mjs, the shipped art under public/assets/ (read as drawn, never redrawn)
// and the real fonts. Run: node scripts/art/hub_mock.mjs
//
// Writes docs/mocks/track-hub/<frame>.png (256x240) and <frame>-3x.png (768x720,
// nearest neighbor), then checks each frame and exits 1 on any failure:
//  - every pixel a master palette color at alpha 255 (the canvas only holds palette names)
//  - the still picture (everything but sprites, text and UI) at most 8 colors in each
//    16x16 screen cell
//  - every person at most 4 opaque colors per frame, with an Ink outer silhouette
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Canvas, PALETTE, REPO, decodePng, slotPath, writePng } from './png.mjs';
import * as hub from './hub.mjs';

const OUT = join(REPO, 'docs', 'mocks', 'track-hub');

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
function frame(c, i, fw, fh = c.h) {
  const f = new Canvas(fw, fh);
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) f.set(x, y, c.get(i * fw + x, y));
  return f;
}
function sub(c, x0, y0, w, h) {
  const f = new Canvas(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f.set(x, y, c.get(x0 + x, y0 + y));
  return f;
}
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
  crowd: load('art.race.bg.mid.crowd'),
  infield: load('art.race.bg.mid.infield'),
  flag: load('art.race.ambient.flag'),
  dirt: load('art.track.dirt.fast'),
  railFar: load('art.race.rail.far'),
  railNear: load('art.race.rail.near'),
  box: load('art.ui.frame.box'),
  shoe: load('art.ui.cursor.horseshoe'),
  main: load('font.ui.main'),
  small: load('font.ui.small'),
};
const P = Object.fromEntries(Object.entries(hub.PARTS).map(([k, fn]) => [k, fn()]));

// ------------------------------------------------------------- text
function text(dst, str, x, y, color = 'Bone') {
  [...str].forEach((ch, i) => {
    const n = ch.charCodeAt(0) - 32;
    const g = sub(A.main, (n % 16) * 8, Math.floor(n / 16) * 8, 8, 8);
    dst.blit(recolor(g, { Bone: color }), x + i * 8, y);
  });
}
const textRight = (dst, str, right, y, color) => text(dst, str, right + 1 - str.length * 8, y, color);
const SMALL = '0123456789:./#- ';
function small(dst, str, x, y, color = 'Bone') {
  [...str].forEach((ch, i) => {
    const k = SMALL.indexOf(ch);
    if (k < 0) throw new Error(`no small glyph ${ch}`);
    dst.blit(recolor(sub(A.small, k * 4, 0, 4, 6), { Bone: color }), x + i * 4, y);
  });
}

// ------------------------------------------------------------- the scene
const SKY = { // DESIGN.md, sky by race: [color, from, to]
  day: [['Sky', 16, 39], ['Sky Pale', 40, 63]],
  late: [['Sky', 16, 23], ['Sky Pale', 24, 39], ['Dusk', 40, 63]],
  dusk: [['Sky', 16, 23], ['Dusk', 24, 63]],
};
const skyFor = (r) => (r <= 6 ? SKY.day : r === 7 ? SKY.late : SKY.dusk);

// The still picture: sky, stand, infield, board, track, apron, gate, cart. No sprites.
function background(race) {
  const c = new Canvas(256, 240);
  c.rect(0, 176, 256, 64, 'Ink'); // behind the box's rounded corners: the desk
  for (const [col, y0, y1] of skyFor(race)) c.rect(0, y0, 256, y1 - y0 + 1, col);
  // Infield: the landmark tile at x91 so the flag lands at x115-122, y59-66; the stand
  // covers its left 21 columns. Then the repeating slice (columns 0-15) from x123.
  c.blit(A.infield, 91, 56);
  for (let x = 123; x < 256; x += 16) c.blit(sub(A.infield, 0, 0, Math.min(16, 256 - x), 32), x, 56);
  // Far rail (bar y88-89) on the infield's grass verge, fast dirt below, near rail at
  // y118 (bar y118-120), all as drawn, flipped every other tile as the race view does.
  c.rect(112, 88, 144, 8, 'Grass');
  for (let x = 112; x < 256; x += 16) {
    const odd = Math.floor(x / 16) % 2 === 1;
    c.blit(odd ? flipX(A.railFar) : A.railFar, x, 88);
  }
  for (let y = 96; y < 118; y += 16) for (let x = 112; x < 256; x += 16) {
    c.blit(sub(A.dirt, 0, 0, 16, Math.min(16, 118 - y)), x, y);
  }
  for (let x = 112; x < 256; x += 16) {
    const odd = Math.floor(x / 16) % 2 === 1;
    c.blit(sub(odd ? flipX(A.railNear) : A.railNear, 0, 0, 16, 4), x, 118);
  }
  // Apron: right half from y122, under the stand from y152.
  for (let y = 122; y < 176; y += 16) for (let x = 112; x < 256; x += 16) {
    c.blit(sub(P['art.hub.apron'], 0, 0, 16, Math.min(16, 176 - y)), x, y);
  }
  for (let y = 152; y < 176; y += 16) for (let x = 0; x < 112; x += 16) {
    c.blit(sub(P['art.hub.apron'], 0, 0, 16, Math.min(16, 176 - y)), x, y);
  }
  c.blit(P['art.hub.tote.board'], 124, 32);
  c.blit(P['art.hub.stand.upper'], 0, 24);
  c.blit(P['art.hub.stand.facade'], 0, 96);
  c.blit(P['art.hub.sign.plate'], 24, 100);
  c.blit(P['art.hub.paddock.gate'], 112, 140);
  c.blit(P['art.hub.cart'], 184, 144);
  return c;
}

// Sprites over the still picture: the crowd strip, the flag, the people.
function sprites(c, people) {
  for (let x = 0; x < 112; x += 16) {
    const odd = Math.floor(x / 16) % 2 === 1;
    const f = frame(A.crowd, odd ? 1 : 0, 16); // neighbors out of phase
    c.blit(odd ? flipX(f) : f, x, 32);
  }
  c.blit(frame(A.flag, 0, 8), 115, 59);
  for (const [img, x, y] of people) c.blit(img, x, y);
}

function cast() {
  const clerk = frame(P['art.hub.clerk'], 0, 16);
  const fan = frame(P['art.hub.fan.back'], 0, 16);
  return [
    [frame(P['art.hub.regular'], 0, 16), 56, 48],
    [clerk, 16, 120],
    [recolor(clerk, { Peach: 'Cocoa' }), 52, 120],
    [recolor(clerk, { Peach: 'Tan' }), 88, 120],
    [P['art.hub.bettor.back'], 36, 128],
    [P['art.hub.rail.program'], 192, 115],
    [recolor(fan, hub.FAN_RECOLORS.A), 124, 108],
    [flipX(recolor(fan, hub.FAN_RECOLORS.B)), 140, 108],
    [recolor(fan, hub.FAN_RECOLORS.C), 228, 108],
    [frame(P['art.hub.bugler'], 0, 16), 128, 146],
    [frame(P['art.hub.vendor'], 0, 16), 216, 144],
  ];
}

// The status bar and the box at the foot.
function ui(c, s) {
  c.rect(0, 0, 256, 15, 'Navy');
  c.rect(0, 15, 256, 1, 'Ash');
  text(c, `Race ${s.race} of 8`, 4, 4);
  textRight(c, `Bank ${s.bank}`, 251, 4);
  // Dialog box from the 8x8 frame tiles, x0-255, y176-239.
  for (let ty = 0; ty < 8; ty++) for (let tx = 0; tx < 32; tx++) {
    const col = tx === 0 ? 0 : tx === 31 ? 2 : 1;
    const row = ty === 0 ? 0 : ty === 7 ? 2 : 1;
    c.blit(sub(A.box, col * 8, row * 8, 8, 8), tx * 8, 176 + ty * 8);
  }
  const shoe = frame(A.shoe, 0, 8);
  if (s.focus === 'windows' || s.focus === 'rail') {
    text(c, s.voice[0], 20, 186);
    text(c, s.voice[1], 20, 196);
    c.blit(shoe, 8, s.focus === 'windows' ? 210 : 222);
  } else {
    c.blit(shoe, 8, 186);
    text(c, s.name, 20, 186);
    text(c, s.voice[1], 20, 196);
  }
  text(c, `Bet Race ${s.race}`, 20, 210);
  text(c, `Just watch Race ${s.race}`, 20, 222);
  // The sign plate's one word, from data in the build.
  text(c, 'Windows', 28, 102);
  // Tote board text, from data in the build.
  text(c, `Race ${s.race}`, 132, 36);
  s.odds.forEach((o, i) => {
    const j = i % 4;
    const y = i < 4 ? 50 : 60;
    small(c, String(i + 1), 132 + 30 * j, y, 'Orange');
    small(c, o ?? '-', 138 + 30 * j, y, 'Bone'); // left-aligned right after its digit
  });
  // Focus corners: the corner's outer Ink corner on the focus box's corner.
  const [x0, y0, x1, y1] = s.box;
  const top = frame(P['art.ui.focus.corner'], 0, 8);
  const bot = frame(P['art.ui.focus.corner'], 1, 8);
  c.blit(top, x0, y0);
  c.blit(flipX(top), x1 - 7, y0);
  c.blit(bot, x0, y1 - 7);
  c.blit(flipX(bot), x1 - 7, y1 - 7);
}

// ------------------------------------------------------------- checks
const fails = [];
function checkCells(bg, name) {
  let worst = 0;
  for (let cy = 16; cy < 176; cy += 16) for (let cx = 0; cx < 256; cx += 16) {
    const set = new Set();
    for (let y = cy; y < cy + 16; y++) for (let x = cx; x < cx + 16; x++) set.add(bg.get(x, y));
    set.delete(null);
    worst = Math.max(worst, set.size);
    if (set.size > 8) fails.push(`${name}: cell x${cx} y${cy} has ${set.size} colors: ${[...set].join(', ')}`);
  }
  return worst;
}
function checkPerson(slot) {
  const c = P[slot];
  for (let f = 0; f < c.w / 16; f++) {
    const fr = frame(c, f, 16);
    const cols = fr.colors();
    if (cols.length > 4) fails.push(`${slot} frame ${f}: ${cols.length} colors`);
    if (!cols.includes('Ink')) fails.push(`${slot} frame ${f}: no Ink`);
    // Outer silhouette: every opaque pixel with a transparent 4-neighbor is Ink.
    for (let y = 0; y < 24; y++) for (let x = 0; x < 16; x++) {
      const p = fr.get(x, y);
      if (p === null || p === 'Ink') continue;
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => fr.get(x + dx, y + dy) === null);
      // Rows a counter or the frame cuts (clerk row 19, frame edges) are not silhouette.
      const cut = (slot === 'art.hub.clerk' && y === 19) || x === 0 || x === 15 || y === 23;
      if (edge && !cut) fails.push(`${slot} frame ${f}: ${p} on the outline at ${x},${y}`);
    }
  }
}

// ------------------------------------------------------------- frames
const ODDS = ['5-2', '9-2', '7-2', '26-1', '3-1', '8-1', '4-1', '12-1'];
const FRAMES = {
  'a-windows': {
    race: 3, bank: '$100.00', odds: ODDS, focus: 'windows', box: [4, 98, 107, 145],
    voice: ['Race 3 is up.', "Sun's out. Hats are out."],
  },
  'b-snack-cart': {
    race: 3, bank: '$100.00', odds: ODDS, focus: 'cart', box: [180, 140, 235, 171],
    name: 'The snack cart', voice: ['', 'Hot peanuts! Mostly warm.'],
  },
  'c-last-race': {
    race: 8, bank: '$100.00', odds: Array(8).fill(null), focus: 'rail', box: [172, 104, 219, 135],
    voice: ['Last race of the day.', 'Make it a good one.'],
  },
};

function scale3(c) {
  const o = new Canvas(c.w * 3, c.h * 3);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.px[y * o.w + x] = c.px[Math.floor(y / 3) * c.w + Math.floor(x / 3)];
  return o;
}

export function build() {
  const written = [];
  for (const slot of hub.PEOPLE) checkPerson(slot);
  for (const [name, s] of Object.entries(FRAMES)) {
    const c = background(s.race);
    const worst = checkCells(c, name);
    sprites(c, cast());
    // No focus corner may cover a figure's drawn pixels (DESIGN.md, Focus corners).
    const figures = new Canvas(256, 240);
    for (const [img, x, y] of cast()) figures.blit(img, x, y);
    const [bx0, by0, bx1, by1] = s.box;
    for (const [cx, cy] of [[bx0, by0], [bx1 - 7, by0], [bx0, by1 - 7], [bx1 - 7, by1 - 7]]) {
      for (let y = cy; y < cy + 8; y++) for (let x = cx; x < cx + 8; x++) {
        const local = [x - cx, y - cy];
        const corner = frame(P['art.ui.focus.corner'], y >= by1 - 7 && cy === by1 - 7 ? 1 : 0, 8);
        const lx = cx === bx1 - 7 ? 7 - local[0] : local[0];
        if (corner.get(lx, local[1]) !== null && figures.get(x, y) !== null) fails.push(`${name}: focus corner covers a figure at ${x},${y}`);
      }
    }
    ui(c, s);
    if (c.px.some((p) => p === null)) fails.push(`${name}: transparent pixels left`);
    writePng(join(OUT, `${name}.png`), c);
    writePng(join(OUT, `${name}-3x.png`), scale3(c));
    written.push(`${name} (most colors in a cell of the still picture: ${worst})`);
  }
  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  hub.buildMockParts();
  for (const w of build()) console.log(w);
  if (fails.length) {
    for (const f of fails) console.error('FAIL', f);
    process.exit(1);
  }
  console.log('checks passed');
}
