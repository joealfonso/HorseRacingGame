import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GOINGS_BY_SURFACE } from '../data/schema';
import type { GameData } from '../data/schema';
import { CARD_SLOT_IDS, cardKey, cardScreen, entryTop, initialCardState, swipeFrame, type CardState, type CardSwipe } from './cardScreen';
import { goToPost, keepOrders, newSession, type Session } from './session';
import { CLOTH_BY_POST, ENTRY_BAND_ROWS, cellOf, deepFreeze, expectedSpans, game, paintRects, pixelAt, rd, shippedRaceDay, yellowSpans } from './testkit';

// The Card as a program page (spec 4.1, DESIGN "Program pages"): CD1 for what it draws,
// CD5 for the string fits, CD6 for the band, the tick and the swipe, CD7 for the footer, and
// its keys. Expected strings and positions come from the spec's wireframe and entry table
// and from card.json and cardLook.json, not from cardScreen.ts.
//
// Rewritten on purpose for the 2026-11-13 rework (Joseph: "like a real horse racing book"):
// the header moved from y8 to y4 and the race name went Maroon; the rows became 17 px entries
// at y58 + 19i with a 16x17 saddlecloth block, three stats as number and bar, and a Maroon
// style word right-aligned to x247; the four-line detail box became a two-line footer at y214
// and y226; last race's pick is the Yellow highlighter band and the pencil tick, not Yellow
// text. The key tests are unchanged. The old detail-box tests are gone with the box (the
// jockey line, the stats line and the hint no longer exist), and their intent, a blurb that
// never leaks, 22-character jockeys that fit, no blurb meaning an empty line, is kept in CD7
// and CD5 below.

const look = shippedRaceDay.cardLook;
const byPost = [...game.card.horses].sort((a, b) => a.post - b.post);
const STYLE = { frontRunner: 'Front', stalker: 'Stalker', closer: 'Closer' } as const;
const DEFAULTS = { early: 'default', move: 'default', path: 'default' } as const;
const first = newSession(1234);
const afterRace = (post: number): Session => goToPost(newSession(77), post, { ...DEFAULTS }).session;
const screenFor = (g: GameData = game, session: Session = first, state: CardState = { focus: 0 }, l = look, swipe: CardSwipe | null = null) =>
  cardScreen(g, rd, l, session, state, swipe);
const withRace = (patch: Partial<GameData['race']>): GameData => ({ ...structuredClone(game), race: { ...structuredClone(game.race), ...patch } });
const top = (i: number) => 58 + 19 * i;
const readScene = (f: string): string => readFileSync(new URL(`../scenes/${f}`, import.meta.url), 'utf8');

describe('CD1: the header', () => {
  it('four lines at x8, y4 + 10 i: race name in Maroon, then track, conditions, bias in Ink', () => {
    const s = screenFor();
    expect(s.header.map((t) => [t.text, t.x, t.y, t.color])).toEqual([
      ['Old Fence Row Stakes', 8, 4, 'Maroon'],
      ['Churchill Downs', 8, 14, 'Ink'],
      ['1 1/4 miles, dirt, fast', 8, 24, 'Ink'],
      ['Track playing fair', 8, 34, 'Ink'],
    ]);
  });

  it.each([[5, '5 furlongs'], [6, '6 furlongs'], [7, '7 furlongs'], [8, '1 mile'], [9, '1 1/8 miles'], [10, '1 1/4 miles'], [11, '1 3/8 miles'], [12, '1 1/2 miles']])(
    'distance words for %i furlongs: "%s"',
    (furlongs, words) => {
      expect(screenFor(withRace({ distanceFurlongs: furlongs })).header[2].text).toBe(`${words}, dirt, fast`);
    },
  );

  it('the surface and going words for every going the sim allows, every distance', () => {
    for (const [surface, goings] of Object.entries(GOINGS_BY_SURFACE)) {
      for (const going of goings) {
        const line = screenFor(withRace({ surface: surface as 'dirt', going: going as 'fast' })).header[2].text;
        expect(line).toBe(`1 1/4 miles, ${surface}, ${going}`);
      }
    }
  });

  it.each([
    ['neutral', 'neutral', 'Track playing fair'],
    ['inside', 'neutral', 'Inside paths are good'],
    ['outside', 'neutral', 'Outside paths are good'],
    ['neutral', 'speed', 'Speed is holding'],
    ['neutral', 'closers', 'Closers are rolling'],
    ['inside', 'speed', 'Inside good, speed holding'],
    ['inside', 'closers', 'Inside good, closers rolling'],
    ['outside', 'speed', 'Outside good, speed holding'],
    ['outside', 'closers', 'Outside good, closers rolling'],
  ] as const)('bias lane %s, style %s reads "%s"', (lane, style, line) => {
    expect(screenFor(withRace({ trackBias: { lane, style } })).header[3].text).toBe(line);
  });

  it('every header line fits x8-247 (30 characters), for every distance, surface, going and bias', () => {
    for (const furlongs of [5, 6, 7, 8, 9, 10, 11, 12]) {
      for (const [surface, goings] of Object.entries(GOINGS_BY_SURFACE)) {
        for (const going of goings) {
          for (const lane of ['neutral', 'inside', 'outside'] as const) {
            for (const style of ['neutral', 'speed', 'closers'] as const) {
              const s = screenFor(withRace({ distanceFurlongs: furlongs, surface: surface as 'dirt', going: going as 'fast', trackBias: { lane, style } }));
              for (const t of s.header) expect(t.text.length, t.text).toBeLessThanOrEqual(30);
            }
          }
        }
      }
    }
  });
});

