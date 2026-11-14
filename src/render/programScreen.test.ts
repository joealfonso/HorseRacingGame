import { describe, expect, it } from 'vitest';
import { quote, type DrawnRace, type RaceProgram } from '../bet/day';
import { RESULT_CONFIRM_KEYS, betResultScreen } from './resultScreen';
import {
  initialProgramState, lastBetDollars, openingDollars, programKey, programScreen,
  type ProgramKeyContext, type ProgramState,
} from './programScreen';
import { SLOT_IDS } from './slotStatus';
import { ctx, dayWith, drawnOf, estimateOf, inputFor, lookFor, paint, posted, programOf, rd, screenOf, settled } from './betKit';
import { programFor } from '../bet/day';
import { runRace } from '../sim/runRace';

// Tests for the betting program page, written from docs/specs/betting-screens.md sections 2, 3 and 9
// (BP1 to BP10, BC2, UI1 and the "Program states" edge cases), with section 10 and DESIGN's
// "Program pages, Betting additions" winning where they differ. Expected values are the spec's.

const MAIN_W = 8; // main font cell, DESIGN
const START = 10000; // $100.00, betting-simple spec
const P1 = programOf(1);
const D1 = drawnOf()[0];
const choosing: ProgramState = initialProgramState();
const keyCtx = (over: Partial<ProgramKeyContext> = {}): ProgramKeyContext => ({ horses: 8, ready: true, offered: [2, 5, 10, 20], lastDollars: null, ...over });
const money = (cents: number): string => `$${Math.floor(cents / 100).toLocaleString('en-US')}.${String(cents % 100).padStart(2, '0')}`;
const mainFits = (t: { text: string; x: number }, left = 8, right = 247) => t.x >= left && t.x + MAIN_W * t.text.length - 1 <= right;
const press = (s: ProgramState, codes: string[], k = keyCtx()) => {
  const outcomes: unknown[] = [];
  let state = s;
  for (const code of codes) { const r = programKey(state, code, k); state = r.state; outcomes.push(r.outcome); }
  return { state, outcomes };
};
/** A copy of a drawn race with the horses' stats set, by post. */
function withStats(drawn: DrawnRace, stats: Record<number, { speed: number; stamina: number; kick: number }>): DrawnRace {
  const c = structuredClone(drawn);
  for (const h of c.input.card.horses) if (stats[h.post]) h.stats = { ...h.stats, ...stats[h.post] };
  return c;
}

describe('BP1 bars and odds placement', () => {
  const range = { min: 1, max: 100 }; // tuning.statRange in data, the spec's example range
  const lens = (stat: number) => Math.floor(((stat - range.min) * 40) / (range.max - range.min));
  const stats = { 1: { speed: 58, stamina: 86, kick: 1 }, 2: { speed: 100, stamina: 50, kick: 99 }, 3: { speed: 58, stamina: 58, kick: 58 } };
  const drawn = withStats(D1, stats);
  const prog = { ...P1, drawn };
  const s = screenOf(prog, dayWith(START), choosing, drawn);
  const row = (post: number) => s.rows.find((r) => r.post === post)!;
  const barRect = (post: number, barX: number) => row(post).rects.find((r) => r.color === 'Ink' && r.x === barX && r.h === 3 && r.y === row(post).top + 11);
  const COLS = [{ key: 'speed', barX: 50, numX: 40 }, { key: 'stamina', barX: 108, numX: 98 }, { key: 'kick', barX: 166, numX: 156 }] as const;

  it('the spec examples: 58 draws 23 px and 86 draws 34 px', () => {
    expect(lens(58)).toBe(23);
    expect(lens(86)).toBe(34);
    expect(barRect(1, 50)!.w).toBe(23);
    expect(barRect(1, 108)!.w).toBe(34);
  });

  it('every bar is floor((stat - min) * 40 / (max - min)) px at x50, x108 and x166, nothing past 40 px', () => {
    for (const post of [1, 2, 3]) {
      for (const c of COLS) {
        const stat = stats[post as 1 | 2 | 3][c.key];
        const rect = barRect(post, c.barX);
        const want = lens(stat);
        if (want === 0) expect(rect, `post ${post} ${c.key}`).toBeUndefined();
        else expect(rect!.w, `post ${post} ${c.key}`).toBe(want);
      }
    }
    expect(barRect(2, 50)!.w).toBe(40);
  });

  it('equal stats draw equal bars', () => {
    expect(barRect(3, 50)!.w).toBe(barRect(3, 108)!.w);
    expect(barRect(3, 108)!.w).toBe(barRect(3, 166)!.w);
  });

  it('the 40 px track sits under each bar: Ash line on +12 from the bar start and a 1x3 stop at its last column', () => {
    for (const c of COLS) {
      const top = row(1).top;
      expect(row(1).rects).toContainEqual({ x: c.barX, y: top + 12, w: 40, h: 1, color: 'Ash' });
      expect(row(1).rects).toContainEqual({ x: c.barX + 39, y: top + 11, w: 1, h: 3, color: 'Ash' });
    }
  });

  it('the stat numbers sit at x40, x98 and x156 in the small font, two digits', () => {
    for (const c of COLS) {
      const t = row(1).texts.find((x) => x.small && x.x === c.numX)!;
      expect(t.text).toBe(String(stats[1][c.key]).padStart(2, '0'));
    }
    expect(row(1).texts.find((x) => x.small && x.x === 156)!.text).toBe('01');
  });

  it('the odds are right-aligned to x247 on line 2, in Ink, for every entry', () => {
    expect(s.odds).toHaveLength(8);
    s.odds.forEach((o, i) => {
      expect(o.x + MAIN_W * o.text.length, `entry ${i}`).toBe(248);
      expect(o.y).toBe(58 + 19 * i + 8);
      expect(o.color).toBe('Ink');
    });
  });

  it('the column heads start at their stat numbers: Speed x40, Stam. x98, Kick x156, Odds x216-247, y47, Ink', () => {
    const byText = Object.fromEntries(s.heads.map((h) => [h.text, h]));
    expect(Object.keys(byText).sort()).toEqual(['Kick', 'Odds', 'Speed', 'Stam.']);
    expect([byText.Speed.x, byText['Stam.'].x, byText.Kick.x, byText.Odds.x]).toEqual([40, 98, 156, 216]);
    for (const h of s.heads) { expect(h.y).toBe(47); expect(h.color).toBe('Ink'); }
    expect(byText.Odds.x + MAIN_W * 4 - 1).toBe(247);
  });

  it('entry tops are y58 + 19 * i, and the rules are at y44, y56 and y210', () => {
    expect(s.rows.map((r) => r.top)).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => 58 + 19 * i));
    expect(s.rules.map((r) => r.y)).toEqual([44, 56, 210]);
    for (const r of s.rules) expect([r.x, r.w, r.h, r.color]).toEqual([8, 240, 1, 'Ink']);
  });
});

