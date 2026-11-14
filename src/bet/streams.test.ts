import { describe, expect, it } from 'vitest';
import { createStream } from '../sim/rng';
import { STREAM_NAMES } from '../sim/streamNames';
import { drawnDay, newDay } from './day';
import { startEstimate } from './estimate';
import { BET_STREAM_NAMES, estimateSeedsOf, nextDaySeed, raceSeedOf } from './streams';
import { realCtx } from './testkit';

// DT1, DT2 and OD2 (docs/specs/betting-simple.md, "The estimate" and B1).

const MAX = 4294967295;
const ctx = realCtx();

describe('DT1: day seeds', () => {
  it('DT1: new day uses day seed + 1, wrapping after 4294967295', () => {
    expect(nextDaySeed(0)).toBe(1);
    expect(nextDaySeed(41)).toBe(42);
    expect(nextDaySeed(MAX - 1)).toBe(MAX);
    expect(nextDaySeed(MAX)).toBe(0);
  });

  it.each([-1, 1.5, MAX + 1, NaN])('DT1: %s is not a day seed', (bad) => {
    expect(() => nextDaySeed(bad)).toThrow();
    expect(() => newDay(ctx, bad)).toThrow();
    expect(() => drawnDay(ctx, bad)).toThrow();
  });

  it('DT1: 0 and 4294967295 are day seeds', () => {
    for (const s of [0, MAX]) {
      expect(newDay(ctx, s).daySeed).toBe(s);
      expect(drawnDay(ctx, s)).toHaveLength(8);
    }
  });

  it('DT1: a new day starts at the starting bankroll of $100 on race 1', () => {
    const d = newDay(ctx, 5);
    expect(d.bankrollCents).toBe(10_000);
    expect(d.nextRace).toBe(1);
    expect(d.records).toEqual([]);
    expect(d.ended).toBeNull();
  });
});

describe('DT2: streams', () => {
  it('DT2: the betting stream names are the spec\'s four, in one list, unique', () => {
    expect([...BET_STREAM_NAMES].sort()).toEqual(['crowd', 'estimateSeeds', 'fieldDraw', 'raceSeed']);
    expect(new Set(BET_STREAM_NAMES).size).toBe(BET_STREAM_NAMES.length);
  });

  it('DT2: no betting stream name equals a sim stream name', () => {
    for (const n of BET_STREAM_NAMES) expect((STREAM_NAMES as readonly string[]).includes(n), n).toBe(false);
  });

  it('DT2: the race seed comes from the raceSeed stream, day seed and race number as sub-key', () => {
    for (const day of [0, 1, 99, 20261113, MAX]) {
      for (let race = 1; race <= 8; race++) {
        expect(raceSeedOf(day, race)).toBe(createStream(day, 'raceSeed', String(race)).int(0, MAX));
      }
    }
  });

  it('DT2: changing the race number or the day seed changes the race seed and the estimate seeds', () => {
    const seen = new Set<number>();
    const firsts = new Set<number>();
    for (const day of [7, 8]) {
      for (let race = 1; race <= 8; race++) {
        seen.add(raceSeedOf(day, race));
        firsts.add(estimateSeedsOf(day, race, 1)[0]);
      }
    }
    expect(seen.size).toBe(16);
    expect(firsts.size).toBe(16);
  });

  it('DT2: known answers for day seed 20261113: race 1\'s field, race seed and first 5 estimate seeds', () => {
    const r1 = drawnDay(ctx, 20261113)[0];
    expect(r1.horseIds).toEqual(KNOWN.field);
    expect(r1.raceSeed).toBe(KNOWN.raceSeed);
    expect(estimateSeedsOf(20261113, 1, 5)).toEqual(KNOWN.estimateSeeds);
    expect(startEstimate(20261113, 1, 5, 8).seeds).toEqual(KNOWN.estimateSeeds);
  });
});

describe('OD2: a race\'s seed is never one of its estimate seeds, and they are N distinct values', () => {
  it('OD2: over 1,000 day seeds, every race, at the real N', () => {
    const N = ctx.rules.runsPerRace;
    expect(N).toBe(1000);
    let checked = 0;
    for (let i = 0; i < 1000; i++) {
      const day = (i * 4_294_967) >>> 0;
      for (let race = 1; race <= 8; race++) {
        const seeds = startEstimate(day, race, N, 8).seeds;
        const rs = raceSeedOf(day, race);
        expect(seeds.length).toBe(N);
        const set = new Set(seeds);
        if (set.size !== N || set.has(rs)) throw new Error(`day ${day} race ${race}: ${set.size} distinct, race seed in: ${set.has(rs)}`);
        for (const s of seeds) if (!Number.isInteger(s) || s < 0 || s > MAX) throw new Error(`bad seed ${s}`);
        checked++;
      }
    }
    expect(checked).toBe(8000);
  });

  it('OD2: the race seed is the one drawnDay gives the real race', () => {
    const day = drawnDay(ctx, 31337);
    for (const r of day) expect(r.raceSeed).toBe(raceSeedOf(31337, r.race));
  });
});

// Pinned from the first run of the shipped code and stable. A change here moves every old day.
const KNOWN = {
  field: ['s13', 's19', 's12', 's14', 's30', 's07', 's25', 's15'],
  raceSeed: 3760577210,
  estimateSeeds: [1666121495, 3189280260, 806607540, 1824220913, 4168456759],
};
