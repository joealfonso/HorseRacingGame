import { z } from 'zod';

// Plain schemas and the types inferred from them. No JSON is imported here, so the
// sim can import these types without ever touching a real track, race or horse name.

export const RUNNING_STYLES = ['frontRunner', 'stalker', 'closer'] as const;
export const SURFACES = ['dirt', 'turf', 'synthetic'] as const;

// Which goings exist on which surface. "Firm on dirt" is rejected by this table.
export const GOINGS_BY_SURFACE = {
  dirt: ['fast', 'good', 'muddy', 'sloppy'],
  turf: ['firm', 'good', 'yielding'],
  synthetic: ['fast', 'good'],
} as const;

export const INSTRUCTIONS = {
  early: ['default', 'rateEarly'],
  move: ['default', 'moveAtThreeEighths', 'saveForStretch'],
  path: ['default', 'stayInside'],
} as const;

// The distances the M1 model runs: whole furlongs, so every pace par and furlong pole
// lines up. Half furlongs arrive with the calendar in M5.
export const MIN_FURLONGS = 5;
export const MAX_FURLONGS = 12;
export const MIN_FIELD = 2;
export const MAX_FIELD = 20;
export const MAX_NAME_LENGTH = 18;

const STATUS = ['starting guess', 'confirmed'] as const;

// Every number Joseph has not confirmed carries this mark, so none passes as settled.
// Strict objects: a misspelled key is an error, not a silently ignored field.
export const marked = <T extends z.ZodType>(value: T) =>
  z.strictObject({ value, status: z.enum(STATUS), note: z.string().optional() });

const positive = z.number().positive();
const share = z.number().min(0).max(1);
// Fix bad text in the file, never trim it silently: the name limit would count padding.
const text = z.string()
  .refine((s) => s.trim().length > 0, { error: 'must not be empty or only spaces' })
  .refine((s) => s === s.trim(), { error: 'must not start or end with spaces' });

const bandOf = (low: number, high: number) =>
  z.strictObject({ min: z.number().min(low), max: z.number().max(high) })
    .refine((b) => b.min <= b.max, { error: 'min must not be above max' });
const band = bandOf(0, Infinity);
const percentBand = bandOf(0, 100);

const dirtGoings = GOINGS_BY_SURFACE.dirt;

export const trackSchema = z.strictObject({
  name: text,
  location: text,
  // Feet, measured along the rail. The lap is the same for every race on this track.
  lapFeet: marked(positive),
  // Order of travel from the wire: first turn, backstretch, second turn, stretch, wire.
  stretchFeet: marked(positive),
  backstretchFeet: marked(positive),
  turnFeet: marked(positive), // each of the two turns
  runUpFeet: marked(z.number().min(0)),
  surface: z.enum(SURFACES),
}).superRefine((t, ctx) => {
  const sum = t.stretchFeet.value + t.backstretchFeet.value + 2 * t.turnFeet.value;
  if (Math.abs(sum - t.lapFeet.value) > 0.5) {
    ctx.addIssue({
      code: 'custom',
      path: ['lapFeet', 'value'],
      message: `stretch + backstretch + two turns is ${sum} feet, but the lap is ${t.lapFeet.value}`,
    });
  }
});

export const raceSchema = z.strictObject({
  name: text,
  track: text,
  distanceFurlongs: z.int({ error: `must be a whole number of furlongs from ${MIN_FURLONGS} to ${MAX_FURLONGS}` })
    .min(MIN_FURLONGS, { error: `must be at least ${MIN_FURLONGS} furlongs` })
    .max(MAX_FURLONGS, { error: `must be at most ${MAX_FURLONGS} furlongs` }),
  surface: z.enum(SURFACES),
  going: z.string(),
  trackBias: z.strictObject({
    lane: z.enum(['neutral', 'inside', 'outside']),
    style: z.enum(['neutral', 'speed', 'closers']),
  }),
}).superRefine((r, ctx) => {
  const allowed: readonly string[] = GOINGS_BY_SURFACE[r.surface];
  if (!allowed.includes(r.going)) {
    ctx.addIssue({
      code: 'custom',
      path: ['going'],
      message: `"${r.going}" is not a going on ${r.surface}; use one of ${allowed.join(', ')}`,
    });
  }
});

const gate = (n: number) => `a whole number from 1 to ${n}`;

