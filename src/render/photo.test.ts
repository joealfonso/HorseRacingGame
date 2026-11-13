import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sequenceSeconds } from '../data/raceDaySchema';
import type { RaceResult } from '../sim/result';
import { runRace } from '../sim/runRace';
import { beatBegan, keyDown, keyState, keyUp } from './keys';
import { photoHorses, photoPanelY, PHOTO_AREA } from './photo';
import { makeRaceSetup, playerView, raceFrame, type RaceFrame, type RaceSetup } from './raceFrame';
import { captionAt, clockAt, makeTimeline, phaseOf, skip, startClock, tick, type Clock, type Timeline } from './timeline';
import { art, cfg, game, race, rd, scrambleAfter, seeds } from './testkit';

// The photo finish (spec 4.4, DESIGN Race view): PH1 to PH4, and the photo's share of AN3,
// RV11, FN1 and IN2. Expected values come from the spec and DESIGN, not from photo.ts.

const SPEED = rd.playback.speed.value;
const DOORS = rd.beats.pickSeconds.value + rd.beats.gateStillSeconds.value;
const HOLD = rd.beats.wireHoldSeconds.value;
const PHOTO = rd.beats.photoSeconds.value;
const CAPTION = rd.beats.photoCaptionSeconds.value;
const BEAT = rd.beats.winnerBeatSeconds.value;

/** Photo finishes among the first 400 seeds, and some races without one. */
const photoSeeds = seeds(400).filter((s) => race(s).photoFinish);
const plainSeeds = seeds(40).filter((s) => !race(s).photoFinish);

const nameOf = (r: RaceResult, id: string) => r.inputs.card.horses.find((h) => h.id === id)!.name;
const setupOf = (r: RaceResult, n = 0) => makeRaceSetup(r, rd, n, art);

/** The spec's margin words for a sim label (4.4, 4.6): "a nose", "1/2 length", "1 1/4 lengths". */
function phrase(label: string): string {
  if (label === 'nose' || label === 'head' || label === 'neck') return `a ${label}`;
  const parts = label.split(' ').map((p) => (p.includes('/') ? Number(p.split('/')[0]) / Number(p.split('/')[1]) : Number(p)));
  const lengths = parts.reduce((a, b) => a + b, 0);
  return `${label} ${lengths <= 1 ? 'length' : 'lengths'}`;
}

/** The clock at wall second p for a race played at normal speed with nothing skipped. */
const at = (tl: Timeline, p: number): Clock => clockAt(tl, p);

describe('PH1: the photo shows only when the result flags it, between the wire hold and the winner beat', () => {
  it('PH1: the seeds in play include photo finishes and races without one', () => {
    expect(photoSeeds.length).toBeGreaterThan(20);
    expect(plainSeeds.length).toBeGreaterThan(10);
    expect(photoSeeds).toContain(16);
  });

  it('PH1: a flagged race has the photo phase after the hold and before the winner beat, for its data length', () => {
    for (const seed of photoSeeds.slice(0, 15)) {
      const r = race(seed);
      const tl = makeTimeline(rd, r.finish[0].time, true);
      expect(phaseOf(at(tl, tl.winnerAt + HOLD - 0.01))).toBe('hold');
      expect(phaseOf(at(tl, tl.winnerAt + HOLD + 0.01))).toBe('photo');
      expect(phaseOf(at(tl, tl.winnerAt + HOLD + PHOTO - 0.01))).toBe('photo');
      expect(phaseOf(at(tl, tl.winnerAt + HOLD + PHOTO + 0.01))).toBe('winner');
      expect(tl.beatEndAt).toBeCloseTo(DOORS + r.finish[0].time / 100 / SPEED + HOLD + PHOTO + BEAT, 9);
    }
  });

  it('PH1: with no photo the phase never happens, played tick by tick, and timing is what it was', () => {
    for (const seed of plainSeeds.slice(0, 8)) {
      const r = race(seed);
      const tl = makeTimeline(rd, r.finish[0].time, r.photoFinish);
      const seen = new Set<string>();
      let c = startClock();
      while (phaseOf(c) !== 'done') {
        c = tick(c, tl, 1 / 60, false);
        seen.add(phaseOf(c));
      }
      expect(seen.has('photo')).toBe(false);
      expect(c.beatEndWall!).toBeCloseTo(DOORS + r.finish[0].time / 100 / SPEED + HOLD + BEAT, 6);
      expect(c.photoEndWall).toBe(c.holdEndWall);
      expect(makeTimeline(rd, r.finish[0].time).beatEndAt).toBe(tl.beatEndAt); // the default is no photo
    }
  });

  it('PH1: the frame has a photo only in the photo phase of a flagged race', () => {
    for (const seed of [...photoSeeds.slice(0, 6), ...plainSeeds.slice(0, 6)]) {
      const r = race(seed);
      const setup = setupOf(r);
      const me = playerView(setup, 3);
      const tl = setup.timeline;
      for (const p of [0, DOORS + 1, tl.winnerAt - 0.01, tl.winnerAt + 0.5, tl.doneAt + 0.5, tl.doneAt + 4.4, tl.photoEndAt + 0.1, tl.beatEndAt + 1]) {
        const f = raceFrame(setup, me, p);
        const want = r.photoFinish && p >= tl.doneAt && p < tl.photoEndAt;
        expect(f.photo !== null, `seed ${seed} p ${p} phase ${f.phase}`).toBe(want);
        expect(f.phase === 'photo').toBe(want);
        // The HUD gives way to the panel and its captions only in the photo.
        expect(f.hudVisible, `seed ${seed} p ${p}`).toBe(!want);
      }
    }
  });

  it('PH1: the photo flag is the result\'s, not something the renderer works out: flipping it flips the beat', () => {
    const r = structuredClone(race(plainSeeds[0]));
    const a = makeRaceSetup(r, rd, 0, art);
    r.photoFinish = true;
    const b = makeRaceSetup(r, rd, 0, art);
    expect(b.timeline.beatEndAt - a.timeline.beatEndAt).toBeCloseTo(PHOTO, 9);
  });
});

