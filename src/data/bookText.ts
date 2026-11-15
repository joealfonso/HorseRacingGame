// Text helpers for the book's copy (docs/specs/book-and-window.md section 4), shared by the
// loader (to check that every fill fits) and the news rules (to make the text), so the two agree.
// Not template.ts's: that one's holes are lower-case letters only, and the spec's hole
// {race1Name} has a digit and a capital.

const HOLE = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

export function holesOf(template: string): string[] {
  return [...template.matchAll(HOLE)].map((m) => m[1]);
}

/** Fills every hole that has a value and leaves the others as written. */
export function fillHoles(template: string, values: Record<string, string | number>): string {
  return template.replace(HOLE, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The first banned word or phrase `text` contains as a whole word, case-insensitive, or null.
 * "pick" is found in "Pick six" and not in "picket"; "sure thing" is found as a phrase.
 */
export function bannedWordIn(text: string, banned: readonly string[]): string | null {
  for (const w of banned) {
    if (new RegExp(`(?<![A-Za-z0-9])${escape(w)}(?![A-Za-z0-9])`, 'i').test(text)) return w;
  }
  return null;
}
