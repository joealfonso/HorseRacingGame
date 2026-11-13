import type { CallKey, RaceDay } from '../data/raceDaySchema';
import { fillTemplate } from '../data/template';
import type { RaceResult } from '../sim/result';
import { formatFraction } from './format';
import { FEET_PER_FURLONG, firstReach, raceDistance } from './view';

// The announcer (spec 4.3, AN1 to AN4): one call per pole as the leader reaches it,
// placed by the course, plus the gate, the break, the final sixteenth and the winner.
// Lines rotate by race number, (raceNumber + index) mod variants, never by a random draw.

export type ScheduleKey = CallKey | 'pace';

export interface ScheduledCall {
  key: ScheduleKey;
  /** Race time in hundredths. The gate call is -Infinity: it shows before the doors open. */
  at: number;
  /** Furlongs to go for a pole call, null otherwise. */
  furlongsToGo: number | null;
  text: string;
  /** Types out character by character; false cuts in whole. */
  typed: boolean;
}

export const FAST_CALL_CHARS = 27;

/** The location key for each pole in result.calls, by the course layout (AN1). */
export function poleKeys(result: RaceResult): { furlongsToGo: number; key: ScheduleKey }[] {
  const D = raceDistance(result);
  const course = result.replay.course;
  const straights = course.filter((s) => !s.turn);
  const turns = course.filter((s) => s.turn);
  const fromEnd = <T>(list: T[], s: T) => list.length - 1 - list.indexOf(s);
  const homeStretch = straights[straights.length - 1];
  // Every straight but the last ends at the wire when counted back from it in pairs.
  const wirePasses = new Set(straights.filter((s) => s !== homeStretch && fromEnd(straights, s) % 2 === 0).map((s) => s.to));
  const furlongs = result.inputs.race.distanceFurlongs;
  const halfFromGate = 4 * FEET_PER_FURLONG * 100;
  const pacePole = (() => {
    const poles = result.calls.map((c) => ({ toGo: c.furlongsToGo, d: D - c.furlongsToGo * FEET_PER_FURLONG * 100 }));
    const half = poles.find((p) => p.toGo === 4 && p.d >= halfFromGate);
    if (half) return half.toGo;
    return poles.find((p) => p.toGo > 2 && p.d >= halfFromGate)?.toGo ?? null;
  })();
  const used = new Set<object>();

  return result.calls.map((c, i) => {
    const d = D - c.furlongsToGo * FEET_PER_FURLONG * 100;
    const seg = course.find((s) => d > s.from && d <= s.to) ?? course[0];
    const firstIn = !used.has(seg);
    const key = ((): ScheduleKey => {
      if (c.furlongsToGo === 1) return i > 0 && result.calls[i - 1].horses[0].id === c.horses[0].id ? 'leaderSame' : i > 0 ? 'leaderNew' : 'leaderSame';
      if (c.furlongsToGo === 2 || d === homeStretch.from) return 'home';
      if (c.furlongsToGo === pacePole) return 'pace';
      if (i === 0 && furlongs > 1) return 'earlyLeader';
      if (wirePasses.has(d)) return 'firstTimeBy';
      if (firstIn && seg.turn) return fromEnd(turns, seg) % 2 === 0 ? 'farTurn' : 'clubhouseTurn';
      if (firstIn && !seg.turn && seg !== homeStretch && fromEnd(straights, seg) % 2 === 1) return 'backstretch';
      return 'leader';
    })();
    if (['farTurn', 'clubhouseTurn', 'backstretch'].includes(key)) used.add(seg);
    return { furlongsToGo: c.furlongsToGo, key };
  });
}

/** The whole announcer schedule for this race, in the order it is heard. */
export function callSchedule(result: RaceResult, rd: RaceDay, raceNumber: number): ScheduledCall[] {
  const calls = rd.copy.calls;
  const name = new Map(result.inputs.card.horses.map((h) => [h.id, h.name]));
  const typeUntil = rd.hud.typeUntilFurlongsToGo.value;
  type Entry = Omit<ScheduledCall, 'text'> & { lines: string[]; values: Record<string, string> };
  const entries: Entry[] = [];
  const push = (key: ScheduleKey, at: number, furlongsToGo: number | null, lines: string[], values: Record<string, string>, typed: boolean) =>
    entries.push({ key, at, furlongsToGo, typed, lines, values });

  push('gate', -Infinity, null, calls.gate, {}, true);
  push('off', 0, null, calls.off, {}, true);
  const keys = poleKeys(result);
  result.calls.forEach((c, i) => {
    const key = keys[i].key;
    const leader = name.get(c.horses[0].id) ?? c.horses[0].id;
    const lines = key === 'pace' ? calls.pace[result.pace.label] : calls[key as CallKey];
    push(key, c.time, c.furlongsToGo, lines, { leader, half: formatFraction(result.pace.halfMile) }, c.furlongsToGo > typeUntil);
  });
  const finalAt = firstReach(result, raceDistance(result) - (FEET_PER_FURLONG / 2) * 100);
  if (Number.isFinite(finalAt) && finalAt < result.finish[0].time) push('wire', finalAt, null, calls.wire, {}, false);
  const winner = name.get(result.finish[0].id) ?? result.finish[0].id;
  if (result.photoFinish) push('photo', result.finish[0].time, null, calls.photo, {}, false);
  else push('winner', result.finish[0].time, null, calls.winner, { winner }, false);

  return entries.map((e, index) => ({
    key: e.key,
    at: e.at,
    furlongsToGo: e.furlongsToGo,
    typed: e.typed,
    text: fillTemplate(e.lines[(((raceNumber + index) % e.lines.length) + e.lines.length) % e.lines.length], e.values),
  }));
}

/**
 * The announcer bar at a playback moment. `playbackOf` turns a call's race time into
 * playback seconds, so typing runs in wall time whatever the speed.
 */
export function announcerAt(schedule: readonly ScheduledCall[], p: number, playbackOf: (raceTime: number) => number, charsPerSecond: number): string {
  let current: ScheduledCall | undefined;
  let start = 0;
  for (const c of schedule) {
    const at = c.at === -Infinity ? 0 : playbackOf(c.at);
    if (at <= p) {
      current = c;
      start = at;
    }
  }
  if (!current) return '';
  if (!current.typed) return current.text;
  return current.text.slice(0, Math.max(0, Math.floor((p - start) * charsPerSecond)));
}

/** While "4x" shows the bar holds 27 characters (AN4). */
export const callForBar = (text: string, fast: boolean): string => (fast ? text.slice(0, FAST_CALL_CHARS) : text);
