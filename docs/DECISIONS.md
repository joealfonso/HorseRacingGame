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

**Known gap: a wide front-runner is not slower (B7).** A front-runner breaking from post 8 covers about 4.6 feet more than the same horse from post 1 and finishes no worse (500 and 2,000 seed paired runs). Stalkers and closers do pay for the ground. The test is marked as an expected failure so it cannot be forgotten. Traced in M1.4, see "B7 traced" below. Not fixed, because any fix changes the golden results; the lead decides.

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

**What an event costs.** A share of the horse's speed. Steadied and bumped lose it at once and build back at the usual rate (a bump costs both horses). Blocked is held to less speed for `blockedSeconds` and cannot go around. Each type happens to a horse at most once a race, a horse is in at most one event at a moment, and `maxEventsPerRace` caps the race. Rates are the chance of being unlucky, not of an event, so they read high: 0.3 for blocked gives about 2.6 percent of horses blocked per race.

**`luck.events` is required whenever a luck rate is above zero.** Validation says so (`validateData`, beside the instruction and bias rules), and names the field. The schema still marks the group optional so a card with every rate at zero needs none. The sim also throws clearly on unvalidated data, for a missing group and for a luck rate that is not a number from 0 to 1. The frozen golden inputs are a full current copy with the group present, and the reference results come in two sets from them: luck off (the model alone) and luck on.

**`SIM_VERSION` is 2, bumped with M1.5.** The same inputs with a luck rate above zero now give a different race, which by the rule in `runRace.ts` means a bump. With every rate at zero the results are byte-identical to before.

**A horse takes part in at most one bump a race, on either side.** A horse that has been in a bump, whether it started it or was run into, cannot be the other horse of a later one, and its own bump luck is used up. Before this, only the horse whose luck started a bump was limited, so one horse could be hit several times and lose up to a quarter of its speed each time. The other horse is still the nearest eligible one, the lower post if two are as close. `maxEventsPerRace` is a whole number from 0 to 20, the largest field.

**Known: an early bump can help a front-runner.** On the shipped card a bump in the first ten seconds gains the bumped horse 1.2 lengths on average (19 cases in 2,000 races), up to 14 lengths for the fastest front-runner. It drops back from the speed duel and saves itself, the same cause as "B7 traced" above. Left for the M1.6 tuning pass on the duel, not patched in luck.
