# M1 spec: race simulation core

Status: draft for Joseph's review. Written 2026-11-11. Covers the sim half of M1 only. The race view, race-day screens and result screen are specced separately by the designer after DESIGN.md is approved.

## Goal

A headless, seeded, deterministic race simulation in pure TypeScript under `src/sim/` that runs one hardcoded 8-horse card at Churchill Downs over 1 1/4 miles on dirt and produces a result and a replay that a later renderer can play back. It is for Joseph, a solo developer whose M1 gate is "ten races in a row still make you care who wins".

## Non-goals

None of these are built in M1. If any shows up in the diff, it is out of scope.

- All rendering, the race-day screens, the result screen and the photo-finish still. The sim only supplies the data.
- Betting, odds, morning line, favorites (M3).
- Fitness, fatigue, training, trainers, the "Horse stats" system with hidden values and scouting (M2).
- Pedigree and genetics (M6). Jockey skill ratings (M2). Jockeys appear only if the card needs a display name, see open question 7.
- Stewards' inquiry and disqualification (M7). M1 records bumps so M7 can use them later, and does nothing else with them.
- The calendar, entries, class tiers, the AI horse pool, saves, the debug panel.
- Surface and going as a full system (M5). M1 reads going from the race data and applies it simply, see B8.
- Falls, injuries, pulling up, or any horse failing to finish. Not now, not as a rare case.

## Words used here

