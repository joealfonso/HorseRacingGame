import { describe, expect, it } from 'vitest';
import bettingJson from '../data/betting.json';
import hubJson from '../data/hub.json';
import { quote } from '../bet/day';
import { offeredAmounts } from '../bet/money';
import { loadHub } from '../data/hubLoad';
import { ctx, dayWith, drawnOf, paint, posted, programOf, rd, settled } from './betKit';
import { hitTest } from './pointer';
import { lastBetDollars, type ProgramKeyContext } from './programScreen';
import {
  clerkFrame, clerkLine, initialWindowState, windowClick, windowFromBook, windowKey, windowPointerTargets, windowScreen,
  type WindowInput, type WindowState,
} from './windowScreen';

// The window, written from docs/specs/book-and-window.md sections 7, 9, 10 and 13 and
// 14 (WI1 to WI6), with the art-director's 19.3 and 20 where they differ (sign plate at
// x16-79, y28-39). Expected pixels and strings are the spec's, typed here.

const hub = loadHub();
const START = 10000;
const offered = offeredAmounts(START, ctx.rules);
const k = (over: Partial<ProgramKeyContext> = {}): ProgramKeyContext => ({ horses: 8, ready: true, offered, lastDollars: null, ...over });
const drawn = drawnOf()[2]; // race 3
const names = [...drawn.input.card.horses].sort((a, b) => a.post - b.post).map((h) => h.name);
const input = (over: Partial<WindowInput> = {}): WindowInput => ({
  hub, rd, ctx, day: dayWith(START), drawn, program: programOf(3), state: initialWindowState(), clerk: { ticket: 0, punch: 0 }, ...over,
});
const ticketAt = (post: number, dollars = offered[0]): WindowState => ({ focus: post - 1, mode: { kind: 'ticket', dollars } });
const BANNED = ['injury', 'injured', 'hurt', 'lame', 'limping', 'fell', 'fall', 'vet', 'scratched', 'ambulance', 'favorite', 'tip', 'pick', 'lock', 'sure thing', 'cash', 'buy', 'official', ...bettingJson.copy.bannedWords, ...hubJson.copy.bannedWords];
const bannedIn = (s: string) => BANNED.some((w) => new RegExp(`(?<![A-Za-z0-9])${w}(?![A-Za-z0-9])`, 'i').test(s));

