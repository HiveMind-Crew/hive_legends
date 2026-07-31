import { describe, expect, it } from 'vitest';
import { bestClearCopy, clearTimeCopy, formatClearTime } from '../src/game/clearTimes';
import { defaultProfile, recordClearTicks } from '../src/meta/save';

/**
 * Clear-time copy (issue #100). Three screens render a record, so the wording
 * is shared and tested here rather than in any one scene. The distinction that
 * matters to the player is celebration versus statement: a beaten record is the
 * only thing on the results screen that rewards a replay, and a first clear
 * must not claim to have beaten anything.
 */
describe('clear-time formatting', () => {
  it('reads as seconds for a normal realm clear', () => {
    expect(formatClearTime(1574)).toBe('26.2s'); // the e2e bot's reference Warrens clear
    expect(formatClearTime(60)).toBe('1.0s');
  });

  it('rolls over to minutes so a long run stays readable', () => {
    expect(formatClearTime(60 * 60)).toBe('1:00.0');
    expect(formatClearTime(60 * 95)).toBe('1:35.0');
    expect(formatClearTime(60 * 605)).toBe('10:05.0');
  });

  it('never renders a negative duration', () => {
    expect(formatClearTime(-1)).toBe('0.0s');
  });
});

describe('record copy', () => {
  it('says nothing for a realm with no record yet', () => {
    expect(bestClearCopy(null)).toBe('');
    expect(bestClearCopy(1574)).toContain('26.2s');
  });

  it('celebrates a beaten record and names what it beat', () => {
    const profile = defaultProfile();
    recordClearTicks(profile, 'brood-warrens', 1574);
    const line = clearTimeCopy(recordClearTicks(profile, 'brood-warrens', 1200));
    expect(line).toContain('NEW BEST');
    expect(line, 'the new record').toContain('20.0s');
    expect(line, 'the record it beat').toContain('26.2s');
  });

  it('states a first clear without claiming a record was beaten', () => {
    const profile = defaultProfile();
    const line = clearTimeCopy(recordClearTicks(profile, 'brood-warrens', 1574));
    expect(line).not.toContain('NEW BEST');
    expect(line).toContain('26.2s');
  });

  it('reports the standing record when a run misses it', () => {
    const profile = defaultProfile();
    recordClearTicks(profile, 'brood-warrens', 1200);
    const line = clearTimeCopy(recordClearTicks(profile, 'brood-warrens', 1574));
    expect(line).not.toContain('NEW BEST');
    expect(line, 'shows the record, not the slower run just played').toContain('20.0s');
  });
});
