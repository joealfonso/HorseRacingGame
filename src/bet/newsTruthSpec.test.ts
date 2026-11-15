import { afterEach, describe, expect, it, vi } from 'vitest';
import bettingJson from '../data/betting.json';
import bookJson from '../data/book.json';
import hubJson from '../data/hub.json';
import stableJson from '../data/stable.json';
import { loadBook } from '../data/bookLoad';
import { coverFor } from './bookPage';
import { drawnDay, programFor } from './day';
import { runEstimate } from './estimate';
import { newsFor, type NewsInput, type NewsItem } from './news';
import { estimateSeedsOf, raceSeedOf } from './streams';
import { realCtx } from './testkit';

// The news as true hints, written from docs/specs/book-useful.md (sections 2, 3.1 to 3.5, 9) and
// its section 13, which wins over 3 and 4: K3 at five front-runners or more, K6 inside dropped, K6
// wide kept, K7 rare. Everything here is recomputed from my own fixtures or from stable.json; no
// helper of news.ts is reused. A hint that is false is the worst bug this feature can have, so the
// claims are checked from the stats, the styles and the posts, not from the code's own terms.

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
afterEach(() => { vi.doUnmock('./estimate'); vi.doUnmock('./market'); vi.doUnmock('./day'); });

const ctx = realCtx();
const book = loadBook();

// ------------------------------------------------------------------ my own world builder
type Style = 'frontRunner' | 'stalker' | 'closer';
const F: Style = 'frontRunner';
const S: Style = 'stalker';
const C: Style = 'closer';
interface Slot { style: Style; total: number; id?: string }

/** Three stats that add up to `total` (the news reads only their sum). */
const stats = (t: number) => { const speed = Math.ceil(t / 3); const stamina = Math.floor(t / 3); return { speed, stamina, kick: t - speed - stamina }; };

/** Races of hand-chosen fields: each is a list of horses by post. A horse with an `id` in two fields is one horse. */
function world(races: Slot[][]) {
  const horses = new Map<string, { id: string; name: string; style: Style; stats: { speed: number; stamina: number; kick: number } }>();
  const fields = races.map((slots, r) => ({
    race: r + 1,
    horseIds: slots.map((s, p) => {
      const id = s.id ?? `h${r + 1}p${p + 1}`;
      if (!horses.has(id)) horses.set(id, { id, name: `Horse ${id}`, style: s.style, stats: stats(s.total) });
      return id;
    }),
  }));
  return { fields, stable: [...horses.values()] };
}
const newsOf = (w: ReturnType<typeof world>, daySeed = 1): NewsItem[] => newsFor(book, { daySeed, fields: w.fields, stable: w.stable } as NewsInput);
const field = (totals: number[], styles: Style[]): Slot[] => totals.map((total, i) => ({ total, style: styles[i] }));
const name = (race: number, post: number) => `Horse h${race}p${post}`;

/** Two front-runners in posts 1 and 2, the rest stalkers and closers: no kind but class or the top fires. */
const QUIET: Style[] = [F, F, S, C, S, C, S, C];
const flat = (over: Record<number, number> = {}, base = 200): number[] => Array.from({ length: 8 }, (_v, i) => over[i + 1] ?? base);

/** The one item of a single-race world, or null. */
const only = (races: Slot[][]): NewsItem | null => { const items = newsOf(world(races)); expect(items.length).toBeLessThanOrEqual(1); return items[0] ?? null; };

// ------------------------------------------------------------------ K1, lone speed
describe('K1 lone speed: one front-runner, and its rank at most 4', () => {
  const LADDER = [210, 208, 206, 204, 202, 200, 198]; // posts 1 to 4 and 6 to 8; the front-runner is post 5
  const k1 = (tF: number): Slot[] => {
    const t = [...LADDER.slice(0, 4), tF, ...LADDER.slice(4)];
    return field(t, [S, C, S, C, F, C, S, C]);
  };

  it.each([[212, 1], [209, 2], [207, 3], [205, 4]])('a front-runner of total %i (rank %i) fires K1 and names it, at post 5', (tF) => {
    const item = only([k1(tF)])!;
    expect(item.kind).toBe('K1');
    expect(item.horseId).toBe('h1p5');
    expect(item.post).toBe(5);
    expect(item.race).toBe(1);
    expect(item.headline.startsWith('Race 1: ')).toBe(true);
    expect(item.body.join(' ')).toContain(name(1, 5));
  });

  it('rank 5 does not fire K1, and the horse it would have named is not named by any other kind', () => {
    const item = only([k1(203)])!;
    expect(item.kind).not.toBe('K1');
    expect(item.body.join(' ')).not.toContain(name(1, 5));
    expect(item.horseId).toBe('h1p1'); // the unique top is named by K7 instead
  });

  it('ties share the better rank: a front-runner tied for 4th fires, tied for 5th does not', () => {
    expect(only([k1(204)])!.kind).toBe('K1'); // 204 ties the horse at post 4: three above, rank 4
    expect(only([k1(202)])!.kind).not.toBe('K1'); // 202 ties the horse at post 6: four above, rank 5
  });

  it('two front-runners, or none, never fire K1', () => {
    const two = field([210, 208, 206, 204, 205, 200, 198, 196], [S, C, S, C, F, C, S, F]);
    expect(only([two])?.kind).not.toBe('K1');
    const none = field([210, 208, 206, 204, 205, 200, 198, 196], [S, C, S, C, S, C, S, C]);
    expect(only([none])?.kind).not.toBe('K1');
  });
});

