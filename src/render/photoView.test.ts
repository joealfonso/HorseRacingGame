import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fillTemplate } from '../data/template';
import type { RaceResult } from '../sim/result';
import { makeRaceSetup, playerView, raceFrame, type RaceFrame, type RaceSetup } from './raceFrame';
import { clockAt, makeTimeline, phaseOf, skip, startClock, tick, type Clock } from './timeline';
import { art, race, rd, seeds } from './testkit';

// The photo's wire stripes, the frozen race view, the call across the photo, and the
// messages across it (spec 4.4, art review 2026-11-13). Expected values come from the spec.

const SPEED = rd.playback.speed.value;
const DOORS = rd.beats.pickSeconds.value + rd.beats.gateStillSeconds.value;
const CAPTION = rd.beats.photoCaptionSeconds.value;
const PHOTO = rd.beats.photoSeconds.value;

const photoSeeds = seeds(400).filter((s) => race(s).photoFinish);
const plainSeeds = seeds(40).filter((s) => !race(s).photoFinish);
const setupOf = (r: RaceResult, n = 0) => makeRaceSetup(r, rd, n, art);
const nameOf = (r: RaceResult, id: string) => r.inputs.card.horses.find((h) => h.id === id)!.name;
const frameAt = (s: RaceSetup, post: number, p: number | Clock): RaceFrame => raceFrame(s, playerView(s, post), p);

describe('the photo wire: Ash, Bone, Ash, each 2 px wide, the photo\'s full height', () => {
  it('three stripes left to right at crop x95, x96, x97 (screen x206, 208, 210), 2 px wide, 176 high', () => {
    const s = setupOf(race(16));
    const f = frameAt(s, 2, s.timeline.doneAt + 1).photo!;
    expect(f.wire.stripes.map((x) => [x.x, x.w, x.h, x.y, x.color])).toEqual([
      [206, 2, 176, 16, 'Ash'], [208, 2, 176, 16, 'Bone'], [210, 2, 176, 16, 'Ash'],
    ]);
    // The Bone line is still the plain rectangle.
    expect([f.wire.x, f.wire.y, f.wire.w, f.wire.h]).toEqual([208, 16, 2, 176]);
  });

  it('the stripes sit inside the photo area and move with the panel\'s step-in', () => {
    const s = setupOf(race(16));
    const landed = frameAt(s, 2, s.timeline.doneAt + 1).photo!;
    for (const k of [0.5, 3.5, 12.5, 24.5]) {
      const f = frameAt(s, 2, s.timeline.doneAt + k / 60).photo!;
      const dy = f.panel.y - landed.panel.y;
      expect(f.wire.stripes.map((x) => x.y - landed.wire.stripes[0].y)).toEqual([dy, dy, dy]);
      expect(f.wire.y - landed.wire.y).toBe(dy);
      expect(f.wire.stripes.map((x) => x.y)).toEqual([f.area.y, f.area.y, f.area.y]);
      expect(f.wire.stripes.every((x) => x.h === f.area.h)).toBe(true);
    }
    for (const x of landed.wire.stripes) {
      expect(x.x).toBeGreaterThanOrEqual(landed.area.x);
      expect(x.x + x.w).toBeLessThanOrEqual(landed.area.x + landed.area.w);
    }
  });

  it('the stripes touch each other and the Bone one is the middle one', () => {
    const s = setupOf(race(16));
    const st = frameAt(s, 2, s.timeline.doneAt + 1).photo!.wire.stripes;
    expect(st[1].x).toBe(st[0].x + st[0].w);
    expect(st[2].x).toBe(st[1].x + st[1].w);
    expect(st.map((x) => x.color)).toEqual(['Ash', 'Bone', 'Ash']);
  });

  it('the wire is drawn behind the horses (the scene gives it a lower depth than any photo horse)', () => {
    const src = readFileSync(new URL('../scenes/RaceScene.ts', import.meta.url), 'utf8');
    const wire = /const wire = [^\n]*setDepth\(DEPTH\.photo \+ (\d+)\)/.exec(src);
    const horse = /photoLayers = [^\n]*setDepth\(DEPTH\.photo \+ (\d+) \+ i\)/.exec(src);
    expect(wire).not.toBeNull();
    expect(horse).not.toBeNull();
    expect(Number(wire![1])).toBeLessThan(Number(horse![1]));
  });
});

