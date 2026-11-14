import { describe, expect, it } from 'vitest';
import { quote, type DrawnRace } from '../bet/day';
import { loadHub } from '../data/hubLoad';
import { ctx, dayWith, drawnOf, programOf, rd } from './betKit';
import {
  arriveHub, hubClick, hubFocusMarks, hubHover, hubKey, hubPointerTargets, hubPricesPosted, hubScreen, idleAfterLook, idleAt, idleClock,
  initialHubState, type HubInput, type HubKeyContext, type HubState,
} from './hubScreen';
import { hitTest } from './pointer';

// The track screen's logic (docs/specs/track-hub.md sections 2, 4, 5 and 8, DESIGN "The track
// (between races)", as amended by docs/specs/book-and-window.md section 11). Expected values
// are the specs' and DESIGN's.

const hub = loadHub();
const ORDER = ['regular', 'windows', 'board', 'fans', 'rail', 'bugler', 'snackCart'];
const ready: HubKeyContext = { fieldSize: 8, ready: true };
const pending: HubKeyContext = { fieldSize: 8, ready: false };
// Most tests start with focus on Windows (the Bet row), where it lands back from the book or
// the window (book-and-window.md FL2). Arrival itself is on Read (FL1, FL2, amendment 13).
const start = arriveHub(hub, {}, 'back');
const at = (focus: string, over: Partial<HubState> = {}): HubState => ({ ...start, focus, ...over });
const press = (s: HubState, codes: string[], k = ready) => {
  const outcomes: unknown[] = [];
  let state = s;
  for (const c of codes) { const r = hubKey(hub, state, c, k); state = r.state; outcomes.push(r.outcome); }
  return { state, outcomes };
};
const START = 10000;
const drawn = (race: number): DrawnRace => drawnOf()[race - 1];
const input = (over: Partial<HubInput> = {}): HubInput => ({
  hub, rd, ctx, day: dayWith(START), drawn: drawn(3), program: programOf(3), state: start, seconds: 0, reducedMotion: false, ...over,
});

describe('focus on arrival (TH5, replaced by book-and-window.md FL2)', () => {
  it('starts on Read; back from the book or the window it is on Windows (Bet)', () => {
    expect(initialHubState(hub).focus).toBe('read');
    expect(start.focus).toBe('windows');
  });

  it('arriving again is on Read whatever had focus, and keeps the day\'s looks; coming back is on Windows', () => {
    const s = arriveHub(hub, { fans: 2 });
    expect(s).toEqual({ focus: 'read', looks: { fans: 2 }, lineShown: false, railWaiting: false });
    expect(arriveHub(hub, { fans: 2 }, 'back')).toEqual({ focus: 'windows', looks: { fans: 2 }, lineShown: false, railWaiting: false });
  });
});

describe('keys (TH17)', () => {
  it('Right visits the seven targets in picture order and wraps; Left goes back', () => {
    let s = at('regular');
    const seen = [s.focus];
    for (let i = 0; i < 7; i++) { s = press(s, ['ArrowRight']).state; seen.push(s.focus); }
    expect(seen).toEqual([...ORDER, 'regular']);
    expect(press(at('regular'), ['ArrowLeft']).state.focus).toBe('snackCart');
    expect(press(at('windows'), ['ArrowLeft']).state.focus).toBe('regular');
    expect(press(at('windows'), ['ArrowRight']).state.focus).toBe('board');
  });

  it('Up and Down move through the three rows, Read, Bet, Watch, wrapping (book-and-window.md FL3)', () => {
    expect(press(at('read'), ['ArrowDown']).state.focus).toBe('windows');
    expect(press(at('read'), ['ArrowUp']).state.focus).toBe('rail');
    expect(press(at('windows'), ['ArrowDown']).state.focus).toBe('rail');
    expect(press(at('windows'), ['ArrowUp']).state.focus).toBe('read');
    expect(press(at('rail'), ['ArrowDown']).state.focus).toBe('read');
    expect(press(at('rail'), ['ArrowUp']).state.focus).toBe('windows');
  });

  it('from a lookable, Up, Down and Esc go to Read (FL3)', () => {
    for (const id of ['regular', 'board', 'fans', 'bugler', 'snackCart']) {
      for (const code of ['ArrowUp', 'ArrowDown', 'Escape']) expect(press(at(id), [code]).state.focus, `${id} ${code}`).toBe('read');
    }
  });

  it('Esc on a door does nothing', () => {
    expect(press(at('windows'), ['Escape']).state).toEqual(at('windows'));
    expect(press(at('rail'), ['Escape']).state).toEqual(at('rail'));
  });

  it('other keys do nothing', () => {
    expect(press(at('fans'), ['KeyQ', 'Tab', 'Digit0']).state).toEqual(at('fans'));
  });
});

