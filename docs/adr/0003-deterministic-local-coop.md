# ADR 0003: deterministic local co-op party rules

**Status:** Accepted (issue #106)

## Decision

Local co-op supports four stable slots. Slot 0 always starts joined and merges
keyboard with pad 0. Pads 1–3 press START to join and BACK to deliberately
become dormant. `InputCommand.join`, `leave`, and held `interact` enter the
fixed-tick simulation like movement and attacks; browser device presence never
mutates `SimState`. A transient disconnect therefore leaves an idle active
body. Dormant heroes are neither targets nor objective/failure participants,
but their state and earned contributions remain available when they rejoin.

All reserved slots use the hero, weapon, ability specialization, upgrades, and
starting XP chosen in the one local profile. `PlayerState.slot` is the stable
config/input identity; array position is not identity. A first join spawns at
that slot's authored level spawn. Slot 0 cannot drop out, preventing an empty
party state. Any joined living hero may enter the open exit. P1/pad 0 owns the
shared-profile menus and results shop.

The camera follows living joined heroes only. Solo keeps the old 1.25× facing
lookahead. A party uses the midpoint of its position extremes and the greatest
zoom that fits its bounding box plus 96 world pixels of padding, clamped from
1.25× down to 0.75×. Phaser smooths and map-clamps the pure helper's target.

Gold pickups are consumed once, credited to their collector, and added once to
`SimState.rewards.gold`. Every enemy/objective XP source is added once to
`rewards.xp`, attributed to the securing slot for results, and granted to each
living joined hero for in-run levels. Returning heroes catch up from the unique
ledger. Results sum retained per-player contributions into the shared profile;
first-clear, clear records, unlocks, and mission count occur once per run.

Generator caps use `maxAlive + maxAlivePerExtraPlayer × (joined - 1)`. Leaving
does not despawn excess enemies; it only prevents new births until the live
count falls below the current cap. Thus solo data is byte-for-byte unchanged.

A living hero holds E or (B) within 64 px of a downed joined teammate for 90
consecutive ticks. Release, range exit, a hit, death, drop-out, or a different
reviver resets progress. The teammate rises at 30% HP with 60 i-frame ticks and
no crowd clear. Only the whole joined party being down opens the paid continue;
one shared-bank purchase revives every joined hero using the stronger existing
50% HP / 150-tick / knockback continue rules.

## Consequences

Join/leave/revive and pressure changes are replayable and included in
`hashState`. Results can audit unique party totals against per-slot rows. A
lost controller deliberately does not make its hero safe; reconnect or use
another active hero, then issue BACK if a drop-out is wanted. Per-player hero
selection is intentionally outside this issue.
