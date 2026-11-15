import { afterEach, describe, expect, it, vi } from 'vitest';
import { racePageState } from '../bet/bookPage';
import { goToPost, quote, type DayState } from '../bet/day';
import { offeredAmounts } from '../bet/money';
import { loadBook } from '../data/bookLoad';
import { loadHub } from '../data/hubLoad';
import { betting, ctx, DAY_SEED, dayWith, drawnOf, programOf, settled } from '../render/betKit';
import { bookAtCover, bookAtRace, bookClick, bookCloseFocus, bookKey, bookPointerTargets, pageAt, type BookKeyContext, type BookState, type BookTargetId } from '../render/bookScreen';
import { arriveHub, hubClick, hubKey, hubPointerTargets, type HubState } from '../render/hubScreen';
import { hitTest, pointerDown, pointerState, pointerUp, type PointerTarget } from '../render/pointer';
import { lastBetDollars, type ProgramKeyContext } from '../render/programScreen';
import { resultPointerTargets } from '../render/resultScreen';
import { shippedRaceDay } from '../render/testkit';
import {
  initialWindowState, windowClick, windowFromBook, windowKey, windowPointerTargets, type WindowState, type WindowTargetId,
} from '../render/windowScreen';
import { nextDay, startDay } from './betDay';
import type { Estimates } from './estimates';

// FL5 (scripted paths) and FL2 (the flow halves) from docs/specs/book-and-window.md section 2,
// which replace track-hub.md's TH14 and TH5 (amendment 20), and TH9 from track-hub.md. The
// scenes need a browser, so `Flow` below stands in for them: it holds one screen at a time and
// routes each press to that screen's pure module (the track's, the book's, the window's, the
// result's pointer targets), then acts on the outcome the way the spec says the scene does:
// book (open at race r's page), window (choosing at post k, or the ticket open from the book),
// watch (go to the post, no bet), bet (Go to the post), close and back (return to the track),
// next (to the track). It counts one press per key or per click (a click is a down and an up).
// Prices are posted for every race it reaches (programOf).

const hub = loadHub();
const book = loadBook();
const AFTER_RACE_1 = (): DayState => settled(programOf(1), dayWith(10000), null, 1);

type Screen =
  | { at: 'result' }
  | { at: 'hub'; state: HubState }
  | { at: 'book'; state: BookState }
  | { at: 'window'; state: WindowState }
  | { at: 'race'; ticket: { post: number; dollars: number } | null }
  | { at: 'endOfDay' };

class Flow {
  presses = 0;
  trail: string[] = [];
  /**
   * `bookOpened`: the book was opened earlier this day (24.2), so Read opens race r's page.
   * The default flow is after race 1, with the book read before race 1.
   */
  constructor(public day: DayState = AFTER_RACE_1(), public screen: Screen = { at: 'result' }, public bookOpened = true) {}

  /** The day's start (24.1): race 1, at the track on Read, the book not yet opened today. */
  static dayStart(): Flow { return new Flow(dayWith(10000), { at: 'hub', state: arriveHub(hub) }, false); }

  private get drawn() { return drawnOf()[this.day.nextRace - 1]; }
  private windowKeys(): ProgramKeyContext {
    return { horses: this.drawn.horseIds.length, ready: true, offered: offeredAmounts(this.day.bankrollCents, ctx.rules), lastDollars: lastBetDollars(this.day) };
  }
  private bookKeys(s: BookState): BookKeyContext {
    const races = ctx.races.length;
    const p = pageAt(races, s.page);
    if (p.kind !== 'race') return { races, nextRace: this.day.nextRace, horses: 0, enter: 'none' };
    const posted = new Map<number, string[]>();
    for (const r of [this.day.nextRace, this.day.nextRace + 1]) if (r <= races) posted.set(r, quote(ctx, programOf(r), null).odds);
    const page = racePageState(book, { page: p.race, nextRace: this.day.nextRace, fieldSize: drawnOf()[p.race - 1].horseIds.length, records: this.day.records, posted });
    return { races, nextRace: this.day.nextRace, horses: drawnOf()[p.race - 1].horseIds.length, enter: page.enter };
  }
  private toTrack(from: 'arrival' | 'back') { this.screen = { at: 'hub', state: arriveHub(hub, {}, from) }; }
  private goToPost(bet: { post: number; dollars: number } | null) {
    this.day = goToPost(ctx, this.day, programOf(this.day.nextRace), bet);
    this.screen = { at: 'race', ticket: bet };
  }
  private next() { if (this.day.ended !== null) this.screen = { at: 'endOfDay' }; else this.toTrack('arrival'); }

