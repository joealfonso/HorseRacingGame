import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cardKey, initialCardState } from './cardScreen';
import { REPEATING_KEYS, beatBegan, heldKeys, keyDown, keyState, keyUp, repeatsBetween } from './keys';
import { initialOrdersState, ordersKey } from './ordersScreen';
import { RESULT_CONFIRM_KEYS } from './resultScreen';
import { SEED_SPACE, goToPost, keepOrders, newSession, ordersFor, pickHorse, sameHorseAsLastRace, seedFor, type Orders, type Session } from './session';
import { deepFreeze, game, rd } from './testkit';

// The session loop (spec 3.2, 3.3, 4.9): LP1, LP4, IN2 across the hand-offs, and the held-arrow
// repeat. The session is plain data and every transition is a pure function, so each test
// freezes what it passes in: nothing may be changed in place.

const DEFAULTS: Orders = { early: 'default', move: 'default', path: 'default' };
const RATE: Orders = { early: 'rateEarly', move: 'saveForStretch', path: 'stayInside' };
const card = game.card;

describe('LP1: race n uses seed (first + n) mod 4294967296, spent when Go to the post is chosen', () => {
  it('a new day: race 0, post 1, no last race, nothing kept', () => {
    expect(newSession(77)).toEqual({ firstSeed: 77, raceNumber: 0, pickPost: 1, lastRace: null, drafts: {} });
  });

  it('Go to the post gives a ticket with this race\'s number and seed, and a session already on the next race', () => {
    const s0 = deepFreeze(newSession(1000));
    const { ticket, session } = goToPost(s0, 4, RATE);
    expect(ticket).toEqual({ raceNumber: 0, seed: 1000, post: 4, orders: RATE });
    expect(session.raceNumber).toBe(1);
    expect(session.firstSeed).toBe(1000);
    expect(s0.raceNumber).toBe(0); // the old session is untouched
  });

  it('ten races in a row use ten consecutive seeds, and the seed wraps at 2^32', () => {
    let s = newSession(4294967292);
    const seeds: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = goToPost(s, 1 + (i % 8), DEFAULTS);
      seeds.push(r.ticket.seed);
      expect(r.ticket.raceNumber).toBe(i);
      s = r.session;
    }
    expect(seeds).toEqual([4294967292, 4294967293, 4294967294, 4294967295, 0, 1, 2, 3, 4, 5]);
    expect(seedFor(5, SEED_SPACE)).toBe(5);
  });

  it('a race abandoned from the pause box has still spent its seed: Back to card carries the session Go to the post made', () => {
    // The pause box's Back to card hands the card the session the race was started with,
    // which Go to the post had already advanced (the scene does exactly that; see PA1).
    const s0 = newSession(500);
    const { ticket, session } = goToPost(s0, 2, DEFAULTS);
    const backAtCard = session; // abandoned: nothing else happens to the session
    const again = goToPost(backAtCard, 2, DEFAULTS);
    expect(again.ticket.seed).toBe(ticket.seed + 1); // never the abandoned race's seed again
    expect(again.ticket.raceNumber).toBe(1);
  });

  it('peeking and rerunning is impossible: every Go to the post gets a new seed whatever came between', () => {
    let s = newSession(9);
    const seen = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const r = goToPost(s, 1 + (i % 3), DEFAULTS);
      expect(seen.has(r.ticket.seed)).toBe(false);
      seen.add(r.ticket.seed);
      s = i % 2 === 0 ? r.session : keepOrders(r.session, 3, RATE); // watched, or went back and changed things
    }
  });

  it('the race scene runs the ticket and spends nothing itself (a read of the scene)', () => {
    const src = readFileSync(new URL('../scenes/RaceScene.ts', import.meta.url), 'utf8');
    expect(src).toContain('this.ticket.seed');
    expect(src).not.toMatch(/seedFor\(/);
    expect(src).not.toMatch(/raceNumber\s*\+\s*1|nextRace\(/);
    const orders = readFileSync(new URL('../scenes/OrdersScene.ts', import.meta.url), 'utf8');
    expect(orders).toContain('goToPost(');
  });
});

