import { describe, expect, it, vi } from 'vitest';
import { daySummary, type DayState, type RaceRecord } from '../bet/day';
import { newsFor } from '../bet/news';
import { coverFor } from '../bet/bookPage';
import { loadBook } from '../data/bookLoad';
import { ctx, DAY_SEED, dayWith, drawnOf, paint, programOf, rd, settled } from './betKit';
import { endOfDayScreen, endOfDayPointerTargets, type EndOfDayScreen } from './endOfDayScreen';
import { hitTest } from './pointer';
import { CLOTH_BY_POST, deepFreeze } from './testkit';

// The End of day page, written from docs/specs/betting-screens.md sections 2, 6, 8, 9 (BE1 to
// BE3) and 10, DESIGN "End of day, the back page" (which wins on pixels), and CV1 of
// book-and-window.md. Expected money is worked out here from each race record (stake, return,
// ticket odds), never from the screen code. Dollars are formatted by `fmt` below, from the spec's
// money format ("$" then whole dollars with commas, then cents).

const book = loadBook();
const TRACK = 'Churchill Downs'; // race 1's track in day.json

const fmt = (cents: number): string => `$${Math.floor(cents / 100).toLocaleString('en-US')}.${String(cents % 100).padStart(2, '0')}`;

type Plan = Record<number, { post: number; dollars: number; winner: number }>;
/** Eight races: those in `plan` bet and settled with that winner, the rest passed (winner post 1). */
function dayOf(plan: Plan, start = 10000): DayState {
  let day = dayWith(start);
  for (let r = 1; r <= 8; r++) {
    const b = plan[r];
    day = settled(programOf(r), day, b ? { post: b.post, dollars: b.dollars } : null, b ? b.winner : 1);
  }
  return day;
}

/** What the day's figures must be, from the records alone. */
function byHand(state: DayState, start: number) {
  let cents = start;
  let bets = 0;
  let winners = 0;
  let best: { perDollar: number; odds: string } | null = null;
  for (const r of state.records) {
    if (r.ticket === null) { expect(r.returnCents).toBe(0); continue; }
    bets++;
    cents += r.returnCents - r.ticket.stakeCents;
    if (r.returnCents > 0) {
      winners++;
      const perDollar = r.returnCents / r.ticket.dollars;
      if (best === null || perDollar > best.perDollar) best = { perDollar, odds: r.ticket.odds };
    }
  }
  return { end: cents, change: cents - start, bets, winners, best: best?.odds ?? null, run: state.records.length };
}

const screenOf = (state: DayState, c = ctx): EndOfDayScreen =>
  endOfDayScreen({ rd, book, trackName: TRACK, summary: daySummary(c, state), records: state.records });
const at = (s: EndOfDayScreen, text: string, y: number) => {
  const hits = s.texts.filter((t) => t.text === text && t.y === y);
  expect(hits, `"${text}" at y${y}`).toHaveLength(1);
  return hits[0];
};
const textsAt = (s: EndOfDayScreen, y: number) => s.texts.filter((t) => t.y === y);
const rightEdge = (t: { text: string; x: number }) => t.x + 8 * t.text.length - 1;

// A scripted day, worked out by hand: race 2 a $2 ticket on #3 that wins, race 5 a $10 ticket
// on #6 that loses, race 7 a $2 ticket on #1 that wins; the other five races passed.
const SCRIPT: Plan = { 2: { post: 3, dollars: 2, winner: 3 }, 5: { post: 6, dollars: 10, winner: 1 }, 7: { post: 1, dollars: 2, winner: 1 } };

