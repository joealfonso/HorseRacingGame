import { describe, expect, it, vi } from 'vitest';
import bettingJson from '../data/betting.json';
import { quote, type DayState } from '../bet/day';
import { offeredAmounts } from '../bet/money';
import { bannedWordIn } from '../data/bookText';
import { loadHub } from '../data/hubLoad';
import { ctx, dayWith, drawnOf, posted, programOf, rd } from './betKit';
import { hitTest } from './pointer';
import { TORN_EDGE, type ProgramKeyContext } from './programScreen';
import {
  WINDOW_POINTER_KEYS, clerkFrame, clerkLine, cycleLine, initialWindowState, windowClick, windowFromBook, windowKey, windowPointerTargets, windowScreen,
  type WindowInput, type WindowState,
} from './windowScreen';

// The window (docs/specs/book-and-window.md sections 7, 9 and 10; WI1 to WI6 and BP5 to BP10
// as amended). Expected values are the spec's.

const hub = loadHub();
const START = 10000;
const offered = offeredAmounts(START, ctx.rules);
const k = (over: Partial<ProgramKeyContext> = {}): ProgramKeyContext => ({ horses: 8, ready: true, offered, lastDollars: null, ...over });
const choosing = (post = 1): WindowState => initialWindowState(post);
const ticket = (post: number, dollars = offered[0]): WindowState => ({ focus: post - 1, mode: { kind: 'ticket', dollars } });
const input = (over: Partial<WindowInput> = {}): WindowInput => ({
  hub, rd, ctx, day: dayWith(START), drawn: drawnOf()[2], program: programOf(3), state: choosing(), clerk: { ticket: 0, punch: 0 }, ...over,
});
const at = (s: WindowState, x: number, y: number, kk = k()) => hitTest(windowPointerTargets(hub, rd, s, kk), { x, y });

describe('keys (section 2; BP5 to BP9 at the window)', () => {
  it('Up and Down wrap through the posts with no Pass stop; digits jump; digits above the field do nothing', () => {
    expect(windowKey(choosing(1), 'ArrowUp', k()).state.focus).toBe(7);
    expect(windowKey(choosing(8), 'ArrowDown', k()).state.focus).toBe(0);
    expect(windowKey(choosing(1), 'Digit6', k()).state.focus).toBe(5);
    expect(windowKey(choosing(1), 'Digit7', k({ horses: 6 })).state.focus).toBe(0);
  });

  it('Enter, Space or Z opens the ticket at the remembered amount; Esc while choosing goes back', () => {
    for (const code of ['Enter', 'Space', 'KeyZ']) expect(windowKey(choosing(3), code, k()).state).toEqual(ticket(3, offered[0]));
    expect(windowKey(choosing(3), 'Enter', k({ lastDollars: offered[2] })).state).toEqual(ticket(3, offered[2]));
    expect(windowKey(choosing(3), 'Escape', k()).outcome).toEqual({ kind: 'back' });
  });

  it('WI4: while pending Enter does nothing; Esc still goes back', () => {
    expect(windowKey(choosing(3), 'Enter', k({ ready: false }))).toEqual({ state: choosing(3), outcome: null });
    expect(windowKey(choosing(3), 'Escape', k({ ready: false })).outcome).toEqual({ kind: 'back' });
  });

  it('ticket open: Left and Right step the offered amounts and stop at the ends; Enter places the bet; Esc closes on the same horse (WI3)', () => {
    expect(windowKey(ticket(3, offered[0]), 'ArrowRight', k()).state).toEqual(ticket(3, offered[1]));
    expect(windowKey(ticket(3, offered[0]), 'ArrowLeft', k()).state).toEqual(ticket(3, offered[0]));
    const top = offered[offered.length - 1];
    expect(windowKey(ticket(3, top), 'ArrowRight', k()).state).toEqual(ticket(3, top));
    expect(windowKey(ticket(3, offered[1]), 'Enter', k())).toEqual({ state: { focus: 2, mode: { kind: 'placed' } }, outcome: { kind: 'bet', post: 3, dollars: offered[1] } });
    expect(windowKey(ticket(3), 'Escape', k())).toEqual({ state: choosing(3), outcome: null });
  });

  it('FL6: only Enter on an open ticket bets; no key bets while choosing, and nothing acts on the bet beat', () => {
    const codes = ['Enter', 'Space', 'KeyZ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Digit3', 'Escape', 'KeyQ'];
    for (const c of codes) expect(windowKey(choosing(2), c, k()).outcome?.kind === 'bet').toBe(false);
    for (const c of codes) expect(windowKey({ focus: 2, mode: { kind: 'placed' } }, c, k()).outcome).toBeNull();
  });

  it('from the book, the ticket opens on that horse at the remembered amount (BB4)', () => {
    expect(windowFromBook(5, k({ lastDollars: offered[1] }))).toEqual(ticket(5, offered[1]));
    expect(windowFromBook(5, k({ ready: false }))).toEqual(choosing(5));
  });
});

