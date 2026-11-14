import Phaser from 'phaser';
import { goToPost, type DayState, type DrawnRace, type RaceProgram } from '../bet/day';
import type { Bet } from '../bet/market';
import { offeredAmounts } from '../bet/money';
import { rgbOf } from '../render/colors';
import { cursorFrame } from '../render/pause';
import { lastBetDollars, programHorses, type ProgramKeyContext } from '../render/programScreen';
import { PLACEHOLDER_TAG_AT, SLOT_IDS, showPlaceholderTag, standIns } from '../render/slotStatus';
import {
  WINDOW_SLOTS, WINDOW_SLOT_IDS, clerkFrame, initialWindowState, windowClick, windowFromBook, windowHover, windowKey, windowPointerTargets, windowScreen,
  type WindowOutcome, type WindowState,
} from '../render/windowScreen';
import { Art, type ArtInfo } from './art';
import { announce } from './ariaLive';
import { betErrorLines, betRaceData, nextDay, programIfReady, requestNextEstimates, type BetDay, type ClerkCounts } from './betDay';
import type { BookData } from './BookScene';
import type { HubData } from './HubScene';
import { MenuKeys } from './menuKeys';
import { PagePainter } from './paper';
import { PointerInput } from './pointerInput';

// The window (docs/specs/book-and-window.md section 7): the one place a bet is placed. The
// booth close-up with the clerk above, the Navy box with the field below, the approved ticket
// and, on Enter, the bet beat with the printed tote ticket, then the race. Everything drawn
// comes from src/render/windowScreen.ts, every price from src/bet; this file places it,
// keeps the clock (the cursor bob, the clerk's idle, the beat) and acts on the outcome.

export interface WindowData {
  bet: BetDay;
  day: DayState;
  art: ArtInfo;
  /** Keys still down from the screen before, ignored until released (IN2). */
  held?: string[];
  /** The post focus starts on: 1 from Bet or the windows, k from digit k, or the horse carried from the book. */
  post?: number;
  /** From the book: the ticket opens on `post` at the remembered amount (BB4). */
  ticket?: boolean;
}

const DEPTH = { picture: 0, clerk: 1, box: 2, text: 3, marks: 6, tag: 20 } as const;

export class WindowScene extends Phaser.Scene {
  private data0!: WindowData;
  private drawn!: DrawnRace;
  private day!: DayState;
  private program: RaceProgram | null = null;
  private state: WindowState = initialWindowState();
  private clerk: ClerkCounts = { ticket: 0, punch: 0 };
  private keys!: MenuKeys;
  private art!: Art;
  private page!: PagePainter;
  private cursor!: Phaser.GameObjects.Image;
  private marker!: Phaser.GameObjects.Image;
  private clerkImage!: Phaser.GameObjects.Image;
  private seconds = 0;
  /** Seconds since the bet was placed, for the beat; null before. */
  private beatSeconds: number | null = null;
  private reducedMotion = false;
  private leaving = false;

  constructor() {
    super('window');
  }

