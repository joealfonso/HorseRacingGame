import { describe, expect, it } from 'vitest';
import paletteJson from '../data/palette.json';
import raceDayJson from '../data/raceDay.json';
import slotsJson from '../data/slots.json';
import { checkFieldForRaceDay, validateBetting } from '../data/bettingLoad';
import { validateData } from '../data/validate';
import type { GameData, RUNNING_STYLES } from '../data/schema';
import { drawnDay, playDay, type DayContext, type DrawnRace } from './day';
import { drawDay, pickDay } from './fieldDraw';
import { ctxFrom, game, madeStable, rawWithStable, realCtx } from './testkit';

// FD1 to FD7 (docs/specs/betting-simple.md, "Drawing a field") as properties over many day
// seeds, on the shipped stable and on adversarial stables that ST1 still accepts.

type Style = (typeof RUNNING_STYLES)[number];

/** Every rule a drawn day breaks, as readable lines. Empty when the day is good. */
function dayProblems(ctx: DayContext, day: DrawnRace[]): string[] {
  const out: string[] = [];
  const body = new Map(ctx.stable.map((h) => [h.id, h.silks.body]));
  const starts = new Map<string, number[]>();
  if (day.length !== ctx.races.length) out.push(`${day.length} races, expected ${ctx.races.length}`);
  for (const r of day) {
    const ids = r.horseIds;
    if (ids.length !== 8) out.push(`race ${r.race}: ${ids.length} horses`);
    if (new Set(ids).size !== ids.length) out.push(`race ${r.race}: a horse twice in one field`);
    const posts = r.input.card.horses.map((h) => h.post);
    if ([...posts].sort((a, b) => a - b).join() !== '1,2,3,4,5,6,7,8') out.push(`race ${r.race}: posts ${posts}`);
    const bodies = ids.map((id) => body.get(id));
    if (new Set(bodies).size !== bodies.length) out.push(`race ${r.race}: shared silks body ${bodies}`);
    for (const id of ids) starts.set(id, [...(starts.get(id) ?? []), r.race]);
  }
  for (const [id, races] of starts) {
    if (races.length > 2) out.push(`${id} starts ${races.length} times`);
    if (races.length === 2 && races[1] - races[0] < 3) out.push(`${id} runs in races ${races[0]} and ${races[1]}`);
  }
  for (const h of ctx.stable) if (!starts.has(h.id)) out.push(`${h.id} never starts`);
  // Every horse runs once before any runs twice: no first start comes after a second start.
  const firsts = [...starts.values()].map((r) => r[0]);
  const seconds = [...starts.values()].filter((r) => r.length === 2).map((r) => r[1]);
  if (seconds.length > 0 && Math.max(...firsts) > Math.min(...seconds)) {
    out.push(`a first start in race ${Math.max(...firsts)} after a second start in race ${Math.min(...seconds)}`);
  }
  return out;
}

const seeds = (start: number, count: number, step = 1) => Array.from({ length: count }, (_v, i) => (start + i * step) >>> 0);

/**
 * The draw alone, without building each race's sim input (drawnDay validates eight sim inputs
 * a day, too slow for 10,000 days). A test below proves it gives drawnDay's fields.
 */
function drawOnly(ctx: DayContext, daySeed: number, secondStartTries?: number): DrawnRace[] {
  const fields = drawDay(ctx.stable.map((h) => ({ id: h.id, silksBody: h.silks.body })), daySeed, ctx.rules.draw, secondStartTries);
  return fields.map((byPost, r) => ({
    daySeed,
    race: r + 1,
    name: ctx.races[r].name,
    horseIds: byPost.map((i) => ctx.stable[i].id),
    styles: byPost.map((i) => ctx.stable[i].style),
    raceSeed: 0,
    input: { card: { horses: byPost.map((_i, k) => ({ post: k + 1 })) } } as unknown as GameData,
  }));
}


// Adversarial stables ST1 accepts: the smallest the style rule allows with every color full,
// the largest with every color full (only 10 second starts), and 40 with as many full colors as fit.
const stables: Array<[string, () => DayContext]> = [
  ['the shipped stable', realCtx],
  ['36 horses, 12 colors of 3', () => ctxFrom(rawWithStable(madeStable(36, 3)))],
  ['54 horses, all 18 colors of 3', () => ctxFrom(rawWithStable(madeStable(54, 3)))],
  ['40 horses, 13 colors of 3 and one of 1', () => ctxFrom(rawWithStable(madeStable(40, 3)))],
];

