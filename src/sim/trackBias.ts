import type { Race, Tuning } from '../data/schema';

// A biased track, as two plain functions the tick loop calls. Each is null on a neutral
// track, and the loop then skips it, so a neutral race does the same arithmetic as before
// bias existed.
export interface Bias {
  /** Ground gained per stride, as a factor, for a horse in this lane. */
  ground: ((lane: number) => number) | null;
  /** Reserve drain, as a factor, for a horse this many lengths behind the leader. */
  drain: ((behindLeader: number) => number) | null;
}

export function makeBias(race: Race, tuning: Tuning): Bias {
  const { lane, style } = race.trackBias;
  if (lane === 'neutral' && style === 'neutral') return { ground: null, drain: null };
  const t = tuning.trackBias;
  if (t === undefined) throw new Error('the race has a track bias but tuning.trackBias is missing');

  // How close to the rail (lane) or the lead (style), 1 right there, 0 at the width and beyond.
  const near = (x: number, width: number) => Math.max(0, 1 - x / width);
  const share = t.laneSpeedShare.value;
  const lanes = t.laneWidthLanes.value;
  const drain = t.drainShare.value;
  const front = t.frontLengths.value;

  return {
    ground: lane === 'inside' ? (l) => 1 + share * near(l, lanes)
      : lane === 'outside' ? (l) => 1 + share * (1 - near(l, lanes)) : null,
    // A speed-favoring track lets the pace hold up; a closers' track makes it cost more.
    drain: style === 'speed' ? (b) => 1 - drain * near(b, front)
      : style === 'closers' ? (b) => 1 + drain * near(b, front) : null,
  };
}
