import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RaceResult } from '../sim/result';
import { beatScroll, startPxPerSecond } from './winnerBeat';
import { makeRaceSetup, playerView, raceFrame, type RaceFrame, type RaceSetup } from './raceFrame';
import { makeTimeline, phaseOf, startClock, tick, type Clock, type Timeline } from './timeline';
import { art, cfg, race, rd, seeds, shippedRaceDay } from './testkit';
import { drawnHorsesAt } from './view';

// FN3, the winner beat (spec 4.3 table, DESIGN Charm): from the end of the wire hold the
// winner alone, its frame at screen x112-143, the background slowing from its speed at the
// wire to a walk over winnerBeat.slowSeconds, then walk frames and the fist.

const WB = rd.winnerBeat;
const SPEED = rd.playback.speed.value;
const DOORS = rd.beats.pickSeconds.value + rd.beats.gateStillSeconds.value;
const HOLD = rd.beats.wireHoldSeconds.value;
const BEAT = rd.beats.winnerBeatSeconds.value;

interface Play { r: RaceResult; setup: RaceSetup; tl: Timeline; start: Clock }

/** The clock at the first instant of the winner beat (wall second = end of the hold). */
function play(seed: number, rdUse = rd): Play {
  const r = race(seed);
  const setup = makeRaceSetup(r, rdUse, 0, art);
  const tl = makeTimeline(rdUse, r.finish[0].time);
  let c = tick(startClock(), tl, DOORS, false);
  c = tick(c, tl, r.finish[0].time / 100 / SPEED + HOLD - 0.001, false); // 1 ms before the hold ends
  expect(phaseOf(c)).toBe('hold');
  const start = tick(c, tl, c.winnerWall! + rdUse.beats.wireHoldSeconds.value - c.wall, false);
  expect(phaseOf(start)).toBe('winner');
  return { r, setup, tl, start };
}

function beatFrames(p: Play, seconds: number, dt = 1 / 60): { tau: number; c: Clock; f: RaceFrame }[] {
  const me = playerView(p.setup, 3);
  const out: { tau: number; c: Clock; f: RaceFrame }[] = [];
  let c = p.start;
  for (let tau = 0; tau <= seconds + 1e-9; tau += dt) {
    out.push({ tau, c, f: raceFrame(p.setup, me, c) });
    c = tick(c, p.tl, dt, false);
  }
  return out;
}

