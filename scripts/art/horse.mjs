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

// ---- Walk (step 2): four-beat, legs under the body, no reach. Barrel y9-16 in both
// frames, like gallop A and stand, so the rider and the saddlecloth do not move. The
// head is carried at about withers height and nods: nose (31,8) in walk 1, (31,9) in walk 2.
function setRow(rows, y, x0, x1, ch) {
  const r = [...rows[y]];
  for (let x = x0; x <= x1; x++) r[x] = ch;
  rows[y] = r.join('');
}
function walkBody(frame) {
  const rows = BODY_A.slice(0, 16).map((r) => r);
  // Tail hangs from the croup, as on the stand frame.
  for (let y = 10; y <= 15; y++) rows[y] = BODY_STAND[y].slice(0, 3) + rows[y].slice(3);
  // Head carried at about withers height and nodding 1 px: nose (31,8) in walk 1,
  // (31,9) in walk 2. Rows 5-11, columns 22-31; the rest is gallop A's barrel.
  const head = frame === 0
    ? [
      [5, '......K...'],
      [6, '....KKK...'],
      [7, '..KKaaaKK.'],
      [8, 'KKaaaaKaaK'],
      [9, 'aaaaaKKKK.'],
      [10, 'aaaaK.....'],
      [11, 'aaaK......'],
    ]
    : [
      [5, '..........'],
      [6, '.....K....'],
      [7, '..KKKKK...'],
      [8, 'KKaaaaaKK.'],
      [9, 'aaaaaaKaaK'],
      [10, 'aaaaaKKKK.'],
      [11, 'aaaKK.....'],
    ];
  for (const [y, cols] of head) rows[y] = rows[y].slice(0, 22) + cols;
  // A slimmer neck than the gallop: the underside runs x24 y12, x23 y13 into the chest.
  rows[12] = rows[12].slice(0, 24) + 'K.......';
  rows[13] = rows[13].slice(0, 23) + 'K........';
  rows.push('....KKKKK..KKKKKKKKKKKK.........'); // belly y16, as on the stand frame
  for (let y = 17; y < 24; y++) rows.push('................................');
  // Legs, 2 px, all Ink: [row, x0] per leg, left to right.
  const legs = frame === 0
    ? [
      // near hind back and planted, hock back
      [[17, 6], [18, 5], [19, 4], [20, 4], [21, 4], [22, 3], [23, 3, 5]],
      // far hind forward under the belly
      [[17, 7], [18, 7], [19, 7], [20, 8], [21, 8], [22, 9], [23, 9, 11]],
      // far fore lifted, knee forward, cannon folded back
      [[17, 18], [18, 19], [19, 19], [20, 18], [21, 17]],
      // near fore planted just ahead of vertical
      [[17, 21], [18, 21], [19, 21], [20, 22], [21, 22], [22, 22], [23, 22, 24]],
    ]
    : [
      // far hind back and planted
      [[17, 4], [18, 3], [19, 3], [20, 3], [21, 2], [22, 2], [23, 2, 4]],
      // near hind forward under the belly, hock back
      [[17, 6], [18, 6], [19, 5], [20, 6], [21, 7], [22, 8], [23, 8, 10]],
      // far fore planted
      [[17, 17], [18, 17], [19, 17], [20, 17], [21, 17], [22, 17], [23, 17, 19]],
      // near fore lifted, knee forward, cannon folded back
      [[17, 21], [18, 22], [19, 22], [20, 21], [21, 20]],
    ];
  for (const leg of legs) for (const [y, x, x1] of leg) setRow(rows, y, x, x1 ?? x + 1, 'K');
  return rows;
}