describe('PH2: the winner\'s nose pixel is strictly ahead of every other horse\'s', () => {
  it('PH2: for every photo-finish seed in 0 to 9999, for every player (779 photo finishes)', () => {
    let count = 0;
    let tieAtWire = 0;
    for (let seed = 0; seed < 10000; seed++) {
      const r = runRace(game, seed);
      if (!r.photoFinish) continue;
      count++;
      const winner = r.finish[0].id;
      const wf = r.replay.wireFrame.horses;
      const w = wf.find((h) => h.id === winner)!;
      if (wf.some((h) => h.id !== winner && h.distance >= w.distance)) tieAtWire++;
      for (const me of [r.finish[0].id, r.finish[1].id, r.finish[7].id]) {
        const horses = photoHorses(r, cfg, art.noseX, art.gallopFrames, me);
        expect(horses).toHaveLength(8);
        const win = horses.find((h) => h.id === winner)!;
        for (const h of horses) {
          if (h.id !== winner) expect(h.nose, `seed ${seed} ${h.id} vs winner`).toBeLessThan(win.nose);
        }
      }
    }
    // The measured count over 0 to 9999. The engineer reported 779; this test confirms it.
    expect(count).toBe(779);
    // The tie-break is not dead code: at least one seed has a horse level with the winner at the wire.
    expect(tieAtWire).toBeGreaterThan(0);
  }, 180000);

  it('PH2: the other horses are in the picture in the order they were at the wire frame', () => {
    for (const seed of photoSeeds) {
      const r = race(seed);
      const winner = r.finish[0].id;
      const wf = r.replay.wireFrame.horses.filter((h) => h.id !== winner);
      const horses = photoHorses(r, cfg, art.noseX, art.gallopFrames, winner).filter((h) => h.id !== winner);
      for (const a of wf) {
        for (const b of wf) {
          if (a.distance <= b.distance) continue;
          const na = horses.find((h) => h.id === a.id)!.nose;
          const nb = horses.find((h) => h.id === b.id)!.nose;
          // Further along at the wire frame is never further back in the picture.
          expect(na, `seed ${seed} ${a.id} (${a.distance}) vs ${b.id} (${b.distance})`).toBeGreaterThanOrEqual(nb);
        }
      }
    }
  });

  it('PH2: the horse the caption puts second is result.finish[1], with its post', () => {
    for (const seed of photoSeeds) {
      const r = race(seed);
      const setup = setupOf(r);
      const me = playerView(setup, 1);
      const f = raceFrame(setup, me, setup.timeline.doneAt + CAPTION + 0.1);
      const lines = f.photo!.captions;
      expect(lines).toHaveLength(2);
      expect(lines[1].text, `seed ${seed}`).toBe(`by ${phrase(r.finish[1].margin!.label)} over #${r.finish[1].post}`);
      expect(lines[0].text).toBe(`${nameOf(r, r.finish[0].id)} wins`);
    }
  });
});

