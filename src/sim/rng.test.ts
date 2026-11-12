import { describe, expect, it } from 'vitest';
import { checkSeed, createStream } from './rng';

function draw(seed: number, name: string, subKey?: string, n = 10): number[] {
  const s = createStream(seed, name, subKey);
  return Array.from({ length: n }, () => s.float());
}

describe('R1: seed validation', () => {
  it.each([0, 1, 12345, 2147483648, 4294967295])('seed %s works', (seed) => {
    expect(() => checkSeed(seed)).not.toThrow();
    expect(() => createStream(seed, 'a')).not.toThrow();
  });

  const rejected: Array<[string, unknown]> = [
    ['negative', -1],
    ['fraction', 1.5],
    ['tiny fraction', 0.0001],
    ['NaN', NaN],
    ['string', '5'],
    ['non-numeric string', 'abc'],
    ['one too large', 4294967296],
    ['far too large', 1e20],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
  ];

  it.each(rejected)('%s is rejected by an error that names the seed', (_n, seed) => {
    expect(() => checkSeed(seed as number)).toThrow(/seed/i);
    expect(() => createStream(seed as number, 'a')).toThrow(/seed/i);
  });
});

describe('R2: a stream depends on seed, name and sub-key', () => {
  it('same inputs give the same sequence', () => {
    expect(draw(7, 'a', 'x')).toEqual(draw(7, 'a', 'x'));
  });
  it('a different seed, name or sub-key gives a different sequence', () => {
    const base = draw(7, 'a', 'x');
    expect(draw(8, 'a', 'x')).not.toEqual(base);
    expect(draw(7, 'b', 'x')).not.toEqual(base);
    expect(draw(7, 'a', 'y')).not.toEqual(base);
    expect(draw(7, 'a')).not.toEqual(base);
  });
  it('name and sub-key are not glued together ambiguously', () => {
    expect(draw(7, 'ab', 'c')).not.toEqual(draw(7, 'a', 'bc'));
  });
  it('float is in [0, 1) and int includes both ends', () => {
    const s = createStream(3, 'range');
    for (let i = 0; i < 5000; i++) {
      const f = s.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
    const seen = new Set<number>();
    const t = createStream(3, 'ints');
    for (let i = 0; i < 2000; i++) {
      const v = t.int(3, 6);
      expect(Number.isInteger(v)).toBe(true);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });
});

describe('R3: known answers', () => {
  // These values were produced by running the current implementation once
  // (seed 12345). They are the one place this suite takes numbers from the code.
  // A change to the generator or to how streams are derived is MEANT to break
  // this test: that changes every old race, so it must be a deliberate decision.
  const SEED = 12345;
  it('stream "alpha"', () => {
    expect(draw(SEED, 'alpha')).toEqual([
      0.30289545585401356, 0.9217568475287408, 0.4950225264765322, 0.4340184957254678, 0.10763656115159392,
      0.5796569811645895, 0.06795619637705386, 0.9497869142796844, 0.5482675342354923, 0.5171352436300367,
    ]);
  });
  it('stream "beta"', () => {
    expect(draw(SEED, 'beta')).toEqual([
      0.544407987035811, 0.15443585021421313, 0.9087241834495217, 0.08521006046794355, 0.9713566044811159,
      0.3778109613340348, 0.040356272365897894, 0.9951902048196644, 0.6165538113564253, 0.7387755154632032,
    ]);
  });
  it('stream "horse" with sub-key "3"', () => {
    expect(draw(SEED, 'horse', '3')).toEqual([
      0.22386064985767007, 0.04332218342460692, 0.5091689920518547, 0.3472715672105551, 0.351619940251112,
      0.31738379737362266, 0.24513959465548396, 0.39246787247247994, 0.6785268574021757, 0.14874898246489465,
    ]);
  });
});
