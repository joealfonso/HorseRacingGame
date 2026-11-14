import { describe, expect, it } from 'vitest';
import cardLookJson from './cardLook.json';
import dayJson from './day.json';
import paletteJson from './palette.json';
import raceDayJson from './raceDay.json';
import slotsJson from './slots.json';
import { programConditionsLine, programPlaceLine } from './cardWords';
import { loadData } from './load';
import { checkBettingCopy, checkProgramLines, loadRaceDay, validateRaceDay } from './raceDayLoad';
import type { Race } from './schema';
import { DataError } from './validate';

// BP4 (lines 3 and 4 over 30 characters fail at load, naming the file and field), BC1 (the loader
// holds every new copy key to its field) and the header lines' words, from
// docs/specs/betting-screens.md sections 3, 8, 9 and DESIGN "Program pages, Betting additions".

const game = loadData();
const raw = () => structuredClone({ palette: paletteJson, slots: slotsJson, cardLook: cardLookJson, raceDay: raceDayJson }) as {
  palette: unknown; slots: unknown; cardLook: unknown; raceDay: any; // eslint-disable-line @typescript-eslint/no-explicit-any
};
const races = (): Race[] => structuredClone(dayJson.races) as Race[];
const shipped = loadRaceDay(game).raceDay;

describe('header lines 3 and 4 (the words)', () => {
  const race = (over: Partial<Race> & { trackBias?: Race['trackBias'] } = {}): Race => ({ ...races()[0], ...over });

  it('line 3 is "{track}, {distance words}": "Churchill Downs, 1 1/4 miles"', () => {
    expect(programPlaceLine(race(), shipped.copy.card)).toBe('Churchill Downs, 1 1/4 miles');
  });

  it('line 4 is "{Surface}, {going}, {bias phrase}": "Dirt, fast, playing fair"', () => {
    expect(programConditionsLine(race(), shipped.copy.card, shipped.copy.program.bias)).toBe('Dirt, fast, playing fair');
  });

  it('line 4 with a bias uses the short phrases', () => {
    const line = (lane: 'neutral' | 'inside' | 'outside', style: 'neutral' | 'speed' | 'closers') =>
      programConditionsLine(race({ trackBias: { lane, style } }), shipped.copy.card, shipped.copy.program.bias);
    expect(line('inside', 'neutral')).toBe('Dirt, fast, rail is good');
    expect(line('outside', 'neutral')).toBe('Dirt, fast, outside good');
    expect(line('neutral', 'speed')).toBe('Dirt, fast, speed holding');
    expect(line('neutral', 'closers')).toBe("Dirt, fast, closers' day");
  });

  it('every shipped race passes the width check', () => {
    expect(() => checkProgramLines(races(), shipped)).not.toThrow();
    for (const r of races()) {
      expect(programPlaceLine(r, shipped.copy.card).length).toBeLessThanOrEqual(30);
      expect(programConditionsLine(r, shipped.copy.card, shipped.copy.program.bias).length).toBeLessThanOrEqual(30);
    }
  });
});

describe('BP4 lines 3 and 4 over 30 characters fail at load, naming the file and the field', () => {
  const failure = (rs: Race[]): DataError => {
    try { checkProgramLines(rs, shipped); } catch (e) { return e as DataError; }
    throw new Error('expected checkProgramLines to throw');
  };
  const suffix = ', 1 1/4 miles'.length; // line 3 is the track plus this, for the shipped 10-furlong races

  it('line 3 of exactly 30 characters passes and 31 fails', () => {
    const rs = races();
    rs[2].track = 'T'.repeat(30 - suffix);
    expect(programPlaceLine(rs[2], shipped.copy.card)).toHaveLength(30);
    expect(() => checkProgramLines(rs, shipped)).not.toThrow();
    rs[2].track = 'T'.repeat(31 - suffix);
    const err = failure(rs);
    expect(err).toBeInstanceOf(DataError);
    expect(err.file).toBe('src/data/day.json');
    expect(err.issues.map((i) => i.path)).toEqual(['races[2].track']);
    expect(err.message).toContain('src/data/day.json');
    expect(err.message).toContain('races[2].track');
  });

  it('line 4 over 30 characters fails, naming the bias field', () => {
    const rs = races();
    rs[5].trackBias = { lane: 'outside', style: 'speed' }; // "Dirt, fast, outside good, speed holding" is 39
    const err = failure(rs);
    expect(err.file).toBe('src/data/day.json');
    expect(err.issues.map((i) => i.path)).toEqual(['races[5].trackBias']);
    expect(err.message).toContain('races[5].trackBias');
  });

  it('both lines over in different races are both reported', () => {
    const rs = races();
    rs[0].track = 'T'.repeat(40);
    rs[7].trackBias = { lane: 'inside', style: 'closers' };
    expect(failure(rs).issues.map((i) => i.path).sort()).toEqual(['races[0].track', 'races[7].trackBias']);
  });
});

