// Stand-in race horse (P0), drawn to DESIGN.md "Stand-in race horse (P0)".
// Run: node scripts/art/horse.mjs
//
// Writes four layers, each as a gallop strip (A reach, B gather) and a stand strip,
// all 32x24 frames with the same anchor (frame top-left; hoof line y23; nose x31):
//   art.race.horse.body.{gallop,stand}     Ink outline, coat base in key Ash
//   art.race.horse.tack.{gallop,stand}     saddlecloth: 7x9 Ink box, 5x7 fill in key Ash.
//                                          The number is drawn by code in the trim slot,
//                                          3x5 at x10-12, y10-14 (y9-13 in gallop B).
//   art.race.jockey.jacket.{gallop,stand}  Ink, silks body in key Ash. Same pixels in every frame.
//   art.race.jockey.cap.{gallop,stand}     Ink, cap color in key Ash. Same pixels in every frame.
//
// Keys (DESIGN.md, Layers): slot 1 Ink, slot 2 Ash, slot 3 Slate. P0 uses no slot 3.
import { Canvas, strip, writeSlot } from './png.mjs';

const W = 32;
const H = 24;
const KEY = { K: 'Ink', a: 'Ash' };

// Body frames. K = Ink outline (and the 1 px eye), a = coat base.
// Columns 0-31, rows 0-23. Every row is exactly 32 characters.
const BODY_A = [ // gallop A, reach: barrel y9-16, nose (31,10)
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '...........................K....', // pricked ear on the poll
  '........................KKKKK...',
  '......................KKaaaaaK..',
  '..KKKKKKKKKKKKKKKKKKKKaaaaaaKaK.', // back line, tail off the croup, eye at x28
  'KK..KaaaaaaaaaaaaaaaaaaaaaaKaaaK', // nose x31
  'K..KaaaaaaaaaaaaaaaaaaaaaaK.KKK.', // throat notch at x27
  '...KaaaaaaaaaaaaaaaaaaaaaK......',
  '...KaaaaaaaaaaaaaaaaaaaaK.......',
  '....KaaaaaaaaaaaaaaaaaaK........',
  '....KaaaKKKaaaaaaaaaaaaK........', // flank tuck x8-10
  '....KaKKK..KKKKKKKKKKKaK........', // belly y16
  '...KKKKK...........KK.KaK.......', // forearm and gaskin
  '..KK.KK.............KK.KaK......',
  '.KK.KK..............KK..KKK.....', // hocks back, near knee
  'KK.KK................KK...KK....',
  'KK.KK................KK....KK...',
  'KK.KK.................KK....KK..',
  'KK.KKK................KKK....KK.', // hoof line y23
];

const BODY_B = [ // gallop B, gather: barrel y8-15, nose (31,9)
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '...........................K....',
  '........................KKKKK...',
  '......................KKaaaaaK..',
  '..KKKKKKKKKKKKKKKKKKKKaaaaaaKaK.',
  'KK..KaaaaaaaaaaaaaaaaaaaaaaKaaaK', // nose x31
  'K..KaaaaaaaaaaaaaaaaaaaaaaK.KKK.',
  '...KaaaaaaaaaaaaaaaaaaaaaK......',
  '...KaaaaaaaaaaaaaaaaaaaaK.......',
  '....KaaaaaaaaaaaaaaaaaaK........',
  '....KaaaKKKaaaaaaaaaaaaK........',
  '....KKaKK..KKKKKKKKKKKaK........', // belly y15
  '...KK.KK.........KK...KaK.......',
  '..KK.KK..........KK....KKK......', // near fore knee forward
  '..KK.KK.........KK.....KK.......', // hocks back
  '..KK..KK........KK....KK........', // near fore cannon folds back
  '...KK..KK.......KK...KK.........',
  '...KK...KK......KK..KK..........', // near fore hoof tucked
  '....KK...KK.....KK..............',
  '....KKK...KKK...KKK.............', // hoof line y23
];

