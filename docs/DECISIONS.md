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
