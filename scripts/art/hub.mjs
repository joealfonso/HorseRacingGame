// The track (between races): every new part of the still picture, drawn as finals.
// Run: node scripts/art/hub.mjs   (writes each part to its slot path under public/assets/;
// also run by scripts/art/build.mjs). Approved by Joseph from the mock, 2026-11-14.
// scripts/art/hub_mock.mjs composes the mock from the same parts and also refreshes
// docs/mocks/track-hub/parts/<slot id>.png with buildMockParts().
//
// Rules: DESIGN.md "The track (between races)" (wins over the spec), docs/specs/track-hub.md
// section 4 and 10. All boxes below are at 1x, inclusive, in screen coordinates unless
// "local" is said.
//
//   art.hub.stand.upper   112x72 at x0, y24. Roof edge (Turf, Pine), Coal shade for the
//                         crowd strip (drawn on it by code, tile tops y32), front row seat
//                         backs in Ash with Slate dividers, the bench, the Bone balcony edge
//                         the Mist balcony front with bunting, and the Ash recess. Folds in the spec's 16x16 roof tile.
//   art.hub.stand.facade  112x80 at x0, y96. Maroon trim, Mist wall, three window openings
//                         (lamp-lit booths), two tote machines, the wood counter. Rows for
//                         y152-175 are transparent: the apron tile fills the floor.
//   art.hub.sign.plate    64x12 at x24, y100. Turf top row, Pine. No text, no border.
//   art.hub.tote.board    128x56 at x124, y32. Face, frame and legs. No text.
//   art.hub.paddock.gate  48x36 at x112, y140. Hedge, Bone gateway, the paddock through it.
//   art.hub.cart          32x24 at x184, y144. Still-picture art, so no outline.
//   art.hub.apron         16x16 tile from y122 (right half) and y152 (under the stand).
//   art.ui.focus.corner   8x8, 2 frames (top, bottom). Code flips for the right side.
//   People, 16x24, 2 frames unless said, Ink outline, up to 4 opaque colors:
//   art.hub.regular       x56, y48. Seated on the front bench. Idle: fans with her program.
//   art.hub.clerk         x16 / x52 / x88, y120. Art in rows 2-19, the counter cuts the
//                         waist. Authored in Peach, recolored per window (Peach, Cocoa, Tan).
//                         Idle: stamps a ticket.
//   art.hub.bettor.back   x40, y128, 1 frame. Waist (row 12) on the counter top y140.
//   art.hub.fan.back      A x124, B x140 (flipped), C x228, y108. Authored as fan A (Tan,
//                         Royal); recolor B Peach, Orange; C Cocoa, Emerald. Idle: page turn.
//   art.hub.bugler        x128, y146, 3 frames. 1 rest, 2 idle (polishes the horn with his
//                         sleeve), 3 horn raised for the race view's call to the post.
//   art.hub.vendor        x216, y144. Idle: stirs the lemonade.
import { join } from 'node:path';
import { Canvas, REPO, strip, writePng, writeSlot } from './png.mjs';

export const MOCK_PARTS = join(REPO, 'docs', 'mocks', 'track-hub', 'parts');

function grid(rows, key, w = 16, h = 24) {
  if (rows.length !== h) throw new Error(`expected ${h} rows, got ${rows.length}`);
  rows.forEach((r, i) => {
    if (r.length !== w) throw new Error(`row ${i} is ${r.length} wide: ${r}`);
  });
  const c = new Canvas(w, h);
  c.draw(rows, key);
  return c;
}

