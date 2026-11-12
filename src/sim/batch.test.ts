import { beforeAll, describe, expect, it } from 'vitest';
import type { GameData, RunningStyle } from '../data/schema';
import { buildChecks, runBatch, summarizeCard, summarizeFairness } from './batch';
import type { CardSummary, Check, FairnessSummary } from './batch';
import type { EventType, PaceLabel, RaceResult } from './result';
import { runRace } from './runRace';
import { bytes, deepFreeze, equalSpecs, seedRange, shipped, withBias, withField, withInstructions, withTuning } from './testkit';

// M1.6 (F1 to F6): the batch counts. Every number is worked out here again from raw runRace results
// and compared with the summary. Small seed ranges only: the 10,000 race run is by hand, not npm test.

const START = 7000;
const N = 31; // odd, so the median is one real time
const base = shipped();
const STYLES: RunningStyle[] = ['frontRunner', 'stalker', 'closer'];
const PACES: PaceLabel[] = ['hot', 'honest', 'slow'];
const EVENTS: EventType[] = ['blocked', 'steadied', 'bumped'];
const pct = (n: number, of: number) => (100 * n) / of;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('M1.6 counting, from raw results', () => {
  let raw: RaceResult[];
  let card: CardSummary;

  beforeAll(() => {
    raw = seedRange(START, N).map((s) => runRace(base, s));
    card = summarizeCard(base, START, N);
  });

  it('reports the number of races', () => {
    expect(card.races).toBe(N);
  });

  it('per horse win percent, average place and average beaten lengths match the raw results', () => {
    expect(card.horses.length).toBe(base.card.horses.length);
    for (const h of base.card.horses) {
      const line = card.horses.find((l) => l.id === h.id)!;
      expect(line, h.id).toBeDefined();
      const entries = raw.map((r) => r.finish.find((f) => f.id === h.id)!);
      expect(line.winPercent).toBeCloseTo(pct(entries.filter((e) => e.place === 1).length, N), 9);
      expect(line.avgPlace).toBeCloseTo(sum(entries.map((e) => e.place)) / N, 9);
      // Results hold thousandths of a length; the summary is in lengths.
      expect(line.avgBeatenLengths).toBeCloseTo(sum(entries.map((e) => e.beatenLengths)) / N / 1000, 9);
    }
  });

  it('win percents across the card sum to 100', () => {
    expect(sum(card.horses.map((h) => h.winPercent))).toBeCloseTo(100, 9);
  });

  it('share of races won by one length or less', () => {
    const close = raw.filter((r) => r.finish[1].margin!.lengths <= 1000).length;
    expect(card.closeWinPercent).toBeCloseTo(pct(close, N), 9);
    // Sanity: the raw margin is in thousandths, so a count of the wrong unit would give 0 or 100.
    expect(close).toBeGreaterThan(0);
    expect(close).toBeLessThan(N);
  });

  it('a winning margin of exactly one length counts as one length or less (seed 315 of the shipped card)', () => {
    const r = runRace(base, 315);
    expect(r.finish[1].margin!.lengths).toBe(1000); // found by search; if the model changes, find another seed
    expect(summarizeCard(base, 315, 1).closeWinPercent).toBe(100);
  });

  it('photo finish share', () => {
    expect(card.photoFinishPercent).toBeCloseTo(pct(raw.filter((r) => r.photoFinish).length, N), 9);
  });

  it('share where the leader at the 1/8 pole does not win', () => {
    const lose = raw.filter((r) => {
      const call = r.calls.find((c) => c.furlongsToGo === 1)!;
      return call.horses[0].id !== r.finish[0].id;
    }).length;
    expect(card.leaderAtEighthLosesPercent).toBeCloseTo(pct(lose, N), 9);
    // The 1/4 pole must not give the same answer on this range, or the test could not tell them apart.
    const loseQuarter = raw.filter((r) => r.calls.find((c) => c.furlongsToGo === 2)!.horses[0].id !== r.finish[0].id).length;
    expect(loseQuarter).not.toBe(lose);
  });

  it('pace label shares', () => {
    for (const p of PACES) {
      expect(card.paceLabelPercent[p]).toBeCloseTo(pct(raw.filter((r) => r.pace.label === p).length, N), 9);
    }
    expect(sum(PACES.map((p) => card.paceLabelPercent[p]))).toBeCloseTo(100, 9);
  });

  it("winner's time median, minimum and maximum", () => {
    const times = raw.map((r) => r.finish[0].time).sort((a, b) => a - b);
    expect(card.winnerTime.min).toBe(times[0]);
    expect(card.winnerTime.max).toBe(times[N - 1]);
    expect(card.winnerTime.median).toBe(times[(N - 1) / 2]);
  });

  it('median of an even count is the middle two averaged (whole hundredths, so within half a hundredth)', () => {
    const even = summarizeCard(base, START, 30);
    const times = raw.slice(0, 30).map((r) => r.finish[0].time).sort((a, b) => a - b);
    expect(Math.abs(even.winnerTime.median - (times[14] + times[15]) / 2)).toBeLessThanOrEqual(0.5);
  });

  it('luck event counts by type and share of races with an event', () => {
    for (const t of EVENTS) {
      const count = sum(raw.map((r) => r.replay.events.filter((e) => e.type === t).length));
      expect(card.luck.eventCount[t], t).toBe(count);
    }
    expect(card.luck.racesWithEventPercent).toBeCloseTo(pct(raw.filter((r) => r.replay.events.length > 0).length, N), 9);
    expect(sum(EVENTS.map((t) => card.luck.eventCount[t]))).toBeGreaterThan(0);
  });

  it('a one race batch works', () => {
    const one = summarizeCard(base, START, 1);
    expect(sum(one.horses.map((h) => h.winPercent))).toBe(100);
    expect(one.winnerTime.min).toBe(one.winnerTime.max);
    expect(one.winnerTime.median).toBe(one.winnerTime.min);
  });
});

