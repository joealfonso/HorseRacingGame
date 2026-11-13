import Phaser from 'phaser';
import { Art, type ArtInfo } from './art';

// The data and sim error screen (spec 4.8): a full-screen framed box, Bone text, no
// actions. Reload is the fix. The lines are worked out in src/render/format.ts.

export interface ErrorData { lines: string[]; art: ArtInfo }

export class ErrorScene extends Phaser.Scene {
  constructor() {
    super('error');
  }

  create(data: ErrorData): void {
    const art = new Art(this, data.art);
    this.cameras.main.setBackgroundColor(data.art.colors.get('Ink') ?? 0);
    art.box(0, 0, 32, 30, 0);
    data.lines.forEach((line, i) => art.text(8, 8 + i * 10, line, 'Bone').setDepth(1));
  }
}
