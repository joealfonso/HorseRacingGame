# Performance

## Initial load budget: under 5 MB excluding audio

Measured 2026-11-11 from `npm run build` on M0, Phaser 3.90.0, Vite 8.3.8. Sizes in bytes, gzip at level 9 (`gzip -9`).

| File | Raw | Gzipped |
|---|---|---|
| dist/index.html | 522 | 363 |
| dist/assets/index-BT-6HRp7.js | 1,196,571 | 314,917 |
| Total | 1,197,093 | 315,280 |

Verdict, judged on the raw total: 1.20 MB of 5 MB, about 24 percent of the budget. Pass. Almost all of it is Phaser. Vite warns the single chunk is over 500 kB, which is expected here and not acted on.

## T3: one race with replay, headless (M1.3)

Budget (starting guess): median under 20 ms and never over 100 ms across 500 seeds, in Node on Joseph's Mac.

Measured 2026-11-12 on an Apple M4 (10 cores), Node 25.6.0, run through Vitest, shipped card at 10 furlongs, seeds 0 to 499, after 20 warm-up races: median 1.51 ms, 99th percentile 2.46 ms, worst 2.51 ms (rerun after the kick retune; before it, 1.50, 2.42 and 2.60). The first race in a fresh process, before the JIT warms up, took 9.4 to 9.6 ms over three runs. Pass. One serialized result is about 115 KB, almost all of it the replay.

## T3: 10,000-race batch run (M1.6)

Budget: 10,000 races in under 5 minutes.

Measured 2026-11-12 on the same Apple M4, Node 25.6.0, `npm run batch -- --races 10000` (seeds 0 to 9999): the elapsed time the command printed was 288.3 seconds, inside the 300 second budget but with little room. The machine was under load from another job (load average 3.5 at the start, 15.6 at the end, on 10 cores), so this is a pessimistic figure. A 200-race run earlier in lighter load took 4.4 seconds, which scales to about 220 seconds. One batch "race" is five sets of sim runs (the loaded card, three post-fairness fields and one style-fairness field), so 10,000 races is 50,000 sim runs, about 5.8 ms each under load. Pass, narrowly. Rerun on a quiet machine before relying on the margin.

## T3 after the M1 tuning pass

Measured 2026-11-12 on the same Apple M4, Node 25.6.0, under load from other work (load average 7 to 8 on 10 cores). The T3 test, run alternately on this code and on the commit before it (`ea96466`), two runs each: median 2.59 and 2.76 ms per race here, 2.95 and 2.71 ms before; worst 8.9 and 12.2 ms here, 12.1 and 11.7 before. No change beyond noise, and both well inside the budget. The two 10,000-race batches printed 143.4 seconds (seeds 0 to 9999, load average 12.6 at the start, 5.2 at the end) and 108.0 seconds (seeds 10000 to 19999, 5.2 to 4.1). The batch before the pass printed 142.5 seconds.

## B0 betting probe: one runRace on a drawn field (PB1)

Measured 2026-11-13 on the Apple M4, Node 25.6.0, `node scripts/betProbe.mjs pb1`: probe stable day 1 race 1, 50 warm-up runs, then 500 timed runs on its estimate seeds. At load average 1.15 (the lowest seen today): median 3.71 ms, 99th percentile 5.74 ms, worst 6.13 ms. Three runs at load 6.3 to 6.5 (another project's work): medians 5.09, 4.73 and 5.28 ms, 99th percentiles 7.53, 11.37 and 6.85 ms. The shipped card in the same harness at load about 1.5 took 3.72 ms median, and the T3 test through Vitest took 1.94 s for 501 races, so today the machine runs the sim about 2.5 times slower than the 1.5 ms recorded on 2026-11-12. The cause is not known.

Chrome, measured 2026-11-13 by the main session with the snippet from the B0 report (`measureCost` from `scripts/betProbeSetup.ts` on the dev server, same field, seeds and counts as Node): the Claude desktop app's built-in browser, Chromium 156, not cross-origin isolated (so `performance.now()` is coarsened to about 0.1 ms), load average about 5.5. Three runs: medians 3.2, 3.0 and 3.0 ms, 99th percentiles 8.8, 15.5 and 3.3 ms, worst 18.1, 27.7 and 4.8 ms. Not a quiet-machine figure and not Joseph's own Chrome. At N = 1,000 that is 3.0 to 3.2 s per race against PB3's 4 s budget: pass, with about a quarter to spare.

At N = 1,000 the estimate is 3.7 s per race single-threaded in Node at today's quiet figure. The full probe (2,401,000 runs on 9 child processes) took 1,749 s, 6.56 worker-ms per run, with load 15 to 19 during it.

## Not yet measurable

| Budget | First measurable in | Why not now |
|---|---|---|
| 60 fps on an average laptop | M1 | M0 draws one static scene, so a frame rate says nothing about the game. M1 has the animated race. |
| 20-year autoplay without errors or economy drift | M1 for the sim running headless, M4 or later for a meaningful economy | There is no sim and no economy in M0. |
