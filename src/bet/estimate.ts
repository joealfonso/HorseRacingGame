import type { GameData } from '../data/schema';
import { runRace } from '../sim/runRace';
import { estimateSeedsOf } from './streams';

/** The winner's post for each seed, in seed order. */
export function winnerPosts(field: GameData, seeds: readonly number[]): number[] {
  return seeds.map((seed) => runRace(field, seed).finish[0].post);
}

/** Wins by post (index 0 is post 1), counted from a list of winners' posts. */
export function winsByPost(winners: readonly number[], fieldSize: number): number[] {
  const wins = new Array<number>(fieldSize).fill(0);
  for (const post of winners) wins[post - 1]++;
  return wins;
}

/** A finished estimate: wins by post out of `runs`. A horse's estimate is wins / runs. Never shown. */
export interface Estimate {
  runs: number;
  wins: number[];
}

/**
 * A resumable estimate: plain data, so it can be stepped across frames on the main thread or
 * posted to and from a worker. `done` seeds of `seeds` have run; `wins` counts them by post.
 * Seeds run in order and only the count is kept, so the result does not depend on how the
 * work is sliced.
 */
export interface EstimateJob {
  /** The day and race the seeds belong to, so a job cannot be used for another race. */
  daySeed: number;
  race: number;
  seeds: number[];
  done: number;
  wins: number[];
}

/** Race `race` of the day: its N estimate seeds, none of them the real race's seed. */
export function startEstimate(daySeed: number, race: number, runs: number, fieldSize: number): EstimateJob {
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`an estimate needs a whole number of runs of 1 or more, got ${runs}`);
  return { daySeed, race, seeds: estimateSeedsOf(daySeed, race, runs), done: 0, wins: new Array<number>(fieldSize).fill(0) };
}

/** Runs up to `maxRuns` more sim runs. Returns a new job; the one given is not changed. */
export function stepEstimate(job: EstimateJob, field: GameData, maxRuns: number): EstimateJob {
  if (!Number.isInteger(maxRuns) || maxRuns < 0) throw new Error(`stepEstimate: maxRuns must be a whole number of 0 or more, got ${maxRuns}`);
  if (field.card.horses.length !== job.wins.length) throw new Error(`stepEstimate: the job counts ${job.wins.length} horses, the field has ${field.card.horses.length}`);
  const wins = [...job.wins];
  const end = Math.min(job.seeds.length, job.done + maxRuns);
  for (let i = job.done; i < end; i++) wins[runRace(field, job.seeds[i]).finish[0].post - 1]++;
  return { daySeed: job.daySeed, race: job.race, seeds: job.seeds, done: end, wins };
}

export const estimateDone = (job: EstimateJob): boolean => job.done === job.seeds.length;

/** The finished estimate. Throws if runs remain. */
export function estimateOf(job: EstimateJob): Estimate {
  if (!estimateDone(job)) throw new Error(`estimate not finished: ${job.done} of ${job.seeds.length} runs`);
  return { runs: job.seeds.length, wins: [...job.wins] };
}

/** The whole estimate in one call, for Node, tests and a worker that does not need to report progress. */
export function runEstimate(field: GameData, daySeed: number, race: number, runs: number): Estimate {
  const job = startEstimate(daySeed, race, runs, field.card.horses.length);
  return estimateOf(stepEstimate(job, field, runs));
}
