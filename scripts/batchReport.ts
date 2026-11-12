import type { BatchSummary, Check } from '../src/sim/batch';
import { EVENT_TYPES, PACES, STYLES } from '../src/sim/batch';

// Turns a batch summary into plain text. Fixed layout so two runs diff cleanly.

const f = (n: number, digits = 1): string => n.toFixed(digits);
const pad = (s: string, w: number): string => s.padEnd(w);
const padL = (s: string, w: number): string => s.padStart(w);

/** Hundredths of a second as m:ss.ss. */
export function clock(hundredths: number): string {
  const m = Math.floor(hundredths / 6000);
  const s = (hundredths - m * 6000) / 100;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

function band(c: Check): string {
  if (c.min !== null && c.max !== null) return `${f(c.min, 2)} to ${f(c.max, 2)}`;
  if (c.min !== null) return `at least ${f(c.min, 2)}`;
  return `at most ${f(c.max ?? 0, 2)}`;
}

export interface ReportMeta {
  simVersion: number;
  files: { track: string; race: string; card: string; tuning: string };
  elapsedSeconds: number;
}

export function formatReport(s: BatchSummary, meta: ReportMeta): string {
  const out: string[] = [];
  const last = s.seedStart + s.races - 1;
  out.push('BATCH RUN');
  out.push(`seeds: ${s.seedStart} to ${last}`);
  out.push(`races: ${s.races}`);
  out.push(`sim version: ${meta.simVersion}`);
  out.push(`data: track ${meta.files.track}, race ${meta.files.race}, card ${meta.files.card}, tuning ${meta.files.tuning}`);
  out.push(`field size: ${s.fieldSize}`);
  out.push('');

  out.push('CHECKS (a FLAG is a tuning note, not a failure)');
  for (const c of s.checks) {
    const detail = c.detail ? ` (${c.detail})` : '';
    out.push(`${c.pass ? 'PASS' : 'FLAG'}  ${c.id}  ${c.label}: ${f(c.measured, 2)}${detail}, band ${band(c)}`);
  }
  const flags = s.checks.filter((c) => !c.pass).length;
  out.push(`${s.checks.length - flags} pass, ${flags} flag`);
  out.push('');

  out.push(`F2 POST FAIRNESS: win percent by post, ${s.fieldSize} equal horses, neutral track`);
  out.push(`${pad('style', 12)}${s.fairness.postWinPercent[STYLES[0]].map((_v, i) => padL(`post ${i + 1}`, 8)).join('')}`);
  for (const st of STYLES) out.push(`${pad(st, 12)}${s.fairness.postWinPercent[st].map((v) => padL(f(v), 8)).join('')}`);
  out.push('');

  out.push('F3 STYLE FAIRNESS: win percent per horse of each style, equal horses, styles rotated across posts');
  for (const st of STYLES) {
    const count = s.fairness.styleHorseCount[st];
    if (count === 0) out.push(`${pad(st, 12)}${padL('-', 7)}  (no horses)`);
    else out.push(`${pad(st, 12)}${padL(f(s.fairness.styleWinPercentPerHorse[st], 2), 7)}  (${count} ${count === 1 ? 'horse' : 'horses'})`);
  }
  out.push('');

  out.push('LOADED CARD');
  out.push(`${pad('name', 20)}${padL('post', 5)}  ${pad('style', 12)}${padL('win %', 7)}${padL('avg place', 11)}${padL('avg beaten', 12)}  instructions`);
  for (const h of s.card.horses) {
    out.push(`${pad(h.name, 20)}${padL(String(h.post), 5)}  ${pad(h.style, 12)}${padL(f(h.winPercent), 7)}${padL(f(h.avgPlace, 2), 11)}${padL(f(h.avgBeatenLengths, 2), 12)}  ${h.instructions.join(', ')}`.trimEnd());
  }
  out.push('');
  out.push(`winner's final time: median ${clock(s.card.winnerTime.median)}, range ${clock(s.card.winnerTime.min)} to ${clock(s.card.winnerTime.max)}`);
  out.push(`pace label, percent of races: ${PACES.map((p) => `${p} ${f(s.card.paceLabelPercent[p])}`).join(', ')}`);
  out.push(`luck events: ${f(s.card.luck.racesWithEventPercent)} percent of races had at least one; counts ${EVENT_TYPES.map((t) => `${t} ${s.card.luck.eventCount[t]}`).join(', ')}`);
  out.push('');
  out.push(`elapsed: ${f(meta.elapsedSeconds, 1)} seconds`);
  return out.join('\n') + '\n';
}