describe('PH3: photo positions come from replay.wireFrame only, and are whole numbers', () => {
  const playerOf = (r: RaceResult) => r.finish[3].id;

  it('PH3: every position is a whole number, over the photo seeds', () => {
    for (const seed of photoSeeds) {
      for (const h of photoHorses(race(seed), cfg, art.noseX, art.gallopFrames, playerOf(race(seed)))) {
        for (const v of [h.x, h.y, h.nose, h.frame]) expect(Number.isInteger(v), `seed ${seed} ${h.id}`).toBe(true);
      }
    }
  });

  it('PH3: changing every replay sample but not the wire frame changes nothing in the photo', () => {
    for (const seed of photoSeeds.slice(0, 25)) {
      const r = race(seed);
      const c = structuredClone(r);
      for (const h of c.replay.horses) {
        h.distance = h.distance.map((d, i) => d + 5000 + 37 * i);
        h.lane = h.lane.map((l, i) => (l + 211 + i) % 700);
      }
      const me = playerOf(r);
      expect(photoHorses(c, cfg, art.noseX, art.gallopFrames, me)).toEqual(photoHorses(r, cfg, art.noseX, art.gallopFrames, me));
      // And through the frame the scene reads.
      const a = setupOf(r);
      const b = setupOf(c);
      const p = a.timeline.doneAt + 2;
      expect(raceFrame(b, playerView(b, 2), p).photo, `seed ${seed}`).toEqual(raceFrame(a, playerView(a, 2), p).photo);
    }
  });

  it('PH3: changing the wire frame does change the photo', () => {
    for (const seed of photoSeeds.slice(0, 25)) {
      const r = race(seed);
      const winner = r.finish[0].id;
      const me = playerOf(r);
      const base = photoHorses(r, cfg, art.noseX, art.gallopFrames, me);
      const other = r.replay.wireFrame.horses.findIndex((h) => h.id !== winner);
      const moved = structuredClone(r);
      moved.replay.wireFrame.horses[other].distance -= 250; // 2.5 feet back
      const after = photoHorses(moved, cfg, art.noseX, art.gallopFrames, me);
      const id = r.replay.wireFrame.horses[other].id;
      expect(after.find((h) => h.id === id)!.nose, `seed ${seed}`).toBeLessThan(base.find((h) => h.id === id)!.nose);
      // Moving the winner moves the winner's nose, and the others are held behind it.
      const wi = r.replay.wireFrame.horses.findIndex((h) => h.id === winner);
      const ahead = structuredClone(r);
      ahead.replay.wireFrame.horses[wi].distance += 100;
      expect(photoHorses(ahead, cfg, art.noseX, art.gallopFrames, me).find((h) => h.id === winner)!.nose)
        .toBeGreaterThan(base.find((h) => h.id === winner)!.nose);
    }
  });

  it('PH3: positions sit at 8 px a foot, with the wire at crop x96 (screen x208-209) inside the crop x16-239', () => {
    let checked = 0;
    for (const seed of photoSeeds) {
      const r = race(seed);
      const D = r.inputs.race.distanceFurlongs * 660 * 100;
      const winner = r.finish[0].id;
      const wf = r.replay.wireFrame.horses;
      const horses = photoHorses(r, cfg, art.noseX, art.gallopFrames, playerOf(r));
      // The spec: 8 screen px per foot, the nose's last pixel at 209 when level with the wire.
      const raw = (id: string) => 209 + Math.floor(((wf.find((h) => h.id === id)!.distance - D) * 8) / 100);
      const winnerNose = raw(winner);
      expect(horses.find((h) => h.id === winner)!.nose, `seed ${seed} winner`).toBe(winnerNose);
      for (const h of horses) {
        if (h.id === winner) continue;
        // Behind the winner by the spec's rule: the pixel from the distance, or one behind the winner's.
        expect(h.nose, `seed ${seed} ${h.id}`).toBe(Math.min(raw(h.id), winnerNose - 1));
        checked++;
      }
      // Inside the crop: the winner, level with the wire to within a foot, is inside x16-239.
      expect(winnerNose).toBeGreaterThanOrEqual(PHOTO_AREA.x);
      expect(winnerNose).toBeLessThanOrEqual(PHOTO_AREA.x + PHOTO_AREA.w - 1);
    }
    expect(checked).toBe(photoSeeds.length * 7);
  });

  it('PH3: a 0.1-length nose is 6 screen px: a horse 0.75 ft behind sits 6 px back (8 px a foot)', () => {
    const r = structuredClone(race(photoSeeds[0]));
    const winner = r.finish[0].id;
    const wi = r.replay.wireFrame.horses.findIndex((h) => h.id === winner);
    const oi = r.replay.wireFrame.horses.findIndex((h) => h.id !== winner);
    r.replay.wireFrame.horses[oi].distance = r.replay.wireFrame.horses[wi].distance - 75;
    const horses = photoHorses(r, cfg, art.noseX, art.gallopFrames, winner);
    expect(horses.find((h) => h.id === winner)!.nose - horses.find((h) => h.id === r.replay.wireFrame.horses[oi].id)!.nose).toBe(6);
  });
});

