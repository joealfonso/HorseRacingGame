// Integer math only (Math.imul, shifts, xor), so every JavaScript engine gives
// the same numbers. The one division is by 2^32, which is exact.

export interface Stream {
  /** A float in [0, 1). */
  float(): number;
  /** A whole number from min to max, both included. */
  int(min: number, max: number): number;
}

const MAX_SEED = 4294967295;

export function checkSeed(seed: number): void {
  if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) {
    const shown = typeof seed === 'string' ? JSON.stringify(seed) : String(seed);
    throw new Error(`Race seed must be a whole number from 0 to ${MAX_SEED}, got ${shown}`);
  }
}

// A stream's state comes only from its own key, so no stream can shift another.
// The name may not hold "/", which keeps "seed/name/subKey" unambiguous.
export function createStream(seed: number, name: string, subKey?: string): Stream {
  checkSeed(seed);
  if (name === '' || name.includes('/')) {
    throw new Error(`Stream name must be non-empty and contain no "/", got ${JSON.stringify(name)}`);
  }
  if (subKey === '') throw new Error(`Stream sub-key for "${name}" must be non-empty when given`);

  const key = subKey === undefined ? `${seed}/${name}` : `${seed}/${name}/${subKey}`;
  const next = sfc32(cyrb128(key));

  return {
    float: () => next() / 4294967296,
    int(min, max) {
      const size = max - min + 1;
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || size < 1 || size > 4294967296) {
        throw new Error(`int(${min}, ${max}) needs whole numbers with min <= max and at most 2^32 values`);
      }
      // float() is k / 2^32, so float() * size never rounds up to size.
      return min + Math.floor((next() / 4294967296) * size);
    },
  };
}

// cyrb128 by bryc (github.com/bryc/code, jshash/PRNGs.md): string to 128 bits.
function cyrb128(text: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

// sfc32 by Chris Doty-Humphrey (PractRand). Returns a whole number in [0, 2^32).
function sfc32([a, b, c, d]: [number, number, number, number]): () => number {
  return () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
}
