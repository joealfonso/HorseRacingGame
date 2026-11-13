import { describe, expect, it } from 'vitest';
import { cardKey, initialCardState } from './cardScreen';
import { beatBegan, heldKeys, keyDown, keyState, keyUp, type KeyState } from './keys';
import { initialOrdersState, ordersKey } from './ordersScreen';
import { RESULT_CONFIRM_KEYS } from './resultScreen';
import { goToPost, newSession, pickHorse } from './session';
import { game } from './testkit';

// The key guard (IN2, DECISIONS.md): a key genuinely held when a screen opens does nothing
// until released, but a quick tap, whose keyup went to the old screen, never swallows the next
// press. `down` is what this screen saw go down; `stale` is what it was handed as held.
// What a browser sends: a first keydown (no repeat flag), flagged repeats while held, and a
// keyup. It never sends an unflagged keydown for a key still physically down.

const CONFIRM = ['Enter', 'Space', 'KeyZ'];

/** A screen's state after the key went down on it and the screen handed over at that moment. */
function tapAndHandOver(code: string, from: KeyState = keyState()): { acted: boolean; held: string[] } {
  const r = keyDown(from, code, false);
  // The scene switches inside the keydown handler: the keyup arrives after the old listener is gone.
  return { acted: r.act, held: heldKeys(r.state) };
}

describe('a quick tap is never lost across a hand-off', () => {
  const HAND_OFFS = ['Card to Orders', 'Orders to the race', 'the race to the result', 'the result to the Card', 'the pause box to the Card', 'boot to the Card'];

  it.each(HAND_OFFS)('%s: a key tapped (down and up before the new screen exists), then a fresh press, acts on that first press', (name) => {
    for (const code of [...CONFIRM, 'ArrowDown', 'Escape', 'Digit3']) {
      const tap = tapAndHandOver(code);
      expect(tap.acted, `${name} ${code}`).toBe(true);
      expect(tap.held).toEqual([code]); // handed over as held: the new screen never sees the keyup
      const next = keyDown(keyState(tap.held), code, false);
      expect(next.act, `${code} on the new screen`).toBe(true);
    }
  });

  it('a chain of six hand-offs on the same key loses no press', () => {
    let held: string[] = [];
    let acted = 0;
    for (let i = 0; i < 6; i++) {
      const tap = tapAndHandOver('Enter', keyState(held));
      if (tap.acted) acted++;
      held = tap.held;
    }
    expect(acted).toBe(6);
  });
});

describe('LP4 by quick taps: three taps take you from the result to the race', () => {
  const card = game.card;

  it.each(CONFIRM)('three taps of %s: result, card, Orders, and the race starts with no press lost', (key) => {
    expect(RESULT_CONFIRM_KEYS).toContain(key);
    const afterRace = goToPost(newSession(31), 5, { early: 'rateEarly', move: 'default', path: 'default' }).session;
    let taps = 0;
    // The result.
    const t1 = tapAndHandOver(key);
    expect(t1.acted).toBe(true);
    taps++;
    // The card: opens focused on last race's pick.
    const cardKeys = keyDown(keyState(t1.held), key, false);
    expect(cardKeys.act, 'the card takes its first press').toBe(true);
    taps++;
    const picked = cardKey(initialCardState(card, afterRace), key, card).outcome!;
    expect(picked.post).toBe(5);
    expect(initialOrdersState(afterRace, card, picked.post).orders).toEqual({ early: 'rateEarly', move: 'default', path: 'default' });
    const t2 = tapAndHandOver(key, keyState(t1.held));
    // Orders: opens on Go to the post.
    const ordersKeys = keyDown(keyState(t2.held), key, false);
    expect(ordersKeys.act, 'Orders takes its first press').toBe(true);
    taps++;
    const went = ordersKey(initialOrdersState(pickHorse(afterRace, picked.post), card, picked.post), key);
    expect(went.outcome).toEqual({ kind: 'go' });
    expect(taps).toBe(3);
  });

  it('never fewer than three: after two taps the race has not started', () => {
    const afterRace = goToPost(newSession(31), 5, { early: 'default', move: 'default', path: 'default' }).session;
    // Tap 1 leaves the result for the card, tap 2 leaves the card for Orders, which has not started the race.
    const cardOutcome = cardKey(initialCardState(game.card, afterRace), 'Enter', game.card).outcome;
    expect(cardOutcome).toEqual({ kind: 'pick', post: 5 });
    expect(ordersKey(initialOrdersState(afterRace, game.card, 5), 'Escape').outcome).toEqual({ kind: 'back' });
  });
});

describe('a key genuinely held across a hand-off', () => {
  it('flagged repeats never act, however many arrive; after the keyup the next press acts once', () => {
    for (const code of CONFIRM) {
      let s = keyState(heldKeys(keyDown(keyState(), code, false).state));
      for (let i = 0; i < 600; i++) {
        const r = keyDown(s, code, true);
        expect(r.act).toBe(false);
        s = r.state;
      }
      s = keyUp(s, code);
      const first = keyDown(s, code, false);
      expect(first.act, code).toBe(true);
      expect(keyDown(first.state, code, false).act).toBe(false); // no keyup between: not again
      expect(keyDown(first.state, code, true).act).toBe(false);
    }
  });

  it('the remaining known case, pinned on purpose: a repeat that arrives without the flag acts once, then no more', () => {
    // A key held across a hand-off whose first event on the new screen is an unflagged keydown
    // cannot be told from a quick tap, so it acts; every event after that is a repeat of a key
    // this screen has seen go down.
    let s = keyState(['Enter']);
    const first = keyDown(s, 'Enter', false);
    expect(first.act).toBe(true);
    s = first.state;
    for (let i = 0; i < 600; i++) {
      const r = keyDown(s, 'Enter', i % 2 === 0);
      expect(r.act).toBe(false);
      s = r.state;
    }
  });
});

