import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RaceEvent, RaceResult } from '../sim/result';
import { runRace } from '../sim/runRace';
import { RESULT_CONFIRM_KEYS, resultScreen, tripCalls, tripFinish, tripLines, tripLuck, tripOrders } from './resultScreen';
import { game, interp, race, rd, seeds } from './testkit';

// The result screen (spec 4.6): RS1 to RS5, the layout, the seed, the one action. Expected
// strings are written from the spec's examples and from the result's own fields, never
// read back from the functions under test.

const ORD = (n: number) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
const POST_NAME = (r: RaceResult, id: string) => r.inputs.card.horses.find((h) => h.id === id)!.name;
const FURLONG = 66000; // hundredths of a foot

/** "a nose", "1/2 length", "1 1/4 lengths" from a sim margin label (spec 4.6). */
function phrase(label: string): string {
  if (['nose', 'head', 'neck'].includes(label)) return `a ${label}`;
  const lengths = label.split(' ').reduce((a, p) => a + (p.includes('/') ? Number(p.split('/')[0]) / Number(p.split('/')[1]) : Number(p)), 0);
  return `${label} ${lengths <= 1 ? 'length' : 'lengths'}`;
}

/** The sim's chart label for a margin in thousandths of a length, from the tuning bounds (margins.ts rules). */
function labelOf(thousandths: number): string {
  const b = game.tuning.marginLabelBounds.value;
  const L = thousandths / 1000;
  if (L < b.noseBelow) return 'nose';
  if (L < b.headBelow) return 'head';
  if (L < b.neckBelow) return 'neck';
  if (L >= b.wholeLengthsFrom) return String(Math.round(L));
  const q = Math.round(L * 4);
  const rest = ['', ' 1/4', ' 1/2', ' 3/4'][q % 4];
  return Math.floor(q / 4) === 0 ? rest.trim() : `${Math.floor(q / 4)}${rest}`;
}

const POLES: Record<number, string> = { 1: '1/8', 2: '1/4', 3: '3/8', 4: '1/2', 5: '5/8', 6: '3/4', 7: '7/8', 8: 'mile', 9: '1 1/8', 10: '1 1/4' };

/** Where an event was, from the spec: "at the start" in the first furlong, else the nearest pole to the player's horse. */
function whereOf(r: RaceResult, playerId: string, e: RaceEvent): string | null {
  const h = r.replay.horses.find((x) => x.id === playerId)!;
  const d = interp(h.distance, r.replay.step, e.time);
  if (d < FURLONG) return 'at the start';
  const toGo = Math.round((r.inputs.race.distanceFurlongs * 660 * 100 - d) / FURLONG);
  return toGo >= 1 ? `near the ${POLES[toGo]}` : null;
}

const mineEvents = (r: RaceResult, id: string) => r.replay.events.filter((e) => e.horse === id || e.otherHorse === id);

/** A copy of a real race with the events replaced. */
function withEvents(seed: number, events: RaceEvent[]): RaceResult {
  const r = structuredClone(race(seed));
  r.replay.events = events;
  return r;
}

/** The first sample time at which the horse has run at least `distance`. */
function timeAtDistance(r: RaceResult, id: string, distance: number): number {
  const h = r.replay.horses.find((x) => x.id === id)!;
  const i = h.distance.findIndex((d) => d >= distance);
  return i * r.replay.step;
}

const clockOf = (w: number) => `${Math.floor(w / 6000)}:${String(Math.floor((w % 6000) / 100)).padStart(2, '0')}.${String(w % 100).padStart(2, '0')}`;

