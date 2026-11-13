import { describe, expect, it, vi } from 'vitest';
import type { GameData, RunningStyle } from '../data/schema';
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

  // Decided 2026-11-12 (docs/DECISIONS.md, "B7 traced"): in a field of front-runners a horse on the
  // rail is pressed for longer and spends more, which is honest racing, so the model stays and the
  // front-runner check uses a lone front-runner among stalkers and closers, where the ground
  // lost from a wide post is what decides it. "Stay inside" must then save that ground and time.
  describe('a lone front-runner among stalkers and closers', () => {
    const lone = withField(base, Array.from({ length: 8 }, (_v, i) => ({
      style: i === 0 ? 'frontRunner' as const : i % 2 ? 'stalker' as const : 'closer' as const, speed: 70, stamina: 70, kick: 70,
    })));
    const wide = structuredClone(lone);
    wide.card.horses[0].post = 8;
    wide.card.horses[7].post = 1;
    const wideInside = structuredClone(wide);
    wideInside.card.horses[0].instructions.path = 'stayInside';
    const stats = (data: GameData) => {
      const rs = SEEDS.map((s) => runRace(data, s));
      return {
        place: mean(rs.map((r) => placeOf(r, 't1'))),
        time: mean(rs.map((r) => r.finish.find((f) => f.id === 't1')!.time)),
        ground: mean(rs.map((r) => r.replay.horses.find((h) => h.id === 't1')!.extraGround)) / 100,
      };
    };
    const post1 = stats(lone);
    const post8 = stats(wide);
    const post8Inside = stats(wideInside);
    report('B7 lone front-runner: post 1, post 8, post 8 with stay inside (place, time in hundredths, ground in feet)', { post1, post8, post8Inside });

    it('finishes worse on average from post 8 than from post 1', () => {
      expect(post8.place).toBeGreaterThan(post1.place);
      expect(post8.time).toBeGreaterThan(post1.time);
    });

    it('from post 8 covers less ground and runs a faster time with "stay inside" than without', () => {
      expect(post8Inside.ground).toBeLessThan(post8.ground);
      expect(post8Inside.time).toBeLessThan(post8.time);
    });
  });
});