// ------------------------------------------------------------------ K2, class above
describe('K2 class above: a unique top, lead at least 26 (against the mean of all eight, itself included), gap at least 9', () => {
  const k2 = (totals: number[]) => only([field(totals, QUIET)]);

  it('lead exactly 26 and a big gap fires, naming the top horse', () => {
    const item = k2([210, 210, 210, 210, 240, 210, 212, 210])!; // 240 - 1712/8 = 26
    expect(item.kind).toBe('K2');
    expect(item.horseId).toBe('h1p5');
  });

  it('lead 25.875 does not fire K2; the top is still named, by K7', () => {
    const item = k2([210, 210, 210, 210, 240, 210, 213, 210])!; // 240 - 1713/8 = 25.875
    expect(item.kind).toBe('K7');
    expect(item.horseId).toBe('h1p5');
  });

  it('gap exactly 9 fires, gap 8 does not (the lead is high in both)', () => {
    expect(k2([200, 200, 200, 200, 250, 200, 241, 200])!.kind).toBe('K2');
    expect(k2([200, 200, 200, 200, 250, 200, 242, 200])!.kind).toBe('K7');
  });

  it('the lead is against the mean of ALL eight, not of the seven rivals: a top 28 over seven equals scores is only 24.5 over the field', () => {
    const item = k2([200, 200, 200, 200, 228, 200, 200, 200])!;
    expect(item.kind).toBe('K7');
  });

  it('a tie at the top fires neither K2 nor K7: nothing is printed for the race', () => {
    expect(k2([200, 200, 200, 200, 250, 200, 250, 200])).toBeNull();
  });

  it('it names the top horse of the field, whatever its style', () => {
    for (const [post, style] of [[3, S], [4, C], [8, C]] as const) {
      const styles = [...QUIET];
      styles[post - 1] = style;
      const item = only([field(flat({ [post]: 240 }), styles)])!;
      expect(item.kind).toBe('K2');
      expect(item.post).toBe(post);
    }
  });
});

// ------------------------------------------------------------------ K3, crowded lead
describe('K3 crowded lead: five or more front-runners (13.1), the top closer in the first four', () => {
  /** Fronts at posts 1 to 5 with the given totals, then a closer at post 6 and stalkers at 7 and 8. */
  const k3 = (closer: number, frontTotals = [210, 208, 206, 202, 200]): Slot[] =>
    field([...frontTotals, closer, 190, 189], [F, F, F, F, F, C, S, S]);

  it.each([[207, 3], [204, 4]])('a closer of total %i (rank %i) fires K3 and names it', (closer) => {
    const item = only([k3(closer)])!;
    expect(item.kind).toBe('K3');
    expect(item.horseId).toBe('h1p6');
  });

  it('a closer of rank 5 does not fire K3, and one tied for 5th does not either; one tied for 4th does', () => {
    expect(only([k3(201)])!.kind).not.toBe('K3'); // 210, 208, 206, 202 above
    expect(only([k3(200)])!.kind).not.toBe('K3'); // ties the front at 200: four above
    expect(only([k3(202)])!.kind).toBe('K3'); // ties the front at 202: three above, rank 4
  });

  it('four front-runners never fire K3 (13.1), with the same top closer', () => {
    const four = field([210, 208, 206, 202, 207, 204, 190, 189], [F, F, F, F, C, C, S, S]);
    expect(only([four])?.kind).not.toBe('K3');
  });

  it('six and seven front-runners fire K3; the count word in the headline is the true count', () => {
    const six = field([210, 208, 206, 202, 200, 198, 207, 189], [F, F, F, F, F, F, C, S]);
    const seven = field([210, 208, 206, 202, 200, 198, 196, 207], [F, F, F, F, F, F, F, C]);
    const WORD: Record<number, string> = { 5: 'Five', 6: 'Six', 7: 'Seven' };
    for (const [slots, fronts] of [[k3(207), 5], [six, 6], [seven, 7]] as const) {
      const heads = new Set<string>();
      for (let seed = 1; seed <= 60; seed++) {
        const w = world([slots]);
        const item = newsOf(w, seed)[0];
        expect(item.kind, `fronts ${fronts}`).toBe('K3');
        heads.add(item.headline);
        for (const other of Object.values(WORD)) if (other !== WORD[fronts]) expect(item.headline, `fronts ${fronts}`).not.toContain(other);
        expect(item.headline).not.toMatch(/[{}]/);
      }
      expect([...heads].some((h) => h.includes(WORD[fronts]))).toBe(true); // the {k} headline does come up
    }
  });

  it('no closer in the field, no K3: eight front-runners, or five with only stalkers', () => {
    expect(only([field([210, 208, 206, 202, 200, 190, 189, 188], [F, F, F, F, F, S, S, S])])?.kind).not.toBe('K3');
    expect(only([field([210, 208, 206, 202, 200, 190, 189, 188], [F, F, F, F, F, F, F, F])])?.kind).not.toBe('K3');
  });

  it('ties between closers go to the lower post; a higher closer wins whatever its post', () => {
    const tie = field([210, 208, 206, 202, 200, 207, 207, 189], [F, F, F, F, F, C, C, S]);
    expect(only([tie])!.horseId).toBe('h1p6');
    const higher = field([210, 208, 206, 202, 200, 204, 207, 189], [F, F, F, F, F, C, C, S]);
    expect(only([higher])!.horseId).toBe('h1p7');
  });

  it('it names the top CLOSER, not the top horse', () => {
    const item = only([k3(207)])!;
    expect(item.horseId).not.toBe('h1p1'); // the 210 front-runner
    expect(item.body.join(' ')).not.toContain(name(1, 1));
  });
});

