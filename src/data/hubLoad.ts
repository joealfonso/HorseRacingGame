import type { z } from 'zod';
import betting from './betting.json';
import day from './day.json';
import hub from './hub.json';
import palette from './palette.json';
import stable from './stable.json';
import { BOOK_ROW, hubSchema, type Box, type Hub } from './hubSchema';
import { templateHoles, fillTemplate } from './template';
import { DataError, type DataIssue } from './validate';

// Loads and checks the track screen's data (docs/specs/track-hub.md TH1, TH10 and section 7).
// Takes plain objects, so tests can hand it broken data. Every problem in the file is
// reported at once, each with its field, as the other loaders do.

const FILE = 'src/data/hub.json';

/** The internal resolution (CLAUDE.md): every hit box lies inside it. */
export const SCREEN = { w: 256, h: 240 } as const;
/** TH1: every picture hit box is at least this wide and tall. */
export const MIN_HIT = 16;
/** The focus corners are 8x8, four to a box: a focus box needs room for two a side. */
export const MIN_FOCUS = 16;
/** TH10 and section 7: at least three lines per lookable. */
export const MIN_LOOK_LINES = 3;
/** The main font's cell, and the small font's (DESIGN, HUD, UI frame and font). */
const MAIN_W = 8;
const SMALL_W = 4;
const PRINTABLE = /^[\x20-\x7E]*$/;

export interface HubInput {
  hub: unknown;
  /** betting.json's copy.bannedWords. */
  bannedWords: readonly string[];
  /** The palette's color names, for the sky bands. */
  colors: readonly string[];
  /** The most horses a field can have (betting.json field.size): the board must have a cell for each. */
  fieldSize: number;
  /**
   * The odds labels a price can print (betting.json odds.steps), each held to the board's price
   * width. Omitted means the shipped betting.json's.
   */
  oddsLabels?: readonly string[];
  /** Races in a day (day.json): {r} holes are checked at its widest number. Omitted means the shipped day.json's. */
  races?: number;
  /** Every stable horse's name (stable.json), each held to the window's nameChars (23.5). Omitted means the shipped stable.json's. */
  horseNames?: readonly string[];
}

const SHIPPED_ODDS: readonly string[] = betting.odds.steps.value.map((st) => st.label);
const SHIPPED_RACES = day.races.length;
const SHIPPED_NAMES: readonly string[] = stable.horses.map((h) => h.name);

const formatPath = (path: PropertyKey[]): string =>
  path.length === 0 ? '(whole file)' : path.reduce<string>((out, p) => (typeof p === 'number' ? `${out}[${p}]` : out ? `${out}.${String(p)}` : String(p)), '');

function parse<T extends z.ZodType>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  throw new DataError(FILE, result.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message })));
}

const showBox = (b: Box): string => `x${b.x0}-${b.x1}, y${b.y0}-${b.y1}`;
const inside = (b: Box, outer: Box): boolean => b.x0 >= outer.x0 && b.x1 <= outer.x1 && b.y0 >= outer.y0 && b.y1 <= outer.y1;
const overlap = (a: Box, b: Box): boolean => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

export function validateHub(raw: HubInput): Hub {
  const h = parse(hubSchema, raw.hub);
  const issues: DataIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  checkTargets(h, add);
  checkWindow(h, raw.fieldSize, add);
  checkBoard(h, raw.fieldSize, raw.oddsLabels ?? SHIPPED_ODDS, add);
  checkSky(h, new Set(raw.colors), add);
  checkCopy(h, [...raw.bannedWords, ...h.copy.bannedWords], String(raw.races ?? SHIPPED_RACES), add);
  if (issues.length > 0) throw new DataError(FILE, issues);
  // 23.5: a name the window cannot set in nameChars would run into the odds column. The name lives in stable.json, so the error names it.
  const max = h.window.value.nameChars;
  const long: DataIssue[] = [];
  (raw.horseNames ?? SHIPPED_NAMES).forEach((name, i) => {
    if (name.length > max) long.push({ path: `horses[${i}].name`, message: `"${name}" is ${name.length} characters; the window sets ${max} (${FILE} window.value.nameChars)` });
  });
  if (long.length > 0) throw new DataError('src/data/stable.json', long);
  return h;
}

type Add = (path: string, message: string) => void;

