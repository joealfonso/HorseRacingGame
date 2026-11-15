import { describe, expect, it } from 'vitest';
import cardLookJson from './cardLook.json';
import paletteJson from './palette.json';
import raceDayJson from './raceDay.json';
import slotsJson from './slots.json';
import { loadData } from './load';
import { loadRaceDay, validateRaceDay } from './raceDayLoad';
import { DataError } from './validate';

// The End of day page's copy (`copy.end`) and positions (`endOfDay`) go through the loader like
// every other copy key and layout block: a good value passes, a bad one fails naming the file and
// the field (betting-screens.md sections 6, 8 and 9 BC1; DESIGN "End of day, the back page").

const game = loadData();
type Raw = { palette: unknown; slots: unknown; cardLook: unknown; raceDay: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const raw = (): Raw => structuredClone({ palette: paletteJson, slots: slotsJson, cardLook: cardLookJson, raceDay: raceDayJson }) as Raw;

/** The load's error after `edit`, or null when it loads. */
function load(edit: (r: Raw['raceDay']) => void): DataError | null {
  const r = raw();
  edit(r.raceDay);
  try { validateRaceDay(r, game); } catch (e) { return e as DataError; }
  return null;
}
const fails = (edit: (r: Raw['raceDay']) => void, path: string) => {
  const e = load(edit);
  expect(e, `expected a failure at ${path}`).not.toBeNull();
  expect(e!.file).toBe('src/data/raceDay.json');
  expect(e!.issues.map((i) => i.path)).toContain(path);
  expect(e!.message).toContain(`src/data/raceDay.json: ${path}`);
};
const passes = (edit: (r: Raw['raceDay']) => void) => expect(load(edit)?.message ?? null).toBeNull();

describe('the shipped End of day data loads', () => {
  it('copy.end and endOfDay', () => {
    expect(load(() => undefined)).toBeNull();
    expect(loadRaceDay(game).raceDay.copy.end.title).toBe("That's the card");
  });
});

describe('words: every line fits its field at its longest fill', () => {
  const line = (n: number) => 'x'.repeat(n);
  it.each(['up', 'even', 'down', 'none'])('the day\'s line "%s": 30 characters pass, 31 fail', (k) => {
    passes((r) => { r.copy.end.line[k] = line(30); });
    fails((r) => { r.copy.end.line[k] = line(31); }, `copy.end.line.${k}`);
  });
  it('the title: 20 characters pass beside the day pair (at most 72 px, x176), 21 fail', () => {
    passes((r) => { r.copy.end.title = line(20); });
    fails((r) => { r.copy.end.title = line(21); }, 'copy.end.title');
  });
  it.each(['started', 'ended', 'change', 'bets', 'winners', 'best'])('the label "%s" must leave 12 cells for its value: 17 pass, 18 fail', (k) => {
    passes((r) => { r.copy.end[k] = line(17); });
    fails((r) => { r.copy.end[k] = line(18); }, `copy.end.${k}`);
  });
  it('the sign templates at the biggest bankroll: "+{amount}" is 12 cells, "++{amount}" is 13', () => {
    passes((r) => { r.copy.end.plus = '+{amount}'; r.copy.end.minus = '-{amount}'; });
    fails((r) => { r.copy.end.plus = '++{amount}'; }, 'copy.end.plus');
    fails((r) => { r.copy.end.minus = '--{amount}'; }, 'copy.end.minus');
  });
  it('"None" and "Even" hold 12 cells', () => {
    passes((r) => { r.copy.end.noWinner = line(12); r.copy.end.even = line(12); });
    fails((r) => { r.copy.end.noWinner = line(13); }, 'copy.end.noWinner');
    fails((r) => { r.copy.end.even = line(13); }, 'copy.end.even');
  });
  it('"{bets} of {races}" at "8 of 8"', () => {
    fails((r) => { r.copy.end.betsOf = '{bets} out of all {races}'; }, 'copy.end.betsOf');
  });
  it('"New day" holds the 28 cells after the cursor', () => {
    passes((r) => { r.copy.end.newDay = line(28); });
    fails((r) => { r.copy.end.newDay = line(29); }, 'copy.end.newDay');
  });
  it('the card: "Race 8" fits before the box, "Paid $20,620.00" is the 15 cells it holds', () => {
    passes((r) => { r.copy.end.card.race = 'Race {r}'; });
    fails((r) => { r.copy.end.card.race = 'The race {r}'; }, 'copy.end.card.race');
    passes((r) => { r.copy.end.card.paid = 'Paid {total}'; });
    fails((r) => { r.copy.end.card.paid = 'Paid out {total}'; }, 'copy.end.card.paid');
    fails((r) => { r.copy.end.card.lost = 'Lost all of {amount} bet'; }, 'copy.end.card.lost');
    fails((r) => { r.copy.end.card.passed = line(24); }, 'copy.end.card.passed');
  });
});

describe('words: every hole in a template is a known one', () => {
  it('"+{amout}" fails at copy.end.plus, naming the hole', () => {
    const e = load((r) => { r.copy.end.plus = '+{amout}'; });
    expect(e!.issues.find((i) => i.path === 'copy.end.plus')!.message).toContain('{amout}');
  });
  it.each([
    ['minus', '-{amout}'], ['betsOf', '{bet} of {races}'], ['card.race', 'Race {n}'], ['card.paid', 'Paid {amount}'], ['card.lost', 'Lost {total}'],
  ])('copy.end.%s with "%s"', (k, bad) => {
    const [a, b] = k.split('.');
    fails((r) => { if (b) r.copy.end[a][b] = bad; else r.copy.end[a] = bad; }, `copy.end.${k}`);
  });
  it('a label or line may not carry a hole at all', () => {
    fails((r) => { r.copy.end.title = '{title}'; }, 'copy.end.title');
    fails((r) => { r.copy.end.line.up = 'Up {amount}'; }, 'copy.end.line.up');
  });
});

describe('the aria-live templates', () => {
  it('good ones load', () => passes((r) => { r.copy.end.aria.figure = '{label}: {value}'; }));
  it('an unknown hole fails', () => {
    fails((r) => { r.copy.end.aria.figure = '{label} {amount}'; }, 'copy.end.aria.figure');
    fails((r) => { r.copy.end.aria.row = '{race}, {post}, {odds}, {ticket}'; }, 'copy.end.aria.row');
    fails((r) => { r.copy.end.aria.passedRow = '{race}, {word}'; }, 'copy.end.aria.passedRow');
  });
  it('a template that drops a hole fails, so a figure is never read without its value', () => {
    fails((r) => { r.copy.end.aria.figure = '{label}'; }, 'copy.end.aria.figure');
    fails((r) => { r.copy.end.aria.row = '{race}, {ticket}'; }, 'copy.end.aria.row');
    fails((r) => { r.copy.end.aria.passedRow = '{race}'; }, 'copy.end.aria.passedRow');
  });
});

describe('words: banned words are found as whole words, from the list the other copy uses', () => {
  it('a banned word anywhere in copy.end fails, naming its field', () => {
    fails((r) => { r.copy.end.line.up = 'Take the payment now.'; }, 'copy.end.line.up');
    fails((r) => { r.copy.end.card.passed = 'Cash'; }, 'copy.end.card.passed'); // hub.json's list: "cash"
    fails((r) => { r.copy.end.aria.figure = '{label} buy {value}'; }, 'copy.end.aria.figure');
  });
  it('a banned word is whole-word only: "Buyers" and "Payments" are not "buy" or "payment"', () => {
    passes((r) => { r.copy.end.line.up = 'Buyers beware, nicely read.'; });
    passes((r) => { r.copy.end.line.up = 'Payments are not a thing.'; });
  });
  it('case does not matter', () => fails((r) => { r.copy.end.line.down = 'Real MONEY missed'; }, 'copy.end.line.down'));
});

describe('positions: nothing overlaps and the card ends above the New day box', () => {
  it('the card\'s last row: y205 with a box to y213 passes, a card that reaches y216 fails', () => {
    passes((r) => { r.endOfDay.value.cardTop = 128; });
    fails((r) => { r.endOfDay.value.cardTop = 131; }, 'endOfDay.value.cardTop'); // 131 + 77 + 8 = 216
    fails((r) => { r.endOfDay.value.cardPitch = 12; }, 'endOfDay.value.cardTop');
  });
  it('the boxes may not touch: a pitch under the 10-row box fails', () => {
    fails((r) => { r.endOfDay.value.cardPitch = 9; }, 'endOfDay.value.cardPitch');
  });
  it('the card starts below its rule', () => {
    fails((r) => { r.endOfDay.value.cardTop = 124; }, 'endOfDay.value.cardTop');
  });
  it('the six figures sit between the rules', () => {
    fails((r) => { r.endOfDay.value.firstRowTop = 20; }, 'endOfDay.value.firstRowTop');
    fails((r) => { r.endOfDay.value.rowPitch = 14; }, 'endOfDay.value.firstRowTop');
    fails((r) => { r.endOfDay.value.rowPitch = 7; }, 'endOfDay.value.rowPitch');
  });
  it('the title, track line, day\'s line and rules stack in order', () => {
    fails((r) => { r.endOfDay.value.trackTop = 8; }, 'endOfDay.value.trackTop');
    fails((r) => { r.endOfDay.value.lineTop = 100; }, 'endOfDay.value.lineTop');
    fails((r) => { r.endOfDay.value.lineTop = 120; }, 'endOfDay.value.lineTop');
  });
  it('the card\'s columns: race, box, odds and the longest ticket do not run into each other', () => {
    fails((r) => { r.endOfDay.value.card.boxX = 48; }, 'endOfDay.value.card.boxX');
    fails((r) => { r.endOfDay.value.card.oddsX = 70; }, 'endOfDay.value.card.oddsX');
    fails((r) => { r.endOfDay.value.card.oddsX = 100; }, 'endOfDay.value.card.ticketLastX');
    fails((r) => { r.endOfDay.value.card.passedX = 40; }, 'endOfDay.value.card.passedX');
  });
  it('the number sits inside the box', () => {
    fails((r) => { r.endOfDay.value.card.numberDx = 7; }, 'endOfDay.value.card.numberDx');
    fails((r) => { r.endOfDay.value.card.numberDy = 5; }, 'endOfDay.value.card.numberDy');
  });
  it('the New day line lies in its box, right of its cursor, and the box is on screen', () => {
    fails((r) => { r.endOfDay.value.action.top = 232; }, 'endOfDay.value.action.top');
    fails((r) => { r.endOfDay.value.action.textX = 12; }, 'endOfDay.value.action.textX');
    fails((r) => { r.endOfDay.value.action.box.x1 = 300; }, 'endOfDay.value.action.box');
  });
  it('a wrong type or an unknown key fails the schema, naming the field', () => {
    fails((r) => { r.endOfDay.value.cardTop = 'low'; }, 'endOfDay.value.cardTop');
    fails((r) => { r.endOfDay.value.extra = 1; }, 'endOfDay.value');
  });
});
