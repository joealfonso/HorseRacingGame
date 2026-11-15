import { describe, expect, it, vi } from 'vitest';
import bettingJson from '../data/betting.json';
import hubJson from '../data/hub.json';
import { loadBook } from '../data/bookLoad';
import { drawnDay, programFor } from './day';
import { runEstimate } from './estimate';
import { newsFor, type NewsInput, type NewsItem } from './news';
import { BET_STREAM_NAMES, estimateSeedsOf, raceSeedOf } from './streams';
import { realCtx } from './testkit';

// NU1, NU3 to NU6 and the news half of FL6, from docs/specs/book-useful.md sections 3, 9 and 13
// (they replace NW1 to NW5 of docs/specs/book-and-window.md). Expected values are the spec's: its
// banned lists, its 2 lines of 30, its "no number but race numbers and posts". Nothing here reads
// news.ts's templates back as the answer.
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

const inputFor = (daySeed: number, over: Partial<NewsInput> = {}): NewsInput => ({
  daySeed, fields: drawnDay(ctx, daySeed), stable: ctx.stable, ...over,
});

/** The lines a reader sees for an item: its body lines as printed. */
const text = (i: NewsItem): string => i.body.join(' ');

/** The banned lists: the news list (book-and-window.md section 4), betting.json's and the hub's, and book-useful.md section 2's. */
const BANNED: string[] = [
  'injury', 'injured', 'hurt', 'lame', 'limping', 'fell', 'fall', 'vet', 'scratched', 'ambulance', 'favorite', 'tip', 'pick', 'lock', 'sure thing',
  'due', 'tired', 'tire', 'tires', 'tiring', 'fade', 'fades', 'fresh', 'rested', 'bounce', 'streak', 'in form', 'on form', 'stayer', 'goes long', 'distance',
  'wire to wire', "can't lose", 'guaranteed', 'cinch', 'banker', 'best bet', 'value', 'overlay', 'odds-on', 'percent',
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

describe('NU1: the same inputs give identical news, and the wording draws only from the `news` stream', () => {
  it('the same day seed gives identical news, any number of times', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const a = newsFor(book, inputFor(seed));
      expect(newsFor(book, inputFor(seed))).toEqual(a);
      expect(newsFor(book, inputFor(seed, { stable: structuredClone(ctx.stable) }))).toEqual(a);
    }
  });

  it('`news` is a betting stream name, and the four older names are still there', () => {
    expect(BET_STREAM_NAMES).toContain('news');
    for (const n of ['fieldDraw', 'raceSeed', 'estimateSeeds', 'crowd']) expect(BET_STREAM_NAMES).toContain(n);
  });

  it('making the news creates and draws only the `news` stream, once an item', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const input = inputFor(seed); // the field draw is not the news: not counted
      made.list.length = 0;
      const items = newsFor(book, input);
      expect([...new Set(made.list.map((s) => s.name))]).toEqual(['news']);
      expect(made.list.reduce((n, s) => n + s.draws, 0)).toBe(items.length);
    }
  });

  it('different day seeds do not all give the same page', () => {
    const leads = new Set(SEEDS.map((s) => newsFor(book, inputFor(s)).find((i) => i.lead)!.headline));
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
      for (let i = 0; i < 3; i++) newsFor(book, inputFor(seed));
      expect(snap()).toEqual(before);
    }
  });
});

describe('NU3: the day as a whole, over many real days', () => {
  it('up to five items, in race order, one to a race, the lead is the first taken, none repeated', () => {
    for (const seed of SEEDS) {
      const items = newsFor(book, inputFor(seed));
      expect(items.length).toBeGreaterThan(0);
      expect(items.length).toBeLessThanOrEqual(5);
      expect(items.map((i) => i.slot)).toEqual(items.map((_i, k) => k + 1));
      expect(items.map((i) => i.race)).toEqual([...items.map((i) => i.race)].sort((a, b) => a - b));
      expect(new Set(items.map((i) => i.race)).size).toBe(items.length);
      expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
      expect(items.filter((i) => i.lead)).toHaveLength(1);
      for (const kind of ['K1', 'K2', 'K3', 'K4', 'K5', 'K6']) expect(items.filter((i) => i.kind === kind).length, `${seed} ${kind}`).toBeLessThanOrEqual(2);
    }
  });

  it('every day has five items on the shipped stable (the measurement found none short)', () => {
    for (const seed of SEEDS) expect(newsFor(book, inputFor(seed))).toHaveLength(5);
  });

  it('the lead item is the highest-priority kind present', () => {
    const order = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7'];
    for (const seed of SEEDS) {
      const items = newsFor(book, inputFor(seed));
      const best = Math.min(...items.map((i) => order.indexOf(i.kind)));
      expect(order.indexOf(items.find((i) => i.lead)!.kind)).toBe(best);
    }
  });

  it('a named horse is in its race, at the post the item says', () => {
    for (const seed of SEEDS) {
      const fields = drawnDay(ctx, seed);
      for (const i of newsFor(book, inputFor(seed, { fields }))) {
        expect(fields[i.race - 1].horseIds[i.post - 1]).toBe(i.horseId);
        expect(text(i)).toContain(ctx.stable.find((h) => h.id === i.horseId)!.name);
      }
    }
  });
});

