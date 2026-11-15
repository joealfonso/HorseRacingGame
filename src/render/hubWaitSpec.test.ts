import { describe, expect, it } from 'vitest';
import { loadHub } from '../data/hubLoad';
import { ctx, dayWith, drawnOf, rd } from './betKit';
import { arriveHub, hubClick, hubHover, hubKey, hubPointerTargets, hubPricesPosted, hubScreen, type HubKeyContext, type HubState } from './hubScreen';
import { hitTest } from './pointer';

// TH7 and the states table, as changed: while the rail waits on prices, Esc or a click on any
// target other than the rail cancels; that click moves focus to its target and does nothing
// else; hover and other keys do nothing. Written from docs/specs/track-hub.md section 5, 6
// and TH7. (The first pass's TH7 tests in hubSpec.test.ts agree with this and need no change.)

const hub = loadHub();
const pending: HubKeyContext = { fieldSize: 8, ready: false };
const waiting = (): HubState => ({ ...arriveHub(hub), focus: 'rail', railWaiting: true });
const OTHERS = ['windows', 'regular', 'board', 'fans', 'bugler', 'snackCart'];

describe('TH7: a click on any other target cancels the wait', () => {
  it.each(OTHERS)('a click on %s cancels, moves focus there, and does nothing else', (id) => {
    const r = hubClick(hub, waiting(), id, pending);
    expect(r.outcome).toBeNull();
    expect(r.state.railWaiting).toBe(false);
    expect(r.state.focus).toBe(id);
    // Nothing else: no look was counted, no line shown.
    expect(r.state.looks).toEqual({});
    expect(r.state.lineShown).toBe(false);
  });

  it('after a cancelling click the prices posting starts nothing', () => {
    const r = hubClick(hub, waiting(), 'fans', pending);
    expect(hubPricesPosted(r.state).outcome).toBeNull();
  });

  it('a click on the Windows door row also cancels and opens nothing', () => {
    // The Bet row is y214-222 since book-and-window.md section 8 (was y208-219; y212 is now the Read row).
    const win = hitTest(hubPointerTargets(hub), { x: 100, y: 218 })!;
    const r = hubClick(hub, waiting(), win, pending);
    expect(r.outcome).toBeNull();
    expect(r.state).toMatchObject({ railWaiting: false, focus: 'windows' });
  });

  it('a click on the rail itself starts nothing while prices are pending', () => {
    expect(hubClick(hub, waiting(), 'rail', pending).outcome).toBeNull();
  });

  it('a click after cancelling acts normally again', () => {
    const cancelled = hubClick(hub, waiting(), 'fans', pending).state;
    expect(hubClick(hub, cancelled, 'windows', pending).outcome).toEqual({ kind: 'window', post: 1 });
    expect(hubClick(hub, cancelled, 'fans', pending).outcome).toEqual({ kind: 'look', id: 'fans' });
  });

  it('while waiting, the screen keeps the corners and cursor on the rail and the toRail voice; after the cancel it moves', () => {
    const wait = hubScreen({ hub, rd, ctx, day: dayWith(10000), drawn: drawnOf()[2], program: null, state: waiting(), seconds: 0, reducedMotion: true });
    expect(wait.voice.map((v) => v.text)).toEqual(['Off to the rail.', 'Post in a moment.']);
    expect(wait.cursor.y).toBe(224); // the Watch row's cell top since book-and-window.md section 8 (was y222)
    const after = hubScreen({ hub, rd, ctx, day: dayWith(10000), drawn: drawnOf()[2], program: null, state: hubClick(hub, waiting(), 'windows', pending).state, seconds: 0, reducedMotion: true });
    expect(after.voice[0].text).toBe('The crowd is still betting.');
    expect(after.cursor.y).toBe(215); // the Bet row since book-and-window.md section 8 (was y210)
  });
});

describe('TH7: hover and other keys do nothing during the wait', () => {
  it.each(['windows', 'regular', 'board', 'fans', 'bugler', 'snackCart', 'rail'])('hover into %s', (id) => {
    expect(hubHover(waiting(), id)).toEqual(waiting());
  });

  it.each(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Space', 'KeyZ', 'Digit1', 'Digit5', 'Digit8', 'KeyQ'])('key %s', (code) => {
    const r = hubKey(hub, waiting(), code, pending);
    expect(r.outcome).toBeNull();
    expect(r.state).toEqual(waiting());
  });

  it('Esc cancels, focus stays on the rail', () => {
    const r = hubKey(hub, waiting(), 'Escape', pending);
    expect(r.outcome).toBeNull();
    expect(r.state).toMatchObject({ railWaiting: false, focus: 'rail' });
  });

  it('prices posting while waiting starts the race once', () => {
    expect(hubPricesPosted(waiting()).outcome).toEqual({ kind: 'watch' });
  });
});