describe('WI1: the rows', () => {
  it('post box, name and odds at row i\'s cell top y112 + 11i, the box 12x10 with an Ash border at x20', () => {
    const sc = windowScreen(input());
    const odds = quote(ctx, programOf(3), null).odds;
    sc.rows.forEach((r, i) => {
      const top = 112 + 11 * i;
      expect(r.rects[0]).toEqual({ x: 20, y: top - 1, w: 12, h: 10, color: 'Ash' });
      expect(r.texts[0]).toMatchObject({ text: String(i + 1), x: 24, y: top + 1, small: true });
      expect(r.texts[1]).toMatchObject({ x: 36, y: top, color: 'Bone' });
      expect(r.texts[2]).toMatchObject({ text: odds[i], y: top, color: 'Bone' });
      expect(r.texts[2].x + 8 * r.texts[2].text.length - 1).toBe(247);
    });
  });

  it('BP3: with the ticket open every row\'s odds carry its amount; none otherwise', () => {
    const open = windowScreen(input({ state: ticket(3, offered[2]) }));
    expect(open.rows.map((r) => r.texts[2].text)).toEqual(quote(ctx, programOf(3), { post: 3, dollars: offered[2] }).odds);
    expect(windowScreen(input()).rows.map((r) => r.texts[2].text)).toEqual(quote(ctx, programOf(3), null).odds);
  });

  it('no stats, style, blurb or estimate is drawn or read out', () => {
    const sc = windowScreen(input());
    const all = [...sc.status, sc.sign, sc.clerkLine, ...sc.rows.flatMap((r) => r.texts), ...sc.ticket].map((t) => t.text).join(' ');
    for (const s of Object.values(rd.copy.card.styles)) expect(all).not.toContain(s);
    for (const h of Object.values(rd.copy.program.heads)) expect(all).not.toContain(h);
    expect(sc.aria).not.toMatch(/Speed|Stam\.|Kick/);
  });

  it('WI4: pending: every odds "-", the pending line', () => {
    const sc = windowScreen(input({ program: null }));
    expect(sc.rows.map((r) => r.texts[2].text)).toEqual(Array(8).fill('-'));
    expect(sc.rows.every((r) => r.texts[2].x === 240)).toBe(true);
    expect(sc.clerkLine).toEqual({ text: 'The crowd is still betting.', x: 20, y: 98, color: 'Bone' });
  });
});

