// B0 feasibility probe, the Node side: worker pool, sim cache, measurements PB1 to PB6.
// Not part of npm test. Run with `node scripts/betProbe.mjs <command>`; see USAGE.
import { fork, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, tmpdir } from 'node:os';
import { join } from 'node:path';
import { crowdDollars, type CrowdValues } from '../src/bet/crowd';
import { winnerPosts, winsByPost } from '../src/bet/estimate';
import { oddsStepIndex, perDollarCents, toteSteps } from '../src/bet/payout';
import { betStream, estimateSeedsOf, raceSeedOf } from '../src/bet/streams';
import { createStream } from '../src/sim/rng';
import {
  DAY_RULES, FIRST_DAY_SEED, POOL_DOLLARS, POOL_RULES, START_CROWD, START_RECIPE,
  dayFields, fieldInputs, measureCost, probeStable, type ProbeHorse, type Recipe,
} from './betProbeSetup';

const USAGE = `usage: node scripts/betProbe.mjs <command> [options]
  stable                 print the stat lines
  selftest               payout examples A to E and the odds display cases
  pb1                    Node cost of one runRace (500 runs after 50 warm-up)
  check                  parallel workers against single-threaded on a small sample
  sims                   run every estimate and real race into the cache (the heavy part)
  analyze                PB2 to PB6 from the cache
  sweep                  crowd values grid against the HN3 bands and PB4, from the cache at N = 1,000
  detail                 the value bettor's bets by price and style, for --crowd
options: --workers K  --recipe FILE (JSON, fields replace the starting recipe)
         --crowd noise,leanFront,leanStalker,leanCloser,flatten  --node-median MS
         --grid "noises;flattens;leans" (comma lists) for sweep`;

const OUT_DIR = join(process.env.TMPDIR ?? tmpdir(), 'betprobe');
const PB2_FIELDS = 200;
const PB2_SEEDS = 4000; // two disjoint sets of up to 2,000
const ALL_FIELDS = 1000;
const MAX_N = 2000;
const NS = [250, 500, 1000, 2000];
const CHUNK = 500;

interface Opts { workers: number; recipe: Recipe; crowd: CrowdValues; nodeMedian?: number; grid?: number[][] }

function parse(argv: string[]): { cmd: string; opts: Opts } {
  const cmd = argv[0] ?? '';
  const opts: Opts = { workers: Math.max(1, cpus().length - 1), recipe: START_RECIPE, crowd: START_CROWD };
  for (let i = 1; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (value === undefined) throw new Error(`${flag} needs a value`);
    if (flag === '--workers') opts.workers = Number(value);
    else if (flag === '--recipe') opts.recipe = { ...START_RECIPE, ...JSON.parse(readFileSync(value, 'utf8')) };
    else if (flag === '--node-median') opts.nodeMedian = Number(value);
    else if (flag === '--grid') opts.grid = value.split(';').map((part) => part.split(',').map(Number));
    else if (flag === '--crowd') {
      const [noise, front, stalker, closer, flatten] = value.split(',').map(Number);
      opts.crowd = { noise, styleLean: { frontRunner: front, stalker, closer }, flatten };
    } else throw new Error(`unknown option ${flag}`);
  }
  return { cmd, opts };
}

const load = () => loadavg().map((x) => x.toFixed(2)).join(' ');

// ---------- fields and jobs ----------

interface FieldPlan { index: number; daySeed: number; race: number; byPost: number[]; raceSeed: number; seeds: number[] }

/** Fields 0..count-1: day FIRST_DAY_SEED + floor(k / 8), race k % 8 + 1. */
function planFields(stable: ProbeHorse[], count: number): FieldPlan[] {
  const out: FieldPlan[] = [];
  for (let k = 0; out.length < count; k += DAY_RULES.races) {
    const daySeed = FIRST_DAY_SEED + k / DAY_RULES.races;
    dayFields(stable, daySeed).forEach((byPost, r) => {
      const index = k + r;
      if (index >= count) return;
      const race = r + 1;
      const seeds = estimateSeedsOf(daySeed, race, index < PB2_FIELDS ? PB2_SEEDS : MAX_N);
      out.push({ index, daySeed, race, byPost, raceSeed: raceSeedOf(daySeed, race), seeds });
    });
  }
  return out;
}

interface Job { id: number; field: number; byPost: number[]; seeds: number[] }

// ---------- worker side ----------

