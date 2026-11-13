import { describe, expect, it } from 'vitest';
import { INSTRUCTIONS, type GameData } from '../data/schema';
import { validateData } from '../data/validate';
import { wrapWords } from '../data/template';
import { runRace } from '../sim/runRace';
import {
  ORDERS_ITEMS, cycleOrder, initialOrdersState, orderValues, ordersKey, ordersScreen, trainerFrame, trainerLine, trainerLines, type OrdersState,
} from './ordersScreen';
import { raceInput } from './raceInput';
import { goToPost, newSession, type Orders } from './session';
import { cardScreen } from './cardScreen';
import { CLOTH_BY_POST, ENTRY_BAND_ROWS, cellOf, deepFreeze, expectedSpans, game, paintRects, pixelAt, rd, shippedRaceDay, yellowSpans } from './testkit';

// Orders, the paddock (spec 4.2): OR1, OR2, OR3, the screen's layout, the trainer's lines
// and the coffee idle. Expected strings are the spec's table, not read from the code.

const SLOTS = ['early', 'move', 'path'] as const;
const DEFAULTS: Orders = { early: 'default', move: 'default', path: 'default' };

// Spec 4.2's table: label and trainer line for every value of every slot.
const LABEL: Record<string, Record<string, string>> = {
  early: { default: "Rider's call", rateEarly: 'Rate early' },
  move: { default: "Rider's call", moveAtThreeEighths: 'Move at the 3/8', saveForStretch: 'Save for stretch' },
  path: { default: "Rider's call", stayInside: 'Stay inside' },
};
const TRAINER: Record<string, Record<string, string>> = {
  early: { default: 'Let this one break and find its own rhythm.', rateEarly: 'Take a hold early. Let the speed horses argue up front.' },
  move: {
    default: 'Ask when it feels right. You know this one.',
    moveAtThreeEighths: "Go at the 3/8 pole. It's a long run home, so mean it.",
    saveForStretch: 'Sit chilly till the stretch. Then ask for everything.',
  },
  path: { default: 'Take whatever path opens. Going around is fine.', stayInside: 'Hug the rail. Save the ground and hope it opens.' },
};
const GO_LINE = "Good luck. I'll be at the rail with the coffee.";
const BACK_LINE = 'Want a different horse? No hard feelings.';

const open = (orders: Orders = DEFAULTS, focus = 0, post = 8): OrdersState => ({ post, focus, orders });
const press = (s: OrdersState, ...codes: string[]) => codes.reduce((st, code) => ordersKey(st, code).state, s);

describe('OR1: the values offered are exactly INSTRUCTIONS', () => {
  it.each(SLOTS)('%s offers the values of INSTRUCTIONS, in its order', (slot) => {
    expect(orderValues(slot)).toEqual([...INSTRUCTIONS[slot]]);
    expect(orderValues(slot)[0]).toBe('default');
  });

  it('there are exactly the three slots INSTRUCTIONS has, 12 combinations in all', () => {
    expect(Object.keys(INSTRUCTIONS).sort()).toEqual(['early', 'move', 'path']);
    expect(INSTRUCTIONS.early.length * INSTRUCTIONS.move.length * INSTRUCTIONS.path.length).toBe(12);
  });

  it('a label and a trainer line exist in data for every value, and are the spec\'s words', () => {
    for (const slot of SLOTS) {
      for (const v of INSTRUCTIONS[slot]) {
        expect((rd.copy.paddock.values[slot] as Record<string, string>)[v], `${slot}.${v}`).toBe(LABEL[slot][v]);
        expect((rd.copy.paddock.trainer[slot] as Record<string, string>)[v], `${slot}.${v}`).toBe(TRAINER[slot][v]);
      }
      // No label for a value INSTRUCTIONS does not have.
      expect(Object.keys(rd.copy.paddock.values[slot]).sort()).toEqual([...INSTRUCTIONS[slot]].sort());
      expect(Object.keys(rd.copy.paddock.trainer[slot]).sort()).toEqual([...INSTRUCTIONS[slot]].sort());
    }
    expect(rd.copy.paddock.trainer.go).toBe(GO_LINE);
    expect(rd.copy.paddock.trainer.back).toBe(BACK_LINE);
  });

  it('cycling visits every value of a slot in INSTRUCTIONS order, wraps, and changes nothing else', () => {
    for (const slot of SLOTS) {
      const seen: string[] = [];
      let o = DEFAULTS;
      for (let i = 0; i < INSTRUCTIONS[slot].length; i++) {
        seen.push(o[slot]);
        o = cycleOrder(o, slot, 1);
        for (const other of SLOTS.filter((x) => x !== slot)) expect(o[other]).toBe('default');
      }
      expect(seen).toEqual([...INSTRUCTIONS[slot]]);
      expect(o).toEqual(DEFAULTS); // wrapped
      expect(cycleOrder(DEFAULTS, slot, -1)[slot]).toBe(INSTRUCTIONS[slot][INSTRUCTIONS[slot].length - 1]);
    }
  });

  it('cycling does not mutate the orders it is given', () => {
    const frozen = Object.freeze({ ...DEFAULTS });
    expect(() => cycleOrder(frozen, 'move', 1)).not.toThrow();
  });
});

