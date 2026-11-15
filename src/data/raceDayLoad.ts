import type { z } from 'zod';
import bettingJson from './betting.json';
import cardLook from './cardLook.json';
import hubJson from './hub.json';
import palette from './palette.json';
import raceDay from './raceDay.json';
import slots from './slots.json';
import {
  PHOTO_CROP_ROWS, PHOTO_LANE_ROWS, SLOT_IDS, cardLookSchema, missingNeeded, neededSlotIds, paletteSchema, raceDaySchema, sequenceSeconds, slotsSchema,
  type CardLook, type Palette, type RaceDay, type Slots,
} from './raceDaySchema';
import { MAX_NAME_LENGTH, type GameData, type Race } from './schema';
import { allBiasLines, conditionsLine, programConditionsLine, programPlaceLine } from './cardWords';
import { bannedWordIn } from './bookText';
import { templateHoles, fillTemplate, wrapWords } from './template';
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
// The card and Orders screens (spec 4.1 and 4.2). Style words on a card row, x192-247 (56 px).
export const CARD_STYLE_CHARS = 7;
// Column heads: Speed from x40 and Stamina from x108 each hold 8 cells before the next
// column; Kick from x176 holds 9 to x247. "{jockey} up" holds x8-207, 25 cells.
export const CARD_HEAD_CHARS = { speed: 8, stamina: 8, kick: 9 } as const;
export const JOCKEY_UP_CHARS = 25;
export const STAT_DIGITS = 2;
// Orders: a slot's label x20-59, its value x84-211, Go to the post and Back to card from x20.
export const ORDERS_LABEL_CHARS = 5;
export const ORDERS_VALUE_CHARS = 16;
export const ORDERS_ITEM_CHARS = 28;
// The trainer's line in the dialog box: 28 characters a line, at most 3 lines.
export const TRAINER_CHARS = 28;
export const TRAINER_LINES = 3;
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

  // The card and Orders screens (step 5).
  const cc = copy.card;
  for (const [k, v] of Object.entries(cc.styles)) check(`copy.card.styles.${k}`, v, [], CARD_STYLE_CHARS);
  check('copy.card.furlongs', cc.furlongs, ['n'], BOX_CHARS, { n: '7' });
  check('copy.card.mile', cc.mile, [], BOX_CHARS);
  check('copy.card.miles', cc.miles, ['fraction'], BOX_CHARS, { fraction: '7/8' });
  for (const t of templateHoles(cc.conditions)) {
    if (!['distance', 'surface', 'going'].includes(t)) add('raceDay', 'copy.card.conditions', `{${t}} is not allowed here; use {distance}, {surface}, {going}`);
  }
  const conditions = conditionsLine(game.race, cc);
  if (conditions.length > BOX_CHARS) add('raceDay', 'copy.card.conditions', `is ${conditions.length} characters for this race ("${conditions}"); the line holds ${BOX_CHARS}`);
  for (const k of ['inside', 'outside'] as const) check(`copy.card.bias.laneShort.${k}`, cc.bias.laneShort[k], [], BOX_CHARS);
  for (const k of ['speed', 'closers'] as const) check(`copy.card.bias.styleShort.${k}`, cc.bias.styleShort[k], [], BOX_CHARS);
  check('copy.card.bias.both', cc.bias.both, ['lane', 'style'], BOX_CHARS, { lane: '', style: '' });
  for (const line of allBiasLines(cc)) {
    if (line.length > BOX_CHARS) add('raceDay', 'copy.card.bias', `"${line}" is ${line.length} characters; the line holds ${BOX_CHARS}`);
  }
  // The program page (spec 4.1): column heads over their stat columns, "{jockey} up" in x8-207.
  for (const k of ['speed', 'stamina', 'kick'] as const) check(`copy.card.heads.${k}`, cc.heads[k], [], CARD_HEAD_CHARS[k]);
  check('copy.card.jockeyUp', cc.jockeyUp, ['jockey'], JOCKEY_UP_CHARS, { jockey: 'M'.repeat(MAX_JOCKEY_NAME) });
  // A stat prints as two small-font digits before its bar, so it must be at most 99.
  horses.forEach((h, i) => {
    for (const k of ['speed', 'stamina', 'kick'] as const) {
      if (String(h.stats[k]).length > STAT_DIGITS) add('card', `horses[${i}].stats.${k}`, `is ${h.stats[k]}; the program page prints a stat in ${STAT_DIGITS} digits, so at most 99`);
    }
  });
  const pd = copy.paddock;
  check('copy.paddock.title', pd.title, [], BOX_CHARS);
  for (const k of ['early', 'move', 'path'] as const) {
    check(`copy.paddock.labels.${k}`, pd.labels[k], [], ORDERS_LABEL_CHARS);
    for (const [v, label] of Object.entries(pd.values[k])) check(`copy.paddock.values.${k}.${v}`, label, [], ORDERS_VALUE_CHARS);
  }
  check('copy.paddock.go', pd.go, [], ORDERS_ITEM_CHARS);
  check('copy.paddock.back', pd.back, [], ORDERS_ITEM_CHARS);
  const trainerLines: [string, string][] = [
    ...(['early', 'move', 'path'] as const).flatMap((k) => Object.entries(pd.trainer[k]).map(([v, line]): [string, string] => [`copy.paddock.trainer.${k}.${v}`, line])),
    ['copy.paddock.trainer.go', pd.trainer.go], ['copy.paddock.trainer.back', pd.trainer.back],
  ];
  for (const [path, line] of trainerLines) {
    check(path, line, [], Infinity);
    const wrapped = wrapWords(line, TRAINER_CHARS);
    if (wrapped.length > TRAINER_LINES || wrapped.some((l) => l.length > TRAINER_CHARS)) {
      add('raceDay', path, `wraps to ${wrapped.length} lines of up to ${Math.max(...wrapped.map((l) => l.length))} characters; the dialog holds ${TRAINER_LINES} lines of ${TRAINER_CHARS}`);
    }
  }
  // The paddock's rows name 16x16 tile slots that are in the registry.
  rd.paddock.rows.value.forEach(({ slot: id }, i) => {
    const sl0 = sl.slots.find((x) => x.id === id);
    if (!sl0) add('raceDay', `paddock.rows.value[${i}].slot`, `"${id}" is not a slot in src/data/slots.json`);
    else if (sl0.frameWidth !== 16 || sl0.frameHeight !== 16) add('raceDay', `paddock.rows.value[${i}].slot`, `"${id}" must be a 16x16 tile`);
  });

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
  checkBettingCopyWidths(copy, check, add);
  checkEndOfDay(rd, check, add);

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

