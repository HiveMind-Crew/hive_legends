# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Hive Legends is a cooperative arcade action-RPG horde brawler: TypeScript +
Phaser 3, built with Vite, tested with vitest (sim) and Playwright (real
build). No backend, no binary dependencies.

## Commands

```bash
npm run dev            # dev server → http://localhost:5173
npm test               # vitest, unit tests in tests/ only
npm run test:watch     # vitest in watch mode
npm run lint           # eslint src tests e2e scripts (also enforces sim purity)
npm run typecheck      # tsc --noEmit
npm run build          # typecheck + vite build → dist/
npm run preview        # serve the production build on :4173
npm run test:e2e       # Playwright playthrough; requires `npm run build` first
npm run docs:combat    # regenerate the tables in docs/COMBAT.md from src/content
npm run art:build      # re-encode the pixel-grid art packs into public/art/
```

Single test file / single case:

```bash
npm test -- tests/sim/boss.test.ts
npm test -- tests/sim/boss.test.ts -t "phase"
```

`docs:combat` and `art:build` are the same vitest specs as `npm test` re-run
with `UPDATE_DOCS=1` / `UPDATE_ART=1`; in a normal run those specs *fail* when
the checked-in output is stale, so regenerate and commit the diff.

## Architecture rules (enforced, do not violate)

- `src/sim` and `src/content` must never import Phaser or browser APIs, use
  `Math.random`, or read wall-clock time (`Date.now`). ESLint enforces this.
  All randomness goes through the seeded RNG in `src/sim/rng.ts` via
  `SimState.rngState`; all time is the tick counter.
- The sim advances only through `simTick(sim, inputs)` at a fixed 60 Hz.
  Rendering, audio, and UI react to `SimEvent`s and read `SimState`; they
  never mutate it. This is the contract that makes online co-op (lockstep)
  and headless testing possible — treat any violation as a defect.
- Gameplay numbers (hero kits, enemy stats, generator behavior, boss phases,
  the XP curve, levels) are data in `src/content`, not constants in engine
  code.
- Meta-progression (gold bank, permanent upgrades, banked XP, owned weapons)
  lives in `src/meta/save.ts` and enters the sim **only at `createSim` time**,
  through `SimPlayerConfig`: `modifiers` (upgrades), `attack` (the resolved
  equipped-weapon `AttackDef`), and `startXp` (banked XP, from which the sim
  derives the starting level). The sim never reads the profile.

`hashState(state)` in `src/sim/sim.ts` exists for the determinism regression:
same seed + same inputs must produce byte-identical state.

## How the pieces connect

Types first: `src/sim/types.ts` declares every content shape (`HeroDef`,
`EnemyDef`, `LevelDef`, `SpokeDef`, …) *and* every runtime state shape
(`SimState`, `PlayerState`, `SimEvent`). `src/content/index.ts` assembles the
authored data into a single `CONTENT: ContentDb` plus the `LEVELS` map; the sim
takes both as configuration and holds no hardcoded content.

Scene flow (`src/main.ts` registers them):

```
BootScene → HeroSelectScene → MissionHubScene → MissionScene (+HudScene) → ResultsScene
                    ↑                  ↑                                       │
                    └──────────────────┴───────────────────────────────────────┘
```

- `BootScene` loads `public/art/manifest.json` overrides, rejects wrong-sized
  PNGs, then generates programmer art for every remaining texture key.
- `MissionHubScene` draws the wheel and *only* draws it — every lock/unlock
  answer comes from `nodeLockState` and friends in `src/meta/save.ts`, and the
  player-facing wording from `src/game/hubCopy.ts` (kept out of the scene so it
  is testable without Phaser).
- `MissionScene` owns the only sim loop: accumulate real time, step
  `simTick` at a fixed 60 Hz (capped at `MAX_STEPS_PER_FRAME`), render
  `SimState`, and turn the returned `SimEvent[]` into juice and audio. Hit-stop
  pauses the loop without accumulating delta, so juice never costs the sim a
  tick; only a genuine stall drops backlog (the spiral-of-death guard).
- `ResultsScene` banks gold/XP, sells upgrades and weapon tiers, and returns
  through the hub so a newly unlocked node is seen to open.

