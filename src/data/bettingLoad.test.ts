import { describe, expect, it } from 'vitest';
import stableJson from './stable.json';
import paletteJson from './palette.json';
import bettingJson from './betting.json';
import { loadBetting, validateBetting } from './bettingLoad';
import { DataError } from './validate';
import type { GameData } from './schema';
import { game, madeStable, rawBetting, rawWithStable, type Raw } from '../bet/testkit';

// ST1 and ST2 (docs/specs/betting-simple.md, "The stable"): each broken stable is rejected
// with the file, the field and the horse named. Fixtures are the shipped stable with one
// thing broken.

const STABLE = 'src/data/stable.json';

// The 13 Triple Crown winners, listed here from the record, not from the code.
const TRIPLE_CROWN = [
  'Sir Barton', 'Gallant Fox', 'Omaha', 'War Admiral', 'Whirlaway', 'Count Fleet', 'Assault',
  'Citation', 'Secretariat', 'Seattle Slew', 'Affirmed', 'American Pharoah', 'Justify',
];
// Spec: "one of the coats the race-day schema allows (today bay, dark bay or brown, chestnut, black)".
const SPEC_COATS = ['bay', 'dark bay or brown', 'chestnut', 'black'];
const SILKS = [...paletteJson.silksBands.dark, ...paletteJson.silksBands.mid, ...paletteJson.silksBands.light];

function failure(raw: Raw, g: GameData = game()): DataError {
  try {
    validateBetting(raw, g);
  } catch (e) {
    expect(e).toBeInstanceOf(DataError);
    return e as DataError;
  }
  throw new Error('validation passed but should have been rejected');
}

/** Rejected naming the file, the field and (when given) the horse. */
function expectRejected(raw: Raw, path: string, horseName?: string, g?: GameData): DataError {
  const err = failure(raw, g);
  expect(err.file).toBe(STABLE);
  expect(err.message).toContain(STABLE);
  const lines = err.message.split('\n').filter((l) => l.includes(path));
  expect(lines.length, `no line names ${path}:\n${err.message}`).toBeGreaterThan(0);
  if (horseName !== undefined) expect(lines.some((l) => l.includes(horseName)), `no line names "${horseName}":\n${err.message}`).toBe(true);
  return err;
}

const accepted = (raw: Raw) => expect(() => validateBetting(raw, game())).not.toThrow();

describe('ST2: the shipped stable passes', () => {
  it('ST2: loadBetting accepts the shipped files', () => {
    expect(() => loadBetting(game())).not.toThrow();
    expect(loadBetting(game()).stable).toHaveLength(40);
  });

  const horses = stableJson.horses;

  it('ST2: names are 18 characters or fewer, unique ignoring case, and no Triple Crown winner', () => {
    for (const h of horses) expect(h.name.length, h.name).toBeLessThanOrEqual(18);
    const folded = horses.map((h) => h.name.toLowerCase());
    expect(new Set(folded).size).toBe(horses.length);
    const banned = new Set(TRIPLE_CROWN.map((n) => n.toLowerCase()));
    for (const n of folded) expect(banned.has(n), n).toBe(false);
  });

  it('ST2: ids are unique', () => {
    expect(new Set(horses.map((h) => h.id)).size).toBe(horses.length);
  });

  it('ST2: jockeys are 22 characters or fewer, one per horse, unique', () => {
    for (const h of horses) expect(h.jockey.length, h.jockey).toBeLessThanOrEqual(22);
    expect(new Set(horses.map((h) => h.jockey.toLowerCase())).size).toBe(horses.length);
  });

  it('ST2: blurbs are 28 characters or fewer and printable ASCII', () => {
    for (const h of horses) {
      expect(h.blurb.length, h.blurb).toBeLessThanOrEqual(28);
      expect(h.blurb, h.blurb).toMatch(/^[\x20-\x7E]+$/);
    }
  });

  it('ST2: coats are allowed, silks come from the 18 colors, at most 3 horses per body color', () => {
    expect(SILKS).toHaveLength(18);
    const perBody = new Map<string, number>();
    for (const h of horses) {
      expect(SPEC_COATS).toContain(h.coat);
      expect(SILKS).toContain(h.silks.body);
      expect(SILKS).toContain(h.silks.cap);
      perBody.set(h.silks.body, (perBody.get(h.silks.body) ?? 0) + 1);
    }
    for (const [body, n] of perBody) expect(n, body).toBeLessThanOrEqual(3);
  });

  it('ST2: at least 12 of each style', () => {
    for (const style of ['frontRunner', 'stalker', 'closer']) {
      expect(horses.filter((h) => h.style === style).length, style).toBeGreaterThanOrEqual(12);
    }
  });

  it('ST2: stats are whole numbers from 1 to 99', () => {
    for (const h of horses) {
      for (const v of Object.values(h.stats)) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(99);
      }
    }
  });

  it('ST2: big enough for the draw: at least 8 x 3 horses and 2 starts each cover 8 races of 8', () => {
    expect(horses.length).toBeGreaterThanOrEqual(24);
    expect(horses.length * 2).toBeGreaterThanOrEqual(64);
  });
});

