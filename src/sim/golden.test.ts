import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateData } from '../data/validate';
import { runRace, SIM_VERSION } from './runRace';

// S5: golden results.
//
// The files in ./golden are a frozen copy of the track, race, card and tuning (inputs.json)
// and the serialized result for each fixed seed below (seed-<n>.json, the exact output of
// JSON.stringify(result) with no extra arguments and no trailing newline). The inputs are a
// copy on purpose: tuning changes in src/data/ must not break this test.
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

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'golden');
const SEEDS = [0, 1, 777, 123456789, 4294967295];
const UPDATE = process.env.UPDATE_GOLDEN === '1';

const inputs = () => JSON.parse(readFileSync(join(DIR, 'inputs.json'), 'utf8'));
const file = (seed: number) => join(DIR, `seed-${seed}.json`);

describe('S5: golden results', () => {
  it('the frozen inputs still pass validation', () => {
    expect(() => validateData(inputs())).not.toThrow();
  });

  it('there are at least five golden seeds, including both ends of the seed range', () => {
    expect(SEEDS.length).toBeGreaterThanOrEqual(5);
    expect(SEEDS).toContain(0);
    expect(SEEDS).toContain(4294967295);
  });

  it.each(SEEDS)('seed %i matches its committed result byte for byte', (seed) => {
    const actual = JSON.stringify(runRace(validateData(inputs()), seed));
    if (UPDATE) {
      writeFileSync(file(seed), actual);
      return;
    }
    const golden = readFileSync(file(seed), 'utf8');
    // Compare the length first so a mismatch does not print two huge strings.
    expect(actual.length).toBe(golden.length);
    expect(actual === golden).toBe(true);
  });

  it('every golden file was written by the current SIM_VERSION', () => {
    if (UPDATE) return;
    for (const seed of SEEDS) {
      expect(JSON.parse(readFileSync(file(seed), 'utf8')).simVersion, `seed ${seed}`).toBe(SIM_VERSION);
    }
  });

  it('the frozen inputs keep the four-part shape of the game data', () => {
    expect(Object.keys(inputs()).sort()).toEqual(['card', 'race', 'track', 'tuning']);
  });
});
