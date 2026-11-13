import type { CardLook, RaceDay } from '../data/raceDaySchema';
import type { Horse } from '../data/schema';
import { fillTemplate } from '../data/template';
import { SLOT_IDS } from './slotStatus';

// The program pages (DESIGN "Program pages"; spec 4.1, 4.2, 4.6) as pure data: flat
// Parchment with Ink type, Maroon for titles and the right-aligned columns, Ink rules, the
// Yellow highlighter band with chisel ends, saddlecloth blocks with an Ink border, stat bars
// on an Ash track, and the one program entry the Card and Orders both draw. A page is a
// list of filled rectangles, text and images; the scenes draw them in that order.

export const PAPER = 'Parchment';
export const INK = 'Ink';
export const SECOND_INK = 'Maroon';
export const BAND_COLOR = 'Yellow';
export const TRACK_COLOR = 'Ash';

/** On paper the horseshoe is Gold with an Auburn shade, Ink outline kept (DESIGN Program pages, Cursor). */
export const PAPER_CURSOR_SWAPS: readonly (readonly [string, string])[] = [['Yellow', 'Gold'], ['Gold', 'Auburn']];
/** The "yours" arrow marker prints solid Ink on paper. */
export const PAPER_MARKER_SWAPS: readonly (readonly [string, string])[] = [['Yellow', 'Ink'], ['Gold', 'Ink']];

export interface PageRect { x: number; y: number; w: number; h: number; color: string }
export interface PageText { text: string; x: number; y: number; color: string; small?: boolean }
export interface PageImage { slot: string; x: number; y: number }

const MAIN_W = 8;

/** A word right-aligned so its last cell ends at `lastX` (inclusive): "Stalker" to x247 starts at x192. */
export const rightAlignedX = (text: string, lastX: number, cell = MAIN_W): number => lastX + 1 - cell * text.length;

/** A 1 px Ink rule across x8-247 (or any span). */
export const rule = (y: number, x = 8, w = 240): PageRect => ({ x, y, w, h: 1, color: INK });

export type BandShape = RaceDay['program']['entryBand']['value'];

/** Rows per chisel group: four groups as even as possible, extra rows to the top groups. */
export function bandGroups(rows: number): number[] {
  const base = Math.floor(rows / 4);
  const extra = rows % 4;
  return [0, 1, 2, 3].map((g) => base + (g < extra ? 1 : 0));
}

/**
 * The highlighter band from row `top`, one rect per row: group g runs from x0 + leftSteps[g]
 * to `x1` - rightSteps[g]. `x1` defaults to the shape's end; the swipe's first frame passes
 * its half-way end and keeps the chisel there.
 */
export function bandRects(shape: BandShape, top: number, x1 = shape.x1): PageRect[] {
  const out: PageRect[] = [];
  let y = top;
  bandGroups(shape.rows).forEach((n, g) => {
    const a = shape.x0 + shape.leftSteps[g];
    const b = x1 - shape.rightSteps[g];
    for (let k = 0; k < n; k++, y++) if (b >= a) out.push({ x: a, y, w: b - a + 1, h: 1, color: BAND_COLOR });
  });
  return out;
}

/** CD3: bar length in px from the stat range in tuning, never from the card's own spread. */
export function statBarLength(stat: number, statMin: number, statMax: number, width = ENTRY.barW): number {
  if (statMax <= statMin) return 0;
  return Math.min(width, Math.max(0, Math.floor(((stat - statMin) * width) / (statMax - statMin))));
}

/** The program entry's columns (spec 4.1 entry table), relative to the entry's top row. */
export const ENTRY = {
  height: 17,
  cloth: { x: 20, w: 16, h: 17 },
  name: 40,
  styleLastX: 247,
  stats: [
    { key: 'speed', numberX: 40, barX: 50 },
    { key: 'stamina', numberX: 108, barX: 118 },
    { key: 'kick', numberX: 176, barX: 186 },
  ],
  numberDy: 10,
  barDy: 11,
  barH: 3,
  trackDy: 12,
  barW: 50,
  tick: { x: 238, dy: 9 },
  cursorDy: 5,
} as const;

/** The 2 digits a stat prints in (the loader holds stats to 99). */
export const statDigits = (v: number): string => String(v).padStart(2, '0');

export interface Entry {
  post: number;
  id: string;
  top: number;
  /** The 16x17 saddlecloth block's box (its Ink border included). */
  cloth: { x: number; y: number; w: number; h: number };
  /** Ink border, then the cloth fill, then the number in the main font. */
  rects: PageRect[];
  texts: PageText[];
  images: PageImage[];
}

export interface Saddlecloth { fill: string; number: string }

/**
 * One horse's program entry (CD1, CD4): drawn from that horse, its saddlecloth and the stat
 * range only. Nothing about the other horses reaches it, so no mark, color or order can
 * depend on how it compares. `tick` puts the pencil tick on it (last race's pick).
 */
export function programEntry(h: Horse, top: number, rd: RaceDay, cloth: Saddlecloth, statRange: { min: number; max: number }, tick: boolean): Entry {
  const E = ENTRY;
  const C = E.cloth;
  const rects: PageRect[] = [
    { x: C.x, y: top, w: C.w, h: C.h, color: INK },
    { x: C.x + 1, y: top + 1, w: C.w - 2, h: C.h - 2, color: cloth.fill },
  ];
  const num = String(h.post);
  // Main-font digits are 6 px wide in an 8 px cell and 7 rows tall: centered on the fill.
  const numW = MAIN_W * num.length - 2;
  const texts: PageText[] = [
    { text: num, x: C.x + 1 + Math.floor((C.w - 2 - numW) / 2), y: top + 1 + Math.floor((C.h - 2 - 7) / 2), color: cloth.number },
    { text: h.name, x: E.name, y: top, color: INK },
  ];
  const style = rd.copy.card.styles[h.style];
  texts.push({ text: style, x: rightAlignedX(style, E.styleLastX), y: top, color: SECOND_INK });
  for (const s of E.stats) {
    const v = h.stats[s.key];
    texts.push({ text: statDigits(v), x: s.numberX, y: top + E.numberDy, color: INK, small: true });
    // The track: a 1 px Ash line on the middle row and a 1x3 Ash stop at its last column;
    // then the solid Ink fill from the first column, over the track where it runs.
    rects.push({ x: s.barX, y: top + E.trackDy, w: E.barW, h: 1, color: TRACK_COLOR });
    rects.push({ x: s.barX + E.barW - 1, y: top + E.barDy, w: 1, h: E.barH, color: TRACK_COLOR });
    const len = statBarLength(v, statRange.min, statRange.max);
    if (len > 0) rects.push({ x: s.barX, y: top + E.barDy, w: len, h: E.barH, color: INK });
  }
  const images: PageImage[] = tick ? [{ slot: SLOT_IDS.markPick, x: E.tick.x, y: top + E.tick.dy }] : [];
  return { post: h.post, id: h.id, top, cloth: { x: C.x, y: top, w: C.w, h: C.h }, rects, texts, images };
}

/** "{jockey} up" and the blurb, the lines under an entry (Card footer, Orders top). */
export function riderLines(h: Horse, rd: RaceDay, look: CardLook): [string, string] {
  return [fillTemplate(rd.copy.card.jockeyUp, { jockey: h.jockey }), look[h.id]?.blurb ?? ''];
}

/** The saddlecloth for a program number, from data. */
export const clothFor = (rd: RaceDay, post: number): Saddlecloth => rd.saddlecloths.value[(post - 1) % rd.saddlecloths.value.length];

