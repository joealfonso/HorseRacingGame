import { programConditionsLine, programPlaceLine } from '../data/cardWords';
import type { CardLook, RaceDay } from '../data/raceDaySchema';
import type { Horse } from '../data/schema';
import { quote, type DayContext, type DayState, type DrawnRace, type RaceProgram } from '../bet/day';
import { offeredAmounts } from '../bet/money';
import { bankLine, printedTicketLines, raceOfLine, ticketAmountLine, ticketPaysLine } from './betCopy';
import { BET_ENTRY, ENTRY, INK, PAPER, SECOND_INK, bandRects, clothFor, programEntry, rightAlignedX, rule, type Entry, type PageRect, type PageText } from './page';
import { SLOT_IDS } from './slotStatus';

// The betting program page (docs/specs/betting-screens.md section 3, DESIGN "Program pages,
// Betting additions"), as pure functions: what the page draws for a state, and what a key
// does. The approved program entry with 40 px bars and the odds at the end of line 2, the
// header with the race number and the bank, and the footer in its three modes: choosing
// (blurb and "Pass this race"), the ticket open, and the bet placed (the printed tote
// ticket). Every odds, pays and bank figure comes from src/bet; the scene only places
// what these return and forwards the keys.

export const PROGRAM_PAGE = {
  header: { x: 8, y: 4, dy: 10 },
  lastX: 247,
  rules: [44, 56, 210],
  headsY: 47,
  entryTop: 58,
  entryPitch: 19,
  cursorX: 8,
  /** The odds cell's top, from the entry's top: on the stat numbers' baseline. */
  oddsDy: 8,
  footer: { x: 8, labelX: 20, ys: [214, 226] },
  /** The printed tote ticket: a Bone slip x8-247, y209-235, its text from x16. */
  slip: { x0: 8, x1: 247, top: 209, bottom: 235, textX: 16, textYs: [215, 225] },
} as const;

/** DESIGN, Printed tote ticket: the torn top edge's offset for column x is TORN_EDGE[(x - 8) mod 24]. */
export const TORN_EDGE: readonly number[] = [0, 0, 1, 2, 1, 1, 0, 1, 2, 2, 1, 0, 0, 0, 1, 1, 2, 1, 0, 1, 1, 2, 1, 0];

/** A price not yet posted (DESIGN: a single main-font "-", right-aligned to x247). */
export const PENDING_ODDS = '-';

/** The slots the program draws, for the placeholder tag. */
export const PROGRAM_SLOT_IDS: readonly string[] = [SLOT_IDS.fontMain, SLOT_IDS.fontSmall, SLOT_IDS.cursor, SLOT_IDS.placeholderTag, SLOT_IDS.markPick];

/** Enter, Space or Z: open the ticket on a horse, pass on Pass, place the bet on the ticket. */
export const PROGRAM_CONFIRM_KEYS: readonly string[] = ['Enter', 'NumpadEnter', 'Space', 'KeyZ'];

/**
 * `focus` indexes the horses by post, and one past the last horse is "Pass this race".
 * The ticket holds its amount in whole dollars. Placed is the punch beat before the cut.
 */
export type ProgramMode = { kind: 'choosing' } | { kind: 'ticket'; dollars: number } | { kind: 'placed' };
export interface ProgramState { focus: number; mode: ProgramMode }

export type ProgramOutcome = { kind: 'pass' } | { kind: 'bet'; post: number; dollars: number } | null;

/** Focus starts on post 1 (betting-screens.md question 3). */
export const initialProgramState = (): ProgramState => ({ focus: 0, mode: { kind: 'choosing' } });

/** The horses as the program lists them: by post. */
export const programHorses = (drawn: DrawnRace): Horse[] => [...drawn.input.card.horses].sort((a, b) => a.post - b.post);

/** Entry i's top row. */
export const programEntryTop = (i: number): number => PROGRAM_PAGE.entryTop + PROGRAM_PAGE.entryPitch * i;

/**
 * BP7: the ticket opens at last bet's amount if it is still offered, else the largest
 * offered amount below it, else the smallest offered (the minimum bet, $2).
 */
export function openingDollars(offered: readonly number[], lastDollars: number | null): number {
  if (offered.length === 0) throw new Error('no bet amount is offered with this bankroll');
  if (lastDollars === null) return offered[0];
  if (offered.includes(lastDollars)) return lastDollars;
  const below = offered.filter((d) => d < lastDollars);
  return below.length > 0 ? below[below.length - 1] : offered[0];
}

/** Last race's stake, the amount the ticket tries to open at; null before the day's first bet. */
export function lastBetDollars(day: DayState): number | null {
  for (let i = day.records.length - 1; i >= 0; i--) {
    const t = day.records[i].ticket;
    if (t !== null) return t.dollars;
  }
  return null;
}

export interface ProgramKeyContext {
  /** Horses in the field. */
  horses: number;
  /** The odds are posted: the program exists. */
  ready: boolean;
  /** The amounts offered for the bankroll before this race's stake, rising. */
  offered: readonly number[];
  lastDollars: number | null;
}

