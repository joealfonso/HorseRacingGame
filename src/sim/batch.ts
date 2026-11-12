import type { GameData, Horse, RunningStyle } from '../data/schema';
import type { EventType, PaceLabel, RaceResult } from './result';
import { runRace } from './runRace';

// Batch logic for M1.6. It only calls runRace and counts, so it cannot change a race. No clock, no
// files, no printing: the command line wrapper in scripts/ does those and formats the summary.

const STYLES: RunningStyle[] = ['frontRunner', 'stalker', 'closer'];
// Styles rotated across posts, as in the B4 and I3 tests: front-runner, stalker, closer, front-runner, ...
const ROTATION: RunningStyle[] = ['frontRunner', 'stalker', 'closer'];
const EVENT_TYPES: EventType[] = ['blocked', 'steadied', 'bumped'];
const PACES: PaceLabel[] = ['hot', 'honest', 'slow'];
// Same field the tests use: every stat 70. Must match the default stat in equalSpecs in src/sim/testkit.ts.
const EQUAL_STAT = 70;
// One length in margin units (thousandths of a length). A unit, not a tuning value.
const ONE_LENGTH = 1000;

export interface Range { min: number; max: number }

/** A measured value against a band. A null bound means that side is not checked. */
export interface Check {
  id: 'F2' | 'F3' | 'F4' | 'F5';
  label: string;
  pass: boolean;
  measured: number;
  min: number | null;
  max: number | null;
  /** Extra words for the reader, for example which post or horse was worst. */
  detail: string;
}

export interface HorseLine {
  id: string;
  name: string;
  post: number;
  style: RunningStyle;
  /** Only the slots that are not default, for example "early: rateEarly". Empty when all default. */
  instructions: string[];
  winPercent: number;
  avgPlace: number;
  avgBeatenLengths: number;
}

export interface CardSummary {
  races: number;
  horses: HorseLine[];
  /** Winner's final time in hundredths of a second. */
  winnerTime: { median: number; min: number; max: number };
  closeWinPercent: number;
  photoFinishPercent: number;
  leaderAtEighthLosesPercent: number;
  /** Percent of races per pace label. */
  paceLabelPercent: Record<PaceLabel, number>;
  luck: { racesWithEventPercent: number; eventCount: Record<EventType, number> };
}

export interface FairnessSummary {
  /** Per running style, percent of races won from each post (index 0 is post 1). */
  postWinPercent: Record<RunningStyle, number[]>;
  /** Per running style, percent of races won by that style, divided by the horses of that style. 0 and not measured when the style has no horse. */
  styleWinPercentPerHorse: Record<RunningStyle, number>;
  styleHorseCount: Record<RunningStyle, number>;
}

export interface BatchSummary {
  seedStart: number;
  races: number;
  fieldSize: number;
  card: CardSummary;
  fairness: FairnessSummary;
  checks: Check[];
}

const pct = (n: number, of: number): number => (100 * n) / of;

const DEFAULT_INSTRUCTIONS = { early: 'default', move: 'default', path: 'default' } as const;

