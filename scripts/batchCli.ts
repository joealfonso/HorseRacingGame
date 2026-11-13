import { readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { validateData, DataError } from '../src/data/validate';
import card from '../src/data/card.json';
import race from '../src/data/race.json';
import track from '../src/data/track.json';
import tuning from '../src/data/tuning.json';
import { runBatch } from '../src/sim/batch';
import { SIM_VERSION } from '../src/sim/runRace';
import { formatReport } from './batchReport';

// The command line side of the batch runner. Reads files, keeps time, prints. The rules are in src/sim/batch.ts.

const MAX_SEED = 4294967295;
const FILE_FLAGS = ['card', 'race', 'track', 'tuning'] as const;
type FileKey = (typeof FILE_FLAGS)[number];

const USAGE = `usage: npm run batch -- [--races N] [--seed-start S] [--card FILE] [--race FILE] [--track FILE] [--tuning FILE] [--out FILE]
  --races N        number of races, default 10000
  --seed-start S   first seed, default 0 (seeds run S to S+N-1, at most ${MAX_SEED})
  --card/--race/--track/--tuning FILE   JSON file to use in place of the shipped one
  --out FILE       also write the summary text to this file`;

class UsageError extends Error {}

interface Args { races: number; seedStart: number; files: Partial<Record<FileKey, string>>; out?: string }

function wholeNumber(flag: string, text: string): number {
  if (!/^\d+$/.test(text)) throw new UsageError(`${flag} needs a whole number of zero or more, got "${text}"`);
  return Number(text);
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { races: 10000, seedStart: 0, files: {} };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!flag.startsWith('--')) throw new UsageError(`unexpected argument "${flag}"`);
    const name = flag.slice(2);
    const known = name === 'races' || name === 'seed-start' || name === 'out' || (FILE_FLAGS as readonly string[]).includes(name);
    if (!known) throw new UsageError(`unknown option ${flag}`);
    if (value === undefined || value.startsWith('--')) throw new UsageError(`${flag} needs a value`);
    if (name === 'races') args.races = wholeNumber(flag, value);
    else if (name === 'seed-start') args.seedStart = wholeNumber(flag, value);
    else if (name === 'out') args.out = value;
    else args.files[name as FileKey] = value;
  }
  if (args.races < 1) throw new UsageError('--races must be at least 1');
  if (args.seedStart > MAX_SEED) throw new UsageError(`--seed-start must be at most ${MAX_SEED}`);
  if (args.seedStart + args.races - 1 > MAX_SEED) throw new UsageError(`seeds ${args.seedStart} to ${args.seedStart + args.races - 1} run past ${MAX_SEED}; lower --races or --seed-start`);
  return args;
}

function readJson(flag: string, path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    throw new UsageError(`--${flag}: cannot read ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new UsageError(`--${flag}: ${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// The real location of a path, following links. A path that does not exist yet is just made absolute.
function realPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/** Fail before any race runs if --out cannot be written, or would replace a file the run reads. Creates nothing. */
function checkOutPath(path: string, inputs: string[]): void {
  if (/[\\/]$/.test(path)) throw new UsageError(`--out: ${path} ends in a slash, it needs a file name`);
  const dir = dirname(path);
  let dirStat;
  try {
    dirStat = statSync(dir);
  } catch {
    throw new UsageError(`--out: folder ${dir} does not exist`);
  }
  if (!dirStat.isDirectory()) throw new UsageError(`--out: ${dir} is not a folder`);
  const real = realPath(path);
  for (const input of inputs) {
    if (realPath(input) === real) throw new UsageError(`--out: ${path} is one of the data files this run reads, it would be replaced`);
  }
  let fileStat;
  try {
    fileStat = statSync(path);
  } catch {
    return; // the file does not exist yet, which is fine
  }
  if (fileStat.isDirectory()) throw new UsageError(`--out: ${path} is a folder, not a file`);
}

// Returns the exit code: 0 when the run finished (flags included), 1 for bad arguments or bad data.
export function main(argv: string[]): number {
  const custom: string[] = [];
  try {
    const args = parseArgs(argv);
    const shipped = { track, race, card, tuning };
    const raw: Record<FileKey, unknown> = { ...shipped };
    const used: Record<FileKey, string> = { card: 'shipped', race: 'shipped', track: 'shipped', tuning: 'shipped' };
    for (const k of FILE_FLAGS) {
      const path = args.files[k];
      if (path !== undefined) {
        raw[k] = readJson(k, path);
        used[k] = path;
        custom.push(`${k} = ${path}`);
      }
    }
    const data = validateData(raw);
    if (args.out !== undefined) checkOutPath(args.out, FILE_FLAGS.flatMap((k) => args.files[k] ?? []));
    const started = performance.now();
    const summary = runBatch(data, args.seedStart, args.races);
    const elapsedSeconds = (performance.now() - started) / 1000;
    const text = formatReport(summary, { simVersion: SIM_VERSION, files: used, elapsedSeconds });
    process.stdout.write(text);
    if (args.out !== undefined) {
      try {
        writeFileSync(args.out, text);
      } catch (err) {
        console.error(`could not write ${args.out}: ${err instanceof Error ? err.message : String(err)}`);
        return 1;
      }
    }
    return 0;
  } catch (err) {
    if (err instanceof UsageError) console.error(`${err.message}\n\n${USAGE}`);
    else if (err instanceof DataError) console.error(`bad data (files named src/data/... are the shipped names; replaced here: ${custom.join(', ') || 'none'}):\n${err.message}`);
    else throw err;
    return 1;
  }
}
