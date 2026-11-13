import { describe, expect, it } from 'vitest';
import { sequenceSeconds } from '../data/raceDaySchema';
import type { RaceResult } from '../sim/result';
import { callForBar } from './announcer';
import { makeRaceSetup, playerView, raceFrame } from './raceFrame';
import {
  advance, clockAt, isPlain, makeTimeline, phaseOf, raceAtWall, raceTimeAt, skip, skipRaceTarget, startClock, tick, wallAtRace,
  type Clock, type Timeline,
} from './timeline';
import { art, game, race, raceDistanceOf, rd, reachTime, scrambleAfter, seeds } from './testkit';

// The race-day sequence (spec 3.4 and 4.3): RV11, FN1, 4x, AN3 across skips and 4x, AN4.
// Race time is hundredths of a second from the gate opening; wall time is playback seconds.

const SPEED = rd.playback.speed.value;
const FAST = rd.playback.fastSpeed.value;
const PICK = rd.beats.pickSeconds.value;
const STILL = rd.beats.gateStillSeconds.value;
const HOLD = rd.beats.wireHoldSeconds.value;
const BEAT = rd.beats.winnerBeatSeconds.value;
const PHOTO = rd.beats.photoSeconds.value;
const DOORS = PICK + STILL;

const timelineOf = (r: RaceResult): Timeline => makeTimeline(rd, r.finish[0].time);
const quarterOf = (r: RaceResult) => r.calls.find((c) => c.furlongsToGo === 2)!.time;

/** Tick in frames of `dt` wall seconds until `seconds` have passed. */
function run(c: Clock, tl: Timeline, seconds: number, fast: boolean, dt = 1 / 60): Clock {
  let out = c;
  let left = seconds;
  while (left > 1e-12) {
    const step = Math.min(dt, left);
    out = tick(out, tl, step, fast);
    left -= step;
  }
  return out;
}
const atDoors = (tl: Timeline): Clock => tick(startClock(), tl, DOORS, false);
/** A clock partway through the race: `raceT` hundredths at normal speed. */
const atRace = (tl: Timeline, raceT: number): Clock => tick(atDoors(tl), tl, raceT / 100 / SPEED, false);

describe('RV11: the sequence lengths', () => {
  it('RV11: the data speed is 2x for play and 4x for Space, as the spec says', () => {
    expect(SPEED).toBe(2);
    expect(FAST).toBe(4);
  });

  it.each([11500, 12031, 12155, 12500])('RV11: the race beat for a winner in %i hundredths lasts the time over the playback speed', (w) => {
    const tl = makeTimeline(rd, w);
    expect(tl.winnerAt - tl.doorsAt).toBeCloseTo(w / 100 / SPEED, 9);
    // And played frame by frame, not only worked out.
    let c = atDoors(tl);
    let frames = 0;
    while (c.winnerWall === null) {
      c = tick(c, tl, 1 / 60, false);
      frames++;
      if (frames > 20000) throw new Error('never finished');
    }
    expect(c.winnerWall! - DOORS).toBeCloseTo(w / 100 / SPEED, 9);
    // The frame that crosses goes on into the wire hold with what is left of its time.
    expect(c.race).toBeGreaterThanOrEqual(w);
    expect(c.race - w).toBeLessThanOrEqual((SPEED * 100) / 60 + 1e-6);
  });

  it('RV11: the winning-time band in the sim data tops out at 2:05.00', () => {
    expect(game.tuning.checks.winningTimeBandSeconds.value.max).toBe(125);
  });

  it('RV11: the full sequence with the data beat lengths and a photo for a 2:05.00 winner is at most 90 s', () => {
    // Pick window, still gate, the race over the speed, the wire hold, the photo, the winner beat.
    const by = PICK + STILL + 125 / SPEED + HOLD + PHOTO + BEAT;
    expect(sequenceSeconds(rd, 125, true)).toBeCloseTo(by, 9);
    expect(by).toBeLessThanOrEqual(90);
    expect(sequenceSeconds(rd, 125, true)).toBeLessThanOrEqual(90);
    expect(rd.beats.maxSequenceSeconds.value).toBe(90);
  });

  it('RV11: a photo adds its seconds and no photo adds none', () => {
    expect(sequenceSeconds(rd, 120, true) - sequenceSeconds(rd, 120, false)).toBeCloseTo(PHOTO, 9);
  });

  it('RV11: the beat lengths from the spec 4.3 table: hold 1.0, photo up to 4.5, winner beat 2.5', () => {
    expect(HOLD).toBe(1);
    expect(PHOTO).toBe(4.5);
    expect(BEAT).toBe(2.5);
  });

  it.each([11500, 12155, 12500])('RV11: the sum the loader checks is the beats the timeline plays (winner %i, with and without a photo)', (w) => {
    const tl = makeTimeline(rd, w);
    // Played tick by tick from the first frame to "done".
    let c = startClock();
    let wall = 0;
    while (phaseOf(c) !== 'done') {
      c = tick(c, tl, 1 / 60, false);
      wall += 1 / 60;
      if (wall > 500) throw new Error('never ended');
    }
    expect(c.beatEndWall!).toBeCloseTo(tl.beatEndAt, 9);
    expect(sequenceSeconds(rd, w / 100, false)).toBeCloseTo(c.beatEndWall!, 6);
    expect(sequenceSeconds(rd, w / 100, true)).toBeCloseTo(c.beatEndWall! + PHOTO, 6);
    expect(tl.beatEndAt).toBeCloseTo(PICK + STILL + w / 100 / SPEED + HOLD + BEAT, 9);
  });

  it('RV11: the beats are exact: hold and winner beat last their data seconds whatever the frame size', () => {
    const tl = makeTimeline(rd, 12155);
    for (const dt of [1 / 240, 1 / 60, 1 / 20, 0.5]) {
      let c = atDoors(tl);
      while (phaseOf(c) !== 'done') c = tick(c, tl, dt, false);
      expect(c.holdEndWall! - c.winnerWall!, `dt ${dt}`).toBeCloseTo(HOLD, 9);
      expect(c.beatEndWall! - c.holdEndWall!, `dt ${dt}`).toBeCloseTo(BEAT, 9);
    }
  });
});

