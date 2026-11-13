import type { RaceDay } from '../data/raceDaySchema';
import type { RaceResult } from '../sim/result';

// The race view's math, as pure functions of the result, the player's horse and the
// race time. No Phaser, no clock, no random draws: the scene only draws what these return.
// Race time `t` is in hundredths of a second from the gate opening, like the result.

export const SCREEN_W = 256;
export const FEET_PER_FURLONG = 660;

export interface ViewConfig {
  pxPerFoot: number;
  pxPerLane: number;
  hoofBaseY: number;
  leaderScreenX: number;
  playerScreenX: number;
  wireScreenX: number;
  gateScreenX: number;
  finalFeetToGo: number;
  finalBlendSeconds: number;
  finalCatchUpPxPerSecond: number;
  farParallaxDivisor: number;
  midParallaxDivisor: number;
  midZonePadPx: number;
  strideFeet: number;
  stridePhasePerPost: number;
  frameTopFromHoof: number;
  playerArrowDx: number;
  playerArrowDy: number;
}

export function viewConfig(rd: RaceDay): ViewConfig {
  const v = rd.view;
  return Object.fromEntries(Object.entries(v).map(([k, m]) => [k, m.value])) as unknown as ViewConfig;
}

// Mapping (spec 3.5, RV1). Distance in hundredths of a foot, lane in hundredths of a lane.
export const worldX = (distance: number, cfg: Pick<ViewConfig, 'pxPerFoot'>): number => Math.floor((distance * cfg.pxPerFoot) / 100);
export const hoofY = (lane: number, cfg: Pick<ViewConfig, 'hoofBaseY' | 'pxPerLane'>): number => cfg.hoofBaseY + Math.floor((lane * cfg.pxPerLane) / 100);

/** A replay track at time t: straight lines between samples, the first before 0, the last past the end (RV2). */
export function sampleAt(values: readonly number[], step: number, t: number): number {
  if (values.length === 0) return 0;
  if (!(t > 0)) return values[0];
  const s = t / step;
  const i = Math.floor(s);
  if (i >= values.length - 1) return values[values.length - 1];
  const f = s - i;
  return f === 0 ? values[i] : values[i] + (values[i + 1] - values[i]) * f;
}

export interface HorseAt {
  id: string;
  post: number;
  distance: number;
  lane: number;
  /** World x of the nose, whole px. */
  x: number;
  hoofY: number;
}

/** Every horse at time t, by post. */
export function horsesAt(result: RaceResult, cfg: ViewConfig, t: number): HorseAt[] {
  const step = result.replay.step;
  return result.replay.horses.map((h) => {
    const distance = sampleAt(h.distance, step, t);
    const lane = sampleAt(h.lane, step, t);
    return { id: h.id, post: h.post, distance, lane, x: worldX(distance, cfg), hoofY: hoofY(lane, cfg) };
  });
}

/** The horse furthest along at this moment, ties by post. */
export function leaderOf(horses: readonly HorseAt[]): HorseAt {
  return horses.reduce((best, h) => (h.distance > best.distance || (h.distance === best.distance && h.post < best.post) ? h : best));
}

/** Inner lanes first, ties by post (RV7). */
export function drawOrder(horses: readonly HorseAt[]): HorseAt[] {
  return [...horses].sort((a, b) => a.lane - b.lane || a.post - b.post);
}

/** The gallop frame from distance, stride length and post only (RV8). */
export function strideFrame(distance: number, post: number, cfg: Pick<ViewConfig, 'strideFeet' | 'stridePhasePerPost'>, frames: number): number {
  if (frames <= 1) return 0;
  const phase = (post * cfg.stridePhasePerPost) % 1;
  const cycles = distance / (cfg.strideFeet * 100) + phase;
  const f = Math.floor(cycles * frames) % frames;
  return f < 0 ? f + frames : f;
}

/** The race's fixed points, worked out once from the result. */
export interface RaceModel {
  result: RaceResult;
  cfg: ViewConfig;
  /** Race distance in hundredths of a foot. */
  distance: number;
  wireX: number;
  /** When the leader reaches the final-sixteenth point, hundredths. */
  finalAt: number;
  winnerAt: number;
}

export function raceDistance(result: RaceResult): number {
  return result.inputs.race.distanceFurlongs * FEET_PER_FURLONG * 100;
}

/** The first moment any horse reaches `distance`, from the samples, hundredths. Infinity if none does. */
export function firstReach(result: RaceResult, distance: number): number {
  return Math.min(...result.replay.horses.map((h) => reachTime(h.distance, result.replay.step, distance)));
}

