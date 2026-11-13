import type { RaceDay } from '../data/raceDaySchema';
import { SCREEN_W, layerScroll, worldX, type RaceModel } from './view';

// Ambient loops on the mid layer (DESIGN Charm, CH1): the crowd strip over the grandstand
// in the stretch, the infield hedge and its flag on the turns. Swaps count wall seconds,
// so 4x does not speed them and pause stops them. The cap is enforced here from data.

export type AmbientId = 'crowd' | 'flag';

export interface MidZone { kind: 'stretch' | 'turn'; from: number; to: number }

/**
 * Mid-layer spans, in mid coordinates, of the stretches (grandstand and crowd) and the
 * turns (infield and flag). A world point w sits at mid x floor(w / divisor) + 64, which
 * puts it at the screen center when w is, so a zone is in view while its course piece is.
 * The home stretch runs on without end past the wire (FN3): the gallop out, the winner
 * beat and the walking done screen all pass the stand, however far the camera goes.
 * Stretch zones are padded at both ends and so overlap their neighbouring turns; the
 * stretch wins there (see turnArt).
 */
export function midZones(model: RaceModel): MidZone[] {
  const { midParallaxDivisor: div, midZonePadPx: pad } = model.cfg;
  const course = model.result.replay.course;
  const straights = course.filter((s) => !s.turn);
  const out: MidZone[] = [];
  for (const s of course) {
    const from = Math.floor(worldX(s.from, model.cfg) / div) + 64;
    const to = Math.floor(worldX(s.to, model.cfg) / div) + 64;
    if (s.turn) out.push({ kind: 'turn', from, to });
    else if ((straights.length - 1 - straights.indexOf(s)) % 2 === 0) {
      const home = s === straights[straights.length - 1];
      out.push({ kind: 'stretch', from: from - pad, to: home ? Infinity : to + pad });
    }
  }
  return out;
}

/**
 * Tiles of one zone on screen, laid from the zone's start (the grandstand tiles' grid):
 * screen x and the tile's index along the zone.
 */
export function zoneTiles(zone: MidZone, midScroll: number, tileW: number): { x: number; k: number }[] {
  const out: { x: number; k: number }[] = [];
  // Only the tiles that can be on screen, so a zone with no end costs nothing.
  const first = Math.max(0, Math.floor((midScroll - tileW - zone.from) / tileW));
  for (let k = first; zone.from + k * tileW < zone.to; k++) {
    const x = zone.from + k * tileW - midScroll;
    if (x >= SCREEN_W) break;
    if (x + tileW > 0) out.push({ x, k });
  }
  return out;
}

/** Where a stretch's grandstand tiles end: its last tile may run past the zone's end. */
export const stretchExtent = (z: MidZone, standW: number): { from: number; to: number } =>
  ({ from: z.from, to: z.to === Infinity ? Infinity : z.from + Math.ceil((z.to - z.from) / standW) * standW });

export interface TurnArt {
  /**
   * The pole-free fill slices left after clipping, in mid x. A slice the stand covers part
   * of is cropped to the uncovered columns: `srcX` is the first column of the slice drawn,
   * `w` how many, and `x` where that first column lands. Whole slices have srcX 0, w fillW.
   */
  fills: { x: number; srcX: number; w: number }[];
  /** Mid x of the one full tile with the pole and flag, or null if the clipped turn is too short for it. */
  full: number | null;
}

/**
 * A turn's infield art, clipped where a stretch's grandstand covers it (CH1: the stretch
 * wins, and no pixel is covered by both). Slices sit on the turn's own grid of fillW. A
 * slice the stand covers part of is cropped to the columns it does not, in whole pixels,
 * so the hedge runs right up to the stand's first drawn pixel with no gap (the hedge
 * repeats every 8 px, so a cropped slice still reads). The full tile sits on the turn's
 * fullW grid in the middle of the longest run of whole slices, so it is never cropped.
 */