describe('the ticket rows and the bet beat (section 7, WI2)', () => {
  it('choosing: row 1 blank, "Esc: back" right-aligned to x247 on row 2, the cursor on the focused row', () => {
    const sc = windowScreen(input({ state: choosing(4) }));
    expect(sc.ticket).toEqual([{ text: 'Esc: back', x: 176, y: 220, color: 'Bone' }]);
    expect(sc.cursor).toEqual({ x: 8, y: 112 + 33 });
    expect(sc.marker).toBeNull();
  });

  it('ticket open: the cursor on ticket row 1, the yours marker on the horse\'s row, the approved strings', () => {
    const sc = windowScreen(input({ state: ticket(3, 10) }));
    const pays = quote(ctx, programOf(3), { post: 3, dollars: 10 }).paysCents!;
    expect(sc.cursor).toEqual({ x: 8, y: 208 });
    expect(sc.marker).toEqual({ x: 8, y: 134 });
    expect(sc.ticket.map((t) => [t.text, t.x, t.y])).toEqual([
      ['< $10 >  on #3', 20, 208], ['Enter: bet', 168, 208], [`$10 to win pays $${(pays / 100).toFixed(2)}`, 20, 220],
    ]);
  });

  it('the bet beat: the bank down by the stake, the slip from its torn edge down at x8-247, y209-235, the two printed lines, no cursor', () => {
    const day: DayState = posted(programOf(3), { ...dayWith(START), nextRace: 3 }, { post: 3, dollars: 10 });
    const sc = windowScreen(input({ day, state: { focus: 2, mode: { kind: 'placed' } }, clerk: { ticket: 1, punch: 1 } }));
    expect(sc.status[1].text).toBe('Bank $90.00');
    expect(sc.cursor).toBeNull();
    expect(sc.marker).toEqual({ x: 8, y: 134 });
    expect(sc.ticket.map((t) => [t.text, t.x, t.y])).toEqual([[`Race 3, $10 to win on #3`, 16, 215], [`${drawnOf()[2].input.card.horses[2].name} at ${day.open!.ticket!.odds}`, 16, 225]]);
    for (const r of sc.slip) {
      expect(r.x >= 8 && r.x + r.w - 1 <= 247 && r.y >= 209 && r.y + r.h - 1 <= 235, JSON.stringify(r)).toBe(true);
    }
    // Nothing above the torn edge: column x's first slip pixel is at 209 + TORN_EDGE[(x - 8) mod 24].
    for (let x = 8; x <= 247; x++) {
      const top = Math.min(...sc.slip.filter((r) => x >= r.x && x < r.x + r.w).map((r) => r.y));
      expect(top, `x${x}`).toBe(209 + TORN_EDGE[(x - 8) % 24]);
    }
    expect(sc.clerkLine.text).toBe('There you go. Enjoy it.');
  });
});

describe('WI6: the clerk', () => {
  const c = hub.copy.window;
  const banned = [...bettingJson.copy.bannedWords, ...hub.copy.bannedWords];

  it('every line fits 28 and holds no banned word', () => {
    for (const l of [c.choose.replace('{r}', '8'), ...c.ticket, ...c.punch, rd.copy.program.pending]) {
      expect(l.length, l).toBeLessThanOrEqual(28);
      expect(bannedWordIn(l, banned), l).toBeNull();
    }
  });

  it('the cycles advance one per use from line 1, wrap, and draw no random number', () => {
    const rand = vi.spyOn(Math, 'random');
    expect([1, 2, 3, 4].map((n) => cycleLine(c.ticket, n))).toEqual([...c.ticket, c.ticket[0]]);
    expect([1, 2, 3, 4].map((n) => clerkLine(hub, rd, 'placed', true, 3, 0, n))).toEqual([...c.punch, c.punch[0]]);
    expect(clerkLine(hub, rd, 'ticket', true, 3, 2, 0)).toBe(c.ticket[1]);
    expect(clerkLine(hub, rd, 'choosing', true, 3, 9, 9)).toBe('Race 3. Who do you like?');
    expect(rand).not.toHaveBeenCalled();
    rand.mockRestore();
  });

  it('his frame: rest, an idle every 4 s (rest, stamp, rest, stamp), the stamp once on the bet, nothing with reduced motion', () => {
    expect(clerkFrame(hub, 0, null, false)).toBe(0);
    expect(clerkFrame(hub, 3.9, null, false)).toBe(0);
    expect([4, 4.25, 4.5, 4.75, 5].map((t) => clerkFrame(hub, t, null, false))).toEqual([0, 1, 0, 1, 0]);
    expect(clerkFrame(hub, 8.3, null, false)).toBe(1);
    expect(clerkFrame(hub, 0, 0, false)).toBe(1);
    expect(clerkFrame(hub, 0, 0.3, false)).toBe(0);
    for (const t of [0, 4.25, 8.3]) expect(clerkFrame(hub, t, t < 1 ? 0 : null, true)).toBe(0);
  });
});

