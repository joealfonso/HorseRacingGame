import { describe, expect, it } from 'vitest';
import { offeredAmounts } from '../bet/money';
import { ctx, dayWith, drawnOf, inputFor, posted, programOf, rd, settled } from './betKit';
import { hitTest } from './pointer';
import {
  initialProgramState, programClick, programKey, programPointerTargets, programScreen, type ProgramKeyContext, type ProgramState,
} from './programScreen';
import { RESULT_NEXT, resultPointerTargets } from './resultScreen';

// Written from docs/specs/track-hub.md section 3 (amendments 5 and 6), section 6's table,
// TH12 and TH13. Expected boxes are the spec's table typed out here.

const offered = offeredAmounts(10000, ctx.rules);
const K = (over: Partial<ProgramKeyContext> = {}): ProgramKeyContext => ({ horses: 8, ready: true, offered, lastDollars: null, ...over });
const choosing = initialProgramState();
const ticket = (post: number, dollars: number): ProgramState => ({ focus: post - 1, mode: { kind: 'ticket', dollars } });
const placed: ProgramState = { focus: 2, mode: { kind: 'placed' } };
const keys = (s: ProgramState, codes: string[], k = K()) => {
  let state = s;
  let outcome = null as ReturnType<typeof programKey>['outcome'];
  for (const c of codes) ({ state, outcome } = programKey(state, c, k));
  return { state, outcome };
};
const day = dayWith(10000);
const screen = (state: ProgramState, d = day, program: ReturnType<typeof programOf> | null = programOf(3)) =>
  programScreen(inputFor(program, drawnOf()[2], d, state));

describe('the offered amounts are what the tests assume', () => {
  it('a $100 bank offers several amounts; a $4 bank offers one', () => {
    expect(offered.length).toBeGreaterThan(2);
    expect(offeredAmounts(400, ctx.rules)).toHaveLength(1);
  });
});

describe('TH12: section 6 boxes, by sweep of the 256x240 grid', () => {
  const sweep = (s: ProgramState, want: (x: number, y: number) => string | null) => {
    const t = programPointerTargets(rd, s, K());
    const bad: string[] = [];
    for (let y = 0; y < 240; y++) for (let x = 0; x < 256; x++) {
      const got = hitTest(t, { x, y });
      const w = want(x, y);
      if (got !== w && bad.length < 8) bad.push(`${x},${y}: got ${got} want ${w}`);
    }
    expect(bad).toEqual([]);
  };
  const entryAt = (x: number, y: number): string | null => {
    if (x < 8 || x > 247) return null;
    for (let k = 1; k <= 8; k++) if (y >= 57 + 19 * (k - 1) && y <= 75 + 19 * (k - 1)) return `entry:${k}`;
    return null;
  };

  it('choosing: entries x8-247 y57+19(k-1)..75+19(k-1), Pass x8-159 y222-235, "Esc: back" x160-247 y222-235', () => {
    sweep(choosing, (x, y) => {
      if (y >= 222 && y <= 235) return x >= 8 && x <= 159 ? 'pass' : x >= 160 && x <= 247 ? 'back' : null;
      return entryAt(x, y);
    });
  });

  it('ticket open on post 3: "Enter: bet" x164-247 y210-223, every other entry, not the entry being bet', () => {
    const t = programPointerTargets(rd, ticket(3, 5), K());
    const inBetRow = (x: number, y: number) => x >= 164 && x <= 247 && y >= 210 && y <= 223;
    for (let y = 0; y < 240; y++) for (let x = 0; x < 256; x++) {
      if (inBetRow(x, y)) { expect(hitTest(t, { x, y })).toBe('bet'); continue; }
      const id = hitTest(t, { x, y });
      if (id === 'less' || id === 'more') continue; // the arrows' own boxes are checked below
      const want = entryAt(x, y);
      expect(id, `${x},${y}`).toBe(want === 'entry:3' ? null : want);
    }
  });

  it('"<" and ">" are each glyph\'s 8x8 cell plus 4 px each side on rows y210-223', () => {
    const line = screen(ticket(3, 5)).footer[0];
    const t = programPointerTargets(rd, ticket(3, 5), K());
    for (const [id, glyph] of [['less', '<'], ['more', '>']] as const) {
      const gx = line.x + 8 * line.text.indexOf(glyph);
      for (const y of [209, 210, 223, 224]) {
        for (const x of [gx - 5, gx - 4, gx + 11, gx + 12]) {
          const inside = y >= 210 && y <= 223 && x >= gx - 4 && x <= gx + 11;
          expect(hitTest(t, { x, y }) === id, `${id} at ${x},${y}`).toBe(inside);
        }
      }
    }
  });

  it('the bet beat: nothing is a target anywhere', () => {
    expect(programPointerTargets(rd, placed, K())).toEqual([]);
  });
});