describe('ST1: the loader rejects each broken rule, naming the file, the field and the horse', () => {
  const real = () => rawBetting();
  const nameOf = (raw: Raw, i: number): string => raw.stable.horses[i].name;

  it('ST1: a duplicate id is refused', () => {
    const raw = real();
    raw.stable.horses[5].id = raw.stable.horses[2].id;
    expectRejected(raw, 'horses[5].id', nameOf(raw, 5));
  });

  it('ST1: a duplicate name is refused', () => {
    const raw = real();
    raw.stable.horses[7].name = raw.stable.horses[3].name;
    expectRejected(raw, 'horses[7].name', nameOf(raw, 7));
  });

  it('ST1: a duplicate name differing only in case is refused', () => {
    const raw = real();
    raw.stable.horses[7].name = raw.stable.horses[3].name.toUpperCase();
    expectRejected(raw, 'horses[7].name', nameOf(raw, 7));
  });

  it('ST1: a duplicate jockey is refused', () => {
    const raw = real();
    raw.stable.horses[9].jockey = raw.stable.horses[1].jockey;
    expectRejected(raw, 'horses[9].jockey', nameOf(raw, 9));
  });

  it('ST1: a 19 character name is refused, naming the horse', () => {
    const raw = real();
    raw.stable.horses[4].name = 'Nineteen Chars Long';
    expect(raw.stable.horses[4].name).toHaveLength(19);
    expectRejected(raw, 'horses[4].name', 'Nineteen Chars Long');
  });

  it('ST1: an 18 character name is accepted', () => {
    const raw = real();
    raw.stable.horses[4].name = 'Eighteen Chars Lng';
    expect(raw.stable.horses[4].name).toHaveLength(18);
    accepted(raw);
  });

  it.each(TRIPLE_CROWN)('ST1: the Triple Crown winner "%s" is refused as a name', (winner) => {
    const raw = real();
    raw.stable.horses[6].name = winner;
    expectRejected(raw, 'horses[6].name', winner);
  });

  it('ST1: a Triple Crown winner in another case is refused', () => {
    const raw = real();
    raw.stable.horses[6].name = 'SEATTLE slew';
    expectRejected(raw, 'horses[6].name', 'SEATTLE slew');
  });

  it.each([
    ['speed', 0], ['stamina', 100], ['kick', -5], ['speed', 50.5],
  ] as const)('ST1: a %s of %s is refused', (stat, value) => {
    const raw = real();
    raw.stable.horses[8].stats[stat] = value;
    expectRejected(raw, `horses[8].stats.${stat}`, nameOf(raw, 8));
  });

  it('ST1: stats of exactly 1 and 99 are accepted', () => {
    const raw = real();
    raw.stable.horses[8].stats.speed = 1;
    raw.stable.horses[8].stats.kick = 99;
    accepted(raw);
  });

  it('ST1: an unknown style is refused', () => {
    const raw = real();
    raw.stable.horses[10].style = 'deepCloser';
    expectRejected(raw, 'horses[10].style', nameOf(raw, 10));
  });

  it('ST1: an unknown coat is refused', () => {
    const raw = real();
    raw.stable.horses[11].coat = 'palomino';
    expectRejected(raw, 'horses[11].coat', nameOf(raw, 11));
  });

  it('ST1: an unknown silks body color is refused', () => {
    const raw = real();
    raw.stable.horses[12].silks.body = 'Chartreuse';
    expectRejected(raw, 'horses[12].silks.body', nameOf(raw, 12));
  });

  it('ST1: an unknown silks cap color is refused', () => {
    const raw = real();
    raw.stable.horses[12].silks.cap = 'Chartreuse';
    expectRejected(raw, 'horses[12].silks.cap', nameOf(raw, 12));
  });

  it('ST1: a 29 character blurb is refused, and 28 is accepted', () => {
    const raw = real();
    raw.stable.horses[13].blurb = 'x'.repeat(29);
    expectRejected(raw, 'horses[13].blurb', nameOf(raw, 13));
    const ok = real();
    ok.stable.horses[13].blurb = 'x'.repeat(28);
    accepted(ok);
  });

  it.each([['an accented letter', 'Likes the café.'], ['a tab', 'Likes\thay.'], ['an emoji', 'Likes hay \u{1F40E}'], ['a curly quote', 'Won’t wait.']])(
    'ST1: a blurb with %s is not printable ASCII and is refused',
    (_what, blurb) => {
      const raw = real();
      raw.stable.horses[14].blurb = blurb;
      expectRejected(raw, 'horses[14].blurb', nameOf(raw, 14));
    },
  );

  it('ST1: a 23 character jockey is refused, and 22 is accepted', () => {
    const raw = real();
    raw.stable.horses[15].jockey = 'J'.repeat(23);
    expectRejected(raw, 'horses[15].jockey', nameOf(raw, 15));
    const ok = real();
    ok.stable.horses[15].jockey = 'Twentytwo Char Jockeys';
    expect(ok.stable.horses[15].jockey).toHaveLength(22);
    accepted(ok);
  });

  it('ST1: a fourth horse on one silks body color is refused', () => {
    const raw = real();
    const horses = raw.stable.horses as Array<{ name: string; silks: { body: string } }>;
    const counts = new Map<string, number>();
    for (const h of horses) counts.set(h.silks.body, (counts.get(h.silks.body) ?? 0) + 1);
    const full = [...counts.entries()].find(([, n]) => n === 3)![0];
    const moved = horses.findIndex((h) => h.silks.body !== full);
    horses[moved].silks.body = full;
    const err = failure(raw);
    expect(err.file).toBe(STABLE);
    expect(err.message).toMatch(/horses\[\d+\]\.silks\.body/);
    expect(err.message).toContain(full);
    expect(err.message).toContain(horses[moved].name);
  });

  it('ST1: fewer than 12 of a style is refused', () => {
    const raw = real();
    const horses = raw.stable.horses as Array<{ style: string }>;
    const closers = horses.filter((h) => h.style === 'closer');
    // Leave exactly 11 closers.
    for (const h of closers.slice(0, closers.length - 11)) h.style = 'stalker';
    expect(horses.filter((h) => h.style === 'closer')).toHaveLength(11);
    const err = expectRejected(raw, 'horses');
    expect(err.message).toContain('closer');
  });

  it('ST1: exactly 12 of each style is accepted (a 36 horse stable)', () => {
    accepted(rawWithStable(madeStable(36, 3)));
  });

  it('ST1: a stable that 2 starts each cannot cover 8 races of 8 is refused', () => {
    // 36 horses (12 of each style, so the style rule holds) cannot fill 10 races of 8 with 2 starts each.
    const raw = rawWithStable(madeStable(36, 3));
    const extra = [9, 10].map((n) => ({ ...raw.day.races[0], name: `Extra Race ${n}` }));
    raw.day.races.push(...extra);
    expect(raw.day.races).toHaveLength(10);
    const err = expectRejected(raw, 'horses');
    expect(err.message).toMatch(/draw/);
  });

  it('ST1: a stable under 8 x 3 horses for the rerun gap is refused', () => {
    // A 6 race rerun gap needs 8 x 6 = 48 horses; the stable has 40.
    const raw = real();
    raw.betting.field.racesBeforeRerun.value = 6;
    const err = expectRejected(raw, 'horses');
    expect(err.message).toMatch(/draw/);
  });

  it('ST1: a stable with one start each cannot cover the day and is refused', () => {
    const raw = real();
    raw.betting.field.maxStartsPerDay.value = 1;
    const err = expectRejected(raw, 'horses');
    expect(err.message).toMatch(/draw/);
  });
});

