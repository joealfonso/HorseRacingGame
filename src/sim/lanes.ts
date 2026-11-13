import type { Tuning } from '../data/schema';

export interface Body {
  d: number;
  lane: number;
  v: number;
}

export interface Steer {
  lane: number;
  /** The speed of a horse right in front that this one cannot get past, or null. */
  heldTo: number | null;
  /** A horse level or in front is alongside on the inside, so the rail is shut for now. */
  shutOut: boolean;
}

// One lane is one horse wide, so two horses less than a lane apart overlap.
const OVERLAP = 1;

// Every horse wants the rail, because the rail is the shortest way round. It moves in
// when nobody is alongside on its inside, and goes around a horse in front that is
// clearly slower than it wants to go when nobody is alongside on its outside. Otherwise
// it sits, and if it is right on that horse's heels it is held to its speed.
// Holding the rail (blocked) it never goes around: it sits and waits. A horse told to stay
// inside is given a larger passMarginShare, so it goes around only a horse that is well
// slower than it wants to go, not one it could sit behind.
export function steer(
  me: Body, others: readonly Body[], wantSpeed: number, tuning: Tuning, lengthFeet: number,
  holdRail = false, passMarginShare = tuning.model.traffic.value.passMarginShare,
): Steer {
  const t = tuning.model.traffic.value;
  const step = tuning.model.lanesPerSecond.value * tuning.replayStepSeconds.value;
  const laneMax = tuning.laneMax.value;
  const clear = t.clearLengths * lengthFeet;
  const look = t.passLookLengths * lengthFeet;

  let ahead: Body | null = null;
  for (const o of others) {
    const gap = o.d - me.d;
    if (gap > 0 && gap <= look && Math.abs(o.lane - me.lane) < OVERLAP && (ahead === null || o.d < ahead.d)) ahead = o;
  }
  const heldTo = ahead !== null && ahead.d - me.d < t.blockLengths * lengthFeet ? ahead.v : null;

  // Is anyone alongside within one lane on this side? With fromLevel, only a horse
  // level with this one or in front counts.
  const blocked = (side: 1 | -1, fromLevel = false) =>
    others.some((o) => {
      const gap = o.d - me.d;
      const across = (o.lane - me.lane) * side;
      return gap > (fromLevel ? 0 : -clear) && gap < clear && across > 0 && across < OVERLAP + step;
    });

  if (ahead !== null && !holdRail && wantSpeed > ahead.v * (1 + passMarginShare)) {
    const out = me.lane < laneMax && !blocked(1) ? Math.min(laneMax, me.lane + step) : me.lane;
    return { lane: out, heldTo, shutOut: false };
  }
  const inside = me.lane > 0 && !blocked(-1) ? Math.max(0, me.lane - step) : me.lane;
  // Only worth taking back for a horse level or in front: one behind will drop away.
  return { lane: inside, heldTo, shutOut: me.lane > 0 && blocked(-1, true) };
}
