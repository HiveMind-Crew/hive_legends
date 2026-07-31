/**
 * Player-facing copy for the arcade continue (issue #99).
 *
 * Kept out of the scenes and free of Phaser so the wording is testable (the
 * `hubCopy` / `clearTimes` precedent). The prompt has to say three things in
 * the two seconds a player spends reading it: that they can stand up, what it
 * costs, and how long they have to decide.
 */

/** Seconds the prompt stays up before it decides for you. */
export const CONTINUE_SECONDS = 10;

/**
 * Seconds the same prompt stays up when the bank cannot cover it. There is
 * nothing to decide, so it is a beat of explanation rather than a countdown.
 */
export const DECLINED_SECONDS = 3;

export interface ContinueOffer {
  /** Gold price of this continue. */
  cost: number;
  /** Gold in the bank when the hero fell. */
  bank: number;
  /** Continues already spent this run. */
  used: number;
}

/**
 * Whether this offer can actually be taken. One predicate, used by the copy,
 * by the prompt's clock, and by the scene deciding what a keypress means —
 * five copies of `bank >= cost` is five chances to disagree.
 */
export function canTakeOffer(offer: ContinueOffer): boolean {
  return offer.bank >= offer.cost;
}

/** The headline: an offer, or the reason there isn't one. */
export function continueTitleCopy(offer: ContinueOffer): string {
  return canTakeOffer(offer) ? 'CONTINUE?' : 'THE HIVE PREVAILS';
}

/**
 * The offer line. A player who cannot pay is told the price *and* what they
 * have, because "not enough gold" without the numbers reads as a bug.
 */
export function continueOfferCopy(offer: ContinueOffer): string {
  if (!canTakeOffer(offer)) {
    return `Stand up: ${offer.cost} gold — you have ${offer.bank}`;
  }
  const again = offer.used > 0 ? ` (continue ${offer.used + 1})` : '';
  return `Stand up for ${offer.cost} gold${again} — bank ${offer.bank}`;
}

/** The prompt's action line, or the fall-through when it cannot be taken. */
export function continueActionCopy(offer: ContinueOffer, secondsLeft: number): string {
  if (!canTakeOffer(offer)) return 'ESC — to the results';
  return `ENTER / (A) — continue  ·  ESC / (B) — give up  ·  ${Math.max(0, Math.ceil(secondsLeft))}`;
}

/** Results-screen line naming what continues cost this run; empty when none. */
export function continuesSpentCopy(used: number, goldSpent: number): string {
  if (used <= 0) return '';
  return `Continues: ${used} (−${goldSpent} gold, no clear record)`;
}