describe('WI1: each row shows the post box, the name and the odds; the odds are BP3', () => {
  it('row i: the cell top is y112 + 11i, the post box is x20-31 (12 wide) from one row above, the name starts at x36, the odds end at x247', () => {
    const sc = windowScreen(input());
    expect(sc.rows).toHaveLength(8);
    sc.rows.forEach((row, i) => {
      const top = 112 + 11 * i;
      const px = paint(row.rects);
      expect(px.get(`20,${top - 1}`), `row ${i} box corner`).toBe('Ash');
      expect(px.get(`31,${top - 1 + 9}`)).toBe('Ash');
      expect(px.get(`19,${top}`)).toBeUndefined();
      expect(px.get(`32,${top}`)).toBeUndefined();
      expect(px.get(`25,${top + 3}`)).not.toBe('Ash'); // the saddlecloth inside the border
      const name = row.texts.find((t) => t.text === names[i])!;
      expect(name).toMatchObject({ x: 36, y: top, color: 'Bone' });
      expect(name.text.length).toBeLessThanOrEqual(18);
      const odds = row.texts.find((t) => t.x + 8 * t.text.length === 248)!;
      expect(odds).toMatchObject({ y: top, color: 'Bone' });
      const num = row.texts.find((t) => t.small === true)!;
      expect(num.text).toBe(String(i + 1));
    });
  });

  it('with no ticket open the odds are the crowd\'s prices with no bet in the pool', () => {
    for (const state of [initialWindowState(1), initialWindowState(5)]) {
      const sc = windowScreen(input({ state }));
      const want = quote(ctx, programOf(3), null).odds;
      sc.rows.forEach((row, i) => expect(row.texts.find((t) => t.x + 8 * t.text.length === 248)!.text).toBe(want[i]));
    }
  });

  it('with the ticket open the odds on every row are the odds with that amount on that horse in the pool', () => {
    for (const post of [1, 4, 8]) {
      for (const dollars of offered.slice(0, 3)) {
        const sc = windowScreen(input({ state: ticketAt(post, dollars) }));
        const want = quote(ctx, programOf(3), { post, dollars }).odds;
        sc.rows.forEach((row, i) => expect(row.texts.find((t) => t.x + 8 * t.text.length === 248)!.text).toBe(want[i]));
      }
    }
    // and the amount changes the prices (otherwise the check above proves nothing)
    const a = quote(ctx, programOf(3), { post: 1, dollars: offered[0] }).odds;
    const b = quote(ctx, programOf(3), { post: 1, dollars: offered[offered.length - 1] }).odds;
    expect(a).not.toEqual(b);
  });

  it('no stats, style, blurb or estimate is drawn or read out', () => {
    const horses = [...drawn.input.card.horses];
    for (const state of [initialWindowState(), ticketAt(2)]) {
      const sc = windowScreen(input({ state }));
      const drawnText = [...sc.status.map((t) => t.text), sc.sign.text, sc.clerkLine.text, ...sc.rows.flatMap((r) => r.texts.map((t) => t.text)), ...sc.ticket.map((t) => t.text)];
      for (const h of horses) {
        for (const stat of Object.values(h.stats)) expect(drawnText).not.toContain(String(stat));
        expect(sc.aria).not.toContain(h.jockey);
      }
      for (const style of Object.values(rd.copy.card.styles)) expect(drawnText.join('|')).not.toContain(style);
      for (const head of Object.values(rd.copy.program.heads)) if (head !== rd.copy.program.heads.odds) expect(drawnText).not.toContain(head);
      expect(sc.aria).not.toMatch(/\d+(\.\d+)?%|chance|estimate|speed|stam|kick/i);
      expect(drawnText.every((t) => !/%/.test(t))).toBe(true);
    }
  });

  it('the status bar reads "Race 3 of 8" and the bank, Bone, at cell top y4', () => {
    const sc = windowScreen(input());
    expect(sc.status[0]).toMatchObject({ text: 'Race 3 of 8', x: 4, y: 4, color: 'Bone' });
    expect(sc.status[1]).toMatchObject({ text: 'Bank $100.00', x: 252 - 8 * 12, y: 4, color: 'Bone' });
  });

  it('the sign says "Windows" from data on the plate at x16-79, y28-39, cell top y30, centered', () => {
    const sc = windowScreen(input());
    expect(sc.sign).toMatchObject({ text: 'Windows', y: 30 });
    expect(sc.sign.x).toBe(16 + Math.floor((64 - 8 * 7) / 2));
  });

  it('the choosing screen: the horseshoe at x8 on the focused row, "Esc: back" right-aligned to x247 on ticket row 2 (y220), ticket row 1 blank', () => {
    const sc = windowScreen(input({ state: initialWindowState(4) }));
    expect(sc.cursor).toEqual({ x: 8, y: 112 + 33 });
    expect(sc.marker).toBeNull();
    expect(sc.ticket).toEqual([{ text: 'Esc: back', x: 248 - 72, y: 220, color: 'Bone' }]);
  });

  it('the ticket open: the cursor on ticket row 1 (x8, y208), the yours marker on the horse\'s row at x8, the approved strings', () => {
    const sc = windowScreen(input({ state: ticketAt(3, offered[1]) }));
    expect(sc.cursor).toEqual({ x: 8, y: 208 });
    expect(sc.marker).toEqual({ x: 8, y: 112 + 22 });
    const [amount, confirm, pays] = sc.ticket;
    expect(amount).toMatchObject({ x: 20, y: 208 });
    expect(amount.text).toContain(`$${offered[1]}`);
    expect(amount.text).toContain('on #3');
    expect(confirm).toMatchObject({ text: 'Enter: bet', x: 248 - 80, y: 208 });
    expect(pays).toMatchObject({ x: 20, y: 220 });
    expect(pays.text).toMatch(/^\$\d+ to win pays \$\d+\.\d\d$/);
    expect(sc.ticket.some((t) => t.text === 'Esc: back')).toBe(false);
  });

  it('with one amount offered there are no arrows', () => {
    const one = offeredAmounts(200, ctx.rules);
    expect(one).toHaveLength(1);
    const sc = windowScreen(input({ day: dayWith(200), state: ticketAt(3, one[0]) }));
    expect(sc.ticket[0].text).not.toMatch(/[<>]/);
    expect(windowPointerTargets(hub, rd, ticketAt(3, one[0]), k({ offered: one })).map((t) => t.id)).not.toContain('less');
    expect(windowPointerTargets(hub, rd, ticketAt(3, one[0]), k({ offered: one })).map((t) => t.id)).not.toContain('more');
  });
});

