import { describe, expect, it } from 'vitest';
import { loadBook } from '../data/bookLoad';
import type { StableHorse } from '../data/bettingSchema';
import { createStream } from '../sim/rng';
import { BET_STREAM_NAMES } from './streams';
import { drawnDay } from './day';
import { newsFor, type NewsItem } from './news';
import { realCtx } from './testkit';

// NU1 to NU3 (docs/specs/book-useful.md section 9, with the section 13 rulings), on hand-built
// fields so each trigger is tested at its edge, and on the real stable for the day as a whole.

const ctx = realCtx();
const book = loadBook();

type Style = StableHorse['style'];
type Spec = readonly [Style, number];
const F: Style = 'frontRunner', S: Style = 'stalker', C: Style = 'closer';

/** Hand-built days: races of [style, total] by post. A horse is "r{race}p{post}" unless given an id as a third item. */
function world(races: readonly (readonly (Spec | readonly [Style, number, string])[])[]) {
  const horses = new Map<string, Pick<StableHorse, 'id' | 'name' | 'style' | 'stats'>>();
  const fields = races.map((specs, r) => ({
    race: r + 1,
    horseIds: specs.map((s, i) => {
      const id = s[2] ?? `r${r + 1}p${i + 1}`;
      const a = Math.floor(s[1] / 3);
      horses.set(id, { id, name: `Horse ${id}`, style: s[0], stats: { speed: a, stamina: a, kick: s[1] - 2 * a } });
      return id;
    }),
  }));
  return { fields, stable: [...horses.values()] };
}
const newsOf = (races: Parameters<typeof world>[0], daySeed = 7): NewsItem[] => newsFor(book, { daySeed, ...world(races) });
const kindsOf = (races: Parameters<typeof world>[0], daySeed = 7): string[] => newsOf(races, daySeed).map((i) => i.kind);

// Fields (by post) that fire exactly one kind, alone in a one-race day.
const K1_FIELD: Spec[] = [[C, 250], [F, 246], [S, 240], [C, 238], [S, 236], [C, 230], [S, 228], [C, 226]];
const K2_FIELD: Spec[] = [[C, 270], [S, 240], [F, 230], [F, 225], [C, 220], [S, 215], [C, 210], [S, 205]];
const K3_FIELD: Spec[] = [[C, 250], [F, 245], [F, 240], [F, 235], [F, 230], [F, 225], [S, 220], [S, 215]];
const K5_FIELD: Spec[] = [[S, 250], [C, 245], [C, 240], [S, 235], [C, 230], [S, 225], [C, 220], [S, 215]];
const K6_FIELD: Spec[] = [[C, 250], [S, 246], [S, 240], [C, 236], [S, 232], [C, 228], [F, 244], [F, 220]];
const K7_FIELD: Spec[] = [[C, 250], [S, 245], [S, 240], [C, 235], [S, 230], [C, 225], [F, 220], [F, 215]];

/** A field with the given totals by post, styles as given. */
const withTotals = (styles: Style[], totals: number[]): Spec[] => styles.map((s, i) => [s, totals[i]]);

describe('the hand-built fields fire the kind they are for, and only that kind', () => {
  it.each([
    ['K1', K1_FIELD], ['K2', K2_FIELD], ['K3', K3_FIELD], ['K5', K5_FIELD], ['K6', K6_FIELD], ['K7', K7_FIELD],
  ])('%s', (kind, field) => {
    expect(kindsOf([field])).toEqual([kind]);
  });
});

