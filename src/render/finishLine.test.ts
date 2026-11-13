import { describe, expect, it } from 'vitest';
import type { RaceResult } from '../sim/result';
import { finishLine } from './format';
import { makeRaceSetup, playerView, raceFrame } from './raceFrame';
import { ORDINALS, art, playbackSecond, race, rd, seeds } from './testkit';

// H3b: from the player's horse's own finish time on, the position line shows its finish
// from result.finish. "Finished 4th", "Finished 1st" for the winner; once the second horse
// has crossed, the winner's line becomes "Won by a neck" style. Spec 10, H3b.

/** The winner's margin in the spec's words, from the second horse's entry in result.finish. */
function wonBy(r: RaceResult): string {
  const label = r.finish[1].margin!.label;
  if (label === 'nose' || label === 'head' || label === 'neck') return `Won by a ${label}`;
  if (label === '1') return 'Won by a length';
  return `Won by ${label}`;
}

describe('H3b: finish on the position line', () => {
  it('H3b: from its own finish time a non-winner reads "Finished 4th" and so on, for every place', () => {
    const seen = new Set<number>();
    for (const seed of seeds(80)) {
      const r = race(seed);
      for (const f of r.finish.slice(1)) {
        for (const dt of [0, 1, 150, 5000]) {
          expect(finishLine(r.finish, f.id, f.time + dt, rd.copy), `seed ${seed} ${f.id} +${dt}`).toBe(`Finished ${ORDINALS[f.place]}`);
        }
        seen.add(f.place);
      }
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });

  it('H3b: the winner reads "Finished 1st" from its finish until the second horse crosses', () => {
    for (const seed of seeds(80)) {
      const r = race(seed);
      const [w, second] = r.finish;
      for (const t of [w.time, w.time + 1, Math.floor((w.time + second.time) / 2), second.time - 1]) {
        if (t >= second.time || t < w.time) continue;
        expect(finishLine(r.finish, w.id, t, rd.copy), `seed ${seed} t ${t}`).toBe('Finished 1st');
      }
    }
  });

  it('H3b: once the second horse has crossed the winner reads "Won by ..." with the second horse\'s margin', () => {
    const words = new Set<string>();
    for (const seed of seeds(300)) {
      const r = race(seed);
      const [w, second] = r.finish;
      const want = wonBy(r);
      for (const t of [second.time, second.time + 1, second.time + 3000]) {
        expect(finishLine(r.finish, w.id, t, rd.copy), `seed ${seed} t ${t}`).toBe(want);
      }
      words.add(want.replace(/\d+( \d\/\d)?|\d\/\d/, 'N'));
    }
    // Over 300 seeds the sample holds nose, head, neck-style and number margins.
    expect(words.size).toBeGreaterThanOrEqual(3);
  });

  it('H3b: the margin forms from the spec: "Won by a neck", "Won by a length", "Won by 2 1/2"', () => {
    const make = (label: string) => [
      { place: 1, id: 'a', post: 1, time: 100, margin: null, beatenLengths: 0 },
      { place: 2, id: 'b', post: 2, time: 120, margin: { lengths: 1, label }, beatenLengths: 1 },
    ];
    const line = (label: string) => finishLine(make(label), 'a', 120, rd.copy);
    expect(line('nose')).toBe('Won by a nose');
    expect(line('head')).toBe('Won by a head');
    expect(line('neck')).toBe('Won by a neck');
    expect(line('1')).toBe('Won by a length');
    expect(line('2 1/2')).toBe('Won by 2 1/2');
    expect(line('3/4')).toBe('Won by 3/4');
    expect(line('1 1/4')).toBe('Won by 1 1/4');
    expect(line('9 3/4')).toBe('Won by 9 3/4');
    expect(line('12')).toBe('Won by 12');
  });

  it('H3b: before its own finish the line never shows a finish', () => {
    for (const seed of seeds(60)) {
      const r = race(seed);
      const setup = makeRaceSetup(r, rd, 0, art);
      for (const f of r.finish) {
        const post = r.inputs.card.horses.find((h) => h.id === f.id)!.post;
        const me = playerView(setup, post);
        for (const d of [-3000, -500, -100, -1]) {
          const t = f.time + d;
          expect(finishLine(r.finish, f.id, t, rd.copy), `seed ${seed} ${f.id} t ${t}`).toBeNull();
          const p = playbackSecond(Math.max(0, t));
          expect(raceFrame(setup, me, p).position, `seed ${seed} ${f.id} t ${t}`).not.toMatch(/Finished|Won by/);
        }
      }
    }
  });

  it('H3b: before its finish the line is still the call line (H3), so the finish replaces it only at the finish', () => {
    const r = race(4);
    const setup = makeRaceSetup(r, rd, 0, art);
    const f = r.finish[3];
    const me = playerView(setup, r.inputs.card.horses.find((h) => h.id === f.id)!.post);
    const before = raceFrame(setup, me, playbackSecond(f.time - 100)).position;
    const after = raceFrame(setup, me, playbackSecond(f.time) + 1e-6).position;
    expect(before).toMatch(/^(\d(st|nd|rd|th), .* back|Leads by .*)$/);
    expect(after).toBe('Finished 4th');
  });

  it('H3b: the frame shows the finish at the finish time and "Won by" after the second horse, for every player', () => {
    for (const seed of seeds(25)) {
      const r = race(seed);
      const setup = makeRaceSetup(r, rd, 0, art);
      for (const h of r.inputs.card.horses) {
        const me = playerView(setup, h.post);
        const f = r.finish.find((x) => x.id === h.id)!;
        const at = (t: number) => raceFrame(setup, me, playbackSecond(t) + 1e-6).position;
        expect(at(f.time)).toBe(f.place === 1 && r.finish[1].time <= f.time ? wonBy(r) : `Finished ${ORDINALS[f.place]}`);
        if (f.place === 1) expect(at(r.finish[1].time)).toBe(wonBy(r));
        expect(at(r.finish[7].time + 500)).toBe(f.place === 1 ? wonBy(r) : `Finished ${ORDINALS[f.place]}`);
      }
    }
  });

  it('H3b: nothing reads the second horse\'s margin before the second horse\'s finish time', () => {
    let checked = 0;
    for (const seed of seeds(80)) {
      const r = race(seed);
      const [w, second] = r.finish;
      if (second.time - w.time < 2) continue;
      const c = structuredClone(r);
      c.finish[1] = { ...c.finish[1], margin: { lengths: 99, label: 'nose' }, beatenLengths: 99 };
      const setupA = makeRaceSetup(r, rd, 0, art);
      const setupB = makeRaceSetup(c, rd, 0, art);
      const post = r.inputs.card.horses.find((h) => h.id === w.id)!.post;
      for (const t of [w.time, w.time + 1, Math.floor((w.time + second.time) / 2), second.time - 1]) {
        if (t >= second.time) continue;
        const a = raceFrame(setupA, playerView(setupA, post), playbackSecond(t) + 1e-6);
        const b = raceFrame(setupB, playerView(setupB, post), playbackSecond(t) + 1e-6);
        expect(b.position).toBe(a.position);
        expect(a.position).toBe('Finished 1st');
        expect(finishLine(c.finish, w.id, t, rd.copy)).toBe('Finished 1st');
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('H3b: every finish line fits 18 characters', () => {
    let longest = 0;
    for (const seed of seeds(500)) {
      const r = race(seed);
      for (const f of r.finish) {
        for (const t of [f.time, r.finish[1].time, r.finish[7].time + 100]) {
          const line = finishLine(r.finish, f.id, t, rd.copy);
          if (line === null) continue;
          expect(line.length, `seed ${seed} ${f.id}: ${line}`).toBeLessThanOrEqual(18);
          longest = Math.max(longest, line.length);
        }
      }
    }
    expect(longest).toBeGreaterThan(10);
    expect('Won by 12 1/2'.length).toBeLessThanOrEqual(18);
  });

  it('H3b: a horse that is not in the result gets no finish line', () => {
    const r = race(1);
    expect(finishLine(r.finish, 'nobody', 1e9, rd.copy)).toBeNull();
  });
});
