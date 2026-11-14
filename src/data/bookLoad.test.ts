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

// The book's data loader: NW3, the data half of CV1 (as amended in spec 18: 19 characters in the
// display font) and the copy limits of spec section 13. Each fails at load with the file and the field.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;
const base = (book: Raw, races: Raw = dayJson.races): BookInput => ({
  book,
  bannedWords: [...bettingJson.copy.bannedWords, ...hubJson.copy.bannedWords],
  races,
  horseNames: stableJson.horses.map((h) => h.name),
  oddsLabels: bettingJson.odds.steps.value.map((s) => s.label),
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

  it('holds the spec\'s copy word for word', () => {
    const b = loadBook();
    expect(b.cover.title.value).toBe('Race Day Program');
    expect(b.cover.races.value).toBe('{n} races today');
    expect(b.news.title.value).toBe('Rail Talk');
    expect(b.news.subtitle.value).toBe('Gossip, facts and peanuts.');
    expect(b.news.facts.value).toEqual({
      card: { headline: "Today's card", body: '{n} races, all {distance} on {going} {surface}.', bodyMixed: '{n} races today. First up: the {race1Name}.' },
      double: { headline: 'Running in two races today', line: '{name}, races {a}, {b}' },
      longest: { headline: "Yesterday's longest price", body: '{name} won race {r} at {odds}.' },
    });
    expect([b.racePage.toWindow.value, b.racePage.winner.value, b.racePage.later.value]).toEqual(['Enter: to window', 'Winner: #{n}', 'Prices later']);
    expect([b.foot.prev.value, b.foot.next.value, b.foot.close.value]).toEqual(['< {page}', '{page} >', 'Esc: close']);
    expect(b.foot.pages.value).toEqual({ cover: 'Cover', news: 'News', race: 'Race {r}' });
  });

  it('has the eleven flavor items of the spec and not the cut one', () => {
    const f = loadBook().news.flavor.value;
    expect(f).toHaveLength(11);
    expect(f.map((x) => x.headline)).not.toContain('Lemonade tested, lemony');
    expect(JSON.stringify(bookJson.news.flavor.value).toLowerCase()).not.toContain('lemon');
  });

  it('wraps each flavor body to the lines the spec prints', () => {
    const spec: Record<string, string[]> = {
      'Bugler finds a 13th note': ['He is saving it for a special', 'occasion. Today is not it.'],
      'Biggest hat in the stand': ["The regular's hat now has its", 'own seat. Nobody argued.'],
      'Pigeons hold the good seats': ['Ushers asked nicely. The', 'pigeons have declined.'],
      'Lost and found': ['Lost: one lucky sock, left.', 'Not as lucky as advertised.'],
      'Tote board gets a polish': ['All bulbs polished but two.', 'Nobody can reach those.'],
      'Peanut shells set a record': ['Section C reports ankle deep.', 'Knee deep by the last race.'],
      'Parking update': ['Lot B is full. Lot C is a cow', 'pasture. The cows are fine.'],
      "The bugler's car, explained": ['His car horn plays the call to', 'the post. On purpose.'],
      'Snack cart adds napkins': ['Fewer sticky programs', 'reported. A proud day for all.'],
      "Regular's cushion returns": ['Same cushion, thirty seasons.', 'Still plump. Still hers.'],
      'Pretzel situation resolved': ['The dropped pretzel was found.', 'A pigeon got there first.'],
    };
    for (const f of loadBook().news.flavor.value) expect(wrapWords(f.body, 30), f.headline).toEqual(spec[f.headline]);
  });

  it('NW3: the longest fill, "Mint Julep Lawsuit, races 2, 6", is 30 characters and fits', () => {
    const line = fillHoles(loadBook().news.facts.value.double.line, { name: 'Mint Julep Lawsuit', a: 2, b: 6 });
    expect(line).toBe('Mint Julep Lawsuit, races 2, 6');
    expect(line.length).toBe(30);
  });
});

describe('NW3: headlines', () => {
  it('a flavor headline over 30 characters fails, naming the file and field', () => {
    const e = failure((b) => { b.news.flavor.value[2].headline = 'A headline that runs over thirty'; });
    expect(e.file).toBe('src/data/book.json');
    expect(paths(e)).toContain('news.flavor.value[2].headline');
    expect(e.message).toContain('src/data/book.json: news.flavor.value[2].headline');
  });

  it('a fact headline over 30 characters fails', () => {
    expect(paths(failure((b) => { b.news.facts.value.longest.headline = 'Yesterday\'s very longest price of all'; }))).toContain('news.facts.value.longest.headline');
  });

  it('exactly 30 characters passes', () => {
    const book = structuredClone(bookJson) as Raw;
    book.news.flavor.value[0].headline = 'x'.repeat(30);
    expect(() => validateBook(base(book))).not.toThrow();
  });
});

