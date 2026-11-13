import type { Palette } from '../data/raceDaySchema';

// Colors are picked by palette name, never by value. Every color the screens draw comes
// through here, so nothing outside the master palette can reach the canvas.

export type ColorMap = ReadonlyMap<string, number>;

export function colorMap(palette: Palette): ColorMap {
  return new Map(palette.colors.map((c) => [c.name, parseInt(c.hex.slice(1), 16)]));
}

export function rgbOf(colors: ColorMap, name: string): number {
  const v = colors.get(name);
  if (v === undefined) throw new Error(`"${name}" is not a palette color name`);
  return v;
}
