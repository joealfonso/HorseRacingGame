import type { Hub } from '../data/hubSchema';
import type { RaceDay } from '../data/raceDaySchema';
import type { IdleClock } from './hubScreen';
import { idleAt } from './hubScreen';
import type { PageRect } from './page';
import { SLOT_IDS } from './slotStatus';

// The track's still picture and its sprites (DESIGN "The track (between races)"), as a list
// of images in draw order: where each part, tile and person goes, which frame it shows, and
// any flip, crop or exact palette swap. The placements are the accepted mock's
// (scripts/art/hub_mock.mjs), so the scene draws docs/mocks/track-hub/a-windows.png pixel for
// pixel. Art layout lives here, as PROGRAM_PAGE does for the program; timings live in data.

export const HUB_SLOTS = {
  standUpper: 'art.hub.stand.upper',
  standFacade: 'art.hub.stand.facade',
  signPlate: 'art.hub.sign.plate',
  toteBoard: 'art.hub.tote.board',
  paddockGate: 'art.hub.paddock.gate',
  cart: 'art.hub.cart',
  apron: 'art.hub.apron',
  railProgram: 'art.hub.rail.program',
  corner: 'art.ui.focus.corner',
  regular: 'art.hub.regular',
  clerk: 'art.hub.clerk',
  bettor: 'art.hub.bettor.back',
  fan: 'art.hub.fan.back',
  bugler: 'art.hub.bugler',
  vendor: 'art.hub.vendor',
} as const;

/** Every slot the track draws, for the placeholder tag. */
export const HUB_SLOT_IDS: readonly string[] = [
  ...Object.values(HUB_SLOTS),
  SLOT_IDS.crowd, SLOT_IDS.infield, SLOT_IDS.flag, SLOT_IDS.railFar, SLOT_IDS.railNear, 'art.track.dirt.fast',
  SLOT_IDS.frameBox, SLOT_IDS.cursor, SLOT_IDS.fontMain, SLOT_IDS.fontSmall, SLOT_IDS.placeholderTag,
];

export interface HubImage {
  slot: string;
  frame: number;
  x: number;
  y: number;
  flipX?: boolean;
  /** Show only the top-left w x h of the frame. */
  crop?: { w: number; h: number };
  /** Exact palette swaps (Art.swap): DESIGN's skin and jacket recolors. */
  swaps?: readonly (readonly [string, string])[];
}

const W = 256;
const odd = (x: number) => Math.floor(x / 16) % 2 === 1;

/** Fills under the picture: the Ink desk behind the box's rounded corners, the sky for the race, the Grass under the far rail. */
export function hubFills(sky: readonly PageRect[]): PageRect[] {
  return [
    { x: 0, y: 176, w: W, h: 64, color: 'Ink' },
    ...sky,
    { x: 112, y: 88, w: 144, h: 8, color: 'Grass' },
  ];
}

/** The still picture: infield, rails, dirt, apron, then the stand, board, sign plate, gate and cart. */
export function hubBackdrop(): HubImage[] {
  const out: HubImage[] = [];
  // The infield's landmark tile at x91 puts the flag in the gap at x115-122; the stand covers
  // its left columns. Then its repeating slice (columns 0-15) from x123.
  out.push({ slot: SLOT_IDS.infield, frame: 0, x: 91, y: 56 });
  for (let x = 123; x < W; x += 16) out.push({ slot: SLOT_IDS.infield, frame: 0, x, y: 56, crop: { w: Math.min(16, W - x), h: 32 } });
  for (let x = 112; x < W; x += 16) out.push({ slot: SLOT_IDS.railFar, frame: 0, x, y: 88, flipX: odd(x) });
  for (let y = 96; y < 118; y += 16) {
    for (let x = 112; x < W; x += 16) out.push({ slot: 'art.track.dirt.fast', frame: 0, x, y, crop: { w: 16, h: Math.min(16, 118 - y) } });
  }
  for (let x = 112; x < W; x += 16) out.push({ slot: SLOT_IDS.railNear, frame: 0, x, y: 118, flipX: odd(x), crop: { w: 16, h: 4 } });
  for (let y = 122; y < 176; y += 16) {
    for (let x = 112; x < W; x += 16) out.push({ slot: HUB_SLOTS.apron, frame: 0, x, y, crop: { w: 16, h: Math.min(16, 176 - y) } });
  }
  for (let y = 152; y < 176; y += 16) {
    for (let x = 0; x < 112; x += 16) out.push({ slot: HUB_SLOTS.apron, frame: 0, x, y, crop: { w: 16, h: Math.min(16, 176 - y) } });
  }
  out.push(
    { slot: HUB_SLOTS.toteBoard, frame: 0, x: 124, y: 32 },
    { slot: HUB_SLOTS.standUpper, frame: 0, x: 0, y: 24 },
    { slot: HUB_SLOTS.standFacade, frame: 0, x: 0, y: 96 },
    { slot: HUB_SLOTS.signPlate, frame: 0, x: 24, y: 100 },
    { slot: HUB_SLOTS.paddockGate, frame: 0, x: 112, y: 140 },
    { slot: HUB_SLOTS.cart, frame: 0, x: 184, y: 144 },
  );
  return out;
}

