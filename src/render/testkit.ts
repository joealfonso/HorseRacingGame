// Test support for the race-day view tests. Nothing in the game imports this file.
// It holds the shipped data, cached real races from the sim, and a few helpers whose
// expected values come from the spec, never from the code under test.
import { loadData } from '../data/load';
import { loadRaceDay } from '../data/raceDayLoad';
import type { RaceDay, Slot } from '../data/raceDaySchema';
import type { GameData } from '../data/schema';
import type { RaceResult } from '../sim/result';
import { runRace } from '../sim/runRace';
import type { ArtFacts } from './raceFrame';
import { viewConfig } from './view';

export const game: GameData = loadData();
export const shippedRaceDay = loadRaceDay(game);
export const rd: RaceDay = shippedRaceDay.raceDay;
export const cfg = viewConfig(rd);

const slot = (id: string): Slot => {
  const s = shippedRaceDay.slots.slots.find((x) => x.id === id);
  if (!s) throw new Error(`testkit: no slot ${id} in slots.json`);
  return s;
};

/** Art facts read from the slot data, as the scene reads them. */
export const art: ArtFacts = {
  gallopFrames: slot('art.race.horse.body.gallop').frames ?? 1,
  noseX: slot('art.race.horse.body.gallop').noseX ?? 31,
  standTileWidth: slot('art.race.bg.mid.grandstand').frameWidth ?? 32,
  poleWidth: slot('art.race.pole.furlong').frameWidth ?? 4,
  wirePoleWidth: slot('art.race.pole.wire').frameWidth ?? 8,
  // Step 2 slots, read from the slot data as the scene reads them.
  walkFrames: slot('art.race.horse.body.walk').frames ?? 1,
  crowdTileWidth: slot('art.race.bg.mid.crowd').frameWidth ?? 16,
  infieldTileWidth: slot('art.race.bg.mid.infield').frameWidth ?? 32,
  infieldFillWidth: slot('art.race.bg.mid.infield').fillSlice?.[1],
  flagAt: slot('art.race.ambient.flag').attachAt ?? [0, 0],
  flagWidth: slot('art.race.ambient.flag').frameWidth ?? 8,
};

const cache = new Map<number, RaceResult>();
/** A real race from the shipped data. Cached: results are never edited. */
export function race(seed: number): RaceResult {
  let r = cache.get(seed);
  if (!r) {
    r = runRace(game, seed);
    cache.set(seed, r);
  }
  return r;
}

export const seeds = (count: number, start = 0): number[] => Array.from({ length: count }, (_v, i) => start + i);

export const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
};

/** Linear interpolation of a replay track at race time t, written from the spec (3.5). */
export function interp(values: readonly number[], step: number, t: number): number {
  if (t <= 0) return values[0];
  const i = Math.floor(t / step);
  if (i >= values.length - 1) return values[values.length - 1];
  const f = (t - i * step) / step;
  return values[i] + (values[i + 1] - values[i]) * f;
}

/** Race distance in hundredths of a foot: furlongs * 660 feet * 100. */
export const raceDistanceOf = (r: RaceResult): number => r.inputs.race.distanceFurlongs * 660 * 100;

/** Playback second of race time t, from the data's beats and speed (spec 3.4 and 8). */
export const playbackSecond = (t: number): number =>
  rd.beats.pickSeconds.value + rd.beats.gateStillSeconds.value + t / 100 / rd.playback.speed.value;

/** The earliest moment any horse reaches `distance`, hundredths, by linear interpolation of the samples. */
export function reachTime(r: RaceResult, distance: number): number {
  let best = Infinity;
  for (const h of r.replay.horses) {
    for (let i = 0; i < h.distance.length; i++) {
      if (h.distance[i] < distance) continue;
      const t = i === 0 ? 0 : (i - 1) * r.replay.step + (r.replay.step * (distance - h.distance[i - 1])) / (h.distance[i] - h.distance[i - 1]);
      best = Math.min(best, t);
      break;
    }
  }
  return best;
}

/** True when a screen x is an integer. */
export const whole = (n: number): boolean => Number.isInteger(n);

export const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * A copy of the result that is identical up to the sample after race time t (hundredths)
 * and different after it: later replay samples, events, calls, finish entries, the pace
 * and the photo flag. The AN3 method: whatever the screen shows at t must not change.
 */