describe('B0 result: the shipped betting values are the spec\'s', () => {
  const b = bettingJson;

  it('B0: money, field and estimate values', () => {
    expect(b.bankroll.startDollars.value).toBe(100);
    expect(b.bets.minDollars.value).toBe(2);
    expect(b.bets.amountsDollars.value).toEqual([2, 5, 10, 20, 50, 100]);
    expect(b.bets.capBasisPoints.value).toBe(2500);
    expect(b.field.size.value).toBe(8);
    expect(b.field.maxStartsPerDay.value).toBe(2);
    expect(b.field.racesBeforeRerun.value).toBe(3);
    expect(b.estimate.runsPerRace.value).toBe(1000);
  });

  it('B0: pool and crowd values', () => {
    expect(b.pool.crowdDollars.value).toBe(25000);
    expect(b.pool.takeoutBasisPoints.value).toBe(1700);
    expect(b.pool.breakageCents.value).toBe(10);
    expect(b.pool.minPayoffPerDollarCents.value).toBe(105);
    expect(b.crowd.noise.value).toBe(0.6);
    expect(b.crowd.flatten.value).toBe(0.025);
    expect(b.crowd.styleLean.value).toEqual({ frontRunner: 0.1, stalker: 0, closer: -0.1 });
  });

  it('B0: the tote steps are the spec\'s list, 1-9 to 99-1', () => {
    const head = ['1-9', '1-5', '2-5', '1-2', '3-5', '4-5', '1-1', '6-5', '7-5', '3-2', '8-5', '9-5', '2-1', '5-2', '3-1', '7-2', '4-1', '9-2', '5-1', '6-1', '7-1', '8-1', '9-1', '10-1'];
    const tail = Array.from({ length: 89 }, (_v, i) => `${i + 11}-1`);
    expect(b.odds.steps.value.map((s) => s.label)).toEqual([...head, ...tail]);
    for (const s of b.odds.steps.value) expect(s.label).toBe(`${s.odds[0]}-${s.odds[1]}`);
  });

  it('B0: the day is eight races of 10 furlongs on fast dirt, neutral, each with its own name', () => {
    const races = rawBetting().day.races as Array<{ name: string; distanceFurlongs: number; surface: string; going: string; trackBias: { lane: string; style: string } }>;
    expect(races).toHaveLength(8);
    expect(new Set(races.map((r) => r.name)).size).toBe(8);
    for (const r of races) {
      expect(r.distanceFurlongs).toBe(10);
      expect(r.surface).toBe('dirt');
      expect(r.going).toBe('fast');
      expect(r.trackBias).toEqual({ lane: 'neutral', style: 'neutral' });
    }
  });
});

