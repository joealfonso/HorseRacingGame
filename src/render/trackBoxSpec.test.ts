import { describe, expect, it } from 'vitest';
import { loadHub } from '../data/hubLoad';
import { ctx, dayWith, drawnOf, programOf, rd } from './betKit';
import { arriveHub, hubKey, hubPointerTargets, hubScreen, type HubInput, type HubKeyContext, type HubState } from './hubScreen';
import { hitTest } from './pointer';

// The track's box (docs/specs/book-and-window.md section 8 and 18.1 item 7, TB1) and the
// track's keys (FL2 to FL4), written from the spec: three rows at cell tops y206, y215 and
// y224, item boxes x8-247 at y205-213, y214-222 and y223-231, voice rows at y185 and y194,
// focus corners only for picture targets.

const hub = loadHub();
const ready: HubKeyContext = { fieldSize: 8, ready: true };
const input = (state: HubState, over: Partial<HubInput> = {}): HubInput => ({
  hub, rd, ctx, day: dayWith(10000), drawn: drawnOf()[2], program: programOf(3), state, seconds: 0, reducedMotion: false, ...over,
});
const at = (focus: string, over: Partial<HubState> = {}): HubState => ({ ...arriveHub(hub), focus, ...over });
const press = (s: HubState, ...codes: string[]) => codes.reduce((st, c) => hubKey(hub, st, c, ready).state, s);

describe('TB1: the three rows', () => {
  it('Read, Bet and Watch draw at x20, cell tops y206, y215 and y224, with the spec\'s labels', () => {
    const sc = hubScreen(input(at('read')));
    expect(sc.doors).toHaveLength(3);
    expect(sc.doors.map((d) => [d.text, d.x, d.y])).toEqual([['Read Race 3', 20, 206], ['Bet Race 3', 20, 215], ['Just watch Race 3', 20, 224]]);
  });

  it('the item boxes are x8-247 at y205-213, y214-222 and y223-231, and they do not overlap', () => {
    const rows = hub.box.value.doorRows.map((r) => r.item);
    expect(rows).toEqual([
      { x0: 8, y0: 205, x1: 247, y1: 213 },
      { x0: 8, y0: 214, x1: 247, y1: 222 },
      { x0: 8, y0: 223, x1: 247, y1: 231 },
    ]);
    for (let i = 1; i < rows.length; i++) expect(rows[i].y0).toBeGreaterThan(rows[i - 1].y1);
  });

  it('each label sits inside its own item box (8 px of letters in 9 rows), also with the longest race number', () => {
    for (const race of [1, 8]) {
      const sc = hubScreen(input(at('read'), { drawn: drawnOf()[race - 1], program: programOf(race) }));
      sc.doors.forEach((d, i) => {
        const b = hub.box.value.doorRows[i].item;
        expect(d.y).toBeGreaterThanOrEqual(b.y0);
        expect(d.y + 7).toBeLessThanOrEqual(b.y1);
        expect(d.x).toBeGreaterThanOrEqual(b.x0);
        expect(d.x + 8 * d.text.length - 1).toBeLessThanOrEqual(b.x1);
      });
    }
  });

  it('a click in each item box acts as its row: Read opens the book, Bet the window, Watch the rail', () => {
    const targets = hubPointerTargets(hub);
    const hit = (x: number, y: number) => hitTest(targets, { x, y });
    expect(hit(8, 205)).toBe('read');
    expect(hit(247, 213)).toBe('read');
    expect(hit(8, 214)).toBe('windows');
    expect(hit(247, 222)).toBe('windows');
    expect(hit(8, 223)).toBe('rail');
    expect(hit(247, 231)).toBe('rail');
    expect(hit(100, 204)).toBeNull();
    expect(hit(100, 232)).toBeNull();
  });

  it('the voice rows are at y185 and y194, x20, with the race line and the day\'s flavor line', () => {
    const sc = hubScreen(input(at('read')));
    expect(sc.voice.map((v) => [v.x, v.y])).toEqual([[20, 185], [20, 194]]);
    expect(sc.voice[0].text).toBe('Race 3 is up.');
  });

  it('with Read focused no focus corners are drawn, and the horseshoe is on the Read row', () => {
    for (const reduced of [false, true]) {
      for (const seconds of [0, 0.3, 0.6]) {
        const sc = hubScreen(input(at('read'), { seconds, reducedMotion: reduced }));
        expect(sc.corners).toEqual([]);
        expect(sc.cursor.y).toBe(206);
      }
    }
  });

  it('with Bet or Watch or any picture target focused the four corners are drawn, and the horseshoe moves to that row', () => {
    for (const id of ['windows', 'rail', 'regular', 'board', 'fans', 'bugler', 'snackCart']) {
      expect(hubScreen(input(at(id))).corners, id).toHaveLength(4);
    }
    expect(hubScreen(input(at('windows'))).cursor.y).toBe(215);
    expect(hubScreen(input(at('rail'))).cursor.y).toBe(224);
  });

  it('the status bar and the board still read the race and the bank as approved', () => {
    const sc = hubScreen(input(at('read')));
    expect(sc.status[0].text).toBe('Race 3 of 8');
    expect(sc.status[1].text).toBe('Bank $100.00');
  });
});