// ---------------------------------------------------------------- the stand, upper part
export function standUpper() {
  const c = new Canvas(112, 72); // local y = screen y - 24
  c.rect(0, 0, 112, 2, 'Turf'); // y24-25 lit top of the roof edge
  c.rect(0, 2, 112, 6, 'Pine'); // y26-31 roof edge
  c.rect(0, 8, 112, 16, 'Coal'); // y32-47 shade under the roof (crowd strip goes on it)
  c.rect(0, 24, 112, 14, 'Ash'); // y48-61 front row seat backs
  // Seat dividers, none behind the regular (x63), so she has two seats' room for the hat.
  // Each divider takes a 1 px Coal notch either side on the top row, so every seat back
  // has rounded shoulders and reads as a chair, not a wall.
  for (const x of [15, 31, 47, 79, 95]) {
    c.rect(x, 24, 1, 14, 'Slate');
    c.set(x - 1, 24, 'Coal');
    c.set(x, 24, 'Coal');
    c.set(x + 1, 24, 'Coal');
  }
  c.set(0, 24, 'Coal');
  c.set(111, 24, 'Coal');
  c.rect(0, 38, 112, 1, 'Dirt Shade'); // y62 bench top
  c.rect(0, 39, 112, 1, 'Mud'); // y63 bench edge
  c.rect(0, 40, 112, 8, 'Slate'); // y64-71 under the bench
  c.rect(0, 48, 112, 2, 'Bone'); // y72-73 balcony edge
  c.rect(0, 50, 112, 10, 'Mist'); // y74-83 balcony front
  c.rect(0, 60, 112, 12, 'Ash'); // y84-95 the recessed wall under the balcony, in shadow
  // Race-day bunting: a Slate cord on y74, a plain 5x5 pennant every 8 px from x4
  // (rows of 5, 3, 3, 1, 1 px, centered), Royal, Gold, Red in turn. No emblems.
  c.rect(0, 50, 112, 1, 'Slate');
  const colors = ['Royal', 'Gold', 'Red'];
  for (let i = 0, x = 4; x <= 100; i++, x += 8) {
    [[0, 5], [1, 3], [1, 3], [2, 1], [2, 1]].forEach(([dx, w], j) => c.rect(x + dx, 51 + j, w, 1, colors[i % 3]));
  }
  return c;
}

// ---------------------------------------------------------------- the stand, windows level
export const WINDOWS = [8, 44, 80]; // left column of each opening
export function standFacade() {
  const c = new Canvas(112, 80); // local y = screen y - 96
  c.rect(0, 0, 112, 4, 'Maroon'); // y96-99 trim band
  c.rect(0, 4, 112, 52, 'Mist'); // y100-151 painted wall
  for (const x of WINDOWS) {
    // Opening x..x+23, y116-139: 1 px Maroon frame on the top and sides.
    c.rect(x, 20, 24, 1, 'Maroon');
    c.rect(x, 20, 1, 24, 'Maroon');
    c.rect(x + 23, 20, 1, 24, 'Maroon');
    c.rect(x + 1, 21, 22, 2, 'Dirt'); // y117-118 the lintel's shadow
    c.rect(x + 1, 23, 22, 21, 'Hay'); // y119-139 lamp-lit booth
  }
  // Tote machines in windows 1 and 3 (none at window 2, where the bettor stands):
  // a 6x6 Slate box with an Ash top row and a 2x2 Bone ticket tongue at its top center.
  for (const x of [10, 82]) {
    c.rect(x, 38, 6, 6, 'Slate'); // y134-139
    c.rect(x, 38, 6, 1, 'Ash');
    c.rect(x + 2, 36, 2, 2, 'Bone'); // y132-133
  }
  c.rect(4, 44, 104, 1, 'Dirt Shade'); // y140 counter top
  c.rect(4, 45, 104, 3, 'Mud'); // y141-143 counter front
  c.rect(0, 48, 112, 1, 'Ash'); // y144 shadow under the counter lip
  return c;
}

export function signPlate() {
  const c = new Canvas(64, 12);
  c.rect(0, 0, 64, 12, 'Pine');
  c.rect(0, 0, 64, 1, 'Turf');
  return c;
}

// ---------------------------------------------------------------- the tote board
export function toteBoard() {
  const c = new Canvas(128, 56); // local = screen - (124, 32)
  c.rect(0, 0, 128, 40, 'Slate'); // frame, y32-71
  c.rect(0, 0, 128, 1, 'Ash'); // y32 lit top edge
  c.rect(2, 2, 124, 36, 'Ink'); // face x126-249, y34-69
  for (const x of [16, 104]) { // legs x140-147 and x228-235, y72-87
    c.rect(x, 40, 8, 16, 'Slate');
    c.rect(x + 6, 40, 2, 16, 'Coal');
  }
  return c;
}

