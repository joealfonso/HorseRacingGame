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

/** The seven kinds of news item (docs/specs/book-useful.md section 3.2). K6 is the draw item: only its "wide" half ships (13.3). */
export const NEWS_KINDS = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7'] as const;
export type NewsKind = (typeof NEWS_KINDS)[number];

/** A headline and a body written as a pair (3.5). The prefix "Race {r}:" is added to the headline by code. */
const pair = z.strictObject({ headline: text, body: text });
/** Every kind: how many of it may print in a day (null: no cap), and its pairs. */
const kind = <T extends z.ZodRawShape>(thresholds: T) =>
  z.strictObject({ cap: whole.min(1).nullable(), ...thresholds, pairs: z.array(pair).min(1) });

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
    /** How many items print in a day (3.4). */
    slots: marked(whole.min(1)),
    /** "Race {r}:", before every headline. */
    prefix: marked(text),
    /** Front-runners as a word, by count: the {k} of the crowded-lead headline. Every count from the crowded lead's `frontsMin` up to a field with one closer needs one. */
    count: marked(z.record(z.string().regex(/^\d+$/, { error: 'the key must be a whole number' }), text)),
    /** Thresholds and pairs per kind (3.2, 3.5). */
    kinds: marked(z.strictObject({
      /** Lone speed: one front-runner, and its rank at most `frontRankMax`. */
      K1: kind({ frontRankMax: whole.min(1) }),
      /** Class above: a unique top total, lead at least `leadMin`, gap at least `gapMin`. */
      K2: kind({ leadMin: whole.min(0), gapMin: whole.min(0) }),
      /** Crowded lead: at least `frontsMin` front-runners, and the top closer's rank at most `closerRankMax`. */
      K3: kind({ frontsMin: whole.min(1), closerRankMax: whole.min(1) }),
      /** Easier crowd: rivals' means differ by `diffMin` or more, and the horse's rank in the softer race at most `rankMax`. */
      K4: kind({ diffMin: whole.min(0), rankMax: whole.min(1) }),
      /** No speed: no front-runner, and the top stalker's rank at most `stalkerRankMax`. */
      K5: kind({ stalkerRankMax: whole.min(1) }),
      /** Drawn wide: a front-runner of rank at most `frontRankMax`, in a field of `frontsMin` or more, in the last `widePosts` posts. */
      K6: kind({ frontRankMax: whole.min(1), frontsMin: whole.min(1), widePosts: whole.min(1) }),
      /** Top on the numbers: a unique top total where class above did not fire. */
      K7: kind({}),
    })),
    /** The order the five are taken in (3.4 step 2). */
    priority: marked(z.array(z.enum(NEWS_KINDS, { error: `unknown kind, use one of ${NEWS_KINDS.join(', ')}` })).min(1)),
    /** On top of betting.json's and hub.json's lists: book-and-window.md section 4 and 13, and book-useful.md section 2 (words that hint at something measured false). */
    bannedWords: marked(z.array(text)),
    /** Characters that may not appear anywhere in the book's copy (spec section 13: no "$" outside money figures, and the book has none). */
    bannedChars: marked(z.array(text)),
  }),
  racePage: z.strictObject({
    toWindow: marked(text),
    /** "Winner: #{n}". */
    winner: marked(text),
    later: marked(text),
    /** Header line 4's third part while the bias is fair: the field's front-runner count (book-useful.md section 6). */
    pace: marked(z.strictObject({ none: text, some: text })),
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
