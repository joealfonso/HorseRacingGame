import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RaceEvent, RaceResult } from '../sim/result';
import { runRace } from '../sim/runRace';
import { RESULT_CONFIRM_KEYS, resultScreen, tripCalls, tripFinish, tripLines, tripLuck, tripOrders } from './resultScreen';
import { RESULT_BAND_ROWS, cellOf, expectedSpans, game, interp, paintRects, pixelAt, race, rd, seeds, yellowSpans } from './testkit';

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

  // Rewritten on purpose (spec 4.6 restyle): the three Navy framed boxes (y0-103, y104-175,
  // y176-239) became one Parchment page. Where each box edge was, a 1 px Ink rule runs at y103
  // and y175, and the 8 px where the frame tiles were stays as margin.
  it('no framed boxes: flat Parchment with a 1 px Ink rule across x8-247 at y103 and y175, and no other', () => {
    expect(s.boxes).toEqual([]);
    expect(s.paper).toBe('Parchment');
    expect(s.rules).toEqual([103, 175].map((y) => ({ x: 8, y, w: 240, h: 1, color: 'Ink' })));
    expect([...s.rules, ...s.band].some((r) => r.color === 'Navy')).toBe(false);
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

  // Rewritten on purpose (spec 4.6 restyle): your name is Ink on the Yellow highlighter band,
  // not Yellow text, and the others are Ink, not Bone. The arrow marker at x8 stays, now Ink.
  it('your row alone is marked: the marker at x8 on your row, your name in Ink, others in Ink too, the band on yours', () => {
    s.rows.forEach((row) => {
      const name = row.texts.find((t) => t.x === 56)!;
      expect(name.color).toBe('Ink');
      expect(row.texts.find((t) => t.x === 16)!.color).toBe('Ink');
      if (row.id === mine) {
        expect(row.yours).toBe(true);
        expect(row.marker).toEqual({ x: 8, y: 8 + 11 * (row.place - 1) });
      } else {
        expect(row.yours).toBe(false);
        expect(row.marker).toBeNull();
      }
    });
    expect(s.rows.filter((x) => x.marker)).toHaveLength(1);
    expect(s.rows.filter((x) => x.yours)).toHaveLength(1);
  });

  // Rewritten on purpose (spec 4.6 restyle): the trip heading, your horse's name, is a title in
  // Maroon with no band (was Yellow), and the other four lines are Ink (were Bone).
  it('the trip lines sit at y112 + 11 i from x8, the first in Maroon, in the order name, finish, calls, luck, orders', () => {
    const lines = tripLines(r, rd, mine);
    expect(lines).toHaveLength(5);
    lines.forEach((l, i) => {
      const t = s.texts.find((x) => x.y === 112 + 11 * i && x.x === 8)!;
      expect(t.text).toBe(l);
      expect(t.color).toBe(i === 0 ? 'Maroon' : 'Ink');
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

// RS7 as far as it is testable headless (spec 4.6 restyle, DESIGN "Program pages"): the page's
// colors, the margin column, the band under your row and nothing else, and every text in Ink or
// Maroon. Whether it looks like a printed chart is for the eye (RS7 is an [E] criterion).
describe('RS7: the result as the chart page of the program', () => {
  const MARGIN_LABELS = (() => {
    const out = new Set<string>();
    for (let t = 0; t <= 60000; t += 25) out.add(labelOf(t));
    for (const w of [100, 150, 999]) out.add(labelOf(w * 1000));
    return [...out];
  })();

  it('the sim can produce nose, head, neck, quarters, whole lengths and mixed numbers, and none is over 5 characters', () => {
    for (const must of ['nose', 'head', 'neck', '1/2', '3/4', '1', '1 1/4', '9 3/4', '10']) expect(MARGIN_LABELS, must).toContain(must);
    for (const l of MARGIN_LABELS) expect(l.length, l).toBeLessThanOrEqual(5);
  });

  it('the margin column is Maroon and right-aligned to end at x247, for every label the sim can produce and the winner\'s "-"', () => {
    const base = structuredClone(race(7));
    const others = base.finish.slice(1);
    for (let i = 0; i < MARGIN_LABELS.length; i += others.length) {
      const res = structuredClone(base);
      res.finish.slice(1).forEach((f, k) => { f.margin = { lengths: 1, label: MARGIN_LABELS[(i + k) % MARGIN_LABELS.length] }; });
      for (const player of [res.finish[0].id, res.finish[3].id]) {
        const scr = resultScreen(res, rd, player);
        scr.rows.forEach((row, p) => {
          const label = p === 0 ? '-' : res.finish[p].margin!.label;
          const m = row.texts.find((t) => t.text === label && t.x >= 200)!;
          expect(m, `label ${label}`).toBeDefined();
          expect(m.color, `label ${label}`).toBe('Maroon');
          expect(cellOf(m).x1, `label ${label}`).toBe(247);
          expect(m.x, `label ${label}`).toBe(248 - 8 * label.length);
          expect(m.y).toBe(8 + 11 * p);
          expect(m.x, `label ${label} starts no earlier than x208`).toBeGreaterThanOrEqual(208);
        });
      }
    }
  });

  it('the spec\'s own examples: "9 3/4" from x208, "nose" from x216, the winner\'s "-" at x240', () => {
    const res = structuredClone(race(7));
    res.finish[1].margin = { lengths: 9.75, label: '9 3/4' };
    res.finish[2].margin = { lengths: 0.01, label: 'nose' };
    const rows = resultScreen(res, rd, res.finish[0].id).rows;
    expect(rows[1].texts.find((t) => t.text === '9 3/4')!.x).toBe(208);
    expect(rows[2].texts.find((t) => t.text === 'nose')!.x).toBe(216);
    expect(rows[0].texts.find((t) => t.text === '-')).toMatchObject({ x: 240, color: 'Maroon' });
  });

  it('an 18-character name no longer runs into the margin column: it ends at x199 and the margin starts at x208 or later', () => {
    const res = structuredClone(race(7));
    res.inputs.card.horses.find((h) => h.id === res.finish[1].id)!.name = 'Mint Julep Lawsuit';
    res.finish[1].margin = { lengths: 9.75, label: '9 3/4' };
    const row = resultScreen(res, rd, res.finish[0].id).rows[1];
    const name = row.texts.find((t) => t.text === 'Mint Julep Lawsuit')!;
    const margin = row.texts.find((t) => t.text === '9 3/4')!;
    expect(cellOf(name).x1).toBe(199);
    expect(margin.x - (cellOf(name).x1 + 1)).toBeGreaterThanOrEqual(8);
  });

  it('every place is as built: marker x8, place x16, saddlecloth box x42 10x10, name x56, rows at y8 + 11 i, number inside the box', () => {
    const res = race(7);
    resultScreen(res, rd, res.finish[2].id).rows.forEach((row, i) => {
      const y = 8 + 11 * i;
      expect(row.texts.find((t) => t.text === ORD(i + 1))).toMatchObject({ x: 16, y, color: 'Ink' });
      expect(row.texts.find((t) => t.x === 56)).toMatchObject({ y, color: 'Ink' });
      expect(row.cloth.x).toBe(42);
      expect(row.cloth.size).toBe(10);
      // The small-font number (4x6) sits inside the box's 8x8 fill, centered within 1 px.
      expect(row.cloth.numberX).toBeGreaterThanOrEqual(row.cloth.x + 1);
      expect(row.cloth.numberX + 3).toBeLessThanOrEqual(row.cloth.x + 8);
      expect(row.cloth.numberY).toBeGreaterThanOrEqual(row.cloth.y + 1);
      expect(row.cloth.numberY + 5).toBeLessThanOrEqual(row.cloth.y + 8);
      expect(Math.abs(row.cloth.numberX + 1.5 - (row.cloth.x + 4.5))).toBeLessThanOrEqual(1);
      expect(Math.abs(row.cloth.numberY + 2.5 - (row.cloth.y + 4.5))).toBeLessThanOrEqual(1);
    });
  });

  it('your row sits on the Yellow band: x5-250, 10 rows from 1 above the row to 1 below, left x8, 7, 6, 5 and right x250, 249, 248, 247', () => {
    for (const seed of [7, 11, 40]) {
      const res = race(seed);
      res.finish.forEach((mineF, p) => {
        const scr = resultScreen(res, rd, mineF.id);
        expect(yellowSpans(paintRects(scr.band)), `seed ${seed} place ${p + 1}`).toEqual(expectedSpans(8 + 11 * p - 1, RESULT_BAND_ROWS));
      });
    }
  });

  it('no chisel step sits under the place word, the marker, the saddlecloth box, the name or the margin of your row', () => {
    const res = race(7);
    res.finish.forEach((mineF, p) => {
      const scr = resultScreen(res, rd, mineF.id);
      const spans = yellowSpans(paintRects(scr.band));
      const row = scr.rows[p];
      const y = 8 + 11 * p;
      const marked = [
        { x0: 8, x1: 14, y0: y, y1: y + 7 }, // the marker
        { x0: 42, x1: 51, y0: y - 1, y1: y + 8 }, // the saddlecloth box
        ...row.texts.map(cellOf),
      ];
      for (const c of marked) {
        for (let yy = c.y0; yy <= c.y1; yy++) {
          const [a, b] = spans.get(yy)!;
          expect(a, `place ${p + 1} row ${yy} left of x${c.x0}`).toBeLessThanOrEqual(c.x0);
          expect(b, `place ${p + 1} row ${yy} right of x${c.x1}`).toBeGreaterThanOrEqual(c.x1);
        }
      }
    });
  });

  it('the band is only under your row: nothing under the trip heading, the time lines or the other rows', () => {
    const res = race(7);
    for (const f of res.finish) {
      const scr = resultScreen(res, rd, f.id);
      expect(scr.band).toHaveLength(10);
      const ys = scr.band.map((r) => r.y);
      expect(Math.max(...ys)).toBeLessThan(103);
      const yours = 8 + 11 * (f.place - 1);
      expect(ys.every((y) => y >= yours - 1 && y <= yours + 8)).toBe(true);
    }
  });

  it('every text on the page is Ink, except the trip heading and the margin column, which are Maroon: nothing is Yellow or Bone', () => {
    for (const seed of seeds(40)) {
      const res = race(seed);
      for (const h of res.inputs.card.horses) {
        const scr = resultScreen(res, rd, h.id);
        const maroon = [...scr.texts.filter((t) => t.color === 'Maroon'), ...scr.rows.flatMap((r) => r.texts.filter((t) => t.color === 'Maroon'))];
        const allTexts = [...scr.texts, ...scr.rows.flatMap((r) => r.texts)];
        for (const t of allTexts) expect(['Ink', 'Maroon'], `${t.text} (seed ${seed})`).toContain(t.color);
        expect(maroon.length).toBe(1 + 8);
        expect(scr.texts.filter((t) => t.color === 'Maroon')).toEqual([expect.objectContaining({ x: 8, y: 112 })]);
      }
    }
  });

  it('the time line, the splits, the seed and "Next race" are Ink, at their built positions, with the small-font numbers in Ink', () => {
    const res = race(7);
    const scr = resultScreen(res, rd, res.finish[0].id);
    const t184 = scr.texts.find((t) => t.y === 184)!;
    expect([t184.x, t184.color]).toEqual([8, 'Ink']);
    const splitsLabel = scr.texts.find((t) => t.text === 'Splits')!;
    expect([splitsLabel.x, splitsLabel.y, splitsLabel.color]).toEqual([8, 196, 'Ink']);
    const nums = scr.texts.filter((t) => t.small);
    expect(nums).toHaveLength(2); // the splits and the seed
    for (const n of nums) expect(n.color).toBe('Ink');
    const seedLabel = scr.texts.find((t) => t.text === 'Seed')!;
    expect([seedLabel.y, seedLabel.color]).toEqual([208, 'Ink']);
    const next = scr.texts.find((t) => t.text === 'Next race')!;
    expect([next.x, next.y, next.color]).toEqual([20, 220, 'Ink']);
    expect(scr.cursor).toEqual({ x: 8, y: 220 });
    // The cursor's 8 px (x8-15) leaves the label's first column x20 clear.
    expect(scr.cursor.x + 8).toBeLessThanOrEqual(next.x);
  });

  it('the rules never cross a text or the band: the order rows end above y103, the trip sits between the rules, the time lines are below y175', () => {
    const res = race(7);
    const scr = resultScreen(res, rd, res.finish[7].id);
    for (const row of scr.rows) for (const t of row.texts) expect(cellOf(t).y1).toBeLessThan(103);
    for (const t of scr.texts.filter((x) => x.y >= 112 && x.y < 175)) expect(cellOf(t).y1).toBeLessThan(175);
    for (const t of scr.texts.filter((x) => x.y > 175)) expect(cellOf(t).y0).toBeGreaterThan(175);
    expect(Math.max(...scr.band.map((r) => r.y))).toBeLessThan(103);
    const px = paintRects([...scr.band, ...scr.rules]);
    expect(pixelAt(px, 100, 103)).toBe('Ink');
    expect(pixelAt(px, 100, 175)).toBe('Ink');
  });

  it('the scene draws the saddlecloth box with a 1 px Ink border, the marker and cursor recolored for paper, and no frame boxes (a read of the scene)', () => {
    const src = readFileSync(new URL('../scenes/ResultScene.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/fillStyle\(rgbOf\(data\.art\.colors, 'Ink'\)\)\.fillRect\(c\.x, c\.y, c\.size, c\.size\)/);
    expect(src).toMatch(/fillRect\(c\.x \+ 1, c\.y \+ 1, c\.size - 2, c\.size - 2\)/);
    expect(src).toContain('art.swap(SLOT_IDS.markerYours, PAPER_MARKER_SWAPS)');
    expect(src).toContain('art.swap(SLOT_IDS.cursor, PAPER_CURSOR_SWAPS)');
  });
});
