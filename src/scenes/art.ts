import Phaser from 'phaser';
import type { Slot } from '../data/raceDaySchema';
import { rgbOf, type ColorMap } from '../render/colors';
import { MAIN_CELL, MAIN_CHARS, SMALL_CELL, SMALL_CHARS, SMALL_FALLBACK, cellOf } from '../render/fontLayout';
import { checkerPixels, paintGlyphs, swapColors } from '../render/recolor';
import { SLOT_IDS, sheetSize, slotState, type SlotState } from '../render/slotStatus';

// Slots to textures. A slot whose file loaded at the right size keeps it; any other
// gets the Pink and Ink checker at the slot's size, so a missing file is never invisible.
// Recolors are exact pixel swaps of the key colors, made once per color set and cached
// in the texture manager. Fonts become one RetroFont per text color.

export interface ArtInfo {
  slots: readonly Slot[];
  states: ReadonlyMap<string, SlotState>;
  colors: ColorMap;
  keys: { outline: string; second: string; third: string };
}

type Cell = { w: number; h: number; columns: number };
type FontId = typeof SLOT_IDS.fontMain | typeof SLOT_IDS.fontSmall;

function addFrames(tex: Phaser.Textures.Texture, slot: Slot): void {
  const w = slot.frameWidth ?? tex.source[0].width;
  const h = slot.frameHeight ?? tex.source[0].height;
  const frames = slot.frames ?? 1;
  const columns = Math.min(slot.columns ?? frames, frames);
  for (let i = 0; i < frames; i++) {
    if (!tex.has(String(i))) tex.add(String(i), 0, (i % columns) * w, Math.floor(i / columns) * h, w, h);
  }
}

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number): Phaser.Textures.CanvasTexture {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) throw new Error(`could not make a ${w}x${h} canvas for ${key}`);
  return tex;
}

/** After loading: decide each slot's state and make sure every art slot has a texture with frames. */
export function prepareSlots(scene: Phaser.Scene, slots: readonly Slot[], colors: ColorMap): Map<string, SlotState> {
  const states = new Map<string, SlotState>();
  for (const slot of slots) {
    if (!slot.id.startsWith('art.') && !slot.id.startsWith('font.')) {
      states.set(slot.id, slot.file === null ? 'missing' : 'ok');
      continue;
    }
    const loaded = scene.textures.exists(slot.id) ? scene.textures.get(slot.id).source[0] : null;
    const state = slotState(slot, loaded ? { width: loaded.width, height: loaded.height } : null);
    states.set(slot.id, state);
    if (state === 'ok') {
      addFrames(scene.textures.get(slot.id), slot);
      continue;
    }
    if (slot.id.startsWith('font.')) {
      if (scene.textures.exists(slot.id)) scene.textures.remove(slot.id);
      continue; // fonts fall back to a readable stand-in, made per color in fontKey
    }
    const size = sheetSize(slot)!;
    const tex = canvasTexture(scene, slot.id, size.width, size.height);
    const img = tex.context.createImageData(size.width, size.height);
    img.data.set(checkerPixels(size.width, size.height, rgbOf(colors, 'Pink'), rgbOf(colors, 'Ink')));
    tex.context.putImageData(img, 0, 0);
    tex.refresh();
    addFrames(tex, slot);
  }
  return states;
}

export class Art {
  constructor(private readonly scene: Phaser.Scene, readonly info: ArtInfo) {}

  slot(id: string): Slot {
    const s = this.info.slots.find((x) => x.id === id);
    if (!s) throw new Error(`slot ${id} is not in src/data/slots.json`);
    return s;
  }

  ok(id: string): boolean {
    return this.info.states.get(id) === 'ok';
  }

  frames(id: string): number {
    return this.slot(id).frames ?? 1;
  }

  /** The slot's texture with the key colors Ash and Slate swapped for these palette colors. */
  recolor(id: string, second: string, third: string = second): string {
    const slot = this.slot(id);
    if (!slot.recolor || !this.ok(id)) return id;
    const key = `${id}|${second}|${third}`;
    if (this.scene.textures.exists(key)) return key;
    const src = this.scene.textures.get(id).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const tex = canvasTexture(this.scene, key, src.width, src.height);
    tex.context.drawImage(src, 0, 0);
    const img = tex.context.getImageData(0, 0, src.width, src.height);
    const c = (name: string) => rgbOf(this.info.colors, name);
    swapColors(img.data, [[c(this.info.keys.second), c(second)], [c(this.info.keys.third), c(third)]]);
    tex.context.putImageData(img, 0, 0);
    tex.refresh();
    addFrames(tex, slot);
    return key;
  }