describe('BP2 an entry is drawn from that horse and the stat range only', () => {
  const crowdBumped = (p: RaceProgram, post: number): RaceProgram => {
    const crowdDollars = [...p.crowdDollars];
    crowdDollars[post - 1] += 4000;
    return { ...p, crowdDollars };
  };
  for (const mode of ['choosing', 'ticket'] as const) {
    it(`only the odds change when another horse's crowd money changes (${mode})`, () => {
      const state: ProgramState = mode === 'choosing' ? choosing : { focus: 0, mode: { kind: 'ticket', dollars: 5 } };
      const a = screenOf(P1, dayWith(START), state);
      const b = screenOf(crowdBumped(P1, 6), dayWith(START), state);
      const { odds: oa, ...restA } = a;
      const { odds: ob, ...restB } = b;
      if (mode === 'choosing') expect(restB).toEqual(restA);
      else {
        // The open ticket's footer shows what the focused horse pays, which depends on the pool: it may move too.
        expect({ ...restB, footer: null }).toEqual({ ...restA, footer: null });
      }
      expect(ob[5].text).not.toBe(oa[5].text);
    });
  }
});

describe('BP3 and BP8 odds cells and "pays" are the betting code\'s', () => {
  const offeredFor100 = [2, 5, 10, 20]; // BK1: $100 offers $2, $5, $10, $20
  const day = dayWith(START);

  it('with no ticket open every odds cell is the no-bet quote', () => {
    const want = quote(ctx, P1, null).odds;
    const s = screenOf(P1, day, choosing);
    s.odds.forEach((o, i) => expect(o.text).toBe(want[s.rows[i].post - 1]));
  });

  it('with a ticket open, every offered amount, every horse: odds cells equal the quote with that bet in the pool', () => {
    for (const dollars of offeredFor100) {
      for (let focus = 0; focus < 8; focus++) {
        const s = screenOf(P1, day, { focus, mode: { kind: 'ticket', dollars } });
        const want = quote(ctx, P1, { post: focus + 1, dollars }).odds;
        s.odds.forEach((o, i) => expect(o.text, `$${dollars} post ${focus + 1} cell ${i}`).toBe(want[s.rows[i].post - 1]));
      }
    }
  });

  it('the pays line is the credit if that horse wins, stake included, for every offered amount and horse (BK2)', () => {
    for (const dollars of offeredFor100) {
      for (let focus = 0; focus < 8; focus++) {
        const post = focus + 1;
        const s = screenOf(P1, day, { focus, mode: { kind: 'ticket', dollars } });
        // The credit when this horse wins: settle a real day with this bet and read the bankroll change.
        const before = posted(P1, day, { post, dollars }).bankrollCents;
        const after = settled(P1, day, { post, dollars }, post).bankrollCents;
        const credited = after - before;
        const pays = s.footer.find((t) => t.y === 226)!;
        expect(pays.text, `$${dollars} #${post}`).toBe(`$${dollars} to win pays ${money(credited)}`);
        expect(pays.x).toBe(20);
        expect(credited).toBeGreaterThan(dollars * 100); // stake included, so more than the stake
      }
    }
  });

  it('while a ticket is open the hovered horse\'s bet changes its own price: more money cuts it', () => {
    const lo = quote(ctx, P1, { post: 1, dollars: 2 }).perDollarCents[0];
    const hi = quote(ctx, P1, { post: 1, dollars: 20 }).perDollarCents[0];
    expect(hi).toBeLessThanOrEqual(lo);
  });
});

