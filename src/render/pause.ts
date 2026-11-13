// The pause box (spec 4.3): framed at x64-191, y24-71, in the sky so it never covers the
// horses, with a title, Resume and Back to card, and the horseshoe cursor on its 2-frame
// bob. The cursor's bob runs on its own clock: nothing in the race advances while paused.

export const PAUSE_BOX = { x: 64, y: 24, tilesW: 16, tilesH: 6 } as const;
export const PAUSE_ITEMS = ['resume', 'back'] as const;
export type PauseItem = (typeof PAUSE_ITEMS)[number];

/** Text and cursor positions inside the box. */
export const PAUSE_LAYOUT = {
  title: { x: 72, y: 32 },
  items: [{ x: 84, y: 44 }, { x: 84, y: 56 }],
  cursorX: 74,
} as const;

export interface PauseState { open: boolean; focus: number; openedAt: number }

export const closedPause = (): PauseState => ({ open: false, focus: 0, openedAt: 0 });
export const openPause = (now: number): PauseState => ({ open: true, focus: 0, openedAt: now });

/** Up and Down move the focus and wrap. */
export const moveFocus = (s: PauseState, delta: number): PauseState =>
  ({ ...s, focus: (((s.focus + delta) % PAUSE_ITEMS.length) + PAUSE_ITEMS.length) % PAUSE_ITEMS.length });

/** The cursor's bob frame, `seconds` after the box opened. */
export const cursorFrame = (seconds: number, swapsPerSecond: number): number => Math.floor(Math.max(0, seconds) * swapsPerSecond) % 2;
