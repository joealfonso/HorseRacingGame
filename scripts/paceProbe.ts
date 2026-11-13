import { readFileSync } from 'node:fs';
import card from '../src/data/card.json';
import race from '../src/data/race.json';
import track from '../src/data/track.json';
import tuning from '../src/data/tuning.json';
import { THREE_EIGHTHS_FEET_TO_GO, type GameData, type Horse, type RunningStyle } from '../src/data/schema';
import { validateData } from '../src/data/validate';
import { reserveAt } from '../src/sim/reserveAt';
import type { RaceResult } from '../src/sim/result';
import { runRace } from '../src/sim/runRace';

// The pace redesign feasibility probe (docs/specs/m1-pace-redesign.md, Step 1). Prints the numbers
// behind P6 to P9 for each setting in order and applies the stop rule, or the P10 report for one
// setting. Each setting is given to the sim as tuning input (a pacePressure group added to the
// tuning in memory), never by editing src/data/tuning.json. Not part of npm test.
//
//   node scripts/paceProbe.mjs --settings baseline,a,b,c,d      P6 to P9, stops at the first pass
//   node scripts/paceProbe.mjs --p10 a [--refit]                 the P10 report for one setting
//   --tuning FILE   a whole tuning file to start from in place of the shipped one

type Style = RunningStyle;
type Pulls = Record<Style, number>;
const STYLES: Style[] = ['frontRunner', 'stalker', 'closer'];

// The probe grid, fixed by the spec. pressureSeconds 8 and ratedPullShare 1 in every setting.
const GRID: Record<string, Pulls | null> = {
  baseline: null,
  a: { frontRunner: 0.02, stalker: 0.02, closer: 0.01 },
  b: { frontRunner: 0.02, stalker: 0.02, closer: 0.016 },
  c: { frontRunner: 0.035, stalker: 0.035, closer: 0.0175 },
  d: { frontRunner: 0.035, stalker: 0.035, closer: 0.028 },
};
const PRESSURE_SECONDS = 8;
const RATED_PULL_SHARE = 1;

const FIELD_L: Style[] = ['stalker', 'closer', 'stalker', 'frontRunner', 'closer', 'stalker', 'closer', 'stalker'];
const FIELD_H: Style[] = ['frontRunner', 'stalker', 'closer', 'frontRunner', 'stalker', 'closer', 'frontRunner', 'stalker'];
const U4_THREE: Style[] = ['frontRunner', 'frontRunner', 'frontRunner', 'stalker', 'stalker', 'stalker', 'closer', 'closer'];

const range = (start: number, count: number): number[] => Array.from({ length: count }, (_v, i) => start + i);
const RESERVE_SEEDS = range(100000, 2000); // P6, P7
const B6_SEEDS = range(100000, 4000); // P8, P9
const PAIRED_SEEDS = range(100000, 2000); // P10
const REFIT_SEEDS = range(100000, 3000);

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]): number => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1));
};
const f = (x: number, d = 3): string => (Number.isFinite(x) ? x.toFixed(d) : String(x));
const pts = (x: number): string => `${x >= 0 ? '+' : ''}${x.toFixed(2)}`;

type RawTuning = Record<string, unknown>;

function tuningFor(setting: string, base: RawTuning): RawTuning {
  if (!(setting in GRID)) throw new Error(`unknown setting "${setting}", use one of ${Object.keys(GRID).join(', ')}`);
  const t = structuredClone(base);
  delete t.pacePressure;
  const pulls = GRID[setting];
  if (pulls !== null) {
    t.pacePressure = {
      pressureSeconds: { value: PRESSURE_SECONDS, status: 'starting guess' },
      pull: { value: { ...pulls }, status: 'starting guess' },
      ratedPullShare: { value: RATED_PULL_SHARE, status: 'starting guess' },
    };
  }
  return t;
}

function load(t: RawTuning): GameData {
  const data = validateData({ track, race, card, tuning: t });
  const r = data.race;
  if (r.distanceFurlongs !== 10 || r.going !== 'fast' || r.trackBias.lane !== 'neutral' || r.trackBias.style !== 'neutral') {
    throw new Error('the probe is defined on a neutral 10 furlong fast race; race.json has changed');
  }
  return data;
}

