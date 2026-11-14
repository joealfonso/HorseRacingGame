import { drawnDay, newDay, programFor, type DayContext, type DayState, type DrawnRace, type RaceProgram } from '../bet/day';
import { nextDaySeed } from '../bet/streams';
import { fieldForRaceDay, type BettingData } from '../data/bettingLoad';
import type { RaceDayData } from '../data/raceDayLoad';
import { cardLookSchema } from '../data/raceDaySchema';
import { ERROR_CHARS, ERROR_LINES, wrap } from '../render/format';
import type { Estimates } from './estimates';

// The betting day as it travels between scenes (docs/specs/betting-screens.md section 2):
// what stays the same all day (the context, the data, the drawn fields, the estimates) and,
// beside it in each scene's data, the DayState from src/bet/day.ts. Never a global.

export interface BetDay {
  ctx: DayContext;
  betting: BettingData;
  /** The shipped race-day data. Each race's looks come from its own field (raceDayFor). */
  rd: RaceDayData;
  /** The day's fields, race seeds and sim inputs, from the day seed alone. Race r is drawn[r - 1]. */
  drawn: DrawnRace[];
  estimates: Estimates;
}

/** A new day on its seed, with the starting bankroll, on race 1. */
export function startDay(ctx: DayContext, betting: BettingData, rd: RaceDayData, estimates: Estimates, daySeed: number): { bet: BetDay; day: DayState } {
  return { bet: { ctx, betting, rd, drawn: drawnDay(ctx, daySeed), estimates }, day: newDay(ctx, daySeed) };
}

/**
 * The day after this one: the next day seed, the starting bankroll, race 1.
 * Interim (betting-screens.md section 6 is the next step): until the End of day page is
 * built, the result's "End of day" leads straight here.
 */
export function nextDay(bet: BetDay, day: DayState): { bet: BetDay; day: DayState } {
  const seed = nextDaySeed(day.daySeed);
  console.info(`Betting day: day seed ${seed}. Add ?seed=${seed} to the address to replay this day.`);
  return startDay(bet.ctx, bet.betting, bet.rd, bet.estimates, seed);
}

/** The race-day data with this field's looks (coat, silks, blurb) in place of card.json's, parsed as a card look. */
export const raceDayFor = (bet: BetDay, drawn: DrawnRace): RaceDayData =>
  ({ ...bet.rd, cardLook: cardLookSchema.parse(fieldForRaceDay(bet.betting, drawn.input).cardLook) });

/** The program once its estimate is back from the worker, or null while the odds are pending. */
export function programIfReady(bet: BetDay, drawn: DrawnRace): RaceProgram | null {
  const job = bet.estimates.get(drawn);
  return job === null ? null : programFor(bet.ctx, drawn, job);
}

/** The error screen's lines for a betting failure: the day seed, the race and the message. */
export function betErrorLines(daySeed: number, race: number, err: unknown): string[] {
  const message = err instanceof Error ? err.message : String(err);
  return ['The betting day hit a problem.', '', `Day seed ${daySeed}, race ${race}`, '', ...wrap(message, ERROR_CHARS).slice(0, ERROR_LINES - 6), '', 'Reload the page.'];
}
