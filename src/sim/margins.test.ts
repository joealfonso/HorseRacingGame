import { describe, expect, it } from 'vitest';
import { marginLabel } from './margins';
import { runRace } from './runRace';
import { distanceAt, seedRange, shipped, withTuning } from './testkit';

// O4 (margins, labels, beaten lengths) and O5 (photo finish).
const data = shipped();
const bounds = data.tuning.marginLabelBounds.value;
const threshold = data.tuning.photoFinishThresholdLengths.value;
const SEEDS = seedRange(0, 500);
const results = SEEDS.map((s) => runRace(data, s));
const EPS = 1e-9;

describe('O4: the label table, each boundary on both sides (the function itself)', () => {
  const label = (x: number) => marginLabel(x, bounds);

  it('0 and anything under the nose bound is a nose', () => {
    expect(label(0)).toBe('nose');
    expect(label(bounds.noseBelow / 2)).toBe('nose');
    expect(label(bounds.noseBelow - EPS)).toBe('nose');
  });

  it('exactly the nose bound is a head, and so is anything up to the head bound', () => {
    expect(label(bounds.noseBelow)).toBe('head');
    expect(label((bounds.noseBelow + bounds.headBelow) / 2)).toBe('head');
    expect(label(bounds.headBelow - EPS)).toBe('head');
  });

  it('exactly the head bound is a neck, and so is anything up to the neck bound', () => {
    expect(label(bounds.headBelow)).toBe('neck');
    expect(label((bounds.headBelow + bounds.neckBelow) / 2)).toBe('neck');
    expect(label(bounds.neckBelow - EPS)).toBe('neck');
  });

  it('exactly the neck bound is no longer a neck, it is the nearest quarter (1/4 or 1/2)', () => {
    // 0.375 is exactly between 1/4 and 1/2, so the spec does not say which. Both are fine.
    expect(['1/4', '1/2']).toContain(label(bounds.neckBelow));
    expect(label(bounds.neckBelow + 0.01)).toBe('1/2');
  });

  it('between the neck bound and the whole-length bound it rounds to the nearest quarter', () => {
    const cases: [number, string][] = [
      [0.4, '1/2'], [0.6, '1/2'], [0.7, '3/4'], [0.9, '1'], [1, '1'], [1.1, '1'], [1.2, '1 1/4'],
      [1.45, '1 1/2'], [1.8, '1 3/4'], [2.1, '2'], [3.3, '3 1/4'], [5.55, '5 1/2'], [9.8, '9 3/4'],
    ];
    for (const [x, text] of cases) expect(label(x), `${x} lengths`).toBe(text);
  });

  it('from the whole-length bound up it rounds to a whole number of lengths, not quarters', () => {
    const w = bounds.wholeLengthsFrom;
    expect(label(w - 0.2)).toBe('9 3/4'); // below the bound the quarters still show
    expect(label(w)).toBe(String(w));
    expect(label(w + 0.2)).toBe(String(w)); // would be "10 1/4" if quarters still applied
    expect(label(w + 0.6)).toBe(String(w + 1));
    expect(label(w + 7.4)).toBe(String(w + 7));
    expect(label(25.9)).toBe('26');
  });

  it('the labels follow the bounds in tuning, not fixed numbers', () => {
    const moved = { noseBelow: 0.05, headBelow: 0.3, neckBelow: 0.5, wholeLengthsFrom: 6 };
    expect(marginLabel(0.049, moved)).toBe('nose');
    expect(marginLabel(0.05, moved)).toBe('head');
    expect(marginLabel(0.29, moved)).toBe('head');
    expect(marginLabel(0.3, moved)).toBe('neck');
    expect(marginLabel(0.49, moved)).toBe('neck');
    expect(marginLabel(0.52, moved)).toBe('1/2');
    expect(marginLabel(5.9, moved)).toBe('6');
    expect(marginLabel(6.2, moved)).toBe('6');
  });

  it('the shipped bounds are the table in the spec', () => {
    expect(bounds).toEqual({ noseBelow: 0.1, headBelow: 0.2, neckBelow: 0.375, wholeLengthsFrom: 10 });
  });
});

