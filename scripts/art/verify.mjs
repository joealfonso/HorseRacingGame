// Checks every generated asset against the intake rules that a script can check.
// Run: node scripts/art/verify.mjs   (exit code 1 on any failure)
//
//  - the palette in png.mjs matches the master palette table in DESIGN.md
//  - every expected file exists, holds only IHDR, IDAT and IEND chunks, and is
//    frame width x frame count wide and frame height tall
//  - every pixel is fully transparent or a master palette color at alpha 255
//  - each frame stays inside its color budget (sprite layer: 3 opaque; tile: 4 with transparent)
//  - recolorable layers use only the key colors Ink, Ash, Slate
//  - race horse layers: nose at x31 in every body frame, jacket and cap identical in every frame,
//    saddlecloth exactly the 7x9 box; edge marker exactly the 8x9 layout
//  - paddock: trainer in Ink, Peach and Maroon with an Ink outer silhouette, boots on row 23,
//    frames differing only in the head and arm boxes; ground and rail tiles with no Ink, the
//    rail rows 0-6 Turf and the fence wholly in rail rows 8-15
//  - pencil tick exactly as DESIGN.md gives it
//  - no stray files under public/assets
//  - rebuilding gives byte-identical files
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ASSET_ROOT, PALETTE, REPO, decodePng, slotPath } from './png.mjs';

const KEYS = ['Ink', 'Ash', 'Slate'];
// slot, frame w, frame h, frames, budget ('sprite' | 'tile' | 'font'), recolorable
const EXPECTED = [
  ['font.ui.main', 128, 48, 1, 'font', false],
  ['font.ui.small', 64, 6, 1, 'font', false],
  ['art.ui.frame.box', 8, 8, 9, 'tile', false],
  ['art.ui.cursor.horseshoe', 8, 8, 2, 'sprite', false],
  ['art.ui.placeholder_tag', 8, 8, 1, 'sprite', false],
  ['art.ui.minimap.track', 88, 40, 1, 'tile', false],
  ['art.ui.marker.yours', 8, 8, 1, 'sprite', false],
  ['art.photo.bg.streaks', 16, 16, 1, 'tile', false],
  ['art.race.marker.player', 7, 4, 1, 'sprite', false],
  ['art.race.marker.edge', 8, 9, 1, 'sprite', true],
  ['art.track.dirt.fast', 16, 16, 1, 'tile', false],
  ['art.race.rail.far', 16, 8, 1, 'tile', false],
  ['art.race.rail.near', 16, 8, 1, 'tile', false],
  ['art.race.pole.furlong', 4, 28, 1, 'sprite', false],
  ['art.race.pole.wire', 8, 28, 1, 'sprite', false],
  ['art.race.gate', 40, 88, 2, 'sprite', false],
  ['art.race.bg.far.hills', 128, 24, 1, 'tile', false],
  ['art.race.bg.mid.grandstand', 32, 32, 1, 'tile', false],
  ['art.race.bg.mid.crowd', 16, 16, 2, 'tile', false],
  ['art.race.bg.mid.infield', 32, 32, 1, 'tile', false],
  ['art.race.ambient.flag', 8, 8, 2, 'sprite', false],
  ['art.race.horse.body.gallop', 32, 24, 2, 'sprite', true],
  ['art.race.horse.body.walk', 32, 24, 2, 'sprite', true],
  ['art.race.horse.tack.walk', 32, 24, 2, 'sprite', true],
  ['art.race.jockey.jacket.walk', 32, 24, 2, 'sprite', true],
  ['art.race.jockey.cap.walk', 32, 24, 2, 'sprite', true],
  ['art.race.jockey.jacket.winner', 32, 24, 2, 'sprite', true],
  ['art.race.jockey.cap.winner', 32, 24, 2, 'sprite', true],
  ['art.race.horse.body.stand', 32, 24, 1, 'sprite', true],
  ['art.race.horse.tack.gallop', 32, 24, 2, 'sprite', true],
  ['art.race.horse.tack.stand', 32, 24, 1, 'sprite', true],
  ['art.race.jockey.jacket.gallop', 32, 24, 2, 'sprite', true],
  ['art.race.jockey.jacket.stand', 32, 24, 1, 'sprite', true],
  ['art.race.jockey.cap.gallop', 32, 24, 2, 'sprite', true],
  ['art.race.jockey.cap.stand', 32, 24, 1, 'sprite', true],
  ['art.ui.mark.pick', 8, 8, 1, 'sprite', false],
  ['art.paddock.trainer', 16, 24, 2, 'sprite', false],
  ['art.paddock.ground', 16, 16, 1, 'tile', false],
  ['art.paddock.rail', 16, 16, 1, 'tile', false],
];
// The 3x3 frame box sheet is 24x24, not a strip; its tiles are checked as one tile each.
const SHEET_OVERRIDE = { 'art.ui.frame.box': [24, 24] };