describe('RS1: the order list equals result.finish, with the sim\'s margin labels', () => {
  it('RS1: over 300 seeds, rows are in finish order with place, name and margin label, "-" for the winner', () => {
    for (const seed of seeds(300)) {
      const r = race(seed);
      const me = r.inputs.card.horses[seed % 8].id;
      const s = resultScreen(r, rd, me);
      expect(s.rows).toHaveLength(r.finish.length);
      s.rows.forEach((row, i) => {
        const f = r.finish[i];
        expect(row.id, `seed ${seed} row ${i}`).toBe(f.id);
        expect(row.place).toBe(i + 1);
        expect(row.post).toBe(f.post);
        const place = row.texts.find((t) => t.x === 16)!;
        const name = row.texts.find((t) => t.x === 56)!;
        const margin = row.texts.find((t) => t.x >= 204)!;
        expect(place.text).toBe(ORD(i + 1));
        expect(name.text).toBe(POST_NAME(r, f.id));
        expect(margin.text).toBe(i === 0 ? '-' : f.margin!.label);
      });
    }
  });

  it('RS1: the margin column shows the sim\'s labels, all kinds, not rewritten into words', () => {
    const labels = new Set<string>();
    for (const seed of seeds(300)) for (const f of race(seed).finish.slice(1)) labels.add(f.margin!.label);
    expect(labels.has('nose')).toBe(true);
    expect(labels.has('3/4')).toBe(true);
    for (const seed of seeds(60)) {
      const r = race(seed);
      const s = resultScreen(r, rd, r.finish[2].id);
      expect(s.rows.slice(1).map((row) => row.texts.find((t) => t.x >= 204)!.text)).toEqual(r.finish.slice(1).map((f) => f.margin!.label));
    }
  });

  it('RS1: the sim\'s own labels are shown even when they are made up (the screen invents none)', () => {
    const r = structuredClone(race(3));
    r.finish[1].margin = { lengths: 1234, label: '9 3/4' };
    const s = resultScreen(r, rd, r.finish[0].id);
    expect(s.rows[1].texts.find((t) => t.x >= 204)!.text).toBe('9 3/4');
  });
});

