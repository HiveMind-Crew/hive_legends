# Hero attacks and abilities

The reference for what every playable character does in a fight, why the
numbers are what they are, and which relationships between them must not be
broken by accident.

**Humans:** read the archetype sections for intent, then the generated tables
for the current numbers. **Agents:** the tables below are generated — never
hand-edit them. Every rule stated in prose here that can be machine-checked is
checked in `tests/combat.test.ts`; if you change a hero's numbers and that
suite fails, you have crossed an archetype line, not merely a tuning line.

## Where the data lives

| Layer | File | Owns |
| --- | --- | --- |
| Base kit | `src/content/heroes.ts` | Each hero's `attack` and `ability` |
| Weapon tiers | `src/content/weapons.ts` | `attackOverrides` merged over the base attack |
| Shared dials | `src/content/combat.ts` | Hitstun, i-frames, knockback decay |
| Shapes | `src/sim/types.ts` | `MeleeAttackDef`, `ProjectileAttackDef`, the three ability kinds |
| Resolution | `src/meta/save.ts` → `src/sim/sim.ts` | Equipped weapon baked in at `createSim`, read back by `playerAttack()` |
| Scaling | `src/sim/sim.ts` (`heroDamage`) | `(base + upgrade + level) × frenzy` |
| Presentation | `MissionScene`, `audio.ts`, `HeroSelectScene` | Per-`kind` switches, one branch per ability kind |

Meta-progression reaches the sim **only** at `createSim`, via
`SimPlayerConfig.attack` / `modifiers` / `startXp`. Nothing in `src/sim` reads
the profile. Adding a stat that changes mid-run means changing `SimState`, not
reaching sideways into `src/meta`.

## The combat model, stated once

These are the rules every hero is tuned against. None of them are written down
anywhere else, and several are non-obvious enough that tuning without knowing
them produces surprises.

**There is no armour or damage reduction.** `damageEnemy` subtracts raw
damage. A hero that hits twice as hard half as often is *exactly* as effective
as its opposite — per-hit size buys nothing on its own. Anything that should
reward big single hits (an armour system, an execute threshold) does not exist
yet, so "heavy hitter" is currently a *feel*, not an advantage.

**Cadence buys crowd control, not damage.** The two things fire rate does buy
are hitstun uptime and knockback rate, both of which accrue per hit rather than
per point of damage. Faster attacks are therefore strictly better at pinning
things down, and slower attacks need to earn their keep elsewhere.

**Hitstun is the sharpest edge in the system.** Every landed hit freezes an
enemy for `combat.enemyHitstunTicks`; the hitstun branch in `updateEnemies`
returns before steering, before attacking, and before the windup countdown, so
a stunned enemy cannot even finish a telegraph it already committed to. An
attack whose cooldown is **at or below** the hitstun window refreshes the stun
before it lapses and removes that target from the fight permanently. The
generated table flags any such cadence with ⚠️.

**The frontal arc is melee's counterplay.** A melee swing only hits what lies
within `arcDeg` of the hero's facing, which is what makes positioning matter
and what makes being surrounded a real threat. At 180° the cone becomes a half
plane and "get behind them" stops existing, so 180° is the hard ceiling.

**Player i-frames bound incoming damage, not outgoing.** A player is immune for
`combat.playerHitInvulnTicks` after any hit, which caps how fast a crowd can
burn them down and is why enemy `touchDamage` can be as high as it is.

**The swarm threshold is the unit of felt power.** The roster's cheapest enemy
(currently the 40 hp Skitterling) is the yardstick for every burst: a button
that kills one clears a clutch and feels like a spell; a button that leaves it
at 15 hp feels like a nudge, no matter what the damage number says. A burst
should either clear that threshold or apply real control. Both is a luxury,
neither is a bug.

## Archetypes

Four heroes, and the roster only works if each owns an axis outright.

### Vanguard — Korrin Vale

*Aggressive frontliner.* Highest sustained melee damage, mid HP, mid speed, and
a self-centred blast that clears the swarm threshold outright — press it and a
clutch of skitterlings dies. The intended trade is **damage for durability**:
the Vanguard wins fights the Sentinel merely survives.

Known gap: nothing in the kit expresses "shield-breaker" from the description —
there is no armour strip, no structure bonus, no penetration. The fantasy is
currently carried entirely by flavour text.

