/**
 * Top-bar geometry for the dynamic per-player HUD panels (issues #96/#106).
 *
 * The HUD used to draw four fixed panels and fill the three empty ones with
 * dimmed JOIN placeholders. In a game that is solo-only until M3 that spent
 * three quarters of a 960px bar advertising a mode that does not exist, and
 * squeezed the objective ribbon underneath it.
 *
 * Panels derive from the live joined count: the bar reflows on explicit join
 * and drop-out, and whoever is playing gets the whole of it. Kept out of `HudScene` so
 * the arithmetic is testable without Phaser (the `hubCopy` precedent) — the
 * scene asks where the panels go and draws them.
 */

/** Local co-op ceiling, matching the four authored level spawn slots. */
export const MAX_PLAYERS = 4;

/**
 * The width the panel's contents were authored against. Layout scales by
 * redistributing that design across the real width rather than restretching
 * it, so a four-player bar reproduces the original geometry exactly.
 */
export const BASE_PANEL_W = 225;

const PANEL_GAP = 8;
/** Clear space either side of the bar, matching the old four-panel inset. */
const BAR_MARGIN = 18;

/**
 * Ceiling on how far a panel grows for a small party.
 *
 * Letting one player take the whole 924px bar was tried and looks worse than
 * the problem: the panel's three clusters end up marooned at either end with a
 * field of empty frame between them, which reads as broken rather than roomy.
 * Roughly double the authored width keeps the readout dense and unmistakably
 * the player's, and leaves clean background either side instead of dead
 * furniture. This is a presentation judgement, not a constraint — it is the one
 * number to turn if the bar should feel wider.
 */
const MAX_PANEL_W = 440;

export interface PanelLayout {
  /** Width of every panel; they are equal so no player's readout is favoured. */
  width: number;
  /** Left edge of each panel in screen px, in slot order. */
  xs: number[];
  gap: number;
}

/**
 * Where the panels sit for a given player count.
 *
 * Every panel is the same width and the row is centred, so one player fills the
 * bar and four split it. At four on a 960px screen this returns exactly the
 * geometry the fixed layout used to hardcode, which is what makes the change
 * invisible to a co-op build.
 */
export function panelLayout(playerCount: number, screenWidth: number): PanelLayout {
  const count = Math.max(1, Math.min(MAX_PLAYERS, Math.floor(playerCount) || 1));
  const bar = Math.max(BASE_PANEL_W, screenWidth - BAR_MARGIN * 2);
  const width = Math.min(MAX_PANEL_W, Math.floor((bar - (count - 1) * PANEL_GAP) / count));
  const used = count * width + (count - 1) * PANEL_GAP;
  const left = Math.round((screenWidth - used) / 2);
  return {
    width,
    gap: PANEL_GAP,
    xs: Array.from({ length: count }, (_, i) => left + i * (width + PANEL_GAP))
  };
}

/**
 * How far an element authored at `BASE_PANEL_W` moves when the panel is wider.
 *
 * The panel has three clusters — identity on the left, tallies in the middle,
 * meters on the right — and widening it should spread them apart rather than
 * leave everything huddled at the left edge with dead space beside it. At the
 * authored width every offset is zero, so the original design is preserved
 * exactly.
 */
export function anchorOffset(anchor: 'left' | 'center' | 'right', panelWidth: number): number {
  const slack = panelWidth - BASE_PANEL_W;
  if (anchor === 'left') return 0;
  return anchor === 'center' ? slack / 2 : slack;
}