describe('TH12: a click does what its key does', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('choosing: entry %i is "focus post k, then Enter" (opens the ticket)', (k) => {
    const click = programClick(choosing, `entry:${k}`, K());
    const key = keys(choosing, [`Digit${k}`, 'Enter']);
    expect(click.state).toEqual(key.state);
    expect(click.outcome).toEqual(key.outcome);
    expect(click.state.mode.kind).toBe('ticket');
  });

  it('choosing, prices pending: an entry only takes focus, as Enter does nothing', () => {
    const pend = K({ ready: false });
    const click = programClick(choosing, 'entry:4', pend);
    expect(click.state).toEqual(keys(choosing, ['Digit4', 'Enter'], pend).state);
    expect(click.state).toEqual({ focus: 3, mode: { kind: 'choosing' } });
    expect(click.outcome).toBeNull();
  });

  it('choosing: Pass is Enter on Pass', () => {
    const click = programClick(choosing, 'pass', K());
    expect(click.outcome).toEqual(keys(choosing, ['ArrowUp', 'Enter']).outcome);
    expect(click.outcome).toEqual({ kind: 'pass' });
  });

  it('choosing: "Esc: back" is Esc', () => {
    expect(programClick(choosing, 'back', K())).toEqual(keys(choosing, ['Escape']));
    expect(programClick(choosing, 'back', K()).outcome).toEqual({ kind: 'back' });
  });

  it('ticket open: "<" and ">" are Left and Right', () => {
    const s = ticket(3, 10);
    expect(programClick(s, 'less', K())).toEqual(keys(s, ['ArrowLeft']));
    expect(programClick(s, 'more', K())).toEqual(keys(s, ['ArrowRight']));
    expect((programClick(s, 'less', K()).state.mode as { dollars: number }).dollars).toBeLessThan(10);
    expect((programClick(s, 'more', K()).state.mode as { dollars: number }).dollars).toBeGreaterThan(10);
  });

  it('ticket open: "Enter: bet" is Enter, placing the bet on that post and amount', () => {
    const s = ticket(3, 5);
    expect(programClick(s, 'bet', K())).toEqual(keys(s, ['Enter']));
    expect(programClick(s, 'bet', K()).outcome).toEqual({ kind: 'bet', post: 3, dollars: 5 });
  });

  it.each([1, 2, 4, 8])('ticket open: another entry (%i) is Esc, then the ticket on that horse at the same amount', (k) => {
    const s = ticket(3, 10);
    const click = programClick(s, `entry:${k}`, K());
    const key = keys(s, ['Escape', `Digit${k}`, 'Enter'], K({ lastDollars: 10 }));
    expect(click.state).toEqual(key.state);
    expect(click.state).toEqual(ticket(k, 10));
    expect(click.outcome).toBeNull();
  });

  it('ticket open: a click on the entry being bet does nothing, however many times', () => {
    const s = ticket(3, 10);
    let cur = s;
    for (let i = 0; i < 3; i++) {
      const r = programClick(cur, 'entry:3', K());
      expect(r.outcome).toBeNull();
      cur = r.state;
    }
    expect(cur).toEqual(s);
  });

  it('a double click on an entry never places a bet', () => {
    const first = programClick(choosing, 'entry:3', K());
    const second = programClick(first.state, 'entry:3', K());
    expect(second.outcome).toBeNull();
    expect(second.state).toEqual(first.state);
    expect(first.state.mode.kind).toBe('ticket');
  });

  it('the bet beat: no click acts, whichever id', () => {
    for (const id of ['entry:1', 'entry:3', 'entry:8', 'pass', 'back', 'less', 'more', 'bet'] as const) {
      const r = programClick(placed, id, K());
      expect(r.outcome, id).toBeNull();
      expect(r.state, id).toEqual(placed);
    }
  });

  it('the bet beat: keys do nothing either (so the cut to the race cannot be doubled)', () => {
    for (const c of ['Enter', 'Escape', 'ArrowLeft', 'Digit2']) expect(keys(placed, [c]).outcome).toBeNull();
  });
});