Anything a test or the e2e bot needs to observe goes through `SimState`, not
through Phaser objects; the game exposes a read-only `__hive.getState()` handle
on `globalThis` for that (see `docs/TESTING.md`).

## Combat

`docs/COMBAT.md` is the source of truth for **every attack in the game** —
heroes, enemies, and the boss. Read it before changing any attack, ability,
weapon tier, enemy, or boss phase. It states the archetype each actor owns and
the combat rules they are tuned against, and those rules are not guessable from
the code: no armour exists, so per-hit damage buys nothing; a cadence at or
below the hitstun window is a permanent stunlock; enemies deal no contact
damage, so a completed windup is the only way anything touches the player.

It carries two generated regions — the hero tables and the bestiary — both
rebuilt by `npm run docs:combat`. After any tuning change, run it and review
the diff: that diff *is* the balance review.

`tests/combat.test.ts` holds two layers of invariant. The archetype ones fail
when a change crosses an archetype line rather than a tuning line. The
`differentiation` ones fail when two actors converge — the melee split, enemy
attack sameness, tier threat ordering. Neither is a balance assertion; if one
fails, either the data goes back or `docs/COMBAT.md` changes on purpose.

Enemy attack *shape* is not yet data: `executeEnemyAttack` has a single
`if (def.ranged)` fork, so every enemy attacks in one of two ways and variety is
numeric only. Widening that vocabulary is issue #77 — do not fake a new attack
with numbers in the meantime.

## Mission progression

Before changing how the player moves between missions — spokes, unlocks, the
hub — read `docs/PROGRESSION.md`. The wheel is 3 sequential missions capped by
a boss; everything derives from `Profile.clearedLevels`, so adding a realm is a
content change in `src/content/spokes.ts` and needs no unlock code, no scene
code, and no save migration. If a spoke change requires editing a scene,
something has gone wrong.

Currently authored: one spoke, **The Azure Reach** — Brood Warrens → Resin
Galleries → Cobalt Combs → Hollow Throne (boss) — plus two teaser arms that are
data-only stubs. Four heroes: Vanguard, Arcanist, Ranger, Sentinel.

## Art

`src/game/textureSpecs.ts` is the machine-readable list of texture keys and
canvas sizes; `src/game/textures.ts` generates placeholder art for each one at
boot. A real PNG dropped into `public/art/<key>.png` and listed in
`public/art/manifest.json` replaces it with no code change (`docs/ART.md`).
Because both failure modes are silent at runtime, `tests/artPack.test.ts` makes
them structural — every manifest key must be a real texture key with a
correctly sized file behind it, and every checked-in PNG must be listed. Packs
authored as pixel grids under `scripts/art/` must match their PNGs; regenerate
with `npm run art:build`.

## Layout

- `src/sim` — deterministic simulation core (engine-free)
- `src/content` — data-authored heroes, enemies, generators, levels, spokes
- `src/game` — Phaser scenes and rendering (presentation only)
- `src/meta` — persistent profile/upgrades and the progression rules
  (localStorage)
- `public/art/` — optional drop-in PNG overrides for generated textures
- `tests/` — vitest unit tests for the sim (only `tests/**/*.test.ts` is
  collected)
- `e2e/` — Playwright gameplay playthrough (bot plays the real build)
- `scripts/` — doc generators, and the pixel grids the Ranger and Sentinel art
  packs are drawn as (neither is shipped in the build; a pack may equally be
  exported PNGs, as the Vanguard and Arcanist ones are)
- `docs/adr/` — architecture decision records; `docs/STATUS.md` — milestone log
  and the recommended next task; `docs/COMBAT.md` — hero attack/ability
  reference (partly generated); `docs/PROGRESSION.md` — the mission wheel and
  how to add a realm; `docs/TESTING.md` — test layers, the e2e bot, the
  `__hive` debug handle

## Verification (all must pass before committing)

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

This is exactly what `.github/workflows/ci.yml` runs. In the Claude Code cloud
sandbox run e2e with
`CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test`.

## Content licensing

All names, art, and text must be original. Gauntlet Legends may inspire
mechanics and structure only — never reproduce its characters, names, maps,
or other protected expression.
