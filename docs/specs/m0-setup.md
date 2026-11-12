# M0 spec: project setup and display frame

Status: draft for Joseph's review. Written 2026-11-11.

## Goal

Finish milestone M0 so the repo has a working TypeScript, Phaser 3, Vite and Vitest project that shows one Phaser scene at 256x240 internal resolution with integer scaling only, plus a CI skeleton. It is for Joseph, a solo developer who will build M1 on top of it.

## Non-goals

M0 builds none of these. If any shows up in the diff, it is out of scope.

- Anything from M1 or later: race sim, RNG, horses, saves, content JSON, schemas, debug panel.
- Text of any kind on the canvas. Phaser system text is anti-aliased and the pixel font is not chosen.
- Art assets, audio, input handling, a title screen, more than one scene.
- Game state of any kind, and so no state containers or singletons.
- DESIGN.md and docs/ASSETS.md. The art-director writes those. M0 code must not read or depend on them.
- GitHub Pages deploy, the nightly harness and soak workflow, and branch protection. See "Deferred" below.

## Locked decisions

These were set by the lead. Change them only through Joseph.

1. **Stack.** TypeScript with `strict` on. Phaser 3, the latest 3.x release, not Phaser 4. Vite for dev and build. Vitest for tests. ESLint with typescript-eslint. npm, with `package-lock.json` committed.
2. **Scripts.** These five exist with these exact names:
   - `npm run dev` starts the Vite dev server.
   - `npm test` runs every test once and exits. It never enters watch mode.
   - `npm run lint` lints the repo.
   - `npm run typecheck` type-checks without emitting files.
   - `npm run build` writes a production build to `dist/`.
3. **Layout.** `src/sim/` is pure TypeScript with no Phaser imports and holds no game rules in M0. `src/render/` and `src/scenes/` hold Phaser code. `src/data/` holds content. A directory exists only if M0 puts a real file in it, so `src/sim/` and `src/data/` will likely not exist yet. No `.gitkeep` files.
4. **Sim boundary lint rule.** Importing `phaser` from any file under `src/sim/` is a lint error. This is the one rule M0 can lock in for every later milestone.
5. **Display.** Internal resolution 256x240. Scale is the largest whole number that fits the window in both directions, never below 1. The canvas is centered and the rest of the window is letterbox. Scale is recomputed on window resize. Rendering is pixel art: nearest-neighbor, no anti-aliasing, round pixels, no smoothing at any step from frame buffer to screen.
6. **Scale function.** The scale calculation is a pure function with no Phaser import, so it is unit tested in Node.
7. **No global singletons for game state.** M0 has no game state.
8. **Node version** lives in exactly one file in the repo, and both local dev and CI read it from there.
9. **CI skeleton.** One GitHub Actions workflow runs lint, typecheck, tests and build on every pull request and on pushes to `main`. A gitleaks secret scan runs on the same triggers. A Dependabot config covers npm and GitHub Actions.

## Milestones

M0 ships in three steps. Each one leaves the repo working and can merge on its own.

### M0.1 Tooling

The project installs, all five scripts run, the sim boundary rule exists and is tested. The page may be blank or show a bare Phaser canvas.

### M0.2 Display frame

The scale function and its tests, the one scene, the pixel-art render settings, letterboxing and resize.

### M0.3 CI and docs

The workflow, gitleaks, Dependabot, README.md, docs/DECISIONS.md, docs/PERF.md.

## Acceptance criteria

### M0.1 Tooling

- **A1.** On a clean checkout with the pinned Node version, `npm ci` succeeds with no errors.
- **A2.** `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` each exit 0 on the M0 code. `npm test` returns to the prompt on its own, without a keypress.
- **A3.** Each of those four scripts exits non-zero when it should fail. Proof by hand, once, noted in the PR: add a failing test, a lint error, and a type error, one at a time, and see each script fail. Then remove them.
- **A4.** `tsconfig` has `strict: true`. A file with an implicit `any` fails `npm run typecheck`.
- **A5.** The installed Phaser version starts with `3.`. The Dependabot config does not open major-version bumps for `phaser`, so it can never propose Phaser 4.
- **A6.** The Node version appears in one file only. `package.json`, the workflow and README.md point at that file or say to use it. They do not repeat the number.
- **A7. Sim boundary rule.** A test in `npm test` runs ESLint through its Node API on source text given a file path under `src/sim/`, using the repo's real ESLint config, and asserts:
  - `import Phaser from 'phaser'` is an error.
  - `import type { Scene } from 'phaser'` is an error. Type imports count because they still tie the sim's types to Phaser.
  - `import { Math as PMath } from 'phaser'` and an import of a subpath such as `'phaser/src/math/Clamp'` are errors.
  - `export { Scene } from 'phaser'` is an error.
  - Dynamic `import('phaser')` is an error.
  - A file under a nested path such as `src/sim/race/x.ts` is covered too.
  - The same `import Phaser from 'phaser'` with a path under `src/scenes/` or `src/render/` is not an error from this rule.
  - A sim file that imports nothing from Phaser has no error from this rule.

  The test fails if someone deletes or narrows the rule. It does not need `src/sim/` to exist on disk.

