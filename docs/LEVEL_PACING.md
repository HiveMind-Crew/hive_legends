# Level pacing baselines

These are the current authored-map baselines. Regenerate the report with
`npm run metrics:levels`; unit tests pin the summary values so geometry changes
are deliberate.

| Level | Dimensions | Walkable floor | Critical route | Final objective → exit | Narrowest critical pinch |
| --- | ---: | ---: | ---: | ---: | ---: |
| The Brood Warrens | 46 × 30 | 1,069 tiles | 97 tiles | 5 tiles | 3 tiles |
| The Resin Galleries | 40 × 28 | 537 tiles | 78 tiles | 34 tiles | 1 tile |
| The Cobalt Combs | 48 × 36 | 755 tiles | 123 tiles | 6 tiles | 3 tiles |
| The Hollow Throne | 40 × 36 | 826 tiles | 84 tiles | 7 tiles | 4 tiles |

The critical route is the shortest walkable tile route from any authored player
spawn through every generator/boss objective and then the exit. On a braided map
that shortest permutation can be an order the encounter dependencies forbid — for
The Cobalt Combs the two orders a player can actually clear cost 131 and 133
tiles, measured with `measureAuthoredRoute`. The final leg
uses the objective that the selected shortest route clears last. Corridor width
is the smaller open horizontal/vertical span at each critical-path tile; the
report retains every tile tied for the minimum as a pinch point.

The Hollow Throne's two sanctums are dependency-free (issue #151), so both
orders are playable; measured with `measureAuthoredRoute` they cost 84 and 86
tiles. Its critical route ends at the boss, so the approach budget —
staged play before the boss threshold — is the critical route minus the final
objective→exit leg: 84 − 7 = 77 tiles, inside the authored 65–90 target.
