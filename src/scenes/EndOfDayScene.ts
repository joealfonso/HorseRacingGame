import Phaser from 'phaser';
import type { DayState } from '../bet/day';
import { daySummary } from '../bet/day';
import { rgbOf } from '../render/colors';
import { END_CONFIRM_KEYS, endOfDayPointerTargets, endOfDayScreen, type EndOfDayScreen } from '../render/endOfDayScreen';
import { PAPER_CURSOR_SWAPS } from '../render/page';
import { cursorFrame } from '../render/pause';
import { SLOT_IDS } from '../render/slotStatus';
import { Art, type ArtInfo } from './art';
import { announce } from './ariaLive';
import { betErrorLines, nextDay, type BetDay } from './betDay';
import type { HubData } from './HubScene';
import { MenuKeys } from './menuKeys';
import { PagePainter } from './paper';
import { PointerInput } from './pointerInput';

// The End of day page (docs/specs/betting-screens.md section 6): the back page of the
// program, opened by the result after the day's last race (or a day cut short). One action,
// New day, which starts the next day seed with the starting bankroll at that day's track
// (book-and-window.md 24.1). Everything drawn comes from src/render/endOfDayScreen.ts
// and every figure from daySummary in src/bet/day.ts. It reads the day and never changes it,
// and writes nothing to storage (SAFE3).

export interface EndOfDayData {
  bet: BetDay;
  /** The ended day. */
  day: DayState;
  art: ArtInfo;
  /** Keys still down from the result, ignored until released (IN2). */
  held?: string[];
}

export class EndOfDayScene extends Phaser.Scene {
  private data0!: EndOfDayData;
  private art!: Art;
  private keys!: MenuKeys;
  private cursor!: Phaser.GameObjects.Image;
  private seconds = 0;
  private leaving = false;

  constructor() {
    super('endOfDay');
  }

  create(data: EndOfDayData): void {
    this.data0 = data;
    this.seconds = 0;
    this.leaving = false;
    const art = new Art(this, data.art);
    this.art = art;
    let screen: EndOfDayScreen;
    try {
      screen = endOfDayScreen({
        rd: data.bet.rd.raceDay,
        book: data.bet.book,
        trackName: data.bet.ctx.races[0].track,
        summary: daySummary(data.bet.ctx, data.day),
        records: data.day.records,
      });
    } catch (err) {
      this.leaving = true;
      console.error(err);
      this.scene.start('error', { lines: betErrorLines(data.day.daySeed, data.day.nextRace, err), art: data.art });
      return;
    }
    this.cameras.main.setBackgroundColor(rgbOf(data.art.colors, screen.paper));
    const page = new PagePainter(this, art, 1);
    page.rects(screen.rects);
    page.texts(screen.texts);
    this.cursor = this.add.image(screen.cursor.x, screen.cursor.y, art.swap(SLOT_IDS.cursor, PAPER_CURSOR_SWAPS), '0').setOrigin(0, 0).setDepth(5);
    announce(screen.aria);

    const rd = data.bet.rd.raceDay;
    this.keys = new MenuKeys(this, data.held ?? [], { delaySeconds: rd.menus.repeatDelayMs.value / 1000, everySeconds: rd.menus.repeatEveryMs.value / 1000 }, (code) => {
      if (END_CONFIRM_KEYS.includes(code)) this.newDay();
    });
    // The mouse (track-hub.md section 6): a click on "New day" is Enter.
    new PointerInput(this, () => endOfDayPointerTargets(rd), { click: () => this.newDay() }, rd.pointer.arrivalGuardSeconds.value);
  }

  update(_time: number, delta: number): void {
    if (!this.data0 || this.leaving) return;
    const rd = this.data0.bet.rd.raceDay;
    const dt = Math.min(Math.max(0, delta), rd.playback.maxFrameMs.value) / 1000;
    this.seconds += dt;
    this.keys.update(dt);
    const frames = this.art.frames(SLOT_IDS.cursor);
    this.cursor.setFrame(String(frames > 1 ? cursorFrame(this.seconds, rd.ambient.cursorSwapsPerSecond.value) : 0));
  }

  /** New day: the next day seed, the starting bankroll, at that day's track on Read (book-and-window.md 24.1). */
  private newDay(): void {
    if (this.leaving) return;
    this.leaving = true;
    const d = this.data0;
    const data: HubData = { ...nextDay(d.bet, d.day), art: d.art, held: this.keys.down() };
    this.scene.start('hub', data);
  }
}
