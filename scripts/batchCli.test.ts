import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import card from '../src/data/card.json';
import tuning from '../src/data/tuning.json';
import { DataError, validateData } from '../src/data/validate';
import race from '../src/data/race.json';
import track from '../src/data/track.json';
import { runBatch } from '../src/sim/batch';
import { formatReport } from './batchReport';

// M1.6 F1 and F6, through the real command as a child process. Small --races only. The command is not
// part of the sim, so these tests live here and not under src/sim/.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts', 'batch.mjs');
const shippedData = () => validateData(structuredClone({ track, race, card, tuning }));

interface Ran { code: number | null; out: string; err: string }
function batch(...args: string[]): Ran {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

// Every file in the repo except tool folders, so a stray write anywhere shows up.
function listRepo(dir = ROOT, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', 'dist', 'coverage', '.claude', '.DS_Store'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) listRepo(p, found);
    else found.push(p);
  }
  return found.sort();
}

let work: string;
beforeAll(() => { work = mkdtempSync(join(tmpdir(), 'batch-cli-test-')); });
afterAll(() => { rmSync(work, { recursive: true, force: true }); });

const writeJson = (name: string, value: unknown): string => {
  const p = join(work, name);
  writeFileSync(p, JSON.stringify(value));
  return p;
};

describe('M1.6 command: a normal run (F1)', () => {
  it('exits 0, prints a summary of the shipped card, and writes no file anywhere', () => {
    const repoBefore = listRepo();
    const workBefore = readdirSync(work);
    const r = batch('--races', '12', '--seed-start', '300');
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    expect(r.out.length).toBeGreaterThan(0);

    // The numbers printed are the ones the batch counts for this seed range.
    const summary = runBatch(shippedData(), 300, 12);
    for (const h of summary.card.horses) {
      // The table row starts with the name. The F5 check lines also name a horse, so a bare
      // includes() could land on a check line, which prints the percent to two places.
      const line = r.out.split('\n').find((l) => l.startsWith(h.name));
      expect(line, h.name).toBeDefined();
      expect(line).toContain(h.winPercent.toFixed(1));
    }
    expect(r.out).toContain('12');
    expect(r.out).toContain('300');
    expect(r.out).toContain('311');

    expect(listRepo()).toEqual(repoBefore);
    expect(readdirSync(work)).toEqual(workBefore);
  });

  it('a different seed start prints a different summary', () => {
    const a = batch('--races', '12', '--seed-start', '300');
    const b = batch('--races', '12', '--seed-start', '9000');
    expect(a.code).toBe(0);
    expect(b.code).toBe(0);
    const strip = (s: string) => s.split('\n').filter((l) => !l.startsWith('elapsed')).join('\n');
    expect(strip(b.out)).not.toBe(strip(a.out));
  });
});

describe('M1.6 command: a FLAG is a tuning note, not a failure (F6)', () => {
  it('a band that cannot be met still exits 0 and prints the check, its name and the measured value', () => {
    const impossible = structuredClone(tuning);
    impossible.checks.photoFinishPercentBand.value = { min: 100, max: 100 };
    const file = writeJson('tuning-impossible.json', impossible);
    const r = batch('--races', '12', '--tuning', file);
    expect(r.code).toBe(0);
    const summary = runBatch(validateData({ track, race, card, tuning: impossible }), 0, 12);
    const failed = summary.checks.filter((c) => !c.pass);
    expect(failed.length).toBeGreaterThan(0);
    const photo = failed.find((c) => c.id === 'F4' && c.measured === summary.card.photoFinishPercent)!;
    const flagLines = r.out.split('\n').filter((l) => l.includes('FLAG'));
    expect(flagLines.length).toBeGreaterThanOrEqual(failed.length);
    const line = flagLines.find((l) => l.includes('F4') && l.toLowerCase().includes('photo'));
    expect(line, flagLines.join('\n')).toBeDefined();
    expect(line).toContain(photo.measured.toFixed(2));
    expect(line).toContain('100');
    expect(r.out).toContain(file);
  });

  it('a run where every check passes prints no FLAG line', () => {
    const wideBand = { min: 0, max: 100 };
    const wide = structuredClone(tuning);
    wide.checks.fairnessTolerancePoints.value = 100;
    wide.checks.closeWinPercentBand.value = wideBand;
    wide.checks.photoFinishPercentBand.value = wideBand;
    wide.checks.leaderAtEighthLosesPercentBand.value = wideBand;
    wide.checks.cardWinSharePercentBand.value = wideBand;
    const r = batch('--races', '10', '--tuning', writeJson('tuning-wide.json', wide));
    expect(r.code).toBe(0);
    expect(r.out.split('\n').filter((l) => l.startsWith('FLAG'))).toEqual([]);
  });
});

