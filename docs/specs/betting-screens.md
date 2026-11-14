# Spec: the betting screens

Status: draft for Joseph's review. Written 2026-11-13 by the designer for B5 in `docs/specs/betting-simple.md`. It reuses the program page, race view, photo and result from `docs/specs/m1-race-day.md` (4.1, 4.3, 4.4, 4.6) and draws by DESIGN.md "Program pages". All money values come from the betting code. Every number here that is not a pixel is a starting guess in data.

Marks: **[T]** tested headless, **[E]** needs eyes on the build.

## 1. Problem, user, decision

**User:** Joseph, at a desk, playing a day of eight races to see if betting on horses is fun on its own.

**Problem:** he asked for "a simple game of betting on horses". Before that he said picking a horse had "too much detail" and that "it should all be like a real horse racing book". So the screens need to do four things: put the price beside the stats on the page he already approved, make a bet in about two presses, keep passing easy, and tell him how the day went. They must not add a screen the game does not need.

**Decision:** two pages and the race. The program page is where you read, choose and bet, with the ticket filled in at the foot of that page. The race view is unchanged except for the HUD lines. The result page is the chart. At the end of the day there is one more program page, the back page. No slip slides over the page, and there is no separate bet screen, no Orders and no winner's circle.

Why the bet lives on the program page: Joseph asked for less, and marking a program then stepping to the window is one motion at the track. A separate bet screen would repeat the horse, the odds and the bankroll the page already shows, and it would hide the field at the moment you are comparing prices.

Rejected:
- **A slip over the page.** It covers the entries you are betting against. It would also be a Navy box (speech or the world) laid over print, which DESIGN keeps apart.
- **A separate bet screen.** It is one more screen and one more press, and it shows nothing new.
- **Pass as an amount in the ticket.** You would have to choose a horse in order to not bet on one.

## 2. The flow and the keys

```
New day / boot -> Program (race r) -> Race (parade, bugler, gate, race, wire, [photo], winner beat)
               -> Result (chart) -> Program (race r+1) ... -> after race 8, or bankroll under $2: End of day
```

| where | keys |
|---|---|
| Program, choosing | Up, Down move through the 8 entries and "Pass this race", wrapping. 1 to 8 jump to a post. Enter, Space or Z on a horse opens the ticket. Enter on Pass passes. Esc does nothing. |
| Program, ticket open | Left, Right step through the offered amounts. Enter, Space or Z places the bet. Esc closes the ticket and removes the band. |
| Race | as built: hold Space for 4x, Enter skips a beat, P or Esc pauses |
| Result | Enter, Space or Z: Next race, or End of day |
| End of day | Enter, Space or Z: New day |

Focus on the program starts on post 1. "Pass this race" sits after post 8, so Up from post 1 lands on it.

**Press counts:**
- **Bet $2 on a horse, watch, next race:** `3` (jump to post 3), Enter (opens the ticket at $2), Enter (bet), then watch with no presses, then Enter on the result. **4 presses.** With arrows instead of a digit, add the Downs.
- **Pass:** Up, Enter, then watch or press Enter to skip, then Enter on the result. **3 presses**, plus any skips.
- **Change the amount:** add one Left or Right per step.

The ticket opens at the amount you bet last, if it is still offered. Otherwise it opens at the largest offered amount below that. On the first bet of the day it opens at $2. Why: someone who bets $10 every race should not press Right four times every race.

## 3. The program page with odds

**Job:** compare the field with its prices and place one bet or pass. **Reads first:** names and styles, then down each stat column, then down the odds column at the right edge. The bankroll and race number sit in the top line, which the eye passes once.

### What moved and why

The entry was full. Odds have to sit on every entry, readable down a column, at up to 4 characters ("26-1", 32 px in the main font). These are the options I considered:

1. **Odds replace the style word on line 1.** Rejected. Style is the one attribute Joseph asked to compare, and the crowd's style lean makes it matter more now.
2. **Odds in the small font beside the saddlecloth block, as some programs print the morning line.** Rejected. The block fills the entry's height, and odds are the figure a bettor reads most, so they deserve the main font.
3. **Drop the stat numbers and keep 50 px bars.** Rejected. Joseph asked for stats, and the numbers were approved.
4. **Shorten the three bars from 50 px to 40 px and put the odds at the right end of line 2** (chosen). Line 2 becomes the horse's figures, read left to right: three stats, then the price. The bars still separate the field: on the shipped card's range, 58 draws 23 px and 86 draws 34 px, an 11 px gap that is 33 screen px at 3x.

The header gains "Race 3 of 8" and the bankroll on its first line. To keep four lines, the track name and distance share line 3, and surface, going and bias share line 4. The jockey line leaves the footer. Jockeys have no stats and no effect in this game, and the footer is now where the ticket is written (Joseph question 1).

### Wireframe

```
x 8                                                               247
y   4  Race 3 of 8                                    Bank $100.00     L1: Ink, bank right-aligned
   14  Old Fence Row Stakes                                            L2: race name, Maroon
   24  Churchill Downs, 1 1/4 miles                                    L3: track, distance
   34  Dirt, fast, playing fair                                        L4: surface, going, bias
   44  -------------------------------------------------------------   rule
   47           Speed      Stamina        Kick              Odds       heads, centered over bars
   56  -------------------------------------------------------------   rule
   58  > [ 1] Gravy Subpoena                            Stalker        entry line 1
   67         76 ====....   70 ===.....   66 ===.....        5-2       entry line 2
   77    [ 2] Hold My Oats                              Front          next entry, y58 + 19*i
  ...
  191    [ 8] Mint Julep Lawsuit                        Stalker
  200         68 ===        82 ====       64 ===            26-1
  210  -------------------------------------------------------------   rule
  214  Served papers to the leader.                                    footer L1
  226    Pass this race                                                footer L2, a cursor stop
```

**Entry, changes from the built entry in bold:**

| element | x | y in entry | font or art |
|---|---|---|---|
| cursor | 8-15 | +5 to +12 | horseshoe, paper colors |
| saddlecloth block | 20-35 | +0 to +16 | 16x17, Ink border, main-font number |
| name | 40-183 | +0 to +7 | main font, Ink |
| style | right-aligned, ends 247 | +0 to +7 | main font, Maroon |
| speed number | 40-47 | as built | small font |
| **speed bar** | **50-89** | +11 to +13 | 40 px track |
| **stamina number** | **98-105** | as built | small font |
| **stamina bar** | **108-147** | +11 to +13 | 40 px track |
| **kick number** | **156-163** | as built | small font |
| **kick bar** | **166-205** | +11 to +13 | 40 px track |
| **odds** | **right-aligned, ends 247 (216-247 at 4 characters)** | **line 2, sharing the stat numbers' baseline** | **main font, Ink** |
| **bet tick** | **8-15** | **+5 to +12** | **pencil tick, in the margin** |

- **Heads** (y47, main font): "Speed" x50-89, "Stamina" x100-155, "Kick" x170-201, "Odds" right-aligned x216-247. Each stat head is centered over its bar, not over the number. At 40 px bars, "Stamina" (56 px) set at its number would run into "Kick". Gaps between heads: 10, 14 and 14 px.
- **Bars:** `floor((stat - statMin) * 40 / (statMax - statMin))` px, with the range from `tuning.statRange`. Same track and stop as DESIGN's stat bars, now 40 px long. Equal stats draw equal bars. 1 point can draw the same length, and the number settles it. Bars still follow CD4: drawn from that horse alone.
- **Odds** are the crowd's price, from the betting code. They are the one figure that depends on the whole field. There is no favorite mark, no color by price and no sorting. The odds column reads as a column because every price ends at x247.