describe('CD1: the page', () => {
  const s = screenFor();

  it('flat Parchment, with no Navy box and no detail box', () => {
    expect(s.paper).toBe('Parchment');
    expect('boxes' in s).toBe(false);
    const all = [...s.rules, ...s.band, ...s.rows.flatMap((r) => r.rects)];
    expect(all.some((r) => r.color === 'Navy' || r.color === 'Parchment')).toBe(false);
  });

  it('1 px Ink rules across x8-247 at y44, y56 and y210, and no others (none between entries)', () => {
    expect(s.rules).toEqual([44, 56, 210].map((y) => ({ x: 8, y, w: 240, h: 1, color: 'Ink' })));
  });

  it('the column heads at y47 in Ink, each starting at its stat\'s number column: Speed x40, Stamina x108, Kick x176', () => {
    expect(s.heads.map((t) => [t.text, t.x, t.y, t.color])).toEqual([
      ['Speed', 40, 47, 'Ink'], ['Stamina', 108, 47, 'Ink'], ['Kick', 176, 47, 'Ink'],
    ]);
    expect(s.heads.map((t) => cellOf(t))).toEqual([
      { x0: 40, x1: 79, y0: 47, y1: 54 }, { x0: 108, x1: 163, y0: 47, y1: 54 }, { x0: 176, x1: 207, y0: 47, y1: 54 },
    ]);
    // y47 + 8 rows ends at y54, clear of the rule at y56.
    for (const t of s.heads) expect(t.y + 8).toBeLessThan(56);
  });

  it('the name and style columns have no head', () => {
    expect(s.heads).toHaveLength(3);
    expect(s.heads.every((t) => t.x >= 40)).toBe(true);
    expect(s.heads.some((t) => t.x === 40 && t.text !== 'Speed')).toBe(false);
  });

  it('the slots it draws are in its list for the placeholder tag: both fonts, the cursor and the pencil tick, and no frame tiles', () => {
    for (const id of ['font.ui.main', 'font.ui.small', 'art.ui.cursor.horseshoe', 'art.ui.mark.pick', 'art.ui.placeholder_tag']) expect(CARD_SLOT_IDS).toContain(id);
    expect(CARD_SLOT_IDS).not.toContain('art.ui.frame.box');
  });
});

