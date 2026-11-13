import { describe, expect, it } from 'vitest';
import { runRace } from '../sim/runRace';
import type { RaceResult } from '../sim/result';
import { FAST_CALL_CHARS, announcerAt, callForBar, callSchedule, type ScheduledCall } from './announcer';
import { game, playbackSecond, race, raceDistanceOf, rd, reachTime, seeds } from './testkit';

// The announcer, spec 4.3 and criteria AN1 to AN4. The key table is the spec's table for
// the shipped 10 furlong course; the lines come from the data, never from the code.

const calls = rd.copy.calls;
const nameOf = (r: RaceResult, id: string) => r.inputs.card.horses.find((h) => h.id === id)!.name;

/** A half mile time in words, written from the spec's two examples (4612 is 46.12, 7020 is 1:10.20). */
function half(h: number): string {
  const m = Math.floor(h / 6000);
  const s = Math.floor((h % 6000) / 100);
  const c = String(h % 100).padStart(2, '0');
  return m === 0 ? `${s}.${c}` : `${m}:${String(s).padStart(2, '0')}.${c}`;
}

const POLE_KEYS: Record<number, string> = {
  9: 'earlyLeader', // 1 1/8 pole
  8: 'firstTimeBy', // the mile pole, which here is the wire
  7: 'clubhouseTurn', // 7/8
  6: 'leader', // 3/4
  5: 'backstretch', // 5/8
  4: 'pace', // 1/2
  3: 'farTurn', // 3/8
  2: 'home', // 1/4
  1: 'leaderSame|leaderNew', // 1/8
};

const poleEntries = (s: ScheduledCall[]) => s.filter((c) => c.furlongsToGo !== null);

