import { BOOK_ROW, type Hub, type HubTarget } from '../data/hubSchema';
import type { RaceDay } from '../data/raceDaySchema';
import { fillTemplate } from '../data/template';
import { quote, type DayContext, type DayState, type DrawnRace, type RaceProgram } from '../bet/day';
import { bankLine, raceOfLine } from './betCopy';
import { rightAlignedX, type PageRect, type PageText } from './page';
import { cursorFrame as bobFrame } from './pause';
import type { PointerTarget } from './pointer';

// The track between races (docs/specs/track-hub.md, DESIGN "The track (between races)"), as
// pure functions: the one focus and what a key, a hover or a click does to it, the outcome
// the scene acts on, what the screen draws for a state, and which person plays an idle at a
// given time. Every layout value and every line comes from hub.json; every price from
// src/bet. A look never touches the day: it only counts in the hub's own state (TH18).

/** DESIGN colors for the track's text and bars. */
export const HUB_TEXT = 'Bone';
export const HUB_DIGIT = 'Orange';
export const HUB_BAR = 'Navy';
export const HUB_BAR_LINE = 'Ash';
/** A price not yet posted: a Bone "-" right after its post digit. */
export const HUB_PENDING = '-';

/** Enter, Space or Z: act on the focus. */
export const HUB_CONFIRM_KEYS: readonly string[] = ['Enter', 'NumpadEnter', 'Space', 'KeyZ'];

/** The key each kind of track target stands for (TH15): a click on a door, a box row (Read, Bet, Watch) or a lookable is Enter with it focused. */
export const HUB_POINTER_KEYS: Readonly<Record<'door' | 'doorRow' | 'lookable', readonly string[]>> = { door: ['Enter'], doorRow: ['Enter'], lookable: ['Enter'] };

export interface HubState {
  /** The one focus: a target id from hub.json, or BOOK_ROW for the box's Read row (no picture target). */
  focus: string;
  /** Looks per lookable this day. Lives in the day session, reset on New day, never in storage. */
  looks: Readonly<Record<string, number>>;
  /** The focused lookable has been looked at since focus came to it, so voice row 2 shows its line. */
  lineShown: boolean;
  /** The rail was chosen while prices were pending: the race starts the frame they post (TH7). */
  railWaiting: boolean;
}

/**
 * What the scene does next. `look` changes nothing in the flow; the scene restarts the idle
 * clock with it (idleAfterLook) and mirrors the line to aria-live.
 */
export type HubOutcome = { kind: 'window'; post: number } | { kind: 'book' } | { kind: 'watch' } | { kind: 'look'; id: string } | null;

export interface HubKeyContext {
  /** Horses in this race's field: digits 1 to this open the window. */
  fieldSize: number;
  /** The prices are posted (the program exists). */
  ready: boolean;
}

type Door = Extract<HubTarget, { kind: 'door' }>;

const targetOf = (hub: Hub, id: string): HubTarget => {
  const t = hub.targets.value.find((x) => x.id === id);
  if (t === undefined) throw new Error(`hub: no target "${id}"`);
  return t;
};
/** The box's rows top to bottom (Read, Bet, Watch): Up and Down step through these ids. */
const rowIds = (hub: Hub): string[] => hub.box.value.doorRows.map((r) => r.door);
/** The focus is a picture target (not the Read row): only then are the focus corners drawn (book-and-window.md amendment 19). */
export const isPictureTarget = (hub: Hub, id: string): boolean => hub.targets.value.some((t) => t.id === id);
const doorWith = (hub: Hub, action: Door['action']): Door => {
  const d = hub.targets.value.find((t): t is Door => t.kind === 'door' && t.action === action);
  if (d === undefined) throw new Error(`hub: no door with action "${action}"`);
  return d;
};
/** Windows: the door that opens the window screen. Focus comes back here from the book or the window (FL2). */
export const windowsId = (hub: Hub): string => doorWith(hub, 'window').id;

/** Where the track's focus lands: `arrival` from the Result and at day start, `back` from the book or the window (FL1, FL2). */
export type HubArrival = 'arrival' | 'back';

