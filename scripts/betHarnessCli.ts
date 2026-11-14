// B3 day harness (docs/specs/betting-simple.md, HN1 to HN4). Not part of npm test.
// Run with `npm run bet:harness -- --days 500 --from 1`. The playtester runs it after any change
// to betting rules or data. It plays days through the game's own code (dayContext, drawnDay,
// the estimate, priceRace, goToPost and settle) on the real stable.json and betting.json.
//
// Each race needs three things from the sim: the crowd's estimate (N runs on the game's
// estimate seeds), a holdout estimate (N more runs on seeds the crowd never saw, from a
// harness-only stream) and the real race. Those are cached per day, so a change that only
// moves prices (the crowd values, the pool, the takeout) reruns no sim.
import { fork, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, tmpdir } from 'node:os';
import { join } from 'node:path';
import { dayContext, drawnDay, goToPost, newDay, programFor, settle, type DayContext, type DrawnRace } from '../src/bet/day';
import { runEstimate, winnerPosts, winsByPost, type Estimate } from '../src/bet/estimate';
import { crowdFor, pricesWith } from '../src/bet/market';
import { offeredAmounts } from '../src/bet/money';
import { oddsStepIndex } from '../src/bet/payout';
import { BET_STREAM_NAMES, MAX_SEED, estimateSeedsOf, raceSeedOf } from '../src/bet/streams';
import { loadBetting, type BettingData } from '../src/data/bettingLoad';
import { loadData } from '../src/data/load';
import type { GameData } from '../src/data/schema';
import { createStream } from '../src/sim/rng';
import type { RaceResult } from '../src/sim/result';
import { runRace, SIM_VERSION } from '../src/sim/runRace';
import { STREAM_NAMES } from '../src/sim/streamNames';

const USAGE = `usage: npm run bet:harness -- [--days D] [--from S] [--workers K] [--runs N] [--cache DIR]
       npm run bet:harness -- --selftest
  --days D      days to play, default 500
  --from S      first day seed, default 1 (seeds S to S+D-1)
  --workers K   child processes for the sim, default one per core
  --runs N      the estimate's N and the holdout's, default betting.json's estimate.runsPerRace
  --cache DIR   per-day sim cache, default $TMPDIR/betharness`;

// Harness-only streams: not a game stream, not a sim stream.
const HOLDOUT_STREAM = 'harnessHoldout';
const RANDOM_STREAM = 'harnessRandomBettor';
for (const name of [HOLDOUT_STREAM, RANDOM_STREAM]) {
  if ((BET_STREAM_NAMES as readonly string[]).includes(name) || (STREAM_NAMES as readonly string[]).includes(name)) {
    throw new Error(`harness stream "${name}" collides with a game or sim stream`);
  }
}
// Bump when what a cached day holds changes.
const HARNESS_CACHE_VERSION = 1;
const FLAT_DOLLARS = 2;
const FEEL_DOLLARS = 10;

// ---------- the sim side: one day ----------

interface RaceSims {
  race: number;
  horseIds: string[];
  raceSeed: number;
  crowdWins: number[];
  holdWins: number[];
  winner: number;
}
interface DaySims { daySeed: number; races: RaceSims[] }

/** N distinct seeds on the harness's own stream, never the race seed or one of the crowd's N estimate seeds. */
export function holdoutSeeds(daySeed: number, race: number, runs: number): number[] {
  const stream = createStream(daySeed, HOLDOUT_STREAM, String(race));
  const seen = new Set<number>([raceSeedOf(daySeed, race), ...estimateSeedsOf(daySeed, race, runs)]);
  const out: number[] = [];
  while (out.length < runs) {
    const seed = stream.int(0, MAX_SEED);
    if (seen.has(seed)) continue;
    seen.add(seed);
    out.push(seed);
  }
  return out;
}