describe('BE1: the six figures match the day record', () => {
  const day = dayOf(SCRIPT);
  const hand = byHand(day, 10000);
  const s = screenOf(day);

  it('the scripted day is what the record says (so the checks below have something in them)', () => {
    expect(hand.bets).toBe(3);
    expect(hand.winners).toBe(2);
    expect(hand.run).toBe(8);
    expect(hand.end).toBe(day.bankrollCents);
    expect(day.records[1].returnCents).toBeGreaterThan(200); // a ticket that paid
    expect(day.records[4].returnCents).toBe(0); // a ticket that lost
    expect(day.records.filter((r) => r.ticket === null)).toHaveLength(5);
  });

  it('daySummary equals the hand count', () => {
    expect(daySummary(ctx, day)).toMatchObject({ daySeed: DAY_SEED, startCents: 10000, endCents: hand.end, changeCents: hand.change, racesRun: 8, betsMade: 3, winnersHit: 2, bestPriceHit: hand.best });
  });

  it('labels at x8, values right-aligned to x247, at cell tops y32 + 12i, in the order of the wireframe', () => {
    const rows: [string, string][] = [
      ['Started with', fmt(10000)],
      ['Ended with', fmt(hand.end)],
      ['Change', `${hand.change >= 0 ? '+' : '-'}${fmt(Math.abs(hand.change))}`],
      ['Bets made', '3 of 8'],
      ['Winners hit', '2'],
      ['Best price hit', hand.best!],
    ];
    rows.forEach(([label, value], i) => {
      const y = 32 + 12 * i;
      const l = at(s, label, y);
      const v = at(s, value, y);
      expect(l.x).toBe(8);
      expect(rightEdge(v)).toBe(247);
      expect(l.color).toBe('Ink');
    });
  });

  it('Best price hit is the winning ticket with the best price per dollar', () => {
    const won = day.records.filter((r) => r.returnCents > 0).map((r) => ({ r, per: r.returnCents / r.ticket!.dollars }));
    expect(won).toHaveLength(2);
    const top = won.sort((a, b) => b.per - a.per)[0].r.ticket!.odds;
    expect(at(s, top, 92).x).toBeGreaterThan(8);
    expect(hand.best).toBe(top);
  });

  it('the Change figure is Turf with a plus sign when up, Red with a minus sign when down, "Even" in Ink when level', () => {
    const up = screenOf(dayOf({ 2: { post: 3, dollars: 2, winner: 3 } }));
    const upHand = byHand(dayOf({ 2: { post: 3, dollars: 2, winner: 3 } }), 10000);
    expect(upHand.change).toBeGreaterThan(0);
    expect(at(up, `+${fmt(upHand.change)}`, 56).color).toBe('Turf');

    const downDay = dayOf({ 1: { post: 3, dollars: 2, winner: 4 }, 3: { post: 2, dollars: 10, winner: 1 } });
    const dh = byHand(downDay, 10000);
    expect(dh.change).toBe(-1200);
    expect(at(screenOf(downDay), '-$12.00', 56).color).toBe('Red');

    const even = dayOf({}, 10000);
    expect(byHand(even, 10000).change).toBe(0);
    expect(at(screenOf(even), 'Even', 56).color).toBe('Ink');
    expect(screenOf(even).texts.some((t) => t.text.startsWith('+') || t.text.startsWith('-'))).toBe(false);
  });

  it('thousands take commas: a record that ends at $12,340.50 prints so, as does a $20,620.00 return', () => {
    const base = dayOf({ 2: { post: 3, dollars: 2, winner: 3 } });
    const rich: DayState = { ...base, bankrollCents: 1234050 };
    const sc = screenOf(rich);
    at(sc, '$12,340.50', 44);
    at(sc, '+$12,240.50', 56);
    const records: RaceRecord[] = base.records.map((r, i) => (i === 1 ? { ...r, returnCents: 2062000 } : r));
    expect(endOfDayScreen({ rd, book, trackName: TRACK, summary: daySummary(ctx, base), records }).texts.map((t) => t.text)).toContain('Paid $20,620.00');
  });

  it('a day of passes: started and ended the same, Even, "0 of 8", 0 winners, best price "None"', () => {
    const passes = dayOf({});
    const sc = screenOf(passes);
    at(sc, '$100.00', 32);
    at(sc, '$100.00', 44);
    at(sc, 'Even', 56);
    at(sc, '0 of 8', 68);
    at(sc, '0', 80);
    at(sc, 'None', 92);
    expect(passes.bankrollCents).toBe(10000);
  });

  it('a day with bets but no winner: best price "None", winners 0', () => {
    const sc = screenOf(dayOf({ 1: { post: 2, dollars: 2, winner: 5 }, 2: { post: 2, dollars: 2, winner: 5 } }));
    at(sc, 'None', 92);
    at(sc, '0', 80);
    at(sc, '2 of 8', 68);
  });

  it('a day cut short (test rules: a $3 start, one losing $2 bet): only races run count, with no mention of the races missed', () => {
    const rules = { ...ctx.rules, startCents: 300 };
    const c = { ...ctx, rules };
    const day = settled(programOf(1), dayWith(300), { post: 3, dollars: 2 }, 1);
    expect(day.ended).toBe('broke');
    const sc = screenOf(day, c);
    at(sc, '$3.00', 32);
    at(sc, '$1.00', 44);
    at(sc, '-$2.00', 56);
    expect(at(sc, '-$2.00', 56).color).toBe('Red');
    at(sc, '1 of 1', 68);
    at(sc, '0', 80);
    at(sc, 'None', 92);
    expect(sc.texts.filter((t) => /^Race \d+$/.test(t.text)).map((t) => t.text)).toEqual(['Race 1']);
    expect(sc.texts.some((t) => /tapped|broke|out of/i.test(t.text))).toBe(false);
    expect(sc.aria).not.toMatch(/tapped|broke/i);
  });

  it('a day cut short after a win: Even or up, never the missed races', () => {
    const c = { ...ctx, rules: { ...ctx.rules, startCents: 300 } };
    const day = settled(programOf(2), { ...dayWith(300), nextRace: 2 }, { post: 3, dollars: 2 }, 3);
    const h = byHand({ ...day, ended: 'broke' }, 300);
    const sc = screenOf({ ...day, ended: 'broke' }, c);
    at(sc, '1 of 1', 68);
    at(sc, fmt(h.end), 44);
    expect(sc.texts.filter((t) => /^Race \d+$/.test(t.text)).map((t) => t.text)).toEqual(['Race 2']);
  });
});