/** When one horse reaches `distance`, hundredths. Infinity if it never does. */
export function firstReachBy(result: RaceResult, id: string, distance: number): number {
  const h = result.replay.horses.find((x) => x.id === id);
  return h ? reachTime(h.distance, result.replay.step, distance) : Infinity;
}

function reachTime(d: readonly number[], step: number, distance: number): number {
  for (let i = 0; i < d.length; i++) {
    if (d[i] < distance) continue;
    return i === 0 || d[i] === d[i - 1] ? i * step : (i - 1) * step + (step * (distance - d[i - 1])) / (d[i] - d[i - 1]);
  }
  return Infinity;
}

export function makeRaceModel(result: RaceResult, cfg: ViewConfig): RaceModel {
  const distance = raceDistance(result);
  return {
    result,
    cfg,
    distance,
    wireX: worldX(distance, cfg),
    finalAt: firstReach(result, distance - cfg.finalFeetToGo * 100),
    winnerAt: result.finish[0].time,
  };
}

/**
 * Camera x (the world x at the screen's left edge) at time t, a whole number (RV3).
 * Race: the leader at leaderScreenX unless that pushes yours left of playerScreenX.
 * From the final sixteenth: blend to the wire over finalBlendSeconds, never adding more
 * than finalCatchUpPxPerSecond over the race camera. From the winner's finish: the wire
 * at wireScreenX. Before the gate opens the leader and yours are both at x 0, so this is
 * the gate camera too.
 */
export function cameraX(model: RaceModel, playerId: string, t: number): number {
  const { cfg, wireX } = model;
  // Before the doors open: the start line at gateScreenX (validated equal to leaderScreenX,
  // so the first race frame continues from here without a jump).
  if (!(t > 0)) return -cfg.gateScreenX;
  if (t >= model.winnerAt) return wireX - cfg.wireScreenX;
  const horses = horsesAt(model.result, cfg, t);
  const L = leaderOf(horses).x;
  const P = (horses.find((h) => h.id === playerId) ?? horses[0]).x;
  const race = Math.min(L - cfg.leaderScreenX, P - cfg.playerScreenX);
  if (!(t > model.finalAt)) return race;
  const since = (t - model.finalAt) / 100;
  const target = Math.min(L, wireX) - cfg.wireScreenX;
  const k = Math.min(1, since / cfg.finalBlendSeconds);
  const blended = race + (target - race) * k;
  const capped = race + cfg.finalCatchUpPxPerSecond * since;
  return Math.floor(Math.min(blended, capped, target));
}

// Furlong poles ------------------------------------------------------------------------

export type PoleKind = 'wire' | 'quarter' | 'eighth' | 'sixteenth';
export interface Pole { x: number; kind: PoleKind }

const SIXTEENTH_FEET = FEET_PER_FURLONG / 2;

/**
 * The poles the field passes from the gate to the wire, by world x. A pole's kind is
 * set by its distance to the wire around the lap, as on the real track, so the first
 * time past the stands passes the wire post.
 */
export function polesOf(model: RaceModel): Pole[] {
  const lap = model.result.inputs.track.lapFeet.value;
  const D = model.distance / 100;
  const out: Pole[] = [];
  for (let laps = 0; laps * lap <= D; laps++) {
    for (let n = 0; n * SIXTEENTH_FEET < lap; n++) {
      const inLap = n * SIXTEENTH_FEET;
      const toGo = laps * lap + inLap;
      if (toGo > D) break;
      const kind: PoleKind = inLap === 0 ? 'wire' : inLap % (2 * FEET_PER_FURLONG) === 0 ? 'quarter' : inLap % FEET_PER_FURLONG === 0 ? 'eighth' : 'sixteenth';
      out.push({ x: worldX((D - toGo) * 100, model.cfg), kind });
    }
  }
  return out.sort((a, b) => a.x - b.x);
}

// Parallax and zones --------------------------------------------------------------------

/** Scroll of a layer that moves at 1/divisor of the camera. */
export const layerScroll = (cam: number, divisor: number): number => Math.floor(cam / divisor);

/** The stretches the field runs, as world px spans: every straight that ends at the wire. */
export function stretchSpans(model: RaceModel): { from: number; to: number }[] {
  const straights = model.result.replay.course.filter((s) => !s.turn);
  // Counted from the wire back, straights alternate stretch, backstretch, stretch ...
  return straights
    .filter((_, i) => (straights.length - 1 - i) % 2 === 0)
    .map((s) => ({ from: worldX(s.from, model.cfg), to: worldX(s.to, model.cfg) }));
}

/**
 * Screen x of each grandstand tile on the mid layer. A world point w maps to mid x
 * floor(w / divisor) + 64, which puts it at the screen center when w is, so the stand
 * is in view while the stretch is. The home stretch's stand runs on past the wire with
 * no end (FN3), so the gallop out and the winner beat never pass an empty mid layer.
 */
