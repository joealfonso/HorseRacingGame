import type { z } from 'zod';
import cardLook from './cardLook.json';
import palette from './palette.json';
import raceDay from './raceDay.json';
import slots from './slots.json';
import {
  PHOTO_CROP_ROWS, PHOTO_LANE_ROWS, SLOT_IDS, cardLookSchema, missingNeeded, neededSlotIds, paletteSchema, raceDaySchema, sequenceSeconds, slotsSchema,
  type CardLook, type Palette, type RaceDay, type Slots,
} from './raceDaySchema';
import { MAX_NAME_LENGTH, type GameData } from './schema';
import { templateHoles, fillTemplate } from './template';
import { DataError, type DataIssue } from './validate';

export interface RaceDayData {
  palette: Palette;
  slots: Slots;
  cardLook: CardLook;
  raceDay: RaceDay;
}

// Field widths in characters of the 8 px main font (spec 4 and 4.3).
export const CALL_CHARS = 30;
export const MESSAGE_CHARS = 30;
export const HUD_LINE_CHARS = 18;
export const MAX_RACE_DAY_FIELD = 8;
export const MAX_RACE_NAME = 30;
export const MAX_TRACK_NAME = 30;
export const MAX_JOCKEY_NAME = 22;
// "4x" at x224-239 in the top bar; the pause box's inner width from the cursor column.
export const FAST_TAG_CHARS = 2;
export const PAUSE_CHARS = 12;
// Photo captions and the result's lines, inside a framed box (spec 4.4 and 4.6).
export const BOX_CHARS = 30;
// The result's margin column, x204-247, and "Next race" after the cursor, x20-247.
export const RESULT_MARGIN_CHARS = 5;
export const RESULT_NEXT_CHARS = 28; // 228 px: 28 whole cells
// The result's widest line in pixels: a main-font label, a space, then small-font numbers.
const BOX_PX = 240;
const SMALL_PX = 4;
// The widest value each hole can take, for the fit checks.
const WIDEST = {
  name: 'M'.repeat(MAX_NAME_LENGTH),
  leader: 'M'.repeat(MAX_NAME_LENGTH),
  winner: 'M'.repeat(MAX_NAME_LENGTH),
  half: '9:59.99',
  n: String(MAX_RACE_DAY_FIELD),
  post: String(MAX_RACE_DAY_FIELD),
  place: '8th',
} as const;

function parse<T extends z.ZodType>(file: string, schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  throw new DataError(`src/data/${file}.json`, result.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message })));
}

function formatPath(path: PropertyKey[]): string {
  if (path.length === 0) return '(whole file)';
  return path.reduce<string>((out, p) => (typeof p === 'number' ? `${out}[${p}]` : out ? `${out}.${String(p)}` : String(p)), '');
}

