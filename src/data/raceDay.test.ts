/// <reference types="vite/client" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import cardJson from './card.json';
import cardLookJson from './cardLook.json';
import paletteJson from './palette.json';
import raceDayJson from './raceDay.json';
import raceJson from './race.json';
import slotsJson from './slots.json';
import trackJson from './track.json';
import tuningJson from './tuning.json';
import { loadData } from './load';
import { loadRaceDay, validateRaceDay } from './raceDayLoad';
import { fillTemplate, templateHoles } from './template';
import { DataError, validateData } from './validate';
import { MAX_NAME_LENGTH, type GameData } from './schema';
import { neededSlotIds, sequenceSeconds } from './raceDaySchema';

// Loaders for the race-day files (spec section 13, "Decided", and 4.1, 4.3): raceDay.json,
// slots.json, cardLook.json and palette.json. Each broken file must be rejected with the
// file and the field in the message. The palette is checked against DESIGN.md.

type Raw = { palette: any; slots: any; cardLook: any; raceDay: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const fresh = (): Raw => structuredClone({ palette: paletteJson, slots: slotsJson, cardLook: cardLookJson, raceDay: raceDayJson });
const game = (): GameData => structuredClone(loadData());

function failure(raw: Raw, g: GameData = game()): DataError {
  try {
    validateRaceDay(raw, g);
  } catch (e) {
    expect(e).toBeInstanceOf(DataError);
    return e as DataError;
  }
  throw new Error('validation passed but should have been rejected');
}

/** Rejected, and the message a person reads names the file and the field. */
function expectRejected(raw: Raw, file: string, path: string, g?: GameData): DataError {
  const err = failure(raw, g);
  expect(err.file).toBe(file);
  expect(err.issues.map((i) => i.path)).toContain(path);
  expect(err.message).toContain(file);
  expect(err.message).toContain(path);
  return err;
}

const F = {
  palette: 'src/data/palette.json',
  slots: 'src/data/slots.json',
  look: 'src/data/cardLook.json',
  day: 'src/data/raceDay.json',
  card: 'src/data/card.json',
  race: 'src/data/race.json',
  track: 'src/data/track.json',
};

describe('the shipped race-day files load', () => {
  it('validateRaceDay accepts the shipped files, and loadRaceDay reads them', () => {
    expect(() => validateRaceDay(fresh(), game())).not.toThrow();
    const d = loadRaceDay(loadData());
    expect(d.palette.colors).toHaveLength(42);
    expect(d.slots.slots.length).toBeGreaterThan(20);
    expect(Object.keys(d.cardLook)).toHaveLength(8);
    expect(d.raceDay.view.pxPerFoot.value).toBe(4);
  });

  it('every look is for a horse on the card and the card has a look for every horse', () => {
    const ids = cardJson.horses.map((h) => h.id).sort();
    expect(Object.keys(cardLookJson).sort()).toEqual(ids);
  });

  it('no two horses on the shipped card share a silks body color', () => {
    const bodies = Object.values(cardLookJson).map((l) => l.silks.body);
    expect(new Set(bodies).size).toBe(bodies.length);
  });

  it('the shipped race, track and horse names are inside their caps (30, 30, 22, 18)', () => {
    expect(raceJson.name.length).toBeLessThanOrEqual(30);
    expect(raceJson.track.length).toBeLessThanOrEqual(30);
    expect(trackJson.name.length).toBeLessThanOrEqual(30);
    for (const h of cardJson.horses) {
      expect(h.jockey.length).toBeLessThanOrEqual(22);
      expect(h.name.length).toBeLessThanOrEqual(18);
    }
  });
});

describe('the palette is the master palette of DESIGN.md', () => {
  const design = readFileSync(new URL('../../DESIGN.md', import.meta.url), 'utf8');
  const rows = [...design.matchAll(/^\| ([A-Z]\d+) \| ([^|]+?) \| (#[0-9A-F]{6}) \|/gm)].map((m) => ({ id: m[1], name: m[2], hex: m[3] }));
  const band = (label: string) => /^- [A-Za-z]+: (.*)$/m.exec(design.split(`- ${label}: `).length > 1 ? `- ${label}: ${design.split(`- ${label}: `)[1].split('\n')[0]}` : '')![1].split(', ');

  it('DESIGN.md lists 42 colors', () => {
    expect(rows).toHaveLength(42);
  });

  it('palette.json has the same 42 ids, names and hex values, nothing else', () => {
    expect(paletteJson.colors).toEqual(rows);
  });

  it('the silks value bands are DESIGN.md\'s: 6 dark, 6 mid, 6 light, 18 in all', () => {
    expect(paletteJson.silksBands.dark).toEqual(band('Dark'));
    expect(paletteJson.silksBands.mid).toEqual(band('Mid'));
    expect(paletteJson.silksBands.light).toEqual(band('Light'));
    const all = [...paletteJson.silksBands.dark, ...paletteJson.silksBands.mid, ...paletteJson.silksBands.light];
    expect(new Set(all).size).toBe(18);
  });

  it('every shipped color name in raceDay.json and cardLook.json is a palette name', () => {
    const names = new Set(rows.map((r) => r.name));
    const used: string[] = [
      ...Object.values(raceDayJson.poleBands.value),
      ...raceDayJson.saddlecloths.value.flatMap((s) => [s.fill, s.number]),
      ...Object.values(raceDayJson.coats).flatMap((c) => [c.base, c.second]),
      ...Object.values(cardLookJson).flatMap((l) => [l.silks.body, l.silks.cap]),
    ];
    for (const n of used) expect(names.has(n), n).toBe(true);
  });
});

describe('palette.json is rejected when broken', () => {
  it('a missing field', () => {
    const raw = fresh();
    delete raw.palette.colors[0].hex;
    expectRejected(raw, F.palette, 'colors[0].hex');
  });
  it('a hex value that is not #RRGGBB in capitals', () => {
    for (const bad of ['#14111c', '14111C', '#14111', '#14111CC', 'red']) {
      const raw = fresh();
      raw.palette.colors[0].hex = bad;
      expectRejected(raw, F.palette, 'colors[0].hex');
    }
  });
  it('a duplicate name, id or hex', () => {
    for (const field of ['name', 'id', 'hex']) {
      const raw = fresh();
      raw.palette.colors[1][field] = raw.palette.colors[0][field];
      expectRejected(raw, F.palette, `colors[1].${field}`);
    }
  });
  it('a silks color that is not in the palette', () => {
    const raw = fresh();
    raw.palette.silksBands.dark[0] = 'Teal';
    expectRejected(raw, F.palette, 'silksBands.dark[0]');
  });
  it('a key color that is not in the palette', () => {
    const raw = fresh();
    raw.palette.keyColors.outline = 'Teal';
    expectRejected(raw, F.palette, 'keyColors.outline');
  });
  it('a missing key colors block', () => {
    const raw = fresh();
    delete raw.palette.keyColors;
    expectRejected(raw, F.palette, 'keyColors');
  });
  it('an empty color list', () => {
    const raw = fresh();
    raw.palette.colors = [];
    expectRejected(raw, F.palette, 'colors');
  });
  it('an unknown extra field', () => {
    const raw = fresh();
    raw.palette.extra = 1;
    const err = failure(raw);
    expect(err.file).toBe(F.palette);
    expect(err.message).toContain('extra');
  });
});

describe('slots.json is rejected when broken', () => {
  const at = (raw: Raw, id: string): number => raw.slots.slots.findIndex((s: { id: string }) => s.id === id);

  it('a missing placeholder flag', () => {
    const raw = fresh();
    delete raw.slots.slots[0].placeholder;
    expectRejected(raw, F.slots, 'slots[0].placeholder');
  });
  it.each(['img.ui.x', 'Art.ui.x', 'art.ui', 'art.UI.x', 'art.ui.x y', 'art.ui.a.b.c.d'])('a slot id that breaks the naming rule: %s', (id) => {
    const raw = fresh();
    raw.slots.slots[0].id = id;
    expectRejected(raw, F.slots, 'slots[0].id');
  });
  it('a duplicate slot id', () => {
    const raw = fresh();
    raw.slots.slots[1].id = raw.slots.slots[0].id;
    expectRejected(raw, F.slots, 'slots[1].id');
  });
  it.each(['frameWidth', 'frameHeight', 'frames'])('an art slot without %s', (field) => {
    const raw = fresh();
    const i = at(raw, 'art.race.gate');
    delete raw.slots.slots[i][field];
    expectRejected(raw, F.slots, `slots[${i}].${field}`);
  });
  it('an art slot with no file', () => {
    const raw = fresh();
    const i = at(raw, 'art.race.gate');
    raw.slots.slots[i].file = null;
    expectRejected(raw, F.slots, `slots[${i}].file`);
  });
  it('an art file that is not a png', () => {
    const raw = fresh();
    const i = at(raw, 'art.race.gate');
    raw.slots.slots[i].file = 'assets/art/race/gate.ogg';
    expectRejected(raw, F.slots, `slots[${i}].file`);
  });
  it.each(['/etc/passwd.png', 'assets/../x.png', 'public/assets/x.png', 'assets/UPPER.png', 'assets/x'])('a file path outside the rule: %s', (file) => {
    const raw = fresh();
    raw.slots.slots[0].file = file;
    expectRejected(raw, F.slots, 'slots[0].file');
  });
  it('a nose column outside the frame', () => {
    const raw = fresh();
    const i = at(raw, 'art.race.horse.body.gallop');
    raw.slots.slots[i].noseX = 32;
    expectRejected(raw, F.slots, `slots[${i}].noseX`);
  });
  it('a number position list that does not match the frames', () => {
    const raw = fresh();
    const i = at(raw, 'art.race.horse.tack.gallop');
    raw.slots.slots[i].numberAt = [[1, 1]];
    expectRejected(raw, F.slots, `slots[${i}].numberAt`);
  });
  it('a zero, negative or fractional frame count or size', () => {
    for (const [field, v] of [['frames', 0], ['frames', -1], ['frames', 1.5], ['frameWidth', 0]] as const) {
      const raw = fresh();
      raw.slots.slots[0][field] = v;
      expectRejected(raw, F.slots, `slots[0].${field}`);
    }
  });
  it('a sound with no file that does not say it is a placeholder', () => {
    const raw = fresh();
    const i = at(raw, 'sfx.race.gate_open');
    raw.slots.slots[i].placeholder = false;
    expectRejected(raw, F.slots, `slots[${i}].placeholder`);
  });
  it('no slots at all', () => {
    const raw = fresh();
    raw.slots.slots = [];
    expectRejected(raw, F.slots, 'slots');
  });
  it('an unknown extra field on a slot', () => {
    const raw = fresh();
    raw.slots.slots[0].colour = 'red';
    const err = failure(raw);
    expect(err.file).toBe(F.slots);
    expect(err.message).toContain('colour');
  });
});

describe('cardLook.json is rejected when broken', () => {
  it('a missing field', () => {
    const raw = fresh();
    delete raw.cardLook.h1.silks.cap;
    expectRejected(raw, F.look, 'h1.silks.cap');
  });
  it('a missing coat', () => {
    const raw = fresh();
    delete raw.cardLook.h1.coat;
    expectRejected(raw, F.look, 'h1.coat');
  });
  it.each(['gray', 'roan', 'Bay', 'palomino', ''])('an unknown coat: "%s"', (coat) => {
    const raw = fresh();
    raw.cardLook.h1.coat = coat;
    expectRejected(raw, F.look, 'h1.coat');
  });
  it.each(['bay', 'dark bay or brown', 'chestnut', 'black'])('the coat %s is accepted', (coat) => {
    const raw = fresh();
    raw.cardLook.h1.coat = coat;
    expect(() => validateRaceDay(raw, game())).not.toThrow();
  });
  it('a horse on the card with no look entry', () => {
    const raw = fresh();
    delete raw.cardLook.h3;
    const err = expectRejected(raw, F.look, 'h3');
    expect(err.message).toMatch(/missing/);
  });
  it('a look entry for a horse that is not on the card', () => {
    const raw = fresh();
    raw.cardLook.h9 = { coat: 'bay', silks: { body: 'Ink', cap: 'Gold' } };
    const err = expectRejected(raw, F.look, 'h9');
    expect(err.message).toMatch(/not a horse on card/);
  });
  it('two horses sharing a silks body color', () => {
    const raw = fresh();
    raw.cardLook.h2.silks.body = raw.cardLook.h1.silks.body;
    const err = failure(raw);
    expect(err.file).toBe(F.look);
    expect(err.issues.some((i) => /^h[12]\.silks\.body$/.test(i.path) && /share/.test(i.message))).toBe(true);
    expect(err.message).toContain('silks.body');
  });
  it('two horses may share a cap color', () => {
    const raw = fresh();
    raw.cardLook.h2.silks.cap = raw.cardLook.h1.silks.cap;
    expect(() => validateRaceDay(raw, game())).not.toThrow();
  });
  it('a body or cap color that is a palette color but not one of the 18 silks colors', () => {
    for (const part of ['body', 'cap']) {
      const raw = fresh();
      raw.cardLook.h1.silks[part] = 'Coal';
      expectRejected(raw, F.look, `h1.silks.${part}`);
    }
  });
  it('a body or cap color that is not in the palette at all', () => {
    for (const part of ['body', 'cap']) {
      const raw = fresh();
      raw.cardLook.h1.silks[part] = 'Teal';
      expectRejected(raw, F.look, `h1.silks.${part}`);
    }
  });
  it('an unknown extra field', () => {
    const raw = fresh();
    raw.cardLook.h1.blurb = 'x';
    const err = failure(raw);
    expect(err.file).toBe(F.look);
    expect(err.message).toContain('blurb');
  });
});

describe('the card and the sim files, against the limits of the screens', () => {
  const nine = (): GameData => {
    const g = game();
    g.card.horses.push({ ...structuredClone(g.card.horses[0]), id: 'h9', name: 'Ninth Place', post: 9 });
    return g;
  };

  it('CD2: more than 8 horses fails with the file, the field and the spec words', () => {
    const err = expectRejected(fresh(), F.card, 'horses', nine());
    expect(err.message).toContain('src/data/card.json: horses: the M1 race-day screens show at most 8 horses');
  });

  it('CD2: fewer than 8 horses is fine, when the look file matches', () => {
    const g = game();
    g.card.horses = g.card.horses.slice(0, 5);
    const raw = fresh();
    const keep = new Set(g.card.horses.map((h) => h.id));
    for (const id of Object.keys(raw.cardLook)) if (!keep.has(id)) delete raw.cardLook[id];
    expect(() => validateRaceDay(raw, g)).not.toThrow();
  });

  it('a race name over 30 characters', () => {
    const g = game();
    g.race.name = 'x'.repeat(31);
    expectRejected(fresh(), F.race, 'name', g);
  });
  it('a race name of exactly 30 is fine', () => {
    const g = game();
    g.race.name = 'x'.repeat(30);
    expect(() => validateRaceDay(fresh(), g)).not.toThrow();
  });
  it('a track name over 30 characters, in the race file and in the track file', () => {
    const g = game();
    g.race.track = 'y'.repeat(31);
    expectRejected(fresh(), F.race, 'track', g);
    const g2 = game();
    g2.track.name = 'y'.repeat(31);
    expectRejected(fresh(), F.track, 'name', g2);
  });
  it('a jockey name over 22 characters, naming the horse row', () => {
    const g = game();
    g.card.horses[3].jockey = 'j'.repeat(23);
    expectRejected(fresh(), F.card, 'horses[3].jockey', g);
  });
  it('a jockey name of exactly 22 is fine', () => {
    const g = game();
    g.card.horses[3].jockey = 'j'.repeat(22);
    expect(() => validateRaceDay(fresh(), g)).not.toThrow();
  });
  it('a horse name over 18 characters is refused by the card loader, file and field named', () => {
    const raw = structuredClone({ track: trackJson, race: raceJson, card: cardJson, tuning: tuningJson }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    raw.card.horses[0].name = 'n'.repeat(MAX_NAME_LENGTH + 1);
    let err: unknown;
    try { validateData(raw); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(DataError);
    expect((err as DataError).file).toBe(F.card);
    expect((err as DataError).message).toContain('horses[0].name');
  });
});

describe('raceDay.json is rejected when broken', () => {
  it('a missing view value', () => {
    const raw = fresh();
    delete raw.raceDay.view.pxPerFoot;
    expectRejected(raw, F.day, 'view.pxPerFoot');
  });
  it('a missing section', () => {
    for (const section of ['playback', 'beats', 'hud', 'copy', 'coats', 'poleBands', 'saddlecloths']) {
      const raw = fresh();
      delete raw.raceDay[section];
      expectRejected(raw, F.day, section);
    }
  });
  it('a missing announcer variant list and a missing pace list', () => {
    let raw = fresh();
    delete raw.raceDay.copy.calls.home;
    expectRejected(raw, F.day, 'copy.calls.home');
    raw = fresh();
    delete raw.raceDay.copy.calls.pace.hot;
    expectRejected(raw, F.day, 'copy.calls.pace.hot');
  });
  it('a key with no variants at all', () => {
    const raw = fresh();
    raw.raceDay.copy.calls.gate = [];
    expectRejected(raw, F.day, 'copy.calls.gate');
  });
  it.each([
    ['view.hoofBaseY.value', 240],
    ['view.hoofBaseY.value', -1],
    ['view.leaderScreenX.value', 256],
    ['view.stridePhasePerPost.value', 1.5],
    ['view.stridePhasePerPost.value', -0.1],
    ['view.pxPerFoot.value', 0],
    ['view.pxPerFoot.value', 4.5],
    ['view.pxPerLane.value', -4],
    ['view.finalBlendSeconds.value', 0],
    ['view.farParallaxDivisor.value', 0],
    ['playback.speed.value', 0],
    ['playback.speed.value', -2],
    ['playback.maxFrameMs.value', 0],
    ['beats.pickSeconds.value', -1],
    ['hud.messageSeconds.value', 0],
    ['hud.typeCharsPerSecond.value', 0],
    ['hud.typeUntilFurlongsToGo.value', 1.5],
    ['hud.stripHysteresisLengths.value', -0.1],
  ] as const)('%s = %s is out of range', (path, value) => {
    const raw = fresh();
    const keys = path.split('.');
    let o = raw.raceDay;
    for (const k of keys.slice(0, -1)) o = o[k];
    o[keys[keys.length - 1]] = value;
    expectRejected(raw, F.day, path);
  });
  it('a number given as text', () => {
    const raw = fresh();
    raw.raceDay.view.pxPerFoot.value = '4';
    expectRejected(raw, F.day, 'view.pxPerFoot.value');
  });
  it('a status that is neither starting guess nor confirmed', () => {
    const raw = fresh();
    raw.raceDay.view.pxPerFoot.status = 'probably';
    expectRejected(raw, F.day, 'view.pxPerFoot.status');
  });
  it('an unknown extra field, at the top, in the view, and in the copy', () => {
    for (const where of [[], ['view'], ['copy'], ['copy', 'messages']]) {
      const raw = fresh();
      let o = raw.raceDay;
      for (const k of where) o = o[k];
      o.surprise = 1;
      const err = failure(raw);
      expect(err.file).toBe(F.day);
      expect(err.message).toContain('surprise');
    }
  });
  it('an order word for a value that does not exist, or a copy line for "default"', () => {
    let raw = fresh();
    raw.raceDay.copy.orders.early.shout = 'Shout';
    expect(failure(raw).file).toBe(F.day);
    raw = fresh();
    raw.raceDay.copy.orders.move.default = 'Rider';
    expect(failure(raw).file).toBe(F.day);
  });
  it('an order word missing for a value INSTRUCTIONS offers', () => {
    const raw = fresh();
    delete raw.raceDay.copy.orders.move.saveForStretch;
    expectRejected(raw, F.day, 'copy.orders.move.saveForStretch');
  });
  it('the gate camera not matching the leader screen x', () => {
    const raw = fresh();
    raw.raceDay.view.gateScreenX.value = 190;
    expectRejected(raw, F.day, 'view.gateScreenX.value');
  });
  it('your screen x not left of the leader', () => {
    for (const x of [200, 230]) {
      const raw = fresh();
      raw.raceDay.view.playerScreenX.value = x;
      expectRejected(raw, F.day, 'view.playerScreenX.value');
    }
  });
  it('a pole band, saddlecloth or coat color that is not in the palette', () => {
    let raw = fresh();
    raw.raceDay.poleBands.value.quarter = 'Teal';
    expectRejected(raw, F.day, 'poleBands.value.quarter');
    raw = fresh();
    raw.raceDay.saddlecloths.value[2].fill = 'Teal';
    expectRejected(raw, F.day, 'saddlecloths.value[2].fill');
    raw = fresh();
    raw.raceDay.saddlecloths.value[2].number = 'Teal';
    expectRejected(raw, F.day, 'saddlecloths.value[2].number');
    raw = fresh();
    raw.raceDay.coats.bay.base = 'Teal';
    expectRejected(raw, F.day, 'coats.bay.base');
    raw = fresh();
    raw.raceDay.coats.chestnut.second = 'Teal';
    expectRejected(raw, F.day, 'coats.chestnut.second');
  });
  it('fewer saddlecloths than horses on the card', () => {
    const raw = fresh();
    raw.raceDay.saddlecloths.value = raw.raceDay.saddlecloths.value.slice(0, 7);
    expectRejected(raw, F.day, 'saddlecloths.value');
  });
  it('a coat in the look file with no colors in raceDay.json', () => {
    const raw = fresh();
    delete raw.raceDay.coats.black;
    expectRejected(raw, F.day, 'coats.black');
  });
});

describe('copy templates: overflow and unknown holes', () => {
  const bad = (edit: (raw: Raw) => void, path: string, matches?: RegExp) => {
    const raw = fresh();
    edit(raw);
    const err = expectRejected(raw, F.day, path);
    if (matches) expect(err.issues.find((i) => i.path === path)!.message).toMatch(matches);
  };

  it('a call that overflows 30 characters with an 18 character name', () => {
    bad((r) => { r.raceDay.copy.calls.leader[0] = '{leader} is leading the whole field now'; }, 'copy.calls.leader[0]', /30/);
  });
  it('a call of exactly 30 at its widest fits; 31 does not', () => {
    let raw = fresh();
    raw.raceDay.copy.calls.leader[1] = `{leader} ${'x'.repeat(11)}`;
    expect(() => validateRaceDay(raw, game())).not.toThrow();
    raw = fresh();
    raw.raceDay.copy.calls.leader[1] = `{leader} ${'x'.repeat(12)}`;
    expectRejected(raw, F.day, 'copy.calls.leader[1]');
  });
  it('a pace call that overflows with the widest half-mile time', () => {
    bad((r) => { r.raceDay.copy.calls.pace.hot[1] = 'Half in {half}, they are flying today'; }, 'copy.calls.pace.hot[1]');
  });
  it('a call with no holes that is simply too long', () => {
    bad((r) => { r.raceDay.copy.calls.gate[2] = 'All of them are in line and ready to go'; }, 'copy.calls.gate[2]');
  });
  it('a message that overflows with an 18 character name and a number', () => {
    bad((r) => { r.raceDay.copy.messages.bumped = '{name} and #{n} bump into each other'; }, 'copy.messages.bumped');
    bad((r) => { r.raceDay.copy.messages.home = '{name} comes home in {place} place'; }, 'copy.messages.home');
  });
  it('a message of exactly 30 characters at its widest fits; 31 does not', () => {
    const fits = (edit: (r: Raw) => void) => { const raw = fresh(); edit(raw); validateRaceDay(raw, game()); };
    expect(() => fits((r) => { r.raceDay.copy.messages.blocked = `{name} ${'x'.repeat(11)}`; })).not.toThrow();
    bad((r) => { r.raceDay.copy.messages.blocked = `{name} ${'x'.repeat(12)}`; }, 'copy.messages.blocked');
    expect(() => fits((r) => { r.raceDay.copy.messages.home = '{name} home in {place}'; })).not.toThrow(); // 18 + 9 + 3 = 30
    bad((r) => { r.raceDay.copy.messages.home = '{name} home in {place}!'; }, 'copy.messages.home');
    bad((r) => { r.raceDay.copy.messages.bumped = '{name} and #{n} bump!'; }, 'copy.messages.bumped');
  });
  it('a HUD line of exactly 18 characters at its widest fits; 19 does not', () => {
    const fits = (edit: (r: Raw) => void) => { const raw = fresh(); edit(raw); validateRaceDay(raw, game()); };
    expect(() => fits((r) => { r.raceDay.copy.leads = 'Leads by {margin}xxx'; })).not.toThrow(); // 9 + 6 + 3 = 18
    bad((r) => { r.raceDay.copy.leads = 'Leads by {margin}xxxx'; }, 'copy.leads');
    expect(() => fits((r) => { r.raceDay.copy.orders.allDefault = 'x'.repeat(18); })).not.toThrow();
    bad((r) => { r.raceDay.copy.orders.allDefault = 'x'.repeat(19); }, 'copy.orders.allDefault');
  });
  it('the prompts that overflow the message line', () => {
    bad((r) => { r.raceDay.copy.pickPrompt = 'Press a number key from 1 to 8 now'; }, 'copy.pickPrompt');
    bad((r) => { r.raceDay.copy.nextRace = 'Press the Enter key to run the next race'; }, 'copy.nextRace');
  });
  it('your lines overflow 18 characters', () => {
    bad((r) => { r.raceDay.copy.behind = '{place}, {margin} back and fading'; }, 'copy.behind');
    bad((r) => { r.raceDay.copy.leads = 'Leads the field by {margin}'; }, 'copy.leads');
    bad((r) => { r.raceDay.copy.beforeFirstCall = 'Starting from post {post}'; }, 'copy.beforeFirstCall');
  });
  it('orders words whose longest combination overflows 18 characters', () => {
    bad((r) => { r.raceDay.copy.orders.move.saveForStretch = 'Save it for the stretch'; }, 'copy.orders');
  });
  it('an all-default line over 18 characters', () => {
    bad((r) => { r.raceDay.copy.orders.allDefault = "Let the rider decide"; }, 'copy.orders.allDefault');
  });
  it.each([
    ['copy.calls.winner[0]', (r: Raw) => { r.raceDay.copy.calls.winner[0] = '{leader} wins it'; }],
    ['copy.calls.leader[0]', (r: Raw) => { r.raceDay.copy.calls.leader[0] = '{winner} on the lead'; }],
    ['copy.calls.gate[0]', (r: Raw) => { r.raceDay.copy.calls.gate[0] = '{leader} in the gate'; }],
    ['copy.calls.pace.hot[0]', (r: Raw) => { r.raceDay.copy.calls.pace.hot[0] = '{leader} half {half}'; }],
    ['copy.messages.blocked', (r: Raw) => { r.raceDay.copy.messages.blocked = '{horse} has no room'; }],
    ['copy.messages.backInStride', (r: Raw) => { r.raceDay.copy.messages.backInStride = '{name} back'; }],
    ['copy.messages.asked', (r: Raw) => { r.raceDay.copy.messages.asked = '{name} is asked, {n}'; }],
    ['copy.nextRace', (r: Raw) => { r.raceDay.copy.nextRace = '{name} next'; }],
    ['copy.leads', (r: Raw) => { r.raceDay.copy.leads = '{name} by {margin}'; }],
  ])('an unknown hole is refused at %s', (path, edit) => {
    bad(edit, path, /not allowed/);
  });
});

describe('template helpers', () => {
  it('templateHoles lists the {name} holes in order, repeats included', () => {
    expect(templateHoles('{name} and #{n} bump')).toEqual(['name', 'n']);
    expect(templateHoles('{a} {a}')).toEqual(['a', 'a']);
    expect(templateHoles('no holes, { braces } and {Caps}')).toEqual([]);
  });
  it('fillTemplate fills known holes, numbers included, and leaves unknown ones visible', () => {
    expect(fillTemplate('{name} and #{n} bump', { name: 'Oats', n: 7 })).toBe('Oats and #7 bump');
    expect(fillTemplate('{name} {other}', { name: 'A' })).toBe('A {other}');
    expect(fillTemplate('{n}{n}', { n: 0 })).toBe('00');
  });
});

// Step 2 data: the playback, beats, winner beat and ambient groups, the pause and 4x copy,
// the new slot fields, and the nine new slots.

describe('step 2: the shipped values are the spec\'s', () => {
  const d = raceDayJson;
  it('4x for Space, a 1 s wire hold, a 4.5 s photo, a 2.5 s winner beat, the 90 s cap (spec 3.4, 4.3)', () => {
    expect(d.playback.fastSpeed.value).toBe(4);
    expect(d.beats.wireHoldSeconds.value).toBe(1);
    expect(d.beats.photoSeconds.value).toBe(4.5);
    expect(d.beats.winnerBeatSeconds.value).toBe(2.5);
    expect(d.beats.maxSequenceSeconds.value).toBe(90);
  });
  it('the winner beat puts the frame at x112 (DESIGN Charm) and the ambient cap is 3', () => {
    expect(d.winnerBeat.frameLeft.value).toBe(112);
    expect(d.ambient.cap.value).toBe(3);
    expect(d.copy.fastTag).toBe('4x');
  });
  it('every new value is marked as a starting guess or confirmed', () => {
    for (const group of [d.winnerBeat, d.ambient]) {
      for (const v of Object.values(group)) if (v && typeof v === 'object' && 'status' in v) expect(['starting guess', 'confirmed']).toContain(v.status);
    }
  });
});

describe('step 2: raceDay.json groups are rejected when broken', () => {
  const set = (path: string, value: unknown) => {
    const raw = fresh();
    const keys = path.split('.');
    let o = raw.raceDay;
    for (const k of keys.slice(0, -1)) o = o[k];
    o[keys[keys.length - 1]] = value;
    return raw;
  };
  const del = (path: string) => {
    const raw = fresh();
    const keys = path.split('.');
    let o = raw.raceDay;
    for (const k of keys.slice(0, -1)) o = o[k];
    delete o[keys[keys.length - 1]];
    return raw;
  };

  it.each([
    'playback.fastSpeed', 'beats.photoSeconds', 'beats.winnerBeatSeconds', 'beats.maxSequenceSeconds',
    'winnerBeat', 'winnerBeat.frameLeft', 'winnerBeat.slowSeconds', 'winnerBeat.walkPxPerSecond', 'winnerBeat.walkStrideFeet',
    'ambient', 'ambient.cap', 'ambient.order', 'ambient.fromEighthPole', 'ambient.crowdSwapsPerSecond', 'ambient.crowdStretchSwapsPerSecond',
    'ambient.flagSwapsPerSecond', 'ambient.cursorSwapsPerSecond', 'copy.fastTag', 'copy.pause', 'copy.pause.title', 'copy.pause.resume', 'copy.pause.back',
  ])('a missing %s', (path) => {
    expectRejected(del(path), F.day, path);
  });

  it.each([
    ['playback.fastSpeed.value', 0], ['playback.fastSpeed.value', -4], ['playback.fastSpeed.value', '4'],
    ['beats.photoSeconds.value', -1], ['beats.winnerBeatSeconds.value', -0.5], ['beats.maxSequenceSeconds.value', 0],
    ['beats.winnerBeatSeconds.value', 'long'],
    ['winnerBeat.frameLeft.value', 256], ['winnerBeat.frameLeft.value', -1], ['winnerBeat.frameLeft.value', 112.5],
    ['winnerBeat.slowSeconds.value', 0], ['winnerBeat.walkPxPerSecond.value', 0], ['winnerBeat.walkStrideFeet.value', -6],
    ['ambient.cap.value', -1], ['ambient.cap.value', 1.5], ['ambient.cap.value', '3'],
    ['ambient.crowdSwapsPerSecond.value', 0], ['ambient.crowdSwapsPerSecond.value', 4.5],
    ['ambient.crowdStretchSwapsPerSecond.value', 4.01], ['ambient.flagSwapsPerSecond.value', 5], ['ambient.cursorSwapsPerSecond.value', 8],
    ['winnerBeat.slowSeconds.status', 'maybe'],
  ] as const)('%s = %j is rejected', (path, value) => {
    expectRejected(set(path, value), F.day, path);
  });

  it('swap rates of exactly 4 a second are accepted; the limit is "at most 4"', () => {
    const raw = fresh();
    raw.raceDay.ambient.flagSwapsPerSecond.value = 4;
    expect(() => validateRaceDay(raw, game())).not.toThrow();
  });

  it('an unknown ambient item in order or fromEighthPole', () => {
    expectRejected(set('ambient.order', ['crowd', 'birds']), F.day, 'ambient.order[1]');
    expectRejected(set('ambient.fromEighthPole', ['birds']), F.day, 'ambient.fromEighthPole[0]');
    expectRejected(set('ambient.order', []), F.day, 'ambient.order');
  });

  it('a fromEighthPole item that is not in order is refused by the loader, naming the field', () => {
    expectRejected(set('ambient.order', ['flag']), F.day, 'ambient.fromEighthPole');
  });

  it('the 4x tag must fit its 2 characters, and the pause words their box', () => {
    expectRejected(set('copy.fastTag', '4x!'), F.day, 'copy.fastTag');
    expectRejected(set('copy.pause.title', 'Paused for now!'), F.day, 'copy.pause.title');
    expectRejected(set('copy.pause.back', 'Back to the card'), F.day, 'copy.pause.back');
    const ok = fresh();
    ok.raceDay.copy.pause.back = 'x'.repeat(12);
    ok.raceDay.copy.fastTag = '4x';
    expect(() => validateRaceDay(ok, game())).not.toThrow();
    expectRejected(set('copy.pause.back', 'x'.repeat(13)), F.day, 'copy.pause.back');
    expectRejected(set('copy.fastTag', '4xx'), F.day, 'copy.fastTag');
  });
});

describe('RV11: the loader rejects a sequence over the cap, naming the file and field', () => {
  const edit = (f: (r: Raw) => void) => { const raw = fresh(); f(raw); return raw; };
  const slowest = 125; // the sim's winning-time band tops out at 2:05.00

  it('RV11: the shipped sequence for a 2:05.00 winner with a photo fits', () => {
    expect(game().tuning.checks.winningTimeBandSeconds.value.max).toBe(slowest);
    expect(sequenceSeconds(raceDayJson as never, slowest, true)).toBeLessThanOrEqual(90);
  });

  it.each([
    ['a winner beat of 20 s', (r: Raw) => { r.raceDay.beats.winnerBeatSeconds.value = 20; }],
    ['a photo of 30 s', (r: Raw) => { r.raceDay.beats.photoSeconds.value = 30; }],
    ['a slow playback of 1x', (r: Raw) => { r.raceDay.playback.speed.value = 1; }],
    ['a pick window of 40 s', (r: Raw) => { r.raceDay.beats.pickSeconds.value = 40; }],
    ['a cap of 60 s', (r: Raw) => { r.raceDay.beats.maxSequenceSeconds.value = 60; }],
  ])('RV11: %s is refused at beats', (_n, f) => {
    const err = expectRejected(edit(f), F.day, 'beats');
    expect(err.message).toMatch(/cap|s of playback/);
  });

  it('RV11: exactly at the cap passes and a hundredth over fails', () => {
    const seq = 4 + 1 + slowest / 2 + 1 + 4.5 + 2.5; // pick, still, race, hold, photo, winner beat
    const ok = edit((r) => { r.raceDay.beats.maxSequenceSeconds.value = seq; });
    expect(() => validateRaceDay(ok, game())).not.toThrow();
    const over = edit((r) => { r.raceDay.beats.maxSequenceSeconds.value = seq - 0.01; });
    expectRejected(over, F.day, 'beats');
  });

  it('RV11: the check uses the sim\'s own slowest winning time, so a changed band changes the verdict', () => {
    const g = game();
    g.tuning.checks.winningTimeBandSeconds.value.max = 200;
    expectRejected(fresh(), F.day, 'beats', g);
  });
});

describe('step 2: the new slot fields', () => {
  const at = (raw: Raw, id: string): number => raw.slots.slots.findIndex((x: { id: string }) => x.id === id);
  const slotEdit = (id: string, field: string, value: unknown) => {
    const raw = fresh();
    const i = at(raw, id);
    raw.slots.slots[i][field] = value;
    return { raw, i };
  };

  it('the shipped fields: gate startX 31, crowd atY 64, flag attachAt [24, 3], infield fillSlice [0, 16]', () => {
    const find = (id: string) => slotsJson.slots.find((x) => x.id === id) as Record<string, unknown>;
    expect(find('art.race.gate').startX).toBe(31);
    expect(find('art.race.bg.mid.crowd').atY).toBe(64);
    expect(find('art.race.ambient.flag').attachAt).toEqual([24, 3]);
    expect(find('art.race.bg.mid.infield').fillSlice).toEqual([0, 16]);
  });

  it.each([-1, 240, 1.5, '64'])('atY = %j is rejected', (v) => {
    const { raw, i } = slotEdit('art.race.bg.mid.crowd', 'atY', v);
    expectRejected(raw, F.slots, `slots[${i}].atY`);
  });
  it.each([[[-1, 3]], [[24]], [[24, 3, 1]], [['a', 3]], [[1.5, 3]], ['24,3']])('attachAt = %j is rejected', (v) => {
    const { raw } = slotEdit('art.race.ambient.flag', 'attachAt', v);
    const err = failure(raw);
    expect(err.file).toBe(F.slots);
    expect(err.message).toContain('attachAt');
  });
  it.each([[[0, 0]], [[0]], [[-1, 16]], [[0, 1.5]], [['0', '16']], ['0,16']])('fillSlice = %j is rejected', (v) => {
    const { raw } = slotEdit('art.race.bg.mid.infield', 'fillSlice', v);
    const err = failure(raw);
    expect(err.file).toBe(F.slots);
    expect(err.message).toContain('fillSlice');
  });
  it.each([40, 100, -1, '31', 31.5])('startX = %j is rejected (the gate frame is 40 wide)', (v) => {
    const { raw, i } = slotEdit('art.race.gate', 'startX', v);
    const err = failure(raw);
    expect(err.file).toBe(F.slots);
    expect(err.message).toContain(`slots[${i}].startX`);
  });
  it('startX 39, the last column, is accepted', () => {
    const { raw } = slotEdit('art.race.gate', 'startX', 39);
    expect(() => validateRaceDay(raw, game())).not.toThrow();
  });
  it('the fields are optional: a slot without them is fine', () => {
    const raw = fresh();
    const i = at(raw, 'art.race.ambient.flag');
    delete raw.slots.slots[i].attachAt;
    expect(() => validateRaceDay(raw, game())).not.toThrow();
  });
});

describe('step 2: the nine new slots', () => {
  const NINE = [
    'art.race.horse.body.walk', 'art.race.horse.tack.walk', 'art.race.jockey.jacket.walk', 'art.race.jockey.cap.walk',
    'art.race.jockey.jacket.winner', 'art.race.jockey.cap.winner',
    'art.race.bg.mid.crowd', 'art.race.bg.mid.infield', 'art.race.ambient.flag',
  ];
  const WALK_AND_WINNER = NINE.slice(0, 6);
  const FINAL = NINE.slice(6);
  const slotOf = (id: string) => slotsJson.slots.find((x) => x.id === id) as Record<string, unknown> | undefined;

  it('all nine are needed slots', () => {
    const needed = neededSlotIds({ surface: 'dirt', going: 'fast' });
    for (const id of NINE) expect(needed, id).toContain(id);
  });

  it.each(NINE)('the loader refuses a slots.json without %s, naming the file and the slot', (id) => {
    const raw = fresh();
    raw.slots.slots = raw.slots.slots.filter((x: { id: string }) => x.id !== id);
    const err = failure(raw);
    expect(err.file).toBe(F.slots);
    expect(err.message).toContain(id);
  });

  it('the walk and winner layers are stand-ins flagged placeholder; the crowd, infield and flag are final', () => {
    for (const id of WALK_AND_WINNER) expect(slotOf(id)!.placeholder, id).toBe(true);
    for (const id of FINAL) expect(slotOf(id)!.placeholder, id).toBe(false);
  });

  it('their sizes and frame counts are the spec\'s (section 7)', () => {
    for (const id of WALK_AND_WINNER) expect([slotOf(id)!.frameWidth, slotOf(id)!.frameHeight, slotOf(id)!.frames], id).toEqual([32, 24, 2]);
    expect([slotOf('art.race.bg.mid.crowd')!.frameWidth, slotOf('art.race.bg.mid.crowd')!.frameHeight, slotOf('art.race.bg.mid.crowd')!.frames]).toEqual([16, 16, 2]);
    expect([slotOf('art.race.bg.mid.infield')!.frameWidth, slotOf('art.race.bg.mid.infield')!.frameHeight, slotOf('art.race.bg.mid.infield')!.frames]).toEqual([32, 32, 1]);
    expect([slotOf('art.race.ambient.flag')!.frameWidth, slotOf('art.race.ambient.flag')!.frameHeight, slotOf('art.race.ambient.flag')!.frames]).toEqual([8, 8, 2]);
  });

  it('the body walk layer keeps the nose column of the other body layers', () => {
    expect(slotOf('art.race.horse.body.walk')!.noseX).toBe(slotOf('art.race.horse.body.gallop')!.noseX);
  });

  it('the tack walk layer lists a number position for each of its frames', () => {
    const t = slotOf('art.race.horse.tack.walk')!;
    expect((t.numberAt as unknown[]).length).toBe(t.frames);
  });
});
