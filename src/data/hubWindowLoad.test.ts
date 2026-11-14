import { describe, expect, it } from 'vitest';
import bettingJson from './betting.json';
import hubJson from './hub.json';
import paletteJson from './palette.json';
import { validateHub, type HubInput } from './hubLoad';
import { DataError } from './validate';

// hub.json's book row, focus and window section (docs/specs/book-and-window.md sections 7, 8,
// 13 and 15 item 2): each problem fails at load with the file and the field.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;
const input = (edit: (h: Raw) => void = () => {}): HubInput => {
  const hub = structuredClone(hubJson) as Raw;
  edit(hub);
  return { hub, bannedWords: bettingJson.copy.bannedWords, colors: paletteJson.colors.map((c) => c.name), fieldSize: 8 };
};
const failure = (edit: (h: Raw) => void): DataError => {
  try { validateHub(input(edit)); } catch (e) { if (e instanceof DataError) return e; throw e; }
  throw new Error('expected validateHub to throw');
};

describe('the track box rows (section 8, TB1)', () => {
  it('ships three rows, Read, Bet, Watch, at y206, y215, y224, voice rows at y185 and y194', () => {
    const b = validateHub(input()).box.value;
    expect(b.doorRows.map((r) => [r.door, r.top])).toEqual([['read', 206], ['windows', 215], ['rail', 224]]);
    expect(b.voiceTops).toEqual([185, 194]);
  });

  it('no book row fails', () => {
    const err = failure((h) => { h.box.value.doorRows.splice(0, 1); delete h.copy.doors.read; h.focus.value = { arrival: 'windows', back: 'windows', fromLookable: 'windows' }; });
    expect(err.file).toBe('src/data/hub.json');
    expect(err.message).toContain('box.value.doorRows');
    expect(err.message).toContain('no row for the book');
  });

  it('a row that is neither a door nor the book fails', () => {
    expect(failure((h) => { h.box.value.doorRows[0].door = 'snackCart'; }).message).toContain('box.value.doorRows[0].door');
  });

  it('rows out of order, or a row\'s text outside its item box, fail', () => {
    expect(failure((h) => { h.box.value.doorRows[1].top = 200; }).message).toContain('box.value.doorRows[1].top');
    expect(failure((h) => { h.box.value.doorRows[2].top = 226; }).message).toContain('box.value.doorRows[2].item');
  });

  it('voice row 2 running into the first row fails', () => {
    expect(failure((h) => { h.box.value.voiceTops = [185, 200]; }).message).toContain('box.value.voiceTops');
  });

  it('a focus that is not a row fails, naming the field', () => {
    expect(failure((h) => { h.focus.value.arrival = 'fans'; }).message).toContain('focus.value.arrival');
    expect(failure((h) => { h.focus.value.back = 'nowhere'; }).message).toContain('focus.value.back');
  });

  it('the Read label is required and held to 28 with the widest race number', () => {
    expect(failure((h) => { delete h.copy.doors.read; }).message).toContain('copy.doors.read');
    expect(failure((h) => { h.copy.doors.read = 'Read the whole program for Race {r}'; }).message).toContain('copy.doors.read');
  });
});

describe('the window section (section 7, WI6)', () => {
  it('a clerk line over 28 characters, or with a banned word, fails', () => {
    expect(failure((h) => { h.copy.window.ticket[1] = 'Take all the time in the world.'; }).message).toContain('copy.window.ticket[1]');
    expect(failure((h) => { h.copy.window.punch[0] = 'Buy another one?'; }).message).toContain('copy.window.punch[0]');
    expect(failure((h) => { h.copy.window.choose = 'Race {r}. Who do you like the most of all?'; }).message).toContain('copy.window.choose');
  });

  it('"Esc: back" must fit its box (x176-247, 9 characters)', () => {
    expect(failure((h) => { h.copy.window.back = 'Esc: go back'; }).message).toContain('copy.window.back');
  });

  it('an empty line cycle fails', () => {
    expect(failure((h) => { h.copy.window.punch = []; }).message).toContain('copy.window.punch');
  });

  it('rows that run into the line, or overlapping pointer boxes, fail', () => {
    expect(failure((h) => { h.window.value.rows.pitch = 12; }).message).toContain('window.value.rows');
    expect(failure((h) => { h.window.value.ticket.back.y0 = 210; }).message).toContain('window.value.ticket.back');
  });

  it('a box off the screen fails', () => {
    expect(failure((h) => { h.window.value.frame.tilesH = 20; }).message).toContain('window.value.frame');
  });
});