/** FL1, FL2: arriving at the track, focus is Read; back from the book or the window, Bet. Looks carry over within the day. */
export const arriveHub = (hub: Hub, looks: Readonly<Record<string, number>> = {}, from: HubArrival = 'arrival'): HubState =>
  ({ focus: hub.focus.value[from], looks, lineShown: false, railWaiting: false });

/** The day's first arrival: no looks yet. */
export const initialHubState = (hub: Hub): HubState => arriveHub(hub);

const focusOn = (s: HubState, id: string): HubState => (id === s.focus ? s : { ...s, focus: id, lineShown: false });

/** Enter, Space, Z or a click on target `id`, with focus already there. */
function act(hub: Hub, s: HubState, id: string, k: HubKeyContext): { state: HubState; outcome: HubOutcome } {
  if (id === BOOK_ROW) return { state: s, outcome: { kind: 'book' } };
  const t = targetOf(hub, id);
  if (t.kind === 'door') {
    if (t.action === 'window') return { state: s, outcome: { kind: 'window', post: 1 } };
    if (k.ready) return { state: s, outcome: { kind: 'watch' } };
    return { state: { ...s, railWaiting: true }, outcome: null };
  }
  const looks = { ...s.looks, [id]: (s.looks[id] ?? 0) + 1 };
  return { state: { ...s, looks, lineShown: true }, outcome: { kind: 'look', id } };
}

/**
 * One key press, already past the held-key guard (book-and-window.md section 2, FL3, FL4, TH7).
 * Left and Right step through every picture target in picture order, wrapping; from the Read
 * row (no picture target) they step from the windows' place, as from Bet. Up and Down step
 * through the box's rows (Read, Bet, Watch), wrapping, and from a lookable go to Read. Esc on a
 * lookable goes to Read, on a row does nothing. Digits 1 to the field size open the window at
 * that post from any focus. Enter, Space or Z acts. While the rail waits on prices, Esc
 * cancels and no other key acts.
 */
export function hubKey(hub: Hub, s: HubState, code: string, k: HubKeyContext): { state: HubState; outcome: HubOutcome } {
  const none = (state: HubState = s) => ({ state, outcome: null });
  // TH7: during the wait Esc cancels and every other key does nothing (a click elsewhere also cancels, hubClick).
  if (s.railWaiting) return code === 'Escape' ? none({ ...s, railWaiting: false }) : none();

  const digit = /^(Digit|Numpad)([1-9])$/.exec(code);
  if (digit) {
    const post = Number(digit[2]);
    return post <= k.fieldSize ? { state: s, outcome: { kind: 'window', post } } : none();
  }
  const onLookable = isPictureTarget(hub, s.focus) && targetOf(hub, s.focus).kind === 'lookable';
  const fromLookable = hub.focus.value.fromLookable;
  if (code === 'ArrowLeft' || code === 'ArrowRight') {
    const order = hub.targetOrder.value;
    const i = order.indexOf(s.focus);
    const step = code === 'ArrowRight' ? 1 : -1;
    // Guess (the spec is silent): Read is not in the picture, so Left and Right step from the windows' place, as from Bet.
    const from = i >= 0 ? i : order.indexOf(windowsId(hub));
    return none(focusOn(s, order[(from + step + order.length) % order.length]));
  }
  if (code === 'ArrowUp' || code === 'ArrowDown') {
    if (onLookable) return none(focusOn(s, fromLookable));
    const rows = rowIds(hub);
    const i = rows.indexOf(s.focus);
    const step = code === 'ArrowDown' ? 1 : -1;
    return none(focusOn(s, rows[(i + step + rows.length) % rows.length]));
  }
  if (code === 'Escape') return onLookable ? none(focusOn(s, fromLookable)) : none();
  if (HUB_CONFIRM_KEYS.includes(code)) return act(hub, s, s.focus, k);
  return none();
}

/** The pointer moved into target `id` (pointer.ts pointerMove's `entered`): focus goes there (TH4). Not while the rail waits. */
export const hubHover = (s: HubState, id: string): HubState => (s.railWaiting ? s : focusOn(s, id));

