import Phaser from 'phaser';
import type { RaceDayData } from '../data/raceDayLoad';
import type { GameData } from '../data/schema';
import { rgbOf } from '../render/colors';
import { simErrorLines } from '../render/format';
import { makeRaceSetup, playerView, raceFrame, type PlayerView, type RaceFrame, type RaceSetup } from '../render/raceFrame';
import { nextRace, seedFor, type Session } from '../render/session';
import { PLACEHOLDER_TAG_AT, SLOT_IDS, neededSlotIds, showPlaceholderTag, standIns, trackSlotId } from '../render/slotStatus';
import { beatBegan, keyDown, keyState, keyUp, type KeyState } from '../render/keys';
import { PAUSE_BOX, PAUSE_ITEMS, PAUSE_LAYOUT, closedPause, cursorFrame, moveFocus, openPause, type PauseState } from '../render/pause';
import { PHOTO_AREA, PHOTO_CROP, PHOTO_PANEL, PHOTO_SCALE } from '../render/photo';
import { phaseOf, skip, startClock, tick, type Clock } from '../render/timeline';
import { railTiles, type PoleKind } from '../render/view';
import { runRace } from '../sim/runRace';
import type { RaceResult } from '../sim/result';
import { Art, type ArtInfo } from './art';
import type { ResultData } from './ResultScene';

// The race-day sequence (spec 4.3): the gate, the race, the wire hold, the photo when the
// result flags one, and the winner beat, played from the sim's replay, with the HUD, 4x,
// skips and the pause box. When the beat ends the result screen opens by itself. Every
// position, word and color comes from src/render/raceFrame.ts and the pure modules beside
// it; this file keeps the clock and the keys and places sprites and text where they say.

export interface RaceData {
  game: GameData; rd: RaceDayData; art: ArtInfo; session: Session;
  /** Keys still down from the race before, ignored until released (IN2). */
  held?: string[];
}

const LAYERS = ['body', 'tack', 'jacket', 'cap'] as const;
const SLOT = SLOT_IDS.horse;

const DEPTH = { back: 0, far: 10, mid: 20, track: 30, poles: 35, gate: 40, horses: 100, markers: 400, hud: 500, hudTop: 510, photo: 520, pause: 700 } as const;
const MID_Y = 56;
const FAST_TAG_AT = { x: 224, y: 4 } as const;
type Pose = 'stand' | 'gallop' | 'walk' | 'winner';
const STRIP = { x: 8, y: 168, w: 12, h: 10, gap: 2 } as const;
// The strip's Yellow arrow: 4 rows from y179, 1 px clear of the box above and the name below.
const STRIP_ARROW_Y = 179;
const LINES = { name: 184, position: 194, orders: 204 } as const;
const RAIL_Y = { far: 84, near: 152 } as const;
const MINIMAP_AT = { x: 160, y: 168 } as const;

interface HorseObjects {
  /** Recolored texture per layer and pose, made on first use. */
  key: (layer: (typeof LAYERS)[number], pose: Pose) => string;
  layers: Phaser.GameObjects.Image[];
  number: Phaser.GameObjects.Image;
  /** The same horse at 2x in the photo, clipped to the photo's rectangle. */
  photoLayers: Phaser.GameObjects.Image[];
  photoNumber: Phaser.GameObjects.Image;
}

interface PhotoObjects {
  /** The panel's frame tiles, moved together as it steps in. */
  panel: Phaser.GameObjects.Container;
  streaks: Phaser.GameObjects.TileSprite;
  wire: Phaser.GameObjects.Graphics;
  /** The photo's rectangle, as a mask for the horses. */
  clip: Phaser.GameObjects.Graphics;
  arrow: Phaser.GameObjects.Image;
  captions: Phaser.GameObjects.BitmapText[];
}