describe('BP4 header lines, footer and ticket strings fit with the longest values', () => {
  const rich = dayWith(16_500_000); // $165,000.00
  const last = drawnOf()[7];
  const prog8 = programOf(8);

  it('header line 1: "Race 8 of 8" left and "Bank $165,000.00" right-aligned to x247 do not meet', () => {
    const s = screenOf(prog8, rich, choosing);
    const [left, right] = s.header;
    expect([left.text, right.text]).toEqual(['Race 8 of 8', 'Bank $165,000.00']);
    expect(left.x).toBe(8);
    expect(right.x + MAIN_W * right.text.length).toBe(248);
    expect(left.x + MAIN_W * left.text.length).toBeLessThan(right.x);
    expect(right.y).toBe(left.y);
    expect(left.y).toBe(4);
  });

  it('header lines 2 to 4 are at y14, y24, y34, fit x8-247, and line 2 is Maroon', () => {
    for (let r = 1; r <= 8; r++) {
      const s = screenOf(programOf(r), dayWith(START), choosing);
      const lines = s.header.slice(2);
      expect(lines.map((t) => t.y)).toEqual([14, 24, 34]);
      lines.forEach((t) => expect(mainFits(t), t.text).toBe(true));
      expect(lines[0].color).toBe('Maroon');
      expect(lines[1].text).toMatch(/, /);
    }
  });

  it('footer in choosing: blurb at x8 y214 (<= 30 chars), "Pass this race" at x20 y226', () => {
    for (let focus = 0; focus < 8; focus++) {
      const s = screenOf(prog8, rich, { focus, mode: { kind: 'choosing' } }, last);
      const pass = s.footer.find((t) => t.text === 'Pass this race')!;
      expect([pass.x, pass.y]).toEqual([20, 226]);
      for (const t of s.footer) expect(mainFits(t), t.text).toBe(true);
    }
  });

  it('ticket open at $100 on #8: "< $100 >  on #8" from x20 ends by x139, "Enter: bet" ends at x247, pays fits', () => {
    const s = screenOf(prog8, rich, { focus: 7, mode: { kind: 'ticket', dollars: 100 } }, last);
    const amount = s.footer.find((t) => t.y === 214 && t.x === 20)!;
    expect(amount.text).toBe('< $100 >  on #8');
    expect(amount.x + MAIN_W * amount.text.length - 1).toBeLessThanOrEqual(139);
    const confirm = s.footer.find((t) => t.text === 'Enter: bet')!;
    expect(confirm.x + MAIN_W * confirm.text.length).toBe(248);
    expect(confirm.y).toBe(214);
    const pays = s.footer.find((t) => t.y === 226)!;
    expect(pays.text).toMatch(/^\$100 to win pays \$[\d,]+\.\d\d$/);
    expect(pays.text.length).toBeLessThanOrEqual(27 + 1);
    expect(mainFits(pays, 20)).toBe(true);
  });

  it('the printed ticket lines fit inside the slip with the longest values (#8, $100, an 18-character name)', () => {
    const drawn = structuredClone(last);
    drawn.input.card.horses.find((h) => h.post === 8)!.name = 'Eighteen Chars Nam'; // 18, the name cap in DESIGN
    const prog = { ...prog8, drawn };
    const day = posted(prog, { ...rich, nextRace: 8 }, { post: 8, dollars: 100 });
    const s = screenOf(prog, day, { focus: 7, mode: { kind: 'placed' } }, drawn);
    expect(s.footer).toHaveLength(2);
    expect(s.footer[0].text).toBe('Race 8, $100 to win on #8');
    expect(s.footer[1].text).toMatch(/^Eighteen Chars Nam at \d+-\d+$/);
    for (const t of s.footer) expect(mainFits(t, 16, 246), t.text).toBe(true);
  });
});

