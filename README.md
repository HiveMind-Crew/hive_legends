# Hive Legends

A cooperative arcade action RPG — a hack-and-slash horde brawler inspired by
the high-level structure of classic arcade dungeon crawlers, with an original
world, heroes, and enemies.

Fight through warrens crawling with hive-spawned creatures, destroy the Brood
Nodes that endlessly produce them, collect gold and artifacts, and face
Mireveil, Mother of the Brood. Your hero levels up *mid-run* from the kills
you make, and the gold you bank buys permanent upgrades between missions.

**Currently playable:** four heroes (Vanguard, Arcanist, Ranger, Sentinel) and
one realm on the mission wheel, **The Azure Reach** — The Brood Warrens, The
Resin Galleries, The Cobalt Combs, and the finale in The Hollow Throne — with
keys and hidden vaults, timed relics, a screen-clear potion, weapon tiers, and
a three-phase boss.

## Play

```bash
npm install
npm run dev        # http://localhost:5173
```

Controls: **WASD/Arrows** move · **Space/J** attack · **Shift/K** hero ability ·
**Q** quaff a potion · **Enter** confirm · **Esc** pause · **F** fullscreen.
Gamepad (any standard-mapping pad, hot-pluggable): **left stick / d-pad** move ·
**(A)** attack and confirm · **(X)** ability · **(Y)** potion · **(B)** back ·
**START** pause and settings · **LB/RB** buy upgrades in the results shop.
Missions are chosen on the wheel: **↑↓** node · **←→** realm · **Enter** deploy.
Open settings with **S** from hero select or pause (**O** on the wheel/results);
there, **←→** adjusts volume and **M** toggles mute.

The game is authored at a fixed 960×720 and letterboxed to fit whatever window
it is given, so it is playable at any size.

## Development

| Command            | What it does                                   |
| ------------------ | ---------------------------------------------- |
| `npm run dev`      | Dev server with hot reload                     |
| `npm test`         | Simulation unit tests (vitest)                 |
| `npm run test:e2e` | Automated gameplay playthrough (Playwright)    |
| `npm run lint`     | ESLint (enforces sim-core purity rules)        |
| `npm run typecheck`| TypeScript strict check                        |
| `npm run build`    | Production build to `dist/`                    |

`npm run test:e2e` requires `npm run build` first — it plays the real built
game with a pathfinding input bot and screenshots each stage to `test-results/`.

**Full guide to running and testing locally: [`docs/TESTING.md`](docs/TESTING.md)**
(test layers, the e2e bot, the `__hive` debug handle, CI parity).

## Architecture in one paragraph

The game logic lives in `src/sim` as a deterministic fixed-timestep simulation
(pure TypeScript, seeded RNG, driven only by per-player `InputCommand`s) with
all gameplay stats data-authored in `src/content`. Phaser (`src/game`) is a
presentation layer that steps the sim and renders its state; it never makes
gameplay decisions. This split keeps the whole game headlessly testable and is
the foundation for lockstep online co-op. See `docs/adr/` for the reasoning
and `docs/STATUS.md` for milestone state.
