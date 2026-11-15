import { describe, expect, it } from 'vitest';
import { dayWith, programOf, rd, screenOf } from './betKit';
import { hitTest } from './pointer';
import {
  PROGRAM_PAGE, initialProgramState, programClick, programKey, programPointerTargets, type ProgramKeyContext, type ProgramState,
} from './programScreen';
import { RESULT_ACTION_BOX, RESULT_NEXT, resultPointerTargets } from './resultScreen';

// The mouse on the program and result pages (docs/specs/track-hub.md section 6, TH12, TH13):
// which targets exist in each state, and that a click does what its keys do.

const k = (over: Partial<ProgramKeyContext> = {}): ProgramKeyContext => ({ horses: 8, ready: true, offered: [2, 5, 10, 20], lastDollars: null, ...over });
const choosing = initialProgramState();
const ticket = (post: number, dollars = 5): ProgramState => ({ focus: post - 1, mode: { kind: 'ticket', dollars } });
const ids = (s: ProgramState, kk = k()) => programPointerTargets(rd, s, kk).map((t) => t.id);
const keys = (s: ProgramState, codes: string[], kk = k()) => {
  let state = s;
  let outcome = null as ReturnType<typeof programKey>['outcome'];
  for (const c of codes) ({ state, outcome } = programKey(state, c, kk));
  return { state, outcome };
};

