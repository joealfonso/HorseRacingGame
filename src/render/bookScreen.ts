import type { Book } from '../data/bookSchema';
import { programConditionsLine, programPlaceLine } from '../data/cardWords';
import type { CardLook, RaceDay } from '../data/raceDaySchema';
import { bookPages, runningFoot, type BookPage, type CoverFields, type RacePageState } from '../bet/bookPage';
import type { DayContext, DrawnRace } from '../bet/day';
import type { NewsItem } from '../bet/news';
import { raceOfLine } from './betCopy';
import { FONT_DISPLAY } from './fontLayout';
import { BET_ENTRY, ENTRY, INK, PAPER, SECOND_INK, clothFor, programEntry, rightAlignedX, rule, type Entry, type PageImage, type PageRect, type PageText } from './page';
import type { PointerTarget } from './pointer';
import { PENDING_ODDS, PROGRAM_CONFIRM_KEYS, PROGRAM_PAGE, PROGRAM_TARGET_BOXES, programEntryTop, programHorses } from './programScreen';
import { SLOT_IDS } from './slotStatus';

// The book (docs/specs/book-and-window.md sections 2, 3, 4, 5, 6 and 10), as pure functions:
// the program you hold. Its pages in order are the cover, the news page and one page per
// race. What a key or a click does, and what each page draws. The race pages are the approved
// program page (y0-209) with the bank, band, ticket and Pass taken out; the bet lives at the
// window. Nothing here changes the day, the bankroll or any random stream (FL6): the scene
// hands in the page's state, computed in src/bet/bookPage.ts, and acts on the outcome.

/** The book's own art (slots.json): the cover's picture. The masthead name is in the display font. */
export const BOOK_SLOTS = { cover: 'art.book.cover.art' } as const;

/** The slots the book draws, for the placeholder tag. */
export const BOOK_SLOT_IDS: readonly string[] = [
  BOOK_SLOTS.cover, FONT_DISPLAY, SLOT_IDS.fontMain, SLOT_IDS.fontSmall, SLOT_IDS.cursor, SLOT_IDS.markPick, SLOT_IDS.placeholderTag,
];

/** The page you are on (an index into bookPages) and the entry cursor on a race page (0 is post 1). */
export interface BookState { page: number; focus: number }

/** Where the book opens: at day start on the cover; from the track at race r's page, cursor on post 1 (FL4, section 2). */
export const bookAtCover = (): BookState => ({ page: 0, focus: 0 });
export const bookAtRace = (race: number): BookState => ({ page: race + 1, focus: 0 });

/** `close`: back to the track. `window`: to the window with the ticket open on that post (BB4). */
export type BookOutcome = { kind: 'close' } | { kind: 'window'; post: number } | null;

export interface BookKeyContext {
  /** Races in the day: the book has this many race pages. */
  races: number;
  /** Horses in the field of the race page you are on (0 on the cover and the news). */
  horses: number;
  /** What Enter on an entry does on this page (racePageState's `enter`). */
  enter: 'window' | 'none';
}

/** The page kind at `state.page`. */
export const pageAt = (races: number, page: number): BookPage => bookPages(races)[page];

/** A page turn lands on post 1 (guess: the spec says only that Read opens with the cursor on post 1). */
const turn = (s: BookState, page: number, races: number): BookState =>
  (page < 0 || page > races + 1 ? s : { page, focus: 0 });

/**
 * One key press, past the held-key guard (section 2, BB1, BB4). Cover and news: Enter, Space,
 * Z or Right turn forward, Left back (none on the cover), Esc closes. A race page: Up and Down
 * wrap through the posts, 1 to 8 jump, Left and Right turn (no wrap: Right on the last race
 * does nothing), Enter, Space or Z goes to the window only on race r's page with prices
 * posted, Esc closes.
 */