  /**
   * A bitmap font (and texture with one frame per glyph, named by char code) in one
   * palette color. While the font file is missing, a stand-in sheet is drawn instead.
   */
  font(id: FontId, color: string): string {
    const key = `${id}|${color}`;
    if (this.scene.cache.bitmapFont.exists(key)) return key;
    const [chars, cell]: [string, Cell] = id === SLOT_IDS.fontMain ? [MAIN_CHARS, MAIN_CELL] : [SMALL_CHARS, SMALL_CELL];
    const w = cell.w * cell.columns;
    const h = cell.h * Math.ceil(chars.length / cell.columns);
    const tex = canvasTexture(this.scene, key, w, h);
    const ctx = tex.context;
    const rgb = rgbOf(this.info.colors, color);
    const ink = rgbOf(this.info.colors, this.info.keys.outline);
    if (this.ok(id)) {
      ctx.drawImage(this.scene.textures.get(id).getSourceImage() as HTMLImageElement, 0, 0);
    } else if (id === SLOT_IDS.fontSmall) {
      for (const ch of chars) {
        const at = cellOf(chars, cell, ch)!;
        SMALL_FALLBACK[ch]?.forEach((row, y) => {
          [...row].forEach((px, x) => {
            if (px === '#') { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(at.x + x, at.y + y, 1, 1); }
          });
        });
      }
    } else {
      // Stand-in for the artist's font: the browser's monospace at 8 px, cut to hard
      // pixels below. Readable, clearly not ours, and the placeholder tag shows with it.
      ctx.font = '8px monospace';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#FFFFFF';
      for (const ch of chars) {
        const at = cellOf(chars, cell, ch)!;
        ctx.fillText(ch, at.x, at.y);
      }
    }
    const img = ctx.getImageData(0, 0, w, h);
    paintGlyphs(img.data, rgb, ink);
    ctx.putImageData(img, 0, 0);
    tex.refresh();
    for (const ch of chars) {
      const at = cellOf(chars, cell, ch)!;
      tex.add(String(ch.charCodeAt(0)), 0, at.x, at.y, cell.w, cell.h);
    }
    const data = Phaser.GameObjects.RetroFont.Parse(this.scene, {
      image: key, width: cell.w, height: cell.h, chars, charsPerRow: cell.columns, lineSpacing: 0,
      'offset.x': 0, 'offset.y': 0, 'spacing.x': 0, 'spacing.y': 0,
    });
    this.scene.cache.bitmapFont.add(key, data);
    return key;
  }

  /** One line of text in the main or small font, at a whole-pixel position. */
  text(x: number, y: number, str: string, color = 'Bone', id: FontId = SLOT_IDS.fontMain): Phaser.GameObjects.BitmapText {
    return this.scene.add.bitmapText(x, y, this.font(id, color), str);
  }

  /** A single small-font glyph as an image, for saddlecloth numbers. */
  glyph(x: number, y: number, ch: string, color: string): Phaser.GameObjects.Image {
    return this.scene.add.image(x, y, this.font(SLOT_IDS.fontSmall, color), String(ch.charCodeAt(0))).setOrigin(0, 0);
  }

  /** A framed box from the 9 frame tiles: corners, edges, fill, in reading order. */
  box(x: number, y: number, tilesW: number, tilesH: number, depth: number): void {
    for (let ty = 0; ty < tilesH; ty++) {
      for (let tx = 0; tx < tilesW; tx++) {
        const col = tx === 0 ? 0 : tx === tilesW - 1 ? 2 : 1;
        const row = ty === 0 ? 0 : ty === tilesH - 1 ? 2 : 1;
        this.scene.add.image(x + tx * 8, y + ty * 8, SLOT_IDS.frameBox, String(row * 3 + col)).setOrigin(0, 0).setDepth(depth);
      }
    }
  }
}