/**
 * One key press, already past the held-key guard (betting-screens.md section 2). Choosing:
 * Up and Down wrap through the horses and Pass, 1 to 8 jump to a post, confirm opens the
 * ticket on a horse (not while the odds are pending) or passes on Pass, Esc does nothing.
 * Ticket open: Left and Right step through the offered amounts, confirm places the bet, Esc
 * closes it on the same horse. Placed: nothing.
 */
export function programKey(s: ProgramState, code: string, k: ProgramKeyContext): { state: ProgramState; outcome: ProgramOutcome } {
  const none = (state: ProgramState = s) => ({ state, outcome: null });
  const confirm = PROGRAM_CONFIRM_KEYS.includes(code);
  if (s.mode.kind === 'placed') return none();
  if (s.mode.kind === 'ticket') {
    const dollars = s.mode.dollars;
    const i = k.offered.indexOf(dollars);
    if (code === 'ArrowLeft' && i > 0) return none({ focus: s.focus, mode: { kind: 'ticket', dollars: k.offered[i - 1] } });
    if (code === 'ArrowRight' && i >= 0 && i < k.offered.length - 1) return none({ focus: s.focus, mode: { kind: 'ticket', dollars: k.offered[i + 1] } });
    if (code === 'Escape') return none({ focus: s.focus, mode: { kind: 'choosing' } });
    if (confirm) return { state: { focus: s.focus, mode: { kind: 'placed' } }, outcome: { kind: 'bet', post: s.focus + 1, dollars } };
    return none();
  }
  const stops = k.horses + 1;
  if (code === 'ArrowUp') return none({ focus: (s.focus - 1 + stops) % stops, mode: s.mode });
  if (code === 'ArrowDown') return none({ focus: (s.focus + 1) % stops, mode: s.mode });
  const digit = /^(Digit|Numpad)([1-9])$/.exec(code);
  if (digit) {
    const post = Number(digit[2]);
    return post <= k.horses ? none({ focus: post - 1, mode: s.mode }) : none();
  }
  if (!confirm) return none();
  if (s.focus === k.horses) return { state: s, outcome: { kind: 'pass' } };
  if (!k.ready || k.offered.length === 0) return none();
  return none({ focus: s.focus, mode: { kind: 'ticket', dollars: openingDollars(k.offered, k.lastDollars) } });
}

export interface ProgramInput {
  ctx: DayContext;
  rd: RaceDay;
  /** Looks for this field (blurbs), keyed by horse id. */
  look: CardLook;
  drawn: DrawnRace;
  /** Null while the estimate or the crowd is not finished: the odds are pending. */
  program: RaceProgram | null;
  /** The day as it stands: after Go to the post once the bet is placed, so the bank shows the stake gone. */
  day: DayState;
  state: ProgramState;
  /** The band's swipe on ticket open: frame 1 the left part, 2 the whole band. */
  bandFrame?: 1 | 2;
}

export interface ProgramScreen {
  paper: string;
  /** "Race 3 of 8" and "Bank $100.00", the race name (Maroon), track and distance, conditions. */
  header: PageText[];
  /** "Speed", "Stam.", "Kick", "Odds". */
  heads: PageText[];
  rules: PageRect[];
  /** The highlighter band on the horse being bet on; empty while choosing. Drawn under the entries. */
  band: PageRect[];
  /** One entry per horse by post, from that horse alone (CD4); the bet's tick when placed. */
  rows: Entry[];
  /** The odds column by post: the one figure that depends on the whole field. */
  odds: PageText[];
  /** The footer lines for the mode, or the printed ticket's two lines. */
  footer: PageText[];
  /** The printed tote ticket's slip, edge and border; empty unless the bet is placed. */
  slip: PageRect[];
  /** The horseshoe's top-left, or null while the printed ticket shows. */
  cursor: { x: number; y: number } | null;
}

/** The odds shown, by post: the betting code's, with the open ticket's amount in the pool (BP3); null while pending. */
export function shownOdds(input: Pick<ProgramInput, 'ctx' | 'program' | 'day' | 'state'>): string[] | null {
  const { ctx, program, day, state } = input;
  if (program === null) return null;
  if (state.mode.kind === 'ticket') return quote(ctx, program, { post: state.focus + 1, dollars: state.mode.dollars }).odds;
  const placed = day.open?.ticket ?? null;
  if (state.mode.kind === 'placed' && placed !== null) return quote(ctx, program, { post: placed.post, dollars: placed.dollars }).odds;
  return quote(ctx, program, null).odds;
}

/** The printed tote ticket: Bone fill, the torn top edge in Ink, Ink sides and bottom. */
export function toteSlip(): PageRect[] {
  const S = PROGRAM_PAGE.slip;
  const out: PageRect[] = [];
  for (let x = S.x0; x <= S.x1; x++) {
    const o = TORN_EDGE[(x - S.x0) % TORN_EDGE.length];
    out.push({ x, y: S.top + o + 1, w: 1, h: S.bottom - (S.top + o + 1), color: 'Bone' });
    out.push({ x, y: S.top + o, w: 1, h: 1, color: INK });
  }
  out.push({ x: S.x0, y: S.top, w: 1, h: S.bottom - S.top + 1, color: INK });
  out.push({ x: S.x1, y: S.top, w: 1, h: S.bottom - S.top + 1, color: INK });
  out.push({ x: S.x0, y: S.bottom, w: S.x1 - S.x0 + 1, h: 1, color: INK });
  return out;
}

