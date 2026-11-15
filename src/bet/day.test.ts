import { describe, expect, it } from 'vitest';
import { runRace, SIM_VERSION } from '../sim/runRace';
import { daySummary, drawnDay, goToPost, newDay, playDay, programFor, quote, settle, type DayContext, type DayState } from './day';
import { estimateOf, runEstimate, startEstimate, stepEstimate } from './estimate';
import type { Bet } from './market';
import { perDollarCents } from './payout';
import { realCtx } from './testkit';

// BK2 to BK5, DT4, DT5 and the End of day figures (docs/specs/betting-simple.md, "The loop"
// and "Money and bets"). Small N for the estimate keeps each day to a fraction of a second.

const ctx = realCtx();
const N = 6;
const DAY = 555;
const drawn = drawnDay(ctx, DAY);
const winners = drawn.map((r) => runRace(r.input, r.raceSeed).finish[0].post);
const loserOf = (race: number) => (winners[race - 1] % 8) + 1;
const programOf = (c: DayContext, race: number) => programFor(c, drawn[race - 1], runEstimate(drawn[race - 1].input, DAY, race, N));

/** Go to the post and settle one race with its real result. */
function play(c: DayContext, state: DayState, bet: Bet | null): DayState {
  const r = drawn[state.nextRace - 1];
  const s = goToPost(c, state, programOf(c, r.race), bet);
  return settle(c, s, runRace(r.input, r.raceSeed));
}

describe('BK2: what "pays" shows is what is credited', () => {
  it('BK2: a $10 winning bet is credited exactly the quoted pays, the bet in the pool', () => {
    const program = programOf(ctx, 1);
    const bet = { post: winners[0], dollars: 10 };
    const q = quote(ctx, program, bet);
    const crowd = program.crowdDollars;
    const pool = crowd.reduce((a, b) => a + b, 0) * 100 + 1000;
    expect(q.poolCents).toBe(pool);
    expect(q.paysCents).toBe(10 * perDollarCents(pool, crowd[bet.post - 1] * 100 + 1000, ctx.rules.pool));
    let state = goToPost(ctx, newDay(ctx, DAY), program, bet);
    expect(state.bankrollCents).toBe(10_000 - 1000);
    state = settle(ctx, state, runRace(drawn[0].input, drawn[0].raceSeed));
    expect(state.bankrollCents).toBe(9000 + q.paysCents!);
    const rec = state.records[0];
    expect(rec.ticket!.paysCents).toBe(q.paysCents);
    expect(rec.ticket!.odds).toBe(q.odds[bet.post - 1]);
    expect(rec.returnCents).toBe(q.paysCents);
    expect(rec.winnerPost).toBe(bet.post);
    // The result page's $2 price is the winner's with the bet in the pool.
    expect(rec.winnerTwoDollarCents).toBe(2 * q.perDollarCents[bet.post - 1]);
  });

  it('BK2: the quote moves as the amount changes, and each amount pays what it quoted', () => {
    const program = programOf(ctx, 1);
    for (const dollars of [2, 5, 20]) {
      const bet = { post: winners[0], dollars };
      const q = quote(ctx, program, bet);
      const s = settle(ctx, goToPost(ctx, newDay(ctx, DAY), program, bet), runRace(drawn[0].input, drawn[0].raceSeed));
      expect(s.records[0].returnCents, `$${dollars}`).toBe(q.paysCents);
      expect(s.bankrollCents).toBe(10_000 - dollars * 100 + q.paysCents!);
    }
    const small = quote(ctx, program, { post: winners[0], dollars: 2 }).perDollarCents[winners[0] - 1];
    const big = quote(ctx, program, { post: winners[0], dollars: 20 }).perDollarCents[winners[0] - 1];
    expect(big).toBeLessThanOrEqual(small);
  });

  it('BK2: a losing ticket returns nothing', () => {
    const s = play(ctx, newDay(ctx, DAY), { post: loserOf(1), dollars: 10 });
    expect(s.records[0].returnCents).toBe(0);
    expect(s.bankrollCents).toBe(9000);
  });
});

