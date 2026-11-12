import { describe, expect, it } from 'vitest';
import type { Tuning } from '../data/schema';
import type { RaceResult } from './result';
import { runRace, SIM_VERSION } from './runRace';
import {
  badLeaves, callAt, distanceAt, equalSpecs, leaves, seedRange, shipped, timeReaching, withField, withRace, withTuning,
} from './testkit';

// O1 to O3 and O6 to O8: the shape of the result and what is in it. O4 and O5 are in
// margins.test.ts and O9 in replaySanity.test.ts.
const data = shipped();
const SEEDS = seedRange(0, 100);
const results = SEEDS.map((s) => runRace(data, s));
const FURLONG = 66000; // hundredths of a foot
const tuning = data.tuning;

describe('output shape: a plain object that survives JSON', () => {
  it('deep-equals itself after a JSON round trip (strictly: no undefined keys, no class instances)', () => {
    for (const r of results) expect(JSON.parse(JSON.stringify(r))).toStrictEqual(r);
  });

  it('has no -0, NaN, Infinity, undefined or non-plain value at any leaf', () => {
    for (const r of results) expect(badLeaves(r), `seed ${r.seed}`).toEqual([]);
  });

  it('the leaf walker can tell (it flags each kind of bad value and a class instance)', () => {
    expect(badLeaves({ a: -0, b: NaN, c: Infinity, d: undefined, e: () => 1, f: 1n })).toHaveLength(6);
    expect(badLeaves({ a: [0, 1.5, 'x', true, null] })).toEqual([]);
    expect(() => leaves({ a: new Map() })).toThrow(/plain/);
    expect(() => leaves({ a: new Set() })).toThrow(/plain/);
    expect(() => leaves({ a: new Date(0) })).toThrow(/plain/);
  });

  it('a -0 in the input does not leak into the result', () => {
    const odd = withTuning(data, (t) => { t.goingTimeAddedPercent.fast.value = -0; });
    const r = runRace(odd, 4);
    expect(badLeaves(r)).toEqual([]);
    expect(JSON.parse(JSON.stringify(r))).toStrictEqual(r);
  });

  it('every number in the result outside the echoed inputs is a whole number', () => {
    for (const r of results.slice(0, 20)) {
      for (const [path, v] of leaves({ ...r, inputs: undefined }).filter(([p]) => !p.startsWith('$.inputs'))) if (typeof v === 'number') expect(Number.isInteger(v), `seed ${r.seed} ${path}`).toBe(true);
    }
  });

  it('has the fields the renderer relies on', () => {
    const r = results[0];
    expect(Object.keys(r).sort()).toEqual(['calls', 'fractions', 'finish', 'inputs', 'pace', 'photoFinish', 'replay', 'seed', 'simVersion', 'units'].sort());
    expect(Object.keys(r.replay).sort()).toEqual(expect.arrayContaining(['events', 'horses', 'step', 'wireFrame']));
    expect(Object.keys(r.replay.horses[0]).sort()).toEqual(expect.arrayContaining(['distance', 'finishTime', 'id', 'lane', 'post']));
  });
});

describe('O1: header', () => {
  it('has the sim version and the seed', () => {
    for (const r of results) {
      expect(r.simVersion).toBe(SIM_VERSION);
    }
    expect(results.map((r) => r.seed)).toEqual(SEEDS);
  });

  it('echoes every input: track, race, tuning and the card with horses by post', () => {
    const r = results[3];
    const sorted = [...data.card.horses].sort((a, b) => a.post - b.post);
    expect(r.inputs.track).toEqual(data.track);
    expect(r.inputs.race).toEqual(data.race);
    expect(r.inputs.tuning).toEqual(data.tuning);
    expect(r.inputs.card).toEqual({ ...data.card, horses: sorted });
  });

  it('echoes the inputs it was given, so changed data shows up', () => {
    const odd = withRace(data, (x) => { x.going = 'muddy'; x.trackBias = { lane: 'inside', style: 'speed' }; });
    odd.card.horses[2].instructions.move = 'saveForStretch';
    const r = runRace(odd, 4);
    expect(r.inputs.race.going).toBe('muddy');
    expect(r.inputs.race.trackBias).toEqual({ lane: 'inside', style: 'speed' });
    expect(r.inputs.card.horses.find((h) => h.id === odd.card.horses[2].id)!.instructions.move).toBe('saveForStretch');
  });

  it('says what the units are', () => {
    const u = results[0].units;
    expect(u.time).toMatch(/hundredth/);
    expect(u.distance).toMatch(/hundredth/);
    expect(u.lane).toMatch(/hundredth/);
    expect(u.lengths).toMatch(/thousandth/);
  });
});

