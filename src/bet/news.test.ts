import { describe, expect, it } from 'vitest';
import raceDayJson from '../data/raceDay.json';
import { loadBook } from '../data/bookLoad';
import type { Race } from '../data/schema';
import { createStream } from '../sim/rng';
import { BET_STREAM_NAMES } from './streams';
import { drawnDay, type DrawnRace } from './day';
import { compareOdds, newsFor, type NewsInput, type PreviousDay } from './news';
import { realCtx } from './testkit';

// NW1, NW2, NW4 and NW5 (docs/specs/book-and-window.md section 14), headless.

const ctx = realCtx();
const book = loadBook();
const cardCopy = raceDayJson.copy.card;

const inputFor = (daySeed: number, previous: PreviousDay | null = null, over: Partial<NewsInput> = {}): NewsInput => ({
  daySeed, fields: drawnDay(ctx, daySeed), stable: ctx.stable, races: ctx.races, cardCopy, previous, ...over,
});
const rec = (race: number, winnerPost: number, winnerOdds: string, fields: readonly DrawnRace[]) => ({ race, horseIds: fields[race - 1].horseIds, winnerPost, winnerOdds });
/** Eight races of five different horses each: no horse runs twice. */
const noDoubleFields = () => Array.from({ length: 8 }, (_v, i) => ({ race: i + 1, horseIds: ctx.stable.slice(i * 5, i * 5 + 5).map((h) => h.id) }));
const nameOf = (id: string) => ctx.stable.find((h) => h.id === id)!.name;

describe('NW1: same inputs, same news; picks draw only from the news stream', () => {
  it('NW1: the same day seed and previous record give identical news', () => {
    const prev: PreviousDay = { records: [rec(1, 3, '9-2', drawnDay(ctx, 6))] };
    for (const seed of [0, 1, 12345, 4294967295]) {
      expect(newsFor(book, inputFor(seed, prev))).toEqual(newsFor(book, inputFor(seed, prev)));
      expect(newsFor(book, inputFor(seed))).toEqual(newsFor(book, inputFor(seed)));
    }
  });

  it('NW1: `news` is a betting stream, added last, and the older four keep their places', () => {
    expect([...BET_STREAM_NAMES]).toEqual(['fieldDraw', 'raceSeed', 'estimateSeeds', 'crowd', 'news']);
  });

  it('NW1: the flavor picks are the shuffle of the pool on createStream(seed, "news", "day"), and nothing else', () => {
    for (const seed of [3, 99, 20261113]) {
      const n = book.news.flavor.value.length;
      const rng = createStream(seed, 'news', 'day');
      const order = Array.from({ length: n }, (_v, i) => i);
      for (let i = n - 1; i > 0; i--) { const j = rng.int(0, i); [order[i], order[j]] = [order[j], order[i]]; }
      const items = newsFor(book, inputFor(seed));
      // Slot 3 is a fact here (horses run twice) and there is no previous day: slots 1 and 4 take the first two of the order, then slot 5's fallback the third.
      expect(items[0].id).toBe(`flavor:${order[0]}`);
      expect(items[3].id).toBe(`flavor:${order[1]}`);
      expect(items[4].id).toBe(`flavor:${order[2]}`);
    }
  });

  it('NW1: the news changes with the day seed (it is not one fixed page)', () => {
    const lead = new Set(Array.from({ length: 40 }, (_v, s) => newsFor(book, inputFor(s))[0].headline));
    expect(lead.size).toBeGreaterThan(5);
  });
});

