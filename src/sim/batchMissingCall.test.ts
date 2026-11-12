import { describe, expect, it, vi } from 'vitest';
import { summarizeCard } from './batch';
import { shipped } from './testkit';

// M1.6: a race result with no call at one furlong to go is an error, not a silent zero. Today's sim always
// makes that call, so runRace is wrapped here to drop it. The mock is in its own file so no other test sees it.

const control = vi.hoisted(() => ({ dropCallForSeed: null as number | null }));

vi.mock('./runRace', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./runRace')>();
  return {
    ...actual,
    runRace: (data: Parameters<typeof actual.runRace>[0], seed: number) => {
      const r = actual.runRace(data, seed);
      if (seed !== control.dropCallForSeed) return r;
      return { ...r, calls: r.calls.filter((c) => c.furlongsToGo !== 1) };
    },
  };
});

describe('M1.6 summarizeCard with a result that has no call at one furlong to go', () => {
  const data = shipped();

  it('control: with the call present, the same seeds summarize fine', () => {
    control.dropCallForSeed = null;
    expect(summarizeCard(data, 4242, 5).races).toBe(5);
  });

  it('throws, and the message says what is missing and which seed', () => {
    control.dropCallForSeed = 4244;
    expect(() => summarizeCard(data, 4242, 5)).toThrow(/furlong/i);
    expect(() => summarizeCard(data, 4242, 5)).toThrow(/4244/);
    try {
      summarizeCard(data, 4242, 5);
    } catch (e) {
      expect((e as Error).message).not.toContain('4242');
      expect((e as Error).message).not.toContain('4243');
    }
    control.dropCallForSeed = null;
  });
});
