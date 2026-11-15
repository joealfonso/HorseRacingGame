import { describe, expect, it } from 'vitest';
import bettingJson from './betting.json';
import bookJson from './book.json';
import dayJson from './day.json';
import hubJson from './hub.json';
import raceDayJson from './raceDay.json';
import stableJson from './stable.json';
import { loadBook, validateBook, type BookInput } from './bookLoad';
import { bannedWordIn, fillHoles, holesOf } from './bookText';
import { wrapWords } from './template';
import { DataError } from './validate';
import { DISPLAY_CHARS } from '../render/fontLayout';

// The book's data loader: NU4 (book-useful.md, replacing NW3), the data half of CV1 (as amended in spec 18: 19 characters in the
// display font) and the copy limits of spec section 13. Each fails at load with the file and the field.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;
const base = (book: Raw, races: Raw = dayJson.races): BookInput => ({
  book,
  bannedWords: [...bettingJson.copy.bannedWords, ...hubJson.copy.bannedWords],
  races,
  horseNames: stableJson.horses.map((h) => h.name),
  fieldSize: 8,
  cardCopy: raceDayJson.copy.card,
});
const failure = (edit: (b: Raw) => void, races?: Raw): DataError => {
  const book = structuredClone(bookJson) as Raw;
  edit(book);
  try { validateBook(base(book, races)); } catch (e) { if (e instanceof DataError) return e; throw e; }
  throw new Error('expected validateBook to throw');
};
const paths = (e: DataError): string[] => e.issues.map((i) => i.path);

const pairAt = (kind: keyof typeof bookJson.news.kinds.value, i: number) => `news.kinds.value.${kind}.pairs[${i}]`;

