import type { z } from 'zod';
import betting from './betting.json';
import day from './day.json';
import palette from './palette.json';
import stable from './stable.json';
import { drawProblem } from '../bet/fieldDraw';
import { rulesFrom, type BettingRules } from '../bet/rules';
import {
  MAX_PER_SILKS_BODY, MIN_PER_STYLE, TRIPLE_CROWN_WINNERS, bettingSchema, daySchema, stableSchema,
  type Betting, type StableHorse,
} from './bettingSchema';
import { MAX_RACE_NAME, validateRaceDay, type RaceDayData } from './raceDayLoad';
import { paletteSchema } from './raceDaySchema';
import { RUNNING_STYLES, type GameData, type Race } from './schema';
import { DataError, validateData, type DataIssue } from './validate';

// Loads and checks the betting game's three files against the shipped sim data (ST1).
// Takes plain objects, so tests can hand it broken data. Stops at the first bad file. Order:
// betting.json; every per-horse rule on stable.json; day.json, checked with a synthetic card
// no stable content can fail, so a horse's problem is only ever reported against stable.json;
// then the stable's draw check, which needs the day's race count.

export interface BettingData {
  stable: StableHorse[];
  races: Race[];
  betting: Betting;
  rules: BettingRules;
}

const formatPath = (path: PropertyKey[]): string =>
  path.length === 0 ? '(whole file)' : path.reduce<string>((out, p) => (typeof p === 'number' ? `${out}[${p}]` : out ? `${out}.${String(p)}` : String(p)), '');

const fold = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

function parse<T extends z.ZodType>(file: string, schema: T, raw: unknown, label?: (path: PropertyKey[]) => string): z.infer<T> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  throw new DataError(`src/data/${file}.json`, result.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message + (label?.(i.path) ?? '') })));
}

/** " (horse "Name")" for an issue under horses[i], when that horse has a name to show. */
function horseLabel(raw: unknown): (path: PropertyKey[]) => string {
  return (path) => {
    if (path[0] !== 'horses' || typeof path[1] !== 'number') return '';
    const horses = (raw as { horses?: unknown } | null)?.horses;
    const name = Array.isArray(horses) ? (horses[path[1]] as { name?: unknown } | undefined)?.name : undefined;
    return typeof name === 'string' ? ` (horse "${name}")` : '';
  };
}

export function validateBetting(raw: { stable: unknown; day: unknown; betting: unknown; palette: unknown }, game: GameData): BettingData {
  const betting = parse('betting', bettingSchema, raw.betting);
  checkBetting(betting);
  const stable = parse('stable', stableSchema, raw.stable, horseLabel(raw.stable)).horses;
  const palette = parse('palette', paletteSchema, raw.palette);
  checkHorses(stable, [...palette.silksBands.dark, ...palette.silksBands.mid, ...palette.silksBands.light], game.tuning.statRange.value);
  const day = parse('day', daySchema, raw.day);
  checkDay(day.races, game);
  const rules = rulesFrom(betting, day.races.length);
  checkDrawable(stable, rules);
  return { stable, races: day.races, betting, rules };
}

function fail(file: string, issues: DataIssue[]): void {
  if (issues.length > 0) throw new DataError(`src/data/${file}.json`, issues);
}