describe('WI2: the bet lowers the bankroll once, plays the stamp, draws the slip at x8-247, y209-235 with nothing above its torn edge', () => {
  const stakeCents = offered[0] * 100;
  const placedDay = posted(programOf(3), { ...dayWith(START), nextRace: 3 }, { post: 3, dollars: offered[0] });
  const sc = windowScreen(input({ day: placedDay, state: { focus: 2, mode: { kind: 'placed' } } }));

  it('goToPost takes the stake out once and the status bar shows the bank cut by the stake', () => {
    expect(placedDay.bankrollCents).toBe(START - stakeCents);
    expect(sc.status[1].text).toBe(`Bank $${((START - stakeCents) / 100).toFixed(2)}`);
  });

  it('every slip pixel lies in x8-247, y209-235, none above row 209, and none is Parchment (the Navy box shows above the torn edge)', () => {
    expect(sc.slip.length).toBeGreaterThan(0);
    for (const r of sc.slip) {
      expect(r.x).toBeGreaterThanOrEqual(8);
      expect(r.x + r.w - 1).toBeLessThanOrEqual(247);
      expect(r.y).toBeGreaterThanOrEqual(209);
      expect(r.y + r.h - 1).toBeLessThanOrEqual(235);
      expect(r.color).not.toBe('Parchment');
    }
    const px = paint(sc.slip);
    expect(px.get('100,208')).toBeUndefined();
    expect(px.get('100,235')).toBeDefined();
    expect(px.get('8,235')).toBeDefined();
    expect(px.get('247,235')).toBeDefined();
    // every column has its torn edge: the first painted row is within the top three rows of the slip
    for (let x = 8; x <= 247; x++) {
      const top = [209, 210, 211, 212].find((y) => px.has(`${x},${y}`));
      expect(top, `column ${x}`).toBeDefined();
      expect(top).toBeLessThanOrEqual(211);
    }
  });

  it('the printed lines are the approved tote ticket\'s, on the slip, and the open ticket\'s rows are gone', () => {
    expect(sc.ticket).toHaveLength(2);
    expect(sc.ticket.every((t) => t.y >= 209 && t.y <= 235 && t.x >= 8 && t.x + 8 * t.text.length - 1 <= 247)).toBe(true);
    expect(sc.ticket.some((t) => t.text === 'Enter: bet' || t.text === 'Esc: back')).toBe(false);
    expect(sc.cursor).toBeNull();
  });

  it('the yours marker stays on the horse\'s row, and the odds carry the bet', () => {
    expect(sc.marker).toEqual({ x: 8, y: 112 + 22 });
    const want = quote(ctx, programOf(3), { post: 3, dollars: offered[0] }).odds;
    sc.rows.forEach((row, i) => expect(row.texts.find((t) => t.x + 8 * t.text.length === 248)!.text).toBe(want[i]));
  });

  it('a second bet cannot be placed from the placed state, by any key', () => {
    const placed: WindowState = { focus: 2, mode: { kind: 'placed' } };
    for (const c of ['Enter', 'Space', 'KeyZ', 'NumpadEnter', 'Escape', 'ArrowLeft', 'Digit3']) expect(windowKey(placed, c, k())).toEqual({ state: placed, outcome: null });
    for (const id of ['bet', 'row:3', 'back', 'less', 'more'] as const) expect(windowClick(placed, id, k())).toEqual({ state: placed, outcome: null });
    expect(windowPointerTargets(hub, rd, placed, k())).toEqual([]);
  });

  it('the clerk plays his stamp frame once on the bet, then rests; nothing moves with reduced motion', () => {
    expect(clerkFrame(hub, 5, 0, false)).toBe(1);
    expect(clerkFrame(hub, 5, hubJson.idle.value.stepSeconds + 0.01, false)).toBe(0);
    expect(clerkFrame(hub, 5, 0, true)).toBe(0);
  });
});

