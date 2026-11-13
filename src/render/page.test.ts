import { describe, expect, it } from 'vitest';
import type { Horse } from '../data/schema';
import {
  ENTRY, PAPER_CURSOR_SWAPS, PAPER_MARKER_SWAPS, bandGroups, bandRects, programEntry, rightAlignedX, rule, statBarLength, statDigits,
} from './page';
import { cardScreen } from './cardScreen';
import { newSession } from './session';
import { CLOTH_BY_POST, ENTRY_BAND_ROWS, RESULT_BAND_ROWS, expectedSpans, game, paintRects, pixelAt, rd, shippedRaceDay, yellowSpans } from './testkit';

// The program page parts (spec 4.1, DESIGN "Program pages"): CD3 the bars, CD4 an entry drawn
// from its own horse alone, the highlighter band's shape, the paper cursor and marker swaps.
// Expected numbers are the spec's and DESIGN's, not read from page.ts.

const look = shippedRaceDay.cardLook;
const RANGE = game.tuning.statRange.value;
const base = game.card.horses[0];
const horse = (post: number, stats: { speed: number; stamina: number; kick: number }, extra: Partial<Horse> = {}): Horse => ({ ...structuredClone(base), post, stats, ...extra });
const first = newSession(1);
const rowsOf = (g = game) => cardScreen(g, rd, look, first, { focus: 0 }).rows;

/** The bar for one stat column of an entry at `top`: Ink length from the first column, from the pixels. */
function barRows(px: Map<string, string>, top: number, barX: number) {
  const out: Record<number, (string | undefined)[]> = {};
  for (const dy of [11, 12, 13]) out[dy] = Array.from({ length: 50 }, (_v, k) => pixelAt(px, barX + k, top + dy));
  return out;
}
const inkLength = (px: Map<string, string>, top: number, barX: number): number => {
  let n = 0;
  while (n < 50 && pixelAt(px, barX + n, top + 11) === 'Ink') n++;
  return n;
};
/** The spec's bar length with integer arithmetic only: floor((stat - min) * 50 / (max - min)). */
const spec = (stat: number, min: number, max: number): number => {
  const num = (stat - min) * 50;
  const den = max - min;
  return (num - (num % den)) / den;
};