function checkTargets(h: Hub, add: Add): void {
  const screen: Box = { x0: 0, y0: 0, x1: SCREEN.w - 1, y1: SCREEN.h - 1 };
  const picture = h.picture.value;
  if (!inside(picture, screen)) add('picture.value', `${showBox(picture)} is not inside the 256x240 screen`);
  const targets = h.targets.value;

  const ids = new Map<string, number>();
  targets.forEach((t, i) => {
    const first = ids.get(t.id);
    if (first !== undefined) add(`targets.value[${i}].id`, `"${t.id}" repeats targets.value[${first}]'s id`);
    else ids.set(t.id, i);
  });

  // The pointer boxes: every target's hit box and every door row's item box.
  const boxes: { path: string; box: Box }[] = targets.map((t, i) => ({ path: `targets.value[${i}].hit`, box: t.hit }));
  h.box.value.doorRows.forEach((r, i) => boxes.push({ path: `box.value.doorRows[${i}].item`, box: r.item }));
  for (const { path, box } of boxes) if (!inside(box, screen)) add(path, `${showBox(box)} is not inside the 256x240 screen`);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = 0; j < i; j++) {
      if (overlap(boxes[i].box, boxes[j].box)) add(boxes[i].path, `${showBox(boxes[i].box)} overlaps ${boxes[j].path} (${showBox(boxes[j].box)})`);
    }
  }

  targets.forEach((t, i) => {
    const w = t.hit.x1 - t.hit.x0 + 1;
    const hh = t.hit.y1 - t.hit.y0 + 1;
    if (w < MIN_HIT || hh < MIN_HIT) add(`targets.value[${i}].hit`, `is ${w}x${hh}; a hit box is at least ${MIN_HIT}x${MIN_HIT}`);
    if (!inside(t.focus, picture)) add(`targets.value[${i}].focus`, `${showBox(t.focus)} is not inside the picture (${showBox(picture)})`);
    const fw = t.focus.x1 - t.focus.x0 + 1;
    const fh = t.focus.y1 - t.focus.y0 + 1;
    if (fw < MIN_FOCUS || fh < MIN_FOCUS) add(`targets.value[${i}].focus`, `is ${fw}x${fh}; the four 8x8 corners need ${MIN_FOCUS}x${MIN_FOCUS}`);
  });

  const doors = targets.filter((t) => t.kind === 'door');
  for (const action of ['window', 'watch'] as const) {
    const n = doors.filter((d) => d.action === action).length;
    if (n !== 1) add('targets.value', `needs exactly one door with action "${action}", has ${n}`);
  }

  // Left and Right: every target once.
  const order = h.targetOrder.value;
  const seen = new Set<string>();
  order.forEach((id, i) => {
    if (!ids.has(id)) add(`targetOrder.value[${i}]`, `"${id}" is not a target`);
    if (seen.has(id)) add(`targetOrder.value[${i}]`, `"${id}" is listed twice`);
    seen.add(id);
  });
  for (const id of ids.keys()) if (!seen.has(id)) add('targetOrder.value', `is missing "${id}"`);

  // One row per door, and one for the book (it has no picture target).
  const rows = h.box.value.doorRows;
  const rowDoors = new Set<string>();
  rows.forEach((r, i) => {
    const t = targets.find((x) => x.id === r.door);
    if (r.door !== BOOK_ROW && (t === undefined || t.kind !== 'door')) add(`box.value.doorRows[${i}].door`, `"${r.door}" is not a door or the book's row "${BOOK_ROW}"`);
    if (rowDoors.has(r.door)) add(`box.value.doorRows[${i}].door`, `"${r.door}" has two rows`);
    rowDoors.add(r.door);
  });
  for (const d of doors) if (!rowDoors.has(d.id)) add('box.value.doorRows', `has no row for the door "${d.id}"`);
  if (!rowDoors.has(BOOK_ROW)) add('box.value.doorRows', `has no row for the book ("${BOOK_ROW}")`);
  rows.forEach((r, i) => {
    if (i > 0 && r.top <= rows[i - 1].top) add(`box.value.doorRows[${i}].top`, `y${r.top} must be below the row before (y${rows[i - 1].top})`);
    if (r.top < r.item.y0 || r.top + 7 > r.item.y1) add(`box.value.doorRows[${i}].item`, `${showBox(r.item)} does not hold the row's text, rows y${r.top}-${r.top + 7}`);
  });
  const lastVoice = Math.max(...h.box.value.voiceTops) + 7;
  if (rows.length > 0 && lastVoice >= rows[0].top) add('box.value.voiceTops', `voice row 2 ends at y${lastVoice}, over the first row at y${rows[0].top}`);

  // Focus lands on a row (TH4: one focus, and a row is always there to land on).
  const f = h.focus.value;
  for (const k of ['arrival', 'back', 'fromLookable'] as const) {
    if (!rowDoors.has(f[k])) add(`focus.value.${k}`, `"${f[k]}" is not a row in box.value.doorRows`);
  }

  // The idle people.
  const people = h.idle.value.order;
  const once = new Set<string>();
  people.forEach((p, i) => {
    if (once.has(p)) add(`idle.value.order[${i}]`, `"${p}" is listed twice`);
    once.add(p);
  });
  targets.forEach((t, i) => {
    if (t.kind === 'lookable' && t.idle !== null && !once.has(t.idle)) add(`targets.value[${i}].idle`, `"${t.idle}" is not in idle.value.order`);
  });
}

