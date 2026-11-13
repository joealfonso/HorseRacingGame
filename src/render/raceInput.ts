import type { GameData } from '../data/schema';
import { validateData } from '../data/validate';
import type { Orders } from './session';

// The race input for one race (spec 4.9, OR2): a copy of the validated card with your
// horse's instructions replaced and every other horse untouched, passed through
// validateData again before runRace. Here, not in src/sim/, because the sim knows nothing
// of players. Nothing passed in is changed: the card is deep-copied before the edit, and
// validateData builds new objects as it parses.

export function raceInput(game: GameData, post: number, orders: Orders): GameData {
  const card = structuredClone(game.card);
  const mine = card.horses.find((h) => h.post === post);
  if (!mine) throw new Error(`no horse at post ${post} on the card`);
  mine.instructions = { early: orders.early, move: orders.move, path: orders.path };
  return validateData({ track: game.track, race: game.race, card, tuning: game.tuning });
}
