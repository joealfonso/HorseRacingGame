import type { Stream } from '../sim/rng';
import { DAY_SUB_KEY, betStream } from './streams';

export interface DrawHorse {
  id: string;
  /** Silks body color. No two horses in a field share one. */
  silksBody: string;
}

export interface DrawRules {
  races: number;
  fieldSize: number;
  maxStartsPerDay: number;
  /** A horse that ran in race r runs again no earlier than race r + this. */
  racesBeforeRerun: number;
}

/** Randomized tries at the second starts before the proven arrangement is used (the default). */
export const SECOND_START_TRIES = 20;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const ringDistance = (x: number, size: number) => Math.min(x % size, size - (x % size));

/**
 * Strides d that lay `size` horses round a ring (horse i of a list at place i * d mod size) so
 * that any `maxRun` neighbors in the list land at least `fieldSize` places apart.
 */
export function validStrides(size: number, fieldSize: number, maxRun: number): number[] {
  const out: number[] = [];
  for (let d = 1; d < size; d++) {
    if (gcd(d, size) !== 1) continue;
    let ok = true;
    for (let k = 1; k < maxRun && ok; k++) ok = ringDistance(k * d, size) >= fieldSize;
    if (ok) out.push(d);
  }
  return out;
}

/**
 * Why a stable cannot be drawn under these rules, or null when it can. With null, drawDay
 * never fails (see drawDay). The stable loader reports these as ST1 errors.
 */
export function drawProblem(stable: readonly DrawHorse[], rules: DrawRules): string | null {
  const size = stable.length;
  const slots = rules.races * rules.fieldSize;
  if (size < rules.fieldSize * rules.racesBeforeRerun) {
    return `${size} horses; the draw needs at least ${rules.fieldSize * rules.racesBeforeRerun} (${rules.fieldSize} a field times ${rules.racesBeforeRerun} races before a rerun)`;
  }
  if (size * Math.min(rules.maxStartsPerDay, 2) < slots) {
    return `${size} horses at ${Math.min(rules.maxStartsPerDay, 2)} starts each cannot fill ${rules.races} races of ${rules.fieldSize}`;
  }
  if (size > slots) return `${size} horses; ${rules.races} races of ${rules.fieldSize} cannot start every horse once`;
  const maxRun = Math.max(...countBodies(stable).values());
  if (validStrides(size, rules.fieldSize, maxRun).length === 0) {
    return `${size} horses with up to ${maxRun} on one silks body color cannot be spaced ${rules.fieldSize} apart`;
  }
  return null;
}

function countBodies(stable: readonly DrawHorse[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const h of stable) counts.set(h.silksBody, (counts.get(h.silksBody) ?? 0) + 1);
  return counts;
}

function shuffle<T>(list: T[], rng: Stream): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/**
 * A day's fields from the day seed alone: for each race, stable indexes by post (index 0 is
 * post 1). Never fails when drawProblem is null:
 *
 * 1. First starts. The horses are listed by silks body color (colors and horses in a shuffled
 *    order), then laid round a ring of S places with a stride d from validStrides, so two
 *    horses on one color are at least a field apart round the ring. Races take the ring in
 *    order, F places each. Any F places in a row hold F different colors, and every horse runs
 *    once before any runs twice.
 * 2. Second starts fill the remaining R * F - S places. A shuffled greedy pick, tried up to
 *    secondStartTries times (SECOND_START_TRIES by default; 0 goes straight to the fallback), takes horses whose first race is at least racesBeforeRerun
 *    back and whose color is not yet in the field. If every try sticks, the second starts are
 *    the ring again from its start: place S + j holds ring place j. That is always valid: its
 *    races are runs of F places round the ring (distinct colors and horses), and a horse at
 *    ring place j runs in races floor(j / F) and floor((S + j) / F), at least floor(S / F) >=
 *    racesBeforeRerun apart.
 * 3. Posts: each field is shuffled on its own race's stream.
 *
 * The day's arrangement draws on `fieldDraw` with sub-key "day"; race r's posts on sub-key r.
 */
export function drawDay(stable: readonly DrawHorse[], daySeed: number, rules: DrawRules, secondStartTries = SECOND_START_TRIES): number[][] {
  // 3. Posts: each field's pick order is shuffled on its own race's stream.
  return pickDay(stable, daySeed, rules, secondStartTries).map((picked, r) => shuffle(picked, betStream(daySeed, 'fieldDraw', r + 1)));
}

/**
 * Steps 1 and 2 of drawDay: each race's horses in the order they were picked, before posts
 * are drawn. drawDay shuffles each of these into posts. Exposed so a test can show the post a
 * horse gets does not depend on when it was picked (FD6).
 */
export function pickDay(stable: readonly DrawHorse[], daySeed: number, rules: DrawRules, secondStartTries = SECOND_START_TRIES): number[][] {
  if (!Number.isInteger(secondStartTries) || secondStartTries < 0) throw new Error(`drawDay: secondStartTries must be a whole number of 0 or more, got ${secondStartTries}`);
  const problem = drawProblem(stable, rules);
  if (problem !== null) throw new Error(`field draw: ${problem}`);
  const size = stable.length;
  const { fieldSize, races } = rules;
  const rng = betStream(daySeed, 'fieldDraw', DAY_SUB_KEY);

  // 1. The ring.
  const byBody = new Map<string, number[]>();
  stable.forEach((h, i) => byBody.set(h.silksBody, [...(byBody.get(h.silksBody) ?? []), i]));
  const bodies = shuffle([...byBody.keys()].sort(), rng);
  const listed = bodies.flatMap((b) => shuffle([...byBody.get(b)!], rng));
  const maxRun = Math.max(...[...byBody.values()].map((v) => v.length));
  const strides = validStrides(size, fieldSize, maxRun);
  const stride = strides[rng.int(0, strides.length - 1)];
  const ring = new Array<number>(size);
  listed.forEach((horse, i) => { ring[(i * stride) % size] = horse; });

  // 2. Second starts.
  const extra = races * fieldSize - size;
  const firstRace = new Array<number>(size);
  ring.forEach((horse, place) => { firstRace[horse] = Math.floor(place / fieldSize); });
  let seconds: number[] | null = null;
  for (let t = 0; t < secondStartTries && seconds === null && extra > 0; t++) {
    seconds = trySeconds(stable, ring, firstRace, extra, rules, rng);
  }
  const order = [...ring, ...(seconds ?? ring.slice(0, extra))];

  const picked: number[][] = [];
  for (let r = 0; r < races; r++) picked.push(order.slice(r * fieldSize, (r + 1) * fieldSize));
  return picked;
}

function trySeconds(
  stable: readonly DrawHorse[], ring: readonly number[], firstRace: readonly number[], extra: number, rules: DrawRules, rng: Stream,
): number[] | null {
  const size = ring.length;
  const { fieldSize, racesBeforeRerun } = rules;
  const used = new Set<number>();
  const out: number[] = [];
  const pool = shuffle([...ring], rng);
  for (let place = size; place < size + extra; place++) {
    const race = Math.floor(place / fieldSize);
    // Horses already in this race: ring places from its start (a race may mix first and second starts).
    const inRace: number[] = [];
    for (let p = race * fieldSize; p < place; p++) inRace.push(p < size ? ring[p] : out[p - size]);
    const colors = new Set(inRace.map((h) => stable[h].silksBody));
    const pick = pool.find((h) => !used.has(h) && !inRace.includes(h) && !colors.has(stable[h].silksBody) && race - firstRace[h] >= racesBeforeRerun);
    if (pick === undefined) return null;
    used.add(pick);
    out.push(pick);
  }
  return out;
}
