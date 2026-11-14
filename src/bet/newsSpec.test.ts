import { describe, expect, it, vi } from 'vitest';
import bettingJson from '../data/betting.json';
import hubJson from '../data/hub.json';
import raceDayJson from '../data/raceDay.json';
import { loadBook } from '../data/bookLoad';
import { drawnDay, programFor } from './day';
import { runEstimate } from './estimate';
import { newsFor, type NewsInput, type NewsItem } from './news';
import { BET_STREAM_NAMES, estimateSeedsOf, raceSeedOf } from './streams';
import { realCtx } from './testkit';

// NW1 to NW5 (and the news half of FL6) from docs/specs/book-and-window.md sections 4, 9, 14
// and 18. Expected values are the spec's: its sample card line, its two-starts format, its
// banned list, its 2 lines of 30. Nothing here reads news.ts's templates back as the answer.
//
// Every stream the code creates is recorded (and its draws counted) by wrapping createStream,
// which is how "picks draw only from the `news` stream" is asserted directly.

const made = vi.hoisted(() => ({ list: [] as { name: string; sub: string | undefined; draws: number }[] }));
vi.mock('../sim/rng', async (orig) => {
  const real = await orig<typeof import('../sim/rng')>();
  return {
    ...real,
    createStream: (seed: number, name: string, sub?: string) => {
      const s = real.createStream(seed, name, sub);
      const rec = { name, sub, draws: 0 };
      made.list.push(rec);
      return { float: () => { rec.draws++; return s.float(); }, int: (a: number, b: number) => { rec.draws++; return s.int(a, b); } };
    },
  };
});

const ctx = realCtx();
const book = loadBook();
const card = raceDayJson.copy.card;
const nameOf = (id: string): string => ctx.stable.find((h) => h.id === id)!.name;

const inputFor = (daySeed: number, over: Partial<NewsInput> = {}): NewsInput => ({
  daySeed, fields: drawnDay(ctx, daySeed), stable: ctx.stable, races: ctx.races, cardCopy: card, previous: null, ...over,
});

