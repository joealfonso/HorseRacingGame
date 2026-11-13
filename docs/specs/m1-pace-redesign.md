# M1 spec: pace and reserve redesign (the early and move orders)

Status: draft for Joseph's review. Written 2026-11-12, against commit 284bf67 (`SIM_VERSION` 3). It extends `docs/specs/m1-race-sim.md` and changes none of its requirements, except where a second-pass target (V series) is amended below with the reason given.

Every number in this spec that is a target, a band, a seed count or a starting value is a starting guess until Joseph confirms it.

## Goal

Make the move orders (the 3/8 move, save it for the stretch) trade by the field the player can see, and stop rate early from being a free upgrade, without breaking any behavior the current tests protect. The brief wants every pre-race instruction to be a real choice, and two of them are not yet.

## Non-goals

- No new instructions, stats, running styles or UI. No change to the card's stats.
- No change to the result shape. The pace pressure in this spec is not reported in the result.
- No forced-pace input. Pace still comes from the field (open question 4 of the M1 spec, answered).
- Nothing about injuries, falls or pulling up. The welfare rule is untouched.
- No change to luck events, track bias or stay inside beyond keeping their tests green.

## Words used here

- **Reserve:** the 0 to 1 tank in `simulate.ts`. 1 at the gate.
- **Reserve at the 3/8 pole:** a horse's reserve the moment it first reaches 1,980 feet to go, running with no instructions. For a horse told to move at the 3/8 pole this is its reserve when the rider asks.
- **Equal horses:** speed, stamina and kick all 70.
- **Field H (speed-heavy):** the equal card the existing tests use. Equal horses, posts 1 to 8: front-runner, stalker, closer, front-runner, stalker, closer, front-runner, stalker. Three front-runners. "The equal card" means this field.
- **Field L (lone speed):** equal horses, posts 1 to 8: stalker, closer, stalker, front-runner, closer, stalker, closer, stalker. One front-runner, four stalkers, three closers.
- **Shipped card:** `src/data/card.json` as it is. Two front-runners.
- **Paired run:** the same seeds twice, once with one horse told something and every other horse on default. Neutral track, 10 furlongs, fast, luck as shipped.
- **Change:** the told horse's win share minus its default win share on the same seeds, in percentage points. Place is average finishing place, lower is better.
- **Style average:** the change averaged over every horse of that style in the field, each told in turn.
- **Hot and slow:** the pace label of the same seed with every horse on default.
- **Within-field spread:** the standard deviation, across horse-races, of one style's reserve at the 3/8 pole in one field.
- **Noise, from the record:** a per-horse paired figure moves about 0.6 points over all races at 4,000 seeds and about 0.4 at 8,000; 1 to 1.5 inside one pace label.

## The problem in plain words

The player can see how many front-runners are in the field. The move orders should pay off according to that: with one front-runner the pace is soft, so waiting leaves too much to do and the 3/8 move should pay; with three, the pace is hot, horses near it have been pulled along, and an early move runs out, so save it should pay.

Today neither happens. Which order pays follows the horse's own kick and stamina, in the reverse of racing sense, and the pace or the number of front-runners gives almost no signal. Rate early plus save it on a stalker is a free upgrade: plus 6.2 to plus 8.0 points of win share on equal horses, plus 2.8 to plus 6.5 on the shipped card.

The engineer's structural finding, accepted here: once a horse is asked, which order covers more ground to the wire depends on that horse's own reserve when the rider asks, not on the leader. So the orders can only trade by field if reserve at the ask differs by field by more than it varies race to race inside one field (0.07 to 0.09 today). It does not: a stalker on equal horses has 0.49 at the ask in hot races and 0.54 in slow ones. Two reasons, both from `docs/DECISIONS.md`: off-pace horses run their own effort inside a window of lengths behind the leader, so a hot half reaches them weakly; and a lone front-runner is pressed by stalkers 2 or 3 lengths back, so it led at the first call in only 23 percent of races and a field with one front-runner ran its half only 0.27 seconds slower than one with three.

Three model changes were tried and dropped, each for a reason this design must avoid:

1. **Selection effect.** Letting only front-runners fight for the lead made lone-speed fields slow, but then a hot half mostly meant a fast front-runner that day, and front-runners won more hot races than slow ones. That breaks B6.
2. **Closers cannot be both.** In the current economy closers are either short of reserve in a hot race (needed for V1) or helped by one (B6), not both.
3. **Fixing stalkers boosts front-runners.** Rules that took the free upgrade from a rated stalker made rating a front-runner worth 4 to 8 points against U1's limit of 2. A front-runner rated and then sent at the 3/8 pole is already plus 4.3 on equal horses.

## Candidate mechanisms

### C1. Pace pressure: a speed duel pulls the field along (chosen)

**In racing words.** When two or more speed horses hook up and fight for the lead, the whole field runs faster than it wants to. The horses sitting just off the duel are dragged along the most; closers far back feel it least; and a horse whose rider has taken hold (rated) feels it only as much as tuning says. When nobody is fighting for the lead, nobody is dragged. A lone front-runner still gets pressed by whoever sits near it, exactly as today.

**What it is.** A single race-wide number, pace pressure, from 0 to 1. It rises while a speed duel is on and fades after it ends. Before the ask, every horse that is not leading and not pressing for the lead runs above its usual effort by its style's pull times the pressure. Everything else in the early-effort rules stays as it is.

**Why reserve at the ask differs by field.** A duel needs two front-runners. Field L has one, so its pressure is always 0 and its races are exactly today's. Field H has three, duels are common, and every stalker and closer in it spends more before the 3/8 pole. By arithmetic from the shipped tuning (`aerobicShare` 0.93, `drainPower` 2, ignoring rhythm), a stalker draining at an effort of 1.005 uses about 1.56 times the reserve per second it uses at 0.99, so a pull of a couple of hundredths of effort over part of the first mile is the size of change needed. Whether it actually reaches a gap of 0.07 to 0.09 is what the probe (Step 1) finds out.

**Against the three failure modes.**
- *Selection effect.* Pressure comes only from front-runners fighting, never from how fast the leader is going. A lone leader on a good day pulls nobody. The rule that lets anyone within `loneLeadLengths` push the leader is unchanged, so lone-speed fields do not turn into unpressed sprints home, which is what sank the earlier attempt. In a hot race the duelling front-runners paid and now the stalkers paid too, so the B6 front-runner half should hold or strengthen.
- *Closers cannot be both.* B6 is relative: closers must win more of the hot races. V1 is absolute: a closer's own reserve must be lower in a speed-heavy field. Pressure gives both at once because it costs every style in the same races, front-runners most (they duelled), stalkers next, closers least. Closers lose some reserve in absolute terms and still gain on everyone ahead of them. In the old economy the only way to cost closers in a hot race was to hold them close to the leader, which also put them in range in slow races.
- *Fixing stalkers boosts front-runners.* Pressure adds no rule that helps a rated horse. Today a rated front-runner runs a flat 0.97 while the others duel. Under pressure it also feels the pull, scaled by `ratedPullShare`, so dodging a duel saves less than today. That is one knob that lowers the front-runner side, the opposite of the rejected rules. The risk that being pulled keeps a rated front-runner closer to the lead, as rejected rule (a) did, is real and measured in the probe report (P10).

### C2. The rider reads the fractions (rejected, kept as a fallback to discuss)

