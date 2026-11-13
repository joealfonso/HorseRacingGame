import Phaser from 'phaser';
import type { RaceDayData } from '../data/raceDayLoad';
import type { GameData } from '../data/schema';
import { rgbOf } from '../render/colors';
import { CARD_SLOT_IDS, cardKey, cardScreen, initialCardState, swipeFrame, type CardState, type CardSwipe } from '../render/cardScreen';
import { PAPER_CURSOR_SWAPS } from '../render/page';
import { cursorFrame } from '../render/pause';
import { pickHorse, type Session } from '../render/session';
import { PLACEHOLDER_TAG_AT, SLOT_IDS, showPlaceholderTag, standIns } from '../render/slotStatus';
import { Art, type ArtInfo } from './art';
import { MenuKeys } from './menuKeys';
import type { OrdersData } from './OrdersScene';
import { PagePainter } from './paper';

// The card as a page of the race program (spec 4.1): the conditions, every horse's entry
// with its stats to compare, the footer for the focused horse, last race's pick under the
// highlighter band, and the pick's 2-frame swipe before the cut to Orders. The first screen
// after boot and the one every race returns to. Everything drawn comes from
// src/render/cardScreen.ts; this file places it and forwards the keys.

export interface CardData {
  game: GameData; rd: RaceDayData; art: ArtInfo; session: Session;
  /** Keys still down from the screen before, ignored until released (IN2). */
  held?: string[];
}

export class CardScene extends Phaser.Scene {
  private data0!: CardData;
  private state: CardState = { focus: 0 };
  private keys!: MenuKeys;
  private art!: Art;
  private page!: PagePainter;
  private seconds = 0;
  private leaving = false;
  /** The swipe playing after a pick, and how long it has run. */
  private swipe: { post: number; seconds: number; frame: CardSwipe['frame'] } | null = null;
  private cursor!: Phaser.GameObjects.Image;

  constructor() {
    super('card');
  }

  create(data: CardData): void {
    this.data0 = data;
    this.seconds = 0;
    this.leaving = false;
    this.swipe = null;
    this.state = initialCardState(data.game.card, data.session);
    this.art = new Art(this, data.art);
    this.cameras.main.setBackgroundColor(rgbOf(data.art.colors, 'Parchment'));
    this.page = new PagePainter(this, this.art, 1);
    this.cursor = this.add.image(0, 0, this.art.swap(SLOT_IDS.cursor, PAPER_CURSOR_SWAPS), '0').setOrigin(0, 0).setDepth(5);
    this.redraw();

    const drawn = standIns(data.art.slots, data.art.states, CARD_SLOT_IDS);
    this.add.image(PLACEHOLDER_TAG_AT.x, PLACEHOLDER_TAG_AT.y, SLOT_IDS.placeholderTag, '0').setOrigin(0, 0).setDepth(10)
      .setVisible(showPlaceholderTag(drawn));

    const m = data.rd.raceDay.menus;
    this.keys = new MenuKeys(this, data.held ?? [], { delaySeconds: m.repeatDelayMs.value / 1000, everySeconds: m.repeatEveryMs.value / 1000 }, (code) => this.act(code));
  }

  update(_time: number, delta: number): void {
    if (!this.data0) return;
    const rd = this.data0.rd.raceDay;
    const dt = Math.min(Math.max(0, delta), rd.playback.maxFrameMs.value) / 1000;
    this.seconds += dt;
    if (this.swipe) {
      this.swipe.seconds += dt;
      const frame = swipeFrame(this.swipe.seconds, rd);
      if (frame === null) {
        this.toOrders(this.swipe.post);
        return;
      }
      if (frame !== this.swipe.frame) {
        this.swipe.frame = frame;
        this.redraw();
      }
    } else if (!this.leaving) {
      this.keys.update(dt);
    }
    const frames = this.art.frames(SLOT_IDS.cursor);
    this.cursor.setFrame(String(frames > 1 ? cursorFrame(this.seconds, rd.ambient.cursorSwapsPerSecond.value) : 0));
  }

  /** The whole page from the pure function, for the current focus and swipe. */
  private redraw(): void {
    const d = this.data0;
    const swipe = this.swipe ? { post: this.swipe.post, frame: this.swipe.frame } : null;
    const s = cardScreen(d.game, d.rd.raceDay, d.rd.cardLook, d.session, this.state, swipe);
    const p = this.page;
    p.clear();
    p.rects([...s.band, ...s.rules]);
    p.texts([...s.header, ...s.heads, ...s.detail]);
    for (const e of s.rows) p.entry(e);
    this.cursor.setPosition(s.cursor.x, s.cursor.y);
  }

  private act(code: string): void {
    if (this.leaving || this.swipe) return;
    const r = cardKey(this.state, code, this.data0.game.card);
    if (r.outcome) {
      // CD6: the band moves to the pick in a 2-frame swipe, then the page cuts to Orders.
      this.swipe = { post: r.outcome.post, seconds: 0, frame: 1 };
      this.redraw();
      return;
    }
    if (r.state.focus === this.state.focus) return;
    this.state = r.state;
    this.redraw();
  }

  private toOrders(post: number): void {
    if (this.leaving) return;
    this.leaving = true;
    const { game, rd, art } = this.data0;
    const data: OrdersData = { game, rd, art, session: pickHorse(this.data0.session, post), post, held: this.keys.down() };
    this.scene.start('orders', data);
  }
}
