// Track, rails, poles, gate and race backgrounds. Run: node scripts/art/track.mjs
//
// Background tiles have no Ink outline (DESIGN.md, Shapes and shading). Sprites that
// stand in the scene (poles) do. All placements below are in race-view screen rows from
// docs/specs/m1-race-day.md 4.3.
//
//   art.track.dirt.fast        16x16, Dirt with a fixed Dirt Shade grain, tiles both ways.
//   art.race.rail.far          16x8. Bar on rows 0-1, a half post on column 0, Grass behind
//                              the posts on rows 4-7 (rows 2-3 stay transparent).
//   art.race.rail.near         16x8. Bar on rows 0-2, a half post on column 0, Grass behind
//                              the posts on rows 3-7. Opaque, so it also draws the verge.
//                              Tiling: place a tile every 16 px of world, flipping every
//                              other one (flipX when floor(worldX / 16) is odd). Column 0
//                              of a plain tile and column 0 of the flipped tile next to it
//                              meet as one 2 px post, so posts land every 32 px of world,
//                              at world x 32k - 1 and 32k. Without the flip you get 1 px
//                              posts every 16 px, which still reads as a rail.
//                              Far rail: tile top at screen y84, feet on y91 at the dirt edge.
//                              Near rail: tile top at screen y152, feet on y159, over the
//                              grass verge.
//   art.race.pole.furlong      4x28, top at screen y64, bottom y91. Ink outline, Bone post,
//                              band rows 2-9 in key Ash (recolor per pole type from data).
//                              The pole's marking column is x1.
//   art.race.pole.wire         8x28, top at screen y64. Post on x2-4 with a 7x7 disk on top,
//                              Bone stripe down the disk's middle. The finish line is x3.
//   art.race.gate              40x88, 2 frames (closed, open). Top at screen y64; column
//                              x31 on the start line; x32-39 is the door column.
//   art.race.bg.far.hills      128x24, repeats horizontally, far layer y40-63.
//   art.race.bg.mid.grandstand 32x32, repeats horizontally, mid layer y56-87. Generic stand.
import { Canvas, strip, writeSlot } from './png.mjs';

export function dirtFast() {
  const c = new Canvas(16, 16);
  c.rect(0, 0, 16, 16, 'Dirt');
  // Fixed grain: short horizontal flecks and single specks, scattered so no row or
  // column lines up and the tile shows no seam when repeated.
  c.draw([
    '................',
    '..##........#...',
    '................',
    '.......#........',
    '...........##...',
    '#...............',
    '....#...........',
    '.........##.....',
    '..............#.',
    '.##.............',
    '.......#....#...',
    '................',
    '....##..........',
    '..........#.....',
    '#............##.',
    '......#.........',
  ], { '#': 'Dirt Shade' });
  return c;
}

// grassFrom: first row with Grass behind the posts. Rows above it stay transparent
// between the posts, so the layer behind shows through.
function rail(barRows, grassFrom) {
  const c = new Canvas(16, 8);
  c.rect(0, grassFrom, 16, 8 - grassFrom, 'Grass');
  // Bar: Bone on top, Mist underside in shade.
  for (let y = 0; y < barRows; y++) c.rect(0, y, 16, 1, y === barRows - 1 ? 'Mist' : 'Bone');
  // Half post on column 0, Bone down to the ground row.
  for (let y = barRows; y < 8; y++) c.set(0, y, 'Bone');
  return c;
}
// Far: Grass behind the posts on rows 4-7 (screen y88-91, the spec's far rail band), so
// that band is never empty where the mid layer stops at y87.
export const railFar = () => rail(2, 4);
// Near: Grass behind the posts from row 3 (y155) down, covering the verge y156-159 too.
export const railNear = () => rail(3, 3);

export function poleFurlong() {
  const c = new Canvas(4, 28);
  c.rect(0, 0, 4, 28, 'Ink');
  c.set(0, 0, null);
  c.set(3, 0, null);
  c.rect(1, 1, 2, 26, 'Bone');
  c.rect(1, 2, 2, 8, 'Ash'); // band, key slot 2
  c.rect(1, 27, 2, 1, 'Ink');
  return c;
}

export function poleWire() {
  const c = new Canvas(8, 28);
  c.draw([
    '..KKK...',
    '.KRBRK..',
    'KRRBRRK.',
    'KRRBRRK.',
    'KRRBRRK.',
    '.KRBRK..',
    '..KBK...',
  ], { K: 'Ink', R: 'Red', B: 'Bone' });
  for (let y = 7; y < 28; y++) c.draw(['..KBK...'], { K: 'Ink', B: 'Bone' }, 0, y);
  c.draw(['..KKK...'], { K: 'Ink' }, 0, 27);
  return c;
}