**Header lines:**
- L1 "Race {r} of {n}" left, "Bank {bankroll}" right-aligned. Longest: "Race 8 of 8" (11) plus "Bank $165,000.00" (16) is 28 with a gap. "Bank" is short, a bettor's word, and on no banned list.
- L2: race name from `day.json`, Maroon.
- L3: "{track}, {distance words}". "Churchill Downs, 1 1/4 miles" is 28.
- L4: "{Surface}, {going}, {bias phrase}". "Dirt, fast, playing fair" is 24. Short bias phrases in data: "playing fair", "rail is good", "outside good", "speed holding", "closers' day" (each 13 or fewer).
- L3 and L4 are built from data, so the loader checks each is 30 characters or fewer and fails with the file and field if not. v1 data passes.

### Footer and placing the bet

**Choosing** (footer y214 and y226):
- L1 shows the focused horse's blurb. With the cursor on Pass it shows "Sit this one out and watch." While odds are pending (below) it shows "The crowd is still betting." whatever is focused.
- L2 is "Pass this race" at x20, always printed, a cursor stop with the cursor at x8. Pass is always on screen and always one stop away.

**Ticket open** (Enter on a horse):
- The highlighter band swipes onto that entry (DESIGN swipe, 2 frames). The band now means **the horse you are betting on, this race**. Last race's pick no longer exists as an idea, since every race is a new field.
- Footer L1: cursor x8, "< $10 >  on #3" from x20 (longest "< $100 >  on #8", 15 characters, ends x139), and "Enter: bet" right-aligned (x168-247).
- Footer L2: "$10 to win pays $37.00" from x20 (longest "$100 to win pays $20,620.00", 27 characters, ends x235). This is the total returned, stake included, never profit.
- As the amount changes, footer L2 and **every** entry's odds update with your amount in the pool on your horse. Usually only your horse's price visibly moves; a big bet on a longshot cuts it. What is shown is what is paid.
- When only $2 is offered, the arrows are not drawn ("  $2  "), so nothing hints at a choice that does not exist.
- Esc closes the ticket: the band goes, and the footer returns to choosing with the cursor on the same horse.

**Bet placed** (Enter on the ticket): the punch beat, 0.6 s (data).
- The pencil tick appears in the entry's margin cell (x8-15), as a fan ticks a program.
- The header's bankroll drops by the stake (the stake leaves at Go to the post, which this is).
- The footer becomes a printed tote ticket: a Bone slip at x8-247, y209-235, with Ink left, right and bottom borders and an irregular torn top edge from the fixed 24-column pattern in DESIGN's "Program pages, Betting additions". It covers the rule at y210, which is not drawn while the slip shows; line 1 at x16 with its cell top at y215 and line 2 at x16 with its cell top at y225, both Ink. The bankroll cuts to its new figure; it never counts down. Line 1 reads "Race 3, $10 to win on #3" (longest 25) and line 2 "Legally A Horse at 5-2" (longest 26). Both are Ink.
- Then the page cuts to the race.

**Pass** (Enter on Pass): no band, no tick, no ticket. The page cuts to the race at once.

### Program states

| state | what shows |
|---|---|
| First race of the day | Focus on post 1. Bank shows the starting $100.00. Odds are probably pending (next row). |
| Odds pending (estimate or crowd not finished) | Each odds cell shows "-". Footer L1 reads "The crowd is still betting." Enter on a horse does nothing. Pass works. When the odds are ready they all appear in the same frame. Nothing ticks or animates. |
| Odds ready, no bet yet | As drawn. |
| Ticket open | Band on the horse, ticket lines in the footer, live prices. |
| Bet placed | Tick, lower bankroll, tote ticket, 0.6 s, then cut. |
| Last race | Header reads "Race 8 of 8". Nothing else changes. |
| Bankroll under $2 at the start of a race | The program is not shown. The End of day page opens instead (section 6). |
| Fewer than 8 horses | Entries end early. The rule at y210 and the footer stay in place. |
| No blurb | Footer L1 is blank. |
| Data or betting error | The existing error screen, with the file and field, or the day seed and the message. |