export function bookKey(s: BookState, code: string, k: BookKeyContext): { state: BookState; outcome: BookOutcome } {
  const none = (state: BookState = s) => ({ state, outcome: null });
  const confirm = PROGRAM_CONFIRM_KEYS.includes(code);
  if (code === 'Escape') return { state: s, outcome: { kind: 'close' } };
  if (code === 'ArrowLeft') return none(turn(s, s.page - 1, k.races));
  if (code === 'ArrowRight') return none(turn(s, s.page + 1, k.races));
  const kind = pageAt(k.races, s.page).kind;
  if (kind !== 'race') return confirm ? none(turn(s, s.page + 1, k.races)) : none();
  const n = k.horses;
  if (n < 1) return none();
  if (code === 'ArrowUp') return none({ ...s, focus: (s.focus - 1 + n) % n });
  if (code === 'ArrowDown') return none({ ...s, focus: (s.focus + 1) % n });
  const digit = /^(Digit|Numpad)([1-9])$/.exec(code);
  if (digit) {
    const post = Number(digit[2]);
    return post <= n ? none({ ...s, focus: post - 1 }) : none();
  }
  if (confirm && k.enter === 'window') return { state: s, outcome: { kind: 'window', post: s.focus + 1 } };
  return none();
}

// ------------------------------------------------------------- what a page draws

export interface BookScreen {
  paper: string;
  rects: PageRect[];
  texts: PageText[];
  images: PageImage[];
  /** Race pages: one program entry per horse, the pencil tick on a run race's bet. */
  entries: Entry[];
  /** The paper horseshoe's top-left, or null (cover, news, or the tick in the same cell). */
  cursor: { x: number; y: number } | null;
  /** The aria-live text for the page (section 10). Never the estimate. */
  aria: string;
}

const MAIN_W = 8;
const SMALL_W = 4;
/** The small font's digits sit on the main font's rows 2-6 (DESIGN, the day pair). */
const SMALL_DY = 2;

/** The running foot under the y210 rule: "< page", "Esc: close" centered in its box, "page >" (section 6). */
function footTexts(book: Book, page: number, races: number): PageText[] {
  const f = runningFoot(book, page, races);
  const L = book.foot.layout.value;
  const box = L.closeText;
  const out: PageText[] = [];
  if (f.prev !== null) out.push({ text: f.prev, x: L.prevX, y: L.top, color: INK });
  out.push({ text: f.close, x: box.x0 + Math.floor((box.x1 - box.x0 + 1 - MAIN_W * f.close.length) / 2), y: L.top, color: INK });
  if (f.next !== null) out.push({ text: f.next, x: rightAlignedX(f.next, L.nextRight), y: L.top, color: INK });
  return out;
}

/** The day pair, "Day" in the main font and "#12345" in the small font on its rows 2-6, from `x`. */
function dayPair(book: Book, label: string, number: string, x: number, y: number): PageText[] {
  const gap = book.cover.layout.value.dayNumberX - book.cover.layout.value.dayLabelX;
  return [
    { text: label, x, y, color: INK },
    { text: number, x: x + gap, y: y + SMALL_DY, color: INK, small: true },
  ];
}

const sentence = (s: string): string => (/[.!?]$/.test(s) ? s : `${s}.`);

/** CV1, CV3: the cover. Parchment, the Maroon masthead with its Parchment keyline and knocked-out type, Ink type, the two-ink picture. */
export function coverScreen(book: Book, c: CoverFields, races: number): BookScreen {
  const L = book.cover.layout.value;
  const m = L.masthead;
  const k = L.keyline;
  const rects: PageRect[] = [
    { x: m.x0, y: m.y0, w: m.x1 - m.x0 + 1, h: m.y1 - m.y0 + 1, color: SECOND_INK },
    { x: k.x0, y: k.y0, w: k.x1 - k.x0 + 1, h: 1, color: PAPER },
    { x: k.x0, y: k.y1, w: k.x1 - k.x0 + 1, h: 1, color: PAPER },
    { x: k.x0, y: k.y0, w: 1, h: k.y1 - k.y0 + 1, color: PAPER },
    { x: k.x1, y: k.y0, w: 1, h: k.y1 - k.y0 + 1, color: PAPER },
    ...L.rules.tops.map((y) => rule(y, L.rules.x0, L.rules.x1 - L.rules.x0 + 1)),
  ];
  const texts: PageText[] = [
    { text: c.mastheadName, x: c.mastheadX, y: L.nameTop, color: PAPER, display: true },
    { text: c.title, x: c.titleX, y: L.titleTop, color: PAPER },
    ...dayPair(book, c.dayLabel, c.dayNumber, L.dayLabelX, L.datelineTop),
    { text: c.races, x: c.racesX, y: L.datelineTop, color: INK },
    { text: c.line, x: c.lineX, y: L.lineTop, color: INK },
    ...footTexts(book, 0, races),
  ];
  const images: PageImage[] = [{ slot: BOOK_SLOTS.cover, x: L.picture.x0, y: L.picture.y0 }];
  const aria = [c.track, c.title, `${c.dayLabel} ${c.dayNumber}`, c.line].map(sentence).join(' ');
  return { paper: PAPER, rects, texts, images, entries: [], cursor: null, aria };
}

