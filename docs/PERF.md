# Performance

## Initial load budget: under 5 MB excluding audio

Measured 2026-11-11 from `npm run build` on M0, Phaser 3.90.0, Vite 8.3.8. Sizes in bytes, gzip at level 9 (`gzip -9`).

| File | Raw | Gzipped |
|---|---|---|
| dist/index.html | 522 | 363 |
| dist/assets/index-BT-6HRp7.js | 1,196,571 | 314,917 |
| Total | 1,197,093 | 315,280 |

Verdict, judged on the raw total: 1.20 MB of 5 MB, about 24 percent of the budget. Pass. Almost all of it is Phaser. Vite warns the single chunk is over 500 kB, which is expected here and not acted on.

## Not yet measurable

| Budget | First measurable in | Why not now |
|---|---|---|
| 60 fps on an average laptop | M1 | M0 draws one static scene, so a frame rate says nothing about the game. M1 has the animated race. |
| 20-year autoplay without errors or economy drift | M1 for the sim running headless, M4 or later for a meaningful economy | There is no sim and no economy in M0. |