describe('OR2: the race input', () => {
  const combos: Orders[] = [];
  for (const early of INSTRUCTIONS.early) for (const move of INSTRUCTIONS.move) for (const path of INSTRUCTIONS.path) combos.push({ early, move, path });

  it('changes only the picked horse\'s instructions, for every combination of the three orders', () => {
    expect(combos).toHaveLength(12);
    for (const orders of combos) {
      const input = raceInput(game, 6, orders);
      input.card.horses.forEach((h) => {
        const before = game.card.horses.find((x) => x.id === h.id)!;
        if (h.post === 6) expect(h.instructions).toEqual(orders);
        else expect(h, h.id).toEqual(before);
      });
      // The rest of the data is the same.
      expect(input.race).toEqual(game.race);
      expect(input.track).toEqual(game.track);
      expect(input.tuning).toEqual(game.tuning);
    }
  });

  it('leaves the other horses on their card.json orders, whatever those are', () => {
    const g = structuredClone(game);
    g.card.horses.find((h) => h.post === 2)!.instructions = { early: 'rateEarly', move: 'saveForStretch', path: 'stayInside' };
    const input = raceInput(g, 7, { early: 'default', move: 'moveAtThreeEighths', path: 'default' });
    expect(input.card.horses.find((h) => h.post === 2)!.instructions).toEqual({ early: 'rateEarly', move: 'saveForStretch', path: 'stayInside' });
    // And the picked horse's own card orders are replaced, not merged.
    g.card.horses.find((h) => h.post === 7)!.instructions = { early: 'rateEarly', move: 'default', path: 'stayInside' };
    expect(raceInput(g, 7, DEFAULTS).card.horses.find((h) => h.post === 7)!.instructions).toEqual(DEFAULTS);
  });

  it('does not mutate the loaded card: with everything deep-frozen it still builds, and the original is unchanged', () => {
    const frozen = deepFreeze(structuredClone(game));
    const before = JSON.stringify(frozen);
    for (const orders of combos) expect(() => raceInput(frozen, 3, orders)).not.toThrow();
    expect(JSON.stringify(frozen)).toBe(before);
    // The result does not share the card with the original.
    const input = raceInput(frozen, 3, combos[5]);
    expect(input.card).not.toBe(frozen.card);
    expect(input.card.horses[0]).not.toBe(frozen.card.horses[0]);
  });

  it('passes validateData', () => {
    for (const orders of combos) {
      const input = raceInput(game, 4, orders);
      expect(() => validateData({ track: input.track, race: input.race, card: input.card, tuning: input.tuning })).not.toThrow();
    }
  });

  it('is passed through validateData again: an order INSTRUCTIONS does not offer is refused', () => {
    expect(() => raceInput(game, 3, { early: 'shout', move: 'default', path: 'default' } as unknown as Orders)).toThrow(/early/);
    expect(() => raceInput(game, 3, { early: 'default', move: 'default' } as unknown as Orders)).toThrow();
  });

  it('a post that is not on the card is an error, not a silent no-op', () => {
    expect(() => raceInput(game, 9, DEFAULTS)).toThrow(/post 9/);
    expect(() => raceInput(game, 0, DEFAULTS)).toThrow();
  });

  it('gives the same result bytes from runRace as a hand-written card with the same content, for all 12 combinations', () => {
    for (const [i, orders] of combos.entries()) {
      const post = (i % 8) + 1;
      const seed = 100 + i;
      const hand: GameData = structuredClone(game);
      hand.card.horses.find((h) => h.post === post)!.instructions = { early: orders.early, move: orders.move, path: orders.path };
      expect(JSON.stringify(runRace(raceInput(game, post, orders), seed)), `${JSON.stringify(orders)} post ${post}`).toBe(JSON.stringify(runRace(hand, seed)));
    }
  });

  it('default orders on the shipped card give exactly the plain shipped race, and real orders change the echo', () => {
    expect(JSON.stringify(runRace(raceInput(game, 5, DEFAULTS), 31))).toBe(JSON.stringify(runRace(game, 31)));
    const r = runRace(raceInput(game, 5, { early: 'rateEarly', move: 'saveForStretch', path: 'stayInside' }), 31);
    expect(r.inputs.card.horses.find((h) => h.post === 5)!.instructions).toEqual({ early: 'rateEarly', move: 'saveForStretch', path: 'stayInside' });
  });
});