describe('the same horse, a new horse, kept changes', () => {
  it('the same horse comes back with last race\'s orders and focus on Go to the post', () => {
    const { session } = goToPost(newSession(1), 6, RATE);
    expect(sameHorseAsLastRace(session, 6)).toBe(true);
    expect(ordersFor(session, card, 6)).toEqual(RATE);
    const o = initialOrdersState(session, card, 6);
    expect(o.orders).toEqual(RATE);
    expect(o.focus).toBe(3); // Go to the post
  });

  it('a new horse starts at Rider\'s call, with focus on Early', () => {
    const { session } = goToPost(newSession(1), 6, RATE);
    expect(sameHorseAsLastRace(session, 2)).toBe(false);
    expect(ordersFor(session, card, 2)).toEqual(DEFAULTS);
    expect(initialOrdersState(session, card, 2)).toMatchObject({ post: 2, focus: 0, orders: DEFAULTS });
    expect(ordersFor(newSession(1), card, 6)).toEqual(DEFAULTS);
  });

  it('a new horse that has non-default orders in card.json starts at those', () => {
    const c = structuredClone(card);
    c.horses.find((h) => h.post === 7)!.instructions = { early: 'rateEarly', move: 'default', path: 'stayInside' };
    expect(ordersFor(newSession(1), c, 7)).toEqual({ early: 'rateEarly', move: 'default', path: 'stayInside' });
    // Last race's horse keeps last race's orders over its card.json ones.
    const { session } = goToPost(newSession(1), 7, DEFAULTS);
    expect(ordersFor(session, c, 7)).toEqual(DEFAULTS);
  });

  it('changes made before backing out are kept, for that horse, and come back when Orders is opened again', () => {
    const s = keepOrders(newSession(3), 5, RATE);
    expect(s.pickPost).toBe(5);
    expect(ordersFor(s, card, 5)).toEqual(RATE);
    expect(initialOrdersState(s, card, 5).orders).toEqual(RATE);
    expect(ordersFor(s, card, 4)).toEqual(DEFAULTS); // another horse is not affected
    // And they are what Go to the post then runs.
    expect(goToPost(s, 5, ordersFor(s, card, 5)).ticket.orders).toEqual(RATE);
  });

  it('the orders a ticket carries are copies: changing them later changes nothing in the session', () => {
    const o = { ...RATE };
    const { ticket, session } = goToPost(newSession(1), 3, o);
    o.early = 'default';
    expect(ticket.orders).toEqual(RATE);
    expect(session.lastRace!.orders).toEqual(RATE);
    const kept = keepOrders(newSession(1), 3, o);
    o.path = 'default';
    expect(ordersFor(kept, card, 3).path).toBe('stayInside'); // kept as it was when backed out
  });

  it('the pick the card made is the pick Orders opens for, and it comes back focused on it', () => {
    const picked = pickHorse(newSession(1), 6);
    expect(picked.pickPost).toBe(6);
    expect(initialCardState(card, picked).focus).toBe([...card.horses].sort((a, b) => a.post - b.post).findIndex((h) => h.post === 6));
  });

  it('no session function changes the session it is given (everything frozen)', () => {
    const s = deepFreeze(newSession(8));
    const kept = deepFreeze(keepOrders(s, 2, RATE));
    expect(() => {
      pickHorse(s, 3);
      keepOrders(kept, 4, DEFAULTS);
      goToPost(kept, 2, RATE);
      ordersFor(kept, card, 2);
      sameHorseAsLastRace(kept, 2);
      initialOrdersState(kept, card, 2);
      initialCardState(card, kept);
    }).not.toThrow();
    expect(s).toEqual(newSession(8));
  });
});