export function programScreen(input: ProgramInput): ProgramScreen {
  const { ctx, rd, look, drawn, program, day, state } = input;
  const P = PROGRAM_PAGE;
  const copy = rd.copy;
  const horses = programHorses(drawn);
  const race = drawn.input.race;
  const range = drawn.input.tuning.statRange.value;
  const mode = state.mode;
  const placed = mode.kind === 'placed' ? day.open?.ticket ?? null : null;

  const bank = bankLine(copy, day.bankrollCents);
  const header: PageText[] = [
    { text: raceOfLine(copy, drawn.race, ctx.races.length), x: P.header.x, y: P.header.y, color: INK },
    { text: bank, x: rightAlignedX(bank, P.lastX), y: P.header.y, color: INK },
    { text: race.name, x: P.header.x, y: P.header.y + P.header.dy, color: SECOND_INK },
    { text: programPlaceLine(race, copy.card), x: P.header.x, y: P.header.y + 2 * P.header.dy, color: INK },
    { text: programConditionsLine(race, copy.card, copy.program.bias), x: P.header.x, y: P.header.y + 3 * P.header.dy, color: INK },
  ];
  const h = copy.program.heads;
  const heads: PageText[] = [
    ...BET_ENTRY.stats.map((s): PageText => ({ text: h[s.key], x: s.numberX, y: P.headsY, color: INK })),
    { text: h.odds, x: rightAlignedX(h.odds, P.lastX), y: P.headsY, color: INK },
  ];

  const tickPost = placed?.post ?? null;
  const rows = horses.map((x, i) => programEntry(x, programEntryTop(i), rd, clothFor(rd, x.post), range, x.post === tickPost, BET_ENTRY));
  const prices = shownOdds({ ctx, program, day, state });
  const odds = horses.map((x, i): PageText => {
    const text = prices === null ? PENDING_ODDS : prices[x.post - 1];
    return { text, x: rightAlignedX(text, P.lastX), y: programEntryTop(i) + P.oddsDy, color: INK };
  });

  const focus = Math.min(Math.max(0, state.focus), horses.length);
  const shape = rd.program.entryBand.value;
  const bandIndex = mode.kind === 'ticket' ? focus : placed !== null ? horses.findIndex((x) => x.post === placed.post) : -1;
  const band = bandIndex < 0 ? [] : bandRects(shape, programEntryTop(bandIndex) - 1, mode.kind === 'ticket' && input.bandFrame === 1 ? rd.program.swipeHalfX1.value : shape.x1);

  const [y1, y2] = P.footer.ys;
  let footer: PageText[];
  let cursor: ProgramScreen['cursor'];
  let slip: PageRect[] = [];
  if (placed !== null) {
    const name = horses.find((x) => x.post === placed.post)?.name ?? '';
    const lines = printedTicketLines(copy, drawn.race, placed.dollars, placed.post, name, placed.odds);
    footer = lines.map((text, i): PageText => ({ text, x: P.slip.textX, y: P.slip.textYs[i], color: INK }));
    slip = toteSlip();
    cursor = null;
  } else if (mode.kind === 'ticket' && program !== null) {
    const post = horses[focus].post;
    const offered = offeredAmounts(day.bankrollCents, ctx.rules);
    const pays = quote(ctx, program, { post, dollars: mode.dollars }).paysCents ?? 0;
    const confirm = copy.ticket.confirm;
    footer = [
      { text: ticketAmountLine(copy, mode.dollars, post, offered.length === 1), x: P.footer.labelX, y: y1, color: INK },
      { text: confirm, x: rightAlignedX(confirm, P.lastX), y: y1, color: INK },
      { text: ticketPaysLine(copy, mode.dollars, pays), x: P.footer.labelX, y: y2, color: INK },
    ];
    cursor = { x: P.cursorX, y: y1 };
  } else {
    const line1 = program === null ? copy.program.pending : focus === horses.length ? copy.program.passLine : look[horses[focus].id]?.blurb ?? '';
    footer = [
      { text: line1, x: P.footer.x, y: y1, color: INK },
      { text: copy.program.pass, x: P.footer.labelX, y: y2, color: INK },
    ];
    cursor = { x: P.cursorX, y: focus === horses.length ? y2 : programEntryTop(focus) + ENTRY.cursorDy };
  }

  return {
    paper: PAPER,
    header,
    heads,
    // The slip covers the y210 rule, which is not drawn while it shows.
    rules: P.rules.filter((y) => placed === null || y !== 210).map((y) => rule(y)),
    band,
    rows,
    odds,
    footer: footer.filter((t) => t.text !== ''),
    slip,
    cursor,
  };
}
