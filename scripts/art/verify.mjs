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
  ['art.race.horse.body.gallop', 32, 24, 2, 'sprite', true],
  ['art.race.horse.body.stand', 32, 24, 1, 'sprite', true],
  ['art.race.horse.tack.gallop', 32, 24, 2, 'sprite', true],
  ['art.race.horse.tack.stand', 32, 24, 1, 'sprite', true],
  ['art.race.jockey.jacket.gallop', 32, 24, 2, 'sprite', true],
  ['art.race.jockey.jacket.stand', 32, 24, 1, 'sprite', true],
  ['art.race.jockey.cap.gallop', 32, 24, 2, 'sprite', true],
  ['art.race.jockey.cap.stand', 32, 24, 1, 'sprite', true],
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
for (const anim of ['gallop', 'stand']) {
  const n = anim === 'gallop' ? 2 : 1;
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
}

// Saddlecloth geometry: tack frames are exactly the 7x9 Ink box and 5x7 fill from DESIGN.md.
for (const [anim, tops] of [['gallop', [9, 8]], ['stand', [9]]]) {
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
// Edge marker: 7x9 Ink box, 5x7 fill, tip at x7 y4 and nothing else in column 7.
{
  const img = images['art.race.marker.edge'];
  for (let y = 0; y < 9; y++) for (let x = 0; x < 8; x++) {
    const want = x === 7 ? (y === 4 ? 'Ink' : null) : x >= 1 && x <= 5 && y >= 1 && y <= 7 ? 'Ash' : 'Ink';
    if (img.name(x, y) !== want) fail(`edge marker: ${img.name(x, y)} at ${x},${y}, expected ${want}`);
  }
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