// ------------------------------------------------------------------ K4, easier crowd
describe('K4 easier crowd: a horse runs twice, the rivals\' means differ by 6 or more, its rank in the softer race at most 3', () => {
  /** X runs in race `a` and race `b`. Soft rivals sum 1380 with X (200) third; hard rivals sum 1380 + `extra`. */
  const hard = (extra: number): Slot[] => {
    const rivals = [206, 205, 204, 203, 202, 201, 201 + (extra - 42)]; // 1422 at extra 42
    return [{ total: rivals[0], style: F }, { total: rivals[1], style: F }, { total: rivals[2], style: S }, { id: 'X', total: 200, style: S },
      { total: rivals[3], style: C }, { total: rivals[4], style: S }, { total: rivals[5], style: C }, { total: rivals[6], style: S }];
  };
  const soft = (above: number): Slot[] => {
    // `above` rivals over X (200); the other rivals below it; the seven sum 1380
    const tops = [210, 209, 208].slice(0, above);
    const below = above === 2 ? [199, 196, 192, 189, 185] : [199, 190, 184, 180];
    const r = [...tops, ...below];
    return [{ total: r[0], style: F }, { total: r[1], style: F }, { total: r[2], style: S }, { id: 'X', total: 200, style: S },
      { total: r[3], style: C }, { total: r[4], style: S }, { total: r[5], style: C }, { total: r[6], style: S }];
  };
  const k4 = (races: Slot[][]) => newsOf(world(races)).filter((i) => i.kind === 'K4');

  it('rivals\' means 6 apart fire K4 and name the softer race, when it is the first start', () => {
    const items = k4([soft(2), hard(42)]);
    expect(items).toHaveLength(1);
    expect(items[0].race).toBe(1);
    expect(items[0].horseId).toBe('X');
    expect(items[0].headline.startsWith('Race 1: ')).toBe(true);
    expect(items[0].body.join(' ')).toContain('Horse X');
  });

  it('and when the softer race is the second start', () => {
    const items = k4([hard(42), soft(2)]);
    expect(items).toHaveLength(1);
    expect(items[0].race).toBe(2);
    expect(items[0].headline.startsWith('Race 2: ')).toBe(true);
    expect(items[0].body.join(' ')).toMatch(/Race 2\b/);
    expect(items[0].body.join(' ')).not.toMatch(/Race 1\b/);
  });

  it('a mean difference of 5.857 (41 over seven rivals) does not fire; 6 does; more does', () => {
    expect(k4([soft(2), hard(41)])).toHaveLength(0);
    expect(k4([soft(2), hard(42)])).toHaveLength(1);
    expect(k4([soft(2), hard(60)])).toHaveLength(1);
    expect(k4([hard(60), soft(2)])).toHaveLength(1);
  });

  it('the horse must rank 3 or better in the softer race: rank 3 fires, rank 4 does not', () => {
    expect(k4([soft(2), hard(42)])).toHaveLength(1);
    expect(k4([soft(3), hard(42)])).toHaveLength(0);
  });

  it('a horse that runs once never fires K4', () => {
    const lone = world([soft(2).map((s) => ({ ...s, id: undefined })), hard(42).map((s) => ({ ...s, id: undefined }))]);
    expect(newsOf(lone).filter((i) => i.kind === 'K4')).toHaveLength(0);
  });

  it('it is about the field, never the start: the item names the softer race and the headline carries the softer race, not the horse\'s first', () => {
    for (const [a, b, want] of [[soft(2), hard(42), 1], [hard(42), soft(2), 2]] as const) {
      const item = k4([a, b])[0];
      expect(item.race).toBe(want);
      expect(item.id.endsWith(`:${want}`)).toBe(true);
    }
  });
});

// ------------------------------------------------------------------ K5, no speed
describe('K5 no speed: no front-runner, the top stalker in the first four', () => {
  // Closers at posts 2, 4, 6 and 8 take the top; stalkers at posts 1, 3, 5 and 7.
  const k5 = (stalkers: [number, number, number, number], closers: [number, number, number, number] = [215, 214, 213, 211]): Slot[] =>
    field([stalkers[0], closers[0], stalkers[1], closers[1], stalkers[2], closers[2], stalkers[3], closers[3]], [S, C, S, C, S, C, S, C]);

  it('a top stalker of rank 4 fires K5 and names it, not the top closer', () => {
    const item = only([k5([212, 200, 199, 198])])!; // 215, 214, 213 above it
    expect(item.kind).toBe('K5');
    expect(item.horseId).toBe('h1p1');
  });

  it('rank 5 does not fire K5; a stalker tied for 4th does', () => {
    expect(only([k5([210, 200, 199, 198])])!.kind).not.toBe('K5'); // 215, 214, 213, 211 above
    expect(only([k5([211, 200, 199, 198])])!.kind).toBe('K5'); // ties the closer at 211: three above
  });

  it('ties between stalkers go to the lower post', () => {
    const item = only([k5([212, 200, 212, 198])])!;
    expect(item.kind).toBe('K5');
    expect(item.horseId).toBe('h1p1');
    const later = only([k5([200, 212, 212, 198])])!;
    expect(later.horseId).toBe('h1p3');
  });

  it('a higher stalker later in the field beats a lower one earlier', () => {
    expect(only([k5([198, 200, 212, 199])])!.horseId).toBe('h1p5');
  });

  it('one front-runner anywhere in the field, and no K5', () => {
    const styles = [S, C, S, C, S, C, S, F];
    const item = only([field([212, 215, 200, 214, 199, 213, 198, 211], styles)]);
    expect(item?.kind).not.toBe('K5');
  });

  it('a field with no stalker has no K5', () => {
    expect(only([field([215, 214, 213, 211, 200, 199, 198, 197], [C, C, C, C, C, C, C, C])])?.kind).not.toBe('K5');
  });
});