const failures = [];
const fail = (m) => failures.push(m);

// 1. Palette matches DESIGN.md.
const design = readFileSync(join(REPO, 'DESIGN.md'), 'utf8');
const rows = [...design.matchAll(/^\| [A-Z]\d+ \| ([^|]+) \| (#[0-9A-F]{6}) \|/gm)].map((m) => [m[1].trim(), m[2]]);
if (rows.length !== 42) fail(`DESIGN.md palette rows found: ${rows.length}, expected 42`);
for (const [name, hex] of rows) if (PALETTE[name] !== hex) fail(`palette ${name}: DESIGN ${hex}, png.mjs ${PALETTE[name]}`);
if (Object.keys(PALETTE).length !== 42) fail(`png.mjs palette has ${Object.keys(PALETTE).length} colors`);
const byRgb = new Map(Object.entries(PALETTE).map(([n, h]) => [h.slice(1).toUpperCase(), n]));

function hashAll() {
  const out = {};
  for (const [slot] of EXPECTED) {
    try {
      out[slot] = createHash('sha256').update(readFileSync(slotPath(slot))).digest('hex');
    } catch {
      out[slot] = null;
    }
  }
  return out;
}

const images = {};
for (const [slot, fw, fh, n, budget, recolor] of EXPECTED) {
  let img;
  try {
    img = decodePng(readFileSync(slotPath(slot)));
  } catch (e) {
    fail(`${slot}: cannot read ${relative(REPO, slotPath(slot))}: ${e.message}`);
    continue;
  }
  images[slot] = img;
  const extra = img.chunks.filter((t) => !['IHDR', 'IDAT', 'IEND'].includes(t));
  if (extra.length) fail(`${slot}: extra chunks ${extra.join(',')}`);
  const [ew, eh] = SHEET_OVERRIDE[slot] ?? [fw * n, fh];
  if (img.w !== ew || img.h !== eh) fail(`${slot}: ${img.w}x${img.h}, expected ${ew}x${eh}`);
  const name = (x, y) => {
    const i = (y * img.w + x) * 4;
    const a = img.data[i + 3];
    if (a === 0) return null;
    const hex = [0, 1, 2].map((k) => img.data[i + k].toString(16).padStart(2, '0')).join('').toUpperCase();
    if (a !== 255) fail(`${slot}: alpha ${a} at ${x},${y}`);
    const nm = byRgb.get(hex);
    if (!nm) fail(`${slot}: off-palette #${hex} at ${x},${y}`);
    return nm ?? hex;
  };
  img.name = name;
  // Per-frame color budget (the frame box: per 8x8 tile).
  const cells = [];
  if (slot === 'art.ui.frame.box') for (let t = 0; t < 9; t++) cells.push([(t % 3) * 8, Math.floor(t / 3) * 8, 8, 8]);
  else for (let f = 0; f < n; f++) cells.push([f * fw, 0, fw, fh]);
  for (const [cx, cy, cw, ch] of cells) {
    const set = new Set();
    let transparent = false;
    for (let y = cy; y < cy + ch; y++) for (let x = cx; x < cx + cw; x++) {
      const c = name(x, y);
      if (c === null) transparent = true;
      else set.add(c);
    }
    const total = set.size + (transparent ? 1 : 0);
    if (budget === 'sprite' && set.size > 3) fail(`${slot} frame at x${cx}: ${set.size} opaque colors (${[...set]})`);
    if (budget === 'tile' && total > 4) fail(`${slot} cell at ${cx},${cy}: ${total} colors with transparent`);
    if (budget === 'font' && (set.size !== 1 || !set.has('Bone'))) fail(`${slot}: font colors ${[...set]}`);
    if (recolor) for (const c of set) if (!KEYS.includes(c)) fail(`${slot}: ${c} is not a key color`);
  }
}

// 2. Horse layer rules.
const frameOf = (slot, f) => {
  const img = images[slot];
  const px = [];
  for (let y = 0; y < 24; y++) for (let x = 0; x < 32; x++) px.push(img.name(f * 32 + x, y));
  return px;
};
for (const anim of ['gallop', 'stand', 'walk']) {
  const n = anim === 'stand' ? 1 : 2;
  for (let f = 0; f < n; f++) {
    const body = frameOf(`art.race.horse.body.${anim}`, f);
    let right = -1;
    let bottom = -1;
    body.forEach((c, i) => {
      if (c !== null) {
        right = Math.max(right, i % 32);
        bottom = Math.max(bottom, Math.floor(i / 32));
      }
    });
    if (right !== 31) fail(`body.${anim} frame ${f}: rightmost column ${right}, expected 31`);
    if (bottom !== 23) fail(`body.${anim} frame ${f}: lowest row ${bottom}, expected 23`);
  }
}
for (const layer of ['art.race.jockey.jacket', 'art.race.jockey.cap']) {
  const ref = frameOf(`${layer}.stand`, 0).join();
  for (let f = 0; f < 2; f++) if (frameOf(`${layer}.gallop`, f).join() !== ref) fail(`${layer}: gallop frame ${f} differs from stand`);
  // The rider holds still at the walk and in the winner pose too.
  for (const anim of ['walk', 'winner']) {
    if (frameOf(`${layer}.${anim}`, 0).join() !== frameOf(`${layer}.${anim}`, 1).join()) fail(`${layer}.${anim}: frames differ`);
  }
}

// Saddlecloth geometry: tack frames are exactly the 7x9 Ink box and 5x7 fill from DESIGN.md.
for (const [anim, tops] of [['gallop', [9, 8]], ['stand', [9]], ['walk', [9, 9]]]) {
  tops.forEach((top, f) => {
    const px = frameOf(`art.race.horse.tack.${anim}`, f);
    px.forEach((c, i) => {
      const x = i % 32;
      const y = Math.floor(i / 32);
      const inBox = x >= 8 && x <= 14 && y >= top - 1 && y <= top + 7;
      const inFill = x >= 9 && x <= 13 && y >= top && y <= top + 6;
      const want = inFill ? 'Ash' : inBox ? 'Ink' : null;
      if (c !== want) fail(`tack.${anim} frame ${f}: ${c} at ${x},${y}, expected ${want}`);
    });
  });
}
// Streaks: Mist and Ash only, fully opaque, and it wraps vertically (row 15 equals row 0).
{
  const img = images['art.photo.bg.streaks'];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const c = img.name(x, y);
    if (c !== 'Mist' && c !== 'Ash') fail(`streaks: ${c} at ${x},${y}`);
  }
  for (let x = 0; x < 16; x++) if (img.name(x, 0) !== img.name(x, 15)) fail(`streaks: row 0 and 15 differ at ${x}`);
}
// Yours marker: column 7 and row 7 blank, so it keeps 1 px before the text and shares its baseline.
{
  const img = images['art.ui.marker.yours'];
  for (let i = 0; i < 8; i++) {
    if (img.name(7, i) !== null) fail(`yours marker: column 7 not blank at y${i}`);
    if (img.name(i, 7) !== null) fail(`yours marker: row 7 not blank at x${i}`);
  }
}
// Edge marker: 7x9 Ink box, 5x7 fill, tip at x7 y4 and nothing else in column 7.
{
  const img = images['art.race.marker.edge'];
  for (let y = 0; y < 9; y++) for (let x = 0; x < 8; x++) {
    const want = x === 7 ? (y === 4 ? 'Ink' : null) : x >= 1 && x <= 5 && y >= 1 && y <= 7 ? 'Ash' : 'Ink';
    if (img.name(x, y) !== want) fail(`edge marker: ${img.name(x, y)} at ${x},${y}, expected ${want}`);
  }
}

// Winner arm: the exact sleeve and fist rows from DESIGN.md, and x20 clear at y0-2.
{
  const ARM = [
    '.....................JJJ........',
    '.....................JJJ........',
    '.....................JjJ........',
    '....................JJjJ........',
    '..............JjjjjjjjJ.........',
    '..............JjjjjJJJJJ........',
  ];
  for (let f = 0; f < 2; f++) {
    const px = frameOf('art.race.jockey.jacket.winner', f);
    ARM.forEach((row, y) => [...row].forEach((ch, x) => {
      const want = ch === 'J' ? 'Ink' : ch === 'j' ? 'Ash' : null;
      if (px[y * 32 + x] !== want) fail(`jacket.winner frame ${f}: ${px[y * 32 + x]} at ${x},${y}, expected ${want}`);
    }));
  }
}
// Crowd: Bone, Sky and Tan only (no Red, which fights the silks and saddlecloth 1).
{
  const img = images['art.race.bg.mid.crowd'];
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const c = img.name(x, y);
    if (c !== null && !['Bone', 'Sky', 'Tan'].includes(c)) fail(`crowd: ${c} at ${x},${y}`);
  }
}
// Infield: flagpole at x23 (rows 3-27), and columns 0-15 hold no Bone, so they slice clean.
{
  const img = images['art.race.bg.mid.infield'];
  for (let y = 3; y <= 27; y++) if (img.name(23, y) !== 'Bone') fail(`infield: no pole at 23,${y}`);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) if (img.name(x, y) === 'Bone') fail(`infield: pole pixel in the slice at ${x},${y}`);
}

