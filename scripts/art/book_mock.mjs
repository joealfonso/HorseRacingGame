// Mock of the book and the window (docs/specs/book-and-window.md, ruled by section 18).
// Joseph approved the look on 2026-11-14 ("Yes, build it"). The new art is now slot art,
// drawn by scripts/art/book.mjs (font.ui.display, art.book.cover.art, art.window.booth,
// art.window.clerk, art.window.program); this script only composes the mock screens from it
// and writes nothing under public/.
// Run: node scripts/art/book_mock.mjs
//
// Reuses, as drawn: the palette (png.mjs), font.ui.main, font.ui.small, art.ui.frame.box,
// art.ui.cursor.horseshoe, art.ui.marker.yours, art.ui.mark.pick, art.ui.focus.corner, and
// the track's accepted art under public/assets/art/ (clerk, sign plate, stand, board, people).
// Imports from book.mjs: the display font, the cover picture (with the 21.1 intake fixes), the
// window booth, the 32x48 close-up clerk and the program on the counter.
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
import { CLERK_SHOWN_ROWS, booth, coverPicture, displayGlyph, windowClerkFrames, windowProgram } from './book.mjs';

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
// font.ui.display, from scripts/art/book.mjs: 12x16 cell, glyph 10x14, capitals only.
function display(dst, str, y, color) {
  const s = str.toUpperCase();
  const x0 = Math.floor((256 - 12 * s.length) / 2);
  [...s].forEach((ch, i) => dst.blit(displayGlyph(ch, color), x0 + i * 12, y));
}

// ------------------------------------------------------------- cover and window art
// Drawn by scripts/art/book.mjs (the slot art). The mock composes the screens from it.


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
  text(c, 'Pace, class and peanuts.', 8, 14, 'Ink'); // docs/specs/book-useful.md section 8
  rule(c, 24);
  NEWS.forEach(({ headline: h, lines: [b1, b2] }, k) => {
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

// ------------------------------------------------------------- news (book-useful.md 3)
// Five hints in race order, pairs word for word from section 3.5. Races 2, 3 and 5 are the
// mock's own fields (stable.json): each has a unique top total, a lead under 26, 2 or 3
// front-runners and no front-runner ranked 1-3 in post 7 or 8, so K7 is the only kind that
// fires there; each takes a different K7 pair. Races 1 and 7 are not drawn in the mock, so
// they take a K1 and a K3 pair with horses from outside the three fields, of the right style.
// The lead (cover line) is the first by priority K1, K2, K3, K4, K5, K6, K7.
function wrap30(s) {
  const out = [''];
  for (const w of s.split(' ')) {
    const cur = out[out.length - 1];
    if (cur && cur.length + 1 + w.length > 30) out.push(w); else out[out.length - 1] = cur ? `${cur} ${w}` : w;
  }
  return out;
}
const PRIORITY = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7'];
const fieldTop = (hs) => hs.map((h) => [h, h.stats.speed + h.stats.stamina + h.stats.kick]).sort((a, b) => b[1] - a[1]);
const NEWS_SRC = [
  { r: 1, kind: 'K1', name: 'Running Joke', style: 'frontRunner', headline: 'one wants the lead', body: 'Only {name} wants the lead. The bugler approves.' },
  { r: 2, kind: 'K7', field: R2, headline: 'tops on the numbers', body: 'On paper, {name}. Paper has been wrong before.' },
  { r: 3, kind: 'K7', field: R3, headline: 'most in the bars', body: 'Add the three bars. Top here: {name}.' },
  { r: 5, kind: 'K7', field: R5, headline: 'best sum here', body: 'Sum the bars and {name} comes out on top.' },
  { r: 7, kind: 'K3', name: 'Late Checkout', style: 'closer', headline: 'a crowd up front', body: 'A busy lead helps closers. Top one here: {name}.' },
];
const NEWS = NEWS_SRC.map((n) => {
  let name = n.name;
  if (n.field) {
    const t = fieldTop(n.field);
    if (t[0][1] === t[1][1]) throw new Error(`race ${n.r}: no unique top, K7 is false`);
    name = t[0][0].name;
  } else {
    if (byName[name].style !== n.style) throw new Error(`${name} is not a ${n.style}`);
    if ([R2, R3, R5].some((f) => f.some((h) => h.name === name))) throw new Error(`${name} is in a mock field`);
  }
  const lines = wrap30(n.body.replace('{name}', name));
  if (lines.length > 2) throw new Error(`race ${n.r}: body needs a third line`);
  return { r: n.r, kind: n.kind, headline: `Race ${n.r}: ${n.headline}`, lines: [lines[0], lines[1] ?? ''] };
});
const LEAD = [...NEWS].sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind) || a.r - b.r)[0];
const COVER_LINE = LEAD.headline;

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
  // L4: the pace phrase from the field's own front-runner count (book-useful.md section 6)
  const fronts = horses.filter((h) => h.style === 'frontRunner').length;
  text(c, `Dirt, fast, ${fronts === 0 ? 'none' : fronts} up front`, 8, 34, 'Ink');
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
  c.blit(booth(), 0, 16);
  // the still picture's cells, before the sprites go on
  checkCells(c, 'window booth', 16, 88);
  statusBar(c, 3, bank);
  text(c, 'Windows', 20, 30);
  c.blit(sub(CLERK[mode === 'placed' ? 1 : 0], 0, 0, 32, CLERK_SHOWN_ROWS), 112, 34); // the counter cuts him at y80
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
const CLERK = windowClerkFrames();