/** Runs in a child process: answers each job with the winners' posts. */
export function worker(recipeJson: string): Promise<void> {
  const stable = probeStable(JSON.parse(recipeJson) as Recipe);
  return new Promise((resolve) => {
    process.on('message', (msg: Job) => {
      const winners = winnerPosts(fieldInputs(stable, msg.byPost), msg.seeds);
      process.send?.({ id: msg.id, winners: winners.join('') });
    });
    process.on('disconnect', () => resolve());
  });
}

async function runPool(launcher: string, recipe: Recipe, jobs: Job[], workers: number, log?: string): Promise<Map<number, string>> {
  const results = new Map<number, string>();
  let next = 0;
  let done = 0;
  const started = performance.now();
  const lastLogged = { pct: -1 };
  const say = (line: string) => {
    if (log) appendFileSync(log, `${new Date().toISOString()} ${line}\n`);
  };
  say(`start ${jobs.length} jobs on ${workers} workers, load ${load()}`);
  await new Promise<void>((resolve, reject) => {
    const kids: ChildProcess[] = [];
    const feed = (kid: ChildProcess) => {
      if (next < jobs.length) kid.send(jobs[next++]);
      else kid.disconnect();
    };
    for (let w = 0; w < Math.min(workers, jobs.length); w++) {
      const kid = fork(launcher, ['--worker', JSON.stringify(recipe)], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      kids.push(kid);
      kid.on('message', (msg: { id: number; winners: string }) => {
        results.set(msg.id, msg.winners);
        done++;
        const pct = Math.floor((done * 100) / jobs.length);
        if (pct !== lastLogged.pct) {
          lastLogged.pct = pct;
          say(`${pct}% (${done}/${jobs.length}) ${((performance.now() - started) / 1000).toFixed(0)} s, load ${load()}`);
        }
        if (done === jobs.length) resolve();
        feed(kid);
      });
      kid.on('exit', (code) => {
        if (code !== 0 && done < jobs.length) reject(new Error(`worker exited with ${code}`));
      });
      feed(kid);
    }
  });
  say(`done in ${((performance.now() - started) / 1000).toFixed(1)} s, load ${load()}`);
  return results;
}

/** Each field's list is [real race, ...estimate seeds], cut into chunks so one field spreads over workers. */
function jobsFor(plans: FieldPlan[], chunk: number, seedsPerField?: number): Job[] {
  const jobs: Job[] = [];
  for (const p of plans) {
    const all = [p.raceSeed, ...p.seeds.slice(0, seedsPerField ?? p.seeds.length)];
    for (let s = 0; s < all.length; s += chunk) jobs.push({ id: jobs.length, field: p.index, byPost: p.byPost, seeds: all.slice(s, s + chunk) });
  }
  return jobs;
}

function joinResults(plans: FieldPlan[], jobs: Job[], results: Map<number, string>): string[] {
  const out = plans.map(() => '');
  for (const j of jobs) out[plans.findIndex((p) => p.index === j.field)] += results.get(j.id);
  return out;
}

// ---------- cache ----------

interface Cache { recipe: Recipe; fields: { daySeed: number; race: number; byPost: number[]; raceSeed: number; real: number; winners: string }[] }

const cachePath = (recipe: Recipe) => join(OUT_DIR, `sims-${hash(JSON.stringify(recipe))}.json`);

function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

// ---------- analysis ----------

const pct = (x: number) => (x * 100).toFixed(1);
const quantile = (sorted: number[], q: number) => sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)];
const argmax = (xs: number[]) => xs.reduce((best, x, i) => (x > xs[best] ? i : best), 0);
const argmin = (xs: number[]) => xs.reduce((best, x, i) => (x < xs[best] ? i : best), 0);

function pb2(cache: Cache): { n: number; pass: boolean }[] {
  console.log('\nPB2 stability: first 200 fields, set A = estimate seeds 1..N (the game estimate), set B = seeds N+1..2N');
  console.log('   N   meanAbs  p95    favSame (fields with lead >= 3 pts)   pass');
  const rows: { n: number; pass: boolean }[] = [];
  for (const n of NS) {
    const diffs: number[] = [];
    let led = 0;
    let same = 0;
    for (const f of cache.fields.slice(0, PB2_FIELDS)) {
      const w = [...f.winners.slice(1)].map(Number);
      const a = winsByPost(w.slice(0, n), 8).map((x) => (x * 100) / n);
      const b = winsByPost(w.slice(n, 2 * n), 8).map((x) => (x * 100) / n);
      a.forEach((x, i) => diffs.push(Math.abs(x - b[i])));
      const fa = argmax(a);
      const second = Math.max(...a.filter((_, i) => i !== fa));
      if (a[fa] - second >= 3) {
        led++;
        if (argmax(b) === fa) same++;
      }
    }
    diffs.sort((x, y) => x - y);
    const mean = diffs.reduce((s, x) => s + x, 0) / diffs.length;
    const p95 = quantile(diffs, 0.95);
    const share = led === 0 ? 1 : same / led;
    const pass = mean <= 1.5 && p95 <= 4 && share >= 0.9;
    rows.push({ n, pass });
    console.log(`${String(n).padStart(5)}   ${mean.toFixed(2).padStart(5)}  ${p95.toFixed(2).padStart(5)}  ${pct(share).padStart(5)}% (${same}/${led})                     ${pass ? 'PASS' : 'FAIL'}`);
  }
  return rows;
}