function checkBetting(b: Betting): void {
  const issues: DataIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  const amounts = b.bets.amountsDollars.value;
  amounts.forEach((d, i) => {
    if (d < b.bets.minDollars.value) add(`bets.amountsDollars.value[${i}]`, `is $${d}, below the minimum bet of $${b.bets.minDollars.value}`);
    if (i > 0 && d <= amounts[i - 1]) add(`bets.amountsDollars.value[${i}]`, `is $${d}; amounts must rise`);
  });
  if (!amounts.includes(b.bets.minDollars.value)) add('bets.amountsDollars.value', `must offer the minimum bet, $${b.bets.minDollars.value}`);
  if (b.bankroll.startDollars.value < b.bets.minDollars.value) add('bankroll.startDollars.value', `is $${b.bankroll.startDollars.value}, below the minimum bet; no race could be bet`);

  const steps = b.odds.steps.value;
  steps.forEach((s, i) => {
    if (s.label !== `${s.odds[0]}-${s.odds[1]}`) add(`odds.steps.value[${i}].label`, `"${s.label}" does not match its odds ${s.odds[0]}-${s.odds[1]}`);
    // Rising: a/b < c/d, compared as a*d < c*b to stay in whole numbers.
    if (i > 0 && !(steps[i - 1].odds[0] * s.odds[1] < s.odds[0] * steps[i - 1].odds[1])) add(`odds.steps.value[${i}]`, `${s.label} must be longer than ${steps[i - 1].label}; steps rise`);
  });
  if (steps[0].label !== '1-9') add('odds.steps.value[0]', `must be 1-9, got ${steps[0].label}`);
  if (steps[steps.length - 1].label !== '99-1') add(`odds.steps.value[${steps.length - 1}]`, `must be 99-1, got ${steps[steps.length - 1].label}`);
  const labels = new Set(steps.map((s) => s.label));
  const bands = b.harness.bands.value;
  const named: Array<[string, string]> = [
    ['favoriteMedianOdds.shortest', bands.favoriteMedianOdds.shortest], ['favoriteMedianOdds.longest', bands.favoriteMedianOdds.longest],
    ['shortFavorite.oddsOrShorter', bands.shortFavorite.oddsOrShorter], ['longshot.oddsOrLonger', bands.longshot.oddsOrLonger],
    ['flatField.from', bands.flatField.from], ['flatField.to', bands.flatField.to],
  ];
  for (const [path, label] of named) if (!labels.has(label)) add(`harness.bands.value.${path}`, `"${label}" is not one of odds.steps`);
  fail('betting', issues);
}

// Two plain horses for checking a race on its own: valid at any stat range, never stable content.
function syntheticCard(statMin: number) {
  const stats = { speed: statMin, stamina: statMin, kick: statMin };
  const horse = (k: number) => ({ id: `check${k}`, name: `Check ${k}`, jockey: `Check ${k}`, post: k, style: 'stalker', stats, instructions: { early: 'default', move: 'default', path: 'default' } });
  return { horses: [horse(1), horse(2)] };
}

function checkDay(races: Race[], game: GameData): void {
  const issues: DataIssue[] = [];
  const names = new Map<string, number>();
  races.forEach((race, i) => {
    if (race.name.length > MAX_RACE_NAME) issues.push({ path: `races[${i}].name`, message: `must be ${MAX_RACE_NAME} characters or fewer` });
    const seen = names.get(fold(race.name));
    if (seen !== undefined) issues.push({ path: `races[${i}].name`, message: `"${race.name}" is already races[${seen}]'s name` });
    else names.set(fold(race.name), i);
    // The sim's own cross-file rules (track, surface, going, pace par, bias), on a synthetic card.
    try {
      validateData({ track: game.track, race, card: syntheticCard(game.tuning.statRange.value.min), tuning: game.tuning });
    } catch (err) {
      if (!(err instanceof DataError)) throw err;
      for (const issue of err.issues) issues.push({ path: `races[${i}]`, message: `${err.file}: ${issue.path}: ${issue.message}` });
    }
  });
  fail('day', issues);
}

