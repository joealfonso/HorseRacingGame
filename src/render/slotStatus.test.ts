import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Slot } from '../data/raceDaySchema';
import { game, shippedRaceDay } from './testkit';
import { validateRaceDay } from '../data/raceDayLoad';
import { DataError } from '../data/validate';
import slotsJson from '../data/slots.json';
import cardLookJson from '../data/cardLook.json';
import paletteJson from '../data/palette.json';
import raceDayJson from '../data/raceDay.json';
import {
  PLACEHOLDER_TAG_AT, SLOT_IDS, neededSlotIds, sheetSize, shipProblems, showPlaceholderTag, slotState, standIns, type SheetSize, type SlotState,
} from './slotStatus';

// P0-3 and IN1. The slot list is the spec's section 7 table (first needed P0), the sizes
// are the table's sizes; the scene's own slot use is read from its source text because
// the scene needs a browser.

const ROOT = new URL('../../', import.meta.url).pathname;
const slots = shippedRaceDay.slots.slots;
const byId = new Map(slots.map((s) => [s.id, s]));

// [id, frameWidth, frameHeight, frames]; gallop layers have 2 frames as stand-ins (4 final).
const P0_SLOTS: [string, number, number, number][] = [
  ['font.ui.main', 8, 8, 95],
  ['font.ui.small', 4, 6, 16],
  ['art.ui.frame.box', 8, 8, 9],
  ['art.ui.cursor.horseshoe', 8, 8, 2],
  ['art.ui.placeholder_tag', 8, 8, 1],
  ['art.ui.minimap.track', 88, 40, 1],
  ['art.race.horse.body.gallop', 32, 24, 2],
  ['art.race.horse.body.stand', 32, 24, 1],
  ['art.race.horse.tack.gallop', 32, 24, 2],
  ['art.race.horse.tack.stand', 32, 24, 1],
  ['art.race.jockey.jacket.gallop', 32, 24, 2],
  ['art.race.jockey.jacket.stand', 32, 24, 1],
  ['art.race.jockey.cap.gallop', 32, 24, 2],
  ['art.race.jockey.cap.stand', 32, 24, 1],
  ['art.race.marker.player', 7, 4, 1],
  // Round two: the edge marker is 8x9 (spec 3.5 and section 7, DESIGN.md Race view): a full
  // Ink outline and a center row for the tip need the extra row. It was 8x8 in round one.
  ['art.race.marker.edge', 8, 9, 1],
  ['art.race.gate', 40, 88, 2],
  ['art.race.pole.furlong', 4, 28, 1],
  ['art.race.pole.wire', 8, 28, 1],
  ['art.race.rail.far', 16, 8, 1],
  ['art.race.rail.near', 16, 8, 1],
  ['art.track.dirt.fast', 16, 16, 1],
  ['art.race.bg.far.hills', 128, 24, 1],
  ['art.race.bg.mid.grandstand', 32, 32, 1],
  // Step 2 (spec section 7): the walk and winner layers, the crowd, the infield and the flag.
  ['art.race.horse.body.walk', 32, 24, 2],
  ['art.race.horse.tack.walk', 32, 24, 2],
  ['art.race.jockey.jacket.walk', 32, 24, 2],
  ['art.race.jockey.cap.walk', 32, 24, 2],
  ['art.race.jockey.jacket.winner', 32, 24, 2],
  ['art.race.jockey.cap.winner', 32, 24, 2],
  ['art.race.bg.mid.crowd', 16, 16, 2],
  ['art.race.bg.mid.infield', 32, 32, 1],
  ['art.race.ambient.flag', 8, 8, 2],
];
const P0_SFX = ['sfx.race.gate_open', 'sfx.race.call_to_post', 'sfx.photo.shutter'];

/** Every slot-id literal in the scene files and the entry point, from their source text. */
function sceneSlotLiterals(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const dir = join(ROOT, 'src/scenes');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => join(dir, f)).concat(join(ROOT, 'src/main.ts'));
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/['"`]((?:art|font|sfx|music)\.[a-z0-9_]+(?:\.[a-z0-9_]+)+)['"`]/g)) found.set(m[1], [...(found.get(m[1]) ?? []), f]);
  }
  return found;
}
const flatten = (o: unknown): string[] => (typeof o === 'string' ? [o] : Object.values(o as object).flatMap(flatten));

