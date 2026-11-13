import { beatTimes, sequenceSeconds, type RaceDay } from '../data/raceDaySchema';

// The race-day sequence (spec 4.3) as pure data and pure steps. Two times run side by
// side: wall seconds (what the player sits through, paused time excluded) and race time
// (hundredths of a second from the gate opening, what the result is in). They are linked
// at the playback speed, except while Space holds 4x and when Enter skips. Calls, messages
// and ambient loops run in wall time, so 4x does not shorten them.

export { sequenceSeconds };

export type Phase = 'gate' | 'race' | 'hold' | 'photo' | 'winner' | 'done';

/** The beat lengths and the race's fixed times, for a race played at normal speed. */
export interface Timeline {
  speed: number;
  fastSpeed: number;
  /** Playback second the doors swap open; race time 0. */
  doorsAt: number;
  /** Playback second the winner reaches the wire, at normal speed throughout. */
  winnerAt: number;
  /** Playback second the wire hold ends, at normal speed throughout. */
  doneAt: number;
  /** Playback second the photo ends, at normal speed with no Enter; doneAt when there is no photo. */
  photoEndAt: number;
  /** Playback second the winner beat ends, at normal speed throughout. */
  beatEndAt: number;
  winnerTime: number;
  holdSeconds: number;
  /** The whole photo (spec 4.4), 0 when the result has none, and its look before the caption. */
  photoSeconds: number;
  captionSeconds: number;
  beatSeconds: number;
}

/** `photo` is `result.photoFinish`: the photo beat is only played when the result flags one (PH1). */
export function makeTimeline(rd: RaceDay, winnerTimeHundredths: number, photo = false): Timeline {
  const b = beatTimes(rd, winnerTimeHundredths / 100, photo);
  return {
    speed: rd.playback.speed.value, fastSpeed: rd.playback.fastSpeed.value, doorsAt: b.doorsAt, winnerAt: b.winnerAt,
    doneAt: b.holdEndAt, photoEndAt: b.photoEndAt, beatEndAt: b.beatEndAt, winnerTime: winnerTimeHundredths,
    holdSeconds: rd.beats.wireHoldSeconds.value,
    photoSeconds: photo ? rd.beats.photoSeconds.value : 0,
    captionSeconds: Math.min(rd.beats.photoCaptionSeconds.value, rd.beats.photoSeconds.value),
    beatSeconds: rd.beats.winnerBeatSeconds.value,
  };
}

/** From `wall` on, race time runs at `rate` race seconds per wall second, starting at `race`. */
export interface Mark { wall: number; race: number; rate: number }

export interface Clock {
  wall: number;
  /** Race time, hundredths. 0 until the doors open. */
  race: number;
  doorsWall: number | null;
  winnerWall: number | null;
  holdEndWall: number | null;
  /** The photo's end; the same second as holdEndWall when the race has no photo. */
  photoEndWall: number | null;
  /** Enter showed the photo's caption early at this wall second (first Enter of two). */
  captionWall: number | null;
  beatEndWall: number | null;
  /** How race time followed wall time since the doors opened. A skip is two marks at one wall second. */
  marks: readonly Mark[];
  /** 4x is running this moment (Space held during the race). */
  fast: boolean;
}

export function phaseOf(c: Clock): Phase {
  if (c.doorsWall === null) return 'gate';
  if (c.winnerWall === null) return 'race';
  if (c.holdEndWall === null) return 'hold';
  if (c.photoEndWall === null) return 'photo';
  if (c.beatEndWall === null) return 'winner';
  return 'done';
}

export const startClock = (): Clock => ({
  wall: 0, race: 0, doorsWall: null, winnerWall: null, holdEndWall: null, photoEndWall: null, captionWall: null, beatEndWall: null, marks: [], fast: false,
});

/** The wall second the photo's winner line shows: captionSeconds into the photo, or the first Enter. */
export function captionAt(c: Clock, tl: Timeline): number {
  if (c.holdEndWall === null) return Infinity;
  return Math.min(c.captionWall ?? Infinity, c.holdEndWall + tl.captionSeconds);
}