/** Equal horses (70s), ids t1.., posts 1.., no instructions. As testkit.withField does. */
function field(base: GameData, styles: Style[]): GameData {
  const data = structuredClone(base);
  const proto: Horse = structuredClone(data.card.horses[0]);
  data.card.horses = styles.map((style, i) => ({
    ...structuredClone(proto),
    id: `t${i + 1}`,
    name: `Test Horse ${i + 1}`,
    post: i + 1,
    style,
    stats: { speed: 70, stamina: 70, kick: 70 },
    instructions: { early: 'default', move: 'default', path: 'default' },
  }));
  return data;
}

function withOrders(base: GameData, id: string, orders: Partial<Horse['instructions']>): GameData {
  const data = structuredClone(base);
  const h = data.card.horses.find((x) => x.id === id)!;
  h.instructions = { ...h.instructions, ...orders };
  return data;
}

const styleMap = (data: GameData) => new Map(data.card.horses.map((h) => [h.id, h.style]));

interface Run { winner: string; label: 'hot' | 'honest' | 'slow'; half: number }
const fromResult = (r: Pick<RaceResult, 'finish' | 'pace'>): Run => ({ winner: r.finish[0].id, label: r.pace.label, half: r.pace.halfMile / 100 });

// ---- P6, P7: reserve at the 3/8 pole ----

interface ReserveStats { mean: Record<string, number>; sd: Record<string, number>; n: Record<string, number> }

function reserves(data: GameData, seeds: number[], runs?: Run[]): ReserveStats {
  const styles = styleMap(data);
  const by: Record<string, number[]> = { frontRunner: [], stalker: [], closer: [] };
  for (const s of seeds) {
    const reading = reserveAt(data, s, THREE_EIGHTHS_FEET_TO_GO);
    for (const h of reading.reserves) by[styles.get(h.id)!].push(h.reserve / 1000);
    runs?.push(fromResult(reading));
  }
  const out: ReserveStats = { mean: {}, sd: {}, n: {} };
  for (const st of STYLES) {
    out.n[st] = by[st].length;
    out.mean[st] = by[st].length ? mean(by[st]) : NaN;
    out.sd[st] = by[st].length > 1 ? sd(by[st]) : NaN;
  }
  return out;
}

// ---- P8, P9: B6 ----

interface B6 {
  races: { hot: number; slow: number };
  share: { hot: Pulls; slow: Pulls };
  /** Points. Closers: hot minus slow. Front-runners: slow minus hot. Both positive when B6 holds. */
  closerGap: number;
  frontRunnerGap: number;
}

function b6(data: GameData, runs: Run[]): B6 {
  const styles = styleMap(data);
  const wins = { hot: { frontRunner: 0, stalker: 0, closer: 0 }, slow: { frontRunner: 0, stalker: 0, closer: 0 } };
  const races = { hot: 0, slow: 0 };
  for (const r of runs) {
    if (r.label === 'honest') continue;
    races[r.label]++;
    wins[r.label][styles.get(r.winner)!]++;
  }
  const share = { hot: { ...wins.hot }, slow: { ...wins.slow } };
  for (const l of ['hot', 'slow'] as const) for (const st of STYLES) share[l][st] = (100 * wins[l][st]) / races[l];
  return {
    races, share,
    closerGap: share.hot.closer - share.slow.closer,
    frontRunnerGap: share.slow.frontRunner - share.hot.frontRunner,
  };
}

const runAll = (data: GameData, seeds: number[]): Run[] => seeds.map((s) => fromResult(runRace(data, s)));

/** The existing B6 test, reproduced on its own seeds and conditions with this tuning. */
function b6Test(H: GameData, shippedCard: GameData) {
  const eq = b6(H, runAll(H, range(5000, shippedCard.tuning.checks.behaviorSeedCount.value)));
  const sh = b6(shippedCard, runAll(shippedCard, range(5000, 2000)));
  const eqPass = eq.races.hot > 30 && eq.races.slow > 30 && eq.closerGap > 0 && eq.frontRunnerGap > 0;
  const shPass = sh.closerGap > 0 && sh.frontRunnerGap > 0;
  return { eq, sh, eqPass, shPass };
}