export class RaceScene extends Phaser.Scene {
  private data0!: RaceData;
  private art!: Art;
  private setup!: RaceSetup;
  private me!: PlayerView;
  private session!: Session;
  private clock: Clock = startClock();
  private keys: KeyState = keyState();
  private pause: PauseState = closedPause();
  private uiSeconds = 0;
  /** Set once this race hands over to the next, so a second Enter in the same frame does nothing. */
  private leaving = false;
  private hills!: Phaser.GameObjects.TileSprite;
  private dirt!: Phaser.GameObjects.TileSprite;
  private rails: Record<'far' | 'near', Phaser.GameObjects.Image[]> = { far: [], near: [] };
  private trackSlot = '';
  private stands: Phaser.GameObjects.Image[] = [];
  private poles: Record<'furlong' | 'wire', Phaser.GameObjects.Image[]> = { furlong: [], wire: [] };
  private gate!: Phaser.GameObjects.Image;
  private horses = new Map<string, HorseObjects>();
  private arrow!: Phaser.GameObjects.Image;
  private edges: { box: Phaser.GameObjects.Image; num: Phaser.GameObjects.Image }[] = [];
  private stripG!: Phaser.GameObjects.Graphics;
  private stripNums: Phaser.GameObjects.Image[] = [];
  private dotsG!: Phaser.GameObjects.Graphics;
  private texts!: Record<'call' | 'name' | 'position' | 'orders' | 'clock' | 'message' | 'fast', Phaser.GameObjects.BitmapText>;
  private crowd: Phaser.GameObjects.Image[] = [];
  private infield: Phaser.GameObjects.Image[] = [];
  private flags: Phaser.GameObjects.Image[] = [];
  private pauseObjects: Phaser.GameObjects.GameObject[] = [];
  private pauseCursor!: Phaser.GameObjects.Image;
  private minimap!: Phaser.GameObjects.Image;
  private photo!: PhotoObjects;

  constructor() {
    super('race');
  }

  create(data: RaceData): void {
    this.data0 = data;
    this.session = data.session;
    this.clock = startClock();
    this.keys = keyState(data.held ?? []);
    this.pause = closedPause();
    this.uiSeconds = 0;
    this.leaving = false;
    this.crowd = [];
    this.infield = [];
    this.flags = [];
    this.pauseObjects = [];
    this.horses.clear();
    this.stands = [];
    this.poles = { furlong: [], wire: [] };
    this.edges = [];
    this.stripNums = [];
    this.rails = { far: [], near: [] };
    this.art = new Art(this, data.art);

    const seed = seedFor(this.session.firstSeed, this.session.raceNumber);
    let result: RaceResult;
    try {
      result = runRace(data.game, seed);
    } catch (err) {
      console.error(`The race could not be run (seed ${seed}).`, err);
      this.scene.start('error', { lines: simErrorLines(seed, err), art: data.art });
      return;
    }
    // The loader has already checked at boot that every needed slot, this one included, is in slots.json.
    this.trackSlot = trackSlotId(result.inputs.race.surface, result.inputs.race.going);
    const gallop = this.art.slot(SLOT.body.gallop);
    this.setup = makeRaceSetup(result, data.rd.raceDay, this.session.raceNumber, {
      gallopFrames: gallop.frames ?? 1,
      noseX: gallop.noseX ?? (gallop.frameWidth ?? 32) - 1,
      standTileWidth: this.art.slot(SLOT_IDS.grandstand).frameWidth ?? 32,
      poleWidth: this.art.slot(SLOT_IDS.poleFurlong).frameWidth ?? 4,
      wirePoleWidth: this.art.slot(SLOT_IDS.poleWire).frameWidth ?? 8,
      walkFrames: this.art.slot(SLOT.body.walk).frames ?? 1,
      crowdTileWidth: this.art.slot(SLOT_IDS.crowd).frameWidth ?? 16,
      infieldTileWidth: this.art.slot(SLOT_IDS.infield).frameWidth ?? 32,
      infieldFillWidth: this.art.slot(SLOT_IDS.infield).fillSlice?.[1],
      flagAt: this.art.slot(SLOT_IDS.flag).attachAt ?? [0, 0],
      flagWidth: this.art.slot(SLOT_IDS.flag).frameWidth ?? 8,
    });
    this.me = playerView(this.setup, this.session.pickPost);

    this.buildWorld();
    this.buildHorses(result);
    this.buildHud();
    this.buildPhoto();
    this.buildPause();
    this.bindKeys();
    this.draw(raceFrame(this.setup, this.me, this.clock));
  }

