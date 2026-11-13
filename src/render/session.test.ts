import { describe, expect, it } from 'vitest';
import { SEED_RULE, SEED_SPACE, nextRace, parseSeedParam, seedFor, type Session } from './session';

// Spec 3.3 and 4.9, criteria LP1 and LP2 as far as P0 uses them: race n uses
// (first + n) mod 4294967296, and Enter after the wire runs the next seed.

describe('LP1: the seed of race n', () => {
  it('LP1: the space is 2^32', () => {
    expect(SEED_SPACE).toBe(4294967296);
  });

  it.each([
    [0, 0, 0],
    [1234, 0, 1234], // race 0 is the first seed itself, so ?seed=N replays N
    [1234, 1, 1235],
    [1234, 9, 1243],
    [4294967295, 0, 4294967295],
    [4294967295, 1, 0], // wraps
    [4294967295, 5, 4],
    [4294967290, 10, 4],
    [7, 4294967296, 7],
  ])('LP1: first seed %i, race %i uses seed %i', (first, n, seed) => {
    expect(seedFor(first, n)).toBe(seed);
  });

  it('LP1: ten races in a row use ten consecutive seeds', () => {
    const first = 4294967292;
    const seen = Array.from({ length: 10 }, (_v, n) => seedFor(first, n));
    expect(seen).toEqual([4294967292, 4294967293, 4294967294, 4294967295, 0, 1, 2, 3, 4, 5]);
  });

  it('LP1: Enter after the wire: nextRace moves to race n+1, changes nothing else, and does not touch the old session', () => {
    const s: Session = { firstSeed: 99, raceNumber: 3, pickPost: 6 };
    const frozen = Object.freeze({ ...s });
    const next = nextRace(frozen);
    expect(next).toEqual({ firstSeed: 99, raceNumber: 4, pickPost: 6 });
    expect(frozen.raceNumber).toBe(3);
    expect(seedFor(next.firstSeed, next.raceNumber)).toBe(seedFor(s.firstSeed, s.raceNumber) + 1);
  });
});

describe('LP2: ?seed= in the address', () => {
  it('LP2: the rule text', () => {
    expect(SEED_RULE).toBe('?seed= must be a whole number from 0 to 4294967295');
  });

  it.each([['?seed=0', 0], ['?seed=1234567', 1234567], ['?seed=4294967295', 4294967295], ['?a=1&seed=42', 42]])('LP2: %s is seed %i', (search, seed) => {
    expect(parseSeedParam(search)).toEqual({ seed });
  });

  it('LP2: no seed means none given, not an error', () => {
    expect(parseSeedParam('')).toEqual({ seed: null });
    expect(parseSeedParam('?other=3')).toEqual({ seed: null });
  });

  it.each(['?seed=', '?seed=-1', '?seed=1.5', '?seed=abc', '?seed=4294967296', '?seed=99999999999', '?seed=1e3', '?seed=%2B5', '?seed=0x10', '?seed= 5'])('LP2: %s shows the rule', (search) => {
    expect(parseSeedParam(search)).toEqual({ error: SEED_RULE });
  });
});
