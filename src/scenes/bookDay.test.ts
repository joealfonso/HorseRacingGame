import { afterEach, describe, expect, it, vi } from 'vitest';
import { coverFor, racePageState } from '../bet/bookPage';
import { quote, type DrawnRace } from '../bet/day';
import { newsFor } from '../bet/news';
import { startEstimate, stepEstimate } from '../bet/estimate';
import { loadHub } from '../data/hubLoad';
import { betting, ctx, DAY_SEED, lookFor, programOf, RUNS, settled } from '../render/betKit';
import { bookAtCover, bookClick, bookKey, bookPointerTargets, coverScreen, newsScreen, pageAt, racePageScreen, type BookState } from '../render/bookScreen';
import { shippedRaceDay } from '../render/testkit';
import { newsOf, nextDay, postedPrices, requestNextEstimates, startDay } from './betDay';
import type { Estimates } from './estimates';

// The book's half of the day session (docs/specs/book-and-window.md sections 5 and 15 and
// book-useful.md section 2): no previous day kept, the clerk's cycles reset on New day, the
// prices the book shows (races r and r + 1 only, BB5), and FL6: reading changes nothing.

afterEach(() => vi.restoreAllMocks());

/** An estimates stub that records what was asked for and answers the races in `done`. */
function stubEstimates(done: readonly number[] = []) {
  const asked: number[] = [];
  const job = (d: DrawnRace) => stepEstimate(startEstimate(d.daySeed, d.race, RUNS, d.horseIds.length), d.input, RUNS);
  const e = {
    request: (d: DrawnRace) => { asked.push(d.race); },
    get: (d: DrawnRace) => (done.includes(d.race) ? job(d) : null),
    failure: () => null,
  } as unknown as Estimates;
  return { e, asked };
}

describe('the day session for the book', () => {
  it('New day starts the next day with the clerk\'s cycles reset, and keeps no previous day: the news reads none (book-useful.md section 2)', () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { bet, day } = startDay(ctx, betting, shippedRaceDay, stubEstimates().e, DAY_SEED, loadHub());
    expect(bet).not.toHaveProperty('previous');
    const ended = { ...settled(programOf(1), day, null, 4), ended: 'lastRace' as const };
    const next = nextDay({ ...bet, clerk: { ticket: 3, punch: 2 } }, ended);
    expect(next.bet).not.toHaveProperty('previous');
    expect(next.day.daySeed).toBe(DAY_SEED + 1);
    expect(next.bet.clerk).toEqual({ ticket: 0, punch: 0 });
    // The next day's news is the news of its own seed, whatever was played the day before.
    expect(newsOf(next.bet, next.day.daySeed)).toEqual(newsOf(startDay(ctx, betting, shippedRaceDay, stubEstimates().e, DAY_SEED + 1, loadHub()).bet, DAY_SEED + 1));
  });

  it('NU1: the same day seed gives the same news; newsOf is newsFor on the session\'s day', () => {
    const { bet, day } = startDay(ctx, betting, shippedRaceDay, stubEstimates().e, DAY_SEED, loadHub());
    expect(newsOf(bet, day.daySeed)).toEqual(newsOf(bet, day.daySeed));
    expect(newsOf(bet, day.daySeed)).toEqual(newsFor(bet.book, {
      daySeed: DAY_SEED, fields: bet.drawn, stable: ctx.stable,
    }));
  });

  it('postedPrices gives the crowd\'s prices with no bet for races r and r + 1 once worked out, and nothing else', () => {
    const { e } = stubEstimates([1, 2, 3, 4]);
    const { bet, day } = startDay(ctx, betting, shippedRaceDay, e, DAY_SEED, loadHub());
    const p = postedPrices(bet, day);
    expect([...p.keys()]).toEqual([1, 2]);
    expect(p.get(1)).toEqual(quote(ctx, programOf(1), null).odds);
    // On the last race there is no r + 1.
    const last = startDay(ctx, betting, shippedRaceDay, stubEstimates([7, 8]).e, DAY_SEED, loadHub());
    expect([...postedPrices(last.bet, { ...last.day, nextRace: 8 }).keys()]).toEqual([8]);
    const none = startDay(ctx, betting, shippedRaceDay, stubEstimates([]).e, DAY_SEED, loadHub());
    expect(postedPrices(none.bet, none.day).size).toBe(0);
  });
});

describe('BB5 and FL6: reading the book', () => {
  it('opening and paging every page asks for no estimate past races r and r + 1, changes no day state, and draws no random number', () => {
    const rand = vi.spyOn(Math, 'random');
    const { e, asked } = stubEstimates([1, 2]);
    const { bet, day } = startDay(ctx, betting, shippedRaceDay, e, DAY_SEED, loadHub());
    const before = JSON.stringify({ day, looks: bet.looks, clerk: bet.clerk });
    // What the book scene does on opening, then on every page.
    requestNextEstimates(bet, day);
    const posted = postedPrices(bet, day);
    const news = newsOf(bet, day.daySeed);
    const cover = coverFor(bet.book, { daySeed: day.daySeed, trackName: ctx.races[0].track, raceCount: 8, news });
    let s: BookState = bookAtCover();
    const codes = ['Enter', 'Enter', 'ArrowDown', 'Digit4', 'ArrowRight', 'ArrowRight', 'ArrowUp', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'Digit2'];
    for (const code of codes) {
      const p = pageAt(8, s.page);
      const page = p.kind === 'race' ? racePageState(bet.book, { page: p.race, nextRace: day.nextRace, fieldSize: 8, records: day.records, posted }) : null;
      const k = { races: 8, horses: p.kind === 'race' ? 8 : 0, enter: page?.enter ?? 'none' } as const;
      if (p.kind === 'cover') coverScreen(bet.book, cover, 8);
      else if (p.kind === 'news') newsScreen(bet.book, news, cover.dayLabel, cover.dayNumber, 8);
      else racePageScreen({ book: bet.book, ctx, rd: shippedRaceDay.raceDay, look: lookFor(bet.drawn[p.race - 1]), drawn: bet.drawn[p.race - 1], page: page!, focus: s.focus });
      bookPointerTargets(bet.book, s, k);
      s = bookKey(s, code, k).state;
      s = bookClick(s, 'entry:3', k).state;
    }
    expect(asked).toEqual([1, 2]);
    expect(JSON.stringify({ day, looks: bet.looks, clerk: bet.clerk })).toBe(before);
    expect(rand).not.toHaveBeenCalled();
  });

  it('requestNextEstimates asks for race r then r + 1, and only r on the last race', () => {
    const { e, asked } = stubEstimates();
    const { bet, day } = startDay(ctx, betting, shippedRaceDay, e, DAY_SEED, loadHub());
    requestNextEstimates(bet, { ...day, nextRace: 5 });
    requestNextEstimates(bet, { ...day, nextRace: 8 });
    expect(asked).toEqual([5, 6, 8]);
  });
});

describe('postedPrices while polling', () => {
  it('keeps a race already known as it is and prices only the missing one', () => {
    const { e } = stubEstimates([1, 2]);
    const { bet, day } = startDay(ctx, betting, shippedRaceDay, e, DAY_SEED, loadHub());
    const known = new Map([[1, ['kept']]]);
    const p = postedPrices(bet, day, known);
    expect(p.get(1)).toEqual(['kept']);
    expect(p.get(2)).toEqual(quote(ctx, programOf(2), null).odds);
  });
});