describe('BP5 focus order, wrap, digit jumps, initial focus', () => {
  const cursorY = (focus: number) => screenOf(P1, dayWith(START), { focus, mode: { kind: 'choosing' } }).cursor;

  it('initial focus is post 1 with the horseshoe at x8 beside entry 1', () => {
    expect(initialProgramState().focus).toBe(0);
    expect(initialProgramState().mode).toEqual({ kind: 'choosing' });
    expect(cursorY(initialProgramState().focus)).toEqual({ x: 8, y: 58 + 5 });
  });

  it('Down walks posts 1 to 8, then Pass, then wraps to post 1', () => {
    let s = initialProgramState();
    const ys: (number | undefined)[] = [];
    for (let i = 0; i < 9; i++) {
      ys.push(screenOf(P1, dayWith(START), s).cursor?.y);
      s = programKey(s, 'ArrowDown', keyCtx()).state;
    }
    expect(ys).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => 58 + 19 * i + 5).concat([226]));
    expect(screenOf(P1, dayWith(START), s).cursor).toEqual({ x: 8, y: 63 });
  });

  it('Up from post 1 lands on Pass, and Up from Pass lands on post 8', () => {
    const up = programKey(initialProgramState(), 'ArrowUp', keyCtx()).state;
    expect(screenOf(P1, dayWith(START), up).cursor).toEqual({ x: 8, y: 226 });
    const up2 = programKey(up, 'ArrowUp', keyCtx()).state;
    expect(screenOf(P1, dayWith(START), up2).cursor).toEqual({ x: 8, y: 58 + 19 * 7 + 5 });
  });

  it('keys 1 to 8 jump to that post from anywhere, including from Pass', () => {
    for (let post = 1; post <= 8; post++) {
      for (const from of [0, 4, 8]) {
        const s = programKey({ focus: from, mode: { kind: 'choosing' } }, `Digit${post}`, keyCtx()).state;
        expect(screenOf(P1, dayWith(START), s).cursor, `Digit${post} from ${from}`).toEqual({ x: 8, y: 58 + 19 * (post - 1) + 5 });
      }
    }
  });

  it('the cursor moves the blurb: the footer shows the focused horse\'s blurb, and the Pass line on Pass', () => {
    const look = lookFor(D1);
    const horses = [...D1.input.card.horses].sort((a, b) => a.post - b.post);
    horses.forEach((h, i) => {
      const s = screenOf(P1, dayWith(START), { focus: i, mode: { kind: 'choosing' } });
      expect(s.footer.find((t) => t.y === 214)!.text).toBe(look[h.id].blurb);
    });
    const onPass = screenOf(P1, dayWith(START), { focus: 8, mode: { kind: 'choosing' } });
    expect(onPass.footer.find((t) => t.y === 214)!.text).toBe('Sit this one out and watch.');
  });

  it('Esc does nothing while choosing', () => {
    const r = programKey({ focus: 3, mode: { kind: 'choosing' } }, 'Escape', keyCtx());
    expect(r.state).toEqual({ focus: 3, mode: { kind: 'choosing' } });
    expect(r.outcome).toBeNull();
  });
});

describe('BP6 odds pending', () => {
  const s0 = screenOf(null, dayWith(START), choosing, D1);

  it('every odds cell is a single "-" right-aligned to x247 (x240-247)', () => {
    expect(s0.odds).toHaveLength(8);
    for (const o of s0.odds) { expect(o.text).toBe('-'); expect(o.x).toBe(240); expect(o.color).toBe('Ink'); }
  });

  it('footer line 1 is "The crowd is still betting." whatever is focused', () => {
    for (const focus of [0, 3, 7, 8]) {
      const s = screenOf(null, dayWith(START), { focus, mode: { kind: 'choosing' } }, D1);
      expect(s.footer.find((t) => t.y === 214)!.text).toBe('The crowd is still betting.');
      expect(s.footer.find((t) => t.y === 226)!.text).toBe('Pass this race');
    }
  });

  it('Enter on a horse does nothing, and Enter on Pass passes', () => {
    const k = keyCtx({ ready: false });
    for (const code of ['Enter', 'Space', 'KeyZ']) {
      const r = programKey({ focus: 2, mode: { kind: 'choosing' } }, code, k);
      expect(r.state).toEqual({ focus: 2, mode: { kind: 'choosing' } });
      expect(r.outcome).toBeNull();
    }
    expect(programKey({ focus: 8, mode: { kind: 'choosing' } }, 'Enter', k).outcome).toEqual({ kind: 'pass' });
  });

  it('the rest of the page is already drawn: entries, stats and header', () => {
    const ready = screenOf(P1, dayWith(START), choosing);
    expect(s0.rows).toEqual(ready.rows);
    expect(s0.header).toEqual(ready.header);
  });
});

