import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { neededSlotIds } from '../src/render/slotStatus';

// P0-3: the production build fails when any slot is a placeholder, a file is missing, or a
// PNG's header size differs from the data; it passes when none are. The real command is
// run as a child process in a temporary copy of the project layout under the OS temp
// folder: the real scripts and source files are copied in, with fixture slots and files.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COPIED = [
  'scripts/shipCheck.mjs',
  'scripts/shipCheck.ts',
  'src/data/raceDaySchema.ts',
  'src/data/schema.ts',
  'src/render/slotStatus.ts',
];

let base: string;
beforeAll(() => { base = mkdtempSync(join(tmpdir(), 'ship-check-test-')); });
afterAll(() => { rmSync(base, { recursive: true, force: true }); });

/** The first 33 bytes of a PNG: signature, then an IHDR chunk with this size. The check reads only the header. */
function pngHeader(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  b[24] = 8; // bit depth
  b[25] = 6; // RGBA
  return b;
}

interface Fixture {
  slots: object[];
  files: Record<string, Buffer | null>;
}

let counter = 0;
function run(fx: Fixture): { code: number | null; out: string; err: string } {
  const dir = join(base, `case-${counter++}`);
  for (const f of COPIED) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    copyFileSync(join(ROOT, f), join(dir, f));
  }
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'));
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  writeFileSync(join(dir, 'src/data/slots.json'), JSON.stringify({ slots: fx.slots }));
  writeFileSync(join(dir, 'src/data/race.json'), JSON.stringify({ surface: 'dirt', going: 'fast' }));
  for (const [file, content] of Object.entries(fx.files)) {
    if (content === null) continue;
    mkdirSync(dirname(join(dir, 'public', file)), { recursive: true });
    writeFileSync(join(dir, 'public', file), content);
  }
  const r = spawnSync(process.execPath, [join(dir, 'scripts/shipCheck.mjs')], { cwd: dir, encoding: 'utf8', timeout: 60_000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

// Round two: the release check also refuses a slots.json that lacks a slot the screens
// need, so every fixture now holds every needed slot (8x8, one frame, a PNG of that size
// in public/), and the tests change one thing at a time from there. The fixture race is
// dirt on fast going, so art.track.dirt.fast is needed too.
const NEEDED = neededSlotIds({ surface: 'dirt', going: 'fast' });
const fileOf = (id: string) => `assets/${id.split('.').join('/')}.png`;
const slotOf = (id: string, over: object = {}) => ({ id, file: fileOf(id), frameWidth: 8, frameHeight: 8, frames: 1, placeholder: false, ...over });
const good = (): Fixture => ({
  slots: NEEDED.map((id) => slotOf(id)),
  files: Object.fromEntries(NEEDED.map((id) => [fileOf(id), pngHeader(8, 8)])),
});
const idx = (fx: Fixture, id: string) => fx.slots.findIndex((x) => (x as { id: string }).id === id);
const GALLOP = 'art.race.horse.body.gallop';
const FONT = 'font.ui.small';

describe('P0-3: npm run ship:check', () => {
  it('passes when no slot is a placeholder and every file is there at the size the data gives', () => {
    const r = run(good());
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    expect(r.out).toContain(`All ${NEEDED.length} slots`);
  });

  it('a sound file that is present passes', () => {
    const fx = good();
    fx.slots.push({ id: 'sfx.race.gate_open', file: 'assets/sfx/race/gate_open.ogg', placeholder: false });
    fx.files['assets/sfx/race/gate_open.ogg'] = Buffer.from('OggS');
    const r = run(fx);
    expect(r.code).toBe(0);
    expect(r.out).toContain(`All ${NEEDED.length + 1} slots`);
  });

  it('fails when a slot is flagged placeholder, naming the slot', () => {
    const fx = good();
    fx.slots[idx(fx, GALLOP)] = slotOf(GALLOP, { placeholder: true });
    const r = run(fx);
    expect(r.code).toBe(1);
    expect(r.err).toContain('art.race.horse.body.gallop');
    expect(r.err).toMatch(/placeholder/);
  });

  it('fails when a silent sound slot is still a placeholder', () => {
    const fx = good();
    fx.slots.push({ id: 'sfx.photo.shutter', file: null, placeholder: true });
    const r = run(fx);
    expect(r.code).toBe(1);
    expect(r.err).toContain('sfx.photo.shutter');
  });

  it('fails when a file is missing, naming the slot and the path', () => {
    const fx = good();
    fx.files[fileOf('art.ui.frame.box')] = null;
    const r = run(fx);
    expect(r.code).toBe(1);
    expect(r.err).toContain('art.ui.frame.box');
    expect(r.err).toContain('public/assets/art/ui/frame/box.png');
  });

  it('fails when a sound file is missing', () => {
    const fx = good();
    fx.slots.push({ id: 'sfx.race.gate_open', file: 'assets/sfx/race/gate_open.ogg', placeholder: false });
    const r = run(fx);
    expect(r.code).toBe(1);
    expect(r.err).toContain('sfx.race.gate_open');
  });

  it.each([
    ['one pixel too tall', 8, 9],
    ['one pixel too wide', 9, 8],
    ['half the width', 4, 8],
    ['a square twice over', 16, 16],
  ])('fails when the PNG header size differs from the data: %s', (_n, w, h) => {
    const fx = good();
    fx.files[fileOf(GALLOP)] = pngHeader(w, h);
    const r = run(fx);
    expect(r.code).toBe(1);
    expect(r.err).toContain(GALLOP);
    expect(r.err).toContain(`${w}x${h}`);
    expect(r.err).toContain('8x8');
  });

  it('a sheet laid out in rows is checked at its rows: 16 frames in 16 columns is 64x6, not 4x96', () => {
    const fx = good();
    fx.slots[idx(fx, FONT)] = slotOf(FONT, { frameWidth: 4, frameHeight: 6, frames: 16, columns: 16 });
    fx.files[fileOf(FONT)] = pngHeader(64, 6);
    expect(run(fx).code).toBe(0);
    fx.files[fileOf(FONT)] = pngHeader(4, 96);
    expect(run(fx).code).toBe(1);
  });

  it('lists every problem at once, and counts them', () => {
    const fx = good();
    fx.slots[idx(fx, 'art.ui.frame.box')] = slotOf('art.ui.frame.box', { placeholder: true });
    fx.files[fileOf(GALLOP)] = pngHeader(1, 1);
    fx.files[fileOf(FONT)] = null;
    const r = run(fx);
    expect(r.code).toBe(1);
    expect(r.err).toContain('3 slot problems');
    for (const id of ['art.ui.frame.box', GALLOP, FONT]) expect(r.err).toContain(id);
  });

  it('a slots file that does not validate fails, naming the file', () => {
    const fx = good();
    fx.slots.push({ id: 'Bad Id', file: null, placeholder: true });
    const r = run(fx);
    expect(r.code).toBe(1);
    expect(r.err).toContain('src/data/slots.json');
  });

  it('a file that is not a PNG at all is not trusted: a text file in place of a png fails', () => {
    const fx = good();
    fx.files[fileOf('art.ui.frame.box')] = Buffer.from('<html>not an image, the dev server page</html>');
    expect(run(fx).code).toBe(1);
  });

  // Round two, new: the release check fails when a slot the screens need is not in slots.json.
  it.each(['art.race.gate', 'font.ui.main', 'art.race.horse.tack.gallop', 'art.track.dirt.fast', 'art.ui.minimap.track'])(
    'fails when the needed slot %s is not in slots.json, and names it', (id) => {
      const fx = good();
      fx.slots.splice(idx(fx, id), 1);
      const r = run(fx);
      expect(r.code).toBe(1);
      expect(r.err).toContain(id);
      expect(r.err).toMatch(/needed/);
      expect(r.err).toContain('1 slot problem.');
    });

  it('names every missing needed slot, not only the first', () => {
    const fx = good();
    for (const id of ['art.race.gate', 'art.race.rail.far', 'art.race.pole.wire']) fx.slots.splice(idx(fx, id), 1);
    const r = run(fx);
    expect(r.code).toBe(1);
    for (const id of ['art.race.gate', 'art.race.rail.far', 'art.race.pole.wire']) expect(r.err).toContain(id);
    expect(r.err).toContain('3 slot problems');
  });

  it('a slots.json with more than the needed slots still passes when all are final', () => {
    const fx = good();
    fx.slots.push(slotOf('art.race.extra.thing'));
    fx.files[fileOf('art.race.extra.thing')] = pngHeader(8, 8);
    expect(run(fx).code).toBe(0);
  });
});
