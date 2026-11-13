import { describe, expect, it } from 'vitest';
import { MINIMAP_H, MINIMAP_W, lanePush, minimapDot, minimapGeometry, minimapWire } from './minimap';
import { cfg, game, race, raceDistanceOf, seeds } from './testkit';
import { horsesAt } from './view';

// The mini map, spec 4.3 and criterion H2: whole numbers inside the 88x40 box, the wire
// at the right end of the bottom straight, horses running counterclockwise.

const g = minimapGeometry(game.track);
const LAP = game.track.lapFeet.value; // 5280
const D = 6600 * 100; // the shipped 10 furlong race, hundredths of a foot
const LANE_MAX = game.tuning.laneMax.value;
const CX = MINIMAP_W / 2;

/** The dot's center, which is how the map reads. */
const center = (d: { x: number; y: number }) => ({ x: d.x + 1, y: d.y + 1 });

describe('H2: mini map positions', () => {
  it('H2: the box is 88x40', () => {
    expect(MINIMAP_W).toBe(88);
    expect(MINIMAP_H).toBe(40);
  });

  it('H2: the oval fits the box with a straight and two turns', () => {
    expect(g.left).toBeGreaterThanOrEqual(0);
    expect(g.right).toBeLessThanOrEqual(MINIMAP_W);
    expect(g.right).toBeGreaterThan(g.left);
    expect(g.cy).toBe(20);
  });

  it('H2: a longer straight in the track data gives a longer straight on the map, never past the box', () => {
    const base = structuredClone(game.track);
    const short = minimapGeometry({ ...base, stretchFeet: { ...base.stretchFeet, value: 300 } });
    const mid = minimapGeometry({ ...base, stretchFeet: { ...base.stretchFeet, value: 600 } });
    const long = minimapGeometry({ ...base, stretchFeet: { ...base.stretchFeet, value: 3000 } });
    const len = (m: typeof short) => m.right - m.left;
    expect(len(short)).toBeLessThan(len(mid));
    expect(len(mid)).toBeLessThanOrEqual(len(long));
    for (const m of [short, mid, long]) {
      expect(m.left).toBeGreaterThanOrEqual(0);
      expect(m.right).toBeLessThanOrEqual(MINIMAP_W);
    }
  });

  it('H2: every position, for every lane and every distance round a lap, is whole and inside the box', () => {
    for (const lane of [0, 100, 450, LANE_MAX * 100]) {
      for (const yours of [false, true]) {
        for (let q = 0; q <= 2 * LAP; q += 17) {
          const dot = minimapDot(g, D + q * 100, D, lane, LANE_MAX, yours);
          const label = `lane ${lane} yours ${yours} q ${q}`;
          expect(Number.isInteger(dot.x) && Number.isInteger(dot.y), label).toBe(true);
          // The 2x2 dot sits wholly in the box; your 3x3 ring needs one more pixel around it.
          const pad = yours ? 1 : 0;
          expect(dot.x, label).toBeGreaterThanOrEqual(pad);
          expect(dot.y, label).toBeGreaterThanOrEqual(pad);
          expect(dot.x + 2, label).toBeLessThanOrEqual(MINIMAP_W - pad);
          expect(dot.y + 2, label).toBeLessThanOrEqual(MINIMAP_H - pad);
        }
      }
    }
  });

  it('H2: the same for the horses of real races at real times, laps before the start included', () => {
    for (const seed of seeds(10)) {
      const r = race(seed);
      for (let t = 0; t <= 12300; t += 53) {
        for (const h of horsesAt(r, cfg, t)) {
          const dot = minimapDot(g, h.distance, raceDistanceOf(r), h.lane, LANE_MAX);
          expect(Number.isInteger(dot.x) && Number.isInteger(dot.y)).toBe(true);
          expect(dot.x).toBeGreaterThanOrEqual(0);
          expect(dot.x + 2).toBeLessThanOrEqual(MINIMAP_W);
          expect(dot.y).toBeGreaterThanOrEqual(0);
          expect(dot.y + 2).toBeLessThanOrEqual(MINIMAP_H);
        }
      }
    }
  });

  it('H2: the wire is the right end of the bottom straight', () => {
    const c = center(minimapDot(g, D, D, 0, LANE_MAX));
    expect(c.x).toBeGreaterThanOrEqual(g.right - 1);
    expect(c.x).toBeLessThanOrEqual(g.right + 1);
    expect(c.y).toBeGreaterThan(g.cy + 12); // the bottom band, rows 36 to 39
    const wire = minimapWire(g);
    expect(wire.h).toBe(3); // a 1x3 tick
    expect(wire.x).toBeGreaterThanOrEqual(g.right - 2);
    expect(wire.x).toBeLessThanOrEqual(g.right + 1);
    expect(wire.y).toBeGreaterThanOrEqual(g.cy + 12);
    expect(wire.y + wire.h).toBeLessThanOrEqual(MINIMAP_H);
  });

  it('H2: a horse at the wire is on the wire tick, and 50 feet short of it is left of it, on the same straight', () => {
    const atWire = center(minimapDot(g, D, D, 0, LANE_MAX));
    const before = center(minimapDot(g, D - 5000, D, 0, LANE_MAX));
    expect(before.y).toBe(atWire.y);
    expect(before.x).toBeLessThan(atWire.x);
  });

  it('H2: the stretch is the bottom straight, running right; the backstretch is the top straight, running left', () => {
    const stretchStart = center(minimapDot(g, D - game.track.stretchFeet.value * 100, D, 0, LANE_MAX));
    const stretchEnd = center(minimapDot(g, D, D, 0, LANE_MAX));
    expect(stretchStart.x).toBeLessThan(CX);
    expect(stretchEnd.x).toBeGreaterThan(CX);
    expect(stretchStart.y).toBeGreaterThan(g.cy);
    // Backstretch midpoint, counted from the wire: first turn, then half the back.
    const midBack = center(minimapDot(g, D + (game.track.turnFeet.value + game.track.backstretchFeet.value / 2) * 100, D, 0, LANE_MAX));
    expect(midBack.y).toBeLessThan(g.cy);
    expect(Math.abs(midBack.x - CX)).toBeLessThanOrEqual(2);
  });

  it('H2: positions advance counterclockwise round a whole lap, for every lane', () => {
    for (const lane of [0, 400, LANE_MAX * 100]) {
      let prev: number | null = null;
      let total = 0;
      const stepFeet = 40;
      for (let q = 0; q <= LAP; q += stepFeet) {
        const c = center(minimapDot(g, D + q * 100, D, lane, LANE_MAX));
        // Screen y points down, so flip it to read the angle the usual way round.
        const angle = Math.atan2(-(c.y - g.cy), c.x - CX);
        if (prev !== null) {
          let delta = angle - prev;
          while (delta > Math.PI) delta -= 2 * Math.PI;
          while (delta < -Math.PI) delta += 2 * Math.PI;
          expect(delta, `lane ${lane} q ${q}`).toBeGreaterThan(-0.06); // rounding to pixels may stall a step, never reverse it
          total += delta;
        }
        prev = angle;
      }
      expect(total).toBeGreaterThan(2 * Math.PI - 0.3);
      expect(total).toBeLessThan(2 * Math.PI + 0.3);
    }
  });

  it('H2: it is one closed loop: a lap later is the same place', () => {
    for (const q of [0, 1000, 2500, 4000]) {
      expect(minimapDot(g, D + (q + LAP) * 100, D, 200, LANE_MAX)).toEqual(minimapDot(g, D + q * 100, D, 200, LANE_MAX));
    }
  });

  it('H2: a higher lane sits 0 to 2 px further out than the rail lane, on the straights and the turns', () => {
    const pushed = (distFeet: number, axis: 'x' | 'y') => {
      const lo = center(minimapDot(g, D + distFeet * 100, D, 0, LANE_MAX));
      const hi = center(minimapDot(g, D + distFeet * 100, D, LANE_MAX * 100, LANE_MAX));
      return axis === 'y' ? [lo.y, hi.y] : [lo.x, hi.x];
    };
    // Bottom straight: out is down. Top straight: out is up.
    const [bottomLo, bottomHi] = pushed(-600, 'y');
    expect(bottomHi - bottomLo).toBeGreaterThanOrEqual(1);
    expect(bottomHi - bottomLo).toBeLessThanOrEqual(2);
    const midBack = game.track.turnFeet.value + game.track.backstretchFeet.value / 2;
    const [topLo, topHi] = pushed(midBack, 'y');
    expect(topLo - topHi).toBeGreaterThanOrEqual(1);
    expect(topLo - topHi).toBeLessThanOrEqual(2);
    // Right turn at its middle: out is to the right.
    const [rightLo, rightHi] = pushed(game.track.turnFeet.value / 2, 'x');
    expect(rightHi - rightLo).toBeGreaterThanOrEqual(1);
    expect(rightHi - rightLo).toBeLessThanOrEqual(2);
  });

  it('H2: lanePush is 0 at the rail, 2 at the widest lane, never outside 0 to 2', () => {
    expect(lanePush(0, LANE_MAX)).toBe(0);
    expect(lanePush(LANE_MAX * 100, LANE_MAX)).toBe(2);
    for (let lane = -50; lane < 1200; lane += 7) {
      const p = lanePush(lane, LANE_MAX);
      expect(Number.isInteger(p) && p >= 0 && p <= 2).toBe(true);
    }
    expect(lanePush(300, 0)).toBe(0);
  });
});
