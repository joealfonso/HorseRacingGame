import type { Betting } from '../data/bettingSchema';
import type { CrowdValues } from './crowd';
import type { DrawRules } from './fieldDraw';
import type { OddsStep, PoolRules } from './payout';

/** The betting values the code runs on, money in cents, from a validated betting.json. */
export interface BettingRules {
  startCents: number;
  minBetCents: number;
  /** Bet amounts offered, whole dollars, rising. */
  amountsDollars: number[];
  capBasisPoints: number;
  draw: DrawRules;
  runsPerRace: number;
  crowdDollars: number;
  pool: PoolRules;
  crowd: CrowdValues;
  steps: OddsStep[];
}

/** `races` is the length of the day's race list (day.json). */
export function rulesFrom(betting: Betting, races: number): BettingRules {
  return {
    startCents: betting.bankroll.startDollars.value * 100,
    minBetCents: betting.bets.minDollars.value * 100,
    amountsDollars: [...betting.bets.amountsDollars.value],
    capBasisPoints: betting.bets.capBasisPoints.value,
    draw: {
      races,
      fieldSize: betting.field.size.value,
      maxStartsPerDay: betting.field.maxStartsPerDay.value,
      racesBeforeRerun: betting.field.racesBeforeRerun.value,
    },
    runsPerRace: betting.estimate.runsPerRace.value,
    crowdDollars: betting.pool.crowdDollars.value,
    pool: {
      takeoutBasisPoints: betting.pool.takeoutBasisPoints.value,
      breakageCents: betting.pool.breakageCents.value,
      minPayoffPerDollarCents: betting.pool.minPayoffPerDollarCents.value,
    },
    crowd: { noise: betting.crowd.noise.value, styleLean: { ...betting.crowd.styleLean.value }, flatten: betting.crowd.flatten.value },
    steps: betting.odds.steps.value.map((s) => ({ label: s.label, num: s.odds[0], den: s.odds[1] })),
  };
}
