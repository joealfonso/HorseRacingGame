import type { RaceDay } from '../data/raceDaySchema';
import { fillTemplate } from '../data/template';
import { marginLabel } from '../sim/margins';
import type { RaceResult } from '../sim/result';
import { formatClock, formatFraction, marginPhrase, ordersShort, ordinal } from './format';
import { INK, PAPER, SECOND_INK, bandRects, rightAlignedX, rule, type PageRect } from './page';
import { FEET_PER_FURLONG, raceDistance, sampleAt } from './view';

// The result screen (spec 4.6), as pure functions of the result and your horse. Every
// word on it comes from the result: the order of finish and its margins from
// `result.finish`, the trip from `result.calls`, `result.finish` and `replay.events`, the
// orders from `result.inputs.card`, the time, pace and splits from the result, and the
// seed from `result.seed`. The session record ("Today 4-1-1-0") is not built (spec 13).
// It is drawn as the chart page of the program (spec 4.6, DESIGN Program pages): flat
// Parchment, Ink type, Ink rules where the old box edges were, the margin column in Maroon.

/** No framed boxes on the chart page: the 8 px where the frame tiles were stays as margin. */
export const RESULT_BOXES: readonly { x: number; y: number; tilesW: number; tilesH: number }[] = [];
/** Ink rules where the box edges were (spec 4.6). */
export const RESULT_RULES = [103, 175] as const;

/** Columns of an order row (spec 4.6): marker, place, saddlecloth box, name, margin (Maroon, last cell ending at x247). */
export const RESULT_ROW = { y: 8, dy: 11, marker: 8, place: 16, cloth: 42, clothSize: 10, name: 56, marginLastX: 247 } as const;
export const RESULT_TRIP = { x: 8, y: 112, dy: 11 } as const;
export const RESULT_TIME = { x: 8, y: 184, dy: 12, right: 248 } as const;
/** The cursor uses all 8 columns of x8-15, so the label starts 4 px past its cell (DESIGN, HUD). */
export const RESULT_NEXT = { cursorX: 8, x: 20, y: 220 } as const;
const MAIN_W = 8;
const SMALL_W = 4;
/** The small font's 5-row glyphs sit 2 rows lower than the main font's capitals, so they share a baseline. */
const SMALL_DY = 2;

type Copy = RaceDay['copy']['result'];

// Trip lines ---------------------------------------------------------------------------

/** Trip line 2 (RS2): "Won by a nose", "Won by 1 1/4 lengths", "2nd, beaten a nose", "8th, beaten 23 lengths". */
export function tripFinish(result: RaceResult, rd: RaceDay, playerId: string): string {
  const copy = rd.copy;
  const mine = result.finish.find((f) => f.id === playerId);
  if (!mine) return '';
  if (mine.place === 1) {
    const second = result.finish[1];
    return fillTemplate(copy.result.won, { margin: marginPhrase(second?.margin?.label ?? '', copy) });
  }
  const label = marginLabel(mine.beatenLengths / 1000, result.inputs.tuning.marginLabelBounds.value);
  return fillTemplate(copy.result.beaten, { place: ordinal(mine.place), margin: marginPhrase(label, copy) });
}

/**
 * The early call: the first call at least a quarter mile from the gate (on the shipped
 * 10-furlong course, the 8-furlongs-to-go call). Undefined when the race has none.
 */
export function earlyCall(result: RaceResult) {
  const quarterFromGate = result.inputs.race.distanceFurlongs - 2;
  return result.calls.find((c) => c.furlongsToGo <= quarterFromGate + 1e-9);
}

/** Trip line 3: "7th early, 4th at the 1/4", "Led early, led at the 1/4", from `result.calls`. */
export function tripCalls(result: RaceResult, rd: RaceDay, playerId: string): string {
  const c = rd.copy.result;
  const at = (call: RaceResult['calls'][number] | undefined, led: string, other: string) => {
    const p = call?.horses.find((h) => h.id === playerId)?.position;
    return p === undefined ? null : p === 1 ? led : fillTemplate(other, { place: ordinal(p) });
  };
  const parts = [
    at(earlyCall(result), c.earlyLed, c.early),
    at(result.calls.find((x) => x.furlongsToGo === 2), c.quarterLed, c.quarter),
  ].filter((x): x is string => x !== null);
  return parts.join(c.callsJoiner);
}

