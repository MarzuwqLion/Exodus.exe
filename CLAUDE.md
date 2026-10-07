# EXODUS.EXE

Browser game MVP built from `EXODUS_MVP_SPEC.md` (the source of truth).

## Resume protocol

1. Read `EXODUS_MVP_SPEC.md` (§0 is the autonomous build protocol), then `PROGRESS.md`, then `DECISIONS.md`.
2. Run `npm run typecheck && npm run lint && npm run test` and continue from the first unchecked task in `PROGRESS.md`.
3. Commit after every completed task with a message naming the milestone and task. Quality gates must pass first.

## Architecture

- `src/core`, `src/sim`, `src/run`, `src/content`, `src/bots` are headless: no Three.js, no DOM rendering, no `Math.random`
  (ESLint enforces this). They run in Node for tests, bots, and the economy simulator.
- `src/render`, `src/models`, `src/anim`, `src/ui`, `src/audio`, `src/scenes` read simulation state and never mutate it.
- All player input reaches the simulation as `PlayerIntent` per slot (`src/core/types.ts`).
- Tunable numbers live in `src/content/tuning.ts`.

## Commands

`npm run dev`, `build`, `preview`, `typecheck`, `lint`, `test`, `test:bots`, `sim:economy`, `qa:screens`, `bench`.
