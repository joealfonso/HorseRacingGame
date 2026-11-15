import { describe, expect, it } from 'vitest';
import { dayWith, programOf, settled } from './betKit';
import { betResultScreen, resultScreen, type BetResultInput } from './resultScreen';
import { race, rd } from './testkit';

// BS1 to BS4 from docs/specs/betting-screens.md sections 5 and 9, plus UI1 on the result.
// The aria-live text of BS4 has no headless form in the code today (see the report).

const result = race(3);
const winner = result.finish[0];
const loser = result.finish[3];
const nameOf = (id: string) => result.inputs.card.horses.find((h) => h.id === id)!.name;
const at = (s: ReturnType<typeof betResultScreen>, y: number, x = 8) => s.texts.find((t) => t.y === y && t.x === x)!;
const TRIP_Y = (i: number) => 112 + 11 * i;
const TIME_Y = (i: number) => 184 + 12 * i;
const ACTION_Y = 220; // RESULT_NEXT in the spec: line 4 of the time section

const won: BetResultInput = { ticket: { post: winner.post, dollars: 10, odds: '5-2' }, returnCents: 3700, winnerTwoDollarCents: 720, bankrollCents: 12700, dayEnded: false };
const lost: BetResultInput = { ticket: { post: loser.post, dollars: 10, odds: '5-2' }, returnCents: 0, winnerTwoDollarCents: 720, bankrollCents: 9000, dayEnded: false };
const passed: BetResultInput = { ticket: null, returnCents: 0, winnerTwoDollarCents: 720, bankrollCents: 10000, dayEnded: false };

describe('BS1 trip line 5 and the trip', () => {
  it('a win: line 5 is "$10 to win paid $37.00" (the total returned), line 1 is the bet horse in Maroon', () => {
    const s = betResultScreen(result, rd, won);
    expect(at(s, TRIP_Y(4)).text).toBe('$10 to win paid $37.00');
    expect(at(s, TRIP_Y(0)).text).toBe(nameOf(winner.id));
    expect(at(s, TRIP_Y(0)).color).toBe('Maroon');
    expect(at(s, TRIP_Y(1)).text).toMatch(/^Won by /);
  });

  it('a loss: line 5 is "Lost $10 at 5-2", line 1 your horse, line 2 "4th, beaten ..."', () => {
    const s = betResultScreen(result, rd, lost);
    expect(at(s, TRIP_Y(4)).text).toBe('Lost $10 at 5-2');
    expect(at(s, TRIP_Y(0)).text).toBe(nameOf(loser.id));
    expect(at(s, TRIP_Y(1)).text).toMatch(/^4th, beaten /);
  });

  it('a pass: line 5 is "No bet. Watched for free." and lines 1 to 4 are the winner\'s', () => {
    const s = betResultScreen(result, rd, passed);
    expect(at(s, TRIP_Y(4)).text).toBe('No bet. Watched for free.');
    const winnersTrip = resultScreen(result, rd, winner.id).texts.filter((t) => t.y >= 112 && t.y < TRIP_Y(4));
    expect(winnersTrip).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(at(s, TRIP_Y(i)).text).toBe(winnersTrip[i].text);
      expect(at(s, TRIP_Y(i)).color).toBe(winnersTrip[i].color);
    }
    expect(at(s, TRIP_Y(0)).text).toBe(nameOf(winner.id));
  });

  it('exactly five trip lines, no "Orders:" line', () => {
    for (const b of [won, lost, passed]) {
      const s = betResultScreen(result, rd, b);
      expect(s.texts.filter((t) => t.y >= 112 && t.y < 184 && t.x === 8).map((t) => t.y)).toEqual([0, 1, 2, 3, 4].map(TRIP_Y));
      expect(s.texts.map((t) => t.text).join('|')).not.toContain('Orders:');
    }
  });

  it('the band and Ink arrow are on your horse\'s row only when you bet', () => {
    const s = betResultScreen(result, rd, lost);
    expect(s.band.length).toBeGreaterThan(0);
    expect(s.rows.filter((r) => r.yours).map((r) => r.id)).toEqual([loser.id]);
    expect(s.rows.filter((r) => r.marker !== null)).toHaveLength(1);
    const p = betResultScreen(result, rd, passed);
    expect(p.band).toEqual([]);
    expect(p.rows.every((r) => !r.yours && r.marker === null)).toBe(true);
  });

  it('the order section lists all eight horses in finish order', () => {
    const s = betResultScreen(result, rd, passed);
    expect(s.rows.map((r) => r.id)).toEqual(result.finish.map((f) => f.id));
  });
});

