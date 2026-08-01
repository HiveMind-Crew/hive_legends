# The mission map

How a player moves through the game, and how to add a realm without touching
any code outside `src/content`. The map presents each spoke as a resin rail
with labeled honeycomb cells; the rules below are unchanged by that visual
treatment.

**Humans:** the model and the walkthrough below are the whole story. **Agents:**
every rule stated here that can be machine-checked is checked — the tests are
named inline, so if one fails, this document tells you what it was protecting.

## The model

The wheel is a hub with one **spoke** per realm. A spoke is **three missions
played in order, capped by a boss**.

Laid out as the hub draws it — mission 1 nearest the centre, the boss furthest
out, and unauthored realms as dim future arms:

```
                ⬡ BOSS · The Hollow Throne
                │
                ⬡ M3 · The Cobalt Combs
                │
                ⬡ M2 · The Resin Galleries
                │
                ⬡ M1 · The Brood Warrens
                │
             ⬡ HIVE                         ← The Azure Reach
              ╱     ╲
       ? The Glass   The Ashen ?             ← dim future realms
          Hollows      Spiral
```

Four rules, and that is the entire system:

1. A spoke is open when it has no `requiresSpoke`, or when the spoke it names
   has had its **boss** cleared.
2. Inside an open spoke, missions are **sequential** — the first is open, each
   later one waits on the mission before it.
3. The **boss opens when every mission in its spoke is cleared**.
4. A locked spoke locks everything in it, whatever else is cleared.

## The content plan

The v1 target is **three complete spokes and 75–105 minutes for a first clear**.
That keeps the arcade run under two hours while giving each mechanic enough
room to develop beyond its introduction. The two arms already announced on the
wheel are committed v1 realms, not indefinite placeholders.

The M2 content track owns both remaining spokes:

| Order | Realm | Delivery target | First-clear time | Novelty promise |
| --- | --- | --- | --- | --- |
| 1 | The Azure Reach | Shipped in M1 | 20–30 min | Establishes spawners, secrets, relics, an elite and Mireveil |
| 2 | The Ashen Spiral | First M2 content slice | 25–35 min | Ember-mite enemy family, vent hazard, Kilnback elite, Ash Regent boss |
| 3 | The Glass Hollows | Second M2 content slice / v1 content-complete | 30–40 min | Prism-wing enemy family, fracture hazard, Mirror Husk elite, Glass Choir boss |

Every new spoke must ship with all of the following:

1. One enemy family with a silhouette and combat job not already on the wheel.
2. One environmental hazard used differently across its three missions.
3. One elite that recombines the realm's pressure rather than enlarging a
   common enemy.
4. One boss with at least one action shape absent from earlier bosses.
5. Its own tiles, props, decor, palette and ambient treatment.

Existing families can return in supporting roles, but a spoke cannot satisfy
its novelty budget by remixing the Azure Reach roster alone. Fifteen concurrent
hostiles remains the readability ceiling; new families increase encounter
vocabulary, not the number of bodies on screen.

### Nothing is stored per spoke

Every rule above is derived from `Profile.clearedLevels` — an array of level
ids. There is no per-spoke progress field, no unlocked-spokes list, nothing to
keep in sync.

That is the load-bearing decision. It means **adding a realm never needs a save
migration**, and a profile written before the wheel existed still resolves
correctly. `tests/meta.test.ts` pins that: *"reads identically to the pre-wheel
linear rule for existing saves"*.

### A node is in one of four states

`nodeLockState(profile, levelId)` returns `cleared`, `available`, or `locked`
with a **reason**. The reason is not decoration — the hub prints a different
line for each, because they ask the player to do three different things:

| Reason | The hub says |
| --- | --- |
| `previous-mission` | clear the mission before it |
| `boss-gated` | clear every mission in the realm |
| `spoke-gated` | fell the previous realm's boss |

`cleared` is reported separately from `available` rather than folded in,
because a finished level stays enterable — Results offers a replay.

### Clear records are per realm

`Profile.bestClearTicks` is a `Record<levelId, ticks>` holding the fastest win
on each node. It is the one thing besides mastery seals that a replay of a
cleared realm can still move, so it is the game's replay motivation and it is
shown in all three places a player could look for it: the wheel footer beside
the realm name, the results screen (loudly, when a record falls), and the
hero-select summary as a single fastest-clear headline.

Per level, not global. A single number is owned forever by whichever realm is
shortest — the first one — so it stops meaning anything the moment a second
realm exists. `recordClearTicks` only ever lowers an entry, and distinguishes a
**first** clear from a **beaten** one so the copy never celebrates a record
that had nothing to beat.