/** The wall second the photo ends by itself: photoSeconds - captionSeconds after the winner line shows. */
const photoEndBy = (c: Clock, tl: Timeline): number => captionAt(c, tl) + (tl.photoSeconds - tl.captionSeconds);

/**
 * The hold has just ended at the clock's wall second: into the photo, or straight past it
 * when there is none. Race time runs on underneath; the race view freezes itself (raceFrame).
 */
const endHold = (c: Clock, tl: Timeline): Clock =>
  ({ ...c, holdEndWall: c.wall, photoEndWall: tl.photoSeconds > 0 ? null : c.wall });

/** The clock at playback second p for a race played at normal speed, no skips, no pause. */
export function clockAt(tl: Timeline, p: number): Clock {
  const doors = p >= tl.doorsAt;
  return {
    wall: p,
    race: raceTimeAt(tl, p),
    doorsWall: doors ? tl.doorsAt : null,
    winnerWall: p >= tl.winnerAt ? tl.winnerAt : null,
    holdEndWall: p >= tl.doneAt ? tl.doneAt : null,
    photoEndWall: p >= tl.photoEndAt ? tl.photoEndAt : null,
    captionWall: null,
    beatEndWall: p >= tl.beatEndAt ? tl.beatEndAt : null,
    marks: doors ? [{ wall: tl.doorsAt, race: 0, rate: tl.speed }] : [],
    fast: false,
  };
}

/** A clock played at normal speed with no skips: every wall time is the old playback time. */
export const isPlain = (c: Clock, tl: Timeline): boolean =>
  !c.fast && c.marks.length <= 1 && (c.marks.length === 0 || (c.marks[0].wall === tl.doorsAt && c.marks[0].rate === tl.speed && c.marks[0].race === 0));

/** The wall second race time t was first reached, or Infinity if it has not been. */
export function wallAtRace(c: Clock, t: number): number {
  if (c.doorsWall === null || t > c.race) return Infinity;
  const m = c.marks;
  for (let i = 0; i < m.length; i++) {
    if (t <= m[i].race) return m[i].wall;
    const next = m[i + 1];
    const end = next ? m[i].race + (next.wall - m[i].wall) * m[i].rate * 100 : Infinity;
    if (t <= end) return m[i].wall + (t - m[i].race) / 100 / m[i].rate;
  }
  return Infinity;
}

/**
 * The race time a skip jumped over, as open spans (before, after): two marks at one wall
 * second. Something whose race time lies strictly inside one never happened on screen.
 */
export function skippedSpans(c: Clock): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < c.marks.length; i++) {
    const a = c.marks[i];
    const b = c.marks[i + 1];
    if (a.wall === b.wall && b.race > a.race) out.push([a.race, b.race]);
  }
  return out;
}

export const wasSkipped = (c: Clock, t: number): boolean => skippedSpans(c).some(([a, b]) => t > a && t < b);

/** Race time (hundredths) at wall second w, from the marks: the same number every frame. */
export function raceAtWall(c: Clock, w: number): number {
  let m: Mark | undefined;
  for (const x of c.marks) if (x.wall <= w) m = x;
  return m ? m.race + (w - m.wall) * m.rate * 100 : 0;
}

const withRate = (c: Clock, rate: number): Clock => {
  const last = c.marks[c.marks.length - 1];
  if (last && last.rate === rate) return c;
  return { ...c, marks: [...c.marks, { wall: c.wall, race: c.race, rate }] };
};

/**
 * Advance by one frame's wall seconds (already capped). `fastHeld` is Space; it speeds
 * the race beat only. Every beat boundary inside the frame lands at its exact wall second.
 */