// ------------------------------------------------------------------ K6, drawn wide
describe('K6 drawn wide (13.3): a front-runner of rank 3 or better, two or more front-runners, in the last two posts. Inside is dropped', () => {
  const k6 = (totals: number[], styles: Style[]) => only([field(totals, styles)]);

  it('post 8 at rank 1 fires, naming that horse and its post', () => {
    const item = k6([190, 195, 194, 193, 192, 191, 189, 200], [F, S, C, S, C, S, C, F])!;
    expect(item.kind).toBe('K6');
    expect(item.horseId).toBe('h1p8');
    expect(item.post).toBe(8);
    expect(item.body.join(' ')).toMatch(/\b8\b/);
  });

  it('post 7 at rank 3 fires; rank 4 does not', () => {
    const at3 = k6([190, 200, 199, 197, 192, 191, 198, 189], [F, S, C, S, C, S, F, C])!;
    expect(at3.kind).toBe('K6');
    expect(at3.post).toBe(7);
    const at4 = k6([190, 200, 199, 198, 192, 191, 197, 189], [F, S, C, S, C, S, F, C]);
    expect(at4?.kind).not.toBe('K6');
  });

  it('a front-runner in post 1 to 6, however strong, never fires K6 (inside is dropped, and 3 to 6 never counted)', () => {
    for (let post = 1; post <= 6; post++) {
      const totals = flat({ [post]: 212 }, 195);
      totals[7] = 150; // the second front-runner is last in the field, far from rank 3
      const styles: Style[] = [S, C, S, C, S, C, S, F];
      styles[post - 1] = F;
      const item = k6(totals, styles);
      expect(item?.kind, `front-runner at post ${post}`).not.toBe('K6');
    }
  });

  it('a lone front-runner is never K6\'s even when K1 is full: a third lone-speed race, drawn wide, prints no K6', () => {
    const lone = (tF: number) => field([195, 194, 193, 192, 191, 190, 189, tF], [S, C, S, C, S, C, S, F]);
    const items = newsOf(world([lone(211), lone(209), lone(207)]));
    expect(items.some((i) => i.kind === 'K6')).toBe(false);
    expect(items.filter((i) => i.kind === 'K1').map((i) => i.race)).toEqual([1, 2]);
    expect(items.find((i) => i.race === 3)!.kind).toBe('K7');
  });

  it('a lone front-runner in post 8 is K1\'s, never K6\'s', () => {
    const item = k6([190, 195, 194, 193, 192, 191, 189, 200], [S, S, C, S, C, S, C, F])!;
    expect(item.kind).toBe('K1');
  });

  it('with front-runners at both 7 and 8 in the first three, the item names post 8', () => {
    const item = k6([190, 195, 194, 193, 192, 191, 199, 200], [F, S, C, S, C, S, F, F])!;
    expect(item.kind).toBe('K6');
    expect(item.post).toBe(8);
  });

  it('a field of six: the wide posts are 5 and 6', () => {
    const six = world([[
      { style: F, total: 190 }, { style: S, total: 195 }, { style: C, total: 194 }, { style: S, total: 193 }, { style: F, total: 199 }, { style: F, total: 200 },
    ]]);
    const item = newsOf(six)[0];
    expect(item.kind).toBe('K6');
    expect(item.post).toBe(6);
    const fiveOnly = world([[
      { style: F, total: 190 }, { style: S, total: 195 }, { style: C, total: 194 }, { style: S, total: 193 }, { style: F, total: 199 }, { style: C, total: 200 },
    ]]);
    expect(newsOf(fiveOnly)[0].post).toBe(5);
    // posts 7 and 8 do not exist; a front-runner in post 4 of six is not wide
    const four = world([[
      { style: F, total: 190 }, { style: S, total: 195 }, { style: C, total: 194 }, { style: F, total: 199 }, { style: S, total: 193 }, { style: C, total: 200 },
    ]]);
    expect(newsOf(four)[0]?.kind).not.toBe('K6');
  });

  it('the wording never says to avoid the horse', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const item = newsOf(world([field([190, 195, 194, 193, 192, 191, 189, 200], [F, S, C, S, C, S, C, F])]), seed)[0];
      expect(item.kind).toBe('K6');
      expect(`${item.headline} ${item.body.join(' ')}`).not.toMatch(/avoid|skip|stay away|against|don't|never|lose/i);
    }
  });
});

// ------------------------------------------------------------------ K7, top on the numbers
describe('K7 top on the numbers: a unique top where K2 did not fire', () => {
  it('names the unique top horse, and prints nothing for a tie', () => {
    const item = only([field(flat({ 5: 215 }), QUIET)])!;
    expect(item.kind).toBe('K7');
    expect(item.post).toBe(5);
    expect(only([field(flat({ 5: 215, 7: 215 }), QUIET)])).toBeNull();
  });

  it('where K2 fired for the race, the race has a K2 item and never a K7 item', () => {
    const items = newsOf(world([field(flat({ 5: 250 }), QUIET)]));
    expect(items.map((i) => i.kind)).toEqual(['K2']);
  });

  it('K7 is lower priority than every pace and class item in the same race', () => {
    // K1 field: the lone front-runner has the lower total than the unique top, which K7 would name
    const k1 = field([210, 208, 206, 204, 205, 200, 198, 196], [S, C, S, C, F, C, S, C]);
    expect(only([k1])!.kind).toBe('K1');
  });
});

