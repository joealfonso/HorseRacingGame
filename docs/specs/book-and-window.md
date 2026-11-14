# Spec: the book and the window

Status: draft for Joseph's review. Written 2026-11-14 by the designer. It splits the approved program page into two things: **the book** (a program you hold and read: cover, news, race pages) and **the window** (where you bet, at the track). It amends `docs/specs/betting-screens.md`, `docs/specs/track-hub.md` and DESIGN.md. Section 11 lists every amendment. Those files are not edited here. Every pixel box is at 1x on the 256x240 grid, inclusive. Every timing is a starting guess in data.

Marks: **[T]** tested headless, **[E]** needs eyes on the build.

## 1. Problem, user, decision

**User:** Joseph, at a desk with a keyboard and a mouse, playing a day of eight races. He is the only player.

**Problem:** he asked: "the book should have a cover with a design, it should open to news and then races. clicking the window should bring up the betting ui". Earlier direction still holds: "It should all be like a real horse racing book", "simplify it to picking a horse, it having attributes and stats compared to others", "8-bit type graphics remember. it should be charming", "make the betting like going to the track", "make sure the game keeps a sense of humor". Today the program page is the book and the betting UI at once, so there is no cover, no news, and the window is a page of print.

**Decision:**

1. **The book is something you hold, not a place.** It opens from a new first row in the track's box, "Read Race 3", with no hit box in the picture. Its pages, in order: cover, news, race 1 to race 8. Left and Right turn pages. Pages cut, they never animate.
2. **The day opens on the cover.** Boot and New day show that day's cover first. You are handed the program at the gate. This is also when race 1's prices are being worked out (about 3 s), so the cover and news fill the wait.
3. **Between races the book opens at the next race's page,** not the cover. Cover and news are one and two pages to the left.
4. **The window is the only place you bet.** Clicking the windows in the picture, or the "Bet Race 3" row, opens a close-up of one window: a clerk behind the counter above, a Navy box below listing the eight horses by post, name and odds, then the approved ticket (amount, pays, Enter: bet) and the approved printed tote ticket on Enter.
5. **The book hands a choice to the window.** On the next race's page, Enter or a click on a horse goes to the window with the ticket already open on that horse. You read, mark, walk to the window. That keeps read-then-bet at 5 presses, as today.
6. **Focus arrives at the track on "Read"**, since stats now live only in the book and Joseph asked to pick by comparing them. A digit at the track still goes straight to the window at that post, so a bet without reading costs 4 presses, as today.

**Why this shape.** Joseph's words split reading from acting. The cost track-hub.md named, more steps to a bet, is real, so every path is counted against the approved counts (section 2) and only two get longer, each by one press: a pass after reading, and the first race of the day.

**Rejected:**

- **The book as a place in the picture** (a program stand or a program seller by the gate). There is no free spot without moving approved art, and a program is in your hand at a real track, not behind a counter.
- **The book opens at the cover every time.** Two extra presses on every race to see the same page. The cover gets its moment once a day.
- **Only the next race in the book.** A program holds the whole card, and paging ahead or back costs nothing. The price constraint is handled with a defined "Prices later" look instead (section 5).
- **The window as a box laid over the track picture.** It would cover the very windows you just clicked, and it loses the clerk, who is the window's charm.
- **Stats at the window.** He asked for less to read while picking. The comparing happens in the book. Question 3.
- **One-step betting at the window** (Enter on a horse places the bet). One mashed Enter would bet. The approved two steps (choose, then confirm with the pays shown) stay.
- **A page-turn animation.** DESIGN: nothing on a page animates except the cursor bob and the swipe. A curl at 1x needs many frames and reads modern.
- **A full-color cover.** It reads as a title screen or a poster. Two inks on cheap paper is what a track program looks like, and it is the program pages' own Ink and Maroon.
- **News as flavor only, or facts only.** Flavor only wastes a page he sees every day. Facts only is dry, and the world has few facts that change. A mix (section 4).

## 2. The flow and the keys

```
Boot or New day -> Cover (day d) -> News -> Race 1 page ... (Esc at any page: Track)
Track (race r) -> Read Race r  -> Book at race r's page -> Enter on a horse -> Window, ticket open -> Enter: bet -> Race
               -> Bet Race r / the windows in the picture / digit k -> Window, choosing -> Enter -> Enter: bet -> Race
               -> Just watch Race r / the rail                    -> Race (no bet)
               -> a lookable: one line, stay
Race -> Result -> Track (race r+1) ... after race 8: Result -> End of day -> New day -> Cover (day d+1)
```

| where | keys |
|---|---|
| Track | **Up, Down:** through Read, Bet, Watch, wrapping. From a lookable, either goes to Read. **Left, Right:** the seven picture targets as approved (Read has no picture target). **Enter, Space or Z:** acts. **1 to 8:** open the window, focus on that post, from any focus. **Esc:** on a lookable, focus goes to Read. On a row it does nothing. |
| Book, cover | **Enter, Space, Z or Right:** turn to news. **Esc:** close, to the track. |
| Book, news | **Enter, Space, Z or Right:** turn to race 1. **Left:** cover. **Esc:** close. |
| Book, race page | **Up, Down:** the entry cursor through posts 1 to 8, wrapping (no Pass). **1 to 8:** jump to a post. **Left, Right:** turn page. **Enter, Space or Z:** on race r's page with prices posted, go to the window with the ticket open on that horse. Anywhere else, nothing. **Esc:** close. |
| Window, choosing | As the approved program choosing, without Pass: Up, Down through the posts, wrapping, 1 to 8 jump, Enter opens the ticket. **Esc:** back to the track. |
| Window, ticket open | As approved: Left, Right step the amount, Enter places the bet, Esc closes the ticket and the cursor returns to that horse. |
| Race, Result, End of day | As approved, except New day goes to the cover. |

**Focus on return to the track:** from the Result, Read. From the book or the window (Esc or a click on its back item), Bet. Why: on arrival the sensible next step is reading. After reading or backing out of the window, it is betting.

**The book between races:** closed. Read opens it at race r's page with the cursor on post 1. It never remembers the page you left. Nothing in the book changes the day state, the bankroll or any RNG stream.

### Press and click counts

Per race, counted the approved way, from the result page of the race before. "Approved" is track-hub.md section 2.