/** A previous day: one record per entry, the winner at the post given, with that day's odds. */
const day = (rows: { race: number; ids?: string[]; post: number; odds: string }[]) => ({
  records: rows.map((r) => ({ race: r.race, horseIds: r.ids ?? ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08'], winnerPost: r.post, winnerOdds: r.odds })),
});

/** The lines a reader sees for an item: its body lines as printed. */
const text = (i: NewsItem): string => i.body.join(' ');

/** The spec's banned lists (section 4, "News rules the loader checks") plus the betting and hub lists. */
const BANNED: string[] = [
  'injury', 'injured', 'hurt', 'lame', 'limping', 'fell', 'fall', 'vet', 'scratched', 'ambulance', 'favorite', 'tip', 'pick', 'lock', 'sure thing',
  ...bettingJson.copy.bannedWords, ...hubJson.copy.bannedWords,
];
const bannedHit = (s: string): string | null => {
  for (const w of BANNED) if (new RegExp(`(?<![A-Za-z0-9])${w.replace(/ /g, '\\s+')}(?![A-Za-z0-9])`, 'i').test(s)) return w;
  return null;
};

/** The greedy word wrap the spec describes (wrap at word spaces to at most 30). */
const wrap30 = (s: string): string[] => {
  const lines: string[] = [];
  let cur = '';
  for (const w of s.split(' ')) {
    if (cur === '') cur = w;
    else if (cur.length + 1 + w.length <= 30) cur += ` ${w}`;
    else { lines.push(cur); cur = w; }
  }
  return [...lines, cur];
};

const SEEDS = Array.from({ length: 60 }, (_v, i) => 1000 + i * 7919);

describe('NW1: the same inputs give identical news, and picks draw only from the `news` stream', () => {
  it('the same day seed and previous-day record give identical news, any number of times', () => {
    const prev = day([{ race: 3, post: 2, odds: '12-1' }]);
    for (const seed of SEEDS.slice(0, 20)) {
      const a = newsFor(book, inputFor(seed, { previous: prev }));
      expect(newsFor(book, inputFor(seed, { previous: prev }))).toEqual(a);
      expect(newsFor(book, inputFor(seed, { previous: structuredClone(prev) }))).toEqual(a);
    }
  });

  it('`news` is a betting stream name, and the four older names are still there', () => {
    expect(BET_STREAM_NAMES).toContain('news');
    for (const n of ['fieldDraw', 'raceSeed', 'estimateSeeds', 'crowd']) expect(BET_STREAM_NAMES).toContain(n);
  });

  it('making the news creates and draws only the `news` stream, and draws it (flavor is picked)', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const input = inputFor(seed, { previous: day([{ race: 1, post: 1, odds: '5-1' }]) }); // the field draw is not the news: not counted
      made.list.length = 0;
      newsFor(book, input);
      expect(made.list.length).toBeGreaterThan(0);
      expect([...new Set(made.list.map((s) => s.name))]).toEqual(['news']);
      expect(made.list.reduce((n, s) => n + s.draws, 0)).toBeGreaterThan(0);
    }
  });

  it('facts are computed, not drawn: with the previous day present or absent, the flavor in the other slots is the same', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const without = newsFor(book, inputFor(seed));
      const withPrev = newsFor(book, inputFor(seed, { previous: day([{ race: 2, post: 4, odds: '20-1' }]) }));
      expect(withPrev[0]).toEqual(without[0]);
      expect(withPrev[1]).toEqual(without[1]);
      expect(withPrev[3]).toEqual(without[3]);
    }
  });

  it('the news does not depend on the drawn fields beyond the two-starts fact: the lead and slot 4 flavor follow the day seed alone', () => {
    const a = newsFor(book, inputFor(77, { fields: drawnDay(ctx, 77) }));
    const b = newsFor(book, inputFor(77, { fields: drawnDay(ctx, 78) }));
    expect(b[0]).toEqual(a[0]);
    expect(b[3]).toEqual(a[3]);
  });

  it('different day seeds do not all give the same page (it is a pick, not one fixed page)', () => {
    const leads = new Set(SEEDS.map((s) => newsFor(book, inputFor(s))[0].headline));
    expect(leads.size).toBeGreaterThan(3);
  });

  it('golden: race 1\'s field, race seed, first 5 estimate seeds and crowd dollars are the same before and after the news is made', () => {
    for (const seed of [12345, 20261113, 0, 4294967295, 99]) {
      const snap = () => {
        const r1 = drawnDay(ctx, seed)[0];
        return {
          ids: r1.horseIds, raceSeed: r1.raceSeed, again: raceSeedOf(seed, 1), seeds: estimateSeedsOf(seed, 1, 5),
          crowd: programFor(ctx, r1, runEstimate(r1.input, seed, 1, 8)).crowdDollars,
        };
      };
      const before = snap();
      for (let i = 0; i < 3; i++) newsFor(book, inputFor(seed, { previous: day([{ race: 1, post: 1, odds: '9-1' }]) }));
      expect(snap()).toEqual(before);
    }
  });
});