// Gate. B Bone, A Ash, S Slate. Rows are screen y - 64.
function gateFrame(open) {
  const c = new Canvas(40, 88);
  const key = { B: 'Bone', A: 'Ash', S: 'Slate' };
  // Header box across the whole gate, rows 0-10.
  c.rect(0, 0, 40, 11, 'Slate');
  c.rect(1, 1, 38, 6, 'Bone');
  c.rect(1, 7, 38, 2, 'Ash');
  for (const x of [8, 16, 24, 32]) c.rect(x, 1, 1, 8, 'Slate'); // panel seams
  // Stall frame posts: rear (x0-2) and front (x29-31), light on the left face.
  for (const x0 of [0, 29]) {
    c.rect(x0, 11, 1, 77, 'Bone');
    c.rect(x0 + 1, 11, 1, 77, 'Ash');
    c.rect(x0 + 2, 11, 1, 77, 'Slate');
  }
  // Padded stall rails between the posts: one above the field, two low ones that
  // show between the legs.
  for (const y of [13, 58, 76]) {
    c.rect(3, y, 26, 2, 'Ash');
    c.rect(3, y + 2, 26, 1, 'Slate');
  }
  c.rect(3, 13, 26, 1, 'Bone');
  // Door column x32-39: end posts at the far end (rows 11-27, above the field) and the
  // near end (rows 84-87); doors between them when closed.
  c.draw(Array(17).fill('..BAAS..'), key, 32, 11);
  c.draw(Array(4).fill('..BAAS..'), key, 32, 84);
  if (!open) {
    for (let y = 28; y < 84; y += 8) {
      const h = Math.min(8, 84 - y);
      c.rect(32, y, 8, h, 'Bone');
      c.rect(38, y, 2, h, 'Ash');
      c.rect(32, y + h - 1, 8, 1, 'Slate');
    }
  }
  return c;
}
export const gate = () => strip([gateFrame(false), gateFrame(true)]);

// Piecewise-linear ridge from hand-placed control points, integer math, so the
// silhouette steps on whole pixels and repeats seamlessly (first and last y match).
function ridge(points, w) {
  const top = new Array(w);
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    for (let x = x0; x < x1 && x < w; x++) {
      top[x] = y0 + Math.floor(((y1 - y0) * (x - x0) * 2 + (x1 - x0)) / (2 * (x1 - x0)));
    }
  }
  return top;
}

export function hills() {
  const w = 128;
  const c = new Canvas(w, 24);
  const back = ridge([[0, 9], [14, 6], [26, 4], [38, 6], [52, 10], [64, 11], [78, 7], [90, 5], [100, 6], [112, 10], [128, 9]], w);
  const front = ridge([[0, 15], [12, 13], [26, 14], [38, 12], [50, 13], [62, 16], [74, 14], [86, 12], [98, 11], [110, 13], [120, 15], [128, 15]], w);
  for (let x = 0; x < w; x++) {
    for (let y = back[x]; y < 24; y++) c.set(x, y, 'Grass');
    for (let y = front[x]; y < 24; y++) c.set(x, y, 'Turf');
  }
  // Tree clumps in Pine standing on the front ridge, and a Pine hedge line at the base.
  const TREE = ['.##.', '####', '####', '.##.'];
  const TREE_BIG = ['..##..', '.####.', '######', '######', '.####.'];
  for (const [x, big] of [[6, false], [30, true], [36, false], [70, false], [90, true], [97, false], [116, false]]) {
    const t = big ? TREE_BIG : TREE;
    const tw = t[0].length;
    // Sink the clump's bottom row 1 px into the lowest ridge point under it, so it never floats.
    const base = Math.max(...Array.from({ length: tw }, (_, i) => front[(x + i) % w])) + 1;
    t.forEach((row, j) => [...row].forEach((p, i) => {
      if (p === '#') c.set((x + i) % w, base - t.length + 1 + j, 'Pine');
    }));
  }
  c.rect(0, 21, w, 3, 'Pine');
  return c;
}

export function grandstand() {
  const c = new Canvas(32, 32);
  // Canopy roof: Bone fascia, Ash face, then the Slate shade under the canopy.
  c.rect(0, 4, 32, 2, 'Bone');
  c.rect(0, 6, 32, 1, 'Ash');
  c.rect(0, 7, 32, 5, 'Slate');
  // Seats in Ash with thin Slate riser lines.
  c.rect(0, 12, 32, 13, 'Ash');
  for (const y of [15, 19, 23]) c.rect(0, y, 32, 1, 'Slate');
  // Roof columns every 16 px, Bone with an Ash shade on the right.
  for (const x of [7, 23]) {
    c.rect(x, 7, 1, 18, 'Bone');
    c.rect(x + 1, 7, 1, 18, 'Ash');
  }
  // Front rail of the stand, then the Ash base wall with two darker Slate entrances.
  c.rect(0, 25, 32, 1, 'Bone');
  c.rect(0, 26, 32, 6, 'Ash');
  c.rect(2, 28, 4, 4, 'Slate');
  c.rect(18, 28, 4, 4, 'Slate');
  return c;
}

export function build() {
  return [
    writeSlot('art.track.dirt.fast', dirtFast()),
    writeSlot('art.race.rail.far', railFar()),
    writeSlot('art.race.rail.near', railNear()),
    writeSlot('art.race.pole.furlong', poleFurlong()),
    writeSlot('art.race.pole.wire', poleWire()),
    writeSlot('art.race.gate', gate()),
    writeSlot('art.race.bg.far.hills', hills()),
    writeSlot('art.race.bg.mid.grandstand', grandstand()),
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const p of build()) console.log(p);
}
