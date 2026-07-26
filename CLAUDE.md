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
- Gameplay numbers (hero kits, enemy stats, generator behavior, boss phases,
  the XP curve, levels) are data in `src/content`, not constants in engine
  code.
- Meta-progression (gold bank, permanent upgrades, banked XP, owned weapons)
  lives in `src/meta/save.ts` and enters the sim **only at `createSim` time**,
  through `SimPlayerConfig`: `modifiers` (upgrades), `attack` (the resolved
  equipped-weapon `AttackDef`), and `startXp` (banked XP, from which the sim
  derives the starting level). The sim never reads the profile.

## Hero combat

Before changing any hero attack, ability, or weapon tier, read
`docs/COMBAT.md`. It states the archetype each hero owns and the shared combat
rules they are tuned against (no armour exists, so per-hit damage buys nothing;
cadence at or below the hitstun window is a permanent stunlock). Its number
tables are generated from `src/content` — after a tuning change run
`npm run docs:combat` and review the regenerated diff. The archetype invariants
in `tests/combat.test.ts` fail when a change crosses an archetype line rather
than a tuning line.

## Mission progression

Before changing how the player moves between missions — spokes, unlocks, the
hub — read `docs/PROGRESSION.md`. The wheel is 3 sequential missions capped by
a boss; everything derives from `Profile.clearedLevels`, so adding a realm is a
content change in `src/content/spokes.ts` and needs no unlock code, no scene
code, and no save migration. If a spoke change requires editing a scene,
something has gone wrong.

## Layout

- `src/sim` — deterministic simulation core (engine-free)
- `src/content` — data-authored heroes, enemies, generators, levels
- `src/game` — Phaser scenes and rendering (presentation only)
- `src/meta` — persistent profile/upgrades (localStorage)
- `public/art/` — optional drop-in PNG overrides for generated textures,
  listed in `public/art/manifest.json` (see `docs/ART.md`)
- `tests/` — vitest unit tests for the sim
- `e2e/` — Playwright gameplay playthrough (bot plays the real build)
- `scripts/` — doc generators (not shipped in the build)
- `docs/adr/` — architecture decision records; `docs/STATUS.md` — milestone log;
  `docs/COMBAT.md` — hero attack/ability reference (partly generated);
  `docs/PROGRESSION.md` — the mission wheel and how to add a realm

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
