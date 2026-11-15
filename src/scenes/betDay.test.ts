import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawnDay, newDay } from '../bet/day';
import { startEstimate, stepEstimate } from '../bet/estimate';
import { nextDaySeed } from '../bet/streams';
import { betting, ctx, DAY_SEED, drawnOf } from '../render/betKit';
import { shippedRaceDay } from '../render/testkit';
import { betErrorLines, nextDay, programIfReady, raceDayFor, startDay } from './betDay';
import type { Estimates } from './estimates';

// The day's start and its next day (docs/specs/betting-screens.md section 2, BE3's start state, and
// betting-simple.md: every day starts at $100, a day seed names a day). No Phaser: the estimates
// object is a stub with the two methods the day uses.

const stub = (job: ReturnType<typeof startEstimate> | null = null): Estimates => ({ get: () => job, request: () => undefined, failure: () => null }) as unknown as Estimates;

afterEach(() => vi.restoreAllMocks());

describe('startDay', () => {
  const { bet, day } = startDay(ctx, betting, shippedRaceDay, stub(), DAY_SEED);

  it('starts at $100.00 on race 1 with nothing open and no records, on the given seed', () => {
    expect(day.daySeed).toBe(DAY_SEED);
    expect(day.bankrollCents).toBe(10000);
    expect(day.nextRace).toBe(1);
    expect(day.open).toBeNull();
    expect(day.records).toEqual([]);
    expect(day.ended).toBeNull();
  });

  it('draws the eight fields from the day seed alone', () => {
    expect(bet.drawn).toHaveLength(8);
    expect(bet.drawn.map((d) => d.horseIds)).toEqual(drawnOf().map((d) => d.horseIds));
    expect(bet.drawn.map((d) => d.race)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(startDay(ctx, betting, shippedRaceDay, stub(), DAY_SEED + 1).bet.drawn.map((d) => d.horseIds)).not.toEqual(bet.drawn.map((d) => d.horseIds));
  });

  it('keeps the context, data and estimates it was given', () => {
    const e = stub();
    const s = startDay(ctx, betting, shippedRaceDay, e, DAY_SEED);
    expect(s.bet.ctx).toBe(ctx);
    expect(s.bet.betting).toBe(betting);
    expect(s.bet.rd).toBe(shippedRaceDay);
    expect(s.bet.estimates).toBe(e);
  });
});

describe('nextDay', () => {
  it('starts the next day seed with the starting bankroll on race 1, whatever the last day ended with', () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { bet, day } = startDay(ctx, betting, shippedRaceDay, stub(), DAY_SEED);
    const spent = { ...day, bankrollCents: 4321, nextRace: 9, records: [{ race: 1 } as never], ended: 'lastRace' as const };
    const next = nextDay(bet, spent);
    expect(next.day.daySeed).toBe(nextDaySeed(DAY_SEED));
    expect(next.day.daySeed).not.toBe(DAY_SEED);
    expect(next.day.bankrollCents).toBe(10000);
    expect(next.day.nextRace).toBe(1);
    expect(next.day.records).toEqual([]);
    expect(next.day.open).toBeNull();
    expect(next.day.ended).toBeNull();
    expect(next.day).toEqual(newDay(ctx, nextDaySeed(DAY_SEED)));
    expect(next.bet.drawn.map((d) => d.horseIds)).toEqual(drawnDay(ctx, nextDaySeed(DAY_SEED)).map((d) => d.horseIds));
    expect(next.bet.estimates).toBe(bet.estimates);
  });

  it('is deterministic: the same day gives the same next day', () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { bet, day } = startDay(ctx, betting, shippedRaceDay, stub(), DAY_SEED);
    expect(nextDay(bet, day).day.daySeed).toBe(nextDay(bet, day).day.daySeed);
  });

  it('prints the new seed so the day can be replayed', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { bet, day } = startDay(ctx, betting, shippedRaceDay, stub(), DAY_SEED);
    nextDay(bet, day);
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0][0])).toContain(String(nextDaySeed(DAY_SEED)));
  });
});

describe('the program\'s data for a race', () => {
  it('no finished estimate means no program (the odds are pending)', () => {
    const { bet } = startDay(ctx, betting, shippedRaceDay, stub(null), DAY_SEED);
    expect(programIfReady(bet, bet.drawn[0])).toBeNull();
  });

  it('a finished estimate makes the program for that race', () => {
    const drawn = drawnOf()[0];
    let job = startEstimate(DAY_SEED, 1, 6, 8);
    job = stepEstimate(job, drawn.input, 6);
    const { bet } = startDay(ctx, betting, shippedRaceDay, stub(job), DAY_SEED);
    const p = programIfReady(bet, bet.drawn[0])!;
    expect(p.drawn.race).toBe(1);
    expect(p.crowdDollars).toHaveLength(8);
  });

  it('raceDayFor gives a look for every horse in that field', () => {
    const { bet } = startDay(ctx, betting, shippedRaceDay, stub(), DAY_SEED);
    for (const drawn of bet.drawn) {
      const look = raceDayFor(bet, drawn).cardLook;
      for (const id of drawn.horseIds) expect(look[id]?.blurb?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('betErrorLines names the day seed, the race and the message', () => {
    const lines = betErrorLines(777, 3, new Error('the crowd fell over'));
    const text = lines.join('\n');
    expect(text).toContain('Day seed 777, race 3');
    expect(text).toContain('the crowd fell over');
  });
});
