// Fixtures for the B5 betting screen tests (docs/specs/betting-screens.md). Test support only:
// nothing in the game imports this file. Expected values in the tests come from the spec.
import { drawnDay, goToPost, newDay, programFor, settle, type DayContext, type DayState, type DrawnRace, type RaceProgram } from '../bet/day';
import type { Estimate } from '../bet/estimate';
import { runEstimate } from '../bet/estimate';
import { game as betGame, realCtx } from '../bet/testkit';
import { loadBetting } from '../data/bettingLoad';
import { cardLookSchema, type CardLook } from '../data/raceDaySchema';
import { fieldForRaceDay } from '../data/bettingLoad';
import type { RaceResult } from '../sim/result';
import type { ProgramInput, ProgramState } from './programScreen';
import { programScreen } from './programScreen';
import { shippedRaceDay } from './testkit';

export const ctx: DayContext = realCtx();
export const betting = loadBetting(betGame());
export const rd = shippedRaceDay.raceDay;
export const DAY_SEED = 12345;
/** Small on purpose: the estimate at 1,000 runs takes seconds. */
export const RUNS = 12;

const drawnCache = new Map<number, DrawnRace[]>();
export const drawnOf = (daySeed = DAY_SEED): DrawnRace[] => {
  let d = drawnCache.get(daySeed);
  if (!d) { d = drawnDay(ctx, daySeed); drawnCache.set(daySeed, d); }
  return d;
};

export const lookFor = (drawn: DrawnRace): CardLook => cardLookSchema.parse(fieldForRaceDay(betting, drawn.input).cardLook);

const programCache = new Map<string, RaceProgram>();
/** Race `race` (1 up) of the day, with a small estimate. */
export function programOf(race: number, daySeed = DAY_SEED): RaceProgram {
  const key = `${daySeed}:${race}`;
  let p = programCache.get(key);
  if (!p) {
    const drawn = drawnOf(daySeed)[race - 1];
    p = programFor(ctx, drawn, runEstimate(drawn.input, daySeed, race, RUNS));
    programCache.set(key, p);
  }
  return p;
}

/** A day on race 1 with a given bankroll in cents. */
export const dayWith = (bankrollCents: number): DayState => ({ ...newDay(ctx, DAY_SEED), bankrollCents });

export function inputFor(program: RaceProgram | null, drawn: DrawnRace, day: DayState, state: ProgramState, extra: Partial<ProgramInput> = {}): ProgramInput {
  return { ctx, rd, look: lookFor(drawn), drawn, program, day, state, ...extra };
}

export const screenOf = (program: RaceProgram | null, day: DayState, state: ProgramState, drawn = program!.drawn) =>
  programScreen(inputFor(program, drawn, day, state));

/** A result that settle() can use: only the seed and the winner's post matter to it. */
export const fakeResult = (program: RaceProgram, winnerPost: number): RaceResult =>
  ({ seed: program.drawn.raceSeed, finish: [{ post: winnerPost }] }) as unknown as RaceResult;

/** The day after Go to the post, with a bet or a pass. */
export const posted = (program: RaceProgram, day: DayState, bet: { post: number; dollars: number } | null): DayState => goToPost(ctx, day, program, bet);
export const settled = (program: RaceProgram, day: DayState, bet: { post: number; dollars: number } | null, winnerPost: number): DayState =>
  settle(ctx, posted(program, day, bet), fakeResult(program, winnerPost));

/** Paints rects in order into a pixel map, later rects over earlier ones. */
export function paint(rects: readonly { x: number; y: number; w: number; h: number; color: string }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rects) for (let x = r.x; x < r.x + r.w; x++) for (let y = r.y; y < r.y + r.h; y++) m.set(`${x},${y}`, r.color);
  return m;
}

export const estimateOf = (wins: number[]): Estimate => ({ runs: wins.reduce((a, b) => a + b, 0), wins });
