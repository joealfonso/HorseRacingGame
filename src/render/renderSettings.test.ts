import { describe, expect, it } from 'vitest';
import { FRAME_HEIGHT, FRAME_WIDTH, renderSettings } from './renderSettings';

describe('B2: render settings', () => {
  it('frame is 256 x 240', () => {
    expect(FRAME_WIDTH).toBe(256);
    expect(FRAME_HEIGHT).toBe(240);
    expect(renderSettings.width).toBe(256);
    expect(renderSettings.height).toBe(240);
  });

  it('pixel-art mode is on', () => {
    expect(renderSettings.pixelArt).toBe(true);
  });

  it('anti-aliasing is off', () => {
    expect(renderSettings.antialias).toBe(false);
  });

  it('round pixels is on', () => {
    expect(renderSettings.roundPixels).toBe(true);
  });

  // A runtime Phaser import cannot load here (it needs window), so these suites would fail.
  it('runs in Node with no window and no document', () => {
    expect((globalThis as { window?: unknown }).window).toBeUndefined();
    expect((globalThis as { document?: unknown }).document).toBeUndefined();
  });
});