describe('O4: margins in the finish list', () => {
  it('the winner has no margin and 0 beaten lengths', () => {
    for (const r of results) {
      expect(r.finish[0].margin).toBeNull();
      expect(r.finish[0].beatenLengths).toBe(0);
    }
  });

  it('every other horse has a margin of whole thousandths, not below 0, and a label', () => {
    for (const r of results) {
      for (const f of r.finish.slice(1)) {
        expect(f.margin).not.toBeNull();
        expect(Number.isInteger(f.margin!.lengths)).toBe(true);
        expect(f.margin!.lengths).toBeGreaterThanOrEqual(0);
        expect(typeof f.margin!.label).toBe('string');
        expect(f.margin!.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('each label is the table applied to the margin that is shown', () => {
    for (const r of results) {
      for (const f of r.finish.slice(1)) {
        expect(f.margin!.label, `seed ${r.seed} place ${f.place} margin ${f.margin!.lengths}`).toBe(marginLabel(f.margin!.lengths / 1000, bounds));
      }
    }
  });

  it('the 500 seeds really do reach every row of the table (so the check above is not empty)', () => {
    const seen = new Set<string>();
    for (const r of results) {
      for (const f of r.finish.slice(1)) {
        const x = f.margin!.lengths / 1000;
        seen.add(x < bounds.noseBelow ? 'nose' : x < bounds.headBelow ? 'head' : x < bounds.neckBelow ? 'neck' : x < bounds.wholeLengthsFrom ? 'quarters' : 'whole');
      }
    }
    expect([...seen].sort()).toEqual(['head', 'neck', 'nose', 'quarters', 'whole']);
  });

  it('beaten lengths equal the sum of the margins above, within rounding', () => {
    for (const r of results) {
      let sum = 0;
      r.finish.slice(1).forEach((f, i) => {
        sum += f.margin!.lengths;
        // each margin is rounded to a thousandth, so the sum may be off by half a thousandth per margin
        expect(Math.abs(f.beatenLengths - sum), `seed ${r.seed} place ${f.place}`).toBeLessThanOrEqual(0.5 * (i + 1) + 0.001);
      });
    }
  });

  it('beaten lengths never decrease down the order', () => {
    for (const r of results) {
      for (let i = 1; i < r.finish.length; i++) expect(r.finish[i].beatenLengths).toBeGreaterThanOrEqual(r.finish[i - 1].beatenLengths);
    }
  });

  it('a horse with the same time as the one ahead has a margin of 0 or very near it', () => {
    // Same hundredth, so at most a hundredth of a second apart: about 0.08 lengths at racing speed.
    for (const r of results) {
      for (let i = 1; i < r.finish.length; i++) {
        if (r.finish[i].time === r.finish[i - 1].time) expect(r.finish[i].margin!.lengths).toBeLessThan(150);
      }
    }
  });

  it('a margin is how far the trailing horse is from the wire when the horse ahead reaches it (checked on the replay)', () => {
    // Time is rounded to a hundredth (about 0.04 of a length) and the replay is sampled, so allow 0.1 of a length.
    const wire = data.race.distanceFurlongs * 66000;
    const lengthUnits = data.tuning.horseLengthFeet.value * 100;
    const step = results[0].replay.step;
    for (const r of results.slice(0, 100)) {
      for (let i = 1; i < r.finish.length; i++) {
        const ahead = r.finish[i - 1];
        const behind = r.replay.horses.find((h) => h.id === r.finish[i].id)!;
        const gap = (wire - distanceAt(behind, step, ahead.time)) / lengthUnits;
        expect(Math.abs(gap - r.finish[i].margin!.lengths / 1000), `seed ${r.seed} place ${i + 1}`).toBeLessThan(0.1);
      }
    }
  });
});

describe('O5: photo finish', () => {
  it('is true exactly when the margin of second place is under the threshold', () => {
    for (const r of results) {
      expect(r.photoFinish, `seed ${r.seed}`).toBe(r.finish[1].margin!.lengths < threshold * 1000);
    }
  });

  it('both answers happen in the 500 seeds', () => {
    const n = results.filter((r) => r.photoFinish).length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(results.length);
  });

  // The same seed with the threshold moved onto, just over and just under the margin that
  // race really has. Nothing else in the race depends on the threshold, so the margin is the same.
  describe('at the threshold (the race is the same, only the threshold moves onto its margin)', () => {
    const run = (seed: number, thresholdLengths: number) =>
      runRace(withTuning(data, (t) => { t.photoFinishThresholdLengths.value = thresholdLengths; }), seed);
    const seeds = seedRange(0, 60);

    it.each(seeds)('seed %i', (seed) => {
      const m = results[seed].finish[1].margin!.lengths;
      const same = run(seed, m / 1000);
      expect(same.finish[1].margin!.lengths).toBe(m); // the margin did not move
      expect(same.photoFinish, `threshold exactly ${m / 1000}`).toBe(false);
      expect(run(seed, (m + 1) / 1000).photoFinish, 'a thousandth above').toBe(true);
      if (m >= 1) expect(run(seed, (m - 1) / 1000).photoFinish, 'a thousandth below').toBe(false);
    });
  });
});