describe('OR3: focus and keys on the Orders screen', () => {
  it('the focus order is Early, Move, Path, Go to the post, Back to card', () => {
    expect([...ORDERS_ITEMS]).toEqual(['early', 'move', 'path', 'post', 'back']);
  });

  it('Down walks that order and wraps; Up walks it backward and wraps', () => {
    let s = open();
    const down: number[] = [];
    for (let i = 0; i < 6; i++) { down.push(s.focus); s = press(s, 'ArrowDown'); }
    expect(down).toEqual([0, 1, 2, 3, 4, 0]);
    s = open();
    const up: number[] = [];
    for (let i = 0; i < 6; i++) { up.push(s.focus); s = press(s, 'ArrowUp'); }
    expect(up).toEqual([0, 4, 3, 2, 1, 0]);
  });

  it('Left and Right cycle the focused slot and wrap, for every slot, and touch no other slot', () => {
    for (const [focus, slot] of SLOTS.entries()) {
      const vals = INSTRUCTIONS[slot];
      let s = open(DEFAULTS, focus);
      for (let i = 1; i <= vals.length; i++) {
        s = press(s, 'ArrowRight');
        expect(s.orders[slot], `${slot} right ${i}`).toBe(vals[i % vals.length]);
      }
      expect(s.orders).toEqual(DEFAULTS);
      s = press(s, 'ArrowLeft');
      expect(s.orders[slot]).toBe(vals[vals.length - 1]);
      for (const other of SLOTS.filter((x) => x !== slot)) expect(s.orders[other]).toBe('default');
      expect(s.focus).toBe(focus);
    }
  });

  it('Left and Right do nothing on Go to the post and Back to card', () => {
    for (const focus of [3, 4]) {
      for (const code of ['ArrowLeft', 'ArrowRight']) {
        const r = ordersKey(open(DEFAULTS, focus), code);
        expect(r.state).toEqual(open(DEFAULTS, focus));
        expect(r.outcome).toBeNull();
      }
    }
  });

  it('Enter, Space and Z on a slot cycle it forward and do not leave the screen', () => {
    for (const code of ['Enter', 'Space', 'KeyZ']) {
      for (const [focus, slot] of SLOTS.entries()) {
        const r = ordersKey(open(DEFAULTS, focus), code);
        expect(r.outcome).toBeNull();
        expect(r.state.orders[slot]).toBe(INSTRUCTIONS[slot][1]);
        expect(r.state.focus).toBe(focus);
      }
    }
  });

  it('Enter on Go to the post starts the race; Enter on Back to card goes back', () => {
    for (const code of ['Enter', 'Space', 'KeyZ']) {
      expect(ordersKey(open(DEFAULTS, 3), code).outcome).toEqual({ kind: 'go' });
      expect(ordersKey(open(DEFAULTS, 4), code).outcome).toEqual({ kind: 'back' });
    }
  });

  it('Esc, Backspace and X go back from anywhere, and the changes made so far come with the state', () => {
    for (const code of ['Escape', 'Backspace', 'KeyX']) {
      for (let focus = 0; focus < 5; focus++) {
        const changed: Orders = { early: 'rateEarly', move: 'saveForStretch', path: 'stayInside' };
        const r = ordersKey(open(changed, focus), code);
        expect(r.outcome, `${code} at ${focus}`).toEqual({ kind: 'back' });
        expect(r.state.orders).toEqual(changed);
      }
    }
  });

  it('other keys do nothing', () => {
    for (const code of ['KeyP', 'Digit3', 'Tab', 'KeyQ']) {
      const r = ordersKey(open(DEFAULTS, 1), code);
      expect(r.outcome).toBeNull();
      expect(r.state).toEqual(open(DEFAULTS, 1));
    }
  });

  it('initial focus is Go to the post for the same horse as last race, Early otherwise', () => {
    const afterRace = goToPost(newSession(5), 6, { early: 'rateEarly', move: 'default', path: 'default' }).session;
    expect(ORDERS_ITEMS[initialOrdersState(afterRace, game.card, 6).focus]).toBe('post');
    expect(ORDERS_ITEMS[initialOrdersState(afterRace, game.card, 3).focus]).toBe('early');
    expect(ORDERS_ITEMS[initialOrdersState(newSession(5), game.card, 6).focus]).toBe('early');
  });
});

