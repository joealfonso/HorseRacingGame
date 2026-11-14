import { createStream } from '../sim/rng';

// The betting stream names (spec "Odds: how they work"). Each is keyed by the day seed with
// the race number as sub-key. Never rename one, only add, and none may equal a sim stream name.
export const BET_STREAM_NAMES = ['fieldDraw', 'raceSeed', 'estimateSeeds', 'crowd'] as const;
export type BetStreamName = (typeof BET_STREAM_NAMES)[number];

const MAX_SEED = 4294967295;

export function betStream(daySeed: number, name: BetStreamName, race: number) {
  return createStream(daySeed, name, String(race));
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
