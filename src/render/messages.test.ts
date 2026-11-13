import { describe, expect, it } from 'vitest';
import { runRace } from '../sim/runRace';
import type { RaceResult } from '../sim/result';
import { messageAt, messageSchedule, messageTriggers, type Trigger } from './messages';
import { game, interp, race, raceDistanceOf, rd, seeds } from './testkit';

// The message line, spec 4.3. Criterion H7 (fit), plus the table of triggers, the two
// second show time, the queue and its drop rule.

const NAME_18 = 'Mint Julep Lawsuit';
const SPEED = rd.playback.speed.value;
const play = (hundredths: number) => hundredths / 100 / SPEED;

describe('H7: every message fits 30 characters', () => {
  const m = rd.copy.messages;
  const fill = (t: string, v: Record<string, string>) => Object.entries(v).reduce((s, [k, x]) => s.split(`{${k}}`).join(x), t);

  it('H7: an 18 character name is the widest the data allows (the spec string budget)', () => {
    expect(NAME_18).toHaveLength(18);
    expect(game.card.horses.every((h) => h.name.length <= 18)).toBe(true);
  });

  it.each([
    ['blocked', { name: NAME_18 }],
    ['steadied', { name: NAME_18 }],
    ['bumped', { name: NAME_18, n: '8' }],
    ['backInStride', {}],
    ['asked', { name: NAME_18 }],
    ['home', { name: NAME_18, place: '8th' }],
  ] as const)('H7: %s, filled at its widest, is at most 30', (key, values) => {
    const text = fill(m[key], values);
    expect(text).not.toMatch(/\{|\}/); // every hole was a known one
    expect(text.length).toBeLessThanOrEqual(30);
  });

  it('H7: the pick prompt and the next-race line fit too', () => {
    expect(rd.copy.pickPrompt.length).toBeLessThanOrEqual(30);
    expect(rd.copy.nextRace.length).toBeLessThanOrEqual(30);
  });

  it('H7: the spec copy is what the data says', () => {
    expect(m.blocked).toBe('{name} has no room');
    expect(m.steadied).toBe('{name} is steadied');
    expect(m.bumped).toBe('{name} and #{n} bump');
    expect(m.backInStride).toBe('Back in stride');
    expect(m.asked).toBe('{name} is asked');
    expect(m.home).toBe('{name} home in {place}');
    expect(rd.copy.nextRace).toBe('Enter: next race');
  });

  it('H7: every message built for a race with 18 character names, for every player, fits', () => {
    const g = structuredClone(game);
    const names = ['Mint Julep Lawsuit', 'Gravy Subpoena Club', 'Hold My Oats Please', 'Mostly Legs Always', 'Reply All Forever!', 'Legally A Horse Ok', 'Decaf By Mistakes!', 'Left On Read Again'];
    g.card.horses.forEach((h, i) => { h.name = names[i].slice(0, 18).padEnd(18, 'x'); });
    expect(g.card.horses.every((h) => h.name.length === 18)).toBe(true);
    let built = 0;
    for (const seed of seeds(120)) {
      const r = runRace(g, seed);
      for (const h of r.inputs.card.horses) {
        for (const t of messageTriggers(r, rd, h.id, SPEED)) {
          expect(t.text.length, `seed ${seed} ${h.id}: ${t.text}`).toBeLessThanOrEqual(30);
          built++;
        }
      }
    }
    expect(built).toBeGreaterThan(900); // the finish line for each player alone gives 960
  });
});

