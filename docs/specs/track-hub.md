# Spec: the track (the place between races)

Status: draft for Joseph's review. Written 2026-11-13 by the designer for B5, revised the same day (things to look at, the hub's voice, the paddock question). It adds one screen to `docs/specs/betting-screens.md` and amends a few of its rulings (section 3 lists every one). It keeps the rules in `docs/specs/betting-simple.md`, including UI1 to UI6 and SAFE1 to SAFE4. Every pixel box here is at 1x on the 256x240 grid, inclusive. Every timing is a starting guess in data.

Marks: **[T]** tested headless, **[E]** needs eyes on the build.

## 1. Problem, user, decision

**User:** Joseph, at a desk with a keyboard and a mouse, playing a day of eight races. He is the only player.

**Problem:** he asked to "make the betting like going to the track. have an 8 bit layout where you can navigate by using a menu or clicking around", then "8 or 16 bit. that general pixel style", and "make sure the game keeps a sense of humor and remains light hearted". Before that he asked for "a simple game of betting on horses", said picking had "too much detail", and wanted pages "like a real horse racing book". The approved flow goes page to page with no place in it, and it takes keys only. So the game needs a place that feels like the track, with things to click and people with something to say, without making each race take longer to bet.

**Decision:** one still 256x240 picture of a generic track, shown between races, with **two doors** and **five things to look at**.

- **Doors** move the day forward. **Windows** opens the approved program page for the next race, where you read, choose and bet, with the ticket at the foot as approved. At a real track you carry your program to the window, so the page's foot is the window counter. **The rail** starts the next race with no bet ("Just watch").
- **Lookables** never move the day forward. Each answers a look with its next line, in a fixed cycle from data: **the regular** in the stand, **the tote board**, **the fans at the rail**, **the bugler** at the paddock gate, and **the snack cart** on the apron.
- A Navy box at the foot holds the hub's voice (two rows) and the two doors as plain actions. One focus is shown by the horseshoe cursor in the box and by focus corners in the picture. Keys and clicks move that same focus.

Why two doors and five lookables: every extra door I tried either repeats the program or is out of scope. Lookables give "clicking around" something to find and give the place its humor, and they cost the bet path nothing, because focus always arrives on Windows and Enter always means bet there.

The tote board does two jobs: it is a lookable, and it is the status display for the next race's prices, with dashes while the crowd is still betting.

I agree with the lean: a still picture, no walking avatar. Walking costs seconds on every race, needs four-way people art, collision and a camera, and pointer-to-walk needs pathing. The top-down tile world in DESIGN.md "Overworld and menus" fits the farm, when there is one.

**Rejected:**
- **A scrolling or top-down world with a walking avatar.** Above. It adds time to every bet, which is the one thing Joseph has asked for less of.
- **More doors: paddock, program stand, a cashier.** The paddock is shelved in betting-simple.md's non-goals (its spot is reserved, question 5). A program stand separate from the windows splits the approved page into a read screen and a bet screen, which betting-screens.md rejected. A cashing window adds a press after every win and a "ticket not yet cashed" state, when settlement is already automatic (BK3).
- **Lookables in the menu list.** Seven rows would push the doors down and make Enter's meaning depend on scrolling. Lookables live on Left and Right, the doors on Up and Down (section 2).
- **Random lines.** A fixed cycle is testable, never repeats a line twice in a row, and lets Joseph hear every line.
- **A stop at the track after the bet, ticket in hand.** Nothing to do there: no live tote, no cancel. It adds a press to every bet. Question 1.
- **The track as an optional side screen reached by Esc.** He would rarely see it, which fails his ask.
- **Letter hotkeys.** Hidden keys. Digits are enough, and they match the post numbers on the board.

## 2. The flow and the keys

```
Boot or New day -> Track (race r) -> Windows: Program (race r) -> bet -> Race -> Result -> Track (race r+1)
                                  -> Program: Pass            -> Race -> Result -> ...
                                  -> Rail: Just watch         -> Race -> Result -> ...
                                  -> a lookable: one line, stay on the track
After race 8, or a settled bankroll under $2: Result -> End of day -> New day -> Track (race 1)
```

The track appears once per race, between the result and the next program. It never appears after the last race or when broke: the result goes straight to the End of day page, as approved.

| where | keys |
|---|---|
| Track | **Up, Down:** between the two doors, wrapping. From a lookable, either goes to Windows. **Left, Right:** through every target in picture order, wrapping: the regular, Windows, the tote board, the fans, the rail, the bugler, the snack cart. **Enter, Space or Z:** acts. On a door it goes through. On a lookable it shows the lookable's next line. **1 to 8:** open the program at that post, from any focus. **Esc:** on a lookable, focus goes back to Windows. On a door it does nothing. |
| Program, choosing | As approved, except Esc now returns to the track with focus on Windows. |
| Program, ticket open | As approved. Esc closes the ticket. |
| Race | As approved. |
| Result | Enter, Space or Z: Next race (to the track) or End of day. |
| End of day | Enter, Space or Z: New day (to the track, race 1). |

Picture order is left column top to bottom, then right column top to bottom, with the fans before the rail because they stand left of it. From Windows, Right reaches the tote board and Left reaches the regular.