/** The loaded data with the card replaced by equal horses on posts 1.., default instructions, and a neutral track. */
function fairField(base: GameData, styles: RunningStyle[]): GameData {
  const data = structuredClone(base);
  const proto: Horse = structuredClone(data.card.horses[0]);
  data.card.horses = styles.map((style, i) => ({
    ...structuredClone(proto),
    id: `t${i + 1}`,
    name: `Test Horse ${i + 1}`,
    post: i + 1,
    style,
    stats: { speed: EQUAL_STAT, stamina: EQUAL_STAT, kick: EQUAL_STAT },
    instructions: { ...DEFAULT_INSTRUCTIONS },
  }));
  data.race.trackBias = { lane: 'neutral', style: 'neutral' };
  return data;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Run the loaded card over the seeds and count what the drama and competition checks need. */
export function summarizeCard(data: GameData, seedStart: number, races: number): CardSummary {
  const horses = [...data.card.horses].sort((a, b) => a.post - b.post);
  const wins = new Map<string, number>(horses.map((h) => [h.id, 0]));
  const placeSum = new Map<string, number>(horses.map((h) => [h.id, 0]));
  const beatenSum = new Map<string, number>(horses.map((h) => [h.id, 0]));
  const times: number[] = [];
  const pace: Record<PaceLabel, number> = { hot: 0, honest: 0, slow: 0 };
  const eventCount: Record<EventType, number> = { blocked: 0, steadied: 0, bumped: 0 };
  let close = 0;
  let photo = 0;
  let leaderLoses = 0;
  let racesWithEvent = 0;

  for (let seed = seedStart; seed < seedStart + races; seed++) {
    const r: RaceResult = runRace(data, seed);
    const winner = r.finish[0];
    wins.set(winner.id, (wins.get(winner.id) ?? 0) + 1);
    for (const f of r.finish) {
      placeSum.set(f.id, (placeSum.get(f.id) ?? 0) + f.place);
      beatenSum.set(f.id, (beatenSum.get(f.id) ?? 0) + f.beatenLengths);
    }
    times.push(winner.time);
    pace[r.pace.label]++;
    const margin = r.finish[1]?.margin;
    if (margin && margin.lengths <= ONE_LENGTH) close++;
    if (r.photoFinish) photo++;
    const eighth = r.calls.find((c) => c.furlongsToGo === 1);
    if (!eighth) throw new Error(`race result for seed ${seed} has no call at one furlong to go`);
    if (eighth.horses[0].id !== winner.id) leaderLoses++;
    if (r.replay.events.length > 0) racesWithEvent++;
    for (const e of r.replay.events) eventCount[e.type]++;
  }

  times.sort((a, b) => a - b);
  const instructionWords = (h: Horse): string[] =>
    (['early', 'move', 'path'] as const).filter((k) => h.instructions[k] !== 'default').map((k) => `${k}: ${h.instructions[k]}`);
  return {
    races,
    horses: horses.map((h) => ({
      id: h.id,
      name: h.name,
      post: h.post,
      style: h.style,
      instructions: instructionWords(h),
      winPercent: pct(wins.get(h.id) ?? 0, races),
      avgPlace: (placeSum.get(h.id) ?? 0) / races,
      avgBeatenLengths: (beatenSum.get(h.id) ?? 0) / races / ONE_LENGTH,
    })),
    winnerTime: { median: median(times), min: times[0], max: times[times.length - 1] },
    closeWinPercent: pct(close, races),
    photoFinishPercent: pct(photo, races),
    leaderAtEighthLosesPercent: pct(leaderLoses, races),
    paceLabelPercent: { hot: pct(pace.hot, races), honest: pct(pace.honest, races), slow: pct(pace.slow, races) },
    luck: { racesWithEventPercent: pct(racesWithEvent, races), eventCount },
  };
}

/** F2 and F3: equal horses on a neutral track. */
export function summarizeFairness(data: GameData, seedStart: number, races: number): FairnessSummary {
  const n = data.card.horses.length;
  const postWinPercent = {} as Record<RunningStyle, number[]>;
  for (const style of STYLES) {
    const field = fairField(data, Array<RunningStyle>(n).fill(style));
    const wins = Array<number>(n).fill(0);
    for (let seed = seedStart; seed < seedStart + races; seed++) wins[runRace(field, seed).finish[0].post - 1]++;
    postWinPercent[style] = wins.map((w) => pct(w, races));
  }

  const rotated = Array.from({ length: n }, (_v, i) => ROTATION[i % ROTATION.length]);
  const field = fairField(data, rotated);
  const styleHorseCount: Record<RunningStyle, number> = { frontRunner: 0, stalker: 0, closer: 0 };
  for (const s of rotated) styleHorseCount[s]++;
  const styleWins: Record<RunningStyle, number> = { frontRunner: 0, stalker: 0, closer: 0 };
  for (let seed = seedStart; seed < seedStart + races; seed++) styleWins[rotated[runRace(field, seed).finish[0].post - 1]]++;
  const styleWinPercentPerHorse = {} as Record<RunningStyle, number>;
  for (const s of STYLES) styleWinPercentPerHorse[s] = styleHorseCount[s] === 0 ? 0 : pct(styleWins[s], races) / styleHorseCount[s];
  return { postWinPercent, styleWinPercentPerHorse, styleHorseCount };
}

const inBand = (v: number, min: number | null, max: number | null): boolean =>
  (min === null || v >= min) && (max === null || v <= max);

/** The F2 to F5 checks, from the summaries and the bands in tuning. */
export function buildChecks(data: GameData, card: CardSummary, fairness: FairnessSummary): Check[] {
  const c = data.tuning.checks;
  const n = data.card.horses.length;
  const fair = 100 / n;
  const tol = c.fairnessTolerancePoints.value;
  const lo = fair - tol;
  const hi = fair + tol;
  const checks: Check[] = [];

  const worst = (values: number[]): { v: number; i: number } => {
    let best = { v: values[0], i: 0 };
    values.forEach((v, i) => { if (Math.abs(v - fair) > Math.abs(best.v - fair)) best = { v, i }; });
    return best;
  };
  for (const style of STYLES) {
    const w = worst(fairness.postWinPercent[style]);
    checks.push({ id: 'F2', label: `post fairness, ${style}: farthest post win share`, pass: inBand(w.v, lo, hi), measured: w.v, min: lo, max: hi, detail: `post ${w.i + 1}` });
  }
  // A style with no horse in the rotation has nothing to measure, so it is left out of F3.
  const measured = STYLES.filter((s) => fairness.styleHorseCount[s] > 0);
  if (measured.length > 0) {
    const ws = worst(measured.map((s) => fairness.styleWinPercentPerHorse[s]));
    checks.push({ id: 'F3', label: 'style fairness: farthest style win share per horse', pass: inBand(ws.v, lo, hi), measured: ws.v, min: lo, max: hi, detail: measured[ws.i] });
  }

  const drama = (label: string, v: number, b: Range, id: Check['id'] = 'F4'): Check => ({ id, label, pass: inBand(v, b.min, b.max), measured: v, min: b.min, max: b.max, detail: '' });
  checks.push(drama('winning margin of one length or less, percent of races', card.closeWinPercent, c.closeWinPercentBand.value));
  checks.push(drama('photo finishes, percent of races', card.photoFinishPercent, c.photoFinishPercentBand.value));
  checks.push(drama('leader at the 1/8 pole does not win, percent of races', card.leaderAtEighthLosesPercent, c.leaderAtEighthLosesPercentBand.value));

  const band = c.cardWinSharePercentBand.value;
  const lowest = card.horses.reduce((a, b) => (b.winPercent < a.winPercent ? b : a));
  const highest = card.horses.reduce((a, b) => (b.winPercent > a.winPercent ? b : a));
  checks.push({ id: 'F5', label: 'competitive card: lowest horse win percent', pass: inBand(lowest.winPercent, band.min, null), measured: lowest.winPercent, min: band.min, max: null, detail: lowest.name });
  checks.push({ id: 'F5', label: 'competitive card: highest horse win percent', pass: inBand(highest.winPercent, null, band.max), measured: highest.winPercent, min: null, max: band.max, detail: highest.name });
  return checks;
}

/** Everything the command prints, for races seeds from seedStart (seedStart to seedStart + races - 1). */
export function runBatch(data: GameData, seedStart: number, races: number): BatchSummary {
  const card = summarizeCard(data, seedStart, races);
  const fairness = summarizeFairness(data, seedStart, races);
  return { seedStart, races, fieldSize: data.card.horses.length, card, fairness, checks: buildChecks(data, card, fairness) };
}

export { EVENT_TYPES, PACES, STYLES };