describe.each(stables)('FD1 to FD4 on %s', (_name, make) => {
  const ctx = make();
  const days = seeds(0, 400, 10_738_291).map((s) => drawOnly(ctx, s));
  const built = seeds(11, 15, 10_738_291).map((s) => drawnDay(ctx, s));

  it('FD1: every field has 8 different horses and posts 1 to 8 once each', () => {
    const bad = [...days, ...built].flatMap((d) => dayProblems(ctx, d).filter((p) => /horses|twice in one|posts/.test(p)));
    expect(bad).toEqual([]);
  });

  it('FD1: every field passes validateData with every instruction default, the stable\'s own stats and the day\'s race', () => {
    const stable = new Map(ctx.stable.map((h) => [h.id, h]));
    for (const day of built) {
      for (const r of day) {
        expect(() => validateData(structuredClone({ track: r.input.track, race: r.input.race, card: r.input.card, tuning: r.input.tuning }))).not.toThrow();
        expect(r.input.race).toEqual(ctx.races[r.race - 1]);
        r.input.card.horses.forEach((h, k) => {
          expect(h.instructions).toEqual({ early: 'default', move: 'default', path: 'default' });
          expect(h.id).toBe(r.horseIds[k]);
          expect(h.post).toBe(k + 1);
          const s = stable.get(h.id)!;
          expect(h.stats).toEqual(s.stats);
          expect(h.style).toBe(s.style);
          expect(r.styles[k]).toBe(s.style);
        });
      }
    }
  });

  it('FD2: no horse starts more than twice, and a horse that ran in race r does not run before r + 3', () => {
    const bad = days.flatMap((d) => dayProblems(ctx, d).filter((p) => /starts \d+ times|runs in races/.test(p)));
    expect(bad).toEqual([]);
  });

  it('FD3: no field has two horses on one silks body color', () => {
    const bad = days.flatMap((d) => dayProblems(ctx, d).filter((p) => /silks body/.test(p)));
    expect(bad).toEqual([]);
  });

  it('FD4: every stable horse starts at least once, and every horse runs once before any runs twice', () => {
    const bad = days.flatMap((d) => dayProblems(ctx, d).filter((p) => /never starts|first start/.test(p)));
    expect(bad).toEqual([]);
  });
});

describe('FD3: the drawn fields pass the race-day loader\'s own checks', () => {
  it('FD3: checkFieldForRaceDay accepts every field of 5 days', () => {
    const ctx = realCtx();
    const g = game();
    const data = validateBetting(rawWithStable(ctx.stable as unknown[]), g);
    for (const s of seeds(5, 5, 999_331)) {
      for (const r of drawnDay(ctx, s)) {
        expect(() => checkFieldForRaceDay(data, r.input, structuredClone({ palette: paletteJson, slots: slotsJson, raceDay: raceDayJson }))).not.toThrow();
      }
    }
  });
});

describe('FD5: the fast draw used below is drawnDay\'s draw', () => {
  it.each(stables)('FD5: drawDay gives drawnDay\'s fields on %s', (_name, make) => {
    const ctx = make();
    for (const s of seeds(3, 10, 77_777_777)) {
      expect(drawOnly(ctx, s).map((r) => r.horseIds)).toEqual(drawnDay(ctx, s).map((r) => r.horseIds));
    }
  });
});

// 10,000 day seeds on the shipped stable, as the spec asks; 2,000 on each adversarial stable to keep the suite fast.
const counts: Array<[string, () => DayContext, number]> = stables.map(([n, m], i) => [n, m, i === 0 ? 10_000 : 2_000]);