describe('FN3: the winner beat starts where the gallop out left the winner', () => {
  it('FN3: its frame sits at screen x112-143 for the whole beat, and only the winner is drawn', () => {
    for (const seed of seeds(15)) {
      const p = play(seed);
      for (const { tau, f } of beatFrames(p, BEAT + 1, 0.1)) {
        expect(f.horses, `seed ${seed} tau ${tau}`).toHaveLength(1);
        expect(f.horses[0].id).toBe(p.r.finish[0].id);
        expect(f.horses[0].x).toBe(112);
        expect(f.horses[0].x + 31).toBe(143);
      }
    }
    expect(WB.frameLeft.value).toBe(112);
  });

  it('FN3: no jump: the winner\'s world position at the start is where the gallop out had it', () => {
    for (const seed of seeds(40)) {
      const p = play(seed);
      const me = playerView(p.setup, 1);
      const f = raceFrame(p.setup, me, p.start);
      const k = p.r.replay.horses.findIndex((h) => h.id === p.r.finish[0].id);
      const drawn = drawnHorsesAt(p.setup.model, p.setup.runs, p.start.race)[k];
      // World nose x of the beat's sprite = its screen x + the nose column + the camera.
      expect(f.horses[0].x + art.noseX + f.drawCam, `seed ${seed}`).toBe(drawn.x);
      // Its lane is the lane it held at the finish.
      expect(f.horses[0].y + cfg.frameTopFromHoof, `seed ${seed}`).toBe(drawn.hoofY);
    }
  });

  it('FN3: no jump in the stride phase: the first beat frame is the gallop frame the gallop out had', () => {
    for (const seed of seeds(40)) {
      const p = play(seed);
      const me = playerView(p.setup, 1);
      const f = raceFrame(p.setup, me, p.start);
      const k = p.r.replay.horses.findIndex((h) => h.id === p.r.finish[0].id);
      const drawn = drawnHorsesAt(p.setup.model, p.setup.runs, p.start.race)[k];
      const gallopFrames = art.gallopFrames;
      const phase = ((p.r.finish[0].post * cfg.stridePhasePerPost) % 1);
      const want = Math.floor((drawn.distance / (cfg.strideFeet * 100) + phase) * gallopFrames) % gallopFrames;
      expect(f.horses[0].pose).toBe('gallop');
      expect(f.horses[0].frame, `seed ${seed}`).toBe(want);
    }
  });

  it('FN3: no jump in speed: the winner slows along the beat\'s curve from the speed it was galloping out at', () => {
    for (const seed of seeds(25)) {
      const p = play(seed);
      const me = playerView(p.setup, 1);
      const tl = p.tl;
      const d = 0.3;
      const worldX = (c: Clock) => { const f = raceFrame(p.setup, me, c); return f.horses.find((h) => h.id === p.r.finish[0].id)!.x + art.noseX + f.drawCam; };
      // The clock d seconds before the handover, by playing up to it.
      let c0 = tick(startClock(), tl, DOORS, false);
      c0 = tick(c0, tl, p.start.wall - d - DOORS, false);
      expect(phaseOf(c0)).toBe('hold');
      const before = worldX(p.start) - worldX(c0); // px covered in the d seconds before
      const after = worldX(tick(p.start, tl, d, false)) - worldX(p.start);
      const v = before / d;
      // Slowing linearly from v to the walk over slowSeconds: v*d - (v - walk) / (2 slow) * d^2.
      const walk = WB.walkPxPerSecond.value;
      const want = v * d - ((v - walk) / (2 * WB.slowSeconds.value)) * d * d;
      expect(Math.abs(after - want), `seed ${seed}: ${before} px before, ${after} after, ${want.toFixed(1)} expected`).toBeLessThanOrEqual(3 + 0.02 * before);
    }
  });

  it('FN3: its starting speed is the winner\'s crossing speed at the playback speed, in px a second', () => {
    // 60 ft a second is 240 px a second of race; at 2x playback, 480 px a wall second.
    expect(startPxPerSecond(60, cfg, 2)).toBe(480);
    expect(startPxPerSecond(55, cfg, 4)).toBe(880);
  });
});

