import { describe, expect, it } from 'vitest';
import bettingJson from '../data/betting.json';
import { daySummary, goToPost, newDay, settle, type DayState } from '../bet/day';
import { loadBook } from '../data/bookLoad';
import { ctx, DAY_SEED, dayWith, fakeResult, programOf, rd, settled } from './betKit';
import { clothFor } from './page';
import {
  CHANGE_DOWN_COLOR, CHANGE_UP_COLOR, END_CONFIRM_KEYS, END_POINTER_KEYS, changeFigure, dayOutcome, endOfDayPointerTargets, endOfDayScreen,
} from './endOfDayScreen';
import type { PageText } from './page';

// BE1, BE2 (docs/specs/betting-screens.md sections 6 and 9, and section 10's day's card),
// BS4's counterpart for the aria text, and DESIGN "End of day, the back page". Expected
// values are written out from the spec, not worked out by the code under test.

const book = loadBook();
const TRACK = ctx.races[0].track;
const page = (state: DayState, c = ctx) =>
  endOfDayScreen({ rd, book, trackName: TRACK, summary: daySummary(c, state), records: state.records });

const at = (s: { texts: PageText[] }, text: string, y?: number): PageText => {
  const hits = s.texts.filter((t) => t.text === text && (y === undefined || t.y === y));
  expect(hits.length, `"${text}" at y${y}`).toBe(1);
  return hits[0];
};
const row = (s: { texts: PageText[] }, y: number) => s.texts.filter((t) => t.y === y).sort((a, b) => a.x - b.x);

/** Race r bet at `post` for `dollars` with `winner` winning; the other races passed, to the eighth. */
function dayOf(bets: Record<number, { post: number; dollars: number; winner: number }>): DayState {
  let day = dayWith(10000);
  for (let r = 1; r <= 8; r++) {
    const b = bets[r];
    day = settled(programOf(r), day, b ? { post: b.post, dollars: b.dollars } : null, b ? b.winner : 1);
  }
  return day;
}
const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

describe('the page, laid out as the wireframe and DESIGN have it', () => {
  const day = dayOf({ 1: { post: 3, dollars: 2, winner: 3 }, 4: { post: 5, dollars: 10, winner: 1 } });
  const s = page(day);

  it('paper, the rules at y24, y104 and the card\'s y124, each 1 px Ink across x8-247', () => {
    expect(s.paper).toBe('Parchment');
    const rules = s.rects.filter((r) => r.h === 1 && r.w === 240);
    expect(rules.map((r) => [r.x, r.y, r.color])).toEqual([[8, 24, 'Ink'], [8, 104, 'Ink'], [8, 124, 'Ink']]);
  });

  it('the title is Maroon at x8 y4, never Red, and it is the only title', () => {
    const t = at(s, "That's the card");
    expect(t).toMatchObject({ x: 8, y: 4, color: 'Maroon' });
    expect(s.texts.some((x) => x.text.includes('Tapped'))).toBe(false);
  });

  it('"Day" in the main font and "#12345" in the small font, Ink, ending at x247, on the title\'s baseline', () => {
    const label = at(s, 'Day');
    const num = at(s, `#${DAY_SEED}`);
    expect(label).toMatchObject({ y: 4, color: 'Ink' });
    expect(label.small).toBeUndefined();
    expect(num).toMatchObject({ y: 6, color: 'Ink', small: true });
    // "Day" is 3 cells (24 px) plus a 4 px gap, then 6 small cells of 4 px: 28 + 24 = 52 px, last column x247.
    expect(label.x).toBe(248 - 52);
    expect(num.x + 4 * 6 - 1).toBe(247);
  });

  it('the track name is Ink at y14', () => {
    expect(at(s, TRACK)).toMatchObject({ x: 8, y: 14, color: 'Ink' });
  });

  it('the six figures sit at y32 + 12 * i: labels at x8, values ending at x247, main font', () => {
    const labels = ['Started with', 'Ended with', 'Change', 'Bets made', 'Winners hit', 'Best price hit'];
    labels.forEach((l, i) => expect(at(s, l, 32 + 12 * i)).toMatchObject({ x: 8, color: 'Ink' }));
    for (let i = 0; i < 6; i++) {
      const [, value] = row(s, 32 + 12 * i);
      expect(value.x + 8 * value.text.length, `row ${i}`).toBe(248);
      expect(value.small).toBeUndefined();
    }
  });

  it('the day\'s line is Ink at x8 y112, and "New day" is at x20 y220 with the cursor at x8 y220', () => {
    expect(row(s, 112)).toHaveLength(1);
    expect(row(s, 112)[0]).toMatchObject({ x: 8, color: 'Ink' });
    expect(at(s, 'New day')).toMatchObject({ x: 20, y: 220, color: 'Ink' });
    expect(s.cursor).toEqual({ x: 8, y: 220 });
  });

  it('nothing is a Red title or an Emerald figure: Red and Turf appear only on the Change value', () => {
    const colored = s.texts.filter((t) => t.color === 'Red' || t.color === 'Turf' || t.color === 'Emerald');
    expect(colored.every((t) => t.y === 56)).toBe(true);
  });
});

