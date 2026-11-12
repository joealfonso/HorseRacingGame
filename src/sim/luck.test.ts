import { describe, expect, it, vi } from 'vitest';
import type { GameData } from '../data/schema';
import type { EventType, RaceEvent, RaceResult } from './result';
import { runRace } from './runRace';
import {
  bytes, mean, problems, report, seedRange, shipped, winnerId, withInstructions, withTuning,
} from './testkit';

// M1.5 luck events (L1 to L5), the last sentence of I5, the welfare rule and draw isolation.
// Written from the spec ("M1.5 Luck events" and "Luck, settled after M1.5"), not from luck.ts.
//
// One batch feeds most of the tests: the shipped card over a fixed 2,000 seeds, once with luck on
// (as shipped) and once with the three luck rates at zero. Each race is checked as it is run and
// only small summaries are kept, because holding 4,000 full results (about 100 KB of replay each)
// would cost far more memory than the tests are worth. Fixed seeds, so nothing here can flake.
//
// A rate is the chance a horse is unlucky in that way today; it becomes an event only if the race
// then puts the horse in the matching situation within a short window. So event counts are far
// below rate x horses, and every threshold below comes from the spec or from tuning, not from
// what the code happens to give.
vi.setConfig({ testTimeout: 120_000 });

const base = shipped();
const luck = base.tuning.luck;
const ev = luck.events!;
const CAP = luck.maxEventsPerRace.value;
const BAND = luck.raceShareBandPercent.value;
const SEEDS = seedRange(30000, 2000); // L2 asks for a fixed 2,000-seed range
// The largest cap validation allows (tuning.luck.maxEventsPerRace is a whole number from 0 to 20).
const MAX_CAP = 20;
const TYPES: readonly EventType[] = ['blocked', 'steadied', 'bumped'];

const RATE_KEYS = ['blockedPerHorse', 'steadiedPerHorse', 'bumpedPerHorse'] as const;
const withRates = (data: GameData, rate: number): GameData =>
  withTuning(data, (t) => { for (const k of RATE_KEYS) t.luck[k].value = rate; });
const off = withRates(base, 0);

// The replay is whole numbers: distance in hundredths of a foot, lane in hundredths of a lane. Each
// is rounded, so a gap between two of them can be out by 1 from the model's own unrounded gap.
const ROUNDING = 1;
const LENGTH = base.tuning.horseLengthFeet.value * 100; // one horse length in replay distance units
const AHEAD = ev.aheadLengths.value * LENGTH;
const SAME_LANE = ev.sameLaneWithinLanes.value * 100;
const ALONGSIDE = ev.alongsideLengths.value * LENGTH;
const ADJACENT = ev.adjacentWithinLanes.value * 100;

/** A replay series at a time in hundredths of a second, by straight lines between samples. */
function seriesAt(series: number[], step: number, time: number): number {
  const i = Math.min(Math.floor(time / step), series.length - 2);
  const f = (time - i * step) / step;
  return series[i] + (series[i + 1] - series[i]) * f;
}

/** What is wrong with where the horses stood at this event's time, or null. L3. */
function geometryProblem(r: RaceResult, e: RaceEvent): string | null {
  const { step, horses } = r.replay;
  const state = (id: string) => {
    const h = horses.find((x) => x.id === id);
    if (!h) return null;
    return { d: seriesAt(h.distance, step, e.time), lane: seriesAt(h.lane, step, e.time) };
  };
  const me = state(e.horse);
  if (!me) return `${e.type}: horse ${e.horse} is not in the replay`;
  if (e.type === 'bumped') {
    if (e.otherHorse === null) return 'bumped with no partner';
    const other = state(e.otherHorse);
    if (!other) return `bumped: partner ${e.otherHorse} is not in the replay`;
    if (e.otherHorse === e.horse) return 'bumped with itself';
    const apart = Math.abs(other.d - me.d);
    const across = Math.abs(other.lane - me.lane);
    if (apart > ALONGSIDE + ROUNDING) return `bumped ${e.horse}/${e.otherHorse}: ${apart} apart, not alongside (limit ${ALONGSIDE})`;
    if (across > ADJACENT + ROUNDING) return `bumped ${e.horse}/${e.otherHorse}: ${across} lanes apart, not adjacent (limit ${ADJACENT})`;
    return null;
  }
  if (e.otherHorse !== null) return `${e.type} has a partner ${e.otherHorse}`;
  const found = horses.some((o) => {
    if (o.id === e.horse) return false;
    const s = state(o.id)!;
    const gap = s.d - me.d;
    return gap >= -ROUNDING && gap <= AHEAD + ROUNDING && Math.abs(s.lane - me.lane) <= SAME_LANE + ROUNDING;
  });
  return found ? null : `${e.type} ${e.horse} has no horse ahead within ${AHEAD} in nearly its lane`;
}