/** The window screen fits the screen, its rows fit above the Ash line, and its pointer boxes never overlap. */
function checkWindow(h: Hub, fieldSize: number, add: Add): void {
  const W = h.window.value;
  const screen: Box = { x0: 0, y0: 0, x1: SCREEN.w - 1, y1: SCREEN.h - 1 };
  const F = W.frame;
  if (F.x + 8 * F.tilesW > SCREEN.w || F.y + 8 * F.tilesH > SCREEN.h) add('window.value.frame', `the box runs to x${F.x + 8 * F.tilesW - 1}, y${F.y + 8 * F.tilesH - 1}, off the 256x240 screen`);
  const R = W.rows;
  const lastRowEnd = R.firstTop + R.pitch * (fieldSize - 1) + 8;
  if (lastRowEnd >= W.line.y) add('window.value.rows', `post ${fieldSize}'s row ends at y${lastRowEnd}, over the line at y${W.line.y}`);
  if (W.ticket.tops[0] <= W.line.y) add('window.value.ticket.tops', `ticket row 1 at y${W.ticket.tops[0]} must be under the line at y${W.line.y}`);
  const boxes: { path: string; box: Box }[] = Array.from({ length: fieldSize }, (_v, i) => ({
    path: `window.value.rows (post ${i + 1})`,
    box: { x0: R.hit.x0, y0: R.firstTop + R.pitch * i + R.hit.dy0, x1: R.hit.x1, y1: R.firstTop + R.pitch * i + R.hit.dy1 },
  }));
  boxes.push({ path: 'window.value.ticket.bet', box: W.ticket.bet }, { path: 'window.value.ticket.back', box: W.ticket.back });
  for (const { path, box } of boxes) if (!inside(box, screen) || box.x0 > box.x1 || box.y0 > box.y1) add(path, `${showBox(box)} is not a box inside the 256x240 screen`);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = 0; j < i; j++) if (overlap(boxes[i].box, boxes[j].box)) add(boxes[i].path, `${showBox(boxes[i].box)} overlaps ${boxes[j].path} (${showBox(boxes[j].box)})`);
  }
  if (!inside(W.sign.plate, screen)) add('window.value.sign.plate', `${showBox(W.sign.plate)} is not inside the 256x240 screen`);
}

function checkBoard(h: Hub, fieldSize: number, oddsLabels: readonly string[], add: Add): void {
  const b = h.toteBoard.value;
  const cells = b.perRow * b.rowTops.length;
  if (cells < fieldSize) add('toteBoard.value', `has ${cells} cells; a field can have ${fieldSize} horses`);
  const lastPriceX = b.priceX + b.pitch * (b.perRow - 1) + SMALL_W * b.priceChars - 1;
  if (b.digitX < b.face.x0 || lastPriceX > b.face.x1) add('toteBoard.value', `the posts run x${b.digitX}-${lastPriceX}, outside the face (${showBox(b.face)})`);
  if (b.priceX < b.digitX + SMALL_W) add('toteBoard.value.priceX', `x${b.priceX} would overlap the post digit at x${b.digitX}`);
  // A price longer than the cell would draw into the next pair. The label lives in betting.json,
  // the width here, so the message names both.
  oddsLabels.forEach((label, i) => {
    if (label.length > b.priceChars) {
      add('toteBoard.value.priceChars', `src/data/betting.json odds.steps.value[${i}].label "${label}" is ${label.length} characters; the board's price fits ${b.priceChars}`);
    }
  });
}

function checkSky(h: Hub, colors: ReadonlySet<string>, add: Add): void {
  const steps = h.skyByRace.value;
  steps.forEach((s, i) => {
    const at = `skyByRace.value[${i}]`;
    if (i === 0 && s.fromRace !== 1) add(`${at}.fromRace`, 'the first step must start at race 1');
    if (i > 0 && s.fromRace <= steps[i - 1].fromRace) add(`${at}.fromRace`, `${s.fromRace} must be after ${steps[i - 1].fromRace}; steps rise`);
    s.bands.forEach((band, k) => {
      if (!colors.has(band.color)) add(`${at}.bands[${k}].color`, `"${band.color}" is not a palette color`);
      if (band.y1 < band.y0) add(`${at}.bands[${k}]`, `y${band.y0}-${band.y1} is upside down`);
      if (k > 0 && band.y0 !== s.bands[k - 1].y1 + 1) add(`${at}.bands[${k}].y0`, `must start at y${s.bands[k - 1].y1 + 1}, right under the band before`);
    });
    // Every step fills the same rows, so the sky never shows a gap between races.
    const first = steps[0].bands;
    const top = first[0].y0;
    const bottom = first[first.length - 1].y1;
    if (s.bands[0].y0 !== top || s.bands[s.bands.length - 1].y1 !== bottom) add(`${at}.bands`, `must fill y${top}-${bottom}, as the first step does`);
  });
}