describe('program targets by state', () => {
  it('choosing: every entry, Pass and "Esc: back", at the spec\'s boxes', () => {
    const t = programPointerTargets(rd, choosing, k());
    expect(t.map((x) => x.id)).toEqual(['entry:1', 'entry:2', 'entry:3', 'entry:4', 'entry:5', 'entry:6', 'entry:7', 'entry:8', 'pass', 'back']);
    expect(t[2].box).toEqual({ x0: 8, y0: 57 + 38, x1: 247, y1: 75 + 38 });
    expect(t.find((x) => x.id === 'pass')!.box).toEqual({ x0: 8, y0: 222, x1: 159, y1: 235 });
    expect(t.find((x) => x.id === 'back')!.box).toEqual({ x0: 160, y0: 222, x1: 247, y1: 235 });
  });

  it('a short field has only its entries', () => {
    expect(ids(choosing, k({ horses: 6 })).filter((i) => i.startsWith('entry'))).toHaveLength(6);
  });

  it('ticket open: every other entry, "<", ">" and "Enter: bet"; not the entry being bet, not Pass or back', () => {
    expect(ids(ticket(3))).toEqual(['entry:1', 'entry:2', 'entry:4', 'entry:5', 'entry:6', 'entry:7', 'entry:8', 'less', 'more', 'bet']);
  });

  it('"<" and ">" are each glyph\'s 8x8 cell plus 4 px each side, rows y210-223', () => {
    const t = programPointerTargets(rd, ticket(3, 10), k());
    const x0 = PROGRAM_PAGE.footer.labelX; // "< $10 >  on #3": "<" at index 0, ">" at index 6
    expect(t.find((x) => x.id === 'less')!.box).toEqual({ x0: x0 - 4, y0: 210, x1: x0 + 11, y1: 223 });
    expect(t.find((x) => x.id === 'more')!.box).toEqual({ x0: x0 + 48 - 4, y0: 210, x1: x0 + 48 + 11, y1: 223 });
    expect(t.find((x) => x.id === 'bet')!.box).toEqual({ x0: 164, y0: 210, x1: 247, y1: 223 });
  });

  it('TH13: with one offered amount, "<" and ">" are not targets', () => {
    expect(ids(ticket(3, 2), k({ offered: [2] }))).not.toContain('less');
    expect(ids(ticket(3, 2), k({ offered: [2] }))).not.toContain('more');
  });

  it('the bet beat: no targets', () => {
    expect(ids({ focus: 2, mode: { kind: 'placed' } })).toEqual([]);
  });

  it('no two targets overlap in any state', () => {
    for (const s of [choosing, ticket(1), ticket(8, 20)]) {
      const t = programPointerTargets(rd, s, k());
      for (let y = 0; y < 240; y++) for (let x = 0; x < 256; x++) {
        expect(t.filter((b) => x >= b.box.x0 && x <= b.box.x1 && y >= b.box.y0 && y <= b.box.y1).length, `${x},${y}`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('TH12: a click does what its keys do', () => {
  it('choosing, an entry: digit k then Enter (opens the ticket on post k)', () => {
    for (let p = 1; p <= 8; p++) expect(programClick(choosing, `entry:${p}`, k())).toEqual(keys(choosing, [`Digit${p}`, 'Enter']));
    expect(programClick(choosing, 'entry:4', k()).state.mode.kind).toBe('ticket');
  });

  it('choosing while pending, an entry: focus only', () => {
    expect(programClick(choosing, 'entry:4', k({ ready: false }))).toEqual({ state: { focus: 3, mode: { kind: 'choosing' } }, outcome: null });
  });

  it('Pass passes, "Esc: back" goes back', () => {
    expect(programClick(choosing, 'pass', k()).outcome).toEqual({ kind: 'pass' });
    expect(programClick(choosing, 'pass', k({ ready: false })).outcome).toEqual({ kind: 'pass' });
    expect(programClick(choosing, 'back', k())).toEqual(keys(choosing, ['Escape']));
    expect(programClick(choosing, 'back', k()).outcome).toEqual({ kind: 'back' });
  });

  it('ticket: "<" is Left, ">" is Right, "Enter: bet" is Enter', () => {
    expect(programClick(ticket(3), 'less', k())).toEqual(keys(ticket(3), ['ArrowLeft']));
    expect(programClick(ticket(3), 'more', k())).toEqual(keys(ticket(3), ['ArrowRight']));
    expect(programClick(ticket(3), 'bet', k())).toEqual(keys(ticket(3), ['Enter']));
    expect(programClick(ticket(3), 'bet', k()).outcome).toEqual({ kind: 'bet', post: 3, dollars: 5 });
  });

  it('ticket: another entry moves the ticket to that horse at the same amount; the entry being bet does nothing', () => {
    expect(programClick(ticket(3, 10), 'entry:6', k())).toEqual({ state: ticket(6, 10), outcome: null });
    expect(programClick(ticket(3, 10), 'entry:3', k())).toEqual({ state: ticket(3, 10), outcome: null });
  });

  it('the bet beat: nothing acts', () => {
    const placed: ProgramState = { focus: 2, mode: { kind: 'placed' } };
    for (const id of ['entry:3', 'entry:1', 'pass', 'back', 'less', 'more', 'bet'] as const) expect(programClick(placed, id, k())).toEqual({ state: placed, outcome: null });
  });

  it('Esc while the ticket is open still closes it, never leaves the page', () => {
    expect(programKey(ticket(3), 'Escape', k())).toEqual({ state: { focus: 2, mode: { kind: 'choosing' } }, outcome: null });
  });
});

describe('program focus from the track (BP5 amendment)', () => {
  it('starts on post 1 by default and on post k when asked', () => {
    expect(initialProgramState()).toEqual({ focus: 0, mode: { kind: 'choosing' } });
    expect(initialProgramState(5)).toEqual({ focus: 4, mode: { kind: 'choosing' } });
  });
});

describe('"Esc: back" on the page', () => {
  it('is in the choosing footer right-aligned to x247 on the Pass row', () => {
    const s = screenOf(programOf(1), dayWith(10000), choosing);
    expect(s.footer).toContainEqual({ text: 'Esc: back', x: 248 - 8 * 9, y: 226, color: 'Ink' });
    const open = screenOf(programOf(1), dayWith(10000), ticket(1, 2));
    expect(open.footer.map((t) => t.text)).not.toContain('Esc: back');
  });
});

describe('result: the action line', () => {
  it('is the one target, x8-247 around the action row, and hits nothing above it', () => {
    const t = resultPointerTargets();
    expect(t).toEqual([{ id: 'next', box: RESULT_ACTION_BOX }]);
    expect(RESULT_ACTION_BOX.y0).toBeLessThanOrEqual(RESULT_NEXT.y);
    expect(RESULT_ACTION_BOX.y1).toBeGreaterThanOrEqual(RESULT_NEXT.y + 7);
    expect(hitTest(t, { x: 100, y: RESULT_NEXT.y + 3 })).toBe('next');
    expect(hitTest(t, { x: 100, y: 200 })).toBeNull();
  });
});