## 4. The race view

Only the HUD's left column changes (4.3 of the race-day spec). Everything else is as built.

**With a bet:**
- y181: your horse's name, as built.
- y191: position from the calls, as built.
- y201: the bet, where the orders line was: "$10 to win, 5-2", the odds at post with your bet in the pool. Longest "$100 to win, 26-1", 17 characters, fits the 18-character column.
- Marker, strip arrow, mini map ring and camera are as built. Your horse is the horse you bet on.
- When the winner crosses the wire, the message line adds one line: "That ticket is good" if your horse won, "No luck this time" if not. It says nothing about money. The amount waits for the result page (UI3).

**With no bet (passed):**
- There is no "your horse": no Yellow arrow, no strip arrow, no ringed dot.
- y181: the leader's name at the most recent call.
- y191: "Leads by 1 1/2", from the calls.
- y201: "Just watching".
- **Camera:** the race rule `cam = min(L - 200, P - 56)` takes P = L, which is `cam = L - 200`, the leader at screen x 200. The final sixteenth and the wire hold are unchanged. That covers the case the rules spec flagged.
- No wire message.

Rejected: showing the would-have-been payout on a passed race. That is a nudge, not a fact about a ticket you hold.

## 5. The result page (the chart)

It is restyled, not restructured. The order section is as built, with the band and Ink arrow on your horse's row only when you bet. Two places change.

**Trip section (y112 + 11 * i):**

| line | with a bet | passed |
|---|---|---|
| 1, Maroon title | your horse's name | the winner's name |
| 2 | "3rd, beaten 2 1/4" or "Won by a neck" (as built) | "Won by a neck" |
| 3 | early and 1/4 positions (as built) | the winner's, same template |
| 4 | luck line (as built) | the winner's luck line |
| 5 (was "Orders:") | won: "$10 to win paid $37.00" (longest 27); lost: "Lost $10 at 5-2" (longest 17) | "No bet. Watched for free." |

On a pass the section tells the winner's trip, so it still has a story to tell. It uses the trip generator that already exists.

**Time section (y184 + 12 * i):**
1. "Time 2:01.55, hot pace" (as built).
2. "Splits" and the small-font fractions (as built).
3. "$2 to win paid $7.20": the winner's $2 price. Longest "$2 to win paid $166.00", 22. The crowd puts at least 1 percent of the pool on every horse, so a $2 price stays under $1,000.
4. Cursor x8, "Next race" (or "End of day" after the last race, or when the new bankroll is under $2) from x20 (at most 10 characters, ends x99), and "Bank {bankroll}" right-aligned to x247 (at most 16 characters, starts x120 or later). This is the first place the settled bankroll appears, and the page opens only after the wire.

The seed moves to the End of day page as the day seed, which together with the race number identifies any race. The "Today" record line is gone, as decided in M1.

Money colors: the bankroll is Ink. No Emerald or Red on the result. The paid line is the total returned, and a change figure would read as profit framing. The change shows once, on the End of day page.

## 6. End of day (the back page)

Same paper and rules as the program.

```
x 8                                                               247
y   4  That's the card                                  Day #12345       title Maroon; "Day" main, digits small
   14  Churchill Downs                                                   Ink
   24  -------------------------------------------------------------   rule
   32  Started with                                       $100.00
   44  Ended with                                         $127.40
   56  Change                                             +$27.40       Turf with +, Red with -, Ink "Even"
   68  Bets made                                           5 of 8       bets of races run
   80  Winners hit                                              2
   92  Best price hit                                         9-2       "None" if no winner
  104  -------------------------------------------------------------   rule
  112  Up on the day. Nicely read.                                       the day's line
  220  > New day
```

Labels start at x8, values are right-aligned to x247, all in the main font. The longest pair is "Best price hit" (14) with a value of at most 12.

The day's line, by outcome (data, each at most 30):

