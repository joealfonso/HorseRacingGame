import { afterEach, describe, expect, it, vi } from 'vitest';
import { goToPost, type DayState } from '../bet/day';
import { offeredAmounts } from '../bet/money';
import { loadHub } from '../data/hubLoad';
import { betting, ctx, DAY_SEED, dayWith, drawnOf, programOf, settled } from '../render/betKit';
import { arriveHub, hubClick, hubKey, hubPointerTargets, type HubState } from '../render/hubScreen';
import { hitTest, pointerDown, pointerState, pointerUp, type PointerTarget } from '../render/pointer';
import {
  initialProgramState, lastBetDollars, programClick, programKey, programPointerTargets, type ProgramKeyContext, type ProgramState, type ProgramTargetId,
} from '../render/programScreen';
import { resultPointerTargets } from '../render/resultScreen';
import { shippedRaceDay } from '../render/testkit';
import { nextDay, startDay } from './betDay';
import type { Estimates } from './estimates';

// TH14 (scripted paths), TH5 and TH9 (the flow halves) from docs/specs/track-hub.md
// sections 2, 3, 5, 6 and 9. The scenes need a browser, so `Flow` below stands in for them:
// it holds one screen at a time and routes each press to that screen's pure module (the
// hub's, the program's, the result's pointer targets), then acts on the outcome the way the
// spec says the scene does: program (open at post k), watch (go to the post, no bet), bet and
// pass (Go to the post), back (return to the track on Windows), next (to the track). It
// counts one press per key or per click (a click is a down and an up).

const hub = loadHub();
const AFTER_RACE_1 = (): DayState => settled(programOf(1), dayWith(10000), null, 1);

type Screen =
  | { at: 'result' }
  | { at: 'hub'; state: HubState }
  | { at: 'program'; state: ProgramState }
  | { at: 'race'; ticket: { post: number; dollars: number } | null }
  | { at: 'endOfDay' };

class Flow {
  screen: Screen = { at: 'result' };
  presses = 0;
  trail: string[] = [];
  constructor(public day: DayState = AFTER_RACE_1()) {}

  private get drawn() { return drawnOf()[this.day.nextRace - 1]; }
  private programKeys(): ProgramKeyContext {
    return { horses: this.drawn.horseIds.length, ready: true, offered: offeredAmounts(this.day.bankrollCents, ctx.rules), lastDollars: lastBetDollars(this.day) };
  }
  private toTrack() { this.screen = { at: 'hub', state: arriveHub(hub) }; }
  private goToPost(bet: { post: number; dollars: number } | null) {
    this.day = goToPost(ctx, this.day, programOf(this.day.nextRace), bet);
    this.screen = { at: 'race', ticket: bet };
  }
  private next() { if (this.day.ended !== null) this.screen = { at: 'endOfDay' }; else this.toTrack(); }

  key(code: string): this {
    this.presses++;
    this.trail.push(code);
    const s = this.screen;
    if (s.at === 'result') { if (['Enter', 'Space', 'KeyZ'].includes(code)) this.next(); }
    else if (s.at === 'hub') {
      const r = hubKey(hub, s.state, code, { fieldSize: this.drawn.horseIds.length, ready: true });
      this.screen = { at: 'hub', state: r.state };
      this.hubOutcome(r.outcome);
    } else if (s.at === 'program') {
      const r = programKey(s.state, code, this.programKeys());
      this.screen = { at: 'program', state: r.state };
      this.programOutcome(r.outcome);
    }
    return this;
  }

  click(x: number, y: number): this {
    this.presses++;
    this.trail.push(`click ${x},${y}`);
    const s = this.screen;
    const click = <T extends string>(targets: readonly PointerTarget<T>[]): T | null => {
      const at = hitTest(targets, { x, y });
      const down = pointerDown(pointerState<T>(), 0, at);
      return pointerUp(down, 0, at).act;
    };
    if (s.at === 'result') { if (click(resultPointerTargets()) !== null) this.next(); }
    else if (s.at === 'hub') {
      const id = click(hubPointerTargets(hub));
      if (id !== null) {
        const r = hubClick(hub, s.state, id, { fieldSize: this.drawn.horseIds.length, ready: true });
        this.screen = { at: 'hub', state: r.state };
        this.hubOutcome(r.outcome);
      }
    } else if (s.at === 'program') {
      const k = this.programKeys();
      const id = click<ProgramTargetId>(programPointerTargets(shippedRaceDay.raceDay, s.state, k));
      if (id !== null) {
        const r = programClick(s.state, id, k);
        this.screen = { at: 'program', state: r.state };
        this.programOutcome(r.outcome);
      }
    }
    return this;
  }

  private hubOutcome(o: ReturnType<typeof hubKey>['outcome']) {
    if (o === null || o.kind === 'look') return;
    if (o.kind === 'program') this.screen = { at: 'program', state: initialProgramState(o.post) };
    else this.goToPost(null);
  }
  private programOutcome(o: ReturnType<typeof programKey>['outcome']) {
    if (o === null) return;
    if (o.kind === 'bet') this.goToPost({ post: o.post, dollars: o.dollars });
    else if (o.kind === 'pass') this.goToPost(null);
    else this.toTrack();
  }