| path | keys | approved | clicks | approved |
|---|---|---|---|---|
| **Bet $2 on a horse, fast** (digit at the track) | Enter (result), `3` (window, focus #3), Enter (ticket), Enter (bet). **4** | 4 | Next race, the windows, the #3 row, "Enter: bet". **4** | 4 |
| **Bet $2 by the menu, no reading** | Enter, Down (Bet), Enter (window), `3`, Enter, Enter. **6** | 5 | as above. **4** | 4 |
| **Pass** (just watch) | Enter, Up (wraps to Watch), Enter. **3** | 3 | Next race, the rail. **2** | 2 |
| **Read the next race, then bet $2** | Enter, Enter (Read), `3` (focus #3 in the book), Enter (window, ticket open on #3), Enter (bet). **5** | 5 (approved menu path, where the program was read and bet in one) | Next race, "Read Race r", the #3 entry, "Enter: bet". **4** | 4 |
| **Read, then pass** | Enter, Enter (Read), Esc (track, focus Bet), Down (Watch), Enter. **5** | 4 | Next race, Read, "Esc: close", the rail. **4** | 3 |
| **Day start: cover, read race 1, bet $2** | Enter (cover to news), Enter (news to race 1), `3`, Enter, Enter. **5** | 4 (track, then the program) | the cover, "Race 1 >", the #3 entry, "Enter: bet". **4** | 3 |
| **Day start, skip the book, bet** | Esc (cover to track), `3`, Enter, Enter. **4** | 3 | "Esc: close", the windows, the #3 row, "Enter: bet". **4** | 3 |
| Change the amount | plus 1 Left or Right per step | same | plus 1 click on "<" or ">" | same |
| Read ahead or back | plus 1 Left or Right per page | new | plus 1 click per page | new |

What the split costs: one press on a pass after reading, one press and one click once a day for the cover, and one press on a menu bet that skips the book (the digit path is still 4). Bet-by-reading, the path Joseph asked for, costs what it did.

## 3. The cover

**Job:** say "this is today's program" and set the day apart from the last one. **Reads first:** the masthead (the track's name on the Maroon block), then the picture, then the cover line (which sells the news page), then the dateline. The dateline is read once, so it sits small under the masthead.

**Why this look:** the front of a cheap track program is one sheet printed in two inks: a solid color masthead with the track's name knocked out, a dateline, a big picture of horses running, and a teaser. Two inks, Ink and Maroon on Parchment, are the program pages' own inks, so the cover and the pages read as one object. The joke lives in words (the cover line) and in one person in the picture, never in a horse.

### Wireframe (1x)

```
x 0                                                                       255
y   0 [Parchment, whole screen. Dog-ear x248-255, y0-7, if ruled in (art-director 4)]
    8 [masthead: Maroon fill x8-247, y8-43. Parchment 1 px keyline, the rectangle x10-245, y10-41]
   15              Churchill Downs                  track name, centered, Parchment, cell top y15
   28              Race Day Program                 cover title, centered, Parchment, cell top y28
   48 Day #12345                                   8 races today    "Day" main + "#12345" small, Ink; right-aligned to x247
   58 ---------------------------------------------------------------- 1 px Ink rule, x8-247
   62 [picture x8-247, y62-189, 240x128: a 1 px Ink plate border on its outer edge, art inside]
  196            Bugler finds a 13th note           cover line, centered, Ink, cell top y196
  210 ---------------------------------------------------------------- 1 px Ink rule
  226                       Esc: close                       News >    running foot (section 6)
```

Centering: a text of n characters starts at x = floor((256 - 8n) / 2).

### Regions: what is art, what is type

| region | box | art or type | colors | notes |
|---|---|---|---|---|
| Paper | x0-255, y0-239 | code fill | Parchment | as every program page |
| Masthead block | x8-247, y8-43 | code fill | Maroon | a solid second-ink block. Code-drawn, so it needs no slot. The art-director may make it art |
| Keyline | rectangle x10-245, y10-41, 1 px | code | Parchment | the printed border that makes the block read as a masthead, not a UI box |
| Track name | cell top y15, centered | type, main font, from data (race 1's `track` in `day.json`) | Parchment, knocked out of Maroon | at most 28 characters (x16-239). Loader fails over 28 |
| Cover title | cell top y28, centered | type, main font, from data | Parchment | "Race Day Program". At most 28 |
| Dateline | cell top y48 | type: "Day" main font at x8-31, "#12345" small font from x36, on the main font's rows 2-6 (DESIGN) | Ink | the day seed, the same pair as the End of day page, so the front and back covers agree |
| Race count | cell top y48, right-aligned to x247 | type, main font | Ink | "8 races today", at most 16 |
| Rules | y58 and y210, x8-247 | code | Ink | as program rules |
| Picture | x8-247, y62-189 | art, `art.book.cover.art`, 240x128, 1 frame | Ink and Maroon on transparent (the paper shows through). Nothing else | a still picture: at most 8 colors a 16x16 cell is far above what it uses |
| Cover line | cell top y196, centered | type, main font, from the news page's item 1 headline | Ink | at most 30 |
| Running foot | cell top y226 | type | Ink | section 6 |
| Dog-ear | x248-255, y0-7 | art, `art.book.cover.corner`, 8x8 | Ink (the desk beyond the fold), Dirt (the paper's underside), Parchment | only if the art-director rules it in. Job: well-loved. It sits clear of the masthead, which ends at x247 and starts at y8 |

**Brief for the picture (`art.book.cover.art`, 240x128).** A printed two-ink illustration, the kind a program prints from one plate per ink.

- Subject: the stretch run seen from the rail. Three horses in full stride, left to right, the leader's nose near x180 of the picture, at the race view's proportions or larger, drawn as athletes (DESIGN Horses: long legs, deep chest, small head, no faces). Behind them, the generic stand with its bunting and the crowd as Maroon texture. The wire post at the right.
- The one joke: in the stand's front row, one hat far bigger than any other, the regular's, as on the track. A person is the joke, never a horse.
- Values: Ink for outlines, shadows and dark coats; Maroon for the stand, the bunting, one horse's silks and the shade side of the horses; Parchment (transparent) for light. Dither only as fixed-pattern texture (dirt, crowd), never as a ramp.
- Big calm shapes. It must read at 3x in 2 seconds as "horses racing at a track".
- Banned: real venue architecture (no twin spires), real logos, the word "Official", any price, "$", coins or any casino look, a fallen or hurt horse, a crop strike.

**Not on the cover:** no price (a real program prints one; here it would put money on the front), no "Official", no real logo, no sponsor, no barcode.

## 4. The news page

**Job:** one page a day that makes the world feel lived in and carries two or three true facts about today's card that the race pages do not say at a glance. **Reads first:** the five headlines in Maroon, top to bottom, then the bodies of the ones that caught the eye.

### What news is, in a game where stats never change

Decided: **a mix, with a hard line between the two kinds.**

- **Fact items** are true, computed from the day's data, and plain. They may name horses, races and odds. They never rate a horse, predict, or hint at a chance.
- **Flavor items** are about people and the world (the bugler, the regular, the snack cart, pigeons, parking). They never name a horse, a post, a race number or a price, so they can never be wrong about the game and never read as a tip.

What is true and known:

| fact | source | when |
|---|---|---|
| Today's card: race count, distance, surface, going | `day.json` | every day |
| Horses running twice today, with their races | the day's drawn fields (`fieldDraw`, known from the day seed at day start) | every day the draw has a double (about 24 of 40 horses run twice today) |
| Yesterday's longest-price winner, its race and odds | the previous day's record, **kept in the session only** | only after New day in the same session. Never after a reload. Nothing is saved (SAFE3) |

Not news, on purpose: prices for today (most are not worked out yet, section 5), stat leaders across the day (question 4), anything about form or fitness (nothing changes).

### Where the text comes from

- Templates in data (`book.json`, `news`), in two pools: `facts` (one template per fact kind, with fills) and `flavor` (whole items, no fills).
- Picked on a new named stream, `news`, from the day seed. Only flavor picks draw from it. Facts are computed, not drawn. The stream is added to the betting stream list (DT2), so no existing stream shifts.
- Fills: `{n}` races, `{distance}` in program words, `{going}`, `{surface}`, `{name}` from `stable.json`, `{a}`, `{b}`, `{r}` race numbers, `{odds}` as the tote shows it.
- Bodies wrap at word spaces to at most 2 lines of 30 characters. The loader fills every fact template with every horse in `stable.json`, every odds label and every race number, and fails with the key if any result needs a third line. Flavor bodies are checked as written.
- Code: a pure module under the same bans as the betting code (no Phaser, no clock, no `Math.random()`).

### Slots, 5 items a day

| slot | content | fallback |
|---|---|---|
| 1 (lead) | flavor, drawn. Its headline is also the cover line | none needed |
| 2 | fact: Today's card | none needed |
| 3 | fact: Running in two races today, the two horses whose first start is earliest, one per line | flavor, drawn |
| 4 | flavor, drawn | |
| 5 | fact: Yesterday's longest price | flavor, drawn |

No item repeats within a day. Five always print.

### Wireframe (1x)

```
x 8                                                               247
y   4  Rail Talk                                      Day #12345       title Maroon; Day pair as the back page
   14  Gossip, facts and peanuts.                                      subtitle, Ink
   24  -------------------------------------------------------------   rule
   30  Bugler finds a 13th note                                        item 1 headline, Maroon
   40  He is saving it for a special                                   body, Ink, at most 2 lines of 30
   50  occasion. Today is not it.
   66  Today's card                                                    item k at y30 + 36k
   76  8 races, all 1 1/4 miles on
   86  fast dirt.
  102  Running in two races today
  112  Gravy Subpoena, races 2, 6
  122  Hold My Oats, races 3, 7
  138  Pigeons hold the good seats
  148  Ushers asked nicely. The
  158  pigeons have declined.
  174  Yesterday's longest price
  184  Mint Julep Lawsuit won race 4
  194  at 26-1.
  210  -------------------------------------------------------------   rule
  226  < Cover                Esc: close                 Race 1 >      running foot
```

Headline at +0, body at +10 and +20, next item at +36. Headlines are titles, so Maroon is inside its approved "titles" use. All text from x8.

### Sample items (for judging the voice)

Flavor (headline, then body as it wraps):

1. **Bugler finds a 13th note** / He is saving it for a special / occasion. Today is not it.
2. **Biggest hat in the stand** / The regular's hat now has its / own seat. Nobody argued.
3. ~~**Lemonade tested, lemony** / Inspectors found a trace of / lemon. The vendor is thrilled.~~ Cut 2026-11-14 on the art-director's flag (18.4): it is shaped like a drug-test headline, and in racing those are about horses.
4. **Pigeons hold the good seats** / Ushers asked nicely. The / pigeons have declined.
5. **Lost and found** / Lost: one lucky sock, left. / Not as lucky as advertised.
6. **Tote board gets a polish** / All bulbs polished but two. / Nobody can reach those.
7. **Peanut shells set a record** / Section C reports ankle deep. / Knee deep by the last race.
8. **Parking update** / Lot B is full. Lot C is a cow / pasture. The cows are fine.
9. **The bugler's car, explained** / His car horn plays the call to / the post. On purpose.
10. **Snack cart adds napkins** / Fewer sticky programs / reported. A proud day for all.
11. **Regular's cushion returns** / Same cushion, thirty seasons. / Still plump. Still hers.
12. **Pretzel situation resolved** / The dropped pretzel was found. / A pigeon got there first.

Facts (templates, with a filled example):

13. **Today's card** / `{n} races, all {distance} on {going} {surface}.` / "8 races, all 1 1/4 miles on / fast dirt." When the races differ in distance or surface: `{n} races today. First up: the {race1Name}.`
14. **Running in two races today** / one line each: `{name}, races {a}, {b}` / "Mint Julep Lawsuit, races 2, 6" (30, the longest).
15. **Yesterday's longest price** / `{name} won race {r} at {odds}.` / "Mint Julep Lawsuit won race 4 / at 26-1."

Several lines call back to the track's lookables (the bugler's twelve notes, the regular's cushion, the bulbs two out, the pretzel), so the news and the place read as one world.

**News rules the loader checks:** every word in `copy.bannedWords` (betting.json), the hub's list, and a news list, whole words, case-insensitive: injury, injured, hurt, lame, limping, fell, fall, vet, scratched, ambulance, favorite, tip, pick, lock, sure thing. A flavor item with any fill fails. No real horse, person, publication or brand: a writer's rule, checked by Joseph at the gate (NW6).

## 5. The race pages

**Decided: one page per race, all eight in the book.** A program holds the card. Pages for races whose prices are not worked out show a defined look.

**Job:** compare the field: stats down the columns, styles, prices when posted. **Reads first:** as approved: names and styles, then down each stat column, then down the odds.

### What changes from the approved program page

Pixels y0-209 are the approved program page (betting-screens.md section 3, DESIGN "Program pages"), except header line 1's right slot. The footer changes.

```
x 8                                                               247
y   4  Race 3 of 8                               Enter: to window      L1 right: the page state (table below), was "Bank"
   14  Old Fence Row Stakes                                            as approved
  ...  (heads, rules, eight entries, odds column: as approved)
  210  -------------------------------------------------------------   rule
  214  Served papers to the leader.                                    L1: the focused horse's blurb, or a state line
  226  < Race 2               Esc: close                 Race 4 >      L2: the running foot (was "Pass this race")
```

- **No bank in the book.** A printed program does not know your bankroll. It shows on the track's status bar and at the window.
- **No band, no ticket, no Pass, no swipe in the book.** The band means "the horse you are betting on", and the bet now lives at the window.
- **The cursor** is the paper horseshoe, through posts 1 to 8, so the blurb in the footer can be read for each horse.

### Page states

Race r is the next race to run. The estimate is requested for r and r + 1 only, as built (UI5). The book never requests more.

| page | prices | L1 right (at most 16, right-aligned to x247) | footer L1 | Enter on an entry |
|---|---|---|---|---|
| Race r, prices posted | crowd prices with no bet, `quote(ctx, program, null).odds` | "Enter: to window" | the focused horse's blurb | window, ticket open on it, at the remembered amount |
| Race r, prices pending | every odds cell "-" (approved pending dash) | blank | "The crowd is still betting." (approved) | nothing. A click focuses only |
| Race r + 1, prices posted | crowd prices with no bet | blank | blurb | nothing |
| Any other race not yet run, or r + 1 still pending | every odds cell "-" | "Prices later" | blurb | nothing |
| A race already run | odds at post, with your bet in the pool if you bet (the result's figures) | "Winner: #5" | blurb | nothing |
| A race already run that you bet on | as above, plus the pencil tick in your horse's margin cell | "Winner: #5" | blurb | nothing |
| Fewer than 8 horses | entries end early, rule and footer stay | | | |
| No blurb | | | blank | |
| Estimate failed | the existing error screen, as today | | | |

"Winner: #5", not "Won by #5", because "won by" reads as a margin. The tick and the cursor share the margin cell: if both, the tick wins and the cursor is not drawn (approved rule). The footer's blurb still says which horse is focused.

Prices posting while the page is open cut in, in one frame, as approved. "Prices later" turns into prices in the same way if r + 1 finishes while you read it.

## 6. The running foot (every book page)

One line at cell top y226, Ink, main font, under the y210 rule. Pointer targets, not cursor stops.

| item | text | place | target box | same as |
|---|---|---|---|---|
| previous | "< {page}" | from x8 | x8-79, y222-235 | Left |
| close | "Esc: close" | x88-167 (centered) | x80-175, y222-235 | Esc |
| next | "{page} >" | right-aligned to x247 | x176-247, y222-235 | Right |

Page names: "Cover", "News", "Race {r}". At most 8 characters each ("< Race 8"). The cover has no previous item. Race 8's page has no next item. No wrap: the book has a front and a back.

## 7. The window

**Job:** take one bet on race r in as little reading as possible. **Reads first:** the clerk's line (what to do), then the list (post, name, price), then the ticket rows. The status bar is read once.

**Why a close-up with a clerk:** the window is the world, so it is drawn in the world's language: a still picture and a Navy dialog box (DESIGN: Navy means speech and the world, paper means print). The classic shop screen of 8-bit games (the keeper behind the counter above, the menu below) is the most familiar way to say "you are at a counter", and the clerk is a person with lines, which is where DESIGN puts the charm.

### Wireframe (1x)

```
x 0                                                                       255
y   0 [status bar, as the track: Navy y0-14, Ash line y15]
    4  Race 3 of 8                                            Bank $100.00     Bone, cell tops y4, bank to x251
   16 [picture x0-255, y16-87, art.window.booth]
      [ wall x0-255 y16-79                                                      ]
      [ window opening x72-183 y24-79, Maroon frame 2 px top and sides          ]
      [ lamp x124-131 y28-31   clerk x120-135 y60-83   tote machine x144-149 y74-79, tongue x146-147 y72-73 ]
      [ counter x0-255 y80-87; your program lying on it x40-55 y80-87           ]
   88 [box: frame tiles x0-255, y88-239, Navy fill, interior x8-247 y96-231]
   98    Race 3. Who do you like?                                              clerk line, x20, Bone
  112 >  [ 1] Gravy Subpoena                                        5-2       row i at cell top y112 + 11i
  123    [ 2] Hold My Oats                                          9-2
  ...
  189    [ 8] Mint Julep Lawsuit                                   26-1
  202  ------------------------------------------------------------------      1 px Ash line, x8-247
  208 >  < $10 >  on #3                                     Enter: bet        ticket row 1 (ticket open)
  220    $10 to win pays $37.00                                                ticket row 2 (ticket open)
```

**Rows** (i = 0 to 7, cell top y112 + 11i, last y189, ends y196):

| element | x | y in row | look |
|---|---|---|---|
| cursor | 8-15 | +0 to +7 | horseshoe, Navy colors (Yellow and Gold) |
| saddlecloth box | 20-31 | -1 to +8 | the race HUD strip box, 12x10, 1 px Ash border, small-font number (DESIGN: boxes on Navy get Ash) |
| name | 36-179 | +0 to +7 | main font, Bone, 18 characters at most |
| odds | right-aligned, ends 247 (216-247) | +0 to +7 | main font, Bone. Pending: "-" at x240-247 |

**No stats, style or blurb at the window** (question 3). No favorite treatment, no sort, no color by price, as everywhere.

**Ticket rows** (cell tops y208 and y220), the approved ticket strings unchanged:

- Choosing: row 1 blank. Row 2: "Esc: back" right-aligned to x247 (x176-247), a pointer target.
- Ticket open: row 1 is the cursor at x8, "< $10 >  on #3" from x20 and "Enter: bet" right-aligned (x168-247). Row 2 "$10 to win pays $37.00" from x20. "Esc: back" is not drawn. The chosen horse's row gets the "yours" marker (`art.ui.marker.yours`, Yellow) at x8-14 in place of the cursor. The marker never bobs, the cursor does, so the two read apart (DESIGN). Every row's odds update with your amount in the pool (approved BP3).
- One amount offered: no arrows (approved).
- Ticket opens at the remembered amount (approved rule).

**The bet beat** (0.6 s, data): the clerk plays his stamp frames once, the status bar's bank cuts down by the stake, and the approved printed tote ticket appears at its approved pixels, x8-247, y209-235, covering the ticket rows. Then the cut to the race. On this screen the slip draws only from its torn edge down: the pixels above the edge stay as drawn (the Navy box), not Parchment, and its bottom four rows (y232-235) lie over the box's bottom frame tiles, as a ticket laid on the counter. Art-director to check (section 12).

**The clerk's lines** (voice, cell top y98, x20, at most 28, Bone). They never comment on the horse picked, the price or the chance.

| state | line |
|---|---|
| choosing | "Race {r}. Who do you like?" |
| prices pending | "The crowd is still betting." (reuses program.pending) |
| ticket open | a fixed cycle: "Pencil's sharp. Ready." / "Take your time. No rush." / "Ready when you are." |
| bet beat | a fixed cycle: "There you go. Enjoy it." / "Fresh off the machine." / "Mind the peanut shells." |

Cycles advance per use, reset on New day, live in the session, and draw no RNG (as the lookables).

### Picture brief (`art.window.booth`, 256x72, y16-87, still picture)

| part | box | colors | job |
|---|---|---|---|
| wall | x0-255, y16-79, around the opening | Mist, Ash shadow on the row under the lintel | the stand's painted wall, as on the track |
| window opening | x72-183, y24-79. Maroon frame 2 px on top (y24-25) and sides (x72-73, x182-183) | Maroon | the same window as on the track, close up |
| booth | x74-181, y26-79. Dirt on y26-27 (the lintel's shadow), Hay below | Dirt, Hay | the lamp-lit booth |
| lamp | x124-131, y28-31, hanging from a 1 px Ink cord | Gold shade, Auburn underside | warm light, says "booth", not "bank" |
| clerk | `art.hub.clerk` reused, frame x120-135, y60-83, the counter cutting at the waist as on the track | as DESIGN (Turf jacket, Bone collar, skin of window 2) | the person you talk to. Idle: stamps a ticket |
| tote machine | x144-149, y74-79, Slate with an Ash top row. Ticket tongue x146-147, y72-73, Bone | | the one object a bank or casino does not have |
| counter | x0-255, y80-87. Dirt Shade y80, Mud y81-87 | | the wood counter you lean on |
| your program | `art.window.program`, 16x8 at x40-55, y80-87, lying on the counter. Parchment, Ink outline, a 1 px Ash fold | | you carried the book here. It ties the two screens together |

Banned as on the track: bars, grilles, glass with a slot, marble, neon, bulbs, money trays, "$". Motion: the clerk's idle every 4 s (the track's rule, one person), the stamp on the bet. Nothing else moves. With reduced motion, nothing moves.

## 8. The track's box, amended

A third row for Read. Voice rows unchanged.

```
y 176 [box frame tiles, Navy fill, interior x8-247 y184-231]
  186   Race 3 is up.                       voice row 1, x20 (unchanged)
  196   Sun's out. Hats are out.            voice row 2, x20 (unchanged)
  206 > Read Race 3                         row 1, item box x8-247, y205-213
  215   Bet Race 3                          row 2, item box x8-247, y214-222
  224   Just watch Race 3                   row 3, item box x8-247, y223-231
```

Cell tops y206, y215, y224 (was y210 and y222, 12 apart). The labels have no descenders, so 9 px rows hold. Read has no picture target, so with Read focused no focus corners are drawn. The horseshoe is still the one cursor.

## 9. States, all screens

| state | what shows |
|---|---|
| Day start, race 1 prices pending | The cover. The cover and news never wait on prices. If you reach race 1's page before they post, its pending look shows. |
| Day start, prices posted | Same. Nothing on the cover reacts. |
| Track arrival | Focus on Read. Board, voice and status as approved. |
| Book opened from the track | Race r's page, cursor on post 1. |
| Prices post while reading | The odds cut in, in one frame, on race r or r + 1's page. |
| Window, prices pending | All odds "-", the clerk says "The crowd is still betting.", Enter on a horse does nothing, Esc and "Esc: back" work. |
| Window, choosing / ticket open / bet beat | Section 7. |
| Window opened from the book | Ticket open on that horse. Esc closes the ticket, Esc again goes to the track. |
| Last race | Race 8's page has no next item. Everything else as approved. |
| No previous day in the session | News slot 5 is flavor. |
| No horse runs twice (a future stable or rule change) | News slot 3 is flavor. |
| New day | The new day's cover. Clerk cycles reset. The previous day's winners are kept for news slot 5, in the session only. |
| Broke, End of day | Never in the book or at the window. As approved. |
| Data error | The existing error screen, with the file and field. A cover or news line over its width fails at load. |
| Art missing | Pink and Ink checker in the slot, the HUD tag, the console list, as DESIGN. |
| Permission denied | Not applicable: offline, one player, no accounts. |
| Window loses focus | Hover and half-made clicks are forgotten, as on the track. |

**When the model says nothing, or is wrong.** The only model output is the estimate behind the crowd's prices. It is never shown in the book, the news or the window, in pixels or in `aria-live` (UI1). Missing prices are drawn as the tote does, a "-", with words that say why ("The crowd is still betting.", "Prices later"). News facts are computed from data, not estimated, so they are true or absent, never guessed. No line anywhere rates a horse, so there is no recommendation to be wrong. A bet can be undone with Esc until it is placed. After that it stands.

## 10. Pointer rules

The track-hub rules hold (section 6 there): grid mapping, primary button only, act on release over the same target, the 0.5 s arrival guard, hover moves focus, hand cursor over targets.

| screen | target | box | same as |
|---|---|---|---|
| Track | Read row | x8-247, y205-213 | Enter on Read |
| Track | Bet row, or the windows in the picture | x8-247, y214-222; x0-111, y96-175 | Enter on Bet |
| Track | Watch row, or the rail in the picture | x8-247, y223-231; as approved | Enter on Watch |
| Cover | the cover body | x0-255, y0-209 | Enter (turn to news) |
| Any book page | running foot items | section 6 | Left, Esc, Right |
| Race page | entry k | x8-247, y57 + 19(k-1) to y75 + 19(k-1) (approved) | focus post k, then Enter. On race r with prices: to the window. Elsewhere: focus only |
| Window, choosing | row i | x8-247, y111 + 11i to y121 + 11i | focus that post, then Enter (ticket). Pending: focus only |
| Window, choosing | "Esc: back" | x176-247, y218-229 | Esc |
| Window, ticket open | "<" and ">" | each glyph's 8x8 cell plus 4 px each side, rows y206-217 | Left, Right. Not drawn, not a target, with one amount |
| Window, ticket open | "Enter: bet" | x164-247, y206-217 | Enter |
| Window, ticket open | another row | as above | Esc, then open the ticket on that horse at the same amount |
| Window, ticket open | the row being bet | | nothing, so a double click can never bet |
| Window, bet beat | anything | | nothing |
| Window | the picture | | nothing. The clerk is not a target. |

**`aria-live`:** the cover reads the track name, the title, the day and the cover line. The news reads every headline and body in order when the page opens. A race page reads the race line, the state slot and the focused entry (name, style, three stats, odds, blurb). The window reads the race, the bank, the clerk's line, the focused row (post, name, odds) and the ticket rows. None reads the estimate.

## 11. Amendments

Numbered. Each names what it replaces. The files themselves are not edited by this spec.

**betting-screens.md**

1. **Section 1, Decision.** "The program page is where you read, choose and bet" becomes: the book is where you read, the window is where you choose and bet. "No separate bet screen" and the Rejected item "A separate bet screen" are reversed on Joseph's direction ("clicking the window should bring up the betting ui"). "No Orders and no winner's circle" is kept.
2. **Section 2, the flow, keys table and press counts.** Replaced by section 2 here.
3. **Section 3, header L1.** On book race pages "Bank {bankroll}" is replaced by the page state slot (section 5). The bank shows at the track and the window.
4. **Section 3, Footer and placing the bet.** In the book, L1 stays (blurb or pending line) and L2 "Pass this race" becomes the running foot. The ticket, the bet beat and the tote slip move to the window (section 7), with their strings and slip pixels unchanged.
5. **Section 3, Program states.** Replaced by section 5's page states for the book and section 7 for the window.
6. **BP3.** In the book, odds never include a player's amount, except on run pages (odds at post). The window follows BP3 as written.
7. **BP5.** Focus order in the book and at the window is posts 1 to 8, wrapping, with no Pass. Initial focus: post 1, or post k from a digit at the track, or the horse carried from the book.
8. **BP6, BP7, BP8, BP9, BP10.** Apply to the window, not the program page. BP6 also applies to the book's race r page.
9. **BE3.** New day starts the next day seed on that day's cover.
10. **BC2** (already replaced by track-hub TH14). Replaced by FL5 here.

**track-hub.md**

11. **Section 1, Decision.** "Windows opens the approved program page" becomes: Windows opens the window screen. The box gains a Read row that opens the book. The Rejected item "A program stand separate from the windows" is reversed in substance (reading and betting are split) though not in form (no stand in the picture).
12. **Section 2, flow, keys table and press counts.** Replaced by section 2 here. Up and Down move through three rows. From a lookable they go to Read. Esc on a lookable goes to Read. Digits open the window at post k.
13. **Section 2, "Focus on arrival at the track is always Windows."** Becomes Read on arrival from the Result, and Bet on return from the book or the window.
14. **Section 3, amendment 5 ("Esc: back" on the program footer).** Replaced by "Esc: close" in the book's running foot and "Esc: back" at the window.
15. **Section 4, The box.** Door rows at y210 and y222 become three rows at y206, y215 and y224 with the item boxes in section 8.
16. **Section 5, States.** "Day start" begins on the cover, not the track. "Back from the program" becomes back from the book or the window.
17. **Section 6, pointer table.** The Program rows are replaced by section 10's book and window rows.
18. **Section 7, Copy.** Adds `hub.door.read`. The door labels are otherwise unchanged.
19. **TH4.** Focus corners are drawn only for picture targets. With Read focused there are no corners.
20. **TH5, TH6, TH14, TH17.** Replaced by FL2, FL3, FL4 and FL5 here.

**DESIGN.md** (art-director's to accept)

21. **Program pages, opening line.** The program's pages now include the cover, the news page and the book's race pages.
22. **Program pages, Type: Maroon's "exactly three uses".** Adds a fourth: the cover's masthead fill with Parchment knocked-out type, and the cover picture's second ink. News headlines fall under "titles".
23. **Program pages, "No paper texture, fold line, drop shadow".** Allows one 8x8 dog-ear at the cover's top right, if the art-director rules it in.
24. **Program pages, Highlighter band and Swipe.** Not drawn in the book. At the window, "the horse you are betting on" is shown by the yours marker on its row.
25. **Program pages, Pencil tick.** Also drawn, and kept, on a run race's page in the book on the horse you bet on.
26. **Betting additions, Printed tote ticket.** It now draws on the window's Navy box. Above the torn edge the box shows, not Parchment. Its bottom rows lie over the box's bottom frame tiles. A second exception to keeping print and Navy apart, after the photo panel, because it is a printed object handed over the counter.
27. **The track, Doors.** The windows open the window screen. No pixel of the track picture changes.

## 12. For the art-director

1. **Cover look:** two inks (Ink, Maroon) on Parchment, Maroon masthead with Parchment knock-out type and keyline. Amendment 22.
2. **Cover picture:** the brief in section 3. Slot `art.book.cover.art`, 240x128.
3. **Masthead type size:** v1 sets the track name in the 8x8 font. A drawn wordmark would be text baked into an image, which DESIGN allows only for the game logo. Rule whether 8x8 is enough on the cover (CV2), or whether the game logo belongs there once it exists.
4. **Dog-ear:** yes or no. Amendment 23.
5. **The window picture:** the brief in section 7. Slot `art.window.booth`, plus `art.window.program`.
6. **The slip on Navy:** amendment 26. Does a Bone slip laid over the Navy box and its bottom frame read as a ticket handed over, or as a misplaced page?
7. **Track box rows at a 9 px pitch:** do three rows read as a menu, with 2 px between voice row 2 and the first row?

**Art slots needed**

| slot | size, frames | note |
|---|---|---|
| `art.book.cover.art` | 240x128, 1 | Ink and Maroon only, transparent elsewhere |
| `art.book.cover.corner` | 8x8, 1 | only if ruled in |
| `art.window.booth` | 256x72, 1 | still picture, whole image |
| `art.window.program` | 16x8, 1 | your program on the counter |
| reused | | `art.hub.clerk`, `art.ui.frame.box`, `art.ui.cursor.horseshoe`, `art.ui.marker.yours`, `art.ui.mark.pick`, the race HUD strip box, `font.ui.main`, `font.ui.small` |

## 13. Copy

All in data. Main font unless noted. Every limit is checked at load with the longest fill.

| key | text | field | longest |
|---|---|---|---|
| book.cover.title | Race Day Program | centered in masthead, 28 | 16 |
| book.cover.track | race 1's `track` from `day.json` | centered, 28 | "Churchill Downs", 15 |
| book.cover.races | {n} races today | right-aligned to x247, 16 | 13 |
| book.cover.line | news item 1's headline | centered, 30 | 30 |
| book.news.title | Rail Talk | x8, 16, Maroon | 9 |
| book.news.subtitle | Gossip, facts and peanuts. | x8, 30 | 26 |
| book.news.headline.* | per item | x8, 30, Maroon | 30 |
| book.news.body.* | per item | x8, 2 lines of 30 after wrap | 60 |
| book.foot.prev / next | < {page} / {page} > | 8 | "< Race 8", 8 |
| book.foot.close | Esc: close | centered x88-167 | 10 |
| book.page.cover / news / race | Cover / News / Race {r} | | 6 |
| book.race.toWindow | Enter: to window | L1 right, 16 | 16 |
| book.race.winner | Winner: #{n} | L1 right, 16 | 10 |
| book.race.later | Prices later | L1 right, 16 | 12 |
| hub.door.read | Read Race {r} | x20, 28 | 11 |
| window.clerk.choose | Race {r}. Who do you like? | x20, 28 | 24 |
| window.clerk.ticket[] | section 7 | 28 | 24 |
| window.clerk.punch[] | section 7 | 28 | 23 |
| window.back | Esc: back | right-aligned to x247 | 9 |
| ticket.*, program.pending | reused, approved | | |

No copy uses a word from any banned list. No "cash", "buy", "Official", or "$" outside money figures.

## 14. Acceptance criteria

These extend betting-screens.md, betting-simple.md and track-hub.md, as amended in section 11.

### Flow
- **FL1 [T]** Boot and New day open that day's cover. Enter on the cover shows the news. Esc on the cover goes to the track with focus on Read.
- **FL2 [T]** Arriving at the track from the Result, focus is Read. Returning from the book (Esc or "Esc: close") or the window (Esc while choosing or "Esc: back"), focus is Bet. No money moves.
- **FL3 [T]** Up and Down visit Read, Bet, Watch and wrap. From a lookable they go to Read. Esc on a lookable goes to Read. Left and Right visit the seven picture targets as approved.
- **FL4 [T]** Read opens the book at race r's page, cursor on post 1. Bet, the windows in the picture, or the Bet row opens the window choosing on post 1. Digit k at the track opens the window choosing on post k. Digits above the field size do nothing.
- **FL5 [T]** Scripted input. By keys: fast bet (Enter, 3, Enter, Enter), menu bet (Enter, Down, Enter, 3, Enter, Enter), pass (Enter, Up, Enter), read then bet (Enter, Enter, 3, Enter, Enter), read then pass (Enter, Enter, Esc, Down, Enter), day start read then bet (Enter, Enter, 3, Enter, Enter) each reach the next race with those presses and no others. By clicks, the counts in section 2.
- **FL6 [T]** Only Enter or "Enter: bet" on an open ticket at the window places a bet. After any amount of paging, reading and news, the day record is byte-identical to the same day with none (DT4), and no stream but `news` was drawn.

### Book
- **BB1 [T]** Page order is cover, news, race 1 to race n. Left and Right move one page. Left on the cover and Right on race n do nothing. Enter on the cover and the news acts as Right.
- **BB2 [T]** A race page's pixels y0-209 equal the approved program page's for the same race and state, except the L1 right slot. No band, ticket, Pass or bank is drawn.
- **BB3 [T]** Each page shows the price state and L1 right text in section 5's table for every combination of r, posted, pending and run. A run page's odds equal the result's odds at post, its "Winner: #k" equals the result, and the tick sits on the horse you bet on, if any.
- **BB4 [T]** On race r's page with prices posted, Enter or a click on entry k opens the window with the ticket open on post k at the remembered amount. On every other page, or while pending, Enter does nothing and a click only focuses.
- **BB5 [T]** Opening or paging the book never requests an estimate beyond races r and r + 1.
- **BB6 [T]** The running foot shows the right items on every page, fits its fields, and each item does what its key does.
- **BB7 [E]** At 3x, Joseph pages from the cover to race 8 and back and it reads as one printed program, in color and in grayscale.

### Cover
- **CV1 [T]** The track name is race 1's `track` in `day.json`, at most 28 characters, or the load fails with the file and field. The day pair equals the End of day page's. The race count equals the day's races. The cover line equals news item 1's headline.
- **CV2 [E]** At 3x, in 2 seconds, Joseph reads it as the front of a cheap track program, not a title screen or a poster. No real venue architecture, logo, "Official", price or "$".
- **CV3 [T]** The cover's pixels use only Parchment, Ink and Maroon, plus Dirt in the dog-ear if it is ruled in.

### News
- **NW1 [T]** The same day seed and the same previous-day record give identical news. Picks draw only from the `news` stream. A golden test shows race 1's field, race seed, first 5 estimate seeds and crowd dollars unchanged by the news (DT2).
- **NW2 [T]** Facts are true: Today's card matches `day.json`. Running in two races names the two horses with two starts whose first start is earliest, with both race numbers. Yesterday's longest price names the previous day's winner at the longest odds, with its race and odds from that day's record, and is absent with no previous day.
- **NW3 [T]** Every fact template, filled with every stable horse, odds label and race number, wraps to at most 2 lines of 30. Every headline is at most 30. No word from the banned lists, whole word, case-insensitive. A flavor item with a fill fails at load.
- **NW4 [T]** Five items print every day, none repeated, with the fallbacks in section 4.
- **NW5 [T]** The news never shows the estimate, a price for today, or a stat ranking.
- **NW6 [E]** Joseph reads three days of news. None reads as a tip, none is at a horse's expense, none mentions injury, no real horse, person or publication appears, and he smiles at a few. Lines he dislikes are cut in data.

### Window
- **WI1 [T]** Each row shows the post box, the name and the odds, and the odds equal BP3: with the ticket's amount in the pool while it is open, none otherwise. No stats, style, blurb or estimate is drawn or read out.
- **WI2 [T]** BP5 to BP10 hold at the window, as amended. The bet lowers the bankroll once, plays the clerk's stamp, draws the slip at x8-247, y209-235 with nothing drawn above its torn edge, then starts the race.
- **WI3 [T]** Esc with the ticket open returns to choosing on that horse. Esc while choosing goes to the track with focus on Bet.
- **WI4 [T]** While pending: every odds "-", the pending line, Enter on a horse does nothing, Esc works.
- **WI5 [T]** Each pointer target in section 10 calls the same action as its key. A click on the row being bet does nothing. No click acts during the bet beat or within the arrival guard.
- **WI6 [T]** Every clerk line fits 28 and none contains a banned word. Cycles advance one per use and reset on New day, with no RNG drawn.
- **WI7 [E]** At 3x the window reads as a track's window with a clerk, not a bank or a casino, and the slip reads as a ticket handed over.

### Track box
- **TB1 [T]** The three rows draw at cell tops y206, y215 and y224 inside the box, item boxes do not overlap, and with Read focused no focus corners are drawn.

### Performance and gate
- **PF1 [E]** No frame over 16.7 ms on the cover, the news, a race page or the window while an estimate runs (UI6), measured in PERF.md.
- **GT1 [E]** Gate: two days back to back, keys one day and mouse the other. Joseph notes whether he read the news on day 2, whether he opened the book before every bet or bet from the window by name, every time he left the window to go read stats, and whether the cover felt like a chore.

## 15. New data and schema fields (one list, all ask-first)

1. **`src/data/book.json`** (new file, new schema): `cover` (title, races line, masthead and keyline boxes, row tops), `news` (title, subtitle, item pitch and tops, `facts` templates by kind, `flavor` items, its banned words, slot order and fallbacks), `racePage` (state texts, L1 right limit), `foot` (texts, target boxes, page names). Each value with status and note, as `hub.json` does.
2. **`src/data/hub.json`** (schema change): the box gains a third row (`read`, no picture target), row tops y206, y215, y224 with their item boxes; `copy.doors.read`; the arrival and return focus; a new section `window` (picture parts, list rows, ticket rows, clerk lines and cycles, "Esc: back").
3. **Betting stream list** (DT2, locked "only added"): adds `news`.
4. **`slots.json`:** the four new slots in section 12.
5. **Session, not data:** the previous day's record kept in the day session for news slot 5, and the clerk cycles. Never written to storage (SAFE3).
6. **Not data, flagged:** track-hub TH5, TH6, TH14 and TH17 tests change to FL2 to FL5. That is a change of requirement from Joseph's direction, not a weakened test, and the commit says so.

No new dependency. No change to `betting.json` values, `day.json`, `stable.json` or the betting rules.

## 16. Questions for Joseph

1. **Does the day open on the cover?** It costs one press a day, and it fills race 1's wait. *Recommend: yes.*
2. **Where focus lands at the track: Read or Bet.** Read keeps read-then-bet at 5 presses and suits picking by stats. Bet suits betting from memory. A digit is 4 presses either way. *Recommend: Read.*
3. **Stats at the window, or post, name and odds only?** You asked for less to read when picking, and the book does the comparing. The risk is flipping back to the book. *Recommend: post, name and odds only. If the gate shows you leaving the window to check stats, add the style word first, then one bar.*
4. **Stat leaders in the news** ("Most stamina on today's card: X, race 6"). True and useful across the day, but it reads close to a pick. *Recommend: no for now. The stat bars on each race page do the comparing.*
5. **Keep yesterday's winners in the session** for one news fact. Nothing is saved, so it vanishes on reload. *Recommend: yes.*
6. **Work out all eight races' prices in the background** so every race page shows prices. About 25 to 30 s of worker time a day, off the main thread. *Recommend: not now. Keep r and r + 1, and decide after the gate whether "Prices later" bothers you.*
7. **The day on the cover: the seed ("Day #12345") or a count ("Day 1").** The count resets on every reload. The seed matches the back page and can be replayed. *Recommend: the seed.*
8. **The track's real name on a program cover.** It comes from data, as the rules allow, but a program cover with a real track's name looks like that track's own program. *Recommend: keep it from data, never print "Official", and consider a fictional track name in `day.json` before anything is shown outside your desk.*

## 17. Least sure

1. **Whether the book gets read.** Stats never change, so within a few days you may know the pecking order and bet from the window by name, which leaves the book as decoration. GT1 asks. If so, the fix is something in the book that changes, not more book.
2. **Stats away from the bet.** Your earlier ask was to pick by comparing stats. Splitting puts the comparison and the bet on two screens. The book-to-window hand-off is the bridge, and question 3 is the fallback.
3. **The track box at a 9 px row pitch.** Three rows plus two voice rows fill the box. If it reads cramped, the fallback is dropping voice row 2 (the flavor line) and going back to 12 px rows.
4. **The slip on Navy.** It may read as a stray piece of paper. The fallback is a Bone ticket sprite on the counter in the picture, with the ticket text in the box.
5. **News running thin.** Twelve flavor items at two or three a day repeat within a week. Lines are data, so more cost nothing, but the voice has to stay as good.

## 18. Art-director rulings (2026-11-14)

Written by art-director against DESIGN.md as it stands today. Where this section and sections 3 to 12 disagree on a pixel, a color or an art slot, this section wins. Flow, keys, copy limits and tests stay the designer's, except where a ruling below names a number they depend on (CV1's 28, the track box rows). DESIGN.md is not edited now (other sessions have open changes in it). 18.5 lists the exact changes to make when this is built. Nothing here is Joseph's approval: the mock in 18.6 goes to him.

### 18.1 Section 12, items 1 to 7

1. **Cover look: accept with changes.** Two inks (Ink, Maroon) on Parchment stays, and the cover earns no third ink: the Maroon masthead at the top and a Maroon band at the foot of the picture frame the page, and a spot color would push it toward a poster or title screen (CV2). Changes: the track name is set in a new display font (item 3), and the picture is the rewritten brief in 18.2, not section 3's. Rule broken by section 3's version: Shapes and shading, "Big calm shapes, a few focused details" (see 18.2 for why the stock stretch run fails it).
2. **Cover picture brief: reject as written, replaced by 18.2.** Three horses at the wire in front of a stand with a tiny big hat in the crowd is the stock front of every program, so it reads generic, and the one joke is a background figure a few pixels high that nobody finds at 3x in 2 seconds. Also, "the crowd as Maroon texture" behind Maroon silks and Maroon horse shade puts three Maroon things on top of each other, which fails the grayscale test (DESIGN Do: "Test silks and UI in grayscale").
3. **Masthead type: reject the 8x8 track name, reject the game logo, accept a display font.** At 8x8 the name is the same size as "Race Day Program", so the block reads as a page header, not a cover. The game logo would make the cover a title screen (CV2) and print the game's name where a program prints the track's. A drawn wordmark is baked text (DESIGN HUD: "No text baked into images, except the game logo"). So: a new original bitmap font, `font.ui.display`, used only for the masthead, from data, at 1x. Spec in 18.5 D. The title stays in the main font.
4. **Dog-ear: no.** A program is handed to you new at the gate each day, so a worn corner breaks "wear follows logic", and its only job, "well-loved", is decoration. It would also add Dirt to the cover. DESIGN Program pages: "No paper texture, fold line, drop shadow" stays as it is. Amendment 23 is rejected, and CV3 becomes Parchment, Ink and Maroon only.
5. **Window picture: accept with three changes** (18.4). As briefed, a 22 px clerk in a 108x54 opening fills a third of its height, so the "close-up" reads as an empty Hay room with a small man at the bottom (Shapes and shading: big calm shapes and a few focused details, here the focus is lost).
6. **The Bone slip on the Navy box: accept as specified.** The frame tiles' bottom edge (`scripts/art/ui.mjs`, EDGE_T flipped) is Navy on y232-236, Ash on y237, Navy on y238 and Bone on y239, so the slip's rows y232-235 cover Navy fill only, and the side tiles' lines sit at x0-2 and x253-255, outside the slip's x8-247. The box frame stays whole all the way round, so the slip reads as a ticket lying inside the box, not a page over it. Ink on Navy at the torn edge is nearly invisible, so the edge reads by Bone against Navy instead, which is the same jag 1 px lower. That is fine and needs no change. WI7 is still the test. If the mock reads as a stray page, the fallback is section 17 item 4.
7. **Track box at a 9 px pitch: accept with one change.** Voice rows at y186 and y196 leave 2 blank rows above "Read", the same as between the menu rows, so the voice line and the menu read as one block of five lines (HUD, UI frame and font: a menu has to read as a menu). Move the voice rows to cell tops **y185 and y194** (9 px pitch as well). Menu rows stay at y206, y215 and y224 with the item boxes in section 8. That leaves 4 blank rows (y202-205) above "Read", or 5 when voice row 2 has no descender, against 2 between menu rows, so the two groups read apart. y185 still sits 6 rows under the frame's Ash line (y178). Section 8's wireframe, TB1 and track-hub's "Voice rows, cell tops y186 and y196" change to match.

### 18.2 The cover picture, rewritten (`art.book.cover.art`, 240x128, 1 frame)

**The idea in one line:** you got the seat right behind the regular, and her hat is so big it pokes out of the picture. The race goes by past her shoulder. That is the cover's one joke, it is a person, and it is the same regular from the track and the news ("Biggest hat in the stand").

**Why this and not the stretch run from the rail:** the over-the-shoulder view says "you are at the track" before it says "horses", which is this game's whole premise (the track screen stands you on the apron). It gives the left third one big calm shape (her back and hat) and the right two thirds one focused subject (three horses), which is the uneven density DESIGN asks for.

**Inks.** Ink and Maroon only. Transparent is the paper, and the paper is the light. No dither except the fixed hoof-kick clods and the near-rail dirt fleck below. No ramp, no gradient.

**Coordinates** are inside the picture, px 0-239, py 0-127. On screen, x = px + 8, y = py + 62.

**Back to front:**

| part | box (picture coords) | look | job |
|---|---|---|---|
| plate border | 1 px Ink: left px0, right px239, bottom py127, top **py4** (not py0), all px0-239 except where the hat crown crosses it (px24-47) | rows py0-3 are transparent except the crown | the printed frame of an illustration. Moving its top to py4 is what lets the hat break out of it |
| sky | py5-37 | paper, nothing in it | calm, so the hat and the wire post read against it |
| infield trees | two round crowns, px92-111 and px220-237, py22-45 | Maroon, Ink outline, no inner detail | says "infield", far beyond the track |
| infield hedge | px70-238, py38-45 | Maroon, Ink top edge | the far edge of the track, the horizon line |
| wire post | 2 px Ink post at px200-201, py16-48; a plain round disc, 8x8, Maroon with Ink outline, at px197-204, py10-17 | no text, no stripes | the finish line, so this is the stretch run |
| far rail | py46-48 across px62-238: Ink top and bottom rows, paper middle row, 2 px Ink posts every 16 px (px64, 80 ... 224) hanging to py52 | | the inside rail, behind the horses as in the race view |
| track | py49-106 | paper. Only a sparse fixed Ink fleck in py100-106 (1 px in each 8x4 block, the same offset every block, rows alternating by 4 px) | dirt you can read without dirtying the horses |
| three horses | see below | | the subject |
| hoof kick | 2 or 3 Ink clods of 1 to 2 px behind each horse's hind feet, inside 10 px of the hooves | | speed, in the race view's own language |
| near rail | py107-109, px62-238, Ink top and bottom, paper middle, posts every 16 px from py107 to py109 only | | the rail in front of the horses |
| balcony front | py110-126, px0-238, Maroon; an Ink cord on py111; Parchment pennants (knocked out, Ink outline) every 16 px from px8, each 5 px wide and 5 rows (rows of 5, 3, 3, 1, 1) | | we sit in the stand, one row behind her. The pennants are the track's race-day bunting, so the cover and the track are one place |
| the regular | see below | | the joke |

**The three horses.** Side-on, facing right, drawn fresh at about 56 px nose to tail and 40 px from hoof to cap, larger than the race view's 32x24, never scaled up from it (DESIGN Do not: "Do not shrink a big sprite to make a small one", and the same holds the other way). Athletes by DESIGN Horses: legs at least as long as the barrel is deep, deep chest, small head with a throat notch, neck longer than the head, tail as its own stroke, front knees and hocks bending the right way, no faces, at most a 1 px eye. Jockeys crouched, hands on the neck, a hand ride. No crop shown raised. Saddlecloths are plain, **no number** (a number would be text baked into the picture).

| horse | nose at | ground line (hoof row) | coat | points | silks body, cap | stride |
|---|---|---|---|---|---|---|
| leader, near path | px180 | py104 | Ink | Ink | Parchment with two Maroon hoops, Maroon cap | reach: forelegs forward, hinds back |
| second, middle path | px152 | py98 | Maroon | Ink | Ink, Parchment cap | gather: legs folded under |
| third, far path | px124 | py92 | Parchment with Ink outline (a gray) | Ink (mane, tail, legs below the knee) | Maroon, Parchment cap | mid-stride: one foreleg leading |

- Three coat values (Ink, Maroon, paper) so each horse reads alone in grayscale. Three stride phases so they never look stamped from one sprite (DESIGN Do not: "Do not animate the field in sync").
- Parting rule: where an Ink shape lies over a Maroon one (the leader over the second, a jockey's Ink jacket over a Maroon neck), a 1 px paper line parts them. Maroon and Ink are only about 46 apart in luma (my figure from the hex values), so without the line they merge in grayscale. This is a two-ink printer's knockout. It is not an outline style, and it is the cover's only use of it.
- The leader is the most contrasting shape on the cover (Ink on paper) and the third horse's tail ends at px68 or later, so at least 6 px of paper separate the field from the regular.

**The regular,** back to us, seated, from the waist up. The balcony front cuts her at py110.

| part | box | look |
|---|---|---|
| hat crown | px24-47, py0-13 | Maroon, Ink outline. It stands in front of the plate border, which stops at px23 and resumes at px48. A Parchment hatband on py11-12. Her flower: Parchment 4x4 at px40-43, py6-9, with a 1 px Ink center |
| hat brim | px2-69, py14-18 | Ink top row py14, Maroon py15-16, Ink underside py17-18 (the shadow under the brim, as on the track's regular). 68 px wide, wider than any horse on the page. That is the joke landing, and it is the hat's doing, not a horse's |
| curls | px22-49, py19-24 | Parchment (her white hair, as on the track), Ink outline, a scalloped lower edge in 3 px steps |
| collar | px24-47, py25-27 | Parchment |
| shoulders and back | from px22-49 at py28, sloping out to px10-61 by py40, down to py109 | Maroon, Ink outline. No inner lines: one big calm shape |

Brim at least 8 px wider than her shoulders each side (DESIGN's track rule asks for at least 4). No face, since she faces away. Silhouette test: filled with Ink she must read in one glance as "a lady in a big hat, seen from behind".

**Scale note.** The cover is an illustration printed on paper, not the world, so the world's people scale (22 px) does not hold on it. Everything is still drawn at 1x on the grid, nothing is scaled, so there is no mixed pixel density.

**Not in the picture:** a stand or crowd (we are in the stand), a tote board (a big dark block over the leader, and a board with no figures reads broken), any text or number, a price or "$", a logo or "Official", twin spires or any real venue's shape, a fallen or hurt horse, a crop strike, a face on a horse, a national or state flag.

**Reads in 2 seconds at 3x:** first the horses (the darkest, sharpest shapes, center right), then the lady and the hat (the biggest calm shape, left), then the hat breaking the frame (the second look, which is what keeps a cover you see every day from wearing out).

**Masthead and layout around it** (replaces those rows of section 3's wireframe):

- Masthead block x8-247, y8-43, Maroon, with the Parchment keyline rectangle x10-245, y10-41, as briefed.
- Track name in `font.ui.display`, Parchment, upper-cased by code, centered, cell top **y14** (glyph rows y14-27). Centering: start x = floor((256 - 12n) / 2). At most **19 characters** (228 px, x14-241), not 28. CV1's limit changes to 19, and the loader also fails on any character the display font lacks, naming the file and field.
- "Race Day Program" in the main font, Parchment, centered, cell top **y31** (rows y31-37). That leaves 3 blank Maroon rows above the name, between name and title, and under the title.
- Dateline and race count at y48, the y58 rule, the picture slot at x8-247, y62-189 (crown from y62, the plate's top line on y66), the cover line at y196 and the y210 rule: unchanged.

### 18.3 Amendments 21 to 27

21. **Accept.** The program's pages are the cover, the news page, the book's race pages, the top of Orders, the Result and the End of day page.
22. **Accept, worded as in 18.5 C.** The fourth use covers the masthead fill and its knock-out type, and the cover picture's second ink, including its balcony band. News headlines are titles, inside the first use. Nothing else on the news or race pages is Maroon: "Winner: #5", "Prices later" and "Enter: to window" are Ink.
23. **Reject.** No dog-ear (item 4).
24. **Accept.** The yours marker (Yellow, on Navy) is what DESIGN already uses for "yours" off paper.
25. **Accept.** The tick on a run race's page is your own pencil mark, kept, so it follows the logic of wear. Slate, its approved place, nothing new.
26. **Accept.** The tote ticket is the second exception to keeping print and Navy apart, after the photo panel, because it is an object handed over in the world, not a page. Its pixels are unchanged. Above the torn edge the Navy box shows, and the box's frame lines are never covered (item 6).
27. **Accept.** The windows open the window screen. No track pixel changes.

### 18.4 News page, race pages and the window

**Window picture (`art.window.booth`), REVISE, three changes:**

1. **Make it a close-up.** The opening becomes x88-167, y40-79: Maroon frame 2 px on the top (y40-41) and sides (x88-89, x166-167). The booth inside is x90-165, y42-79, with Dirt on y42-43 and Hay below. Above it, the track's sign plate, the same art as `art.hub.sign.plate` (64x12, Turf top row, Pine below), at x96-159, y24-35, with "Windows" from data (the track's own copy), Bone, cell top y26, centered (x100-155). The wall is Mist everywhere else, with Ash on the row under the counter lip only if the counter overhangs, as on the track. Job of the sign: it is the same window you clicked, and one plain word says "track window", not "bank". The clerk now fills almost half the opening's height.
2. **The lamp: a shade only.** Cord 1 px Ink at x127, y42-44, shade x124-131, y45-48, Gold with an Auburn bottom row. No bulb pixel, no glow, no light pool. Gold and Auburn as a lamp are a new use for both. Job: warm light says "booth".
3. **Your program shows its cover.** `art.window.program` is 16x8 at x40-55, **y72-79**, lying on the counter, its bottom row resting on the counter's top row (y80). Ink outline, Parchment, its top two inner rows Maroon (the cover's masthead), no type. Job: the same program you were reading, recognised by its masthead.

The clerk (`art.hub.clerk`, x120-135, y60-83), the tote machine (x144-149, y74-79, tongue y72-73), the counter (y80-87) and the banned list stay as briefed.

**Window screen, otherwise: accept.** It follows DESIGN: Navy for the world, Ash-bordered 12x10 boxes on Navy, the name starting 4 px past the box, the yours marker in the cursor's cell, Bone text, no favorite treatment and no color by price.

**Race pages: accept.** They are the approved page with the band, ticket and bank removed. "Winner: #5" in Ink, never Maroon or Red, since it is a fact and not a title or money.

**News page: accept the layout, with one copy note.**
- Layout: Maroon headlines are titles (Program pages, Type). The 8 px gap between items against 2 px inside an item groups each item plainly. Five even blocks are what a printed column looks like. It needs no rule between items (Program pages, Rules: rules only where the layout gives them).
- Copy note, for the writer and Joseph at NW6: flavor item 3, "Lemonade tested, lemony / Inspectors found a trace of lemon", is built on the shape of a drug-test headline, and in racing that headline is about horses. That is near the line in Tone ("respectful of the animals and the sport"). I recommend cutting it or rewriting it with no testing frame. The other eleven are on voice, and several call back to the track's people, which is the job.

### 18.5 DESIGN.md changes held for the build

Make these in one change when this spec is built, with an amendment note at the top. Exact text:

**A. New amendment note**, above "Amended 2026-11-13 by art-director after the track mock":

> Amended 2026-11-14 by art-director for the book and the window (spec docs/specs/book-and-window.md, Joseph: "the book should have a cover with a design, it should open to news and then races. clicking the window should bring up the betting ui"). Added: the cover and the news page to the program's pages, the cover's rules (two inks, the masthead, the picture), a display font for the masthead only, the window close-up, the tote ticket's place at the window. Changed: Maroon gets a fourth use on paper (the cover). The highlighter band is not drawn in the book, and the pencil tick also marks a run race's page. Gold and Auburn get a new use as the window's lamp. A dog-ear was proposed and rejected. No approved rule was loosened.

**B. Program pages, first paragraph.** Replace "The Card, the top of Orders (y0-143) and the Result are pages of one printed race program" with:

> The cover, the news page, the Card (the book's race pages), the top of Orders (y0-143), the Result and the End of day page are pages of one printed race program

**C. Program pages, Type.** Replace "Maroon is the program's second ink, as on a real two-color program, and it has exactly three uses." with:

> Maroon is the program's second ink, as on a real two-color program, and it has exactly four uses.

and after the sentence that ends "Third, the margin column on the Result.", add:

> Fourth, the cover: the masthead block with its Parchment keyline and knock-out type, and the cover picture's second ink. News headlines are titles.

**D. HUD, UI frame and font.** After the small font line, add:

> - Display font (`font.ui.display`): original, drawn by the artist, for the cover's masthead only. 12x16 cell, monospaced at 12 px advance, each glyph 10x14 in columns 0-9 and rows 0-13. Capitals only, code upper-cases. Glyphs: A-Z, 0-9, space, & ' . -, 41 in all. Stems and horizontal strokes 2 px, so the letters knock cleanly out of Maroon. Drawn fresh, not traced from any track's lettering or any game's font. It is BitmapText from data, never baked into an image, and it is drawn at 1x like everything else.

**E. HUD, UI frame and font, the Navy line.** After "Pages a fan would read in print (the Card, the top of Orders, the Result) are Parchment pages with no frame tiles (see Program pages).", add:

> One printed object may lie on a Navy box: the tote ticket at the window, a thing handed over in the world, not a page. The box's frame lines stay whole around it.

**F. Program pages, a new bullet after "Pencil tick":**

> - **The cover (2026-11-14).** Parchment, Ink and Maroon only, nothing else, no dog-ear. A Maroon masthead block x8-247, y8-43 with a 1 px Parchment keyline (x10-245, y10-41), the track's name from data in the display font, knocked out, and "Race Day Program" in the main font under it. The picture (`art.book.cover.art`, 240x128) is a two-ink illustration: the view from the seat behind the regular, her hat breaking the picture's top border, three horses in the stretch past her shoulder. It is print, not the world, so the people scale does not hold on it, but it is drawn at 1x with nothing scaled. Where Ink lies over Maroon in the picture, a 1 px paper line parts them, as a two-ink knockout, so they read apart in grayscale. No text or number in the picture (plain saddlecloths), no price, "$", "Official", logo, tote board or real venue's shape. The cover is the same picture every day. The day changes in type only.

**G. Program pages, Highlighter band.** Add at the end of the bullet's main paragraph (the one that ends "Code draws it from these numbers in data."):

> It is not drawn in the book. At the window, the horse you are betting on is shown by the yours marker on its row.

**H. Program pages, Pencil tick, Betting sub-bullet.** Add at the end:

> In the book, the tick is also drawn, and kept, on a run race's page beside the horse you bet on.

**I. Betting additions, Printed tote ticket.** Add a sub-bullet:

> - At the window (2026-11-14) it draws at the same pixels on the Navy box. Above the torn edge the box shows, not Parchment. Its rows y232-235 cover only the bottom frame tiles' Navy fill, so the frame lines stay whole.

**J. The track (between races).** After the "Not a casino, not a bank" paragraph, add:

> **The windows** open the window screen (spec docs/specs/book-and-window.md section 7). No pixel of this picture changes.

**K. New section after The track, before Tone:**

> ## The window (close-up)
>
> A still picture, `art.window.booth`, 256x72 at y16-87, over the window's Navy box (Joseph, 2026-11-14: "clicking the window should bring up the betting ui"). It is the track's window 2, closer. People stay at the world's scale, as an 8-bit shop counter does. Mist wall. The track's sign plate with "Windows" from data at x96-159, y24-35. The opening x88-167, y40-79, Maroon frame 2 px on the top and sides, a lamp-lit booth inside (Dirt under the lintel, Hay below). A hanging lamp: a Gold shade with an Auburn underside on a 1 px Ink cord, no bulb and no glow. Clerk 2 (`art.hub.clerk`) at x120-135, the counter cutting him at the waist. A tote machine with its ticket tongue on the counter. The wood counter y80-87, Dirt Shade top row and Mud below. Your program lying on the counter at x40-55, its Maroon masthead showing. The track's "Not a casino, not a bank" rules and banned list hold here. Motion: the clerk's idle every 4 s and his stamp on a bet. Nothing else moves. With reduced motion, nothing moves.

**L. Master palette, jobs column** (new uses, colors unchanged): Gold adds "the window's lamp", Auburn adds "lamp underside", Maroon adds "the cover's masthead and picture".

Nothing is added to Banned looks. The "No paper texture, fold line, drop shadow" line is unchanged.

**Also held for the specs, not DESIGN:** track-hub.md voice rows at y185 and y194 (18.1 item 7), this spec's section 8 wireframe and TB1 to match, CV1's track-name limit to 19 with the display font's glyph check, and CV3 without Dirt. `slots.json` drops `art.book.cover.corner` and adds `font.ui.display`.

### 18.6 What the mock must show for me to accept it

One sheet per screen, each at 1x and at 3x nearest-neighbour, every pixel a master palette color, drawn on the 256x240 grid with real copy from the spec (no lorem, no invented text). Grayscale copies where marked (G).

1. **Cover, day #12345 (G).** Display-font masthead with race 1's track name from `day.json`, the dateline, the full picture from 18.2, the cover line "Bugler finds a 13th note", the running foot. Plus one strip of the masthead alone set in the 8x8 font, so Joseph can see why the display font is there. The display font needs only the glyphs that name uses for the mock. All 41 are needed before intake.
2. **Cover beside the track screen at 3x**, so the regular, the bunting and the paper read as the same world.
3. **News page** with the five items in section 4's wireframe, including the longest fill ("Mint Julep Lawsuit, races 2, 6").
4. **Race pages, three states (G on the first):** race r with prices posted, the cursor on one horse and its blurb, L1 "Enter: to window"; a later race with "Prices later" and all dashes; a run race with "Winner: #5" and the pencil tick on your horse.
5. **Window, four states (G on the second):** choosing (cursor on #1, "Race 3. Who do you like?"); ticket open (yours marker on #3, cursor on ticket row 1, the pays line); the bet beat (the slip over the box, clerk on his stamp frame); prices pending (all "-", the pending line).
6. **Track box, three states:** Read focused (no corners), Bet focused (corners on the windows), a lookable focused (voice rows holding its name and line), with the voice rows at y185 and y194.
7. **The path in order at 3x,** side by side: cover, news, race 3 page, window with the ticket open. It must read as one printed program and then a place.

**I accept the mock only if:** the cover reads in 2 seconds at 3x as horses racing at a track, seen from the stand, and on a second look the hat; the three horses read apart in grayscale; the cover has no color but Parchment, Ink and Maroon; nothing in any sheet is on the banned looks list; the clerk fills about half the window opening and the screen reads as a track window, not a bank or casino; the slip reads as a ticket on the counter. Any pixels from the mock that become slot art need their docs/ASSETS.md rows (source, license, AI use) at intake. A missing row is a reject.

## 19. Art-director review of the mock (2026-11-14)

I reviewed the 3x PNGs in docs/mocks/book-and-window/ (script scripts/art/book_mock.mjs) against 18.6. I did not judge the stale `1-cover-variant-arms` and `1-cover-variant-cheering` drafts. I did not open sheet 6a or the gray copy of 4a separately: sheet 2's right half shows the same Read-focused state as 6a, and 4a's page is the approved program page. That leaves two failures: the cover picture (the lady reads first and as an object, the horses' heads collide) and the window picture (an empty room with a small man). Everything else passes. One more pass on those two pictures, then the mock goes to Joseph.

### 19.1 Per sheet

| sheet | ruling | why |
|---|---|---|
| 1-cover | **REVISE** (picture only, 19.2) | The masthead, dateline, cover line and foot pass. The picture fails the first 18.6 test: the eye lands on a Maroon column 52x82 px before the horses, and it reads as a bottle or a chess piece, not a lady. Her hat sits straight on her shoulders with no head under it (DESIGN Shapes and shading, "Silhouette test: if the pose does not read, redraw it"). |
| 1-cover-gray | **REVISE** with 1-cover | The horses do read apart in grayscale (Ink, Maroon and paper coats, plus the parting line), so that test passes. Same picture problems. |
| 1-cover-picture | **REVISE**, 19.2 | as 1-cover |
| 1-cover-picture-as-written | **REJECT** | My 18.2 numbers made her a pillar. The artist was right to leave them. 19.2 replaces them. |
| 1-cover-masthead-compare | **ACCEPT** the display font | At 3x the display-font name reads first and the block reads as a masthead. The 8x8 strip reads as a page header, which is what 18.1 item 3 predicted. All 41 glyphs are due at intake. |
| 2-cover-and-track | **REVISE** with 1-cover | The track half passes. The cover half carries 19.2. The paper, the Maroon and the bunting already read as one place with the track. |
| 3-news | **ACCEPT** | Titles in Maroon, bodies in Ink, items grouped by space alone. It reads as a printed column with a voice. |
| 4a-race3-prices-posted | **ACCEPT** | The approved page with "Enter: to window" in Ink and the blurb in the footer. |
| 4b-race5-prices-later | **ACCEPT** | Dashes and "Prices later" read as a page not yet priced, not as an error. |
| 4c-race2-run | **ACCEPT** | "Winner: #5" in Ink, and the Slate tick on #3 reads as your own pencil mark. |
| 5a, 5b, 5c, 5d (window) | **REVISE**, picture only (19.3) | The box passes in all four states: the yours marker against the bobbing cursor, Ash boxes on Navy, the pending dashes and line. The slip in 5c reads as a ticket on the counter, so 18.1 item 6 holds. The picture fails the 18.6 test "the clerk fills about half the window opening". He fills about half its height and a fifth of its width, and the top third of the screen is bare Mist. It is the empty room with a small man that 18.1 item 5 warned about. My item 5 fix was not enough, because the cause is the world scale, not the opening's size. |
| 5b gray | **ACCEPT** for the box | |
| 6a, 6b, 6c (track box) | **ACCEPT** | Voice rows at y185 and y194 read as their own group, apart from the three menu rows. Corners show only with Bet or a lookable focused. |
| 7-path | **REVISE**, nothing of its own | It reads as one program and then a place. It is redrawn with the cover and window fixes. |

On the artist's four deviations from 18.2:
1. Arms parted by a 1 px paper slit: **accept**, and keep it in 19.2.
2. A paper edge at py110: **drop it**, because 19.2's bench back now separates her from the band.
3. Low dome crown and a 1 px brim droop: **accept**, it no longer reads as a pilgrim hat.
4. Maroon belly on the gray and Ink manes: **accept**. The belly is the gray's shade tone in a two-ink print (DESIGN Shapes and shading, two tones per material).

### 19.2 Cover picture, the fix (`art.book.cover.art`)

Picture coordinates as in 18.2 (screen x = px + 8, y = py + 62). Keep everything not named here.

**The regular: redraw her as a head and shoulders above a bench back.** This replaces 18.2's regular table.

| part | box | look |
|---|---|---|
| hat crown | px24-47, py0-13 | the artist's low dome, Maroon, Ink outline, Parchment hatband py11-12, the 4x4 flower. It still crosses the plate's top line at py4 |
| hat brim | **px0-71**, py14-18 | as drawn, with the outer 8 px drooping 1 px. It now also runs over the plate's **left** border, which stops at py13 and resumes at py19. The hat breaks the frame on two sides, which is what makes the joke land on the second look |
| head (her white hair) | px25-46, py19-36 | Parchment, Ink outline. Lower corners rounded in 3 px steps, and the bottom edge scalloped into curls (3 px steps). This is the head the mock is missing: an 18-row round shape under the brim |
| neck | px31-40, py37-41 | Parchment, Ink outline on the sides only |
| shoulders and back | from px24-47 at py42, widening 2 px each side per row to px8-63 at py50, straight down to py83 | Maroon, Ink outline. 1 px paper slits at px15 and px56 from py52 to py83 part the arms from the back (the artist's fix) |
| bench back | px2-67, py84-109 | paper, Ink outline, Ink plank lines on py90, py96 and py102. Her bench, the same wood bench she sits on at the track. It cuts her at the waist, so she is a person sitting in front of you, not a column. Its light value also keeps her Maroon off the Maroon balcony band |

Her Maroon area drops from about 4,200 px to about 2,000, so the horses become the darkest and sharpest shapes again.

**The horses: spread them so no head lands on a rider.**
- Leader nose at **px208**, second at **px168**, third at **px128**. Ground lines stay py104, 98 and 92, with the same coats, silks and strides.
- At 56 px long, the trailing heads sit over the next horse's croup, in clear paper, not on its rider. Keep at least 3 px of paper between any head and any rider or jacket.
- The third horse's tail ends at px72 or later, 4 px clear of the bench back.
- The gray's head gets an Ink muzzle (the last 3 columns of the head) and keeps its Ink mane on the crest, so the head reads against the paper.

**Infield and wire:**
- **Drop both trees.** They read as two balls, not trees, and have no job the hedge doesn't already do.
- The hedge stays at px68-238, py38-45. Its top gets 2-row bumps, 6 px wide every 8 px (py36-37), so it reads as a hedge, not a wall.
- Move the wire post to **px226-227**, py16-48, with its disc at px223-230, py10-17. The leader is then 18 px from the wire.

Everything else from 18.2 holds: the inks, the rails, the hoof kick, the dirt fleck, the balcony band and pennants, and the not-in-the-picture list.

**Passes when:** at 3x, in 2 seconds, the first read is the horses and the second is the lady in the hat breaking the frame. Filled with Ink, she reads as a seated person from behind. Grayscale still separates the three horses.

### 19.3 Window picture, the fix (`art.window.booth` and a new `art.window.clerk`)

**Draw the clerk fresh at close-up size.** A close-up has to be close, and at the world's 22 px no layout of the booth fills it. This replaces 18.4's three changes.

| part | box | look |
|---|---|---|
| clerk, `art.window.clerk` (new slot) | 32x48 frame at x112-143, y34-81. The counter cuts him at y80, so rows y34-79 show | Drawn fresh, never scaled from `art.hub.clerk`. Clerk 2 of the track, facing us: Ink hair (y36-41), a round Cocoa face (about 18 wide, y40-55), eyes 1x2 Ink, no mouth or brows (as the track's people), Bone collar (y56-58), Turf jacket on the shoulders (x112-143 from y59), a Bone ticket in his right hand at the counter. Four colors: Ink, Cocoa, Turf, Bone. 2 frames: rest, and stamp (the hand down on the tote machine). Idle every 4 s as approved |
| opening | x96-159, y30-79. Maroon frame 2 px on the top (y30-31) and sides (x96-97, x158-159) | He fills 32 of its 60 inner columns and 44 of its 48 rows |
| booth | x98-157, y32-79 | Dirt y32-33, Hay below |
| tote machine | x144-155, y70-79, tongue x148-151, y67-69 | redrawn at this scale: Slate, Ash top row, Bone tongue. 1 px clear of the clerk's frame |
| lamp | **dropped** | no room above his head, and the clerk now carries the warmth. Gold and Auburn get no new use (18.5 L changes to list only Maroon) |
| sign plate | **x16-79, y28-39**, on the wall left of the opening, "Windows" cell top y30, centered (x20-75) | the track's plate art. On the left wall it gives that wall a job instead of bare Mist |
| your program | `art.window.program`, 16x8 at **x176-191, y72-79**, on the counter right of the opening | as drawn, with its Maroon masthead band |
| wall | Mist everywhere else | big calm shape. With the clerk this large, it is the quiet around the focus, not emptiness |

**Passes when:** at 3x the clerk is the first thing you see above the box, he fills about half the opening, and the screen reads as talking to a person at a track window, not a bank teller or a dealer.

### 19.4 Changes to 18.5 (DESIGN.md text held for the build)

- **K, The window (close-up).** Replace "It is the track's window 2, closer. People stay at the world's scale, as an 8-bit shop counter does." and the window parts that follow with: "It is the track's window 2, closer. The clerk is drawn fresh at close-up size, 32x48 (`art.window.clerk`), with the same four colors and the face rule, never scaled from the 16x24 clerk. Mist wall with the track's sign plate on the left. The opening x96-159, y30-79, Maroon frame 2 px on the top and sides, a lamp-lit booth (Dirt under the lintel, Hay below). A tote machine with its ticket tongue on the counter. The wood counter y80-87. Your program on the counter right of the opening, its Maroon masthead showing." Drop the lamp sentence.
- **People (Overworld and menus), a new line after the scale line:** "A close-up (today only the window) draws its person fresh at 32x48, with the same four colors and face rule. Never scaled from a 16x24 sprite."
- **L, palette jobs.** Gold and Auburn get no new use. Maroon adds "the cover's masthead and picture".
- **F, The cover.** Replace "the view from the seat behind the regular, her hat breaking the picture's top border" with "the view from the bench behind the regular, her hat breaking the picture's top and left borders".
- **slots.json** adds `art.window.clerk` (32x48, 2 frames). ASSETS.md needs a row for it at intake.

## 20. Art-director verdict on the second pass (2026-11-14)

Judged from 1-cover-3x, 1-cover-gray-3x, 5a-3x and 5c-3x. 5b, 5d, 2-cover-and-track and 7-path carry the same two pictures, so they take the same verdicts.

### 20.1 Window picture: ACCEPT

The clerk is the first thing above the box, fills the opening and reads as a friendly person at a counter. The sign on the left wall and the program on the counter give the wall jobs, and the Mist around them is the quiet around the focus. The stamp frame's hand, 1 px clear of the tote machine, is fine. It passes 19.3 and 18.6 ("reads as a track window, not a bank or casino").

### 20.2 Cover picture: REVISE, the regular only

**What passes:**
- The horses. Every head can now be found, the three coats read apart in grayscale, and the leader is the sharpest shape.
- The scalloped hedge reads as a hedge, and the wire post sits right.
- The brim stopping at px0 with the border broken at py13-19: accepted. px0 is the picture's own edge, and the break reads.

**What fails:** the regular reads as a mannequin. A small blank head on a thin neck over a flat-topped block, on a box of slats. That breaks DESIGN Shapes and shading: "Silhouette test: fill a sprite with Ink. If the pose does not read, redraw it".

**The cause is the back view, not the drawing.** Two passes have now failed the same way. From behind, at this size and in two inks, a person has nothing to read by: no face, white hair that can only be paper (so it reads as an empty shape or, with hooks, as texture), and a back that is a rectangle by nature. A third back-view pass will not fix that. **The back view is dropped.**

**What replaces it: the same regular, same place, in profile, facing right and watching the race.** Profile is how this game already draws people (DESIGN face rule), and a face, a nose bump and a raised program read at any size. Her gaze also points down the stretch toward the leader and the wire, so she sends the eye to the horses instead of holding it. The hat and the frame break stay exactly as drawn, because a wide brim seen side-on is the same long shape. The joke is unchanged: the biggest hat in the stand, too big for the picture.

Picture coordinates as in 18.2. Everything not named here stays as drawn.

| part | box | look |
|---|---|---|
| hat | as drawn: dome crown px24-47 py0-13, brim px0-71 py14-18 with the droop, the band, the flower on the crown's right (front) side | unchanged |
| head | px27-48, py19-38 | The back half (about px27-38) is her curls: paper with the artist's Ink curl hooks, scalloped edge toward the face. The front half is her face: paper, Ink outline on its front edge only, following the face rule (the edge curves out and back over 4 to 5 rows, a 1 px nose bump about py29, the same edge 1 px behind it above and below). One 1x2 Ink eye about px44, py26-27. No mouth, no brow. |
| neck | px34-41, py39-41 | 3 rows, 8 wide. Short, so the head sits on the shoulders, not on a post |
| torso | from the shoulders at py42 (px26-50) to the waist at py85 | Maroon, Ink outline. The back edge curves out and down (round shoulders, not square ones). The front edge is the bust, out to px52 at py50-70 |
| arm and program | upper arm down the front of the torso from about px44-50 at py46 to the elbow at py64. Forearm forward and up to her hand at px54-56, py40-44. 1 px paper slit between arm and torso | She holds a paper program with an Ink outline up beside her face, px53-60, py30-41, as the track's fans hold theirs and as her own idle fans with it. Job: she has the same program you do |
| lap | px26-64, py86-91 | Maroon, a horizontal run forward, as the track's seated regular has (DESIGN The track, the regular: "the lap a horizontal run ... forward over the bench") |
| bench seat | px16-60, py92-94 | paper plank with Ink outline, under her lap |
| shins | px58-63, py95-109 | Ink, straight down, hidden by the balcony band from py110 |
| bench back with slats | **dropped** | In profile the seat says "bench" by itself. The slatted box was the second block under the first |

Keep at least 4 px of paper between her knees (px64) and the third horse's tail (px72 or later). Her Maroon area is now about half the back view's, and broken by the arm, so the horses stay the first read.

**Passes when:** filled with Ink, she reads in one glance as an older lady seated in a big hat, watching something to the right. At 3x in 2 seconds the first read is the horses and the second is her hat breaking the frame.

**Fallback, my call at the next review, not another round of fixes:** if the profile still reads stiff, crop her out and keep only the hat. The brim and crown come in from the top-left corner, breaking the frame as now, with a line of her paper curls and the top of a Maroon shoulder showing under the brim at the picture's left edge. Her body is outside the picture. The joke becomes "a hat is in your view", which needs no figure to read. I prefer the profile because the hat should belong to someone you can see.

### 20.3 Changes to the held DESIGN.md text

- **18.5 F (and 19.4's version of it).** Replace "the view from the bench behind the regular, her hat breaking the picture's top and left borders" with: "the regular seated in profile at the left, facing the race, her hat breaking the picture's top border and meeting its left edge".
- Nothing else in 18.5 or 19.4 changes. 19.4's K and the People line for the 32x48 close-up stand, now that the window is accepted.

Once the regular passes, the mock is ready for Joseph's approval as a whole.

## 21. Art-director verdict on the third pass (2026-11-14)

Judged from 1-cover-3x, 1-cover-gray-3x, 1-cover-hat-only-3x and 7-path-3x.

### 21.1 Profile cover: ACCEPT for the mock

This is the cover I stand behind.

**Silhouette test passes.** Filled with Ink, she reads in one glance as a person seated on a bench in a big hat, holding something up and facing right. That is the DESIGN Shapes and shading test, and it is the first pass that meets it.

The cover meets the other 18.6 tests too:
- The horses and her hat share the first read.
- The hat breaking the frame is the second look.
- Her gaze and the raised program point down the stretch toward the leader.
- Grayscale separates the three horses.
- Only Parchment, Ink and Maroon are used.

Her program carrying the 2-row Maroon band is accepted: it is the same program you hold, the job stated in 18.4 for the player's program.

Two fixes at asset intake, not another mock round. Both are about readability at 3x, under the same rule as above (if the pose does not read at once, redraw it):

1. **Make the head round and give the face room.** The head now reads as a tall paper egg covered in hatching, and the face is faint at 3x.
   - Shorten it to 16 rows (py19-34, chin at py34). Raise the neck to py35-37 and move the shoulders up to start at py38. The torso keeps its bottom, so it gains 4 rows.
   - Keep the curl hooks to the back third of the head only (about px27-36), behind a clean scalloped hairline.
   - That leaves a plain paper face at least 11 px wide (about px37-47) with the eye at px44 and the nose bump at px48.
   - Job: the face is where a person is read. Plain paper with one eye and a nose edge reads as a face, and hatching over it reads as texture.
2. **Round her back.**
   - Step the torso's top-back corner in by 3, 2 and 1 px over its first three rows, so the shoulder is a curve, not a square corner.
   - Push the back edge out 1 px for rows 8 to 20 of the torso, a slight stoop.
   - Job: an older lady sitting forward to watch a finish, not a block on a bench. No other change to the torso, arm, lap, bench or shins.

Everything else in the picture is accepted as drawn: the horses, hedge, wire post, rails, hoof kick, balcony band and pennants, the hat with its break at the left edge, and the 8 px knee gap. If either fix makes the silhouette worse at intake, the asset comes back as a REVISE. It does not go back to a back view or to the fallback.

### 21.2 Hat-only cover: REJECT

It fails the 18.6 test "reads in 2 seconds as horses racing at a track, seen from the stand, and on a second look the hat". The hat floats over an empty corner, and the Maroon wedge under it reads as a cliff or an awning, not a shoulder. The joke needs someone under the hat, which is why I preferred the profile in 20.2. Drop this cover. It is not a slot variant and does not go to the build.

### 21.3 Path sheet: ACCEPT

7-path reads as one printed program (cover, news, race page) and then a place (the window), with the cover now holding its own beside the pages. The window picture was accepted in 20.1.

### 21.4 Where the mock stands

Every sheet in 18.6 is now accepted, with the two intake fixes in 21.1 on the cover picture. The mock is ready for Joseph's approval of the look. Still open for him: question 8 (a real track's name on the masthead) and the copy note on the "Lemonade tested" news item (18.4). The DESIGN.md text held in 18.5, 19.4 and 20.3 is unchanged by this verdict.
