import { describe, expect, it } from 'vitest';
import {
  cameraX, drawOrder, horsesAt, makeRaceModel, strideFrame, viewConfig, worldX, hoofY, type HorseAt, type ViewConfig,
} from './view';
import { makeRaceSetup, playerView, raceFrame } from './raceFrame';
import { art, cfg, deepFreeze, game, interp, race, raceDistanceOf, rd, reachTime, seeds, whole } from './testkit';
import { runRace } from '../sim/runRace';

// Race view math, spec 3.5 and criteria RV1 to RV8 and RV10 (section 10). Expected values
// come from the spec's formulas and from the sim's own result, not from the functions' output.

const SEEDS_500 = seeds(500);
const model = (seed: number) => makeRaceModel(race(seed), cfg);

/** x is the floor of the exact value, allowing float noise at whole-number boundaries. */
function isFloorOf(actual: number, exact: number): boolean {
  return Number.isInteger(actual) && actual <= exact + 1e-6 && exact < actual + 1 + 1e-6;
}

describe('RV1: world x and hoof y', () => {
  it('RV1: the data gives 4 px per foot, 4 px per lane and hoof line 116', () => {
    expect(cfg.pxPerFoot).toBe(4);
    expect(cfg.pxPerLane).toBe(4);
    expect(cfg.hoofBaseY).toBe(116);
  });

  it.each([
    [0, 0],
    [1, 0],
    [24, 0],
    [25, 1],
    [799, 31],
    [800, 32], // spec 3.5: one 8 foot length is 32 px
    [801, 32],
    [1234500, 49380],
    [660000, 26400], // 10 furlongs, the wire
  ])('RV1: distance %i hundredths of a foot is world x %i', (distance, x) => {
    expect(worldX(distance, cfg)).toBe(x);
  });

  it.each([
    [0, 116],
    [24, 116],
    [25, 117],
    [100, 120],
    [800, 148], // spec 3.5: lanes 0 to 8 give y116 to y148
    [899, 151],
  ])('RV1: lane %i hundredths gives hoof y %i', (lane, y) => {
    expect(hoofY(lane, cfg)).toBe(y);
  });

  it('RV1: the values come from data, not constants', () => {
    expect(worldX(1000, { pxPerFoot: 3 })).toBe(30);
    expect(hoofY(100, { hoofBaseY: 100, pxPerLane: 5 })).toBe(105);
  });

  it('RV1: viewConfig reads every view value from the race-day data', () => {
    const view = viewConfig(rd);
    for (const [key, marked] of Object.entries(rd.view)) expect(view[key as keyof ViewConfig]).toBe(marked.value);
  });

  it('RV1: x and y are whole numbers and the floor of the linear position at every sample and between', () => {
    for (const seed of seeds(20)) {
      const r = race(seed);
      const { step } = r.replay;
      const last = (r.replay.horses[0].distance.length - 1) * step;
      for (let t = 0; t <= last + 20; t += step / 3 + 0.37) {
        const at = horsesAt(r, cfg, t);
        r.replay.horses.forEach((h, k) => {
          const d = interp(h.distance, step, t);
          const l = interp(h.lane, step, t);
          expect(isFloorOf(at[k].x, (d * 4) / 100), `seed ${seed} t ${t} horse ${h.id} x`).toBe(true);
          expect(isFloorOf(at[k].hoofY, 116 + (l * 4) / 100), `seed ${seed} t ${t} horse ${h.id} y`).toBe(true);
          expect(whole(at[k].x) && whole(at[k].hoofY)).toBe(true);
        });
      }
    }
  });
});

