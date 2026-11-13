# Decisions

Two or three lines for each non-obvious choice.

## M0

**Phaser 3, not Phaser 4.** The brief and spec lock Phaser 3 (3.90.0, the last 3.x). npm's `latest` tag is Phaser 4, so `phaser` is installed with a `^3` range and Dependabot ignores its major bumps. Moving to 4 needs Joseph's say-so.

**TypeScript 6, not 7.** typescript-eslint 8 declares support for TypeScript below 6.1, so `typescript` is pinned to `~6.0.3` even though npm's latest is 7. `.github/dependabot.yml` ignores TypeScript major bumps so no red PR appears. Remove that ignore once typescript-eslint supports TypeScript 7.

**Scale function lives outside Phaser.** `src/render/scale.ts` takes two numbers and returns a whole number, so it is unit tested in Node with no browser. Render settings are plain data in `src/render/renderSettings.ts` for the same reason.

**Scale counts CSS pixels.** `window.innerWidth` and `innerHeight` are used as is. On a whole-number device pixel ratio (Joseph's Mac) this is crisp. On 125 or 150 percent displays or with browser zoom it may not be. Left open as spec question 3.

**Letterbox color lives in `index.html`.** Setting it from JS flashed white on load and left the page white if the bundle failed. `main.ts` reads the computed body color and gives it to Phaser, so there is one value. The other placeholder colors are in `src/scenes/placeholderColors.ts`.

**Zoom, not CSS sizing.** The canvas stays 256x240 internally and Phaser's `zoom` is set to the whole-number scale (`Scale.NONE` mode). Auto margins in a flex body center it and keep the top-left reachable by scrolling when the window is smaller than the frame.

**Sim boundary rule.** ESLint flags any import of `phaser` or `phaser/*` under `src/sim/`: static, type-only, re-export and dynamic. The core `no-restricted-imports` rule covers the first three kinds. It does not see `import()`, so a `no-restricted-syntax` selector covers that. A test runs ESLint on source text with a `src/sim/` path to keep the rule from being deleted or narrowed.

**Node version pinned in `.nvmrc` only.** It holds `24`. Node 24 is an LTS line that vite 8, eslint 10 and vitest all list as supported. Local dev was on Node 25, an odd-numbered non-LTS release, which vitest does not list, so the pin is deliberately not the local version. `package.json`, the workflow and the README point at the file and do not repeat the number.

**Deferred, on purpose.**
- GitHub Pages deploy: the repo and its name do not exist, the Vite base path depends on the name, and deploys are ask-first.
- Nightly harness and 20-year soak: nothing to run until M1, and an empty workflow would pretend to be finished work.
- Branch protection on red: it is a GitHub setting and needs the remote.

**gitleaks via the official action.** Simplest while the repo is under a personal account. If it moves to an organization, switch to the binary (spec question 4).

## M1 data

**zod for validation.** Approved as the one new M1 dependency (`^4.6.7`). Types are inferred from the schemas, never written twice.

**Schemas live apart from the JSON.** `src/data/schema.ts` and `src/data/validate.ts` import no JSON and hold no real names, so the sim can import their types and the sim never reads `src/data/*.json`. Only `src/data/load.ts` imports the JSON, and the sim gets the validated result as an argument. A test that real names never appear under `src/sim/` still guards the rest.

**Every uncertain number carries a mark.** Track and tuning values are `{ value, status, note? }` with status `starting guess` or `confirmed`. Grouped numbers that only make sense together (a min and max band, the margin label bounds) share one mark. All tuning is a starting guess today.

**Track geometry (V2).** Only one primary source was found: Churchill Downs publishes a one-mile dirt oval (https://www.churchilldowns.com/about/), so `lapFeet` is marked `confirmed`. That means the lead checked it on 2026-11-11 against the track's own site, which describes a one-mile dirt oval. Joseph has not confirmed it yet. Everything else is a starting guess: stretch 1,234.5 feet (from memory, no primary source), a backstretch equal to the stretch, two equal turns for the remainder, no run-up, and a 10 furlong start 1,320 feet before the wire (past the wire once, then one full lap, with the gate just behind the head of the stretch). The gap is open until someone finds the track's own measurements.

**The race is fictional.** "Old Fence Row Stakes", 10 furlongs, dirt, fast, neutral bias. It is not the Derby (20 starters, its own milestone in M7). Horse and jockey names are made up, and could not be checked against the real registry.

**Lane maximum lives in tuning only.** The spec puts it there (O8), so the track file does not repeat it as a lane count.

**Distances in feet.** Track data is in feet. The replay distance unit is the M1.3 engineer's call.

**Known limit: whole furlongs only, 5 to 12.** Validation rejects any other race distance, naming `distanceFurlongs` in race.json. Pace pars and the furlong calls are laid out per whole furlong, and B2 only asks for 5 to 12. Real races run at half furlongs too (8.5, 9.5); that arrives with the calendar in M5.

## M1 sim

**sfc32 seeded by cyrb128.** Each stream hashes the text `seed/name` or `seed/name/subKey` with cyrb128 (bryc's 128-bit string hash) into the four words of an sfc32 state (Chris Doty-Humphrey's generator from PractRand). Both use only 32-bit integer math and Math.imul, so every engine gives the same numbers, and a stream depends on nothing but its own key. A float is the output divided by 2^32, which is exact.

**Stream names may not contain "/".** That keeps the hashed key unambiguous. The name list starts empty in M1.1: no system draws yet, and a name cannot be renamed once races depend on it, so M1.3 picks the first ones.

**Sim tests are exempt from the determinism lint bans.** Files ending `.test.ts` under `src/sim/` may use Date, performance, Math.random and the inexact Math functions, because they are not part of a race and the T3 timing checks need a clock. They still get the Phaser ban.

**Known limit until M5.** Only dirt goings have time effects in tuning. A turf or synthetic race passes the surface and going check, then fails with a "goingTimeAddedPercent.<going> missing" message from tuning. That message is misleading, and turf support is not built.

**Result numbers are whole numbers in fixed units (the renderer contract).** Times in hundredths of a second, distances in hundredths of a foot, lanes in hundredths of a lane (0 is the rail), lengths in thousandths of a length. The units are also written into every result's `units` field. Floats would serialize the same on every engine too (ECMAScript fixes number-to-text exactly, and + - * / and sqrt are exactly rounded), so the real cross-engine risk is the banned Math functions. The whole numbers are for a short, readable result, a unit the renderer can rely on, and so a margin's label is worked out from the same rounded number that is shown.

**Replay distance is progress along the rail.** Every horse's wire is at the race distance, whatever lane it ran in. The renderer places a horse with distance plus lane. Ground lost by running wide shows as slower progress, and each horse's total is in `extraGround`. `replay.course` lists the straights and turns in the same unit so the renderer does not have to lay out the course again.

**One sim tick per replay sample.** The model steps at `replayStepSeconds`, so changing that value changes results. Finish moments, margins and calls are found by straight-line interpolation between ticks, the same way everywhere, which keeps them consistent with the replay.

**Every random number is drawn before the race starts.** Four streams, each keyed by horse id, each a fixed count of draws: `form` (two bell-shaped numbers, speed and reserve), `gateBreak` (one), `kick` (two: when the rider asks, how much it has), `rhythm` (one per furlong of the race). Nothing in the race decides whether to draw, so a later system, an instruction or a ninth horse cannot shift anyone's numbers. Add new randomness on a new stream, or at the end of an existing stream's fixed list.

**Order never comes from the input.** Horses are sorted by post before anything happens, ties in position or finish time go to the lower post, and the echoed inputs have their keys sorted. The field can be listed in any order with the same bytes out.

**Charts follow racing convention.** Fractions are named from the gate (the quarter, the half), poles from the wire (the quarter pole is 2 furlongs out). Calls are taken as the leader reaches each pole. A margin is measured when the horse one place ahead reaches the wire, and beaten lengths are the sum of the margins above.

**Turns are half circles.** Radius is `turnFeet / pi`, so a horse one lane out on a turn runs `pi * laneWidthFeet` more per turn. `laneWidthFeet` is 1.5, a guess picked so 8 identical horses stay within the post fairness tolerance; at 2 feet the inside posts won about 2.5 points too often. `runUpFeet` is not used by the model yet (it is 0).

**Pace pars were moved to fit the sim.** The 10 furlong fast par was 46/48 seconds, and almost every sim race read slow against it. All pars for 5 to 12 furlongs are now near the 25th and 75th percentile of the leader's half on the shipped card, scaled for the other goings. The sim's halves run one to two seconds slower than real charts, because its clock starts at a standing gate and its horses slow less through a race than real ones. Final times are close to real.

**Known limit: kick below about 41 buys no late boost.** The kick boost line is floored at zero, and on the current tuning it reaches zero near kick 40. Every horse from kick 1 to 40 gets the same boost of nothing, and only its acceleration differs. No shipped horse is in that range (the card runs 60 to 74). M2 has to settle this before it generates low-stat horses.

**Known gap: a wide front-runner is not slower (B7).** A front-runner breaking from post 8 covers about 4.6 feet more than the same horse from post 1 and finishes no worse (500 and 2,000 seed paired runs). Stalkers and closers do pay for the ground. The test is marked as an expected failure so it cannot be forgotten. Traced in M1.4, see "B7 traced" below. Not fixed, because any fix changes the golden results; the lead decides. Resolved earlier (the B7 test has covered a lone front-runner since 2026-11-12 and nothing is marked as an expected failure), and since the M1 tuning pass a front-runner among other front-runners pays too: with shorter presses it loses about 0.22 points of win share per post.

**B7 traced (M1.4).** Ground is charged. A lone front-runner among stalkers and closers pays for post 8 (mean place 4.80 to 5.01 over 500 paired seeds). The gap appears only with other front-runners in the field: from the rail the horse leads 13.0 seconds and is pressed 11.3, against 6.1 and 5.3 from post 8, because the ground it loses early drops it more than `pressLengths` off the lead, where its effort falls from the duel's 1.035 to 0.99. With `duelEffort` at 0 the outside horse pays like a stalker (4.35 to 4.61); with `tuckInEffortDrop` at 0 the gap stays. So it is the duel, not the lane logic.

**Instruction and bias tuning groups are optional as wholes.** `tuning.instructions` and `tuning.trackBias` may be absent, so tuning written before M1.4 (the frozen golden inputs) still validates. When present, every value in them is required, and validation requires the group when the card gives an instruction or the race has a bias.

**Instruction checks are tuning-wide, and the profile guard reads nested values.** The 3/8 pole (1,980 feet, `THREE_EIGHTHS_FEET_TO_GO` in the schema) must be at or beyond the latest default ask (largest `askFeetToGo` plus `askSpreadFeet`), and every style's early effort less `rateEarlyEffortDrop` must stay above `emptySpeedShare`, or a rated horse never finishes. Both apply only when `tuning.instructions` is present. `makeProfile` now also checks inside `rate` and `earlyMove`, and treats `undefined` as bad.

**Instructions are trades, not upgrades.** In this model a kick costs no more per second than cruising, and reserve a horse does not need buys no speed. So a 3/8 move gets only `earlyMoveGearShare` of its kick gear until its usual ask point (the early part of the run costs reserve), and saving it for the stretch adds `saveForStretchKickShare` to the kick for the ground it gives up. Rate early only lowers effort and stops pressing for the first part of the race. None of them draw random numbers, and a horse with no instructions runs the same arithmetic as before.

**Track bias.** Lane bias multiplies the ground a horse covers per stride, more on the rail (inside) or more away from it (outside). Style bias multiplies reserve drain for horses near the lead, less on a speed track and more on a closers' track, so it follows where a horse runs, not its style label. A neutral race skips both.

**Going changes the race, not only the clock.** Going is a speed divisor, so the same seed on sloppy is a different race from the same seed on fast (a different winner about 28 percent of the time). Over many seeds no horse is favored, which is what B8 asks for.

**Known limit: early fractions run slow.** The sim's half-mile times are 1 to 2 seconds slower than real charts, because the clock starts from a standing gate (run-up is 0) and its horses slow less through a race than real ones do. Final times are realistic. Fixing it means modeling the run-up and a steeper late fade, a tuning task for after the batch runner exists.

**Kick is steep and floored at zero.** Each kick point adds 0.22 percent to the gear a horse shifts into when asked, so a +10 kick edge is worth about as much as +10 speed or stamina. A kick-70 horse still gets 6.5 percent. The line goes negative below kick 41, and the sim floors it at zero, so a horse with very little kick simply has no extra gear instead of slowing when asked.

**Luck follows the up-front draw pattern (M1.5).** Each event type has its own stream (`luckBlocked`, `luckSteadied`, `luckBumped`, keyed by horse id), and each takes exactly two draws per horse in `makeProfile`: whether the horse is unlucky that way today (below its rate), and the point on the course from which luck looks for it. The race only uses up those draws, it never draws, so the count cannot depend on what happens or on the order horses are looked at. With every rate at zero nothing is drawn and the tick loop skips luck, which is how L1 stays byte-identical.

**An event needs a real situation.** From its drawn point a horse's luck waits `windowFeet` (110, about two seconds) for the situation: a horse right on its heels in its lane for blocked or steadied, one at its side for a bump. If the stretch passes in the clear, so does the luck. With no window, or a 330 foot one, almost every unlucky horse found traffic sooner or later, and stay inside no longer made a horse blocked more often (I5). Luck looks at the field as it stands at the start of a step, which is the last replay sample, so each event can be checked against the replay at its time.

**What an event costs.** A share of the horse's speed. Steadied and bumped lose it at once and build back at the usual rate (a bump costs both horses, and since the M1 tuning pass it also takes a share of both horses' reserve, see "A bump costs reserve as well as speed" below). Blocked is held to less speed for `blockedSeconds` and cannot go around. Each type happens to a horse at most once a race, a horse is in at most one event at a moment, and `maxEventsPerRace` caps the race. Rates are the chance of being unlucky, not of an event, so they read high: 0.3 for blocked gives about 2.6 percent of horses blocked per race.

**`luck.events` is required whenever a luck rate is above zero.** Validation says so (`validateData`, beside the instruction and bias rules), and names the field. The schema still marks the group optional so a card with every rate at zero needs none. The sim also throws clearly on unvalidated data, for a missing group and for a luck rate that is not a number from 0 to 1. The frozen golden inputs are a full current copy with the group present, and the reference results come in two sets from them: luck off (the model alone) and luck on.

**`SIM_VERSION` is 2, bumped with M1.5.** The same inputs with a luck rate above zero now give a different race, which by the rule in `runRace.ts` means a bump. With every rate at zero the results are byte-identical to before.

**A horse takes part in at most one bump a race, on either side.** A horse that has been in a bump, whether it started it or was run into, cannot be the other horse of a later one, and its own bump luck is used up. Before this, only the horse whose luck started a bump was limited, so one horse could be hit several times and lose up to a quarter of its speed each time. The other horse is still the nearest eligible one, the lower post if two are as close. `maxEventsPerRace` is a whole number from 0 to 20, the largest field.

**Known: an early bump can help a front-runner.** On the shipped card a bump in the first ten seconds gains the bumped horse 1.2 lengths on average (19 cases in 2,000 races), up to 14 lengths for the fastest front-runner. It drops back from the speed duel and saves itself, the same cause as "B7 traced" above. Left for the M1.6 tuning pass on the duel, not patched in luck. Fixed in the M1 tuning pass, see "A bump costs reserve as well as speed" below.

**Batch runner (M1.6) loads TypeScript through Vite.** `npm run batch` runs `scripts/batch.mjs`, which starts Vite in middleware mode with no socket and no file watcher, loads `scripts/batchCli.ts` with `ssrLoadModule`, runs it and closes the server. Node cannot run the repo's TypeScript as is (parameter properties, imports without extensions), and Vite is already a dependency, so no new package. Loading the code writes nothing to disk. The only file the command can write is the one named by `--out`.

**The counting is in `src/sim/batch.ts`, the printing is in `scripts/`.** The sim side only calls `runRace` and counts, so it follows the sim lint bans and cannot change a race. The clock, file reads, `--out` and text layout live in `scripts/`. All bands come from `tuning.checks` and nothing was added to tuning or the schema, so the golden files and `SIM_VERSION` are untouched.

**The fairness fields are rebuilt in `batch.ts`, not imported from `testkit.ts`.** `testkit.ts` is test support that nothing in the sim imports. The field is the same as the tests use (equal stats of 70, ids `t1..`, posts 1.., styles rotated front-runner, stalker, closer), with two differences made on purpose: default instructions are set on every horse and the track bias is forced to neutral, so a card or race file with instructions or a bias cannot leak into F2 and F3. Luck, going and distance stay as loaded, as in the tests.

**One check per bar, measured at the worst case.** F2 reports the post farthest from 1 in N for each style, F3 the style farthest from it, and F5 the lowest and highest horse. F3 divides a style's win share by its number of horses (3, 3 and 2 on eight posts). The batch runs five sets of races per seed (the loaded card, three post fields, one rotated field), so 10,000 races means 50,000 sim runs.

**F2 and F3 bands scale with the field.** For a field of n horses the band is 100/n plus or minus `fairnessTolerancePoints`, in points. At 8 horses that is the spec's band. At other sizes it is only a rough guide, since the spec did not set one.

**A style with no horse in the rotation is not measured.** On a card of 2 horses the closer has none, so F3 leaves it out and the report prints "no horses" for it, not 0 percent.

**`--out` is checked before any race runs.** A 10,000 race run takes minutes, so a path that cannot be written fails first, as a normal argument error: a missing folder, a folder in place of a file, a path ending in a slash, or a path that is one of the data files the run reads (it would have been replaced by the report). Write permission is not checked ahead, so a read-only folder still fails after the run, with one line and exit code 1.

**A race result with no call at one furlong to go stops the batch.** The sim always makes that call today. If the call layout ever changes, the "leader at the 1/8 pole loses" number would read low with no warning, so the batch throws with the seed.

## M1 tuning pass

**Rate early was free because a rated front-runner ran faster than a lone leader.** It ran at the front-runner base effort less the drop, 0.99, above the 0.98 a lone leader runs at, so in a slow race rating cost nothing, and in a hot race it skipped a duel at 1.035. `earlyEffort.frontRunner` sets only two things, the duel peak (it plus `duelEffort`) and the rated effort, so it went from 1 to 0.9825 with `duelEffort` from 0.035 to 0.0525. The peak is still 1.035 and a rated front-runner runs at 0.97, so rating hands the lead over in a slow race. `rateEarlyEffortDrop` went from 0.01 to 0.0125 and `rateEarlyUntilShare` from 0.5 to 0.45.

**The duel peak stays at 1.035; presses got shorter instead.** Every pressed leader, of any style, is pushed toward the same peak. Lowering it to 1.02 helped three front-runners, but it made the lead cheaper for every style, which favored the inside posts in a field of one style (slope at 10,000 seeds: stalkers -0.35 to -0.43 points per post, closers -0.12 to -0.20). `pressLengths` went from 1.5 to 1.2 instead. Only front-runners use it: a presser drops off sooner, so duels end sooner.

**Stay inside goes around a much slower horse.** It never went around anyone, so it sat behind tiring horses for about 12 more seconds of the turns to save about half a length (horses run at lane 0.4 to 1.2 through the turns on their own). It now goes around only a horse 2.5 percent slower than it wants to go, against 0.5 percent for everyone else. That is one new value, `instructions.stayInsidePassMarginShare`, and a small change in `lanes.ts` and `simulate.ts`; a value alone could not do it. It still runs nearer the rail, covers less ground and is blocked more (I5). At 1.5 percent it was blocked no more than without the order, so 2.5.

**Stay inside may not pass more readily than everyone else.** `instructions.stayInsidePassMarginShare` must be at least `model.traffic.passMarginShare`; equal is allowed. Below it, an instruction meant to hold a horse on the rail would send it around a slower horse sooner than any other horse goes, which is the reverse of what it says. It lives in the tuning schema's tuning-wide checks in `src/data/schema.ts`, with the other instruction rules, and applies whenever the instructions group is present.

**The inside bias pays the rail itself.** `trackBias.laneWidthLanes` went from 2 to 1 and `laneSpeedShare` from 0.005 to 0.008. At 2 lanes most of the field already had most of the bias without being told to stay inside.

**A bump costs reserve as well as speed.** Speed comes back within seconds. A front-runner bumped early dropped more than `pressLengths` off the lead, left the duel and saved more than the bump cost it. Both horses in a bump now lose `luck.events.bumpedReserveShare` (0.02) of their reserve, a new value and a few lines in `luck.ts`. `bumpedSpeedDropShare` went from 0.08 to 0.05 so a bump costs about what it did: bumps find horses with neighbours on both sides more often than the rail horse, and a dearer bump steepened the stalkers' post slope.

**The 3/8 move costs less, save it pays a little more.** `earlyMoveGearShare` went from 0.05 to 0.12: at 0.05 the first 330 feet of the move burned about 0.15 of the reserve, and it lost for 15 of 16 horses. `saveForStretchKickShare` went from 0.03 to 0.035 so a stalker saving it still gains more after the quarter pole than one with no order (I4).

**Known gap: the 3/8 move and save it do not trade by pace (U2).** Which one pays depends on the horse's own reserve when the rider asks: in the top quarter of reserve the 3/8 move gained about 5 points and save lost 5, in the bottom quarter about +1 and -1.5. But that reserve barely follows the pace label, because off-pace horses run their own effort inside a window of lengths behind the leader, so a hot half costs them little. More reserve for everyone, a bigger catch-up step, and both together did not make the 3/8 move gain in slow races; it does a little better in hot ones, where it runs into tiring leaders. A real pairing needs a model change, for example an early move whose cost depends on the pace. Not made. Still open after the second pass: see "Record of what was tried for V1" below. It needs the pace and reserve economy redesigned from a spec.

**Known gap: rate early on a card with two front-runners (U1).** On the shipped card, rating hands the other front-runner a lone lead, so it loses 4 to 5 points over all races (8 to 12 in slow ones), while on the equal card, with three front-runners, it is within a point of even. Every setting tried left a gap of 4 to 6 points between the two cards, wider than the plus or minus 2 band, so the values are set for the equal card.

**Pace pars refitted.** The model change moved the leader's half, so every distance's pars were set again at the 25th and 75th percentile of the shipped card (3,000 seeds), and the other goings scaled by their time percent as before. 10 furlongs on fast is now 48.72 and 49.33 (was 48.5 and 49.3). Rounded to a tenth, the slow par read 29.5 percent of races as slow.

**`SIM_VERSION` is 3.** A bump now costs reserve, and stay inside can go around a slower horse, so the same inputs can give a different race. The frozen golden inputs got only the two new required values. From them, the five luck-off results are byte-identical to version 2 apart from `simVersion` and the echoed tuning, and of the three luck-on results only seed 3, the one with a bump, changed.

## M1 tuning pass, second pass (the early and move orders)

**Record of what was tried for V1 (the move orders trading by field), for the redesign.** V1 and V2 are a known gap after this pass: they need the pace and reserve economy redesigned from a spec, not tuned. What follows is so that work starts from the evidence.

**Why the orders did not trade.** On equal horses at commit 284bf67, a stalker's reserve when asked was 0.49 in hot races and 0.54 in slow ones, so the pace barely reached horses off it. A lone front-runner led at the first call in only 23 percent of races (28 at the half), because stalkers 2 or 3 lengths back pushed it like a presser, and a field with one front-runner ran its half only 0.27 seconds slower than one with three. Once asked, a horse drained against its kick gear, so a horse that had run out settled near cruising speed almost for free: with reserve under 0.45 at the ask the 3/8 move gained 1 to 2.5 points and save lost 2 to 4.

**The structural point.** Which order covers more ground to the wire depends on the told horse's own reserve, not on the leader: once both have run out, or neither has, how strong the leader is cannot change the order of their ground totals. So the orders can only trade by field if what a horse has left at the ask differs by field, by more than it varies from race to race (about 0.07 to 0.09 of the reserve inside one field).

**State A: four rules, closers held close.** (1) Only front-runners fight for the lead: a front-runner leader is pushed only by a front-runner trying for it, a stalker or closer in front is not pushed and eases. (2) Past the back of its window a stalker or closer runs at least at the leader's effort. (3) Once asked, a horse drains at least as if it ran at 0.99 of its kick's speed (`askedEffortFloor`). (4) Save it adds a share of the horse's own kick. With windows of 3 and 4 lengths V1, V3, U4 and all nine batch checks were met, but B6 failed on both cards (shipped: closers won 31 percent of hot races and 42 of slow ones), and the shipped card's closers needed 3 or 4 points of speed for U6.

**State B: the same rules, closers back behind stalkers.** Windows 3 and 8, closers' effort 0.975, card as before. B6's closer half passed but its front-runner half failed (shipped: front-runners won 20.9 percent of hot races and 15.6 of slow), and so did B1 for closers, I4 for closers, the U1 slow-race count (81 of 500) and F3 (closers 16.2 and 16.5). V1 for closers failed: with spare reserve in speed-heavy fields the 3/8 move beat save for them by 3.6 points.

**Why both failed.** With the lone leader no longer pushed, a slow race leaves every horse reserve and becomes a sprint home: the shipped card's front-runners have the two weakest kicks (60 and 64) and lose it, and closers held close win it. So "only front-runners fight" turns the pace label into a selection effect (a hot half means a fast front-runner that day) and breaks B6's front-runner half in every shape tried. Closers can be either short of reserve in a hot race (V1) or helped by one (B6), not both, in this economy.

**Tried and dropped: a cap on how long a kick lasts.** A kick held full strength for 20, 24 or 28 seconds after the ask, then faded over 6. It moved closers toward save in every field alike (20 second hold: S minus M +0.9 with one front-runner and +0.6 with three), so it gave no field difference, and it cost stalkers V1 in lone-speed fields.

**Final round: fixing the stalker free upgrade alone (V3), from 284bf67. No go.** Each rule was added on top of the shipped model and measured on seeds 0 to 599 (equal card per horse, both cards for the combinations); every change was then reverted. At the shipped model rate early with save was +8.0, +1.5 and +4.8 for the three equal-card stalkers, and the best combinations were +8.0 on the equal card and +6.0 on the shipped one; a front-runner's rate early plus 3/8 move was already +4.3. (a) A rated horse keeping up past the back of its window brought the stalkers to +5.8, -0.3 and +2.3, but for front-runners it made rating worth +8.5 (U1 allows 2), so it was tried for stalkers and closers only. (b) Save as a share of the horse's own kick (0.54, the same bonus at kick 70) did not move the equal card and helped the shipped one only once the rating drop was smaller. (c) The asked-effort floor on this base dropped front-runners to 9.5 percent each and made closers win 15.8 to 17.8, so it was left out, and with it (d). With (a) for stalkers and closers, (b), and `rateEarlyEffortDrop` at 0.008 to 0.01, the stalkers came to +4.0 or more at best (+4.2, +2.7, +3.5 at 0.008), rated front-runners rose to +4.2 to +4.7 against U1's 2, and a front-runner's rate early plus 3/8 move stayed at +5.8 to +6.3; a dearer 3/8 move (`earlyMoveGearShare` 0.08) took it only to +5.8. The over-limit combinations are front-runner ones that no stalker rule reaches, so V3 needs its own change for front-runners rated and then sent early. The model is left as at 284bf67.

## M1 pace redesign (docs/specs/m1-pace-redesign.md)

**Pace pressure: a speed duel pulls the field along (Step 1 mechanism, on branch `m1/pace-redesign`, not merged).** A duel is on while two or more front-runners, not asked and not rating, are within `pressLengths` of the leader. One race-wide pressure follows it, `pressure += (duel - pressure) * min(1, step / pressureSeconds)`, updated once per step from the standings at the start of the step. Before its ask, a horse that is not leading and not a front-runner pressing adds `pull[style] * pressure` to its effort, a rated horse `ratedPullShare` of that; a rated horse that leads feels none, since leaders feel no pull. With the optional `pacePressure` group absent, every pull at 0, or fewer than two front-runners, races are byte-identical. No random draws.

**The feasibility probe failed, so the mechanism is not shipped.** At settings a to d (pulls up to 0.035, 0.035, 0.028) stalkers' mean reserve at the 3/8 pole was at most 0.046 lower in field H than in field L (baseline 0.012), and closers' at most 0.048 (baseline 0.009), against within-field spreads of 0.071 to 0.092. P6 and P7 failed at every setting; P9 also failed at a to d and P8 at d. By the stop rule nothing else was tried, and the move orders stay a known gap for M1 (open question 4). In field H the pressure also moved the 3/8 move minus save it for stalkers from minus 3.12 to between minus 1.00 and minus 0.20, the wrong way for V1, and made rating a front-runner worth plus 2.85 to plus 4.75. The probe is `node scripts/paceProbe.mjs` on that branch.

## M1 race day, step P0 (the placeholder race)

**Four new data files, none read by the sim.** `raceDay.json` (view values, beats, copy), `slots.json` (the slot registry), `cardLook.json` (coat and silks per horse id) and `palette.json` (the 42 colors, the silks bands and the key colors, so the palette is defined once as data). Schemas are in `src/data/raceDaySchema.ts`, the loader and its cross-checks in `src/data/raceDayLoad.ts`, with the existing `DataError` format. `schema.ts`, `validate.ts` and `card.json` are unchanged.

**The race-day loader checks the screens' limits at boot.** At most 8 horses (the strip, the keys and the `#{n}` templates are sized for one digit), race and track names 30, jockeys 22, every template's holes and its width at the widest fill (an 18-character name, a half of "9:59.99", place "8th"), and the orders short form at 18. The `{half}` budget of 7 is why the pace lines are worded "Half in {half}, a fast clip" and not the spec's "they're flying", which would be 31.

**A pick window before the gate (P0 only).** The spec's gate beat stands the field still for 1.0 s, too short to read the prompt and press a key. P0 adds `beats.pickSeconds` (4 s) before it, with the prompt on the message line. It goes when the card screen takes over the pick in step 5. The spec's prompt "Press 1 to 8 to pick your horse" is 31 characters, so the copy is "Press 1 to 8: pick your horse".

**The race clock starts on the door swap.** The gate beat is the pick window plus 1.0 s still, then the doors open and race time 0 starts in the same frame. Holding the field behind open doors for the spec's remaining 0.5 s read as a stall.

**The final-sixteenth blend is capped.** The spec's 1.0 s linear blend moves the camera faster than 32 px a frame (RV5) when your horse is 25 or more lengths back. The camera is the lowest of the linear blend, the race camera plus `finalCatchUpPxPerSecond` (600) times the time since the 1/16 pole, and the target. All three only grow, so it never scrolls back. From the winner's finish it is exactly the wire camera. Checked over 200 seeds and every horse as yours: worst step 25 px, your nose always in 56 to 200 before the 1/16 pole.

**Ship guard: a separate release check.** `npm run ship:check` (`scripts/shipCheck.ts`, launched like `batch`) fails when any slot is marked placeholder, its file is missing, or the PNG is not the size data gives. `npm run build:release` runs it before `vite build`. The normal `build` and CI do not, so stand-ins can live on main. The three sfx slots are silent placeholders, so the check fails until audio exists or Joseph rules silence final.

**Missing art is found before Phaser loads it.** Vite's dev server answers a missing file with the page and status 200, which Phaser only reports as a console error. `main.ts` sends a HEAD request for every slot file and loads only those answering as images; after loading, a file at the wrong size counts as missing. Any such slot draws the Pink and Ink checker at the slot's size, the tag shows at (248, 0), and the race scene lists the slots in the console on the first race.

**Text before the font exists.** All text goes through `Art.font` in `src/scenes/art.ts`: one RetroFont per text color, recolored from the sheet by pixel swaps (every opaque non-Ink pixel takes the text color). With no main font file it draws the browser's 8 px monospace into the same 8x8 cell sheet and cuts it to hard pixels; with no small font it uses a 3x5 stand-in in `src/render/fontLayout.ts`. Both count as placeholders, so the tag shows. The checker rule cannot make text readable, which is why text gets a readable stand-in.

**Poles by distance to the wire around the lap.** Every 330 feet from the gate, typed quarter, eighth or sixteenth by its distance to the wire modulo the lap, so a 10 furlong race passes the real wire post the first time by. Band colors are `raceDay.poleBands`: quarter Red, eighth Emerald, sixteenth Coal (Coal so the band never merges with the Ink outline), from Kentucky 810 KAR 2:070 as found by the artist.

**Announcer keys, by priority per pole.** 1/8 pole: leaderSame or leaderNew against the 1/4 pole's leader. 1/4 pole or the head of the stretch: home. The pace pole: the 1/2 pole when the half from the gate is already run there (8 furlongs and up), else the first pole past the half other than the last two, else none. First call: earlyLeader. A wire pass: firstTimeBy. The first unclaimed pole in a turn: far or clubhouse turn, counted back from the wire. The first in a backstretch: backstretch. Otherwise leader. The variant index is the call's place in the whole schedule (gate 0, off 1, poles, wire, winner).

**Edge markers stop when the race is decided.** The leader's marker shows until the winner is in and yours until your horse finishes, so nothing points at horses galloping out past the wire. The marker is 8x9 (art review): its 9 rows are centered on the horse's lane height, read as its hoof line `hoofY`, the y the spec gives a lane, and the number's cell sits at x2 (x3 flipped), y2.

**The mini map matches the delivered art.** The artist's band is 4 px between radii 16 and 20 around (20, 20) and (68, 20), with its wire tick at x67. The code uses that geometry, caps the straight at 48 px (the track's proportions give 50), and draws its own tick on the same pixels. Your dot stays on the band's inner edge so its Yellow ring fits inside the 88x40 box.

