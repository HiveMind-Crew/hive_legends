# ADR 0001 — Engine: TypeScript + Phaser 3 (web)

Date: 2026-07-16 · Status: accepted

## Decision

Hive Legends is built in TypeScript on Phaser 3, targeting the browser first.
Vite builds, vitest unit-tests the simulation, Playwright drives full gameplay
tests against the production build.

## Context

The project brief left engine/platform open. The confirmed direction (user
decision, 2026-07-16): web stack, with architecture targeting local + online
co-op.

## Rationale

- The genre (top-down 2D arcade horde brawler) fits a lightweight 2D engine.
- Browser delivery makes every build instantly playable and shareable.
- Development happens partly in headless cloud environments; a web game can be
  fully built, played by an input bot, and screenshotted there. A native
  engine could only run logic tests headlessly.
- Local co-op on one machine is straightforward; online co-op is reachable via
  WebSockets and the deterministic sim (ADR 0002).
- Desktop packaging (Tauri/Electron) remains open as a later distribution path.

## Consequences

- Performance budget is the browser: target 60 fps with ~150 active entities;
  keep per-frame allocations low in the render sync.
- Persistent saves use localStorage now; a profile service would be needed for
  cross-device progression later.
- Phaser is rendering/input only — gameplay never depends on engine physics,
  so an engine swap would not touch `src/sim`.
