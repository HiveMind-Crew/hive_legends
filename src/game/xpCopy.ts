import type { XpBankResult } from '../meta/save';

/**
 * Player-facing copy for hero level and banked XP (issue #103).
 *
 * The cap used to be invisible: the HUD kept printing `Lv 10` and results kept
 * printing an XP total that bought nothing. Two screens show the same two
 * facts — the level, and what this run's XP did with it — so the wording lives
 * here rather than in either scene, and is testable without Phaser (the
 * `hubCopy` / `clearTimes` precedent).
 */

/** HUD level chip. A capped hero says so rather than looking mid-curve. */
export function heroLevelCopy(level: number, atCap: boolean): string {
  return atCap ? `Lv ${level} MAX` : `Lv ${level}`;
}

/**
 * The results line for a run's XP.
 *
 * Three cases, and the difference between them is the whole point of the issue:
 * levelling normally, capped mid-run (some XP levelled, the rest paid out), and
 * capped throughout (the run's XP was pure dividend).
 */
export function xpResultCopy(earned: number, result: XpBankResult): string {
  const level = `Hero level: ${result.level}${result.atCap ? ' (MAX)' : ''}`;
  // A dividend rounded down to nothing is not worth a clause; the MAX tag has
  // already told the player why the level did not move.
  if (!result.atCap || result.overflow <= 0 || result.gold <= 0) return `XP earned: ${earned}    ${level}`;
  if (result.applied > 0) {
    return `XP earned: ${earned} (${result.applied} to level, ${result.overflow} → ${result.gold}g)    ${level}`;
  }
  return `XP earned: ${earned} → ${result.gold}g veteran's dividend    ${level}`;
}