describe('NU2: each kind fires exactly when its trigger holds', () => {
  it('NU2: K1 lone speed fires at one front-runner of rank 4 and not at rank 5', () => {
    // The lone front-runner is post 2 at total 240; three horses above it make it rank 4, four make it rank 5.
    const rank4 = withTotals([C, F, S, C, S, C, S, C], [250, 240, 245, 244, 236, 230, 228, 226]);
    const rank5 = withTotals([C, F, S, C, S, C, S, C], [250, 240, 245, 244, 243, 230, 228, 226]);
    expect(kindsOf([rank4])).toEqual(['K1']);
    expect(kindsOf([rank5])).not.toContain('K1');
    expect(newsOf([rank4])[0]).toMatchObject({ post: 2, race: 1 });
  });

  it('NU2: K1 does not fire with two front-runners or none', () => {
    expect(kindsOf([withTotals([C, F, F, C, S, C, S, C], [250, 246, 240, 238, 236, 230, 228, 226])])).not.toContain('K1');
    expect(kindsOf([withTotals([C, S, S, C, S, C, S, C], [250, 246, 240, 238, 236, 230, 228, 226])])).not.toContain('K1');
  });

  // Top 260, others sum 1612: lead = 260 - mean of all eight = 26 exactly, gap = 260 - 251 = 9 exactly.
  const lead = (others: number[], top = 260): Spec[] => withTotals([C, S, F, F, S, C, S, C], [top, ...others]);
  it('NU2: K2 fires at lead 26 and gap 9', () => {
    const f = lead([251, 227, 227, 227, 227, 227, 226]);
    expect(kindsOf([f])).toEqual(['K2']);
    expect(newsOf([f])[0].post).toBe(1);
  });
  it('NU2: K2 does not fire at lead 25.875 (one point less) or at gap 8', () => {
    expect(kindsOf([lead([251, 227, 227, 227, 227, 227, 227])])).not.toContain('K2'); // lead 25.875
    expect(kindsOf([lead([252, 227, 227, 226, 226, 226, 226])])).not.toContain('K2'); // lead 26, gap 8
  });
  it('NU2: K2 does not fire with a tie at the top, and then K7 does not either', () => {
    const f = withTotals([C, C, S, F, F, S, C, S], [270, 270, 230, 225, 220, 215, 210, 205]);
    expect(kindsOf([f])).toEqual([]);
  });

  it('NU2: K3 fires at five front-runners and not at four, naming the top closer', () => {
    const news = newsOf([K3_FIELD]);
    expect(news[0]).toMatchObject({ kind: 'K3', post: 1 });
    const four = withTotals([C, F, F, F, F, S, S, S], [250, 245, 240, 235, 230, 225, 220, 215]);
    expect(kindsOf([four])).not.toContain('K3');
  });
  it('NU2: K3 fires at six and seven front-runners (with a closer), and says the count as a word', () => {
    const six = withTotals([C, F, F, F, F, F, F, S], [250, 245, 240, 235, 230, 225, 220, 215]);
    const seven = withTotals([C, F, F, F, F, F, F, F], [250, 245, 240, 235, 230, 225, 220, 215]);
    expect(kindsOf([six])).toEqual(['K3']);
    expect(kindsOf([seven])).toEqual(['K3']);
    const heads = new Set(Array.from({ length: 30 }, (_v, s) => newsOf([seven], s)[0].headline));
    expect([...heads]).toContain('Race 1: Seven want the lead');
  });
  it('NU2: K3 names no one when the top closer is out of the first four, and never fires with no closer', () => {
    // The closer is post 8 at total 200: rank 8.
    expect(kindsOf([withTotals([F, F, F, F, F, S, S, C], [250, 245, 240, 235, 230, 225, 220, 200])])).not.toContain('K3');
    expect(kindsOf([withTotals([F, F, F, F, F, F, F, F], [250, 245, 240, 235, 230, 225, 220, 215])])).not.toContain('K3');
  });

  // Horse X (total 250) runs in two races. Rivals' means: race 1 sums 1445, race 2 sums 1445 + diff * 7.
  const rivals = (six: number[]): Spec[] => withTotals([S, S, C, S, C, S, C], [245, ...six]);
  const twoRaces = (a: number[], b: number[], x: Spec = [C, 250]): Parameters<typeof world>[0] => [
    [[x[0], x[1], 'X'], ...rivals(a)], [[x[0], x[1], 'X'], ...rivals(b)],
  ];
  it('NU2: K4 fires at a difference of 6 and not 5.857 (41 over seven rivals), naming the softer race whether first or second', () => {
    const soft = [200, 200, 200, 200, 200, 200];
    const hard = [207, 207, 207, 207, 207, 207]; // rivals' sum 42 more: exactly 6 a rival
    const almost = [207, 207, 207, 207, 207, 206]; // 41 more
    const first = newsOf(twoRaces(soft, hard));
    expect(first.find((i) => i.kind === 'K4')).toMatchObject({ race: 1, horseId: 'X' });
    const second = newsOf(twoRaces(hard, soft));
    expect(second.find((i) => i.kind === 'K4')).toMatchObject({ race: 2, horseId: 'X' });
    expect(kindsOf(twoRaces(soft, almost))).not.toContain('K4');
    expect(kindsOf(twoRaces(almost, soft))).not.toContain('K4');
  });
  it('NU2: K4 needs the horse to rank 3 or better in the softer race', () => {
    // X at 244 with rivals above it: 247 and 246 make it rank 3, a third (245) makes it rank 4. Rivals' sums differ by exactly 42.
    const race = (above: number[], rest: number[]): (Spec | readonly [Style, number, string])[] =>
      [[C, 244, 'X'], ...withTotals([S, S, C, S, C, S, C], [...above, ...rest])];
    const rank3: Parameters<typeof world>[0] = [race([247, 246], [200, 200, 200, 200, 200]), race([247, 246], [208, 208, 208, 208, 210])];
    const rank4: Parameters<typeof world>[0] = [race([247, 246, 245], [200, 200, 200, 200]), race([247, 246, 245], [210, 210, 211, 211])];
    expect(newsOf(rank3).find((i) => i.kind === 'K4')).toMatchObject({ race: 1, horseId: 'X' });
    expect(kindsOf(rank4)).not.toContain('K4');
  });
  it('NU2: K4 is about a horse that runs twice: one start never fires it', () => {
    expect(kindsOf([K7_FIELD, K7_FIELD.map((s, i) => (i === 0 ? s : [s[0], s[1] + 40] as Spec))])).not.toContain('K4');
  });

  it('NU2: K5 fires with no front-runner and the top stalker in the first four, and not at rank 5', () => {
    expect(kindsOf([K5_FIELD])).toEqual(['K5']);
    const rank5 = withTotals([S, C, C, C, C, S, C, S], [235, 250, 245, 244, 243, 225, 220, 215]);
    expect(kindsOf([rank5])).not.toContain('K5');
    expect(kindsOf([K1_FIELD])).not.toContain('K5');
  });

  it('NU2: K6 fires for a front-runner of rank 3 or better in the last two posts, at posts 7 and 8', () => {
    expect(newsOf([K6_FIELD])[0]).toMatchObject({ kind: 'K6', post: 7 });
    const eight = withTotals([C, S, S, C, S, C, F, F], [250, 246, 240, 236, 232, 228, 220, 244]);
    expect(newsOf([eight])[0]).toMatchObject({ kind: 'K6', post: 8 });
  });
  it('NU2: K6 never fires at posts 1 to 6 (inside is dropped, 13.3), and not with one front-runner', () => {
    for (let post = 1; post <= 6; post++) {
      const styles: Style[] = [C, S, S, C, S, C, S, F];
      const totals = [250, 246, 240, 236, 232, 228, 220, 215];
      styles[post - 1] = F; // a second front-runner at this post, in the first three ranks only for posts 1 to 3
      const field = withTotals(styles, post <= 3 ? totals : totals);
      expect(kindsOf([field]), `post ${post}`).not.toContain('K6');
    }
    const lone = withTotals([C, S, S, C, S, C, F, S], [250, 246, 240, 236, 232, 228, 244, 220]);
    expect(kindsOf([lone])).toEqual(['K1']);
  });
  it('NU2: K6 needs rank 3 or better, and the last two posts of a smaller field are its wide posts', () => {
    const rank4 = withTotals([C, S, S, C, S, C, F, F], [250, 246, 244, 236, 232, 228, 240, 220]);
    expect(kindsOf([rank4])).not.toContain('K6');
    const six = withTotals([C, S, S, C, F, F], [250, 246, 240, 236, 244, 220]);
    expect(newsOf([six])[0]).toMatchObject({ kind: 'K6', post: 5 });
  });

  it('NU2: K7 fires for a unique top where K2 did not, and not where K2 did or the top is tied', () => {
    expect(kindsOf([K7_FIELD])).toEqual(['K7']);
    expect(kindsOf([K2_FIELD])).toEqual(['K2']);
    expect(kindsOf([withTotals([C, C, S, F, F, S, C, S], [250, 250, 245, 225, 220, 215, 210, 205])])).toEqual([]);
  });
});

