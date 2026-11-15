import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { coverFor, type RacePageState } from '../bet/bookPage';
import type { DayState, DrawnRace, Ticket } from '../bet/day';
import type { NewsItem } from '../bet/news';
import { loadBook } from '../data/bookLoad';
import { loadHub } from '../data/hubLoad';
import { ctx, dayWith, drawnOf, lookFor, programOf, rd } from './betKit';
import { coverScreen, newsScreen, racePageScreen, type BookScreen } from './bookScreen';
import { Frame, ROOT } from './compositeKit';
import { PAPER_CURSOR_SWAPS } from './page';
import { SLOT_IDS } from './slotStatus';
import { WINDOW_SLOTS, clerkFrame, windowScreen, type WindowState } from './windowScreen';

// The book and the window drawn headless from the pure modules and the shipped PNGs, in the
// order their scenes draw them, against Joseph's approved mock (docs/mocks/book-and-window/,
// drawn by scripts/art/book_mock.mjs), pixel for pixel. The mock's fields, prices and the news
// items are its own sample data, so the test hands the same in; every position, color, font
// and string the code makes is the code's. CV3 (the cover's inks) is checked on the same frame.

const book = loadBook();
const hub = loadHub();
const MOCK = (f: string) => join(ROOT, 'docs/mocks/book-and-window', f);
const byName = new Map(ctx.stable.map((h) => [h.name, h]));

/** A race's drawn field with the mock's horses in post order (scripts/art/book_mock.mjs R2, R3, R5). */
function fieldOf(race: number, names: readonly string[]): DrawnRace {
  const base = drawnOf()[race - 1];
  const horses = names.map((n, i) => {
    const h = byName.get(n);
    if (!h) throw new Error(`not in stable.json: ${n}`);
    return { id: h.id, name: h.name, jockey: h.jockey, post: i + 1, style: h.style, stats: { ...h.stats }, instructions: { early: 'default', move: 'default', path: 'default' } } as const;
  });
  return { ...base, horseIds: horses.map((h) => h.id), styles: horses.map((h) => h.style), input: { ...base.input, card: { horses: horses.map((h) => ({ ...h, instructions: { ...h.instructions } })) } } };
}
const R3 = fieldOf(3, ['Gravy Subpoena', 'Hold My Oats', 'Legally A Horse', 'Sock In The Dryer', 'Goat Is In Charge', 'Lost The Remote', 'Paddock Gossip', 'Unexpected Banjo']);
const R3_ODDS = ['7-2', '9-2', '5-2', '8-1', '3-1', '12-1', '4-1', '26-1'];
const R5 = fieldOf(5, ['Ten Items Or Less', 'Burgoo Weather', 'Smoke Alarm Chirp', 'Long Story Longer', 'Circling Back', 'Derby Hat Budget', 'Scenic Route', 'Reply All']);
const R2 = fieldOf(2, ['Biscuit Emergency', 'Mint Julep Lawsuit', 'Porch Light On', 'Understudy', 'Decaf By Mistake', 'Take A Number', 'Polite Applause', 'Mayor Of Turn Two']);
const R2_ODDS = ['6-1', '5-2', '2-1', '9-1', '7-2', '15-1', '11-1', '4-1'];

// The mock's sample news (scripts/art/book_mock.mjs NEWS, LEAD, COVER_LINE; the values are written here, not imported:
// that script regenerates the PNGs when loaded). The page draws whatever NewsItems it is handed, so they are handed in as
// the mock has them; kind, horse and post are placeholders the drawing never reads. `lead` is the first taken (Race 1).
const item = (race: number, kind: NewsItem['kind'], headline: string, body: string[], slot: number): NewsItem =>
  ({ slot, id: `mock:${race}`, kind, race, horseId: '', post: 1, lead: race === 1, headline, body });
const MOCK_NEWS: NewsItem[] = [
  item(1, 'K1', 'Race 1: one wants the lead', ['Only Running Joke wants the', 'lead. The bugler approves.'], 1),
  item(2, 'K7', 'Race 2: tops on the numbers', ['On paper, Biscuit Emergency.', 'Paper has been wrong before.'], 2),
  item(3, 'K7', 'Race 3: most in the bars', ['Add the three bars. Top here:', 'Paddock Gossip.'], 3),
  item(5, 'K7', 'Race 5: best sum here', ['Sum the bars and Long Story', 'Longer comes out on top.'], 4),
  item(7, 'K3', 'Race 7: a crowd up front', ['A busy lead helps closers. Top', 'one here: Late Checkout.'], 5),
];
const cover = coverFor(book, { daySeed: 12345, trackName: ctx.races[0].track, raceCount: 8, news: MOCK_NEWS });

