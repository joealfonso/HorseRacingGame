import Phaser from 'phaser';
import { coverFor, racePageState, type RacePageState } from '../bet/bookPage';
import type { DayState } from '../bet/day';
import type { NewsItem } from '../bet/news';
import { offeredAmounts } from '../bet/money';
import {
  BOOK_SLOT_IDS, bookAtCover, bookAtRace, bookClick, bookCloseFocus, bookHover, bookKey, bookPointerTargets, coverScreen, newsScreen, pageAt, racePageScreen,
  type BookKeyContext, type BookOutcome, type BookScreen, type BookState,
} from '../render/bookScreen';
import { rgbOf } from '../render/colors';
import { PAPER_CURSOR_SWAPS } from '../render/page';
import { cursorFrame } from '../render/pause';
import { PLACEHOLDER_TAG_AT, SLOT_IDS, showPlaceholderTag, standIns } from '../render/slotStatus';
import { Art, type ArtInfo } from './art';
import { announce } from './ariaLive';
import { betErrorLines, bookPriceRaces, newsOf, nextDay, postedPrices, raceDayFor, requestNextEstimates, type BetDay } from './betDay';
import type { HubData } from './HubScene';
import { MenuKeys } from './menuKeys';
import { PagePainter } from './paper';
import { PointerInput } from './pointerInput';
import type { WindowData } from './WindowScene';

// The book (docs/specs/book-and-window.md sections 2 to 6): the program you hold. At day
// start it opens on the cover; from the track's Read row it opens at the next race's page.
// Everything drawn comes from src/render/bookScreen.ts and src/bet/bookPage.ts, every price
// from src/bet. This file places it, forwards keys and clicks, and acts on the outcome: close
// (back to the track) or the window with the ticket open. Reading never changes the day,
// the bankroll or any random stream (FL6), and asks for no estimate past races r and r + 1 (BB5).

export interface BookData {
  bet: BetDay;
  day: DayState;
  art: ArtInfo;
  /** Keys still down from the screen before, ignored until released (IN2). */
  held?: string[];
  /**
   * `dayStart`: boot or New day, on the cover; Esc from the cover or the news lands the track
   * on Read (FL1), from a race page on Bet (23.3).
   * `track`: from the Read row, at race r's page; Esc lands the track on Bet (FL2).
   */
  from: 'dayStart' | 'track';
}

export class BookScene extends Phaser.Scene {
  private data0!: BookData;
  private day!: DayState;
  private state: BookState = bookAtCover();
  private news: NewsItem[] = [];
  private posted = new Map<number, string[]>();
  /** How many races' prices the book can show (r and r + 1, or only r on the last race). */
  private priceRaces = 0;
  private keys!: MenuKeys;
  private art!: Art;
  private page!: PagePainter;
  private cursor!: Phaser.GameObjects.Image;
  private seconds = 0;
  private leaving = false;

  constructor() {
    super('book');
  }

  create(data: BookData): void {
    this.data0 = data;
    this.seconds = 0;
    this.leaving = false;
    this.art = new Art(this, data.art);
    // Never opened on an ended day: New day goes to the next day's cover.
    if (data.day.ended !== null) {
      this.leaving = true;
      const next = nextDay(data.bet, data.day);
      this.scene.start('book', { ...next, art: data.art, held: data.held, from: 'dayStart' } satisfies BookData);
      return;
    }
    this.day = data.day;
    this.state = data.from === 'dayStart' ? bookAtCover() : bookAtRace(data.day.nextRace);
    this.news = newsOf(data.bet, data.day.daySeed);
    // Race r's estimate first, then r + 1's (UI5), and never another (BB5).
    requestNextEstimates(data.bet, data.day);
    this.priceRaces = bookPriceRaces(data.bet, data.day).length;
    try {
      this.posted = postedPrices(data.bet, data.day);
    } catch (err) {
      this.fail(err);
      return;
    }

    this.cameras.main.setBackgroundColor(rgbOf(data.art.colors, 'Parchment'));
    this.page = new PagePainter(this, this.art, 1);
    this.cursor = this.add.image(0, 0, this.art.swap(SLOT_IDS.cursor, PAPER_CURSOR_SWAPS), '0').setOrigin(0, 0).setDepth(5);
    const drawnSlots = standIns(data.art.slots, data.art.states, BOOK_SLOT_IDS);
    this.add.image(PLACEHOLDER_TAG_AT.x, PLACEHOLDER_TAG_AT.y, SLOT_IDS.placeholderTag, '0').setOrigin(0, 0).setDepth(10)
      .setVisible(showPlaceholderTag(drawnSlots));
    if (drawnSlots.length > 0) console.warn(`Placeholder art in the book (${drawnSlots.length} slots):\n${drawnSlots.map((d) => `  ${d.id}: ${d.reason}`).join('\n')}`);
    this.redraw();

    const m = data.bet.rd.raceDay.menus;
    this.keys = new MenuKeys(this, data.held ?? [], { delaySeconds: m.repeatDelayMs.value / 1000, everySeconds: m.repeatEveryMs.value / 1000 }, (code) => {
      if (!this.leaving) this.apply(bookKey(this.state, code, this.keyContext()));
    });
    // Hover moves the entry cursor on a race page (23.1); a click does what its key does.
    new PointerInput(this, () => bookPointerTargets(data.bet.book, this.state, this.keyContext()), {
      hover: (id) => { if (!this.leaving) this.apply({ state: bookHover(this.state, id, this.keyContext()), outcome: null }); },
      click: (id) => { if (!this.leaving) this.apply(bookClick(this.state, id, this.keyContext())); },
    }, data.bet.rd.raceDay.pointer.arrivalGuardSeconds.value);
  }