describe('NW2: facts are true', () => {
  it('Today\'s card is slot 2 and reads as the spec\'s sample against day.json: 8 races, all 1 1/4 miles on fast dirt', () => {
    const item = newsFor(book, inputFor(5))[1];
    expect(item.headline).toBe("Today's card");
    expect(item.body).toEqual(['8 races, all 1 1/4 miles on', 'fast dirt.']);
  });

  it('when the races differ in surface, the card says how many and what is first up, and does not say "all"', () => {
    const races = ctx.races.map((r, i) => (i === 4 ? { ...r, surface: 'turf' as const } : r));
    const item = newsFor(book, inputFor(5, { races }))[1];
    expect(text(item)).toBe(`8 races today. First up: the ${ctx.races[0].name}.`);
    expect(item.kind).toBe('fact');
  });

  it('when the races differ in distance, the same', () => {
    const races = ctx.races.map((r, i) => (i === 7 ? { ...r, distanceFurlongs: 8 } : r));
    expect(text(newsFor(book, inputFor(5, { races }))[1])).toBe(`8 races today. First up: the ${ctx.races[0].name}.`);
  });

  it('the card never says "fast" when one race has another going', () => {
    const races = ctx.races.map((r, i) => (i === 2 ? { ...r, going: 'sloppy' as never } : r));
    expect(text(newsFor(book, inputFor(5, { races }))[1])).not.toMatch(/\ball\b.*\bfast\b/);
  });

  it('Running in two races: the two horses with two starts whose first start is earliest, each with both race numbers, one per line', () => {
    const fields = [
      { race: 1, horseIds: ['s20', 's21'] },
      { race: 2, horseIds: ['s01', 's22'] },
      { race: 3, horseIds: ['s01', 's09', 's23'] },
      { race: 4, horseIds: ['s09', 's24'] },
      { race: 5, horseIds: ['s02', 's25'] },
      { race: 6, horseIds: ['s02', 's26'] },
    ];
    const item = newsFor(book, inputFor(9, { fields }))[2];
    expect(item.headline).toBe('Running in two races today');
    expect(item.kind).toBe('fact');
    expect(item.body).toEqual([`${nameOf('s01')}, races 2, 3`, `${nameOf('s09')}, races 3, 4`]);
  });

  it('with two horses tied on the earliest first start, both are the two named', () => {
    const fields = [
      { race: 1, horseIds: ['s01', 's02', 's20'] },
      { race: 2, horseIds: ['s02', 's21'] },
      { race: 3, horseIds: ['s01', 's22'] },
      { race: 4, horseIds: ['s09', 's23'] },
      { race: 5, horseIds: ['s09', 's24'] },
    ];
    const item = newsFor(book, inputFor(9, { fields }))[2];
    expect([...item.body].sort()).toEqual([`${nameOf('s01')}, races 1, 3`, `${nameOf('s02')}, races 1, 2`].sort());
  });

  it('over many real days, the two named have the two earliest first starts among the horses that run twice, and their race numbers are real', () => {
    let doubles = 0;
    for (const seed of SEEDS) {
      const fields = drawnDay(ctx, seed);
      const runs = new Map<string, number[]>();
      for (const f of fields) for (const id of f.horseIds) runs.set(id, [...(runs.get(id) ?? []), f.race]);
      const twice = [...runs.entries()].filter(([, r]) => r.length === 2).map(([id, r]) => ({ id, r }));
      const item = newsFor(book, inputFor(seed))[2];
      if (twice.length < 2) { expect(item.kind).toBe('flavor'); continue; }
      doubles++;
      expect(item.kind).toBe('fact');
      const firsts = twice.map((t) => t.r[0]).sort((a, b) => a - b);
      const named = item.body.map((line) => {
        const m = /^(.*), races (\d+), (\d+)$/.exec(line)!;
        return { id: ctx.stable.find((h) => h.name === m[1])!.id, a: Number(m[2]), b: Number(m[3]) };
      });
      expect(named).toHaveLength(2);
      for (const n of named) expect(runs.get(n.id)).toEqual([n.a, n.b]);
      expect(named.map((n) => n.a).sort((a, b) => a - b)).toEqual(firsts.slice(0, 2));
    }
    expect(doubles).toBeGreaterThan(30);
  });

  it('with fewer than two horses running twice, slot 3 is flavor, and so is it with none', () => {
    const one = [{ race: 1, horseIds: ['s01', 's02'] }, { race: 2, horseIds: ['s01', 's03'] }, { race: 3, horseIds: ['s04'] }];
    const none = [{ race: 1, horseIds: ['s01', 's02'] }, { race: 2, horseIds: ['s03', 's04'] }];
    for (const fields of [one, none]) {
      const item = newsFor(book, inputFor(9, { fields }))[2];
      expect(item.kind).toBe('flavor');
      expect(item.headline).not.toBe('Running in two races today');
    }
  });

  it('Yesterday\'s longest price names the winner at the longest odds, with its race and odds from that day\'s record', () => {
    const prev = day([
      { race: 1, post: 2, odds: '5-2' },
      { race: 4, ids: ['s10', 's11', 's12', 's13', 's14', 's15', 's16', 's17'], post: 3, odds: '26-1' },
      { race: 6, post: 1, odds: '9-2' },
      { race: 8, post: 8, odds: '3-1' },
    ]);
    const item = newsFor(book, inputFor(3, { previous: prev }))[4];
    expect(item.kind).toBe('fact');
    expect(item.headline).toBe("Yesterday's longest price");
    expect(text(item)).toBe(`${nameOf('s12')} won race 4 at 26-1.`);
  });

  it('odds are compared as prices, not as text: 10-1 is longer than 9-1, 5-1 is longer than 9-2, 1-9 is the shortest', () => {
    const longest = (rows: { race: number; post: number; odds: string }[]) => text(newsFor(book, inputFor(3, { previous: day(rows) }))[4]);
    expect(longest([{ race: 2, post: 1, odds: '9-1' }, { race: 5, post: 2, odds: '10-1' }])).toContain('won race 5 at 10-1');
    expect(longest([{ race: 2, post: 1, odds: '9-2' }, { race: 5, post: 2, odds: '5-1' }])).toContain('won race 5 at 5-1');
    expect(longest([{ race: 2, post: 1, odds: '9-5' }, { race: 5, post: 2, odds: '1-9' }, { race: 7, post: 3, odds: '3-5' }])).toContain('won race 2 at 9-5');
    expect(longest([{ race: 2, post: 1, odds: '1-9' }, { race: 5, post: 2, odds: '1-5' }])).toContain('won race 5 at 1-5');
  });

  it('it is the day\'s longest winner, not only one the player bet on, and a different previous day gives a different line', () => {
    const a = text(newsFor(book, inputFor(3, { previous: day([{ race: 1, post: 1, odds: '4-1' }]) }))[4]);
    const b = text(newsFor(book, inputFor(3, { previous: day([{ race: 2, post: 5, odds: '31-1' }]) }))[4]);
    expect(a).toBe(`${nameOf('s01')} won race 1 at 4-1.`);
    expect(b).toBe(`${nameOf('s05')} won race 2 at 31-1.`);
  });

  it('with no previous day, slot 5 is a flavor item (no "Yesterday" anywhere on the page)', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const items = newsFor(book, inputFor(seed));
      expect(items[4].kind).toBe('flavor');
      expect(items.some((i) => /yesterday/i.test(i.headline + text(i)))).toBe(false);
    }
  });

  it('with a previous day with no records, slot 5 is flavor, never a made-up winner', () => {
    expect(newsFor(book, inputFor(3, { previous: { records: [] } }))[4].kind).toBe('flavor');
  });
});

