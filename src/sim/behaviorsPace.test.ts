import { describe, expect, it, vi } from 'vitest';
import type { GameData, RunningStyle } from '../data/schema';
import { runRace } from './runRace';
import { mean, placeOf, positionAt, report, seedRange, shipped, withField, type Spec } from './testkit';

// B4 to B6: running styles and the pace they make. Fixed seeds, tolerances from tuning.
vi.setConfig({ testTimeout: 60_000 });

const base = shipped();
const SEEDS = seedRange(5000, base.tuning.checks.behaviorSeedCount.value);
const TOL = base.tuning.checks.behaviorTolerancePoints.value / 100;
const ORDER: RunningStyle[] = ['frontRunner', 'stalker', 'closer'];

// Eight horses with the same stats, styles rotated across the posts: front-runner, stalker,
// closer, front-runner, ... so the styles are the only difference between them.
const rotated = withField(base, Array.from({ length: 8 }, (_v, i): Spec => ({ style: ORDER[i % 3], speed: 70, stamina: 70, kick: 70 })));

describe('B4: styles look like styles', () => {
  // For each style, the average position at the first call (the quarter mile, 8 furlongs to go)
  // and the average positions gained from the quarter pole (2 to go) to the wire.
  function byStyle(data: GameData) {
    const first: Record<string, number[]> = { frontRunner: [], stalker: [], closer: [] };
    const late: Record<string, number[]> = { frontRunner: [], stalker: [], closer: [] };
    for (const s of SEEDS) {
      const r = runRace(data, s);
      for (const h of data.card.horses) {
        first[h.style].push(positionAt(r, 8, h.id));
        late[h.style].push(positionAt(r, 2, h.id) - placeOf(r, h.id));
      }
    }
    const avg = (o: Record<string, number[]>) => Object.fromEntries(ORDER.map((k) => [k, mean(o[k])]));
    return { first: avg(first), late: avg(late) };
  }

  describe.each([
    ['the shipped card', base],
    ['eight equal horses with the styles rotated', rotated],
  ])('%s', (name, data) => {
    const { first, late } = byStyle(data as GameData);
    report(`B4 ${name}`, { first, late });

    it('at the first call front-runners have a better (lower) average position than stalkers, and stalkers better than closers', () => {
      expect(first.frontRunner).toBeLessThan(first.stalker);
      expect(first.stalker).toBeLessThan(first.closer);
    });

    it('from the quarter pole to the wire closers gain the most positions on average', () => {
      expect(late.closer).toBeGreaterThan(late.stalker);
      expect(late.closer).toBeGreaterThan(late.frontRunner);
    });
  });
});

describe('B5: pace comes from the field', () => {
  // Eight equal horses with n front-runners and the rest alternating stalkers and closers.
  const field = (frontRunners: number) => withField(base, Array.from({ length: 8 }, (_v, i): Spec => ({
    style: i < frontRunners ? 'frontRunner' : i % 2 ? 'stalker' : 'closer', speed: 70, stamina: 70, kick: 70,
  })));
  const hotShare = (data: GameData) => SEEDS.filter((s) => runRace(data, s).pace.label === 'hot').length / SEEDS.length;

  it('a field with three front-runners is labeled hot more often than one with a single front-runner', () => {
    const three = hotShare(field(3));
    const one = hotShare(field(1));
    report('B5 hot share, 3 front-runners vs 1', { three, one });
    expect(three).toBeGreaterThan(one + TOL);
  });

  it('and a field of all front-runners is hotter again than three', () => {
    const all = hotShare(field(8));
    const three = hotShare(field(3));
    report('B5 hot share, 8 front-runners vs 3', { all, three });
    expect(all).toBeGreaterThan(three);
  });
});

describe('B6: a hot pace helps closers', () => {
  // The share of races of one label won by a horse of one style.
  function shares(data: GameData, seeds: number[]) {
    const wins = { hot: { frontRunner: 0, stalker: 0, closer: 0 }, slow: { frontRunner: 0, stalker: 0, closer: 0 } };
    const races = { hot: 0, slow: 0 };
    const style = new Map(data.card.horses.map((h) => [h.id, h.style]));
    for (const s of seeds) {
      const r = runRace(data, s);
      const label = r.pace.label;
      if (label === 'honest') continue;
      races[label]++;
      wins[label][style.get(r.finish[0].id)!]++;
    }
    const share = (l: 'hot' | 'slow', st: RunningStyle) => wins[l][st] / races[l];
    return { races, share };
  }

  it('on eight equal horses, closers win a larger share of hot races than of slow ones, and front-runners the reverse', () => {
    const { races, share } = shares(rotated, SEEDS);
    report('B6 rotated field', { races, closer: [share('hot', 'closer'), share('slow', 'closer')], frontRunner: [share('hot', 'frontRunner'), share('slow', 'frontRunner')] });
    expect(races.hot).toBeGreaterThan(30);
    expect(races.slow).toBeGreaterThan(30);
    expect(share('hot', 'closer')).toBeGreaterThan(share('slow', 'closer'));
    expect(share('hot', 'frontRunner')).toBeLessThan(share('slow', 'frontRunner'));
  });

  // On the shipped card about a quarter of races read hot and a quarter slow, so 500 seeds
  // leave about 120 of each and the gap is inside the noise. 2000 seeds was chosen up front for that.
  it('and on the shipped card (2000 seeds, so there are enough hot and slow races)', () => {
    const { races, share } = shares(base, seedRange(5000, 2000));
    report('B6 shipped card, 2000 seeds', { races, closer: [share('hot', 'closer'), share('slow', 'closer')], frontRunner: [share('hot', 'frontRunner'), share('slow', 'frontRunner')] });
    expect(share('hot', 'closer')).toBeGreaterThan(share('slow', 'closer'));
    expect(share('hot', 'frontRunner')).toBeLessThan(share('slow', 'frontRunner'));
  });
});
