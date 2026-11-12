import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { INSTRUCTIONS, type GameData } from '../data/schema';
import { validateData } from '../data/validate';
import type { RaceResult } from './result';
import { runRace } from './runRace';
import {
  bytes, mean, placeOf, positionAt, problems, report, seedRange, shipped, winnerId,
  withBias, withField, withInstructions, withTuning, type Instructions, type Spec,
} from './testkit';

// M1.4 instructions (I1 to I5, I7). Paired runs: the same horse, the same seeds, with and without
// the instruction. A horse's random numbers are keyed by its id, so the only difference between the
// two runs is the instruction. Fixed seeds, tolerances from tuning. The track bias half (I6) is in
// trackBias.test.ts.
vi.setConfig({ testTimeout: 120_000 });

const base = shipped();
const SEEDS = seedRange(7000, base.tuning.checks.behaviorSeedCount.value);
const TOL = base.tuning.checks.behaviorTolerancePoints.value / 100;
const ORDER = ['frontRunner', 'stalker', 'closer'] as const;

// Eight equal horses with the styles rotated across the posts (as in the B4 tests):
// t1 front-runner, t2 stalker, t3 closer, t4 front-runner, t5 stalker, t6 closer, t7 front-runner, t8 stalker.
const rotated = withField(base, Array.from({ length: 8 }, (_v, i): Spec => ({ style: ORDER[i % 3], speed: 70, stamina: 70, kick: 70 })));

const runAll = (data: GameData, seeds = SEEDS): RaceResult[] => seeds.map((s) => runRace(data, s));
// The untold runs of the rotated field are the same for every horse tested, so run them once.
const plainRotated = runAll(rotated);
// One horse told one thing, in the rotated field: run once and shared between I3 and I4.
const toldRuns = new Map<string, RaceResult[]>();
const runsTold = (id: string, instruction: Partial<Instructions>): RaceResult[] => {
  const key = id + JSON.stringify(instruction);
  if (!toldRuns.has(key)) toldRuns.set(key, runAll(withInstructions(rotated, id, instruction)));
  return toldRuns.get(key)!;
};
const replayOf = (r: RaceResult, id: string) => r.replay.horses.find((h) => h.id === id)!;

/** What a horse did over a set of runs, averaged. Calls are numbered by furlongs to go: 8 is the quarter mile, 3 the 3/8 pole, 2 the quarter pole. */
function profile(rs: RaceResult[], id: string) {
  return {
    firstCall: mean(rs.map((r) => positionAt(r, 8, id))),
    atPole4: mean(rs.map((r) => positionAt(r, 4, id))),
    atPole3: mean(rs.map((r) => positionAt(r, 3, id))),
    gainBefore38: mean(rs.map((r) => positionAt(r, 8, id) - positionAt(r, 3, id))),
    gain38ToQuarter: mean(rs.map((r) => positionAt(r, 3, id) - positionAt(r, 2, id))),
    gainQuarterToWire: mean(rs.map((r) => positionAt(r, 2, id) - placeOf(r, id))),
  };
}