// Paddock trainer: exactly Ink, Peach and Maroon in each frame; every opaque pixel on the outer
// silhouette is Ink; rows 0-1 empty and boots on row 23; the frames differ only inside the head
// box (x4-15, y2-10) and the arm and cup box (x9-15, y8-17), and do differ in the arm box.
{
  const img = images['art.paddock.trainer'];
  const at = (f, x, y) => (x < 0 || y < 0 || x > 15 || y > 23 ? null : img.name(f * 16 + x, y));
  const inBox = ([x0, y0, x1, y1], x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const HEAD = [4, 2, 15, 10];
  const ARM = [9, 8, 15, 17];
  let armMoves = false;
  for (let f = 0; f < 2; f++) {
    const set = new Set();
    let top = 24;
    let bottom = -1;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 16; x++) {
      const c = at(f, x, y);
      if (c === null) continue;
      set.add(c);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(f, x + dx, y + dy) === null);
      if (edge && c !== 'Ink') fail(`trainer frame ${f}: ${c} on the outer silhouette at ${x},${y}`);
    }
    if ([...set].sort().join() !== 'Ink,Maroon,Peach') fail(`trainer frame ${f}: colors ${[...set]}`);
    if (top !== 2 || bottom !== 23) fail(`trainer frame ${f}: rows ${top}-${bottom}, expected 2-23`);
  }
  for (let y = 0; y < 24; y++) for (let x = 0; x < 16; x++) {
    if (at(0, x, y) === at(1, x, y)) continue;
    if (inBox(ARM, x, y)) armMoves = true;
    else if (!inBox(HEAD, x, y)) fail(`trainer: frames differ at ${x},${y}, outside the head and arm boxes`);
  }
  if (!armMoves) fail('trainer: the arm and cup do not move between frames');
}
// Paddock tiles: fully opaque, no Ink (background), the planned colors, a Turf far band on rail
// rows 0-6, and the fence (Bone, Mist) only in rail rows 8-15. The rail is the strip's top row,
// so the fence sits at y152-159, above both figures.
for (const [slot, allowed] of [['art.paddock.ground', ['Grass', 'Leaf', 'Turf']], ['art.paddock.rail', ['Grass', 'Turf', 'Bone', 'Mist']]]) {
  const img = images[slot];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const c = img.name(x, y);
    if (c === null || !allowed.includes(c)) fail(`${slot}: ${c} at ${x},${y}`);
    if (slot === 'art.paddock.rail' && y < 8 && (c === 'Bone' || c === 'Mist')) fail(`${slot}: fence above row 8 at ${x},${y}`);
    if (slot === 'art.paddock.rail' && y < 7 && c !== 'Turf') fail(`${slot}: far band rows 0-6 not Turf at ${x},${y}`);
  }
}

