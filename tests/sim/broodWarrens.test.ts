import { describe, expect, it } from 'vitest';
import { BROOD_WARRENS, CONTENT } from '../../src/content';
import { circleHitsWall, tileCenter } from '../../src/sim/level';
import { measureLevelPacing } from '../../src/sim/levelMetrics';
import { createSim, effectiveGeneratorMaxAlive, hashState, simTick, type Sim } from '../../src/sim/sim';
import { EMPTY_INPUT, type SimEvent } from '../../src/sim/types';

describe('The Brood Warrens west-to-east expansion (#149)', () => {
  it('meets the authored geometry, route, exit-leg, and pinch budgets', () => {
    const metrics = measureLevelPacing(BROOD_WARRENS);
    expect([metrics.widthTiles, metrics.heightTiles]).toEqual([46, 30]);
    expect(metrics.criticalPathDistanceTiles).toBeGreaterThanOrEqual(95);
    expect(metrics.criticalPathDistanceTiles).toBeLessThanOrEqual(115);
    expect(metrics.finalObjectiveToExitTiles).toBeGreaterThanOrEqual(4);
    expect(metrics.finalObjectiveToExitTiles).toBeLessThanOrEqual(8);
    expect(metrics.minCriticalCorridorWidthTiles).toBeGreaterThanOrEqual(3);
    expect(BROOD_WARRENS.previewExit).toBe(true);
    expect(metrics.objectiveOrder).toEqual([
      'west-brood-node',
      'husk-gallery-mound',
      'breach-brood-node',
      'east-spitter-nest'
    ]);
  });

  it('uses five-tile thresholds and strictly eastward objective reveals', () => {
    for (const [tx, minTy, maxTy] of [
      [13, 4, 8],
      [24, 20, 24],
      [34, 4, 8]
    ] as const) {
      const opening = BROOD_WARRENS.walls
        .map((row, ty) => ({ tile: row[tx], ty }))
        .filter(({ tile }) => tile === '.')
        .map(({ ty }) => ty);
      expect(opening).toEqual(Array.from({ length: maxTy - minTy + 1 }, (_, index) => minTy + index));
    }
    const objectiveXs = BROOD_WARRENS.generators.map((generator) => generator.tx);
    expect(objectiveXs).toEqual([...objectiveXs].sort((a, b) => a - b));
    expect(BROOD_WARRENS.exit.tx).toBeGreaterThan(objectiveXs.at(-1)!);
    expect(Math.min(...BROOD_WARRENS.playerSpawns.map((spawn) => spawn.tx))).toBeLessThan(objectiveXs[0]!);
  });

  it('gives both optional reward branches an open west split and farther-east rejoin', () => {
    for (const { ty, minTx, maxTx } of [
      { ty: 14, minTx: 17, maxTx: 21 },
      { ty: 15, minTx: 28, maxTx: 30 }
    ]) {
      const branch = BROOD_WARRENS.walls[ty]!.slice(minTx - 1, maxTx + 2);
      expect(branch).toBe('.'.repeat(maxTx - minTx + 3));
    }
    expect(BROOD_WARRENS.gates).toEqual([{ tx: 19, ty: 13 }]);
    expect(BROOD_WARRENS.secrets).toEqual([{ tx: 29, ty: 14 }]);
    expect(BROOD_WARRENS.pickups).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'gold', amount: 40, tx: 19, ty: 12 }),
      expect.objectContaining({ kind: 'gold', amount: 50, tx: 29, ty: 13 })
    ]));
  });

  it('authors one dependency chain and activates no more than its current objective', () => {
    expect(BROOD_WARRENS.encounters?.map((encounter) => [encounter.id, encounter.requires ?? []])).toEqual([
      ['west-brood', []],
      ['husk-gallery', ['west-brood']],
      ['brood-breach', ['husk-gallery']],
      ['spitter-finale', ['brood-breach']]
    ]);

    const run = (sim: Sim): SimEvent[] => {
      const events: SimEvent[] = [];
      expect(sim.state.generators.filter((generator) => generator.active)).toHaveLength(0);
      for (const encounter of BROOD_WARRENS.encounters ?? []) {
        const trigger = encounter.trigger;
        const tile = trigger.kind === 'region'
          ? { tx: trigger.minTx, ty: trigger.minTy }
          : { tx: trigger.tx, ty: trigger.ty };
        sim.state.players[0]!.pos = tileCenter(BROOD_WARRENS, tile.tx, tile.ty);
        const activation = simTick(sim, [EMPTY_INPUT]);
        events.push(...activation);
        expect(activation).toContainEqual(expect.objectContaining({
          type: 'encounter-activated',
          encounterId: encounter.id
        }));
        const active = sim.state.generators.filter((generator) => generator.active);
        expect(active).toHaveLength(1);
        expect(active[0]!.encounterId).toBe(encounter.id);
        sim.state.generators = sim.state.generators.filter((generator) => generator.encounterId !== encounter.id);
        const cleared = simTick(sim, [EMPTY_INPUT]);
        events.push(...cleared);
        expect(cleared).toContainEqual(expect.objectContaining({
          type: 'encounter-cleared',
          encounterId: encounter.id
        }));
      }
      return events;
    };

    const a = createSim({ seed: 149, level: BROOD_WARRENS, players: [{ heroId: 'vanguard' }], content: CONTENT });
    const b = createSim({ seed: 149, level: BROOD_WARRENS, players: [{ heroId: 'vanguard' }], content: CONTENT });
    expect(run(a)).toEqual(run(b));
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(a.state.phase).toBe('exit-open');
  });

  it('keeps each staged four-player encounter at or below the hostile ceiling', () => {
    for (const generator of BROOD_WARRENS.generators) {
      expect(effectiveGeneratorMaxAlive(CONTENT.generators[generator.typeId]!, 4), generator.id).toBeLessThanOrEqual(15);
    }
  });

  it('gives every hero collision-safe approaches to each mandatory objective', () => {
    const maxHeroRadius = Math.max(...Object.values(CONTENT.heroes).map((hero) => hero.radius));
    for (const generator of BROOD_WARRENS.generators) {
      const approaches = [
        { tx: generator.tx - 1, ty: generator.ty },
        { tx: generator.tx + 1, ty: generator.ty },
        { tx: generator.tx, ty: generator.ty - 1 },
        { tx: generator.tx, ty: generator.ty + 1 }
      ].filter((tile) => !circleHitsWall(BROOD_WARRENS, tileCenter(BROOD_WARRENS, tile.tx, tile.ty), maxHeroRadius));
      expect(approaches.length, generator.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('places recovery after the Husk peak and the potion before the finale threshold', () => {
    const husk = BROOD_WARRENS.generators.find((generator) => generator.typeId === 'husk-mound')!;
    const health = BROOD_WARRENS.pickups.find((pickup) => pickup.kind === 'health' && pickup.tx > husk.tx)!;
    const finale = (BROOD_WARRENS.encounters ?? []).find((encounter) => encounter.id === 'spitter-finale')!;
    const potion = BROOD_WARRENS.pickups.find((pickup) => pickup.kind === 'potion')!;
    expect(health.tx).toBeGreaterThan(husk.tx);
    expect(finale.trigger.kind).toBe('region');
    if (finale.trigger.kind === 'region') expect(potion.tx).toBeLessThan(finale.trigger.minTx);
  });
});
