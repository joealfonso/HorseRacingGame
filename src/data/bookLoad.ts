import type { z } from 'zod';
import betting from './betting.json';
import book from './book.json';
import day from './day.json';
import hub from './hub.json';
import raceDay from './raceDay.json';
import stable from './stable.json';
import { bookSchema, NEWS_SOURCES, type Book } from './bookSchema';
import { bannedWordIn, fillHoles, holesOf } from './bookText';
import { distanceWords } from './cardWords';
import type { RaceDay } from './raceDaySchema';
import type { Race } from './schema';
import { SCREEN } from './hubLoad';
import type { Box } from './hubSchema';
import { wrapWords } from './template';
import { DataError, type DataIssue } from './validate';

// Loads and checks the book's data (docs/specs/book-and-window.md sections 3, 4, 13, 14 and
// 18): NW3, CV1 as the art-director amended it (the track name fits the display font, at most
// 19 characters), and every copy limit. Takes plain objects, so tests can hand it broken data.
// Every problem in book.json is reported at once, each with its field, as the other loaders do.

const FILE = 'src/data/book.json';
const PRINTABLE = /^[\x20-\x7E]*$/;
const MAIN_W = 8;

export interface BookInput {
  book: unknown;
  /** betting.json's copy.bannedWords plus hub.json's copy.bannedWords. The book's own list is added. */
  bannedWords: readonly string[];
  /** day.json's races: the cover's track name is race 1's, and the card fact is filled from them. */
  races: readonly Pick<Race, 'name' | 'track' | 'distanceFurlongs'>[];
  /** Every stable horse's name: the fact templates are filled with each. */
  horseNames: readonly string[];
  /** Every odds label a price can print (betting.json odds.steps). */
  oddsLabels: readonly string[];
  /** Most horses in a field (betting.json field.size): "Winner: #{n}" is filled with each post. */
  fieldSize: number;
  /** raceDay.json copy.card: the program's words for a distance, a surface and a going. */
  cardCopy: RaceDay['copy']['card'];
}

const formatPath = (path: PropertyKey[]): string =>
  path.length === 0 ? '(whole file)' : path.reduce<string>((out, p) => (typeof p === 'number' ? `${out}[${p}]` : out ? `${out}.${String(p)}` : String(p)), '');

function parse<T extends z.ZodType>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  throw new DataError(FILE, result.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message })));
}

type Add = (path: string, message: string) => void;

const showBox = (b: Box): string => `x${b.x0}-${b.x1}, y${b.y0}-${b.y1}`;
const inside = (b: Box, outer: Box): boolean => b.x0 >= outer.x0 && b.x1 <= outer.x1 && b.y0 >= outer.y0 && b.y1 <= outer.y1;
const overlap = (a: Box, b: Box): boolean => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
const range = (n: number): number[] => Array.from({ length: n }, (_v, i) => i + 1);

