import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// R7: determinism lint bans, run against the repo's real ESLint config.
const ROOT = new URL('../..', import.meta.url).pathname;
const RULES = ['no-restricted-imports', 'no-restricted-syntax', 'no-restricted-globals', 'no-restricted-properties'];
const eslint = new ESLint({ cwd: ROOT });

async function ruleErrors(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages
    .filter((m) => m.severity === 2 && m.ruleId !== null && RULES.includes(m.ruleId))
    .map((m) => `${m.ruleId}: ${m.message}`);
}

const SIM = 'src/sim/x.ts';
const mathCall = (fn: string): string => `export const v = Math.${fn}(1, 2);\n`;

const banned: Array<[string, string]> = [
  ['Math.random', 'export const v = Math.random();\n'],
  ['Date', 'export const v = Date.now();\n'],
  ['new Date', 'export const v = new Date();\n'],
  ['performance', 'export const v = performance.now();\n'],
  ['crypto', 'export const v = crypto.getRandomValues(new Uint8Array(1));\n'],
  ['setTimeout', 'export const v = setTimeout(() => 1, 1);\n'],
  ['setInterval', 'export const v = setInterval(() => 1, 1);\n'],
  ['** operator', 'export const v = 2 ** 3;\n'],
  ['**= operator', 'let v = 2;\nv **= 3;\nexport { v };\n'],
];
const INEXACT = [
  'exp', 'expm1', 'log', 'log1p', 'log2', 'log10', 'pow', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'cbrt', 'hypot',
];
const EXACT = ['sqrt', 'floor', 'ceil', 'round', 'trunc', 'abs', 'min', 'max', 'sign', 'fround'];
for (const fn of INEXACT) banned.push([`Math.${fn}`, mathCall(fn)]);

describe('R7: determinism bans under src/sim/', () => {
  it.each(banned)('%s is an error', async (_n, code) => {
    expect((await ruleErrors(code, SIM)).length).toBeGreaterThan(0);
  });

  it('a nested path is covered', async () => {
    expect((await ruleErrors('export const v = Math.random();\n', 'src/sim/a/b/x.ts')).length).toBeGreaterThan(0);
  });

  it.each(EXACT)('Math.%s stays allowed', async (fn) => {
    expect(await ruleErrors(mathCall(fn), SIM)).toEqual([]);
  });

  it('plain arithmetic stays allowed', async () => {
    expect(await ruleErrors('export const v = (3 * 4) / 2 - 1 + (7 % 3);\n', SIM)).toEqual([]);
  });

  it('the Phaser rule still fires', async () => {
    const code = "import Phaser from 'phaser';\nexport const a = Phaser;\n";
    expect((await ruleErrors(code, SIM)).length).toBeGreaterThan(0);
    expect((await ruleErrors("export const l = () => import('phaser');\n", SIM)).length).toBeGreaterThan(0);
  });

  it.each(banned)('%s is not an error under src/render/ or src/scenes/', async (_n, code) => {
    expect(await ruleErrors(code, 'src/render/x.ts')).toEqual([]);
    expect(await ruleErrors(code, 'src/scenes/x.ts')).toEqual([]);
  });
});

describe('R7: the test-file exemption is narrow', () => {
  const TEST = 'src/sim/x.test.ts';

  it.each(banned)('%s is allowed in a sim test file', async (_n, code) => {
    expect(await ruleErrors(code, TEST)).toEqual([]);
  });

  it('a nested sim test file is exempt too', async () => {
    expect(await ruleErrors('export const v = Math.random();\n', 'src/sim/a/x.test.ts')).toEqual([]);
  });

  it('a sim test file may still not import Phaser', async () => {
    expect((await ruleErrors("import Phaser from 'phaser';\nexport const a = Phaser;\n", TEST)).length).toBeGreaterThan(0);
    expect((await ruleErrors("export const l = () => import('phaser');\n", TEST)).length).toBeGreaterThan(0);
  });

  it('a non-test file whose name merely contains "test" is not exempt', async () => {
    expect((await ruleErrors('export const v = Math.random();\n', 'src/sim/testHelpers.ts')).length).toBeGreaterThan(0);
    expect((await ruleErrors('export const v = Math.random();\n', 'src/sim/x.test.tsx')).length).toBeGreaterThan(0);
  });
});