### Arcanist — Veyra Solmerin

*Artillery controller.* The squishiest hero, trading survivability for range
and for **Resin Cage**, the roster's only hard control — a placed blast that
near-roots everything it catches for two seconds.

Known gap: the basic bolt is tuned like a slightly worse arrow rather than a
spell, which is what makes this hero currently dominated (see Tracked issues).
The intent is a heavy, deliberate cadence whose damage arrives in lumps; the
current numbers are a fast trickle.

### Ranger — Tamsin Vael

*Skirmisher.* Fastest hero, longest reach, highest sustained DPS, thinnest
margin for error — the Ranger's defence is never being where the swarm is. Its
pierce turns a corridor of enemies into a single target, which is the reward
for lining a shot up.

Known gap: the cadence is fast enough to stunlock (see Tracked issues), which
hands a mobility hero a control tool it was never meant to have.

### Sentinel — Odo Brakk

*Anchor.* Highest HP, slowest, lowest damage at every tier, widest sweep, and
the only defensive ability — **Bastion Wall** soaks three quarters of incoming
damage and shoves back whatever it blocks. The trade is **space for tempo**:
the Sentinel holds a doorway the others must dance around.

Known gap: the Sentinel and Vanguard currently score near-identically on crowd
throughput, and both weapon tracks end at wide-arc high-knockback mauls, so the
two melee heroes converge rather than diverge as they upgrade.

## Weapon tracks

Each hero has three tiers. Tier 1 is the built-in kit (free, no overrides);
tiers 2–3 are bought with banked gold and override only numbers that fit the
class fantasy — never the attack `kind`, which is fixed by the hero.

A tier must be an unambiguous upgrade on **effective** power. Individual stats
may regress if the package still improves (the Ranger's T3 fires slightly
slower than its T2 but hits hard enough to net out ahead), but total DPS and
cost both increase monotonically, and `tests/combat.test.ts` enforces it.

## Invariants

Machine-checked in `tests/combat.test.ts`. Each one exists because breaking it
silently would change what a hero *is*, not just how strong it is.

| Invariant | Why |
| --- | --- |
| DPS and cost rise strictly with tier | An upgrade that is a downgrade is a bug, not a trade |
| `0 < arcDeg ≤ 180` | Beyond 180° a melee swing is omnidirectional and positioning stops mattering |
| Sentinel has the highest HP and the lowest DPS at every tier | The anchor must not out-damage the damage dealers |
| Ranger is the fastest hero | The skirmisher must not be outrun |
| Melee reach stays far below ranged reach | The melee/ranged distinction must stay legible |
| Every blast either clears the swarm threshold or applies control | A burst that does neither has no felt moment |
| Guard uptime stays below 100% | A permanently held stance is not a cooldown |
| No hero loses to another of the same attack kind on every core axis | Every hero must own an axis. Core axes are HP, speed, reach, DPS and multi-target; knockback is excluded, since a peel tool does not compensate for being worse at everything else |
| No cadence sits at or below the hitstun window | Stunlock is not a hero feature |

The last two currently have **tracked exceptions**, pinned as explicit sets in
the test. The tests pass today and fail the moment a *new* violation appears;
closing the existing ones is Phase 2 work below.

## Tracked issues

Found in the 2026-07 attack review. All four are content-data problems, not
engine problems.

1. **The Arcanist is strictly dominated by the Ranger** — worse HP, speed,
   range, DPS and pierce. Its only mechanical edges are knockback rate and
   Resin Cage. Planned fix: recast the bolt as artillery (bigger, slower) so
   the two ranged heroes stop competing on the same axis.
2. **Resin Cage does not clear the swarm threshold** — 25 damage against 40 hp
   leaves every skitterling alive, and contributes roughly 7% of the Arcanist's
   damage over its cooldown. Planned fix: raise it above the threshold so the
   cast is the hero's felt moment.
3. **The Ranger stunlocks at every tier** — cadence of 9/7/8 ticks against a
   10-tick hitstun window. Planned fix: raise cadence above the window.
4. **The two melee heroes converge** — near-identical crowd throughput, and
   both tracks end in wide-arc mauls. Planned fix: narrow the Vanguard toward a
   focused strike and leave the wide sweep to the Sentinel.

