# Bluegrass Dynasty (working title)

A single-player thoroughbred racing management sim with RPG progression, in 8-bit pixel art, for the browser. Solo project. The full brief lives in docs/BRIEF.md.

## Stack and commands

- Stack: TypeScript, Phaser 3, Vite, Vitest. ESLint for lint.
- Run: `npm run dev`
- Test: `npm test`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Build: `npm run build`

## Key directories

- `src/sim/`: pure TypeScript game rules. No Phaser imports, runs headless.
- `src/render/` and `src/scenes/`: drawing and display. The only places Phaser may be imported. Reads sim state, never owns it.
- `src/data/`: all content and tuning values, validated by schemas. Real race, track and venue names live here so they can be swapped.
- `docs/`: BRIEF.md, DECISIONS.md, ASSETS.md, PERF.md, specs/.
- `DESIGN.md` (repo root): the visual source of truth. Read it before any art or UI work.

## How to work here

The main session plans, delegates and reviews. Subagents can't spawn other subagents, so all delegation happens from here.

- Small change (one file, obvious fix, no new behavior): do it directly, then run the tests. No chain.
- Anything bigger runs in this order:
  1. Spec. UI or flow work: designer. Everything else: spec-writer, with acceptance criteria.
  2. Build: engineer, from the spec. If the cause of a bug isn't obvious, debugger finds it first.
  3. Check: code-reviewer on the diff and test-writer against the spec, in parallel. engineer never reviews its own work.
  4. FLAGS from either go back to engineer, then check again. Done when both are clean and the tests pass.
- playtester runs the headless balance harness after any game-rule change.
- art-director owns DESIGN.md and accepts or rejects every asset. artist makes assets and logs each one in docs/ASSETS.md.
- To review as a persona, say "review this as the burned-out engineer" (review-as skill).

## Subagent models

Set the `model` on every subagent or session by the job, then review every result yourself before it lands:

- **Haiku:** mechanical work. Running and reading test or soak output, measurement scripts, screenshots, renames, doc and log updates, data tweaks, code searches.
- **Sonnet:** routine, well-specified edits.
- **Opus:** design-heavy or tricky work. Architecture, the race sim, rendering, planning.

## Conventions that cause bugs if missed

- The sim is seeded and deterministic. Same seed, same result. Each system draws from its own named RNG stream, so a new feature never shifts old race outcomes. Never call `Math.random()` or read the clock inside `src/sim/`.
- Balance and tuning values live in data files, never in code.
- Internal resolution is 256x240 with integer scaling only. No sub-pixel positions, no smoothing.
- No global singletons for game state.

## Boundaries

- Always: run the tests before calling work done. Never weaken or delete a test to make it pass.
- Ask first: schema changes, new dependencies, anything that deploys.
- Never: commit secrets, commit straight to `main` (branch first), add real-money or real-gambling hooks, show a fatal or graphic injury.
- Do only the milestone Joseph names. Do not build ahead.

## Project notes

- Every dollar figure, fee, takeout rate and stat range in the brief is a starting guess until Joseph confirms it.
- Each non-obvious choice gets two or three lines in docs/DECISIONS.md.
- Every milestone ends with a playtest gate: playable start to finish before the next one begins.
