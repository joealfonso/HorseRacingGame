import { afterEach, describe, expect, it, vi } from 'vitest';
import bettingJson from '../data/betting.json';
import { programFor, quote, type DrawnRace } from '../bet/day';
import { loadHub } from '../data/hubLoad';
import { ctx, dayWith, drawnOf, estimateOf, programOf, rd } from './betKit';
import {
  arriveHub, hubClick, hubHover, hubKey, hubPointerTargets, hubPricesPosted, hubScreen, idleAfterLook, idleAt, idleClock,
  initialHubState, type HubInput, type HubKeyContext, type HubOutcome, type HubState,
} from './hubScreen';
import { gridPoint, hitTest, pointerMove, pointerState } from './pointer';

// Written from docs/specs/track-hub.md sections 2, 4, 5, 7, 9 and DESIGN "The track (between
// races)", as amended by docs/specs/book-and-window.md section 11 (amendments 11 to 20) and
// 18.1 item 7. Expected values are typed from those, not read back from the code under test.

const hub = loadHub();
const ready: HubKeyContext = { fieldSize: 8, ready: true };
const pending: HubKeyContext = { fieldSize: 8, ready: false };
const START = 10000;
const drawn = (race: number): DrawnRace => drawnOf()[race - 1];
// Focus on Windows (Bet), as it is back from the book or the window (book-and-window.md FL2).
const onWindows = arriveHub(hub, {}, 'back');
const input = (over: Partial<HubInput> = {}): HubInput => ({
  hub, rd, ctx, day: dayWith(START), drawn: drawn(3), program: programOf(3), state: onWindows, seconds: 0, reducedMotion: false, ...over,
});
const at = (focus: string, over: Partial<HubState> = {}): HubState => ({ ...initialHubState(hub), focus, ...over });
const press = (s: HubState, codes: string[], k: HubKeyContext = ready) => {
  let state = s;
  const outcomes: HubOutcome[] = [];
  for (const c of codes) { const r = hubKey(hub, state, c, k); state = r.state; outcomes.push(r.outcome); }
  return { state, outcomes };
};
const texts = (sc: ReturnType<typeof hubScreen>): string[] =>
  [...sc.status, sc.sign, sc.board.header, ...sc.board.posts.flatMap((p) => [p.digit, p.price]), ...sc.voice, ...sc.doors].map((t) => t.text);

// Spec section 2 and TH17.
const ORDER = ['regular', 'windows', 'board', 'fans', 'rail', 'bugler', 'snackCart'];
const LOOKABLES = ['regular', 'board', 'fans', 'bugler', 'snackCart'];
const NAMES: Record<string, string> = { regular: 'The regular', board: 'The tote board', fans: 'Fans at the rail', bugler: 'The bugler', snackCart: 'The snack cart' };
// Section 7's lines.
const LINES: Record<string, string[]> = {
  regular: ['Same seat for thirty years.', 'My hat has its own fans.', 'Brought a cushion. Genius.', 'Here for the hats, honestly.'],
  board: ['Two thousand bulbs. Two out.', 'It hums a little B flat.', 'Polished every morning.'],
  fans: ['Lucky socks. Both left feet.', 'Best spot in the house.', "Nephew's at the snack cart.", 'We cheer for all of them.'],
  bugler: ['Twelve notes, every race.', 'I practice in the car.', 'Neighbors love it. Mostly.', 'Never missed a call yet.'],
  snackCart: ['Hot peanuts! Mostly warm.', 'Lemonade, lightly lemony.', 'Mind the pigeons. Bold ones.', 'Rain or shine. Mostly shine.'],
};
// Section 4 focus boxes: x0, y0, x1, y1.
const FOCUS: Record<string, [number, number, number, number]> = {
  windows: [4, 98, 107, 145], rail: [172, 104, 219, 135], regular: [52, 44, 75, 75], board: [124, 32, 251, 71],
  fans: [120, 104, 159, 135], bugler: [124, 144, 147, 173], snackCart: [180, 140, 235, 171],
};
// book-and-window.md section 8: three rows at y206, y215, y224 (were the two doors at y210 and y222).
const DOOR_TOP: Record<string, number> = { read: 206, windows: 215, rail: 224 };
// 18.1 item 7: voice rows at y185 and y194 (were y186 and y196).
const VOICE_TOPS = [185, 194];