function simulateDay(ctx: DayContext, daySeed: number, runs: number): DaySims {
  return {
    daySeed,
    races: drawnDay(ctx, daySeed).map((d) => ({
      race: d.race,
      horseIds: d.horseIds,
      raceSeed: d.raceSeed,
      crowdWins: runEstimate(d.input, daySeed, d.race, runs).wins,
      holdWins: winsByPost(winnerPosts(d.input, holdoutSeeds(daySeed, d.race, runs)), d.horseIds.length),
      winner: runRace(d.input, d.raceSeed).finish[0].post,
    })),
  };
}

function load(): { game: GameData; data: BettingData; ctx: DayContext } {
  const game = loadData();
  const data = loadBetting(game);
  return { game, data, ctx: dayContext(data, game) };
}

/** Runs in a child process: answers each day seed with that day's sims. */
export function worker(): Promise<void> {
  const { ctx } = load();
  return new Promise((resolve) => {
    process.on('message', (msg: { daySeed: number; runs: number }) => {
      process.send?.(simulateDay(ctx, msg.daySeed, msg.runs));
    });
    process.on('disconnect', () => resolve());
  });
}

// ---------- cache and pool ----------

function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Everything a day's sims depend on. Crowd values, pool, takeout and money rules are not in it. */
function cacheKey(ctx: DayContext, runs: number): string {
  const stableHash = hash(JSON.stringify(ctx.stable));
  const rulesHash = hash(JSON.stringify({ races: ctx.races, draw: ctx.rules.draw, runs, track: ctx.track, tuning: ctx.tuning }));
  return `sim${SIM_VERSION}-v${HARNESS_CACHE_VERSION}-stable${stableHash}-rules${rulesHash}`;
}

const load1 = () => loadavg()[0].toFixed(2);

