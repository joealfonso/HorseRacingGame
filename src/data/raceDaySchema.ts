import { z } from 'zod';
import { INSTRUCTIONS, marked } from './schema';

// Schemas for the race-day screens' data: the palette, the art and audio slot registry,
// each horse's look, and the view values and copy. Like schema.ts, no JSON is imported
// here. None of this reaches the sim: it only changes what is drawn.

const text = z.string()
  .refine((s) => s.trim().length > 0, { error: 'must not be empty or only spaces' })
  .refine((s) => s === s.trim(), { error: 'must not start or end with spaces' });

const positive = z.number().positive();
const whole = z.int({ error: 'must be a whole number' });

// Palette ----------------------------------------------------------------------------

export const paletteSchema = z.strictObject({
  colors: z.array(z.strictObject({
    id: text,
    name: text,
    hex: z.string().regex(/^#[0-9A-F]{6}$/, { error: 'must be #RRGGBB in capitals' }),
  })).min(1),
  // DESIGN.md's silks value bands. Together they are the 18 silks colors.
  silksBands: z.strictObject({ dark: z.array(text), mid: z.array(text), light: z.array(text) }),
  // Recolorable layers are authored in these and swapped in code.
  keyColors: z.strictObject({ outline: text, second: text, third: text }),
}).superRefine((p, ctx) => {
  const seen = new Map<string, number>();
  p.colors.forEach((c, i) => {
    for (const [field, key] of [['id', c.id], ['name', c.name], ['hex', c.hex]] as const) {
      const k = `${field}:${key}`;
      const first = seen.get(k);
      if (first === undefined) seen.set(k, i);
      else ctx.addIssue({ code: 'custom', path: ['colors', i, field], message: `duplicates colors[${first}].${field}` });
    }
  });
  const names = new Set(p.colors.map((c) => c.name));
  for (const band of ['dark', 'mid', 'light'] as const) {
    p.silksBands[band].forEach((n, i) => {
      if (!names.has(n)) ctx.addIssue({ code: 'custom', path: ['silksBands', band, i], message: `"${n}" is not a palette color name` });
    });
  }
  for (const key of ['outline', 'second', 'third'] as const) {
    if (!names.has(p.keyColors[key])) ctx.addIssue({ code: 'custom', path: ['keyColors', key], message: `"${p.keyColors[key]}" is not a palette color name` });
  }
});

// Slots ------------------------------------------------------------------------------

export const SLOT_KINDS = ['art', 'font', 'sfx', 'music'] as const;
// DESIGN.md: <kind>.<area>.<subject>[.<part>][.<variant>], lowercase, dots between
// segments, underscores inside one.
const SLOT_ID = /^(art|font|sfx|music)(\.[a-z0-9]+(_[a-z0-9]+)*){2,4}$/;

const slot = z.strictObject({
  id: z.string().regex(SLOT_ID, { error: 'must look like kind.area.subject[.part][.variant], lowercase, kind one of art, font, sfx, music' }),
  // Relative to the site root (public/ in the repo). Null only for a silent audio placeholder.
  file: z.string().regex(/^assets\/[a-z0-9_/]+\.(png|ogg|mp3|wav)$/, { error: 'must be a path under assets/ ending in .png, .ogg, .mp3 or .wav' }).nullable(),
  frameWidth: whole.positive().optional(),
  frameHeight: whole.positive().optional(),
  frames: whole.positive().optional(),
  // Frames per row of the sheet. Left out, all frames sit in one row.
  columns: whole.positive().optional(),
  // The nose column inside a race frame, for the wire and margins.
  noseX: whole.min(0).optional(),
  // The gate's column that stands on the start line.
  startX: whole.min(0).optional(),
  // Per frame, where the saddlecloth number's 4x6 small-font cell goes inside the frame.
  numberAt: z.array(z.tuple([whole.min(0), whole.min(0)])).optional(),
  recolor: z.boolean().optional(),
  placeholder: z.boolean(),
});
export type Slot = z.infer<typeof slot>;

export const slotsSchema = z.strictObject({ slots: z.array(slot).min(1) }).superRefine((s, ctx) => {
  const seen = new Map<string, number>();
  s.slots.forEach((sl, i) => {
    const first = seen.get(sl.id);
    if (first === undefined) seen.set(sl.id, i);
    else ctx.addIssue({ code: 'custom', path: ['slots', i, 'id'], message: `duplicates slots[${first}].id` });
    const visual = sl.id.startsWith('art.') || sl.id.startsWith('font.');
    if (visual) {
      for (const field of ['frameWidth', 'frameHeight', 'frames'] as const) {
        if (sl[field] === undefined) ctx.addIssue({ code: 'custom', path: ['slots', i, field], message: 'required for an art or font slot' });
      }
      if (sl.file === null) ctx.addIssue({ code: 'custom', path: ['slots', i, 'file'], message: 'an art or font slot needs a file; a missing file draws the checker' });
      if (sl.file !== null && !sl.file.endsWith('.png')) ctx.addIssue({ code: 'custom', path: ['slots', i, 'file'], message: 'an art or font file must be a .png' });
      if (sl.noseX !== undefined && sl.frameWidth !== undefined && sl.noseX >= sl.frameWidth) {
        ctx.addIssue({ code: 'custom', path: ['slots', i, 'noseX'], message: `must be inside the ${sl.frameWidth} px frame` });
      }
      if (sl.startX !== undefined && sl.frameWidth !== undefined && sl.startX >= sl.frameWidth) {
        ctx.addIssue({ code: 'custom', path: ['slots', i, 'startX'], message: `must be inside the ${sl.frameWidth} px frame` });
      }
      if (sl.numberAt !== undefined && sl.frames !== undefined && sl.numberAt.length !== sl.frames) {
        ctx.addIssue({ code: 'custom', path: ['slots', i, 'numberAt'], message: `lists ${sl.numberAt.length} positions for ${sl.frames} frames` });
      }
    } else if (sl.file === null && !sl.placeholder) {
      ctx.addIssue({ code: 'custom', path: ['slots', i, 'placeholder'], message: 'a slot with no file is a placeholder (silence) and must say so' });
    }
  });
});

// Card look --------------------------------------------------------------------------

export const COATS = ['bay', 'dark bay or brown', 'chestnut', 'black'] as const;

// Keyed by horse id. Colors are checked against the palette by the loader.
export const cardLookSchema = z.record(z.string(), z.strictObject({
  coat: z.enum(COATS, { error: `unknown coat, use one of ${COATS.join(', ')} (gray needs an age and roan the markings layer, neither in M1)` }),
  silks: z.strictObject({ body: text, cap: text }),
}));

// Race day ---------------------------------------------------------------------------

const variants = z.array(text).min(1, { error: 'needs at least one line' });
const ordersCopy = (keys: readonly string[]) => z.strictObject(
  Object.fromEntries(keys.filter((k) => k !== 'default').map((k) => [k, text])) as Record<string, typeof text>,
);

export const raceDaySchema = z.strictObject({
  view: z.strictObject({
    pxPerFoot: marked(whole.positive()),
    pxPerLane: marked(whole.positive()),
    hoofBaseY: marked(whole.min(0).max(239)),
    leaderScreenX: marked(whole.min(0).max(255)),
    playerScreenX: marked(whole.min(0).max(255)),
    wireScreenX: marked(whole.min(0).max(255)),
    gateScreenX: marked(whole.min(0).max(255)),
    finalFeetToGo: marked(positive),
    finalBlendSeconds: marked(positive),
    finalCatchUpPxPerSecond: marked(positive),
    farParallaxDivisor: marked(whole.positive()),
    midParallaxDivisor: marked(whole.positive()),
    midZonePadPx: marked(whole.min(0)),
    strideFeet: marked(positive),
    stridePhasePerPost: marked(z.number().min(0).max(1)),
    frameTopFromHoof: marked(whole.min(0)),
    playerArrowDx: marked(whole),
    playerArrowDy: marked(whole),
  }).superRefine((v, ctx) => {
    if (v.gateScreenX.value !== v.leaderScreenX.value) {
      ctx.addIssue({ code: 'custom', path: ['gateScreenX', 'value'], message: `is ${v.gateScreenX.value}; must equal leaderScreenX (${v.leaderScreenX.value}) or the camera jumps when the doors open` });
    }
    if (!(v.playerScreenX.value < v.leaderScreenX.value)) {
      ctx.addIssue({ code: 'custom', path: ['playerScreenX', 'value'], message: 'must be left of leaderScreenX' });
    }
  }),
  playback: z.strictObject({
    speed: marked(positive),
    maxFrameMs: marked(positive),
  }),
  beats: z.strictObject({
    pickSeconds: marked(z.number().min(0)),
    gateStillSeconds: marked(z.number().min(0)),
    wireHoldSeconds: marked(z.number().min(0)),
  }),
  hud: z.strictObject({
    stripHysteresisLengths: marked(z.number().min(0)),
    messageSeconds: marked(positive),
    messageMaxWaitSeconds: marked(z.number().min(0)),
    backInStrideSeconds: marked(z.number().min(0)),
    typeCharsPerSecond: marked(positive),
    typeUntilFurlongsToGo: marked(whole.min(0)),
  }),
  poleBands: marked(z.strictObject({ quarter: text, eighth: text, sixteenth: text })),
  saddlecloths: marked(z.array(z.strictObject({ fill: text, number: text })).min(1)),
  coats: z.strictObject(Object.fromEntries(COATS.map((c) => [c, z.strictObject({ base: text, second: text })])) as
    Record<(typeof COATS)[number], z.ZodObject<{ base: typeof text; second: typeof text }>>),
  copy: z.strictObject({
    pickPrompt: text,
    nextRace: text,
    beforeFirstCall: text,
    leads: text,
    behind: text,
    // From your horse's own finish on (H3b).
    won: text,
    // The winner's margin when it is exactly one length.
    oneLength: text,
    finished: text,
    marginWords: z.strictObject({ nose: text, head: text, neck: text }),
    orders: z.strictObject({
      allDefault: text,
      joiner: z.string().min(1),
      early: ordersCopy(INSTRUCTIONS.early),
      move: ordersCopy(INSTRUCTIONS.move),
      path: ordersCopy(INSTRUCTIONS.path),
    }),
    messages: z.strictObject({
      blocked: text, steadied: text, bumped: text, backInStride: text, asked: text, home: text,
    }),
    calls: z.strictObject({
      gate: variants, off: variants, earlyLeader: variants, firstTimeBy: variants, clubhouseTurn: variants,
      leader: variants, backstretch: variants, farTurn: variants, home: variants, leaderSame: variants,
      leaderNew: variants, wire: variants, winner: variants, photo: variants,
      pace: z.strictObject({ hot: variants, honest: variants, slow: variants }),
    }),
  }),
});

export type Palette = z.infer<typeof paletteSchema>;
export type Slots = z.infer<typeof slotsSchema>;
export type CardLook = z.infer<typeof cardLookSchema>;
export type RaceDay = z.infer<typeof raceDaySchema>;
export type CallKey = Exclude<keyof RaceDay['copy']['calls'], 'pace'>;