describe('NW2: facts are true', () => {
  it('NW2: today\'s card matches day.json', () => {
    const item = newsFor(book, inputFor(7))[1];
    expect(item).toMatchObject({ slot: 2, id: 'fact:card', kind: 'fact', headline: "Today's card" });
    expect(item.body).toEqual(['8 races, all 1 1/4 miles on', 'fast dirt.']);
  });

  it('NW2: when the races differ, the card says how many and what is first up', () => {
    const races: Race[] = ctx.races.map((r, i) => (i === 2 ? { ...r, distanceFurlongs: 8 } : r));
    expect(newsFor(book, inputFor(7, null, { races }))[1].body).toEqual(['8 races today. First up: the', `${races[0].name}.`]);
    const mud: Race[] = ctx.races.map((r, i) => (i === 5 ? { ...r, going: 'muddy' } : r));
    expect(newsFor(book, inputFor(7, null, { races: mud }))[1].body.join(' ')).toContain('First up');
    const turf: Race[] = ctx.races.map((r) => ({ ...r, distanceFurlongs: 8, surface: 'turf' as const, going: 'firm' as const }));
    expect(newsFor(book, inputFor(7, null, { races: turf }))[1].body).toEqual(['8 races, all 1 mile on firm', 'turf.']);
  });

  it('NW2: two starts names the two horses whose first start is earliest, with both race numbers', () => {
    for (const seed of [1, 2, 3, 42, 12345, 20261113]) {
      const fields = drawnDay(ctx, seed);
      const starts = new Map<string, number[]>();
      fields.forEach((f) => f.horseIds.forEach((id) => starts.set(id, [...(starts.get(id) ?? []), f.race])));
      const twice = [...starts.entries()].filter(([, r]) => r.length === 2).sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1]);
      const item = newsFor(book, inputFor(seed))[2];
      expect(item.id).toBe('fact:double');
      expect(item.headline).toBe('Running in two races today');
      expect(item.body).toHaveLength(2);
      const picked = item.body.map((line) => {
        const m = /^(.*), races (\d+), (\d+)$/.exec(line)!;
        return { name: m[1], a: Number(m[2]), b: Number(m[3]) };
      });
      // The earliest first start among all horses with two starts.
      const earliest = twice[0][1][0];
      expect(Math.min(...picked.map((p) => p.a))).toBe(earliest);
      // No horse with two starts has a first start earlier than the second pick's.
      const second = Math.max(...picked.map((p) => p.a));
      expect(twice.filter(([, r]) => r[0] < second).length).toBeLessThanOrEqual(2);
      for (const p of picked) {
        const id = [...starts.entries()].find(([hid]) => nameOf(hid) === p.name)![0];
        expect(starts.get(id)).toEqual([p.a, p.b]);
      }
    }
  });

  it('NW2: ties on the first start go to the earlier second start, then the lower post', () => {
    const horses = ctx.stable.slice(0, 6).map((h) => h.id);
    // Race 1: A B C. Race 2: D. Races 3 and 4: C then A, B and D rerun later. A's second is 3, B's 5, C's 4.
    const fields = [
      { race: 1, horseIds: [horses[0], horses[1], horses[2]] },
      { race: 2, horseIds: [horses[3]] },
      { race: 3, horseIds: [horses[0]] },
      { race: 4, horseIds: [horses[2]] },
      { race: 5, horseIds: [horses[1], horses[3]] },
    ];
    const item = newsFor(book, inputFor(1, null, { fields }))[2];
    expect(item.body).toEqual([`${nameOf(horses[0])}, races 1, 3`, `${nameOf(horses[2])}, races 1, 4`]);
  });

  it('NW2: with fewer than two horses running twice, slot 3 is flavor', () => {
    const fields = noDoubleFields();
    const item = newsFor(book, inputFor(5, null, { fields }))[2];
    expect(item.kind).toBe('flavor');
  });

  it('NW2: yesterday\'s longest price names that day\'s longest winner, its race and odds from the record', () => {
    const fields = drawnDay(ctx, 8);
    const prev: PreviousDay = { records: [rec(1, 2, '5-2', fields), rec(2, 5, '26-1', fields), rec(3, 1, '9-2', fields), rec(4, 7, '12-1', fields)] };
    const item = newsFor(book, inputFor(9, prev))[4];
    expect(item).toMatchObject({ slot: 5, id: 'fact:longest', kind: 'fact', headline: "Yesterday's longest price" });
    expect(item.body.join(' ')).toBe(`${nameOf(fields[1].horseIds[4])} won race 2 at 26-1.`);
  });

  it('NW2: the longest compares odds as numbers (9-1 is longer than 26-5... and 10-1 is longer than 9-2) and a tie keeps the earlier race', () => {
    expect(compareOdds('10-1', '9-2')).toBeGreaterThan(0);
    expect(compareOdds('9-2', '5-1')).toBeLessThan(0);
    expect(compareOdds('4-1', '8-2')).toBe(0);
    const fields = drawnDay(ctx, 8);
    const prev: PreviousDay = { records: [rec(2, 1, '4-1', fields), rec(5, 3, '4-1', fields), rec(7, 2, '3-1', fields)] };
    expect(newsFor(book, inputFor(9, prev))[4].body.join(' ')).toContain('won race 2 at 4-1');
  });

  it('NW2: the longest price is the longest winner of the day, not only one the player bet on', () => {
    const fields = drawnDay(ctx, 8);
    const prev: PreviousDay = { records: [rec(1, 1, '2-1', fields), rec(2, 2, '3-1', fields)] };
    expect(newsFor(book, inputFor(9, prev))[4].body.join(' ')).toContain('won race 2 at 3-1');
  });

  it('NW2: with no previous day, slot 5 is flavor', () => {
    expect(newsFor(book, inputFor(9, null))[4].kind).toBe('flavor');
    expect(newsFor(book, inputFor(9, { records: [] }))[4].kind).toBe('flavor');
  });

  it('NW2: the previous day changes slot 5 and no other slot\'s text', () => {
    const fields = drawnDay(ctx, 8);
    const prev: PreviousDay = { records: [rec(2, 5, '26-1', fields)] };
    const without = newsFor(book, inputFor(9, null));
    const withPrev = newsFor(book, inputFor(9, prev));
    for (const i of [0, 1, 2, 3]) expect(withPrev[i]).toEqual(without[i]);
    expect(withPrev[4]).not.toEqual(without[4]);
  });

  it('NW2: a fact being absent does not change the flavor in the other slots', () => {
    const noDouble = noDoubleFields();
    const a = newsFor(book, inputFor(5));
    const b = newsFor(book, inputFor(5, null, { fields: noDouble }));
    expect(b[0]).toEqual(a[0]);
    expect(b[3]).toEqual(a[3]);
  });
});

