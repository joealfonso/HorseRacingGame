import { describe, expect, it } from 'vitest';
import { loadHub } from '../data/hubLoad';
import { hubClick, hubHover, hubKey, hubPointerTargets, initialHubState, type HubKeyContext, type HubState } from './hubScreen';
import { gridPoint, hitTest, pointerBlur, pointerDown, pointerMove, pointerState, pointerUp, type PointerState } from './pointer';

// Written from docs/specs/track-hub.md section 6 and TH2, TH3, TH11. Expected boxes are the
// spec's section 4 table, typed out here, not read from the code.

const hub = loadHub();
const targets = hubPointerTargets(hub);

type B = [number, number, number, number];
const BOXES: [string, B][] = [
  ['windows', [0, 96, 111, 175]],
  ['rail', [160, 90, 255, 139]],
  ['regular', [0, 24, 111, 95]],
  ['board', [124, 32, 251, 87]],
  ['fans', [112, 90, 159, 139]],
  ['bugler', [112, 140, 159, 175]],
  ['snackCart', [160, 140, 255, 175]],
  // The two door rows in the box act as their doors (section 4 table, section 6 table).
  ['windows', [8, 208, 247, 219]],
  ['rail', [8, 220, 247, 231]],
];
const expectedAt = (x: number, y: number): string | null => {
  for (const [id, [x0, y0, x1, y1]] of BOXES) if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return id;
  return null;
};

describe('TH2: the grid mapping', () => {
  it.each([1, 2, 3, 4])('zoom %i: floor((client - rect) / zoom) on each axis', (zoom) => {
    const rect = { left: 37, top: 11 };
    for (const [gx, gy] of [[0, 0], [1, 1], [100, 77], [159, 120], [160, 120], [255, 239]]) {
      for (let off = 0; off < zoom; off++) {
        expect(gridPoint(rect.left + gx * zoom + off, rect.top + gy * zoom + off, rect, zoom), `${gx},${gy}+${off}`).toEqual({ x: gx, y: gy });
      }
    }
  });

  it('fractional rect edges still floor', () => {
    expect(gridPoint(100.4 + 3 * 2 + 1.9, 20.5 + 5 * 2, { left: 100.4, top: 20.5 }, 2)).toEqual({ x: 3, y: 5 });
    expect(gridPoint(100.4 + 7.99, 20.5, { left: 100.4, top: 20.5 }, 4)).toEqual({ x: 1, y: 0 });
  });

  it.each([1, 2, 3, 4])('zoom %i: the letterbox is null on all four sides', (zoom) => {
    const rect = { left: 50, top: 30 };
    const w = 256 * zoom;
    const h = 240 * zoom;
    expect(gridPoint(rect.left - 1, rect.top + 10, rect, zoom)).toBeNull();
    expect(gridPoint(rect.left + 10, rect.top - 1, rect, zoom)).toBeNull();
    expect(gridPoint(rect.left + w, rect.top + 10, rect, zoom)).toBeNull();
    expect(gridPoint(rect.left + 10, rect.top + h, rect, zoom)).toBeNull();
    expect(gridPoint(rect.left + w - 1, rect.top + h - 1, rect, zoom)).toEqual({ x: 255, y: 239 });
    expect(gridPoint(rect.left, rect.top, rect, zoom)).toEqual({ x: 0, y: 0 });
    expect(gridPoint(-500, -500, rect, zoom)).toBeNull();
  });

  it('a pointer in the letterbox hits no target', () => {
    const p = gridPoint(5, 5, { left: 100, top: 100 }, 2);
    expect(p).toBeNull();
    expect(hitTest(targets, p)).toBeNull();
  });

  it('after a resize from 3x to 2x, the new rect and zoom give the right target', () => {
    // Grid (160, 120) is the rail; (159, 120) is the fans.
    const rect3 = { left: 20, top: 10 };
    const rect2 = { left: 150, top: 60 };
    expect(hitTest(targets, gridPoint(rect3.left + 160 * 3, rect3.top + 120 * 3, rect3, 3))).toBe('rail');
    expect(hitTest(targets, gridPoint(rect3.left + 159 * 3 + 2, rect3.top + 120 * 3, rect3, 3))).toBe('fans');
    // The same screen spot after the resize reads through the new numbers.
    expect(hitTest(targets, gridPoint(rect2.left + 160 * 2, rect2.top + 120 * 2, rect2, 2))).toBe('rail');
    expect(hitTest(targets, gridPoint(rect2.left + 159 * 2 + 1, rect2.top + 120 * 2, rect2, 2))).toBe('fans');
    // A client point that was on the rail at 3x is not read through the old numbers now.
    const stale = gridPoint(rect3.left + 160 * 3, rect3.top + 120 * 3, rect2, 2);
    expect(stale).not.toEqual({ x: 160, y: 120 });
  });
});