describe('layout (spec 4.6 diagram)', () => {
  const r = race(7);
  const mine = r.finish[2].id;
  const s = resultScreen(r, rd, mine);

  it('three framed boxes: order y0-103, trip y104-175, time y176-239', () => {
    expect(s.boxes.map((b) => [b.x, b.y, b.tilesW * 8, b.tilesH * 8])).toEqual([[0, 0, 256, 104], [0, 104, 256, 72], [0, 176, 256, 64]]);
  });

  it('rows sit at y8 + 11 i, and the columns are marker x8, place x16, saddlecloth x42 10 wide, name x56, margin x204-247', () => {
    s.rows.forEach((row, i) => {
      const y = 8 + 11 * i;
      const place = row.texts.find((t) => t.text === ORD(i + 1))!;
      expect([place.x, place.y]).toEqual([16, y]);
      expect(row.cloth.x).toBe(42);
      expect(row.cloth.size).toBe(10);
      // The 10x10 box is centered on the 8 px text row.
      expect(row.cloth.y).toBeGreaterThanOrEqual(y - 2);
      expect(row.cloth.y + 10).toBeLessThanOrEqual(y + 10);
      const name = row.texts.find((t) => t.text === POST_NAME(r, row.id))!;
      expect([name.x, name.y]).toEqual([56, y]);
      const margin = row.texts.find((t) => t.x >= 204)!;
      expect(margin.y).toBe(y);
      expect(margin.x).toBeGreaterThanOrEqual(204);
      expect(margin.x + 8 * margin.text.length).toBe(248); // right-aligned in x204-247
    });
    expect(s.rows[7].texts[0].y).toBe(8 + 77); // the eighth row, y85
  });

  it('your row alone is marked: the marker at x8 on your row, your name in Yellow, others in Bone', () => {
    s.rows.forEach((row) => {
      if (row.id === mine) {
        expect(row.yours).toBe(true);
        expect(row.marker).toEqual({ x: 8, y: 8 + 11 * (row.place - 1) });
        expect(row.texts.find((t) => t.x === 56)!.color).toBe('Yellow');
      } else {
        expect(row.yours).toBe(false);
        expect(row.marker).toBeNull();
        expect(row.texts.find((t) => t.x === 56)!.color).toBe('Bone');
      }
    });
    expect(s.rows.filter((x) => x.marker)).toHaveLength(1);
  });

  it('the trip lines sit at y112 + 11 i from x8, the first in Yellow, in the order name, finish, calls, luck, orders', () => {
    const lines = tripLines(r, rd, mine);
    expect(lines).toHaveLength(5);
    lines.forEach((l, i) => {
      const t = s.texts.find((x) => x.y === 112 + 11 * i && x.x === 8)!;
      expect(t.text).toBe(l);
      expect(t.color).toBe(i === 0 ? 'Yellow' : 'Bone');
    });
    expect(lines[0]).toBe(POST_NAME(r, mine));
    expect(lines[4]).toMatch(/^Orders: /);
  });

  it('the time box: "Time 2:01.55, hot pace" at y184, then the splits at y196 and the seed at y208 and "Next race" at y220', () => {
    const fmt = (h: number) => {
      const m = Math.floor(h / 6000);
      const sec = Math.floor((h % 6000) / 100);
      const rest = String(h % 100).padStart(2, '0');
      return m === 0 ? `${sec}.${rest}` : `${m}:${String(sec).padStart(2, '0')}.${rest}`;
    };
    const w = r.finish[0].time;
    const clock = `${Math.floor(w / 6000)}:${String(Math.floor((w % 6000) / 100)).padStart(2, '0')}.${String(w % 100).padStart(2, '0')}`;
    const timeLine = s.texts.find((t) => t.y === 184)!;
    expect(timeLine.text).toBe(`Time ${clock}, ${r.pace.label} pace`);
    expect(timeLine.x).toBe(8);
    const splits = s.texts.filter((t) => t.y >= 196 && t.y < 200);
    expect(splits.map((t) => t.text)).toEqual(['Splits', r.fractions.slice(0, -1).map((f) => fmt(f.time)).join(' ')]);
    expect(splits[1].small).toBe(true); // the numbers are in the small font
    expect(splits[0].small).toBeFalsy();
    expect(s.texts.find((t) => t.text === 'Next race')!.y).toBe(220);
    expect(s.cursor.y).toBe(220);
  });

  it('the splits are the quarter-mile fractions from the result, not the winner\'s time', () => {
    const line = s.texts.find((t) => t.small && t.y < 200)!.text.split(' ');
    expect(line).toHaveLength(r.fractions.length - 1);
    expect(line[line.length - 1]).not.toBe(clockOf(r.finish[0].time)); // the winner's time is not a split
  });

  it('every string is inside its field, for every horse as the player, over 120 seeds', () => {
    for (const seed of seeds(120)) {
      const res = race(seed);
      for (const h of res.inputs.card.horses) {
        const scr = resultScreen(res, rd, h.id);
        for (const row of scr.rows) {
          for (const t of row.texts) {
            expect(Number.isInteger(t.x) && Number.isInteger(t.y)).toBe(true);
            if (t.x === 16) expect(t.x + 8 * t.text.length, `place ${t.text}`).toBeLessThanOrEqual(40); // x16-39
            else if (t.x === 56) expect(t.x + 8 * t.text.length, `name ${t.text}`).toBeLessThanOrEqual(200); // x56-199
            else {
              expect(t.text.length, `margin ${t.text}`).toBeLessThanOrEqual(5);
              expect(t.x, `margin ${t.text}`).toBeGreaterThanOrEqual(204);
              expect(t.x + 8 * t.text.length).toBeLessThanOrEqual(248);
            }
          }
        }
        for (const t of scr.texts) {
          const w = t.small ? 4 : 8;
          expect(t.x, `${t.text}`).toBeGreaterThanOrEqual(8);
          expect(t.x + w * t.text.length, `"${t.text}" seed ${seed} ${h.id}`).toBeLessThanOrEqual(248);
        }
        // The 1x lines in a box are at most 30 characters.
        for (const t of scr.texts.filter((x) => !x.small && x.x === 8)) expect(t.text.length).toBeLessThanOrEqual(30);
      }
    }
  });

  it('the seed is shown, in the small font, right-aligned, and the session record is not built', () => {
    for (const seed of [0, 7, 1234567, 4294967295]) {
      const res = structuredClone(race(7));
      res.seed = seed;
      const scr = resultScreen(res, rd, res.finish[0].id);
      const num = scr.texts.find((t) => t.text === String(seed))!;
      expect(num.small).toBe(true);
      expect(num.y).toBeGreaterThanOrEqual(208);
      expect(num.x + 4 * String(seed).length).toBe(248);
      const label = scr.texts.find((t) => t.text === 'Seed')!;
      expect(label.y).toBe(208);
      expect(label.x + 8 * 4).toBeLessThanOrEqual(num.x);
    }
    for (const t of s.texts) expect(t.text).not.toMatch(/Today|^\d+-\d+-\d+-\d+$/);
  });

  it('exactly one action, Next race, with a cursor; Enter, Space and Z choose it and nothing else does', () => {
    expect(s.texts.filter((t) => t.text === 'Next race')).toHaveLength(1);
    expect(s.cursor).toEqual({ x: 8, y: 220 });
    expect(RESULT_CONFIRM_KEYS).toContain('Enter');
    expect(RESULT_CONFIRM_KEYS).toContain('Space');
    expect(RESULT_CONFIRM_KEYS).toContain('KeyZ');
    expect(RESULT_CONFIRM_KEYS.filter((k) => !['Enter', 'NumpadEnter', 'Space', 'KeyZ'].includes(k))).toEqual([]);
    for (const k of ['Escape', 'KeyP', 'ArrowDown', 'ArrowUp', 'Digit1', 'Tab', 'KeyX']) expect(RESULT_CONFIRM_KEYS).not.toContain(k);
  });

  it('the result scene acts on those keys only (a read of the scene)', () => {
    const src = readFileSync(new URL('../scenes/ResultScene.ts', import.meta.url), 'utf8');
    expect(src).toContain('RESULT_CONFIRM_KEYS.includes(e.code)');
  });
});