/** A finished click on target `id` (pointer.ts pointerUp's `act`): the same as focusing it and pressing Enter (TH12). */
export function hubClick(hub: Hub, s: HubState, id: string, k: HubKeyContext): { state: HubState; outcome: HubOutcome } {
  // TH7 ruling: during the wait a click on the rail does nothing; a click on any other target
  // cancels the wait and moves focus there, and does nothing else, so a mouse-only player can back out.
  if (s.railWaiting) {
    if (id === doorWith(hub, 'watch').id) return { state: s, outcome: null };
    return { state: focusOn({ ...s, railWaiting: false }, id), outcome: null };
  }
  return act(hub, focusOn(s, id), id, k);
}

/** The prices posted: a rail choice that was waiting goes to the post now (TH7). */
export function hubPricesPosted(s: HubState): { state: HubState; outcome: HubOutcome } {
  if (!s.railWaiting) return { state: s, outcome: null };
  return { state: { ...s, railWaiting: false }, outcome: { kind: 'watch' } };
}

/**
 * The track's pointer targets, for pointer.ts hitTest: every target's hit box, then each row
 * in the box (Read, Bet, Watch), which acts as its door or opens the book. Everything else
 * does nothing when clicked.
 */
export function hubPointerTargets(hub: Hub): PointerTarget[] {
  return [
    ...hub.targets.value.map((t) => ({ id: t.id, box: t.hit })),
    ...hub.box.value.doorRows.map((r) => ({ id: r.door, box: r.item })),
  ];
}

/** The line a lookable shows after `looks` looks: line 1 on the first, in a fixed cycle. Null before any. */
export function lookLine(hub: Hub, id: string, looks: number): string | null {
  const lines = hub.copy.lookables[id]?.lines ?? [];
  if (looks < 1 || lines.length === 0) return null;
  return lines[(looks - 1) % lines.length];
}

/** Race r's flavor line: line r, wrapping, and the last race always the last line. */
export function flavorLine(hub: Hub, race: number, races: number): string {
  const f = hub.copy.flavor;
  return race === races ? f[f.length - 1] : f[(race - 1) % f.length];
}

/** Voice row 1 with a door focused: a plain fact about the next race. */
export function stateLine(hub: Hub, rd: RaceDay, race: number, races: number, ready: boolean): string {
  if (!ready) return rd.copy.program.pending;
  // Guess: on a one-race day the last-race line wins over the first-race line.
  if (race === races) return hub.copy.state.last;
  if (race === 1) return hub.copy.state.first;
  return fillTemplate(hub.copy.state.next, { r: race });
}

/** The sky bands for race r: the last step of skyByRace that starts at r or before. */
export function skyFor(hub: Hub, race: number): PageRect[] {
  const steps = hub.skyByRace.value;
  let step = steps[0];
  for (const s of steps) if (s.fromRace <= race) step = s;
  return step.bands.map((b) => ({ x: 0, y: b.y0, w: 256, h: b.y1 - b.y0 + 1, color: b.color }));
}

export interface HubInput {
  hub: Hub;
  /** The race-day copy: the status bar and the pending line reuse program.race, program.bank and program.pending. */
  rd: RaceDay;
  ctx: DayContext;
  day: DayState;
  /** The next race, drawn: its number and field size are known before its prices. */
  drawn: DrawnRace;
  /** Null while the crowd is still betting: the board shows dashes. */
  program: RaceProgram | null;
  state: HubState;
  /** Seconds on this screen, for the cursor and corner bob. */
  seconds: number;
  /** prefers-reduced-motion: nothing bobs (TH16). */
  reducedMotion: boolean;
  /**
   * Frames in the horseshoe art the scene has loaded (Art.frames(SLOT_IDS.cursor)). With one
   * (a stand-in), the cursor shows frame 0, as on the other screens, and so do the corners.
   * Omitted means the shipped slot's 2.
   */
  cursorFrames?: number;
}

/** One focus corner: an 8x8 image of art.ui.focus.corner at its top-left. */
export interface HubCorner { x: number; y: number; frame: 'top' | 'bottom'; flipX: boolean }

export interface HubBoardPost { post: number; digit: PageText; price: PageText }

