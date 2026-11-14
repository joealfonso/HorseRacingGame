import { describe, expect, it, vi } from 'vitest';
import { coverFor, racePageState } from '../bet/bookPage';
import { quote } from '../bet/day';
import { newsFor } from '../bet/news';
import { loadBook } from '../data/bookLoad';
import { ctx, dayWith, drawnOf, inputFor, lookFor, programOf, settled } from './betKit';
import {
  bookAtCover, bookAtRace, bookClick, bookKey, bookPointerTargets, coverScreen, newsScreen, racePageScreen,
  type BookKeyContext, type BookState,
} from './bookScreen';
import { hitTest } from './pointer';
import { initialProgramState, programScreen } from './programScreen';
import { rd } from './testkit';

// The book's keys, pointer targets and pages (docs/specs/book-and-window.md sections 2, 5, 6
// and 10; BB1, BB2, BB3, BB4, BB6). Expected values are the spec's.

const book = loadBook();
const RACES = 8;
const cover: BookKeyContext = { races: RACES, horses: 0, enter: 'none' };
const race = (enter: 'window' | 'none' = 'none', horses = 8): BookKeyContext => ({ races: RACES, horses, enter });
const keys = (s: BookState, codes: string[], k: (s: BookState) => BookKeyContext) => {
  let state = s;
  const outcomes: unknown[] = [];
  for (const c of codes) { const r = bookKey(state, c, k(state)); state = r.state; outcomes.push(r.outcome); }
  return { state, outcomes };
};
const ctxAt = (s: BookState): BookKeyContext => (s.page < 2 ? cover : race());

describe('BB1: page order and turning', () => {
  it('opens on the cover at day start, and at race r\'s page with the cursor on post 1 from the track (FL4)', () => {
    expect(bookAtCover()).toEqual({ page: 0, focus: 0 });
    expect(bookAtRace(3)).toEqual({ page: 4, focus: 0 });
  });

  it('Right turns one page from the cover to race 8; Left goes back; neither wraps', () => {
    let s = bookAtCover();
    const pages = [s.page];
    for (let i = 0; i < 12; i++) { s = keys(s, ['ArrowRight'], ctxAt).state; pages.push(s.page); }
    expect(pages).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 9]);
    for (let i = 0; i < 12; i++) s = keys(s, ['ArrowLeft'], ctxAt).state;
    expect(s.page).toBe(0);
  });

  it.each(['Enter', 'NumpadEnter', 'Space', 'KeyZ'])('%s on the cover and the news acts as Right', (code) => {
    expect(bookKey(bookAtCover(), code, cover).state.page).toBe(1);
    expect(bookKey({ page: 1, focus: 0 }, code, cover).state.page).toBe(2);
  });

  it('Esc closes from every page', () => {
    for (let page = 0; page < RACES + 2; page++) expect(bookKey({ page, focus: 3 }, 'Escape', ctxAt({ page, focus: 3 })).outcome).toEqual({ kind: 'close' });
  });

  it('a page turn lands the cursor on post 1', () => {
    expect(bookKey({ page: 4, focus: 5 }, 'ArrowRight', race()).state).toEqual({ page: 5, focus: 0 });
  });
});

describe('the cursor on a race page (amendment 7: posts 1 to 8, wrapping, no Pass)', () => {
  it('Up and Down wrap through the field; digits jump; digits above the field do nothing', () => {
    expect(bookKey({ page: 4, focus: 0 }, 'ArrowUp', race()).state.focus).toBe(7);
    expect(bookKey({ page: 4, focus: 7 }, 'ArrowDown', race()).state.focus).toBe(0);
    expect(bookKey({ page: 4, focus: 0 }, 'Digit5', race()).state.focus).toBe(4);
    expect(bookKey({ page: 4, focus: 0 }, 'Digit7', race('none', 6)).state.focus).toBe(0);
  });

  it('digits and Up and Down do nothing on the cover and the news', () => {
    for (const code of ['Digit3', 'ArrowUp', 'ArrowDown']) expect(bookKey(bookAtCover(), code, cover)).toEqual({ state: bookAtCover(), outcome: null });
  });
});

