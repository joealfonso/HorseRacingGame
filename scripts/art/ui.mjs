// UI and race markers. Run: node scripts/art/ui.mjs
//
//   art.ui.frame.box         24x24, nine 8x8 tiles in a 3x3 sheet:
//                            row 0: top-left, top, top-right
//                            row 1: left, fill, right
//                            row 2: bottom-left, bottom, bottom-right
//                            Bone outer line, Ash inner line, Navy fill, rounded corners.
//   art.ui.cursor.horseshoe  8x8, 2 frames (bob: frame 2 is 1 px lower). Toe up, heels down.
//   art.ui.placeholder_tag   8x8 Pink and Ink checker of 2x2 cells.
//   art.ui.minimap.track     88x40 oval band, 4 px wide, Dirt Shade, with the 1x3 Bone wire
//                            tick at the right end of the bottom straight. Transparent
//                            elsewhere, so it sits on the HUD box's Navy fill.
//   art.race.marker.player   7x4 Yellow arrow with an Ink outline, pointing down.
//   art.ui.marker.yours     8x8 Yellow and Gold arrow with an Ink outline, pointing right, for the
//                            left of your horse's row in the result list. Rows 0-6, like the
//                            horseshoe. Sits on the Navy box fill.
//   art.race.marker.edge     8x9 recolorable, points right (flip for the left edge).
//                            7x9 Ink box, 5x7 fill in key Ash, 1 px Ink tip at x7 y4.
//                            Code draws the 3x5 number at x2-4, y2-6 (x3-5 when flipped).
//   art.ui.mark.pick         8x8 pencil tick, Slate only, no outline (graphite, a hand mark, not
//                            print). Short stroke down to the right, long stroke up to the right,
//                            2 px wide where it turns. Card entry x238-245, rows +9 to +16.
import { Canvas, strip, writeSlot } from './png.mjs';

function tile(rows) {
  const c = new Canvas(8, 8);
  c.draw(rows, { B: 'Bone', A: 'Ash', N: 'Navy' });
  return c;
}

function flipX(rows) {
  return rows.map((r) => [...r].reverse().join(''));
}
function flipY(rows) {
  return [...rows].reverse();
}
function transpose(rows) {
  return [...rows[0]].map((_, x) => rows.map((r) => r[x]).join(''));
}

const CORNER_TL = [
  '..BBBBBB',
  '.BNNNNNN',
  'BNNAAAAA',
  'BNANNNNN',
  'BNANNNNN',
  'BNANNNNN',
  'BNANNNNN',
  'BNANNNNN',
];
const EDGE_T = [
  'BBBBBBBB',
  'NNNNNNNN',
  'AAAAAAAA',
  'NNNNNNNN',
  'NNNNNNNN',
  'NNNNNNNN',
  'NNNNNNNN',
  'NNNNNNNN',
];
const FILL = Array(8).fill('NNNNNNNN');

export function frameBox() {
  const tiles = [
    [CORNER_TL, EDGE_T, flipX(CORNER_TL)],
    [transpose(EDGE_T), FILL, flipX(transpose(EDGE_T))],
    [flipY(CORNER_TL), flipY(EDGE_T), flipY(flipX(CORNER_TL))],
  ];
  const s = new Canvas(24, 24);
  tiles.forEach((row, ty) => row.forEach((t, tx) => s.blit(tile(t), tx * 8, ty * 8)));
  return s;
}

// Horseshoe, toe up and heels down, the shape everyone knows. Yellow where the light
// from the upper left lands, Gold on the lower right. 7 rows, so the bob frame fits.
const SHOE = [
  '..KKKK..',
  '.KYYYYK.',
  'KYYKKYYK',
  'KYK..KYK',
  'KYK..KGK',
  'KGK..KGK',
  'KKK..KKK',
];
export function cursor() {
  const key = { K: 'Ink', Y: 'Yellow', G: 'Gold' };
  const a = new Canvas(8, 8);
  a.draw(SHOE, key, 0, 0);
  const b = new Canvas(8, 8);
  b.draw(SHOE, key, 0, 1);
  return strip([a, b]);
}