describe('BP7 offered amounts and the opening amount', () => {
  // BK1: $100 offers 2, 5, 10, 20. $7.40 offers $2. $2.00 offers $2.
  it('opens at $2 on the first bet of the day', () => {
    expect(openingDollars([2, 5, 10, 20], null)).toBe(2);
  });
  it('opens at the last bet\'s amount if it is still offered', () => {
    expect(openingDollars([2, 5, 10, 20], 10)).toBe(10);
    expect(openingDollars([2, 5, 10, 20], 2)).toBe(2);
    expect(openingDollars([2, 5, 10, 20], 20)).toBe(20);
  });
  it('else the largest offered amount below it', () => {
    expect(openingDollars([2, 5, 10], 20)).toBe(10);
    expect(openingDollars([2, 5, 10, 20], 100)).toBe(20);
    expect(openingDollars([2], 50)).toBe(2);
    expect(openingDollars([2, 5, 10, 20], 7)).toBe(5);
  });
  it('else $2 (the smallest offered)', () => {
    expect(openingDollars([2, 5, 10, 20], 1)).toBe(2);
  });

  it('Enter on a horse opens the ticket at that amount; the arrows step through the offered amounts in rising order', () => {
    const opened = programKey({ focus: 2, mode: { kind: 'choosing' } }, 'Enter', keyCtx({ lastDollars: 10 }));
    expect(opened.state).toEqual({ focus: 2, mode: { kind: 'ticket', dollars: 10 } });
    expect(opened.outcome).toBeNull();
    let s = opened.state;
    s = programKey(s, 'ArrowRight', keyCtx()).state;
    expect(s.mode).toEqual({ kind: 'ticket', dollars: 20 });
    s = programKey(s, 'ArrowLeft', keyCtx()).state;
    s = programKey(s, 'ArrowLeft', keyCtx()).state;
    expect(s.mode).toEqual({ kind: 'ticket', dollars: 5 });
    // Walking left across the whole list never shows an amount that is not offered.
    const seen = new Set<number>();
    for (let i = 0; i < 8; i++) {
      s = programKey(s, 'ArrowLeft', keyCtx()).state;
      if (s.mode.kind === 'ticket') seen.add(s.mode.dollars);
    }
    for (const d of seen) expect([2, 5, 10, 20]).toContain(d);
  });

  it('the page shows the amounts the rules offer for the bankroll: $100 offers 2, 5, 10, 20, never 50 or 100', () => {
    let s: ProgramState = { focus: 0, mode: { kind: 'ticket', dollars: 2 } };
    const shown: string[] = [];
    for (let i = 0; i < 6; i++) {
      shown.push(screenOf(P1, dayWith(START), s).footer.find((t) => t.y === 214 && t.x === 20)!.text);
      s = programKey(s, 'ArrowRight', keyCtx()).state;
    }
    expect([...new Set(shown)]).toEqual(['< $2 >  on #1', '< $5 >  on #1', '< $10 >  on #1', '< $20 >  on #1']);
  });

  it('lastBetDollars is the amount of the latest ticket, skipping passes, and null before the first bet', () => {
    const d0 = dayWith(START);
    expect(lastBetDollars(d0)).toBeNull();
    const d1 = settled(P1, d0, { post: 1, dollars: 10 }, 2);
    expect(lastBetDollars(d1)).toBe(10);
    const p2 = programOf(2);
    const d2 = settled(p2, d1, null, 3);
    expect(lastBetDollars(d2)).toBe(10);
  });

  it('with only one amount offered no arrows are drawn and the arrows do not change it', () => {
    const poor = dayWith(400); // $4.00 offers $2 only (BK1: $7.40 offers $2)
    const s = screenOf(P1, poor, { focus: 2, mode: { kind: 'ticket', dollars: 2 } });
    const line = s.footer.find((t) => t.y === 214 && t.x === 20)!.text;
    expect(line).not.toMatch(/[<>]/);
    expect(line).toContain('$2');
    expect(line).toContain('on #3');
    const k = keyCtx({ offered: [2] });
    const open: ProgramState = { focus: 2, mode: { kind: 'ticket', dollars: 2 } };
    expect(programKey(open, 'ArrowRight', k).state).toEqual(open);
    expect(programKey(open, 'ArrowLeft', k).state).toEqual(open);
  });

  it('$7.40 and $2.00 each offer only $2', () => {
    for (const cents of [740, 200]) {
      const s = screenOf(P1, dayWith(cents), { focus: 0, mode: { kind: 'ticket', dollars: 2 } });
      expect(s.footer.find((t) => t.y === 214 && t.x === 20)!.text).not.toMatch(/[<>]/);
    }
  });
});

describe('BP9 Esc closes the ticket', () => {
  const open: ProgramState = { focus: 4, mode: { kind: 'ticket', dollars: 10 } };
  it('removes the band and returns focus to that horse, moving no money', () => {
    const before = screenOf(P1, dayWith(START), open);
    expect(before.band.length).toBeGreaterThan(0);
    const r = programKey(open, 'Escape', keyCtx());
    expect(r.outcome).toBeNull();
    expect(r.state).toEqual({ focus: 4, mode: { kind: 'choosing' } });
    const after = screenOf(P1, dayWith(START), r.state);
    expect(after.band).toEqual([]);
    expect(after.header[1].text).toBe('Bank $100.00');
    expect(after.cursor).toEqual({ x: 8, y: 58 + 19 * 4 + 5 });
    expect(after.slip).toEqual([]);
    expect(after.rows.every((row) => row.images.length === 0)).toBe(true);
  });
});