  create(data: WindowData): void {
    this.data0 = data;
    this.seconds = 0;
    this.beatSeconds = null;
    this.leaving = false;
    this.art = new Art(this, data.art);
    if (data.day.ended !== null) {
      this.leaving = true;
      const next = nextDay(data.bet, data.day);
      this.scene.start('book', { ...next, art: data.art, held: data.held, from: 'dayStart' } satisfies BookData);
      return;
    }
    this.day = data.day;
    this.drawn = data.bet.drawn[data.day.nextRace - 1];
    this.clerk = { ...data.bet.clerk };
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    requestNextEstimates(data.bet, data.day);
    this.program = this.tryProgram();
    if (this.leaving) return;
    const post = Math.min(Math.max(1, data.post ?? 1), programHorses(this.drawn).length);
    this.state = data.ticket ? windowFromBook(post, this.keyContext()) : initialWindowState(post);
    if (this.state.mode.kind === 'ticket') this.clerk = { ...this.clerk, ticket: this.clerk.ticket + 1 };

    this.cameras.main.setBackgroundColor(rgbOf(data.art.colors, 'Ink'));
    const W = data.bet.hub.window.value;
    this.add.image(W.booth.x, W.booth.y, WINDOW_SLOTS.booth, '0').setOrigin(0, 0).setDepth(DEPTH.picture);
    this.clerkImage = this.add.image(W.clerk.x, W.clerk.y, WINDOW_SLOTS.clerk, '0').setOrigin(0, 0).setDepth(DEPTH.clerk);
    this.add.image(W.program.x, W.program.y, WINDOW_SLOTS.program, '0').setOrigin(0, 0).setDepth(DEPTH.clerk);
    this.art.box(W.frame.x, W.frame.y, W.frame.tilesW, W.frame.tilesH, DEPTH.box);
    this.page = new PagePainter(this, this.art, DEPTH.text);
    this.cursor = this.add.image(0, 0, SLOT_IDS.cursor, '0').setOrigin(0, 0).setDepth(DEPTH.marks);
    this.marker = this.add.image(0, 0, SLOT_IDS.markerYours, '0').setOrigin(0, 0).setDepth(DEPTH.marks);
    const drawnSlots = standIns(data.art.slots, data.art.states, WINDOW_SLOT_IDS);
    this.add.image(PLACEHOLDER_TAG_AT.x, PLACEHOLDER_TAG_AT.y, SLOT_IDS.placeholderTag, '0').setOrigin(0, 0).setDepth(DEPTH.tag)
      .setVisible(showPlaceholderTag(drawnSlots));
    if (drawnSlots.length > 0) console.warn(`Placeholder art at the window (${drawnSlots.length} slots):\n${drawnSlots.map((d) => `  ${d.id}: ${d.reason}`).join('\n')}`);
    this.redraw();

    const m = data.bet.rd.raceDay.menus;
    this.keys = new MenuKeys(this, data.held ?? [], { delaySeconds: m.repeatDelayMs.value / 1000, everySeconds: m.repeatEveryMs.value / 1000 }, (code) => {
      if (!this.leaving) this.apply(windowKey(this.state, code, this.keyContext()));
    });
    // Hover moves the cursor while choosing only: it never moves an open ticket's horse (23.2).
    new PointerInput(this, () => windowPointerTargets(data.bet.hub, data.bet.rd.raceDay, this.state, this.keyContext()), {
      hover: (id) => { if (!this.leaving) this.apply({ state: windowHover(this.state, id, this.keyContext()), outcome: null }); },
      click: (id) => { if (!this.leaving) this.apply(windowClick(this.state, id, this.keyContext())); },
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
      // The odds arrive whole: every price appears in the same frame.
      this.program = this.tryProgram();
      if (this.program !== null) this.redraw();
    }
    if (this.beatSeconds !== null) {
      this.beatSeconds += dt;
      this.clerkImage.setFrame(String(clerkFrame(this.data0.bet.hub, this.seconds, this.beatSeconds, this.reducedMotion)));
      if (this.beatSeconds >= rd.program.punchSeconds.value) this.toRace();
      return;
    }
    this.keys.update(dt);
    const frames = this.art.frames(SLOT_IDS.cursor);
    this.cursor.setFrame(String(frames > 1 && !this.reducedMotion ? cursorFrame(this.seconds, rd.ambient.cursorSwapsPerSecond.value) : 0));
    this.clerkImage.setFrame(String(clerkFrame(this.data0.bet.hub, this.seconds, null, this.reducedMotion)));
  }

  private keyContext(): ProgramKeyContext {
    return {
      horses: programHorses(this.drawn).length,
      ready: this.program !== null,
      offered: offeredAmounts(this.day.bankrollCents, this.data0.bet.ctx.rules),
      lastDollars: lastBetDollars(this.day),
    };
  }

  private redraw(): void {
    const d = this.data0;
    const s = windowScreen({ hub: d.bet.hub, rd: d.bet.rd.raceDay, ctx: d.bet.ctx, day: this.day, drawn: this.drawn, program: this.program, state: this.state, clerk: this.clerk });
    const p = this.page;
    p.clear();
    p.rects([...s.bar, s.line, ...s.rows.flatMap((r) => r.rects), ...s.slip]);
    p.texts([...s.status, s.sign, s.clerkLine, ...s.rows.flatMap((r) => r.texts), ...s.ticket]);
    this.cursor.setVisible(s.cursor !== null);
    if (s.cursor) this.cursor.setPosition(s.cursor.x, s.cursor.y);
    this.marker.setVisible(s.marker !== null);
    if (s.marker) this.marker.setPosition(s.marker.x, s.marker.y);
    announce(s.aria);
  }

  /** A key's or a click's result: the same handling for both (TH12). */
  private apply(r: { state: WindowState; outcome: WindowOutcome }): void {
    const o = r.outcome;
    if (o?.kind === 'back') return this.back();
    if (o?.kind === 'bet') return this.placeBet({ post: o.post, dollars: o.dollars });
    const before = this.state;
    if (r.state.focus === before.focus && JSON.stringify(r.state.mode) === JSON.stringify(before.mode)) return;
    // The ticket cycle advances once per ticket opened (WI6).
    if (before.mode.kind !== 'ticket' && r.state.mode.kind === 'ticket') this.clerk = { ...this.clerk, ticket: this.clerk.ticket + 1 };
    this.state = r.state;
    this.redraw();
  }

  /** WI2, BP10: the stake leaves the bankroll now, the clerk stamps, the slip prints, then the race. */
  private placeBet(bet: Bet): void {
    if (this.program === null || this.beatSeconds !== null) return;
    try {
      this.day = goToPost(this.data0.bet.ctx, this.day, this.program, bet);
    } catch (err) {
      return this.fail(err);
    }
    this.clerk = { ...this.clerk, punch: this.clerk.punch + 1 };
    this.state = { focus: this.state.focus, mode: { kind: 'placed' } };
    this.beatSeconds = 0;
    this.clerkImage.setFrame(String(clerkFrame(this.data0.bet.hub, this.seconds, 0, this.reducedMotion)));
    this.redraw();
  }

  /** The day's BetDay with this visit's clerk counts, handed on (replaced, never changed in place). */
  private betOut(): BetDay {
    return { ...this.data0.bet, clerk: this.clerk };
  }

  /** WI3: Esc while choosing, or "Esc: back": the track with focus on Bet. Nothing was staked. */
  private back(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start('hub', { bet: this.betOut(), day: this.day, art: this.data0.art, held: this.keys.down(), focus: 'back' } satisfies HubData);
  }

  private toRace(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start('race', betRaceData(this.betOut(), this.day, this.drawn, this.data0.art, this.keys.down()));
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