describe('M1.6 fairness fields', () => {
  const FN = 25;
  const n = base.card.horses.length;

  const plainPostShares = (data: GameData, style: RunningStyle): number[] => {
    const field = withField(data, equalSpecs(n, style));
    const wins = Array<number>(n).fill(0);
    for (const s of seedRange(START, FN)) wins[runRace(field, s).finish[0].post - 1]++;
    return wins.map((w) => pct(w, FN));
  };

  let plain: FairnessSummary;
  beforeAll(() => {
    plain = summarizeFairness(base, START, FN);
  });

  it('F2: per post win share, equal horses of one style on a neutral track, once per running style', () => {
    for (const style of STYLES) {
      const expected = plainPostShares(base, style);
      expect(plain.postWinPercent[style].length).toBe(n);
      plain.postWinPercent[style].forEach((v, i) => expect(v, `${style} post ${i + 1}`).toBeCloseTo(expected[i], 9));
    }
  });

  it('F2: per-post shares sum to 100 for each style', () => {
    for (const style of STYLES) expect(sum(plain.postWinPercent[style])).toBeCloseTo(100, 9);
  });

  it('F3: styles rotated across posts, win share reported per horse of each style', () => {
    const rotated = Array.from({ length: n }, (_v, i) => STYLES[i % 3]);
    const field = withField(base, rotated.map((style) => ({ style, speed: 70, stamina: 70, kick: 70 })));
    const wins: Record<RunningStyle, number> = { frontRunner: 0, stalker: 0, closer: 0 };
    for (const s of seedRange(START, FN)) wins[rotated[runRace(field, s).finish[0].post - 1]]++;
    for (const style of STYLES) {
      const horses = rotated.filter((x) => x === style).length;
      expect(plain.styleHorseCount[style]).toBe(horses);
      expect(plain.styleWinPercentPerHorse[style], style).toBeCloseTo(pct(wins[style], FN) / horses, 9);
    }
    // Per horse shares times horse counts cover every race.
    expect(sum(STYLES.map((s) => plain.styleWinPercentPerHorse[s] * plain.styleHorseCount[s]))).toBeCloseTo(100, 9);
  });

  it('a loaded card with instructions and a track bias does not leak into the fairness numbers', () => {
    let loaded = withInstructions(base, 'h1', { early: 'rateEarly', move: 'moveAtThreeEighths', path: 'stayInside' });
    loaded = withInstructions(loaded, 'h4', { move: 'saveForStretch' });
    loaded = withBias(loaded, { lane: 'inside', style: 'speed' });
    // Make sure the edit took, or the test proves nothing.
    expect(loaded.race.trackBias).not.toEqual(base.race.trackBias);
    expect(loaded.card.horses.some((h) => h.instructions.early !== 'default' || h.instructions.path !== 'default')).toBe(true);
    expect(summarizeFairness(loaded, START, FN)).toEqual(plain);
  });

  it('does not change the loaded data when it builds the fair fields', () => {
    const data = withBias(withInstructions(shipped(), 'h2', { early: 'rateEarly' }), { lane: 'inside' });
    const before = structuredClone(data);
    summarizeFairness(data, START, 5);
    expect(data).toEqual(before);
  });
});

