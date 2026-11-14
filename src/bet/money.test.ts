import { describe, expect, it } from 'vitest';
import { canBet, capCents, offeredAmounts } from './money';
import { realCtx } from './testkit';

// BK1 and the cap (docs/specs/betting-simple.md, "Money and bets"): $2 minimum, amounts
// $2, $5, $10, $20, $50, $100, each at most the bankroll and at most
// max(minimum bet, floor(bankroll * 2500 / 10000)).

const rules = realCtx().rules;

describe('BK1: offered amounts', () => {
  it.each([
    [10_000, [2, 5, 10, 20]],
    [740, [2]],
    [200, [2]],
    [190, []],
    [0, []],
    [210, [2]],
    [2_000, [2, 5]],
    [3_999, [2, 5]],
    [4_000, [2, 5, 10]],
    [20_000, [2, 5, 10, 20, 50]],
    [39_999, [2, 5, 10, 20, 50]],
    [40_000, [2, 5, 10, 20, 50, 100]],
    [1_000_000, [2, 5, 10, 20, 50, 100]],
  ])('BK1: a bankroll of %i cents offers %j', (bankroll, amounts) => {
    expect(offeredAmounts(bankroll, rules)).toEqual(amounts);
  });

  it('BK1: $1.90 can not bet, so the day ends; $2.00 can', () => {
    expect(canBet(190, rules)).toBe(false);
    expect(canBet(199, rules)).toBe(false);
    expect(canBet(200, rules)).toBe(true);
  });
});

describe('BK1: the cap', () => {
  it.each([
    [10_000, 2_500], [740, 200], [200, 200], [100, 200], [799, 200], [800, 200], [804, 201], [12_345, 3_086], [40_000, 10_000],
  ])('BK1: a bankroll of %i cents caps a bet at %i cents', (bankroll, cap) => {
    expect(capCents(bankroll, rules)).toBe(cap);
  });

  it('BK1: any bankroll of $2 or more can still bet $2', () => {
    for (let b = 200; b < 1_000; b++) expect(offeredAmounts(b, rules)).toContain(2);
  });

  it('BK1: every offered amount is at most the bankroll and the cap, and nothing allowed is left out', () => {
    for (let b = 0; b < 50_000; b += 37) {
      const cap = Math.max(200, Math.floor((b * 2500) / 10000));
      const expected = [2, 5, 10, 20, 50, 100].filter((d) => d * 100 <= b && d * 100 <= cap);
      expect(offeredAmounts(b, rules), `bankroll ${b}`).toEqual(expected);
    }
  });
});
