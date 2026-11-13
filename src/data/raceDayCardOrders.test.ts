/// <reference types="vite/client" />
import { readFileSync, readdirSync } from 'node:fs';
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
    'copy.card.bias.styleShort.speed',
    // Rewritten on purpose (spec 4.1, program page): the detail box's jockey, stats, hint and lastPick
    // lines are gone with the box. Their successors are the three column heads and the footer's "{jockey} up".
    'copy.card.heads', 'copy.card.heads.speed', 'copy.card.heads.stamina', 'copy.card.heads.kick', 'copy.card.jockeyUp',
  ];
  it.each(KEYS)('%s missing is refused', (path) => { rejected((r) => setAt(r, path, undefined), DAY, path); });

  it('empty text and a number are refused', () => {
    rejected((r) => setAt(r, 'copy.card.heads.speed', ' '), DAY, 'copy.card.heads.speed');
    rejected((r) => setAt(r, 'copy.card.heads.kick', ''), DAY, 'copy.card.heads.kick');
    rejected((r) => setAt(r, 'copy.card.jockeyUp', 3), DAY, 'copy.card.jockeyUp');
    rejected((r) => setAt(r, 'copy.card.jockeyUp', ' {jockey} up'), DAY, 'copy.card.jockeyUp');
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

  // Column heads sit over their stat columns (spec 4.1): "Speed" from x40 and "Stamina" from x108 must
  // end before the next head starts (8 cells each), "Kick" from x176 must end by x247 (9 cells).
  it('the column heads fit their columns: Speed 8 characters, Stamina 8, Kick 9; one more is refused', () => {
    accepted((r) => setAt(r, 'copy.card.heads.speed', 'x'.repeat(8)));
    rejected((r) => setAt(r, 'copy.card.heads.speed', 'x'.repeat(9)), DAY, 'copy.card.heads.speed');
    accepted((r) => setAt(r, 'copy.card.heads.stamina', 'x'.repeat(8)));
    rejected((r) => setAt(r, 'copy.card.heads.stamina', 'x'.repeat(9)), DAY, 'copy.card.heads.stamina');
    accepted((r) => setAt(r, 'copy.card.heads.kick', 'x'.repeat(9)));
    rejected((r) => setAt(r, 'copy.card.heads.kick', 'x'.repeat(10)), DAY, 'copy.card.heads.kick');
  });

  it('a column head takes no holes', () => {
    const err = rejected((r) => setAt(r, 'copy.card.heads.speed', 'Speed {n}'), DAY, 'copy.card.heads.speed');
    expect(err.issues.find((i) => i.path === 'copy.card.heads.speed')!.message).toMatch(/not allowed/);
  });

  it('an unknown column head is refused', () => {
    const raw = fresh();
    raw.raceDay.copy.card.heads.total = 'Total';
    expect(failure(raw).message).toContain('total');
  });

  it('"{jockey} up" fits x8-207 with a 22-character jockey: 25 characters pass, 26 are refused', () => {
    accepted((r) => setAt(r, 'copy.card.jockeyUp', '{jockey} up'));
    rejected((r) => setAt(r, 'copy.card.jockeyUp', '{jockey} up!'), DAY, 'copy.card.jockeyUp');
    rejected((r) => setAt(r, 'copy.card.jockeyUp', 'Rider {jockey} up'), DAY, 'copy.card.jockeyUp');
  });

  it('the footer template takes only {jockey}: an unknown hole is refused, naming it', () => {
    for (const bad of ['{name} up', '{jockey} up on {horse}', '{post} {jockey}']) {
      const err = rejected((r) => setAt(r, 'copy.card.jockeyUp', bad), DAY, 'copy.card.jockeyUp');
      expect(err.issues.find((i) => i.path === 'copy.card.jockeyUp')!.message).toMatch(/not allowed/);
    }
  });

  it('the detail box\'s copy is gone: the shipped file has no card.jockey, stats, hint or lastPick, and the schema refuses them back', () => {
    for (const k of ['jockey', 'stats', 'hint', 'lastPick']) {
      expect(Object.keys(raceDayJson.copy.card), k).not.toContain(k);
      const raw = fresh();
      raw.raceDay.copy.card[k] = 'x';
      expect(failure(raw).message, k).toContain(k);
    }
  });

  it('the shipped heads and footer are the spec\'s words', () => {
    expect(raceDayJson.copy.card.heads).toEqual({ speed: 'Speed', stamina: 'Stamina', kick: 'Kick' });
    expect(raceDayJson.copy.card.jockeyUp).toBe('{jockey} up');
  });
});

