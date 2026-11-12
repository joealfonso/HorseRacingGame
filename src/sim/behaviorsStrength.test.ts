import { describe, expect, it, vi } from 'vitest';
import type { RunningStyle } from '../data/schema';
import { runRace } from './runRace';
import { equalSpecs, mean, placeOf, positionAt, report, seedRange, shipped, winShare, withField, withRace, type Spec } from './testkit';

// B1 to B3: what strength, stamina over distance, and kick do to results. Fixed seeds,
// so the numbers are the same every run. Tolerances come from tuning.
vi.setConfig({ testTimeout: 60_000 });

const base = shipped();
const SEEDS = seedRange(1000, base.tuning.checks.behaviorSeedCount.value);
const TOL = base.tuning.checks.behaviorTolerancePoints.value / 100;
const FAIR = 1 / 8;
const STYLES: RunningStyle[] = ['stalker', 'frontRunner', 'closer'];
const EDGE = 10;
const X = 't4'; // the horse that gets the edge, on post 4

const edged = (style: RunningStyle, change: Partial<Spec>, level = 70): Spec[] => {
  const specs = equalSpecs(8, style, level);
  specs[3] = { ...specs[3], ...change };
  return specs;
};

describe('B1: strength matters, but does not decide', () => {
  it('uses the seed count and tolerance from tuning', () => {
    expect(SEEDS).toHaveLength(500);
    expect(TOL).toBeGreaterThan(0);
  });

  describe.each(STYLES)('a field of 8 equal %s horses', (style) => {
    it.each(['speed', 'stamina'] as const)(`+${EDGE} ${'%s'} lifts the win share above 1 in 8 by more than the tolerance`, (stat) => {
      const share = winShare(withField(base, edged(style, { [stat]: 70 + EDGE })), SEEDS, X);
      report(`B1 ${style} +${EDGE} ${stat}`, share);
      expect(share).toBeGreaterThan(FAIR + TOL);
    });
  });

  it('the same horse with no edge wins about 1 in 8 (so the lift above is the edge, not the setup)', () => {
    const share = winShare(withField(base, equalSpecs(8, 'stalker')), SEEDS, X);
    report('B1 stalker no edge', share);
    expect(Math.abs(share - FAIR)).toBeLessThanOrEqual(base.tuning.checks.fairnessTolerancePoints.value / 100);
  });

  it(`a horse ${EDGE} better in every stat is a clear favorite that still loses some races`, () => {
    const share = winShare(withField(base, edged('stalker', { speed: 70 + EDGE, stamina: 70 + EDGE, kick: 70 + EDGE })), SEEDS, X);
    report(`B1 stalker +${EDGE} all`, share);
    expect(share).toBeGreaterThan(FAIR + TOL);
    expect(share).toBeLessThan(1);
  });
});

describe('B2: stamina matters more at a distance', () => {
  const cache = new Map<number, number>();
  const gain = (furlongs: number): number => {
    if (cache.has(furlongs)) return cache.get(furlongs)!;
    const data = withRace(base, (r) => { r.distanceFurlongs = furlongs; });
    const edge = winShare(withField(data, edged('stalker', { stamina: 70 + EDGE })), SEEDS, X);
    const none = winShare(withField(data, equalSpecs(8, 'stalker')), SEEDS, X);
    report(`B2 stamina +${EDGE} at ${furlongs}f`, { edge, none, gain: edge - none });
    cache.set(furlongs, edge - none);
    return edge - none;
  };

  it('the win-share gain from a stamina edge is larger at 10 furlongs than at 6, by more than the tolerance', () => {
    const long = gain(10);
    const short = gain(6);
    expect(long).toBeGreaterThan(short + TOL);
  });

  it('a stamina edge helps at 10 furlongs', () => {
    expect(gain(10)).toBeGreaterThan(TOL);
  });

  it('the sim runs every whole distance from 5 to 12 furlongs (more in edgeCases.test.ts)', () => {
    for (let d = 5; d <= 12; d++) {
      expect(() => runRace(withRace(base, (r) => { r.distanceFurlongs = d; }), 1)).not.toThrow();
    }
  });
});

describe('B3: kick shows late', () => {
  // Positions gained between the quarter pole (2 furlongs to go) and the wire.
  const lateGain = (specs: Spec[]) => {
    const data = withField(base, specs);
    return mean(SEEDS.map((s) => {
      const r = runRace(data, s);
      return positionAt(r, 2, X) - placeOf(r, X);
    }));
  };

  it.each(STYLES)(`a %s with +${EDGE} kick gains more positions late than the same horse without`, (style) => {
    const withKick = lateGain(edged(style, { kick: 70 + EDGE }));
    const without = lateGain(equalSpecs(8, style));
    report(`B3 ${style} +${EDGE} kick`, { withKick, without });
    expect(withKick).toBeGreaterThan(without);
  });
});
