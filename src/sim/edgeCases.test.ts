import { describe, expect, it } from 'vitest';
import { runRace } from './runRace';
import { bytes, equalSpecs, problems, seedRange, shipped, withField, withRace, type Spec } from './testkit';
import type { RunningStyle } from '../data/schema';

// The edge cases the spec lists: seeds at both ends, the smallest and largest field, slow
// going, and every whole distance from 5 to 12 furlongs.
const data = shipped();
const STYLES: RunningStyle[] = ['frontRunner', 'stalker', 'closer'];
const mixed = (n: number): Spec[] => Array.from({ length: n }, (_v, i) => ({ style: STYLES[i % 3], speed: 55 + ((i * 7) % 30), stamina: 55 + ((i * 11) % 30), kick: 55 + ((i * 5) % 30) }));

describe('seeds at both ends of the range (R1)', () => {
  it.each([0, 4294967295])('seed %i runs and gives a sound result that repeats', (seed) => {
    const r = runRace(data, seed);
    expect(r.seed).toBe(seed);
    expect(problems(r)).toEqual([]);
    expect(bytes(runRace(data, seed))).toBe(bytes(r));
  });

  it('the two ends give different races', () => {
    expect(bytes(runRace(data, 0))).not.toBe(bytes(runRace(data, 4294967295)));
  });

  it.each([-1, 1.5, NaN, Infinity, 4294967296, '7'])('a bad seed (%s) is rejected with an error that names the seed, and no result', (seed) => {
    expect(() => runRace(data, seed as number)).toThrow(/seed/i);
  });
});

describe('field size', () => {
  it('a field of 2 runs; places 1 and 2, one margin, every call has both horses', () => {
    for (const seed of seedRange(0, 50)) {
      const r = runRace(withField(data, mixed(2)), seed);
      expect(problems(r), `seed ${seed}`).toEqual([]);
      expect(r.finish.map((f) => f.place)).toEqual([1, 2]);
      expect(r.finish[1].margin).not.toBeNull();
      expect(r.photoFinish).toBe(r.finish[1].margin!.lengths < data.tuning.photoFinishThresholdLengths.value * 1000);
      for (const c of r.calls) expect(c.horses.map((h) => h.position)).toEqual([1, 2]);
    }
  });

  it('a field of 20 runs; places 1 to 20, lanes inside the maximum, every call has all 20', () => {
    for (const seed of seedRange(0, 50)) {
      const r = runRace(withField(data, mixed(20)), seed);
      expect(problems(r), `seed ${seed}`).toEqual([]);
      expect(r.finish.map((f) => f.place)).toEqual(Array.from({ length: 20 }, (_v, i) => i + 1));
      for (const c of r.calls) expect(c.horses).toHaveLength(20);
      expect(r.replay.horses).toHaveLength(20);
    }
  });

  it('a field of 20 listed in a different order gives the same bytes', () => {
    const d = withField(data, mixed(20));
    const back = structuredClone(d);
    back.card.horses.reverse();
    expect(bytes(runRace(back, 5))).toBe(bytes(runRace(d, 5)));
  });

  it('eight horses with identical stats and style still give a strict order', () => {
    const d = withField(data, equalSpecs(8, 'stalker'));
    for (const seed of seedRange(0, 50)) expect(runRace(d, seed).finish.map((f) => f.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('going', () => {
  it.each(['fast', 'good', 'muddy', 'sloppy'])('%s going runs and gives sound results', (going) => {
    const d = withRace(data, (r) => { r.going = going; });
    for (const seed of seedRange(0, 50)) expect(problems(runRace(d, seed)), `seed ${seed}`).toEqual([]);
  });

  it('the sloppy and muddy results say so in their echo', () => {
    expect(runRace(withRace(data, (r) => { r.going = 'sloppy'; }), 1).inputs.race.going).toBe('sloppy');
    expect(runRace(withRace(data, (r) => { r.going = 'muddy'; }), 1).inputs.race.going).toBe('muddy');
  });
});

describe('every whole distance from 5 to 12 furlongs', () => {
  it.each([5, 6, 7, 8, 9, 10, 11, 12])('%i furlongs runs, finishes everyone and has a sound replay', (d) => {
    for (const seed of seedRange(0, 20)) {
      const r = runRace(withRace(data, (x) => { x.distanceFurlongs = d; }), seed);
      expect(problems(r), `seed ${seed}`).toEqual([]);
      expect(r.inputs.race.distanceFurlongs).toBe(d);
      expect(r.calls.map((c) => c.furlongsToGo)).toEqual(Array.from({ length: d - 1 }, (_v, i) => d - 1 - i));
    }
  });

  it('longer races take longer, in whole: 5 furlongs under 70 seconds, 12 furlongs over 140', () => {
    const t = (d: number) => runRace(withRace(data, (x) => { x.distanceFurlongs = d; }), 3).finish[0].time / 100;
    expect(t(5)).toBeLessThan(70);
    expect(t(12)).toBeGreaterThan(140);
    for (let d = 6; d <= 12; d++) expect(t(d)).toBeGreaterThan(t(d - 1));
  });

  it('every distance on every going', () => {
    for (const going of ['fast', 'good', 'muddy', 'sloppy']) {
      for (let d = 5; d <= 12; d++) {
        const r = runRace(withRace(data, (x) => { x.distanceFurlongs = d; x.going = going; }), 9);
        expect(problems(r), `${d}f ${going}`).toEqual([]);
      }
    }
  });
});
