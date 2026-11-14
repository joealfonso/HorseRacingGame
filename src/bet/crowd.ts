import type { RUNNING_STYLES } from '../data/schema';
import type { Stream } from '../sim/rng';

export type Style = (typeof RUNNING_STYLES)[number];

export interface CrowdValues {
  noise: number;
  styleLean: Record<Style, number>;
  flatten: number;
}

/**
 * The crowd's whole dollars per horse, by post (spec "The crowd", steps 1 to 6). `wins` and
 * `styles` are by post. `stream` is the race's `crowd` stream: three draws per horse, in post order.
 * Only + - * / and floor, so every engine gives the same dollars.
 */
export function crowdDollars(
  wins: readonly number[],
  runs: number,
  styles: readonly Style[],
  stream: Stream,
  values: CrowdValues,
  poolDollars: number,
): number[] {
  const size = wins.length;
  if (styles.length !== size) throw new Error('crowdDollars: wins and styles must both be by post, one per horse');
  if (poolDollars < size) throw new Error(`crowdDollars: a pool of $${poolDollars} cannot give ${size} horses $1 each`);

  const floor = 0.5 / runs;
  const belief = wins.map((w, i) => {
    const p = Math.max(w / runs, floor);
    const u = ((stream.float() + stream.float() + stream.float()) / 3) * 2 - 1;
    return p * (1 + values.noise * u) * (1 + values.styleLean[styles[i]]);
  });
  const total = belief.reduce((a, b) => a + b, 0);
  const share = belief.map((b) => (1 - values.flatten) * (b / total) + values.flatten / size);

  // Largest remainder, ties to the lower post.
  const raw = share.map((c) => poolDollars * c);
  const dollars = raw.map((r) => Math.floor(r));
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  let left = poolDollars - dollars.reduce((a, b) => a + b, 0);
  for (let k = 0; left > 0; k = (k + 1) % size, left--) dollars[order[k].i]++;
  for (; left < 0; left++) dollars[order[order.length - 1].i]--; // float sum just over the pool; not seen, but safe

  // Every horse at least $1, taken from the horse with the most (ties to the lower post).
  for (let i = 0; i < size; i++) {
    while (dollars[i] < 1) {
      let top = 0;
      for (let j = 1; j < size; j++) if (dollars[j] > dollars[top]) top = j;
      dollars[top]--;
      dollars[i]++;
    }
  }
  return dollars;
}
