import { describe, expect, it } from 'vitest';
import raceDayJson from '../data/raceDay.json';
import { loadHub } from '../data/hubLoad';
import { rd } from './betKit';
import { hubPointerTargets } from './hubScreen';
import { gridPoint, hitTest, pointerBlur, pointerDown, pointerMove, pointerState, pointerTick, pointerUp, type GridPoint, type PointerTarget } from './pointer';
import { initialProgramState, programPointerTargets } from './programScreen';
import { resultPointerTargets } from './resultScreen';

// The pointer maths of docs/specs/track-hub.md section 6: TH2's grid mapping, TH3's hit test
// and TH11's click rule.

describe('gridPoint (TH2)', () => {
  const rect = { left: 40, top: 12 };

  it.each([1, 2, 3, 4])('zoom %i: floor((client - rect) / zoom)', (zoom) => {
    expect(gridPoint(40, 12, rect, zoom)).toEqual({ x: 0, y: 0 });
    expect(gridPoint(40 + zoom - 1, 12 + zoom - 1, rect, zoom)).toEqual({ x: 0, y: 0 });
    expect(gridPoint(40 + zoom, 12 + zoom, rect, zoom)).toEqual({ x: 1, y: 1 });
    expect(gridPoint(40 + 100 * zoom + 0.5, 12 + 37 * zoom, rect, zoom)).toEqual({ x: 100, y: 37 });
    expect(gridPoint(40 + 256 * zoom - 1, 12 + 240 * zoom - 1, rect, zoom)).toEqual({ x: 255, y: 239 });
  });

  it.each([1, 2, 3, 4])('zoom %i: the letterbox is null', (zoom) => {
    expect(gridPoint(39, 50, rect, zoom)).toBeNull();
    expect(gridPoint(100, 11, rect, zoom)).toBeNull();
    expect(gridPoint(40 + 256 * zoom, 50, rect, zoom)).toBeNull();
    expect(gridPoint(100, 12 + 240 * zoom, rect, zoom)).toBeNull();
  });

  it('after a resize from 3x to 2x the same grid point maps to the same target', () => {
    const targets: PointerTarget[] = [{ id: 'fans', box: { x0: 112, y0: 90, x1: 159, y1: 139 } }, { id: 'rail', box: { x0: 160, y0: 90, x1: 255, y1: 139 } }];
    const at3 = { left: 0, top: 0 };
    const at2 = { left: 128, top: 120 }; // centered in the same window
    expect(hitTest(targets, gridPoint(159 * 3 + 2, 100 * 3, at3, 3))).toBe('fans');
    expect(hitTest(targets, gridPoint(128 + 159 * 2 + 1, 120 + 100 * 2, at2, 2))).toBe('fans');
    expect(hitTest(targets, gridPoint(128 + 160 * 2, 120 + 100 * 2, at2, 2))).toBe('rail');
  });

  it('refuses a zoom that is not a whole number of 1 or more', () => {
    expect(() => gridPoint(0, 0, { left: 0, top: 0 }, 1.5)).toThrow();
    expect(() => gridPoint(0, 0, { left: 0, top: 0 }, 0)).toThrow();
  });
});

describe('hitTest (TH3)', () => {
  const targets: PointerTarget[] = [{ id: 'a', box: { x0: 10, y0: 20, x1: 25, y1: 35 } }, { id: 'b', box: { x0: 26, y0: 20, x1: 41, y1: 35 } }];

  it('every point inside a box, edges included, returns that target; every point outside returns none', () => {
    for (let y = 0; y < 60; y++) {
      for (let x = 0; x < 60; x++) {
        const want = y >= 20 && y <= 35 ? (x >= 10 && x <= 25 ? 'a' : x >= 26 && x <= 41 ? 'b' : null) : null;
        expect(hitTest(targets, { x, y }), `${x},${y}`).toBe(want);
      }
    }
  });

  it('a letterbox point (null) hits nothing', () => {
    expect(hitTest(targets, null)).toBeNull();
  });
});

