import type { BettingData } from '../data/bettingLoad';
import type { StableHorse } from '../data/bettingSchema';
import type { GameData, Race, Track, Tuning } from '../data/schema';
import { validateData } from '../data/validate';
import { checkSeed } from '../sim/rng';
import type { RaceResult } from '../sim/result';
import { runRace } from '../sim/runRace';
import type { Style } from './crowd';
import { estimateOf, runEstimate, type Estimate, type EstimateJob } from './estimate';
import { drawDay } from './fieldDraw';
import { crowdFor, oddsLabel, pricesWith, type Bet, type Prices } from './market';
import { canBet, offeredAmounts } from './money';
import type { BettingRules } from './rules';
import { raceSeedOf } from './streams';

// A day of betting (spec "The loop"), as pure steps the screens call one at a time, and
// playDay, which runs them all headless for tests and the harness.

/** Everything a day is built from, validated (src/data/bettingLoad.ts). */
export interface DayContext {
  stable: readonly StableHorse[];
  /** The day's races in order (day.json). Race r is races[r - 1]. */
  races: readonly Race[];
  track: Track;
  tuning: Tuning;
  rules: BettingRules;
}

/** The context from loaded data: loadBetting(game) and the sim's GameData (loadData()). */
export function dayContext(data: BettingData, game: GameData): DayContext {
  return { stable: data.stable, races: data.races, track: game.track, tuning: game.tuning, rules: data.rules };
}

/** One race of the day as drawn: known from the day seed alone (FD7). */
export interface DrawnRace {
  /** The day this race belongs to. */
  daySeed: number;
  /** 1 up. */
  race: number;
  name: string;
  /** Stable ids by post (index 0 is post 1). */
  horseIds: string[];
  styles: Style[];
  raceSeed: number;
  /** The sim's input: this race, this field, all default instructions. */
  input: GameData;
}

/** The program for one race: its draw, its estimate (never shown) and the crowd's money. */
export interface RaceProgram {
  drawn: DrawnRace;
  estimate: Estimate;
  crowdDollars: number[];
}

/** A placed bet, priced at post with its own money in the pool. */
export interface Ticket {
  race: number;
  post: number;
  dollars: number;
  stakeCents: number;
  odds: string;
  /** What it returns if it wins, stake included, in cents (BK2). */
  paysCents: number;
}

export interface RaceRecord {
  race: number;
  name: string;
  horseIds: string[];
  raceSeed: number;
  estimate: Estimate;
  crowdDollars: number[];
  /** Odds by post at post time, the player's bet in the pool. */
  odds: string[];
  ticket: Ticket | null;
  winnerPost: number;
  /** The winner's $2 price in cents, the player's bet in the pool. */
  winnerTwoDollarCents: number;
  winnerOdds: string;
  /** What the ticket returned, stake included: 0 when it lost or there was no bet. */
  returnCents: number;
  bankrollBeforeCents: number;
  bankrollAfterCents: number;
}

export type DayEnd = 'lastRace' | 'broke';

export interface DayState {
  daySeed: number;
  bankrollCents: number;
  /** The race to run next, 1 up. */
  nextRace: number;
  /** Set at Go to the post, cleared at settlement. Its stake has left the bankroll. */
  open: { program: RaceProgram; ticket: Ticket | null } | null;
  records: RaceRecord[];
  /** Why the day is over, or null while it goes on. */
  ended: DayEnd | null;
}

export interface DaySummary {
  daySeed: number;
  startCents: number;
  endCents: number;
  changeCents: number;
  racesRun: number;
  betsMade: number;
  winnersHit: number;
  /** The longest odds on a winning ticket, or null with none. */
  bestPriceHit: string | null;
  endedBy: DayEnd;
}