### M0.2 Display frame

**Scale function.** Inputs are the window's width and height in CSS pixels. Output is the whole-number scale. Base size is 256x240. The engineer may also return the scaled size or offsets. Unit tests cover every row below.

| Case | Input (w x h) | Expected scale |
|---|---|---|
| Exact fit at 1 | 256 x 240 | 1 |
| Exact fit at 3 | 768 x 720 | 3 |
| Width is the limit | 1024 x 2000 | 4 |
| Height is the limit | 2000 x 480 | 2 |
| One pixel short of 3 | 767 x 720 | 2 |
| Smaller than the frame | 200 x 100 | 1 |
| Smaller in one direction only | 1920 x 200 | 1 |
| Non-integer sizes | 767.9 x 720.5 | 2 |
| Non-integer, just over a step | 512.25 x 480.75 | 2 |
| Zero | 0 x 0, and 0 x 720 | 1 |
| Negative | -100 x 720 | 1 |
| Not a number or infinite | NaN, Infinity or -Infinity in either input | 1 |
| Common laptop | 1440 x 900 | 3 |
| Very large window | 7680 x 4320 | 18 |
| Huge but finite | 1e9 x 1e9 | 3906250, a finite whole number |

Every result is a finite whole number of at least 1. There is no upper cap. The function has no Phaser import, does not touch `window` or the DOM, and returns the same output for the same input.

- **B1.** The scale tests above run under `npm test` in a Node environment with no browser and no Phaser loaded.
- **B2.** The game's render settings are checked by a unit test that runs without a browser: width 256, height 240, pixel-art mode on, anti-aliasing off, round pixels on. How the config is split so this is testable is the engineer's call.
- **B3.** The canvas element has CSS that tells the browser to scale it nearest-neighbor, so no smoothing happens between the frame buffer and the screen.

**The scene.** It exists only to prove the display by eye. Colors are plain placeholders, named in one place in the scene code, until DESIGN.md is approved.

- **C1.** The frame is filled with a checker of 16x16 tiles in two colors, 16 columns by 15 rows, with no partial tiles. The top-left tile is the first color.
- **C2.** A 1-pixel border in a third color sits on the outermost pixels of the frame: column 0, column 255, row 0, row 239. It draws over the checker.
- **C3.** The letterbox area outside the frame is a fourth color, different from the other three, so the frame edge is clear.
- **C4.** The scene draws nothing else. No text, no images, no input listeners.

**Layout and resize.** These are checked by hand in the playtest gate, because M0 has no browser test runner.

- **D1.** At any window size of at least 256x240, the canvas shows at the scale from the function, centered, with all four border lines visible and no page scrollbars.
- **D2.** Resizing the window updates the scale. It changes only when the window crosses a whole step, for example from 3 to 2 when the window drops below 768 wide. Between steps the canvas size stays the same and only the letterbox changes.
- **D3.** When the window is smaller than 256x240, the canvas stays at scale 1 and every pixel of the frame can still be reached, by scrolling if needed. No part of the frame is hidden for good.
- **D4.** At every scale, each frame pixel is a sharp square block of equal size. Tile edges are hard, with no blur, no color fringes, and no rows or columns of uneven width. This holds on Joseph's Mac display. See open question 3 for other displays.

### M0.3 CI and docs

- **E1.** One workflow file runs on `pull_request` and on `push` to `main`. It installs with `npm ci` using the Node version from the one pinned file, then runs lint, typecheck, test and build. Any step failing fails the job.
- **E2.** A gitleaks scan runs on the same triggers and fails the run if it finds a secret.
- **E3.** A Dependabot config covers the `npm` and `github-actions` ecosystems, with the `phaser` major-version ignore from A5.
- **E4.** Until the GitHub remote exists, E1 to E3 are checked by reading the files and by running the same four commands locally. The first real PR after the remote exists must show the workflow and gitleaks running and green. That check closes E1 and E2.
- **E5.** README.md at the root has one paragraph on what the project is, the five commands, and where the Node version comes from.
- **E6.** docs/DECISIONS.md has two or three lines for each non-obvious M0 choice. At least: Phaser 3 over Phaser 4, why the scale function lives outside Phaser, why scale is counted in CSS pixels, how the sim boundary rule is enforced and tested, where the Node version is pinned, and the three deferred items with their reasons.
- **E7.** docs/PERF.md records the production bundle size measured from the M0 `npm run build`, both raw and gzipped, with the date and Phaser version, against the brief's 5 MB initial-load budget. It judges the budget on the raw total. It lists the 60 fps and 20-year soak budgets as not yet measurable, with the milestone where each can first be measured. Numbers come from a real build, never estimates.

