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

  it('on non-photo seeds every frame equals what the timeline without a photo gives', () => {
    for (const seed of plainSeeds.slice(0, 8)) {
      const r = race(seed);
      const s = setupOf(r);
      const tl = makeTimeline(rd, r.finish[0].time); // the default: no photo
      expect(s.timeline).toEqual(tl);
      let c = startClock();
      let n = 0;
      while (phaseOf(c) !== 'done') {
        c = tick(c, tl, 1 / 30, false);
        if (n++ % 4 !== 0) continue;
        const f = frameAt(s, 3, c);
        expect(f.photo).toBeNull();
        expect(f.raceTime, `seed ${seed} wall ${c.wall}`).toBe(c.race); // the view runs on the clock, never frozen
        expect(f).toEqual(frameAt(s, 3, clockAt(tl, c.wall)));
        expect(f).toEqual(frameAt(s, 3, c.wall));
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

  it('a message on screen when the photo begins runs out its time: shown for its two seconds, not cut at the photo, not repeated', () => {
    let tested = 0;
    for (const seed of photoSeeds) {
      const r = race(seed);
      const s = setupOf(r);
      const tl = s.timeline;
      for (const h of r.inputs.card.horses) {
        const fin = r.finish.find((f) => f.id === h.id)!;
        const start = DOORS + fin.time / 100 / SPEED; // the wall second the home message is due
        if (!(start < tl.doneAt - 0.3 && start + 2 > tl.doneAt + 0.2)) continue;
        const text = fillTemplate(rd.copy.messages.home, { name: h.name, place: `${fin.place}${['th', 'st', 'nd', 'rd'][fin.place < 4 ? fin.place : 0]}` });
        // Only where nothing else is queued in front of it.
        if (frameAt(s, h.post, start + 0.02).message !== text) continue;
        expect(frameAt(s, h.post, tl.doneAt - 0.01).message, `seed ${seed} ${h.id} at the photo`).toBe(text);
        expect(frameAt(s, h.post, tl.doneAt + 0.01).message).toBe(text); // not cut off when the photo starts
        expect(frameAt(s, h.post, start + 1.95).message).toBe(text);
        const gone = frameAt(s, h.post, start + 2.05).message;
        expect(gone).not.toBe(text);
        const rs = runs(s, h.post, start - 0.2, tl.beatEndAt + 2, 1 / 30).filter((x) => x.text === text);
        expect(rs).toHaveLength(1);
        expect(rs[0].to - rs[0].from).toBeGreaterThan(1.9 - 0.1);
        expect(rs[0].to - rs[0].from).toBeLessThanOrEqual(2.0);
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