describe('FL2 to FL4 at the track', () => {
  it('FL2: arrival is Read; back from the book or the window is Bet', () => {
    expect(arriveHub(hub, {}, 'arrival').focus).toBe('read');
    expect(arriveHub(hub, {}, 'back').focus).toBe('windows');
    expect(arriveHub(hub, { fans: 2 }, 'arrival').looks).toEqual({ fans: 2 });
  });

  it('FL3: Up and Down visit Read, Bet, Watch and wrap, both ways', () => {
    const down = [at('read')];
    for (let i = 0; i < 6; i++) down.push(press(down[i], 'ArrowDown'));
    expect(down.map((s) => s.focus)).toEqual(['read', 'windows', 'rail', 'read', 'windows', 'rail', 'read']);
    const up = [at('read')];
    for (let i = 0; i < 6; i++) up.push(press(up[i], 'ArrowUp'));
    expect(up.map((s) => s.focus)).toEqual(['read', 'rail', 'windows', 'read', 'rail', 'windows', 'read']);
  });

  it('FL3: from a lookable, Up, Down and Esc go to Read; Esc on a row does nothing', () => {
    for (const id of ['regular', 'board', 'fans', 'bugler', 'snackCart']) {
      for (const c of ['ArrowUp', 'ArrowDown', 'Escape']) expect(press(at(id), c).focus, `${id} ${c}`).toBe('read');
    }
    for (const id of ['read', 'windows', 'rail']) expect(press(at(id), 'Escape').focus).toBe(id);
  });

  it('FL3: Left and Right visit the seven picture targets and come back round, and Read is not one of them', () => {
    let s = at('windows');
    const seen = [s.focus];
    for (let i = 0; i < 7; i++) { s = press(s, 'ArrowRight'); seen.push(s.focus); }
    expect(seen[7]).toBe('windows');
    expect(new Set(seen.slice(0, 7)).size).toBe(7);
    expect(seen).not.toContain('read');
    expect(seen.slice(0, 7).sort()).toEqual(['board', 'bugler', 'fans', 'rail', 'regular', 'snackCart', 'windows']);
  });

  it('FL4: Enter on Read opens the book; Enter on Bet opens the window choosing on post 1; Enter on Watch goes to the post', () => {
    expect(hubKey(hub, at('read'), 'Enter', ready).outcome).toEqual({ kind: 'book' });
    expect(hubKey(hub, at('windows'), 'Enter', ready).outcome).toEqual({ kind: 'window', post: 1 });
    expect(hubKey(hub, at('rail'), 'Enter', ready).outcome).toEqual({ kind: 'watch' });
  });

  it('FL4: digit k opens the window on post k from any focus; digits above the field size do nothing', () => {
    for (const focus of ['read', 'windows', 'rail', 'regular', 'fans']) {
      for (let k = 1; k <= 8; k++) expect(hubKey(hub, at(focus), `Digit${k}`, ready).outcome, `${focus} ${k}`).toEqual({ kind: 'window', post: k });
      expect(hubKey(hub, at(focus), 'Digit9', ready).outcome).toBeNull();
      expect(hubKey(hub, at(focus), 'Digit7', { fieldSize: 6, ready: true }).outcome).toBeNull();
    }
  });

  it('FL4: a digit opens the window even while the prices are pending', () => {
    expect(hubKey(hub, at('read'), 'Digit3', { fieldSize: 8, ready: false }).outcome).toEqual({ kind: 'window', post: 3 });
  });
});
