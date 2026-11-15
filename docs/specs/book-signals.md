# Book signals: what is true about how races come out

Measured, not designed. Data: the cached 500-day bet harness run (`/tmp/claude-501/betharness/sim3-v1-stable9d054002-rules46465645/day-1..500.json`), 4,000 races, 32,000 horse-starts. Every race is 10 furlongs, fast dirt, neutral track, eight horses. "True chance" is (crowdWins + holdWins) / 2000 for that horse in that exact field. "Actual win rate" is the one real race per field (n = 4,000), so it carries about 0.5 point of noise per 4,000 starts and is shown only as a cross-check. Where I say lift, I mean true chance divided by 12.5 percent. Error bars are 95 percent, from the spread of true chance across starts; they do not include the 0.2-point noise in each estimate (negligible at this size).

"Log-odds" below means the within-field fit of log(true chance) on the listed terms (see rerun section). A log-odds gap of 0.1 is about a 10 percent relative change in chance.

## Summary

### True and strong enough to print

1. **A horse's total (speed + stamina + kick) rank in the field is the best single fact.** Highest total wins 36.7 percent (2.9x the 12.5 base); second 22.9; third 15.1; fourth 10.0; fifth 6.7; sixth 4.5; seventh 2.8; eighth 1.4. Highest total beats the highest of any single stat (speed 26.0, stamina 26.4, kick 29.8 percent). The totals alone explain about 94 percent of the within-field spread in log-odds.
2. **Each of the three stats is worth about the same per point: roughly 7 to 8 percent relative chance per point** (log-odds per point: speed 0.066, stamina 0.076, kick 0.084 in a linear fit). Stamina is not special at 10 furlongs. Speed spreads widest across the stable (sd 10.7 vs 6.9 stamina, 7.8 kick), so a speed gap is usually the biggest single swing between two horses, but a point of kick or stamina is not worth less.
3. **The field matters as much as the horse.** Every 5 points added to the rivals' average total multiplies a horse's chance by about 0.70 (per-horse range 0.53 to 0.87). Same horse, weakest third of its fields against strongest third, averaged over the 40 horses: 16.6 vs 9.0 percent (1.84x). For the 10 best horses: 36.4 vs 23.0 percent. For the 10 worst: 3.4 vs 1.1 percent.
4. **A lone front-runner gets a real edge.** Exactly one front-runner in the field (507 races): 14.9 percent true chance, and about 30 percent better than stats alone predict (log-odds +0.26 ± 0.02). With two front-runners the edge falls to about +6 percent, with three or more it is gone (-2 to -3 percent).
5. **A crowded lead helps closers.** A closer's chance by number of front-runners in the field: 0 or 1: 10.6 percent; 2: 11.8; 3: 12.7; 4: 13.8; 5 or more: 14.4. Against what stats alone predict that is about -10 percent with 0 or 1 front-runner, and +12 percent with four, +19 percent with five or more. The measure of "crowded" that works is count of front-runners. Two fast front-runners (speed 88 or more) in the field is the same signal (closers +12 percent).
6. **Inside posts beat outside posts, and it costs front-runners most.** True chance by post 1 to 8: 12.7, 13.0, 13.0, 13.1, 12.1, 12.0, 12.4, 11.8 percent. Stat-adjusted post 1 to post 8 is about 16 percent relative (log-odds +0.06 to -0.09); for front-runners about 25 percent (+0.09 to -0.13); closers about 10 percent (+0.06 to -0.04).

### True but weak (printable only as small print)

- A lone stalker is about 12 percent worse than stats predict (9.4 percent true chance, log-odds -0.13, n = 543).
- A stalker in a field with 0 or 1 front-runners is about 5 percent better than stats predict; with 5 or more, about 6 percent worse.
- The top-total horse's chance rises both with its lead over the field average (0.047 log-odds per point) and, a little, with its gap to the second horse (0.013 per point). Inside the same lead bucket a gap of 9 or more adds about 3 points of win chance over a gap of 0 to 3. Rank and lead over the field are the stronger statement.
- A horse's very high or very low stats pay off less than the straight line says (diminishing returns; the fits put most of it in stamina, but the three square terms trade off against each other, so the split between stats is not stable). The best total-250 horses win a little less than a linear rule predicts (own-total quintile residual: -0.12 at the top, -0.15 at the bottom, +0.17 in the middle).
- Style by itself: front-runners 13.0 percent, stalkers 12.2, closers 12.2 true chance on average. Style tells you about the field, not about the horse.

### False, must never be hinted

- **A second start on the same day**: 12,000 second starts won 1,500 times against 1,500.0 expected from true chance (ratio 1.000 ± 0.044). Paired change in true chance second minus first: +0.06 ± 0.11 points. There is no tiredness, no warm-up. The sim has no day memory at all (checked in src/sim and src/bet: nothing carries a race result or start count into a later race).
- **Won yesterday**: horses that won yesterday won 1,249 times against 1,272 expected from their true chance in today's fields (ratio 0.982 ± 0.046). Their true chance tomorrow equals their own long-run rate (ratio 1.004). They win more than other horses (21.3 percent vs 10.5 percent) only because the winners are the good horses.
- **Won earlier today**: 329 wins against 341 expected (0.965 ± 0.09). Nothing.
- **"Front-runners that fight for the lead pay for it" as a penalty you can see in the book**: raw front-runner win rate does not fall as the field adds front-runners (2 front-runners 13.5 percent, 3: 13.0, 4: 12.7, 5+: 12.7; stat-adjusted -3 percent flat from three up). What shows up instead is the lone leader's bonus (item 4) and the closers' gain (item 5). The size of the speed gap between two front-runners makes no difference (stat-adjusted +0.05 to +0.08 in every gap bucket).
- **Stamina as a "distance" edge**: at the one distance this sim has, a point of stamina is worth the same as a point of speed or kick.

### Bonus: prices

