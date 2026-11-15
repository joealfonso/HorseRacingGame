import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadHub } from '../data/hubLoad';
import { dayWith, ctx, drawnOf, programOf, rd } from './betKit';
import { Frame, ROOT, readPng } from './compositeKit';
import { HUB_PEOPLE, hubBackdrop, hubFills, hubSprites } from './hubPicture';
import { arriveHub, hubScreen, idleClock } from './hubScreen';

// The track drawn headless from the pure modules and the shipped PNGs, in the order the
// scene draws it, against the accepted mocks (race 3, the mock's prices, the first frame).
// Pixel for pixel. The test support (a PNG reader and a tiny compositor) mirrors what the scene's Phaser calls do:
// frames from a sheet, flipX, a top-left crop, exact palette swaps, and the fonts painted
// in one color with Ink kept (src/render/recolor.ts paintGlyphs); it lives in compositeKit.ts.

const hub = loadHub();

// The track's mock moved with book-and-window.md section 8 and 18.1 item 7 (voice rows y185 and
// y194, three rows at y206, y215, y224): the accepted sheets are now
// docs/mocks/book-and-window/6b (Bet focused, was track-hub/a-windows.png) and 6a (Read focused,
// no corners). Same race 3, the same first frame; the board's prices are that mock's.
describe.each([
  ['6b-track-bet-focused.png', 'back', 'focus on Windows (Bet)'],
  ['6a-track-read-focused.png', 'arrival', 'focus on Read, no corners'],
] as const)('the track at race 3 matches the accepted mock %s pixel for pixel', (file, from, label) => {
  const MOCK_ODDS = ['7-2', '9-2', '5-2', '8-1', '3-1', '12-1', '4-1', '26-1']; // scripts/art/book_mock.mjs R3_ODDS
  const sc = hubScreen({
    hub, rd, ctx, day: dayWith(10000), drawn: drawnOf()[2], program: programOf(3), state: arriveHub(hub, {}, from),
    seconds: 0, reducedMotion: false, cursorFrames: 2,
  });

  it(`every pixel, ${label}`, () => {
    const f = new Frame();
    f.rects(hubFills(sc.sky));
    for (const op of hubBackdrop()) f.image(op);
    for (const op of hubSprites(hub, rd, idleClock(0), 0, false)) f.image(op);
    f.rects(sc.bar);
    const B = hub.box.value.frame; // as Art.box draws it
    for (let ty = 0; ty < B.tilesH; ty++) {
      for (let tx = 0; tx < B.tilesW; tx++) {
        const col = tx === 0 ? 0 : tx === B.tilesW - 1 ? 2 : 1;
        const row = ty === 0 ? 0 : ty === B.tilesH - 1 ? 2 : 1;
        f.image({ slot: 'art.ui.frame.box', frame: row * 3 + col, x: B.x + tx * 8, y: B.y + ty * 8 });
      }
    }
    f.image({ slot: 'art.ui.cursor.horseshoe', frame: sc.cursorFrame, ...sc.cursor });
    const prices = sc.board.posts.map((p) => ({ ...p.price, text: MOCK_ODDS[p.post - 1] }));
    for (const t of [...sc.status, ...sc.voice, ...sc.doors, sc.sign, sc.board.header, ...sc.board.posts.map((p) => p.digit), ...prices]) f.text(t);
    for (const c of sc.corners) f.image({ slot: 'art.ui.focus.corner', frame: c.frame === 'top' ? 0 : 1, x: c.x, y: c.y, flipX: c.flipX });

    const mock = readPng(join(ROOT, 'docs/mocks/book-and-window', file));
    const diffs: string[] = [];
    for (let y = 0; y < 240; y++) {
      for (let x = 0; x < 256; x++) {
        const i = (y * 256 + x) * 4;
        const want = (mock.data[i] << 16) | (mock.data[i + 1] << 8) | mock.data[i + 2];
        const got = f.px[y * 256 + x];
        if (got !== want) diffs.push(`${x},${y}: got ${got.toString(16)}, mock ${want.toString(16)}`);
      }
    }
    expect(diffs.length, diffs.slice(0, 10).join('\n')).toBe(0);
  });
});

describe('the people', () => {
  it('every person in hub.json\'s idle order has a place in the picture', () => {
    const ids = new Set(HUB_PEOPLE.map((p) => p.id));
    for (const id of hub.idle.value.order) expect(ids.has(id), id).toBe(true);
  });

  it('a person on their idle turn shows frame 1 (the idle), everyone else frame 0', () => {
    const at4 = hubSprites(hub, rd, idleClock(0), 4.25, false);
    const regular = at4.find((o) => o.x === 56 && o.y === 48)!;
    expect(regular.frame).toBe(1);
    expect(at4.filter((o) => o.slot.startsWith('art.hub.') && o.frame !== 0)).toHaveLength(1);
    expect(hubSprites(hub, rd, idleClock(0), 4.25, true).filter((o) => o.slot.startsWith('art.hub.')).every((o) => o.frame === 0)).toBe(true);
  });
});