describe('BK3: a scripted day', () => {
  const choices: (Bet | null)[] = [
    { post: winners[0], dollars: 10 }, null, { post: loserOf(3), dollars: 5 }, { post: winners[3], dollars: 2 },
    null, { post: loserOf(6), dollars: 20 }, { post: winners[6], dollars: 5 }, null,
  ];
  const rec = playDay(ctx, DAY, choices, N);

  it('BK3: each race\'s bankroll is the one before, less the stake, plus the return if it won', () => {
    expect(rec.races).toHaveLength(8);
    let bank = 10_000;
    rec.races.forEach((r, i) => {
      expect(r.bankrollBeforeCents, `race ${i + 1}`).toBe(bank);
      const c = choices[i];
      const stake = c === null ? 0 : c.dollars * 100;
      const won = c !== null && c.post === r.winnerPost;
      expect(r.returnCents).toBe(won ? r.ticket!.paysCents : 0);
      expect(r.bankrollAfterCents).toBe(bank - stake + r.returnCents);
      bank = r.bankrollAfterCents;
    });
    expect(rec.summary.endCents).toBe(bank);
  });

  it('BK3: passing changes nothing and leaves no ticket', () => {
    for (const i of [1, 4, 7]) {
      expect(rec.races[i].ticket).toBeNull();
      expect(rec.races[i].returnCents).toBe(0);
      expect(rec.races[i].bankrollAfterCents).toBe(rec.races[i].bankrollBeforeCents);
    }
  });

  it('BK3: the stake leaves the bankroll at Go to the post, before the race is settled', () => {
    const s0 = newDay(ctx, DAY);
    const s1 = goToPost(ctx, s0, programOf(ctx, 1), { post: winners[0], dollars: 20 });
    expect(s1.bankrollCents).toBe(8000);
    expect(s1.open).not.toBeNull();
    const pass = goToPost(ctx, s0, programOf(ctx, 1), null);
    expect(pass.bankrollCents).toBe(10_000);
  });

  it('BK3: the record\'s figures come from the real race on its race seed', () => {
    rec.races.forEach((r, i) => {
      expect(r.raceSeed).toBe(drawn[i].raceSeed);
      expect(r.result.seed).toBe(drawn[i].raceSeed);
      expect(r.winnerPost).toBe(winners[i]);
    });
  });
});

describe('BK4: an abandoned race settles exactly as if watched', () => {
  it('BK4: settling with the result rebuilt from its own data gives the same state', () => {
    const r = drawn[0];
    const open = goToPost(ctx, newDay(ctx, DAY), programOf(ctx, 1), { post: winners[0], dollars: 5 });
    const watched = settle(ctx, open, runRace(r.input, r.raceSeed));
    const abandoned = settle(ctx, open, JSON.parse(JSON.stringify(runRace(r.input, r.raceSeed))));
    expect(abandoned).toEqual(watched);
  });

  it('BK4: a result for another seed is refused', () => {
    const open = goToPost(ctx, newDay(ctx, DAY), programOf(ctx, 1), null);
    expect(() => settle(ctx, open, runRace(drawn[1].input, drawn[1].raceSeed))).toThrow();
  });
});

