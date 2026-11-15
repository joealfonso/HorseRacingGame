import Phaser from 'phaser';
import type { DayState, DrawnRace, RaceProgram } from '../bet/day';
import { rgbOf } from '../render/colors';
import { HUB_SLOTS, HUB_SLOT_IDS, hubBackdrop, hubFills, hubSprites, type HubImage } from '../render/hubPicture';
import {
  arriveHub, hubClick, hubFocusMarks, hubHover, hubKey, hubPointerTargets, hubPricesPosted, hubScreen, idleAfterLook, idleClock,
  type HubArrival, type HubKeyContext, type HubOutcome, type HubScreen, type HubState, type IdleClock,
} from '../render/hubScreen';
import { PLACEHOLDER_TAG_AT, SLOT_IDS, showPlaceholderTag, standIns } from '../render/slotStatus';
import { Art, type ArtInfo } from './art';
import { announce } from './ariaLive';
import { betErrorLines, betRaceData, passDay, programIfReady, requestNextEstimates, type BetDay } from './betDay';
import type { BookData } from './BookScene';
import type { EndOfDayData } from './EndOfDayScene';
import { MenuKeys } from './menuKeys';
import { PagePainter } from './paper';
import { PointerInput } from './pointerInput';
import type { WindowData } from './WindowScene';

// The track between races (docs/specs/track-hub.md, DESIGN "The track (between races)", as
// amended by docs/specs/book-and-window.md): one still picture with two doors and five things
// to look at, and a box with three rows (Read, Bet, Watch). Everything drawn comes from
// src/render/hubScreen.ts and src/render/hubPicture.ts, every price from src/bet; this file
// places it, keeps the clock (the bob, the crowd, the flag, the idles), forwards keys and
// clicks, and acts on the outcome: the book, the window, the post with no bet, or a look.

export interface HubData {
  bet: BetDay;
  /** The day before the next race goes to the post. */
  day: DayState;
  art: ArtInfo;
  /** Keys still down from the screen before, ignored until released (IN2). */
  held?: string[];
  /** Where focus lands: Read on arrival (the default), Bet back from the book or the window (FL1, FL2). */
  focus?: HubArrival;
}

const DEPTH = { fills: 0, picture: 1, sprites: 2, box: 9, ui: 10, cursor: 12, corners: 13, tag: 20 } as const;

export class HubScene extends Phaser.Scene {
  private data0!: HubData;
  private drawn!: DrawnRace;
  private day!: DayState;
  private program: RaceProgram | null = null;
  private state!: HubState;
  private idle: IdleClock = idleClock(0);
  private keys!: MenuKeys;
  private art!: Art;
  private page!: PagePainter;
  private sprites: Phaser.GameObjects.Image[] = [];
  private cursor!: Phaser.GameObjects.Image;
  private corners: Phaser.GameObjects.Image[] = [];
  /** The last sprite frames set, so a frame only changes an image when its frame does. */
  private spriteFrames: number[] = [];
  private seconds = 0;
  private reducedMotion = false;
  private leaving = false;

  constructor() {
    super('hub');
  }