  /** Runs every step, checking the race has not started before the last one. */
  run(steps: (string | [number, number])[]): this {
    steps.forEach((st, i) => {
      if (typeof st === 'string') this.key(st); else this.click(st[0], st[1]);
      if (i < steps.length - 1) expect(this.screen.at, `after press ${i + 1} (${this.trail[i]})`).not.toBe('race');
    });
    return this;
  }
}

const amount = offeredAmounts(10000, ctx.rules)[0];
// Points inside the spec's boxes: the result's action line, the Windows door, the rail door,
// entry 3 (y57 + 38 .. 75 + 38), "Enter: bet" (x164-247, y210-223).
const RESULT_NEXT_AT: [number, number] = [100, 224];
const WINDOWS_AT: [number, number] = [50, 150];
const RAIL_AT: [number, number] = [200, 120];
const ENTRY3_AT: [number, number] = [100, 100];
const BET_AT: [number, number] = [200, 215];

afterEach(() => vi.restoreAllMocks());

describe('TH14: by keys, each path reaches the next race with those presses and no others', () => {
  const placedBet = (f: Flow, post: number) => {
    expect(f.screen).toEqual({ at: 'race', ticket: { post, dollars: amount } });
    expect(f.day.open?.program.drawn.race).toBe(2);
    expect(f.day.open?.ticket).toMatchObject({ race: 2, post, dollars: amount });
    expect(f.day.bankrollCents).toBe(AFTER_RACE_1().bankrollCents - amount * 100);
  };
  const noBet = (f: Flow) => {
    expect(f.screen).toEqual({ at: 'race', ticket: null });
    expect(f.day.open?.program.drawn.race).toBe(2);
    expect(f.day.open?.ticket).toBeNull();
    expect(f.day.bankrollCents).toBe(AFTER_RACE_1().bankrollCents);
  };

  it('fast bet: Enter, digit, Enter, Enter is 4 presses', () => {
    const f = new Flow().run(['Enter', 'Digit3', 'Enter', 'Enter']);
    expect(f.presses).toBe(4);
    placedBet(f, 3);
  });

  it('menu bet: Enter, Enter, digit, Enter, Enter is 5 presses', () => {
    const f = new Flow().run(['Enter', 'Enter', 'Digit3', 'Enter', 'Enter']);
    expect(f.presses).toBe(5);
    placedBet(f, 3);
  });

  it('Just watch: Enter, Down, Enter is 3 presses', () => {
    const f = new Flow().run(['Enter', 'ArrowDown', 'Enter']);
    expect(f.presses).toBe(3);
    noBet(f);
  });

  it('Pass after reading: Enter, Enter, Up, Enter is 4 presses', () => {
    const f = new Flow().run(['Enter', 'Enter', 'ArrowUp', 'Enter']);
    expect(f.presses).toBe(4);
    noBet(f);
  });

  it('every digit works in the fast path and lands on its own post', () => {
    for (let k = 1; k <= 8; k++) placedBet(new Flow().run(['Enter', `Digit${k}`, 'Enter', 'Enter']), k);
  });

  it('looking around first adds only the presses it takes, and changes nothing about the bet', () => {
    const f = new Flow().run(['Enter', 'ArrowRight', 'Enter', 'Escape', 'Digit3', 'Enter', 'Enter']);
    expect(f.presses).toBe(7);
    placedBet(f, 3);
  });

  it('a fast bet with Space or Z in place of Enter is the same path', () => {
    placedBet(new Flow().run(['Space', 'Digit3', 'KeyZ', 'Space']), 3);
  });

  it('Esc from the program and a second trip in is 2 more presses, with no money moved on the way', () => {
    const f = new Flow().run(['Enter', 'Enter', 'Escape', 'Enter', 'Digit3', 'Enter', 'Enter']);
    expect(f.presses).toBe(7);
    placedBet(f, 3);
  });
});

describe('TH14: by clicks, a bet is 4 and Just watch is 2', () => {
  it('bet in 4: Next race, Windows, the entry (opens the ticket), "Enter: bet"', () => {
    const f = new Flow().run([RESULT_NEXT_AT, WINDOWS_AT, ENTRY3_AT, BET_AT]);
    expect(f.presses).toBe(4);
    expect(f.screen).toEqual({ at: 'race', ticket: { post: 3, dollars: amount } });
    expect(f.day.bankrollCents).toBe(AFTER_RACE_1().bankrollCents - amount * 100);
  });

  it('Just watch in 2: Next race, the rail', () => {
    const f = new Flow().run([RESULT_NEXT_AT, RAIL_AT]);
    expect(f.presses).toBe(2);
    expect(f.screen).toEqual({ at: 'race', ticket: null });
    expect(f.day.open?.ticket).toBeNull();
  });

  it('Pass after reading in 3: Next race, Windows, "Pass this race"', () => {
    const f = new Flow().run([RESULT_NEXT_AT, WINDOWS_AT, [100, 228]]);
    expect(f.presses).toBe(3);
    expect(f.screen).toEqual({ at: 'race', ticket: null });
  });

  it('a click on the entry being bet does not place the bet: the path needs the 4th click', () => {
    const f = new Flow().run([RESULT_NEXT_AT, WINDOWS_AT, ENTRY3_AT, ENTRY3_AT]);
    expect(f.screen.at).toBe('program');
    expect(f.day.open).toBeNull();
  });

  it('a click on the sky or the status bar of the track does nothing', () => {
    const f = new Flow().run([RESULT_NEXT_AT, [200, 20], [10, 5], [100, 190]]);
    expect(f.screen.at).toBe('hub');
  });

  it('clicks in the program\'s letterbox-free gaps (between entries and the footer) do nothing', () => {
    const f = new Flow().run([RESULT_NEXT_AT, WINDOWS_AT, [100, 30], [100, 215]]);
    expect(f.screen).toMatchObject({ at: 'program', state: { mode: { kind: 'choosing' } } });
  });
});