function checkHorses(stable: StableHorse[], silksColors: string[], statRange: { min: number; max: number }): void {
  const issues: DataIssue[] = [];
  const add = (i: number, field: string, message: string) => issues.push({ path: `horses[${i}]${field ? `.${field}` : ''}`, message: `${message} (horse "${stable[i].name}")` });
  const silks = new Set(silksColors);
  const banned = new Set(TRIPLE_CROWN_WINNERS.map(fold));
  const seen = { id: new Map<string, number>(), name: new Map<string, number>(), jockey: new Map<string, number>() };

  stable.forEach((h, i) => {
    for (const [field, key] of [['id', h.id], ['name', fold(h.name)], ['jockey', fold(h.jockey)]] as const) {
      const first = seen[field].get(key);
      if (first !== undefined) add(i, field, `"${h[field]}" repeats horses[${first}]'s ${field}${field === 'id' ? '' : ' (ignoring case and spacing)'}`);
      else seen[field].set(key, i);
    }
    if (banned.has(fold(h.name))) add(i, 'name', `"${h.name}" is a Triple Crown winner's name`);
    if (!silks.has(h.silks.body)) add(i, 'silks.body', `"${h.silks.body}" is not one of the 18 silks colors`);
    if (!silks.has(h.silks.cap)) add(i, 'silks.cap', `"${h.silks.cap}" is not one of the 18 silks colors`);
    // The sim's stat range (tuning.statRange) too, so a tightened range fails here, not when the horse is drawn.
    for (const k of ['speed', 'stamina', 'kick'] as const) {
      const v = h.stats[k];
      if (v < statRange.min || v > statRange.max) add(i, `stats.${k}`, `is ${v}; src/data/tuning.json statRange allows ${statRange.min} to ${statRange.max}`);
    }
  });

  const bodies = new Map<string, number[]>();
  stable.forEach((h, i) => bodies.set(h.silks.body, [...(bodies.get(h.silks.body) ?? []), i]));
  for (const [body, who] of bodies) {
    if (who.length > MAX_PER_SILKS_BODY) {
      issues.push({ path: `horses[${who[MAX_PER_SILKS_BODY]}].silks.body`, message: `"${body}" is the body color of ${who.length} horses (${who.map((i) => `"${stable[i].name}"`).join(', ')}); at most ${MAX_PER_SILKS_BODY}` });
    }
  }
  for (const style of RUNNING_STYLES) {
    const n = stable.filter((h) => h.style === style).length;
    if (n < MIN_PER_STYLE) issues.push({ path: 'horses', message: `${n} ${style}s; the stable needs at least ${MIN_PER_STYLE} of each style` });
  }
  fail('stable', issues);
}

function checkDrawable(stable: StableHorse[], rules: BettingRules): void {
  const problem = drawProblem(stable.map((h) => ({ id: h.id, silksBody: h.silks.body })), rules.draw);
  if (problem !== null) fail('stable', [{ path: 'horses', message: `does not fit the day's draw: ${problem}` }]);
}

/**
 * One drawn field in the race-day screens' shapes: a card (ids by post) and its looks. The
 * race-day loader's checks (a look for every horse, no shared jacket, stats of 99 or less,
 * jockeys of 22 or less) then run on it through validateRaceDay, as they do on card.json.
 */
export function fieldForRaceDay(data: BettingData, input: GameData): { game: GameData; cardLook: Record<string, { coat: string; silks: { body: string; cap: string }; blurb: string }> } {
  const byId = new Map(data.stable.map((h) => [h.id, h]));
  const cardLook = Object.fromEntries(input.card.horses.map((h) => {
    const s = byId.get(h.id);
    if (s === undefined) throw new Error(`horse ${h.id} is not in the stable`);
    return [h.id, { coat: s.coat, silks: { ...s.silks }, blurb: s.blurb }];
  }));
  return { game: input, cardLook };
}

/** The race-day loader's checks on one drawn field. Throws DataError, naming cardLook.json or card.json for the field. */
export function checkFieldForRaceDay(
  data: BettingData, input: GameData, raw: { palette: unknown; slots: unknown; raceDay: unknown },
): RaceDayData {
  const { game, cardLook } = fieldForRaceDay(data, input);
  return validateRaceDay({ palette: raw.palette, slots: raw.slots, cardLook, raceDay: raw.raceDay }, game);
}

// The only place these JSON files are read.
export const loadBetting = (game: GameData): BettingData => validateBetting({ stable, day, betting, palette }, game);
