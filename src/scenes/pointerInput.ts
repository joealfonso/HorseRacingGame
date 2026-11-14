import Phaser from 'phaser';
import { gridPoint, hitTest, pointerBlur, pointerDown, pointerMove, pointerState, pointerTick, pointerUp, type PointerState, type PointerTarget } from '../render/pointer';

// The mouse, for every screen that takes it (docs/specs/track-hub.md section 6, TH15): the
// one place a pointer API is used. It listens to the canvas's own DOM pointer events, not
// Phaser's input queue, so an event is handled once. Each event maps the client point to the
// 1x grid through the canvas's bounding box and the zoom, both read at the event, so a resize
// is always current (TH2). Hover moves focus only when the pointer moves into a target; a
// click acts only on the primary button's release over the target it went down on (TH11);
// blur forgets the hover and any half-made click. Over a target the OS pointer is the hand.
// For `guardSeconds` after the screen arrives, presses are ignored (raceDay.json
// pointer.arrivalGuardSeconds), counted down on the scene's own update delta; hover still works.

export interface PointerHandlers<T extends string> {
  /** The pointer moved into this target: move the one focus there. Optional: the pages take clicks only. */
  hover?: (id: T) => void;
  /** A finished click on this target: do what its key does. */
  click: (id: T) => void;
}

export class PointerInput<T extends string> {
  private state: PointerState<T>;

  /**
   * `targets` is asked at every event, so it can follow the screen's state. Every screen passes
   * `guardSeconds` from raceDay.json pointer.arrivalGuardSeconds (slotStatus.test.ts checks it).
   */
  constructor(scene: Phaser.Scene, targets: () => readonly PointerTarget<T>[], handlers: PointerHandlers<T>, guardSeconds = 0) {
    this.state = pointerState<T>(guardSeconds);
    const canvas = scene.game.canvas;
    const at = (e: PointerEvent): T | null => {
      const rect = canvas.getBoundingClientRect();
      return hitTest(targets(), gridPoint(e.clientX, e.clientY, rect, Math.max(1, Math.round(scene.game.scale.zoom))));
    };
    const showCursor = (target: T | null) => { canvas.style.cursor = target === null ? 'default' : 'pointer'; };
    const onMove = (e: PointerEvent) => {
      const target = at(e);
      const r = pointerMove(this.state, target);
      this.state = r.state;
      showCursor(target);
      if (r.entered !== null) handlers.hover?.(r.entered);
    };
    const onDown = (e: PointerEvent) => { this.state = pointerDown(this.state, e.button, at(e)); };
    // On the window, so a release outside the canvas still ends (and cancels) the press.
    const onUp = (e: PointerEvent) => {
      const r = pointerUp(this.state, e.button, at(e));
      this.state = r.state;
      if (r.act !== null) handlers.click(r.act);
    };
    const onBlur = () => { this.state = pointerBlur(this.state); showCursor(null); };
    const onUpdate = (_time: number, delta: number) => { this.state = pointerTick(this.state, delta / 1000); };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onBlur);
    scene.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    scene.events.once('shutdown', () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onBlur);
      scene.game.events.off(Phaser.Core.Events.BLUR, onBlur);
      showCursor(null);
    });
  }
}
