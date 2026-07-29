# Project status

Updated: 2026-07-24 — **the M1 vertical slice is content-complete** (boss #25,
XP levelling #46, combat-feel pass #38/#39/#40, screen-clear potion #41, and
the first real art pack #44 all landed).

## Milestones

- **M0 — Foundations: COMPLETE.** Toolchain, CI, deterministic sim core
  (ADR 0002), data-driven content, docs.
- **M1 — Vertical slice: CONTENT-COMPLETE.** Every checklist item below is
  landed. What remains under the M1 umbrella is the original-art track
  (#27 characters, #28 environment/UI), which can proceed in parallel.
- M2 — Systems depth (progression trees, deeper economy): not started; board
  in #29. Note the full four-hero roster and realms 2–3, once slated here and
  for M4, landed early during M1.
- M3 — Co-op (local first, then online lockstep): not started. The
  deterministic sim (ADR 0002) and the four-slot HUD are the groundwork;
  generator pressure and objective XP already have per-player hooks noted in
  the code.
- M4 — Content expansion (further realms, hazards, economy): not started.
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

Rest of the slice (this list had drifted badly out of date — audited against
the code on 2026-07-24 and corrected; everything below is now landed):

- [x] Second playable hero — in fact all four: Arcanist (#18), Ranger (#19),
      Sentinel (#20), with roster/unlock rules in hero select (#21).
- [x] Two more standard enemy types + one elite — Carapace Husk and Bile
      Spitter (#23), plus the elite Gravebound Ravager, which now actually
      spawns from a destroyed Husk Mound (#40).
- [x] Key-controlled gate and a hidden treasure area — keys, gates and
      breakable secret walls (#17), authored into both early realms.
- [x] Temporary power-up — Emberheart / Windstep Sigil / Aegis Bloom (#16),
      plus the carried screen-clear potion and the "hive rouses" time-pressure
      ramp, both from #41.
- [x] Boss encounter — Mireveil, Mother of the Brood, in realm 3 "The Hollow
      Throne" (#25): data-driven three-phase script (Brood Call → Lunge →
      spat globs), a >= 1 s telegraph before every damaging action, a HUD
      finale bar, and a multi-stage death spectacle. The exit stays sealed
      while she lives.
- [x] Hub polish (hero select → mission select flow) — attract-mode title and
      hero cards (#9), plus the mission-select panel and unlock gating (#24).
- [x] Audio (original SFX/music) — synthesized SFX, a procedural combat loop,
      and the Herald announcer (#8).
- [x] XP/level progression in addition to gold upgrades — XP from kills and
      objectives levels the hero *mid-run* (#46), granting max HP (healing the
      gain) and damage, announced by the Herald. Banked to the profile, so the
      next mission starts at that level. Stacks with the bought gold upgrades.

**With this, the M1 vertical slice is content-complete.** Remaining tracked
work is the original-art track (#27, #28) and the M2 board (#29).

## Verification state

`lint`, `typecheck`, **166 unit tests across 17 files**, the production build,
and the Playwright gameplay playthrough (bot clears The Brood Warrens, banks
gold and XP, buys an upgrade, and replays with both the upgrade and the earned
level applied; screenshots in `test-results/`) all pass. Run the whole gate
with the one-liner in `CLAUDE.md`; layer-by-layer detail is in
`docs/TESTING.md`.

One transient e2e failure was observed once early in development and has not
reproduced since — watch CI for recurrence.

## Look & feel track (complete)

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
  ~~Caveat: an enemy's *first* contact hit lands without a telegraph because
  the sim has no windup state.~~ **Resolved in #39** — the sim now owns a real
  `windupTicksLeft` telegraph, so first contact is foreshadowed like every
  other attack and the renderer reads the pose from sim state.
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
  persistent ground ring. Content-validity unit test added. (All three
  silhouettes are now in use: Carapace Husk, Bile Spitter and the elite
  Gravebound Ravager — added as pure content data, exactly as intended.)
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
pressure near the second node. Data-side tune: Skitterling `attack.damage`
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
  temporary power-ups (#16 — DONE), keys/gates/secret walls (#17 — DONE).
  **Phase 1 is complete.**
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
new sim mechanic: `ProjectileState` gained a `hostile` flag, so enemy fire
flies as deterministic sim bolts that strike players (respecting i-frames and
Bastion Wall) while player fire still strikes enemies — the two never cross
streams, and `updateProjectiles` shares one wall-stop path. `EnemyDef.attack`
now holds the complete discriminated `contact` / `line` / `bolt` / `volley`
vocabulary, including shape, damage, commit range, windup, and recovery; there
are no optional attack side channels or implied defaults. The Brood Warrens
fields all three families from a Brood Node, a Husk Mound, and a Spitter Nest;
the e2e bot still clears it. Renderer tints hostile bile bolts sickly-green and
plays a distinct spit SFX; the family×tier art grammar (#7) drew every new
silhouette with zero new texture code. Covered in
`tests/sim/enemies.test.ts`.

The Skitter and Husk follow-up gives those silhouettes distinct attack reads.
Skitter compresses for 18 ticks, locks a 72×20 px lane, then pounces through it
for 7 damage; the body stops at walls and lateral movement beats the committed
direction. The Carapace Husk's slow overhead bash adds 28 px of wall-clipped
knockback, while the Gravebound Ravager commits to a 120×28 px rupture lane for
its 30-tick windup, then deals 24 damage and pushes every player caught in the
line 36 px. Original tiered walk and windup art ships for both families; the
renderer supplies shape-specific lane tells and release effects.

The Spitter follow-up replaces its single aimed glob with a three-shot 32° bile
fan after a 20-tick swollen-sac tell. A dedicated `volley` attack branch reuses
the hostile-projectile plumbing, emits one presentation event for the whole
fan, and adds a luminous release flare plus a wet pressure-burst sound. Nine
original common/veteran/elite walk and windup sprites now complete the enemy
family art set.

Mireveil now completes the original character-art track in #27. Her three
96×96 south-facing states preserve one crowned brood-queen silhouette while
progressing from sealed violet shell, through broad luminous fissures, to a
critical abdomen peeled open around a violet-white brood core. The renderer
continues to own rotation, action tint, telegraph swelling, shadows, and charge
trails. A deterministic 48×48 logical source grid regenerates all three PNGs,
with tests pinning size, distinct states, identical silhouettes, and increasing
exposed light.

#16 landed: temporary power-ups — floor relics that grant a short, stacking
timed buff. Three ship: **Emberheart** (frenzy, +damage), **Windstep Sigil**
(swiftness, +move speed), and **Aegis Bloom** (ward, −damage taken). Buff
magnitudes are data (`src/content/powerups.ts`); each def carries all three
multipliers (unused ones at 1) so the sim multiplies uniformly with no per-kind
branching. `PlayerState.power` holds per-buff tick timers that decrement each
tick; the pickup model gained a `'powerup'` kind so relics flow through the
existing collection path (grabbing one refreshes its full duration). The
renderer draws a spinning gem per buff, a colored player aura while active, and
a Herald call-out on pickup; audio adds a rising chime. Buffs stack with the
Sentinel's guard multiplicatively. Covered in `tests/sim/powerups.test.ts`; the
Brood Warrens seeds one relic of each.

#17 landed: the level-mechanics toolkit — **keys**, **key-locked gates**, and
breakable **secret walls** — completing Phase 1. Movement collision now consults
a sim-side blocked-tile overlay (`Blockage`) on top of the static wall grid, so
opening a gate or crumbling a secret makes its tile passable with zero level-data
mutation; the overlay rides the hot path as a tiny tile-index array (no Sets, so
`hashState` stays stable). A `key` pickup kind fills `PlayerState.keys`; standing
against a locked gate with a key in hand spends it and opens the gate
permanently (`gate-opened`). Secret walls are damageable entities on floor tiles
that render as ordinary wall tops until melee/ability/bolt damage crumbles them
into a passage (`secret-revealed`); enemy fire leaves them be, and gates stop
bolts. The Brood Warrens gains two optional NW-corner vaults — one behind a
secret wall, one behind a key gate — authored off the critical path so the e2e
bot is unaffected. HUD shows a key tally; audio adds a key chime, gate clank, and
crumble rumble. Covered in `tests/sim/levelMechanics.test.ts`.

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

#24 landed: Realm 2 — **The Resin Galleries**, the second authored mission and
the start of realm progression. A larger (40×28) winding gallery in warm amber
resin, versus the Warrens' violet: three spawners (two Brood Nodes + a Husk
Mound), heavier prop/decor density, and two optional south vaults — one behind a
key-locked gate, one behind a breakable secret wall (#17) — each machine-verified
sealed so its treasure is reachable only through the mechanic. Realms reskin via
a new data-only `LevelDef.theme` (wall/floor/accent tints over the shared
textures — no new art). A content registry (`LEVELS` + `MISSION_ORDER` in
`src/content`) drives a hero-select **mission panel** (↑↓ to pick, first entry
stays The Brood Warrens so the e2e Enter-default is untouched), gated by
`Profile.clearedLevels` (`isLevelUnlocked`/`markLevelCleared`/`nextLevelId` in
`src/meta/save.ts`); the Results screen offers **N — next realm** on victory and
`levelId` threads hero-select → mission → results → replay. Covered by
reachability + vault-seal checks in `tests/sim/level.test.ts`, a determinism +
scripted-completion pass in `tests/sim/resinGalleries.test.ts`, and progression
gating in `tests/meta.test.ts`.

Hero attack documentation landed: `docs/COMBAT.md` is now the reference for
what each hero's attack and ability are *for*, the shared combat rules they are
tuned against, and the archetype each hero owns. Its number tables (roster,
weapon tiers, throughput, lockdown, abilities, TTK) are generated from
`src/content` by `scripts/combatTables.ts` via `npm run docs:combat`, and
`tests/combatDoc.test.ts` fails the suite when the checked-in doc drifts — so a
balance change always lands with its table diff attached. Archetype invariants
(tier monotonicity, arc ceiling, the Sentinel/Ranger axis claims, burst-vs-swarm
threshold, guard downtime, domination, cadence-vs-hitstun) are pinned in
`tests/combat.test.ts`. The shared dials that attacks are tuned against —
player i-frames, enemy hitstun, knockback decay — moved out of `src/sim/sim.ts`
into `src/content/combat.ts` (`ContentDb.combat`), per the "gameplay numbers are
data" rule.

The review behind it found four content-data problems, documented as tracked
exceptions in `docs/COMBAT.md` and pinned as explicit sets in the tests (both
sets may only shrink):

1. The Arcanist is beaten by the Ranger on every core axis (HP, speed, range,
   DPS, pierce); its only edges are knockback rate and Resin Cage.
2. Resin Cage (25 dmg) does not kill a Skitterling (40 hp), so the Arcanist's
   one spell has no felt moment — it contributes ~7% of the hero's damage.
3. The Ranger stunlocks at every tier: cadence 9/7/8 ticks against a 10-tick
   hitstun window, which permanently removes a target from the fight.
4. The two melee heroes converge — Vanguard and Sentinel crowd scores differ by
   under 1% at T1, and both tracks end at wide-arc high-knockback mauls.

Phase 2 closed all four. The Arcanist became artillery (bolt 18 → 28 damage at
16 → 26 ticks, reach 320 → 420 so she now outranges the Ranger) with Resin Cage
raised to 45 damage / radius 100, above the 40 hp swarm threshold. The Ranger's
cadence moved to 12/11/11, clear of the 10-tick hitstun window, with damage
raised to hold its DPS roughly in place. The Vanguard became a pike — arc 110°
→ 70°, reach 52 → 68, damage 25 → 28, T3 renamed *Sunreaver Pike* — and the
Sentinel took the wide sweep outright (reach 56 → 64, T3 arc 180° → 175°). The
Sentinel now out-crowds the Vanguard at every tier while the Vanguard
out-damages him ~65%. Both tracked-exception sets in `tests/combat.test.ts` are
empty, so all nine archetype invariants hold unconditionally.

Cost worth watching: narrowing the Vanguard slowed the e2e bot's reference
Warrens clear from 1074 ticks (17.9 s) to 1574 (26.2 s). That is inside the
20–35 s band `src/content/pressure.ts` documents and inside the 40 s rouse
grace — the old time was *below* the band — and the bot swings blindly while
charging, so it is a pessimistic bound. Re-check against real play before
widening the arc; the Sentinel's crowd lead is only ~6% at T3, so his reach
would have to grow with it or the two heroes converge again.

The mission wheel landed (#59). Mission selection moved off the hero-select
list panel onto a spoke-and-wheel hub: a spoke is three sequential missions
capped by a boss, the boss opens when all three are cleared, and the next spoke
opens when that boss falls. The first spoke — **The Azure Reach** — is The
Brood Warrens, The Resin Galleries, the new **Cobalt Combs** (#55), and
Mireveil at The Hollow Throne, with two announced-but-unauthored realms drawn
as teaser arms.

The shape of the wheel is data (`SpokeDef`/`TeaserSpokeDef` in
`src/content/spokes.ts`), the rules live in `src/meta/save.ts`
(`nodeLockState` and friends), and `MissionHubScene` only draws. Crucially
nothing is stored per spoke — every rule derives from `Profile.clearedLevels`,
so adding a realm is a pure content change and existing saves carried over with
no migration. Flow is now hero select → wheel → mission → results, with results
returning through the wheel so a freshly unlocked node is seen to open.
`docs/PROGRESSION.md` is the reference, including a walkthrough for adding a
realm and the invariants that guard it.

## Next recommended task

M1 is content-complete, and the highest-value work is **presentation
and polish rather than systems**:

1. **Original environment, object, and UI art — #28.** The character track is
   complete, and the Realm 1 floor/wall tiles, Brood Node damage states,
   breakable props, decor, pickups, gate, and portal now ship as original art.
   The next high-value slice is the HUD/icon and title-logo treatment. Key list
   and canvas sizes: `docs/ART.md`.
Balance note carried from #25: ranged heroes kite Mireveil noticeably more
easily than melee (~15–17s vs ~32s to kill). Worth a tuning pass once there is
real playtest data, rather than speculative numbers now.