// Pencil tick: exactly the pixels DESIGN.md (Program pages) gives.
for (const [slot, rows, key] of [
  ['art.ui.mark.pick', ['........', '.......S', '......SS', '.....SS.', 'S...SS..', 'SS.SS...', '.SSS....', '..S.....'], { S: 'Slate' }],
]) {
  const img = images[slot];
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const want = ch === '.' ? null : key[ch];
    if (img.name(x, y) !== want) fail(`${slot}: ${img.name(x, y)} at ${x},${y}, expected ${want}`);
  }));
}

// 3. No stray files.
const expectedFiles = new Set(EXPECTED.map(([s]) => slotPath(s)));
const walk = (d) => readdirSync(d).flatMap((e) => {
  const p = join(d, e);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
for (const p of walk(ASSET_ROOT)) if (!expectedFiles.has(p)) fail(`stray file ${relative(REPO, p)}`);

// 4. Determinism: rebuild and compare bytes.
const before = hashAll();
const r = spawnSync(process.execPath, [join(REPO, 'scripts', 'art', 'build.mjs')], { encoding: 'utf8' });
if (r.status !== 0) fail(`rebuild failed: ${r.stderr}`);
const after = hashAll();
for (const [slot] of EXPECTED) if (before[slot] !== after[slot]) fail(`${slot}: bytes changed on rebuild`);

if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exitCode = 1;
} else {
  console.log(`OK: ${EXPECTED.length} files, palette, sizes, budgets, keys, horse anchors, determinism`);
  for (const [slot] of EXPECTED) console.log(`  ${before[slot].slice(0, 16)}  ${relative(REPO, slotPath(slot))}`);
}
