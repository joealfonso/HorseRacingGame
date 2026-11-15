import type { Book, NewsKind } from '../data/bookSchema';
import { fillHoles } from '../data/bookText';
import type { StableHorse } from '../data/bettingSchema';
import { wrapWords } from '../data/template';
import { betStream, DAY_SUB_KEY } from './streams';

// The news page (docs/specs/book-useful.md sections 3 and 13): up to five items, each a true hint
// about one race, computed from the day's drawn fields, the stats, the styles and the posts. It
// never reads the estimate or the prices. The only draw is the wording: one pick of a headline and
// body pair per printed item, on the `news` stream from the day seed. Same inputs, same output.

export interface NewsItem {
  /** 1 up, in page order (race order). */
  slot: number;
  /** Unique within a day: "K2:3" is the class item on race 3. */
  id: string;
  kind: NewsKind;
  /** The race the item heads: the softer race for the easier-crowd item. */
  race: number;
  /** The horse the item names, and its post in `race`. */
  horseId: string;
  post: number;
  /** True for the first item taken (the highest priority): its headline is the cover line. */
  lead: boolean;
  /** "Race 5: Five want the lead", at most news.layout.headlineChars. */
  headline: string;
  /** Already wrapped: at most news.layout.bodyLines lines of lineChars. */
  body: string[];
}

export interface NewsInput {
  daySeed: number;
  /** The day's drawn fields (drawnDay): race 1 up, horse ids by post. */
  fields: readonly { race: number; horseIds: readonly string[] }[];
  /** Every stable horse: the news reads its name, style and three stats and nothing else. */
  stable: readonly Pick<StableHorse, 'id' | 'name' | 'style' | 'stats'>[];
}

/** One horse in one field. `rank` is its place by total, 1 = highest, ties sharing the better. */
interface Entry {
  id: string;
  name: string;
  post: number;
  style: StableHorse['style'];
  total: number;
  rank: number;
}

/** Section 3.1's terms for one field. */
interface Field {
  race: number;
  entries: Entry[];
  sum: number;
  fronts: number;
  /** The top entry, with a unique top total, or null when two tie at the top. */
  top: Entry | null;
}

interface Candidate {
  kind: NewsKind;
  race: number;
  entry: Entry;
  /** Sort keys inside a kind, larger first (3.4 step 3). */
  keys: number[];
  /** K4 only: the rivals' difference as a fraction, for the sort. */
  frac?: { num: number; den: number };
}

const totalOf = (h: Pick<StableHorse, 'stats'>): number => h.stats.speed + h.stats.stamina + h.stats.kick;

function fieldOf(race: number, horseIds: readonly string[], byId: ReadonlyMap<string, Pick<StableHorse, 'id' | 'name' | 'style' | 'stats'>>): Field {
  const entries = horseIds.map((id, i): Entry => {
    const h = byId.get(id);
    if (h === undefined) throw new Error(`race ${race}: horse "${id}" is not in the stable`);
    return { id, name: h.name, post: i + 1, style: h.style, total: totalOf(h), rank: 0 };
  });
  for (const e of entries) e.rank = 1 + entries.filter((x) => x.total > e.total).length;
  const sorted = [...entries].sort((a, b) => b.total - a.total);
  const unique = sorted.length > 0 && (sorted.length === 1 || sorted[0].total > sorted[1].total);
  return {
    race,
    entries,
    sum: entries.reduce((s, e) => s + e.total, 0),
    fronts: entries.filter((e) => e.style === 'frontRunner').length,
    top: unique ? sorted[0] : null,
  };
}

/** The best entry of a style by total, ties to the lower post, or null with none. */
function bestOf(f: Field, style: StableHorse['style']): Entry | null {
  let best: Entry | null = null;
  for (const e of f.entries) if (e.style === style && (best === null || e.total > best.total)) best = e;
  return best;
}

/** All of every kind's candidates (3.4 step 1), unsorted. */
function candidates(book: Book, fields: readonly Field[]): Candidate[] {
  const K = book.news.kinds.value;
  const out: Candidate[] = [];
  const classRaces = new Set<number>();

  for (const f of fields) {
    const n = f.entries.length;
    // K2: a unique top, lead = top minus the field's mean (itself included) at least leadMin, gap at least gapMin.
    if (f.top !== null && n > 1) {
      const second = Math.max(...f.entries.filter((e) => e !== f.top).map((e) => e.total));
      if (f.top.total * n - f.sum >= K.K2.leadMin * n && f.top.total - second >= K.K2.gapMin) {
        classRaces.add(f.race);
        out.push({ kind: 'K2', race: f.race, entry: f.top, keys: [(f.top.total * n - f.sum) / n] });
      }
    }
    // K1: one front-runner, rank at most frontRankMax.
    const front = f.entries.find((e) => e.style === 'frontRunner');
    if (f.fronts === 1 && front !== undefined && front.rank <= K.K1.frontRankMax) out.push({ kind: 'K1', race: f.race, entry: front, keys: [front.total] });
    // K3: fronts at least frontsMin (and a word for the count), the top closer's rank at most closerRankMax.
    if (f.fronts >= K.K3.frontsMin) {
      const closer = bestOf(f, 'closer');
      if (closer !== null && closer.rank <= K.K3.closerRankMax) out.push({ kind: 'K3', race: f.race, entry: closer, keys: [f.fronts, closer.total] });
    }
    // K5: no front-runner, the top stalker's rank at most stalkerRankMax.
    if (f.fronts === 0) {
      const stalker = bestOf(f, 'stalker');
      if (stalker !== null && stalker.rank <= K.K5.stalkerRankMax) out.push({ kind: 'K5', race: f.race, entry: stalker, keys: [stalker.total] });
    }
    // K6: a front-runner of rank at most frontRankMax in a field of frontsMin or more, drawn in the last widePosts posts. Post 8 before 7, then total.
    if (f.fronts >= K.K6.frontsMin) {
      for (const e of f.entries) {
        if (e.style === 'frontRunner' && e.rank <= K.K6.frontRankMax && e.post > n - K.K6.widePosts) out.push({ kind: 'K6', race: f.race, entry: e, keys: [e.post, e.total] });
      }
    }
  }
  // K7: a unique top total where class above did not fire.
  for (const f of fields) {
    if (f.top !== null && f.entries.length > 1 && !classRaces.has(f.race)) {
      out.push({ kind: 'K7', race: f.race, entry: f.top, keys: [(f.top.total * f.entries.length - f.sum) / f.entries.length] });
    }
  }
  out.push(...easierCrowd(book, fields));
  return out;
}

