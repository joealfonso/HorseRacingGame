import { describe, expect, it } from 'vitest';
import { INSTRUCTIONS } from '../data/schema';
import { DataError } from '../data/validate';
import { marginLabel } from '../sim/margins';
import {
  bootErrorLines, callAt, dataErrorLines, formatClock, formatFraction, ordersShort, ordinal, plainErrorLines, positionLine,
  simErrorLines, wrap,
} from './format';
import { ORDINALS, game, race, rd, seeds } from './testkit';

// Spec 4.3 (clock, fractions, orders, your lines), 4.8 (errors). Criteria H3 to H6, ST1, ST2.

describe('H4: clock formatting', () => {
  it.each([
    [0, '0:00.0'],
    [5999, '0:59.9'], // cut, not rounded: 59.99 s shows 59.9
    [12155, '2:01.5'],
    [6000, '1:00.0'],
    [99, '0:00.9'],
    [100, '0:01.0'],
    [36000, '6:00.0'],
  ])('H4: %i hundredths running reads %s', (t, text) => {
    expect(formatClock(t, false)).toBe(text);
  });

  it.each([
    [12155, '2:01.55'], // the winner's time, in hundredths
    [12031, '2:00.31'],
    [6005, '1:00.05'],
    [0, '0:00.00'],
    [5999, '0:59.99'],
  ])('H4: %i hundredths final reads %s', (t, text) => {
    expect(formatClock(t, true)).toBe(text);
  });

  it('H4: a fractional race time is cut, never rounded up', () => {
    expect(formatClock(5999.9, false)).toBe('0:59.9');
    expect(formatClock(12155.9, true)).toBe('2:01.55');
  });

  it('H4: never negative', () => {
    expect(formatClock(-50, false)).toBe('0:00.0');
  });
});

describe('H5: fraction formatting', () => {
  it.each([
    [4612, '46.12'],
    [7020, '1:10.20'],
    [6000, '1:00.00'],
    [6005, '1:00.05'],
    [5999, '59.99'],
    [12155, '2:01.55'],
  ])('H5: %i hundredths reads %s', (t, text) => {
    expect(formatFraction(t)).toBe(text);
  });
});

describe('H6: orders short form', () => {
  // The words are from the spec: "Rate, 3/8, Inside", "Rate, Save, Inside", "Rider's call".
  const WORD = {
    early: { default: null, rateEarly: 'Rate' },
    move: { default: null, moveAtThreeEighths: '3/8', saveForStretch: 'Save' },
    path: { default: null, stayInside: 'Inside' },
  } as const;

  const combos = INSTRUCTIONS.early.flatMap((early) =>
    INSTRUCTIONS.move.flatMap((move) => INSTRUCTIONS.path.map((path) => ({ early, move, path }))),
  );

  it('H6: there are exactly 12 combinations', () => {
    expect(combos).toHaveLength(12);
  });

  it.each(combos.map((c) => [`${c.early}/${c.move}/${c.path}`, c] as const))('H6: %s reads right and fits 18 characters', (_name, c) => {
    const parts = [WORD.early[c.early], WORD.move[c.move], WORD.path[c.path]].filter((w) => w !== null) as string[];
    const expected = parts.length === 0 ? "Rider's call" : parts.join(', ');
    const got = ordersShort(c, rd.copy.orders);
    expect(got).toBe(expected);
    expect(got.length).toBeLessThanOrEqual(18);
  });

  it('H6: the spec examples', () => {
    expect(ordersShort({ early: 'rateEarly', move: 'moveAtThreeEighths', path: 'stayInside' }, rd.copy.orders)).toBe('Rate, 3/8, Inside');
    expect(ordersShort({ early: 'rateEarly', move: 'saveForStretch', path: 'stayInside' }, rd.copy.orders)).toBe('Rate, Save, Inside');
    expect(ordersShort({ early: 'default', move: 'default', path: 'default' }, rd.copy.orders)).toBe("Rider's call");
  });
});

