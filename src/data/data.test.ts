/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import cardJson from './card.json';
import raceJson from './race.json';
import trackJson from './track.json';
import tuningJson from './tuning.json';
import { loadData } from './load';
import { DataError, validateData } from './validate';
import { RUNNING_STYLES, MAX_NAME_LENGTH } from './schema';

type Raw = { track: any; race: any; card: any; tuning: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

// A fresh, unvalidated copy of the shipped data, so a test can break one thing.
const fresh = (): Raw => structuredClone({ track: trackJson, race: raceJson, card: cardJson, tuning: tuningJson });

function failure(raw: Raw): DataError {
  try {
    validateData(raw);
  } catch (e) {
    expect(e).toBeInstanceOf(DataError);
    return e as DataError;
  }
  throw new Error('validation passed but should have been rejected');
}

function expectRejected(raw: Raw, file: string, path: string): void {
  const err = failure(raw);
  expect(err.file).toBe(file);
  expect(err.issues.map((i) => i.path)).toContain(path);
}

const range = fresh().tuning.statRange.value as { min: number; max: number };

describe('V5: the shipped data passes validation', () => {
  it('validateData accepts the shipped files', () => {
    expect(() => validateData(fresh())).not.toThrow();
  });
  it('loadData returns the data', () => {
    const data = loadData();
    expect(data.card.horses.length).toBeGreaterThan(0);
  });
});

describe('V4: validation rejects bad data, naming the file and field', () => {
  const card = 'src/data/card.json';

  it.each([
    ['below the range', range.min - 1],
    ['above the range', range.max + 1],
  ])('a stat %s', (_n, v) => {
    const raw = fresh();
    raw.card.horses[2].stats.speed = v;
    expectRejected(raw, card, 'horses[2].stats.speed');
  });

  it('accepts a stat at each end of the range', () => {
    const raw = fresh();
    raw.card.horses[0].stats.speed = range.min;
    raw.card.horses[0].stats.kick = range.max;
    expect(() => validateData(raw)).not.toThrow();
  });

  it('an unknown running style', () => {
    const raw = fresh();
    raw.card.horses[1].style = 'sprinter';
    expectRejected(raw, card, 'horses[1].style');
  });

  it.each(['early', 'move', 'path'])('an unknown instruction in the %s slot', (slot) => {
    const raw = fresh();
    raw.card.horses[3].instructions[slot] = 'gallopFaster';
    expectRejected(raw, card, `horses[3].instructions.${slot}`);
  });

  it('two horses on the same post', () => {
    const raw = fresh();
    raw.card.horses[1].post = raw.card.horses[0].post;
    expectRejected(raw, card, 'horses[1].post');
  });

  it('a post of 0', () => {
    const raw = fresh();
    raw.card.horses[4].post = 0;
    expectRejected(raw, card, 'horses[4].post');
  });

  it('a post of field size plus 1', () => {
    const raw = fresh();
    raw.card.horses[4].post = raw.card.horses.length + 1;
    expectRejected(raw, card, 'horses[4].post');
  });

  it('duplicate horse ids', () => {
    const raw = fresh();
    raw.card.horses[2].id = raw.card.horses[0].id;
    expectRejected(raw, card, 'horses[2].id');
  });

  it('duplicate horse names', () => {
    const raw = fresh();
    raw.card.horses[2].name = raw.card.horses[0].name;
    expectRejected(raw, card, 'horses[2].name');
  });

  it('a horse name of 19 characters is rejected, 18 is accepted', () => {
    expect(MAX_NAME_LENGTH).toBe(18);
    const ok = fresh();
    ok.card.horses[0].name = 'x'.repeat(18);
    expect(() => validateData(ok)).not.toThrow();
    const bad = fresh();
    bad.card.horses[0].name = 'x'.repeat(19);
    expectRejected(bad, card, 'horses[0].name');
  });

  it('a going that does not belong to the surface (firm on dirt)', () => {
    const raw = fresh();
    raw.race.surface = 'dirt';
    raw.track.surface = 'dirt';
    raw.race.going = 'firm';
    expectRejected(raw, 'src/data/race.json', 'going');
  });

  it('a field of 1', () => {
    const raw = fresh();
    raw.card.horses = [{ ...raw.card.horses[0], post: 1 }];
    expectRejected(raw, card, 'horses');
  });

  it('a field of 2 is accepted', () => {
    const raw = fresh();
    raw.card.horses = [
      { ...raw.card.horses[0], post: 1 },
      { ...raw.card.horses[1], post: 2 },
    ];
    expect(() => validateData(raw)).not.toThrow();
  });

  function field(n: number): Raw {
    const raw = fresh();
    const base = raw.card.horses[0];
    raw.card.horses = Array.from({ length: n }, (_v, i) => ({
      ...structuredClone(base),
      id: `f${i}`,
      name: `Horse ${i}`,
      post: i + 1,
    }));
    return raw;
  }

  it('a field of 20 is accepted', () => {
    expect(() => validateData(field(20))).not.toThrow();
  });

  it('a field of 21', () => {
    expectRejected(field(21), card, 'horses');
  });

  it.each([
    ['track', 'src/data/track.json', (r: Raw) => (r.track.lapFeett = 1), '(whole file)'],
    ['race', 'src/data/race.json', (r: Raw) => (r.race.extra = 1), '(whole file)'],
    ['card horse', card, (r: Raw) => (r.card.horses[0].colour = 'bay'), 'horses[0]'],
    ['tuning', 'src/data/tuning.json', (r: Raw) => (r.tuning.extra = 1), '(whole file)'],
  ])('an unknown key in the %s file', (_n, file, edit, path) => {
    const raw = fresh();
    edit(raw);
    const err = failure(raw);
    expect(err.file).toBe(file);
    expect(err.issues.map((i) => i.path)).toContain(path);
  });

  it('a name with spaces inside it is accepted', () => {
    const raw = fresh();
    raw.card.horses[0].name = 'Two Word Name';
    expect(() => validateData(raw)).not.toThrow();
  });

  it.each([
    ['a whitespace-only horse name', card, (r: Raw) => (r.card.horses[0].name = '   '), 'horses[0].name'],
    ['a horse name with a leading space', card, (r: Raw) => (r.card.horses[0].name = ' Lead'), 'horses[0].name'],
    ['a horse name with a trailing space', card, (r: Raw) => (r.card.horses[0].name = 'Trail '), 'horses[0].name'],
    ['an empty horse name', card, (r: Raw) => (r.card.horses[0].name = ''), 'horses[0].name'],
    ['a whitespace-only horse id', card, (r: Raw) => (r.card.horses[0].id = '  '), 'horses[0].id'],
    ['a whitespace-only jockey name', card, (r: Raw) => (r.card.horses[0].jockey = ' '), 'horses[0].jockey'],
    ['a whitespace-only race name', 'src/data/race.json', (r: Raw) => (r.race.name = '  '), 'name'],
    ['a padded track name', 'src/data/track.json', (r: Raw) => (r.track.name = ' Churchill Downs'), 'name'],
  ])('%s', (_n, file, edit, path) => {
    const raw = fresh();
    edit(raw);
    expectRejected(raw, file, path);
  });

  const tuningFile = 'src/data/tuning.json';

  it.each([
    ['max above 100', 'checks.photoFinishPercentBand', { min: 5, max: 101 }, 'checks.photoFinishPercentBand.value.max'],
    ['a negative min', 'luck.raceShareBandPercent', { min: -1, max: 45 }, 'luck.raceShareBandPercent.value.min'],
    ['min above max', 'checks.cardWinSharePercentBand', { min: 40, max: 10 }, 'checks.cardWinSharePercentBand.value'],
  ])('a percent band with %s', (_n, where, value, path) => {
    const raw = fresh();
    const [a, b] = where.split('.');
    (b ? raw.tuning[a][b] : raw.tuning[a]).value = value;
    expectRejected(raw, tuningFile, path);
  });

  it('a percent band of exactly 0 to 100 is accepted', () => {
    const raw = fresh();
    raw.tuning.checks.photoFinishPercentBand.value = { min: 0, max: 100 };
    expect(() => validateData(raw)).not.toThrow();
  });

  it('the seconds band may exceed 100', () => {
    const raw = fresh();
    raw.tuning.checks.winningTimeBandSeconds.value = { min: 119.5, max: 150 };
    expect(() => validateData(raw)).not.toThrow();
  });

  it.each([
    ['above 1', 1.01],
    ['below 0', -0.01],
  ])('a luck rate %s', (_n, v) => {
    const raw = fresh();
    raw.tuning.luck.blockedPerHorse.value = v;
    expectRejected(raw, tuningFile, 'luck.blockedPerHorse.value');
  });

  it.each([0, 1])('a luck rate of exactly %s is accepted', (v) => {
    const raw = fresh();
    raw.tuning.luck.blockedPerHorse.value = v;
    expect(() => validateData(raw)).not.toThrow();
  });

  it('a missing tuning value', () => {
    const raw = fresh();
    delete raw.tuning.luck.blockedPerHorse;
    expectRejected(raw, 'src/data/tuning.json', 'luck.blockedPerHorse');
  });

  it('a missing top-level tuning value', () => {
    const raw = fresh();
    delete raw.tuning.horseLengthFeet;
    expectRejected(raw, 'src/data/tuning.json', 'horseLengthFeet');
  });
});

// V3: marked values are objects with `value` and `status`.
const STATUSES = ['starting guess', 'confirmed'];
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

// Returns a list of problems. Groups are plain objects without value+status; recurse into them.
function unmarked(node: unknown, path: string, exempt: string[] = []): string[] {
  if (!isObj(node)) return [`${path}: not inside a marked object`];
  if ('value' in node || 'status' in node) {
    if (!('value' in node)) return [`${path}: marked object has no value`];
    return STATUSES.includes(node.status as string) ? [] : [`${path}: bad status ${String(node.status)}`];
  }
  const out: string[] = [];
  for (const [k, v] of Object.entries(node)) {
    if (exempt.includes(k)) continue;
    out.push(...unmarked(v, path ? `${path}.${k}` : k));
  }
  return out;
}

describe('V3: every tuning and track value is marked', () => {
  it('walker flags an unmarked leaf and a bad status', () => {
    expect(unmarked({ a: 1 }, '')).toHaveLength(1);
    expect(unmarked({ a: { value: 1, status: 'maybe' } }, '')).toHaveLength(1);
    expect(unmarked({ a: { b: { value: 1, status: 'confirmed' } } }, '')).toEqual([]);
  });
  it('tuning', () => {
    expect(Object.keys(tuningJson).length).toBeGreaterThan(0);
    expect(unmarked(tuningJson, '')).toEqual([]);
  });
  it('track (the name, location and surface are labels, not values)', () => {
    expect(unmarked(trackJson, '', ['name', 'location', 'surface'])).toEqual([]);
  });
});

describe('V2: track geometry sourcing', () => {
  it('the lap is confirmed and has a note', () => {
    expect(trackJson.lapFeet.status).toBe('confirmed');
    expect(trackJson.lapFeet.note.trim().length).toBeGreaterThan(0);
  });
  it.each(['stretchFeet', 'backstretchFeet', 'turnFeet', 'runUpFeet'] as const)('%s is a starting guess', (k) => {
    expect(trackJson[k].status).toBe('starting guess');
  });
});

describe('V1: no real track, race or venue name in src/sim/', () => {
  // Source files and the frozen golden data next to the sim tests.
  const files = {
    ...(import.meta.glob('../sim/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
    ...(import.meta.glob('../sim/**/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
  };

  const names = [trackJson.name, raceJson.track, raceJson.name, trackJson.location.split(',')[0]];

  it('reads at least one real source file, and some real names', () => {
    expect(Object.keys(files).length).toBeGreaterThan(0);
    expect(Object.keys(files).some((f) => f.endsWith('rng.ts'))).toBe(true);
    expect(Object.keys(files).some((f) => f.endsWith('golden/inputs.json'))).toBe(true);
    expect(Object.keys(files).some((f) => /golden\/seed-\d+\.json$/.test(f))).toBe(true);
    expect(names.every((n) => n.trim().length >= 4)).toBe(true);
  });

  it('no name appears in any file', () => {
    const hits: string[] = [];
    for (const [file, text] of Object.entries(files)) {
      for (const n of names) if (text.toLowerCase().includes(n.toLowerCase())) hits.push(`${file}: ${n}`);
    }
    expect(hits).toEqual([]);
  });
});

describe('V6: the shipped card and race', () => {
  // Lazy, so a bad data file fails these tests instead of the whole file.
  const horses = () => loadData().card.horses;
  const race = () => loadData().race;

  it('has 8 horses', () => expect(horses()).toHaveLength(8));

  it('names are 18 characters or fewer and unique', () => {
    const lower = horses().map((h) => h.name.toLowerCase());
    expect(new Set(lower).size).toBe(8);
    for (const h of horses()) expect(h.name.length).toBeLessThanOrEqual(18);
  });

  it('no Triple Crown winner name', () => {
    const winners = ['Sir Barton', 'Gallant Fox', 'Omaha', 'War Admiral', 'Whirlaway', 'Count Fleet', 'Assault',
      'Citation', 'Secretariat', 'Seattle Slew', 'Affirmed', 'American Pharoah', 'American Pharaoh', 'Justify']
      .map((n) => n.toLowerCase());
    for (const h of horses()) expect(winners).not.toContain(h.name.trim().toLowerCase());
  });

  it.each(RUNNING_STYLES)('at least two %s horses', (style) => {
    expect(horses().filter((h) => h.style === style).length).toBeGreaterThanOrEqual(2);
  });

  it('all instruction slots are at default', () => {
    for (const h of horses()) expect(h.instructions).toEqual({ early: 'default', move: 'default', path: 'default' });
  });

  it('the race is 10 furlongs on dirt', () => {
    expect(race().distanceFurlongs).toBe(10);
    expect(race().surface).toBe('dirt');
  });

  it('the race is not named after a real Triple Crown or Breeders Cup race', () => {
    const real = ['kentucky derby', 'preakness', 'belmont', 'triple crown', "breeders'", 'breeders', 'classic',
      'juvenile', 'distaff', 'turf sprint', 'dirt mile', 'filly'];
    const name = race().name.toLowerCase();
    for (const r of real) expect(name).not.toContain(r);
  });
});

describe('V4: rules added in review', () => {
  const raceFile = 'src/data/race.json';
  const tuningFile = 'src/data/tuning.json';

  describe('the race distance is a whole number of furlongs from 5 to 12', () => {
    it.each([6.5, 4, 13, 4.99, 12.01, 0, -10, 8.5])('%s furlongs is rejected', (d) => {
      const raw = fresh();
      raw.race.distanceFurlongs = d;
      expectRejected(raw, raceFile, 'distanceFurlongs');
    });

    it.each([5, 12, 6, 8, 10, 11])('%s furlongs is accepted (the shipped tuning has a pace par for it)', (d) => {
      const raw = fresh();
      raw.race.distanceFurlongs = d;
      expect(() => validateData(raw)).not.toThrow();
    });

    it('a distance given as text is rejected too', () => {
      const raw = fresh();
      raw.race.distanceFurlongs = '10';
      expectRejected(raw, raceFile, 'distanceFurlongs');
    });
  });

  describe('tuning lines that make the model meaningless are rejected at their path', () => {
    const lo = range.min;
    const hi = range.max;
    // A line { base, perPoint } that is exactly `atStat` at stat `stat` and rises by `slope` per point.
    const line = (stat: number, atStat: number, slope: number) => ({ base: atStat - slope * stat, perPoint: slope });

    describe.each(['enduranceSeconds', 'cruiseFeetPerSecond', 'kickAccelFeetPerSecondSquared'])('model.%s', (key) => {
      const path = `model.${key}.value`;
      const set = (value: { base: number; perPoint: number }) => {
        const raw = fresh();
        raw.tuning.model[key].value = value;
        return raw;
      };

      it('is rejected when it is 0 at the bottom of the stat range', () => {
        expectRejected(set(line(lo, 0, 0.5)), tuningFile, path);
      });
      it('is rejected when it is below 0 at the bottom of the stat range', () => {
        expectRejected(set(line(lo, -3, 0.5)), tuningFile, path);
      });
      it('is rejected when it is 0 at the top of the stat range', () => {
        expectRejected(set(line(hi, 0, -0.5)), tuningFile, path);
      });
      it('is rejected when it is below 0 at the top of the stat range', () => {
        expectRejected(set(line(hi, -3, -0.5)), tuningFile, path);
      });
      it('is accepted when it is just above 0 at each end', () => {
        expect(() => validateData(set(line(lo, 0.001, 0.5)))).not.toThrow();
        expect(() => validateData(set(line(hi, 0.001, -0.5)))).not.toThrow();
      });
      it('is accepted when it is above 0 across the range (the shipped line)', () => {
        expect(() => validateData(fresh())).not.toThrow();
      });
    });

    describe('model.kickBoostShare', () => {
      const path = 'model.kickBoostShare.value';
      const set = (value: { base: number; perPoint: number }) => {
        const raw = fresh();
        raw.tuning.model.kickBoostShare.value = value;
        return raw;
      };

      it('is rejected when it is 0 at the top of the stat range', () => {
        expectRejected(set(line(hi, 0, 0.002)), tuningFile, path);
      });
      it('is rejected when it is below 0 at the top of the stat range', () => {
        expectRejected(set(line(hi, -0.05, 0.002)), tuningFile, path);
      });
      it('is accepted when it is just above 0 at the top of the stat range', () => {
        expect(() => validateData(set(line(hi, 0.001, 0.002)))).not.toThrow();
      });
      it('may be below 0 at the bottom of the stat range (the sim floors it)', () => {
        expect(() => validateData(set(line(lo, -0.2, 0.003)))).not.toThrow();
        // The shipped line is itself negative at the bottom and accepted.
        const shippedLine = fresh().tuning.model.kickBoostShare.value;
        expect(shippedLine.base + shippedLine.perPoint * lo).toBeLessThan(0);
        expect(() => validateData(fresh())).not.toThrow();
      });
      it('is only checked at the top: a line that is 0 at the bottom and rises is accepted', () => {
        expect(() => validateData(set(line(lo, 0, 0.002)))).not.toThrow();
      });
    });

    it('the range the checks use is the stat range in tuning, not 1 to 100', () => {
      const raw = fresh();
      raw.tuning.statRange.value = { min: 1, max: 50 };
      // Shipped endurance is 45 + 1.2 * stat: fine on 1 to 50. Make it 0 at stat 50 only.
      raw.tuning.model.enduranceSeconds.value = line(50, 0, -0.5);
      raw.card.horses.forEach((h: any) => { h.stats = { speed: 40, stamina: 40, kick: 40 }; }); // eslint-disable-line @typescript-eslint/no-explicit-any
      expectRejected(raw, tuningFile, 'model.enduranceSeconds.value');
      // The same line passes when the range ends at 49, where it is still above 0.
      const ok = structuredClone(raw);
      ok.tuning.statRange.value = { min: 1, max: 49 };
      expect(() => validateData(ok)).not.toThrow();
    });
  });
});
