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

export const DOOR_ACTIONS = ['window', 'watch'] as const;

/**
 * The box's book row (docs/specs/book-and-window.md section 8): a row with no picture target
 * that opens the book. Its id stands in a door row's `door` and in the focus.
 */
export const BOOK_ROW = 'read';

const door = z.strictObject({
  id: text,
  kind: z.literal('door'),
  /** window: open the window screen for the next race. watch: go to the post with no bet. */
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
    /** The menu rows top to bottom: each a door's id, or BOOK_ROW for the book's row. */
    doorRows: z.array(z.strictObject({ door: text, top: px, item: boxSchema })),
  })),
  /** Where focus lands: arriving from the Result or at day start, back from the book or the window, and from a lookable on Up, Down or Esc. */
  focus: marked(z.strictObject({ arrival: text, back: text, fromLookable: text })),
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
  /** The window screen's layout (book-and-window.md sections 7 and 10, art-director 19.3). */
  window: marked(z.strictObject({
    booth: z.strictObject({ x: px, y: px }),
    clerk: z.strictObject({ x: px, y: px }),
    program: z.strictObject({ x: px, y: px }),
    sign: z.strictObject({ plate: boxSchema, top: px }),
    frame: z.strictObject({ x: px, y: px, tilesW: whole.min(2), tilesH: whole.min(2) }),
    clerkLine: z.strictObject({ x: px, top: px }),
    rows: z.strictObject({
      firstTop: px, pitch: whole.min(1), cursorX: px, boxX: px, nameX: px, oddsLastX: px,
      /** Row i's pointer box: x0-x1, from its cell top + dy0 to + dy1. */
      hit: z.strictObject({ x0: px, x1: px, dy0: whole, dy1: whole }),
    }),
    line: z.strictObject({ y: px, x0: px, x1: px }),
    ticket: z.strictObject({
      tops: z.tuple([px, px]),
      cursorX: px,
      textX: px,
      lastX: px,
      /** "<" and ">": each glyph's cell plus `pad` px each side, rows y0-y1. */
      arrows: z.strictObject({ y0: px, y1: px, pad: px }),
      bet: boxSchema,
      back: boxSchema,
    }),
    nameChars: whole.min(1),
  })),
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
    /** The window's clerk (book-and-window.md section 7): choosing, the ticket's and the bet's line cycles, and "Esc: back". */
    window: z.strictObject({
      choose: text, ticket: z.array(text).min(1), punch: z.array(text).min(1), back: text,
      /** aria-live only (23.6): the focused row, and the open ticket read without its arrow glyphs. Order and punctuation; the words are copy. */
      aria: z.strictObject({ row: text, ticket: text }),
    }),
    /** On top of betting.json's copy.bannedWords: the spec's "no cash, no buy, in any form". */
    bannedWords: z.array(text),
  }),
});

export type Hub = z.infer<typeof hubSchema>;
export type HubTarget = z.infer<typeof target>;
export type DoorAction = (typeof DOOR_ACTIONS)[number];
