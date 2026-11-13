/// <reference types="vite/client" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import cardLookJson from './cardLook.json';
import paletteJson from './palette.json';
import raceDayJson from './raceDay.json';
import slotsJson from './slots.json';
import { loadData } from './load';
import { loadRaceDay, validateRaceDay } from './raceDayLoad';
import { neededSlotIds } from './raceDaySchema';
import { DataError } from './validate';
import type { GameData } from './schema';

// Data for steps 3 and 4 (spec 4.4, 4.6, 7): the photo group and copy, the result copy,
// the two new slots. Each broken value must be refused with the file and the field named.

type Raw = { palette: any; slots: any; cardLook: any; raceDay: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const fresh = (): Raw => structuredClone({ palette: paletteJson, slots: slotsJson, cardLook: cardLookJson, raceDay: raceDayJson });
const game = (): GameData => structuredClone(loadData());
const DAY = 'src/data/raceDay.json';
const SLOTS = 'src/data/slots.json';

function failure(raw: Raw): DataError {
  try {
    validateRaceDay(raw, game());
  } catch (e) {
    expect(e).toBeInstanceOf(DataError);
    return e as DataError;
  }
  throw new Error('validation passed but should have been rejected');
}
function rejected(edit: (r: Raw) => void, file: string, path: string): DataError {
  const raw = fresh();
  edit(raw);
  const err = failure(raw);
  expect(err.file).toBe(file);
  expect(err.issues.map((i) => i.path)).toContain(path);
  expect(err.message).toContain(file);
  expect(err.message).toContain(path);
  return err;
}
const accepted = (edit: (r: Raw) => void) => {
  const raw = fresh();
  edit(raw);
  expect(() => validateRaceDay(raw, game())).not.toThrow();
};

describe('the shipped photo and result data', () => {
  it('loads', () => {
    expect(() => loadRaceDay(loadData())).not.toThrow();
    expect(() => validateRaceDay(fresh(), game())).not.toThrow();
  });

  it('the spec\'s values: panel moves of 8 px at one a frame (60 a second), a 4.5 s photo, the caption 1.5 s in', () => {
    expect(raceDayJson.photo.stepPx.value).toBe(8);
    expect(raceDayJson.photo.stepsPerSecond.value).toBe(60);
    expect(raceDayJson.beats.photoSeconds.value).toBe(4.5);
    expect(raceDayJson.beats.photoCaptionSeconds.value).toBe(1.5);
    expect(raceDayJson.photo.stepPx.status).toMatch(/starting guess|confirmed/);
  });

  it('the spec\'s copy', () => {
    const c = raceDayJson.copy;
    expect(c.photo.title).toBe('Photo finish');
    expect(c.photo.winner).toBe('{winner} wins');
    expect(c.photo.margin).toBe('by {margin} over #{n}');
    expect(c.result.clean).toBe('Clean trip');
    expect(c.result.won).toBe('Won by {margin}');
    expect(c.result.beaten).toBe('{place}, beaten {margin}');
    expect(c.result.rough).toBe('A rough trip, {count} setbacks');
    expect(c.result.orders).toBe('Orders: {orders}');
    expect(c.result.winnerMargin).toBe('-');
    expect(c.result.start).toBe('at the start');
    expect(c.marginWords).toEqual({ nose: 'a nose', head: 'a head', neck: 'a neck' });
  });
});

describe('the photo group', () => {
  it.each(['photo', 'photo.stepPx', 'photo.stepsPerSecond', 'beats.photoSeconds', 'beats.photoCaptionSeconds'])('%s missing is refused', (path) => {
    rejected((r) => {
      const keys = path.split('.');
      let o = r.raceDay;
      for (const k of keys.slice(0, -1)) o = o[k];
      delete o[keys[keys.length - 1]];
    }, DAY, path);
  });

  it.each([
    ['photo.stepPx.value', 0],
    ['photo.stepPx.value', -8],
    ['photo.stepPx.value', 4.5],
    ['photo.stepPx.value', '8'],
    ['photo.stepsPerSecond.value', 0],
    ['photo.stepsPerSecond.value', -60],
    ['photo.stepsPerSecond.value', '60'],
    ['beats.photoSeconds.value', -1],
    ['beats.photoSeconds.value', '4.5'],
    ['beats.photoCaptionSeconds.value', -0.5],
    ['beats.photoCaptionSeconds.value', '1.5'],
  ] as const)('%s = %j is refused', (path, value) => {
    rejected((r) => {
      const keys = path.split('.');
      let o = r.raceDay;
      for (const k of keys.slice(0, -1)) o = o[k];
      o[keys[keys.length - 1]] = value;
    }, DAY, path);
  });

  it('a status that is neither starting guess nor confirmed is refused, and an unknown field', () => {
    rejected((r) => { r.raceDay.photo.stepPx.status = 'maybe'; }, DAY, 'photo.stepPx.status');
    const raw = fresh();
    raw.raceDay.photo.surprise = 1;
    expect(failure(raw).message).toContain('surprise');
  });

  it('a photo beat of 0 s is allowed (no photo time), a caption delay of 0 is allowed', () => {
    accepted((r) => { r.raceDay.beats.photoSeconds.value = 0; r.raceDay.beats.photoCaptionSeconds.value = 0; });
  });

  it('a caption delay longer than the photo is refused at beats.photoCaptionSeconds; equal to the photo is fine', () => {
    const err = rejected((r) => { r.raceDay.beats.photoCaptionSeconds.value = 4.6; }, DAY, 'beats.photoCaptionSeconds');
    expect(err.issues.find((i) => i.path === 'beats.photoCaptionSeconds')!.message).toMatch(/photo/);
    accepted((r) => { r.raceDay.beats.photoCaptionSeconds.value = 4.5; });
    rejected((r) => { r.raceDay.beats.photoSeconds.value = 1; r.raceDay.beats.photoCaptionSeconds.value = 1.01; }, DAY, 'beats.photoCaptionSeconds');
  });

  it('RV11: a photo long enough to push the 2:05.00 sequence past the cap is refused at beats', () => {
    rejected((r) => { r.raceDay.beats.photoSeconds.value = 30; r.raceDay.beats.photoCaptionSeconds.value = 1.5; }, DAY, 'beats');
  });
});

describe('the photo copy', () => {
  it.each(['title', 'winner', 'margin'])('copy.photo.%s missing is refused, and so is empty text', (k) => {
    rejected((r) => { delete r.raceDay.copy.photo[k]; }, DAY, `copy.photo.${k}`);
    rejected((r) => { r.raceDay.copy.photo[k] = '  '; }, DAY, `copy.photo.${k}`);
  });

  it('the winner line must fit 30 characters with an 18-character name: 30 passes, 31 is refused', () => {
    accepted((r) => { r.raceDay.copy.photo.winner = `{winner} ${'x'.repeat(11)}`; });
    const err = rejected((r) => { r.raceDay.copy.photo.winner = `{winner} ${'x'.repeat(12)}`; }, DAY, 'copy.photo.winner');
    expect(err.issues.find((i) => i.path === 'copy.photo.winner')!.message).toMatch(/30/);
  });

  it('the margin line must fit with the widest margin phrase and post: too wide is refused', () => {
    rejected((r) => { r.raceDay.copy.photo.margin = 'by {margin} over number {n} on the day'; }, DAY, 'copy.photo.margin');
    accepted((r) => { r.raceDay.copy.photo.margin = 'by {margin} over #{n}'; });
  });

  it('the title must fit 30 characters', () => {
    rejected((r) => { r.raceDay.copy.photo.title = 'x'.repeat(31); }, DAY, 'copy.photo.title');
    accepted((r) => { r.raceDay.copy.photo.title = 'x'.repeat(30); });
  });

  it.each([
    ['copy.photo.winner', '{name} wins'],
    ['copy.photo.winner', '{winner} wins #{n}'],
    ['copy.photo.margin', 'by {margin} over {winner}'],
    ['copy.photo.title', '{winner} photo'],
  ])('an unknown hole is refused at %s: %s', (path, template) => {
    const err = rejected((r) => { const k = path.split('.'); r.raceDay.copy[k[2] === undefined ? '' : k[1]][k[2]] = template; }, DAY, path);
    expect(err.issues.find((i) => i.path === path)!.message).toMatch(/not allowed/);
  });

  it('the margin phrases: missing marginLength or marginLengths is refused, and an unknown hole in them', () => {
    rejected((r) => { delete r.raceDay.copy.marginLength; }, DAY, 'copy.marginLength');
    rejected((r) => { delete r.raceDay.copy.marginLengths; }, DAY, 'copy.marginLengths');
    rejected((r) => { r.raceDay.copy.marginLengths = '{n} lengths'; }, DAY, 'copy.marginLengths');
    rejected((r) => { delete r.raceDay.copy.marginWords.nose; }, DAY, 'copy.marginWords.nose');
  });
});

describe('the result copy', () => {
  const KEYS = Object.keys(raceDayJson.copy.result).filter((k) => k !== 'pace' && k !== 'poles');

  it.each(KEYS)('copy.result.%s missing is refused', (k) => {
    rejected((r) => { delete r.raceDay.copy.result[k]; }, DAY, `copy.result.${k}`);
  });
  it.each(['hot', 'honest', 'slow'])('copy.result.pace.%s missing is refused', (k) => {
    rejected((r) => { delete r.raceDay.copy.result.pace[k]; }, DAY, `copy.result.pace.${k}`);
  });
  it.each(['wire', 'mile'])('copy.result.poles.%s missing is refused', (k) => {
    rejected((r) => { delete r.raceDay.copy.result.poles[k]; }, DAY, `copy.result.poles.${k}`);
  });
  it('the whole result group missing is refused', () => {
    rejected((r) => { delete r.raceDay.copy.result; }, DAY, 'copy.result');
  });
  it('a joiner that is empty, or a number where text belongs, is refused', () => {
    rejected((r) => { r.raceDay.copy.result.callsJoiner = ''; }, DAY, 'copy.result.callsJoiner');
    rejected((r) => { r.raceDay.copy.result.clean = 5; }, DAY, 'copy.result.clean');
  });

  it('the winner\'s margin cell holds 5 characters: 5 passes, 6 is refused', () => {
    accepted((r) => { r.raceDay.copy.result.winnerMargin = 'xxxxx'; });
    rejected((r) => { r.raceDay.copy.result.winnerMargin = 'xxxxxx'; }, DAY, 'copy.result.winnerMargin');
  });

  it('"Next race" fits the 28 characters after the cursor: 28 passes, 29 is refused', () => {
    accepted((r) => { r.raceDay.copy.result.next = 'x'.repeat(28); });
    rejected((r) => { r.raceDay.copy.result.next = 'x'.repeat(29); }, DAY, 'copy.result.next');
  });

  it('lines too wide for the box (30 characters at their widest) are refused', () => {
    rejected((r) => { r.raceDay.copy.result.won = 'The winner won the race by {margin} today'; }, DAY, 'copy.result.won');
    rejected((r) => { r.raceDay.copy.result.beaten = '{place} place, beaten by {margin} today'; }, DAY, 'copy.result.beaten');
    rejected((r) => { r.raceDay.copy.result.rough = 'A very rough trip indeed, {count} setbacks'; }, DAY, 'copy.result.rough');
    rejected((r) => { r.raceDay.copy.result.orders = 'The orders you gave were: {orders}'; }, DAY, 'copy.result.orders');
    rejected((r) => { r.raceDay.copy.result.clean = 'x'.repeat(31); }, DAY, 'copy.result.clean');
    rejected((r) => { r.raceDay.copy.result.start = 'x'.repeat(31); }, DAY, 'copy.result.start');
    rejected((r) => { r.raceDay.copy.result.time = 'The time of the race was {time}, {pace} pace'; }, DAY, 'copy.result.time');
  });

  it('a luck line that overflows once the longest "where" is put in is refused', () => {
    rejected((r) => { r.raceDay.copy.result.blocked = 'Had no room at all {where}'; }, DAY, 'copy.result.blocked');
    rejected((r) => { r.raceDay.copy.result.bumped = 'Bumped by horse #{n} {where}'; }, DAY, 'copy.result.bumped');
    rejected((r) => { r.raceDay.copy.result.near = 'somewhere around the {pole} pole'; }, DAY, 'copy.result.near');
  });

  it('the calls line (early, then the 1/4) must fit 30 characters together', () => {
    const err = rejected((r) => { r.raceDay.copy.result.early = '{place} early on in the running'; }, DAY, 'copy.result');
    expect(err.message).toMatch(/calls line|copy\.result\.early/);
  });

  it('the splits label and the seed label must leave room for the numbers in the 240 px box', () => {
    // Four splits at their widest (27 characters of the small font, 4 px each) beside the label.
    rejected((r) => { r.raceDay.copy.result.splits = 'x'.repeat(14); }, DAY, 'copy.result.splits');
    accepted((r) => { r.raceDay.copy.result.splits = 'x'.repeat(10); });
    rejected((r) => { r.raceDay.copy.result.seed = 'x'.repeat(25); }, DAY, 'copy.result.seed');
    accepted((r) => { r.raceDay.copy.result.seed = 'Seed'; });
  });

  it.each([
    ['won', '{name} won by {margin}'],
    ['beaten', '{place}, beaten {margin} {n}'],
    ['clean', '{where} clean'],
    ['blocked', 'No room {pole}'],
    ['steadied', '{name} steadied {where}'],
    ['bumped', 'Bumped with #{post} {where}'],
    ['near', 'near the {where}'],
    ['rough', 'A rough trip, {n} setbacks'],
    ['orders', 'Orders: {order}'],
    ['time', 'Time {clock}, {pace} pace'],
    ['early', '{n} early'],
  ])('an unknown hole is refused at copy.result.%s: %s', (k, template) => {
    const err = rejected((r) => { r.raceDay.copy.result[k] = template; }, DAY, `copy.result.${k}`);
    expect(err.issues.find((i) => i.path === `copy.result.${k}`)!.message).toMatch(/not allowed/);
  });
});

describe('the two new slots: art.photo.bg.streaks (16x16) and art.ui.marker.yours (8x8)', () => {
  const NEW = [
    { id: 'art.photo.bg.streaks', w: 16, h: 16, file: 'public/assets/art/photo/bg/streaks.png' },
    { id: 'art.ui.marker.yours', w: 8, h: 8, file: 'public/assets/art/ui/marker/yours.png' },
  ];
  const slotOf = (id: string) => slotsJson.slots.find((x) => x.id === id) as Record<string, unknown> | undefined;

  it.each(NEW)('$id is in the needed list', ({ id }) => {
    expect(neededSlotIds({ surface: 'dirt', going: 'fast' })).toContain(id);
    expect(neededSlotIds()).toContain(id);
  });

  it.each(NEW)('$id is in slots.json at its size, one frame, and final art (not a placeholder)', ({ id, w, h }) => {
    const s = slotOf(id)!;
    expect(s, id).toBeDefined();
    expect([s.frameWidth, s.frameHeight, s.frames]).toEqual([w, h, 1]);
    expect(s.placeholder).toBe(false);
    expect(s.file).toMatch(/\.png$/);
  });

  it.each(NEW)('$id: the file is a PNG of exactly that size', ({ id, w, h, file }) => {
    const s = slotOf(id)!;
    expect(`public/${s.file}`).toBe(file);
    const buf = readFileSync(new URL(`../../${file}`, import.meta.url));
    expect(buf.subarray(1, 4).toString()).toBe('PNG');
    expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([w, h]);
  });

  it.each(NEW)('the loader refuses a slots.json without $id, naming the file and the slot', ({ id }) => {
    const raw = fresh();
    raw.slots.slots = raw.slots.slots.filter((x: { id: string }) => x.id !== id);
    const err = failure(raw);
    expect(err.file).toBe(SLOTS);
    expect(err.message).toContain(id);
  });

  it.each(NEW)('$id as an art slot needs a file and a size', ({ id }) => {
    rejected((r) => { r.slots.slots.find((x: { id: string }) => x.id === id).file = null; }, SLOTS, `slots[${slotsJson.slots.findIndex((x) => x.id === id)}].file`);
    rejected((r) => { delete r.slots.slots.find((x: { id: string }) => x.id === id).frameWidth; }, SLOTS, `slots[${slotsJson.slots.findIndex((x) => x.id === id)}].frameWidth`);
  });

  it('the shutter sound slot exists as a silent placeholder', () => {
    const s = slotOf('sfx.photo.shutter')!;
    expect(s.file).toBeNull();
    expect(s.placeholder).toBe(true);
  });
});
