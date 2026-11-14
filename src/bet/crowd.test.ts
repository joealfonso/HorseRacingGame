import { describe, expect, it } from 'vitest';
import { createStream, type Stream } from '../sim/rng';
import { crowdDollars, type CrowdValues, type Style } from './crowd';
import { crowdFor, priceRace } from './market';
import { realCtx } from './testkit';

// OD3 and OD4 (docs/specs/betting-simple.md, "The crowd"). The oracle below follows the
// spec's six steps as written; the committed answer pins the shipped values.

const ctx = realCtx();
const rules = ctx.rules;

/** The spec's crowd, steps 1 to 6, written from the spec. */
function specCrowd(wins: number[], runs: number, styles: Style[], stream: Stream, v: CrowdValues, pool: number): number[] {
  const n = wins.length;
  const b = wins.map((w, i) => {
    const p = Math.max(w / runs, 0.5 / runs);
    const u = ((stream.float() + stream.float() + stream.float()) / 3) * 2 - 1;
    return p * (1 + v.noise * u) * (1 + v.styleLean[styles[i]]);
  });
  const sum = b.reduce((a, x) => a + x, 0);
  const c = b.map((x) => (1 - v.flatten) * (x / sum) + v.flatten / n);
  const raw = c.map((x) => pool * x);
  const out = raw.map((x) => Math.floor(x));
  let left = pool - out.reduce((a, x) => a + x, 0);
  const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, z) => z[0] - a[0] || a[1] - z[1]);
  for (let k = 0; left > 0; k++, left--) out[order[k % n][1]]++;
  return out;
}

const STYLES: Style[] = ['frontRunner', 'stalker', 'closer', 'frontRunner', 'closer', 'stalker', 'frontRunner', 'closer'];
const WINS = [312, 201, 148, 120, 97, 70, 40, 12];
const DAY = 20261113;

/** A stream that always returns the same float, so u is known exactly. */
const fixed = (f: number): Stream => ({ float: () => f, int: () => 0 });

