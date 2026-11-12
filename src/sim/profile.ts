import type { Horse, Race, RunningStyle, Tuning } from '../data/schema';
import { furlongsToFeet } from './course';
import { ordersFor, type Orders } from './instructions';
import { drawLuck, type LuckDraws } from './luck';
import type { RaceStreams } from './raceStreams';

// What one horse brings to this race: its stats turned into speeds and a reserve,
// plus every random number it will use. All draws happen here, in a fixed count per
// stream, so nothing later in the race (or a later system) can shift them.
export interface Profile {
  id: string;
  post: number;
  style: RunningStyle;
  /** Feet per second at an effort of 1, with distance, going and today's form in. */
  cruise: number;
  /** Seconds at cruise before the reserve is empty. */
  endurance: number;
  kickBoost: number;
  kickAccel: number;
  askFeetToGo: number;
  breakSeconds: number;
  /** Speed wobble at each furlong from the gate, interpolated between. */
  rhythm: number[];
  rate: Orders['rate'];
  /** Moving before its usual point: only this share of the kick's gear until this many feet to go. */
  earlyMove: { untilFeetToGo: number; gearShare: number } | null;
  stayInside: boolean;
  /** Null when every luck rate is zero. */
  luck: LuckDraws | null;
}

// -1 to 1, bell-shaped: the mean of three draws, so form near zero is common.
const bell = (draw: () => number): number => (draw() + draw() + draw() - 1.5) / 1.5;
const spread = (draw: () => number): number => draw() * 2 - 1;

export function makeProfile(horse: Horse, race: Race, tuning: Tuning, streams: RaceStreams, distanceFeet: number): Profile {
  const m = tuning.model;
  const { speed, stamina, kick } = horse.stats;
  const sub = horse.id;

  const formDraw = streams.get('form', sub);
  // Speed and reserve vary apart: a horse can be sharp today and still not last.
  const formSpeed = bell(() => formDraw.float());
  const formReserve = bell(() => formDraw.float());

  const breakSeconds = streams.get('gateBreak', sub).float() * m.gateBreakMaxSeconds.value;

  const kickDraw = streams.get('kick', sub);
  const askJitter = spread(() => kickDraw.float()) * m.askSpreadFeet.value;
  const kickJitter = 1 + spread(() => kickDraw.float()) * m.kickSpreadShare.value;

  const rhythmDraw = streams.get('rhythm', sub);
  const points = Math.ceil(distanceFeet / furlongsToFeet(1)) + 1;
  const rhythm = Array.from({ length: points }, () => 1 + spread(() => rhythmDraw.float()) * m.rhythmSpreadShare.value);

  const distance = 1 + m.distanceSpeed.value.sharePerFurlong * (m.distanceSpeed.value.referenceFurlongs - race.distanceFurlongs);
  const goings: Record<string, { value: number }> = tuning.goingTimeAddedPercent;
  if (!Object.hasOwn(goings, race.going)) throw new Error(`tuning.goingTimeAddedPercent has no entry for going "${race.going}"`);
  const going = 1 + goings[race.going].value / 100;
  const line = (l: { base: number; perPoint: number }, stat: number) => l.base + l.perPoint * stat;
  const orders = ordersFor(horse, tuning, distanceFeet);

  const usualAsk = m.askFeetToGo.value[horse.style] + askJitter;
  // Never below zero: a horse with very little kick has no extra gear, it does not slow when asked.
  const kickBoost = Math.max(0, line(m.kickBoostShare.value, kick)) * kickJitter;

  const profile: Profile = {
    id: horse.id,
    post: horse.post,
    style: horse.style,
    cruise: (line(m.cruiseFeetPerSecond.value, speed) * distance * (1 + m.formSpeedShare.value * formSpeed)) / going,
    endurance: line(m.enduranceSeconds.value, stamina) * (1 + m.formReserveShare.value * formReserve),
    kickBoost: orders.extraKick === null ? kickBoost : kickBoost + orders.extraKick,
    kickAccel: line(m.kickAccelFeetPerSecondSquared.value, kick),
    // An order to move or wait replaces the usual point and its jitter: the rider does as told.
    // The jitter is still drawn above, so the kick stream's count does not change.
    askFeetToGo: orders.askFeetToGo ?? usualAsk,
    breakSeconds,
    rhythm,
    rate: orders.rate,
    earlyMove: orders.earlyMoveGearShare === null ? null : { untilFeetToGo: usualAsk, gearShare: orders.earlyMoveGearShare },
    stayInside: orders.stayInside,
    luck: drawLuck(tuning, streams, sub, distanceFeet),
  };
  // Validation should stop bad tuning first. If something gets past it, fail loudly
  // rather than run a race with a NaN reserve or an infinite speed.
  // Nested objects and arrays too: a NaN inside rate or earlyMove must not pass quietly.
  const check = (key: string, value: unknown): void => {
    if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) {
      throw new Error(`horse ${horse.id}: ${key} is ${value}, check tuning.json`);
    }
    if (typeof value === 'object' && value !== null) Object.entries(value).forEach(([k, v]) => check(`${key}.${k}`, v));
  };
  Object.entries(profile).forEach(([key, value]) => check(key, value));
  return profile;
}
