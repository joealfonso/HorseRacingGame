import { PHOTO_CROP_ROWS, PHOTO_LANE_ROWS, type RaceDay } from '../data/raceDaySchema';
import { fillTemplate } from '../data/template';
import type { RaceResult } from '../sim/result';
import { marginPhrase } from './format';
import { captionAt, type Clock, type Timeline } from './timeline';
import { raceDistance, strideFrame, type ViewConfig } from './view';

// The photo finish (spec 4.4, DESIGN Race view), as pure functions. A 112x88 crop of the
// wire frame, from 96 px behind the wire to 16 px past it, 88 rows tall, shown at 2x inside
// a framed panel at x8-247, y8-199. Every horse comes from `replay.wireFrame` only. Across,
// it is placed at 8 px a foot (the 2x space), so the photo's pixels are finer than the race
// view's; that is the one mixed-density exception. Up and down the photo has its own
// layout (art review 2026-11-13): lanes 8 crop rows apart, the occupied block centered.

export const PHOTO_SCALE = 2;
/** The framed panel, landed: x8-247, y8-199, 30 by 24 frame tiles. */
export const PHOTO_PANEL = { x: 8, y: 8, tilesW: 30, tilesH: 24 } as const;
/** The photo inside it: x16-239, y16-191 when landed. */
export const PHOTO_AREA = { x: 16, y: 16, w: 224, h: 176 } as const;
/** The crop in race-view pixels: columns from 96 behind the wire to 16 past it, rows y77-164. */
export const PHOTO_CROP = { behindWire: 96, pastWire: 16, top: 77, rows: PHOTO_CROP_ROWS } as const;
/** Captions below the panel at 1x; the arrow above it at 1x, rows y3-6. */
export const PHOTO_CAPTION = { x: 8, y: [204, 216] } as const;
export const PHOTO_ARROW_Y = 3;
const ARROW_W = 7;

export interface PhotoHorse {
  id: string;
  post: number;
  /** Screen x of the doubled frame's left column and top row, with the panel landed. */
  x: number;
  y: number;
  /** Screen x of the nose's last lit pixel: the doubled nose column's right half. */
  nose: number;
  frame: number;
  yours: boolean;
}

/** Where the nose pixel goes for a distance, before the nose rule. Whole numbers (PH3). */
export function photoNose(distance: number, raceDistanceHundredths: number, cfg: Pick<ViewConfig, 'pxPerFoot'>, noseX: number): number {
  const left = PHOTO_AREA.x + PHOTO_SCALE * (PHOTO_CROP.behindWire - noseX) + Math.floor(((distance - raceDistanceHundredths) * cfg.pxPerFoot * PHOTO_SCALE) / 100);
  return left + PHOTO_SCALE * noseX + PHOTO_SCALE - 1;
}

/** Crop rows between neighbouring lanes in the photo: twice the race view's 4, so every nose has its own height. */
export { PHOTO_LANE_ROWS };

/**
 * Top crop row of a horse's frame (before the 2x). The block of occupied lanes, from
 * `firstLane` to `lastLane` (hundredths of a lane, as the wire frame gives them), is
 * centered in the crop's 88 rows: its top is floor((88 - (8 x (last - first) + frame height)) / 2),
 * and a horse sits floor(8 x (lane - first)) below it.
 */
export function photoCropTop(lane: number, firstLane: number, lastLane: number, frameHeight: number): number {
  const block = Math.floor((PHOTO_CROP.rows - (PHOTO_LANE_ROWS * (lastLane - firstLane) / 100 + frameHeight)) / 2);
  return block + Math.floor((PHOTO_LANE_ROWS * (lane - firstLane)) / 100);
}

/** Top screen row of the doubled frame for a lane, with the panel landed. */
export function photoTop(lane: number, firstLane: number, lastLane: number, cfg: Pick<ViewConfig, 'frameTopFromHoof'>): number {
  return PHOTO_AREA.y + PHOTO_SCALE * photoCropTop(lane, firstLane, lastLane, cfg.frameTopFromHoof + 1);
}

/**
 * Every horse in the wire frame, inner lanes first, ties by post (RV7). The nose rule
 * (PH2): no other horse's nose pixel is level with or ahead of the winner's; one that
 * lands there is moved back to the pixel behind the winner's. The sim never puts one
 * ahead (O9), so in practice this only parts a pair on the same pixel.
 */
export function photoHorses(result: RaceResult, cfg: ViewConfig, noseX: number, gallopFrames: number, playerId: string): PhotoHorse[] {
  const D = raceDistance(result);
  const winner = result.finish[0].id;
  const postOf = new Map(result.replay.horses.map((h) => [h.id, h.post]));
  const wf = result.replay.wireFrame.horses;
  const winnerAt = wf.find((h) => h.id === winner);
  const winnerNose = winnerAt ? photoNose(winnerAt.distance, D, cfg, noseX) : Infinity;
  const firstLane = Math.min(...wf.map((h) => h.lane));
  const lastLane = Math.max(...wf.map((h) => h.lane));
  return [...wf]
    .sort((a, b) => a.lane - b.lane || (postOf.get(a.id) ?? 0) - (postOf.get(b.id) ?? 0))
    .map((h) => {
      const post = postOf.get(h.id) ?? 0;
      const raw = photoNose(h.distance, D, cfg, noseX);
      const nose = h.id === winner ? raw : Math.min(raw, winnerNose - 1);
      return {
        id: h.id,
        post,
        x: nose - (PHOTO_SCALE * noseX + PHOTO_SCALE - 1),
        y: photoTop(h.lane, firstLane, lastLane, cfg),
        nose,
        frame: strideFrame(h.distance, post, cfg, gallopFrames),
        yours: h.id === playerId,
      };
    });
}

