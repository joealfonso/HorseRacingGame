// B0 feasibility probe (docs/specs/betting-simple.md): the fixture stable, the probe's starting
// values and the inputs for one field. Pure and Node-free, so the Chrome cost snippet can import
// it from the dev server and measure exactly what Node measures.
import race from '../src/data/race.json';
import track from '../src/data/track.json';
import tuning from '../src/data/tuning.json';
import { validateData } from '../src/data/validate';
import type { GameData } from '../src/data/schema';
import { createStream } from '../src/sim/rng';
import { runRace } from '../src/sim/runRace';
import type { CrowdValues, Style } from '../src/bet/crowd';
import { drawDay, type DrawRules } from '../src/bet/fieldDraw';
import type { PoolRules } from '../src/bet/payout';
import { estimateSeedsOf } from '../src/bet/streams';

export interface Tier { name: string; count: number; min: number; max: number }

export interface Recipe {
  /** Seed for the stable's own stream ("probeStable"), so the stat lines are reproducible. */
  seed: number;
  /** Highest tier first. Counts sum to the stable size. */
  tiers: Tier[];
  styleCounts: Record<Style, number>;
  /** How far a front-runner's speed sits above a third of its total, low and high. */
  frontSpeedLead: [number, number];
  /** How far a closer's speed sits below a third of its total. */
  closerSpeedLag: [number, number];
  /** Wobble on the other stats, plus or minus. */
  jitter: number;
}

export const START_RECIPE: Recipe = {
  seed: 20261113,
  tiers: [
    { name: 'sharp', count: 10, min: 235, max: 255 },
    { name: 'solid', count: 20, min: 210, max: 234 },
    { name: 'plain', count: 10, min: 185, max: 209 },
  ],
  styleCounts: { frontRunner: 14, stalker: 13, closer: 13 },
  frontSpeedLead: [8, 14],
  closerSpeedLag: [6, 12],
  jitter: 4,
};

export interface ProbeHorse {
  id: string;
  name: string;
  tier: string;
  style: Style;
  stats: { speed: number; stamina: number; kick: number };
}

const STYLE_ORDER: Style[] = ['frontRunner', 'stalker', 'closer'];

/** 40 stat lines from the recipe. Styles are dealt in turn down the tiers, so each style gets every class. */
export function probeStable(recipe: Recipe = START_RECIPE): ProbeHorse[] {
  const rng = createStream(recipe.seed, 'probeStable');
  const tiers = recipe.tiers.flatMap((t) => new Array<Tier>(t.count).fill(t));
  const left = { ...recipe.styleCounts };
  const horses: ProbeHorse[] = [];
  let turn = 0;
  for (let i = 0; i < tiers.length; i++) {
    while (left[STYLE_ORDER[turn % 3]] === 0) turn++;
    const style = STYLE_ORDER[turn % 3];
    left[style]--;
    turn++;

    const tier = tiers[i];
    const total = rng.int(tier.min, tier.max);
    const third = Math.floor(total / 3);
    let speed: number;
    let stamina: number;
    if (style === 'stalker') {
      speed = third + rng.int(-recipe.jitter, recipe.jitter);
      stamina = third + rng.int(-recipe.jitter, recipe.jitter);
    } else {
      const [lo, hi] = style === 'frontRunner' ? recipe.frontSpeedLead : recipe.closerSpeedLag;
      const shift = rng.int(lo, hi);
      speed = Math.min(99, style === 'frontRunner' ? third + shift : third - shift);
      stamina = Math.floor((total - speed) / 2) + rng.int(-recipe.jitter, recipe.jitter);
    }
    const kick = total - speed - stamina;
    const stats = { speed, stamina, kick };
    for (const [k, v] of Object.entries(stats)) {
      if (v < 1 || v > 99) throw new Error(`probe stable: horse ${i + 1} ${k} ${v} is outside 1 to 99`);
    }
    const n = String(i + 1).padStart(2, '0');
    horses.push({ id: `p${n}`, name: `Probe ${n}`, tier: tier.name, style, stats });
  }
  for (const s of STYLE_ORDER) {
    if (horses.filter((h) => h.style === s).length < 12) throw new Error(`probe stable: fewer than 12 ${s}s`);
  }
  return horses;
}

export const DAY_RULES: DrawRules = { races: 8, fieldSize: 8, maxStartsPerDay: 2, racesBeforeRerun: 3 };
export const POOL_RULES: PoolRules = { takeoutBasisPoints: 1700, breakageCents: 10, minPayoffPerDollarCents: 105 };
export const POOL_DOLLARS = 25000;
export const START_CROWD: CrowdValues = { noise: 0.25, styleLean: { frontRunner: 0.1, stalker: 0, closer: -0.1 }, flatten: 0.08 };

/** The probe's day seeds run from this, 8 fields a day. */
export const FIRST_DAY_SEED = 1;

/** One field's sim inputs: shipped race, track and tuning, all default instructions. */
export function fieldInputs(stable: readonly ProbeHorse[], byPost: readonly number[]): GameData {
  const horses = byPost.map((i, k) => {
    const h = stable[i];
    return {
      id: h.id,
      name: h.name,
      jockey: `Jockey ${h.id.slice(1)}`,
      post: k + 1,
      style: h.style,
      stats: { ...h.stats },
      instructions: { early: 'default', move: 'default', path: 'default' },
    };
  });
  return validateData({ track, race, card: { horses }, tuning });
}

/** Day d's fields as stable indexes by post. */
export function dayFields(stable: readonly ProbeHorse[], daySeed: number): number[][] {
  return drawDay(stable, daySeed, DAY_RULES);
}

/**
 * PB1: one runRace on a drawn field (day 1, race 1), `warmUp` runs, then `runs` timed runs,
 * each on its own estimate seed. Returns milliseconds. `now` is the caller's clock.
 */
export function measureCost(now: () => number, runs = 500, warmUp = 50): { median: number; p99: number; worst: number; runs: number } {
  const stable = probeStable();
  const field = fieldInputs(stable, dayFields(stable, FIRST_DAY_SEED)[0]);
  const seeds = estimateSeedsOf(FIRST_DAY_SEED, 1, warmUp + runs);
  for (let i = 0; i < warmUp; i++) runRace(field, seeds[i]);
  const times: number[] = [];
  for (let i = warmUp; i < warmUp + runs; i++) {
    const t0 = now();
    runRace(field, seeds[i]);
    times.push(now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = (times[(runs - 1) >> 1] + times[runs >> 1]) / 2;
  return { median, p99: times[Math.ceil(runs * 0.99) - 1], worst: times[runs - 1], runs };
}
