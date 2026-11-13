import { describe, expect, it } from 'vitest';
import type { RaceResult } from '../sim/result';
import { makeRaceSetup, playerView, raceFrame } from './raceFrame';
import { art, playbackSecond, race, rd, seeds } from './testkit';

// AN3, the no-spoilers rule, on everything the screen shows: at race time t nothing
// returned for the screen may depend on a replay sample later than the one after t.
// Method: build a second result identical up to that sample and different after it
// (replay, calls, finish, events, pace, photo flag), and require identical frames.

type Mutable = {
  -readonly [K in keyof RaceResult]: RaceResult[K];
};

function scrambleAfter(r: RaceResult, t: number): RaceResult {
  const c = structuredClone(r) as Mutable;
  const { step } = r.replay;
  const k = Math.floor(t / step) + 1; // the sample after t
  const cut = k * step;
  const ids = r.replay.horses.map((h) => h.id);
  const other = (id: string) => ids[(ids.indexOf(id) + 3) % ids.length];

  for (const h of c.replay.horses) {
    for (let i = k + 1; i < h.distance.length; i++) {
      h.distance[i] += 900 * (i - k) + ((i * 7919) % 400);
      h.lane[i] = (h.lane[i] + 350 + i) % 800;
    }
  }
  c.replay.events = c.replay.events.map((e) =>
    e.time > cut ? { ...e, type: e.type === 'blocked' ? 'steadied' : 'blocked', horse: other(e.horse), otherHorse: null, time: e.time } : e,
  );
  c.calls = c.calls.map((call) =>
    call.time > cut
      ? { ...call, horses: [...call.horses].reverse().map((h, i) => ({ id: h.id, position: i + 1, lengthsBehind: h.lengthsBehind + 777 })) }
      : call,
  );
  // Rotate the ids among the entries that finish after the cut, so the finish stays a permutation.
  const later = c.finish.filter((f) => f.time > cut).map((f) => f.id);
  const rotated = [...later.slice(1), ...later.slice(0, 1)];
  let n = 0;
  c.finish = c.finish.map((f) =>
    f.time > cut ? { ...f, id: rotated[n++], time: f.time + 3, margin: { lengths: 9, label: 'nose' }, beatenLengths: f.beatenLengths + 5 } : f,
  );
  const halfCall = r.calls.find((x) => x.furlongsToGo === 4)!;
  if (t < halfCall.time) c.pace = { halfMile: r.pace.halfMile + 123, label: r.pace.label === 'hot' ? 'slow' : 'hot' };
  if (r.finish[0].time > cut) c.photoFinish = !r.photoFinish;
  return c;
}

/** Times worth asking about: spread through the race, and either side of every call and event. */
function probeTimes(r: RaceResult): number[] {
  const times = new Set<number>();
  const win = r.finish[0].time;
  for (let j = 0; j <= 14; j++) times.add(Math.floor((win * j) / 14));
  for (const c of r.calls) for (const d of [-60, -11, -1, 0, 1, 11]) times.add(Math.max(0, c.time + d));
  for (const e of r.replay.events) for (const d of [-120, -11, -1, 0, 1, 50]) times.add(Math.max(0, e.time + d));
  for (const f of r.finish) for (const d of [-11, -1, 0, 1]) times.add(Math.max(0, f.time + d));
  // Round two: just before and after the winner's and the second horse's finish, where the
  // position line (H3b) and the clock switch and the gallop out (RV2b) begins.
  for (const f of r.finish.slice(0, 2)) for (const d of [-50, -11, -1, 0, 1, 11, 50, 200]) times.add(Math.max(0, f.time + d));
  for (const d of [-1, 0, 1]) times.add(Math.floor((r.finish[0].time + r.finish[1].time) / 2) + d);
  return [...times].filter((x) => x <= win + 400).sort((a, b) => a - b);
}

describe('AN3: probe times', () => {
  it('AN3: the probes include moments just before and after the winner\'s and the second horse\'s finish', () => {
    for (const seed of seeds(10)) {
      const r = race(seed);
      const times = probeTimes(r);
      for (const f of r.finish.slice(0, 2)) {
        for (const d of [-50, -1, 0, 1, 50]) expect(times, `seed ${seed} finish ${f.place} ${d}`).toContain(f.time + d);
      }
    }
  });
});

describe('AN3: the frame at time t does not depend on anything later than the sample after t', () => {
  it('AN3: a result that differs only after that sample gives an identical frame, for every player', () => {
    let compared = 0;
    for (const seed of seeds(14)) {
      const r = race(seed);
      const setup = makeRaceSetup(r, rd, seed % 4, art);
      for (const t of probeTimes(r)) {
        const scrambled = scrambleAfter(r, t);
        const setup2 = makeRaceSetup(scrambled, rd, seed % 4, art);
        const p = playbackSecond(t);
        for (const post of [1, 4, 7]) {
          const a = raceFrame(setup, playerView(setup, post), p);
          const b = raceFrame(setup2, playerView(setup2, post), p);
          expect(b, `seed ${seed} t ${t} player post ${post}`).toEqual(a);
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(1000);
  });

  it('AN3: the scramble really changes the later result, so the comparison bites', () => {
    const r = race(1);
    const s = scrambleAfter(r, 3000);
    expect(s.replay.horses[0].distance[400]).not.toBe(r.replay.horses[0].distance[400]);
    expect(s.replay.horses[0].distance[300]).toBe(r.replay.horses[0].distance[300]);
    expect(s.finish.map((f) => f.id)).not.toEqual(r.finish.map((f) => f.id));
    expect(s.calls[8].horses[0].id).not.toBe(r.calls[8].horses[0].id);
    expect(s.pace.label).not.toBe(r.pace.label);
    // And at the end of the race the frames do differ, since by then those things are shown.
    const a = makeRaceSetup(r, rd, 0, art);
    const b = makeRaceSetup(s, rd, 0, art);
    const end = playbackSecond(r.finish[0].time + 100);
    expect(raceFrame(b, playerView(b, 2), end)).not.toEqual(raceFrame(a, playerView(a, 2), end));
  });

  it('AN3: the winner and photo calls and the winner clock appear only once the winner is at the wire', () => {
    for (const seed of seeds(60)) {
      const r = race(seed);
      const setup = makeRaceSetup(r, rd, 0, art);
      const me = playerView(setup, 2);
      const win = r.finish[0].time;
      const before = raceFrame(setup, me, playbackSecond(win - 1));
      const after = raceFrame(setup, me, playbackSecond(win) + 1e-6);
      expect(before.call).not.toMatch(/wins it|gets there|too close|Too close/);
      expect(before.clock).not.toBe(after.clock);
      expect(before.phase).toBe('race');
      const winnerName = r.inputs.card.horses.find((h) => h.id === r.finish[0].id)!.name;
      if (r.photoFinish) expect(after.call).toMatch(/Too close to call/);
      else expect(after.call).toContain(winnerName);
    }
  });
});