describe('the shipped book.json', () => {
  it('loads', () => {
    expect(() => loadBook()).not.toThrow();
  });

  it('every value carries a status and a note', () => {
    const walk = (node: Raw, at: string): void => {
      if (node !== null && typeof node === 'object' && 'value' in node && 'status' in node) {
        expect(['starting guess', 'confirmed'], at).toContain(node.status);
        expect(typeof node.note, `${at} note`).toBe('string');
        return;
      }
      for (const [k, v] of Object.entries(node)) walk(v, `${at}.${k}`);
    };
    walk(bookJson, 'book');
  });

  it('holds the spec\'s copy word for word (book-useful.md sections 2, 3.5, 6 and 8)', () => {
    const b = loadBook();
    expect(b.cover.title.value).toBe('Race Day Program');
    expect(b.cover.races.value).toBe('{n} races today');
    expect(b.news.title.value).toBe('Rail Talk');
    expect(b.news.subtitle.value).toBe('Pace, class and peanuts.');
    expect(b.news.prefix.value).toBe('Race {r}:');
    expect(b.news.count.value).toEqual({ 5: 'Five', 6: 'Six', 7: 'Seven' });
    expect(b.racePage.pace.value).toEqual({ none: 'none up front', some: '{k} up front' });
    expect([b.racePage.toWindow.value, b.racePage.winner.value, b.racePage.later.value]).toEqual(['Enter: to window', 'Winner: #{n}', 'Prices later']);
    expect([b.foot.prev.value, b.foot.next.value, b.foot.close.value]).toEqual(['< {page}', '{page} >', 'Esc: close']);
    expect(b.foot.pages.value).toEqual({ cover: 'Cover', news: 'News', race: 'Race {r}' });
  });

  it('has the kinds, priority and thresholds of the spec as amended by 13 (crowded lead at five, no inside draw)', () => {
    const b = loadBook().news;
    expect(b.priority.value).toEqual(['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7']);
    expect(b.slots.value).toBe(5);
    expect(b.kinds.value.K1.frontRankMax).toBe(4);
    expect([b.kinds.value.K2.leadMin, b.kinds.value.K2.gapMin]).toEqual([26, 9]);
    expect([b.kinds.value.K3.frontsMin, b.kinds.value.K3.closerRankMax]).toEqual([5, 4]);
    expect([b.kinds.value.K4.diffMin, b.kinds.value.K4.rankMax]).toEqual([6, 3]);
    expect(b.kinds.value.K5.stalkerRankMax).toBe(4);
    expect([b.kinds.value.K6.frontRankMax, b.kinds.value.K6.frontsMin, b.kinds.value.K6.widePosts]).toEqual([3, 2, 2]);
    expect(b.kinds.value.K7.cap).toBeNull();
    for (const k of ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'] as const) expect(b.kinds.value[k].cap, k).toBe(2);
  });

  it('keeps the old news out: no flavor list, no card, two-starts or longest-price facts, and no inside-draw pairs', () => {
    const text = JSON.stringify(bookJson.news);
    expect(bookJson.news).not.toHaveProperty('flavor');
    expect(bookJson.news).not.toHaveProperty('facts');
    for (const gone of ["Today's card", 'Running in two races', "Yesterday's longest", 'Bugler finds a 13th note', 'Lemonade', 'drawn on the inside', 'a handy draw', 'inside and quick']) {
      expect(text, gone).not.toContain(gone);
    }
  });

  it('wraps each pair, with the 18-character name, to the lines the spec prints', () => {
    // Section 3.5's samples, as they wrap with "Mint Julep Lawsuit".
    const spec: Record<string, string[]> = {
      'K1:one wants the lead': ['Only Mint Julep Lawsuit wants', 'the lead. The bugler approves.'],
      'K1:nobody to argue with': ['Mint Julep Lawsuit is the lone', 'speed. Better than its bars.'],
      'K1:a lead for one': ['No rival for the lead. Mint', 'Julep Lawsuit likes that.'],
      'K2:a class above': ['No one here is close to Mint', 'Julep Lawsuit on paper.'],
      'K2:best by a lot': ['Mint Julep Lawsuit has the', 'most in the bars, by a lot.'],
      'K3:{k} want the lead': ['Closers like a busy front.', 'Mint Julep Lawsuit tops them.'],
      'K3:a crowd up front': ['A busy lead helps closers. Top', 'one here: Mint Julep Lawsuit.'],
      'K3:traffic up front': ['The snack cart says closers.', 'Top closer: Mint Julep Lawsuit'],
      'K4:an easier crowd': ['Mint Julep Lawsuit runs twice.', 'Race 6 is the easier field.'],
      'K4:softer company': ['Two starts for Mint Julep', 'Lawsuit. Race 6 is kinder.'],
      'K4:kinder rivals': ['Race 6 is the easier of Mint', "Julep Lawsuit's two."],
      'K5:nobody wants the lead': ['Stalkers set the pace, and', 'Mint Julep Lawsuit tops them.'],
      'K5:no speed at all': ['No early speed suits stalkers.', 'Top one: Mint Julep Lawsuit.'],
      'K5:who goes first?': ['Someone has to go first. Top', 'stalker: Mint Julep Lawsuit.'],
      'K6:drawn wide': ['Post 8 for Mint Julep Lawsuit.', 'A long way round for speed.'],
      'K6:a long way round': ['Mint Julep Lawsuit drew wide,', 'post 8. Speed minds it a bit.'],
      'K6:parked out wide': ['Mint Julep Lawsuit starts from', 'post 8. A long trip for speed.'],
      'K7:tops on the numbers': ['On paper, Mint Julep Lawsuit.', 'Paper has been wrong before.'],
      'K7:best sum here': ['Sum the bars and Mint Julep', 'Lawsuit comes out on top.'],
    };
    let seen = 0;
    for (const [kind, k] of Object.entries(loadBook().news.kinds.value)) {
      for (const p of k.pairs) {
        const lines = spec[`${kind}:${p.headline}`];
        expect(lines, `${kind}:${p.headline} is in the spec`).toBeDefined();
        const body = p.body.replace('{name}', 'Mint Julep Lawsuit').replace('{post}', '8').replace('{soft}', '6');
        expect(wrapWords(body, 30), `${kind}:${p.headline}`).toEqual(lines);
        seen++;
      }
    }
    expect(seen).toBe(Object.keys(spec).length);
  });

  it('every stable name fits every shipped pair in 2 lines of 30 (the two spec pairs that need a third line for some names are left out)', () => {
    const left = ['add up the bars', 'most in the bars'];
    for (const k of Object.values(loadBook().news.kinds.value)) for (const p of k.pairs) expect(left).not.toContain(p.headline);
  });
});

describe('NU4: pairs checked at load, with the key', () => {
  it('a headline that is over 22 characters (30 with "Race 5: ") fails, naming the file and field; 22 passes', () => {
    const e = failure((b) => { b.news.kinds.value.K1.pairs[0].headline = 'x'.repeat(23); });
    expect(e.file).toBe('src/data/book.json');
    expect(paths(e)).toContain(pairAt('K1', 0) + '.headline');
    expect(e.message).toContain(`src/data/book.json: ${pairAt('K1', 0)}.headline`);
    const ok = structuredClone(bookJson) as Raw;
    ok.news.kinds.value.K1.pairs[0].headline = 'x'.repeat(22);
    expect(() => validateBook(base(ok))).not.toThrow();
  });

  it('a body that needs a third line for some stable name fails, naming the pair', () => {
    const e = failure((b) => { b.news.kinds.value.K2.pairs[0].body = 'Add up the bars. {name} comes out well ahead.'; });
    expect(paths(e)).toContain(pairAt('K2', 0) + '.body');
    expect(e.issues[0].message).toMatch(/needs more than 2 lines of 30/);
  });

  it('the two spec pairs left out do fail the check (so the spec\'s own rule keeps them out)', () => {
    expect(paths(failure((b) => { b.news.kinds.value.K2.pairs.push({ headline: 'add up the bars', body: 'Add up the bars. {name} comes out well ahead.' }); }))).toContain(pairAt('K2', 2) + '.body');
    expect(paths(failure((b) => { b.news.kinds.value.K7.pairs.push({ headline: 'most in the bars', body: 'Add the three bars: {name} is top here.' }); }))).toContain(pairAt('K7', 2) + '.body');
  });

  it('an unknown hole fails, and so does a hole a kind does not have', () => {
    expect(paths(failure((b) => { b.news.kinds.value.K1.pairs[0].body = '{name} won {lap}.'; }))).toContain(pairAt('K1', 0) + '.body');
    // {soft} belongs to the easier-crowd pairs, {post} to the draw's, {k} to the crowded lead's headline.
    expect(paths(failure((b) => { b.news.kinds.value.K1.pairs[0].body = '{name} in race {soft}.'; }))).toContain(pairAt('K1', 0) + '.body');
    expect(paths(failure((b) => { b.news.kinds.value.K2.pairs[0].headline = '{k} ahead'; }))).toContain(pairAt('K2', 0) + '.headline');
    expect(paths(failure((b) => { b.news.kinds.value.K3.pairs[0].body = '{k} want it, says {name}.'; }))).toContain(pairAt('K3', 0) + '.body');
  });

  it('a count with no word fails: five, six and seven front-runners can have a closer', () => {
    expect(paths(failure((b) => { delete b.news.count.value['6']; }))).toContain('news.count.value.6');
  });

  it('every kind is in the priority list once', () => {
    expect(paths(failure((b) => { b.news.priority.value = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6']; }))).toContain('news.priority.value');
    expect(paths(failure((b) => { b.news.priority.value = ['K1', 'K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7']; }))).toContain('news.priority.value[1]');
  });

  it('a repeated headline within a kind fails', () => {
    expect(paths(failure((b) => { b.news.kinds.value.K1.pairs[1].headline = b.news.kinds.value.K1.pairs[0].headline; }))).toContain(pairAt('K1', 1) + '.headline');
  });

  it('a news title or subtitle over its width fails; the subtitle is the spec\'s 24 characters', () => {
    expect(loadBook().news.subtitle.value.length).toBe(24);
    expect(paths(failure((b) => { b.news.subtitle.value = 'Pace, class, peanuts, and more.'; }))).toContain('news.subtitle.value');
  });
});

describe('NU4: banned words, whole words, case-insensitive', () => {
  const pairBody = (text: string) => failure((b) => { b.news.kinds.value.K1.pairs[1].body = text; });

  it.each([
    ['Injury', 'The injury report is blank.'],
    ['limping', 'A fan came in limping.'],
    ['hurt', 'Nobody got HURT today.'],
    ['sure thing', 'A Sure Thing at the snack cart.'],
    ['favorite', 'Her favorite hat, again.'],
    ['tip', 'A tip for the usher.'],
    ['pick', 'Pick a seat, any seat.'],
    ['vet', 'The vet had a sandwich.'],
    ['buy', 'Come buy a napkin.'],
    ['cash out', 'Cash out at the cart.'],
    // book-useful.md section 2: words that hint at something measured false, or at a certainty.
    ['tired', 'The leaders look TIRED.'],
    ['tire', 'They may tire late.'],
    ['fade', 'Leaders fade late.'],
    ['fresh', 'A fresh horse today.'],
    ['rested', 'Rested and ready.'],
    ['due', 'A win is due.'],
    ['streak', 'On a streak.'],
    ['in form', 'In form at last.'],
    ['stayer', 'A real stayer.'],
    ['goes long', 'Goes long all day.'],
    ['distance', 'Loves the distance.'],
    ['wire to wire', 'Wire to wire again.'],
    ["can't lose", "Can't lose today."],
    ['guaranteed', 'A guaranteed win.'],
    ['cinch', 'A cinch for it.'],
    ['banker', 'The banker here.'],
    ['best bet', 'The best bet today.'],
    ['value', 'Good value today.'],
    ['overlay', 'An overlay at the window.'],
    ['odds-on', 'Odds-on to win.'],
    ['percent', 'Ten percent better.'],
  ])('"%s" in a pair body fails', (word, text) => {
    const e = pairBody(text);
    expect(paths(e)).toContain(pairAt('K1', 1) + '.body');
    expect(e.message).toContain(`banned word "${word.toLowerCase()}"`);
  });

  it('a banned word inside a longer word is not a hit', () => {
    const book = structuredClone(bookJson) as Raw;
    book.news.kinds.value.K1.pairs[1].body = 'The picket fence is tipsy. Vets and lockers.';
    expect(() => validateBook(base(book))).not.toThrow();
  });

  it('a banned word in a headline, the title, the subtitle or the prefix fails', () => {
    expect(paths(failure((b) => { b.news.kinds.value.K1.pairs[0].headline = 'a sure thing'; }))).toContain(pairAt('K1', 0) + '.headline');
    expect(paths(failure((b) => { b.news.title.value = 'Rail Tip'; }))).toContain('news.title.value');
    expect(paths(failure((b) => { b.news.subtitle.value = 'Pace and value.'; }))).toContain('news.subtitle.value');
  });

  it('"Official", "$" and "%" fail anywhere in the book', () => {
    expect(paths(pairBody('The Official hat is here.'))).toContain(pairAt('K1', 1) + '.body');
    expect(paths(pairBody('Hats cost $5 today.'))).toContain(pairAt('K1', 1) + '.body');
    expect(paths(pairBody('Up 5% today.'))).toContain(pairAt('K1', 1) + '.body');
    expect(paths(failure((b) => { b.racePage.later.value = 'Prices $ later'; }))).toContain('racePage.later.value');
  });

  it('the helpers: whole words, phrases, case', () => {
    expect(bannedWordIn('A SURE THING', ['sure thing'])).toBe('sure thing');
    expect(bannedWordIn('Pickle', ['pick'])).toBeNull();
    expect(bannedWordIn('Pick, six', ['pick'])).toBe('pick');
    expect(holesOf('{race1Name} {a}')).toEqual(['race1Name', 'a']);
  });
});

describe('NU10 (data half): the pace phrase fits header line 4', () => {
  it('every race of the day, with every front-runner count, fits 30 characters, and the phrases fit 13', () => {
    for (const phrase of [loadBook().racePage.pace.value.none, fillHoles(loadBook().racePage.pace.value.some, { k: 8 })]) expect(phrase.length).toBeLessThanOrEqual(13);
    const e = failure((b) => { b.racePage.pace.value.some = '{k} horses up front at the start'; });
    expect(paths(e)).toContain('racePage.pace.value.some');
  });

  it('a pace phrase that makes line 4 over 30 for a race of the day fails', () => {
    const e = failure(() => {}, dayJson.races.map((r) => ({ ...r, surface: 'synthetic', going: 'yielding' })));
    expect(paths(e)).toContain('racePage.pace.value');
  });

  it('an unknown hole in the pace phrase fails', () => {
    expect(paths(failure((b) => { b.racePage.pace.value.some = '{n} up front'; }))).toContain('racePage.pace.value.some');
  });
});

describe('CV1: the cover and the masthead', () => {
  const withTrack = (track: string) => dayJson.races.map((r, i) => (i === 0 ? { ...r, track } : r));
  const tryTrack = (track: string): DataError | null => {
    try { validateBook(base(structuredClone(bookJson), withTrack(track))); } catch (e) { if (e instanceof DataError) return e; throw e; }
    return null;
  };

  it('the shipped track name fits', () => {
    expect(dayJson.races[0].track.length).toBeLessThanOrEqual(19);
  });

  it('19 characters pass, 20 fail with day.json and races[0].track', () => {
    expect(tryTrack('Aaaaaaaaaaaaaaaaaaa')).toBeNull();
    const e = tryTrack('Aaaaaaaaaaaaaaaaaaaa')!;
    expect(e.file).toBe('src/data/day.json');
    expect(paths(e)).toEqual(['races[0].track']);
    expect(e.message).toContain('20 characters');
  });

  it('a character the display font lacks fails, naming the file and field', () => {
    const e = tryTrack('Saratoga, Race Course')!;
    expect(e).not.toBeNull();
    const e2 = tryTrack('Belmont @ Park')!;
    expect(e2.file).toBe('src/data/day.json');
    expect(e2.message).toContain('races[0].track');
    expect(e2.message).toContain('"@"');
  });

  it('a lower-case name is checked upper-cased, and & \' . - and digits are glyphs', () => {
    expect(tryTrack("St. Mary's & 3-Oaks")).toBeNull();
  });

  it('the display font has the 41 glyphs of spec 18.5 D, capitals only', () => {
    const g = loadBook().cover.display.value.glyphs;
    expect(g.length).toBe(41);
    expect(g).toBe(g.toUpperCase());
  });

  it('the cover title or race count over its limit fails', () => {
    expect(paths(failure((b) => { b.cover.title.value = 'A Race Day Program That Runs Long'; }))).toContain('cover.title.value');
    expect(paths(failure((b) => { b.cover.races.value = '{n} races on the card today, folks'; }))).toContain('cover.races.value');
  });

  it('a broken file reports every problem at once', () => {
    const e = failure((b) => { b.cover.title.value = 'x'.repeat(40); b.racePage.later.value = 'x'.repeat(40); });
    expect(paths(e)).toEqual(expect.arrayContaining(['cover.title.value', 'racePage.later.value']));
  });

  it('a misspelled key is an error, not ignored', () => {
    const e = failure((b) => { b.cover.titel = b.cover.title; });
    expect(e.file).toBe('src/data/book.json');
  });
});

describe('race page and foot copy limits', () => {
  it('the L1 right text over 16 characters fails', () => {
    expect(paths(failure((b) => { b.racePage.toWindow.value = 'Enter: go to the window'; }))).toContain('racePage.toWindow.value');
  });

  it('a page name that makes "< Race 8" over 8 characters fails', () => {
    expect(paths(failure((b) => { b.foot.pages.value.race = 'Race page {r}'; }))).toContain('foot.pages.value.race');
  });

  it('the foot targets must not overlap', () => {
    expect(paths(failure((b) => { b.foot.layout.value.closeTarget.x0 = 70; }))).toContain('foot.layout.value.closeTarget');
  });
});

describe('text helpers', () => {
  it('fills the spec\'s holes, including {race1Name}', () => {
    expect(fillHoles('{n} races today. First up: the {race1Name}.', { n: 8, race1Name: 'Redbud Purse' })).toBe('8 races today. First up: the Redbud Purse.');
    expect(fillHoles('{x} {y}', { x: 1 })).toBe('1 {y}');
  });
});

describe('book-and-window.md 23.7: the display font\'s glyph list', () => {
  it('book.json\'s glyphs are exactly fontLayout\'s DISPLAY_CHARS, each once (the order may differ: book.json\'s schema forbids a leading space)', () => {
    const g = loadBook().cover.display.value.glyphs;
    expect(g.length).toBe(DISPLAY_CHARS.length);
    expect(new Set(g).size).toBe(g.length);
    expect([...g].sort()).toEqual([...DISPLAY_CHARS].sort());
  });
});

describe('book-and-window.md 23.6: the aria templates', () => {
  it('an unknown hole in the cover\'s day pair or the entry line fails, naming the field', () => {
    expect(paths(failure((b) => { b.cover.aria.value = '{label} {seed}'; }))).toContain('cover.aria.value');
    expect(paths(failure((b) => { b.racePage.ariaEntry.value = '#{n} {name}, {blurb}'; }))).toContain('racePage.ariaEntry.value');
  });
});
