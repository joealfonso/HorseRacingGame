import type { RaceDay } from '../data/raceDaySchema';
import { INSTRUCTIONS, type Card, type GameData, type Horse } from '../data/schema';
import { fillTemplate, wrapWords } from '../data/template';
import { ordersFor, sameHorseAsLastRace, type Orders, type Session } from './session';
import { SLOT_IDS } from './slotStatus';

// Orders, the paddock (spec 4.2), as pure functions: the order values offered (always
// INSTRUCTIONS from src/data/schema.ts, never a list of its own), the focus model, what a
// key does, the trainer's line for the focused item, and everything the screen draws.

export const ORDER_SLOTS = ['early', 'move', 'path'] as const;
export type OrderSlot = (typeof ORDER_SLOTS)[number];
/** Focus order (OR3): the three slots, then Go to the post, then Back to card. */
export const ORDERS_ITEMS = ['early', 'move', 'path', 'post', 'back'] as const;
export type OrdersItem = (typeof ORDERS_ITEMS)[number];

/** Horse box y0-55, orders box y56-143, paddock strip y144-191 (no frame), dialog box y192-239. */
export const ORDERS_BOXES = [
  { x: 0, y: 0, tilesW: 32, tilesH: 7 },
  { x: 0, y: 56, tilesW: 32, tilesH: 11 },
  { x: 0, y: 192, tilesW: 32, tilesH: 6 },
] as const;

/** The horse box: four lines at a 10 px pitch; the saddlecloth box leads the first. */
export const ORDERS_HORSE = { x: 8, y: 8, dy: 10, clothSize: 10, name: 22 } as const;
/** Slot rows: cursor x8-15, label x20-59, "<" x72, value x84-211, ">" x216 (spec 4.2). */
export const ORDERS_ROW = { title: { x: 8, y: 64 }, ys: [78, 90, 102, 116, 127], cursor: 8, label: 20, left: 72, value: 84, right: 216 } as const;
/** The paddock strip y144-191: three rows of 16 px tiles across the 256 px screen. Who stands where is data. */
export const PADDOCK = { y: 144, tile: 16, width: 256 } as const;
export const ORDERS_DIALOG = { x: 8, ys: [200, 210, 220], chars: 28 } as const;

/** Enter, Space or Z confirms; Esc, Backspace or X goes back (spec 5). */
export const ORDERS_CONFIRM_KEYS: readonly string[] = ['Enter', 'NumpadEnter', 'Space', 'KeyZ'];
export const ORDERS_BACK_KEYS: readonly string[] = ['Escape', 'Backspace', 'KeyX'];

/** The slots the Orders screen draws, for the placeholder tag. */
export const ordersSlotIds = (rd: RaceDay): string[] => [
  SLOT_IDS.fontMain, SLOT_IDS.fontSmall, SLOT_IDS.frameBox, SLOT_IDS.cursor, SLOT_IDS.placeholderTag, SLOT_IDS.paddockTrainer,
  ...new Set(rd.paddock.rows.value.map((r) => r.slot)),
  SLOT_IDS.horse.body.stand, SLOT_IDS.horse.tack.stand, SLOT_IDS.horse.jacket.stand, SLOT_IDS.horse.cap.stand,
];

/** The values a slot offers (OR1), in INSTRUCTIONS' order. */
export const orderValues = (slot: OrderSlot): readonly string[] => INSTRUCTIONS[slot];

/** Step a slot's value through INSTRUCTIONS, wrapping both ways. Returns a new object. */
export function cycleOrder(orders: Orders, slot: OrderSlot, delta: number): Orders {
  const values = orderValues(slot);
  const i = Math.max(0, values.indexOf(orders[slot]));
  const next = values[(((i + delta) % values.length) + values.length) % values.length];
  return { ...orders, [slot]: next } as Orders;
}

export interface OrdersState { post: number; focus: number; orders: Orders }

/** Opening Orders for a horse: its orders (spec 4.2 states), focus on Go to the post for last race's horse, Early otherwise. */
export function initialOrdersState(session: Session, card: Card, post: number): OrdersState {
  return {
    post,
    focus: ORDERS_ITEMS.indexOf(sameHorseAsLastRace(session, post) ? 'post' : 'early'),
    orders: ordersFor(session, card, post),
  };
}

export type OrdersOutcome = { kind: 'go' } | { kind: 'back' } | null;

/** One key press, already past the held-key guard. */
export function ordersKey(s: OrdersState, code: string): { state: OrdersState; outcome: OrdersOutcome } {
  const n = ORDERS_ITEMS.length;
  const item = ORDERS_ITEMS[s.focus];
  const slot = (ORDER_SLOTS as readonly string[]).includes(item) ? (item as OrderSlot) : null;
  if (code === 'ArrowUp') return { state: { ...s, focus: (s.focus - 1 + n) % n }, outcome: null };
  if (code === 'ArrowDown') return { state: { ...s, focus: (s.focus + 1) % n }, outcome: null };
  if (ORDERS_BACK_KEYS.includes(code)) return { state: s, outcome: { kind: 'back' } };
  if (slot && (code === 'ArrowLeft' || code === 'ArrowRight')) {
    return { state: { ...s, orders: cycleOrder(s.orders, slot, code === 'ArrowLeft' ? -1 : 1) }, outcome: null };
  }
  if (ORDERS_CONFIRM_KEYS.includes(code)) {
    if (slot) return { state: { ...s, orders: cycleOrder(s.orders, slot, 1) }, outcome: null };
    return { state: s, outcome: { kind: item === 'post' ? 'go' : 'back' } };
  }
  return { state: s, outcome: null };
}