// Walk rider: sits up at the walk, same pixels in both frames. Cap x15-19, y1-4, peak x20 y4;
// torso x13-19, y5-8; Ink arm to the hands on the crest at x22 y7; leg as at the gallop.
const JACKET_WALK = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '..............JjjjjJ............',
  '.............JjjjjjJJ...........',
  '.............JjjjjJ..JJ.........',
  '..............JJJJ..............',
  '................JJ..............',
  '..................J.............',
  '...............JJJ..............',
  '...............JJ...............',
  ...Array(11).fill('................................'),
];
const CAP_WALK = [
  '................................',
  '................CCC.............',
  '...............CpppC............',
  '...............CpppC............',
  '...............CCCCCC...........',
  ...Array(19).fill('................................'),
];

// Winner: standing in the irons on the walk, one fist up. Same pixels in both frames.
// Cap x15-19, y0-3 (1 px higher than the walk cap, no peak: the head is up). Upright torso
// x14-19, y4-7, its top closed by the cap's brim; legs straighter down to the boot.
// Raised arm: a 3 px sleeve in the silks color (x21-23, y2-4) rising from the shoulder,
// with a 3x2 Ink fist at x21-23, y0-1. x20 stays clear at y0-2, so there is daylight
// between arm and cap. A sleeve, not an Ink stroke, so it can never read as a crop.
const JACKET_WINNER = [
  '.....................JJJ........', // 3x2 Ink fist
  '.....................JJJ........',
  '.....................JjJ........', // sleeve in the silks color
  '....................JJjJ........',
  '..............JjjjjjjjJ.........', // shoulder runs into the sleeve
  '..............JjjjjJJJJJ........', // armpit line
  '..............JjjjjJ............',
  '...............JjjJ.............',
  '...............JJJJ.............', // hips, standing
  '................JJ..............',
  '.................JJ.............', // knee
  '................JJ..............',
  '...............JJJ..............', // boot
  ...Array(11).fill('................................'),
];
const CAP_WINNER = [
  '................CCC.............',
  '...............CpppC............',
  '...............CpppC............',
  '...............CCCCC............',
  ...Array(20).fill('................................'),
];

export const frames = {
  body: {
    gallop: [grid(BODY_A, KEY), grid(BODY_B, KEY)],
    stand: [grid(BODY_STAND, KEY)],
    walk: [grid(walkBody(0), KEY), grid(walkBody(1), KEY)],
  },
  tack: { gallop: [cloth(9), cloth(8)], stand: [cloth(9)], walk: [cloth(9), cloth(9)] },
  jacket: {
    gallop: [grid(JACKET, { J: 'Ink', j: 'Ash' }), grid(JACKET, { J: 'Ink', j: 'Ash' })],
    stand: [grid(JACKET, { J: 'Ink', j: 'Ash' })],
    walk: [grid(JACKET_WALK, { J: 'Ink', j: 'Ash' }), grid(JACKET_WALK, { J: 'Ink', j: 'Ash' })],
    winner: [grid(JACKET_WINNER, { J: 'Ink', j: 'Ash' }), grid(JACKET_WINNER, { J: 'Ink', j: 'Ash' })],
  },
  cap: {
    gallop: [grid(CAP, { C: 'Ink', p: 'Ash' }), grid(CAP, { C: 'Ink', p: 'Ash' })],
    stand: [grid(CAP, { C: 'Ink', p: 'Ash' })],
    walk: [grid(CAP_WALK, { C: 'Ink', p: 'Ash' }), grid(CAP_WALK, { C: 'Ink', p: 'Ash' })],
    winner: [grid(CAP_WINNER, { C: 'Ink', p: 'Ash' }), grid(CAP_WINNER, { C: 'Ink', p: 'Ash' })],
  },
};

// Where code draws the saddlecloth number (top-left of the 3x5 digit), per frame.
export const NUMBER_AT = { gallop: [[10, 10], [10, 9]], stand: [[10, 10]], walk: [[10, 10], [10, 10]] };
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
    for (const anim of Object.keys(frames[layer])) {
      out.push(writeSlot(`${base}.${anim}`, strip(frames[layer][anim])));
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const p of build()) console.log(p);
}