## Changing an attack or ability

**Tuning numbers** (the common case): edit `src/content/heroes.ts` or
`src/content/weapons.ts`, run `npm run docs:combat`, and review the regenerated
tables — the diff is the balance review. Then `npm test`.

**Adding a weapon tier:** add to `src/content/weapons.ts` with the id form
`<heroId>-t<tier>`. Overrides may only touch fields of the hero's own attack
kind.

**Adding a hero:** add to `src/content/heroes.ts` (roster order matters — the
first entry is the default and the e2e Enter-flow depends on it staying the
Vanguard) and give it a tier-1 weapon. Hero art keys follow `hero-<id>-<dir>-<pose>`;
see `docs/ART.md`.

**Adding an ability *kind*** is the expensive one — it is a closed union with a
branch in each of: `AbilityDef` in `src/sim/types.ts`, `performAbility` in
`src/sim/sim.ts`, a `SimEvent` variant, the event switch in `MissionScene`, the
event switch in `audio.ts`, and `abilityControl` in `HeroSelectScene`. Miss one
and the ability works but is silent or invisible.

**A second ability slot does not exist.** `HeroDef` holds one `ability`,
`InputCommand` holds one `ability` bool, and the HUD draws one meter. Adding a
second spell means touching all three plus `src/game/input.ts`.

## Current numbers

<!-- BEGIN GENERATED: combat-tables -->

<!-- Do not edit by hand. Regenerate with `npm run docs:combat`. -->

### Roster at a glance

| Hero | Role | HP | Speed | Attack | Reach | Ability | Recruit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Korrin Vale | Vanguard | 120 | 190 | melee | 52 px arc | Sunder Slam | starter |
| Veyra Solmerin | Arcanist | 80 | 170 | projectile | 320 px bolt | Resin Cage | 120g |
| Tamsin Vael | Ranger | 90 | 230 | projectile | 380 px bolt | Volley Step | 1 clear + 160g |
| Odo Brakk | Sentinel | 170 | 150 | melee | 56 px arc | Bastion Wall | 2 clears + 220g |

### Attacks by weapon tier

Cadence is in ticks at 60 Hz; DPS is `damage × 60 / cooldownTicks`, before
upgrades, hero level and the frenzy relic — all of which scale damage only, never cadence.

| Hero | Tier | Weapon | Cost | Dmg | Cadence | DPS | Shape | Knockback |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Vanguard | T1 | Wardpike | — | 25 | 22t | 68.2 | 110° / 52 px | 260 |
| Vanguard | T2 | Warden's Edge | 90g | 31 | 22t | 84.5 | 150° / 52 px | 260 |
| Vanguard | T3 | Sunreaver Maul | 220g | 40 | 22t | 109.1 | 150° / 52 px | 360 |
| Arcanist | T1 | Hexbolt Focus | — | 18 | 16t | 67.5 | pierce 1 / 320 px @ 380 px/s | 120 |
| Arcanist | T2 | Hexbore Wand | 100g | 22 | 16t | 82.5 | pierce 2 / 320 px @ 380 px/s | 120 |
| Arcanist | T3 | Amberlance | 240g | 28 | 16t | 105.0 | pierce 3 / 320 px @ 460 px/s | 120 |
| Ranger | T1 | Thornbow | — | 12 | 9t | 80.0 | pierce 2 / 380 px @ 520 px/s | 40 |
| Ranger | T2 | Thornscar Bow | 100g | 15 | 7t | 128.6 | pierce 2 / 380 px @ 520 px/s | 40 |
| Ranger | T3 | Galewind Longbow | 240g | 18 | 8t | 135.0 | pierce 4 / 380 px @ 520 px/s | 40 |
| Sentinel | T1 | Warmaul | — | 20 | 28t | 42.9 | 150° / 56 px | 380 |
| Sentinel | T2 | Bulwark Cleaver | 110g | 26 | 28t | 55.7 | 180° / 56 px | 380 |
| Sentinel | T3 | Graven Maul | 260g | 34 | 28t | 72.9 | 180° / 56 px | 480 |

### Throughput and lockdown

Crowd score weighs sustained DPS by what a single use can reach: pierce count for bolts,
swept area (per 1000 px²) for arcs. It compares shapes coarsely — treat it as a smell test,
not a balance target.