describe('FN3: the background slows in whole pixels and never runs backward', () => {
  it('FN3: scroll values are whole numbers and never decrease, from the hold through the beat and after', () => {
    for (const seed of seeds(15)) {
      const r = race(seed);
      const tl = makeTimeline(rd, r.finish[0].time);
      const setup = makeRaceSetup(r, rd, 0, art);
      const me = playerView(setup, 4);
      let c = tick(startClock(), tl, DOORS, false);
      c = tick(c, tl, r.finish[0].time / 100 / SPEED - 0.5, false); // half a second before the wire
      let prev = { cam: -Infinity, far: -Infinity, mid: -Infinity };
      for (let i = 0; i < 60 * 8; i++) {
        c = tick(c, tl, 1 / 60, false);
        const f = raceFrame(setup, me, c);
        for (const v of [f.drawCam, f.farScroll, f.midScroll]) expect(Number.isInteger(v)).toBe(true);
        expect(f.drawCam, `seed ${seed} wall ${c.wall}`).toBeGreaterThanOrEqual(prev.cam);
        expect(f.farScroll).toBeGreaterThanOrEqual(prev.far);
        expect(f.midScroll).toBeGreaterThanOrEqual(prev.mid);
        prev = { cam: f.drawCam, far: f.farScroll, mid: f.midScroll };
      }
    }
  });

  it('FN3: it slows: the px covered in each tenth of a second never grows over slowSeconds, then holds the walk', () => {
    const v0 = startPxPerSecond(58, cfg, SPEED);
    const slow = WB.slowSeconds.value;
    const walk = WB.walkPxPerSecond.value;
    let prev = Infinity;
    for (let t = 0; t + 0.1 <= slow + 1e-9; t += 0.1) {
      const d = beatScroll(t + 0.1, v0, walk, slow) - beatScroll(t, v0, walk, slow);
      expect(d, `t ${t}`).toBeLessThanOrEqual(prev + 1);
      prev = d;
    }
    // From the start at the crossing speed to the walk at the end.
    expect(beatScroll(0.1, v0, walk, slow) - beatScroll(0, v0, walk, slow)).toBeGreaterThan(walk / 10 * 5);
    const lateRate = beatScroll(slow + 2, v0, walk, slow) - beatScroll(slow + 1, v0, walk, slow);
    expect(Math.abs(lateRate - walk)).toBeLessThanOrEqual(1);
    expect(beatScroll(0, v0, walk, slow)).toBe(0);
    for (let t = 0; t < 6; t += 0.013) expect(Number.isInteger(beatScroll(t, v0, walk, slow))).toBe(true);
  });

  it('FN3: in a real beat the camera ends up moving at the walk speed from data', () => {
    const p = play(6);
    const frames = beatFrames(p, WB.slowSeconds.value + 2, 1 / 60);
    const at = (tau: number) => frames.find((x) => x.tau >= tau)!.f.drawCam;
    const moved = at(WB.slowSeconds.value + 1.9) - at(WB.slowSeconds.value + 0.9);
    expect(Math.abs(moved - WB.walkPxPerSecond.value)).toBeLessThanOrEqual(2);
  });
});