/** NW: the news page. "Rail Talk" and the five headlines in Maroon (titles), everything else Ink. */
export function newsScreen(book: Book, news: readonly NewsItem[], dayLabel: string, dayNumber: string, races: number): BookScreen {
  const N = book.news;
  const L = N.layout.value;
  const pairW = (book.cover.layout.value.dayNumberX - book.cover.layout.value.dayLabelX) + SMALL_W * dayNumber.length;
  // The day pair right-aligned to the foot's right edge, as the back page sets it.
  const pairX = book.foot.layout.value.nextRight + 1 - pairW;
  const texts: PageText[] = [
    { text: N.title.value, x: L.x, y: L.titleTop, color: SECOND_INK },
    ...dayPair(book, dayLabel, dayNumber, pairX, L.titleTop),
    { text: N.subtitle.value, x: L.x, y: L.subtitleTop, color: INK },
  ];
  news.forEach((item, k) => {
    const top = L.firstTop + L.pitch * k;
    texts.push({ text: item.headline, x: L.x, y: top, color: SECOND_INK });
    item.body.forEach((line, j) => { if (j < L.bodyTops.length) texts.push({ text: line, x: L.x, y: top + L.bodyTops[j], color: INK }); });
  });
  texts.push(...footTexts(book, 1, races));
  const rects = L.ruleTops.map((y) => rule(y));
  const aria = news.map((n) => [n.headline, n.body.join(' ')].map(sentence).join(' ')).join(' ');
  return { paper: PAPER, rects, texts, images: [], entries: [], cursor: null, aria };
}

export interface RacePageInput {
  book: Book;
  ctx: DayContext;
  rd: RaceDay;
  /** This page's field's looks (the blurbs), keyed by horse id. */
  look: CardLook;
  drawn: DrawnRace;
  /** From src/bet/bookPage.ts racePageState. */
  page: RacePageState;
  /** The entry cursor, 0 for post 1. */
  focus: number;
}

/**
 * BB2, BB3: a race page. y0-209 is the approved program page (betting-screens.md section 3)
 * with header line 1's right slot holding the page state ("Enter: to window", "Winner: #5",
 * "Prices later" or blank) in place of the bank, no band and no ticket. Footer line 1 is the
 * focused horse's blurb or the pending line; line 2 is the running foot.
 */
export function racePageScreen(input: RacePageInput): BookScreen {
  const { book, ctx, rd, look, drawn, page } = input;
  const P = PROGRAM_PAGE;
  const copy = rd.copy;
  const horses = programHorses(drawn);
  const race = drawn.input.race;
  const range = drawn.input.tuning.statRange.value;
  const races = ctx.races.length;

  const texts: PageText[] = [{ text: raceOfLine(copy, drawn.race, races), x: P.header.x, y: P.header.y, color: INK }];
  if (page.right !== '') texts.push({ text: page.right, x: rightAlignedX(page.right, P.lastX), y: P.header.y, color: INK });
  texts.push(
    { text: race.name, x: P.header.x, y: P.header.y + P.header.dy, color: SECOND_INK },
    { text: programPlaceLine(race, copy.card), x: P.header.x, y: P.header.y + 2 * P.header.dy, color: INK },
    { text: programConditionsLine(race, copy.card, copy.program.bias), x: P.header.x, y: P.header.y + 3 * P.header.dy, color: INK },
  );
  const h = copy.program.heads;
  texts.push(
    ...BET_ENTRY.stats.map((s): PageText => ({ text: h[s.key], x: s.numberX, y: P.headsY, color: INK })),
    { text: h.odds, x: rightAlignedX(h.odds, P.lastX), y: P.headsY, color: INK },
  );
  const entries = horses.map((x, i) => programEntry(x, programEntryTop(i), rd, clothFor(rd, x.post), range, x.post === page.tick, BET_ENTRY));
  horses.forEach((x, i) => {
    const odds = page.odds[x.post - 1] ?? PENDING_ODDS;
    texts.push({ text: odds, x: rightAlignedX(odds, P.lastX), y: programEntryTop(i) + P.oddsDy, color: INK });
  });

  const focus = Math.min(Math.max(0, input.focus), horses.length - 1);
  const focused = horses[focus];
  const footer = page.footer === 'pending' ? copy.program.pending : look[focused.id]?.blurb ?? '';
  if (footer !== '') texts.push({ text: footer, x: P.footer.x, y: P.footer.ys[0], color: INK });
  const pageIndex = drawn.race + 1;
  texts.push(...footTexts(book, pageIndex, races));

  // DESIGN: the tick and the cursor share the margin cell; with both, the tick wins and no cursor is drawn.
  const cursor = focused.post === page.tick ? null : { x: P.cursorX, y: programEntryTop(focus) + ENTRY.cursorDy };
  const rects = P.rules.map((y) => rule(y));
  const style = copy.card.styles[focused.style];
  const stats = BET_ENTRY.stats.map((s) => `${h[s.key]} ${focused.stats[s.key]}`).join(', ');
  const focusedOdds = page.odds[focused.post - 1] ?? PENDING_ODDS;
  const aria = [
    raceOfLine(copy, drawn.race, races), race.name, ...(page.right === '' ? [] : [page.right]),
    `#${focused.post} ${focused.name}, ${style}, ${stats}, ${h.odds} ${focusedOdds}`, ...(footer === '' ? [] : [footer]),
  ].map(sentence).join(' ');
  return { paper: PAPER, rects, texts, images: [], entries, cursor, aria };
}

