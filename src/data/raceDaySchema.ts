import { z } from 'zod';
import { GOINGS_BY_SURFACE, INSTRUCTIONS, RUNNING_STYLES, SURFACES, marked } from './schema';

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

// The slots the race-day screens draw. The scenes take their ids from here, the loader
// checks at boot that each one is in slots.json, and so does the release check.
export const SLOT_IDS = {
  fontMain: 'font.ui.main',
  fontSmall: 'font.ui.small',
  frameBox: 'art.ui.frame.box',
  cursor: 'art.ui.cursor.horseshoe',
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
  crowd: 'art.race.bg.mid.crowd',
  infield: 'art.race.bg.mid.infield',
  flag: 'art.race.ambient.flag',
  // Step 3, the photo finish: the strip-camera background behind the horses.
  photoStreaks: 'art.photo.bg.streaks',
  // Step 4, the result screen: your marker on the order of finish.
  markerYours: 'art.ui.marker.yours',
  // Step 5, the Orders screen's paddock: the trainer's 2-frame coffee idle and the ground tile.
  paddockTrainer: 'art.paddock.trainer',
  paddockGround: 'art.paddock.ground',
  paddockRail: 'art.paddock.rail',
  // The program pages: the pencil tick on last race's pick (DESIGN Program pages).
  markPick: 'art.ui.mark.pick',
  horse: {
    body: { gallop: 'art.race.horse.body.gallop', stand: 'art.race.horse.body.stand', walk: 'art.race.horse.body.walk' },
    tack: { gallop: 'art.race.horse.tack.gallop', stand: 'art.race.horse.tack.stand', walk: 'art.race.horse.tack.walk' },
    jacket: {
      gallop: 'art.race.jockey.jacket.gallop', stand: 'art.race.jockey.jacket.stand',
      walk: 'art.race.jockey.jacket.walk', winner: 'art.race.jockey.jacket.winner',
    },
    cap: {
      gallop: 'art.race.jockey.cap.gallop', stand: 'art.race.jockey.cap.stand',
      walk: 'art.race.jockey.cap.walk', winner: 'art.race.jockey.cap.winner',
    },
  },
} as const;

/**
 * The photo finish's crop is 88 rows tall and puts lanes 8 rows apart (DESIGN, Race view).
 * Here so the loader can check that the widest lane block fits; src/render/photo.ts uses them.
 */
export const PHOTO_CROP_ROWS = 88;
export const PHOTO_LANE_ROWS = 8;

/** The track surface slot for a race's surface and going. */
export const trackSlotId = (surface: string, going: string): string => `art.track.${surface}.${going}`;

/** The slots the error screen draws. It cannot trust slots.json, so it finds them by id. */
export const ERROR_SCREEN_SLOT_IDS: readonly string[] = [SLOT_IDS.fontMain, SLOT_IDS.fontSmall, SLOT_IDS.frameBox];

/** Every slot id the race-day screens need, the track slot for this race included. */
export function neededSlotIds(race?: { surface: string; going: string }): string[] {
  const { horse, ...flat } = SLOT_IDS;
  const ids: string[] = [...Object.values(flat), ...Object.values(horse).flatMap((poses) => Object.values(poses) as string[])];
  if (race) ids.push(trackSlotId(race.surface, race.going));
  return ids;
}

/** Needed ids that a slot list does not have. */
export const missingNeeded = (slots: readonly { id: string }[], needed: readonly string[]): string[] =>
  needed.filter((id) => !slots.some((s) => s.id === id));

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
  // Screen row of a mid-layer strip's top (the crowd over the grandstand).
  atY: whole.min(0).max(239).optional(),
  // Top-left of this sprite inside its host tile (the flag on the infield tile).
  attachAt: z.tuple([whole.min(0), whole.min(0)]).optional(),
  // Columns [x, width] of a tile that repeat without its one-off detail (the infield's
  // pole-free lawn), to fill a zone around the one full tile.
  fillSlice: z.tuple([whole.min(0), whole.positive()]).optional(),
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

/** The card's blurb line: 28 characters (spec 11, from data). */
export const BLURB_CHARS = 28;

export const COATS = ['bay', 'dark bay or brown', 'chestnut', 'black'] as const;

// Keyed by horse id. Colors are checked against the palette by the loader.
export const cardLookSchema = z.record(z.string(), z.strictObject({
  coat: z.enum(COATS, { error: `unknown coat, use one of ${COATS.join(', ')} (gray needs an age and roan the markings layer, neither in M1)` }),
  silks: z.strictObject({ body: text, cap: text }),
  // One line of character on the card (spec 4.1). Left out, the line is blank.
  blurb: text.max(BLURB_CHARS, { error: `must be ${BLURB_CHARS} characters or fewer` }).optional(),
}));