function printB6(name: string, b: B6, base?: B6) {
  const line = (l: 'hot' | 'slow') => STYLES.map((st) => `${st} ${f(b.share[l][st], 2)}`).join(', ');
  console.log(`  ${name}: hot ${b.races.hot} races, slow ${b.races.slow}`);
  console.log(`    hot  win %: ${line('hot')}`);
  console.log(`    slow win %: ${line('slow')}`);
  const vs = (x: number, y: number | undefined) => (y === undefined ? '' : ` (baseline ${pts(y)}, change ${pts(x - y)})`);
  console.log(`    closer gap (hot - slow) ${pts(b.closerGap)}${vs(b.closerGap, base?.closerGap)}`);
  console.log(`    front-runner gap (slow - hot) ${pts(b.frontRunnerGap)}${vs(b.frontRunnerGap, base?.frontRunnerGap)}`);
}

const b6Holds = (b: B6, base: B6): boolean =>
  b.closerGap > 0 && b.frontRunnerGap > 0 && b.closerGap >= base.closerGap - 1 && b.frontRunnerGap >= base.frontRunnerGap - 1;

interface Gate { L: ReserveStats; H: ReserveStats; b6H: B6; b6S: B6; test: ReturnType<typeof b6Test> }

function measureGate(t: RawTuning): Gate {
  const d = load(t);
  const L = field(d, FIELD_L);
  const H = field(d, FIELD_H);
  const hRuns: Run[] = [];
  const Lr = reserves(L, RESERVE_SEEDS);
  const Hr = reserves(H, RESERVE_SEEDS, hRuns);
  for (const s of B6_SEEDS.slice(RESERVE_SEEDS.length)) hRuns.push(fromResult(runRace(H, s)));
  return { L: Lr, H: Hr, b6H: b6(H, hRuns), b6S: b6(d, runAll(d, B6_SEEDS)), test: b6Test(H, d) };
}

function reportGate(name: string, g: Gate, base: Gate | null): 'pass' | 'onlyP7' | 'fail' {
  console.log(`\n=== setting ${name} ===`);
  const verdicts: boolean[] = [];
  for (const [p, st] of [['P6', 'stalker'], ['P7', 'closer']] as const) {
    const gap = g.L.mean[st] - g.H.mean[st];
    const bar = Math.max(g.L.sd[st], g.H.sd[st]);
    const pass = gap >= bar;
    verdicts.push(pass);
    console.log(`  ${p} ${st}s reserve at the 3/8 pole: L mean ${f(g.L.mean[st])} sd ${f(g.L.sd[st])} (n ${g.L.n[st]}), H mean ${f(g.H.mean[st])} sd ${f(g.H.sd[st])} (n ${g.H.n[st]}); L - H ${f(gap)} vs larger sd ${f(bar)}: ${pass ? 'PASS' : 'FAIL'}`);
  }
  console.log(`  front-runners for reference: L mean ${f(g.L.mean.frontRunner)}, H mean ${f(g.H.mean.frontRunner)} sd ${f(g.H.sd.frontRunner)}`);
  printB6('P8 field H, seeds 100000-103999', g.b6H, base?.b6H);
  printB6('P9 shipped card, seeds 100000-103999', g.b6S, base?.b6S);
  printB6('existing B6 test, equal card (seeds 5000-5499)', g.test.eq);
  printB6('existing B6 test, shipped card (seeds 5000-6999)', g.test.sh);
  const ref = base ?? g;
  const p8 = b6Holds(g.b6H, ref.b6H) && g.test.eqPass;
  const p9 = b6Holds(g.b6S, ref.b6S) && g.test.shPass;
  console.log(`  P8 ${p8 ? 'PASS' : 'FAIL'} (existing B6 equal-card test ${g.test.eqPass ? 'passes' : 'FAILS'})`);
  console.log(`  P9 ${p9 ? 'PASS' : 'FAIL'} (existing B6 shipped-card test ${g.test.shPass ? 'passes' : 'FAILS'})`);
  const all = verdicts[0] && verdicts[1] && p8 && p9;
  console.log(`  P6 ${verdicts[0] ? 'pass' : 'fail'}, P7 ${verdicts[1] ? 'pass' : 'fail'}, P8 ${p8 ? 'pass' : 'fail'}, P9 ${p9 ? 'pass' : 'fail'}: ${all ? 'PASSES P6 to P9' : 'does not pass'}`);
  const onlyP7 = !verdicts[1] && verdicts[0] && p8 && p9;
  if (onlyP7) console.log('  only P7 fails: that is a stop (open question 3)');
  return all ? 'pass' : onlyP7 ? 'onlyP7' : 'fail';
}