describe('BB4: Enter on a race page', () => {
  it('on race r\'s page with prices posted, Enter goes to the window with the ticket on the focused post', () => {
    for (const code of ['Enter', 'Space', 'KeyZ']) expect(bookKey({ page: 4, focus: 2 }, code, race('window')).outcome).toEqual({ kind: 'window', post: 3 });
  });

  it('anywhere else Enter does nothing', () => {
    expect(bookKey({ page: 4, focus: 2 }, 'Enter', race('none'))).toEqual({ state: { page: 4, focus: 2 }, outcome: null });
  });

  it('a click on entry k focuses k and, only on race r\'s priced page, goes to the window', () => {
    expect(bookClick({ page: 4, focus: 0 }, 'entry:6', race('window'))).toEqual({ state: { page: 4, focus: 5 }, outcome: { kind: 'window', post: 6 } });
    expect(bookClick({ page: 4, focus: 0 }, 'entry:6', race('none'))).toEqual({ state: { page: 4, focus: 5 }, outcome: null });
    expect(bookClick({ page: 4, focus: 0 }, 'entry:9', race('window')).outcome).toBeNull();
  });
});

describe('BB6 and section 10: the running foot and the pointer', () => {
  const at = (s: BookState, k: BookKeyContext, x: number, y: number) => hitTest(bookPointerTargets(book, s, k), { x, y });

  it('the foot items are targets where drawn, in the spec\'s boxes', () => {
    expect(at(bookAtCover(), cover, 40, 228)).toBeNull(); // no previous item on the cover
    expect(at(bookAtCover(), cover, 120, 228)).toBe('close');
    expect(at(bookAtCover(), cover, 200, 228)).toBe('next');
    expect(at({ page: 9, focus: 0 }, race(), 40, 228)).toBe('prev');
    expect(at({ page: 9, focus: 0 }, race(), 200, 228)).toBeNull(); // race 8 has no next item
    for (const [x, y, id] of [[8, 222, 'prev'], [79, 235, 'prev'], [80, 222, 'close'], [175, 235, 'close'], [176, 222, 'next'], [247, 235, 'next']] as const) {
      expect(at({ page: 4, focus: 0 }, race(), x, y), `${x},${y}`).toBe(id);
    }
    expect(at({ page: 4, focus: 0 }, race(), 100, 221)).toBeNull();
  });

  it('each foot item does what its key does', () => {
    const s = { page: 4, focus: 2 };
    expect(bookClick(s, 'prev', race())).toEqual(bookKey(s, 'ArrowLeft', race()));
    expect(bookClick(s, 'next', race())).toEqual(bookKey(s, 'ArrowRight', race()));
    expect(bookClick(s, 'close', race())).toEqual(bookKey(s, 'Escape', race()));
  });

  it('the cover\'s body (x0-255, y0-209) is Enter: it turns to the news', () => {
    expect(at(bookAtCover(), cover, 0, 0)).toBe('cover');
    expect(at(bookAtCover(), cover, 255, 209)).toBe('cover');
    expect(at(bookAtCover(), cover, 100, 210)).toBeNull();
    expect(bookClick(bookAtCover(), 'cover', cover).state.page).toBe(1);
    expect(at({ page: 1, focus: 0 }, cover, 100, 100)).toBeNull();
  });

  it('race page entries are the approved boxes, y57 + 19(k-1) to y75 + 19(k-1)', () => {
    for (let k = 1; k <= 8; k++) {
      expect(at({ page: 4, focus: 0 }, race(), 8, 57 + 19 * (k - 1))).toBe(`entry:${k}`);
      expect(at({ page: 4, focus: 0 }, race(), 247, 75 + 19 * (k - 1))).toBe(`entry:${k}`);
    }
  });

  it('the foot prints "< page", "Esc: close" at x88 and "page >" to x247 on every page, within 8 characters', () => {
    const items = newsFor(book, { daySeed: 1, fields: drawnOf(), stable: ctx.stable, races: ctx.races, cardCopy: rd.copy.card, previous: null });
    const c = coverFor(book, { daySeed: 1, trackName: ctx.races[0].track, raceCount: RACES, news: items });
    const foot = (texts: { text: string; x: number; y: number }[]) => texts.filter((t) => t.y === 226);
    expect(foot(coverScreen(book, c, RACES).texts).map((t) => [t.text, t.x])).toEqual([['Esc: close', 88], ['News >', 200]]);
    expect(foot(newsScreen(book, items, c.dayLabel, c.dayNumber, RACES).texts).map((t) => [t.text, t.x])).toEqual([['< Cover', 8], ['Esc: close', 88], ['Race 1 >', 184]]);
  });
});

