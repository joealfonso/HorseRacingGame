# Spec: a simple day of betting

Status: draft for Joseph's review. Written 2026-11-13. It replaces the race-day loop in `docs/specs/m1-race-day.md` (Card, Orders, race, result) with a betting loop, and reuses that spec's race view, photo finish and result page. The sim (`docs/specs/m1-race-sim.md`, `SIM_VERSION` 3) is not changed.

Every number in this spec (money, pool size, takeout, crowd values, run counts, bands, stable size) is a starting guess until Joseph confirms it.

## Goal

A play-money day at the races in the browser: read the program, bet on one horse to win, watch the race, get paid or not, go to the next race. It is for Joseph, who said "let's start with a simple game of betting on horses and save the rest". It is done when a day is playable start to finish and the odds are honest and worth reading.

## Non-goals

If any of these shows up in the diff, it is out of scope.

- Place, show and exotic bets. Morning line. A live tote that changes before post. These are the next steps, not this one.
- Riding orders, the Orders screen, the trainer and the paddock in the loop. They are shelved, not deleted.
- Owning, training, breeding, staff, the farm, the calendar, saves, rivals. "The rest" of the brief.
- Any change to the sim: its model, tuning, streams, result shape or `SIM_VERSION`. The pace redesign stays shelved.
- Other goings, surfaces or track bias than the shipped fast dirt, neutral track.
- Real money in any form (see "Play money only").
- Injuries or anything graphic. The sim has none and none is added.
- The brief's rule that pure betting must not out-earn a good farm. There is no farm yet. It comes back when one exists.

## Words used here

- **Day:** a fixed list of races played in order from one **day seed**.
- **Stable:** the pool of fictional horses that fields are drawn from.
- **Field:** the eight horses in one race, with posts.
- **Estimate:** each horse's chance to win this field, counted from many sim runs of it. Never shown to the player.
- **Crowd:** the simulated bettors whose money makes the odds.
- **Per-dollar price:** what a $1 win ticket returns, stake included, in cents. A "$2 price" is twice it.
- **Cents:** every amount of money in the game is a whole number of cents.

## The loop

1. A day starts with a day seed and the starting bankroll ($100). The day's eight fields are drawn from the day seed.
2. Each race: the program shows the field, each horse's stats and its odds. The player bets one amount on one horse to win, or passes.
3. Go to the post. The stake leaves the bankroll. The race plays in the existing race view. The horse the player bet on is "your horse" (the Yellow marker). With no bet, there is no "your horse".
4. The result page shows the order, the winner's $2 price, what the player's ticket paid and the new bankroll.
5. After the last race, or when the bankroll is below the minimum bet at the start of a race, the day ends on a summary page. "New day" starts a fresh day with the next day seed and the starting bankroll again. Nothing carries over (open question 3).

**One bet per race, on one horse, to win.** More than one horse per race adds a slip with rows and a total, and teaches nothing win bets alone do not. Passing is always allowed and costs nothing. The passed race still plays and can be skipped with the existing keys.

## Odds: how they work

### The estimate

For each race, before its program shows, the field is run through `runRace` N times (starting guess N = 1,000) with every horse on default instructions. A horse's estimate is its wins divided by N.

- **Seeds.** From the day seed, on named streams with the race number as sub-key: `raceSeed` gives the real race's seed, and `estimateSeeds` gives N distinct seeds, skipping any that equal the real race's seed. The real race is never one of its own estimate runs, so the estimate cannot leak the result.
- **Why about 1,000.** At N = 1,000 the standard error of a 30 percent chance is about 1.4 points and of a 5 percent chance about 0.7 points. The crowd's own noise (below) is meant to be much larger than that, so sampling error only adds a little to an error the crowd is supposed to have. The probe (B0) checks this and picks N.
- **Cost.** PERF.md has one sim run at a 1.5 ms median on Joseph's M4 in Node with a quiet machine, and 2.6 to 2.8 ms under load. N = 1,000 is therefore about 1.5 to 3 seconds per race in Node. The browser is not measured yet (B0 does it). This is far over a 16.7 ms frame, so the estimate must never run in one frame: the engineer chooses a worker or work split across frames. Race 1's estimate is computed at the start of the day. Each later race's is computed while the earlier race plays, which takes about a minute at 2x.