describe('a card stat prints in two small-font digits, so a stat over 99 is refused at boot, naming the horse', () => {
  const statFailure = (idx: number, key: 'speed' | 'stamina' | 'kick', value: number) => {
    const g = game();
    g.card.horses[idx].stats[key] = value;
    return failure(fresh(), g);
  };

  it.each(['speed', 'stamina', 'kick'] as const)('%s at 100 is refused: src/data/card.json, horses[i].stats.%s, with the value', (key) => {
    for (const idx of [0, 4, 7]) {
      const err = statFailure(idx, key, 100);
      expect(err.file).toBe('src/data/card.json');
      const path = `horses[${idx}].stats.${key}`;
      expect(err.issues.map((i) => i.path)).toContain(path);
      expect(err.message).toContain(path);
      expect(err.issues.find((i) => i.path === path)!.message).toContain('100');
      expect(err.issues.find((i) => i.path === path)!.message).toMatch(/99/);
    }
  });

  it('99 passes, and so does 10; 100 and 150 are refused', () => {
    for (const ok of [99, 10]) {
      const g = game();
      for (const h of g.card.horses) h.stats = { speed: ok, stamina: ok, kick: ok };
      expect(() => validateRaceDay(fresh(), g), String(ok)).not.toThrow();
    }
    expect(statFailure(2, 'speed', 150).file).toBe('src/data/card.json');
  });

  it('only the horse over the limit is named', () => {
    const err = statFailure(3, 'stamina', 120);
    expect(err.issues.map((i) => i.path)).toEqual(['horses[3].stats.stamina']);
  });

  it('every shipped stat fits two digits', () => {
    for (const h of game().card.horses) for (const v of Object.values(h.stats)) expect(v).toBeLessThanOrEqual(99);
  });
});