export interface PhotoStripe { x: number; y: number; w: number; h: number; color: 'Ash' | 'Bone' }

/**
 * The wire, behind the horses: 1 px of Bone at crop x96 with 1 px of Ash at x95 and x97,
 * so 2, 2 and 2 px on screen, the photo's full height. x, y, w and h are the Bone line's
 * screen rectangle; `stripes` are all three, left to right, as drawn.
 */
export interface PhotoWire { x: number; y: number; w: number; h: number; stripes: PhotoStripe[] }

export function photoWire(): PhotoWire {
  const col = (cropX: number, color: PhotoStripe['color']): PhotoStripe =>
    ({ x: PHOTO_AREA.x + PHOTO_SCALE * cropX, y: PHOTO_AREA.y, w: PHOTO_SCALE, h: PHOTO_AREA.h, color });
  const w = PHOTO_CROP.behindWire;
  const bone = col(w, 'Bone');
  return { x: bone.x, y: bone.y, w: bone.w, h: bone.h, stripes: [col(w - 1, 'Ash'), bone, col(w + 1, 'Ash')] };
}

/**
 * The 7x4 arrow at 1x above the panel, centered over your horse's doubled cap, when that
 * cap is in the photo. `arrowDx` is the arrow's left column over the 1x frame (the cap's center less 3).
 */
export function photoArrow(mine: PhotoHorse | undefined, arrowDx: number): { x: number; y: number } | null {
  if (!mine) return null;
  const x = mine.x + Math.floor((PHOTO_SCALE * (2 * arrowDx + ARROW_W) - ARROW_W) / 2);
  return x >= PHOTO_AREA.x && x + ARROW_W - 1 < PHOTO_AREA.x + PHOTO_AREA.w ? { x, y: PHOTO_ARROW_Y } : null;
}

/** Whole stepPx moves down from fully above the screen to the landed panel. */
export function photoPanelY(tau: number, rd: RaceDay): { y: number; landed: boolean } {
  const step = rd.photo.stepPx.value;
  const total = Math.ceil((PHOTO_PANEL.y + PHOTO_PANEL.tilesH * 8) / step);
  const k = Math.min(total, Math.max(0, Math.floor(tau * rd.photo.stepsPerSecond.value)));
  return { y: PHOTO_PANEL.y - (total - k) * step, landed: k === total };
}

export interface PhotoCaption { text: string; color: 'Bone' | 'Yellow'; x: number; y: number }

/**
 * The caption: the title until the winner line is due, then the winner ("{name} wins",
 * Yellow if yours) and the margin to second. It names first and second only (sim O9).
 * Nothing reads the second horse before it has crossed (AN3).
 */
export function photoCaption(result: RaceResult, rd: RaceDay, playerId: string, showWinner: boolean, raceTime: number): PhotoCaption[] {
  const copy = rd.copy;
  const [first, second] = result.finish;
  if (!showWinner || !second || raceTime < second.time) return [{ text: copy.photo.title, color: 'Bone', x: PHOTO_CAPTION.x, y: PHOTO_CAPTION.y[0] }];
  const name = result.inputs.card.horses.find((h) => h.id === first.id)?.name ?? first.id;
  return [
    { text: fillTemplate(copy.photo.winner, { winner: name }), color: first.id === playerId ? 'Yellow' : 'Bone', x: PHOTO_CAPTION.x, y: PHOTO_CAPTION.y[0] },
    { text: fillTemplate(copy.photo.margin, { margin: marginPhrase(second.margin?.label ?? '', copy), n: second.post }), color: 'Bone', x: PHOTO_CAPTION.x, y: PHOTO_CAPTION.y[1] },
  ];
}

export interface PhotoFrame {
  /** Panel top-left in frame tiles; it steps in from above. */
  panel: { x: number; y: number; tilesW: number; tilesH: number };
  /** The photo's rectangle on screen: clip the horses to it and fill it with the streaks at 2x. */
  area: { x: number; y: number; w: number; h: number };
  /** The wire, drawn behind the horses: the Bone line, and its three stripes with the Ash sides. */
  wire: PhotoWire;
  /** Inner lanes first. Positions on screen, the panel's step included. */
  horses: PhotoHorse[];
  arrow: { x: number; y: number } | null;
  captions: PhotoCaption[];
}

/**
 * The caption has named the winner: the photo is flagged, the winner line is due (or Enter
 * brought it), and the second horse has crossed (AN3). From then on, through the winner
 * beat, the top bar may name the winner too.
 */
export function photoNamesWinner(result: RaceResult, tl: Timeline, c: Clock): boolean {
  const second = result.finish[1];
  return result.photoFinish && second !== undefined && c.wall >= captionAt(c, tl) && c.race >= second.time;
}

/** The photo at a moment of the photo beat. `horses` is photoHorses for this race and player. */
export function photoFrame(result: RaceResult, rd: RaceDay, tl: Timeline, c: Clock, horses: readonly PhotoHorse[], playerId: string, arrowDx: number): PhotoFrame {
  const { y, landed } = photoPanelY(c.wall - (c.holdEndWall ?? c.wall), rd);
  const dy = y - PHOTO_PANEL.y;
  const wire = photoWire();
  return {
    panel: { ...PHOTO_PANEL, y },
    area: { ...PHOTO_AREA, y: PHOTO_AREA.y + dy },
    wire: { ...wire, y: wire.y + dy, stripes: wire.stripes.map((st) => ({ ...st, y: st.y + dy })) },
    horses: horses.map((h) => ({ ...h, y: h.y + dy })),
    arrow: landed ? photoArrow(horses.find((h) => h.yours), arrowDx) : null,
    captions: photoCaption(result, rd, playerId, photoNamesWinner(result, tl, c), c.race),
  };
}
