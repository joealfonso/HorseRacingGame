import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hitTest } from '../render/pointer';
import { offeredAmounts } from '../bet/money';
import { loadHub } from '../data/hubLoad';
import { ctx, rd } from '../render/betKit';
import { HUB_POINTER_KEYS, arriveHub, hubClick, hubKey, hubPointerTargets, type HubOutcome } from '../render/hubScreen';
import { PROGRAM_POINTER_KEYS, initialProgramState, programKey, programPointerTargets } from '../render/programScreen';
import { RESULT_POINTER_KEYS, resultPointerTargets } from '../render/resultScreen';
import { PointerInput } from './pointerInput';

// TH15 and the double-click promise of docs/specs/track-hub.md section 6, from the spec's words.
// Phaser is replaced by a stub: PointerInput only needs a canvas, a zoom, and two event hubs.

vi.mock('phaser', () => {
  const stub = { Core: { Events: { BLUR: 'blur' } }, Scenes: { Events: { UPDATE: 'update' } }, Scene: class {} };
  return { ...stub, default: stub };
});

const ROOT = join(__dirname, '..', '..');

describe('TH15: pointer APIs live in one scene helper', () => {
  const POINTER_API = /pointer(down|up|move|over|out|cancel|enter|leave)|setInteractive|input\.(mouse|touch|gamepad)|\.on\(\s*['"](click|touch|mouse)|mousedown|mouseup|mousemove|touchstart|touchend|addEventListener\(\s*['"]click/i;
  const dir = join(ROOT, 'src/scenes');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => join(dir, f)).concat(join(ROOT, 'src/main.ts'));
  const HELPER = join(dir, 'pointerInput.ts');

  it('the helper exists and uses them', () => {
    expect(readFileSync(HELPER, 'utf8')).toMatch(POINTER_API);
  });

  it('no other scene file and not main.ts uses one', () => {
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) if (f !== HELPER) expect(readFileSync(f, 'utf8'), f).not.toMatch(POINTER_API);
  });

  it('no render module reads the pointer from the DOM either (render stays pure)', () => {
    const rdir = join(ROOT, 'src/render');
    for (const f of readdirSync(rdir).filter((x) => x.endsWith('.ts') && !x.endsWith('.test.ts'))) {
      expect(readFileSync(join(rdir, f), 'utf8'), f).not.toMatch(/addEventListener|setInteractive|input\.(mouse|touch)/);
    }
  });
});

describe('TH15: every pointer target maps to an action that also has a key', () => {
  const hub = loadHub();
  // The list: screen, target kind, the key that does the same. Typed from section 6's table.
  const LIST: [string, string, string[]][] = [
    ['track', 'door', ['Enter']], ['track', 'doorRow', ['Enter']], ['track', 'lookable', ['Enter']],
    ['program', 'entry', ['Digit{k}', 'Enter']], ['program', 'pass', ['Enter']], ['program', 'back', ['Escape']],
    ['program', 'less', ['ArrowLeft']], ['program', 'more', ['ArrowRight']], ['program', 'bet', ['Enter']],
    ['result', 'next', ['Enter']],
  ];
  const tables: Record<string, Readonly<Record<string, readonly string[]>>> = { track: HUB_POINTER_KEYS, program: PROGRAM_POINTER_KEYS, result: RESULT_POINTER_KEYS };

  it.each(LIST)('%s %s is bound to %j', (screen, kind, keys) => {
    expect(tables[screen][kind]).toEqual(keys);
  });

  it('the tables name no target kind the list lacks', () => {
    for (const [screen, table] of Object.entries(tables)) for (const kind of Object.keys(table)) expect(LIST.some((l) => l[0] === screen && l[1] === kind), `${screen} ${kind}`).toBe(true);
  });

  it('every target id the three screens can offer is in a listed kind', () => {
    const kinds = (screen: string) => new Set(LIST.filter((l) => l[0] === screen).map((l) => l[1]));
    const offered = offeredAmounts(10000, ctx.rules);
    const k = { horses: 8, ready: true, offered, lastDollars: null };
    const ids = new Set<string>();
    for (const s of [initialProgramState(), { focus: 2, mode: { kind: 'ticket' as const, dollars: offered[1] } }]) {
      for (const t of programPointerTargets(rd, s, k)) ids.add(t.id.replace(/:\d+$/, ''));
    }
    for (const id of ids) expect(kinds('program').has(id), id).toBe(true);
    for (const t of resultPointerTargets()) expect(kinds('result').has(t.id), t.id).toBe(true);
    for (const t of hub.targets.value) expect(kinds('track').has(t.kind), t.id).toBe(true);
  });

  it('the key each target stands for does something on that screen', () => {
    const hs = arriveHub(hub);
    expect(hubKey(hub, hs, 'Enter', { fieldSize: 8, ready: true }).outcome).not.toBeNull();
    const offered = offeredAmounts(10000, ctx.rules);
    const k = { horses: 8, ready: true, offered, lastDollars: null };
    const p = initialProgramState();
    expect(programKey(p, 'Escape', k).outcome).toEqual({ kind: 'back' });
    expect(programKey(p, 'Enter', k).state.mode.kind).toBe('ticket');
    expect(programKey(programKey(p, 'Enter', k).state, 'Enter', k).outcome).toMatchObject({ kind: 'bet' });
    expect(programKey(programKey(p, 'Enter', k).state, 'ArrowRight', k).state).not.toEqual(programKey(p, 'Enter', k).state);
  });
});