describe('RS2: trip line 2', () => {
  const base = (seed = 5) => structuredClone(race(seed));

  it.each([
    ['nose', 'Won by a nose'],
    ['head', 'Won by a head'],
    ['neck', 'Won by a neck'],
    ['1/4', 'Won by 1/4 length'],
    ['1/2', 'Won by 1/2 length'],
    ['3/4', 'Won by 3/4 length'],
    ['1', 'Won by 1 length'],
    ['1 1/4', 'Won by 1 1/4 lengths'],
    ['2 1/2', 'Won by 2 1/2 lengths'],
    ['12', 'Won by 12 lengths'],
  ])('a winner over a second horse "%s" back reads "%s"', (label, want) => {
    const r = base();
    r.finish[1].margin = { lengths: 1000, label };
    expect(tripFinish(r, rd, r.finish[0].id)).toBe(want);
  });

  it('a winner\'s line reads the second horse\'s margin, not a later horse\'s', () => {
    const r = base();
    r.finish[1].margin = { lengths: 100, label: 'head' };
    r.finish[2].margin = { lengths: 9000, label: '9' };
    r.finish[2].beatenLengths = 9100;
    expect(tripFinish(r, rd, r.finish[0].id)).toBe('Won by a head');
  });

  it.each([
    [50, 2, '2nd, beaten a nose'],
    [150, 2, '2nd, beaten a head'],
    [300, 3, '3rd, beaten a neck'],
    [500, 3, '3rd, beaten 1/2 length'],
    [750, 4, '4th, beaten 3/4 length'],
    [1000, 4, '4th, beaten 1 length'],
    [1250, 5, '5th, beaten 1 1/4 lengths'],
    [2500, 6, '6th, beaten 2 1/2 lengths'],
    [23000, 8, '8th, beaten 23 lengths'],
  ])('beaten by %i thousandths as place %i reads "%s"', (beaten, place, want) => {
    const r = base();
    const f = r.finish[place - 1];
    f.beatenLengths = beaten;
    expect(tripFinish(r, rd, f.id)).toBe(want);
  });

  it('over 300 seeds and every horse: place and beaten margin from result.finish, singular "length" at one or less', () => {
    let singular = 0;
    let plural = 0;
    for (const seed of seeds(300)) {
      const r = race(seed);
      for (const f of r.finish) {
        const line = tripFinish(r, rd, f.id);
        if (f.place === 1) {
          expect(line, `seed ${seed}`).toBe(`Won by ${phrase(r.finish[1].margin!.label)}`);
        } else {
          expect(line, `seed ${seed} place ${f.place}`).toBe(`${ORD(f.place)}, beaten ${phrase(labelOf(f.beatenLengths))}`);
          if (/ length$/.test(line)) singular++;
          if (/ lengths$/.test(line)) plural++;
        }
      }
    }
    expect(singular).toBeGreaterThan(10);
    expect(plural).toBeGreaterThan(100);
  });
});

