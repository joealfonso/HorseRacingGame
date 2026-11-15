// Pointer input as pure maths and state (docs/specs/track-hub.md section 6, TH2, TH3, TH11):
// the CSS-to-grid mapping through the integer zoom, the hit test over a screen's boxes,
// and the click rule. Any screen can use it: the track now, and the program, result and
// End of day pages later. The scene feeds it the browser's numbers and acts on what it
// returns; nothing here reads the DOM, the clock or a random number.

/** An inclusive box on the 1x grid. */
export interface GridBox { x0: number; y0: number; x1: number; y1: number }
export interface GridPoint { x: number; y: number }
export interface PointerTarget<T extends string = string> { id: T; box: GridBox }

export const GRID = { w: 256, h: 240 } as const;
/** The primary button in PointerEvent.button. */
export const PRIMARY_BUTTON = 0;

/**
 * TH2: the grid point under a pointer, `floor((client - rect) / zoom)` on each axis, or null
 * in the letterbox (outside x0-255, y0-239). `rect` is the canvas's bounding box, read again
 * after every resize; `zoom` is the whole-number scale.
 */
export function gridPoint(clientX: number, clientY: number, rect: { left: number; top: number }, zoom: number): GridPoint | null {
  if (!Number.isInteger(zoom) || zoom < 1) throw new Error(`gridPoint: zoom must be a whole number of 1 or more, got ${zoom}`);
  const x = Math.floor((clientX - rect.left) / zoom);
  const y = Math.floor((clientY - rect.top) / zoom);
  if (x < 0 || y < 0 || x >= GRID.w || y >= GRID.h) return null;
  return { x, y };
}

export const inBox = (p: GridPoint, b: GridBox): boolean => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;

/** TH3: the target whose box holds the point (inclusive), or null. The first wins if boxes overlap; loaders refuse overlaps. */
export function hitTest<T extends string>(targets: readonly PointerTarget<T>[], p: GridPoint | null): T | null {
  if (p === null) return null;
  for (const t of targets) if (inBox(p, t.box)) return t.id;
  return null;
}

/**
 * What one screen's pointer has done. `hover` is the target it was last over; `down` is the
 * target the primary button went down on, on this screen, not yet released. A new screen
 * starts empty, so a press begun on the screen before can never finish here. `guard` is the
 * seconds left in the arrival guard: a press while it runs is no press at all, so neither it
 * nor its release acts, and the second half of a double click cannot act on the next screen.
 */
export interface PointerState<T extends string = string> { hover: T | null; down: T | null; guard?: number }

/** A screen arrives: nothing pressed, and presses ignored for `guardSeconds` (raceDay.json pointer.arrivalGuardSeconds). */
export const pointerState = <T extends string = string>(guardSeconds = 0): PointerState<T> =>
  (guardSeconds > 0 ? { hover: null, down: null, guard: guardSeconds } : { hover: null, down: null });

/** `dt` seconds of the scene's own clock passed: the arrival guard runs down. */
export function pointerTick<T extends string>(s: PointerState<T>, dt: number): PointerState<T> {
  if (!s.guard) return s;
  const guard = s.guard - Math.max(0, dt);
  return guard > 0 ? { ...s, guard } : { hover: s.hover, down: s.down };
}

/**
 * The pointer moved, now over `target` (null over nothing or the letterbox). `entered` is
 * the target it just moved into, which takes focus; moving within a target, or out of all
 * of them, takes nothing, so a still pointer never takes focus back from the keys.
 */
export function pointerMove<T extends string>(s: PointerState<T>, target: T | null): { state: PointerState<T>; entered: T | null } {
  const entered = target !== null && target !== s.hover ? target : null;
  return { state: { ...s, hover: target }, entered };
}

/** A button went down over `target`. Only the primary button counts; others change nothing. During the arrival guard it is no press. */
export function pointerDown<T extends string>(s: PointerState<T>, button: number, target: T | null): PointerState<T> {
  if (button !== PRIMARY_BUTTON) return s;
  return { ...s, down: s.guard ? null : target };
}

/**
 * TH11: a button came up over `target`. `act` is the target to act on: only on the primary
 * button's release over the same target it went down on. Any primary release ends the press.
 */
export function pointerUp<T extends string>(s: PointerState<T>, button: number, target: T | null): { state: PointerState<T>; act: T | null } {
  if (button !== PRIMARY_BUTTON) return { state: s, act: null };
  const act = s.down !== null && s.down === target ? target : null;
  return { state: { ...s, down: null }, act };
}

/** The window lost focus: hover and any half-made click are forgotten, as keys are. An arrival guard still running keeps running. */
export const pointerBlur = <T extends string>(s?: PointerState<T>): PointerState<T> => pointerState<T>(s?.guard ?? 0);
