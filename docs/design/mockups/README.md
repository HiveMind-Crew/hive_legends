# Menu redesign mockups

Design artefacts for the mission map and results/upgrade screens. Nothing here
ships — these are not textures, not content, and nothing in `src/` reads them.
They exist so an issue or a review can point at a picture instead of a
paragraph.

- `current-*.png` — the shipped screens, captured from the production build at
  the native 960×720.
- `proposed-*.png` — the proposed layouts at the same resolution, so the two are
  directly comparable.
- `menu-redesign.html` — the live prototype the proposed shots were taken from.
  Open it in a browser: pointer hover, arrow keys, Enter, and the Gamepad API all
  drive the same cursor across mission rows, shop cards, specialization choices,
  and exit actions. Affordability states and the specialization confirmation can
  therefore be driven rather than described.

The prototype uses the game's own palette (`src/game/scenes/MissionHubScene.ts`
`COLOR`, plus the scene text colours), copy, realm tiles, encounter sprites, and
HUD icons. It is still plain HTML — a drawing of the screens, not a second
implementation of them.