  create(data: HubData): void {
    this.data0 = data;
    this.seconds = 0;
    this.leaving = false;
    this.sprites = [];
    this.spriteFrames = [];
    this.corners = [];
    this.idle = idleClock(0);
    this.art = new Art(this, data.art);
    // Never shown after the last race or broke (TH9): a day that has ended goes to the End of day page.
    if (data.day.ended !== null) {
      this.leaving = true;
      this.scene.start('endOfDay', { bet: data.bet, day: data.day, art: data.art, held: data.held } satisfies EndOfDayData);
      return;
    }
    this.day = data.day;
    this.drawn = data.bet.drawn[data.day.nextRace - 1];
    // FL1, FL2: focus arrives on Read, or on Bet back from the book or the window; the day's looks carry over.
    this.state = arriveHub(data.bet.hub, data.bet.looks, data.focus ?? 'arrival');
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    // This race's estimate first, then the next race's (UI5).
    requestNextEstimates(data.bet, data.day);
    this.program = this.tryProgram();
    if (this.leaving) return;

    this.cameras.main.setBackgroundColor(rgbOf(data.art.colors, 'Ink'));
    const sc = this.screen();
    const fills = this.add.graphics().setDepth(DEPTH.fills);
    for (const r of hubFills(sc.sky)) fills.fillStyle(rgbOf(data.art.colors, r.color)).fillRect(r.x, r.y, r.w, r.h);
    for (const op of hubBackdrop()) this.image(op, DEPTH.picture);
    for (const op of this.spriteOps()) {
      this.sprites.push(this.image(op, DEPTH.sprites));
      this.spriteFrames.push(op.frame);
    }
    const frame = data.bet.hub.box.value.frame;
    this.art.box(frame.x, frame.y, frame.tilesW, frame.tilesH, DEPTH.box);
    this.page = new PagePainter(this, this.art, DEPTH.ui);
    this.cursor = this.add.image(0, 0, SLOT_IDS.cursor, '0').setOrigin(0, 0).setDepth(DEPTH.cursor);
    for (let i = 0; i < 4; i++) this.corners.push(this.add.image(0, 0, HUB_SLOTS.corner, '0').setOrigin(0, 0).setDepth(DEPTH.corners));
    const drawnSlots = standIns(data.art.slots, data.art.states, HUB_SLOT_IDS);
    this.add.image(PLACEHOLDER_TAG_AT.x, PLACEHOLDER_TAG_AT.y, SLOT_IDS.placeholderTag, '0').setOrigin(0, 0).setDepth(DEPTH.tag)
      .setVisible(showPlaceholderTag(drawnSlots));
    if (drawnSlots.length > 0) console.warn(`Placeholder art on the track (${drawnSlots.length} slots):\n${drawnSlots.map((d) => `  ${d.id}: ${d.reason}`).join('\n')}`);
    this.redraw();

    const m = data.bet.rd.raceDay.menus;
    this.keys = new MenuKeys(this, data.held ?? [], { delaySeconds: m.repeatDelayMs.value / 1000, everySeconds: m.repeatEveryMs.value / 1000 }, (code) => {
      if (!this.leaving) this.apply(hubKey(data.bet.hub, this.state, code, this.keyContext()));
    });
    new PointerInput(this, () => hubPointerTargets(data.bet.hub), {
      hover: (id) => { if (!this.leaving) this.setState(hubHover(this.state, id)); },
      click: (id) => { if (!this.leaving) this.apply(hubClick(data.bet.hub, this.state, id, this.keyContext())); },
    }, data.bet.rd.raceDay.pointer.arrivalGuardSeconds.value);
  }

  update(_time: number, delta: number): void {
    if (!this.data0 || this.leaving) return;
    const rd = this.data0.bet.rd.raceDay;
    const dt = Math.min(Math.max(0, delta), rd.playback.maxFrameMs.value) / 1000;
    this.seconds += dt;
    if (this.program === null) {
      const problem = this.data0.bet.estimates.failure(this.drawn);
      if (problem !== null) return this.fail(new Error(`the odds could not be worked out: ${problem}`));
      this.program = this.tryProgram();
      // The prices post in one frame; a rail choice waiting on them goes to the post now (TH7).
      if (this.program !== null) {
        this.redraw();
        this.apply(hubPricesPosted(this.state));
        if (this.leaving) return;
      }
    }
    this.keys.update(dt);
    // Only the clock-driven parts each frame: the crowd, the flag, the idle, the bob (UI6).
    this.spriteOps().forEach((op, i) => {
      if (this.spriteFrames[i] === op.frame) return;
      this.spriteFrames[i] = op.frame;
      this.sprites[i]?.setFrame(String(op.frame));
    });
    this.place(hubFocusMarks(this.focusInput()));
  }

  private keyContext(): HubKeyContext {
    return { fieldSize: this.drawn.horseIds.length, ready: this.program !== null };
  }

