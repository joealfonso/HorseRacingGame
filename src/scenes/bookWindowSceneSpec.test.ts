import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { settle, type DayState, type DrawnRace } from '../bet/day';
import { offeredAmounts } from '../bet/money';
import { startEstimate, stepEstimate } from '../bet/estimate';
import { betting, ctx, DAY_SEED, dayWith, fakeResult, programOf, RUNS, settled } from '../render/betKit';
import { colorMap } from '../render/colors';
import { endOfDayPointerTargets } from '../render/endOfDayScreen';
import { resultPointerTargets } from '../render/resultScreen';
import { loadHub } from '../data/hubLoad';
import { race, shippedRaceDay } from '../render/testkit';
import { startDay, type BetDay } from './betDay';
import { BookScene } from './BookScene';
import { EndOfDayScene } from './EndOfDayScene';
import type { Estimates } from './estimates';
import { HubScene } from './HubScene';
import { ResultScene } from './ResultScene';
import { WindowScene } from './WindowScene';


// The scene wiring of the book and the window, driven as a player drives it: real scene
// classes (ResultScene, HubScene, BookScene, WindowScene), real key and pointer plumbing
// (MenuKeys, PointerInput, the held-key guard, the arrival guard), a fake Phaser underneath.
// Only the drawing is faked: Art and PagePainter record what they are asked to draw, and the
// aria-live mirror records what it is told. The race scene is not run: reaching it is the end
// of a bet path ("Race"), and the next result is handed in by the test, the same way in
// every run. From docs/specs/book-and-window.md: FL1, FL2, FL5, FL6, BB5, WI2, WI3, WI5.

type Fn = (...a: unknown[]) => unknown;
const H = vi.hoisted(() => {
  class Emitter {
    private m = new Map<string, Fn[]>();
    on(e: string, f: Fn): this { this.m.set(e, [...(this.m.get(e) ?? []), f]); return this; }
    once(e: string, f: Fn): this { const w: Fn = (...a) => { this.off(e, w); return f(...a); }; return this.on(e, w); }
    off(e: string, f: Fn): this { this.m.set(e, (this.m.get(e) ?? []).filter((x) => x !== f)); return this; }
    emit(e: string, ...a: unknown[]): void { for (const f of [...(this.m.get(e) ?? [])]) f(...a); }
    addCapture(): void { /* the real keyboard plugin keeps the browser from scrolling */ }
  }
  // Any property is a function that returns this: the drawing calls of a Phaser game object.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = new Proxy(function () { /* callable */ }, { get: (_t, p) => (p === 'then' ? undefined : chain), apply: () => chain });
  const listeners = { canvas: new Emitter(), window: new Emitter() };
  const painters: { texts: { text: string; x: number; y: number; color: string; small?: boolean; display?: boolean }[]; rects: { x: number; y: number; w: number; h: number; color: string }[]; images: { slot: string }[] }[] = [];
  const announced: string[] = [];
  const made: { name: string; sub: string | undefined; draws: number }[] = [];
  class FakeScene {
    add = chain; cameras = { main: chain }; textures = chain;
    scene = { start: vi.fn() };
    events = new Emitter();
    input = { keyboard: new Emitter() };
    game = {
      events: new Emitter(), scale: { zoom: 1 },
      canvas: {
        style: {}, getBoundingClientRect: () => ({ left: 0, top: 0 }),
        addEventListener: (e: string, f: Fn) => listeners.canvas.on(e, f), removeEventListener: (e: string, f: Fn) => listeners.canvas.off(e, f),
      },
    };
    constructor(public key: string) { listeners.canvas = new Emitter(); listeners.window = new Emitter(); }
  }
  return { Emitter, chain, listeners, painters, announced, made, FakeScene };
});

vi.mock('phaser', () => ({
  default: { Scene: H.FakeScene, Core: { Events: { BLUR: 'blur' } }, Scenes: { Events: { UPDATE: 'update' } } },
}));
vi.mock('./art', () => ({
  Art: class { constructor(_s: unknown, public info: unknown) { /* held */ } frames() { return 2; } box() { /* drawn */ } swap(k: string) { return k; } text() { return H.chain; } glyph() { return H.chain; } },
}));
vi.mock('./paper', () => ({
  PagePainter: class {
    cur = { texts: [] as typeof H.painters[number]['texts'], rects: [] as typeof H.painters[number]['rects'], images: [] as typeof H.painters[number]['images'] };
    constructor() { H.painters.push(this.cur); }
    clear() { this.cur.texts.length = 0; this.cur.rects.length = 0; this.cur.images.length = 0; }
    rects(l: typeof H.painters[number]['rects']) { this.cur.rects.push(...l); }
    texts(l: typeof H.painters[number]['texts']) { this.cur.texts.push(...l); }
    images(l: typeof H.painters[number]['images']) { this.cur.images.push(...l); }
    entry(e: { rects: typeof H.painters[number]['rects']; texts: typeof H.painters[number]['texts']; images: typeof H.painters[number]['images'] }) { this.rects(e.rects); this.texts(e.texts); this.images(e.images); }
  },
}));
vi.mock('./ariaLive', () => ({ announce: (t: string) => { H.announced.push(t); } }));
// Every betting stream (the day's named streams, src/bet/streams.ts) that anything creates is recorded with its
// draws. raceSeedOf and estimateSeedsOf draw from their own streams inside that module, so they are noted too.
vi.mock('../bet/streams', async (orig) => {
  const real = await orig<typeof import('../bet/streams')>();
  return {
    ...real,
    betStream: (seed: number, name: Parameters<typeof real.betStream>[1], race: number | 'day') => {
      const st = real.betStream(seed, name, race);
      const rec = { name: String(name), sub: String(race), draws: 0 };
      H.made.push(rec);
      return { float: () => { rec.draws++; return st.float(); }, int: (a: number, b: number) => { rec.draws++; return st.int(a, b); } };
    },
    raceSeedOf: (seed: number, race: number) => { H.made.push({ name: 'raceSeed', sub: String(race), draws: 1 }); return real.raceSeedOf(seed, race); },
    estimateSeedsOf: (seed: number, race: number, count: number) => { H.made.push({ name: 'estimateSeeds', sub: String(race), draws: count }); return real.estimateSeedsOf(seed, race, count); },
  };
});

const hub = loadHub();
const rdAll = shippedRaceDay;
const art = { slots: rdAll.slots.slots, states: new Map(), colors: colorMap(rdAll.palette), keys: rdAll.palette.keyColors };

const SCENES = { result: ResultScene, endOfDay: EndOfDayScene, hub: HubScene, book: BookScene, window: WindowScene } as const;
type Key = keyof typeof SCENES;

// ------------------------------------------------------------------ the estimates stub
const jobs = new Map<number, ReturnType<typeof stepEstimate>>();
const jobOf = (d: DrawnRace) => {
  const k = d.daySeed * 100 + d.race;
  let j = jobs.get(k);
  if (!j) { j = stepEstimate(startEstimate(d.daySeed, d.race, RUNS, d.horseIds.length), d.input, RUNS); jobs.set(k, j); }
  return j;
};
interface Stub { e: Estimates; asked: number[]; got: number[]; pending: Set<number> }
function stub(pending: number[] = []): Stub {
  const s: Stub = { asked: [], got: [], pending: new Set(pending), e: null as never };
  s.e = {
    request: (d: DrawnRace) => { s.asked.push(d.race); },
    get: (d: DrawnRace) => { s.got.push(d.race); return s.pending.has(d.race) ? null : jobOf(d); },
    failure: () => null,
  } as unknown as Estimates;
  return s;
}

// ------------------------------------------------------------------ the rig
type Started = { key: string; data: Record<string, unknown> };
class Rig {
  scene!: { create(d: unknown): void; update(t: number, dt: number): void; scene: { start: ReturnType<typeof vi.fn> }; events: InstanceType<typeof H.Emitter>; input: { keyboard: InstanceType<typeof H.Emitter> } };
  key: string = '';
  data: Record<string, unknown> = {};
  started: Started[] = [];
  presses = 0;
  trail: string[] = [];
  private pending: Started | null = null;
  seconds = 0;

  constructor(key: Key, data: Record<string, unknown>) { this.enter({ key, data }); }

