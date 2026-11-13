import { existsSync, openSync, readSync, closeSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { slotsSchema } from '../src/data/raceDaySchema';
import { neededSlotIds, shipProblems, type SheetSize } from '../src/render/slotStatus';

// `npm run ship:check`: fails while any slot is a placeholder, its file is missing or
// the wrong size, or a slot the race-day screens need is not in slots.json. The normal build and CI do not run it, so stand-ins can live on main
// during M1. `npm run build:release` runs it before building.

const ROOT = new URL('..', import.meta.url).pathname;

/** Width and height from a PNG's IHDR chunk, or null when the file is missing. Non-PNG files report 1x1. */
function sizeOf(file: string): SheetSize | null {
  const path = join(ROOT, 'public', file);
  if (!existsSync(path)) return null;
  if (!file.endsWith('.png')) return { width: 1, height: 1 };
  const fd = openSync(path, 'r');
  try {
    const head = Buffer.alloc(24);
    readSync(fd, head, 0, 24, 0);
    return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
  } finally {
    closeSync(fd);
  }
}

export function main(): number {
  const raw = JSON.parse(readFileSync(join(ROOT, 'src/data/slots.json'), 'utf8'));
  const parsed = slotsSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('src/data/slots.json does not validate:');
    for (const i of parsed.error.issues) console.error(`  ${i.path.join('.')}: ${i.message}`);
    return 1;
  }
  // The race's track slot is needed too. Read as plain JSON, so a broken race file
  // fails here only by leaving its slot out; the boot check names it.
  const racePath = join(ROOT, 'src/data/race.json');
  let race: { surface: string; going: string } | undefined;
  if (existsSync(racePath)) {
    const r = JSON.parse(readFileSync(racePath, 'utf8'));
    if (typeof r?.surface === 'string' && typeof r?.going === 'string') race = r;
  }
  const problems = shipProblems(parsed.data.slots, sizeOf, neededSlotIds(race));
  if (problems.length > 0) {
    console.error(`Not shippable: ${problems.length} slot problem${problems.length === 1 ? '' : 's'}.`);
    for (const p of problems) console.error(`  ${p}`);
    return 1;
  }
  console.log(`All ${parsed.data.slots.length} slots are final art.`);
  return 0;
}