describe('NW3: every fill fits 2 lines of 30, every headline 30, and no banned word', () => {
  it('every horse name, odds label and race number through the longest-price line wraps to at most 2 lines of 30', () => {
    const labels = bettingJson.odds.steps.value.map((s) => s.label);
    let worst = 0;
    for (const h of ctx.stable) {
      const prev = (odds: string, race: number) => ({ records: [{ race, horseIds: [h.id], winnerPost: 1, winnerOdds: odds }] });
      for (const odds of [labels[0], labels[20], labels[labels.length - 1], '26-1', '99-1', '9-2']) {
        for (const race of [1, 8]) {
          const item = newsFor(book, inputFor(3, { previous: prev(odds, race) }))[4];
          expect(item.kind).toBe('fact');
          expect(item.body.length, `${h.name} ${odds}`).toBeLessThanOrEqual(2);
          for (const l of item.body) { expect(l.length).toBeLessThanOrEqual(30); worst = Math.max(worst, l.length); }
          expect(item.body).toEqual(wrap30(text(item)));
        }
      }
    }
    expect(worst).toBeGreaterThan(20); // the check had something long to chew on
  });

  it('the two-starts lines, filled with every stable horse and race numbers up to 8, are one line of at most 30 each', () => {
    for (const h of ctx.stable) {
      for (const [a, b] of [[1, 2], [7, 8], [2, 6]]) {
        const fields = [
          ...Array.from({ length: 8 }, (_v, i) => ({ race: i + 1, horseIds: [i + 1 === a || i + 1 === b ? h.id : 's39', `x${i}`] })),
        ];
        // two horses needed: give a second one the same two races
        const other = ctx.stable.find((o) => o.id !== h.id && o.id !== 's39')!.id;
        const f2 = fields.map((f) => (f.race === a || f.race === b ? { ...f, horseIds: [...f.horseIds, other] } : f));
        const item = newsFor(book, inputFor(3, { fields: f2 }))[2];
        if (item.kind !== 'fact') continue;
        expect(item.body).toHaveLength(2);
        for (const l of item.body) expect(l.length, l).toBeLessThanOrEqual(30);
      }
    }
  });

  it('over many days, with and without a previous day: every body is at most 2 lines of 30, every headline at most 30, nothing empty', () => {
    for (const seed of SEEDS) {
      const prev = day([{ race: 1 + (seed % 8), ids: drawnDay(ctx, seed)[seed % 8].horseIds, post: 1 + (seed % 8), odds: '26-1' }]);
      for (const previous of [null, prev]) {
        for (const i of newsFor(book, inputFor(seed, { previous }))) {
          expect(i.headline.length).toBeGreaterThan(0);
          expect(i.headline.length).toBeLessThanOrEqual(30);
          expect(i.body.length).toBeGreaterThan(0);
          expect(i.body.length).toBeLessThanOrEqual(2);
          for (const l of i.body) expect(l.length).toBeLessThanOrEqual(30);
        }
      }
    }
  });

  it('no item, over many days and every stable horse as yesterday\'s winner, holds a word from the banned lists', () => {
    for (const seed of SEEDS) {
      for (const i of newsFor(book, inputFor(seed))) expect(bannedHit(`${i.headline} ${text(i)}`), `${i.id}`).toBeNull();
    }
    for (const h of ctx.stable) {
      const items = newsFor(book, inputFor(4, { previous: { records: [{ race: 3, horseIds: [h.id], winnerPost: 1, winnerOdds: '17-1' }] } }));
      for (const i of items) expect(bannedHit(`${i.headline} ${text(i)}`), `${h.name}: ${i.id}`).toBeNull();
    }
  });

  it('the lists are matched as whole words, and the spec\'s two banned phrases and "tip" are really on the list the check uses', () => {
    expect(bannedHit('A hot tip today')).toBe('tip');
    expect(bannedHit('The picket fence')).toBeNull();
    expect(bannedHit('Not a SURE THING')).toBe('sure thing');
  });
});

