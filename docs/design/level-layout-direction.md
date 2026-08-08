# Level layout direction

Updated: 2026-08-08 · Scope: authored Azure Reach maps and future map guidance

## Outcome

Issue #146's redesign is implemented across the complete Azure Reach. The old
campaign repeatedly spawned in the west or north-west, swept clockwise, and
finished near a southern edge. The shipped maps now rotate their dominant travel
direction and encounter rhythm deliberately:

1. **Brood Warrens — west to east:** a clear introductory push with the portal beyond the final fight.
2. **Resin Galleries — south to north:** a vertical climb with side vaults that rejoin ahead.
3. **Cobalt Combs — south-east to north-west:** a diagonal reverse-flow or braided route, visually distinct from the first two.
4. **Hollow Throne — south to north:** a two-order sanctum approach compresses
   into the preserved circling arena and its short north portal payoff.

The direction itself is not a quality score. The goal is a distinct silhouette
and movement rhythm per mission while keeping the final portal close to the last
mandatory encounter. The historical audit below records why the work was
needed; the as-built comparison records what shipped.

## Pre-redesign audit (historical baseline)

These measurements were captured before #147–#151. Distances are shortest
walkable tile routes using the most efficient order for clearing all generators
before reaching the exit.

| Level | Efficient macro-route | Total route | Final objective to exit | Assessment |
| --- | --- | ---: | ---: | --- |
| Brood Warrens | NW spawn → NE → E → SE → SW exit | 64 tiles | 26 tiles (41%) | Strong tutorial rooms, but the victory lap crosses almost the entire map to the left. |
| Resin Galleries | NW spawn → N → NE → SE → SW exit | 80 tiles | 34 tiles (43%) | The clearest clockwise loop and the largest post-objective commute. |
| Cobalt Combs | NW spawn → N → NE → S → south-center exit | 69 tiles | 4 tiles (6%) | Best portal payoff; the first half still repeats the north-then-clockwise grammar. |
| Hollow Throne | S spawn → central boss → N exit | 19 tiles spawn-to-exit | About 7 tiles after the boss | Good vertical set piece. Keep its arena role separate from traversal-map rules. |

The generators can be destroyed in any order, but room adjacency makes the listed order substantially more efficient. In practice, the geometry strongly authors the clockwise route even without an explicit objective sequence.

### What is working

- Objectives, gates, secrets, and exits are reachable and already machine-validated.
- The maps use distinct encounter rooms rather than one undifferentiated floor.
- Cobalt demonstrates the preferred completion beat: the portal is only four tiles from the final likely generator.
- Hollow Throne changes the spatial verb from traversal to circling and line-of-sight management.
- Critical openings have already been widened after a two-tile doorway caused pathing and combat congestion. That lesson should become a formal authoring rule.

### What is weakening the campaign rhythm

- **Directional sameness:** every traversal map begins in the same quadrant and puts early objectives on the northern band.
- **Backloaded dead travel:** 41–43% of the efficient Brood and Resin route occurs after the last required fight, through mostly cleared space.
- **Portal payoff:** opening the exit is a strong audiovisual reward, but the player cannot immediately act on it in Brood or Resin.
- **Repeated room grammar:** rectangular chambers connected by orthogonal halls make the map silhouettes feel more alike than their themes and enemy mixes.
- **Optional content competes with forward motion:** southern vaults are useful detours, but they reinforce the same lower-map finish and can blur whether the level wants the party to explore or leave.

## Reference patterns