describe('P0-3: every slot the race screen uses is in the slot data', () => {
  it.each(P0_SLOTS)('P0-3: %s is listed at %ix%i with %i frames', (id, w, h, frames) => {
    const s = byId.get(id);
    expect(s, `${id} missing from src/data/slots.json`).toBeDefined();
    expect(s!.frameWidth).toBe(w);
    expect(s!.frameHeight).toBe(h);
    expect(s!.frames).toBe(frames);
  });

  it.each(P0_SFX)('P0-3: %s is listed, a silent placeholder with no file', (id) => {
    const s = byId.get(id);
    expect(s).toBeDefined();
    expect(s!.file).toBeNull();
    expect(s!.placeholder).toBe(true);
  });

  it('P0-3: the horse layers share size and nose column, as the spec requires of the race horse', () => {
    const layers = ['body', 'tack'].flatMap((p) => ['gallop', 'stand'].map((m) => byId.get(`art.race.horse.${p}.${m}`)!))
      .concat(['jacket', 'cap'].flatMap((p) => ['gallop', 'stand'].map((m) => byId.get(`art.race.jockey.${p}.${m}`)!)));
    for (const l of layers) {
      expect([l.frameWidth, l.frameHeight]).toEqual([32, 24]);
    }
    for (const m of ['gallop', 'stand']) {
      expect(byId.get(`art.race.horse.body.${m}`)!.frames).toBe(byId.get(`art.race.horse.tack.${m}`)!.frames);
      expect(byId.get(`art.race.horse.body.${m}`)!.frames).toBe(byId.get(`art.race.jockey.jacket.${m}`)!.frames);
      expect(byId.get(`art.race.horse.body.${m}`)!.frames).toBe(byId.get(`art.race.jockey.cap.${m}`)!.frames);
    }
  });

  // Round two: the ids now live in one list (SLOT_IDS and neededSlotIds in slotStatus.ts).
  // The requirement changed from "ids the scenes name are in slots.json" to "the scenes
  // take their ids from that list, and every id in it is in slots.json".
  it('P0-3: the scenes take their slot ids from the one list: no slot id literal in a scene file', () => {
    const inList = new Set([...flatten(SLOT_IDS), ...neededSlotIds(game.race)]);
    const literals = sceneSlotLiterals();
    for (const [id, files] of literals) expect(inList.has(id), `${id} is written in ${files.join(', ')} instead of coming from SLOT_IDS`).toBe(true);
    // And they really do not spell them out: the list's ids appear only in slotStatus.ts.
    expect([...literals.keys()]).toEqual([]);
  });

  it('P0-3: every needed slot is in the shipped slots.json', () => {
    const needed = neededSlotIds(game.race);
    expect(needed.length).toBeGreaterThan(20);
    for (const id of needed) expect(byId.has(id), `${id} is needed by the race-day screens but not in slots.json`).toBe(true);
  });

  it('P0-3: the needed list holds every art and font slot the spec marks P0, bar the pause cursor', () => {
    const needed = new Set(neededSlotIds(game.race));
    for (const [id] of P0_SLOTS) if (id !== 'art.ui.cursor.horseshoe') expect(needed.has(id), id).toBe(true);
  });

  it('P0-3: the needed list adds the track slot of the race: dirt and fast gives art.track.dirt.fast', () => {
    expect(neededSlotIds(game.race)).toContain('art.track.dirt.fast');
    expect(neededSlotIds({ surface: 'turf', going: 'firm' })).toContain('art.track.turf.firm');
    expect(neededSlotIds()).not.toContain('art.track.dirt.fast');
    expect(new Set(neededSlotIds(game.race)).size).toBe(neededSlotIds(game.race).length);
  });

  it('P0-3: the track tile for the race going exists (art.track.<surface>.<going>)', () => {
    expect(byId.has('art.track.dirt.fast')).toBe(true);
  });

  it('P0-3: every listed slot resolves to a file on disk or is marked placeholder in data', () => {
    for (const s of slots) {
      if (s.placeholder) continue;
      expect(s.file, `${s.id} is final but has no file`).not.toBeNull();
      expect(existsSync(join(ROOT, 'public', s.file!)), `${s.id}: public/${s.file} is missing`).toBe(true);
    }
  });

  it('P0-3: no slot id is duplicated', () => {
    expect(new Set(slots.map((s) => s.id)).size).toBe(slots.length);
  });
});