describe('BC1 the loader holds every new copy key to its field', () => {
  // Each case: where the key is, what fills it at its widest with a literal-only or placeholder-only
  // template, and the field's width in 8 px cells from the spec's geometry. `base` is the filled length of `hole`.
  // Widest values: bank $165,000.00 (11), stake $100 (4), total $20,620.00 (10), odds 99-1 (4), price $999.90 (6), race and post 8 (1).
  type Case = { path: string[]; err: string; hole: string; base: number; max: number };
  const cases: Case[] = [
    { path: ['program', 'bank'], err: 'copy.program.' /* the loader may name bank or race for a line 1 overflow */, hole: '{amount}', base: 11, max: 30 - 1 - 11 }, // beside "Race 8 of 8"
    { path: ['program', 'race'], err: 'copy.program.race', hole: '{r}{n}', base: 2, max: 30 - 1 - 16 }, // beside "Bank $165,000.00"
    { path: ['program', 'pass'], err: 'copy.program.pass', hole: '', base: 0, max: 28 },
    { path: ['program', 'passLine'], err: 'copy.program.passLine', hole: '', base: 0, max: 30 },
    { path: ['program', 'pending'], err: 'copy.program.pending', hole: '', base: 0, max: 30 },
    { path: ['ticket', 'amount'], err: 'copy.ticket.amount', hole: '{amount}{n}', base: 5, max: 28 - 1 - 'Enter: bet'.length },
    { path: ['ticket', 'pays'], err: 'copy.ticket.pays', hole: '{amount}{total}', base: 14, max: 28 },
    { path: ['ticket', 'printed', '0'], err: 'copy.ticket.printed[0]', hole: '{r}{amount}{n}', base: 6, max: 28 },
    { path: ['ticket', 'printed', '1'], err: 'copy.ticket.printed[1]', hole: '{odds}', base: 4, max: 28 - 0 },
    { path: ['hud', 'bet'], err: 'copy.hud.bet', hole: '{amount}{odds}', base: 8, max: 18 },
    { path: ['hud', 'watching'], err: 'copy.hud.watching', hole: '', base: 0, max: 18 },
    { path: ['msg', 'won'], err: 'copy.msg.won', hole: '', base: 0, max: 30 },
    { path: ['msg', 'lost'], err: 'copy.msg.lost', hole: '', base: 0, max: 30 },
    { path: ['result', 'paid'], err: 'copy.result.paid', hole: '{amount}{total}', base: 14, max: 30 },
    { path: ['result', 'lost'], err: 'copy.result.lost', hole: '{amount}{odds}', base: 8, max: 30 },
    { path: ['result', 'passed'], err: 'copy.result.passed', hole: '', base: 0, max: 30 },
    { path: ['result', 'winPrice'], err: 'copy.result.winPrice', hole: '{price}', base: 7, max: 30 },
    { path: ['result', 'end'], err: 'copy.result.end', hole: '', base: 0, max: 10 },
    { path: ['result', 'next'], err: 'copy.result.next', hole: '', base: 0, max: 10 },
  ];
  const withValue = (c: Case, value: string) => {
    const r = raw();
    let node = r.raceDay.copy;
    for (const k of c.path.slice(0, -1)) node = node[k];
    node[c.path[c.path.length - 1]] = value;
    return r;
  };
  // The betting boot runs both checks (src/main.ts): validateRaceDay, then checkBettingCopy, which holds
  // copy.result.next to the 10 cells beside the bank. validateRaceDay alone still allows the Card loop's 28.
  const run = (r: ReturnType<typeof raw>) => checkBettingCopy(validateRaceDay(r, game).raceDay);
  const filledTo = (c: Case, len: number) => c.hole + 'x'.repeat(len - c.base);

  it('the shipped copy passes', () => {
    expect(() => run(raw())).not.toThrow();
  });

  for (const c of cases) {
    it(`${c.err}: ${c.max} cells at its widest pass, ${c.max + 1} fail naming the key`, () => {
      expect(() => run(withValue(c, filledTo(c, c.max)))).not.toThrow();
      let err: unknown;
      try { run(withValue(c, filledTo(c, c.max + 1))); } catch (e) { err = e; }
      expect(err, `${c.err} at ${c.max + 1}`).toBeInstanceOf(DataError);
      expect((err as DataError).message).toContain(c.err);
    });
  }

  it('the confirm text must leave a cell between itself and the longest "< $100 >  on #8": 12 cells pass, 13 fail', () => {
    const r12 = raw();
    r12.raceDay.copy.ticket.confirm = 'x'.repeat(12);
    expect(() => run(r12)).not.toThrow();
    const r13 = raw();
    r13.raceDay.copy.ticket.confirm = 'x'.repeat(13);
    expect(() => run(r13)).toThrow(DataError);
  });

  it('a column head too wide for its column fails: 8 cells for Speed, Stam. or Kick, 5 for Odds', () => {
    for (const [key, len] of [['speed', 8], ['stamina', 8], ['kick', 8], ['odds', 5]] as const) {
      const r = raw();
      r.raceDay.copy.program.heads[key] = 'W'.repeat(len);
      expect(() => run(r), key).toThrow(DataError);
    }
    for (const [key, text] of [['speed', 'Speed'], ['stamina', 'Stam.'], ['kick', 'Kick'], ['odds', 'Odds']] as const) {
      const r = raw();
      r.raceDay.copy.program.heads[key] = text;
      expect(() => run(r), key).not.toThrow();
    }
  });

  it('a bias phrase that would overflow header line 4 on its own fails', () => {
    const r = raw();
    r.raceDay.copy.program.bias.fair = 'x'.repeat(31);
    expect(() => run(r)).toThrow(DataError);
  });

  it('a template with a hole it may not use fails', () => {
    const r = raw();
    r.raceDay.copy.hud.watching = 'Just {amount}';
    expect(() => run(r)).toThrow(DataError);
  });
});