**Small layout calls.** The strip's 7x4 arrow sits at y179 to y182 and your name, position and orders lines at y184, y194 and y204, so the arrow has 1 px clear of the box above and the name below (the spec's y181 name would touch it). The frame box arrived as a 3x3 sheet, read through the slot's `columns`.

**The renderer may not import the sim's streams (RV9).** An ESLint block bans `sim/rng` and `sim/raceStreams` from `src/render/**` and `src/scenes/**`, static and dynamic, so a boundary test can check it the way `simBoundary.test.ts` does.

**The letterbox is Ink.** `index.html` now uses #14111C from the approved palette instead of the M0 placeholder. `CheckerScene` is no longer registered.

## M1 race day, P0 fix pass (code review, art review)

**One list of needed slots.** `SLOT_IDS` and `neededSlotIds(race)` in `src/render/slotStatus.ts` name every slot the race-day screens draw, the race's track slot included. The scenes take their ids from it, the loader adds a `src/data/slots.json` issue naming each needed slot that is missing (so boot shows the data error screen, not a frozen canvas), and `ship:check` fails on the same. It lives in `slotStatus.ts` because the release check already loads that file; the check reads `race.json` as plain JSON for the track slot and skips it if the file is absent. The placeholder tag now checks the track slot by id, not the TileSprite's own canvas texture.

