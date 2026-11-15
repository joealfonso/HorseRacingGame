import { describe, expect, it } from 'vitest';
import bettingJson from './betting.json';
import hubJson from './hub.json';
import paletteJson from './palette.json';
import { loadHub, validateHub } from './hubLoad';
import { DataError } from './validate';

// Written from docs/specs/track-hub.md TH1 and TH10 (and section 4's hit/focus table), not
// from the loader's code. The expected boxes are the spec's table.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;
const FILE = 'src/data/hub.json';

const load = (edit: (h: Raw) => void = () => {}) => {
  const hub = structuredClone(hubJson) as Raw;
  edit(hub);
  return validateHub({ hub, bannedWords: bettingJson.copy.bannedWords, colors: paletteJson.colors.map((c) => c.name), fieldSize: 8 });
};
const failure = (edit: (h: Raw) => void): DataError => {
  try { load(edit); } catch (e) { if (e instanceof DataError) return e; throw e; }
  throw new Error('expected the load to fail');
};
const idx = (id: string) => hubJson.targets.value.findIndex((t) => t.id === id);
const tgt = (h: Raw, id: string) => h.targets.value.find((t: Raw) => t.id === id);

type B = [number, number, number, number];
// Spec section 4, "Doors and lookables": hit box and focus corners box, as x0, y0, x1, y1.
const SPEC: Record<string, { hit: B; focus: B }> = {
  windows: { hit: [0, 96, 111, 175], focus: [4, 98, 107, 145] },
  rail: { hit: [160, 90, 255, 139], focus: [172, 104, 219, 135] },
  regular: { hit: [0, 24, 111, 95], focus: [52, 44, 75, 75] },
  board: { hit: [124, 32, 251, 87], focus: [124, 32, 251, 71] },
  fans: { hit: [112, 90, 159, 139], focus: [120, 104, 159, 135] },
  bugler: { hit: [112, 140, 159, 175], focus: [124, 144, 147, 173] },
  snackCart: { hit: [160, 140, 255, 175], focus: [180, 140, 235, 171] },
};
const asArr = (b: { x0: number; y0: number; x1: number; y1: number }): B => [b.x0, b.y0, b.x1, b.y1];

describe('the shipped hub data matches the spec table (TH1, section 4)', () => {
  it('loads', () => {
    expect(() => loadHub()).not.toThrow();
  });

  it('has the seven targets, each with the spec\'s hit box and focus box', () => {
    const hub = loadHub();
    expect(hub.targets.value.map((t) => t.id).sort()).toEqual(Object.keys(SPEC).sort());
    for (const t of hub.targets.value) {
      expect(asArr(t.hit), `${t.id} hit`).toEqual(SPEC[t.id].hit);
      expect(asArr(t.focus), `${t.id} focus`).toEqual(SPEC[t.id].focus);
    }
  });

  it('doors are Windows and the rail; the rest are lookables', () => {
    const kinds = Object.fromEntries(loadHub().targets.value.map((t) => [t.id, t.kind]));
    expect(kinds).toEqual({ windows: 'door', rail: 'door', regular: 'lookable', board: 'lookable', fans: 'lookable', bugler: 'lookable', snackCart: 'lookable' });
  });

  it('the shipped boxes themselves obey TH1', () => {
    const hub = loadHub();
    const ts = hub.targets.value;
    for (const t of ts) {
      expect(t.hit.x0).toBeGreaterThanOrEqual(0);
      expect(t.hit.y0).toBeGreaterThanOrEqual(0);
      expect(t.hit.x1).toBeLessThanOrEqual(255);
      expect(t.hit.y1).toBeLessThanOrEqual(239);
      expect(t.hit.x1 - t.hit.x0 + 1).toBeGreaterThanOrEqual(16);
      expect(t.hit.y1 - t.hit.y0 + 1).toBeGreaterThanOrEqual(16);
      expect(t.focus.y0).toBeGreaterThanOrEqual(16);
      expect(t.focus.y1).toBeLessThanOrEqual(175);
    }
    for (const a of ts) for (const b of ts) {
      if (a.id >= b.id) continue;
      const apart = a.hit.x1 < b.hit.x0 || b.hit.x1 < a.hit.x0 || a.hit.y1 < b.hit.y0 || b.hit.y1 < a.hit.y0;
      expect(apart, `${a.id} and ${b.id} overlap`).toBe(true);
    }
  });
});