describe('NW4: five items every day, none repeated, with the fallbacks of section 4', () => {
  it('five items, slots 1 to 5 in order, over many days and each kind of previous day', () => {
    const previous = [null, day([{ race: 2, post: 2, odds: '7-1' }]), { records: [] }];
    for (const seed of SEEDS) {
      for (const p of previous) {
        const items = newsFor(book, inputFor(seed, { previous: p }));
        expect(items.map((i) => i.slot)).toEqual([1, 2, 3, 4, 5]);
        expect(new Set(items.map((i) => i.id)).size).toBe(5);
        expect(new Set(items.map((i) => i.headline)).size).toBe(5);
        expect(new Set(items.map((i) => text(i))).size).toBe(5);
      }
    }
  });

  it('slot 1 is flavor (its headline is the cover line), slot 2 is the card, slot 4 is flavor', () => {
    for (const seed of SEEDS) {
      const items = newsFor(book, inputFor(seed, { previous: day([{ race: 1, post: 1, odds: '8-1' }]) }));
      expect(items[0].kind).toBe('flavor');
      expect(items[1].kind).toBe('fact');
      expect(items[1].headline).toBe("Today's card");
      expect(items[3].kind).toBe('flavor');
    }
  });

  it('the worst case (no doubles, no previous day) still prints five distinct items: slots 1, 3, 4 and 5 are all flavor', () => {
    const noDoubles = [{ race: 1, horseIds: ['s01'] }, { race: 2, horseIds: ['s02'] }];
    for (const seed of SEEDS.slice(0, 30)) {
      const items = newsFor(book, inputFor(seed, { fields: noDoubles }));
      expect(items.map((i) => i.kind)).toEqual(['flavor', 'fact', 'flavor', 'flavor', 'flavor']);
      expect(new Set(items.map((i) => i.id)).size).toBe(5);
    }
  });

  it('a fact appears when it is true and a flavor item otherwise, in the same slot', () => {
    const items = newsFor(book, inputFor(3, { previous: day([{ race: 1, post: 1, odds: '8-1' }]) }));
    expect(items[2].headline === 'Running in two races today' || items[2].kind === 'flavor').toBe(true);
    expect(items[4].headline).toBe("Yesterday's longest price");
  });
});