**Gallop out is drawn, not simulated (RV2b).** The replay stops 0 to 0.1 s after the last finisher. Before that a finished horse's samples carry the sim's own run-out, 0 to 3.6 s of it, slowing to 75 to 100 percent of its crossing speed (300 seeds). The renderer ignores those samples. `finishRuns` takes each horse's crossing speed from the last two samples at or before its finish and its lane from the last one. `drawnHorsesAt` holds a horse at the wire until its finish and then moves it on at that speed. Only the sprites, the arrow and the edge markers use it. `horsesAt` stays the replay, so the camera, strip, clock, calls and mini map dots are unchanged. Over 300 seeds no horse's drawn x ever went backward.

**Your finish on the position line (H3b), no spoilers.** From your horse's own finish the line reads "Finished {place}", the winner included ("Finished 1st"), because a place is settled as the horse crosses. The winner's margin is only settled when the second horse crosses, so "Won by {margin}" shows from the second horse's finish time: "a nose", "a head", "a neck", `copy.oneLength` ("a length") for exactly one, otherwise the number alone ("Won by 2 1/2"), since "lengths" does not fit 18 characters. Nothing reads `finish[1]` before its finish time (AN3 wins over the first H3b wording).

**Art facts move to slot data.** The gate's start-line column is `startX` on `art.race.gate` (31). `raceFrame` returns the start line's screen x and each edge marker's lane height, and the scene places the sprites by their slot's `startX` and `frameHeight`. That keeps `ArtFacts`, which the tests build, unchanged. `view.gateScreenX` is now what the camera uses before the doors open; it is still validated equal to `leaderScreenX`, so the break does not jump.