describe('NU3: filling the five slots (3.4)', () => {
  it('NU3: priority K1, K2, K3, K4, K5, K6, K7; the page is in race order; the cover line is the first taken', () => {
    // Races 1 to 6 are K7, K6, K5, K3, K2, K1 in that order of race and the reverse of priority.
    const news = newsOf([K7_FIELD, K6_FIELD, K5_FIELD, K3_FIELD, K2_FIELD, K1_FIELD]);
    // Five of six: K7 (the lowest priority) is left out.
    expect(news.map((i) => [i.race, i.kind])).toEqual([[2, 'K6'], [3, 'K5'], [4, 'K3'], [5, 'K2'], [6, 'K1']]);
    expect(news.map((i) => i.slot)).toEqual([1, 2, 3, 4, 5]);
    expect(news.filter((i) => i.lead).map((i) => i.kind)).toEqual(['K1']);
  });

  it('NU3: one item per race, at most two of a kind, K7 uncapped, five when five exist', () => {
    const news = newsOf([K2_FIELD, K2_FIELD, K2_FIELD, K7_FIELD, K7_FIELD, K7_FIELD, K7_FIELD, K7_FIELD]);
    // Three K2 races: two print (the earlier two), the third prints nothing (K7 never fires where K2 did).
    expect(news.filter((i) => i.kind === 'K2').map((i) => i.race)).toEqual([1, 2]);
    expect(news.filter((i) => i.kind === 'K7').map((i) => i.race)).toEqual([4, 5, 6]);
    expect(news).toHaveLength(5);
    expect(new Set(news.map((i) => i.race)).size).toBe(news.length);
  });

  it('NU3: five K7 items print on a day of K7, in race order (K7 is the filler, uncapped)', () => {
    const news = newsOf(Array.from({ length: 8 }, () => K7_FIELD));
    expect(news.map((i) => i.kind)).toEqual(['K7', 'K7', 'K7', 'K7', 'K7']);
    expect(news.map((i) => i.race)).toEqual([1, 2, 3, 4, 5]);
    expect(news.filter((i) => i.lead)).toHaveLength(1);
  });

  it('NU3: inside K2, the bigger lead first; the cap keeps the two biggest leads', () => {
    const big = K2_FIELD.map((s, i) => (i === 0 ? ([s[0], 290] as Spec) : s));
    const mid = K2_FIELD;
    const small = K2_FIELD.map((s, i) => (i === 0 ? ([s[0], 262] as Spec) : s));
    const news = newsOf([small, mid, big]);
    expect(news.map((i) => i.race)).toEqual([2, 3]);
    expect(news.find((i) => i.lead)!.race).toBe(3);
  });

  it('NU3: inside K1, the bigger front-runner first; ties go to the earlier race', () => {
    const hi = K1_FIELD.map((s, i) => (i === 1 ? ([s[0], 249] as Spec) : s));
    const news = newsOf([K1_FIELD, hi, K1_FIELD, K1_FIELD]);
    expect(news.filter((i) => i.kind === 'K1').map((i) => i.race)).toEqual([1, 2]);
    expect(news.find((i) => i.lead)!.race).toBe(2);
    const tie = newsOf([K1_FIELD, K1_FIELD, K1_FIELD]);
    expect(tie.find((i) => i.lead)!.race).toBe(1);
  });

  it('NU3: inside K3, more front-runners first; inside K6, post 8 before post 7', () => {
    const six = withTotals([C, F, F, F, F, F, F, S], [250, 245, 240, 235, 230, 225, 220, 215]);
    const news = newsOf([K3_FIELD, six]);
    expect(news.find((i) => i.lead)!.race).toBe(2);
    const eight = withTotals([C, S, S, C, S, C, F, F], [250, 246, 240, 236, 232, 228, 220, 244]);
    const k6 = newsOf([K6_FIELD, eight]);
    expect(k6.find((i) => i.lead)!.race).toBe(2);
  });

  it('NU3: a K4 item is skipped when its race already has a higher item, and a horse gives one candidate', () => {
    const soft = [200, 200, 200, 200, 200, 200];
    const hard = [207, 207, 207, 207, 207, 207];
    const rivals = (six: number[]): Spec[] => withTotals([S, S, C, S, C, S, C], [245, ...six]);
    const day = (x: Spec): Parameters<typeof world>[0] => [[[x[0], x[1], 'X'], ...rivals(soft)], [[x[0], x[1], 'X'], ...rivals(hard)]];
    expect(newsOf(day([C, 250])).filter((i) => i.kind === 'K4')).toHaveLength(1);
    // Race 1 replaced by a lone-speed race holding X as the lone front-runner: K1 takes the race, K4 gives it up.
    const lone: Parameters<typeof world>[0] = [
      [[F, 246, 'X'], [C, 250], [S, 240], [C, 238], [S, 236], [C, 230], [S, 228], [C, 226]],
      [[F, 246, 'X'], ...withTotals([S, S, C, S, C, S, C], [245, 207, 207, 207, 207, 207, 207])],
    ];
    const kinds = newsOf(lone).map((i) => [i.race, i.kind]);
    expect(kinds).toContainEqual([1, 'K1']);
    expect(kinds).not.toContainEqual([1, 'K4']);
  });

  it('NU3: fewer than five candidates print what there is; none prints nothing and no cover line', () => {
    expect(newsOf([K7_FIELD, K1_FIELD])).toHaveLength(2);
    expect(newsOf([])).toEqual([]);
    expect(newsOf([withTotals([C, C, S, F, F, S, C, S], [250, 250, 245, 225, 220, 215, 210, 205])])).toEqual([]);
  });

  it('NU3: the terms work on any field size', () => {
    expect(kindsOf([[[C, 300], [S, 200]]])).toEqual(['K2']);
    expect(kindsOf([[[S, 250]]])).toEqual(['K5']);
  });

  it('NU3: a pair is not used twice in a day while the kind has unused ones', () => {
    for (let seed = 0; seed < 40; seed++) {
      const news = newsOf([K2_FIELD, K2_FIELD, K7_FIELD, K7_FIELD], seed);
      const k2 = news.filter((i) => i.kind === 'K2');
      expect(new Set(k2.map((i) => i.headline.replace(/^Race \d: /, ''))).size).toBe(k2.length);
    }
  });
});