describe('the trainer\'s line', () => {
  it('is the spec\'s line for the focused slot\'s current value, for every value', () => {
    for (const [focus, slot] of SLOTS.entries()) {
      for (const v of INSTRUCTIONS[slot]) {
        const s = open({ ...DEFAULTS, [slot]: v }, focus);
        expect(trainerLine(rd, s), `${slot} ${v}`).toBe(TRAINER[slot][v]);
      }
    }
  });

  it('is the go line on Go to the post and the back line on Back to card', () => {
    expect(trainerLine(rd, open(DEFAULTS, 3))).toBe(GO_LINE);
    expect(trainerLine(rd, open(DEFAULTS, 4))).toBe(BACK_LINE);
  });

  it('wraps at 28 characters into at most 3 lines, losing no word, for every item and value', () => {
    const all: [OrdersState, string][] = [];
    for (const [focus, slot] of SLOTS.entries()) for (const v of INSTRUCTIONS[slot]) all.push([open({ ...DEFAULTS, [slot]: v }, focus), TRAINER[slot][v]]);
    all.push([open(DEFAULTS, 3), GO_LINE], [open(DEFAULTS, 4), BACK_LINE]);
    for (const [s, line] of all) {
      const lines = trainerLines(rd, s);
      expect(lines.length).toBeGreaterThanOrEqual(1);
      expect(lines.length).toBeLessThanOrEqual(3);
      for (const l of lines) expect(l.length, l).toBeLessThanOrEqual(28);
      expect(lines.join(' ')).toBe(line);
    }
  });

  it('the spec\'s own example: Save for stretch is "Sit chilly till the stretch." then "Then ask for everything."', () => {
    expect(trainerLines(rd, open({ ...DEFAULTS, move: 'saveForStretch' }, 1))).toEqual(['Sit chilly till the stretch.', 'Then ask for everything.']);
  });

  it('wrapWords breaks greedily on spaces at the width, keeps a long word whole, and drops stray spaces', () => {
    expect(wrapWords('aaa bbb ccc', 7)).toEqual(['aaa bbb', 'ccc']);
    expect(wrapWords('aaa bbb ccc', 6)).toEqual(['aaa', 'bbb', 'ccc']);
    expect(wrapWords('aaa  bbb', 20)).toEqual(['aaa bbb']);
    expect(wrapWords('abcdefghij kl', 4)).toEqual(['abcdefghij', 'kl']);
    expect(wrapWords('', 10)).toEqual([]);
    expect(wrapWords('exactly eight chars', 8)).toEqual(['exactly', 'eight', 'chars']);
    expect(wrapWords('12345678 12345678', 17)).toEqual(['12345678 12345678']);
    expect(wrapWords('12345678 12345678', 16)).toEqual(['12345678', '12345678']);
  });
});

