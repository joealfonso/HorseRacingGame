import type { Slot } from '../data/raceDaySchema';

// Which slots are drawing a stand-in, for the HUD tag and the console list, and what
// stops a release (P0-3). A slot is a stand-in when data flags it as a placeholder or
// its file did not load at the size data gives.

export type SlotState = 'ok' | 'missing' | 'wrongSize';

// The slots the race-day screens draw. The scenes take their ids from here, the loader
// checks at boot that each one is in slots.json, and so does the release check.
export const SLOT_IDS = {
  fontMain: 'font.ui.main',
  fontSmall: 'font.ui.small',
  frameBox: 'art.ui.frame.box',
  placeholderTag: 'art.ui.placeholder_tag',
  minimap: 'art.ui.minimap.track',
  markerPlayer: 'art.race.marker.player',
  markerEdge: 'art.race.marker.edge',
  gate: 'art.race.gate',
  poleFurlong: 'art.race.pole.furlong',
  poleWire: 'art.race.pole.wire',
  railFar: 'art.race.rail.far',
  railNear: 'art.race.rail.near',
  hills: 'art.race.bg.far.hills',
  grandstand: 'art.race.bg.mid.grandstand',
  horse: {
    body: { gallop: 'art.race.horse.body.gallop', stand: 'art.race.horse.body.stand' },
    tack: { gallop: 'art.race.horse.tack.gallop', stand: 'art.race.horse.tack.stand' },
    jacket: { gallop: 'art.race.jockey.jacket.gallop', stand: 'art.race.jockey.jacket.stand' },
    cap: { gallop: 'art.race.jockey.cap.gallop', stand: 'art.race.jockey.cap.stand' },
  },
} as const;

/** The track surface slot for a race's surface and going. */
export const trackSlotId = (surface: string, going: string): string => `art.track.${surface}.${going}`;

/** The slots the error screen draws. It cannot trust slots.json, so it finds them by id. */
export const ERROR_SCREEN_SLOT_IDS: readonly string[] = [SLOT_IDS.fontMain, SLOT_IDS.fontSmall, SLOT_IDS.frameBox];

/** Every slot id the race-day screens need, the track slot for this race included. */
export function neededSlotIds(race?: { surface: string; going: string }): string[] {
  const { horse, ...flat } = SLOT_IDS;
  const ids: string[] = [...Object.values(flat), ...Object.values(horse).flatMap((p) => [p.gallop, p.stand])];
  if (race) ids.push(trackSlotId(race.surface, race.going));
  return ids;
}

/** Needed ids that slots.json does not list. */
export const missingNeeded = (slots: readonly Slot[], needed: readonly string[]): string[] =>
  needed.filter((id) => !slots.some((s) => s.id === id));

export interface SheetSize { width: number; height: number }

/** The size a slot's file must be: frames in rows of `columns` (one row when unset). */
export function sheetSize(slot: Slot): SheetSize | null {
  if (slot.frameWidth === undefined || slot.frameHeight === undefined || slot.frames === undefined) return null;
  const columns = Math.min(slot.columns ?? slot.frames, slot.frames);
  return { width: slot.frameWidth * columns, height: slot.frameHeight * Math.ceil(slot.frames / columns) };
}

export function slotState(slot: Slot, loaded: SheetSize | null): SlotState {
  if (loaded === null) return 'missing';
  const want = sheetSize(slot);
  return want && (want.width !== loaded.width || want.height !== loaded.height) ? 'wrongSize' : 'ok';
}

export interface StandIn { id: string; reason: string }

/** The slots on this screen drawing a stand-in, in the order given. */
export function standIns(slots: readonly Slot[], states: ReadonlyMap<string, SlotState>, used: readonly string[]): StandIn[] {
  const out: StandIn[] = [];
  for (const id of used) {
    const slot = slots.find((s) => s.id === id);
    if (!slot) { out.push({ id, reason: 'not in src/data/slots.json' }); continue; }
    const state = states.get(id) ?? 'missing';
    if (slot.file !== null && state === 'missing') out.push({ id, reason: `no file at public/${slot.file}` });
    else if (state === 'wrongSize') {
      const s = sheetSize(slot)!;
      out.push({ id, reason: `public/${slot.file} is not ${s.width}x${s.height}` });
    } else if (slot.placeholder) out.push({ id, reason: 'marked placeholder in src/data/slots.json' });
  }
  return out;
}

/** The tag shows while any stand-in is drawn (P0-3). */
export const showPlaceholderTag = (drawn: readonly StandIn[]): boolean => drawn.length > 0;
export const PLACEHOLDER_TAG_AT = { x: 248, y: 0 } as const;

/**
 * Release check: every slot must be final. `sizeOf` returns a file's pixel size, or null
 * when the file does not exist (audio files return their presence as any non-null size).
 */
export function shipProblems(slots: readonly Slot[], sizeOf: (file: string) => SheetSize | null, needed: readonly string[] = []): string[] {
  const out: string[] = missingNeeded(slots, needed).map((id) => `${id}: needed by the race-day screens but not in src/data/slots.json`);
  for (const slot of slots) {
    if (slot.placeholder) out.push(`${slot.id}: marked placeholder in src/data/slots.json`);
    if (slot.file === null) {
      if (!slot.placeholder) out.push(`${slot.id}: has no file`);
      continue;
    }
    const size = sizeOf(slot.file);
    if (size === null) { out.push(`${slot.id}: no file at public/${slot.file}`); continue; }
    const want = sheetSize(slot);
    if (want && (want.width !== size.width || want.height !== size.height)) {
      out.push(`${slot.id}: public/${slot.file} is ${size.width}x${size.height}, data says ${want.width}x${want.height}`);
    }
  }
  return out;
}