describe('NU1: same inputs, same news; the wording draws only the `news` stream', () => {
  const seeds = [0, 1, 99, 12345, 20261113, 4294967295];

  it('NU1: the same day seed gives identical items, order and wording', () => {
    for (const seed of seeds) {
      const input = { daySeed: seed, fields: drawnDay(ctx, seed), stable: ctx.stable };
      expect(newsFor(book, input)).toEqual(newsFor(book, structuredClone(input)));
    }
  });

  it('NU1: `news` is the last betting stream, and the older four keep their places', () => {
    expect([...BET_STREAM_NAMES]).toEqual(['fieldDraw', 'raceSeed', 'estimateSeeds', 'crowd', 'news']);
  });

  it('NU1: the wording is the pair picked by createStream(seed, "news", "day"), one draw an item in the order taken', () => {
    const fields = Array.from({ length: 5 }, () => K7_FIELD);
    for (const seed of seeds) {
      const rng = createStream(seed, 'news', 'day');
      const pairs = book.news.kinds.value.K7.pairs;
      const used = new Set<number>();
      const expected = Array.from({ length: 5 }, () => {
        const fresh = pairs.map((_p, k) => k).filter((k) => !used.has(k));
        const pool = fresh.length > 0 ? fresh : pairs.map((_p, k) => k);
        const k = pool[rng.int(0, pool.length - 1)];
        used.add(k);
        return k;
      });
      const got = newsOf(fields, seed).map((i) => pairs.findIndex((p) => i.headline.endsWith(p.headline)));
      expect(got).toEqual(expected);
    }
  });

  it('NU1: the news changes with the day seed (it is not one fixed page)', () => {
    const pages = new Set(Array.from({ length: 40 }, (_v, s) => JSON.stringify(newsFor(book, { daySeed: s, fields: drawnDay(ctx, s), stable: ctx.stable }))));
    expect(pages.size).toBeGreaterThan(30);
  });
});