describe('the band marks the horse being bet on', () => {
  it('while the ticket is open the band covers the focused entry, from 1 row above to 1 row below, x16-250', () => {
    for (const focus of [0, 4, 7]) {
      const s = screenOf(P1, dayWith(START), { focus, mode: { kind: 'ticket', dollars: 5 } });
      const top = 58 + 19 * focus;
      const minY = Math.min(...s.band.map((r) => r.y));
      const maxY = Math.max(...s.band.map((r) => r.y + r.h));
      expect([minY, maxY]).toEqual([top - 1, top + 18]);
      expect(Math.min(...s.band.map((r) => r.x))).toBeGreaterThanOrEqual(16);
      expect(Math.max(...s.band.map((r) => r.x + r.w - 1))).toBe(250);
      for (const r of s.band) expect(r.color).toBe('Yellow');
    }
  });
  it('no band while choosing, and the cursor moves to the footer while the ticket is open', () => {
    expect(screenOf(P1, dayWith(START), choosing).band).toEqual([]);
    const open = screenOf(P1, dayWith(START), { focus: 3, mode: { kind: 'ticket', dollars: 5 } });
    expect(open.cursor).toEqual({ x: 8, y: 214 });
  });
});

describe('BP10 placing a bet and passing', () => {
  const bet = { post: 3, dollars: 10 };
  const day0 = dayWith(START);
  const dayPosted = posted(P1, day0, bet);
  const placed = screenOf(P1, dayPosted, { focus: 2, mode: { kind: 'placed' } });
  const odds = quote(ctx, P1, bet).odds[2];

  it('Enter on the ticket places exactly one bet for that post and amount, and nothing before it does', () => {
    const { state, outcomes } = press({ focus: 2, mode: { kind: 'choosing' } }, ['Enter', 'ArrowRight', 'Enter']);
    expect(outcomes).toEqual([null, null, { kind: 'bet', post: 3, dollars: 5 }]);
    expect(state.mode).toEqual({ kind: 'placed' });
    // Once placed, more keys do nothing (the stake can leave only once).
    const more = press(state, ['Enter', 'Enter', 'Escape']);
    expect(more.outcomes).toEqual([null, null, null]);
    expect(more.state).toEqual(state);
  });

  it('the bankroll drops by the stake once: $100.00 to $90.00 for a $10 bet', () => {
    expect(dayPosted.bankrollCents).toBe(9000);
    expect(placed.header[1].text).toBe('Bank $90.00');
    expect(screenOf(P1, day0, { focus: 2, mode: { kind: 'ticket', dollars: 10 } }).header[1].text).toBe('Bank $100.00');
  });

  it('draws the pencil tick in the margin cell x8-15, rows +5 to +12, on the bet horse only', () => {
    const ticks = placed.rows.flatMap((r) => r.images.map((im) => ({ post: r.post, top: r.top, ...im })));
    expect(ticks).toHaveLength(1);
    expect(ticks[0].post).toBe(3);
    expect([ticks[0].slot, ticks[0].x, ticks[0].y]).toEqual([SLOT_IDS.markPick, 8, ticks[0].top + 5]);
  });

  it('the cursor is not drawn while the tick shows (the tick wins the cell)', () => {
    expect(placed.cursor).toBeNull();
  });

  it('the band stays on the horse bet on', () => {
    const top = 58 + 19 * 2;
    expect(Math.min(...placed.band.map((r) => r.y))).toBe(top - 1);
  });

  it('draws the printed tote ticket: "Race 1, $10 to win on #3" and "{name} at {odds}", Ink, at x16 y215 and y225', () => {
    const name = [...D1.input.card.horses].find((h) => h.post === 3)!.name;
    expect(placed.footer).toEqual([
      { text: 'Race 1, $10 to win on #3', x: 16, y: 215, color: 'Ink' },
      { text: `${name} at ${odds}`, x: 16, y: 225, color: 'Ink' },
    ]);
  });

  it('the slip is a Bone slip x8-247, y209-235, Ink sides and bottom, with the torn top edge from the 24-column pattern, and the y210 rule is not drawn', () => {
    const TORN = [0, 0, 1, 2, 1, 1, 0, 1, 2, 2, 1, 0, 0, 0, 1, 1, 2, 1, 0, 1, 1, 2, 1, 0];
    const px = paint(placed.slip);
    for (let x = 8; x <= 247; x++) {
      const o = TORN[(x - 8) % 24];
      expect(px.get(`${x},${209 + o}`), `edge at x${x}`).toBe('Ink');
      for (let y = 209 + o + 1; y <= 234; y++) {
        expect(px.get(`${x},${y}`), `${x},${y}`).toBe(x === 8 || x === 247 ? 'Ink' : 'Bone');
      }
      for (let y = 209; y < 209 + o; y++) expect(px.has(`${x},${y}`), `above the edge ${x},${y}`).toBe(false);
      expect(px.get(`${x},235`), `bottom at x${x}`).toBe('Ink');
    }
    expect(px.get('8,209')).toBe('Ink');
    expect(px.get('247,209')).toBe('Ink');
    expect(placed.slip.every((r) => r.x >= 8 && r.x + r.w - 1 <= 247 && r.y >= 209 && r.y + r.h - 1 <= 235)).toBe(true);
    expect(placed.rules.map((r) => r.y)).toEqual([44, 56]);
  });

  it('no slip, tick or tote line is drawn before the bet is placed', () => {
    for (const state of [choosing, { focus: 2, mode: { kind: 'ticket', dollars: 10 } } as ProgramState]) {
      const s = screenOf(P1, day0, state);
      expect(s.slip).toEqual([]);
      expect(s.rules.map((r) => r.y)).toContain(210);
      expect(s.rows.flatMap((r) => r.images)).toEqual([]);
    }
  });

  it('Pass moves no money and draws no mark: no band, tick, slip or ticket; the bank is unchanged', () => {
    const r = programKey({ focus: 8, mode: { kind: 'choosing' } }, 'Enter', keyCtx());
    expect(r.outcome).toEqual({ kind: 'pass' });
    const dayPass = posted(P1, day0, null);
    expect(dayPass.bankrollCents).toBe(START);
    const s = screenOf(P1, dayPass, r.state);
    expect(s.header[1].text).toBe('Bank $100.00');
    expect(s.band).toEqual([]);
    expect(s.slip).toEqual([]);
    expect(s.rows.flatMap((x) => x.images)).toEqual([]);
    expect(s.footer.map((t) => t.text)).not.toContain('Race 1, $10 to win on #3');
  });
});