/** K4: a horse that runs twice, the rivals' means of its two races differ by diffMin or more, and its rank in the softer race is at most rankMax. */
function easierCrowd(book: Book, fields: readonly Field[]): Candidate[] {
  const { diffMin, rankMax } = book.news.kinds.value.K4;
  const starts = new Map<string, { f: Field; e: Entry }[]>();
  for (const f of fields) for (const e of f.entries) starts.set(e.id, [...(starts.get(e.id) ?? []), { f, e }]);
  const out: Candidate[] = [];
  for (const list of starts.values()) {
    if (list.length < 2) continue;
    const [a, b] = list;
    // Rivals' means as fractions: (sum - own) / (n - 1). Compared by cross-multiplying, so it stays in whole numbers.
    const an = a.f.sum - a.e.total, ad = a.f.entries.length - 1;
    const bn = b.f.sum - b.e.total, bd = b.f.entries.length - 1;
    if (ad === 0 || bd === 0) continue;
    const gap = an * bd - bn * ad;
    const softer = gap <= 0 ? a : b;
    const num = Math.abs(gap);
    const den = ad * bd;
    if (num < diffMin * den || softer.e.rank > rankMax) continue;
    out.push({ kind: 'K4', race: softer.f.race, entry: softer.e, keys: [], frac: { num, den } });
  }
  return out;
}

/** 3.4 step 3: inside a kind by its keys (larger first), then the earlier race, then the lower post. */
function compare(a: Candidate, b: Candidate): number {
  if (a.frac !== undefined && b.frac !== undefined) {
    const d = b.frac.num * a.frac.den - a.frac.num * b.frac.den;
    if (d !== 0) return d;
  }
  for (let i = 0; i < Math.max(a.keys.length, b.keys.length); i++) {
    const d = (b.keys[i] ?? 0) - (a.keys[i] ?? 0);
    if (d !== 0) return d;
  }
  return a.race - b.race || a.entry.post - b.entry.post;
}

/**
 * 3.4: candidates in priority order, taken greedily until `slots` are taken, skipping any whose race
 * already has an item and any kind past its cap.
 */
function take(book: Book, all: readonly Candidate[]): Candidate[] {
  const n = book.news;
  const taken: Candidate[] = [];
  const usedRaces = new Set<number>();
  const perKind = new Map<NewsKind, number>();
  for (const kind of n.priority.value) {
    const cap = n.kinds.value[kind].cap;
    for (const c of all.filter((x) => x.kind === kind).sort(compare)) {
      if (taken.length >= n.slots.value) return taken;
      if (usedRaces.has(c.race) || (cap !== null && (perKind.get(kind) ?? 0) >= cap)) continue;
      taken.push(c);
      usedRaces.add(c.race);
      perKind.set(kind, (perKind.get(kind) ?? 0) + 1);
    }
  }
  return taken;
}

/**
 * The day's items in page order (race order). The first taken is marked `lead`: its headline is the
 * cover line. Wording: one draw on the `news` stream per item, in the order taken, among the kind's
 * pairs not yet used that day (all of them again if the day used them all).
 */
export function newsFor(book: Book, input: NewsInput): NewsItem[] {
  const byId = new Map(input.stable.map((h) => [h.id, h]));
  const fields = input.fields.map((f) => fieldOf(f.race, f.horseIds, byId));
  const taken = take(book, candidates(book, fields));
  const rng = betStream(input.daySeed, 'news', DAY_SUB_KEY);
  const layout = book.news.layout.value;
  const used = new Set<string>();

  const items = taken.map((c, i): NewsItem => {
    const pairs = book.news.kinds.value[c.kind].pairs;
    const fresh = pairs.map((_p, k) => k).filter((k) => !used.has(`${c.kind}:${k}`));
    const pool = fresh.length > 0 ? fresh : pairs.map((_p, k) => k);
    const k = pool[rng.int(0, pool.length - 1)];
    used.add(`${c.kind}:${k}`);
    const fills = { name: c.entry.name, post: c.entry.post, soft: c.race, k: book.news.count.value[String(fieldFronts(fields, c.race))] ?? '' };
    const headline = `${fillHoles(book.news.prefix.value, { r: c.race })} ${fillHoles(pairs[k].headline, fills)}`;
    return {
      slot: 0, id: `${c.kind}:${c.race}`, kind: c.kind, race: c.race, horseId: c.entry.id, post: c.entry.post, lead: i === 0, headline,
      body: wrapWords(fillHoles(pairs[k].body, fills), layout.lineChars),
    };
  });
  return items.sort((a, b) => a.race - b.race).map((item, i) => ({ ...item, slot: i + 1 }));
}

const fieldFronts = (fields: readonly Field[], race: number): number => fields.find((f) => f.race === race)?.fronts ?? 0;