| outcome | title | line |
|---|---|---|
| ended up | That's the card | Up on the day. Nicely read. |
| ended even | That's the card | Square on the day. Not bad. |
| ended down | That's the card | The horses had other ideas. |
| bet nothing all day | That's the card | Watched all eight for free. |
| broke (under $2 at the start of a race) | Tapped out | Happens to the best of us. |

When broke, "Bets made" counts races actually run ("4 of 4"), so the page never implies races you were shut out of. The page itself carries the kindness: same paper, same New day, no Red title, no sound of loss. "New day" is the only action, and it starts the next day seed with $100.

Rejected: a race-by-race list of tickets. It is a nice back-page tally, but it is more to read, and Joseph asked for less. It is the first addition if he wants the day's story on the page (Later).

## 7. Shelved screens

- **Orders** leaves the loop. Its code and tests stay and keep passing. The program cuts straight from the bet to the race.
- **Winner's circle** stays out. It is not built, it would add a beat to all eight races, and without a trainer or an owner it is only a picture of someone else's win. The winner beat (fist raised, easing to a walk) already marks the win in the race view. It comes back with ownership.
- **Post parade, call to the post, gate, photo, winner beat:** unchanged.

## 8. Copy

All in `raceDay.json` copy, ask-first with the other files. Each is checked against its field width with the longest values.

| key | text |
|---|---|
| program.race | Race {r} of {n} |
| program.bank | Bank {amount} |
| program.pass | Pass this race |
| program.passLine | Sit this one out and watch. |
| program.pending | The crowd is still betting. |
| ticket.amount | < {amount} >  on #{n} |
| ticket.confirm | Enter: bet |
| ticket.pays | {amount} to win pays {total} |
| ticket.printed | Race {r}, {amount} to win on #{n} / {name} at {odds} |
| hud.bet | {amount} to win, {odds} |
| hud.watching | Just watching |
| hud.leads | Leads by {margin} |
| msg.won | That ticket is good |
| msg.lost | No luck this time |
| result.paid | {amount} to win paid {total} |
| result.lost | Lost {amount} at {odds} |
| result.passed | No bet. Watched for free. |
| result.winPrice | $2 to win paid {price} |
| result.next / result.end | Next race / End of day |
| end.* | the table in section 6, plus "Started with", "Ended with", "Change", "Bets made", "Winners hit", "Best price hit", "None", "Even", "New day" |

Money format: "$" then whole dollars with commas, then cents ("$1,234.50"). Bet amounts show no cents ("$10"). Odds as the tote shows them. "Favorite" is never used on these screens: the odds already say it.

Voice: the wit lives in the blurbs, the pass line and the day's line. Money lines stay plain, so they are never misread.

**Proposed additions to `copy.bannedWords` (SAFE4):** deposit, withdraw, cash out, cashout, cash in, real money, buy, purchase, credit card, debit, payment, pay now, top up, add funds, funds, wallet, cashier, checkout, redeem, bonus, free bet, promo, jackpot, casino, USD. I use "paid" and "pays" for ticket returns, which is how a tote speaks. "Cashed" is avoided ("Best price hit"), so "cash" in any form can be banned outright if the art-director or Joseph prefers.

## 9. Acceptance criteria

These extend UI1 to UI6 and SAFE1 to SAFE4 in `betting-simple.md`. All of those still hold.