describe('BE2: the title and the day\'s line, for each row of the outcome table', () => {
  const upDay = dayOf({ 2: { post: 3, dollars: 2, winner: 3 } });
  const downDay = dayOf({ 1: { post: 3, dollars: 2, winner: 4 } });
  // exactly even: one $2 ticket loses and one wins back exactly its stake and $2 (a return of $4 against a $2 stake),
  // with the record's own bank at the start (the figures are the record's, so it is consistent).
  const evenDay = (() => {
    const base = dayOf({ 1: { post: 3, dollars: 2, winner: 4 }, 2: { post: 3, dollars: 2, winner: 3 } });
    const records = base.records.map((r, i) => (i === 1 ? { ...r, returnCents: 400, ticket: { ...r.ticket!, paysCents: 400 } } : r));
    return { ...base, records, bankrollCents: 10000 };
  })();
  const noneDay = dayOf({});

  it.each([
    ['ended up', upDay, 'Up on the day. Nicely read.'],
    ['ended even', evenDay, 'Square on the day. Not bad.'],
    ['ended down', downDay, 'The horses had other ideas.'],
    ['bet nothing all day', noneDay, 'Watched all eight for free.'],
  ] as const)('%s: the title is "That\'s the card" in Maroon at x8 y4, the line is at y112 in Ink', (_name, day, line) => {
    const s = screenOf(day);
    expect(at(s, "That's the card", 4)).toMatchObject({ x: 8, color: 'Maroon' });
    expect(at(s, line, 112)).toMatchObject({ x: 8, color: 'Ink' });
    expect(textsAt(s, 112)).toHaveLength(1);
    expect(s.aria).toContain(line.replace(/\.$/, ''));
  });

  it('exactly even with a bet is "Even" in Ink and the square line, not the "bet nothing" line', () => {
    expect(byHand(evenDay, 10000).change).toBe(0);
    const s = screenOf(evenDay);
    at(s, 'Even', 56);
    expect(s.texts.map((t) => t.text)).not.toContain('Watched all eight for free.');
  });

  it('there is no "Tapped out" title or line, and the title is never Red, for any outcome', () => {
    for (const d of [upDay, evenDay, downDay, noneDay]) {
      const s = screenOf(d);
      expect(s.texts.some((t) => /tapped/i.test(t.text))).toBe(false);
      expect(s.texts.filter((t) => t.y === 4 && t.text.length > 6).every((t) => t.color === 'Maroon')).toBe(true);
    }
  });

  it('a pass day with a bankroll that happens not to move is still the "bet nothing" line, not the even line', () => {
    expect(textsAt(screenOf(noneDay), 112)[0].text).toBe('Watched all eight for free.');
  });
});

