import type { GameData } from '../data/schema';
import { makeChart, type Chart } from './chart';
import { furlongsToFeet, layCourse } from './course';
import { makeProfile } from './profile';
import { createRaceStreams } from './raceStreams';
import { simulate } from './simulate';
import { makeBias } from './trackBias';

// A diagnostic for scripts and tests, not part of a race result: each horse's reserve the
// moment it first reaches a given distance to go. It builds the race the same way runRace
// does, so for the same inputs and seed the finish is the same. runRace is not touched.

export interface ReserveReading {
  finish: Chart['finish'];
  pace: Chart['pace'];
  /** Thousandths of the reserve (1,000 at the gate), by horse id, in post order. */
  reserves: { id: string; post: number; reserve: number }[];
}

export function reserveAt(inputs: GameData, seed: number, feetToGo: number): ReserveReading {
  const streams = createRaceStreams(seed);
  const { track, race, tuning } = inputs;
  const horses = [...inputs.card.horses].sort((a, b) => a.post - b.post);
  const course = layCourse(track, furlongsToFeet(race.distanceFurlongs));
  const D = course.distanceFeet;
  if (!(feetToGo > 0 && feetToGo < D)) throw new Error(`feetToGo must be above 0 and below the race distance ${D}, got ${feetToGo}`);

  const profiles = horses.map((h) => makeProfile(h, race, tuning, streams, D));
  const watch = { atFeet: D - feetToGo, reserves: new Map<string, number>() };
  const { runs, events } = simulate(profiles, course, tuning, makeBias(race, tuning), watch);
  const { finish, pace } = makeChart(runs, events, course, race, tuning);
  const reserves = horses.map((h) => {
    const r = watch.reserves.get(h.id);
    if (r === undefined) throw new Error(`horse ${h.id} never reached ${feetToGo} feet to go`);
    return { id: h.id, post: h.post, reserve: Math.round(r * 1000) + 0 };
  });
  return { finish, pace, reserves };
}
