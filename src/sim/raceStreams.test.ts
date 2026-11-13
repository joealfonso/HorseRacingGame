import { describe, expect, it } from 'vitest';
import { createRaceStreams } from './raceStreams';
import type { StreamName } from './streamNames';

// STREAM_NAMES is empty until M1.3, so StreamName is `never` today. These
// test-only names are cast to get past that. They are not real stream names.
const A = 'testA' as StreamName;
const B = 'testB' as StreamName;
const UNUSED = 'testUnusedByAnySystem' as StreamName;
const SEED = 2024;

function drawN(s: { float(): number }, n: number): number[] {
  return Array.from({ length: n }, () => s.float());
}

describe('registry', () => {
  it('keeps the seed and rejects a bad seed', () => {
    expect(createRaceStreams(0).seed).toBe(0);
    expect(createRaceStreams(4294967295).seed).toBe(4294967295);
    for (const bad of [-1, 1.5, NaN, '5', 4294967296]) {
      expect(() => createRaceStreams(bad as number)).toThrow(/seed/i);
    }
  });

  it('hands back the same stream object for the same name and sub-key', () => {
    const r = createRaceStreams(SEED);
    expect(r.get(A)).toBe(r.get(A));
    expect(r.get(A, 'x')).toBe(r.get(A, 'x'));
    expect(r.get(A, 'x')).not.toBe(r.get(A, 'y'));
    expect(r.get(A, 'x')).not.toBe(r.get(A));
    // so a repeat request continues the sequence instead of replaying it
    const first = r.get(A).float();
    expect(r.get(A).float()).not.toBe(first);
  });
});

describe('R4: independence', () => {
  const fresh = drawN(createRaceStreams(SEED).get(A), 100);

  it('draws on other streams first do not change stream A', () => {
    const r = createRaceStreams(SEED);
    const b = r.get(B);
    const u = r.get(UNUSED);
    drawN(b, 1000);
    drawN(u, 1000);
    expect(drawN(r.get(A), 100)).toEqual(fresh);
  });

  it('reverse creation order gives the same lists', () => {
    const r = createRaceStreams(SEED);
    const u = r.get(UNUSED);
    const b = r.get(B);
    drawN(u, 1000);
    drawN(b, 1000);
    expect(drawN(r.get(A), 100)).toEqual(fresh);

    const forward = createRaceStreams(SEED);
    const fb = drawN(forward.get(B), 100);
    const reverse = createRaceStreams(SEED);
    reverse.get(UNUSED);
    expect(drawN(reverse.get(B), 100)).toEqual(fb);
  });

  it('a different seed gives a different list', () => {
    expect(drawN(createRaceStreams(SEED + 1).get(A), 100)).not.toEqual(fresh);
  });
});

describe('R5: sub-keys', () => {
  const horses = ['1', '2', '3', '4', '5', '6', '7', '8'];
  const without = (() => {
    const r = createRaceStreams(SEED);
    return horses.map((h) => drawN(r.get(A, h), 50));
  })();

  it('horses 1 to 8 give the same sequences with a ninth horse present', () => {
    const r = createRaceStreams(SEED);
    const nine = r.get(A, '9');
    drawN(nine, 500);
    expect(horses.map((h) => drawN(r.get(A, h), 50))).toEqual(without);
  });

  it('the ninth horse created first, or in reverse order, changes nothing', () => {
    const r = createRaceStreams(SEED);
    r.get(A, '9');
    const reversed = [...horses].reverse().map((h) => drawN(r.get(A, h), 50)).reverse();
    expect(reversed).toEqual(without);
  });

  it('the eight horses do not share a sequence', () => {
    expect(new Set(without.map((l) => JSON.stringify(l))).size).toBe(8);
  });
});
