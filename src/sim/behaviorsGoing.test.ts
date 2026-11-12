import { describe, expect, it, vi } from 'vitest';
import type { GameData } from '../data/schema';
import type { RaceResult } from './result';
import { runRace } from './runRace';
import { mean, report, seedRange, shipped, winnerId, withRace } from './testkit';

// B8 and B9: going and the clock. Fixed seeds, tolerances from tuning.
vi.setConfig({ testTimeout: 120_000 });

const base = shipped();
const SEEDS = seedRange(3000, base.tuning.checks.behaviorSeedCount.value);
// The shipped card on fast going, shared by B8 and B9.
const fast = SEEDS.map((s) => runRace(base, s));

describe('B8: going', () => {
  const meanWin = (rs: RaceResult[]) => mean(rs.map((r) => r.finish[0].time));
  const cache = new Map<string, RaceResult[]>();
  const onGoing = (going: string, seeds = SEEDS) => {
    const key = `${going}/${seeds.length}`;
    if (!cache.has(key)) cache.set(key, seeds.map((s) => runRace(withRace(base, (r) => { r.going = going; }), s)));
    return cache.get(key)!;
  };

  it('the baseline is fast going', () => expect(base.race.going).toBe('fast'));

  it.each(['good', 'muddy', 'sloppy'])('winning times on %s are slower than on fast by the amount in tuning', (going) => {
    const added = base.tuning.goingTimeAddedPercent[going as 'good'].value;
    const slow = onGoing(going);
    const measured = (meanWin(slow) / meanWin(fast) - 1) * 100;
    report(`B8 ${going}: tuning adds ${added} percent`, { measured, fastMean: meanWin(fast), slowMean: meanWin(slow) });
    expect(meanWin(slow)).toBeGreaterThan(meanWin(fast));
    expect(Math.abs(measured - added)).toBeLessThanOrEqual(0.1); // percentage points
  });

  it('the slower the going the slower the time: fast, good, muddy, sloppy', () => {
    const means = ['fast', 'good', 'muddy', 'sloppy'].map((g) => meanWin(onGoing(g)));
    for (let i = 1; i < means.length; i++) expect(means[i]).toBeGreaterThan(means[i - 1]);
  });

  it('the going follows tuning: doubling a going\'s percent in tuning doubles its slowing', () => {
    const doubled: GameData = structuredClone(base);
    doubled.tuning.goingTimeAddedPercent.sloppy.value *= 2;
    doubled.race.going = 'sloppy';
    const some = SEEDS.slice(0, 200);
    const measured = (meanWin(some.map((s) => runRace(doubled, s))) / meanWin(fast.slice(0, 200)) - 1) * 100;
    expect(Math.abs(measured - 2 * base.tuning.goingTimeAddedPercent.sloppy.value)).toBeLessThanOrEqual(0.15);
  });

  // 2000 seeds: the same seed on fast and on sloppy, each horse's win share compared. Going
  // aptitude is not in the stat set, so no horse should gain or lose more than the tolerance.
  it('going does not favor any horse: on sloppy each horse\'s win share is within the tolerance of its share on fast', () => {
    const seeds = seedRange(3000, 2000);
    const tolerance = base.tuning.checks.behaviorTolerancePoints.value;
    const a = onGoing('fast', seeds);
    const b = onGoing('sloppy', seeds);
    const diffs = base.card.horses.map((h) => {
      const share = (rs: RaceResult[]) => (100 * rs.filter((r) => winnerId(r) === h.id).length) / seeds.length;
      return [h.id, share(b) - share(a)] as const;
    });
    report('B8 sloppy minus fast win share (points) per horse, 2000 seeds', diffs.map(([id, d]) => `${id}:${d.toFixed(1)}`).join(' '));
    for (const [id, d] of diffs) expect(Math.abs(d), id).toBeLessThanOrEqual(tolerance);
  });
});

describe('B9: realistic clock', () => {
  const band = base.tuning.checks.winningTimeBandSeconds.value;

  it('on fast dirt over 10 furlongs the median winning time is in the band from tuning', () => {
    expect(base.race.going).toBe('fast');
    expect(base.race.distanceFurlongs).toBe(10);
    const times = fast.map((r) => r.finish[0].time / 100).sort((x, y) => x - y);
    const median = (times[249] + times[250]) / 2;
    report('B9 winning time, seconds', { median, fastest: times[0], slowest: times[499], band });
    expect(median).toBeGreaterThanOrEqual(band.min);
    expect(median).toBeLessThanOrEqual(band.max);
  });

  it('the band is a real two-minute race (T1): the band itself sits between 1:55 and 2:10', () => {
    expect(band.min).toBeGreaterThan(115);
    expect(band.max).toBeLessThan(130);
  });

  it('no single winning time is absurd: every one is between 1:50 and 2:15 (110 to 135 seconds)', () => {
    for (const r of fast) {
      const t = r.finish[0].time / 100;
      expect(t).toBeGreaterThan(110);
      expect(t).toBeLessThan(135);
    }
  });
});