  update(_time: number, delta: number): void {
    if (!this.setup) return;
    const dt = Math.min(Math.max(0, delta), this.data0.rd.raceDay.playback.maxFrameMs.value) / 1000;
    if (this.pause.open) {
      // Nothing in the race advances while paused, ambient loops included; only the cursor bobs.
      this.uiSeconds += dt;
      this.drawPause();
      return;
    }
    const fast = this.keys.down.has('Space') && !this.keys.stale.has('Space');
    this.setClock(tick(this.clock, this.setup.timeline, dt, fast));
    if (this.leaving) return;
    this.draw(raceFrame(this.setup, this.me, this.clock));
  }

  /** Every clock change goes through here, so a new beat makes held keys stale (IN2). */
  private setClock(next: Clock): void {
    if (phaseOf(next) !== phaseOf(this.clock)) this.keys = beatBegan(this.keys);
    this.clock = next;
    // The winner beat is over (or skipped): the result screen opens by itself (spec 4.6).
    if (phaseOf(next) === 'done') this.toResult();
  }

  private toResult(): void {
    if (this.leaving) return;
    this.leaving = true;
    const data: ResultData = {
      game: this.data0.game, rd: this.data0.rd, art: this.data0.art, session: this.session,
      result: this.setup.result, playerId: this.me.id, held: [...this.keys.down],
    };
    this.scene.start('result', data);
  }

  private color(name: string): number {
    return rgbOf(this.data0.art.colors, name);
  }

  private cloth(post: number) {
    const list = this.data0.rd.raceDay.saddlecloths.value;
    return list[(post - 1) % list.length];
  }

  private buildWorld(): void {
    const g = this.add.graphics().setDepth(DEPTH.back);
    const band = (name: string, y0: number, y1: number) => { g.fillStyle(this.color(name)); g.fillRect(0, y0, 256, y1 - y0 + 1); };
    band('Navy', 0, 14);
    band('Ash', 15, 15);
    band('Sky', 16, 39);
    band('Sky Pale', 40, 63);
    band('Grass', 64, 91);
    band('Grass', 152, 159);

    this.hills = this.add.tileSprite(0, 40, 256, 24, SLOT_IDS.hills, '0').setOrigin(0, 0).setDepth(DEPTH.far);
    for (let i = 0; i < 12; i++) {
      this.stands.push(this.add.image(0, MID_Y, SLOT_IDS.grandstand, '0').setOrigin(0, 0).setDepth(DEPTH.mid).setVisible(false));
    }
    const crowdY = this.art.slot(SLOT_IDS.crowd).atY ?? MID_Y;
    const pool = (n: number, id: string, y: number, depth: number) =>
      Array.from({ length: n }, () => this.add.image(0, y, id, '0').setOrigin(0, 0).setDepth(depth).setVisible(false));
    this.crowd = pool(Math.ceil(256 / (this.art.slot(SLOT_IDS.crowd).frameWidth ?? 16)) + 2, SLOT_IDS.crowd, crowdY, DEPTH.mid + 1);
    // The infield's pole-free slice is its own frame, 'fill', cut from the tile's columns.
    const infield = this.art.slot(SLOT_IDS.infield);
    const slice = infield.fillSlice ?? [0, infield.frameWidth ?? 32];
    const tex = this.textures.get(SLOT_IDS.infield);
    if (!tex.has('fill')) tex.add('fill', 0, slice[0], 0, slice[1], infield.frameHeight ?? 32);
    this.infield = pool(Math.ceil(256 / slice[1]) + 4, SLOT_IDS.infield, MID_Y, DEPTH.mid);
    this.flags = pool(3, SLOT_IDS.flag, MID_Y, DEPTH.mid + 2);
    this.dirt = this.add.tileSprite(0, 92, 256, 60, this.trackSlot, '0').setOrigin(0, 0).setDepth(DEPTH.track);
    // Rail tiles as drawn: far rail y84-91 (bar on top, Grass behind the posts), near rail
    // y152-159. One image per 16 px of world, flipped on odd tiles so posts pair every 32 px.
    for (const side of ['far', 'near'] as const) {
      const id = side === 'far' ? SLOT_IDS.railFar : SLOT_IDS.railNear;
      const count = Math.ceil(256 / (this.art.slot(id).frameWidth ?? 16)) + 1;
      for (let i = 0; i < count; i++) {
        this.rails[side].push(this.add.image(0, RAIL_Y[side], id, '0').setOrigin(0, 0).setDepth(DEPTH.track + 1).setVisible(false));
      }
    }
    for (let i = 0; i < 4; i++) {
      this.poles.furlong.push(this.add.image(0, 64, SLOT_IDS.poleFurlong, '0').setOrigin(0, 0).setDepth(DEPTH.poles).setVisible(false));
      this.poles.wire.push(this.add.image(0, 64, SLOT_IDS.poleWire, '0').setOrigin(0, 0).setDepth(DEPTH.poles).setVisible(false));
    }
    this.gate = this.add.image(0, 64, SLOT_IDS.gate, '0').setOrigin(0, 0).setDepth(DEPTH.gate);
  }