async function simsFor(
  launcher: string, ctx: DayContext, seeds: number[], runs: number, workers: number, dir: string, log: (line: string) => void,
): Promise<{ days: DaySims[]; computed: number }> {
  mkdirSync(dir, { recursive: true });
  const path = (s: number) => join(dir, `day-${s}.json`);
  const have = new Map<number, DaySims>();
  for (const s of seeds) if (existsSync(path(s))) have.set(s, JSON.parse(readFileSync(path(s), 'utf8')) as DaySims);
  const todo = seeds.filter((s) => !have.has(s));
  if (todo.length > 0) {
    log(`sims: ${todo.length} days to run (${seeds.length - todo.length} cached) on ${Math.min(workers, todo.length)} workers, load ${load1()}`);
    const started = performance.now();
    let next = 0;
    let done = 0;
    await new Promise<void>((resolve, reject) => {
      const feed = (kid: ChildProcess) => {
        if (next < todo.length) kid.send({ daySeed: todo[next++], runs });
        else kid.disconnect();
      };
      for (let w = 0; w < Math.min(workers, todo.length); w++) {
        const kid = fork(launcher, ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
        kid.on('message', (day: DaySims) => {
          writeFileSync(path(day.daySeed), JSON.stringify(day));
          have.set(day.daySeed, day);
          done++;
          if (done % Math.max(1, Math.floor(todo.length / 50)) === 0 || done === todo.length) {
            log(`sims: ${done}/${todo.length} days, ${((performance.now() - started) / 1000).toFixed(0)} s, load ${load1()}`);
          }
          if (done === todo.length) resolve();
          feed(kid);
        });
        kid.on('exit', (code) => {
          if (code !== 0 && done < todo.length) reject(new Error(`a harness worker exited with ${code}`));
        });
        feed(kid);
      }
    });
  }
  return { days: seeds.map((s) => have.get(s)!), computed: todo.length };
}

// ---------- measuring ----------

/** Dollars staked and returned. exp prices each bet with the holdout estimate; back is what the real race paid. */
interface Tally { bets: number; wins: number; staked: number; exp: number; back: number; esq: number; rsq: number }
const tally = (): Tally => ({ bets: 0, wins: 0, staked: 0, exp: 0, back: 0, esq: 0, rsq: 0 });
function addBet(t: Tally, dollars: number, holdP: number, perDollar: number, won: boolean): void {
  const e = (holdP * perDollar) / 100 - 1;
  const r = (won ? perDollar / 100 : 0) - 1;
  t.bets++;
  t.staked += dollars;
  t.exp += dollars * (1 + e);
  t.back += dollars * (1 + r);
  t.esq += e * e;
  t.rsq += r * r;
  if (won) t.wins++;
}
const expRet = (t: Tally) => (t.staked === 0 ? NaN : t.exp / t.staked - 1);
const realRet = (t: Tally) => (t.staked === 0 ? NaN : t.back / t.staked - 1);
const se = (sq: number, mean: number, n: number) => (n < 2 ? NaN : Math.sqrt(Math.max(0, sq / n - mean * mean) / (n - 1)));
const seExp = (t: Tally) => se(t.esq, expRet(t), t.bets);
const seReal = (t: Tally) => se(t.rsq, realRet(t), t.bets);

const sgn = (x: number) => (Number.isNaN(x) ? '   n/a' : `${x >= 0 ? '+' : ''}${x.toFixed(3)}`);
const pct = (x: number) => (Number.isNaN(x) ? 'n/a' : (x * 100).toFixed(1));
const firstMax = (xs: number[]) => xs.reduce((b, x, i) => (x > xs[b] ? i : b), 0);
const firstMin = (xs: number[]) => xs.reduce((b, x, i) => (x < xs[b] ? i : b), 0);
const quantile = (sorted: number[], q: number) => sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)];
const median = (sorted: number[]) => (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2;
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

interface Check { name: string; band: string; value: string; pass: boolean }

type Harness = BettingData['betting']['harness'];

function measure(ctx: DayContext, harness: Harness, days: DaySims[], runs: number): { text: string; checks: Check[] } {
  const rules = ctx.rules;
  const bands = { ...harness.bands.value, valueThreshold: harness.valueThreshold.value };
  const steps = rules.steps;
  const stepOf = (label: string) => steps.findIndex((s) => s.label === label);
  const byId = new Map(ctx.stable.map((h) => [h.id, h]));
  const threshold = bands.valueThreshold;

  const bettors = { random: tally(), favorite: tally(), longest: tally(), value: tally() };
  const blind = new Map<string, Tally>();
  const blindRule = (name: string) => {
    if (!blind.has(name)) blind.set(name, tally());
    return blind.get(name)!;
  };
  const horses = new Map<string, { starts: number; wins: number; holdSum: number; stepSum: number; t: Tally }>();
  const favSteps: number[] = [];
  let races = 0, favRealWins = 0, favExpWins = 0, favShare = 0, shortFav = 0, longshot = 0, flat = 0;
  const edges = bands.calibration.groupEdgesPercent.map((e) => e / 100);
  const groups = [0, ...edges].map((lo, i, all) => ({ lo, hi: all[i + 1] ?? Infinity, n: 0, est: 0, hold: 0, wins: 0 }));
  const favDayNet: number[] = [];
  const valueDayNet: number[] = [];
  let valueDaysWithBets = 0;
  const feel = { favorite: [] as number[], random: [] as number[], favoriteBroke: 0, randomBroke: 0 };

  for (const day of days) {
    let favNet = 0, valueNet = 0, valueBets = 0;
    const raceInfo: Array<{ crowd: number[]; winner: number }> = [];
    for (const r of day.races) {
      races++;
      const styles = r.horseIds.map((id) => byId.get(id)!.style);
      const est: Estimate = { runs, wins: r.crowdWins };
      const crowd = crowdFor(est, styles, day.daySeed, r.race, rules);
      raceInfo.push({ crowd, winner: r.winner });
      const hold = r.holdWins.map((w) => w / runs);
      const crowdP = r.crowdWins.map((w) => w / runs);
      const noBet = pricesWith(crowd, null, rules);
      const stepIdx = noBet.perDollarCents.map((pd) => oddsStepIndex(pd, steps));
      // Each horse priced with a $2 bet of its own in the pool.
      const pd = crowd.map((_, i) => pricesWith(crowd, { post: i + 1, dollars: FLAT_DOLLARS }, rules).perDollarCents[i]);
      const won = (i: number) => r.winner === i + 1;
      const bet = (t: Tally, i: number) => addBet(t, FLAT_DOLLARS, hold[i], pd[i], won(i));

      crowd.forEach((_, i) => bet(bettors.random, i));
      const fav = firstMax(crowd);
      bet(bettors.favorite, fav);
      favNet += won(fav) ? (FLAT_DOLLARS * pd[fav]) / 100 - FLAT_DOLLARS : -FLAT_DOLLARS;
      bet(bettors.longest, firstMin(crowd));
      const score = crowd.map((_, i) => (crowdP[i] * pd[i]) / 100);
      const best = firstMax(score);
      if (score[best] >= threshold) {
        bet(bettors.value, best);
        valueBets++;
        valueNet += won(best) ? (FLAT_DOLLARS * pd[best]) / 100 - FLAT_DOLLARS : -FLAT_DOLLARS;
      }

      // The field's spread and the favorite.
      favSteps.push(stepIdx[fav]);
      if (won(fav)) favRealWins++;
      favExpWins += hold[fav];
      favShare += crowd[fav] / rules.crowdDollars;
      if (stepIdx[fav] <= stepOf(bands.shortFavorite.oddsOrShorter)) shortFav++;
      if (stepIdx.some((s) => s >= stepOf(bands.longshot.oddsOrLonger))) longshot++;
      if (stepIdx.every((s) => s >= stepOf(bands.flatField.from) && s <= stepOf(bands.flatField.to))) flat++;

      crowdP.forEach((p, i) => {
        const g = groups.find((x) => p >= x.lo && p < x.hi)!;
        g.n++;
        g.est += p;
        g.hold += hold[i];
        if (won(i)) g.wins++;
      });

      // Blind rules: what a reader without the estimate could follow.
      const field = r.horseIds.map((id) => byId.get(id)!);
      styles.forEach((s, i) => bet(blindRule(`every ${styleWord(s)}`), i));
      for (const s of ['frontRunner', 'stalker', 'closer'] as const) {
        const ofStyle = crowd.map((d, i) => (styles[i] === s ? d : -1));
        if (ofStyle.some((d) => d >= 0)) bet(blindRule(`crowd's top ${styleWord(s)}`), firstMax(ofStyle));
      }
      bet(blindRule('highest stat total'), firstMax(field.map((h) => h.stats.speed + h.stats.stamina + h.stats.kick)));
      for (const k of ['speed', 'stamina', 'kick'] as const) bet(blindRule(`highest ${k}`), firstMax(field.map((h) => h.stats[k])));
      bet(blindRule('post 1'), 0);
      bet(blindRule('longest name (control)'), firstMax(field.map((h) => h.name.length)));

      r.horseIds.forEach((id, i) => {
        const h = horses.get(id) ?? { starts: 0, wins: 0, holdSum: 0, stepSum: 0, t: tally() };
        h.starts++;
        if (won(i)) h.wins++;
        h.holdSum += hold[i];
        h.stepSum += stepIdx[i];
        addBet(h.t, FLAT_DOLLARS, hold[i], pd[i], won(i));
        horses.set(id, h);
      });
    }
    favDayNet.push(favNet);
    valueDayNet.push(valueNet);
    if (valueBets > 0) valueDaysWithBets++;

    // What a player feels: $10 a race from $100 through the game's own bankroll rules.
    for (const who of ['favorite', 'random'] as const) {
      let state = newDay(ctx, day.daySeed);
      const drawn: DrawnRace[] = drawnDay(ctx, day.daySeed);
      for (const d of drawn) {
        if (state.ended !== null) break;
        const r = day.races[d.race - 1];
        const program = programFor(ctx, d, { runs, wins: r.crowdWins });
        const offered = offeredAmounts(state.bankrollCents, rules).filter((a) => a <= FEEL_DOLLARS);
        const post = who === 'favorite' ? firstMax(program.crowdDollars) + 1 : createStream(day.daySeed, RANDOM_STREAM, String(d.race)).int(1, d.horseIds.length);
        state = goToPost(ctx, state, program, offered.length === 0 ? null : { post, dollars: offered[offered.length - 1] });
        // settle reads only the result's seed and winner; the cached sims hold both.
        state = settle(ctx, state, { seed: d.raceSeed, finish: [{ post: r.winner }] } as unknown as RaceResult);
      }
      feel[who].push(state.bankrollCents);
      if (state.ended === 'broke') feel[`${who}Broke`]++;
    }
  }

  // ----- report -----
  const out: string[] = [];
  const checks: Check[] = [];
  const check = (name: string, band: string, value: string, pass: boolean) => checks.push({ name, band, value, pass });
  const inRange = (x: number, b: { min: number; max: number }) => x >= b.min && x <= b.max;
  const rangeText = (b: { min: number; max: number }) => `${b.min} to ${b.max}`;
  const nDays = days.length;
  out.push(`Bluegrass Dynasty betting harness (B3)`);
  out.push(`days ${days[0].daySeed} to ${days[nDays - 1].daySeed} (${nDays} days, ${races} races), N = ${runs} for the crowd's estimate and ${runs} for the holdout, SIM_VERSION ${SIM_VERSION}`);
  out.push(`stable ${ctx.stable.length} horses; crowd noise ${rules.crowd.noise}, styleLean ${JSON.stringify(rules.crowd.styleLean)}, flatten ${rules.crowd.flatten}; pool $${rules.crowdDollars}, takeout ${rules.pool.takeoutBasisPoints / 100}%`);
  out.push(`Returns are per dollar staked, $2 flat, each bet priced with its own $2 in the pool. "expected" prices every bet with`);
  out.push(`the holdout estimate (bands are judged on it); "realized" is what the real races paid. SE is one standard error.`);

  out.push('');
  out.push('HN2 bettors                 bets  winners   expected (SE)      realized (SE)');
  const row = (name: string, t: Tally) => `  ${name.padEnd(24)} ${String(t.bets).padStart(6)} ${String(t.wins).padStart(7)}   ${sgn(expRet(t))} (${seExp(t).toFixed(3)})   ${sgn(realRet(t))} (${seReal(t).toFixed(3)})`;
  out.push(row('random (every horse)', bettors.random));
  out.push(row('favorite', bettors.favorite));
  out.push(row('longest price', bettors.longest));
  out.push(row(`value (>= ${threshold})`, bettors.value) + `   bets in ${pct(bettors.value.bets / races)}% of races`);

  const b = bands;
  check('random return per dollar', rangeText(b.randomReturnPerDollar), sgn(expRet(bettors.random)), inRange(expRet(bettors.random), b.randomReturnPerDollar));
  check('favorite return per dollar', rangeText(b.favoriteReturnPerDollar), sgn(expRet(bettors.favorite)), inRange(expRet(bettors.favorite), b.favoriteReturnPerDollar));
  check('longest return per dollar', rangeText(b.longestReturnPerDollar), sgn(expRet(bettors.longest)), inRange(expRet(bettors.longest), b.longestReturnPerDollar));
  check('value return per dollar', `at least ${b.valueReturnPerDollarMin}`, sgn(expRet(bettors.value)), expRet(bettors.value) >= b.valueReturnPerDollarMin);
  check('value bets, percent of races', `at least ${b.valueBetPercentMin}`, pct(bettors.value.bets / races), (bettors.value.bets * 100) / races >= b.valueBetPercentMin);
  const favExp = (favExpWins * 100) / races;
  check('favorite wins, percent (expected)', rangeText(b.favoriteWinPercent), favExp.toFixed(1), inRange(favExp, b.favoriteWinPercent));

  out.push('');
  out.push('The favorite and the spread (crowd prices, no player bet)');
  out.push(`  favorite wins ${favExp.toFixed(1)}% expected, ${pct(favRealWins / races)}% realized (${favRealWins} of ${races}); mean crowd share ${pct(favShare / races)}%`);
  const sortedSteps = [...favSteps].sort((x, y) => x - y);
  const medLo = sortedSteps[(races - 1) >> 1], medHi = sortedSteps[races >> 1];
  const medText = steps[medLo].label + (medLo === medHi ? '' : ` / ${steps[medHi].label}`);
  out.push(`  favorite's odds: median ${medText}, quartiles ${steps[quantile(sortedSteps, 0.25)].label} and ${steps[quantile(sortedSteps, 0.75)].label}, shortest ${steps[sortedSteps[0]].label}, longest ${steps[sortedSteps[races - 1]].label}`);
  out.push(`  fields with the favorite at ${b.shortFavorite.oddsOrShorter} or shorter ${pct(shortFav / races)}%; with a horse at ${b.longshot.oddsOrLonger} or longer ${pct(longshot / races)}%; every horse ${b.flatField.from} to ${b.flatField.to} ${pct(flat / races)}%`);
  check("favorite's median odds", `${b.favoriteMedianOdds.shortest} to ${b.favoriteMedianOdds.longest}`, medText, medLo >= stepOf(b.favoriteMedianOdds.shortest) && medHi <= stepOf(b.favoriteMedianOdds.longest));
  check(`fields with favorite ${b.shortFavorite.oddsOrShorter} or shorter, percent`, `at least ${b.shortFavorite.fieldsPercentMin}`, pct(shortFav / races), (shortFav * 100) / races >= b.shortFavorite.fieldsPercentMin);
  check(`fields with a horse ${b.longshot.oddsOrLonger} or longer, percent`, `at least ${b.longshot.fieldsPercentMin}`, pct(longshot / races), (longshot * 100) / races >= b.longshot.fieldsPercentMin);
  check(`fields with every horse ${b.flatField.from} to ${b.flatField.to}, percent`, `at most ${b.flatField.fieldsPercentMax}`, pct(flat / races), (flat * 100) / races <= b.flatField.fieldsPercentMax);

  out.push('');
  out.push(`Calibration (PB5): horses grouped by the crowd's estimate; actual is the real races. Band: within ${b.calibration.withinPoints} points.`);
  out.push('  group (est %)   horses  mean est  holdout  actual   SE(actual)');
  for (const g of groups) {
    const label = `${pct(g.lo).replace('.0', '')} to ${g.hi === Infinity ? 'up' : pct(g.hi).replace('.0', '')}`;
    if (g.n === 0) {
      out.push(`  ${label.padEnd(15)} none`);
      continue;
    }
    const est = g.est / g.n, act = g.wins / g.n;
    out.push(`  ${label.padEnd(15)} ${String(g.n).padStart(6)}  ${pct(est).padStart(7)}  ${pct(g.hold / g.n).padStart(7)}  ${pct(act).padStart(6)}   ${(Math.sqrt((est * (1 - est)) / g.n) * 100).toFixed(1).padStart(6)}`);
    check(`calibration ${label}`, `actual within ${b.calibration.withinPoints} points of ${pct(est)}`, pct(act), Math.abs(act - est) * 100 <= b.calibration.withinPoints);
  }

  out.push('');
  out.push(`Blind rules: no rule a reader can follow without the estimate may return above ${b.blindRuleReturnPerDollarMax} (expected).`);
  out.push('  rule                        bets  winners   expected (SE)      realized (SE)');
  for (const [name, t] of blind) {
    out.push(row(name, t));
    check(`blind rule: ${name}`, `at most ${b.blindRuleReturnPerDollarMax}`, sgn(expRet(t)), expRet(t) <= b.blindRuleReturnPerDollarMax);
  }

  out.push('');
  out.push('What a player feels');
  const ahead = (xs: number[]) => xs.filter((x) => x > 1e-9).length;
  out.push(`  $2 on the favorite every race: ends the day ahead on ${pct(ahead(favDayNet) / nDays)}% of days`);
  out.push(`  value bettor ($2 when it bets): ends ahead on ${pct(ahead(valueDayNet) / nDays)}% of all days (${pct(ahead(valueDayNet) / Math.max(1, valueDaysWithBets))}% of the ${valueDaysWithBets} days it bet)`);
  for (const who of ['favorite', 'random'] as const) {
    const sorted = [...feel[who]].sort((x, y) => x - y);
    out.push(`  $${FEEL_DOLLARS} a race on the ${who === 'favorite' ? 'favorite' : 'random horse'} from $${rules.startCents / 100} (capped, smaller bet when $${FEEL_DOLLARS} is not offered): end bankroll median ${money(median(sorted))}, 10th percentile ${money(quantile(sorted, 0.1))}, 90th ${money(quantile(sorted, 0.9))}; broke before race 8 on ${pct(feel[`${who}Broke`] / nDays)}% of days; ahead on ${pct(sorted.filter((c) => c > rules.startCents).length / nDays)}%`);
  }

  out.push('');
  out.push('Per horse ($2 every start, expected from the holdout; avg odds is the mean tote step)');
  out.push('  id   name                style        starts  wins  exp win%  avg odds  expected');
  const sortedHorses = [...horses].sort(([a], [c]) => (a < c ? -1 : a > c ? 1 : 0));
  for (const [id, h] of sortedHorses) {
    const s = byId.get(id)!;
    out.push(`  ${id}  ${s.name.padEnd(18)}  ${styleWord(s.style).padEnd(12)} ${String(h.starts).padStart(6)} ${String(h.wins).padStart(5)}  ${pct(h.holdSum / h.starts).padStart(8)}  ${steps[Math.round(h.stepSum / h.starts)].label.padStart(8)}  ${sgn(expRet(h.t))}`);
  }
  const best = sortedHorses.reduce((x, y) => (expRet(y[1].t) > expRet(x[1].t) ? y : x));
  const worst = sortedHorses.reduce((x, y) => (expRet(y[1].t) < expRet(x[1].t) ? y : x));
  out.push(`  best ${best[0]} ${sgn(expRet(best[1].t))}, worst ${worst[0]} ${sgn(expRet(worst[1].t))} (not banded)`);

  out.push('');
  const failed = checks.filter((c) => !c.pass);
  out.push('FLAGS');
  if (failed.length === 0) out.push('  none');
  for (const c of failed) out.push(`  ${c.name}: measured ${c.value}, band ${c.band}`);
  out.push('');
  out.push(`${checks.length - failed.length} of ${checks.length} checks passed.`);
  return { text: out.join('\n') + '\n', checks };
}

function styleWord(s: string): string {
  return s === 'frontRunner' ? 'front-runner' : s;
}


// ---------- commands ----------

interface Args { days: number; from: number; workers: number; runs?: number; cache: string; selftest: boolean }

function parseArgs(argv: string[]): Args {
  const a: Args = { days: 500, from: 1, workers: cpus().length, cache: join(process.env.TMPDIR ?? tmpdir(), 'betharness'), selftest: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--selftest') {
      a.selftest = true;
      continue;
    }
    const value = argv[++i];
    if (value === undefined) throw new Error(`${flag} needs a value`);
    const whole = () => {
      if (!/^\d+$/.test(value)) throw new Error(`${flag} needs a whole number, got "${value}"`);
      return Number(value);
    };
    if (flag === '--days') a.days = whole();
    else if (flag === '--from') a.from = whole();
    else if (flag === '--workers') a.workers = whole();
    else if (flag === '--runs') a.runs = whole();
    else if (flag === '--cache') a.cache = value;
    else throw new Error(`unknown option ${flag}`);
  }
  if (a.days < 1 || a.workers < 1 || (a.runs !== undefined && a.runs < 1)) throw new Error('--days, --workers and --runs must be at least 1');
  if (a.from + a.days - 1 > MAX_SEED) throw new Error(`day seeds run past ${MAX_SEED}`);
  return a;
}

