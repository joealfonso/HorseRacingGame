import { describe, expect, it } from 'vitest';
import type { RaceResult } from '../sim/result';
import { stripAt, stripOrders } from './strip';
import { game, race, rd, seeds } from './testkit';

// The running order strip, spec 4.3 and criterion H1.

const HYST = rd.hud.stripHysteresisLengths.value; // 0.1 length, from data
const LENGTH_FEET = game.tuning.horseLengthFeet.value;
/** The hysteresis in the replay's unit, hundredths of a foot. */
const HYST_UNITS = HYST * LENGTH_FEET * 100;

describe('H1: the strip is a permutation, swaps need a clear gap, and it ends as the finish', () => {
  const SEEDS = seeds(60);

  it('H1: the data hysteresis is 0.1 length of 8 feet (80 hundredths)', () => {
    expect(HYST).toBe(0.1);
    expect(HYST_UNITS).toBeCloseTo(80, 9);
  });

  it('H1: at every sample the strip holds every horse exactly once', () => {
    for (const seed of SEEDS) {
      const r = race(seed);
      const orders = stripOrders(r, HYST);
      expect(orders).toHaveLength(r.replay.horses[0].distance.length);
      const ids = r.replay.horses.map((h) => h.id).sort();
      orders.forEach((order, i) => {
        expect([...order].sort(), `seed ${seed} sample ${i}`).toEqual(ids);
      });
    }
  });

  it('H1: horses that have finished lead the strip in finish order; the rest follow', () => {
    for (const seed of SEEDS) {
      const r = race(seed);
      const orders = stripOrders(r, HYST);
      orders.forEach((order, i) => {
        const t = i * r.replay.step;
        const done = r.finish.filter((f) => f.time <= t).map((f) => f.id);
        expect(order.slice(0, done.length), `seed ${seed} sample ${i}`).toEqual(done);
      });
    }
  });

  it('H1: once every horse has finished, the strip equals result.finish', () => {
    for (const seed of SEEDS) {
      const r = race(seed);
      const orders = stripOrders(r, HYST);
      const lastTime = (orders.length - 1) * r.replay.step;
      expect(lastTime).toBeGreaterThanOrEqual(Math.max(...r.finish.map((f) => f.time)));
      expect(orders[orders.length - 1], `seed ${seed}`).toEqual(r.finish.map((f) => f.id));
    }
  });

  it('H1: a running pair swaps only when the horse behind gets more than the hysteresis ahead', () => {
    let swaps = 0;
    for (const seed of SEEDS) {
      const r = race(seed);
      const orders = stripOrders(r, HYST);
      const dist = new Map(r.replay.horses.map((h) => [h.id, h.distance]));
      for (let i = 1; i < orders.length; i++) {
        const t = i * r.replay.step;
        const running = (id: string) => r.finish.find((f) => f.id === id)!.time > t;
        const before = orders[i - 1].filter(running);
        const after = orders[i].filter(running);
        for (let a = 0; a < before.length; a++) {
          for (let b = a + 1; b < before.length; b++) {
            const [x, y] = [before[a], before[b]]; // x was ahead of y in the strip
            if (after.indexOf(y) < after.indexOf(x)) {
              swaps++;
              const gap = dist.get(y)![i] - dist.get(x)![i];
              expect(gap, `seed ${seed} sample ${i}: ${y} passed ${x}`).toBeGreaterThan(HYST_UNITS);
            }
          }
        }
      }
    }
    expect(swaps).toBeGreaterThan(0);
  });

  it('H1: and it does swap when the gap is clear: no running neighbour is behind its follower by more than the hysteresis', () => {
    for (const seed of SEEDS) {
      const r = race(seed);
      const orders = stripOrders(r, HYST);
      const dist = new Map(r.replay.horses.map((h) => [h.id, h.distance]));
      orders.forEach((order, i) => {
        const t = i * r.replay.step;
        const running = order.filter((id) => r.finish.find((f) => f.id === id)!.time > t);
        for (let j = 0; j + 1 < running.length; j++) {
          const gap = dist.get(running[j + 1])![i] - dist.get(running[j])![i];
          expect(gap, `seed ${seed} sample ${i}`).toBeLessThanOrEqual(HYST_UNITS);
        }
      });
    }
  });

  it('H1: at the gate the strip is by distance and, with everyone level, by post', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const r = race(seed);
      const first = stripOrders(r, HYST)[0];
      expect(r.replay.horses.every((h) => h.distance[0] === 0)).toBe(true);
      const byPost = [...r.replay.horses].sort((a, b) => a.post - b.post).map((h) => h.id);
      expect(first).toEqual(byPost);
    }
  });

  describe('hysteresis on a made-up pair', () => {
    // Two horses, 10 hundredths between samples. Horse a leads, then b creeps up.
    // Hysteresis 0.1 length of 8 feet is 80 hundredths of a foot.
    const fake = (a: number[], b: number[]): RaceResult => ({
      replay: {
        step: 10,
        horses: [
          { id: 'a', post: 1, distance: a, lane: a.map(() => 0), finishTime: 99999, extraGround: 0 },
          { id: 'b', post: 2, distance: b, lane: b.map(() => 0), finishTime: 99999, extraGround: 0 },
        ],
      },
      finish: [
        { place: 1, id: 'a', post: 1, time: 99998, margin: null, beatenLengths: 0 },
        { place: 2, id: 'b', post: 2, time: 99999, margin: null, beatenLengths: 0 },
      ],
      inputs: { tuning: { horseLengthFeet: { value: 8 } } },
    }) as unknown as RaceResult;

    it('H1: b draws level, then 79 ahead, then 80 ahead: still a first. 81 ahead: b first. Back within 80: b stays first', () => {
      const a = [1000, 1000, 1000, 1000, 1000, 1000, 1000];
      const b = [900, 1000, 1079, 1080, 1081, 1031, 920];
      const order = stripOrders(fake(a, b), 0.1).map((s) => s.join(''));
      // sample: 0 a ahead | 1 level (tie, a keeps the lead) | 2 b +79 | 3 b +80 (not past) | 4 b +81 (swap) | 5 a +? b +31 | 6 a leads by 80
      expect(order).toEqual(['ab', 'ab', 'ab', 'ab', 'ba', 'ba', 'ba']);
    });

    it('H1: then a swaps back only once it is clear by more than 80 again', () => {
      const a = [1000, 1000, 1000, 1000, 1000];
      const b = [1100, 1000 - 40, 1000 - 80, 1000 - 81, 1000 - 200];
      // b starts ahead by 100, so b leads; a only retakes the lead at the 81 and 200 gaps.
      const order = stripOrders(fake(a, b), 0.1).map((s) => s.join(''));
      expect(order).toEqual(['ba', 'ba', 'ba', 'ab', 'ab']);
    });
  });
});

describe('stripAt: the strip shown at a race time', () => {
  const r = race(2);
  const orders = stripOrders(r, HYST);
  const { step } = r.replay;

  it('shows the latest sample at or before t, and holds it until the next', () => {
    expect(stripAt(orders, step, 0)).toBe(orders[0]);
    expect(stripAt(orders, step, step - 0.01)).toBe(orders[0]);
    expect(stripAt(orders, step, step)).toBe(orders[1]);
    expect(stripAt(orders, step, 5 * step + 3)).toBe(orders[5]);
  });

  it('is the first strip before the gate and the last after the end', () => {
    expect(stripAt(orders, step, -100)).toBe(orders[0]);
    expect(stripAt(orders, step, 1e9)).toBe(orders[orders.length - 1]);
  });

  it('is empty, not an error, with no samples', () => {
    expect(stripAt([], step, 100)).toEqual([]);
  });
});