describe('WI5 and section 10: the pointer', () => {
  it('choosing: row i is x8-247, y111 + 11i to y121 + 11i; "Esc: back" is x176-247, y218-229; the picture and the clerk are nothing', () => {
    for (let i = 0; i < 8; i++) {
      expect(at(choosing(), 8, 111 + 11 * i)).toBe(`row:${i + 1}`);
      expect(at(choosing(), 247, 121 + 11 * i)).toBe(`row:${i + 1}`);
    }
    expect(at(choosing(), 176, 218)).toBe('back');
    expect(at(choosing(), 247, 229)).toBe('back');
    expect(at(choosing(), 128, 60)).toBeNull();
    expect(at(choosing(), 100, 98)).toBeNull();
  });

  it('a click on a row is digit k then Enter: the ticket opens; pending, it only focuses', () => {
    expect(windowClick(choosing(1), 'row:4', k())).toEqual({ state: ticket(4), outcome: null });
    expect(windowClick(choosing(1), 'row:4', k({ ready: false }))).toEqual({ state: choosing(4), outcome: null });
    expect(windowClick(choosing(1), 'back', k()).outcome).toEqual({ kind: 'back' });
  });

  it('ticket open: "<" and ">" boxes, "Enter: bet" x164-247 y206-217, the row being bet is not a target, another row moves the ticket at the same amount', () => {
    const s = ticket(3, offered[1]);
    expect(at(s, 20 - 4, 210)).toBe('less');
    expect(at(s, 20 + 7 + 4, 210)).toBe('less');
    expect(at(s, 164, 206)).toBe('bet');
    expect(at(s, 247, 217)).toBe('bet');
    expect(at(s, 100, 134)).toBeNull();
    expect(at(s, 200, 224)).toBeNull(); // "Esc: back" is not drawn with the ticket open
    expect(windowClick(s, 'less', k())).toEqual(windowKey(s, 'ArrowLeft', k()));
    expect(windowClick(s, 'more', k())).toEqual(windowKey(s, 'ArrowRight', k()));
    expect(windowClick(s, 'bet', k())).toEqual(windowKey(s, 'Enter', k()));
    expect(windowClick(s, 'row:3', k())).toEqual({ state: s, outcome: null });
    expect(windowClick(s, 'row:6', k())).toEqual({ state: ticket(6, offered[1]), outcome: null });
  });

  it('with one amount offered there are no arrows to click', () => {
    const one = k({ offered: [2] });
    const ids = windowPointerTargets(hub, rd, ticket(3, 2), one).map((t) => t.id);
    expect(ids).not.toContain('less');
    expect(ids).not.toContain('more');
  });

  it('the bet beat: nothing is a target', () => {
    expect(windowPointerTargets(hub, rd, { focus: 2, mode: { kind: 'placed' } }, k())).toEqual([]);
  });

  it('every pointer kind stands for keys the window binds', () => {
    expect(WINDOW_POINTER_KEYS).toEqual({ row: ['Digit{k}', 'Enter'], back: ['Escape'], less: ['ArrowLeft'], more: ['ArrowRight'], bet: ['Enter'] });
  });
});

describe('aria-live (section 10)', () => {
  it('reads the race, the bank, the clerk\'s line, the focused row and the ticket rows, never the estimate', () => {
    const sc = windowScreen(input({ state: choosing(2) }));
    const h = drawnOf()[2].input.card.horses[1];
    expect(sc.aria).toBe(`Race 3 of 8. Bank $100.00. Race 3. Who do you like? #2 ${h.name}, ${quote(ctx, programOf(3), null).odds[1]}. Esc: back.`);
  });
});
