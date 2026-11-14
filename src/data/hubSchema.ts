import { z } from 'zod';
import { marked } from './schema';

// Schema for the track screen's data (docs/specs/track-hub.md sections 4, 7 and 11; DESIGN
// "The track (between races)"). Its own file, as betting.json is. No JSON is imported here.
// The cross-field rules (TH1's boxes, the copy widths, the banned words) are in hubLoad.ts.

const text = z.string()
  .refine((s) => s.trim().length > 0, { error: 'must not be empty or only spaces' })
  .refine((s) => s === s.trim(), { error: 'must not start or end with spaces' });
const whole = z.int({ error: 'must be a whole number' });
const px = whole.min(0);

/** An inclusive box on the 1x grid. */
export const boxSchema = z.strictObject({ x0: px, y0: px, x1: px, y1: px })
  .refine((b) => b.x0 <= b.x1 && b.y0 <= b.y1, { error: 'x0 must not be above x1, nor y0 above y1' });
export type Box = z.infer<typeof boxSchema>;

export const DOOR_ACTIONS = ['program', 'watch'] as const;

const door = z.strictObject({
  id: text,
  kind: z.literal('door'),
  /** program: open the next race's program. watch: go to the post with no bet. */
  action: z.enum(DOOR_ACTIONS, { error: `unknown door action, use one of ${DOOR_ACTIONS.join(', ')}` }),
  hit: boxSchema,
  focus: boxSchema,
});
const lookable = z.strictObject({
  id: text,
  kind: z.literal('lookable'),
  hit: boxSchema,
  focus: boxSchema,
  /** The person in idle.order who plays when this is looked at, or null for none. */
  idle: text.nullable(),
});
const target = z.discriminatedUnion('kind', [door, lookable]);

const lookCopy = z.strictObject({ name: text, lines: z.array(text) });

export const hubSchema = z.strictObject({
  picture: marked(boxSchema),
  targets: marked(z.array(target).min(1)),
  targetOrder: marked(z.array(text).min(1)),
  box: marked(z.strictObject({
    /** The dialog box from the 8x8 frame tiles: its top-left and size in tiles. */
    frame: z.strictObject({ x: px, y: px, tilesW: whole.min(2), tilesH: whole.min(2) }),
    cursorX: px,
    textX: px,
    chars: whole.min(1),
    voiceTops: z.tuple([px, px]),
    doorRows: z.array(z.strictObject({ door: text, top: px, item: boxSchema })),
  })),
  statusBar: marked(z.strictObject({
    raceX: px,
    bankLastX: px,
    top: px,
    fill: z.strictObject({ y0: px, y1: px }),
    lineY: px,
  })),
  sign: marked(z.strictObject({ plate: boxSchema, top: px })),
  toteBoard: marked(z.strictObject({
    face: boxSchema,
    header: z.strictObject({ x: px, y: px, lastX: px }),
    digitX: px,
    priceX: px,
    pitch: whole.min(1),
    perRow: whole.min(1),
    rowTops: z.array(px).min(1),
    priceChars: whole.min(1),
  })),
  cornerBobPx: marked(whole.min(0).max(2)),
  idle: marked(z.strictObject({
    everySeconds: z.number().positive(),
    stepSeconds: z.number().positive(),
    steps: whole.min(1),
    order: z.array(text).min(1),
  })),
  skyByRace: marked(z.array(z.strictObject({
    fromRace: whole.min(1),
    bands: z.array(z.strictObject({ color: text, y0: px, y1: px })).min(1),
  })).min(1)),
  copy: z.strictObject({
    state: z.strictObject({ first: text, next: text, last: text, toRail: text, toRailSecond: text }),
    flavor: z.array(text).min(1),
    doors: z.record(z.string(), text),
    board: z.strictObject({ race: text }),
    sign: z.strictObject({ windows: text }),
    lookables: z.record(z.string(), lookCopy),
    /** On top of betting.json's copy.bannedWords: the spec's "no cash, no buy, in any form". */
    bannedWords: z.array(text),
  }),
});

export type Hub = z.infer<typeof hubSchema>;
export type HubTarget = z.infer<typeof target>;
export type DoorAction = (typeof DOOR_ACTIONS)[number];
