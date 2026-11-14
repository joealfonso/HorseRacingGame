// Pari-mutuel win payout in whole cents (spec "Payout math, exact in cents").

export interface PoolRules {
  takeoutBasisPoints: number;
  breakageCents: number;
  minPayoffPerDollarCents: number;
}

/** What a $1 win ticket returns, stake included, in cents. */
export function perDollarCents(poolCents: number, winnerCents: number, rules: PoolRules): number {
  if (!Number.isInteger(poolCents) || !Number.isInteger(winnerCents) || winnerCents <= 0 || winnerCents > poolCents) {
    throw new Error(`perDollarCents needs whole cents with 0 < winner <= pool, got pool ${poolCents} and winner ${winnerCents}`);
  }
  const take = Math.floor((poolCents * rules.takeoutBasisPoints) / 10000);
  const net = poolCents - take;
  const steps = Math.floor((net * 100) / (winnerCents * rules.breakageCents));
  return Math.max(rules.minPayoffPerDollarCents, rules.breakageCents * steps);
}

/** A tote step: `num`-`den` odds, shown as `label`. Steps are listed shortest first. */
export interface OddsStep {
  label: string;
  num: number;
  den: number;
}

/** Index of the largest step at or below (perDollar - 100) / 100, clamped to the first and last step. */
export function oddsStepIndex(perDollar: number, steps: readonly OddsStep[]): number {
  let found = 0;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].num * 100 <= (perDollar - 100) * steps[i].den) found = i;
    else break;
  }
  return found;
}