Classic Gauntlet framed its levels as scrolling mazes in which players search for an exit while managing generators, treasure, keys, and survival pressure. Its original authoring instructions explicitly supported destructible walls, doors, traps, transporters, keys, generators, and multiple possible exits in a 32 × 32 grid, with only a 16 × 10 tile window visible at once. The important lesson is not to copy its mazes; it is to use partial visibility, landmarks, branches, and authored reveals to make movement itself part of the encounter. See the [original Gauntlet instructions](https://idpixel.ru/games/g/gauntlet/files/Gauntlet___Instructions.pdf).

Broader level-design practice treats circulation as the structure that organizes a sequence of gameplay events. Linear, radial, clustered, and grid organizations are useful distinct starting types, and long corridors should be broken by openings, landmarks, or staging spaces. See Steve Chen's [The Architecture of Level Design](https://www.gamedeveloper.com/design/gdc-2001-the-architecture-of-level-design). Critical paths describe the mandatory experience; optional branches should enrich it without making orientation depend on guesswork. See [Flow](https://book.leveldesignbook.com/process/layout/flow), [Critical path](https://book.leveldesignbook.com/process/layout/criticalpath), and [Wayfinding](https://book.leveldesignbook.com/process/blockout/wayfinding) in The Level Design Book.

Five patterns fit Hive Legends particularly well:

1. **Linear spine with teeth:** mandatory encounters advance along one axis; short treasure rooms hang above and below it.
2. **Braided route:** two paths offer different combat conditions, then rejoin ahead instead of requiring a return to the fork.
3. **Lock-and-key loop:** the player sees a gate or portal early, takes a compact loop to earn access, and returns through a newly opened shortcut.
4. **Hub and spokes with a forward finish:** a central landmark organizes two or three objectives, but clearing them opens a new exit beyond the hub rather than at the spawn.
5. **Set-piece arena:** a single combat space is shaped around cover, circling, hazards, or phases. Hollow Throne already owns this pattern.

## Implemented layout comparison

`npm run metrics:levels` produces the measurements below. The critical route is
the shortest spawn → every mandatory objective → exit route; authored-order
tests separately cover dependency-constrained braids. `docs/LEVEL_PACING.md`
defines the metric precisely and records the pinned baselines.

| Level | Spawn → exit | Critical route | Final leg | Pinch | Branch and encounter rhythm |
| --- | --- | ---: | ---: | ---: | --- |
| Brood Warrens | West → east | 97 tiles | 5 tiles | 3 tiles | Four linear stages alternate north/south rooms; gate and secret rewards rejoin farther east. |
| Resin Galleries | South → north | 140 tiles | 7 tiles | 3 tiles | Four stacked landings zig-zag across the climb; opposite-side vaults rejoin above their departure band. |
| Cobalt Combs | South-east → north-west | 123 tiles | 6 tiles | 3 tiles | Independent Husk and Spitter arms braid through a mandatory merge, then compress into the breach. |
| Hollow Throne | South → north | 84 tiles | 7 tiles | 4 tiles | Either sanctum may be cleared first; both feed a preparation landing, dormant-boss threshold, circling arena, and north portal. |

Legend: `S` spawn · `[n]` mandatory encounter · `X` exit · `V` optional vault
· arrows show dominant flow. These are route silhouettes, not literal tile maps.

### A. Brood Warrens — west-to-east spine (#149)

```text
                  ┌── V gate ────────┐
S → [1 Brood] → [2 Husk] → [3 Brood] → [4 Spitter] → X
                         └── V secret ────────────────┘
```

- The party starts at `(3–5, 14–16)` and exits at `(44, 22)`, putting the
  endpoints in opposite outer thirds.
- Staged north/south rooms alternate swarm containment, elite circulation,
  breach pressure, and a ranged finale instead of repeating one box.
- Gold breadcrumbs and the dimmed portal preview reinforce the eastern finish;
  optional rewards never send the player back to spawn.

### B. Resin Galleries — south-to-north climb (#150)

```text
                              X
                              ↑
                     [4 Crown Brood]
                  ↗                   ↖
          V gate → [3 Upper Brood] ← V secret
                              ↑
                        [2 Husk Kiln]
                              ↑
                      [1 Lower Basin]
                              ↑
                              S
```

- The party starts at `(21–23, 38–40)` and exits at `(34, 1)`, making the
  climb legible from authored coordinates as well as dressing.
- Wide horizontal landings alternate with offset vertical connectors; each
  stage must clear before the next can wake, preventing off-screen pressure.
- Gate and secret vaults occupy opposite sides and reconnect at or above their
  departure height, preserving discovery without a return to the basin.

### C. Cobalt Combs — south-east-to-north-west braid (#148)

```text
X ← [4 Breach] ← [3 Merge]
                       ↖     ↗
                 [1 Husk]   [2 Spitter]
                       ↖     ↗
                          S
```

- The party starts at `(40–42, 30–32)` and exits at `(4, 5)`, reversing both
  axes used by the first two traversal maps.
- Husk and Spitter arms are independently wakeable and tactically distinct;
  both orders remain within 15% route cost and inside the shared camera span.
- The arms rejoin forward at the Brood merge before the final ranged breach,
  keeping the branch a braid rather than two mandatory dead ends.

### D. Hollow Throne — staged approach into arena (#151)

```text
                              X
                              ↑
                       [3 Mireveil arena]
                              ↑
                    sealed boss threshold
                         ↖           ↗
                 [1 Husk sanctum] [2 Cyst sanctum]
                         ↖           ↗
                              S
```

- The party starts at `(18–20, 33–34)`, clears either sanctum order, and
  crosses the threshold toward Mireveil at `(20, 8)` and the portal at
  `(20, 1)`.
- The approach contributes 77 tiles before the boss payoff. The original
  30 × 22 arena remains embedded so its four-pillar circling and benchmarked
  boss balance do not change as a side effect of the traversal redesign.
- The two dependency-free sanctums fit the four-player hostile and camera
  budgets; Mireveil remains dormant and contained until both clear.

## Authoring rules for future levels

These are initial playtest targets, not hard engine constraints.

### Direction and completion

- Assign every traversal level a **dominant vector** before drawing rooms: `W→E`, `S→N`, `SE→NW`, radial, or another deliberately named flow.
- Put spawn and exit in different outer thirds of the map unless the level is intentionally built around a lock-and-key return.
- Keep the likely final mandatory encounter within **4–8 walkable tiles** of the exit.
- Use a forced long return at most once in a multi-level realm, and make it a changed-state return with a shortcut, escalation, or newly opened space.
- A branch should normally rejoin **ahead** of where it split. Dead ends are for compact rewards, secrets, or risk—not mandatory objectives.

### Camera and readability

- At the solo zoom, the 960 × 720 view shows roughly **24 × 18 tiles**. Compose major reveals around that window: the next threshold, landmark glow, or room mouth should become readable before the current fight has fully left the frame.
- Give each major room one unique map-reading landmark: a dais, resin fall, comb bridge, split pillar, generator silhouette, or portal glow.
- Avoid placing every generator on the same horizontal band. Vary both axis and room relationship across the campaign.
- Use portal light, floor treatment, particles, or framing to announce the terminal edge before the player reaches it.

### Co-op circulation and combat

- Keep critical-path corridors at least **3 tiles wide**. Use **4–6 tile thresholds** where four players and a spawned pack are expected to cross simultaneously.
- Never put the primary fight directly in a narrow connector. Corridors set anticipation; chambers absorb movement, separation, and knockback.
- Provide two usable circulation arcs around ranged or elite encounters so one blocked doorway cannot trap the whole party.
- When paths split, keep both arms close enough for the party camera and readable enough that players understand whether the split is tactical or accidental.

### Encounter cadence

- Start with a staging pocket that establishes the dominant direction before pressure begins.
- Alternate compression and release: connector → encounter room → reward/choice → connector → escalation.
- Make each mandatory room answer a different combat question through geometry: swarm containment, line-of-sight cover, kiting loop, flanking braid, or defend-and-hold.
- Put recovery pickups after pressure peaks or on visible tactical detours, not randomly along empty travel.

### Review checklist

Before a map is dressed, verify:

- Can someone trace the likely critical path in five seconds from the blockout?
- Is this path's silhouette meaningfully different from the previous mission?
- Does the portal open near the likely last required encounter?
- Do optional branches rejoin ahead or justify their return distance?
- Are all critical pinches at least three tiles wide?
- Does each fight room create a different movement problem?
- Can players identify their current region from one landmark or room shape?
- Does the route remain legible with four players, enemies, pickups, and effects on screen?

## Implementation record

The redesign shipped in dependency order:

1. #147 — deterministic staged encounters, authored dependencies, route
   metrics, test-handle pacing data, and validation.
2. #149 — The Brood Warrens west-to-east introductory spine.
3. #150 — The Resin Galleries south-to-north expedition.
4. #148 — The Cobalt Combs reverse-diagonal braid.
5. #151 — The Hollow Throne staged pre-boss approach.

Each delivery pins geometry and encounter behavior in its per-map sim suite.
The real production build is played through by `e2e/playthrough.spec.ts`,
`e2e/resin-galleries.spec.ts`, `e2e/cobalt-combs.spec.ts`, and
`e2e/hollow-throne.spec.ts`; those runs exercise the authored direction,
optional-space reachability, staged pressure, exit payoff, and solo/four-player
camera behavior rather than validating a disconnected mockup.

This closes the original implementation plan. Future maps should reuse the
authoring rules and review checklist above, then add new baselines to
`docs/LEVEL_PACING.md` and `tests/sim/level.test.ts` deliberately.
