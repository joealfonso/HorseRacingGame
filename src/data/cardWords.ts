import type { RaceDay } from './raceDaySchema';
import type { Race } from './schema';
import { fillTemplate } from './template';

// The card's conditions words (spec 4.1), shared by the loader (to check that they fit)
// and the card screen (to print them), so the two agree.

type CardCopy = RaceDay['copy']['card'];

/** Under 8 furlongs "{n} furlongs", 8 "1 mile", above 8 "1 {eighths reduced} miles". */
export function distanceWords(furlongs: number, copy: CardCopy): string {
  if (furlongs < 8) return fillTemplate(copy.furlongs, { n: furlongs });
  if (furlongs === 8) return copy.mile;
  const rest = furlongs - 8;
  const g = (a: number, b: number): number => (b === 0 ? a : g(b, a % b));
  const d = g(rest, 8);
  return fillTemplate(copy.miles, { fraction: `${rest / d}/${8 / d}` });
}

/** "1 1/4 miles, dirt, fast". */
export const conditionsLine = (race: Race, copy: CardCopy): string => fillTemplate(copy.conditions, {
  distance: distanceWords(race.distanceFurlongs, copy),
  surface: (copy.surfaces as Record<string, string>)[race.surface] ?? race.surface,
  going: (copy.goings as Record<string, string>)[race.going] ?? race.going,
});

/** The bias line: fair, one side's line, or both in short form ("Inside good, speed holding"). */
export function biasLine(bias: Race['trackBias'], copy: CardCopy): string {
  const b = copy.bias;
  const lane = bias.lane === 'neutral' ? null : bias.lane;
  const style = bias.style === 'neutral' ? null : bias.style;
  if (lane && style) return fillTemplate(b.both, { lane: b.laneShort[lane], style: b.styleShort[style] });
  if (lane) return b.lane[lane];
  if (style) return b.style[style];
  return b.fair;
}

/** Every bias line the copy can make, for the width check. */
export function allBiasLines(copy: CardCopy): string[] {
  const lanes = ['neutral', 'inside', 'outside'] as const;
  const styles = ['neutral', 'speed', 'closers'] as const;
  return lanes.flatMap((lane) => styles.map((style) => biasLine({ lane, style }, copy)));
}
