import type { Book } from '../data/bookSchema';
import { fillHoles } from '../data/bookText';
import type { RaceDay } from '../data/raceDaySchema';
import { fillTemplate } from '../data/template';
import type { DaySummary, RaceRecord } from '../bet/day';
import { money, stake } from './betCopy';
import { dayPair } from './bookScreen';
import { INK, PAPER, SECOND_INK, clothFor, rightAlignedX, rule, type PageRect, type PageText } from './page';
import type { PointerTarget } from './pointer';

// The End of day page, the back page of the program (docs/specs/betting-screens.md sections
// 6, 8 and 10, DESIGN "End of day, the back page"), as a pure function of the day's summary
// (src/bet/day.ts daySummary) and its records. Every figure comes from the summary; this
// file only formats and places them. Positions are raceDay.json `endOfDay`, words are
// `copy.end`. All Ink except the Maroon title and the one colored figure, Change (Turf with a
// plus sign, Red with a minus sign, the word "Even" in Ink): never a Red title, no mark of loss.

/** How the day went, which picks the day's line (section 6): nothing bet, up, even or down. */
export type DayOutcome = 'none' | 'up' | 'even' | 'down';

export function dayOutcome(s: Pick<DaySummary, 'betsMade' | 'changeCents'>): DayOutcome {
  if (s.betsMade === 0) return 'none';
  return s.changeCents > 0 ? 'up' : s.changeCents < 0 ? 'down' : 'even';
}

/** Money up on paper is Turf, down is Red (DESIGN, Money colors on paper). */
export const CHANGE_UP_COLOR = 'Turf';
export const CHANGE_DOWN_COLOR = 'Red';

export interface EndOfDayInput {
  rd: RaceDay;
  book: Book;
  /** Race 1's `track` from day.json, as the cover prints it. */
  trackName: string;
  /** From daySummary. */
  summary: DaySummary;
  /** The day's records, one per race run. */
  records: readonly RaceRecord[];
}

export interface EndOfDayScreen {
  paper: string;
  rects: PageRect[];
  texts: PageText[];
  /** The paper horseshoe's top-left, on "New day". */
  cursor: { x: number; y: number };
  /** The aria-live text. */
  aria: string;
}

/** Enter, Space or Z: New day (section 2). */
export const END_CONFIRM_KEYS: readonly string[] = ['Enter', 'NumpadEnter', 'Space', 'KeyZ'];
/** The key the one target stands for (track-hub.md section 6: a click is Enter). */
export const END_POINTER_KEYS: Readonly<Record<'newDay', readonly string[]>> = { newDay: ['Enter'] };

/** The one pointer target: the "New day" line, x8-247, y216-231. */
export const endOfDayPointerTargets = (rd: RaceDay): PointerTarget<'newDay'>[] => [{ id: 'newDay', box: rd.endOfDay.value.action.box }];

const sentence = (s: string): string => (/[.!?]$/.test(s) ? s : `${s}.`);

/** The Change figure's text and color from the summary's change in cents. */
export function changeFigure(copy: RaceDay['copy']['end'], changeCents: number): { text: string; color: string } {
  if (changeCents > 0) return { text: fillTemplate(copy.plus, { amount: money(changeCents) }), color: CHANGE_UP_COLOR };
  if (changeCents < 0) return { text: fillTemplate(copy.minus, { amount: money(-changeCents) }), color: CHANGE_DOWN_COLOR };
  return { text: copy.even, color: INK };
}

export function endOfDayScreen(input: EndOfDayInput): EndOfDayScreen {
  const { rd, book, summary, records } = input;
  const copy = rd.copy.end;
  const L = rd.endOfDay.value;
  const C = L.card;

  const rects: PageRect[] = L.rules.map((y) => rule(y));
  const texts: PageText[] = [];
  const aria: string[] = [];

  // The title in Maroon, and the day pair right-aligned to x247 on its baseline.
  const dayLabel = book.cover.dayLabel.value;
  const dayNumber = fillHoles(book.cover.dayNumber.value, { seed: summary.daySeed });
  const gap = book.cover.layout.value.dayNumberX - book.cover.layout.value.dayLabelX;
  const pairX = L.lastX + 1 - (gap + 4 * dayNumber.length);
  texts.push({ text: copy.title, x: L.left, y: L.titleTop, color: SECOND_INK });
  texts.push(...dayPair(book, dayLabel, dayNumber, pairX, L.titleTop));
  texts.push({ text: input.trackName, x: L.left, y: L.trackTop, color: INK });
  aria.push(copy.title, fillHoles(book.cover.aria.value, { label: dayLabel, number: dayNumber }), input.trackName);

  // The six figures: labels at x8, values right-aligned to x247.
  const change = changeFigure(copy, summary.changeCents);
  const betsMade = fillTemplate(copy.betsOf, { bets: summary.betsMade, races: summary.racesRun });
  const rows: [label: string, value: string, color: string][] = [
    [copy.started, money(summary.startCents), INK],
    [copy.ended, money(summary.endCents), INK],
    [copy.change, change.text, change.color],
    [copy.bets, betsMade, INK],
    [copy.winners, String(summary.winnersHit), INK],
    [copy.best, summary.bestPriceHit ?? copy.noWinner, INK],
  ];
  rows.forEach(([label, value, color], i) => {
    const y = L.firstRowTop + L.rowPitch * i;
    texts.push({ text: label, x: L.left, y, color: INK });
    texts.push({ text: value, x: rightAlignedX(value, L.lastX), y, color });
    aria.push(`${label} ${value}`);
  });

  const line = copy.line[dayOutcome(summary)];
  texts.push({ text: line, x: L.left, y: L.lineTop, color: INK });
  aria.push(line);

  // The day's card: one row per race run (section 10). All Ink; the box is the horse you bet on.
  rects.push(rule(L.cardRuleTop));
  records.forEach((r, i) => {
    const y = L.cardTop + L.cardPitch * i;
    const race = fillTemplate(copy.card.race, { r: r.race });
    texts.push({ text: race, x: C.raceX, y, color: INK });
    const t = r.ticket;
    if (t === null) {
      texts.push({ text: copy.card.passed, x: C.passedX, y, color: INK });
      aria.push(`${race}, ${copy.card.passed}`);
      return;
    }
    const cloth = clothFor(rd, t.post);
    const boxY = y + C.boxDy;
    rects.push({ x: C.boxX, y: boxY, w: C.boxSize, h: C.boxSize, color: INK });
    rects.push({ x: C.boxX + 1, y: boxY + 1, w: C.boxSize - 2, h: C.boxSize - 2, color: cloth.fill });
    texts.push({ text: String(t.post % 10), x: C.boxX + C.numberDx, y: y + C.numberDy, color: cloth.number, small: true });
    texts.push({ text: t.odds, x: C.oddsX, y, color: INK });
    const ticket = r.returnCents > 0
      ? fillTemplate(copy.card.paid, { total: money(r.returnCents) })
      : fillTemplate(copy.card.lost, { amount: stake(t.dollars) });
    texts.push({ text: ticket, x: rightAlignedX(ticket, C.ticketLastX), y, color: INK });
    aria.push(`${race}, #${t.post}, ${t.odds}, ${ticket}`);
  });

  const A = L.action;
  texts.push({ text: copy.newDay, x: A.textX, y: A.top, color: INK });
  aria.push(copy.newDay);

  return { paper: PAPER, rects, texts, cursor: { x: A.cursorX, y: A.top }, aria: aria.map(sentence).join(' ') };
}
