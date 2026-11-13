// Copy templates use {name} style holes. Shared by the race-day loader (to check that
// every template fits its field) and the renderer (to fill them), so the two agree.

const HOLE = /\{([a-z]+)\}/g;

export function templateHoles(template: string): string[] {
  return [...template.matchAll(HOLE)].map((m) => m[1]);
}

export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(HOLE, (whole, key: string) => (key in values ? String(values[key]) : whole));
}
