import type { Hub } from '../data/hubSchema';
import type { RaceDay } from '../data/raceDaySchema';
import { fillTemplate } from '../data/template';
import { quote, type DayContext, type DayState, type DrawnRace, type RaceProgram } from '../bet/day';
import { offeredAmounts } from '../bet/money';
import { bankLine, printedTicketLines, raceOfLine, ticketAmountLine, ticketPaysLine } from './betCopy';
import { HUB_BAR, HUB_BAR_LINE, HUB_TEXT } from './hubScreen';
import { clothFor, rightAlignedX, type PageRect, type PageText } from './page';
import type { PointerTarget } from './pointer';
import {
  PENDING_ODDS, PROGRAM_CONFIRM_KEYS, PROGRAM_PAGE, openingDollars, programHorses, shownOdds, toteSlip,
  type ProgramKeyContext, type ProgramMode, type ProgramState,
} from './programScreen';
import { SLOT_IDS } from './slotStatus';

// The window (docs/specs/book-and-window.md sections 7, 9 and 10), as pure functions: the
// only place a bet is placed. A still close-up of the booth with the clerk above, a Navy box
// below listing the field by post, name and odds, then the approved ticket and, on Enter, the
// approved printed tote ticket. What a key or a click does, what the screen draws for a
// state, which line the clerk says and which frame he is on. Every layout value and line is
// from hub.json, every price from src/bet. The clerk's cycles count in the day session.

/** The window's art (slots.json). The clerk is drawn fresh at close-up size (art-director 19.3). */
export const WINDOW_SLOTS = {
  booth: 'art.window.booth',
  clerk: 'art.window.clerk',
  program: 'art.window.program',
} as const;

/** The slots the window draws, for the placeholder tag. */
export const WINDOW_SLOT_IDS: readonly string[] = [
  ...Object.values(WINDOW_SLOTS), SLOT_IDS.fontMain, SLOT_IDS.fontSmall, SLOT_IDS.frameBox, SLOT_IDS.cursor, SLOT_IDS.markerYours, SLOT_IDS.placeholderTag,
];

/** The saddlecloth box on Navy: the race HUD strip's 12x10 box with a 1 px Ash border (DESIGN: boxes on Navy get Ash). */
export const WINDOW_BOX = { w: 12, h: 10, dy: -1, border: 'Ash' } as const;

/** Choosing, the ticket open on `focus`, or the bet beat. The same shape as the program page's, with no Pass stop. */
export type WindowState = ProgramState;
export type WindowMode = ProgramMode;

/** `back`: Esc while choosing, to the track with focus on Bet. `bet`: place it (the scene calls goToPost). */
export type WindowOutcome = { kind: 'bet'; post: number; dollars: number } | { kind: 'back' } | null;

/** WI3, BP5 as amended (7): choosing on post `post` (1 from Bet or the windows, k from digit k at the track). */
export const initialWindowState = (post = 1): WindowState => ({ focus: post - 1, mode: { kind: 'choosing' } });

/**
 * The window opened from the book (section 2, BB4): the ticket already open on `post` at the
 * remembered amount (BP7). With nothing offered or no prices, choosing on that post instead.
 */
export function windowFromBook(post: number, k: ProgramKeyContext): WindowState {
  if (!k.ready || k.offered.length === 0) return initialWindowState(post);
  return { focus: post - 1, mode: { kind: 'ticket', dollars: openingDollars(k.offered, k.lastDollars) } };
}

/**
 * One key press, past the held-key guard (section 2). Choosing: Up and Down wrap through the
 * posts (no Pass), 1 to 8 jump, Enter, Space or Z opens the ticket (not while pending), Esc
 * goes back to the track. Ticket open: Left and Right step the offered amounts, confirm
 * places the bet, Esc closes the ticket on the same horse. The bet beat: nothing.
 */
export function windowKey(s: WindowState, code: string, k: ProgramKeyContext): { state: WindowState; outcome: WindowOutcome } {
  const none = (state: WindowState = s) => ({ state, outcome: null });
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
  const n = k.horses;
  if (code === 'ArrowUp') return none({ focus: (s.focus - 1 + n) % n, mode: s.mode });
  if (code === 'ArrowDown') return none({ focus: (s.focus + 1) % n, mode: s.mode });
  const digit = /^(Digit|Numpad)([1-9])$/.exec(code);
  if (digit) {
    const post = Number(digit[2]);
    return post <= n ? none({ focus: post - 1, mode: s.mode }) : none();
  }
  if (code === 'Escape') return { state: s, outcome: { kind: 'back' } };
  if (!confirm || !k.ready || k.offered.length === 0) return none();
  return none({ focus: s.focus, mode: { kind: 'ticket', dollars: openingDollars(k.offered, k.lastDollars) } });
}