// The stat range is tuning, so the card schema is built from it.
export function cardSchema(statMin: number, statMax: number) {
  const stat = z.int({ error: `must be a whole number from ${statMin} to ${statMax}` })
    .min(statMin, { error: `must be at least ${statMin}` })
    .max(statMax, { error: `must be at most ${statMax}` });

  const horse = z.strictObject({
    id: text,
    name: text.max(MAX_NAME_LENGTH, { error: `must be ${MAX_NAME_LENGTH} characters or fewer` }),
    jockey: text, // display only, no stats
    post: z.int({ error: 'must be a whole number' }),
    style: z.enum(RUNNING_STYLES, { error: `unknown running style, use one of ${RUNNING_STYLES.join(', ')}` }),
    stats: z.strictObject({ speed: stat, stamina: stat, kick: stat }),
    instructions: z.strictObject({
      early: z.enum(INSTRUCTIONS.early, { error: `unknown instruction, use one of ${INSTRUCTIONS.early.join(', ')}` }),
      move: z.enum(INSTRUCTIONS.move, { error: `unknown instruction, use one of ${INSTRUCTIONS.move.join(', ')}` }),
      path: z.enum(INSTRUCTIONS.path, { error: `unknown instruction, use one of ${INSTRUCTIONS.path.join(', ')}` }),
    }),
  });

  return z.strictObject({
    horses: z.array(horse)
      .min(MIN_FIELD, { error: `a field needs at least ${MIN_FIELD} horses` })
      .max(MAX_FIELD, { error: `a field holds at most ${MAX_FIELD} horses` }),
  }).superRefine((card, ctx) => {
    const size = card.horses.length;
    const seen = { id: new Map<string, number>(), name: new Map<string, number>(), post: new Map<number, number>() };
    card.horses.forEach((h, i) => {
      if (h.post < 1 || h.post > size) {
        ctx.addIssue({ code: 'custom', path: ['horses', i, 'post'], message: `must be ${gate(size)} (the field size)` });
      }
      const keys = { id: h.id, name: h.name.trim().toLowerCase(), post: h.post } as const;
      for (const field of ['id', 'name', 'post'] as const) {
        const map = seen[field] as Map<string | number, number>;
        const first = map.get(keys[field]);
        if (first === undefined) map.set(keys[field], i);
        else ctx.addIssue({ code: 'custom', path: ['horses', i, field], message: `duplicates horses[${first}].${field}` });
      }
    });
  });
}

const luckRate = marked(share);
const byStyle = (n: z.ZodNumber) => z.strictObject({ frontRunner: n, stalker: n, closer: n });
const linear = z.strictObject({ base: z.number(), perPoint: z.number() });

// The numbers that shape a race in src/sim/. Units are in the key names.
const modelSchema = z.strictObject({
  // Cruising speed is base + perPoint * speed stat, before distance, going and form.
  cruiseFeetPerSecond: marked(linear),
  // How much faster horses go per furlong shorter than the reference distance.
  distanceSpeed: marked(z.strictObject({ referenceFurlongs: positive, sharePerFurlong: z.number().min(0) })),
  // Seconds a horse can hold its cruising speed before its reserve is empty: base + perPoint * stamina.
  enduranceSeconds: marked(linear),
  // Below aerobicShare of cruise the reserve does not drain. Above it, it drains at the excess
  // (as a share of the gap from aerobicShare to cruise) to drainPower, so a little extra pace costs a lot.
  aerobicShare: marked(z.number().min(0).max(0.99)),
  drainPower: marked(z.int().min(1).max(8)),
  // Below this share of the reserve a horse tires, down to emptySpeedShare of cruise when it is empty.
  tireBelowReserveShare: marked(share),
  emptySpeedShare: marked(share),
  // Kick: extra speed when asked, as a share of cruise, and how fast it builds. Once asked,
  // the reserve drains against the kicked speed instead of cruise.
  kickBoostShare: marked(linear),
  kickAccelFeetPerSecondSquared: marked(linear),
  // Feet before the wire where the rider asks, by style.
  askFeetToGo: marked(byStyle(positive)),
  // Pre-kick effort, a share of cruise, by style.
  earlyEffort: marked(byStyle(positive)),
  // A front-runner within pressLengths of the leader presses at its effort plus duelEffort.
  // A leader is pushed up to that same effort by company at its side, easing to
  // loneLeadEffort as it gets loneLeadLengths clear.
  frontRunnerPace: marked(z.strictObject({
    pressLengths: positive, loneLeadLengths: positive, duelEffort: z.number().min(0), loneLeadEffort: positive,
  })),
  // Stalkers try to sit between min and max lengths off the leader, closers no further back
  // than closerMaxLengths. Outside that they add or drop effortStep.
  positionPace: marked(z.strictObject({
    stalkerMinLengths: z.number().min(0), stalkerMaxLengths: positive, closerMaxLengths: positive, effortStep: z.number().min(0),
  })),
  // Random spread, each the most it can move a number either way, as a share.
  // Today's form moves cruising speed and the reserve, each by its own draw.
  formSpeedShare: marked(share),
  formReserveShare: marked(share),
  rhythmSpreadShare: marked(share),
  kickSpreadShare: marked(share),
  askSpreadFeet: marked(z.number().min(0)),
  gateBreakMaxSeconds: marked(z.number().min(0)),
  // Acceleration limits. Settling is a mid-race speed change that is not the kick.
  startAccelFeetPerSecondSquared: marked(positive),
  settleAccelFeetPerSecondSquared: marked(positive),
  fadeFeetPerSecondSquared: marked(positive),
  gallopOutFeetPerSecondSquared: marked(positive),
  // For traffic a lane is one horse wide. For ground, each lane out from the rail adds
  // laneWidthFeet to a turn's radius.
  laneWidthFeet: marked(positive),
  lanesPerSecond: marked(positive),
  // A horse alongside within clearLengths stops a move across. A horse ahead within
  // passLookLengths that is more than passMarginShare slower than this one wants to go
  // makes it go around, and one within blockLengths holds it up.
  traffic: marked(z.strictObject({
    clearLengths: positive, passLookLengths: positive, blockLengths: positive, passMarginShare: z.number().min(0),
  })),
  // How much a horse caught wide eases, as a share of its speed, to drop in behind.
  tuckInEffortDrop: marked(share),
});
const goingEffects = Object.fromEntries(dirtGoings.map((g) => [g, marked(z.number().min(0))])) as
  Record<(typeof dirtGoings)[number], ReturnType<typeof marked<z.ZodNumber>>>;

