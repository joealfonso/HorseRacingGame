import { z } from 'zod';
import { marked } from './schema';
import { boxSchema } from './hubSchema';

// Schema for the book's data (docs/specs/book-and-window.md section 15 item 1): the cover, the
// news page, the race pages' state words and the running foot. Its own file, as hub.json's is.
// No JSON is imported here. The cross-field rules (widths, wraps, banned words) are in bookLoad.ts.

const text = z.string()
  .refine((s) => s.trim().length > 0, { error: 'must not be empty or only spaces' })
  .refine((s) => s === s.trim(), { error: 'must not start or end with spaces' });
const whole = z.int({ error: 'must be a whole number' });
const px = whole.min(0);

/** Where each news slot's item comes from. `fallback` is used when the source has nothing true to say. */
export const NEWS_SOURCES = ['flavor', 'card', 'double', 'longest'] as const;
export type NewsSource = (typeof NEWS_SOURCES)[number];

const fact = (body: z.ZodType<string>) => z.strictObject({ headline: text, body });

export const bookSchema = z.strictObject({
  cover: z.strictObject({
    title: marked(text),
    dayLabel: marked(text),
    /** The day pair's number, "#{seed}". */
    dayNumber: marked(text),
    /** "{n} races today". */
    races: marked(text),
    layout: marked(z.strictObject({
      masthead: boxSchema,
      keyline: boxSchema,
      nameTop: px,
      titleTop: px,
      datelineTop: px,
      dayLabelX: px,
      dayNumberX: px,
      racesRight: px,
      rules: z.strictObject({ tops: z.tuple([px, px]), x0: px, x1: px }),
      picture: boxSchema,
      lineTop: px,
    })),
    /** The masthead's display font (art-director 18.1 item 3, 18.5 D): the name is upper-cased by code. */
    display: marked(z.strictObject({ cellW: whole.min(1), glyphs: text, trackMaxChars: whole.min(1) })),
    /** The aria-live day pair, "{label} {number}" (23.6). */
    aria: marked(text),
    /** Characters, main font, 8 px each. */
    limits: marked(z.strictObject({ title: whole.min(1), races: whole.min(1), line: whole.min(1) })),
  }),
  news: z.strictObject({
    title: marked(text),
    subtitle: marked(text),
    layout: marked(z.strictObject({
      x: px,
      titleTop: px,
      subtitleTop: px,
      ruleTops: z.tuple([px, px]),
      firstTop: px,
      pitch: whole.min(1),
      bodyTops: z.array(px).min(1),
      headlineChars: whole.min(1),
      lineChars: whole.min(1),
      bodyLines: whole.min(1),
      titleChars: whole.min(1),
      subtitleChars: whole.min(1),
    })),
    /** The five slots in order (spec section 4). `fallback` is null or "flavor". */
    slots: marked(z.array(z.strictObject({
      source: z.enum(NEWS_SOURCES, { error: `unknown source, use one of ${NEWS_SOURCES.join(', ')}` }),
      fallback: z.literal('flavor').nullable(),
    })).min(1)),
    facts: marked(z.strictObject({
      /** "{n} races, all {distance} on {going} {surface}." and, when the races differ, "{n} races today. First up: the {race1Name}." */
      card: fact(text).extend({ bodyMixed: text }),
      /** One line per horse: "{name}, races {a}, {b}". */
      double: z.strictObject({ headline: text, line: text }),
      longest: fact(text),
    })),
    flavor: marked(z.array(z.strictObject({ headline: text, body: text })).min(1)),
    /** On top of betting.json's and hub.json's lists: spec section 4, "News rules the loader checks", and section 13. */
    bannedWords: marked(z.array(text)),
    /** Characters that may not appear anywhere in the book's copy (spec section 13: no "$" outside money figures, and the book has none). */
    bannedChars: marked(z.array(text)),
  }),
  racePage: z.strictObject({
    toWindow: marked(text),
    /** "Winner: #{n}". */
    winner: marked(text),
    later: marked(text),
    /** The focused entry as aria-live reads it (sections 10 and 23.6). */
    ariaEntry: marked(text),
    /** Characters, the right slot of header line 1. */
    rightChars: marked(whole.min(1)),
  }),
  foot: z.strictObject({
    /** "< {page}". */
    prev: marked(text),
    /** "{page} >". */
    next: marked(text),
    close: marked(text),
    /** Page names: "Cover", "News", "Race {r}". */
    pages: marked(z.strictObject({ cover: text, news: text, race: text })),
    pageChars: marked(whole.min(1)),
    layout: marked(z.strictObject({
      top: px,
      prevX: px,
      nextRight: px,
      /** The close item's text is centered in this box (x88-167). */
      closeText: boxSchema,
      prevTarget: boxSchema,
      closeTarget: boxSchema,
      nextTarget: boxSchema,
    })),
  }),
});

export type Book = z.infer<typeof bookSchema>;
