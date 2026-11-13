import { describe, expect, it } from 'vitest';
import type { RaceResult } from '../sim/result';
import { ambientState, fullTileAt, midZones, swapsAt, zoneTiles, type AmbientId } from './ambient';
import { makeRaceSetup, playerView, raceFrame, type RaceFrame } from './raceFrame';
import { makeTimeline, phaseOf, startClock, tick, type Clock } from './timeline';
import { art, race, rd, seeds } from './testkit';

// CH1: ambient loops (DESIGN Charm cap and swap rates). Walls are playback seconds.

const A = rd.ambient;
const INFIELD_W = art.infieldTileWidth ?? 32;
const CROWD_W = art.crowdTileWidth ?? 16;
const FILL_W = art.infieldFillWidth ?? 16;
const SPEED = rd.playback.speed.value;
const DOORS = rd.beats.pickSeconds.value + rd.beats.gateStillSeconds.value;
const eighthWall = (r: RaceResult) => DOORS + r.calls.find((c) => c.furlongsToGo === 1)!.time / 100 / SPEED;
const winnerWall = (r: RaceResult) => DOORS + r.finish[0].time / 100 / SPEED;

describe('CH1: the data', () => {
  it('CH1: the cap is 3, and every swap rate is at most 4 a second (DESIGN Charm)', () => {
    expect(A.cap.value).toBe(3);
    for (const k of ['crowdSwapsPerSecond', 'crowdStretchSwapsPerSecond', 'flagSwapsPerSecond', 'cursorSwapsPerSecond'] as const) {
      expect(A[k].value, k).toBeGreaterThan(0);
      expect(A[k].value, k).toBeLessThanOrEqual(4);
    }
  });

  it('CH1: the crowd is slow early and faster from the 1/8 pole; the flag swaps every 0.4 s and the cursor every 0.5 s (DESIGN)', () => {
    expect(A.crowdStretchSwapsPerSecond.value).toBeGreaterThan(A.crowdSwapsPerSecond.value);
    expect(A.flagSwapsPerSecond.value).toBeCloseTo(1 / 0.4, 9);
    expect(A.cursorSwapsPerSecond.value).toBeCloseTo(1 / 0.5, 9);
  });

  it('CH1: from the 1/8 pole only the crowd strip keeps moving', () => {
    expect(A.fromEighthPole).toEqual(['crowd']);
  });
});

describe('CH1: the cap, from data', () => {
  const both = new Set<AmbientId>(['crowd', 'flag']);

  it('CH1: nothing animates more than the cap, and priority order decides who', () => {
    for (const cap of [0, 1, 2, 3]) {
      const d = structuredClone(rd);
      d.ambient.cap.value = cap;
      const s = ambientState(d, { wall: 20, eighthWall: Infinity, visible: both });
      expect(s.animating.length).toBeLessThanOrEqual(cap);
      expect(s.animating).toEqual(['crowd', 'flag'].slice(0, cap));
    }
  });

  it('CH1: only visible things animate', () => {
    expect(ambientState(rd, { wall: 20, eighthWall: Infinity, visible: new Set<AmbientId>(['flag']) }).animating).toEqual(['flag']);
    expect(ambientState(rd, { wall: 20, eighthWall: Infinity, visible: new Set<AmbientId>() }).animating).toEqual([]);
  });

  it('CH1: from the 1/8 pole only the items listed in data keep animating; the flag holds the frame it had then', () => {
    const before = ambientState(rd, { wall: 30, eighthWall: 31, visible: both });
    expect(before.animating).toEqual(['crowd', 'flag']);
    for (const w of [31, 32, 40]) {
      const s = ambientState(rd, { wall: w, eighthWall: 31, visible: both });
      expect(s.animating).toEqual(['crowd']);
      expect(s.flagFrame).toBe(Math.floor(31 * A.flagSwapsPerSecond.value) % 2);
    }
    const d = structuredClone(rd);
    d.ambient.fromEighthPole = ['crowd', 'flag'];
    expect(ambientState(d, { wall: 40, eighthWall: 31, visible: both }).animating).toEqual(['crowd', 'flag']);
  });

  it('CH1: swapsAt: the data rate, then the faster rate from the 1/8 pole, in wall seconds', () => {
    expect(swapsAt(10, 1, 4, 20)).toBe(10);
    expect(swapsAt(20, 1, 4, 20)).toBe(20);
    expect(swapsAt(22, 1, 4, 20)).toBe(28);
    expect(swapsAt(10, 2.5, 4, 20)).toBe(25);
    expect(swapsAt(0, 1, 4, 20)).toBe(0);
  });
});