describe('M1.6 command: bad arguments exit non-zero with a message and run nothing', () => {
  const cases: [string, string[]][] = [
    ['--races 0', ['--races', '0']],
    ['--races abc', ['--races', 'abc']],
    ['--races -5', ['--races', '-5']],
    ['--races 2.5', ['--races', '2.5']],
    ['--races with no value', ['--races']],
    ['--races followed by another flag', ['--races', '--seed-start', '5']],
    ['an unknown flag', ['--races', '10', '--bogus', '1']],
    ['--seed-start abc', ['--seed-start', 'abc']],
    ['--seed-start with no value', ['--races', '10', '--seed-start']],
    ['a seed range past the largest seed', ['--races', '10', '--seed-start', '4294967295']],
    ['--out with no value', ['--races', '10', '--out']],
    ['a --card file that does not exist', ['--races', '10', '--card', '/nonexistent/card.json']],
  ];
  it.each(cases)('%s', (_name, args) => {
    const before = listRepo();
    const r = batch(...args);
    expect(r.code).not.toBe(0);
    expect(r.code).not.toBeNull();
    expect(r.err.trim().length).toBeGreaterThan(0);
    expect(r.out).not.toContain('FLAG');
    expect(r.out).not.toContain('PASS');
    expect(listRepo()).toEqual(before);
  });
});

describe('M1.6 command: replacement data that fails validation', () => {
  it('exits non-zero, prints the data error, prints no summary and writes no --out file', () => {
    const bad = structuredClone(card);
    bad.horses[1].id = bad.horses[0].id; // duplicate id
    bad.horses[2].stats.speed = 500; // out of range
    const file = writeJson('card-bad.json', bad);
    const out = join(work, 'should-not-exist.txt');
    let message = '';
    try {
      validateData({ track, race, card: bad, tuning });
    } catch (e) {
      expect(e).toBeInstanceOf(DataError);
      message = (e as Error).message;
    }
    expect(message.length).toBeGreaterThan(0);

    const r = batch('--races', '10', '--card', file, '--out', out);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain(message);
    expect(r.out).not.toContain('FLAG');
    expect(r.out).not.toContain('PASS');
    expect(existsSync(out)).toBe(false);
  });

  it('a replacement file that is not JSON exits non-zero with a message', () => {
    const file = join(work, 'not-json.json');
    writeFileSync(file, '{ nope');
    const r = batch('--races', '10', '--card', file);
    expect(r.code).not.toBe(0);
    expect(r.err.trim().length).toBeGreaterThan(0);
  });

  it('a valid replacement card is used', () => {
    const swapped = structuredClone(card);
    swapped.horses[0].name = 'Zzyzx Test Colt';
    const r = batch('--races', '10', '--card', writeJson('card-swapped.json', swapped));
    expect(r.code).toBe(0);
    expect(r.out).toContain('Zzyzx Test Colt');
    expect(r.out).not.toContain(card.horses[0].name);
  });
});

describe('M1.6 command: --out', () => {
  it('writes the file only where told, with the same text as stdout', () => {
    const out = join(work, 'summary.txt');
    const repoBefore = listRepo();
    const r = batch('--races', '10', '--seed-start', '42', '--out', out);
    expect(r.code).toBe(0);
    expect(r.out.length).toBeGreaterThan(0);
    expect(readFileSync(out, 'utf8')).toBe(r.out);
    expect(readdirSync(work)).toContain('summary.txt');
    expect(listRepo()).toEqual(repoBefore);
  });
});

describe('M1.6 report: styles with no horse, horse counts and field size', () => {
  const meta = { simVersion: 1, files: { track: 'shipped', race: 'shipped', card: 'shipped', tuning: 'shipped' }, elapsedSeconds: 0 };
  const lines = (text: string) => text.split('\n');

  it('a 2-horse card: closer shows as having no horses, never as 0 percent; one horse reads "1 horse"; F2 states 2', () => {
    const data = shippedData();
    data.card.horses = data.card.horses.slice(0, 2).map((h, i) => ({ ...h, post: i + 1, style: i === 0 ? 'frontRunner' : 'stalker' }));
    const text = formatReport(runBatch(data, 0, 12), meta);
    const f3 = lines(text).slice(lines(text).findIndex((l) => l.startsWith('F3 STYLE FAIRNESS')));
    const closer = f3.find((l) => l.startsWith('closer'))!;
    expect(closer).toContain('no horses');
    expect(closer).not.toMatch(/\d/);
    expect(f3.find((l) => l.startsWith('frontRunner'))).toContain('(1 horse)');
    expect(f3.find((l) => l.startsWith('stalker'))).toContain('(1 horse)');
    expect(text).not.toContain('1 horses');
    const f2 = lines(text).find((l) => l.startsWith('F2 POST FAIRNESS'))!;
    expect(f2).toContain('2 equal horses');
    expect(f2.toLowerCase()).not.toContain('eight');
    expect(f2).not.toContain('8');
    // The F3 check line does not name closer.
    const check = lines(text).filter((l) => /^(PASS|FLAG)\s+F3\s/.test(l));
    expect(check.length).toBe(1);
    expect(check[0]).not.toContain('closer');
  });

  it('an 8-horse card: all three styles show a count and a measured percent', () => {
    const text = formatReport(runBatch(shippedData(), 0, 12), meta);
    expect(text).not.toContain('no horses');
    const f3 = lines(text).slice(lines(text).findIndex((l) => l.startsWith('F3 STYLE FAIRNESS')));
    expect(f3.find((l) => l.startsWith('frontRunner'))).toContain('(3 horses)');
    expect(f3.find((l) => l.startsWith('stalker'))).toContain('(3 horses)');
    expect(f3.find((l) => l.startsWith('closer'))).toContain('(2 horses)');
    expect(lines(text).find((l) => l.startsWith('F2 POST FAIRNESS'))).toContain('8 equal horses');
  });
});