describe('BP5 to BP10 at the window, as amended', () => {
  it('the only way to a bet is Enter, Space or Z on an open ticket (BP10 and FL6)', () => {
    const codes = ['Enter', 'NumpadEnter', 'Space', 'KeyZ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape', 'Digit1', 'Digit8', 'KeyA'];
    for (let post = 1; post <= 8; post++) {
      for (const c of codes) expect(windowKey(initialWindowState(post), c, k()).outcome?.kind === 'bet', `choosing ${c}`).toBe(false);
    }
    const open = ticketAt(3, offered[1]);
    const bets = codes.filter((c) => windowKey(open, c, k()).outcome?.kind === 'bet');
    expect(bets.sort()).toEqual(['Enter', 'NumpadEnter', 'Space', 'KeyZ'].sort());
    expect(windowKey(open, 'Enter', k()).outcome).toEqual({ kind: 'bet', post: 3, dollars: offered[1] });
  });

  it('initial focus: post 1, or post k from a digit at the track, or the horse carried from the book; the ticket opens at the remembered amount', () => {
    expect(initialWindowState().focus).toBe(0);
    expect(initialWindowState(6).focus).toBe(5);
    const fromBook = windowFromBook(4, k({ lastDollars: offered[2] }));
    expect(fromBook).toEqual(ticketAt(4, offered[2]));
    expect(windowFromBook(4, k()).mode).toEqual({ kind: 'ticket', dollars: offered[0] });
  });

  it('the remembered amount is the last amount bet in the day, when it is still offered', () => {
    const day = settled(programOf(1), dayWith(START), { post: 2, dollars: offered[3] }, 5);
    expect(lastBetDollars(day)).toBe(offered[3]);
  });

  it('Left and Right step the offered amounts, stopping at the ends; Esc closes the ticket on the same horse (WI3)', () => {
    let s = ticketAt(5, offered[0]);
    s = windowKey(s, 'ArrowLeft', k()).state;
    expect(s).toEqual(ticketAt(5, offered[0]));
    for (let i = 1; i < offered.length; i++) s = windowKey(s, 'ArrowRight', k()).state;
    expect(s).toEqual(ticketAt(5, offered[offered.length - 1]));
    expect(windowKey(s, 'ArrowRight', k()).state).toEqual(s);
    expect(windowKey(s, 'Escape', k())).toEqual({ state: initialWindowState(5), outcome: null });
  });

  it('WI3: Esc while choosing is the way back to the track', () => {
    expect(windowKey(initialWindowState(5), 'Escape', k()).outcome).toEqual({ kind: 'back' });
  });

  it('Up and Down wrap with no Pass; digits jump; digits above the field do nothing', () => {
    expect(windowKey(initialWindowState(1), 'ArrowUp', k()).state.focus).toBe(7);
    expect(windowKey(initialWindowState(8), 'ArrowDown', k()).state.focus).toBe(0);
    expect(windowKey(initialWindowState(1), 'Digit8', k()).state.focus).toBe(7);
    expect(windowKey(initialWindowState(1), 'Digit8', k({ horses: 7 })).state.focus).toBe(0);
  });
});

