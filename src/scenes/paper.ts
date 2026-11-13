import Phaser from 'phaser';
import type { Entry, PageImage, PageRect, PageText } from '../render/page';
import { rgbOf } from '../render/colors';
import { SLOT_IDS } from '../render/slotStatus';
import type { Art } from './art';

// Draws the program pages' pure output (src/render/page.ts): filled rects, then text in the
// main or small font, then images, in the order given. Everything it made can be cleared,
// so a page redraws whole when its state changes.

export class PagePainter {
  private objects: Phaser.GameObjects.GameObject[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly art: Art, private readonly depth: number) {}

  clear(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
  }

  rects(list: readonly PageRect[]): void {
    if (list.length === 0) return;
    const g = this.scene.add.graphics().setDepth(this.depth);
    for (const r of list) g.fillStyle(rgbOf(this.art.info.colors, r.color)).fillRect(r.x, r.y, r.w, r.h);
    this.objects.push(g);
  }

  texts(list: readonly PageText[]): void {
    for (const t of list) {
      this.objects.push(this.art.text(t.x, t.y, t.text, t.color, t.small ? SLOT_IDS.fontSmall : SLOT_IDS.fontMain).setDepth(this.depth + 1));
    }
  }

  images(list: readonly PageImage[]): void {
    for (const im of list) this.objects.push(this.scene.add.image(im.x, im.y, im.slot, '0').setOrigin(0, 0).setDepth(this.depth + 2));
  }

  entry(e: Entry): void {
    this.rects(e.rects);
    this.texts(e.texts);
    this.images(e.images);
  }
}
