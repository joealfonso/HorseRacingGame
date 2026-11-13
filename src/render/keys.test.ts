import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { beatBegan, keyDown, keyState, keyUp } from './keys';
import { PAUSE_BOX, PAUSE_ITEMS, PAUSE_LAYOUT, closedPause, cursorFrame, moveFocus, openPause } from './pause';
import { rd } from './testkit';

// IN2: a key held when a screen (or a beat) opens is ignored until released, and
// auto-repeat never acts. PA1: the pause box. The scene holds the clock and the keys, so
// what can be tested headless is the pure state they run on, plus a read of the scene.

describe('IN2: keys held over from before are ignored until released', () => {
  // Updated on purpose (key guard fix, DECISIONS.md): the old rule ignored every event for a
  // handed-over key. A quick tap's keyup goes to the old screen, so the new screen cannot tell
  // a tap from a hold by the hand-off alone, and the next fresh press was swallowed. Now a key
  // that is genuinely held shows up as flagged repeats, and those never act. What this still
  // protects (IN2): a key held when a screen opens does nothing until released.
  it('IN2: a key down when the screen opens does nothing, even as it repeats', () => {
    let s = keyState(['Enter']);
    for (let i = 0; i < 5; i++) {
      const r = keyDown(s, 'Enter', true); // still held: the browser sends flagged repeats
      expect(r.act).toBe(false);
      s = r.state;
    }
    expect([...s.stale]).toEqual(['Enter']); // and it is still held over
  });

  // Updated on purpose (same fix): Space is still held over, and its flagged repeats are still
  // ignored, but an unflagged keydown for it now acts, because a browser only sends one after
  // the key came up (a quick tap whose keyup went to the old screen).
  it('IN2: once it is released, the next press acts', () => {
    let s = keyState(['Enter', 'Space']);
    s = keyUp(s, 'Enter');
    const r = keyDown(s, 'Enter', false);
    expect(r.act).toBe(true);
    // Space is still held over: its repeats are still ignored.
    expect(keyDown(r.state, 'Space', true).act).toBe(false);
    expect(keyDown(r.state, 'Space', false).act).toBe(true); // a fresh press proves it came up
  });

  it('IN2: keys that were not held act at once', () => {
    const s = keyState(['Enter']);
    expect(keyDown(s, 'ArrowUp', false).act).toBe(true);
    expect(keyDown(s, 'Digit3', false).act).toBe(true);
  });

  it('IN2: auto-repeat never acts, however long a fresh key is held', () => {
    let s = keyState();
    const first = keyDown(s, 'Enter', false);
    expect(first.act).toBe(true);
    s = first.state;
    for (let i = 0; i < 20; i++) {
      const r = keyDown(s, 'Enter', true);
      expect(r.act).toBe(false);
      s = r.state;
    }
    // Let go and press again: acts.
    s = keyUp(s, 'Enter');
    expect(keyDown(s, 'Enter', false).act).toBe(true);
  });

  it('IN2: a key pressed in one beat and still down when the next begins is ignored until released', () => {
    let s = keyState();
    s = keyDown(s, 'Enter', false).state; // pressed in the race: it skipped
    s = beatBegan(s); // the hold begins
    expect(keyDown(s, 'Enter', false).act).toBe(false); // an OS repeat that lost its flag, or a re-press without release
    s = keyUp(s, 'Enter');
    expect(keyDown(s, 'Enter', false).act).toBe(true);
  });

  it('IN2: a key that goes down after the beat began acts', () => {
    const s = beatBegan(keyState());
    expect(keyDown(s, 'Enter', false).act).toBe(true);
  });

  it('IN2: mashing Enter through the end of a race cannot skip a beat unseen', () => {
    // Enter is down as the wire hold begins; four more repeats come; none acts. A release
    // and a press does.
    let s = keyDown(keyState(), 'Enter', false).state;
    s = beatBegan(s);
    let acted = 0;
    for (let i = 0; i < 4; i++) {
      const r = keyDown(s, 'Enter', true);
      acted += r.act ? 1 : 0;
      s = r.state;
    }
    expect(acted).toBe(0);
    s = keyUp(s, 'Enter');
    expect(keyDown(s, 'Enter', false).act).toBe(true);
  });

  // Updated on purpose (same fix): handed-over keys now live in `stale`, and `down` holds only
  // what this screen saw go down. The no-mutation property is unchanged.
  it('IN2: the state is not mutated by a key event', () => {
    const s = keyState(['Space']);
    expect([...s.down]).toEqual([]);
    expect([...s.stale]).toEqual(['Space']);
    keyDown(s, 'Enter', false);
    keyDown(s, 'Space', false);
    keyDown(s, 'Space', true);
    keyUp(s, 'Space');
    beatBegan(s);
    expect([...s.down]).toEqual([]);
    expect([...s.stale]).toEqual(['Space']);
  });

  it('IN2: Space held for 4x counts only when it was pressed in this beat (the scene\'s rule)', () => {
    const src = readFileSync(new URL('../scenes/RaceScene.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/keys\.down\.has\('Space'\) && !this\.keys\.stale\.has\('Space'\)/);
    expect(src).toMatch(/beatBegan/);
  });
});

describe('PA1: the pause box', () => {
  it('PA1: the box is x64-191, y24-71, in the sky and clear of the horses', () => {
    expect(PAUSE_BOX.x).toBe(64);
    expect(PAUSE_BOX.y).toBe(24);
    expect(PAUSE_BOX.x + PAUSE_BOX.tilesW * 8 - 1).toBe(191);
    expect(PAUSE_BOX.y + PAUSE_BOX.tilesH * 8 - 1).toBe(71);
    // Horse frames start at hoofY 116 - 23 = y93 at the earliest; the box ends at 71.
    expect(PAUSE_BOX.y + PAUSE_BOX.tilesH * 8).toBeLessThan(92);
  });

  it('PA1: it holds Resume and Back to card, in that order, with the words from data', () => {
    expect(PAUSE_ITEMS).toEqual(['resume', 'back']);
    expect(rd.copy.pause).toEqual({ title: 'Paused', resume: 'Resume', back: 'Back to card' });
  });

  it('PA1: the text and the cursor sit inside the box', () => {
    const inside = (x: number, y: number) => x >= 64 && x <= 191 && y >= 24 && y <= 71;
    expect(inside(PAUSE_LAYOUT.title.x, PAUSE_LAYOUT.title.y)).toBe(true);
    for (const it of PAUSE_LAYOUT.items) expect(inside(it.x + rd.copy.pause.back.length * 8 - 1, it.y + 7)).toBe(true);
    expect(inside(PAUSE_LAYOUT.cursorX, PAUSE_LAYOUT.items[0].y)).toBe(true);
    expect(PAUSE_LAYOUT.cursorX + 8).toBeLessThanOrEqual(PAUSE_LAYOUT.items[0].x);
  });

  it('PA1: opening starts on Resume; closing closes', () => {
    const o = openPause(12.5);
    expect(o).toEqual({ open: true, focus: 0, openedAt: 12.5 });
    expect(closedPause().open).toBe(false);
  });

  it('PA1: focus moves between Resume and Back to card and wraps both ways', () => {
    let s = openPause(0);
    s = moveFocus(s, 1);
    expect(PAUSE_ITEMS[s.focus]).toBe('back');
    s = moveFocus(s, 1);
    expect(PAUSE_ITEMS[s.focus]).toBe('resume'); // wrapped down
    s = moveFocus(s, -1);
    expect(PAUSE_ITEMS[s.focus]).toBe('back'); // wrapped up
    s = moveFocus(s, -1);
    expect(PAUSE_ITEMS[s.focus]).toBe('resume');
    expect(moveFocus(openPause(0), 5).focus).toBe(1);
    expect(moveFocus(openPause(0), -3).focus).toBe(1);
  });

  it('PA1: moving the focus changes nothing else about the pause', () => {
    const o = openPause(4);
    const m = moveFocus(o, 1);
    expect(m.open).toBe(true);
    expect(m.openedAt).toBe(4);
  });

  it('PA1: only the cursor bobs: two frames, swapping at the data rate, no faster than 4 a second', () => {
    const rate = rd.ambient.cursorSwapsPerSecond.value;
    expect(rate).toBeLessThanOrEqual(4);
    expect(cursorFrame(0, rate)).toBe(0);
    expect(cursorFrame(0.49, rate)).toBe(0);
    expect(cursorFrame(0.5, rate)).toBe(1);
    expect(cursorFrame(0.99, rate)).toBe(1);
    expect(cursorFrame(1, rate)).toBe(0);
    expect(cursorFrame(-3, rate)).toBe(0);
    let swaps = 0;
    for (let t = 1 / 60, prev = cursorFrame(0, rate); t <= 3; t += 1 / 60) {
      const f = cursorFrame(t, rate);
      if (f !== prev) swaps++;
      prev = f;
    }
    expect(swaps).toBeGreaterThanOrEqual(5);
    expect(swaps).toBeLessThanOrEqual(6 + 1);
  });

  // The scene's update(): while paused it adds to its own UI clock and returns before it
  // ticks the race clock, so race time, wall-timed calls and messages and ambient loops
  // (all pure functions of that clock) hold. Reading the scene is the headless check.
  it('PA1: the scene returns from update before ticking the race clock while paused', () => {
    const src = readFileSync(new URL('../scenes/RaceScene.ts', import.meta.url), 'utf8');
    const update = src.slice(src.indexOf('update(_time'), src.indexOf('/** Every clock change'));
    const pausedAt = update.indexOf('this.pause.open');
    const returnAt = update.indexOf('return;', pausedAt);
    const tickAt = update.indexOf('tick(');
    expect(pausedAt).toBeGreaterThan(-1);
    expect(returnAt).toBeGreaterThan(pausedAt);
    expect(tickAt).toBeGreaterThan(returnAt);
  });

  // Updated on purpose with step 5: "Back to card" used to restart the race scene on the next
  // seed because there was no card. It now goes to the Card with the abandoned race's seed
  // spent, which is tested on the session (LP1 in sessionLoop.test.ts) and here on the scene.
  it('PA1: Esc or Enter on Resume resumes; Enter on Back to card goes to the card with the seed already spent', () => {
    const src = readFileSync(new URL('../scenes/RaceScene.ts', import.meta.url), 'utf8');
    const act = src.slice(src.indexOf('private act('), src.indexOf('private setText'));
    const paused = act.slice(act.indexOf('if (this.pause.open)'), act.indexOf("if (code === 'KeyP'"));
    expect(paused).toMatch(/Escape[\s\S]*closedPause/);
    expect(paused).toMatch(/PAUSE_ITEMS\[this\.pause\.focus\] === 'resume'[\s\S]*closedPause/);
    expect(paused).toMatch(/else if \(enter\) this\.backToCard\(\)/);
    const back = src.slice(src.indexOf('private backToCard'), src.indexOf('private bindKeys'));
    expect(back).toContain("this.scene.start('card'");
    expect(back).toContain('session: this.session'); // the session this race was sent to the post with: already on the next race
    expect(back).not.toMatch(/nextRace\(|raceNumber \+ 1/); // it does not spend another seed
    expect(act).toMatch(/KeyP[\s\S]*openPause/);
  });
});