describe('ST1 (amended): horse problems are reported against stable.json, whichever horse', () => {
  const real = () => rawBetting();
  const count = (text: string, part: string) => text.split('\n').filter((l) => l.includes(part)).length;

  it('ST1: a duplicate id and a different-case duplicate name between horses[0] and horses[1] are each reported once, against stable.json, naming the horse', () => {
    const raw = real();
    const name = raw.stable.horses[0].name as string;
    raw.stable.horses[1].id = raw.stable.horses[0].id;
    raw.stable.horses[1].name = name.toUpperCase();
    const err = failure(raw);
    expect(err.file).toBe(STABLE);
    expect(count(err.message, 'horses[1].id')).toBe(1);
    expect(count(err.message, 'horses[1].name')).toBe(1);
    for (const line of err.message.split('\n').filter((l) => l.includes('horses[1]'))) expect(line).toContain(name.toUpperCase());
    expect(err.message).not.toContain('day.json');
    expect(err.message).not.toContain('card.json');
  });

  it('ST1: a stable of one horse is reported against stable.json', () => {
    const raw = real();
    raw.stable.horses = raw.stable.horses.slice(0, 1);
    const err = failure(raw);
    expect(err.file).toBe(STABLE);
    expect(err.message).not.toContain('day.json');
    expect(err.message).not.toContain('card.json');
  });

  const bad: Array<[string, string]> = [['a tab', '\t'], ['a zero-width space', '\u200B'], ['an accented letter', '\u00e9']];

  it.each(bad)('ST1: a name with %s is refused, naming the horse', (_what, ch) => {
    const raw = real();
    const name = `Hold My ${ch}Oat`;
    raw.stable.horses[16].name = name;
    expectRejected(raw, 'horses[16].name', name);
  });

  it.each(bad)('ST1: a jockey with %s is refused, naming the horse', (_what, ch) => {
    const raw = real();
    raw.stable.horses[17].jockey = `Pat ${ch}Rider`;
    expectRejected(raw, 'horses[17].jockey', raw.stable.horses[17].name);
  });

  it('ST1: a jockey that differs from another only by case is refused', () => {
    const raw = real();
    raw.stable.horses[18].jockey = (raw.stable.horses[2].jockey as string).toUpperCase();
    expectRejected(raw, 'horses[18].jockey', raw.stable.horses[18].name);
  });

  it('ST1: a jockey that differs from another only by repeated spaces is refused', () => {
    const raw = real();
    const j = raw.stable.horses[2].jockey as string;
    expect(j).toContain(' ');
    raw.stable.horses[18].jockey = j.replace(' ', '   ');
    expectRejected(raw, 'horses[18].jockey', raw.stable.horses[18].name);
  });

  it('ST1: a name that differs from another only by repeated spaces is refused', () => {
    const raw = real();
    const n = raw.stable.horses[2].name as string;
    expect(n).toContain(' ');
    raw.stable.horses[19].name = n.replace(' ', '  ');
    expectRejected(raw, 'horses[19].name', raw.stable.horses[19].name);
  });

  it('ST1: a stat outside a tightened tuning.statRange is refused at load, for a horse beyond the first two', () => {
    // The shipped stable's stats run from 51 to 94.
    const g = game();
    g.tuning.statRange.value = { min: 51, max: 94 };
    expect(() => validateBetting(real(), g)).not.toThrow();
    const high = real();
    high.stable.horses[20].stats.speed = 95;
    expectRejected(high, 'horses[20].stats.speed', high.stable.horses[20].name, g);
    const low = real();
    low.stable.horses[25].stats.kick = 50;
    const err = expectRejected(low, 'horses[25].stats.kick', low.stable.horses[25].name, g);
    expect(err.message).not.toContain('card.json');
  });
});