describe('NW5: the news never shows the estimate, a price for today, or a stat ranking', () => {
  const STAT_WORDS = /\b(speed|stamina|kick|fastest|slowest|strongest|best|worst|rank|ranked|ranking|leader|leaders|top|most|highest|lowest|odds-on|chance|chances|percent|likely|expect|expected|should win|to win)\b/i;

  it('with no previous day, no item prints a price, a "$", a percent, a stat word or a ranking word', () => {
    for (const seed of SEEDS) {
      for (const i of newsFor(book, inputFor(seed))) {
        const s = `${i.headline} ${text(i)}`;
        expect(s, i.id).not.toMatch(/\d+-\d+/);
        expect(s, i.id).not.toMatch(/\$|%/);
        expect(s, i.id).not.toMatch(STAT_WORDS);
      }
    }
  });

  it('the only price anywhere is yesterday\'s, from its record, and none of today\'s prices appears', () => {
    const seed = 321;
    const r1 = drawnDay(ctx, seed)[0];
    const program = programFor(ctx, r1, runEstimate(r1.input, seed, 1, 8));
    const items = newsFor(book, inputFor(seed, { previous: day([{ race: 4, post: 2, odds: '26-1' }]) }));
    const prices = items.flatMap((i) => `${i.headline} ${text(i)}`.match(/\d+-\d+/g) ?? []);
    expect(prices).toEqual(['26-1']);
    // today's crowd money is not in it either
    for (const d of program.crowdDollars) expect(items.map(text).join(' ')).not.toContain(`$${d}`);
  });

  it('flavor items name no horse, no post, no race number and no price (they cannot be wrong about the game)', () => {
    const names = ctx.stable.map((h) => h.name);
    for (const seed of SEEDS) {
      for (const i of newsFor(book, inputFor(seed)).filter((x) => x.kind === 'flavor')) {
        const s = `${i.headline} ${text(i)}`;
        for (const n of names) expect(s).not.toContain(n);
        expect(s).not.toMatch(/\brace\s*\d|\bpost\s*\d|#\d|\d+-\d+|\$/i);
      }
    }
  });

  it('facts never rate a horse: the two-starts and longest-price lines are only names, race numbers and the odds', () => {
    for (const seed of SEEDS) {
      const items = newsFor(book, inputFor(seed, { previous: day([{ race: 1, post: 1, odds: '12-1' }]) }));
      for (const i of items.filter((x) => x.id.startsWith('fact:') && x.slot !== 2)) {
        const s = text(i);
        expect(s.replace(/[A-Za-z' ]+/g, '').replace(/[,.\d-]/g, '')).toBe('');
        expect(s).not.toMatch(STAT_WORDS);
      }
    }
  });
});