describe('the coffee idle: frame 0 for the cup-down seconds, frame 1 for the cup-up seconds, repeating', () => {
  const down = rd.paddock.cupDownSeconds.value;
  const up = rd.paddock.cupUpSeconds.value;

  it('the data is the spec\'s: 1.5 s down, 0.5 s up', () => {
    expect([down, up]).toEqual([1.5, 0.5]);
  });

  it('frame 0 from 0 to 1.5 s, frame 1 from 1.5 to 2.0 s, then again', () => {
    for (const [t, frame] of [[0, 0], [0.7, 0], [1.49, 0], [1.5, 1], [1.99, 1], [2.0, 0], [3.49, 0], [3.5, 1], [3.99, 1], [4.0, 0], [41.4, 0], [41.7, 1], [43.6, 1], [43.4, 0]] as const) {
      expect(trainerFrame(t, down, up), `t ${t}`).toBe(frame);
    }
  });

  it('follows the data: other seconds move the switch points', () => {
    expect(trainerFrame(0.9, 1, 3)).toBe(0);
    expect(trainerFrame(1.1, 1, 3)).toBe(1);
    expect(trainerFrame(3.9, 1, 3)).toBe(1);
    expect(trainerFrame(4.1, 1, 3)).toBe(0);
    expect(trainerFrame(-1, down, up)).toBe(0);
  });
});

describe('the Orders screen draws the spec\'s layout', () => {
  const s = ordersScreen(game, rd, open(DEFAULTS, 0, 8));
  const at = (text: string) => s.texts.find((t) => t.text === text);

  it('the orders box: the title at y64, three slot rows at y78, 90, 102, Go at y116, Back at y127', () => {
    expect(at('Orders')).toMatchObject({ x: 8, y: 64 });
    for (const [i, y] of [78, 90, 102].entries()) {
      const label = at(['Early', 'Move', 'Path'][i])!;
      expect([label.x, label.y]).toEqual([20, y]);
      expect(s.texts.find((t) => t.x === 84 && t.y === y)!.text).toBe("Rider's call");
    }
    expect(at('Go to the post')).toMatchObject({ x: 20, y: 116 });
    expect(at('Back to card')).toMatchObject({ x: 20, y: 127 });
  });

  it('values at x84 inside 16 characters, "<" at x72 and ">" at x216 only on the focused slot', () => {
    const o: Orders = { early: 'rateEarly', move: 'saveForStretch', path: 'stayInside' };
    for (const focus of [0, 1, 2]) {
      const sc = ordersScreen(game, rd, open(o, focus));
      const y = [78, 90, 102][focus];
      // Rewritten on purpose (spec 4.2, art-director's rulings): the orders list is Ink type on paper, so "<" and ">" are Ink, not Bone.
      expect(sc.texts.filter((t) => t.text === '<')).toEqual([{ text: '<', x: 72, y, color: 'Ink' }]);
      expect(sc.texts.filter((t) => t.text === '>')).toEqual([{ text: '>', x: 216, y, color: 'Ink' }]);
      expect(sc.texts.find((t) => t.x === 84 && t.y === 78)!.text).toBe('Rate early');
      expect(sc.texts.find((t) => t.x === 84 && t.y === 90)!.text).toBe('Save for stretch');
      expect(sc.texts.find((t) => t.x === 84 && t.y === 102)!.text).toBe('Stay inside');
    }
    for (const focus of [3, 4]) {
      const sc = ordersScreen(game, rd, open(o, focus));
      expect(sc.texts.some((t) => t.text === '<' || t.text === '>')).toBe(false);
    }
    for (const slot of SLOTS) for (const l of Object.values(LABEL[slot])) expect(l.length).toBeLessThanOrEqual(16);
  });

  it('the cursor sits at x8 on the focused row', () => {
    [78, 90, 102, 116, 127].forEach((y, focus) => expect(ordersScreen(game, rd, open(DEFAULTS, focus)).cursor).toEqual({ x: 8, y }));
  });

  it('the dialog box: the trainer\'s line at x8, y200, 210, 220, 28 characters a line', () => {
    const sc = ordersScreen(game, rd, open({ ...DEFAULTS, move: 'saveForStretch' }, 1));
    const dialog = sc.texts.filter((t) => t.y >= 200);
    expect(dialog.map((t) => [t.text, t.x, t.y])).toEqual([['Sit chilly till the stretch.', 8, 200], ['Then ask for everything.', 8, 210]]);
    for (const t of dialog) expect(t.text.length).toBeLessThanOrEqual(28);
  });

  // Updated on purpose (art-director's review of the running screen, spec 4.2): the fence row is
  // on top. The rows are now rail (y144-159, odd tiles flipped as before), then ground at y160-175
  // and y176-191. The planks used to cross the trainer's face and sit on the horse's back line.
  it('the paddock strip: rail, ground, ground in three 16 px rows from y144, sixteen tiles each, the rail flipping odd tiles', () => {
    expect(s.tiles).toHaveLength(48);
    for (const [row, slot] of ['art.paddock.rail', 'art.paddock.ground', 'art.paddock.ground'].entries()) {
      const tiles = s.tiles.filter((t) => t.y === 144 + 16 * row);
      expect(tiles.map((t) => t.x)).toEqual(Array.from({ length: 16 }, (_v, i) => i * 16));
      expect(tiles.every((t) => t.slot === slot)).toBe(true);
      expect(tiles.map((t) => t.flip)).toEqual(Array.from({ length: 16 }, (_v, i) => row === 0 && i % 2 === 1));
    }
  });

  it('the trainer stands at x24 y164 and your horse at x48 y164', () => {
    expect(s.trainer).toEqual({ x: 24, y: 164 });
    expect(s.horse).toEqual({ x: 48, y: 164 });
  });

  it('every string fits its field, for every horse and every value', () => {
    for (const h of game.card.horses) {
      for (const early of INSTRUCTIONS.early) for (const move of INSTRUCTIONS.move) for (const path of INSTRUCTIONS.path) {
        for (const focus of [0, 1, 2, 3, 4]) {
          const sc = ordersScreen(game, rd, open({ early, move, path }, focus, h.post));
          for (const t of sc.texts) {
            if (t.x === 84) expect(t.text.length, t.text).toBeLessThanOrEqual(16); // x84-211
            else if (t.x === 20) expect(t.text.length).toBeLessThanOrEqual(28);
            else if (t.x === 8) expect(t.text.length, t.text).toBeLessThanOrEqual(30);
          }
        }
      }
    }
  });
});