/** Checks and returns the book's data, or throws a DataError naming the file and field of every problem. */
export function validateBook(raw: BookInput): Book {
  const b = parse(bookSchema, raw.book);
  const issues: DataIssue[] = [];
  const add: Add = (path, message) => issues.push({ path, message });
  const banned = [...raw.bannedWords, ...b.news.bannedWords.value];
  const bannedChars = b.news.bannedChars.value;
  const raceCount = raw.races.length;
  const raceNumbers = range(raceCount).map(String);

  /** Holes known, printable, no banned word or character, and within `max` characters once filled with its worst cases. */
  const line = (path: string, template: string, max: number, holes: Record<string, readonly (string | number)[]> = {}) => {
    for (const h of holesOf(template)) if (!(h in holes)) add(path, `has an unknown hole {${h}}`);
    if (!PRINTABLE.test(template)) add(path, 'must be printable ASCII (the main font has no other glyphs)');
    const word = bannedWordIn(template, banned);
    if (word !== null) add(path, `"${template}" contains the banned word "${word}"`);
    for (const c of bannedChars) if (template.includes(c)) add(path, `"${template}" contains "${c}", which the book never prints`);
    let widest = template;
    for (const filled of fills(template, holes)) if (filled.length > widest.length) widest = filled;
    if (widest.length > max) add(path, `"${widest}" is ${widest.length} characters; at most ${max}`);
  };

  checkCover(b, raw, line, add);
  checkNews(b, raw, line, add, raceNumbers);
  checkRacePage(b, raw, line);
  checkFoot(b, raceNumbers, line, add);
  if (issues.length > 0) throw new DataError(FILE, issues);

  // CV1, amended in 18.1 item 3 and 18.2: race 1's track name in the display font.
  const track = raw.races[0]?.track;
  if (track !== undefined) {
    const d = b.cover.display.value;
    const problems: DataIssue[] = [];
    if (track.length > d.trackMaxChars) {
      problems.push({ path: 'races[0].track', message: `"${track}" is ${track.length} characters; the cover's masthead fits ${d.trackMaxChars} (${FILE} cover.display.value.trackMaxChars)` });
    }
    const missing = [...new Set(track.toUpperCase())].filter((c) => !d.glyphs.includes(c));
    if (missing.length > 0) {
      problems.push({ path: 'races[0].track', message: `"${track}" has ${missing.map((c) => `"${c}"`).join(', ')}, which the display font lacks (${FILE} cover.display.value.glyphs)` });
    }
    if (problems.length > 0) throw new DataError('src/data/day.json', problems);
  }
  return b;
}

/** Every value a template can take: the product of its holes' candidate values. */
function fills(template: string, holes: Record<string, readonly (string | number)[]>): string[] {
  const used = [...new Set(holesOf(template))].filter((h) => h in holes);
  let out: Record<string, string | number>[] = [{}];
  for (const h of used) out = out.flatMap((o) => holes[h].map((v) => ({ ...o, [h]: v })));
  return out.map((o) => fillHoles(template, o));
}

type Line = (path: string, template: string, max: number, holes?: Record<string, readonly (string | number)[]>) => void;

function checkCover(b: Book, raw: BookInput, line: Line, add: Add): void {
  const c = b.cover;
  const lim = c.limits.value;
  line('cover.title.value', c.title.value, lim.title);
  line('cover.dayLabel.value', c.dayLabel.value, 3);
  line('cover.dayNumber.value', c.dayNumber.value, 11, { seed: ['4294967295'] });
  line('cover.races.value', c.races.value, lim.races, { n: [raw.races.length] });
  line('cover.aria.value', c.aria.value, Infinity, { label: [c.dayLabel.value], number: ['#4294967295'] });
  const l = c.layout.value;
  if (!inside(l.keyline, l.masthead)) add('cover.layout.value.keyline', `${showBox(l.keyline)} is not inside the masthead (${showBox(l.masthead)})`);
  if (!inside(l.picture, { x0: 0, y0: 0, x1: SCREEN.w - 1, y1: SCREEN.h - 1 })) add('cover.layout.value.picture', `${showBox(l.picture)} is not inside the 256x240 screen`);
  if (c.display.value.glyphs.length !== new Set(c.display.value.glyphs).size) add('cover.display.value.glyphs', 'lists a glyph twice');
  if (c.display.value.glyphs !== c.display.value.glyphs.toUpperCase()) add('cover.display.value.glyphs', 'must be capitals only, the code upper-cases');
  const nameWidth = c.display.value.trackMaxChars * c.display.value.cellW;
  const room = l.keyline.x1 - l.keyline.x0 + 1;
  if (nameWidth > room) add('cover.display.value.trackMaxChars', `${c.display.value.trackMaxChars} characters are ${nameWidth} px; the keyline holds ${room}`);
}