// Made-up summaries. A baseline that passes every check, then one value at a time.
describe('M1.6 checks (F2 to F6)', () => {
  const c = base.tuning.checks;
  const fair = 100 / base.card.horses.length;
  const tol = c.fairnessTolerancePoints.value;
  const close = c.closeWinPercentBand.value;
  const photo = c.photoFinishPercentBand.value;
  const eighth = c.leaderAtEighthLosesPercentBand.value;
  const win = c.cardWinSharePercentBand.value;

  const mid = (b: { min: number; max: number }) => (b.min + b.max) / 2;
  function goodCard(): CardSummary {
    const horses = base.card.horses.map((h) => ({
      id: h.id, name: h.name, post: h.post, style: h.style, instructions: [] as string[],
      winPercent: 100 / base.card.horses.length, avgPlace: 4.5, avgBeatenLengths: 3,
    }));
    return {
      races: 1000, horses, winnerTime: { median: 12200, min: 12000, max: 12400 },
      closeWinPercent: mid(close), photoFinishPercent: mid(photo), leaderAtEighthLosesPercent: mid(eighth),
      paceLabelPercent: { hot: 30, honest: 40, slow: 30 },
      luck: { racesWithEventPercent: 35, eventCount: { blocked: 1, steadied: 1, bumped: 1 } },
    };
  }
  const goodFair = (): FairnessSummary => ({
    postWinPercent: {
      frontRunner: Array<number>(8).fill(fair), stalker: Array<number>(8).fill(fair), closer: Array<number>(8).fill(fair),
    },
    styleWinPercentPerHorse: { frontRunner: fair, stalker: fair, closer: fair },
    styleHorseCount: { frontRunner: 3, stalker: 3, closer: 2 },
  });
  const run = (card = goodCard(), fairness = goodFair(), data: GameData = base): Check[] => buildChecks(data, card, fairness);
  const flagged = (checks: Check[]) => checks.filter((x) => !x.pass);
  const of = (checks: Check[], id: string) => checks.filter((x) => x.id === id);

  it('passes everything when every value is inside its band, and covers F2 to F5', () => {
    const checks = run();
    expect(flagged(checks)).toEqual([]);
    for (const id of ['F2', 'F3', 'F4', 'F5']) expect(of(checks, id).length, id).toBeGreaterThan(0);
    expect(of(checks, 'F4').length).toBe(3);
  });

  it('F2 flags a post outside the tolerance, carrying the measured value and the band', () => {
    const f = goodFair();
    f.postWinPercent.stalker[4] = fair + tol + 0.5;
    const out = flagged(run(goodCard(), f));
    expect(out.length).toBe(1);
    expect(out[0].id).toBe('F2');
    expect(out[0].measured).toBeCloseTo(fair + tol + 0.5, 9);
    expect(out[0].min).toBeCloseTo(fair - tol, 9);
    expect(out[0].max).toBeCloseTo(fair + tol, 9);
  });

  it('F2 flags a post that is too low, too', () => {
    const f = goodFair();
    f.postWinPercent.closer[7] = fair - tol - 0.5;
    const out = flagged(run(goodCard(), f));
    expect(out.map((x) => x.id)).toEqual(['F2']);
    expect(out[0].measured).toBeCloseTo(fair - tol - 0.5, 9);
  });

  it('F2 band edges count as inside', () => {
    const f = goodFair();
    f.postWinPercent.frontRunner[0] = fair - tol;
    f.postWinPercent.frontRunner[1] = fair + tol;
    expect(flagged(run(goodCard(), f))).toEqual([]);
  });

  it('F3 flags a style outside the tolerance, passes at the edges', () => {
    const f = goodFair();
    f.styleWinPercentPerHorse.closer = fair + tol;
    f.styleWinPercentPerHorse.frontRunner = fair - tol;
    expect(flagged(run(goodCard(), f))).toEqual([]);
    f.styleWinPercentPerHorse.closer = fair + tol + 0.5;
    const out = flagged(run(goodCard(), f));
    expect(out.map((x) => x.id)).toEqual(['F3']);
    expect(out[0].measured).toBeCloseTo(fair + tol + 0.5, 9);
  });

  const dramaCases: [string, keyof CardSummary, { min: number; max: number }][] = [
    ['close margins', 'closeWinPercent', close],
    ['photo finishes', 'photoFinishPercent', photo],
    ['leader at the 1/8 pole loses', 'leaderAtEighthLosesPercent', eighth],
  ];
  it.each(dramaCases)('F4 %s: edges inside, just outside flags with measured value and band', (_name, key, band) => {
    for (const edge of [band.min, band.max]) {
      const k = { ...goodCard(), [key]: edge };
      expect(flagged(run(k)), `edge ${edge}`).toEqual([]);
    }
    for (const out of [band.min - 0.5, band.max + 0.5]) {
      const k = { ...goodCard(), [key]: out };
      const f = flagged(run(k));
      expect(f.length, `value ${out}`).toBe(1);
      expect(f[0].id).toBe('F4');
      expect(f[0].measured).toBeCloseTo(out, 9);
      expect(f[0].min).toBe(band.min);
      expect(f[0].max).toBe(band.max);
    }
  });

  it('F5 flags a horse under the minimum and names it', () => {
    const k = goodCard();
    k.horses[2] = { ...k.horses[2], winPercent: win.min - 1 };
    const f = flagged(run(k));
    expect(f.length).toBe(1);
    expect(f[0].id).toBe('F5');
    expect(f[0].measured).toBe(win.min - 1);
    expect(JSON.stringify(f[0])).toContain(k.horses[2].name);
    expect(f[0].min).toBe(win.min);
  });

  it('F5 flags a horse over the maximum and names it', () => {
    const k = goodCard();
    k.horses[5] = { ...k.horses[5], winPercent: win.max + 1 };
    const f = flagged(run(k));
    expect(f.length).toBe(1);
    expect(f[0].id).toBe('F5');
    expect(f[0].measured).toBe(win.max + 1);
    expect(JSON.stringify(f[0])).toContain(k.horses[5].name);
    expect(f[0].max).toBe(win.max);
  });

  it('F5 edges count as inside, one horse at the minimum and another at the maximum', () => {
    const k = goodCard();
    k.horses[0] = { ...k.horses[0], winPercent: win.min };
    k.horses[1] = { ...k.horses[1], winPercent: win.max };
    expect(flagged(run(k))).toEqual([]);
  });

  it('F5 flags both a low and a high horse in the same card', () => {
    const k = goodCard();
    k.horses[0] = { ...k.horses[0], winPercent: 0 };
    k.horses[1] = { ...k.horses[1], winPercent: 60 };
    const f = flagged(run(k));
    expect(f.map((x) => x.id)).toEqual(['F5', 'F5']);
    const text = JSON.stringify(f);
    expect(text).toContain(k.horses[0].name);
    expect(text).toContain(k.horses[1].name);
  });

  it('reads the bands from the data it is given, so a changed band changes the result', () => {
    const tight = withTuning(base, (t) => { t.checks.closeWinPercentBand.value = { min: 90, max: 95 }; });
    expect(flagged(run(goodCard(), goodFair(), tight)).map((x) => x.id)).toEqual(['F4']);
    const wide = withTuning(base, (t) => { t.checks.fairnessTolerancePoints.value = 50; });
    const f = goodFair();
    f.postWinPercent.stalker[0] = 40;
    expect(flagged(run(goodCard(), f, wide))).toEqual([]);
    expect(flagged(run(goodCard(), f, base)).length).toBe(1);
  });

  it('through runBatch: wide bands pass every check, impossible bands flag, with real measured values', () => {
    const wideBand = { min: 0, max: 100 };
    const wide = withTuning(base, (t) => {
      t.checks.fairnessTolerancePoints.value = 100;
      t.checks.closeWinPercentBand.value = wideBand;
      t.checks.photoFinishPercentBand.value = wideBand;
      t.checks.leaderAtEighthLosesPercentBand.value = wideBand;
      t.checks.cardWinSharePercentBand.value = wideBand;
    });
    expect(flagged(runBatch(wide, START, 12).checks)).toEqual([]);

    const impossible = withTuning(base, (t) => {
      t.checks.closeWinPercentBand.value = { min: 101, max: 102 };
      t.checks.photoFinishPercentBand.value = { min: 101, max: 102 };
      t.checks.leaderAtEighthLosesPercentBand.value = { min: 101, max: 102 };
      t.checks.cardWinSharePercentBand.value = { min: 101, max: 102 };
    });
    const summary = runBatch(impossible, START, 12);
    const f = flagged(summary.checks);
    expect(f.filter((x) => x.id === 'F4').length).toBe(3);
    expect(f.some((x) => x.id === 'F5')).toBe(true);
    const closeCheck = f.find((x) => x.id === 'F4' && x.measured === summary.card.closeWinPercent);
    expect(closeCheck).toBeDefined();
    expect(closeCheck!.min).toBe(101);
    expect(closeCheck!.max).toBe(102);
  });
});