// Race day ---------------------------------------------------------------------------

const variants = z.array(text).min(1, { error: 'needs at least one line' });
const ordersCopy = (keys: readonly string[]) => z.strictObject(
  Object.fromEntries(keys.filter((k) => k !== 'default').map((k) => [k, text])) as Record<string, typeof text>,
);
// One string per value of an order slot, the default included, keyed by INSTRUCTIONS.
const everyValue = (keys: readonly string[]) => z.strictObject(
  Object.fromEntries(keys.map((k) => [k, text])) as Record<string, typeof text>,
);
const byKeys = (keys: readonly string[]) => z.strictObject(Object.fromEntries(keys.map((k) => [k, text])) as Record<string, typeof text>);
// A highlighter band: columns x0-x1, `rows` tall, its rows in four groups whose ends step in by these px.
const bandShape = z.strictObject({
  x0: whole.min(0).max(255),
  x1: whole.min(0).max(255),
  rows: whole.min(4),
  leftSteps: z.array(whole.min(0)).length(4),
  rightSteps: z.array(whole.min(0)).length(4),
}).refine((b) => b.x0 + Math.max(...b.leftSteps) < b.x1 - Math.max(...b.rightSteps), { error: 'the band must keep at least one column between its chiseled ends' });
const ALL_GOINGS = [...new Set(Object.values(GOINGS_BY_SURFACE).flat())];

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
    // Hold Space (spec 3.4).
    fastSpeed: marked(positive),
    maxFrameMs: marked(positive),
  }),
  // The program pages (DESIGN Program pages): the highlighter band's shape on a program
  // entry and on your Result row, and the 2-frame swipe on a pick.
  program: z.strictObject({
    entryBand: marked(bandShape),
    resultBand: marked(bandShape),
    swipeHalfX1: marked(whole.min(0).max(255)),
    swipeFrame1Seconds: marked(positive),
    swipeFrame2Seconds: marked(positive),
  }),
  // Spec 5: a held arrow on the card or Orders repeats after repeatDelayMs, every repeatEveryMs.
  menus: z.strictObject({
    repeatDelayMs: marked(positive),
    repeatEveryMs: marked(positive),
  }),
  // The Orders screen's paddock strip (spec 4.2): the 16x16 tile slot on each of its three
  // 16 px rows, top first, and whether odd tiles flip (the rail's posts pair every 32 px);
  // where the trainer and your horse stand; and the trainer's coffee idle (DESIGN Charm).
  paddock: z.strictObject({
    rows: marked(z.array(z.strictObject({ slot: text, flipOddTiles: z.boolean() })).length(3, { error: 'must list one tile row for each of the 3 rows' })),
    trainerAt: marked(z.tuple([whole.min(0).max(255), whole.min(0).max(239)])),
    horseAt: marked(z.tuple([whole.min(0).max(255), whole.min(0).max(239)])),
    cupDownSeconds: marked(positive),
    cupUpSeconds: marked(positive),
  }),
  beats: z.strictObject({
    pickSeconds: marked(z.number().min(0)),
    gateStillSeconds: marked(z.number().min(0)),
    wireHoldSeconds: marked(z.number().min(0)),
    // The photo (spec 4.4), all of it: the look before the caption and the caption after.
    photoSeconds: marked(z.number().min(0)),
    // Seconds from the photo's start to the winner line, unless Enter shows it sooner.
    photoCaptionSeconds: marked(z.number().min(0)),
    winnerBeatSeconds: marked(z.number().min(0)),
    // The brief's cap on one race from the gate to the end of the finish beats.
    maxSequenceSeconds: marked(positive),
  }),
  // The winner beat (DESIGN Charm): the winner alone, its frame's left column at frameLeft,
  // the background slowing over slowSeconds from its speed at the wire to a walk.
  winnerBeat: z.strictObject({
    frameLeft: marked(whole.min(0).max(255)),
    slowSeconds: marked(positive),
    walkPxPerSecond: marked(positive),
    walkStrideFeet: marked(positive),
  }),
  // The photo panel steps in from the top by whole stepPx moves, stepsPerSecond of them a
  // wall second (spec 4.4: one per frame at 60 Hz, so the same speed on any screen).
  photo: z.strictObject({
    stepPx: marked(whole.positive()),
    stepsPerSecond: marked(positive),
  }),
  // Ambient loops (DESIGN Charm cap, CH1). Swap rates are per wall second, at most 4.
  ambient: z.strictObject({
    cap: marked(whole.min(0).max(3, { error: 'must be at most 3, DESIGN\'s cap on ambient things' })),
    // Highest priority first when more are visible than the cap allows.
    order: z.array(z.enum(['crowd', 'flag'])).min(1),
    // The only ones that keep moving from the 1/8 pole to the wire.
    fromEighthPole: z.array(z.enum(['crowd', 'flag'])),
    crowdSwapsPerSecond: marked(positive.max(4, { error: 'must be at most 4 swaps a second' })),
    crowdStretchSwapsPerSecond: marked(positive.max(4, { error: 'must be at most 4 swaps a second' })),
    flagSwapsPerSecond: marked(positive.max(4, { error: 'must be at most 4 swaps a second' })),
    cursorSwapsPerSecond: marked(positive.max(4, { error: 'must be at most 4 swaps a second' })),
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
    fastTag: text,
    pause: z.strictObject({ title: text, resume: text, back: text }),
    // The card (spec 4.1).
    card: z.strictObject({
      styles: byKeys(RUNNING_STYLES),
      furlongs: text,
      mile: text,
      miles: text,
      conditions: text,
      surfaces: byKeys(SURFACES),
      goings: byKeys(ALL_GOINGS),
      bias: z.strictObject({
        fair: text,
        lane: z.strictObject({ inside: text, outside: text }),
        style: z.strictObject({ speed: text, closers: text }),
        both: text,
        laneShort: z.strictObject({ inside: text, outside: text }),
        styleShort: z.strictObject({ speed: text, closers: text }),
      }),
      // The column heads over the three stats, and the footer's rider line (spec 4.1).
      heads: z.strictObject({ speed: text, stamina: text, kick: text }),
      jockeyUp: text,
    }),
    // Orders, the paddock (spec 4.2). Values and trainer lines are keyed by INSTRUCTIONS.
    paddock: z.strictObject({
      title: text,
      labels: z.strictObject({ early: text, move: text, path: text }),
      values: z.strictObject({ early: everyValue(INSTRUCTIONS.early), move: everyValue(INSTRUCTIONS.move), path: everyValue(INSTRUCTIONS.path) }),
      go: text,
      back: text,
      trainer: z.strictObject({
        early: everyValue(INSTRUCTIONS.early), move: everyValue(INSTRUCTIONS.move), path: everyValue(INSTRUCTIONS.path), go: text, back: text,
      }),
    }),
    beforeFirstCall: text,
    leads: text,
    behind: text,
    // From your horse's own finish on (H3b).
    won: text,
    // The winner's margin when it is exactly one length.
    oneLength: text,
    finished: text,
    marginWords: z.strictObject({ nose: text, head: text, neck: text }),
    // A margin in lengths, in words: "1/2 length" at 1 or less, "1 1/4 lengths" above.
    marginLength: text,
    marginLengths: text,
    // The photo's caption (spec 4.4): the title while you look, then the winner and margin.
    photo: z.strictObject({ title: text, winner: text, margin: text }),
    // The result screen (spec 4.6).
    result: z.strictObject({
      winnerMargin: text,
      won: text,
      beaten: text,
      early: text,
      earlyLed: text,
      quarter: text,
      quarterLed: text,
      callsJoiner: z.string().min(1),
      clean: text,
      blocked: text,
      steadied: text,
      bumped: text,
      near: text,
      start: text,
      rough: text,
      orders: text,
      time: text,
      pace: z.strictObject({ hot: text, honest: text, slow: text }),
      poles: z.strictObject({ wire: text, mile: text }),
      splits: text,
      seed: text,
      next: text,
    }),
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

/**
 * The race-day beats in playback seconds at normal speed, from the gate: the one place
 * they are added up. The timeline and the sequence check (RV11) both read it. The photo
 * sits between the hold and the winner beat when the result flags one, and lasts nothing
 * otherwise; the post parade and call to the post join in step 6.
 */
export function beatTimes(rd: RaceDay, winnerSeconds: number, photo = false) {
  const b = rd.beats;
  const doorsAt = b.pickSeconds.value + b.gateStillSeconds.value;
  const winnerAt = doorsAt + winnerSeconds / rd.playback.speed.value;
  const holdEndAt = winnerAt + b.wireHoldSeconds.value;
  const photoEndAt = holdEndAt + (photo ? b.photoSeconds.value : 0);
  return { doorsAt, winnerAt, holdEndAt, photoEndAt, beatEndAt: photoEndAt + b.winnerBeatSeconds.value };
}

/** Playback seconds of one whole sequence, the photo included when there is one (RV11). */
export function sequenceSeconds(rd: RaceDay, winnerSeconds: number, photo: boolean): number {
  return beatTimes(rd, winnerSeconds, photo).beatEndAt;
}

export type Palette = z.infer<typeof paletteSchema>;
export type Slots = z.infer<typeof slotsSchema>;
export type CardLook = z.infer<typeof cardLookSchema>;
export type RaceDay = z.infer<typeof raceDaySchema>;
export type CallKey = Exclude<keyof RaceDay['copy']['calls'], 'pace'>;
