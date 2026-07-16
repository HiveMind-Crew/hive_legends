# ADR 0002 — Deterministic simulation core, engine-free

Date: 2026-07-16 · Status: accepted

## Decision

All gameplay runs in a deterministic fixed-timestep (60 Hz) simulation in
`src/sim`, isolated from Phaser. Inputs enter as per-player `InputCommand`s;
randomness comes only from a seeded mulberry32 RNG stored in `SimState`;
output is the state plus a per-tick `SimEvent` list the presentation layer
consumes for effects and UI.

## Context

The confirmed multiplayer target is local + online co-op. Online co-op for a
horde game with hundreds of entities is most cheaply achieved by input-lockstep
(send only inputs, every peer simulates identically), which requires a
deterministic, engine-independent simulation. This must be built in from the
start; retrofitting determinism is a rewrite.

## Rules (enforced by ESLint and code review)

1. No Phaser/browser imports in `src/sim` or `src/content`.
2. No `Math.random` / `Date.now` in the sim — seeded RNG and tick counter only.
3. Rendering reads state and events; it never mutates sim state.
4. Gameplay tuning lives in `src/content` data, not code.

## Consequences

- The entire game is unit-testable headlessly (see `tests/sim`), including a
  determinism regression test (same seed + inputs ⇒ identical state hash).
- Local co-op = more `InputCommand`s per tick. Online co-op = transporting
  commands; the sim is already shaped for it. (Floating-point determinism
  across identical JS engines is sufficient for browser-vs-browser lockstep;
  cross-engine play would need fixed-point math — revisit if that becomes a
  requirement.)
- The render layer must smooth over the fixed tick (acceptable at 60 Hz; add
  interpolation if the tick rate ever drops below display rate).