describe('H3: the position line follows the latest call', () => {
  const bounds = game.tuning.marginLabelBounds.value;
  const SHORT: Record<string, string> = { nose: 'a nose', head: 'a head', neck: 'a neck' };
  const words = (thousandths: number) => {
    const label = marginLabel(thousandths / 1000, bounds);
    return SHORT[label] ?? label;
  };

  it('H3: for every call, every horse, over 100 seeds, the line is the chart in words', () => {
    let lines = 0;
    for (const seed of seeds(100)) {
      const r = race(seed);
      for (const call of r.calls) {
        for (const me of call.horses) {
          const post = r.inputs.card.horses.find((h) => h.id === me.id)!.post;
          const got = positionLine(call, me.id, post, bounds, rd.copy);
          const second = call.horses.find((h) => h.position === 2)!;
          const expected = me.position === 1 ? `Leads by ${words(second.lengthsBehind)}` : `${ORDINALS[me.position]}, ${words(me.lengthsBehind)} back`;
          expect(got, `seed ${seed} furlongsToGo ${call.furlongsToGo} ${me.id}`).toBe(expected);
          lines++;
        }
      }
    }
    expect(lines).toBeGreaterThan(7000);
  });

  it('H3: spec examples "3rd, 2 1/2 back" and "Leads by a head"', () => {
    const call = {
      furlongsToGo: 4,
      time: 7000,
      horses: [
        { id: 'a', position: 1, lengthsBehind: 0 },
        { id: 'b', position: 2, lengthsBehind: 150 }, // 0.15 length is a head
        { id: 'c', position: 3, lengthsBehind: 2500 }, // 2 1/2 lengths
      ],
    };
    expect(positionLine(call, 'c', 3, bounds, rd.copy)).toBe('3rd, 2 1/2 back');
    expect(positionLine(call, 'a', 1, bounds, rd.copy)).toBe('Leads by a head');
  });

  it('H3: before the first call the line is "Post n"', () => {
    expect(positionLine(undefined, 'h1', 8, bounds, rd.copy)).toBe('Post 8');
    expect(positionLine(undefined, 'h1', 2, bounds, rd.copy)).toBe('Post 2');
  });

  it('H3: callAt gives the latest call at or before the time, and none before the first', () => {
    const r = race(5);
    const first = r.calls[0].time;
    expect(callAt(r.calls, first - 1)).toBeUndefined();
    expect(callAt(r.calls, first)).toBe(r.calls[0]);
    expect(callAt(r.calls, r.calls[1].time - 1)).toBe(r.calls[0]);
    expect(callAt(r.calls, r.calls[1].time)).toBe(r.calls[1]);
    expect(callAt(r.calls, 1e9)).toBe(r.calls[r.calls.length - 1]);
  });

  it('H3: the line changes at calls only, not between them', () => {
    const r = race(9);
    const me = r.inputs.card.horses[2];
    const lineAt = (t: number) => positionLine(callAt(r.calls, t), me.id, me.post, bounds, rd.copy);
    const a = r.calls[3];
    const b = r.calls[4];
    const seen = new Set<string>();
    for (let t = a.time; t < b.time; t += 7) seen.add(lineAt(t));
    expect(seen.size).toBe(1);
  });
});