describe('message triggers, spec 4.3 table', () => {
  const nameOf = (r: RaceResult, id: string) => r.inputs.card.horses.find((h) => h.id === id)!.name;
  const postOf = (r: RaceResult, id: string) => r.inputs.card.horses.find((h) => h.id === id)!.post;
  const ordinalOf = (n: number) => ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'][n];

  const eventSeeds = seeds(400).filter((s) => race(s).replay.events.length > 0);

  it('there are luck events in the sample to test against', () => {
    expect(eventSeeds.length).toBeGreaterThan(20);
    const types = new Set(eventSeeds.flatMap((s) => race(s).replay.events.map((e) => e.type)));
    expect(types).toEqual(new Set(['blocked', 'steadied', 'bumped']));
  });

  it('every luck event is a message for every player, with the spec words, at its playback time', () => {
    for (const seed of eventSeeds) {
      const r = race(seed);
      for (const me of r.inputs.card.horses) {
        const triggers = messageTriggers(r, rd, me.id, SPEED);
        for (const e of r.replay.events) {
          const yours = e.horse === me.id || e.otherHorse === me.id;
          let text: string;
          if (e.type === 'bumped') {
            const [first, second] = e.otherHorse === me.id ? [e.otherHorse!, e.horse] : [e.horse, e.otherHorse!];
            text = `${nameOf(r, first)} and #${postOf(r, second)} bump`;
          } else {
            text = `${nameOf(r, e.horse)} ${e.type === 'blocked' ? 'has no room' : 'is steadied'}`;
          }
          const hit = triggers.find((t) => t.text === text && Math.abs(t.at - play(e.time)) < 1e-9);
          expect(hit, `seed ${seed} player ${me.id}: ${text}`).toBeDefined();
          expect(hit!.priority, `seed ${seed} player ${me.id}: ${text}`).toBe(yours ? 0 : 1);
        }
      }
    }
  });

  it('two seconds after your own event, "Back in stride"; never for other horses events', () => {
    for (const seed of eventSeeds) {
      const r = race(seed);
      for (const me of r.inputs.card.horses) {
        const triggers = messageTriggers(r, rd, me.id, SPEED);
        const strides = triggers.filter((t) => t.text === 'Back in stride');
        const mine = r.replay.events.filter((e) => e.horse === me.id || e.otherHorse === me.id);
        expect(strides, `seed ${seed} player ${me.id}`).toHaveLength(mine.length);
        for (const e of mine) {
          expect(strides.some((t) => Math.abs(t.at - (play(e.time) + 2)) < 1e-9), `seed ${seed} ${me.id}`).toBe(true);
        }
      }
    }
  });

  it('a bump names your horse first, and the other horse by its number', () => {
    let seen = 0;
    for (const seed of eventSeeds) {
      const r = race(seed);
      for (const e of r.replay.events.filter((x) => x.type === 'bumped')) {
        for (const me of [e.horse, e.otherHorse!]) {
          const other = me === e.horse ? e.otherHorse! : e.horse;
          const t = messageTriggers(r, rd, me, SPEED).find((x) => x.text.includes('bump'));
          expect(t!.text).toBe(`${nameOf(r, me)} and #${postOf(r, other)} bump`);
          seen++;
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('your finish: "{name} home in 3rd" at your finish time, for every player', () => {
    for (const seed of seeds(30)) {
      const r = race(seed);
      for (const me of r.inputs.card.horses) {
        const f = r.finish.find((x) => x.id === me.id)!;
        const t = messageTriggers(r, rd, me.id, SPEED).find((x) => / home in /.test(x.text));
        expect(t, `seed ${seed} ${me.id}`).toBeDefined();
        expect(t!.text).toBe(`${me.name} home in ${ordinalOf(f.place)}`);
        expect(t!.at).toBeCloseTo(play(f.time), 9);
        expect(t!.priority).toBe(0);
      }
    }
  });

  it('"{name} is asked" for Move at the 3/8 when your horse passes the 3/8 pole (1980 feet to go)', () => {
    for (const seed of seeds(15)) {
      const g = structuredClone(game);
      g.card.horses[3].instructions.move = 'moveAtThreeEighths';
      const r = runRace(g, seed);
      const me = r.inputs.card.horses.find((h) => h.id === g.card.horses[3].id)!;
      const asked = messageTriggers(r, rd, me.id, SPEED).filter((t) => t.text === `${me.name} is asked`);
      expect(asked).toHaveLength(1);
      const h = r.replay.horses.find((x) => x.id === me.id)!;
      // Find when this horse is 1980 feet from the wire, by the samples.
      const target = raceDistanceOf(r) - 1980 * 100;
      let t = 0;
      while (interp(h.distance, r.replay.step, t) < target) t += 1;
      expect(asked[0].at).toBeGreaterThan(play(t) - 0.03);
      expect(asked[0].at).toBeLessThan(play(t) + 0.03);
      expect(asked[0].priority).toBe(2);
      // Other players of that race do not get it.
      const other = r.inputs.card.horses.find((x) => x.id !== me.id)!;
      expect(messageTriggers(r, rd, other.id, SPEED).some((x) => x.text === `${other.name} is asked`)).toBe(false);
    }
  });

  it('"{name} is asked" for Save for stretch at the tuning save-it point (saveForStretchFeetToGo)', () => {
    const g = structuredClone(game);
    g.card.horses[1].instructions.move = 'saveForStretch';
    const feet = g.tuning.instructions!.saveForStretchFeetToGo.value;
    expect(feet).toBe(1320);
    const r = runRace(g, 4);
    const me = r.inputs.card.horses.find((h) => h.id === g.card.horses[1].id)!;
    const asked = messageTriggers(r, rd, me.id, SPEED).filter((t) => t.text === `${me.name} is asked`);
    expect(asked).toHaveLength(1);
    const h = r.replay.horses.find((x) => x.id === me.id)!;
    const target = raceDistanceOf(r) - feet * 100;
    let t = 0;
    while (interp(h.distance, r.replay.step, t) < target) t += 1;
    expect(Math.abs(asked[0].at - play(t))).toBeLessThan(0.03);
  });

  it('a default-orders horse gets no "is asked" message', () => {
    const r = race(3);
    for (const me of r.inputs.card.horses) {
      expect(messageTriggers(r, rd, me.id, SPEED).some((t) => t.text.endsWith('is asked'))).toBe(false);
    }
  });

  it('playback seconds scale with the speed: the same event at 4x comes twice as early', () => {
    const seed = eventSeeds[0];
    const r = race(seed);
    const me = r.inputs.card.horses[0].id;
    const e = r.replay.events[0];
    const at = (speed: number) => messageTriggers(r, rd, e.horse, speed).find((t) => t.priority <= 1 && !t.text.startsWith('Back'))!.at;
    expect(at(2)).toBeCloseTo(e.time / 200, 9);
    expect(at(4)).toBeCloseTo(e.time / 400, 9);
    expect(me).toBeDefined();
  });
});

describe('the queue: 2 seconds each, best priority first, stale ones dropped after 3 seconds', () => {
  const trig = (at: number, priority: number, text: string): Trigger => ({ at, priority, text });

  it('a message shows for 2 seconds from when it comes', () => {
    const s = messageSchedule([trig(5, 0, 'a')], 2, 3);
    expect(s).toEqual([{ from: 5, to: 7, text: 'a' }]);
    expect(messageAt(s, 4.99)).toBeNull();
    expect(messageAt(s, 5)).toBe('a');
    expect(messageAt(s, 6.99)).toBe('a');
    expect(messageAt(s, 7)).toBeNull();
  });

  it('one at a time: a second message waits for the first', () => {
    const s = messageSchedule([trig(5, 0, 'a'), trig(5.5, 0, 'b')], 2, 3);
    expect(s.map((x) => [x.text, x.from])).toEqual([['a', 5], ['b', 7]]);
  });

  it('priority: your horse first, then other horses, then your order moments', () => {
    const s = messageSchedule([trig(0, 2, 'orders'), trig(0, 1, 'other'), trig(0, 0, 'yours')], 2, 3);
    expect(s.map((x) => x.text)).toEqual(['yours', 'other', 'orders'].slice(0, s.length));
    expect(s[0].text).toBe('yours');
    expect(s[1].text).toBe('other');
  });

  it('a waiting message older than 3 seconds is dropped', () => {
    // a shows 0 to 2, b 2 to 4 (waited 1.9), c would start at 4 having waited 3.8.
    const s = messageSchedule([trig(0, 1, 'a'), trig(0.1, 1, 'b'), trig(0.2, 1, 'c')], 2, 3);
    expect(s.map((x) => x.text)).toEqual(['a', 'b']);
  });

  it('a message that has waited exactly 3 seconds is still shown', () => {
    const s = messageSchedule([trig(0, 1, 'a'), trig(1, 1, 'b'), trig(1, 1, 'c')], 2, 3);
    // b at 2 (waited 1); c would start at 4 (waited 3, not older than 3).
    expect(s.map((x) => [x.text, x.from])).toEqual([['a', 0], ['b', 2], ['c', 4]]);
  });

  it('a dropped message is gone for good: nothing shows in its place later', () => {
    const s = messageSchedule([trig(0, 0, 'a'), trig(0.1, 1, 'b'), trig(0.2, 1, 'c'), trig(0.3, 1, 'd')], 2, 3);
    expect(s.map((x) => x.text)).toEqual(['a', 'b']);
    expect(messageAt(s, 6)).toBeNull();
    expect(messageAt(s, 100)).toBeNull();
  });

  it('no triggers, no messages', () => {
    expect(messageSchedule([], 2, 3)).toEqual([]);
    expect(messageAt([], 3)).toBeNull();
  });

  it('real races: messages never overlap and each lasts the data time', () => {
    for (const seed of seeds(60)) {
      const r = race(seed);
      for (const me of r.inputs.card.horses) {
        const s = messageSchedule(messageTriggers(r, rd, me.id, SPEED), rd.hud.messageSeconds.value, rd.hud.messageMaxWaitSeconds.value);
        s.forEach((x, i) => {
          expect(x.to - x.from).toBeCloseTo(2, 9);
          if (i > 0) expect(x.from).toBeGreaterThanOrEqual(s[i - 1].to - 1e-9);
        });
        expect(s.some((x) => x.text.includes(' home in '))).toBe(true);
      }
    }
  });
});