### The crowd

The crowd bets a fixed pool (starting guess $25,000) on the field, once, before the program shows. There is no morning line and no money after it. The price the program shows is the price the crowd made.

For each horse, in post order, with values from `betting.json`:

1. `p` = the estimate, floored at `0.5 / N` so a horse that never won in the runs still gets money.
2. `u` = a bell-shaped draw from -1 to 1: the mean of three draws from the `crowd` stream (day seed, sub-key the race number), scaled to -1 to 1. This is the crowd misreading this horse today.
3. Belief `b = p * (1 + noise * u) * (1 + styleLean[style])`. Starting guess: noise 0.25, styleLean front-runner +0.10, stalker 0, closer -0.10 (the public loves early speed, open question 2).
4. Share `s = b / sum(b)`.
5. Crowd share `c = (1 - flatten) * s + flatten / 8`, flatten 0.08. This is the longshot bias of real pools: the crowd reads the order of the field mostly right, but its money is flatter than the truth, so longshots are overbet and favorites a little underbet. It also puts at least 1 percent of the pool on every horse.
6. Dollars: the pool split by `c` in whole dollars by largest remainder, ties to the lower post, every horse at least $1, summing exactly to the pool.

Only `+ - * /` are used, so the result is the same on every JavaScript engine.

**The player's bet joins the pool.** It is added to the pool and to its horse's money before the price is worked out. On the bet screen the price and the payout update as the amount changes, so what the player is told is exactly what is paid. On a $25,000 pool a big bet on a longshot visibly cuts its price, which is how pari-mutuel works (open question 1).

### Payout math, exact in cents

All values whole cents. `takeoutBasisPoints` 1,700 (17 percent), `breakageCents` 10, `minPayoffPerDollarCents` 105.

