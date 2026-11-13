import { describe, expect, it } from 'vitest';
import type { RaceResult } from '../sim/result';
import { ambientState, fullTileAt, midZones, swapsAt, turnArt, zoneTiles, type AmbientId, type MidZone } from './ambient';
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
  // Where a stretch zone and a turn zone would overlap, the stretch wins and the turn's art
  // is clipped (CH1). Round four: the last slice is now cropped to fit instead of dropped, so
  // an infield piece is no longer always 16 px (a slice) or 32 px (the full tile). Each piece
  // is measured by its own width, `width`, drawn from `srcX`, covering screen x to x + width - 1.
  const spans = (f: RaceFrame) => ({
    stretch: [
      ...f.standXs.map((x) => [x, x + art.standTileWidth] as const),
      ...f.crowdTiles.map((t) => [t.x, t.x + CROWD_W] as const),
    ],
    turn: f.infieldTiles.map((t) => [t.x, t.x + t.width] as const),
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

  it('CH1: at the gate for the whole gate beat, seed 1 pick 1, no column is covered twice', () => {
    const r = race(1);
    const setup = makeRaceSetup(r, rd, 0, art);
    const me = playerView(setup, 1);
    for (let p = 0; p < setup.timeline.doorsAt; p += 0.25) {
      const { stretch, turn } = spans(raceFrame(setup, me, p));
      for (const s of stretch) for (const t of turn) expect(overlap(s, t), `p ${p} stretch ${s} turn ${t}`).toBeLessThanOrEqual(0);
    }
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

describe('CH1: no hole where a turn\'s art meets a stretch\'s', () => {
  // The rule's other half: the turn's art is clipped at the first pixel the stand covers, so
  // nothing between the two zones is left empty. Only the zones can say where art is due, so
  // the test works in mid-layer columns: a screen column c is mid column c + midScroll.
  //  - Due a turn tile: a column inside a turn zone and outside every stretch's extent.
  //  - Due a stand tile: a column inside a stretch's extent (laid from the zone's start in
  //    whole stand tiles, the last running past the zone's end).
  // Columns in no zone at all are not due anything and are skipped. That is the region left of
  // the gate behind the start, and the backstretch, which has no zone art until step 6. A hole
  // is a due column nothing covers, so those known-empty regions cannot be mistaken for one.
  const STAND_W = art.standTileWidth;
  const extent = (z: { from: number; to: number }) => ({ from: z.from, to: z.to === Infinity ? Infinity : z.from + Math.ceil((z.to - z.from) / STAND_W) * STAND_W });

  function holes(seed: number, post = 1): { bad: string[]; meeting: number; frames: number } {
    const r = race(seed);
    const tl = makeTimeline(rd, r.finish[0].time);
    const setup = makeRaceSetup(r, rd, 0, art);
    const me = playerView(setup, post);
    const turnZones = setup.zones.filter((z) => z.kind === 'turn');
    const stands = setup.zones.filter((z) => z.kind === 'stretch').map(extent);
    const bad: string[] = [];
    let meeting = 0;
    let n = 0;
    let c = startClock();
    let afterDone = 0;
    while (afterDone < 4) {
      c = tick(c, tl, 0.1, false);
      if (phaseOf(c) === 'done') afterDone += 0.1;
      const f = raceFrame(setup, me, c);
      n++;
      const stand = new Array<boolean>(256).fill(false);
      const turn = new Array<boolean>(256).fill(false);
      for (const x of f.standXs) for (let i = Math.max(0, x); i < Math.min(256, x + STAND_W); i++) stand[i] = true;
      for (const t of f.infieldTiles) for (let i = Math.max(0, t.x); i < Math.min(256, t.x + t.width); i++) turn[i] = true;
      for (let col = 0; col < 256; col++) {
        const m = col + f.midScroll;
        const inStand = stands.some((z) => m >= z.from && m < z.to);
        const inTurn = turnZones.some((z) => m >= z.from && m < z.to);
        if (inStand && !stand[col]) bad.push(`seed ${seed} wall ${c.wall.toFixed(1)} col ${col}: stand column uncovered`);
        if (inTurn && !inStand && !turn[col]) bad.push(`seed ${seed} wall ${c.wall.toFixed(1)} col ${col}: turn column uncovered`);
        if (inStand && turn[col]) bad.push(`seed ${seed} wall ${c.wall.toFixed(1)} col ${col}: covered by both`);
        // Count the columns where the two zones meet on screen, so the test knows it saw one.
        if (col > 0 && ((inStand && !stands.some((z) => m - 1 >= z.from && m - 1 < z.to) && turnZones.some((z) => m - 1 >= z.from && m - 1 < z.to)) || (!inStand && inTurn && stands.some((z) => m - 1 >= z.from && m - 1 < z.to)))) meeting++;
      }
    }
    return { bad, meeting, frames: n };
  }

  it('CH1: over many seeds, gate to done screen, every column due art is covered once and none is left empty', () => {
    let meetings = 0;
    let frames = 0;
    for (const seed of seeds(12)) {
      for (const post of [1, 6]) {
        const h = holes(seed, post);
        expect(h.bad.slice(0, 3), `seed ${seed} post ${post}: ${h.bad.length} bad columns`).toEqual([]);
        meetings += h.meeting;
        frames += h.frames;
      }
    }
    expect(frames).toBeGreaterThan(24 * 600);
    // The test did see zones meet (at the gate, among others), so it is not passing on nothing.
    expect(meetings).toBeGreaterThan(500);
  });

  it('CH1: the gate beat of seed 1, pick 1, has no bare strip between hedge and stand', () => {
    const r = race(1);
    const setup = makeRaceSetup(r, rd, 0, art);
    const f = raceFrame(setup, playerView(setup, 1), 2);
    const covered = new Array<boolean>(256).fill(false);
    for (const x of f.standXs) for (let i = Math.max(0, x); i < Math.min(256, x + STAND_W); i++) covered[i] = true;
    for (const t of f.infieldTiles) for (let i = Math.max(0, t.x); i < Math.min(256, t.x + t.width); i++) covered[i] = true;
    const stands = setup.zones.filter((z) => z.kind === 'stretch').map(extent);
    const firstStandCol = f.standXs.length ? Math.max(0, Math.min(...f.standXs)) : 256;
    // Walk left from the first stand column to the hedge: there is no uncovered column in between,
    // down to where the turn zone itself begins (the start line).
    let col = firstStandCol - 1;
    let run = 0;
    while (col >= 0 && !covered[col] && stands.every((z) => col + f.midScroll < z.from || col + f.midScroll >= z.to)) {
      run++;
      col--;
    }
    expect(run, 'bare columns left of the first stand column').toBe(0);
  });
});

describe('CH1: the infield pieces', () => {
  const pieces = (seed: number) => frames(seed, 0.2).flatMap(({ f }) => f.infieldTiles.map((t) => ({ t, f })));

  it('CH1: every piece has whole-pixel x, srcX and width, and srcX + width inside its slot', () => {
    let n = 0;
    for (const seed of seeds(8)) {
      for (const { t } of pieces(seed)) {
        expect(Number.isInteger(t.x) && Number.isInteger(t.srcX) && Number.isInteger(t.width), JSON.stringify(t)).toBe(true);
        expect(t.srcX).toBeGreaterThanOrEqual(0);
        expect(t.width).toBeGreaterThan(0);
        expect(t.srcX + t.width, JSON.stringify(t)).toBeLessThanOrEqual(t.full ? INFIELD_W : FILL_W);
        n++;
      }
    }
    expect(n).toBeGreaterThan(500);
  });

  it('CH1: a cropped piece is never the full tile with the pole: the full tile is always whole', () => {
    let fulls = 0;
    let cropped = 0;
    for (const seed of seeds(8)) {
      for (const { t } of pieces(seed)) {
        if (t.full) {
          expect([t.srcX, t.width], `seed ${seed}`).toEqual([0, INFIELD_W]);
          fulls++;
        } else if (t.width < FILL_W) cropped++;
      }
    }
    expect(fulls).toBeGreaterThan(10);
    expect(cropped).toBeGreaterThan(0); // the course does crop a slice at a stand
  });

  it('CH1: whole slices are srcX 0 and 16 wide; a cropped slice touches the stand it was cropped for', () => {
    for (const seed of seeds(8)) {
      for (const { t, f } of pieces(seed)) {
        if (t.full || t.width === FILL_W) {
          if (!t.full) expect(t.srcX).toBe(0);
          continue;
        }
        // A left-cropped piece (srcX > 0) starts where a stand ends; a right-cropped one (srcX 0)
        // ends where a stand starts. A crop edge off screen has its stand off screen too.
        if (t.srcX > 0) {
          expect(t.srcX + t.width, `seed ${seed} piece ${JSON.stringify(t)}`).toBe(FILL_W);
          if (t.x > 0) expect(f.standXs.some((sx) => sx + art.standTileWidth === t.x), `seed ${seed} piece ${JSON.stringify(t)} stands ${f.standXs}`).toBe(true);
        } else if (t.x + t.width < 256) {
          expect(f.standXs.some((sx) => sx === t.x + t.width), `seed ${seed} piece ${JSON.stringify(t)} stands ${f.standXs}`).toBe(true);
        }
      }
    }
  });

  it('CH1: the flag still sits on a full, uncropped tile', () => {
    let flags = 0;
    const [ax] = art.flagAt!;
    for (const seed of seeds(8)) {
      for (const { f } of frames(seed, 0.2)) {
        for (const flag of f.flags) {
          const host = f.infieldTiles.find((t) => t.full && t.x + ax === flag.x);
          expect(host, `flag at ${flag.x}`).toBeDefined();
          expect([host!.srcX, host!.width]).toEqual([0, INFIELD_W]);
          flags++;
        }
      }
    }
    expect(flags).toBeGreaterThan(30);
  });
});

describe('CH1: turnArt on made-up zones (stand 32 wide, slice 16, full tile 32)', () => {
  const turn: MidZone = { kind: 'turn', from: 0, to: 64 };
  const stretch = (from: number, to: number): MidZone => ({ kind: 'stretch', from, to });

  it('with no stand every slice is whole, and one full tile sits on the 32 px grid', () => {
    const t = turnArt(turn, [], 32, 16, 32);
    expect(t.fills).toEqual([0, 16, 32, 48].map((x) => ({ x, srcX: 0, w: 16 })));
    expect(t.full === 0 || t.full === 32).toBe(true);
  });

  it('a stand starting inside a slice crops that slice to the columns before it, and drops what lies under the stand', () => {
    const t = turnArt(turn, [stretch(40, Infinity)], 32, 16, 32);
    expect(t.fills).toEqual([{ x: 0, srcX: 0, w: 16 }, { x: 16, srcX: 0, w: 16 }, { x: 32, srcX: 0, w: 8 }]);
    // Nothing is covered twice and nothing between is left empty: 0..39 all drawn.
    expect(t.fills.reduce((n, f) => n + f.w, 0)).toBe(40);
  });

  it('a stand ending inside a slice crops that slice to the columns after it, from the right srcX', () => {
    // Extent: from -100 in whole 32 px tiles: 5 tiles, to 60.
    const t = turnArt(turn, [stretch(-100, 40)], 32, 16, 32);
    expect(t.fills).toEqual([{ x: 60, srcX: 12, w: 4 }]);
    expect(t.full).toBeNull();
  });

  it('a cropped slice never carries the full tile: when only a cropped slice is left beside a whole one there is no full tile', () => {
    const t = turnArt(turn, [stretch(24, Infinity)], 32, 16, 32);
    expect(t.fills).toEqual([{ x: 0, srcX: 0, w: 16 }, { x: 16, srcX: 0, w: 8 }]);
    expect(t.full).toBeNull();
  });

  it('a stand covering the whole turn leaves nothing', () => {
    const t = turnArt(turn, [stretch(-32, Infinity)], 32, 16, 32);
    expect(t.fills).toEqual([]);
    expect(t.full).toBeNull();
  });
});