describe('CD3: bar length is floor((stat - statMin) * 50 / (statMax - statMin)), range from tuning', () => {
  it('the shipped range is 1 to 100, and the spec\'s examples hold: 58 is 28 px, 86 is 42, 100 is 50, 1 is 0', () => {
    expect(RANGE).toEqual({ min: 1, max: 100 });
    for (const [stat, px] of [[58, 28], [86, 42], [100, 50], [1, 0]] as const) {
      expect(statBarLength(stat, 1, 100), `stat ${stat}`).toBe(px);
      const e = programEntry(horse(1, { speed: stat, stamina: stat, kick: stat }), 58, rd, CLOTH_BY_POST[1], RANGE, false);
      const painted = paintRects(e.rects);
      for (const s of ENTRY.stats) expect(inkLength(painted, 58, s.barX), `${s.key} ${stat}`).toBe(px);
    }
  });

  it('every stat from 1 to 100 draws exactly the formula\'s length, in all three columns', () => {
    for (let stat = 1; stat <= 100; stat++) {
      const e = programEntry(horse(2, { speed: stat, stamina: stat, kick: stat }), 77, rd, CLOTH_BY_POST[2], RANGE, false);
      const painted = paintRects(e.rects);
      for (const x of [50, 118, 186]) expect(inkLength(painted, 77, x), `stat ${stat} at x${x}`).toBe(spec(stat, 1, 100));
    }
  });

  it('the length follows the range given, not 1 and 100: 58 in 0 to 200 is 14 px, in 50 to 60 is 40 px', () => {
    expect(statBarLength(58, 0, 200)).toBe(14);
    expect(statBarLength(58, 50, 60)).toBe(40);
    for (const [min, max] of [[0, 200], [50, 60], [1, 100], [10, 99]] as const) {
      for (let stat = min; stat <= max; stat++) expect(statBarLength(stat, min, max), `${stat} in ${min}-${max}`).toBe(spec(stat, min, max));
    }
    const e = programEntry(horse(3, { speed: 58, stamina: 58, kick: 58 }), 96, rd, CLOTH_BY_POST[3], { min: 0, max: 200 }, false);
    expect(inkLength(paintRects(e.rects), 96, 50)).toBe(14);
  });

  it('the Card reads the range from tuning.statRange in the game data', () => {
    const g = structuredClone(game);
    g.tuning.statRange.value = { min: 0, max: 200 };
    for (const row of rowsOf(g)) {
      const h = game.card.horses.find((x) => x.id === row.id)!;
      const painted = paintRects(row.rects);
      expect(inkLength(painted, row.top, 50)).toBe(spec(h.stats.speed, 0, 200));
      expect(inkLength(painted, row.top, 118)).toBe(spec(h.stats.stamina, 0, 200));
      expect(inkLength(painted, row.top, 186)).toBe(spec(h.stats.kick, 0, 200));
    }
  });

  it('the track is always 50 px: an Ash line on the middle row and a 1x3 Ash end stop in the 50th column, whatever the stat', () => {
    for (const stat of [1, 2, 25, 58, 86, 99]) {
      const e = programEntry(horse(4, { speed: stat, stamina: stat, kick: stat }), 115, rd, CLOTH_BY_POST[4], RANGE, false);
      const rows = barRows(paintRects(e.rects), 115, 50);
      const len = spec(stat, 1, 100);
      for (let k = 0; k < 50; k++) {
        if (k < len) {
          for (const dy of [11, 12, 13]) expect(rows[dy][k], `stat ${stat} k ${k} dy ${dy}`).toBe('Ink');
        } else {
          expect(rows[12][k], `stat ${stat} track k ${k}`).toBe('Ash');
          expect(rows[11][k], `stat ${stat} k ${k} above the track`).toBe(k === 49 ? 'Ash' : undefined);
          expect(rows[13][k], `stat ${stat} k ${k} below the track`).toBe(k === 49 ? 'Ash' : undefined);
        }
      }
      // Nothing beyond the 50th column, nothing before the first.
      const px = paintRects(e.rects);
      for (const dy of [11, 12, 13]) {
        expect(pixelAt(px, 49, 115 + dy)).toBeUndefined();
        expect(pixelAt(px, 100, 115 + dy)).toBeUndefined();
      }
    }
  });

  it('the track and its end stop are drawn at every stat, the full-length 100 included (the Ink fill covers them where it runs)', () => {
    for (const stat of [1, 58, 100]) {
      const e = programEntry(horse(4, { speed: stat, stamina: stat, kick: stat }), 0, rd, CLOTH_BY_POST[4], RANGE, false);
      for (const x of [50, 118, 186]) {
        expect(e.rects.some((r) => r.color === 'Ash' && r.x === x && r.w === 50 && r.h === 1 && r.y === 12), `track ${stat} ${x}`).toBe(true);
        expect(e.rects.some((r) => r.color === 'Ash' && r.x === x + 49 && r.w === 1 && r.h === 3 && r.y === 11), `stop ${stat} ${x}`).toBe(true);
      }
    }
    const full = paintRects(programEntry(horse(4, { speed: 100, stamina: 100, kick: 100 }), 0, rd, CLOTH_BY_POST[4], RANGE, false).rects);
    for (const dy of [11, 12, 13]) for (let k = 0; k < 50; k++) expect(pixelAt(full, 50 + k, dy)).toBe('Ink');
  });

  it('equal stats draw equal numbers and bars, whichever horses they belong to', () => {
    const g = structuredClone(game);
    for (const h of g.card.horses) if (h.post === 1 || h.post === 2) h.stats = { speed: 70, stamina: 70, kick: 70 };
    const [a, b] = rowsOf(g);
    const norm = (r: (typeof a)) => ({
      rects: r.rects.filter((x) => x.x >= 40).map((x) => ({ ...x, y: x.y - r.top })),
      numbers: r.texts.filter((t) => t.small).map((t) => [t.text, t.x, t.y - r.top, t.color]),
    });
    expect(norm(a)).toEqual(norm(b));
  });

  it('a stat one point apart may draw the same length, and the number tells them apart', () => {
    // Spec 4.1: at this scale 2 stat points are about 1 px, so neighbours can share a length: 3 and 4 both give 1 px.
    expect(statBarLength(3, 1, 100)).toBe(statBarLength(4, 1, 100));
    const a = programEntry(horse(1, { speed: 3, stamina: 3, kick: 3 }), 58, rd, CLOTH_BY_POST[1], RANGE, false);
    const b = programEntry(horse(1, { speed: 4, stamina: 4, kick: 4 }), 58, rd, CLOTH_BY_POST[1], RANGE, false);
    expect(inkLength(paintRects(a.rects), 58, 50)).toBe(inkLength(paintRects(b.rects), 58, 50));
    expect(a.texts.filter((t) => t.small).map((t) => t.text)).not.toEqual(b.texts.filter((t) => t.small).map((t) => t.text));
  });

  it('the printed number is the stat in two digits', () => {
    expect(statDigits(76)).toBe('76');
    expect(statDigits(99)).toBe('99');
    expect(statDigits(10)).toBe('10');
    // Under 10 the spec says only "2 digits": either "05" or " 5" reads as the number.
    expect(statDigits(5)).toHaveLength(2);
    expect(Number(statDigits(5))).toBe(5);
  });
});

