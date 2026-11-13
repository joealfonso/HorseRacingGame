// Pixel swaps on raw RGBA data, so recoloring stays on the grid and inside the palette:
// whole pixels change from one palette color to another, nothing is tinted or blended.

/** Swaps exact RGB matches on opaque pixels. Transparent pixels are left alone. */
export function swapColors(data: Uint8ClampedArray | number[], swaps: ReadonlyArray<readonly [number, number]>): void {
  if (swaps.length === 0) return;
  const map = new Map(swaps);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const rgb = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    const to = map.get(rgb);
    if (to === undefined) continue;
    data[i] = (to >> 16) & 255;
    data[i + 1] = (to >> 8) & 255;
    data[i + 2] = to & 255;
  }
}

/**
 * For font sheets: every opaque pixel that is not `keep` (Ink, a text shadow) becomes
 * `color`, so a glyph sheet drawn in any one color can print in any palette color.
 * Alpha is snapped to 0 or 255.
 */
export function paintGlyphs(data: Uint8ClampedArray | number[], color: number, keep: number): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) {
      data[i + 3] = 0;
      continue;
    }
    data[i + 3] = 255;
    const rgb = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    if (rgb === keep) continue;
    data[i] = (color >> 16) & 255;
    data[i + 1] = (color >> 8) & 255;
    data[i + 2] = color & 255;
  }
}

/** The Pink and Ink placeholder checker, 2x2 cells, as RGBA rows. */
export function checkerPixels(width: number, height: number, pink: number, ink: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = ((x >> 1) + (y >> 1)) % 2 === 0 ? pink : ink;
      const i = (y * width + x) * 4;
      out[i] = (c >> 16) & 255;
      out[i + 1] = (c >> 8) & 255;
      out[i + 2] = c & 255;
      out[i + 3] = 255;
    }
  }
  return out;
}
