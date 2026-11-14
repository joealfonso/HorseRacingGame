import { afterEach, describe, expect, it, vi } from 'vitest';
import { startEstimate, stepEstimate } from '../bet/estimate';
import { loadHub } from '../data/hubLoad';
import { betting, ctx, DAY_SEED, drawnOf } from '../render/betKit';
import { shippedRaceDay } from '../render/testkit';
import { betRaceData, nextDay, passDay, startDay } from './betDay';
import type { ArtInfo } from './art';
import type { Estimates } from './estimates';

// The day's pieces the track adds (docs/specs/track-hub.md sections 2 and 4): the hub data and
// the look counts carried in the day, reset on New day, and the one pass path the program's
// Pass and the track's rail share. No Phaser: the estimates object is a stub.

const stub = (job: ReturnType<typeof startEstimate> | null = null): Estimates => ({ get: () => job, request: () => undefined, failure: () => null }) as unknown as Estimates;
const art = {} as ArtInfo;

afterEach(() => vi.restoreAllMocks());

describe('the day carries the track', () => {
  it('a new day has the hub data and no looks', () => {
    const hub = loadHub();
    const { bet } = startDay(ctx, betting, shippedRaceDay, stub(), DAY_SEED, hub);
    expect(bet.hub).toBe(hub);
    expect(bet.looks).toEqual({});
  });

  it('New day resets the looks and keeps the hub data', () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { bet, day } = startDay(ctx, betting, shippedRaceDay, stub(), DAY_SEED);
    const looked = { ...bet, looks: { fans: 3 } };
    const next = nextDay(looked, day);
    expect(next.bet.looks).toEqual({});
    expect(next.bet.hub).toBe(bet.hub);
  });
});

describe('passDay: the post with no bet', () => {
  it('with the odds in, goes to the post with no ticket and no money moved', () => {
    const drawn = drawnOf()[0];
    const job = stepEstimate(startEstimate(DAY_SEED, 1, 6, 8), drawn.input, 6);
    const { bet, day } = startDay(ctx, betting, shippedRaceDay, stub(job), DAY_SEED);
    const after = passDay(bet, day, bet.drawn[0]);
    expect(after.open?.ticket).toBeNull();
    expect(after.bankrollCents).toBe(day.bankrollCents);
  });

  it('while pending, hands the day on unchanged (the race goes to the post when the odds arrive)', () => {
    const { bet, day } = startDay(ctx, betting, shippedRaceDay, stub(null), DAY_SEED);
    expect(passDay(bet, day, bet.drawn[0])).toBe(day);
  });
});

describe('betRaceData', () => {
  it('runs race r on its drawn field and seed, with the day and the keys held', () => {
    const { bet, day } = startDay(ctx, betting, shippedRaceDay, stub(null), DAY_SEED);
    const d = betRaceData(bet, day, bet.drawn[2], art, ['Enter']);
    expect(d.game).toBe(bet.drawn[2].input);
    expect(d.ticket).toEqual({ raceNumber: 2, seed: bet.drawn[2].raceSeed, post: 0, orders: { early: 'default', move: 'default', path: 'default' } });
    expect(d.held).toEqual(['Enter']);
    expect(d.bet).toEqual({ day: bet, state: day, drawn: bet.drawn[2] });
  });
});