// Rewritten on purpose for the 2026-11-13 rework (spec 4.2, OR4). The old "horse box" tests are
// replaced, not kept: a Yellow name at y8, "Stalker, post 8" at y18, a stats line, a "Jockey ..."
// line and a saddlecloth box (s.cloth) belonged to a Navy box that no longer exists. What they
// protected, that your horse's own name, style, post, stats and jockey are on this screen, now
// holds through the Card's entry component, the "{jockey} up" line and the blurb below. "Stalker,
// post 8" and "Front-runner, post 2" are gone by the spec ("the style is in the entry and the
// post is the saddlecloth number"), so the test that spelled the front-runner out has no
// successor: the word is now the Card's "Front", shared with the Card.
describe('OR4: the top of Orders is the next page of the program', () => {
  const look = shippedRaceDay.cardLook;
  const first = newSession(1);
  const orders = (post: number, focus = 0, l = look) => ordersScreen(game, rd, open(DEFAULTS, focus, post), l);
  const card = cardScreen(game, rd, look, first, { focus: 0 });
  const byPost = [...game.card.horses].sort((a, b) => a.post - b.post);
  /** An entry with its top row taken off every y, so two tops can be compared. */
  const flat = (e: { top: number; cloth: { x: number; y: number; w: number; h: number }; rects: { y: number }[]; texts: { y: number }[]; images: { y: number }[] }) => ({
    ...e,
    top: 0,
    cloth: { ...e.cloth, y: e.cloth.y - e.top },
    rects: e.rects.map((r) => ({ ...r, y: r.y - e.top })),
    texts: e.texts.map((t) => ({ ...t, y: t.y - e.top })),
    images: e.images.map((i) => ({ ...i, y: i.y - e.top })),
  });

  it('draws the picked horse with the Card\'s entry: the same rects, texts and x positions, for every horse, only the top row differs (y8 here)', () => {
    for (const h of byPost) {
      const e = orders(h.post).entry;
      expect(e.top, `post ${h.post}`).toBe(8);
      expect(flat(e), `post ${h.post}`).toEqual(flat(card.rows[h.post - 1]));
    }
  });

  it('shows your horse\'s name, style word, program number, three stats and bars, as the Card does', () => {
    const e = orders(8).entry;
    expect(e.texts.find((t) => t.text === 'Mint Julep Lawsuit')).toMatchObject({ x: 40, y: 8, color: 'Ink' });
    expect(e.texts.find((t) => t.text === 'Stalker')).toMatchObject({ x: 192, y: 8, color: 'Maroon' });
    const num = e.texts.find((t) => t.text === '8' && t.x < 36)!;
    expect(num.color).toBe(CLOTH_BY_POST[8].number);
    expect(cellOf(num).x0).toBeGreaterThanOrEqual(21);
    expect(cellOf(num).x1).toBeLessThanOrEqual(34);
    expect(cellOf(num).y0).toBeGreaterThanOrEqual(9);
    expect(cellOf(num).y1).toBeLessThanOrEqual(23);
    expect(e.texts.filter((t) => t.small).map((t) => [t.text, t.x, t.y])).toEqual([['68', 40, 18], ['82', 108, 18], ['64', 176, 18]]);
    expect(e.cloth).toEqual({ x: 20, y: 8, w: 16, h: 17 });
    const px = paintRects(e.rects);
    expect(pixelAt(px, 20, 8)).toBe('Ink');
    expect(pixelAt(px, 30, 12)).toBe(CLOTH_BY_POST[8].fill);
    // Speed 68 is floor(67 * 50 / 99) = 33 px of Ink, then the Ash track.
    expect(pixelAt(px, 50 + 32, 19)).toBe('Ink');
    expect(pixelAt(px, 50 + 33, 20)).toBe('Ash'); // the track's middle row, +12
    expect(pixelAt(px, 50 + 33, 19)).toBeUndefined();
  });

  it('sits under the Yellow highlighter band: x16-250, 19 rows from y7, chiseled as on the Card', () => {
    for (const h of byPost) expect(yellowSpans(paintRects(orders(h.post).band)), `post ${h.post}`).toEqual(expectedSpans(7, ENTRY_BAND_ROWS));
  });

  it('no chisel step sits under the block, the text or anything else in the entry', () => {
    for (const h of byPost) {
      const sc = orders(h.post);
      const spans = yellowSpans(paintRects(sc.band));
      const marked = [{ x0: 20, x1: 35, y0: 8, y1: 24 }, ...sc.entry.texts.map(cellOf)];
      for (const c of marked) {
        for (let y = c.y0; y <= c.y1; y++) {
          const [a, b] = spans.get(y)!;
          expect(a, `post ${h.post} row ${y}`).toBeLessThanOrEqual(c.x0);
          expect(b, `post ${h.post} row ${y}`).toBeGreaterThanOrEqual(c.x1);
        }
      }
    }
  });

  it('is followed by "{jockey} up" at x8 y30 and the blurb at x8 y42, in Ink', () => {
    for (const h of byPost) {
      const sc = orders(h.post);
      expect(sc.texts.filter((t) => t.y === 30 || t.y === 42).map((t) => [t.text, t.x, t.y, t.color]), `post ${h.post}`).toEqual([
        [`${h.jockey} up`, 8, 30, 'Ink'],
        [look[h.id].blurb!, 8, 42, 'Ink'],
      ]);
    }
  });

  it('with no blurb the second line is empty and the jockey line still shows', () => {
    const bare = structuredClone(look);
    for (const k of Object.keys(bare)) delete (bare[k] as { blurb?: string }).blurb;
    const sc = orders(2, 0, bare);
    expect(sc.texts.find((t) => t.y === 30)!.text).toBe(`${byPost[1].jockey} up`);
    expect(sc.texts.find((t) => t.y === 42)?.text ?? '').toBe('');
  });

  it('a 22-character jockey and a 28-character blurb fit x8-207 and x8-231', () => {
    const g = structuredClone(game);
    g.card.horses.find((h) => h.post === 3)!.jockey = 'J'.repeat(22);
    const l = structuredClone(look);
    l[byPost[2].id].blurb = 'B'.repeat(28);
    const sc = ordersScreen(g, rd, open(DEFAULTS, 0, 3), l);
    expect(cellOf(sc.texts.find((t) => t.y === 30)!)).toMatchObject({ x0: 8, x1: 207 });
    expect(cellOf(sc.texts.find((t) => t.y === 42)!)).toMatchObject({ x0: 8, x1: 231 });
  });

  it('a rule at y55 across x8-247, "Orders" in Maroon at y64, and the paper ends with a 1 px Ink edge at y143', () => {
    const sc = orders(8);
    expect(sc.rules).toContainEqual({ x: 8, y: 55, w: 240, h: 1, color: 'Ink' });
    expect(sc.texts.find((t) => t.text === 'Orders')).toEqual({ text: 'Orders', x: 8, y: 64, color: 'Maroon' });
    const px = paintRects([sc.paper, ...sc.rules]);
    // Flat Parchment from y0 to y142 across the whole width, then Ink at y143.
    for (const x of [0, 7, 100, 248, 255]) {
      expect(pixelAt(px, x, 0), `x${x} y0`).toBe('Parchment');
      expect(pixelAt(px, x, 142), `x${x} y142`).toBe('Parchment');
      expect(pixelAt(px, x, 143), `x${x} y143`).toBe('Ink');
      expect(pixelAt(px, x, 144), `x${x} y144 is the paddock`).toBeUndefined();
    }
    expect(pixelAt(px, 8, 55)).toBe('Ink');
    expect(pixelAt(px, 247, 55)).toBe('Ink');
    expect(pixelAt(px, 7, 55)).toBe('Parchment');
    expect(pixelAt(px, 248, 55)).toBe('Parchment');
    // No other rule on the paper.
    expect(sc.rules.map((r) => r.y).sort((a, b) => a - b)).toEqual([55, 143]);
  });

  it('the slot rows and actions are Ink at their built positions, and the paper has no Navy and no Bone', () => {
    const o: Orders = { early: 'rateEarly', move: 'saveForStretch', path: 'stayInside' };
    const sc = ordersScreen(game, rd, open(o, 1, 8), look);
    const paper = sc.texts.filter((t) => t.y < 144);
    const get = (text: string) => paper.find((t) => t.text === text)!;
    expect(get('Early')).toMatchObject({ x: 20, y: 78, color: 'Ink' });
    expect(get('Rate early')).toMatchObject({ x: 84, y: 78, color: 'Ink' });
    expect(get('Move')).toMatchObject({ x: 20, y: 90, color: 'Ink' });
    expect(get('Save for stretch')).toMatchObject({ x: 84, y: 90, color: 'Ink' });
    expect(get('Path')).toMatchObject({ x: 20, y: 102, color: 'Ink' });
    expect(get('Stay inside')).toMatchObject({ x: 84, y: 102, color: 'Ink' });
    expect(get('Go to the post')).toMatchObject({ x: 20, y: 116, color: 'Ink' });
    expect(get('Back to card')).toMatchObject({ x: 20, y: 127, color: 'Ink' });
    expect(get('<')).toMatchObject({ x: 72, y: 90, color: 'Ink' });
    expect(get('>')).toMatchObject({ x: 216, y: 90, color: 'Ink' });
    expect(paper.some((t) => t.color === 'Bone')).toBe(false);
    expect([sc.paper, ...sc.rules, ...sc.band, ...sc.entry.rects].some((r) => r.color === 'Navy')).toBe(false);
  });

  it('the dialog box stays the one framed box, y192-239, with the trainer\'s lines in Bone', () => {
    const sc = ordersScreen(game, rd, open({ ...DEFAULTS, move: 'saveForStretch' }, 1, 8), look);
    expect(sc.boxes.map((b) => [b.x, b.y, b.tilesW * 8, b.tilesH * 8])).toEqual([[0, 192, 256, 48]]);
    expect(sc.texts.filter((t) => t.y >= 192).map((t) => [t.text, t.color])).toEqual([['Sit chilly till the stretch.', 'Bone'], ['Then ask for everything.', 'Bone']]);
  });

  it('the paddock strip is unchanged below the paper: it starts at y144 with no frame', () => {
    const sc = orders(8);
    expect(Math.min(...sc.tiles.map((t) => t.y))).toBe(144);
    expect(Math.max(...sc.tiles.map((t) => t.y))).toBe(176);
    expect(sc.paper.y + sc.paper.h).toBeLessThanOrEqual(143);
  });

  it('the cursor is the paper horseshoe: at x8 on the focused row (the recolor itself is in programPages.test.ts)', () => {
    [78, 90, 102, 116, 127].forEach((y, focus) => expect(orders(8, focus).cursor).toEqual({ x: 8, y }));
  });

  it('the entry follows the post it is given, and the state\'s orders and focus change nothing in it', () => {
    const a = orders(5, 0).entry;
    const b = ordersScreen(game, rd, open({ early: 'rateEarly', move: 'saveForStretch', path: 'stayInside' }, 4, 5), look).entry;
    expect(b).toEqual(a);
  });
});