// The betting screens (docs/specs/betting-screens.md sections 3 to 5 and 8). The longest
// values the spec names: a bankroll of $165,000.00, a $100 stake, a $20,620.00 return,
// 4-character odds, and a $2 price under $1,000.
export const BET_WIDEST = { bank: '$165,000.00', stake: '$100', total: '$20,620.00', odds: '99-1', twoDollar: '$999.90', race: '8' } as const;
// Program header line 1 (race left, bank right) and the footer lines, x8-247.
export const PROGRAM_LINE_CHARS = 30;
// Column heads: Speed from x40, Stam. from x98 and Kick from x156 each hold 7 cells before
// the next head; Odds is right-aligned in x216-247.
export const PROGRAM_HEAD_CHARS = { speed: 7, stamina: 7, kick: 7, odds: 4 } as const;
// Text after the cursor, x20-247: Pass this race, the ticket's lines.
export const PROGRAM_CURSOR_LINE_CHARS = 28;
// The printed tote ticket's lines, from x16 inside the Ink border at x247.
export const PRINTED_TICKET_CHARS = 28;
// "Esc: back" on footer line 2 while choosing, right-aligned to x247 in x176-247 (track-hub.md section 3).
export const PROGRAM_BACK_CHARS = 9;
// The result's action after the cursor, x20-99, beside the bank right-aligned to x247.
export const RESULT_ACTION_CHARS = 10;

type Check = (path: string, template: string, allowed: readonly string[], max: number, extra?: Record<string, string>) => void;