describe('O2: finish order', () => {
  it('lists every horse once, places 1 to N with no gaps or repeats', () => {
    const ids = data.card.horses.map((h) => h.id).sort();
    for (const r of results) {
      expect(r.finish.map((f) => f.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(r.finish.map((f) => f.id).sort()).toEqual(ids);
      for (const f of r.finish) expect(data.card.horses.find((h) => h.id === f.id)!.post).toBe(f.post);
    }
  });

  it('every horse finishes, with a real finish time in the replay too', () => {
    for (const r of results) {
      expect(r.replay.horses).toHaveLength(8);
      for (const h of r.replay.horses) {
        expect(Number.isFinite(h.finishTime)).toBe(true);
        expect(h.finishTime).toBeGreaterThan(0);
      }
    }
  });

  it('the same level finish gives the same strict order every time, whatever order the field is listed in', () => {
    // No randomness left in the form, so horses with the same stats run very alike and some finish in the same hundredth.
    const flat = withTuning(withField(data, equalSpecs(8, 'frontRunner')), (t: Tuning) => {
      const m = t.model;
      m.formSpeedShare.value = 0; m.formReserveShare.value = 0; m.rhythmSpreadShare.value = 0; m.kickSpreadShare.value = 0;
      m.askSpreadFeet.value = 0; m.gateBreakMaxSeconds.value = 0; m.laneWidthFeet.value = 1e-9;
    });
    const backwards = structuredClone(flat);
    backwards.card.horses.reverse();
    let ties = 0;
    for (const seed of seedRange(0, 200)) {
      const r = runRace(flat, seed);
      expect(r.finish.map((f) => f.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(new Set(r.finish.map((f) => f.id)).size).toBe(8);
      expect(JSON.stringify(runRace(flat, seed))).toBe(JSON.stringify(r));
      expect(JSON.stringify(runRace(backwards, seed))).toBe(JSON.stringify(r));
      for (let i = 1; i < 8; i++) {
        expect(r.finish[i].time).toBeGreaterThanOrEqual(r.finish[i - 1].time);
        if (r.finish[i].time === r.finish[i - 1].time) ties++;
      }
    }
    expect(ties, 'the seeds should include some horses level in the same hundredth').toBeGreaterThan(0);
  });
});

describe('O3: final times', () => {
  it('are whole hundredths of a second and never decrease down the order', () => {
    for (const r of results) {
      for (const f of r.finish) {
        expect(Number.isInteger(f.time)).toBe(true);
        expect(f.time).toBeGreaterThan(0);
      }
      for (let i = 1; i < r.finish.length; i++) expect(r.finish[i].time).toBeGreaterThanOrEqual(r.finish[i - 1].time);
    }
  });

  it('two adjacent horses may share a hundredth (so equal times are allowed, not an error)', () => {
    const shared = seedRange(0, 500).filter((s) => {
      const f = runRace(data, s).finish;
      return f.some((x, i) => i > 0 && x.time === f[i - 1].time);
    });
    // Not required by the spec, but it should happen over 500 races and must not break anything.
    for (const s of shared.slice(0, 5)) expect(runRace(data, s).finish.map((f) => f.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('O6: fractions and calls', () => {
  it('fractions are the leader at each quarter mile, then the final time (10 furlongs)', () => {
    for (const r of results) {
      expect(r.fractions.map((f) => f.furlongs)).toEqual([2, 4, 6, 8, 10]);
      const times = r.fractions.map((f) => f.time);
      for (const t of times) expect(Number.isInteger(t)).toBe(true);
      for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
      expect(times[times.length - 1]).toBe(r.finish[0].time);
    }
  });

  it('the quarter fractions match the first horse to reach that point in the replay', () => {
    for (const r of results) {
      for (const f of r.fractions.slice(0, -1)) {
        const reached = Math.min(...r.replay.horses.map((h) => timeReaching(h, r.replay.step, f.furlongs * FURLONG) ?? Infinity));
        expect(Math.abs(reached - f.time), `seed ${r.seed} at ${f.furlongs} furlongs`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('fractions for other distances end with the winner and name even furlongs before that', () => {
    for (const d of [5, 6, 7, 8, 9, 11, 12]) {
      const r = runRace(withRace(data, (x) => { x.distanceFurlongs = d; }), d);
      const fs = r.fractions.map((f) => f.furlongs);
      expect(fs[fs.length - 1]).toBe(d);
      expect(r.fractions[fs.length - 1].time).toBe(r.finish[0].time);
      for (let q = 2; q < d; q += 2) expect(fs, `${d} furlongs`).toContain(q);
      for (let i = 1; i < fs.length; i++) expect(fs[i]).toBeGreaterThan(fs[i - 1]);
    }
  });

  it('calls are at every furlong pole, nearest the gate first', () => {
    for (const r of results.slice(0, 10)) expect(r.calls.map((c) => c.furlongsToGo)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it('each call has every horse once, positions 1 to N by order, leader first with 0 behind', () => {
    const ids = data.card.horses.map((h) => h.id).sort();
    for (const r of results) {
      for (const c of r.calls) {
        expect(c.horses.map((h) => h.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(c.horses.map((h) => h.id).sort()).toEqual(ids);
        expect(c.horses[0].lengthsBehind).toBe(0);
        for (let i = 1; i < c.horses.length; i++) {
          expect(Number.isInteger(c.horses[i].lengthsBehind)).toBe(true);
          expect(c.horses[i].lengthsBehind).toBeGreaterThanOrEqual(c.horses[i - 1].lengthsBehind);
        }
        expect(Number.isInteger(c.time)).toBe(true);
      }
      for (let i = 1; i < r.calls.length; i++) expect(r.calls[i].time).toBeGreaterThan(r.calls[i - 1].time);
    }
  });

  it('the calls agree with the replay: the leader is on the pole, the others are where the replay puts them', () => {
    const lengthUnits = tuning.horseLengthFeet.value * 100;
    const wire = data.race.distanceFurlongs * FURLONG;
    for (const r of results.slice(0, 50)) {
      const step = r.replay.step;
      for (const c of r.calls) {
        const at = (id: string) => distanceAt(r.replay.horses.find((h) => h.id === id)!, step, c.time);
        const pole = wire - c.furlongsToGo * FURLONG;
        const leader = c.horses[0];
        expect(Math.abs(at(leader.id) - pole), `seed ${r.seed} pole ${c.furlongsToGo}`).toBeLessThanOrEqual(100);
        for (const h of c.horses) {
          const behind = (at(leader.id) - at(h.id)) / lengthUnits;
          expect(Math.abs(behind - h.lengthsBehind / 1000), `seed ${r.seed} pole ${c.furlongsToGo} ${h.id}`).toBeLessThan(0.05);
        }
        // Where two horses are clearly apart in the replay, their positions agree with it.
        for (const a of c.horses) {
          for (const b of c.horses) {
            if (at(a.id) - at(b.id) > 0.1 * lengthUnits) expect(a.position).toBeLessThan(b.position);
          }
        }
      }
    }
  });

  it('the leader is the first horse to reach the pole, so the call time is when it got there', () => {
    for (const r of results.slice(0, 50)) {
      const wire = data.race.distanceFurlongs * FURLONG;
      for (const c of r.calls) {
        const first = Math.min(...r.replay.horses.map((h) => timeReaching(h, r.replay.step, wire - c.furlongsToGo * FURLONG) ?? Infinity));
        expect(Math.abs(first - c.time)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('the quarter-mile call (8 to go) has the same time as the quarter fraction', () => {
    for (const r of results) expect(callAt(r, 8).time).toBe(r.fractions[0].time);
  });
});

describe('O7: pace label', () => {
  const par = (r: RaceResult) => {
    const p = r.inputs.tuning.paceParHalfMile[String(r.inputs.race.distanceFurlongs)][r.inputs.race.going].value;
    return p;
  };

  it('the half mile is the leader time at 4 furlongs', () => {
    for (const r of results) expect(r.pace.halfMile).toBe(r.fractions.find((f) => f.furlongs === 4)!.time);
  });

  it('is hot under the par, slow over it and honest between, using the values in tuning', () => {
    for (const r of results) {
      const p = par(r);
      const secs = r.pace.halfMile / 100;
      const expected = secs < p.hotUnderSeconds ? 'hot' : secs > p.slowOverSeconds ? 'slow' : 'honest';
      expect(r.pace.label, `seed ${r.seed} half ${secs}`).toBe(expected);
    }
    const labels = new Set(results.map((r) => r.pace.label));
    expect([...labels].sort()).toEqual(['honest', 'hot', 'slow']);
  });

  describe('the pars themselves, moved onto and either side of a race\'s half mile', () => {
    const base = results[1];
    const half = base.pace.halfMile / 100;
    const label = (hot: number, slow: number) => runRace(withTuning(data, (t) => {
      t.paceParHalfMile['10'].fast.value = { hotUnderSeconds: hot, slowOverSeconds: slow };
    }), base.seed).pace.label;

    it('the same race gives the same half mile when only the pars move', () => {
      const r = runRace(withTuning(data, (t) => { t.paceParHalfMile['10'].fast.value = { hotUnderSeconds: 1, slowOverSeconds: 2 }; }), base.seed);
      expect(r.pace.halfMile).toBe(base.pace.halfMile);
    });
    it('exactly on the hot par is not hot', () => expect(label(half, half + 1)).toBe('honest'));
    it('a hot par a hundredth above the half mile makes the race hot', () => expect(label(half + 0.01, half + 1)).toBe('hot'));
    it('exactly on the slow par is not slow', () => expect(label(half - 1, half)).toBe('honest'));
    it('a slow par a hundredth below the half mile makes the race slow', () => expect(label(half - 1, half - 0.01)).toBe('slow'));
  });

  it('uses the par for the race distance and going', () => {
    for (const going of ['fast', 'good', 'muddy', 'sloppy']) {
      for (const d of [5, 7, 10, 12]) {
        const r = runRace(withRace(data, (x) => { x.going = going; x.distanceFurlongs = d; }), 6);
        const p = tuning.paceParHalfMile[String(d)][going].value;
        const secs = r.pace.halfMile / 100;
        expect(r.pace.label, `${d} furlongs ${going}`).toBe(secs < p.hotUnderSeconds ? 'hot' : secs > p.slowOverSeconds ? 'slow' : 'honest');
      }
    }
  });

  it('a different par for the same race changes the label (so the label really reads tuning)', () => {
    const slowPar = withTuning(data, (t) => { t.paceParHalfMile['10'].fast.value = { hotUnderSeconds: 1, slowOverSeconds: 2 }; });
    const hotPar = withTuning(data, (t) => { t.paceParHalfMile['10'].fast.value = { hotUnderSeconds: 900, slowOverSeconds: 901 }; });
    expect(runRace(slowPar, 2).pace.label).toBe('slow');
    expect(runRace(hotPar, 2).pace.label).toBe('hot');
  });
});

describe('O8: replay', () => {
  const r0 = results[0];

  it('samples at the step in tuning (in hundredths of a second)', () => {
    for (const r of results) expect(r.replay.step).toBe(Math.round(tuning.replayStepSeconds.value * 100));
  });

  it('a different step in tuning gives a different step and a matching number of samples', () => {
    const fine = runRace(withTuning(data, (t) => { t.replayStepSeconds.value = 0.05; }), 12);
    const coarse = runRace(withTuning(data, (t) => { t.replayStepSeconds.value = 0.2; }), 12);
    expect(fine.replay.step).toBe(5);
    expect(coarse.replay.step).toBe(20);
    const last = (r: RaceResult) => Math.max(...r.replay.horses.map((h) => h.finishTime));
    for (const r of [fine, coarse]) {
      const n = r.replay.horses[0].distance.length;
      expect((n - 1) * r.replay.step).toBeGreaterThanOrEqual(last(r));
      expect((n - 2) * r.replay.step).toBeLessThanOrEqual(last(r));
    }
  });

  it('starts at time 0 with every horse at the gate, and every list is the same length', () => {
    for (const r of results) {
      const n = r.replay.horses[0].distance.length;
      for (const h of r.replay.horses) {
        expect(h.distance).toHaveLength(n);
        expect(h.lane).toHaveLength(n);
        expect(h.distance[0]).toBe(0);
      }
    }
  });

  it('runs until the last horse finishes: the final sample is at or just after that moment', () => {
    for (const r of results) {
      const lastFinish = Math.max(...r.replay.horses.map((h) => h.finishTime));
      const n = r.replay.horses[0].distance.length;
      expect((n - 1) * r.replay.step, `seed ${r.seed}`).toBeGreaterThanOrEqual(lastFinish);
      // At most one sample past the finish: a finish exactly on a sample still counts that sample.
      expect((n - 2) * r.replay.step, `seed ${r.seed}`).toBeLessThanOrEqual(lastFinish);
    }
  });

  it('every horse is at or past the wire by the last sample, and not yet at the wire at the first', () => {
    const wire = data.race.distanceFurlongs * FURLONG;
    for (const r of results) {
      for (const h of r.replay.horses) {
        expect(h.distance[h.distance.length - 1]).toBeGreaterThanOrEqual(wire);
        expect(h.distance[0]).toBeLessThan(wire);
      }
    }
  });

  it('lists the horses by post with the id and post of the card, and ground run beyond the rail', () => {
    for (const r of results) {
      expect(r.replay.horses.map((h) => h.post)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      for (const h of r.replay.horses) {
        expect(data.card.horses.find((x) => x.id === h.id)!.post).toBe(h.post);
        expect(Number.isInteger(h.extraGround)).toBe(true);
        expect(h.extraGround).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('has a wire frame at the winner\'s finish with every horse\'s distance and lane', () => {
    for (const r of results) {
      const w = r.replay.wireFrame;
      expect(w.time).toBe(r.finish[0].time);
      expect(w.horses).toHaveLength(8);
      expect(w.horses.map((h) => h.id).sort()).toEqual(data.card.horses.map((h) => h.id).sort());
      const winner = w.horses.find((h) => h.id === r.finish[0].id)!;
      expect(Math.abs(winner.distance - data.race.distanceFurlongs * FURLONG)).toBeLessThanOrEqual(100);
      for (const h of w.horses) {
        expect(Number.isInteger(h.distance)).toBe(true);
        expect(Number.isInteger(h.lane)).toBe(true);
      }
    }
  });

  it('the wire frame agrees with the replay samples at that moment', () => {
    for (const r of results.slice(0, 50)) {
      for (const h of r.replay.wireFrame.horses) {
        const rh = r.replay.horses.find((x) => x.id === h.id)!;
        expect(Math.abs(h.distance - distanceAt(rh, r.replay.step, r.replay.wireFrame.time)), `seed ${r.seed} ${h.id}`).toBeLessThanOrEqual(100);
      }
    }
  });

  it('the events list is empty in M1.3, even with luck rates at 1 (luck is not built yet)', () => {
    expect(r0.replay.events).toEqual([]);
    const lucky = withTuning(data, (t) => {
      t.luck.blockedPerHorse.value = 1; t.luck.steadiedPerHorse.value = 1; t.luck.bumpedPerHorse.value = 1;
    });
    expect(runRace(lucky, 0).replay.events).toEqual([]);
  });
});
