import { betStream } from './streams';

export interface DrawHorse {
  id: string;
  /** Silks body color. When given, no two horses in a field share one. */
  silksBody?: string;
}

export interface DrawRules {
  races: number;
  fieldSize: number;
  maxStartsPerDay: number;
  /** A horse that ran in race r runs again no earlier than race r + this. */
  racesBeforeRerun: number;
}

/**
 * A day's fields from the day seed alone: for each race, stable indexes by post (index 0 is
 * post 1). Race r draws on the `fieldDraw` stream with sub-key r. Horses with fewer starts
 * today come first, ties broken by a shuffle; posts are a uniform shuffle of the eight.
 * Good enough for the B0 probe; B1 owns proving it never fails (FD5).
 */
export function drawDay(stable: readonly DrawHorse[], daySeed: number, rules: DrawRules): number[][] {
  const starts = new Array<number>(stable.length).fill(0);
  const lastRace = new Array<number | undefined>(stable.length).fill(undefined);
  const fields: number[][] = [];

  for (let race = 1; race <= rules.races; race++) {
    const rng = betStream(daySeed, 'fieldDraw', race);
    const shuffle = (list: number[]) => {
      for (let i = list.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [list[i], list[j]] = [list[j], list[i]];
      }
    };

    const eligible: number[] = [];
    stable.forEach((_, i) => {
      const last = lastRace[i];
      if (starts[i] < rules.maxStartsPerDay && (last === undefined || race - last >= rules.racesBeforeRerun)) eligible.push(i);
    });
    shuffle(eligible);
    eligible.sort((a, b) => starts[a] - starts[b]); // stable sort keeps the shuffle within equal starts

    const picked: number[] = [];
    const bodies = new Set<string>();
    for (const i of eligible) {
      if (picked.length === rules.fieldSize) break;
      const body = stable[i].silksBody;
      if (body !== undefined && bodies.has(body)) continue;
      if (body !== undefined) bodies.add(body);
      picked.push(i);
    }
    if (picked.length < rules.fieldSize) throw new Error(`field draw failed: day seed ${daySeed}, race ${race}`);

    shuffle(picked);
    for (const i of picked) {
      starts[i]++;
      lastRace[i] = race;
    }
    fields.push(picked);
  }
  return fields;
}
