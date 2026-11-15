// Helpers shared by the betting tests (docs/specs/betting-simple.md). Test support only:
// nothing in the game imports this file. Kept free of anything the sim lint bans.
import bettingJson from '../data/betting.json';
import dayJson from '../data/day.json';
import paletteJson from '../data/palette.json';
import stableJson from '../data/stable.json';
import { loadBetting, validateBetting } from '../data/bettingLoad';
import { loadData } from '../data/load';
import { RUNNING_STYLES, type GameData } from '../data/schema';
import { createStream } from '../sim/rng';
import { dayContext, type DayContext } from './day';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Raw = { stable: any; day: any; betting: any; palette: any };

/** Fresh, editable copies of the shipped betting files. */
export const rawBetting = (): Raw => structuredClone({ stable: stableJson, day: dayJson, betting: bettingJson, palette: paletteJson });

export const game = (): GameData => structuredClone(loadData());

/** The day context from the shipped files. */
export const realCtx = (): DayContext => {
  const g = game();
  return dayContext(loadBetting(g), g);
};

/** The day context from raw files (validated, so a fixture must pass ST1). */
export const ctxFrom = (raw: Raw): DayContext => {
  const g = game();
  return dayContext(validateBetting(raw, g), g);
};

/** The 18 silks colors, from the palette's three bands. */
export const SILKS_COLORS: string[] = [...paletteJson.silksBands.dark, ...paletteJson.silksBands.mid, ...paletteJson.silksBands.light];

/**
 * A stable of `size` made-up horses that passes ST1, with `perColor` horses on each silks body
 * color in turn (the last color may hold fewer). Styles cycle, so each style gets size / 3.
 * Stats are taken from the shipped stable in turn so the sim gets realistic horses.
 */
export function madeStable(size: number, perColor: number) {
  const real = stableJson.horses;
  return Array.from({ length: size }, (_v, i) => ({
    id: `t${String(i + 1).padStart(2, '0')}`,
    name: `Test Horse ${i + 1}`,
    jockey: `Test Rider ${i + 1}`,
    style: RUNNING_STYLES[i % 3],
    stats: { ...real[i % real.length].stats },
    coat: 'bay',
    silks: { body: SILKS_COLORS[Math.floor(i / perColor)], cap: 'Ink' },
    blurb: 'Fond of carrots.',
  }));
}

/** Raw files with the stable replaced. */
export function rawWithStable(horses: unknown[]): Raw {
  const raw = rawBetting();
  raw.stable = { horses };
  return raw;
}

/** A deterministic test generator (not a game stream): whole numbers from min to max. */
export function testInts(seed: number) {
  const s = createStream(seed, 'betTestOnly');
  return (min: number, max: number) => s.int(min, max);
}
