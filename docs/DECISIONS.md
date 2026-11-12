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

## M1 sim

**sfc32 seeded by cyrb128.** Each stream hashes the text `seed/name` or `seed/name/subKey` with cyrb128 (bryc's 128-bit string hash) into the four words of an sfc32 state (Chris Doty-Humphrey's generator from PractRand). Both use only 32-bit integer math and Math.imul, so every engine gives the same numbers, and a stream depends on nothing but its own key. A float is the output divided by 2^32, which is exact.

**Stream names may not contain "/".** That keeps the hashed key unambiguous. The name list starts empty in M1.1: no system draws yet, and a name cannot be renamed once races depend on it, so M1.3 picks the first ones.

**Sim tests are exempt from the determinism lint bans.** Files ending `.test.ts` under `src/sim/` may use Date, performance, Math.random and the inexact Math functions, because they are not part of a race and the T3 timing checks need a clock. They still get the Phaser ban.

**Known limit until M5.** Only dirt goings have time effects in tuning. A turf or synthetic race passes the surface and going check, then fails with a "goingTimeAddedPercent.<going> missing" message from tuning. That message is misleading, and turf support is not built.
