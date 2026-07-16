# Project status

Updated: 2026-07-16

## Milestones

- **M0 — Foundations: COMPLETE.** Toolchain, CI, deterministic sim core
  (ADR 0002), data-driven content, docs.
- **M1 — Vertical slice: IN PROGRESS (slice 0 complete).** See checklist.
- M2 — Systems depth (full roster, progression trees, first full realm): not started.
- M3 — Co-op (local first, then online lockstep): not started.
- M4 — Content expansion (realms 2–3, elites, hazards, economy): not started.
- M5 — Final realm, release polish: not started.

## Vertical-slice checklist (M1)

Done in slice 0:

- [x] Hero-selection screen (1 hero + locked roster slots)
- [x] One compact mission: The Brood Warrens
- [x] Responsive movement and melee combat with knockback
- [x] Hero ability (Vanguard: Sunder Slam)
- [x] One standard enemy (Skitterling) with chase AI and crowd separation
- [x] Two destructible enemy generators (Brood Nodes) with alive caps
- [x] Health and gold pickups; gold drops from kills and generators
- [x] Objective flow: destroy all generators → exit opens → completion
- [x] Mission-results screen with stats
- [x] Persistent upgrades shop (Hearthstone Vigor, Sharpened Edge)
- [x] Replay with retained progression

Remaining for the full slice:

- [ ] Second playable hero (Arcanist archetype: area magic / crowd control)
- [ ] Two more standard enemy types + one elite enemy
- [ ] Key-controlled gate and a hidden treasure area
- [ ] Temporary power-up
- [ ] Boss encounter
- [ ] Hub polish (hero select → mission select flow)
- [ ] Audio (original SFX/music)
- [ ] XP/level progression in addition to gold upgrades

## Verification state

`lint`, `typecheck`, 19 unit tests, production build, and the Playwright
gameplay playthrough (bot completes the mission, buys an upgrade, replays
with retained power; screenshots in `test-results/`) all pass. One transient
e2e failure was observed once during development and did not reproduce in 4
consecutive runs — watch CI for recurrence.

## Known limitations / risks

- Player death ends the mission (no revive); revival mechanics arrive with co-op.
- Programmer-art textures and no audio yet.
- Enemy pathing is straight-line steering; enemies can snag on walls in
  concave layouts (acceptable in current map; needs flow-field or A* later).
- Phaser bundle is ~1.5 MB (348 kB gzip); fine for now, consider code-splitting
  at content growth.

## Next recommended task

Add the Arcanist as the second hero (validates that hero kits are truly
data-driven), then the elite enemy + boss encounter to complete the combat
variety of the slice.
