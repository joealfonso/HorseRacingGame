import type { Card, Horse } from '../data/schema';

// The race-day session: plain data handed from scene to scene, never a global (spec 4.9).
// Its transitions are pure functions here, so the loop (spec 3.2 and 3.3) is checkable
// without Phaser: Card -> Orders -> race -> result -> Card.

export const SEED_SPACE = 4294967296;
export const SEED_RULE = '?seed= must be a whole number from 0 to 4294967295';

export type Orders = Horse['instructions'];

export interface Session {
  firstSeed: number;
  /** Races sent to the post so far, so the number of the next race. 0 before the first. */
  raceNumber: number;
  /** Your horse, by program number: the card's focus, and the horse whose orders you last opened. */
  pickPost: number;
  /** Last race's pick and the orders it ran on. Absent before the first race. */
  lastRace?: { post: number; orders: Orders } | null;
  /** Orders changed on the Orders screen and kept by Back to card, by post, for the coming race only. */
  drafts?: Readonly<Record<number, Orders>>;
}

/** What the race scene runs: its number, its seed, your horse and its orders. */
export interface RaceTicket {
  raceNumber: number;
  seed: number;
  post: number;
  orders: Orders;
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

/** A new day: race 0 next, post 1 focused, no last pick (spec 4.1, first race). */
export const newSession = (firstSeed: number): Session => ({ firstSeed, raceNumber: 0, pickPost: 1, lastRace: null, drafts: {} });

/** The card picked a horse: it is now your pick, and the card comes back focused on it. */
export const pickHorse = (s: Session, post: number): Session => ({ ...s, pickPost: post });

/**
 * The orders the Orders screen opens with for this horse (spec 4.2): changes kept from
 * this visit to the paddock first, then last race's orders for last race's horse, and
 * otherwise the horse's own orders from `card.json` (all Rider's call on the shipped card).
 * Always a fresh object.
 */
export function ordersFor(s: Session, card: Card, post: number): Orders {
  const kept = s.drafts?.[post];
  if (kept) return { ...kept };
  if (s.lastRace && s.lastRace.post === post) return { ...s.lastRace.orders };
  const h = card.horses.find((x) => x.post === post);
  return h ? { ...h.instructions } : { early: 'default', move: 'default', path: 'default' };
}

/** Same horse as last race comes back ready to go (spec 4.2 initial focus). */
export const sameHorseAsLastRace = (s: Session, post: number): boolean => !!s.lastRace && s.lastRace.post === post;

/** Back to card from Orders (Enter on Back to card, or Esc): the changes are kept. */
export const keepOrders = (s: Session, post: number, orders: Orders): Session =>
  ({ ...s, pickPost: post, drafts: { ...(s.drafts ?? {}), [post]: { ...orders } } });

/**
 * Go to the post (LP1): the seed is spent now, so the session that travels on is already
 * on the next race, whether this one is watched to the end or abandoned from the pause box.
 * The pick and its orders become last race's; kept changes for other horses are dropped.
 */
export function goToPost(s: Session, post: number, orders: Orders): { ticket: RaceTicket; session: Session } {
  const ticket: RaceTicket = { raceNumber: s.raceNumber, seed: seedFor(s.firstSeed, s.raceNumber), post, orders: { ...orders } };
  const session: Session = { ...nextRace(s), pickPost: post, lastRace: { post, orders: { ...orders } }, drafts: {} };
  return { ticket, session };
}
