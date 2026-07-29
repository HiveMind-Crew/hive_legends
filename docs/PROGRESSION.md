# The mission wheel

How a player moves through the game, and how to add a realm without touching
any code outside `src/content`.

**Humans:** the model and the walkthrough below are the whole story. **Agents:**
every rule stated here that can be machine-checked is checked — the tests are
named inline, so if one fails, this document tells you what it was protecting.

## The model

The wheel is a hub with one **spoke** per realm. A spoke is **three missions
played in order, capped by a boss**.

Laid out as the hub draws it — mission 1 nearest the centre, the boss furthest
out, and unauthored realms as stub arms:

```
                ● boss ......... The Hollow Throne
                │
                ● mission 3 .... The Cobalt Combs
                │
                ● mission 2 .... The Resin Galleries
                │
                ● mission 1 .... The Brood Warrens
                │
             ( HIVE )                      ← The Azure Reach
              ╱     ╲
             ○       ○                     ← teasers, not yet authored
    The Glass         The Ashen
      Hollows           Spiral
```

Four rules, and that is the entire system:

1. A spoke is open when it has no `requiresSpoke`, or when the spoke it names
   has had its **boss** cleared.
2. Inside an open spoke, missions are **sequential** — the first is open, each
   later one waits on the mission before it.
3. The **boss opens when every mission in its spoke is cleared**.
4. A locked spoke locks everything in it, whatever else is cleared.

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

## Where the data lives

| Layer | File | Owns |
| --- | --- | --- |
| Wheel shape | `src/content/spokes.ts` | `SPOKES`, `TEASER_SPOKES` |
| Shapes | `src/sim/types.ts` | `SpokeDef`, `TeaserSpokeDef` |
| Levels | `src/content/levels/` | The maps a spoke points at |
| Unlock rules | `src/meta/save.ts` | `nodeLockState`, `isSpokeUnlocked`, `spokeProgress`, `suggestedNode`, `spokeForLevel`, `isWheelComplete`, `nextTeaser` |
| Rendering | `src/game/scenes/MissionHubScene.ts` | Drawing only — no progression logic |
| Hub copy | `src/game/hubCopy.ts` | `statusCopy` and `endOfContentCopy`, kept out of the scene so they are testable |

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