  private focusInput() {
    const d = this.data0;
    return {
      hub: d.bet.hub, rd: d.bet.rd.raceDay, state: this.state,
      seconds: this.seconds, reducedMotion: this.reducedMotion, cursorFrames: this.art.frames(SLOT_IDS.cursor),
    };
  }

  private screen(): HubScreen {
    const d = this.data0;
    return hubScreen({ ...this.focusInput(), ctx: d.bet.ctx, day: this.day, drawn: this.drawn, program: this.program });
  }

  private spriteOps(): HubImage[] {
    return hubSprites(this.data0.bet.hub, this.data0.bet.rd.raceDay, this.idle, this.seconds, this.reducedMotion);
  }

  private image(op: HubImage, depth: number): Phaser.GameObjects.Image {
    const key = op.swaps ? this.art.swap(op.slot, op.swaps) : op.slot;
    const img = this.add.image(op.x, op.y, key, String(op.frame)).setOrigin(0, 0).setDepth(depth).setFlipX(op.flipX === true);
    if (op.crop) img.setCrop(0, 0, op.crop.w, op.crop.h);
    return img;
  }

  /** The text and bars, redrawn whole when the state or the prices change. */
  private redraw(): void {
    const sc = this.screen();
    const p = this.page;
    p.clear();
    p.rects(sc.bar);
    p.texts([...sc.status, ...sc.voice, ...sc.doors, sc.sign, sc.board.header, ...sc.board.posts.flatMap((b) => [b.digit, b.price])]);
    this.cursor.setPosition(sc.cursor.x, sc.cursor.y);
    this.place(sc);
    announce(sc.aria);
  }

  /** The horseshoe's frame and the four corners, on the same frame so the two read as one focus. */
  private place(m: { cursorFrame: number; corners: HubScreen['corners'] }): void {
    this.cursor.setFrame(String(m.cursorFrame));
    // With Read focused there are no corners (TB1): the four images hide.
    this.corners.forEach((img, i) => {
      const c = m.corners[i];
      img.setVisible(c !== undefined);
      if (c) img.setPosition(c.x, c.y).setFrame(c.frame === 'top' ? '0' : '1').setFlipX(c.flipX);
    });
  }

  private setState(next: HubState): void {
    if (next === this.state) return;
    this.state = next;
    this.redraw();
  }

  /** A key's or a click's result: the same handling for both (TH12). */
  private apply(r: { state: HubState; outcome: HubOutcome }): void {
    this.setState(r.state);
    const o = r.outcome;
    if (o === null) return;
    if (o.kind === 'look') {
      this.idle = idleAfterLook(this.data0.bet.hub, this.idle, this.seconds, o.id);
      return;
    }
    const bet: BetDay = { ...this.data0.bet, looks: this.state.looks };
    const held = this.keys.down();
    if (o.kind === 'book') return this.leave(() => this.scene.start('book', { bet, day: this.day, art: this.data0.art, held, from: 'track' } satisfies BookData));
    if (o.kind === 'window') return this.leave(() => this.scene.start('window', { bet, day: this.day, art: this.data0.art, held, post: o.post } satisfies WindowData));
    // The rail: no bet, with prices posted (a waiting rail comes here when they post).
    let day: DayState;
    try {
      day = passDay(bet, this.day, this.drawn);
    } catch (err) {
      return this.fail(err);
    }
    this.leave(() => this.scene.start('race', betRaceData(bet, day, this.drawn, this.data0.art, this.keys.down())));
  }

  private leave(go: () => void): void {
    if (this.leaving) return;
    this.leaving = true;
    go();
  }

  private tryProgram(): RaceProgram | null {
    try {
      return programIfReady(this.data0.bet, this.drawn);
    } catch (err) {
      this.fail(err);
      return null;
    }
  }

  private fail(err: unknown): void {
    if (this.leaving) return;
    this.leaving = true;
    console.error(err);
    this.scene.start('error', { lines: betErrorLines(this.data0.day.daySeed, this.data0.day.nextRace, err), art: this.data0.art });
  }
}