export interface HubScreen {
  /** Sky bands for this race, drawn first. */
  sky: PageRect[];
  /** The status bar's Navy fill and Ash line. */
  bar: PageRect[];
  /** "Race 3 of 8" and "Bank $100.00", main font. */
  status: PageText[];
  /** "Windows" on the sign plate, main font. */
  sign: PageText;
  /** The tote board's header (main font) and, per running post, its digit and price (small font). */
  board: { header: PageText; posts: HubBoardPost[] };
  /** Voice rows 1 and 2; an empty row is left out. */
  voice: PageText[];
  /** The box's row labels: Read, Bet, Watch. */
  doors: PageText[];
  /** The horseshoe's top-left: exactly one, on the focused row or beside a lookable's name. */
  cursor: { x: number; y: number };
  /** The frame the scene sets on the horseshoe; the corners bob with it, so the two read as one focus. */
  cursorFrame: number;
  /** The four focus corners around the focused picture target's focus box; none with Read focused (amendment 19). */
  corners: HubCorner[];
  /** The aria-live text: race, bank, the voice rows and the focused row. Never a price or the estimate (TH9). */
  aria: string;
}

const sentence = (s: string): string => (/[.!?]$/.test(s) ? s : `${s}.`);

export function hubScreen(input: HubInput): HubScreen {
  const { hub, rd, ctx, day, drawn, program, state } = input;
  const race = drawn.race;
  const races = ctx.races.length;
  const ready = program !== null;
  const B = hub.box.value;
  const text = (t: string, x: number, y: number, color = HUB_TEXT, small = false): PageText => (small ? { text: t, x, y, color, small } : { text: t, x, y, color });

  // Status bar.
  const S = hub.statusBar.value;
  const bar: PageRect[] = [
    { x: 0, y: S.fill.y0, w: 256, h: S.fill.y1 - S.fill.y0 + 1, color: HUB_BAR },
    { x: 0, y: S.lineY, w: 256, h: 1, color: HUB_BAR_LINE },
  ];
  const raceOf = raceOfLine(rd.copy, race, races);
  const bank = bankLine(rd.copy, day.bankrollCents);
  const status = [text(raceOf, S.raceX, S.top), text(bank, rightAlignedX(bank, S.bankLastX), S.top)];

  // The sign, centered on its plate.
  const plate = hub.sign.value.plate;
  const word = hub.copy.sign.windows;
  const sign = text(word, plate.x0 + Math.floor((plate.x1 - plate.x0 + 1 - 8 * word.length) / 2), hub.sign.value.top);

  // The tote board (TH8): the crowd's prices with no bet in the pool, or dashes while pending.
  const T = hub.toteBoard.value;
  const odds = program === null ? null : quote(ctx, program, null).odds;
  const fieldSize = drawn.horseIds.length;
  const posts: HubBoardPost[] = [];
  for (let post = 1; post <= Math.min(fieldSize, T.perRow * T.rowTops.length); post++) {
    const j = (post - 1) % T.perRow;
    const y = T.rowTops[Math.floor((post - 1) / T.perRow)];
    posts.push({
      post,
      digit: text(String(post), T.digitX + T.pitch * j, y, HUB_DIGIT, true),
      price: text(odds === null ? HUB_PENDING : odds[post - 1], T.priceX + T.pitch * j, y, HUB_TEXT, true),
    });
  }
  const header = text(fillTemplate(hub.copy.board.race, { r: race }), T.header.x, T.header.y);

  // The box.
  const focused = isPictureTarget(hub, state.focus) ? targetOf(hub, state.focus) : null;
  const [v1, v2] = B.voiceTops;
  let voice: PageText[];
  let cursor: { x: number; y: number };
  if (focused?.kind === 'lookable') {
    const line = state.lineShown ? lookLine(hub, focused.id, state.looks[focused.id] ?? 0) : null;
    voice = [text(hub.copy.lookables[focused.id]?.name ?? '', B.textX, v1), ...(line === null ? [] : [text(line, B.textX, v2)])];
    cursor = { x: B.cursorX, y: v1 };
  } else {
    const rows: [string, string] = state.railWaiting
      ? [hub.copy.state.toRail, hub.copy.state.toRailSecond]
      : [stateLine(hub, rd, race, races, ready), flavorLine(hub, race, races)];
    voice = [text(rows[0], B.textX, v1), text(rows[1], B.textX, v2)];
    cursor = { x: B.cursorX, y: B.doorRows.find((r) => r.door === state.focus)!.top };
  }
  const doors = B.doorRows.map((r) => text(fillTemplate(hub.copy.doors[r.door] ?? '', { r: race }), B.textX, r.top));

  const { cursorFrame: frame, corners } = hubFocusMarks(input);

  const row = B.doorRows.findIndex((r) => r.door === state.focus);
  const focusLabel = row >= 0 ? [doors[row].text] : [];
  const aria = [raceOf, bank, ...voice.map((t) => t.text), ...focusLabel].filter((t) => t !== '').map(sentence).join(' ');

  return { sky: skyFor(hub, race), bar, status, sign, board: { header, posts }, voice, doors, cursor, cursorFrame: frame, corners, aria };
}