afterEach(() => vi.restoreAllMocks());

describe('TH5, replaced by book-and-window.md FL2: arrival focus is Read, back from the book or the window it is Bet', () => {
  it('arriving with any looks, from the result, New day or boot, is Read with nothing pending; back is Windows', () => {
    const lookSets: Record<string, number>[] = [{}, { fans: 3 }, { board: 1, regular: 2, snackCart: 5 }];
    for (const looks of lookSets) {
      for (const [from, want] of [['arrival', 'read'], ['back', 'windows']] as const) {
        const s = arriveHub(hub, looks, from);
        expect(s.focus).toBe(want);
        expect(s.railWaiting).toBe(false);
        expect(s.lineShown).toBe(false);
      }
    }
    expect(initialHubState(hub).focus).toBe('read');
  });

  it('the first screen shows the horseshoe on the Read row and no corners; back, on the Bet row with the corners on the Windows box', () => {
    const first = hubScreen(input({ state: initialHubState(hub) }));
    expect(first.cursor).toEqual({ x: 8, y: 206 });
    expect(first.corners).toEqual([]);
    const sc = hubScreen(input());
    expect(sc.cursor).toEqual({ x: 8, y: 215 });
    const xs = sc.corners.map((c) => c.x);
    expect(Math.min(...xs)).toBe(4);
  });
});

describe('TH6, replaced by book-and-window.md FL4: Windows and the digits open the window', () => {
  it.each(['Enter', 'Space', 'KeyZ'])('%s on Windows opens the window at post 1, prices posted or not', (code) => {
    expect(hubKey(hub, onWindows, code, ready).outcome).toEqual({ kind: 'window', post: 1 });
    expect(hubKey(hub, onWindows, code, pending).outcome).toEqual({ kind: 'window', post: 1 });
  });

  it('digit k opens the window at post k from every focus, pending or not', () => {
    for (const id of [...ORDER, 'read']) for (let k = 1; k <= 8; k++) {
      for (const c of [ready, pending]) {
        expect(hubKey(hub, at(id), `Digit${k}`, c).outcome, `${id} ${k}`).toEqual({ kind: 'window', post: k });
      }
    }
  });

  it('digits above the field size do nothing, and leave focus alone', () => {
    for (const size of [4, 5, 6, 7]) {
      for (let k = size + 1; k <= 9; k++) {
        const r = hubKey(hub, at('fans'), `Digit${k}`, { fieldSize: size, ready: true });
        expect(r.outcome, `field ${size} digit ${k}`).toBeNull();
        expect(r.state).toEqual(at('fans'));
      }
      expect(hubKey(hub, at('fans'), `Digit${size}`, { fieldSize: size, ready: true }).outcome).toEqual({ kind: 'window', post: size });
    }
  });

  it('0 and 9 never open a post in an 8-horse field', () => {
    expect(hubKey(hub, at('windows'), 'Digit0', ready).outcome).toBeNull();
    expect(hubKey(hub, at('windows'), 'Digit9', ready).outcome).toBeNull();
  });
});

describe('TH7: the rail', () => {
  it('with prices posted, Enter goes to the post with no bet', () => {
    expect(press(at('rail'), ['Enter']).outcomes).toEqual([{ kind: 'watch' }]);
    expect(press(onWindows, ['ArrowDown', 'Enter']).outcomes).toEqual([null, { kind: 'watch' }]);
  });

  it('while pending, Enter starts nothing, shows the toRail voice, and focus stays on the rail', () => {
    const r = press(at('rail'), ['Enter'], pending);
    expect(r.outcomes).toEqual([null]);
    const sc = hubScreen(input({ state: r.state, program: null }));
    expect(sc.voice.map((t) => t.text)).toEqual(['Off to the rail.', 'Post in a moment.']);
    const xs = sc.corners.map((c) => c.x);
    expect(Math.min(...xs)).toBe(172);
    expect(sc.cursor.y).toBe(DOOR_TOP.rail);
  });

  it('the frame the prices post, the race starts, once', () => {
    const waiting = press(at('rail'), ['Enter'], pending).state;
    const r = hubPricesPosted(waiting);
    expect(r.outcome).toEqual({ kind: 'watch' });
    expect(hubPricesPosted(r.state).outcome).toBeNull();
  });

  it('Esc cancels the wait: prices posting then starts nothing, and the voice is the pending line again', () => {
    const waiting = press(at('rail'), ['Enter'], pending).state;
    const cancelled = press(waiting, ['Escape'], pending);
    expect(cancelled.outcomes).toEqual([null]);
    expect(hubPricesPosted(cancelled.state).outcome).toBeNull();
    const sc = hubScreen(input({ state: cancelled.state, program: null }));
    expect(sc.voice[0].text).toBe('The crowd is still betting.');
  });

  it('prices posting with no rail choice starts nothing', () => {
    expect(hubPricesPosted(at('windows')).outcome).toBeNull();
    expect(hubPricesPosted(press(at('windows'), ['Enter'], pending).state).outcome).toBeNull();
  });

  it('Enter on Windows while pending never waits: it opens the window', () => {
    const r = press(at('windows'), ['Enter'], pending);
    expect(r.state.railWaiting).toBe(false);
    expect(r.outcomes).toEqual([{ kind: 'window', post: 1 }]);
  });
});

