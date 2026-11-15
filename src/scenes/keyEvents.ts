// Phaser's KeyboardPlugin.update runs on every native key event and walks the whole
// event queue again, and the queue only clears at the next game step. Its duplicate check
// compares against the one event before, so with three or more key events in one frame
// (keydown Enter, keyup Enter, keydown anything) the first keydown is emitted again, and
// a released key would act twice. Every scene that listens for 'keydown' or 'keyup' asks
// here first and drops a native event it has already handled.
//
// Shared by all scenes because the queue is the game's, not one scene's: a scene started
// mid-frame would otherwise be handed the events that started it. A WeakSet holds no
// game state and lets each event go once the browser is done with it.

const seen = new WeakSet<KeyboardEvent>();

/** True the first time this native event reaches our code, false on every replay. */
export function firstSight(e: KeyboardEvent): boolean {
  if (seen.has(e)) return false;
  seen.add(e);
  return true;
}
