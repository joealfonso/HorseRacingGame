// Mid-layer life for step 2: the crowd, the infield and its flag. Run: node scripts/art/mid.mjs
//
//   art.race.bg.mid.crowd     16x16, 2 frames (seated; arms and hats up). Tiles horizontally.
//                             Transparent between figures, so the grandstand seats show.
//                             Place it on the grandstand at screen y64 (grandstand rows
//                             8-23), same x as the stand tiles: the back row's hats sit in
//                             the Slate canopy shade (y65-66), the front row ends at y76,
//                             and seats y77-80 and the stand's Bone rail (y81) stay visible.
//                             Rows 0 and 13-15 are empty.
//                             Colors: Bone, Sky, Tan (straw hats, faces, arms). Reads the
//                             same flipped, so the engineer may mirror every other tile.
//   art.race.bg.mid.infield   32x32, 1 frame. Clipped hedge on infield lawn with a flagpole.
//                             Mid layer, top at screen y56. Rows 0-7 transparent (hills),
//                             rows 8-31 opaque. Colors: Turf, Grass, Bone.
//                             Flagpole at x23. Place the full tile once per turn; to fill
//                             the rest of the turn, repeat its columns 0-15 (a 16 px slice
//                             with no pole that tiles seamlessly, since the hedge repeats
//                             every 8 px).
//   art.race.ambient.flag     8x8, 2 frames. A triangular pennant: Ink outline, Bone hoist
//                             strip, Red field, rows 0-6. Not any real flag. Its hoist
//                             (column 0) attaches to the pole: flag top-left = infield
//                             tile top-left + (24, 3).
import { Canvas, strip, writeSlot } from './png.mjs';

// One race-goer, 3x6. Rows from the hat down; '.' is transparent.
// h = hat color, s = shirt color, T = Tan (face, arms).
const SEATED = [
  '.h.',
  'hhh',
  '.T.',
  'sss',
  'sss',
  'sss',
];
const CHEERING = [ // arms up, hat waved in one hand
  'h.T',
  'T.T',
  'TTT',
  'sss',
  'sss',
  'sss',
];
const CHEERING_BARE = [ // straw hat stays on, both arms up
  'ThT',
  'hhh',
  '.T.',
  'sss',
  'sss',
  'sss',
];

// The crowd: x, y (top of the figure), hat, shirt, and whether this one cheers in frame 2.
// Back row on rows 1-6, front row on rows 7-12 (just under the back row's shoulders),
// offset 2 px so heads sit between shoulders. Rows 0 and 13-15 are empty.
const PEOPLE = [
  [0, 1, 'Sky', 'Bone', true],
  [4, 1, 'Tan', 'Sky', false],
  [8, 1, 'Bone', 'Bone', true],
  [12, 1, 'Tan', 'Bone', true],
  [2, 7, 'Bone', 'Sky', true],
  [6, 7, 'Sky', 'Bone', false],
  [10, 7, 'Tan', 'Sky', true],
  [14, 7, 'Bone', 'Bone', true],
];

function crowdFrame(cheer) {
  const c = new Canvas(16, 16);
  for (const [x, y, hat, shirt, cheers] of PEOPLE) {
    const shape = cheer && cheers ? (hat === 'Tan' ? CHEERING_BARE : CHEERING) : SEATED;
    shape.forEach((row, j) => [...row].forEach((p, i) => {
      const color = p === 'h' ? hat : p === 's' ? shirt : p === 'T' ? 'Tan' : null;
      if (color) c.set((x + i) % 16, y + j, color); // wraps, so the tile repeats seamlessly
    }));
  }
  return c;
}
export const crowd = () => strip([crowdFrame(false), crowdFrame(true)]);

export function infield() {
  const c = new Canvas(32, 32);
  // Rows 0-7 stay transparent so the hills show (screen y56-63); from row 8 (y64) down
  // the tile is opaque infield lawn, so nothing behind it ever shows through.
  c.rect(0, 8, 32, 24, 'Grass');
  // Clipped hedge rows 17-26 in Turf, a rounded top repeating every 8 px, with a few
  // Grass leaf flecks inside it (never on the top edge, which must stay Turf on Grass).
  for (let x = 0; x < 32; x++) {
    const k = x % 8;
    const top = [19, 18, 17, 17, 17, 17, 18, 19][k];
    c.rect(x, top, 1, 27 - top, 'Turf');
  }
  for (let x = 0; x < 32; x += 8) {
    c.set(x + 2, 19, 'Grass');
    c.set(x + 5, 21, 'Grass');
    c.set(x + 1, 23, 'Grass');
    c.set(x + 6, 24, 'Grass');
  }
  // Flagpole at x23, rows 3-27, in front of the hedge, a 3 px Bone finial on row 2 and a
  // base block at x21-25, rows 27-28. Columns 0-15 stay pole-free.
  c.rect(22, 2, 3, 1, 'Bone');
  c.rect(23, 3, 1, 25, 'Bone');
  c.rect(21, 27, 5, 2, 'Bone');
  return c;
}

// Triangular pennant with a Bone hoist strip: generic, not any country's flag.
const FLAG = [
  [ // 1
    'KKK.....',
    'KBRKK...',
    'KBRRRKK.',
    'KBRRRRRK',
    'KBRRRKK.',
    'KBRKK...',
    'KKK.....',
  ],
  [ // 2: the tip dips 1 px as it flaps
    'KKKK....',
    'KBRRK...',
    'KBRRRKK.',
    'KBRRRRK.',
    'KBRRRRRK',
    'KBRRKK..',
    'KKKK....',
  ],
];
export function flag() {
  return strip(FLAG.map((rows) => {
    const c = new Canvas(8, 8);
    c.draw(rows, { K: 'Ink', R: 'Red', B: 'Bone' });
    return c;
  }));
}

export function build() {
  return [
    writeSlot('art.race.bg.mid.crowd', crowd()),
    writeSlot('art.race.bg.mid.infield', infield()),
    writeSlot('art.race.ambient.flag', flag()),
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const p of build()) console.log(p);
}