// ---------------------------------------------------------------- apron
// Ash concrete with a fixed, sparse Slate fleck. No slab lines (they would cross faces).
export function apron() {
  const c = new Canvas(16, 16);
  c.rect(0, 0, 16, 16, 'Ash');
  c.draw([
    '................',
    '..........#.....',
    '................',
    '...#............',
    '................',
    '.............#..',
    '................',
    '.......##.......',
    '................',
    '#...............',
    '...........#....',
    '................',
    '....#...........',
    '................',
    '.........#....#.',
    '................',
  ], { '#': 'Slate' });
  return c;
}

// ---------------------------------------------------------------- paddock gate
export function paddockGate() {
  const c = new Canvas(48, 36); // local = screen - (112, 140)
  // The paddock through the gateway, x126-145: Turf far band y146-159, Grass y160-169.
  c.rect(14, 6, 20, 14, 'Turf');
  c.rect(14, 20, 20, 10, 'Grass');
  // Head-high hedge, x112-123 and x148-159, y148-169: Turf, Pine on the lower and right
  // sides. A clipped top with a soft bump every 6 px so it reads as hedge, not a wall.
  const hedge = (x0, w) => {
    for (let x = x0; x < x0 + w; x++) {
      const top = 8 + [1, 0, 0, 0, 0, 1][(x - x0) % 6];
      c.rect(x, top, 1, 30 - top, 'Turf');
    }
    c.rect(x0, 26, w, 4, 'Pine'); // lower side
    for (let y = 9; y < 30; y++) c.set(x0 + w - 1, y, 'Pine'); // right side
    c.set(x0 + w - 2, 9, 'Pine');
    // A few Pine leaf shadows inside, fixed.
    for (const [dx, dy] of [[2, 13], [7, 16], [4, 20], [9, 22], [1, 24]]) {
      if (dx < w - 2) c.set(x0 + dx, dy, 'Pine');
    }
  };
  hedge(0, 12);
  hedge(36, 12);
  // Bone gateway: posts x124-125 and x146-147, y144-169, Mist on each post's right column;
  // crossbar x124-147, y144-145, Mist on y145.
  for (const x of [12, 34]) {
    c.rect(x, 4, 1, 26, 'Bone');
    c.rect(x + 1, 4, 1, 26, 'Mist');
  }
  c.rect(12, 4, 24, 1, 'Bone');
  c.rect(14, 5, 20, 1, 'Mist');
  c.set(12, 5, 'Bone');
  c.set(34, 5, 'Bone');
  return c;
}

// ---------------------------------------------------------------- snack cart
// Still-picture art: no outline. Bone cart, Mist on the shaded right side and underside;
// a Red and Bone awning in 4 px stripes with a Maroon underside row on one Slate center
// pole; a Sky Pale glass jar of Hay lemonade flush with the right end, where the vendor
// stands, with his ladle's Slate bowl in it, hooked over the rim; a Dirt Shade basket of
// peanuts (Hay shells); two Ink spoked wheels with Slate hubs on the ground line (local
// row 23 = y167). No sign, no price, no register, no bell, no coins.
export function cart() {
  const c = new Canvas(32, 24);
  // Awning rows 0-5: ridge, stripes, scalloped edge on row 4, Maroon underside row 5.
  for (let x = 0; x < 32; x++) {
    const col = Math.floor(x / 4) % 2 === 0 ? 'Red' : 'Bone';
    c.rect(x, 1, 1, 3, col);
    c.set(x, 4, x % 4 === 1 || x % 4 === 2 ? col : 'Maroon');
  }
  c.rect(1, 0, 30, 1, 'Red');
  c.rect(0, 5, 32, 1, 'Maroon');
  c.rect(16, 6, 1, 7, 'Slate'); // center pole, rows 6-12
  // Basket of peanuts, x4-11, rows 8-12.
  c.draw([
    '..HH.H..',
    '.HHHHHH.',
    'DDDDDDDD',
    'DHDDDHDD',
    '.DDDDDD.',
  ], { H: 'Hay', D: 'Dirt Shade' }, 4, 8);
  // Jar x26-31, rows 7-12: rim row 7, air row 8, lemonade rows 9-11, base row 12.
  c.draw([
    'PPPPPP',
    'P....P',
    'PHHHHP',
    'PHHHHP',
    'PHHHHP',
    'PPPPPP',
  ], { P: 'Sky Pale', H: 'Hay' }, 26, 7);
  // The ladle: over the rim at the right, down into the lemonade, bowl at x28-29.
  for (const [x, y] of [[31, 7], [30, 8], [29, 9], [28, 10], [29, 10]]) c.set(x, y, 'Slate');
  // Body rows 13-19: counter top Bone, a Mist lip, Mist on the right side and underside.
  c.rect(0, 13, 32, 7, 'Bone');
  c.rect(0, 14, 32, 1, 'Mist');
  c.rect(27, 13, 5, 7, 'Mist');
  c.rect(0, 19, 32, 1, 'Mist');
  const wheel = [
    '..KKK..',
    '.K.K.K.',
    'K..K..K',
    'KKKSKKK',
    'K..K..K',
    '.K.K.K.',
    '..KKK..',
  ];
  c.draw(wheel, { K: 'Ink', S: 'Slate' }, 4, 17);
  c.draw(wheel, { K: 'Ink', S: 'Slate' }, 20, 17);
  return c;
}

