import type { RaceDay } from '../data/raceDaySchema';
import type { Horse, Tuning } from '../data/schema';
import { fillTemplate } from '../data/template';
import { DataError } from '../data/validate';
import { marginLabel } from '../sim/margins';
import type { Call, FinishEntry } from '../sim/result';

// Every string the race view prints, as pure functions. Times are hundredths.

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Race clock: tenths while running ("1:02.4", cut not rounded), hundredths once final ("2:01.55"). H4. */
export function formatClock(hundredths: number, final: boolean): string {
  const h = Math.max(0, Math.floor(hundredths));
  const minutes = Math.floor(h / 6000);
  const seconds = Math.floor((h % 6000) / 100);
  const rest = h % 100;
  return final ? `${minutes}:${pad2(seconds)}.${pad2(rest)}` : `${minutes}:${pad2(seconds)}.${Math.floor(rest / 10)}`;
}

/** A fraction or split: "46.12" under a minute, "1:10.20" from one. H5. */
export function formatFraction(hundredths: number): string {
  const h = Math.max(0, Math.round(hundredths));
  const minutes = Math.floor(h / 6000);
  const seconds = Math.floor((h % 6000) / 100);
  const rest = pad2(h % 100);
  return minutes === 0 ? `${seconds}.${rest}` : `${minutes}:${pad2(seconds)}.${rest}`;
}

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

/** Orders in short form: "Rate, 3/8, Inside", or "Rider's call" when all are default. H6. */
export function ordersShort(instructions: Horse['instructions'], copy: RaceDay['copy']['orders']): string {
  const parts: string[] = [];
  for (const slot of ['early', 'move', 'path'] as const) {
    const value = instructions[slot];
    if (value === 'default') continue;
    parts.push((copy[slot] as Record<string, string>)[value]);
  }
  return parts.length === 0 ? copy.allDefault : parts.join(copy.joiner);
}

type Bounds = Tuning['marginLabelBounds']['value'];

/** A margin in words for the HUD: "a head" for the short ones, the sim's label otherwise. */
export function marginWords(lengthsThousandths: number, bounds: Bounds, copy: RaceDay['copy']): string {
  const label = marginLabel(lengthsThousandths / 1000, bounds);
  return label in copy.marginWords ? copy.marginWords[label as keyof RaceDay['copy']['marginWords']] : label;
}

/**
 * Your position line from the latest call (H3): "3rd, 2 1/2 back", "Leads by a head",
 * or "Post 8" before the first call.
 */
export function positionLine(call: Call | undefined, playerId: string, post: number, bounds: Bounds, copy: RaceDay['copy']): string {
  const mine = call?.horses.find((h) => h.id === playerId);
  if (!call || !mine) return fillTemplate(copy.beforeFirstCall, { post });
  if (mine.position === 1) {
    const second = call.horses.find((h) => h.position === 2);
    return fillTemplate(copy.leads, { margin: marginWords(second?.lengthsBehind ?? 0, bounds, copy) });
  }
  return fillTemplate(copy.behind, { place: ordinal(mine.position), margin: marginWords(mine.lengthsBehind, bounds, copy) });
}

/**
 * Your finish on the position line (H3b), from your horse's own finish time on:
 * "Finished 4th", the winner included ("Finished 1st"), because a place is settled as the
 * horse crosses. The winner's margin is settled only when the second horse crosses, so
 * from then on the winner reads "Won by a neck", "Won by a length" or "Won by 2 1/2".
 * Nothing here reads finish[1] before its own finish time. Null before your finish.
 */
export function finishLine(finish: readonly FinishEntry[], playerId: string, t: number, copy: RaceDay['copy']): string | null {
  const mine = finish.find((f) => f.id === playerId);
  if (!mine || t < mine.time) return null;
  const second = finish[1];
  if (mine.place !== 1 || !second || t < second.time) return fillTemplate(copy.finished, { place: ordinal(mine.place) });
  const label = second.margin?.label ?? '';
  const margin = label in copy.marginWords ? copy.marginWords[label as keyof RaceDay['copy']['marginWords']]
    : label === '1' ? copy.oneLength : label;
  return fillTemplate(copy.won, { margin });
}

/** The latest call at or before race time t. */
export function callAt(calls: readonly Call[], t: number): Call | undefined {
  let last: Call | undefined;
  for (const c of calls) if (c.time <= t) last = c;
  return last;
}

// Wrapping for the error screen (spec 4.8, ST1) ----------------------------------------

/**
 * Wraps at `width` characters, breaking at spaces (dropped), after dots and closing
 * brackets, and before opening brackets. A run with no break point is cut hard.
 */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let rest = text;
  while (rest.length > width) {
    let cut = -1;
    let skip = 0;
    for (let i = width; i > 0; i--) {
      const ch = rest[i];
      const prev = rest[i - 1];
      if (ch === ' ') { cut = i; skip = 1; break; }
      if (prev === '.' || prev === ']' || ch === '[') { cut = i; break; }
    }
    if (cut <= 0) { cut = width; skip = 0; }
    lines.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut + skip).trimStart();
  }
  if (rest.length > 0 || lines.length === 0) lines.push(rest);
  return lines;
}

export const ERROR_CHARS = 30;
export const ERROR_LINES = 22;

/** Lines for the full-screen error box, and the full text for the console. */
export function dataErrorLines(err: DataError, maxLines = ERROR_LINES): string[] {
  const head = ['The race data has a problem.', ''];
  const tail = ['', 'Fix it and reload the page.'];
  const blocks = err.issues.map((i) => [...wrap(err.file, ERROR_CHARS), ...wrap(i.path, ERROR_CHARS), ...wrap(i.message, ERROR_CHARS)]);
  const body: string[] = [];
  let shown = 0;
  for (const block of blocks) {
    const gap = body.length > 0 ? 1 : 0;
    const left = blocks.length - shown - 1;
    const reserve = left > 0 ? 2 : 0; // a blank and the "and N more" line
    if (head.length + body.length + gap + block.length + reserve + tail.length > maxLines) break;
    if (gap) body.push('');
    body.push(...block);
    shown++;
  }
  if (shown < blocks.length) body.push('', ...wrap(`and ${blocks.length - shown} more, see the console`, ERROR_CHARS));
  return [...head, ...body, ...tail];
}

export function simErrorLines(seed: number, err: unknown): string[] {
  const message = err instanceof Error ? err.message : String(err);
  return ['The race could not be run.', '', `Seed ${seed}`, '', ...wrap(message, ERROR_CHARS).slice(0, ERROR_LINES - 6), '', 'Reload the page.'];
}

export function plainErrorLines(message: string): string[] {
  return [...wrap(message, ERROR_CHARS), '', 'Fix it and reload the page.'];
}

/** Error screen lines for anything thrown at boot. */
export function bootErrorLines(err: unknown): string[] {
  if (err instanceof DataError) return dataErrorLines(err);
  return plainErrorLines(err instanceof Error ? err.message : String(err));
}
