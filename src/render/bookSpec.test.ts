import { describe, expect, it } from 'vitest';
import bettingJson from '../data/betting.json';
import bookJson from '../data/book.json';
import dayJson from '../data/day.json';
import hubJson from '../data/hub.json';
import raceDayJson from '../data/raceDay.json';
import stableJson from '../data/stable.json';
import { bookPages, coverFor, racePageState, runningFoot, type RunRace } from '../bet/bookPage';
import { quote } from '../bet/day';
import { newsFor } from '../bet/news';
import { loadBook, validateBook, type BookInput } from '../data/bookLoad';
import { DataError } from '../data/validate';
import { ctx, dayWith, drawnOf, inputFor, lookFor, paint, programOf, rd } from './betKit';
import { bookKey, bookPointerTargets, coverScreen, newsScreen, pageAt, racePageScreen, type BookKeyContext, type BookState } from './bookScreen';
import { hitTest } from './pointer';
import { programScreen } from './programScreen';

// The book, written from docs/specs/book-and-window.md sections 2, 3, 5, 6, 10 and 13, with
// the art-director's rulings in 18.2 (display-font masthead at y14, title at y31, 19 characters
// at most) which win over section 3. CV1, CV3, BB1, BB2, BB3, BB5 (the pure half), BB6.

const book = loadBook();
const RACES = 8;
const news = newsFor(book, { daySeed: 12345, fields: drawnOf(), stable: ctx.stable, races: ctx.races, cardCopy: rd.copy.card, previous: null });
const cover = coverFor(book, { daySeed: 12345, trackName: ctx.races[0].track, raceCount: RACES, news });
const covScreen = coverScreen(book, cover, RACES);
const nwsScreen = newsScreen(book, news, cover.dayLabel, cover.dayNumber, RACES);

const kctx = (page: number, enter: 'window' | 'none' = 'none'): BookKeyContext => ({ races: RACES, horses: pageAt(RACES, page).kind === 'race' ? 8 : 0, enter });
const press = (s: BookState, code: string, enter: 'window' | 'none' = 'none') => bookKey(s, code, kctx(s.page, enter));
const textOf = (xs: { text: string; x: number; y: number; color: string }[], t: string) => xs.find((x) => x.text === t);

describe('CV1: the cover (section 3 as amended by 18.2)', () => {
  it('the masthead is race 1\'s track from day.json, upper-cased, in the display font, centered on 12 px a letter, cell top y14', () => {
    const name = dayJson.races[0].track;
    expect(cover.track).toBe(name);
    const t = covScreen.texts.find((x) => x.display === true)!;
    expect(t.text).toBe(name.toUpperCase());
    expect(t.x).toBe(Math.floor((256 - 12 * name.length) / 2));
    expect(t.y).toBe(14);
    expect(t.color).toBe('Parchment');
  });

  it('"Race Day Program" is Parchment in the main font, centered, cell top y31', () => {
    expect(textOf(covScreen.texts, 'Race Day Program')).toEqual({ text: 'Race Day Program', x: Math.floor((256 - 8 * 16) / 2), y: 31, color: 'Parchment' });
  });

  it('the dateline is "Day" at x8 and the seed "#12345" in the small font from x36 two rows down, both y48 Ink', () => {
    expect(covScreen.texts).toContainEqual({ text: 'Day', x: 8, y: 48, color: 'Ink' });
    expect(covScreen.texts).toContainEqual({ text: '#12345', x: 36, y: 50, color: 'Ink', small: true });
  });

  it('the race count is the day\'s ("8 races today"), right-aligned to x247, Ink', () => {
    expect(covScreen.texts).toContainEqual({ text: `${dayJson.races.length} races today`, x: 248 - 8 * 13, y: 48, color: 'Ink' });
  });

  it('the cover line is news item 1\'s headline, centered, Ink, cell top y196', () => {
    const line = news[0].headline;
    expect(covScreen.texts).toContainEqual({ text: line, x: Math.floor((256 - 8 * line.length) / 2), y: 196, color: 'Ink' });
  });

  it('the day pair is the seed for every seed, the race count follows the day, and the line follows the news', () => {
    for (const seed of [0, 1, 99999, 4294967295]) {
      const n = newsFor(book, { daySeed: seed, fields: drawnOf(), stable: ctx.stable, races: ctx.races, cardCopy: rd.copy.card, previous: null });
      const c = coverFor(book, { daySeed: seed, trackName: 'Any Track', raceCount: 5, news: n });
      expect(c.dayLabel).toBe('Day');
      expect(c.dayNumber).toBe(`#${seed}`);
      expect(c.races).toBe('5 races today');
      expect(c.line).toBe(n[0].headline);
    }
  });

  it('the masthead block is Maroon x8-247, y8-43, with a 1 px Parchment keyline x10-245, y10-41, and Ink rules at y58 and y210', () => {
    const px = paint(covScreen.rects);
    expect(px.get('8,8')).toBe('Maroon');
    expect(px.get('247,43')).toBe('Maroon');
    expect(px.get('9,9')).toBe('Maroon');
    expect(px.get('10,10')).toBe('Parchment');
    expect(px.get('245,41')).toBe('Parchment');
    expect(px.get('100,10')).toBe('Parchment');
    expect(px.get('100,41')).toBe('Parchment');
    expect(px.get('10,30')).toBe('Parchment');
    expect(px.get('245,30')).toBe('Parchment');
    expect(px.get('11,11')).toBe('Maroon');
    expect(px.get('100,30')).toBe('Maroon');
    expect(px.get('7,20')).toBeUndefined();
    expect(px.get('248,20')).toBeUndefined();
    expect(px.get('100,44')).toBeUndefined();
    for (const y of [58, 210]) { expect(px.get(`8,${y}`)).toBe('Ink'); expect(px.get(`247,${y}`)).toBe('Ink'); expect(px.get(`7,${y}`)).toBeUndefined(); }
  });

  it('the picture is art.book.cover.art at x8, y62', () => {
    expect(covScreen.images).toEqual([{ slot: 'art.book.cover.art', x: 8, y: 62 }]);
  });

  it('the running foot on the cover: no previous item, "Esc: close" at x88, "News >" ending at x247, cell top y226', () => {
    const foot = covScreen.texts.filter((t) => t.y === 226);
    expect(foot.map((t) => [t.text, t.x])).toEqual([['Esc: close', 88], ['News >', 248 - 48]]);
  });

  it('the cover is Parchment paper', () => {
    expect(covScreen.paper).toBe('Parchment');
  });
});