function checkCopy(h: Hub, banned: readonly string[], widestRace: string, add: Add): void {
  const chars = h.box.value.chars;
  const all: { path: string; text: string }[] = [];
  /** Checks a line's holes, fills it with the widest values, and holds it to `max` characters. */
  const line = (path: string, template: string, max: number, holes: readonly string[] = []) => {
    for (const hole of templateHoles(template)) if (!holes.includes(hole)) add(path, `has an unknown hole {${hole}}`);
    const filled = fillTemplate(template, { r: widestRace });
    if (filled.length > max) add(path, `"${filled}" is ${filled.length} characters; at most ${max}`);
    if (!PRINTABLE.test(template)) add(path, 'must be printable ASCII (the main font has no other glyphs)');
    all.push({ path, text: filled });
  };

  const c = h.copy;
  for (const k of ['first', 'last', 'toRail', 'toRailSecond'] as const) line(`copy.state.${k}`, c.state[k], chars);
  line('copy.state.next', c.state.next, chars, ['r']);
  c.flavor.forEach((t, i) => line(`copy.flavor[${i}]`, t, chars));

  const targets = h.targets.value;
  const rowIds = h.box.value.doorRows.map((r) => r.door);
  for (const id of rowIds) {
    const t = c.doors[id];
    if (t === undefined) add(`copy.doors.${id}`, `missing: the row "${id}" needs a label`);
    else line(`copy.doors.${id}`, t, chars, ['r']);
  }
  for (const k of Object.keys(c.doors)) if (!rowIds.includes(k)) add(`copy.doors.${k}`, `"${k}" is not a row in box.value.doorRows`);

  // The window's clerk and its back item (book-and-window.md sections 7 and 13).
  line('copy.window.choose', c.window.choose, chars, ['r']);
  c.window.ticket.forEach((t, i) => line(`copy.window.ticket[${i}]`, t, chars));
  c.window.punch.forEach((t, i) => line(`copy.window.punch[${i}]`, t, chars));
  const back = h.window.value.ticket.back;
  line('copy.window.back', c.window.back, Math.floor((back.x1 - back.x0 + 1) / MAIN_W));
  // aria-live only: no width, but every hole must be known (23.6).
  line('copy.window.aria.row', c.window.aria.row, Infinity, ['n', 'name', 'odds']);
  line('copy.window.aria.ticket', c.window.aria.ticket, Infinity, ['amount', 'n']);
  const wplate = h.window.value.sign.plate;
  line('copy.sign.windows', c.sign.windows, Math.floor((wplate.x1 - wplate.x0 + 1) / MAIN_W));

  const b = h.toteBoard.value;
  line('copy.board.race', c.board.race, Math.floor((b.header.lastX - b.header.x + 1) / MAIN_W), ['r']);
  const plate = h.sign.value.plate;
  line('copy.sign.windows', c.sign.windows, Math.floor((plate.x1 - plate.x0 + 1) / MAIN_W));

  const lookables = targets.filter((t) => t.kind === 'lookable');
  for (const t of lookables) {
    const look = c.lookables[t.id];
    if (look === undefined) { add(`copy.lookables.${t.id}`, `missing: the lookable "${t.id}" needs a name and lines`); continue; }
    line(`copy.lookables.${t.id}.name`, look.name, chars);
    if (look.lines.length < MIN_LOOK_LINES) add(`copy.lookables.${t.id}.lines`, `has ${look.lines.length}; at least ${MIN_LOOK_LINES}`);
    look.lines.forEach((l, i) => line(`copy.lookables.${t.id}.lines[${i}]`, l, chars));
  }
  for (const k of Object.keys(c.lookables)) if (!lookables.some((t) => t.id === k)) add(`copy.lookables.${k}`, `"${k}" is not a lookable`);

  // Case-insensitive and inside words, so "buys" and "cashier" fail too.
  for (const { path, text } of all) {
    for (const w of banned) if (text.toLowerCase().includes(w.toLowerCase())) add(path, `"${text}" contains the banned word "${w}"`);
  }
}

// The only place hub.json is read.
export const loadHub = (): Hub => validateHub({
  horseNames: SHIPPED_NAMES,
  hub,
  bannedWords: betting.copy.bannedWords,
  colors: palette.colors.map((c) => c.name),
  fieldSize: betting.field.size.value,
  oddsLabels: SHIPPED_ODDS,
  races: SHIPPED_RACES,
});
