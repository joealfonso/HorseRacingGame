import { describe, expect, it, vi } from 'vitest';
import type { RunningStyle } from '../data/schema';
import type { RaceResult } from './result';
import { runRace } from './runRace';
import { equalSpecs, mean, placeOf, report, seedRange, shipped, withField } from './testkit';

// B7, the ground half: running wider covers more ground and costs time. Fixed seeds.
vi.setConfig({ testTimeout: 120_000 });

const base = shipped();
const SEEDS = seedRange(3000, base.tuning.checks.behaviorSeedCount.value);
const STYLES: RunningStyle[] = ['stalker', 'frontRunner', 'closer'];

describe('B7: ground matters', () => {
  // The same horse (t1) on the rail and then on the outside post, with the horse that was
  // on the outside post taking its place. Its draws are keyed by its id, so everything but the
  // post is the same, and the two runs are paired by seed.
  function railAndOutside(style: RunningStyle) {
    const rail = withField(base, equalSpecs(8, style));
    const outside = structuredClone(rail);
    outside.card.horses[0].post = 8;
    outside.card.horses[7].post = 1;
    const a = SEEDS.map((s) => runRace(rail, s));
    const b = SEEDS.map((s) => runRace(outside, s));
    const ground = (rs: RaceResult[]) => mean(rs.map((r) => r.replay.horses.find((h) => h.id === 't1')!.extraGround)) / 100;
    const place = (rs: RaceResult[]) => mean(rs.map((r) => placeOf(r, 't1')));
    const time = (rs: RaceResult[]) => mean(rs.map((r) => r.finish.find((f) => f.id === 't1')!.time));
    const out = { groundRail: ground(a), groundOutside: ground(b), placeRail: place(a), placeOutside: place(b), timeRail: time(a), timeOutside: time(b) };
    report(`B7 ${style} post 1 vs post 8 (ground in feet)`, out);
    return out;
  }
  const cases = Object.fromEntries(STYLES.map((s) => [s, railAndOutside(s)])) as Record<RunningStyle, ReturnType<typeof railAndOutside>>;

  it.each(STYLES)('a %s on the outside post covers more ground than the same horse on the rail', (style) => {
    expect(cases[style].groundOutside).toBeGreaterThan(cases[style].groundRail);
  });

  it.each(['stalker', 'closer'] as const)('a %s that runs wider finishes worse on average than the same horse saving ground', (style) => {
    expect(cases[style].placeOutside).toBeGreaterThan(cases[style].placeRail);
    expect(cases[style].timeOutside).toBeGreaterThan(cases[style].timeRail);
  });

  // KNOWN GAP, decided 2026-11-12 and recorded in docs/DECISIONS.md. In a field of eight equal
  // front-runners the horse on the outside post covers about 4.6 feet more ground and finishes no
  // worse (mean place 4.28 outside against 4.36 on the rail over 500 paired seeds). The model is not
  // changed for now. This is retested in M1.4, where "stay inside" gives a clean lane lever.
  // Vitest fails an expected failure as soon as it passes, so the day the model starts passing
  // this test, the failure is the signal to remove ".fails".
  it.fails('a frontRunner that runs wider finishes worse on average than the same horse saving ground', () => {
    expect(cases.frontRunner.placeOutside).toBeGreaterThan(cases.frontRunner.placeRail);
    expect(cases.frontRunner.timeOutside).toBeGreaterThan(cases.frontRunner.timeRail);
  });
});
