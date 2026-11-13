import { describe, expect, it } from 'vitest';
import { runRace, SIM_VERSION } from './runRace';
import { bytes, deepFreeze, equalSpecs, seedRange, shipped, withField, withRace } from './testkit';

// S1 to S4: the same inputs and seed give the same bytes, whatever else happened in the
// process and however the field was listed.
const SEEDS = [0, 1, 2, 7, 99, 12345, 2024, 4294967295];

describe('S1: running the same inputs and seed twice gives identical bytes', () => {
  it.each(SEEDS)('seed %i', (seed) => {
    const data = shipped();
    expect(bytes(runRace(data, seed))).toBe(bytes(runRace(data, seed)));
  });

  it('holds for a freshly loaded copy of the data too', () => {
    expect(bytes(runRace(shipped(), 42))).toBe(bytes(runRace(shipped(), 42)));
  });

  it('different seeds give different results', () => {
    const data = shipped();
    const distinct = new Set(seedRange(0, 20).map((s) => JSON.stringify(runRace(data, s).finish)));
    expect(distinct.size).toBeGreaterThan(10);
  });
});

describe('S2: nothing carries over between races', () => {
  it('race A, race B, race A gives the same bytes for both A runs', () => {
    const a = shipped();
    const b = withRace(withField(shipped(), equalSpecs(20, 'closer', 55)), (r) => { r.going = 'sloppy'; r.distanceFurlongs = 7; });
    const first = bytes(runRace(a, 31));
    const between = bytes(runRace(b, 32));
    const second = bytes(runRace(a, 31));
    expect(second).toBe(first);
    expect(between).not.toBe(first);
  });

  it('running a different seed on the same data in between does not matter', () => {
    const data = shipped();
    const first = bytes(runRace(data, 5));
    for (const s of seedRange(100, 10)) runRace(data, s);
    expect(bytes(runRace(data, 5))).toBe(first);
  });

  it('editing a result does not change the next one', () => {
    const data = shipped();
    const first = bytes(runRace(data, 9));
    const r = runRace(data, 9) as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    r.units.time = 'changed';
    r.finish[0].time = -1;
    r.replay.horses[0].distance[3] = -1;
    r.inputs.tuning.horseLengthFeet.value = 999;
    expect(bytes(runRace(data, 9))).toBe(first);
  });
});

describe('S3: the sim does not change its inputs', () => {
  it('runs on deep-frozen inputs without throwing', () => {
    const data = deepFreeze(shipped());
    expect(() => runRace(data, 3)).not.toThrow();
    expect(Object.isFrozen(data.card.horses[0].stats)).toBe(true);
  });

  it('the frozen run gives the same bytes as an unfrozen run', () => {
    expect(bytes(runRace(deepFreeze(shipped()), 3))).toBe(bytes(runRace(shipped(), 3)));
  });

  it('inputs are equal to a snapshot taken before the run', () => {
    const data = shipped();
    const before = structuredClone(data);
    runRace(data, 11);
    expect(data).toEqual(before);
    // toEqual ignores key order, so check the order of the card as well.
    expect(data.card.horses.map((h) => h.id)).toEqual(before.card.horses.map((h) => h.id));
  });
});

describe('S4: listing the field in a different order, with the same posts, gives identical bytes', () => {
  const orders: [string, (xs: number[]) => number[]][] = [
    ['reversed', (xs) => [...xs].reverse()],
    ['rotated by three', (xs) => [...xs.slice(3), ...xs.slice(0, 3)]],
    ['evens then odds', (xs) => [...xs.filter((_x, i) => i % 2 === 0), ...xs.filter((_x, i) => i % 2 === 1)]],
  ];

  it.each(orders)('shipped card %s', (_name, order) => {
    const data = shipped();
    const idx = order(data.card.horses.map((_h, i) => i));
    const shuffled = structuredClone(data);
    shuffled.card.horses = idx.map((i) => structuredClone(data.card.horses[i]));
    // The shipped card is not listed by post, so first check the two orders differ.
    expect(shuffled.card.horses.map((h) => h.id)).not.toEqual(data.card.horses.map((h) => h.id));
    for (const seed of [0, 17, 4294967295]) expect(bytes(runRace(shuffled, seed))).toBe(bytes(runRace(data, seed)));
  });

  it('the shipped card listed by post gives the same bytes as the card as shipped', () => {
    const data = shipped();
    const byPost = structuredClone(data);
    byPost.card.horses.sort((a, b) => a.post - b.post);
    expect(byPost.card.horses.map((h) => h.id)).not.toEqual(data.card.horses.map((h) => h.id));
    for (const seed of seedRange(0, 10)) expect(bytes(runRace(byPost, seed))).toBe(bytes(runRace(data, seed)));
  });

  it('a field listed in post order against the same field listed backwards', () => {
    const data = withField(shipped(), equalSpecs(8, 'stalker'));
    const back = structuredClone(data);
    back.card.horses.reverse();
    expect(back.card.horses[0].post).toBe(8);
    for (const seed of seedRange(0, 10)) expect(bytes(runRace(back, seed))).toBe(bytes(runRace(data, seed)));
  });

  it('the order the keys were written in does not matter either', () => {
    const data = shipped();
    const flipped = JSON.parse(JSON.stringify(data, (_k, v) =>
      v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v));
    expect(bytes(runRace(flipped, 8))).toBe(bytes(runRace(data, 8)));
  });
});

describe('a seed of -0', () => {
  it('is seed 0: the result carries +0 and the same bytes as seed 0', () => {
    const data = shipped();
    const r = runRace(data, -0);
    expect(Object.is(r.seed, 0)).toBe(true);
    expect(bytes(r)).toBe(bytes(runRace(data, 0)));
    expect(JSON.parse(JSON.stringify(r))).toStrictEqual(r);
  });
});

describe('the version', () => {
  it('SIM_VERSION is a whole number and is written into every result', () => {
    expect(Number.isInteger(SIM_VERSION)).toBe(true);
    expect(SIM_VERSION).toBeGreaterThanOrEqual(1);
    expect(runRace(shipped(), 1).simVersion).toBe(SIM_VERSION);
  });
});
