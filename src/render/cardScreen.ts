import { biasLine, conditionsLine } from '../data/cardWords';
import type { CardLook, RaceDay } from '../data/raceDaySchema';
import type { Card, GameData, Horse } from '../data/schema';
import { ENTRY, INK, PAPER, SECOND_INK, bandRects, clothFor, programEntry, riderLines, rule, type Entry, type PageRect, type PageText } from './page';
import type { Session } from './session';
import { SLOT_IDS } from './slotStatus';

// The Card as one page of a race program (spec 4.1, DESIGN Program pages), as pure
// functions: what the page draws for a focus and a pick, what a key does, and the pick's
// 2-frame swipe. Every horse is on the page at once, one entry each, so the stats compare
// down the columns. The scene only places what these return and forwards the keys.

/** The conditions block, the rules, the column heads, the entries and the footer (spec 4.1 wireframe). */
export const CARD_PAGE = {
  header: { x: 8, y: 4, dy: 10 },
  rules: [44, 56, 210],
  headsY: 47,
  entryTop: 58,
  entryPitch: 19,
  cursorX: 8,
  footer: { x: 8, ys: [214, 226] },
} as const;

/** The slots the card draws, for the placeholder tag. */
export const CARD_SLOT_IDS: readonly string[] = [SLOT_IDS.fontMain, SLOT_IDS.fontSmall, SLOT_IDS.cursor, SLOT_IDS.placeholderTag, SLOT_IDS.markPick];

/** Enter, Space or Z picks (spec 4.1 and 5). */
export const CARD_CONFIRM_KEYS: readonly string[] = ['Enter', 'NumpadEnter', 'Space', 'KeyZ'];

/** The pick's swipe, while it plays: frame 1 the band's left part, frame 2 the whole band and the tick. */
export interface CardSwipe { post: number; frame: 1 | 2 }

export interface CardScreen {
  /** Flat full-screen paper. */
  paper: string;
  /** Race name (Maroon), track, conditions, bias line. */
  header: PageText[];
  /** "Speed", "Stamina", "Kick" over their stat columns. */
  heads: PageText[];
  rules: PageRect[];
  /** The highlighter band, one rect per row; empty with no pick to mark. Drawn under the entries. */
  band: PageRect[];
  /** One program entry per horse by post, top at y58 + 19i. */
  rows: Entry[];
  /** The footer for the focused horse: "{jockey} up", then the blurb ('' with none). */
  detail: PageText[];
  /** The horseshoe's top-left (Gold and Auburn on paper). */
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

/** The four header lines: race name, track, conditions, bias. */
export const headerLines = (game: GameData, rd: RaceDay): string[] =>
  [game.race.name, game.race.track, conditionsLine(game.race, rd.copy.card), biasLine(game.race.trackBias, rd.copy.card)];

/** Entry i's top row. */
export const entryTop = (i: number): number => CARD_PAGE.entryTop + CARD_PAGE.entryPitch * i;

/** The swipe's frame `seconds` after Enter: 1, then 2, then null when it is over and the page cuts to Orders. */
export function swipeFrame(seconds: number, rd: RaceDay): 1 | 2 | null {
  const p = rd.program;
  if (seconds < p.swipeFrame1Seconds.value) return 1;
  if (seconds < p.swipeFrame1Seconds.value + p.swipeFrame2Seconds.value) return 2;
  return null;
}

export function cardScreen(game: GameData, rd: RaceDay, look: CardLook, session: Session, state: CardState, swipe: CardSwipe | null = null): CardScreen {
  const P = CARD_PAGE;
  const horses = cardHorses(game.card);
  const range = game.tuning.statRange.value;
  const header = headerLines(game, rd).map((text, i): PageText => ({ text, x: P.header.x, y: P.header.y + P.header.dy * i, color: i === 0 ? SECOND_INK : INK }));
  const h = rd.copy.card.heads;
  const heads: PageText[] = ENTRY.stats.map((s) => ({ text: h[s.key], x: s.numberX, y: P.headsY, color: INK }));
  // CD6: the band and tick mark last race's pick; while the swipe plays they move to the new pick,
  // the band growing in frame 1 and the tick joining it in frame 2.
  const marked = swipe ? swipe.post : session.lastRace?.post ?? null;
  const showTick = swipe ? swipe.frame === 2 : marked !== null;
  const shape = rd.program.entryBand.value;
  const markedIndex = horses.findIndex((x) => x.post === marked);
  const band = markedIndex < 0 ? [] : bandRects(shape, entryTop(markedIndex) - 1, swipe?.frame === 1 ? rd.program.swipeHalfX1.value : shape.x1);
  const rows = horses.map((x, i) => programEntry(x, entryTop(i), rd, clothFor(rd, x.post), range, showTick && x.post === marked));
  const focus = Math.min(Math.max(0, state.focus), horses.length - 1);
  const detail = riderLines(horses[focus], rd, look).map((text, i): PageText => ({ text, x: P.footer.x, y: P.footer.ys[i], color: INK }));
  return {
    paper: PAPER,
    header,
    heads,
    rules: P.rules.map((y) => rule(y)),
    band,
    rows,
    detail,
    cursor: { x: P.cursorX, y: entryTop(focus) + ENTRY.cursorDy },
  };
}
