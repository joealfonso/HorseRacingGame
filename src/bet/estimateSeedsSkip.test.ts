import { describe, expect, it, vi } from 'vitest';
import type * as Rng from '../sim/rng';

// OD2 from the spec ("The estimate"): estimate seeds skip any that equal the real
// race's seed, and are N distinct values. A real 32-bit stream almost never collides, so
// here the estimateSeeds stream is scripted to repeat itself and to hit the race seed.

const script: number[] = [];

vi.mock('../sim/rng', async (importOriginal) => {
  const real = await importOriginal<typeof Rng>();
  return {
    ...real,
    createStream(seed: number, name: string, subKey?: string): Rng.Stream {
      const stream = real.createStream(seed, name, subKey);
      if (name !== 'estimateSeeds') return stream;
      const queue = [...script];
      return {
        float: () => stream.float(),
        int: (min: number, max: number) => (queue.length > 0 ? queue.shift()! : stream.int(min, max)),
      };
    },
  };
});

const { estimateSeedsOf, raceSeedOf } = await import('./streams');
const { startEstimate } = await import('./estimate');

describe('OD2: estimate seeds skip the race seed and repeats', () => {
  it('OD2: a stream that draws the race seed and repeats still gives N distinct seeds, none the race seed', () => {
    const day = 123;
    const race = 4;
    const rs = raceSeedOf(day, race);
    script.length = 0;
    script.push(rs, 10, 10, rs, 11, 10, 12, rs, 13);
    const seeds = estimateSeedsOf(day, race, 6);
    expect(seeds.slice(0, 4)).toEqual([10, 11, 12, 13]);
    expect(seeds).toHaveLength(6);
    expect(new Set(seeds).size).toBe(6);
    expect(seeds).not.toContain(rs);
    const job = startEstimate(day, race, 6, 8);
    expect(job.seeds).not.toContain(rs);
    expect(new Set(job.seeds).size).toBe(6);
  });
});
