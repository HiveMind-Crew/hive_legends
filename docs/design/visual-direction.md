# Visual & feel direction

Updated: 2026-07-24 · Owner: game direction · Tracking issue:
[#10](https://github.com/MeanGreen256/hive_legends/issues/10) (closed — the
nine-issue look & feel track is complete)

**Status:** the systems described here are all built. This document now serves
as the *style contract* for new content and for the original-art track
(#27, #28), not as a work plan.

## Benchmark and gap

The presentation benchmark is the late-90s arcade dungeon brawler (Gauntlet
Legends is the structural reference — **mechanics and feel only; every piece
of expression here must be original**). Compared against that benchmark,
slice 0 is mechanically sound but reads as a diagram: flat single-plane grid,
static circle characters, minimal feedback, text-style HUD, no audio.

What the benchmark does that we must match *in spirit*:

1. **Screens read as places.** Tilted camera, walls with height, dressed and
   lit rooms. Our answer: pseudo-2.5D (raised wall faces, drop shadows,
   y-sorting), deterministic tile variation, decor + glow sprites, vignette.
2. **Characters read as actors.** Directional facing, attack windups, strong
   per-player color identity. Our answer: generated directional sprite sets,
   telegraphs, fixed player accent colors (P1 blue / P2 crimson / P3 emerald /
   P4 violet).
3. **Every hit lands.** Freeze-frames, sparks, numbers, reactive camera,
   chunky audio. Our answer: layered SimEvent-driven effects — hit-stop,
   particles, damage numbers, camera kicks, synthesized SFX.
4. **The HUD is furniture.** Big fixed per-player panels, health as a large
   number, score always visible. Our answer: four class-colored panel slots,
   large counters, ability meter, objective ribbon.
5. **Generators are the show.** Enemies visibly pour out; structures degrade
   and explode spectacularly. Our answer: damage states, spawn telegraphs,
   multi-stage destruction, optional below-50% enrage.
6. **The finale is a set piece.** A boss must read as a different class of
   threat. Our answer (#25): a 96px silhouette using the same damage-tier
   language at larger scale, a swelling red telegraph before every damaging
   action, named on-screen tells, a HUD finale bar that recolours per phase,
   and a multi-stage collapse.

## Style pillars

- **Original hive-fantasy identity**: chitin, resin, spores, amber and violet
  bioluminescence against dark warrens. Never medieval-pastiche of the
  reference game; never its names, maps, characters, or sounds.
- **Generated-first art**: programmer art is produced by code
  (`src/game/textures.ts`) so iteration is a parameter change; real drawn art
  replaces texture keys without touching game code. That path is now proven —
  the Vanguard pack (#44) shipped as PNGs in `public/art/` with no code change.
  New content should still land as generated art first, so it is playable and
  testable before any art exists.
- **Readability beats richness**: silhouette-per-family, palette-per-tier
  (issue #7). If a screenshot with 15+ enemies can't be parsed at a glance,
  the art is wrong, however pretty.
- **Feel is renderer-side**: all juice reacts to `SimEvent`s. The
  deterministic sim contract (ADR 0002) is never bent for presentation.

## Palette anchors

- Warren dark: `#17131f` floor / `#2b2036` wall
- Amber-resin galleries: `#1b1510` floor / `#3d2813` wall / `#c4852d` trapped light
- Hive bioluminescence: violet `#a855c8`, spore green `#9fe06a`
- Treasure/UI warmth: gold `#ffd75e`
- Player accents: `#5a8fd9` / `#e0524d` / `#58c98a` / `#b07fe6`
- Alert/objective: cyan `#64e6ff`

## Audio direction (issue #8 — implemented)

Synthesized, original, chunky. Delivered in `src/game/audio.ts`: every sound
is generated with WebAudio (no sampled or copied assets), driven from
`SimEvent`s with per-sound throttling so hordes never clip. A procedural
ambient-combat loop (E-minor bassline + pad + off-beat hat, lookahead
scheduler) runs underneath and ducks on mission end. "The Herald" is an
original announcer system — a queued on-screen ribbon in the HUD scene — for
low-health, exit-opened, elite-arrival, and mission-end states; voice
synthesis can replace the text later without changing the trigger/queue.

The engine never creates an `AudioContext` before a user gesture (autoplay
policy) and no-ops cleanly when WebAudio is unavailable, so headless e2e runs
stay silent and error-free. Master volume + mute persist to the profile and
are controlled from the shared settings screen.

## Roadmap

Phases and acceptance criteria live in issue #10 (A: depth + juice → B:
characters + threats → C: HUD, audio, environment, menus). Each lands only
with the full verification suite green, including the e2e playthrough.