function checkNews(b: Book, raw: BookInput, line: Line, add: Add, raceNumbers: readonly string[]): void {
  const n = b.news;
  const lay = n.layout.value;
  line('news.title.value', n.title.value, lay.titleChars);
  line('news.subtitle.value', n.subtitle.value, lay.subtitleChars);

  // Wraps to at most bodyLines lines of lineChars, as the page draws it.
  const body = (path: string, text: string) => {
    const lines = wrapWords(text, lay.lineChars);
    if (lines.length > lay.bodyLines) add(path, `"${text}" wraps to ${lines.length} lines of ${lay.lineChars}; at most ${lay.bodyLines}`);
    else for (const l of lines) if (l.length > lay.lineChars) add(path, `the word in "${l}" is over ${lay.lineChars} characters`);
  };
  const names = raw.horseNames;
  const facts = n.facts.value;
  const flavor = n.flavor.value;
  const longestHoles = { name: names, r: raceNumbers, odds: raw.oddsLabels };
  const doubleHoles = { name: names, a: raceNumbers, b: raceNumbers };

  // NW3: every fact template, filled with every horse, odds label and race number.
  const fact = (path: string, template: string, holes: Record<string, readonly (string | number)[]>, asBody: boolean) => {
    line(path, template, Infinity, holes);
    if (!asBody) return;
    for (const filled of fills(template, holes)) {
      const lines = wrapWords(filled, lay.lineChars);
      if (lines.length > lay.bodyLines || lines.some((l) => l.length > lay.lineChars)) {
        add(path, `"${filled}" needs more than ${lay.bodyLines} lines of ${lay.lineChars}`);
        return;
      }
    }
  };
  const cardHoles = {
    n: [raw.races.length],
    distance: [...new Set([...raw.races.map((r) => r.distanceFurlongs), ...range(20)].map((f) => distanceWords(f, raw.cardCopy)))],
    going: Object.values(raw.cardCopy.goings),
    surface: Object.values(raw.cardCopy.surfaces),
  };
  fact('news.facts.value.card.body', facts.card.body, cardHoles, true);
  fact('news.facts.value.card.bodyMixed', facts.card.bodyMixed, { n: [raw.races.length], race1Name: raw.races.map((r) => r.name) }, true);
  fact('news.facts.value.longest.body', facts.longest.body, longestHoles, true);
  // One horse to a line, each line a whole line of its own.
  line('news.facts.value.double.line', facts.double.line, lay.lineChars, doubleHoles);
  if (lay.bodyLines < 2) add('news.layout.value.bodyLines', 'the two-starts item prints two lines; at least 2');

  const headlines: { path: string; text: string; cover: boolean }[] = [
    { path: 'news.facts.value.card.headline', text: facts.card.headline, cover: false },
    { path: 'news.facts.value.double.headline', text: facts.double.headline, cover: false },
    { path: 'news.facts.value.longest.headline', text: facts.longest.headline, cover: false },
    ...flavor.map((f, i) => ({ path: `news.flavor.value[${i}].headline`, text: f.headline, cover: true })),
  ];
  const coverLine = b.cover.limits.value.line;
  for (const h of headlines) {
    line(h.path, h.text, h.cover ? Math.min(lay.headlineChars, coverLine) : lay.headlineChars);
    if (holesOf(h.text).length > 0) add(h.path, 'a headline has no fills');
  }
  flavor.forEach((f, i) => {
    const at = `news.flavor.value[${i}].body`;
    // A flavor item never names a horse, a post, a race or a price: no fill at all.
    if (holesOf(f.body).length > 0) add(at, `has a fill {${holesOf(f.body)[0]}}; a flavor item has none`);
    line(at, f.body, Infinity);
    body(at, f.body);
    if (!PRINTABLE.test(f.headline)) add(`news.flavor.value[${i}].headline`, 'must be printable ASCII');
  });
  // No item repeats within a day: no two headlines alike.
  const seen = new Map<string, string>();
  for (const h of headlines) {
    const key = h.text.toLowerCase();
    const first = seen.get(key);
    if (first !== undefined) add(h.path, `"${h.text}" repeats ${first}`);
    else seen.set(key, h.path);
  }

  // The slots (spec section 4): five, each fact once, flavor enough for every slot that can fall back to it.
  const slots = n.slots.value;
  const used = new Map<string, number>();
  let flavorNeeded = 0;
  slots.forEach((s, i) => {
    if (!NEWS_SOURCES.includes(s.source)) add(`news.slots.value[${i}].source`, `unknown source "${s.source}"`);
    if (s.source !== 'flavor') {
      const first = used.get(s.source);
      if (first !== undefined) add(`news.slots.value[${i}].source`, `"${s.source}" repeats news.slots.value[${first}]`);
      else used.set(s.source, i);
    }
    if (s.source === 'flavor') {
      if (s.fallback !== null) add(`news.slots.value[${i}].fallback`, 'a flavor slot has no fallback');
      flavorNeeded++;
    } else if (s.fallback !== null) flavorNeeded++;
  });
  if (slots.length !== 5) add('news.slots.value', `has ${slots.length} slots; five items print every day`);
  if (slots[0] !== undefined && slots[0].source !== 'flavor') add('news.slots.value[0].source', 'slot 1 is flavor: its headline is the cover line');
  if (flavor.length < flavorNeeded) add('news.flavor.value', `has ${flavor.length} items; ${flavorNeeded} are needed so five distinct items always print`);
  const bottom = lay.firstTop + lay.pitch * (slots.length - 1) + Math.max(...lay.bodyTops) + 8 - 1;
  if (bottom >= lay.ruleTops[1]) add('news.layout.value', `the last item ends at y${bottom}, over the rule at y${lay.ruleTops[1]}`);
}

