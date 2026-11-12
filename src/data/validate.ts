import type { z } from 'zod';
import { cardSchema, raceSchema, trackSchema, tuningSchema, type GameData } from './schema';

export type DataIssue = { path: string; message: string };

// Message format, one line per problem:
//   src/data/card.json: horses[2].stats.speed: must be at most 100
export class DataError extends Error {
  constructor(readonly file: string, readonly issues: DataIssue[]) {
    super(issues.map((i) => `${file}: ${i.path}: ${i.message}`).join('\n'));
    this.name = 'DataError';
  }
}

function formatPath(path: PropertyKey[]): string {
  if (path.length === 0) return '(whole file)';
  return path.reduce<string>((out, p) => (typeof p === 'number' ? `${out}[${p}]` : out ? `${out}.${String(p)}` : String(p)), '');
}

function parse<T extends z.ZodType>(file: string, schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  throw new DataError(`src/data/${file}.json`, result.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message })));
}

// Takes plain objects so tests can hand it broken data. Stops at the first bad file,
// tuning first because the card's stat range comes from it.
export function validateData(raw: { track: unknown; race: unknown; card: unknown; tuning: unknown }): GameData {
  const tuning = parse('tuning', tuningSchema, raw.tuning);
  const track = parse('track', trackSchema, raw.track);
  const race = parse('race', raceSchema, raw.race);
  const { min, max } = tuning.statRange.value;
  const card = parse('card', cardSchema(min, max), raw.card);

  const fail = (file: string, path: string, message: string) => {
    throw new DataError(`src/data/${file}.json`, [{ path, message }]);
  };
  if (race.track !== track.name) fail('race', 'track', `"${race.track}" does not match the track file's name "${track.name}"`);
  if (race.surface !== track.surface) fail('race', 'surface', `${race.surface} does not match the track's ${track.surface}`);
  if (!(race.going in tuning.goingTimeAddedPercent)) fail('tuning', `goingTimeAddedPercent.${race.going}`, `missing, the race is on ${race.going}`);
  if (!tuning.paceParHalfMile[String(race.distanceFurlongs)]?.[race.going]) {
    fail('tuning', `paceParHalfMile.${race.distanceFurlongs}.${race.going}`, 'missing, the race needs a pace par for its distance and going');
  }
  return { track, race, card, tuning };
}