// ------------------------------------------------------------- the mouse (section 10)

/** Pointer target ids: the cover's body, entry k on a race page, and the running foot. */
export type BookTargetId = 'cover' | `entry:${number}` | 'prev' | 'close' | 'next';

/** The key each kind of target stands for (TH15). Entry k: digit k, then Enter. */
export const BOOK_POINTER_KEYS: Readonly<Record<'cover' | 'entry' | 'prev' | 'close' | 'next', readonly string[]>> = {
  cover: ['Enter'], entry: ['Digit{k}', 'Enter'], prev: ['ArrowLeft'], close: ['Escape'], next: ['ArrowRight'],
};

/** What the page can be clicked on: the foot's items that are drawn, the cover's body, a race page's entries. */
export function bookPointerTargets(book: Book, s: BookState, k: BookKeyContext): PointerTarget<BookTargetId>[] {
  const L = book.foot.layout.value;
  const f = runningFoot(book, s.page, k.races);
  const out: PointerTarget<BookTargetId>[] = [];
  const kind = pageAt(k.races, s.page).kind;
  // The cover's body: the whole page above its lower rule (x0-255, y0-209).
  if (kind === 'cover') out.push({ id: 'cover', box: { x0: 0, y0: 0, x1: 255, y1: book.cover.layout.value.rules.tops[1] - 1 } });
  if (kind === 'race') {
    const B = PROGRAM_TARGET_BOXES;
    for (let post = 1; post <= k.horses; post++) {
      const dy = PROGRAM_PAGE.entryPitch * (post - 1);
      out.push({ id: `entry:${post}`, box: { x0: 8, y0: B.entryTop + dy, x1: 247, y1: B.entryBottom + dy } });
    }
  }
  if (f.prev !== null) out.push({ id: 'prev', box: L.prevTarget });
  out.push({ id: 'close', box: L.closeTarget });
  if (f.next !== null) out.push({ id: 'next', box: L.nextTarget });
  return out;
}

/** A finished click (BB4, BB6), as its keys: entry k focuses post k and presses Enter (which does nothing off race r's priced page). */
export function bookClick(s: BookState, id: BookTargetId, k: BookKeyContext): { state: BookState; outcome: BookOutcome } {
  const entry = /^entry:(\d+)$/.exec(id);
  if (entry) {
    const post = Number(entry[1]);
    if (post < 1 || post > k.horses) return { state: s, outcome: null };
    return bookKey({ ...s, focus: post - 1 }, 'Enter', k);
  }
  if (id === 'cover') return bookKey(s, 'Enter', k);
  if (id === 'prev') return bookKey(s, 'ArrowLeft', k);
  if (id === 'next') return bookKey(s, 'ArrowRight', k);
  return bookKey(s, 'Escape', k);
}