**Rails flip on odd tiles.** One image per 16 px of world, `flipX` when `floor(worldX / 16)` is odd, so each tile's post pairs with its neighbour's every 32 px as drawn. The far rail tile sits at y84-91 (bar on top, Grass behind the posts), the near at y152-159.

**Gate and grandstand are stand-ins.** The art-director accepted them as stand-ins, so both are flagged placeholder in `slots.json` and the tag and `ship:check` count them.

**The RV9 lint pattern covers `.js` and friends.** It now matches `sim/rng` and `sim/raceStreams` with no extension or with `.ts`, `.js`, `.mts`, `.mjs`, `.cts` or `.cjs`.

## M1 race day, step 2 (winner beat, crowd, 4x, skip, pause)

**Two clocks, linked by marks.** `src/render/timeline.ts` keeps wall seconds (what the player sits through, paused time excluded) and race time apart. A list of marks says how race time followed wall time since the doors opened: a rate change (Space) is one mark, a skip is two marks at one wall second. `wallAtRace` turns a call's or message's race time into the wall second it was reached, so calls type and messages show for their wall-time lengths at 4x and after a skip. Race time is computed from the last mark rather than summed frame by frame, so it does not drift. `raceFrame(setup, me, p)` with a number still means the P0 playback second at normal speed and gives the same frames as before; with no 4x and no skip the scene's clock takes the same arithmetic path.