describe('RS3: trip line 4, the luck', () => {
  const R = 5;
  const horseId = (n: number) => race(R).inputs.card.horses[n].id;
  const D = race(R).inputs.race.distanceFurlongs * 660 * 100;
  const post = (id: string) => race(R).inputs.card.horses.find((h) => h.id === id)!.post;

  it('"Clean trip" with no event at all', () => {
    const r = withEvents(R, []);
    for (const h of r.inputs.card.horses) expect(tripLuck(r, rd, h.id)).toBe('Clean trip');
  });

  it('"Clean trip" when the only events are other horses\'', () => {
    const me = horseId(0);
    const e: RaceEvent[] = [
      { type: 'blocked', horse: horseId(1), otherHorse: null, time: 6000 },
      { type: 'bumped', horse: horseId(2), otherHorse: horseId(3), time: 9000 },
    ];
    expect(tripLuck(withEvents(R, e), rd, me)).toBe('Clean trip');
  });

  it.each([
    ['blocked', 3, 'No room near the 3/8'],
    ['steadied', 4, 'Steadied near the 1/2'],
    ['blocked', 2, 'No room near the 1/4'],
    ['steadied', 5, 'Steadied near the 5/8'],
    ['steadied', 1, 'Steadied near the 1/8'],
    ['blocked', 7, 'No room near the 7/8'],
    ['steadied', 9, 'Steadied near the 1 1/8'],
  ] as const)('one %s with %i furlongs to go reads "%s"', (type, toGo, want) => {
    const me = horseId(2);
    const base = race(R);
    const t = timeAtDistance(base, me, D - toGo * FURLONG);
    const r = withEvents(R, [{ type, horse: me, otherHorse: null, time: t }]);
    expect(tripLuck(r, rd, me)).toBe(want);
  });

  it('a bump names the other horse\'s post: "Bumped with #7 near the 1/8", whichever of the two is you', () => {
    const base = race(R);
    const a = horseId(2);
    const b = horseId(6);
    const tA = timeAtDistance(base, a, D - 1 * FURLONG);
    const rA = withEvents(R, [{ type: 'bumped', horse: a, otherHorse: b, time: tA }]);
    expect(tripLuck(rA, rd, a)).toBe(`Bumped with #${post(b)} near the 1/8`);
    // And as the other horse in the bump.
    const tB = timeAtDistance(base, b, D - 1 * FURLONG);
    const rB = withEvents(R, [{ type: 'bumped', horse: a, otherHorse: b, time: tB }]);
    expect(tripLuck(rB, rd, b)).toBe(`Bumped with #${post(a)} near the ${whereOf(rB, b, rB.replay.events[0])!.replace('near the ', '')}`);
  });

  it('the pole is the one nearest to your horse at the event\'s time: just either side of the half-way point between poles', () => {
    const me = horseId(4);
    const base = race(R);
    // 3.4 furlongs to go is nearest the 3/8 pole (3 to go); 3.6 to go is nearest the 1/4... no, 4 to go.
    for (const [toGo, want] of [[3.4, '3/8'], [3.6, '1/2'], [2.45, '1/4'], [2.55, '3/8']] as const) {
      const t = timeAtDistance(base, me, D - toGo * FURLONG);
      const r = withEvents(R, [{ type: 'steadied', horse: me, otherHorse: null, time: t }]);
      const h = r.replay.horses.find((x) => x.id === me)!;
      const d = h.distance[t / r.replay.step];
      const actual = (D - d) / FURLONG;
      // The sample lands a little beyond the target, so judge by where the horse really was.
      const nearest = Math.round(actual);
      expect(tripLuck(r, rd, me), `${toGo} to go, really ${actual.toFixed(3)}`).toBe(`Steadied near the ${POLES[nearest]}`);
      expect(want).toBe(POLES[Math.round(toGo)]);
    }
  });

  it('within half a furlong of the finish the pole reads "the wire"', () => {
    const me = horseId(2);
    const base = race(R);
    for (const toGo of [0.4, 0.2, 0.05]) {
      const t = timeAtDistance(base, me, D - toGo * FURLONG);
      const actual = (D - base.replay.horses.find((x) => x.id === me)!.distance[t / base.replay.step]) / FURLONG;
      expect(actual).toBeLessThan(0.5);
      expect(tripLuck(withEvents(R, [{ type: 'steadied', horse: me, otherHorse: null, time: t }]), rd, me)).toBe('Steadied near the wire');
    }
  });

  it('"at the start" inside the first furlong, and not from the first furlong on', () => {
    const me = horseId(1);
    const base = race(R);
    for (const [d, want] of [[3000, 'at the start'], [30000, 'at the start'], [60000, 'at the start']] as const) {
      const t = timeAtDistance(base, me, d);
      const actual = base.replay.horses.find((x) => x.id === me)!.distance[t / base.replay.step];
      expect(actual).toBeLessThan(FURLONG);
      expect(tripLuck(withEvents(R, [{ type: 'blocked', horse: me, otherHorse: null, time: t }]), rd, me)).toBe(`No room ${want}`);
    }
    expect(tripLuck(withEvents(R, [{ type: 'steadied', horse: me, otherHorse: null, time: 0 }]), rd, me)).toBe('Steadied at the start');
    const later = timeAtDistance(base, me, 2 * FURLONG);
    expect(tripLuck(withEvents(R, [{ type: 'steadied', horse: me, otherHorse: null, time: later }]), rd, me)).not.toContain('start');
    const bump = withEvents(R, [{ type: 'bumped', horse: me, otherHorse: horseId(3), time: 0 }]);
    expect(tripLuck(bump, rd, me)).toBe(`Bumped with #${post(horseId(3))} at the start`);
  });

  it('two or more setbacks read "A rough trip, N setbacks", of any kind and in any mix', () => {
    const me = horseId(3);
    const base = race(R);
    const t = (f: number) => timeAtDistance(base, me, D - f * FURLONG);
    const two = withEvents(R, [
      { type: 'blocked', horse: me, otherHorse: null, time: t(5) },
      { type: 'steadied', horse: me, otherHorse: null, time: t(2) },
    ]);
    expect(tripLuck(two, rd, me)).toBe('A rough trip, 2 setbacks');
    const three = withEvents(R, [
      { type: 'bumped', horse: horseId(5), otherHorse: me, time: t(6) },
      { type: 'blocked', horse: me, otherHorse: null, time: t(4) },
      { type: 'steadied', horse: me, otherHorse: null, time: t(2) },
    ]);
    expect(tripLuck(three, rd, me)).toBe('A rough trip, 3 setbacks');
    // A bump counts for both horses in it.
    const bumped = withEvents(R, [
      { type: 'bumped', horse: me, otherHorse: horseId(6), time: t(6) },
      { type: 'bumped', horse: horseId(1), otherHorse: me, time: t(3) },
    ]);
    expect(tripLuck(bumped, rd, me)).toBe('A rough trip, 2 setbacks');
    // Someone else's events do not add to yours.
    const mixed = withEvents(R, [
      { type: 'blocked', horse: me, otherHorse: null, time: t(5) },
      { type: 'steadied', horse: horseId(0), otherHorse: null, time: t(2) },
    ]);
    expect(tripLuck(mixed, rd, me)).toBe(`No room near the ${POLES[Math.round((D - base.replay.horses.find((x) => x.id === me)!.distance[t(5) / base.replay.step]) / FURLONG)]}`);
  });
});