describe('the click rule (TH11)', () => {
  const press = (down: string | null, up: string | null, button = 0) => pointerUp(pointerDown(pointerState(), button, down), button, up).act;

  it('acts on the primary release over the target it went down on', () => {
    expect(press('a', 'a')).toBe('a');
  });

  it('a release elsewhere cancels', () => {
    expect(press('a', 'b')).toBeNull();
    expect(press('a', null)).toBeNull();
  });

  it('right and middle buttons do nothing', () => {
    expect(press('a', 'a', 2)).toBeNull();
    expect(press('a', 'a', 1)).toBeNull();
  });

  it('a press on nothing or the letterbox does nothing', () => {
    expect(press(null, 'a')).toBeNull();
    expect(press(null, null)).toBeNull();
  });

  it('a release with no press on this screen does nothing (the screen before\'s press never lands here)', () => {
    expect(pointerUp(pointerState(), 0, 'a').act).toBeNull();
  });

  it('a cancelled press is over: the next release on the target does nothing', () => {
    const s1 = pointerUp(pointerDown(pointerState(), 0, 'a'), 0, 'b').state;
    expect(pointerUp(s1, 0, 'a').act).toBeNull();
  });

  it('a right button release in the middle of a primary press does not end it', () => {
    let s = pointerDown(pointerState(), 0, 'a');
    s = pointerUp(s, 2, 'a').state;
    expect(pointerUp(s, 0, 'a').act).toBe('a');
  });

  it('blur forgets a half-made click and the hover', () => {
    const pressed = pointerDown(pointerMove(pointerState(), 'a').state, 0, 'a');
    expect(pressed).toEqual({ hover: 'a', down: 'a' });
    const s = pointerBlur();
    expect(pointerUp(s, 0, 'a').act).toBeNull();
    expect(s.hover).toBeNull();
  });
});

describe('hover', () => {
  it('moving into a target enters it; moving within it or out of all targets enters nothing', () => {
    let r = pointerMove(pointerState(), 'a');
    expect(r.entered).toBe('a');
    r = pointerMove(r.state, 'a');
    expect(r.entered).toBeNull();
    r = pointerMove(r.state, null);
    expect(r.entered).toBeNull();
    r = pointerMove(r.state, 'a');
    expect(r.entered).toBe('a');
    r = pointerMove(r.state, 'b');
    expect(r.entered).toBe('b');
  });
});

describe('the arrival guard (section 6): presses are ignored for a short time after a screen arrives', () => {
  const GUARD = raceDayJson.pointer.arrivalGuardSeconds.value;
  const hub = loadHub();
  const k = { horses: 8, ready: true, offered: [2, 5, 10, 20], lastDollars: null };
  // A point on a target of each screen: the track's "Just watch" row, program entry 3, the result's action line.
  const screens: [string, PointerTarget[], GridPoint, string][] = [
    ['track', hubPointerTargets(hub), { x: 100, y: 224 }, 'rail'],
    ['program', programPointerTargets(rd, initialProgramState(), k), { x: 60, y: 100 }, 'entry:3'],
    ['result', resultPointerTargets(), { x: 100, y: 224 }, 'next'],
  ];
  const clickAt = (s: ReturnType<typeof pointerState>, targets: PointerTarget[], p: GridPoint) => {
    const id = hitTest(targets, p);
    return pointerUp(pointerDown(s, 0, id), 0, id);
  };

  // Raised from 0.4 on the reviewer's note: the usual double-click window is 500 ms.
  it('the guard is 0.5 s in data, a starting guess', () => {
    expect(GUARD).toBe(0.5);
    expect(raceDayJson.pointer.arrivalGuardSeconds.status).toBe('starting guess');
  });

  it.each(screens)('%s: a press and release right after arrival does nothing', (_name, targets, p) => {
    expect(clickAt(pointerState(GUARD), targets, p).act).toBeNull();
    expect(clickAt(pointerTick(pointerState(GUARD), GUARD - 0.01), targets, p).act).toBeNull();
  });

  it.each(screens)('%s: the same press after the guard acts', (_name, targets, p, want) => {
    expect(clickAt(pointerTick(pointerState(GUARD), GUARD), targets, p).act).toBe(want);
    expect(clickAt(pointerTick(pointerTick(pointerState(GUARD), GUARD / 2), GUARD / 2), targets, p).act).toBe(want);
  });

  it('a press made during the guard does not act when released after it', () => {
    const pressed = pointerDown(pointerState(GUARD), 0, 'a');
    expect(pointerUp(pointerTick(pressed, 1), 0, 'a').act).toBeNull();
  });

  it('hover still moves focus during the guard', () => {
    expect(pointerMove(pointerState(GUARD), 'a').entered).toBe('a');
  });

  it('blur does not end the guard', () => {
    const s = pointerBlur(pointerTick(pointerState(GUARD), 0.1));
    expect(clickAt(s, [{ id: 'a', box: { x0: 0, y0: 0, x1: 9, y1: 9 } }], { x: 1, y: 1 }).act).toBeNull();
  });

  it('with no guard, the state is as before', () => {
    expect(pointerState()).toEqual({ hover: null, down: null });
    expect(pointerTick(pointerState(GUARD), 5)).toEqual({ hover: null, down: null });
  });
});
