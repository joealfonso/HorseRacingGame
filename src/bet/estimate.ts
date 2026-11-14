import type { GameData } from '../data/schema';
import { runRace } from '../sim/runRace';

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