describe('NW3: fact templates filled with every horse, odds label and race number', () => {
  it('a longest-price template that needs a third line for the longest name fails', () => {
    const e = failure((b) => { b.news.facts.value.longest.body = '{name} won race {r} at {odds} and the whole crowd cheered for ages.'; });
    expect(paths(e)).toContain('news.facts.value.longest.body');
    expect(e.issues[0].message).toMatch(/needs more than 2 lines of 30/);
  });

  it('a card template too long for 2 lines of 30 fails', () => {
    expect(paths(failure((b) => { b.news.facts.value.card.body = '{n} races, all {distance} on {going} {surface}, every single one of them today.'; }))).toContain('news.facts.value.card.body');
  });

  it('a mixed-card template is filled with every race name', () => {
    const e = failure(() => {}, dayJson.races.map((r, i) => (i === 3 ? { ...r, name: 'The Extremely Long Name Of The Race' } : r)));
    expect(paths(e)).toContain('news.facts.value.card.bodyMixed');
  });

  it('a two-starts line over 30 characters fails', () => {
    const e = failure((b) => { b.news.facts.value.double.line = '{name}, in races {a} and {b}'; });
    expect(paths(e)).toContain('news.facts.value.double.line');
  });

  it('an unknown hole fails', () => {
    expect(paths(failure((b) => { b.news.facts.value.longest.body = '{name} won {lap} at {odds}.'; }))).toContain('news.facts.value.longest.body');
  });
});

describe('NW3: banned words, whole words, case-insensitive', () => {
  const flavorBody = (text: string) => failure((b) => { b.news.flavor.value[1].body = text; });

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
  ])('"%s" in a flavor body fails', (word, text) => {
    const e = flavorBody(text);
    expect(paths(e)).toContain('news.flavor.value[1].body');
    expect(e.message).toContain(`banned word "${word.toLowerCase()}"`);
  });

  it('a banned word inside a longer word is not a hit', () => {
    const book = structuredClone(bookJson) as Raw;
    book.news.flavor.value[1].body = 'The picket fence is tipsy. Vets and lockers.';
    expect(() => validateBook(base(book))).not.toThrow();
  });

  it('a banned word in a headline, the title or a fact template fails', () => {
    expect(paths(failure((b) => { b.news.flavor.value[0].headline = 'Bugler is hurt'; }))).toContain('news.flavor.value[0].headline');
    expect(paths(failure((b) => { b.news.title.value = 'Rail Tip'; }))).toContain('news.title.value');
    expect(paths(failure((b) => { b.news.facts.value.longest.body = '{name} won race {r} at {odds}, a sure thing.'; }))).toContain('news.facts.value.longest.body');
  });

  it('"Official" and "$" fail anywhere in the book', () => {
    expect(paths(failure((b) => { b.news.flavor.value[1].body = 'The Official hat is here.'; }))).toContain('news.flavor.value[1].body');
    expect(paths(failure((b) => { b.news.flavor.value[1].body = 'Hats cost $5 today.'; }))).toContain('news.flavor.value[1].body');
    expect(paths(failure((b) => { b.racePage.later.value = 'Prices $ later'; }))).toContain('racePage.later.value');
  });

  it('the helpers: whole words, phrases, case', () => {
    expect(bannedWordIn('A SURE THING', ['sure thing'])).toBe('sure thing');
    expect(bannedWordIn('Pickle', ['pick'])).toBeNull();
    expect(bannedWordIn('Pick, six', ['pick'])).toBe('pick');
    expect(holesOf('{race1Name} {a}')).toEqual(['race1Name', 'a']);
  });
});

describe('NW3: a flavor item with a fill fails', () => {
  it('in the body', () => {
    const e = failure((b) => { b.news.flavor.value[4].body = 'Gravy was {name} today.'; });
    expect(paths(e)).toContain('news.flavor.value[4].body');
    expect(e.message).toContain('a flavor item has none');
  });

  it('in the headline', () => {
    expect(paths(failure((b) => { b.news.flavor.value[4].headline = 'Race {r} news'; }))).toContain('news.flavor.value[4].headline');
  });

  it('a flavor body over 2 lines of 30 fails', () => {
    expect(paths(failure((b) => { b.news.flavor.value[4].body = 'The tote board got a very thorough polish from the whole grounds crew today.'; }))).toContain('news.flavor.value[4].body');
  });
});

describe('news slots', () => {
  it('slot 1 must be flavor, there are five, and flavor must cover the slots that fall back to it', () => {
    expect(paths(failure((b) => { b.news.slots.value[0] = { source: 'card', fallback: null }; }))).toContain('news.slots.value[0].source');
    expect(paths(failure((b) => { b.news.slots.value.pop(); }))).toContain('news.slots.value');
    expect(paths(failure((b) => { b.news.flavor.value = b.news.flavor.value.slice(0, 3); }))).toContain('news.flavor.value');
  });

  it('a repeated headline fails', () => {
    expect(paths(failure((b) => { b.news.flavor.value[3].headline = b.news.flavor.value[2].headline; }))).toContain('news.flavor.value[3].headline');
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
