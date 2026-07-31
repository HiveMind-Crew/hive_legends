import { describe, expect, it } from 'vitest';
import {
  continueActionCopy,
  continueOfferCopy,
  continuesSpentCopy,
  continueTitleCopy,
  type ContinueOffer
} from '../src/game/continueCopy';

/**
 * Continue-prompt wording (issue #99). The prompt is on a clock, so every line
 * has to be readable in about a second — and a player who cannot afford it
 * must be told *why*, not just refused.
 */
function offer(partial: Partial<ContinueOffer> = {}): ContinueOffer {
  return { cost: 150, bank: 500, used: 0, ...partial };
}

describe('the continue prompt', () => {
  it('offers the continue when the bank covers it', () => {
    expect(continueTitleCopy(offer())).toBe('CONTINUE?');
    expect(continueOfferCopy(offer())).toBe('Stand up for 150 gold — bank 500');
  });

  it('numbers a repeat continue, so the escalating price reads as deliberate', () => {
    expect(continueOfferCopy(offer({ cost: 300, used: 1 }))).toBe(
      'Stand up for 300 gold (continue 2) — bank 500'
    );
  });

  it('states the shortfall rather than silently refusing', () => {
    const broke = offer({ bank: 40 });
    expect(continueTitleCopy(broke)).toBe('THE HIVE PREVAILS');
    expect(continueOfferCopy(broke)).toBe('Stand up: 150 gold — you have 40');
    expect(continueActionCopy(broke, 3)).toBe('ESC — to the results');
  });

  it('counts the clock down in whole seconds, and never past zero', () => {
    expect(continueActionCopy(offer(), 9.2)).toContain('10');
    expect(continueActionCopy(offer(), 1)).toContain('1');
    expect(continueActionCopy(offer(), -0.4)).toContain('0');
    expect(continueActionCopy(offer(), 5)).toContain('ENTER — continue');
  });
});

describe('the results line', () => {
  it('says nothing about continues on a run that used none', () => {
    expect(continuesSpentCopy(0, 0)).toBe('');
  });

  it('names the count, the gold, and the record it cost', () => {
    expect(continuesSpentCopy(2, 450)).toBe('Continues: 2 (−450 gold, no clear record)');
  });
});
