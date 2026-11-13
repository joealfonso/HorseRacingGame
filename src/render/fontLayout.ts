// The two fixed-cell font sheets (DESIGN.md, HUD, UI frame and font).
// Main: 8x8 cells, 16 a row, printable ASCII from space. Small: 4x6 cells, one row.

export const MAIN_CHARS = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
export const MAIN_CELL = { w: 8, h: 8, columns: 16 } as const;

export const SMALL_CHARS = '0123456789:./#- ';
export const SMALL_CELL = { w: 4, h: 6, columns: 16 } as const;

/** Top-left of a glyph's cell in its sheet, or null when the sheet has no such glyph. */
export function cellOf(chars: string, cell: { w: number; h: number; columns: number }, ch: string): { x: number; y: number } | null {
  const i = chars.indexOf(ch);
  if (i < 0) return null;
  return { x: (i % cell.columns) * cell.w, y: Math.floor(i / cell.columns) * cell.h };
}

// Stand-in small font, used only while font.ui.small has no file. 3x5 glyphs, rows top
// to bottom, "#" is a lit pixel. Not the artist's font: the placeholder tag shows while
// it is drawn.
export const SMALL_FALLBACK: Record<string, readonly string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  ':': ['...', '.#.', '...', '.#.', '...'],
  '.': ['...', '...', '...', '...', '.#.'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '#': ['#.#', '###', '#.#', '###', '#.#'],
  '-': ['...', '...', '###', '...', '...'],
  ' ': ['...', '...', '...', '...', '...'],
};