// ---------------------------------------------------------------- focus corner
const CORNER = [
  'KKKKKKKK',
  'KYYYYYYK',
  'KYYYYYYK',
  'KYYKKKKK',
  'KYYK....',
  'KYYK....',
  'KYYK....',
  'KKKK....',
];
export function focusCorner() {
  const key = { K: 'Ink', Y: 'Yellow' };
  const top = new Canvas(8, 8);
  top.draw(CORNER, key);
  const bottom = new Canvas(8, 8);
  bottom.draw([...CORNER].reverse(), key);
  return strip([top, bottom]);
}

// ---------------------------------------------------------------- people
// The regular. Ink, Umber, Purple, Bone. Seated in profile, facing the track: hips on the
// Bone cushion on the bench (rows 14-15 = y62-63), the lap a 9 px Purple run forward,
// shins straight down in front of the bench (rows 15-22), shoes on row 23. The hat is the
// widest thing on her: brim 14 px Purple (columns 1-14, rows 4-5, outline rows 3 and 6),
// crown columns 4-11 (Ink top row 1, Purple row 2), a 2x2 Bone flower at x10-11, rows 2-3.
// Face rows 7-9, torso rows 10-13, lap row 14. Shoulders x5-10, so the brim is 4 px wider
// on each side.
const REG_KEY = { K: 'Ink', U: 'Umber', P: 'Purple', B: 'Bone' };
const REG_HEAD = [
  //0123456789012345
  '................', // 0
  '...KKKKKKKKKK...', // 1  crown top
  '...KPPPPPPBBK...', // 2  crown x4-11, Bone flower on the front (rows 2-3)
  'KKKKPPPPPPBBKKKK', // 3  brim top outline
  'KPPPPPPPPPPPPPPK', // 4  brim x1-14
  'KPPPPPPPPPPPPPPK', // 5
  '.KKKKKKKKKKKKKK.', // 6  brim underside
];
const REG_LEGS = [
  '....KPPPPPPPPPK.', // 14 lap, x5-13
  '...KBBBBBKKKPPK.', // 15 cushion under her; skirt over the knee
  '...KKKKKKK.KUUK.', // 16 shins
  '...........KUUK.', // 17
  '...........KUUK.', // 18
  '...........KUUK.', // 19
  '...........KUUK.', // 20
  '...........KUUK.', // 21
  '...........KUUK.', // 22
  '..........KKKKKK', // 23 shoes
];
const REG_A = [...REG_HEAD,
  '....KBBUUUUUK...', // 7  Bone curls at the back
  '....KBUUUUKUUK..', // 8  eye, nose bump x12
  '.....KBUUUUKK...', // 9  round chin
  '.....KPPPPK.....', // 10 shoulders x6-9
  '....KPPPPPK.....', // 11
  '....KPPKPPKK....', // 12 arm
  '....KPPKUBBBKK..', // 13 hand on the program in her lap
  ...REG_LEGS];
// Fanning: the program comes up beside her chin.
const REG_B = [...REG_HEAD,
  '....KBBUUUUUKKKK', // 7  program top
  '....KBUUUUKUUKBK', // 8
  '.....KBUUUUKKBBK', // 9
  '.....KPPPPKUBBBK', // 10 hand
  '....KPPPPKKKKKK.', // 11
  '....KPPKPPPK....', // 12 sleeve up
  '....KPPKPPPKKK..', // 13
  ...REG_LEGS];
export const regular = () => strip([grid(REG_A, REG_KEY), grid(REG_B, REG_KEY)]);

