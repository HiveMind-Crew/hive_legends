/**
 * Compact screen-space HUD geometry (issues #96/#106/#144).
 *
 * The gameplay canvas is always authored at 960x720 and Phaser FIT-scales that
 * complete canvas for the browser viewport.  Keeping these coordinates pure
 * makes the important contract testable: even with four players, the HUD must
 * leave a broad, uninterrupted view through the middle of the battlefield.
 */

/** Local co-op ceiling, matching the four authored level spawn slots. */
export const MAX_PLAYERS = 4;

/** Fixed logical canvas dimensions declared in `src/main.ts`. */
export const HUD_DESIGN_WIDTH = 960;
export const HUD_DESIGN_HEIGHT = 720;

/** Compact panel dimensions. Content in HudScene is authored to this box. */
export const HUD_PANEL_WIDTH = 212;
export const HUD_PANEL_HEIGHT = 42;

/** The conditional objective plate in the clear centre lane. */
export const HUD_STATUS_WIDTH = 300;
export const HUD_STATUS_HEIGHT = 20;
/** Finale bar width; it must fit in the same unobstructed centre lane. */
export const HUD_BOSS_STATUS_WIDTH = 460;

const EDGE_MARGIN = 10;
const PANEL_TOP = 6;
const ROW_GAP = 6;

export interface PanelPlacement {
  x: number;
  y: number;
}

export interface PanelLayout {
  width: number;
  height: number;
  placements: PanelPlacement[];
  /** Horizontal gameplay lane between the two HUD columns. */
  centerClearWidth: number;
  /** Conservative geometric area covered by player panels. */
  panelArea: number;
}

/**
 * Place joined slots into shallow stacks at the upper-left and upper-right.
 *
 * Alternating sides keeps P1/P2 on the first row and P3/P4 on the second. In
 * contrast to a full-width bar, the objective and the action directly beneath
 * it remain readable at every party size. Slot identity is carried by the
 * panel itself, so a reflow never changes who owns a readout.
 */
export function panelLayout(playerCount: number, screenWidth: number): PanelLayout {
  const count = Math.max(1, Math.min(MAX_PLAYERS, Math.floor(playerCount) || 1));
  // The game always supplies 960 here. The clamp prevents accidental overlap
  // if the helper is exercised with a narrower logical canvas in isolation.
  const width = Math.min(HUD_PANEL_WIDTH, Math.max(1, Math.floor((screenWidth - EDGE_MARGIN * 2) / 2)));
  const left = EDGE_MARGIN;
  const right = screenWidth - EDGE_MARGIN - width;
  const placements = Array.from({ length: count }, (_, index) => ({
    x: index % 2 === 0 ? left : right,
    y: PANEL_TOP + Math.floor(index / 2) * (HUD_PANEL_HEIGHT + ROW_GAP)
  }));

  return {
    width,
    height: HUD_PANEL_HEIGHT,
    placements,
    centerClearWidth: Math.max(0, right - (left + width)),
    panelArea: count * width * HUD_PANEL_HEIGHT
  };
}

export interface HudObstruction {
  /** Panels plus the normal objective plate, treating translucent pixels as opaque. */
  area: number;
  fraction: number;
  centerClearWidth: number;
  deepestPanelEdge: number;
}

/**
 * Worst-case normal-mission obstruction contract.
 *
 * The objective plate is included even though it is conditional, and panel
 * translucency is ignored, so this intentionally overstates actual coverage.
 * The boss presentation occupies less solid area than that plate.
 */
export function hudObstruction(
  playerCount: number,
  screenWidth = HUD_DESIGN_WIDTH,
  screenHeight = HUD_DESIGN_HEIGHT
): HudObstruction {
  const layout = panelLayout(playerCount, screenWidth);
  const area = layout.panelArea + HUD_STATUS_WIDTH * HUD_STATUS_HEIGHT;
  const deepestPanelEdge = Math.max(...layout.placements.map(({ y }) => y + layout.height));
  return {
    area,
    fraction: area / (screenWidth * screenHeight),
    centerClearWidth: layout.centerClearWidth,
    deepestPanelEdge
  };
}

/** CSS size of the fixed canvas under Phaser's aspect-preserving FIT mode. */
export function fittedCanvasSize(viewportWidth: number, viewportHeight: number): { width: number; height: number } {
  const scale = Math.min(viewportWidth / HUD_DESIGN_WIDTH, viewportHeight / HUD_DESIGN_HEIGHT);
  return { width: HUD_DESIGN_WIDTH * scale, height: HUD_DESIGN_HEIGHT * scale };
}
