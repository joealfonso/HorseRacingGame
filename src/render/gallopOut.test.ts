import { describe, expect, it } from 'vitest';
import type { RaceResult } from '../sim/result';
import { minimapDot } from './minimap';
import { makeRaceSetup, playerView, raceFrame } from './raceFrame';
import { stripAt, stripOrders } from './strip';
import { art, cfg, interp, race, raceDistanceOf, rd, seeds } from './testkit';
import { cameraX, drawnHorsesAt, finishRuns, horsesAt, makeRaceModel, worldX } from './view';

// RV2b, gallop out: after its own finish time a horse keeps going at the speed it crossed
// the wire with, as whole pixels, so nothing freezes on screen. Drawn by the renderer only:
// it reads no sample after the horse's finish, and the strip, clock, calls, mini map and
// camera do not use it. World x never decreases for any horse at any time.

const drawn = (r: RaceResult, t: number) => {
  const m = makeRaceModel(r, cfg);
  return drawnHorsesAt(m, finishRuns(r), t);
};

describe('RV2b: after its finish a horse keeps going at its crossing speed, in whole pixels', () => {
  it('RV2b: past the finish the drawn x grows at the speed the horse crossed the wire with', () => {
    let checked = 0;
    for (const seed of seeds(40)) {
      const r = race(seed);
      const m = makeRaceModel(r, cfg);
      const runs = finishRuns(r);
      const D = raceDistanceOf(r);
      r.replay.horses.forEach((h, k) => {
        const f = h.finishTime;
        // The crossing speed, found a different way: the last half second to the wire.
        const v = (D - interp(h.distance, r.replay.step, f - 50)) / 50; // hundredths of a foot per hundredth of a second
        const at = (t: number) => drawnHorsesAt(m, runs, t)[k];
        const x0 = at(f).x;
        expect(x0, `seed ${seed} ${h.id} at the wire`).toBeGreaterThanOrEqual(worldX(D, cfg) - 1);
        expect(x0).toBeLessThanOrEqual(worldX(D, cfg) + 2);
        for (const dt of [100, 200, 400]) {
          const moved = at(f + dt).x - x0;
          const want = (v * dt * 4) / 100;
          expect(Number.isInteger(at(f + dt).x)).toBe(true);
          expect(Math.abs(moved - want), `seed ${seed} ${h.id} +${dt}: moved ${moved}, ${want.toFixed(1)} expected`).toBeLessThanOrEqual(want * 0.12 + 2);
          checked++;
        }
      });
    }
    expect(checked).toBe(40 * 8 * 3);
  });

  it('RV2b: it keeps moving: x strictly grows from step to step well past the finish, never freezing', () => {
    for (const seed of seeds(20)) {
      const r = race(seed);
      const m = makeRaceModel(r, cfg);
      const runs = finishRuns(r);
      r.replay.horses.forEach((h, k) => {
        let prev = drawnHorsesAt(m, runs, h.finishTime)[k].x;
        for (let t = h.finishTime + 20; t <= h.finishTime + 1500; t += 20) {
          const x = drawnHorsesAt(m, runs, t)[k].x;
          expect(x, `seed ${seed} ${h.id} t ${t}`).toBeGreaterThan(prev);
          prev = x;
        }
      });
    }
  });

  it('RV2b: world x never decreases for any horse at any time, over 100 seeds', () => {
    let steps = 0;
    for (const seed of seeds(100)) {
      const r = race(seed);
      const m = makeRaceModel(r, cfg);
      const runs = finishRuns(r);
      let prev = drawnHorsesAt(m, runs, 0).map((h) => h.x);
      const end = Math.max(...r.finish.map((f) => f.time)) + 1500;
      for (let t = 1.7; t <= end; t += 1.7) {
        const now = drawnHorsesAt(m, runs, t).map((h) => h.x);
        now.forEach((x, k) => {
          if (x < prev[k]) throw new Error(`seed ${seed} horse ${k} t ${t}: x went ${prev[k]} to ${x}`);
        });
        prev = now;
        steps++;
      }
    }
    expect(steps).toBeGreaterThan(400000);
  });

  it('RV2b: before its finish the drawn position is the replay position', () => {
    for (const seed of seeds(40)) {
      const r = race(seed);
      const m = makeRaceModel(r, cfg);
      const runs = finishRuns(r);
      for (let t = 0; t < 12400; t += 13.3) {
        const real = horsesAt(r, cfg, t);
        const d = drawnHorsesAt(m, runs, t);
        d.forEach((h, k) => {
          if (t < r.replay.horses[k].finishTime) {
            expect(h.x, `seed ${seed} ${h.id} t ${t}`).toBe(real[k].x);
            expect(h.hoofY, `seed ${seed} ${h.id} t ${t}`).toBe(real[k].hoofY);
          }
        });
      }
    }
  });

  it('RV2b: after the finish the drawn lane is the lane at the wire, not the replay lane', () => {
    const r = race(3);
    const h = r.replay.horses[4];
    const at = drawn(r, h.finishTime + 500)[4];
    const laneAtWire = interp(h.lane, r.replay.step, h.finishTime);
    expect(Math.abs(at.lane - laneAtWire)).toBeLessThanOrEqual(30);
  });

  it('RV2b: the drawn position after a horse\'s finish depends on no sample after that finish (scramble method)', () => {
    let compared = 0;
    for (const seed of seeds(20)) {
      const r = race(seed);
      r.replay.horses.forEach((h, k) => {
        const i = Math.floor(h.finishTime / r.replay.step); // the last sample at or before the finish
        const c = structuredClone(r);
        for (const x of c.replay.horses) {
          for (let j = i + 1; j < x.distance.length; j++) {
            x.distance[j] += 5000 + j * 31;
            x.lane[j] = (x.lane[j] + 400) % 800;
          }
        }
        expect(c.replay.horses[k].distance[i + 1]).not.toBe(h.distance[i + 1]);
        const a = makeRaceModel(r, cfg);
        const b = makeRaceModel(c, cfg);
        const runsA = finishRuns(r);
        const runsB = finishRuns(c);
        for (const dt of [0, 1, 7, 50, 100, 333, 1000]) {
          const t = h.finishTime + dt;
          const pa = drawnHorsesAt(a, runsA, t)[k];
          const pb = drawnHorsesAt(b, runsB, t)[k];
          expect(pb, `seed ${seed} ${h.id} +${dt}`).toEqual(pa);
          compared++;
        }
      });
    }
    expect(compared).toBe(20 * 8 * 7);
  });
});

