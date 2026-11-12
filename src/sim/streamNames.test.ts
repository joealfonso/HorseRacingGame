import { describe, expect, it } from 'vitest';
import { STREAM_NAMES } from './streamNames';

describe('R6: stream names', () => {
  it('no two names are equal', () => {
    // An empty list passes. A duplicate added later fails.
    expect(new Set<string>(STREAM_NAMES).size).toBe(STREAM_NAMES.length);
  });

  it('the check itself catches a duplicate', () => {
    const list = ['pace', 'luck', 'pace'];
    expect(new Set(list).size).not.toBe(list.length);
  });
});