// ------------------------------------------------------------- intake previews (assets/)
// Sheets for the art-director's intake of the book.mjs assets: the cover before and after the
// 21.1 fixes, in color, gray and as the silhouette test, the whole display font, and the
// window parts alone and composed. cover-before-intake.png is the accepted mock picture as it
// stood before the fixes (1-cover-picture.png of the third pass), kept as the record.
const ASSET_OUT = join(OUT, 'assets');
function loadFile(path) {
  const { w, h, data } = decodePng(readFileSync(path));
  const c = new Canvas(w, h);
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] === 0) continue;
    const hex = '#' + [0, 1, 2].map((k) => data[i * 4 + k].toString(16).padStart(2, '0')).join('').toUpperCase();
    c.set(i % w, Math.floor(i / w), HEX[hex]);
  }
  return c;
}
// The regular and her hat filled with Ink (DESIGN Shapes and shading, the silhouette test).
// Region: px1-71 by py5-109, without the rails and hedge that start at px62. Paper reachable
// from the region's edge is outside; everything else is her.
function silhouette(pic, paperName = 'Parchment') {
  const inRegion = (x, y) => x >= 1 && x <= 71 && y >= 0 && y <= 109 && (x < 62 || y <= 20 || (y >= 80 && y <= 106)) && !(y === 4 && (x < 24 || x > 47));
  const isPaper = (x, y) => { const v = pic.get(x, y); return v === null || v === paperName; };
  const out = new Canvas(pic.w, pic.h);
  const seen = new Set();
  const stackXY = [];
  for (let y = 0; y <= 110; y++) for (let x = 0; x <= 72; x++) if (!inRegion(x, y)) { seen.add(y * 1000 + x); }
  for (let y = 0; y <= 109; y++) for (let x = 1; x <= 71; x++) {
    if (!inRegion(x, y)) continue;
    const border = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => !inRegion(x + i, y + j));
    if (border && isPaper(x, y)) { stackXY.push([x, y]); seen.add(y * 1000 + x); }
  }
  while (stackXY.length) {
    const [x, y] = stackXY.pop();
    for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + i; const ny = y + j;
      if (seen.has(ny * 1000 + nx) || !inRegion(nx, ny) || !isPaper(nx, ny)) continue;
      seen.add(ny * 1000 + nx); stackXY.push([nx, ny]);
    }
  }
  out.rect(0, 0, 80, 112, 'Parchment');
  for (let y = 0; y <= 109; y++) for (let x = 1; x <= 71; x++) if (inRegion(x, y) && !seen.has(y * 1000 + x)) out.set(x, y, 'Ink');
  return sub(out, 0, 0, 80, 112);
}
function onPaper(pic, pad = 6) { const c = new Canvas(pic.w + 2 * pad, pic.h + 2 * pad); c.rect(0, 0, c.w, c.h, 'Parchment'); c.blit(pic, pad, pad); return c; }
function label(c, str, color = 'Bone') { const o = new Canvas(Math.max(c.w, str.length * 8), c.h + 12); o.rect(0, 0, o.w, o.h, 'Ink'); text(o, str, 0, 2, color); o.blit(c, 0, 12); return o; }
function assetSheet(name, c, { gray = false } = {}) {
  writePng(join(ASSET_OUT, `${name}.png`), c);
  writePng(join(ASSET_OUT, `${name}-3x.png`), scale(c, 3));
  written.push(`assets/${name}.png`, `assets/${name}-3x.png`);
  if (gray) {
    writeGray(join(ASSET_OUT, `${name}-gray-3x.png`), scale(c, 3));
    written.push(`assets/${name}-gray-3x.png`);
  }
}
function previews() {
  const before = sub(loadFile(join(ASSET_OUT, 'cover-before-intake.png')), 8, 6, 240, 128);
  const after = COVER;
  // the whole asset on paper, in color and gray
  assetSheet('cover-art', onPaper(after), { gray: true });
  // the regular before and after the two fixes, close
  const crop = (p) => onPaper(sub(p, 0, 0, 80, 112), 4);
  assetSheet('cover-regular-before-after', row([label(crop(before), 'before'), label(crop(after), 'after')]), { gray: true });
  // the silhouette test, before and after
  assetSheet('cover-regular-silhouette', row([label(onPaper(silhouette(before), 4), 'before'), label(onPaper(silhouette(after), 4), 'after')]));
  // the display font: the sheet as delivered (Bone on Ink), and set Parchment on Maroon
  const sheetImg = loadFile(slotPath('font.ui.display'));
  const font = new Canvas(sheetImg.w + 8, sheetImg.h + 8);
  font.rect(0, 0, font.w, font.h, 'Ink');
  font.blit(sheetImg, 4, 4);
  const lines = ['CHURCHILL DOWNS', 'SPHINX OF BLACK', 'QUARTZ JUDGE MY VOW', '0123456789', "AL'S PARK & DOWNS."];
  const set = new Canvas(256, 12 + 20 * lines.length);
  set.rect(0, 0, 256, set.h, 'Parchment');
  set.rect(8, 4, 240, set.h - 8, 'Maroon');
  lines.forEach((s, i) => display(set, s, 8 + 20 * i, 'Parchment'));
  assetSheet('display-font', stack([font, set]));
  // the window parts alone, then composed as on screen (rest and stamp)
  const desk = (c) => { const o = new Canvas(c.w + 8, c.h + 8); o.rect(0, 0, o.w, o.h, 'Ink'); o.blit(c, 4, 4); return o; };
  const parts = row([desk(booth()), desk(CLERK[0]), desk(CLERK[1]), desk(windowProgram())]);
  const composed = (f) => {
    const c = booth();
    text(c, 'Windows', 20, 14);
    c.blit(sub(CLERK[f], 0, 0, 32, CLERK_SHOWN_ROWS), 112, 18);
    c.blit(windowProgram(), 176, 56);
    return c;
  };
  assetSheet('window-parts', stack([parts, row([composed(0), composed(1)])]));
}

export function build() {
  if (COVER.colors().some((x) => x !== 'Ink' && x !== 'Maroon')) fails.push('cover picture: a color other than Ink and Maroon');
  const coverPage = cover();
  const COVER_INKS = ['Parchment', 'Ink', 'Maroon'];
  sheet('1-cover', coverPage, { gray: true, only: COVER_INKS });
  // the masthead alone, display font over the 8x8 font, so the reason for the font shows
  const mast = (c) => sub(c, 0, 0, 256, 48);
  sheet('1-cover-masthead-compare', stack([mast(coverPage), mast(cover({ eightByEight: true }))]), { only: COVER_INKS });
  sheet('1-cover-picture', (() => { const c = paper(); c.blit(COVER, 8, 62); return sub(c, 0, 56, 256, 140); })(), { only: COVER_INKS });
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
  previews();
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

export { NEWS, LEAD, COVER_LINE };
