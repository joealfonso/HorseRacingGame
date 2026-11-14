import type { DrawnRace } from '../bet/day';
import type { EstimateJob } from '../bet/estimate';
import type { EstimateReply, EstimateRequest } from './estimateWorker';

// The day's odds estimates, worked out in a Web Worker so no frame waits on them (UI6).
// Plain derived data: the same day seed and race always give the same estimate, so this
// holds no game state. It travels in scene data with the day, never as a global. The
// program asks for its race and the next one, so race r + 1 is worked out while the
// player reads race r's page and watches it run (UI5). The estimate itself is never shown.
//
// One worker per day. A request for a new day seed ends the old worker and starts a fresh
// one, so the new day's race 1 never queues behind the old day's work, and nothing that
// went wrong on an old day carries over. Errors are kept per race: a failure for race
// r + 1 does not stop race r.

const keyOf = (daySeed: number, race: number): string => `${daySeed}:${race}`;

export class Estimates {
  private worker: Worker | null = null;
  private daySeed: number | null = null;
  private readonly done = new Map<string, EstimateJob>();
  private readonly errors = new Map<string, string>();
  /** Asked for and not yet answered, oldest first: the worker answers in this order. */
  private pending: string[] = [];
  /** Why this day's worker could not start or stopped; every race of the day without an answer fails with it. */
  private dayProblem: string | null = null;

  constructor(private readonly runs: number) {}

  /** Asks for a race's estimate once. A race of another day starts that day afresh. */
  request(drawn: DrawnRace): void {
    if (drawn.daySeed !== this.daySeed) this.startDay(drawn.daySeed);
    const key = keyOf(drawn.daySeed, drawn.race);
    if (this.done.has(key) || this.errors.has(key) || this.pending.includes(key)) return;
    if (this.worker === null) return; // dayProblem says why, for every race of the day
    this.pending.push(key);
    const req: EstimateRequest = { key, field: drawn.input, daySeed: drawn.daySeed, race: drawn.race, runs: this.runs };
    this.worker.postMessage(req);
  }

  /** The finished estimate job for a race, or null while it is still being worked out. */
  get(drawn: DrawnRace): EstimateJob | null {
    return this.done.get(keyOf(drawn.daySeed, drawn.race)) ?? null;
  }

  /** Why this race's odds cannot be worked out, or null while all is well for it. */
  failure(drawn: DrawnRace): string | null {
    const key = keyOf(drawn.daySeed, drawn.race);
    const own = this.errors.get(key);
    if (own !== undefined) return own;
    return drawn.daySeed === this.daySeed && !this.done.has(key) ? this.dayProblem : null;
  }

  private startDay(daySeed: number): void {
    this.worker?.terminate();
    this.worker = null;
    this.daySeed = daySeed;
    this.done.clear();
    this.errors.clear();
    this.pending = [];
    this.dayProblem = null;
    let worker: Worker;
    try {
      worker = new Worker(new URL('./estimateWorker.ts', import.meta.url), { type: 'module' });
    } catch (err) {
      this.dayProblem = `the odds worker could not start: ${err instanceof Error ? err.message : String(err)}`;
      return;
    }
    // Replies from a worker that has since been ended are ignored.
    const ours = () => this.worker === worker;
    worker.onmessage = (e: MessageEvent<EstimateReply>) => {
      if (!ours()) return;
      const reply = e.data;
      const i = this.pending.indexOf(reply.key);
      if (i < 0) return; // not asked for on this day
      this.pending.splice(i, 1);
      if ('error' in reply) this.errors.set(reply.key, reply.error);
      else this.done.set(reply.key, reply.job);
    };
    // An error the worker did not catch (it failed to load, say) is not tied to one
    // request, and the worker may be unusable: every race still waiting fails with it.
    const failAll = (message: string) => {
      if (!ours()) return;
      for (const key of this.pending) this.errors.set(key, message);
      this.pending = [];
      this.dayProblem = message;
      worker.terminate();
      this.worker = null;
    };
    worker.onerror = (e: ErrorEvent) => {
      e.preventDefault();
      failAll(e.message || 'the odds worker stopped');
    };
    worker.onmessageerror = () => failAll('the odds worker sent a message that could not be read');
    this.worker = worker;
  }
}
