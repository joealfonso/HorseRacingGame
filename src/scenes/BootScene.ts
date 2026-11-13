import Phaser from 'phaser';
import type { Slot } from '../data/raceDaySchema';
import type { ColorMap } from '../render/colors';
import { heldKeys, keyDown, keyState, keyUp, type KeyState } from '../render/keys';
import { prepareSlots, type ArtInfo } from './art';

// Loads every slot file that exists, then hands the art state to the next scene, with the
// keys held down meanwhile so the first screen ignores them until released (IN2).
// Spec 4.7: an Ink screen with a 128x4 Bone bar, no text (the font may not be loaded yet).

export interface BootData {
  slots: readonly Slot[];
  /** Files that answered as images, checked before the game started. */
  present: ReadonlySet<string>;
  colors: ColorMap;
  keys: ArtInfo['keys'];
  next: { key: string; data: Record<string, unknown> };
}

export class BootScene extends Phaser.Scene {
  private boot!: BootData;
  private keys: KeyState = keyState();

  constructor() {
    super('boot');
  }

  init(data: BootData): void {
    this.boot = data;
  }

  preload(): void {
    this.keys = keyState();
    const kb = this.input.keyboard;
    const onDown = (e: KeyboardEvent) => { this.keys = keyDown(this.keys, e.code, e.repeat).state; };
    const onUp = (e: KeyboardEvent) => { this.keys = keyUp(this.keys, e.code); };
    kb?.on('keydown', onDown);
    kb?.on('keyup', onUp);
    this.events.once('shutdown', () => { kb?.off('keydown', onDown); kb?.off('keyup', onUp); });
    const bone = this.boot.colors.get('Bone') ?? 0xffffff;
    this.cameras.main.setBackgroundColor(this.boot.colors.get('Ink') ?? 0);
    const bar = this.add.graphics();
    this.load.on('progress', (v: number) => {
      bar.clear();
      bar.fillStyle(bone);
      bar.fillRect(64, 118, Math.floor(128 * v), 4);
    });
    for (const slot of this.boot.slots) {
      if (slot.file !== null && slot.file.endsWith('.png') && this.boot.present.has(slot.file)) this.load.image(slot.id, slot.file);
    }
  }

  create(): void {
    const states = prepareSlots(this, this.boot.slots, this.boot.colors);
    const art: ArtInfo = { slots: this.boot.slots, states, colors: this.boot.colors, keys: this.boot.keys };
    this.scene.start(this.boot.next.key, { ...this.boot.next.data, art, held: heldKeys(this.keys) });
  }
}