- `P` = total pool in cents (crowd plus the player's bet).
- `take = floor(P * takeoutBasisPoints / 10000)`. `net = P - take`.
- `W` = cents bet on the winner (crowd plus the player's bet if on it). Always above 0.
- `perDollar = max(minPayoffPerDollarCents, breakageCents * floor(net * 100 / (W * breakageCents)))`.
- The $2 price is `2 * perDollar`. A bet of D whole dollars that wins returns `D * perDollar` cents, stake included.
- Odds shown are the largest tote step at or below `(perDollar - 100) / 100`. Steps, from data: 1-9, 1-5, 2-5, 1-2, 3-5, 4-5, 1-1, 6-5, 7-5, 3-2, 8-5, 9-5, 2-1, 5-2, 3-1, 7-2, 4-1, 9-2, 5-1, 6-1, 7-1, 8-1, 9-1, 10-1, then every whole number to 99-1. Below 1-9 shows "1-9", above 99-1 shows "99-1". The longest display is 4 characters.

**Worked examples** (these are test fixtures, PM1):

| | Pool P | On winner W | net | perDollar | $2 pays | Odds shown |
|---|---|---|---|---|---|---|
| A, favorite | $10,000 | $2,500 | 830,000 | 330 | $6.60 | 2-1 |
| B, longshot | $10,000 | $300 | 830,000 | 2,760 | $55.20 | 26-1 |
| C, minimum | $10,000 | $9,000 | 830,000 | 105 (90 raised) | $2.10 | 1-9 |
| D, exact step | $10,000 | $2,360 | 830,000 | 350 | $7.00 | 5-2 |
| E, player in | $10,020 | $320 | 831,660 | 2,590 | $51.80 | 24-1 |

- A: `take` 170,000. `floor(8,300,000 / 250,000)` = 33.
- B: `floor(8,300,000 / 30,000)` = 276.
- E is B's crowd plus the player's $20 on the same horse: `take = floor(1,002,000 * 1700 / 10000)` = 170,340, `floor(8,316,600 / 32,000)` = 259. The player's $20 returns 20 * 2,590 = 51,800 cents, $518.00. Their bet moved the price from 26-1 to 24-1.

The house keeps the take and the breakage. In play money that is only a number, and it is never shown.

### What makes it a game

The crowd is wrong in two ways a reader can find. Its noise misprices some horses each race, and its style lean (if Joseph keeps it) misprices front-runners and closers on average. Reading the stats against the price should find value. The harness measures four bettors, each betting $2 flat (B3, bands in HN3):

- A random bettor loses 18 to 30 cents per dollar.
- Always the favorite: loses 3 to 15 cents per dollar.
- Always the longest price: loses 25 to 50 cents per dollar.
- A value bettor who knows the estimate, and bets only when estimate times per-dollar price is at least 1.15: wins at least 3 cents per dollar and bets in at least 30 percent of races. It is the ceiling: if a bettor who knows the estimate cannot beat the take, no player can, and betting is a coin flip with a tax.
- The favorite wins 28 to 40 percent of races (the brief: "a bit over a third"), and at least as often as its crowd share says, since favorites are underbet.

## Money and bets

- Stored in cents, whole numbers. Data holds whole dollars and is converted on load.
- Starting bankroll $100. Minimum bet $2. Amounts offered: $2, $5, $10, $20, $50, $100, each only if it is at most the bankroll and at most the cap.
- **Cap:** `max(minimum bet, floor(bankroll * capBasisPoints / 10000))`, cap 2,500 (25 percent). So $100 offers $2 to $20, and any bankroll of $2 or more can still bet $2.
- The stake leaves the bankroll at Go to the post. A winning ticket's return is added at settlement. Screens may not show the new bankroll before the winner crosses the wire in playback.
- **No dead heats, no refunds.** `chart.ts` sorts the finish by time and breaks an exact tie by the lower post, and O2 in the sim spec guarantees a strict order. There are no scratches. The minimum payoff covers a winner the crowd bet so heavily that the net pool cannot pay $1.05. So every bet settles as won or lost.
- If the sim throws, the existing error screen shows. Nothing is saved, so a reload starts a fresh day.

## The stable and the field draw

### The stable (content needed)

40 horses (starting guess), in one new file. Each record: `id`, `name`, `jockey`, `style`, `stats` (speed, stamina, kick), `coat`, `silks` (body, cap), `blurb`. These are the fields `card.json` and `cardLook.json` hold today, in one record.

Rules a writer follows and the loader checks (ST1):
- Names: 18 characters or fewer, unique, not a real notable racehorse (at least none of the 13 Triple Crown winners). A very creative mix of funny and quirky, with no single formula: office deadpan, puns, oddly specific phrases, Kentucky flavor, never one joke shape twice in a row.
- Jockeys: fictional, 22 characters or fewer, one per horse, unique.
- Blurbs: 28 characters or fewer, printable ASCII. Character, never a tip: no prediction, rating or advice, nothing about injury, age or being sent away, no real people, brands or tracks (the rules in `docs/specs/m1-race-day-blurbs.md`).
- Coat: one of the coats the race-day schema allows (today bay, dark bay or brown, chestnut, black). Silks: from the 18 silks colors, at most 3 horses on one body color.
- Styles: at least 12 of each.
- Stats: whole numbers from 1 to 99. **The writer does not choose stats.** The stat lines come from the probe (B0) and are handed over fixed.

**Why the stats need a wider spread than the shipped card.** On `card.json` every horse wins 10 to 17 percent of races (stats 58 to 86). Eight such horses make eight prices from about 4-1 to 7-1, every race. Real favorites win about a third of the time. So the stable needs class: the probe's starting recipe is about a quarter sharp horses (three stats totaling 235 to 255), half solid (210 to 234) and a quarter plain (185 to 209), with front-runners strongest in speed, closers in kick and stamina, stalkers balanced. B0 settles the recipe.

### Drawing a field

Each race's field is drawn from the day seed and the race number on the `fieldDraw` stream. It depends on nothing else: not on bets, not on earlier results. So the whole day's fields are known from the day seed.

- Eight different horses, posts 1 to 8 each used once, post drawn uniformly.
- At most 2 starts per horse per day. A horse that ran in race r runs again no earlier than race r + 3.
- No two horses in a field share a silks body color (the race-day loader's existing rule, now applied per field).
- Horses with fewer starts today come first, so every stable horse runs at least once a day before any runs twice.
- Every horse runs on default instructions. Race conditions come from the day's race list in data: v1 is eight races, each 10 furlongs on fast dirt, neutral track, each with its own fictional race name (open question 5).

How the draw meets these rules is the engineer's call. FD6 proves it never fails.

## What the screens need to show

Information for the designer, not layout. Section 6 of the race-day spec said the screens never show odds or a favorite. That changes as follows.

**Changes:** the program shows each horse's odds. Odds and $2 prices are the crowd's numbers, a market fact, so they may appear on the program, the bet screen, the race HUD and the result. The word "favorite" may appear only as a fact from the odds ("the 2-1 favorite"). The odds column depends on the whole field, so it is the one exception to CD4 (an entry is drawn from that horse alone). The stat bars still follow CD4.

**Does not change:** the screens never show the estimate, a rating, a tip or a "best bet", in any form, including the `aria-live` text. Every word during the race is true at the moment it shows. The bankroll change waits for the wire.

| Screen | Must show |
|---|---|
| Program | Race number of the day ("Race 3 of 8"), race name, track, distance, surface, going, bias line. Per horse: post, name, style, the three stats as today, odds. Footer: focused horse's jockey and blurb. The bankroll. |
| Bet | The horse, the amount (from the offered amounts), the odds and "pays" with the player's bet in the pool, and Pass. A payout is quoted as the total returned, stake included, in the form "$10 to win pays $37.00", never as profit. |
| Race | Which horse carries the bet (the Yellow marker, as "your horse" today) and the bet in the HUD lines where the orders line was ("$10 to win, 5-2"). With no bet: no marker, the camera follows the leader. |
| Result | Order of finish, margins, the winner's $2 win price. The player's ticket: what it paid, or "lost $10", or nothing on a pass. The new bankroll. |
| End of day | Start and end bankroll, the change, bets made, winners hit, best price cashed. "New day". |

States: first race of the day; no bet; won; lost; broke (below $2 at the start of a race, the day ends); last race (the result leads to the end of day). Abandoning a race from the pause box still settles the bet from the race's result.

**Orders and "your horse".** The Orders screen leaves the loop. Its code and tests stay and keep passing. "Your horse" is now the horse you bet on, and only when you bet. The winner's circle trainer, which appears when your horse wins, is shelved with the paddock: the designer decides what the winner's circle shows instead.

## Play money only

The brief: "No real money anywhere. All wagering uses in-game cash, with no payment or real-gambling hookups of any kind." Money in this game is a number in memory. It cannot be bought, sold, saved, sent or exchanged for anything. No purchases, accounts, ads or links out. Checks are SAFE1 to SAFE4.

## Milestones

Each leaves the repo green and can merge alone. B0 decides whether the rest is built.

1. **B0. Feasibility probe.** Headless script. Answers: is the estimate stable at an affordable N, and do fields from a stable give a spread of prices with an honest favorite?
2. **B1. Stable data and the field draw.** Schema, loader, day seeds and streams, the draw. Tested against a fixture stable built from B0's stat lines.
3. **B2. Prices and money.** Estimate, crowd, pari-mutuel math, odds display, bankroll rules, a headless day. No screens.
4. **B3. Day harness.** The four bettors over many simulated days.
5. **B4. The stable written.** 40 horses on B0's stat lines. Data only. Can run beside B2 and B3.
6. **B5. The day on screen.** The designer's screen spec first, then the build. Ends with the playtest gate.

## Acceptance criteria

### B0. Feasibility probe

A script with a fixture stable of 40 stat lines built from the recipe above (names "Probe 01" and so on). Fields drawn from it, 10 furlongs, fast dirt, neutral, all default instructions. Results recorded in DECISIONS.md and PERF.md as measured, never estimated.

- **PB1. Cost.** One `runRace` on a drawn field, 500 runs after warm-up: median and 99th percentile in Node and in Chrome on Joseph's laptop.
- **PB2. Stability.** 200 fields. For N of 250, 500, 1,000 and 2,000, two estimates per field on disjoint seed sets. N passes when the mean absolute difference per horse is at most 1.5 points, the 95th percentile at most 4 points, and the two name the same favorite in at least 90 percent of fields where the favorite leads the second choice by 3 points or more.
- **PB3. Affordable.** The smallest passing N, times the Chrome median, is at most 4 seconds per race.
- **PB4. Spread.** 1,000 fields at that N, crowd at its starting values. The favorite's median odds are between 6-5 and 3-1. At least 20 percent of fields have a favorite at 8-5 or shorter. At least half have a horse at 20-1 or longer. At most 10 percent have every horse between 3-1 and 10-1.
- **PB5. Honest.** Each of those 1,000 races is run on its own race seed. The crowd's favorite wins 28 to 40 percent. Grouped by estimate (under 5, 5 to 10, 10 to 20, 20 to 35, 35 percent and up), each group's actual win rate is within 3 points of its mean estimate.
- **PB6. Preview.** The four bettors' returns on those 1,000 races, reported, not gated.

**Stop rule.** 
- If no N up to 2,000 passes PB2, or the smallest that does fails PB3, stop. Nothing else is built. Report the numbers and the options to Joseph: a cheaper sim run without the replay (a sim code change), fewer runs with smoothing, or prices from a stat formula instead of the sim (cheaper, less honest).
- If PB4 or PB5's favorite band fails, change only the stable's stat recipe and the three crowd values (noise, styleLean, flatten), never sim tuning. At most three rounds, then stop and report.
- PB5's calibration groups failing is a bug, not tuning. Stop and find it.
- On a pass, the stat lines and N are recorded and handed to B1 and B4.

### B1. Stable data and the field draw

- **ST1.** Loading rejects, with the file and field named: duplicate id, name (ignoring case) or jockey; a name over 18 characters or a Triple Crown winner's name; a stat outside 1 to 99; an unknown style, coat or silks color; a blurb over 28 characters or not printable ASCII; a jockey over 22; more than 3 horses on one silks body color; fewer than 12 of a style; a stable too small for the draw (fewer than 8 times 3 horses, or 2 starts each cannot cover 8 races of 8). Each case has a test.
- **ST2.** The shipped stable (from B4) passes. Until B4, the fixture does.
- **DT1. Seeds.** A day seed is a whole number from 0 to 4294967295 (the sim's R1). `?seed=` sets the day seed with the existing rule and error. Without it the app draws one outside `src/sim/` as today. New day uses day seed + 1, wrapping.
- **DT2. Streams.** The betting stream names (`fieldDraw`, `raceSeed`, `estimateSeeds`, `crowd`) are in one list, unique, and none equals a sim stream name. Known answers: for a fixed day seed, a test pins race 1's field (ids by post), its race seed and its first 5 estimate seeds.
- **DT3. Bans.** The betting code imports no Phaser and nothing from `src/render/` or `src/scenes/`, and is under the same lint bans as `src/sim/` (sim R7), checked by a test. Nothing in `src/sim/` imports the betting code.
- **FD1.** Every field has 8 different horses and posts 1 to 8 once each, and passes `validateData` with all instructions default.
- **FD2.** No horse starts more than twice in a day. A horse that ran in race r does not run before race r + 3.
- **FD3.** No field has two horses on one silks body color.
- **FD4.** Every stable horse starts at least once a day.
- **FD5.** Over 10,000 day seeds the draw never fails.
- **FD6.** Over 10,000 day seeds, each style's share of each post is within 2 points of its share of all starts.
- **FD7.** A day's fields and race seeds depend only on the day seed and the stable: the same with different bets, and with races abandoned.

### B2. Prices and money

- **OD1.** The estimate for a race equals wins counted from `runRace` on exactly its estimate seeds, recomputed by the test for one race at a small N.
- **OD2.** A race's seed is never among its estimate seeds, and its estimate seeds are N distinct values. Checked over 1,000 day seeds, every race, at the real N (seed draws only, no sim runs).
- **OD3.** Crowd fixture: for a pinned day seed and a given estimate vector, the crowd dollars per horse match a committed answer. They sum exactly to the pool, each is at least $1, and remainder ties go to the lower post.
- **OD4.** A horse with 0 wins in the estimate still gets crowd money and a price.
- **PM1.** Examples A to E above give exactly the values in the table.
- **PM2.** For random pools: every amount is a whole number of cents; `perDollar` is a multiple of `breakageCents` and at least the minimum; above the minimum it is at most the unrounded price and within one breakage step of it; the total paid to winning tickets never exceeds `net` unless the minimum applied.
- **PM3.** Odds display: per-dollar 105 is "1-9", 190 "4-5", 200 "1-1", 330 "2-1", 350 "5-2", 2,760 "26-1", 10,100 and up "99-1". A value exactly on a step shows that step.
- **BK1.** Offered amounts: bankroll $100 offers $2, $5, $10, $20. $7.40 offers $2. $2.00 offers $2. $1.90 offers nothing and the day ends.
- **BK2.** The "pays" shown for an amount and horse equals what is credited if that horse wins, the bet's own effect on the pool included.
- **BK3.** Over a scripted day (fixed day seed, fixed bets and passes), each race's bankroll is the one before, less the stake, plus the return if it won. Passing changes nothing.
- **BK4.** A race abandoned from the pause box settles exactly as if watched.
- **BK5.** The day ends after the last race, or at the start of any race where the bankroll is below $2.
- **DT4. Determinism.** The same day seed and the same bets give a byte-identical day record (fields, race seeds, estimates, crowd dollars, odds, serialized results, payouts, bankrolls). Run in `npm test` with a small N from test data.
- **DT5. Nothing old moves.** Every existing sim test, golden file and batch check passes unchanged. `SIM_VERSION` stays 3.

### B3. Day harness

- **HN1.** One command runs D days from a seed range headless and prints a plain-text summary. It is not part of `npm test`. playtester runs it after any change to betting rules or data. 500 days finish within 30 minutes on Joseph's Mac (workers are the engineer's call).
- **HN2.** Bettors, each $2 flat, each judged against the crowd pool plus its own bet: random (horse from a harness-only seeded stream); favorite (most crowd money, ties to the lower post); longest (least crowd money, ties to the lower post); value (best estimate times per-dollar, only when that is at least 1.15).
- **HN3.** Bands, all in `betting.json`: return per dollar random -0.30 to -0.18, favorite -0.15 to -0.03, longest -0.50 to -0.25, value at least +0.03 with bets in at least 30 percent of races; favorite wins 28 to 40 percent and at least its average crowd share; the PB4 spread and PB5 calibration checks.
- **HN4.** A band outside its range prints the check and the measured value. It is a tuning flag for playtester, not a build failure.

### B4. The stable written

- **ST3.** 40 horses on B0's stat lines exactly, passing ST1. Joseph picks from candidate names and blurbs, as with the M1 blurbs.

### B5. The day on screen

The designer writes the screen spec from "What the screens need to show". These hold whatever the layout:

- **UI1.** The estimate appears on no screen and in no `aria-live` text.
- **UI2.** Every odds, price, payout and bankroll on screen equals the value the betting code computed for it.
- **UI3.** No screen shows the settled bankroll, or a hint of it, before the winner crosses the wire in playback.
- **UI4.** With no bet, no horse is marked as the player's and the camera follows the leader.
- **UI5.** The program for race r + 1 is ready by the time the player leaves race r's result, in normal play. A day starts within the probe's measured time for one estimate.
- **UI6.** No frame takes over 16.7 ms because of the estimate, on Joseph's laptop (measured in PERF.md).
- **SAFE1.** Runtime dependencies are exactly the approved list (today `phaser` and `zod`). A test fails on any other.
- **SAFE2.** No absolute URL appears in a string or data file under `src/` or in `index.html`. The app requests nothing from any origin but its own.
- **SAFE3.** Nothing about money or the day is written to local storage, IndexedDB or cookies.
- **SAFE4.** No copy in data uses words from a banned list in data: at least deposit, withdraw, cash out, real money, buy, purchase, credit card, payment.
- **GATE [E].** Joseph plays two full days in a row without a reload, with no console errors. He notes per race whether he bet, on which price, and why.

## Edge cases that can happen

- Bankroll at exactly $2, or at $2.10 after a minimum payoff; bankroll with odd cents (BK1).
- A bet big enough to move its horse's price one or more tote steps (example E).
- A horse with no wins in its estimate (OD4). A monster favorite at the minimum payoff (example C).
- Odds exactly on a tote step, below 1-9, above 99-1 (PM3).
- Two horses exactly level at the wire: the lower post wins, no dead heat.
- Passing every race. Going broke in race 2.
- Abandoning a race from pause (BK4). Reloading mid-day: the day is gone; `?seed=` replays the same fields and prices.
- The same horse twice in a day, at least three races apart.

## Dependencies and order

1. B0 first. Nothing after it starts until it passes or Joseph decides after a stop.
2. **Ask first (Joseph):** the new data files and fields below, before B1. No new dependency is needed. The lint config gains the betting folder (a config change).
3. B1, then B2, then B3. B4 starts once B0 hands over the stat lines and runs beside B2 and B3.
4. B5 needs B2, B4 and the designer's screen spec. The race view, photo finish and result page are reused, with the changes above.
5. Opus for B0 and B2 (the estimate and crowd), per CLAUDE.md. code-reviewer and test-writer check each step. playtester runs B3 after every rule or data change.

## New data files and fields (one list, all ask-first)

**`src/data/stable.json`** (new). `horses`: array of `{ id, name, jockey, style, stats: { speed, stamina, kick }, coat, silks: { body, cap }, blurb }`. Bounds in ST1. Not marked: it is content.

**`src/data/day.json`** (new). `races`: array of race objects in the existing `raceSchema` shape (`name`, `track`, `distanceFurlongs`, `surface`, `going`, `trackBias`). Starting guess: 8 races, 10 furlongs, dirt, fast, neutral, fictional names. Real track names only here and in `track.json`.

**`src/data/betting.json`** (new). Every value marked starting guess or confirmed, as in `tuning.json`.

| Field | Unit | Bounds | Starting guess |
|---|---|---|---|
| `bankroll.startDollars` | whole dollars | 2 or more | 100 |
| `bets.minDollars` | whole dollars | 1 or more | 2 |
| `bets.amountsDollars` | whole dollars, rising | each at least min | 2, 5, 10, 20, 50, 100 |
| `bets.capBasisPoints` | share of bankroll | 1 to 10,000 | 2,500 |
| `field.size` | horses | 2 to 8 | 8 |
| `field.maxStartsPerDay` | starts | 1 or more | 2 |
| `field.racesBeforeRerun` | races | 1 or more | 3 (race r, then r + 3) |
| `estimate.runsPerRace` | sim runs | 100 to 5,000 | 1,000 (B0 sets it) |
| `pool.crowdDollars` | whole dollars | 1,000 or more | 25,000 |
| `pool.takeoutBasisPoints` | share | 0 to 5,000 | 1,700 |
| `pool.breakageCents` | cents | 1, 5, 10 or 20 | 10 |
| `pool.minPayoffPerDollarCents` | cents | 100 to 200 | 105 |
| `crowd.noise` | share | 0 to 0.9 | 0.25 |
| `crowd.styleLean` | share per style | -0.5 to 0.5 | +0.10, 0, -0.10 |
| `crowd.flatten` | share | 0 to 0.5 | 0.08 |
| `odds.steps` | `{ label, odds }`, rising | 1-9 first, 99-1 last | the list above |
| `harness.valueThreshold` | ratio | above 1 | 1.15 |
| `harness.bands` | per check | percent or return per dollar | HN3 |
| `copy.bannedWords` | strings | | SAFE4 |

Screen copy for betting goes in `raceDay.json`, defined by the designer's spec, also ask-first.

**Not changed:** `card.json`, `cardLook.json`, `race.json`, `track.json`, `tuning.json`, `schema.ts`. The sim tests and the batch runner keep using them.

## Shelved and not touched

- **Shelved, code and tests kept:** the Orders screen, the trainer and paddock, the per-horse orders in the session, the session record step. Nothing is deleted. Their tests keep passing.
- **Shelved as a plan:** the pace redesign. With every horse on default orders, the known "rate early plus save it" exploit no longer reaches the player.
- **Reused:** the race view and HUD, announcer, photo finish, winner's circle and result page, with the changes in "What the screens need to show".
- **Not touched:** the sim and its tests, `SIM_VERSION` 3, the batch runner, the ceremony beats, DESIGN.md.

## What is locked and what will change

Locked once Joseph approves: play money only; the sim is unchanged; betting stream names (never renamed, only added); fields and race seeds depend only on the day seed; the real race seed is never an estimate seed; money in whole cents; the payout formula's shape (takeout, then breakage down, then the minimum); one win bet per race; the estimate is never shown.

Likely to change: every number in `betting.json`; the stable's stat recipe and its size; N after B0; the crowd's three values; race distances; the harness bands.

## Open questions for Joseph

Ordered by how much they change the build. Each has my recommendation.

1. **Does the player's bet join the pool?** If yes, the price on the bet screen moves as the amount changes, and what is shown is what is paid. If no, the price is fixed and simpler, but it is not really pari-mutuel. *Recommend: yes.*
2. **The crowd's style lean.** A small, steady lean ("the public loves early speed") gives a careful reader something to learn across days. Without it, value comes only from random mispricing, which a player can feel but not learn. *Recommend: yes, at the starting values, and let the harness show it is not a free win.*
3. **Does the bankroll carry from one day to the next?** There are no saves, so a reload ends it either way. *Recommend: no. Every day starts at $100 and the end-of-day page shows how it went.*
4. **The numbers:** $100 start, $2 to $100 bets, 25 percent cap, 8 races a day, 40 horses, a $25,000 crowd pool, 17 percent takeout, dime breakage, $2.10 minimum. *Recommend: accept as starting guesses and tune after the gate.*
5. **Race distances.** All 10 furlongs in v1, or a mix from 6 to 10? A mix makes stamina and speed matter differently by race, but each distance needs its own probe run. *Recommend: all 10 furlongs now, a mix as the first change after the gate, data only.*

**Decided (2026-11-13), by the main session for Joseph.** Joseph chose the three things that shape this spec himself: bet only, win bets only, a new field each race. On the questions above I am going with each recommendation until he says otherwise, since every one is a value in data and cheap to change:

- 1: the player's bet joins the pool.
- 2: the crowd keeps its style lean.
- 3: a fresh starting bankroll each day, nothing carried over.
- 4: the numbers stand as starting guesses.
- 5: every race is 10 furlongs on fast dirt for now.

The three new data files (`stable.json`, `day.json`, `betting.json`) are new schemas, which are ask-first. No existing schema changes. They are not created until B1, after the probe, and Joseph has been told.

## Risks

- **The estimate may cost too much in the browser.** Browser speed is not measured. B0 PB3 finds out before anything else is built.
- **Flat fields.** If the sim does not separate classes enough, prices bunch at 4-1 to 8-1 and there is nothing to read. B0 PB4 finds out, and the recipe gets three tries.
- **A learnable edge can become a solved game.** If the value bettor wins far more than its band, the lean or noise is too big. HN3 caps it from both sides.
- **Browser and Node may differ.** The sim spec never proved browser determinism (its question 10). The harness numbers come from Node. A `?seed=` day in the browser should match Node, and nothing proves it yet.
