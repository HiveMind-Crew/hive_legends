import { describe, expect, it } from 'vitest';
import { benchmarkMireveilRoster } from '../../scripts/mireveilBenchmark';
import { CONTENT } from '../../src/content';

describe('Mireveil base-kit benchmark (#104)', () => {
  it('pins every exact per-hero TTK and remains survivable', () => {
    const results = benchmarkMireveilRoster(CONTENT);
    expect(results.map(({ heroId, ticks }) => ({ heroId, ticks }))).toEqual([
      { heroId: 'vanguard', ticks: 769 },
      { heroId: 'arcanist', ticks: 1255 },
      { heroId: 'ranger', ticks: 1363 },
      { heroId: 'sentinel', ticks: 1343 }
    ]);
    expect(results.every((result) => result.hpRemaining > 0)).toBe(true);
  });

  it('keeps the fastest-to-slowest spread below 1.8x', () => {
    const ticks = benchmarkMireveilRoster(CONTENT).map((result) => result.ticks);
    // Base sustained DPS still spans 1.6x from the Ranger to the defensive
    // Sentinel. The 1.8 encounter bound allows only 12.5% more matchup
    // overhead on top of that deliberate archetype gap.
    expect(Math.max(...ticks) / Math.min(...ticks)).toBeLessThan(1.8);
  });

  it('replays identically from the fixed seed', () => {
    expect(benchmarkMireveilRoster(CONTENT)).toEqual(benchmarkMireveilRoster(CONTENT));
  });
});
