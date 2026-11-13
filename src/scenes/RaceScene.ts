import Phaser from 'phaser';
import type { RaceDayData } from '../data/raceDayLoad';
import type { GameData } from '../data/schema';
import { rgbOf } from '../render/colors';
import { simErrorLines } from '../render/format';
import { makeRaceSetup, playerView, raceFrame, type PlayerView, type RaceFrame, type RaceSetup } from '../render/raceFrame';
import { nextRace, seedFor, type Session } from '../render/session';
import { PLACEHOLDER_TAG_AT, SLOT_IDS, neededSlotIds, showPlaceholderTag, standIns, trackSlotId } from '../render/slotStatus';
import { advance } from '../render/timeline';
import { railTiles, type PoleKind } from '../render/view';
import { runRace } from '../sim/runRace';
import type { RaceResult } from '../sim/result';
import { Art, type ArtInfo } from './art';

// P0, the placeholder race (spec section 8): one race from the gate to the wire, played
// from the sim's replay, with the HUD. Every position, word and color comes from
// src/render/raceFrame.ts; this file only places sprites and text where it says.

export interface RaceData { game: GameData; rd: RaceDayData; art: ArtInfo; session: Session }

const LAYERS = ['body', 'tack', 'jacket', 'cap'] as const;
const SLOT = SLOT_IDS.horse;

const DEPTH = { back: 0, far: 10, mid: 20, track: 30, poles: 35, gate: 40, horses: 100, markers: 400, hud: 500, hudTop: 510 } as const;
const STRIP = { x: 8, y: 168, w: 12, h: 10, gap: 2 } as const;
// The strip's Yellow arrow: 4 rows from y179, 1 px clear of the box above and the name below.
const STRIP_ARROW_Y = 179;
const LINES = { name: 184, position: 194, orders: 204 } as const;
const RAIL_Y = { far: 84, near: 152 } as const;
const MINIMAP_AT = { x: 160, y: 168 } as const;

interface HorseObjects {
  keys: Record<(typeof LAYERS)[number], { gallop: string; stand: string }>;
  layers: Phaser.GameObjects.Image[];
  number: Phaser.GameObjects.Image;
}

export class RaceScene extends Phaser.Scene {
  private data0!: RaceData;
  private art!: Art;
  private setup!: RaceSetup;
  private me!: PlayerView;
  private session!: Session;
  private p = 0;
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
  private texts!: Record<'call' | 'name' | 'position' | 'orders' | 'clock' | 'message', Phaser.GameObjects.BitmapText>;

  constructor() {
    super('race');
  }

  create(data: RaceData): void {
    this.data0 = data;
    this.session = data.session;
    this.p = 0;
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
    });
    this.me = playerView(this.setup, this.session.pickPost);

    this.buildWorld();
    this.buildHorses(result);
    this.buildHud();
    this.bindKeys();
    this.draw(raceFrame(this.setup, this.me, this.p));
  }

  update(_time: number, delta: number): void {
    if (!this.setup) return;
    this.p = advance(this.p, delta, this.data0.rd.raceDay.playback.maxFrameMs.value);
    this.draw(raceFrame(this.setup, this.me, this.p));
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
      this.stands.push(this.add.image(0, 56, SLOT_IDS.grandstand, '0').setOrigin(0, 0).setDepth(DEPTH.mid).setVisible(false));
    }
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
      const pair = (layer: keyof typeof SLOT, second: string, third: string) => ({
        gallop: this.art.recolor(SLOT[layer].gallop, second, third),
        stand: this.art.recolor(SLOT[layer].stand, second, third),
      });
      const keys = {
        body: pair('body', coat.base, coat.second),
        tack: pair('tack', cloth.fill, cloth.number),
        jacket: pair('jacket', look.silks.body, look.silks.body),
        cap: pair('cap', look.silks.cap, look.silks.cap),
      };
      const layers = LAYERS.map((l) => this.add.image(0, 0, keys[l].stand, '0').setOrigin(0, 0));
      const number = this.art.glyph(0, 0, String(h.post % 10), cloth.number);
      this.horses.set(h.id, { keys, layers, number });
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
    this.add.image(MINIMAP_AT.x, MINIMAP_AT.y, SLOT_IDS.minimap, '0').setOrigin(0, 0).setDepth(DEPTH.hud + 1);
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
    };
  }

  private bindKeys(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    const onKey = (e: KeyboardEvent) => {
      const digit = /^(Digit|Numpad)([1-9])$/.exec(e.code);
      const phase = raceFrame(this.setup, this.me, this.p).phase;
      if (digit && phase === 'gate') {
        const post = Number(digit[2]);
        if (this.setup.result.inputs.card.horses.some((h) => h.post === post)) {
          this.session = { ...this.session, pickPost: post };
          this.me = playerView(this.setup, post);
        }
      } else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && phase === 'done') {
        this.scene.restart({ ...this.data0, session: nextRace(this.session) });
      }
    };
    kb.on('keydown', onKey);
    this.events.once('shutdown', () => kb.off('keydown', onKey));
  }

  private setText(key: keyof RaceScene['texts'], value: string): void {
    const t = this.texts[key];
    if (t.text !== value) t.setText(value);
  }

  private draw(f: RaceFrame): void {
    this.hills.tilePositionX = f.farScroll;
    this.dirt.tilePositionX = f.cam;
    for (const side of ['far', 'near'] as const) {
      const pool = this.rails[side];
      const tiles = railTiles(f.cam, this.art.slot(side === 'far' ? SLOT_IDS.railFar : SLOT_IDS.railNear).frameWidth ?? 16);
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

    const tack = this.art.slot(SLOT.tack.gallop).numberAt;
    const tackStand = this.art.slot(SLOT.tack.stand).numberAt;
    f.horses.forEach((s, rank) => {
      const o = this.horses.get(s.id);
      if (!o) return;
      const pose = s.stand ? 'stand' : 'gallop';
      LAYERS.forEach((layer, i) => {
        const img = o.layers[i];
        const key = o.keys[layer][pose];
        if (img.texture.key !== key) img.setTexture(key, String(s.frame));
        else img.setFrame(String(s.frame));
        img.setPosition(s.x, s.y).setDepth(DEPTH.horses + rank * 10 + i);
      });
      const at = (s.stand ? tackStand : tack)?.[s.frame] ?? [10, 10];
      o.number.setPosition(s.x + at[0], s.y + at[1]).setDepth(DEPTH.horses + rank * 10 + LAYERS.length);
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
    this.texts.clock.setX(248 - 8 * f.clock.length);
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