describe('BE1 the figures match the day record', () => {
  it('a day with a win and a loss: started, ended, bets made, winners hit and the best price', () => {
    const day = dayOf({ 1: { post: 3, dollars: 2, winner: 3 }, 4: { post: 5, dollars: 10, winner: 1 } });
    const sum = daySummary(ctx, day);
    const s = page(day);
    const value = (y: number) => row(s, y)[1].text;
    expect(value(32)).toBe('$100.00');
    expect(value(44)).toBe(dollars(day.bankrollCents));
    expect(value(68)).toBe('2 of 8');
    expect(value(80)).toBe('1');
    expect(value(92)).toBe(day.records[0].ticket!.odds);
    expect(sum.winnersHit).toBe(1);
  });

  it('a day of passes: Even in Ink, 0 of 8, 0 winners and "None"', () => {
    const day = dayOf({});
    const s = page(day);
    expect(row(s, 32)[1].text).toBe('$100.00');
    expect(row(s, 44)[1].text).toBe('$100.00');
    expect(row(s, 56)[1]).toMatchObject({ text: 'Even', color: 'Ink' });
    expect(row(s, 68)[1].text).toBe('0 of 8');
    expect(row(s, 80)[1].text).toBe('0');
    expect(row(s, 92)[1].text).toBe('None');
  });

  it('a lost day: "None" for the best price when nothing won', () => {
    const s = page(dayOf({ 2: { post: 3, dollars: 2, winner: 4 } }));
    expect(row(s, 80)[1].text).toBe('0');
    expect(row(s, 92)[1].text).toBe('None');
  });

  it('a day cut short (test rules: a $3 start, so one $2 loss leaves $1): "Bets made" counts races run, one row on the card', () => {
    const cut = { ...ctx, rules: { ...ctx.rules, startCents: 300 } };
    let day = newDay(cut, DAY_SEED);
    day = settle(cut, goToPost(cut, day, programOf(1), { post: 3, dollars: 2 }), fakeResult(programOf(1), 4));
    expect(day.ended).toBe('broke');
    const s = page(day, cut);
    expect(row(s, 32)[1].text).toBe('$3.00');
    expect(row(s, 44)[1].text).toBe('$1.00');
    expect(row(s, 56)[1]).toMatchObject({ text: '-$2.00', color: 'Red' });
    expect(row(s, 68)[1].text).toBe('1 of 1');
    // Title and line are the ones its outcome earns, with no words of its own.
    expect(at(s, "That's the card").color).toBe('Maroon');
    expect(row(s, 112)[0].text).toBe('The horses had other ideas.');
    // One card row only: no row for a race the player was shut out of.
    expect(s.texts.filter((t) => /^Race \d$/.test(t.text)).map((t) => t.text)).toEqual(['Race 1']);
    expect(row(s, 139)).toHaveLength(0);
  });
});

