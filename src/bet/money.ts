import type { BettingRules } from './rules';

// Money rules (spec "Money and bets"). Every amount is whole cents; bet amounts are whole dollars.

/** The most one bet may be: max(minimum bet, floor(bankroll * cap / 10000)), in cents. */
export function capCents(bankrollCents: number, rules: BettingRules): number {
  return Math.max(rules.minBetCents, Math.floor((bankrollCents * rules.capBasisPoints) / 10000));
}

/** The bet amounts offered, whole dollars, rising: each at most the bankroll and at most the cap (BK1). */
export function offeredAmounts(bankrollCents: number, rules: BettingRules): number[] {
  const cap = capCents(bankrollCents, rules);
  return rules.amountsDollars.filter((d) => d * 100 >= rules.minBetCents && d * 100 <= bankrollCents && d * 100 <= cap);
}

/** A race can be bet only with at least the minimum bet; below it the day ends (BK5). */
export const canBet = (bankrollCents: number, rules: BettingRules): boolean => bankrollCents >= rules.minBetCents;