/** A pole's name by whole furlongs to the wire: "wire", "1/8", "3/8", "1/2", "mile", "1 1/8". */
export function poleName(furlongsToGo: number, copy: Copy): string {
  if (furlongsToGo <= 0) return copy.poles.wire;
  const whole = Math.floor(furlongsToGo / 8);
  const rest = furlongsToGo % 8;
  const g = (a: number, b: number): number => (b === 0 ? a : g(b, a % b));
  const frac = rest === 0 ? '' : `${rest / g(rest, 8)}/${8 / g(rest, 8)}`;
  if (whole === 0) return frac;
  if (rest === 0) return whole === 1 ? copy.poles.mile : String(whole);
  return `${whole} ${frac}`;
}

/** Your horse's events, in the order they happened: as the horse, or as the other horse in a bump. */
export const playerEvents = (result: RaceResult, playerId: string) =>
  result.replay.events.filter((e) => e.horse === playerId || e.otherHorse === playerId);

/**
 * Where an event was: "at the start" inside the first furlong from the gate, otherwise
 * "near the" the furlong pole nearest your horse at the event's time, from the replay.
 */
export function eventWhere(result: RaceResult, rd: RaceDay, playerId: string, time: number): string {
  const c = rd.copy.result;
  const h = result.replay.horses.find((x) => x.id === playerId);
  const d = h ? sampleAt(h.distance, result.replay.step, time) : 0;
  const furlong = FEET_PER_FURLONG * 100;
  if (d < furlong) return c.start;
  const toGo = Math.max(0, Math.round((raceDistance(result) - d) / furlong));
  return fillTemplate(c.near, { pole: poleName(toGo, c) });
}

/** Trip line 4 (RS3): "Clean trip", the first event and where, or "A rough trip, 2 setbacks". */
export function tripLuck(result: RaceResult, rd: RaceDay, playerId: string): string {
  const c = rd.copy.result;
  const events = playerEvents(result, playerId);
  if (events.length === 0) return c.clean;
  if (events.length >= 2) return fillTemplate(c.rough, { count: events.length });
  const e = events[0];
  const where = eventWhere(result, rd, playerId, e.time);
  if (e.type === 'bumped') {
    const other = e.horse === playerId ? e.otherHorse : e.horse;
    const n = result.replay.horses.find((h) => h.id === other)?.post ?? 0;
    return fillTemplate(c.bumped, { n, where });
  }
  return fillTemplate(e.type === 'blocked' ? c.blocked : c.steadied, { where });
}

/** Trip line 5 (RS5): the orders the sim actually ran, from `result.inputs.card`. */
export function tripOrders(result: RaceResult, rd: RaceDay, playerId: string): string {
  const h = result.inputs.card.horses.find((x) => x.id === playerId);
  return fillTemplate(rd.copy.result.orders, { orders: h ? ordersShort(h.instructions, rd.copy.orders) : rd.copy.orders.allDefault });
}

/** The five trip lines: name, finish, calls, luck, orders. */
export function tripLines(result: RaceResult, rd: RaceDay, playerId: string): string[] {
  const name = result.inputs.card.horses.find((h) => h.id === playerId)?.name ?? '';
  return [name, tripFinish(result, rd, playerId), tripCalls(result, rd, playerId), tripLuck(result, rd, playerId), tripOrders(result, rd, playerId)];
}

// The screen ----------------------------------------------------------------------------

export type ResultColor = 'Ink' | 'Maroon';
export interface ResultText { text: string; x: number; y: number; color: ResultColor; small?: boolean }