describe('RS4: over 500 seeds, every trip line agrees with the calls, the finish and the events', () => {
  it('RS4: all five lines for every horse as the player', () => {
    let lines = 0;
    let withEvent = 0;
    let rough = 0;
    let leadEarly = 0;
    for (const seed of seeds(500)) {
      const r = race(seed);
      const far = r.inputs.race.distanceFurlongs;
      for (const h of r.inputs.card.horses) {
        const got = tripLines(r, rd, h.id);
        expect(got[0]).toBe(h.name);
        // Line 2.
        const f = r.finish.find((x) => x.id === h.id)!;
        expect(got[1], `seed ${seed} ${h.id}`).toBe(f.place === 1 ? `Won by ${phrase(r.finish[1].margin!.label)}` : `${ORD(f.place)}, beaten ${phrase(labelOf(f.beatenLengths))}`);
        // Line 3: the call a quarter mile from the gate and the 1/4 pole.
        const pos = (toGo: number) => r.calls.find((c) => c.furlongsToGo === toGo)!.horses.find((x) => x.id === h.id)!.position;
        const pe = pos(far - 2);
        const pq = pos(2);
        if (pe === 1) leadEarly++;
        expect(got[2], `seed ${seed} ${h.id}`).toBe(`${pe === 1 ? 'Led early' : `${ORD(pe)} early`}, ${pq === 1 ? 'led at the 1/4' : `${ORD(pq)} at the 1/4`}`);
        // Line 4: the events.
        const ev = mineEvents(r, h.id);
        if (ev.length === 0) expect(got[3]).toBe('Clean trip');
        else if (ev.length >= 2) { expect(got[3]).toBe(`A rough trip, ${ev.length} setbacks`); rough++; }
        else {
          const e = ev[0];
          const where = whereOf(r, h.id, e);
          if (where !== null) {
            if (e.type === 'bumped') {
              const other = e.horse === h.id ? e.otherHorse! : e.horse;
              expect(got[3], `seed ${seed} ${h.id}`).toBe(`Bumped with #${r.inputs.card.horses.find((x) => x.id === other)!.post} ${where}`);
            } else expect(got[3], `seed ${seed} ${h.id}`).toBe(`${e.type === 'blocked' ? 'No room' : 'Steadied'} ${where}`);
          }
          withEvent++;
        }
        expect(got[4]).toBe('Orders: Rider\'s call'); // the shipped card has all-default orders
        lines++;
      }
    }
    expect(lines).toBe(4000);
    expect(withEvent).toBeGreaterThan(50);
    expect(rough).toBeGreaterThan(0); // rough trips are rare on the shipped card; RS3 builds more by hand
    expect(leadEarly).toBeGreaterThan(100);
  });

  it('RS4: line 3 reads "7th early, 4th at the 1/4" and "Led early, led at the 1/4" style, all four mixes', () => {
    const seen = new Set<string>();
    for (const seed of seeds(300)) {
      const r = race(seed);
      for (const h of r.inputs.card.horses) {
        const l = tripCalls(r, rd, h.id);
        seen.add(`${l.startsWith('Led early') ? 'L' : 'p'}${l.endsWith('led at the 1/4') ? 'L' : 'p'}`);
        expect(l).toMatch(/^(Led early|\d+(st|nd|rd|th) early), (led at the 1\/4|\d+(st|nd|rd|th) at the 1\/4)$/);
      }
    }
    expect([...seen].sort()).toEqual(['LL', 'Lp', 'pL', 'pp']);
  });

  it('RS4: the lines read the result, not the replay-derived guesses: changing a call changes line 3, and changing finish changes line 2', () => {
    const r = structuredClone(race(8));
    const me = r.inputs.card.horses[0].id;
    const early = r.calls.find((c) => c.furlongsToGo === r.inputs.race.distanceFurlongs - 2)!;
    early.horses.forEach((h) => { h.position = h.id === me ? 1 : h.position + 1; });
    expect(tripCalls(r, rd, me).startsWith('Led early')).toBe(true);
    early.horses.find((h) => h.id === me)!.position = 5;
    expect(tripCalls(r, rd, me).startsWith('5th early')).toBe(true);
  });
});

