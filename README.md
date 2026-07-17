# Hive Legends

A cooperative arcade action RPG — a hack-and-slash horde brawler inspired by
the high-level structure of classic arcade dungeon crawlers, with an original
world, heroes, and enemies.

Fight through warrens crawling with hive-spawned creatures, destroy the Brood
Nodes that endlessly produce them, collect gold and artifacts, defeat guardians,
and grow your hero between missions.

## Play

```bash
npm install
npm run dev        # http://localhost:5173
```

Controls: **WASD/Arrows** move · **Space/J** attack · **Shift/K** hero ability ·
**Enter** confirm.

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

## Architecture in one paragraph

The game logic lives in `src/sim` as a deterministic fixed-timestep simulation
(pure TypeScript, seeded RNG, driven only by per-player `InputCommand`s) with
all gameplay stats data-authored in `src/content`. Phaser (`src/game`) is a
presentation layer that steps the sim and renders its state; it never makes
gameplay decisions. This split keeps the whole game headlessly testable and is
the foundation for lockstep online co-op. See `docs/adr/` for the reasoning
and `docs/STATUS.md` for milestone state.