/** Frames of a race at 1/20 s steps from the gate to the end of the beat, with the clock. */
function frames(seed: number, step = 0.05, fast = false, post = 3): { c: Clock; f: RaceFrame }[] {
  const r = race(seed);
  const tl = makeTimeline(rd, r.finish[0].time);
  const setup = makeRaceSetup(r, rd, 0, art);
  const me = playerView(setup, post);
  const out: { c: Clock; f: RaceFrame }[] = [];
  let c = startClock();
  while (phaseOf(c) !== 'done') {
    c = tick(c, tl, step, fast);
    out.push({ c, f: raceFrame(setup, me, c) });
  }
  return out;
}

describe('CH1: at most the cap animating while the field runs, over many seeds and every moment', () => {
  it('CH1: the frame never lets more than the cap animate, and anything that changes was allowed to', () => {
    let n = 0;
    for (const seed of seeds(40)) {
      const fs = frames(seed, 0.05);
      let prev = fs[0].f;
      for (const { c, f } of fs.slice(1)) {
        if (phaseOf(c) === 'race' || phaseOf(c) === 'hold') {
          expect(f.ambient.animating.length, `seed ${seed} wall ${c.wall}`).toBeLessThanOrEqual(A.cap.value);
          const changed = new Set<AmbientId>();
          // Tiles slide with the camera, so compare the frame numbers of crowd tiles by world position.
          // (A loop that stops showing resets its count; only a swap while it runs counts.)
          if (f.ambient.animating.includes('crowd') && prev.ambient.animating.includes('crowd') && f.ambient.crowdSwaps !== prev.ambient.crowdSwaps) changed.add('crowd');
          if (f.flags.length && prev.flags.length && f.flags[0].frame !== prev.flags[0].frame) changed.add('flag');
          expect(changed.size).toBeLessThanOrEqual(A.cap.value);
          for (const id of changed) expect(f.ambient.animating, `seed ${seed} wall ${c.wall} ${id} changed while not allowed`).toContain(id);
          n++;
        }
        prev = f;
      }
    }
    expect(n).toBeGreaterThan(20000);
  });

  it('CH1: from the 1/8 pole only the crowd strip animates: the flag frame and animating list', () => {
    for (const seed of seeds(40)) {
      const r = race(seed);
      const ew = eighthWall(r);
      let flagAt: number | null = null;
      for (const { c, f } of frames(seed, 0.05)) {
        if (c.wall < ew + 0.02 || c.wall > winnerWall(r)) continue;
        expect(f.ambient.animating.every((id) => id === 'crowd'), `seed ${seed} wall ${c.wall}`).toBe(true);
        expect(f.ambient.flagFrame).toBe(f.ambient.flagFrame);
        if (flagAt === null) flagAt = f.ambient.flagFrame;
        expect(f.ambient.flagFrame, `seed ${seed} wall ${c.wall}`).toBe(flagAt);
      }
    }
  });
});

