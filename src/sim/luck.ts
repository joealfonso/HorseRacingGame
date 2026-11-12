import type { Tuning } from '../data/schema';
import type { RaceStreams } from './raceStreams';
import type { EventType } from './result';
import type { StreamName } from './streamNames';

// Racing luck: blocked, steadied, bumped, and nothing else. Every event is a moment of
// lost ground or momentum. None stops a horse, takes it out of the race or hurts it.
//
// Luck never invents a moment. Before the race each horse draws, per type, whether it is
// unlucky that way today and from which point on the course. During the race that only
// becomes an event if, within a short stretch from that point, the horse is actually in
// the situation: a horse right in front in its lane (blocked, steadied) or one at its side
// (bumped). If the stretch passes in the clear, the luck passes with it. So a horse that
// sits in traffic, or is told to hold the rail behind others, meets its luck more often.

const TYPES: readonly EventType[] = ['blocked', 'steadied', 'bumped'];
const STREAM: Record<EventType, StreamName> = { blocked: 'luckBlocked', steadied: 'luckSteadied', bumped: 'luckBumped' };

/** Per type, the feet from the gate from which this horse can have that event, or null if not this race. */
export type LuckDraws = Record<EventType, number | null>;

const RATE_FIELD: Record<EventType, 'blockedPerHorse' | 'steadiedPerHorse' | 'bumpedPerHorse'> = {
  blocked: 'blockedPerHorse',
  steadied: 'steadiedPerHorse',
  bumped: 'bumpedPerHorse',
};

// Validated data cannot get a bad rate here. Unvalidated data would otherwise turn luck
// off without a word (NaN is never above a draw) or fail on a bare TypeError, so say which.
const ratesOf = (tuning: Tuning): Record<EventType, number> => {
  const out = { blocked: 0, steadied: 0, bumped: 0 };
  for (const type of TYPES) {
    const rate: unknown = tuning.luck[RATE_FIELD[type]]?.value;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 1) {
      throw new Error(`tuning.luck.${RATE_FIELD[type]} must be a number from 0 to 1, not ${String(rate)}`);
    }
    out[type] = rate;
  }
  return out;
};

// Null with every rate at zero: no draws and nothing for the race to check, so a race
// without luck runs exactly as it did before luck existed.
export function drawLuck(tuning: Tuning, streams: RaceStreams, horseId: string, distanceFeet: number): LuckDraws | null {
  const rate = ratesOf(tuning);
  if (TYPES.every((t) => rate[t] === 0)) return null;
  const out: LuckDraws = { blocked: null, steadied: null, bumped: null };
  for (const type of TYPES) {
    // Both draws are always taken, so the count depends on nothing in the race.
    const draw = streams.get(STREAM[type], horseId);
    const chance = draw.float();
    const fromFeet = draw.float() * distanceFeet;
    out[type] = chance < rate[type] ? fromFeet : null;
  }
  return out;
}

/** What luck needs to see of a horse, and the two things an event changes. */
export interface Lucky {
  profile: { id: string; post: number; luck: LuckDraws | null };
  d: number;
  lane: number;
  v: number;
  /** Race seconds until which it is blocked: held back and unable to go around. */
  blockedUntil: number;
}

export interface LuckEvent {
  type: EventType;
  horse: string;
  otherHorse: string | null;
  seconds: number;
}

export interface Luck {
  /** A blocked horse runs at this share of the speed it wants. */
  blockedSpeedShare: number;
  /**
   * Turns the situations at this moment into events, up to the race's cap, and charges
   * each one's cost to the horses. Pass the horses still running, leader first, as they
   * stand at `seconds`.
   */
  at(running: readonly Lucky[], seconds: number): LuckEvent[];
}

export function makeLuck(horses: readonly Lucky[], tuning: Tuning, lengthFeet: number): Luck | null {
  if (horses.every((h) => h.profile.luck === null)) return null;
  const e = tuning.luck.events;
  if (e === undefined) throw new Error('tuning.luck.events is missing, and a luck rate is above zero');
  const cap = tuning.luck.maxEventsPerRace.value;
  const ahead = e.aheadLengths.value * lengthFeet;
  const sameLane = e.sameLaneWithinLanes.value;
  const alongside = e.alongsideLengths.value * lengthFeet;
  const adjacent = e.adjacentWithinLanes.value;
  const window = e.windowFeet.value;
  // Each type happens to a horse at most once, so its draw is used up when it does.
  const pending = new Map(horses.map((h) => [h, { ...h.profile.luck }]));
  let count = 0;
  // A horse takes part in at most one bump a race, on either side. Once it has, it cannot
  // be the other horse of a later bump, and its own bump luck is used up.
  const bumped = new Set<Lucky>();

  const inFront = (me: Lucky, field: readonly Lucky[]): Lucky | null =>
    field.find((o) => o !== me && o.d > me.d && o.d - me.d <= ahead && Math.abs(o.lane - me.lane) <= sameLane) ?? null;

  // The closest at its side, the lower post if two are as close.
  const atSide = (me: Lucky, field: readonly Lucky[], taken: ReadonlySet<Lucky>): Lucky | null => {
    let best: Lucky | null = null;
    for (const o of field) {
      if (o === me || bumped.has(o) || taken.has(o) || o.d <= 0 || Math.abs(o.d - me.d) > alongside || Math.abs(o.lane - me.lane) > adjacent) continue;
      const gap = Math.abs(o.d - me.d);
      if (best === null || gap < Math.abs(best.d - me.d) || (gap === Math.abs(best.d - me.d) && o.profile.post < best.profile.post)) best = o;
    }
    return best;
  };

  return {
    blockedSpeedShare: 1 - e.blockedSpeedDropShare.value,
    at(running, seconds) {
      const out: LuckEvent[] = [];
      // One thing at a time: a horse already in an event at this moment is left alone.
      const taken = new Set<Lucky>();
      for (const r of running) {
        if (count >= cap) break;
        const draws = pending.get(r);
        // Still in the gate (d is 0 until it breaks) or already part of an event now.
        if (draws === undefined || r.d <= 0 || taken.has(r)) continue;
        for (const type of TYPES) {
          const from = draws[type];
          if (type === 'bumped' && bumped.has(r)) continue;
          if (from === undefined || from === null || r.d < from || r.d > from + window) continue;
          const other = type === 'bumped' ? atSide(r, running, taken) : inFront(r, running);
          if (other === null) continue;
          draws[type] = null;
          count++;
          taken.add(r);
          if (type === 'blocked') r.blockedUntil = seconds + e.blockedSeconds.value;
          if (type === 'steadied') r.v *= 1 - e.steadiedSpeedDropShare.value;
          if (type === 'bumped') {
            // Both horses come off it a little slower.
            r.v *= 1 - e.bumpedSpeedDropShare.value;
            other.v *= 1 - e.bumpedSpeedDropShare.value;
            taken.add(other);
            bumped.add(r);
            bumped.add(other);
          }
          out.push({ type, horse: r.profile.id, otherHorse: type === 'bumped' ? other.profile.id : null, seconds });
          break;
        }
      }
      return out;
    },
  };
}