describe('WI4: while the prices are pending', () => {
  const pending = input({ program: null });
  it('every odds is "-", the clerk says the crowd is still betting', () => {
    const sc = windowScreen(pending);
    for (const row of sc.rows) expect(row.texts.find((t) => t.x + 8 * t.text.length === 248)!.text).toBe('-');
    expect(sc.clerkLine.text).toBe('The crowd is still betting.');
    expect(sc.aria).toContain('The crowd is still betting.');
  });

  it('Enter, Space and Z on a horse do nothing; Esc works; digits and arrows still move the cursor', () => {
    for (const c of ['Enter', 'Space', 'KeyZ']) expect(windowKey(initialWindowState(2), c, k({ ready: false }))).toEqual({ state: initialWindowState(2), outcome: null });
    expect(windowKey(initialWindowState(2), 'Escape', k({ ready: false })).outcome).toEqual({ kind: 'back' });
    expect(windowKey(initialWindowState(2), 'ArrowDown', k({ ready: false })).state.focus).toBe(2);
  });

  it('a click on a row only focuses it while pending; "Esc: back" still works', () => {
    expect(windowClick(initialWindowState(1), 'row:4', k({ ready: false }))).toEqual({ state: initialWindowState(4), outcome: null });
    expect(windowClick(initialWindowState(1), 'back', k({ ready: false })).outcome).toEqual({ kind: 'back' });
  });
});

describe('WI5: every pointer target of section 10 calls the same action as its key', () => {
  const at = (s: WindowState, x: number, y: number, kk = k()) => hitTest(windowPointerTargets(hub, rd, s, kk), { x, y });
  const choosing = initialWindowState(1);

  it('choosing: row i is x8-247, y111 + 11i to y121 + 11i; "Esc: back" x176-247, y218-229; nothing else, not the picture', () => {
    for (let i = 0; i < 8; i++) {
      expect(at(choosing, 8, 111 + 11 * i)).toBe(`row:${i + 1}`);
      expect(at(choosing, 247, 121 + 11 * i)).toBe(`row:${i + 1}`);
      expect(at(choosing, 7, 116 + 11 * i)).toBeNull();
      expect(at(choosing, 248, 116 + 11 * i)).toBeNull();
    }
    expect(at(choosing, 176, 218)).toBe('back');
    expect(at(choosing, 247, 229)).toBe('back');
    expect(at(choosing, 175, 220)).toBeNull();
    expect(at(choosing, 200, 217)).toBeNull();
    for (const [x, y] of [[0, 16], [255, 87], [128, 60], [100, 40], [140, 70], [50, 78]]) expect(at(choosing, x, y)).toBeNull();
  });

  it('ticket open: "<" and ">" are each glyph\'s 8x8 cell plus 4 px each side, rows y206-217; "Enter: bet" is x164-247, y206-217', () => {
    const s = ticketAt(3, offered[1]);
    const line = windowScreen(input({ state: s })).ticket[0].text; // "< $10 >  on #3"
    const lt = 20 + 8 * line.indexOf('<');
    const gt = 20 + 8 * line.indexOf('>');
    for (const [x, id] of [[lt - 4, 'less'], [lt + 7 + 4, 'less'], [gt - 4, 'more'], [gt + 7 + 4, 'more']] as const) {
      expect(at(s, x, 206), `${id} left/right edge`).toBe(id);
      expect(at(s, x, 217)).toBe(id);
      expect(at(s, x, 205)).toBeNull();
      expect(at(s, x, 218)).toBeNull();
    }
    expect(at(s, lt - 5, 210)).toBeNull();
    expect(at(s, 164, 206)).toBe('bet');
    expect(at(s, 247, 217)).toBe('bet');
    expect(at(s, 163, 210)).toBeNull();
    expect(at(s, 247, 218)).toBeNull(); // "Esc: back" is not drawn with the ticket open
  });

  it('ticket open: the row being bet is not a target, every other row is', () => {
    const s = ticketAt(3, offered[0]);
    expect(at(s, 100, 111 + 22)).toBeNull();
    for (const post of [1, 2, 4, 5, 6, 7, 8]) expect(at(s, 100, 116 + 11 * (post - 1))).toBe(`row:${post}`);
  });

  it('each target does what its key does', () => {
    const s = ticketAt(3, offered[1]);
    expect(windowClick(s, 'less', k())).toEqual(windowKey(s, 'ArrowLeft', k()));
    expect(windowClick(s, 'more', k())).toEqual(windowKey(s, 'ArrowRight', k()));
    expect(windowClick(s, 'bet', k())).toEqual(windowKey(s, 'Enter', k()));
    expect(windowClick(initialWindowState(1), 'back', k())).toEqual(windowKey(initialWindowState(1), 'Escape', k()));
    for (let post = 1; post <= 8; post++) {
      expect(windowClick(initialWindowState(1), `row:${post}`, k())).toEqual(windowKey(windowKey(initialWindowState(1), `Digit${post}`, k()).state, 'Enter', k()));
    }
  });

  it('a click on the row being bet does nothing, so a double click can never bet', () => {
    const s = ticketAt(3, offered[1]);
    expect(windowClick(s, 'row:3', k())).toEqual({ state: s, outcome: null });
  });

  it('a click on another row with the ticket open moves the ticket to that horse at the same amount', () => {
    const s = ticketAt(3, offered[2]);
    expect(windowClick(s, 'row:6', k())).toEqual({ state: ticketAt(6, offered[2]), outcome: null });
  });

  it('during the bet beat nothing is a target', () => {
    expect(windowPointerTargets(hub, rd, { focus: 2, mode: { kind: 'placed' } }, k())).toEqual([]);
  });
});