interface Row {
  seed: number;
  events: RaceEvent[];
  onFinish: Map<string, { place: number; time: number }>;
  offFinish: Map<string, { place: number; time: number }>;
  winner: string;
  /** Only for a race with no event: did it equal the luck-off race outside the echoed inputs? */
  sameAsOff: boolean | null;
  geometry: string[];
  timing: string[];
  sanity: string[];
}

const finishMap = (r: RaceResult) => new Map(r.finish.map((f) => [f.id, { place: f.place, time: f.time }]));
const quiet = (r: RaceResult) => JSON.stringify({ ...r, inputs: null });

/** L5: what is wrong with when this event happened, or null. */
function timingProblems(r: RaceResult, e: RaceEvent): string[] {
  const out: string[] = [];
  const last = (r.replay.horses[0].distance.length - 1) * r.replay.step;
  if (!(e.time > 0)) out.push(`${e.type} at ${e.time}, not after the gate opens`);
  if (e.time > last) out.push(`${e.type} at ${e.time}, past the last replay sample ${last}`);
  for (const id of [e.horse, e.otherHorse]) {
    if (id === null) continue;
    const finishedAt = r.replay.horses.find((h) => h.id === id)!.finishTime;
    if (!(e.time < finishedAt)) out.push(`${e.type} at ${e.time}, not before ${id} finishes at ${finishedAt}`);
  }
  return out;
}

const rows: Row[] = SEEDS.map((seed, index) => {
  const on = runRace(base, seed);
  const without = runRace(off, seed);
  const events = on.replay.events;
  return {
    seed,
    events,
    onFinish: finishMap(on),
    offFinish: finishMap(without),
    winner: winnerId(on),
    sameAsOff: events.length === 0 ? quiet(on) === quiet(without) : null,
    geometry: events.map((e) => geometryProblem(on, e)).filter((p): p is string => p !== null).map((p) => `seed ${seed}: ${p}`),
    timing: events.flatMap((e) => timingProblems(on, e)).map((p) => `seed ${seed}: ${p}`),
    // The whole-result sanity check on every race with an event, and on the first 200 of the rest.
    sanity: events.length > 0 || index < 200 ? problems(on).map((p) => `seed ${seed}: ${p}`) : [],
  };
});
/** For each horse, how many bumps it appears in, as the horse or as the other horse. */
function bumpsPerHorse(events: readonly RaceEvent[]): Map<string, number> {
  const n = new Map<string, number>();
  for (const e of events) {
    if (e.type !== 'bumped') continue;
    for (const id of [e.horse, e.otherHorse]) if (id !== null) n.set(id, (n.get(id) ?? 0) + 1);
  }
  return n;
}
const allEvents = rows.flatMap((r) => r.events);

describe('the batch', () => {
  it('ran the 2,000 seeds, with luck events in it of all three types', () => {
    expect(rows).toHaveLength(2000);
    for (const t of TYPES) expect(allEvents.filter((e) => e.type === t).length, t).toBeGreaterThan(20);
    report('events per type', Object.fromEntries(TYPES.map((t) => [t, allEvents.filter((e) => e.type === t).length])));
  });
});