  update(_time: number, delta: number): void {
    if (!this.data0 || this.leaving) return;
    const rd = this.data0.bet.rd.raceDay;
    const dt = Math.min(Math.max(0, delta), rd.playback.maxFrameMs.value) / 1000;
    this.seconds += dt;
    // Race r's estimate failing is the existing error screen (section 5). r + 1's waits for its own turn.
    const now = this.data0.bet.drawn[this.day.nextRace - 1];
    const problem = this.posted.has(this.day.nextRace) ? null : this.data0.bet.estimates.failure(now);
    if (problem !== null) return this.fail(new Error(`the odds could not be worked out: ${problem}`));
    // Prices cut in, in one frame, on race r's or r + 1's page.
    if (this.posted.size < this.priceRaces) {
      let posted: Map<number, string[]>;
      try {
        posted = postedPrices(this.data0.bet, this.day, this.posted);
      } catch (err) {
        return this.fail(err);
      }
      if (posted.size !== this.posted.size) {
        this.posted = posted;
        this.redraw();
      }
    }
    this.keys.update(dt);
    const frames = this.art.frames(SLOT_IDS.cursor);
    this.cursor.setFrame(String(frames > 1 ? cursorFrame(this.seconds, rd.ambient.cursorSwapsPerSecond.value) : 0));
  }

  /** The race page's state (section 5), or null on the cover and the news. */
  private raceState(): RacePageState | null {
    const bet = this.data0.bet;
    const p = pageAt(bet.ctx.races.length, this.state.page);
    if (p.kind !== 'race') return null;
    return racePageState(bet.book, {
      page: p.race,
      nextRace: this.day.nextRace,
      fieldSize: bet.drawn[p.race - 1].horseIds.length,
      records: this.day.records,
      posted: this.posted,
    });
  }

  private keyContext(): BookKeyContext {
    const bet = this.data0.bet;
    const p = pageAt(bet.ctx.races.length, this.state.page);
    const rs = this.raceState();
    return { races: bet.ctx.races.length, horses: p.kind === 'race' ? bet.drawn[p.race - 1].horseIds.length : 0, enter: rs?.enter ?? 'none' };
  }

  private screen(): BookScreen {
    const bet = this.data0.bet;
    const races = bet.ctx.races.length;
    const p = pageAt(races, this.state.page);
    const cover = coverFor(bet.book, { daySeed: this.day.daySeed, trackName: bet.ctx.races[0].track, raceCount: races, news: this.news });
    if (p.kind === 'cover') return coverScreen(bet.book, cover, races);
    if (p.kind === 'news') return newsScreen(bet.book, this.news, cover.dayLabel, cover.dayNumber, races);
    const drawn = bet.drawn[p.race - 1];
    const rd = raceDayFor(bet, drawn);
    return racePageScreen({ book: bet.book, ctx: bet.ctx, rd: rd.raceDay, look: rd.cardLook, drawn, page: this.raceState()!, focus: this.state.focus });
  }

  private redraw(): void {
    const s = this.screen();
    const p = this.page;
    p.clear();
    p.rects(s.rects);
    p.images(s.images);
    p.texts(s.texts);
    for (const e of s.entries) p.entry(e);
    this.cursor.setVisible(s.cursor !== null);
    if (s.cursor) this.cursor.setPosition(s.cursor.x, s.cursor.y);
    announce(s.aria);
  }

  /** A key's or a click's result: the same handling for both (TH12). */
  private apply(r: { state: BookState; outcome: BookOutcome }): void {
    const o = r.outcome;
    if (o?.kind === 'close') return this.close();
    if (o?.kind === 'window') return this.toWindow(o.post);
    if (r.state.page === this.state.page && r.state.focus === this.state.focus) return;
    this.state = r.state;
    this.redraw();
  }

  /** Esc or "Esc: close": back to the track. Read from the day-start cover or news (FL1), Bet otherwise (FL2, 23.3). No money moves. */
  private close(): void {
    if (this.leaving) return;
    this.leaving = true;
    const d = this.data0;
    this.scene.start('hub', { bet: d.bet, day: this.day, art: d.art, held: this.keys.down(), focus: bookCloseFocus(d.from, d.bet.ctx.races.length, this.state.page) } satisfies HubData);
  }

  /** BB4: the window with the ticket open on that post at the remembered amount. */
  private toWindow(post: number): void {
    if (this.leaving) return;
    const d = this.data0;
    // The page said "Enter: to window" only with prices posted and an amount offered; check again so the window never opens a ticket it cannot price.
    if (offeredAmounts(this.day.bankrollCents, d.bet.ctx.rules).length === 0) return;
    this.leaving = true;
    this.scene.start('window', { bet: d.bet, day: this.day, art: d.art, held: this.keys.down(), post, ticket: true } satisfies WindowData);
  }

  private fail(err: unknown): void {
    if (this.leaving) return;
    this.leaving = true;
    console.error(err);
    this.scene.start('error', { lines: betErrorLines(this.data0.day.daySeed, this.data0.day.nextRace, err), art: this.data0.art });
  }
}