describe('time advances by the real frame time, capped (spec 3.4)', () => {
  it('advance adds the elapsed milliseconds as seconds, capped at 50 ms a frame', () => {
    const cap = rd.playback.maxFrameMs.value;
    expect(cap).toBe(50);
    expect(advance(10, 16.7, cap)).toBeCloseTo(10.0167, 9);
    expect(advance(10, 8.3, cap)).toBeCloseTo(10.0083, 9); // a 120 Hz frame
    expect(advance(10, 5000, cap)).toBeCloseTo(10.05, 9); // a stalled tab does not jump the race
    expect(advance(10, -20, cap)).toBe(10);
  });

  it('two 120 Hz frames play the same as one 60 Hz frame', () => {
    const tl = makeTimeline(rd, 12155);
    const a = run(atDoors(tl), tl, 3, false, 1 / 60);
    const b = run(atDoors(tl), tl, 3, false, 1 / 120);
    expect(b.race).toBeCloseTo(a.race, 6);
    expect(b.wall).toBeCloseTo(a.wall, 9);
  });
});

describe('FN1: Enter skips', () => {
  it('FN1: skipRaceTarget goes to the 1/4 pole before it and to the winner\'s finish after it', () => {
    expect(skipRaceTarget(8500, 12000, 0)).toBe(8500);
    expect(skipRaceTarget(8500, 12000, 8499)).toBe(8500);
    expect(skipRaceTarget(8500, 12000, 8501)).toBe(12000);
    expect(skipRaceTarget(8500, 12000, 11999)).toBe(12000);
  });

  it('FN1: the 1/4 pole call is when the leader reaches it (2 furlongs, 1320 feet, to go), within a sample', () => {
    for (const seed of seeds(40)) {
      const r = race(seed);
      expect(Math.abs(quarterOf(r) - reachTime(r, raceDistanceOf(r) - 1320 * 100))).toBeLessThanOrEqual(r.replay.step);
    }
  });

  it('FN1: before the 1/4 pole Enter jumps to the moment the leader reaches it, over 100 seeds', () => {
    for (const seed of seeds(100)) {
      const r = race(seed);
      const tl = timelineOf(r);
      const q = quarterOf(r);
      for (const t of [1, 500, Math.floor(q / 2), q - 300, q - 1]) {
        const c = atRace(tl, t);
        expect(phaseOf(c)).toBe('race');
        const s = skip(c, tl, q);
        expect(s.race, `seed ${seed} from ${t}`).toBe(q);
        expect(phaseOf(s)).toBe('race');
        expect(s.wall).toBe(c.wall); // the skip takes no time
      }
    }
  });

  it('FN1: after the 1/4 pole Enter jumps to the winner\'s finish time, over 100 seeds', () => {
    for (const seed of seeds(100)) {
      const r = race(seed);
      const tl = timelineOf(r);
      const q = quarterOf(r);
      for (const t of [q + 1, q + 400, Math.floor((q + r.finish[0].time) / 2), r.finish[0].time - 2]) {
        const c = atRace(tl, t);
        expect(phaseOf(c)).toBe('race');
        const s = skip(c, tl, q);
        expect(s.race, `seed ${seed} from ${t}`).toBe(r.finish[0].time);
        expect(phaseOf(s)).toBe('hold');
        expect(s.winnerWall).toBe(c.wall);
      }
    }
  });

  it('FN1: two presses from the gate: the 1/4 pole, then the wire', () => {
    const r = race(5);
    const tl = timelineOf(r);
    const q = quarterOf(r);
    let c = skip(atRace(tl, 2000), tl, q);
    expect(c.race).toBe(q);
    c = skip(c, tl, q);
    expect(c.race).toBe(r.finish[0].time);
  });

  it('FN1: after a skip the race plays on from there at the playback speed', () => {
    const r = race(7);
    const tl = timelineOf(r);
    const q = quarterOf(r);
    const s = skip(atRace(tl, 1000), tl, q);
    const later = run(s, tl, 1.5, false);
    expect(later.race).toBeCloseTo(q + 1.5 * SPEED * 100, 6);
    expect(later.wall).toBeCloseTo(s.wall + 1.5, 9);
  });

  // Updated on purpose with step 5: the sample times were fixed seconds (0, 0.5, 2.5) from when
  // the gate beat was 5 s long; with the pick window gone the doors open at DOORS (1.0 s) and 2.5
  // is after them. The requirement stands: Enter during the gate beat opens the doors at once,
  // so the samples are spread across the gate beat from data.
  it('FN1: Enter at the gate opens the doors now', () => {
    const tl = makeTimeline(rd, 12155);
    for (const w of [0, DOORS / 4, DOORS / 2, DOORS - 0.01]) {
      const c = tick(startClock(), tl, w, false);
      expect(phaseOf(c)).toBe('gate');
      const s = skip(c, tl, 8000);
      expect(phaseOf(s)).toBe('race');
      expect(s.doorsWall).toBe(w);
      expect(s.race).toBe(0);
      // Race time starts from this moment, at the playback speed.
      const later = run(s, tl, 1, false);
      expect(later.race).toBeCloseTo(SPEED * 100, 6);
      expect(raceAtWall(later, w + 1)).toBeCloseTo(SPEED * 100, 6);
    }
  });

  it('FN1: Enter ends the wire hold early, then the winner beat early', () => {
    const tl = makeTimeline(rd, 12155);
    const inHold = run(atRace(tl, 12154), tl, 0.5, false);
    expect(phaseOf(inHold)).toBe('hold');
    const beat = skip(inHold, tl, 8000);
    expect(phaseOf(beat)).toBe('winner');
    expect(beat.holdEndWall).toBe(inHold.wall);
    expect(beat.wall).toBe(inHold.wall);
    const midBeat = run(beat, tl, 0.7, false);
    expect(phaseOf(midBeat)).toBe('winner');
    const done = skip(midBeat, tl, 8000);
    expect(phaseOf(done)).toBe('done');
    expect(done.beatEndWall).toBe(midBeat.wall);
    // Nothing further to skip.
    expect(skip(done, tl, 8000)).toEqual(done);
    // The beat that was skipped into lasts its full data length when left alone.
    const full = run(beat, tl, BEAT - 0.001, false);
    expect(phaseOf(full)).toBe('winner');
    expect(phaseOf(run(beat, tl, BEAT + 0.001, false))).toBe('done');
  });

  it('FN1: a skip changes race time only inside the race beat', () => {
    const tl = makeTimeline(rd, 12155);
    const hold = run(atRace(tl, 12154), tl, 0.3, false);
    expect(skip(hold, tl, 8000).race).toBe(hold.race);
  });

  it('FN1: skip never moves race time backward, and never past the winner', () => {
    const r = race(12);
    const tl = timelineOf(r);
    const q = quarterOf(r);
    let c = atRace(tl, 100);
    for (let i = 0; i < 4; i++) {
      const n = skip(c, tl, q);
      expect(n.race).toBeGreaterThanOrEqual(c.race);
      expect(n.race).toBeLessThanOrEqual(r.finish[0].time);
      c = n;
    }
  });
});