describe('M1.6 command: a bad --out fails before any race runs', () => {
  // 5000 races takes minutes, so coming back inside the limit shows the check ran first.
  const LIMIT_MS = 6_000;
  const run = (out: string) => {
    const started = Date.now();
    const r = spawnSync(process.execPath, [SCRIPT, '--races', '5000', '--out', out], { cwd: ROOT, encoding: 'utf8', timeout: LIMIT_MS });
    return { code: r.status, signal: r.signal, out: r.stdout, err: r.stderr, ms: Date.now() - started };
  };

  const cases: [string, () => string][] = [
    ['a folder that does not exist', () => join(work, 'no-such-folder', 'summary.txt')],
    ['a parent that is a file', () => {
      const f = join(work, 'plain-file.txt');
      writeFileSync(f, 'x');
      return join(f, 'summary.txt');
    }],
    ['an existing folder', () => {
      const d = join(work, 'existing-folder');
      mkdirSync(d);
      return d;
    }],
  ];
  it.each(cases)('%s', (_name, makeOut) => {
    const out = makeOut();
    const workBefore = readdirSync(work).sort();
    const repoBefore = listRepo();
    const r = run(out);
    expect(r.signal, 'timed out, so the race loop ran before the check').toBeNull();
    expect(r.code).not.toBe(0);
    expect(r.code).not.toBeNull();
    expect(r.err).toContain('--out');
    expect(r.err).not.toMatch(/^\s+at .*:\d+/m);
    expect(r.err).not.toMatch(/Error:/);
    expect(r.out).toBe('');
    expect(readdirSync(work).sort()).toEqual(workBefore);
    expect(existsSync(join(work, 'no-such-folder'))).toBe(false);
    expect(listRepo()).toEqual(repoBefore);
  });
});

describe('M1.6 command: --out never replaces a data file the run reads, and needs a file name', () => {
  // 5000 races takes minutes, so coming back inside the limit shows the check ran first.
  const run = (...args: string[]) => {
    const r = spawnSync(process.execPath, [SCRIPT, '--races', '5000', ...args], { cwd: ROOT, encoding: 'utf8', timeout: 6_000 });
    return { code: r.status, signal: r.signal, out: r.stdout, err: r.stderr };
  };
  const refused = (r: ReturnType<typeof run>) => {
    expect(r.signal, 'timed out, so the race loop ran before the check').toBeNull();
    expect(r.code).not.toBe(0);
    expect(r.code).not.toBeNull();
    expect(r.err).toContain('--out');
    expect(r.err).not.toMatch(/^\s+at .*:\d+/m);
    expect(r.out).toBe('');
  };

  it('--out naming the --card file is refused and the card file is left as it was', () => {
    const cardPath = writeJson('card-also-out.json', card);
    const before = readFileSync(cardPath, 'utf8');
    refused(run('--card', cardPath, '--out', cardPath));
    expect(readFileSync(cardPath, 'utf8')).toBe(before);
  });

  it('--out that is a link to the --tuning file is refused and the tuning file is left as it was', () => {
    const tuningPath = writeJson('tuning-linked.json', tuning);
    const link = join(work, 'link-to-tuning.txt');
    symlinkSync(tuningPath, link);
    const before = readFileSync(tuningPath, 'utf8');
    refused(run('--tuning', tuningPath, '--out', link));
    expect(readFileSync(tuningPath, 'utf8')).toBe(before);
  });

  it('--out ending in a slash is refused and nothing is created', () => {
    const out = join(work, 'new-folder') + '/';
    refused(run('--out', out));
    expect(existsSync(join(work, 'new-folder'))).toBe(false);
  });

  it('--out naming a different file next to the --card file still works', () => {
    const cardPath = writeJson('card-kept.json', card);
    const out = join(work, 'summary-next-to-card.txt');
    const r = batch('--races', '10', '--card', cardPath, '--out', out);
    expect(r.code).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe(r.out);
    expect(JSON.parse(readFileSync(cardPath, 'utf8'))).toEqual(card);
  });
});