function market(cache: Cache, stable: ProbeHorse[], n: number, crowd: CrowdValues) {
  const steps = toteSteps();
  const step = (label: string) => steps.findIndex((s) => s.label === label);
  const at = { s6to5: step('6-5'), s8to5: step('8-5'), s3to1: step('3-1'), s10to1: step('10-1'), s20to1: step('20-1') };
  const poolCents = POOL_DOLLARS * 100;

  const favSteps: number[] = [];
  const favPerDollar: number[] = [];
  let shortFav = 0, bigLongshot = 0, flat = 0, favWins = 0, favShareSum = 0, favExpWins = 0;
  const groups = [0, 0.05, 0.1, 0.2, 0.35].map((lo, i, all) => ({ lo, hi: all[i + 1] ?? 1.01, count: 0, estSum: 0, wins: 0 }));
  // exp: the return expected from a holdout estimate (estimate seeds N+1 to 2N), independent of the crowd's.
  const tally = () => ({ staked: 0, back: 0, bets: 0, wins: 0, sq: 0, exp: 0, esq: 0 });
  const bettors = { random: tally(), favorite: tally(), longest: tally(), value: tally(), everyHorse: tally() };
  const valueBets: { perDollar: number; style: string; won: boolean; est: number; hold: number; crowdShare: number }[] = [];
  const styleBack: Record<string, { staked: number; back: number }> = {};

  for (const f of cache.fields) {
    const winners = [...f.winners.slice(1, n + 1)].map(Number);
    const wins = winsByPost(winners, 8);
    const styles = f.byPost.map((i) => stable[i].style);
    const dollars = crowdDollars(wins, n, styles, betStream(f.daySeed, 'crowd', f.race), crowd, POOL_DOLLARS);
    const perDollar = dollars.map((d) => perDollarCents(poolCents, d * 100, POOL_RULES));
    const stepIdx = perDollar.map((pd) => oddsStepIndex(pd, steps));

    const fav = argmax(dollars);
    favSteps.push(stepIdx[fav]);
    favPerDollar.push(perDollar[fav]);
    if (stepIdx[fav] <= at.s8to5) shortFav++;
    if (stepIdx.some((s) => s >= at.s20to1)) bigLongshot++;
    if (stepIdx.every((s) => s >= at.s3to1 && s <= at.s10to1)) flat++;
    const hold = winsByPost([...f.winners.slice(n + 1, 2 * n + 1)].map(Number), 8).map((x) => x / n);
    if (f.real === fav + 1) favWins++;
    favExpWins += hold[fav];
    favShareSum += dollars[fav] / POOL_DOLLARS;

    wins.forEach((w, i) => {
      const p = w / n;
      const g = groups.find((x) => p >= x.lo && p < x.hi)!;
      g.count++;
      g.estSum += p;
      if (f.real === i + 1) g.wins++;
    });

    // PB6: $2 flat, priced against the crowd pool plus the bettor's own $2.
    // sq sums each bet's (return per dollar)^2, for a standard error over bets.
    const bet = (who: keyof typeof bettors, i: number) => {
      const pd = perDollarCents(poolCents + 200, dollars[i] * 100 + 200, POOL_RULES);
      const b = bettors[who];
      b.staked += 200;
      b.bets++;
      const r = f.real === i + 1 ? pd / 100 - 1 : -1;
      if (f.real === i + 1) {
        b.back += 2 * pd;
        b.wins++;
      }
      b.sq += r * r;
      b.exp += hold[i] * 2 * pd;
      b.esq += ((hold[i] * pd) / 100 - 1) ** 2;
      return pd;
    };
    bet('random', createStream(f.daySeed, 'probeRandomBettor', String(f.race)).int(0, 7));
    bet('favorite', fav);
    bet('longest', argmin(dollars));
    const score = dollars.map((d, i) => ((wins[i] / n) * perDollarCents(poolCents + 200, d * 100 + 200, POOL_RULES)) / 100);
    const best = argmax(score);
    if (score[best] >= 1.15) {
      const pd = bet('value', best);
      valueBets.push({ perDollar: pd, style: styles[best], won: f.real === best + 1, est: wins[best] / n, hold: hold[best], crowdShare: dollars[best] / POOL_DOLLARS });
    }
    // Every horse $2 in one race, as one 16-dollar bet, so its standard error is over races.
    {
      const e = bettors.everyHorse;
      const w = f.real - 1;
      const back = 2 * perDollarCents(poolCents + 200, dollars[w] * 100 + 200, POOL_RULES);
      const r = back / 1600 - 1;
      e.staked += 1600;
      e.back += back;
      e.bets++;
      e.wins++;
      e.sq += r * r;
      let raceExp = 0;
      dollars.forEach((d, i) => { raceExp += hold[i] * 2 * perDollarCents(poolCents + 200, d * 100 + 200, POOL_RULES); });
      e.exp += raceExp;
      e.esq += (raceExp / 1600 - 1) ** 2;
    }
    // Every horse $2, by style: shows whether the lean misprices a style on average.
    dollars.forEach((d, i) => {
      const s = (styleBack[styles[i]] ??= { staked: 0, back: 0 });
      s.staked += 200;
      if (f.real === i + 1) s.back += 2 * perDollarCents(poolCents + 200, d * 100 + 200, POOL_RULES);
    });
  }
  const sortedSteps = [...favSteps].sort((a, b) => a - b);
  const sortedPd = [...favPerDollar].sort((a, b) => a - b);
  const count = cache.fields.length;
  return { steps, at, count, sortedSteps, sortedPd, shortFav, bigLongshot, flat, favWins, favShareSum, favExpWins, groups, bettors, styleBack, valueBets };
}