describe('doors (TH6 and TH7, TH6 replaced by book-and-window.md FL4)', () => {
  it.each(['Enter', 'NumpadEnter', 'Space', 'KeyZ'])('%s on Windows opens the window at post 1', (code) => {
    expect(hubKey(hub, start, code, ready).outcome).toEqual({ kind: 'window', post: 1 });
    expect(hubKey(hub, start, code, pending).outcome).toEqual({ kind: 'window', post: 1 });
  });

  it('digit k opens the window at post k from any focus, pending or not; above the field does nothing', () => {
    for (const id of [...ORDER, 'read']) {
      for (let k = 1; k <= 8; k++) {
        expect(hubKey(hub, at(id), `Digit${k}`, ready).outcome).toEqual({ kind: 'window', post: k });
        expect(hubKey(hub, at(id), `Numpad${k}`, pending).outcome).toEqual({ kind: 'window', post: k });
      }
    }
    expect(hubKey(hub, start, 'Digit9', ready).outcome).toBeNull();
    expect(hubKey(hub, start, 'Digit7', { fieldSize: 6, ready: true }).outcome).toBeNull();
    expect(hubKey(hub, start, 'Digit6', { fieldSize: 6, ready: true }).outcome).toEqual({ kind: 'window', post: 6 });
  });

  it('the rail with prices posted goes to the post with no bet', () => {
    expect(press(start, ['ArrowDown', 'Enter']).outcomes).toEqual([null, { kind: 'watch' }]);
  });

  it('the rail while pending waits, then goes the moment prices post', () => {
    const r = press(at('rail'), ['Enter'], pending);
    expect(r.outcomes).toEqual([null]);
    expect(r.state.railWaiting).toBe(true);
    expect(hubPricesPosted(r.state)).toEqual({ state: { ...r.state, railWaiting: false }, outcome: { kind: 'watch' } });
  });

  it('Esc cancels the wait, and the prices posting then does nothing', () => {
    const waiting = at('rail', { railWaiting: true });
    const s = press(waiting, ['Escape'], pending).state;
    expect(s).toEqual(at('rail'));
    expect(hubPricesPosted(s).outcome).toBeNull();
  });

  it('while waiting, other keys and hovers do nothing (the corners stay on the rail)', () => {
    const waiting = at('rail', { railWaiting: true });
    expect(press(waiting, ['ArrowLeft', 'ArrowUp', 'Digit3', 'Enter'], pending).outcomes).toEqual([null, null, null, null]);
    expect(press(waiting, ['ArrowLeft'], pending).state).toEqual(waiting);
    expect(hubHover(waiting, 'fans')).toEqual(waiting);
  });

  it('while waiting, a click on the rail does nothing', () => {
    const waiting = at('rail', { railWaiting: true });
    expect(hubClick(hub, waiting, 'rail', pending)).toEqual({ state: waiting, outcome: null });
    expect(hubClick(hub, waiting, 'rail', ready)).toEqual({ state: waiting, outcome: null });
  });

  it.each(['windows', 'regular', 'board', 'fans', 'bugler', 'snackCart'])(
    'while waiting, a click on %s cancels the wait, moves focus there and does nothing else', (id) => {
      const waiting = at('rail', { railWaiting: true, looks: { fans: 1 } });
      const r = hubClick(hub, waiting, id, pending);
      expect(r).toEqual({ state: at(id, { looks: { fans: 1 } }), outcome: null });
      expect(hubPricesPosted(r.state).outcome).toBeNull();
    },
  );

  it('after a click cancels the wait, the next click acts as usual', () => {
    const cancelled = hubClick(hub, at('rail', { railWaiting: true }), 'windows', pending).state;
    expect(hubClick(hub, cancelled, 'windows', pending).outcome).toEqual({ kind: 'window', post: 1 });
  });

  it('prices posting with no wait does nothing', () => {
    expect(hubPricesPosted(start)).toEqual({ state: start, outcome: null });
  });
});