describe('L1: off means unchanged', () => {
  it('with the three rates at zero the events list is empty in every race', () => {
    // The luck-off half of the batch, rerun here for a small slice so the claim is explicit.
    for (const seed of SEEDS.slice(0, 100)) expect(runRace(off, seed).replay.events, `seed ${seed}`).toEqual([]);
  });

  it('with the rates at zero, extreme but valid luck.events values do not change one byte outside the echoed inputs', () => {
    const loud = withTuning(off, (t) => {
      t.luck.events = {
        windowFeet: { value: 1320, status: 'starting guess' },
        aheadLengths: { value: 3, status: 'starting guess' },
        sameLaneWithinLanes: { value: 0.99, status: 'starting guess' },
        alongsideLengths: { value: 1, status: 'starting guess' },
        adjacentWithinLanes: { value: 1.5, status: 'starting guess' },
        blockedSeconds: { value: 5, status: 'starting guess' },
        blockedSpeedDropShare: { value: 0.25, status: 'starting guess' },
        steadiedSpeedDropShare: { value: 0.25, status: 'starting guess' },
        bumpedSpeedDropShare: { value: 0.25, status: 'starting guess' },
      };
    });
    const gone = withTuning(off, (t) => { delete t.luck.events; });
    for (const seed of seedRange(31000, 40)) {
      const a = runRace(loud, seed);
      const b = runRace(gone, seed);
      const c = runRace(off, seed);
      expect(a.replay.events).toEqual([]);
      expect(quiet(a), `seed ${seed} loud against shipped group`).toBe(quiet(c));
      expect(quiet(b), `seed ${seed} no group against shipped group`).toBe(quiet(c));
    }
    // The echoed inputs differ, so the test is not comparing a race with itself.
    expect(bytes(runRace(loud, 31000))).not.toBe(bytes(runRace(off, 31000)));
  });

  it('a race with zero rates still runs when luck.events is missing (validation only asks for it above zero)', () => {
    const gone = withTuning(off, (t) => { delete t.luck.events; });
    expect(() => runRace(gone, 5)).not.toThrow();
  });
});

describe('L2: rare', () => {
  const withEvent = rows.filter((r) => r.events.length > 0).length;
  const share = (withEvent / rows.length) * 100;

  it('the share of races with at least one event is inside raceShareBandPercent', () => {
    report('L2 share of races with an event (percent)', share, 'band', BAND);
    expect(share).toBeGreaterThanOrEqual(BAND.min);
    expect(share).toBeLessThanOrEqual(BAND.max);
  });

  it('no race has more than maxEventsPerRace events', () => {
    const most = Math.max(...rows.map((r) => r.events.length));
    report('L2 most events in one race', most, 'cap', CAP);
    expect(most).toBeLessThanOrEqual(CAP);
  });

  describe('the cap, with the rates raised so that it binds', () => {
    const seeds = seedRange(32000, 150);
    const maxEvents = (cap: number): number[] => {
      const data = withTuning(withRates(base, 1), (t) => { t.luck.maxEventsPerRace.value = cap; });
      return seeds.map((s) => runRace(data, s).replay.events.length);
    };

    it('without a cap worth the name, a race with every rate at 1 has more than the shipped cap (so the cap has something to do)', () => {
      const counts = maxEvents(MAX_CAP);
      report('events per race at rates 1, cap 20: max', Math.max(...counts), 'mean', mean(counts));
      expect(Math.max(...counts)).toBeGreaterThan(CAP);
    });

    it.each([1, 2, CAP])('a cap of %i is never exceeded, and is reached', (cap) => {
      const counts = maxEvents(cap);
      expect(Math.max(...counts)).toBe(cap);
    });

    it('a cap of 0 means no events at all', () => {
      expect(Math.max(...maxEvents(0))).toBe(0);
    });
  });
});

