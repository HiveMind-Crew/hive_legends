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
**Q** quaff a potion · hold **E** to revive · **Enter** confirm · **Esc** pause. On a gamepad:
**left stick / d-pad** move · **(A)** attack and confirm · **(X)** ability ·
**(Y)** potion · hold **(B)** to revive · **START** pause for P1 / join for
P2–P4 · **BACK** drop out an extra slot. On hero select,
**←→** pick a hero, **B** recruit. On the wheel, **↑↓** move along a spoke,
**←→** jump between realms, **Enter** deploy, **H** back to hero select. In
the results shop, **1/2** buy upgrades, **3/4** weapons, **N** next mission,
**W** back to the wheel, **R** replay, **H** hero select. Open settings with
**S** from hero select or pause (**O** on the wheel/results); there, **←→**
adjusts master volume and **M** toggles mute.

To play the exact build that ships:

```bash
npm run build && npm run preview   # production build → http://localhost:4173
```

## The three test layers

| Layer | Command | What it proves |
| --- | --- | --- |
| Static | `npm run lint && npm run typecheck` | Style + types, **and the sim-purity rules** (no Phaser/`Math.random`/`Date.now` inside `src/sim` or `src/content` — see ADR 0002) |
| Unit (vitest) | `npm test` (watch: `npm run test:watch`) | The whole gameplay sim, headlessly: movement, combat, attack windups, generators and enrage, pickups and power-ups, keys/gates/secrets, the boss phase script, XP and levelling, and a determinism regression (same seed + inputs ⇒ byte-identical state) |
| End-to-end (Playwright) | `npm run build && npm run test:e2e` | A bot plays the real production build through the browser keyboard path: BFS-pathfinds The Brood Warrens, destroys all three spawners, exits, banks gold and XP, buys an upgrade, and replays with both the upgrade and the earned level applied |
| Gamepad (Playwright) | same command | The same bot clears the same mission on a pad, navigating hero select, the wheel and results with it, and a pad plugged in mid-run takes over without a reload (`e2e/gamepad.spec.ts`) |
| Local co-op (Playwright) | same command | Two fake standard pads join through independent command streams, deliberately drop out/rejoin, clear The Brood Warrens, and bank the shared run once (`e2e/coop.spec.ts`, issue #106) |
| Continue (Playwright) | same command | A run stands still until the Warrens kill it, then buys a continue and is back on its feet at half HP with the gold gone; falling again and declining ends the run as before (`e2e/continue.spec.ts`, issue #99) |
| Viewport (Playwright) | same command | The fixed 960×720 canvas fits, keeps its aspect ratio and stays centred in windows smaller and larger than native, and re-fits on a live window resize (`e2e/viewport.spec.ts`) |

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

## Viewport test (`e2e/viewport.spec.ts`)

Guards the scale manager (issue #94). Every scene lays out against a constant
960×720, so the only thing between the game and an arbitrary window is
`Scale.FIT` in `src/main.ts`; without it the canvas is emitted at native size
into an `overflow: hidden` body and anything outside 960×720 is cut off and
unreachable. Note the playthrough spec runs at exactly 960×720, which is the
one size where the bug is invisible — hence a separate spec that varies it.

The live-resize case needs a foregrounded page: Phaser polls the parent element
from inside the game loop, and the loop is suspended while a tab is hidden.

## End-to-end tests (`e2e/`)

- Requires a production build first: `npm run build` (the Playwright config
  starts `npm run preview` automatically).
- Watch it play in a real window: `npx playwright test --headed`.
- Screenshots of each stage land in `test-results/`:
  `01-hero-select` → `01b-mission-hub` → `01c-settings` →
  `01d-reset-confirm` → `02-mission-start` →
  `02b-resin-galleries-art` (dedicated amber-resin environment pack) →
  `02c-pause-menu` → `03-horde-combat` →
  `03b-combat-juice` (moment of the first kill) →
  `03c-node-damaged` (generator damage tiers) → `04-results` →
  `05-replay-upgraded`, plus the gamepad run's
  `07-gamepad-mission-start` → `08-gamepad-results` → `09-gamepad-wheel` →
  `10-gamepad-hotplug`, plus the continue run's `11-continue-prompt` →
  `12-continued-run` → `13-continue-declined-results`, and co-op's
  `14-four-player-joined` → `15-four-player-results`. CI uploads these as
  artifacts on every run. The Resin Galleries expedition also records
  `issue150-crown-finale`, `issue150-solo-results`,
  `issue150-four-player-joined`, and `issue150-four-player-results`.
- The bot reads game state through a read-only debug handle the game exposes
  on `globalThis`:

  ```js
  // paste in the browser console during any mission
  __hive.getState()   // deep-copied SimState: players, enemies, generators…
  ```

  The same handle is handy for manual debugging (e.g. watching
  `__hive.getState().generators[0].enrageTicksLeft` tick down). It exists only
  while a mission is active and is removed when the run reaches results or is
  abandoned.
- Settings tests use a similarly read-only `__hiveSettings.getState()` handle
  while that screen is open to observe volume, mute, reset confirmation, and
  its return target without reaching into Phaser objects.

## Gamepad test (`e2e/gamepad.spec.ts`)

Guards the pad path added in issue #98, and needs no hardware. The specs
install fake entries in `navigator.getGamepads()` before the page loads:
Phaser rebuilds its pad list from that call on every update, so a fake pad is
indistinguishable from a real one — and that same polling is why hot-plug works
in the game without any connect/disconnect handling of its own.

Two details are easy to get wrong when extending it:

- The fake's `timestamp` must be **live** (a getter returning
  `performance.now()`). Phaser drops any pad frame stamped earlier than the
  moment it first saw the device, so a fixed timestamp silently freezes input.
- Phaser's button press threshold is `1`, so a pressed button must report
  `value: 1`, not merely `pressed: true`.

The bot brain is shared with the keyboard playthrough (`e2e/bot.ts`), which is
the point: the pad run proves the *device*, not a second, easier bot. Its
driver pushes the stick to 0.85 rather than 1 so the deadzone and quantisation
are actually exercised.

`e2e/coop.spec.ts` installs two independently addressable entries. It proves
the truthful browser integration seam, not physical Bluetooth hardware: P2
must press START after the pad is visible, BACK emits an explicit deterministic
leave command, and disconnecting the fake device alone leaves the slot active
and idle. Two instances of `WarrensBot` then clear the mission through pad 0
and pad 1, and the spec checks that shared-profile gold, XP, and completion
bank once rather than once per hero.

`InputCommand.moveX/moveY` are still
integers in {-1,0,1}: `src/game/padMapping.ts` quantises a stick past
`STICK_DEADZONE` into exactly the value the matching key produces, so
`hashState` and the determinism regression are untouched by gamepad support.
Widening those fields to floats for analogue speed is a deliberate, separate
change — it is sim-visible, and it re-baselines determinism.

Participation adds three deterministic booleans: `join` and `leave` are rising
edges; `interact` is the held revive verb. The browser decides which command
to sample, but only `simTick` changes `PlayerState.participating`, so the same
input sequence still hashes exactly.

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