describe('looks (TH18)', () => {
  const lines = hub.copy.lookables.regular.lines;
  // Voice row 2's cell top, y194 since the art-director's 18.1 item 7 in book-and-window.md (was y196).
  const voice2 = (s: HubState) => hubScreen(input({ state: s })).voice.find((t) => t.y === 194)?.text ?? null;

  it('a lookable focused shows its name and a blank row 2 until a look', () => {
    const s = at('regular');
    const sc = hubScreen(input({ state: s }));
    expect(sc.voice.map((t) => t.text)).toEqual(['The regular']);
  });

  it('each look shows the next line in a fixed cycle, line 1 first, and wraps', () => {
    let s = at('regular');
    const shown: (string | null)[] = [];
    for (let i = 0; i < lines.length + 2; i++) {
      const r = hubKey(hub, s, 'Enter', ready);
      expect(r.outcome).toEqual({ kind: 'look', id: 'regular' });
      s = r.state;
      shown.push(voice2(s));
    }
    expect(shown).toEqual([...lines, lines[0], lines[1]]);
  });

  it('moving focus away and back does not advance the cycle, and hides the line until the next look', () => {
    let s = press(at('regular'), ['Enter']).state;
    s = press(s, ['ArrowRight', 'ArrowLeft']).state;
    expect(s.looks.regular).toBe(1);
    expect(voice2(s)).toBeNull();
    s = press(s, ['Enter']).state;
    expect(voice2(s)).toBe(lines[1]);
  });

  it('counts are per lookable', () => {
    const s = press(at('regular'), ['Enter', 'Enter', 'ArrowRight', 'ArrowRight', 'Enter']).state;
    expect(s.looks).toEqual({ regular: 2, board: 1 });
  });

  // That a look never touches the day comes from the signatures: hubKey, hubClick, hubHover and
  // hubPricesPosted are never given the DayState, the context or an RNG, so they cannot change
  // them (tsc holds that). What a test can check is that a look changes only the look fields.
  it('a look changes only the look count and the shown line, and starts nothing', () => {
    const before = at('fans', { looks: { regular: 3 } });
    const r = hubKey(hub, before, 'Enter', ready);
    expect(r.outcome).toEqual({ kind: 'look', id: 'fans' });
    expect(r.state).toEqual({ ...before, looks: { regular: 3, fans: 1 }, lineShown: true });
    const c = hubClick(hub, before, 'fans', pending);
    expect(c.state).toEqual(r.state);
  });
});

describe('pointer (TH4, TH12)', () => {
  const targets = hubPointerTargets(hub);

  it('hover moves the one focus', () => {
    expect(hubHover(start, 'bugler').focus).toBe('bugler');
    expect(hubHover(start, 'windows')).toBe(start);
  });

  it('a click does what Enter does on that target', () => {
    expect(hubClick(hub, at('fans'), 'windows', ready).outcome).toEqual({ kind: 'window', post: 1 });
    expect(hubClick(hub, start, 'rail', ready)).toEqual({ state: at('rail'), outcome: { kind: 'watch' } });
    const r = hubClick(hub, start, 'snackCart', ready);
    expect(r.outcome).toEqual({ kind: 'look', id: 'snackCart' });
    expect(r.state).toEqual(at('snackCart', { looks: { snackCart: 1 }, lineShown: true }));
  });

  it('the rows hit as their doors and Read as the book row; the voice rows and the status bar hit nothing', () => {
    // book-and-window.md section 8: Read y205-213, Bet y214-222, Watch y223-231 (were Bet y208-219, Watch y220-231).
    expect(hitTest(targets, { x: 100, y: 209 })).toBe('read');
    expect(hitTest(targets, { x: 100, y: 218 })).toBe('windows');
    expect(hitTest(targets, { x: 100, y: 227 })).toBe('rail');
    expect(hitTest(targets, { x: 100, y: 190 })).toBeNull();
    expect(hitTest(targets, { x: 100, y: 5 })).toBeNull();
  });

  it('the fans and the rail share the edge at x159/x160', () => {
    expect(hitTest(targets, { x: 159, y: 120 })).toBe('fans');
    expect(hitTest(targets, { x: 160, y: 120 })).toBe('rail');
  });
});

