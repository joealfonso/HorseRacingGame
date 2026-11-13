// Key handling for the race-day screens as pure state (IN2): a key that is already down
// when a new beat or screen begins is ignored until it is released, and auto-repeat never
// acts, so mashing or holding Enter cannot skip beats unseen.

export interface KeyState {
  down: ReadonlySet<string>;
  /** Keys that were down when the current beat began. */
  stale: ReadonlySet<string>;
}

export const keyState = (heldFromBefore: Iterable<string> = []): KeyState => {
  const held = new Set(heldFromBefore);
  return { down: held, stale: new Set(held) };
};

/** A key went down. `act` is whether it should do anything. */
export function keyDown(s: KeyState, code: string, repeat: boolean): { state: KeyState; act: boolean } {
  const down = new Set(s.down).add(code);
  // First seen as a repeat (held through a window blur that wiped the state): it never got
  // a fresh press here, so it counts as held over until released.
  const stale = repeat && !s.down.has(code) ? new Set(s.stale).add(code) : s.stale;
  return { state: { down, stale }, act: !repeat && !stale.has(code) };
}

export function keyUp(s: KeyState, code: string): KeyState {
  const down = new Set(s.down);
  down.delete(code);
  const stale = new Set(s.stale);
  stale.delete(code);
  return { down, stale };
}

/** A new beat began: everything held now is stale until released. */
export const beatBegan = (s: KeyState): KeyState => ({ down: s.down, stale: new Set(s.down) });
