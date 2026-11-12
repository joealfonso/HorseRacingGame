import type { GameData } from '../data/schema';
import { makeChart } from './chart';
import { furlongsToFeet, layCourse } from './course';
import { echo } from './echo';
import { makeProfile } from './profile';
import { createRaceStreams } from './raceStreams';
import { UNITS, type RaceResult } from './result';
import { simulate } from './simulate';
import { makeBias } from './trackBias';

// Bump whenever a change means the same inputs and seed give a different result,
// and say why in the PR. The golden results are pinned to it.
// 2: luck events (M1.5). The same inputs with a luck rate above zero now give a different race.
export const SIM_VERSION = 2;

// One race from validated data and a seed. Reads nothing else, changes nothing it is
// given and keeps nothing afterwards, so the same call always gives the same result.
export function runRace(inputs: GameData, seed: number): RaceResult {
  const streams = createRaceStreams(seed);
  const { track, race, tuning } = inputs;
  const horses = [...inputs.card.horses].sort((a, b) => a.post - b.post);
  const course = layCourse(track, furlongsToFeet(race.distanceFurlongs));

  const profiles = horses.map((h) => makeProfile(h, race, tuning, streams, course.distanceFeet));
  const { runs, events } = simulate(profiles, course, tuning, makeBias(race, tuning));
  const chart = makeChart(runs, events, course, race, tuning);

  return {
    simVersion: SIM_VERSION,
    seed: seed + 0, // a seed of -0 is seed 0, and -0 would not survive a JSON round trip
    units: { ...UNITS }, // a copy, so a caller editing one result cannot touch the next
    inputs: echo({ track, race, card: { ...inputs.card, horses }, tuning }),
    ...chart,
  };
}
