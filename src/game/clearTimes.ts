import type { ClearTimeResult } from '../meta/save';

/**
 * Player-facing copy for clear times (issue #100).
 *
 * Three screens show a record — the wheel footer, results, and the hero-select
 * profile summary — so the formatting lives here rather than in any one of
 * them, and is testable without Phaser (the `hubCopy` precedent).
 *
 * Ticks are the sim's only clock (60 Hz, fixed step), so every duration in the
 * game converts here and nowhere else.
 */

const TICKS_PER_SECOND = 60;

/** A run duration as `M:SS.s`, or `SS.s` under a minute. */
export function formatClearTime(ticks: number): string {
  const seconds = Math.max(0, ticks) / TICKS_PER_SECOND;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
}

/** Wheel-footer fragment for a level's record; empty when there is none yet. */
export function bestClearCopy(ticks: number | null): string {
  return ticks === null ? '' : `Best ${formatClearTime(ticks)}`;
}

/**
 * The results line for a finished run. A beaten record is the celebration and
 * names what it beat; a first clear states the time it set without pretending
 * there was something to beat.
 */
export function clearTimeCopy(result: ClearTimeResult): string {
  if (result.improved && result.previous !== null) {
    return `★ NEW BEST ${formatClearTime(result.best)}  (was ${formatClearTime(result.previous)})`;
  }
  if (result.previous === null) return `Record set: ${formatClearTime(result.best)}`;
  return `Best ${formatClearTime(result.best)}`;
}
