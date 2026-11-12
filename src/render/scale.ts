import { FRAME_HEIGHT, FRAME_WIDTH } from './renderSettings';

// Counted in CSS pixels. Bad input (zero, negative, NaN, infinite) gets 1 so a
// hidden tab or mid-resize event can never produce a 0 or NaN canvas size.
export function integerScale(windowWidth: number, windowHeight: number): number {
  if (!Number.isFinite(windowWidth) || !Number.isFinite(windowHeight)) return 1;
  const fit = Math.floor(Math.min(windowWidth / FRAME_WIDTH, windowHeight / FRAME_HEIGHT));
  return Math.max(1, fit);
}
