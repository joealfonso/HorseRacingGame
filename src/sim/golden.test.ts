import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateData } from '../data/validate';
import { runRace, SIM_VERSION } from './runRace';

// S5: golden results.
//
// The files in ./golden are a frozen copy of the track, race, card and tuning (inputs.json)
// and the serialized result for each fixed seed below, the exact output of
// JSON.stringify(result) with no extra arguments and no trailing newline. The inputs are a
// copy on purpose: tuning changes in src/data/ must not break this test.
//
// Two sets come from the same frozen inputs (decided after M1.5):
//   luck-off-seed-<n>.json: the three luck rates overridden to zero in this test. Pins the
//     model alone, and proves L1 (they equal the M1.4 results apart from simVersion and the echoed rates).
//   luck-on-seed-<n>.json: the inputs as frozen, with the shipped nonzero luck rates. The three
//     seeds were chosen because each has at least one event, and between them all three types appear.
//
// The result files were produced by running the current implementation once. That is the
// one place in the M1.3 tests where expected values come from the code and not from the spec.
//
// WHEN YOU MAY REGENERATE: only when the model changes on purpose. In the same PR, bump
// SIM_VERSION in runRace.ts and say in the PR description why the results changed. Never
// regenerate to make a failing test pass without knowing why it failed. To regenerate:
//
//   UPDATE_GOLDEN=1 npm test -- golden
//
// With UPDATE_GOLDEN=1 this test writes the files instead of comparing, and passes.
// inputs.json is never rewritten by this test: edit it by hand if the data shape changes.
//
// Regenerated for M1.5 (luck events, SIM_VERSION 2): inputs.json got the luck.events,
// instructions and trackBias groups and the shipped luck rates, and the files were renamed
// into the two sets above.

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'golden');
const OFF_SEEDS = [0, 1, 777, 123456789, 4294967295];
const ON_SEEDS = [3, 11, 46];
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const RATES = ['blockedPerHorse', 'steadiedPerHorse', 'bumpedPerHorse'] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const inputs = (): any => JSON.parse(readFileSync(join(DIR, 'inputs.json'), 'utf8'));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const luckOffInputs = (): any => {
  const raw = inputs();
  for (const k of RATES) raw.tuning.luck[k].value = 0;
  return raw;
};
const offFile = (seed: number) => join(DIR, `luck-off-seed-${seed}.json`);
const onFile = (seed: number) => join(DIR, `luck-on-seed-${seed}.json`);

describe('S5: golden results', () => {
  it('the frozen inputs still pass validation', () => {
    expect(() => validateData(inputs())).not.toThrow();
  });

  it('the frozen inputs carry the shipped luck rates, all above zero, and the luck.events group', () => {
    const luck = inputs().tuning.luck;
    for (const k of RATES) expect(luck[k].value, k).toBeGreaterThan(0);
    expect(luck.events).toBeDefined();
  });

  it('there are at least five luck-off seeds, including both ends of the seed range', () => {
    expect(OFF_SEEDS.length).toBeGreaterThanOrEqual(5);
    expect(OFF_SEEDS).toContain(0);
    expect(OFF_SEEDS).toContain(4294967295);
  });

  describe('luck off (the model alone)', () => {
    it.each(OFF_SEEDS)('seed %i matches its committed result byte for byte', (seed) => {
      const actual = JSON.stringify(runRace(validateData(luckOffInputs()), seed));
      if (UPDATE) {
        writeFileSync(offFile(seed), actual);
        return;
      }
      const golden = readFileSync(offFile(seed), 'utf8');
      // Compare the length first so a mismatch does not print two huge strings.
      expect(actual.length).toBe(golden.length);
      expect(actual === golden).toBe(true);
    });

    it('the committed results have no events, and echo zero luck rates', () => {
      if (UPDATE) return;
      for (const seed of OFF_SEEDS) {
        const g = JSON.parse(readFileSync(offFile(seed), 'utf8'));
        expect(g.replay.events, `seed ${seed}`).toEqual([]);
        for (const k of RATES) expect(g.inputs.tuning.luck[k].value, `seed ${seed} ${k}`).toBe(0);
      }
    });
  });

  describe('luck on (the inputs as frozen)', () => {
    it.each(ON_SEEDS)('seed %i matches its committed result byte for byte', (seed) => {
      const actual = JSON.stringify(runRace(validateData(inputs()), seed));
      if (UPDATE) {
        writeFileSync(onFile(seed), actual);
        return;
      }
      const golden = readFileSync(onFile(seed), 'utf8');
      expect(actual.length).toBe(golden.length);
      expect(actual === golden).toBe(true);
    });

    it('each committed result has at least one event, and between them all three types appear', () => {
      if (UPDATE) return;
      const types = new Set<string>();
      for (const seed of ON_SEEDS) {
        const g = JSON.parse(readFileSync(onFile(seed), 'utf8'));
        expect(g.replay.events.length, `seed ${seed}`).toBeGreaterThan(0);
        for (const e of g.replay.events) types.add(e.type);
      }
      expect([...types].sort()).toEqual(['blocked', 'bumped', 'steadied']);
    });
  });

  it('every golden file was written by the current SIM_VERSION', () => {
    if (UPDATE) return;
    for (const f of [...OFF_SEEDS.map(offFile), ...ON_SEEDS.map(onFile)]) {
      expect(JSON.parse(readFileSync(f, 'utf8')).simVersion, f).toBe(SIM_VERSION);
    }
  });

  it('the frozen inputs keep the four-part shape of the game data', () => {
    expect(Object.keys(inputs()).sort()).toEqual(['card', 'race', 'track', 'tuning']);
  });
});