describe('AN1: one call per pole, at the time the leader reaches it, placed by the course', () => {
  it('AN1: the shipped course is the 10 furlong course of the spec table', () => {
    expect(game.race.distanceFurlongs).toBe(10);
    expect(race(0).calls.map((c) => c.furlongsToGo)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it('AN1: the key at each pole is the spec table, over 100 seeds', () => {
    for (const seed of seeds(100)) {
      const r = race(seed);
      const s = callSchedule(r, rd, 0);
      const poles = poleEntries(s).filter((c) => c.key !== 'wire');
      expect(poles, `seed ${seed}`).toHaveLength(9);
      poles.forEach((c, i) => {
        const want = POLE_KEYS[c.furlongsToGo!];
        if (c.furlongsToGo === 1) {
          const same = r.calls[i].horses[0].id === r.calls[i - 1].horses[0].id;
          expect(c.key, `seed ${seed} 1/8 pole`).toBe(same ? 'leaderSame' : 'leaderNew');
        } else {
          expect(c.key, `seed ${seed} ${c.furlongsToGo} to go`).toBe(want);
        }
      });
    }
  });

  it('AN1: both 1/8 pole keys occur (the leader changes in some races and not in others)', () => {
    const keys = new Set(seeds(200).map((seed) => poleEntries(callSchedule(race(seed), rd, 0)).find((c) => c.furlongsToGo === 1)!.key));
    expect(keys).toEqual(new Set(['leaderSame', 'leaderNew']));
  });

  it('AN1: exactly one call per pole, at the time the sim took the call, which is when the leader reaches the pole', () => {
    for (const seed of seeds(60)) {
      const r = race(seed);
      const D = raceDistanceOf(r);
      const poles = poleEntries(callSchedule(r, rd, 0)).filter((c) => c.key !== 'wire');
      expect(new Set(poles.map((c) => c.furlongsToGo)).size).toBe(poles.length);
      poles.forEach((c, i) => {
        expect(c.at).toBe(r.calls[i].time);
        const reach = reachTime(r, D - c.furlongsToGo! * 660 * 100);
        expect(Math.abs(c.at - reach), `seed ${seed} ${c.furlongsToGo} to go`).toBeLessThanOrEqual(r.replay.step);
      });
    }
  });

  it('AN1: the whole race in order: gate, off, nine poles, the final sixteenth, then the winner or the photo', () => {
    for (const seed of seeds(100)) {
      const r = race(seed);
      const s = callSchedule(r, rd, 0);
      const keys = s.map((c) => c.key);
      expect(keys.slice(0, 2)).toEqual(['gate', 'off']);
      expect(keys[keys.length - 2]).toBe('wire');
      expect(keys[keys.length - 1]).toBe(r.photoFinish ? 'photo' : 'winner');
      expect(keys).toHaveLength(13);
      // Times never go backward.
      for (let i = 1; i < s.length; i++) expect(s[i].at, `seed ${seed} call ${i}`).toBeGreaterThanOrEqual(s[i - 1].at);
      expect(s[0].at).toBeLessThanOrEqual(0); // the field loaded: before the doors open
      expect(s[1].at).toBe(0); // doors open
      expect(s[keys.length - 1].at).toBe(r.finish[0].time);
    }
  });

  it('AN1: "Down to the wire" comes as the leader reaches the 1/16 pole, 330 feet to go', () => {
    for (const seed of seeds(60)) {
      const r = race(seed);
      const wire = callSchedule(r, rd, 0).find((c) => c.key === 'wire')!;
      const reach = reachTime(r, raceDistanceOf(r) - 330 * 100);
      expect(Math.abs(wire.at - reach), `seed ${seed}`).toBeLessThanOrEqual(r.replay.step);
    }
  });

  it('AN1: the pole lines name the leader at that pole; the half-mile line carries the half-mile time', () => {
    for (const seed of seeds(40)) {
      const r = race(seed);
      const s = callSchedule(r, rd, 3);
      poleEntries(s).filter((c) => c.key !== 'wire').forEach((c, i) => {
        const leader = nameOf(r, r.calls[i].horses[0].id);
        if (['earlyLeader', 'leader', 'leaderSame', 'leaderNew'].includes(c.key)) expect(c.text).toContain(leader);
        if (c.key === 'pace') {
          expect(c.text).toContain(half(r.pace.halfMile));
          expect(c.text).not.toContain('{');
        }
      });
    }
  });

  it('AN1: the pace line is the hot, honest or slow line of the race', () => {
    const seen = new Set<string>();
    for (const seed of seeds(300)) {
      const r = race(seed);
      const c = callSchedule(r, rd, 0).find((x) => x.key === 'pace')!;
      const lines = calls.pace[r.pace.label].map((l) => l.split('{half}').join(half(r.pace.halfMile)));
      expect(lines, `seed ${seed}`).toContain(c.text);
      seen.add(r.pace.label);
    }
    expect(seen).toEqual(new Set(['hot', 'honest', 'slow']));
  });

  it('AN1: the winner call names the winner; a photo finish says too close to call instead', () => {
    let photos = 0;
    let wins = 0;
    for (const seed of seeds(300)) {
      const r = race(seed);
      const last = callSchedule(r, rd, 0).at(-1)!;
      if (r.photoFinish) {
        photos++;
        expect(calls.photo).toContain(last.text);
        expect(last.text).not.toContain(nameOf(r, r.finish[0].id));
      } else {
        wins++;
        expect(calls.winner.map((l) => l.split('{winner}').join(nameOf(r, r.finish[0].id)))).toContain(last.text);
      }
    }
    expect(photos).toBeGreaterThan(0);
    expect(wins).toBeGreaterThan(0);
  });

  describe('other distances: one call per pole, in order, placed by the course', () => {
    for (const furlongs of [5, 6, 7, 8, 9, 11, 12]) {
      it(`AN1: ${furlongs} furlongs`, () => {
        const g = structuredClone(game);
        g.race.distanceFurlongs = furlongs;
        for (const seed of [1, 2, 3, 4, 5, 6]) {
          const r = runRace(g, seed);
          const s = callSchedule(r, rd, 0);
          const poles = poleEntries(s).filter((c) => c.key !== 'wire');
          expect(poles.map((c) => c.furlongsToGo)).toEqual(r.calls.map((c) => c.furlongsToGo));
          expect(poles).toHaveLength(furlongs - 1);
          poles.forEach((c, i) => expect(c.at).toBe(r.calls[i].time));
          expect(poles.find((c) => c.furlongsToGo === 1)!.key).toMatch(/^leader(Same|New)$/);
          if (furlongs >= 3) expect(poles.find((c) => c.furlongsToGo === 2)!.key).toBe('home');
          if (furlongs >= 8) expect(poles.find((c) => c.furlongsToGo === 4)!.key).toBe('pace');
        }
      });
    }
  });
});

describe('AN2: the variant is (raceNumber + callIndex) mod variants', () => {
  // Round two: round one read poleIndex as the index among result.calls and failed on the
  // code's offset of 2. The spec now says callIndex is the call's 0-based place in the
  // race's call schedule: gate 0, off 1, then each pole in order, the wire, then the
  // winner or photo. The code's reading is the ruling, so this test pins that.
  const poleCalls = (r: RaceResult) => r.calls;
  const linesFor = (c: ScheduledCall, r: RaceResult): string[] =>
    c.key === 'pace' ? calls.pace[r.pace.label] : (calls[c.key as keyof typeof calls] as string[]);
  const fill = (line: string, r: RaceResult, c: ScheduledCall, poleNo: number) => line
    .split('{leader}').join(c.furlongsToGo !== null ? nameOf(r, poleCalls(r)[poleNo].horses[0].id) : '')
    .split('{winner}').join(nameOf(r, r.finish[0].id))
    .split('{half}').join(half(r.pace.halfMile));

  it('AN2: every call in the schedule, gate and off included, is variant (raceNumber + its index) mod count', () => {
    for (const seed of [1, 2, 3, 7, 11, 40]) {
      const r = race(seed);
      for (let n = 0; n < 7; n++) {
        const s = callSchedule(r, rd, n);
        let poleNo = -1;
        s.forEach((c, index) => {
          if (c.furlongsToGo !== null) poleNo++;
          const lines = linesFor(c, r);
          expect(c.text, `seed ${seed} race ${n} call ${index} (${c.key})`).toBe(fill(lines[(n + index) % lines.length], r, c, poleNo));
        });
      }
    }
  });

  it('AN2: the first two calls are the gate (index 0) and the break (index 1)', () => {
    const r = race(1);
    const s = callSchedule(r, rd, 0);
    expect(s[0].key).toBe('gate');
    expect(s[0].text).toBe(calls.gate[0]);
    expect(s[1].key).toBe('off');
    expect(s[1].text).toBe(calls.off[1]);
  });

  it('AN2: consecutive race numbers never give the same line on the same call when a key has two or more variants', () => {
    for (const seed of seeds(40)) {
      const r = race(seed);
      for (let n = 0; n < 8; n++) {
        const a = callSchedule(r, rd, n);
        const b = callSchedule(r, rd, n + 1);
        expect(a.map((c) => c.key)).toEqual(b.map((c) => c.key));
        a.forEach((c, i) => {
          expect(linesFor(c, r).length).toBeGreaterThanOrEqual(2);
          expect(b[i].text, `seed ${seed} races ${n}/${n + 1} call ${i} ${c.key}`).not.toBe(c.text);
        });
      }
    }
  });

  it('AN2: every variant of every key is heard on that call within as many races as it has variants', () => {
    let photo = 0;
    let plain = 0;
    for (const seed of seeds(60)) {
      const r = race(seed);
      if (r.photoFinish ? photo++ >= 3 : plain++ >= 3) continue;
      const first = callSchedule(r, rd, 0);
      first.forEach((c, i) => {
        const lines = linesFor(c, r);
        for (const start of [0, 5, 1000]) {
          const heard = new Set(Array.from({ length: lines.length }, (_v, k) => callSchedule(r, rd, start + k)[i].text));
          expect(heard.size, `seed ${seed} call ${i} ${c.key} from race ${start}`).toBe(lines.length);
        }
      });
    }
    expect(photo).toBeGreaterThan(0);
  });

  it('AN2: the rotation is arithmetic: the same race number gives the same lines every time', () => {
    const r = race(6);
    expect(callSchedule(r, rd, 4).map((c) => c.text)).toEqual(callSchedule(r, rd, 4).map((c) => c.text));
  });

  it('AN2: a large or odd race number still lands on a real line', () => {
    const r = race(2);
    for (const n of [1000, 99999, 4294967295]) {
      for (const c of callSchedule(r, rd, n)) expect(c.text).not.toMatch(/undefined|\{|\}/);
    }
  });
});

describe('typing and holding the call', () => {
  const r = race(1);
  const s = callSchedule(r, rd, 0);
  const cps = rd.hud.typeCharsPerSecond.value;
  const at = (rt: number) => playbackSecond(rt);

  it('the call is typed out in about half a second and held until the next one', () => {
    const c = s.find((x) => x.key === 'leader')!;
    const start = at(c.at);
    expect(announcerAt(s, start, at, cps)).toBe('');
    expect(announcerAt(s, start + 0.1, at, cps)).toBe(c.text.slice(0, Math.floor(0.1 * cps)));
    expect(announcerAt(s, start + 0.5, at, cps)).toBe(c.text); // 30 characters at 60 a second
    const next = s[s.indexOf(c) + 1];
    expect(announcerAt(s, at(next.at) - 0.01, at, cps)).toBe(c.text);
  });

  // Updated on purpose with step 5: this sampled at `pickSeconds`, which is now 0 (picking moved
  // to the Card), so it no longer fell in the gate beat. The requirement stands: the gate call
  // shows while the field stands in the gate, from the start of the beat to the doors opening.
  it('the gate call shows before the doors open', () => {
    const doors = rd.beats.pickSeconds.value + rd.beats.gateStillSeconds.value;
    // The call types out at 60 characters a second, so it is whole from 0.5 s: the samples are after that and before the doors.
    expect(doors).toBeGreaterThan(0.5);
    for (const p of [0.5, (0.5 + doors) / 2, doors - 0.01]) expect(announcerAt(s, p, at, cps), `p ${p}`).toBe(s[0].text);
  });

  it('every typed text is a prefix of the call, and the last two calls cut in whole', () => {
    for (let p = 0; p < 80; p += 0.05) {
      const t = announcerAt(s, p, at, cps);
      expect(s.some((c) => c.text.startsWith(t))).toBe(true);
    }
    const wire = s.find((c) => c.key === 'wire')!;
    expect(announcerAt(s, at(wire.at), at, cps)).toBe(wire.text);
  });
});

describe('AN3: no spoilers in the announcer', () => {
  const isFinishLine = (r: RaceResult, text: string) => {
    const winnerLines = calls.winner.map((l) => l.split('{winner}').join(nameOf(r, r.finish[0].id)));
    return winnerLines.includes(text) || calls.photo.includes(text);
  };

  it('AN3: the photo and winner calls appear only once the winner has reached the wire', () => {
    for (const seed of seeds(120)) {
      const r = race(seed);
      for (const n of [0, 1, 2]) {
        const s = callSchedule(r, rd, n);
        const winAt = at(r.finish[0].time);
        for (let p = 0; p < winAt - 0.001; p += 0.31) {
          expect(isFinishLine(r, announcerAt(s, p, at, 60)), `seed ${seed} race ${n} p ${p}`).toBe(false);
        }
        expect(isFinishLine(r, announcerAt(s, winAt - 0.001, at, 60))).toBe(false);
        expect(isFinishLine(r, announcerAt(s, winAt, at, 60))).toBe(true);
        expect(isFinishLine(r, announcerAt(s, winAt + 5, at, 60))).toBe(true);
      }
    }
  });

  function at(rt: number): number {
    return playbackSecond(rt);
  }

  it('AN3: nothing in a call before the winner names the winner unless he is the leader at that pole', () => {
    // Every name in a pole call is that pole's leader, from result.calls, a fact already true then.
    for (const seed of seeds(60)) {
      const r = race(seed);
      const s = callSchedule(r, rd, 0);
      poleEntries(s).filter((c) => c.key !== 'wire').forEach((c, i) => {
        for (const h of r.inputs.card.horses) {
          if (c.text.includes(h.name)) expect(h.id, `seed ${seed} ${c.key}`).toBe(r.calls[i].horses[0].id);
        }
      });
    }
  });
});

describe('AN4: calls fit the top bar', () => {
  const NAME = 'Mint Julep Lawsuit';
  const widestHalf = '1:10.20';
  const all: { key: string; line: string }[] = [];
  for (const [key, lines] of Object.entries(calls)) {
    if (key === 'pace') {
      for (const [label, ls] of Object.entries(lines as Record<string, string[]>)) ls.forEach((l) => all.push({ key: `pace.${label}`, line: l }));
    } else {
      (lines as string[]).forEach((l) => all.push({ key, line: l }));
    }
  }
  const filled = all.map((x) => ({ ...x, text: x.line.split('{leader}').join(NAME).split('{winner}').join(NAME).split('{half}').join(widestHalf) }));

  it('AN4: there are 2 or 3 variants per key, as the spec says', () => {
    for (const [key, lines] of Object.entries(calls)) {
      if (key === 'pace') {
        for (const ls of Object.values(lines as Record<string, string[]>)) expect(ls.length).toBeGreaterThanOrEqual(2);
      } else {
        expect((lines as string[]).length, key).toBeGreaterThanOrEqual(2);
        expect((lines as string[]).length, key).toBeLessThanOrEqual(3);
      }
    }
  });

  it.each(filled.map((f) => [`${f.key}: ${f.line}`, f.text] as const))('AN4: %s fits 30 with an 18 character name', (_n, text) => {
    expect(NAME).toHaveLength(18);
    expect(text).not.toMatch(/\{|\}/);
    expect(text.length).toBeLessThanOrEqual(30);
  });

  it('AN4: while "4x" shows the bar holds 27 characters, the call cut and not reworded', () => {
    expect(FAST_CALL_CHARS).toBe(27);
    for (const f of filled) {
      const cut = callForBar(f.text, true);
      expect(cut.length).toBeLessThanOrEqual(27);
      expect(f.text.startsWith(cut)).toBe(true);
      expect(cut).toBe(f.text.slice(0, 27));
      expect(callForBar(f.text, false)).toBe(f.text);
    }
  });

  it('AN4: every call built for real races, with 18 character names, fits 30 and 27 at 4x', () => {
    const g = structuredClone(game);
    g.card.horses.forEach((h, i) => { h.name = `Horse Number ${i + 1} Mmmmm`.slice(0, 18); });
    expect(g.card.horses.every((h) => h.name.length === 18)).toBe(true);
    for (const seed of seeds(40)) {
      const r = runRace(g, seed);
      for (const n of [0, 1, 2]) {
        for (const c of callSchedule(r, rd, n)) {
          expect(c.text.length).toBeLessThanOrEqual(30);
          expect(callForBar(c.text, true).length).toBeLessThanOrEqual(27);
        }
      }
    }
  });
});
