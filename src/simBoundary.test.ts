import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// A7: the sim boundary rule, run against the repo's real ESLint config.
const ROOT = new URL('..', import.meta.url).pathname;
const RULES = ['no-restricted-imports', 'no-restricted-syntax'];
const eslint = new ESLint({ cwd: ROOT });

async function ruleErrors(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages
    .filter((m) => m.severity === 2 && m.ruleId !== null && RULES.includes(m.ruleId))
    .map((m) => `${m.ruleId}: ${m.message}`);
}

const SIM = 'src/sim/x.ts';

describe('A7: files under src/sim/ may not import Phaser', () => {
  const banned: Array<[string, string]> = [
    ['default import', "import Phaser from 'phaser';\nexport const a = Phaser;\n"],
    ['type import', "import type { Scene } from 'phaser';\nexport type T = Scene;\n"],
    ['named import with alias', "import { Math as PMath } from 'phaser';\nexport const a = PMath;\n"],
    ['subpath import', "import { Clamp } from 'phaser/src/math/Clamp';\nexport const a = Clamp;\n"],
    ['re-export', "export { Scene } from 'phaser';\n"],
    ['dynamic import', "export const load = () => import('phaser');\n"],
  ];

  it.each(banned)('%s is an error', async (_name, code) => {
    expect((await ruleErrors(code, SIM)).length).toBeGreaterThan(0);
  });

  it('a dynamic import of a subpath is an error', async () => {
    expect((await ruleErrors("export const l = () => import('phaser/src/math/Clamp');\n", SIM)).length).toBeGreaterThan(0);
  });

  it('a nested path src/sim/race/x.ts is covered', async () => {
    expect((await ruleErrors("import Phaser from 'phaser';\nexport const a = Phaser;\n", 'src/sim/race/x.ts')).length).toBeGreaterThan(0);
  });

  it('a deeply nested dynamic import is covered', async () => {
    expect((await ruleErrors("export const l = () => import('phaser');\n", 'src/sim/a/b/c.ts')).length).toBeGreaterThan(0);
  });

  it('a nested type import is covered', async () => {
    expect((await ruleErrors("import type { Scene } from 'phaser';\nexport type T = Scene;\n", 'src/sim/race/x.ts')).length).toBeGreaterThan(0);
  });
});

describe('A7: the rule is scoped to src/sim/', () => {
  const code = "import Phaser from 'phaser';\nexport const a = Phaser;\n";

  it.each(['src/scenes/x.ts', 'src/render/x.ts'])('%s is not an error from this rule', async (path) => {
    expect(await ruleErrors(code, path)).toEqual([]);
  });

  it('a dynamic import under src/render/ is not an error from this rule', async () => {
    expect(await ruleErrors("export const l = () => import('phaser');\n", 'src/render/x.ts')).toEqual([]);
  });

  it('a sim file that imports nothing from Phaser has no error from this rule', async () => {
    expect(await ruleErrors('export const add = (a: number, b: number): number => a + b;\n', SIM)).toEqual([]);
  });

  it('a sim file importing something unrelated has no error from this rule', async () => {
    const code2 = "import { readFileSync } from 'node:fs';\nexport const r = readFileSync;\nexport const l = () => import('./other');\n";
    expect(await ruleErrors(code2, SIM)).toEqual([]);
  });

  it('a package whose name merely starts with phaser is not banned', async () => {
    expect(await ruleErrors("import x from 'phaserish';\nexport const a = x;\n", SIM)).toEqual([]);
  });
});