export function standTiles(model: RaceModel, cam: number, tileW: number): number[] {
  const { midParallaxDivisor: div, midZonePadPx: pad } = model.cfg;
  const scroll = layerScroll(cam, div);
  const out: number[] = [];
  const spans = stretchSpans(model);
  spans.forEach((span, i) => {
    const m0 = Math.floor(span.from / div) + 64 - pad;
    const m1 = i === spans.length - 1 ? Infinity : Math.floor(span.to / div) + 64 + pad;
    // Start at the first tile that can be on screen.
    const first = Math.max(0, Math.floor((scroll - tileW - m0) / tileW));
    for (let m = m0 + first * tileW; m < m1; m += tileW) {
      const x = m - scroll;
      if (x >= SCREEN_W) break;
      if (x + tileW > 0) out.push(x);
    }
  });
  return out;
}

// Edge markers -------------------------------------------------------------------------

/** `laneY` is the horse's lane height (its hoof line); the scene centers the marker's rows on it. */
export interface EdgeMarker { side: 'right' | 'left'; post: number; laneY: number; yours: boolean }

/**
 * The leader's marker when its frame is wholly off the right edge; yours when its nose
 * is off the left edge. `noseX` is the nose column inside the 32 px frame.
 */
export function edgeMarkers(horses: readonly HorseAt[], playerId: string, cam: number, noseX: number): EdgeMarker[] {
  const out: EdgeMarker[] = [];
  const leader = leaderOf(horses);
  if (leader.x - noseX - cam >= SCREEN_W) out.push({ side: 'right', post: leader.post, laneY: leader.hoofY, yours: leader.id === playerId });
  const mine = horses.find((h) => h.id === playerId);
  if (mine && mine.x - cam < 0) out.push({ side: 'left', post: mine.post, laneY: mine.hoofY, yours: true });
  return out;
}

// Rails --------------------------------------------------------------------------------

/**
 * Rail tiles on screen: one every tileW px of world, flipped when floor(worldX / tileW)
 * is odd, so the post drawn at the tile's left edge pairs up with its neighbour's every
 * 2 * tileW px.
 */
export function railTiles(cam: number, tileW: number): { x: number; flip: boolean }[] {
  const out: { x: number; flip: boolean }[] = [];
  for (let k = Math.floor(cam / tileW); k * tileW - cam < SCREEN_W; k++) {
    out.push({ x: k * tileW - cam, flip: ((k % 2) + 2) % 2 === 1 });
  }
  return out;
}

// Gallop out (RV2b) --------------------------------------------------------------------

/** Each horse's finish facts, read only from samples at or before its own finish. */
export interface FinishRun { finishTime: number; speed: number; lane: number }

/**
 * Per horse by post: its finish time, the speed it crossed the wire with (hundredths of
 * a foot per hundredth of a second, from the last two samples at or before the finish)
 * and its lane at the finish, interpolated as before it.
 */
export function finishRuns(result: RaceResult): FinishRun[] {
  const step = result.replay.step;
  return result.replay.horses.map((h) => {
    const i = Math.min(h.distance.length - 1, Math.floor(h.finishTime / step));
    const speed = i > 0 ? Math.max(0, (h.distance[i] - h.distance[i - 1]) / step) : 0;
    // Held at the replay's interpolated lane at the finish, so the drawn lane does not hop a
    // pixel there. This reads the sample just after the finish, the one the replay needs to
    // be where it is at that moment (see DECISIONS).
    return { finishTime: h.finishTime, speed, lane: sampleAt(h.lane, step, h.finishTime) };
  });
}

/**
 * Where each horse is drawn at time t. Up to its own finish this is the replay, held at
 * the wire so it never draws past it early; from its finish on it keeps going from the
 * wire at the speed it crossed with, in its lane at the wire. Render only: the strip,
 * clock, calls, camera and photo use horsesAt. World x never decreases.
 */
export function drawnHorsesAt(model: RaceModel, runs: readonly FinishRun[], t: number): HorseAt[] {
  const { cfg, distance: D, result } = model;
  const step = result.replay.step;
  return result.replay.horses.map((h, k) => {
    const run = runs[k];
    if (t < run.finishTime) {
      const distance = Math.min(sampleAt(h.distance, step, t), D);
      const lane = sampleAt(h.lane, step, t);
      return { id: h.id, post: h.post, distance, lane, x: worldX(distance, cfg), hoofY: hoofY(lane, cfg) };
    }
    const distance = D + run.speed * (t - run.finishTime);
    return { id: h.id, post: h.post, distance, lane: run.lane, x: worldX(distance, cfg), hoofY: hoofY(run.lane, cfg) };
  });
}