  key(code: string): this {
    this.presses++;
    this.trail.push(code);
    const s = this.screen;
    if (s.at === 'result') { if (['Enter', 'Space', 'KeyZ'].includes(code)) this.next(); }
    else if (s.at === 'hub') {
      const r = hubKey(hub, s.state, code, { fieldSize: this.drawn.horseIds.length, ready: true });
      this.screen = { at: 'hub', state: r.state };
      this.hubOutcome(r.outcome);
    } else if (s.at === 'book') {
      const r = bookKey(s.state, code, this.bookKeys(s.state));
      this.screen = { ...s, state: r.state };
      this.bookOutcome(r.outcome, r.state);
    } else if (s.at === 'window') {
      const r = windowKey(s.state, code, this.windowKeys());
      this.screen = { at: 'window', state: r.state };
      this.windowOutcome(r.outcome);
    }
    return this;
  }

  click(x: number, y: number): this {
    this.presses++;
    this.trail.push(`click ${x},${y}`);
    const s = this.screen;
    const click = <T extends string>(targets: readonly PointerTarget<T>[]): T | null => {
      const at = hitTest(targets, { x, y });
      const down = pointerDown(pointerState<T>(), 0, at);
      return pointerUp(down, 0, at).act;
    };
    if (s.at === 'result') { if (click(resultPointerTargets()) !== null) this.next(); }
    else if (s.at === 'hub') {
      const id = click(hubPointerTargets(hub));
      if (id !== null) {
        const r = hubClick(hub, s.state, id, { fieldSize: this.drawn.horseIds.length, ready: true });
        this.screen = { at: 'hub', state: r.state };
        this.hubOutcome(r.outcome);
      }
    } else if (s.at === 'book') {
      const k = this.bookKeys(s.state);
      const id = click<BookTargetId>(bookPointerTargets(book, s.state, k));
      if (id !== null) {
        const r = bookClick(s.state, id, k);
        this.screen = { ...s, state: r.state };
        this.bookOutcome(r.outcome, r.state);
      }
    } else if (s.at === 'window') {
      const k = this.windowKeys();
      const id = click<WindowTargetId>(windowPointerTargets(hub, shippedRaceDay.raceDay, s.state, k));
      if (id !== null) {
        const r = windowClick(s.state, id, k);
        this.screen = { at: 'window', state: r.state };
        this.windowOutcome(r.outcome);
      }
    }
    return this;
  }

  private hubOutcome(o: ReturnType<typeof hubKey>['outcome']) {
    if (o === null || o.kind === 'look') return;
    if (o.kind === 'book') {
      // 24.2: the day's first opening is on the cover, every later one at race r's page.
      this.screen = { at: 'book', state: this.bookOpened ? bookAtRace(this.day.nextRace) : bookAtCover() };
      this.bookOpened = true;
    }
    else if (o.kind === 'window') this.screen = { at: 'window', state: initialWindowState(o.post) };
    else this.goToPost(null);
  }
  private bookOutcome(o: ReturnType<typeof bookKey>['outcome'], at: BookState) {
    if (o === null) return;
    if (o.kind === 'close') this.toTrack(bookCloseFocus(ctx.races.length, at.page)); // 24.4: by the page
    else this.screen = { at: 'window', state: windowFromBook(o.post, this.windowKeys()) };
  }
  private windowOutcome(o: ReturnType<typeof windowKey>['outcome']) {
    if (o === null) return;
    if (o.kind === 'bet') this.goToPost({ post: o.post, dollars: o.dollars });
    else this.toTrack('back');
  }

  /** Runs every step, checking the race has not started before the last one. */
  run(steps: (string | [number, number])[]): this {
    steps.forEach((st, i) => {
      if (typeof st === 'string') this.key(st); else this.click(st[0], st[1]);
      if (i < steps.length - 1) expect(this.screen.at, `after press ${i + 1} (${this.trail[this.trail.length - 1]})`).not.toBe('race');
    });
    return this;
  }
}

