import Phaser from 'phaser';
import { goToPost, type DayState, type DrawnRace, type RaceProgram } from '../bet/day';
import type { Bet } from '../bet/market';
import { offeredAmounts } from '../bet/money';
import type { RaceDayData } from '../data/raceDayLoad';
import { rgbOf } from '../render/colors';
import { PAPER_CURSOR_SWAPS } from '../render/page';
import { cursorFrame } from '../render/pause';
import {
  PROGRAM_SLOT_IDS, initialProgramState, lastBetDollars, programClick, programHorses, programKey, programPointerTargets, programScreen,
  type ProgramKeyContext, type ProgramOutcome, type ProgramState,
} from '../render/programScreen';
import { PLACEHOLDER_TAG_AT, SLOT_IDS, showPlaceholderTag, standIns } from '../render/slotStatus';
import { Art, type ArtInfo } from './art';
import { betErrorLines, betRaceData, passDay, programIfReady, raceDayFor, type BetDay } from './betDay';
import type { EndOfDayData } from './EndOfDayScene';
import type { HubData } from './HubScene';
import { MenuKeys } from './menuKeys';
import { PagePainter } from './paper';
import { PointerInput } from './pointerInput';

// The betting program page (docs/specs/betting-screens.md section 3): read the field and
// its prices, open the ticket at the foot of the page, change the amount, place the bet or
// pass. The first screen of a day and the one every result returns to. Everything drawn
// comes from src/render/programScreen.ts and every price from src/bet; this file places
// it, keeps the timers (the band's swipe, the punch beat) and forwards the keys.

export interface ProgramData {
  bet: BetDay;
  /** The day before this race goes to the post. */
  day: DayState;
  art: ArtInfo;
  /** Keys still down from the screen before, ignored until released (IN2). */
  held?: string[];
  /** The post focus starts on: 1 from Windows, k from digit k at the track. */
  post?: number;
}

export class ProgramScene extends Phaser.Scene {
  private data0!: ProgramData;
  private drawn!: DrawnRace;
  private rd!: RaceDayData;
  private day!: DayState;
  private program: RaceProgram | null = null;
  private state: ProgramState = initialProgramState();
  private keys!: MenuKeys;
  private art!: Art;
  private page!: PagePainter;
  private cursor!: Phaser.GameObjects.Image;
  private seconds = 0;
  /** Seconds since the ticket opened, for the band's 2-frame swipe. */
  private swipeSeconds = 0;
  /** Seconds since the bet was placed, for the punch beat. */
  private punchSeconds = 0;
  private leaving = false;

  constructor() {
    super('program');
  }

  create(data: ProgramData): void {
    this.data0 = data;
    this.seconds = 0;
    this.swipeSeconds = 0;
    this.punchSeconds = 0;
    this.leaving = false;
    this.state = initialProgramState(data.post);
    this.art = new Art(this, data.art);
    // Never shown on an ended day: it goes to the End of day page (betting-screens.md section 6).
    if (data.day.ended !== null) {
      this.leaving = true;
      this.scene.start('endOfDay', { bet: data.bet, day: data.day, art: data.art, held: data.held } satisfies EndOfDayData);
      return;
    }
    this.day = data.day;
    this.drawn = data.bet.drawn[data.day.nextRace - 1];
    this.rd = raceDayFor(data.bet, this.drawn);
    // This race's estimate first, then the next race's, which runs while this one is read and watched (UI5).
    data.bet.estimates.request(this.drawn);
    const after = data.bet.drawn[data.day.nextRace];
    if (after) data.bet.estimates.request(after);
    this.program = this.tryProgram();
    if (this.leaving) return;

    this.cameras.main.setBackgroundColor(rgbOf(data.art.colors, 'Parchment'));
    this.page = new PagePainter(this, this.art, 1);
    this.cursor = this.add.image(0, 0, this.art.swap(SLOT_IDS.cursor, PAPER_CURSOR_SWAPS), '0').setOrigin(0, 0).setDepth(5);
    const drawnSlots = standIns(data.art.slots, data.art.states, PROGRAM_SLOT_IDS);
    this.add.image(PLACEHOLDER_TAG_AT.x, PLACEHOLDER_TAG_AT.y, SLOT_IDS.placeholderTag, '0').setOrigin(0, 0).setDepth(10)
      .setVisible(showPlaceholderTag(drawnSlots));
    this.redraw();

    const m = this.rd.raceDay.menus;
    this.keys = new MenuKeys(this, data.held ?? [], { delaySeconds: m.repeatDelayMs.value / 1000, everySeconds: m.repeatEveryMs.value / 1000 }, (code) => this.act(code));
    // The mouse (track-hub.md section 6): clicks only, no hover focus on the page.
    new PointerInput(this, () => programPointerTargets(this.rd.raceDay, this.state, this.keyContext()), {
      click: (id) => { if (!this.leaving) this.apply(programClick(this.state, id, this.keyContext())); },
    }, this.rd.raceDay.pointer.arrivalGuardSeconds.value);
  }