describe('OD3: the crowd fixture', () => {
  it('OD3: a pinned day seed and estimate give the committed crowd dollars', () => {
    const got = crowdFor({ runs: 1000, wins: WINS }, STYLES, DAY, 3, rules);
    expect(got).toEqual(COMMITTED);
  });

  it('OD3: the crowd follows the spec\'s six steps on the race\'s own crowd stream (day seed, sub-key the race)', () => {
    for (const race of [1, 2, 3, 8]) {
      const want = specCrowd(WINS, 1000, STYLES, createStream(DAY, 'crowd', String(race)), rules.crowd, rules.crowdDollars);
      expect(crowdFor({ runs: 1000, wins: WINS }, STYLES, DAY, race, rules), `race ${race}`).toEqual(want);
    }
  });

  it('OD3: dollars sum exactly to the pool and each horse has at least $1, over many seeds', () => {
    for (let s = 0; s < 500; s++) {
      for (const race of [1, 5]) {
        const d = crowdFor({ runs: 1000, wins: WINS }, STYLES, s * 7919, race, rules);
        expect(d.reduce((a, x) => a + x, 0)).toBe(25_000);
        for (const x of d) {
          expect(Number.isInteger(x)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('OD3: remainder ties go to the lower post', () => {
    // u = 0 for every horse (float 0.5), no lean, equal estimates: $25,003 / 8 = 3,125.375 each, three spare dollars.
    const v: CrowdValues = { noise: 0.6, styleLean: { frontRunner: 0, stalker: 0, closer: 0 }, flatten: 0.025 };
    const d = crowdDollars([125, 125, 125, 125, 125, 125, 125, 125], 1000, STYLES, fixed(0.5), v, 25_003);
    expect(d).toEqual([3126, 3126, 3126, 3125, 3125, 3125, 3125, 3125]);
  });

  it('OD3: the largest remainders get the spare dollars, not the lowest posts, and every horse has at least $1', () => {
    // No noise, no flatten, no lean: shares are the estimate, zero wins floored at 0.5 / 10,000.
    // Raw dollars of $1,000: 400.42, 299.44, 149.97, 149.97 and 0.05 four times. Floors sum to 997;
    // the three spare dollars go to posts 3, 4 and 2 (remainders .97, .97, .44), not to post 1 (.42).
    const v: CrowdValues = { noise: 0, styleLean: { frontRunner: 0, stalker: 0, closer: 0 }, flatten: 0 };
    const d = crowdDollars([4005, 2995, 1500, 1500, 0, 0, 0, 0], 10_000, STYLES, fixed(0.5), v, 1000);
    expect(d.slice(1, 4)).toEqual([300, 150, 150]);
    expect(d[0]).toBeLessThanOrEqual(400);
    for (const x of d.slice(4)) expect(x).toBeGreaterThanOrEqual(1);
    expect(d.reduce((a, x) => a + x, 0)).toBe(1000);
  });

  it('OD3: the style lean moves money toward front-runners and away from closers', () => {
    const even = [125, 125, 125, 125, 125, 125, 125, 125];
    const d = crowdDollars(even, 1000, STYLES, fixed(0.5), rules.crowd, 25_000);
    expect(d[0]).toBeGreaterThan(d[1]); // front-runner over stalker
    expect(d[1]).toBeGreaterThan(d[2]); // stalker over closer
  });

  it('OD3: the noise u is the mean of three crowd draws per horse, in post order, scaled to -1 to 1', () => {
    // A stream that returns 0, 0, 0 for post 1 (u = -1) and 0.5 after (u = 0 for every other post).
    let k = 0;
    const s: Stream = { float: () => (k++ < 3 ? 0 : 0.5), int: () => 0 };
    const v: CrowdValues = { noise: 0.5, styleLean: { frontRunner: 0, stalker: 0, closer: 0 }, flatten: 0 };
    const d = crowdDollars([125, 125, 125, 125, 125, 125, 125, 125], 1000, STYLES, s, v, 8000);
    // Beliefs: post 1 is 0.125 * 0.5, the rest 0.125. Shares 0.5 / 7.5 and 1 / 7.5 of 8,000.
    expect(d[0]).toBe(533);
    expect(d.slice(1)).toEqual([1067, 1067, 1067, 1067, 1067, 1066, 1066]);
  });
});

describe('OD4: a horse with 0 wins still gets money and a price', () => {
  it('OD4: with the shipped crowd, zero-win horses get money and a whole-cent price', () => {
    const wins = [1000, 0, 0, 0, 0, 0, 0, 0];
    const p = priceRace({ runs: 1000, wins }, STYLES, DAY, 1, null, rules);
    for (let i = 1; i < 8; i++) {
      expect(p.crowdDollars[i]).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(p.perDollarCents[i])).toBe(true);
      expect(p.perDollarCents[i]).toBeGreaterThanOrEqual(105);
      expect(p.odds[i]).toMatch(/^\d+-\d+$/);
    }
  });

  it('OD4: the floor of 0.5 / N gives a zero-win horse belief, not only the $1 minimum', () => {
    // No flatten: without the floor a zero-win horse's share is 0 and it would hold only $1.
    const v: CrowdValues = { noise: 0, styleLean: { frontRunner: 0, stalker: 0, closer: 0 }, flatten: 0 };
    const d = crowdDollars([1000, 0, 0, 0, 0, 0, 0, 0], 1000, STYLES, fixed(0.5), v, 25_000);
    // Each zero-win horse: 0.0005 / 1.0035 of $25,000 = $12.456...
    expect(d.slice(1).every((x) => x === 12 || x === 13)).toBe(true);
    expect(d.reduce((a, x) => a + x, 0)).toBe(25_000);
  });
});

describe('OD3 (amended): the split is the spec\'s shares, never repaired', () => {
  it('OD3: over extreme but valid crowd values, estimates and pools, each horse gets floor or floor + 1 of pool * c (or the $1 minimum), matching the spec\'s steps', () => {
    const leans = [-0.5, 0, 0.5];
    let cases = 0;
    for (const noise of [0, 0.6, 0.9]) {
      for (const flatten of [0, 0.025, 0.5]) {
        for (const lean of leans) {
          const v: CrowdValues = { noise, styleLean: { frontRunner: lean, stalker: 0, closer: -lean }, flatten };
          for (const [wins, runs] of [[WINS, 1000], [[1000, 0, 0, 0, 0, 0, 0, 0], 1000], [[1, 1, 1, 1, 1, 1, 1, 1], 8], [[4999, 1, 0, 0, 0, 0, 0, 0], 5000]] as Array<[number[], number]>) {
            for (const pool of [1000, 25_000, 1_000_003]) {
              for (const seed of [0, 17, 4294967295]) {
                const d = crowdDollars(wins, runs, STYLES, createStream(seed, 'crowd', '2'), v, pool);
                const want = specCrowd(wins, runs, STYLES, createStream(seed, 'crowd', '2'), v, pool);
                // The spec's $1 minimum only moves dollars when a share is under $1; otherwise the split is exact.
                if (want.every((x) => x >= 1)) expect(d).toEqual(want);
                expect(d.reduce((a, x) => a + x, 0)).toBe(pool);
                for (const x of d) expect(x).toBeGreaterThanOrEqual(1);
                cases++;
              }
            }
          }
        }
      }
    }
    expect(cases).toBe(3 * 3 * 3 * 4 * 3 * 3);
  });
});

// The committed answer for OD3, pinned from the first run and checked against the spec oracle above.
const COMMITTED: number[] = [9074, 3857, 2995, 3511, 2137, 1940, 1060, 426];
