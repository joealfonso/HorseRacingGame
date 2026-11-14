import type { Book } from '../data/bookSchema';
import { fillHoles } from '../data/bookText';
import { distanceWords } from '../data/cardWords';
import type { RaceDay } from '../data/raceDaySchema';
import type { Race } from '../data/schema';
import { wrapWords } from '../data/template';
import type { Stream } from '../sim/rng';
import { betStream, DAY_SUB_KEY } from './streams';

// The news page's five items (docs/specs/book-and-window.md section 4), as a pure function.
// Facts are computed from the day's data and never drawn. Flavor is picked on the `news`
// stream, from the day seed, and nothing else draws from it. Same inputs, same output.

export interface NewsItem {
  /** 1 to 5, top to bottom. Slot 1's headline is also the cover line. */
  slot: number;
  /** "flavor:3" (the index in book.json's flavor list) or "fact:card", "fact:double", "fact:longest". Unique within a day. */
  id: string;
  kind: 'flavor' | 'fact';
  headline: string;
  /** Already wrapped: at most news.layout.bodyLines lines of lineChars. */
  body: string[];
}

/** The part of a finished day that news slot 5 reads. A DayState (or `{ records: dayRecord.races }`) fits. Session only: never saved (SAFE3). */
export interface PreviousDay {
  records: readonly { race: number; horseIds: readonly string[]; winnerPost: number; winnerOdds: string }[];
}

export interface NewsInput {
  daySeed: number;
  /** The day's drawn fields (drawnDay): race 1 up, horse ids by post. */
  fields: readonly { race: number; horseIds: readonly string[] }[];
  stable: readonly { id: string; name: string }[];
  /** day.json's races in order. */
  races: readonly Race[];
  /** raceDay.json copy.card: the program's words for a distance, a surface and a going. */
  cardCopy: RaceDay['copy']['card'];
  /** The previous day's record, or null (a first day, or after a reload). */
  previous: PreviousDay | null;
}

type Fact = { headline: string; body: string[] };

/** A Fisher-Yates shuffle of 0..n-1 on the `news` stream. Always n - 1 draws, whatever the facts are. */
function flavorOrder(n: number, rng: Stream): number[] {
  const order = Array.from({ length: n }, (_v, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Slot 2: today's card from day.json. Says "all ..." only when every race has the same distance, surface and going. */
function cardFact(book: Book, input: NewsInput): Fact {
  const { facts, layout } = { facts: book.news.facts.value, layout: book.news.layout.value };
  const first = input.races[0];
  const same = input.races.every((r) => r.distanceFurlongs === first.distanceFurlongs && r.surface === first.surface && r.going === first.going);
  const n = input.races.length;
  const text = same
    ? fillHoles(facts.card.body, {
      n,
      distance: distanceWords(first.distanceFurlongs, input.cardCopy),
      going: (input.cardCopy.goings as Record<string, string>)[first.going] ?? first.going,
      surface: (input.cardCopy.surfaces as Record<string, string>)[first.surface] ?? first.surface,
    })
    : fillHoles(facts.card.bodyMixed, { n, race1Name: first.name });
  return { headline: facts.card.headline, body: wrapWords(text, layout.lineChars) };
}

/**
 * Slot 3: the two horses with two starts whose first start is earliest, one per line. Ties go to the
 * earlier second start, then the lower post in the first race. Null with fewer than two such horses.
 */
function doubleFact(book: Book, input: NewsInput): Fact | null {
  const names = new Map(input.stable.map((h) => [h.id, h.name]));
  const starts = new Map<string, { races: number[]; post: number }>();
  for (const f of input.fields) {
    f.horseIds.forEach((id, i) => {
      const s = starts.get(id);
      if (s === undefined) starts.set(id, { races: [f.race], post: i + 1 });
      else s.races.push(f.race);
    });
  }
  const twice = [...starts.entries()]
    .filter(([id, s]) => s.races.length >= 2 && names.has(id))
    .map(([id, s]) => ({ name: names.get(id)!, a: s.races[0], b: s.races[1], post: s.post }))
    .sort((x, y) => x.a - y.a || x.b - y.b || x.post - y.post);
  if (twice.length < 2) return null;
  const { double } = book.news.facts.value;
  return { headline: double.headline, body: twice.slice(0, 2).map((h) => fillHoles(double.line, { name: h.name, a: h.a, b: h.b })) };
}

/** Odds labels are "n-d": compare n/d by cross-multiplying. Positive when a is longer than b. */
export function compareOdds(a: string, b: string): number {
  const parse = (label: string): [number, number] => {
    const m = /^(\d+)-(\d+)$/.exec(label);
    if (m === null) throw new Error(`odds label "${label}" is not n-d`);
    return [Number(m[1]), Number(m[2])];
  };
  const [an, ad] = parse(a);
  const [bn, bd] = parse(b);
  return an * bd - bn * ad;
}

/** Slot 5: the previous day's longest-priced winner, with its race and odds from that day's record. Null with no day, or no winner found. Ties keep the earlier race. */
function longestFact(book: Book, input: NewsInput): Fact | null {
  if (input.previous === null) return null;
  const names = new Map(input.stable.map((h) => [h.id, h.name]));
  let best: { name: string; race: number; odds: string } | null = null;
  for (const r of input.previous.records) {
    const name = names.get(r.horseIds[r.winnerPost - 1]);
    if (name === undefined) continue;
    if (best === null || compareOdds(r.winnerOdds, best.odds) > 0) best = { name, race: r.race, odds: r.winnerOdds };
  }
  if (best === null) return null;
  const { longest } = book.news.facts.value;
  return { headline: longest.headline, body: wrapWords(fillHoles(longest.body, { name: best.name, r: best.race, odds: best.odds }), book.news.layout.value.lineChars) };
}

/**
 * The day's five items (NW1, NW2, NW4). Flavor is the pool shuffled once on the `news` stream; slots
 * that want flavor take it in slot order first, then the facts that have nothing true to say fall back
 * to the next ones, so a fact being absent never changes another slot's flavor.
 */
export function newsFor(book: Book, input: NewsInput): NewsItem[] {
  const { slots, flavor } = { slots: book.news.slots.value, flavor: book.news.flavor.value };
  const wrap = (text: string): string[] => wrapWords(text, book.news.layout.value.lineChars);
  const order = flavorOrder(flavor.length, betStream(input.daySeed, 'news', DAY_SUB_KEY));
  let next = 0;
  const drawFlavor = (slot: number): NewsItem => {
    const i = order[next++];
    return { slot, id: `flavor:${i}`, kind: 'flavor', headline: flavor[i].headline, body: wrap(flavor[i].body) };
  };
  const factOf = (source: string): Fact | null => {
    if (source === 'card') return cardFact(book, input);
    if (source === 'double') return doubleFact(book, input);
    if (source === 'longest') return longestFact(book, input);
    return null;
  };

  const items: (NewsItem | null)[] = slots.map((s, i) => {
    if (s.source === 'flavor') return drawFlavor(i + 1);
    const f = factOf(s.source);
    return f === null ? null : { slot: i + 1, id: `fact:${s.source}`, kind: 'fact', headline: f.headline, body: f.body };
  });
  return items.map((item, i) => item ?? drawFlavor(i + 1));
}
