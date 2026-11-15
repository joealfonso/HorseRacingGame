import { describe, expect, it } from 'vitest';
import { loadHub } from '../data/hubLoad';
import { ctx, dayWith, drawnOf, programOf, rd } from './betKit';
import { arriveHub, hubFocusMarks, hubScreen } from './hubScreen';

// TB1 (docs/specs/book-and-window.md section 8, with the art-director's 18.1 item 7): three
// rows at cell tops y206, y215 and y224 inside the box, item boxes that do not overlap, and no
// focus corners with Read focused.

const hub = loadHub();
const B = hub.box.value;

describe('TB1: the track box', () => {
  it('Read, Bet and Watch draw at cell tops y206, y215 and y224, inside the box\'s interior (x8-247, y184-231)', () => {
    const sc = hubScreen({ hub, rd, ctx, day: dayWith(10000), drawn: drawnOf()[2], program: programOf(3), state: arriveHub(hub), seconds: 0, reducedMotion: false });
    expect(sc.doors.map((d) => [d.text, d.x, d.y])).toEqual([['Read Race 3', 20, 206], ['Bet Race 3', 20, 215], ['Just watch Race 3', 20, 224]]);
    const interior = { x0: B.frame.x + 8, y0: B.frame.y + 8, x1: B.frame.x + 8 * B.frame.tilesW - 9, y1: B.frame.y + 8 * B.frame.tilesH - 9 };
    expect(interior).toEqual({ x0: 8, y0: 184, x1: 247, y1: 231 });
    for (const t of [...sc.doors, ...sc.voice]) {
      expect(t.x >= interior.x0 && t.x + 8 * t.text.length - 1 <= interior.x1, t.text).toBe(true);
      expect(t.y >= interior.y0 && t.y + 7 <= interior.y1, t.text).toBe(true);
    }
    expect(sc.voice.map((v) => v.y)).toEqual([185, 194]);
  });

  it('the item boxes are x8-247, y205-213, y214-222 and y223-231, and do not overlap', () => {
    expect(B.doorRows.map((r) => r.item)).toEqual([
      { x0: 8, y0: 205, x1: 247, y1: 213 }, { x0: 8, y0: 214, x1: 247, y1: 222 }, { x0: 8, y0: 223, x1: 247, y1: 231 },
    ]);
    for (let i = 1; i < B.doorRows.length; i++) expect(B.doorRows[i].item.y0).toBeGreaterThan(B.doorRows[i - 1].item.y1);
  });

  it('with Read focused no focus corners are drawn, at any moment; the horseshoe is on the Read row', () => {
    for (const seconds of [0, 0.3, 0.6, 1.1]) {
      for (const reducedMotion of [false, true]) {
        expect(hubFocusMarks({ hub, rd, state: arriveHub(hub), seconds, reducedMotion }).corners).toEqual([]);
      }
    }
    const sc = hubScreen({ hub, rd, ctx, day: dayWith(10000), drawn: drawnOf()[2], program: programOf(3), state: arriveHub(hub), seconds: 0, reducedMotion: false });
    expect(sc.cursor).toEqual({ x: 8, y: 206 });
    expect(sc.corners).toEqual([]);
    expect(hubScreen({ hub, rd, ctx, day: dayWith(10000), drawn: drawnOf()[2], program: programOf(3), state: arriveHub(hub, {}, 'back'), seconds: 0, reducedMotion: false }).corners).toHaveLength(4);
  });
});