describe('BS2 time lines 3 and 4', () => {
  it('lines 1 and 2 are as built', () => {
    const s = betResultScreen(result, rd, won);
    expect(at(s, TIME_Y(0)).text).toMatch(/^Time \d:\d\d\.\d\d, (hot|honest|slow) pace$/);
    expect(at(s, TIME_Y(1)).text).toBe('Splits');
  });

  it('line 3 is the winner\'s $2 price: "$2 to win paid $7.20"', () => {
    for (const b of [won, lost, passed]) expect(at(betResultScreen(result, rd, b), TIME_Y(2)).text).toBe('$2 to win paid $7.20');
    expect(at(betResultScreen(result, rd, { ...won, winnerTwoDollarCents: 16600 }), TIME_Y(2)).text).toBe('$2 to win paid $166.00');
  });

  it('line 4 is the action at x20 and "Bank {bankroll}" right-aligned to x247, Ink, with the cursor at x8', () => {
    const s = betResultScreen(result, rd, won);
    expect(at(s, ACTION_Y, 20).text).toBe('Next race');
    const bank = s.texts.find((t) => t.text === 'Bank $127.00')!;
    expect(bank.y).toBe(ACTION_Y);
    expect(bank.x + 8 * bank.text.length).toBe(248);
    expect(bank.color).toBe('Ink');
    expect(s.cursor).toEqual({ x: 8, y: ACTION_Y });
  });

  it('the bank shown is the settled bankroll from the rules (BK3), through a real settle', () => {
    const p = programOf(1);
    const cases = [
      { bet: { post: 2, dollars: 10 }, winPost: 5, want: 9000 },
      { bet: null, winPost: 3, want: 10000 },
      { bet: { post: 2, dollars: 10 }, winPost: 2, want: null },
    ];
    for (const c of cases) {
      const day = settled(p, dayWith(10000), c.bet, c.winPost);
      const rec = day.records[0];
      if (c.want !== null) expect(day.bankrollCents).toBe(c.want);
      else expect(day.bankrollCents).toBeGreaterThan(10000 - 1000); // a win returns more than the stake
      const s = betResultScreen(result, rd, {
        ticket: rec.ticket === null ? null : { post: rec.ticket.post, dollars: rec.ticket.dollars, odds: rec.ticket.odds },
        returnCents: rec.returnCents, winnerTwoDollarCents: rec.winnerTwoDollarCents, bankrollCents: day.bankrollCents, dayEnded: day.ended !== null,
      });
      const bank = `Bank $${Math.floor(day.bankrollCents / 100).toLocaleString('en-US')}.${String(day.bankrollCents % 100).padStart(2, '0')}`;
      expect(s.texts.some((t) => t.text === bank), bank).toBe(true);
    }
  });
});

describe('BS3 the action', () => {
  it('reads "Next race" while the day goes on and "End of day" when it has ended', () => {
    expect(at(betResultScreen(result, rd, won), ACTION_Y, 20).text).toBe('Next race');
    expect(at(betResultScreen(result, rd, { ...won, dayEnded: true }), ACTION_Y, 20).text).toBe('End of day');
  });

  it('from the rules: the day ends after race 8 and when the settled bankroll is under $2, and not otherwise', () => {
    const afterEight = settled(programOf(8), { ...dayWith(10000), nextRace: 8 }, null, 1);
    expect(afterEight.ended).not.toBeNull();
    const broke = settled(programOf(1), dayWith(200), { post: 1, dollars: 2 }, 2); // the $2.00 stake lost, nothing left
    expect(broke.bankrollCents).toBe(0);
    expect(broke.ended).not.toBeNull();
    const fine = settled(programOf(1), dayWith(10000), { post: 1, dollars: 2 }, 2);
    expect(fine.ended).toBeNull();
    const actions = [afterEight, broke, fine].map((d) => at(betResultScreen(result, rd, { ...passed, dayEnded: d.ended !== null }), ACTION_Y, 20).text);
    expect(actions).toEqual(['End of day', 'End of day', 'Next race']);
  });

  it('both actions fit before the longest bank (action at most 10 characters)', () => {
    for (const dayEnded of [true, false]) {
      const s = betResultScreen(result, rd, { ...won, bankrollCents: 16_500_000, dayEnded });
      const a = at(s, ACTION_Y, 20);
      const bank = s.texts.find((t) => t.text.startsWith('Bank '))!;
      expect(a.text.length).toBeLessThanOrEqual(10);
      expect(a.x + 8 * a.text.length).toBeLessThan(bank.x);
      expect(bank.text).toBe('Bank $165,000.00');
    }
  });
});

describe('BS4 and UI1 no profit, change or estimate figure on the result', () => {
  const inputs: [string, BetResultInput][] = [
    ['win', won], ['loss', lost], ['pass', passed],
    ['big win', { ...won, ticket: { post: winner.post, dollars: 100, odds: '99-1' }, returnCents: 2_062_000, bankrollCents: 2_072_000 }],
  ];
  const cents = (n: number) => `${Math.floor(Math.abs(n) / 100).toLocaleString('en-US')}.${String(Math.abs(n) % 100).padStart(2, '0')}`;
  for (const [name, b] of inputs) {
    it(`${name}: no change figure, no profit, no sign, no percentage, no estimate`, () => {
      const s = betResultScreen(result, rd, b);
      const profit = b.returnCents - (b.ticket?.dollars ?? 0) * 100;
      for (const t of [...s.texts, ...s.rows.flatMap((r) => r.texts)]) {
        expect(t.text, t.text).not.toMatch(/\+\$|-\$|profit|net |change|ahead|gain|%|estimate|chance|probab|likel/i);
        if (b.ticket !== null && profit > 0) expect(t.text, `profit in "${t.text}"`).not.toContain('$' + cents(profit));
      }
    });

    it(`${name}: every text is Ink or Maroon (no Emerald, Red or Turf), and money lines are Ink`, () => {
      const s = betResultScreen(result, rd, b);
      for (const t of [...s.texts, ...s.rows.flatMap((r) => r.texts)]) expect(['Ink', 'Maroon'], t.text).toContain(t.color);
      const money = s.texts.filter((t) => t.text.includes('$'));
      expect(money.length).toBeGreaterThan(0);
      for (const t of money) expect(t.color).toBe('Ink');
    });
  }

  it('the seed is not on the page (it moved to the End of day page)', () => {
    const s = betResultScreen(result, rd, won);
    expect(s.texts.map((t) => t.text)).not.toContain('Seed');
    expect(s.texts.map((t) => t.text)).not.toContain(String(result.seed));
  });
});