describe('FN3: the frames of the beat', () => {
  // Round three: the first wording said walk frames for the whole beat; the ruling is that
  // the winner still gallops, with no fist, while the background slows over slowSeconds,
  // and walks with the fist from then on, to the end of the beat and under "Enter: next race".
  it('FN3: while the background slows the winner gallops with no fist; once down to the walk it walks with the fist', () => {
    const slow = WB.slowSeconds.value;
    for (const seed of seeds(10)) {
      const p = play(seed);
      for (const { tau, f } of beatFrames(p, BEAT + 3, 1 / 30)) {
        const w = f.horses[0];
        if (tau < slow - 1e-9) {
          expect(w.pose, `seed ${seed} tau ${tau}`).toBe('gallop');
          expect(w.fist).toBe(false);
          expect(w.frame).toBeLessThan(art.gallopFrames);
        } else if (tau > slow + 1e-9) {
          expect(w.pose, `seed ${seed} tau ${tau}`).toBe('walk');
          expect(w.fist).toBe(true);
          expect(w.frame).toBeGreaterThanOrEqual(0);
          expect(w.frame).toBeLessThan(art.walkFrames!);
        }
      }
    }
  });

  it('FN3: the walk and the fist hold to the end of the beat and in the done phase, under "Enter: next race"', () => {
    const p = play(2);
    const me = playerView(p.setup, 3);
    let c = p.start;
    let sawDone = false;
    for (let i = 0; i < 60 * (BEAT + 3); i++) {
      c = tick(c, p.tl, 1 / 60, false);
      const f = raceFrame(p.setup, me, c);
      if (phaseOf(c) === 'done') {
        sawDone = true;
        expect(f.message).toBe(rd.copy.nextRace);
        expect(f.horses).toHaveLength(1);
        expect(f.horses[0].pose).toBe('walk');
        expect(f.horses[0].fist).toBe(true);
      }
    }
    expect(sawDone).toBe(true);
  });

  it('FN3: the walk onset comes from data: a shorter slowSeconds starts the walk sooner', () => {
    const quick = structuredClone(rd);
    quick.winnerBeat.slowSeconds.value = 0.4;
    const p = play(3, quick);
    const frames = beatFrames(p, 1, 1 / 60);
    expect(frames.find((x) => x.tau > 0.35 && x.tau < 0.39)!.f.horses[0].pose).toBe('gallop');
    expect(frames.find((x) => x.tau > 0.45)!.f.horses[0].pose).toBe('walk');
  });

  it('FN3: the walk frames advance with the ground covered: one frame change for about 3 feet, 12 px, of scroll', () => {
    const p = play(5);
    const frames = beatFrames(p, WB.slowSeconds.value + 4, 1 / 60).filter((x) => x.tau > WB.slowSeconds.value + 0.05);
    const strideFeet = WB.walkStrideFeet.value;
    expect(strideFeet).toBe(6);
    const px = (strideFeet * cfg.pxPerFoot) / art.walkFrames!; // px of ground per frame
    // Start counting at the first change, so the first interval is a whole one.
    const first = frames.findIndex((x, i) => i > 0 && x.f.horses[0].frame !== frames[0].f.horses[0].frame);
    let last = frames[first];
    let changes = 0;
    for (const x of frames.slice(first + 1)) {
      if (x.f.horses[0].frame !== last.f.horses[0].frame) {
        expect(Math.abs(x.f.drawCam - last.f.drawCam), `tau ${x.tau}`).toBeLessThanOrEqual(px + 3);
        expect(x.f.drawCam - last.f.drawCam).toBeGreaterThanOrEqual(px - 3);
        last = x;
        changes++;
      }
    }
    expect(changes).toBeGreaterThan(3);
  });

  it('FN3: body and tack share the walk strip and the jacket and cap the winner strip, with as many frames, so one index pairs them', () => {
    const find = (id: string) => shippedRaceDay.slots.slots.find((s) => s.id === id)!;
    const walk = ['art.race.horse.body.walk', 'art.race.horse.tack.walk', 'art.race.jockey.jacket.walk', 'art.race.jockey.cap.walk'].map(find);
    const winner = ['art.race.jockey.jacket.winner', 'art.race.jockey.cap.winner'].map(find);
    const frames = new Set([...walk, ...winner].map((s) => s.frames));
    expect(frames.size).toBe(1);
    expect(art.walkFrames).toBe(walk[0].frames);
    for (const s of [...walk, ...winner]) expect([s.frameWidth, s.frameHeight]).toEqual([32, 24]);
  });

  it('FN3: the scene draws the fist layers from the winner strips and the body and tack from the walk strips, one index', () => {
    const src = readFileSync(new URL('../scenes/RaceScene.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/\.winner/);
    expect(src).toMatch(/\.walk/);
    expect(src).toMatch(/fist/);
  });
});

describe('FN3: the beat\'s length and what it may read', () => {
  it('FN3: the beat lasts winnerBeatSeconds from data, and a longer one in data plays longer', () => {
    const p = play(1);
    expect(p.tl.beatEndAt - (p.tl.doneAt)).toBeCloseTo(BEAT, 9);
    let c = p.start;
    while (phaseOf(c) === 'winner') c = tick(c, p.tl, 1 / 60, false);
    expect(c.beatEndWall! - p.start.wall).toBeCloseTo(BEAT, 6);
    const long = structuredClone(rd);
    long.beats.winnerBeatSeconds.value = 4;
    const q = play(1, long);
    let d = q.start;
    while (phaseOf(d) === 'winner') d = tick(d, q.tl, 1 / 60, false);
    expect(d.beatEndWall! - q.start.wall).toBeCloseTo(4, 6);
  });

  it('FN3: nothing in the beat reads the other horses or anything the winner did after its finish', () => {
    let compared = 0;
    for (const seed of seeds(15)) {
      const p = play(seed);
      const r = p.r;
      const w = r.replay.horses.find((h) => h.id === r.finish[0].id)!;
      const keep = Math.ceil(w.finishTime / r.replay.step); // the bracketing sample the gallop out may read
      const c = structuredClone(r);
      for (const h of c.replay.horses) {
        const mine = h.id === w.id;
        for (let j = mine ? keep + 1 : 0; j < h.distance.length; j++) {
          h.distance[j] += 7000 + j * 13;
          h.lane[j] = (h.lane[j] + 300) % 800;
        }
      }
      c.finish = c.finish.map((f, i) => (i === 0 ? f : { ...f, margin: { lengths: 5, label: 'nose' }, beatenLengths: 9 }));
      const other = makeRaceSetup(c, rd, 0, art);
      const me = playerView(p.setup, 5);
      const me2 = playerView(other, 5);
      for (const { c: clock } of beatFrames(p, BEAT + 1, 0.25)) {
        const a = raceFrame(p.setup, me, clock);
        const b = raceFrame(other, me2, clock);
        for (const k of ['horses', 'drawCam', 'farScroll', 'midScroll', 'standXs', 'poles', 'gate', 'phase'] as const) {
          expect(b[k], `seed ${seed} wall ${clock.wall} ${k}`).toEqual(a[k]);
        }
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(100);
  });

  it('FN3: before the wire hold ends there is no beat: the camera is the race camera and the whole field is drawn', () => {
    for (const seed of seeds(15)) {
      const r = race(seed);
      const tl = makeTimeline(rd, r.finish[0].time);
      const setup = makeRaceSetup(r, rd, 0, art);
      const me = playerView(setup, 2);
      let c = tick(startClock(), tl, DOORS, false);
      while (phaseOf(c) !== 'winner') {
        c = tick(c, tl, 1 / 30, false);
        if (phaseOf(c) === 'winner') break;
        const f = raceFrame(setup, me, c);
        expect(f.drawCam).toBe(f.cam);
        expect(f.horses).toHaveLength(8);
        expect(f.horses.every((h) => h.fist === false)).toBe(true);
      }
    }
  });
});

describe('FN3: the mid layer is never empty during the gallop out or the beat', () => {
  // WAITING ON THE ENGINEER (round three ruling): the stand and its crowd must continue
  // past the wire. Today the mid layer is empty in most beat frames.
  const midItems = (f: RaceFrame) => f.standXs.length + f.crowdTiles.length + f.infieldTiles.length;

  it('FN3: from the winner crossing, through the hold and the whole beat and the done screen, something is drawn on the mid layer', () => {
    const empties: string[] = [];
    for (const seed of seeds(12)) {
      const r = race(seed);
      const tl = makeTimeline(rd, r.finish[0].time);
      const setup = makeRaceSetup(r, rd, 0, art);
      const me = playerView(setup, 3);
      let c = tick(startClock(), tl, DOORS + r.finish[0].time / 100 / SPEED - 0.2, false);
      for (let i = 0; i < 60 * (HOLD + BEAT + 3); i++) {
        c = tick(c, tl, 1 / 60, false);
        if (midItems(raceFrame(setup, me, c)) === 0) empties.push(`seed ${seed} wall ${c.wall.toFixed(2)} phase ${phaseOf(c)}`);
      }
    }
    expect(empties.slice(0, 5), `${empties.length} empty frames`).toEqual([]);
  });

  it('FN3: the gate frames and the race frames have a mid layer too', () => {
    for (const seed of seeds(5)) {
      const r = race(seed);
      const setup = makeRaceSetup(r, rd, 0, art);
      const me = playerView(setup, 1);
      for (const p of [0, 3, 6, 20]) expect(midItems(raceFrame(setup, me, p)), `seed ${seed} p ${p}`).toBeGreaterThan(0);
    }
  });
});