describe('FN1: a skip drops what it skipped over', () => {
  // WAITING ON THE ENGINEER (round three ruling): the spec now says a message whose trigger
  // falls inside a skipped stretch is dropped, not shown late. Today the skipped luck events
  // show as if they had just happened.
  it('FN1: after a skip the message line shows only what happens from the new race time on', () => {
    let tested = 0;
    for (const seed of seeds(120)) {
      const r = race(seed);
      const tl = timelineOf(r);
      const q = quarterOf(r);
      const setup = makeRaceSetup(r, rd, 0, art);
      for (const me of r.inputs.card.horses) {
        const view = playerView(setup, me.post);
        const before = run(atDoors(tl), tl, 0.5, false); // doors open, half a second, Enter
        const after = skip(before, tl, q);
        const skipped = view.triggers.filter((t) => t.race !== undefined && t.race > before.race && t.race <= after.race);
        if (skipped.length === 0) continue;
        const kept = new Set(view.triggers.filter((t) => !skipped.includes(t)).map((t) => t.text));
        const onlySkipped = new Set(skipped.map((t) => t.text).filter((x) => !kept.has(x)));
        if (onlySkipped.size === 0) continue;
        let c = after;
        for (let i = 0; i < 100; i++) {
          c = tick(c, tl, 0.05, false);
          const shown = raceFrame(setup, view, c).message;
          expect(onlySkipped.has(shown), `seed ${seed} player ${me.id} at +${(i + 1) * 0.05}s showed "${shown}" from the skipped stretch`).toBe(false);
        }
        tested++;
        if (tested >= 60) return;
      }
    }
    expect(tested).toBeGreaterThan(0);
  });

  it('FN1: the skipped message is not shown in the very first frame after the skip either', () => {
    for (const seed of seeds(120)) {
      const r = race(seed);
      const ev = r.replay.events.find((e) => e.time > 100 && e.time <= quarterOf(r) && e.type !== 'bumped');
      if (!ev) continue;
      const tl = timelineOf(r);
      const me = r.inputs.card.horses.find((h) => h.id === ev.horse)!;
      const setup = makeRaceSetup(r, rd, 0, art);
      const view = playerView(setup, me.post);
      const text = view.triggers.find((t) => t.race === ev.time && t.priority === 0)!.text;
      const c = skip(run(atDoors(tl), tl, 0.5, false), tl, quarterOf(r));
      expect(raceFrame(setup, view, c).message, `seed ${seed}`).not.toBe(text);
      return;
    }
    throw new Error('no seed with an early luck event');
  });

  it('FN1: a message whose trigger is after the skip target still shows when the race gets there', () => {
    for (const seed of seeds(200)) {
      const r = race(seed);
      const q = quarterOf(r);
      const ev = r.replay.events.find((e) => e.time > q + 50 && e.time < r.finish[0].time - 100 && e.type !== 'bumped');
      if (!ev) continue;
      const tl = timelineOf(r);
      const me = r.inputs.card.horses.find((h) => h.id === ev.horse)!;
      const setup = makeRaceSetup(r, rd, 0, art);
      const view = playerView(setup, me.post);
      const text = view.triggers.find((t) => t.race === ev.time && t.priority === 0)!.text;
      const c = skip(run(atDoors(tl), tl, 0.5, false), tl, q);
      let seen = false;
      let d = c;
      while (d.race < ev.time + 100) {
        d = tick(d, tl, 0.05, false);
        if (raceFrame(setup, view, d).message === text) seen = true;
      }
      expect(seen, `seed ${seed}`).toBe(true);
      return;
    }
    throw new Error('no seed with a later luck event');
  });

  it('FN1: the announcer shows the latest call reached after a skip', () => {
    for (const seed of seeds(40)) {
      const r = race(seed);
      const tl = timelineOf(r);
      const q = quarterOf(r);
      const setup = makeRaceSetup(r, rd, 0, art);
      const view = playerView(setup, 3);
      const first = skip(run(atDoors(tl), tl, 0.5, false), tl, q);
      const wanted = (race: number) => [...setup.schedule].filter((x) => x.at <= race).pop()!.text;
      expect(raceFrame(setup, view, run(first, tl, 0.6, false)).call.startsWith(wanted(first.race).slice(0, 10))).toBe(true);
      const second = skip(first, tl, q);
      const f2 = raceFrame(setup, view, second);
      expect(second.race).toBe(r.finish[0].time);
      expect(f2.call).toBe(wanted(r.finish[0].time));
    }
  });
});

