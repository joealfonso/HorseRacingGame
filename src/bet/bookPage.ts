import type { Book } from '../data/bookSchema';
import { fillHoles } from '../data/bookText';
import type { NewsItem } from './news';

// What the book's pages show, as plain data a screen can draw (docs/specs/book-and-window.md
// sections 3, 5 and 6). Pure: no drawing, no random draws, and nothing here changes the day.

/** The x a text of `chars` characters starts at when centered on the 256-wide screen, in cells `cell` px wide. */
export const centeredX = (chars: number, cell: number): number => Math.floor((256 - cell * chars) / 2);

export interface CoverFields {
  /** Race 1's `track` from day.json, as written. */
  track: string;
  /** The same, upper-cased: what the display font sets. */
  mastheadName: string;
  /** Where the masthead name starts (display font, 12 px a character). */
  mastheadX: number;
  /** "Race Day Program", and where it starts (main font). */
  title: string;
  titleX: number;
  /** The dateline's pair: "Day" and "#12345". The same pair as the End of day page. */
  dayLabel: string;
  dayNumber: string;
  /** "8 races today", right-aligned to the layout's racesRight. */
  races: string;
  racesX: number;
  /** News item 1's headline, and where it starts. */
  line: string;
  lineX: number;
}

/** CV1: the cover's fields. `news` is the day's five items; the cover line is the first one's headline. */
export function coverFor(book: Book, input: { daySeed: number; trackName: string; raceCount: number; news: readonly NewsItem[] }): CoverFields {
  const c = book.cover;
  const lay = c.layout.value;
  const mastheadName = input.trackName.toUpperCase();
  const races = fillHoles(c.races.value, { n: input.raceCount });
  const line = input.news[0].headline;
  return {
    track: input.trackName,
    mastheadName,
    mastheadX: centeredX(mastheadName.length, c.display.value.cellW),
    title: c.title.value,
    titleX: centeredX(c.title.value.length, 8),
    dayLabel: c.dayLabel.value,
    dayNumber: fillHoles(c.dayNumber.value, { seed: input.daySeed }),
    races,
    racesX: lay.racesRight + 1 - 8 * races.length,
    line,
    lineX: centeredX(line.length, 8),
  };
}

export type BookPage = { kind: 'cover' } | { kind: 'news' } | { kind: 'race'; race: number };

/** BB1: cover, news, race 1 to race n. */
export function bookPages(raceCount: number): BookPage[] {
  return [{ kind: 'cover' }, { kind: 'news' }, ...Array.from({ length: raceCount }, (_v, i): BookPage => ({ kind: 'race', race: i + 1 }))];
}

export function pageName(book: Book, page: BookPage): string {
  const p = book.foot.pages.value;
  return page.kind === 'cover' ? p.cover : page.kind === 'news' ? p.news : fillHoles(p.race, { r: page.race });
}

export interface RunningFoot {
  /** "< Cover", or null on the cover. */
  prev: string | null;
  /** "Esc: close". */
  close: string;
  /** "Race 1 >", or null on the last race's page (no wrap: the book has a front and a back). */
  next: string | null;
}

/** BB6: the running foot for the page at `index` of bookPages(raceCount). */
export function runningFoot(book: Book, index: number, raceCount: number): RunningFoot {
  const pages = bookPages(raceCount);
  if (!Number.isInteger(index) || index < 0 || index >= pages.length) throw new Error(`the book has pages 0 to ${pages.length - 1}, not ${index}`);
  return {
    prev: index === 0 ? null : fillHoles(book.foot.prev.value, { page: pageName(book, pages[index - 1]) }),
    close: book.foot.close.value,
    next: index === pages.length - 1 ? null : fillHoles(book.foot.next.value, { page: pageName(book, pages[index + 1]) }),
  };
}

/** The part of a settled race a run page needs: a RaceRecord fits. */
export interface RunRace {
  race: number;
  /** Odds by post at post time, the player's bet in the pool. */
  odds: readonly string[];
  winnerPost: number;
  ticket: { post: number } | null;
}

export type PageKind = 'posted' | 'pending' | 'nextPosted' | 'later' | 'run';

export interface RacePageState {
  race: number;
  kind: PageKind;
  /** One cell per horse in the field, post 1 first. A string is a price; null is no price, drawn as the tote's "-". */
  odds: (string | null)[];
  /** Header line 1's right slot: "Enter: to window", "Winner: #5", "Prices later", or "" (blank). */
  right: string;
  /** Footer line 1: the focused horse's blurb, or the program's pending line ("The crowd is still betting."). */
  footer: 'blurb' | 'pending';
  /** What Enter or a click on an entry does here: open the window with the ticket open on that horse, or nothing (a click only focuses). */
  enter: 'window' | 'none';
  /** The post of the horse you bet on, for the pencil tick on a run page. Null otherwise. */
  tick: number | null;
}

export interface RacePageInput {
  /** The race page, 1 up. */
  page: number;
  /** The race to run next: DayState.nextRace. */
  nextRace: number;
  /** Horses in this race's field. */
  fieldSize: number;
  /** The settled races (DayState.records). A page of a race in here is a run page. */
  records: readonly RunRace[];
  /**
   * The crowd's prices with no bet (quote(ctx, program, null).odds) for the races whose prices are
   * posted, by race number. The book asks for races r and r + 1 only (UI5), so only those two are read.
   */
  posted: ReadonlyMap<number, readonly string[]>;
}

/** BB3: section 5's "Page states" table. */
export function racePageState(book: Book, input: RacePageInput): RacePageState {
  const { page, nextRace, fieldSize } = input;
  const rp = book.racePage;
  const none = (): (string | null)[] => Array.from({ length: fieldSize }, () => null);
  const base = { race: page, footer: 'blurb', enter: 'none', tick: null } as const;

  const run = input.records.find((r) => r.race === page);
  if (run !== undefined) {
    return { ...base, kind: 'run', odds: [...run.odds], right: fillHoles(rp.winner.value, { n: run.winnerPost }), tick: run.ticket?.post ?? null };
  }
  if (page === nextRace) {
    const prices = input.posted.get(page);
    if (prices !== undefined) return { ...base, kind: 'posted', odds: [...prices], right: rp.toWindow.value, enter: 'window' };
    return { ...base, kind: 'pending', odds: none(), right: '', footer: 'pending' };
  }
  if (page === nextRace + 1) {
    const prices = input.posted.get(page);
    if (prices !== undefined) return { ...base, kind: 'nextPosted', odds: [...prices], right: '' };
  }
  return { ...base, kind: 'later', odds: none(), right: rp.later.value };
}