describe('TH17: key order', () => {
  it('Right visits the seven targets in the spec\'s order and wraps', () => {
    let s = at('regular');
    const seen = [s.focus];
    for (let i = 0; i < 14; i++) { s = press(s, ['ArrowRight']).state; seen.push(s.focus); }
    expect(seen).toEqual([...ORDER, ...ORDER, 'regular']);
  });

  it('Left visits them in reverse and wraps', () => {
    let s = at('regular');
    const seen = [s.focus];
    for (let i = 0; i < 7; i++) { s = press(s, ['ArrowLeft']).state; seen.push(s.focus); }
    expect(seen).toEqual(['regular', 'snackCart', 'bugler', 'rail', 'fans', 'board', 'windows', 'regular']);
  });

  it('from Windows, Right reaches the tote board and Left reaches the regular', () => {
    expect(press(at('windows'), ['ArrowRight']).state.focus).toBe('board');
    expect(press(at('windows'), ['ArrowLeft']).state.focus).toBe('regular');
  });

  it('Up and Down move through Read, Bet and Watch and wrap (FL3)', () => {
    expect(press(at('read'), ['ArrowDown']).state.focus).toBe('windows');
    expect(press(at('windows'), ['ArrowDown']).state.focus).toBe('rail');
    expect(press(at('rail'), ['ArrowDown']).state.focus).toBe('read');
    expect(press(at('read'), ['ArrowUp']).state.focus).toBe('rail');
    expect(press(at('rail'), ['ArrowUp']).state.focus).toBe('windows');
    expect(press(at('windows'), ['ArrowUp']).state.focus).toBe('read');
  });

  it.each(LOOKABLES)('from %s, Up, Down and Esc go to Read (FL3)', (id) => {
    for (const code of ['ArrowUp', 'ArrowDown', 'Escape']) {
      const r = press(at(id), [code]);
      expect(r.state.focus, code).toBe('read');
      expect(r.outcomes).toEqual([null]);
    }
  });

  it('Esc on a row does nothing', () => {
    for (const id of ['read', 'windows', 'rail']) {
      const r = press(at(id), ['Escape']);
      expect(r.state).toEqual(at(id));
      expect(r.outcomes).toEqual([null]);
    }
  });

  it('moving focus starts no action', () => {
    const r = press(at('windows'), ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']);
    expect(r.outcomes.every((o) => o === null)).toBe(true);
  });
});

describe('TH18: looks', () => {
  const row2 = (s: HubState) => hubScreen(input({ state: s })).voice.find((t) => t.y === VOICE_TOPS[1])?.text ?? null;

  it.each(LOOKABLES)('%s: lines cycle in order from line 1 and wrap', (id) => {
    let s = at(id);
    const lines = LINES[id];
    expect(row2(s)).toBeNull();
    for (let i = 0; i < lines.length * 2 + 1; i++) {
      const r = hubKey(hub, s, 'Enter', ready);
      expect(r.outcome).toEqual({ kind: 'look', id });
      s = r.state;
      expect(row2(s), `look ${i + 1}`).toBe(lines[i % lines.length]);
    }
  });

  it('a click look gives the same lines as Enter', () => {
    let s = at('regular');
    const shown: (string | null)[] = [];
    for (let i = 0; i < 5; i++) { s = hubClick(hub, s, 'regular', ready).state; shown.push(row2(s)); }
    expect(shown).toEqual([...LINES.regular, LINES.regular[0]]);
  });

  it('row 1 shows the lookable\'s name beside the horseshoe, before and after a look', () => {
    for (const id of LOOKABLES) {
      const s = at(id);
      for (const st of [s, press(s, ['Enter']).state]) {
        const sc = hubScreen(input({ state: st }));
        expect(sc.voice[0]).toMatchObject({ text: NAMES[id], x: 20, y: VOICE_TOPS[0] });
        expect(sc.cursor).toEqual({ x: 8, y: VOICE_TOPS[0] });
      }
    }
  });

  it('moving focus away and back does not advance the cycle', () => {
    let s = press(at('fans'), ['Enter']).state;
    expect(row2(s)).toBe(LINES.fans[0]);
    s = press(s, ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft']).state;
    expect(s.focus).toBe('fans');
    s = press(s, ['Enter']).state;
    expect(row2(s)).toBe(LINES.fans[1]);
  });

  it('hover away and back does not advance the cycle either', () => {
    let s = press(at('fans'), ['Enter']).state;
    s = hubHover(hubHover(s, 'rail'), 'fans');
    expect(press(s, ['Enter']).state.looks.fans).toBe(2);
    expect(row2(press(s, ['Enter']).state)).toBe(LINES.fans[1]);
  });

  it('a long run of moves with no look leaves every counter at zero', () => {
    let s = at('windows');
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Escape', 'ArrowRight'];
    for (let i = 0; i < 60; i++) s = hubHover(press(s, [keys[i % keys.length]]).state, ORDER[i % 7]);
    for (const id of LOOKABLES) expect(s.looks[id] ?? 0).toBe(0);
  });

  it('cycles are per lookable', () => {
    let s = at('regular');
    s = press(s, ['Enter', 'Enter']).state;
    s = hubHover(s, 'bugler');
    s = press(s, ['Enter']).state;
    expect(row2(s)).toBe(LINES.bugler[0]);
    s = hubHover(s, 'regular');
    s = press(s, ['Enter']).state;
    expect(row2(s)).toBe(LINES.regular[2]);
  });

  it('counters carry through arrivals in a day (arriveHub with looks) and a new day starts at line 1', () => {
    const back = arriveHub(hub, { regular: 2 });
    expect(row2(press({ ...back, focus: 'regular' }, ['Enter']).state)).toBe(LINES.regular[2]);
    expect(row2(press(at('regular'), ['Enter']).state)).toBe(LINES.regular[0]);
  });

  it('a look changes no day state, draws no random number, and starts no flow outcome', () => {
    const rand = vi.spyOn(Math, 'random');
    const day = dayWith(START);
    const before = JSON.stringify(day);
    const prog = programOf(3);
    const progBefore = JSON.stringify(prog);
    let s = at('regular');
    const outcomes: HubOutcome[] = [];
    for (const id of ORDER) {
      s = hubHover(s, id);
      if (id === 'windows' || id === 'rail') continue;
      for (let i = 0; i < 6; i++) { const r = hubKey(hub, s, 'Enter', ready); s = r.state; outcomes.push(r.outcome); }
      hubScreen(input({ day, state: s }));
    }
    expect(outcomes.every((o) => o !== null && o.kind === 'look')).toBe(true);
    expect(JSON.stringify(day)).toBe(before);
    expect(JSON.stringify(prog)).toBe(progBefore);
    expect(s.railWaiting).toBe(false);
    expect(rand).not.toHaveBeenCalled();
  });

  it('the day state at the screen is identical with and without looks', () => {
    const a = hubScreen(input({ day: dayWith(START), state: at('windows') }));
    let s = at('board');
    for (let i = 0; i < 4; i++) s = hubKey(hub, s, 'Enter', ready).state;
    const b = hubScreen(input({ day: dayWith(START), state: at('windows', { looks: s.looks }) }));
    expect(b.status).toEqual(a.status);
    expect(b.board).toEqual(a.board);
    expect(b.voice).toEqual(a.voice);
  });
});

describe('TH8: the board and the status bar', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('race %i: every price is quote(ctx, program, null).odds at its cell', (race) => {
    const program = programOf(race);
    const odds = quote(ctx, program, null).odds;
    const sc = hubScreen(input({ drawn: drawn(race), program }));
    expect(sc.board.header).toMatchObject({ text: `Race ${race}`, x: 132, y: 36 });
    expect(sc.board.posts.map((p) => p.post)).toEqual([...Array(drawn(race).horseIds.length).keys()].map((i) => i + 1));
    for (const p of sc.board.posts) {
      const j = (p.post - 1) % 4;
      const y = p.post <= 4 ? 50 : 60;
      expect(p.digit).toMatchObject({ text: String(p.post), x: 132 + 30 * j, y, small: true });
      expect(p.price).toMatchObject({ text: odds[p.post - 1], x: 138 + 30 * j, y, small: true });
      expect(p.price.text.length).toBeLessThanOrEqual(4);
    }
  });

  it('the digit and the price are two different colors (so "1 5-2" never reads "15-2")', () => {
    const p = hubScreen(input()).board.posts[0];
    expect(p.digit.color).toBe('Orange');
    expect(p.price.color).toBe('Bone');
  });

  it('while pending every price is a "-" at x138 + 30j and digits stay in place', () => {
    const sc = hubScreen(input({ program: null }));
    expect(sc.board.posts).toHaveLength(8);
    for (const p of sc.board.posts) {
      const j = (p.post - 1) % 4;
      expect(p.price).toMatchObject({ text: '-', x: 138 + 30 * j });
      expect(p.digit.x).toBe(132 + 30 * j);
    }
  });

  it('a post that does not run leaves its cell blank', () => {
    const six: DrawnRace = { ...drawn(3), horseIds: drawn(3).horseIds.slice(0, 6) };
    const sc = hubScreen(input({ drawn: six, program: null }));
    expect(sc.board.posts.map((p) => p.post)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(texts(sc).includes('7')).toBe(false);
    expect(texts(sc).includes('8')).toBe(false);
  });

  it('the status bar: "Race 3 of 8" from x4, the bank right-aligned to x251, equal to the day\'s bankroll', () => {
    for (const [cents, text] of [[12345, 'Bank $123.45'], [10000, 'Bank $100.00'], [16500000, 'Bank $165,000.00']] as const) {
      const sc = hubScreen(input({ day: dayWith(cents) }));
      expect(sc.status[0]).toMatchObject({ text: 'Race 3 of 8', x: 4 });
      expect(sc.status[1].text).toBe(text);
      expect(sc.status[1].x + 8 * text.length - 1).toBe(251);
    }
  });

  it('the bank changes with the day, the board does not', () => {
    const a = hubScreen(input({ day: dayWith(5000) }));
    const b = hubScreen(input({ day: dayWith(7000) }));
    expect(a.board).toEqual(b.board);
    expect(a.status[1].text).not.toBe(b.status[1].text);
  });
});

describe('TH9: nothing shows the estimate, and the aria never shows prices', () => {
  const skewed = (race: number) => {
    const d = drawn(race);
    const wins = d.horseIds.map((_, i) => (i === 0 ? 4731 : 100 + i));
    return programFor(ctx, d, estimateOf(wins));
  };

  it('no drawn text carries a percent, a chance, or the estimate\'s numbers', () => {
    for (const focus of ORDER) {
      const prog = skewed(3);
      const sc = hubScreen(input({ program: prog, state: press(at(focus), ['Enter']).state }));
      for (const t of [...texts(sc), sc.aria]) {
        expect(t).not.toMatch(/%|percent|chance/i);
        for (const n of ['4731', '4,731', ...prog.estimate.wins.map(String)]) {
          if (n.length >= 3) expect(t.includes(n), `"${t}" has ${n}`).toBe(false);
        }
      }
    }
  });

  it('the drawn board only ever carries the crowd\'s prices, whatever the estimate says', () => {
    const prog = skewed(3);
    const sc = hubScreen(input({ program: prog }));
    expect(sc.board.posts.map((p) => p.price.text)).toEqual(quote(ctx, prog, null).odds);
  });

  it('the aria text names no price on any focus, posted or pending', () => {
    for (const program of [programOf(3), null]) {
      const odds = program ? quote(ctx, program, null).odds : [];
      for (const focus of ORDER) {
        const sc = hubScreen(input({ program, state: press(at(focus), ['Enter']).state }));
        expect(sc.aria).not.toMatch(/\d+-\d+/);
        for (const o of odds) expect(sc.aria.includes(o), `${focus}: ${o}`).toBe(false);
      }
    }
  });

  it('the aria mirrors the race, the bank, the voice rows and the focused label', () => {
    const door = hubScreen(input());
    expect(door.aria).toContain('Race 3 of 8');
    expect(door.aria).toContain('$100.00');
    for (const v of door.voice) expect(door.aria).toContain(v.text.replace(/[.!?]$/, ''));
    expect(door.aria).toContain('Bet Race 3');
    const look = hubScreen(input({ state: press(at('bugler'), ['Enter']).state }));
    expect(look.aria).toContain('The bugler');
    expect(look.aria).toContain('Twelve notes, every race');
  });
});

describe('TH10: copy fits its fields and holds no banned word', () => {
  const banned = [...bettingJson.copy.bannedWords, 'cash', 'buy'];
  const copy = (): { key: string; text: string }[] => {
    const out: { key: string; text: string }[] = [];
    const walk = (k: string, v: unknown) => {
      if (typeof v === 'string') out.push({ key: k, text: v });
      else if (Array.isArray(v)) v.forEach((x, i) => walk(`${k}[${i}]`, x));
      else if (v && typeof v === 'object') for (const [kk, x] of Object.entries(v)) walk(`${k}.${kk}`, x);
    };
    const { bannedWords: _b, ...rest } = hub.copy as Record<string, unknown>;
    void _b;
    walk('hub', rest);
    return out;
  };

  it('every hub string has no banned word, in any case, inside any word', () => {
    expect(copy().length).toBeGreaterThan(30);
    for (const { key, text } of copy()) for (const w of banned) expect(text.toLowerCase().includes(w.toLowerCase()), `${key}: "${text}" has "${w}"`).toBe(false);
  });

  it('state lines, flavor lines, lookable names and lines are 28 characters or fewer at the longest race number', () => {
    const rows = copy().filter((c) => !c.key.startsWith('hub.doors') && !c.key.startsWith('hub.board') && !c.key.startsWith('hub.sign'));
    for (const { key, text } of rows) expect(text.replace('{r}', '8').length, `${key}: "${text}"`).toBeLessThanOrEqual(28);
  });

  it('the spec\'s lengths: Race {r} is up 15, toRail 16, the longest lookable line 28', () => {
    expect(hub.copy.state.next).toHaveLength(15); // the spec counts the template, "{r}" included
    expect(hub.copy.state.toRail).toHaveLength(16);
    expect(Math.max(...LOOKABLES.flatMap((id) => hub.copy.lookables[id].lines.map((l) => l.length)))).toBeLessThanOrEqual(28);
  });

  it('there is a flavor line for each of 8 races and a lookable has at least 3 lines', () => {
    expect(hub.copy.flavor.length).toBeGreaterThanOrEqual(8);
    for (const id of LOOKABLES) expect(hub.copy.lookables[id].lines.length).toBeGreaterThanOrEqual(3);
  });

  it('the screen at its longest: every voice row fits x20-243, the doors fit, the bar fits', () => {
    const states: HubState[] = [at('windows'), at('rail'), ...LOOKABLES.map((id) => press(at(id), ['Enter', 'Enter', 'Enter', 'Enter']).state)];
    for (const race of [1, 7, 8]) for (const program of [programOf(race), null]) for (const state of states) {
      const sc = hubScreen(input({ drawn: drawn(race), program, state, day: dayWith(16500000) }));
      for (const v of sc.voice) { expect(v.x).toBe(20); expect(v.text.length, v.text).toBeLessThanOrEqual(28); expect(v.x + 8 * v.text.length - 1).toBeLessThanOrEqual(243); }
      for (const d of sc.doors) { expect(d.text.length).toBeLessThanOrEqual(28); expect(d.x + 8 * d.text.length - 1).toBeLessThanOrEqual(243); }
      expect(sc.status[0].x + 8 * sc.status[0].text.length - 1).toBeLessThanOrEqual(91);
      expect(sc.status[1].x).toBeGreaterThanOrEqual(124);
      expect(sc.board.header.x + 8 * sc.board.header.text.length - 1).toBeLessThanOrEqual(247);
      expect(sc.sign.text.length).toBeLessThanOrEqual(8);
      expect(sc.sign.x).toBeGreaterThanOrEqual(24);
      expect(sc.sign.x + 8 * sc.sign.text.length - 1).toBeLessThanOrEqual(87);
    }
  });

  it('the row labels read "Read Race {r}" (amendment 18), "Bet Race {r}" and "Just watch Race {r}"', () => {
    const sc = hubScreen(input());
    expect(sc.doors.map((d) => d.text)).toEqual(['Read Race 3', 'Bet Race 3', 'Just watch Race 3']);
    expect(sc.doors.map((d) => d.y)).toEqual([DOOR_TOP.read, DOOR_TOP.windows, DOOR_TOP.rail]);
    expect(sc.sign.text).toBe('Windows');
  });

  it('the state and flavor lines on a door: first, next, last, pending, and line 8 on the last race', () => {
    const rowsAt = (race: number, program: ReturnType<typeof programOf> | null) =>
      hubScreen(input({ drawn: drawn(race), program })).voice.map((v) => v.text);
    expect(rowsAt(1, programOf(1))).toEqual(['First race of the day.', 'Gates open. Coffee\'s hot.']);
    expect(rowsAt(3, programOf(3))).toEqual(['Race 3 is up.', 'Sun\'s out. Hats are out.']);
    expect(rowsAt(8, programOf(8))).toEqual(['Last race of the day.', 'Make it a good one.']);
    expect(rowsAt(2, null)).toEqual(['The crowd is still betting.', 'The pigeons found seats.']);
  });

  it('program.back "Esc: back" exists in raceDay.json copy, 9 characters, no banned word (section 7, section 11 item 2)', () => {
    const back = (rd.copy.program as unknown as Record<string, unknown>).back;
    expect(back).toBe('Esc: back');
  });
});

describe('TH4: one focus', () => {
  // A fixed generator of my own: a linear congruential sequence, so the run is the same every time.
  const lcg = (seed: number) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; }; };
  const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape', 'Enter', 'Space', 'KeyZ', 'Digit3', 'KeyQ'];
  const targets = hubPointerTargets(hub);

  const check = (s: HubState, seconds: number, label: string) => {
    const sc = hubScreen(input({ state: s, seconds }));
    // Amendment 19: Read has no picture target, so no corners; the horseshoe is on its row.
    if (s.focus === 'read') {
      expect(sc.corners, label).toEqual([]);
      expect(sc.cursor, label).toEqual({ x: 8, y: DOOR_TOP.read });
      return;
    }
    // Exactly one cursor, four corners.
    expect(sc.corners, label).toHaveLength(4);
    const f = FOCUS[s.focus];
    const d = Math.max(...sc.corners.map((c) => Math.abs(c.x - (c.flipX ? f[2] - 7 : f[0])))); // bob offset, 0 or 1
    expect(d, label).toBeLessThanOrEqual(1);
    const minX = Math.min(...sc.corners.map((c) => c.x));
    const maxX = Math.max(...sc.corners.map((c) => c.x + 7));
    const minY = Math.min(...sc.corners.map((c) => c.y));
    const maxY = Math.max(...sc.corners.map((c) => c.y + 7));
    expect([minX + d, minY + d, maxX - d, maxY - d], label).toEqual(f);
    // The horseshoe is on the same target.
    if (s.focus === 'windows' || s.focus === 'rail') {
      expect(sc.cursor, label).toEqual({ x: 8, y: DOOR_TOP[s.focus] });
    } else {
      expect(sc.cursor, label).toEqual({ x: 8, y: VOICE_TOPS[0] });
      expect(sc.voice[0].text, label).toBe(NAMES[s.focus]);
    }
    expect(sc.cursorFrame, label).toBe(d);
  };

  it('after a few hundred scripted keys and hovers, one cursor and one set of corners name the same target', () => {
    const rnd = lcg(20261114);
    let s = initialHubState(hub);
    let ps = pointerState();
    const rect = { left: 12, top: 7 };
    const zoom = 3;
    let focusMoves = 0;
    for (let step = 0; step < 400; step++) {
      const label = `step ${step}`;
      if (rnd() < 0.5) {
        const code = KEYS[Math.floor(rnd() * KEYS.length)];
        s = hubKey(hub, s, code, step % 7 === 0 ? pending : ready).state;
      } else {
        const gx = Math.floor(rnd() * 256);
        const gy = Math.floor(rnd() * 240);
        const target = hitTest(targets, gridPoint(rect.left + gx * zoom, rect.top + gy * zoom, rect, zoom));
        const m = pointerMove(ps, target);
        ps = m.state;
        const before = s.focus;
        if (m.entered !== null) s = hubHover(s, m.entered);
        else expect(s.focus, `${label} no entry`).toBe(before);
      }
      if (s.railWaiting) s = { ...s, railWaiting: false };
      focusMoves += s.focus !== 'windows' ? 1 : 0;
      check(s, step * 0.25, label);
    }
    expect(focusMoves).toBeGreaterThan(50); // the script really wanders
  });

  it('the horseshoe is on a door row for doors, and never on a door row for a lookable', () => {
    for (const id of ORDER) {
      const sc = hubScreen(input({ state: at(id) }));
      const onDoor = sc.cursor.y === DOOR_TOP.windows || sc.cursor.y === DOOR_TOP.rail;
      expect(onDoor).toBe(id === 'windows' || id === 'rail');
    }
  });

  it('hover and keys move the same focus: hover then Right continues from the hovered target', () => {
    const s = hubHover(at('windows'), 'fans');
    expect(press(s, ['ArrowRight']).state.focus).toBe('rail');
    expect(press(hubHover(at('windows'), 'bugler'), ['ArrowLeft']).state.focus).toBe('rail');
  });

  it('hovering a door row\'s item box focuses its door', () => {
    const id = hitTest(targets, { x: 100, y: 225 })!;
    expect(hubHover(at('regular'), id).focus).toBe('rail');
  });
});