export function scrambleAfter(r: RaceResult, t: number): RaceResult {
  const c = structuredClone(r) as Mutable<RaceResult>;
  const { step } = r.replay;
  const k = Math.floor(t / step) + 1; // the sample after t
  const cut = k * step;
  const ids = r.replay.horses.map((h) => h.id);
  const other = (id: string) => ids[(ids.indexOf(id) + 3) % ids.length];

  for (const h of c.replay.horses) {
    for (let i = k + 1; i < h.distance.length; i++) {
      h.distance[i] += 900 * (i - k) + ((i * 7919) % 400);
      h.lane[i] = (h.lane[i] + 350 + i) % 800;
    }
  }
  c.replay.events = c.replay.events.map((e) =>
    e.time > cut ? { ...e, type: e.type === 'blocked' ? 'steadied' : 'blocked', horse: other(e.horse), otherHorse: null, time: e.time } : e,
  );
  c.calls = c.calls.map((call) =>
    call.time > cut
      ? { ...call, horses: [...call.horses].reverse().map((h, i) => ({ id: h.id, position: i + 1, lengthsBehind: h.lengthsBehind + 777 })) }
      : call,
  );
  // Rotate the ids among the entries that finish after the cut, so the finish stays a permutation.
  const later = c.finish.filter((f) => f.time > cut).map((f) => f.id);
  const rotated = [...later.slice(1), ...later.slice(0, 1)];
  let n = 0;
  c.finish = c.finish.map((f) =>
    f.time > cut ? { ...f, id: rotated[n++], time: f.time + 3, margin: { lengths: 9, label: 'nose' }, beatenLengths: f.beatenLengths + 5 } : f,
  );
  const halfCall = r.calls.find((x) => x.furlongsToGo === 4)!;
  if (t < halfCall.time) c.pace = { halfMile: r.pace.halfMile + 123, label: r.pace.label === 'hot' ? 'slow' : 'hot' };
  if (r.finish[0].time > cut) c.photoFinish = !r.photoFinish;
  return c;
}

// Program pages (spec 4.1, 4.2, 4.6; DESIGN "Program pages") ------------------------------
// Expected values below are written from the spec and DESIGN, never read back from page.ts.

/** A page as pixels: rects painted in the order given, later over earlier. Key is "x,y". */
export function paintRects(rects: readonly { x: number; y: number; w: number; h: number; color: string }[], into = new Map<string, string>()): Map<string, string> {
  for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) into.set(`${x},${y}`, r.color);
  return into;
}
export const pixelAt = (px: Map<string, string>, x: number, y: number): string | undefined => px.get(`${x},${y}`);

/** DESIGN Jockeys and silks: saddlecloth fill and number color by program number. */
export const CLOTH_BY_POST: Record<number, { fill: string; number: string }> = {
  1: { fill: 'Red', number: 'Bone' },
  2: { fill: 'Bone', number: 'Ink' },
  3: { fill: 'Royal', number: 'Bone' },
  4: { fill: 'Yellow', number: 'Ink' },
  5: { fill: 'Emerald', number: 'Bone' },
  6: { fill: 'Coal', number: 'Yellow' },
  7: { fill: 'Orange', number: 'Ink' },
  8: { fill: 'Pink', number: 'Ink' },
};

/**
 * DESIGN "Highlighter band": per row of the band, the first and last Yellow column.
 * Card and Orders entry: x16-250, 19 rows, left x19, 18, 17, 16 and right x250, 249, 248, 247
 * for rows 0-4, 5-9, 10-14, 15-18. Result row: x5-250, 10 rows, left x8, 7, 6, 5 and right
 * x250, 249, 248, 247 for rows 0-2, 3-5, 6-7, 8-9.
 */
export const ENTRY_BAND_ROWS: [number, number][] = [
  ...Array.from({ length: 5 }, (): [number, number] => [19, 250]),
  ...Array.from({ length: 5 }, (): [number, number] => [18, 249]),
  ...Array.from({ length: 5 }, (): [number, number] => [17, 248]),
  ...Array.from({ length: 4 }, (): [number, number] => [16, 247]),
];
export const RESULT_BAND_ROWS: [number, number][] = [
  ...Array.from({ length: 3 }, (): [number, number] => [8, 250]),
  ...Array.from({ length: 3 }, (): [number, number] => [7, 249]),
  ...Array.from({ length: 2 }, (): [number, number] => [6, 248]),
  ...Array.from({ length: 2 }, (): [number, number] => [5, 247]),
];

/** The Yellow pixels of a painted page, as [first, last] column per row y, for the rows that have any. */
export function yellowSpans(px: Map<string, string>): Map<number, [number, number]> {
  const spans = new Map<number, [number, number]>();
  const cells = [...px].filter(([, c]) => c === 'Yellow').map(([k]) => k.split(',').map(Number));
  for (const [x, y] of cells) {
    const s = spans.get(y);
    if (!s) spans.set(y, [x, x]);
    else spans.set(y, [Math.min(s[0], x), Math.max(s[1], x)]);
  }
  // Every row of a band is one solid run: a hole would be a bug the span would hide.
  for (const [y, [a, b]] of spans) for (let x = a; x <= b; x++) if (px.get(`${x},${y}`) !== 'Yellow') throw new Error(`hole in the band at ${x},${y}`);
  return spans;
}

/** The span table a band of `top` and these row columns must paint. */
export const expectedSpans = (top: number, rows: [number, number][]): Map<number, [number, number]> =>
  new Map(rows.map((r, i): [number, [number, number]] => [top + i, r]));

/** The cell a string occupies: 8 x 8 in the main font, 4 x 6 in the small. */
export const cellOf = (t: { text: string; x: number; y: number; small?: boolean }) =>
  ({ x0: t.x, x1: t.x + (t.small ? 4 : 8) * t.text.length - 1, y0: t.y, y1: t.y + (t.small ? 6 : 8) - 1 });
