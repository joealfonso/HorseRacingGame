import type { RaceDay } from '../data/raceDaySchema';
import { strideFrame, worldX, type ViewConfig } from './view';

// The winner beat (spec 4.3, DESIGN Charm, FN2), staged by the renderer after the wire
// hold from result.finish[0] only, so it spoils nothing. The winner is held with its frame
// at frameLeft in its lane at the wire while the world scrolls past at its speed,
// slowing in whole pixels to a walk; once walking, the walk frames and the fist.
//
// Handover from the gallop out: the beat starts from the winner's gallop-out distance and
// speed at that wall second, so its world position, speed and stride phase carry on
// exactly. Only the camera moves: it cuts from the wire to the winner, and the rest of
// the field is not drawn (the winner alone).

export interface BeatStart {
  /** Winner's drawn distance (hundredths of a foot) and crossing speed (ft per race second) at the beat's start. */
  distance: number;
  speed: number;
  lane: number;
}

export interface BeatPose {
  /** Winner's drawn distance now, hundredths of a foot. */
  distance: number;
  /** Camera x so the winner's frame left sits at frameLeft. */
  cam: number;
  walking: boolean;
  /** Frame in the gallop strip while galloping, in the walk (and winner) strip once walking. */
  frame: number;
}

/** Screen px a second the beat starts at: the winner's crossing speed at playback speed. */
export const startPxPerSecond = (speedFeetPerSecond: number, cfg: ViewConfig, playbackSpeed: number): number =>
  speedFeetPerSecond * cfg.pxPerFoot * playbackSpeed;

/**
 * World px covered `tau` wall seconds into the beat: linear slowing from v0 to the walk
 * speed over slowSeconds, then the walk. Floored once, so the scroll moves by whole pixels
 * and never backs up.
 */
export function beatScroll(tau: number, v0: number, walk: number, slowSeconds: number): number {
  const t = Math.max(0, tau);
  const v1 = Math.min(v0, walk);
  if (t <= slowSeconds) return Math.floor(v0 * t - ((v0 - v1) * t * t) / (2 * slowSeconds));
  return Math.floor((v0 + v1) * slowSeconds / 2 + v1 * (t - slowSeconds));
}

export function beatPose(
  rd: RaceDay, cfg: ViewConfig, start: BeatStart, post: number, tau: number,
  playbackSpeed: number, noseX: number, gallopFrames: number, walkFrames: number,
): BeatPose {
  const wb = rd.winnerBeat;
  const v0 = startPxPerSecond(start.speed, cfg, playbackSpeed);
  const px = beatScroll(tau, v0, wb.walkPxPerSecond.value, wb.slowSeconds.value);
  const distance = start.distance + (px * 100) / cfg.pxPerFoot;
  const walking = tau >= wb.slowSeconds.value;
  const frame = walking
    ? strideFrame(distance, post, { strideFeet: wb.walkStrideFeet.value, stridePhasePerPost: cfg.stridePhasePerPost }, walkFrames)
    : strideFrame(distance, post, cfg, gallopFrames);
  return { distance, cam: worldX(distance, cfg) - noseX - wb.frameLeft.value, walking, frame };
}
