import { describe, expect, it } from 'vitest';
import { oddsLabel, pricesWith } from './market';
import { perDollarCents } from './payout';
import { realCtx, testInts } from './testkit';

// PM1 to PM3 (docs/specs/betting-simple.md, "Payout math, exact in cents"). Every expected
// number below is worked by hand from the spec's formula, not read from the code.

const rules = realCtx().rules;
const pool = rules.pool;
const odds = (perDollar: number) => oddsLabel(perDollar, rules);

describe('PM1: the worked examples A to E', () => {
  // [name, pool cents, winner cents, perDollar, $2 pays cents, odds]
  const table: Array<[string, number, number, number, number, string]> = [
    ['A, favorite', 1_000_000, 250_000, 330, 660, '2-1'],
    ['B, longshot', 1_000_000, 30_000, 2_760, 5_520, '26-1'],
    ['C, minimum', 1_000_000, 900_000, 105, 210, '1-9'],
    ['D, exact step', 1_000_000, 236_000, 350, 700, '5-2'],
    ['E, player in', 1_002_000, 32_000, 2_590, 5_180, '24-1'],
  ];

  it.each(table)('PM1: example %s', (_name, P, W, perDollar, twoDollar, shown) => {
    const pd = perDollarCents(P, W, pool);
    expect(pd).toBe(perDollar);
    expect(2 * pd).toBe(twoDollar);
    expect(odds(pd)).toBe(shown);
  });

  it('PM1: the net pools are 830,000 and, with the player in, 831,660 (take 170,000 and 170,340)', () => {
    const net = (P: number) => P - Math.floor((P * 1700) / 10000);
    expect(net(1_000_000)).toBe(830_000);
    expect(net(1_002_000)).toBe(831_660);
    // The take is a property of the rules, so a different takeout must move every price.
    expect(perDollarCents(1_000_000, 250_000, { ...pool, takeoutBasisPoints: 0 })).toBe(400);
  });

  // A crowd of $10,000 with $2,500 on post 1, $300 on post 2 and $2,360 on post 3.
  const crowd = [2500, 300, 2360, 1500, 1200, 1000, 800, 340];

  it('PM1: A, B and D from a whole crowd pool through pricesWith, no bet', () => {
    expect(crowd.reduce((a, b) => a + b, 0)).toBe(10_000);
    const p = pricesWith(crowd, null, rules);
    expect(p.poolCents).toBe(1_000_000);
    expect(p.perDollarCents.slice(0, 3)).toEqual([330, 2760, 350]);
    expect(p.odds.slice(0, 3)).toEqual(['2-1', '26-1', '5-2']);
    expect(p.paysCents).toBeNull();
    expect(p.crowdDollars).toEqual(crowd);
  });

  it('PM1: E, the player\'s $20 joins the pool and shortens their own price from 26-1 to 24-1, paying $518.00', () => {
    const p = pricesWith(crowd, { post: 2, dollars: 20 }, rules);
    expect(p.poolCents).toBe(1_002_000);
    expect(p.perDollarCents[1]).toBe(2590);
    expect(p.odds[1]).toBe('24-1');
    expect(p.paysCents).toBe(51_800);
    // The crowd's own dollars are reported before the bet.
    expect(p.crowdDollars).toEqual(crowd);
    // The other horses are priced on the bigger pool too: post 1 has W 250,000 on net 831,660.
    expect(p.perDollarCents[0]).toBe(330);
  });
});

describe('PM1 edges', () => {
  it('PM1: breakage rounds down, never to nearest (339.9 cents a dollar pays 330)', () => {
    // net 830,000: 83,000,000 / 244,190 = 339.898...
    expect(perDollarCents(1_000_000, 244_190, pool)).toBe(330);
  });

  it('PM1: the takeout is floored on a pool of odd cents', () => {
    // P 1,000,099: take floor(170,016.83) = 170,016, net 830,083. W 100,000: floor(83,008,300 / 1,000,000) = 83.
    expect(perDollarCents(1_000_099, 100_000, pool)).toBe(830);
    // P 1,000,059: take floor(170,010.03) = 170,010, net 830,049. W 200,000: 83,004,900 / 2,000,000 = 41.5 steps.
    expect(perDollarCents(1_000_059, 200_000, pool)).toBe(410);
  });

  it('PM1: the minimum payoff holds when every dollar is on the winner', () => {
    expect(perDollarCents(1_000_000, 1_000_000, pool)).toBe(105);
  });

  it('PM1: just above the minimum is not raised (110 stays 110)', () => {
    // 83,000,000 / (W * 10) must fall in [11, 12).
    const W = 740_000; // 83,000,000 / 7,400,000 = 11.2
    expect(perDollarCents(1_000_000, W, pool)).toBe(110);
  });

  it('PM1: a horse with $1 of crowd money gets a price, shown as 99-1, and a $2 bet on it moves its own price', () => {
    const crowd = [24_993, 1, 1, 1, 1, 1, 1, 1];
    const none = pricesWith(crowd, null, rules);
    // P 2,500,000, take 425,000, net 2,075,000. W 100: 207,500,000 / 1,000 = 207,500 steps.
    expect(none.perDollarCents[1]).toBe(2_075_000);
    expect(none.odds[1]).toBe('99-1');
    // The favorite: 207,500,000 / 24,993,000 = 8 steps, 80, raised to 105.
    expect(none.perDollarCents[0]).toBe(105);
    expect(none.odds[0]).toBe('1-9');
    const bet = pricesWith(crowd, { post: 2, dollars: 2 }, rules);
    // P 2,500,200, take 425,034, net 2,075,166. W 300: 207,516,600 / 3,000 = 69,172 steps.
    expect(bet.perDollarCents[1]).toBe(691_720);
    expect(bet.paysCents).toBe(1_383_440);
  });

  it('PM1: a bet on one horse does not change the money on the others, only the pool', () => {
    const crowd = [5000, 4000, 4000, 3000, 3000, 2500, 2000, 1500];
    const p = pricesWith(crowd, { post: 4, dollars: 100 }, rules);
    expect(p.poolCents).toBe(2_510_000);
    // Post 1: net 2,510,000 - 426,700 = 2,083,300. W 500,000: 208,330,000 / 5,000,000 = 41 steps.
    expect(p.perDollarCents[0]).toBe(410);
    // Post 4: W 310,000: 208,330,000 / 3,100,000 = 67 steps.
    expect(p.perDollarCents[3]).toBe(670);
    expect(p.paysCents).toBe(100 * 670);
  });
});

