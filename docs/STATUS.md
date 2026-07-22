# Project status

Updated: 2026-07-19 (content expansion: #15, #26, #18, #19, #20, #23 landed; four heroes, three enemy families)

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
**All nine issues are now landed** — the look & feel track is complete;
remaining presentation work rides with M1 content (new heroes/enemies/boss
reuse the systems built here).

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
- [x] #8 Audio foundation — original WebAudio synthesis in `src/game/audio.ts`
  (no binary assets): SFX for every major SimEvent with per-sound throttling,
  a procedural ambient-combat loop (lookahead scheduler) that ducks on
  mission end, and "the Herald" queued announcement ribbon in the HUD for
  low-health / exit-open / elite-arrival / mission-end. Master volume + mute
  persist to the profile (`Profile.volume`/`muted`, `saveAudioPrefs`); M
  toggles mute. Context is created only on the first user gesture and no-ops
  cleanly headless, so the e2e stays silent and error-free.

- [x] #9 Title & hero-select attract mode — layered pulsing logo with glow,
  two ambient drift layers (rising spores + sinking haze) plus a marching
  skitterling silhouette parade, animated hero card (idle cycle, stat bars
  for Power/Speed/Toughness/Control, looping Sunder Slam ring demo),
  silhouette + COMING SOON locked slots, pulsing PRESS ENTER with a bordered
  key-hint footer. Results screen gains banner band/glow with a pop-in title
  and a rolling gold count-up with rising coin ticks.

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

## Content expansion roadmap (issues #15–#29)

The look & feel track (#1–#9, tracking #10) is complete. The next board is
the content expansion, orchestrated for parallel contributors and tracked in
issue #29:

- **Phase 1 — sim foundations**: projectiles/typed kits (#15 — DONE),
  temporary power-ups (#16), keys/gates/secret walls (#17).
- **Phase 2 — classes & combat**: Arcanist (#18 — DONE), Ranger (#19 — DONE),
  Sentinel (#20 — DONE), multi-hero roster (#21), weapon tiers (#22),
  Husk/Spitter/elite enemies (#23 — DONE). All four core classes are now
  playable and the enemy roster spans three families.
- **Phase 3 — levels & finale**: Realm 2 "The Resin Galleries" (#24), the
  Broodmother boss (#25).
- **Art track (parallel)**: drop-in asset pipeline + docs/ART.md (#26 —
  DONE), character art pack (#27), environment/props/UI art pack (#28).

#15 landed: attack defs are a typed union (melee | projectile), bolts are
deterministic sim entities (wall-stopped, piercing, range-limited), with
renderer bolts/muzzle/expiry effects and a synthesized pew. #26 landed:
`public/art/<key>.png` + a manifest entry replaces any texture with zero
code changes; sizes validated at boot against `src/game/textureSpecs.ts`
(now the single source of truth for canvas sizes); artist contract in
`docs/ART.md`; proven end-to-end with a throwaway override fixture.

#18 landed: the Arcanist (Veyra Solmerin) is a fully playable second hero —
a ranged hex-weaver with piercing amber bolts and **Resin Cage**, an
offset-cast root that slows caught enemies to a crawl (`slowTicks`/`slowMult`
on `EnemyState`, applied in the enemy movement step, magnitudes authored in
the ability data). Hero art is now generated per-roster-entry from a
`HeroStyle` table (Vanguard blade vs. Arcanist purple robe + amber staff),
and hero-select is a data-driven roster carousel (`◀ n/total ▶`) that gates
the Arcanist behind a first mission clear. The root/slow mechanic and a
scripted Arcanist mission-clear are unit-tested in `tests/sim/arcanist.test.ts`.

#19 landed: the Ranger (Tamsin Vael) is the third playable hero — the fastest
class, a rapid piercing skirmisher with **Volley Step**, an instant wall-clipped
dash that sprays a backward fan of the hero's own darts. `AbilityDef` is now a
discriminated union (`blast` | `dash-volley`), matching the `AttackDef` pattern,
so abilities are as data-driven as attacks; the dash reuses `moveCircle` (no
i-frames) and `spawnProjectile` fires the fan along fixed deterministic angles.
Art adds a `bow` weapon to the shared `HeroStyle` layout; the renderer draws
Volley Step as a fan of fading hero afterimages with a synthesized bow-whoosh.
Dash determinism, wall-safety, exact dart count, and the pierce cap are covered
in `tests/sim/ranger.test.ts` alongside a scripted Ranger mission-clear.

#20 landed: the Sentinel (Odo Brakk) is the fourth playable hero and the party
anchor — a slow, high-HP bulwark with a wide heavy-knockback maul and **Bastion
Wall**, a timed guard stance. `AbilityDef` gains a third variant (`guard`) and
`PlayerState` a `guardTicks` field: while braced, incoming damage is scaled by
`damageMult`, move speed by `moveMult`, and each blocked hit reflects knockback
onto the attacker (all magnitudes data-authored). Art adds a `maul` weapon
(tower shield + maul) to the shared `HeroStyle`; the renderer shows a steel
shield-glow ring while guarding and the HUD ability bar doubles as the stance
meter; audio adds a guard-raise swell and a block thunk. Damage reduction,
speed penalty, block-knockback, exact stance duration, determinism, and a
scripted mission-clear are covered in `tests/sim/sentinel.test.ts`. With the
Sentinel in, all four core classes are playable and the hero-select roster has
no locked teaser slots left.

#23 landed: the enemy roster expands past the lone Skitterling into three
families — the **Carapace Husk** (slow, tanky melee bruiser), the **Bile
Spitter** (ranged), and the elite **Gravebound Ravager**. The Spitter needed a
new sim mechanic: `ProjectileState` gained a `hostile` flag and `EnemyDef` an
optional `ranged` def, so enemy fire flies as deterministic sim bolts that
strike players (respecting i-frames and Bastion Wall) while player fire still
strikes enemies — the two never cross streams, and `updateProjectiles` shares
one wall-stop path. The Brood Warrens now fields all three from a Brood Node, a
Husk Mound, and a Spitter Nest; the e2e bot still clears it. Renderer tints
hostile bile bolts sickly-green and plays a distinct spit SFX; the family×tier
art grammar (#7) drew every new silhouette with zero new texture code. Covered
in `tests/sim/enemies.test.ts`.

#21 landed: hero select is now a real roster with data-authored recruitment.
`HeroDef` gains an optional `unlock: { missionsCompleted?, goldCost? }`, so the
gate for every hero is content data — the screen already iterated
`CONTENT.heroes` for the card, cycling, stats and ability demo (issue #9
groundwork), and now reads its lock state from the profile with zero per-hero
code. Two gates compose: a mission gate reveals a hero after N clears, and a
one-time gold purchase (spent from the meta bank, persisted in
`Profile.unlockedHeroes`) recruits it — pressed with **B** on the card. The
Vanguard keeps no `unlock` and stays first, so the e2e Enter-default still
starts a Vanguard mission. The chosen `heroId` already flowed into the mission;
the Results screen now carries it too, so **R** replays the same hero and **H**
returns to hero select on that hero. Unlock evaluation and purchase live in
`src/meta/save.ts` (`heroLockState`/`isHeroUnlocked`/`buyHeroUnlock`) and are
covered in `tests/meta.test.ts`, including the always-available Vanguard
invariant.

#22 landed: data-driven weapon tiers per hero. A new `WeaponDef { id, name,
heroId, tier: 1|2|3, cost, attackOverrides }` in `src/content/weapons.ts`
(registered in `ContentDb.weapons`) gives each hero a three-tier track: tier 1
is the built-in kit (cost 0, no overrides), tiers 2–3 are shop-purchasable and
override the attack numbers that fit the class fantasy (Vanguard *Warden's Edge*
→ wider arc, *Sunreaver Maul* → +damage +knockback; Arcanist/Ranger get pierce
and speed; Sentinel gets broader sweeps). Ownership and the equipped tier
persist per-hero in `Profile.weapons`; purchases are hero-gated by construction
and respect the bank (`buyWeapon`/`equipWeapon` in `src/meta/save.ts`). The
equipped weapon enters the sim **only at `createSim` time** as a resolved
`AttackDef` on `SimPlayerConfig.attack` — exactly like stat modifiers, so the
sim never reads the profile; a new `playerAttack()` resolver folds it into the
basic swing/bolt and the Ranger's Volley Step darts. The Results shop buys the
next tier (**3**) and swaps the equipped weapon (**4**); the hero-select card
shows the equipped weapon and drives its POWER bar off the resolved attack.
Covered in `tests/sim/weapons.test.ts` (same-seed outcome shift + per-config
determinism), plus weapon-validity checks in `tests/content.test.ts` and
ownership/purchase/resolution in `tests/meta.test.ts`.

## Next recommended task

Realm 2 "The Resin Galleries" (#24, needs #17's keys/gates) once PR #34 lands,
or the Broodmother boss (#25) — its ranged hazards reuse the Spitter's
hostile-projectile plumbing. #24/#25/#27/#28 remain open for parallel pickup.
