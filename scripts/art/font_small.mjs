// font.ui.small: the original 4x6 number font.
// Run: node scripts/art/font_small.mjs
//
// Sheet: 64x6, one row of 16 cells in this order: 0123456789:./#- then space.
// Each glyph is 3x5 in columns 0-2, rows 0-4; column 3 and row 5 stay blank.
// Bone on transparent. Used for saddlecloth numbers (strip, boxes, edge markers,
// the race sprite), splits, the seed, the mini map and the tote board.
import { Canvas, writeSlot } from './png.mjs';

export const ORDER = '0123456789:./#- ';

const G = {
  0: ['###', '#.#', '#.#', '#.#', '###'],
  1: ['.#', '##', '.#', '.#', '###'],
  2: ['###', '..#', '###', '#', '###'],
  3: ['###', '..#', '.##', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#', '###', '..#', '###'],
  6: ['###', '#', '###', '#.#', '###'],
  7: ['###', '..#', '.#', '.#', '.#'],
  8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '###'],
  ':': ['', '.#', '', '.#', ''],
  '.': ['', '', '', '', '.#'],
  '/': ['..#', '..#', '.#', '#', '#'],
  '#': ['#.#', '###', '#.#', '###', '#.#'],
  '-': ['', '', '###', '', ''],
  ' ': [],
};

export function glyphCanvas(ch) {
  const c = new Canvas(4, 6);
  G[ch].forEach((row, y) => [...row].forEach((p, x) => {
    if (p === '#') c.set(x, y, 'Bone');
  }));
  return c;
}

export function build() {
  const s = new Canvas(64, 6);
  [...ORDER].forEach((ch, i) => s.blit(glyphCanvas(ch), i * 4, 0));
  return [writeSlot('font.ui.small', s)];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const p of build()) console.log(p);
}