describe('CH1: swap rates are in wall time and at most 4 a second', () => {
  /** The wall times each ambient swap happens, from consecutive frames. */
  function swapTimes(fs: { c: Clock; f: RaceFrame }[]): { crowd: number[]; flag: number[] } {
    const crowd: number[] = [];
    const flag: number[] = [];
    for (let i = 1; i < fs.length; i++) {
      const a = fs[i - 1].f.ambient;
      const b = fs[i].f.ambient;
      // A loop going off screen and back resets its count; only a swap while it runs is one.
      if (a.animating.includes('crowd') && b.animating.includes('crowd') && b.crowdSwaps !== a.crowdSwaps) crowd.push(fs[i].c.wall);
      if (a.animating.includes('flag') && b.animating.includes('flag') && b.flagFrame !== a.flagFrame) flag.push(fs[i].c.wall);
    }
    return { crowd, flag };
  }
  // Swaps seen in any second. Frames are `step` apart, so a swap is seen up to one frame late;
  // the window is shortened by two frames so that jitter cannot put a fifth swap inside it.
  const perSecondMax = (times: number[], step: number) => {
    let worst = 0;
    for (let i = 0; i < times.length; i++) {
      const n = times.filter((t) => t > times[i] - (1 - 2 * step) && t <= times[i] + 1e-9).length;
      worst = Math.max(worst, n);
    }
    return worst;
  };

  it('CH1: no loop swaps more than 4 times in any second, at normal speed and at 4x', () => {
    for (const fast of [false, true]) {
      for (const seed of seeds(6)) {
        const fs = frames(seed, 1 / 60, fast);
        const { crowd, flag } = swapTimes(fs);
        // Frames are 1/60 s apart, so one swap each is seen; a frame may merge none.
        expect(perSecondMax(crowd, 1 / 60), `seed ${seed} fast ${fast} crowd`).toBeLessThanOrEqual(4);
        expect(perSecondMax(flag, 1 / 60), `seed ${seed} fast ${fast} flag`).toBeLessThanOrEqual(4);
        expect(crowd.length).toBeGreaterThan(5);
      }
    }
  });

  it('CH1: the crowd swaps about once a second early and about 4 a second from the 1/8 pole, whether or not Space is held', () => {
    for (const fast of [false, true]) {
      const seed = 3;
      const r = race(seed);
      const fs = frames(seed, 1 / 60, fast);
      const ew = fast ? DOORS + r.calls.find((c) => c.furlongsToGo === 1)!.time / 100 / (rd.playback.fastSpeed.value) : eighthWall(r);
      // Swaps per second of the time the crowd is on screen and running, in a window of wall time.
      const rate = (from: number, to: number) => {
        let swaps = 0;
        let seconds = 0;
        for (let i = 1; i < fs.length; i++) {
          const a = fs[i - 1];
          const b = fs[i];
          if (b.c.wall <= from || b.c.wall > to) continue;
          if (!(a.f.ambient.animating.includes('crowd') && b.f.ambient.animating.includes('crowd'))) continue;
          seconds += b.c.wall - a.c.wall;
          if (b.f.ambient.crowdSwaps !== a.f.ambient.crowdSwaps) swaps++;
        }
        expect(seconds, `fast ${fast} window ${from}-${to}`).toBeGreaterThan(1);
        return swaps / seconds;
      };
      const early = rate(ew - 6, ew - 0.05);
      const late = rate(ew + 0.1, ew + 2.1);
      expect(early, `fast ${fast}`).toBeGreaterThanOrEqual(A.crowdSwapsPerSecond.value - 0.5);
      expect(early, `fast ${fast}`).toBeLessThanOrEqual(A.crowdSwapsPerSecond.value + 0.5);
      expect(late, `fast ${fast}`).toBeGreaterThanOrEqual(A.crowdStretchSwapsPerSecond.value - 0.5);
      expect(late, `fast ${fast}`).toBeLessThanOrEqual(A.crowdStretchSwapsPerSecond.value + 0.5);
    }
  });

  it('CH1: 4x does not speed the loops: at the same wall second, before the 1/8 pole, the swaps are the same', () => {
    const seed = 3;
    const r = race(seed);
    const tl = makeTimeline(rd, r.finish[0].time);
    const setup = makeRaceSetup(r, rd, 0, art);
    const me = playerView(setup, 3);
    for (const wall of [6, 8.3, 10.7, 12]) {
      let plain = startClock();
      plain = tick(plain, tl, wall, false);
      let fast = startClock();
      fast = tick(fast, tl, DOORS, false);
      fast = tick(fast, tl, wall - DOORS, true);
      const a = raceFrame(setup, me, plain).ambient;
      const b = raceFrame(setup, me, fast).ambient;
      expect(a.animating.includes('crowd') && b.animating.includes('crowd') ? b.crowdSwaps : 0, `wall ${wall}`).toBe(a.animating.includes('crowd') && b.animating.includes('crowd') ? a.crowdSwaps : 0);
      // The flag counts wall seconds too; whether it is on screen follows the camera, which 4x moves further.
      if (a.animating.includes('flag') && b.animating.includes('flag')) expect(b.flagFrame).toBe(a.flagFrame);
    }
  });

  it('CH1: pause: a clock that is not advanced gives the same ambient frame however long the wall clock runs', () => {
    const r = race(2);
    const tl = makeTimeline(rd, r.finish[0].time);
    const setup = makeRaceSetup(r, rd, 0, art);
    const me = playerView(setup, 3);
    const c = tick(startClock(), tl, 25, false);
    const a = raceFrame(setup, me, c);
    for (let i = 0; i < 5; i++) expect(raceFrame(setup, me, c).ambient).toEqual(a.ambient);
  });
});

