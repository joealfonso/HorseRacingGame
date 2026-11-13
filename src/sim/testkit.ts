// Small helpers shared by the M1.3 tests. Test support only: nothing in the sim imports
// this file. Kept free of anything the sim lint bans, so it lints like the rest of src/sim/.
import { loadData } from '../data/load';
import type { GameData, Horse, RunningStyle, Tuning } from '../data/schema';
import type { RaceResult, ReplayHorse } from './result';
import { runRace } from './runRace';

/** A fresh, validated copy of the shipped data that a test may edit freely. */
export const shipped = (): GameData => structuredClone(loadData());

export const seedRange = (start: number, count: number): number[] => Array.from({ length: count }, (_v, i) => start + i);

export const bytes = (r: RaceResult): string => JSON.stringify(r);

export const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
};

export interface Spec {
  style: RunningStyle;
  speed: number;
  stamina: number;
  kick: number;
}

/** The shipped data with the card replaced by these horses, ids t1.., posts 1.. in the order given. */
export function withField(base: GameData, specs: Spec[]): GameData {
  const data = structuredClone(base);
  const proto: Horse = structuredClone(data.card.horses[0]);
  data.card.horses = specs.map((s, i) => ({
    ...structuredClone(proto),
    id: `t${i + 1}`,
    name: `Test Horse ${i + 1}`,
    post: i + 1,
    style: s.style,
    stats: { speed: s.speed, stamina: s.stamina, kick: s.kick },
  }));
  return data;
}

export const equalSpecs = (n: number, style: RunningStyle, stat = 70): Spec[] =>
  Array.from({ length: n }, () => ({ style, speed: stat, stamina: stat, kick: stat }));

export const withTuning = (base: GameData, edit: (t: Tuning) => void): GameData => {
  const data = structuredClone(base);
  edit(data.tuning);
  return data;
};

export const withRace = (base: GameData, edit: (r: GameData['race']) => void): GameData => {
  const data = structuredClone(base);
  edit(data.race);
  return data;
};

export const winnerId = (r: RaceResult): string => r.finish[0].id;
export const placeOf = (r: RaceResult, id: string): number => r.finish.find((f) => f.id === id)!.place;
export const callAt = (r: RaceResult, furlongsToGo: number) => r.calls.find((c) => c.furlongsToGo === furlongsToGo)!;
export const positionAt = (r: RaceResult, furlongsToGo: number, id: string): number =>
  callAt(r, furlongsToGo).horses.find((h) => h.id === id)!.position;

export const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Run each seed and collect a number from each result. */
export const measure = (data: GameData, seeds: number[], pick: (r: RaceResult) => number): number[] =>
  seeds.map((s) => pick(runRace(data, s)));

/** The share of these seeds that this horse wins. */
export function winShare(data: GameData, seeds: number[], id: string): number {
  return seeds.filter((s) => winnerId(runRace(data, s)) === id).length / seeds.length;
}

/** Distance of a horse at a time in hundredths of a second, by straight lines between samples. */
export function distanceAt(h: ReplayHorse, step: number, time: number): number {
  const i = Math.min(Math.floor(time / step), h.distance.length - 2);
  const f = (time - i * step) / step;
  return h.distance[i] + (h.distance[i + 1] - h.distance[i]) * f;
}

/** The time in hundredths a horse first reaches a distance, or null if the samples never do. */
export function timeReaching(h: ReplayHorse, step: number, distance: number): number | null {
  for (let i = 1; i < h.distance.length; i++) {
    if (h.distance[i] >= distance) {
      const a = h.distance[i - 1];
      const b = h.distance[i];
      return (i - 1) * step + (b === a ? 0 : ((distance - a) / (b - a)) * step);
    }
  }
  return null;
}

/** Every leaf of a plain value with its path. Throws on anything that is not plain JSON data. */
export function leaves(value: unknown, path = '$'): [string, unknown][] {
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new Error(`${path}: not a plain object`);
    return Object.entries(value).flatMap(([k, v]) => leaves(v, `${path}.${k}`));
  }
  return [[path, value]];
}

/** Problems with a leaf that JSON would change or drop: undefined, NaN, Infinity, -0, functions, symbols, bigint. */
export function badLeaves(value: unknown): string[] {
  const bad: string[] = [];
  for (const [path, v] of leaves(value)) {
    const ok =
      v === null || typeof v === 'string' || typeof v === 'boolean' ||
      (typeof v === 'number' && Number.isFinite(v) && !Object.is(v, -0));
    if (!ok) bad.push(`${path}: ${String(v)}`);
  }
  return bad;
}

/** Prints a measured number when TEST_REPORT=1, so a reader can see how far a check passed by. Silent otherwise. */
export function report(label: string, ...values: unknown[]): void {
  if (process.env.TEST_REPORT === '1') console.log(`REPORT ${label}`, ...values);
}

/** A quick whole-result check for edge cases: a list of what is wrong, empty when the result is sound. */
export function problems(r: RaceResult): string[] {
  const out: string[] = [...badLeaves(r)];
  const n = r.inputs.card.horses.length;
  const t = r.inputs.tuning;
  const wire = r.inputs.race.distanceFurlongs * 66000;
  if (r.finish.length !== n) out.push(`finish has ${r.finish.length} horses, not ${n}`);
  r.finish.forEach((f, i) => {
    if (f.place !== i + 1) out.push(`place ${f.place} at index ${i}`);
    if (!Number.isInteger(f.time)) out.push(`time ${f.time} is not whole`);
    if (i > 0 && f.time < r.finish[i - 1].time) out.push(`time goes down at place ${f.place}`);
    if ((f.margin === null) !== (i === 0)) out.push(`margin null-ness wrong at place ${f.place}`);
  });
  if (new Set(r.finish.map((f) => f.id)).size !== n) out.push('a horse appears twice in the finish');
  for (const h of r.replay.horses) {
    const f = r.finish.find((x) => x.id === h.id);
    if (!f || f.time !== h.finishTime) out.push(`replay finish moment of ${h.id} is ${h.finishTime}, result says ${f?.time}`);
    for (let i = 1; i < h.distance.length; i++) {
      if (h.distance[i] < h.distance[i - 1]) { out.push(`${h.id} goes backwards at sample ${i}`); break; }
    }
    if (h.lane.some((l) => l < 0 || l > t.laneMax.value * 100)) out.push(`${h.id} leaves the lane bounds`);
    if (h.distance[h.distance.length - 1] < wire) out.push(`${h.id} has not reached the wire by the last sample`);
  }
  const w = r.replay.wireFrame;
  const winner = w.horses.find((h) => h.id === r.finish[0].id);
  if (!winner || w.horses.some((h) => h.distance > winner.distance)) out.push('a horse is ahead of the winner in the wire frame');
  return out;
}

export type Instructions = Horse['instructions'];

/** A copy of the data with one horse given instructions (the others keep theirs). */
export function withInstructions(base: GameData, id: string, instructions: Partial<Instructions>): GameData {
  const data = structuredClone(base);
  const horse = data.card.horses.find((h) => h.id === id)!;
  horse.instructions = { ...horse.instructions, ...instructions };
  return data;
}

/** A copy of the data with the race's track bias set. */
export function withBias(base: GameData, bias: Partial<GameData['race']['trackBias']>): GameData {
  return withRace(base, (r) => { r.trackBias = { ...r.trackBias, ...bias }; });
}
