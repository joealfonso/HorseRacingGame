import { z } from 'zod';
import { COATS } from './raceDaySchema';
import { MAX_NAME_LENGTH, RUNNING_STYLES, marked, raceSchema } from './schema';

// Schemas for the betting game's data (docs/specs/betting-simple.md): the stable, the day's
// races and the betting values. Like schema.ts, no JSON is imported here. The cross-file
// rules (silks colors, counts, the draw) are in bettingLoad.ts.

const text = z.string()
  .refine((s) => s.trim().length > 0, { error: 'must not be empty or only spaces' })
  .refine((s) => s === s.trim(), { error: 'must not start or end with spaces' });
const whole = z.int({ error: 'must be a whole number' });

// ST1 bounds.
export const MAX_JOCKEY_CHARS = 22;
export const MAX_BLURB_CHARS = 28;
export const MIN_STAT = 1;
export const MAX_STAT = 99;
export const MAX_PER_SILKS_BODY = 3;
export const MIN_PER_STYLE = 12;

// The 13 Triple Crown winners. No stable horse may carry one of these names (ignoring case and spacing).
export const TRIPLE_CROWN_WINNERS = [
  'Sir Barton', 'Gallant Fox', 'Omaha', 'War Admiral', 'Whirlaway', 'Count Fleet', 'Assault',
  'Citation', 'Secretariat', 'Seattle Slew', 'Affirmed', 'American Pharoah', 'Justify',
] as const;

const stat = whole
  .min(MIN_STAT, { error: `must be a whole number from ${MIN_STAT} to ${MAX_STAT}` })
  .max(MAX_STAT, { error: `must be a whole number from ${MIN_STAT} to ${MAX_STAT}` });

// Printable ASCII only: no tab, accent or invisible character can make two names look alike.
const PRINTABLE = /^[\x20-\x7E]*$/;
const PRINTABLE_ERROR = 'must be printable ASCII (letters, digits, spaces and plain punctuation)';

export const stableHorseSchema = z.strictObject({
  id: text,
  name: text.max(MAX_NAME_LENGTH, { error: `must be ${MAX_NAME_LENGTH} characters or fewer` }).regex(PRINTABLE, { error: PRINTABLE_ERROR }),
  jockey: text.max(MAX_JOCKEY_CHARS, { error: `must be ${MAX_JOCKEY_CHARS} characters or fewer` }).regex(PRINTABLE, { error: PRINTABLE_ERROR }),
  style: z.enum(RUNNING_STYLES, { error: `unknown running style, use one of ${RUNNING_STYLES.join(', ')}` }),
  stats: z.strictObject({ speed: stat, stamina: stat, kick: stat }),
  coat: z.enum(COATS, { error: `unknown coat, use one of ${COATS.join(', ')}` }),
  silks: z.strictObject({ body: text, cap: text }),
  blurb: text
    .max(MAX_BLURB_CHARS, { error: `must be ${MAX_BLURB_CHARS} characters or fewer` })
    .regex(PRINTABLE, { error: PRINTABLE_ERROR }),
});

export const stableSchema = z.strictObject({ horses: z.array(stableHorseSchema).min(1, { error: 'needs at least one horse' }) });

export const daySchema = z.strictObject({ races: z.array(raceSchema).min(1, { error: 'needs at least one race' }) });

const shareOf = (low: number, high: number) => z.number().min(low).max(high);
const range = z.strictObject({ min: z.number(), max: z.number() }).refine((r) => r.min <= r.max, { error: 'min must not be above max' });
const oddsLabel = z.string().regex(/^\d+-\d+$/, { error: 'must be odds like "5-2"' });

export const bettingSchema = z.strictObject({
  bankroll: z.strictObject({ startDollars: marked(whole.min(2)) }),
  bets: z.strictObject({
    minDollars: marked(whole.min(1)),
    amountsDollars: marked(z.array(whole.min(1)).min(1)),
    capBasisPoints: marked(whole.min(1).max(10000)),
  }),
  field: z.strictObject({
    size: marked(whole.min(2).max(8)),
    maxStartsPerDay: marked(whole.min(1)),
    racesBeforeRerun: marked(whole.min(1)),
  }),
  estimate: z.strictObject({ runsPerRace: marked(whole.min(100).max(5000)) }),
  pool: z.strictObject({
    crowdDollars: marked(whole.min(1000)),
    takeoutBasisPoints: marked(whole.min(0).max(5000)),
    breakageCents: marked(z.union([z.literal(1), z.literal(5), z.literal(10), z.literal(20)], { error: 'must be 1, 5, 10 or 20' })),
    minPayoffPerDollarCents: marked(whole.min(100).max(200)),
  }),
  crowd: z.strictObject({
    noise: marked(shareOf(0, 0.9)),
    styleLean: marked(z.strictObject({ frontRunner: shareOf(-0.5, 0.5), stalker: shareOf(-0.5, 0.5), closer: shareOf(-0.5, 0.5) })),
    flatten: marked(shareOf(0, 0.5)),
  }),
  odds: z.strictObject({
    steps: marked(z.array(z.strictObject({ label: oddsLabel, odds: z.tuple([whole.min(1), whole.min(1)]) })).min(2)),
  }),
  harness: z.strictObject({
    valueThreshold: marked(z.number().gt(1)),
    bands: marked(z.strictObject({
      randomReturnPerDollar: range,
      favoriteReturnPerDollar: range,
      longestReturnPerDollar: range,
      valueReturnPerDollarMin: z.number(),
      valueBetPercentMin: shareOf(0, 100),
      favoriteWinPercent: range,
      favoriteMedianOdds: z.strictObject({ shortest: oddsLabel, longest: oddsLabel }),
      shortFavorite: z.strictObject({ oddsOrShorter: oddsLabel, fieldsPercentMin: shareOf(0, 100) }),
      longshot: z.strictObject({ oddsOrLonger: oddsLabel, fieldsPercentMin: shareOf(0, 100) }),
      flatField: z.strictObject({ from: oddsLabel, to: oddsLabel, fieldsPercentMax: shareOf(0, 100) }),
      calibration: z.strictObject({ groupEdgesPercent: z.array(z.number()).min(1), withinPoints: z.number().min(0) }),
      blindRuleReturnPerDollarMax: z.number(),
    })),
  }),
  copy: z.strictObject({ bannedWords: z.array(text).min(1) }),
});

export type StableHorse = z.infer<typeof stableHorseSchema>;
export type Stable = z.infer<typeof stableSchema>;
export type Day = z.infer<typeof daySchema>;
export type Betting = z.infer<typeof bettingSchema>;
