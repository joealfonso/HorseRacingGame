# M1 spec: race-day screens

Status: draft for Joseph's review. Written 2026-11-12 by the designer. It covers what the player sees and does around one race, built on the result shape in `src/sim/result.ts` (`SIM_VERSION` 3) and the approved DESIGN.md, including its Charm section and placeholder race rule. The sim is in `docs/specs/m1-race-sim.md` and is not changed here.

Marks used: **(final)** means I would not reopen it without new evidence. **(open)** means it waits on a question at the end. **[T]** criteria are tested headless in `npm test`. **[E]** criteria need eyes on the running build.

## 1. The problem

The sim runs and nobody can watch it. The app shows an M0 checkerboard. M1's gate is "ten races in a row still make you care who wins", and Joseph cannot judge that from JSON.

Caring needs three things the sim already supplies the raw material for, and the screens must turn into feeling:

1. **A stake.** A horse that is yours for this race, so the finish has a side.
2. **A decision with a visible consequence.** The orders you gave, and a trip you can read afterwards.
3. **A race that tells a story while it runs.** Who leads, where yours is, what went wrong, how close it was.

Charm is the fourth, at Joseph's request: the screens should feel like an 8-bit race day, not a debug view.

## 2. The user

Joseph, playing his own build at a desk, keyboard, 3x or 4x scale, running ten races back to back in one sitting to judge the gate. He knows racing and UX well. He has no time for dead screens, and he will notice a lie: a call that disagrees with the chart, a photo that shows the wrong horse in front.

Later players are the same shape, a racing-curious desktop player, but M1 is built for the gate.

**Assumption that carries the design:** picking one horse per race and giving it orders is enough stake to care about ten races with no money. Test: during the gate run, Joseph notes, per race, whether he changed horse, whether he changed orders, and whether he skipped part of the race. If he stops changing anything by race 4, or skips the race itself, the stake is too thin, and the first levers are in open question 9.

## 3. The decisions

### 3.1 Which horse the player instructs (final)

**The player picks one horse from the eight before each race and gives that horse its orders. The other seven run on the orders in `card.json`.** The next race starts with the same horse and the same orders already chosen, so changing nothing costs two key presses.

Why:
- One horse gives a side to root for. Picking it is the stake, with no betting or money.
- Picking each race lets ten races feel different: the speed horse from post 2, then the closer from post 7. The card is built so every horse wins 3 to 35 percent of races (sim F5), so no pick is hopeless and none is a lock.
- The sim's tuning was measured by changing one horse and leaving the rest on default. One instructed horse is the case the numbers describe.

Rejected:
- **Instruct all eight.** No side to take, and it turns the race into puppetry. It also leaves the player asking "which one am I watching?"
- **One fixed horse for all ten races.** It pretends to an ownership that M2 builds properly. If the fixed horse is weak, ten races of losing; if strong, ten of the same story.

How they know which is theirs: the same Yellow arrow on every screen. Above the cap in the race view, under its box in the running order strip, a 3x3 dot with a Yellow ring on the mini map, a marker and Yellow name on the result list. Shape and color together, never color alone.

### 3.2 The loop (final)

```
boot -> [data error] or
Card -> Orders (paddock) -> Race day sequence -> [Photo] -> Winner's circle -> Result -> Card ...
```

The race day sequence is one scene: post parade, call to the post, the gate, the race, the wire, the winner beat. Ceremony only happens before the start and after the wire (DESIGN Charm cap).

### 3.3 How race n+1 differs (final for M1, see open question 9)

- **The seed advances by one each time the player sends the horses to the post.** Abandoning a race from the pause box still uses up its seed, so you cannot peek at a race and rerun it.
- The first seed comes from `?seed=N` in the URL if present and valid (open question 3), otherwise a random whole number from `crypto.getRandomValues`, drawn in app code outside `src/sim/`. Race n uses `(first + n) mod 4294967296`.
- Nothing else changes by itself: same card, same posts, same going, same bias. A new seed already moves today's form, gate breaks, rhythm and luck, which is what the sim draws per race.
- The player can change, between races: which horse is theirs, and its three orders.
- What makes the tenth race feel different from the first, beside the seed: the announcer's lines rotate by race number (no line repeats on the same pole in consecutive races), each horse carries a session form line on the card ("Today: 1st 4th 2nd"), and the result shows the player's record for the day. The last two are a separate, cuttable build step (step 8).

Rejected: a post draw each race and a going change each race. Both are real variety, but both change inputs the brief calls hardcoded, and a post draw needs its own random source outside the sim. They are the first levers if ten races feel samey, not the default.

### 3.4 Playback speed and skipping (final)

- The race clock always shows real race time from the sim. Playback runs at **2x** real time by default, so a 2:01.55 race plays in about 61 seconds.
- Hold **Space** to play at 4x. Release to return to 2x. A "4x" tag shows in the top bar while held.
- **Enter** skips forward by one beat: during the parade, call to post or gate, straight to the gate opening; during the race, before the 1/4 pole, to the moment the leader reaches the 1/4 pole; after it, to the wire; during the finish beats, to the next beat.
- Time advances by the frame's real elapsed time, capped at 50 ms per frame, so a 120 Hz screen plays at the same speed as a 60 Hz one and a stalled tab does not jump the race.

Why 2x: the brief caps sim plus animation at 90 seconds for a 10-furlong race. At 2x the worst case in the sim's winning-time band (2:05.00) is 62.5 seconds of racing, which leaves about 20 seconds for ceremony and the finish beats. Skip to the 1/4 pole exists because the stretch is where caring happens, and ten full races is 10 minutes of watching.

Rejected: skip straight to the result from the gate. It removes the thing the gate is testing. A player who wants it can press Enter three times.

### 3.5 Camera (final, values are starting guesses in data)

World mapping, all whole pixels:
- `x = floor(distance * 4 / 100)`: replay distance is hundredths of a foot, 4 px per foot, so one 8-foot length is 32 px, the width of the horse frame. Honest margins: a horse a length ahead is one body ahead.
- `hoofY = 116 + floor(lane * 4 / 100)`: lane is hundredths of a lane, 4 px per lane (DESIGN), lanes 0 to 8 give hoof lines y116 to y148.
- Positions between replay samples are linear, then floored once. Every layer uses the same floored value, so nothing shimmers.

Following rule, with L the leader's nose x, P the player's nose x, W the wire x, all world px:
- **Race:** `cam = min(L - 200, P - 56)`. The leader sits at screen x 200 when your horse is within 4.5 lengths. When yours is further back, your horse holds at screen x 56 and the leader runs off the right edge. Your horse is never off screen during the race.
- **Final sixteenth:** from the moment the leader reaches the 1/16 pole (330 feet to go), the camera blends over 1.0 second of race time to `min(L, W) - 200`, so the wire comes into view and stays at screen x 200 once the leader reaches it.
- **Wire hold:** the camera holds on the wire for 1.0 second of playback after the winner crosses, so the next finishers cross on screen.

Why: the player cares about their horse, so the camera favors it. The finish is the one place the leaders must be seen, so the rule hands over to the leaders for the last sixteenth. Both terms only grow, so the camera never scrolls backward.

The camera and every on-screen word read only the present: samples up to the current time. Nothing on screen before the wire hints at the result.

Edge markers: when the leader is off the right edge, an 8x9 marker at x248 in the leader's saddlecloth color with its number and a right-pointing notch, at the leader's lane height. When the player's horse is off the left edge (only possible in the final sixteenth), a Yellow marker at x0 with its number. Markers sit at the screen edge, never over the leading pack.

