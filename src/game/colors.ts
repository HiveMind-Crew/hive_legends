/**
 * Fixed per-player accent colors (P1 blue, P2 crimson, P3 emerald, P4 violet).
 * Shared by world rendering (underglow ring, facing chevron) and the HUD so a
 * player's identity is the same color everywhere. See docs/design/visual-direction.md.
 */
export const PLAYER_ACCENTS = [0x5a8fd9, 0xe0524d, 0x58c98a, 0xb07fe6] as const;

export function playerAccent(index: number): number {
  return PLAYER_ACCENTS[index % PLAYER_ACCENTS.length] ?? PLAYER_ACCENTS[0];
}