describe('PH3 (art review 2026-11-13): the photo\'s own vertical layout', () => {
  // Lanes sit 8 px apart in crop space (16 on screen). The block of occupied lanes is centered
  // in the 88 rows: top of the first = floor((88 - (8 x (last lane - first lane) + 24)) / 2).
  // Lane here is the wire frame's lane in whole-lane units (hundredths / 100). READING: lanes
  // are continuous; the other reading, rounding each lane to a whole one first, would give the
  // same answer whenever lanes are whole and is not tested.
  it('PH3: each horse\'s top row follows the 8 px lane spacing and the centered block, over the photo seeds', () => {
    for (const seed of photoSeeds.slice(0, 80)) {
      const r = race(seed);
      const wf = r.replay.wireFrame.horses;
      const lanes = wf.map((h) => h.lane / 100);
      const first = Math.min(...lanes);
      const last = Math.max(...lanes);
      const firstTop = Math.floor((88 - (8 * (last - first) + 24)) / 2);
      const horses = photoHorses(r, cfg, art.noseX, art.gallopFrames, r.finish[0].id);
      for (const h of horses) {
        const lane = wf.find((x) => x.id === h.id)!.lane / 100;
        const cropTop = firstTop + Math.floor(8 * (lane - first));
        expect(h.y, `seed ${seed} ${h.id} lane ${lane}`).toBe(PHOTO_AREA.y + 2 * cropTop);
      }
    }
  });

  it('PH3: with all eight lanes the block is 80 rows, so the first top row is 4 and nothing leaves the crop', () => {
    const r = structuredClone(race(photoSeeds[0]));
    r.replay.wireFrame.horses.forEach((h, i) => { h.lane = i * 100; });
    const horses = photoHorses(r, cfg, art.noseX, art.gallopFrames, r.finish[0].id);
    const tops = [...horses].sort((a, b) => a.y - b.y).map((h) => (h.y - PHOTO_AREA.y) / 2);
    expect(tops).toEqual([4, 12, 20, 28, 36, 44, 52, 60]);
    expect(Math.max(...tops) + 24).toBeLessThanOrEqual(88);
  });

  it('PH3: every horse has its own height: no two share a top row when their lanes differ by a lane', () => {
    const r = structuredClone(race(photoSeeds[0]));
    r.replay.wireFrame.horses.forEach((h, i) => { h.lane = 300 + i * 100; });
    const ys = photoHorses(r, cfg, art.noseX, art.gallopFrames, r.finish[0].id).map((h) => h.y);
    expect(new Set(ys).size).toBe(8);
  });

  it('PH3: a single lane is centered: top row floor((88 - 24) / 2) = 32', () => {
    const r = structuredClone(race(photoSeeds[0]));
    r.replay.wireFrame.horses.forEach((h) => { h.lane = 250; });
    for (const h of photoHorses(r, cfg, art.noseX, art.gallopFrames, r.finish[0].id)) expect(h.y).toBe(PHOTO_AREA.y + 2 * 32);
  });

  it('PH3: inner lanes draw first, ties by post', () => {
    for (const seed of photoSeeds.slice(0, 60)) {
      const r = race(seed);
      const lane = (id: string) => r.replay.wireFrame.horses.find((h) => h.id === id)!.lane;
      const horses = photoHorses(r, cfg, art.noseX, art.gallopFrames, r.finish[0].id);
      for (let i = 1; i < horses.length; i++) {
        const a = horses[i - 1];
        const b = horses[i];
        const ok = lane(a.id) < lane(b.id) || (lane(a.id) === lane(b.id) && a.post < b.post);
        expect(ok, `seed ${seed} ${a.id} then ${b.id}`).toBe(true);
      }
    }
  });
});

