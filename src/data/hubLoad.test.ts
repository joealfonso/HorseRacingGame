import { describe, expect, it } from 'vitest';
import bettingJson from './betting.json';
import hubJson from './hub.json';
import paletteJson from './palette.json';
import { loadHub, validateHub, type HubInput } from './hubLoad';
import { DataError } from './validate';

// The hub data loader: TH1's boxes and the copy rules of section 7 (28 characters, three
// lines a lookable, no banned word), each failing at load with the file and the field.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;
const input = (edit: (h: Raw) => void = () => {}): HubInput => {
  const hub = structuredClone(hubJson) as Raw;
  edit(hub);
  return { hub, bannedWords: bettingJson.copy.bannedWords, colors: paletteJson.colors.map((c) => c.name), fieldSize: 8 };
};
const failure = (edit: (h: Raw) => void, fieldSize = 8): DataError => {
  try { validateHub({ ...input(edit), fieldSize }); } catch (e) { if (e instanceof DataError) return e; throw e; }
  throw new Error('expected validateHub to throw');
};
const target = (h: Raw, id: string) => h.targets.value.find((t: Raw) => t.id === id);
const index = (id: string) => hubJson.targets.value.findIndex((t) => t.id === id);

describe('the shipped hub.json', () => {
  it('loads', () => {
    expect(() => loadHub()).not.toThrow();
  });

  it('has the spec\'s seven targets in picture order', () => {
    expect(loadHub().targetOrder.value).toEqual(['regular', 'windows', 'board', 'fans', 'rail', 'bugler', 'snackCart']);
  });
});

