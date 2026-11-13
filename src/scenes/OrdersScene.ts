import Phaser from 'phaser';
import type { RaceDayData } from '../data/raceDayLoad';
import type { GameData } from '../data/schema';
import { rgbOf } from '../render/colors';
import { initialOrdersState, ordersKey, ordersScreen, ordersSlotIds, trainerFrame, type OrdersScreen, type OrdersState } from '../render/ordersScreen';
import { PAPER_CURSOR_SWAPS } from '../render/page';
import { cursorFrame } from '../render/pause';
import { goToPost, keepOrders, type Session } from '../render/session';
import { PLACEHOLDER_TAG_AT, SLOT_IDS, showPlaceholderTag, standIns } from '../render/slotStatus';
import { Art, type ArtInfo } from './art';
import type { CardData } from './CardScene';
import { MenuKeys } from './menuKeys';
import { PagePainter } from './paper';
import type { RaceData } from './RaceScene';

// Orders, the paddock (spec 4.2): your horse, its three orders, Go to the post and Back to
// card, the paddock strip with the trainer on the coffee idle beside your horse standing
// with the jockey up, and the trainer's line for the focused item. The top, y0-143, is a
// program page (your entry under the highlighter band); the paddock and the dialog are the
// world. Every word and position comes from src/render/ordersScreen.ts; this file places
// them and forwards the keys.

export interface OrdersData {
  game: GameData; rd: RaceDayData; art: ArtInfo; session: Session;
  /** Your horse, by post. */
  post: number;
  /** Keys still down from the screen before, ignored until released (IN2). */
  held?: string[];
}

const HORSE_LAYERS = ['body', 'tack', 'jacket', 'cap'] as const;

export class OrdersScene extends Phaser.Scene {
  private data0!: OrdersData;
  private state!: OrdersState;
  private keys!: MenuKeys;
  private art!: Art;
  private seconds = 0;
  private leaving = false;
  private cursor!: Phaser.GameObjects.Image;
  private trainer!: Phaser.GameObjects.Image;
  /** The screen's changing text (orders box and dialog), rebuilt when the state changes. */
  private texts: Phaser.GameObjects.BitmapText[] = [];

  constructor() {
    super('orders');
  }

  create(data: OrdersData): void {
    this.data0 = data;
    this.seconds = 0;
    this.leaving = false;
    this.texts = [];
    this.state = initialOrdersState(data.session, data.game.card, data.post);
    this.art = new Art(this, data.art);
    const art = this.art;
    const rd = data.rd.raceDay;
    const screen = this.screen();
    this.cameras.main.setBackgroundColor(rgbOf(data.art.colors, 'Ink'));

    for (const b of screen.boxes) art.box(b.x, b.y, b.tilesW, b.tilesH, 0);
    // The paper: Parchment, the band, your entry, the rule and the Ink edge at y143.
    const page = new PagePainter(this, art, 0);
    page.rects([screen.paper, ...screen.band, ...screen.rules]);
    page.entry(screen.entry);

    // Ground and rail first; the trainer and your horse stand over them.
    for (const t of screen.tiles) this.add.image(t.x, t.y, t.slot, '0').setOrigin(0, 0).setFlipX(t.flip).setDepth(0);
    this.trainer = this.add.image(screen.trainer.x, screen.trainer.y, SLOT_IDS.paddockTrainer, '0').setOrigin(0, 0).setDepth(3);
    this.buildHorse(screen);
    this.cursor = this.add.image(screen.cursor.x, screen.cursor.y, art.swap(SLOT_IDS.cursor, PAPER_CURSOR_SWAPS), '0').setOrigin(0, 0).setDepth(2);
    this.drawTexts(screen);

    const drawn = standIns(data.art.slots, data.art.states, ordersSlotIds(rd));
    this.add.image(PLACEHOLDER_TAG_AT.x, PLACEHOLDER_TAG_AT.y, SLOT_IDS.placeholderTag, '0').setOrigin(0, 0).setDepth(10)
      .setVisible(showPlaceholderTag(drawn));

    const m = rd.menus;
    this.keys = new MenuKeys(this, data.held ?? [], { delaySeconds: m.repeatDelayMs.value / 1000, everySeconds: m.repeatEveryMs.value / 1000 }, (code) => this.act(code));
  }