describe('clock bookkeeping: race time and wall time', () => {
  it('raceAtWall and wallAtRace agree with a clock that ran 4x then 2x', () => {
    const tl = makeTimeline(rd, 12155);
    let c = atDoors(tl);
    c = run(c, tl, 10, true); // 10 s at 4x: 4000 hundredths
    c = run(c, tl, 5, false); // 5 s at 2x: 1000 more
    expect(c.race).toBeCloseTo(5000, 6);
    expect(raceAtWall(c, DOORS + 10)).toBeCloseTo(4000, 6);
    expect(raceAtWall(c, DOORS + 5)).toBeCloseTo(2000, 6);
    expect(raceAtWall(c, DOORS + 12)).toBeCloseTo(4400, 6);
    expect(wallAtRace(c, 2000)).toBeCloseTo(DOORS + 5, 6);
    expect(wallAtRace(c, 4400)).toBeCloseTo(DOORS + 12, 6);
    expect(wallAtRace(c, 5000)).toBeCloseTo(DOORS + 15, 6);
    expect(wallAtRace(c, 5001)).toBe(Infinity); // not reached yet
    expect(raceAtWall(c, 1)).toBe(0); // before the doors
  });

  it('a skip is a jump at one wall second: everything skipped over was reached at that moment', () => {
    const tl = makeTimeline(rd, 12155);
    const c0 = run(atDoors(tl), tl, 10, false); // race 2000
    const s = skip(c0, tl, 8500);
    expect(raceAtWall(s, s.wall)).toBe(8500);
    expect(raceAtWall(s, s.wall - 1)).toBeCloseTo(1800, 6);
    expect(wallAtRace(s, 1000)).toBeCloseTo(DOORS + 5, 6);
    expect(wallAtRace(s, 5000)).toBe(s.wall);
    expect(wallAtRace(s, 8500)).toBe(s.wall);
    expect(wallAtRace(s, 8501)).toBe(Infinity);
  });

  it('a clock with no 4x and no skip is plain, and any 4x or skip makes it not plain', () => {
    const tl = makeTimeline(rd, 12155);
    expect(isPlain(run(atDoors(tl), tl, 5, false), tl)).toBe(true);
    expect(isPlain(run(atDoors(tl), tl, 5, true), tl)).toBe(false);
    expect(isPlain(skip(run(atDoors(tl), tl, 5, false), tl, 8000), tl)).toBe(false);
  });
});