const amount = offeredAmounts(10000, ctx.rules)[0];
// Points inside the specs' boxes: the result's action line; the track's Read row (y205-213),
// windows (x0-111, y96-175) and rail; the book's cover body, entry 3 (y57 + 38 .. 75 + 38),
// "Esc: close" (x80-175, y222-235) and the next item (x176-247); the window's row 3
// (y111 + 22 .. y121 + 22), "Enter: bet" (x164-247, y206-217) and "Esc: back" (x176-247, y218-229).
const RESULT_NEXT_AT: [number, number] = [100, 224];
const READ_AT: [number, number] = [100, 209];
const WINDOWS_AT: [number, number] = [50, 150];
const RAIL_AT: [number, number] = [200, 120];
const COVER_AT: [number, number] = [100, 100];
const ENTRY3_AT: [number, number] = [100, 100];
const CLOSE_AT: [number, number] = [120, 228];
const NEXT_PAGE_AT: [number, number] = [210, 228];
const ROW3_AT: [number, number] = [100, 136];
const BET_AT: [number, number] = [200, 210];
const BACK_AT: [number, number] = [200, 224];

afterEach(() => vi.restoreAllMocks());

const placedBet = (f: Flow, post: number, race = 2, before = AFTER_RACE_1().bankrollCents) => {
  expect(f.screen).toEqual({ at: 'race', ticket: { post, dollars: amount } });
  expect(f.day.open?.program.drawn.race).toBe(race);
  expect(f.day.open?.ticket).toMatchObject({ race, post, dollars: amount });
  expect(f.day.bankrollCents).toBe(before - amount * 100);
};
const noBet = (f: Flow) => {
  expect(f.screen).toEqual({ at: 'race', ticket: null });
  expect(f.day.open?.program.drawn.race).toBe(2);
  expect(f.day.open?.ticket).toBeNull();
  expect(f.day.bankrollCents).toBe(AFTER_RACE_1().bankrollCents);
};

