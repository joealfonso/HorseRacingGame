# Spec: a book that tells you something

Status: draft for Joseph, 2026-11-15. Written by the designer. Amends `docs/specs/book-and-window.md` sections 4, 5 and 13 (and the criteria NW2, NW4, NW5, BB2 that test them). Those files are not edited here. Every threshold below is a starting guess in data, taken from `docs/specs/book-signals.md` (the playtester's 4,000-race measurement), which is the only source for what the book may allude to. Where a trigger combines two measured facts in a way the measurement did not test, it says so and the harness check in section 4 settles it before ship.

Marks: **[T]** tested headless, **[E]** needs eyes on the build.

## 1. Problem, user, decision

**User:** Joseph, playing a day of eight races, reading the book before he walks to the window. Solo player, bets play money, picks by comparing stats (his earlier direction).

**Problem:** he said, after playing: "also all of the information in thebook should legit allude to outcomes and be useful". Today the news is half jokes with no information, two of its three facts predict nothing (a horse running twice, yesterday's longest price), the third ("8 races, all 1 1/4 miles on fast dirt") is the same every day, and the blurbs mostly repeat the style word already printed beside them. Nothing in the book says which horse is the class of a field or how a race's pace sets up, and those are the two things that move results most (book-signals summary 1 to 5).

**Decision:**

1. **One rule for every line in the book: true, pointing the right way, and about the result.** A line may be funny. It may not be empty, and it may never hint at something book-signals lists as false. Section 2 applies it to each thing the book prints.
2. **The news becomes five computed hints about today's card.** Seven kinds of item, each triggered by a fixed rule on the drawn fields, the stats, the styles and the posts (section 3). No flavor-only items. The humor moves into the wording: the bugler, the regular and the snack cart deliver the facts.
3. **Headlines lead with the race number** ("Race 5: five want the lead"), and the five items print in race order, so the page reads as a walk down the card and he can find the next race in one glance.
4. **Every blurb says something true about the horse's class, its best stat or its style,** and the strongest and weakest horses in the stable say so, kindly (section 5). 36 of 40 change.
5. **The race page states the pace in its header** ("Dirt, fast, 3 up front"), in place of the bias phrase "playing fair", which is the same on every race and slightly false (inside posts are better). One phrase, no new row (section 6).
6. **Hints are real but never a free lunch.** Following the news must clearly beat picking at random on how often you win. No item may be a blind rule that makes money at the crowd's prices (section 4).

**Why this order of reading.** The news page reads headline first, in Maroon, and each headline now carries the race and the shape of the hint, so a player who reads only the five headlines has the day's five best hints. The body names the horse and says why. On the race page nothing moves: names and styles, then down the bars, then the odds, and the pace phrase sits in the header he already reads once per race.

**Rejected:**

- **Keep flavor items beside the hints** (two or three a day). Joseph's words were "all of the information". A flavor item on a page of hints reads as a hint that says nothing, which is the complaint. The jokes stay, inside the hints.
- **News about the next race only.** The fields, styles and posts for all eight races are known at day start (the draw is from the day seed), and only prices are limited to r and r + 1. A whole-card page is what a program prints, and it lets him plan which races to bet.
- **Ranked order on the page (strongest hint at the top).** Strength ranking decides which five print and which one is the cover line. Race order on the page makes each item findable by race.
- **Printing each horse's total, or a rating column.** It would answer "who is best" before he reads anything, adds a column to a page he asked to keep simple, and makes the class items redundant. The news does the sum for the races where it matters.
- **Numbers for chance or strength anywhere** ("a 3-to-1 shot on paper", "30 percent better"). Banned by the brief and by UI1. Words only, and only directional ones.
- **"Speed duel: the leaders will tire" items.** Joseph's own trainer copy hints at it, and it is the most natural racing line, but book-signals measured it false: front-runners in a crowd win what their stats say. The crowded-lead item talks only about closers.
- **A "form" item (won yesterday, won earlier today, running fresh).** Measured false. Never printed.

## 2. The rule, applied to everything the book prints

A line passes when all three hold: (a) it is true for this horse, race or day, (b) a bettor who believes it moves toward the measured result, not away, (c) it is about how a race comes out, or it is a label (a title, a date, a page name) that makes no claim at all.

| thing | today | verdict | after |
|---|---|---|---|
| Cover masthead, title, dateline, race count | labels | **stays** (a label makes no claim) | unchanged |
| Cover line | news item 1's headline (a joke) | **changes** | the headline of the highest-priority item printed (section 3.4), with its race prefix |
| News title "Rail Talk" | label | **stays** | |
| News subtitle "Gossip, facts and peanuts." | label with a joke | **changes** to say what the page is | "Pace, class and peanuts." |
| Flavor items (11) | no information | **go** from the news. Kept in data, unused, until Joseph says where they live (question 2) | |
| Today's card fact | identical every day, and "1 1/4 miles" invites the false stamina-for-distance read | **goes** | |
| Running in two races fact | predicts nothing (second starts, book-signals Q5) | **goes**. Its useful part, that the same horse meets two different fields, becomes the "easier crowd" kind | |
| Yesterday's longest price | predicts nothing (Q6) | **goes**, and with it the session record of the previous day | |
| Race page: post, name, style, three bars, odds | true | **stays** | |
| Race page header L4 bias phrase ("playing fair") | same on every race; posts do matter | **changes** to the pace phrase (section 6) | "Dirt, fast, 3 up front" |
| Blurb | style at best, a few point the wrong way | **changes**, 36 of 40 (section 5) | |
| State lines ("The crowd is still betting.", "Prices later", "Winner: #5") | labels and facts | **stay** | |

Words that may never appear in the book, because each hints at something measured false or at a certainty (added to the news list and applied to blurbs too, whole word, case-insensitive): due, tired, tire, tires, tiring, fade, fades, fresh, rested, bounce, streak, in form, on form, stayer, goes long, distance, wire to wire, can't lose, guaranteed, cinch, banker, best bet, value, overlay, odds-on, percent, and the character "%".

Existing news bans. All five stay:
- **favorite:** the news never knows prices, and there is still no favorite treatment anywhere.
- **tip:** the news states what is true about a race. A tip is a tout telling you what to bet.
- **pick:** the news never selects a horse for you. Choosing is the player's job, weighed against the price.
- **lock** and **sure thing:** these claim certainty, which is still banned.

The ban on hints is the part that goes, not the words: section 4's "facts never hint at a chance" line is removed. Every other existing ban (injury words, "Official", "$", betting.json's money words) stays.

## 3. The news

### 3.1 Terms (all computed from the day's draw and `stable.json`, at day start)

- **total** = speed + stamina + kick.
- **rank** = a horse's place in its field by total, 1 = highest. Ties share the better rank.
- **lead** = the top horse's total minus the mean total of all eight in the field (itself included). This is book-signals' definition (signals-9.mjs), not the rivals' mean.
- **gap** = top total minus second total.
- **fronts** = the number of front-runners in the field.
- **rivals' mean** = the mean total of the other seven in that field.
- **top closer / top stalker** = the closer or stalker with the highest total in the field. Ties go to the lower post.

### 3.2 The seven kinds

Every threshold lives in `book.json` under `news.kinds` and can be tuned without code. "Measured" quotes book-signals. "Untested" means the combination was not measured and the harness must confirm it (section 4).

| # | kind | trigger | names | why it is true |
|---|---|---|---|---|
| K1 | **Lone speed** | fronts = 1, and that front-runner's rank ≤ 4 | the race, the front-runner | Measured: a lone front-runner beats its stats by about 30 percent (+0.26 log-odds), at every speed level. The rank limit is mine, so the hint never sends him to a 2 percent horse (untested as a combination) |
| K2 | **Class above** | the top horse has a unique top total, lead ≥ 26 and gap ≥ 9 | the race, the top horse | Measured: that cell wins 45.8 percent (n 1,129), the strongest single group in the book |
| K3 | **Crowded lead** | fronts ≥ 4, and the top closer's rank ≤ 4 | the race, the count, the top closer | Measured: closers beat their stats by about 12 percent with four front-runners, 16 to 19 percent with five or more. Rank limit mine (untested) |
| K4 | **Easier crowd** | a horse runs twice, the rivals' means of its two races differ by ≥ 6, and its rank in the softer race ≤ 3 | the softer race, the horse | Measured: each point of rival strength multiplies a horse's chance by about 0.93, so 6 points is about 1.5x in the softer race. It is about the field, never the start: the softer race may be the first or the second |
| K5 | **No speed** | fronts = 0, and the top stalker's rank ≤ 4 | the race, the top stalker | Measured: stalkers beat their stats by about 12 percent with no front-runner (n 417), closers lose about 13. Rare: about 1 race in 40 |
| K6 | **Draw** | a front-runner with rank ≤ 3, in a field with fronts ≥ 2, drawn in post 1 or 2 (inside) or post 7 or 8 (wide) | the race, the horse, the post | Measured: front-runners gain +0.09 and +0.08 in posts 1 and 2 and lose 0.08 and 0.13 in 7 and 8 (stat-adjusted). Small, so it ranks low. Fields with one front-runner are K1's |
| K7 | **Top on the numbers** | the field has a unique top total and K2 did not fire for it | the race, the top horse | Measured: the top total wins 36.7 percent, 2.9x the base. The fallback that keeps the page full and true |

Not a kind, on purpose: anything about a second start, yesterday's or today's winners, speed duels costing the leaders, stamina at the distance, a lone closer or a lone stalker (book-signals: lone closer is nothing, lone stalker is a small negative and would read backwards in print), balanced horses beating their stats ("treat as a hint, not a fact").

### 3.3 Expected frequency (from book-signals' race counts, per 8-race day)

K1 about 1.0 races a day before the rank limit. K2 about 2.3. K3 about 2.2 before the closer limit. K5 about 0.2. K4: most days several horses qualify (24 of 40 run twice). K6: about 1 to 2. K7: every race with a unique top total (98.6 percent of races). So a day with fewer than five hints cannot happen while K7 exists, and a day with no pace or class item is the dull case: five K7 items, still true.

### 3.4 Filling the five slots

1. Build every candidate: each kind, each race (and for K4 each qualifying horse).
2. **Priority** (fixed in data): K1, K2, K3 with fronts ≥ 5, K4, K3 with fronts = 4, K5, K6 inside, K6 wide, K7. Why this order: things the bars cannot show come first (the pace edge, the field), the class item ranks high because it is the strongest group, the post is small, and K7 says what a careful reader of the bars already knows.
3. **Inside a kind:** K1 by the front-runner's total, K2 and K7 by lead, K3 by fronts then the closer's total, K4 by the rivals' difference, K5 by the stalker's total, K6 by post (1, 2, 8, 7) then total. Then the earlier race, then the lower post.
4. **Take greedily** down the list, skipping any candidate whose race already has an item, until five are taken. At most two items of one kind, except K7, which is the filler and has no cap.
5. **Print in race order.** The first one taken (the highest priority) is the cover line.
6. **Fewer than five**, only possible with fewer than five races or ties at the top in most races: print what there is. The empty slots stay blank paper. No filler line is invented.

The page is computed once per day from the day seed and is the same every time it is opened that day (it is printed). Items about races already run stay on the page (question 3).

### 3.5 Wording

- Headline: `Race {r}: {headline}`, at most 30 characters, so a headline from data is at most 22.
- Body: one template per wording, wrapped to two lines of 30, as today. The loader fills every body with every one of the 40 stable names (8 to 18 characters), every race number and post, and fails with the key if a third line is needed. A short name can break the wrap as easily as a long one, because it changes where line 1 ends.
- **Writing a body that wraps for every name** (added 2026-11-15, after two pairs failed at load). Use one of two shapes. (A) The name first, then a tail of at most 30 characters: the whole name always fits on line 1, so line 2 is part of the tail. (B) A lead of at most 30 characters, then the name, then a tail, where the 18-character name plus the tail is at most 30: the lead always fits on line 1, so line 2 is at most the name and the tail. A body in neither shape must be checked by hand against all 40 names.
- **Which wording:** one draw on the `news` stream per printed item picks the headline and body pair (they are written as pairs). A pair already used that day is skipped. No other stream is drawn.
- Fills: `{name}`, `{r}`, `{k}` (fronts as a word: "Four", "Five", "Six", "Seven", from data), `{post}`, `{soft}` (the softer race).

Sample pairs, as they wrap with the longest name, so the voice can be judged:

**K1 Lone speed**
1. **Race {r}: one wants the lead** / Only Mint Julep Lawsuit wants / the lead. The bugler approves.
2. **Race {r}: nobody to argue with** / Mint Julep Lawsuit is the lone / speed. Better than its bars.
3. **Race {r}: a lead for one** / No rival for the lead. Mint / Julep Lawsuit likes that.

**K2 Class above**
1. **Race {r}: a class above** / No one here is close to Mint / Julep Lawsuit on paper.
2. **Race {r}: add up the bars** / `Add up the bars. Well ahead: {name}.` (shape B: lead 26) / Add up the bars. Well ahead: / Mint Julep Lawsuit. *Reworded 2026-11-15: "Add up the bars. {name} comes out well ahead." needed a third line for Biscuit Emergency and Medium Everything.*
3. **Race {r}: best by a lot** / Mint Julep Lawsuit has the / most in the bars, by a lot.
4. **Race {r}: a cut above** / `The regular added it twice: {name}, by plenty.` (B: lead 27, name and tail 30) / The regular added it twice: / Mint Julep Lawsuit, by plenty.
5. **Race {r}: class of the race** / `{name} is the class here. Ask anyone.` (A: tail 30) / Mint Julep Lawsuit is the / class here. Ask anyone.
6. **Race {r}: nobody near on paper** / `Even the pigeons see it: {name}, clear.` (B: lead 24, name and tail 26) / Even the pigeons see it: Mint / Julep Lawsuit, clear.

**K3 Crowded lead**
1. **Race {r}: {k} want the lead** / Closers like a busy front. / Mint Julep Lawsuit tops them.
2. **Race {r}: a crowd up front** / A busy lead helps closers. Top / one here: Mint Julep Lawsuit.
3. **Race {r}: traffic up front** / The snack cart says closers. / Top closer: Mint Julep Lawsuit

**K4 Easier crowd**
1. **Race {soft}: an easier crowd** / Mint Julep Lawsuit runs twice. / Race 6 is the easier field.
2. **Race {soft}: softer company** / Two starts for Mint Julep / Lawsuit. Race 6 is kinder.
3. **Race {soft}: kinder rivals** / Race 6 is the easier of Mint / Julep Lawsuit's two.
4. **Race {soft}: the kinder of two** / `{name}: two races. This one's softer.` (A: tail 29) / Mint Julep Lawsuit: two races. / This one's softer.
5. **Race {soft}: a gentler bunch** / `{name} runs two. Fewer bigwigs here.` (A: tail 28) / Mint Julep Lawsuit runs two. / Fewer bigwigs here.
6. **Race {soft}: lighter company** / `{name} has the lighter field of two.` (A: tail 29) / Mint Julep Lawsuit has the / lighter field of two.

**K5 No speed**
1. **Race {r}: nobody wants the lead** / Stalkers set the pace, and / Mint Julep Lawsuit tops them.
2. **Race {r}: no speed at all** / No early speed suits stalkers. / Top one: Mint Julep Lawsuit.
3. **Race {r}: who goes first?** / Someone has to go first. Top / stalker: Mint Julep Lawsuit.

**K6 Draw, inside**
1. **Race {r}: drawn on the inside** / Post 1 for Mint Julep Lawsuit. / Inside suits its speed.
2. **Race {r}: a handy draw** / Mint Julep Lawsuit starts from / post 1. Handy for speed.
3. **Race {r}: inside and quick** / Inside post for Mint Julep / Lawsuit. Small help to speed.

**K6 Draw, wide**
1. **Race {r}: drawn wide** / Post 8 for Mint Julep Lawsuit. / A long way round for speed.
2. **Race {r}: a long way round** / Mint Julep Lawsuit drew wide, / post 8. Speed minds it a bit.
3. **Race {r}: parked out wide** / Mint Julep Lawsuit starts from / post 8. A long trip for speed.
4. **Race {r}: outside looking in** / `{name}, post {post}: a bit of extra ground.` (A: tail 30) / Mint Julep Lawsuit, post 8: a / bit of extra ground.
5. **Race {r}: far from the rail** / `{name} is in post {post}. Costs a little.` (A: tail 28) / Mint Julep Lawsuit is in post / 8. Costs a little.
6. **Race {r}: the outside seats** / `{name}: post {post}, small cost, nice view.` (A: tail 29) / Mint Julep Lawsuit: post 8, / small cost, nice view.

Every K6 wide line says the draw costs the horse a little and nothing more. None says to avoid it: a front-runner drawn wide still wins about 22 percent (section 13, ruling 3).

**K7 Top on the numbers**
1. **Race {r}: tops on the numbers** / On paper, Mint Julep Lawsuit. / Paper has been wrong before.
2. **Race {r}: most in the bars** / `Add the three bars. Top here: {name}.` (B: lead 29) / Add the three bars. Top here: / Mint Julep Lawsuit. *Reworded 2026-11-15: "Add the three bars: {name} is top here." needed a third line for Unsolicited Advice.*
3. **Race {r}: best sum here** / Sum the bars and Mint Julep / Lawsuit comes out on top.

Voice rules for writers adding pairs: the hint is in the first clause, the joke is a person or a thing at the track, never the horse. Hedges are fine ("Paper has been wrong before"). Certainty words are not. A K3 line is about closers and never says the leaders will tire. A K4 line is about the field and never about the horse being fresh or busy. K6 lines say "a bit", "small" or "handy": the effect is small and the copy says so.

### 3.6 Wireframe (an illustrative day, the fields not checked against a real seed)

```
x 8                                                               247
y   4  Rail Talk                                      Day #12345
   14  Pace, class and peanuts.
   24  -------------------------------------------------------------
   30  Race 2: one wants the lead                                       K1, also the cover line
   40  Only Biscuit Emergency wants
   50  the lead. The bugler approves.
   66  Race 3: a class above                                            K2
   76  No one here is close to
   86  Paddock Gossip on paper.
  102  Race 5: five want the lead                                       K3
  112  Closers like a busy front.
  122  Late Checkout tops them.
  138  Race 6: an easier crowd                                         K4
  148  Smoke Alarm Chirp runs twice.
  158  Race 6 is the easier field.
  174  Race 8: tops on the numbers                                      K7
  184  On paper, Long Story Longer.
  194  Paper has been wrong before.
  210  -------------------------------------------------------------
  226  < Cover                Esc: close                 Race 1 >
```

Layout, pitch, colors and the running foot are the approved news page's, unchanged.

## 4. How strong a hint may be

**Answer:** I designed to your working ruling with one sharpening, because "beat picking at random" means two different things here and one of the kinds passes one and fails the other.

- **Every item must point at a horse that wins clearly more often than random.** Gate, per kind, over the harness: the named horse's true chance is at least 1.5x the 12.5 percent base (18.75 percent), and for K1, K3, K5 and K6 the stat-adjusted edge has the measured sign. A kind that misses gets its rank limit tightened in data (for example K3 from rank ≤ 4 to ≤ 3), never its wording loosened.
- **No item may be a money-making blind rule.** Gate: betting $2 on every horse a kind names returns under $1.00 per dollar at the crowd's prices, for each kind and for all kinds together. That is the harness's existing invariant.
- **The news as a whole should beat random on money too:** betting every named horse should return more than the 0.804 that random betting returns. Expected from the measurements (top total 0.848, closers with five front-runners 0.951), not yet measured.
- **One kind will lose more money than random, on purpose: K1.** The crowd already leans against front-runners in its prices (front-runners return 0.732 per dollar as a group, and the lone front-runner 0.733). So "back the lone speed" wins more often than random and pays worse. I keep it: it is the clearest case of the skill you described, a true hint the price has already eaten. K6 inside will likely look the same, for the same reason.
- **The risk the other way is K3.** Closers behind five front-runners are already the best blind rule measured (-0.05 per dollar), and K3 names the strongest closer in those fields. That subset could go above zero. If the harness shows it, the lever is not the copy: either tighten K3 to name only the race and no horse, or move the crowd's style lean (a game-rule change, yours to approve).

**New harness checks** (blind rules, "bet $2 on the horse the news names, every time"): one rule per kind (K1 to K7, K3 split at four and five-plus, K6 split inside and wide) and one for every named horse. Each reports: starts, true chance, stats-only prediction, actual wins, return per dollar at the crowd's price. These run on the cached 500 days and need no new simulation.

## 5. The blurbs

### 5.1 Rule

Each blurb alludes truthfully to at least two of: the horse's **class in this stable**, its **best stat**, its **style**. Class is required at the two ends:

- **Top tier** (total 235 or more, the ten highest: 18 to 48 percent) must read as a contender: "top class", "best", "classy", "good".
- **Bottom tier** (total 209 or less, the ten lowest: 0.9 to 4.4 percent) must say, kindly, that it rarely wins: "rarely", "few wins", "a little". Never mocked: the joke is the name's world (receipts, pigeons, sweaters), not the horse.
- **Middle tiers** allude to the best stat or style without promising a result. Words like "decent", "at times", "mid-pack", "results vary".
- **Best stat** is the stat with the highest standing in the stable (its z-score against the stable's mean and spread). Stamina may be called "lungs" and nothing about distance.
- Never: arrival or winning promises for horses that rarely win ("There it is", "First to every crumb"), staying or distance words, anything about rest, form or a second start.

Limit: **28 characters**, the limit the code enforces (`MAX_BLURB_CHARS` in `src/data/bettingSchema.ts` and `BLURB_CHARS` in `src/data/raceDaySchema.ts`), not the 30 in the brief. The footer fits 30, so 28 leaves a margin the code already tests. Names do not change.

### 5.2 All forty

Stats are speed / stamina / kick. Win percent is book-signals' mean true chance (rank of 40 in brackets). "Kept" means the current line already passes the rule.

| id | name | style | S/St/K | total | win % | current | new | chars | alludes to |
|---|---|---|---|---|---|---|---|---|---|
| s01 | Hold My Oats | Front | 94/76/81 | 251 | 35.6 (2) | Wants the lead and a snack. | Top class. Fastest of all. | 26 | top class; speed 94 is the stable's highest |
| s02 | Paddock Gossip | Stalker | 83/84/85 | 252 | 47.6 (1) | Knows everyone's business. | Best in the barn. Tells all. | 28 | best horse in the stable |
| s03 | Sock In The Dryer | Closer | 73/90/87 | 250 | 32.7 (3) | Turns up late, still warm. | Top class. Late, still warm. | 28 | top class; closer |
| s04 | Ten Items Or Less | Front | 92/70/75 | 237 | 19.9 (9) | Express lane, no exceptions. | Fast and good. Express only. | 28 | speed 92; top tier; front |
| s05 | Legally A Horse | Stalker | 78/82/77 | 237 | 25.6 (7) | Papers say horse. We agree. | Papers say good horse. True. | 28 | top tier |
| s06 | Burgoo Weather | Closer | 67/88/80 | 235 | 18.4 (11) | Low heat, long simmer. | Long simmer. Good stew, too. | 28 | closer, stamina 88; top tier |
| s07 | Goat Is In Charge | Front | 93/77/71 | 241 | 24.6 (8) | Goat said go. So, go. | Goat said go. Goat is good. | 27 | front; top tier |
| s08 | Smoke Alarm Chirp | Stalker | 78/76/88 | 242 | 29.6 (5) | Quiet, quiet, then BEEP. | Best kick in the barn. BEEP. | 28 | kick 88, the stable's highest; top tier |
| s09 | Long Story Longer | Closer | 72/92/84 | 248 | 29.0 (6) | Has a lot more to say. | Top class. Lots more to say. | 28 | top class; closer, stamina 92 |
| s10 | Biscuit Emergency | Front | 93/77/73 | 243 | 29.9 (4) | Leaves early for the buffet. | Fast, classy, buffet-bound. | 27 | speed 93; top tier |
| s11 | Circling Back | Stalker | 71/71/85 | 227 | 12.0 (15) | Will follow up shortly. | Big kick. Will follow up. | 25 | kick 85 (4th in stable); no promise |
| s12 | Lost The Remote | Closer | 61/80/78 | 219 | 9.4 (19) | Stop looking. There it is. | Found late, now and then. | 25 | closer; middle class |
| s13 | Derby Hat Budget | Front | 89/71/66 | 226 | 11.7 (16) | Dressed for the front row. | Quick off. Hat is midsize. | 26 | speed 89; middle class (the hat) |
| s14 | Ran Out Of Names | Stalker | 75/73/68 | 216 | 6.3 (25) | Was almost called Steve. | Almost Steve. Wins at times. | 28 | lower middle class |
| s15 | Scenic Route | Closer | 58/80/72 | 210 | 4.9 (27) | Saw the whole backstretch. | **kept** | 26 | closer, back of the field, modest |
| s16 | Running Joke | Front | 85/69/77 | 231 | 14.6 (13) | Starts before you're ready. | Quick. Starts before you do. | 28 | speed 85; front |
| s17 | Take A Number | Stalker | 70/71/77 | 218 | 7.3 (24) | Waits its turn. Mostly. | Waits its turn. Kicks a bit. | 28 | stalker; kick 77 its best |
| s18 | Hay Is For Horses | Closer | 58/79/73 | 210 | 4.7 (28) | Eats well, goes long. | Eats well. Wins some days. | 26 | lower class; drops the false "goes long" |
| s19 | Post Time Panic | Front | 82/63/66 | 211 | 3.9 (30) | Out the door, keys inside. | **kept** | 26 | front, and a muddle (modest) |
| s20 | Polite Applause | Stalker | 73/73/69 | 215 | 6.0 (26) | Applauds the pace, quietly. | Mostly claps for the winner. | 28 | lower class, kindly |
| s21 | Late Checkout | Closer | 60/78/80 | 218 | 10.8 (17) | Asks for one more hour. | One more hour. Decent kick. | 27 | closer; kick 80 |
| s22 | Porch Light On | Front | 87/71/74 | 232 | 17.6 (12) | Keeps the light on for you. | Quick, and better than fair. | 28 | speed 87; upper middle. Fixes the backwards read |
| s23 | Bring A Sweater | Stalker | 69/69/72 | 210 | 3.7 (31) | Has a scarf. Just in case. | Rarely first. Always cozy. | 26 | low class, kindly |
| s24 | Left On Read | Closer | 63/71/79 | 213 | 7.9 (21) | Typing... still typing... | Typing... then a fair kick. | 27 | closer; kick 79 its best |
| s25 | Mayor Of Turn Two | Front | 86/69/67 | 222 | 8.7 (20) | Waves at everyone, early. | Fast early. Mayor, not king. | 28 | speed; middle class (fixes "Mayor" reading as important) |
| s26 | Mint Julep Lawsuit | Stalker | 75/74/69 | 218 | 7.5 (23) | Sweet, cold, and litigious. | Litigious. Mid-pack, mostly. | 28 | stalker; middle class |
| s27 | Unexpected Banjo | Closer | 62/82/80 | 224 | 13.2 (14) | Joins in on the last verse. | Joins late. Good lungs, too. | 28 | closer; stamina 82 |
| s28 | Reply All | Front | 85/73/65 | 223 | 9.6 (18) | Cc's the entire grandstand. | Replies fast. Results vary. | 27 | speed 85; middle class |
| s29 | Understudy | Stalker | 77/75/67 | 219 | 7.8 (22) | Knows the lead's lines. | Knows the lines. Seldom on. | 27 | sits behind; seldom wins |
| s30 | Decaf By Mistake | Closer | 69/77/84 | 230 | 19.2 (10) | Wakes up at the far turn. | Wakes up late. Kicks hard. | 26 | closer; kick 84 |
| s31 | Parking Lot Pigeon | Front | 76/61/63 | 200 | 1.3 (39) | First to every crumb. | Early to crumbs. Few wins. | 26 | front; low class (drops "first") |
| s32 | Group Project | Stalker | 68/69/61 | 198 | 1.5 (37) | Made the title slide. | **kept** | 21 | contributes little (low class) |
| s33 | Extra Long Receipt | Closer | 59/73/68 | 200 | 1.7 (36) | Prints for a full furlong. | Prints a lot. Wins a little. | 28 | low class (drops the stamina claim) |
| s34 | Unsolicited Advice | Front | 73/67/61 | 201 | 1.8 (35) | Chimes in right away. | Early opinions. Rare wins. | 26 | front; low class |
| s35 | Medium Everything | Stalker | 65/65/64 | 194 | 0.9 (40) | Orders the usual. Again. | Less than medium. Very kind. | 28 | the stable's lowest, kindly. Corrects the name |
| s36 | Saved It For Later | Closer | 57/72/73 | 202 | 2.9 (33) | Unwraps it in the stretch. | Saves it. Still saving it. | 26 | closer; low class (drops the promise) |
| s37 | Doorbell Ditch | Front | 76/64/59 | 199 | 1.4 (38) | Rings once and runs. | **kept** | 20 | front, little behind it (stamina 64) |
| s38 | Gravy Subpoena | Stalker | 69/68/72 | 209 | 3.1 (32) | Served papers to the leader. | Serves papers. Rarely a win. | 28 | low class (drops "catches the leader") |
| s39 | Mostly Legs | Closer | 59/78/72 | 209 | 4.4 (29) | The rest is mostly lungs. | Lots of lungs, few wins. | 24 | stamina 78 its best; low class |
| s40 | Big Plans Monday | Front | 71/70/60 | 201 | 1.9 (34) | Agenda item one: the lead. | Plans big. Wins small. | 22 | low class |

**36 changed, 4 kept** (s15, s19, s32, s37).

## 6. Race page and window

**Race page, header L4.** Today: "{Surface}, {going}, {bias phrase}", and the bias phrase is "playing fair" for every race in today's data. Change: when the race's bias is fair, the third part is the **pace phrase** from the field's front-runner count. When a race has a real bias (none today), L4 stays as it is, and the pace phrase is not shown (question 4).

| fronts | phrase | example L4 |
|---|---|---|
| 0 | none up front | Dirt, fast, none up front |
| 1 to 7 | {k} up front | Dirt, fast, 1 up front |

Why a count and not a verdict ("lone speed", "hot pace"): the count is the fact that was measured, it matches the "Front" word in the style column so he can check it by eye, and the news says what it means for the races where it matters. At most 13 characters, inside the 13 the bias phrases already use, so L4 stays within 30 ("Dirt, sloppy, none up front" is 27). Ink, no color. `aria-live` reads L4 with the race line.

**Not changed:** the entries, the bars, the odds column, the footer. No total column, no rank mark, no "news" icon on the page (rejected in section 1). **The window:** no change. Approved: post, name and odds only.

## 7. States

| state | what shows |
|---|---|
| A normal day | five items, race order, cover line = highest-priority item |
| A day with no pace or class item | five K7 items in race order; the cover line is the first K7 by lead |
| Fewer than five candidates (fewer races, or ties at the top) | the items there are; empty slots are blank paper; cover line from the first; with none, the cover line is blank and the news page shows its title and subtitle only |
| A race already run | its item stays, unchanged (the page is printed) |
| A hint that "loses" (the named horse runs fourth) | nothing. No item claims a result, and the Result page never refers back to the news |
| Field smaller than eight | the terms work on any field size; K6's wide posts are the field's last two |
| Bias is not fair | L4 shows the bias phrase as today; no pace phrase |
| Prices pending, prices later | unchanged. The news never depends on prices |
| Data error | a template over two lines, a headline over 22 after the prefix, a banned word, or a fill the loader cannot make fails at load with the file and key |
| Permission denied | not applicable: offline, one player |

**When the "model" is wrong.** The news uses no model output. It is rules on stats, styles and posts, true on average across thousands of races, and stated as tendencies, never results. The estimate and the prices never feed it. If a kind turns out weaker or reversed after a sim change, the harness check fails, and the fix is the kind's thresholds in data or removing it from the priority list, not rewording. If Joseph reads a line as overselling, he cuts or rewrites the pair in data (NU8).

**Accessibility:** unchanged from the approved book. `aria-live` reads every headline and body in order. The race prefix makes each item understandable alone. No meaning is carried by color: the pace phrase is words, the headlines are Maroon titles as before.

## 8. Copy

| key | text | field | longest |
|---|---|---|---|
| book.news.subtitle | Pace, class and peanuts. | x8, 30 | 24 |
| book.news.prefix | Race {r}: | before every headline | 8 |
| book.news.kinds.{K}.pairs[].headline | section 3.5 | 22, so 30 with the prefix | "nobody wants the lead", 21 |
| book.news.kinds.{K}.pairs[].body | section 3.5 | 2 lines of 30 after wrap, filled with an 18-character name | 60 |
| book.news.count | One ... Seven (fronts as a word) | inside headlines | 5 |
| book.cover.line | the first-priority item's prefixed headline | centered, 30 | 30 |
| book.race.pace.none | none up front | L4 third part, 13 | 13 |
| book.race.pace.some | {k} up front | L4 third part, 13 | 10 |
| stable.horses[].blurb | section 5.2 | footer L1, 28 | 28 |

Removed: `news.facts` (card, double, longest) and the `flavor` slots. The flavor list may stay in data unused (question 2).

## 9. Acceptance criteria

These replace NW2, NW4 and NW5 and amend BB2 in book-and-window.md.

### News
- **NU1 [T]** Same day seed, same news: same items, same order, same wording. Wording draws only from the `news` stream. Race 1's field, race seed, estimate seeds and crowd dollars are unchanged by the news (DT2, golden test as NW1).
- **NU2 [T]** Each kind fires exactly when its trigger in section 3.2 holds, on hand-built fields: K1 at one front-runner of rank 4 and not rank 5; K2 at lead 26 and gap 9, not at 25.9 or 8; K3 at four front-runners and not three; K4 at a difference of 6 and not 5.9, naming the softer race whether first or second; K5 at none; K6 at posts 1, 2, 7 and 8 and never 3 to 6, and never with one front-runner; K7 only where K2 did not fire and the top total is unique.
- **NU3 [T]** Selection follows section 3.4: priority, the within-kind order, one item per race, at most two of a kind except K7, five when five exist, race order on the page, cover line equal to the first taken.
- **NU4 [T]** Every pair, filled with every stable name, race number, post and count, fits: headline with prefix at most 30, body at most 2 lines of 30. No word from any banned list, including section 2's new list, whole word, case-insensitive.
- **NU5 [T]** The news never reads the estimate or the prices, and prints no number but race numbers and posts. A test runs it with the estimate module absent.
- **NU6 [T]** No item mentions a second start's effect, a previous result, or a front-runner's cost from a crowded lead: no kind reads results, and no template contains the banned words.
- **NU7 [T]** Harness, the new blind rules in section 4: every kind's named horses have a true chance of at least 18.75 percent, K1, K3, K5 and K6 show their measured sign against the stats-only fit, and every kind and the whole set return under $1.00 per dollar. The report is filed in book-signals.md's style before the build ships.
- **NU8 [E]** Joseph reads five days of news. Each item reads as true and useful, none reads as a certainty or a tip, none is at a horse's expense, and some make him smile. Lines he dislikes are cut in data.
- **NU9 [E]** Gate: two days. Joseph notes whether he read the news before betting, whether he bet a horse the news named and at what price, and whether a hint ever felt like it pointed the wrong way.

### Race page
- **NU10 [T]** With a fair bias, L4 is "{Surface}, {going}, {pace phrase}" with the field's front-runner count; with any other bias, L4 is as today. L4 is at most 30. BB2 now excludes L4's third part as well as L1's right slot.

### Blurbs
- **NU11 [T]** Every blurb is at most 28 characters, non-empty, unique in the stable, and contains no banned word.
- **NU12 [E]** Each blurb matches its row in section 5.2's "alludes to": the top ten read as contenders, the bottom ten read as rarely winning and kindly, none promises arrival.

## 10. New data and schema fields (one list, all ask-first)

1. **`book.json`, schema change:** `news.kinds` (per kind: trigger thresholds, rank limits, posts, priority place, cap, and the headline and body pairs), `news.priority` (the order in 3.4), `news.prefix`, `news.count` (the number words), the new subtitle, `news.slots` reduced to a count of five, `news.facts` removed, the flavor list kept unused or removed (question 2), section 2's words added to `news.bannedWords`.
2. **`book.json` or `raceDay.json`, new copy:** `race.pace.none` and `race.pace.some`, and the rule that the pace phrase replaces the fair-bias phrase on L4.
3. **`stable.json`, data only:** 36 blurbs per section 5.2. No schema change.
4. **The blurb ban list:** section 2's false-hint words checked on `stable.json` blurbs at load (a new check in the stable loader).
5. **Session, removed:** the previous day's record kept for news slot 5 is no longer needed.
6. **Harness:** the blind rules in section 4, added to the bet harness report. No new dependency.
7. **Tests that change by requirement, not weakened:** NW2, NW4, NW5 and BB2 as listed in section 9, and the news golden test's expected items. The commit says it is Joseph's direction.

No change to `betting.json` values, the crowd's prices, `day.json` or any sim rule.

## 11. Questions for Joseph

1. **What "beat picking at random" means.** On win rate, every hint passes. On money, the lone-speed hint loses more than random, because the crowd already underprices front-runners in its odds. *Recommend: judge each hint on win rate, judge the whole news on money, and keep lone speed as the lesson that a true hint can be priced in.*
2. **The flavor lines.** They leave the news. *Recommend: keep them in data, unused, and give them a home later (the track's lookables or the clerk) when you choose to. Not in this change.*
3. **Late first reads.** The news covers the whole card and does not change during the day, so if you first open the book before race 6, three of the five items may be about races already run. *Recommend: leave it. The day starts at the track and you usually read before race 1. If it bothers you at the gate, the fix is to choose the five from races not yet run when the book is first opened.*
4. **The pace phrase on the race page**, in place of "playing fair". *Recommend: yes. It is one phrase, it is the fact behind three of the news kinds, and "playing fair" is slightly untrue while inside posts are better.*
5. **If K3 (closers behind a crowded lead) returns above zero** in the harness. *Recommend: name the race and not the horse, rather than change the crowd's prices.*
6. **Blurbs that state class** make the stable's pecking order easy to learn in a few days, which was the "will the book get read" worry in book-and-window.md. *Recommend: yes anyway. The news is the part that changes daily, and it now carries the weight.*
7. **"Medium Everything" is the weakest horse in the stable.** Its name says average and names do not change. *Recommend: keep the name; the new blurb ("Less than medium. Very kind.") corrects it.*
8. **The banned words.** *Recommend: keep favorite, tip, pick, lock and sure thing, and add section 2's list. The news now hints, but it still never chooses for you or promises anything.*

## 12. Least sure

1. **The combined triggers.** K1's rank limit, K3's closer limit, K4's rank limit and K6's rank limit combine two measured facts in ways the measurement did not test. I expect each to pass NU7, but that is not shown until the harness runs.
2. **The humor.** Fact items with a person in the second clause are drier than "Pigeons hold the good seats". NU8 is the test, and more pairs in data are cheap.
3. **Repetition.** Three pairs per kind, with K7 printing most days, will repeat within a week. Five pairs per kind is the next step if NU8 says so.
4. **Race order against strength order on the page.** I chose findability. If Joseph reads only the top item, strength order would serve him better.
5. **"Top class" blurbs and the K2 item on the same horse** may say the same thing twice on a day it fires. Acceptable, since both are true, but it may read as padding.

## 13. Rulings after the measurement (2026-11-15)

Made by the main session on the playtester's numbers ("News kinds (2026-11-15)" in `docs/specs/book-signals.md`, 500 cached days). They win over sections 3 and 4 where they differ.

1. **K3, crowded lead, fires at five or more front-runners only.** At exactly four the closer's edge over its stats is +0.022 with an error of 0.019, which is nothing, so a line saying closers like it would not be true. At five or more it is +0.085. A field of four front-runners prints no pace item, and the race page's "4 up front" still shows the count.
2. **K3 keeps naming the top closer.** Betting it blindly returns 0.988 per dollar (error 0.033), under 1.00 on the measurement but not by a clear margin. It is the most useful line in the news and it stays, with a harness check on it (ruling 6). If that check ever reads above 1.00, the line names the race and no horse, as section 4 says.
3. **K6 inside is dropped.** The edge is about 1 percent, too small to print as news. **K6 wide stays**: a front-runner drawn in the last two posts is about 11 percent worse off than its bars say, which is true and worth knowing. Its wording must only say the draw costs it something. It never says to avoid the horse, which still wins 22 percent.
4. **K7 is rare, not the filler.** It printed 22 times in 500 days, because the easier-crowd and class items fill the slots first. No day had fewer than five items. Section 3.3's frequencies and the "five K7 items" state are corrected by this ruling.
5. **K1, K2, K4 and K5 stand as specified.** K5 passes on the true chance (38 percent) and has too few real races to say more (102 in 500 days).
6. **Harness checks:** one blind rule per kind, "bet the horse the news names" (K1, K2, K3, K4, K5, K7), and one for every horse the printed news names. Each must return below zero per dollar, as every blind rule must. The whole news must also beat picking at random. Measured today: the printed news returns -0.143 per dollar against random's -0.196 on the same days.
7. **The blurbs in section 5 are not applied yet.** Joseph approved the current blurbs line by line, and the rewrite trades some of their humor for plain class words. They wait for his read.
   **Decided by Joseph, 2026-11-15: "the mix".** The second-pass column of section 14 ships for every horse it covers except s39, which takes section 5's line with the rest of the weakest ten. 27 blurbs change and 13 of the approved originals stay: nine that section 14 gave back (s03, s04, s06, s09, s10, s16, s21, s27, s30) and the four section 5 kept (s15, s19, s32, s37).

## 14. Blurbs, a second pass (2026-11-15)

Written by the designer after ruling 13.7. This gives Joseph a second column to choose from for the 36 blurbs section 5 changed. The four it kept (s15, s19, s32, s37) are not repeated.

**The rule for this column.** The joke comes first and carries the truth. Where the stat bars beside the blurb already show a horse's class, the blurb does not have to say it with a label. It only has to never contradict it. So section 5.1's "top tier must read as a contender" becomes "must not read as weak", and the bottom tier still has to read, kindly, as rarely winning, because a joke about a 1 percent horse that says nothing about winning reads as a promise. Everything else in 5.1 holds: true, kind, never at the horse's expense, no banned or false-hint word, at most 28 characters.

Where a currently approved blurb already passes that rule, this column gives it back unchanged ("original"), since Joseph has already approved it. "As section 5" means section 5's line already puts the joke first.

| id | name | section 5 | second pass | chars | truth carried in the joke |
|---|---|---|---|---|---|
| s01 | Hold My Oats | Top class. Fastest of all. | Fastest here. Then a snack. | 27 | speed 94 is the stable's top, so it is the fastest in any field |
| s02 | Paddock Gossip | Best in the barn. Tells all. | Knows all. Beats most. | 22 | the best horse in the stable (47.6 percent), told as gossip |
| s03 | Sock In The Dryer | Top class. Late, still warm. | Turns up late, still warm. (original) | 26 | closer; the bars show the class |
| s04 | Ten Items Or Less | Fast and good. Express only. | Express lane, no exceptions. (original) | 28 | front, speed 92 |
| s05 | Legally A Horse | Papers say good horse. True. | as section 5 | | |
| s06 | Burgoo Weather | Long simmer. Good stew, too. | Low heat, long simmer. (original) | 22 | closer, stamina 88 |
| s07 | Goat Is In Charge | Goat said go. Goat is good. | as section 5 | | |
| s08 | Smoke Alarm Chirp | Best kick in the barn. BEEP. | Loudest BEEP in the barn. | 25 | kick 88, the stable's best. Drops the original's late-closer read |
| s09 | Long Story Longer | Top class. Lots more to say. | Has a lot more to say. (original) | 22 | closer, stamina 92 (the stable's best) |
| s10 | Biscuit Emergency | Fast, classy, buffet-bound. | Leaves early for the buffet. (original) | 28 | front |
| s11 | Circling Back | Big kick. Will follow up. | Will follow up, firmly. | 22 | kick 85 in "firmly". Still a little closer-like for a stalker, a judgement call |
| s12 | Lost The Remote | Found late, now and then. | as section 5 | | |
| s13 | Derby Hat Budget | Quick off. Hat is midsize. | as section 5 | | |
| s14 | Ran Out Of Names | Almost Steve. Wins at times. | as section 5 | | |
| s16 | Running Joke | Quick. Starts before you do. | Starts before you're ready. (original) | 27 | front |
| s17 | Take A Number | Waits its turn. Kicks a bit. | as section 5 | | |
| s18 | Hay Is For Horses | Eats well. Wins some days. | as section 5 | | |
| s20 | Polite Applause | Mostly claps for the winner. | as section 5 | | |
| s21 | Late Checkout | One more hour. Decent kick. | Asks for one more hour. (original) | 23 | closer |
| s22 | Porch Light On | Quick, and better than fair. | Porch light on, out front. | 25 | front. Fixes the original's backwards "waits for you" read |
| s23 | Bring A Sweater | Rarely first. Always cozy. | as section 5 | | |
| s24 | Left On Read | Typing... then a fair kick. | as section 5 | | |
| s25 | Mayor Of Turn Two | Fast early. Mayor, not king. | as section 5 | | |
| s26 | Mint Julep Lawsuit | Litigious. Mid-pack, mostly. | as section 5 | | |
| s27 | Unexpected Banjo | Joins late. Good lungs, too. | Joins in on the last verse. (original) | 27 | closer |
| s28 | Reply All | Replies fast. Results vary. | as section 5 | | |
| s29 | Understudy | Knows the lines. Seldom on. | as section 5 | | |
| s30 | Decaf By Mistake | Wakes up late. Kicks hard. | Wakes up at the far turn. (original) | 25 | closer |
| s31 | Parking Lot Pigeon | Early to crumbs. Few wins. | as section 5 | | |
| s33 | Extra Long Receipt | Prints a lot. Wins a little. | as section 5 | | |
| s34 | Unsolicited Advice | Early opinions. Rare wins. | as section 5 | | |
| s35 | Medium Everything | Less than medium. Very kind. | as section 5 | | |
| s36 | Saved It For Later | Saves it. Still saving it. | as section 5 | | |
| s38 | Gravy Subpoena | Serves papers. Rarely a win. | as section 5 | | |
| s39 | Mostly Legs | Lots of lungs, few wins. | The rest is mostly lungs. (original) | 25 | stamina 78, its best. Bottom tier, but it promises nothing |
| s40 | Big Plans Monday | Plans big. Wins small. | as section 5 | | |

**Count:** 15 of the 36 get a second version: 10 are the approved originals given back (s03, s04, s06, s09, s10, s16, s21, s27, s30, s39) and 5 are new (s01, s02, s08, s11, s22). The other 21 already put the joke first and read as section 5. The originals that were false or misleading (s08's closer read, s12, s18, s22, s31, s33, s35, s36, s38 by book-signals Q8) are not offered back.

**My recommendation:** take the second-pass column for the top and middle tiers, and section 5 for the bottom ten (s39 included). The bars already show the stronger horses' class, so the joke can do the work there. At the bottom, the bars do not stop a joke from reading as a promise, so the plain "few wins" has to stay.