describe('TH5: arrival focus is Windows, and Esc from the program moves no money', () => {
  const focusOf = (f: Flow) => (f.screen as { state: HubState }).state.focus;

  it('from the result, the track opens on Windows', () => {
    expect(focusOf(new Flow().key('Enter'))).toBe('windows');
    expect(focusOf(new Flow().click(...RESULT_NEXT_AT))).toBe('windows');
  });

  it('from boot and from New day (a fresh day, no looks), focus is Windows', () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const stub = { get: () => null, request: () => undefined, failure: () => null } as unknown as Estimates;
    const { bet, day } = startDay(ctx, betting, shippedRaceDay, stub, DAY_SEED, hub);
    expect(bet.looks).toEqual({});
    expect(arriveHub(bet.hub, bet.looks).focus).toBe('windows');
    const fresh = nextDay({ ...bet, looks: { fans: 4 } }, day);
    expect(fresh.bet.looks).toEqual({});
    expect(fresh.day.nextRace).toBe(1);
    expect(arriveHub(fresh.bet.hub, fresh.bet.looks).focus).toBe('windows');
  });

  it('Esc from the program returns to the track on Windows, whatever the track focus was, with the day untouched', () => {
    for (const via of [['Enter', 'ArrowRight', 'ArrowRight', 'Digit4', 'Escape'], ['Enter', 'ArrowDown', 'ArrowUp', 'Enter', 'Escape']]) {
      const f = new Flow();
      const before = JSON.stringify(f.day);
      f.run(via);
      expect(f.screen.at, via.join()).toBe('hub');
      expect(focusOf(f)).toBe('windows');
      expect(JSON.stringify(f.day)).toBe(before);
    }
  });

  it('"Esc: back" by click does the same', () => {
    const f = new Flow();
    const before = JSON.stringify(f.day);
    f.run([RESULT_NEXT_AT, WINDOWS_AT, [200, 228]]);
    expect(f.screen.at).toBe('hub');
    expect(focusOf(f)).toBe('windows');
    expect(JSON.stringify(f.day)).toBe(before);
  });

  it('with the ticket open, the first Esc closes the ticket, the second goes back; no money moves', () => {
    const f = new Flow();
    const before = JSON.stringify(f.day);
    f.run(['Enter', 'Enter', 'Digit3', 'Enter']);
    expect(f.screen).toMatchObject({ at: 'program', state: { mode: { kind: 'ticket' } } });
    f.key('Escape');
    expect(f.screen).toMatchObject({ at: 'program', state: { mode: { kind: 'choosing' }, focus: 2 } });
    f.key('Escape');
    expect(f.screen.at).toBe('hub');
    expect(focusOf(f)).toBe('windows');
    expect(JSON.stringify(f.day)).toBe(before);
  });
});

describe('TH9: the track is never shown after the last race or with a bankroll under the minimum bet', () => {
  it('after race 8 the day has ended, so the result leads to End of day, not the track', () => {
    let day = dayWith(10000);
    for (let r = 1; r <= 8; r++) day = settled(programOf(r), day, null, 1);
    expect(day.ended).toBe('lastRace');
    expect(new Flow(day).key('Enter').screen.at).toBe('endOfDay');
    expect(new Flow(day).click(...RESULT_NEXT_AT).screen.at).toBe('endOfDay');
  });

  it('a settled bankroll under $2 ends the day', () => {
    const day = settled(programOf(1), dayWith(300), { post: 3, dollars: 2 }, 1); // $3 less a lost $2 = $1
    expect(day.bankrollCents).toBe(100);
    expect(day.ended).toBe('broke');
    expect(new Flow(day).key('Enter').screen.at).toBe('endOfDay');
  });

  it('a bankroll of exactly $2 after settling can still bet, so the track shows', () => {
    const day = settled(programOf(1), dayWith(400), { post: 3, dollars: 2 }, 1);
    expect(day.bankrollCents).toBe(200);
    expect(day.ended).toBeNull();
    expect(new Flow(day).key('Enter').screen.at).toBe('hub');
  });

  it('a mid-day result goes to the track', () => {
    expect(new Flow().key('Enter').screen.at).toBe('hub');
  });
});