/** The trainer's line for the focused item: the focused slot's current value, or Go or Back. */
export function trainerLine(rd: RaceDay, s: OrdersState): string {
  const t = rd.copy.paddock.trainer;
  const item = ORDERS_ITEMS[s.focus];
  if (item === 'post') return t.go;
  if (item === 'back') return t.back;
  return (t[item] as Record<string, string>)[s.orders[item]] ?? '';
}

/** The trainer's line wrapped for the dialog box: 28 characters a line, at most 3 lines (the loader checks it fits). */
export const trainerLines = (rd: RaceDay, s: OrdersState): string[] =>
  wrapWords(trainerLine(rd, s), ORDERS_DIALOG.chars).slice(0, ORDERS_DIALOG.ys.length);

/** The trainer's coffee idle: cup down for `down` seconds (frame 0), then up for `up` (frame 1), looping. */
export function trainerFrame(seconds: number, down: number, up: number): number {
  const t = Math.max(0, seconds) % (down + up);
  return t < down ? 0 : 1;
}

export type OrdersColor = 'Bone' | 'Yellow';
export interface OrdersText { text: string; x: number; y: number; color: OrdersColor }

export interface OrdersScreen {
  boxes: typeof ORDERS_BOXES;
  /** The saddlecloth box before your horse's name. */
  cloth: { post: number; x: number; y: number; size: number; numberX: number; numberY: number };
  texts: OrdersText[];
  cursor: { x: number; y: number };
  /** Paddock tiles, one per 16 px of each row, by slot id; `flip` mirrors the tile (the rail's odd tiles). Drawn first. */
  tiles: { x: number; y: number; slot: string; flip: boolean }[];
  trainer: { x: number; y: number };
  horse: { x: number; y: number };
}

/** The horse box's four lines: name, style and post, stats, jockey. */
export function horseLines(h: Horse, rd: RaceDay): string[] {
  const p = rd.copy.paddock;
  const c = rd.copy.card;
  return [
    h.name,
    fillTemplate(p.postLine, { style: p.styles[h.style], post: h.post }),
    fillTemplate(c.stats, { speed: h.stats.speed, stamina: h.stats.stamina, kick: h.stats.kick }),
    fillTemplate(c.jockey, { jockey: h.jockey }),
  ];
}

export function ordersScreen(game: GameData, rd: RaceDay, s: OrdersState): OrdersScreen {
  const h = game.card.horses.find((x) => x.post === s.post) ?? game.card.horses[0];
  const p = rd.copy.paddock;
  const H = ORDERS_HORSE;
  const R = ORDERS_ROW;
  const texts: OrdersText[] = horseLines(h, rd).map((text, i) => ({
    text, x: i === 0 ? H.name : H.x, y: H.y + H.dy * i, color: i === 0 ? 'Yellow' as const : 'Bone' as const,
  }));
  texts.push({ text: p.title, x: R.title.x, y: R.title.y, color: 'Bone' });
  ORDER_SLOTS.forEach((slot, i) => {
    const y = R.ys[i];
    texts.push({ text: p.labels[slot], x: R.label, y, color: 'Bone' });
    texts.push({ text: (p.values[slot] as Record<string, string>)[s.orders[slot]] ?? s.orders[slot], x: R.value, y, color: 'Bone' });
    // "<" and ">" only on the focused slot.
    if (s.focus === i) {
      texts.push({ text: '<', x: R.left, y, color: 'Bone' });
      texts.push({ text: '>', x: R.right, y, color: 'Bone' });
    }
  });
  texts.push({ text: p.go, x: R.label, y: R.ys[3], color: 'Bone' });
  texts.push({ text: p.back, x: R.label, y: R.ys[4], color: 'Bone' });
  trainerLines(rd, s).forEach((text, i) => texts.push({ text, x: ORDERS_DIALOG.x, y: ORDERS_DIALOG.ys[i], color: 'Bone' }));

  const tiles: OrdersScreen['tiles'] = [];
  rd.paddock.rows.value.forEach(({ slot, flipOddTiles }, row) => {
    for (let x = 0; x < PADDOCK.width; x += PADDOCK.tile) {
      tiles.push({ x, y: PADDOCK.y + row * PADDOCK.tile, slot, flip: flipOddTiles && Math.floor(x / PADDOCK.tile) % 2 === 1 });
    }
  });
  const [tx, ty] = rd.paddock.trainerAt.value;
  const [hx, hy] = rd.paddock.horseAt.value;
  const clothY = H.y - 1;
  return {
    boxes: ORDERS_BOXES,
    cloth: { post: h.post, x: H.x, y: clothY, size: H.clothSize, numberX: H.x + 3, numberY: clothY + 2 },
    texts,
    cursor: { x: R.cursor, y: R.ys[Math.min(Math.max(0, s.focus), ORDERS_ITEMS.length - 1)] },
    tiles,
    trainer: { x: tx, y: ty },
    horse: { x: hx, y: hy },
  };
}