describe('PH4: the panel, the caption and the timing', () => {
  const frameAt = (setup: RaceSetup, post: number, p: number): RaceFrame => raceFrame(setup, playerView(setup, post), p);

  it('PH4: the panel steps in by whole 8 px moves, one a frame, 25 of them, and lands at y8', () => {
    const r = race(16);
    const setup = setupOf(r);
    const start = setup.timeline.doneAt;
    const ys: number[] = [];
    for (let k = 0; k < 40; k++) ys.push(frameAt(setup, 2, start + (k + 0.5) / 60).photo!.panel.y);
    const moves = ys.slice(1).map((y, i) => y - ys[i]);
    for (const m of moves) expect([0, 8], `moves ${moves.join()}`).toContain(m);
    expect(moves.filter((m) => m === 8)).toHaveLength(25); // 25 moves of 8 px: 200 px in all
    expect(moves.slice(0, 25).every((m) => m === 8)).toBe(true);
    expect(ys[0]).toBe(8 - 25 * 8); // the panel starts fully above the screen: its bottom edge at y0
    expect(ys[ys.length - 1]).toBe(8);
    // Landed on the 25th frame after the first, and it never moves again.
    expect(new Set(ys.slice(25)).size).toBe(1);
    expect(ys[24]).toBe(0);
    expect(ys[25]).toBe(8);
  });

  it('PH4: the steps are timed by the wall clock: at 120 Hz it lands at the same second, in whole 8 px moves', () => {
    const r = race(16);
    const setup = setupOf(r);
    const start = setup.timeline.doneAt;
    let prev = frameAt(setup, 2, start + 0.0001).photo!.panel.y;
    let landedAt = Infinity;
    for (let k = 1; k <= 60; k++) {
      const y = frameAt(setup, 2, start + k / 120).photo!.panel.y;
      expect([0, 8]).toContain(y - prev);
      if (y === 8 && landedAt === Infinity) landedAt = k / 120;
      prev = y;
    }
    expect(landedAt).toBeGreaterThan(24 / 60 - 1 / 120);
    expect(landedAt).toBeLessThanOrEqual(25 / 60 + 1 / 120);
  });

  it('PH4: the photo, wire and horses ride with the panel and land at the spec\'s places', () => {
    const r = race(16);
    const setup = setupOf(r);
    const landed = frameAt(setup, 2, setup.timeline.doneAt + 1).photo!;
    expect(landed.panel).toMatchObject({ x: 8, y: 8, tilesW: 30, tilesH: 24 }); // x8-247, y8-199
    expect(landed.area).toEqual({ x: 16, y: 16, w: 224, h: 176 }); // x16-239, y16-191
    expect(landed.wire.x).toBe(16 + 2 * 96);
    expect(landed.wire.w).toBe(2);
    const mid = frameAt(setup, 2, setup.timeline.doneAt + 10.5 / 60).photo!;
    const dy = mid.panel.y - landed.panel.y;
    expect(dy).toBeLessThan(0);
    expect(mid.area.y - landed.area.y).toBe(dy);
    expect(mid.wire.y - landed.wire.y).toBe(dy);
    mid.horses.forEach((h, i) => expect(h.y - landed.horses[i].y).toBe(dy));
    expect(mid.arrow).toBeNull(); // the arrow waits for the panel to land
  });

  it('PH4: "Photo finish" first; the winner line and margin 1.5 s later; the photo ends 3.0 s after that', () => {
    for (const seed of photoSeeds.slice(0, 20)) {
      const r = race(seed);
      const setup = setupOf(r);
      const me = playerView(setup, 5);
      const start = setup.timeline.doneAt;
      const before = raceFrame(setup, me, start + CAPTION - 0.02).photo!;
      expect(before.captions.map((c) => c.text)).toEqual(['Photo finish']);
      const after = raceFrame(setup, me, start + CAPTION + 0.02).photo!;
      expect(after.captions.map((c) => c.text)).toEqual([`${nameOf(r, r.finish[0].id)} wins`, `by ${phrase(r.finish[1].margin!.label)} over #${r.finish[1].post}`]);
      expect(raceFrame(setup, me, start + CAPTION + 3.0 - 0.02).phase).toBe('photo');
      expect(raceFrame(setup, me, start + CAPTION + 3.0 + 0.02).phase).toBe('winner');
      expect(raceFrame(setup, me, start + CAPTION + 3.0 + 0.02).photo).toBeNull();
    }
    expect(CAPTION).toBe(1.5);
    expect(PHOTO - CAPTION).toBe(3.0);
  });

  it('PH4: the caption is below the panel at 1x: title at y204, margin at y216', () => {
    const r = race(16);
    const setup = setupOf(r);
    const f = frameAt(setup, 2, setup.timeline.doneAt + CAPTION + 0.5).photo!;
    expect(f.captions.map((c) => c.y)).toEqual([204, 216]);
    expect(frameAt(setup, 2, setup.timeline.doneAt + 0.5).photo!.captions[0].y).toBe(204);
  });

  it('PH4: the caption names the winner and the margin over the second horse, and says nothing about third', () => {
    for (const seed of photoSeeds) {
      const r = race(seed);
      const setup = setupOf(r);
      const lines = frameAt(setup, 1, setup.timeline.doneAt + CAPTION + 0.5).photo!.captions.map((c) => c.text).join(' | ');
      expect(lines).toContain(nameOf(r, r.finish[0].id));
      expect(lines).toContain(`#${r.finish[1].post}`);
      expect(lines).not.toContain(`#${r.finish[2].post}`);
      expect(lines).not.toContain(nameOf(r, r.finish[2].id));
      expect(lines).not.toContain(nameOf(r, r.finish[1].id));
      expect(lines).not.toMatch(/third|3rd/i);
    }
  });

  it('PH4: the margin phrase follows the sim\'s label for the second horse, whatever it is', () => {
    const labels = new Set<string>();
    for (const seed of photoSeeds) {
      const r = race(seed);
      labels.add(r.finish[1].margin!.label);
      const setup = setupOf(r);
      const line = frameAt(setup, 1, setup.timeline.doneAt + CAPTION + 0.5).photo!.captions[1].text;
      expect(line).toBe(`by ${phrase(r.finish[1].margin!.label)} over #${r.finish[1].post}`);
    }
    expect(labels.has('nose')).toBe(true);
    expect(labels.size).toBeGreaterThan(2);
  });

  it('PH4: the winner line is Yellow when the player\'s horse won, Bone when not', () => {
    for (const seed of photoSeeds.slice(0, 30)) {
      const r = race(seed);
      const setup = setupOf(r);
      for (const h of r.inputs.card.horses) {
        const line = frameAt(setup, h.post, setup.timeline.doneAt + CAPTION + 0.5).photo!.captions[0];
        expect(line.color, `seed ${seed} player ${h.id}`).toBe(h.id === r.finish[0].id ? 'Yellow' : 'Bone');
      }
      // The title is never marked.
      expect(frameAt(setup, r.finish[0].post, setup.timeline.doneAt + 0.5).photo!.captions[0].color).toBe('Bone');
    }
  });

  it('PH4: the Yellow arrow sits at y3 above the panel over your horse when it is in the picture, else none', () => {
    let shown = 0;
    let absent = 0;
    for (const seed of photoSeeds.slice(0, 60)) {
      const r = race(seed);
      const setup = setupOf(r);
      for (const h of r.inputs.card.horses) {
        const f = frameAt(setup, h.post, setup.timeline.doneAt + 2).photo!;
        const mine = f.horses.find((x) => x.yours)!;
        expect(mine.id).toBe(h.id);
        if (f.arrow) {
          shown++;
          expect(f.arrow.y).toBe(3);
          // Cap pixels 20-24 doubled are screen columns 40-49 of the frame: centre 44.5.
          expect(Math.abs(f.arrow.x + 3 - (mine.x + 44.5))).toBeLessThanOrEqual(1);
          expect(f.arrow.x).toBeGreaterThanOrEqual(PHOTO_AREA.x);
          expect(f.arrow.x + 6).toBeLessThanOrEqual(PHOTO_AREA.x + PHOTO_AREA.w - 1);
        } else absent++;
      }
    }
    expect(shown).toBeGreaterThan(50);
    expect(absent).toBeGreaterThan(0); // a horse more than 3 lengths back is outside the crop
  });
});

