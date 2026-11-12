import type { RunningStyle, Tuning } from '../data/schema';

export interface Placing {
  style: RunningStyle;
  isLeader: boolean;
  /** Lengths behind the leader, 0 for the leader. */
  behindLeader: number;
  /** For the leader: lengths clear of the second horse. */
  clearOfSecond: number;
}

// Effort before the rider asks, as a share of cruising speed. The pace is not set
// anywhere: it comes from front-runners pressing each other, or not, and from
// everyone else keeping their chosen distance from whoever leads.
export function earlyEffort(p: Placing, tuning: Tuning): number {
  const base = tuning.model.earlyEffort.value;
  const fr = tuning.model.frontRunnerPace.value;
  const pos = tuning.model.positionPace.value;

  if (p.isLeader) {
    // The closer the company, the harder a leader is pushed: eyeball to eyeball it runs
    // as hard as its presser, clear by loneLeadLengths it runs its own race. A sliding
    // response, not a switch, so a duel is fought head to head instead of settling at
    // whatever gap would flip the switch.
    const own = p.style === 'frontRunner' ? fr.loneLeadEffort : Math.min(fr.loneLeadEffort, base[p.style]);
    const pushed = Math.max(0, 1 - p.clearOfSecond / fr.loneLeadLengths);
    return own + (base.frontRunner + fr.duelEffort - own) * pushed;
  }

  if (p.style === 'frontRunner') {
    // Close enough to take the lead, so it keeps trying. Further back it has been
    // outrun and settles like a stalker rather than burning itself out.
    return p.behindLeader <= fr.pressLengths ? base.frontRunner + fr.duelEffort : base.stalker;
  }
  if (p.style === 'stalker') {
    if (p.behindLeader > pos.stalkerMaxLengths) return base.stalker + pos.effortStep;
    if (p.behindLeader < pos.stalkerMinLengths) return base.stalker - pos.effortStep;
    return base.stalker;
  }
  return p.behindLeader > pos.closerMaxLengths ? base.closer + pos.effortStep : base.closer;
}
