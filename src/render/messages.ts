import type { RaceDay } from '../data/raceDaySchema';
import { THREE_EIGHTHS_FEET_TO_GO } from '../data/schema';
import { fillTemplate } from '../data/template';
import type { RaceResult } from '../sim/result';
import { ordinal } from './format';
import { firstReachBy, raceDistance } from './view';

// The message line (spec 4.3): your horse's moments and every luck event, one at a time
// for messageSeconds of playback each, queued by priority, a waiting one dropped after
// messageMaxWaitSeconds. Times here are playback seconds from the gate opening.

export const PRIORITY = { yours: 0, other: 1, orders: 2 } as const;

export interface Trigger { at: number; priority: number; text: string }
export interface Shown { from: number; to: number; text: string }

/** Every message this race can show, for this player's horse, at playback speed `speed`. */
export function messageTriggers(result: RaceResult, rd: RaceDay, playerId: string, speed: number): Trigger[] {
  const copy = rd.copy.messages;
  const horses = result.inputs.card.horses;
  const name = (id: string) => horses.find((h) => h.id === id)?.name ?? id;
  const post = (id: string) => horses.find((h) => h.id === id)?.post ?? 0;
  const play = (raceHundredths: number) => raceHundredths / 100 / speed;
  const out: Trigger[] = [];

  for (const e of result.replay.events) {
    const yours = e.horse === playerId || e.otherHorse === playerId;
    let text: string;
    if (e.type === 'bumped' && e.otherHorse !== null) {
      const [first, second] = e.otherHorse === playerId ? [e.otherHorse, e.horse] : [e.horse, e.otherHorse];
      text = fillTemplate(copy.bumped, { name: name(first), n: post(second) });
    } else {
      text = fillTemplate(e.type === 'blocked' ? copy.blocked : copy.steadied, { name: name(e.horse) });
    }
    out.push({ at: play(e.time), priority: yours ? PRIORITY.yours : PRIORITY.other, text });
    if (yours) out.push({ at: play(e.time) + rd.hud.backInStrideSeconds.value, priority: PRIORITY.yours, text: copy.backInStride });
  }

  const mine = horses.find((h) => h.id === playerId);
  if (mine) {
    const D = raceDistance(result);
    const asked = (feetToGo: number) => {
      const t = firstReachBy(result, playerId, D - feetToGo * 100);
      if (Number.isFinite(t)) out.push({ at: play(t), priority: PRIORITY.orders, text: fillTemplate(copy.asked, { name: mine.name }) });
    };
    if (mine.instructions.move === 'moveAtThreeEighths') asked(THREE_EIGHTHS_FEET_TO_GO);
    const save = result.inputs.tuning.instructions?.saveForStretchFeetToGo.value;
    if (mine.instructions.move === 'saveForStretch' && save !== undefined) asked(save);
    const fin = result.finish.find((f) => f.id === playerId);
    if (fin) out.push({ at: play(fin.time), priority: PRIORITY.yours, text: fillTemplate(copy.home, { name: mine.name, place: ordinal(fin.place) }) });
  }
  return out.sort((a, b) => a.at - b.at || a.priority - b.priority);
}

/** When each message shows: one at a time, best priority first, stale ones dropped. */
export function messageSchedule(triggers: readonly Trigger[], showSeconds: number, maxWaitSeconds: number): Shown[] {
  const left = [...triggers];
  const shown: Shown[] = [];
  let free = -Infinity;
  while (left.length > 0) {
    const start = Math.max(free, Math.min(...left.map((m) => m.at)));
    for (let i = left.length - 1; i >= 0; i--) if (left[i].at < start - maxWaitSeconds) left.splice(i, 1);
    const ready = left.filter((m) => m.at <= start);
    if (ready.length === 0) continue;
    const best = ready.reduce((a, b) => (b.priority < a.priority || (b.priority === a.priority && b.at < a.at) ? b : a));
    left.splice(left.indexOf(best), 1);
    shown.push({ from: start, to: start + showSeconds, text: best.text });
    free = start + showSeconds;
  }
  return shown;
}

export function messageAt(shown: readonly Shown[], p: number): string | null {
  for (const s of shown) if (s.from <= p && p < s.to) return s.text;
  return null;
}