describe('LP4: from the result to the next gate is three confirm presses when nothing changes', () => {
  /** The loop as the scenes run it, key by key, counting presses. Returns the presses used and the ticket. */
  function loop(confirm: string, s: Session) {
    let presses = 0;
    // Result: Next race.
    expect(RESULT_CONFIRM_KEYS).toContain(confirm);
    presses++;
    // Card: opens focused on last race's pick; the confirm key picks it.
    const cardState = initialCardState(card, s);
    const picked = cardKey(cardState, confirm, card);
    presses++;
    expect(picked.outcome).not.toBeNull();
    const post = picked.outcome!.post;
    const s2 = pickHorse(s, post);
    // Orders: opens on Go to the post with last race's orders; the confirm key starts the race.
    const ord = initialOrdersState(s2, card, post);
    const went = ordersKey(ord, confirm);
    presses++;
    expect(went.outcome).toEqual({ kind: 'go' });
    return { presses, ...goToPost(s2, post, went.state.orders) };
  }

  it('exactly three presses with Enter, Space or Z, for every horse as last race\'s pick, the same horse and orders going again', () => {
    for (const confirm of ['Enter', 'Space', 'KeyZ']) {
      for (const h of card.horses) {
        const afterRace = goToPost(newSession(11), h.post, RATE).session;
        const r = loop(confirm, afterRace);
        expect(r.presses, `${confirm} post ${h.post}`).toBe(3);
        expect(r.ticket.post).toBe(h.post);
        expect(r.ticket.orders).toEqual(RATE);
        expect(r.ticket.raceNumber).toBe(1);
        expect(r.ticket.seed).toBe(12);
      }
    }
  });

  it('it is never two: the same keys on the first race need more, since nothing is chosen yet', () => {
    // The first race: post 1 is focused on the card, and Orders opens on Early, not Go to the post.
    const s = newSession(5);
    const picked = cardKey(initialCardState(card, s), 'Enter', card).outcome!;
    const ord = initialOrdersState(pickHorse(s, picked.post), card, picked.post);
    expect(ordersKey(ord, 'Enter').outcome).toBeNull(); // Enter on Early only cycles it
  });

  // Updated on purpose (key guard fix, DECISIONS.md): this pinned the bug itself. It expected a
  // fresh press on a screen opened with the key handed over as held to be ignored, so a quick
  // tap on the Card (Enter down and up before Orders listens) lost the next Enter on "Go to the
  // post". The rule now: a held Enter (flagged repeats) still must not count, and a fresh Enter
  // must.
  it('the result and the card each take their one press from held keys too: a held Enter does not count, a fresh one does (IN2)', () => {
    const k = keyDown(keyState(), 'Enter', false); // pressed on the result: act
    expect(k.act).toBe(true);
    // The card opens with Enter still physically held: its repeats do nothing.
    let onCard = keyState(heldKeys(k.state));
    for (let i = 0; i < 10; i++) {
      const r = keyDown(onCard, 'Enter', true);
      expect(r.act).toBe(false);
      onCard = r.state;
    }
    // Let go, then one press: acts, and the next screen likewise ignores the still-held repeats.
    const pressed = keyDown(keyUp(onCard, 'Enter'), 'Enter', false);
    expect(pressed.act).toBe(true);
    expect(keyDown(keyState(heldKeys(pressed.state)), 'Enter', true).act).toBe(false);
    // A quick tap instead (up before the card opened): the card's first fresh press acts.
    expect(keyDown(keyState(heldKeys(k.state)), 'Enter', false).act).toBe(true);
  });
});

