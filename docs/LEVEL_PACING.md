# Level pacing baselines

These are the pre-expansion authored-map baselines for issue #147. Regenerate
the report with `npm run metrics:levels`; unit tests pin the summary values so
geometry changes are deliberate.

| Level | Dimensions | Walkable floor | Critical route | Final objective → exit | Narrowest critical pinch |
| --- | ---: | ---: | ---: | ---: | ---: |
| The Brood Warrens | 32 × 24 | 610 tiles | 60 tiles | 26 tiles | 2 tiles |
| The Resin Galleries | 40 × 28 | 537 tiles | 78 tiles | 34 tiles | 1 tile |
| The Cobalt Combs | 38 × 26 | 514 tiles | 65 tiles | 4 tiles | 1 tile |
| The Hollow Throne | 30 × 22 | 528 tiles | 18 tiles | 7 tiles | 10 tiles |

The critical route is the shortest walkable tile route from any authored player
spawn through every generator/boss objective and then the exit. The final leg
uses the objective that the selected shortest route clears last. Corridor width
is the smaller open horizontal/vertical span at each critical-path tile; the
report retains every tile tied for the minimum as a pinch point.
