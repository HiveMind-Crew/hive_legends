# Project status

Updated: 2026-07-18 (look & feel: issues #1–#7 all landed; balance pass)

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

## Look & feel track (new)

A presentation review against the genre's arcade benchmark identified the gap
as almost entirely look/feel, not mechanics. Direction is recorded in
`docs/design/visual-direction.md`; work is broken into GitHub issues #1–#9
with roadmap/tracking in issue #10. Recommended order: depth + combat juice
(#1, #3) → character/threat readability (#2, #6, #7 — #7 must land before M1
adds new enemy types) → HUD, audio, environment, menus (#4, #8, #5, #9).

Landed:

- [x] #1 Visual depth pass — raised wall front faces, elliptical drop shadows
  under all mobiles, y-sorted sprites (`depth = y`, walls sort by their bottom
  edge), pickup hover bob, pulsing exit portal. Rendering-only.
- [x] #2 Character animation & readability — hero has 8-way directional frames
  with a 2-frame walk cycle and attack-swing pose plus an always-visible
  facing chevron; skitterlings crawl-wiggle, rotate to their heading, and
  flare red in a windup pose before striking; per-player accent colors
  (underglow ring + chevron + HUD P1 chip) via `src/game/colors.ts`.
  Caveat: an enemy's *first* contact hit lands without a telegraph because
  the sim has no windup state (cooldown starts at 0) — fold a real windup
  into the enemy-readability work in #7.
- [x] #3 Combat juice — hit-stop on kills (render stepping pauses, sim ticks
  never skipped), pooled particle bursts (ichor, chitin shards, dust, coin
  sparks, heart wisps), floating damage numbers, knockback motion trails,
  camera lookahead + melee-impact kick, and full Sunder Slam presentation
  (screen flash, double shockwave, scorch decal, heavy shake). All effects
  count-capped. The `enemy-hit`/`enemy-died`/`generator-hit` SimEvents now
  carry the damage dealt — an event-payload addition only; state evolution
  and the determinism test are unchanged. The e2e run now also captures
  `test-results/03b-combat-juice.png` right after the first kill.
- [x] #6 Generator presence — three damage-tier textures (intact →
  cracked/leaking → crumbling) swapped from `hp/maxHp`, HP bar recolors by
  tier; idle breathing, a pre-spawn bulge read from `spawnCooldown`, an
  egg-burst + node squash-pop + hatch scale-in on `enemy-spawned`; two-stage
  destruction with lingering scorch, heavier shake, and longer hit-stop.
  Ships the sim-side enrage mechanic: a generator whose HP first drops below
  half panic-spawns at half interval for 3 s (one-shot, data-driven via
  `GeneratorDef.enrage` in `src/content/enemies.ts`, new `generator-enraged`
  SimEvent, red pulsing warning ring + ENRAGED float text in the renderer;
  unit-tested including expiry and no re-trigger).
- [x] #7 Enemy visual grammar — `EnemyDef` gains `family` (skitter/husk/
  spitter silhouettes) and `tier` (common/veteran/elite palettes); the
  texture generator composes family x tier x frame, so a new enemy is pure
  content data. Elites: crimson palette, glow outline, renderer size bump,
  persistent ground ring. Content-validity unit test added. Husk/spitter
  silhouettes exist but no enemy uses them yet — M1's new enemy types are
  now data-only work.
- [x] #4 Arcade HUD — four fixed per-player panels (accent frame, portrait,
  large health number with low-health pulse, rolling gold counter, kills,
  ability meter with READY! flash), dimmed JOIN placeholders for empty
  slots, centered objective ribbon with pop animation, and full-screen
  victory/defeat banners before the results scene. Panel data flows from
  `SimState.players`, not a hardcoded single player.

The e2e bot now retreats to health pickups when hurt and slams earlier —
the enrage mechanic legitimately killed the old face-tank strategy (a good
sign for the mechanic). The results-transition assertion polls for the
banked profile instead of sleeping a fixed time (the end banner lengthened
the transition).

- [x] #5 Environment art & lighting — 4 deterministic floor variants chosen
  by tile-coordinate hash (no RNG; same level ⇒ same dressing), flat inner
  wall variant so edges pop, data-authored decor layer (egg clusters, resin
  webbing, glowing spore patches with pulsing additive glows), screen-edge
  vignette in the HUD scene, animated exit portal (spin + pulse + cyan glow
  + drifting motes). Ships destructible props as a real sim entity:
  `PropDef`/`PropState`, one-hit resin husks (gold 4–9) and amber clutches
  (health 10–20) dropping loot through the seeded RNG, `prop-destroyed`
  SimEvent, level validation for prop/decor placement, and sim + content
  unit tests.

## Balance record (2026-07-18)

Solo-clear attrition after enrage shipped was over-tuned: the e2e bot (now
playing competently — heal-seeking incl. smashing amber clutches, early
Sunder Slams) still died in ~half its runs, always to sustained contact
pressure near the second node. Data-side tune: skitterling touchDamage
8 → 7, enrage intervalMult 0.5 → 0.6, enrage duration 180 → 150 ticks
(2.5 s), and a third health pickup on the mid-map route (16,6). Enrage
urgency is preserved; attrition ceiling drops ~20%.

Preserved failure artifacts then showed deaths clustering at the 2-tile
doorway between the NE and SE chambers. Widened it to 3 tiles and softened
solo pressure further (maxAlive 6 → 5 per node — 12 concurrent chasers is
co-op pressure; scale generator output per player count when co-op lands
in M3). The e2e bot also gained a defensive Sunder Slam when cornered and
full-heal hysteresis (oscillating between distant heal spots at a fixed
threshold was feeding it to the swarm).

The decisive find came from adding a per-poll bot trace to the spec: the
remaining "deaths" were actually a **bot pathing deadlock** — the ±6 px
waypoint tolerance could leave the hero's circle clipping a wall corner by
~1 px, and with axis-separated collision it held one arrow key forever
without the perpendicular correction, farming the spawn treadmill in place
until it died or timed out. Fix: tolerance tightened to ±3 px (radius 12 +
3 < half-tile 16, so corners can never catch) plus a stuck-detector
jiggle. Result: **8/8 consecutive e2e passes**; the trace now auto-dumps
on any future failure.

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
