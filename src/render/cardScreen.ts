import { biasLine, conditionsLine } from '../data/cardWords';
import type { CardLook, RaceDay } from '../data/raceDaySchema';
import type { Card, GameData, Horse } from '../data/schema';
import { fillTemplate } from '../data/template';
import type { Session } from './session';
import { SLOT_IDS } from './slotStatus';

// The card (spec 4.1), as pure functions: what it draws for a focus, and what a key does.
// The scene only places what these return and forwards the keys. Horses run by post, 1
// at the top. Last race's pick shows in Yellow, backed by the words "Your pick last race".

/** Three framed boxes: the conditions y0-63, the horses y64-175, the focused horse's detail y176-239. */
export const CARD_BOXES = [
  { x: 0, y: 0, tilesW: 32, tilesH: 8 },
  { x: 0, y: 64, tilesW: 32, tilesH: 14 },
  { x: 0, y: 176, tilesW: 32, tilesH: 8 },
] as const;

export const CARD_HEADER = { x: 8, y: 8, dy: 10 } as const;
/** Row columns: cursor x8-15, saddlecloth box x20-29, name x34-177, style x192-247 (spec 4.1). */
export const CARD_ROW = { y: 72, dy: 12, cursor: 8, cloth: 20, clothSize: 10, name: 34, style: 192 } as const;
/** Four detail lines at a 12 px pitch: jockey, stats, blurb, then the hint. */
export const CARD_DETAIL = { x: 8, y: 184, dy: 12 } as const;

/** The slots the card draws, for the placeholder tag. */
export const CARD_SLOT_IDS: readonly string[] = [SLOT_IDS.fontMain, SLOT_IDS.fontSmall, SLOT_IDS.frameBox, SLOT_IDS.cursor, SLOT_IDS.placeholderTag];

/** Enter, Space or Z picks (spec 4.1 and 5). */
export const CARD_CONFIRM_KEYS: readonly string[] = ['Enter', 'NumpadEnter', 'Space', 'KeyZ'];

export type CardColor = 'Bone' | 'Yellow';
export interface CardText { text: string; x: number; y: number; color: CardColor }

export interface CardRow {
  post: number;
  id: string;
  /** Last race's pick: name in Yellow. */
  lastPick: boolean;
  /** The 10x10 saddlecloth box (1 px Ash border on Navy, cloth fill) and its small-font number. */
  cloth: { x: number; y: number; size: number; numberX: number; numberY: number };
  texts: CardText[];
}

export interface CardScreen {
  boxes: typeof CARD_BOXES;
  header: CardText[];
  rows: CardRow[];
  /** The focused horse's four lines; the blurb line is empty text when the horse has none. */
  detail: CardText[];
  cursor: { x: number; y: number };
}

/** Focus is an index into the horses by post. */
export interface CardState { focus: number }

export type CardOutcome = { kind: 'pick'; post: number } | null;

/** The horses as the card lists them: by post. */
export const cardHorses = (card: Card): Horse[] => [...card.horses].sort((a, b) => a.post - b.post);

/** Initial focus: your pick (last race's, or the horse you just came back from Orders with), post 1 on the first race. */
export function initialCardState(card: Card, session: Session): CardState {
  const i = cardHorses(card).findIndex((h) => h.post === session.pickPost);
  return { focus: Math.max(0, i) };
}

/** One key press, already past the held-key guard. Up and Down wrap, 1 to 8 jump, confirm picks, Esc does nothing. */
export function cardKey(s: CardState, code: string, card: Card): { state: CardState; outcome: CardOutcome } {
  const horses = cardHorses(card);
  const n = horses.length;
  if (code === 'ArrowUp') return { state: { focus: (s.focus - 1 + n) % n }, outcome: null };
  if (code === 'ArrowDown') return { state: { focus: (s.focus + 1) % n }, outcome: null };
  const digit = /^(Digit|Numpad)([1-9])$/.exec(code);
  if (digit) {
    const i = horses.findIndex((h) => h.post === Number(digit[2]));
    return { state: i < 0 ? s : { focus: i }, outcome: null };
  }
  if (CARD_CONFIRM_KEYS.includes(code)) return { state: s, outcome: { kind: 'pick', post: horses[s.focus].post } };
  return { state: s, outcome: null };
}

/** The four detail lines for one horse (CD1). */
export function detailLines(h: Horse, rd: RaceDay, look: CardLook, lastPick: boolean): string[] {
  const c = rd.copy.card;
  return [
    fillTemplate(c.jockey, { jockey: h.jockey }),
    fillTemplate(c.stats, { speed: h.stats.speed, stamina: h.stats.stamina, kick: h.stats.kick }),
    look[h.id]?.blurb ?? '',
    lastPick ? c.lastPick : c.hint,
  ];
}

/** The four header lines: race name, track, conditions, bias. */
export const headerLines = (game: GameData, rd: RaceDay): string[] =>
  [game.race.name, game.race.track, conditionsLine(game.race, rd.copy.card), biasLine(game.race.trackBias, rd.copy.card)];

export function cardScreen(game: GameData, rd: RaceDay, look: CardLook, session: Session, state: CardState): CardScreen {
  const R = CARD_ROW;
  const lastPost = session.lastRace?.post ?? null;
  const horses = cardHorses(game.card);
  const header = headerLines(game, rd).map((text, i): CardText => ({ text, x: CARD_HEADER.x, y: CARD_HEADER.y + CARD_HEADER.dy * i, color: 'Bone' }));
  const rows = horses.map((h, i): CardRow => {
    const y = R.y + R.dy * i;
    const lastPick = h.post === lastPost;
    const clothY = y - 1;
    return {
      post: h.post,
      id: h.id,
      lastPick,
      cloth: { x: R.cloth, y: clothY, size: R.clothSize, numberX: R.cloth + 3, numberY: clothY + 2 },
      texts: [
        { text: h.name, x: R.name, y, color: lastPick ? 'Yellow' : 'Bone' },
        { text: rd.copy.card.styles[h.style], x: R.style, y, color: 'Bone' },
      ],
    };
  });
  const focus = Math.min(Math.max(0, state.focus), horses.length - 1);
  const h = horses[focus];
  const detail = detailLines(h, rd, look, h.post === lastPost)
    .map((text, i): CardText => ({ text, x: CARD_DETAIL.x, y: CARD_DETAIL.y + CARD_DETAIL.dy * i, color: 'Bone' }));
  return { boxes: CARD_BOXES, header, rows, detail, cursor: { x: R.cursor, y: R.y + R.dy * focus } };
}