describe('I1: off means unchanged', () => {
  const SAME = seedRange(0, 40);

  it('writing every instruction as default and both biases as neutral gives the same bytes as the shipped data', () => {
    const explicit = structuredClone(base);
    for (const h of explicit.card.horses) h.instructions = { early: 'default', move: 'default', path: 'default' };
    explicit.race.trackBias = { lane: 'neutral', style: 'neutral' };
    const a = runAll(base, SAME).map(bytes);
    const b = runAll(explicit, SAME).map(bytes);
    expect(b).toEqual(a);
  });

  it('what the instruction and bias strengths are does not matter while everything is default and neutral', () => {
    // Extreme but valid strengths. If any of them leaked into the default path, the race would move.
    const loud = withTuning(base, (t) => {
      t.instructions = {
        // The largest drop validation allows: every style's rated effort stays just above the empty-speed share.
        rateEarlyEffortDrop: { value: Math.min(0.5, Math.min(...Object.values(t.model.earlyEffort.value)) - t.model.emptySpeedShare.value - 0.001), status: 'starting guess' },
        rateEarlyUntilShare: { value: 1, status: 'starting guess' },
        earlyMoveGearShare: { value: 0.9, status: 'starting guess' },
        saveForStretchFeetToGo: { value: 100, status: 'starting guess' },
        saveForStretchKickShare: { value: 0.2, status: 'starting guess' },
      };
      t.trackBias = {
        laneSpeedShare: { value: 0.1, status: 'starting guess' },
        laneWidthLanes: { value: 8, status: 'starting guess' },
        drainShare: { value: 0.9, status: 'starting guess' },
        frontLengths: { value: 50, status: 'starting guess' },
      };
    });
    validateData(loud); // the loud strengths are legal
    const quiet = withTuning(base, (t) => { delete t.instructions; delete t.trackBias; });
    // The echoed tuning differs on purpose, so compare everything else.
    const rest = (r: RaceResult) => JSON.stringify({ ...r, inputs: null });
    expect(runAll(loud, SAME).map(rest)).toEqual(runAll(quiet, SAME).map(rest));
    expect(runAll(base, SAME).map(rest)).toEqual(runAll(quiet, SAME).map(rest));
  });

  it('the frozen golden inputs give the committed luck-off golden result with the two tuning groups present or removed (apart from the echoed tuning)', () => {
    // Since M1.5 the frozen inputs carry both groups and the shipped luck rates, so luck is switched
    // off here (as the luck-off golden set does). The card is all default and the race neutral, so
    // whether the two groups are there must not change one byte of the race.
    const dir = join(dirname(fileURLToPath(import.meta.url)), 'golden');
    const frozen = JSON.parse(readFileSync(join(dir, 'inputs.json'), 'utf8'));
    for (const k of ['blockedPerHorse', 'steadiedPerHorse', 'bumpedPerHorse']) frozen.tuning.luck[k].value = 0;
    expect(frozen.tuning.instructions).toBeDefined();
    expect(frozen.tuning.trackBias).toBeDefined();
    const without = structuredClone(frozen);
    delete without.tuning.instructions;
    delete without.tuning.trackBias;
    for (const raw of [frozen, without]) {
      const data = validateData(raw);
      for (const seed of [0, 777, 4294967295]) {
        const committed = JSON.parse(readFileSync(join(dir, `luck-off-seed-${seed}.json`), 'utf8'));
        expect(JSON.stringify({ ...runRace(data, seed), inputs: null })).toBe(JSON.stringify({ ...committed, inputs: null }));
      }
    }
  });
});

describe('instructions and bias are echoed in the result', () => {
  it('result.inputs carries each horse\'s instructions and the race\'s track bias', () => {
    let told = withInstructions(base, 'h1', { early: 'rateEarly', move: 'saveForStretch', path: 'stayInside' });
    told = withInstructions(told, 'h3', { move: 'moveAtThreeEighths' });
    told = withBias(told, { lane: 'inside', style: 'closers' });
    const r = runRace(told, 21);
    const echoed = (id: string) => r.inputs.card.horses.find((h) => h.id === id)!.instructions;
    expect(echoed('h1')).toEqual({ early: 'rateEarly', move: 'saveForStretch', path: 'stayInside' });
    expect(echoed('h3')).toEqual({ early: 'default', move: 'moveAtThreeEighths', path: 'default' });
    expect(echoed('h2')).toEqual({ early: 'default', move: 'default', path: 'default' });
    expect(r.inputs.race.trackBias).toEqual({ lane: 'inside', style: 'closers' });
  });
});

describe('a non-finite number in the orders stops the race instead of skipping the instruction', () => {
  it('runRace on unvalidated data with a NaN rate-early drop throws, naming the horse', () => {
    const bad = withInstructions(base, 'h1', { early: 'rateEarly' });
    bad.tuning.instructions!.rateEarlyEffortDrop.value = NaN; // broken after validation, on the copy
    expect(() => runRace(bad, 1)).toThrow(/h1/);
    expect(() => runRace(bad, 1)).toThrow(/NaN/);
  });
  it('the same NaN does nothing while no horse is told to rate early', () => {
    const quiet = structuredClone(base);
    quiet.tuning.instructions!.rateEarlyEffortDrop.value = NaN;
    expect(() => runRace(quiet, 1)).not.toThrow();
  });
  it('a NaN rate-early start share (inside the same nested rate orders) also throws', () => {
    const bad = withInstructions(base, 'h2', { early: 'rateEarly' });
    bad.tuning.instructions!.rateEarlyUntilShare.value = NaN;
    expect(() => runRace(bad, 1)).toThrow(/h2/);
  });
});

