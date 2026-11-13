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

// Data for step 5 (spec 4.1, 4.2, 5, 11): the blurb, the card and paddock copy, the menus and
// paddock groups, and the three paddock slots. Each broken value must be refused with the
// file and the field named; the limits are the spec's field widths.

type Raw = { palette: any; slots: any; cardLook: any; raceDay: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const fresh = (): Raw => structuredClone({ palette: paletteJson, slots: slotsJson, cardLook: cardLookJson, raceDay: raceDayJson });
const game = (): GameData => structuredClone(loadData());
const DAY = 'src/data/raceDay.json';
const SLOTS = 'src/data/slots.json';
const LOOK = 'src/data/cardLook.json';

function failure(raw: Raw, g: GameData = game()): DataError {
  try {
    validateRaceDay(raw, g);
  } catch (e) {
    expect(e).toBeInstanceOf(DataError);
    return e as DataError;
  }
  throw new Error('validation passed but should have been rejected');
}
function rejected(edit: (r: Raw) => void, file: string, path: string, g?: GameData): DataError {
  const raw = fresh();
  edit(raw);
  const err = failure(raw, g);
  expect(err.file).toBe(file);
  expect(err.issues.map((i) => i.path)).toContain(path);
  expect(err.message).toContain(file);
  expect(err.message).toContain(path);
  return err;
}
const accepted = (edit: (r: Raw) => void, g?: GameData) => {
  const raw = fresh();
  edit(raw);
  expect(() => validateRaceDay(raw, g ?? game())).not.toThrow();
};
/** Set a dotted path on the raceDay copy of a Raw. */
const setAt = (r: Raw, path: string, value: unknown) => {
  const keys = path.split('.');
  let o = r.raceDay;
  for (const k of keys.slice(0, -1)) o = o[k];
  if (value === undefined) delete o[keys[keys.length - 1]];
  else o[keys[keys.length - 1]] = value;
};

describe('the shipped files, blurbs included', () => {
  it('load, and every one of the eight horses has a blurb of 28 characters or fewer', () => {
    expect(() => loadRaceDay(loadData())).not.toThrow();
    const looks = Object.values(cardLookJson) as { blurb?: string }[];
    expect(looks).toHaveLength(8);
    for (const l of looks) {
      expect(l.blurb, 'every shipped horse has a blurb').toBeTruthy();
      expect(l.blurb!.length).toBeLessThanOrEqual(28);
      expect(l.blurb!.length).toBeGreaterThan(0);
    }
    expect(new Set(looks.map((l) => l.blurb)).size).toBe(8);
  });

  it('the shipped values are the spec\'s: arrows repeat after 400 ms then every 120 ms', () => {
    expect(raceDayJson.menus.repeatDelayMs.value).toBe(400);
    expect(raceDayJson.menus.repeatEveryMs.value).toBe(120);
    expect(raceDayJson.paddock.trainerAt.value).toEqual([24, 164]);
    expect(raceDayJson.paddock.horseAt.value).toEqual([48, 164]);
  });
});

describe('the blurb', () => {
  it('28 characters are accepted, 29 are rejected naming the file and the field', () => {
    accepted((r) => { r.cardLook.h1.blurb = 'x'.repeat(28); });
    const err = rejected((r) => { r.cardLook.h1.blurb = 'x'.repeat(29); }, LOOK, 'h1.blurb');
    expect(err.issues.find((i) => i.path === 'h1.blurb')!.message).toMatch(/28/);
  });

  it('absent is accepted (the card line is then blank)', () => {
    accepted((r) => { delete r.cardLook.h1.blurb; });
    accepted((r) => { for (const k of Object.keys(r.cardLook)) delete r.cardLook[k].blurb; });
  });

  it('empty, only spaces, padded with spaces, and a number are rejected', () => {
    rejected((r) => { r.cardLook.h1.blurb = ''; }, LOOK, 'h1.blurb');
    rejected((r) => { r.cardLook.h1.blurb = '   '; }, LOOK, 'h1.blurb');
    rejected((r) => { r.cardLook.h1.blurb = ' padded'; }, LOOK, 'h1.blurb');
    rejected((r) => { r.cardLook.h1.blurb = 5; }, LOOK, 'h1.blurb');
  });

  it('an unknown field is still refused', () => {
    const raw = fresh();
    raw.cardLook.h2.nickname = 'x';
    const err = failure(raw);
    expect(err.file).toBe(LOOK);
    expect(err.message).toContain('nickname');
  });
});

describe('CD2: a card with more than 8 horses fails at boot with the file and the field', () => {
  it('nine horses: src/data/card.json, horses, "at most 8"', () => {
    const g = game();
    g.card.horses.push({ ...structuredClone(g.card.horses[0]), id: 'h9', name: 'Ninth Horse', post: 9 });
    const raw = fresh();
    raw.cardLook.h9 = structuredClone(raw.cardLook.h1);
    const err = failure(raw, g);
    expect(err.file).toBe('src/data/card.json');
    expect(err.message).toContain('horses');
    expect(err.message).toMatch(/at most 8 horses/);
  });
});

describe('the menus and paddock groups', () => {
  it.each(['menus', 'menus.repeatDelayMs', 'menus.repeatEveryMs', 'paddock', 'paddock.rows', 'paddock.trainerAt', 'paddock.horseAt', 'paddock.cupDownSeconds', 'paddock.cupUpSeconds'])(
    '%s missing is refused',
    (path) => { rejected((r) => setAt(r, path, undefined), DAY, path); },
  );

  it.each([
    ['menus.repeatDelayMs.value', 0], ['menus.repeatDelayMs.value', -400], ['menus.repeatDelayMs.value', '400'],
    ['menus.repeatEveryMs.value', 0], ['menus.repeatEveryMs.value', -1], ['menus.repeatEveryMs.value', '120'],
    ['paddock.cupDownSeconds.value', 0], ['paddock.cupDownSeconds.value', -1.5], ['paddock.cupDownSeconds.value', '1.5'],
    ['paddock.cupUpSeconds.value', 0], ['paddock.cupUpSeconds.value', 'x'],
    ['paddock.trainerAt.value', [24]], ['paddock.trainerAt.value', [24, 164, 1]], ['paddock.trainerAt.value', [-1, 164]], ['paddock.trainerAt.value', [256, 164]],
    ['paddock.trainerAt.value', [24, 240]], ['paddock.trainerAt.value', [24.5, 164]], ['paddock.trainerAt.value', ['24', 164]],
    ['paddock.horseAt.value', [48]], ['paddock.horseAt.value', [48, -4]], ['paddock.horseAt.value', [300, 164]],
  ] as const)('%s = %j is refused', (path, value) => {
    const err = failure((() => { const r = fresh(); setAt(r, path, value); return r; })());
    expect(err.file).toBe(DAY);
    expect(err.message).toContain(path.replace(/\.value$/, ''));
  });

  it('a status that is neither starting guess nor confirmed, and an unknown field, are refused', () => {
    rejected((r) => { r.raceDay.menus.repeatDelayMs.status = 'maybe'; }, DAY, 'menus.repeatDelayMs.status');
    const raw = fresh();
    raw.raceDay.paddock.surprise = 1;
    expect(failure(raw).message).toContain('surprise');
  });

  it('the paddock lists exactly three rows', () => {
    rejected((r) => { r.raceDay.paddock.rows.value.pop(); }, DAY, 'paddock.rows.value');
    rejected((r) => { r.raceDay.paddock.rows.value.push({ slot: 'art.paddock.ground', flipOddTiles: false }); }, DAY, 'paddock.rows.value');
    rejected((r) => { r.raceDay.paddock.rows.value = []; }, DAY, 'paddock.rows.value');
  });

  it('a row naming a slot that does not exist is refused, naming the row', () => {
    const err = rejected((r) => { r.raceDay.paddock.rows.value[1].slot = 'art.paddock.fence'; }, DAY, 'paddock.rows.value[1].slot');
    expect(err.issues.find((i) => i.path === 'paddock.rows.value[1].slot')!.message).toContain('art.paddock.fence');
  });

  it('a row naming a slot that is not a 16x16 tile is refused', () => {
    rejected((r) => { r.raceDay.paddock.rows.value[0].slot = 'art.race.horse.body.gallop'; }, DAY, 'paddock.rows.value[0].slot'); // 32x24
    rejected((r) => { r.raceDay.paddock.rows.value[2].slot = 'art.paddock.trainer'; }, DAY, 'paddock.rows.value[2].slot'); // 16x24
    rejected((r) => { r.raceDay.paddock.rows.value[1].slot = 'art.ui.marker.yours'; }, DAY, 'paddock.rows.value[1].slot'); // 8x8
    accepted((r) => { r.raceDay.paddock.rows.value[1].slot = 'art.photo.bg.streaks'; }); // any 16x16 tile is a tile
  });

  it('a row\'s flip flag must be a boolean', () => {
    rejected((r) => { r.raceDay.paddock.rows.value[1].flipOddTiles = 'yes'; }, DAY, 'paddock.rows.value[1].flipOddTiles');
    rejected((r) => { delete r.raceDay.paddock.rows.value[1].flipOddTiles; }, DAY, 'paddock.rows.value[1].flipOddTiles');
  });
});

describe('the card copy', () => {
  const KEYS = [
    'copy.card', 'copy.card.styles', 'copy.card.styles.frontRunner', 'copy.card.styles.stalker', 'copy.card.styles.closer', 'copy.card.furlongs', 'copy.card.mile',
    'copy.card.miles', 'copy.card.conditions', 'copy.card.surfaces', 'copy.card.surfaces.dirt', 'copy.card.goings', 'copy.card.goings.sloppy', 'copy.card.bias',
    'copy.card.bias.fair', 'copy.card.bias.lane.inside', 'copy.card.bias.style.closers', 'copy.card.bias.both', 'copy.card.bias.laneShort.outside',
    'copy.card.bias.styleShort.speed', 'copy.card.jockey', 'copy.card.stats', 'copy.card.hint', 'copy.card.lastPick',
  ];
  it.each(KEYS)('%s missing is refused', (path) => { rejected((r) => setAt(r, path, undefined), DAY, path); });

  it('empty text and a number are refused', () => {
    rejected((r) => setAt(r, 'copy.card.hint', ' '), DAY, 'copy.card.hint');
    rejected((r) => setAt(r, 'copy.card.lastPick', 3), DAY, 'copy.card.lastPick');
  });

  it('a style word is at most 7 characters: 7 passes, 8 is refused', () => {
    accepted((r) => setAt(r, 'copy.card.styles.stalker', 'x'.repeat(7)));
    rejected((r) => setAt(r, 'copy.card.styles.stalker', 'x'.repeat(8)), DAY, 'copy.card.styles.stalker');
    rejected((r) => setAt(r, 'copy.card.styles.frontRunner', 'Front-runner'), DAY, 'copy.card.styles.frontRunner');
  });

  it('the conditions line must fit 30 characters for this race: the widest distance, surface and going are what the race has', () => {
    rejected((r) => setAt(r, 'copy.card.conditions', '{distance}, on the {surface} track, going {going}'), DAY, 'copy.card.conditions');
    accepted((r) => setAt(r, 'copy.card.conditions', '{distance}  {surface}  {going}'));
  });

  it('a conditions template with an unknown hole is refused', () => {
    const err = rejected((r) => setAt(r, 'copy.card.conditions', '{distance}, {surface}, {track}'), DAY, 'copy.card.conditions');
    expect(err.issues.find((i) => i.path === 'copy.card.conditions')!.message).toMatch(/not allowed/);
  });

  it('a bias line over 30 characters is refused, every line the copy can make is checked', () => {
    rejected((r) => setAt(r, 'copy.card.bias.lane.inside', 'x'.repeat(31)), DAY, 'copy.card.bias');
    accepted((r) => setAt(r, 'copy.card.bias.fair', 'x'.repeat(30)));
    rejected((r) => setAt(r, 'copy.card.bias.fair', 'x'.repeat(31)), DAY, 'copy.card.bias'); // named at the group, with the line in the message
    // The two together: each alone fits, the pair does not.
    rejected((r) => { setAt(r, 'copy.card.bias.laneShort.inside', 'Inside paths are good'); setAt(r, 'copy.card.bias.styleShort.speed', 'speed is holding on'); }, DAY, 'copy.card.bias');
  });

  it('the detail templates are checked: unknown holes and widths', () => {
    rejected((r) => setAt(r, 'copy.card.jockey', 'Jockey {name}'), DAY, 'copy.card.jockey');
    rejected((r) => setAt(r, 'copy.card.jockey', 'The jockey today is {jockey}'), DAY, 'copy.card.jockey');
    rejected((r) => setAt(r, 'copy.card.stats', 'Speed {speed}  Stamina {stamina}  Kick {kick}  Extra {x}'), DAY, 'copy.card.stats');
    rejected((r) => setAt(r, 'copy.card.stats', 'Speed {speed}  Stamina {stamina}  Kick {kick}   x'), DAY, 'copy.card.stats'); // 31 with the widest real horse
    rejected((r) => setAt(r, 'copy.card.hint', 'Press Enter to pick this horse today'), DAY, 'copy.card.hint');
    rejected((r) => setAt(r, 'copy.card.lastPick', 'You picked this one in the last race'), DAY, 'copy.card.lastPick');
  });
});

describe('the paddock copy', () => {
  const KEYS = [
    'copy.paddock', 'copy.paddock.styles.closer', 'copy.paddock.postLine', 'copy.paddock.title', 'copy.paddock.labels.move', 'copy.paddock.values',
    'copy.paddock.values.early.rateEarly', 'copy.paddock.values.move.saveForStretch', 'copy.paddock.values.path.default', 'copy.paddock.go', 'copy.paddock.back',
    'copy.paddock.trainer', 'copy.paddock.trainer.early.default', 'copy.paddock.trainer.move.moveAtThreeEighths', 'copy.paddock.trainer.path.stayInside',
    'copy.paddock.trainer.go', 'copy.paddock.trainer.back',
  ];
  it.each(KEYS)('%s missing is refused', (path) => { rejected((r) => setAt(r, path, undefined), DAY, path); });

  it('a label or trainer line for a value INSTRUCTIONS does not offer is refused, and so is one missing for a value it does', () => {
    const a = fresh();
    a.raceDay.copy.paddock.values.early.shout = 'Shout';
    expect(failure(a).file).toBe(DAY);
    const b = fresh();
    b.raceDay.copy.paddock.trainer.move.charge = 'Charge';
    expect(failure(b).file).toBe(DAY);
  });

  it('a slot label is at most 5 characters (x20-59): 5 passes, 6 is refused', () => {
    accepted((r) => setAt(r, 'copy.paddock.labels.early', 'x'.repeat(5)));
    rejected((r) => setAt(r, 'copy.paddock.labels.early', 'x'.repeat(6)), DAY, 'copy.paddock.labels.early');
  });

  it('an order value is at most 16 characters (x84-211): 16 passes, 17 is refused, naming the value', () => {
    accepted((r) => setAt(r, 'copy.paddock.values.move.saveForStretch', 'x'.repeat(16)));
    rejected((r) => setAt(r, 'copy.paddock.values.move.saveForStretch', 'x'.repeat(17)), DAY, 'copy.paddock.values.move.saveForStretch');
  });

  it('Go to the post and Back to card fit 28 characters', () => {
    accepted((r) => setAt(r, 'copy.paddock.go', 'x'.repeat(28)));
    rejected((r) => setAt(r, 'copy.paddock.go', 'x'.repeat(29)), DAY, 'copy.paddock.go');
    rejected((r) => setAt(r, 'copy.paddock.back', 'x'.repeat(29)), DAY, 'copy.paddock.back');
  });

  it('the post line "{style}, post {n}" fits with the longest style word, and takes only its holes', () => {
    rejected((r) => setAt(r, 'copy.paddock.postLine', '{style}, post {post}, a long way from the rail'), DAY, 'copy.paddock.postLine');
    rejected((r) => setAt(r, 'copy.paddock.postLine', '{horse}, post {post}'), DAY, 'copy.paddock.postLine');
  });

  it('a trainer line wraps into at most 3 lines of 28: 3 lines pass, 4 are refused', () => {
    const w = (n: number) => Array.from({ length: n }, () => 'x'.repeat(13)).join(' '); // two 13-letter words fit a line of 27
    accepted((r) => setAt(r, 'copy.paddock.trainer.go', w(6))); // 3 lines
    const err = rejected((r) => setAt(r, 'copy.paddock.trainer.go', w(7)), DAY, 'copy.paddock.trainer.go'); // 4 lines
    expect(err.issues.find((i) => i.path === 'copy.paddock.trainer.go')!.message).toMatch(/wraps to 4 lines/);
    rejected((r) => setAt(r, 'copy.paddock.trainer.early.rateEarly', 'Take a hold early and let all the speed horses argue it out up front while you wait patiently, please.'), DAY, 'copy.paddock.trainer.early.rateEarly');
  });

  it('a single word longer than 28 characters cannot wrap and is refused', () => {
    rejected((r) => setAt(r, 'copy.paddock.trainer.back', 'x'.repeat(29)), DAY, 'copy.paddock.trainer.back');
    accepted((r) => setAt(r, 'copy.paddock.trainer.back', 'x'.repeat(28)));
  });

  it('the shipped trainer lines wrap into 3 lines or fewer', () => {
    for (const [slot, lines] of Object.entries(raceDayJson.copy.paddock.trainer)) {
      for (const line of typeof lines === 'string' ? [lines] : Object.values(lines)) {
        const words = line.split(' ');
        let rows = 1;
        let cur = 0;
        for (const word of words) {
          if (cur === 0) cur = word.length;
          else if (cur + 1 + word.length <= 28) cur += 1 + word.length;
          else { rows++; cur = word.length; }
        }
        expect(rows, `${slot}: ${line}`).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe('the three paddock slots: art.paddock.trainer (16x24, 2 frames), art.paddock.ground and art.paddock.rail (16x16)', () => {
  const NEW = [
    { id: 'art.paddock.trainer', w: 16, h: 24, frames: 2, file: 'public/assets/art/paddock/trainer.png', sheet: [32, 24] },
    { id: 'art.paddock.ground', w: 16, h: 16, frames: 1, file: 'public/assets/art/paddock/ground.png', sheet: [16, 16] },
    { id: 'art.paddock.rail', w: 16, h: 16, frames: 1, file: 'public/assets/art/paddock/rail.png', sheet: [16, 16] },
  ];
  const slotOf = (id: string) => slotsJson.slots.find((x) => x.id === id) as Record<string, unknown> | undefined;

  it.each(NEW)('$id is in the needed list', ({ id }) => {
    expect(neededSlotIds({ surface: 'dirt', going: 'fast' })).toContain(id);
  });

  it.each(NEW)('$id is in slots.json at its size and frame count, as final art', ({ id, w, h, frames }) => {
    const s = slotOf(id)!;
    expect(s, id).toBeDefined();
    expect([s.frameWidth, s.frameHeight, s.frames]).toEqual([w, h, frames]);
    expect(s.placeholder).toBe(false);
    expect(s.file).toMatch(/\.png$/);
  });

  it.each(NEW)('$id: the file is a PNG exactly the sheet\'s size', ({ id, file, sheet }) => {
    const s = slotOf(id)!;
    expect(`public/${s.file}`).toBe(file);
    const buf = readFileSync(new URL(`../../${file}`, import.meta.url));
    expect(buf.subarray(1, 4).toString()).toBe('PNG');
    expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual(sheet);
  });

  it.each(NEW)('the loader refuses a slots.json without $id, naming the file and the slot', ({ id }) => {
    const raw = fresh();
    raw.slots.slots = raw.slots.slots.filter((x: { id: string }) => x.id !== id);
    const err = failure(raw);
    expect(err.file).toBe(SLOTS);
    expect(err.message).toContain(id);
  });
});
