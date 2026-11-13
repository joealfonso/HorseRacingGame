import Phaser from 'phaser';
import type { RaceDayData } from '../data/raceDayLoad';
import type { GameData } from '../data/schema';
import { rgbOf } from '../render/colors';
import { heldKeys, keyDown, keyState, keyUp, type KeyState } from '../render/keys';
import { PAPER_CURSOR_SWAPS, PAPER_MARKER_SWAPS } from '../render/page';
import { cursorFrame } from '../render/pause';
import { RESULT_CONFIRM_KEYS, resultScreen, type ResultScreen } from '../render/resultScreen';
import type { Session } from '../render/session';
import { SLOT_IDS } from '../render/slotStatus';
import type { RaceResult } from '../sim/result';
import { Art, type ArtInfo } from './art';
import type { CardData } from './CardScene';
import { PagePainter } from './paper';

// The result screen (spec 4.6): the order of finish, your trip, the time, splits and seed,
// and one action, Next race. Its own scene, opened by the race scene when the winner beat
// ends. Every word and position comes from src/render/resultScreen.ts; this file places
// them and keeps the keys. It reads the result and never changes it.

export interface ResultData {
  game: GameData; rd: RaceDayData; art: ArtInfo; session: Session;
  result: RaceResult;
  /** Your horse in this race, as the race scene had it. */
  playerId: string;
  /** Keys still down from the race, ignored until released (IN2). */
  held?: string[];
}

export class ResultScene extends Phaser.Scene {
  private data0!: ResultData;
  private keys: KeyState = keyState();
  private seconds = 0;
  private leaving = false;
  private cursor!: Phaser.GameObjects.Image;

  constructor() {
    super('result');
  }

  create(data: ResultData): void {
    this.data0 = data;
    this.keys = keyState(data.held ?? []);
    this.seconds = 0;
    this.leaving = false;
    const art = new Art(this, data.art);
    const rd = data.rd.raceDay;
    const screen: ResultScreen = resultScreen(data.result, rd, data.playerId);
    // The chart page (spec 4.6): flat Parchment, your row on the band, Ink rules where the box edges were.
    this.cameras.main.setBackgroundColor(rgbOf(data.art.colors, screen.paper));
    const page = new PagePainter(this, art, 0);
    page.rects([...screen.band, ...screen.rules]);
    const g = this.add.graphics().setDepth(1);
    const cloths = rd.saddlecloths.value;
    for (const row of screen.rows) {
      const cloth = cloths[(row.post - 1) % cloths.length];
      const c = row.cloth;
      // DESIGN Program pages: a saddlecloth box on paper gets a 1 px Ink border.
      g.fillStyle(rgbOf(data.art.colors, 'Ink')).fillRect(c.x, c.y, c.size, c.size);
      g.fillStyle(rgbOf(data.art.colors, cloth.fill)).fillRect(c.x + 1, c.y + 1, c.size - 2, c.size - 2);
      art.glyph(c.numberX, c.numberY, String(row.post % 10), cloth.number).setDepth(2);
      if (row.marker) this.add.image(row.marker.x, row.marker.y, art.swap(SLOT_IDS.markerYours, PAPER_MARKER_SWAPS), '0').setOrigin(0, 0).setDepth(2);
      for (const t of row.texts) art.text(t.x, t.y, t.text, t.color).setDepth(2);
    }
    for (const t of screen.texts) art.text(t.x, t.y, t.text, t.color, t.small ? SLOT_IDS.fontSmall : SLOT_IDS.fontMain).setDepth(2);
    this.cursor = this.add.image(screen.cursor.x, screen.cursor.y, art.swap(SLOT_IDS.cursor, PAPER_CURSOR_SWAPS), '0').setOrigin(0, 0).setDepth(2);
    this.bindKeys();
  }

  update(_time: number, delta: number): void {
    if (!this.data0) return;
    this.seconds += Math.min(Math.max(0, delta), this.data0.rd.raceDay.playback.maxFrameMs.value) / 1000;
    const frames = this.data0.art.slots.find((s) => s.id === SLOT_IDS.cursor)?.frames ?? 1;
    this.cursor.setFrame(String(frames > 1 ? cursorFrame(this.seconds, this.data0.rd.raceDay.ambient.cursorSwapsPerSecond.value) : 0));
  }

  private bindKeys(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    kb.addCapture('SPACE,ENTER,UP,DOWN,ESC');
    const onDown = (e: KeyboardEvent) => {
      const r = keyDown(this.keys, e.code, e.repeat);
      this.keys = r.state;
      if (r.act && RESULT_CONFIRM_KEYS.includes(e.code)) this.next();
    };
    const onUp = (e: KeyboardEvent) => { this.keys = keyUp(this.keys, e.code); };
    const onBlur = () => { this.keys = keyState(); };
    kb.on('keydown', onDown);
    kb.on('keyup', onUp);
    this.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    this.events.once('shutdown', () => {
      kb.off('keydown', onDown);
      kb.off('keyup', onUp);
      this.game.events.off(Phaser.Core.Events.BLUR, onBlur);
    });
  }

  /** Next race: back to the card with your horse focused. The session is already on the next race. */
  private next(): void {
    if (this.leaving) return;
    this.leaving = true;
    const { game, rd, art, session } = this.data0;
    const data: CardData = { game, rd, art, session, held: heldKeys(this.keys) };
    this.scene.start('card', data);
  }
}
