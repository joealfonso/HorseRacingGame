import type { RaceDay } from '../data/raceDaySchema';

// The P0 race-day sequence in playback seconds (wall time at normal speed):
// pick window, the field standing still, the doors open and the race clock starts,
// the winner reaches the wire, the wire hold, then "Enter: next race".

export type Phase = 'gate' | 'race' | 'done';

export interface Timeline {
  speed: number;
  /** Playback second the doors swap open; race time 0. */
  doorsAt: number;
  /** Playback second the winner reaches the wire. */
  winnerAt: number;
  /** Playback second the wire hold ends and Enter starts the next race. */
  doneAt: number;
}

export function makeTimeline(rd: RaceDay, winnerTimeHundredths: number): Timeline {
  const speed = rd.playback.speed.value;
  const doorsAt = rd.beats.pickSeconds.value + rd.beats.gateStillSeconds.value;
  const winnerAt = doorsAt + winnerTimeHundredths / 100 / speed;
  return { speed, doorsAt, winnerAt, doneAt: winnerAt + rd.beats.wireHoldSeconds.value };
}

export function phaseAt(tl: Timeline, p: number): Phase {
  if (p < tl.doorsAt) return 'gate';
  if (p < tl.doneAt) return 'race';
  return 'done';
}

/** Race time in hundredths at playback second p; 0 until the doors open. */
export const raceTimeAt = (tl: Timeline, p: number): number => Math.max(0, p - tl.doorsAt) * tl.speed * 100;

/** Playback second at which race time t (hundredths) is reached. */
export const playbackAt = (tl: Timeline, t: number): number => tl.doorsAt + t / 100 / tl.speed;

/** Advance playback by one frame's elapsed time, capped (spec 3.4). */
export const advance = (p: number, deltaMs: number, maxFrameMs: number): number => p + Math.min(Math.max(0, deltaMs), maxFrameMs) / 1000;