describe('P0-3: the placeholder tag', () => {
  const states = (m: Record<string, SlotState>) => new Map(Object.entries(m));
  const mk = (id: string, placeholder: boolean, extra: Partial<Slot> = {}): Slot => ({ id, file: `assets/${id.replace(/\./g, '/')}.png`, frameWidth: 8, frameHeight: 8, frames: 1, placeholder, ...extra });

  it('P0-3: the tag is at (248, 0)', () => {
    expect(PLACEHOLDER_TAG_AT).toEqual({ x: 248, y: 0 });
  });

  it('P0-3: it shows while any slot in use is a placeholder', () => {
    const list = [mk('art.a.one', false), mk('art.a.two', true)];
    const drawn = standIns(list, states({ 'art.a.one': 'ok', 'art.a.two': 'ok' }), ['art.a.one', 'art.a.two']);
    expect(drawn.map((d) => d.id)).toEqual(['art.a.two']);
    expect(drawn[0].reason).toMatch(/placeholder/);
    expect(showPlaceholderTag(drawn)).toBe(true);
  });

  it('P0-3: it is hidden when every slot in use is final', () => {
    const list = [mk('art.a.one', false), mk('art.a.two', false)];
    const drawn = standIns(list, states({ 'art.a.one': 'ok', 'art.a.two': 'ok' }), ['art.a.one', 'art.a.two']);
    expect(drawn).toEqual([]);
    expect(showPlaceholderTag(drawn)).toBe(false);
  });

  it('P0-3: a placeholder that this screen does not use does not show the tag', () => {
    const list = [mk('art.a.one', false), mk('art.a.two', true)];
    expect(showPlaceholderTag(standIns(list, states({ 'art.a.one': 'ok', 'art.a.two': 'ok' }), ['art.a.one']))).toBe(false);
  });

  it('P0-3: a final slot whose file did not load shows the tag, naming the file', () => {
    const list = [mk('art.a.one', false)];
    const drawn = standIns(list, states({ 'art.a.one': 'missing' }), ['art.a.one']);
    expect(showPlaceholderTag(drawn)).toBe(true);
    expect(drawn[0].reason).toContain('public/assets/art/a/one.png');
  });

  it('P0-3: a final slot whose file is the wrong size shows the tag', () => {
    const list = [mk('art.a.one', false, { frameWidth: 8, frameHeight: 8, frames: 2 })];
    const drawn = standIns(list, states({ 'art.a.one': 'wrongSize' }), ['art.a.one']);
    expect(showPlaceholderTag(drawn)).toBe(true);
    expect(drawn[0].reason).toContain('16x8');
  });

  it('P0-3: a slot the screen uses that data does not list shows the tag too', () => {
    const drawn = standIns([mk('art.a.one', false)], states({ 'art.a.one': 'ok' }), ['art.a.one', 'art.a.ghost']);
    expect(drawn.map((d) => d.id)).toEqual(['art.a.ghost']);
    expect(showPlaceholderTag(drawn)).toBe(true);
  });

  it('P0-3: a silent placeholder slot in use is listed as a stand-in', () => {
    const list: Slot[] = [{ id: 'sfx.a.b', file: null, placeholder: true }];
    expect(standIns(list, states({ 'sfx.a.b': 'missing' }), ['sfx.a.b']).map((d) => d.id)).toEqual(['sfx.a.b']);
  });
});

