import { crowdDollars, type Style } from './crowd';
import type { Estimate } from './estimate';
import { oddsStepIndex, perDollarCents } from './payout';
import type { BettingRules } from './rules';
import { betStream } from './streams';

/** One win bet: a post (1 up) and whole dollars. */
export interface Bet {
  post: number;
  dollars: number;
}

/** Prices for one race with the player's bet (or none) in the pool. Arrays are by post. */
export interface Prices {
  /** The crowd's whole dollars per horse, before the player's bet. */
  crowdDollars: number[];
  /** Total pool in cents, crowd plus the player's bet. */
  poolCents: number;
  /** What $1 to win returns on each horse, stake included, in cents, with the bet in the pool. */
  perDollarCents: number[];
  /** Each horse's tote odds as shown, e.g. "5-2". */
  odds: string[];
  /** What the player's ticket returns if its horse wins, stake included, in cents. Null with no bet. */
  paysCents: number | null;
}

/** The crowd's dollars for a race: from its estimate, its styles by post and the race's `crowd` stream. */
export function crowdFor(estimate: Estimate, styles: readonly Style[], daySeed: number, race: number, rules: BettingRules): number[] {
  return crowdDollars(estimate.wins, estimate.runs, styles, betStream(daySeed, 'crowd', race), rules.crowd, rules.crowdDollars);
}

/** Prices from the crowd's dollars and the player's bet. Cheap: call it as the amount changes. */
export function pricesWith(crowd: readonly number[], bet: Bet | null, rules: BettingRules): Prices {
  if (bet !== null) checkBet(bet, crowd.length);
  const betCents = bet === null ? 0 : bet.dollars * 100;
  const poolCents = crowd.reduce((a, d) => a + d * 100, 0) + betCents;
  const perDollar = crowd.map((d, i) => perDollarCents(poolCents, d * 100 + (bet !== null && bet.post === i + 1 ? betCents : 0), rules.pool));
  return {
    crowdDollars: [...crowd],
    poolCents,
    perDollarCents: perDollar,
    odds: perDollar.map((pd) => rules.steps[oddsStepIndex(pd, rules.steps)].label),
    paysCents: bet === null ? null : bet.dollars * perDollar[bet.post - 1],
  };
}

/** Everything the program and bet need for one race, as one pure function of its inputs. */
export function priceRace(estimate: Estimate, styles: readonly Style[], daySeed: number, race: number, bet: Bet | null, rules: BettingRules): Prices {
  return pricesWith(crowdFor(estimate, styles, daySeed, race, rules), bet, rules);
}

/** The odds label for a per-dollar price, e.g. 330 is "2-1". */
export const oddsLabel = (perDollar: number, rules: BettingRules): string => rules.steps[oddsStepIndex(perDollar, rules.steps)].label;

function checkBet(bet: Bet, size: number): void {
  if (!Number.isInteger(bet.post) || bet.post < 1 || bet.post > size) throw new Error(`a bet needs a post from 1 to ${size}, got ${bet.post}`);
  if (!Number.isInteger(bet.dollars) || bet.dollars < 1) throw new Error(`a bet needs whole dollars of 1 or more, got ${bet.dollars}`);
}