/** Row i's cell top (i = 0 is post 1). */
export const windowRowTop = (hub: Hub, i: number): number => hub.window.value.rows.firstTop + hub.window.value.rows.pitch * i;

// ------------------------------------------------------------- the clerk

/** The line for a cycle after `uses` uses: the first line on the first use, in a fixed order, no RNG (section 7). */
export const cycleLine = (lines: readonly string[], uses: number): string => lines[(Math.max(1, uses) - 1) % lines.length];

/**
 * The clerk's line (section 7): pending, choosing, the ticket's cycle or the bet's. `ticketUses`
 * and `punchUses` count this day's tickets opened and bets placed, the current one included.
 */
export function clerkLine(hub: Hub, rd: RaceDay, mode: WindowMode['kind'], ready: boolean, race: number, ticketUses: number, punchUses: number): string {
  const c = hub.copy.window;
  if (mode === 'placed') return cycleLine(c.punch, punchUses);
  if (mode === 'ticket') return cycleLine(c.ticket, ticketUses);
  if (!ready) return rd.copy.program.pending;
  return fillTemplate(c.choose, { r: race });
}

/**
 * The clerk's frame (0 rest, 1 stamp). The bet beat plays the stamp once: frame 1 for one
 * idle step, then rest. Otherwise the track's idle rule for one person: every `everySeconds`
 * he plays rest, stamp, rest, stamp at `stepSeconds` a step and ends on rest. With reduced
 * motion, nothing moves. Render only, no RNG.
 */
export function clerkFrame(hub: Hub, seconds: number, beatSeconds: number | null, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  const I = hub.idle.value;
  if (beatSeconds !== null) return beatSeconds < I.stepSeconds ? 1 : 0;
  const k = Math.floor(seconds / I.everySeconds);
  if (k < 1) return 0;
  const local = seconds - k * I.everySeconds;
  if (local >= I.steps * I.stepSeconds) return 0;
  return Math.floor(local / I.stepSeconds) % 2;
}

// ------------------------------------------------------------- the screen

export interface WindowInput {
  hub: Hub;
  rd: RaceDay;
  ctx: DayContext;
  /** The day as it stands: after Go to the post once the bet is placed, so the bank shows the stake gone. */
  day: DayState;
  drawn: DrawnRace;
  /** Null while the crowd is still betting: every odds "-". */
  program: RaceProgram | null;
  state: WindowState;
  /** This day's clerk cycle uses, the current ticket or bet included. */
  clerk: { ticket: number; punch: number };
}

export interface WindowRow {
  post: number;
  /** The 12x10 box: Ash border, then the saddlecloth fill. */
  rects: PageRect[];
  /** The small-font post number, the name and the odds. */
  texts: PageText[];
}

export interface WindowScreen {
  /** The status bar's Navy fill and Ash line, as the track's. */
  bar: PageRect[];
  /** "Race 3 of 8" and "Bank $100.00". */
  status: PageText[];
  /** "Windows" on the sign plate in the picture. */
  sign: PageText;
  clerkLine: PageText;
  rows: WindowRow[];
  /** The 1 px Ash line under the list. */
  line: PageRect;
  /** The ticket rows: "Esc: back" while choosing; the amount, "Enter: bet" and the pays line with the ticket open; the slip's two lines on the bet. */
  ticket: PageText[];
  /** The printed tote ticket, from its torn edge down, on the bet beat. Empty otherwise. */
  slip: PageRect[];
  /** The bobbing horseshoe: on the focused row while choosing, on ticket row 1 with it open; null on the bet beat. */
  cursor: { x: number; y: number } | null;
  /** The yours marker on the row of the horse being bet on (ticket open or placed); null while choosing. */
  marker: { x: number; y: number } | null;
  /** The aria-live text: race, bank, the clerk's line, the focused row, the ticket rows. Never the estimate. */
  aria: string;
}

const sentence = (s: string): string => (/[.!?]$/.test(s) ? s : `${s}.`);