describe('4x: Space held plays the race beat at the fast speed', () => {
  it('4x: race time runs at the fast speed from data while Space is held', () => {
    const tl = makeTimeline(rd, 12155);
    const c = run(atDoors(tl), tl, 3, true);
    expect(c.race).toBeCloseTo(3 * FAST * 100, 6);
    expect(c.fast).toBe(true);
    // Released: back to 2x.
    const d = run(c, tl, 2, false);
    expect(d.race).toBeCloseTo(3 * FAST * 100 + 2 * SPEED * 100, 6);
    expect(d.fast).toBe(false);
  });

  it('4x: the whole race at 4x takes the winner\'s time over 4', () => {
    const tl = makeTimeline(rd, 12155);
    let c = atDoors(tl);
    while (c.winnerWall === null) c = tick(c, tl, 1 / 60, true);
    expect(c.winnerWall! - DOORS).toBeCloseTo(12155 / 100 / FAST, 6);
    expect(c.race).toBeGreaterThanOrEqual(12155);
    expect(c.race - 12155).toBeLessThanOrEqual((FAST * 100) / 60 + 1e-6);
  });

  it('4x: only in the race beat: at the gate, in the wire hold and in the winner beat Space changes nothing', () => {
    const tl = makeTimeline(rd, 12155);
    // The gate: the doors open at the same wall second with or without Space.
    const gate = tick(startClock(), tl, DOORS - 0.5, true);
    expect(gate.fast).toBe(false);
    expect(phaseOf(gate)).toBe('gate');
    expect(tick(gate, tl, 0.5, true).doorsWall).toBe(DOORS);
    // The hold and the beat last their data seconds with Space held throughout.
    let c = atRace(tl, 12154);
    while (phaseOf(c) !== 'done') c = tick(c, tl, 1 / 60, true);
    expect(c.holdEndWall! - c.winnerWall!).toBeCloseTo(HOLD, 9);
    expect(c.beatEndWall! - c.holdEndWall!).toBeCloseTo(BEAT, 9);
    const inHold = tick(atRace(tl, 12154), tl, 0.3, true);
    expect(inHold.fast).toBe(false);
  });

  it('4x: the winner crosses at the right wall second when Space is held for part of the race', () => {
    const tl = makeTimeline(rd, 12155);
    let c = atDoors(tl);
    c = run(c, tl, 10, true); // 4000
    c = run(c, tl, 20, false); // +4000 = 8000
    while (c.winnerWall === null) c = tick(c, tl, 1 / 60, false);
    // 4155 left at 2x.
    expect(c.winnerWall! - DOORS).toBeCloseTo(10 + 20 + 4155 / 200, 6);
  });

  // Updated on purpose with step 5. Finding: with the doors now at 1.0 s the ticked clock's
  // race time after 6 s at 4x is 2399.9999999999914, not 2400, because 360 frames of 1/60 s add
  // up with a rounding hair, and the clock text floors to tenths, so it read "0:23.9" where the
  // sum on paper is "0:24.0". That is rounding error on a tenth boundary, not a defect: the text
  // never goes backward (checked below at every frame). What the test protects is that the
  // clock reads real race time, not playback time, so it samples 4 ms past the boundary, where
  // the text is the same on every path, and checks every frame is monotone.
  it('4x: the clock still reads real race time (the speed changes how fast it runs, not what it means)', () => {
    const r = race(3);
    const tl = timelineOf(r);
    const setup = makeRaceSetup(r, rd, 0, art);
    const me = playerView(setup, 2);
    const seconds = 6.004;
    const c = run(atDoors(tl), tl, seconds, true);
    expect(raceFrame(setup, me, c).raceTime).toBeCloseTo(seconds * FAST * 100, 6);
    expect(raceFrame(setup, me, c).clock).toBe(`0:${String(Math.floor((seconds * FAST * 100) / 100)).padStart(2, '0')}.${Math.floor(((seconds * FAST * 100) % 100) / 10)}`);
    // On the tenth boundary itself the sum differs from the paper value by a hair (under 1e-9 hundredths), and the text never steps back.
    const edge = run(atDoors(tl), tl, 6, true);
    expect(Math.abs(edge.race - 6 * FAST * 100)).toBeLessThan(1e-9);
    let prev = -1;
    let k = atDoors(tl);
    for (let i = 0; i < 400; i++) {
      k = tick(k, tl, 1 / 60, true);
      const text = raceFrame(setup, me, k).clock;
      const n = Number(text.replace(':', '').replace('.', ''));
      expect(n, `frame ${i} ${text}`).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });

  it('4x: the tag shows only while it runs, and the bar\'s call is cut to 27 characters (AN4)', () => {
    const r = race(1);
    const tl = timelineOf(r);
    const setup = makeRaceSetup(r, rd, 0, art);
    const me = playerView(setup, 1);
    expect(rd.copy.fastTag).toBe('4x');
    let c = atDoors(tl);
    let cut = 0;
    let longSeen = 0;
    while (c.winnerWall === null) {
      c = tick(c, tl, 1 / 20, true);
      const f = raceFrame(setup, me, c);
      if (phaseOf(c) !== 'race') continue; // the frame that crosses the wire goes on into the hold, where Space does nothing
      expect(f.fastTag).toBe('4x');
      expect(f.call.length).toBeLessThanOrEqual(27);
      const slow = raceFrame(setup, me, { ...c, fast: false });
      expect(f.call).toBe(callForBar(slow.call, true));
      expect(slow.fastTag).toBeNull();
      if (slow.call.length > 27) { longSeen++; expect(f.call).toBe(slow.call.slice(0, 27)); cut++; }
    }
    expect(longSeen).toBeGreaterThan(0);
    expect(cut).toBe(longSeen);
  });

  it('4x: with Space released the tag is gone and calls may use all 30 characters', () => {
    const g = structuredClone(game);
    g.card.horses.forEach((h) => { h.name = 'Mint Julep Lawsuit'; });
    const r = race(1);
    const tl = timelineOf(r);
    const setup = makeRaceSetup(r, rd, 0, art);
    const me = playerView(setup, 1);
    let max = 0;
    let c = atDoors(tl);
    while (c.winnerWall === null) {
      c = tick(c, tl, 1 / 20, false);
      const f = raceFrame(setup, me, c);
      expect(f.fastTag).toBeNull();
      max = Math.max(max, f.call.length);
    }
    expect(max).toBeGreaterThan(27);
    expect(max).toBeLessThanOrEqual(30);
  });

  it('4x: calls type out in wall time: half a second after a call the whole line shows, at 4x as at 2x', () => {
    const r = race(1);
    const tl = timelineOf(r);
    const setup = makeRaceSetup(r, rd, 0, art);
    const me = playerView(setup, 1);
    const cps = rd.hud.typeCharsPerSecond.value;
    const call = setup.schedule.find((x) => x.key === 'leader')!;
    for (const fast of [false, true]) {
      const rate = fast ? FAST : SPEED;
      const wallAt = DOORS + call.at / 100 / rate;
      let c = atDoors(tl);
      c = run(c, tl, wallAt - DOORS + 0.125, fast);
      const f = raceFrame(setup, me, { ...c, fast: false });
      expect(f.call, `fast ${fast}`).toBe(call.text.slice(0, Math.floor(0.125 * cps)));
      c = run(c, tl, 0.375, fast);
      expect(raceFrame(setup, me, { ...c, fast: false }).call).toBe(call.text);
    }
  });

  it('4x: a message keeps its two seconds of wall time at 4x', () => {
    // Seeds with a luck event for the player, and nothing else queued near it.
    let tested = 0;
    for (const seed of seeds(300)) {
      const r = race(seed);
      const e = r.replay.events.find((x) => x.type !== 'bumped');
      if (!e) continue;
      const me = r.inputs.card.horses.find((h) => h.id === e.horse)!;
      const setup = makeRaceSetup(r, rd, 0, art);
      const view = playerView(setup, me.post);
      const others = view.triggers.filter((t) => t.race !== undefined && Math.abs(t.race - e.time) < 1200 && !/Back in stride/.test(t.text));
      if (others.length !== 1 || e.time < 600 || e.time > r.finish[0].time - 1500) continue;
      const tl = timelineOf(r);
      const wall = DOORS + e.time / 100 / FAST;
      const text = others[0].text;
      const show = (after: number) => {
        let c = atDoors(tl);
        c = run(c, tl, wall - DOORS + after, true);
        return raceFrame(setup, view, { ...c, fast: false }).message;
      };
      expect(show(0.05), `seed ${seed} just after`).toBe(text);
      expect(show(1.9), `seed ${seed} at 1.9 s`).toBe(text);
      expect(show(2.1), `seed ${seed} at 2.1 s`).toBe(rd.copy.messages.backInStride);
      expect(show(3.9)).toBe(rd.copy.messages.backInStride);
      expect(show(4.1)).not.toBe(rd.copy.messages.backInStride);
      tested++;
      if (tested >= 3) break;
    }
    expect(tested).toBeGreaterThan(0);
  });

  // Updated on purpose with the photo finish (steps 3 and 4) and again with step 5. This test
  // built its timeline with no photo flag, while the race setup builds its own with
  // `result.photoFinish`, so on a photo seed the two disagreed about when the winner beat
  // starts. Both are now built the same way, from `result.photoFinish`, and the seeds cover a
  // photo finish (16) and races with none (2, 9, 21).
  //
  // Step 5 (the doors moved to 1.0 s): the ticked clock adds its frames up and the direct path
  // computes each time by formula, so their beat times differ by rounding, up to 7e-15 s
  // (measured below). Where a pixel boundary falls exactly on a beat start a 7e-15 s hair flips
  // one pixel, and that is the whole difference: it is constant, never frame to frame. So the
  // direct path is given the very same accumulated times the ticked clock holds (same input,
  // same frame), exactness is kept, and the hair is asserted to be a hair.
  it('4x and skips: with none of either, the clock gives the same frames as plain playback', () => {
    const covered = { photo: 0, plain: 0 };
    let drift = 0;
    for (const seed of [2, 9, 16, 21]) {
      const r = race(seed);
      covered[r.photoFinish ? 'photo' : 'plain']++;
      const tl = makeTimeline(rd, r.finish[0].time, r.photoFinish);
      const setup = makeRaceSetup(r, rd, 0, art);
      expect(setup.timeline).toEqual(tl);
      const me = playerView(setup, 3);
      let c = startClock();
      let n = 0;
      while (phaseOf(c) !== 'done') {
        c = tick(c, tl, 1 / 60, false);
        if (n++ % 3 !== 0) continue;
        expect(isPlain(c, tl)).toBe(true);
        expect(c.race).toBeCloseTo(raceTimeAt(tl, c.wall), 6);
        for (const [got, want] of [[c.winnerWall, tl.winnerAt], [c.holdEndWall, tl.doneAt], [c.photoEndWall, tl.photoEndAt], [c.beatEndWall, tl.beatEndAt]] as const) {
          if (got !== null) drift = Math.max(drift, Math.abs(got - want));
        }
        // The direct path: the same wall second, with the same accumulated race time and beat seconds.
        const direct: Clock = { ...clockAt(tl, c.wall), race: c.race, winnerWall: c.winnerWall, holdEndWall: c.holdEndWall, photoEndWall: c.photoEndWall, beatEndWall: c.beatEndWall };
        expect(raceFrame(setup, me, c), `seed ${seed} wall ${c.wall}`).toEqual(raceFrame(setup, me, direct));
        // And the formula's own frame is the same to within a pixel (one rounding hair at a boundary).
        const plain = raceFrame(setup, me, c.wall);
        expect(raceFrame(setup, me, c).phase).toBe(plain.phase);
        expect(Math.abs(raceFrame(setup, me, c).drawCam - plain.drawCam)).toBeLessThanOrEqual(1);
      }
    }
    expect(drift).toBeLessThan(1e-9);
    expect(covered.photo).toBeGreaterThan(0);
    expect(covered.plain).toBeGreaterThan(0);
  });
});

describe('AN3 across skips and 4x: no frame shows anything from beyond the sample after race time', () => {
  /** A play with 4x stretches and two skips, recorded every few frames. */
  function playThrough(r: RaceResult): Clock[] {
    const tl = timelineOf(r);
    const q = quarterOf(r);
    const out: Clock[] = [];
    let c = startClock();
    const frames = (n: number, fast: boolean, skipAfter = false) => {
      for (let i = 0; i < n; i++) {
        c = tick(c, tl, 1 / 20, fast);
        if (i % 4 === 0) out.push(c);
      }
      if (skipAfter) { c = skip(c, tl, q); out.push(c); }
    };
    frames(120, false); // the gate and the first seconds
    frames(80, true); // a 4x stretch
    frames(30, false);
    frames(1, false, true); // Enter: to the 1/4 pole
    frames(30, true); // 4x through the stretch
    frames(10, false);
    frames(1, false, true); // Enter: to the wire
    frames(80, true); // the hold and the beat with Space held
    return out;
  }

  it('AN3: scrambling everything after the sample after the clock\'s race time changes no frame, across skips and 4x stretches', () => {
    let compared = 0;
    for (const seed of seeds(12)) {
      const r = race(seed);
      const setup = makeRaceSetup(r, rd, 0, art);
      for (const c of playThrough(r)) {
        const scrambled = makeRaceSetup(scrambleAfter(r, c.race), rd, 0, art);
        for (const post of [2, 6]) {
          const a = raceFrame(setup, playerView(setup, post), c);
          const b = raceFrame(scrambled, playerView(scrambled, post), c);
          expect(b, `seed ${seed} wall ${c.wall.toFixed(2)} race ${c.race.toFixed(0)}`).toEqual(a);
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(900);
  });

  it('AN3: the recorded plays really include skips, 4x and every beat', () => {
    const r = race(4);
    const clocks = playThrough(r);
    const phases = new Set(clocks.map((c) => phaseOf(c)));
    for (const p of ['gate', 'race', 'hold', 'winner']) expect(phases.has(p as never), p).toBe(true);
    expect(clocks.some((c) => c.fast)).toBe(true);
    expect(clocks.some((c) => c.marks.length >= 4)).toBe(true);
  });

  it('AN3: just after a skip to the 1/4 pole no call, message or position beyond the 1/4 pole shows', () => {
    for (const seed of seeds(40)) {
      const r = race(seed);
      const tl = timelineOf(r);
      const q = quarterOf(r);
      const setup = makeRaceSetup(r, rd, 0, art);
      const view = playerView(setup, 5);
      const c = skip(atRace(tl, 3000), tl, q);
      const f = raceFrame(setup, view, c);
      const lastCall = [...r.calls].filter((x) => x.time <= q).pop()!;
      expect(lastCall.furlongsToGo).toBe(2);
      expect(f.call).not.toMatch(/wins it|gets there|Too close|Down to the wire|Photo/);
      expect(f.position).not.toMatch(/Finished|Won by/);
      expect(f.clock).not.toMatch(/\.\d\d$/);
    }
  });
});