describe('TH1 boxes', () => {
  it('a hit box past the screen fails, naming the file and the field', () => {
    const err = failure((h) => { target(h, 'snackCart').hit.x1 = 256; });
    expect(err.file).toBe('src/data/hub.json');
    expect(err.message).toContain(`targets.value[${index('snackCart')}].hit`);
    expect(err.message).toContain('not inside the 256x240 screen');
  });

  it('two overlapping hit boxes fail', () => {
    const err = failure((h) => { target(h, 'fans').hit.x1 = 160; });
    expect(err.issues.some((i) => i.message.includes('overlaps'))).toBe(true);
  });

  it('a door row overlapping another fails', () => {
    const err = failure((h) => { h.box.value.doorRows[1].item.y0 = 219; });
    expect(err.message).toContain('box.value.doorRows[1].item');
  });

  it('a hit box under 16x16 fails; exactly 16 passes', () => {
    const err = failure((h) => { const b = target(h, 'bugler').hit; b.y1 = b.y0 + 14; });
    expect(err.message).toContain(`targets.value[${index('bugler')}].hit`);
    expect(err.message).toContain('at least 16x16');
    expect(() => validateHub(input((h) => { const b = target(h, 'bugler').hit; b.y1 = b.y0 + 15; target(h, 'bugler').focus = { x0: 124, y0: 140, x1: 147, y1: 155 }; }))).not.toThrow();
  });

  it('a focus box outside the picture (y16-175) fails', () => {
    const err = failure((h) => { target(h, 'bugler').focus.y1 = 176; });
    expect(err.message).toContain(`targets.value[${index('bugler')}].focus`);
    expect(err.message).toContain('not inside the picture');
  });

  it('a target missing from targetOrder fails', () => {
    const err = failure((h) => { h.targetOrder.value = h.targetOrder.value.filter((id: string) => id !== 'fans'); });
    expect(err.message).toContain('targetOrder.value');
    expect(err.message).toContain('"fans"');
  });

  it('a second door with the same action fails', () => {
    const err = failure((h) => { target(h, 'rail').action = 'window'; });
    expect(err.message).toContain('exactly one door with action "watch"');
  });

  it('a board with fewer cells than the field fails', () => {
    const err = failure(() => {}, 9);
    expect(err.message).toContain('toteBoard.value');
  });

  it('every shipped odds label fits the board\'s price width', () => {
    for (const st of bettingJson.odds.steps.value) expect(st.label.length, st.label).toBeLessThanOrEqual(hubJson.toteBoard.value.priceChars);
  });

  it('an odds label longer than the price width fails, naming betting.json\'s field and the board\'s', () => {
    const labels = bettingJson.odds.steps.value.map((st) => st.label);
    labels[5] = '100-1';
    let err: unknown;
    try { validateHub({ ...input(), oddsLabels: labels }); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(DataError);
    const msg = (err as DataError).message;
    expect(msg).toContain('src/data/hub.json: toteBoard.value.priceChars');
    expect(msg).toContain('src/data/betting.json odds.steps.value[5].label "100-1"');
  });

  it('a schema error names its field', () => {
    const err = failure((h) => { delete h.toteBoard.value.pitch; });
    expect(err.message).toContain('src/data/hub.json: toteBoard.value.pitch');
  });

  it('a sky band in a color outside the palette fails', () => {
    const err = failure((h) => { h.skyByRace.value[1].bands[0].color = 'Teal'; });
    expect(err.message).toContain('skyByRace.value[1].bands[0].color');
  });

  it('a sky step that leaves a gap fails', () => {
    const err = failure((h) => { h.skyByRace.value[2].bands[1].y0 = 25; });
    expect(err.message).toContain('skyByRace.value[2].bands[1].y0');
  });
});

describe('copy rules', () => {
  it('a voice line of 28 passes and 29 fails, naming the key', () => {
    expect(() => validateHub(input((h) => { h.copy.lookables.bugler.lines[2] = 'x'.repeat(28); }))).not.toThrow();
    const err = failure((h) => { h.copy.lookables.bugler.lines[2] = 'x'.repeat(29); });
    expect(err.message).toContain('copy.lookables.bugler.lines[2]');
    expect(err.message).toContain('29 characters; at most 28');
  });

  it('a state line is held to 28 with its hole filled', () => {
    const err = failure((h) => { h.copy.state.next = `Race {r} is up${'!'.repeat(17)}`; }); // 29 with r = 8
    expect(err.message).toContain('copy.state.next');
  });

  it('{r} is filled at the day\'s widest race number, from the race count', () => {
    const edit = (h: Raw) => { h.copy.state.next = `Race {r} is up${'!'.repeat(16)}`; }; // 28 with "8", 29 with "10"
    expect(() => validateHub({ ...input(edit), races: 8 })).not.toThrow();
    let err: unknown;
    try { validateHub({ ...input(edit), races: 10 }); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(DataError);
    expect((err as DataError).message).toContain('copy.state.next');
  });

  it('an unknown hole fails', () => {
    const err = failure((h) => { h.copy.doors.windows = 'Bet {race}'; });
    expect(err.message).toContain('copy.doors.windows');
    expect(err.message).toContain('{race}');
  });

  it('a flavor line over 28 fails', () => {
    const err = failure((h) => { h.copy.flavor[3] = 'y'.repeat(29); });
    expect(err.message).toContain('copy.flavor[3]');
  });

  it('a lookable with two lines fails', () => {
    const err = failure((h) => { h.copy.lookables.board.lines = ['One.', 'Two.']; });
    expect(err.message).toContain('copy.lookables.board.lines');
    expect(err.message).toContain('at least 3');
  });

  it('a lookable with no copy fails', () => {
    const err = failure((h) => { delete h.copy.lookables.fans; });
    expect(err.message).toContain('copy.lookables.fans');
  });

  it('the sign is held to the plate (8 characters)', () => {
    const err = failure((h) => { h.copy.sign.windows = 'Windowsss'; });
    expect(err.message).toContain('copy.sign.windows');
  });

  it.each([
    ['a betting.json banned word', 'Purchase a pretzel.'],
    ['"buy" in another form', 'Buying peanuts.'],
    ['"cash" in another form', 'The cashier waves.'],
  ])('%s fails, case-insensitively', (_name, line) => {
    const err = failure((h) => { h.copy.lookables.snackCart.lines[0] = line; });
    expect(err.message).toContain('copy.lookables.snackCart.lines[0]');
    expect(err.message).toContain('banned word');
  });

  it('a banned word in a name or a door label fails too', () => {
    expect(failure((h) => { h.copy.lookables.regular.name = 'Cash'; }).message).toContain('copy.lookables.regular.name');
    expect(failure((h) => { h.copy.doors.rail = 'Buy Race {r}'; }).message).toContain('copy.doors.rail');
  });
});
