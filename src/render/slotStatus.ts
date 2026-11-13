import type { Slot } from '../data/raceDaySchema';

// Which slots are drawing a stand-in, for the HUD tag and the console list, and what
// stops a release (P0-3). A slot is a stand-in when data flags it as a placeholder or
// its file did not load at the size data gives.

export type SlotState = 'ok' | 'missing' | 'wrongSize';

// The needed-slot list lives with the data schemas (src/data/raceDaySchema.ts), so the
// loader does not depend on the render layer. Re-exported here for the screens.
export { ERROR_SCREEN_SLOT_IDS, SLOT_IDS, missingNeeded, neededSlotIds, trackSlotId } from '../data/raceDaySchema';
import { missingNeeded } from '../data/raceDaySchema';

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
