import { describe, expect, it } from 'vitest';
import raceDayJson from '../data/raceDay.json';
import { loadBook } from '../data/bookLoad';
import { drawnDay, programFor } from './day';
import { runEstimate } from './estimate';
import { newsFor } from './news';
import { estimateSeedsOf } from './streams';
import { realCtx } from './testkit';

// NW1: the news changes nothing that was already decided. Race 1's field, race seed, first 5
// estimate seeds and crowd dollars (the estimate run at N = 8) for two day seeds, taken from
// the code as it stood before the `news` stream was added, are the same after it and after the
// news is made.

const GOLDEN: Record<number, { horseIds: string[]; raceSeed: number; seeds: number[]; crowd: number[] }> = {
  12345: {
    horseIds: ['s07', 's01', 's15', 's40', 's22', 's39', 's14', 's23'],
    raceSeed: 910431814,
    seeds: [3000414694, 3280909768, 540530598, 198286029, 696346567],
    crowd: [2629, 14137, 1110, 1234, 1098, 870, 1463, 2459],
  },
  20261113: {
    horseIds: ['s13', 's19', 's12', 's14', 's30', 's07', 's25', 's15'],
    raceSeed: 3760577210,
    seeds: [1666121495, 3189280260, 806607540, 1824220913, 4168456759],
    crowd: [1222, 3347, 5332, 908, 2795, 9330, 1254, 812],
  },
};

describe('NW1: golden, race 1 unchanged by the news', () => {
  const ctx = realCtx();
  const book = loadBook();

  it.each(Object.keys(GOLDEN).map(Number))('NW1: day seed %i', (seed) => {
    const fields = drawnDay(ctx, seed);
    // Make the news first, so any draw it made would already have happened.
    newsFor(book, { daySeed: seed, fields, stable: ctx.stable, races: ctx.races, cardCopy: raceDayJson.copy.card, previous: null });
    const r1 = drawnDay(ctx, seed)[0];
    const program = programFor(ctx, r1, runEstimate(r1.input, seed, 1, 8));
    expect({ horseIds: r1.horseIds, raceSeed: r1.raceSeed, seeds: estimateSeedsOf(seed, 1, 5), crowd: program.crowdDollars }).toEqual(GOLDEN[seed]);
  });
});