describe.each(counts)('FD5 and FD6 over many day seeds on %s', (_name, make, DAYS) => {
  const ctx = make();
  const postStyle: Array<Record<Style, number>> = Array.from({ length: 8 }, () => ({ frontRunner: 0, stalker: 0, closer: 0 }));
  const all: Record<Style, number> = { frontRunner: 0, stalker: 0, closer: 0 };
  let failures = 0;
  let broken = 0;
  const firstFailure: string[] = [];
  for (const s of seeds(1_000_000, DAYS, 429_497)) {
    let day: DrawnRace[];
    try {
      day = drawOnly(ctx, s);
    } catch (e) {
      failures++;
      if (firstFailure.length === 0) firstFailure.push(`seed ${s}: ${(e as Error).message}`);
      continue;
    }
    const problems = dayProblems(ctx, day);
    if (problems.length > 0) {
      broken++;
      if (firstFailure.length === 0) firstFailure.push(`seed ${s}: ${problems.join('; ')}`);
    }
    for (const r of day) {
      r.styles.forEach((st, k) => {
        postStyle[k][st]++;
        all[st]++;
      });
    }
  }

  it('FD5: the draw never fails and every day it draws keeps every rule', () => {
    expect(firstFailure).toEqual([]);
    expect(failures).toBe(0);
    expect(broken).toBe(0);
  });

  it('FD6: each style\'s share of each post is within 2 points of its share of all starts', () => {
    const total = all.frontRunner + all.stalker + all.closer;
    for (let k = 0; k < 8; k++) {
      const atPost = postStyle[k].frontRunner + postStyle[k].stalker + postStyle[k].closer;
      for (const st of ['frontRunner', 'stalker', 'closer'] as const) {
        const diff = Math.abs((100 * postStyle[k][st]) / atPost - (100 * all[st]) / total);
        expect(diff, `post ${k + 1} ${st}`).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe('FD7: a day depends only on the day seed and the stable', () => {
  const ctx = realCtx();
  const shape = (d: DrawnRace[]) => d.map((r) => ({ race: r.race, name: r.name, ids: r.horseIds, seed: r.raceSeed }));

  it('FD7: the same day seed gives the same fields and race seeds, whatever was drawn in between', () => {
    const a = shape(drawnDay(ctx, 777));
    for (const s of seeds(0, 5, 31)) drawnDay(ctx, s);
    expect(shape(drawnDay(ctx, 777))).toEqual(a);
    expect(shape(drawnDay(realCtx(), 777))).toEqual(a);
  });

  it('FD7: a different day seed gives a different day', () => {
    const seen = new Set<string>();
    for (const s of seeds(0, 300)) seen.add(JSON.stringify(drawOnly(ctx, s).map((r) => r.horseIds)));
    expect(seen.size).toBe(300);
    // Race 1 alone changes too with the next seed, almost always.
    let same = 0;
    for (const s of seeds(0, 300)) if (drawOnly(ctx, s)[0].horseIds.join() === drawOnly(ctx, s + 1)[0].horseIds.join()) same++;
    expect(same).toBeLessThan(3);
  });

  it('FD7: different bets and passes give the same fields and race seeds', () => {
    const daySeed = 4242;
    const runs = 4;
    const passAll = playDay(ctx, daySeed, Array(8).fill(null), runs);
    const betAll = playDay(ctx, daySeed, Array.from({ length: 8 }, (_v, i) => ({ post: (i % 8) + 1, dollars: 2 })), runs);
    const drawn = shape(drawnDay(ctx, daySeed));
    for (const rec of [passAll, betAll]) {
      expect(rec.races.map((r) => ({ race: r.race, name: r.name, ids: r.horseIds, seed: r.raceSeed }))).toEqual(drawn);
    }
  });
});

describe.each(stables)('FD1 to FD5 on the fallback path (no second-start tries) on %s', (_name, make) => {
  const ctx = make();
  const DAYS = 2_000;

  it('FD5: with 0 tries the draw never fails and every day keeps FD1 to FD4', () => {
    const bad: string[] = [];
    for (const s of seeds(2_000_000, DAYS, 429_497)) {
      let day: DrawnRace[];
      try {
        day = drawOnly(ctx, s, 0);
      } catch (e) {
        bad.push(`seed ${s}: ${(e as Error).message}`);
        continue;
      }
      for (const p of dayProblems(ctx, day)) bad.push(`seed ${s}: ${p}`);
      if (bad.length > 5) break;
    }
    expect(bad).toEqual([]);
  });

  it('FD5: the fallback is a different path: with 0 tries some days differ from the default draw', () => {
    let differ = 0;
    for (const s of seeds(2_000_000, 200, 429_497)) {
      if (JSON.stringify(drawOnly(ctx, s, 0).map((r) => r.horseIds)) !== JSON.stringify(drawOnly(ctx, s).map((r) => r.horseIds))) differ++;
    }
    expect(differ).toBeGreaterThan(0);
  });
});

describe.each(counts)('FD6 second half: the post is independent of the pick order, on %s', (_name, make, DAYS) => {
  const ctx = make();
  const horses = ctx.stable.map((h) => ({ id: h.id, silksBody: h.silks.body }));
  // atPost[k][p]: how often the horse picked (k + 1)-th for its race started from post p + 1.
  const atPost = Array.from({ length: 8 }, () => new Array<number>(8).fill(0));
  const notPermutation: string[] = [];
  for (const s of seeds(3_000_000, DAYS, 429_497)) {
    const picks = pickDay(horses, s, ctx.rules.draw);
    const fields = drawDay(horses, s, ctx.rules.draw);
    picks.forEach((picked, r) => {
      if ([...picked].sort((a, b) => a - b).join() !== [...fields[r]].sort((a, b) => a - b).join() || fields[r].length !== picked.length) {
        if (notPermutation.length < 3) notPermutation.push(`seed ${s} race ${r + 1}: picked ${picked}, posts ${fields[r]}`);
      }
      picked.forEach((horse, k) => {
        const post = fields[r].indexOf(horse);
        if (post >= 0) atPost[k][post]++;
      });
    });
  }

  it('FD6: drawDay\'s field for each race is a permutation of pickDay\'s', () => {
    expect(notPermutation).toEqual([]);
  });

  it('FD6: the horse picked k-th lands in each post within 2 points of one in eight, for every k from 1 to 8', () => {
    for (let k = 0; k < 8; k++) {
      const total = atPost[k].reduce((a, b) => a + b, 0);
      expect(total, `pick ${k + 1}`).toBe(DAYS * ctx.races.length);
      for (let p = 0; p < 8; p++) {
        expect(Math.abs((100 * atPost[k][p]) / total - 12.5), `pick ${k + 1} at post ${p + 1}`).toBeLessThanOrEqual(2);
      }
    }
  });
});