export function tick(c0: Clock, tl: Timeline, dt: number, fastHeld: boolean): Clock {
  let c = c0;
  let left = Math.max(0, dt);
  for (let guard = 0; guard < 10; guard++) {
    const phase = phaseOf(c);
    if (phase === 'gate') {
      const toDoors = tl.doorsAt - c.wall;
      if (left < toDoors) return { ...c, wall: c.wall + left, fast: false };
      c = { ...c, wall: tl.doorsAt, doorsWall: tl.doorsAt, marks: [{ wall: tl.doorsAt, race: 0, rate: tl.speed }] };
      left -= Math.max(0, toDoors);
      continue;
    }
    const fast = phase === 'race' && fastHeld;
    c = { ...withRate(c, fast ? tl.fastSpeed : tl.speed), fast };
    const mark = c.marks[c.marks.length - 1];
    const rate = mark.rate;
    let until = Infinity;
    if (phase === 'race') until = (tl.winnerTime - c.race) / 100 / rate;
    else if (phase === 'hold') until = c.winnerWall! + tl.holdSeconds - c.wall;
    else if (phase === 'photo') until = photoEndBy(c, tl) - c.wall;
    else if (phase === 'winner') until = c.photoEndWall! + tl.beatSeconds - c.wall;
    const step = Math.min(left, Math.max(0, until));
    // Race time from the mark, not summed frame by frame, so it does not drift from wall time.
    const wall = c.wall + step;
    c = { ...c, wall, race: mark.race + (wall - mark.wall) * rate * 100 };
    left -= step;
    if (step < until || until === Infinity) return c;
    if (phase === 'race') c = { ...c, race: tl.winnerTime, winnerWall: c.wall };
    else if (phase === 'hold') c = endHold(c, tl);
    else if (phase === 'photo') c = { ...c, photoEndWall: c.wall };
    else if (phase === 'winner') c = { ...c, beatEndWall: c.wall };
    if (left <= 0) return { ...c, fast: phaseOf(c) === 'race' && fastHeld };
  }
  return c;
}

/** Where Enter sends the race (FN1): to the leader at the 1/4 pole, then to the winner's finish. */
export function skipRaceTarget(quarterPoleTime: number, winnerTime: number, t: number): number {
  return t < quarterPoleTime ? quarterPoleTime : winnerTime;
}

/**
 * Enter: open the doors now, jump the race forward, or end the hold or the winner beat now.
 * In the photo the first Enter shows the caption at once and the second ends the photo.
 */
export function skip(c: Clock, tl: Timeline, quarterPoleTime: number): Clock {
  switch (phaseOf(c)) {
    case 'gate':
      return { ...c, doorsWall: c.wall, marks: [{ wall: c.wall, race: 0, rate: tl.speed }] };
    case 'race': {
      const target = skipRaceTarget(quarterPoleTime, tl.winnerTime, c.race);
      const rate = c.marks[c.marks.length - 1]?.rate ?? tl.speed;
      const marks = [...c.marks, { wall: c.wall, race: c.race, rate }, { wall: c.wall, race: target, rate }];
      return { ...c, race: target, marks, winnerWall: target >= tl.winnerTime ? c.wall : null };
    }
    case 'hold':
      return endHold(c, tl);
    case 'photo':
      return c.wall < captionAt(c, tl) ? { ...c, captionWall: c.wall } : { ...c, photoEndWall: c.wall };
    case 'winner':
      return { ...c, beatEndWall: c.wall };
    default:
      return c;
  }
}

// The P0 functions, unchanged: playback second p of a race at normal speed.

export function phaseAt(tl: Timeline, p: number): Phase {
  return phaseOf(clockAt(tl, p));
}

/** Race time in hundredths at playback second p; 0 until the doors open. */
export const raceTimeAt = (tl: Timeline, p: number): number => Math.max(0, p - tl.doorsAt) * tl.speed * 100;

/** Playback second at which race time t (hundredths) is reached. */
export const playbackAt = (tl: Timeline, t: number): number => tl.doorsAt + t / 100 / tl.speed;

/** Advance playback by one frame's elapsed time, capped (spec 3.4). */
export const advance = (p: number, deltaMs: number, maxFrameMs: number): number => p + Math.min(Math.max(0, deltaMs), maxFrameMs) / 1000;
