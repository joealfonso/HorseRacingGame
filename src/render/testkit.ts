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