### Program
- **BP1 [T]** Each entry draws the bars at `floor((stat - statMin) * 40 / (statMax - statMin))` px at the x ranges in section 3, and the odds right-aligned to x247 on line 2. 58 is 23 px, 86 is 34 px.
- **BP2 [T]** Bars, numbers, name, style and block are drawn from that horse and the stat range only (CD4). Only the odds cell changes when another horse's crowd money changes.
- **BP3 [T]** Every odds cell equals the betting code's display for that horse, with the player's current ticket amount in the pool while a ticket is open and none otherwise.
- **BP4 [T]** Header L1 to L4, the heads, the footer lines and every ticket string fit their fields with the longest values in section 3. L3 and L4 over 30 characters fail at load with the file and field.
- **BP5 [T]** Focus order is posts 1 to 8, then Pass, wrapping both ways. Keys 1 to 8 jump to posts. Initial focus is post 1.
- **BP6 [T]** While odds are pending, every odds cell is "-", the footer shows the pending line, Enter on a horse does nothing, and Enter on Pass passes.
- **BP7 [T]** The ticket offers exactly the amounts the rules allow for the current bankroll (BK1), in rising order. It opens at last bet's amount if offered, else the largest offered below it, else $2. With one amount, no arrows show.
- **BP8 [T]** The "pays" shown equals the credit if that horse wins at that amount (BK2), for every offered amount and every horse in a fixture field.
- **BP9 [T]** Esc on an open ticket removes the band and returns focus to that horse. No money moves.
- **BP10 [T]** Placing a bet lowers the bankroll by the stake once, draws the tick and the printed ticket for the punch beat, then starts the race. Passing moves no money and draws no mark.
- **BP11 [T]** With a bankroll under $2 at the start of a race, the End of day page opens and no program is drawn.
- **BP12 [E]** At 3x, Joseph can read down the odds column and the three stat columns without moving the cursor, and the page still reads as the approved program in color and in grayscale.

### Race
- **BR1 [T]** With a bet, HUD line y201 reads "{amount} to win, {odds}" with the odds at post.
- **BR2 [T]** With no bet, no marker, strip arrow or ringed dot is drawn, the left column shows the leader at the last call and "Just watching", and the camera equals `L - 200` until the final sixteenth (UI4).
- **BR3 [T]** The wire message is "That ticket is good" or "No luck this time" only with a bet, and only once the winner has crossed. No money string appears anywhere in the race view.

### Result
- **BS1 [T]** Trip line 5 is the paid line, the lost line or the passed line, matching the settled ticket. On a pass, lines 1 to 4 are the winner's.
- **BS2 [T]** Time line 3 shows the winner's $2 price from the betting code. Line 4 shows the settled bankroll, which equals the rules' BK3 value.
- **BS3 [T]** The action reads "End of day" after race 8, or when the settled bankroll is under $2, and "Next race" otherwise.
- **BS4 [T]** No string on the result page or in its `aria-live` text contains a profit figure, a change figure or the estimate.

### End of day
- **BE1 [T]** Started with, Ended with, Change (sign and color), Bets made ("bets of races run"), Winners hit and Best price hit match the day record for a scripted day, including a broke day and a day of passes.
- **BE2 [T]** The title and the day's line follow the table in section 6 for each outcome.
- **BE3 [T]** New day starts the next day seed with the starting bankroll, on the race 1 program.
- **BE4 [E]** After going broke, the page reads as a friendly end of a day, not a penalty. Joseph's call, noted in the gate run.

### Copy and flow
- **BC1 [T]** Every copy key in section 8, filled with its longest values, fits its field. No copy string contains a word from `copy.bannedWords`, compared case-insensitively.
- **BC2 [T]** The common path (digit, Enter, Enter, Enter on the result) and the pass path (Up, Enter, Enter on the result) reach the next program with those presses and no others, in a scripted input test.
- **BC3 [E]** Gate run: two days back to back. Joseph notes whether he ever wanted a screen this spec does not have, or used one it does have less than once a day.

## 10. For the art-director

Final rulings from the mock (2026-11-13, after Joseph approved it). These win over anything above that differs, and DESIGN.md has the exact pixels:

