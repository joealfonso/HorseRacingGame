import { THREE_EIGHTHS_FEET_TO_GO, type Horse, type Tuning } from '../data/schema';

// What the rider's orders change about one horse's race. Null and false mean "as the
// horse would run without orders", so a horse with no instructions runs exactly as before
// instructions existed. None of this is random: the rider does what it is told.
//
// Each order trades something. In this model a kick costs no more per second than
// cruising, and reserve the horse does not need buys no speed, so without these trades
// an early move would be free and waiting would only lose ground.
export interface Orders {
  /** Feet before the wire where the rider asks, or null for the style's usual point. */
  askFeetToGo: number | null;
  /** Held back until this many feet from the gate, by this share of effort, or null if not rated. */
  rate: { untilFeet: number; effortDrop: number } | null;
  /** Asked before its usual point, the share of the kick's higher gear it gets until that point. */
  earlyMoveGearShare: number | null;
  /** Added to the kick, as a share of cruise, for a horse saving it for the stretch. */
  extraKick: number | null;
  /** Holds the rail until asked: takes back to drop in, and goes around only a horse well slower. */
  stayInside: boolean;
  /** For a horse told to stay inside, how much slower a horse in front must be before it goes around, as a share. */
  stayInsidePassMargin: number | null;
}

export function ordersFor(horse: Horse, tuning: Tuning, distanceFeet: number): Orders {
  const { early, move, path } = horse.instructions;
  if (early === 'default' && move === 'default' && path === 'default') {
    return { askFeetToGo: null, rate: null, earlyMoveGearShare: null, extraKick: null, stayInside: false, stayInsidePassMargin: null };
  }
  const t = tuning.instructions;
  if (t === undefined) throw new Error(`horse ${horse.id} has instructions but tuning.instructions is missing`);
  const saved = move === 'saveForStretch';
  return {
    askFeetToGo: move === 'moveAtThreeEighths' ? THREE_EIGHTHS_FEET_TO_GO : saved ? t.saveForStretchFeetToGo.value : null,
    rate: early === 'rateEarly' ? { untilFeet: distanceFeet * t.rateEarlyUntilShare.value, effortDrop: t.rateEarlyEffortDrop.value } : null,
    earlyMoveGearShare: move === 'moveAtThreeEighths' ? t.earlyMoveGearShare.value : null,
    extraKick: saved ? t.saveForStretchKickShare.value : null,
    stayInside: path === 'stayInside',
    stayInsidePassMargin: path === 'stayInside' ? t.stayInsidePassMarginShare.value : null,
  };
}