describe('L3: events fit the race', () => {
  it('only blocked, steadied and bumped ever appear, each with a known horse, and otherHorse is set for a bump only', () => {
    const ids = new Set(base.card.horses.map((h) => h.id));
    for (const e of allEvents) {
      expect(TYPES).toContain(e.type);
      expect(ids.has(e.horse)).toBe(true);
      if (e.type === 'bumped') {
        expect(e.otherHorse).not.toBeNull();
        expect(ids.has(e.otherHorse!)).toBe(true);
        expect(e.otherHorse).not.toBe(e.horse);
      } else {
        expect(e.otherHorse).toBeNull();
      }
      expect(Object.keys(e).sort()).toEqual(['horse', 'otherHorse', 'time', 'type']);
    }
  });

  it('every blocked or steadied horse has another horse ahead within the distance, in nearly its lane, and every bump has its partner alongside in an adjacent lane', () => {
    const bad = rows.flatMap((r) => r.geometry);
    report('L3 events checked', allEvents.length, 'problems', bad.length);
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('the geometry check can fail: it flags a blocked leader, a bump with a far partner, and a partner where none belongs', () => {
    const r = runRace(base, SEEDS[0]);
    const time = 6000; // 60 seconds in
    const dist = (id: string) => seriesAt(r.replay.horses.find((h) => h.id === id)!.distance, r.replay.step, time);
    const order = r.replay.horses.map((h) => h.id).sort((a, b) => dist(b) - dist(a));
    const leader = order[0];
    const last = order[order.length - 1];
    expect(dist(leader) - dist(order[1])).toBeGreaterThan(ROUNDING); // a clear leader, nobody ahead
    expect(geometryProblem(r, { type: 'blocked', horse: leader, otherHorse: null, time })).not.toBeNull();
    expect(geometryProblem(r, { type: 'bumped', horse: leader, otherHorse: last, time })).not.toBeNull();
    expect(geometryProblem(r, { type: 'steadied', horse: last, otherHorse: leader, time })).not.toBeNull();
    expect(geometryProblem(r, { type: 'bumped', horse: leader, otherHorse: null, time })).not.toBeNull();
  });
});

describe('L4: events cost something, not everything', () => {
  // Paired on the same seed: a horse's random numbers are keyed by its id, so the only difference between
  // the luck-on and luck-off run of a seed is luck itself. Positive means worse (a later place, a slower time).
  interface Pair { placeCost: number; timeCost: number; won: boolean }
  const pairs: Record<EventType, Pair[]> = { blocked: [], steadied: [], bumped: [] };
  const everyEvent: Pair[] = [];
  for (const r of rows) {
    // Only races where every event is of the one type count toward that type's cost. In a race that also
    // had an event of another type, the horse's place is moved by that event too, and a type that cost
    // nothing would still look costly. (Found by breaking the code: a free steadied event passed
    // when all races were pooled.)
    const types = new Set(r.events.map((e) => e.type));
    for (const e of r.events) {
      // A bump costs both horses, so a bump counts for the horse and its partner.
      for (const id of e.type === 'bumped' ? [e.horse, e.otherHorse] : [e.horse]) {
        const on = id === null ? undefined : r.onFinish.get(id);
        const without = id === null ? undefined : r.offFinish.get(id);
        if (!on || !without) continue; // a malformed event is for the L3 tests to report
        const pair = { placeCost: on.place - without.place, timeCost: on.time - without.time, won: r.winner === id };
        everyEvent.push(pair);
        if (types.size === 1 && e.type in pairs) pairs[e.type].push(pair);
      }
    }
  }

  it.each(['blocked', 'steadied'] as const)('%s horses finish worse on average than the same horse without the event, in place and in time', (type) => {
    const p = pairs[type];
    report(`L4 ${type}: n`, p.length, 'mean place cost', mean(p.map((x) => x.placeCost)), 'mean time cost (hundredths)', mean(p.map((x) => x.timeCost)));
    expect(p.length).toBeGreaterThan(40);
    expect(mean(p.map((x) => x.placeCost))).toBeGreaterThan(0);
    expect(mean(p.map((x) => x.timeCost))).toBeGreaterThan(0);
  });

  it('bumped horses, the pair pooled, finish worse on average than the same horses without the bump', () => {
    // Pooled on purpose, and not per horse: a known issue on the tuning list (DECISIONS.md, "an early bump
    // can help a front-runner") is that a bump in the first seconds can help the horse that is bumped, because
    // it drops out of the speed duel and saves itself. So the cost of the bumped horse alone is not asserted.
    const p = pairs.bumped;
    report('L4 bumped pooled: n', p.length, 'mean place cost', mean(p.map((x) => x.placeCost)), 'mean time cost', mean(p.map((x) => x.timeCost)));
    expect(p.length).toBeGreaterThan(40);
    expect(mean(p.map((x) => x.placeCost))).toBeGreaterThan(0);
    expect(mean(p.map((x) => x.timeCost))).toBeGreaterThan(0);
  });

  it('horses with an event still win some races, overall and for each kind', () => {
    const wins = Object.fromEntries(TYPES.map((t) => [t, pairs[t].filter((x) => x.won).length]));
    report('L4 wins by horses with an event', wins, 'of', everyEvent.length, 'in all');
    expect(everyEvent.filter((x) => x.won).length).toBeGreaterThan(0);
    for (const t of TYPES) expect(wins[t], t).toBeGreaterThan(0);
  });

  it('an event is a setback and not a ruin: an eventful horse does not always finish worse', () => {
    for (const t of TYPES) expect(pairs[t].some((x) => x.placeCost <= 0), t).toBe(true);
  });
});

describe('L5: timing', () => {
  it('every event is after the gate opens, before the affected horse (and the other horse of a bump) finishes, and inside the replay', () => {
    const bad = rows.flatMap((r) => r.timing);
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('events are listed in the order they happened', () => {
    for (const r of rows) {
      const times = r.events.map((e) => e.time);
      expect(times, `seed ${r.seed}`).toEqual([...times].sort((a, b) => a - b));
    }
  });

  it('the timing check can fail: an event placed at the start, or after the finish, is flagged', () => {
    const r = runRace(base, SEEDS[0]);
    const h = r.replay.horses[0];
    const early: RaceEvent = { type: 'steadied', horse: h.id, otherHorse: null, time: 0 };
    const late: RaceEvent = { type: 'steadied', horse: h.id, otherHorse: null, time: h.finishTime };
    const bumpLate: RaceEvent = { type: 'bumped', horse: h.id, otherHorse: r.finish[0].id, time: r.finish[0].time };
    expect(timingProblems(r, early)).not.toEqual([]);
    expect(timingProblems(r, late)).not.toEqual([]);
    expect(timingProblems(r, bumpLate)).not.toEqual([]);
  });
});

describe('one bump per horse per race, on either side', () => {
  it('in the shipped-settings batch, no horse appears in more than one bump in a race', () => {
    const bad = rows.filter((r) => Math.max(0, ...bumpsPerHorse(r.events).values()) > 1).map((r) => r.seed);
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('with every rate at 1, the cap at 20 and costs at their maximum, still at most one bump per horse, in races that have several bumps', () => {
    const data = withTuning(withRates(base, 1), (t) => {
      t.luck.maxEventsPerRace.value = MAX_CAP;
      for (const k of ['blockedSpeedDropShare', 'steadiedSpeedDropShare', 'bumpedSpeedDropShare'] as const) t.luck.events![k].value = 0.25;
      t.luck.events!.windowFeet.value = 1320;
      t.luck.events!.alongsideLengths.value = 1;
      t.luck.events!.adjacentWithinLanes.value = 1.5;
    });
    let severalBumps = 0;
    let mostBumps = 0;
    const over: string[] = [];
    for (const seed of seedRange(34000, 200)) {
      const events = runRace(data, seed).replay.events;
      const per = bumpsPerHorse(events);
      for (const [id, n] of per) if (n > 1) over.push(`seed ${seed} ${id}: ${n}`);
      const bumps = events.filter((e) => e.type === 'bumped').length;
      mostBumps = Math.max(mostBumps, bumps);
      if (bumps >= 2) severalBumps++;
    }
    report('one-bump rule: races with 2+ bumps of 200', severalBumps, 'most bumps in a race', mostBumps);
    // The setup must put the rule under strain, or passing proves nothing.
    expect(severalBumps).toBeGreaterThan(20);
    expect(over.slice(0, 5)).toEqual([]);
  });
});

describe('welfare: luck never stops, removes or harms a horse', () => {
  it('in the 2,000 luck-on races, every horse finishes, places run 1 to N, and the result sanity check passes', () => {
    const bad = rows.flatMap((r) => r.sanity);
    expect(bad.slice(0, 5)).toEqual([]);
    for (const r of rows) {
      expect(r.onFinish.size, `seed ${r.seed}`).toBe(base.card.horses.length);
      expect([...r.onFinish.values()].map((f) => f.place).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    }
  });

  it('the same with every rate at its maximum (1) and the largest legal event costs, windows and distances', () => {
    const extreme = withTuning(withRates(base, 1), (t) => {
      t.luck.maxEventsPerRace.value = MAX_CAP;
      t.luck.events = {
        windowFeet: { value: 1320, status: 'starting guess' },
        aheadLengths: { value: 3, status: 'starting guess' },
        sameLaneWithinLanes: { value: 0.99, status: 'starting guess' },
        alongsideLengths: { value: 1, status: 'starting guess' },
        adjacentWithinLanes: { value: 1.5, status: 'starting guess' },
        blockedSeconds: { value: 5, status: 'starting guess' },
        blockedSpeedDropShare: { value: 0.25, status: 'starting guess' },
        steadiedSpeedDropShare: { value: 0.25, status: 'starting guess' },
        bumpedSpeedDropShare: { value: 0.25, status: 'starting guess' },
      };
    });
    for (const data of [withRates(base, 1), extreme]) {
      let most = 0;
      for (const seed of seedRange(33000, 150)) {
        const r = runRace(data, seed);
        expect(problems(r), `seed ${seed}`).toEqual([]);
        expect(r.finish.map((f) => f.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        most = Math.max(most, r.replay.events.length);
      }
      expect(most).toBeGreaterThan(0);
    }
  });
});

describe('draw isolation: luck never shifts a value drawn for an existing stream', () => {
  // Rates are global, so "one horse's luck on" is compared as luck on against luck off. If luck drew from
  // an existing stream, or changed how many numbers a stream gives, every race would move, event or not.
  // So a race in which no event happens must equal the luck-off race of the same seed outside the echoed inputs.
  const quietRows = rows.filter((r) => r.events.length === 0);

  it('there are plenty of races with no event to compare', () => {
    expect(quietRows.length).toBeGreaterThan(500);
  });

  it('every luck-on race with no event is byte-identical, outside inputs, to the same seed with luck off', () => {
    const moved = quietRows.filter((r) => r.sameAsOff !== true).map((r) => r.seed);
    expect(moved.slice(0, 10)).toEqual([]);
  });
});

describe('I5 (from M1.5 on): stay inside makes a horse blocked more often', () => {
  const seeds = seedRange(40000, 500);
  const blockedSeeds = (data: GameData, id: string): number =>
    seeds.filter((s) => runRace(data, s).replay.events.some((e) => e.type === 'blocked' && e.horse === id)).length;

  // Paired: the same horse, the same seeds, the same unlucky draws (they are keyed by the horse id); only
  // the instruction differs. Stalkers h3 to h5 and closers h6 to h8 are on the shipped card.
  it.each([['stalker', 'h3'], ['stalker', 'h5'], ['closer', 'h6'], ['closer', 'h7']])('a %s (%s) is blocked in more races with stay inside than without', (_style, id) => {
    const without = blockedSeeds(base, id);
    const inside = blockedSeeds(withInstructions(base, id, { path: 'stayInside' }), id);
    report(`I5 ${id}: races blocked without / with stay inside (of ${seeds.length})`, without, inside);
    expect(inside).toBeGreaterThan(without);
  });
});

describe('a bad luck rate stops the race and names the rate (unvalidated data)', () => {
  const RATES = ['blockedPerHorse', 'steadiedPerHorse', 'bumpedPerHorse'] as const;
  // Broken after validation, on a copy, as in the NaN checks in instructions.test.ts.
  const broken = (edit: (t: GameData['tuning']['luck']) => void): GameData => withTuning(base, (t) => edit(t.luck));
  const BAD: [string, (l: GameData['tuning']['luck'], k: (typeof RATES)[number]) => void][] = [
    ['NaN', (l, k) => { l[k].value = NaN; }],
    ['Infinity', (l, k) => { l[k].value = Infinity; }],
    ['undefined', (l, k) => { (l[k] as { value: unknown }).value = undefined; }],
    ['a missing field', (l, k) => { delete (l as Partial<typeof l>)[k]; }],
    ['1.5', (l, k) => { l[k].value = 1.5; }],
    ['a negative', (l, k) => { l[k].value = -0.1; }],
  ];

  for (const k of RATES) {
    it.each(BAD)(`${k} as %s throws, naming the rate`, (_name, edit) => {
      const data = broken((l) => edit(l, k));
      expect(() => runRace(data, 1)).toThrow(k);
    });
  }

  it('the other two rates being fine does not hide it: the bad one is the one named', () => {
    const data = broken((l) => { l.steadiedPerHorse.value = NaN; });
    expect(() => runRace(data, 1)).toThrow(/steadiedPerHorse/);
    expect(() => runRace(data, 1)).not.toThrow(/blockedPerHorse/);
  });

  it('rates of exactly 0 and 1 run', () => {
    expect(() => runRace(withRates(base, 0), 1)).not.toThrow();
    expect(() => runRace(withRates(base, 1), 1)).not.toThrow();
  });
});