The 3/8 move costs more reserve, by a tuned amount, when the half-mile split so far is faster than par. It acts only on told horses, so every default race stays byte-identical, which makes B6, U4 and F2 to F5 safe by construction. I reject it because it is not the reason V1 asks for: the horse has not been pulled along, the rule just charges it more. It also makes the order trade by pace label, which the player cannot see, not by field, and it turns the pace pars (fitted to the shipped card's quartiles) into a game rule. It does not make reserve at the ask differ by field, so it cannot pass the probe as specified. See open question 4.

### C3. Off-pace horses track the leader's speed (rejected)

Replace the lengths windows with speed tracking: stalkers and closers match the leader's speed, so a fast leader drags them along one for one. Reserve then follows the leader's tempo, but the tempo barely differs by field today (0.27 seconds on the half), so the reserve gap stays small unless lone-speed fields are made slow, which is the rejected rule again. It also brings back the selection effect in its worst form (a strong lone leader pulls everyone by its own ability) and pulls closers as hard as stalkers, which breaks the closer half of B6. It fails all three.

### C4. Stalkers sit behind a lone leader instead of pressing it (rejected)

Shorten the push so only a horse at the leader's girth presses it. This is the rejected "only front-runners fight for the lead" in a softer form, and it fails the same way: an unpressed lone leader makes the half follow the leader's own form, which is the selection effect, and slow races become sprints home. Nothing in it is different from the attempt that was dropped, so it is not re-proposed.

### Why C1

It is the only candidate that makes reserve at the ask differ by the field the player sees, ties the cost to the contest rather than to ability, and leaves every field with fewer than two front-runners exactly as it is today. That last property also makes it cheap to prove safe: fields with zero or one front-runner (B1 to B3 for stalkers and closers, B7's lone front-runner, U4's lone field, F2's stalker and closer fields) cannot move at all.

## The chosen model

### New rules

1. **A speed duel.** At each step, a duel is on when at least two front-runners are within `frontRunnerPace.pressLengths` of the leader (a leading front-runner counts at 0 lengths). Only front-runners that have not been asked and are not running under a rate early order count. Two is the definition of a duel, not a tuning value. `pressLengths` is reused so a duel is exactly today's press.
2. **Pace pressure.** One number per race, starting at 0. Once per step, from the field as it stands at the start of the step and before any horse moves: `pressure += (duel - pressure) * min(1, step / pressureSeconds)`, where duel is 1 or 0. It is computed from the sorted standings, so the order horses are listed or processed in cannot change it (S4).
3. **Pull.** Before its ask, a horse that is not the leader and is not a front-runner pressing for the lead (within `pressLengths`) runs at its usual early effort plus `pull[style] * pressure`. The usual effort still comes from today's rules, windows and steps included.
4. **Rated horses.** A horse rating early runs at its rated effort plus `ratedPullShare * pull[style] * pressure`.
5. **Asked horses and leaders** feel no pull. Nothing changes after the ask.
6. **Off means unchanged.** With the `pacePressure` tuning group absent, or every pull at 0, or fewer than two front-runners in the field, every race is byte-identical to today apart from the echoed tuning.

No new random numbers are drawn. If the engineer finds one is needed, it goes on a new named stream and the reason goes in DECISIONS.md.

### What changes in the code

- `src/sim/tactics.ts`: `earlyEffort` and `ratedEffort` take the race's pressure and add the pull from rules 3 and 4. Nothing in them is removed. Both must stay callable with today's arguments (pressure treated as 0), because `tuningPass.test.ts` calls them directly.
- `src/sim/simulate.ts`: holds the race's pressure, updates it once per step as in rule 2, passes it to both functions. Nothing is removed.
- `src/data/schema.ts` and `src/data/tuning.json`: the new group below.
- `src/sim/runRace.ts`: `SIM_VERSION` goes to 4 in Step 5.
- A reserve diagnostic for scripts and tests: for given inputs and a seed, each horse's reserve at the moment it first reaches a given distance to go. It lives under `src/sim/`, follows the sim rules, and does not change `runRace` or its bytes. How it is exposed is the engineer's call.
- `profile.ts`, `instructions.ts`, `luck.ts`, `lanes.ts`: no change, unless the Step 2 fallback rule is approved.

### Tuning values

| Value | Meaning | Unit | Bounds | Starting guess |
|---|---|---|---|---|
| `pacePressure.pressureSeconds` | How quickly pressure follows a duel starting or ending | seconds | above 0, at most 60 | 8 |
| `pacePressure.pull.frontRunner` | Effort added at full pressure to a front-runner that is off the lead and not pressing | share of cruise, as `earlyEffort` | 0 to 0.1 | from the probe grid |
| `pacePressure.pull.stalker` | The same, for a stalker | as above | 0 to 0.1 | from the probe grid |
| `pacePressure.pull.closer` | The same, for a closer | as above | 0 to 0.1 | from the probe grid |
| `pacePressure.ratedPullShare` | Share of its style's pull a horse rating early still feels | share | 0 to 1 | 1 |

Existing values that later milestones may retune: `instructions.earlyMoveGearShare`, `instructions.saveForStretchKickShare`, `instructions.rateEarlyEffortDrop`, `instructions.rateEarlyUntilShare`, and the pace pars (`paceParHalfMile`). Retuning an existing value is not a schema change.

### Schema changes (ask first)

1. **New optional top-level tuning group `pacePressure`**, beside `instructions` and `trackBias`, holding the five marked values above (`pull` is one marked value by style). Absent means no pressure. When present, every value is required and each carries a status, as V3 of the M1 spec requires. Optional for the same reason the instruction and bias groups are: the frozen golden inputs stay valid and keep proving "off means unchanged" until Step 5.
2. **Conditional, only if Step 2's fallback is needed: `instructions.earlyMoveDrainFloorShare`.** While a horse told to move at the 3/8 pole is asked, its reserve drains as if its speed were at least this share of its kick gear. 0 turns it off. Unit: share of kick gear. Bounds 0 to 1. Starting guess 0.99 (the value used in the dropped State A, where it applied to every asked horse; here it applies only to told 3/8 movers, so default races, and with them U4 and F3, do not move). Adding it makes the `instructions` group one value longer, so the frozen `inputs.json` and the I1 "loud" test need it too (see "What must not change").

## Milestones

All five run on one branch and merge once, so `SIM_VERSION` changes once (open question 7). Each leaves `npm test` green and could merge on its own.

1. **Step 1. Feasibility probe.** The mechanism alone with rough values. Gate with a stop rule.
2. **Step 2. The move orders.** Refit the pace pars once, then V1 and V2.
3. **Step 3. The free upgrades.** V3 and the front-runner combination V6, with U1.
4. **Step 4. Fairness.** U3 to U8, the nine batch checks.
5. **Step 5. Reference results and version.**

Every milestone also requires: every behavior test passes unchanged, `npm run lint` and `npm run typecheck` are clean, and T3 holds.

### Step 1. Feasibility probe

Done before any tuning. The probe runs one fixed grid, chosen now, with `pressureSeconds` 8 in every setting:

| Setting | pull.frontRunner | pull.stalker | pull.closer |
|---|---|---|---|
| a | 0.02 | 0.02 | 0.01 |
| b | 0.02 | 0.02 | 0.016 |
| c | 0.035 | 0.035 | 0.0175 |
| d | 0.035 | 0.035 | 0.028 |

The baseline is the same code with the group absent. Measurements for P6 and P7 use seeds 100000 to 101999; for P8 and P9, seeds 100000 to 103999. The measuring script lives in `scripts/` and is not part of `npm test`.

**Build checks (in `npm test`):**

- **P1. Off means unchanged.** With the group absent, the golden test, I1 and L1 pass with no change to any file.
- **P2. Zero pull is off.** With the group present and every pull at 0, results equal the group-absent results on 40 seeds of the shipped card and field H, apart from the echoed tuning.
- **P3. No duel without two front-runners.** On a field of eight equal stalkers, eight equal closers, and field L, results with setting d equal the group-absent results on 40 seeds, apart from the echoed tuning.
- **P4. Each pull reaches its own style only.** On a field with no closers, changing `pull.closer` alone changes no result apart from the echo. On field H, raising `pull.stalker` alone changes at least one result in 40 seeds.
- **P5. Determinism.** S1 to S4 and the luck draw-isolation tests pass with the group present at setting d. The stream name list is unchanged. The reserve diagnostic and `runRace` give the same finish order and times for the same seed.

**Gate (measured by the script, reported with numbers):**

- **P6. Stalkers' reserve differs by field.** Mean reserve at the 3/8 pole for stalkers, field L minus field H, is at least the larger of the two within-field spreads.
- **P7. Closers' reserve differs by field.** The same for closers.

Why one spread is the bar: at 284bf67, between the top and bottom quarter of reserve at the ask, the 3/8 move went from about plus 5 to plus 1 and save it from about minus 5 to minus 1.5 (DECISIONS.md, the U2 known gap). That is roughly 3 points of 3/8 move minus save it per spread of reserve. V1 needs the two fields at least 2 points apart, so a gap of one spread is about the least that can carry it.
- **P8. B6 holds on the equal card.** On field H, closers win a larger share of hot races than of slow ones and front-runners a smaller one, and each of those two gaps is no more than 1 point smaller than at the baseline on the same seeds. The existing B6 test passes.
- **P9. B6 holds on the shipped card.** The same on the shipped card.

**Report only (not a gate), for the baseline and the setting that passes:**

- **P10.** Mean leader's half in fields L and H. Hot and slow shares on field H and the shipped card; if either share on the shipped card is outside 15 to 35 percent, the pars are refit (as in Step 2) and P8 and P9 are checked again before deciding. U4's three-front-runner share (160 seeds by 8 rotations, as the U4 test does). F3 per style on field H, 2,000 seeds. On 2,000 paired seeds: 3/8 move minus save it, style average, for stalkers and closers in L and in H (the crossover preview); and on field H, rate early and rate early plus save for each stalker, rate early and rate early plus the 3/8 move for each front-runner (the early warning for Step 3).

**P11. Landing.** If a setting passes P6 to P9, it becomes the shipped `pacePressure` group only if every existing test passes with it. If some test fails, the shipped tuning leaves the group out (the repo stays green, the mechanism is off) and the failures are reported with numbers before Step 2 starts.

**Stop rule.** Settings are tried in the order a, b, c, d, and the first that passes P6 to P9 together is used. If none passes, the engineer stops. No other settings, no new rules, no retuning of any other value. The report gives, for the baseline and every setting, the numbers behind P6 to P10. Joseph decides what happens next (open question 4). If P6, P8 and P9 pass and only P7 fails, that is also a stop (open question 3).

### Step 2. The move orders

First, once: refit the pace pars for every distance from 5 to 12 furlongs on fast at the 25th and 75th percentile of the leader's half on the shipped card (3,000 seeds), and scale the other goings by their time percent, as the first tuning pass did. The pars then stay fixed through Step 4.

Then tune `earlyMoveGearShare` and `saveForStretchKickShare` (and the pulls, if needed) so the crossover between the two orders sits between field L's and field H's reserve. All measured on 4,000 paired seeds, equal horses, seeds 110000 to 113999.

- **V1. The move orders trade by field (kept).** In field L, for stalkers and for closers, the 3/8 move beats save it by at least 1 point of win share, style average, and has a better average place. In field H, save it beats the 3/8 move by the same measure.
- **V2. Each move order pays somewhere (kept, measures stated).** Against no instruction: in field L the 3/8 move's style average is at or above minus 0.5 points for stalkers and for closers, and its average place is no worse than default by more than 0.02 places. In field H the same holds for save it. Each is below 0 points in the other field. The mean of the L and H figures for each order stays between minus 2 and plus 2.
- **V4. The horse still matters (kept, report only).** A stalker with stamina 85 and kick 55, and one with kick 85 and stamina 55 (speed 70), each placed as a stalker in L and in H: report 3/8 move minus save it. If this fights V1, V1 wins.
- **V7. The shipped card leans the right way (new, report only).** For the shipped card's stalkers and closers, report 3/8 move minus save it over all races, in hot races and in slow ones. It has two front-runners, so it sits between L and H and no band is set.

**Fallback.** If V1 or V2 cannot be met by tuning alone, and Joseph has approved schema change 2, the engineer may add `earlyMoveDrainFloorShare`. Nothing else. If V1 or V2 still fails, stop and report with numbers.

Expect to need it. In the second tuning pass a horse that ran out after an early ask settled near cruising speed almost for free, so moving too soon cost nothing (DECISIONS.md, second pass). The engineer's report from that pass adds that with the floor taken out the two orders did not trade at all. Tuning alone is still tried first, because a rule that is not needed should not go in.

### Step 3. The free upgrades

Tune `ratedPullShare`, `rateEarlyEffortDrop` and `rateEarlyUntilShare`. Step 2's values may move only if V1 and V2 still pass afterwards. Measured on 4,000 paired seeds, seeds 120000 to 123999.

- **V3. No free upgrade from rating a stalker (kept).** On field H, for each stalker, rate early alone and rate early plus save it each stay between minus 3 and plus 3 over all races. In field L both lose: style average below 0 and no stalker above plus 0.5. No combination of two or three non-default slots on one horse (there are seven) is above plus 3 for any horse on field H or plus 4 for any horse on the shipped card.
- **V6. A rated front-runner sent early is not free (new).** For each front-runner on field H, rate early plus the 3/8 move is at most plus 3 over all races (it is plus 4.3 at 284bf67). For each front-runner on the shipped card, at most plus 4. This is inside V3's combination clause and is named on its own because it is the one no stalker rule reaches.
- **U1 still holds.** On field H, for each front-runner, rate early alone is between minus 2 and plus 2 over all races and better in hot races than in slow ones. On the shipped card, better in hot than in slow.

**Stop rule.** If V3 or V6 cannot be met with these values without breaking V1, V2 or U1, stop and report with numbers. Do not add a rule (open questions 5 and 6).

### Step 4. Fairness

Nothing new is built here unless a check fails, in which case Step 2 and Step 3 values may move only if their criteria still pass.

- **U4.** Field of one front-runner among four stalkers and three closers, rotated through all eight posts, 4,000 seeds each (32,000 races): the front-runner wins 12.5 percent, give or take 0.75. This field has no duel, so it cannot move from today's 12.98 unless something outside this spec changed. With three front-runners, three stalkers and two closers, each front-runner wins at least 11.25.
- **U5.** The existing U5 tests pass.
- **U6.** `npm run batch` on seeds 0 to 9999 and 10000 to 19999: all nine checks pass on both (F2 for each style, F3, the three F4 bands, the F5 low and high). On the shipped card no style averages under 11 percent per horse. No card re-stat: if U6 can only be met by changing the card, stop and ask.
- **U7.** From the same batches, the per-post slope of win share is no steeper than minus 0.45 points per post for any style.
- **U3.** The existing U3 tests pass. Report stay inside on a neutral track for every horse on both cards.
- **U8.** The winner's median time is between 2:01.00 and 2:03.00 on both batch ranges.

### Step 5. Reference results and version

- **G1.** `SIM_VERSION` is 4, with a line in `runRace.ts` saying why: a speed duel now pulls the field along, and the instruction values were retuned.
- **G2.** `src/sim/golden/inputs.json` gets the `pacePressure` group by hand, at the shipped values, and (if added) `earlyMoveDrainFloorShare`. Its other values stay frozen. Every golden file is regenerated on purpose. The luck-on seeds are re-picked only if one of them no longer has an event or the three no longer cover all three types.
- **G3.** The intentional test updates listed below are made by the test-writer, each named in the PR description.
- **G4.** DECISIONS.md gets the pressure rule, the probe numbers, the refit pars and every retuned value, two or three lines each.
- **G5.** The playtester re-measures V1, V2, V3, V6, U1, U4 and U6 on fresh seeds (40000 to 47999 for paired runs, 20000 to 29999 for the batch) and every one holds within the noise stated in "Words used here".

## Edge cases and states that can happen

- No front-runners in the field: pressure is always 0 (P3).
- One front-runner: pressure is always 0, even when a stalker leads and the front-runner presses it. That is a fight between a speed horse and a stalker, not a duel, by rule 1.
- All eight front-runners (B1's front-runner field, B5, F2's front-runner field): a duel is on almost all the time and pressure sits near 1. Every front-runner that has been outrun settles like a stalker plus `pull.frontRunner`.
- The break: the field is bunched for the first seconds, so a field with two or more front-runners counts a duel at once. That is honest (speed horses break and go at it) and `pressureSeconds` smooths it.
- A stalker leads with two front-runners pressing it: a duel, by rule 1.
- A rated front-runner never counts toward a duel while it is rating, and an asked front-runner never counts.
- A duel that ends: pressure fades over about `pressureSeconds`, so the field keeps paying for a short while after.
- Distances from 5 to 12 furlongs and every dirt going: no special case. Pressure is in seconds.
- Stay inside, track bias and luck apply on top, in the same order as today (the tuck-in drop and the bias drain multiply after the effort).
- Field of 2 and field of 20: the rule is the same.

## Dependencies and sequencing

1. Joseph approves schema change 1 before Step 1 starts. Schema change 2 can be approved now or when Step 2 needs it.
2. Step 1 must pass its gate before anything else. Step 2 starts with the par refit. Step 3 needs Step 2's values. Step 4 checks everything together. Step 5 last.
3. The playtester runs the headless harness after Step 2, Step 3 and Step 4, per CLAUDE.md.
4. Opus for the model and tuning work, per CLAUDE.md. code-reviewer and test-writer check each milestone.

### Which existing tests can move at all

Only fields with two or more front-runners change. That is: the B1 to B3 front-runner fields, B4, B5, B6, F2's front-runner field, F3, I2 to I5 (field H), I4 on the shipped card, I6, U1, U3, U5 and everything on the shipped card. The stalker and closer fields of B1 to B3, F2 and B7, the lone front-runner B7 test, and U4's lone field cannot move.

## What must not change

Every behavior test passes unchanged: B1 to B9, I1 to I7, L1 to L5, O, S, R, V (data), T3, U1, U3, U4, U5, the F2 to F6 counting tests, post fairness and the welfare checks.

These pin a mechanism, a version or a chance seed rather than a behavior. Only the test-writer updates them, on purpose, and each update is named in the PR:

- `tuningPass.test.ts`, "SIM_VERSION is 3": to 4 (Step 5).
- `src/sim/golden/*.json`: regenerated (Step 5). `inputs.json` hand-edited as in G2. The header comment in `golden.test.ts` gets a "regenerated for the pace redesign" note.
- `batch.test.ts`, seed 315 (a margin of exactly one length): a new seed found by search if 315 no longer gives 1000.
- `batch.test.ts`, "the 1/4 pole must not give the same answer on this range" (seeds 7000 to 7030): a new range only if the two counts now coincide.
- `tuningPass.test.ts`, the U1 effort check calls `earlyEffort` and `ratedEffort` directly: changes only if their signatures cannot stay as they are.
- `instructions.test.ts`, I1's "loud" test builds the `instructions` group by hand: gets the new key only if schema change 2 lands.
- Measured numbers quoted in test comments may go stale. Thresholds do not change.

New tests are added for P1 to P5, the `pacePressure` validation (missing value, out-of-range value, each rejected with the field named; group absent accepted; shipped tuning carries the group), and light fixed-seed versions of V1, V2, V3, V6 that pin direction with tolerances chosen from measured noise, as the existing tuning-pass tests do.

I do not believe any existing behavior test is wrong.

## Engineering constraints

- Seeded and deterministic. Same inputs and seed, same bytes. No `Math.random`, clock or banned `Math` function in `src/sim/`. Pressure draws nothing; any new draw would go on a new named stream so old streams do not shift.
- No global state. Pressure lives inside one call to `simulate`.
- Result units stay whole numbers. The result shape does not change.
- Every tuning value lives in `src/data/tuning.json`, marked, validated.
- No new instructions, stats, UI or card re-stat. I do not think a re-stat is needed. If U6 says otherwise, stop and ask.
- T3 holds: median under 20 ms, never over 100 ms, 10,000 batch races under 5 minutes. Pressure adds one pass over the running horses per step.
- `SIM_VERSION` goes to 4, and reference results are regenerated on purpose, in Step 5.
- Nothing touches the welfare rule.

## What is locked and what will change

Locked once Joseph approves: a duel means two or more front-runners pressing; pressure is one race-wide number fed only by duels; the pull acts before the ask on horses not leading or pressing; off means unchanged (group absent, zero pull, or fewer than two front-runners); the probe gate and its stop rule; fields L and H as defined.

Likely to change: every pull, `pressureSeconds`, `ratedPullShare`, the retuned instruction values, the pars, the V bands, and the golden files.

## Risks and open questions

**Risks.**

- **Scarcer reserve in field H raises the value of saving it.** Rate early and save it both save reserve, so making H costlier may make rate early plus save on a stalker worth more there, not less (V3). The P10 report shows this early; `ratedPullShare` is the knob; Step 3 stops if it cannot be met.
- **A pulled rated front-runner stays closer to the lead.** That is how rejected rule (a) made rating front-runners worth plus 8.5. P10 reports rate early per front-runner on H at the probe setting.
- **The window rules partly cancel the pull.** A pulled stalker that gets inside `stalkerMinLengths` eases, so the reserve gap may be smaller than the arithmetic suggests. That is why the probe exists.
- **Front-runner-only fields** run under near constant pressure. F2's front-runner post shares and B1's front-runner case are the tests to watch.
- **The par refit changes which races are hot.** B6, U1 and I4 are re-checked after it.

**Open questions,** each with my recommendation.

1. **Approve schema change 1** (the optional `pacePressure` group, five values)? Recommend yes. It is the whole mechanism.
2. **Approve schema change 2 now,** used only if Step 2 tuning fails? Recommend yes, conditionally, so Step 2 does not stall waiting for an answer.
3. **If only P7 fails** (stalkers' reserve differs by field, closers' does not, B6 holds): continue with V1 for stalkers only, and hold closers to I4 and to V2's "save it is not a loss in H"? Recommend: stop as the rule says, then yes, continue narrowed, because closers waiting is already their natural order and I4 protects it.
4. **If the probe fails outright:** build C2 (the rider reads the fractions), or accept the known gap for M1? Recommend neither in M1. C2 fakes the reason V1 asks for. Instead, let the M1 gate accept the move orders as they are (trading by the horse, per V4's direction once fixed) and reopen V1 when jockeys gain pace judgment in M2, which the brief already lists.
5. **V3 on the equal card.** Field H has three front-runners, so it is exactly where V1 and V2 want waiting to pay, and rate early is another way to wait. V3's plus 3 cap on H may fight V2. Recommend keeping V3 as written. Only if Step 3 stops on it, adopt V3b: rate early alone and rate early plus save lose in L by at least 1 point (style average), the mean of L and H is between minus 3 and plus 3, and no combination exceeds plus 6 in either field alone. That makes it a trade by field, which is what "not free" means.
6. **If V6 cannot be met with the knobs:** add a combination rule (a horse that was rated picks up more slowly when sent before its usual point, one new value), or accept the by-field form from question 5? Recommend the by-field form first, if rate early plus the 3/8 move loses in L by at least 2 points; otherwise the rule, which is a further schema change to ask about.
7. **One branch, one merge, one version bump?** Recommend yes. If milestones merge to `main` separately, each merge that changes a result for the same inputs needs its own bump.
8. **Should "a duel needs two front-runners" ignore a lone front-runner pressing a stalker that leads?** Recommend yes. The player can count front-runners, so the signal should follow that count.

**Decided (2026-11-12).**

- Questions 1 and 2 are schema changes, so they wait for Joseph. Nothing is built until he says yes to question 1.
- 3: as recommended. Stop, report, then continue for stalkers only.
- 4: as recommended. If the probe fails, C2 is not built. The move orders stay a known gap for M1 and V1 reopens with jockey pace judgment in M2.
- 5: V3 stays as written. V3b is used only if Step 3 stops on V3.
- 6: the by-field form first. A new rule is a further schema ask.
- 7: one branch, one merge, one version bump.
- 8: yes. A lone front-runner pressing a stalker that leads is not a duel.

## Out of scope

- Reporting pressure or "speed duel" in the result, the race view or commentary. A later designer question.
- Jockey pace judgment and any rider skill (M2).
- Temperament, fitness and fatigue (M2).
- The card's stats and names.
- Stay inside on a neutral track costing closers 1.5 to 2 points (a first-pass leftover, not part of this redesign).
- The early-fractions-run-slow known limit and the run-up.
- Browser determinism.