  private buildHorses(result: RaceResult): void {
    const looks = this.data0.rd.cardLook;
    const coats = this.data0.rd.raceDay.coats;
    for (const h of result.inputs.card.horses) {
      const look = looks[h.id];
      const coat = coats[look.coat];
      const cloth = this.cloth(h.post);
      const tones: Record<(typeof LAYERS)[number], [string, string]> = {
        body: [coat.base, coat.second],
        tack: [cloth.fill, cloth.number],
        jacket: [look.silks.body, look.silks.body],
        cap: [look.silks.cap, look.silks.cap],
      };
      const key = (layer: (typeof LAYERS)[number], pose: Pose) => {
        const ids = SLOT[layer] as Record<string, string>;
        // Only the jockey layers have winner frames; the horse layers walk under them.
        const id = ids[pose] ?? ids[pose === 'winner' ? 'walk' : pose];
        return this.art.recolor(id, tones[layer][0], tones[layer][1]);
      };
      const layers = LAYERS.map((l) => this.add.image(0, 0, key(l, 'stand'), '0').setOrigin(0, 0));
      const number = this.art.glyph(0, 0, String(h.post % 10), cloth.number);
      const photoLayers = LAYERS.map((l, i) => this.add.image(0, 0, key(l, 'gallop'), '0').setOrigin(0, 0).setScale(PHOTO_SCALE).setVisible(false).setDepth(DEPTH.photo + 10 + i));
      const photoNumber = this.art.glyph(0, 0, String(h.post % 10), cloth.number).setScale(PHOTO_SCALE).setVisible(false).setDepth(DEPTH.photo + 10 + LAYERS.length);
      this.horses.set(h.id, { key, layers, number, photoLayers, photoNumber });
    }
    this.arrow = this.add.image(0, 0, SLOT_IDS.markerPlayer, '0').setOrigin(0, 0).setDepth(DEPTH.markers);
    for (let i = 0; i < 2; i++) {
      const box = this.add.image(0, 0, SLOT_IDS.markerEdge, '0').setOrigin(0, 0).setDepth(DEPTH.markers).setVisible(false);
      const num = this.art.glyph(0, 0, '0', 'Ink').setDepth(DEPTH.markers + 1).setVisible(false);
      this.edges.push({ box, num });
    }
  }

  private buildHud(): void {
    const tag = this.add.image(PLACEHOLDER_TAG_AT.x, PLACEHOLDER_TAG_AT.y, SLOT_IDS.placeholderTag, '0').setOrigin(0, 0).setDepth(DEPTH.hudTop);
    const used = neededSlotIds(this.setup.result.inputs.race);
    const drawn = standIns(this.data0.art.slots, this.data0.art.states, used);
    tag.setVisible(showPlaceholderTag(drawn));
    if (drawn.length > 0 && this.session.raceNumber === 0) {
      console.warn(`Placeholder art on the race screen (${drawn.length} slots):\n${drawn.map((d) => `  ${d.id}: ${d.reason}`).join('\n')}`);
    }

    this.art.box(0, 160, 32, 10, DEPTH.hud);
    this.minimap = this.add.image(MINIMAP_AT.x, MINIMAP_AT.y, SLOT_IDS.minimap, '0').setOrigin(0, 0).setDepth(DEPTH.hud + 1);
    this.stripG = this.add.graphics().setDepth(DEPTH.hud + 1);
    this.dotsG = this.add.graphics().setDepth(DEPTH.hud + 2);
    for (let i = 0; i < this.setup.result.replay.horses.length; i++) {
      this.stripNums.push(this.art.glyph(0, 0, '0', 'Ink').setDepth(DEPTH.hud + 2));
    }
    const t = (x: number, y: number, color = 'Bone') => this.art.text(x, y, '', color).setDepth(DEPTH.hud + 3);
    this.texts = {
      call: t(4, 4).setDepth(DEPTH.hudTop),
      name: t(8, LINES.name, 'Yellow'),
      position: t(8, LINES.position),
      orders: t(8, LINES.orders),
      clock: t(192, 210),
      message: t(8, 221),
      fast: t(FAST_TAG_AT.x, FAST_TAG_AT.y).setDepth(DEPTH.hudTop),
    };
  }

