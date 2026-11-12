import { describe, expect, it } from 'vitest';
import { runRace } from './runRace';
import { report, seedRange, shipped } from './testkit';

// T3: compute budget, starting guess. One race with its replay, run headless in Node:
// median under 20 ms and never over 100 ms across 500 seeds. One warm-up race is run
// first and left out, so the time to compile the code is not counted.
// This uses a clock, which test files may do and the sim itself may not.
describe('T3: compute budget', () => {
  it('500 races: median under 20 ms and none over 100 ms', () => {
    const data = shipped();
    runRace(data, 123456); // warm-up, not timed
    const ms: number[] = [];
    for (const seed of seedRange(0, 500)) {
      const t0 = performance.now();
      const r = runRace(data, seed);
      ms.push(performance.now() - t0);
      if (r.replay.horses[0].distance.length < 100) throw new Error('the race did not include a replay');
    }
    ms.sort((a, b) => a - b);
    const median = (ms[249] + ms[250]) / 2;
    const worst = ms[499];
    report('T3 ms per race', { median, worst, p99: ms[494] });
    expect(ms).toHaveLength(500);
    expect(median).toBeLessThan(20);
    expect(worst).toBeLessThan(100);
  });
});
