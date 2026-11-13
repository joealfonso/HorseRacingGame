import { describe, expect, it, vi } from 'vitest';
import type { RunningStyle } from '../data/schema';
import { runRace } from './runRace';
import { equalSpecs, report, seedRange, shipped, withField } from './testkit';

// B7, the fairness half: on a neutral track with equal horses, post position stays within the
// fairness tolerance (F2). Fixed seeds.
vi.setConfig({ testTimeout: 120_000 });

const base = shipped();
const FAIR_TOL = base.tuning.checks.fairnessTolerancePoints.value;
const STYLES: RunningStyle[] = ['stalker', 'frontRunner', 'closer'];

describe('B7: post position', () => {
  // The spec ties this to F2 (10,000 races, plus or minus 2.5 points). At 500 seeds the noise on one
  // post's share is about 1.5 points, so 500 seeds cannot hold a 2.5 point band for eight posts.
  // 2000 seeds is used instead (noise about 0.7 points), chosen before looking at results.
  describe('on a neutral track with equal horses, each post wins within the fairness tolerance of 1 in 8', () => {
    it.each(STYLES)('eight equal %s horses', (style) => {
      const data = withField(base, equalSpecs(8, style));
      expect(data.race.trackBias).toEqual({ lane: 'neutral', style: 'neutral' });
      const n = 2000;
      const wins = Array<number>(8).fill(0);
      for (const s of seedRange(9000, n)) wins[runRace(data, s).finish[0].post - 1]++;
      const pct = wins.map((w) => (100 * w) / n);
      report(`B7 post win share, 8 equal ${style}`, pct.map((p) => p.toFixed(1)).join(' '));
      for (const p of pct) expect(Math.abs(p - 12.5)).toBeLessThanOrEqual(FAIR_TOL);
    });
  });
});
