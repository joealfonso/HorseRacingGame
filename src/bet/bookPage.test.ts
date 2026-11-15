import { describe, expect, it } from 'vitest';
import { loadBook } from '../data/bookLoad';
import { bookPages, centeredX, coverFor, pageName, racePageState, runningFoot, type RacePageInput, type RunRace } from './bookPage';
import { drawnDay } from './day';
import { newsFor } from './news';
import { realCtx } from './testkit';

// The data half of CV1 and BB3, and the foot's data (BB1, BB6): the book's pages as plain data.

const ctx = realCtx();
const book = loadBook();
const news = (seed: number) => newsFor(book, { daySeed: seed, fields: drawnDay(ctx, seed), stable: ctx.stable });

describe('CV1: the cover\'s fields', () => {
  it('CV1: track is race 1\'s, the day pair is the seed, the race count is the day\'s, the line is the headline of the item taken first (book-useful.md 3.4)', () => {
    const items = news(12345);
    const c = coverFor(book, { daySeed: 12345, trackName: ctx.races[0].track, raceCount: ctx.races.length, news: items });
    expect(c.track).toBe('Churchill Downs');
    expect(c.mastheadName).toBe('CHURCHILL DOWNS');
    expect(c.title).toBe('Race Day Program');
    expect(c.dayLabel).toBe('Day');
    expect(c.dayNumber).toBe('#12345');
    expect(c.races).toBe('8 races today');
    expect(c.line).toBe(items.find((i) => i.lead)!.headline);
  });

  it('CV1: the type is centered as the spec says (display font 12 px a character, main font 8)', () => {
    const c = coverFor(book, { daySeed: 1, trackName: 'Churchill Downs', raceCount: 8, news: news(1) });
    expect(c.mastheadX).toBe(Math.floor((256 - 12 * 15) / 2));
    expect(c.mastheadX).toBe(38);
    expect(c.titleX).toBe(64);
    expect(c.racesX + 8 * c.races.length - 1).toBe(247);
    expect(c.lineX).toBe(centeredX(c.line.length, 8));
    expect(centeredX(19, 12)).toBe(14);
  });

  it('CV1: the cover line is the lead item\'s headline for every seed, and fits 30; with no news it is blank', () => {
    for (let s = 0; s < 50; s++) {
      const items = news(s);
      const c = coverFor(book, { daySeed: s, trackName: 'Churchill Downs', raceCount: 8, news: items });
      expect(c.line).toBe(items.find((i) => i.lead)!.headline);
      expect(c.line.length).toBeLessThanOrEqual(30);
      expect(c.dayNumber).toBe(`#${s}`);
    }
    expect(coverFor(book, { daySeed: 1, trackName: 'Churchill Downs', raceCount: 8, news: [] }).line).toBe('');
  });
});

describe('BB1 and BB6: the pages and the running foot', () => {
  it('BB1: cover, news, race 1 to race n', () => {
    expect(bookPages(8).map((p) => pageName(book, p))).toEqual(['Cover', 'News', 'Race 1', 'Race 2', 'Race 3', 'Race 4', 'Race 5', 'Race 6', 'Race 7', 'Race 8']);
    expect(bookPages(3)).toHaveLength(5);
  });

  it('BB6: the cover has no previous item, race n has no next item, the rest name their neighbors', () => {
    expect(runningFoot(book, 0, 8)).toEqual({ prev: null, close: 'Esc: close', next: 'News >' });
    expect(runningFoot(book, 1, 8)).toEqual({ prev: '< Cover', close: 'Esc: close', next: 'Race 1 >' });
    expect(runningFoot(book, 2, 8)).toEqual({ prev: '< News', close: 'Esc: close', next: 'Race 2 >' });
    expect(runningFoot(book, 5, 8)).toEqual({ prev: '< Race 3', close: 'Esc: close', next: 'Race 5 >' });
    expect(runningFoot(book, 9, 8)).toEqual({ prev: '< Race 7', close: 'Esc: close', next: null });
  });

  it('BB6: every foot text fits 8 characters, and a page that is not there is an error', () => {
    for (let i = 0; i < 10; i++) for (const t of [runningFoot(book, i, 8).prev, runningFoot(book, i, 8).next]) expect((t ?? '').length).toBeLessThanOrEqual(8);
    expect(() => runningFoot(book, 10, 8)).toThrow();
    expect(() => runningFoot(book, -1, 8)).toThrow();
  });
});

