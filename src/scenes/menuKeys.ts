import Phaser from 'phaser';
import { REPEATING_KEYS, heldKeys, keyDown, keyState, keyUp, repeatsBetween, type KeyState } from '../render/keys';

// Keys for the card and Orders screens: the held-key guard from src/render/keys.ts (IN2:
// repeats of a key held into the screen never act), no OS auto-repeat, and the menus' own
// arrow repeat from data (spec 5). Each acting press goes to `act`; the scene does the rest.

export class MenuKeys {
  private keys: KeyState;
  private held: { code: string; seconds: number } | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    heldFromBefore: readonly string[],
    private readonly repeat: { delaySeconds: number; everySeconds: number },
    private readonly act: (code: string) => void,
  ) {
    this.keys = keyState(heldFromBefore);
    const kb = scene.input.keyboard;
    if (!kb) return;
    kb.addCapture('SPACE,ENTER,UP,DOWN,LEFT,RIGHT,ESC,BACKSPACE');
    const onDown = (e: KeyboardEvent) => {
      const r = keyDown(this.keys, e.code, e.repeat);
      this.keys = r.state;
      if (!r.act) return;
      this.held = REPEATING_KEYS.includes(e.code) ? { code: e.code, seconds: 0 } : null;
      this.act(e.code);
    };
    const onUp = (e: KeyboardEvent) => {
      this.keys = keyUp(this.keys, e.code);
      if (this.held?.code === e.code) this.held = null;
    };
    // A key let go while the window is unfocused never sends keyup, so forget them all.
    const onBlur = () => { this.keys = keyState(); this.held = null; };
    kb.on('keydown', onDown);
    kb.on('keyup', onUp);
    scene.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    scene.events.once('shutdown', () => {
      kb.off('keydown', onDown);
      kb.off('keyup', onUp);
      scene.game.events.off(Phaser.Core.Events.BLUR, onBlur);
    });
  }

  /** Advance a held arrow's repeat by `dt` seconds. */
  update(dt: number): void {
    const h = this.held;
    if (!h || !this.keys.down.has(h.code)) return;
    const before = h.seconds;
    h.seconds += dt;
    const n = repeatsBetween(before, h.seconds, this.repeat.delaySeconds, this.repeat.everySeconds);
    for (let i = 0; i < n && this.held === h; i++) this.act(h.code);
  }

  /** Keys this screen cannot show were released, handed to the next screen as held over. */
  down(): string[] {
    return heldKeys(this.keys);
  }
}