export function windowScreen(input: WindowInput): WindowScreen {
  const { hub, rd, ctx, day, drawn, program, state } = input;
  const W = hub.window.value;
  const copy = rd.copy;
  const races = ctx.races.length;
  const horses = programHorses(drawn);
  const text = (t: string, x: number, y: number, small = false): PageText => (small ? { text: t, x, y, color: HUB_TEXT, small } : { text: t, x, y, color: HUB_TEXT });

  const S = hub.statusBar.value;
  const bar: PageRect[] = [
    { x: 0, y: S.fill.y0, w: 256, h: S.fill.y1 - S.fill.y0 + 1, color: HUB_BAR },
    { x: 0, y: S.lineY, w: 256, h: 1, color: HUB_BAR_LINE },
  ];
  const raceOf = raceOfLine(copy, drawn.race, races);
  const bank = bankLine(copy, day.bankrollCents);
  const status = [text(raceOf, S.raceX, S.top), text(bank, rightAlignedX(bank, S.bankLastX), S.top)];

  const plate = W.sign.plate;
  const word = hub.copy.sign.windows;
  const sign = text(word, plate.x0 + Math.floor((plate.x1 - plate.x0 + 1 - 8 * word.length) / 2), W.sign.top);

  const mode = state.mode.kind;
  const said = clerkLine(hub, rd, mode, program !== null, drawn.race, input.clerk.ticket, input.clerk.punch);
  const clerk = text(said, W.clerkLine.x, W.clerkLine.top);

  // WI1: post box, name, odds. With the ticket open the odds carry its amount (BP3).
  const prices = shownOdds({ ctx, program, day, state });
  const R = W.rows;
  const rows: WindowRow[] = horses.map((h, i) => {
    const top = windowRowTop(hub, i);
    const cloth = clothFor(rd, h.post);
    const num = String(h.post);
    const by = top + WINDOW_BOX.dy;
    const odds = prices === null ? PENDING_ODDS : prices[h.post - 1];
    return {
      post: h.post,
      rects: [
        { x: R.boxX, y: by, w: WINDOW_BOX.w, h: WINDOW_BOX.h, color: WINDOW_BOX.border },
        { x: R.boxX + 1, y: by + 1, w: WINDOW_BOX.w - 2, h: WINDOW_BOX.h - 2, color: cloth.fill },
      ],
      texts: [
        { text: num, x: R.boxX + Math.floor((WINDOW_BOX.w - 4 * num.length) / 2), y: by + 2, color: cloth.number, small: true },
        text(h.name, R.nameX, top),
        text(odds, rightAlignedX(odds, R.oddsLastX), top),
      ],
    };
  });
  const line: PageRect = { x: W.line.x0, y: W.line.y, w: W.line.x1 - W.line.x0 + 1, h: 1, color: HUB_BAR_LINE };

  const T = W.ticket;
  const focus = Math.min(Math.max(0, state.focus), horses.length - 1);
  const focusTop = windowRowTop(hub, focus);
  let ticket: PageText[];
  let slip: PageRect[] = [];
  let cursor: WindowScreen['cursor'] = null;
  let marker: WindowScreen['marker'] = null;
  const placed = mode === 'placed' ? day.open?.ticket ?? null : null;
  if (placed !== null) {
    const name = horses.find((x) => x.post === placed.post)?.name ?? '';
    const lines = printedTicketLines(copy, drawn.race, placed.dollars, placed.post, name, placed.odds);
    ticket = lines.map((t, i): PageText => ({ text: t, x: PROGRAM_PAGE.slip.textX, y: PROGRAM_PAGE.slip.textYs[i], color: 'Ink' }));
    slip = toteSlip();
    marker = { x: R.cursorX, y: windowRowTop(hub, horses.findIndex((x) => x.post === placed.post)) };
  } else if (state.mode.kind === 'ticket' && program !== null) {
    const post = horses[focus].post;
    const offered = offeredAmounts(day.bankrollCents, ctx.rules);
    const pays = quote(ctx, program, { post, dollars: state.mode.dollars }).paysCents ?? 0;
    const confirm = copy.ticket.confirm;
    ticket = [
      text(ticketAmountLine(copy, state.mode.dollars, post, offered.length === 1), T.textX, T.tops[0]),
      text(confirm, rightAlignedX(confirm, T.lastX), T.tops[0]),
      text(ticketPaysLine(copy, state.mode.dollars, pays), T.textX, T.tops[1]),
    ];
    cursor = { x: T.cursorX, y: T.tops[0] };
    marker = { x: R.cursorX, y: focusTop };
  } else {
    const back = hub.copy.window.back;
    ticket = [text(back, rightAlignedX(back, T.lastX), T.tops[1])];
    cursor = { x: R.cursorX, y: focusTop };
  }

  const h = horses[focus];
  const focusOdds = prices === null ? PENDING_ODDS : prices[h.post - 1];
  const aria = [raceOf, bank, said, `#${h.post} ${h.name}, ${focusOdds}`, ...ticket.map((t) => t.text)].map(sentence).join(' ');
  return { bar, status, sign, clerkLine: clerk, rows, line, ticket, slip, cursor, marker, aria };
}

