// Paddock strip for the Orders screen (docs/specs/m1-race-day.md 4.2). Run: node scripts/art/paddock.mjs
//
//   art.paddock.trainer   16x24, 2 frames (32x24 strip), faces right toward the horse.
//                         Frame 1 cup held at the chest (shown 1.5 s), frame 2 cup lifted to
//                         the mouth with the eye shut (0.5 s). Rows 0-1 are empty, so the
//                         trainer stands 22 px tall. Draw at screen x24, y164: boots on y187.
//                         Colors, 3 opaque:
//                           Ink    outline, felt hat, eye, trousers and boots, cup lid
//                           Peach  face, hand, and the paper cup (light, so the cup reads on
//                                  the coat and on the grass)
//                           Maroon barn coat and hatband, the farm's barn-trim color
//                         Only the head box (HEAD) and the arm and cup box (ARM) may differ
//                         between frames; verify.mjs checks it.
//   art.paddock.ground    16x16 tile, no outline. Grass with a few Leaf and Turf tufts.
//                         Tiles horizontally and stacks vertically.
//   art.paddock.rail      16x16 tile, no outline. A Turf far band (rows 0-6), then the same
//                         lawn behind a two-plank paddock
//                         fence in Bone with Mist undersides, like the race rails. A half post
//                         on column 0: flip every other tile (flipX when floor(x / 16) is odd),
//                         exactly as the race rails, for a 2 px post every 32 px. Unflipped,
//                         it still reads as a fence with 1 px posts every 16 px.
//
// Stacking in the paddock strip (y144-191, three rows of 16 tiles across 256 px), per
// DESIGN.md, Charm, Orders:
//   y144-159  rail     (Turf far band y144-150, planks at y153-154 and y157-158, post tops
//                       y152, feet on y159)
//   y160-175  ground
//   y176-191  ground   (where the trainer and the horse stand, feet on y187)
// The fence ends above both figures (y164-187), so it never crosses a face or the horse's
// back line (DESIGN.md, Shapes and shading).
import { Canvas, strip, writeSlot } from './png.mjs';

const W = 16;
const H = 24;
const KEY = { K: 'Ink', s: 'Peach', c: 'Maroon' };

// The boxes allowed to change between the two frames, inclusive [x0, y0, x1, y1].
export const HEAD = [4, 2, 15, 10];
export const ARM = [9, 8, 15, 17];

const TRAINER_DOWN = [
  //0123456789012345
  '................', // 0
  '................', // 1
  '......KKKK......', // 2  felt hat crown
  '.....KKKKKK.....', // 3
  '.....KccccK.....', // 4  hatband in the coat color
  '..KKKKKKKKKKKKK.', // 5  brim to x14, shading the face
  '....KKsssssssK..', // 6  hair at the nape
  '....KKssssKsssK.', // 7  eye x10
  '....KsKssssssssK', // 8  ear x5, button nose x14
  '....KsssssssssK.', // 9  round cheek
  '.....KKssssssK..', // 10 jaw: the edge runs x13, x14, x15, x14, x13
  '....KccKssKcK...', // 11 collar
  '...KcccKKKccKKKK', // 12 shoulders, cup lid
  '...KcccccccKKssK', // 13 paper cup
  '...KcccccKcKKssK', // 14 arm seam x9
  '...KcccccKcKsKKK', // 15 hand on the cup
  '...KcccccKccKsK.', // 16 forearm
  '...KcccccKKKKK..', // 17 elbow
  '...KcccccccccK..', // 18
  '...KcccccccccK..', // 19 coat hem
  '....KKKKKKKKK...', // 20 trousers
  '....KKK..KKK....', // 21
  '....KKK..KKK....', // 22
  '...KKKK..KKKK...', // 23 boots
];

// The same cup, 4 rows higher, at the mouth. The hand is under it and the forearm rises
// from the same elbow. The eye closes: the one sip of the morning that matters.
const TRAINER_UP = [
  //0123456789012345
  '................', // 0
  '................', // 1
  '......KKKK......', // 2
  '.....KKKKKK.....', // 3
  '.....KccccK.....', // 4
  '..KKKKKKKKKKKKK.', // 5
  '....KKsssssssK..', // 6
  '....KKsssKKsssK.', // 7  eye shut
  '....KsKsssssKKKK', // 8  cup lid
  '....KssssssKKssK', // 9  cup at the mouth
  '.....KKssssKKssK', // 10 jaw behind the cup
  '....KccKssKKsKKK', // 11 hand on the cup
  '...KcccKKKccKsK.', // 12 wrist
  '...KcccccccKsK..', // 13
  '...KcccccKcKcK..', // 14 forearm up
  '...KcccccKccK...', // 15
  '...KcccccKcK....', // 16
  '...KcccccKKKKK..', // 17 elbow, closes the coat front as in frame 1
  '...KcccccccccK..', // 18
  '...KcccccccccK..', // 19
  '....KKKKKKKKK...', // 20
  '....KKK..KKK....', // 21
  '....KKK..KKK....', // 22
  '...KKKK..KKKK...', // 23
];

function grid(rows) {
  if (rows.length !== H) throw new Error(`expected ${H} rows, got ${rows.length}`);
  rows.forEach((r, i) => {
    if (r.length !== W) throw new Error(`row ${i} is ${r.length} wide: ${r}`);
  });
  const c = new Canvas(W, H);
  c.draw(rows, KEY);
  return c;
}

export const trainer = () => strip([grid(TRAINER_DOWN), grid(TRAINER_UP)]);

// Grass tufts, shared by both tiles so the rail row and the plain rows read as one lawn.
// L = Leaf (sunlit blade tips), T = Turf (the tuft's shaded base). Three small tufts of
// different shapes, none touching a tile edge, so the tiles join with no seam either way.
const TUFTS = [
  //0123456789012345
  '................', // 0
  '................', // 1
  '..L.L...........', // 2
  '...T............', // 3
  '................', // 4
  '................', // 5
  '................', // 6
  '...........L....', // 7
  '..........LT....', // 8
  '................', // 9
  '................', // 10
  '................', // 11
  '.....L.L.L......', // 12
  '......TTT.......', // 13
  '................', // 14
  '................', // 15
];

export function ground() {
  const c = new Canvas(16, 16);
  c.rect(0, 0, 16, 16, 'Grass');
  c.draw(TUFTS, { L: 'Leaf', T: 'Turf' });
  return c;
}

// Two-plank paddock fence in Bone, as the race rails are: plank tops Bone, undersides Mist
// (light from the upper left), a Bone half post on column 0 from row 8 to the ground row 15.
// Rows 0-6 are a Turf far band, the darker green beyond the paddock (like the infield hedge),
// so the fence has depth behind it. No Ink: it is background. Colors: Turf, Grass, Bone,
// Mist. The tufts keep their Turf bases here but lose their Leaf tips, to stay at 4 colors.
export function rail() {
  const c = new Canvas(16, 16);
  c.rect(0, 0, 16, 16, 'Grass');
  c.draw(TUFTS.map((r) => r.replace(/L/g, '.')), { T: 'Turf' });
  c.rect(0, 0, 16, 7, 'Turf');
  c.rect(0, 8, 1, 8, 'Bone');
  for (const y of [9, 13]) {
    c.rect(0, y, 16, 1, 'Bone');
    c.rect(0, y + 1, 16, 1, 'Mist');
  }
  return c;
}

export function build() {
  return [
    writeSlot('art.paddock.trainer', trainer()),
    writeSlot('art.paddock.ground', ground()),
    writeSlot('art.paddock.rail', rail()),
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const p of build()) console.log(p);
}