// Clerks. Ink, skin (authored Peach), Turf, Bone. Three-quarter view facing left, toward
// the bettor. Art in rows 2-19; the counter covers rows 20-23. A Turf track jacket with a
// Bone collar, Ink hair, a Bone ticket in hand. No vest, no tie, no eyeshade.
const CLERK_KEY = { K: 'Ink', s: 'Peach', T: 'Turf', B: 'Bone' };
const CLERK_A = [
  //0123456789012345
  '................', // 0
  '................', // 1
  '......KKKKK.....', // 2  hair
  '.....KKKKKKK....', // 3
  '....KKKKKKKKK...', // 4
  '....KssKKKKKK...', // 5  fringe swept back
  '...KsssssKKKK...', // 6  forehead
  '...KsKssssKsKK..', // 7  eye x5, ear x11
  '..Ksssssssssk...', // 8  nose bump x2
  '...Ksssssssk....', // 9
  '....KKsssssK....', // 10 round jaw
  '....KBBBBBBK....', // 11 Bone collar
  '...KTTBBBBTTK...', // 12
  '..KTTTKBBKTTTK..', // 13
  '.KBBKTTTTTTTTK..', // 14 ticket held out
  'KBBBsKTTTTTTTK..', // 15 hand
  '.KKKsKTTTTTTTK..', // 16
  '...KTKTTTTTTTK..', // 17 sleeve
  '...KTTKTTTTTTK..', // 18
  '...KTTTTTTTTTK..', // 19 waist at the counter
  '................', // 20
  '................', // 21
  '................', // 22
  '................', // 23
];
// Stamp: the hand comes down on the counter, ticket under it.
const CLERK_B = [
  //0123456789012345
  '................', // 0
  '................', // 1
  '......KKKKK.....', // 2
  '.....KKKKKKK....', // 3
  '....KKKKKKKKK...', // 4
  '....KssKKKKKK...', // 5
  '...KsssssKKKK...', // 6
  '...KsKssssKsKK..', // 7
  '..Ksssssssssk...', // 8
  '...Ksssssssk....', // 9
  '....KKsssssK....', // 10
  '....KBBBBBBK....', // 11
  '...KTTBBBBTTK...', // 12
  '..KTTTKBBKTTTK..', // 13
  '..KTTKTTTTTTTK..', // 14
  '..KTKTTTTTTTTK..', // 15
  '..KTKTTTTTTTTK..', // 16 sleeve down
  '.KsKTTTTTTTTTK..', // 17
  'KssKTTTTTTTTTK..', // 18 hand flat on the ticket
  'BBBBKTTTTTTTTK..', // 19 ticket on the counter
  '................', // 20
  '................', // 21
  '................', // 22
  '................', // 23
];
export const clerk = () => strip([grid(CLERK_A.map((r) => r.replace(/k/g, 'K')), CLERK_KEY),
  grid(CLERK_B.map((r) => r.replace(/k/g, 'K')), CLERK_KEY)]);

// The bettor, back to us, at window 2. Ink, Tan, Auburn, Bone. Ink flat cap, Auburn
// jacket, Ink trousers, a rolled Bone program in his back pocket, his left elbow on the
// counter (row 12 = y140). Rows 2-23, feet on y151. The rows below are drawn left-handed
// and mirrored in code, so his right elbow lands on the counter at columns 12-15 (x48-51)
// and clerk 2's hands, from x52, stay in view.
const BETTOR = [
  //0123456789012345
  '................', // 0
  '................', // 1
  '......KKKKK.....', // 2  flat cap
  '.....KKKKKKK....', // 3
  '....KKKKKKKKKK..', // 4  the cap's peak juts out on his right
  '....KtKKKKKKtK..', // 5  ears
  '.....KtttttKK...', // 6  nape
  '......KtttK.....', // 7  neck
  '....KKAAAAAKK...', // 8  collar
  '...KAAAAAAAAAK..', // 9  shoulders
  '..KAKAAAAAAAAK..', // 10 left arm bends out
  '.KAAKAAAAAABBK..', // 11 elbow; rolled program up from the back pocket
  '.KKKKAAAAAABBK..', // 12 elbow on the counter top (y140), the waist
  '....KKKKKKKBBK..', // 13 jacket hem
  '....KKKKKKKKKK..', // 14 trousers
  '....KKKK.KKKK...', // 15
  '....KKKK.KKKK...', // 16
  '....KKK...KKK...', // 17
  '....KKK...KKK...', // 18
  '....KKK...KKK...', // 19
  '....KKK...KKK...', // 20
  '....KKK...KKK...', // 21
  '....KKK...KKK...', // 22
  '...KKKK...KKKK..', // 23 shoes
];
export const bettor = () => grid(BETTOR.map((r) => '.' + [...r].reverse().join('').slice(0, 15)), { K: 'Ink', t: 'Tan', A: 'Auburn', B: 'Bone' });