/**
 * The part of the screen that moves with the clock: the cursor's bob frame and the focus
 * corners, which bob 1 px outward on the same frame. The scene recomputes only this each
 * frame and keeps the rest of hubScreen's output until the state or the prices change.
 */
export function hubFocusMarks(input: Pick<HubInput, 'hub' | 'rd' | 'state' | 'seconds' | 'reducedMotion' | 'cursorFrames'>): { cursorFrame: number; corners: HubCorner[] } {
  const { hub, rd } = input;
  const frame = input.reducedMotion || (input.cursorFrames ?? 2) < 2 ? 0 : bobFrame(input.seconds, rd.ambient.cursorSwapsPerSecond.value);
  const d = frame === 1 ? hub.cornerBobPx.value : 0;
  // Read has no picture target, so no corners (book-and-window.md amendment 19, TB1).
  if (!isPictureTarget(hub, input.state.focus)) return { cursorFrame: frame, corners: [] };
  // The outer corner of each mark on the focus box's corner.
  const f = targetOf(hub, input.state.focus).focus;
  const corners: HubCorner[] = [
    { x: f.x0 - d, y: f.y0 - d, frame: 'top', flipX: false },
    { x: f.x1 - 7 + d, y: f.y0 - d, frame: 'top', flipX: true },
    { x: f.x0 - d, y: f.y1 - 7 + d, frame: 'bottom', flipX: false },
    { x: f.x1 - 7 + d, y: f.y1 - 7 + d, frame: 'bottom', flipX: true },
  ];
  return { cursorFrame: frame, corners };
}

// ------------------------------------------------------------- idles (render only)

/**
 * The idle rotation's clock (DESIGN, Motion). Every `everySeconds` after `since` one person
 * plays A, B, A, B and ends on A, in the fixed order from `next`. A look plays its person at
 * `since` at once. Times are the scene's own seconds on this screen; no RNG.
 */
export interface IdleClock { since: number; next: number; look: string | null }

/** Arrival: the first turn comes `everySeconds` in, with the first person in the order. */
export const idleClock = (seconds = 0): IdleClock => ({ since: seconds, next: 0, look: null });

/**
 * A look at `lookable` at `seconds`: its person plays at once, the count restarts, and the
 * rotation goes on with whoever was next. Guess: "goes on from the next in order" is read as
 * the next unplayed turn, not the person after the looked-at one. A lookable with no person
 * (the board) leaves the clock as it was (guess: nothing plays, so nothing takes the turn).
 */
export function idleAfterLook(hub: Hub, clock: IdleClock, seconds: number, lookable: string): IdleClock {
  const t = targetOf(hub, lookable);
  if (t.kind !== 'lookable' || t.idle === null) return clock;
  const I = hub.idle.value;
  const started = Math.max(0, Math.floor((seconds - clock.since) / I.everySeconds));
  return { since: seconds, next: (clock.next + started) % I.order.length, look: t.idle };
}

/** Who is playing an idle at `seconds`, and on which frame (0 is A, 1 is B), or null: everyone on A. */
export function idleAt(hub: Hub, clock: IdleClock, seconds: number, reducedMotion: boolean): { person: string; frame: number } | null {
  if (reducedMotion) return null;
  const I = hub.idle.value;
  const dt = seconds - clock.since;
  if (dt < 0) return null;
  const length = I.steps * I.stepSeconds;
  const step = (local: number) => Math.floor(local / I.stepSeconds) % 2;
  if (clock.look !== null && dt < length) return { person: clock.look, frame: step(dt) };
  const k = Math.floor(dt / I.everySeconds);
  if (k < 1) return null;
  const local = dt - k * I.everySeconds;
  if (local >= length) return null;
  return { person: I.order[(clock.next + k - 1) % I.order.length], frame: step(local) };
}
