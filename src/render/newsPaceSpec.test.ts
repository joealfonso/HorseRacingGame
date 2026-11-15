import { describe, expect, it } from 'vitest';
import raceDayJson from '../data/raceDay.json';
import stableJson from '../data/stable.json';
import { racePageState } from '../bet/bookPage';
import { drawnDay, type DrawnRace } from '../bet/day';
import { loadBook } from '../data/bookLoad';
import { ctx, drawnOf, lookFor, rd } from './betKit';
import { racePageScreen } from './bookScreen';

// The race page's header line 4 (docs/specs/book-useful.md section 6, NU10), written from the spec:
// while the bias is fair, "{Surface}, {going}, {k} up front" with the field's front-runner count (0 is
// "none up front"); with any other bias, line 4 is as today; at most 30 characters; Ink; read out with
// the race line. The count is recomputed here from stable.json, not from the code's helper.

const book = loadBook();
const L4_Y = 34; // header line 4: cell top 4 + 3 * 10
const styleOf = new Map(stableJson.horses.map((h) => [h.id, h.style]));

const pageOf = (drawn: DrawnRace) => racePageState(book, { page: drawn.race, nextRace: drawn.race, fieldSize: drawn.horseIds.length, records: [], posted: new Map() });
const screenOf = (drawn: DrawnRace) => racePageScreen({ book, ctx, rd, look: lookFor(drawn), drawn, page: pageOf(drawn), focus: 0 });
const line4 = (drawn: DrawnRace) => screenOf(drawn).texts.filter((t) => t.y === L4_Y);

/** A copy of a real race with exactly `k` front-runners (the first k posts), in every place a style is read. */
function withFronts(drawn: DrawnRace, k: number): DrawnRace {
  const styles = drawn.styles.map((_s, i) => (i < k ? 'frontRunner' : 'closer')) as DrawnRace['styles'];
  const horses = [...drawn.input.card.horses].sort((a, b) => a.post - b.post).map((h, i) => ({ ...h, style: styles[i] }));
  return { ...drawn, styles, input: { ...drawn.input, card: { ...drawn.input.card, horses } } };
}
const withRace = (drawn: DrawnRace, over: Record<string, unknown>): DrawnRace => ({ ...drawn, input: { ...drawn.input, race: { ...drawn.input.race, ...over } } });

describe('NU10: header line 4 names the pace while the bias is fair', () => {
  const base = drawnOf()[2];

  it.each([[0, 'none up front'], [1, '1 up front'], [2, '2 up front'], [3, '3 up front'], [4, '4 up front'], [5, '5 up front'], [6, '6 up front'], [7, '7 up front']])(
    '%i front-runners read "Dirt, fast, %s"',
    (k, phrase) => {
      const t = line4(withFronts(base, k));
      expect(t).toHaveLength(1);
      expect(t[0]).toMatchObject({ text: `Dirt, fast, ${phrase}`, x: 8, color: 'Ink' });
    },
  );

  it('eight front-runners (a field of only speed) still reads a count, not a hole', () => {
    expect(line4(withFronts(base, 8))[0].text).toMatch(/^Dirt, fast, \S+ up front$/);
  });

  it('"playing fair" is not printed on a fair race any more', () => {
    for (let k = 0; k <= 7; k++) expect(screenOf(withFronts(base, k)).texts.some((t) => t.text.includes('playing fair'))).toBe(false);
  });

  it('every real race of many real days: the phrase is the true count of front-runners in that field, from stable.json', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      for (const drawn of drawnDay(ctx, seed)) {
        const fronts = drawn.horseIds.filter((id) => styleOf.get(id) === 'frontRunner').length;
        seen.add(fronts);
        expect(line4(drawn)[0].text, `seed ${seed} race ${drawn.race}`).toBe(`Dirt, fast, ${fronts === 0 ? 'none' : fronts} up front`);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(4); // a spread of counts, so the check had something to tell apart
  });

  it('the longest line fits 30 characters: a sloppy track with no front-runner is 27', () => {
    for (const going of ['sloppy', 'muddy', 'yielding']) {
      const t = line4(withRace(withFronts(base, 0), { going }))[0].text;
      expect(t.length, t).toBeLessThanOrEqual(30);
    }
    expect(line4(withRace(withFronts(base, 0), { going: 'sloppy' }))[0].text).toBe('Dirt, sloppy, none up front');
  });

  it('the surface and going come from the race: turf and firm', () => {
    expect(line4(withRace(withFronts(base, 3), { surface: 'turf', going: 'firm' }))[0].text).toBe('Turf, firm, 3 up front');
  });

  it('with a real bias the line is as it was: the bias phrase, and no pace phrase', () => {
    const bias = raceDayJson.copy.program.bias;
    for (const [trackBias, phrase] of [
      [{ lane: 'inside', style: 'neutral' }, bias.inside],
      [{ lane: 'outside', style: 'neutral' }, bias.outside],
      [{ lane: 'neutral', style: 'speed' }, bias.speed],
      [{ lane: 'neutral', style: 'closers' }, bias.closers],
    ] as const) {
      for (const k of [0, 3]) {
        const t = line4(withRace(withFronts(base, k), { trackBias }));
        expect(t).toHaveLength(1);
        expect(t[0].text).toBe(`Dirt, fast, ${phrase}`);
        expect(t[0].text).not.toContain('up front');
      }
    }
  });

  it('the phrase is read out with the race line, and nothing on the page prints an estimate or a price for it', () => {
    const sc = screenOf(withFronts(base, 3));
    expect(sc.aria).toContain('Dirt, fast, 3 up front');
    expect(sc.aria).not.toMatch(/%|estimate|chance/i);
  });

  it('nothing else on the page moves: header lines 1 to 3, the entries and the odds are what they were with another count', () => {
    const a = screenOf(withFronts(base, 0));
    const b = screenOf(withFronts(base, 5));
    const rest = (s: typeof a) => s.texts.filter((t) => t.y !== L4_Y && t.y < 56);
    expect(rest(a)).toEqual(rest(b));
  });
});