describe('the page\'s layout (wireframe and DESIGN)', () => {
  const day = dayOf(SCRIPT);
  const s = screenOf(day);

  it('the track name is Ink at x8, y14, and the day pair is right-aligned to x247 on the title\'s line: "Day" main, the seed small', () => {
    expect(at(s, TRACK, 14)).toMatchObject({ x: 8, color: 'Ink' });
    const num = s.texts.find((t) => t.text === `#${DAY_SEED}`)!;
    expect(num.small).toBe(true);
    expect(num.x + 4 * num.text.length - 1).toBe(247);
    expect(num.color).toBe('Ink');
    const label = s.texts.find((t) => t.text === 'Day')!;
    expect(label.color).toBe('Ink');
    expect(label.y).toBe(4);
    expect(label.small).toBeUndefined();
    expect(label.x + 8 * 3).toBeLessThanOrEqual(num.x);
  });

  it('rules are 1 px Ink at x8-247 on y24, y104 and y124', () => {
    const px = paint(s.rects);
    for (const y of [24, 104, 124]) {
      expect(px.get(`8,${y}`)).toBe('Ink');
      expect(px.get(`247,${y}`)).toBe('Ink');
      expect(px.get(`7,${y}`)).toBeUndefined();
      expect(px.get(`248,${y}`)).toBeUndefined();
      expect(px.get(`100,${y - 1}`)).toBeUndefined();
      expect(px.get(`100,${y + 1}`)).toBeUndefined();
    }
  });

  it('"New day" is the one action: the horseshoe at x8, y220 and the label on y220, Ink; its target is x8-247, y216-231', () => {
    expect(s.cursor).toEqual({ x: 8, y: 220 });
    expect(at(s, 'New day', 220).color).toBe('Ink');
    const t = endOfDayPointerTargets(rd);
    expect(t.map((x) => x.id)).toEqual(['newDay']);
    expect(hitTest(t, { x: 8, y: 216 })).toBe('newDay');
    expect(hitTest(t, { x: 247, y: 231 })).toBe('newDay');
    expect(hitTest(t, { x: 7, y: 220 })).toBeNull();
    expect(hitTest(t, { x: 100, y: 215 })).toBeNull();
    expect(hitTest(t, { x: 100, y: 232 })).toBeNull();
  });

  it('the page is on Parchment, and nothing but the title (Maroon), the Change figure and the box numbers is not Ink', () => {
    expect(s.paper).toBe('Parchment');
    const odd = s.texts.filter((t) => t.color !== 'Ink').map((t) => t.text);
    const boxNumbers = s.texts.filter((t) => t.small === true && /^\d$/.test(t.text)).map((t) => t.text);
    expect(odd.filter((t) => !boxNumbers.includes(t)).sort()).toEqual(["That's the card", ...s.texts.filter((t) => t.y === 56 && t.x > 100).map((t) => t.text)].sort());
  });

  it('no sound of loss: a down day has no Red anywhere but the one Change figure', () => {
    const down = screenOf(dayOf({ 1: { post: 2, dollars: 10, winner: 4 } }));
    expect(down.texts.filter((t) => t.color === 'Red').map((t) => t.text)).toEqual(['-$10.00']);
    expect(down.rects.some((r) => r.color === 'Red' && !(r.w === 8 && r.h === 8))).toBe(false);
  });
});