  update(_time: number, delta: number): void {
    if (!this.data0 || this.leaving) return;
    const rd = this.data0.rd.raceDay;
    const dt = Math.min(Math.max(0, delta), rd.playback.maxFrameMs.value) / 1000;
    this.seconds += dt;
    this.keys.update(dt);
    if (this.leaving) return;
    const cursorFrames = this.art.frames(SLOT_IDS.cursor);
    this.cursor.setFrame(String(cursorFrames > 1 ? cursorFrame(this.seconds, rd.ambient.cursorSwapsPerSecond.value) : 0));
    const trainerFrames = this.art.frames(SLOT_IDS.paddockTrainer);
    const f = trainerFrame(this.seconds, rd.paddock.cupDownSeconds.value, rd.paddock.cupUpSeconds.value);
    this.trainer.setFrame(String(trainerFrames > 1 ? f : 0));
  }

  private screen(): OrdersScreen {
    return ordersScreen(this.data0.game, this.data0.rd.raceDay, this.state, this.data0.rd.cardLook);
  }

  /** Your horse on its stand frame with the jockey up, in its coat, saddlecloth and silks. */
  private buildHorse(screen: OrdersScreen): void {
    const d = this.data0;
    const h = d.game.card.horses.find((x) => x.post === this.state.post) ?? d.game.card.horses[0];
    const look = d.rd.cardLook[h.id];
    const coat = d.rd.raceDay.coats[look.coat];
    const cloths = d.rd.raceDay.saddlecloths.value;
    const cloth = cloths[(h.post - 1) % cloths.length];
    const tones: Record<(typeof HORSE_LAYERS)[number], [string, string]> = {
      body: [coat.base, coat.second],
      tack: [cloth.fill, cloth.number],
      jacket: [look.silks.body, look.silks.body],
      cap: [look.silks.cap, look.silks.cap],
    };
    const { x, y } = screen.horse;
    HORSE_LAYERS.forEach((layer, i) => {
      const id = SLOT_IDS.horse[layer].stand;
      this.add.image(x, y, this.art.recolor(id, tones[layer][0], tones[layer][1]), '0').setOrigin(0, 0).setDepth(4 + i);
    });
    const at = this.art.slot(SLOT_IDS.horse.tack.stand).numberAt?.[0] ?? [10, 10];
    this.art.glyph(x + at[0], y + at[1], String(h.post % 10), cloth.number).setDepth(4 + HORSE_LAYERS.length);
  }

  private drawTexts(screen: OrdersScreen): void {
    for (const t of this.texts) t.destroy();
    this.texts = screen.texts.map((t) => this.art.text(t.x, t.y, t.text, t.color, t.small ? SLOT_IDS.fontSmall : SLOT_IDS.fontMain).setDepth(3));
    this.cursor.setPosition(screen.cursor.x, screen.cursor.y);
  }

  private act(code: string): void {
    if (this.leaving) return;
    const r = ordersKey(this.state, code);
    this.state = r.state;
    if (r.outcome?.kind === 'go') return this.goToPost();
    if (r.outcome?.kind === 'back') return this.backToCard();
    this.drawTexts(this.screen());
  }

  /** Go to the post: the seed is spent here (LP1), and the race runs this horse on these orders. */
  private goToPost(): void {
    this.leaving = true;
    const { game, rd, art } = this.data0;
    const { ticket, session } = goToPost(this.data0.session, this.state.post, this.state.orders);
    const data: RaceData = { game, rd, art, session, ticket, held: this.keys.down() };
    this.scene.start('race', data);
  }

  /** Back to card, or Esc: the changes are kept for this horse. */
  private backToCard(): void {
    this.leaving = true;
    const { game, rd, art } = this.data0;
    const data: CardData = { game, rd, art, session: keepOrders(this.data0.session, this.state.post, this.state.orders), held: this.keys.down() };
    this.scene.start('card', data);
  }
}