function report(cache: Cache, stable: ProbeHorse[], n: number, crowd: CrowdValues) {
  const m = market(cache, stable, n, crowd);
  const medLo = m.sortedSteps[(m.count - 1) >> 1];
  const medHi = m.sortedSteps[m.count >> 1];
  const medPd = (m.sortedPd[(m.count - 1) >> 1] + m.sortedPd[m.count >> 1]) / 2;
  console.log(`\nPB4 spread: ${m.count} fields, N = ${n}, crowd ${JSON.stringify(crowd)}`);
  const medPass = medLo >= m.at.s6to5 && medHi <= m.at.s3to1;
  console.log(`  favorite's median odds: ${m.steps[medLo].label}${medLo === medHi ? '' : ` / ${m.steps[medHi].label}`} (median per-dollar ${medPd} cents)  band 6-5 to 3-1  ${medPass ? 'PASS' : 'FAIL'}`);
  console.log(`  favorite quartiles (odds): ${m.steps[quantile(m.sortedSteps, 0.25)].label}, ${m.steps[quantile(m.sortedSteps, 0.75)].label}; shortest ${m.steps[m.sortedSteps[0]].label}, longest ${m.steps[m.sortedSteps[m.count - 1]].label}`);
  const s = m.shortFav / m.count, l = m.bigLongshot / m.count, fl = m.flat / m.count;
  console.log(`  fields with favorite 8-5 or shorter: ${pct(s)}%  (at least 20%)  ${s >= 0.2 ? 'PASS' : 'FAIL'}`);
  console.log(`  fields with a horse 20-1 or longer: ${pct(l)}%  (at least 50%)  ${l >= 0.5 ? 'PASS' : 'FAIL'}`);
  console.log(`  fields with every horse 3-1 to 10-1: ${pct(fl)}%  (at most 10%)  ${fl <= 0.1 ? 'PASS' : 'FAIL'}`);

  const fw = m.favWins / m.count;
  console.log(`\nPB5 honest: each field's real race on its own race seed`);
  console.log(`  crowd favorite wins ${pct(fw)}% (${m.favWins}/${m.count})  band 28 to 40  ${fw >= 0.28 && fw <= 0.4 ? 'PASS' : 'FAIL'};  favorite's mean crowd share ${pct(m.favShareSum / m.count)}%`);
  console.log('  estimate group   horses  mean est  actual   diff   SE(actual)  within 3');
  for (const g of m.groups) {
    if (g.count === 0) { console.log(`  ${g.lo}+ : none`); continue; }
    const est = g.estSum / g.count, act = g.wins / g.count;
    const se = Math.sqrt((est * (1 - est)) / g.count);
    const label = `${(g.lo * 100).toFixed(0)} to ${g.hi > 1 ? 'up' : (g.hi * 100).toFixed(0)}`;
    console.log(`  ${label.padEnd(15)} ${String(g.count).padStart(6)}  ${pct(est).padStart(7)}  ${pct(act).padStart(6)}  ${((act - est) * 100).toFixed(1).padStart(5)}  ${(se * 100).toFixed(1).padStart(6)}      ${Math.abs(act - est) <= 0.03 ? 'PASS' : 'FAIL'}`);
  }

  console.log('\nPB6 bettors, $2 flat (return per dollar staked; not gated)');
  for (const [who, b] of Object.entries(m.bettors)) {
    const ret = b.staked === 0 ? 0 : (b.back - b.staked) / b.staked;
    console.log(`  ${who.padEnd(9)} ${ret >= 0 ? '+' : ''}${ret.toFixed(3)}  bets ${b.bets} (${pct(b.bets / m.count)}% of races)`);
  }
  console.log('  every horse $2, by style:');
  for (const [style, b] of Object.entries(m.styleBack)) console.log(`    ${style.padEnd(12)} ${((b.back - b.staked) / b.staked).toFixed(3)}`);
}

