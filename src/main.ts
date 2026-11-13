import Phaser from 'phaser';
import { loadData } from './data/load';
import palette from './data/palette.json';
import { paletteSchema, type Slot } from './data/raceDaySchema';
import { loadRaceDay } from './data/raceDayLoad';
import { colorMap, type ColorMap } from './render/colors';
import { bootErrorLines } from './render/format';
import { renderSettings } from './render/renderSettings';
import { integerScale } from './render/scale';
import { newSession, parseSeedParam } from './render/session';
import { ERROR_SCREEN_SLOT_IDS, SLOT_IDS } from './render/slotStatus';
import type { ArtInfo } from './scenes/art';
import { BootScene, type BootData } from './scenes/BootScene';
import { CardScene } from './scenes/CardScene';
import { ErrorScene } from './scenes/ErrorScene';
import { OrdersScene } from './scenes/OrdersScene';
import { RaceScene } from './scenes/RaceScene';
import { ResultScene } from './scenes/ResultScene';

// The page background in index.html is the single letterbox color. Phaser takes
// it from there so the two cannot drift apart.
const [r = 0, g = 0, b = 0] = getComputedStyle(document.body).backgroundColor.match(/\d+/g)?.map(Number) ?? [];
const letterbox = (r << 16) | (g << 8) | b;

// The error screen cannot trust the data files, so its slots and colors live here,
// at the paths the slot naming rule gives (dots to slashes).
const ERROR_SLOT_SHAPES: Record<string, Omit<Slot, 'id' | 'file' | 'placeholder'>> = {
  [SLOT_IDS.fontMain]: { frameWidth: 8, frameHeight: 8, frames: 95, columns: 16 },
  [SLOT_IDS.fontSmall]: { frameWidth: 4, frameHeight: 6, frames: 16, columns: 16 },
  [SLOT_IDS.frameBox]: { frameWidth: 8, frameHeight: 8, frames: 9, columns: 3 },
};
const ERROR_SLOTS: Slot[] = ERROR_SCREEN_SLOT_IDS.map((id) => ({
  id, file: `assets/${id.replaceAll('.', '/')}.png`, placeholder: false, ...ERROR_SLOT_SHAPES[id],
}));
const ERROR_COLORS: ColorMap = new Map([['Ink', 0x14111c], ['Bone', 0xf6f0e2], ['Pink', 0xf28cba], ['Ash', 0x8e8a98], ['Slate', 0x575464]]);
const KEY_COLORS: ArtInfo['keys'] = { outline: 'Ink', second: 'Ash', third: 'Slate' };

/** Which files answer as images. Vite's dev server answers a missing file with the page itself. */
async function imagesPresent(files: string[]): Promise<Set<string>> {
  const checks = await Promise.all(files.map(async (file) => {
    try {
      const res = await fetch(file, { method: 'HEAD', cache: 'no-store' });
      return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/') ? file : null;
    } catch {
      return null;
    }
  }));
  return new Set(checks.filter((f): f is string => f !== null));
}

async function start(): Promise<void> {
  let boot: Omit<BootData, 'present'>;
  try {
    const seed = parseSeedParam(window.location.search);
    if ('error' in seed) throw new Error(seed.error);
    const game = loadData();
    const rd = loadRaceDay(game);
    // The first seed is drawn here, in app code, never inside src/sim/.
    const firstSeed = seed.seed ?? crypto.getRandomValues(new Uint32Array(1))[0];
    const session = newSession(firstSeed);
    console.info(`Race day: first seed ${firstSeed}. Add ?seed=${firstSeed} to the address to replay this day.`);
    boot = {
      slots: rd.slots.slots,
      colors: colorMap(rd.palette),
      keys: rd.palette.keyColors,
      next: { key: 'card', data: { game, rd, session } },
    };
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    const pal = paletteSchema.safeParse(palette);
    boot = {
      slots: ERROR_SLOTS,
      colors: pal.success ? colorMap(pal.data) : ERROR_COLORS,
      keys: KEY_COLORS,
      next: { key: 'error', data: { lines: bootErrorLines(err) } },
    };
  }
  const present = await imagesPresent(boot.slots.flatMap((s) => (s.file !== null && s.file.endsWith('.png') ? [s.file] : [])));

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    ...renderSettings,
    backgroundColor: letterbox,
    // NONE keeps Phaser from resizing the canvas itself. Only zoom changes, and
    // only to whole numbers.
    scale: { mode: Phaser.Scale.NONE, zoom: integerScale(window.innerWidth, window.innerHeight) },
  });
  game.scene.add('card', CardScene);
  game.scene.add('orders', OrdersScene);
  game.scene.add('race', RaceScene);
  game.scene.add('result', ResultScene);
  game.scene.add('error', ErrorScene);
  game.scene.add('boot', BootScene, true, { ...boot, present });

  window.addEventListener('resize', () => {
    game.scale.setZoom(integerScale(window.innerWidth, window.innerHeight));
  });
}

void start();