describe('CH1: the crowd strip', () => {
  it('CH1: neighbouring crowd tiles are one frame apart and flipped on odd tiles', () => {
    let pairs = 0;
    for (const seed of seeds(8)) {
      for (const { f } of frames(seed, 0.25)) {
        const tiles = [...f.crowdTiles].sort((a, b) => a.x - b.x);
        for (let i = 1; i < tiles.length; i++) {
          if (tiles[i].x - tiles[i - 1].x !== CROWD_W) continue;
          expect(tiles[i].frame).not.toBe(tiles[i - 1].frame);
          expect(tiles[i].flip).not.toBe(tiles[i - 1].flip);
          pairs++;
        }
        for (const t of tiles) expect([0, 1]).toContain(t.frame);
      }
    }
    expect(pairs).toBeGreaterThan(500);
  });

  it('CH1: the crowd stands in the stretch only: its tiles are inside a stretch zone', () => {
    const r = race(1);
    const setup = makeRaceSetup(r, rd, 0, art);
    const stretch = setup.zones.filter((z) => z.kind === 'stretch');
    expect(stretch.length).toBeGreaterThan(0);
    const me = playerView(setup, 2);
    for (const { f } of frames(1, 0.25)) {
      for (const t of f.crowdTiles) {
        const world = t.x + f.midScroll;
        expect(stretch.some((z) => world >= z.from && world < z.to), `tile at world ${world}`).toBe(true);
      }
    }
    expect(me).toBeDefined();
  });
});

describe('CH1: one full infield tile per turn, the slice elsewhere, and the flag on it', () => {
  const turns = (r: RaceResult) => r.replay.course.filter((s) => s.turn);

  it('CH1: the course has a turn zone for each turn piece (three: the gate sits in the last turn), one full tile each', () => {
    expect(turns(race(1))).toHaveLength(3);
    expect(makeRaceSetup(race(1), rd, 0, art).zones.filter((z) => z.kind === 'turn')).toHaveLength(3);
    expect(art.infieldTileWidth).toBe(32);
    expect(art.infieldFillWidth).toBe(16);
  });

  it('CH1: over the whole race exactly one full tile appears per turn, at a fixed place, and the rest of each turn is slice', () => {
    for (const seed of seeds(6)) {
      const r = race(seed);
      const setup = makeRaceSetup(r, rd, 0, art);
      const turnZones = setup.zones.filter((z) => z.kind === 'turn');
      const fullWorld = new Set<number>();
      const sliceWorld = new Set<number>();
      for (const { f } of frames(seed, 0.1)) {
        let fullHere = 0;
        for (const t of f.infieldTiles) {
          const world = t.x + f.midScroll;
          if (t.full) { fullWorld.add(world); fullHere++; }
          else sliceWorld.add(world);
          expect(turnZones.some((z) => world >= z.from - INFIELD_W && world < z.to), `seed ${seed} tile at world ${world}`).toBe(true);
        }
        expect(fullHere).toBeLessThanOrEqual(turnZones.length);
      }
      expect(fullWorld.size, `seed ${seed}`).toBe(turnZones.length);
      for (const z of turnZones) expect([...fullWorld].some((w) => w >= z.from && w < z.to), `seed ${seed} zone ${z.from}`).toBe(true);
      expect(sliceWorld.size).toBeGreaterThan(0);
    }
  });

  it('CH1: the full tile sits on its zone\'s tile grid, in the middle (the zone and the helper agree)', () => {
    const setup = makeRaceSetup(race(1), rd, 0, art);
    for (const z of setup.zones.filter((q) => q.kind === 'turn')) {
      const at = fullTileAt(z, INFIELD_W);
      expect(at).toBeGreaterThanOrEqual(z.from);
      expect(at + INFIELD_W).toBeLessThanOrEqual(z.to + INFIELD_W);
      expect((at - z.from) % INFIELD_W).toBe(0);
      expect(Math.abs(at + INFIELD_W / 2 - (z.from + z.to) / 2)).toBeLessThanOrEqual(INFIELD_W);
    }
  });

  it('CH1: the flag is attached to the full tile at the slot\'s attachAt, in the turns only', () => {
    let seen = 0;
    const [ax, ay] = art.flagAt!;
    expect([ax, ay]).toEqual([24, 3]);
    for (const seed of seeds(6)) {
      for (const { f } of frames(seed, 0.1)) {
        const fulls = f.infieldTiles.filter((t) => t.full).filter((t) => t.x + ax + art.flagWidth! > 0 && t.x + ax < 256);
        expect(f.flags.length, `seed ${seed}`).toBe(fulls.length);
        for (const flag of f.flags) {
          const host = f.infieldTiles.find((t) => t.full && t.x + ax === flag.x);
          expect(host, `flag at ${flag.x}`).toBeDefined();
          expect(flag.y).toBe(56 + ay); // the mid layer's top row plus attachAt
          expect([0, 1]).toContain(flag.frame);
          seen++;
        }
      }
    }
    expect(seen).toBeGreaterThan(50);
  });

  it('CH1: the flag swaps every 0.4 s while it flies before the 1/8 pole', () => {
    // Find a stretch of frames with a flag on screen well before the 1/8 pole and count swaps.
    const seed = 3;
    const r = race(seed);
    const fs = frames(seed, 1 / 60).filter((x) => x.c.wall < eighthWall(r) && x.f.flags.length > 0);
    expect(fs.length).toBeGreaterThan(60);
    const swaps: number[] = [];
    for (let i = 1; i < fs.length; i++) if (fs[i].f.flags[0].frame !== fs[i - 1].f.flags[0].frame && Math.abs(fs[i].c.wall - fs[i - 1].c.wall) < 0.05) swaps.push(fs[i].c.wall);
    expect(swaps.length).toBeGreaterThan(3);
    let close = 0;
    for (let i = 1; i < swaps.length; i++) {
      if (swaps[i] - swaps[i - 1] > 2) continue; // the flag went off screen and came back
      expect(Math.abs(swaps[i] - swaps[i - 1] - 0.4)).toBeLessThan(0.04);
      close++;
    }
    expect(close).toBeGreaterThan(2);
  });
});