// Takes plain objects so tests can hand it broken data, plus the already validated sim
// data it is checked against. Stops at the first bad file, like validateData.
export function validateRaceDay(
  raw: { palette: unknown; slots: unknown; cardLook: unknown; raceDay: unknown },
  game: GameData,
): RaceDayData {
  const pal = parse('palette', paletteSchema, raw.palette);
  const sl = parse('slots', slotsSchema, raw.slots);
  const look = parse('cardLook', cardLookSchema, raw.cardLook);
  const rd = parse('raceDay', raceDaySchema, raw.raceDay);

  const issues = new Map<string, DataIssue[]>();
  const add = (file: string, path: string, message: string) => {
    const key = `src/data/${file}.json`;
    issues.set(key, [...(issues.get(key) ?? []), { path, message }]);
  };

  // The sim's files, against the limits of these screens.
  const horses = game.card.horses;
  if (horses.length > MAX_RACE_DAY_FIELD) add('card', 'horses', `the M1 race-day screens show at most ${MAX_RACE_DAY_FIELD} horses`);
  if (game.race.name.length > MAX_RACE_NAME) add('race', 'name', `must be ${MAX_RACE_NAME} characters or fewer`);
  if (game.race.track.length > MAX_TRACK_NAME) add('race', 'track', `must be ${MAX_TRACK_NAME} characters or fewer`);
  if (game.track.name.length > MAX_TRACK_NAME) add('track', 'name', `must be ${MAX_TRACK_NAME} characters or fewer`);
  horses.forEach((h, i) => {
    if (h.jockey.length > MAX_JOCKEY_NAME) add('card', `horses[${i}].jockey`, `must be ${MAX_JOCKEY_NAME} characters or fewer`);
  });

  // Every slot the screens draw must be in the registry, or the scene would have nothing to draw.
  for (const id of missingNeeded(sl.slots, neededSlotIds(game.race))) {
    add('slots', 'slots', `has no slot "${id}"; the race-day screens need it`);
  }

  // The photo puts lanes PHOTO_LANE_ROWS apart in its PHOTO_CROP_ROWS-row crop: the block
  // from the rail to the widest lane, plus one frame, must fit, or horses lose rows.
  const frameH = sl.slots.find((x) => x.id === SLOT_IDS.horse.body.gallop)?.frameHeight;
  const laneMax = game.tuning.laneMax.value;
  if (frameH !== undefined && PHOTO_LANE_ROWS * laneMax + frameH > PHOTO_CROP_ROWS) {
    add('tuning', 'laneMax.value', `is ${laneMax}; the photo finish needs ${PHOTO_LANE_ROWS} x laneMax + the ${frameH}-row frame (src/data/slots.json ${SLOT_IDS.horse.body.gallop}.frameHeight) to fit its ${PHOTO_CROP_ROWS} rows, so at most ${Math.floor((PHOTO_CROP_ROWS - frameH) / PHOTO_LANE_ROWS)}`);
  }

  // Colors by name, from the palette.
  const names = new Set(pal.colors.map((c) => c.name));
  const silks = new Set([...pal.silksBands.dark, ...pal.silksBands.mid, ...pal.silksBands.light]);
  const color = (file: string, path: string, name: string) => {
    if (!names.has(name)) add(file, path, `"${name}" is not a palette color name`);
  };
  for (const k of ['quarter', 'eighth', 'sixteenth'] as const) color('raceDay', `poleBands.value.${k}`, rd.poleBands.value[k]);
  rd.saddlecloths.value.forEach((s, i) => {
    color('raceDay', `saddlecloths.value[${i}].fill`, s.fill);
    color('raceDay', `saddlecloths.value[${i}].number`, s.number);
  });
  if (rd.saddlecloths.value.length < horses.length) {
    add('raceDay', 'saddlecloths.value', `lists ${rd.saddlecloths.value.length} saddlecloths, the card has ${horses.length} horses`);
  }
  for (const [coat, tones] of Object.entries(rd.coats)) {
    color('raceDay', `coats.${coat}.base`, tones.base);
    color('raceDay', `coats.${coat}.second`, tones.second);
  }

  // One look per horse on the card, no extras, no shared jacket.
  const ids = new Set(horses.map((h) => h.id));
  horses.forEach((h, i) => {
    if (!(h.id in look)) add('cardLook', h.id, `missing, card.json horses[${i}] (${h.name}) needs a look`);
  });
  const bodies = new Map<string, string>();
  for (const [id, l] of Object.entries(look)) {
    if (!ids.has(id)) add('cardLook', id, 'is not a horse on card.json');
    if (!silks.has(l.silks.body)) add('cardLook', `${id}.silks.body`, `"${l.silks.body}" is not one of the 18 silks colors`);
    if (!silks.has(l.silks.cap)) add('cardLook', `${id}.silks.cap`, `"${l.silks.cap}" is not one of the 18 silks colors`);
    const first = bodies.get(l.silks.body);
    if (first !== undefined) add('cardLook', `${id}.silks.body`, `"${l.silks.body}" is already ${first}'s body color; no two horses on a card share one`);
    else bodies.set(l.silks.body, id);
  }

  // Every template uses only its own holes and fits its field at its widest.
  const copy = rd.copy;
  const check = (path: string, template: string, allowed: readonly string[], max: number, extra: Record<string, string> = {}) => {
    for (const hole of templateHoles(template)) {
      if (!(allowed as readonly string[]).includes(hole)) add('raceDay', path, `{${hole}} is not allowed here; use ${allowed.length ? allowed.map((a) => `{${a}}`).join(', ') : 'no holes'}`);
    }
    const filled = fillTemplate(template, { ...WIDEST, ...extra });
    if (filled.length > max) add('raceDay', path, `is ${filled.length} characters at its widest ("${filled}"); the field holds ${max}`);
  };
  const callHoles: Record<string, readonly (keyof typeof WIDEST)[]> = {
    earlyLeader: ['leader'], leader: ['leader'], leaderSame: ['leader'], leaderNew: ['leader'], winner: ['winner'],
  };
  for (const [key, lines] of Object.entries(copy.calls)) {
    if (key === 'pace') continue;
    (lines as string[]).forEach((line, i) => check(`copy.calls.${key}[${i}]`, line, callHoles[key] ?? [], CALL_CHARS));
  }
  for (const [label, lines] of Object.entries(copy.calls.pace)) {
    lines.forEach((line, i) => check(`copy.calls.pace.${label}[${i}]`, line, ['half'], CALL_CHARS));
  }
  const m = copy.messages;
  check('copy.messages.blocked', m.blocked, ['name'], MESSAGE_CHARS);
  check('copy.messages.steadied', m.steadied, ['name'], MESSAGE_CHARS);
  check('copy.messages.bumped', m.bumped, ['name', 'n'], MESSAGE_CHARS);
  check('copy.messages.backInStride', m.backInStride, [], MESSAGE_CHARS);
  check('copy.messages.asked', m.asked, ['name'], MESSAGE_CHARS);
  check('copy.messages.home', m.home, ['name', 'place'], MESSAGE_CHARS);
  check('copy.pickPrompt', copy.pickPrompt, [], MESSAGE_CHARS);
  check('copy.nextRace', copy.nextRace, [], MESSAGE_CHARS);
  const margin = [copy.marginWords.nose, copy.marginWords.head, copy.marginWords.neck, '9 3/4'].reduce((a, b) => (b.length > a.length ? b : a));
  check('copy.beforeFirstCall', copy.beforeFirstCall, ['post'], HUD_LINE_CHARS);
  check('copy.leads', copy.leads, ['margin'], HUD_LINE_CHARS, { margin });
  check('copy.behind', copy.behind, ['place', 'margin'], HUD_LINE_CHARS, { margin });
  check('copy.won', copy.won, ['margin'], HUD_LINE_CHARS, { margin: copy.oneLength.length > margin.length ? copy.oneLength : margin });
  check('copy.finished', copy.finished, ['place'], HUD_LINE_CHARS);
  check('copy.fastTag', copy.fastTag, [], FAST_TAG_CHARS);
  for (const k of ['title', 'resume', 'back'] as const) check(`copy.pause.${k}`, copy.pause[k], [], PAUSE_CHARS);

  // RV11: the slowest winning time the sim allows, with a photo, fits the brief's cap.
  const slowest = game.tuning.checks.winningTimeBandSeconds.value.max;
  const seq = sequenceSeconds(rd, slowest, true);
  if (seq > rd.beats.maxSequenceSeconds.value) {
    add('raceDay', 'beats', `a ${slowest} s race with a photo takes ${seq.toFixed(1)} s of playback; the cap is ${rd.beats.maxSequenceSeconds.value} s`);
  }
  if (rd.ambient.fromEighthPole.some((id) => !rd.ambient.order.includes(id))) {
    add('raceDay', 'ambient.fromEighthPole', 'lists an ambient item that is not in ambient.order');
  }

  // The photo caption and the result screen (steps 3 and 4).
  const widest = (xs: readonly string[]) => xs.reduce((a, b) => (b.length > a.length ? b : a), '');
  check('copy.marginLength', copy.marginLength, ['margin'], BOX_CHARS, { margin: '3/4' });
  check('copy.marginLengths', copy.marginLengths, ['margin'], BOX_CHARS, { margin: '9 3/4' });
  const phrase = widest([...Object.values(copy.marginWords), fillTemplate(copy.marginLength, { margin: '3/4' }), fillTemplate(copy.marginLengths, { margin: '9 3/4' })]);
  check('copy.photo.title', copy.photo.title, [], BOX_CHARS);
  check('copy.photo.winner', copy.photo.winner, ['winner'], BOX_CHARS);
  check('copy.photo.margin', copy.photo.margin, ['margin', 'n'], BOX_CHARS, { margin: phrase });
  const r = copy.result;
  check('copy.result.winnerMargin', r.winnerMargin, [], RESULT_MARGIN_CHARS);
  check('copy.result.won', r.won, ['margin'], BOX_CHARS, { margin: phrase });
  check('copy.result.beaten', r.beaten, ['place', 'margin'], BOX_CHARS, { margin: phrase });
  for (const k of ['early', 'quarter'] as const) check(`copy.result.${k}`, r[k], ['place'], BOX_CHARS);
  for (const k of ['earlyLed', 'quarterLed', 'clean', 'start'] as const) check(`copy.result.${k}`, r[k], [], BOX_CHARS);
  const calls = [widest([fillTemplate(r.early, WIDEST), r.earlyLed]), widest([fillTemplate(r.quarter, WIDEST), r.quarterLed])].join(r.callsJoiner);
  if (calls.length > BOX_CHARS) add('raceDay', 'copy.result', `the calls line is ${calls.length} characters at its widest ("${calls}"); the line holds ${BOX_CHARS}`);
  for (const k of ['wire', 'mile'] as const) check(`copy.result.poles.${k}`, r.poles[k], [], BOX_CHARS);
  // Furlong poles are named by their eighths of a mile; "1 3/8" is the widest up to 12 furlongs.
  const pole = widest([r.poles.wire, r.poles.mile, '1 3/8']);
  check('copy.result.near', r.near, ['pole'], BOX_CHARS, { pole });
  const where = widest([fillTemplate(r.near, { pole }), r.start]);
  check('copy.result.blocked', r.blocked, ['where'], BOX_CHARS, { where });
  check('copy.result.steadied', r.steadied, ['where'], BOX_CHARS, { where });
  check('copy.result.bumped', r.bumped, ['n', 'where'], BOX_CHARS, { where });
  check('copy.result.rough', r.rough, ['count'], BOX_CHARS, { count: '99' });
  const o = copy.orders;
  const longestOrders = [Object.values(o.early), Object.values(o.move), Object.values(o.path)]
    .map((vals) => vals.reduce((a, b) => (b.length > a.length ? b : a), ''))
    .join(o.joiner);
  if (longestOrders.length > HUD_LINE_CHARS) add('raceDay', 'copy.orders', `the longest short form is ${longestOrders.length} characters ("${longestOrders}"); the line holds ${HUD_LINE_CHARS}`);
  if (o.allDefault.length > HUD_LINE_CHARS) add('raceDay', 'copy.orders.allDefault', `must be ${HUD_LINE_CHARS} characters or fewer`);
  check('copy.result.orders', r.orders, ['orders'], BOX_CHARS, { orders: widest([longestOrders, o.allDefault]) });
  for (const k of ['hot', 'honest', 'slow'] as const) check(`copy.result.pace.${k}`, r.pace[k], [], BOX_CHARS);
  check('copy.result.time', r.time, ['time', 'pace'], BOX_CHARS, { time: '9:59.99', pace: widest(Object.values(r.pace)) });
  check('copy.result.next', r.next, [], RESULT_NEXT_CHARS);
  // A label in the main font, a space, then numbers in the small font, inside the box.
  const splits = Math.ceil(game.race.distanceFurlongs / 2) - 1;
  const splitsPx = 8 * (r.splits.length + 1) + SMALL_PX * Math.max(0, splits * 8 - 1);
  if (splitsPx > BOX_PX) add('raceDay', 'copy.result.splits', `the splits line is ${splitsPx} px at its widest; the box holds ${BOX_PX}`);
  const seedPx = 8 * (r.seed.length + 1) + SMALL_PX * 10;
  if (seedPx > BOX_PX) add('raceDay', 'copy.result.seed', `the seed line is ${seedPx} px at its widest; the box holds ${BOX_PX}`);
  if (rd.beats.photoCaptionSeconds.value > rd.beats.photoSeconds.value) {
    add('raceDay', 'beats.photoCaptionSeconds', `is ${rd.beats.photoCaptionSeconds.value} s; the caption must show within the photo's ${rd.beats.photoSeconds.value} s`);
  }

  const order = ['card', 'race', 'track', 'tuning', 'slots', 'cardLook', 'raceDay'].map((f) => `src/data/${f}.json`);
  for (const file of order) {
    const list = issues.get(file);
    if (list) throw new DataError(file, list);
  }
  return { palette: pal, slots: sl, cardLook: look, raceDay: rd };
}

// The only place these JSON files are read.
export const loadRaceDay = (game: GameData): RaceDayData => validateRaceDay({ palette, slots, cardLook, raceDay }, game);