export function turnArt(turn: MidZone, stretches: readonly MidZone[], standW: number, fillW: number, fullW: number): TurnArt {
  const covers = stretches.map((z) => stretchExtent(z, standW));
  const fills: TurnArt['fills'] = [];
  const runs: number[][] = [];
  for (let k = 0; turn.from + k * fillW < turn.to; k++) {
    const x = turn.from + k * fillW;
    // The uncovered part of [x, x + fillW): cut back from each stand that reaches into it.
    let a = x;
    let b = x + fillW;
    for (const c of covers) {
      if (c.to <= a || c.from >= b) continue;
      if (c.from <= a) a = Math.max(a, c.to);
      else b = Math.min(b, c.from);
      if (a >= b) break;
    }
    if (a >= b) continue;
    fills.push({ x: a, srcX: a - x, w: b - a });
    if (b - a < fillW) continue; // a cropped slice never carries the full tile
    const run = runs[runs.length - 1];
    if (run && run[run.length - 1] === k - 1) run.push(k);
    else runs.push([k]);
  }
  const per = Math.max(1, Math.round(fullW / fillW));
  let full: number | null = null;
  let bestLen = 0;
  for (const run of runs) {
    const fits = run.filter((k) => (k * fillW) % fullW === 0 && run.includes(k + per - 1));
    if (fits.length === 0 || run.length <= bestLen) continue;
    const mid = (run[0] + run[run.length - 1]) / 2;
    const k = fits.reduce((a, b) => (Math.abs(b + (per - 1) / 2 - mid) < Math.abs(a + (per - 1) / 2 - mid) ? b : a));
    full = turn.from + k * fillW;
    bestLen = run.length;
  }
  return { fills, full };
}

/** Mid x of the one full infield tile in a turn: the middle of the zone, on the zone's tile grid. */
export const fullTileAt = (zone: MidZone, tileW: number): number =>
  zone.from + Math.floor((zone.to - zone.from) / 2 / tileW) * tileW;

/** Swaps so far for a loop that runs at `slow` per second, then `fast` per second from `fastFrom` (wall). */
export function swapsAt(wall: number, slow: number, fast: number, fastFrom: number): number {
  if (wall <= fastFrom) return Math.floor(wall * slow);
  return Math.floor(fastFrom * slow + (wall - fastFrom) * fast);
}

export interface AmbientInput {
  wall: number;
  /** Wall second the leader reached the 1/8 pole, Infinity before. */
  eighthWall: number;
  /** Which ambient things are on screen now. */
  visible: ReadonlySet<AmbientId>;
}

export interface AmbientState {
  /** Ids allowed to animate now, in priority order, never more than the cap (CH1). */
  animating: AmbientId[];
  /** Crowd swap count: tile k shows frame (crowdSwaps + k) mod 2, so neighbors run a frame apart. */
  crowdSwaps: number;
  flagFrame: number;
}

/**
 * The cap: at most `cap` visible things animate, highest priority first, and from the 1/8
 * pole only those listed in fromEighthPole. Anything stopped holds the frame it had.
 */
export function ambientState(rd: RaceDay, input: AmbientInput): AmbientState {
  const a = rd.ambient;
  const stretch = input.wall >= input.eighthWall;
  const animating = a.order
    .filter((id) => input.visible.has(id) && (!stretch || a.fromEighthPole.includes(id)))
    .slice(0, a.cap.value);
  // Anything stopped keeps the frame it had: off screen a loop runs on unseen; one stopped
  // at the 1/8 pole holds its frame from then; one the cap leaves out never started.
  const held = (id: AmbientId) => {
    if (animating.includes(id) || !input.visible.has(id)) return input.wall;
    return a.order.indexOf(id) < a.cap.value && stretch ? input.eighthWall : 0;
  };
  const crowdSwaps = swapsAt(held('crowd'), a.crowdSwapsPerSecond.value, a.crowdStretchSwapsPerSecond.value, input.eighthWall);
  // The flag stops at the 1/8 pole: it keeps the frame it had then.
  const flagFrame = Math.floor(Math.min(held('flag'), input.eighthWall) * a.flagSwapsPerSecond.value) % 2;
  return { animating, crowdSwaps, flagFrame };
}

/** Mid-layer scroll for a camera (re-exported for the scene's tiling). */
export const midScrollOf = (model: RaceModel, cam: number): number => layerScroll(cam, model.cfg.midParallaxDivisor);