describe('RS5: the orders line reads from result.inputs.card', () => {
  const combos: { early: string; move: string; path: string; want: string }[] = [];
  const E: Record<string, string | null> = { default: null, rateEarly: 'Rate' };
  const M: Record<string, string | null> = { default: null, moveAtThreeEighths: '3/8', saveForStretch: 'Save' };
  const P: Record<string, string | null> = { default: null, stayInside: 'Inside' };
  for (const e of Object.keys(E)) for (const m of Object.keys(M)) for (const p of Object.keys(P)) {
    const parts = [E[e], M[m], P[p]].filter((x): x is string => x !== null);
    combos.push({ early: e, move: m, path: p, want: `Orders: ${parts.length ? parts.join(', ') : 'Rider\'s call'}` });
  }

  it('RS5: all 12 combinations, run through the sim with instructions on the player\'s horse', () => {
    expect(combos).toHaveLength(12);
    const g = structuredClone(game);
    const horse = g.card.horses[2];
    for (const c of combos) {
      horse.instructions = { early: c.early, move: c.move, path: c.path } as typeof horse.instructions;
      const r = runRace(g, 11);
      expect(tripOrders(r, rd, horse.id), `${c.early} ${c.move} ${c.path}`).toBe(c.want);
      expect(tripLines(r, rd, horse.id)[4]).toBe(c.want);
      expect(c.want.length).toBeLessThanOrEqual(30);
      expect(resultScreen(r, rd, horse.id).texts.find((t) => t.y === 112 + 44)!.text).toBe(c.want);
    }
  });

  it('RS5: it is the player\'s horse\'s orders, not another horse\'s', () => {
    const g = structuredClone(game);
    g.card.horses[2].instructions = { early: 'rateEarly', move: 'saveForStretch', path: 'stayInside' };
    const r = runRace(g, 11);
    expect(tripOrders(r, rd, g.card.horses[2].id)).toBe('Orders: Rate, Save, Inside');
    expect(tripOrders(r, rd, g.card.horses[3].id)).toBe('Orders: Rider\'s call');
  });

  it('RS5: nothing else in the result changes it; the echoed card does', () => {
    const r = race(11);
    const me = r.inputs.card.horses[4].id;
    const c = structuredClone(r);
    c.finish.reverse();
    c.calls = [];
    c.replay.events = [];
    c.replay.horses.forEach((h) => { h.distance = h.distance.map((d) => d + 1); });
    c.pace = { halfMile: 1, label: 'slow' };
    c.seed = 999;
    c.inputs.tuning.laneMax.value += 1;
    expect(tripOrders(c, rd, me)).toBe(tripOrders(r, rd, me));
    c.inputs.card.horses[4].instructions = { early: 'rateEarly', move: 'moveAtThreeEighths', path: 'default' };
    expect(tripOrders(c, rd, me)).toBe('Orders: Rate, 3/8');
  });
});