/** The day's eight (or however many) fields, race seeds and sim inputs, from the day seed alone. */
export function drawnDay(ctx: DayContext, daySeed: number): DrawnRace[] {
  checkSeed(daySeed);
  const fields = drawDay(ctx.stable.map((h) => ({ id: h.id, silksBody: h.silks.body })), daySeed, ctx.rules.draw);
  return fields.map((byPost, r) => {
    const race = ctx.races[r];
    const horses = byPost.map((i, k) => {
      const h = ctx.stable[i];
      return {
        id: h.id, name: h.name, jockey: h.jockey, post: k + 1, style: h.style, stats: { ...h.stats },
        instructions: { early: 'default', move: 'default', path: 'default' },
      };
    });
    return {
      daySeed,
      race: r + 1,
      name: race.name,
      horseIds: horses.map((h) => h.id),
      styles: horses.map((h) => h.style),
      raceSeed: raceSeedOf(daySeed, r + 1),
      input: validateData({ track: ctx.track, race, card: { horses }, tuning: ctx.tuning }),
    };
  });
}

/**
 * The program once the race's estimate is done. Pass the finished job (startEstimate and
 * stepEstimate): it carries its day seed and race, and one made for another day or race is
 * refused. A bare Estimate (runEstimate, estimateOf) carries neither, so only its size is checked.
 */
export function programFor(ctx: DayContext, drawn: DrawnRace, estimate: Estimate | EstimateJob): RaceProgram {
  let est: Estimate;
  if ('seeds' in estimate) {
    if (estimate.daySeed !== drawn.daySeed || estimate.race !== drawn.race) {
      throw new Error(`the estimate is for day seed ${estimate.daySeed} race ${estimate.race}, not day seed ${drawn.daySeed} race ${drawn.race}`);
    }
    est = estimateOf(estimate);
  } else {
    est = estimate;
  }
  if (est.wins.length !== drawn.horseIds.length) throw new Error(`race ${drawn.race}: the estimate has ${est.wins.length} horses, the field ${drawn.horseIds.length}`);
  return { drawn, estimate: est, crowdDollars: crowdFor(est, drawn.styles, drawn.daySeed, drawn.race, ctx.rules) };
}

/** Odds for every horse and what the bet pays, with the bet in the pool. Call it as the amount changes. */
export function quote(ctx: DayContext, program: RaceProgram, bet: Bet | null): Prices {
  return pricesWith(program.crowdDollars, bet, ctx.rules);
}

export function newDay(ctx: DayContext, daySeed: number): DayState {
  checkSeed(daySeed);
  const bankrollCents = ctx.rules.startCents;
  return { daySeed, bankrollCents, nextRace: 1, open: null, records: [], ended: canBet(bankrollCents, ctx.rules) ? null : 'broke' };
}

/** Go to the post: the stake leaves the bankroll now. A bet must be one of the offered amounts. */
export function goToPost(ctx: DayContext, state: DayState, program: RaceProgram, bet: Bet | null): DayState {
  if (state.ended !== null) throw new Error(`the day has ended (${state.ended})`);
  if (state.open !== null) throw new Error(`race ${state.open.program.drawn.race} is not settled yet`);
  if (program.drawn.daySeed !== state.daySeed) throw new Error(`race ${program.drawn.race} was drawn for day seed ${program.drawn.daySeed}; this day's seed is ${state.daySeed}`);
  if (program.drawn.race !== state.nextRace) throw new Error(`the next race is ${state.nextRace}, not ${program.drawn.race}`);
  let ticket: Ticket | null = null;
  if (bet !== null) {
    const offered = offeredAmounts(state.bankrollCents, ctx.rules);
    if (!offered.includes(bet.dollars)) throw new Error(`$${bet.dollars} is not offered with this bankroll; offered: ${offered.map((d) => `$${d}`).join(', ') || 'none'}`);
    const prices = quote(ctx, program, bet);
    ticket = { race: program.drawn.race, post: bet.post, dollars: bet.dollars, stakeCents: bet.dollars * 100, odds: prices.odds[bet.post - 1], paysCents: prices.paysCents! };
  }
  return { ...state, bankrollCents: state.bankrollCents - (ticket?.stakeCents ?? 0), open: { program, ticket } };
}

/**
 * Settles the open race from its result: watched, skipped or abandoned, the result is the
 * same, so the money is too (BK4). The day ends after the last race or when the bankroll is
 * below the minimum bet (BK5).
 */