describe('BC2 scripted key paths', () => {
  it('digit, Enter, Enter places the bet on that post at $2, and no press before the third does anything but move', () => {
    const { outcomes, state } = press(initialProgramState(), ['Digit3', 'Enter', 'Enter']);
    expect(outcomes).toEqual([null, null, { kind: 'bet', post: 3, dollars: 2 }]);
    expect(state.mode.kind).toBe('placed');
  });

  it('Up, Enter passes on the second press', () => {
    const { outcomes } = press(initialProgramState(), ['ArrowUp', 'Enter']);
    expect(outcomes).toEqual([null, { kind: 'pass' }]);
  });

  it('after the result, one Enter reaches the next race\'s program: 4 presses for a bet, 3 for a pass, in total', () => {
    expect(RESULT_CONFIRM_KEYS).toEqual(expect.arrayContaining(['Enter', 'Space', 'KeyZ']));
    // The bet path: Digit3, Enter, Enter at the program, then Enter on the result.
    const day0 = dayWith(START);
    const bet = press(initialProgramState(), ['Digit3', 'Enter', 'Enter']).outcomes[2] as { kind: 'bet'; post: number; dollars: number };
    const day1 = settled(P1, day0, { post: bet.post, dollars: bet.dollars }, 3);
    const res = betResultScreen(runFor(P1), rd, {
      ticket: { post: 3, dollars: 2, odds: day1.records[0].ticket!.odds }, returnCents: day1.records[0].returnCents,
      winnerTwoDollarCents: day1.records[0].winnerTwoDollarCents, bankrollCents: day1.bankrollCents, dayEnded: day1.ended !== null,
    });
    expect(res.texts.find((t) => t.x === 20 && t.y === 220)!.text).toBe('Next race');
    // Then the next program is race 2, focus on post 1, choosing.
    expect(day1.ended).toBeNull();
    expect(day1.nextRace).toBe(2);
    const p2 = programOf(2);
    const next = screenOf(p2, day1, initialProgramState());
    expect(next.header[0].text).toBe('Race 2 of 8');
    expect(next.cursor).toEqual({ x: 8, y: 63 });
    // The pass path: Up, Enter at the program, then Enter on the result.
    const pass = press(initialProgramState(), ['ArrowUp', 'Enter']);
    expect(pass.outcomes[1]).toEqual({ kind: 'pass' });
    const dayPass = settled(P1, day0, null, 3);
    expect(dayPass.bankrollCents).toBe(START);
    expect(screenOf(p2, dayPass, initialProgramState()).header[1].text).toBe('Bank $100.00');
  });
});

const runCache = new Map<number, ReturnType<typeof runRace>>();
function runFor(p: RaceProgram) {
  let r = runCache.get(p.drawn.raceSeed);
  if (!r) { r = runRace(p.drawn.input, p.drawn.raceSeed); runCache.set(p.drawn.raceSeed, r); }
  return r;
}