function checkBettingCopyWidths(copy: RaceDay['copy'], check: Check, add: (file: string, path: string, message: string) => void): void {
  const W = BET_WIDEST;
  const p = copy.program;
  const bank = fillTemplate(p.bank, { amount: W.bank });
  check('copy.program.bank', p.bank, ['amount'], PROGRAM_LINE_CHARS, { amount: W.bank });
  check('copy.program.race', p.race, ['r', 'n'], PROGRAM_LINE_CHARS, { r: W.race, n: W.race });
  const line1 = fillTemplate(p.race, { r: W.race, n: W.race }).length + 1 + bank.length;
  if (line1 > PROGRAM_LINE_CHARS) add('raceDay', 'copy.program.race', `with "${bank}" beside it, line 1 is ${line1} characters at its widest; the line holds ${PROGRAM_LINE_CHARS}`);
  check('copy.program.pass', p.pass, [], PROGRAM_CURSOR_LINE_CHARS);
  check('copy.program.passLine', p.passLine, [], PROGRAM_LINE_CHARS);
  check('copy.program.pending', p.pending, [], PROGRAM_LINE_CHARS);
  check('copy.program.back', p.back, [], PROGRAM_BACK_CHARS);
  for (const k of ['speed', 'stamina', 'kick', 'odds'] as const) check(`copy.program.heads.${k}`, p.heads[k], [], PROGRAM_HEAD_CHARS[k]);
  for (const k of ['fair', 'inside', 'outside', 'speed', 'closers'] as const) check(`copy.program.bias.${k}`, p.bias[k], [], PROGRAM_LINE_CHARS);

  const t = copy.ticket;
  check('copy.ticket.confirm', t.confirm, [], PROGRAM_CURSOR_LINE_CHARS);
  check('copy.ticket.amount', t.amount, ['amount', 'n'], PROGRAM_CURSOR_LINE_CHARS - 1 - t.confirm.length, { amount: W.stake });
  check('copy.ticket.pays', t.pays, ['amount', 'total'], PROGRAM_CURSOR_LINE_CHARS, { amount: W.stake, total: W.total });
  check('copy.ticket.printed[0]', t.printed[0], ['r', 'amount', 'n'], PRINTED_TICKET_CHARS, { r: W.race, amount: W.stake });
  check('copy.ticket.printed[1]', t.printed[1], ['name', 'odds'], PRINTED_TICKET_CHARS, { odds: W.odds });

  check('copy.hud.bet', copy.hud.bet, ['amount', 'odds'], HUD_LINE_CHARS, { amount: W.stake, odds: W.odds });
  check('copy.hud.watching', copy.hud.watching, [], HUD_LINE_CHARS);
  const margin = [copy.marginWords.nose, copy.marginWords.head, copy.marginWords.neck, '9 3/4'].reduce((a, b) => (b.length > a.length ? b : a));
  check('copy.hud.leads', copy.hud.leads, ['margin'], HUD_LINE_CHARS, { margin });
  check('copy.msg.won', copy.msg.won, [], MESSAGE_CHARS);
  check('copy.msg.lost', copy.msg.lost, [], MESSAGE_CHARS);

  const r = copy.result;
  check('copy.result.paid', r.paid, ['amount', 'total'], BOX_CHARS, { amount: W.stake, total: W.total });
  check('copy.result.lost', r.lost, ['amount', 'odds'], BOX_CHARS, { amount: W.stake, odds: W.odds });
  check('copy.result.passed', r.passed, [], BOX_CHARS);
  check('copy.result.winPrice', r.winPrice, ['price'], BOX_CHARS, { price: W.twoDollar });
  check('copy.result.end', r.end, [], RESULT_ACTION_CHARS);
}

// The End of day page (betting-screens.md sections 6, 8 and 10, DESIGN "End of day, the back page").
// "Paid $20,620.00" is the longest ticket, 15 cells from x128. The day pair is "Day" plus a 4 px gap
// and "#" with up to 10 digits of seed in 4 px cells, so it is at most 72 px, right-aligned to x247.
export const END_PAID_CHARS = 15;
export const END_DAY_PAIR_PX = 72;
export const END_VALUE_CHARS = 12;
export const END_CARD_ROWS = 8;
export const END_LINE_CHARS = 30;

/** Every string under `v`, with its dotted path. */
function stringsOf(v: unknown, path: string): [string, string][] {
  if (typeof v === 'string') return [[path, v]];
  if (Array.isArray(v)) return v.flatMap((x, i) => stringsOf(x, `${path}[${i}]`));
  if (v !== null && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => stringsOf(x, `${path}.${k}`));
  return [];
}

/**
 * `copy.end` and the `endOfDay` positions, checked at load like every other copy key and layout
 * block: each line fits its field at its longest fill, every hole is known, no banned word (whole
 * words, the list the betting and track copy use), and the page's pieces neither overlap nor
 * reach the New day box.
 */