describe('BE1, the day\'s card: one row per race run with the right box, odds and ticket', () => {
  const day = dayOf(SCRIPT);
  const s = screenOf(day);
  const px = paint(s.rects);

  it('one row per race run, cell tops y128 + 11i, "Race {r}" at x8', () => {
    for (let i = 0; i < 8; i++) expect(at(s, `Race ${i + 1}`, 128 + 11 * i)).toMatchObject({ x: 8, color: 'Ink' });
    expect(s.texts.filter((t) => /^Race \d+$/.test(t.text))).toHaveLength(8);
  });

  it('a bet row: the 10x10 saddlecloth box at x64-73, rows y-1 to y+8, Ink border, the horse\'s cloth; its odds at x80; the ticket right-aligned to x247', () => {
    for (const [i, race] of [[1, 2], [4, 5], [6, 7]] as const) {
      const rec = day.records[race - 1];
      const t = rec.ticket!;
      const y = 128 + 11 * i;
      for (const [x, yy] of [[64, y - 1], [73, y - 1], [64, y + 8], [73, y + 8], [68, y - 1], [64, y + 3]]) expect(px.get(`${x},${yy}`), `race ${race} border ${x},${yy}`).toBe('Ink');
      expect(px.get(`65,${y}`)).toBe(CLOTH_BY_POST[t.post].fill);
      expect(px.get(`72,${y + 7}`)).toBe(CLOTH_BY_POST[t.post].fill);
      expect(px.get(`63,${y + 3}`)).toBeUndefined();
      expect(px.get(`74,${y + 3}`)).toBeUndefined();
      const num = s.texts.find((x) => x.small === true && x.text === String(t.post) && x.y >= y - 1 && x.y <= y + 8)!;
      expect(num.x).toBeGreaterThanOrEqual(65);
      expect(num.x + 3).toBeLessThanOrEqual(72);
      expect(num.color).toBe(CLOTH_BY_POST[t.post].number);
      expect(at(s, t.odds, y)).toMatchObject({ x: 80, color: 'Ink' });
      expect(t.odds.length).toBeLessThanOrEqual(4);
      const ticket = rec.returnCents > 0 ? `Paid ${fmt(rec.returnCents)}` : `Lost $${t.dollars}`;
      expect(rightEdge(at(s, ticket, y))).toBe(247);
      expect(at(s, ticket, y).color).toBe('Ink');
    }
  });

  it('the paid ticket is the return (stake included) and the lost ticket shows the stake without cents', () => {
    const paid = day.records[1];
    expect(paid.returnCents).toBe(paid.ticket!.paysCents);
    at(s, `Paid ${fmt(paid.returnCents)}`, 128 + 11);
    at(s, 'Lost $10', 128 + 44);
  });

  it('a pass row: no box, no odds, "Passed" at x64 in Ink', () => {
    for (const race of [1, 3, 4, 6, 8]) {
      const y = 128 + 11 * (race - 1);
      expect(at(s, 'Passed', y)).toMatchObject({ x: 64, color: 'Ink' });
      expect(textsAt(s, y).map((t) => t.text).sort()).toEqual(['Passed', `Race ${race}`].sort());
      for (let yy = y - 1; yy <= y + 8; yy++) expect(px.get(`64,${yy}`)).toBeUndefined();
    }
  });

  it('a day of passes lists eight "Passed" rows; a day cut short lists only the races run', () => {
    const passes = screenOf(dayOf({}));
    expect(passes.texts.filter((t) => t.text === 'Passed')).toHaveLength(8);
    const c = { ...ctx, rules: { ...ctx.rules, startCents: 300 } };
    const cut = screenOf(settled(programOf(1), dayWith(300), { post: 3, dollars: 2 }, 1), c);
    expect(cut.texts.filter((t) => /^Race \d+$/.test(t.text))).toHaveLength(1);
    expect(cut.texts.filter((t) => t.y >= 139 && t.y <= 205 && t.text !== 'New day')).toEqual([]);
  });

  it('every race\'s box matches the horse bet on, for every post', () => {
    for (let post = 1; post <= 8; post++) {
      const d = dayOf({ 1: { post, dollars: 2, winner: post === 1 ? 2 : 1 } });
      const sc = screenOf(d);
      expect(paint(sc.rects).get('65,128')).toBe(CLOTH_BY_POST[post].fill);
      expect(sc.texts.some((t) => t.small === true && t.text === String(post) && t.y >= 127 && t.y <= 136)).toBe(true);
      at(sc, d.records[0].ticket!.odds, 128);
    }
  });

  it('the card carries no total, no tick, no band', () => {
    expect(s.texts.filter((t) => t.y >= 128 && t.y <= 205 && /total|profit/i.test(t.text))).toEqual([]);
    expect(s.texts.filter((t) => t.y >= 128 && t.y <= 205 && t.color !== 'Ink' && t.small !== true)).toEqual([]);
  });
});

describe('CV1: the day pair on this page equals the cover\'s for the same day seed', () => {
  it('the same label and the same "#seed" for several seeds', () => {
    for (const seed of [0, 1, DAY_SEED, 99999, 4294967295]) {
      const news = newsFor(book, { daySeed: seed, fields: drawnOf(), stable: ctx.stable, races: ctx.races, cardCopy: rd.copy.card, previous: null });
      const cover = coverFor(book, { daySeed: seed, trackName: TRACK, raceCount: 8, news });
      const day: DayState = { ...dayOf({}), daySeed: seed };
      const s = screenOf(day);
      expect(s.texts.find((t) => t.text === cover.dayLabel && t.y === 4 && !t.small)).toBeDefined();
      const num = s.texts.find((t) => t.small === true && t.y <= 8)!;
      expect(num.text).toBe(cover.dayNumber);
      expect(num.text).toBe(`#${seed}`);
    }
  });
});

describe('the page reads the record and changes nothing', () => {
  it('a frozen day gives the same page twice, the record is untouched, and no stream or Math.random is drawn', () => {
    const rand = vi.spyOn(Math, 'random');
    const day = deepFreeze(dayOf(SCRIPT));
    const before = JSON.stringify(day);
    const a = screenOf(day);
    const b = screenOf(day);
    expect(b).toEqual(a);
    expect(JSON.stringify(day)).toBe(before);
    expect(rand).not.toHaveBeenCalled();
    rand.mockRestore();
  });

  it('the aria text carries the title, the day, the figures and the card, and no estimate or percent', () => {
    const a = screenOf(dayOf(SCRIPT)).aria;
    expect(a).toContain("That's the card");
    expect(a).toContain(`#${DAY_SEED}`);
    expect(a).toContain('Started with $100.00');
    expect(a).toContain('Race 1');
    expect(a).not.toMatch(/%|estimate|chance/i);
  });
});