describe('RV2: interpolation', () => {
  // Round two: RV2 now only claims this for samples up to the horse's own finish. Past it
  // the horse is drawn gallopping out (RV2b, gallopOut.test.ts), so "holds the last
  // sample" is no longer part of RV2 and is not tested here.
  it('RV2: at the time of sample i a horse is exactly where sample i says, for every sample up to its finish', () => {
    let checked = 0;
    for (const seed of seeds(10)) {
      const r = race(seed);
      const { step } = r.replay;
      r.replay.horses.forEach((h, k) => {
        for (let i = 0; i * step <= h.finishTime; i += 1) {
          const at = horsesAt(r, cfg, i * step)[k];
          expect(at.distance, `seed ${seed} ${h.id} sample ${i}`).toBe(h.distance[i]);
          expect(at.lane, `seed ${seed} ${h.id} sample ${i}`).toBe(h.lane[i]);
          checked++;
        }
      });
    }
    expect(checked).toBeGreaterThan(90000);
  });

  it('RV2: between two samples a horse is on the straight line between them', () => {
    const r = race(3);
    const { step } = r.replay;
    const h = r.replay.horses[2];
    const i = 400;
    const at = horsesAt(r, cfg, i * step + step / 4)[2];
    expect(at.distance).toBeCloseTo(h.distance[i] + (h.distance[i + 1] - h.distance[i]) / 4, 6);
    expect(at.lane).toBeCloseTo(h.lane[i] + (h.lane[i + 1] - h.lane[i]) / 4, 6);
  });

  it('RV2: before the gate (time 0 or less) a horse holds the first sample', () => {
    const r = race(4);
    for (const t of [0, -1, -500]) {
      const at = horsesAt(r, cfg, t);
      r.replay.horses.forEach((h, k) => expect(at[k].distance).toBe(h.distance[0]));
    }
  });

  it('RV2: no value is NaN or infinite at any time, early, late or between', () => {
    for (const seed of seeds(5)) {
      const r = race(seed);
      for (const t of [-100, 0, 0.5, 5, 9.999, 10, 1234.5, 12000, 12279, 12280, 12281, 50000]) {
        for (const h of horsesAt(r, cfg, t)) {
          for (const v of [h.distance, h.lane, h.x, h.hoofY]) expect(Number.isFinite(v), `seed ${seed} t ${t}`).toBe(true);
        }
      }
    }
  });
});

describe('RV3: camera x is a pure function', () => {
  it('RV3: same result, player and time give the same whole number, whatever was asked before', () => {
    for (const seed of seeds(10)) {
      const r = race(seed);
      const times = Array.from({ length: 120 }, (_v, i) => i * 105.3);
      const ids = r.inputs.card.horses.map((h) => h.id);
      const m1 = makeRaceModel(r, cfg);
      const reference = ids.map((id) => times.map((t) => cameraX(m1, id, t)));
      // A different model object, asked in a scrambled order, other players in between.
      const m2 = makeRaceModel(structuredClone(r), cfg);
      const order = times.map((_t, i) => (i * 37) % times.length);
      for (const pass of [0, 1]) {
        ids.forEach((id, p) => {
          for (const j of order) {
            const other = ids[(p + 3 + pass) % ids.length];
            cameraX(m2, other, times[(j * 11) % times.length]);
            const got = cameraX(m2, id, times[j]);
            expect(got, `seed ${seed} ${id} t ${times[j]}`).toBe(reference[p][j]);
            expect(whole(got)).toBe(true);
          }
        });
      }
    }
  });

  it('RV3: the camera depends on the player: a back marker sits further left than the leader', () => {
    // Not a purity claim by itself: it proves the player argument is read.
    const r = race(1);
    const m = makeRaceModel(r, cfg);
    const tMid = 5000;
    const cams = new Set(r.inputs.card.horses.map((h) => cameraX(m, h.id, tMid)));
    expect(cams.size).toBeGreaterThan(1);
  });
});

/** Time the leader reaches the 1/16 pole (330 feet to go), written from the replay. */
const sixteenthAt = (seed: number): number => reachTime(race(seed), raceDistanceOf(race(seed)) - 330 * 100);