describe('the Change figure: sign and color', () => {
  const copy = rd.copy.end;
  it('up is Turf with a plus sign', () => expect(changeFigure(copy, 2740)).toEqual({ text: '+$27.40', color: 'Turf' }));
  it('down is Red with a minus sign', () => expect(changeFigure(copy, -2740)).toEqual({ text: '-$27.40', color: 'Red' }));
  it('even is the word "Even" in Ink', () => expect(changeFigure(copy, 0)).toEqual({ text: 'Even', color: 'Ink' }));
  it('the colors are the ones DESIGN names', () => {
    expect(CHANGE_UP_COLOR).toBe('Turf');
    expect(CHANGE_DOWN_COLOR).toBe('Red');
  });
  it('on the page: a winning day shows "+" in Turf, a losing day "-" in Red, ending at x247', () => {
    const up = page(dayOf({ 1: { post: 3, dollars: 10, winner: 3 } }));
    const sumUp = daySummary(ctx, dayOf({ 1: { post: 3, dollars: 10, winner: 3 } }));
    expect(sumUp.changeCents).toBeGreaterThan(0);
    const upValue = row(up, 56)[1];
    expect(upValue).toMatchObject({ text: `+${dollars(sumUp.changeCents)}`, color: 'Turf' });
    expect(upValue.x + 8 * upValue.text.length).toBe(248);
    const down = page(dayOf({ 1: { post: 3, dollars: 10, winner: 4 } }));
    expect(row(down, 56)[1]).toMatchObject({ text: '-$10.00', color: 'Red' });
  });
});

describe('BE2 the title and the day\'s line follow the table, one per outcome', () => {
  const base = daySummary(ctx, dayOf({ 1: { post: 3, dollars: 2, winner: 3 } }));
  const lineOf = (over: Partial<typeof base>) =>
    row(endOfDayScreen({ rd, book, trackName: TRACK, summary: { ...base, ...over }, records: [] }), 112)[0].text;
  const titleOf = (over: Partial<typeof base>) =>
    endOfDayScreen({ rd, book, trackName: TRACK, summary: { ...base, ...over }, records: [] }).texts.filter((t) => t.color === 'Maroon').map((t) => t.text);

  it('ended up', () => expect(lineOf({ betsMade: 2, changeCents: 2740 })).toBe('Up on the day. Nicely read.'));
  it('ended even', () => expect(lineOf({ betsMade: 2, changeCents: 0 })).toBe('Square on the day. Not bad.'));
  it('ended down', () => expect(lineOf({ betsMade: 2, changeCents: -200 })).toBe('The horses had other ideas.'));
  it('bet nothing all day', () => expect(lineOf({ betsMade: 0, changeCents: 0 })).toBe('Watched all eight for free.'));
  it('the title is "That\'s the card" for every outcome, and the only Maroon text', () => {
    for (const over of [{ betsMade: 2, changeCents: 5 }, { betsMade: 2, changeCents: 0 }, { betsMade: 2, changeCents: -5 }, { betsMade: 0, changeCents: 0 }]) {
      expect(titleOf(over)).toEqual(["That's the card"]);
    }
  });
  it('dayOutcome', () => {
    expect(dayOutcome({ betsMade: 0, changeCents: 0 })).toBe('none');
    expect(dayOutcome({ betsMade: 1, changeCents: 1 })).toBe('up');
    expect(dayOutcome({ betsMade: 1, changeCents: 0 })).toBe('even');
    expect(dayOutcome({ betsMade: 1, changeCents: -1 })).toBe('down');
  });
});

