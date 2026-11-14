import { describe, expect, it } from 'vitest';
import { callAt, marginWords } from './format';
import { bettorView, leaderLines, makeRaceSetup, raceFrame, watchingView } from './raceFrame';
import { hudBetLine } from './betCopy';
import { cameraX, horsesAt, leaderOf, makeRaceModel, viewConfig, worldX } from './view';
import { PRIORITY, messageSchedule } from './messages';
import { art, interp, race, rd, seeds } from './testkit';

// BR1 to BR3 and the camera rule of UI4 / BR2, from docs/specs/betting-screens.md section 4 and 9.

const result = race(3);
const setup = makeRaceSetup(result, rd, 3, art);
const winner = result.finish[0];
const loser = result.finish[result.finish.length - 1];
const horsesById = new Map(result.inputs.card.horses.map((h) => [h.id, h]));
const WIRE_PRIORITY_TEXTS = ['That ticket is good', 'No luck this time'];
/** Playback seconds from the gate to well past the winner beat, 1 s apart. */
const wallSeconds = (): number[] => {
  const end = setup.timeline.beatEndAt + 2;
  return Array.from({ length: Math.ceil(end) + 1 }, (_v, i) => i);
};
const frameTexts = (f: ReturnType<typeof raceFrame>) => [f.name, f.position, f.orders, f.message, f.call, f.clock, f.fastTag ?? ''];

describe('BR1 with a bet, HUD line y201 is "{amount} to win, {odds}"', () => {
  it('the money format of the bet line is "$10 to win, 5-2" and "$100 to win, 26-1" (17 characters fit 18)', () => {
    expect(hudBetLine(rd.copy, 10, '5-2')).toBe('$10 to win, 5-2');
    expect(hudBetLine(rd.copy, 100, '26-1')).toBe('$100 to win, 26-1');
    expect(hudBetLine(rd.copy, 100, '26-1').length).toBeLessThanOrEqual(18);
  });

  it('the frame\'s third line is the bet line, at every moment', () => {
    const me = bettorView(setup, loser.post, '$10 to win, 5-2');
    for (const p of wallSeconds()) expect(raceFrame(setup, me, p).orders).toBe('$10 to win, 5-2');
  });

  it('your horse is the horse bet on: name, one arrow, one yours dot and strip entry, as built', () => {
    const me = bettorView(setup, loser.post, '$10 to win, 5-2');
    const f = raceFrame(setup, me, setup.timeline.doorsAt + 3);
    expect(f.name).toBe(horsesById.get(loser.id)!.name);
    expect(f.arrow).not.toBeNull();
    expect(f.horses.filter((h) => h.yours).map((h) => h.id)).toEqual([loser.id]);
    expect(f.dots.filter((d) => d.yours)).toHaveLength(1);
    expect(f.position.length).toBeGreaterThan(0);
  });
});