describe('I2: rate early', () => {
  // Front-runner, stalker and closer in the same field.
  describe.each([['t1', 'frontRunner'], ['t2', 'stalker'], ['t3', 'closer']])('%s, a %s', (id) => {
    const plain = profile(plainRotated, id);
    const told = profile(runsTold(id, { early: 'rateEarly' }), id);
    report(`I2 ${id} without / with rate early`, { plain, told });

    it('has a worse (higher) average position at the first call than the same horse with no instruction', () => {
      expect(told.firstCall).toBeGreaterThan(plain.firstCall + TOL);
    });
    it('gains more positions on average from the quarter pole to the wire', () => {
      expect(told.gainQuarterToWire).toBeGreaterThan(plain.gainQuarterToWire + TOL);
    });
  });
});

describe('I3: make a move at the 3/8 pole', () => {
  // Closers and a stalker can gain places. A front-runner near the lead has few to gain, so it is not asserted here.
  describe.each([['t3', 'closer'], ['t2', 'stalker']])('%s, a %s', (id) => {
    const plain = profile(plainRotated, id);
    const told = profile(runsTold(id, { move: 'moveAtThreeEighths' }), id);
    report(`I3 ${id} without / with the 3/8 move`, { plain, told });

    it('gains more positions between the 3/8 pole and the quarter pole than with no instruction', () => {
      expect(told.gain38ToQuarter).toBeGreaterThan(plain.gain38ToQuarter + TOL);
    });
    it('gains nothing extra before the 3/8 pole', () => {
      // Positions are taken as the leader reaches each pole, and the horse is behind the leader, so
      // the call at 3 furlongs to go is still before the horse's own 3/8 pole.
      expect(told.atPole4).toBeLessThanOrEqual(plain.atPole4 + TOL);
      expect(told.atPole3).toBeGreaterThanOrEqual(plain.atPole3 - TOL);
      expect(told.gainBefore38).toBeLessThanOrEqual(plain.gainBefore38 + TOL);
    });
  });
});

describe('I4: save it for the stretch', () => {
  describe.each([['t3', 'closer'], ['t2', 'stalker']])('%s, a %s', (id) => {
    const plain = profile(plainRotated, id);
    const early = profile(runsTold(id, { move: 'moveAtThreeEighths' }), id);
    const saved = profile(runsTold(id, { move: 'saveForStretch' }), id);
    report(`I4 ${id} no instruction / 3/8 move / save it`, { plain, early, saved });

    it('gains more positions after the quarter pole than with no instruction, and than with the 3/8 move', () => {
      expect(saved.gainQuarterToWire).toBeGreaterThan(plain.gainQuarterToWire);
      expect(saved.gainQuarterToWire).toBeGreaterThan(early.gainQuarterToWire);
    });
    it('does not gain before the quarter pole what the others do, so the gain is concentrated at the end', () => {
      expect(saved.gain38ToQuarter).toBeLessThan(plain.gain38ToQuarter);
      expect(saved.gain38ToQuarter).toBeLessThan(early.gain38ToQuarter);
    });
  });

  it('against a hot pace it wins more often than the 3/8 move, for the same closers', () => {
    // Pooled across the card's closers, because the per-horse margin is small: about 130 hot races
    // out of 500 and a win count per closer in the teens, so one closer alone can tie or flip on
    // noise. Hot is the label of the default run on that seed, so the same races are compared for
    // every variant and the told horse cannot change which races count.
    const closers = base.card.horses.filter((h) => h.style === 'closer').map((h) => h.id);
    expect(closers.length).toBeGreaterThanOrEqual(2);
    const hot = SEEDS.filter((s) => runRace(base, s).pace.label === 'hot');
    expect(hot.length).toBeGreaterThan(50);
    const wins = (move: 'moveAtThreeEighths' | 'saveForStretch') => closers.reduce(
      (n, id) => n + hot.filter((s) => winnerId(runRace(withInstructions(base, id, { move }), s)) === id).length, 0);
    const early = wins('moveAtThreeEighths');
    const saved = wins('saveForStretch');
    report('I4 hot-pace wins, pooled over the closers: 3/8 move vs save it', { hotRaces: hot.length, early, saved });
    expect(saved).toBeGreaterThan(early);
  });
});

