import type { z } from 'zod';
import betting from './betting.json';
import book from './book.json';
import day from './day.json';
import hub from './hub.json';
import raceDay from './raceDay.json';
import stable from './stable.json';
import { bookSchema, NEWS_KINDS, type Book, type NewsKind } from './bookSchema';
import { bannedWordIn, fillHoles, holesOf } from './bookText';
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
/** Header line 4 of a program page (raceDayLoad's PROGRAM_LINE_CHARS), and the 13 its bias phrases already use (book-useful.md section 6). */
const PROGRAM_LINE_CHARS = 30;
const PACE_CHARS = 13;

export interface BookInput {
  book: unknown;
  /** betting.json's copy.bannedWords plus hub.json's copy.bannedWords. The book's own list is added. */
  bannedWords: readonly string[];
  /** day.json's races: the cover's track name is race 1's, and the race page's header line 4 is made from each. */
  races: readonly (Pick<Race, 'name' | 'track'> & { surface: string; going: string })[];
  /** Every stable horse's name: the news pairs are filled with each. */
  horseNames: readonly string[];
  /** Most horses in a field (betting.json field.size): "Winner: #{n}" and the posts are filled with each. */
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
  checkRacePage(b, raw, line, add);
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

/** The holes a kind's pairs may use: headline, then body. {r} is the prefix's, filled by code. */
const PAIR_HOLES: Record<NewsKind, { headline: readonly string[]; body: readonly string[] }> = {
  K1: { headline: [], body: ['name'] },
  K2: { headline: [], body: ['name'] },
  K3: { headline: ['k'], body: ['name'] },
  K4: { headline: [], body: ['name', 'soft'] },
  K5: { headline: [], body: ['name'] },
  K6: { headline: [], body: ['name', 'post'] },
  K7: { headline: [], body: ['name'] },
};

function checkNews(b: Book, raw: BookInput, line: Line, add: Add, raceNumbers: readonly string[]): void {
  const n = b.news;
  const lay = n.layout.value;
  line('news.title.value', n.title.value, lay.titleChars);
  line('news.subtitle.value', n.subtitle.value, lay.subtitleChars);
  line('news.prefix.value', n.prefix.value, lay.headlineChars, { r: raceNumbers });
  for (const [count, word] of Object.entries(n.count.value)) line(`news.count.value.${count}`, word, lay.headlineChars);
  // Crowded lead names a closer, so its field has at most fieldSize - 1 front-runners: each count needs its word.
  for (let k = n.kinds.value.K3.frontsMin; k < raw.fieldSize; k++) {
    if (!(String(k) in n.count.value)) add(`news.count.value.${k}`, `missing: a field with ${k} front-runners and a closer can print the crowded-lead item`);
  }

  // NU4: every pair, filled with every stable name, race number, post and count, fits.
  const values: Record<string, readonly (string | number)[]> = {
    name: raw.horseNames, soft: raceNumbers, post: range(raw.fieldSize), k: Object.values(n.count.value), r: raceNumbers,
  };
  const only = (keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, values[k]]));
  const prefixWidth = n.prefix.value.replace('{r}', String(raw.races.length)).length + 1;
  const coverLine = b.cover.limits.value.line;
  const kinds = n.kinds.value;
  for (const kind of NEWS_KINDS) {
    const at = `news.kinds.value.${kind}`;
    if (!n.priority.value.includes(kind)) add('news.priority.value', `is missing ${kind}`);
    if (kinds[kind].cap !== null && kinds[kind].cap! > n.slots.value) add(`${at}.cap`, `${kinds[kind].cap} is more than the ${n.slots.value} items a day`);
    const seen = new Set<string>();
    kinds[kind].pairs.forEach((p, i) => {
      const hAt = `${at}.pairs[${i}].headline`;
      const bAt = `${at}.pairs[${i}].body`;
      // The headline with its prefix: at most headlineChars (and so at most the cover line's).
      const room = Math.min(lay.headlineChars, coverLine) - prefixWidth;
      line(hAt, p.headline, room, only(PAIR_HOLES[kind].headline));
      if (seen.has(p.headline.toLowerCase())) add(hAt, `"${p.headline}" repeats an earlier pair of ${kind}`);
      seen.add(p.headline.toLowerCase());
      const holes = only(PAIR_HOLES[kind].body);
      line(bAt, p.body, Infinity, holes);
      for (const filled of fills(p.body, holes)) {
        const lines = wrapWords(filled, lay.lineChars);
        if (lines.length > lay.bodyLines || lines.some((l) => l.length > lay.lineChars)) {
          add(bAt, `"${filled}" needs more than ${lay.bodyLines} lines of ${lay.lineChars}`);
          break;
        }
      }
    });
  }
  const listed = new Set<string>();
  n.priority.value.forEach((k, i) => {
    if (listed.has(k)) add(`news.priority.value[${i}]`, `${k} is listed twice`);
    listed.add(k);
  });

  const slots = n.slots.value;
  const bottom = lay.firstTop + lay.pitch * (slots - 1) + Math.max(...lay.bodyTops) + 8 - 1;
  if (bottom >= lay.ruleTops[1]) add('news.layout.value', `the last item ends at y${bottom}, over the rule at y${lay.ruleTops[1]}`);
  if (lay.bodyLines > lay.bodyTops.length) add('news.layout.value.bodyLines', `${lay.bodyLines} lines, but only ${lay.bodyTops.length} body tops`);
}

function checkRacePage(b: Book, raw: BookInput, line: Line, add: Add): void {
  const r = b.racePage;
  const max = r.rightChars.value;
  line('racePage.toWindow.value', r.toWindow.value, max);
  line('racePage.winner.value', r.winner.value, max, { n: range(raw.fieldSize) });
  line('racePage.later.value', r.later.value, max);
  // Header line 4 while the bias is fair: "{Surface}, {going}, {pace}", at most 30, for every race of the day and every count.
  const { none, some } = r.pace.value;
  line('racePage.pace.value.none', none, PACE_CHARS);
  line('racePage.pace.value.some', some, PACE_CHARS, { k: range(raw.fieldSize) });
  const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
  for (const race of raw.races) {
    for (const phrase of [none, ...range(raw.fieldSize).map((k) => fillHoles(some, { k }))]) {
      const l4 = [cap((raw.cardCopy.surfaces as Record<string, string>)[race.surface] ?? race.surface), (raw.cardCopy.goings as Record<string, string>)[race.going] ?? race.going, phrase].join(', ');
      if (l4.length > PROGRAM_LINE_CHARS) add('racePage.pace.value', `"${l4}" is ${l4.length} characters; header line 4 holds ${PROGRAM_LINE_CHARS}`);
    }
  }
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
  fieldSize: betting.field.size.value,
  cardCopy: raceDay.copy.card,
});
