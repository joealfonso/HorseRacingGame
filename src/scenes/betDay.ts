import { drawnDay, goToPost, newDay, programFor, type DayContext, type DayState, type DrawnRace, type RaceProgram } from '../bet/day';
import { nextDaySeed } from '../bet/streams';
import { fieldForRaceDay, type BettingData } from '../data/bettingLoad';
import { loadHub } from '../data/hubLoad';
import type { Hub } from '../data/hubSchema';
import type { RaceDayData } from '../data/raceDayLoad';
import { cardLookSchema } from '../data/raceDaySchema';
import { ERROR_CHARS, ERROR_LINES, wrap } from '../render/format';
import type { ArtInfo } from './art';
import type { Estimates } from './estimates';
import type { RaceData } from './RaceScene';

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
  /** The track between races (src/data/hub.json). */
  hub: Hub;
  /**
   * Looks per lookable at the track this day (track-hub.md section 4). Carried scene to
   * scene in this object, replaced (never changed in place) when the track hands it on; a
   * new day starts with none. Never in storage (SAFE3).
   */
  looks: Readonly<Record<string, number>>;
}

/** A new day on its seed, with the starting bankroll, on race 1. */
export function startDay(
  ctx: DayContext, betting: BettingData, rd: RaceDayData, estimates: Estimates, daySeed: number, hub: Hub = loadHub(),
): { bet: BetDay; day: DayState } {
  return { bet: { ctx, betting, rd, drawn: drawnDay(ctx, daySeed), estimates, hub, looks: {} }, day: newDay(ctx, daySeed) };
}

/**
 * The day after this one: the next day seed, the starting bankroll, race 1.
 * Interim (betting-screens.md section 6 is the next step): until the End of day page is
 * built, the result's "End of day" leads straight here.
 */
export function nextDay(bet: BetDay, day: DayState): { bet: BetDay; day: DayState } {
  const seed = nextDaySeed(day.daySeed);
  console.info(`Betting day: day seed ${seed}. Add ?seed=${seed} to the address to replay this day.`);
  return startDay(bet.ctx, bet.betting, bet.rd, bet.estimates, seed, bet.hub);
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

/**
 * Go to the post with no bet: Pass on the program, or the rail at the track. With the odds
 * in, the race goes to the post now. Only Pass can come here while they are pending (the rail
 * waits for them first, TH7): the day is handed on as it is and the race scene goes to the
 * post when they arrive (a pass stakes nothing).
 */
export function passDay(bet: BetDay, day: DayState, drawn: DrawnRace): DayState {
  const program = programIfReady(bet, drawn);
  return program === null ? day : goToPost(bet.ctx, day, program, null);
}

/** The race scene's data for a betting race: the drawn field, the day after Go to the post, the keys still held. */
export function betRaceData(bet: BetDay, day: DayState, drawn: DrawnRace, art: ArtInfo, held: string[]): RaceData {
  const ticket = day.open?.ticket ?? null;
  return {
    game: drawn.input,
    rd: raceDayFor(bet, drawn),
    art,
    ticket: { raceNumber: drawn.race - 1, seed: drawn.raceSeed, post: ticket?.post ?? 0, orders: { early: 'default', move: 'default', path: 'default' } },
    held,
    bet: { day: bet, state: day, drawn },
  };
}