A run that bought a **continue** (issue #99) is a clear but not a time. The
wheel is a progression gate and the record is a scoreboard: `clearedLevels`,
`missionsCompleted` and the hero-mastery seal all count a continued clear
exactly like any other, and `recordClearTicks` is simply not called for it.
Results says so on the line that reports what the continues cost.

This is the one field on `Profile` that carries a migration. Saves written
before it held a single global `number | null`; that number names no level, so
`loadProfile` drops it rather than mis-attributing it, and the player records
per-realm bests from their next clear. Adding a realm still needs no migration
— an unrecorded level is simply an absent key.

## Hero levelling and the power ceiling

XP is the *earned* half of progression; gold upgrades, weapon tiers, and the
ability-specialization fork are the *bought* half. The linear tracks stack and
stop; the specialization is a permanent either/or choice.

The curve in `src/content/progression.ts` runs **levels 1–10, capping at 3,660
total XP**, and each level grants +8 max HP (healed on the spot) and +2 damage.
A Warrens clear pays about 286 XP and Mireveil is worth 600, so a player reaches
the cap inside roughly a dozen missions — well inside the replay count the
roster sink invites.

**The cap stays at 10.** `docs/COMBAT.md` tunes every archetype against base
kits, and a curve that keeps paying max HP and damage forever eventually
flattens the differences it protects. What the cap does *not* do any more is
eat the XP that arrives after it (issue #103):

- `bankXp` converts overflow XP to gold at `capOverflowGoldPerXp` (0.25 g/XP,
  so a Warrens replay pays ~71g) and clamps `Profile.xp` to the cap, so the
  stored total stops climbing behind a level that cannot move.
- The HUD chip reads `Lv 10 MAX` in the level-up green, not `Lv 10` beside a
  full bar that looks like it is nearly there.
- Results names the dividend: `XP earned: 286 → 71g veteran's dividend`.
- A save written before this holds XP above the cap. That surplus is paid out
  as the same dividend on the next bank — once, because the clamp makes
  banking idempotent from then on.

This is deliberately a smaller faucet than a fresh realm's 150g first-clear
bounty: a capped hero's replay should still pay into the roster without
competing with new content.

### The combined ceiling

A fully-levelled, fully-upgraded, tier-3 hero — the top of the linear health
and basic-attack tracks — taking the Vanguard as the worked example:

| Source | Max HP | Damage per hit |
| --- | --- | --- |
| Base kit (Korrin Vale, Wardpike) | 120 | 28 |
| Levels 2–10 (9 × +8 HP / +2 dmg) | +72 | +18 |
| Hearthstone Vigor 5 (+20 HP/rank) | +100 | — |
| Sharpened Edge 5 (+4 dmg/rank) | — | +20 |
| Sunreaver Pike (tier 3 replaces the tier-1 damage) | — | 44 base |
| **Ceiling** | **292** (2.4× base) | **82** (2.9× base) |

Ability specialization is absent from this axis table on purpose: it changes
where or when Sunder Slam lands rather than adding another permanent max-HP or
basic-hit rank. Its behavior budget is documented below.

Levels are the *smallest* of the three tracks on both axes, which is the point:
they are the one that cannot be bought, so they lead the early game and then
hand over. Enemy and boss numbers are tuned against base kits, so read this
table as the top of the power band, not as the target the content is balanced
for.

## Ability specialization: a permanent fork

Issue #108 adds the first non-linear build decision. A hero may have one
authored ability-specialization group with two branches. Buying either branch
is permanent for that profile: it records the stable specialization id under
the group's stable id, and the sibling becomes locked. Repeated input cannot
repurchase the chosen branch or spend gold again.

The first complete slice belongs to the Vanguard's Sunder Slam:

| Branch | Cost | Behavior |
| --- | ---: | --- |
| Faultline Drive | 180g | Replaces the surrounding burst with a narrow rupture reaching far along the facing direction |
| Echoing Crater | 180g | Keeps the close blast and leaves a fixed cast point that erupts again 36 ticks later |

These are spatial and timing changes, not another linear damage rank. Both
remain offensive front-line impacts: neither grants a guard stance, healing,
mobility, ranged projectiles, or the Sentinel's broad weapon sweep. Profiles
without a choice—including every save written before this feature—continue to
use the unchanged base Sunder Slam.

### Boundary and extension contract

Definitions live in `src/content/abilitySpecializations.ts`. Each definition
has a stable id, hero id, stable exclusivity group, player-facing name and
description, gold cost, and a complete resolved `AbilityDef`. Results shows a
specialization shop only for heroes with an authored pair; unsupported heroes
get no locked placeholder or dead input.

The profile stores ids and prices purchases, but the sim never reads it.
`MissionScene` resolves the chosen definition once and passes only its
`AbilityDef` through `SimPlayerConfig.ability` to `createSim`, exactly beside
the existing weapon and upgrade handoffs. The sim rejects an override whose
ability kind differs from the hero's base kind, preserving the hero archetype
at the boundary.

To extend the roster:

1. Author exactly two definitions for a hero under one new stable group id.
2. Keep both resolved abilities the same discriminated `kind` as the base
   hero ability. Add a typed behavior field and deterministic execution branch
   when a new behavior cannot be expressed by the existing ability union.
3. Preserve the role invariants in `docs/COMBAT.md`; specialization is not a
   license to borrow another hero's defining guard, sweep, range, or mobility.
4. Add content validation, two same-hero sim outcomes, per-branch determinism,
   and Results-copy coverage. Do not expose the group until both branches are
   playable and described.

## The arcade continue

Death used to end a run outright, which meant dying two rooms from Mireveil
after a five-minute fight cost the whole thing (issue #99). The genre answer is
the continue, and it maps onto systems that already existed here: the bank is
the currency, and the sim already knows how to put a hero back on their feet.

What happens when the party falls:

1. The run **freezes** — the sim is not stepped, so a fallen hero accrues no
   mission time while the player reads a price.
2. The prompt states the cost and counts down 10 seconds. It appears even when
   the bank cannot cover it (on a shorter clock), because a player who dies
   broke should learn what continues cost rather than being dropped on results.
3. Taking it spends the gold, then `revivePlayer` stands the hero up **where
   they fell** with half max HP, 2.5s of invulnerability, and a shove that
   clears the ring of enemies standing over the body. It buys space, not a free
   screen-clear.
4. Declining, or letting the clock run out, routes to results exactly as it did
   before the mechanic existed.

Prices escalate within a run — 150g, then 300g, then 450g — so the first fall
is recoverable and the fourth is a decision about whether to spend the gold on
the upgrade that would have prevented it instead. Nothing about a continue is
persisted: the count lives on the mission scene, and the only thing that
outlives the run is the gold that left the bank.

`revivePlayer` is a sim function, not scene code, because a continue has to
keep the sim's guarantees: it is deterministic, it emits a `player-revived`
event, and a run that used one still hashes identically on a replay of the same
inputs (`tests/sim/revive.test.ts`). The sim knows nothing about the price.

## Where the data lives

| Layer | File | Owns |
| --- | --- | --- |
| Wheel shape | `src/content/spokes.ts` | `SPOKES`, `TEASER_SPOKES` |
| Shapes | `src/sim/types.ts` | `SpokeDef`, `TeaserSpokeDef` |
| Levels | `src/content/levels/` | The maps a spoke points at |
| Unlock rules | `src/meta/save.ts` | `nodeLockState`, `isSpokeUnlocked`, `spokeProgress`, `suggestedNode`, `spokeForLevel`, `isWheelComplete`, `nextTeaser` |
| Clear records | `src/meta/save.ts` | `bestClearTicks`, `recordClearTicks`, `fastestClear` |
| Continues | `src/meta/save.ts` + `src/content/revive.ts` | `continueCost`/`buyContinue` price them; `ReviveDef` says what one restores |
| Ability specialization | `src/content/abilitySpecializations.ts` + `src/meta/save.ts` | Authored mutually exclusive branches, persistent choice, and `SimPlayerConfig.ability` resolution |
| Levelling curve | `src/content/progression.ts` | `xpToReach` (the cap is its length), per-level bonuses, the overflow rate |
| XP banking | `src/meta/save.ts` | `bankXp`, `profileLevel`, `isMaxLevel`, `MAX_HERO_LEVEL`, `XP_CAP` |
| Level copy | `src/game/xpCopy.ts` | `heroLevelCopy` and `xpResultCopy`, kept out of the scenes so they are testable |
| Rendering | `src/game/scenes/MissionHubScene.ts` | Drawing only — no progression logic |
| Hub copy | `src/game/hubCopy.ts` | `statusCopy` and `endOfContentCopy`, kept out of the scene so they are testable |
| Record copy | `src/game/clearTimes.ts` | Tick→time formatting and record wording, shared by the wheel, results and hero select |

`MissionHubScene` reads positions from each spoke's `angleDeg`, states from
`nodeLockState`, its cursor default from `suggestedNode`, and its teaser arms
from `CONTENT.teaserSpokes`. It hardcodes no part of the wheel's shape.

## The flow

```
hero select ──Enter──> the wheel ──Enter──> mission ──> results
      ^                     ^                             │
      └──────── H ──────────┴────────── N / W ────────────┘
```

Hero select picks **who goes**; the wheel picks **where**. From Results, `N`
returns to the wheel focused on the node just unlocked, `W` returns with the
realm just finished under the cursor, and `R` replays the same level directly.

Results deliberately routes *back through the wheel* rather than launching
straight into the next realm, so a freshly unlocked node is seen to open.

## Adding a spoke

Author the content, then add one entry. That is all.

1. **Author 3 mission levels and a boss level** in `src/content/levels/`, and
   register them in `LEVELS` (`src/content/index.ts`). The boss level needs a
   `boss` field — see `hollowThrone.ts`.
2. **Add a `SpokeDef`** to `SPOKES` in `src/content/spokes.ts`:
   ```ts
   {
     id: 'ashen-spiral',
     name: 'The Ashen Spiral',
     accent: 0xff7a3c,          // its colour on the wheel
     missions: [A.id, B.id, C.id],
     boss: BOSS.id,
     requiresSpoke: 'azure-reach',  // opens when the Reach's boss falls
     angleDeg: 120                  // must not collide with another arm
   }
   ```
3. **Delete the matching teaser** from `TEASER_SPOKES`, if it had one.

You do **not** touch: unlock logic, `MissionHubScene`, `ResultsScene`, the
`Profile` shape, or any migration. If a change to a spoke requires editing a
scene, something has gone wrong.

### Promoting a teaser

A teaser is a separate shape from a real spoke — it has no missions, no boss
and no gate. That is deliberate: giving `SpokeDef` optional node fields would
mean loosening the invariants below, which are what make a real spoke
trustworthy. Promotion is a move between two lists, not a flag flip.

## Constraints that will bite

Each of these is enforced. The test name is given so a failure points back
here rather than leaving you guessing.

| Rule | Why | Test |
| --- | --- | --- |
| The first spoke's first mission stays `brood-warrens` | The e2e bot confirms straight through from a fresh profile | *the wheel opens on The Brood Warrens* |
| A spoke's boss node must be a level that carries a `boss` | Otherwise the wheel promises a boss fight that plays as an ordinary mission | *a spoke's boss node is a level that actually carries a boss* |
| A level belongs to exactly one spoke | Two arms claiming a level makes progress ambiguous | *no level belongs to two spokes, or to one spoke twice* |
| Spoke ids **and** `angleDeg` are unique across spokes *and* teasers | Two arms on one bearing draw on top of each other | *spoke ids and wheel angles are unique, teasers included* |
| `requiresSpoke` resolves, with exactly one root, no cycles | A cycle makes the whole wheel unreachable | *the spoke gate graph is well-formed and acyclic* |
| Every spoke runs exactly three missions | The pacing the boss gate assumes | *each spoke runs three missions before its boss* |
| At least one teaser exists | Without one the hub is a lone line and the game looks finished | *the wheel announces somewhere still to go* |

Spoke **gating** is covered separately in `tests/spokeGate.test.ts`, against a
mocked two-spoke wheel. Only one spoke is authored, so real content cannot
reach that rule — and it has to be right *before* a second spoke ships, or it
either locks players out of content they earned or hands them a realm they
never reached.

For the same reason `statusCopy` lives outside the scene: `spoke-gated` cannot
be produced on screen today, so `tests/hubCopy.test.ts` is the only thing
verifying it.

## Theming

Two different colours, deliberately:

- **`SpokeDef.accent`** is the realm's colour **on the wheel**.
- **`LevelDef.theme`** is the palette **inside** a mission.

They do not have to agree. The Azure Reach is blue on the hub while The Resin
Galleries stays amber in play — that level's name and authored identity depend
on the tint, and a realm-wide repaint would throw it away.

## The end of the line

When every authored node is cleared, `isWheelComplete` is true and
`nextTeaser` returns the first teaser. Results then names the realm just
finished and dangles what is coming, instead of going quiet.

The realm name is derived from the boss that was felled, not hardcoded — a
second spoke must not leave that line announcing the first.

The wheel keeps that state visible on every later visit. `endOfContentCopy`
reads the same `nextTeaser` decision as Results, announces that the named realm
awaits, and places its authored tagline on the dim teaser arm. A completed
wheel therefore reads as the deliberate edge of the current game, not as a
board that stopped responding.

## A note on generated tables

`docs/COMBAT.md` generates its numbers from `src/content` and fails a test when
they drift. This document deliberately does not: with one authored spoke the
tables would be shorter than the generator, and the prose here is about rules
rather than numbers. Worth revisiting once several realms exist —
`scripts/combatTables.ts` and `tests/combatDoc.test.ts` are the working
pattern.