describe('BK5: the day ends after the last race, or when the bankroll is below $2 at the start of a race', () => {
  it('BK5: a day of passes ends after race 8 with the bankroll unchanged', () => {
    const rec = playDay(ctx, DAY, Array(8).fill(null), N);
    expect(rec.races).toHaveLength(8);
    expect(rec.summary.endedBy).toBe('lastRace');
    expect(rec.summary.endCents).toBe(10_000);
    expect(rec.summary.changeCents).toBe(0);
  });

  it('BK5: the day goes on after race 7 and no race can be run after race 8', () => {
    let s = newDay(ctx, DAY);
    for (let i = 0; i < 7; i++) s = play(ctx, s, null);
    expect(s.ended).toBeNull();
    s = play(ctx, s, null);
    expect(s.ended).toBe('lastRace');
    expect(() => goToPost(ctx, s, programOf(ctx, 8), null)).toThrow();
    expect(daySummary(ctx, s).racesRun).toBe(8);
  });

  // A starting bankroll of $3.90: one lost $2 bet leaves $1.90, below the minimum.
  const poor = (startCents: number): DayContext => ({ ...ctx, rules: { ...ctx.rules, startCents } });

  it('BK5: a bankroll of $1.90 after a race ends the day there', () => {
    const c = poor(390);
    let s = newDay(c, DAY);
    expect(s.ended).toBeNull();
    s = play(c, s, { post: loserOf(1), dollars: 2 });
    expect(s.bankrollCents).toBe(190);
    expect(s.ended).toBe('broke');
    expect(() => goToPost(c, s, programOf(c, 2), null)).toThrow();
    const sum = daySummary(c, s);
    expect(sum.endedBy).toBe('broke');
    expect(sum.racesRun).toBe(1);
  });

  it('BK5: a bankroll of exactly $2.00 after a race goes on', () => {
    const c = poor(400);
    const s = play(c, newDay(c, DAY), { post: loserOf(1), dollars: 2 });
    expect(s.bankrollCents).toBe(200);
    expect(s.ended).toBeNull();
  });

  it('BK5: playDay stops at a broke day and ignores the rest of the choices', () => {
    const c = poor(390);
    const rec = playDay(c, DAY, [{ post: loserOf(1), dollars: 2 }, { post: 1, dollars: 2 }, null, null, null, null, null, null], N);
    expect(rec.races).toHaveLength(1);
    expect(rec.summary.endedBy).toBe('broke');
    expect(rec.summary.endCents).toBe(190);
  });

  it('BK5: going broke in race 2 with the full cap', () => {
    // A whole-bankroll cap so two bets can empty $100: $50 then $50.
    const c: DayContext = { ...ctx, rules: { ...ctx.rules, capBasisPoints: 10_000 } };
    const rec = playDay(c, DAY, [{ post: loserOf(1), dollars: 50 }, { post: loserOf(2), dollars: 50 }, null, null, null, null, null, null], N);
    expect(rec.races.map((r) => r.bankrollAfterCents)).toEqual([5000, 0]);
    expect(rec.summary.endedBy).toBe('broke');
  });

  it('BK5: a day that starts below the minimum is over before race 1', () => {
    const s = newDay(poor(150), DAY);
    expect(s.ended).toBe('broke');
  });
});

describe('BK1: a bet that is not offered is refused at the post', () => {
  const program = () => programOf(ctx, 1);

  it.each([50, 100, 3, 1, 0])('BK1: $%i with a $100 bankroll is refused', (dollars) => {
    expect(() => goToPost(ctx, newDay(ctx, DAY), program(), { post: 1, dollars })).toThrow();
  });

  it.each([2, 5, 10, 20])('BK1: $%i with a $100 bankroll is accepted', (dollars) => {
    expect(goToPost(ctx, newDay(ctx, DAY), program(), { post: 1, dollars }).bankrollCents).toBe(10_000 - dollars * 100);
  });

  it('BK1: a post outside 1 to 8 is refused', () => {
    for (const post of [0, 9, 1.5]) expect(() => goToPost(ctx, newDay(ctx, DAY), program(), { post, dollars: 2 })).toThrow();
  });

  it('BK1: the wrong race, or a second Go to the post before settling, is refused', () => {
    const s = newDay(ctx, DAY);
    expect(() => goToPost(ctx, s, programOf(ctx, 2), null)).toThrow();
    const open = goToPost(ctx, s, program(), null);
    expect(() => goToPost(ctx, open, program(), null)).toThrow();
  });
});

