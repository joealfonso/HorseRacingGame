// Key handling for the race-day screens as pure state (IN2), so a key held when a screen
// or beat begins cannot skip it unseen, and a quick tap is never lost.
//
// `down` is what this screen has itself seen go down and not come up. Its listener is
// continuous, so that record is reliable: a keydown for a key already in `down` is a
// repeat, flagged or not, and never acts. `stale` is what the screen before handed over
// as held, which this screen has not seen go down; it cannot know whether those were
// released during the switch (a quick tap's keyup goes to the old screen). A keydown
// without the repeat flag for a key not in `down` acts, stale or not: browsers send one
// only after the key came up. Flagged repeats never act. Keyup clears both.

export interface KeyState {
  /** Keys this screen saw go down and has not seen come up. */
  down: ReadonlySet<string>;
  /** Keys held over: handed in as held, or down when the current beat began. */
  stale: ReadonlySet<string>;
}

/** A screen opens with the keys the screen before still had down, as held over. */
export const keyState = (heldFromBefore: Iterable<string> = []): KeyState => ({ down: new Set(), stale: new Set(heldFromBefore) });

/** A key went down. `act` is whether it should do anything. */
export function keyDown(s: KeyState, code: string, repeat: boolean): { state: KeyState; act: boolean } {
  const seen = s.down.has(code);
  const down = seen ? s.down : new Set(s.down).add(code);
  // Flagged repeat, or this screen saw it go down and never come up (a repeat that lost
  // its flag): it does nothing, and a held-over key stays held over.
  if (repeat || seen) return { state: { down, stale: s.stale }, act: false };
  // A fresh press: acts, and is no longer held over.
  if (!s.stale.has(code)) return { state: { down, stale: s.stale }, act: true };
  const stale = new Set(s.stale);
  stale.delete(code);
  return { state: { down, stale }, act: true };
}

export function keyUp(s: KeyState, code: string): KeyState {
  const down = new Set(s.down);
  down.delete(code);
  const stale = new Set(s.stale);
  stale.delete(code);
  return { down, stale };
}

/**
 * A new beat began. A key held across it is still in `down`, so it cannot act again until
 * it comes up; it is also marked held over, so a held Space does not start 4x in the new beat.
 */
export const beatBegan = (s: KeyState): KeyState => ({ down: s.down, stale: new Set([...s.stale, ...s.down]) });

/** The keys to hand to the next screen: every key this one cannot show was released. */
export const heldKeys = (s: KeyState): string[] => [...new Set([...s.down, ...s.stale])];

/**
 * Held-arrow repeat on the menus (spec 5): how many repeats fire while a key's held time
 * goes from `before` to `after` seconds. The press itself acts on keydown; the first
 * repeat comes `delay` seconds later and then one every `every` seconds.
 */
export function repeatsBetween(before: number, after: number, delay: number, every: number): number {
  const count = (t: number) => (t < delay ? 0 : 1 + Math.floor((t - delay) / every));
  return Math.max(0, count(after) - count(before));
}

/** The arrow keys that repeat while held on the card and Orders screens. */
export const REPEATING_KEYS: readonly string[] = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
