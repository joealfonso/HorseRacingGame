import { describe, expect, it } from 'vitest';
import bettingJson from '../data/betting.json';
import {
  bankLine, hudBetLine, money, printedTicketLines, raceOfLine, resultLostLine, resultPaidLine, stake, ticketAmountLine, ticketPaysLine, winPriceLine,
} from './betCopy';
import { rd } from './testkit';

// BC1 from docs/specs/betting-screens.md sections 3, 8 and 9: the money format, every new copy key
// filled with its longest values fits its field, and no copy string holds a banned word.

const copy = rd.copy;
const W = 8; // main font cell

describe('money format: "$" then whole dollars with commas, then cents; bet amounts have no cents', () => {
  it('money', () => {
    expect(money(0)).toBe('$0.00');
    expect(money(5)).toBe('$0.05');
    expect(money(720)).toBe('$7.20');
    expect(money(10000)).toBe('$100.00');
    expect(money(123450)).toBe('$1,234.50');
    expect(money(16_500_000)).toBe('$165,000.00');
    expect(money(2_062_000)).toBe('$20,620.00');
  });
  it('stake', () => {
    expect(stake(2)).toBe('$2');
    expect(stake(10)).toBe('$10');
    expect(stake(100)).toBe('$100');
  });
});

describe('the strings the spec shows', () => {
  it('program and ticket lines', () => {
    expect(raceOfLine(copy, 3, 8)).toBe('Race 3 of 8');
    expect(bankLine(copy, 10000)).toBe('Bank $100.00');
    expect(ticketAmountLine(copy, 10, 3, false)).toBe('< $10 >  on #3');
    expect(ticketPaysLine(copy, 10, 3700)).toBe('$10 to win pays $37.00');
    expect(printedTicketLines(copy, 3, 10, 3, 'Legally A Horse', '5-2')).toEqual(['Race 3, $10 to win on #3', 'Legally A Horse at 5-2']);
  });
  it('with one amount offered the arrows are not drawn and the text stays in place', () => {
    const line = ticketAmountLine(copy, 2, 3, true);
    expect(line).not.toMatch(/[<>]/);
    expect(line.length).toBe(ticketAmountLine(copy, 2, 3, false).length);
    expect(line.trim()).toMatch(/^\$2\s+on #3$/);
  });
  it('race HUD and result lines', () => {
    expect(hudBetLine(copy, 10, '5-2')).toBe('$10 to win, 5-2');
    expect(resultPaidLine(copy, 10, 3700)).toBe('$10 to win paid $37.00');
    expect(resultLostLine(copy, 10, '5-2')).toBe('Lost $10 at 5-2');
    expect(winPriceLine(copy, 720)).toBe('$2 to win paid $7.20');
  });
  it('static strings', () => {
    expect(copy.program.pass).toBe('Pass this race');
    expect(copy.program.passLine).toBe('Sit this one out and watch.');
    expect(copy.program.pending).toBe('The crowd is still betting.');
    expect(copy.ticket.confirm).toBe('Enter: bet');
    expect(copy.hud.watching).toBe('Just watching');
    expect(copy.msg.won).toBe('That ticket is good');
    expect(copy.msg.lost).toBe('No luck this time');
    expect(copy.result.passed).toBe('No bet. Watched for free.');
    expect(copy.result.end).toBe('End of day');
    expect(copy.result.next).toBe('Next race');
    expect(copy.program.heads).toEqual({ speed: 'Speed', stamina: 'Stam.', kick: 'Kick', odds: 'Odds' });
  });
});

describe('BC1 every new copy key filled with its longest values fits its field', () => {
  // The longest values the spec names: $165,000.00 bank, a $100 stake, a $20,620.00 return, 4-character odds,
  // a $999.90 two-dollar price, race 8, post 8, and an 18-character horse name (DESIGN).
  const BANK = 16_500_000;
  const NAME = 'Eighteen Chars Nam';
  const fit = (text: string, chars: number, label: string) => expect(text.length, `${label}: "${text}"`).toBeLessThanOrEqual(chars);

  it('header line 1: "Race 8 of 8" and "Bank $165,000.00" fit the 30 cells x8-247 with a gap', () => {
    const left = raceOfLine(copy, 8, 8);
    const right = bankLine(copy, BANK);
    fit(left + ' ' + right, 30, 'line 1');
  });
  it('footer lines from x20 hold 28 cells (x20-247)', () => {
    fit(copy.program.pass, 28, 'pass');
    fit(ticketPaysLine(copy, 100, 2_062_000), 28, 'pays');
    // "< $100 >  on #8" plus a gap plus "Enter: bet" right-aligned to x247
    fit(ticketAmountLine(copy, 100, 8, false) + ' ' + copy.ticket.confirm, 28, 'amount and confirm');
    expect(20 + W * ticketAmountLine(copy, 100, 8, false).length - 1).toBeLessThanOrEqual(139); // spec: ends x139
  });
  it('footer line 1 from x8 holds 30 cells', () => {
    fit(copy.program.passLine, 30, 'passLine');
    fit(copy.program.pending, 30, 'pending');
  });
  it('the printed tote ticket lines, from x16 inside the border at x247, hold 28 cells', () => {
    const [a, b] = printedTicketLines(copy, 8, 100, 8, NAME, '99-1');
    fit(a, 28, 'printed 1');
    fit(b, 28, 'printed 2');
    expect(16 + W * 28 - 1).toBeLessThan(247);
  });
  it('the race HUD column holds 18 cells', () => {
    fit(hudBetLine(copy, 100, '99-1'), 18, 'hud.bet');
    fit(copy.hud.watching, 18, 'hud.watching');
    for (const margin of ['nose', 'head', 'neck', '9 3/4', '1 1/2']) fit(copy.hud.leads.replace('{margin}', margin), 18, 'hud.leads');
  });
  it('the wire messages hold 30 cells', () => {
    fit(copy.msg.won, 30, 'won');
    fit(copy.msg.lost, 30, 'lost');
  });
  it('the result lines hold 30 cells', () => {
    fit(resultPaidLine(copy, 100, 2_062_000), 30, 'paid');
    fit(resultLostLine(copy, 100, '99-1'), 30, 'lost');
    fit(copy.result.passed, 30, 'passed');
    fit(winPriceLine(copy, 99_990), 30, 'winPrice');
  });
  it('the action holds 10 cells (x20-99) and ends before the longest bank starts', () => {
    for (const a of [copy.result.next, copy.result.end]) {
      fit(a, 10, 'action');
      expect(20 + W * a.length).toBeLessThan(248 - W * bankLine(copy, BANK).length);
    }
  });
  it('the column heads each fit before the next one starts, and Odds fits x216-247', () => {
    const h = copy.program.heads;
    expect(40 + W * h.speed.length).toBeLessThanOrEqual(98);
    expect(98 + W * h.stamina.length).toBeLessThanOrEqual(156);
    expect(156 + W * h.kick.length).toBeLessThanOrEqual(216);
    expect(h.odds.length).toBeLessThanOrEqual(4);
  });
  it('the bias phrases fit header line 4 on their own (13 or fewer, per the spec)', () => {
    for (const phrase of Object.values(copy.program.bias)) fit(phrase, 13, 'bias');
  });
});

describe('BC1 no copy string contains a banned word, compared case-insensitively', () => {
  const banned: string[] = bettingJson.copy.bannedWords;
  const strings = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);

  it('the banned list in data includes the words SAFE4 names', () => {
    for (const w of ['deposit', 'withdraw', 'cash out', 'real money', 'buy', 'purchase', 'credit card', 'payment']) expect(banned).toContain(w);
  });

  it('every string in the race-day copy', () => {
    const all = strings(copy);
    expect(all.length).toBeGreaterThan(100);
    for (const text of all) for (const w of banned) expect(text.toLowerCase(), `"${text}" has "${w}"`).not.toContain(w.toLowerCase());
  });

  it('the betting copy filled with its real values', () => {
    const filled = [
      raceOfLine(copy, 8, 8), bankLine(copy, 16_500_000), ticketAmountLine(copy, 100, 8, false), ticketAmountLine(copy, 2, 8, true), ticketPaysLine(copy, 100, 2_062_000),
      ...printedTicketLines(copy, 8, 100, 8, 'Name', '99-1'), hudBetLine(copy, 100, '99-1'), resultPaidLine(copy, 100, 2_062_000), resultLostLine(copy, 100, '99-1'),
      winPriceLine(copy, 99_990),
    ];
    for (const text of filled) for (const w of banned) expect(text.toLowerCase(), text).not.toContain(w.toLowerCase());
  });

  it('the words the spec proposes to add also stay out of the new betting copy (section 8)', () => {
    const proposed = ['deposit', 'withdraw', 'cash out', 'cashout', 'cash in', 'real money', 'buy', 'purchase', 'credit card', 'debit', 'payment', 'pay now', 'top up',
      'add funds', 'funds', 'wallet', 'cashier', 'checkout', 'redeem', 'bonus', 'free bet', 'promo', 'jackpot', 'casino', 'usd'];
    const betting = strings([copy.program, copy.ticket, copy.hud, copy.msg, copy.result.paid, copy.result.lost, copy.result.passed, copy.result.winPrice, copy.result.end]);
    for (const text of betting) for (const w of proposed) expect(text.toLowerCase(), `"${text}" has "${w}"`).not.toContain(w);
  });
});