// ------------------------------------------------------------------ selection, section 3.4
describe('3.4 filling the five slots', () => {
  const ladder = [210, 208, 206, 204, 202, 200, 198];
  const k1 = (tF: number) => field([...ladder.slice(0, 4), tF, ...ladder.slice(4)], [S, C, S, C, F, C, S, C]);
  const k2 = (top: number) => field(flat({ 5: top }), QUIET);
  const k7 = (top: number) => field(flat({ 5: top }), QUIET);

  it('K1, then K2, at most two of each; K7 fills the last slot from the best lead; page in race order; the lead is the first taken', () => {
    // races 1 to 3: lone speed with fronts 205, 207, 211. 4 to 6: class above with tops 250, 240, 230. 7, 8: top on the numbers, 225 and 215.
    const w = world([k1(205), k1(207), k1(211), k2(250), k2(240), k2(230), k7(225), k7(215)]);
    const items = newsOf(w);
    expect(items.map((i) => `${i.kind}:${i.race}`)).toEqual(['K1:2', 'K1:3', 'K2:4', 'K2:5', 'K7:7']);
    expect(items.map((i) => i.slot)).toEqual([1, 2, 3, 4, 5]);
    expect(items.filter((i) => i.lead).map((i) => i.id)).toEqual(['K1:3']); // the biggest front-runner total among K1 is the first taken
    expect(items.find((i) => i.lead)!.kind).toBe('K1');
  });

  it('every kind in priority order K1, K2, K3, K4, K5, K6, K7: five are taken and the last two are not printed', () => {
    const k3 = field([210, 208, 206, 202, 200, 204, 190, 189], [F, F, F, F, F, C, S, S]);
    const k5 = field([212, 215, 200, 214, 199, 213, 198, 211], [S, C, S, C, S, C, S, C]);
    const k6 = field([190, 195, 194, 193, 192, 191, 189, 200], [F, S, C, S, C, S, C, F]);
    const softX: Slot[] = [
      { total: 210, style: F }, { total: 209, style: F }, { total: 199, style: S }, { id: 'X', total: 200, style: S },
      { total: 196, style: C }, { total: 192, style: S }, { total: 189, style: C }, { total: 185, style: S },
    ];
    const hardX: Slot[] = [
      { total: 206, style: F }, { total: 205, style: F }, { total: 204, style: S }, { id: 'X', total: 200, style: S },
      { total: 203, style: C }, { total: 202, style: S }, { total: 201, style: C }, { total: 201, style: S },
    ];
    // race 1 K1, 2 K2, 3 K3, 4 K5, 5 K6, 6 K7, 7 K4's softer race, 8 K4's harder race
    const items = newsOf(world([k1(211), k2(250), k3, k5, k6, k7(225), softX, hardX]));
    expect(items.map((i) => `${i.kind}:${i.race}`)).toEqual(['K1:1', 'K2:2', 'K3:3', 'K5:4', 'K4:7']);
    expect(items.find((i) => i.lead)!.id).toBe('K1:1');
    expect(items.some((i) => i.kind === 'K6' || i.kind === 'K7')).toBe(false);
    expect(items.find((i) => i.kind === 'K4')!.horseId).toBe('X');
  });

  it('one item to a race: a race with a K1 candidate and a K2 candidate prints the K1, and the K2 is not printed elsewhere', () => {
    // the lone front-runner is also the unique top by 40: both K1 and K2 apply to race 1
    const both = field([160, 160, 160, 160, 215, 160, 160, 160], [S, C, S, C, F, C, S, C]);
    const items = newsOf(world([both]));
    expect(items.map((i) => i.kind)).toEqual(['K1']);
  });

  it('fewer than five candidates print what there is, and invent no filler', () => {
    const items = newsOf(world([k7(215), k7(220), k7(225)]));
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.kind === 'K7')).toBe(true);
  });

  it('no candidates at all (every race tied at the top) prints nothing, and the cover line is blank', () => {
    const w = world(Array.from({ length: 8 }, () => field(flat(), QUIET)));
    const items = newsOf(w);
    expect(items).toEqual([]);
    expect(coverFor(book, { daySeed: 1, trackName: 'Churchill Downs', raceCount: 8, news: items }).line).toBe('');
  });

  it('the cover line is the headline of the item taken first, with its race prefix', () => {
    const w = world([k1(205), k1(207), k1(211), k2(250), k2(240), k2(230), k7(225), k7(215)]);
    const items = newsOf(w);
    const cover = coverFor(book, { daySeed: 1, trackName: 'Churchill Downs', raceCount: 8, news: items });
    expect(cover.line).toBe(items.find((i) => i.id === 'K1:3')!.headline);
    expect(cover.line.startsWith('Race 3: ')).toBe(true);
  });

  it('the page is the same every time (printed once a day): the same inputs, the same items', () => {
    const w = world([k1(205), k1(207), k1(211), k2(250), k2(240), k2(230), k7(225), k7(215)]);
    expect(newsOf(w, 77)).toEqual(newsOf(w, 77));
  });

  it('inside K2, the bigger lead goes first and the cap keeps the two biggest; ties on every key go to the earlier race', () => {
    const w = world([k2(235), k2(250), k2(240), k2(250)]);
    const items = newsOf(w);
    expect(items.filter((i) => i.kind === 'K2').map((i) => i.race)).toEqual([2, 4]);
  });
});

// ------------------------------------------------------------------ real days: every claim, recomputed
interface E { id: string; name: string; post: number; style: string; total: number; rank: number }
const horses = new Map(stableJson.horses.map((h) => [h.id, h]));
const entriesOf = (ids: readonly string[]): E[] => {
  const es = ids.map((id, i) => { const h = horses.get(id)!; return { id, name: h.name, post: i + 1, style: h.style, total: h.stats.speed + h.stats.stamina + h.stats.kick, rank: 0 }; });
  for (const e of es) e.rank = 1 + es.filter((x) => x.total > e.total).length;
  return es;
};