describe('TH16: reduced motion', () => {
  const ts = Array.from({ length: 80 }, (_, i) => i * 0.1);

  it('with motion on, the cursor and the corners bob together by 1 px outward (so the test below can fail)', () => {
    const frames = new Map<number, ReturnType<typeof hubScreen>>();
    for (const t of ts) frames.set(hubScreen(input({ seconds: t })).cursorFrame, hubScreen(input({ seconds: t })));
    expect([...frames.keys()].sort()).toEqual([0, 1]);
    const a = frames.get(0)!.corners;
    const b = frames.get(1)!.corners;
    expect(b[0].x).toBe(a[0].x - 1);
    expect(b[0].y).toBe(a[0].y - 1);
    expect(b[3].x).toBe(a[3].x + 1);
    expect(b[3].y).toBe(a[3].y + 1);
  });

  it('with reduced motion, the cursor and the corners are the same at every moment', () => {
    const first = hubScreen(input({ seconds: 0, reducedMotion: true }));
    for (const t of ts) {
      const sc = hubScreen(input({ seconds: t, reducedMotion: true }));
      expect(sc.corners).toEqual(first.corners);
      expect(sc.cursor).toEqual(first.cursor);
      expect(sc.cursorFrame).toBe(first.cursorFrame);
    }
  });

  it('with reduced motion no idle plays, with or without a look; with motion on idles do play', () => {
    const times = Array.from({ length: 400 }, (_, i) => i * 0.05);
    const clock = idleClock(0);
    expect(times.some((t) => idleAt(hub, clock, t, false) !== null)).toBe(true);
    for (const t of times) expect(idleAt(hub, clock, t, true), `t=${t}`).toBeNull();
    const looked = idleAfterLook(hub, clock, 1, 'regular');
    expect(times.some((t) => idleAt(hub, looked, t, false) !== null)).toBe(true);
    for (const t of times) expect(idleAt(hub, looked, t, true), `look t=${t}`).toBeNull();
  });
});

describe('TH12 and TH4 on the whole: pointer and key outcomes agree', () => {
  it('hubPointerTargets covers the seven targets and the three rows (Read, Bet, Watch)', () => {
    const ids = hubPointerTargets(hub).map((t) => t.id);
    expect(new Set(ids)).toEqual(new Set([...ORDER, 'read']));
    expect(ids).toHaveLength(10);
  });
});