  private enter(s: Started): void {
    this.key = s.key;
    this.data = s.data;
    this.started.push(s);
    const C = (SCENES as unknown as Record<string, new () => Rig['scene']>)[s.key];
    if (C === undefined) return; // the race, the error screen: the end of the road for these tests
    const sc = new C();
    sc.scene.start = vi.fn((key: string, data: Record<string, unknown>) => { this.pending = { key, data }; });
    this.scene = sc;
    H.painters.length = 0;
    H.announced.length = 0;
    sc.create(s.data);
    this.follow();
  }
  private follow(): void {
    while (this.pending !== null) { const p = this.pending; this.pending = null; this.enter(p); }
  }
  get at(): string { return this.key; }
  /** The painter of the scene on screen: what it has drawn now. */
  get drawn() { return H.painters[H.painters.length - 1]; }
  get aria(): string { return H.announced[H.announced.length - 1] ?? ''; }
  get texts(): string[] { return this.drawn.texts.map((t) => t.text); }

  /** One key: down, the scene acts, then up on whichever scene is now on screen (as the browser sends it). */
  press(code: string, repeat = false): this {
    this.presses++;
    this.trail.push(code);
    const e = { code, repeat };
    this.scene.input.keyboard.emit('keydown', e);
    this.follow();
    if (this.key in SCENES) this.scene.input.keyboard.emit('keyup', { code, repeat: false });
    return this;
  }
  /** A click at a grid point after `wait` seconds on the screen (a human takes longer than the arrival guard). */
  click(x: number, y: number, wait = 0.8): this {
    this.presses++;
    this.trail.push(`click ${x},${y}`);
    if (wait > 0) this.tick(wait);
    const ev = { button: 0, clientX: x, clientY: y };
    H.listeners.canvas.emit('pointerdown', ev);
    H.listeners.window.emit('pointerup', ev);
    this.follow();
    return this;
  }
  tick(seconds: number): this {
    for (let t = 0; t < seconds - 1e-9 && this.key in SCENES; t += 0.016) {
      this.scene.update(0, 16);
      this.scene.events.emit('update', 0, 16);
      this.seconds += 0.016;
      this.follow();
    }
    return this;
  }
  /** Runs the steps, checking the race has not started before the last one. */
  run(steps: (string | [number, number])[]): this {
    steps.forEach((s, i) => {
      if (typeof s === 'string') this.press(s); else this.click(s[0], s[1]);
      if (i < steps.length - 1) expect(this.key, `after press ${i + 1} (${this.trail[this.trail.length - 1]})`).not.toBe('race');
    });
    return this;
  }
}

// ------------------------------------------------------------------ the day
let s: Stub;
let bet: BetDay;
let day0: DayState;
const mid = (): DayState => settled(programOf(1), dayWith(10000), null, 1); // after race 1, on race 2
const resultData = (b: BetDay, state: DayState, held: string[] = []) => ({
  game: null, rd: rdAll, art, bet: { day: b, state }, result: race(1), playerId: '', held,
});
const AMOUNT = offeredAmounts(10000, ctx.rules)[0];