async function harness(launcher: string, ctx: DayContext, h: Harness, a: Args, quiet = false): Promise<{ text: string; computed: number; failed: number }> {
  const runs = a.runs ?? ctx.rules.runsPerRace;
  const dir = join(a.cache, cacheKey(ctx, runs));
  mkdirSync(dir, { recursive: true });
  const logPath = join(dir, 'harness.log');
  const log = (line: string) => {
    appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`);
    if (!quiet) console.error(line);
  };
  const seeds = Array.from({ length: a.days }, (_, i) => a.from + i);
  const { days, computed } = await simsFor(launcher, ctx, seeds, runs, a.workers, dir, log);
  const { text, checks } = measure(ctx, h, days, runs);
  return { text, computed, failed: checks.filter((c) => !c.pass).length };
}

async function selftest(launcher: string, ctx: DayContext, h: Harness): Promise<number> {
  const root = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'betharness-selftest-'));
  const base = { days: 3, from: 41, runs: 30, selftest: true };
  let ok = true;
  const say = (label: string, pass: boolean, extra = '') => {
    ok &&= pass;
    console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? `: ${extra}` : ''}`);
  };
  const one = await harness(launcher, ctx, h, { ...base, workers: 1, cache: join(root, 'a') }, true);
  const three = await harness(launcher, ctx, h, { ...base, workers: 3, cache: join(root, 'b') }, true);
  say('1 worker and 3 workers give the same summary', one.text === three.text, `${one.computed} and ${three.computed} days simulated`);
  const again = await harness(launcher, ctx, h, { ...base, workers: 3, cache: join(root, 'b') }, true);
  say('the cache reproduces a fresh run', again.text === three.text && again.computed === 0, `${again.computed} days simulated on the rerun`);
  // In process, no workers at all: the same sims as the pool's.
  const direct = simulateDay(ctx, base.from, base.runs);
  const cached = JSON.parse(readFileSync(join(root, 'b', cacheKey(ctx, base.runs), `day-${base.from}.json`), 'utf8'));
  say('a day simulated in this process equals the workers\' cached day', JSON.stringify(direct) === JSON.stringify(cached));
  let overlaps = 0;
  for (const runs of [base.runs, ctx.rules.runsPerRace]) {
    for (let d = 1; d <= 20; d++) for (let r = 1; r <= ctx.races.length; r++) {
      const hold = holdoutSeeds(d, r, runs);
      const crowd = new Set([raceSeedOf(d, r), ...estimateSeedsOf(d, r, runs)]);
      if (hold.length !== runs || new Set(hold).size !== runs || hold.some((s) => crowd.has(s))) overlaps++;
    }
  }
  say(`holdout seeds are ${base.runs} and ${ctx.rules.runsPerRace} distinct seeds, never a crowd estimate seed or the race seed (20 days, every race)`, overlaps === 0);
  console.log(`selftest ${ok ? 'passed' : 'FAILED'} (scratch in ${root})`);
  return ok ? 0 : 1;
}

export async function main(argv: string[], launcher: string): Promise<number> {
  let a: Args;
  try {
    a = parseArgs(argv);
  } catch (err) {
    console.error(`${err instanceof Error ? err.message : String(err)}\n\n${USAGE}`);
    return 1;
  }
  const { data, ctx } = load();
  if (a.selftest) return selftest(launcher, ctx, data.betting.harness);
  const started = performance.now();
  const r = await harness(launcher, ctx, data.betting.harness, a);
  process.stdout.write(r.text);
  console.log(`(wall time ${((performance.now() - started) / 1000).toFixed(1)} s, ${a.workers} workers, ${r.computed} of ${a.days} days simulated, the rest from the cache; load ${load1()})`);
  return 0;
}