describe('real days: the claim of every printed item is true, recomputed from the drawn field and stable.json', () => {
  const SEEDS = Array.from({ length: 300 }, (_v, i) => 3 + i * 104729);

  it('each item\'s claim holds for the race and horse it names, and its text names no other horse', () => {
    const seen: Record<string, number> = {};
    for (const seed of SEEDS) {
      const fields = drawnDay(ctx, seed);
      const items = newsFor(book, { daySeed: seed, fields, stable: stableJson.horses as NewsInput['stable'] });
      for (const it of items) {
        seen[it.kind] = (seen[it.kind] ?? 0) + 1;
        const ids = fields[it.race - 1].horseIds;
        const es = entriesOf(ids);
        const n = es.length;
        const named = es.find((e) => e.id === it.horseId)!;
        const tag = `seed ${seed} ${it.id}`;
        expect(named, tag).toBeDefined();
        expect(named.post, tag).toBe(it.post);
        const sum = es.reduce((s, e) => s + e.total, 0);
        const fronts = es.filter((e) => e.style === 'frontRunner').length;
        const sorted = [...es].sort((a, b) => b.total - a.total);
        const uniqueTop = sorted[0].total > sorted[1].total;
        const top = sorted[0];
        if (it.kind === 'K1') {
          expect(fronts, tag).toBe(1);
          expect(named.style, tag).toBe('frontRunner');
          expect(named.rank, tag).toBeLessThanOrEqual(4);
        } else if (it.kind === 'K2') {
          expect(uniqueTop, tag).toBe(true);
          expect(named, tag).toBe(top);
          expect(top.total * n - sum, tag).toBeGreaterThanOrEqual(26 * n);
          expect(top.total - sorted[1].total, tag).toBeGreaterThanOrEqual(9);
        } else if (it.kind === 'K3') {
          expect(fronts, tag).toBeGreaterThanOrEqual(5);
          expect(named.style, tag).toBe('closer');
          expect(named.rank, tag).toBeLessThanOrEqual(4);
          const closers = es.filter((e) => e.style === 'closer');
          const best = Math.max(...closers.map((e) => e.total));
          expect(named.total, tag).toBe(best);
          expect(closers.find((e) => e.total === best)!.id, tag).toBe(named.id); // ties go to the lower post
        } else if (it.kind === 'K4') {
          const starts = fields.filter((f) => f.horseIds.includes(named.id));
          expect(starts.length, tag).toBe(2);
          const means = starts.map((f) => { const e = entriesOf(f.horseIds); return { race: f.race, mean: (e.reduce((s, x) => s + x.total, 0) - named.total) / (e.length - 1), rank: e.find((x) => x.id === named.id)!.rank }; });
          expect(Math.abs(means[0].mean - means[1].mean), tag).toBeGreaterThanOrEqual(6 - 1e-9);
          const soft = means[0].mean < means[1].mean ? means[0] : means[1];
          expect(it.race, tag).toBe(soft.race);
          expect(soft.rank, tag).toBeLessThanOrEqual(3);
          expect(it.body.join(' '), tag).toMatch(new RegExp(`Race ${soft.race}\\b`));
        } else if (it.kind === 'K5') {
          expect(fronts, tag).toBe(0);
          expect(named.style, tag).toBe('stalker');
          expect(named.rank, tag).toBeLessThanOrEqual(4);
          const stalkers = es.filter((e) => e.style === 'stalker');
          expect(named.total, tag).toBe(Math.max(...stalkers.map((e) => e.total)));
        } else if (it.kind === 'K6') {
          expect(fronts, tag).toBeGreaterThanOrEqual(2);
          expect(named.style, tag).toBe('frontRunner');
          expect(named.rank, tag).toBeLessThanOrEqual(3);
          expect(named.post, tag).toBeGreaterThanOrEqual(n - 1);
        } else {
          expect(it.kind, tag).toBe('K7');
          expect(uniqueTop, tag).toBe(true);
          expect(named, tag).toBe(top);
          // K2 did not fire for this race
          expect(top.total * n - sum >= 26 * n && top.total - sorted[1].total >= 9, tag).toBe(false);
        }
        // the text names the item's horse, and no other horse of the stable
        const text = `${it.headline} ${it.body.join(' ')}`;
        expect(text, tag).toContain(named.name);
        for (const h of stableJson.horses) if (h.id !== named.id && !named.name.includes(h.name)) expect(text, `${tag} names ${h.name}`).not.toContain(h.name);
        // the race number in the headline is the race the item is about
        expect(it.headline.startsWith(`Race ${it.race}: `), tag).toBe(true);
      }
    }
    // the check had every kind but the rare ones to chew on
    for (const k of ['K1', 'K2', 'K3', 'K4', 'K6']) expect(seen[k] ?? 0, k).toBeGreaterThan(5);
  });

  it('K6 inside never prints: no item is a K6 for a post before the last two', () => {
    for (const seed of SEEDS) {
      for (const it of newsFor(book, { daySeed: seed, fields: drawnDay(ctx, seed), stable: stableJson.horses as NewsInput['stable'] })) {
        if (it.kind === 'K6') expect(it.post).toBeGreaterThanOrEqual(7);
      }
    }
  });

  /** My own full reimplementation of 3.4 with the section 13 rulings, to compare the whole page. */
  function expected(fields: { race: number; horseIds: readonly string[] }[]) {
    interface Cand { kind: string; race: number; id: string; post: number; keys: number[] }
    const cands: Cand[] = [];
    const fs = fields.map((f) => ({ race: f.race, es: entriesOf(f.horseIds) }));
    const classRace = new Set<number>();
    for (const { race, es } of fs) {
      const n = es.length;
      const sum = es.reduce((s, e) => s + e.total, 0);
      const sorted = [...es].sort((a, b) => b.total - a.total);
      const top = sorted[0];
      const unique = sorted[0].total > sorted[1].total;
      const fronts = es.filter((e) => e.style === 'frontRunner');
      if (unique && top.total * n - sum >= 26 * n && top.total - sorted[1].total >= 9) { classRace.add(race); cands.push({ kind: 'K2', race, id: top.id, post: top.post, keys: [(top.total * n - sum) / n] }); }
      if (fronts.length === 1 && fronts[0].rank <= 4) cands.push({ kind: 'K1', race, id: fronts[0].id, post: fronts[0].post, keys: [fronts[0].total] });
      if (fronts.length >= 5) {
        const cl = es.filter((e) => e.style === 'closer').sort((a, b) => b.total - a.total || a.post - b.post)[0];
        if (cl && cl.rank <= 4) cands.push({ kind: 'K3', race, id: cl.id, post: cl.post, keys: [fronts.length, cl.total] });
      }
      if (fronts.length === 0) {
        const st = es.filter((e) => e.style === 'stalker').sort((a, b) => b.total - a.total || a.post - b.post)[0];
        if (st && st.rank <= 4) cands.push({ kind: 'K5', race, id: st.id, post: st.post, keys: [st.total] });
      }
      if (fronts.length >= 2) for (const e of fronts) if (e.rank <= 3 && e.post >= n - 1) cands.push({ kind: 'K6', race, id: e.id, post: e.post, keys: [e.post, e.total] });
    }
    for (const { race, es } of fs) {
      const n = es.length;
      const sum = es.reduce((s, e) => s + e.total, 0);
      const sorted = [...es].sort((a, b) => b.total - a.total);
      if (sorted[0].total > sorted[1].total && !classRace.has(race)) cands.push({ kind: 'K7', race, id: sorted[0].id, post: sorted[0].post, keys: [(sorted[0].total * n - sum) / n] });
    }
    const runs = new Map<string, { race: number; es: E[]; e: E }[]>();
    for (const f of fs) for (const e of f.es) runs.set(e.id, [...(runs.get(e.id) ?? []), { race: f.race, es: f.es, e }]);
    for (const [id, list] of runs) {
      if (list.length < 2) continue;
      const m = list.map((x) => ({ ...x, mean: (x.es.reduce((s, y) => s + y.total, 0) - x.e.total) / (x.es.length - 1) }));
      const d = Math.abs(m[0].mean - m[1].mean);
      const soft = m[0].mean <= m[1].mean ? m[0] : m[1];
      if (d >= 6 - 1e-9 && soft.e.rank <= 3) cands.push({ kind: 'K4', race: soft.race, id, post: soft.e.post, keys: [d] });
    }
    const order = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7'];
    const taken: Cand[] = [];
    const used = new Set<number>();
    for (const kind of order) {
      const list = cands.filter((c) => c.kind === kind).sort((a, b) => {
        for (let i = 0; i < Math.max(a.keys.length, b.keys.length); i++) { const d = (b.keys[i] ?? 0) - (a.keys[i] ?? 0); if (Math.abs(d) > 1e-9) return d; }
        return a.race - b.race || a.post - b.post;
      });
      let count = 0;
      for (const c of list) {
        if (taken.length >= 5) break;
        if (used.has(c.race)) continue;
        if (kind !== 'K7' && count >= 2) continue;
        taken.push(c); used.add(c.race); count++;
      }
    }
    return { taken, page: [...taken].sort((a, b) => a.race - b.race) };
  }

  it('the whole page is what 3.4 and the section 13 rulings give: the same items, in race order, the lead the first taken', () => {
    for (const seed of SEEDS) {
      const fields = drawnDay(ctx, seed);
      const items = newsFor(book, { daySeed: seed, fields, stable: stableJson.horses as NewsInput['stable'] });
      const want = expected(fields);
      expect(items.map((i) => `${i.kind}:${i.race}:${i.horseId}`), `seed ${seed}`).toEqual(want.page.map((c) => `${c.kind}:${c.race}:${c.id}`));
      if (items.length > 0) expect(`${items.find((i) => i.lead)!.kind}:${items.find((i) => i.lead)!.race}`, `seed ${seed}`).toBe(`${want.taken[0].kind}:${want.taken[0].race}`);
      expect(items.filter((i) => i.lead)).toHaveLength(items.length > 0 ? 1 : 0);
    }
  });

  it('one item a race, at most five, at most two of any kind but K7, in race order', () => {
    for (const seed of SEEDS) {
      const items = newsFor(book, { daySeed: seed, fields: drawnDay(ctx, seed), stable: stableJson.horses as NewsInput['stable'] });
      expect(items.length).toBeLessThanOrEqual(5);
      expect(new Set(items.map((i) => i.race)).size).toBe(items.length);
      for (const kind of ['K1', 'K2', 'K3', 'K4', 'K5', 'K6']) expect(items.filter((i) => i.kind === kind).length, kind).toBeLessThanOrEqual(2);
      expect(items.map((i) => i.race)).toEqual([...items.map((i) => i.race)].sort((a, b) => a - b));
    }
  });
});

