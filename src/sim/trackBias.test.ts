import { describe, expect, it, vi } from 'vitest';
import type { GameData, RunningStyle } from '../data/schema';
import type { RaceResult } from './result';
import { runRace } from './runRace';
import { mean, placeOf, report, seedRange, shipped, winnerId, withBias, withField, withTuning } from './testkit';

// I6: track bias. Each check runs the same field on the same seeds on a neutral track and on a
// biased one, and counts the wins of the horses the bias is meant to help. Fixed seeds, tolerances
// from tuning.
vi.setConfig({ testTimeout: 120_000 });

const base = shipped();
const SEEDS = seedRange(7000, base.tuning.checks.behaviorSeedCount.value);
// The closers bias moves a share of wins by about 2.6 points, which a 500-seed run shows by only a
// little over one noise width (one share moves about 1.5 points), so it gets the seed count the
// spec gives the fairness checks.
const MANY = seedRange(7000, 2000);
const TOL = base.tuning.checks.behaviorTolerancePoints.value / 100;

const runAll = (data: GameData, seeds = SEEDS): RaceResult[] => seeds.map((s) => runRace(data, s));
const share = (rs: RaceResult[], ids: string[]): number => rs.filter((r) => ids.includes(winnerId(r))).length / rs.length;
const meanPlace = (rs: RaceResult[], ids: string[]): number => mean(rs.flatMap((r) => ids.map((id) => placeOf(r, id))));

/** Mean lane (hundredths) over the samples where the horse is on a turn. */
function turnLane(r: RaceResult, id: string): number {
  const h = r.replay.horses.find((x) => x.id === id)!;
  const turns = r.replay.course.filter((c) => c.turn);
  return mean(h.lane.filter((_l, i) => turns.some((c) => h.distance[i] >= c.from && h.distance[i] < c.to)));
}

describe('I6: lane bias', () => {
  // Eight equal horses of one style. Which horses run closer to the rail is measured, on the
  // neutral track, from where they actually ran through the turns: the four nearest the rail are
  // the inside half, the other four the outside half.
  describe.each<RunningStyle>(['stalker', 'frontRunner'])('eight equal %ss', (style) => {
    const field = withField(base, Array.from({ length: 8 }, () => ({ style, speed: 70, stamina: 70, kick: 70 })));
    const neutral = runAll(field);
    const byLane = field.card.horses
      .map((h) => ({ id: h.id, lane: mean(neutral.map((r) => turnLane(r, h.id))) }))
      .sort((a, b) => a.lane - b.lane)
      .map((x) => x.id);
    const innerHalf = byLane.slice(0, 4);
    const outerHalf = byLane.slice(4);
    const inside = runAll(withBias(field, { lane: 'inside' }));
    const outside = runAll(withBias(field, { lane: 'outside' }));
    report(`I6 lane bias, ${style}: win share of the inner half (neutral / inside / outside), mean place likewise`, {
      innerHalf,
      share: [share(neutral, innerHalf), share(inside, innerHalf), share(outside, innerHalf)],
      place: [meanPlace(neutral, innerHalf), meanPlace(inside, innerHalf), meanPlace(outside, innerHalf)],
    });

    it('the horses nearest the rail by measurement are really nearer it than the others', () => {
      const lane = (ids: string[]) => mean(neutral.flatMap((r) => ids.map((id) => turnLane(r, id))));
      expect(lane(innerHalf)).toBeLessThan(lane(outerHalf));
    });

    it('inside bias: the horses running closer to the rail win more than on the neutral track', () => {
      expect(share(inside, innerHalf)).toBeGreaterThan(share(neutral, innerHalf) + TOL);
      expect(meanPlace(inside, innerHalf)).toBeLessThan(meanPlace(neutral, innerHalf));
    });

    it('outside bias is the mirror: the horses running farther from the rail win more than on the neutral track', () => {
      expect(share(outside, outerHalf)).toBeGreaterThan(share(neutral, outerHalf));
      expect(meanPlace(outside, outerHalf)).toBeLessThan(meanPlace(neutral, outerHalf));
      expect(share(outside, innerHalf)).toBeLessThan(share(neutral, innerHalf));
    });
  });
});

describe('I6: style bias', () => {
  const ids = (data: GameData, style: RunningStyle) => data.card.horses.filter((h) => h.style === style).map((h) => h.id);

  it('speed bias: the card\'s front-runners win more than on the neutral track', () => {
    const fr = ids(base, 'frontRunner');
    const neutral = share(runAll(base), fr);
    const speed = share(runAll(withBias(base, { style: 'speed' })), fr);
    report('I6 speed bias, shipped card front-runners win share (neutral / speed)', [neutral, speed]);
    expect(speed).toBeGreaterThan(neutral + TOL);
  });

  it('closers bias: the card\'s closers win more than on the neutral track', () => {
    const closers = ids(base, 'closer');
    const neutral = runAll(base, MANY);
    const biased = runAll(withBias(base, { style: 'closers' }), MANY);
    report('I6 closers bias, shipped card closers win share and mean place (neutral / closers)', {
      share: [share(neutral, closers), share(biased, closers)],
      place: [meanPlace(neutral, closers), meanPlace(biased, closers)],
    });
    expect(share(biased, closers)).toBeGreaterThan(share(neutral, closers) + TOL);
    expect(meanPlace(biased, closers)).toBeLessThan(meanPlace(neutral, closers));
  });
});

describe('I6: neutral changes nothing', () => {
  it('a neutral bias gives the same result whatever the trackBias strengths in tuning', () => {
    const rest = (r: RaceResult) => JSON.stringify({ ...r, inputs: null });
    const strong = withTuning(base, (t) => {
      t.trackBias!.laneSpeedShare.value = 0.1;
      t.trackBias!.drainShare.value = 0.9;
    });
    const some = seedRange(0, 40);
    expect(runAll(strong, some).map(rest)).toEqual(runAll(base, some).map(rest));
  });
});