describe('WI6: the clerk\'s lines', () => {
  const ticket = ["Pencil's sharp. Ready.", 'Take your time. No rush.', 'Ready when you are.'];
  const punch = ['There you go. Enjoy it.', 'Fresh off the machine.', 'Mind the peanut shells.'];

  it('every line fits 28 characters and holds no banned word, including the longest race number', () => {
    const lines = [
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((r) => clerkLine(hub, rd, 'choosing', true, r, 0, 0)),
      clerkLine(hub, rd, 'choosing', false, 3, 0, 0),
      ...[1, 2, 3, 4, 5, 6, 7].flatMap((n) => [clerkLine(hub, rd, 'ticket', true, 3, n, 0), clerkLine(hub, rd, 'placed', true, 3, 0, n)]),
    ];
    for (const l of lines) { expect(l.length, l).toBeLessThanOrEqual(28); expect(bannedIn(l), l).toBe(false); }
  });

  it('the lines are the spec\'s, in the spec\'s order, one per use, and wrap', () => {
    expect(clerkLine(hub, rd, 'choosing', true, 3, 0, 0)).toBe('Race 3. Who do you like?');
    expect([1, 2, 3, 4, 5, 6].map((n) => clerkLine(hub, rd, 'ticket', true, 3, n, 0))).toEqual([...ticket, ...ticket]);
    expect([1, 2, 3, 4].map((n) => clerkLine(hub, rd, 'placed', true, 3, 0, n))).toEqual([...punch, punch[0]]);
  });

  it('the clerk never comments on the horse picked, the price or the chance', () => {
    const all = [...ticket, ...punch, 'Race 3. Who do you like?'].join(' ');
    expect(all).not.toMatch(/\d+-\d+|\$|good|great|bold|smart|winner|likely|chance|odds|long ?shot|favorite/i);
  });

  it('the line is drawn at x20, cell top y98, Bone, and the cycle does not depend on the horse or the amount (no RNG)', () => {
    const a = windowScreen(input({ state: ticketAt(2, offered[0]), clerk: { ticket: 2, punch: 0 } }));
    const b = windowScreen(input({ state: ticketAt(7, offered[2]), clerk: { ticket: 2, punch: 0 } }));
    expect(a.clerkLine).toEqual({ text: ticket[1], x: 20, y: 98, color: 'Bone' });
    expect(b.clerkLine).toEqual(a.clerkLine);
  });
});