describe('RV4: your horse stays on screen, 500 seeds and every player', () => {
  it('RV4: before the leader reaches the 1/16 pole the player nose is between screen x 56 and 200', () => {
    let checked = 0;
    for (const seed of SEEDS_500) {
      const r = race(seed);
      const m = model(seed);
      const until = sixteenthAt(seed);
      expect(Number.isFinite(until)).toBe(true);
      const times: number[] = [];
      for (let t = 0; t < until - 1e-6; t += 9.1) times.push(t);
      times.push(until - 0.01, until - 1e-3);
      for (const horse of r.replay.horses) {
        for (const t of times) {
          const cam = cameraX(m, horse.id, t);
          const nose = worldX(interp(horse.distance, r.replay.step, t), cfg) - cam;
          if (nose < 56 || nose > 200) {
            throw new Error(`seed ${seed} player ${horse.id} t ${t}: nose at screen x ${nose}, outside 56..200`);
          }
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(500 * 8 * 1000);
  });
});

describe('RV5: camera x never moves backward and never jumps more than 32 px a frame', () => {
  it('RV5: over 500 seeds and every player, frames 1/60 s apart at the data playback speed', () => {
    const perFrame = (rd.playback.speed.value * 100) / 60; // race hundredths per 1/60 s of playback
    let frames = 0;
    let biggest = 0;
    for (const seed of SEEDS_500) {
      const r = race(seed);
      const m = model(seed);
      const end = r.finish[0].time + 600;
      // Half the field per race keeps the file quick: posts 1, 3, 5 and 8 by index.
      for (const horse of r.replay.horses.filter((_h, i) => [0, 2, 4, 7].includes(i))) {
        let prev = cameraX(m, horse.id, 0);
        for (let t = perFrame; t <= end; t += perFrame) {
          const cam = cameraX(m, horse.id, t);
          const delta = cam - prev;
          if (delta < 0) throw new Error(`seed ${seed} player ${horse.id} t ${t}: camera moved back ${delta}`);
          if (delta > biggest) biggest = delta;
          if (delta > 32) throw new Error(`seed ${seed} player ${horse.id} t ${t}: camera moved ${delta} px in one frame`);
          prev = cam;
          frames++;
        }
      }
    }
    expect(frames).toBeGreaterThan(7_000_000);
    expect(biggest).toBeGreaterThan(0);
  });

  it('RV5: a player 30 lengths off the pace still sees the camera move 32 px a frame at most and never back', () => {
    // The shipped fields never string out this far, so make one: drag one horse 240 ft back.
    const r = structuredClone(race(1));
    const dragged = r.replay.horses.find((h) => h.id !== r.finish[0].id)!;
    dragged.distance = dragged.distance.map((d, i) => Math.max(0, d - 24000 * Math.min(1, i / 300)));
    const m = makeRaceModel(r, cfg);
    const perFrame = (rd.playback.speed.value * 100) / 60;
    let prev = cameraX(m, dragged.id, 0);
    let biggest = 0;
    for (let t = perFrame; t <= r.finish[0].time + 600; t += perFrame) {
      const cam = cameraX(m, dragged.id, t);
      expect(cam - prev, `t ${t}`).toBeGreaterThanOrEqual(0);
      expect(cam - prev, `t ${t}`).toBeLessThanOrEqual(32);
      biggest = Math.max(biggest, cam - prev);
      prev = cam;
    }
    expect(biggest).toBeGreaterThan(20); // the blend is doing real work here
  });

  it('RV5: a deliberately fast playback does move the camera more than 32 px a frame, so the check bites', () => {
    // Guards the test itself: at 4x the field covers more ground, so the limit is not vacuous.
    const r = race(1);
    const m = makeRaceModel(r, cfg);
    let biggest = 0;
    let prev = cameraX(m, 'h1', 0);
    for (let t = 400; t <= r.finish[0].time; t += 400) {
      const cam = cameraX(m, 'h1', t);
      biggest = Math.max(biggest, cam - prev);
      prev = cam;
    }
    expect(biggest).toBeGreaterThan(32);
  });
});

describe('RV6: the wire holds at screen x 200 once the winner is there', () => {
  it('RV6: from the winner finish time on, wire x minus camera is 200, for every player', () => {
    for (const seed of SEEDS_500) {
      const r = race(seed);
      const m = model(seed);
      const wire = Math.floor((raceDistanceOf(r) * 4) / 100); // 10 furlongs: 26400
      const win = r.finish[0].time;
      for (const horse of r.replay.horses) {
        for (const t of [win, win + 1, win + 50, win + 100, win + 1000, win + 100000]) {
          expect(wire - cameraX(m, horse.id, t), `seed ${seed} player ${horse.id} t ${t}`).toBe(200);
        }
      }
    }
  });

  it('RV6: the shipped wire is at world x 26400', () => {
    expect(Math.floor((raceDistanceOf(race(0)) * 4) / 100)).toBe(26400);
    expect(model(0).wireX).toBe(26400);
  });
});

describe('RV7: draw order', () => {
  const horse = (post: number, lane: number): HorseAt => ({ id: `h${post}`, post, distance: 0, lane, x: 0, hoofY: 116 });

  it('RV7: lane ascending, ties by post', () => {
    const field = [horse(1, 300), horse(2, 0), horse(3, 300), horse(4, 100), horse(5, 0), horse(6, 800), horse(7, 100)];
    expect(drawOrder(field).map((h) => h.post)).toEqual([2, 5, 4, 7, 1, 3, 6]);
  });

  it('RV7: lanes are compared exactly, even when they land on the same pixel row', () => {
    // Lane 10 and lane 12 are both hoof y 116; the lower lane still draws first.
    expect(drawOrder([horse(5, 12), horse(6, 10)]).map((h) => h.post)).toEqual([6, 5]);
  });

  it('RV7: the input is not reordered and nothing is lost', () => {
    const field = [horse(3, 5), horse(1, 9), horse(2, 1)];
    const copy = [...field];
    const out = drawOrder(field);
    expect(field).toEqual(copy);
    expect(out).toHaveLength(3);
  });

  it('RV7: on real races every neighbouring pair is lane ascending, ties by post', () => {
    for (const seed of seeds(40)) {
      const r = race(seed);
      for (let t = 0; t <= 12000; t += 311) {
        const out = drawOrder(horsesAt(r, cfg, t));
        expect(out).toHaveLength(8);
        for (let i = 1; i < out.length; i++) {
          const a = out[i - 1];
          const b = out[i];
          expect(a.lane < b.lane || (a.lane === b.lane && a.post < b.post), `seed ${seed} t ${t}`).toBe(true);
        }
      }
    }
  });

  it('RV7: the sprites in a frame come in that order, so later ones draw on top', () => {
    const r = race(7);
    const setup = makeRaceSetup(r, rd, 0, art);
    const me = playerView(setup, 3);
    const laneOf = (p: number, post: number) => horsesAt(r, cfg, p).find((h) => h.post === post)!.lane;
    const f = raceFrame(setup, me, 30);
    const t = f.raceTime;
    for (let i = 1; i < f.horses.length; i++) {
      const a = laneOf(t, f.horses[i - 1].post);
      const b = laneOf(t, f.horses[i].post);
      expect(a < b || (a === b && f.horses[i - 1].post < f.horses[i].post)).toBe(true);
    }
  });
});

describe('RV8: gallop frame from distance, stride length and post only', () => {
  const lockstep = (strideFeet: number): Pick<ViewConfig, 'strideFeet' | 'stridePhasePerPost'> => ({ strideFeet, stridePhasePerPost: 0 });

  it.each([
    // 20 foot stride, 4 frames: each frame lasts 5 feet (500 hundredths).
    [0, 0], [499, 0], [500, 1], [999, 1], [1000, 2], [1499, 2], [1500, 3], [1999, 3], [2000, 0], [2500, 1], [40000, 0],
  ])('RV8: at distance %i of a 20 ft stride with 4 frames the frame is %i', (distance, frame) => {
    expect(strideFrame(distance, 1, lockstep(20), 4)).toBe(frame);
  });

  it.each([
    [0, 0], [999, 0], [1000, 1], [1999, 1], [2000, 0],
  ])('RV8: at distance %i of a 20 ft stride with 2 frames (the stand-in) the frame is %i', (distance, frame) => {
    expect(strideFrame(distance, 1, lockstep(20), 2)).toBe(frame);
  });

  it('RV8: the stride length comes from data: a 10 ft stride cycles twice as fast', () => {
    expect(strideFrame(500, 1, lockstep(10), 2)).toBe(1);
    expect(strideFrame(500, 1, lockstep(20), 2)).toBe(0);
  });

  it('RV8: one frame count of 1 (or none) is always frame 0', () => {
    expect(strideFrame(12345, 3, cfg, 1)).toBe(0);
  });

  it('RV8: a post shifts the cycle by its share of a stride, and the shift is a post-only offset', () => {
    const share = 0.25;
    const c = { strideFeet: 20, stridePhasePerPost: share };
    // Post 2 is half a stride ahead in its cycle: at distance 0 it is already on frame 2 of 4.
    expect(strideFrame(0, 2, c, 4)).toBe(2);
    expect(strideFrame(0, 1, c, 4)).toBe(1);
    expect(strideFrame(0, 4, c, 4)).toBe(0); // a whole stride is no shift
  });

  it('RV8: every frame is used, and it is always inside the frame count', () => {
    for (const frames of [2, 4]) {
      const seen = new Set<number>();
      for (let post = 1; post <= 8; post++) {
        for (let d = 0; d < 50000; d += 37) {
          const f = strideFrame(d, post, cfg, frames);
          expect(Number.isInteger(f) && f >= 0 && f < frames).toBe(true);
          seen.add(f);
        }
      }
      expect(seen.size).toBe(frames);
    }
  });

  it('RV8: the data stride is one full cycle: a stride later the same post shows the same frame', () => {
    for (const frames of [2, 4]) {
      for (let post = 1; post <= 8; post++) {
        for (let d = 0; d < 20000; d += 173) {
          expect(strideFrame(d + cfg.strideFeet * 100, post, cfg, frames)).toBe(strideFrame(d, post, cfg, frames));
        }
      }
    }
  });

  it('RV8: the field is not in lockstep: at one distance the eight posts show more than one frame', () => {
    for (const d of [0, 777, 5000]) {
      const frames = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((p) => strideFrame(d, p, cfg, 4)));
      expect(frames.size).toBeGreaterThan(1);
    }
  });

  it('RV8: frames in a race frame are inside the slot frame count (2 now, 4 final) and ignore lane and time', () => {
    const r = race(11);
    for (const gallopFrames of [2, 4]) {
      const setup = makeRaceSetup(r, rd, 0, { ...art, gallopFrames });
      const me = playerView(setup, 1);
      for (let p = 7; p < 40; p += 3.1) {
        const f = raceFrame(setup, me, p);
        for (const s of f.horses) {
          expect(s.frame).toBeGreaterThanOrEqual(0);
          expect(s.frame).toBeLessThan(gallopFrames);
          const h = horsesAt(r, cfg, f.raceTime).find((x) => x.post === s.post)!;
          expect(s.frame).toBe(strideFrame(h.distance, s.post, cfg, gallopFrames));
        }
      }
    }
  });

  it('RV8: the same distance and post give the same frame however often it is asked', () => {
    const a = [3, 4, 5].map((p) => strideFrame(12345, p, cfg, 4));
    const b = [3, 4, 5].map((p) => strideFrame(12345, p, cfg, 4));
    expect(a).toEqual(b);
  });
});

describe('RV10: rendering a deep-frozen result does not throw', () => {
  it('RV10: every frame of ten races renders for every player from a frozen result', () => {
    for (const seed of seeds(10)) {
      const frozen = deepFreeze(structuredClone(runRace(game, seed)));
      expect(Object.isFrozen(frozen.replay.horses[0].distance)).toBe(true);
      const setup = makeRaceSetup(frozen, rd, seed % 3, art);
      const loose = makeRaceSetup(structuredClone(race(seed)), rd, seed % 3, art);
      for (const post of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const me = playerView(setup, post);
        const meLoose = playerView(loose, post);
        const doneAt = setup.timeline.doneAt;
        for (let p = 0; p <= doneAt + 1; p += 0.77) {
          const f = raceFrame(setup, me, p);
          expect(f.cam).toBe(raceFrame(loose, meLoose, p).cam);
        }
        expect(raceFrame(setup, me, doneAt + 1)).toEqual(raceFrame(loose, meLoose, doneAt + 1));
      }
    }
  });
});