// ------------------------------------------------------------------ streams, determinism, what the news never reads
describe('NU1 and NU5: same inputs, same news; only the `news` stream; the estimate, the odds and yesterday never matter', () => {
  const SEEDS = [11, 4242, 99991, 1234567, 4294967295, 0];

  it('the same inputs give the same items, any number of times, and extra inputs (an estimate, prices, yesterday) change nothing', () => {
    for (const seed of SEEDS) {
      const base = { daySeed: seed, fields: drawnDay(ctx, seed), stable: stableJson.horses as NewsInput['stable'] };
      const a = newsFor(book, base);
      expect(newsFor(book, base)).toEqual(a);
      const extra = { ...base, estimate: { runs: 1000, wins: [999, 1, 0, 0, 0, 0, 0, 0] }, odds: ['1-9', '99-1'], previous: { records: [{ race: 1, horseIds: [], winnerPost: 1, winnerOdds: '99-1' }] }, bankroll: 5 };
      expect(newsFor(book, extra as unknown as NewsInput)).toEqual(a);
    }
  });

  it('the wording is the only draw: one draw per printed item, on the `news` stream and no other', () => {
    for (const seed of SEEDS) {
      const input = { daySeed: seed, fields: drawnDay(ctx, seed), stable: stableJson.horses as NewsInput['stable'] };
      made.list.length = 0;
      const items = newsFor(book, input);
      expect([...new Set(made.list.map((m) => m.name))]).toEqual(['news']);
      expect(made.list.reduce((n, m) => n + m.draws, 0)).toBe(items.length);
    }
  });

  it('golden: race 1\'s field, race seed, first 5 estimate seeds and crowd dollars do not move when the news is made', () => {
    for (const seed of [12345, 20261113, 0, 4294967295, 99]) {
      const snap = () => {
        const r1 = drawnDay(ctx, seed)[0];
        return { ids: r1.horseIds, raceSeed: r1.raceSeed, again: raceSeedOf(seed, 1), seeds: estimateSeedsOf(seed, 1, 5), crowd: programFor(ctx, r1, runEstimate(r1.input, seed, 1, 8)).crowdDollars };
      };
      const before = snap();
      for (let i = 0; i < 3; i++) newsFor(book, { daySeed: seed, fields: drawnDay(ctx, seed), stable: stableJson.horses as NewsInput['stable'] });
      expect(snap()).toEqual(before);
    }
  });

  it('the news is not one fixed page: different seeds give different pages, and the same seed the same wording', () => {
    const pages = new Set(SEEDS.map((s) => JSON.stringify(newsFor(book, { daySeed: s, fields: drawnDay(ctx, s), stable: stableJson.horses as NewsInput['stable'] }))));
    expect(pages.size).toBe(SEEDS.length);
  });

  it('with the estimate, odds and day modules absent, the news is still made (it needs none of them)', async () => {
    vi.resetModules();
    vi.doMock('./estimate', () => { throw new Error('the news imported the estimate'); });
    vi.doMock('./market', () => { throw new Error('the news imported the market'); });
    vi.doMock('./day', () => { throw new Error('the news imported the day'); });
    const { newsFor: bare } = await import('./news');
    const { loadBook: load } = await import('../data/bookLoad');
    const w = world([field(flat({ 5: 250 }), QUIET), field(flat({ 5: 215 }), QUIET)]);
    const items = bare(load(), { daySeed: 5, fields: w.fields, stable: w.stable } as NewsInput);
    expect(items.map((i) => i.kind)).toEqual(['K2', 'K7']);
    vi.resetModules();
  });
});