describe('BB3: race page states (spec section 5, "Page states")', () => {
  const crowd = (n: number) => Array.from({ length: n }, (_v, i) => `${i + 2}-1`);
  const run = (race: number, winnerPost: number, ticketPost: number | null): RunRace => ({
    race, odds: crowd(8).map((o) => `at post ${o}`), winnerPost, ticket: ticketPost === null ? null : { post: ticketPost },
  });
  const input = (over: Partial<RacePageInput>): RacePageInput => ({ page: 3, nextRace: 3, fieldSize: 8, records: [], posted: new Map(), ...over });
  const dashes = (n: number) => Array.from({ length: n }, () => null);

  it('race r, prices posted: crowd prices, "Enter: to window", blurb, Enter goes to the window', () => {
    const s = racePageState(book, input({ posted: new Map([[3, crowd(8)]]) }));
    expect(s).toEqual({ race: 3, kind: 'posted', odds: crowd(8), right: 'Enter: to window', footer: 'blurb', enter: 'window', tick: null });
  });

  it('race r, prices pending: every cell "-" (null), blank right slot, the pending line, Enter does nothing', () => {
    expect(racePageState(book, input({}))).toEqual({ race: 3, kind: 'pending', odds: dashes(8), right: '', footer: 'pending', enter: 'none', tick: null });
  });

  it('race r + 1, prices posted: crowd prices, blank right slot, blurb, Enter does nothing', () => {
    const s = racePageState(book, input({ page: 4, posted: new Map([[4, crowd(8)]]) }));
    expect(s).toEqual({ race: 4, kind: 'nextPosted', odds: crowd(8), right: '', footer: 'blurb', enter: 'none', tick: null });
  });

  it('race r + 1 still pending, and any other race not yet run: dashes, "Prices later", blurb, Enter does nothing', () => {
    for (const page of [4, 5, 8]) {
      expect(racePageState(book, input({ page })), `page ${page}`).toEqual({ race: page, kind: 'later', odds: dashes(8), right: 'Prices later', footer: 'blurb', enter: 'none', tick: null });
    }
  });

  it('a race beyond r + 1 shows dashes even if a price for it happens to be known (the book shows only r and r + 1)', () => {
    const s = racePageState(book, input({ page: 6, posted: new Map([[6, crowd(8)]]) }));
    expect(s.kind).toBe('later');
    expect(s.odds).toEqual(dashes(8));
  });

  it('a race already run: odds at post, "Winner: #5", no tick when no bet', () => {
    const s = racePageState(book, input({ page: 2, nextRace: 3, records: [run(1, 1, null), run(2, 5, null)] }));
    expect(s).toEqual({ race: 2, kind: 'run', odds: run(2, 5, null).odds, right: 'Winner: #5', footer: 'blurb', enter: 'none', tick: null });
  });

  it('a run race you bet on: the tick sits on the horse you bet on, win or lose', () => {
    expect(racePageState(book, input({ page: 2, records: [run(2, 5, 3)] })).tick).toBe(3);
    expect(racePageState(book, input({ page: 2, records: [run(2, 5, 5)] })).tick).toBe(5);
    expect(racePageState(book, input({ page: 2, records: [run(2, 5, 3)] })).right).toBe('Winner: #5');
  });

  it('a run page\'s odds are the result\'s odds at post, whatever prices are posted now', () => {
    const rec = run(2, 5, 3);
    const s = racePageState(book, input({ page: 2, records: [rec], posted: new Map([[2, crowd(8)]]) }));
    expect(s.odds).toEqual(rec.odds);
  });

  it('fewer than 8 horses: the odds cells end early', () => {
    expect(racePageState(book, input({ fieldSize: 6 })).odds).toEqual(dashes(6));
    expect(racePageState(book, input({ fieldSize: 6, posted: new Map([[3, crowd(6)]]) })).odds).toHaveLength(6);
  });

  it('every combination of page, next race and posted state matches the table', () => {
    for (let nextRace = 1; nextRace <= 8; nextRace++) {
      for (let page = 1; page <= 8; page++) {
        for (const postedRaces of [[], [nextRace], [nextRace + 1], [nextRace, nextRace + 1]]) {
          const posted = new Map(postedRaces.map((r) => [r, crowd(8)] as const));
          const records = Array.from({ length: nextRace - 1 }, (_v, i) => run(i + 1, 2, null));
          const s = racePageState(book, input({ page, nextRace, records, posted }));
          if (page < nextRace) expect([s.kind, s.right], `${page}/${nextRace}`).toEqual(['run', 'Winner: #2']);
          else if (page === nextRace) expect(s.kind).toBe(postedRaces.includes(page) ? 'posted' : 'pending');
          else if (page === nextRace + 1 && postedRaces.includes(page)) expect(s.kind).toBe('nextPosted');
          else expect([s.kind, s.right]).toEqual(['later', 'Prices later']);
          expect(s.enter).toBe(s.kind === 'posted' ? 'window' : 'none');
          expect(s.odds).toHaveLength(8);
        }
      }
    }
  });
});