**4x speeds the race beat only.** Space held during the race runs race time at `playback.fastSpeed`; the gate, the wire hold and the winner beat stay wall-time beats. The "4x" tag and the 27-character call show only while it is actually running. Space held when a beat begins counts as a held key (IN2), so it must be pressed again.

**Skips (FN1).** Enter opens the doors at the gate; in the race it jumps to the leader at the 1/4 pole (the 2-furlongs-to-go call), then to the winner's finish; it ends the wire hold or the winner beat early; after the beat it starts the next race. Auto-repeat never acts, and a key down when a beat begins is ignored until released (`src/render/keys.ts`). Keys still down when the next race starts are handed to it, so a held Enter cannot skip its gate.

**Pause.** P or Esc opens the box; Esc, or Enter on Resume, closes it; Up and Down move the cursor. P while open does nothing. The race clock and the ambient loops stop; only the cursor bobs, on its own clock. There is no card screen yet, so Back to card abandons the race and goes straight to the next gate, and that race's seed is spent, as the spec says abandoning does.

**Winner beat handover.** At the end of the wire hold the winner has galloped off the right edge, so the beat has to cut the camera. It starts from the winner's gallop-out distance, crossing speed and stride phase at that wall second, so the horse continues exactly and only the camera moves, to hold its frame at x112. The rest of the field is not drawn from then (the winner alone). The background slows linearly over `winnerBeat.slowSeconds` from the crossing speed at playback speed to `walkPxPerSecond`, floored once, so it scrolls by whole pixels and never backs up. Walk frames and the fist start when the slowing ends. After the beat the winner keeps walking under "Enter: next race". `RaceFrame.cam` stays the spec 3.5 race camera; `drawCam` is what the world is drawn with.

