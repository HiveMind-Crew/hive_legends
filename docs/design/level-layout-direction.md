# Level layout direction

Updated: 2026-08-05 · Scope: authored Realm 1 traversal maps and future map guidance

## Outcome

The current traversal missions are valid and readable, but they repeat the same macro-flow: spawn in the west or north-west, clear objectives across the north and east, then turn clockwise toward a southern exit. The repetition is most noticeable in **The Brood Warrens** and **The Resin Galleries**, where the last objective is followed by a long walk back toward the left edge.

Future maps should deliberately rotate their dominant travel direction. For the existing campaign, use this sequence:

1. **Brood Warrens — west to east:** a clear introductory push with the portal beyond the final fight.
2. **Resin Galleries — south to north:** a vertical climb with side vaults that rejoin ahead.
3. **Cobalt Combs — south-east to north-west:** a diagonal reverse-flow or braided route, visually distinct from the first two.
4. **Hollow Throne — south to north:** retain the current boss-arena composition; its single-room combat flow already breaks the traversal pattern.

The direction itself is not a quality score. The goal is a distinct silhouette and movement rhythm per mission, while keeping the final portal close to the last mandatory encounter.

## Current-layout audit

Distances below are shortest walkable tile routes, using the most efficient order for clearing all generators before reaching the exit.

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

## Proposed map mockups

Legend: `S` spawn · `1–3` mandatory generators/encounters · `X` exit · `V` optional vault · `K` key · arrows show the intended critical path.

### A. Brood Warrens — west-to-east spine

```text
                  ┌── V secret ──┐
                  │              │
S ── staging ── [1] ── gallery ── [2] ── breach ── [3] ── X
                        │                         │
                        └── K ── V gate ─────────┘
```

Design intent:

- Teach the campaign's base grammar with unmistakable left-to-right progress.
- Put the first generator near the first screen edge, not in the start room.
- Let each chamber introduce one enemy-space relationship: swarm room, cover room, ranged lane.
- Rejoin both optional branches farther east so exploration never means walking back to the spawn.

Low-cost current-map version: move the exit from `(3,20)` to the open floor at approximately `(30,20)`. With no wall changes, the likely route falls from 64 to about 43 tiles and the last leg falls from 26 to 5 tiles. A later geometry pass can strengthen the spine and forward-rejoining vaults.

### B. Resin Galleries — south-to-north climb

```text
                         X
                         ↑
                  ┌──── [3] ────┐
                  │ upper kiln  │
           V gate ┤             ├─ V secret
                  └───── ↑ ─────┘
                        [2]
                    cross-gallery
                         ↑
             ┌── K ──── [1] ──── relief loop ──┐
             └────────────── S ──────────────────┘
```

Design intent:

- Make northward movement the dominant read, using each chamber threshold as a visible rise in intensity.
- Alternate wide combat landings with short, offset vertical connectors; avoid one long featureless corridor.
- Place vaults on opposite sides of the upper route so the party makes short horizontal choices inside an overall vertical climb.
- Reveal the portal or its light from encounter 3, then make it immediately reachable when the objective completes.

Low-cost current-map version: move the exit from `(4,24)` to open floor near `(35,22)`. The likely route falls from 80 to about 53 tiles and the last leg from 34 to 7 tiles. This fixes the reward cadence before the larger vertical rebuild.

### C. Cobalt Combs — diagonal reverse braid

```text
X ── final bridge ── [3]
                      ↖
              ┌──── merge ────┐
              ↑               ↑
        [1] close-combat   [2] ranged-combat
              ↑               ↑
              └──── choose ───┘
                         ↖
                          S
```

Design intent:

- Start in the south-east and finish in the north-west so the third traversal map does not inherit the established clockwise read.
- Give the two braid arms different tactical identities, not merely different decorations.
- Let either first arm remain valid; after both are resolved, open a short diagonal or central bridge to the final encounter.
- Keep Cobalt's strongest existing trait: the portal should remain within one small room of the final generator.

This is a higher-cost rebuild than the two portal relocations. The existing Cobalt exit cadence is already good, so prioritize changing spawn/objective bands and circulation silhouette, not simply moving its portal.

### D. Future alternate — hub, spokes, then forward reveal

```text
                   [1]
                    │
S ── overlook ── central landmark ── [2]
                    │
                   [3]
                    │  opens only after 1–3
                    └─────────────── X
```

Use this sparingly. Returning to a recognizable hub can be satisfying when each return changes the space, enemy composition, or shortcut state. Do not place the exit back at `S`; opening a new edge beyond the hub preserves forward momentum.

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

## Recommended implementation order

1. **Immediate cadence fix:** relocate the Brood and Resin exits to their forward edges and update mission copy/tests.
2. **Brood blockout pass:** reshape it into the west-to-east spine while preserving its compact tutorial role.
3. **Resin blockout pass:** rebuild around a south-to-north axis and move the two optional vaults to opposite side branches.
4. **Cobalt blockout pass:** prototype the reverse diagonal braid; preserve its short final generator-to-portal distance and three-family identity.
5. **Playtest instrumentation:** log generator-clear order, tile distance traveled after `exit-opened`, time with no enemies nearby, and party spread at doorways. Use those results to tune the numeric targets above.