describe('within one screen, a keydown without the flag and with no keyup in between does not act', () => {
  it('600 of them, for every kind of key', () => {
    for (const code of [...CONFIRM, 'ArrowUp', 'ArrowLeft', 'Escape', 'Digit5']) {
      let s = keyState();
      const first = keyDown(s, code, false);
      expect(first.act, code).toBe(true);
      s = first.state;
      let acted = 0;
      for (let i = 0; i < 600; i++) {
        const r = keyDown(s, code, false);
        if (r.act) acted++;
        s = r.state;
      }
      expect(acted, code).toBe(0);
      s = keyUp(s, code);
      expect(keyDown(s, code, false).act).toBe(true); // released, so a press acts again
    }
  });
});

describe('heldKeys: a handed-over key the screen never touches is handed on again', () => {
  it('Space held from the Card through Orders cannot start 4x in the race', () => {
    const card = keyDown(keyState(), 'Space', false); // pressed on the Card, still held
    expect(card.act).toBe(true);
    const orders = keyState(heldKeys(card.state)); // Orders never sees Space do anything
    expect(heldKeys(orders)).toEqual(['Space']);
    const race = keyState(heldKeys(orders));
    // Its repeats in the race: down, but held over, so the scene's 4x rule (down and not stale) is false.
    const r = keyDown(race, 'Space', true);
    expect(r.state.down.has('Space') && !r.state.stale.has('Space')).toBe(false);
    // A fresh press in the race does count.
    const fresh = keyDown(keyUp(r.state, 'Space'), 'Space', false);
    expect(fresh.state.down.has('Space') && !fresh.state.stale.has('Space')).toBe(true);
  });

  it('heldKeys is down plus stale, without repeats; keyup removes a key from both', () => {
    let s = keyState(['Space', 'Enter']);
    s = keyDown(s, 'ArrowUp', false).state;
    s = keyDown(s, 'Enter', false).state; // Enter acted: it is down now, and no longer held over
    expect([...heldKeys(s)].sort()).toEqual(['ArrowUp', 'Enter', 'Space']);
    s = keyUp(s, 'Space');
    expect([...heldKeys(s)].sort()).toEqual(['ArrowUp', 'Enter']);
    expect(heldKeys(keyState())).toEqual([]);
  });
});

describe('a fresh press of a handed-over key is no longer held over', () => {
  it('it leaves stale and joins down, so Space tapped on the Card and pressed again in the race starts 4x', () => {
    const race = keyState(['Space']); // a quick tap on the Orders screen, its keyup lost
    const r = keyDown(race, 'Space', false);
    expect(r.act).toBe(true);
    expect(r.state.stale.has('Space')).toBe(false);
    expect(r.state.down.has('Space')).toBe(true);
    expect(r.state.down.has('Space') && !r.state.stale.has('Space')).toBe(true); // the scene's 4x rule
    // The next repeats keep it down and never act.
    expect(keyDown(r.state, 'Space', true).state.stale.has('Space')).toBe(false);
  });
});

describe('beat changes inside the race', () => {
  it('a key held across a beat never acts, with or without the flag', () => {
    for (const flag of [false, true]) {
      let s = keyDown(keyState(), 'Enter', false).state; // pressed in the race: it skipped
      s = beatBegan(s);
      for (let i = 0; i < 100; i++) {
        const r = keyDown(s, 'Enter', flag);
        expect(r.act, `flag ${flag}`).toBe(false);
        s = r.state;
      }
      s = keyUp(s, 'Enter');
      expect(keyDown(s, 'Enter', false).act).toBe(true); // released: the next press acts
    }
  });

  it('a key tapped and released before the beat acts on its next press', () => {
    let s = keyDown(keyState(), 'Enter', false).state;
    s = keyUp(s, 'Enter');
    s = beatBegan(s);
    expect(keyDown(s, 'Enter', false).act).toBe(true);
  });

  it('a key held at the beat is held over: Space does not start 4x in the new beat', () => {
    const s = beatBegan(keyDown(keyState(), 'Space', false).state);
    expect(s.stale.has('Space')).toBe(true);
    expect(heldKeys(s)).toEqual(['Space']);
  });

  it('a key that goes down after the beat began acts', () => {
    expect(keyDown(beatBegan(keyState()), 'Enter', false).act).toBe(true);
  });
});

describe('a keyup for a key the screen never saw go down is harmless', () => {
  it('changes nothing else, and the next press acts', () => {
    const s0 = keyDown(keyState(['Space']), 'ArrowDown', false).state;
    const s1 = keyUp(s0, 'Enter');
    expect([...s1.down]).toEqual(['ArrowDown']);
    expect([...s1.stale]).toEqual(['Space']);
    expect(keyDown(s1, 'Enter', false).act).toBe(true);
    expect(() => keyUp(keyState(), 'KeyQ')).not.toThrow();
    expect(heldKeys(keyUp(keyState(), 'KeyQ'))).toEqual([]);
  });

  it('a keyup for a handed-over key (the quick tap\'s release arriving late) frees it', () => {
    const s = keyUp(keyState(['Enter']), 'Enter');
    expect(heldKeys(s)).toEqual([]);
    expect(keyDown(s, 'Enter', false).act).toBe(true);
  });
});