  /** The photo finish (spec 4.4), hidden until the photo beat; raceFrame says where everything goes. */
  private buildPhoto(): void {
    const before = this.children.list.length;
    this.art.box(PHOTO_PANEL.x, PHOTO_PANEL.y, PHOTO_PANEL.tilesW, PHOTO_PANEL.tilesH, DEPTH.photo);
    const tiles = this.children.list.slice(before);
    const panel = this.add.container(0, 0, tiles).setDepth(DEPTH.photo).setVisible(false);
    // The streaks tile at 1x over the 112x88 crop, the whole sprite doubled with the photo.
    const streaks = this.add.tileSprite(PHOTO_AREA.x, PHOTO_AREA.y, PHOTO_CROP.behindWire + PHOTO_CROP.pastWire, PHOTO_CROP.rows, SLOT_IDS.photoStreaks, '0')
      .setOrigin(0, 0).setScale(PHOTO_SCALE).setDepth(DEPTH.photo + 1).setVisible(false);
    const wire = this.add.graphics().setDepth(DEPTH.photo + 2).setVisible(false);
    const clip = this.make.graphics({}, false);
    const mask = clip.createGeometryMask();
    for (const o of this.horses.values()) {
      for (const img of [...o.photoLayers, o.photoNumber]) img.setMask(mask);
    }
    const arrow = this.add.image(0, 0, SLOT_IDS.markerPlayer, '0').setOrigin(0, 0).setDepth(DEPTH.photo + 100).setVisible(false);
    const captions = [0, 1].map(() => this.art.text(0, 0, '').setDepth(DEPTH.photo + 100).setVisible(false));
    this.photo = { panel, streaks, wire, clip, arrow, captions };
  }

  private buildPause(): void {
    const copy = this.data0.rd.raceDay.copy.pause;
    const o: Phaser.GameObjects.GameObject[] = [];
    const before = this.children.list.length;
    this.art.box(PAUSE_BOX.x, PAUSE_BOX.y, PAUSE_BOX.tilesW, PAUSE_BOX.tilesH, DEPTH.pause);
    o.push(...this.children.list.slice(before));
    o.push(this.art.text(PAUSE_LAYOUT.title.x, PAUSE_LAYOUT.title.y, copy.title).setDepth(DEPTH.pause + 1));
    PAUSE_ITEMS.forEach((item, i) => {
      const at = PAUSE_LAYOUT.items[i];
      o.push(this.art.text(at.x, at.y, item === 'resume' ? copy.resume : copy.back).setDepth(DEPTH.pause + 1));
    });
    this.pauseCursor = this.add.image(PAUSE_LAYOUT.cursorX, PAUSE_LAYOUT.items[0].y, SLOT_IDS.cursor, '0').setOrigin(0, 0).setDepth(DEPTH.pause + 1);
    o.push(this.pauseCursor);
    this.pauseObjects = o;
    this.drawPause();
  }

  private drawPause(): void {
    for (const g of this.pauseObjects) (g as unknown as Phaser.GameObjects.Components.Visible).setVisible(this.pause.open);
    if (!this.pause.open) return;
    const frames = this.art.frames(SLOT_IDS.cursor);
    const bob = cursorFrame(this.uiSeconds - this.pause.openedAt, this.data0.rd.raceDay.ambient.cursorSwapsPerSecond.value);
    this.pauseCursor.setY(PAUSE_LAYOUT.items[this.pause.focus].y).setFrame(String(frames > 1 ? bob : 0));
  }