describe('RV2b: the gallop out is drawn only; everything else reads the result', () => {
  it('RV2b: strip, clock, call, mini map, camera and position are the same as with no gallop out at all', () => {
    for (const seed of seeds(15)) {
      const r = race(seed);
      const setup = makeRaceSetup(r, rd, 0, art);
      // The same race, but every horse is drawn standing still at the wire after it finishes.
      const still = { ...setup, runs: setup.runs.map((x) => ({ ...x, speed: 0 })) };
      const me = playerView(setup, 3);
      const end = setup.timeline.doneAt + 2;
      for (let p = setup.timeline.doorsAt; p <= end; p += 0.41) {
        const a = raceFrame(setup, me, p);
        const b = raceFrame(still, me, p);
        for (const key of ['strip', 'clock', 'call', 'dots', 'cam', 'wireTick', 'position', 'message', 'phase', 'raceTime'] as const) {
          expect(a[key], `seed ${seed} p ${p} ${key}`).toEqual(b[key]);
        }
      }
    }
  });

  it('RV2b: the mini map dots and strip after the finish come from the replay and the result, as before', () => {
    for (const seed of seeds(8)) {
      const r = race(seed);
      const setup = makeRaceSetup(r, rd, 0, art);
      const me = playerView(setup, 5);
      const strips = stripOrders(r, rd.hud.stripHysteresisLengths.value);
      const D = raceDistanceOf(r);
      for (const dt of [10, 150, 600, 1500]) {
        const t = r.finish[0].time + dt;
        const p = setup.timeline.doorsAt + t / 100 / setup.timeline.speed;
        const f = raceFrame(setup, me, p);
        const wantStrip = stripAt(strips, r.replay.step, f.raceTime).map((id) => r.replay.horses.find((h) => h.id === id)!.post);
        expect(f.strip.map((s) => s.post)).toEqual(wantStrip);
        const want = horsesAt(r, cfg, f.raceTime).map((h) => ({ post: h.post, ...minimapDot(setup.minimap, h.distance, D, h.lane, r.inputs.tuning.laneMax.value, h.id === me.id) }));
        for (const w of want) {
          const dot = f.dots.find((d) => d.post === w.post)!;
          expect([dot.x, dot.y]).toEqual([w.x, w.y]);
        }
        expect(f.cam).toBe(cameraX(setup.model, me.id, f.raceTime));
      }
    }
  });

  it('RV2b: the sprites in a frame do gallop out: a finished horse is drawn further right each frame', () => {
    const r = race(2);
    const setup = makeRaceSetup(r, rd, 0, art);
    const me = playerView(setup, 2);
    const loser = r.finish[7];
    const start = setup.timeline.doorsAt + (loser.time + 50) / 100 / setup.timeline.speed;
    // The camera is held on the wire then, so a moving sprite is a gallopping horse.
    const x = (p: number) => raceFrame(setup, me, p).horses.find((h) => h.id === loser.id)!.x;
    expect(x(start + 0.5)).toBeGreaterThan(x(start));
    expect(Number.isInteger(x(start + 0.5))).toBe(true);
  });
});
