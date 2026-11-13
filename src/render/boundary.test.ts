import { ESLint } from 'eslint';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// RV9, checked like src/simBoundary.test.ts: no module under src/render/ or src/scenes/
// imports src/sim/rng.ts or src/sim/raceStreams.ts. Also: src/render/ is Phaser-free.
// Two ways: the repo's real ESLint config on made-up files, and a scan of the real files.

const ROOT = new URL('../../', import.meta.url).pathname;
const RULES = ['no-restricted-imports', 'no-restricted-syntax'];
const eslint = new ESLint({ cwd: ROOT });

async function ruleErrors(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages
    .filter((m) => m.severity === 2 && m.ruleId !== null && RULES.includes(m.ruleId))
    .map((m) => `${m.ruleId}: ${m.message}`);
}

const PLACES = ['src/render/x.ts', 'src/scenes/x.ts', 'src/render/deep/x.ts'];

describe('RV9: the lint rule refuses the sim random streams', () => {
  const banned: Array<[string, string]> = [
    ['rng, relative', "import { createRng } from '../sim/rng';\nexport const a = createRng;\n"],
    ['rng, with .ts', "import { createRng } from '../sim/rng.ts';\nexport const a = createRng;\n"],
    ['raceStreams', "import { createRaceStreams } from '../sim/raceStreams';\nexport const a = createRaceStreams;\n"],
    ['raceStreams, with .ts', "import { createRaceStreams } from '../sim/raceStreams.ts';\nexport const a = createRaceStreams;\n"],
    ['type import', "import type { Rng } from '../sim/rng';\nexport type T = Rng;\n"],
    ['default import', "import rng from '../sim/rng';\nexport const a = rng;\n"],
    ['namespace import', "import * as s from '../sim/raceStreams';\nexport const a = s;\n"],
    ['re-export', "export { createRng } from '../sim/rng';\n"],
    ['re-export all', "export * from '../sim/raceStreams';\n"],
    ['dynamic import', "export const load = () => import('../sim/rng');\n"],
    ['dynamic import of raceStreams', "export const load = () => import('../sim/raceStreams');\n"],
    ['deeper relative path', "import { a } from '../../src/sim/rng';\nexport const b = a;\n"],
    ['from the src root', "import { a } from 'src/sim/raceStreams';\nexport const b = a;\n"],
    ['side-effect import', "import '../sim/rng';\n"],
  ];

  for (const place of PLACES) {
    it.each(banned)(`${place}: %s is an error`, async (_name, code) => {
      expect((await ruleErrors(code, place)).length).toBeGreaterThan(0);
    });
  }

  it.each([
    ['runRace', "import { runRace } from '../sim/runRace';\nexport const a = runRace;\n"],
    ['result types', "import type { RaceResult } from '../sim/result';\nexport type T = RaceResult;\n"],
    ['margins', "import { marginLabel } from '../sim/margins';\nexport const a = marginLabel;\n"],
    ['a file that only starts like rng', "import { a } from '../sim/rngSeed';\nexport const b = a;\n"],
    ['a file whose name ends in rng', "import { a } from '../sim/ring';\nexport const b = a;\n"],
    ['a dynamic import of something else', "export const l = () => import('../sim/result');\n"],
  ])('%s is allowed', async (_name, code) => {
    expect(await ruleErrors(code, 'src/render/x.ts')).toEqual([]);
  });
});

function listTs(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) listTs(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Module specifiers a file imports, re-exports or dynamically imports. */
function specifiers(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/^\s*(?:import|export)\b[^'"`;]*?from\s*['"]([^'"]+)['"]/gms)) out.push(m[1]);
  for (const m of src.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) out.push(m[1]);
  for (const m of src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  return out;
}

const resolved = (file: string, spec: string): string => (spec.startsWith('.') ? resolve(dirname(file), spec) : spec);
const SELF = join(ROOT, 'src/render/boundary.test.ts');

describe('RV9: the real files under src/render/ and src/scenes/', () => {
  const files = [...listTs(join(ROOT, 'src/render')), ...listTs(join(ROOT, 'src/scenes'))].filter((f) => f !== SELF);

  it('RV9: the scan sees the new modules', () => {
    const names = files.map((f) => relative(ROOT, f));
    for (const n of ['src/render/view.ts', 'src/render/announcer.ts', 'src/render/raceFrame.ts', 'src/scenes/RaceScene.ts']) expect(names).toContain(n);
  });

  it('RV9: the scan finds imports, so an empty result means something', () => {
    const src = readFileSync(join(ROOT, 'src/render/raceFrame.ts'), 'utf8');
    expect(specifiers(src)).toContain('./view');
    expect(specifiers("import type { A } from '../sim/rng';\nexport { b } from \"../sim/raceStreams\";\nconst c = () => import('../sim/rng.ts');\nimport '../sim/rng';\n"))
      .toEqual(['../sim/rng', '../sim/raceStreams', '../sim/rng', '../sim/rng.ts']);
  });

  it('RV9: none imports src/sim/rng or src/sim/raceStreams', () => {
    const banned = [join(ROOT, 'src/sim/rng'), join(ROOT, 'src/sim/raceStreams')];
    for (const f of files) {
      for (const spec of specifiers(readFileSync(f, 'utf8'))) {
        const target = resolved(f, spec).replace(/\.ts$/, '');
        const bare = spec.replace(/\.ts$/, '');
        expect(banned.includes(target) || /(^|\/)sim\/(rng|raceStreams)$/.test(bare), `${relative(ROOT, f)} imports ${spec}`).toBe(false);
      }
    }
  });

  it('RV9: ESLint with the repo config reports none of the boundary rules on these files', async () => {
    const results = await eslint.lintFiles(files.map((f) => relative(ROOT, f)));
    const bad = results.flatMap((r) => r.messages.filter((m) => m.ruleId && RULES.includes(m.ruleId)).map((m) => `${relative(ROOT, r.filePath)}: ${m.message}`));
    expect(bad).toEqual([]);
  });

  it('RV9: nothing under src/render/ reads the clock or draws a random number', () => {
    for (const f of files.filter((x) => x.includes('/src/render/') && !x.endsWith('.test.ts') && !x.endsWith('testkit.ts'))) {
      expect(readFileSync(f, 'utf8'), relative(ROOT, f)).not.toMatch(/Math\.random|Date\.now|new Date\(|performance\.now|crypto\./);
    }
  });
});

describe('src/render/ imports no Phaser', () => {
  const render = listTs(join(ROOT, 'src/render')).filter((f) => f !== SELF);

  it('no module under src/render/ imports phaser, or anything under src/scenes/ (which does)', () => {
    for (const f of render) {
      for (const spec of specifiers(readFileSync(f, 'utf8'))) {
        expect(spec, relative(ROOT, f)).not.toMatch(/^phaser(\/|$)/);
        expect(resolved(f, spec), relative(ROOT, f)).not.toContain(`${ROOT}src/scenes`);
      }
    }
  });

  it('the data modules the view reads import no Phaser either', () => {
    for (const f of ['src/data/raceDaySchema.ts', 'src/data/raceDayLoad.ts', 'src/data/template.ts']) {
      for (const spec of specifiers(readFileSync(join(ROOT, f), 'utf8'))) expect(spec, f).not.toMatch(/^phaser(\/|$)/);
    }
  });
});