describe('PM2: properties over random pools', () => {
  it('PM2: whole cents; at least the minimum; a multiple of breakage unless the minimum applied, then exactly the minimum; above it at most the unrounded price and within one step; never more than net unless the minimum applied', () => {
    const next = testInts(20261113);
    let raised = 0;
    for (let i = 0; i < 20_000; i++) {
      const P = next(100_000, 20_000_000);
      const W = next(1, P);
      const pd = perDollarCents(P, W, pool);
      const net = P - Math.floor((P * pool.takeoutBasisPoints) / 10000);
      expect(Number.isInteger(pd)).toBe(true);
      expect(pd).toBeGreaterThanOrEqual(pool.minPayoffPerDollarCents);
      // The first breakage step at or above the minimum (110). Below it the formula's floor is under the minimum.
      const brk = pool.breakageCents;
      const firstStep = Math.ceil(pool.minPayoffPerDollarCents / brk) * brk;
      if (firstStep * W > net * 100) {
        expect(pd, `P ${P} W ${W}`).toBe(pool.minPayoffPerDollarCents);
        raised++;
        continue;
      }
      expect(pd % brk, `P ${P} W ${W}`).toBe(0);
      // At most the unrounded net * 100 / W, so the winning tickets never share more than net.
      expect(pd * W <= net * 100, `P ${P} W ${W} pays more than net`).toBe(true);
      // Within one breakage step of the unrounded price.
      expect((pd + brk) * W > net * 100, `P ${P} W ${W}`).toBe(true);
    }
    expect(raised).toBeGreaterThan(0);
  });

  it('PM2: a winning ticket of D whole dollars returns D times the per-dollar price, in whole cents', () => {
    const next = testInts(7);
    for (let i = 0; i < 2000; i++) {
      const crowd = Array.from({ length: 8 }, () => next(1, 9000));
      const post = next(1, 8);
      const dollars = next(1, 100);
      const p = pricesWith(crowd, { post, dollars }, rules);
      expect(p.poolCents).toBe(crowd.reduce((a, b) => a + b, 0) * 100 + dollars * 100);
      expect(p.paysCents).toBe(dollars * p.perDollarCents[post - 1]);
      expect(Number.isInteger(p.paysCents)).toBe(true);
      expect(p.perDollarCents[post - 1]).toBe(perDollarCents(p.poolCents, crowd[post - 1] * 100 + dollars * 100, pool));
    }
  });
});

describe('PM3: odds display', () => {
  it.each([
    [105, '1-9'], [190, '4-5'], [200, '1-1'], [330, '2-1'], [350, '5-2'], [2_760, '26-1'],
    [10_100, '99-1'], [10_110, '99-1'], [2_075_000, '99-1'],
  ])('PM3: per-dollar %i shows %s', (pd, shown) => {
    expect(odds(pd)).toBe(shown);
  });

  it('PM3: below 1-9 shows 1-9', () => {
    expect(odds(100)).toBe('1-9');
    expect(odds(110)).toBe('1-9');
  });

  it('PM3: a value exactly on a step shows that step, and one cent under shows the step below', () => {
    const exact: Array<[number, string, string]> = [
      [120, '1-5', '1-9'], [140, '2-5', '1-5'], [150, '1-2', '2-5'], [160, '3-5', '1-2'], [180, '4-5', '3-5'],
      [220, '6-5', '1-1'], [240, '7-5', '6-5'], [250, '3-2', '7-5'], [260, '8-5', '3-2'], [280, '9-5', '8-5'],
      [300, '2-1', '9-5'], [400, '3-1', '5-2'], [450, '7-2', '3-1'], [500, '4-1', '7-2'], [550, '9-2', '4-1'],
      [600, '5-1', '9-2'], [1_100, '10-1', '9-1'], [1_200, '11-1', '10-1'], [9_900, '98-1', '97-1'], [10_000, '99-1', '98-1'],
    ];
    for (const [pd, at, below] of exact) {
      expect(odds(pd), `${pd}`).toBe(at);
      expect(odds(pd - 1), `${pd - 1}`).toBe(below);
    }
  });

  it('PM3: between steps shows the largest step at or below (340 is 2-1, 2,799 is 26-1)', () => {
    expect(odds(340)).toBe('2-1');
    expect(odds(2_799)).toBe('26-1');
  });

  it('PM3: the longest display is 4 characters', () => {
    for (let pd = 105; pd <= 12_000; pd += 5) expect(odds(pd).length).toBeLessThanOrEqual(4);
  });
});