**Focus on arrival at the track is always Windows,** whatever had focus last time. Why: this is a betting game, so Enter goes to the next sensible place, the program, and it always means the same thing on arrival.

**Press and click counts, per race,** counted the approved way, from the result page of the race before. Lookables add nothing to any path.

| path | keys | approved | clicks |
|---|---|---|---|
| Bet $2, fast | Enter (result), `3` (program at post 3), Enter (ticket), Enter (bet). **4** | 4 | not offered |
| Bet $2, by the menu | Enter, Enter (Windows), `3`, Enter, Enter. **5** | 4 | Next race, Windows, the entry (opens the ticket), "Enter: bet". **4** |
| Just watch, from the track | Enter, Down, Enter. **3** | 3 (Pass) | Next race, the rail. **2** |
| Pass after reading the program | Enter, Enter, Up, Enter. **4** | 3 | Next race, Windows, "Pass this race". **3** |
| Change the amount | plus 1 Left or Right per step | same | plus 1 click on "<" or ">" per step |
| Look at something, then bet | plus the arrows to reach it and back (Esc returns to Windows in 1), or a digit straight from it | | plus 1 click per look |

The fast path is the answer to the chore risk: the board shows the posts, so typing the post you like goes straight to its entry, and a bet costs what it did before.

## 3. Amendments to betting-screens.md

That file is not edited. These change it:

1. **Section 1, Decision.** "Two pages and the race" becomes: the track, two pages and the race. "No separate bet screen" is **kept**: the bet stays at the foot of the program page. "No Orders and no winner's circle" is kept.
2. **Section 2, the flow.** Replaced by the flow in section 2 here.
3. **Section 2, keys table.** Program choosing: "Esc does nothing" becomes "Esc returns to the track". Result: Enter goes to the track, not the next program. End of day: New day goes to the track at race 1. A Track row is added.
4. **Section 2, press counts.** Replaced by the table above. The bet stays at 4 by the fast path. A pass after reading rises from 3 to 4, and "Just watch" from the track is 3.
5. **Section 3, footer L2.** Adds "Esc: back" right-aligned to x247 (x176-247), Ink, main font, while choosing. It is a pointer target, not a cursor stop, so BP5's focus order is unchanged. It is not drawn while the ticket is open, or during the bet beat.
6. **BP5.** Initial focus is post 1 when opened from Windows, or post k when opened with digit k at the track. The rest of BP5 holds.
7. **BS3.** Unchanged labels. "Next race" now leads to the track.
8. **BE3.** New day starts the next day seed at the track, race 1.
9. **BC2.** Replaced by TH14 below.
10. **Question 3 there (where focus starts).** Still post 1 on the program. The track's own focus starts on Windows.

Kept untouched: section 3's layout, entries, odds column, ticket, bet beat and program states (except the footer addition); the cut from the bet straight to the race; sections 4 (race view), 5 (result), 6 (End of day), 7 (shelved screens), 8 (copy, with the additions in section 7 here) and 10 (art-director rulings); BP1 to BP4, BP6 to BP12, BR1 to BR3, BS1, BS2, BS4, BE1, BE2, BE4, BC1, BC3.

**Also amended, in `docs/specs/m1-race-day.md` section 5 and IN1.** "Keyboard only in M1. No mouse" ends here: the brief says "keyboard and mouse", and mouse was listed under Later. IN1's second half ("every action has a keyboard binding; no handler needs a pointer") stays. IN1's first check, which fails on any pointer API in a scene, is replaced by TH15. This is a change of requirement made on purpose from Joseph's own words, not a weakened test. The commit that changes it says so in the test's comment, as step 5 did. Joseph confirms it before the test changes.

## 4. The track screen

**Job:** say which race is next and what it costs to bet, get him to the program or the rail in one action, and give him a place worth a look.

**Reads first:** the tote board (the biggest dark block, top right: which race, and its prices), then the focused place (focus corners in the picture and the cursor in the box), then the door labels (what Enter does), then the voice rows, then the status bar (the bank, read once). That order puts the reason to bet first and the action second. The voice comes after the actions on purpose: it is flavor, and a reader in a hurry loses nothing by skipping it.

### Wireframe (1x)