True-chance return per $1 at the crowd's prices (no player bet in the pool; every group below is under 1.00). Blind baseline for all 32,000 starts: 0.804. (Takeout is 17 percent; the rest of the gap to 0.83 is price rounding.) The crowd's price depends on the style: front-runners 0.732, stalkers 0.791, closers 0.892. A closer in a field with 5 or more front-runners returns 0.951 (±0.024, n = 455). The stamina leader returns 0.929, the kick leader 0.894, the total leader 0.848, the crowd's favourite 0.788 (wins 36.1 percent), the shortest prices (under $2 back per $1) 0.766. Nothing in the book is a way to beat the pool; the best groups still lose about 5 to 7 cents per dollar. The "actual" returns from the 4,000 real races are far too noisy to say anything (± 0.1 to 0.4).

## Q1. Stat leaders, stat weights, gaps

Definitions: within each field, pick the horse with the single highest value; if two or more tie for the top, skip that race. `ties` is how many of the 4,000 races were skipped. Total = speed + stamina + kick.

| Pick | Races used (ties skipped) | True chance | Actual win rate | Lift | EV per $1 at crowd price |
|---|---|---|---|---|---|
| Highest speed | 3,813 (187) | 26.0 ± 0.4 | 24.7 | 2.08x | 0.790 |
| Highest stamina | 3,802 (198) | 26.4 ± 0.4 | 26.4 | 2.11x | 0.929 |
| Highest kick | 3,683 (317) | 29.8 ± 0.4 | 29.9 | 2.39x | 0.894 |
| Highest total | 3,944 (56) | 36.8 ± 0.3 | 36.7 | 2.94x | 0.848 |

By total rank, all 4,000 fields, ties broken arbitrarily:

| Rank | True chance | Actual | Lift | EV per $1 |
|---|---|---|---|---|
| 1 | 36.7 | 36.6 | 2.93x | 0.848 |
| 2 | 22.9 | 22.6 | 1.83x | 0.858 |
| 3 | 15.1 | 14.9 | 1.21x | 0.857 |
| 4 | 10.0 | 10.0 | 0.80x | 0.854 |
| 5 | 6.7 | 6.7 | 0.54x | 0.841 |
| 6 | 4.5 | 4.9 | 0.36x | 0.809 |
| 7 | 2.8 | 2.4 | 0.22x | 0.743 |
| 8 | 1.4 | 1.8 | 0.12x | 0.618 |

Stat weights. Within-field fit of log(true chance) on the three stats (each field centred): speed 0.0660, stamina 0.0757, kick 0.0842 log-odds per point; R2 0.938. A straight "percentage points of chance per stat point" fit (true chance minus 12.5, on stats minus field mean) gives 0.70, 0.78, 0.73 points. With squares and cross terms R2 rises to 0.965, and to 0.970 with style, post and pace terms: the extra is diminishing returns (see Q7). Marginal value of one point from the quadratic fit, other stats at 72: speed 0.084 to 0.056 (stat of 58 to 94); stamina 0.214 to -0.07; kick 0.114 to 0.047. Read that as "stamina and kick pay most from a low base and level off at the top", not as the exact curve; the quadratic extrapolates past the data at the corners.

Gap between top and second (by total), top horse's true chance:

| Gap to second | n | True chance | Actual | Lift |
|---|---|---|---|---|
| 0 (tie) | 56 | 27.3 ± 1.4 | 28.6 | 2.18x |
| 1 to 3 | 1,024 | 32.4 ± 0.5 | 30.8 | 2.59x |
| 4 to 7 | 970 | 32.7 ± 0.4 | 32.7 | 2.62x |
| 8 to 12 | 876 | 36.6 ± 0.4 | 38.9 | 2.93x |
| 13+ | 1,074 | 44.9 ± 0.5 | 44.3 | 3.59x |

The gap is mixed up with the top horse's lead over the whole field. Separated: top horse's total above the field average, with gap:

| Lead over field average | Gap 0 to 3 | Gap 4 to 8 | Gap 9+ |
|---|---|---|---|
| under 20 | 26.2 (n 422) | 27.8 (359) | 31.1 (96) |
| 20 to 26 | 32.9 (407) | 33.1 (516) | 36.3 (497) |
| 26 and over | 40.8 (251) | 37.7 (323) | 45.8 (1,129) |