describe('PH4: Enter in the photo, and FN1 across the new beats', () => {
  const enterAt = (c: Clock, tl: Timeline) => skip(c, tl, 0);
  const toHold = (r: RaceResult, tl: Timeline): Clock => {
    let c = tick(startClock(), tl, DOORS, false);
    c = tick(c, tl, r.finish[0].time / 100 / SPEED - 0.5, false);
    return tick(c, tl, 1, false); // 0.5 s into the hold
  };

  it('FN1: one press each: Enter ends the hold, shows the caption, ends the photo, ends the winner beat', () => {
    for (const seed of photoSeeds.slice(0, 10)) {
      const r = race(seed);
      const tl = makeTimeline(rd, r.finish[0].time, true);
      let c = toHold(r, tl);
      expect(phaseOf(c)).toBe('hold');
      c = enterAt(c, tl);
      expect(phaseOf(c), 'press 1').toBe('photo');
      expect(c.wall).toBeLessThan(captionAt(c, tl)); // not yet showing the winner line
      c = tick(c, tl, 0.3, false);
      expect(c.wall).toBeLessThan(captionAt(c, tl));
      c = enterAt(c, tl);
      expect(phaseOf(c), 'press 2').toBe('photo');
      expect(c.wall).toBeGreaterThanOrEqual(captionAt(c, tl)); // the caption shows at once
      c = enterAt(c, tl);
      expect(phaseOf(c), 'press 3').toBe('winner');
      c = enterAt(c, tl);
      expect(phaseOf(c), 'press 4').toBe('done');
      expect(enterAt(c, tl)).toEqual(c);
    }
  });

  it('FN1: the first Enter shows the caption at once, in the frame', () => {
    const r = race(16);
    const tl = makeTimeline(rd, r.finish[0].time, true);
    const setup = setupOf(r);
    const me = playerView(setup, 2);
    let c = enterAt(toHold(r, tl), tl);
    c = tick(c, tl, 0.2, false);
    expect(raceFrame(setup, me, c).photo!.captions).toHaveLength(1);
    c = enterAt(c, tl);
    expect(raceFrame(setup, me, c).photo!.captions).toHaveLength(2);
    expect(raceFrame(setup, me, c).phase).toBe('photo');
    c = enterAt(c, tl);
    expect(raceFrame(setup, me, c).phase).toBe('winner');
  });

  it('FN1: after the first Enter the photo still lasts 3.0 s, then goes on by itself', () => {
    const r = race(16);
    const tl = makeTimeline(rd, r.finish[0].time, true);
    const shown = enterAt(tick(enterAt(toHold(r, tl), tl), tl, 0.4, false), tl);
    expect(phaseOf(tick(shown, tl, 3.0 - 0.01, false))).toBe('photo');
    expect(phaseOf(tick(shown, tl, 3.0 + 0.01, false))).toBe('winner');
  });

  it('FN1: if the caption has already come up by itself, the next Enter ends the photo', () => {
    const r = race(16);
    const tl = makeTimeline(rd, r.finish[0].time, true);
    const c = tick(enterAt(toHold(r, tl), tl), tl, CAPTION + 0.1, false);
    expect(phaseOf(c)).toBe('photo');
    expect(phaseOf(enterAt(c, tl))).toBe('winner');
  });

  it('FN1: left alone, the photo takes its 4.5 s and no more, frame by frame', () => {
    const r = race(16);
    const tl = makeTimeline(rd, r.finish[0].time, true);
    let c = toHold(r, tl);
    while (phaseOf(c) === 'hold') c = tick(c, tl, 1 / 60, false);
    const begun = c.holdEndWall!;
    while (phaseOf(c) === 'photo') c = tick(c, tl, 1 / 60, false);
    expect(c.photoEndWall! - begun).toBeCloseTo(PHOTO, 9);
    expect(begun - c.winnerWall!).toBeCloseTo(HOLD, 9);
  });

  it('FN1: Enter without a photo goes straight from the hold to the winner beat, as it did', () => {
    const r = race(plainSeeds[0]);
    const tl = makeTimeline(rd, r.finish[0].time, false);
    expect(phaseOf(enterAt(toHold(r, tl), tl))).toBe('winner');
  });

  it('FN1: Space (4x) changes nothing in the photo', () => {
    const r = race(16);
    const tl = makeTimeline(rd, r.finish[0].time, true);
    let c = enterAt(toHold(r, tl), tl);
    const start = c.wall;
    while (phaseOf(c) === 'photo') c = tick(c, tl, 1 / 60, true);
    expect(c.photoEndWall! - start).toBeCloseTo(PHOTO, 6);
    expect(c.fast).toBe(false);
  });
});

