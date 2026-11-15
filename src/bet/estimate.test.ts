import { describe, expect, it } from 'vitest';
import { runRace } from '../sim/runRace';
import { drawnDay } from './day';
import { estimateDone, estimateOf, runEstimate, startEstimate, stepEstimate } from './estimate';
import { estimateSeedsOf, raceSeedOf } from './streams';
import { realCtx } from './testkit';

// OD1 and the estimate job (docs/specs/betting-simple.md, "The estimate"). Small N: each sim
// run costs a few milliseconds.

const ctx = realCtx();
const DAY = 9001;
const day = drawnDay(ctx, DAY);
const N = 24;

describe('OD1: the estimate is wins counted from runRace on exactly its estimate seeds', () => {
  it('OD1: recomputed for race 3 at N = 24', () => {
    const r = day[2];
    const seeds = estimateSeedsOf(DAY, 3, N);
    const wins = new Array<number>(8).fill(0);
    for (const s of seeds) wins[runRace(r.input, s).finish[0].post - 1]++;
    const est = runEstimate(r.input, DAY, 3, N);
    expect(est).toEqual({ runs: N, wins });
  });

  it('OD1: the job\'s seeds are the estimate seeds, and none is the race seed', () => {
    const job = startEstimate(DAY, 5, N, 8);
    expect(job.seeds).toEqual(estimateSeedsOf(DAY, 5, N));
    expect(job.seeds).not.toContain(raceSeedOf(DAY, 5));
    expect(job.done).toBe(0);
    expect(job.wins).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('OD1: wins sum to N, each a whole number', () => {
    const est = runEstimate(day[0].input, DAY, 1, N);
    expect(est.wins.reduce((a, b) => a + b, 0)).toBe(N);
    for (const w of est.wins) expect(Number.isInteger(w)).toBe(true);
    expect(est.wins).toHaveLength(8);
  });
});

describe('OD1: the estimate job gives the same answer however the work is sliced', () => {
  const r = day[1];
  const whole = runEstimate(r.input, DAY, 2, N);

  const sliced = (sizes: number[]) => {
    let job = startEstimate(DAY, 2, N, 8);
    let k = 0;
    while (!estimateDone(job)) {
      job = stepEstimate(job, r.input, sizes[k % sizes.length]);
      k++;
      if (k > 10 * N) throw new Error('the job never finished');
    }
    return estimateOf(job);
  };

  it.each([[[1]], [[5]], [[7, 1, 3]], [[N]], [[N + 50]], [[0, 2]]])('OD1: slices of %j give the whole estimate', (sizes) => {
    expect(sliced(sizes)).toEqual(whole);
  });

  it('OD1: a step does not change the job it was given', () => {
    const job = startEstimate(DAY, 2, N, 8);
    const before = structuredClone(job);
    const next = stepEstimate(job, r.input, 3);
    expect(job).toEqual(before);
    expect(next.done).toBe(3);
    expect(next.wins.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('OD1: the job is plain data: a JSON round trip mid-way finishes the same', () => {
    let job = stepEstimate(startEstimate(DAY, 2, N, 8), r.input, 10);
    job = JSON.parse(JSON.stringify(job));
    job = stepEstimate(job, r.input, N);
    expect(estimateOf(job)).toEqual(whole);
  });

  it('OD1: an unfinished estimate can not be read', () => {
    const job = stepEstimate(startEstimate(DAY, 2, N, 8), r.input, N - 1);
    expect(estimateDone(job)).toBe(false);
    expect(() => estimateOf(job)).toThrow();
  });
});
