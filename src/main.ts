import Phaser from 'phaser';
import { renderSettings } from './render/renderSettings';
import { integerScale } from './render/scale';
import { CheckerScene } from './scenes/CheckerScene';

// The page background in index.html is the single letterbox color. Phaser takes
// it from there so the two cannot drift apart.
const [r = 0, g = 0, b = 0] = getComputedStyle(document.body).backgroundColor.match(/\d+/g)?.map(Number) ?? [];
const letterbox = (r << 16) | (g << 8) | b;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  ...renderSettings,
  backgroundColor: letterbox,
  // NONE keeps Phaser from resizing the canvas itself. Only zoom changes, and
  // only to whole numbers.
  scale: { mode: Phaser.Scale.NONE, zoom: integerScale(window.innerWidth, window.innerHeight) },
  scene: [CheckerScene],
});

window.addEventListener('resize', () => {
  game.scale.setZoom(integerScale(window.innerWidth, window.innerHeight));
});