export const tuningSchema = z.strictObject({
  statRange: marked(band.refine((b) => Number.isInteger(b.min) && Number.isInteger(b.max), { error: 'must be whole numbers' })),
  replayStepSeconds: marked(positive),
  horseLengthFeet: marked(positive),
  // A margin below noseBelow is a nose, and so on up. From wholeLengthsFrom it rounds to whole lengths.
  marginLabelBounds: marked(z.strictObject({
    noseBelow: positive, headBelow: positive, neckBelow: positive, wholeLengthsFrom: positive,
  }).refine((b) => b.noseBelow < b.headBelow && b.headBelow < b.neckBelow && b.neckBelow < b.wholeLengthsFrom,
    { error: 'bounds must rise: nose, head, neck, whole lengths' })),
  photoFinishThresholdLengths: marked(positive),
  // Leader's half-mile time. Hot is under hotUnder, slow is over slowOver. Keyed by furlongs, then going.
  paceParHalfMile: z.record(z.string(), z.record(z.string(), marked(
    z.strictObject({ hotUnderSeconds: positive, slowOverSeconds: positive })
      .refine((p) => p.hotUnderSeconds < p.slowOverSeconds, { error: 'hotUnderSeconds must be below slowOverSeconds' }),
  ))),
  // Percent added to every time on this going, fast being the baseline.
  goingTimeAddedPercent: z.strictObject(goingEffects),
  speedCeilingFeetPerSecond: marked(positive),
  laneMax: marked(z.int().positive()),
  model: modelSchema,
  luck: z.strictObject({
    blockedPerHorse: luckRate,
    steadiedPerHorse: luckRate,
    bumpedPerHorse: luckRate,
    maxEventsPerRace: marked(z.int().min(0)),
    raceShareBandPercent: marked(percentBand),
  }),
  checks: z.strictObject({
    behaviorSeedCount: marked(z.int().positive()),
    behaviorTolerancePoints: marked(positive),
    fairnessTolerancePoints: marked(positive),
    batchSeedCount: marked(z.int().positive()),
    winningTimeBandSeconds: marked(band),
    closeWinPercentBand: marked(percentBand), // winning margin of a length or less
    photoFinishPercentBand: marked(percentBand),
    leaderAtEighthLosesPercentBand: marked(percentBand),
    cardWinSharePercentBand: marked(percentBand),
  }),
}).superRefine((t, ctx) => {
  // The stat lines are checked where they are used, at both ends of the stat range,
  // not by bounding base and slope: kickBoostShare has a negative base on purpose.
  const { min, max } = t.statRange.value;
  const m = t.model;
  const at = (l: { base: number; perPoint: number }, stat: number) => l.base + l.perPoint * stat;
  const mustBePositive = (key: 'cruiseFeetPerSecond' | 'enduranceSeconds' | 'kickAccelFeetPerSecondSquared', why: string) => {
    for (const stat of [min, max]) {
      const v = at(m[key].value, stat);
      if (!(v > 0)) {
        ctx.addIssue({ code: 'custom', path: ['model', key, 'value'], message: `is ${v} at stat ${stat}; must be above 0 across the stat range ${min} to ${max}, ${why}` });
        return;
      }
    }
  };
  mustBePositive('cruiseFeetPerSecond', 'or a horse cannot run');
  mustBePositive('enduranceSeconds', 'or the reserve never drains properly and the horse never tires');
  mustBePositive('kickAccelFeetPerSecondSquared', 'or the kick slows a horse down');
  // Below zero the sim floors the boost, so only the top of the range must give a kick.
  const top = at(m.kickBoostShare.value, max);
  if (!(top > 0)) {
    ctx.addIssue({ code: 'custom', path: ['model', 'kickBoostShare', 'value'], message: `is ${top} at stat ${max}; must be above 0 at the top of the stat range, or the kick stat does nothing` });
  }
});

export type Track = z.infer<typeof trackSchema>;
export type Race = z.infer<typeof raceSchema>;
export type Card = z.infer<ReturnType<typeof cardSchema>>;
export type Horse = Card['horses'][number];
export type Tuning = z.infer<typeof tuningSchema>;
export type RunningStyle = (typeof RUNNING_STYLES)[number];
export type GameData = { track: Track; race: Race; card: Card; tuning: Tuning };