describe('CD4: an entry is drawn from that horse and the stat range only', () => {
  const entryOf = (rows: ReturnType<typeof rowsOf>, id: string) => rows.find((r) => r.id === id)!;
  const normalized = (e: ReturnType<typeof entryOf>) => ({
    ...e,
    top: 0,
    cloth: { ...e.cloth, y: e.cloth.y - e.top },
    rects: e.rects.map((r) => ({ ...r, y: r.y - e.top })),
    texts: e.texts.map((t) => ({ ...t, y: t.y - e.top })),
    images: e.images.map((i) => ({ ...i, y: i.y - e.top })),
  });

  /** Variants of the card in which every horse but `keep` is different: stats, names, jockeys, styles, array order. */
  const variantsExcept = (keep: string): { label: string; g: typeof game }[] => {
    const edit = (label: string, f: (h: Horse, i: number) => void, reorder = false) => {
      const g = structuredClone(game);
      g.card.horses.forEach((h, i) => { if (h.id !== keep) f(h, i); });
      if (reorder) g.card.horses.reverse();
      return { label, g };
    };
    return [
      edit('every other stat 1', (h) => { h.stats = { speed: 1, stamina: 1, kick: 1 }; }),
      edit('every other stat 99', (h) => { h.stats = { speed: 99, stamina: 99, kick: 99 }; }),
      edit('other stats shuffled', (h, i) => { h.stats = { speed: 10 + ((i * 37) % 80), stamina: 90 - ((i * 13) % 70), kick: 20 + ((i * 29) % 60) }; }),
      edit('other names', (h, i) => { h.name = `Other Horse Number ${i}`.slice(0, 18); }),
      edit('other jockeys and styles', (h, i) => { h.jockey = `Rider ${i}`; h.style = (['frontRunner', 'stalker', 'closer'] as const)[(i + 1) % 3]; }),
      edit('card order reversed', () => undefined, true),
    ];
  };

  it('for every horse as the subject, nothing about the other seven changes its entry', () => {
    const all = rowsOf();
    for (const h of game.card.horses) {
      for (const { label, g } of variantsExcept(h.id)) {
        expect(normalized(entryOf(rowsOf(g), h.id)), `${h.id}: ${label}`).toEqual(normalized(entryOf(all, h.id)));
      }
    }
  });

  it('moving the card\'s own lowest and highest stats does not move any other horse\'s bar or number', () => {
    const lowest = game.card.horses.reduce((a, b) => (b.stats.speed < a.stats.speed ? b : a));
    const highest = game.card.horses.reduce((a, b) => (b.stats.speed > a.stats.speed ? b : a));
    const g = structuredClone(game);
    g.card.horses.find((h) => h.id === lowest.id)!.stats = { speed: 1, stamina: 1, kick: 1 };
    g.card.horses.find((h) => h.id === highest.id)!.stats = { speed: 99, stamina: 99, kick: 99 };
    const before = rowsOf();
    const after = rowsOf(g);
    for (const r of before) {
      if (r.id === lowest.id || r.id === highest.id) continue;
      expect(entryOf(after, r.id), r.id).toEqual(r);
    }
  });

  it('rows stay by post, whatever the stats say: stats rising and falling with the post change no order', () => {
    for (const dir of [1, -1]) {
      const g = structuredClone(game);
      for (const h of g.card.horses) { const v = 50 + dir * 5 * h.post; h.stats = { speed: v, stamina: v, kick: v }; }
      expect(rowsOf(g).map((r) => r.post)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    }
  });

  it('no entry carries a color or mark that depends on its stats: the colors are the cloth, Ink, Ash and Maroon, for any stats', () => {
    let seed = 12345;
    const rnd = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let n = 0; n < 40; n++) {
      const g = structuredClone(game);
      for (const h of g.card.horses) h.stats = { speed: 1 + Math.floor(rnd() * 99), stamina: 1 + Math.floor(rnd() * 99), kick: 1 + Math.floor(rnd() * 99) };
      for (const r of rowsOf(g)) {
        const cloth = CLOTH_BY_POST[r.post];
        expect(new Set(r.rects.map((x) => x.color)).size, 'no more colors than the cloth, Ink and Ash').toBeLessThanOrEqual(3);
        for (const c of r.rects.map((x) => x.color)) expect(['Ink', 'Ash', cloth.fill]).toContain(c);
        for (const c of r.texts.map((x) => x.color)) expect(['Ink', 'Maroon', cloth.number]).toContain(c);
        expect(r.texts).toHaveLength(6); // cloth number, name, style, three stat numbers: never a seventh mark
        expect(r.images).toEqual([]); // no tick without a last pick
        expect(Object.keys(r).sort()).toEqual(['cloth', 'id', 'images', 'post', 'rects', 'texts', 'top']); // no "best" flag, no rank
      }
    }
  });
});