/** As BookScene draws a page: Parchment, the rects, the images, the type, the entries, then the paper horseshoe on frame 0. */
function paintBook(s: BookScreen): Frame {
  const f = new Frame();
  f.fill(s.paper);
  f.rects(s.rects);
  for (const im of s.images) f.image({ slot: im.slot, frame: 0, x: im.x, y: im.y });
  for (const t of s.texts) f.text(t);
  for (const e of s.entries) {
    f.rects(e.rects);
    for (const t of e.texts) f.text(t);
    for (const im of e.images) f.image({ slot: im.slot, frame: 0, x: im.x, y: im.y });
  }
  if (s.cursor) f.image({ slot: SLOT_IDS.cursor, frame: 0, ...s.cursor, swaps: PAPER_CURSOR_SWAPS });
  return f;
}

const pageState = (race: number, over: Partial<RacePageState>): RacePageState =>
  ({ race, kind: 'posted', odds: [], right: '', footer: 'blurb', enter: 'none', tick: null, ...over });
const racePage = (drawn: DrawnRace, page: RacePageState) => racePageScreen({ book, ctx, rd, look: lookFor(drawn), drawn, page, focus: 0 });

describe('the book matches the approved mock pixel for pixel', () => {
  it('1-cover: day #12345, the display-font masthead, the picture, the cover line, the foot', () => {
    const f = paintBook(coverScreen(book, cover, 8));
    const diffs = f.diff(MOCK('1-cover.png'));
    expect(diffs.length, diffs.slice(0, 10).join('\n')).toBe(0);
  });

  it('the cover line is the lead item\'s headline, and header line 4 comes out of the code from the mock\'s own fields', () => {
    expect(cover.line).toBe('Race 1: one wants the lead');
    const l4 = (drawn: DrawnRace, page: RacePageState) => racePage(drawn, page).texts.find((t) => t.y === 34)!.text;
    expect(l4(R3, pageState(3, {}))).toBe('Dirt, fast, 2 up front');
    expect(l4(R5, pageState(5, {}))).toBe('Dirt, fast, 3 up front');
    expect(l4(R2, pageState(2, {}))).toBe('Dirt, fast, 3 up front');
  });

  it('CV3: the cover uses only Parchment, Ink and Maroon', () => {
    const f = paintBook(coverScreen(book, cover, 8));
    expect([...f.colorsIn(0, 0, 255, 239)].sort()).toEqual(['Ink', 'Maroon', 'Parchment']);
  });

  it('3-news: the five items, the day pair right-aligned, the foot', () => {
    const f = paintBook(newsScreen(book, MOCK_NEWS, cover.dayLabel, cover.dayNumber, 8));
    const diffs = f.diff(MOCK('3-news.png'));
    expect(diffs.length, diffs.slice(0, 10).join('\n')).toBe(0);
  });

  it('4a: race 3 with prices posted, the cursor on #1 and its blurb, "Enter: to window"', () => {
    const f = paintBook(racePage(R3, pageState(3, { odds: R3_ODDS, right: 'Enter: to window', enter: 'window' })));
    const diffs = f.diff(MOCK('4a-race3-prices-posted.png'));
    expect(diffs.length, diffs.slice(0, 10).join('\n')).toBe(0);
  });

  it('4b: race 5, "Prices later" and every odds cell "-"', () => {
    const f = paintBook(racePage(R5, pageState(5, { kind: 'later', odds: R5.horseIds.map(() => null), right: 'Prices later' })));
    const diffs = f.diff(MOCK('4b-race5-prices-later.png'));
    expect(diffs.length, diffs.slice(0, 10).join('\n')).toBe(0);
  });

  it('4c: race 2 run, "Winner: #5" and the pencil tick on your #3', () => {
    const f = paintBook(racePage(R2, pageState(2, { kind: 'run', odds: R2_ODDS, right: 'Winner: #5', tick: 3 })));
    const diffs = f.diff(MOCK('4c-race2-run.png'));
    expect(diffs.length, diffs.slice(0, 10).join('\n')).toBe(0);
  });
});

// ------------------------------------------------------------- the window