// ------------------------------------------------------------------ wording (NU4, NU5, NU6)
describe('NU4 to NU6: every shipped pair, filled with every stable name, race, post and count, fits and holds no banned word', () => {
  const names = stableJson.horses.map((h) => h.name);
  const kinds = bookJson.news.kinds.value as unknown as Record<string, { pairs: { headline: string; body: string }[] }>;
  const COUNT = ['Five', 'Six', 'Seven'];
  const prefix = bookJson.news.prefix.value; // "Race {r}:"

  const wrap = (s: string, w = 30): string[] => {
    const lines: string[] = [];
    let cur = '';
    for (const x of s.split(' ')) { if (cur === '') cur = x; else if (cur.length + 1 + x.length <= w) cur += ` ${x}`; else { lines.push(cur); cur = x; } }
    return [...lines, cur];
  };
  const BANNED = [
    'injury', 'injured', 'hurt', 'lame', 'limping', 'fell', 'fall', 'vet', 'scratched', 'ambulance', 'favorite', 'tip', 'pick', 'lock', 'sure thing',
    'due', 'tired', 'tire', 'tires', 'tiring', 'fade', 'fades', 'fresh', 'rested', 'bounce', 'streak', 'in form', 'on form', 'stayer', 'goes long', 'distance',
    'wire to wire', "can't lose", 'guaranteed', 'cinch', 'banker', 'best bet', 'value', 'overlay', 'odds-on', 'percent', 'official',
    ...bettingJson.copy.bannedWords, ...hubJson.copy.bannedWords,
  ];
  const hit = (s: string) => BANNED.find((w) => new RegExp(`(?<![A-Za-z0-9])${w.replace(/ /g, '\\s+')}(?![A-Za-z0-9])`, 'i').test(s)) ?? null;
  const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_m, k: string) => String(v[k]));

  it('there are pairs for every kind, and a headline from data is at most 22 characters', () => {
    expect(Object.keys(kinds).sort()).toEqual(['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7']);
    for (const [k, v] of Object.entries(kinds)) {
      expect(v.pairs.length, k).toBeGreaterThan(0);
      for (const p of v.pairs) expect(p.headline.length, `${k} ${p.headline}`).toBeLessThanOrEqual(22);
    }
  });

  it('every pair, every name, race, post and count: the headline with its prefix is at most 30, the body at most 2 lines of 30', () => {
    let widest = 0;
    for (const [k, v] of Object.entries(kinds)) {
      for (const p of v.pairs) {
        for (const nm of names) {
          for (let r = 1; r <= 8; r++) {
            for (const count of COUNT) {
              for (const post of [1, 8]) {
                const vals = { name: nm, r, k: count, post, soft: r };
                const head = `${fill(prefix, vals)} ${fill(p.headline, vals)}`;
                const lines = wrap(fill(p.body, vals));
                expect(head.length, `${k} ${head}`).toBeLessThanOrEqual(30);
                expect(lines.length, `${k} ${nm} ${lines.join(' / ')}`).toBeLessThanOrEqual(2);
                for (const l of lines) { expect(l.length).toBeLessThanOrEqual(30); widest = Math.max(widest, l.length); }
              }
            }
          }
        }
      }
    }
    expect(widest).toBeGreaterThan(25);
  });

  it('no pair has a banned word, in any case, whole words only; and no "%" or "$"', () => {
    for (const [k, v] of Object.entries(kinds)) {
      for (const p of v.pairs) {
        for (const s of [p.headline, p.body, ...names.map((nm) => fill(p.body, { name: nm, r: 1, k: 'Five', post: 1, soft: 1 }))]) {
          expect(hit(s), `${k}: ${s}`).toBeNull();
          expect(s, s).not.toMatch(/[%$]/);
        }
      }
    }
  });

  it('every banned word of 9.2 is on the list the loader checks (the news list in book.json plus the betting and hub lists)', () => {
    const shipped = new Set([...bookJson.news.bannedWords.value, ...bettingJson.copy.bannedWords, ...hubJson.copy.bannedWords].map((w) => w.toLowerCase()));
    for (const w of ['due', 'tired', 'tire', 'tires', 'tiring', 'fade', 'fades', 'fresh', 'rested', 'bounce', 'streak', 'in form', 'on form', 'stayer', 'goes long', 'distance', 'wire to wire', "can't lose", 'guaranteed', 'cinch', 'banker', 'best bet', 'value', 'overlay', 'odds-on', 'percent', 'favorite', 'tip', 'pick', 'lock', 'sure thing']) {
      expect(shipped.has(w), w).toBe(true);
    }
    expect(bookJson.news.bannedChars.value).toContain('%');
  });

  it('the subtitle is "Pace, class and peanuts." and no horse name in the stable is itself a banned word', () => {
    expect(bookJson.news.subtitle.value).toBe('Pace, class and peanuts.');
    for (const nm of names) expect(hit(nm), nm).toBeNull();
  });

  it('over many real days, every printed headline and body is at most 30 / 2 lines of 30, has no banned word, and prints no number but a race number or a post', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const it of newsFor(book, { daySeed: seed, fields: drawnDay(ctx, seed), stable: stableJson.horses as NewsInput['stable'] })) {
        const text = `${it.headline} ${it.body.join(' ')}`;
        expect(it.headline.length, text).toBeLessThanOrEqual(30);
        expect(it.body.length, text).toBeLessThanOrEqual(2);
        for (const l of it.body) expect(l.length, l).toBeLessThanOrEqual(30);
        expect(hit(text), text).toBeNull();
        const digits = (text.match(/\d+/g) ?? []).map(Number);
        for (const d of digits) expect([it.race, it.post].includes(d), `${text}: ${d}`).toBe(true);
        if (it.kind !== 'K6') expect(digits.every((d) => d === it.race), text).toBe(true);
      }
    }
  });

  it('K4 says the field is easier and never that the horse is fresh, rested or busy; K3 never says the leaders tire', () => {
    for (const p of kinds.K4.pairs) expect(`${p.headline} ${p.body}`).not.toMatch(/fresh|rest|busy|tired|tire|fade/i);
    for (const p of kinds.K3.pairs) expect(`${p.headline} ${p.body}`).not.toMatch(/tire|fade|slow|duel|burn/i);
  });

  it('the two pairs the engineer left out really do need a third line for some names (K2 "add up the bars", K7 "most in the bars")', () => {
    const over = (t: string) => names.filter((nm) => wrap(fill(t, { name: nm })).length > 2);
    expect(over('Add up the bars. {name} comes out well ahead.').sort()).toEqual(['Biscuit Emergency', 'Medium Everything']);
    expect(over('Add the three bars: {name} is top here.')).toEqual(['Unsolicited Advice']);
    // and the shipped pairs of those two kinds are the ones that fit
    expect(kinds.K2.pairs.map((p) => p.headline)).not.toContain('add up the bars');
    expect(kinds.K7.pairs.map((p) => p.headline)).not.toContain('most in the bars');
  });
});