describe('CH1: each mid-layer pixel belongs to one zone\'s art', () => {
  // WAITING ON THE ENGINEER (round three ruling): where a stretch zone and a turn zone would
  // overlap, the stretch wins and the turn's art is clipped. Today the grandstand and the
  // infield tiles overlap near each stretch end, the gate frames included. This reads the
  // frame's tile lists; if the fix clips by adding a field to the infield tiles, this test
  // should be taught that field.
  const spans = (f: RaceFrame) => ({
    stretch: [
      ...f.standXs.map((x) => [x, x + art.standTileWidth] as const),
      ...f.crowdTiles.map((t) => [t.x, t.x + CROWD_W] as const),
    ],
    turn: f.infieldTiles.map((t) => [t.x, t.x + (t.full ? INFIELD_W : FILL_W)] as const),
  });
  const overlap = (a: readonly [number, number], b: readonly [number, number]) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]);

  it('CH1: no screen column is covered by both a stretch tile and a turn tile, from the gate to the end of the beat', () => {
    const bad: string[] = [];
    for (const seed of seeds(8)) {
      for (const { c, f } of frames(seed, 0.1)) {
        const { stretch, turn } = spans(f);
        for (const s of stretch) for (const t of turn) if (overlap(s, t) > 0) bad.push(`seed ${seed} wall ${c.wall.toFixed(1)} stretch ${s} turn ${t}`);
      }
    }
    expect(bad.slice(0, 4), `${bad.length} overlapping frames`).toEqual([]);
  });

  it('CH1: at the gate in particular', () => {
    const r = race(0);
    const setup = makeRaceSetup(r, rd, 0, art);
    const f = raceFrame(setup, playerView(setup, 1), 0);
    const { stretch, turn } = spans(f);
    for (const s of stretch) for (const t of turn) expect(overlap(s, t), `stretch ${s} turn ${t}`).toBeLessThanOrEqual(0);
  });

  it('CH1: the zones themselves can overlap by design, which is why the stretch must win', () => {
    const setup = makeRaceSetup(race(1), rd, 0, art);
    const m = setup.zones;
    expect(m.some((a) => a.kind === 'stretch' && m.some((b) => b.kind === 'turn' && Math.min(a.to, b.to) - Math.max(a.from, b.from) > 0))).toBe(true);
    expect(midZones(setup.model)).toEqual(setup.zones);
    expect(zoneTiles({ kind: 'turn', from: 100, to: 164 }, 0, 32)).toEqual([{ x: 100, k: 0 }, { x: 132, k: 1 }]);
    expect(zoneTiles({ kind: 'turn', from: 100, to: 164 }, 20, 32)).toEqual([{ x: 80, k: 0 }, { x: 112, k: 1 }]);
  });
});