Lockdown uptime is `10 hitstun ticks / cadence`: the share of the time one target
stays frozen under sustained fire. A ⚠️ marks a cadence at or below the hitstun window,
which re-stuns before the previous stun lapses and locks that target out permanently.

| Hero | Tier | Single-target DPS | Targets/use | Swept area | Crowd score | Lockdown uptime |
| --- | --- | --- | --- | --- | --- | --- |
| Vanguard | T1 | 68.2 | arc | 2596 px² | 177.0 | 45% |
| Vanguard | T2 | 84.5 | arc | 3540 px² | 299.3 | 45% |
| Vanguard | T3 | 109.1 | arc | 3540 px² | 386.1 | 45% |
| Arcanist | T1 | 67.5 | 2 | — | 135.0 | 63% |
| Arcanist | T2 | 82.5 | 3 | — | 247.5 | 63% |
| Arcanist | T3 | 105.0 | 4 | — | 420.0 | 63% |
| Ranger | T1 | 80.0 | 3 | — | 240.0 | 100% ⚠️ |
| Ranger | T2 | 128.6 | 3 | — | 385.7 | 100% ⚠️ |
| Ranger | T3 | 135.0 | 5 | — | 675.0 | 100% ⚠️ |
| Sentinel | T1 | 42.9 | arc | 4105 px² | 175.9 | 36% |
| Sentinel | T2 | 55.7 | arc | 4926 px² | 274.4 | 36% |
| Sentinel | T3 | 72.9 | arc | 4926 px² | 358.9 | 36% |

### Abilities

| Hero | Ability | Kind | Cooldown | Damage | Shape | Effect |
| --- | --- | --- | --- | --- | --- | --- |
| Vanguard | Sunder Slam | blast | 5.00 s | 40 | r110 (self) | 440 knockback |
| Arcanist | Resin Cage | blast | 5.00 s | 25 | r90 @ +140 px ahead | 2.00 s slow ×0.1 |
| Ranger | Volley Step | dash-volley | 4.00 s | basic attack ×5 | 120 px dash, 70° rear fan | reposition |
| Sentinel | Bastion Wall | guard | 6.00 s | — | 2.50 s stance | ×0.25 damage taken, ×0.5 speed, 200 reflect |

### Burst vs the swarm threshold

Whether one press of a burst actually clears the roster’s cheapest enemy, or only wounds it.
A burst that does neither that nor control is a button with no felt moment.

| Source | Burst | Damage | Skitterling hp | Result | Control |
| --- | --- | --- | --- | --- | --- |
| Vanguard | Sunder Slam | 40 | 40 | clears | no |
| Arcanist | Resin Cage | 25 | 40 | leaves 15 hp | yes (2.00 s) |
| Consumable | Hive-Fire Draught | 60 | 40 | clears | no |

### Seconds to kill (single target, base kit, level 1, no upgrades)

| Hero | Tier | Skitterling (40 hp) | Carapace Husk (140 hp) | Bile Spitter (46 hp) | Gravebound Ravager (320 hp) |
| --- | --- | --- | --- | --- | --- |
| Vanguard | T1 | 0.59 | 2.05 | 0.67 | 4.69 |
| Vanguard | T2 | 0.47 | 1.66 | 0.54 | 3.78 |
| Vanguard | T3 | 0.37 | 1.28 | 0.42 | 2.93 |
| Arcanist | T1 | 0.59 | 2.07 | 0.68 | 4.74 |
| Arcanist | T2 | 0.48 | 1.70 | 0.56 | 3.88 |
| Arcanist | T3 | 0.38 | 1.33 | 0.44 | 3.05 |
| Ranger | T1 | 0.50 | 1.75 | 0.57 | 4.00 |
| Ranger | T2 | 0.31 | 1.09 | 0.36 | 2.49 |
| Ranger | T3 | 0.30 | 1.04 | 0.34 | 2.37 |
| Sentinel | T1 | 0.93 | 3.27 | 1.07 | 7.47 |
| Sentinel | T2 | 0.72 | 2.51 | 0.83 | 5.74 |
| Sentinel | T3 | 0.55 | 1.92 | 0.63 | 4.39 |

<!-- END GENERATED: combat-tables -->
