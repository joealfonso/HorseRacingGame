import type { Race, Tuning } from '../data/schema';
import { furlongsToFeet, type Course } from './course';
import { marginLabel } from './margins';
import type { Call, FinishEntry, Fraction, PaceLabel, Replay } from './result';
import type { Run } from './simulate';

// Turns the unrounded runs into the chart a race reader expects: finish order,
// margins, fractions, calls and the replay, in the result's whole-number units.

// "+ 0" turns -0 into 0. Math.round gives -0 for tiny negatives (two horses dead level),
// and -0 does not survive a JSON round trip as itself.
const hundredths = (x: number): number => Math.round(x * 100) + 0;
const thousandths = (x: number): number => Math.round(x * 1000) + 0;

export interface Chart {
  finish: FinishEntry[];
  photoFinish: boolean;
  fractions: Fraction[];
  pace: { halfMile: number; label: PaceLabel };
  calls: Call[];
  replay: Replay;
}

export function makeChart(runs: readonly Run[], course: Course, race: Race, tuning: Tuning): Chart {
  const dt = tuning.replayStepSeconds.value;
  const length = tuning.horseLengthFeet.value;
  const D = course.distanceFeet;
  const at = (run: Run, seconds: number) => distanceAt(run, seconds, dt);

  // Strict order even when two horses are level to the last bit: post breaks it.
  const order = [...runs].sort((a, b) => a.finishSeconds - b.finishSeconds || a.profile.post - b.profile.post);

  let beaten = 0;
  const finish: FinishEntry[] = order.map((run, i) => {
    if (i === 0) return { place: 1, id: run.profile.id, post: run.profile.post, time: hundredths(run.finishSeconds), margin: null, beatenLengths: 0 };
    const lengths = (D - at(run, order[i - 1].finishSeconds)) / length;
    beaten += lengths;
    const rounded = thousandths(lengths);
    return {
      place: i + 1,
      id: run.profile.id,
      post: run.profile.post,
      time: hundredths(run.finishSeconds),
      margin: { lengths: rounded, label: marginLabel(rounded / 1000, tuning.marginLabelBounds.value) },
      beatenLengths: thousandths(beaten),
    };
  });
  const second = finish[1].margin;
  const photoFinish = second !== null && second.lengths < thousandths(tuning.photoFinishThresholdLengths.value);

  // Fractions are named from the gate (the quarter, the half), poles from the wire.
  const leaderAt = (feet: number) => Math.min(...runs.map((r) => crossing(r, feet, dt)));
  const fractions: Fraction[] = [];
  for (let f = 2; f < race.distanceFurlongs; f += 2) fractions.push({ furlongs: f, time: hundredths(leaderAt(furlongsToFeet(f))) });
  fractions.push({ furlongs: race.distanceFurlongs, time: finish[0].time });

  const calls: Call[] = [];
  for (let toGo = Math.ceil(race.distanceFurlongs) - 1; toGo >= 1; toGo--) {
    const seconds = leaderAt(D - furlongsToFeet(toGo));
    const placed = runs
      .map((r) => ({ run: r, d: at(r, seconds) }))
      .sort((a, b) => b.d - a.d || a.run.profile.post - b.run.profile.post);
    calls.push({
      furlongsToGo: toGo,
      time: hundredths(seconds),
      horses: placed.map((p, i) => ({ id: p.run.profile.id, position: i + 1, lengthsBehind: thousandths((placed[0].d - p.d) / length) })),
    });
  }

  const halfMile = hundredths(leaderAt(furlongsToFeet(4)));
  const par = tuning.paceParHalfMile[String(race.distanceFurlongs)]?.[race.going];
  if (par === undefined) throw new Error(`tuning.paceParHalfMile has no par for ${race.distanceFurlongs} furlongs on ${race.going}`);
  const label: PaceLabel = halfMile < hundredths(par.value.hotUnderSeconds) ? 'hot'
    : halfMile > hundredths(par.value.slowOverSeconds) ? 'slow' : 'honest';

  const byPost = [...runs].sort((a, b) => a.profile.post - b.profile.post);
  const wireSeconds = order[0].finishSeconds;
  const replay: Replay = {
    step: hundredths(dt),
    course: course.segments.map((s) => ({ from: hundredths(s.from), to: hundredths(s.to), turn: s.turn })),
    horses: byPost.map((r) => ({
      id: r.profile.id,
      post: r.profile.post,
      distance: r.distances.map(hundredths),
      lane: r.lanes.map(hundredths),
      finishTime: hundredths(r.finishSeconds),
      extraGround: hundredths(r.extraGround),
    })),
    wireFrame: {
      time: hundredths(wireSeconds),
      horses: byPost.map((r) => ({ id: r.profile.id, distance: hundredths(at(r, wireSeconds)), lane: hundredths(laneAt(r, wireSeconds, dt)) })),
    },
    events: [],
  };

  return { finish, photoFinish, fractions, pace: { halfMile, label }, calls, replay };
}

// Positions between samples are straight lines, the same way finish moments are found.
function sampleAt(values: readonly number[], seconds: number, dt: number): number {
  const i = Math.floor(seconds / dt);
  if (i >= values.length - 1) return values[values.length - 1];
  const f = (seconds - i * dt) / dt;
  return values[i] + (values[i + 1] - values[i]) * f;
}

const distanceAt = (run: Run, seconds: number, dt: number) => sampleAt(run.distances, seconds, dt);
const laneAt = (run: Run, seconds: number, dt: number) => sampleAt(run.lanes, seconds, dt);

function crossing(run: Run, feet: number, dt: number): number {
  const d = run.distances;
  for (let i = 1; i < d.length; i++) {
    if (d[i] >= feet) return (i - 1) * dt + (dt * (feet - d[i - 1])) / (d[i] - d[i - 1]);
  }
  throw new Error(`a horse never reached ${feet} feet`);
}