```
x 0                                                                       255
y   0 [status bar, Navy y0-14, Ash line y15                                 ]
    4   Race 3 of 8                                          Bank $100.00     Bone, cell tops y4
   16 [sky, whole width behind stand and board: Sky y16-39, Sky Pale y40-63 (races 1-6; see sky by race)]
   24 [stand upper x0-111 y24-95: ]
      [ roof edge y24-31           ]
   32 [ shade + crowd strip y32-47]     [tote board face x124-251, y32-71   ]
   36 [                           ]     [Race 3                             ]  main font, cell top y36, from x132
   48 [ front row y48-63, the     ]     [                                   ]
   50 [ regular x56-71 y48-71     ]     [1 5-2  2 9-2  3 7-2  4 26-1        ]  small font, cell top y50
   56 [                           ]  [infield x112-255 y56-87, flag x115-122 y59-66]
   60 [                           ]     [5 3-1  6 8-1  7 4-1  8 12-1        ]  small font, cell top y60
   64 [ bench, balcony, bunting   ]     [board legs y72-87                  ]
   88 [ recess y84-95             ]  [far rail tile x112-255, y88-95: bar y88-89, grass to y95]
   96 [stand facade x0-111 y96-175]  [track, fast dirt, x112-255, y96-117   ]
  100 [  sign plate x24-87 y100-111, "Windows" x28-83, cell top y102 ]
  108 [                           ]  [fans x124-139, x140-155 | 3rd fan x228-243, y108-131]
  115 [                           ]  [your spot x176-215: program on the rail x192-199, y115-121]
  116 [  windows x8-31, x44-67,   ]
  118 [  x80-103, y116-139        ]  [near rail x112-255, y118-121          ]
  120 [  clerks x16-31, x52-67,   ]
  122 [  x88-103, y120-143        ]  [apron x112-255, y122-175              ]
  128 [  bettor x36-51 y128-151   ]
  140 [  counter x4-107 y140-143  ]  [paddock gate  ][ snack cart x184-215, ]
  146 [                           ]  [x112-159,     ][ y144-167, vendor     ]
  152 [  floor (apron) y152-175   ]  [bugler x128-143 y146-169][ x216-231   ]
  176 [box: frame tiles x0-255, y176-239, Navy fill, interior x8-247 y184-231]
  186   Race 3 is up.                                                          voice row 1, x20
  196   Sun's out. Hats are out.                                               voice row 2, x20
  210 > Bet Race 3                                                             cursor x8-15, label x20
  222   Just watch Race 3                                                      label x20
```

**Status bar** (y0-15): drawn like the race view's announcer bar, so the world screens share a top strip. "Race {r} of {n}" from x4, "Bank {amount}" right-aligned to x251. Longest "Race 8 of 8" (x4-91) and "Bank $165,000.00" (x124-251). Plain, no voice.

**Tote board** (face x124-251, y32-71, legs x140-147 and x228-235 at y72-87). Header "Race {r}" in the main font from x132, cell top y36. Posts 1 to 4 on the row with cell top y50, posts 5 to 8 on the row with cell top y60, in the small font. Column j (0 to 3) puts the post digit's cell at x132 + 30j and the price left-aligned from x138 + 30j, up to 4 characters (last glyph column x152 + 30j). A pending "-" sits at x138 + 30j, right after its digit. So each digit groups with its own price: 3 px inside a pair, at least 9 px between pairs, and the block runs x132-242. The post digit is a second color from the price (Orange and Bone, section 10), so "1 5-2" never reads as "15-2". (Was: digit at x130 + 30j, price right-aligned to x155 + 30j, which in the mock paired a price with the next post's digit.) Pixels and colors are in DESIGN.md "The track (between races)". The prices are `quote(ctx, program, null).odds`: the crowd's prices with no bet in the pool, which is what the program shows before a ticket opens. No favorite treatment, no sorting, no color by price. A post that does not run (field under 8) leaves its cell blank.

**The box** (y176-239): the dialog box from frame tiles (Bone outer, Ash inner, Navy fill), because DESIGN keeps Navy for the world. All text Bone, main font.

- **Voice rows,** cell tops y186 and y196, text from x20, 28 characters a row (x20-243). With a door focused, they hold the state line (row 1, a plain fact) and the race's flavor line (row 2). With a lookable focused, row 1 is the cursor at x8-15 and the lookable's name, and row 2 is its line, blank until the first look.
- **Door rows,** cell tops y210 and y222: the horseshoe at x8-15 on the focused door, labels from x20. Windows first, then the rail, matching the picture left to right. With a lookable focused, neither door row shows the cursor.

There is always exactly one horseshoe on the screen: on a door row, or on voice row 1 beside a lookable's name.

### Doors and lookables

Hit boxes tile the picture's interactive parts with no overlap. Everything not listed (sky, infield, the third fan, the status bar, the voice rows) does nothing when clicked and never takes focus.

| target | kind | hit box (click and hover) | focus corners around | in the box | Enter or click |
|---|---|---|---|---|---|
| windows | door | x0-111, y96-175 | x4-107, y98-145 | door row "Bet Race {r}", item box x8-247, y208-219 | open race r's program, focus post 1 |
| rail | door | x160-255, y90-139 | x172-219, y104-135, around your spot. It frames the program draped on the rail (x192-199, y115-121), centered on it left to right, with 16 px clear of fans A and B (end x155) and 8 px of fan C (from x228), so the corners hold the one thing that marks the spot and touch no figure | door row "Just watch Race {r}", item box x8-247, y220-231 | go to the post with no bet |
| regular | lookable | x0-111, y24-95 | x52-75, y44-75 | "The regular" | next line |
| board | lookable | x124-251, y32-87 | x124-251, y32-71 | "The tote board" | next line |
| fans | lookable | x112-159, y90-139 | x120-159, y104-135 | "Fans at the rail" | next line |
| bugler | lookable | x112-159, y140-175 | x124-147, y144-173 | "The bugler" | next line |
| snack cart | lookable | x160-255, y140-175 | x180-235, y140-171 | "The snack cart" | next line |

