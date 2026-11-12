import { describe, expect, it } from 'vitest';
import { integerScale } from './scale';

// Expected values come from the table in docs/specs/m0-setup.md (M0.2).
describe('integerScale table', () => {
  const rows: Array<[string, number, number, number]> = [
    ['exact fit at 1', 256, 240, 1],
    ['exact fit at 3', 768, 720, 3],
    ['width is the limit', 1024, 2000, 4],
    ['height is the limit', 2000, 480, 2],
    ['one pixel short of 3', 767, 720, 2],
    ['smaller than the frame', 200, 100, 1],
    ['smaller in one direction only', 1920, 200, 1],
    ['non-integer sizes', 767.9, 720.5, 2],
    ['non-integer, just over a step', 512.25, 480.75, 2],
    ['zero by zero', 0, 0, 1],
    ['zero width', 0, 720, 1],
    ['negative width', -100, 720, 1],
    ['common laptop', 1440, 900, 3],
    ['very large window', 7680, 4320, 18],
    ['huge but finite', 1e9, 1e9, 3906250],
  ];

  it.each(rows)('%s: %d x %d gives %d', (_name, w, h, expected) => {
    expect(integerScale(w, h)).toBe(expected);
  });

  it('huge but finite result is a finite whole number', () => {
    const s = integerScale(1e9, 1e9);
    expect(Number.isFinite(s)).toBe(true);
    expect(Number.isInteger(s)).toBe(true);
  });

  it('has no upper cap', () => {
    expect(integerScale(1e12, 1e12)).toBeGreaterThan(3906250);
  });
});

describe('integerScale non-finite and degenerate input', () => {
  const bad = [NaN, Infinity, -Infinity];

  it.each(bad)('%s as width gives 1', (v) => {
    expect(integerScale(v, 720)).toBe(1);
  });

  it.each(bad)('%s as height gives 1', (v) => {
    expect(integerScale(768, v)).toBe(1);
  });

  it.each(bad)('%s in both inputs gives 1', (v) => {
    expect(integerScale(v, v)).toBe(1);
  });

  it('zero height gives 1', () => {
    expect(integerScale(1024, 0)).toBe(1);
  });

  it('negative height gives 1', () => {
    expect(integerScale(1024, -100)).toBe(1);
  });

  it('both negative gives 1', () => {
    expect(integerScale(-1, -1)).toBe(1);
  });
});

describe('integerScale general properties', () => {
  const samples: Array<[number, number]> = [
    [256, 240], [255.99, 239.99], [0.5, 0.5], [333.3, 999.9], [1440, 900],
    [768, 720], [767.9999, 720], [1e6, 1e6], [5e-324, 5e-324], [NaN, 5],
    [-0, -0], [Number.MAX_VALUE, Number.MAX_VALUE], [Infinity, 240],
  ];

  it.each(samples)('%d x %d is a finite whole number of at least 1', (w, h) => {
    const s = integerScale(w, h);
    expect(Number.isFinite(s)).toBe(true);
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(1);
  });

  it('same input gives the same output', () => {
    for (const [w, h] of samples) {
      expect(integerScale(w, h)).toBe(integerScale(w, h));
    }
  });

  it('is not affected by earlier calls', () => {
    const first = integerScale(1024, 2000);
    integerScale(7680, 4320);
    integerScale(NaN, NaN);
    expect(integerScale(1024, 2000)).toBe(first);
  });

  it('the scaled frame fits the window whenever the window is at least the frame', () => {
    for (const [w, h] of [[256, 240], [500, 500], [1440, 900], [7680, 4320], [767.9, 720.5]]) {
      const s = integerScale(w, h);
      expect(256 * s).toBeLessThanOrEqual(w);
      expect(240 * s).toBeLessThanOrEqual(h);
      // and s + 1 would not fit
      expect(256 * (s + 1) <= w && 240 * (s + 1) <= h).toBe(false);
    }
  });

  it('does not touch window or the DOM', () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined');
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
    expect(integerScale(1440, 900)).toBe(3);
  });
});

describe('B1: Node environment, no Phaser loaded', () => {
  it('runs in Node with no browser globals', () => {
    const g = globalThis as { process?: { versions?: { node?: string } }; window?: unknown };
    expect(g.process?.versions?.node).toBeTruthy();
    expect(g.window).toBeUndefined();
  });
});