describe('FL5: by keys, each path reaches the next race with those presses and no others', () => {
  it('fast bet: Enter, digit, Enter, Enter is 4 presses', () => {
    const f = new Flow().run(['Enter', 'Digit3', 'Enter', 'Enter']);
    expect(f.presses).toBe(4);
    placedBet(f, 3);
  });

  it('menu bet, no reading: Enter, Down, Enter, digit, Enter, Enter is 6 presses', () => {
    const f = new Flow().run(['Enter', 'ArrowDown', 'Enter', 'Digit3', 'Enter', 'Enter']);
    expect(f.presses).toBe(6);
    placedBet(f, 3);
  });

  it('pass: Enter, Up (wraps to Watch), Enter is 3 presses', () => {
    const f = new Flow().run(['Enter', 'ArrowUp', 'Enter']);
    expect(f.presses).toBe(3);
    noBet(f);
  });

  it('read, then bet: Enter, Enter (Read), digit (in the book), Enter (window, ticket open), Enter is 5 presses', () => {
    const f = new Flow().run(['Enter', 'Enter', 'Digit3', 'Enter', 'Enter']);
    expect(f.presses).toBe(5);
    placedBet(f, 3);
  });

  it('read, then pass: Enter, Enter, Esc (track, on Bet), Down (Watch), Enter is 5 presses', () => {
    const f = new Flow().run(['Enter', 'Enter', 'Escape', 'ArrowDown', 'Enter']);
    expect(f.presses).toBe(5);
    noBet(f);
  });

  it('day start, first read then bet: Enter (Read, the cover), Enter (news), Enter (race 1), digit, Enter, Enter is 6 presses (24.5)', () => {
    const f = Flow.dayStart().run(['Enter', 'Enter', 'Enter', 'Digit3', 'Enter', 'Enter']);
    expect(f.presses).toBe(6);
    placedBet(f, 3, 1, 10000);
  });

  it('day start, no reading: digit, Enter, Enter is 3 presses (24.5)', () => {
    const f = Flow.dayStart().run(['Digit3', 'Enter', 'Enter']);
    expect(f.presses).toBe(3);
    placedBet(f, 3, 1, 10000);
  });

  it('every digit works in the fast path and in the book, and lands on its own post', () => {
    for (let k = 1; k <= 8; k++) {
      placedBet(new Flow().run(['Enter', `Digit${k}`, 'Enter', 'Enter']), k);
      placedBet(new Flow().run(['Enter', 'Enter', `Digit${k}`, 'Enter', 'Enter']), k);
    }
  });

  it('looking around first adds only the presses it takes, and changes nothing about the bet', () => {
    const f = new Flow().run(['Enter', 'ArrowRight', 'Enter', 'Escape', 'Digit3', 'Enter', 'Enter']);
    expect(f.presses).toBe(7);
    placedBet(f, 3);
  });

  it('a fast bet with Space or Z in place of Enter is the same path', () => {
    placedBet(new Flow().run(['Space', 'Digit3', 'KeyZ', 'Space']), 3);
  });

  it('paging the book ahead and back adds one press a page, and the bet is the same', () => {
    const f = new Flow().run(['Enter', 'Enter', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft', 'Digit3', 'Enter', 'Enter']);
    expect(f.presses).toBe(9);
    placedBet(f, 3);
  });

  it('Esc from the window and a second trip in is 2 more presses, with no money moved on the way', () => {
    const f = new Flow().run(['Enter', 'ArrowDown', 'Enter', 'Escape', 'Enter', 'Digit3', 'Enter', 'Enter']);
    expect(f.presses).toBe(8);
    placedBet(f, 3);
  });
});

describe('FL5: by clicks, the counts in section 2', () => {
  it('fast bet in 4: Next race, the windows, the #3 row (opens the ticket), "Enter: bet"', () => {
    const f = new Flow().run([RESULT_NEXT_AT, WINDOWS_AT, ROW3_AT, BET_AT]);
    expect(f.presses).toBe(4);
    placedBet(f, 3);
  });

  it('pass in 2: Next race, the rail', () => {
    const f = new Flow().run([RESULT_NEXT_AT, RAIL_AT]);
    expect(f.presses).toBe(2);
    noBet(f);
  });

  it('read, then bet in 4: Next race, "Read Race r", the #3 entry (window, ticket open), "Enter: bet"', () => {
    const f = new Flow().run([RESULT_NEXT_AT, READ_AT, ENTRY3_AT, BET_AT]);
    expect(f.presses).toBe(4);
    placedBet(f, 3);
  });

  it('read, then pass in 4: Next race, Read, "Esc: close", the rail', () => {
    const f = new Flow().run([RESULT_NEXT_AT, READ_AT, CLOSE_AT, RAIL_AT]);
    expect(f.presses).toBe(4);
    noBet(f);
  });

  it('day start, first read then bet in 5: Read, the cover, "Race 1 >", the #3 entry, "Enter: bet" (24.1, 24.2)', () => {
    const f = Flow.dayStart().run([READ_AT, COVER_AT, NEXT_PAGE_AT, ENTRY3_AT, BET_AT]);
    expect(f.presses).toBe(5);
    placedBet(f, 3, 1, 10000);
  });

  it('day start, no reading, bet in 3: the windows, the #3 row, "Enter: bet" (24.1)', () => {
    const f = Flow.dayStart().run([WINDOWS_AT, ROW3_AT, BET_AT]);
    expect(f.presses).toBe(3);
    placedBet(f, 3, 1, 10000);
  });

  it('a click on the row being bet does not place the bet: the path needs the 4th click', () => {
    const f = new Flow().run([RESULT_NEXT_AT, WINDOWS_AT, ROW3_AT, ROW3_AT]);
    expect(f.screen.at).toBe('window');
    expect(f.day.open).toBeNull();
  });

  it('a click on the sky or the status bar of the track does nothing', () => {
    const f = new Flow().run([RESULT_NEXT_AT, [200, 20], [10, 5], [100, 190]]);
    expect(f.screen.at).toBe('hub');
  });

  it('clicks on the window\'s picture, its clerk line and the gap above the ticket rows do nothing', () => {
    const f = new Flow().run([RESULT_NEXT_AT, WINDOWS_AT, [100, 30], [128, 60], [100, 100], [100, 205]]);
    expect(f.screen).toMatchObject({ at: 'window', state: { mode: { kind: 'choosing' } } });
  });

  it('a click on an entry of a page other than race r\'s only focuses it', () => {
    const f = new Flow().run([RESULT_NEXT_AT, READ_AT, NEXT_PAGE_AT, ENTRY3_AT]);
    expect(f.screen).toMatchObject({ at: 'book', state: { focus: 2 } });
    expect(f.day.open).toBeNull();
  });
});

describe('FL2: focus on return, and no money moves on the way (replaces TH5)', () => {
  const focusOf = (f: Flow) => (f.screen as { state: HubState }).state.focus;

  it('from the result, the track opens on Read', () => {
    expect(focusOf(new Flow().key('Enter'))).toBe('read');
    expect(focusOf(new Flow().click(...RESULT_NEXT_AT))).toBe('read');
  });

  it('FL1 as amended by 24.6: boot and New day open a fresh day (no looks, clerk cycles reset, the book not opened) at the track on Read; its first Read opens the cover; Esc there goes back on Read', () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const stub = { get: () => null, request: () => undefined, failure: () => null } as unknown as Estimates;
    const { bet, day } = startDay(ctx, betting, shippedRaceDay, stub, DAY_SEED, hub);
    expect(bet.looks).toEqual({});
    expect(bet.clerk).toEqual({ ticket: 0, punch: 0 });
    const fresh = nextDay({ ...bet, looks: { fans: 4 }, clerk: { ticket: 3, punch: 2 } }, day);
    expect(fresh.bet.looks).toEqual({});
    expect(fresh.bet.clerk).toEqual({ ticket: 0, punch: 0 });
    expect(fresh.day.nextRace).toBe(1);
    expect(bet.bookOpened).toBe(false);
    expect(nextDay({ ...bet, bookOpened: true }, day).bet.bookOpened).toBe(false);
    const f = Flow.dayStart();
    expect(f.screen).toMatchObject({ at: 'hub', state: { focus: 'read' } });
    f.key('Enter');
    expect(f.screen).toMatchObject({ at: 'book', state: { page: 0 } });
    f.key('Enter');
    expect(f.screen).toMatchObject({ at: 'book', state: { page: 1 } });
    expect(focusOf(Flow.dayStart().key('Enter').key('Escape'))).toBe('read');
  });

  it('Esc from the book or the window returns to the track on Bet, whatever the track focus was, with the day untouched', () => {
    for (const via of [
      ['Enter', 'Enter', 'Escape'], ['Enter', 'Enter', 'ArrowRight', 'Digit4', 'Escape'],
      ['Enter', 'ArrowRight', 'ArrowRight', 'Digit4', 'Escape'], ['Enter', 'ArrowDown', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape'],
    ]) {
      const f = new Flow();
      const before = JSON.stringify(f.day);
      f.run(via);
      expect(f.screen.at, via.join()).toBe('hub');
      expect(focusOf(f), via.join()).toBe('windows');
      expect(JSON.stringify(f.day)).toBe(before);
    }
  });

  it('"Esc: close" and "Esc: back" by click do the same', () => {
    for (const via of [[RESULT_NEXT_AT, READ_AT, CLOSE_AT], [RESULT_NEXT_AT, WINDOWS_AT, BACK_AT]]) {
      const f = new Flow();
      const before = JSON.stringify(f.day);
      f.run(via);
      expect(f.screen.at).toBe('hub');
      expect(focusOf(f)).toBe('windows');
      expect(JSON.stringify(f.day)).toBe(before);
    }
  });

  it('WI3: with the ticket open (from the book), the first Esc closes it on that horse, the second goes back; no money moves', () => {
    const f = new Flow();
    const before = JSON.stringify(f.day);
    f.run(['Enter', 'Enter', 'Digit3', 'Enter']);
    expect(f.screen).toMatchObject({ at: 'window', state: { mode: { kind: 'ticket' }, focus: 2 } });
    f.key('Escape');
    expect(f.screen).toMatchObject({ at: 'window', state: { mode: { kind: 'choosing' }, focus: 2 } });
    f.key('Escape');
    expect(f.screen.at).toBe('hub');
    expect(focusOf(f)).toBe('windows');
    expect(JSON.stringify(f.day)).toBe(before);
  });
});

describe('TH9: the track is never shown after the last race or with a bankroll under the minimum bet', () => {
  it('after race 8 the day has ended, so the result leads to End of day, not the track', () => {
    let day = dayWith(10000);
    for (let r = 1; r <= 8; r++) day = settled(programOf(r), day, null, 1);
    expect(day.ended).toBe('lastRace');
    expect(new Flow(day).key('Enter').screen.at).toBe('endOfDay');
    expect(new Flow(day).click(...RESULT_NEXT_AT).screen.at).toBe('endOfDay');
  });

  it('a settled bankroll under $2 ends the day', () => {
    const day = settled(programOf(1), dayWith(300), { post: 3, dollars: 2 }, 1); // $3 less a lost $2 = $1
    expect(day.bankrollCents).toBe(100);
    expect(day.ended).toBe('broke');
    expect(new Flow(day).key('Enter').screen.at).toBe('endOfDay');
  });

  it('a bankroll of exactly $2 after settling can still bet, so the track shows', () => {
    const day = settled(programOf(1), dayWith(400), { post: 3, dollars: 2 }, 1);
    expect(day.bankrollCents).toBe(200);
    expect(day.ended).toBeNull();
    expect(new Flow(day).key('Enter').screen.at).toBe('hub');
  });

  it('a mid-day result goes to the track', () => {
    expect(new Flow().key('Enter').screen.at).toBe('hub');
  });
});
