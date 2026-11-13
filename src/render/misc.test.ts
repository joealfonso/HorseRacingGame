import { describe, expect, it } from 'vitest';
import palette from '../data/palette.json';
import { rgbOf, colorMap } from './colors';
import { MAIN_CELL, MAIN_CHARS, SMALL_CELL, SMALL_CHARS, SMALL_FALLBACK, cellOf } from './fontLayout';
import { checkerPixels, paintGlyphs, swapColors } from './recolor';
import { paletteSchema } from '../data/raceDaySchema';

// The small pure helpers behind P0-1 (every color on screen is in the master palette)
// and the font sheets of spec section 7.

describe('colors: picked by palette name', () => {
  const map = colorMap(paletteSchema.parse(palette));

  it('names map to their hex numbers (DESIGN.md: Yellow #F8DA3A, Pink #F28CBA, Ink #14111C)', () => {
    expect(rgbOf(map, 'Yellow')).toBe(0xf8da3a);
    expect(rgbOf(map, 'Pink')).toBe(0xf28cba);
    expect(rgbOf(map, 'Ink')).toBe(0x14111c);
    expect(rgbOf(map, 'Dirt Shade')).toBe(0x9a6e3e);
  });

  it('a name that is not in the palette is an error, never a guess', () => {
    expect(() => rgbOf(map, 'Teal')).toThrow(/Teal/);
    expect(() => rgbOf(map, 'ink')).toThrow();
  });
});

describe('fonts: cell layout (spec section 7)', () => {
  it('main font: printable ASCII 32 to 126 in order, 8x8 cells, 16 a row', () => {
    expect(MAIN_CHARS).toHaveLength(95);
    expect(MAIN_CHARS.charCodeAt(0)).toBe(32);
    expect(MAIN_CHARS.charCodeAt(94)).toBe(126);
    expect(MAIN_CELL).toEqual({ w: 8, h: 8, columns: 16 });
    // 128x48 sheet
    expect(16 * MAIN_CELL.w).toBe(128);
    expect(Math.ceil(95 / 16) * MAIN_CELL.h).toBe(48);
  });

  it('main font has the characters errors need: [ ] . _ : " /', () => {
    for (const ch of '[]._:"/') expect(MAIN_CHARS).toContain(ch);
  });

  it('small font: 0-9 : . / # - and space, 4x6 cells', () => {
    for (const ch of '0123456789:./#- ') expect(SMALL_CHARS).toContain(ch);
    expect(SMALL_CHARS).toHaveLength(16);
    expect(SMALL_CELL.w).toBe(4);
    expect(SMALL_CELL.h).toBe(6);
  });

  it('cellOf finds a glyph by its place in the sheet', () => {
    expect(cellOf(MAIN_CHARS, MAIN_CELL, ' ')).toEqual({ x: 0, y: 0 });
    expect(cellOf(MAIN_CHARS, MAIN_CELL, 'A')).toEqual({ x: 8, y: 16 }); // 65 - 32 = 33
    expect(cellOf(MAIN_CHARS, MAIN_CELL, '~')).toEqual({ x: 14 * 8, y: 5 * 8 });
    expect(cellOf(SMALL_CHARS, SMALL_CELL, '7')).toEqual({ x: 28, y: 0 });
    expect(cellOf(SMALL_CHARS, SMALL_CELL, 'Z')).toBeNull();
  });

  it('the stand-in small font has a 3x5 glyph for every small-font character', () => {
    for (const ch of SMALL_CHARS) {
      const g = SMALL_FALLBACK[ch];
      expect(g, ch).toBeDefined();
      expect(g).toHaveLength(5);
      for (const row of g) expect(row).toMatch(/^[#.]{3}$/);
    }
  });
});

describe('recolor: exact pixel swaps, on the grid and in the palette', () => {
  const px = (...rgba: number[][]) => Uint8ClampedArray.from(rgba.flat());

  it('swapColors changes exact matches only and leaves transparent pixels alone', () => {
    const d = px([0x8e, 0x8a, 0x98, 255], [0x8e, 0x8a, 0x99, 255], [0x8e, 0x8a, 0x98, 0]);
    swapColors(d, [[0x8e8a98, 0xd8302c]]);
    expect([...d]).toEqual([0xd8, 0x30, 0x2c, 255, 0x8e, 0x8a, 0x99, 255, 0x8e, 0x8a, 0x98, 0]);
  });

  it('swapColors with no swaps changes nothing; it never blends or changes alpha', () => {
    const d = px([1, 2, 3, 255], [4, 5, 6, 255]);
    const before = [...d];
    swapColors(d, []);
    expect([...d]).toEqual(before);
  });

  it('paintGlyphs paints every opaque pixel but the kept one, and snaps alpha to 0 or 255', () => {
    const ink = 0x14111c;
    const d = px([255, 255, 255, 255], [0x14, 0x11, 0x1c, 255], [9, 9, 9, 127], [9, 9, 9, 128]);
    paintGlyphs(d, 0xf8da3a, ink);
    expect([...d]).toEqual([0xf8, 0xda, 0x3a, 255, 0x14, 0x11, 0x1c, 255, 9, 9, 9, 0, 0xf8, 0xda, 0x3a, 255]);
  });

  it('checkerPixels: 2x2 cells of exactly two colors, fully opaque', () => {
    const pink = 0xf28cba;
    const ink = 0x14111c;
    const d = checkerPixels(8, 8, pink, ink);
    expect(d).toHaveLength(8 * 8 * 4);
    const at = (x: number, y: number) => (d[(y * 8 + x) * 4] << 16) | (d[(y * 8 + x) * 4 + 1] << 8) | d[(y * 8 + x) * 4 + 2];
    expect(at(0, 0)).toBe(pink);
    expect(at(1, 1)).toBe(pink);
    expect(at(2, 0)).toBe(ink);
    expect(at(0, 2)).toBe(ink);
    expect(at(2, 2)).toBe(pink);
    for (let i = 3; i < d.length; i += 4) expect(d[i]).toBe(255);
  });
});