describe('TH3: the hit test over every grid point', () => {
  it('all 61,440 points return the spec box\'s target or none', () => {
    const wrong: string[] = [];
    for (let y = 0; y < 240; y++) {
      for (let x = 0; x < 256; x++) {
        const got = hitTest(targets, { x, y });
        const want = expectedAt(x, y);
        if (got !== want) { wrong.push(`${x},${y}: got ${got} want ${want}`); if (wrong.length > 10) break; }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('the spec\'s boxes do not overlap each other (so the sweep has one right answer)', () => {
    for (let y = 0; y < 240; y++) for (let x = 0; x < 256; x++) {
      const hits = BOXES.filter(([, [x0, y0, x1, y1]]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
      expect(hits.length).toBeLessThanOrEqual(1);
    }
  });

  it('box edges are inclusive and the sky, the status bar and the voice rows are not targets', () => {
    expect(hitTest(targets, { x: 111, y: 96 })).toBe('windows');
    expect(hitTest(targets, { x: 112, y: 96 })).toBe('fans');
    expect(hitTest(targets, { x: 0, y: 23 })).toBeNull();
    expect(hitTest(targets, { x: 0, y: 24 })).toBe('regular');
    expect(hitTest(targets, { x: 255, y: 175 })).toBe('snackCart');
    expect(hitTest(targets, { x: 255, y: 176 })).toBeNull();
    expect(hitTest(targets, { x: 200, y: 20 })).toBeNull();
    expect(hitTest(targets, { x: 100, y: 190 })).toBeNull();
    expect(hitTest(targets, { x: 100, y: 200 })).toBeNull();
  });
});

describe('TH11: the click rule', () => {
  const click = (s: PointerState, downOn: string | null, upOn: string | null, button = 0) => pointerUp(pointerDown(s, button, downOn), button, upOn);

  it('primary release over the target it went down on acts', () => {
    expect(click(pointerState(), 'fans', 'fans').act).toBe('fans');
    expect(click(pointerState(), 'windows', 'windows').act).toBe('windows');
  });

  it('the press ends with the release: a second bare release does nothing', () => {
    const first = click(pointerState(), 'rail', 'rail');
    expect(pointerUp(first.state, 0, 'rail').act).toBeNull();
  });

  it('a release over another target does nothing', () => {
    expect(click(pointerState(), 'fans', 'rail').act).toBeNull();
    expect(click(pointerState(), 'rail', 'fans').act).toBeNull();
  });

  it('a release outside every target, or in the letterbox, does nothing', () => {
    expect(click(pointerState(), 'rail', null).act).toBeNull();
  });

  it('down on a non-target or the letterbox, then up on a target, does nothing', () => {
    expect(click(pointerState(), null, 'rail').act).toBeNull();
  });

  it('down and up on a non-target does nothing', () => {
    expect(click(pointerState(), null, null).act).toBeNull();
  });

  it.each([1, 2, 3, 4])('button %i never acts', (button) => {
    expect(click(pointerState(), 'rail', 'rail', button).act).toBeNull();
  });

  it('a right click does not begin a click either', () => {
    const s = pointerDown(pointerState(), 2, 'rail');
    expect(pointerUp(s, 0, 'rail').act).toBeNull();
  });

  it('a release with no press on this screen does nothing (a press begun on the screen before)', () => {
    expect(pointerUp(pointerState(), 0, 'windows').act).toBeNull();
  });

  it('a blur in the middle of a click cancels it', () => {
    const down = pointerDown(pointerState(), 0, 'rail');
    const afterBlur = pointerBlur();
    expect(pointerUp(afterBlur, 0, 'rail').act).toBeNull();
    expect(afterBlur).toEqual(pointerState());
    expect(down.down).toBe('rail'); // control: without the blur it would have acted
    expect(pointerUp(down, 0, 'rail').act).toBe('rail');
  });

  it('a blur forgets hover too, so re-entering the same target takes focus again', () => {
    const over = pointerMove(pointerState(), 'fans').state;
    expect(pointerMove(over, 'fans').entered).toBeNull();
    expect(pointerMove(pointerBlur(), 'fans').entered).toBe('fans');
  });

  it('end to end with grid points: only a primary down and up on the same spot of one target acts; focus unchanged otherwise', () => {
    const rect = { left: 8, top: 8 };
    const zoom = 3;
    const at = (gx: number, gy: number) => hitTest(targets, gridPoint(rect.left + gx * zoom + 1, rect.top + gy * zoom + 1, rect, zoom));
    const cases: [string, [number, number], [number, number], number, string | null][] = [
      ['fans to fans', [130, 120], [150, 100], 0, 'fans'],
      ['fans to rail', [159, 120], [160, 120], 0, null],
      ['sky', [200, 20], [200, 20], 0, null],
      ['status bar', [10, 5], [10, 5], 0, null],
      ['right click', [130, 120], [130, 120], 2, null],
      ['middle click', [130, 120], [130, 120], 1, null],
    ];
    for (const [name, down, up, button, want] of cases) {
      const s = pointerDown(pointerState(), button, at(...down));
      expect(pointerUp(s, button, at(...up)).act, name).toBe(want);
    }
    // Pressing on the letterbox: negative coordinates read as null.
    const lb = hitTest(targets, gridPoint(2, 2, rect, zoom));
    expect(lb).toBeNull();
  });
});

describe('TH4: hover moves focus only on moving into a target', () => {
  it('entering a target reports it; staying or leaving reports nothing', () => {
    let s = pointerState();
    let r = pointerMove(s, 'fans'); expect(r.entered).toBe('fans'); s = r.state;
    r = pointerMove(s, 'fans'); expect(r.entered).toBeNull(); s = r.state;
    r = pointerMove(s, null); expect(r.entered).toBeNull(); s = r.state;
    r = pointerMove(s, 'rail'); expect(r.entered).toBe('rail'); s = r.state;
    r = pointerMove(s, 'fans'); expect(r.entered).toBe('fans');
  });

  it('a still pointer never takes focus back: only a move acts on focus, and leaving all targets leaves focus', () => {
    const ps = pointerMove(pointerState(), 'fans');
    let st: HubState = initialHubState(hub);
    if (ps.entered) st = hubHover(st, ps.entered);
    expect(st.focus).toBe('fans');
    const k: HubKeyContext = { fieldSize: 8, ready: true };
    st = hubKey(hub, st, 'ArrowRight', k).state; // keys take focus away to the rail
    expect(st.focus).toBe('rail');
    // The pointer stays over the fans: no move, so nothing enters.
    expect(pointerMove(ps.state, 'fans').entered).toBeNull();
    // Leaving all targets does not change focus.
    const out = pointerMove(ps.state, null);
    expect(out.entered).toBeNull();
    expect(st.focus).toBe('rail');
  });
});

describe('TH12 (hub): a click on each target is the same outcome as Enter with that target focused', () => {
  const ids = ['windows', 'rail', 'regular', 'board', 'fans', 'bugler', 'snackCart'];
  const ctxs: [string, HubKeyContext][] = [['posted', { fieldSize: 8, ready: true }], ['pending', { fieldSize: 8, ready: false }]];
  for (const [name, k] of ctxs) {
    it.each(ids)(`${name}: %s`, (id) => {
      for (const from of ['windows', 'fans', 'snackCart']) {
        const s0: HubState = { ...initialHubState(hub), focus: from };
        const click = hubClick(hub, s0, id, k);
        const enter = hubKey(hub, { ...s0, focus: id, lineShown: false }, 'Enter', k);
        expect(click.outcome, `from ${from}`).toEqual(enter.outcome);
        expect(click.state, `from ${from}`).toEqual(enter.state);
      }
    });
  }

  it('a click on a door row acts as that door', () => {
    const k: HubKeyContext = { fieldSize: 8, ready: true };
    const win = hitTest(targets, { x: 100, y: 212 })!;
    const rail = hitTest(targets, { x: 100, y: 225 })!;
    expect(hubClick(hub, initialHubState(hub), win, k).outcome).toEqual({ kind: 'program', post: 1 });
    expect(hubClick(hub, initialHubState(hub), rail, k).outcome).toEqual({ kind: 'watch' });
  });
});
