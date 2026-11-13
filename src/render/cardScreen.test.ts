import { describe, expect, it } from 'vitest';
import { GOINGS_BY_SURFACE } from '../data/schema';
import type { GameData } from '../data/schema';
import { cardKey, cardScreen, initialCardState, type CardState } from './cardScreen';
import { goToPost, newSession, type Session } from './session';
import { deepFreeze, game, rd, shippedRaceDay } from './testkit';

// The card (spec 4.1): CD1 for what it draws, and its keys. Expected strings come from the
// spec's diagram and tables and from card.json and cardLook.json, not from cardScreen.ts.

const look = shippedRaceDay.cardLook;
const byPost = [...game.card.horses].sort((a, b) => a.post - b.post);
const STYLE = { frontRunner: 'Front', stalker: 'Stalker', closer: 'Closer' } as const;
const first = newSession(1234);
const screenFor = (g: GameData = game, session: Session = first, state: CardState = { focus: 0 }, l = look) => cardScreen(g, rd, l, session, state);
const withRace = (patch: Partial<GameData['race']>): GameData => ({ ...structuredClone(game), race: { ...structuredClone(game.race), ...patch } });

describe('CD1: the header', () => {
  it('four lines at x8, y8 + 10 i: race name, track, conditions, bias', () => {
    const s = screenFor();
    expect(s.header.map((t) => [t.text, t.x, t.y, t.color])).toEqual([
      ['Old Fence Row Stakes', 8, 8, 'Bone'],
      ['Churchill Downs', 8, 18, 'Bone'],
      ['1 1/4 miles, dirt, fast', 8, 28, 'Bone'],
      ['Track playing fair', 8, 38, 'Bone'],
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

  it('every header line fits the 30-character box, for every distance, surface, going and bias', () => {
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

describe('CD1: the rows', () => {
  const s = screenFor();

  it('eight rows by post, 1 at the top, at y72 + 12 i', () => {
    expect(s.rows.map((r) => r.post)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    s.rows.forEach((r, i) => {
      expect(r.id).toBe(byPost[i].id);
      expect(r.texts.every((t) => t.y === 72 + 12 * i)).toBe(true);
    });
  });

  // Updated on purpose (art-director's review of the running card, spec 4.1): the style column
  // moved from x184 to x192-247. The longest name ends at x176, and at x184 the style word read
  // as part of it. Seven characters fill the new column exactly.
  it('the columns: saddlecloth box x20 (10x10), name x34, style x192 in the words Front, Stalker, Closer', () => {
    s.rows.forEach((r, i) => {
      expect(r.cloth.x).toBe(20);
      expect(r.cloth.size).toBe(10);
      expect(r.cloth.y).toBeGreaterThanOrEqual(72 + 12 * i - 2);
      expect(r.cloth.y + 10).toBeLessThanOrEqual(72 + 12 * i + 10);
      const [name, style] = r.texts;
      expect([name.text, name.x]).toEqual([byPost[i].name, 34]);
      expect([style.text, style.x]).toEqual([STYLE[byPost[i].style], 192]);
    });
  });

  it('the cursor is at x8 on the focused row, and moves with the focus', () => {
    for (const focus of [0, 3, 7]) expect(screenFor(game, first, { focus }).cursor).toEqual({ x: 8, y: 72 + 12 * focus });
  });

  // Updated on purpose (same ruling): the style field is x192-247, so the word must end by x248
  // and start no earlier than x192, and the name and the style never touch (a gap of 14 px or more: the name field ends at x177, the style field starts at x192).
  it('every string is inside its field for the shipped data: name x34-177, style x192-247, saddlecloth box before the name', () => {
    for (const r of s.rows) {
      const [name, style] = r.texts;
      expect(name.x + 8 * name.text.length).toBeLessThanOrEqual(178);
      expect(style.x).toBeGreaterThanOrEqual(192);
      expect(style.x + 8 * style.text.length).toBeLessThanOrEqual(248);
      expect(style.x - (name.x + 8 * name.text.length)).toBeGreaterThanOrEqual(14);
      expect(r.cloth.x + r.cloth.size).toBeLessThanOrEqual(name.x);
    }
  });

  it('an 18-character name fits its 144 px, and its style word is at most 7 characters', () => {
    const g = structuredClone(game);
    g.card.horses[0].name = 'Mint Julep Lawsuit';
    const row = screenFor(g).rows.find((r) => r.id === g.card.horses[0].id)!;
    expect(row.texts[0].x + 8 * row.texts[0].text.length).toBe(34 + 144);
    for (const w of Object.values(STYLE)) expect(w.length).toBeLessThanOrEqual(7);
  });

  it('fewer than 8 horses: the rows end early, with no gap', () => {
    const g = structuredClone(game);
    g.card.horses = g.card.horses.filter((h) => [2, 4, 5, 8].includes(h.post));
    const few = screenFor(g, first, { focus: 3 });
    expect(few.rows.map((r) => r.post)).toEqual([2, 4, 5, 8]);
    expect(few.rows.map((r) => r.texts[0].y)).toEqual([72, 84, 96, 108]);
    expect(few.cursor.y).toBe(108);
    expect(few.detail[0].text).toBe(`Jockey ${g.card.horses.find((h) => h.post === 8)!.jockey}`);
  });
});

describe('CD1: the detail lines', () => {
  it('four lines at y184 + 12 i: jockey, stats, blurb, then the hint', () => {
    byPost.forEach((h, i) => {
      const d = screenFor(game, first, { focus: i }).detail;
      expect(d.map((t) => t.y)).toEqual([184, 196, 208, 220]);
      expect(d.every((t) => t.x === 8)).toBe(true);
      expect(d.map((t) => t.text)).toEqual([
        `Jockey ${h.jockey}`,
        `Speed ${h.stats.speed}  Stamina ${h.stats.stamina}  Kick ${h.stats.kick}`,
        look[h.id].blurb ?? '',
        'Enter: pick this horse',
      ]);
    });
  });

  it('every detail line fits the 30-character box for every horse on the shipped card', () => {
    byPost.forEach((_h, i) => {
      for (const t of screenFor(game, first, { focus: i }).detail) expect(t.text.length, t.text).toBeLessThanOrEqual(30);
    });
  });

  it('a jockey name of 22 characters and 3-digit stats still fit 30 characters', () => {
    const g = structuredClone(game);
    g.card.horses[0].jockey = 'M'.repeat(22);
    const d = screenFor(g, first, { focus: byPost.findIndex((h) => h.id === g.card.horses[0].id) }).detail;
    expect(d[0].text.length).toBe(29);
    expect(d[0].text.length).toBeLessThanOrEqual(30);
  });

  it('with no blurb in data line 3 is blank, with no placeholder text', () => {
    const bare = structuredClone(look);
    for (const k of Object.keys(bare)) delete (bare[k] as { blurb?: string }).blurb;
    for (let i = 0; i < 8; i++) expect(screenFor(game, first, { focus: i }, bare).detail[2].text).toBe('');
  });

  it('a blurb never leaks to another horse', () => {
    const blurbs = new Set(byPost.map((h) => screenFor(game, first, { focus: byPost.indexOf(h) }).detail[2].text));
    expect(blurbs.size).toBe(8);
  });
});

describe('CD1: last race\'s pick', () => {
  const after = goToPost(newSession(77), 5, { early: 'default', move: 'default', path: 'default' }).session;

  it('its name is Yellow, no other row is, and the first race has none', () => {
    const s = screenFor(game, after);
    s.rows.forEach((r) => {
      expect(r.lastPick).toBe(r.post === 5);
      expect(r.texts[0].color).toBe(r.post === 5 ? 'Yellow' : 'Bone');
    });
    for (const r of screenFor().rows) expect(r.texts[0].color).toBe('Bone');
  });

  it('its detail line 4 reads "Your pick last race", the hint on every other horse', () => {
    byPost.forEach((h, i) => {
      expect(screenFor(game, after, { focus: i }).detail[3].text).toBe(h.post === 5 ? 'Your pick last race' : 'Enter: pick this horse');
    });
  });

  it('the pick is made the last pick by sending it to the post, not by looking at it', () => {
    expect(screenFor(game, { ...first, pickPost: 5 }).rows.some((r) => r.lastPick)).toBe(false);
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