## Playtest gate

M0 has no gameplay, so the gate is a display check. Joseph does this by hand and M0 is done when every step passes.

1. Run `npm ci`, then `npm run dev`, and open the local URL in a desktop browser.
2. See the checker frame with the border on all four sides, centered, letterbox around it, no text, no scrollbars.
3. Count 16 tiles across and 15 down.
4. Drag the window edge slowly from large to small. The frame jumps between whole sizes, never grows smoothly. Between jumps only the letterbox changes.
5. At two or more scales, zoom in with a screenshot tool. Every pixel is a hard square block, the border is one block thick on every side, and nothing is blurred.
6. Shrink the window below 256x240. The frame stays at its smallest size and every edge can be reached by scrolling.
7. Run `npm test`, `npm run lint`, `npm run typecheck` and `npm run build`. All pass.

## Edge cases and states that can happen

- Window smaller than the frame in one or both directions: scale 1, scroll to reach the rest (D3).
- Window size reported as a fraction, which happens with browser zoom: floor, per the table.
- Zero size, which can happen in a hidden or minimized tab, or during a resize: scale 1, no crash, no error in the console.
- Fast repeated resize events: the final scale matches the final window size.
- Browser zoom or a display scaling factor that is not a whole number, such as Windows at 125 percent: whole CSS pixels may not land on whole device pixels, so blocks can look uneven. M0 does not handle this. See open question 3.
- Window dragged between a Retina and a non-Retina monitor: the scale follows the window's CSS size. Whether a device pixel ratio change also needs a recompute is part of open question 3.

## Deferred, on purpose

These are in the brief and left out of M0 for stated reasons, not forgotten.

- **GitHub Pages deploy.** The GitHub repo and its name do not exist yet, the Vite base path depends on that name, and deploys are ask-first per CLAUDE.md.
- **Nightly harness and 20-year soak workflow.** There is nothing to run until M1. An empty workflow would pretend to be finished work.
- **Branch protection that blocks merges on red.** It is a GitHub setting and needs the remote.

## Dependencies and order

1. The folder is not a git repository yet. `git init`, a `main` branch, and a feature branch for M0 have to exist before M0.1 is committed, since nothing goes straight to `main`.
2. M0.1 first. M0.2 needs the tooling. M0.3 needs the scripts to exist so the workflow has something to call.
3. M0.2 and M0.3 can be built in either order once M0.1 is in.
4. Adding packages (Phaser, Vite, Vitest, ESLint, typescript-eslint, any CI action) counts as new dependencies, which are ask-first per CLAUDE.md. Joseph approving this spec approves that list.
5. M0 does not wait for DESIGN.md. Placeholder colors are swapped when it is approved, which is a later task.

## What is locked and what will change

Locked for later milestones: the five script names, the sim boundary rule, the 256x240 frame, whole-number scaling, the pure scale function and its tests, one pinned Node version.

Likely to change: the placeholder colors (when DESIGN.md is approved), the test scene itself (replaced in M1), the Node and package versions (through Dependabot), the workflow (Pages deploy and nightly jobs get added later), and the handling of non-whole display scaling if open question 3 asks for it.

## Open questions

1. **GitHub repo name.** Not chosen. It sets the remote, the CI run, and the Vite base path. Open.
2. **Pages deploy.** Once the repo exists, should a deploy-from-main-after-green job be added, and in which milestone? Open.
3. **Non-whole display scaling.** Scale is counted in CSS pixels. On Joseph's Mac the device pixel ratio is a whole number, so that is crisp. On a 125 or 150 percent display, or with browser zoom, it may not be. Should the scale count device pixels instead, and which displays must the playtest gate cover? Open.
4. **gitleaks licensing.** The official gitleaks GitHub Action needs a license key for repos owned by an organization, not for a personal account. If the repo will live under an organization, the scan should run the gitleaks binary directly instead. Open until the repo owner is known.