describe('NW4: five items every day, none repeated, fallbacks as in section 4', () => {
  const seeds = Array.from({ length: 120 }, (_v, s) => s * 37);
  const fields = drawnDay(ctx, 8);
  const prevs: (PreviousDay | null)[] = [null, { records: [rec(2, 5, '26-1', fields)] }];

  it('NW4: five items, slots 1 to 5, no repeated id or headline, bodies within 2 lines of 30', () => {
    for (const seed of seeds) for (const prev of prevs) {
      const items = newsFor(book, inputFor(seed, prev));
      expect(items.map((i) => i.slot)).toEqual([1, 2, 3, 4, 5]);
      expect(new Set(items.map((i) => i.id)).size).toBe(5);
      expect(new Set(items.map((i) => i.headline)).size).toBe(5);
      for (const i of items) {
        expect(i.headline.length).toBeLessThanOrEqual(30);
        expect(i.body.length).toBeGreaterThanOrEqual(1);
        expect(i.body.length).toBeLessThanOrEqual(2);
        for (const l of i.body) expect(l.length).toBeLessThanOrEqual(30);
      }
      expect(items[0].kind).toBe('flavor');
      expect(items[1].id).toBe('fact:card');
      expect(items[3].kind).toBe('flavor');
    }
  });

  it('NW4: the worst case, all four flavor slots, still gives five distinct items from the pool', () => {
    const noDouble = noDoubleFields();
    for (const seed of seeds) {
      const items = newsFor(book, inputFor(seed, null, { fields: noDouble }));
      expect(items.filter((i) => i.kind === 'flavor')).toHaveLength(4);
      expect(new Set(items.map((i) => i.id)).size).toBe(5);
    }
  });

  it('NW4: every flavor item gets its turn as the lead over many days', () => {
    const leads = new Set(seeds.map((s) => newsFor(book, inputFor(s))[0].id));
    expect(leads.size).toBe(book.news.flavor.value.length);
  });
});

describe('NW5: the news never shows the estimate, a price for today, or a stat ranking', () => {
  it('NW5: with no previous day, no item prints a price, a "$", or a stat word', () => {
    for (let seed = 0; seed < 60; seed++) {
      const text = newsFor(book, inputFor(seed)).flatMap((i) => [i.headline, ...i.body]).join(' ');
      expect(text, `seed ${seed}`).not.toMatch(/\d+-\d+/);
      expect(text).not.toContain('$');
      expect(text).not.toMatch(/speed|stamina|kick|estimate|odds|chance|favorite|best|fastest/i);
    }
  });

  it('NW5: flavor never names a horse', () => {
    const names = ctx.stable.map((h) => h.name.toLowerCase());
    for (const f of book.news.flavor.value) for (const n of names) expect(`${f.headline} ${f.body}`.toLowerCase(), n).not.toContain(n);
  });

  it('NW5: the only price in the news is the previous day\'s, from its record', () => {
    const fields = drawnDay(ctx, 8);
    const items = newsFor(book, inputFor(9, { records: [rec(2, 5, '26-1', fields)] }));
    const priced = items.filter((i) => /\d+-\d+/.test(i.body.join(' ')));
    expect(priced.map((i) => i.id)).toEqual(['fact:longest']);
  });
});