describe('IN2 across the hand-offs, and held arrows', () => {
  // Updated on purpose (same fix): a key genuinely held when a screen opens arrives as flagged
  // repeats, which never act; the old test also sent an unflagged event and expected it ignored,
  // which is exactly the quick-tap case that must act. Released, the next press acts once.
  it('a key held when a screen opens does nothing until released, then acts once', () => {
    for (const code of ['Enter', 'Space', 'KeyZ', 'ArrowDown', 'Escape', 'Digit3']) {
      let s = keyState([code]);
      for (const repeat of [true, true, true]) {
        const r = keyDown(s, code, repeat);
        expect(r.act, code).toBe(false);
        s = r.state;
      }
      s = keyUp(s, code);
      expect(keyDown(s, code, false).act, code).toBe(true);
    }
  });

  it('only the held key is ignored: others act at once', () => {
    const s = keyState(['Enter']);
    expect(keyDown(s, 'ArrowDown', false).act).toBe(true);
    expect(keyDown(s, 'Digit4', false).act).toBe(true);
  });

  it('auto-repeat events never act by themselves, however long a fresh key is held, arrows included', () => {
    for (const code of REPEATING_KEYS) {
      let s = keyDown(keyState(), code, false).state;
      for (let i = 0; i < 50; i++) {
        const r = keyDown(s, code, true);
        expect(r.act).toBe(false);
        s = r.state;
      }
    }
  });

  // Updated on purpose (same fix): the scenes now hand on `heldKeys(...)`, down plus handed-over,
  // so a key this screen never touched is handed on again. What it protects is unchanged: every
  // hand-off passes the held keys on.
  it('every hand-off passes the keys down to the next screen (a read of the scenes)', () => {
    const scene = (f: string) => readFileSync(new URL(`../scenes/${f}`, import.meta.url), 'utf8');
    expect(scene('menuKeys.ts')).toMatch(/return heldKeys\(this\.keys\)/);
    expect(scene('CardScene.ts')).toMatch(/held: this\.keys\.down\(\)/); // card -> orders
    expect(scene('OrdersScene.ts')).toMatch(/held: this\.keys\.down\(\)/); // orders -> race or back to the card
    expect(scene('ResultScene.ts')).toMatch(/held: heldKeys\(this\.keys\)/); // result -> card
    expect(scene('BootScene.ts')).toMatch(/held: heldKeys\(this\.keys\)/); // boot -> card
    const race = scene('RaceScene.ts');
    const back = race.slice(race.indexOf('private backToCard'), race.indexOf('private bindKeys'));
    expect(back).toMatch(/held: heldKeys\(this\.keys\)/); // pause: back to card
    expect(race).toMatch(/result: this\.setup\.result[^}]*held: heldKeys\(this\.keys\)/); // the race to the result
    for (const f of ['CardScene.ts', 'OrdersScene.ts']) expect(scene(f)).toContain('new MenuKeys(this, data.held');
    expect(scene('ResultScene.ts')).toMatch(/keyState\(data\.held/);
    expect(scene('RaceScene.ts')).toMatch(/keyState\(data\.held/);
  });

  it('a beat change makes a held key stale again (the race\'s beats)', () => {
    const s = beatBegan(keyDown(keyState(), 'Enter', false).state);
    expect(keyDown(s, 'Enter', false).act).toBe(false);
  });

  it('the repeat settings are the spec\'s: 400 ms before the first repeat, then every 120 ms', () => {
    expect(rd.menus.repeatDelayMs.value).toBe(400);
    expect(rd.menus.repeatEveryMs.value).toBe(120);
  });

  describe('repeatsBetween with the data\'s delay and rate (milliseconds, whole numbers)', () => {
    const D = rd.menus.repeatDelayMs.value;
    const E = rd.menus.repeatEveryMs.value;
    const total = (t: number) => repeatsBetween(0, t, D, E);

    it('nothing fires before the delay, the first repeat at 400 ms, then one every 120 ms', () => {
      expect(total(0)).toBe(0);
      expect(total(399)).toBe(0);
      expect(total(400)).toBe(1);
      expect(total(519)).toBe(1);
      expect(total(520)).toBe(2);
      expect(total(639)).toBe(2);
      expect(total(640)).toBe(3);
      expect(total(2000)).toBe(1 + Math.floor((2000 - 400) / 120));
    });

    it('the count does not depend on how the time is cut into frames', () => {
      for (const step of [1, 7, 16, 17, 33, 50, 119, 120, 121, 400, 1000]) {
        let t = 0;
        let n = 0;
        while (t < 3000) { n += repeatsBetween(t, t + step, D, E); t += step; }
        expect(n, `step ${step}`).toBe(total(t));
      }
    });

    it('never negative, and a frame that goes nowhere fires nothing', () => {
      expect(repeatsBetween(500, 500, D, E)).toBe(0);
      expect(repeatsBetween(900, 100, D, E)).toBe(0);
    });

    it('follows the numbers it is given, not constants', () => {
      expect(repeatsBetween(0, 1000, 200, 100)).toBe(1 + 8);
      expect(repeatsBetween(0, 199, 200, 100)).toBe(0);
    });
  });

  it('only the four arrows repeat; confirm, back and digit keys do not', () => {
    expect([...REPEATING_KEYS].sort()).toEqual(['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp']);
  });
});