beforeEach(() => {
  vi.stubGlobal('window', { addEventListener: (e: string, f: Fn) => H.listeners.window.on(e, f), removeEventListener: (e: string, f: Fn) => H.listeners.window.off(e, f) });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  s = stub();
  ({ bet, day: day0 } = startDay(ctx, betting, rdAll, s.e, DAY_SEED, hub));
  H.made.length = 0;
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** A result page for race 1, then the mid-day state (race 2 is next). */
const afterRace1 = () => new Rig('result', resultData(bet, mid()));
const atCover = () => new Rig('book', { bet, day: day0, art, held: [], from: 'dayStart' });
const raceData = (r: Rig) => r.data as { ticket: { post: number }; bet: { state: DayState; drawn: DrawnRace } };

const bankAfter = (r: Rig) => raceData(r).bet.state.bankrollCents;
const betPlaced = (r: Rig, post: number, race: number, before: number) => {
  expect(r.key).toBe('race');
  expect(raceData(r).bet.drawn.race).toBe(race);
  expect(raceData(r).bet.state.open?.ticket).toMatchObject({ race, post, dollars: AMOUNT });
  expect(bankAfter(r)).toBe(before - AMOUNT * 100);
};
const noBet = (r: Rig, race: number, before: number) => {
  expect(r.key).toBe('race');
  expect(raceData(r).bet.drawn.race).toBe(race);
  expect(raceData(r).bet.state.open?.ticket).toBeNull();
  expect(bankAfter(r)).toBe(before);
};

// Points inside the spec's boxes (section 10 and track-hub.md).
const NEW_DAY = (): [number, number] => { const b = endOfDayPointerTargets(shippedRaceDay.raceDay)[0].box; return [Math.floor((b.x0 + b.x1) / 2), Math.floor((b.y0 + b.y1) / 2)]; };
const RESULT_NEXT = (): [number, number] => { const b = resultPointerTargets()[0].box; return [Math.floor((b.x0 + b.x1) / 2), Math.floor((b.y0 + b.y1) / 2)]; };
const READ_ROW: [number, number] = [100, 209];
const BET_ROW: [number, number] = [100, 218];
const WINDOWS_PIC: [number, number] = [50, 150];
const RAIL_PIC: [number, number] = [200, 120];
const COVER_BODY: [number, number] = [100, 100];
const ENTRY3: [number, number] = [100, 100];
const FOOT_CLOSE: [number, number] = [120, 228];
const FOOT_NEXT: [number, number] = [210, 228];
const WIN_ROW3: [number, number] = [100, 138];
const WIN_BET: [number, number] = [200, 210];
const WIN_BACK: [number, number] = [200, 224];

describe('FL1: Boot and New day open that day\'s cover; Enter shows the news; Esc goes to the track on Read', () => {
  it('the book opened at day start shows the cover: the track name from day.json, the title, the day, the race count, the cover line', () => {
    const r = atCover();
    const t = r.texts;
    expect(t).toContain('CHURCHILL DOWNS'); // race 1's track in day.json, in the masthead
    expect(t).toContain('Race Day Program');
    expect(t).toContain('Day');
    expect(t).toContain(`#${DAY_SEED}`);
    expect(t).toContain('8 races today');
    expect(t).toContain('Esc: close');
    expect(t).toContain('News >');
    expect(t).not.toContain('Rail Talk');
  });

  it('Enter on the cover shows the news (Rail Talk), and Enter on the news shows race 1\'s page', () => {
    const r = atCover().press('Enter');
    expect(r.texts).toContain('Rail Talk');
    expect(r.texts).toContain("Today's card");
    r.press('Enter');
    expect(r.texts).toContain('Race 1 of 8');
  });

  it('a click on the cover turns to the news too', () => {
    expect(atCover().click(...COVER_BODY).texts).toContain('Rail Talk');
  });

  it('Esc on the cover goes to the track with focus on Read, and no money moves', () => {
    const r = atCover().press('Escape');
    expect(r.at).toBe('hub');
    expect((r.data as { focus?: string }).focus).toBe('arrival');
    expect(r.aria.endsWith('Read Race 1.')).toBe(true);
    expect((r.data as { day: DayState }).day).toEqual(day0);
  });

  it('New day: the result after the day\'s last race goes to the NEXT day\'s cover, with that day\'s news and a fresh session', () => {
    let state = dayWith(10000);
    for (let n = 1; n <= 8; n++) state = settled(programOf(n), state, n === 3 ? { post: 3, dollars: 2 } : null, n === 3 ? 3 : 5);
    expect(state.ended).toBe('lastRace');
    const dirty: BetDay = { ...bet, looks: { fans: 3 }, clerk: { ticket: 4, punch: 2 } };
    const r = new Rig('result', resultData(dirty, state)).press('Enter');
    expect(r.at).toBe('endOfDay'); // the End of day page first (betting-screens.md section 6), then New day
    r.press('Enter');
    expect(r.at).toBe('book');
    const d = r.data as { day: DayState; bet: BetDay; from: string };
    expect(d.from).toBe('dayStart');
    expect(d.day.daySeed).toBe(DAY_SEED + 1);
    expect(d.day.nextRace).toBe(1);
    expect(d.day.bankrollCents).toBe(10000);
    expect(d.bet.looks).toEqual({});
    expect(d.bet.clerk).toEqual({ ticket: 0, punch: 0 });
    expect(d.bet.previous).not.toBeNull();
    expect(r.texts).toContain(`#${DAY_SEED + 1}`);
    expect(r.texts).toContain('Race Day Program');
    expect(r.texts).not.toContain('Rail Talk'); // the cover first, not the news
  });

  it('New day by click goes to the cover as well', () => {
    let state = dayWith(10000);
    for (let n = 1; n <= 8; n++) state = settled(programOf(n), state, null, 1);
    const r = new Rig('result', resultData(bet, state)).click(...RESULT_NEXT());
    expect(r.at).toBe('endOfDay');
    r.click(...NEW_DAY());
    expect(r.at).toBe('book');
    expect(r.texts).toContain(`#${DAY_SEED + 1}`);
  });

  it('the broke day also ends on the next day\'s cover', () => {
    const broke = settled(programOf(1), dayWith(300), { post: 3, dollars: 2 }, 1);
    expect(broke.ended).toBe('broke');
    const r = new Rig('result', resultData(bet, broke)).press('Enter');
    expect(r.at).toBe('endOfDay');
    r.press('Enter');
    expect(r.at).toBe('book');
    expect((r.data as { from: string }).from).toBe('dayStart');
  });

  it('boot: main.ts hands the first scene the book, opened as day start (source check: the browser entry cannot run here)', () => {
    const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
    expect(main).toMatch(/next:\s*\{\s*key:\s*'book',\s*data:\s*\{\s*\.\.\.day,\s*from:\s*'dayStart'\s*\}\s*\}/);
    expect(main).toMatch(/game\.scene\.add\('book',\s*BookScene\)/);
    expect(main).toMatch(/game\.scene\.add\('window',\s*WindowScene\)/);
  });
});

describe('FL2 and WI3 through the scenes: focus on return, no money moves', () => {
  it('from the result, the track opens on Read', () => {
    const r = afterRace1().press('Enter');
    expect(r.at).toBe('hub');
    expect(r.aria.endsWith('Read Race 2.')).toBe(true);
  });

  it('back from the book (Esc, and "Esc: close" by click) the track is on Bet, and the day is untouched', () => {
    for (const leave of [(r: Rig) => r.press('Escape'), (r: Rig) => r.click(...FOOT_CLOSE)]) {
      const r = afterRace1().press('Enter').press('Enter'); // track, then Read
      expect(r.at).toBe('book');
      const before = JSON.stringify((r.data as { day: DayState }).day);
      leave(r);
      expect(r.at).toBe('hub');
      expect(r.aria.endsWith('Bet Race 2.')).toBe(true);
      expect(JSON.stringify((r.data as { day: DayState }).day)).toBe(before);
    }
  });

  it('back from the window (Esc while choosing, and "Esc: back" by click) the track is on Bet, and the bankroll is the same', () => {
    for (const leave of [(r: Rig) => r.press('Escape'), (r: Rig) => r.click(...WIN_BACK)]) {
      const r = afterRace1().press('Enter').press('Digit4');
      expect(r.at).toBe('window');
      leave(r);
      expect(r.at).toBe('hub');
      expect(r.aria.endsWith('Bet Race 2.')).toBe(true);
      expect((r.data as { day: DayState }).day.bankrollCents).toBe(mid().bankrollCents);
      expect((r.data as { day: DayState }).day.open).toBeNull();
    }
  });

  it('WI3: with the ticket open (from the book) the first Esc closes it on that horse, the second goes to the track on Bet', () => {
    const r = afterRace1().run(['Enter', 'Enter', 'Digit3', 'Enter']);
    expect(r.at).toBe('window');
    expect(r.texts).toContain('Enter: bet');
    r.press('Escape');
    expect(r.at).toBe('window');
    expect(r.texts).not.toContain('Enter: bet');
    expect(r.texts).toContain('Esc: back');
    expect(r.aria).toContain('#3 ');
    r.press('Escape');
    expect(r.at).toBe('hub');
    expect(r.aria.endsWith('Bet Race 2.')).toBe(true);
    expect((r.data as { day: DayState }).day.bankrollCents).toBe(mid().bankrollCents);
  });
});

describe('FL5: the scripted paths, through the real scenes, with the press and click counts of section 2', () => {
  const before = () => mid().bankrollCents;

  it('keys: fast bet (Enter, 3, Enter, Enter) is 4 presses', () => {
    const r = afterRace1().run(['Enter', 'Digit3', 'Enter', 'Enter']).tick(1);
    expect(r.presses).toBe(4);
    betPlaced(r, 3, 2, before());
  });

  it('keys: menu bet (Enter, Down, Enter, 3, Enter, Enter) is 6 presses', () => {
    const r = afterRace1().run(['Enter', 'ArrowDown', 'Enter', 'Digit3', 'Enter', 'Enter']).tick(1);
    expect(r.presses).toBe(6);
    betPlaced(r, 3, 2, before());
  });

  it('keys: pass (Enter, Up, Enter) is 3 presses and stakes nothing', () => {
    const r = afterRace1().run(['Enter', 'ArrowUp', 'Enter']);
    expect(r.presses).toBe(3);
    noBet(r, 2, before());
  });

  it('keys: read then bet (Enter, Enter, 3, Enter, Enter) is 5 presses', () => {
    const r = afterRace1().run(['Enter', 'Enter', 'Digit3', 'Enter', 'Enter']).tick(1);
    expect(r.presses).toBe(5);
    betPlaced(r, 3, 2, before());
  });

  it('keys: read then pass (Enter, Enter, Esc, Down, Enter) is 5 presses', () => {
    const r = afterRace1().run(['Enter', 'Enter', 'Escape', 'ArrowDown', 'Enter']);
    expect(r.presses).toBe(5);
    noBet(r, 2, before());
  });

  it('keys: day start, read race 1, bet (Enter, Enter, 3, Enter, Enter) is 5 presses, on race 1', () => {
    const r = atCover().run(['Enter', 'Enter', 'Digit3', 'Enter', 'Enter']).tick(1);
    expect(r.presses).toBe(5);
    betPlaced(r, 3, 1, 10000);
  });

  it('keys: day start, skip the book (Esc, 3, Enter, Enter) is 4 presses', () => {
    const r = atCover().run(['Escape', 'Digit3', 'Enter', 'Enter']).tick(1);
    expect(r.presses).toBe(4);
    betPlaced(r, 3, 1, 10000);
  });

  it('clicks: fast bet in 4 (Next race, the windows, the #3 row, "Enter: bet")', () => {
    const r = afterRace1().run([RESULT_NEXT(), WINDOWS_PIC, WIN_ROW3, WIN_BET]).tick(1);
    expect(r.presses).toBe(4);
    betPlaced(r, 3, 2, before());
  });

  it('clicks: the Bet row in the box does what the windows in the picture do', () => {
    const r = afterRace1().run([RESULT_NEXT(), BET_ROW, WIN_ROW3, WIN_BET]).tick(1);
    betPlaced(r, 3, 2, before());
  });

  it('clicks: pass in 2 (Next race, the rail)', () => {
    const r = afterRace1().run([RESULT_NEXT(), RAIL_PIC]);
    expect(r.presses).toBe(2);
    noBet(r, 2, before());
  });

  it('clicks: read then bet in 4 (Next race, Read, the #3 entry, "Enter: bet")', () => {
    const r = afterRace1().run([RESULT_NEXT(), READ_ROW, ENTRY3, WIN_BET]).tick(1);
    expect(r.presses).toBe(4);
    betPlaced(r, 3, 2, before());
  });

  it('clicks: read then pass in 4 (Next race, Read, "Esc: close", the rail)', () => {
    const r = afterRace1().run([RESULT_NEXT(), READ_ROW, FOOT_CLOSE, RAIL_PIC]);
    expect(r.presses).toBe(4);
    noBet(r, 2, before());
  });

  it('clicks: day start, read race 1, bet in 4 (the cover, "Race 1 >", the #3 entry, "Enter: bet")', () => {
    const r = atCover().run([COVER_BODY, FOOT_NEXT, ENTRY3, WIN_BET]).tick(1);
    expect(r.presses).toBe(4);
    betPlaced(r, 3, 1, 10000);
  });

  it('clicks: day start, skip the book in 4 ("Esc: close", the windows, the #3 row, "Enter: bet")', () => {
    const r = atCover().run([FOOT_CLOSE, WINDOWS_PIC, WIN_ROW3, WIN_BET]).tick(1);
    expect(r.presses).toBe(4);
    betPlaced(r, 3, 1, 10000);
  });

  it('a digit above the field size does nothing at the track', () => {
    const r = afterRace1().press('Enter').press('Digit9');
    expect(r.at).toBe('hub');
  });

  it('digit k at the track opens the window choosing on post k; the Bet row opens it on post 1', () => {
    const k = afterRace1().press('Enter').press('Digit5');
    expect(k.at).toBe('window');
    expect(k.aria).toContain('#5 ');
    expect(k.texts).toContain('Esc: back'); // choosing, not a ticket
    const b = afterRace1().press('Enter').press('ArrowDown').press('Enter');
    expect(b.at).toBe('window');
    expect(b.aria).toContain('#1 ');
    expect(b.texts).toContain('Esc: back');
  });

  it('Read opens the book at race r\'s page (race 2 here), with the cursor on post 1 and its blurb in the footer', () => {
    const r = afterRace1().press('Enter').press('Enter');
    expect(r.at).toBe('book');
    expect(r.texts).toContain('Race 2 of 8');
    expect(r.texts).toContain('Enter: to window');
    expect(r.aria).toContain('#1 ');
  });
});

describe('WI2 and money: a bet lowers the bankroll exactly once, then starts the race', () => {
  const reachTicket = () => afterRace1().run(['Enter', 'Digit3', 'Enter']);

  it('Enter places the bet, and the race starts only after the beat (data: raceDay.json program.punchSeconds)', () => {
    const r = reachTicket();
    expect(r.at).toBe('window');
    r.press('Enter');
    expect(r.at).toBe('window'); // the beat: the stamp and the slip
    const beat = rdAll.raceDay.program.punchSeconds.value;
    r.tick(beat - 0.1);
    expect(r.at).toBe('window');
    r.tick(0.2);
    betPlaced(r, 3, 2, mid().bankrollCents);
  });

  it('on the beat the bank on the status bar already shows the stake gone, the slip is drawn from its torn edge down, and nothing offers a second bet', () => {
    const r = reachTicket().press('Enter');
    const stake = AMOUNT;
    expect(r.texts).toContain(`Bank $${((mid().bankrollCents - stake * 100) / 100).toFixed(2)}`);
    expect(r.drawn.rects.some((x) => x.y === 232 || (x.y <= 232 && x.y + x.h > 232))).toBe(true); // the slip reaches y232-235
    expect(r.texts).not.toContain('Enter: bet');
    expect(r.texts).not.toContain('Esc: back');
  });

  it('mashed Enter (ten presses, no time passing) bets once', () => {
    const r = reachTicket();
    for (let i = 0; i < 10; i++) r.press('Enter');
    r.tick(1);
    betPlaced(r, 3, 2, mid().bankrollCents);
  });

  it('Space and Z during the beat do nothing either, and neither does Esc (no back out once placed)', () => {
    const r = reachTicket().press('Enter');
    for (const c of ['Space', 'KeyZ', 'Escape', 'ArrowLeft', 'ArrowRight', 'Digit1', 'ArrowUp']) r.press(c);
    expect(r.at).toBe('window');
    r.tick(1);
    betPlaced(r, 3, 2, mid().bankrollCents);
  });

  it('an Enter held down (auto-repeat) on the open ticket does not bet; neither does one still held from the screen before', () => {
    const r = new Rig('window', { bet, day: mid(), art, held: ['Enter'], post: 3, ticket: true });
    expect(r.texts).toContain('Enter: bet');
    for (let i = 0; i < 5; i++) r.scene.input.keyboard.emit('keydown', { code: 'Enter', repeat: true });
    expect(r.at).toBe('window');
    expect(r.texts).toContain('Enter: bet');
    r.tick(1);
    expect(r.at).toBe('window');
    expect((r.data as { day: DayState }).day.open).toBeNull();
  });

  it('clicking "Enter: bet" and then clicking again (a double click) bets once', () => {
    const r = afterRace1().run([RESULT_NEXT(), WINDOWS_PIC, WIN_ROW3, WIN_BET]);
    r.click(...WIN_BET, 0); // the second half, straight away
    r.click(...WIN_BET, 0.05);
    r.tick(1);
    betPlaced(r, 3, 2, mid().bankrollCents);
  });

  it('a click on the row being bet does nothing: two clicks on row 3 open the ticket and do not bet', () => {
    const r = afterRace1().run([RESULT_NEXT(), WINDOWS_PIC, WIN_ROW3]);
    expect(r.texts).toContain('Enter: bet');
    r.click(...WIN_ROW3);
    r.click(...WIN_ROW3, 0);
    r.tick(2);
    expect(r.at).toBe('window');
    expect(r.texts).toContain('Enter: bet');
    expect((r.data as { day: DayState }).day.bankrollCents).toBe(mid().bankrollCents);
  });

  it('no click acts during the bet beat: not the bet, not a row, not "Esc: back", not the picture', () => {
    const r = reachTicket().press('Enter');
    for (const [x, y] of [WIN_BET, WIN_ROW3, [100, 112] as [number, number], WIN_BACK, [128, 60] as [number, number]]) r.click(x, y, 0);
    expect(r.at).toBe('window');
    r.tick(1);
    betPlaced(r, 3, 2, mid().bankrollCents);
  });

  it('the bank is lowered once, whatever the amount: every offered amount, once', () => {
    for (const dollars of offeredAmounts(10000, ctx.rules)) {
      const r = afterRace1().run(['Enter', 'Digit3', 'Enter']);
      const steps = offeredAmounts(10000, ctx.rules).indexOf(dollars);
      for (let i = 0; i < steps; i++) r.press('ArrowRight');
      r.press('Enter');
      for (let i = 0; i < 5; i++) r.press('Enter');
      r.tick(1);
      expect(r.key).toBe('race');
      expect(raceData(r).bet.state.open?.ticket).toMatchObject({ post: 3, dollars });
      expect(bankAfter(r)).toBe(mid().bankrollCents - dollars * 100);
    }
  });

  it('the stamp: the clerk plays his stamp frame on the bet (the scene hands the clerk\'s punch use on to the next screen)', () => {
    const r = reachTicket().press('Enter').tick(1);
    expect(r.key).toBe('race');
    const handed = (r.data as { bet: { day: BetDay } }).bet.day;
    expect(handed.clerk.punch).toBe(1);
    expect(handed.clerk.ticket).toBe(1);
  });
});

describe('WI5: the arrival guard, and the mouse at the window and in the book', () => {
  it('the scenes that take the mouse hand PointerInput the shipped guard: a press in the first 0.5 s acts on nothing, a press after it does', () => {
    const r = afterRace1().press('Enter'); // the track, just arrived
    r.click(...READ_ROW, 0); // straight away: ignored
    expect(r.at).toBe('hub');
    r.tick(0.3);
    r.click(...READ_ROW, 0);
    expect(r.at).toBe('hub');
    r.tick(0.3);
    r.click(...READ_ROW, 0);
    expect(r.at).toBe('book');
  });

  it('the second half of a double click on the result cannot land on the track: Next race, then an instant click on Read does nothing', () => {
    const r = new Rig('result', resultData(bet, mid()));
    r.click(...RESULT_NEXT());
    expect(r.at).toBe('hub');
    r.click(...READ_ROW, 0.05);
    expect(r.at).toBe('hub');
  });

  it('the window ignores presses in its first 0.5 s: a click on a row straight after arriving opens nothing', () => {
    const r = afterRace1().run([RESULT_NEXT(), WINDOWS_PIC]);
    expect(r.at).toBe('window');
    r.click(...WIN_ROW3, 0.1);
    expect(r.texts).not.toContain('Enter: bet');
    r.click(...WIN_ROW3, 0.6);
    expect(r.texts).toContain('Enter: bet');
  });

  it('the book ignores presses in its first 0.5 s, so the click that opened it cannot also pick a horse', () => {
    const r = afterRace1().run([RESULT_NEXT(), READ_ROW]);
    expect(r.at).toBe('book');
    r.click(...ENTRY3, 0.1);
    expect(r.at).toBe('book');
    r.click(...ENTRY3, 0.6);
    expect(r.at).toBe('window');
  });

  it('the picture and the clerk are not targets at the window: clicks on them do nothing, choosing or ticket open', () => {
    const r = afterRace1().run([RESULT_NEXT(), WINDOWS_PIC]);
    for (const [x, y] of [[128, 60], [140, 40], [48, 76], [40, 20]] as [number, number][]) r.click(x, y);
    expect(r.at).toBe('window');
    expect(r.texts).not.toContain('Enter: bet');
    r.click(...WIN_ROW3);
    for (const [x, y] of [[128, 60], [140, 40]] as [number, number][]) r.click(x, y);
    expect(r.texts).toContain('Enter: bet');
    expect(r.at).toBe('window');
  });

  it('a click on another row with the ticket open moves the ticket to that horse at the same amount, and does not bet', () => {
    const r = afterRace1().run([RESULT_NEXT(), WINDOWS_PIC, WIN_ROW3]);
    r.press('ArrowRight'); // a bigger amount, if offered
    const line = (rr: Rig) => rr.texts.find((t) => /^< \$|^\$\d+ on|on #/.test(t) || t.includes(' on #')) ?? '';
    const amountLine = line(r);
    r.click(100, 160); // row 5: y111 + 44 .. 121 + 44
    expect(r.at).toBe('window');
    expect(line(r)).toContain('on #5');
    expect(line(r).replace(/#\d/, '#')).toBe(amountLine.replace(/#\d/, '#'));
  });

  it('clicking an entry of a page that is not race r\'s only focuses it: no window, no bet', () => {
    const r = afterRace1().run([RESULT_NEXT(), READ_ROW, FOOT_NEXT, FOOT_NEXT]);
    expect(r.texts).toContain('Race 4 of 8');
    expect(r.texts).toContain('Prices later');
    r.click(...ENTRY3);
    expect(r.at).toBe('book');
  });
});

describe('BB5 and FL6 through the scenes: reading changes nothing and asks for no more than races r and r + 1', () => {

  it('BB5: opening the book at race r and paging every page asks for estimates of races r and r + 1 and no others, and reads no other race\'s prices', () => {
    for (const start of [1, 2, 5, 8]) {
      s = stub();
      const state = { ...dayWith(10000), nextRace: start };
      const r = new Rig('book', { bet: { ...bet, estimates: s.e }, day: state, art, held: [], from: 'track' });
      for (let i = 0; i < 12; i++) r.press('ArrowRight');
      for (let i = 0; i < 12; i++) r.press('ArrowLeft');
      for (let i = 0; i < 12; i++) r.press('ArrowRight');
      const allowed = new Set([start, start + 1].filter((n) => n <= 8));
      expect(s.asked.length).toBeGreaterThan(0);
      for (const n of s.asked) expect(allowed.has(n), `asked for race ${n} at race ${start}`).toBe(true);
      for (const n of s.got) expect(allowed.has(n), `read race ${n}'s prices at race ${start}`).toBe(true);
    }
  });

  it('BB5: the same from the cover at day start, and through the track and the window', () => {
    const r = atCover();
    for (let i = 0; i < 9; i++) r.press('ArrowRight');
    r.press('Escape').press('Enter').press('Enter').press('Escape').press('Digit3').press('Escape');
    for (const n of [...s.asked, ...s.got]) expect([1, 2]).toContain(n);
  });

  it('FL6: reading draws no stream but `news` and the crowd\'s own prices for races r and r + 1, and no Math.random', () => {
    const rand = vi.spyOn(Math, 'random');
    for (const n of [1, 2]) jobOf(bet.drawn[n - 1]); // the estimates are in before the book opens
    H.made.length = 0;
    const r = atCover();
    for (let i = 0; i < 10; i++) r.press('ArrowRight');
    for (let i = 0; i < 10; i++) r.press('ArrowLeft');
    r.click(...FOOT_NEXT).click(...FOOT_NEXT).press('Digit3').press('ArrowDown').press('Escape');
    const names = [...new Set(H.made.map((m) => m.name))].sort();
    expect(names.filter((n) => n !== 'news' && n !== 'crowd')).toEqual([]);
    for (const m of H.made.filter((x) => x.name === 'crowd')) expect(['1', '2']).toContain(m.sub);
    for (const m of H.made.filter((x) => x.name === 'news')) expect(m.sub).toBe('day');
    expect(H.made.some((m) => m.name === 'news' && m.draws > 0)).toBe(true);
    expect(rand).not.toHaveBeenCalled();
  });

  /** Plays the 8 races: odd races bet $2 on #2, even races go to the post with no bet. `read` adds a lot of reading first. The results are the same fixed winners in both runs. */
  function playDay(read: boolean): { records: string; bank: number; ended: DayState['ended']; streams: string[] } {
    s = stub();
    ({ bet, day: day0 } = startDay(ctx, betting, rdAll, s.e, DAY_SEED, hub));
    for (let n = 1; n <= 8; n++) { jobOf(bet.drawn[n - 1]); programOf(n); } // worked out before the count starts
    H.made.length = 0;
    const winners = [3, 1, 5, 8, 2, 3, 7, 4];
    const reading = [...Array(12).fill('ArrowLeft'), 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'Digit5', 'ArrowRight', 'ArrowRight', 'ArrowUp', 'Digit7', ...Array(12).fill('ArrowRight'), 'ArrowLeft', 'Escape'];
    let r = atCover();
    let state: DayState = day0;
    for (let n = 1; n <= 8; n++) {
      if (n > 1) r.press('Enter'); // the result to the track, on Read
      if (read) {
        if (n > 1) r.press('Enter'); // Read: the book at race n's page
        for (const c of reading) r.press(c);
        r.press('Digit3').press('Escape'); // a trip to the window and back, on Bet
        r.click(...READ_ROW).click(...FOOT_NEXT).click(...FOOT_CLOSE); // and the mouse
        r.press('ArrowRight').press('ArrowLeft').press('Digit3').press('Escape');
      } else if (n === 1) r.press('Escape'); // the cover to the track
      r.press('Digit2'); // the window, choosing on post 2
      expect(r.at, `race ${n}`).toBe('window');
      if (n % 2 === 1) r.press('Enter').press('Enter').tick(1);
      else r.press('Escape').press('ArrowDown').press('Enter'); // back to the track on Bet, down to Watch, go
      expect(r.key, `race ${n}`).toBe('race');
      const d = r.data as { bet: { day: BetDay; state: DayState } };
      state = settle(ctx, d.bet.state, fakeResult(programOf(n), winners[n - 1]));
      if (n < 8) r = new Rig('result', resultData(d.bet.day, state));
    }
    return { records: JSON.stringify(state.records), bank: state.bankrollCents, ended: state.ended, streams: [...new Set(H.made.map((m) => m.name))].sort() };
  }

  it('FL6: a whole day with a lot of paging, reading, news and window trips ends with the same day record, byte for byte, as the same day with none', () => {
    const quiet = playDay(false);
    const busy = playDay(true);
    expect(busy.records).toBe(quiet.records);
    expect(busy.bank).toBe(quiet.bank);
    expect(busy.ended).toBe(quiet.ended);
    expect(JSON.parse(quiet.records)).toHaveLength(8);
    // the bets really happened (so the comparison has something in it)
    expect(JSON.parse(quiet.records).filter((x: { ticket: unknown }) => x.ticket !== null)).toHaveLength(4);
    // and the busy day drew no stream the quiet one did not, `news` and the crowd's own prices aside
    expect(busy.streams.filter((n) => n !== 'news')).toEqual(quiet.streams.filter((n) => n !== 'news'));
    expect(busy.streams.filter((n) => n !== 'news' && n !== 'crowd')).toEqual([]);
  });
});

describe('WI4 and BB4 through the scenes: pending prices, and where Enter does and does not go', () => {
  const withPending = (races: number[]) => { s = stub(races); bet = { ...bet, estimates: s.e }; };
  const WIN_ODDS = (r: Rig) => r.drawn.texts.filter((t) => t.x + 8 * t.text.length === 248 && t.y >= 112 && t.y <= 189).map((t) => t.text);

  it('WI4: at the window with prices pending every odds is "-", the clerk says the crowd is still betting, Enter does nothing, Esc works', () => {
    withPending([2]);
    const r = afterRace1().press('Enter').press('Digit3');
    expect(r.at).toBe('window');
    expect(WIN_ODDS(r)).toEqual(Array(8).fill('-'));
    expect(r.texts).toContain('The crowd is still betting.');
    r.press('Enter').press('Enter').press('Space').press('KeyZ');
    expect(r.at).toBe('window');
    expect(r.texts).not.toContain('Enter: bet');
    expect((r.data as { day: DayState }).day.open).toBeNull();
    r.press('Escape');
    expect(r.at).toBe('hub');
  });

  it('WI4: the prices cut in, in one frame, while the window is open; then Enter opens the ticket', () => {
    withPending([2]);
    const r = afterRace1().press('Enter').press('Digit3');
    s.pending.delete(2);
    r.tick(0.1);
    expect(WIN_ODDS(r)).not.toContain('-');
    expect(WIN_ODDS(r)).toHaveLength(8);
    expect(r.texts).toContain('Race 2. Who do you like?');
    r.press('Enter');
    expect(r.texts).toContain('Enter: bet');
  });

  it('BB4: race r\'s page with prices pending shows the pending line, and Enter and a click on an entry do nothing', () => {
    withPending([2]);
    const r = afterRace1().press('Enter').press('Enter');
    expect(r.at).toBe('book');
    expect(r.texts).toContain('The crowd is still betting.');
    expect(r.texts).not.toContain('Enter: to window');
    r.press('Enter').press('Space').press('KeyZ');
    expect(r.at).toBe('book');
    r.click(...ENTRY3);
    expect(r.at).toBe('book');
    s.pending.delete(2);
    r.tick(0.1); // the prices cut in
    expect(r.texts).toContain('Enter: to window');
    expect(r.texts).not.toContain('The crowd is still betting.');
    r.press('Enter');
    expect(r.at).toBe('window');
  });

  it('BB4: race r + 1\'s page with prices posted (blank right slot), and a later page ("Prices later"), take no Enter and a click only focuses', () => {
    const r = afterRace1().press('Enter').press('Enter').press('ArrowRight');
    expect(r.texts).toContain('Race 3 of 8');
    expect(r.texts).not.toContain('Enter: to window');
    expect(r.texts).not.toContain('Prices later');
    r.press('Enter');
    expect(r.at).toBe('book');
    r.click(...ENTRY3);
    expect(r.at).toBe('book');
    r.press('ArrowRight');
    expect(r.texts).toContain('Race 4 of 8');
    expect(r.texts).toContain('Prices later');
    r.press('Enter').press('Digit2').press('Enter');
    expect(r.at).toBe('book');
  });

  it('BB4: race r + 1 pending shows "Prices later" and turns into prices when it finishes while you read it', () => {
    withPending([3]);
    const r = afterRace1().press('Enter').press('Enter').press('ArrowRight');
    expect(r.texts).toContain('Prices later');
    r.press('Enter');
    expect(r.at).toBe('book');
    s.pending.delete(3);
    r.tick(0.1);
    expect(r.texts).not.toContain('Prices later');
    expect(r.drawn.texts.filter((t) => t.x + 8 * t.text.length === 248 && t.y > 58 && t.y < 210 && t.text !== '-').length).toBeGreaterThan(0);
  });

  it('BB4: a run race\'s page shows "Winner: #k" from the result and Enter does nothing there', () => {
    const r = afterRace1().press('Enter').press('Enter').press('ArrowLeft');
    expect(r.texts).toContain('Race 1 of 8');
    expect(r.texts).toContain('Winner: #1');
    r.press('Enter');
    expect(r.at).toBe('book');
  });

  it('BB4: from the book, Enter on entry k opens the window with the ticket open on k at the remembered amount', () => {
    const state = settled(programOf(1), dayWith(10000), { post: 2, dollars: offeredAmounts(10000, ctx.rules)[2] }, 5);
    const r = new Rig('result', resultData(bet, state)).press('Enter').press('Enter').press('Digit6').press('Enter');
    expect(r.at).toBe('window');
    expect(r.texts).toContain('Enter: bet');
    expect(r.aria).toContain('#6 ');
    expect(r.drawn.texts.find((t) => t.x === 20 && t.y === 208)!.text).toContain(`$${offeredAmounts(state.bankrollCents, ctx.rules)[2]}`);
  });
});

describe('WI6 through the scenes: the clerk\'s cycles advance one per use, live in the session and reset on New day', () => {
  const clerkSays = (r: Rig) => r.drawn.texts.find((t) => t.x === 20 && t.y === 98)!.text;
  const T = ["Pencil's sharp. Ready.", 'Take your time. No rush.', 'Ready when you are.'];
  const P = ['There you go. Enjoy it.', 'Fresh off the machine.', 'Mind the peanut shells.'];

  it('each ticket opened is the next line, wrapping; closing it brings back the choosing line', () => {
    const r = afterRace1().press('Enter').press('Digit3');
    expect(clerkSays(r)).toBe('Race 2. Who do you like?');
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) { r.press('Enter'); seen.push(clerkSays(r)); r.press('Escape'); expect(clerkSays(r)).toBe('Race 2. Who do you like?'); }
    expect(seen).toEqual([T[0], T[1], T[2], T[0]]);
  });

  it('the cycle goes on across visits to the window in a day, not back to the first line', () => {
    const r = afterRace1().press('Enter').press('Digit3').press('Enter');
    expect(clerkSays(r)).toBe(T[0]);
    r.press('Escape').press('Escape'); // choosing, then the track
    r.press('Digit3').press('Enter');
    expect(clerkSays(r)).toBe(T[1]);
  });

  it('bets walk the punch cycle: the first bet "There you go", the next race\'s bet "Fresh off the machine"', () => {
    const r = afterRace1().press('Enter').press('Digit3').press('Enter').press('Enter');
    expect(clerkSays(r)).toBe(P[0]);
    r.tick(1);
    expect(r.key).toBe('race');
    const d = r.data as { bet: { day: BetDay; state: DayState } };
    const next = settle(ctx, d.bet.state, fakeResult(programOf(2), 4));
    const r2 = new Rig('result', resultData(d.bet.day, next)).press('Enter').press('Digit3').press('Enter').press('Enter');
    expect(clerkSays(r2)).toBe(P[1]);
  });

  it('New day resets both cycles: the first ticket of the next day is the first line', () => {
    let state = dayWith(10000);
    for (let n = 1; n <= 8; n++) state = settled(programOf(n), state, null, 1);
    const dirty: BetDay = { ...bet, clerk: { ticket: 5, punch: 4 } };
    const r = new Rig('result', resultData(dirty, state)).press('Enter').press('Enter'); // End of day, then New day: the next day's cover
    r.press('Escape').press('Digit3').press('Enter');
    expect(r.at).toBe('window');
    expect(clerkSays(r)).toBe(T[0]);
    r.press('Enter');
    expect(clerkSays(r)).toBe(P[0]);
  });

  it('the cycles draw no random numbers and no stream', () => {
    const rand = vi.spyOn(Math, 'random');
    for (let n = 1; n <= 2; n++) programOf(n);
    H.made.length = 0;
    const r = afterRace1().press('Enter').press('Digit3');
    for (let i = 0; i < 5; i++) r.press('Enter').press('Escape');
    expect(rand).not.toHaveBeenCalled();
    expect([...new Set(H.made.map((m) => m.name))].filter((n) => n !== 'crowd')).toEqual([]);
  });
});

describe('NW5 through the scenes: the news page does not change with the estimate', () => {
  it('the same day with different estimates (so different prices) prints the same news page', () => {
    const pageOf = (runs: number) => {
      const st = stub();
      st.e = { ...st.e, get: (d: DrawnRace) => stepEstimate(startEstimate(d.daySeed, d.race, runs, d.horseIds.length), d.input, runs) } as unknown as Estimates;
      const b = { ...bet, estimates: st.e };
      const r = new Rig('book', { bet: b, day: day0, art, held: [], from: 'dayStart' }).press('Enter');
      return r.texts.join('|');
    };
    expect(pageOf(4)).toBe(pageOf(20));
    const page = pageOf(4);
    expect(page).not.toMatch(/\d+-\d+/);
    expect(page).not.toContain('$');
  });
});

// ------------------------------------------------------------------ section 23, the fix round
const hoverAt = (r: Rig, x: number, y: number): Rig => {
  H.listeners.canvas.emit('pointermove', { clientX: x, clientY: y });
  return r;
};
const blurbOf = (d: DayState, post: number): string => {
  const id = bet.drawn[d.nextRace - 1].horseIds[post - 1];
  return betting.stable.find((h) => h.id === id)!.blurb;
};
// Entry k on a race page: y57 + 19(k-1) to y75 + 19(k-1). Window row k: y111 + 11(k-1) to y121 + 11(k-1).
const ENTRY = (k: number): [number, number] => [100, 66 + 19 * (k - 1)];
const WIN_ROW = (k: number): [number, number] => [100, 116 + 11 * (k - 1)];

describe('23.1: hover in the book moves the entry cursor', () => {
  it('on race r\'s page, moving into entry k focuses it and brings its blurb to the footer; no window, no bet', () => {
    const r = afterRace1().press('Enter').press('Enter');
    expect(r.texts).toContain(blurbOf(mid(), 1));
    hoverAt(r, ...ENTRY(5));
    expect(r.at).toBe('book');
    expect(r.texts).toContain(blurbOf(mid(), 5));
    expect(r.aria).toContain('#5 ');
    hoverAt(r, ...ENTRY(2));
    expect(r.texts).toContain(blurbOf(mid(), 2));
    expect(r.at).toBe('book');
  });

  it('a click after a hover still does what section 10 says: on race r\'s priced page, the window with the ticket on that horse', () => {
    const r = afterRace1().press('Enter').press('Enter');
    hoverAt(r, ...ENTRY(4)).click(...ENTRY(4));
    expect(r.at).toBe('window');
    expect(r.texts).toContain('Enter: bet');
    expect(r.aria).toContain('on #4');
  });

  it('hovering the foot, the cover or the news moves nothing', () => {
    const r = atCover();
    hoverAt(r, ...FOOT_NEXT);
    hoverAt(r, ...COVER_BODY);
    expect(r.texts).not.toContain('Rail Talk');
    r.press('Enter');
    hoverAt(r, 100, 100);
    expect(r.texts).toContain('Rail Talk');
  });
});

describe('23.2: hover at the window moves the cursor while choosing only', () => {
  it('choosing: moving into row k focuses it, and Enter then opens the ticket on k', () => {
    const r = afterRace1().run(['Enter', 'ArrowDown', 'Enter']);
    expect(r.at).toBe('window');
    hoverAt(r, ...WIN_ROW(6));
    expect(r.aria).toContain('#6 ');
    expect(r.texts).toContain('Esc: back');
    r.press('Enter');
    expect(r.aria).toContain('on #6');
  });

  it('ticket open: a hover over another row moves nothing, not the ticket\'s horse', () => {
    const r = afterRace1().run(['Enter', 'Digit3', 'Enter']);
    const before = r.aria;
    hoverAt(r, ...WIN_ROW(7));
    hoverAt(r, ...WIN_ROW(1));
    expect(r.aria).toBe(before);
    r.press('Enter').tick(1);
    betPlaced(r, 3, 2, mid().bankrollCents);
  });

  it('the bet beat: a hover moves nothing', () => {
    const r = afterRace1().run(['Enter', 'Digit3', 'Enter', 'Enter']);
    const before = r.aria;
    hoverAt(r, ...WIN_ROW(8));
    expect(r.aria).toBe(before);
    r.tick(1);
    betPlaced(r, 3, 2, mid().bankrollCents);
  });
});

describe('23.3: Esc from the day-start book', () => {
  const focus = (r: Rig) => (r.data as { focus?: string }).focus;

  it('from the cover or the news, the track is on Read; from a race page, on Bet', () => {
    expect(focus(atCover().press('Escape'))).toBe('arrival');
    const news = atCover().press('Enter').press('Escape');
    expect(focus(news)).toBe('arrival');
    expect(news.aria.endsWith('Read Race 1.')).toBe(true);
    const race1 = atCover().press('Enter').press('Enter').press('Escape');
    expect(race1.at).toBe('hub');
    expect(focus(race1)).toBe('back');
    expect(race1.aria.endsWith('Bet Race 1.')).toBe(true);
    const race5 = atCover().run(['Enter', 'Enter', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'Escape']);
    expect(race5.aria.endsWith('Bet Race 1.')).toBe(true);
    // Paged back to the news, it is Read again.
    expect(atCover().run(['Enter', 'Enter', 'ArrowLeft', 'Escape']).aria.endsWith('Read Race 1.')).toBe(true);
  });

  it('"Esc: close" by click does the same', () => {
    expect(atCover().click(...FOOT_CLOSE).aria.endsWith('Read Race 1.')).toBe(true);
    expect(atCover().press('Enter').click(...FOOT_CLOSE).aria.endsWith('Read Race 1.')).toBe(true);
    expect(atCover().press('Enter').press('Enter').click(...FOOT_CLOSE).aria.endsWith('Bet Race 1.')).toBe(true);
  });
});

describe('23.6: the window reads the open ticket without its arrow glyphs', () => {
  it('"$2 on #3. Enter: bet." then the pays line, and no "<" or ">"', () => {
    const r = afterRace1().run(['Enter', 'Digit3', 'Enter']);
    expect(r.aria).toContain(`$${AMOUNT} on #3. Enter: bet. $${AMOUNT} to win pays $`);
    expect(r.aria).not.toMatch(/[<>]/);
  });
});

// The End of day page through the scenes (betting-screens.md section 6, BE3 as amended by
// book-and-window.md section 11): the result after the last race, or a day cut short, opens
// it; New day opens the next day's cover. Nothing is written to storage.
describe('the End of day page: from the result, and New day to the cover', () => {
  const endedDay = (): DayState => {
    let state = dayWith(10000);
    for (let n = 1; n <= 8; n++) state = settled(programOf(n), state, n === 3 ? { post: 3, dollars: 2 } : null, 5);
    return state;
  };
  const atEnd = () => new Rig('result', resultData(bet, endedDay()));

  it('the result after race 8: Enter opens the page, not the next cover', () => {
    const r = atEnd();
    r.press('Enter');
    expect(r.at).toBe('endOfDay');
    expect(r.texts).toContain("That's the card");
    expect(r.texts).toContain('New day');
    expect(r.aria).toContain("That's the card.");
    expect(r.aria.endsWith('New day.')).toBe(true);
  });

  it('a day cut short opens the page too, listing only the race run', () => {
    const broke = settled(programOf(1), dayWith(300), { post: 3, dollars: 2 }, 1);
    const r = new Rig('result', resultData(bet, broke)).press('Enter');
    expect(r.at).toBe('endOfDay');
    expect(r.texts.filter((t) => /^Race \d$/.test(t))).toEqual(['Race 1']);
  });

  it('a mid-day result still goes to the track, not the page', () => {
    expect(afterRace1().press('Enter').at).toBe('hub');
  });

  it('Enter, Space and Z each are New day, to the next day seed\'s cover with the starting bankroll and the day just ended as previous', () => {
    for (const key of ['Enter', 'Space', 'KeyZ']) {
      const state = endedDay();
      const r = atEnd().press('Enter').press(key);
      expect(r.at, key).toBe('book');
      const d = r.data as { day: DayState; bet: BetDay; from: string };
      expect(d.from).toBe('dayStart');
      expect(d.day.daySeed).toBe(DAY_SEED + 1);
      expect(d.day.bankrollCents).toBe(10000);
      expect(d.day.nextRace).toBe(1);
      expect(d.bet.previous).toEqual({ records: state.records });
      expect(r.texts).toContain('Race Day Program');
    }
  });

  it('Esc and the arrows do nothing on the page', () => {
    const r = atEnd().press('Enter');
    for (const key of ['Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Digit3']) r.press(key);
    expect(r.at).toBe('endOfDay');
  });

  it('a key still held from the result does not skip the page, and does not act as New day on the page', () => {
    const r = atEnd();
    r.scene.input.keyboard.emit('keydown', { code: 'Enter', repeat: false }); // result -> page, Enter still down
    r.tick(0.016);
    expect(r.at).toBe('endOfDay');
    expect((r.data as { held: string[] }).held).toEqual(['Enter']); // handed on from the result
    r.scene.input.keyboard.emit('keydown', { code: 'Enter', repeat: true }); // auto-repeat of the same press
    r.scene.input.keyboard.emit('keydown', { code: 'Enter', repeat: true });
    expect(r.at).toBe('endOfDay');
    r.scene.input.keyboard.emit('keyup', { code: 'Enter', repeat: false });
    r.press('Enter');
    expect(r.at).toBe('book');
  });

  it('a key handed over as held is ignored until it is released', () => {
    const r = new Rig('endOfDay', { bet, day: endedDay(), art, held: ['Enter'] });
    for (let i = 0; i < 5; i++) r.scene.input.keyboard.emit('keydown', { code: 'Enter', repeat: true });
    r.tick(1);
    expect(r.at).toBe('endOfDay');
    r.scene.input.keyboard.emit('keyup', { code: 'Enter', repeat: false });
    r.press('Enter');
    expect(r.at).toBe('book');
  });

  it('a click on "New day" is Enter, but not inside the arrival guard (the second half of a double click)', () => {
    const r = atEnd().click(...RESULT_NEXT());
    expect(r.at).toBe('endOfDay');
    r.click(...NEW_DAY(), 0.1);
    expect(r.at).toBe('endOfDay');
    r.click(...NEW_DAY(), 0.6);
    expect(r.at).toBe('book');
  });

  it('a click outside the "New day" line does nothing', () => {
    const r = atEnd().press('Enter').click(100, 100);
    expect(r.at).toBe('endOfDay');
  });

  it('an ended day handed to the track, the window or the book goes to the page, never straight to the next day', () => {
    for (const key of ['hub', 'window', 'book'] as const) {
      const extra = key === 'window' ? { post: 1, ticket: false } : key === 'book' ? { from: 'track' } : {};
      const r = new Rig(key, { bet, day: endedDay(), art, held: [], ...extra });
      expect(r.at, key).toBe('endOfDay');
    }
  });

  it('the page draws no random numbers and reads from the day record only', () => {
    const rand = vi.spyOn(Math, 'random');
    H.made.length = 0;
    atEnd().press('Enter');
    expect(rand).not.toHaveBeenCalled();
    expect(H.made.filter((m) => m.draws > 0).map((m) => m.name)).toEqual([]);
  });
});

// BE3 and the flow, written again from the spec (betting-screens.md sections 2 and 6, BE3;
// book-and-window.md section 11 and FL1), through the real scenes.
describe('the End of day page: BE3, the flow and what acts on it (second pass)', () => {
  const plan = (n: number) => (n === 2 ? { post: 3, dollars: 2 } : n === 5 ? { post: 6, dollars: 10 } : null);
  const winnerOf = (n: number) => (n === 2 ? 3 : 1);
  const endedDay = (): DayState => {
    let state = dayWith(10000);
    for (let n = 1; n <= 8; n++) state = settled(programOf(n), state, plan(n), winnerOf(n));
    return state;
  };
  const atResult = () => new Rig('result', resultData(bet, endedDay()));
  const atPage = () => new Rig('endOfDay', { bet, day: endedDay(), art, held: [] });
  const keyboardOf = (r: Rig) => r.scene.input.keyboard;

  it('the result after race 8 opens the page by Enter, Space, Z and by click, never the next cover', () => {
    for (const how of ['Enter', 'Space', 'KeyZ', 'NumpadEnter', 'click'] as const) {
      const r = atResult();
      if (how === 'click') r.click(...RESULT_NEXT()); else r.press(how);
      expect(r.at, how).toBe('endOfDay');
      expect(r.texts, how).toContain("That's the card");
    }
  });

  it('the page shows this day\'s record: the figures, and the day\'s card with the bets made', () => {
    const r = atResult().press('Enter');
    const s = endedDay();
    const end = s.bankrollCents;
    expect(r.texts).toContain('Started with');
    expect(r.texts).toContain(`$${Math.floor(end / 100)}.${String(end % 100).padStart(2, '0')}`);
    expect(r.texts).toContain('2 of 8');
    expect(r.texts.filter((t) => /^Race \d$/.test(t))).toHaveLength(8);
    expect(r.texts).toContain('Lost $10');
    expect(r.texts.filter((t) => t === 'Passed')).toHaveLength(6);
    expect(r.texts).toContain(`#${DAY_SEED}`);
  });

  it('New day by Enter, Space, Z, NumpadEnter and click: the next seed, the starting bankroll, race 1, the ended day kept as previous, on the cover', () => {
    for (const how of ['Enter', 'Space', 'KeyZ', 'NumpadEnter', 'click'] as const) {
      const r = atPage();
      if (how === 'click') r.click(...NEW_DAY()); else r.press(how);
      expect(r.at, how).toBe('book');
      const d = r.data as { day: DayState; bet: BetDay; from: string };
      expect(d.from).toBe('dayStart');
      expect(d.day.daySeed).toBe(DAY_SEED + 1);
      expect(d.day.bankrollCents).toBe(10000);
      expect(d.day.nextRace).toBe(1);
      expect(d.day.records).toEqual([]);
      expect(d.day.open).toBeNull();
      expect(d.bet.previous).toEqual({ records: endedDay().records });
      expect(d.bet.looks).toEqual({});
      expect(d.bet.clerk).toEqual({ ticket: 0, punch: 0 });
      expect(r.texts, how).toContain('Race Day Program');
      expect(r.texts).toContain(`#${DAY_SEED + 1}`);
      expect(r.texts).not.toContain('Rail Talk');
    }
  });

  it('the seed wraps after 4294967295 to 0', () => {
    const r = new Rig('endOfDay', { bet, day: { ...endedDay(), daySeed: 4294967295 }, art, held: [] }).press('Enter');
    expect((r.data as { day: DayState }).day.daySeed).toBe(0);
  });

  it('the ended day is kept for the news: the next day\'s news page names yesterday\'s longest winner from the record', () => {
    const s = endedDay();
    const parse = (o: string) => { const [n, d] = o.split('-').map(Number); return n / d; };
    const top = s.records.reduce((b, r) => (parse(r.winnerOdds) > parse(b.winnerOdds) ? r : b));
    const name = ctx.stable.find((h) => h.id === top.horseIds[top.winnerPost - 1])!.name;
    const r = atPage().press('Enter').press('Enter');
    expect(r.texts).toContain('Rail Talk');
    expect(r.texts).toContain("Yesterday's longest price");
    expect(r.texts.join(' ')).toContain(name);
    expect(r.texts.join(' ')).toContain(top.winnerOdds);
  });

  it('nothing but New day acts: no other key and no click anywhere else moves the page', () => {
    const r = atPage();
    for (const code of ['Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Digit1', 'Digit8', 'KeyP', 'KeyA', 'Tab', 'Backspace', 'ShiftLeft']) r.press(code);
    for (const [x, y] of [[0, 0], [128, 4], [100, 40], [100, 112], [100, 124], [100, 150], [100, 205], [100, 215], [100, 232], [255, 239], [7, 220], [248, 220]] as [number, number][]) r.click(x, y);
    expect(r.at).toBe('endOfDay');
    expect(r.scene.scene.start).not.toHaveBeenCalled();
  });

  it('a key held from the result neither skips the page nor starts the day: the key must come up and go down again', () => {
    const r = atResult();
    keyboardOf(r).emit('keydown', { code: 'Enter', repeat: false });
    r.tick(0.016);
    expect(r.at).toBe('endOfDay');
    expect((r.data as { held: string[] }).held).toEqual(['Enter']);
    for (let i = 0; i < 4; i++) keyboardOf(r).emit('keydown', { code: 'Enter', repeat: true });
    r.tick(2);
    expect(r.at).toBe('endOfDay');
    keyboardOf(r).emit('keyup', { code: 'Enter', repeat: false });
    r.press('Enter');
    expect(r.at).toBe('book');
  });

  it('a held Space or Z from the result is held over the same way', () => {
    for (const code of ['Space', 'KeyZ']) {
      const r = new Rig('endOfDay', { bet, day: endedDay(), art, held: [code] });
      for (let i = 0; i < 3; i++) keyboardOf(r).emit('keydown', { code, repeat: true });
      r.tick(1);
      expect(r.at, code).toBe('endOfDay');
    }
  });

  it('a double click on the result cannot reach New day: the second half, inside the guard, does nothing; a click after it starts the day', () => {
    const r = atResult().click(...RESULT_NEXT());
    expect(r.at).toBe('endOfDay');
    r.click(...NEW_DAY(), 0);
    r.click(...NEW_DAY(), 0.3);
    expect(r.at).toBe('endOfDay');
    r.click(...NEW_DAY(), 0.3);
    expect(r.at).toBe('book');
  });

  it('New day starts exactly one day, however many presses and clicks arrive in the same moment', () => {
    const r = atPage();
    const kb = keyboardOf(r);
    const start = r.scene.scene.start;
    for (const code of ['Enter', 'Space', 'KeyZ']) { kb.emit('keydown', { code, repeat: false }); kb.emit('keyup', { code, repeat: false }); }
    const [x, y] = NEW_DAY();
    for (let i = 0; i < 3; i++) { H.listeners.canvas.emit('pointerdown', { button: 0, clientX: x, clientY: y }); H.listeners.window.emit('pointerup', { button: 0, clientX: x, clientY: y }); }
    r.tick(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('showing the page changes nothing and draws no stream and no Math.random', () => {
    const rand = vi.spyOn(Math, 'random');
    for (let n = 1; n <= 8; n++) programOf(n);
    const state = endedDay();
    const before = JSON.stringify(state);
    H.made.length = 0;
    const r = new Rig('result', resultData(bet, state)).press('Enter');
    r.tick(2);
    expect(r.at).toBe('endOfDay');
    expect((r.data as { day: DayState }).day).toBe(state);
    expect(JSON.stringify(state)).toBe(before);
    expect(rand).not.toHaveBeenCalled();
    expect(H.made).toEqual([]);
  });

  it('only a settled-and-ended day opens the page: a mid-day result goes to the track', () => {
    expect(afterRace1().press('Enter').at).toBe('hub');
  });

  it('a day cut short (under $2) also opens the page, with the one race run, and New day starts the next day', () => {
    const broke = settled(programOf(1), dayWith(300), { post: 3, dollars: 2 }, 1);
    const r = new Rig('result', resultData(bet, broke)).press('Enter');
    expect(r.at).toBe('endOfDay');
    expect(r.texts.filter((t) => /^Race \d$/.test(t))).toEqual(['Race 1']);
    expect(r.texts).not.toContain("Tapped out");
    r.press('Enter');
    expect(r.at).toBe('book');
    expect((r.data as { day: DayState }).day.bankrollCents).toBe(10000);
  });

  it('the page and the next cover agree on the day pair for the seed that follows: the cover prints the next seed', () => {
    const page = atPage();
    expect(page.texts).toContain(`#${DAY_SEED}`);
    page.press('Enter');
    expect(page.texts).toContain(`#${DAY_SEED + 1}`);
  });
});