// Fans at the rail, backs to us. Ink, skin (Tan), jacket (Royal), Bone. A program held up
// beside the head. The near rail (y118-121) crosses at rows 10-13, the shoulders.
const FAN_KEY = { K: 'Ink', s: 'Tan', J: 'Royal', B: 'Bone' };
const FAN_A = [
  //0123456789012345
  '................', // 0
  '................', // 1
  '.....KKKKK......', // 2  hair
  '....KKKKKKK.....', // 3
  '...KKKKKKKKK.KKK', // 4  program top
  '...KKKKKKKKKKBBK', // 5
  '...KsKKKKKKsKBBK', // 6  ears
  '....KKKKKKKKKBBK', // 7
  '.....KsssssKKBBK', // 8  nape
  '......KsssK.KsK.', // 9  hand
  '....KKJJJJJKKJK.', // 10 shoulders, arm up
  '...KJJJJJJJJKJK.', // 11
  '...KJJJJJJJJJK..', // 12
  '...KJKJJJJJJJK..', // 13
  '...KJKJJJJJJJK..', // 14
  '...KsKJJJJJJJK..', // 15 hand at his side
  '...KKKJJJJJJJK..', // 16
  '....KKKKKKKKK...', // 17 trousers
  '....KKKK.KKKK...', // 18
  '....KKKK.KKKK...', // 19
  '....KKK...KKK...', // 20
  '....KKK...KKK...', // 21
  '....KKK...KKK...', // 22
  '...KKKK...KKKK..', // 23
];
// Page turn: the program opens wide, a page in the air.
const FAN_B = [
  //0123456789012345
  '................', // 0
  '................', // 1
  '.....KKKKK...KK.', // 2
  '....KKKKKKK.KBBK', // 3  page lifting
  '...KKKKKKKKKKBK.', // 4
  '...KKKKKKKKKKBBK', // 5
  '...KsKKKKKKsKBBK', // 6
  '....KKKKKKKKKBBK', // 7
  '.....KsssssKKBBK', // 8
  '......KsssK.KsK.', // 9
  '....KKJJJJJKKJK.', // 10
  '...KJJJJJJJJKJK.', // 11
  '...KJJJJJJJJJK..', // 12
  '...KJKJJJJJJJK..', // 13
  '...KJKJJJJJJJK..', // 14
  '...KsKJJJJJJJK..', // 15
  '...KKKJJJJJJJK..', // 16
  '....KKKKKKKKK...', // 17
  '....KKKK.KKKK...', // 18
  '....KKKK.KKKK...', // 19
  '....KKK...KKK...', // 20
  '....KKK...KKK...', // 21
  '....KKK...KKK...', // 22
  '...KKKK...KKKK..', // 23
];
export const fan = () => strip([grid(FAN_A, FAN_KEY), grid(FAN_B, FAN_KEY)]);
export const FAN_RECOLORS = {
  A: { Tan: 'Tan', Royal: 'Royal' },
  B: { Tan: 'Peach', Royal: 'Orange' },
  C: { Tan: 'Cocoa', Royal: 'Emerald' },
};