describe('BB2 and BB3: a race page is the approved program page, less the bank, band, ticket and Pass', () => {
  const day = dayWith(10000);

  it('y0-209 equals the program page for the same race, except header line 1\'s right slot', () => {
    for (const r of [1, 3, 8]) {
      const drawn = drawnOf()[r - 1];
      const program = programOf(r);
      const odds = quote(ctx, program, null).odds;
      const page = racePageState(book, { page: r, nextRace: r, fieldSize: 8, records: [], posted: new Map([[r, odds]]) });
      const b = racePageScreen({ book, ctx, rd, look: lookFor(drawn), drawn, page, focus: 0 });
      const p = programScreen(inputFor(program, drawn, day, initialProgramState()));
      const top = <T extends { y: number }>(xs: readonly T[]) => xs.filter((t) => t.y < 210);
      const bank = p.header[1];
      expect(top(b.texts).filter((t) => !(t.y === 4 && t.text === 'Enter: to window'))).toEqual(top([...p.header.filter((t) => t !== bank), ...p.heads, ...p.odds]));
      expect(b.entries).toEqual(p.rows);
      expect(b.rects).toEqual(p.rules);
      expect(b.cursor).toEqual(p.cursor);
      expect(p.band).toEqual([]);
      expect(b.texts.some((t) => t.text.startsWith('Bank'))).toBe(false);
      expect(b.texts.some((t) => t.text === rd.copy.program.pass)).toBe(false);
    }
  });

  it('the right slot is "Enter: to window" right-aligned to x247, in Ink', () => {
    const drawn = drawnOf()[2];
    const page = racePageState(book, { page: 3, nextRace: 3, fieldSize: 8, records: [], posted: new Map([[3, quote(ctx, programOf(3), null).odds]]) });
    const t = racePageScreen({ book, ctx, rd, look: lookFor(drawn), drawn, page, focus: 0 }).texts.find((x) => x.text === 'Enter: to window')!;
    expect(t).toEqual({ text: 'Enter: to window', x: 248 - 8 * 16, y: 4, color: 'Ink' });
  });

  it('pending: every odds "-", a blank right slot, the pending line in the footer', () => {
    const drawn = drawnOf()[2];
    const page = racePageState(book, { page: 3, nextRace: 3, fieldSize: 8, records: [], posted: new Map() });
    const b = racePageScreen({ book, ctx, rd, look: lookFor(drawn), drawn, page, focus: 4 });
    const oddsCells = b.texts.filter((t) => t.x >= 216 && t.y > 58 && t.y < 210 && (t.y - 66) % 19 === 0);
    expect(oddsCells.map((t) => t.text)).toEqual(Array(8).fill('-'));
    expect(b.texts.find((t) => t.y === 214)?.text).toBe('The crowd is still betting.');
    expect(b.texts.filter((t) => t.y === 4).map((t) => t.text)).toEqual(['Race 3 of 8']);
  });

  it('a run race: odds at post from the record, "Winner: #k", and the tick on your horse, which hides the cursor there', () => {
    const after = settled(programOf(1), day, { post: 3, dollars: 2 }, 5);
    const rec = after.records[0];
    const drawn = drawnOf()[0];
    const page = racePageState(book, { page: 1, nextRace: 2, fieldSize: 8, records: after.records, posted: new Map() });
    const at3 = racePageScreen({ book, ctx, rd, look: lookFor(drawn), drawn, page, focus: 2 });
    expect(at3.texts.find((t) => t.y === 4 && t.x > 100)?.text).toBe('Winner: #5');
    expect(at3.entries[2].images).toHaveLength(1);
    expect(at3.cursor).toBeNull();
    const at1 = racePageScreen({ book, ctx, rd, look: lookFor(drawn), drawn, page, focus: 0 });
    expect(at1.cursor).toEqual({ x: 8, y: 58 + 5 });
    const odds = at1.texts.filter((t) => t.y > 58 && t.y < 210 && (t.y - 66) % 19 === 0 && t.x >= 200).map((t) => t.text);
    expect(odds).toEqual(rec.odds);
  });

  it('the aria reads the race, the state slot and the focused entry, never the estimate', () => {
    const drawn = drawnOf()[2];
    const program = programOf(3);
    const page = racePageState(book, { page: 3, nextRace: 3, fieldSize: 8, records: [], posted: new Map([[3, quote(ctx, program, null).odds]]) });
    const b = racePageScreen({ book, ctx, rd, look: lookFor(drawn), drawn, page, focus: 0 });
    expect(b.aria).toContain('Race 3 of 8');
    expect(b.aria).toContain('Enter: to window');
    expect(b.aria).toContain(drawn.input.card.horses[0].name);
    for (const w of program.estimate.wins) if (w > 99) expect(b.aria).not.toContain(String(w));
  });

  it('drawing a page draws no random number', () => {
    const rand = vi.spyOn(Math, 'random');
    const drawn = drawnOf()[4];
    const page = racePageState(book, { page: 5, nextRace: 1, fieldSize: 8, records: [], posted: new Map() });
    racePageScreen({ book, ctx, rd, look: lookFor(drawn), drawn, page, focus: 0 });
    expect(rand).not.toHaveBeenCalled();
    rand.mockRestore();
  });
});