// ---------------------------------------------------------------------------------------
// The double click. A fake canvas, window and scene carry real DOM events and update frames into
// the real PointerInput. No clock: time passes only as the scene's own update deltas.

interface FakeCanvas extends EventTarget { getBoundingClientRect(): { left: number; top: number }; style: { cursor: string } }
type Listener = (...a: number[]) => void;
class Emitter {
  private map = new Map<string, Set<Listener>>();
  on(e: string, f: Listener) { (this.map.get(e) ?? this.map.set(e, new Set()).get(e)!).add(f); return this; }
  once(e: string, f: Listener) { return this.on(e, f); }
  off(e: string, f: Listener) { this.map.get(e)?.delete(f); return this; }
  emit(e: string, ...a: number[]) { for (const f of [...(this.map.get(e) ?? [])]) f(...a); }
}
const makeScene = (canvas: FakeCanvas) => ({ game: { canvas, scale: { zoom: 1 }, events: new Emitter() }, events: new Emitter() });
type FakeScene = ReturnType<typeof makeScene>;
/** The scene runs `ms` of frames (16 ms each, then the rest). */
const frames = (scene: FakeScene, ms: number) => {
  let left = ms;
  while (left > 0) { const d = Math.min(16, left); scene.events.emit('update', 0, d); left -= d; }
};
const fire = (target: EventTarget, type: string, x: number, y: number, button = 0) => {
  const e = new Event(type);
  Object.assign(e, { clientX: x, clientY: y, button });
  target.dispatchEvent(e);
};

describe('section 6: a double click on the result cannot land its second half on the track', () => {
  const hub = loadHub();
  const GUARD = rd.pointer.arrivalGuardSeconds.value; // what the scenes are given (raceDay.json)
  let canvas: FakeCanvas;
  let win: EventTarget;

  beforeEach(() => {
    canvas = Object.assign(new EventTarget(), { getBoundingClientRect: () => ({ left: 0, top: 0 }), style: { cursor: '' } });
    win = new EventTarget();
    vi.stubGlobal('window', win);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  /** One whole click: down then up, at a grid point (zoom 1, canvas at 0,0). */
  const click = (x: number, y: number) => { fire(canvas, 'pointerdown', x, y); fire(win, 'pointerup', x, y); };

  // The result's action line and the track's "Just watch" door row both cover this point.
  const POINT = { x: 100, y: 224 };

  /**
   * The result scene has been up for 3 s. A click on its action line hands over to the track, a
   * new scene with its own PointerInput. `wait` ms of the track's frames pass, then the second
   * click lands on the same screen spot. Returns what the track's clicks did.
   */
  const run = (waitMs: number, guard = GUARD) => {
    const acted: HubOutcome[] = [];
    const resultScene = makeScene(canvas);
    new PointerInput(resultScene as never, resultPointerTargets, {
      click: () => {
        const trackScene = makeScene(canvas);
        resultScene.events.emit('shutdown');
        new PointerInput(trackScene as never, () => hubPointerTargets(hub), {
          hover: () => undefined,
          click: (id) => { acted.push(hubClick(hub, arriveHub(hub), id, { fieldSize: 8, ready: true }).outcome); },
        }, guard);
        later = trackScene;
      },
    }, GUARD);
    let later: FakeScene | undefined;
    frames(resultScene, 3000);
    click(POINT.x, POINT.y);
    expect(later, 'the first click went to the track').toBeDefined();
    frames(later!, waitMs);
    click(POINT.x, POINT.y);
    return acted;
  };

  it('the point really is on both screens\' targets (so the test is about the right thing)', () => {
    expect(resultPointerTargets().some((t) => POINT.x >= t.box.x0 && POINT.x <= t.box.x1 && POINT.y >= t.box.y0 && POINT.y <= t.box.y1)).toBe(true);
    expect(hitTest(hubPointerTargets(hub), POINT)).toBe('rail');
  });

  it.each([0, 50, 100, 200])('a second click %i ms after the track arrives starts nothing', (ms) => {
    expect(run(ms).filter((o) => o !== null)).toEqual([]);
  });

  it('a deliberate click a couple of seconds after arriving works', () => {
    expect(run(2000)).toEqual([{ kind: 'watch' }]);
  });

  it('control: with no guard the same second click does start the race (the harness can fail)', () => {
    expect(run(0, 0)).toEqual([{ kind: 'watch' }]);
  });

  it('the guard is short: a click one second after arriving works', () => {
    expect(run(1000)).toEqual([{ kind: 'watch' }]);
  });

  it('the scenes that take the mouse hand PointerInput the shipped arrival guard', () => {
    for (const f of ['HubScene.ts', 'ProgramScene.ts', 'ResultScene.ts']) {
      expect(readFileSync(join(ROOT, 'src/scenes', f), 'utf8'), f).toContain('arrivalGuardSeconds');
    }
  });
});