describe('BE1 the day\'s card: one row per race run', () => {
  // Race 1 paid ($10 on post 3, which won), race 2 lost ($2 on post 6), race 3 passed, then five passes.
  const day = dayOf({ 1: { post: 3, dollars: 10, winner: 3 }, 2: { post: 6, dollars: 2, winner: 1 } });
  const s = page(day);
  const top = (i: number) => 128 + 11 * i;

  it('cell tops at y128 + 11 * i, "Race {r}" at x8, one row per race run (eight)', () => {
    for (let i = 0; i < 8; i++) expect(at(s, `Race ${i + 1}`, top(i))).toMatchObject({ x: 8, color: 'Ink' });
    expect(s.texts.filter((t) => /^Race \d$/.test(t.text))).toHaveLength(8);
  });

  it('a bet that paid: the box at x64-73 rows y-1 to y+8, its odds from x80, "Paid {total}" ending at x247, all Ink', () => {
    const y = top(0);
    const t = day.records[0].ticket!;
    const cloth = clothFor(rd, 3);
    expect(s.rects).toContainEqual({ x: 64, y: y - 1, w: 10, h: 10, color: 'Ink' });
    expect(s.rects).toContainEqual({ x: 65, y, w: 8, h: 8, color: cloth.fill });
    expect(row(s, y + 1).find((x) => x.small)).toMatchObject({ text: '3', x: 67, color: cloth.number });
    expect(at(s, t.odds, y)).toMatchObject({ x: 80, color: 'Ink' });
    const paid = at(s, `Paid ${dollars(day.records[0].returnCents)}`, y);
    expect(paid.x + 8 * paid.text.length).toBe(248);
    expect(paid.color).toBe('Ink');
  });

  it('a bet that lost: the box, the odds and "Lost $2", all Ink, no total', () => {
    const y = top(1);
    const t = day.records[1].ticket!;
    expect(s.rects).toContainEqual({ x: 64, y: y - 1, w: 10, h: 10, color: 'Ink' });
    expect(s.rects).toContainEqual({ x: 65, y, w: 8, h: 8, color: clothFor(rd, 6).fill });
    expect(row(s, y + 1).find((x) => x.small)).toMatchObject({ text: '6', x: 67 });
    expect(at(s, t.odds, y).x).toBe(80);
    const lost = at(s, 'Lost $2', y);
    expect(lost.x + 8 * lost.text.length).toBe(248);
    expect(lost.color).toBe('Ink');
  });

  it('a pass: no box, no odds, "Passed" at x64', () => {
    const y = top(2);
    expect(at(s, 'Passed', y)).toMatchObject({ x: 64, color: 'Ink' });
    expect(row(s, y).map((t) => t.text)).toEqual(['Race 3', 'Passed']);
    expect(s.rects.filter((r) => r.y >= y - 1 && r.y < y + 9 && r.x >= 64 && r.x < 74)).toEqual([]);
    expect(row(s, y + 1).filter((t) => t.small)).toEqual([]);
  });

  it('a day of passes lists "Passed" eight times and no box', () => {
    const p = page(dayOf({}));
    expect(p.texts.filter((t) => t.text === 'Passed')).toHaveLength(8);
    expect(p.rects.filter((r) => r.y >= 127 && r.w === 10)).toEqual([]);
  });

  it('the card is Ink only: Turf and Red appear on no card row', () => {
    expect(s.texts.filter((t) => t.y >= 128 && !t.small).every((t) => t.color === 'Ink')).toBe(true);
  });

  it('the last row (race 8) sits at y205, above the rule\'s New day line', () => {
    expect(top(7)).toBe(205);
  });
});

describe('copy fits its field with the longest values, and the aria text', () => {
  const c = rd.copy.end;
  it('the day\'s lines hold 30 cells; labels and values fit side by side', () => {
    for (const l of Object.values(c.line)) expect(l.length).toBeLessThanOrEqual(30);
    const longestValue = '+$165,000.00';
    expect(c.best.length).toBe(14);
    for (const l of [c.started, c.ended, c.change, c.bets, c.winners, c.best]) expect(l.length + longestValue.length).toBeLessThanOrEqual(30);
  });
  it('"Paid $20,620.00" is 15 cells, from x128, clear of the odds that end at x111 and the box', () => {
    const paid = c.card.paid.replace('{total}', '$20,620.00');
    expect(paid).toBe('Paid $20,620.00');
    expect(248 - 8 * paid.length).toBe(128);
    expect(80 + 8 * 4).toBeLessThanOrEqual(128);
    expect(8 + 8 * 'Race 8'.length).toBeLessThanOrEqual(64);
  });
  it('the title and the day pair share the line without touching', () => {
    expect(8 + 8 * c.title.length).toBeLessThan(248 - 52);
  });
  it('no string in the End of day copy holds a banned word', () => {
    const all = JSON.stringify(c).toLowerCase();
    for (const w of bettingJson.copy.bannedWords) expect(all, w).not.toContain(w.toLowerCase());
  });
  it('the aria text reads the title, the day, the figures, the line, the card and New day, and never the estimate', () => {
    const day = dayOf({ 1: { post: 3, dollars: 10, winner: 3 } });
    const a = page(day).aria;
    for (const part of ["That's the card.", `Day #${DAY_SEED}.`, TRACK + '.', 'Started with $100.00.', 'Bets made 1 of 8.', 'Race 1, #3,', 'Race 2, Passed.', 'New day.']) expect(a, part).toContain(part);
    expect(a.toLowerCase()).not.toMatch(/estimate|rating|chance/);
  });
});