Rejected:
- **Always track the leader** (the draft's guess). A closer's owner would watch other people's horses for most of the race, which is the opposite of caring.
- **Fit the whole field.** No zoom is allowed, and a 15-length field at 32 px a length is 480 px.
- **Compress to 16 px a length.** Horses nose to tail in the same lane would overlap half their bodies and read as a blob.
- **A director camera that knows the finish.** It would spoil the result by where it points.

### 3.6 Charm, where it comes from (final list, art open)

Every item follows DESIGN's Charm section: off the track band, at most 3 ambient moving things while the field runs, ceremony only before the start or after the wire, loops at most 4 swaps a second in wall time (so 4x playback does not speed them up), and never a joke at a horse's expense.

| Screen | Moment | Its job |
|---|---|---|
| Card | Horseshoe cursor bobs 1 px on a slow 2-frame loop | The screen is never frozen while you decide |
| Card | One line of blurb per horse, from data, with some wit | The horses have reputations, so picking one is a choice about a character |
| Orders | The paddock: your trainer, 16x24, lifting a coffee cup on a 2-frame idle, beside your horse standing with the jockey up | Orders come from a person to a rider, not from a form |
| Orders | The trainer's line for the focused order, in the dialog box, in the trainer's voice | Explains what the order does in a sentence a fan would say |
| Race | Post parade: the field walks by in post order behind an outrider on a pony | The race opens with a procession, and you see your horse up close before the start |
| Race | Call to the post: a bugler on the mid layer raises the horn (`sfx.race.call_to_post`) | You know the start is next |
| Race | The gate: the field stands still, then the doors swap open in one 2-frame beat (`sfx.race.gate_open`) | The start lands on one beat |
| Race | The announcer: one short call per pole in the top bar, typed out in 0.5 s, lines rotating by race number | The race has a voice that also says where you are |
| Race | Crowd strip on the mid layer in the stretch, hats and arms swapping slow early and faster from the 1/8 pole | The stretch feels louder without touching the track |
| Race | Infield flag on a 2-frame loop; a pair of birds crossing the far layer once per race | The world goes on with its own business |
| Race | Winner beat: the winning jockey stands in the irons and raises a fist (never the crop) as the horse eases to a walk | The win reads at a glance |
| Photo | The panel steps in by whole 8 px moves with a shutter click; 1.5 s to squint at noses before the caption | A close finish gets its moment |
| Winner's circle | The winner standing with a groom at its head and the owner beside it. When your horse wins, your trainer is there with the coffee | A win is a picture, not a table row |
| Result | Margins in racing words ("by a neck"), a trip told in a few lines, "Clean trip" when nothing went wrong | It reads like a chart with a person's eye |

The horses do only horse things: gallop, walk, stand, and in the paddock at most a tail swish (open, art-director question 9). No emote icons, no shake, no flash on the field.

## 4. Screens

Grid: 256x240, 16 by 15 tiles of 16 px. Text: main font 8x8 cells, so 32 characters across the full width and **30 inside a framed box** (frame tiles are 8 px each side). Small font 4x6, numerals and a few symbols only. Boxes are built from the 8x8 frame tiles (Bone outer, Ash inner, Navy fill). Coordinates are inclusive pixel ranges.

String budgets used below, checked against the longest real data:
- Horse name: 18 characters max (schema), 144 px. "Mint Julep Lawsuit" is 18.
- Race name and track name: 30 max (needs a cap, see Needs). "Old Fence Row Stakes" is 20, "Churchill Downs" is 15.
- Jockey: 22 max (needs a cap). "Imogen Pruitt" is 13.
- Any template with a horse name: rendered with an 18-character name, it must fit its field.

### 4.1 Card

**Job:** show who is running and how the race will be run, and let the player pick a horse. **Question it answers:** "Which one do I want today?"

**Reads first:** the list of eight names with their styles, because the pick is the decision. The conditions header is read once and rarely again, so it sits above but does not compete: plain Bone text, no color. The detail panel is read for the focused horse only.

```
y   0 +------------------------------------------+  header box, 4 tiles
    8 | Old Fence Row Stakes                      |  race.name
   18 | Churchill Downs                           |  race.track
   28 | 1 1/4 miles, dirt, fast                   |  distance words, surface, going
   38 | Track playing fair                        |  bias line
   63 +------------------------------------------+
   64 +------------------------------------------+  list box, 7 tiles
   72 | > [1] Gravy Subpoena          Stalker     |  rows at y72 + 12*i
   84 |   [2] Hold My Oats            Front       |
  ... |   ...                                     |
  156 |   [8] Mint Julep Lawsuit      Stalker     |
  175 +------------------------------------------+
  176 +------------------------------------------+  detail box, 4 tiles
  184 | Jockey Imogen Pruitt                      |  lines at y184 + 9*i
  193 | Speed 68  Stamina 82  Kick 64             |
  202 | <blurb, one line from data>               |
  211 | Today: 1st 4th 2nd                        |  step 8, blank before
  220 | Enter: pick this horse                    |
  239 +------------------------------------------+
```

Row columns: cursor x8-15, saddlecloth box x18-27 (10x10, number in the small font), name x32-175, style x184-239. Style words: "Front", "Stalker", "Closer" (7 max, 56 px).

Order: by post, 1 at the top (a race program's order).

The player's horse from the last race shows its name in Yellow, and its detail line 5 reads "Your pick last race" instead of the hint. Color is backed by the words.

Stats are numbers in the detail panel, not a table on every row. Rejected: all 24 stats on the rows in the small font. The small font has no letters, so the columns could not be labeled, and 24 tiny numbers read as a spreadsheet.

Bias line copy (from data):

| lane | style | line |
|---|---|---|
| neutral | neutral | Track playing fair |
| inside | neutral | Inside paths are good |
| outside | neutral | Outside paths are good |
| neutral | speed | Speed is holding |
| neutral | closers | Closers are rolling |
| both set | | e.g. Inside good, speed holding |

Distance words: under 8 furlongs "{n} furlongs", 8 "1 mile", above 8 "1 {eighths reduced} miles" (9 "1 1/8 miles", 10 "1 1/4 miles", 12 "1 1/2 miles").

Input: Up and Down move the cursor and wrap. Keys 1 to 8 jump to that post. Enter, Space or Z picks and opens Orders. Esc does nothing here (no title screen in M1). Initial focus: last race's pick, or post 1 on the first race.

States:
- Normal: as drawn.
- First race of the session: no Yellow name, no form line, focus on post 1.
- Fewer than 8 horses: rows end early, no gaps. More than 8: boot fails with "src/data/card.json: horses: the M1 race-day screens show at most 8 horses".
- No blurb in data for a horse: line 3 is blank, no placeholder text.
- Data error: the error screen (4.8), never a half-drawn card.

### 4.2 Orders (the paddock)

**Job:** set the three orders for your horse. **Question it answers:** "How should my rider ride it?"

**Reads first:** your horse's name in Yellow, then the three orders. The trainer's line explains the focused order. The paddock picture is the mood, so it gets space but no text.

```
y   0 +------------------------------------------+  horse box, 3.5 tiles
    8 | [8] Mint Julep Lawsuit                    |  Yellow
   18 | Stalker, post 8                           |  "Front-runner" spelled out here
   28 | Speed 68  Stamina 82  Kick 64             |
   38 | Jockey Imogen Pruitt                      |
   55 +------------------------------------------+
   56 +------------------------------------------+  orders box
   64 | Orders                                    |
   78 | > Early < Rate early       >              |  < > only on the focused slot
   90 |   Move    Rider's call                    |
  102 |   Path    Stay inside                     |
  116 |   Go to the post                          |
  127 |   Back to card                            |
  143 +------------------------------------------+
  144   paddock strip, no frame, y144-191:
        Grass ground, Bone paddock rail, trainer 16x24 at x24 y164,
        your horse with jockey up, 32x24 stand frame, at x48 y164
  192 +------------------------------------------+  dialog box, 3 lines
  200 | Sit chilly till the stretch.              |  y200, y210, y220
  210 | Then ask for everything.                  |  28 characters a line
  239 +------------------------------------------+
```

Slot row: cursor x8-15, label x20-59, "<" x72, value x84-211 (16 characters), ">" x216.

Order values, from `INSTRUCTIONS` in `src/data/schema.ts`, never a hardcoded list. Labels and trainer lines are copy in data:

| slot | value | label | trainer line (wrapped at 28) |
|---|---|---|---|
| early | default | Rider's call | Let this one break and find its own rhythm. |
| early | rateEarly | Rate early | Take a hold early. Let the speed horses argue up front. |
| move | default | Rider's call | Ask when it feels right. You know this one. |
| move | moveAtThreeEighths | Move at the 3/8 | Go at the 3/8 pole. It's a long run home, so mean it. |
| move | saveForStretch | Save for stretch | Sit chilly till the stretch. Then ask for everything. |
| path | default | Rider's call | Take whatever path opens. Going around is fine. |
| path | stayInside | Stay inside | Hug the rail. Save the ground and hope it opens. |
| | Go to the post | | Good luck. I'll be at the rail with the coffee. |
| | Back to card | | Want a different horse? No hard feelings. |

"Rider's call" is the word for default (sim open question 11 left it to me): it is true, the jockey decides, and it does not read as "nothing".

All orders are offered to all styles, including a front-runner told to save it. The sim says that is a valid combination (I7), and teaching by play means the result shows how it went rather than the screen forbidding it. The trainer gives no tactical advice about this field, because the sim does not yet make the move orders trade by field (pace redesign probe failed), and advice the sim does not honor is a lie.

Input: Up and Down move focus and wrap, in this order: Early, Move, Path, Go to the post, Back to card. Left and Right cycle the focused slot and wrap. Enter on a slot cycles forward. Enter on Go to the post starts the race day. Enter on Back to card, or Esc anywhere, returns to the card and keeps the changes. Initial focus: Go to the post when you return with the same horse as last race, Early otherwise.

States:
- Normal: as drawn.
- Same horse as last race: last race's orders already set.
- New horse: all three at Rider's call, or that horse's orders from `card.json` if they are not default.
- The orders are written into a copy of the card for this race only (4.9). `card.json` is never changed.

### 4.3 Race day sequence

**Job:** play the sim's replay as a race you can follow. **Question it answers:** "Where is my horse, who is winning, and what just happened?"

**Reads first:** the horses on the track, then your horse's Yellow arrow, then the announcer line. The bottom HUD is for glances: order strip, mini map, your position. Nothing in the HUD moves faster than the race does, so the eye stays on the track.

```
y   0  top bar y0-15: Navy fill y0-14, Ash line y15, no frame.
       Announcer call x4-243 (30 characters). Placeholder tag x248-255 y0-7 if any.
       "4x" at x224-239 while fast-forward is held (call cut to 27 characters).
   16  sky bands: Sky y16-39, Sky Pale y40-47
   40  far layer y40-63, scrolls at 1/4 of the camera (hills, a far stand)
   56  mid layer y56-87, scrolls at 1/2 (crowd strip in the stretch, infield
       hedge and flag on the turns, barns on the backstretch, the bugler)
   64  furlong poles and the wire post stand on the far (inside) rail, y64-91,
       drawn behind the horses
   84  far rail tile y84-91: Bone bar at y84-85, Grass behind the posts y88-91 (as drawn and accepted)
   92  dirt band y92-151, track tiles for the going
       horse frames: top = hoofY - 23, hoofY 116 + 4 px per lane
       inner lanes draw first, ties by post
  152  near rail y152-155, Bone, posts every 32 px of world
  156  Grass verge y156-159
  160 +------------------------------------------+  bottom HUD box
  168 | [2][4][1][3][8][5][7][6]   |  mini map   |  strip x8-117, y168-177
  178 |              ^ (yours)     |  x160-247   |  Yellow arrow under your box
  181 | Mint Julep Lawsuit         |  y168-207   |  your name, Yellow
  191 | 3rd, 2 1/2 back            |             |  from the last call
  201 | Rate, Save, Inside         |             |  your orders
  210 |                            |   1:02.4    |  clock x184-247, y210-217
  221 | Mint Julep Lawsuit is steadied            |  message line, 30 characters
  239 +------------------------------------------+
```

**Running order strip:** one 12x10 box per starter, 2 px apart, leader on the left, saddlecloth color with the number in the small font. Order is by distance, ties by post, updated each replay sample, and two horses only swap when the gap passes 0.1 length (data), so near-ties do not flicker. Once a horse finishes, its box locks at its finish place, so the strip ends equal to `result.finish`.

**Mini map (88x40):** a top-down oval in the track's proportions (straights against turns from `replay.course`), stretch along the bottom, horses running right along it and counterclockwise, as at a US track. The wire is a 1x3 Bone tick at the right end of the bottom straight. Each horse is a 2x2 dot in its saddlecloth color, pushed 0 to 2 px outward by lane. Yours is a 3x3 dot with a Yellow ring, drawn last. No blinking.

**Your lines:** name; position from the most recent call in `result.calls` ("3rd, 2 1/2 back", or "Leads by a head", or "Post 8" before the first call); your orders in short form ("Rate, 3/8, Inside", "Rider's call" when all default). The position updates at calls only, so it reads as the chart reads, not as a flickering number.

**Clock:** race time, tenths while running ("1:02.4"), then the winner's time in hundredths from `result.finish[0].time` once the winner crosses ("2:01.55").

**Announcer calls (top bar):** one call per pole as the leader passes it, kept until the next. Templates and 2 or 3 variants per key are data. The variant is `(raceNumber + callIndex) mod variants`, where callIndex is the call's 0-based place in the race's call schedule, the gate and the off included. Arithmetic on counters, not a random draw. Every template with an 18-character name fits 30 characters.

| when (shipped 10-furlong course) | key | example |
|---|---|---|
| field loaded | gate | They're all in the gate |
| doors open | off | And away they go |
| 1 1/8 pole | earlyLeader | {leader} shows speed |
| mile pole, which here is the wire, first time | firstTimeBy | First time past the stands |
| 7/8 pole | clubhouseTurn | Into the clubhouse turn |
| 3/4 pole | leader | {leader} on the lead |
| 5/8 pole | backstretch | Down the backstretch |
| 1/2 pole | pace.hot / honest / slow | Half in 46.12, they're flying / Half in 47.03, nice and even / Half in 48.40, a crawl |
| 3/8 pole | farTurn | Around the far turn |
| 1/4 pole | home | Turning for home |
| 1/8 pole | leaderSame / leaderNew | {leader} still leads / {leader} takes over |
| 1/16 pole | wire | Down to the wire |
| winner crosses | winner / photo | {winner} wins it / Too close to call |

The location keys are placed by the course, not by a fixed list: a pole that falls on the wire gets `firstTimeBy`, the first pole inside a turn segment gets the turn line, the pole where the stretch begins or the 1/4 pole gets `home`. Other distances fall back to `leader`. The half-mile time and pace word come from `result.fractions` and `result.pace`, shown when the leader reaches the 1/2 pole, which is when that number becomes true.

**Message line (bottom):** your horse's moments and every luck event. Shows for 2 seconds of playback each, queued; a waiting message older than 3 seconds is dropped (everything here is in the result anyway). Priority: your horse's event, then other events, then your order moments.

| trigger | copy |
|---|---|
| blocked | {name} has no room |
| steadied | {name} is steadied |
| bumped | {name} and #{n} bump (yours named first when involved) |
| 2 s after your horse's event | Back in stride |
| your horse passes the 3/8 pole with Move at the 3/8 | {name} is asked |
| your horse reaches the save-it point (`saveForStretchFeetToGo` in the echoed tuning) | {name} is asked |
| your horse finishes | {name} home in 3rd |

**Luck events (welfare):** a setback shown kindly. The horse visibly drops back because the replay says so. The words are racing words for a lost moment, never "stumbles", "clips heels" or "falls". No icon over the horse, no shake, no flash. Bumps assign no blame: both horses are named as "bump".

**Sequence and timing (playback seconds, data, starting guesses):**

| beat | length | camera | skippable |
|---|---|---|---|
| Post parade (step 6) | 5.0 | fixed, field walks left to right in post order behind the outrider | Enter, to the gate opening |
| Call to the post (step 6) | 2.5 | fixed on the gate area, bugler on the mid layer | Enter, to the gate opening |
| Gate | 1.5 | world x 0 at screen x 200; field still for 1.0, doors swap, "And away they go" | Enter, opens the doors now |
| Race | winner's time / 2 | 3.5 rule | Enter, to the 1/4 pole, then to the wire |
| Wire hold | 1.0 | locked on the wire | Enter |
| Photo (only when flagged) | up to 4.5 | 4.4 | Enter |
| Winner beat | 2.5 | render-only: winner held at screen x 128 alone, the background slowing from its speed at the wire to a walk; gallop frames to walk frames; jockey fist frame | Enter |

Worst case with the sim's winning-time band at 2:05.00: 5 + 2.5 + 1.5 + 62.5 + 1 + 4.5 + 2.5 = 79.5 seconds, under the brief's 90.

The winner beat uses `result.finish[0]` after the wire, so it spoils nothing. It is staged by the renderer and changes no outcome.

**Pause:** P or Esc opens a framed box at x64-191, y24-71 (in the sky, never over the horses): "Paused", "Resume", "Back to card". Esc again or Enter on Resume resumes. Back to card abandons the race; its seed is spent. Hiding the tab pauses the same way.

States:
- Loading: none visible. `runRace` runs when you choose Go to the post (median under 20 ms, sim T3) and the parade covers any hitch.
- Normal: as above.
- Your horse leads: the camera already frames the leader; no change.
- Your horse is far back: it holds at screen x 56, the leader's edge marker shows at the right.
- No luck events: the message line shows only your order moments and finish.
- Fast-forward: 4x, "4x" tag, calls and messages keep their wall-time lengths so they stay readable.
- Sim throws: the error screen with the seed.
- Placeholder art in use: the Pink and Ink 8x8 tag at x248, y0.

### 4.4 Photo finish

**Job:** settle a close finish with a picture. **Question:** "Did mine get there?"

Shown only when `result.photoFinish` is true, after the wire hold.

```
y   8 +------------------------------------------+  framed panel x8-247, y8-199
   16 |  crop 112x88 of the wire frame at 2x,    |  photo x16-239, y16-191
      |  Mist and Ash vertical streaks behind,   |
      |  the wire a 1 px Bone line at crop x96   |
  199 +------------------------------------------+
  204   Photo finish              ->  Mint Julep Lawsuit wins       (1x, below)
  216                             ->  by a nose over #4
```

- The panel steps in from the top by whole 8 px moves, one per frame (25 frames), with `sfx.photo.shutter`.
- Contents come from `replay.wireFrame` only: every horse at the moment the winner reached the wire, in its lane, on the gallop frame its distance gives. The crop runs from 96 px behind the wire to 16 px past it, so 3 lengths behind.
- Within the photo, positions are at 8 px per foot (the 2x space), so a 0.1-length nose is 6 screen px wide. If the winner and another horse land on the same pixel, the other horse moves back 1 px. The photo must never show a tie or the wrong horse in front.
- The caption names the winner and the margin to second only. Horses behind the winner can still pass each other before the wire (sim O9), so the photo claims nothing about third.
- Timing: "Photo finish" for 1.5 s while you look, then the winner line ("{name} wins", Yellow if yours) and "by a nose over #{n}". Advances by itself 3.0 s later, or on Enter. First Enter shows the caption at once, second continues.

Why a pause before the caption: the fun of a photo is looking at the noses yourself.

States: not flagged, skipped entirely; flagged with your horse first, second or not in the picture, same screen.

### 4.5 Winner's circle

**Job:** make the win a moment. **Question:** "Who won?"

One full-screen picture: rail, the winner standing (stand frame), a groom at its head, an owner beside it. When your horse won, your trainer stands with them, cup in hand. Dialog box y192-239 with three lines:

```
Hold My Oats
wins the Old Fence Row Stakes      (race.name from data)
Marisol Dunne up, 2:01.55
```

"wins the Old Fence Row Stakes" is 29 characters and fits. A race name over 21 characters would not, so the rule is: "wins the" and the name split onto two lines, and the dialog box grows to 4 lines rather than truncate.

Advances after 2.5 s or on Enter. Garland and other traditions are off in M1: the race is fictional and the data has no tradition flag.

### 4.6 Result

**Job:** say what happened, to everyone and to yours. **Question:** "How did mine run, and was it the orders or the luck?"

**Reads first:** the order of finish, because it settles the race. Then your trip, in Yellow, which is where the caring lives. Times last, for those who read charts.

```
y   0 +------------------------------------------+  order box, 6.5 tiles
    8 | > 1st [2] Hold My Oats            -       |  rows at y8 + 11*i
   19 |   2nd [4] Gravy Subpoena          nose    |
  ... |   ...                                     |
   85 |   8th [7] Mostly Legs             3/4     |
  103 +------------------------------------------+
  104 +------------------------------------------+  trip box
  112 | Mint Julep Lawsuit                        |  Yellow, lines at y112 + 11*i
  123 | 3rd, beaten 2 1/4                         |
  134 | 7th early, 4th at the 1/4                 |
  145 | Steadied near the 3/8                     |
  156 | Orders: Rate, Save, Inside                |
  175 +------------------------------------------+
  176 +------------------------------------------+  time box
  184 | Time 2:01.55, hot pace                    |  lines at y184 + 12*i
  196 | Splits 23.10 46.12 1:10.20 1:35.00        |  numbers in the small font
  208 | Today 4-1-1-0                Seed 1234567 |  step 8; seed number small font
  220 | > Next race                               |
  239 +------------------------------------------+
```

Order rows: your marker x8-15, place x16-39, saddlecloth box x42-51, name x56-199, margin to the horse ahead x204-247 (5 characters; labels from the sim, the longest is "9 3/4").

Trip lines, built only from the result:
1. Your horse's name.
2. Won: "Won by a nose", "Won by 1/2 length", "Won by 1 1/4 lengths". Otherwise "{place}, beaten {beatenLengths as a margin label}" ("2nd, beaten a nose", "8th, beaten 23 lengths").
3. Position at the call a quarter mile from the gate and at the 1/4 pole: "7th early, 4th at the 1/4", "Led early, led at the 1/4".
4. Luck: "Clean trip" with no event; "No room near the 3/8", "Steadied near the 1/2", "Bumped with #7 near the 1/8"; "at the start" inside the first furlong; "A rough trip, 2 setbacks" for two or more. The pole is the nearest pole to your horse at the event's time.
5. "Orders: " plus the short form, or "Orders: Rider's call".

Orders and trip sit next to each other on purpose: they are the cause and the effect the player is learning to read.

The orders are read from `result.inputs.card`, not from session state, so the screen shows what the sim actually ran.

"Today 4-1-1-0" is starts, wins, seconds, thirds, the way a past performance writes a record. The seed is in the small font at the right so Joseph can report a race.

Input: one item, Next race. Enter, Space or Z goes to the card with your horse focused. Nothing else.

Rejected: the race name on this screen (you just watched it, and the winner's circle named it); the full 16x16 silks beside each finisher (no silks in M1 data, and 16 px rows would not fit eight finishers with the trip, see art-director question 6); a "watch again" action (Later).

### 4.7 Boot and loading

- Ink screen with a Bone progress bar 128x4 centered, no text (the font may not be loaded yet). Usually under a second.
- If the main font fails to load, an HTML message in the page names the slot (`font.ui.main`) and the file. This is the one place text is not BitmapText, because there is nothing else to draw it with.

### 4.8 Data and sim errors

Full-screen framed box. Copy lives in code, because broken data cannot be trusted to hold it.

```
The race data has a problem.

src/data/card.json
horses[2].stats.speed
must be at most 100

Fix it and reload the page.
```

- Every issue from `DataError` is listed, file, path and message on their own lines, wrapped at 30 characters on spaces, dots or brackets. More issues than fit: the first ones and "and 3 more, see the console".
- The full message also goes to `console.error`.
- A sim error during a race: "The race could not be run." with the seed and the error message.
- A bad `?seed=`: "?seed= must be a whole number from 0 to 4294967295".
- No actions. Reload is the fix.

Permission-denied: not applicable. M1 is offline, single player, no accounts, no saves.

### 4.9 Session and inputs

- A plain session object (first seed, race number, your pick, your orders, the day's finishes) is passed from scene to scene in Phaser's scene data. No global or singleton holds it. It is lost on reload, which is fine for M1.
- The race input is built by a pure function with no Phaser import: copy the validated card, replace your horse's `instructions`, leave the others untouched, and pass it through `validateData` again before `runRace`. Where it lives is the engineer's call, logged in DECISIONS.md. It must not be in `src/sim/`, because the sim knows nothing of players.
- The renderer reads the result and never changes it. It imports nothing from `src/sim/rng.ts` or `src/sim/raceStreams.ts`. Stride phase, announcer variants and bird timing come from post numbers, distances and race counters.

## 5. Input and accessibility baseline

Keyboard only in M1. No mouse, no touch, no gamepad (Later). Every action has a key.

| key | menus | race |
|---|---|---|
| Up, Down | move focus, wrap | |
| Left, Right | change the focused order | |
| 1 to 8 | card: jump to post | |
| Enter, Space, Z | confirm | Enter skips a beat |
| Esc, Backspace, X | back | Esc or P pauses |
| Space (hold) | | 4x |

- Focus: one Yellow horseshoe cursor, left of the focused item, always visible, on a 1 px 2-frame bob. Never two cursors on a screen.
- A new screen ignores keys still held from the last one until they are released, so mashing Enter on the result cannot skip the card and orders unseen.
- Held arrows repeat after 400 ms, every 120 ms (data).
- Color is never the only signal: the player's horse has the arrow shape, the saddlecloth boxes carry numbers, the events and pace are words.
- Nothing flashes. Ambient loops swap at most 4 times a second. No full-screen flash on the photo.
- `prefers-reduced-motion`: the far and mid layers hold still and ambient loops stop. The horses and rails still move, because they are the race.
- Timed screens (photo, winner's circle) advance on Enter at any time. The result waits for the player.
- A visually hidden `aria-live` region mirrors the result (order of finish, your trip) and the error screen as plain text. The strings already exist, so this is cheap.
- At 1x scale (window under 512 px) everything still works; text is small. Not a supported size, not blocked.

## 6. How the screens handle what the sim says

The sim is the model here. The screens never predict, rate or advise.
- Nothing on screen names a favorite, odds or a likely winner. The card shows stats and styles only.
- During the race every word is true at the moment it shows: calls from present positions, pace from the half-mile time once it is run, the photo's caption from the result once the winner is at the wire.
- "Too close to call" is the honest call when the photo flag is set.
- The trip lines state facts from the result in templates. If a template ever disagrees with the chart, the chart wins and the template is the bug: criterion RS4 tests this.
- The player cannot correct an outcome. They correct their own choice: change horse or orders and run again. Rerunning the same seed is Later.

## 7. Asset list

Slot ids follow `<kind>.<area>.<subject>[.<part>][.<variant>]`. All layers of the race horse share frame size, frame count, anchor and nose x.

| slot | size | frames | notes | first needed |
|---|---|---|---|---|
| `font.ui.main` | 8x8 cell | printable ASCII 32 to 126 | paths in errors need `[ ] . _ : " /` | P0 |
| `font.ui.small` | 4x6 cell | `0-9 : . / # -` and space | strip, splits, seed, clock alternative | P0 |
| `art.ui.frame.box` | 8x8 tiles | 9 (corners, edges, fill) | all boxes and the dialog | P0 |
| `art.ui.cursor.horseshoe` | 8x8 | 2 (bob) | | P0 |
| `art.ui.marker.yours` | 8x8 | 1 | result list | step 4 |
| `art.ui.placeholder_tag` | 8x8 | 1 | Pink and Ink checker | P0 |
| `art.ui.minimap.track` | 88x40 | 1 | oval band; dots are code-drawn | P0 |
| `art.race.horse.body.gallop` | 32x24 | 4 (stand-in: 2) | recolorable key colors | P0 |
| `art.race.horse.body.walk` | 32x24 | 2 | parade, winner beat | step 2 |
| `art.race.horse.body.stand` | 32x24 | 1 | gate, paddock, winner's circle | P0 |
| `art.race.horse.mane_tail.{gallop,walk,stand}` | 32x24 | 4, 2, 1 | | art drop |
| `art.race.horse.tack.{gallop,walk,stand}` | 32x24 | 4, 2, 1 | saddlecloth color by program number | P0 (stand-in block) |
| `art.race.jockey.body.{gallop,walk,stand,winner}` | 32x24 | 4, 2, 1, 2 | winner = fist pose on the walk | step 2 |
| `art.race.jockey.jacket.{gallop,walk,stand,winner}` | 32x24 | 4, 2, 1, 2 | silks body color | P0 (stand-in block) |
| `art.race.jockey.cap.{gallop,walk,stand,winner}` | 32x24 | 4, 2, 1, 2 | | P0 (stand-in block) |
| `art.race.marker.player` | 7x4 | 1 | Yellow arrow above the cap | P0 |
| `art.race.marker.edge` | 8x9 | 1 | recolorable, full Ink outline, number drawn at x2-4, y2-6 (DESIGN.md) | P0 |
| `art.race.gate` | 40x88 | 2 (closed, open) | drawn behind the horses (question 13) | P0 |
| `art.race.pole.furlong` | 4x28 | 1 | recolorable band per pole type | P0 |
| `art.race.pole.wire` | 8x28 | 1 | | P0 |
| `art.race.rail.far`, `art.race.rail.near` | 16x8 | 1 | | P0 |
| `art.track.dirt.fast` | 16x16 | 1 | M1 ships fast only | P0 |
| `art.race.bg.far.hills` | 128x24 | 1 | repeating | P0 |
| `art.race.bg.mid.grandstand` | 32x32 | 1 | stretch zone, no real architecture | P0 (flat) |
| `art.race.bg.mid.crowd` | 16x16 | 2 | swaps slow, faster from the 1/8 | step 2 |
| `art.race.bg.mid.infield` | 32x32 | 1 | hedge, flagpole | step 2 |
| `art.race.bg.mid.barns` | 32x32 | 1 | backstretch zone | step 6 |
| `art.race.ambient.flag` | 8x8 | 2 | | step 2 |
| `art.race.ambient.birds` | 16x8 | 2 | one pass per race | step 6 |
| `art.race.outrider` | 32x24 | 2 | pony and rider, walk | step 6 |
| `art.race.bugler` | 16x24 | 2 | horn down, horn up | step 6 |
| `art.race.hoof_kick` | 2x2 | 2 | optional | art drop |
| `art.photo.bg.streaks` | 16x16 | 1 | Mist and Ash | step 3 |
| `art.paddock.trainer` | 16x24 | 2 | coffee cup idle | step 6 |
| `art.paddock.ground` | 16x16 | 1 | Grass, Bone rail | step 6 |
| `art.circle.backdrop` | 256x192 | 1 | winner's circle | step 6 |
| `art.circle.groom`, `art.circle.owner` | 16x24 | 1 each | | step 6 |
| `sfx.race.gate_open`, `sfx.race.call_to_post`, `sfx.photo.shutter` | | | silent placeholders in M1 (open question 5) | P0 |

Not needed in M1: markings layers (no markings data), other goings and surfaces, 16x16 silks, tote board.

## 8. Placeholder plan: step P0, the first build

**The smallest version Joseph would enjoy watching:** a real-looking 8-bit race at Churchill with the HUD in place, the gate on one beat, an announcer with a voice, your horse picked with a number key, and Enter at the end starting the next race. No card or orders screens yet. It meets DESIGN's "Placeholder race" must-have list and nothing more.

What P0 draws, all in master palette colors on the 1x grid:
- Sky bands (Sky, Sky Pale), a stepped hill silhouette on the far layer (Pine and Grass), a flat grandstand block on the mid layer in the stretch zone (Slate, Ash, Bone roof line).
- Dirt band in Dirt with a fixed Dirt Shade grain, Bone rails with posts every 32 px, furlong poles and the wire post on the inside rail.
- Each horse a flat 32x24 shape: a horse-and-rider silhouette drawn by a committed script (body, neck, head, four legs in two positions), one coat color with the Ink outline, a jacket block in its silks body color, a cap, a saddlecloth block with its number in the small font. A 2-frame cycle advanced by distance, phase set by post. The silhouette must pass DESIGN's Ink fill test as a horse, not a box.
- The gate stand-in: closed, then open in one swap.
- Yellow arrow over your horse, edge markers, the real frame tiles, the horseshoe cursor (on the pause box), a logged CC0 8x8 font and 4x6 font until ours exist.
- HUD: announcer calls from data with variants, order strip, mini map, your name, position and orders lines, clock, message line.
- At the gate, before the doors open, keys 1 to 8 pick your horse (default post 1). The message line says "Press 1 to 8 to pick your horse".
- The wire: wire hold, "{winner} wins it" or "Too close to call", then the message line shows "Enter: next race". Enter runs the next seed.
- The data error screen.
- Every stand-in slot is marked placeholder in the slot data, has an ASSETS.md row marked stand-in, and the 8x8 Pink and Ink tag shows at the top-right while any is on screen. A release check refuses to ship a placeholder slot (see P0-3).

P0 covers: P0-1 to P0-4, RV1 to RV10, H1 to H8, AN1 to AN4, ST1, ST2, IN1.

Prerequisite: Joseph's yes on the new data files and card fields (open question 2). Without it P0 cannot take copy, view values, coats or silks from data.

## 9. Build order

Each step is one reviewable change. Joseph can watch after every step.

1. **P0 placeholder race**, as section 8. The view math (mapping, camera, draw order, stride frame, strip order, mini map, call schedule, string formats) lives in Phaser-free modules under `src/render/` so it tests headless.
2. **Crowd strip and winner beat** (the art-director's first charm items, with the gate already in P0): crowd swap, infield flag, ambient cap, winner beat with walk and fist frames, wire hold timing, fast-forward and the skip rules, pause box.
3. **Photo finish**: panel step-in, crop, nose rule, caption timing.
4. **Result screen**: order of finish, trip lines, time and splits, Next race.
5. **Card and Orders screens and the session loop**: picking, orders written into the race input, seed advance on Go to the post, key-release guard. Number keys at the gate go away. **The gate run can start here.**
6. **Ceremony and the paddock**: post parade, call to the post, trainer and paddock, winner's circle, barns and birds.
7. **States hardening**: tab-hidden pause, reduced motion, `aria-live` mirror, font-load failure, the "more than 8 horses" check, name length checks.
8. **Session record and form lines** ("Today 4-1-1-0", "Today: 1st 4th 2nd"). Cuttable.
9. **Art drop-ins**, ongoing, as the art-director accepts each asset into its slot.

## 10. Acceptance criteria

### P0 placeholder race
- **P0-1 [E]** From `npm run dev`, a race plays from the gate to the wire with no other screen, at 3x and 4x, and every color on screen is in the master palette.
- **P0-2 [E]** Each stand-in horse reads as a horse with a rider in an Ink fill test, and the eight are told apart by saddlecloth number and jacket color at gameplay speed.
- **P0-3 [T]** Every slot used by the race-day screens resolves to a file or a stand-in marked placeholder in data. While any placeholder is drawn, the tag is drawn at (248, 0), and with none drawn it is not. The screens name the slots they need in one list. At boot, a needed slot that is missing from `slots.json` shows the data error screen with the slot named. The release check (`npm run ship:check`, run first by `npm run build:release`) fails if any slot is a placeholder, if a file is missing or the wrong size, or if a needed slot is not in `slots.json`. The everyday `npm run build` and CI do not run it, so they stay green while stand-ins exist. Anything that deploys must use `build:release`.
- **P0-4 [E]** Keys 1 to 8 at the gate move the Yellow arrow to that post's horse. Enter after the wire runs a race with the next seed.

### Race view
- **RV1 [T]** World x is `floor(distance * pxPerFoot / 100)` and hoof y is `116 + floor(lane * pxPerLane / 100)`, both whole numbers for every sample and every interpolated time, using values from data.
- **RV2 [T]** At a time equal to sample i's time, a horse's position equals sample i's, for every sample up to that horse's finish. No position is NaN.
- **RV2b [T]** Gallop out. After its own finish time a horse keeps going at the speed it crossed the wire with, as whole pixels, so nothing freezes on screen. Its lane is held where it was drawn at the finish moment, so there is no vertical hop. This is drawn by the renderer only. It may read the one sample that brackets the finish (the first sample at or after the finish time), which is the same allowance AN3 gives every drawn thing, and nothing later. It changes nothing in the result, and the strip, the clock, the calls and the photo do not use it. World x never decreases for any horse at any time. From the end of the wire hold the winner beat takes over and only the winner is drawn.
- **RV3 [T]** Camera x is a pure function of the result, the player's horse and time: same inputs, same whole number.
- **RV4 [T]** Over 500 seeds and every player's horse, before the leader reaches the 1/16 pole the player's nose is between screen x 56 and 200.
- **RV5 [T]** Camera x never decreases. At default speed it moves at most 32 px between frames 1/60 s apart.
- **RV6 [T]** From the moment the winner reaches the wire, the wire's screen x is 200.
- **RV7 [T]** Draw order is lane ascending, ties by post.
- **RV8 [T]** The gallop frame index is a function of distance, stride length from data, and post only. The frame count comes from slot data (2 for stand-ins, 4 final).
- **RV9 [T]** No module under `src/render/` or `src/scenes/` imports `src/sim/rng.ts` or `src/sim/raceStreams.ts`, checked like `src/simBoundary.test.ts`.
- **RV10 [T]** Rendering a deep-frozen result does not throw.
- **RV11 [T]** The race beat lasts the winner's time divided by the playback speed in data, and the full sequence with the beat lengths in data is at most 90 s for a winning time of 2:05.00 with a photo.
- **RV12 [E]** Nothing shimmers: horses, rails and poles move together by whole pixels.
- **RV13 [E]** At 3x and 4x, on the shipped card, Joseph finds his horse in under a second.

### HUD
- **H1 [T]** The strip at each sample is a permutation of all horses. Two horses swap only when the gap passes the hysteresis in data. Once every horse has finished, the strip equals `result.finish` order.
- **H2 [T]** Mini map positions are whole numbers inside the 88x40 box, the wire maps to the right end of the bottom straight, and positions advance counterclockwise.
- **H3 [T]** The position line at each call matches `result.calls` for the player's horse ("3rd, 2 1/2 back", "Leads by a head"), using the sim's `marginLabel`.
- **H3b [T]** From the player's horse's own finish time on, the position line shows its finish from `result.finish`: "Finished 4th", and "Finished 1st" for the winner. Once the second horse has also crossed, the winner's line becomes "Won by a neck" (nose, head, neck in words; "Won by a length" for exactly one; otherwise the number alone, "Won by 2 1/2", so it fits 18 characters). Before its own finish the line never shows a finish, and nothing reads the second horse's margin before the second horse's finish time (AN3). The sim's last call is the 1/8 pole, so without this the line contradicts the result.
- **H4 [T]** Clock formatting: 0 is "0:00.0", 5999 hundredths "0:59.9", 12155 hundredths "2:01.5" while running and "2:01.55" at the finish.
- **H5 [T]** Fraction formatting: 4612 is "46.12", 7020 is "1:10.20".
- **H6 [T]** Orders short form for all 12 combinations, each at most 18 characters.
- **H7 [T]** Every message template, filled with an 18-character name and the largest number it can hold, is at most 30 characters.
- **H8 [E]** The message line shows each luck event in a race that has one, and the horse visibly drops back. Nothing appears over the horse.

### Announcer
- **AN1 [T]** Each pole gets exactly one call, at the time the leader reaches it, chosen from the course layout as in 4.3.
- **AN2 [T]** The variant is `(raceNumber + callIndex) mod variants`, with callIndex the call's 0-based place in the race's call schedule (gate, off, then each pole in order). Two consecutive race numbers never give the same line on the same call when a key has two or more variants, and every variant of a key is heard within as many races as it has variants.
- **AN3 [T]** At time t, no call or message uses a sample later than the one after t. The photo and winner calls appear only once the winner has reached the wire.
- **AN4 [T]** Every call template fits 30 characters with an 18-character name, and 27 while "4x" shows.

### Finish and photo
- **FN1 [T]** Enter during the race before the 1/4 pole jumps to the time the leader reaches it; after it, to the winner's finish time. A message whose trigger falls inside a skipped stretch of the race is dropped, not shown late: after a skip the message line shows only what happens from the new race time on. The announcer shows the latest call reached.
- **FN2 [E]** The winner beat shows the winner alone easing to a walk with the fist pose, never a crop raised.
- **FN3 [T]** The winner beat starts from the winner's gallop-out distance, speed and stride phase at the end of the wire hold, so the horse does not jump: only the camera moves, to put its frame at screen x112-143. The background's scroll slows in whole pixels over `winnerBeat.slowSeconds` and never runs backward. While it slows the winner still gallops with no fist. Once it is down to the walk, the body and tack use the walk frames and the jacket and cap use the winner frames, paired by frame index, to the end of the beat and under "Enter: next race". Nothing in the beat reads the result before the winner's finish time. The mid layer is never empty during the gallop out or the beat: the stand and its crowd continue past the wire.
- **PA1 [T]** While the pause box is open nothing advances: race time, wall-timed calls and messages, and ambient loops all hold, and only the box's cursor bobs. Esc, or Enter on Resume, resumes from the same frame. Focus moves between Resume and Back to card and wraps.
- **PH1 [T]** The photo shows only when `result.photoFinish` is true.
- **PH2 [T]** In the photo, the winner's nose pixel is strictly ahead of every other horse's, for every photo-finish seed in 0 to 9999.
- **PH3 [T]** Photo positions come from `replay.wireFrame` only and are whole numbers.
- **PH4 [E]** The panel steps in by 8 px moves; the caption appears 1.5 s later; it advances 3.0 s after that or on Enter.

### Winner's circle and result
- **WC1 [E]** The winner's circle names the winner, race name from data, jockey and time. Your trainer appears only when your horse won.
- **RS1 [T]** The order list equals `result.finish`, with margin labels from it.
- **RS2 [T]** Trip line 2 for a winner reads "Won by" plus the second's margin; for others place plus beaten lengths, singular "length" at 1 or less.
- **RS3 [T]** Trip line 4 is "Clean trip" when the player's horse has no event, names the first event and its nearest pole when it has one, and reads "A rough trip, 2 setbacks" for two or more.
- **RS4 [T]** Over 500 seeds, every trip line agrees with `result.calls`, `result.finish` and `replay.events`.
- **RS5 [T]** The orders line reads from `result.inputs.card`.
- **RS6 [T]** The record string for finishes [1, 3, 2, 5] is "4-1-1-1". (step 8)

### Card, orders, loop
- **CD1 [T]** The card lists horses by post with name and style, and the detail lines for the focused horse; every string fits its field for the shipped data.
- **CD2 [T]** A card with more than 8 horses fails at boot with the file and field in the message.
- **OR1 [T]** The order values offered are exactly `INSTRUCTIONS` from `src/data/schema.ts`.
- **OR2 [T]** The race input changes only the picked horse's instructions, does not mutate the loaded card, passes `validateData`, and gives the same result bytes as a hand-written card with the same content.
- **OR3 [T]** Focus order on Orders is Early, Move, Path, Go to the post, Back to card, wrapping both ways.
- **LP1 [T]** Race n uses seed `(first + n) mod 4294967296`. The seed advances when Go to the post is chosen, including for an abandoned race.
- **LP2 [T]** A valid `?seed=` sets the first seed; an invalid one shows the error screen with the rule.
- **LP3 [E]** Ten races in a row without a reload: no console errors, frame rate holds 60 fps on Joseph's laptop, memory after race 10 within 10 percent of after race 1. Numbers go in docs/PERF.md.
- **LP4 [E]** From the result to the next gate takes three key presses when nothing changes.

### States and input
- **ST1 [T]** A `DataError` shows every issue's file, path and message, wrapped at 30 characters, and logs the full message.
- **ST2 [T]** A sim error during a race shows the seed and the message.
- **ST3 [E]** Hiding the tab pauses the race; returning shows the pause box.
- **IN1 [T]** Every action on every screen has a keyboard binding; no handler needs a pointer.
- **IN2 [T]** A key held when a screen opens is ignored until it is released.
- **AX1 [E]** With reduced motion on, the far and mid layers and ambient loops hold still.
- **AX2 [T]** The `aria-live` region holds the result and error text.
- **CH1 [T]** While the field runs, at most 3 ambient things animate at once; from the 1/8 pole only the crowd strip does; ambient swap rates are in wall time and at most 4 a second. Each screen pixel of the mid layer belongs to one zone's art: where a stretch zone and a turn zone would overlap, the stretch wins and the turn's art is clipped. In step 2 the flag flies on the turns only; a flag for the stretch and the backstretch waits for the art-director to place one (step 6).
- **CH2 [E]** The charm test from DESIGN, on a 10-second clip of the race, the paddock and the winner's circle.

## 11. Needs from the sim

1. **Confirm that `replay.horses[].distance` is the nose,** the point that reaches the wire. The photo, margins on screen and the wire hold assume it. Blocking for step 3. One line in `result.ts` settles it.
2. **Per-horse ask time** (when the rider asked for the run), as a new field. Optional. With it, the message line could say "{name} is asked" for default orders and for every horse, and the trip could say where the run started. Without it, M1 shows only the two order moments it can know.

Nothing else is missing. Poles, leader, positions, the half-mile, pace, events and the wire frame are all in the result.

From the data, not the sim (all ask-first, see open question 2):
- Per horse in `card.json`: `coat`, `silks` (body and cap colors from the 18 silks colors), and a one-line `blurb` of 28 characters or fewer.
- Length caps: race name and track name 30, jockey 22.
- The saddlecloth list for numbers 1 to 8 (fill and number color), from the art-director.

## 12. Questions for the art-director

1. **Top bar.** I made it the announcer's line only. The race name shows on the card and in the winner's circle, the running time moved under the mini map. A 16 px bar cannot hold the frame tiles and text, so it is a Navy fill with an Ash line under it. Does that work for you?
2. **Furlong poles on the inside (far) rail,** behind the horses, not the near rail. Real poles are on the inside rail, and it keeps poles off the horses' legs.
3. **Photo size.** A 128x112 crop at 2x is 256x224, which leaves no room for the frame or the labels outside it. I propose 112x88 at 2x in a 240x192 panel. The 1 px wire becomes 2 px at 2x. Is that acceptable?
4. **Placeholder label.** The rule prints the slot id in the small font, but that font has no letters and most sprites are smaller than the id. I propose the checker alone, plus the HUD tag and a console list of placeholder slots.
5. **Saddlecloth list,** and #8: the US convention as I remember it puts Pink on 8, which collides with the placeholder Pink. Check against a primary source, and pick how to keep them apart.
6. **Silks in M1.** The card has none. I use a 10x10 saddlecloth box on results, since 16x16 silks need 16 px rows and eight of those leave no room for the trip. Do you want silks body and cap colors in the card now (my recommendation) and full silks on results in M9?
7. **Trainer placement.** Your Charm list puts the trainer on the card screen. I split pre-race into Card (pick) and Orders (paddock), and the trainer lives on Orders, where instructions are given, with your horse standing beside him. OK?
8. **Winner beat staging.** At 4 px a foot the winner leaves the screen a few frames after the wire, so the fist and the walk could not be seen with the camera on the wire. I stage the beat after the wire hold: the winner alone at screen x 128, the background slowing. Does that fit "ceremony after the wire"?
9. **Paddock horse idle.** A tail swish 2-frame loop on the stand frame, across all layers, or keep the horse still and let the trainer carry the screen? Cost is one extra frame per layer.
10. **Grandstand.** I am assuming no twin spires, since it is the venue's signature look and close to a mark. Confirm a generic stand.
11. **Ambient set per zone,** inside your cap: stretch, crowd strip and flag; turns, flag and one bird pass; backstretch, barns (still) and flag. Birds and flag stop at the 1/8 pole. Right items?
12. **Post parade direction and length:** left to right past the camera, post order, behind one outrider, 5 seconds, every race, Enter skips. You flagged Churchill's real parade to check.
13. **Gate in front of or behind the horses.** I put it behind so every horse stays visible at the start.
14. **Typewriter reveal** on announcer calls at 60 characters a second. Does it fit, or should calls cut in whole?
15. **Small font glyphs:** I need `0-9 : . / # -` and space. Anything you want to add or refuse?
16. **Garland and traditions** are off in M1, since the race is fictional and has no tradition flag. Agreed?

## 13. Open questions, with my recommendation

1. **Which horse the player instructs.** Decided above: one, picked each race. Reopen if the gate run shows Joseph never changes horse. *Recommend: keep.*
2. **New data files and card fields (ask first).** P0 needs: `src/data/raceDay.json` (view values, beat lengths, copy and announcer templates, all values marked like tuning), `src/data/slots.json` (the art and audio slot registry DESIGN requires, with the placeholder flag), and `coat`, `silks` and `blurb` on each card horse, plus the name length caps. All are schema changes, and zod is already in. *Recommend: yes to all, as one change before P0.* Fallback without the card fields: every horse bay, jacket in its saddlecloth color, no blurbs.
3. **`?seed=` in the URL.** It is a small piece of the debug panel the brief asks for, and it makes every eyes-on check repeatable. *Recommend: yes.*
4. **Post parade every race.** It costs 5 seconds a race and is skippable. *Recommend: every race; if Joseph skips it three races running in the gate run, shorten it to the field walking by once.*
5. **Audio in M1.** The brief puts the audio pass in M9. *Recommend: wire the three sfx slots, silent, so the beats are timed for sound later. The call to the post needs an original or verified public-domain tune before it ships.*
6. **Mouse in M1.** *Recommend: no. Keyboard only halves the input work, and every menu is a short list.*
7. **Session record and form lines.** They are not in the brief's M1 list, but they are the cheapest way to make race 10 matter more than race 1. *Recommend: build them as step 8 and cut them if Joseph does not want them.*
8. **2x playback.** *Recommend: yes, with hold-Space 4x. Revisit if the gate run feels long or rushed.*
9. **If ten races feel samey.** Levers in order of cost: a post draw each race (needs its own seeded source outside the sim), a going other than fast from data, then M2's real stakes. *Recommend: none until the gate run says so.*
10. **Known order-balance gap.** Rate early plus save it on a stalker is still a free upgrade, and the move orders do not trade by field (pace redesign probe failed). The screens will not hide or warn about it. *Recommend: Joseph runs the gate anyway, and notes whether he found the upgrade and whether it made races less interesting. That is useful evidence for the pace redesign.*
11. **Seed on the result screen.** *Recommend: yes, small font, right-aligned, so a strange race can be reported.*
12. **Trainer copy and the pace redesign.** The trainer's lines describe what each order is meant to do. If the redesign changes that, the lines change in data. *Recommend: keep them in `raceDay.json` and review them with each sim change.*

**Decided (2026-11-12), by the main session for Joseph.** Where a decision changes the text above, the decision wins.

- 1: keep. One horse, picked each race.
- 2: yes to `src/data/raceDay.json` and `src/data/slots.json` as new files with their own schemas. The per-horse look (`coat`, `silks` body and cap, `blurb`) goes in a new file, `src/data/cardLook.json`, keyed by horse id, not in `card.json`. Reason: `card.json` is the sim's input and is echoed in every result, so new fields there would change result bytes and the sim's schema for something the sim never reads. The loader checks that every horse on the card has a look entry and that there are no extras. The length caps (race and track name 30, jockey 22) are checked by the race-day loader at boot, with the file and field in the message, and the sim's schemas do not change. These files fold into the horse record when M2 builds it.
- Fonts: both fonts are original, made by the artist and accepted by the art-director. No third-party font is downloaded, so the "logged CC0 font" lines above do not apply.
- 3: yes, `?seed=`.
- 4: every race, skippable.
- 5: silent sfx slots.
- 6: no mouse in M1.
- 7: step 8 (session record and form lines) is not in the brief's M1 list, so it is not built unless Joseph asks for it.
- 8: 2x playback, hold Space for 4x.
- 9: none of the levers yet.
- 10: as recommended. The gate run goes ahead with the known gap.
- 11: yes, seed on the result screen.
- 12: yes, trainer lines in data.
- Needs from the sim: item 1 is checked by the engineer before step 3. Item 2 (a per-horse ask time) is not added in M1.
- The art-director's answers to section 12 are recorded in DESIGN.md and win over the assumptions in this spec.
- After the first code review (2026-11-12): RV2b (gallop out) and H3b (finish on the position line) were added, P0-3 was rewritten around a separate release check, and the gate beat gained a pick window in data (`beats.pickSeconds`, 4 s) because one second is too short to pick a horse.

## 14. Later

- Mouse and gamepad.
- Rerun the same seed with different orders ("same race, different ride"), as a debug panel or learning tool.
- Watch the replay again from the result.
- Tactical hints from the trainer that read the field, once the sim's move orders trade by field.
- Markings, coats beyond what the card gives, full 16x16 silks on results, other goings and surfaces.
- A jockey "check" pose for steadied and blocked.
- Audio beyond silent slots.
- Owners and stables on the card, past performances across sessions, saves.