describe('TH13: one amount, no arrows', () => {
  const small = dayWith(400);
  const one = offeredAmounts(400, ctx.rules);
  const kOne = K({ offered: one });

  it('"<" and ">" are not drawn, and are not targets', () => {
    const s = ticket(3, one[0]);
    const line = screen(s, small).footer[0].text;
    expect(line).not.toMatch(/[<>]/);
    const ids = programPointerTargets(rd, s, kOne).map((t) => t.id);
    expect(ids).not.toContain('less');
    expect(ids).not.toContain('more');
    expect(ids).toContain('bet');
  });

  it('a click where the arrows would be acts on nothing', () => {
    const s = ticket(3, one[0]);
    const t = programPointerTargets(rd, s, kOne);
    const gx = screen(ticket(3, 5)).footer[0].x; // the arrow's usual spot, from the multi-amount line
    expect(hitTest(t, { x: gx + 2, y: 215 })).toBeNull();
  });

  it('with several amounts both arrows are drawn and are targets (so the test above can fail)', () => {
    const s = ticket(3, 5);
    expect(screen(s).footer[0].text).toMatch(/</);
    expect(screen(s).footer[0].text).toMatch(/>/);
    const ids = programPointerTargets(rd, s, K()).map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(['less', 'more']));
  });
});

describe('section 3 amendments the pages show', () => {
  const back = (s: ProgramState) => screen(s).footer.find((t) => t.text === 'Esc: back');

  it('"Esc: back" is drawn right-aligned to x247 (x176-247) while choosing', () => {
    const b = back(choosing)!;
    expect(b).toBeDefined();
    expect(b.x + 8 * 9 - 1).toBe(247);
    expect(b.x).toBeGreaterThanOrEqual(176);
  });

  it('"Esc: back" is drawn on every choosing focus, pending or not', () => {
    for (let i = 0; i <= 8; i++) expect(back({ focus: i, mode: { kind: 'choosing' } })).toBeDefined();
    expect(screen(choosing, day, null).footer.some((t) => t.text === 'Esc: back')).toBe(true);
  });

  it('"Esc: back" is not drawn with the ticket open', () => {
    expect(back(ticket(3, 5))).toBeUndefined();
  });

  it('"Esc: back" is not drawn during the bet beat', () => {
    const onRace3 = settled(programOf(2), settled(programOf(1), day, null, 1), null, 1);
    const d = posted(programOf(3), onRace3, { post: 3, dollars: 5 });
    const sc = screen(placed, d);
    expect(sc.footer.some((t) => t.text === 'Esc: back')).toBe(false);
    expect(sc.footer.length).toBeGreaterThan(0); // the printed ticket shows, so the screen is really in the beat
  });

  it('digit k at the track opens the program on post k; from Windows, post 1', () => {
    expect(initialProgramState().focus).toBe(0);
    for (let k = 1; k <= 8; k++) {
      const s = initialProgramState(k);
      expect(s.focus).toBe(k - 1);
      expect(s.mode.kind).toBe('choosing');
      // Enter then opens the ticket on that very horse.
      expect(keys(s, ['Enter']).state).toEqual({ focus: k - 1, mode: { kind: 'ticket', dollars: offered[0] } });
    }
  });

  it('the horseshoe sits on entry k when opened on post k', () => {
    const ys = [1, 2, 3, 4, 5, 6, 7, 8].map((k) => screen(initialProgramState(k)).cursor!.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBe(19);
  });

  it('Esc while choosing is "back" and changes nothing else; with the ticket open it closes the ticket first', () => {
    const r = programKey(choosing, 'Escape', K());
    expect(r.outcome).toEqual({ kind: 'back' });
    expect(r.state).toEqual(choosing);
    const closed = programKey(ticket(3, 5), 'Escape', K());
    expect(closed.outcome).toBeNull();
    expect(closed.state).toEqual({ focus: 2, mode: { kind: 'choosing' } });
    expect(programKey(closed.state, 'Escape', K()).outcome).toEqual({ kind: 'back' });
  });
});

describe('the result page\'s action line (section 6)', () => {
  const t = resultPointerTargets();

  it('is one target, x8-247, covering the action row', () => {
    expect(t).toHaveLength(1);
    for (const x of [8, 100, 247]) for (let y = RESULT_NEXT.y; y < RESULT_NEXT.y + 8; y++) expect(hitTest(t, { x, y }), `${x},${y}`).toBe('next');
    expect(hitTest(t, { x: 7, y: RESULT_NEXT.y + 2 })).toBeNull();
    expect(hitTest(t, { x: 248, y: RESULT_NEXT.y + 2 })).toBeNull();
  });

  it('nothing else on the page is a target', () => {
    let hits = 0;
    for (let y = 0; y < 240; y++) for (let x = 0; x < 256; x++) if (hitTest(t, { x, y }) !== null) hits++;
    expect(hits).toBeGreaterThan(0);
    expect(hitTest(t, { x: 100, y: 10 })).toBeNull();
    expect(hitTest(t, { x: 100, y: 112 })).toBeNull();
    expect(hitTest(t, { x: 100, y: 184 })).toBeNull();
    expect(hitTest(t, { x: 100, y: 120 })).toBeNull();
  });
});