describe('CD1: every horse by post, one entry each, top at y = 58 + 19 i', () => {
  const s = screenFor();

  it('eight entries by post, 1 at the top, whatever order card.json lists them in', () => {
    expect(game.card.horses.map((h) => h.post)).not.toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // the shipped file is not in post order, so this checks the sort
    expect(s.rows.map((r) => r.post)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    s.rows.forEach((r, i) => {
      expect(r.id).toBe(byPost[i].id);
      expect(r.top).toBe(58 + 19 * i);
      expect(entryTop(i)).toBe(58 + 19 * i);
    });
    expect(s.rows[7].top).toBe(191);
  });

  it('the saddlecloth block is 16x17 at x20-35 with a 1 px Ink border, and the fill of that cloth inside', () => {
    s.rows.forEach((r) => {
      const t = r.top;
      expect(r.cloth).toEqual({ x: 20, y: t, w: 16, h: 17 });
      const px = paintRects(r.rects);
      for (let x = 20; x <= 35; x++) for (const y of [t, t + 16]) expect(pixelAt(px, x, y), `post ${r.post} border ${x},${y}`).toBe('Ink');
      for (let y = t; y <= t + 16; y++) for (const x of [20, 35]) expect(pixelAt(px, x, y), `post ${r.post} border ${x},${y}`).toBe('Ink');
      for (let y = t + 1; y <= t + 15; y++) for (let x = 21; x <= 34; x++) expect(pixelAt(px, x, y), `post ${r.post} fill ${x},${y}`).toBe(CLOTH_BY_POST[r.post].fill);
    });
  });

  it('the program number is in the main font in that cloth\'s number color, centered in the block', () => {
    s.rows.forEach((r) => {
      const n = r.texts.find((t) => t.text === String(r.post) && t.x >= 20 && t.x < 36)!;
      expect(n, `post ${r.post}`).toBeDefined();
      expect(n.small).toBeFalsy();
      expect(n.color).toBe(CLOTH_BY_POST[r.post].number);
      const c = cellOf(n);
      expect(c.x0).toBeGreaterThanOrEqual(21);
      expect(c.x1).toBeLessThanOrEqual(34);
      expect(c.y0).toBeGreaterThanOrEqual(r.top + 1);
      expect(c.y1).toBeLessThanOrEqual(r.top + 15);
      // The block's center is x27.5 and y = top + 8; the 8x8 cell's own center is within 2 px of it.
      expect(Math.abs((c.x0 + c.x1) / 2 - 27.5)).toBeLessThanOrEqual(2);
      expect(Math.abs((c.y0 + c.y1) / 2 - (r.top + 8))).toBeLessThanOrEqual(2);
    });
  });

  it('the name is Ink in the main font at x40, y at the entry\'s top', () => {
    s.rows.forEach((r, i) => {
      const t = r.texts.find((x) => x.text === byPost[i].name)!;
      expect([t.x, t.y, t.color]).toEqual([40, r.top, 'Ink']);
      expect(t.small).toBeFalsy();
    });
  });

  it('the style word is Maroon, right-aligned to end at x247: Front x208-247, Stalker x192-247, Closer x200-247', () => {
    const START = { Front: 208, Stalker: 192, Closer: 200 } as const;
    s.rows.forEach((r, i) => {
      const word = STYLE[byPost[i].style];
      const t = r.texts.find((x) => x.text === word)!;
      expect([t.x, t.y, t.color]).toEqual([START[word], r.top, 'Maroon']);
      expect(cellOf(t).x1).toBe(247);
    });
  });

  it('each stat is a two-digit small-font number at x40, x108 and x176, Ink, 10 rows into the entry', () => {
    s.rows.forEach((r, i) => {
      const h = byPost[i];
      for (const [x, v] of [[40, h.stats.speed], [108, h.stats.stamina], [176, h.stats.kick]] as const) {
        const t = r.texts.find((q) => q.small && q.x === x)!;
        expect([t.text, t.y, t.color], `post ${r.post} x${x}`).toEqual([String(v), r.top + 10, 'Ink']);
        expect(t.text).toHaveLength(2);
        expect(cellOf(t)).toEqual({ x0: x, x1: x + 7, y0: r.top + 10, y1: r.top + 15 });
      }
      expect(r.texts.filter((q) => q.small)).toHaveLength(3);
    });
  });

  it('each stat\'s bar starts at x50, x118 and x186, on rows +11 to +13, 3 px of Ink on a 50 px Ash track', () => {
    s.rows.forEach((r, i) => {
      const h = byPost[i];
      const px = paintRects(r.rects);
      for (const [x, v] of [[50, h.stats.speed], [118, h.stats.stamina], [186, h.stats.kick]] as const) {
        const len = Math.floor(((v - 1) * 50) / 99);
        for (let k = 0; k < 50; k++) {
          for (const dy of [11, 13]) expect(pixelAt(px, x + k, r.top + dy), `post ${r.post} x${x} k${k} dy${dy}`).toBe(k < len ? 'Ink' : k === 49 ? 'Ash' : undefined);
          expect(pixelAt(px, x + k, r.top + 12), `post ${r.post} x${x} k${k} dy12`).toBe(k < len ? 'Ink' : 'Ash');
        }
        expect(pixelAt(px, x - 1, r.top + 12)).toBeUndefined();
        expect(pixelAt(px, x + 50, r.top + 12)).toBeUndefined();
      }
    });
  });

  it('the shipped card\'s bars: 58 is 28 px and 86 is 42 px', () => {
    const lengths = (id: string, x: number) => {
      const r = s.rows.find((q) => q.id === id)!;
      let n = 0;
      while (pixelAt(paintRects(r.rects), x + n, r.top + 11) === 'Ink') n++;
      return n;
    };
    expect(byPost.find((h) => h.id === 'h8')!.stats.speed).toBe(58);
    expect(lengths('h8', 50)).toBe(28);
    expect(byPost.find((h) => h.id === 'h1')!.stats.speed).toBe(86);
    expect(lengths('h1', 50)).toBe(42);
  });

  it('nothing in an entry strays outside its 17 rows or past x247, and every coordinate is a whole number', () => {
    for (const r of s.rows) {
      for (const x of r.rects) {
        expect(x.y).toBeGreaterThanOrEqual(r.top);
        expect(x.y + x.h).toBeLessThanOrEqual(r.top + 17);
        expect(x.x + x.w).toBeLessThanOrEqual(248);
        for (const v of [x.x, x.y, x.w, x.h]) expect(Number.isInteger(v)).toBe(true);
      }
      for (const t of r.texts) {
        const c = cellOf(t);
        expect(c.y0).toBeGreaterThanOrEqual(r.top);
        expect(c.y1).toBeLessThanOrEqual(r.top + 16);
        expect(c.x1).toBeLessThanOrEqual(247);
        expect(Number.isInteger(t.x) && Number.isInteger(t.y)).toBe(true);
      }
    }
  });

  it('there is a 2 px gap between one entry and the next (17 px tall, 19 px pitch)', () => {
    for (let i = 0; i + 1 < s.rows.length; i++) expect(s.rows[i + 1].top - (s.rows[i].top + 17)).toBe(2);
  });
});

describe('CD1: the cursor', () => {
  it('is at x8 on the focused entry, 5 rows into it, and moves with the focus', () => {
    for (const focus of [0, 3, 7]) expect(screenFor(game, first, { focus }).cursor).toEqual({ x: 8, y: 58 + 19 * focus + 5 });
  });

  it('the horseshoe (x8-15) is left of the saddlecloth block (x20) for every focus', () => {
    for (let focus = 0; focus < 8; focus++) expect(screenFor(game, first, { focus }).cursor.x + 8).toBeLessThanOrEqual(20);
  });
});

describe('CD5: every string fits its field with the longest data the schemas allow', () => {
  const horse0 = game.card.horses.find((h) => h.post === 8)!;
  const longGame = (): GameData => {
    const g = structuredClone(game);
    g.race.name = 'Race Name Of Thirty Characters';
    g.race.track = 'T'.repeat(30);
    const h = g.card.horses.find((x) => x.post === 8)!;
    h.name = 'Mint Julep Lawsuit'; // 18 characters
    h.jockey = 'J'.repeat(22);
    return g;
  };
  const longLook = () => {
    const l = structuredClone(look);
    l[horse0.id].blurb = 'B'.repeat(28);
    return l;
  };

  it('a name of 18 characters fills x40-183 exactly, and the style word then starts at x192 or later, clear of it', () => {
    const g = longGame();
    expect(g.card.horses.find((x) => x.post === 8)!.name).toHaveLength(18);
    const row = screenFor(g).rows[7];
    const name = row.texts.find((t) => t.text === 'Mint Julep Lawsuit')!;
    const style = row.texts.find((t) => t.text === 'Stalker')!;
    expect(cellOf(name)).toMatchObject({ x0: 40, x1: 183 });
    expect(style.x).toBeGreaterThanOrEqual(192);
    expect(cellOf(style).x1).toBe(247);
    expect(style.x - (cellOf(name).x1 + 1)).toBeGreaterThanOrEqual(8); // never overlapping, one cell apart at least
  });

  it('a style word of 1 to 7 characters ends at x247 and starts no earlier than x192 (the loader holds it to 7)', () => {
    for (let n = 1; n <= 7; n++) {
      const r2 = structuredClone(rd);
      r2.copy.card.styles.stalker = 'S'.repeat(n);
      const row = cardScreen(longGame(), r2, look, first, { focus: 0 }).rows[7];
      const t = row.texts.find((x) => x.text === 'S'.repeat(n))!;
      expect(cellOf(t).x1, `${n} characters`).toBe(247);
      expect(t.x, `${n} characters`).toBeGreaterThanOrEqual(192);
      expect(t.color).toBe('Maroon');
    }
  });

  it('a 30-character race name and track name fill x8-247 and no more', () => {
    const s = screenFor(longGame());
    expect(s.header[0].text).toHaveLength(30);
    expect(s.header[1].text).toHaveLength(30);
    expect(cellOf(s.header[0])).toMatchObject({ x0: 8, x1: 247 });
    expect(cellOf(s.header[1])).toMatchObject({ x0: 8, x1: 247 });
  });

  it('"{jockey} up" with a 22-character jockey ends at x207, and a 28-character blurb at x231', () => {
    const s = screenFor(longGame(), first, { focus: 7 }, longLook());
    const [rider, blurb] = s.detail;
    expect(rider.text).toBe(`${'J'.repeat(22)} up`);
    expect(rider.text).toHaveLength(25);
    expect(cellOf(rider)).toMatchObject({ x0: 8, x1: 207 });
    expect(blurb.text).toHaveLength(28);
    expect(cellOf(blurb)).toMatchObject({ x0: 8, x1: 231 });
  });

  it('every footer line for every horse on the shipped card fits x8-247', () => {
    byPost.forEach((_h, i) => {
      for (const t of screenFor(game, first, { focus: i }).detail) expect(cellOf(t).x1, t.text).toBeLessThanOrEqual(247);
    });
  });
});

describe('CD6: last race\'s pick, the highlighter band and the pencil tick', () => {
  const bandSpans = (s: ReturnType<typeof screenFor>) => yellowSpans(paintRects(s.band));
  const ticks = (s: ReturnType<typeof screenFor>) => s.rows.flatMap((r) => r.images.map((im) => ({ post: r.post, ...im })));

  it('first race: no band and no tick anywhere, and focus on post 1', () => {
    const s = screenFor(game, first, initialCardState(game.card, first));
    expect(s.band).toEqual([]);
    expect(ticks(s)).toEqual([]);
    expect(initialCardState(game.card, first).focus).toBe(0);
    expect(s.cursor).toEqual({ x: 8, y: 63 });
    expect(s.detail[0].text).toBe(`${byPost[0].jockey} up`);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('after a race on post %i: the band on its entry, the tick on it alone, and focus starting on it', (post) => {
    const session = afterRace(post);
    const state = initialCardState(game.card, session);
    expect(state.focus).toBe(post - 1);
    const s = screenFor(game, session, state);
    const i = post - 1;
    // The band is x16-250 over the entry's 17 rows plus one above and one below, chiseled as DESIGN gives it.
    expect(bandSpans(s)).toEqual(expectedSpans(top(i) - 1, ENTRY_BAND_ROWS));
    // The tick: the pencil mark art at x238, 9 rows into the entry, on the pick only.
    expect(ticks(s)).toEqual([{ post, slot: 'art.ui.mark.pick', x: 238, y: top(i) + 9 }]);
    expect(s.cursor.y).toBe(top(i) + 5);
  });

  it('the band is one block, 19 rows, never touching the rules at y56 and y210', () => {
    for (let post = 1; post <= 8; post++) {
      const rows = [...bandSpans(screenFor(game, afterRace(post))).keys()];
      expect(rows).toHaveLength(19);
      expect(Math.min(...rows)).toBeGreaterThan(56);
      expect(Math.max(...rows)).toBeLessThan(210);
    }
  });

  it('no chisel step sits under the saddlecloth block, any text, the tick or the cursor', () => {
    for (let post = 1; post <= 8; post++) {
      const s = screenFor(game, afterRace(post));
      const spans = bandSpans(s);
      const e = s.rows[post - 1];
      const marked = [
        { x0: 20, x1: 35, y0: e.top, y1: e.top + 16 },
        ...e.texts.map(cellOf),
        { x0: 238, x1: 245, y0: e.top + 9, y1: e.top + 16 }, // the tick's 8x8
      ];
      for (const c of marked) {
        for (let y = c.y0; y <= c.y1; y++) {
          const [a, b] = spans.get(y)!;
          expect(a, `post ${post} row ${y}: the band's left end vs a mark at x${c.x0}`).toBeLessThanOrEqual(c.x0);
          expect(b, `post ${post} row ${y}: the band's right end vs a mark ending x${c.x1}`).toBeGreaterThanOrEqual(c.x1);
        }
      }
      // The cursor is wholly left of the band, so no step is under it.
      for (const [a] of spans.values()) expect(a).toBeGreaterThan(s.cursor.x + 7);
    }
  });

  it('the band is a separate layer from the entries (drawn under them) and does not recolor any entry', () => {
    const s = screenFor(game, afterRace(4));
    const plain = screenFor(game, first);
    expect(s.rows.map((r) => ({ ...r, images: [] }))).toEqual(plain.rows);
  });

  it('back from Orders without a different pick: focus on the horse you were looking at, the band and tick still on last race\'s pick', () => {
    const back = keepOrders(afterRace(5), 3, { ...DEFAULTS });
    const state = initialCardState(game.card, back);
    expect(state.focus).toBe(2);
    const s = screenFor(game, back, state);
    expect(s.cursor.y).toBe(top(2) + 5);
    expect(s.detail[0].text).toBe(`${byPost[2].jockey} up`);
    expect(bandSpans(s)).toEqual(expectedSpans(top(4) - 1, ENTRY_BAND_ROWS));
    expect(ticks(s)).toEqual([{ post: 5, slot: 'art.ui.mark.pick', x: 238, y: top(4) + 9 }]);
  });

  it('looking at a horse is not picking it: before the first race goes to the post there is still no band', () => {
    const looked = { ...newSession(5), pickPost: 5 };
    const s = screenFor(game, looked, initialCardState(game.card, looked));
    expect(s.band).toEqual([]);
    expect(ticks(s)).toEqual([]);
  });

  it('the band is moved by data: another shape, another cut', () => {
    const r2 = structuredClone(rd);
    r2.program.entryBand.value = { x0: 16, x1: 240, rows: 19, leftSteps: [3, 2, 1, 0], rightSteps: [0, 2, 4, 6] };
    const s = cardScreen(game, r2, look, afterRace(1), { focus: 0 });
    expect([...yellowSpans(paintRects(s.band)).values()].map(([, b]) => b)).toEqual([
      ...Array(5).fill(240), ...Array(5).fill(238), ...Array(5).fill(236), ...Array(4).fill(234),
    ]);
  });
});

describe('CD6: the swipe on Enter', () => {
  const session = afterRace(5); // last race's pick is post 5
  const frame = (post: number, f: 1 | 2) => screenFor(game, session, { focus: post - 1 }, look, { post, frame: f });
  const spansOf = (s: ReturnType<typeof screenFor>) => yellowSpans(paintRects(s.band));
  const ticks = (s: ReturnType<typeof screenFor>) => s.rows.flatMap((r) => r.images.map((im) => ({ post: r.post, ...im })));

  it('frame 1: the band from x16 to x132 on the new pick with a chisel end there, and no tick', () => {
    const s = frame(2, 1);
    const half = [...spansOf(s)];
    expect(half.map(([y]) => y)).toEqual(Array.from({ length: 19 }, (_v, i) => top(1) - 1 + i));
    // Left end as on the whole band; right end steps 0, 1, 2, 3 px in from x132, in the same four groups.
    const expected = ENTRY_BAND_ROWS.map(([a, b]): [number, number] => [a, 132 - (250 - b)]);
    expect(half.map(([, span]) => span)).toEqual(expected);
    expect(Math.max(...half.map(([, [, b]]) => b))).toBe(132);
    expect(Math.min(...half.map(([, [a]]) => a))).toBe(16);
    expect(ticks(s)).toEqual([]);
  });

  it('frame 2: the whole band on the new pick, and the tick on it', () => {
    const s = frame(2, 2);
    expect(spansOf(s)).toEqual(expectedSpans(top(1) - 1, ENTRY_BAND_ROWS));
    expect(ticks(s)).toEqual([{ post: 2, slot: 'art.ui.mark.pick', x: 238, y: top(1) + 9 }]);
  });

  it('while it plays the old band and the old tick are gone, in both frames', () => {
    for (const f of [1, 2] as const) {
      const s = frame(2, f);
      const rows = [...spansOf(s).keys()];
      expect(rows.every((y) => y >= top(1) - 1 && y <= top(1) + 17), `frame ${f}`).toBe(true);
      expect(ticks(s).every((t) => t.post === 2), `frame ${f}`).toBe(true);
    }
  });

  it('the swipe on the horse that was already last race\'s pick plays the same two frames on it', () => {
    expect(spansOf(frame(5, 2))).toEqual(expectedSpans(top(4) - 1, ENTRY_BAND_ROWS));
    expect(ticks(frame(5, 1))).toEqual([]);
    expect(ticks(frame(5, 2))).toHaveLength(1);
  });

  it('on the first race the swipe still shows the band, where before there was none', () => {
    const s = screenFor(game, first, { focus: 6 }, look, { post: 7, frame: 2 });
    expect(spansOf(s)).toEqual(expectedSpans(top(6) - 1, ENTRY_BAND_ROWS));
    expect(ticks(s)).toHaveLength(1);
  });

  it('the swipe leaves everything else on the page as it was', () => {
    const plain = screenFor(game, session, { focus: 1 });
    const s = frame(2, 2);
    expect({ ...s, band: [], rows: [] }).toEqual({ ...plain, band: [], rows: [] });
    expect(s.rows.map((r) => ({ ...r, images: [] }))).toEqual(plain.rows.map((r) => ({ ...r, images: [] })));
  });

  it('frame 1 lasts the data\'s 0.1 s, frame 2 holds its 0.25 s, and then the hand-off', () => {
    expect([rd.program.swipeFrame1Seconds.value, rd.program.swipeFrame2Seconds.value]).toEqual([0.1, 0.25]);
    for (const [t, f] of [[0, 1], [0.05, 1], [0.099, 1], [0.1, 2], [0.2, 2], [0.349, 2], [0.351, null], [1, null]] as const) expect(swipeFrame(t, rd), `t ${t}`).toBe(f);
  });

  it('the times come from data: other seconds move the switch points', () => {
    const r2 = structuredClone(rd);
    r2.program.swipeFrame1Seconds.value = 0.125;
    r2.program.swipeFrame2Seconds.value = 0.25;
    for (const [t, f] of [[0.124, 1], [0.125, 2], [0.374, 2], [0.375, null]] as const) expect(swipeFrame(t, r2), `t ${t}`).toBe(f);
  });

  it('the scene ignores every key while the swipe runs and while it is leaving, then hands off to Orders with the pick (a read of the scene)', () => {
    const src = readScene('CardScene.ts');
    expect(src).toMatch(/private act\(code: string\): void \{\s*if \(this\.leaving \|\| this\.swipe\) return;/);
    // The keys are not even polled for repeats while the swipe plays.
    expect(src).toMatch(/if \(this\.swipe\) \{[\s\S]*?\} else if \(!this\.leaving\) \{\s*this\.keys\.update\(dt\);/);
    // A finished swipe goes to Orders for the post that was picked.
    expect(src).toMatch(/if \(frame === null\) \{\s*this\.toOrders\(this\.swipe\.post\);/);
    expect(src).toMatch(/session: pickHorse\(this\.data0\.session, post\), post/);
  });
});

describe('CD7: the footer shows the focused horse\'s jockey and blurb', () => {
  it('"{jockey} up" at x8 y214 and the blurb at x8 y226, in Ink, for every horse', () => {
    byPost.forEach((h, i) => {
      const d = screenFor(game, first, { focus: i }).detail;
      expect(d.map((t) => [t.text, t.x, t.y, t.color])).toEqual([
        [`${h.jockey} up`, 8, 214, 'Ink'],
        [look[h.id].blurb ?? '', 8, 226, 'Ink'],
      ]);
    });
  });

  it('there is no detail box: nothing but the jockey line and the blurb, no stats line, no hint, no "Your pick last race"', () => {
    for (const session of [first, afterRace(5)]) {
      byPost.forEach((_h, i) => {
        const d = screenFor(game, session, { focus: i }).detail;
        expect(d).toHaveLength(2);
        for (const t of d) expect(t.text).not.toMatch(/Speed|Stamina|Kick|Enter|pick|Jockey /);
      });
    }
  });

  it('a blurb never leaks to another horse', () => {
    const blurbs = new Set(byPost.map((_h, i) => screenFor(game, first, { focus: i }).detail[1].text));
    expect(blurbs.size).toBe(8);
  });

  it('with no blurb, line 2 is empty and line 1 still shows, with no placeholder text', () => {
    const bare = structuredClone(look);
    for (const k of Object.keys(bare)) delete (bare[k] as { blurb?: string }).blurb;
    for (let i = 0; i < 8; i++) {
      const d = screenFor(game, first, { focus: i }, bare).detail;
      expect(d[0].text).toBe(`${byPost[i].jockey} up`);
      expect(d.find((t) => t.y === 226)?.text ?? '').toBe('');
    }
  });

  it('with one horse missing its blurb the others keep theirs', () => {
    const l = structuredClone(look);
    delete (l[byPost[2].id] as { blurb?: string }).blurb;
    expect(screenFor(game, first, { focus: 2 }, l).detail[1].text).toBe('');
    expect(screenFor(game, first, { focus: 3 }, l).detail[1].text).toBe(look[byPost[3].id].blurb);
  });

  it('with fewer than 8 horses the entries end early and the y210 rule and the footer do not move', () => {
    const g = structuredClone(game);
    g.card.horses = g.card.horses.filter((h) => [2, 4, 5, 8].includes(h.post));
    const few = screenFor(g, first, { focus: 3 });
    const full = screenFor(game, first, { focus: 3 });
    expect(few.rows.map((r) => r.post)).toEqual([2, 4, 5, 8]);
    expect(few.rows.map((r) => r.top)).toEqual([58, 77, 96, 115]); // no gap
    expect(few.rules).toEqual(full.rules);
    expect(few.rules.map((r) => r.y)).toEqual([44, 56, 210]);
    expect(few.detail.map((t) => [t.x, t.y])).toEqual([[8, 214], [8, 226]]);
    expect(few.cursor.y).toBe(115 + 5);
    expect(few.detail[0].text).toBe(`${g.card.horses.find((h) => h.post === 8)!.jockey} up`);
    expect(few.heads).toEqual(full.heads);
  });

  it('a single horse still has its footer in place', () => {
    const g = structuredClone(game);
    g.card.horses = g.card.horses.filter((h) => h.post === 6);
    const s = screenFor(g, first, { focus: 0 });
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0].top).toBe(58);
    expect(s.detail.map((t) => t.y)).toEqual([214, 226]);
  });

  it('with fewer horses, the pick\'s band is still on its own entry', () => {
    const g = structuredClone(game);
    g.card.horses = g.card.horses.filter((h) => [2, 4, 5, 8].includes(h.post));
    const s = screenFor(g, afterRace(5));
    expect(yellowSpans(paintRects(s.band))).toEqual(expectedSpans(96 - 1, ENTRY_BAND_ROWS));
  });
});

describe('the card\'s keys', () => {
  const key = (focus: number, code: string) => cardKey({ focus }, code, game.card);

  it('Down and Up move one row and wrap', () => {
    expect(key(0, 'ArrowDown').state.focus).toBe(1);
    expect(key(7, 'ArrowDown').state.focus).toBe(0);
    expect(key(3, 'ArrowUp').state.focus).toBe(2);
    expect(key(0, 'ArrowUp').state.focus).toBe(7);
    for (const code of ['ArrowDown', 'ArrowUp']) expect(key(2, code).outcome).toBeNull();
  });

  it('keys 1 to 8 jump to that post, on the main row and the numpad', () => {
    for (let post = 1; post <= 8; post++) {
      expect(key(5, `Digit${post}`).state.focus, `Digit${post}`).toBe(post - 1);
      expect(key(5, `Numpad${post}`).state.focus, `Numpad${post}`).toBe(post - 1);
      expect(key(5, `Digit${post}`).outcome).toBeNull(); // jumping does not pick
    }
  });

  it('a jump to a post that is not on the card stays where it is', () => {
    const g = structuredClone(game);
    g.card.horses = g.card.horses.filter((h) => h.post <= 5);
    expect(cardKey({ focus: 2 }, 'Digit7', g.card).state.focus).toBe(2);
    expect(cardKey({ focus: 2 }, 'Digit9', g.card).state.focus).toBe(2);
  });

  it('Enter, Space and Z pick the focused horse, by its post', () => {
    for (const code of ['Enter', 'Space', 'KeyZ']) {
      for (let i = 0; i < 8; i++) {
        const r = key(i, code);
        expect(r.outcome, `${code} at ${i}`).toEqual({ kind: 'pick', post: byPost[i].post });
        expect(r.state.focus).toBe(i);
      }
    }
  });

  it('Esc does nothing here, and neither do the back keys or stray keys', () => {
    for (const code of ['Escape', 'Backspace', 'KeyX', 'ArrowLeft', 'ArrowRight', 'KeyP', 'Tab', 'Digit0']) {
      const r = key(4, code);
      expect(r.outcome, code).toBeNull();
      expect(r.state.focus, code).toBe(4);
    }
  });

  it('a key does not change the card it is given (frozen)', () => {
    const frozen = deepFreeze(structuredClone(game.card));
    for (const code of ['ArrowDown', 'Digit3', 'Enter', 'Escape']) expect(() => cardKey({ focus: 1 }, code, frozen)).not.toThrow();
  });

  it('initial focus is last race\'s pick, or post 1 on the first race', () => {
    expect(initialCardState(game.card, newSession(9)).focus).toBe(0);
    for (const post of [1, 2, 6, 8]) {
      const s = goToPost(newSession(9), post, { early: 'default', move: 'default', path: 'default' }).session;
      expect(initialCardState(game.card, s).focus).toBe(byPost.findIndex((h) => h.post === post));
    }
  });
});
