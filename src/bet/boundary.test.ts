import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// DT3 (docs/specs/betting-simple.md): the betting code imports no Phaser and nothing from
// src/render/ or src/scenes/, is under the sim's lint bans (R7), and nothing in src/sim/
// imports it. Checked on the source files' own import lines and on the real ESLint config.

const ROOT = new URL('../..', import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.[cm]?[jt]s$/.test(name) ? [path] : [];
  });
}

/** Every module a file names in an import, export-from, dynamic import or require. */
function specifiers(path: string): string[] {
  const text = readFileSync(path, 'utf8');
  const out: string[] = [];
  const patterns = [/\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, /\bimport\s+['"]([^'"]+)['"]/g, /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g];
  for (const re of patterns) for (const m of text.matchAll(re)) out.push(m[1]);
  return out;
}

describe('DT3: import lines', () => {
  // Test files hold banned imports as lint fixtures (this one does), so only shipped code is read.
  const shipped = (p: string) => !/\.test\.[cm]?[jt]s$/.test(p);
  const bet = files(join(ROOT, 'src/bet')).filter(shipped);
  const sim = files(join(ROOT, 'src/sim')).filter(shipped);

  it('DT3: the betting code is found', () => {
    expect(bet.map((p) => relative(ROOT, p))).toContain('src/bet/day.ts');
    expect(sim.map((p) => relative(ROOT, p))).toContain('src/sim/runRace.ts');
  });

  it('DT3: nothing under src/bet/ imports Phaser, src/render/ or src/scenes/', () => {
    const bad = bet.flatMap((p) => specifiers(p).filter((s) => /^phaser(\/|$)/.test(s) || /(^|\/)(render|scenes)(\/|$)/.test(s)).map((s) => `${relative(ROOT, p)}: ${s}`));
    expect(bad).toEqual([]);
  });

  it('DT3: nothing under src/sim/ imports the betting code', () => {
    const bad = sim.flatMap((p) => specifiers(p).filter((s) => /(^|\/)bet(\/|$)/.test(s)).map((s) => `${relative(ROOT, p)}: ${s}`));
    expect(bad).toEqual([]);
  });
});

describe('DT3: lint bans under src/bet/', () => {
  const eslint = new ESLint({ cwd: ROOT });
  const RULES = ['no-restricted-imports', 'no-restricted-syntax', 'no-restricted-globals', 'no-restricted-properties'];
  const errors = async (code: string, filePath: string) => {
    const [r] = await eslint.lintText(code, { filePath });
    return r.messages.filter((m) => m.severity === 2 && m.ruleId !== null && RULES.includes(m.ruleId));
  };

  it.each([
    ['Phaser', "import Phaser from 'phaser';\nexport const a = Phaser;\n"],
    ['a Phaser dynamic import', "export const l = () => import('phaser');\n"],
    ['src/render/', "import { x } from '../render/x';\nexport const a = x;\n"],
    ['src/scenes/', "import { x } from '../scenes/x';\nexport const a = x;\n"],
    ['Math.random', 'export const v = Math.random();\n'],
    ['Date', 'export const v = Date.now();\n'],
    ['performance', 'export const v = performance.now();\n'],
    ['Math.pow', 'export const v = Math.pow(2, 3);\n'],
    ['the ** operator', 'export const v = 2 ** 3;\n'],
  ])('DT3: %s is a lint error in src/bet/', async (_n, code) => {
    expect((await errors(code, 'src/bet/x.ts')).length).toBeGreaterThan(0);
  });

  it('DT3: importing the betting code is a lint error in src/sim/', async () => {
    expect((await errors("import { playDay } from '../bet/day';\nexport const a = playDay;\n", 'src/sim/x.ts')).length).toBeGreaterThan(0);
  });

  it('DT3: plain betting code is not a lint error', async () => {
    expect(await errors("import { runRace } from '../sim/runRace';\nexport const a = runRace;\nexport const f = Math.floor(2.5);\n", 'src/bet/x.ts')).toEqual([]);
  });
});
