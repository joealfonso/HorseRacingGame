import card from './card.json';
import race from './race.json';
import track from './track.json';
import tuning from './tuning.json';
import { validateData } from './validate';
import type { GameData } from './schema';

// The only place JSON is read. The sim gets the result as an argument.
export const loadData = (): GameData => validateData({ track, race, card, tuning });
