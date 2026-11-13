// The race-day session: plain data handed from scene to scene, never a global (spec 4.9).

export const SEED_SPACE = 4294967296;
export const SEED_RULE = '?seed= must be a whole number from 0 to 4294967295';

export interface Session {
  firstSeed: number;
  /** 0 for the first race. */
  raceNumber: number;
  /** Your horse, by program number. */
  pickPost: number;
}

/** The first seed from the page's query string: a seed, null when absent, or the rule when bad. */
export function parseSeedParam(search: string): { seed: number | null } | { error: string } {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null) return { seed: null };
  if (!/^\d{1,10}$/.test(raw)) return { error: SEED_RULE };
  const n = Number(raw);
  return n < SEED_SPACE ? { seed: n } : { error: SEED_RULE };
}

/** Race n's seed (LP1). */
export const seedFor = (firstSeed: number, raceNumber: number): number => (firstSeed + raceNumber) % SEED_SPACE;

export const nextRace = (s: Session): Session => ({ ...s, raceNumber: s.raceNumber + 1 });
