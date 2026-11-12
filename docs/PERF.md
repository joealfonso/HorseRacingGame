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

## Not yet measurable

| Budget | First measurable in | Why not now |
|---|---|---|
| 60 fps on an average laptop | M1 | M0 draws one static scene, so a frame rate says nothing about the game. M1 has the animated race. |
| 20-year autoplay without errors or economy drift | M1 for the sim running headless, M4 or later for a meaningful economy | There is no sim and no economy in M0. |
