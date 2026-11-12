import type { Track } from '../data/schema';

export interface Segment {
  /** Feet from the gate, along the rail. */
  from: number;
  to: number;
  turn: boolean;
}

export interface Course {
  distanceFeet: number;
  segments: Segment[];
  /** Radius of each turn at the rail, in feet. */
  turnRadiusFeet: number;
}

const FEET_PER_FURLONG = 660;

export const furlongsToFeet = (furlongs: number): number => furlongs * FEET_PER_FURLONG;

// Laid out backwards from the wire, because every race ends at the same place:
// stretch, far turn, backstretch, clubhouse turn, then the stretch again.
// Turns are taken as half circles, a guess until the track's own drawings are found.
export function layCourse(track: Track, distanceFeet: number): Course {
  const pieces = [
    { feet: track.stretchFeet.value, turn: false },
    { feet: track.turnFeet.value, turn: true },
    { feet: track.backstretchFeet.value, turn: false },
    { feet: track.turnFeet.value, turn: true },
  ];
  const backwards: Segment[] = [];
  let toGo = 0;
  for (let i = 0; toGo < distanceFeet; i++) {
    const piece = pieces[i % pieces.length];
    const end = Math.min(distanceFeet, toGo + piece.feet);
    backwards.push({ from: distanceFeet - end, to: distanceFeet - toGo, turn: piece.turn });
    toGo = end;
  }
  return { distanceFeet, segments: backwards.reverse(), turnRadiusFeet: track.turnFeet.value / Math.PI };
}

export function isTurnAt(course: Course, feet: number): boolean {
  for (const s of course.segments) if (feet < s.to) return s.turn;
  return false;
}