/** The pieces of the race view that must hold still behind the panel. */
const view = (f: RaceFrame) => ({
  raceTime: f.raceTime, cam: f.cam, drawCam: f.drawCam, horses: f.horses, farScroll: f.farScroll, midScroll: f.midScroll, standXs: f.standXs,
  poles: f.poles, crowdTiles: f.crowdTiles, infieldTiles: f.infieldTiles, flags: f.flags, ambient: f.ambient, edges: f.edges,
  strip: f.strip, dots: f.dots, clock: f.clock,
});

/** The winner's world x (frame left plus camera) in a frame, and its lane row and stride frame. */
const winnerAt = (f: RaceFrame, id: string) => {
  const h = f.horses.find((x) => x.id === id)!;
  return { world: h.x + f.drawCam, y: h.y, frame: h.frame };
};

describe('the race view behind the photo is frozen at the end of the wire hold', () => {
  it('every frame of the photo equals the race view at the end of the hold', () => {
    for (const seed of photoSeeds.slice(0, 12)) {
      const r = race(seed);
      const s = setupOf(r);
      const tl = s.timeline;
      for (const post of [1, 5]) {
        // The last instant of the hold, a nanosecond before the photo: the same view to within a pixel.
        const hold = frameAt(s, post, tl.doneAt - 1e-9);
        expect(hold.phase).toBe('hold');
        const first = frameAt(s, post, tl.doneAt);
        expect(first.phase).toBe('photo');
        expect(first.raceTime).toBeCloseTo(hold.raceTime, 3);
        expect(first.cam).toBe(hold.cam);
        hold.horses.forEach((h, i) => expect(Math.abs(first.horses[i].x - h.x), `seed ${seed} ${h.id}`).toBeLessThanOrEqual(1));
        // And the view holds exactly still from there to the photo's end.
        const frozen = view(first);
        for (const tau of [0.3, 1.4, 1.6, 2.9, 4.4]) {
          const f = frameAt(s, post, tl.doneAt + tau);
          expect(f.phase).toBe('photo');
          expect(view(f), `seed ${seed} post ${post} tau ${tau}`).toEqual(frozen);
        }
      }
    }
  });

  it('and the winner beat starts from that frame: no jump in the winner\'s world x, lane or stride frame', () => {
    let checked = 0;
    for (const seed of photoSeeds.slice(0, 12)) {
      const r = race(seed);
      const s = setupOf(r);
      const tl = s.timeline;
      const id = r.finish[0].id;
      for (const post of [1, 4, 8]) {
        const frozen = winnerAt(frameAt(s, post, tl.doneAt + 2), id);
        const beat = frameAt(s, post, tl.photoEndAt + 1e-6);
        expect(beat.phase).toBe('winner');
        const b = winnerAt(beat, id);
        expect(Math.abs(b.world - frozen.world), `seed ${seed} post ${post}`).toBeLessThanOrEqual(2);
        expect(b.y).toBe(frozen.y);
        expect(b.frame).toBe(frozen.frame);
        // And one frame later the winner has moved on by about a frame's own motion.
        const next = winnerAt(frameAt(s, post, tl.photoEndAt + 1 / 60), id);
        expect(next.world - b.world).toBeGreaterThanOrEqual(0);
        expect(next.world - b.world).toBeLessThanOrEqual(8);
        checked++;
      }
    }
    expect(checked).toBe(36);
  });

  it('with the caption brought early by Enter and the photo ended early by a second Enter, the same holds', () => {
    for (const seed of photoSeeds.slice(0, 10)) {
      const r = race(seed);
      const s = setupOf(r);
      const tl = s.timeline;
      for (const post of [2, 7]) {
        let c = tick(startClock(), tl, DOORS + r.finish[0].time / 100 / SPEED + 0.4, false);
        expect(phaseOf(c)).toBe('hold');
        c = skip(c, tl, 0); // ends the hold
        expect(phaseOf(c)).toBe('photo');
        const first = frameAt(s, post, c);
        const frozen = view(first);
        c = tick(c, tl, 0.25, false);
        c = skip(c, tl, 0); // the caption now
        expect(phaseOf(c)).toBe('photo');
        const captioned = frameAt(s, post, c);
        expect(captioned.photo!.captions).toHaveLength(2);
        expect(view(captioned), `seed ${seed} after the first Enter`).toEqual(frozen);
        c = tick(c, tl, 0.5, false);
        expect(view(frameAt(s, post, c))).toEqual(frozen);
        c = skip(c, tl, 0); // the photo ends
        expect(phaseOf(c)).toBe('winner');
        const beat = winnerAt(frameAt(s, post, c), r.finish[0].id);
        const before = winnerAt(first, r.finish[0].id);
        expect(Math.abs(beat.world - before.world), `seed ${seed}`).toBeLessThanOrEqual(2);
        expect(beat.y).toBe(before.y);
        expect(beat.frame).toBe(before.frame);
      }
    }
  });

  // Updated on purpose with step 5 (the doors moved to 1.0 s). The ticked clock adds its frames
  // up and `clockAt` computes each time by formula, so their beat times differ by rounding (at
  // most 7e-15 s here), and where a pixel boundary falls exactly on the beat's start that hair
  // flips one pixel for the whole beat (seed 2 at 30 Hz: drawCam 26715 against 26716, all
  // crowd tiles 1 px apart). It never jitters frame to frame. So the direct path gets the same
  // accumulated times the ticked clock holds, exactness is kept, and the hair is asserted small.
  it('on non-photo seeds every frame equals what the timeline without a photo gives', () => {
    for (const seed of plainSeeds.slice(0, 8)) {
      const r = race(seed);
      const s = setupOf(r);
      const tl = makeTimeline(rd, r.finish[0].time); // the default: no photo
      expect(s.timeline).toEqual(tl);
      let c = startClock();
      let n = 0;
      let lastCam = -Infinity;
      while (phaseOf(c) !== 'done') {
        c = tick(c, tl, 1 / 30, false);
        const f = frameAt(s, 3, c);
        if (f.phase === 'winner') {
          expect(f.drawCam, `seed ${seed} wall ${c.wall}`).toBeGreaterThanOrEqual(lastCam); // no jitter
          lastCam = f.drawCam;
        }
        if (n++ % 4 !== 0) continue;
        expect(f.photo).toBeNull();
        expect(f.raceTime, `seed ${seed} wall ${c.wall}`).toBe(c.race); // the view runs on the clock, never frozen
        for (const [got, want] of [[c.winnerWall, tl.winnerAt], [c.holdEndWall, tl.doneAt], [c.photoEndWall, tl.photoEndAt], [c.beatEndWall, tl.beatEndAt]] as const) {
          if (got !== null) expect(Math.abs(got - want)).toBeLessThan(1e-9);
        }
        const direct: Clock = { ...clockAt(tl, c.wall), race: c.race, winnerWall: c.winnerWall, holdEndWall: c.holdEndWall, photoEndWall: c.photoEndWall, beatEndWall: c.beatEndWall };
        expect(f, `seed ${seed} wall ${c.wall}`).toEqual(frameAt(s, 3, direct));
        expect(Math.abs(f.drawCam - frameAt(s, 3, c.wall).drawCam)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('the top bar across the photo', () => {
  const photoVariants = rd.copy.calls.photo;
  const winnerCalls = (r: RaceResult) => rd.copy.calls.winner.map((v) => fillTemplate(v, { winner: nameOf(r, r.finish[0].id) }));

  it('"Too close to call" (a variant from data) from the wire until the caption\'s winner line; then the winner call naming finish[0]', () => {
    let both = 0;
    for (const raceNumber of [0, 1, 2, 3]) {
      for (const seed of photoSeeds.slice(0, 10)) {
        const r = race(seed);
        const s = setupOf(r, raceNumber);
        const tl = s.timeline;
        const wins = winnerCalls(r);
        for (let p = tl.winnerAt + 0.02; p < tl.beatEndAt - 0.02; p += 0.07) {
          const f = frameAt(s, 3, p);
          const named = f.phase === 'winner' || (f.phase === 'photo' && f.photo!.captions.length === 2);
          const tag = `seed ${seed} race ${raceNumber} p ${(p - tl.winnerAt).toFixed(2)} phase ${f.phase}`;
          if (named) {
            expect(wins, tag).toContain(f.call);
            both++;
          } else {
            expect(photoVariants, tag).toContain(f.call);
            expect(wins, tag).not.toContain(f.call);
          }
        }
        // The winner call is never heard before the caption: not once before the photo's 1.5 s.
        for (const tau of [0, 0.5, 1.0, CAPTION - 0.03]) expect(wins).not.toContain(frameAt(s, 3, tl.doneAt + tau).call);
        expect(wins).toContain(frameAt(s, 3, tl.doneAt + CAPTION + 0.03).call);
      }
    }
    expect(both).toBeGreaterThan(500);
  });

  it('the winner call stays through the rest of the photo and the whole winner beat', () => {
    const r = race(16);
    const s = setupOf(r, 2);
    const tl = s.timeline;
    const wins = winnerCalls(r);
    for (let p = tl.doneAt + CAPTION + 0.03; p < tl.beatEndAt - 0.02; p += 0.1) expect(wins, `p ${p}`).toContain(frameAt(s, 6, p).call);
  });

  it('never before the second horse has crossed: with the second horse late, the bar stays on the photo call', () => {
    const r = structuredClone(race(16));
    r.finish[1].time = r.finish[0].time + 1000;
    const s = setupOf(r, 1);
    const tl = s.timeline;
    const f = frameAt(s, 2, tl.doneAt + CAPTION + 0.5);
    expect(f.raceTime).toBeLessThan(r.finish[1].time);
    expect(f.photo!.captions).toHaveLength(1);
    expect(photoVariants).toContain(f.call);
    expect(winnerCalls(r)).not.toContain(f.call);
    // Even after Enter brings the caption early.
    let c = tick(startClock(), tl, DOORS + r.finish[0].time / 100 / SPEED + 0.3, false);
    c = skip(skip(c, tl, 0), tl, 0);
    expect(photoVariants).toContain(frameAt(s, 2, c).call);
  });

  it('with the first Enter the switch happens at that Enter', () => {
    for (const seed of photoSeeds.slice(0, 10)) {
      const r = race(seed);
      const s = setupOf(r, 3);
      const tl = s.timeline;
      let c = tick(startClock(), tl, DOORS + r.finish[0].time / 100 / SPEED + 0.3, false);
      c = skip(c, tl, 0); // into the photo
      c = tick(c, tl, 0.2, false);
      const before = frameAt(s, 4, c);
      expect(photoVariants, `seed ${seed}`).toContain(before.call);
      expect(before.photo!.captions).toHaveLength(1);
      const after = frameAt(s, 4, skip(c, tl, 0)); // the caption now, the same wall second
      expect(after.photo!.captions).toHaveLength(2);
      expect(winnerCalls(r), `seed ${seed}`).toContain(after.call);
    }
  });

  it('a race with no photo gives the winner call at the wire, as it did', () => {
    for (const seed of plainSeeds.slice(0, 6)) {
      const r = race(seed);
      const s = setupOf(r);
      const f = frameAt(s, 3, s.timeline.winnerAt + 0.1);
      expect(winnerCalls(r)).toContain(f.call);
    }
  });
});

const ORD = ['th', 'st', 'nd', 'rd'];
const homeText = (name: string, place: number) => fillTemplate(rd.copy.messages.home, { name, place: `${place}${ORD[place < 4 ? place : 0]}` });

describe('messages across the photo', () => {
  /** The runs of one message text in a sampled sequence: [text, first p, last p]. */
  function runs(s: RaceSetup, post: number, from: number, to: number, dt: number) {
    const out: { text: string; from: number; to: number }[] = [];
    for (let p = from; p <= to; p += dt) {
      const m = frameAt(s, post, p).message;
      const last = out[out.length - 1];
      if (m === '' || m === rd.copy.nextRace) continue;
      if (last && last.text === m && p - last.to <= dt * 1.5) last.to = p;
      else out.push({ text: m, from: p, to: p });
    }
    return out;
  }

  it('"home in Nth" for the player\'s horse shows exactly once, whichever horse is the player\'s, on photo seeds', () => {
    let seen = 0;
    for (const seed of photoSeeds.slice(0, 14)) {
      const r = race(seed);
      const s = setupOf(r);
      const tl = s.timeline;
      for (const h of r.inputs.card.horses) {
        const fin = r.finish.find((f) => f.id === h.id)!;
        const text = fillTemplate(rd.copy.messages.home, { name: h.name, place: `${fin.place}${['th', 'st', 'nd', 'rd'][fin.place < 4 ? fin.place : 0]}` });
        const all = runs(s, h.post, tl.winnerAt - 0.5, tl.beatEndAt + 1, 1 / 30).filter((x) => x.text === text);
        // Races that finish far apart are outside the window; the winner and a close second always inside it.
        const wall = DOORS + fin.time / 100 / SPEED;
        if (wall + 1 < tl.winnerAt - 0.5 || wall > tl.beatEndAt + 1) continue;
        expect(all.length, `seed ${seed} ${h.id} place ${fin.place}`).toBe(1);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(80);
  });

  // Updated on purpose (ruling after the reviewer's re-check). This test used to say a
  // message on screen when the photo begins runs out its two seconds behind the panel,
  // where the HUD is hidden, so the player could lose it. The ruling is the other way: the
  // message line pauses with the photo. Counting only frames where the HUD is visible, a
  // message on screen when the photo begins is seen for its full 2 seconds in total (part
  // before the photo, the rest after it), is not seen while the photo is up, and is not repeated.
  it('a message on screen when the photo begins is seen for its full two seconds in total, split around the photo, never while the photo is up, not repeated', () => {
    let tested = 0;
    for (const seed of photoSeeds) {
      const r = race(seed);
      const s = setupOf(r);
      const tl = s.timeline;
      for (const h of r.inputs.card.horses) {
        const fin = r.finish.find((f) => f.id === h.id)!;
        const start = DOORS + fin.time / 100 / SPEED; // the wall second the home message is due
        if (!(start < tl.doneAt - 0.3 && start + 2 > tl.doneAt + 0.2)) continue;
        const text = homeText(h.name, fin.place);
        if (frameAt(s, h.post, start + 0.02).message !== text) continue; // only where nothing is queued in front
        const dt = 1 / 60;
        let seen = 0;
        const visibleRuns: number[] = [];
        let inRun = false;
        for (let p = start - 0.2; p < tl.beatEndAt - 0.01; p += dt) {
          const f = frameAt(s, h.post, p);
          if (f.phase === 'photo') expect(f.hudVisible).toBe(false); // nothing is seen behind the panel
          const on = f.hudVisible && f.message === text;
          if (on) { seen += dt; if (!inRun) visibleRuns.push(p); }
          inRun = on || (inRun && !f.hudVisible); // the photo's frames do not break a run
        }
        expect(seen, `seed ${seed} ${h.id} seen`).toBeGreaterThan(2 - 3 * dt);
        expect(seen).toBeLessThan(2 + 3 * dt);
        expect(visibleRuns, `seed ${seed} ${h.id} runs`).toHaveLength(1);
        // Part before the photo, and the rest straight after it.
        expect(frameAt(s, h.post, tl.photoEndAt + 0.01).message).toBe(text);
        tested++;
      }
      if (tested >= 12) break;
    }
    expect(tested).toBeGreaterThan(3);
  });

  it('no message text is shown twice in a row across the photo, for every player', () => {
    for (const seed of photoSeeds.slice(0, 8)) {
      const r = race(seed);
      const s = setupOf(r);
      const tl = s.timeline;
      for (const h of r.inputs.card.horses) {
        const rs = runs(s, h.post, tl.winnerAt - 1, tl.beatEndAt + 1, 1 / 30);
        for (let i = 1; i < rs.length; i++) expect(rs[i].text, `seed ${seed} ${h.id}`).not.toBe(rs[i - 1].text);
      }
    }
  });

  it('the photo\'s own wall time never counts against a message: PHOTO is the photo\'s data length', () => {
    expect(PHOTO).toBe(4.5);
  });
});

// The message line pauses with the photo (ruling after the reviewer's re-check): messages
// are seen for their two seconds in time the player can see, whatever the keys.
describe('"home in Nth" is seen once, in every way of playing the sequence', () => {
  type Mode = 'none' | 'enter' | 'space';
  const DT = 1 / 30;

  /** Every frame of a whole sequence played in one mode, for one player, from `from` wall seconds. */
  function play(s: RaceSetup, post: number, mode: Mode, from: (c: Clock) => boolean) {
    const tl = s.timeline;
    const out: { f: RaceFrame; wall: number }[] = [];
    let c = startClock();
    let phaseSince = 0;
    let last = phaseOf(c);
    let presses = 0;
    let started = false;
    for (let guard = 0; phaseOf(c) !== 'done' && guard < 10000; guard++) {
      c = tick(c, tl, DT, mode === 'space');
      const ph = phaseOf(c);
      if (ph !== last) { last = ph; phaseSince = c.wall; }
      if (mode === 'enter' && c.wall - phaseSince >= 0.2 && ((ph === 'hold' && presses === 0) || (ph === 'photo' && presses < 3))) { c = skip(c, tl, 0); presses++; }
      if (!started && from(c)) started = true;
      if (started) out.push({ f: frameAt(s, post, c), wall: c.wall });
    }
    return out;
  }

  /** What the player saw of one message: the visible time, the number of separate showings, and the first frame. */
  function seenOf(frames: { f: RaceFrame }[], text: string) {
    let n = 0;
    let runs = 0;
    let inRun = false;
    let first = -1;
    frames.forEach(({ f }, i) => {
      if (!f.hudVisible) return; // the photo's frames neither show nor break a showing
      const on = f.message === text;
      if (on) { n++; if (first < 0) first = i; if (!inRun) runs++; }
      inRun = on;
    });
    return { seen: n * DT, runs, first };
  }

  const check = (seed: number, post: number, mode: Mode, s: RaceSetup) => {
    const r = s.result;
    const h = r.inputs.card.horses.find((x) => x.post === post)!;
    const fin = r.finish.find((f) => f.id === h.id)!;
    const text = homeText(h.name, fin.place);
    const frames = play(s, post, mode, (c) => c.race >= fin.time - 100);
    const shown = frames.filter((x) => x.f.hudVisible);
    const { seen, runs, first } = seenOf(frames, text);
    const tag = `seed ${seed} post ${post} ${mode}`;
    expect(runs, tag).toBeLessThanOrEqual(1); // never twice
    expect(seen, tag).toBeGreaterThan(0); // seen for some time
    // Seen for its two seconds, unless the winner beat ending (and the result screen opening)
    // cuts it short: that was true before the photo existed. Then it is seen until the end.
    const visibleAfterFirst = shown.filter((x) => frames.indexOf(x) >= first).length * DT;
    expect(seen, tag).toBeGreaterThan(Math.min(2, visibleAfterFirst) - 3 * DT);
    expect(seen, tag).toBeLessThan(2 + 3 * DT);
  };

  it('the reviewer\'s cases: seed 645 post 5 with no keys, seed 57 post 3 with Space held, seed 16 post 1', () => {
    for (const [seed, post, mode] of [[645, 5, 'none'], [57, 3, 'space'], [16, 1, 'none'], [16, 1, 'enter'], [16, 1, 'space'], [645, 5, 'enter'], [645, 5, 'space'], [57, 3, 'none']] as const) {
      expect(race(seed).photoFinish, `seed ${seed}`).toBe(true);
      check(seed, post, mode, setupOf(race(seed)));
    }
  });

  it('every horse as the player\'s, on photo seeds, with no keys, with Enter, and with Space held', () => {
    let n = 0;
    for (const seed of photoSeeds.slice(0, 7)) {
      const s = setupOf(race(seed));
      for (const h of race(seed).inputs.card.horses) {
        for (const mode of ['none', 'enter', 'space'] as const) { check(seed, h.post, mode, s); n++; }
      }
    }
    expect(n).toBe(168);
  });

  it('a message queued behind another when the photo begins still shows after it, in order; time behind the photo does not trigger the 3 s drop', () => {
    const r = structuredClone(race(16));
    const me = r.finish[1]; // home soon after the winner
    const winnerAt = DOORS + r.finish[0].time / 100 / SPEED;
    // A luck event for the player as the winner crosses: its message is on screen for the first
    // second of its two when the photo begins, so the home message queued behind it waits more
    // than the 3 s drop limit in real seconds (the photo is 4.5 s) but under it in seconds seen.
    r.replay.events = [{ type: 'blocked', horse: me.id, otherHorse: null, time: r.finish[0].time }];
    const s = setupOf(r);
    const tl = s.timeline;
    const name = nameOf(r, me.id);
    const blocked = fillTemplate(rd.copy.messages.blocked, { name });
    const home = homeText(name, 2);
    const frames = play(s, me.post, 'none', (c) => c.wall >= winnerAt - 1);
    const order: string[] = [];
    for (const { f } of frames) if (f.hudVisible && f.message !== '' && f.message !== order[order.length - 1]) order.push(f.message);
    expect(order.slice(0, 2), 'blocked first, then home').toEqual([blocked, home]);
    const b = seenOf(frames, blocked);
    expect(b.seen).toBeGreaterThan(2 - 3 * DT);
    expect(b.seen).toBeLessThan(2 + 3 * DT);
    expect(b.runs).toBe(1);
    // The home message waited behind it for more than the photo's length in real seconds, and was not dropped.
    const h = seenOf(frames, home);
    expect(h.runs).toBe(1);
    expect(h.seen).toBeGreaterThan(0);
    expect(PHOTO).toBeGreaterThan(rd.hud.messageMaxWaitSeconds.value); // the photo alone outlasts the drop rule
    expect(tl.photoEndAt - tl.doneAt).toBe(PHOTO);
  });
});
