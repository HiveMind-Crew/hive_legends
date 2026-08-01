# Attacks: heroes, enemies, and the boss

The reference for what everything in a fight does, why the numbers are what
they are, and which relationships between them must not be broken by accident.
**This is the source of truth for every attack in the game** — if an attack is
not described here, this document is the thing that is wrong.

**Humans:** read the archetype sections for intent, then the generated tables
for the current numbers. **Agents:** the tables below are generated — never
hand-edit them. Every rule stated in prose here that can be machine-checked is
checked in `tests/combat.test.ts`; if you change a number and that suite fails,
you have crossed an archetype line, not merely a tuning line.

There are two generated regions: the hero tables under
[Current numbers](#current-numbers) and the enemies and boss under
[The bestiary](#the-bestiary). One `npm run docs:combat` regenerates both.

## Where the data lives

| Layer | File | Owns |
| --- | --- | --- |
| Base kit | `src/content/heroes.ts` | Each hero's `attack` and `ability` |
| Weapon tiers | `src/content/weapons.ts` | `attackOverrides` merged over the base attack |
| Enemies | `src/content/enemies.ts` | Every enemy's attack shape and numbers, plus the spawners |
| Boss | `src/content/bosses.ts` | Phase thresholds, action cycles, and each action's payload |
| Shared dials | `src/content/combat.ts` | Hitstun, i-frames, knockback decay |
| Shapes | `src/sim/types.ts` | Hero attack/ability unions, `EnemyAttackDef`, `BossActionDef`, and actor definitions |
| Resolution | `src/meta/save.ts` → `src/sim/sim.ts` | Equipped weapon baked in at `createSim`, read back by `playerAttack()` |
| Enemy resolution | `src/sim/sim.ts` (`updateEnemies`, `executeEnemyAttack`) | Shared windup/recovery and one release branch per `attack.kind` |
| Boss resolution | `src/sim/sim.ts` (`updateBoss`, `executeBossAction`) | Phase pick, telegraph, and reusable summon/charge/volley primitives |
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
burn them down and is why enemy `attack.damage` can be as high as it is.

**The swarm threshold is the unit of felt power.** The roster's cheapest enemy
(currently the 40 hp Skitterling) is the yardstick for every burst: a button
that kills one clears a clutch and feels like a spell; a button that leaves it
on a sliver feels like a nudge, no matter what the damage number says — which
is exactly the trap Resin Cage fell into at 25 damage. A burst should either
clear that threshold or apply real control. Both is a luxury, neither is a bug.

**Husks own enemy-side space control.** The Carapace Husk's deliberate
single-target overhead bash pushes its victim away. The elite Gravebound
Ravager commits its facing for 0.5 seconds, then tears a 120×28 px line through
the ground. The rupture stops at walls, can hit multiple players, and is
avoided by sidestepping rather than retreating.

## Archetypes

Four heroes, and the roster only works if each owns an axis outright.

### Vanguard — Korrin Vale

*Aggressive frontliner, and a pike-fighter specifically.* The highest sustained
damage on the roster, delivered through the **narrowest arc** — the Wardpike
spears what it faces instead of scattering a crowd, and reaches further than
the Sentinel's maul to do it. Mid HP, mid speed, and a self-centred blast that
clears the swarm threshold outright.

The trade against the Sentinel is **focus for breadth**: the Vanguard kills
what is in front of him about one and a half times faster, and pays for it by
being flankable. His track deepens reach and weight; it never widens the arc.

### Arcanist — Veyra Solmerin

*Artillery controller.* The **longest reach on the roster**, the squishiest
body, and the slowest cadence — damage arrives in heavy, deliberate lumps
rather than a stream. Carries **Resin Cage**, the only hard control in the
game: a blast placed downrange that clears a clutch outright *and* near-roots
whatever survives for two seconds.

The trade against the Ranger is **weight and reach for sustain**: she opens
from further out and hits harder per bolt, and the Ranger out-damages her over
any sustained exchange. Her track buys bolt weight and penetration, never
cadence — the slow rhythm *is* the class.

### Ranger — Tamsin Vael

*Skirmisher.* Fastest hero, highest sustained DPS, thinnest margin for error —
the Ranger's defence is never being where the swarm is. Pierce turns a corridor
of enemies into a single target, which is the reward for lining a shot up.

Reach is deliberately *second* to the Arcanist's: the skirmisher closes to a
working distance and dances, where the artillery never wants to be approached
at all. Cadence stays clear of the hitstun window at every tier — see below.

### Sentinel — Odo Brakk

*Anchor.* Highest HP, slowest, lowest damage at every tier, and the **widest
sweep by a wide margin** — he out-clears the Vanguard on crowd throughput at
every tier while dealing far less damage per target. Carries the only defensive
ability: **Bastion Wall** soaks three quarters of incoming damage and shoves
back whatever it blocks.

The trade is **space for tempo**: the Sentinel holds a doorway the others must
dance around. His track widens the arc and adds knockback — the two things the
Vanguard's track deliberately does not.

## Weapon tracks

Each hero has three tiers. Tier 1 is the built-in kit (free, no overrides);
tiers 2–3 are bought with banked gold and override only numbers that fit the
class fantasy — never the attack `kind`, which is fixed by the hero.

A tier must be an unambiguous upgrade on **effective** power. Individual stats
may regress if the package still improves, but total DPS and cost both increase
monotonically, and `tests/combat.test.ts` enforces it.

Each track buys along its hero's own axis, and deliberately not along the
others': the Vanguard's buys reach and weight but never arc, the Sentinel's
buys arc and knockback, the Arcanist's buys bolt weight and pierce but never
cadence, and the Ranger's buys penetration while staying clear of the hitstun
window. A tier that reaches for a different hero's axis is how the roster
converged in the first place.

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

Both exception sets are now **empty**, so all nine hold unconditionally. Any
entry appearing in either set is a regression, not a trade.

### Differentiation

The nine above each protect one archetype. These protect the *relationships*
between them, which is where convergence actually happens — no single-hero rule
fails when two heroes drift toward each other, because neither has broken its
own. Same file, `describe('differentiation')`.

| Invariant | Why |
| --- | --- |
| The Sentinel out-crowds the Vanguard and the Vanguard out-damages him, at every tier | The melee split of #4 stated as a machine check. Crowd *score* is the load-bearing half — swept area stays green through the exact regression this catches |
| The Arcanist has the longest reach on the roster | The only thing separating the two ranged heroes: she out-ranges, he out-sustains |
| No two heroes share an attack profile | Two identical stat blocks are two heroes that play identically, whatever the art says |
| No hero is dominated by another **at the same tier** | The base-kit check is blind to weapon tracks; two heroes can start apart and converge by T3 |
| No two enemies attack the same way — different shape, or ≥2 of reach, cadence, windup, damage | A monster that is another monster with a different HP bar is not a new monster |
| Enemy threat rises with tier, on HP and DPS | Tier must mean something to a player who cannot read the data |
| Every enemy windup is at least 10 ticks | The telegraph is the whole counterplay; an attack that lands faster than a player reacts is noise, not difficulty |
| Every enemy family has at least one authored member | A family with art keys and no enemies is dead vocabulary |
| Every boss phase has a distinct action cycle | A phase that reuses the previous cycle is a difficulty slider, not a new phase |

The generated [Axis leaders](#axis-leaders) table is the companion to these: it
answers the question a test cannot, which is whether a hero leads anything at
all. **It currently reports the Vanguard leading none of the six core axes** —
second on four of them. That is a live design question, not a failing build.

## Resolved issues

The 2026-07 attack review found four content-data problems. All are closed; the
history is kept because the reasoning constrains future tuning.

1. **The Arcanist was beaten by the Ranger on every core axis** — worse HP,
   speed, range, DPS and pierce, with only knockback rate and Resin Cage in its
   favour. Closed by recasting the bolt as artillery: heavier per shot (18 →
   28), slower (16 → 26 ticks), and now the longest reach on the roster (320 →
   420, past the Ranger's 380). The two ranged heroes no longer compete on the
   same axis — she opens further out and hits harder, he out-sustains her.
2. **Resin Cage did not clear the swarm threshold** — 25 damage against a 40 hp
   Skitterling left every one alive, contributing ~7% of the hero's damage.
   Closed by raising it to 45 (and radius 90 → 100), so the cast clears a
   clutch *and* roots the survivors.
3. **The Ranger stunlocked at every tier** — cadence 9/7/8 against a 10-tick
   hitstun window. Closed by moving to 12/11/11, with damage raised to hold its
   DPS roughly in place (80.0 / 92.7 / 109.1).
4. **The two melee heroes converged** — near-identical crowd throughput and two
   tracks both ending in wide-arc mauls. Closed by making the Vanguard a pike:
   arc 110° → 70°, reach 52 → 68, damage 25 → 28, and a T3 renamed off "Maul"
   to *Sunreaver Pike*. The Sentinel took the wide sweep outright (reach 56 →
   64, T3 arc 180° → 175° so no shipped weapon sits on the degenerate
   boundary). The Sentinel now out-crowds the Vanguard at every tier while the
   Vanguard out-damages him by ~53%.

### Cost of the melee split

Narrowing the Vanguard is the one change here with a measurable gameplay cost.
The e2e bot's reference clear of The Brood Warrens went from **1074 ticks
(17.9 s) to 1574 (26.2 s)** — 47% slower. Two things make that acceptable
rather than alarming, but it is worth re-checking against real play:

- It lands inside the 20–35 s band `src/content/pressure.ts` already documents
  as a competent clear, and comfortably inside the 2400-tick (40 s) grace
  before the hive rouses. The old 17.9 s was *below* that band.
- The bot swings constantly while charging rather than aiming, so a narrow arc
  penalises it considerably more than it penalises a player who lines up a
  thrust. Treat 26.2 s as a pessimistic bound.

If real play says the pike is too punishing, widen the Vanguard's arc — but
note that the Sentinel's crowd lead is only ~6% at T3, so the Sentinel's reach
has to grow with it or the two heroes converge again.

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
| Korrin Vale | Vanguard | 120 | 190 | melee | 68 px arc | Sunder Slam | starter |
| Veyra Solmerin | Arcanist | 80 | 170 | projectile | 420 px bolt | Resin Cage | 120g |
| Tamsin Vael | Ranger | 90 | 230 | projectile | 380 px bolt | Volley Step | 1 clear + 160g |
| Odo Brakk | Sentinel | 170 | 150 | melee | 64 px arc | Bastion Wall | 2 clears + 220g |

### Attacks by weapon tier

Cadence is in ticks at 60 Hz; DPS is `damage × 60 / cooldownTicks`, before
upgrades, hero level and the frenzy relic — all of which scale damage only, never cadence.

| Hero | Tier | Weapon | Cost | Dmg | Cadence | DPS | Shape | Knockback |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Vanguard | T1 | Wardpike | — | 28 | 22t | 76.4 | 70° / 68 px | 220 |
| Vanguard | T2 | Warden's Reach | 90g | 35 | 22t | 95.5 | 70° / 72 px | 220 |
| Vanguard | T3 | Sunreaver Pike | 220g | 44 | 22t | 120.0 | 80° / 76 px | 260 |
| Arcanist | T1 | Hexbolt Focus | — | 28 | 26t | 64.6 | pierce 1 / 420 px @ 380 px/s | 120 |
| Arcanist | T2 | Hexbore Wand | 100g | 34 | 26t | 78.5 | pierce 2 / 420 px @ 380 px/s | 120 |
| Arcanist | T3 | Amberlance | 240g | 44 | 26t | 101.5 | pierce 3 / 420 px @ 460 px/s | 120 |
| Ranger | T1 | Thornbow | — | 16 | 12t | 80.0 | pierce 2 / 380 px @ 520 px/s | 40 |
| Ranger | T2 | Thornscar Bow | 100g | 17 | 11t | 92.7 | pierce 2 / 380 px @ 520 px/s | 40 |
| Ranger | T3 | Galewind Longbow | 240g | 20 | 11t | 109.1 | pierce 4 / 380 px @ 520 px/s | 40 |
| Sentinel | T1 | Warmaul | — | 20 | 24t | 50.0 | 150° / 64 px | 380 |
| Sentinel | T2 | Bulwark Cleaver | 110g | 26 | 24t | 65.0 | 170° / 64 px | 380 |
| Sentinel | T3 | Graven Maul | 260g | 34 | 24t | 85.0 | 175° / 68 px | 480 |

### Throughput and lockdown

Crowd score weighs sustained DPS by what a single use can reach: pierce count for bolts,
swept area (per 1000 px²) for arcs. It compares shapes coarsely — treat it as a smell test,
not a balance target.

Lockdown uptime is `10 hitstun ticks / cadence`: the share of the time one target
stays frozen under sustained fire. A ⚠️ marks a cadence at or below the hitstun window,
which re-stuns before the previous stun lapses and locks that target out permanently.

| Hero | Tier | Single-target DPS | Targets/use | Swept area | Crowd score | Lockdown uptime |
| --- | --- | --- | --- | --- | --- | --- |
| Vanguard | T1 | 76.4 | arc | 2825 px² | 215.7 | 45% |
| Vanguard | T2 | 95.5 | arc | 3167 px² | 302.3 | 45% |
| Vanguard | T3 | 120.0 | arc | 4032 px² | 483.9 | 45% |
| Arcanist | T1 | 64.6 | 2 | — | 129.2 | 38% |
| Arcanist | T2 | 78.5 | 3 | — | 235.4 | 38% |
| Arcanist | T3 | 101.5 | 4 | — | 406.2 | 38% |
| Ranger | T1 | 80.0 | 3 | — | 240.0 | 83% |
| Ranger | T2 | 92.7 | 3 | — | 278.2 | 91% |
| Ranger | T3 | 109.1 | 5 | — | 545.5 | 91% |
| Sentinel | T1 | 50.0 | arc | 5362 px² | 268.1 | 42% |
| Sentinel | T2 | 65.0 | arc | 6077 px² | 395.0 | 42% |
| Sentinel | T3 | 85.0 | arc | 7062 px² | 600.2 | 42% |

### Abilities

| Hero | Ability | Kind | Cooldown | Damage | Shape | Effect |
| --- | --- | --- | --- | --- | --- | --- |
| Vanguard | Sunder Slam | blast | 5.00 s | 40 | r110 (self) | 440 knockback |
| Arcanist | Resin Cage | blast | 5.00 s | 45 | r100 @ +140 px ahead | 2.00 s slow ×0.1 |
| Ranger | Volley Step | dash-volley | 4.00 s | basic attack ×5 | 120 px dash, 70° rear fan | reposition |
| Sentinel | Bastion Wall | guard | 6.00 s | — | 2.50 s stance | ×0.25 damage taken, ×0.5 speed, 200 reflect |

### Burst vs the swarm threshold

Whether one press of a burst actually clears the roster’s cheapest enemy, or only wounds it.
A burst that does neither that nor control is a button with no felt moment.

| Source | Burst | Damage | Skitterling hp | Result | Control |
| --- | --- | --- | --- | --- | --- |
| Vanguard | Sunder Slam | 40 | 40 | clears | no |
| Arcanist | Resin Cage | 45 | 40 | clears | yes (2.00 s) |
| Consumable | Hive-Fire Draught | 60 | 40 | clears | no |

### Seconds to kill (single target, base kit, level 1, no upgrades)

| Hero | Tier | Skitterling (40 hp) | Carapace Husk (140 hp) | Bile Spitter (46 hp) | Gravebound Ravager (320 hp) |
| --- | --- | --- | --- | --- | --- |
| Vanguard | T1 | 0.52 | 1.83 | 0.60 | 4.19 |
| Vanguard | T2 | 0.42 | 1.47 | 0.48 | 3.35 |
| Vanguard | T3 | 0.33 | 1.17 | 0.38 | 2.67 |
| Arcanist | T1 | 0.62 | 2.17 | 0.71 | 4.95 |
| Arcanist | T2 | 0.51 | 1.78 | 0.59 | 4.08 |
| Arcanist | T3 | 0.39 | 1.38 | 0.45 | 3.15 |
| Ranger | T1 | 0.50 | 1.75 | 0.57 | 4.00 |
| Ranger | T2 | 0.43 | 1.51 | 0.50 | 3.45 |
| Ranger | T3 | 0.37 | 1.28 | 0.42 | 2.93 |
| Sentinel | T1 | 0.80 | 2.80 | 0.92 | 6.40 |
| Sentinel | T2 | 0.62 | 2.15 | 0.71 | 4.92 |
| Sentinel | T3 | 0.47 | 1.65 | 0.54 | 3.76 |

### Axis leaders

Who is strictly best on each core axis, at base kit. A hero leading nothing is not a
failing test — it is a hero with no axis of its own, which is how two characters start
to feel like one. Ties are listed together, and a tie is its own warning.

| Axis | Leader | Value | Margin |
| --- | --- | --- | --- |
| Max HP | Sentinel | 170 | +50 over Vanguard |
| Move speed | Ranger | 230 | +40 over Vanguard |
| Reach | Arcanist | 420 px | +40 px over Ranger |
| Single-target DPS | Ranger | 80.0 | +3.6 over Vanguard |
| Crowd score | Sentinel | 268.1 | +28.1 over Ranger |
| Knockback | Sentinel | 380 | +160 over Vanguard |

**Leads nothing: Vanguard.** A hero with no axis of its own is the shape convergence takes.

<!-- END GENERATED: combat-tables -->

## The bestiary

What fights back. The hero sections above describe output; this describes what
that output is aimed at, and what it does to you in return.

### The enemy-side combat model

These rules are as load-bearing as the hero ones and are written down nowhere
else. Several are surprising enough that tuning an enemy without knowing them
produces a monster that does not behave the way its numbers read.

**Nothing damages you merely by touching you.** An enemy that walks into you
does nothing until it completes a windup. On entering `attack.range` it
commits, holds still for `attack.windupTicks`, and only then releases its
authored attack. Contact strikes are beaten by leaving their range; the
Ravager's locked line is beaten by stepping sideways. The boss is the sole
exception — she has real body-contact damage, rate-limited by
`touchCooldownTicks`.

**Every melee release commits its facing.** The Carapace snapshots its facing
when the overhead tell begins and only hits inside its authored 110° frontal
arc. Circling behind it during the tell is therefore a real counter even while
remaining inside its 34 px reach. The Skitter and Ravager likewise snapshot a
direction and cannot rotate afterward: the Skitter sweeps its body through a
72×20 px lane; the Ravager ruptures a 120×28 px lane. Both stop at the first
wall.

**Attack identity reaches presentation through events, never state mutation.**
Player release events carry hero identity, attack geometry, and authored base
damage as presentation weight; enemy release events carry family, shape, and
the same weight. `attackCues.ts` maps those values to distinct pike, maul,
hexbolt, thornbow, Skitter, Husk, Spitter, and Ravager voices/colors. Weapon
tiers therefore sound and look heavier without the renderer reading profile
data, and none of these fields participate in `hashState`.

**A whiff still costs the enemy its full cooldown.** The cooldown is paid when
the windup releases, before the range re-test, so a dodged attack buys the
whole recovery — that is the reward for reading the telegraph.

**Cadence cannot stunlock a player.** A player who takes a hit gets
`playerHitInvulnTicks` of immunity, and hostile bolts pass harmlessly through
an invulnerable player rather than being absorbed. No amount of enemy fire can
chain-lock you; enemies threaten by *position and volume*, never by cadence.

**Hostile bolts cannot hurt other enemies.** They test only against players, so
there is no friendly fire to play around and no way to bait a spitter into
thinning its own swarm.

### Archetypes

Three families, and like the heroes each is supposed to own an axis. The tier
(`common` / `veteran` / `elite`) sets where it sits on the threat curve; the
family sets what kind of problem it is.

**Skitter — expendable pressure.** Fast, fragile, and worth almost nothing
individually. It arrives in numbers, compresses for an 18-tick (0.3-second)
tell, then pounces 72 px through a locked 20 px lane for 7 damage. The leap
stops its whole body at walls and cannot turn after commitment. Standing still
gets surrounded and clipped; one lateral step makes the Skitter sail past and
pay its full recovery.

**Husk — armored space control.** The Carapace Husk uses a slow 24-tick
overhead bash for 16 damage and 28 px of wall-clipped knockback: retreat during
the tell or be driven out of position. The elite Gravebound Ravager is a
different decision, not merely a larger number. It locks a 120×28 px lane for
30 ticks, then ruptures that wall-clipped line for 24 damage and a 36 px
forward push. The lane can hit multiple players and must be sidestepped. The
Ravager bursts from a dying Husk Mound rather than spawning steadily.

**Spitter — the ranged zoner.** The only family that does not want to be near
you: it holds at range, kites when crowded (`keepDistanceFraction`), and taxes
you for standing in the open. After a 20-tick swollen-sac tell it fires three
8-damage globs across a 32° fan, turning one aimed lane into area denial. Its
`attack.kind` is `volley`, so it has no hidden melee or body-contact damage.
Kiting is authored per-enemy and is a family-line invariant: projectile
enemies kite, contact and line enemies never do, because a retreating bruiser
reads as cowardice rather than threat.

**Mireveil — the boss.** A scripted opponent rather than a statistical one. She
cycles her phase's actions in a strict round-robin with no randomness, each
behind a full telegraph, and every phase transition both speeds her up and adds
a move. The fight is meant to be learnable: the same sequence every time, so
dying to it twice is the player's fault and not the dice's.

#### Mireveil matchup budget

Issue #104 replaced the old hand-timed “ranged ~15–17 s, melee ~32 s” note with
a fixed-seed headless encounter. The untouched content did not reproduce that
direction: Vanguard was fastest at 12.90 s, followed by Ranger at 22.52 s,
Sentinel at 25.13 s, and Arcanist at 27.50 s. It did confirm the underlying
problem, however: fastest to slowest was still 2.13×.

Two small data changes close that outlier without giving every kit the same
damage profile. Mireveil's collision radius is 42 px rather than 34, matching
more of her 96 px silhouette and giving a properly aimed bolt a fair target
through the clutch around her. The Sentinel's base sweep recovers in 24 ticks
rather than 28; at 50 DPS he remains the lowest-damage hero at every weapon
tier, while preserving his wide-arc crowd lead. The regression ceiling is
**1.8× fastest-to-slowest**. Base-kit DPS still spans 1.6×, so that bound leaves
room for archetypes but permits only 12.5% additional matchup overhead. The
exact current measurements are generated from the real sim in
[Mireveil's bestiary entry](#scripted-base-kit-time-to-kill).

### Changing an enemy or the boss

**Tuning numbers:** edit `src/content/enemies.ts` or `src/content/bosses.ts`,
run `npm run docs:combat`, review the regenerated tables — the diff is the
balance review. Then `npm test`.

**Adding an enemy:** add to `src/content/enemies.ts` with a `family` and `tier`
already in `ENEMY_FAMILIES` / `ENEMY_TIERS`, and give it art keys per
`docs/ART.md`. A ranged enemy must author `keepDistanceFraction`; a melee one
must not. It must also differ from every existing enemy in shape or on at least
two of reach, cadence, windup and damage — `tests/combat.test.ts` enforces it,
because a monster that is another monster with a different HP bar is not a new
monster.

**Adding a new enemy attack shape:** extend the discriminated `EnemyAttackDef` union,
add one release branch in `executeEnemyAttack`, add its presentation and
generated shape text, and strengthen the differentiation tests. Shape, damage,
commit range, windup, and recovery stay together in the `attack` object; do not
add another optional side channel to `EnemyDef`.

**Adding a boss:** author a `BossDef` in `src/content/bosses.ts`, then put
complete `BossActionDef` values directly in each phase's round-robin cycle.
Action ids and telegraph copy are authored too, so `prism-rush` can use the
generic `charge` primitive and present as its own move without a sim or scene
branch. The reusable vocabulary is `summon`, `charge`, and `volley`; a boss may
reuse one action value across phases or author differently tuned values with
different ids. Adding a genuinely new mechanical shape still means extending
the discriminated union and its one generic release branch.

<!-- BEGIN GENERATED: bestiary-tables -->

<!-- Do not edit by hand. Regenerate with `npm run docs:combat`. -->

### The roster

Reach is the distance at which the enemy commits to an attack — for a ranged enemy that is
where it stops and fires, not how far the bolt flies. Every enemy authors shape, damage,
commit range, windup, and recovery together in one discriminated `attack` definition.
Enemy DPS is `damage × 60 / (cooldownTicks + windupTicks)`: a full repeated attack
cycle includes both the committed telegraph and the recovery before the next windup.

| Enemy | Family | Tier | HP | Speed | Reach | Dmg | Recovery | Windup | DPS | Kites | Gold | XP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Skitterling | skitter | common | 40 | 120 | 72 px | 7 | 48t | 18t | 6.4 | no | 2–5 | 6 |
| Carapace Husk | husk | veteran | 140 | 66 | 34 px | 16 | 55t | 24t | 12.2 | no | 6–12 | 18 |
| Bile Spitter | spitter | common | 46 | 88 | 200 px | 8 | 105t | 20t | 3.8 | yes (0.6) | 4–9 | 12 |
| Gravebound Ravager | husk | elite | 320 | 82 | 120 px | 24 | 70t | 30t | 14.4 | no | 22–34 | 55 |

### Threat and readability

The dodge window is the telegraph: the enemy holds still for that long before every attack,
so it is the whole of the counterplay. The `vs` columns are seconds of unanswered attacks to
drop each hero from full — the pressure a single one of these represents, before the swarm.

| Enemy | Shape | DPS | Dodge window | vs Vanguard | vs Arcanist | vs Ranger | vs Sentinel |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Skitterling | pounce 72×20 px | 6.4 | 0.30 s | 18.9 | 12.6 | 14.1 | 26.7 |
| Carapace Husk | contact 110° arc, push 28 px | 12.2 | 0.40 s | 9.9 | 6.6 | 7.4 | 14.0 |
| Bile Spitter | volley 3× / 32°, 240 px/s | 3.8 | 0.33 s | 31.3 | 20.8 | 23.4 | 44.3 |
| Gravebound Ravager | line 120×28 px, push 36 px | 14.4 | 0.50 s | 8.3 | 5.6 | 6.3 | 11.8 |

### Where they come from

| Spawner | HP | Spawns | Interval | Max alive solo / +hero | Enrage | On death | Gold | XP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Brood Node | 120 | Skitterling | 24t | 9 / +2 | ≤50% hp → ×0.6 for 2.50 s | — | 25 | 40 |
| Husk Mound | 150 | Carapace Husk | 165t | 2 / +1 | — | Gravebound Ravager | 30 | 45 |
| Spitter Nest | 110 | Bile Spitter | 150t | 2 / +1 | — | — | 30 | 45 |

### Mireveil — Mother of the Brood

900 hp · radius 42 px · 12 contact damage every 0.75 s · 1.00 s telegraph · 150g and 600 xp on death.

| Phase | Name | HP | Speed | Action interval | Action cycle |
| --- | --- | --- | --- | --- | --- |
| 1 | The Brood Stirs | ≤100% | 52 | 4.00 s | brood-call |
| 2 | The Mother Rages | ≤60% | 62 | 3.00 s | lunge → brood-call |
| 3 | Mireveil's Last Clutch | ≤25% | 72 | 2.00 s | glob → lunge → brood-call |

Phases are entered on HP thresholds and never left. Actions run as a strict round-robin
over the cycle above — no randomness — each preceded by the full telegraph.

| Action | What it does | Telegraph |
| --- | --- | --- |
| brood-call | summons 3× skitterling | SHE CALLS THE BROOD! |
| lunge | 420 px/s for 0.43 s, 22 damage on contact | SHE CHARGES! |
| glob | 5 bolts across 60°, 10 damage @ 230 px/s, 420 px | SHE SPITS! |

#### Scripted base-kit time to kill

Fixed seed 104; level 1, tier-1 built-in weapon, no upgrades, room loot, or potions.
One shared input script approaches through normal collision, attacks only in authored reach,
uses each kit’s ability in its intended geometry, circles during recovery, and sidesteps charges.

| Hero | Ticks | TTK |
| --- | --- | --- |
| Vanguard | 769 | 12.82 s |
| Arcanist | 1255 | 20.92 s |
| Ranger | 1363 | 22.72 s |
| Sentinel | 1343 | 22.38 s |

<!-- END GENERATED: bestiary-tables -->