export function settle(ctx: DayContext, state: DayState, result: RaceResult): DayState {
  if (state.open === null) throw new Error('no race is open: Go to the post first');
  const { program, ticket } = state.open;
  if (result.seed !== program.drawn.raceSeed) throw new Error(`race ${program.drawn.race} runs on seed ${program.drawn.raceSeed}, the result is for ${result.seed}`);
  const winnerPost = result.finish[0].post;
  const prices = quote(ctx, program, ticket === null ? null : { post: ticket.post, dollars: ticket.dollars });
  const returnCents = ticket !== null && ticket.post === winnerPost ? ticket.paysCents : 0;
  const bankrollAfterCents = state.bankrollCents + returnCents;
  const winnerPerDollar = prices.perDollarCents[winnerPost - 1];
  const record: RaceRecord = {
    race: program.drawn.race,
    name: program.drawn.name,
    horseIds: [...program.drawn.horseIds],
    raceSeed: program.drawn.raceSeed,
    estimate: { runs: program.estimate.runs, wins: [...program.estimate.wins] },
    crowdDollars: [...program.crowdDollars],
    odds: prices.odds,
    ticket,
    winnerPost,
    winnerTwoDollarCents: 2 * winnerPerDollar,
    winnerOdds: oddsLabel(winnerPerDollar, ctx.rules),
    returnCents,
    bankrollBeforeCents: state.bankrollCents + (ticket?.stakeCents ?? 0),
    bankrollAfterCents,
  };
  const last = program.drawn.race === ctx.races.length;
  const ended: DayEnd | null = last ? 'lastRace' : canBet(bankrollAfterCents, ctx.rules) ? null : 'broke';
  return { ...state, bankrollCents: bankrollAfterCents, nextRace: state.nextRace + 1, open: null, records: [...state.records, record], ended };
}

/** The End of day figures. Throws while the day goes on. */
export function daySummary(ctx: DayContext, state: DayState): DaySummary {
  if (state.ended === null) throw new Error('the day has not ended');
  const won = state.records.filter((r) => r.returnCents > 0);
  // Per-dollar returns compared by cross-multiplying, so it stays in whole numbers. Ties keep the earlier race.
  const best = won.reduce<RaceRecord | null>((b, r) => (b === null || r.ticket!.paysCents * b.ticket!.dollars > b.ticket!.paysCents * r.ticket!.dollars ? r : b), null);
  return {
    daySeed: state.daySeed,
    startCents: ctx.rules.startCents,
    endCents: state.bankrollCents,
    changeCents: state.bankrollCents - ctx.rules.startCents,
    racesRun: state.records.length,
    betsMade: state.records.filter((r) => r.ticket !== null).length,
    winnersHit: won.length,
    bestPriceHit: best === null ? null : best.ticket!.odds,
    endedBy: state.ended,
  };
}

export interface DayRecord {
  daySeed: number;
  races: (RaceRecord & { result: RaceResult })[];
  summary: DaySummary;
}

/**
 * A whole day headless (DT4): the same day seed and choices always give the same record.
 * choices[r - 1] is race r's bet, or null to pass; a broke day ignores the rest.
 * `runs` overrides the estimate's N (tests use a small one).
 */
export function playDay(ctx: DayContext, daySeed: number, choices: readonly (Bet | null)[], runs = ctx.rules.runsPerRace): DayRecord {
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`playDay: runs must be a whole number of 1 or more, got ${runs}`);
  let state = newDay(ctx, daySeed);
  const results: RaceResult[] = [];
  for (const drawn of drawnDay(ctx, daySeed)) {
    if (state.ended !== null) break;
    if (drawn.race > choices.length) throw new Error(`playDay: no choice given for race ${drawn.race}; use null to pass`);
    const program = programFor(ctx, drawn, runEstimate(drawn.input, daySeed, drawn.race, runs));
    state = goToPost(ctx, state, program, choices[drawn.race - 1]);
    const result = runRace(drawn.input, drawn.raceSeed);
    results.push(result);
    state = settle(ctx, state, result);
  }
  return { daySeed, races: state.records.map((r, i) => ({ ...r, result: results[i] })), summary: daySummary(ctx, state) };
}