describe('I5: stay inside', () => {
  /** Mean lane (hundredths of a lane) over the samples where the horse is on a turn. */
  const turnLane = (r: RaceResult, id: string): number => {
    const h = replayOf(r, id);
    const turns = r.replay.course.filter((c) => c.turn);
    return mean(h.lane.filter((_l, i) => turns.some((c) => h.distance[i] >= c.from && h.distance[i] < c.to)));
  };

  // The same horse (t1) from two posts: the rail and the outside, with the horse
  // that had that post taking t1's old one.
  describe.each([1, 8])('from post %i', (post) => {
    const field = structuredClone(rotated);
    const other = field.card.horses.find((h) => h.post === post)!;
    other.post = field.card.horses[0].post;
    field.card.horses[0].post = post;
    const plain = post === 1 ? plainRotated : runAll(field);
    const told = runAll(withInstructions(field, 't1', { path: 'stayInside' }));
    const lane = (rs: RaceResult[]) => mean(rs.map((r) => turnLane(r, 't1'))) / 100;
    const ground = (rs: RaceResult[]) => mean(rs.map((r) => replayOf(r, 't1').extraGround)) / 100;
    report(`I5 t1 from post ${post}: turn lane and extra ground (feet), without / with stay inside`, { lane: [lane(plain), lane(told)], ground: [ground(plain), ground(told)] });

    it('runs closer to the rail through the turns and covers less ground than with no instruction', () => {
      expect(lane(told)).toBeLessThan(lane(plain));
      expect(ground(told)).toBeLessThan(ground(plain));
    });
  });
});

describe('I7: any combination of the three slots is valid', () => {
  const combos = INSTRUCTIONS.early.flatMap((early) => INSTRUCTIONS.move.flatMap((move) => INSTRUCTIONS.path.map((path) => ({ early, move, path }))));
  const biases = (['neutral', 'inside', 'outside'] as const).flatMap((lane) => (['neutral', 'speed', 'closers'] as const).map((style) => ({ lane, style })));
  const SOME = seedRange(100, 3);

  it('there are 12 combinations and 9 bias settings', () => {
    expect(combos.length).toBe(12);
    expect(biases.length).toBe(9);
  });

  it.each(combos.map((c) => [`${c.early} / ${c.move} / ${c.path}`, c] as const))('%s runs and passes the sanity check under every bias, told to one horse and to the whole card', (_name, combo) => {
    for (const bias of biases) {
      // Told to the front-runner h1 alone, then to every horse at once.
      const one = withBias(withInstructions(base, 'h1', combo), bias);
      const all = withBias(base, bias);
      for (const h of all.card.horses) h.instructions = { ...combo };
      for (const [name, data] of [['h1 only', one], ['all horses', all]] as const) {
        for (const s of SOME) {
          const r = runRace(data, s);
          expect(problems(r), `${name}, bias ${JSON.stringify(bias)}, seed ${s}`).toEqual([]);
          expect(r.inputs.card.horses.find((h) => h.id === 'h1')!.instructions).toEqual(combo);
        }
      }
    }
  });

  it('a front-runner told to rate early, in a field of front-runners and in a field of one, runs and finishes', () => {
    for (const n of [1, 8]) {
      const field = withField(base, Array.from({ length: 8 }, (_v, i): Spec => ({ style: i < n ? 'frontRunner' : 'closer', speed: 75, stamina: 70, kick: 65 })));
      const told = withInstructions(field, 't1', { early: 'rateEarly' });
      for (const s of SOME) expect(problems(runRace(told, s))).toEqual([]);
    }
  });
});