describe('TH1: a bad box fails at load with the file and the field', () => {
  it('overlapping hit boxes', () => {
    const err = failure((h) => { tgt(h, 'fans').hit.x1 = 165; });
    expect(err.file).toBe(FILE);
    expect(err.message).toContain(FILE);
    expect(err.message).toMatch(/targets\.value\[(\d+)\]/);
    const named = [...err.message.matchAll(/targets\.value\[(\d+)\]/g)].map((m) => Number(m[1]));
    expect(named.some((i) => i === idx('fans') || i === idx('rail'))).toBe(true);
  });

  it('overlap by one pixel row also fails (inclusive boxes)', () => {
    const err = failure((h) => { tgt(h, 'bugler').hit.y0 = 139; }); // fans ends at y139
    expect(err.file).toBe(FILE);
  });

  it('boxes that only touch edge to edge are fine', () => {
    expect(() => load()).not.toThrow(); // fans x159 | rail x160 in the shipped file
  });

  it.each([
    ['x1 past 255', 'x1', 256],
    ['y1 past 239', 'y1', 240],
  ])('a hit box outside the screen (%s)', (_n, field, value) => {
    const err = failure((h) => { tgt(h, 'snackCart').hit[field] = value; });
    expect(err.file).toBe(FILE);
    expect(err.message).toContain(`targets.value[${idx('snackCart')}]`);
  });

  it('a negative hit box coordinate fails', () => {
    const err = failure((h) => { tgt(h, 'windows').hit.x0 = -1; });
    expect(err.file).toBe(FILE);
    expect(err.message).toContain('targets.value');
  });

  it('a hit box narrower than 16 fails and names the field', () => {
    const err = failure((h) => { const t = tgt(h, 'board'); t.hit.x0 = 237; t.hit.x1 = 251; }); // 15 wide
    expect(err.message).toContain(`targets.value[${idx('board')}]`);
    expect(err.message).toMatch(/hit/);
  });

  it('a hit box shorter than 16 fails', () => {
    const err = failure((h) => { const t = tgt(h, 'bugler'); t.hit.y1 = t.hit.y0 + 14; });
    expect(err.message).toContain(`targets.value[${idx('bugler')}]`);
  });

  it.each([
    ['above y16', 'y0', 15],
    ['below y175', 'y1', 176],
    ['past the right edge', 'x1', 256],
  ])('a focus box outside the picture (%s) fails', (_n, field, value) => {
    const err = failure((h) => { tgt(h, 'regular').focus[field] = value; });
    expect(err.file).toBe(FILE);
    expect(err.message).toContain(`targets.value[${idx('regular')}]`);
    expect(err.message).toMatch(/focus/);
  });

  it('a focus box on the picture edge (y16 and y175) is allowed', () => {
    expect(() => load((h) => {
      const t = tgt(h, 'snackCart');
      t.hit = { x0: 160, y0: 140, x1: 255, y1: 175 };
      t.focus = { x0: 180, y0: 160, x1: 235, y1: 175 };
    })).not.toThrow();
  });
});

describe('TH10 at load: copy lines are held to the field', () => {
  it('a lookable line of 29 characters fails naming its key; 28 passes', () => {
    expect(() => load((h) => { h.copy.lookables.regular.lines[0] = 'z'.repeat(28); })).not.toThrow();
    const err = failure((h) => { h.copy.lookables.regular.lines[0] = 'z'.repeat(29); });
    expect(err.file).toBe(FILE);
    expect(err.message).toContain('copy.lookables.regular.lines[0]');
  });

  it('a lookable with fewer than three lines fails', () => {
    const err = failure((h) => { h.copy.lookables.board.lines = h.copy.lookables.board.lines.slice(0, 2); });
    expect(err.message).toContain('copy.lookables.board');
  });

  it('a flavor line over 28 fails', () => {
    const err = failure((h) => { h.copy.flavor[0] = 'q'.repeat(29); });
    expect(err.message).toContain('copy.flavor[0]');
  });

  it.each(['cash', 'buy', 'Cashier', 'BUY'])('"%s" in a line fails', (word) => {
    const err = failure((h) => { h.copy.lookables.snackCart.lines[1] = `Go ${word} now`; });
    expect(err.message).toContain('copy.lookables.snackCart.lines[1]');
  });

  it('a word from betting.json\'s banned list fails too', () => {
    const word = bettingJson.copy.bannedWords[0];
    const err = failure((h) => { h.copy.flavor[1] = `A ${word} here`; });
    expect(err.message).toContain('copy.flavor[1]');
  });
});
