import Phaser from 'phaser';
import type { RaceDayData } from '../data/raceDayLoad';
import type { GameData } from '../data/schema';
import { rgbOf } from '../render/colors';
import { CARD_SLOT_IDS, cardKey, cardScreen, initialCardState, type CardScreen, type CardState } from '../render/cardScreen';
import { cursorFrame } from '../render/pause';
import { pickHorse, type Session } from '../render/session';
import { PLACEHOLDER_TAG_AT, SLOT_IDS, showPlaceholderTag, standIns } from '../render/slotStatus';
import { Art, type ArtInfo } from './art';
import { MenuKeys } from './menuKeys';
import type { OrdersData } from './OrdersScene';

// The card (spec 4.1): the conditions, the eight horses by post, the focused horse's
// detail, and the pick. The first screen after boot and the one every race returns to.
// Every word and position comes from src/render/cardScreen.ts; this file places them and
// forwards the keys. It reads the session and hands a new one on; it never keeps one.

export interface CardData {
  game: GameData; rd: RaceDayData; art: ArtInfo; session: Session;
  /** Keys still down from the screen before, ignored until released (IN2). */
  held?: string[];
}

export class CardScene extends Phaser.Scene {
  private data0!: CardData;
  private state: CardState = { focus: 0 };
  private keys!: MenuKeys;
  private seconds = 0;
  private leaving = false;
  private cursor!: Phaser.GameObjects.Image;
  private detail: Phaser.GameObjects.BitmapText[] = [];

  constructor() {
    super('card');
  }

  create(data: CardData): void {
    this.data0 = data;
    this.seconds = 0;
    this.leaving = false;
    this.detail = [];
    this.state = initialCardState(data.game.card, data.session);
    const art = new Art(this, data.art);
    const rd = data.rd.raceDay;
    const colors = data.art.colors;
    const screen = this.screen();
    this.cameras.main.setBackgroundColor(rgbOf(colors, 'Ink'));

    for (const b of screen.boxes) art.box(b.x, b.y, b.tilesW, b.tilesH, 0);
    for (const t of screen.header) art.text(t.x, t.y, t.text, t.color).setDepth(2);
    const g = this.add.graphics().setDepth(1);
    const cloths = rd.saddlecloths.value;
    for (const row of screen.rows) {
      const cloth = cloths[(row.post - 1) % cloths.length];
      const c = row.cloth;
      // DESIGN: a saddlecloth box on Navy gets a 1 px Ash border.
      g.fillStyle(rgbOf(colors, 'Ash')).fillRect(c.x, c.y, c.size, c.size);
      g.fillStyle(rgbOf(colors, cloth.fill)).fillRect(c.x + 1, c.y + 1, c.size - 2, c.size - 2);
      art.glyph(c.numberX, c.numberY, String(row.post % 10), cloth.number).setDepth(2);
      for (const t of row.texts) art.text(t.x, t.y, t.text, t.color).setDepth(2);
    }
    this.detail = screen.detail.map((t) => art.text(t.x, t.y, t.text, t.color).setDepth(2));
    this.cursor = this.add.image(screen.cursor.x, screen.cursor.y, SLOT_IDS.cursor, '0').setOrigin(0, 0).setDepth(2);

    const drawn = standIns(data.art.slots, data.art.states, CARD_SLOT_IDS);
    this.add.image(PLACEHOLDER_TAG_AT.x, PLACEHOLDER_TAG_AT.y, SLOT_IDS.placeholderTag, '0').setOrigin(0, 0).setDepth(10)
      .setVisible(showPlaceholderTag(drawn));

    const m = rd.menus;
    this.keys = new MenuKeys(this, data.held ?? [], { delaySeconds: m.repeatDelayMs.value / 1000, everySeconds: m.repeatEveryMs.value / 1000 }, (code) => this.act(code));
  }

  update(_time: number, delta: number): void {
    if (!this.data0 || this.leaving) return;
    const dt = Math.min(Math.max(0, delta), this.data0.rd.raceDay.playback.maxFrameMs.value) / 1000;
    this.seconds += dt;
    this.keys.update(dt);
    const frames = this.data0.art.slots.find((s) => s.id === SLOT_IDS.cursor)?.frames ?? 1;
    this.cursor.setFrame(String(frames > 1 ? cursorFrame(this.seconds, this.data0.rd.raceDay.ambient.cursorSwapsPerSecond.value) : 0));
  }

  private screen(): CardScreen {
    const d = this.data0;
    return cardScreen(d.game, d.rd.raceDay, d.rd.cardLook, d.session, this.state);
  }

  private act(code: string): void {
    if (this.leaving) return;
    const r = cardKey(this.state, code, this.data0.game.card);
    if (r.outcome) {
      this.toOrders(r.outcome.post);
      return;
    }
    if (r.state.focus === this.state.focus) return;
    this.state = r.state;
    const screen = this.screen();
    this.cursor.setPosition(screen.cursor.x, screen.cursor.y);
    screen.detail.forEach((t, i) => { if (this.detail[i].text !== t.text) this.detail[i].setText(t.text); });
  }

  private toOrders(post: number): void {
    this.leaving = true;
    const { game, rd, art } = this.data0;
    const data: OrdersData = { game, rd, art, session: pickHorse(this.data0.session, post), post, held: this.keys.down() };
    this.scene.start('orders', data);
  }
}