describe('P0-3: tag on the shipped data, and the boot check for needed slots', () => {
  const stateOk = new Map(slots.map((s) => [s.id, 'ok' as SlotState]));
  const needed = neededSlotIds(game.race);

  it('P0-3: the shipped data has placeholders drawn, so the tag is drawn', () => {
    const drawn = standIns(slots, stateOk, needed);
    expect(drawn.length).toBeGreaterThan(0);
    expect(showPlaceholderTag(drawn)).toBe(true);
  });

  it('P0-3: with no placeholder drawn the tag is not drawn', () => {
    const final = slots.map((s) => ({ ...s, placeholder: false }));
    const drawn = standIns(final, stateOk, needed);
    expect(drawn).toEqual([]);
    expect(showPlaceholderTag(drawn)).toBe(false);
  });

  const raw = () => structuredClone({ palette: paletteJson, slots: slotsJson, cardLook: cardLookJson, raceDay: raceDayJson }) as
    { palette: unknown; slots: { slots: { id: string }[] }; cardLook: unknown; raceDay: unknown };
  const failure = (r: ReturnType<typeof raw>): DataError => {
    try { validateRaceDay(r, structuredClone(game)); } catch (e) { return e as DataError; }
    throw new Error('accepted but should have been rejected');
  };

  it.each(['art.race.gate', 'font.ui.main', 'art.race.horse.tack.stand', 'art.ui.minimap.track', 'art.track.dirt.fast'])(
    'P0-3: the loader rejects slots.json without %s, naming the file and the slot', (id) => {
      const r = raw();
      r.slots.slots = r.slots.slots.filter((s) => s.id !== id);
      const err = failure(r);
      expect(err).toBeInstanceOf(DataError);
      expect(err.file).toBe('src/data/slots.json');
      expect(err.message).toContain('src/data/slots.json');
      expect(err.message).toContain(id);
    });

  it('P0-3: a slot that is listed but not needed may be absent: the sound slots are not needed', () => {
    const r = raw();
    r.slots.slots = r.slots.slots.filter((s) => !s.id.startsWith('sfx.'));
    expect(() => validateRaceDay(r, structuredClone(game))).not.toThrow();
  });

  it('P0-3: every missing slot is named, not only the first', () => {
    const r = raw();
    r.slots.slots = r.slots.slots.filter((s) => s.id !== 'art.race.gate' && s.id !== 'art.race.rail.far');
    const err = failure(r);
    expect(err.message).toContain('art.race.gate');
    expect(err.message).toContain('art.race.rail.far');
  });

  it('P0-3: the track slot follows the race: a race on good going needs art.track.dirt.good, which the shipped file lacks', () => {
    const g = structuredClone(game);
    g.race.going = 'good';
    const r = raw();
    const err = (() => { try { validateRaceDay(r, g); } catch (e) { return e as DataError; } throw new Error('accepted'); })();
    expect(err.message).toContain('art.track.dirt.good');
  });
});

describe('P0-3: sheet sizes and states', () => {
  const slot = (o: Partial<Slot>): Slot => ({ id: 'art.a.b', file: 'assets/a.png', placeholder: false, ...o });

  it('frames in one row unless columns says otherwise', () => {
    expect(sheetSize(slot({ frameWidth: 32, frameHeight: 24, frames: 2 }))).toEqual({ width: 64, height: 24 });
    expect(sheetSize(slot({ frameWidth: 8, frameHeight: 8, frames: 95, columns: 16 }))).toEqual({ width: 128, height: 48 });
    expect(sheetSize(slot({ frameWidth: 8, frameHeight: 8, frames: 9, columns: 3 }))).toEqual({ width: 24, height: 24 });
    expect(sheetSize(slot({ frameWidth: 4, frameHeight: 6, frames: 16, columns: 16 }))).toEqual({ width: 64, height: 6 });
    expect(sheetSize(slot({ frameWidth: 8, frameHeight: 8, frames: 3, columns: 8 }))).toEqual({ width: 24, height: 8 });
  });

  it('a slot with no frame data has no size to check', () => {
    expect(sheetSize({ id: 'sfx.a.b', file: 'assets/x.ogg', placeholder: false })).toBeNull();
  });

  it('missing, wrong size, ok', () => {
    const s = slot({ frameWidth: 8, frameHeight: 8, frames: 1 });
    expect(slotState(s, null)).toBe('missing');
    expect(slotState(s, { width: 8, height: 9 })).toBe('wrongSize');
    expect(slotState(s, { width: 9, height: 8 })).toBe('wrongSize');
    expect(slotState(s, { width: 8, height: 8 })).toBe('ok');
  });
});