**Lines.** Each lookable has three or more lines in data, shown in a fixed cycle: the first look of the day shows line 1, the next shows line 2, and after the last it starts again. Counters live in the day session and reset on New day. A look never touches the day state, the bankroll, the RNG streams or the race. Moving focus away and back does not advance the cycle. Only a look does.

**Focus corners:** four L-shaped corner marks at the corners of the focus box, Yellow with an Ink outline (look for the art-director). They bob 1 px outward and back on the horseshoe cursor's 2-frame loop, in the same phase, so the two read as one focus. They are not a second cursor: the horseshoe is the cursor, and the corners mark the place it points at. With reduced motion, neither bobs.

**The paddock spot.** The paddock gate at x112-159, y140-175 is drawn now, as a gap in a hedge, with the bugler standing at it, where real buglers stand to call the field. If Joseph later makes the paddock a door (question 5), that box becomes the third door. The bugler stays in the art as part of the door, his lines retire, and no other art moves.

## 5. States

| state | picture | box | notes |
|---|---|---|---|
| Day start (boot or New day), prices pending | Board "Race 1", every price a "-" at x138 + 30j, right after its post digit. Sky at its morning bands. | Voice: "The crowd is still betting." / flavor line 1. Focus on Windows. | Both doors work. Windows opens the program in its approved pending state. About 3 s (UI5). Lookables work. |
| Prices posted | All 8 prices appear in the same frame. Nothing ticks or rolls. | Voice: "First race of the day." on race 1, "Race {r} is up." after. Row 2: flavor line r. | The normal arrival state. If a lookable has focus when prices post, its line stays. The state line updates when focus returns to a door. |
| Lookable focused | Corners on it. | Row 1: cursor and name. Row 2: blank until the first look. No cursor on the door rows. | Digits and Esc still work. |
| Looked at | Corners on it. Its idle may play once (section 8). | Row 2: its next line. | Day state unchanged. |
| Rail chosen while prices pending | Unchanged. Corners stay on the rail. | Voice: "Off to the rail." / "Post in a moment." | The race needs its program to settle, so it starts the frame the prices post. Esc cancels the wait, and so does a click on any target other than the rail: that click cancels, moves focus to its target and does nothing else, so a mouse-only player can always back out. Hover and the other keys do nothing during the wait. Pass on a pending program page does not wait at the page: it cuts to the race as built in B5 step 1, and the race settles once the prices post (ruled 2026-11-14, the committed behavior stays). |
| Back from the program (Esc or "Esc: back") | Unchanged. | Voice as on arrival. Focus on Windows. | No money moves. A ticket left open is closed first by Esc, as approved. |
| Bet placed, waiting for the race | Not a track state. The bet beat cuts straight to the race, as approved. | | Question 1. |
| Race over | Not a track state. The result page is where the chart shows and the ticket is paid. Then "Next race" brings the track for race r+1, with the settled bank in the status bar and race r+1's prices on the board, usually already posted (UI5). | | UI3 holds: the track appears only after the result page, which opens after the wire. Nothing in the picture or the voice reacts to a win or a loss. |
| Prices for r+1 still pending on return | As at day start, board "Race {r+1}" with dashes. | "The crowd is still betting." / flavor line r+1. | Only if the result was left very fast. |
| Last race next | Board "Race 8". Sky at its evening bands, if the art-director takes the sky progression. | "Last race of the day." / "Make it a good one." | |
| Broke | Never shown at the track. A settled bankroll under $2 sends the result to End of day, as approved (BK5). | | |
| End of day | Never shown at the track. | | |
| New day | As day start, with the next day seed. Look counters reset. | | |
| Data or betting error | The existing error screen, with the file and field. | | A bad `hub` section or a line over its width fails at load. |
| Art missing | Pink and Ink checker in the slot, the HUD placeholder tag, the console list, as DESIGN. | | |
| Permission denied | Not applicable. Offline, single player, no accounts. | | |
| Window loses focus | Hover and any half-made click are forgotten, as keys are on blur. Focus stays where it was. | | |

**What the model says, and when it has nothing.** The estimate is never shown on this screen or in its `aria-live` text (UI1). Prices are the crowd's, a market fact. While they are not ready, the board shows dashes and the voice says so in words, so the wait reads as the crowd still betting, not as a frozen screen. No line anywhere rates a horse, names a post or hints at a chance, so there is no recommendation to be wrong. A bet can be undone with Esc until it is placed. After that it stands, as it does at a window once the race goes off.

## 6. Pointer rules

**Mapping through the zoom.** The canvas is 256 x zoom by 240 x zoom CSS pixels (`integerScale`, `Scale.NONE`). A pointer's grid point is `x = floor((clientX - rect.left) / zoom)`, `y = floor((clientY - rect.top) / zoom)`, with `rect` the canvas's bounding box. A point outside x 0-255 or y 0-239 is in the letterbox and is ignored. This is one pure function in `src/render/`, tested at zoom 1 to 4, read again after every resize. Hit tests are inclusive on the 1x boxes.

**What a click means.** Primary button only. A target acts on pointer up, only if the pointer went down on the same target on this screen. Releasing elsewhere cancels. Right and middle buttons do nothing. For a short time after a screen arrives (`pointer.arrivalGuardSeconds`, 0.5 s, a starting guess in data) presses are ignored, so the second half of a double click cannot act on the new screen (ruled 2026-11-14). This is the pointer twin of IN2: a double click on the result cannot land its second half on the track, and a mashed click cannot skip a screen unseen.