// The bugler, facing us. Ink, Peach, Red, Gold. Ink cap with a peak, scarlet coat with two
// Gold buttons, Ink trousers and boots, a long straight Gold horn held upright at his side.
const BUG_KEY = { K: 'Ink', s: 'Peach', R: 'Red', G: 'Gold' };
const BUG_A = [
  //0123456789012345
  '................', // 0
  '................', // 1
  '.....KKKKKK.....', // 2  cap
  '....KKKKKKKK....', // 3
  '....KKKKKKKK....', // 4
  '...KKKKKKKKKK...', // 5  peak
  '....KssssssK....', // 6
  '....KsKssKsK....', // 7  eyes
  '....KssssssK....', // 8
  '.....KssssK.....', // 9  round chin
  '....KKKKKKKK.KK.', // 10 collar; horn mouthpiece
  '...KRRRKKRRRKGK.', // 11
  '...KRRRGRRRRKGK.', // 12 button
  '...KRKRRRRKRKGK.', // 13 arms parted from the coat
  '...KRKRGRRKRKGK.', // 14 button
  '...KRKRRRRKsKGK.', // 15 hand on the horn
  '...KsKRRRRKKKGK.', // 16
  '...KKKRRRRRKKGK.', // 17 coat hem
  '....KKKKKKKKKGK.', // 18
  '....KKKK.KKKKGK.', // 19
  '....KKK..KKKGGGK', // 20 the horn's bell
  '....KKK..KKKGGGK', // 21
  '....KKK..KKKKKK.', // 22
  '...KKKK..KKKK...', // 23 boots
];
// Polishing: his left sleeve crosses to rub the horn.
const BUG_B = [
  //0123456789012345
  '................', // 0
  '................', // 1
  '.....KKKKKK.....', // 2
  '....KKKKKKKK....', // 3
  '....KKKKKKKK....', // 4
  '...KKKKKKKKKK...', // 5
  '....KssssssK....', // 6
  '....KsKssKsK....', // 7
  '....KssssssK....', // 8
  '.....KssssK.....', // 9
  '....KKKKKKKK.KK.', // 10
  '...KRRRKKRRRKGK.', // 11
  '...KRRRGRRRRKGK.', // 12
  '...KRKRRRRRRKGK.', // 13
  '...KRRKKKKKKKGK.', // 14 sleeve across the coat
  '...KKRRRRRRRRRK.', // 15 rubbing the horn
  '....KKKKKKKKKKK.', // 16
  '...KKKRRRRRKKGK.', // 17
  '....KKKKKKKKKGK.', // 18
  '....KKKK.KKKKGK.', // 19
  '....KKK..KKKGGGK', // 20
  '....KKK..KKKGGGK', // 21
  '....KKK..KKKKKK.', // 22
  '...KKKK..KKKK...', // 23
];
// Call to the post (frame 3, for the race view): the horn raised to his lips, level, the
// bell out to his left (our right). Same cap, face, coat, buttons, legs.
const BUG_C = [
  //0123456789012345
  '................', // 0
  '................', // 1
  '.....KKKKKK.....', // 2
  '....KKKKKKKK....', // 3
  '....KKKKKKKK....', // 4
  '...KKKKKKKKKK...', // 5
  '....KssssssK....', // 6
  '....KsKssKsK.KK.', // 7  bell top
  '....KssssssKKGGK', // 8
  '.....KssssKGGGGK', // 9  horn at his lips
  '....KKKKKKKssKGK', // 10 hand under the horn
  '...KRRRKKRRKRKKK', // 11 sleeve up
  '...KRRRGRRRKRK..', // 12 button
  '...KRKRRRRRKRK..', // 13 elbow
  '...KRKRGRRRKK...', // 14 button
  '...KRKRRRRRRK...', // 15
  '...KsKRRRRRRK...', // 16 other hand at his side
  '...KKKRRRRRKK...', // 17 coat hem
  '....KKKKKKKKK...', // 18
  '....KKKK.KKKK...', // 19
  '....KKK..KKK....', // 20
  '....KKK..KKK....', // 21
  '....KKK..KKK....', // 22
  '...KKKK..KKKK...', // 23
];
export const bugler = () => strip([grid(BUG_A, BUG_KEY), grid(BUG_B, BUG_KEY), grid(BUG_C, BUG_KEY)]);