const BODY_STAND = [ // stand: barrel y9-16, nose (31,6), head up
  '................................',
  '................................',
  '................................',
  '............................K...', // ear
  '...........................KKK..',
  '..........................KaKaK.', // eye at x28
  '.........................KaaaaaK', // nose x31
  '........................KaaKKKK.',
  '......................KKaaK.....', // throat notch at x27
  '..KKKKKKKKKKKKKKKKKKKKaaaK......',
  '.K..KaaaaaaaaaaaaaaaaaaaK.......',
  '.K.KaaaaaaaaaaaaaaaaaaaaK.......',
  '.K.KaaaaaaaaaaaaaaaaaaaK........',
  '.K.KaaaaaaaaaaaaaaaaaaaK........',
  '.K..KaaaaaaaaaaaaaaaaaaK........',
  '.K..KaaaKKKaaaaaaaaaaaaK........',
  '....KKKKK..KKKKKKKKKKKK.........', // belly y16
  '....KK.KK........KK.KK..........',
  '...KK.KK.........KK.KK..........', // far leg of each pair 1 px behind
  '...KK.KK.........KK.KK..........',
  '...KK.KK.........KK.KK..........',
  '...KK.KK.........KK.KK..........',
  '...KK.KK.........KK.KK..........',
  '...KK.KKK........KK.KKK.........', // hoof line y23
];

// Jacket: same pixels in every frame. J = Ink, j = silks body (key Ash).
// Torso box x12-20, y2-8; Ink arm from the shoulder through x21 y6 to the hands at x23 y7
// on the crest; Ink leg from the seat to a bent knee (x18 y10) and the boot at x15-16, y11-12.
const JACKET = [
  '................................',
  '................................',
  '..............JJJJJJ............',
  '.............JjjjjjjJ...........',
  '............JjjjjjjjJ...........',
  '............JjjjjjjJJ...........', // shoulder
  '............JjjjjjJ..JJ.........', // arm x21-22
  '.............JjjjJ.....J........', // hands x23 y7
  '..............JJJ...............',
  '................JJ..............', // thigh
  '..................J.............', // knee
  '...............JJJ..............', // boot top
  '...............JJ...............', // boot
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

// Cap: same pixels in every frame. C = Ink, p = cap color (key Ash).
// Box x20-24, y0-3, 1 px Ink peak at x25 y3.
const CAP = [
  '.....................CCC........',
  '....................CpppC.......',
  '....................CpppC.......',
  '....................CCCCCC......',
  ...Array(20).fill('................................'),
];

function grid(rows, key) {
  if (rows.length !== H) throw new Error(`expected ${H} rows, got ${rows.length}`);
  rows.forEach((r, i) => {
    if (r.length !== W) throw new Error(`row ${i} is ${r.length} wide: ${r}`);
  });
  const c = new Canvas(W, H);
  c.draw(rows, key);
  return c;
}

// Saddlecloth (DESIGN.md, Stand-in race horse (P0)): a closed 7x9 Ink box at x8-14,
// y8-16 (y7-15 in gallop B), fill 5x7 at x9-13, y9-15 (y8-14 in B). `top` is the back
// line row: 9 in A and stand, 8 in B. The number (drawn by code) sits at x10-12, y10-14
// (y9-13 in B), so it has a fill row above and below and never touches the Ink outline.
// The bottom row lies on the belly line and closes the flank gap at x9-10 by itself.
function cloth(top) {
  const c = new Canvas(W, H);
  c.rect(8, top - 1, 7, 9, 'Ink');
  c.rect(9, top, 5, 7, 'Ash');
  return c;
}

export const frames = {
  body: { gallop: [grid(BODY_A, KEY), grid(BODY_B, KEY)], stand: [grid(BODY_STAND, KEY)] },
  tack: { gallop: [cloth(9), cloth(8)], stand: [cloth(9)] },
  jacket: {
    gallop: [grid(JACKET, { J: 'Ink', j: 'Ash' }), grid(JACKET, { J: 'Ink', j: 'Ash' })],
    stand: [grid(JACKET, { J: 'Ink', j: 'Ash' })],
  },
  cap: {
    gallop: [grid(CAP, { C: 'Ink', p: 'Ash' }), grid(CAP, { C: 'Ink', p: 'Ash' })],
    stand: [grid(CAP, { C: 'Ink', p: 'Ash' })],
  },
};

// Where code draws the saddlecloth number (top-left of the 3x5 digit), per frame.
export const NUMBER_AT = { gallop: [[10, 10], [10, 9]], stand: [[10, 10]] };
export const NOSE_X = 31;

const SLOTS = {
  body: 'art.race.horse.body',
  tack: 'art.race.horse.tack',
  jacket: 'art.race.jockey.jacket',
  cap: 'art.race.jockey.cap',
};

export function build() {
  const out = [];
  for (const [layer, base] of Object.entries(SLOTS)) {
    for (const anim of ['gallop', 'stand']) {
      out.push(writeSlot(`${base}.${anim}`, strip(frames[layer][anim])));
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const p of build()) console.log(p);
}