**Hover.** Moving the pointer into a target moves the one focus there. A still pointer never takes focus back from the keys. Leaving all targets leaves focus where it was. Over a target the OS pointer is the hand (CSS `cursor: pointer`). Elsewhere it is the arrow. Hover shows only what focus shows: on a lookable, its name, not a line.

**Neighbors.** The fans and the rail share an edge at x159/x160. A click that misses the fans by a pixel starts the race. Hover moves focus first, so the door row's cursor and the corners show which one a click will hit. The rail's corners sit 13 px inside its box for the same reason.

**Hover and focus look** are the same: the corners in the picture and the horseshoe in the box. No pressed look. A door cuts on release. A lookable's line appears on release.

**Everywhere a key works,** kept small:

| screen | target | box | same as |
|---|---|---|---|
| Track | the two doors, the five lookables, the two door rows | section 4 | Enter on that target |
| Program, choosing | entry k | x8-247, y57 + 19(k-1) to y75 + 19(k-1) | focus post k, then Enter (ticket). Pending: focus only, as Enter does nothing. |
| Program, choosing | "Pass this race" | x8-159, y222-235 | Enter on Pass |
| Program, choosing | "Esc: back" | x160-247, y222-235 | Esc |
| Program, ticket open | "<" and ">" | each glyph's 8x8 cell plus 4 px each side, rows y210-223 | Left, Right. Not drawn, not a target, with one amount. |
| Program, ticket open | "Enter: bet" | x164-247, y210-223 | Enter |
| Program, ticket open | another entry | as above | Esc, then open the ticket on that horse at the same amount |
| Program, ticket open | the entry being bet | | nothing, so a double click can never place a bet |
| Program, bet beat | anything | | nothing |
| Race | anything | | nothing. The race needs no input. Clicks to skip beats are Later. |
| Result | the action line | x8-247, the row band of "Next race" or "End of day" | Enter |
| End of day | "New day" | x8-247, y216-231 | Enter |

Touch may work as a side effect of pointer events. It is not supported or tested.

## 7. Copy

All in `raceDay.json` copy, ask-first with the other changes. Main font unless noted.

**Voice.** The hub talks the way the program's blurbs do: warm, a little funny, from people and the world. The humor is never at a horse's expense. No line names a post, rates a horse, gives a tip or a hint of one, or mentions money or prices. The status bar, the door labels and anything with a number in it stay plain, so they are never misread.

**Plain lines:**

| key | text | field | longest |
|---|---|---|---|
| hub.status.race | reuses program.race "Race {r} of {n}" | x4 on | "Race 8 of 8", 11 |
| hub.status.bank | reuses program.bank "Bank {amount}" | right-aligned to x251 | "Bank $165,000.00", 16 |
| hub.board.race | Race {r} | from x132, to x247 at most, 14 | "Race 8", 6 |
| hub.sign.windows | Windows | x24-87 plate, 8 at most | 7 |
| hub.door.bet | Bet Race {r} | x20-243, 28 | "Bet Race 8", 10 |
| hub.door.watch | Just watch Race {r} | 28 | "Just watch Race 8", 17 |
| program.back | Esc: back | right-aligned to x247 | 9 |
| board figures | small font: post digit at x132 + 30j, price from x138 + 30j | price 4 at most, to x152 + 30j | "26-1" |

**State lines (voice row 1),** each at most 28:

| key | text | length |
|---|---|---|
| hub.state.first | First race of the day. | 22 |
| hub.state.next | Race {r} is up. | 15 |
| hub.state.last | Last race of the day. | 21 |
| hub.state.pending | reuses program.pending "The crowd is still betting." | 27 |
| hub.state.toRail | Off to the rail. | 16 |

**Flavor lines (voice row 2),** one per race, shown with every state except toRail, which shows "Post in a moment." (17). Each at most 28. The last race always shows line 8.

| key | text | length |
|---|---|---|
| hub.flavor.1 | Gates open. Coffee's hot. | 25 |
| hub.flavor.2 | The pigeons found seats. | 24 |
| hub.flavor.3 | Sun's out. Hats are out. | 24 |
| hub.flavor.4 | Someone dropped a pretzel. | 26 |
| hub.flavor.5 | The breeze smells like hay. | 27 |
| hub.flavor.6 | Peanut shells, everywhere. | 26 |
| hub.flavor.7 | The shadows are stretching. | 27 |
| hub.flavor.8 | Make it a good one. | 19 |

If a day has more races than lines, the cycle wraps, and the last race still shows line 8.

**Lookables.** Name on voice row 1 (after the cursor), line on row 2. Each line at most 28 characters on one row (x20-243). Three or four lines each, at least three:

| lookable | name | lines |
|---|---|---|
| regular | The regular | Same seat for thirty years. (27) / My hat has its own fans. (24) / Brought a cushion. Genius. (26) / Here for the hats, honestly. (28) |
| board | The tote board | Two thousand bulbs. Two out. (28) / It hums a little B flat. (24) / Polished every morning. (23) |
| fans | Fans at the rail | Lucky socks. Both left feet. (28) / Best spot in the house. (23) / Nephew's at the snack cart. (27) / We cheer for all of them. (25) |
| bugler | The bugler | Twelve notes, every race. (25) / I practice in the car. (22) / Neighbors love it. Mostly. (26) / Never missed a call yet. (24) |
| snack cart | The snack cart | Hot peanuts! Mostly warm. (25) / Lemonade, lightly lemony. (25) / Mind the pigeons. Bold ones. (28) / Rain or shine. Mostly shine. (28) |

The loader checks every line against 28 and fails with the key if over.

"Just watch" matches the race HUD's "Just watching". No word from `copy.bannedWords`, and no "cash" or "buy" in any form: the snack cart's lines never say anything is for sale.

**`aria-live`:** the track mirrors "Race {r} of {n}", the bank, the voice rows and the focused target's label or name, on arrival and on each focus change, and a lookable's line when it is shown. It does not read the eight prices; the program page is where they are read.

## 8. Life in the picture

Suggestions, each with its job. The art-director rules. The race view's cap carries over: at most 3 ambient things moving at once, swaps at most 4 a second in wall time, nothing flashes Bone on Ink, all of it stops with reduced motion.

1. **Prices post on the board,** all in one frame, once. Job: the wait is over. This is the screen's loading state, drawn as the world.
2. **The crowd strip on the stand seats,** reused, 1 swap a second, neighbors out of phase. Job: it is race day and the stand is full.
3. **The infield flag,** reused. Job: the picture is live, not a menu backdrop.
4. **One idle at a time among the people,** taking turns every few seconds: a clerk stamps a ticket, a fan turns a program page, the vendor stirs the lemonade, the bugler polishes his horn, the regular fans herself with her program. Job: the people are busy with their own business, which is DESIGN's idea of charm. Only one plays at once, so the cap holds.
5. **A look answered,** the looked-at person plays their idle once. Job: the world noticed the click. It takes the people's idle turn, so the cap still holds.
6. **The sky through the day,** a palette remap by race number, from morning bands at race 1 to Dusk at race 8, never an overlay. Not motion. Job: how far through the card you are, at a glance.

Nothing reacts to money: no change in the picture or the voice after a win or a loss.

## 9. Acceptance criteria

These extend betting-screens.md and betting-simple.md. All of their criteria still hold, as amended in section 3.

- **TH1 [T]** The `hub` data loads and is checked: every hit box lies inside the screen, no two overlap, every box is at least 16x16, every focus box lies inside the picture (y16-175). A bad box fails at load with the file and field.
- **TH2 [T]** The grid mapping returns `floor((client - rect) / zoom)` at zoom 1, 2, 3 and 4, null in the letterbox, and the right target after a resize from 3x to 2x.
- **TH3 [T]** Hit test: every grid point inside a target's box returns that target, every point outside all boxes returns none.
- **TH4 [T]** One focus. Keys and hover move the same focus. In every state, exactly one horseshoe is drawn, and it and the focus corners name the same target. Hover moves focus only on pointer move into a target.
- **TH5 [T]** Arriving at the track, from the result, New day or boot, focus is Windows, whatever had focus before. Esc or "Esc: back" from the program returns with focus on Windows and moves no money.
- **TH6 [T]** Enter on Windows opens race r's program with focus on post 1. Digit k opens it with focus on post k, from any focus, pending or not. Digits above the field size do nothing.
- **TH7 [T]** Enter on the rail calls Go to the post with no bet. While prices are pending it waits, shows the toRail voice, starts the race the frame they post, and Esc or a click on any other target cancels the wait. That click moves focus to its target and does not act. Hover and other keys do nothing during the wait.
- **TH8 [T]** Every price on the board equals `quote(ctx, program, null).odds` for its post, drawn left-aligned from x138 + 30j beside its post digit at x132 + 30j, never past x152 + 30j. While pending, every price is "-" at x138 + 30j. The status bar's bank equals the day state's bankroll and the race line equals "Race {r} of {n}".
- **TH9 [T]** The track never shows the estimate, in pixels or `aria-live` text (UI1), and is never shown after the last race or with a settled bankroll under $2.
- **TH10 [T]** Every copy key in section 7, at its longest value, fits its field (28 on the voice rows). None contains a banned word.
- **TH11 [T]** A click acts only on the primary button's release over the target it went down on, on this screen. A release elsewhere, a right click, a click in the letterbox and a click on a non-target do nothing and leave focus unchanged.
- **TH12 [T]** Each pointer target in section 6 calls the same action as its key. A click on the entry already being bet does nothing. No click acts during the bet beat or the race.
- **TH13 [T]** With one offered amount, "<" and ">" are neither drawn nor targets.
- **TH14 [T]** Scripted input, replacing BC2: by keys, the fast bet path (Enter, digit, Enter, Enter), the menu bet path (Enter, Enter, digit, Enter, Enter), Just watch (Enter, Down, Enter) and Pass after reading (Enter, Enter, Up, Enter) each reach the next race with those presses and no others. By clicks, bet in 4 and Just watch in 2.
- **TH15 [T]** Replacing IN1's first check: pointer handling is bound in one scene helper only. Every pointer target maps to an action id that also has a key binding, and a test lists them, lookables included. Every action on every screen still has a key.
- **TH16 [T]** With `prefers-reduced-motion`, the ambient loops and idles stop and neither the cursor nor the focus corners bob.
- **TH17 [T]** Key order: Left and Right visit the seven targets in the order of section 2 and wrap. Up and Down move between the doors, and from a lookable go to Windows. Esc on a lookable goes to Windows. Esc on a door does nothing.
- **TH18 [T]** Looks. Enter or a click on a lookable shows its next line in the fixed cycle, starting at line 1 each day. Moving focus does not advance a cycle. After any number of looks, the day state is byte-identical to the same day with no looks (DT4), and no RNG stream was drawn.
- **TH19 [E]** At 3x, in 2 seconds and without the box, Joseph names the windows, the rail and the tote board. It reads as a generic track: no real venue's architecture, no casino look.
- **TH20 [E]** Focus is visible in the picture and the box at 3x, in color and in grayscale, on every target.
- **TH21 [E]** Joseph reads every lookable and flavor line. None reads as a tip, a rating or a hint at a horse's chance, none is at a horse's expense, and he smiles at a few. Lines he dislikes are cut in data.
- **TH22 [E]** No frame over 16.7 ms on the track while the estimate runs (UI6), measured in PERF.md.
- **TH23 [E]** Gate: two days back to back, by keys one day and by mouse the other. Joseph notes whether the track ever felt like a chore, whether he clicked the lookables more than once, whether he wanted a place it does not have, and every time a click meant for the fans started a race instead (the fans and the rail door share the edge at x159/x160).