/** The people, by the id hub.json's idle order uses, in draw order. The bettor has no idle. */
export const HUB_PEOPLE: readonly { id: string; slot: string; x: number; y: number; flipX?: boolean; swaps?: readonly (readonly [string, string])[] }[] = [
  { id: 'regular', slot: HUB_SLOTS.regular, x: 56, y: 48 },
  { id: 'clerk1', slot: HUB_SLOTS.clerk, x: 16, y: 120 },
  { id: 'clerk2', slot: HUB_SLOTS.clerk, x: 52, y: 120, swaps: [['Peach', 'Cocoa']] },
  { id: 'clerk3', slot: HUB_SLOTS.clerk, x: 88, y: 120, swaps: [['Peach', 'Tan']] },
  { id: 'bettor', slot: HUB_SLOTS.bettor, x: 36, y: 128 },
  { id: 'program', slot: HUB_SLOTS.railProgram, x: 192, y: 115 },
  { id: 'fanA', slot: HUB_SLOTS.fan, x: 124, y: 108 },
  { id: 'fanB', slot: HUB_SLOTS.fan, x: 140, y: 108, flipX: true, swaps: [['Tan', 'Peach'], ['Royal', 'Orange']] },
  { id: 'fanC', slot: HUB_SLOTS.fan, x: 228, y: 108, swaps: [['Tan', 'Cocoa'], ['Royal', 'Emerald']] },
  { id: 'bugler', slot: HUB_SLOTS.bugler, x: 128, y: 146 },
  { id: 'vendor', slot: HUB_SLOTS.vendor, x: 216, y: 144 },
];

/** The infield flag's 8x8 frame, in the gap between the stand and the board. */
export const HUB_FLAG_AT = { x: 115, y: 59 } as const;

/**
 * The moving layer at `seconds`: the crowd strip on the stand's shade, the infield flag, and
 * the people, each on frame 0 (rest) unless it is their idle turn. Reduced motion: all still.
 */
export function hubSprites(hub: Hub, rd: RaceDay, idle: IdleClock, seconds: number, reducedMotion: boolean): HubImage[] {
  const a = rd.ambient;
  const t = reducedMotion ? 0 : Math.max(0, seconds);
  const crowdSwaps = Math.floor(t * a.crowdSwapsPerSecond.value);
  const out: HubImage[] = [];
  // Crowd tile k (x = 16k) shows frame (swaps + k) mod 2, odd tiles flipped, as in the race view.
  for (let x = 0; x < 112; x += 16) {
    const k = x / 16;
    out.push({ slot: SLOT_IDS.crowd, frame: (crowdSwaps + k) % 2, x, y: 32, flipX: k % 2 === 1 });
  }
  out.push({ slot: SLOT_IDS.flag, frame: Math.floor(t * a.flagSwapsPerSecond.value) % 2, x: HUB_FLAG_AT.x, y: HUB_FLAG_AT.y });
  const playing = idleAt(hub, idle, seconds, reducedMotion);
  for (const p of HUB_PEOPLE) {
    const frame = playing !== null && playing.person === p.id ? playing.frame : 0;
    out.push({ slot: p.slot, frame, x: p.x, y: p.y, ...(p.flipX ? { flipX: true } : {}), ...(p.swaps ? { swaps: p.swaps } : {}) });
  }
  return out;
}