**Ambient loops and the cap.** Stretch zones carry the crowd strip over the grandstand, turn zones the infield. As the artist drew it, each turn gets one full infield tile (with the pole and the flag) and is filled with the tile's 16 px pole-free slice (`fillSlice`, columns 0-15), so there is one flagpole per turn, not a row. Art review: the pole is at x23, the fill slice is columns 0-15 (16 px, on the tile grid) and the flag attaches at (24, 3). Crowd tiles flip on odd mid-layer tile indexes, the rails' rule, so the strip repeats every 32 px; neighbours still run a frame apart. Swap counts are wall seconds times the rate, the crowd going from `crowdSwapsPerSecond` to `crowdStretchSwapsPerSecond` at the wall second the leader reached the 1/8 pole, so the frame never jumps at the change. Crowd tile k shows frame (swaps + k) mod 2. The cap is `ambientState`: at most `ambient.cap` visible items animate, by `ambient.order`, and from the 1/8 pole only `fromEighthPole`; a stopped item holds its frame (the flag keeps the frame it had at the pole). The schema rejects any rate over 4 a second.

**RV11 at boot.** `sequenceSeconds` adds the pick window, the standing, the race at playback speed, the hold, the photo (`beats.photoSeconds`, shown from step 3) and the winner beat. The loader rejects data where the slowest winning time in `tuning.checks` with a photo exceeds `beats.maxSequenceSeconds` (90). Shipped: 75.5 s. The post parade and call to the post join it in step 6.