## 10. For the art-director

Ruled 2026-11-13 by the art-director. DESIGN.md "The track (between races)" has the pixels and colors, and wins over this spec where they differ. No hit box or focus box moves. In short:

1. **Composition: accepted, with art changes inside the boxes.** The right half is the race view's own art at its own rows (infield y56-87, rails, dirt), so the track and the race read as one place. No far hills (they would show only as slivers). The flag flies in the gap at x115-122, y59-66. The stand gets real people scale: a sunlit front row with the regular, the crowd strip in Coal shade under the roof, then the balcony, the Maroon trim and the windows. The ground line under the stand is y152, not y156, so a standing bettor's waist meets the counter at y140; clerks sit on high stools behind it. The bettor stands at window 2 (x36-51, y128-151). The bugler moves up 2 px to y146-169 so the focus corners clear his feet. The spec has no slot for the stand's upper part (roof, shade, front row, balcony, y24-95): it needs one image slot, for example `art.hub.stand.upper` 112x72, and `art.hub.stand.facade` may be one 112x80 image. That is the designer's call.
2. **Focus corners:** an 8x8 L, 4 px thick, Ink, 2 px Yellow, Ink. They never cover a figure, bob with the cursor, and only appear with the horseshoe in the box, so they read as "this place", not a second cursor. UI, not counted in the cap.
3. **Tote board:** Ink face, 2 px Slate frame with an Ash top edge, Slate legs. Header Bone, post digits Orange, odds Bone, pending "-" Bone. Exact palette hexes, never a tint.
4. **Sign plate:** Pine with a Turf top row, no border, text Bone.
5. **Sky by race: yes,** three steps: races 1-6 day, 7 late (Sky Pale above the board), 8 evening (Dusk). The race view follows the same table, so the day never jumps between screens. `skyByRace` goes in data.
6. **Idle rotation: yes, inside the cap** (crowd, flag, one idle). Every 4 s, A-B-A-B at 0.25 s, a fixed order, no RNG. A look takes the turn.
7. **Paddock gate:** a head-high hedge with a Bone gateway (posts and crossbar), the paddock's Turf and Grass seen through it, the bugler standing in it. It is already a doorway, so becoming a door moves nothing.
8. **8 or 16 bit:** loosened on Joseph's line, and written at the top of DESIGN.md. Still pictures may use 8 colors per 16x16 screen cell and be drawn as whole images. People everywhere may use 4 opaque colors, the fourth a second flat material, never a shade. The vision line now reads "8-bit at heart and never past 16". Unchanged: the 42 colors, the 1x grid, no gradients or alpha, two tones per material, the outlines, horses, race view tiles, UI, fonts, the cap and the banned looks. The cart is still-picture art now, with no outline, so its colors fit.
9. **Charm and tone:** every figure has a look and a prop in DESIGN.md (the regular's Purple hat, the clerks' Turf jackets, the bugler's scarlet coat and horn, the vendor's paper hat). The windows read as a track's through the open wood counter, the lamp-lit booths, the tote machine with its ticket tongue and the program in the bettor's pocket. No bars, grilles, marble, neon, bulbs or "$" anywhere in the picture. One bugler figure for the whole game.

**Art slots needed** (all new unless marked). Color limits are DESIGN.md's, as loosened on "8 or 16 bit": a still picture's parts at most 8 colors in each 16x16 screen cell, and drawn as whole images; people at 4 opaque colors; UI as before. Sizes and frames here, pixels and colors in DESIGN.md "The track (between races)".