describe('the screen', () => {
  it('the board: every price is quote(ctx, program, null).odds, digit at x132 + 30j, price from x138 + 30j (TH8)', () => {
    const odds = quote(ctx, programOf(3), null).odds;
    const sc = hubScreen(input());
    expect(sc.board.header).toEqual({ text: 'Race 3', x: 132, y: 36, color: 'Bone' });
    expect(sc.board.posts).toHaveLength(8);
    for (const p of sc.board.posts) {
      const j = (p.post - 1) % 4;
      const y = p.post <= 4 ? 50 : 60;
      expect(p.digit).toEqual({ text: String(p.post), x: 132 + 30 * j, y, color: 'Orange', small: true });
      expect(p.price).toEqual({ text: odds[p.post - 1], x: 138 + 30 * j, y, color: 'Bone', small: true });
      // Small glyphs are 3 px of ink in a 4 px cell: the last glyph column is x + 4n - 2.
      expect(p.price.x + 4 * p.price.text.length - 2).toBeLessThanOrEqual(152 + 30 * j);
    }
  });

  it('pending: every price is a "-" at x138 + 30j', () => {
    const sc = hubScreen(input({ program: null }));
    for (const p of sc.board.posts) expect(p.price).toMatchObject({ text: '-', x: 138 + 30 * ((p.post - 1) % 4) });
  });

  it('a post that does not run leaves its cell blank', () => {
    const short = { ...drawn(3), horseIds: drawn(3).horseIds.slice(0, 6) };
    expect(hubScreen(input({ drawn: short, program: null })).board.posts.map((p) => p.post)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('the status bar: "Race 3 of 8" from x4 and the bank right-aligned to x251', () => {
    const sc = hubScreen(input({ day: dayWith(16500000) }));
    expect(sc.status[0]).toMatchObject({ text: 'Race 3 of 8', x: 4, y: 4 });
    expect(sc.status[1]).toMatchObject({ text: 'Bank $165,000.00', y: 4 });
    expect(sc.status[1].x + 8 * sc.status[1].text.length - 1).toBe(251);
  });

  it('the voice on a door: state line and the race\'s flavor line', () => {
    expect(hubScreen(input()).voice.map((t) => t.text)).toEqual(['Race 3 is up.', "Sun's out. Hats are out."]);
    expect(hubScreen(input({ drawn: drawn(1), program: programOf(1) })).voice.map((t) => t.text)).toEqual(['First race of the day.', "Gates open. Coffee's hot."]);
    expect(hubScreen(input({ drawn: drawn(8), program: null })).voice.map((t) => t.text)).toEqual(['The crowd is still betting.', 'Make it a good one.']);
    expect(hubScreen(input({ drawn: drawn(8), program: programOf(8) })).voice.map((t) => t.text)).toEqual(['Last race of the day.', 'Make it a good one.']);
    expect(hubScreen(input({ state: at('rail', { railWaiting: true }), program: null })).voice.map((t) => t.text)).toEqual(['Off to the rail.', 'Post in a moment.']);
  });

  it('the row labels sit at x20, y206, y215 and y224 (book-and-window.md section 8, was y210 and y222)', () => {
    expect(hubScreen(input()).doors).toEqual([
      { text: 'Read Race 3', x: 20, y: 206, color: 'Bone' },
      { text: 'Bet Race 3', x: 20, y: 215, color: 'Bone' },
      { text: 'Just watch Race 3', x: 20, y: 224, color: 'Bone' },
    ]);
  });

  it('exactly one cursor, and the corners frame the same target (TH4)', () => {
    for (const t of hub.targets.value) {
      const sc = hubScreen(input({ state: at(t.id) }));
      // book-and-window.md section 8 and 18.1 item 7: rows y215 and y224, voice row 1 y185 (were y210, y222, y186).
      const wantY = t.id === 'windows' ? 215 : t.id === 'rail' ? 224 : 185;
      expect(sc.cursor, t.id).toEqual({ x: 8, y: wantY });
      const f = t.focus;
      expect(sc.corners, t.id).toEqual([
        { x: f.x0, y: f.y0, frame: 'top', flipX: false },
        { x: f.x1 - 7, y: f.y0, frame: 'top', flipX: true },
        { x: f.x0, y: f.y1 - 7, frame: 'bottom', flipX: false },
        { x: f.x1 - 7, y: f.y1 - 7, frame: 'bottom', flipX: true },
      ]);
    }
  });

  it('the corners bob 1 px outward on the cursor\'s frame, and not at all with reduced motion (TH16)', () => {
    const half = 1 / rd.ambient.cursorSwapsPerSecond.value; // seconds into the cursor's second frame
    const still = hubScreen(input()).corners;
    const bob = hubScreen(input({ seconds: half }));
    expect(bob.cursorFrame).toBe(1);
    expect(bob.corners.map((c) => [c.x, c.y])).toEqual([
      [still[0].x - 1, still[0].y - 1], [still[1].x + 1, still[1].y - 1], [still[2].x - 1, still[2].y + 1], [still[3].x + 1, still[3].y + 1],
    ]);
    const reduced = hubScreen(input({ seconds: half, reducedMotion: true }));
    expect(reduced.cursorFrame).toBe(0);
    expect(reduced.corners).toEqual(still);
  });

  it('with a one-frame horseshoe (a stand-in) the cursor and the corners both stay on frame 0', () => {
    const half = 1 / rd.ambient.cursorSwapsPerSecond.value;
    const still = hubScreen(input()).corners;
    const one = hubScreen(input({ seconds: half, cursorFrames: 1 }));
    expect(one.cursorFrame).toBe(0);
    expect(one.corners).toEqual(still);
    expect(hubScreen(input({ seconds: half, cursorFrames: 2 })).cursorFrame).toBe(1);
  });

  it('hubFocusMarks, the per-frame part, is exactly the full screen\'s cursor frame and corners', () => {
    for (const seconds of [0, 0.5, 1.2]) {
      for (const st of [at('windows'), at('fans'), at('rail')]) {
        const full = hubScreen(input({ state: st, seconds }));
        expect(hubFocusMarks({ hub, rd, state: st, seconds, reducedMotion: false })).toEqual({ cursorFrame: full.cursorFrame, corners: full.corners });
      }
    }
  });

  it('the sky by race (DESIGN): day to race 6, late at 7, evening at 8', () => {
    const bands = (r: number) => hubScreen(input({ drawn: drawn(r), program: null })).sky.map((s) => [s.color, s.y, s.y + s.h - 1]);
    for (const r of [1, 6]) expect(bands(r)).toEqual([['Sky', 16, 39], ['Sky Pale', 40, 63]]);
    expect(bands(7)).toEqual([['Sky', 16, 23], ['Sky Pale', 24, 39], ['Dusk', 40, 63]]);
    expect(bands(8)).toEqual([['Sky', 16, 23], ['Dusk', 24, 63]]);
  });

  it('the sign reads "Windows" centered on its plate, x28 at cell top y102', () => {
    expect(hubScreen(input()).sign).toEqual({ text: 'Windows', x: 28, y: 102, color: 'Bone' });
  });

  it('aria-live: race, bank, voice and the focused door, never a price or the estimate (TH9)', () => {
    const sc = hubScreen(input());
    expect(sc.aria).toBe("Race 3 of 8. Bank $100.00. Race 3 is up. Sun's out. Hats are out. Bet Race 3.");
    const odds = quote(ctx, programOf(3), null).odds;
    for (const o of odds) expect(sc.aria).not.toContain(o);
    const looked = hubScreen(input({ state: press(at('snackCart'), ['Enter']).state }));
    expect(looked.aria).toBe('Race 3 of 8. Bank $100.00. The snack cart. Hot peanuts! Mostly warm.');
  });
});

describe('idles (render only)', () => {
  const I = hub.idle.value;

  it('nobody plays until the first turn; then one person at a time in the fixed order, A B A B, then all on A', () => {
    const c = idleClock(0);
    expect(idleAt(hub, c, 0, false)).toBeNull();
    expect(idleAt(hub, c, 3.9, false)).toBeNull();
    expect(idleAt(hub, c, 4, false)).toEqual({ person: 'regular', frame: 0 });
    expect(idleAt(hub, c, 4.25, false)).toEqual({ person: 'regular', frame: 1 });
    expect(idleAt(hub, c, 4.5, false)).toEqual({ person: 'regular', frame: 0 });
    expect(idleAt(hub, c, 4.75, false)).toEqual({ person: 'regular', frame: 1 });
    expect(idleAt(hub, c, 5, false)).toBeNull();
    for (let k = 1; k <= I.order.length + 1; k++) expect(idleAt(hub, c, 4 * k, false)?.person).toBe(I.order[(k - 1) % I.order.length]);
  });

  it('a look plays its person at once, restarts the count, and the rotation goes on', () => {
    const c = idleAfterLook(hub, idleClock(0), 9, 'snackCart'); // turns 1 (regular) and 2 (clerk2) have started
    expect(idleAt(hub, c, 9, false)).toEqual({ person: 'vendor', frame: 0 });
    expect(idleAt(hub, c, 9.25, false)).toEqual({ person: 'vendor', frame: 1 });
    expect(idleAt(hub, c, 12.9, false)).toBeNull();
    expect(idleAt(hub, c, 13, false)?.person).toBe('fanA');
  });

  it('the fans look plays fan A; the board has no idle and leaves the clock alone', () => {
    expect(idleAfterLook(hub, idleClock(0), 1, 'fans').look).toBe('fanA');
    const c = idleClock(0);
    expect(idleAfterLook(hub, c, 1, 'board')).toBe(c);
  });

  it('nothing plays with reduced motion', () => {
    expect(idleAt(hub, idleClock(0), 4, true)).toBeNull();
    expect(idleAt(hub, idleAfterLook(hub, idleClock(0), 1, 'bugler'), 1, true)).toBeNull();
  });
});
