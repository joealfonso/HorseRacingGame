import type { Tuning } from '../data/schema';
import { furlongsToFeet, isTurnAt, type Course } from './course';
import { steer } from './lanes';
import type { Profile } from './profile';
import { earlyEffort } from './tactics';

// One horse's run, in feet, seconds and lanes, unrounded.
export interface Run {
  profile: Profile;
  /** Feet from the gate along the rail, one per replay step from time 0. */
  distances: number[];
  lanes: number[];
  finishSeconds: number;
  /** Feet run beyond the rail path up to the wire, from running wide on the turns. */
  extraGround: number;
}

interface Runner extends Run {
  d: number;
  v: number;
  lane: number;
  reserve: number;
  away: boolean;
  asked: boolean;
  finished: boolean;
}

const power = (x: number, n: number): number => {
  let out = 1;
  for (let i = 0; i < n; i++) out *= x;
  return out;
};

// Front first, then by post, so ties and input order never decide anything.
const byPosition = (a: Runner, b: Runner): number => b.d - a.d || a.profile.post - b.profile.post;

export function simulate(profiles: readonly Profile[], course: Course, tuning: Tuning): Run[] {
  const m = tuning.model;
  const dt = tuning.replayStepSeconds.value;
  const length = tuning.horseLengthFeet.value;
  const laneMax = tuning.laneMax.value;
  const D = course.distanceFeet;
  const R = course.turnRadiusFeet;
  const laneFeet = m.laneWidthFeet.value;
  // A wider field squeezes into the lanes there are at the gate.
  const gateSpacing = Math.min(1, laneMax / Math.max(1, profiles.length - 1));

  const runners: Runner[] = [...profiles]
    .sort((a, b) => a.post - b.post)
    .map((profile) => {
      const lane = (profile.post - 1) * gateSpacing;
      return {
        profile, distances: [0], lanes: [lane], finishSeconds: 0, extraGround: 0,
        d: 0, v: 0, lane, reserve: 1, away: false, asked: false, finished: false,
      };
    });

  // Nothing in the model lets a horse stop, so this only trips on a bug. Better an
  // error than a race that never ends or a partial result.
  const maxSteps = Math.ceil(D / dt);

  for (let k = 1; runners.some((r) => !r.finished); k++) {
    if (k > maxSteps) throw new Error(`race did not finish within ${maxSteps} steps`);
    const t = k * dt;
    const running = runners.filter((r) => !r.finished).sort(byPosition);
    const leader = running[0];
    const second = running.length > 1 ? running[1] : null;

    for (const r of running) {
      const p = r.profile;
      if (t <= p.breakSeconds) continue;

      r.asked ||= D - r.d <= p.askFeetToGo;
      const effort = r.asked
        ? 1 + p.kickBoost
        : earlyEffort({
          style: p.style,
          isLeader: r === leader,
          behindLeader: (leader.d - r.d) / length,
          clearOfSecond: second === null ? Infinity : (leader.d - second.d) / length,
        }, tuning);
      let target = p.cruise * effort;
      const tireBelow = m.tireBelowReserveShare.value;
      if (r.reserve < tireBelow) {
        const empty = m.emptySpeedShare.value;
        target = Math.min(target, p.cruise * (empty + ((1 - empty) * r.reserve) / tireBelow));
      }
      // After the tiring cap, so tired horses still differ from stride to stride.
      target *= rhythmAt(p.rhythm, r.d);

      const others = running.filter((o) => o !== r);
      const s = steer(r, others, target, tuning, length);
      r.lane = s.lane;
      // Caught wide on a turn with a horse alongside on the inside, a rider takes back a
      // touch to drop in behind it, which costs less than going round wide. Not on a
      // straight, where wide costs nothing, not on the lead and not once asked.
      if (s.shutOut && !r.asked && r !== leader && isTurnAt(course, r.d)) target *= 1 - m.tuckInEffortDrop.value;

      const accel = !r.away ? m.startAccelFeetPerSecondSquared.value
        : r.asked ? p.kickAccel : m.settleAccelFeetPerSecondSquared.value;
      if (r.v < target) r.v = Math.min(target, r.v + accel * dt);
      else r.v = Math.max(target, r.v - m.fadeFeetPerSecondSquared.value * dt);
      if (r.v >= target) r.away = true;
      if (s.heldTo !== null) r.v = Math.min(r.v, s.heldTo);

      // Once asked, the kick is a higher gear: its extra speed costs no more per second
      // than cruising did. What it can use is still limited by what is left.
      const gear = r.asked ? p.cruise * (1 + p.kickBoost) : p.cruise;
      const aerobic = m.aerobicShare.value;
      const excess = Math.max(0, r.v / gear - aerobic) / (1 - aerobic);
      r.reserve = Math.max(0, r.reserve - (dt * power(excess, m.drainPower.value)) / p.endurance);
    }

    for (const r of runners) {
      if (r.finished) r.v = Math.max(0, r.v - m.gallopOutFeetPerSecondSquared.value * dt);
      const ground = r.v * dt;
      // On a turn a horse out from the rail runs a bigger circle for the same progress.
      const progress = isTurnAt(course, r.d) ? (ground * R) / (R + r.lane * laneFeet) : ground;
      const next = r.d + progress;
      if (!r.finished) {
        // On the rail ground * R / R can land a hair under ground, which would make a
        // tiny negative here. Running wide never shortens a trip, so it floors at 0.
        const wide = Math.max(0, ground - progress);
        r.extraGround += wide;
        if (next >= D) {
          const share = (D - r.d) / progress;
          r.finishSeconds = (k - 1) * dt + dt * share;
          r.extraGround -= (1 - share) * wide;
          r.finished = true;
        }
      }
      r.d = next;
      r.distances.push(r.d);
      r.lanes.push(r.lane);
    }
  }

  return runners.map(({ profile, distances, lanes, finishSeconds, extraGround }) =>
    ({ profile, distances, lanes, finishSeconds, extraGround }));
}

function rhythmAt(points: readonly number[], feet: number): number {
  const at = feet / furlongsToFeet(1);
  const i = Math.min(points.length - 2, Math.floor(at));
  const f = Math.min(1, at - i);
  return points[i] + (points[i + 1] - points[i]) * f;
}