| slot | size, frames | note |
|---|---|---|
| `art.hub.stand.upper` | 112x72, 1 | x0-111, y24-95: roof edge (the roof lives here, no separate slot), shade with the crowd strip drawn over it, front row, bench, balcony with bunting, recess. Added on the art-director's ruling |
| `art.hub.stand.facade` | 112x80, 1 | x0-111, y96-175, one image, not tiles: trim, wall, window openings with lamp-lit booths, tote machines, counter. The floor from y152 is the apron |
| `art.hub.sign.plate` | 64x12, 1 | no text |
| `art.hub.clerk` | 16x24, 2 | idle: stamps a ticket. Recolored per window |
| `art.hub.bettor.back` | 16x24, 1 | at a window, back to us |
| `art.hub.regular` | 16x24, 2 | in the stand, big hat. Idle: fans with her program |
| `art.hub.fan.back` | 16x24, 2 | at the rail, idle: page turn. 2 or 3 recolors |
| `art.hub.bugler` | 16x24, 2 | idle: polishes the horn. Shared with the race view's bugler if the art-director wants one figure |
| `art.hub.vendor` | 16x24, 2 | idle: stirs the lemonade |
| `art.hub.cart` | 32x24, 1 | snack cart. No prices, no money, no register |
| `art.hub.paddock.gate` | 48x36, 1 | hedge gap. Becomes a door if question 5 is yes |
| `art.hub.tote.board` | 128x56, 1 | face and legs, no text |
| `art.hub.apron` | 16x16 tile, 1 | x112-255 from y122, and under the stand from y152 |
| `art.hub.rail.program` | 8x7, 1 | a program draped over the near rail at x192-199, y115-121. It saves "your spot", so the rail door's corners frame something |
| `art.ui.focus.corner` | 8x8, 2 (top, bottom) | flipped horizontally for the right side |
| reused | | `art.race.bg.mid.crowd`, `art.race.bg.mid.infield`, `art.race.ambient.flag`, `art.track.dirt.fast`, `art.race.rail.far`, `art.race.rail.near`, `art.ui.frame.box`, `art.ui.cursor.horseshoe`, `font.ui.main`, `font.ui.small` |

## 11. New data and schema fields (one list, all ask-first)

1. **`raceDay.json`, new section `hub`** (schema change): `doors` (id, hit box, focus box, label key, action), `lookables` (id, hit box, focus box, name key, line keys in cycle order), `targetOrder` (the Left and Right order), `doorRows` and `voiceRows` (cell tops, item boxes), `toteBoard` (face box, header cell at x132, the post digit x 132 and price x 138 for column 0, the column pitch 30, row cell tops y50 and y60, price length 4 at most), `idleEverySeconds`, and `skyByRace` (the art-director took it: the three-step table in DESIGN.md, shared with the race view). Each value with status and note, as the file does today.
2. **`raceDay.json` copy:** the new keys in section 7 (`hub.*`, `program.back`), with a loader check of every voice and lookable line against 28 characters.
3. **`slots.json`:** the new slot entries in section 10. New entries in an existing schema, listed so Joseph sees them.
4. **Not data, flagged with these:** IN1's pointer ban in `src/render/slotStatus.test.ts` is replaced by TH15 (section 3).

No new dependency. No change to `betting.json`, `day.json`, `stable.json` or the betting rules. Look counters live in the session passed between scenes, never in storage (SAFE3).

## 12. Questions for Joseph

1. **After a bet: straight to the race, or back to the track with the ticket in hand?** Back to the track shows your ticket in the picture, but adds a press to every bet and the stop has nothing to do. *Recommend: straight to the race, as approved.*
2. **A single click acts.** The other choice is click to focus, click again to act, which is safer and slower. Hover already shows what a click will hit. *Recommend: single click acts.*
3. **The tote board shows all eight prices,** a second place the odds appear, before you open the program. *Recommend: yes. It is the most "at the track" thing in the picture and it shows the crowd still betting.*
4. **Leaving the day early from the track** (an exit gate to the End of day page). It is a rules change: the day can only end after race 8 or broke today. *Recommend: Later, not now.*
5. **The paddock as a third door later,** a place to look the field over before betting. It is shelved in betting-simple.md, so it stays out of this build. Its spot is drawn now at x112-159, y140-175, the gate the bugler stands at, so saying yes later moves no art. *Recommend: not yet. It earns a door only if it shows something the program cannot, such as how each horse looks and walks, and you said picking already had too much detail. Decide after the gate, and if yes, make it a look at the horses with no new numbers.*

## 13. Least sure

Whether two doors and five lookables are enough to feel like "going to the track". Lookables add things to find without adding steps, but a fixed cycle of three or four lines a person may wear thin over many days. Lines are data, so new ones cost nothing, and TH23 asks whether he clicks them more than once. Second: opening the program at "the windows" may read oddly when he only wants to read. The door says "Bet", and Esc comes straight back. If it jars, change the label, not the flow. Third, a risk the art-director saw in the mock: the fans and the rail door sit side by side, so a click that just misses the fans starts the race. Hover focus is the only guard. TH23 has Joseph log every such miss at the gate. If even one happens, move the fans to the far side of your spot, or shrink the rail door's left edge, before anything else.
