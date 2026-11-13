import type { Track } from '../data/schema';

// The mini map (spec 4.3, H2): a top-down oval, 88x40, stretch along the bottom, the
// wire at the right end of the bottom straight, horses running right along the bottom
// and so counterclockwise, as at a US track. Coordinates are local to the box.
//
// Geometry, matched to art.ui.minimap.track: two semicircles around the pixel corners
// (left, cy) and (right, cy), joined by straights. The 4 px band is every pixel lying
// 16 to 20 px (measured to its edges) from those corners, which on the straights is
// rows 36 to 39 (bottom) and 0 to 3 (top). Shipped track: left 20, right 68, cy 20.
// Your dot stays on the band's inner edge, so its Yellow ring fits inside the box.

export const MINIMAP_W = 88;
export const MINIMAP_H = 40;
const CY = 20;
const RAIL = 16; // inner edge of the band
const BAND = 4;
const MAX_PUSH = 2;

export interface MinimapGeometry {
  left: number;
  right: number;
  cy: number;
  /** Feet of each piece in lap order from the wire. */
  turn: number;
  back: number;
  stretch: number;
  lap: number;
}

/** Straights against turns in the track's own proportions, measured at the band's middle. */
export function minimapGeometry(track: Track): MinimapGeometry {
  const turn = track.turnFeet.value;
  const back = track.backstretchFeet.value;
  const stretch = track.stretchFeet.value;
  const mid = RAIL + BAND / 2;
  const maxStraight = MINIMAP_W - 2 * (RAIL + BAND);
  const straight = Math.max(0, Math.min(maxStraight, Math.round((mid * stretch * Math.PI) / turn)));
  const left = Math.floor((MINIMAP_W - straight) / 2);
  return { left, right: left + straight, cy: CY, turn, back, stretch, lap: turn + back + turn + stretch };
}

/** How far out a dot is pushed by its lane, 0 to 2 px. */
export function lanePush(lane: number, laneMax: number): number {
  if (!(laneMax > 0)) return 0;
  return Math.max(0, Math.min(MAX_PUSH, Math.floor((lane * MAX_PUSH) / (laneMax * 100) + 0.5)));
}

/**
 * Top-left of a horse's 2x2 dot. `distance` is the replay distance and `raceDistance`
 * the race's, both in hundredths of a foot; the wire is where they are equal.
 */
export function minimapDot(g: MinimapGeometry, distance: number, raceDistance: number, lane: number, laneMax: number, yours = false): { x: number; y: number } {
  const r = RAIL + 1 + (yours ? 0 : lanePush(lane, laneMax));
  const q = ((((distance - raceDistance) / 100) % g.lap) + g.lap) % g.lap;
  let px: number;
  let py: number;
  if (q < g.turn) {
    // Clubhouse turn: the right semicircle, bottom to top.
    const a = Math.PI / 2 - Math.PI * (q / g.turn);
    px = g.right + r * Math.cos(a);
    py = g.cy + r * Math.sin(a);
  } else if (q < g.turn + g.back) {
    // Backstretch: the top straight, right to left.
    px = g.right - (g.right - g.left) * ((q - g.turn) / g.back);
    py = g.cy - r;
  } else if (q < 2 * g.turn + g.back) {
    // Far turn: the left semicircle, top to bottom.
    const a = -Math.PI / 2 - Math.PI * ((q - g.turn - g.back) / g.turn);
    px = g.left + r * Math.cos(a);
    py = g.cy + r * Math.sin(a);
  } else {
    // Stretch: the bottom straight, left to right, to the wire.
    px = g.left + (g.right - g.left) * ((q - 2 * g.turn - g.back) / g.stretch);
    py = g.cy + r;
  }
  return { x: Math.round(px) - 1, y: Math.round(py) - 1 };
}

/**
 * The wire tick, 1x3, on the band at the right end of the bottom straight: the left
 * column of a dot standing on the wire (x67, rows 36 to 38 on the shipped track, where
 * the art draws it too).
 */
export function minimapWire(g: MinimapGeometry): { x: number; y: number; h: number } {
  return { x: g.right - 1, y: g.cy + RAIL, h: 3 };
}