describe('CV3: the cover uses only Parchment, Ink and Maroon (no Dirt, the dog-ear is ruled out)', () => {
  it('every rect, every text and the paper', () => {
    const allowed = new Set(['Parchment', 'Ink', 'Maroon']);
    expect(allowed.has(covScreen.paper)).toBe(true);
    for (const r of covScreen.rects) expect(allowed.has(r.color), `rect ${JSON.stringify(r)}`).toBe(true);
    for (const t of covScreen.texts) expect(allowed.has(t.color), `text ${t.text}`).toBe(true);
    expect(covScreen.images.map((i) => i.slot)).toEqual(['art.book.cover.art']); // no dog-ear slot
    expect(covScreen.rects.every((r) => r.x + r.w <= 248 || r.y >= 0)).toBe(true);
  });
});

describe('CV1 loader: the track name is at most 19 characters (art-director 18.2) or the load fails with the file and field', () => {
  const rawFor = (track: string, over: Partial<BookInput> = {}): BookInput => ({
    book: bookJson,
    bannedWords: [...bettingJson.copy.bannedWords, ...hubJson.copy.bannedWords],
    races: dayJson.races.map((r, i) => (i === 0 ? { ...r, track } : r)),
    horseNames: stableJson.horses.map((h) => h.name),
    oddsLabels: bettingJson.odds.steps.value.map((s) => s.label),
    fieldSize: bettingJson.field.size.value,
    cardCopy: raceDayJson.copy.card,
    ...over,
  });
  const fails = (raw: BookInput): DataError => {
    try { validateBook(raw); } catch (e) { return e as DataError; }
    throw new Error('expected the load to fail');
  };

  it('19 characters load, 20 do not, and the error names the file and the field', () => {
    expect(() => validateBook(rawFor('A'.repeat(19)))).not.toThrow();
    const e = fails(rawFor('A'.repeat(20)));
    expect(e).toBeInstanceOf(DataError);
    expect(e.message).toContain('src/data/day.json');
    expect(e.message).toContain('races[0].track');
  });

  it('28 characters (section 3\'s old limit) fail now', () => {
    expect(fails(rawFor('B'.repeat(28))).message).toContain('track');
  });

  it('a name the display font cannot set fails, naming the file and field', () => {
    const e = fails(rawFor('Café Downs'));
    expect(e.message).toContain('races[0].track');
  });

  it('the shipped day and book load', () => {
    expect(() => loadBook()).not.toThrow();
  });
});