// ------------------------------------------------------------- the mouse (section 10)

/** Pointer target ids: `row:k` for post k, and the ticket rows' items. */
export type WindowTargetId = `row:${number}` | 'back' | 'less' | 'more' | 'bet';

/** The key each kind of target stands for (TH15): row k is digit k then Enter; the rest their own key. */
export const WINDOW_POINTER_KEYS: Readonly<Record<'row' | 'back' | 'less' | 'more' | 'bet', readonly string[]>> = {
  row: ['Digit{k}', 'Enter'], back: ['Escape'], less: ['ArrowLeft'], more: ['ArrowRight'], bet: ['Enter'],
};

/**
 * What the window can be clicked on (section 10). Choosing: every row and "Esc: back". Ticket
 * open: every other row (the one being bet is not a target, so a double click never bets),
 * "<" and ">" only with more than one amount, and "Enter: bet". The bet beat: nothing. The
 * picture and the clerk are never targets.
 */
export function windowPointerTargets(hub: Hub, rd: RaceDay, s: WindowState, k: ProgramKeyContext): PointerTarget<WindowTargetId>[] {
  const W = hub.window.value;
  if (s.mode.kind === 'placed') return [];
  const row = (post: number): PointerTarget<WindowTargetId> => {
    const top = windowRowTop(hub, post - 1);
    return { id: `row:${post}`, box: { x0: W.rows.hit.x0, y0: top + W.rows.hit.dy0, x1: W.rows.hit.x1, y1: top + W.rows.hit.dy1 } };
  };
  const posts = Array.from({ length: k.horses }, (_, i) => i + 1);
  if (s.mode.kind === 'choosing') return [...posts.map(row), { id: 'back', box: W.ticket.back }];
  const out = posts.filter((p) => p !== s.focus + 1).map(row);
  if (k.offered.length > 1) {
    const text = ticketAmountLine(rd.copy, s.mode.dollars, s.focus + 1, false);
    const A = W.ticket.arrows;
    const glyph = (ch: '<' | '>') => {
      const x = W.ticket.textX + 8 * text.indexOf(ch);
      return { x0: x - A.pad, y0: A.y0, x1: x + 7 + A.pad, y1: A.y1 };
    };
    if (text.includes('<')) out.push({ id: 'less', box: glyph('<') });
    if (text.includes('>')) out.push({ id: 'more', box: glyph('>') });
  }
  out.push({ id: 'bet', box: W.ticket.bet });
  return out;
}

/**
 * A finished click (WI5), as the keys it stands for. Choosing: a row focuses that post and
 * presses Enter (pending: focus only, as Enter does nothing), "Esc: back" is Esc. Ticket open:
 * "<" and ">" are Left and Right, "Enter: bet" is Enter, another row is Esc then the ticket on
 * that horse at the same amount, the row being bet does nothing. The bet beat: nothing.
 */
export function windowClick(s: WindowState, id: WindowTargetId, k: ProgramKeyContext): { state: WindowState; outcome: WindowOutcome } {
  const none = { state: s, outcome: null };
  const row = /^row:(\d+)$/.exec(id);
  const post = row ? Number(row[1]) : null;
  if (s.mode.kind === 'placed') return none;
  if (s.mode.kind === 'ticket') {
    if (post !== null) {
      if (post === s.focus + 1 || post < 1 || post > k.horses) return none;
      return { state: { focus: post - 1, mode: { kind: 'ticket', dollars: s.mode.dollars } }, outcome: null };
    }
    if (id === 'less') return windowKey(s, 'ArrowLeft', k);
    if (id === 'more') return windowKey(s, 'ArrowRight', k);
    if (id === 'bet') return windowKey(s, 'Enter', k);
    return none;
  }
  if (post !== null) {
    if (post < 1 || post > k.horses) return none;
    return windowKey({ focus: post - 1, mode: s.mode }, 'Enter', k);
  }
  if (id === 'back') return windowKey(s, 'Escape', k);
  return none;
}
