# Running and testing Hive Legends locally

Everything below runs on a stock Node.js ≥ 20 install — no global tools, no
binary assets, no GPU needed (the e2e suite runs headless).

## Setup

```bash
npm install
npx playwright install chromium   # one-time, only needed for e2e tests
```

## Run the game

```bash
npm run dev        # hot-reload dev server → http://localhost:5173
```

Controls: **WASD/Arrows** move · **Space/J** attack · **Shift/K** ability ·
**Enter** confirm · **M** mute audio · in the results shop, **1/2** buy
upgrades, **R** replay, **H** hero select.

To play the exact build that ships:

```bash
npm run build && npm run preview   # production build → http://localhost:4173
```

## The three test layers

| Layer | Command | What it proves |
| --- | --- | --- |
| Static | `npm run lint && npm run typecheck` | Style + types, **and the sim-purity rules** (no Phaser/`Math.random`/`Date.now` inside `src/sim` or `src/content` — see ADR 0002) |
| Unit (vitest) | `npm test` (watch: `npm run test:watch`) | The whole gameplay sim, headlessly: movement, combat, generators, enrage, pickups, objectives, and a determinism regression (same seed + inputs ⇒ byte-identical state) |
| End-to-end (Playwright) | `npm run build && npm run test:e2e` | A bot plays the real production build through the browser keyboard path: BFS-pathfinds the level, destroys both Brood Nodes, exits, banks gold, buys an upgrade, and replays with the upgrade applied |

The full pre-commit gate (identical to CI, `.github/workflows/ci.yml`):

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

## Unit tests (`tests/`)

- Pure TypeScript against `src/sim` + `src/content` — no browser, no Phaser.
  This is possible because the sim is a deterministic fixed-timestep state
  machine (`simTick(sim, inputs)`), so tests script inputs and assert on
  state and emitted `SimEvent`s.
- Useful patterns to copy from `tests/sim/sim.test.ts`:
  - `runTicks(sim, n, cmd)` — advance n ticks under a held input.
  - Teleporting `sim.state.players[0].pos` next to a target to exercise the
    real damage path without scripting navigation.
  - `hashState(state)` equality for determinism checks.
- Vitest only collects `tests/**/*.test.ts` (`vitest.config.ts`);
  `e2e/*.spec.ts` belongs to Playwright.

## End-to-end test (`e2e/playthrough.spec.ts`)

- Requires a production build first: `npm run build` (the Playwright config
  starts `npm run preview` automatically).
- Watch it play in a real window: `npx playwright test --headed`.
- Screenshots of each stage land in `test-results/`:
  `01-hero-select` → `02-mission-start` → `03-horde-combat` →
  `03b-combat-juice` (moment of the first kill) →
  `03c-node-damaged` (generator damage tiers) → `04-results` →
  `05-replay-upgraded`. CI uploads these as artifacts on every run.
- The bot reads game state through a read-only debug handle the game exposes
  on `globalThis`:

  ```js
  // paste in the browser console during any mission
  __hive.getState()   // deep-copied SimState: players, enemies, generators…
  ```

  The same handle is handy for manual debugging (e.g. watching
  `__hive.getState().generators[0].enrageTicksLeft` tick down).

## Sandbox / CI quirks

- In the Claude Code cloud sandbox the pinned Playwright build isn't
  downloaded; run e2e as
  `CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test`.
- One historical transient e2e flake is documented in `docs/STATUS.md`; if a
  run fails, rerun once before digging in, and keep the `test-results/`
  artifacts from the failing run.

## Determinism guarantees (what makes all this testable)

The sim never touches wall-clock time, `Math.random`, Phaser, or the DOM —
ESLint fails the build if it does. All randomness flows through the seeded
RNG in `SimState.rngState`; time is the tick counter. Renderer-side juice
(hit-stop, particles, camera) can never change gameplay because it only
consumes `SimEvent`s. See `docs/adr/0002-deterministic-sim-core.md`.
