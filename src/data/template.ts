// Copy templates use {name} style holes. Shared by the race-day loader (to check that
// every template fits its field) and the renderer (to fill them), so the two agree.

const HOLE = /\{([a-z]+)\}/g;

export function templateHoles(template: string): string[] {
  return [...template.matchAll(HOLE)].map((m) => m[1]);
}

export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(HOLE, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

/**
 * Greedy word wrap on spaces: as many whole words as fit `width` characters on each line.
 * A word longer than the width gets a line to itself and is not cut, so a caller that
 * cares checks the lines' lengths (the loader does, for every trainer line).
 */
export function wrapWords(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ').filter((w) => w.length > 0)) {
    if (line === '') line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else { lines.push(line); line = word; }
  }
  if (line !== '') lines.push(line);
  return lines;
}