Fit of logit(top horse's chance) on lead and gap: 0.0467 per point of lead, 0.0128 per point of gap. Both matter; lead over the field matters about 3.6x as much per point.

## Q2. Running style and the shape of the pace

Races by number of front-runners: 0: 103, 1: 507, 2: 1,049, 3: 1,221, 4: 776, 5: 291, 6: 50, 7: 3. The stable is 14 front-runners, 13 stalkers, 13 closers. Mean total by style is nearly equal (222.7, 219.6, 220.6), so these tables are not hiding a strength difference. Style stats differ: front-runners average 84/70/68, stalkers 73/73/73, closers 63/80/78.

"Adjusted" = mean difference in log-odds from the within-field stats-only fit (with the quadratic terms, R2 0.965), so it asks "given its stats, how much did this situation add". 0.10 is about 10 percent. Own-style cells under 30 starts are not shown.

**Win rate by own style and number of front-runners in the field** (own count included)

| Own style | Front-runners in field | n | True chance | Actual | Lift | Adjusted ± | EV per $1 |
|---|---|---|---|---|---|---|---|
| front-runner | 1 (lone) | 507 | 14.9 ± 1.1 | 15.0 | 1.19x | +0.264 ± 0.018 | 0.733 |
| front-runner | 2 | 2,098 | 13.5 ± 0.5 | 12.9 | 1.08x | +0.061 ± 0.009 | 0.723 |
| front-runner | 3 | 3,663 | 13.0 ± 0.4 | 13.0 | 1.04x | -0.016 ± 0.007 | 0.727 |
| front-runner | 4 | 3,104 | 12.7 ± 0.4 | 12.9 | 1.01x | -0.031 ± 0.007 | 0.735 |
| front-runner | 5 | 1,455 | 12.5 ± 0.6 | 13.0 | 1.00x | -0.024 ± 0.011 | 0.746 |
| front-runner | 6 | 300 | 13.6 ± 1.3 | 15.0 | 1.09x | -0.026 ± 0.025 | 0.766 |
| stalker | 0 | 417 | 14.6 ± 1.6 | 14.1 | 1.17x | +0.123 ± 0.027 | 0.737 |
| stalker | 1 | 1,770 | 13.7 ± 0.7 | 12.8 | 1.09x | +0.029 ± 0.013 | 0.764 |
| stalker | 2 | 3,110 | 12.5 ± 0.5 | 12.3 | 1.00x | -0.012 ± 0.008 | 0.782 |
| stalker | 3 | 3,005 | 11.7 ± 0.5 | 11.6 | 0.94x | -0.040 ± 0.007 | 0.802 |
| stalker | 4 | 1,603 | 11.0 ± 0.6 | 10.8 | 0.88x | -0.048 ± 0.010 | 0.819 |
| stalker | 5 | 465 | 10.6 ± 1.1 | 7.7 | 0.85x | -0.062 ± 0.018 | 0.828 |
| stalker | 6 | 56 | 7.8 ± 1.6 | 3.6 | 0.63x | -0.087 ± 0.053 | 0.847 |
| closer | 0 | 407 | 10.3 ± 0.9 | 10.8 | 0.82x | -0.126 ± 0.024 | 0.845 |
| closer | 1 | 1,779 | 10.7 ± 0.4 | 11.5 | 0.85x | -0.104 ± 0.010 | 0.857 |
| closer | 2 | 3,184 | 11.8 ± 0.4 | 12.4 | 0.94x | -0.028 ± 0.007 | 0.887 |
| closer | 3 | 3,100 | 12.7 ± 0.4 | 12.7 | 1.02x | +0.058 ± 0.008 | 0.900 |
| closer | 4 | 1,501 | 13.8 ± 0.6 | 13.5 | 1.10x | +0.114 ± 0.010 | 0.926 |
| closer | 5 | 408 | 14.8 ± 1.2 | 16.2 | 1.19x | +0.156 ± 0.020 | 0.953 |
| closer | 6 | 44 | 10.7 ± 2.8 | 6.8 | 0.86x | +0.288 ± 0.051 | 0.932 |

Cells of 56 or fewer starts (stalker 6, closer 6) are too small to read; the closer-6 raw 10.7 percent is a field-strength accident (those fields are weak: mean total 216.8), the adjusted number is the honest one.

**Share of a field's total win chance by style, by number of front-runners** (races in cell in parentheses; the share follows the horse count):

| Front-runners | Races | Front-runners | Stalkers | Closers |
|---|---|---|---|---|
| 0 | 103 | none | 59.3% (4.05 horses) | 40.7% (3.95) |
| 1 | 507 | 14.9% | 47.7% (3.49) | 37.4% (3.51) |
| 2 | 1,049 | 27.1% | 37.2% (2.96) | 35.8% (3.04) |
| 3 | 1,221 | 38.9% | 28.8% (2.46) | 32.4% (2.54) |
| 4 | 776 | 50.7% | 22.7% (2.07) | 26.6% (1.93) |
| 5 | 291 | 62.3% | 16.9% (1.60) | 20.8% (1.40) |
| 6 | 50 | 81.8% | 8.8% (1.12) | 9.4% (0.88) |

Per horse, the front-runners take their fair share (about 12.5 percent each); what moves is how many horses of each style there are, not what each does. The sim's pace claim ("front-runners fight and pay") shows only in two places: the lone leader's bonus and the closers' gain from a contested lead. It is not visible as a penalty on a front-runner who is in a crowd: a front-runner with 3 rivals for the lead wins as much as stats predict.

**Lone styles** (exactly one of that style in the field)

| Situation | n | True chance | Actual | Adjusted | EV per $1 |
|---|---|---|---|---|---|
| lone front-runner | 507 | 14.9 ± 1.1 | 15.0 | +0.264 ± 0.018 | 0.733 |
| lone stalker | 543 | 9.4 ± 0.9 | 7.9 | -0.132 ± 0.018 | 0.774 |
| lone closer | 578 | 13.5 ± 0.8 | 13.3 | -0.022 ± 0.021 | 0.967 |
| two closers | 2,556 | 12.5 ± 0.4 | 13.1 | +0.008 ± 0.009 | 0.919 |
| three closers | 3,492 | 12.2 ± 0.4 | 12.1 | +0.019 ± 0.007 | 0.889 |

A lone closer is not special (the raw 13.5 percent is its field's average strength, not its situation). A lone stalker is a small negative, not a lone-leader-like gain.

Lone front-runner premium by speed: speed 70 to 80 +0.37 (n 126), 80 to 86 +0.28 (111), 86 to 90 +0.17 (120), 90+ +0.24 (150). It shows at every speed level.

Fast front-runners (speed 88 or more) as the pace signal, closers' adjusted: 0 such front-runners -0.081 (n 3,685), 1: +0.023 (4,453), 2: +0.117 (1,924), 3: +0.192 (338). Same shape as the count of front-runners.

Exactly two front-runners, front-runner adjusted by the speed gap between them: gap 0 to 2 +0.045 (n 394), 3 to 6 +0.084 (452), 7 to 12 +0.065 (672), 13+ +0.048 (580). No gap effect. A front-runner's speed rank among the front-runners (adjusted by the stats-plus-style fit) is flat within +-0.12; I found no useful pattern.

## Q3. Post position

| Post | n | True chance | Actual | Lift | Adjusted for stats ± | EV per $1 |
|---|---|---|---|---|---|---|
| 1 | 4,000 | 12.7 ± 0.4 | 12.7 | 1.01x | +0.061 ± 0.009 | 0.802 |
| 2 | 4,000 | 13.0 ± 0.4 | 12.9 | 1.04x | +0.055 | 0.808 |
| 3 | 4,000 | 13.0 ± 0.4 | 13.3 | 1.04x | +0.027 | 0.805 |
| 4 | 4,000 | 13.1 ± 0.4 | 13.4 | 1.05x | +0.025 | 0.808 |
| 5 | 4,000 | 12.1 ± 0.4 | 12.2 | 0.97x | -0.004 | 0.805 |
| 6 | 4,000 | 12.0 ± 0.4 | 11.6 | 0.96x | -0.021 | 0.802 |
| 7 | 4,000 | 12.4 ± 0.4 | 12.2 | 0.99x | -0.053 | 0.803 |
| 8 | 4,000 | 11.8 ± 0.4 | 11.8 | 0.94x | -0.089 ± 0.009 | 0.795 |

Real winners by post (1 to 8): 506, 515, 532, 537, 489, 465, 486, 470.

The raw numbers hide most of it because high-total horses are not assigned to posts, so the adjusted column is the cleaner view: a steady slide of about 0.02 log-odds per post, post 1 to post 8 about 0.15 (a 16 percent relative swing). By own style (adjusted, post 1 through 8):

| Style | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| front-runner | +0.09 | +0.08 | +0.03 | +0.03 | -0.02 | -0.04 | -0.08 | -0.13 |
| stalker | +0.03 | +0.03 | +0.01 | +0.02 | -0.02 | -0.03 | -0.06 | -0.09 |
| closer | +0.06 | +0.05 | +0.04 | +0.03 | +0.02 | +0.01 | -0.02 | -0.04 |

Each cell about 1,300 starts, 95 percent bounds about ±0.01 for front-runners, ±0.02 for the rest. A front-runner's post 1 to post 8 swing is 25 percent relative, closers 10. In true chance, the front-runner in post 2 has 14.0 percent, in post 8 11.9 percent. Posts are an effect worth printing but small: no post is better than 13.1 or worse than 11.8 percent.

## Q4. Field strength

Rivals' average total (the other seven horses): mean 221.0, sd 5.7, min 201.0, max 243.6. Each horse starts 772 to 800 times (mean 800).

Same horse, weakest third of its own fields against strongest third (rivals' average total 214.9 vs 227.2, a 12-point difference), true chance averaged over horses:

| Group | Weakest third | Strongest third | Ratio |
|---|---|---|---|
| All 40 horses | 16.6 | 9.0 | 1.84x (mean of per-horse ratios 2.45) |
| 10 highest-total horses | 36.4 | 23.0 | 1.58x (mean of per-horse 1.63) |
| 10 lowest-total horses | 3.4 | 1.1 | 3.1x (mean of per-horse 3.38) |

By quintile of rivals' average total, true chance divided by the horse's own long-run chance: 1.63 (avg 213.1), 1.13 (218.0), 0.93 (221.0), 0.76 (224.0), 0.55 (229.0). Per-horse slope of log chance on rival average total: mean -0.070 per point (range -0.128 to -0.027), so 5 points of rival strength is a factor of 0.70 (0.53 to 0.87).

Weak horses swing proportionally more; strong horses swing more in points. A horse's chance in the same race is about "its rating against theirs", not its rating alone.

## Q5. A horse's second start of the day

Every horse runs every day (20,000 horse-days; 12,000 have two starts, 8,000 have one; gap between the two starts is 3 to 7 races). The sim has no day memory.

| Group | Starts | Wins | Expected from true chance | Ratio |
|---|---|---|---|---|
| First start of a two-start horse | 12,000 | 1,525 | 1,492.7 | 1.022 ± 0.044 |
| Second start | 12,000 | 1,500 | 1,500.0 | 1.000 ± 0.044 |
| Single-start day | 8,000 | 975 | 1,007.3 | 0.968 ± 0.053 |

Paired true chance, second minus first start: +0.06 points ± 0.11. No effect. The program must never hint that a second start matters.

## Q6. Yesterday's winner

Winner = the real race winner (one per race). Compared to the true chance in today's field (not to the horse's average), and to the horse's own long-run average chance.

| Group | Starts | Wins | Sum of true chance | Actual / true | Mean true chance | Mean own long-run |
|---|---|---|---|---|---|---|
| Won yesterday | 5,858 | 1,249 | 1,271.7 | 0.982 ± 0.046 | 21.7 | 21.6 |
| Did not win yesterday | 26,078 | 2,743 | 2,720.3 | 1.008 ± 0.033 | 10.4 | 10.5 |
| Won earlier today (later start) | 1,525 | 329 | 340.9 | 0.965 ± 0.088 | 22.4 | 22.1 |

Winning does not carry over. "Won yesterday" is a pointer to class, and the program already shows class (the stats). Day-seed 1 has no yesterday, so 499 days contribute.

## Q7. What the stats and style do not explain

Layers, as R2 of within-field log-odds: three stats, linear 0.938; plus style, post and the lone-leader/crowded-lead terms 0.943; stats with squares and cross terms 0.965 (0.970 with style and post as well); with a dummy for each horse 0.975. So what is left after stats, style, post and pace is about 3 percent of the spread, and per-horse leftovers have an sd of 0.08 log-odds (8 percent in chance).

What the extras are:

1. **Diminishing returns.** Chance is not a straight line in stats. Quintiles of own total: horses with total near 245 do 12 percent worse than a straight line predicts (-0.12) and near 199 do 15 percent worse (-0.15); the middle does 17 percent better (+0.17). Square terms for stamina and kick are negative (stamina -0.39, kick -0.09 per 100 squared points); speed's is flat (-0.04). A low-speed, high stamina-and-kick closer is exactly the type that falls short: Sock In The Dryer (73/90/87) is 0.17 below a quadratic stat fit, Long Story Longer (72/92/84) was 0.49 below the linear one. The shape I can state is "stats help less at the extremes"; the cause is not proven.
2. **Balanced horses over-perform.** After the quadratic stat fit with style and post, the biggest positive leftovers are Paddock Gossip (83/84/85 stalker, +0.21 ± 0.011), Left On Read (63/71/79 closer, +0.19), Legally A Horse (78/82/77 stalker, +0.17), Post Time Panic (82/63/66, +0.11). Negative: Sock In The Dryer -0.17, Extra Long Receipt -0.15, Medium Everything -0.10, Gravy Subpoena -0.10, Bring A Sweater -0.09. No clean story; the signal is small and the horses with the biggest positives are mostly stalkers or stalker-like balanced profiles. A flat pace shape with no cost may be favouring balanced horses. Treat as a hint, not a fact.
3. **Interaction with pace beyond count.** Terms for kick or stamina by front-runner count added nothing (R2 0.9430 to 0.9431). The pace is carried by the style count, not by how much kick a closer has.

Per-horse true chance and leftover, and the crowd's price, for every horse is in the blurb table below (`resid` = leftover after quadratic stats, style and post; positive means beats what its stats predict).

## Q8. The blurbs

The 40 blurbs allude to **style and almost nothing else**. None says anything that separates the champions (Paddock Gossip 47.6 percent, Hold My Oats 35.6, Sock In The Dryer 32.7, Long Story Longer 29.0, Biscuit Emergency 29.9) from the horses that win 1 percent. Among the 14 front-runners, 13 stalkers and 13 closers, the blurb tells you the running style correctly for most.

Per horse. Rank = rank among the 40 by mean true chance; `resid` as above; EV is true chance times crowd price per $1.

| Id | Name | Style | S/St/K | Total | True chance (rank) | Resid | Blurb |
|---|---|---|---|---|---|---|---|
| s01 | Hold My Oats | front | 94/76/81 | 251 | 35.6% (2) | -0.02 | Wants the lead and a snack. |
| s02 | Paddock Gossip | stalker | 83/84/85 | 252 | 47.6% (1) | +0.21 | Knows everyone's business. |
| s03 | Sock In The Dryer | closer | 73/90/87 | 250 | 32.7% (3) | -0.16 | Turns up late, still warm. |
| s04 | Ten Items Or Less | front | 92/70/75 | 237 | 19.9% (9) | +0.03 | Express lane, no exceptions. |
| s05 | Legally A Horse | stalker | 78/82/77 | 237 | 25.6% (7) | +0.17 | Papers say horse. We agree. |
| s06 | Burgoo Weather | closer | 67/88/80 | 235 | 18.4% (11) | -0.02 | Low heat, long simmer. |
| s07 | Goat Is In Charge | front | 93/77/71 | 241 | 24.6% (8) | -0.02 | Goat said go. So, go. |
| s08 | Smoke Alarm Chirp | stalker | 78/76/88 | 242 | 29.6% (5) | -0.00 | Quiet, quiet, then BEEP. |
| s09 | Long Story Longer | closer | 72/92/84 | 248 | 29.0% (6) | -0.00 | Has a lot more to say. |
| s10 | Biscuit Emergency | front | 93/77/73 | 243 | 29.9% (4) | -0.07 | Leaves early for the buffet. |
| s11 | Circling Back | stalker | 71/71/85 | 227 | 12.0% (15) | -0.06 | Will follow up shortly. |
| s12 | Lost The Remote | closer | 61/80/78 | 219 | 9.4% (19) | +0.01 | Stop looking. There it is. |
| s13 | Derby Hat Budget | front | 89/71/66 | 226 | 11.7% (16) | -0.03 | Dressed for the front row. |
| s14 | Ran Out Of Names | stalker | 75/73/68 | 216 | 6.3% (25) | -0.00 | Was almost called Steve. |
| s15 | Scenic Route | closer | 58/80/72 | 210 | 4.9% (27) | +0.06 | Saw the whole backstretch. |
| s16 | Running Joke | front | 85/69/77 | 231 | 14.6% (13) | +0.02 | Starts before you're ready. |
| s17 | Take A Number | stalker | 70/71/77 | 218 | 7.3% (24) | -0.09 | Waits its turn. Mostly. |
| s18 | Hay Is For Horses | closer | 58/79/73 | 210 | 4.7% (28) | +0.01 | Eats well, goes long. |
| s19 | Post Time Panic | front | 82/63/66 | 211 | 3.9% (30) | +0.11 | Out the door, keys inside. |
| s20 | Polite Applause | stalker | 73/73/69 | 215 | 6.0% (26) | -0.02 | Applauds the pace, quietly. |
| s21 | Late Checkout | closer | 60/78/80 | 218 | 10.8% (17) | +0.06 | Asks for one more hour. |
| s22 | Porch Light On | front | 87/71/74 | 232 | 17.6% (12) | -0.06 | Keeps the light on for you. |
| s23 | Bring A Sweater | stalker | 69/69/72 | 210 | 3.7% (31) | -0.09 | Has a scarf. Just in case. |
| s24 | Left On Read | closer | 63/71/79 | 213 | 7.9% (21) | +0.20 | Typing... still typing... |
| s25 | Mayor Of Turn Two | front | 86/69/67 | 222 | 8.7% (20) | -0.03 | Waves at everyone, early. |
| s26 | Mint Julep Lawsuit | stalker | 75/74/69 | 218 | 7.5% (23) | -0.00 | Sweet, cold, and litigious. |
| s27 | Unexpected Banjo | closer | 62/82/80 | 224 | 13.2% (14) | -0.03 | Joins in on the last verse. |
| s28 | Reply All | front | 85/73/65 | 223 | 9.6% (18) | -0.02 | Cc's the entire grandstand. |
| s29 | Understudy | stalker | 77/75/67 | 219 | 7.8% (22) | +0.05 | Knows the lead's lines. |
| s30 | Decaf By Mistake | closer | 69/77/84 | 230 | 19.2% (10) | -0.06 | Wakes up at the far turn. |
| s31 | Parking Lot Pigeon | front | 76/61/63 | 200 | 1.3% (39) | +0.08 | First to every crumb. |
| s32 | Group Project | stalker | 68/69/61 | 198 | 1.5% (37) | +0.06 | Made the title slide. |
| s33 | Extra Long Receipt | closer | 59/73/68 | 200 | 1.7% (36) | -0.14 | Prints for a full furlong. |
| s34 | Unsolicited Advice | front | 73/67/61 | 201 | 1.8% (35) | -0.02 | Chimes in right away. |
| s35 | Medium Everything | stalker | 65/65/64 | 194 | 0.9% (40) | -0.10 | Orders the usual. Again. |
| s36 | Saved It For Later | closer | 57/72/73 | 202 | 2.9% (33) | +0.08 | Unwraps it in the stretch. |
| s37 | Doorbell Ditch | front | 76/64/59 | 199 | 1.4% (38) | +0.01 | Rings once and runs. |
| s38 | Gravy Subpoena | stalker | 69/68/72 | 209 | 3.1% (32) | -0.10 | Served papers to the leader. |
| s39 | Mostly Legs | closer | 59/78/72 | 209 | 4.4% (29) | -0.00 | The rest is mostly lungs. |
| s40 | Big Plans Monday | front | 71/70/60 | 201 | 1.9% (34) | +0.02 | Agenda item one: the lead. |


### Blurbs that allude to something false or misleading

I could only judge an allusion if it reads as something about running position, finish or class. Judgement calls are marked.

| Id | Blurb | Why it is wrong or misleading |
|---|---|---|
| s22 Porch Light On | "Keeps the light on for you." | Sounds patient and waiting, a late runner who leaves the light on for the others. It is a front-runner (speed 87, rank 6 of 40). Reads backwards. Judgement call: the phrase has no running meaning; a reader will take it as waiting. |
| s35 Medium Everything | "Orders the usual. Again." with name | "Medium" and "the usual" promise an average horse. It is the worst horse in the stable (total 194, rank 40, 0.9 percent). False as a class claim. |
| s31 Parking Lot Pigeon | "First to every crumb." | True for early position, but "first" reads as a winner; it wins 1.3 percent. Misleading about results. |
| s08 Smoke Alarm Chirp | "Quiet, quiet, then BEEP." | Reads as a late surprise run (closer). It is a stalker. Partly true: it has the best kick in the stable (88, rank 1 of 40). Mixed. |
| s11 Circling Back | "Will follow up shortly." | Reads as late or coming back (closer-like). It is a stalker with kick 85 (rank 4 of 40). Mixed, same as above. |
| s12 Lost The Remote | "Stop looking. There it is." | Reads as a late find, closer-like. It is a closer, so true on style, but nothing in it says a 9.4 percent horse. Not wrong; flagged only because "there it is" promises arrival. |
| s38 Gravy Subpoena | "Served papers to the leader." | Reads as catching the leader. It is a stalker winning 3.1 percent. Style is right, results promise too much. |
| s18 Hay Is For Horses | "Eats well, goes long." | "Goes long" suggests a stayer. Stamina 79 is rank 9 of 40, true; speed is rank 39 of 40 and it wins 4.7 percent. Half true: reads as better than it is. |
| s33 Extra Long Receipt | "Prints for a full furlong." | Suggests staying power; stamina 73 is rank 22 of 40 (average). Not true as a stamina claim. |
| s13 Derby Hat Budget | "Dressed for the front row." | True on style (front-runner), but "Derby hat" and "front row" read as a contender; it is 11.7 percent, rank 16. Mild. |
| s25 Mayor Of Turn Two | "Waves at everyone, early." | True on style; "Mayor" reads as an important horse, 8.7 percent, rank 20. Mild. |

### Blurbs that allude to something true

True on running style (the horse is the style the line sounds like):

- Front-runners: s01 "Wants the lead and a snack", s04 "Express lane, no exceptions", s07 "Goat said go. So, go.", s10 "Leaves early for the buffet", s13 "Dressed for the front row", s16 "Starts before you're ready", s19 "Out the door, keys inside" (also true: weak, 3.9 percent), s25 "Waves at everyone, early", s31 "First to every crumb" (early), s34 "Chimes in right away", s37 "Rings once and runs" (fast then gone: stamina 64, 1.4 percent), s40 "Agenda item one: the lead."
- Stalkers: s17 "Waits its turn. Mostly.", s20 "Applauds the pace, quietly", s29 "Knows the lead's lines" (sits behind the leader), s38 (style only).
- Closers: s03 "Turns up late, still warm", s06 "Low heat, long simmer" (stamina 88, rank 3), s09 "Has a lot more to say" (stamina 92, rank 1: true), s15 "Saw the whole backstretch" (back of the field: true), s21 "Asks for one more hour", s24 "Typing... still typing...", s27 "Joins in on the last verse", s30 "Wakes up at the far turn", s36 "Unwraps it in the stretch", s39 "The rest is mostly lungs" (stamina 78, its best stat, rank 11).

True on a stat: s06 and s09 (stamina), s39 (lungs), s08 (kick), s32 "Made the title slide" (a weak 1.5 percent horse who contributes little, true as a joke), s37 (low stamina).

No allusion at all (neutral): s02 "Knows everyone's business", s05 "Papers say horse. We agree.", s14 "Was almost called Steve.", s23 "Has a scarf. Just in case.", s26 "Sweet, cold, and litigious.", s28 "Cc's the entire grandstand."

Read: no blurb separates strong from weak. That is the one real gap: the book has no line that says "this one is the best horse in the stable" and none that says "this one is the worst". The two horses with the most surprising (largest, positive) leftovers, Paddock Gossip and Legally A Horse, both carry no running hint.

## What I could not measure

- Distance, going, track bias, weather, jockeys, injuries or any other thing the sim could vary: every race is 10 furlongs on fast dirt with a neutral track and the harness has no variation to test.
- Interactions between particular horses (for example two named horses that bump). Pairs recur rarely enough with 40 horses that I did not test; the leftover sd of 0.08 log-odds is the bound on what such things can add on average.
- True chance has 2,000 runs behind it per field, so per-field values carry up to about 1 percentage point of noise for the biggest chances; averages across thousands of starts do not.
- Effects of order within a day (race number) and of being a third start (cannot happen: max starts per day is 2).
- I did not test whether showing any of this in the book would change what the player does or what the crowd does; the crowd's price is a function of the sim estimate with a style lean and noise, not of what the book prints.
- Returns: I computed prices with the repo's own `crowdFor` and `pricesWith` (the same functions the harness uses) from the cached crowd estimates, with no player bet in the pool. A $2 bet would move the price slightly. The harness's per-race `crowdWins` is used as the crowd's estimate (runs = 1,000).

## Rerun

All scripts are in `/private/tmp/claude-501/-Users-josephalfonso--claude-spares-spare-wPqOWF/c57a2367-1dc8-4e68-9ae3-1c7b824adbb4/scratchpad/` (run each with `node <file>`):

- `signals-load.mjs`: loads the 500 cached days and stable.json (shared).
- `signals-lib.mjs`: builds the horse-start rows, the summaries, the within-field log-odds fit (`logFit`). Reads `signals-prices.json`.
- `signals-prices.mjs <out.json>`: computes the crowd's per-dollar price for every horse in every race through Vite with the repo's `crowdFor` and `pricesWith`. Run with `NPM_CONFIG_CACHE=$TMPDIR/npmcache node signals-prices.mjs signals-prices.json` (about 20 seconds).
- `signals-1.mjs`: Q1 (leaders, total rank, gaps, stat weights).
- `signals-2.mjs`, `signals-7.mjs`: Q2 (style by front-runner count, lone styles, speed gaps, fast pressers, EV).
- `signals-3.mjs`: Q2 interaction fits, Q3 (post), Q4 (field strength).
- `signals-4.mjs`: Q5 (second start) and Q6 (yesterday).
- `signals-5.mjs`, `signals-6.mjs`, `signals-8.mjs`: Q7 (leftover per horse, nonlinearity) and the per-horse table; `signals-8.mjs` also prints the crowd-price tables.
- `signals-9.mjs`: top-horse lead versus gap.
- `signals-check.mjs`: confirms `winner` is a 1-based post (average true chance of the named winner 24.1 percent against 9.4 if 0-based, which would be wrong).

Cache: `/tmp/claude-501/betharness/sim3-v1-stable9d054002-rules46465645` (the name encodes the sim version, stable hash and rules hash). If the stable, rules or sim changes, the run has to be redone first (`npm run bet:harness`, about 90 minutes) and the numbers above are stale.

## News kinds (2026-11-15)

Measured on the same cached 500 days against `docs/specs/book-useful.md` sections 3.1 to 3.4 and 4. "Candidates" are every race (or horse, for K4 and K6) that meets the trigger, before the five slots; "printed" is after the 3.4 greedy fill. Bar: named horse's true chance at least 18.75 percent, and for K1, K3, K5, K6 a stat-adjusted edge of the claimed sign. "Stats-only" is the horse's within-field chance from a quadratic fit of the three stats alone (R2 0.965); resid is true minus stats-only in log-odds (+0.10 is about +10 percent). EV is true chance times the crowd's price per $1 (no player bet in the pool); it is the number to trust, the actual-race return is shown only because its error bar is wide. Random is 0.804.

How I read the spec where it was silent: "at most two of one kind" counts K3 four and K3 5+ together and K6 inside and wide together; ties in a sort go to the lower race, then lower post; rank ties share the better rank; K4 names the horse in the softer race and a horse gives one candidate a day; K6 makes a candidate for every qualifying front-runner (a race can hold two).

### Candidates (before slotting)

| Kind | Races or horses a day | True chance | Lift | Actual win rate | Stats-only | Resid | EV per $1 | Actual return per $1 |
|---|---|---|---|---|---|---|---|---|
| K1 lone speed | 0.62 | 22.1% ±1.2 | 1.77x | 22.2% (n 311) | 19.4% | +0.223 ±0.017 | 0.766 ±0.017 | 0.842 ±0.20 |
| K2 class above | 2.26 | 45.8% ±0.5 | 3.67x | 46.3% (n 1,129) | 49.4% | -0.133 ±0.014 | 0.851 ±0.008 | 0.873 ±0.06 |
| K3 four fronts | 1.10 | 25.3% ±0.8 | 2.03x | 26.2% (n 550) | 25.3% | +0.022 ±0.019 | 0.973 ±0.016 | 1.021 ±0.17 |
| K3 five or more | 0.35 | 26.9% ±1.5 | 2.15x | 26.6% (n 173) | 25.7% | +0.085 ±0.034 | 0.988 ±0.033 | 0.930 ±0.27 |
| K3 all | 1.45 | 25.7% ±0.7 | 2.06x | 26.3% (n 723) | 25.4% | +0.037 ±0.017 | 0.977 ±0.015 | 0.999 ±0.14 |
| K4 easier crowd | 4.60 horses (2.64 races) | 25.9% ±0.5 | 2.07x | 26.3% (n 2,301) | 27.1% | -0.092 ±0.008 | 0.857 ±0.007 | 0.861 ±0.07 |
| K5 no speed | 0.20 | 38.2% ±3.0 | 3.05x | 39.2% (n 102) | 32.9% | +0.266 ±0.033 | 0.806 ±0.028 | 0.899 ±0.27 |
| K6 inside | 2.56 horses | 23.5% ±0.5 | 1.88x | 22.7% (n 1,281) | 23.4% | +0.013 ±0.008 | 0.796 ±0.008 | 0.763 ±0.09 |
| K6 wide (avoid) | 2.52 horses | 22.1% ±0.5 | 1.77x | 20.6% (n 1,262) | 24.2% | -0.113 ±0.007 | 0.798 ±0.009 | 0.757 ±0.09 |
| K7 top on the numbers | 5.63 | 33.2% ±0.2 | 2.65x | 32.9% (n 2,815) | 34.1% | -0.028 ±0.008 | 0.847 ±0.006 | 0.840 ±0.05 |

### Printed (after the 3.4 fill, 500 days, 2,500 slots)

| Kind | Items printed (a day) | True chance | Actual win rate | Resid | EV per $1 ± |
|---|---|---|---|---|---|
| K1 | 301 (0.60) | 22.3% ±1.2 | 21.6% | +0.222 ±0.017 | 0.769 ±0.017 |
| K2 | 787 (1.57) | 47.1% ±0.6 | 46.3% | -0.165 ±0.017 | 0.847 ±0.009 |
| K3 four | 242 (0.48) | 26.7% ±1.0 | 29.3% | +0.052 ±0.026 | 0.980 ±0.024 |
| K3 five or more | 140 (0.28) | 26.9% ±1.5 | 25.7% | +0.115 ±0.032 | 0.990 ±0.037 |
| K4 | 669 (1.34) | 25.8% ±0.7 | 26.0% | -0.097 ±0.015 | 0.862 ±0.013 |
| K5 | 34 (0.07) | 37.6% ±3.8 | 29.4% (n 34) | +0.272 ±0.064 | 0.797 ±0.041 |
| K6 inside | 246 (0.49) | 24.6% ±1.1 | 25.2% | +0.043 ±0.016 | 0.800 ±0.020 |
| K6 wide | 59 (0.12) | 22.0% ±2.4 | 25.4% (n 59) | -0.074 ±0.034 | 0.776 ±0.038 |
| K7 | 22 (0.04) | 40.3% ±2.8 | 40.9% (n 22) | +0.067 ±0.072 | 0.821 ±0.048 |

Days with fewer than five items: 0 of 500. Days with no item other than K7: 0 of 500. K7 almost never prints (22 times) because K4 and K6 candidates fill the slots first; the spec's "a dull day is five K7 items" does not happen.

### The news as a whole

| Bet rule | Starts (a day) | True chance | Actual | EV per $1 ± | Actual return ± |
|---|---|---|---|---|---|
| Every horse any kind names, all candidates, unique starts, K6 wide left out | 6,809 (13.6) | 29.3% | 29.2% | 0.852 ±0.004 | 0.851 ±0.04 |
| Same, without K7 | 4,996 (10.0) | 27.9% | 27.9% | 0.853 ±0.005 | 0.858 ±0.05 |
| Only items that print, K6 wide left out | 2,441 (4.88) | 32.6% ±0.5 | 32.4% | 0.857 ±0.007 | 0.867 ±0.06 |
| Only printed, K7 also left out | 2,419 (4.84) | 32.5% | 32.3% | 0.857 ±0.007 | 0.867 ±0.06 |

All of these beat random (0.804) by about 0.05 and none reaches 1.00 (the upper end is 0.864).

### Verdict per kind

- **K1 lone speed: passes.** 22.1 percent true chance (1.77x, lower bound 20.9, bar 18.75). Edge over stats +0.22 ±0.02, right sign. Return 0.766 per $1: wins more than random and pays worse, as the spec says. Rank limits looser or tighter: rank 1 only 34.7 percent (n 77), rank 2 27.9 (188), rank 3 24.3 (264), rank 4 22.1 (311); the edge stays +0.11 to +0.22 at each. Limit 4 is fine; 3 would be safer and loses 47 of 311 cases.
- **K2 class above: passes.** 45.8 percent, 3.7x. It names the best horse, but it does worse than its stats say (-0.13); nothing in the hint claims otherwise. Return 0.851.
- **K3 crowded lead: passes the bar, with two cautions.** 25.3 percent (four) and 26.9 (five or more), well over 18.75. The claimed edge is real only at five or more (+0.085 ±0.034; printed +0.115 ±0.032). At exactly four fronts the edge is +0.022 ±0.019, indistinguishable from nothing; printed +0.052 ±0.026 (marginal, sign right). Money: EV 0.973 (four), 0.988 ±0.033 (five or more), 0.977 ±0.015 overall. All under 1.00, but five-or-more's upper end (1.021) is above it, so the money gate is not cleanly met. The actual returns (1.02 for K3 all, 1.12 for printed fours) are noise at ±0.14 to 0.24. Tightening the closer's rank limit does not help the money: rank 1 returns 0.949 ±0.020 but then the edge over stats turns negative (-0.096); rank 2 0.975; rank 3 0.971. The data suggests, without redesigning, that "four fronts" is the weakest part and "five or more" the real one; and that it is the closer's price, not its rank, that makes the rule near break-even.
- **K4 easier crowd: passes.** 25.9 percent (2.07x). The hint is about the field: the same horse, same day, wins 25.9 percent in the softer race against 16.3 in the harder one (ratio of means 1.58, per-pair ratio 1.88, softer race better in 96.6 percent of pairs, 606 against 381 actual wins). By rivals' difference: 6 to 8 points 1.35x, 8 to 10 1.51x, 10 to 14 1.69x, 14+ 2.28x; the 6-point threshold is conservative, the hint is true at every size. It is first-or-second-start neutral (softer race first 25.5 percent, second 26.3). The stats-only residual is negative (-0.09) only because that baseline already knows the field; the hint does not claim an edge over stats. Return 0.857.
- **K5 no speed: passes on the chance, small count.** 102 candidates (0.20 a day), 38.2 percent true chance, edge +0.27 ±0.03, right sign and stronger than the book-signals figure for stalkers generally. Actual win rate 39.2 percent on 102 and 29.4 percent on the 34 that print: too few to say anything on actual results or returns (±0.27 and ±0.36). Returns 0.806 on the true chance (n 102). Verdict: passes; too few cases (102, 34 printed) to check the real win rate.
- **K6 inside: passes the bar, but barely a hint.** 23.5 percent true chance only because the horse is a top-3 front-runner. The edge over stats is +0.013 ±0.008 across 1,281 cases (printed +0.043 ±0.016, n 246): right sign, about 1 percent in chance. The claim exists; its size is too small to carry a news line. Return 0.796.
- **K6 wide: the claim is true; the "avoid" reading is risky.** The horse is 11 percent worse than its stats say (-0.113 ±0.007, n 1,262). It still has a 22.1 percent chance (1.77x the base) and an actual win rate of 20.6. A line that says "avoid" points at a horse that beats random by more than the K1 horse does. Printed only 59 times in 500 days (0.12 a day): too few (59) to tell anything about printed results. Return 0.798.
- **K7 top on the numbers: passes the bar (33.2 percent, 2.65x, n 2,815), but is not a filler in practice.** It prints 22 times in 500 days. The spec's claim that K7 keeps the page full is wrong as built: K4 and K6 do. Too few printed (22) to check printed results.

### Where the spec's numbers look off

- 3.3 says K6 fires about 1 to 2 times a day. As defined (one candidate per qualifying front-runner) there are 5.1 horses a day in 4.1 races; the printed count is 0.6 a day only because it ranks low.
- 3.3 says K3 about 2.2 races a day before the closer limit: matches (2.24 with fronts at 4 or more); 1.45 after the rank limit. K1 about 1.0 before the limit: matches (1.01); 0.62 after. K2 2.26 and K5 0.20: match. K4: 2.64 races a day.
- The 3.3 line that "a day with no pace or class item is the dull case" does not happen: no day lacked a non-K7 item.
- K4 at 6 points of difference qualifies 39 percent of two-start horse-days (4,681 of 12,000, 2,301 after rank at most 3). The threshold is not scarce; the 5 slots are.
- K3: the money gate in section 4 (under $1.00) holds on the point estimates but the K3 five-or-more interval touches 1.02. The "risk the other way" the spec worries about is real in size, small in fact: -0.01 to -0.03 per dollar from break-even.

### Rerun

`/private/tmp/claude-501/-Users-josephalfonso--claude-spares-spare-wPqOWF/c57a2367-1dc8-4e68-9ae3-1c7b824adbb4/scratchpad/signals-news-1.mjs` (all candidates, 3.4 fill, returns, rank-limit sweeps) and `signals-news-2.mjs` (K4 same-horse pairs, counts). Both use `signals-lib.mjs` and `signals-prices.json`; run with plain `node`. They implement the spec's terms as written and the reading choices listed at the top of this section.