describe('the paddock copy', () => {
  const KEYS = [
    // Rewritten on purpose (spec 4.2): "Stalker, post 8" is gone, so copy.paddock.styles and postLine are not required any more.
    'copy.paddock', 'copy.paddock.title', 'copy.paddock.labels.move', 'copy.paddock.values',
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

  // Removed on purpose (spec 4.2): "the style is in the entry and the post is the saddlecloth number", so
  // the post line template and the spelled-out style words are no longer data. This asserts the removal.
  it('the post line and the paddock\'s own style words are gone: the shipped file has neither, and the schema refuses them back', () => {
    expect(Object.keys(raceDayJson.copy.paddock)).not.toContain('postLine');
    expect(Object.keys(raceDayJson.copy.paddock)).not.toContain('styles');
    const a = fresh();
    a.raceDay.copy.paddock.postLine = '{style}, post {post}';
    expect(failure(a).message).toContain('postLine');
    const b = fresh();
    b.raceDay.copy.paddock.styles = { frontRunner: 'Front-runner', stalker: 'Stalker', closer: 'Closer' };
    expect(failure(b).message).toContain('styles');
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

// A bad value inside a band or a list is named at the element ("...leftSteps[2]"), so the path is matched by its start.
function refusedUnder(edit: (r: Raw) => void, file: string, path: string): DataError {
  const raw = fresh();
  edit(raw);
  const err = failure(raw);
  expect(err.file).toBe(file);
  expect(err.issues.some((i) => i.path === path || i.path.startsWith(`${path}[`) || i.path.startsWith(`${path}.`)), `${path} in ${JSON.stringify(err.issues.map((i) => i.path))}`).toBe(true);
  expect(err.message).toContain(file);
  expect(err.message).toContain(path);
  return err;
}

describe('the program block: the highlighter bands and the pick\'s swipe (DESIGN Program pages)', () => {
  const BANDS = ['program.entryBand', 'program.resultBand'] as const;

  it('the shipped values are DESIGN\'s: entry x16-250 over 19 rows, result x5-250 over 10, chisel 3, 2, 1, 0 in and 0, 1, 2, 3 in; swipe to x132 for 0.1 s then 0.25 s', () => {
    const p = raceDayJson.program;
    expect(p.entryBand.value).toEqual({ x0: 16, x1: 250, rows: 19, leftSteps: [3, 2, 1, 0], rightSteps: [0, 1, 2, 3] });
    expect(p.resultBand.value).toEqual({ x0: 5, x1: 250, rows: 10, leftSteps: [3, 2, 1, 0], rightSteps: [0, 1, 2, 3] });
    expect(p.swipeHalfX1.value).toBe(132);
    expect(p.swipeFrame1Seconds.value).toBe(0.1);
    expect(p.swipeFrame2Seconds.value).toBe(0.25);
  });

  it.each(['program', ...BANDS, 'program.swipeHalfX1', 'program.swipeFrame1Seconds', 'program.swipeFrame2Seconds'])('%s missing is refused', (path) => {
    refusedUnder((r) => setAt(r, path, undefined), DAY, path);
  });

  it.each(BANDS)('%s: every field is required and typed', (band) => {
    for (const k of ['x0', 'x1', 'rows', 'leftSteps', 'rightSteps']) refusedUnder((r) => setAt(r, `${band}.value.${k}`, undefined), DAY, `${band}.value.${k}`);
    for (const k of ['x0', 'x1', 'rows']) {
      for (const bad of ['16', null, [16], 16.5]) refusedUnder((r) => setAt(r, `${band}.value.${k}`, bad), DAY, `${band}.value.${k}`);
    }
    for (const k of ['leftSteps', 'rightSteps']) {
      for (const bad of [3, '3,2,1,0', ['3', 2, 1, 0], [3, 2, 1, 0.5]]) refusedUnder((r) => setAt(r, `${band}.value.${k}`, bad), DAY, `${band}.value.${k}`);
    }
  });

  it.each(BANDS)('%s: x0 and x1 are columns on the 256 px screen, 0 to 255', (band) => {
    refusedUnder((r) => setAt(r, `${band}.value.x0`, -1), DAY, `${band}.value.x0`);
    refusedUnder((r) => setAt(r, `${band}.value.x1`, 256), DAY, `${band}.value.x1`);
    refusedUnder((r) => setAt(r, `${band}.value.x1`, -3), DAY, `${band}.value.x1`);
    accepted((r) => setAt(r, `${band}.value.x0`, 0));
    accepted((r) => setAt(r, `${band}.value.x1`, 255));
  });

  it.each(BANDS)('%s: the rows split into four groups, so at least 4 rows: 4 passes, 3, 0 and -19 are refused', (band) => {
    accepted((r) => setAt(r, `${band}.value.rows`, 4));
    for (const bad of [3, 0, -19]) refusedUnder((r) => setAt(r, `${band}.value.rows`, bad), DAY, `${band}.value.rows`);
  });

  it.each(BANDS)('%s: the chisel lists have exactly 4 steps, whole numbers of 0 or more', (band) => {
    for (const k of ['leftSteps', 'rightSteps']) {
      for (const bad of [[], [1], [3, 2, 1], [3, 2, 1, 0, 0]]) refusedUnder((r) => setAt(r, `${band}.value.${k}`, bad), DAY, `${band}.value.${k}`);
      refusedUnder((r) => setAt(r, `${band}.value.${k}`, [3, 2, -1, 0]), DAY, `${band}.value.${k}`);
      accepted((r) => setAt(r, `${band}.value.${k}`, [0, 0, 0, 0]));
    }
  });

  it.each(BANDS)('%s: the chiseled ends must leave a column between them, or the band is refused', (band) => {
    // x0 + the biggest left step must stay clear of x1 - the biggest right step.
    const set = (x0: number, x1: number, left: number[], right: number[]) => (r: Raw) => {
      setAt(r, `${band}.value.x0`, x0); setAt(r, `${band}.value.x1`, x1);
      setAt(r, `${band}.value.leftSteps`, left); setAt(r, `${band}.value.rightSteps`, right);
    };
    accepted(set(16, 250, [3, 2, 1, 0], [0, 1, 2, 3]));
    accepted(set(100, 110, [3, 2, 1, 0], [0, 1, 2, 3])); // 103 and 107: columns 104 to 106 are between
    // Ends that meet or cross.
    for (const edit of [
      set(100, 100, [0, 0, 0, 0], [0, 0, 0, 0]), // a band one column wide has no column between
      set(100, 90, [0, 0, 0, 0], [0, 0, 0, 0]), // x1 left of x0
      set(100, 104, [3, 2, 1, 0], [0, 1, 2, 3]), // 103 against 101
      set(100, 106, [3, 2, 1, 0], [0, 1, 2, 3]), // 103 against 103
      set(16, 250, [0, 0, 0, 120], [0, 0, 0, 120]), // the steps eat the whole band
      set(16, 250, [240, 0, 0, 0], [0, 0, 0, 0]), // a left step past the far end
    ]) {
      const raw = fresh();
      edit(raw);
      const err = failure(raw);
      expect(err.file).toBe(DAY);
      expect(err.message).toContain(band);
      expect(err.message).toMatch(/column/);
    }
  });

  it('swipeHalfX1 is a column on the screen: 0 and 255 pass; -1, 256, 132.5 and "132" are refused', () => {
    accepted((r) => setAt(r, 'program.swipeHalfX1.value', 0));
    accepted((r) => setAt(r, 'program.swipeHalfX1.value', 255));
    for (const bad of [-1, 256, 132.5, '132', null]) refusedUnder((r) => setAt(r, 'program.swipeHalfX1.value', bad), DAY, 'program.swipeHalfX1');
  });

  it.each(['program.swipeFrame1Seconds', 'program.swipeFrame2Seconds'])('%s is positive seconds: 0, negative and a string are refused', (path) => {
    accepted((r) => setAt(r, `${path}.value`, 0.5));
    for (const bad of [0, -0.1, '0.1', null, [0.1]]) refusedUnder((r) => setAt(r, `${path}.value`, bad), DAY, path);
  });

  it('a status that is neither starting guess nor confirmed, and an unknown field, are refused', () => {
    refusedUnder((r) => { r.raceDay.program.entryBand.status = 'maybe'; }, DAY, 'program.entryBand.status');
    refusedUnder((r) => { r.raceDay.program.swipeHalfX1.status = 'maybe'; }, DAY, 'program.swipeHalfX1.status');
    const a = fresh();
    a.raceDay.program.entryBand.value.slant = 1;
    expect(failure(a).message).toContain('slant');
    const b = fresh();
    b.raceDay.program.staple = { value: 1, status: 'starting guess' };
    expect(failure(b).message).toContain('staple');
  });

  it('the band shape is data: the shipped files load with it, and a change reaches the loaded values', () => {
    const raw = fresh();
    raw.raceDay.program.entryBand.value.x1 = 240;
    expect(validateRaceDay(raw, game()).raceDay.program.entryBand.value.x1).toBe(240);
  });
});

describe('art.ui.mark.pick, the pencil tick: 8x8 final art, in the needed list', () => {
  const ID = 'art.ui.mark.pick';
  const slotOf = (id: string) => slotsJson.slots.find((x) => x.id === id) as Record<string, unknown> | undefined;

  it('is in the needed list', () => {
    expect(neededSlotIds({ surface: 'dirt', going: 'fast' })).toContain(ID);
  });

  it('is in slots.json at 8x8, one frame, as final art (not a placeholder) with a PNG file', () => {
    const s = slotOf(ID)!;
    expect(s).toBeDefined();
    expect([s.frameWidth, s.frameHeight, s.frames]).toEqual([8, 8, 1]);
    expect(s.placeholder).toBe(false);
    expect(s.file).toMatch(/\.png$/);
  });

  it('its file is a PNG exactly 8x8', () => {
    const file = `public/${slotOf(ID)!.file}`;
    const buf = readFileSync(new URL(`../../${file}`, import.meta.url));
    expect(buf.subarray(1, 4).toString()).toBe('PNG');
    expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([8, 8]);
  });

  it('the loader refuses a slots.json without it, naming the file and the slot', () => {
    const raw = fresh();
    raw.slots.slots = raw.slots.slots.filter((x: { id: string }) => x.id !== ID);
    const err = failure(raw);
    expect(err.file).toBe(SLOTS);
    expect(err.message).toContain(ID);
  });

  it('the loader refuses it as a stand-in with no file, so the release check cannot pass one', () => {
    const raw = fresh();
    const slot = raw.slots.slots.find((x: { id: string }) => x.id === ID);
    slot.file = null;
    const err = failure(raw);
    expect(err.file).toBe(SLOTS);
  });
});

describe('no staples: the art-director dropped them, so no slot or file exists for one', () => {
  it('slots.json has no slot with "staple" in its id or file, and the needed list has none', () => {
    for (const s of slotsJson.slots as { id: string; file: string | null }[]) {
      expect(s.id.toLowerCase()).not.toContain('staple');
      expect((s.file ?? '').toLowerCase()).not.toContain('staple');
    }
    for (const id of neededSlotIds({ surface: 'dirt', going: 'fast' })) expect(id.toLowerCase()).not.toContain('staple');
  });

  it('no file under public/assets is named for a staple', () => {
    const files = readdirSync(new URL('../../public/assets', import.meta.url), { recursive: true }) as string[];
    expect(files.length).toBeGreaterThan(10);
    expect(files.filter((f) => /staple/i.test(String(f)))).toEqual([]);
  });

  it('the raceDay data has no staple field anywhere', () => {
    expect(JSON.stringify(raceDayJson).toLowerCase()).not.toContain('staple');
  });
});