describe('M1.6 nothing changes a race', () => {
  it('a batch does not change the data it is given, even frozen', () => {
    const data = deepFreeze(shipped());
    const before = structuredClone(data);
    runBatch(data, START, 6);
    expect(data).toEqual(before);
  });

  it('a batch does not change the data it is given when the card has instructions and a bias', () => {
    const data = withBias(withInstructions(shipped(), 'h3', { early: 'rateEarly' }), { lane: 'inside' });
    const before = structuredClone(data);
    runBatch(data, START, 6);
    expect(data).toEqual(before);
  });

  it('runRace for a seed gives the same result before and after a batch', () => {
    const data = shipped();
    const seeds = [0, START, 4294967295];
    const before = seeds.map((s) => bytes(runRace(data, s)));
    runBatch(data, START, 6);
    expect(seeds.map((s) => bytes(runRace(data, s)))).toEqual(before);
  });
});

describe('M1.6 determinism', () => {
  it('the same data and seed range give a deep-equal summary twice', () => {
    const a = runBatch(shipped(), START, 10);
    const b = runBatch(shipped(), START, 10);
    expect(b).toEqual(a);
    expect(a.seedStart).toBe(START);
    expect(a.races).toBe(10);
    expect(a.fieldSize).toBe(base.card.horses.length);
  });

  it('a different seed start gives a different summary', () => {
    expect(runBatch(shipped(), START + 1000, 10)).not.toEqual(runBatch(shipped(), START, 10));
  });

  it('seed ranges are consecutive: start S and N races covers exactly S to S+N-1', () => {
    const both = summarizeCard(base, START, 12);
    const a = summarizeCard(base, START, 6);
    const b = summarizeCard(base, START + 6, 6);
    for (const h of both.horses) {
      const x = a.horses.find((l) => l.id === h.id)!;
      const y = b.horses.find((l) => l.id === h.id)!;
      expect(h.winPercent).toBeCloseTo((x.winPercent + y.winPercent) / 2, 9);
      expect(h.avgPlace).toBeCloseTo((x.avgPlace + y.avgPlace) / 2, 9);
    }
    expect(both.winnerTime.min).toBe(Math.min(a.winnerTime.min, b.winnerTime.min));
    expect(both.winnerTime.max).toBe(Math.max(a.winnerTime.max, b.winnerTime.max));
  });
});