describe('NU4: every fill fits 2 lines of 30, every headline 30, and no banned word', () => {
  it('every pair, filled with every stable horse, every race number, post and count, wraps to at most 2 lines of 30', () => {
    const K = book.news.kinds.value;
    const words = Object.values(book.news.count.value);
    for (const [kind, k] of Object.entries(K)) {
      for (const p of k.pairs) {
        for (const h of ctx.stable) {
          for (const post of [1, 8]) {
            const body = p.body.replace('{name}', h.name).replace('{post}', String(post)).replace('{soft}', '8');
            const lines = wrap30(body);
            expect(lines.length, `${kind} "${body}"`).toBeLessThanOrEqual(2);
            for (const l of lines) expect(l.length).toBeLessThanOrEqual(30);
          }
        }
        for (const w of words) for (const r of [1, 8]) expect(`Race ${r}: ${p.headline.replace('{k}', w)}`.length, `${kind} ${p.headline}`).toBeLessThanOrEqual(30);
      }
    }
  });

  it('over many days: every body is at most 2 lines of 30, every headline starts "Race n: " and is at most 30', () => {
    for (const seed of SEEDS) {
      for (const i of newsFor(book, inputFor(seed))) {
        expect(i.headline).toMatch(/^Race [1-8]: \S/);
        expect(i.headline.length).toBeLessThanOrEqual(30);
        expect(i.body.length).toBeGreaterThan(0);
        expect(i.body.length).toBeLessThanOrEqual(2);
        for (const l of i.body) expect(l.length).toBeLessThanOrEqual(30);
        expect(i.body).toEqual(wrap30(text(i)));
      }
    }
  });

  it('no item, over many days, holds a word from the banned lists (the horse\'s name is the stable\'s, not checked)', () => {
    for (const seed of SEEDS) {
      for (const i of newsFor(book, inputFor(seed))) {
        const name = ctx.stable.find((h) => h.id === i.horseId)!.name;
        expect(bannedHit(`${i.headline} ${text(i)}`.replace(name, 'Name')), `${i.id}`).toBeNull();
      }
    }
  });

  it('the lists are matched as whole words, and the spec\'s two banned phrases and "tip" are really on the list the check uses', () => {
    expect(bannedHit('A hot tip today')).toBe('tip');
    expect(bannedHit('The picket fence')).toBeNull();
    expect(bannedHit('Not a SURE THING')).toBe('sure thing');
    expect(bannedHit('He may tire late')).toBe('tire');
  });
});

describe('NU5 and NU6: the news prints no number but race numbers and posts, and claims no result', () => {
  it('no price, "$", "%" or odds, and no digit but the race number and the post, on any day', () => {
    for (const seed of SEEDS) {
      for (const i of newsFor(book, inputFor(seed))) {
        const name = ctx.stable.find((h) => h.id === i.horseId)!.name;
        const s = `${i.headline} ${text(i)}`.replace(name, 'Name');
        expect(s, i.id).not.toMatch(/\d+-\d+|\$|%/);
        const digits = s.match(/\d+/g) ?? [];
        const allowed = [String(i.race), String(i.post)];
        for (const d of digits) expect(allowed, `${i.id}: "${s}"`).toContain(d);
      }
    }
  });

  it('no word that hints at a result, a second start, a previous result or a front-runner\'s cost', () => {
    const HINTS = /\b(won|win|wins|winner|beat|yesterday|today|second start|twice|ran|tire|tires|tired|fade|fades|fresh|rested|due|form|streak|bounce|stay|stayer|distance|percent|chance|odds|price|favorite|tip|pick|sure)\b/i;
    for (const k of Object.values(book.news.kinds.value)) {
      for (const p of k.pairs) {
        // The easier-crowd pairs say "runs twice" and "Two starts": that is the field's hint, K4's own words (3.2, 3.5).
        const own = `${p.headline} ${p.body}`;
        if (/twice|Two starts/.test(own)) continue;
        expect(own, own).not.toMatch(HINTS);
      }
    }
  });

  it('the news reads no estimate and no price: the module imports neither', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('./news.ts', import.meta.url), 'utf8');
    const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    for (const bad of ['./estimate', './market', './crowd', './payout', './money', './day']) expect(imports).not.toContain(bad);
  });
});
