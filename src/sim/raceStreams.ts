import { checkSeed, createStream, type Stream } from './rng';
import type { StreamName } from './streamNames';

export interface RaceStreams {
  readonly seed: number;
  /** The same name and sub-key always return the same stream object for this race. */
  get(name: StreamName, subKey?: string): Stream;
}

// One per race, passed in. Handing back the same object for a repeat request
// keeps two callers from replaying the same numbers.
export function createRaceStreams(seed: number): RaceStreams {
  checkSeed(seed);
  const made = new Map<string, Stream>();
  return {
    seed,
    get(name, subKey) {
      const key = subKey === undefined ? name : `${name}/${subKey}`;
      let stream = made.get(key);
      if (stream === undefined) {
        stream = createStream(seed, name, subKey);
        made.set(key, stream);
      }
      return stream;
    },
  };
}