// ---- P10 ----

function percentile(sorted: number[], q: number): number {
  const i = q * (sorted.length - 1);
  const lo = Math.floor(i);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

function labelShares(runs: Run[]) {
  const n = runs.length;
  return { hot: (100 * runs.filter((r) => r.label === 'hot').length) / n, slow: (100 * runs.filter((r) => r.label === 'slow').length) / n };
}

function p10(t: RawTuning) {
  const d = load(t);
  const L = field(d, FIELD_L);
  const H = field(d, FIELD_H);
  const lRuns = runAll(L, PAIRED_SEEDS);
  const hRuns = runAll(H, B6_SEEDS);
  const sRuns = runAll(d, B6_SEEDS);
  const hPaired = hRuns.slice(0, PAIRED_SEEDS.length);
  console.log(`  mean leader's half (seeds 100000-101999): L ${f(mean(lRuns.map((r) => r.half)), 2)}, H ${f(mean(hPaired.map((r) => r.half)), 2)}`);
  const hs = labelShares(hRuns);
  const ss = labelShares(sRuns);
  console.log(`  hot / slow share (seeds 100000-103999): field H ${f(hs.hot, 1)} / ${f(hs.slow, 1)}, shipped card ${f(ss.hot, 1)} / ${f(ss.slow, 1)}`);
  const shippedOutside = ss.hot < 15 || ss.hot > 35 || ss.slow < 15 || ss.slow > 35;
  if (shippedOutside) console.log('  shipped card hot or slow share is outside 15 to 35 percent: pars need a refit (run with --refit)');

  // U4, three front-runners, as the U4 test does: 160 seeds from 60000, 8 rotations.
  let wins = 0;
  let races = 0;
  for (let k = 0; k < 8; k++) {
    const fld = field(d, U4_THREE.map((_s, post) => U4_THREE[(post + k) % 8]));
    const styles = styleMap(fld);
    for (const s of range(60000, 160)) {
      if (styles.get(runRace(fld, s).finish[0].id) === 'frontRunner') wins++;
      races++;
    }
  }
  console.log(`  U4 each of three front-runners (160 seeds x 8 rotations): ${f((100 * wins) / races / 3, 2)} percent`);

  // F3 per style on field H, 2,000 seeds: win share per horse.
  const hStyles = styleMap(H);
  const count = (st: Style) => FIELD_H.filter((x) => x === st).length;
  const f3 = STYLES.map((st) => `${st} ${f((100 * hPaired.filter((r) => hStyles.get(r.winner) === st).length) / hPaired.length / count(st), 2)}`);
  console.log(`  F3 field H per horse win %: ${f3.join(', ')}`);

  // Paired runs, 2,000 seeds. Change = told horse's win share minus its default win share, points.
  const change = (base: GameData, plain: Run[], id: string, orders: Partial<Horse['instructions']>): number => {
    const told = withOrders(base, id, orders);
    let c = 0;
    PAIRED_SEEDS.forEach((s, i) => { c += (runRace(told, s).finish[0].id === id ? 1 : 0) - (plain[i].winner === id ? 1 : 0); });
    return (100 * c) / PAIRED_SEEDS.length;
  };
  for (const [name, fld, styles, plain] of [['L', L, FIELD_L, lRuns], ['H', H, FIELD_H, hPaired]] as const) {
    for (const st of ['stalker', 'closer'] as const) {
      const ids = styles.map((x, i) => (x === st ? `t${i + 1}` : null)).filter((x): x is string => x !== null);
      const per = ids.map((id) => {
        const m = change(fld, plain, id, { move: 'moveAtThreeEighths' });
        const s = change(fld, plain, id, { move: 'saveForStretch' });
        return { id, m, s };
      });
      const avgM = mean(per.map((p) => p.m));
      const avgS = mean(per.map((p) => p.s));
      console.log(`  field ${name} ${st}s, 3/8 move minus save it, style average ${pts(avgM - avgS)} (3/8 move ${pts(avgM)}, save it ${pts(avgS)}); per horse ${per.map((p) => `${p.id} ${pts(p.m)}/${pts(p.s)}`).join(', ')}`);
    }
  }
  const hIds = (st: Style) => FIELD_H.map((x, i) => (x === st ? `t${i + 1}` : null)).filter((x): x is string => x !== null);
  for (const id of hIds('stalker')) {
    console.log(`  field H stalker ${id}: rate early ${pts(change(H, hPaired, id, { early: 'rateEarly' }))}, rate early + save ${pts(change(H, hPaired, id, { early: 'rateEarly', move: 'saveForStretch' }))}`);
  }
  for (const id of hIds('frontRunner')) {
    console.log(`  field H front-runner ${id}: rate early ${pts(change(H, hPaired, id, { early: 'rateEarly' }))}, rate early + 3/8 move ${pts(change(H, hPaired, id, { early: 'rateEarly', move: 'moveAtThreeEighths' }))}`);
  }
  return { shippedOutside };
}

/** Pars at 10 furlongs on fast from the 25th and 75th percentile of the shipped card's leader's half. */
function refitPars(t: RawTuning): RawTuning {
  const d = load(t);
  const halves = REFIT_SEEDS.map((s) => runRace(d, s).pace.halfMile / 100).sort((a, b) => a - b);
  const hot = Math.round(percentile(halves, 0.25) * 100) / 100;
  const slow = Math.round(percentile(halves, 0.75) * 100) / 100;
  const out = structuredClone(t);
  const pars = out.paceParHalfMile as Record<string, Record<string, { value: { hotUnderSeconds: number; slowOverSeconds: number } }>>;
  pars['10'].fast.value = { hotUnderSeconds: hot, slowOverSeconds: slow };
  console.log(`  refit 10 furlong fast pars (seeds 100000-102999): hot under ${hot}, slow over ${slow}`);
  return out;
}

export function main(argv: string[]): number {
  let baseTuning = tuning as unknown as RawTuning;
  let settings: string[] = ['baseline', 'a', 'b', 'c', 'd'];
  let p10Setting: string | null = null;
  let refit = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--settings') settings = argv[++i].split(',');
    else if (a === '--p10') p10Setting = argv[++i];
    else if (a === '--refit') refit = true;
    else if (a === '--tuning') baseTuning = JSON.parse(readFileSync(argv[++i], 'utf8')) as RawTuning;
    else { console.error(`unknown argument ${a}`); return 1; }
  }
  const started = performance.now();

  if (p10Setting !== null) {
    console.log(`=== P10 report, setting ${p10Setting} ===`);
    const t = tuningFor(p10Setting, baseTuning);
    p10(t);
    if (refit) {
      console.log(`\n=== P8, P9 after a par refit, setting ${p10Setting} (baseline at its own original pars and at the refit pars) ===`);
      const rt = refitPars(t);
      const baseOrig = measureGate(tuningFor('baseline', baseTuning));
      const baseRefit = measureGate(tuningFor('baseline', rt));
      const g = measureGate(rt);
      console.log('-- against the baseline at the original pars');
      reportGate(`${p10Setting} (refit pars)`, g, baseOrig);
      console.log('-- against the baseline at the refit pars');
      reportGate(`${p10Setting} (refit pars)`, g, baseRefit);
      const d = load(rt);
      const hs = labelShares(runAll(field(d, FIELD_H), B6_SEEDS));
      const ss = labelShares(runAll(d, B6_SEEDS));
      console.log(`  hot / slow share at refit pars: field H ${f(hs.hot, 1)} / ${f(hs.slow, 1)}, shipped card ${f(ss.hot, 1)} / ${f(ss.slow, 1)}`);
    }
  } else {
    if (settings[0] !== 'baseline') settings = ['baseline', ...settings];
    let base: Gate | null = null;
    for (const s of settings) {
      const g = measureGate(tuningFor(s, baseTuning));
      if (s === 'baseline') {
        reportGate(s, g, null);
        base = g;
        continue;
      }
      const verdict = reportGate(s, g, base);
      if (verdict === 'pass') {
        console.log(`\nSTOP RULE: setting ${s} is the first to pass P6 to P9. No later setting is tried.`);
        break;
      }
      if (verdict === 'onlyP7') {
        console.log(`\nSTOP RULE: at setting ${s} only P7 fails. Stop, no later setting is tried.`);
        break;
      }
      if (s === settings[settings.length - 1]) console.log('\nSTOP RULE: no setting passes P6 to P9.');
    }
  }
  console.log(`\n(${((performance.now() - started) / 1000).toFixed(0)} s)`);
  return 0;
}
