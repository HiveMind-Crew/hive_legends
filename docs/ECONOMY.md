# Economy

Hive Legends uses a **completion-forward** economy. A player who explores the
authored spoke once should be able to buy every shared upgrade and both weapon
tiers for a chosen hero. Replays are welcome, but they are not required to make
a complete build.

## The decisions

- Ordinary missions pay a 150g first-clear bounty; bosses pay 250g. These are
  added to gold collected in the run and are never paid twice.
- Both five-rank shared upgrades use flat prices: 80g per Vigor rank and 100g
  per Edge rank. Later ranks no longer cost multiple full missions.
- The four heroes continue to share one bank. Shared upgrades benefit the
  whole roster; recruitment and weapons are the longer-term roster sink.
- Clearing a mission with a new hero earns a persistent **hero mastery** seal.
  The wheel shows seals out of four, giving every cleared node a replay goal
  that is not another currency payout.
- Once a hero is at the level cap, XP converts to gold at **0.25 g/XP** — the
  veteran's dividend (issue #103). It is the only income that scales with
  replays rather than with first clears: a Warrens replay pays about 71g, well
  under the 150g bounty an unplayed realm still holds. Modelled first-clear
  income below is unaffected, because a first pass through the Azure Reach ends
  short of the cap. See `docs/PROGRESSION.md` for the cap itself.

The **arcade continue** (issue #99) is the one gold sink that is spent *during*
a run rather than between them: 150g for the first, +150g for each further one
in the same mission. It is priced against a mission's modelled income (~450g),
so one bad patch is recoverable and a run that keeps falling stops being worth
paying for — and it competes directly with the upgrade that would have stopped
the deaths, which is the decision the sink is there to create.

This deliberately leaves some sink after a first Azure Reach clear. One hero
can be completed in one pass; completing the entire roster takes exploration,
mastery replays, or future spokes.

## Generated balance report

The static opportunity column includes authored gold pickups, spawner and boss
drops, and the average value of gold props. It excludes enemy drops because
their count varies with pressure and player speed. The checked-in report is
regenerated from `src/content` and fails tests if it drifts.

<!-- BEGIN GENERATED: economy-tables -->
| Level | Static opportunity | First-clear bounty | Modeled first clear |
| --- | --- | --- | --- |
| The Brood Warrens | 352 | 150 | 502 |
| The Resin Galleries | 390 | 150 | 540 |
| The Cobalt Combs | 390 | 150 | 540 |
| The Hollow Throne | 439 | 250 | 689 |

Modeled Azure Reach income: **2271g** (1571g static opportunity + 700g bounties). Dynamic enemy drops are extra.

| Upgrade track | Curve | Total |
| --- | --- | --- |
| Hearthstone Vigor | 5 × 80g | 400 |
| Sharpened Edge | 5 × 100g | 500 |

| Permanent sink | Gold |
| --- | --- |
| Shared upgrades | 900 |
| All hero weapon tiers | 1360 |
| All hero recruitment | 500 |
| **Everything** | **2760** |

Full-roster sink / modeled first-clear income: **1.22×**.
<!-- END GENERATED: economy-tables -->
