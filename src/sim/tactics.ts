import type { RunningStyle, Tuning } from '../data/schema';

export interface Placing {
  style: RunningStyle;
  isLeader: boolean;
  /** Lengths behind the leader, 0 for the leader. */
  behindLeader: number;
  /** For the leader: lengths clear of the second horse. */
  clearOfSecond: number;
}

// Effort a speed duel adds at this pace pressure (0 to 1), by style. 0 with the
// pacePressure group absent, so a race without it runs exactly as before.
function pullAt(style: RunningStyle, pressure: number, tuning: Tuning): number {
  const pp = tuning.pacePressure;
  if (pp === undefined || !(pressure > 0)) return 0;
  return pp.pull.value[style] * pressure;
}

// Effort before the rider asks, as a share of cruising speed. The pace is not set
// anywhere: it comes from front-runners pressing each other, or not, and from
// everyone else keeping their chosen distance from whoever leads. While a speed duel
// is on (pressure above 0) every horse that is not leading and not pressing for the
// lead is pulled along by its style's pull on top of that.
export function earlyEffort(p: Placing, tuning: Tuning, pressure = 0): number {
  const usual = usualEarlyEffort(p, tuning);
  if (p.isLeader) return usual;
  const pressing = p.style === 'frontRunner' && p.behindLeader <= tuning.model.frontRunnerPace.value.pressLengths;
  if (pressing) return usual;
  const pull = pullAt(p.style, pressure, tuning);
  return pull > 0 ? usual + pull : usual;
}

function usualEarlyEffort(p: Placing, tuning: Tuning): number {
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

// Told to rate early, a rider settles at the style's base effort less the drop and does
// not press for the lead or chase position, whatever the others do. The cost comes later:
// once rating ends, the usual effort above has it make up the ground it gave away.
// A duel still pulls it, by ratedPullShare of its style's pull. The caller passes 0
// pressure for a rated horse that leads: leaders feel no pull.
export function ratedEffort(style: RunningStyle, effortDrop: number, tuning: Tuning, pressure = 0): number {
  const rated = tuning.model.earlyEffort.value[style] - effortDrop;
  const pull = pullAt(style, pressure, tuning);
  const share = tuning.pacePressure?.ratedPullShare.value ?? 0;
  return pull > 0 && share > 0 ? rated + share * pull : rated;
}