// ---------- crowd sweep (HN3 bands on the cache, no new sim runs) ----------
//
// Two numbers per bettor. "Realized" pays on each field's one real race: what a player would
// see, but heavy-tailed (one 40-1 winner moves a 1,000-race return by several cents).
// "Expected" prices the same bets with a holdout estimate from estimate seeds N+1 to 2N, which
// are independent of the N runs the crowd saw, so it is unbiased and much less noisy. The bands
// are judged on the expected figure; the realized one and its standard error are shown beside it.

type Tally = { staked: number; back: number; bets: number; wins: number; sq: number; exp: number; esq?: number };
/** Standard error of the expected return over the sample of bets (fields), ignoring the holdout's own small error. */
const seExp = (b: Tally) => (b.bets < 2 || b.esq === undefined ? NaN : Math.sqrt(Math.max(0, b.esq / b.bets - expRet(b) ** 2) / (b.bets - 1)));
const ret = (b: Tally) => (b.staked === 0 ? 0 : (b.back - b.staked) / b.staked);
const expRet = (b: Tally) => (b.staked === 0 ? 0 : (b.exp - b.staked) / b.staked);
/** Standard error of the realized mean return per dollar, over bets. */
const se = (b: Tally) => {
  if (b.bets < 2) return NaN;
  const mean = ret(b);
  return Math.sqrt(Math.max(0, b.sq / b.bets - mean * mean) / (b.bets - 1));
};
const sgn = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(3)}`;

const BANDS = { every: [-0.3, -0.18], fav: [-0.15, -0.03], long: [-0.5, -0.25] } as const;

function hn3(m: ReturnType<typeof market>) {
  const b = m.bettors;
  const medLo = m.sortedSteps[(m.count - 1) >> 1], medHi = m.sortedSteps[m.count >> 1];
  const favWin = m.favWins / m.count, favExp = m.favExpWins / m.count, favShare = m.favShareSum / m.count;
  const inBand = (x: number, [lo, hi]: readonly [number, number]) => x >= lo && x <= hi;
  const checks = {
    every: inBand(expRet(b.everyHorse), BANDS.every),
    fav: inBand(expRet(b.favorite), BANDS.fav),
    long: inBand(expRet(b.longest), BANDS.long),
    value: expRet(b.value) >= 0.03 && b.value.bets >= 0.3 * m.count,
    favWin: favExp >= 0.28 && favExp <= 0.4 && favExp >= favShare,
    pb4med: medLo >= m.at.s6to5 && medHi <= m.at.s3to1,
    pb4short: m.shortFav / m.count >= 0.2,
    pb4long: m.bigLongshot / m.count >= 0.5,
    pb4flat: m.flat / m.count <= 0.1,
  };
  return { checks, pass: Object.values(checks).every(Boolean), favWin, favExp, favShare, medLo, medHi };
}

function sweep(cache: Cache, stable: ProbeHorse[], n: number, grid?: number[][]) {
  const [noises, flattens, leans] = grid ?? [[0.25, 0.5, 0.75, 0.9, 1.0], [0, 0.02, 0.04, 0.08], [0, 0.1, 0.2]];
  console.log(`crowd sweep: ${cache.fields.length} cached fields, N = ${n}. Per dollar: expected (holdout) then realized (SE). x marks a failed band (judged on expected).`);
  console.log('noise flat  lean | every exp  real(SE)      | fav exp  real(SE)      | long exp  real(SE)     | value exp  real(SE)    bets/wins | favWin exp real share | favMed <=8-5 20-1+ flat | pass');
  const passing: CrowdValues[] = [];
  const mark = (ok: boolean) => (ok ? ' ' : 'x');
  for (const noise of noises) for (const flatten of flattens) for (const lean of leans) {
    const crowd: CrowdValues = { noise, flatten, styleLean: { frontRunner: lean, stalker: 0, closer: -lean } };
    const m = market(cache, stable, n, crowd);
    const h = hn3(m);
    const b = m.bettors;
    const cell = (t: Tally, ok: boolean) => `${sgn(expRet(t))}${mark(ok)} ${sgn(ret(t))}(${se(t).toFixed(3)})`;
    const med = m.steps[h.medLo].label + (h.medLo === h.medHi ? '' : `/${m.steps[h.medHi].label}`);
    console.log(
      `${noise.toFixed(2)} ${flatten.toFixed(3)} ${lean.toFixed(2)} | ${cell(b.everyHorse, h.checks.every)} | ${cell(b.favorite, h.checks.fav)} | ${cell(b.longest, h.checks.long)} | ` +
      `${cell(b.value, h.checks.value)} ${String(b.value.bets).padStart(4)}/${String(b.value.wins).padEnd(4)}| ${pct(h.favExp)}${mark(h.checks.favWin)} ${pct(h.favWin)} ${pct(h.favShare)} | ` +
      `${med.padEnd(5)}${mark(h.checks.pb4med)} ${pct(m.shortFav / m.count).padStart(4)}${mark(h.checks.pb4short)} ${pct(m.bigLongshot / m.count).padStart(4)}${mark(h.checks.pb4long)} ${pct(m.flat / m.count).padStart(3)}${mark(h.checks.pb4flat)} | ${h.pass ? 'PASS' : Object.entries(h.checks).filter(([, ok]) => !ok).map(([k]) => k).join(',')}`,
    );
    if (h.pass) passing.push(crowd);
  }
  console.log(`\npassing settings: ${passing.length}`);
  for (const c of passing) console.log(`  ${JSON.stringify(c)}`);
}

function valueDetail(cache: Cache, stable: ProbeHorse[], n: number, crowd: CrowdValues) {
  const m = market(cache, stable, n, crowd);
  const b = m.bettors;
  for (const [who, t] of Object.entries(b)) console.log(`  ${who.padEnd(10)} bets ${t.bets} wins ${t.wins}  expected ${sgn(expRet(t))} (SE ${seExp(t).toFixed(3)})  realized ${sgn(ret(t))} (SE ${se(t).toFixed(3)})`);
  console.log(`  favorite: expected win ${pct(m.favExpWins / m.count)}%, realized ${pct(m.favWins / m.count)}%, mean crowd share ${pct(m.favShareSum / m.count)}%`);
  console.log(`value bettor at ${JSON.stringify(crowd)}: ${b.value.bets} bets (${pct(b.value.bets / m.count)}% of races), ${b.value.wins} winners, expected ${sgn(expRet(b.value))}, realized ${sgn(ret(b.value))} (SE ${se(b.value).toFixed(3)})`);
  const show = (label: string, key: (v: (typeof m.valueBets)[number]) => string, order: string[]) => {
    console.log(`  by ${label}:      bets  wins  expected  realized(SE)     mean est  holdout  crowd share`);
    for (const k of order) {
      const vs = m.valueBets.filter((v) => key(v) === k);
      if (vs.length === 0) { console.log(`    ${k.padEnd(14)} none`); continue; }
      const t: Tally = { staked: 0, back: 0, bets: 0, wins: 0, sq: 0, exp: 0 };
      for (const v of vs) {
        const r = v.won ? v.perDollar / 100 - 1 : -1;
        t.staked += 200; t.bets++; t.sq += r * r; t.exp += v.hold * 2 * v.perDollar;
        if (v.won) { t.back += 2 * v.perDollar; t.wins++; }
      }
      const mean = (f: (v: (typeof vs)[number]) => number) => pct(vs.reduce((s, v) => s + f(v), 0) / vs.length);
      console.log(`    ${k.padEnd(14)} ${String(t.bets).padStart(4)}  ${String(t.wins).padStart(4)}  ${sgn(expRet(t))}    ${sgn(ret(t))}(${se(t).toFixed(3)})   ${mean((v) => v.est).padStart(6)}  ${mean((v) => v.hold).padStart(6)}  ${mean((v) => v.crowdShare).padStart(6)}`);
    }
  };
  const band = (pd: number) => (pd < 300 ? 'under 2-1' : pd < 600 ? '2-1 to 5-1' : pd < 1100 ? '5-1 to 10-1' : pd < 2100 ? '10-1 to 20-1' : '20-1 and up');
  show('price', (v) => band(v.perDollar), ['under 2-1', '2-1 to 5-1', '5-1 to 10-1', '10-1 to 20-1', '20-1 and up']);
  show('style', (v) => v.style, ['frontRunner', 'stalker', 'closer']);
  // What a reader without the estimate can do: simple rules on style and price, priced with the holdout.
  console.log('  rules a stats reader could follow ($2 flat, expected per dollar from the holdout):');
  const rules: Array<[string, (styles: string[], dollars: number[], stats: number[]) => number]> = [
    ['every closer', () => -1],
    ['crowd top closer', (styles, dollars) => pickTop(styles, dollars, 'closer')],
    ['crowd top stalker', (styles, dollars) => pickTop(styles, dollars, 'stalker')],
    ['crowd top front-runner', (styles, dollars) => pickTop(styles, dollars, 'frontRunner')],
    ['highest stat total', (_s, _d, stats) => argmax(stats)],
    ['second favorite', (_s, dollars) => argmax(dollars.map((d, i) => (i === argmax(dollars) ? -1 : d)))],
  ];
  for (const [name, rule] of rules) {
    let staked = 0, exp = 0, bets = 0;
    for (const f of cache.fields) {
      const styles = f.byPost.map((i) => stable[i].style);
      const stats = f.byPost.map((i) => stable[i].stats.speed + stable[i].stats.stamina + stable[i].stats.kick);
      const wins = winsByPost([...f.winners.slice(1, n + 1)].map(Number), 8);
      const hold = winsByPost([...f.winners.slice(n + 1, 2 * n + 1)].map(Number), 8).map((x) => x / n);
      const dollars = crowdDollars(wins, n, styles, betStream(f.daySeed, 'crowd', f.race), crowd, POOL_DOLLARS);
      const picks = name === 'every closer' ? styles.flatMap((s, i) => (s === 'closer' ? [i] : [])) : [rule(styles, dollars, stats)].filter((i) => i >= 0);
      for (const i of picks) {
        staked += 200; bets++;
        exp += hold[i] * 2 * perDollarCents(POOL_DOLLARS * 100 + 200, dollars[i] * 100 + 200, POOL_RULES);
      }
    }
    console.log(`    ${name.padEnd(24)} ${String(bets).padStart(5)} bets  expected ${sgn((exp - staked) / staked)}`);
  }
}

function pickTop(styles: string[], dollars: number[], style: string): number {
  let pick = -1;
  styles.forEach((s, i) => { if (s === style && (pick < 0 || dollars[i] > dollars[pick])) pick = i; });
  return pick;
}

// ---------- commands ----------

export async function main(argv: string[], launcher: string): Promise<number> {
  let parsed;
  try {
    parsed = parse(argv);
  } catch (err) {
    console.error(`${err instanceof Error ? err.message : String(err)}\n\n${USAGE}`);
    return 1;
  }
  const { cmd, opts } = parsed;
  mkdirSync(OUT_DIR, { recursive: true });
  const stable = probeStable(opts.recipe);

  if (cmd === 'stable') {
    console.log(`recipe ${JSON.stringify(opts.recipe)}`);
    console.log('id   name      tier   style        speed stamina kick total');
    for (const h of stable) {
      const { speed, stamina, kick } = h.stats;
      console.log(`${h.id}  ${h.name}  ${h.tier.padEnd(5)}  ${h.style.padEnd(11)}  ${String(speed).padStart(5)} ${String(stamina).padStart(7)} ${String(kick).padStart(4)} ${String(speed + stamina + kick).padStart(5)}`);
    }
    return 0;
  }

  if (cmd === 'selftest') {
    const steps = toteSteps();
    const cases: Array<[number, number, number, string]> = [
      [1000000, 250000, 330, '2-1'], [1000000, 30000, 2760, '26-1'], [1000000, 900000, 105, '1-9'],
      [1000000, 236000, 350, '5-2'], [1002000, 32000, 2590, '24-1'],
    ];
    let ok = true;
    for (const [p, w, want, label] of cases) {
      const pd = perDollarCents(p, w, POOL_RULES);
      const got = steps[oddsStepIndex(pd, steps)].label;
      const good = pd === want && got === label;
      ok &&= good;
      console.log(`pool ${p} winner ${w}: perDollar ${pd} (want ${want}), odds ${got} (want ${label}) ${good ? 'ok' : 'WRONG'}`);
    }
    for (const [pd, label] of [[105, '1-9'], [190, '4-5'], [200, '1-1'], [330, '2-1'], [350, '5-2'], [2760, '26-1'], [10100, '99-1'], [50000, '99-1']] as const) {
      const got = steps[oddsStepIndex(pd, steps)].label;
      ok &&= got === label;
      console.log(`perDollar ${pd}: ${got} (want ${label}) ${got === label ? 'ok' : 'WRONG'}`);
    }
    return ok ? 0 : 1;
  }

  if (cmd === 'pb1') {
    console.log(`load before: ${load()}`);
    const r = measureCost(() => performance.now());
    console.log(`PB1 Node: ${r.runs} runs after warm-up, median ${r.median.toFixed(3)} ms, p99 ${r.p99.toFixed(3)} ms, worst ${r.worst.toFixed(3)} ms`);
    console.log(`load after: ${load()}`);
    return 0;
  }

  if (cmd === 'check') {
    // Single-threaded in this process, against the pool cut into small chunks across workers.
    const plans = planFields(stable, 4).map((p) => ({ ...p, seeds: p.seeds.slice(0, 299) }));
    const single = plans.map((p) => winnerPosts(fieldInputs(stable, p.byPost), [p.raceSeed, ...p.seeds]).join(''));
    const jobs = jobsFor(plans, 37);
    const parallel = joinResults(plans, jobs, await runPool(launcher, opts.recipe, jobs, Math.min(opts.workers, 5)));
    const same = single.every((s, i) => s === parallel[i]);
    console.log(`check: ${plans.length} fields x ${single[0].length} runs, ${jobs.length} chunks over ${Math.min(opts.workers, 5)} workers: ${same ? 'identical' : 'DIFFERENT'}`);
    const path = cachePath(opts.recipe);
    if (existsSync(path)) {
      const cache = JSON.parse(readFileSync(path, 'utf8')) as Cache;
      const prefixSame = single.every((s, i) => cache.fields[i].winners.startsWith(s));
      console.log(`check: against the cache's first ${single.length} fields (prefix): ${prefixSame ? 'identical' : 'DIFFERENT'}`);
      if (!prefixSame) return 1;
    }
    return same ? 0 : 1;
  }

  if (cmd === 'sims') {
    const log = join(OUT_DIR, 'sims.log');
    const plans = planFields(stable, ALL_FIELDS);
    const jobs = jobsFor(plans, CHUNK);
    const runs = jobs.reduce((s, j) => s + j.seeds.length, 0);
    console.log(`sims: ${plans.length} fields, ${runs} runs, ${jobs.length} jobs, ${opts.workers} workers, log ${log}`);
    const started = performance.now();
    const joined = joinResults(plans, jobs, await runPool(launcher, opts.recipe, jobs, opts.workers, log));
    const seconds = (performance.now() - started) / 1000;
    const cache: Cache = {
      recipe: opts.recipe,
      fields: plans.map((p, i) => ({ daySeed: p.daySeed, race: p.race, byPost: p.byPost, raceSeed: p.raceSeed, real: Number(joined[i][0]), winners: joined[i] })),
    };
    writeFileSync(cachePath(opts.recipe), JSON.stringify(cache));
    console.log(`sims: done in ${seconds.toFixed(1)} s (${((seconds * 1000 * opts.workers) / runs).toFixed(3)} worker-ms per run), cache ${cachePath(opts.recipe)}`);
    return 0;
  }

  if (cmd === 'analyze') {
    const path = cachePath(opts.recipe);
    if (!existsSync(path)) {
      console.error(`no cache at ${path}; run the sims command first`);
      return 1;
    }
    const cache = JSON.parse(readFileSync(path, 'utf8')) as Cache;
    const rows = pb2(cache);
    const passing = rows.find((r) => r.pass);
    if (passing === undefined) {
      console.log('\nNo N up to 2,000 passes PB2. Stop rule: nothing else is measured.');
      return 0;
    }
    console.log(`\nPB3: smallest passing N = ${passing.n}.${opts.nodeMedian ? ` Node cost per race ${((passing.n * opts.nodeMedian) / 1000).toFixed(2)} s (N x ${opts.nodeMedian} ms median).` : ''} Chrome median to be measured.`);
    report(cache, stable, passing.n, opts.crowd);
    return 0;
  }

  if (cmd === 'sweep' || cmd === 'detail') {
    const path = cachePath(opts.recipe);
    if (!existsSync(path)) {
      console.error(`no cache at ${path}; run the sims command first`);
      return 1;
    }
    const cache = JSON.parse(readFileSync(path, 'utf8')) as Cache;
    if (cmd === 'sweep') sweep(cache, stable, 1000, opts.grid);
    else valueDetail(cache, stable, 1000, opts.crowd);
    return 0;
  }

  console.error(USAGE);
  return 1;
}