describe('UI1 no estimate value on the program', () => {
  it('no text contains any of the estimate\'s numbers, a percentage or an estimate word', () => {
    // Four-digit and odd values that would show up as a leak; the real prices are short fractions.
    const wins = [4373, 2519, 1137, 891, 617, 311, 121, 31];
    const drawn = drawnOf()[0];
    const prog = programFor(ctx, drawn, estimateOf(wins));
    const states: ProgramState[] = [choosing, { focus: 8, mode: { kind: 'choosing' } }, { focus: 2, mode: { kind: 'ticket', dollars: 5 } }, { focus: 2, mode: { kind: 'placed' } }];
    for (const state of states) {
      const day = state.mode.kind === 'placed' ? posted(prog, dayWith(START), { post: 3, dollars: 5 }) : dayWith(START);
      const s = programScreen(inputFor(prog, drawn, day, state));
      const texts = [...s.header, ...s.heads, ...s.odds, ...s.footer, ...s.rows.flatMap((r) => r.texts)].map((t) => t.text);
      for (const t of texts) {
        for (const n of ['4373', '2519', '1137', '43.7', '25.1', '11.3', '43.73', '25.19']) expect(t, state.mode.kind).not.toContain(n);
        expect(t).not.toMatch(/%|estimate|chance|probab|likel/i);
      }
    }
  });
});

describe('program states: edge cases', () => {
  it('last race: the header reads "Race 8 of 8"', () => {
    const s = screenOf(programOf(8), dayWith(START), choosing);
    expect(s.header[0].text).toBe('Race 8 of 8');
    expect(screenOf(programOf(1), dayWith(START), choosing).header[0].text).toBe('Race 1 of 8');
  });

  it('fewer than 8 horses: entries end early, the y210 rule and the footer stay, Pass follows the last horse', () => {
    const drawn = structuredClone(drawnOf()[0]);
    drawn.input.card.horses = drawn.input.card.horses.slice(0, 5);
    drawn.horseIds = drawn.horseIds.slice(0, 5);
    drawn.styles = drawn.styles.slice(0, 5);
    const prog: RaceProgram = { drawn, estimate: { runs: P1.estimate.runs, wins: P1.estimate.wins.slice(0, 5) }, crowdDollars: P1.crowdDollars.slice(0, 5) };
    const s = screenOf(prog, dayWith(START), choosing, drawn);
    expect(s.rows).toHaveLength(5);
    expect(s.odds).toHaveLength(5);
    expect(s.rules.map((r) => r.y)).toContain(210);
    expect(s.footer.map((t) => t.text)).toContain('Pass this race');
    // Pass is one stop after the 5th horse; 6 to 8 are not stops.
    const k = keyCtx({ horses: 5 });
    const down = press({ focus: 4, mode: { kind: 'choosing' } }, ['ArrowDown'], k).state;
    expect(screenOf(prog, dayWith(START), down, drawn).cursor).toEqual({ x: 8, y: 226 });
    expect(programKey(initialProgramState(), 'Digit7', k).state.focus).toBe(0);
    expect(programKey(initialProgramState(), 'Digit5', k).state.focus).toBe(4);
    expect(programKey(initialProgramState(), 'ArrowUp', k).state.focus).toBe(5);
  });

  it('no blurb: footer line 1 is blank but Pass is still printed', () => {
    const noBlurb = Object.fromEntries(Object.entries(lookFor(D1)).map(([id, v]) => [id, { ...v, blurb: '' }]));
    const s = programScreen({ ...inputFor(P1, D1, dayWith(START), choosing), look: noBlurb });
    expect(s.footer.filter((t) => t.y === 214 && t.text !== '')).toEqual([]);
    expect(s.footer.find((t) => t.y === 226)).toMatchObject({ text: 'Pass this race', x: 20 });
  });

  it('only $2 offered: the ticket still opens, with no arrows, and places a $2 bet', () => {
    const k = keyCtx({ offered: [2] });
    const r = press({ focus: 0, mode: { kind: 'choosing' } }, ['Enter', 'Enter'], k);
    expect(r.outcomes).toEqual([null, { kind: 'bet', post: 1, dollars: 2 }]);
  });

  it('no blurb data at all for a horse: nothing is thrown', () => {
    expect(() => programScreen({ ...inputFor(P1, D1, dayWith(START), choosing), look: {} })).not.toThrow();
  });
});

describe('no yellow or red text on the paper program', () => {
  it('every text is Ink or Maroon (or a cloth number), never Yellow', () => {
    const s = screenOf(P1, dayWith(START), { focus: 2, mode: { kind: 'ticket', dollars: 5 } });
    const texts = [...s.header, ...s.heads, ...s.odds, ...s.footer];
    for (const t of texts) expect(['Ink', 'Maroon']).toContain(t.color);
    // Red and Emerald are not used on the program (money colors are for the End of day Change only).
    for (const t of [...texts, ...s.rows.flatMap((r) => r.texts)]) expect(['Red', 'Emerald', 'Turf']).not.toContain(t.color);
  });
});