/** As WindowScene draws it: Ink, the booth, the clerk, your program, the box, the rects, the type, the cursor and the marker. */
function paintWindow(state: WindowState, day: DayState, opts: { pending?: boolean; clerk?: { ticket: number; punch: number }; beat?: boolean; pays?: string } = {}): Frame {
  const program = opts.pending ? null : programOf(3);
  const s = windowScreen({ hub, rd, ctx, day, drawn: R3, program, state, clerk: opts.clerk ?? { ticket: 0, punch: 0 } });
  const W = hub.window.value;
  const f = new Frame();
  f.fill('Ink');
  f.image({ slot: WINDOW_SLOTS.booth, frame: 0, ...W.booth });
  f.image({ slot: WINDOW_SLOTS.clerk, frame: clerkFrame(hub, 0, opts.beat ? 0 : null, false), ...W.clerk });
  f.image({ slot: WINDOW_SLOTS.program, frame: 0, ...W.program });
  const B = W.frame;
  for (let ty = 0; ty < B.tilesH; ty++) {
    for (let tx = 0; tx < B.tilesW; tx++) {
      const col = tx === 0 ? 0 : tx === B.tilesW - 1 ? 2 : 1;
      const row = ty === 0 ? 0 : ty === B.tilesH - 1 ? 2 : 1;
      f.image({ slot: SLOT_IDS.frameBox, frame: row * 3 + col, x: B.x + tx * 8, y: B.y + ty * 8 });
    }
  }
  f.rects([...s.bar, s.line, ...s.rows.flatMap((r) => r.rects), ...s.slip]);
  // The mock's prices are its own sample: the odds cells (the last text of each row) take them, at the code's positions.
  const rows = s.rows.map((r, i) => {
    const t = [...r.texts];
    if (!opts.pending) { const o = t[2]; t[2] = { ...o, text: R3_ODDS[i], x: o.x + 8 * (o.text.length - R3_ODDS[i].length) }; }
    return t;
  });
  const ticket = s.ticket.map((t, i) => (opts.pays !== undefined && i === 2 ? { ...t, text: opts.pays } : t));
  for (const t of [...s.status, s.sign, s.clerkLine, ...rows.flat(), ...ticket]) f.text(t);
  if (s.cursor) f.image({ slot: SLOT_IDS.cursor, frame: 0, ...s.cursor });
  if (s.marker) f.image({ slot: SLOT_IDS.markerYours, frame: 0, ...s.marker });
  return f;
}

describe('the window matches the approved mock pixel for pixel', () => {
  const day = dayWith(10000);

  it('5a: choosing, the cursor on #1, "Race 3. Who do you like?"', () => {
    const diffs = paintWindow({ focus: 0, mode: { kind: 'choosing' } }, day).diff(MOCK('5a-window-choosing.png'));
    expect(diffs.length, diffs.slice(0, 10).join('\n')).toBe(0);
  });

  it('5b: the ticket open on #3 at $10, the yours marker on its row, the cursor on ticket row 1', () => {
    const f = paintWindow({ focus: 2, mode: { kind: 'ticket', dollars: 10 } }, day, { clerk: { ticket: 1, punch: 0 }, pays: '$10 to win pays $37.00' });
    const diffs = f.diff(MOCK('5b-window-ticket-open.png'));
    expect(diffs.length, diffs.slice(0, 10).join('\n')).toBe(0);
  });

  it('5c: the bet beat, the slip over the box, the clerk on his stamp frame, the bank cut by the stake', () => {
    const ticket: Ticket = { race: 3, post: 3, dollars: 10, stakeCents: 1000, odds: '5-2', paysCents: 3500 };
    const placed: DayState = { ...dayWith(9000), open: { program: programOf(3), ticket } };
    const f = paintWindow({ focus: 2, mode: { kind: 'placed' } }, placed, { clerk: { ticket: 1, punch: 1 }, beat: true });
    const diffs = f.diff(MOCK('5c-window-bet-beat.png'));
    expect(diffs.length, diffs.slice(0, 10).join('\n')).toBe(0);
  });

  it('the comparison can fail: choosing against the pending sheet, and the cover against the news, differ', () => {
    expect(paintWindow({ focus: 0, mode: { kind: 'choosing' } }, day).diff(MOCK('5d-window-prices-pending.png')).length).toBeGreaterThan(0);
    expect(paintBook(coverScreen(book, cover, 8)).diff(MOCK('3-news.png')).length).toBeGreaterThan(1000);
  });

  it('5d: prices pending, every odds "-", the pending line', () => {
    const diffs = paintWindow({ focus: 0, mode: { kind: 'choosing' } }, day, { pending: true }).diff(MOCK('5d-window-prices-pending.png'));
    expect(diffs.length, diffs.slice(0, 10).join('\n')).toBe(0);
  });
});