function checkEndOfDay(rd: RaceDay, check: Check, add: (file: string, path: string, message: string) => void): void {
  const W = BET_WIDEST;
  const e = rd.copy.end;
  const L = rd.endOfDay.value;
  const C = L.card;
  const A = L.action;
  const at = (path: string, message: string) => add('raceDay', path, message);

  // Words.
  check('copy.end.title', e.title, [], Math.floor((L.lastX + 1 - END_DAY_PAIR_PX - L.left) / 8) - 1);
  for (const k of ['up', 'even', 'down', 'none'] as const) check(`copy.end.line.${k}`, e.line[k], [], END_LINE_CHARS);
  // Label, a space, then the widest value, on one 30-cell line.
  const labelMax = END_LINE_CHARS - 1 - END_VALUE_CHARS;
  for (const k of ['started', 'ended', 'change', 'bets', 'winners', 'best'] as const) check(`copy.end.${k}`, e[k], [], labelMax);
  check('copy.end.betsOf', e.betsOf, ['bets', 'races'], END_VALUE_CHARS, { bets: String(END_CARD_ROWS), races: String(END_CARD_ROWS) });
  check('copy.end.plus', e.plus, ['amount'], END_VALUE_CHARS, { amount: W.bank });
  check('copy.end.minus', e.minus, ['amount'], END_VALUE_CHARS, { amount: W.bank });
  check('copy.end.noWinner', e.noWinner, [], END_VALUE_CHARS);
  check('copy.end.even', e.even, [], END_VALUE_CHARS);
  check('copy.end.newDay', e.newDay, [], PROGRAM_CURSOR_LINE_CHARS);
  const raceMax = Math.floor((C.boxX - C.raceX) / 8);
  check('copy.end.card.race', e.card.race, ['r'], raceMax, { r: String(END_CARD_ROWS) });
  check('copy.end.card.paid', e.card.paid, ['total'], END_PAID_CHARS, { total: W.total });
  check('copy.end.card.lost', e.card.lost, ['amount'], END_PAID_CHARS, { amount: W.stake });
  check('copy.end.card.passed', e.card.passed, [], Math.floor((C.ticketLastX + 1 - C.passedX) / 8));
  const wide = 400;
  const ariaHoles: [string, string, string[]][] = [
    ['figure', e.aria.figure, ['label', 'value']],
    ['row', e.aria.row, ['race', 'n', 'odds', 'ticket']],
    ['passedRow', e.aria.passedRow, ['race', 'passed']],
  ];
  for (const [k, template, holes] of ariaHoles) {
    check(`copy.end.aria.${k}`, template, holes, wide);
    // Every hole is used, or a figure would be read without its value.
    for (const h of holes) if (!templateHoles(template).includes(h)) at(`copy.end.aria.${k}`, `must use {${h}}`);
  }
  const banned = [...bettingJson.copy.bannedWords, ...hubJson.copy.bannedWords];
  for (const [path, text] of stringsOf(e, 'copy.end')) {
    const word = bannedWordIn(text, banned);
    if (word !== null) at(path, `"${text}" contains the banned word "${word}"`);
  }

  // Positions.
  const [rule1, rule2] = L.rules;
  if (L.left < 0) at('endOfDay.value.left', 'must be 0 or more');
  if (L.left >= L.lastX || L.lastX > 255) at('endOfDay.value.lastX', `must be right of left (${L.left}) and at most 255`);
  if (!(L.titleTop >= 0 && L.titleTop + 8 <= L.trackTop && L.trackTop + 8 <= rule1)) at('endOfDay.value.trackTop', `the title (y${L.titleTop}) and the track line (y${L.trackTop}) must stack above the first rule (y${rule1}), 8 rows each`);
  const lastFigure = L.firstRowTop + L.rowPitch * 5;
  if (L.rowPitch < 8) at('endOfDay.value.rowPitch', 'must be at least 8, the main font\'s height');
  if (!(rule1 < L.firstRowTop && lastFigure + 8 <= rule2)) at('endOfDay.value.firstRowTop', `the six figures (y${L.firstRowTop} to y${lastFigure + 7}) must sit between the rules at y${rule1} and y${rule2}`);
  if (!(rule2 < L.lineTop && L.lineTop + 8 <= L.cardRuleTop)) at('endOfDay.value.lineTop', `the day's line (y${L.lineTop}) must sit between the rule at y${rule2} and the card's rule at y${L.cardRuleTop}`);
  if (L.cardTop <= L.cardRuleTop) at('endOfDay.value.cardTop', `must be below the card's rule (y${L.cardRuleTop})`);
  if (L.cardPitch < C.boxSize) at('endOfDay.value.cardPitch', `must be at least the box's ${C.boxSize} rows, or the boxes touch`);
  const lastRowTop = L.cardTop + L.cardPitch * (END_CARD_ROWS - 1);
  const lastRowBottom = lastRowTop + Math.max(7, C.boxDy + C.boxSize - 1);
  if (lastRowBottom >= A.box.y0) at('endOfDay.value.cardTop', `the card's last row (y${lastRowTop}, ending y${lastRowBottom}) must end above the New day box (y${A.box.y0})`);
  // Columns along a card row.
  const raceEnd = C.raceX + 8 * fillTemplate(e.card.race, { r: String(END_CARD_ROWS) }).length;
  if (raceEnd > C.boxX) at('endOfDay.value.card.boxX', `the box starts at x${C.boxX}, but "Race 8" ends at x${raceEnd - 1}`);
  if (C.boxX + C.boxSize > C.oddsX) at('endOfDay.value.card.oddsX', `the odds start at x${C.oddsX}, inside the box (x${C.boxX} to x${C.boxX + C.boxSize - 1})`);
  const paidX = C.ticketLastX + 1 - 8 * END_PAID_CHARS;
  if (C.oddsX + 8 * 4 > paidX) at('endOfDay.value.card.ticketLastX', `the longest ticket starts at x${paidX}, but 4-character odds from x${C.oddsX} end at x${C.oddsX + 31}`);
  if (C.passedX < raceEnd) at('endOfDay.value.card.passedX', `"Passed" starts at x${C.passedX}, but "Race 8" ends at x${raceEnd - 1}`);
  if (C.ticketLastX > L.lastX) at('endOfDay.value.card.ticketLastX', `must not pass the page's right edge (x${L.lastX})`);
  if (C.numberDx < 1 || C.numberDx + 4 > C.boxSize - 1) at('endOfDay.value.card.numberDx', `the 4 px number must sit inside the box's fill (x1 to x${C.boxSize - 2} of the box)`);
  if (C.numberDy < C.boxDy + 1 || C.numberDy + 5 > C.boxDy + C.boxSize - 1) at('endOfDay.value.card.numberDy', 'the 5-row number must sit inside the box\'s fill');
  // The action.
  const [x0, y0, x1, y1] = [A.box.x0, A.box.y0, A.box.x1, A.box.y1];
  if (x0 > x1 || y0 > y1 || x1 > 255 || y1 > 239 || x0 < 0 || y0 < 0) at('endOfDay.value.action.box', 'must be a box inside the screen, with x0 <= x1 and y0 <= y1');
  if (A.top < y0 || A.top + 8 - 1 > y1) at('endOfDay.value.action.top', `the "New day" row (y${A.top}) must lie inside its box (y${y0} to y${y1})`);
  if (A.cursorX + 8 > A.textX) at('endOfDay.value.action.textX', 'must start right of the cursor, which fills 8 columns');
  if (A.textX + 8 * e.newDay.length > L.lastX + 1) at('endOfDay.value.action.textX', `"${e.newDay}" would pass x${L.lastX}`);
}