  update(_time: number, delta: number): void {
    if (!this.data0 || this.leaving) return;
    const rd = this.rd.raceDay;
    const dt = Math.min(Math.max(0, delta), rd.playback.maxFrameMs.value) / 1000;
    this.seconds += dt;
    const problem = this.program === null ? this.data0.bet.estimates.failure(this.drawn) : null;
    if (problem !== null) return this.fail(new Error(`the odds could not be worked out: ${problem}`));
    // The odds arrive whole: every price appears in the same frame.
    if (this.program === null) {
      this.program = this.tryProgram();
      if (this.program !== null) this.redraw();
    }
    const mode = this.state.mode.kind;
    if (mode === 'placed') {
      this.punchSeconds += dt;
      if (this.punchSeconds >= rd.program.punchSeconds.value) this.toRace(this.day);
      return;
    }
    if (mode === 'ticket' && this.swipeSeconds < rd.program.swipeFrame1Seconds.value) {
      this.swipeSeconds += dt;
      if (this.swipeSeconds >= rd.program.swipeFrame1Seconds.value) this.redraw();
    }
    this.keys.update(dt);
    const frames = this.art.frames(SLOT_IDS.cursor);
    this.cursor.setFrame(String(frames > 1 ? cursorFrame(this.seconds, rd.ambient.cursorSwapsPerSecond.value) : 0));
  }

  private tryProgram(): RaceProgram | null {
    try {
      return programIfReady(this.data0.bet, this.drawn);
    } catch (err) {
      this.fail(err);
      return null;
    }
  }

  private redraw(): void {
    const d = this.data0;
    const s = programScreen({
      ctx: d.bet.ctx, rd: this.rd.raceDay, look: this.rd.cardLook, drawn: this.drawn, program: this.program, day: this.day,
      state: this.state, bandFrame: this.swipeSeconds < this.rd.raceDay.program.swipeFrame1Seconds.value ? 1 : 2,
    });
    const p = this.page;
    p.clear();
    p.rects([...s.band, ...s.rules, ...s.slip]);
    p.texts([...s.header, ...s.heads, ...s.odds, ...s.footer]);
    for (const e of s.rows) p.entry(e);
    // DESIGN: the tick and the cursor never share the margin cell; while the ticket prints, no cursor.
    this.cursor.setVisible(s.cursor !== null);
    if (s.cursor) this.cursor.setPosition(s.cursor.x, s.cursor.y);
  }

  private keyContext(): ProgramKeyContext {
    return {
      horses: programHorses(this.drawn).length,
      ready: this.program !== null,
      offered: offeredAmounts(this.day.bankrollCents, this.data0.bet.ctx.rules),
      lastDollars: lastBetDollars(this.day),
    };
  }

  private act(code: string): void {
    if (this.leaving) return;
    this.apply(programKey(this.state, code, this.keyContext()));
  }

  /** A key's or a click's result: the same handling for both (TH12). */
  private apply(r: { state: ProgramState; outcome: ProgramOutcome }): void {
    const before = this.state;
    if (r.outcome?.kind === 'back') return this.back();
    if (r.outcome?.kind === 'pass') return this.pass();
    if (r.outcome?.kind === 'bet') return this.placeBet({ post: r.outcome.post, dollars: r.outcome.dollars });
    if (r.state.focus === before.focus && JSON.stringify(r.state.mode) === JSON.stringify(before.mode)) return;
    // The band swipes on as the ticket opens; Esc takes it off at once with no swipe back.
    if (before.mode.kind !== 'ticket' && r.state.mode.kind === 'ticket') this.swipeSeconds = 0;
    this.state = r.state;
    this.redraw();
  }

  /** Go to the post with the bet: the stake leaves the bankroll now, then the punch beat (BP10). */
  private placeBet(bet: Bet): void {
    if (this.program === null) return;
    try {
      this.day = goToPost(this.data0.bet.ctx, this.day, this.program, bet);
    } catch (err) {
      return this.fail(err);
    }
    this.state = { focus: this.state.focus, mode: { kind: 'placed' } };
    this.punchSeconds = 0;
    this.redraw();
  }

  /**
   * Pass: no money moves and no mark is drawn; the page cuts to the race at once. While the
   * odds are still pending, Go to the post waits for them at the end of the race, since the
   * result's $2 price needs the crowd's money (a pass stakes nothing, so nothing changes).
   */
  private pass(): void {
    let day: DayState;
    try {
      day = passDay(this.data0.bet, this.day, this.drawn);
    } catch (err) {
      return this.fail(err);
    }
    this.toRace(day);
  }

  /** Esc while choosing: back to the track, focus on Windows. Nothing was staked, so no money moves. */
  private back(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start('hub', { bet: this.data0.bet, day: this.day, art: this.data0.art, held: this.keys.down() } satisfies HubData);
  }

  private toRace(day: DayState): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start('race', betRaceData(this.data0.bet, day, this.drawn, this.data0.art, this.keys.down()));
  }

  private fail(err: unknown): void {
    if (this.leaving) return;
    this.leaving = true;
    console.error(err);
    this.scene.start('error', { lines: betErrorLines(this.data0.day.daySeed, this.data0.day.nextRace, err), art: this.data0.art });
  }
}