describe('M1.6 a style with no horse in the rotation is not measured', () => {
  const fairTol = base.tuning.checks.fairnessTolerancePoints.value;
  const twoHorse = withField(base, [
    { style: 'frontRunner', speed: 70, stamina: 70, kick: 70 },
    { style: 'stalker', speed: 70, stamina: 70, kick: 70 },
  ]);
  const f3 = (checks: Check[]) => checks.filter((c) => c.id === 'F3');

  it('a 2-horse card: the rotation holds one front-runner, one stalker and no closer', () => {
    const f = summarizeFairness(twoHorse, START, 20);
    expect(f.styleHorseCount).toEqual({ frontRunner: 1, stalker: 1, closer: 0 });
    expect(f.postWinPercent.frontRunner.length).toBe(2);
  });

  it('a 2-horse card: F3 never names closer and is measured from the styles that have horses', () => {
    const summary = runBatch(twoHorse, START, 20);
    const out = f3(summary.checks);
    expect(out.length).toBe(1);
    expect(out[0].detail).not.toBe('closer');
    expect(['frontRunner', 'stalker']).toContain(out[0].detail);
    const fair2 = 100 / 2;
    const vals = [summary.fairness.styleWinPercentPerHorse.frontRunner, summary.fairness.styleWinPercentPerHorse.stalker];
    // Two horses split every race, so the two per-horse shares add to 100.
    expect(vals[0] + vals[1]).toBeCloseTo(100, 9);
    expect(Math.abs(out[0].measured - fair2)).toBeCloseTo(Math.max(...vals.map((v) => Math.abs(v - fair2))), 9);
    expect(vals).toContain(out[0].measured);
    expect(out[0].pass).toBe(Math.abs(out[0].measured - fair2) <= fairTol);
  });

  it('a style with no horse is never read as a measured 0: F3 passes on the measured styles alone', () => {
    const fair2 = 100 / 2;
    const f: FairnessSummary = {
      postWinPercent: { frontRunner: [50, 50], stalker: [50, 50], closer: [50, 50] },
      styleWinPercentPerHorse: { frontRunner: fair2, stalker: fair2, closer: 0 },
      styleHorseCount: { frontRunner: 1, stalker: 1, closer: 0 },
    };
    const out = f3(buildChecks(twoHorse, summarizeCard(twoHorse, START, 3), f));
    expect(out.length).toBe(1);
    expect(out[0].pass).toBe(true);
    expect(out[0].measured).toBe(fair2);
    expect(out[0].detail).not.toBe('closer');
  });

  it('a 2-horse card: F3 still flags when a style that has horses is outside the band', () => {
    const f: FairnessSummary = {
      postWinPercent: { frontRunner: [50, 50], stalker: [50, 50], closer: [50, 50] },
      styleWinPercentPerHorse: { frontRunner: 50 + fairTol + 5, stalker: 50 - fairTol - 5, closer: 0 },
      styleHorseCount: { frontRunner: 1, stalker: 1, closer: 0 },
    };
    const out = f3(buildChecks(twoHorse, summarizeCard(twoHorse, START, 3), f));
    expect(out.length).toBe(1);
    expect(out[0].pass).toBe(false);
    expect(['frontRunner', 'stalker']).toContain(out[0].detail);
  });

  it('an 8-horse run still measures all three styles', () => {
    const summary = runBatch(base, START, 25);
    expect(base.card.horses.length).toBe(8);
    expect(summary.fairness.styleHorseCount).toEqual({ frontRunner: 3, stalker: 3, closer: 2 });
    const out = f3(summary.checks);
    expect(out.length).toBe(1);
    expect(STYLES).toContain(out[0].detail);
    // Per-horse shares times horse counts add up to every race won.
    const f = summary.fairness;
    const total = sum(STYLES.map((s) => f.styleWinPercentPerHorse[s] * f.styleHorseCount[s]));
    expect(total).toBeCloseTo(100, 9);
    // The farthest of all three styles from fair is the one reported.
    const fair8 = 100 / 8;
    const far = Math.max(...STYLES.map((s) => Math.abs(f.styleWinPercentPerHorse[s] - fair8)));
    expect(Math.abs(out[0].measured - fair8)).toBeCloseTo(far, 9);
  });
});