describe('the keys and the one pointer target', () => {
  it('Enter, Space or Z are New day', () => {
    for (const k of ['Enter', 'Space', 'KeyZ']) expect(END_CONFIRM_KEYS).toContain(k);
    expect(END_CONFIRM_KEYS).not.toContain('Escape');
  });
  it('the target is "New day", x8-247 y216-231, and a click stands for Enter', () => {
    expect(endOfDayPointerTargets(rd)).toEqual([{ id: 'newDay', box: { x0: 8, y0: 216, x1: 247, y1: 231 } }]);
    expect(END_POINTER_KEYS.newDay).toEqual(['Enter']);
    for (const k of END_POINTER_KEYS.newDay) expect(END_CONFIRM_KEYS).toContain(k);
  });
});

describe('the aria-live joining words come from data (book-and-window.md 23.6)', () => {
  const day = dayOf({ 1: { post: 3, dollars: 10, winner: 3 } });
  const withAria = (aria: Partial<typeof rd.copy.end.aria>) =>
    endOfDayScreen({
      rd: { ...rd, copy: { ...rd.copy, end: { ...rd.copy.end, aria: { ...rd.copy.end.aria, ...aria } } } },
      book, trackName: TRACK, summary: daySummary(ctx, day), records: day.records,
    }).aria;

  it('the shipped templates give the text the page read before they were data', () => {
    const e = rd.copy.end.aria;
    expect(e).toEqual({ figure: '{label} {value}', row: '{race}, #{n}, {odds}, {ticket}', passedRow: '{race}, {passed}' });
    const a = page(day).aria;
    expect(a).toContain('Started with $100.00.');
    expect(a).toContain(`Race 1, #3, ${day.records[0].ticket!.odds}, Paid ${dollars(day.records[0].returnCents)}.`);
    expect(a).toContain('Race 2, Passed.');
  });
  it('a figure reads through its template', () => expect(withAria({ figure: '{label}: {value}' })).toContain('Started with: $100.00.'));
  it('a bet row reads through its template', () => expect(withAria({ row: '{race} on #{n}, {ticket}, {odds}' })).toMatch(/Race 1 on #3, Paid \$[\d.,]+, \d+-\d+\./));
  it('a passed row reads through its template', () => expect(withAria({ passedRow: '{race}; {passed}' })).toContain('Race 2; Passed.'));
});

describe('the saddlecloth number prints the post as it is', () => {
  const day = dayOf({ 1: { post: 3, dollars: 2, winner: 3 } });
  const withPost = (post: number) => {
    const rec = { ...day.records[0], ticket: { ...day.records[0].ticket!, post } };
    return endOfDayScreen({ rd, book, trackName: TRACK, summary: daySummary(ctx, day), records: [rec] });
  };
  const small = (s: { texts: PageText[] }) => s.texts.filter((t) => t.small && t.y === 129);
  it('posts 1 to 8 print their digit at x67', () => {
    for (let p = 1; p <= 8; p++) expect(small(withPost(p)).map((t) => [t.text, t.x])).toEqual([[String(p), 67]]);
  });
  it('a post 10 reads "10", never "0", and stays inside the 8 px fill (x65-72)', () => {
    const [t] = small(withPost(10));
    expect(t.text).toBe('10');
    expect(t.x).toBeGreaterThanOrEqual(65);
    expect(t.x + 4 * 2 - 1).toBeLessThanOrEqual(72);
  });
});
