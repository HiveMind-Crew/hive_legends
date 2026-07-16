# Hive Legends — repository conventions

## Architecture rules (enforced, do not violate)

- `src/sim` and `src/content` must never import Phaser or browser APIs, use
  `Math.random`, or read wall-clock time (`Date.now`). ESLint enforces this.
  All randomness goes through the seeded RNG in `src/sim/rng.ts` via
  `SimState.rngState`; all time is the tick counter.
- The sim advances only through `simTick(sim, inputs)` at a fixed 60 Hz.
  Rendering, audio, and UI react to `SimEvent`s and read `SimState`; they
  never mutate it. This is the contract that makes online co-op (lockstep)
  and headless testing possible — treat any violation as a defect.
- Gameplay numbers (hero kits, enemy stats, generator behavior, levels) are
  data in `src/content`, not constants in engine code.
- Meta-progression (gold bank, permanent upgrades) lives in `src/meta/save.ts`
  and enters the sim only as `HeroModifiers` at `createSim` time.

## Layout

- `src/sim` — deterministic simulation core (engine-free)
- `src/content` — data-authored heroes, enemies, generators, levels
- `src/game` — Phaser scenes and rendering (presentation only)
- `src/meta` — persistent profile/upgrades (localStorage)
- `tests/` — vitest unit tests for the sim
- `e2e/` — Playwright gameplay playthrough (bot plays the real build)
- `docs/adr/` — architecture decision records; `docs/STATUS.md` — milestone log

## Verification (all must pass before committing)

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

In the Claude Code cloud sandbox run e2e with
`CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test`.

## Content licensing

All names, art, and text must be original. Gauntlet Legends may inspire
mechanics and structure only — never reproduce its characters, names, maps,
or other protected expression.