// The vendor, facing left toward the cart. Ink, Umber, Sky, Bone. A tall Bone paper hat,
// a Bone apron over a Sky shirt, an Ink ladle reaching left into the jar.
const VEN_KEY = { K: 'Ink', U: 'Umber', S: 'Sky', B: 'Bone' };
const VEN_A = [
  //0123456789012345
  '.......KKKKK....', // 0  tall paper hat
  '......KBBBBBK...', // 1
  '......KBBBBBK...', // 2
  '......KBBBBBK...', // 3
  '.....KBBBBBBBK..', // 4
  '.....KKKKKKKKK..', // 5  band
  '.....KUUUKKKKK..', // 6  hair at the back
  '....KUKUUUUKUK..', // 7  eye, ear
  '...KUUUUUUUUUK..', // 8  nose bump
  'K.K.KUUUUUUUK...', // 9  ladle handle over the jar rim
  '.KUK.KKUUUUK....', // 10 hand on the handle
  '..KSKKSSSSSK....', // 11 sleeve
  '..KSSSSSSSSSK...', // 12
  '...KKSBBBBBSK...', // 13 apron
  '....KSBBBBBSK...', // 14
  '....KSBBBBBSK...', // 15
  '....KKBBBBBKK...', // 16
  '.....KBBBBBK....', // 17
  '.....KBBBBBK....', // 18
  '.....KKKKKKK....', // 19 trousers
  '.....KKK.KKK....', // 20
  '.....KKK.KKK....', // 21
  '.....KKK.KKK....', // 22
  '....KKKK.KKKK...', // 23
];
// Stirring: the hand drops a pixel and swings the handle round.
const VEN_B = [
  //0123456789012345
  '.......KKKKK....', // 0
  '......KBBBBBK...', // 1
  '......KBBBBBK...', // 2
  '......KBBBBBK...', // 3
  '.....KBBBBBBBK..', // 4
  '.....KKKKKKKKK..', // 5
  '.....KUUUKKKKK..', // 6
  '....KUKUUUUKUK..', // 7
  '...KUUUUUUUUUK..', // 8
  '....KUUUUUUUK...', // 9
  'KKKK.KKUUUUK....', // 10 handle
  '..KUKKSSSSSK....', // 11 hand
  '..KSSSSSSSSSK...', // 12
  '...KKSBBBBBSK...', // 13
  '....KSBBBBBSK...', // 14
  '....KSBBBBBSK...', // 15
  '....KKBBBBBKK...', // 16
  '.....KBBBBBK....', // 17
  '.....KBBBBBK....', // 18
  '.....KKKKKKK....', // 19
  '.....KKK.KKK....', // 20
  '.....KKK.KKK....', // 21
  '.....KKK.KKK....', // 22
  '....KKKK.KKKK...', // 23
];
export const vendor = () => strip([grid(VEN_A, VEN_KEY), grid(VEN_B, VEN_KEY)]);

// ---------------------------------------------------------------- program on the rail
// 8x7 sprite at x192-199, y115-121: a program draped over the near rail's bar, saving
// your spot. Ink outline, Parchment pages, a 1 px Ash fold line down the middle column.
export function railProgram() {
  return grid([
    'KKKKKKKK',
    'KEEEAEEK',
    'KEEEAEEK',
    'KEEEAEEK',
    'KEEEAEEK',
    'KEEEAEEK',
    'KKKKKKKK',
  ], { K: 'Ink', E: 'Parchment', A: 'Ash' }, 8, 7);
}

// ---------------------------------------------------------------- all parts
export const PARTS = {
  'art.hub.stand.upper': standUpper,
  'art.hub.stand.facade': standFacade,
  'art.hub.sign.plate': signPlate,
  'art.hub.tote.board': toteBoard,
  'art.hub.paddock.gate': paddockGate,
  'art.hub.cart': cart,
  'art.hub.apron': apron,
  'art.ui.focus.corner': focusCorner,
  'art.hub.rail.program': railProgram,
  'art.hub.regular': regular,
  'art.hub.clerk': clerk,
  'art.hub.bettor.back': bettor,
  'art.hub.fan.back': fan,
  'art.hub.bugler': bugler,
  'art.hub.vendor': vendor,
};

// People slots: checked as people (Ink outline, at most 4 opaque colors).
export const PEOPLE = ['art.hub.regular', 'art.hub.clerk', 'art.hub.bettor.back', 'art.hub.fan.back',
  'art.hub.bugler', 'art.hub.vendor'];

export function build() {
  return Object.entries(PARTS).map(([slot, fn]) => writeSlot(slot, fn()));
}

export function buildMockParts(outDir = MOCK_PARTS) {
  return Object.entries(PARTS).map(([slot, fn]) => {
    const path = join(outDir, `${slot}.png`);
    writePng(path, fn());
    return path;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const p of build()) console.log(p);
}