describe('IN2 across the new beats: a key held across a beat change does nothing until released', () => {
  /** What the scene does: key events in, and a new beat clears anything held. */
  it('IN2: Enter held down through hold, photo and winner beat acts once at most, then only after a release', () => {
    const r = race(16);
    const tl = makeTimeline(rd, r.finish[0].time, true);
    let keys = keyState();
    let clock = tick(startClock(), tl, DOORS + r.finish[0].time / 100 / SPEED + 0.2, false); // in the hold
    const log: string[] = [];
    const frame = (dt: number, held: boolean, repeat: boolean) => {
      const before = phaseOf(clock);
      if (held) {
        const res = keyDown(keys, 'Enter', repeat);
        keys = res.state;
        if (res.act) { clock = skip(clock, tl, 0); log.push(`act ${before}->${phaseOf(clock)}`); }
      }
      clock = tick(clock, tl, dt, false);
      if (phaseOf(clock) !== before) keys = beatBegan(keys);
    };
    frame(1 / 60, true, false); // the press: ends the hold
    // Held down through everything. The key events here arrive without the repeat flag (a
    // browser that lost it on a focus change): only the beat change keeps them from acting.
    for (let i = 0; i < 600; i++) frame(1 / 60, true, false);
    expect(log).toEqual(['act hold->photo']);
    expect(phaseOf(clock)).toBe('done');
    keys = keyUp(keys, 'Enter');
    expect(keyDown(keys, 'Enter', false).act).toBe(true);
  });

  it('IN2: a press that is not a repeat but whose key never went up is ignored after the beat changes', () => {
    let keys = keyDown(keyState(), 'Enter', false).state;
    keys = beatBegan(keys); // the hold ends by itself while Enter is held
    expect(keyDown(keys, 'Enter', false).act).toBe(false);
    keys = keyUp(keys, 'Enter');
    expect(keyDown(keys, 'Enter', false).act).toBe(true);
  });

  it('IN2: the scene clears held keys whenever the phase changes (the photo beats included)', () => {
    const src = readFileSync(new URL('../scenes/RaceScene.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/phaseOf\(next\)\s*!==\s*phaseOf\(this\.clock\)\)\s*this\.keys\s*=\s*beatBegan\(this\.keys\)/);
  });
});

describe('AN3 for the photo: nothing depends on anything after the moment it shows', () => {
  function photoProbes(r: RaceResult): number[] {
    const tl = makeTimeline(rd, r.finish[0].time, true);
    const ps = [tl.winnerAt - 0.5, tl.winnerAt - 0.01, tl.winnerAt, tl.winnerAt + 0.4, tl.doneAt - 0.01, tl.doneAt + 0.001, tl.doneAt + 0.4, tl.doneAt + CAPTION - 0.01,
      tl.doneAt + CAPTION + 0.01, tl.doneAt + 3, tl.photoEndAt - 0.01, tl.photoEndAt + 0.01];
    return ps;
  }

  it('AN3: a result that differs only after the sample after the moment gives an identical frame, photo included', () => {
    let inPhoto = 0;
    for (const seed of photoSeeds.slice(0, 12)) {
      const r = race(seed);
      const setup = setupOf(r);
      for (const p of photoProbes(r)) {
        const c = clockAt(setup.timeline, p);
        const scrambled = setupOf(scrambleAfter(r, c.race));
        for (const post of [1, 6]) {
          const a = raceFrame(setup, playerView(setup, post), c);
          const b = raceFrame(scrambled, playerView(scrambled, post), c);
          expect(b, `seed ${seed} p ${p.toFixed(2)} post ${post}`).toEqual(a);
          if (a.photo) inPhoto++;
        }
      }
    }
    expect(inPhoto).toBeGreaterThan(50);
  });

  it('AN3: nothing of the photo shows before the winner has reached the wire', () => {
    for (const seed of photoSeeds.slice(0, 40)) {
      const r = race(seed);
      const setup = setupOf(r);
      const me = playerView(setup, 4);
      for (const t of [0, 1000, r.finish[0].time - 200, r.finish[0].time - 1]) {
        const f = raceFrame(setup, me, DOORS + t / 100 / SPEED);
        expect(f.phase).toBe('race');
        expect(f.photo).toBeNull();
        expect(f.hudVisible).toBe(true);
        expect(f.call).not.toMatch(/Too close|wins it/);
      }
      expect(raceFrame(setup, me, setup.timeline.doneAt + 0.01).photo).not.toBeNull();
    }
  });

  it('AN3: whether the race is flagged a photo is not read before the winner reaches the wire', () => {
    for (const seed of [16, 19, 3, 5]) {
      const r = race(seed);
      const flipped = structuredClone(r);
      flipped.photoFinish = !r.photoFinish;
      const a = setupOf(r);
      const b = setupOf(flipped);
      for (const t of [500, r.finish[0].time - 100, r.finish[0].time - 1]) {
        const p = DOORS + t / 100 / SPEED;
        expect(raceFrame(b, playerView(b, 3), p), `seed ${seed} t ${t}`).toEqual(raceFrame(a, playerView(a, 3), p));
      }
    }
  });

  it('AN3: the caption\'s margin is not shown until the second horse has crossed, and the picture itself needs only the wire frame', () => {
    for (const seed of photoSeeds.slice(0, 30)) {
      const r = race(seed);
      // Change the second horse's margin label: the picture is the same, the title is the same until it can be known.
      const c = structuredClone(r);
      c.finish[1].margin = { lengths: 9, label: '5' };
      const a = setupOf(r);
      const b = setupOf(c);
      const early = a.timeline.doneAt + 0.2;
      expect(raceFrame(b, playerView(b, 2), early).photo!.horses).toEqual(raceFrame(a, playerView(a, 2), early).photo!.horses);
      const after = a.timeline.doneAt + CAPTION + 0.5;
      expect(raceFrame(b, playerView(b, 2), after).photo!.captions[1].text).toContain('5 lengths');
    }
  });
});

describe('AN3 for the caption: the margin is not shown before the second horse has crossed', () => {
  // READING: 4.4 says the winner line comes 1.5 s in; H3b and AN3 say nothing reads the second
  // horse before its finish time. A real photo finish has the second horse home well inside
  // the 1.5 s, so the two agree; this hand-made result puts the second horse 10 s behind to
  // see which wins. The other reading (show it at 1.5 s whatever the clock) would fail this.
  it('AN3: with the second horse not yet home, the caption stays on the title', () => {
    const r = structuredClone(race(16));
    r.finish[1].time = r.finish[0].time + 1000;
    const setup = setupOf(r);
    const me = playerView(setup, 2);
    const f = raceFrame(setup, me, setup.timeline.doneAt + CAPTION + 0.5);
    expect(f.raceTime).toBeLessThan(r.finish[1].time);
    expect(f.photo!.captions.map((c) => c.text)).toEqual(['Photo finish']);
  });
});

describe('RV11 with the photo', () => {
  it('RV11: the photo beat is inside the one sum the timeline and the loader share', () => {
    for (const w of [11500, 12155, 12500]) {
      const tl = makeTimeline(rd, w, true);
      expect(tl.beatEndAt).toBeCloseTo(sequenceSeconds(rd, w / 100, true), 9);
      expect(tl.beatEndAt - makeTimeline(rd, w, false).beatEndAt).toBeCloseTo(PHOTO, 9);
      let c = startClock();
      while (phaseOf(c) !== 'done') c = tick(c, tl, 1 / 60, false);
      expect(c.beatEndWall!).toBeCloseTo(DOORS + w / 100 / SPEED + HOLD + PHOTO + BEAT, 6);
    }
  });

  it('RV11: the full sequence for a 2:05.00 winner with a photo is at most 90 s, from data', () => {
    const tl = makeTimeline(rd, 12500, true);
    expect(tl.beatEndAt).toBe(DOORS + 125 / SPEED + HOLD + PHOTO + BEAT);
    expect(tl.beatEndAt).toBeLessThanOrEqual(90);
    expect(tl.beatEndAt).toBeLessThanOrEqual(rd.beats.maxSequenceSeconds.value);
  });

  it('RV11: the race beat still lasts the winner\'s time over the speed with a photo', () => {
    const tl = makeTimeline(rd, 12155, true);
    expect(tl.winnerAt - tl.doorsAt).toBeCloseTo(12155 / 100 / SPEED, 9);
  });
});

describe('photo panel steps are a pure function of wall time and data', () => {
  it('photoPanelY lands at y8 and uses the data\'s step size', () => {
    expect(photoPanelY(10, rd)).toEqual({ y: 8, landed: true });
    expect(photoPanelY(0, rd).landed).toBe(false);
    expect(Math.abs(photoPanelY(0.5 / 60, rd).y % 8)).toBe(0);
  });
});

describe('the race view behind the photo is frozen (art review 2026-11-13)', () => {
  // Behind the panel the race view stays still: nothing at the panel's sides moves, the
  // crowd and flag included. WAITING ON THE ENGINEER if the code still runs the view on.
  const FROZEN = (f: RaceFrame) => ({
    cam: f.cam, drawCam: f.drawCam, horses: f.horses, farScroll: f.farScroll, midScroll: f.midScroll, standXs: f.standXs,
    poles: f.poles, crowdTiles: f.crowdTiles, infieldTiles: f.infieldTiles, flags: f.flags,
    ambient: f.ambient,
  });

  it('the drawn race state does not change from frame to frame while the photo shows', () => {
    for (const seed of photoSeeds.slice(0, 12)) {
      const r = race(seed);
      const setup = setupOf(r);
      const me = playerView(setup, 3);
      const start = setup.timeline.doneAt;
      const first = FROZEN(raceFrame(setup, me, start + 1 / 120));
      for (let k = 2; k < 4.4 * 60; k += 7) {
        const f = raceFrame(setup, me, start + k / 60);
        expect(f.phase).toBe('photo');
        expect(FROZEN(f), `seed ${seed} frame ${k} of the photo`).toEqual(first);
      }
    }
  });
});