describe('the highlighter band (DESIGN Program pages): four groups, chisel ends', () => {
  const entryShape = rd.program.entryBand.value;
  const resultShape = rd.program.resultBand.value;

  it('rows split into four groups as evenly as possible, extra rows to the top groups', () => {
    expect(bandGroups(19)).toEqual([5, 5, 5, 4]);
    expect(bandGroups(10)).toEqual([3, 3, 2, 2]);
    expect(bandGroups(8)).toEqual([2, 2, 2, 2]);
    expect(bandGroups(4)).toEqual([1, 1, 1, 1]);
    expect(bandGroups(5)).toEqual([2, 1, 1, 1]);
    expect(bandGroups(7)).toEqual([2, 2, 2, 1]);
    for (let rows = 4; rows < 40; rows++) expect(bandGroups(rows).reduce((a, b) => a + b, 0)).toBe(rows);
  });

  it('the shipped entry band is x16-250 over 19 rows with the DESIGN\'s chisel: left x19, 18, 17, 16 and right x250, 249, 248, 247', () => {
    expect(yellowSpans(paintRects(bandRects(entryShape, 100)))).toEqual(expectedSpans(100, ENTRY_BAND_ROWS));
  });

  it('the shipped result band is x5-250 over 10 rows: left x8, 7, 6, 5 and right x250, 249, 248, 247', () => {
    expect(yellowSpans(paintRects(bandRects(resultShape, 7)))).toEqual(expectedSpans(7, RESULT_BAND_ROWS));
  });

  it('the band is a solid Yellow run in every row, with straight top and bottom edges', () => {
    const rects = bandRects(entryShape, 40);
    expect(rects.every((r) => r.color === 'Yellow' && r.h === 1)).toBe(true);
    expect(rects.map((r) => r.y)).toEqual(Array.from({ length: 19 }, (_v, i) => 40 + i));
  });

  it('the band is cut from the numbers it is given, not from constants', () => {
    const shape = { x0: 10, x1: 60, rows: 8, leftSteps: [4, 2, 1, 0], rightSteps: [0, 1, 3, 5] };
    const spans = yellowSpans(paintRects(bandRects(shape, 0)));
    expect([...spans.values()]).toEqual([[14, 60], [14, 60], [12, 59], [12, 59], [11, 57], [11, 57], [10, 55], [10, 55]]);
  });

  it('the swipe\'s first frame cuts the band at the given end, with the chisel kept there and the left end as before', () => {
    const half = rd.program.swipeHalfX1.value;
    expect(half).toBe(132);
    const spans = yellowSpans(paintRects(bandRects(entryShape, 0, half)));
    expect([...spans.values()]).toEqual(ENTRY_BAND_ROWS.map(([a, b]): [number, number] => [a, half - (250 - b)]));
  });
});

describe('small helpers, from the spec\'s numbers', () => {
  it('a word right-aligned to x247: "Front" starts at x208, "Stalker" at x192, "Closer" at x200, "-" at x240', () => {
    expect(rightAlignedX('Front', 247)).toBe(208);
    expect(rightAlignedX('Stalker', 247)).toBe(192);
    expect(rightAlignedX('Closer', 247)).toBe(200);
    expect(rightAlignedX('-', 247)).toBe(240);
    expect(rightAlignedX('9 3/4', 247)).toBe(208);
    expect(rightAlignedX('nose', 247)).toBe(216);
  });

  it('a rule is 1 px of Ink across x8-247', () => {
    expect(rule(44)).toEqual({ x: 8, y: 44, w: 240, h: 1, color: 'Ink' });
  });

  it('the paper cursor is Yellow to Gold and Gold to Auburn; the "yours" marker prints Ink for both its Yellow and its Gold', () => {
    expect(PAPER_CURSOR_SWAPS.map((p) => [...p])).toEqual([['Yellow', 'Gold'], ['Gold', 'Auburn']]);
    expect(PAPER_MARKER_SWAPS.map((p) => [...p])).toEqual([['Yellow', 'Ink'], ['Gold', 'Ink']]);
  });
});