describe('ST1: the data error screen', () => {
  const one = new DataError('src/data/card.json', [{ path: 'horses[2].stats.speed', message: 'must be at most 100' }]);

  // Round two: the footer is now "Fix it and reload the page." (27 characters). Spec 4.8
  // changed it because the old 33 character footer did not fit the 30 inside the box.
  it('ST1: the spec example, line for line', () => {
    expect(dataErrorLines(one)).toEqual([
      'The race data has a problem.',
      '',
      'src/data/card.json',
      'horses[2].stats.speed',
      'must be at most 100',
      '',
      'Fix it and reload the page.',
    ]);
  });

  it('ST1: the whole example fits the 30 characters inside the box, footer included', () => {
    // Spec 4: "30 inside a framed box". Round one found the old footer at 33; the spec now
    // gives "Fix it and reload the page.", so the example and the box agree.
    for (const line of dataErrorLines(one)) expect(line.length, line).toBeLessThanOrEqual(30);
  });

  it('ST1: every issue shows its file, path and message', () => {
    const err = new DataError('src/data/raceDay.json', [
      { path: 'view.pxPerFoot', message: 'is required' },
      { path: 'copy.calls.leader[0]', message: 'is 31 characters at its widest' },
      { path: 'hud.messageSeconds.value', message: 'must be greater than 0' },
    ]);
    const lines = dataErrorLines(err);
    const flat = lines.join('\n');
    expect(flat).toContain('src/data/raceDay.json');
    for (const i of err.issues) {
      expect(flat).toContain(i.path);
      expect(flat).toContain(i.message);
    }
  });

  it('ST1: nothing is wider than 30 characters, even for long paths and messages', () => {
    const err = new DataError('src/data/cardLook.json', [
      { path: 'a-very-long-horse-id.silks.body', message: '"Brightest Possible Shade" is not one of the 18 silks colors, pick another one' },
      { path: 'x'.repeat(70), message: 'y'.repeat(65) },
    ]);
    // The issue blocks only; the fixed footer is checked by the example test above.
    const lines = dataErrorLines(err);
    for (const line of lines.slice(0, -1)) expect(line.length, line).toBeLessThanOrEqual(30);
  });

  it('ST1: wrapped text is all still there, in order', () => {
    const message = 'is 31 characters at its widest ("MMMMMMMMMMMMMMMMMM on the lead and more"); the field holds 30';
    const err = new DataError('src/data/raceDay.json', [{ path: 'copy.calls.leader[0]', message }]);
    const flat = dataErrorLines(err).join('').replace(/\s+/g, '');
    expect(flat).toContain(message.replace(/\s+/g, ''));
  });

  it('ST1: more issues than fit show the first ones and "and N more, see the console"', () => {
    const issues = Array.from({ length: 40 }, (_v, i) => ({ path: `horses[${i}].jockey`, message: 'must be 22 characters or fewer' }));
    const lines = dataErrorLines(new DataError('src/data/card.json', issues));
    expect(lines.length).toBeLessThanOrEqual(28); // 240 px of 8 px rows
    const more = lines.find((l) => /^and \d+ more, see the console$/.test(l));
    expect(more).toBeDefined();
    const hidden = Number(/^and (\d+) more/.exec(more!)![1]);
    const flat = lines.join('\n');
    const shown = issues.filter((i) => flat.includes(i.path)).length;
    expect(shown).toBeGreaterThan(0);
    expect(shown + hidden).toBe(40);
    // The first ones, in order.
    expect(flat).toContain('horses[0].jockey');
    expect(flat).not.toContain('horses[39].jockey');
  });

  it('ST1: the full message for the console names every issue, file and path, hidden or not', () => {
    const issues = Array.from({ length: 40 }, (_v, i) => ({ path: `horses[${i}].jockey`, message: 'must be 22 characters or fewer' }));
    const err = new DataError('src/data/card.json', issues);
    for (const i of issues) expect(err.message).toContain(`src/data/card.json: ${i.path}: ${i.message}`);
  });

  it('ST1: a thrown error that is not a DataError still reaches the screen', () => {
    const lines = bootErrorLines(new Error('?seed= must be a whole number from 0 to 4294967295'));
    expect(lines.join(' ')).toContain('?seed=');
    expect(lines.join(' ')).toContain('4294967295');
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(30);
    expect(bootErrorLines(one)).toEqual(dataErrorLines(one));
    expect(plainErrorLines('boom').join('\n')).toContain('boom');
  });

  describe('wrap: breaks on spaces, dots and brackets', () => {
    it('leaves short text alone and never returns an empty list', () => {
      expect(wrap('horses[2].stats.speed', 30)).toEqual(['horses[2].stats.speed']);
      expect(wrap('', 30)).toEqual(['']);
    });

    it('breaks a long path after a dot', () => {
      expect(wrap('horses[2].stats.speed.something.more', 30)).toEqual(['horses[2].stats.speed.', 'something.more']);
    });

    it('breaks a long path at a bracket', () => {
      expect(wrap(`${'a'.repeat(28)}[1234567890]`, 30)).toEqual(['a'.repeat(28), '[1234567890]']);
    });

    it('breaks after a closing bracket', () => {
      expect(wrap('copy.calls.photoXXXXXXXXXX[12]YYYYYYYY', 30)).toEqual(['copy.calls.photoXXXXXXXXXX[12]', 'YYYYYYYY']);
    });

    it('breaks a message on a space and drops the space', () => {
      expect(wrap('must be a whole number between zero and one hundred', 30)).toEqual(['must be a whole number between', 'zero and one hundred']);
    });

    it('cuts a run with no break point at the width', () => {
      expect(wrap('x'.repeat(65), 30)).toEqual(['x'.repeat(30), 'x'.repeat(30), 'x'.repeat(5)]);
    });

    it('never makes a line over the width, for any width and any of these strings', () => {
      const samples = ['src/data/raceDay.json', 'horses[12].instructions.early', 'is not a palette color name, pick one from palette.json please', '[[[[[]]]]]'.repeat(5)];
      for (const s of samples) for (const w of [10, 17, 30]) for (const line of wrap(s, w)) expect(line.length).toBeLessThanOrEqual(w);
    });
  });
});

describe('ST2: a sim error during a race', () => {
  it('ST2: shows the headline, the seed and the message', () => {
    const lines = simErrorLines(1234567, new Error('lane out of range'));
    expect(lines[0]).toBe('The race could not be run.');
    expect(lines.join('\n')).toContain('1234567');
    expect(lines.join('\n')).toContain('lane out of range');
  });

  it('ST2: a long message wraps at 30 characters and none of it is lost on the way', () => {
    const message = 'Cannot read properties of undefined (reading distance) while placing the field';
    const lines = simErrorLines(42, new Error(message));
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(30);
    expect(lines.join('').replace(/\s+/g, '')).toContain(message.replace(/\s+/g, ''));
  });

  it('ST2: a thrown string works too, and seed 0 still shows', () => {
    const lines = simErrorLines(0, 'plain string');
    expect(lines.join('\n')).toContain('plain string');
    expect(lines.some((l) => /\b0\b/.test(l))).toBe(true);
  });
});

describe('ordinal', () => {
  it.each([[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [8, '8th'], [11, '11th'], [12, '12th'], [13, '13th'], [21, '21st'], [22, '22nd'], [101, '101st'], [111, '111th']])('%i reads %s', (n, s) => {
    expect(ordinal(n)).toBe(s);
  });
});