export function placeholderTag() {
  const c = new Canvas(8, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    c.set(x, y, ((x >> 1) + (y >> 1)) % 2 === 0 ? 'Pink' : 'Ink');
  }
  return c;
}

// Stadium oval: two half circles joined by straights. Turn centers at x 20 and 68,
// y 20 (pixel-center coordinates), band from radius 16 to 20, so the straights are 48 px
// and the box is exactly 88x40. Integer math on doubled coordinates, no trig.
export function minimap() {
  const c = new Canvas(88, 40);
  for (let y = 0; y < 40; y++) for (let x = 0; x < 88; x++) {
    const px = 2 * x + 1; // doubled pixel center
    const py = 2 * y + 1;
    let d2; // squared distance from the centerline spine, doubled units
    if (px < 40) d2 = (px - 40) ** 2 + (py - 40) ** 2;
    else if (px > 136) d2 = (px - 136) ** 2 + (py - 40) ** 2;
    else d2 = (py - 40) ** 2;
    if (d2 >= 32 * 32 && d2 < 40 * 40) c.set(x, y, 'Dirt Shade');
  }
  // Wire: 1x3 Bone tick at the right end of the bottom straight (band rows 36-39).
  for (let y = 36; y <= 38; y++) c.set(67, y, 'Bone');
  return c;
}

export function playerMarker() {
  const c = new Canvas(7, 4);
  c.draw(['KKKKKKK', 'KYYYYYK', '.KYYYK.', '..KYK..'], { K: 'Ink', Y: 'Yellow' });
  return c;
}

// Right-pointing arrowhead in the same family as the horseshoe and the 7x4 arrow: Yellow where
// the light lands, Gold on the lower edge, 1 px Ink outline. Tip at x6 y3. Drawn in columns 0-6
// and rows 0-6, so column 7 and row 7 stay blank: 1 px before the text and the same baseline.
const YOURS = [
  'KK......',
  'KYKK....',
  'KYYYKK..',
  'KYYYYYK.',
  'KYGGKK..',
  'KGKK....',
  'KK......',
];
export function yoursMarker() {
  const c = new Canvas(8, 8);
  c.draw(YOURS, { K: 'Ink', Y: 'Yellow', G: 'Gold' });
  return c;
}

export function edgeMarker() {
  // 7x9 Ink box pointing right, 5x7 fill, 1 px Ink tip on the center row.
  const c = new Canvas(8, 9);
  c.draw([
    'KKKKKKK.',
    'KaaaaaK.',
    'KaaaaaK.',
    'KaaaaaK.',
    'KaaaaaKK',
    'KaaaaaK.',
    'KaaaaaK.',
    'KaaaaaK.',
    'KKKKKKK.',
  ], { K: 'Ink', a: 'Ash' });
  return c;
}

// DESIGN.md, Program pages: pencil tick, rows as given there.
const PICK = [
  '........',
  '.......S',
  '......SS',
  '.....SS.',
  'S...SS..',
  'SS.SS...',
  '.SSS....',
  '..S.....',
];
export function pickMark() {
  const c = new Canvas(8, 8);
  c.draw(PICK, { S: 'Slate' });
  return c;
}

export function build() {
  return [
    writeSlot('art.ui.frame.box', frameBox()),
    writeSlot('art.ui.cursor.horseshoe', cursor()),
    writeSlot('art.ui.placeholder_tag', placeholderTag()),
    writeSlot('art.ui.minimap.track', minimap()),
    writeSlot('art.race.marker.player', playerMarker()),
    writeSlot('art.race.marker.edge', edgeMarker()),
    writeSlot('art.ui.marker.yours', yoursMarker()),
    writeSlot('art.ui.mark.pick', pickMark()),
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const p of build()) console.log(p);
}