function checkRacePage(b: Book, raw: BookInput, line: Line): void {
  const r = b.racePage;
  const max = r.rightChars.value;
  line('racePage.toWindow.value', r.toWindow.value, max);
  line('racePage.winner.value', r.winner.value, max, { n: range(raw.fieldSize) });
  line('racePage.later.value', r.later.value, max);
  // Read aloud only, so no width; every hole must be known.
  const one = ['x'];
  line('racePage.ariaEntry.value', r.ariaEntry.value, Infinity, {
    n: one, name: one, style: one, speedHead: one, speed: one, staminaHead: one, stamina: one, kickHead: one, kick: one, oddsHead: one, odds: one,
  });
}

function checkFoot(b: Book, raceNumbers: readonly string[], line: Line, add: Add): void {
  const f = b.foot;
  const max = f.pageChars.value;
  const pages = f.pages.value;
  // The page name is filled first ("Race {r}"), then goes into "< {page}".
  const names = [pages.cover, pages.news, ...raceNumbers.map((r) => fillHoles(pages.race, { r }))];
  line('foot.pages.value.race', pages.race, max, { r: raceNumbers });
  line('foot.prev.value', f.prev.value, max, { page: names });
  line('foot.next.value', f.next.value, max, { page: names });
  line('foot.pages.value.cover', pages.cover, max);
  line('foot.pages.value.news', pages.news, max);
  const l = f.layout.value;
  const closeW = l.closeText.x1 - l.closeText.x0 + 1;
  line('foot.close.value', f.close.value, Math.floor(closeW / MAIN_W));
  const screen: Box = { x0: 0, y0: 0, x1: SCREEN.w - 1, y1: SCREEN.h - 1 };
  const targets = [['prevTarget', l.prevTarget], ['closeTarget', l.closeTarget], ['nextTarget', l.nextTarget]] as const;
  targets.forEach(([key, box], i) => {
    if (!inside(box, screen)) add(`foot.layout.value.${key}`, `${showBox(box)} is not inside the 256x240 screen`);
    for (let j = 0; j < i; j++) if (overlap(box, targets[j][1])) add(`foot.layout.value.${key}`, `${showBox(box)} overlaps ${targets[j][0]} (${showBox(targets[j][1])})`);
  });
  if (!inside(l.closeText, l.closeTarget)) add('foot.layout.value.closeText', `${showBox(l.closeText)} is not inside closeTarget (${showBox(l.closeTarget)})`);
}

// The only place book.json is read.
export const loadBook = (): Book => validateBook({
  book,
  bannedWords: [...betting.copy.bannedWords, ...hub.copy.bannedWords],
  races: day.races,
  horseNames: stable.horses.map((h) => h.name),
  oddsLabels: betting.odds.steps.value.map((s) => s.label),
  fieldSize: betting.field.size.value,
  cardCopy: raceDay.copy.card,
});
