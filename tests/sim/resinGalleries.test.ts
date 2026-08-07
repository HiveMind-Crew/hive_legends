import { describe, expect, it } from 'vitest';
import { CONTENT, RESIN_GALLERIES } from '../../src/content';
import { circleHitsWall, tileCenter } from '../../src/sim/level';
import { measureLevelPacing } from '../../src/sim/levelMetrics';
import { createSim, effectiveGeneratorMaxAlive, hashState, simTick, type Sim } from '../../src/sim/sim';
import { EMPTY_INPUT, type SimEvent } from '../../src/sim/types';

describe('The Resin Galleries south-to-north expansion (#150)', () => {
  it('meets the authored size, route, portal-leg, and co-op pinch budgets', () => {
    const metrics = measureLevelPacing(RESIN_GALLERIES);
    expect([metrics.widthTiles, metrics.heightTiles]).toEqual([42, 42]);
    expect(metrics.criticalPathDistanceTiles).toBeGreaterThanOrEqual(115);
    expect(metrics.criticalPathDistanceTiles).toBeLessThanOrEqual(145);
    expect(metrics.finalObjectiveToExitTiles).toBeGreaterThanOrEqual(4);
    expect(metrics.finalObjectiveToExitTiles).toBeLessThanOrEqual(8);
    expect(metrics.minCriticalCorridorWidthTiles).toBeGreaterThanOrEqual(3);
    expect(metrics.objectiveOrder).toEqual([
      'lower-brood-basin',
      'husk-kiln-mound',
      'upper-west-brood',
      'crown-brood-node'
    ]);
    expect(RESIN_GALLERIES.previewExit).toBe(true);
  });

  it('keeps every mandatory reveal north of the previous stage', () => {
    const spawnY = Math.min(...RESIN_GALLERIES.playerSpawns.map((spawn) => spawn.ty));
    const objectiveYs = RESIN_GALLERIES.generators.map((generator) => generator.ty);
    expect(spawnY).toBeGreaterThan(objectiveYs[0]!);
    for (let index = 1; index < objectiveYs.length; index++) {
      expect(objectiveYs[index]!).toBeLessThan(objectiveYs[index - 1]!);
    }
    expect(RESIN_GALLERIES.exit.ty).toBeLessThan(objectiveYs.at(-1)!);
  });

  it('authors three Brood Nodes and one Husk Mound in one deterministic dependency chain', () => {
    expect(RESIN_GALLERIES.generators.map((generator) => generator.typeId)).toEqual([
      'brood-node',
      'husk-mound',
      'brood-node',
      'brood-node'
    ]);
    expect(RESIN_GALLERIES.encounters?.map((encounter) => [encounter.id, encounter.requires ?? []])).toEqual([
      ['lower-basin', []],
      ['husk-kiln', ['lower-basin']],
      ['upper-west', ['husk-kiln']],
      ['crown-brood', ['upper-west']]
    ]);

    const run = (sim: Sim): SimEvent[] => {
      const events: SimEvent[] = [];
      expect(sim.state.generators.filter((generator) => generator.active)).toHaveLength(0);
      for (const encounter of RESIN_GALLERIES.encounters ?? []) {
        const trigger = encounter.trigger;
        const tile = trigger.kind === 'region'
          ? { tx: trigger.minTx, ty: trigger.minTy }
          : { tx: trigger.tx, ty: trigger.ty };
        sim.state.players[0]!.pos = tileCenter(RESIN_GALLERIES, tile.tx, tile.ty);
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

    const a = createSim({ seed: 150, level: RESIN_GALLERIES, players: [{ heroId: 'vanguard' }], content: CONTENT });
    const b = createSim({ seed: 150, level: RESIN_GALLERIES, players: [{ heroId: 'vanguard' }], content: CONTENT });
    expect(run(a)).toEqual(run(b));
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(a.state.phase).toBe('exit-open');
  });

  it('keeps the west gate and east secret on independent forward-rejoining branches', () => {
    // West branch: east departure at y=22, northward rejoin at y=18.
    expect(RESIN_GALLERIES.walls[22]!.slice(9, 23)).toBe('.'.repeat(14));
    expect(RESIN_GALLERIES.walls.slice(18, 24).every((row) => row[10] === '.')).toBe(true);
    // East branch mirrors it around the central ascent.
    expect(RESIN_GALLERIES.walls.slice(18, 24).every((row) => row[31] === '.')).toBe(true);
    expect(RESIN_GALLERIES.walls[19]!.slice(20, 33)).toBe('.'.repeat(13));
    expect(RESIN_GALLERIES.gates).toEqual([{ tx: 7, ty: 21 }]);
    expect(RESIN_GALLERIES.secrets).toEqual([{ tx: 33, ty: 20 }]);
  });

  it('gives every hero safe objective approaches and at least two three-tile circulation arcs', () => {
    const maxHeroRadius = Math.max(...Object.values(CONTENT.heroes).map((hero) => hero.radius));
    for (const generator of RESIN_GALLERIES.generators) {
      const approaches = [
        { tx: generator.tx - 1, ty: generator.ty },
        { tx: generator.tx + 1, ty: generator.ty },
        { tx: generator.tx, ty: generator.ty - 1 },
        { tx: generator.tx, ty: generator.ty + 1 }
      ].filter((tile) => !circleHitsWall(RESIN_GALLERIES, tileCenter(RESIN_GALLERIES, tile.tx, tile.ty), maxHeroRadius));
      expect(approaches.length, generator.id).toBeGreaterThanOrEqual(3);
    }

    for (const { topRows, bottomRows, minTx, maxTx } of [
      { topRows: [31, 32, 33], bottomRows: [37, 38, 39], minTx: 9, maxTx: 12 },
      { topRows: [22, 23, 24], bottomRows: [27, 28, 29], minTx: 25, maxTx: 32 },
      { topRows: [13, 14, 15], bottomRows: [18, 19, 20], minTx: 11, maxTx: 13 },
      { topRows: [3, 4, 5], bottomRows: [10, 11, 12], minTx: 26, maxTx: 32 }
    ]) {
      for (const row of [...topRows, ...bottomRows]) {
        expect(RESIN_GALLERIES.walls[row]!.slice(minTx, maxTx + 1)).toBe('.'.repeat(maxTx - minTx + 1));
      }
    }
  });

  it('keeps every staged four-player objective at or below the hostile ceiling', () => {
    for (const generator of RESIN_GALLERIES.generators) {
      expect(effectiveGeneratorMaxAlive(CONTENT.generators[generator.typeId]!, 4), generator.id).toBeLessThanOrEqual(15);
    }
  });

  it('places recovery after the Husk kiln and the potion before the crown trigger', () => {
    const husk = RESIN_GALLERIES.generators.find((generator) => generator.typeId === 'husk-mound')!;
    const recovery = RESIN_GALLERIES.pickups.find((pickup) => pickup.kind === 'health' && pickup.ty < husk.ty)!;
    const crown = (RESIN_GALLERIES.encounters ?? []).find((encounter) => encounter.id === 'crown-brood')!;
    const potion = RESIN_GALLERIES.pickups.find((pickup) => pickup.kind === 'potion')!;
    expect(recovery.ty).toBeLessThan(husk.ty);
    expect(crown.trigger.kind).toBe('region');
    if (crown.trigger.kind === 'region') expect(potion.tx).toBeLessThan(crown.trigger.minTx);
  });
});