describe('P0-3: shipProblems, the release check', () => {
  const art = (id: string, over: Partial<Slot> = {}): Slot => ({ id, file: `assets/${id}.png`, frameWidth: 8, frameHeight: 8, frames: 1, placeholder: false, ...over });
  const present = (m: Record<string, SheetSize>) => (file: string) => m[file] ?? null;
  const ok = { 'assets/art.a.b.png': { width: 8, height: 8 } };

  it('passes when no slot is a placeholder and every file is there at the data size', () => {
    expect(shipProblems([art('art.a.b')], present(ok))).toEqual([]);
  });

  it('fails when any slot is flagged placeholder, naming it', () => {
    const p = shipProblems([art('art.a.b'), art('art.a.c', { placeholder: true })], present({ ...ok, 'assets/art.a.c.png': { width: 8, height: 8 } }));
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('art.a.c');
    expect(p[0]).toMatch(/placeholder/);
  });

  it('fails when a file is missing', () => {
    const p = shipProblems([art('art.a.b')], present({}));
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('art.a.b');
    expect(p[0]).toContain('public/assets/art.a.b.png');
  });

  it('fails when the file size differs from the data, saying both sizes', () => {
    const p = shipProblems([art('art.a.b')], present({ 'assets/art.a.b.png': { width: 8, height: 9 } }));
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('8x9');
    expect(p[0]).toContain('8x8');
  });

  it('a silent placeholder sound fails the check; a real sound file passes', () => {
    const silent: Slot = { id: 'sfx.a.b', file: null, placeholder: true };
    expect(shipProblems([silent], present({}))).toHaveLength(1);
    const real: Slot = { id: 'sfx.a.b', file: 'assets/sfx/a/b.ogg', placeholder: false };
    expect(shipProblems([real], present({ 'assets/sfx/a/b.ogg': { width: 1, height: 1 } }))).toEqual([]);
  });

  it('every problem is listed, none hidden by another', () => {
    const list = [art('art.a.one', { placeholder: true }), art('art.a.two'), art('art.a.three')];
    const p = shipProblems(list, present({ 'assets/art.a.one.png': { width: 8, height: 8 }, 'assets/art.a.three.png': { width: 1, height: 1 } }));
    expect(p).toHaveLength(3);
  });

  it('the shipped slot list has placeholders now, so it is not shippable yet', () => {
    const problems = shipProblems(slots, () => ({ width: 1, height: 1 }));
    const flagged = slots.filter((s) => s.placeholder).map((s) => s.id);
    expect(flagged.length).toBeGreaterThan(0);
    for (const id of flagged) expect(problems.some((p) => p.startsWith(`${id}:`))).toBe(true);
  });
});

describe('P0-3: the release build is gated by the ship check', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

  it('build:release runs ship:check before the build, and stops if it fails', () => {
    const cmd = pkg.scripts['build:release'];
    expect(cmd).toBeDefined();
    const check = cmd.indexOf('ship:check');
    const build = cmd.indexOf('vite build');
    expect(check).toBeGreaterThanOrEqual(0);
    expect(build).toBeGreaterThan(check);
    expect(cmd.slice(check, build)).toContain('&&');
  });

  it('ship:check runs the ship check script', () => {
    expect(pkg.scripts['ship:check']).toContain('shipCheck');
  });
});

describe('IN1: every action has a keyboard binding; no handler needs a pointer', () => {
  const files = readdirSync(join(ROOT, 'src/scenes')).filter((f) => f.endsWith('.ts')).map((f) => join(ROOT, 'src/scenes', f)).concat(join(ROOT, 'src/main.ts'));

  it('IN1: no scene or the entry point uses a pointer, mouse, touch or gamepad API', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/pointer(down|up|move|over|out)|setInteractive|input\.(mouse|touch|gamepad)|\.on\(\s*['"]click|\.on\(\s*['"]touch|mousedown|mouseup/i);
    }
  });

  // Updated on purpose with step 5: this said keys 1 to 8 pick a horse at the gate, in the race
  // scene. The number keys left the race scene; the pick is on the Card, where 1 to 8 jump to a
  // post. IN1 still holds: every action on every screen has a keyboard binding and no handler
  // needs a pointer. The race scene keeps Enter (skip) and the pause keys, the Card and Orders
  // scenes bind keys through MenuKeys, and no scene binds a pointer event.
  it('IN1: every action on every screen is bound to keys, and no handler needs a pointer', () => {
    const scene = (f: string) => readFileSync(join(ROOT, 'src/scenes', f), 'utf8');
    expect(scene('RaceScene.ts')).toMatch(/keydown/);
    expect(scene('RaceScene.ts')).toMatch(/'Enter'/);
    expect(scene('RaceScene.ts')).not.toMatch(/Digit/); // the pick is no longer made at the gate
    expect(scene('menuKeys.ts')).toMatch(/keydown/);
    expect(scene('CardScene.ts')).toContain('new MenuKeys');
    expect(scene('OrdersScene.ts')).toContain('new MenuKeys');
    expect(scene('ResultScene.ts')).toMatch(/keydown/);
    for (const f of ['RaceScene.ts', 'CardScene.ts', 'OrdersScene.ts', 'ResultScene.ts', 'menuKeys.ts']) {
      expect(scene(f), f).not.toMatch(/pointerdown|pointerup|pointermove|setInteractive|\.on\('pointer|gameobjectdown/);
    }
  });
});