export interface ResultRow {
  place: number;
  id: string;
  post: number;
  yours: boolean;
  /** Your arrow marker's top-left (drawn in Ink on the band), on your row only. */
  marker: { x: number; y: number } | null;
  /** The 10x10 saddlecloth box (1 px Ink border, cloth fill) and its small-font number. */
  cloth: { x: number; y: number; size: number; numberX: number; numberY: number };
  texts: ResultText[];
}

export interface ResultScreen {
  boxes: typeof RESULT_BOXES;
  /** Flat full-screen paper. */
  paper: string;
  rules: PageRect[];
  /** The highlighter band under your order row, one rect per row. Drawn first. */
  band: PageRect[];
  rows: ResultRow[];
  /** The trip (its heading in Maroon), the time lines, the seed and Next race. */
  texts: ResultText[];
  cursor: { x: number; y: number };
}

/** A number right-aligned to end before `right` (exclusive), in cells of `w` px. */
const rightAt = (text: string, right: number, w = MAIN_W) => right - w * text.length;

export function resultScreen(result: RaceResult, rd: RaceDay, playerId: string): ResultScreen {
  const copy = rd.copy.result;
  const R = RESULT_ROW;
  const nameOf = new Map(result.inputs.card.horses.map((h) => [h.id, h.name]));
  let band: PageRect[] = [];
  const rows: ResultRow[] = result.finish.map((f, i) => {
    const y = R.y + R.dy * i;
    const yours = f.id === playerId;
    const margin = f.margin?.label ?? copy.winnerMargin;
    const clothY = y - 1;
    // Your row: the band from 1 row above the row's 8 to 1 below.
    if (yours) band = bandRects(rd.program.resultBand.value, y - 1);
    return {
      place: f.place,
      id: f.id,
      post: f.post,
      yours,
      marker: yours ? { x: R.marker, y } : null,
      cloth: { x: R.cloth, y: clothY, size: R.clothSize, numberX: R.cloth + 3, numberY: clothY + 2 },
      texts: [
        { text: ordinal(f.place), x: R.place, y, color: INK },
        { text: nameOf.get(f.id) ?? f.id, x: R.name, y, color: INK },
        { text: margin, x: rightAlignedX(margin, R.marginLastX), y, color: SECOND_INK },
      ],
    };
  });

  const texts: ResultText[] = tripLines(result, rd, playerId)
    .map((text, i) => ({ text, x: RESULT_TRIP.x, y: RESULT_TRIP.y + RESULT_TRIP.dy * i, color: i === 0 ? SECOND_INK : INK }));

  const T = RESULT_TIME;
  const winner = result.finish[0];
  texts.push({ text: fillTemplate(copy.time, { time: formatClock(winner.time, true), pace: copy.pace[result.pace.label] }), x: T.x, y: T.y, color: INK });
  const splits = result.fractions.slice(0, -1).map((f) => formatFraction(f.time)).join(' ');
  texts.push({ text: copy.splits, x: T.x, y: T.y + T.dy, color: INK });
  texts.push({ text: splits, x: T.x + MAIN_W * (copy.splits.length + 1), y: T.y + T.dy + SMALL_DY, color: INK, small: true });
  // The seed, right-aligned on the third line, its number in the small font (spec 13, item 11).
  const seed = String(result.seed);
  const seedX = rightAt(seed, T.right, SMALL_W);
  texts.push({ text: copy.seed, x: seedX - MAIN_W * (copy.seed.length + 1), y: T.y + 2 * T.dy, color: INK });
  texts.push({ text: seed, x: seedX, y: T.y + 2 * T.dy + SMALL_DY, color: INK, small: true });
  texts.push({ text: copy.next, x: RESULT_NEXT.x, y: RESULT_NEXT.y, color: INK });

  return {
    boxes: RESULT_BOXES,
    paper: PAPER,
    rules: RESULT_RULES.map((y) => rule(y)),
    band,
    rows,
    texts,
    cursor: { x: RESULT_NEXT.cursorX, y: RESULT_NEXT.y },
  };
}

/** The keys that choose Next race (spec 4.6). */
export const RESULT_CONFIRM_KEYS: readonly string[] = ['Enter', 'NumpadEnter', 'Space', 'KeyZ'];
