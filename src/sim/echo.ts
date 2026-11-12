// A fresh copy of plain input data with object keys sorted, so the echo in the
// result depends only on the values passed in, never on the order their keys were
// written in. Missing optional fields stay missing rather than becoming undefined.
export function echo<T>(value: T): T {
  return copy(value) as T;
}

function copy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copy);
  // "+ 0" turns a -0 in the input (JSON.parse("-0") makes one) into 0, so the echo
  // survives a JSON round trip unchanged.
  if (typeof value === 'number') return value + 0;
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const v = (value as Record<string, unknown>)[key];
    if (v !== undefined) out[key] = copy(v);
  }
  return out;
}