  private setPause(next: PauseState): void {
    if (next.open !== this.pause.open) this.keys = beatBegan(this.keys);
    this.pause = next;
    this.drawPause();
  }

  private nextRace(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.restart({ ...this.data0, session: nextRace(this.session), held: [...this.keys.down] });
  }

  private bindKeys(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    kb.addCapture('SPACE,ENTER,UP,DOWN,ESC');
    const onDown = (e: KeyboardEvent) => {
      const r = keyDown(this.keys, e.code, e.repeat);
      this.keys = r.state;
      if (r.act && !this.leaving) this.act(e.code);
    };
    const onUp = (e: KeyboardEvent) => { this.keys = keyUp(this.keys, e.code); };
    // A key let go while the window is unfocused never sends keyup, so forget them all.
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

  /** One key press, already filtered for repeats and keys held over from the last beat. */
  private act(code: string): void {
    const enter = code === 'Enter' || code === 'NumpadEnter';
    if (this.pause.open) {
      if (code === 'Escape') this.setPause(closedPause());
      else if (code === 'ArrowUp') this.setPause(moveFocus(this.pause, -1));
      else if (code === 'ArrowDown') this.setPause(moveFocus(this.pause, 1));
      else if (enter && PAUSE_ITEMS[this.pause.focus] === 'resume') this.setPause(closedPause());
      // No card screen yet: Back to card abandons this race and its seed is spent.
      else if (enter) this.nextRace();
      return;
    }
    if (code === 'KeyP' || code === 'Escape') {
      this.setPause(openPause(this.uiSeconds));
      return;
    }
    const phase = phaseOf(this.clock);
    const digit = /^(Digit|Numpad)([1-9])$/.exec(code);
    if (digit && phase === 'gate') {
      const post = Number(digit[2]);
      if (this.setup.result.inputs.card.horses.some((h) => h.post === post)) {
        this.session = { ...this.session, pickPost: post };
        this.me = playerView(this.setup, post);
      }
    } else if (enter) {
      const quarter = this.setup.result.calls.find((c) => c.furlongsToGo === 2)?.time ?? this.setup.timeline.winnerTime;
      this.setClock(skip(this.clock, this.setup.timeline, quarter));
      if (!this.leaving) this.draw(raceFrame(this.setup, this.me, this.clock));
    }
  }

  private setText(key: keyof RaceScene['texts'], value: string): void {
    const t = this.texts[key];
    if (t.text !== value) t.setText(value);
  }

  private draw(f: RaceFrame): void {
    this.hills.tilePositionX = f.farScroll;
    this.dirt.tilePositionX = f.drawCam;
    for (const side of ['far', 'near'] as const) {
      const pool = this.rails[side];
      const tiles = railTiles(f.drawCam, this.art.slot(side === 'far' ? SLOT_IDS.railFar : SLOT_IDS.railNear).frameWidth ?? 16);
      pool.forEach((img, i) => {
        const tile = tiles[i];
        img.setVisible(tile !== undefined);
        if (tile) img.setX(tile.x).setFlipX(tile.flip);
      });
    }
    this.stands.forEach((img, i) => {
      const x = f.standXs[i];
      img.setVisible(x !== undefined);
      if (x !== undefined) img.setX(x);
    });
    const place = (pool: Phaser.GameObjects.Image[], items: { x: number; y?: number; frame?: number }[]) => pool.forEach((img, i) => {
      const it = items[i];
      img.setVisible(it !== undefined);
      if (it) img.setX(it.x).setFrame(String(it.frame ?? 0));
      if (it && it.y !== undefined) img.setY(it.y);
    });
    place(this.crowd, f.crowdTiles);
    this.crowd.forEach((img, i) => { const t = f.crowdTiles[i]; if (t) img.setFlipX(t.flip); });
    this.infield.forEach((img, i) => {
      const it = f.infieldTiles[i];
      img.setVisible(it !== undefined);
      // Full tiles draw over the fill slices, so the pole sits on unbroken lawn.
      if (!it) return;
      // A cropped slice: shift the image left by srcX so its first drawn column lands at x.
      img.setFrame(it.full ? '0' : 'fill').setDepth(DEPTH.mid + (it.full ? 1 : 0)).setX(it.x - it.srcX);
      img.setCrop(it.srcX, 0, it.width, img.frame.height);
    });
    place(this.flags, f.flags);

    const used = { furlong: 0, wire: 0 };
    for (const pole of f.poles) {
      const pool = pole.kind === 'wire' ? 'wire' : 'furlong';
      const img = this.poles[pool][used[pool]++];
      if (!img) continue;
      img.setVisible(true).setX(pole.x);
      if (pool === 'furlong') img.setTexture(this.poleKey(pole.kind), '0');
    }
    for (const pool of ['furlong', 'wire'] as const) this.poles[pool].slice(used[pool]).forEach((img) => img.setVisible(false));

    const gateSlot = this.art.slot(SLOT_IDS.gate);
    const gateX = f.gate.startX - (gateSlot.startX ?? 0);
    this.gate.setX(gateX).setFrame(f.gate.open && this.art.frames(SLOT_IDS.gate) > 1 ? '1' : '0')
      .setVisible(gateX > -(gateSlot.frameWidth ?? 40) && gateX < 256);

    const shown = new Set(f.horses.map((s) => s.id));
    for (const [id, o] of this.horses) {
      if (shown.has(id)) continue;
      o.layers.forEach((img) => img.setVisible(false));
      o.number.setVisible(false);
    }
    f.horses.forEach((s, rank) => {
      const o = this.horses.get(s.id);
      if (!o) return;
      LAYERS.forEach((layer, i) => {
        const img = o.layers[i];
        const jockey = layer === 'jacket' || layer === 'cap';
        const key = o.key(layer, jockey && s.fist ? 'winner' : s.pose);
        if (img.texture.key !== key) img.setTexture(key, String(s.frame));
        else img.setFrame(String(s.frame));
        img.setVisible(true).setPosition(s.x, s.y).setDepth(DEPTH.horses + rank * 10 + i);
      });
      const at = this.art.slot(SLOT.tack[s.pose]).numberAt?.[s.frame] ?? [10, 10];
      o.number.setVisible(true).setPosition(s.x + at[0], s.y + at[1]).setDepth(DEPTH.horses + rank * 10 + LAYERS.length);
    });
    if (f.arrow) this.arrow.setVisible(true).setPosition(f.arrow.x, f.arrow.y);
    else this.arrow.setVisible(false);

    this.edges.forEach((e, i) => {
      const m = f.edges[i];
      e.box.setVisible(!!m);
      e.num.setVisible(!!m);
      if (!m) return;
      const cloth = m.yours ? { fill: 'Yellow', number: 'Ink' } : this.cloth(m.post);
      // Rows centered on the lane height; the number's cell at x2 (x3 flipped), y2, inside the 5x7 fill.
      const y = m.laneY - Math.floor((this.art.slot(SLOT_IDS.markerEdge).frameHeight ?? 9) / 2);
      e.box.setTexture(this.art.recolor(SLOT_IDS.markerEdge, cloth.fill), '0').setPosition(m.x, y).setFlipX(m.side === 'left');
      e.num.setTexture(this.art.font(SLOT_IDS.fontSmall, cloth.number), String(String(m.post % 10).charCodeAt(0)))
        .setPosition(m.x + (m.side === 'left' ? 3 : 2), y + 2);
    });

    this.drawStrip(f);
    this.drawDots(f);

    this.setText('call', f.call);
    this.setText('name', f.name);
    this.setText('position', f.position);
    this.setText('orders', f.orders);
    this.setText('message', f.message);
    this.setText('clock', f.clock);
    this.setText('fast', f.fastTag ?? '');
    this.texts.clock.setX(248 - 8 * f.clock.length);
    // The photo's panel and captions take the HUD's place while it shows.
    for (const t of Object.values(this.texts)) t.setVisible(f.hudVisible);
    for (const o of [this.stripG, this.dotsG, this.minimap, ...this.stripNums]) o.setVisible(f.hudVisible);
    this.drawPhoto(f);
  }

  private drawPhoto(f: RaceFrame): void {
    const p = f.photo;
    const o = this.photo;
    o.panel.setVisible(p !== null);
    o.streaks.setVisible(p !== null);
    o.wire.setVisible(p !== null);
    if (!p) {
      o.arrow.setVisible(false);
      o.captions.forEach((c) => c.setVisible(false));
      for (const h of this.horses.values()) [...h.photoLayers, h.photoNumber].forEach((img) => img.setVisible(false));
      return;
    }
    o.panel.setY(p.panel.y - PHOTO_PANEL.y);
    o.streaks.setPosition(p.area.x, p.area.y);
    o.wire.clear();
    for (const w of p.wire.stripes) o.wire.fillStyle(this.color(w.color)).fillRect(w.x, w.y, w.w, w.h);
    o.clip.clear().fillStyle(0xffffff).fillRect(p.area.x, p.area.y, p.area.w, p.area.h);
    p.horses.forEach((s, rank) => {
      const h = this.horses.get(s.id);
      if (!h) return;
      LAYERS.forEach((layer, i) => {
        const key = h.key(layer, 'gallop');
        const img = h.photoLayers[i];
        if (img.texture.key !== key) img.setTexture(key, String(s.frame));
        else img.setFrame(String(s.frame));
        img.setVisible(true).setPosition(s.x, s.y).setDepth(DEPTH.photo + 10 + rank * 10 + i);
      });
      const at = this.art.slot(SLOT.tack.gallop).numberAt?.[s.frame] ?? [10, 10];
      h.photoNumber.setVisible(true).setPosition(s.x + PHOTO_SCALE * at[0], s.y + PHOTO_SCALE * at[1]).setDepth(DEPTH.photo + 10 + rank * 10 + LAYERS.length);
    });
    if (p.arrow) o.arrow.setVisible(true).setPosition(p.arrow.x, p.arrow.y);
    else o.arrow.setVisible(false);
    o.captions.forEach((c, i) => {
      const cap = p.captions[i];
      c.setVisible(cap !== undefined);
      if (!cap) return;
      const font = this.art.font(SLOT_IDS.fontMain, cap.color);
      if (c.font !== font) c.setFont(font);
      if (c.text !== cap.text) c.setText(cap.text);
      c.setPosition(cap.x, cap.y);
    });
  }

  private poleKey(kind: PoleKind): string {
    const bands = this.data0.rd.raceDay.poleBands.value;
    return this.art.recolor(SLOT_IDS.poleFurlong, bands[kind === 'wire' ? 'quarter' : kind]);
  }

  private drawStrip(f: RaceFrame): void {
    const g = this.stripG;
    g.clear();
    f.strip.forEach((s, i) => {
      const x = STRIP.x + i * (STRIP.w + STRIP.gap);
      const cloth = this.cloth(s.post);
      g.fillStyle(this.color('Ash'));
      g.fillRect(x, STRIP.y, STRIP.w, STRIP.h);
      g.fillStyle(this.color(cloth.fill));
      g.fillRect(x + 1, STRIP.y + 1, STRIP.w - 2, STRIP.h - 2);
      const num = this.stripNums[i];
      if (num) num.setTexture(this.art.font(SLOT_IDS.fontSmall, cloth.number), String(String(s.post % 10).charCodeAt(0))).setPosition(x + 4, STRIP.y + 2);
      if (s.yours) {
        // The Yellow arrow under your box, pointing up: rows 1, 3, 5 and 7 px wide.
        g.fillStyle(this.color('Yellow'));
        for (let r = 0; r < 4; r++) g.fillRect(x + 5 - r, STRIP_ARROW_Y + r, 2 * r + 1, 1);
      }
    });
  }

  private drawDots(f: RaceFrame): void {
    const g = this.dotsG;
    g.clear();
    g.fillStyle(this.color('Bone'));
    g.fillRect(MINIMAP_AT.x + f.wireTick.x, MINIMAP_AT.y + f.wireTick.y, 1, f.wireTick.h);
    for (const d of f.dots) {
      const x = MINIMAP_AT.x + d.x;
      const y = MINIMAP_AT.y + d.y;
      const fill = this.color(this.cloth(d.post).fill);
      if (d.yours) {
        g.fillStyle(this.color('Yellow'));
        g.fillRect(x - 2, y - 2, 5, 5);
        g.fillStyle(fill);
        g.fillRect(x - 1, y - 1, 3, 3);
      } else {
        g.fillStyle(fill);
        g.fillRect(x, y, 2, 2);
      }
    }
  }
}