**The slot list moved into the data layer.** `SLOT_IDS`, `neededSlotIds`, `trackSlotId`, `missingNeeded` and `ERROR_SCREEN_SLOT_IDS` now live in `src/data/raceDaySchema.ts`, so `raceDayLoad.ts` no longer imports from `src/render/`. `slotStatus.ts` re-exports them. The ship-check harness already copies `raceDaySchema.ts`, so it needs no new file.

**Lane at the finish: the nit and RV2b's wording conflict.** The drawn lane is now held at the replay's interpolated lane at the finish, so it no longer hops a pixel. That value needs the sample just after the finish, which RV2b's "reads no sample after the horse's finish" forbids. The alternative, extending the last two samples before the finish, avoids the later sample but then departs from the replay just before the finish, which RV2b also forbids. One of the two has to give; left for a ruling.

## M1 race day, step 2 fix pass

**The stand runs on past the wire (FN3).** The home stretch's zone, and so its grandstand and crowd, has no end on the far side: the gallop out, the winner beat and the done screen, which keeps walking for as long as it is up, always pass the stand. A bound would have to cover the walk with no end, so none is set. Tiling starts at the first tile that can be on screen, so this costs nothing. The crowd keeps its stretch rate after the wire.

**The stretch wins over the turn (CH1).** Stretch zones are padded at both ends and so overlap the turns beside them, the gate's included. `turnArt` clips each turn against each stretch's drawn extent: the zone's end rounded up to a whole grandstand tile, since the last tile runs past it. A 16 px fill slice touching that is left out whole, so no half tile shows. The one full infield tile, with the pole and the flag, sits on the turn's 32 px grid in the middle of the longest unclipped run, so it is never the piece cut. The clip shortens the frame's tile lists; there is no clip field. `fullTileAt` still gives the middle of the whole zone, for reference.

**The flag flies on the turns only, for now.** In the stretch the mid layer is the grandstand, with no drawn pole for a flag. Flags for the stretch and the backstretch wait for the art-director to place one in step 6.

**A skip drops what it skipped (FN1).** A message whose trigger's race time falls strictly inside a skipped span (two marks at one wall second) is dropped, and so is the "Back in stride" after a dropped event, because it carries that event's race time. After a skip the line shows only what happens from the new race time on. The announcer shows the latest call reached.

**Small guards.** `ambient.cap` is bounded at 3, DESIGN's cap. A stopped ambient loop keeps its frame: off screen it runs on unseen, and stopped at the 1/8 pole it holds that frame. One Enter starts one race: the scene ignores keys once it is handing over. A key first seen as an auto-repeat counts as held over until released, so a Space held through a window blur cannot turn 4x on. `beatTimes` in the schema is the one place the beats are added up; `makeTimeline` and `sequenceSeconds` both read it.

**The lane at the finish (ruled).** RV2b now allows the gallop out to read the one sample that brackets the finish, so the lane is held at the interpolated replay lane there, with no hop.