describe('DT4: determinism', () => {
  const choices: (Bet | null)[] = [{ post: 3, dollars: 5 }, null, { post: winners[2], dollars: 10 }, null, { post: 1, dollars: 2 }, null, null, { post: 8, dollars: 2 }];

  it('DT4: the same day seed and bets give a byte-identical day record', () => {
    const a = playDay(ctx, DAY, choices, N);
    const b = playDay(realCtx(), DAY, choices.map((c) => (c === null ? null : { ...c })), N);
    expect(b).toEqual(a);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('DT4: the record holds fields, race seeds, estimates, crowd dollars, odds, results, payouts and bankrolls', () => {
    const a = playDay(ctx, DAY, choices, N);
    for (const r of a.races) {
      expect(r.horseIds).toHaveLength(8);
      expect(r.estimate.runs).toBe(N);
      expect(r.crowdDollars.reduce((x, y) => x + y, 0)).toBe(25_000);
      expect(r.odds).toHaveLength(8);
      expect(r.result.finish).toHaveLength(8);
      expect(typeof r.bankrollAfterCents).toBe('number');
    }
  });

  it('DT4: a different day seed gives a different record', () => {
    expect(JSON.stringify(playDay(ctx, DAY + 1, choices, N))).not.toBe(JSON.stringify(playDay(ctx, DAY, choices, N)));
  });
});

describe('End of day: the summary agrees with the race records', () => {
  it('End of day: bets made, winners hit, best price cashed and the change', () => {
    const choices: (Bet | null)[] = [
      { post: winners[0], dollars: 2 }, { post: loserOf(2), dollars: 5 }, null, { post: winners[3], dollars: 2 },
      null, { post: winners[5], dollars: 5 }, null, null,
    ];
    const rec = playDay(ctx, DAY, choices, N);
    const s = rec.summary;
    expect(s.daySeed).toBe(DAY);
    expect(s.startCents).toBe(10_000);
    expect(s.racesRun).toBe(8);
    expect(s.betsMade).toBe(4);
    expect(s.winnersHit).toBe(3);
    const last = rec.races[rec.races.length - 1].bankrollAfterCents;
    expect(s.endCents).toBe(last);
    expect(s.changeCents).toBe(last - 10_000);
    // Best price cashed: the longest per-dollar price among the winning tickets.
    const won = rec.races.filter((r) => r.returnCents > 0).map((r) => r.ticket!);
    const best = won.reduce((b, t) => (t.paysCents / t.dollars > b.paysCents / b.dollars ? t : b));
    expect(s.bestPriceHit).toBe(best.odds);
  });

  it('End of day: with no winning ticket there is no best price', () => {
    const rec = playDay(ctx, DAY, [{ post: loserOf(1), dollars: 2 }, null, null, null, null, null, null, null], N);
    expect(rec.summary.betsMade).toBe(1);
    expect(rec.summary.winnersHit).toBe(0);
    expect(rec.summary.bestPriceHit).toBeNull();
    expect(rec.summary.changeCents).toBe(-200);
  });

  it('End of day: the summary can not be read while the day goes on', () => {
    expect(() => daySummary(ctx, newDay(ctx, DAY))).toThrow();
  });
});

describe('DT5: nothing old moves', () => {
  it('DT5: SIM_VERSION stays 3', () => {
    expect(SIM_VERSION).toBe(3);
  });
});

describe('FD7 (amended): a race, its estimate and its prices belong to one day', () => {
  const OTHER = DAY + 1;
  const other = drawnDay(ctx, OTHER);
  const job = (daySeed: number, race: number, input = drawn[race - 1].input) => stepEstimate(startEstimate(daySeed, race, 3, 8), input, 3);

  it('FD7: going to the post with a program drawn for another day seed is refused, with a bet or a pass', () => {
    const foreign = programFor(ctx, other[0], job(OTHER, 1, other[0].input));
    expect(() => goToPost(ctx, newDay(ctx, DAY), foreign, null)).toThrow();
    expect(() => goToPost(ctx, newDay(ctx, DAY), foreign, { post: 1, dollars: 2 })).toThrow();
  });

  it('FD7: programFor refuses an estimate job made for another day', () => {
    expect(() => programFor(ctx, drawn[0], job(OTHER, 1))).toThrow();
  });

  it('FD7: programFor refuses an estimate job made for another race of the same day', () => {
    expect(() => programFor(ctx, drawn[0], job(DAY, 2))).toThrow();
  });

  it('FD7: a state from day A with a program from day A, built from its job, goes to the post and settles', () => {
    const j = job(DAY, 1);
    const program = programFor(ctx, drawn[0], j);
    expect(program.estimate).toEqual(estimateOf(j));
    const s = goToPost(ctx, newDay(ctx, DAY), program, { post: winners[0], dollars: 2 });
    const done = settle(ctx, s, runRace(drawn[0].input, drawn[0].raceSeed));
    expect(done.records[0].returnCents).toBe(quote(ctx, program, { post: winners[0], dollars: 2 }).paysCents);
  });
});

describe('DT4 (amended): the run count is checked', () => {
  it.each([0, 2.5, -1])('DT4: playDay refuses runs of %s', (runs) => {
    expect(() => playDay(ctx, DAY, Array(8).fill(null), runs)).toThrow();
  });

  it.each([0, 2.5, -1])('DT4: startEstimate refuses runs of %s', (runs) => {
    expect(() => startEstimate(DAY, 1, runs, 8)).toThrow();
  });
});