describe('NW3 loader: the news data is checked at load, with the key', () => {
  const rawFor = (mutate: (b: typeof bookJson) => void): BookInput => {
    const b = structuredClone(bookJson);
    mutate(b);
    return {
      book: b,
      bannedWords: [...bettingJson.copy.bannedWords, ...hubJson.copy.bannedWords],
      races: dayJson.races,
      horseNames: stableJson.horses.map((h) => h.name),
      oddsLabels: bettingJson.odds.steps.value.map((s) => s.label),
      fieldSize: bettingJson.field.size.value,
      cardCopy: raceDayJson.copy.card,
    };
  };
  const msg = (raw: BookInput): string => {
    try { validateBook(raw); } catch (e) { return (e as Error).message; }
    return '';
  };

  it('a headline of 31 characters fails, naming the file and its key; 30 is fine', () => {
    expect(msg(rawFor((b) => { b.news.flavor.value[0].headline = 'H'.repeat(30); }))).toBe('');
    const m = msg(rawFor((b) => { b.news.flavor.value[0].headline = 'H'.repeat(31); }));
    expect(m).toContain('src/data/book.json');
    expect(m).toContain('news.flavor.value[0].headline');
  });

  it('a flavor item with a fill fails', () => {
    expect(msg(rawFor((b) => { b.news.flavor.value[3].body = 'Race {r} was won by {name}.'; }))).toContain('news.flavor.value[3].body');
  });

  it('a flavor body that wraps to three lines fails', () => {
    expect(msg(rawFor((b) => { b.news.flavor.value[2].body = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen'; }))).toContain('news.flavor.value[2].body');
  });

  it('a fact template whose longest fill needs a third line fails, naming the template', () => {
    const m = msg(rawFor((b) => { (b.news.facts.value.longest as { body: string }).body = '{name} won race {r} at {odds}, a price this track has not seen in years of racing.'; }));
    expect(m).toContain('news.facts.value.longest.body');
  });

  it('a banned word anywhere in the news fails, as a whole word, in any case', () => {
    for (const word of ['injured', 'Favorite', 'sure thing', 'LAME', 'tip']) {
      expect(msg(rawFor((b) => { b.news.flavor.value[1].body = `A ${word} remark for today.`; })), word).toContain('news.flavor.value[1].body');
    }
    expect(msg(rawFor((b) => { b.news.flavor.value[1].body = 'The picket fence is painted.'; }))).toBe('');
  });
});

describe('BB1: page order and turning', () => {
  it('the pages are cover, news, race 1 to race n, for any n', () => {
    for (const n of [1, 3, 8]) expect(bookPages(n).map((p) => (p.kind === 'race' ? `race${p.race}` : p.kind))).toEqual(['cover', 'news', ...Array.from({ length: n }, (_v, i) => `race${i + 1}`)]);
  });

  it('Right and Left move one page; Left on the cover and Right on race n do nothing', () => {
    const last = RACES + 1;
    for (let p = 0; p <= last; p++) {
      const s: BookState = { page: p, focus: 0 };
      expect(press(s, 'ArrowRight').state.page).toBe(Math.min(p + 1, last));
      expect(press(s, 'ArrowLeft').state.page).toBe(Math.max(p - 1, 0));
      expect(press(s, 'ArrowRight').outcome).toBeNull();
      expect(press(s, 'ArrowLeft').outcome).toBeNull();
    }
  });

  it('Enter, Space and Z on the cover and the news act as Right', () => {
    for (const p of [0, 1]) for (const c of ['Enter', 'Space', 'KeyZ']) expect(press({ page: p, focus: 0 }, c)).toEqual(press({ page: p, focus: 0 }, 'ArrowRight'));
  });

  it('Esc closes from every page', () => {
    for (let p = 0; p <= RACES + 1; p++) expect(press({ page: p, focus: 0 }, 'Escape').outcome).toEqual({ kind: 'close' });
  });

  it('on a race page Up and Down wrap through posts 1 to 8 with no Pass stop, and digits jump', () => {
    const s: BookState = { page: 4, focus: 0 };
    expect(press(s, 'ArrowUp').state.focus).toBe(7);
    expect(press({ ...s, focus: 7 }, 'ArrowDown').state.focus).toBe(0);
    for (let k = 1; k <= 8; k++) expect(press(s, `Digit${k}`).state.focus).toBe(k - 1);
  });
});

describe('BB3: the price state of every page, for every combination of r, posted, pending and run (section 5)', () => {
  const posted = (races: number[]) => new Map(races.map((r) => [r, quote(ctx, programOf(r), null).odds]));
  const records = (upTo: number, betOn: number | null): RunRace[] =>
    Array.from({ length: upTo }, (_v, i) => ({
      race: i + 1, odds: ['9-1', '8-1', '7-1', '6-1', '5-1', '4-1', '3-1', '2-1'].map((o, j) => (j === i % 8 ? '1-1' : o)), winnerPost: (i % 8) + 1, ticket: betOn === i + 1 ? { post: 4 } : null,
    }));

  it('every page against the table, for every next race and every set of posted prices', () => {
    for (let r = 1; r <= RACES; r++) {
      for (const open of [[], [r], [r + 1], [r, r + 1], [r + 2], [r, r + 2]]) {
        const recs = records(r - 1, r - 1);
        for (let page = 1; page <= RACES; page++) {
          const s = racePageState(book, { page, nextRace: r, fieldSize: 8, records: recs, posted: posted(open.filter((n) => n <= RACES)) });
          const tag = `r${r} page${page} posted[${open}]`;
          if (page < r) {
            expect(s.right, tag).toBe(`Winner: #${recs[page - 1].winnerPost}`);
            expect(s.odds, tag).toEqual(recs[page - 1].odds);
            expect(s.enter, tag).toBe('none');
            expect(s.tick, tag).toBe(page === r - 1 ? 4 : null);
          } else if (page === r && open.includes(r)) {
            expect(s.right, tag).toBe('Enter: to window');
            expect(s.odds, tag).toEqual(posted([r]).get(r));
            expect(s.enter, tag).toBe('window');
            expect(s.footer, tag).toBe('blurb');
          } else if (page === r) {
            expect(s.right, tag).toBe('');
            expect(s.odds, tag).toEqual(Array(8).fill(null));
            expect(s.enter, tag).toBe('none');
            expect(s.footer, tag).toBe('pending');
          } else if (page === r + 1 && open.includes(page)) {
            expect(s.right, tag).toBe('');
            expect(s.odds, tag).toEqual(posted([page]).get(page));
            expect(s.enter, tag).toBe('none');
            expect(s.footer, tag).toBe('blurb');
          } else {
            expect(s.right, tag).toBe('Prices later');
            expect(s.odds, tag).toEqual(Array(8).fill(null));
            expect(s.enter, tag).toBe('none');
            expect(s.footer, tag).toBe('blurb');
          }
          if (page >= r) expect(s.tick, tag).toBeNull();
        }
      }
    }
  });

  it('a run page you did not bet on has no tick; the winner is the result\'s, not the cursor\'s', () => {
    const s = racePageState(book, { page: 1, nextRace: 2, fieldSize: 8, records: records(1, null), posted: new Map() });
    expect(s.tick).toBeNull();
    expect(s.right).toBe('Winner: #1');
  });

  it('fewer than 8 horses: the odds end early', () => {
    const s = racePageState(book, { page: 3, nextRace: 3, fieldSize: 6, records: [], posted: new Map() });
    expect(s.odds).toHaveLength(6);
  });

  it('every right-slot text fits 16 characters and prints in Ink, never Maroon', () => {
    const drawn = drawnOf()[2];
    for (const open of [[3], [], [4]]) {
      const page = racePageState(book, { page: 3, nextRace: 3, fieldSize: 8, records: [], posted: posted(open) });
      const sc = racePageScreen({ book, ctx, rd, look: lookFor(drawn), drawn, page, focus: 0 });
      for (const t of sc.texts.filter((x) => x.y === 4 && x.x > 100)) { expect(t.text.length).toBeLessThanOrEqual(16); expect(t.color).toBe('Ink'); }
    }
  });
});

describe('BB2: a race page\'s pixels y0-209 are the approved program page\'s, less the bank, band, ticket and Pass', () => {
  const render = (r: number, open: boolean, focus: number) => {
    const drawn = drawnOf()[r - 1];
    const program = programOf(r);
    const odds = quote(ctx, program, null).odds;
    const page = racePageState(book, { page: r, nextRace: r, fieldSize: 8, records: [], posted: open ? new Map([[r, odds]]) : new Map() });
    const b = racePageScreen({ book, ctx, rd, look: lookFor(drawn), drawn, page, focus });
    const p = programScreen(inputFor(open ? program : null, drawn, dayWith(10000), { focus, mode: { kind: 'choosing' } }));
    return { b, p };
  };

  it('every entry, the heads, the rules, the odds column and the header lines equal the program page\'s; only the right slot of line 1 differs', () => {
    for (const r of [1, 4, 8]) {
      for (const open of [true, false]) {
        const { b, p } = render(r, open, r % 3);
        expect(b.entries, `race ${r}`).toEqual(p.rows);
        expect(b.rects).toEqual(p.rules);
        const top = <T extends { y: number }>(xs: readonly T[]) => xs.filter((t) => t.y < 210);
        const bankText = p.header[1];
        const expected = top([...p.header.filter((t) => t !== bankText), ...p.heads, ...p.odds]);
        const rightSlot = b.texts.filter((t) => t.y === 4 && t.x > 100);
        const rest = top(b.texts).filter((t) => !rightSlot.includes(t));
        expect(rest).toEqual(expected);
        expect(rightSlot.length).toBe(open ? 1 : 0);
      }
    }
  });

  it('no band, no ticket, no Pass and no bank are drawn', () => {
    const { b, p } = render(3, true, 2);
    expect(p.band).toEqual([]); // (the approved page draws none while choosing either)
    // the band the program page draws on the horse being bet on is not drawn in the book
    const band = programScreen(inputFor(programOf(3), drawnOf()[2], dayWith(10000), { focus: 2, mode: { kind: 'ticket', dollars: 2 } })).band;
    expect(band.length).toBeGreaterThan(0);
    const drawnRects = [...b.rects, ...b.entries.flatMap((e) => e.rects)].map((r) => JSON.stringify(r));
    for (const r of band) expect(drawnRects).not.toContain(JSON.stringify(r));
    expect(b.texts.some((t) => t.text.startsWith('Bank'))).toBe(false);
    expect(b.texts.some((t) => t.text === rd.copy.program.pass)).toBe(false);
    expect(b.texts.some((t) => t.text.includes('Pass'))).toBe(false);
    expect(b.texts.some((t) => /pays|\$/.test(t.text))).toBe(false);
    expect(b.texts.some((t) => t.text === rd.copy.ticket.confirm)).toBe(false);
  });

  it('the footer: line 1 (y214) is the focused horse\'s blurb, or the pending line; line 2 (y226) is the running foot, not "Pass this race"', () => {
    const open = render(3, true, 4).b;
    const pending = render(3, false, 4).b;
    const drawn = drawnOf()[2];
    const horse = [...drawn.input.card.horses].sort((a, b) => a.post - b.post)[4];
    expect(open.texts.find((t) => t.y === 214)?.text).toBe(lookFor(drawn)[horse.id].blurb);
    expect(pending.texts.find((t) => t.y === 214)?.text).toBe('The crowd is still betting.');
    for (const sc of [open, pending]) {
      expect(sc.texts.filter((t) => t.y === 226).map((t) => t.text)).toEqual(['< Race 2', 'Esc: close', 'Race 4 >']);
    }
  });

  it('race 3\'s page is one page right of race 2\'s: the foot names its neighbors', () => {
    expect(runningFoot(book, 4, RACES)).toEqual({ prev: '< Race 2', close: 'Esc: close', next: 'Race 4 >' });
  });
});

describe('BB6: the running foot shows the right items on every page, fits its fields, and each item does what its key does', () => {
  const targets = (page: number) => bookPointerTargets(book, { page, focus: 0 }, kctx(page));
  const at = (page: number, x: number, y: number) => hitTest(targets(page), { x, y });

  it('prev x8-79, close x80-175, next x176-247, all y222-235; the cover has no prev, race 8 has no next', () => {
    for (let p = 0; p <= RACES + 1; p++) {
      const prev = at(p, 8, 222);
      const close = at(p, 80, 235);
      const next = at(p, 247, 235);
      expect(prev, `page ${p}`).toBe(p === 0 ? null : 'prev');
      expect(at(p, 79, 235)).toBe(p === 0 ? null : 'prev');
      expect(close).toBe('close');
      expect(at(p, 175, 222)).toBe('close');
      expect(next).toBe(p === RACES + 1 ? null : 'next');
      expect(at(p, 176, 222)).toBe(p === RACES + 1 ? null : 'next');
      expect(at(p, 100, 221)).not.toBe('close');
    }
  });

  it('the cover\'s body is x0-255, y0-209 and turns the page; race entry k is x8-247, y57 + 19(k-1) to y75 + 19(k-1)', () => {
    const cov = (x: number, y: number) => hitTest(targets(0), { x, y });
    expect(cov(0, 0)).toBe('cover');
    expect(cov(255, 209)).toBe('cover');
    expect(cov(128, 210)).toBeNull();
    expect(cov(128, 221)).toBeNull();
    for (let n = 1; n <= 8; n++) {
      const top = 57 + 19 * (n - 1);
      expect(at(4, 8, top)).toBe(`entry:${n}`);
      expect(at(4, 247, top + 18)).toBe(`entry:${n}`);
      expect(at(4, 7, top + 9)).toBeNull();
    }
    expect(at(4, 100, 56)).toBeNull();
    expect(at(4, 100, 209)).toBeNull();
  });

  it('every foot text is at most 8 characters of name and prints at cell top y226; "Esc: close" is centered in x88-167', () => {
    const names: string[] = ['Cover', 'News', ...Array.from({ length: RACES }, (_v, i) => `Race ${i + 1}`)];
    for (let p = 0; p <= RACES + 1; p++) {
      const f = runningFoot(book, p, RACES);
      expect(f.close).toBe('Esc: close');
      expect(f.prev).toBe(p === 0 ? null : `< ${names[p - 1]}`);
      expect(f.next).toBe(p === RACES + 1 ? null : `${names[p + 1]} >`);
      for (const t of [f.prev, f.next]) if (t !== null) expect(t.length).toBeLessThanOrEqual(8);
    }
  });

  it('a click on each foot item is the key it stands for', () => {
    const s: BookState = { page: 5, focus: 2 };
    const k = kctx(5);
    const byClick = (id: 'prev' | 'close' | 'next') => bookKey(s, { prev: 'ArrowLeft', close: 'Escape', next: 'ArrowRight' }[id], k);
    expect(byClick('prev').state.page).toBe(4);
    expect(byClick('next').state.page).toBe(6);
    expect(byClick('close').outcome).toEqual({ kind: 'close' });
  });

  it('every page prints its foot (cover, news and a race page)', () => {
    const racePage = (() => {
      const drawn = drawnOf()[0];
      return racePageScreen({ book, ctx, rd, look: lookFor(drawn), drawn, page: racePageState(book, { page: 1, nextRace: 1, fieldSize: 8, records: [], posted: new Map() }), focus: 0 });
    })();
    for (const sc of [covScreen, nwsScreen, racePage]) expect(sc.texts.some((t) => t.y === 226 && t.text === 'Esc: close' && t.x === 88)).toBe(true);
  });
});

describe('the news page layout (section 4 wireframe)', () => {
  it('the title "Rail Talk" Maroon at y4, the subtitle at y14, five headlines in Maroon at y30 + 36k, bodies in Ink at +10 and +20', () => {
    expect(nwsScreen.texts).toContainEqual({ text: 'Rail Talk', x: 8, y: 4, color: 'Maroon' });
    expect(nwsScreen.texts).toContainEqual({ text: 'Gossip, facts and peanuts.', x: 8, y: 14, color: 'Ink' });
    news.forEach((item, k) => {
      expect(nwsScreen.texts).toContainEqual({ text: item.headline, x: 8, y: 30 + 36 * k, color: 'Maroon' });
      item.body.forEach((line, j) => expect(nwsScreen.texts).toContainEqual({ text: line, x: 8, y: 30 + 36 * k + 10 * (j + 1), color: 'Ink' }));
    });
    expect(paint(nwsScreen.rects).get('100,24')).toBe('Ink');
    expect(paint(nwsScreen.rects).get('100,210')).toBe('Ink');
  });

  it('nothing but headlines and the title is Maroon (news bodies, subtitle and foot are Ink)', () => {
    const maroon = nwsScreen.texts.filter((t) => t.color === 'Maroon').map((t) => t.text).sort();
    expect(maroon).toEqual(['Rail Talk', ...news.map((n) => n.headline)].sort());
  });

  it('the foot of the news page: "< Cover", "Esc: close", "Race 1 >"', () => {
    expect(nwsScreen.texts.filter((t) => t.y === 226).map((t) => t.text)).toEqual(['< Cover', 'Esc: close', 'Race 1 >']);
  });

  it('the aria text reads every headline and body in order and never a price', () => {
    let at = 0;
    for (const n of news) { const i = nwsScreen.aria.indexOf(n.headline, at); expect(i).toBeGreaterThanOrEqual(at); at = i; }
  });
});
