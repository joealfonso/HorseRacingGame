import type { Tuning } from '../data/schema';

type Bounds = Tuning['marginLabelBounds']['value'];

const QUARTERS = ['', ' 1/4', ' 1/2', ' 3/4'];

// Chart words for a margin in lengths. Under the neck bound it rounds to the
// nearest quarter (written 1/2, 3/4, 1, 1 1/4), from wholeLengthsFrom to whole lengths.
export function marginLabel(lengths: number, b: Bounds): string {
  if (lengths < b.noseBelow) return 'nose';
  if (lengths < b.headBelow) return 'head';
  if (lengths < b.neckBelow) return 'neck';
  if (lengths >= b.wholeLengthsFrom) return String(Math.round(lengths));
  const quarters = Math.round(lengths * 4);
  const whole = Math.floor(quarters / 4);
  const part = QUARTERS[quarters % 4];
  return whole === 0 ? part.trim() : `${whole}${part}`;
}
