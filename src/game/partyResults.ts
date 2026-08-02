export interface PartyResultPlayer {
  slot: number;
  heroId: string;
  gold: number;
  kills: number;
  /** Unique XP sources secured by this slot, not shared level-up XP copies. */
  xp: number;
}

export interface PartyResultTotals {
  gold: number;
  kills: number;
  xp: number;
}

/** Sanitize and sum joined-ever contributions exactly once. */
export function partyResultTotals(players: readonly PartyResultPlayer[]): PartyResultTotals {
  return players.reduce(
    (totals, player) => ({
      gold: totals.gold + Math.max(0, Math.floor(player.gold)),
      kills: totals.kills + Math.max(0, Math.floor(player.kills)),
      xp: totals.xp + Math.max(0, Math.floor(player.xp))
    }),
    { gold: 0, kills: 0, xp: 0 }
  );
}

/** Stable two-column results copy; identity remains the player's local slot. */
export function partyResultLines(players: readonly PartyResultPlayer[]): string[] {
  const rows = [...players]
    .sort((a, b) => a.slot - b.slot)
    .map((p) => `P${p.slot + 1}  ${Math.max(0, Math.floor(p.gold))}g  ${Math.max(0, Math.floor(p.kills))} kills  ${Math.max(0, Math.floor(p.xp))} XP`);
  const lines: string[] = [];
  for (let i = 0; i < rows.length; i += 2) lines.push([rows[i], rows[i + 1]].filter(Boolean).join('        '));
  return lines;
}
