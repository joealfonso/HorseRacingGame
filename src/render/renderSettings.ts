// Plain data, no Phaser import, so a unit test can check it in Node.
export const FRAME_WIDTH = 256;
export const FRAME_HEIGHT = 240;

export const renderSettings = {
  width: FRAME_WIDTH,
  height: FRAME_HEIGHT,
  pixelArt: true,
  antialias: false,
  roundPixels: true,
} as const;