- **Column heads** (y47, main font, Ink), each starting at its column's stat number: "Speed" x40-79, "Stam." x98-137, "Kick" x156-187, "Odds" right-aligned at x216-247. Centered over the bars they read as one sentence. "Stamina" is printed "Stam." because the stat columns are 58 px apart and the word is 56. The stamina head's text comes from copy in data.
- **The tote ticket** is a Bone slip at x8-247, y209-235, with an irregular torn top edge and square corners. Text stays at x16 with cell tops y215 and y225.
- **Money up on paper is Turf**, not Pine, which read as nearly black. Still only on the End of day "Change" figure.
- **The End of day page lists the day's card.** A 1 px Ink rule at y124, then one row per race actually run, cell tops at y128 + 11 * i: "Race {r}" at x8; the 10x10 saddlecloth box of the horse you bet on at x64-73 (rows y-1 to y+8, Ink border, small-font number); its odds from x80; and the ticket right-aligned to x247, "Paid $70.00" or "Lost $10". On a pass: no box, no odds, "Passed" at x64. All Ink: no Turf, no Red, no band, no tick, no total. A broke day lists only the races run. "New day" stays at y220. New copy: "Race {r}", "Paid {total}", "Lost {amount}", "Passed". This replaces the "Rejected" and "Later" notes that left a race-by-race list out.
- **BE1** also checks the day's card: one row per race run with the right box, odds and ticket, for a scripted day, a broke day and a day of passes.
- Everything else in the mock is accepted as drawn.

Ruled 2026-11-13. All eight items below are settled in DESIGN.md under "Program pages, Betting additions", and those rulings win over the text of this spec where they differ. In short: bars at 40 px accepted; odds in Ink, main font, right-aligned to x247 with the cell top at +8 of the entry, an "Odds" head in Ink at x216-247, and no treatment of any kind for the favorite; a pending price is a single "-" at x240-247; the pencil tick sits in the margin at x8-15, rows +5 to +12, means "bet placed", and is never drawn in the same cell as the cursor (if both, the tick wins); the band means "the horse you are betting on" from ticket open to the result; the tote ticket has a torn top edge; on paper money up is Turf with a plus sign and money down Red with a minus sign, on the End of day "Change" figure only; the End of day title is Maroon, never Red, with "Day" in the main font and the seed in the small font, right-aligned to x247; prices and the bankroll cut to new figures and never roll; no currency icon, no casino or real-money looks, and no celebration effect tied to money. No new art assets.

1. **Bars at 40 px** instead of 50 px, with heads centered over the bars. This amends "Stat bars" in Program pages.
2. **The odds column:** Ink or Maroon. I recommend Ink. Maroon's three uses are fixed, and the price should read as print, not as a heading.
3. **The pencil tick in the margin** (x8-15, the cursor's cell) rather than on the band. Its meaning is now "bet placed this race".
4. **The band's meaning** is now "the horse you are betting on, this race", on the program and the result.
5. **The printed tote ticket:** a Bone slip with an Ink border, x8-247, y212-235, two lines, shown for 0.6 s. Any edge detail (perforation, a notch) must stay on the 1x grid and inside the slip.
6. **Emerald and Red on Parchment** for the end-of-day change, with the sign as the second signal. Do they read on paper and in grayscale?
7. **The pending dash** in the odds column, a main-font "-". Is a dash the right print mark for a price not yet posted?
8. **End of day page:** title treatment, the "Day #12345" pair (main and small font), and whether the back page wants any mark at all.

## 11. Questions for Joseph

1. **Jockeys off the program page in this game.** They have no stats or effect, and the footer is where the ticket is now written. *Recommend: off for now. They come back when jockeys have something to compare.*
2. **The winner's circle stays out.** It is not built, and it would add a beat to every race. *Recommend: out until you own horses.*
3. **Where focus starts.** On post 1 (the bet path is 4 presses, a pass is 3), or on Pass (a pass is 2, but the blurb only shows once you move). *Recommend: post 1. This is a betting game, and the footer shows a horse's blurb the moment the page opens.*

## 12. Later

- Race-by-race ticket list on the back page.
- A morning line and a live tote before post, place and show, exotics, all from the rules spec's non-goals.
- Jockeys on entries, the winner's circle, Orders, when ownership returns.
