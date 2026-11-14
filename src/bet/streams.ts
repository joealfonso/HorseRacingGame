import { checkSeed, createStream, type Stream } from '../sim/rng';
import { STREAM_NAMES } from '../sim/streamNames';

// The betting stream names (spec "Odds: how they work"), each keyed by the day seed. Never
// rename one, only add, and none may equal a sim stream name (DT2).
export const BET_STREAM_NAMES = ['fieldDraw', 'raceSeed', 'estimateSeeds', 'crowd'] as const;
export type BetStreamName = (typeof BET_STREAM_NAMES)[number];

for (const name of BET_STREAM_NAMES) {
  if ((STREAM_NAMES as readonly string[]).includes(name)) throw new Error(`betting stream "${name}" is also a sim stream name`);
}

export const MAX_SEED = 4294967295;

/** Sub-key of the `fieldDraw` stream for the day's whole arrangement, before any race's posts. */
export const DAY_SUB_KEY = 'day';

/** A betting stream for one race of a day (sub-key the race number, 1 up), or for the whole day. */
export function betStream(daySeed: number, name: BetStreamName, race: number | typeof DAY_SUB_KEY): Stream {
  return createStream(daySeed, name, String(race));
}

/** DT1: the next day's seed, wrapping after 4294967295. */
export function nextDaySeed(daySeed: number): number {
  checkSeed(daySeed);
  return daySeed === MAX_SEED ? 0 : daySeed + 1;
}

/** The seed the real race runs on. */
export function raceSeedOf(daySeed: number, race: number): number {
  return betStream(daySeed, 'raceSeed', race).int(0, MAX_SEED);
}

/**
 * `count` distinct estimate seeds, never the real race's seed. The first k of a longer list are
 * the list for k, so the estimate at a smaller N is a prefix of the one at a larger N.
 */
export function estimateSeedsOf(daySeed: number, race: number, count: number): number[] {
  const stream = betStream(daySeed, 'estimateSeeds', race);
  const seen = new Set<number>([raceSeedOf(daySeed, race)]);
  const out: number[] = [];
  while (out.length < count) {
    const seed = stream.int(0, MAX_SEED);
    if (seen.has(seed)) continue;
    seen.add(seed);
    out.push(seed);
  }
  return out;
}
