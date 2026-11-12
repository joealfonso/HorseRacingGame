import Phaser from 'phaser';
import { FRAME_HEIGHT, FRAME_WIDTH } from '../render/renderSettings';
import { COLORS } from './placeholderColors';

const TILE = 16;

// Exists only to prove the display by eye: 16x15 checker plus a 1px border.
export class CheckerScene extends Phaser.Scene {
  constructor() {
    super('checker');
  }

  create(): void {
    const g = this.add.graphics();

    for (let row = 0; row < FRAME_HEIGHT / TILE; row++) {
      for (let col = 0; col < FRAME_WIDTH / TILE; col++) {
        g.fillStyle((row + col) % 2 === 0 ? COLORS.tileA : COLORS.tileB);
        g.fillRect(col * TILE, row * TILE, TILE, TILE);
      }
    }

    g.fillStyle(COLORS.border);
    g.fillRect(0, 0, FRAME_WIDTH, 1);
    g.fillRect(0, FRAME_HEIGHT - 1, FRAME_WIDTH, 1);
    g.fillRect(0, 0, 1, FRAME_HEIGHT);
    g.fillRect(FRAME_WIDTH - 1, 0, 1, FRAME_HEIGHT);
  }
}
