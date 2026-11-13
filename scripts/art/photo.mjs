// Photo-finish background. Run: node scripts/art/photo.mjs
//
//   art.photo.bg.streaks   16x16 tile, Mist and Ash vertical streaks, like the background of a
//                          strip-camera finish photo. Tiles seamlessly in both directions: every
//                          column is the same top to bottom. Streak widths run 1, 2, 2, 1 and 1 so it does not read as a
//                          fence. No Ink outline (a tile), two colors, no dither.
import { Canvas, writeSlot } from './png.mjs';

// M = Mist, A = Ash. Column 0 is the left. Columns 14, 15, 0, 1, 2 are one Mist run across the seam.
// Every row is the same, as a strip camera records it. A first draft with short breaks in the streaks
// repeated as a visible dash rhythm every 16 rows, so the breaks were dropped.
const STREAKS = Array(16).fill('MMMAMMAAMMMMAMMM');

export function streaks() {
  const c = new Canvas(16, 16);
  c.draw(STREAKS, { M: 'Mist', A: 'Ash' });
  return c;
}

export function build() {
  return [writeSlot('art.photo.bg.streaks', streaks())];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const p of build()) console.log(p);
}
