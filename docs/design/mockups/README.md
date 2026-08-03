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
  Open it in a browser: pointer hover, arrow keys, Enter, number keys `1`–`5`,
  and the Gamepad API all drive the same cursor across mission rows, shop cards,
  specialization choices, and exit actions. Affordability states and the
  specialization confirmation can therefore be driven rather than described.

Two rules the prototype is meant to demonstrate, and which broke once already:

- **A re-render must hand the cursor back.** Buying anything rebuilds the shop
  and fork markup, destroying the focused button. Because key input is bound to
  the stage, letting focus fall to `<body>` silently kills keyboard and pad
  control for the rest of the session, so every state change re-renders with
  `renderResults(true)`.
- **The confirmation is modal for every input.** Keyboard, pointer and pad all
  reach the dialog's two buttons and nothing underneath it, and the safe option
  holds focus when it opens.

The prototype uses the game's own palette (`src/game/scenes/MissionHubScene.ts`
`COLOR`, plus the scene text colours), copy, realm tiles, encounter sprites, and
HUD icons. It is still plain HTML — a drawing of the screens, not a second
implementation of them.

The `proposed-*.png` stills are captures of this file at the native 960×720. If
you change the prototype, recapture them, or the two stop agreeing.