describe('BR2 with no bet', () => {
  const me = watchingView(setup);

  it('line 3 is "Just watching"', () => {
    expect(me.orders).toBe('Just watching');
    for (const p of wallSeconds()) expect(raceFrame(setup, me, p).orders).toBe('Just watching');
  });

  it('no marker, strip arrow or ringed dot is drawn at any moment', () => {
    for (const p of wallSeconds()) {
      const f = raceFrame(setup, me, p);
      expect(f.arrow, `p ${p}`).toBeNull();
      expect(f.horses.some((h) => h.yours), `p ${p}`).toBe(false);
      expect(f.dots.some((d) => d.yours), `p ${p}`).toBe(false);
      expect(f.strip.some((s) => s.yours), `p ${p}`).toBe(false);
      expect(f.edges.some((e) => e.yours), `p ${p}`).toBe(false);
    }
  });

  it('lines 1 and 2 are the leader at the most recent call and "Leads by {margin}"', () => {
    for (const call of result.calls) {
      for (const t of [call.time, call.time + 50]) {
        const latest = callAt(result.calls, t)!;
        const leader = latest.horses.find((h) => h.position === 1)!;
        const second = latest.horses.find((h) => h.position === 2)!;
        const lines = leaderLines(result, rd, t);
        expect(lines.name).toBe(horsesById.get(leader.id)!.name);
        expect(lines.position).toBe(`Leads by ${marginWords(second.lengthsBehind, result.inputs.tuning.marginLabelBounds.value, rd.copy)}`);
        expect(lines.position).toMatch(/^Leads by \S/);
      }
    }
  });

  it('before the first call the lines are blank', () => {
    expect(leaderLines(result, rd, result.calls[0].time - 1)).toEqual({ name: '', position: '' });
  });

  it('the frame shows those lines', () => {
    const t = result.calls[1].time + 20;
    const p = setup.timeline.doorsAt + t / 100 / setup.timeline.speed;
    const f = raceFrame(setup, me, p);
    expect(f.name).toBe(leaderLines(result, rd, f.raceTime).name);
    expect(f.position).toBe(leaderLines(result, rd, f.raceTime).position);
    expect(f.name).not.toBe('');
  });

  it('the camera is L - 200 with the leader at screen x 200, from the gate until the final sixteenth', () => {
    const cfg = viewConfig(rd);
    const model = makeRaceModel(result, cfg);
    expect(cfg.leaderScreenX).toBe(200); // spec: "the leader at screen x 200"
    let checked = 0;
    for (let t = 25; t < model.finalAt; t += 25) {
      const L = Math.max(...result.replay.horses.map((h) => worldX(interp(h.distance, result.replay.step, t), cfg)));
      expect(cameraX(model, null, t), `t ${t}`).toBe(L - 200);
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('the final sixteenth and the wire hold are unchanged: the camera matches the leader-as-player camera at every moment', () => {
    const cfg = viewConfig(rd);
    const model = makeRaceModel(result, cfg);
    for (let t = 0; t <= model.winnerAt + 400; t += 10) {
      const lead = leaderOf(horsesAt(result, cfg, t));
      expect(cameraX(model, null, t), `t ${t}`).toBe(cameraX(model, lead.id, t));
    }
    expect(cameraX(model, null, model.winnerAt)).toBe(cameraX(model, winner.id, model.winnerAt));
  });

  it('holds across seeds: with no player the camera is never left of the leader-at-200 rule', () => {
    for (const seed of seeds(6, 20)) {
      const r = race(seed);
      const cfg = viewConfig(rd);
      const model = makeRaceModel(r, cfg);
      for (let t = 100; t < model.finalAt; t += 300) {
        const L = Math.max(...r.replay.horses.map((h) => worldX(interp(h.distance, r.replay.step, t), cfg)));
        expect(cameraX(model, null, t), `seed ${seed} t ${t}`).toBe(L - 200);
      }
    }
  });
});

describe('BR3 the wire message', () => {
  const wireTexts = (shown: { text: string; from: number }[]) => shown.filter((s) => WIRE_PRIORITY_TEXTS.includes(s.text));

  it('with a bet on the winner: "That ticket is good", exactly once, never before the winner crosses', () => {
    const me = bettorView(setup, winner.post, '$10 to win, 5-2');
    const wire = wireTexts(me.messages);
    expect(wire.map((s) => s.text)).toEqual(['That ticket is good']);
    const crosses = winner.time / 100 / setup.timeline.speed;
    expect(wire[0].from).toBeGreaterThanOrEqual(crosses);
  });

  it('with a bet on a horse that lost: "No luck this time"', () => {
    const me = bettorView(setup, loser.post, '$10 to win, 5-2');
    expect(wireTexts(me.messages).map((s) => s.text)).toEqual(['No luck this time']);
  });

  it('on screen, the line appears only after the wire and never before', () => {
    for (const post of [winner.post, loser.post]) {
      const me = bettorView(setup, post, '$10 to win, 5-2');
      const crossWall = setup.timeline.doorsAt + winner.time / 100 / setup.timeline.speed;
      let seen = false;
      for (let p = 0; p <= setup.timeline.beatEndAt + 6; p += 0.25) {
        const m = raceFrame(setup, me, p).message;
        if (WIRE_PRIORITY_TEXTS.includes(m)) { seen = true; expect(p, m).toBeGreaterThanOrEqual(crossWall - 1e-6); }
      }
      expect(seen, `post ${post}`).toBe(true);
    }
  });

  it('a luck event starting under 1 second before the winner reaches the wire does not crowd the wire message out', () => {
    const ids = result.finish.map((f) => f.id);
    for (const [label, mineIdx] of [['bet on the winner', 0], ['bet on a loser', ids.length - 1]] as const) {
      for (const who of ['mine', 'other', 'both'] as const) {
        const r2 = structuredClone(result);
        const mine = ids[mineIdx];
        const other = ids[2];
        const when = winner.time - 50; // 0.5 s of race time before the wire, under 1 s of playback
        const hs = who === 'mine' ? [mine] : who === 'other' ? [other] : [mine, other];
        for (const h of hs) r2.replay.events.push({ type: 'blocked', horse: h, otherHorse: null, time: when } as (typeof r2.replay.events)[number]);
        r2.replay.events.sort((a, b) => a.time - b.time);
        const setup2 = makeRaceSetup(r2, rd, 3, art);
        const me = bettorView(setup2, r2.inputs.card.horses.find((h) => h.id === mine)!.post, '$10 to win, 5-2');
        const want = mine === winner.id ? 'That ticket is good' : 'No luck this time';
        expect(wireTexts(me.messages).map((s) => s.text), `${label} / ${who}`).toEqual([want]);
        let seen = false;
        for (let p = 0; p <= setup2.timeline.beatEndAt + 6; p += 0.25) if (raceFrame(setup2, me, p).message === want) seen = true;
        expect(seen, `${label} / ${who}: the wire message shows`).toBe(true);
      }
    }
  });

  it('with no bet there is no wire message', () => {
    const me = watchingView(setup);
    expect(wireTexts(me.messages)).toEqual([]);
    for (let p = 0; p <= setup.timeline.beatEndAt + 6; p += 0.25) expect(WIRE_PRIORITY_TEXTS).not.toContain(raceFrame(setup, me, p).message);
  });

  it('no money string appears anywhere in the race view but the bet line itself', () => {
    for (const me of [bettorView(setup, winner.post, '$10 to win, 5-2'), bettorView(setup, loser.post, '$100 to win, 26-1'), watchingView(setup)]) {
      for (let p = 0; p <= setup.timeline.beatEndAt + 6; p += 0.5) {
        const f = raceFrame(setup, me, p);
        for (const t of frameTexts(f)) {
          if (t === me.orders) continue;
          expect(t, `p ${p}`).not.toMatch(/\$|paid|pays|bank|profit|won \d|lost \d/i);
        }
        expect(f.orders).not.toMatch(/\.\d\d/); // the bet line has whole dollars, never cents
      }
    }
  });

  it('UI1: nothing in the race HUD names an estimate or a chance', () => {
    for (const me of [bettorView(setup, loser.post, '$10 to win, 5-2'), watchingView(setup)]) {
      for (let p = 0; p <= setup.timeline.beatEndAt + 6; p += 1) {
        for (const t of frameTexts(raceFrame(setup, me, p))) expect(t).not.toMatch(/%|estimate|chance|probab|likel/i);
      }
    }
  });
});

describe('BR3 the wire message is never dropped for waiting, whatever the timings are tuned to', () => {
  it('a luck message showing 4 s with a 3 s max wait still lets the ticket message show, right after it', () => {
    const triggers = [
      { at: 9.5, priority: PRIORITY.other, text: 'luck' },
      { at: 10, priority: PRIORITY.ticket, text: 'ticket' },
      { at: 10, priority: PRIORITY.yours, text: 'home' },
    ];
    // The ticket message waits 3.5 s, past the 3 s limit: it shows anyway. "home" waits as long and is dropped, as before.
    expect(messageSchedule(triggers, 4, 3)).toEqual([
      { from: 9.5, to: 13.5, text: 'luck' },
      { from: 13.5, to: 17.5, text: 'ticket' },
    ]);
  });
});
