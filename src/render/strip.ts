import type { RaceResult } from '../sim/result';

// The running order strip (spec 4.3, H1): leader first, updated once per replay sample.
// Two running horses only swap when the one behind gets more than the hysteresis ahead,
// so near-ties do not flicker. A horse that has finished locks at its finish place, so
// the last strip equals result.finish.

/** Horse ids in strip order for every replay sample. */
export function stripOrders(result: RaceResult, hysteresisLengths: number): string[][] {
  const { horses, step } = result.replay;
  const h = hysteresisLengths * result.inputs.tuning.horseLengthFeet.value * 100;
  const samples = horses.reduce((n, x) => Math.max(n, x.distance.length), 0);
  const byId = new Map(horses.map((x) => [x.id, x]));
  const place = new Map(result.finish.map((f) => [f.id, f.place]));
  const at = (id: string, i: number) => {
    const d = byId.get(id)!.distance;
    return d[Math.min(i, d.length - 1)];
  };

  const out: string[][] = [];
  let running = [...horses]
    .sort((a, b) => b.distance[0] - a.distance[0] || a.post - b.post)
    .map((x) => x.id);
  for (let i = 0; i < samples; i++) {
    const t = i * step;
    const done = result.finish.filter((f) => f.time <= t).map((f) => f.id);
    const doneSet = new Set(done);
    running = running.filter((id) => !doneSet.has(id));
    // Bubble passes: a pair swaps only on a clear gap, so the order cannot loop.
    for (let pass = 0; pass < running.length; pass++) {
      let swapped = false;
      for (let j = 0; j + 1 < running.length; j++) {
        if (at(running[j + 1], i) - at(running[j], i) > h) {
          [running[j], running[j + 1]] = [running[j + 1], running[j]];
          swapped = true;
        }
      }
      if (!swapped) break;
    }
    out.push([...done.sort((a, b) => place.get(a)! - place.get(b)!), ...running]);
  }
  return out;
}

/** The strip shown at race time t (hundredths): the latest sample at or before t. */
export function stripAt(orders: readonly string[][], step: number, t: number): string[] {
  if (orders.length === 0) return [];
  const i = t > 0 ? Math.min(orders.length - 1, Math.floor(t / step)) : 0;
  return orders[i];
}