/**
 * The betting program's header lines 3 and 4 for every race of the day (betting-screens.md
 * BP4): each 30 characters or fewer, or DataError naming day.json and the race.
 */
export function checkProgramLines(races: readonly Race[], raceDay: RaceDay): void {
  const issues: DataIssue[] = [];
  races.forEach((race, i) => {
    const lines: Array<[string, string]> = [
      ['track', programPlaceLine(race, raceDay.copy.card)],
      ['trackBias', programConditionsLine(race, raceDay.copy.card, raceDay.copy.program.bias)],
    ];
    for (const [field, line] of lines) {
      if (line.length > PROGRAM_LINE_CHARS) issues.push({ path: `races[${i}].${field}`, message: `the program prints "${line}", ${line.length} characters; the line holds ${PROGRAM_LINE_CHARS}` });
    }
  });
  if (issues.length > 0) throw new DataError('src/data/day.json', issues);
}

/**
 * Copy the betting screens hold tighter than the Card loop's checks in validateRaceDay, run
 * at boot beside checkProgramLines. The betting result prints "Next race" from the cursor
 * with the bank right-aligned on the same line, so it gets RESULT_ACTION_CHARS (10), not
 * the Card loop's RESULT_NEXT_CHARS (28), which validateRaceDay still applies.
 */
export function checkBettingCopy(raceDay: RaceDay): void {
  const next = raceDay.copy.result.next;
  if (next.length > RESULT_ACTION_CHARS) {
    throw new DataError('src/data/raceDay.json', [{ path: 'copy.result.next', message: `is ${next.length} characters; the betting result prints it beside the bank, where ${RESULT_ACTION_CHARS} fit` }]);
  }
}

// The only place these JSON files are read.
export const loadRaceDay = (game: GameData): RaceDayData => validateRaceDay({ palette, slots, cardLook, raceDay }, game);
