import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cardScreen } from './cardScreen';
import { ORDERS_ITEMS, ordersScreen } from './ordersScreen';
import { resultScreen } from './resultScreen';
import { goToPost, newSession } from './session';
import { game, race, rd, seeds, shippedRaceDay } from './testkit';

// Rules that hold across the three program pages (DESIGN "Program pages"): no Yellow text on
// paper, for every horse as the player and every focus, and the paper recolor of the cursor and
// the marker on those pages alone. The Navy screens keep the Yellow cursor.

const look = shippedRaceDay.cardLook;
const DEFAULTS = { early: 'default', move: 'default', path: 'default' } as const;
const sceneDir = new URL('../scenes/', import.meta.url);
const scene = (f: string) => readFileSync(new URL(f, sceneDir), 'utf8');
/** Posts 1 to 8's number sits on its saddlecloth, in that cloth's number color: 6 is a Yellow number on Coal, which is a block, not text on paper. */
const isClothNumber = (t: { text: string; x: number }) => /^[1-8]$/.test(t.text) && t.x >= 21 && t.x <= 34;

describe('no Yellow text on paper', () => {
  it('the Card, for every focus, the first race and a race after every pick, and both frames of every swipe', () => {
    const sessions = [newSession(3), ...[1, 2, 3, 4, 5, 6, 7, 8].map((p) => goToPost(newSession(3), p, { ...DEFAULTS }).session)];
    const check = (s: ReturnType<typeof cardScreen>, label: string) => {
      const texts = [...s.header, ...s.heads, ...s.detail, ...s.rows.flatMap((r) => r.texts)];
      for (const t of texts) {
        if (isClothNumber(t)) continue;
        expect(t.color, `${label}: "${t.text}"`).not.toBe('Yellow');
        expect(['Ink', 'Maroon'], `${label}: "${t.text}"`).toContain(t.color);
      }
      // The only Yellow rects on the page are the band and, as a cloth's fill, post 4's block.
      for (const r of s.rows.flatMap((x) => x.rects).filter((x) => x.color === 'Yellow')) expect(r.x).toBeGreaterThanOrEqual(21);
    };
    for (const session of sessions) {
      for (let focus = 0; focus < 8; focus++) {
        check(cardScreen(game, rd, look, session, { focus }), `focus ${focus}`);
        for (const post of [1, 4, 6, 8]) for (const frame of [1, 2] as const) check(cardScreen(game, rd, look, session, { focus }, { post, frame }), `swipe ${post}/${frame}`);
      }
    }
  });

  it('the Card\'s Maroon is the race name and the style words, and nothing else', () => {
    const s = cardScreen(game, rd, look, newSession(1), { focus: 0 });
    const maroon = [...s.header, ...s.heads, ...s.detail, ...s.rows.flatMap((r) => r.texts)].filter((t) => t.color === 'Maroon');
    expect(maroon.map((t) => t.text).sort()).toEqual(['Closer', 'Closer', 'Closer', 'Front', 'Front', 'Old Fence Row Stakes', 'Stalker', 'Stalker', 'Stalker'].sort());
  });

  it('Orders, for every horse as the player and every focus: Ink and Maroon on paper, Bone in the dialog', () => {
    for (const h of game.card.horses) {
      for (let focus = 0; focus < ORDERS_ITEMS.length; focus++) {
        const sc = ordersScreen(game, rd, { post: h.post, focus, orders: { ...DEFAULTS } }, look);
        for (const t of [...sc.texts, ...sc.entry.texts]) {
          if (isClothNumber(t) && t.y < 144) continue;
          expect(t.color, `post ${h.post} focus ${focus}: "${t.text}"`).not.toBe('Yellow');
          expect(['Ink', 'Maroon', 'Bone']).toContain(t.color);
        }
        // Bone is for the dialog box on Navy alone.
        for (const t of sc.texts.filter((x) => x.color === 'Bone')) expect(t.y).toBeGreaterThanOrEqual(192);
      }
    }
  });

  it('the Result, for every horse as the player over 60 seeds', () => {
    for (const seed of seeds(60)) {
      const res = race(seed);
      for (const h of res.inputs.card.horses) {
        const sc = resultScreen(res, rd, h.id);
        for (const t of [...sc.texts, ...sc.rows.flatMap((r) => r.texts)]) {
          expect(t.color, `seed ${seed} ${h.id}: "${t.text}"`).not.toBe('Yellow');
        }
      }
    }
  });
});

describe('the cursor and the marker recolor for paper, and only there', () => {
  it('the Card, Orders and Result scenes draw the cursor with the paper swap, and the Result its marker', () => {
    for (const f of ['CardScene.ts', 'OrdersScene.ts', 'ResultScene.ts']) {
      expect(scene(f), f).toMatch(/art\.swap\(SLOT_IDS\.cursor, PAPER_CURSOR_SWAPS\)/);
    }
    expect(scene('ResultScene.ts')).toMatch(/art\.swap\(SLOT_IDS\.markerYours, PAPER_MARKER_SWAPS\)/);
  });

  it('the pause box on the Navy race keeps the plain Yellow horseshoe, and no other scene uses the paper swaps', () => {
    const race = scene('RaceScene.ts');
    expect(race).toMatch(/this\.add\.image\(PAUSE_LAYOUT\.cursorX, PAUSE_LAYOUT\.items\[0\]\.y, SLOT_IDS\.cursor, '0'\)/);
    const users = readdirSync(sceneDir).filter((f) => f.endsWith('.ts') && /PAPER_(CURSOR|MARKER)_SWAPS/.test(scene(f))).sort();
    expect(users).toEqual(['CardScene.ts', 'OrdersScene.ts', 'ResultScene.ts']);
    // The race's own marker on the track is not recolored either.
    expect(race).not.toMatch(/swap\(/);
  });

  it('every other screen that shows the horseshoe on a Navy fill draws the unswapped slot', () => {
    for (const f of readdirSync(sceneDir).filter((x) => x.endsWith('.ts') && !['CardScene.ts', 'OrdersScene.ts', 'ResultScene.ts'].includes(x))) {
      const src = scene(f);
      if (src.includes('SLOT_IDS.cursor')) expect(src, f).not.toMatch(/swap\(SLOT_IDS\.cursor/);
    }
  });
});