- **Inputs:** the track, the race, the field (each horse's stats, running style, post and instructions), tuning, and a seed. Plain data passed in. The sim reads no files, clock or globals.
- **Result:** the plain data the sim returns, described in "Output shape".
- **Serialized:** `JSON.stringify` of the result with no extra arguments.
- **Starting guess:** a number Joseph has not confirmed. Every tuning number in this spec is one.

## Milestones

M1 sim ships in six steps. Each leaves the repo green and can merge on its own.

1. **M1.1 RNG and streams.** The seeded generator, named streams, and the lint bans that protect determinism.
2. **M1.2 Data and validation.** Track, race, card and tuning as JSON under `src/data/`, with validation. Needs the dependency answer in open question 2.
3. **M1.3 Race model and output.** Stats, style, post, distance, going, pace and the full output shape including replay. Instructions and luck events exist in the shape but are inert.
4. **M1.4 Instructions and track bias.**
5. **M1.5 Luck events.** Blocked, steadied, bumped.
6. **M1.6 Batch runner and fairness and drama checks.** Only if Joseph says yes to open question 1.

## Acceptance criteria

### M1.1 RNG and streams

- **R1.** The seed is a whole number from 0 to 4294967295. Any other value (negative, fraction, NaN, string, too large) is rejected with an error that names the seed. Seeds 0 and 4294967295 work.
- **R2.** A stream is identified by the race seed, a stream name, and an optional sub-key (for example a horse id). Its sequence depends only on those three things, never on how many other streams exist, the order streams were created, or how many draws other streams made.
- **R3. Known answers.** A test pins the first 10 outputs of at least three streams (two names, one with a sub-key) for a fixed seed. If the generator or the way streams are derived changes, this test fails. The generator chosen gets two lines in DECISIONS.md.
- **R4. Independence.** A test draws 100 values from stream A in a fresh registry. In a second registry it first creates streams B and a test-only name that no system uses, draws 1,000 values from each, then draws 100 from A. The two lists of 100 are identical. A third registry creates the same streams in reverse order and gets the same lists.
- **R5. Sub-keys.** Per-horse streams for horses 1 to 8 give the same sequences whether or not a ninth horse's stream exists.
- **R6.** Stream names live in one list in one module. A test fails if any two names in it are the same.
- **R7. Lint bans under `src/sim/`.** Each of these is a lint error, checked by a test in the style of the existing `src/simBoundary.test.ts`: `Math.random`, `Date`, `performance`, `crypto`, `setTimeout` and `setInterval`, and the `Math` functions whose results JavaScript does not guarantee to be the same on every engine (`exp`, `expm1`, `log` and its variants, `pow`, `sin`, `cos`, `tan` and their inverse and hyperbolic forms, `cbrt`, `hypot`), plus the `**` operator. `Math.sqrt`, `floor`, `ceil`, `round`, `trunc`, `abs`, `min`, `max`, `sign` and `fround` stay allowed because their results are exact. The existing Phaser rule and its test keep passing, so the new bans must be added alongside the current `no-restricted-syntax` selector, not replace it.

### M1.2 Data and validation

- **V1.** These live in `src/data/` as JSON: the track (Churchill Downs, its geometry), the race (distance 10 furlongs, dirt, going, track bias), the card (8 horses), and sim tuning. No real track, race or venue name appears in any file under `src/sim/`. A test reads the real names out of the data files and fails if any of them appears in `src/sim/` source.
- **V2.** Track geometry (main track length, where the turns and the stretch are relative to this race's start and finish, run-up) comes from a cited primary source such as Churchill Downs' own published track facts, noted in the data file or DECISIONS.md. If no primary source is found, the values are marked starting guess and the gap is noted.
- **V3.** Every tuning value is marked as starting guess or confirmed. How it is marked is the engineer's call. A test fails if any tuning value has no mark.
- **V4.** Validation rejects, with a message naming the file and the field: a stat out of range, an unknown running style, an unknown instruction, two horses on the same post, a post outside 1 to field size, duplicate horse ids or names, a horse name over 18 characters, a going that does not belong to the surface (for example firm on dirt), a field smaller than 2 or larger than 20, and a missing tuning value. Each case has a test.
- **V5.** The shipped data files pass validation, tested.
- **V6. The card.** 8 fictional horses. Names are 18 characters or fewer, unique, and are not the names of real notable racehorses (at minimum, none of the 13 Triple Crown winners). The card mixes running styles, at least two of each. Stats are spread so the card is competitive, which M1.6 checks (F5). Card contents are data and expected to change during tuning.

### M1.3 Race model and output

**Inputs the model uses in M1.3.** Stats, running style, post, distance, going, track geometry, and the seed. The stat set is the smallest that makes a race: speed (top cruising speed), stamina (how long speed holds before fading, so it matters more at longer distances), and kick (how much and how fast a horse gains when asked late). Running style (front-runner, stalker, closer) is the fourth. All four are on a range from tuning, starting guess whole numbers 1 to 100. See open question 3 for how this meets M2's stat system.

**Determinism.**

- **S1.** Running the same inputs and seed twice in one process gives byte-identical serialized results.
- **S2.** Running race A, then race B, then race A again in one process gives the same bytes for both A runs. Nothing carries over between races.
- **S3.** The sim does not change its inputs. A test passes deep-frozen inputs and the sim does not throw.
- **S4.** Listing the field in a different order, with the same posts, gives byte-identical results.
- **S5. Golden results.** A test-only frozen copy of the card, race, track and tuning lives with the tests, so tuning changes in `src/data/` do not break it. Serialized results for at least 5 fixed seeds are committed. The test compares against them. It passes on Joseph's Mac and in CI on Linux, which is what "across machines" means for M1 (see open question 10 for browsers). A PR that changes these files must say why in its description, and must bump the sim version in the result.

**Output shape.** One plain object that survives `JSON.parse(JSON.stringify(result))` deep-equal. No class instances, functions, `Map`, `Set`, `undefined`, `NaN` or `Infinity` anywhere. The shape is complete from M1.3, so later steps fill lists rather than add fields.

- **O1. Header:** sim version, seed, and an echo of every input, so a result describes itself.
- **O2. Finish order:** every horse, places 1 to N, no gaps, no repeats. Every horse finishes. See open question 8 on dead heats. If two horses are exactly level at the wire, the order still comes out strict and the same every run.
- **O3. Final times** for every horse in hundredths of a second, as whole numbers of hundredths. Times never decrease down the order. Two adjacent horses may share the same hundredths.
- **O4. Margins.** For each horse after the first: its margin to the horse ahead, and its total beaten lengths to the winner. A margin is how far the trailing horse is behind at the moment the horse ahead reaches the wire, in lengths, with the length of a horse from tuning (starting guess 8 feet). Each margin has a numeric value and a label. Labels and their bounds are tuning, starting guess:

  | Margin (lengths) | Label |
  |---|---|
  | under 0.10 | nose |
  | 0.10 to under 0.20 | head |
  | 0.20 to under 0.375 | neck |
  | 0.375 to under 10 | nearest quarter, shown as 1/2, 3/4, 1, 1 1/4 and so on |
  | 10 or more | nearest whole length |

  A test covers each boundary on both sides. Beaten lengths to the winner equal the sum of the margins above, within rounding.
- **O5. Photo finish:** a true or false flag, true when the margin between first and second is under a tuning threshold (starting guess 0.25 lengths). Exactly at the threshold is false.
- **O6. Fractions and calls:** the leader's time at each quarter mile and the final time, and every horse's running position and lengths behind the leader at each furlong pole. These match the replay.
- **O7. Pace label:** hot, honest or slow, judged from the leader's half-mile fraction against par values in tuning by distance and going (starting guess for 10 furlongs on fast dirt: hot under 46.00 seconds, slow over 48.00).
- **O8. Replay.** Samples at a fixed step of race time from tuning (starting guess 0.1 seconds), from the gate opening (time 0) until the last horse finishes. Each sample has, per horse, distance run along the course and lateral lane (0 is the rail, maximum from tuning). The unit for distance is the engineer's call, recorded in DECISIONS.md, and is part of the contract with the renderer. The replay also holds:
  - a **wire frame**: every horse's distance and lane at the exact moment the winner reaches the wire, for the photo-finish still;
  - each horse's exact finish moment;
  - the **events list** (empty until M1.5): type, horse, other horse for a bump, and the race time it happened.
- **O9. Replay sanity, tested over 500 seeds (starting guess):** each horse's distance never goes down between samples; no horse moves faster than a ceiling from tuning between two samples; lanes stay within bounds; the replay finish moments and the result's times agree to the hundredth; in the wire frame no horse is ahead of the winner. The rest of the wire frame's order does not have to match the finish order, because horses behind the winner can still pass each other before they reach the wire (decided 2026-11-12 after the first build showed this in 28 percent of races).

**Behaviors.** Each runs over many seeds in `npm test` with a fixed seed range, so results do not flake. Starting guess: 500 seeds per check, with a tolerance in tuning. If M1.6 is approved, the same checks also run at 10,000 seeds in the batch runner.

- **B1. Strength matters, but does not decide.** On a field of 8 equal horses, raising one horse's speed by 10 points raises its win share above 1 in 8 by more than tolerance. Same for stamina at 10 furlongs. A horse 10 points better than the field in every stat still loses at least some races.
- **B2. Stamina matters more at a distance.** The win-share gain from a stamina edge is larger at 10 furlongs than at 6 furlongs. The sim runs any distance from 5 to 12 furlongs without error, though M1 only ships 10.
- **B3. Kick shows late.** A horse with a kick edge gains more positions between the quarter pole and the wire, on average, than an equal horse without one.
- **B4. Styles look like styles.** At the first call (quarter mile), front-runners average a better running position than stalkers, and stalkers better than closers. From the quarter pole to the wire, closers gain the most positions on average.
- **B5. Pace comes from the field.** A field with three front-runners is labeled hot more often than one with a single front-runner. See open question 4.
- **B6. A hot pace helps closers.** Over many seeds, closers win a larger share of races labeled hot than of races labeled slow, and front-runners the reverse.
- **B7. Ground matters.** A horse that runs wider through the turns covers more ground and finishes worse on average than one saving ground, all else equal. On a neutral track with equal horses, post position stays within the fairness tolerance (F2). See open question 5.
- **B8. Going.** Winning times on sloppy and muddy are slower on average than on fast, by an amount set in tuning per going. Going does not favor any horse in M1, because going aptitude is not in the stat set.
- **B9. Realistic clock.** On fast dirt over 10 furlongs with the shipped card, the median winning time falls in a band from tuning (starting guess 1:59.50 to 2:05.00, to be checked against real Derby charts).

### M1.4 Instructions and track bias

Each horse takes three instruction slots, every one optional. See open question 11.
- early: default, or **rate early**
- move: default, **make a move at the 3/8 pole**, or **save it for the stretch**
- path: default, or **stay inside**

- **I1. Off means unchanged.** With every instruction at default and a neutral bias, results are byte-identical to the M1.3 golden files. This is the proof that adding a system does not shift old races.
- **I2. Rate early:** the horse's average running position at the first call is worse than the same horse with no instruction, and its average gain from the quarter pole to the wire is larger.
- **I3. Move at the 3/8 pole:** the horse's average gain in positions between the 3/8 pole and the quarter pole is larger than with no instruction. Its gain does not start before the 3/8 pole.
- **I4. Save it for the stretch:** its late gain is concentrated after the quarter pole, more than with no instruction or with the 3/8 move. Against a hot pace, it wins more often than the 3/8 move for the same closer.
- **I5. Stay inside:** the horse's average lane through the turns is closer to the rail and it covers less ground than with no instruction. From M1.5 on, it is also blocked more often.
- **I6. Track bias.** The race data sets a lane bias (neutral, inside, outside) and a style bias (neutral, speed, closers), strengths in tuning. With inside bias, horses that run closer to the rail win more than on neutral. With speed bias, front-runners win more than on neutral. Neutral changes nothing (I1).
- **I7.** Any combination of the three slots is valid, including a front-runner told to rate early.

### M1.5 Luck events

Only three event types exist: blocked, steadied, bumped. Validation and the output shape allow no other. No event stops a horse, removes it, or harms it. Each draws from its own named stream.

- **L1. Off means unchanged.** With luck rates set to zero in tuning, results are byte-identical to the M1.4 golden files.
- **L2. Rare.** Over many seeds with the shipped card, the share of races with at least one event falls in a band from tuning (starting guess 25 to 45 percent), and no race has more than a cap from tuning (starting guess 3).
- **L3. Events fit the race.** At a blocked or steadied event, another horse is ahead of the affected horse in nearly the same lane within a distance from tuning. At a bump, the two horses are side by side and in adjacent lanes. Checked against the replay at the event's time.
- **L4. Events cost something, not everything.** Horses with an event finish worse on average than the same horse without one, and still win sometimes (more than zero wins over the batch).
- **L5.** Events happen only after the gate opens and before that horse finishes. Each event's time falls inside the replay.

### M1.6 Batch runner and checks (pending open question 1)

- **F1.** One command runs N races headless (N and the seed range as arguments) and prints a plain-text summary. It writes no files except where told to. It is not part of `npm test` and not a nightly job.
- **F2. Post fairness.** 10,000 races of 8 identical horses, identical style, neutral track, default instructions: each post's win share is within a tolerance of 12.5 percent (starting guess plus or minus 2.5 points).
- **F3. Style fairness.** 10,000 races of identical-stat horses with styles rotated across posts, neutral track: each style's win share per horse is within the same tolerance of 12.5 percent. Hot-pace races may favor closers (B6). The average over all paces must not.
- **F4. Drama, shipped card, 10,000 seeds**, all bands starting guesses in tuning: winning margin of a length or less in 30 to 60 percent of races; photo finishes in 5 to 15 percent; the leader at the 1/8 pole loses in 25 to 50 percent.
- **F5. Competitive card.** Every horse on the shipped card wins at least 3 percent of seeds and none wins more than 35 percent.
- **F6.** A failed band prints which check failed with the measured value. It is a tuning flag for playtester, not a build failure.

### Compute and time budget

- **T1. Race time is real time.** The result's clock reads like a real 10-furlong race, about two minutes (B9). The sim does not speed itself up for playback.
- **T2. Playback is the renderer's job.** The brief caps sim plus animation at 90 seconds for a Derby-length race. A two-minute race played at real speed breaks that, so the renderer plays the replay faster than real time (at least about 1.4 times, more if gate loading or a post parade is shown). This spec sets no playback speed, see open question 9. The headless sim takes no part in the 90 seconds beyond T3.
- **T3. Compute, starting guess:** one race with replay, run headless in Node on Joseph's Mac, median under 20 ms and never over 100 ms across 500 seeds. If M1.6 lands, 10,000 races finish in under 5 minutes. Measured numbers go in docs/PERF.md, never estimates.

## Edge cases and states that can happen

- Two horses level in hundredths, or exactly level at the wire: strict, repeatable order (O2, O3).
- Margin exactly on a label boundary or exactly on the photo threshold (O4, O5).
- All eight horses identical, or all front-runners (F2, B5).
- A front-runner told to rate early, or a closer told to stay inside (I7).
- A horse blocked while on "stay inside", or bumped in the last furlong before it finishes (L3, L5).
- A horse with an event that still wins (L4).
- Seeds at 0 and 4294967295 (R1). Field of 2 and field of 20 run without error, though only 8 ships.
- Sloppy or muddy going on the same card (B8).
- Invalid data or input: rejected with a named field, never a partial result (V4, R1).

## Dependencies and order

1. M1.1, then M1.2, then M1.3. M1.4 and M1.5 go in that order because each one's "off means unchanged" test compares against the step before. M1.6 last.
2. **Schema library, ask-first.** The brief asks for content JSON validated by schemas, zod or similar. zod is a new dependency and needs Joseph's approval before M1.2. If he says no, the fallback is hand-written validators in plain TypeScript with the same rules and the same tests in V4. They cost more code and are easier to let drift from the types, so the tests carry more weight.
3. Importing JSON may need a TypeScript setting change in `tsconfig.json`. That is a config change, not a new dependency.
4. The designer's race view and result screen specs depend on the M1.3 output shape. Lock it at M1.3 and share it with the designer before the renderer starts.
5. Track geometry needs a primary source (V2) before M1.3 can be tuned honestly. M1.3 can be built on marked guesses.
6. Opus for the model work, per CLAUDE.md. code-reviewer and test-writer check each step.

## What is locked and what will change

Locked once Joseph approves: the seed range; streams keyed by name and sub-key, never by order; stream names are never renamed (renaming changes old races); the determinism definition and the lint bans; inputs passed in as plain data; the three luck event types and the welfare rule; the result shape, which from M1.3 on grows only by adding fields; race time in real seconds.

Likely to change: every tuning number, the card itself, the margin label table, the drama bands, the replay step, the stat set when M2 lands, going and surface handling in M5, jockeys in M2, and the golden files each time the model changes on purpose.

## Answers to the open questions

Decided 2026-11-11 by the lead session. Joseph delegated all of them ("You decide all"). Any of these can be reopened by him. The numbers match the questions below.

1. **Batch runner:** yes. M1.6 is built, run by hand, not nightly.
2. **Validation:** zod. The brief names it, so it is the one new dependency M1 adds.
3. **Stats:** speed, stamina, kick and running style only. Temperament waits for M2, because in M1 it would add a rule before there is a horse the player cares about. M2 extends these four and does not replace them.
4. **Pace:** it comes from the field and is reported. No forced-pace input in M1.
5. **Post position:** as specced. A neutral track is fair within tolerance, and posts matter through track bias and ground lost on turns.
6. **The race:** not the Kentucky Derby. A fictional 10-furlong stakes at Churchill Downs, with its name in data. The Derby has 20 starters and its own milestone (M7).
7. **Jockeys:** the card carries fictional jockey names for display only, with no stats.
8. **Dead heats:** none in M1. The order is always strict.
9. **Playback speed:** accepted. The race clock reads real time and the renderer plays it back faster. The designer picks the speed.
10. **Browser determinism:** not proven in M1. Node on the Mac and on CI Linux is the bar. Revisit when the debug panel can force a seed in the browser.
11. **Instruction slots:** the three slots as specced. The on-screen word for "no instruction" is the designer's call.
12. **Goings:** the shipped race is fast. The model still reads going from data. Going slows every horse by the same share, so over many seeds it favors no horse (B8). The same seed on a different going is a different race, and that is fine.

Added 2026-11-12 after the first build and its tests:

- **Seed counts.** Post and style fairness (B7, F2, F3) need 2,000 seeds in `npm test`, because one post's share moves about 1.5 points at 500 seeds and the band is 2.5. The other behavior checks stay at 500.
- **B7 and front-runners.** The paired post test holds for stalkers and closers. For front-runners it does not yet, see "Known gap" in docs/DECISIONS.md. It is retested in M1.4 with "stay inside".
- **B7 and front-runners, settled after M1.4.** The cause is the speed duel, not missing ground cost: a rail front-runner in a field of front-runners is pressed for longer and spends more. That is honest racing, so the model stays. The front-runner ground check uses a lone front-runner among stalkers and closers, where post 8 does cost it, and "stay inside" must save it ground and time.
- **Instruction balance waits for the tuning pass.** After M1.4, "rate early" is close to a free upgrade for front-runners, and the 3/8 move is rarely better than no instruction. Both trace to how hard the lead is taxed in the default model. They get tuned once, with the M1.6 batch runner, and the saved reference results are regenerated on purpose then. The M1 gate does not pass until each instruction is a real choice.
- **I3 and I4 are about horses that come from off the pace.** The tests assert them for stalkers and closers. A front-runner near the lead has few places to gain, so a late-move instruction does little for it or hurts it. Whether the game should even offer those instructions to a front-runner is the designer's call.
- **Closers bias follows where a horse runs, not its style label.** On a field of equal horses the stalkers can take the gain instead of the closers. On the shipped card the closers do gain. Left as is.
- **Luck, settled after M1.5.** A luck rate is the chance a horse is unlucky in that way today. It becomes an event only if the race then puts the horse in the matching situation within a short window. `SIM_VERSION` is 2 from this step. The reference results come in two sets from the same frozen inputs: luck rates at zero (the model alone) and luck on. `luck.events` is required by validation whenever a luck rate is above zero.
- **Added to the tuning pass list:** a bump in the first seconds of a race can help a front-runner, because it drops out of the speed duel and saves energy. It is the same lead-tax cause as the "rate early" problem.
- **Tuning groups for instructions and track bias are optional as whole groups** and required when a card or race uses them, so older frozen test inputs stay valid.
- **V1 covers every file under `src/sim/`,** including test data, so the golden inputs use a made-up track and race name.
13. **Length of a horse:** stays 8 feet, a starting guess in tuning.

### Tuning pass targets (added 2026-11-12, after the first 10,000 race measurements)

The playtester measured the sim at commit `ea96466`. Three instructions were not real choices, the lead was taxed even with no duel, and an early bump cost a front-runner nothing. These targets define "a real choice" in numbers. All are starting guesses. Each is measured by changing one horse on the same seeds (4,000 or more), every other horse on default, neutral track unless stated, on both the shipped card and a card of equal horses with styles rotated across posts. "Hot" and "slow" mean the pace label of the same seed run with every horse on default. Changes are in win percentage points.

- **U1. Rate early, front-runners.** Over all races the change is between minus 2 and plus 2 for each front-runner (it was plus 5 to plus 9). It gains in hot races and loses in slow ones, so it is the call when there is other speed in the race and the wrong call when the lead is there for the taking. For stalkers the overall change stays between minus 3 and plus 3. It may stay a loss for closers.
- **U2. The 3/8 move and save it for the stretch, stalkers and closers.** These two are a pair that depends on pace. The 3/8 move gains in slow races and loses in hot ones. Save it for the stretch gains in hot races and loses in slow ones. Over all races each stays between minus 2 and plus 2 for each stalker and closer, and in its good pace it does not make the horse's average finish place worse. I4 still holds (in a hot pace, save it beats the 3/8 move for the same closer), and the mirror now holds too (in a slow pace the 3/8 move beats save it). Both may stay a loss for front-runners.
- **U3. Stay inside.** It saves ground and risks traffic (I5). On a neutral track the change over all races is between minus 1.5 and plus 1.5 for each horse (it was minus 2 to minus 6 for every horse), and it is better from posts 1 to 3 than from posts 6 to 8. On a track with an inside lane bias it gains for every style.
- **U4. The lead.** On equal horses, one front-runner among stalkers and closers wins its fair share, 12.5 percent give or take 0.75, averaged over every post (it was 11.6). With three front-runners in the field each still wins at least 11.25 (it was 10.7), so the duel costs something and the lead alone does not.
- **U5. A bump always costs.** For every running style and every third of the race, a bumped horse's average finish place and beaten lengths are no better than the same seed without the bump. That includes a front-runner bumped in the first tenth of the race, which was gaining about half a length.
- **U6. The shipped card.** F2 to F5 pass at 10,000 seeds on two seed ranges. No running style averages under 11 percent per horse (front-runners were at 10 to 12 with the two highest speed ratings on the card). The card's stats may change to get there.
- **U7. Posts.** Stalkers lose about 0.38 points of win share per post from post 1 to post 8 on a neutral track, and closers about 0.19. Both are inside the fairness band and outside posts do lose ground on the turns, so this stays. It must not get steeper.
- **U8. Nothing else moves.** Every behavior in B1 to B8, I1 to I7 and L1 to L5 still holds, the winner's median time stays between 2:01 and 2:03, and the compute budget is unchanged. The saved reference results are regenerated on purpose and `SIM_VERSION` goes to 3.

A target that cannot be met without breaking another is reported with the numbers, not forced.

#### Where the targets stand after the first pass (2026-11-12, `SIM_VERSION` 3)

Measured by the engineer on seeds 0 to 3999, paired. A per-horse figure carries about 0.6 points of noise over all races and 1 to 1.5 inside one pace label. The playtester re-measures these independently.

- **U1, amended.** On the equal card (three front-runners) rating is within a point of even for each front-runner, gains about 7 in hot races and loses 5 to 8 in slow ones. Met. On the shipped card there are exactly two front-runners, so rating one hands the other a lone lead: it loses 4 to 5 over all races, gains 2.5 to 3.5 in hot ones and loses 7 to 12 in slow ones. That is the choice working as described (wrong when it gives the lead away), so the plus or minus 2 band applies to the equal card only. On any card the direction must hold: better in hot races than in slow ones. Stalkers are between minus 2.8 and plus 3.5.
- **U2, open.** The levels are close: the 3/8 move is in band for every stalker and closer but one (minus 2.3), save it for all but three (plus 2.6 to plus 4.9). The pace pairing is not there. Which of the two pays follows the horse's own reserve when the rider asks, and that reserve barely follows the pace, because horses off the pace are not pulled along by a hot one. This needs a model change and gets its own pass. No test pins U2 until then, apart from I4, which still holds.
- **U3, mostly met.** Neutral track: minus 1.6 to plus 0.3 for 14 of 16 horses, two at minus 1.6 and minus 2.3. Inside bias: every style gains on average, every horse but one (minus 0.1). The test writer's independent runs agree on finish place (every horse on the shipped card gains 0.12 to 0.39 places) but found the closers' win share on the equal card inside the noise of zero (minus 0.6 to plus 0.4 over two 1,000 seed ranges), so the test pins places gained, not win share. Better from inside posts than outside ones holds on the shipped card and not on the equal card (the two differ by less than the noise).
- **U4, met.** 12.98 for the lone front-runner, 12.14 each with three.
- **U5, met.** Every style and third is a cost. The smallest is a front-runner in the first tenth on the equal card, 0.26 lengths.
- **U6, met** without changing the card. Per horse: front-runners 12.5, stalkers 13.3, closers 11.6.
- **U7, met within noise.** Stalkers minus 0.405 per post, closers minus 0.173. Front-runners now lose about 0.22 per post where they were flat, inside F2.
- **U8, met.** Median 2:01.55 on both ranges.

#### Independent re-measure (playtester, 2026-11-12)

Paired runs on seeds 40000 to 47999 (8,000 per card, not the seeds the pass was tuned on) and one batch at seeds 20000 to 29999. Noise is about 0.4 points over all races and 0.8 to 1.2 inside one pace label.

Confirmed: U1 for front-runners on both cards, U4 (13.05 lone, 11.96 each of three), U5 (no style or part of the race where a bump helps on average), U6 (all nine checks pass; front-runners 12.15, stalkers 13.6, closers 11.6 per horse), U7 (stalkers minus 0.353 per post, closers minus 0.190, front-runners minus 0.264), U8 (median 2:01.55).

Still open, all in the early and move orders, for the second pass:

- **The two move orders do not trade by pace (U2).** What decides between them is the horse's own kick and stamina: low kick with good stamina wants save it, high kick wants the 3/8 move or neither, and the best horses lose with either. The pace label and the number of front-runners give almost no signal. For stalkers the pace effect runs the wrong way.
- **The 3/8 move is still never a gain for a stalker** (minus 1.0 to minus 1.9 on both cards, worst in slow races, which is where it should pay).
- **Rate early plus save it is a free upgrade for stalkers.** Plus 6.2 to plus 8.0 on the equal card and positive in every pace label; plus 2.8 to plus 6.5 on the shipped card. The two together pay more than the sum of each alone.
- **Rate early alone is close to free for stalkers on the equal card** (plus 3.2 to plus 3.8, better average place in every pace label).
- **Save it raises a stalker's win share but worsens its average place** (about 0.3 places on the equal card).
- **I4 measured by win share fails for the shipped card's closers in hot races** (save it minus the 3/8 move: minus 0.6, 0.0, 0.0, all inside noise). It holds on the equal card and by the measure the I4 test uses.
- **Stay inside on a neutral track still costs closers** 1.5 to 2 points on the equal card, and on an inside-bias track the equal card's closers gain in place but not in win share.

One rule added by this pass: `instructions.stayInsidePassMarginShare` must be at least `model.traffic.passMarginShare`, or a horse told to stay inside would go around more readily than one that was not. Loading the data fails with a message naming both values if it is lower.

## Open questions (answered above)

1. **Batch runner in M1?** The brief lists only a determinism test for M1 and defers the nightly harness. I recommend a small headless runner in M1 (M1.6), run by hand, not nightly. It is the only honest way to check F2 to F5, playtester needs it after every tuning change, and the M1 gate is about whether races stay interesting, which a 10,000-race summary shows quickly. Without it, the behavior checks still run in `npm test` at 500 seeds with wider tolerances. Open.
2. **zod or hand-written validators?** See dependencies, item 2. Open.
3. **M1 stats versus M2 "Horse stats".** M1 uses speed, stamina, kick and running style only, all visible, no hidden values. Class is field strength and soundness is injury risk, so neither changes a single M1 race. Should temperament join M1, for example so a hot horse sometimes ignores "rate early"? It would add stories and a rule. And when M2 builds the stat system, does it extend these four or replace them? Open.
4. **Pace scenario: input or result?** The brief lists it as an input. This spec makes it come from the field (B5) and reports it (O7), because a forced pace would ignore who is in the race. Should there also be a forced-pace input, for tests or the debug panel later? Open.
5. **Post position should matter, but the harness says no post bias.** This spec treats a neutral track as fair within tolerance (F2), and lets posts matter through track bias (I6) and ground lost on turns. Is that the balance Joseph wants? Open.
6. **What is the M1 race?** The Kentucky Derby by name, or an unnamed 10-furlong stakes at Churchill? The Derby has up to 20 starters and M1 has 8. Open.
7. **Jockeys on the card.** The sim needs none. Should the card carry fictional jockey names for the result screen, with no stats? Open.
8. **Dead heats.** Real racing has them. This spec always gives a strict order. Should a dead heat be a possible result when horses are level at the wire? Open.
9. **Playback speed.** Is it fine that the race clock reads about 2:02 while playback takes 60 to 85 seconds? Open, and partly the designer's.
10. **Same result in the browser?** R7 bans the math that can differ between JavaScript engines, and S5 proves Node on Mac and Linux. Must the browser build (Chrome, Safari, Firefox) also be proven to match, and how, before a debug panel exists? Open.
11. **Instruction slots.** The three slots in M1.4 allow combining "rate early" with a late move and with "stay inside". Is that the set Joseph wants, and is "default" the right word for no instruction? Open.
12. **Which goings ship?** This spec lets the race use any dirt going (fast, good, muddy, sloppy) through data, with times only. Should M1 ship fast only? Open.
13. **Length of a horse.** 8 feet is a starting guess. Charts use more than one convention. Open until a source is chosen.
