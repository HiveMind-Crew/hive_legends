import { describe, expect, it } from 'vitest';
import { BROOD_WARRENS, CONTENT, HOLLOW_THRONE } from '../../src/content';
import { validateLevel } from '../../src/sim/level';
import { createSim, hashState, simTick } from '../../src/sim/sim';
import { EMPTY_INPUT, type InputCommand, type LevelDef } from '../../src/sim/types';

const STAGED_LEVEL: LevelDef = {
  ...BROOD_WARRENS,
  id: 'staged-test',
  playerSpawns: [{ tx: 1, ty: 5 }],
  generators: [
    { id: 'opening-node', typeId: 'brood-node', tx: 2, ty: 5, encounterId: 'opening' },
    { id: 'deep-node', typeId: 'husk-mound', tx: 24, ty: 15, encounterId: 'depths' }
  ],
  encounters: [
    { id: 'opening', trigger: { kind: 'radius', tx: 1, ty: 5, radiusTiles: 1 } },
    {
      id: 'depths',
      requires: ['opening'],
      trigger: { kind: 'region', minTx: 23, minTy: 14, maxTx: 25, maxTy: 16 }
    }
  ],
  pickups: [],
  props: [],
  gates: [],
  secrets: [],
  decor: [],
  boss: undefined,
  exit: { tx: 3, ty: 20 }
};

function stagedSim(seed = 9) {
  return createSim({ seed, level: STAGED_LEVEL, players: [{ heroId: 'vanguard' }], content: CONTENT });
}

function input(partial: Partial<InputCommand>): InputCommand {
  return { ...EMPTY_INPUT, ...partial };
}

describe('staged encounters', () => {
  it('keeps later objectives dormant until dependencies clear and their trigger is entered', () => {
    const sim = stagedSim();
    const [opening, depths] = sim.state.generators;
    expect(opening?.active).toBe(false);
    expect(depths?.active).toBe(false);

    const wake = simTick(sim, [EMPTY_INPUT]);
    expect(wake).toContainEqual({ type: 'encounter-activated', encounterId: 'opening', tick: 0 });
    expect(opening?.active).toBe(true);
    expect(depths?.active).toBe(false);
    expect(depths?.spawnCooldown).toBe(30);

    opening!.hp = 1;
    const cleared = simTick(sim, [input({ moveX: 1, attack: true })]);
    expect(cleared).toContainEqual(expect.objectContaining({ type: 'generator-destroyed', objectiveId: 'opening-node' }));
    expect(cleared).toContainEqual({ type: 'encounter-cleared', encounterId: 'opening', tick: 1 });
    expect(sim.state.generatorClearOrder).toEqual(['opening-node']);
    expect(depths?.active).toBe(false);

    sim.state.players[0]!.pos = { ...depths!.pos };
    const deepWake = simTick(sim, [EMPTY_INPUT]);
    expect(deepWake).toContainEqual({ type: 'encounter-activated', encounterId: 'depths', tick: 2 });
    expect(depths?.active).toBe(true);
    expect(depths?.spawnCooldown).toBe(29);
  });

  it('keeps staged state and event edges deterministic', () => {
    const a = stagedSim(42);
    const b = stagedSim(42);
    const aEvents = simTick(a, [EMPTY_INPUT]);
    const bEvents = simTick(b, [EMPTY_INPUT]);
    expect(aEvents).toEqual(bEvents);
    expect(hashState(a.state)).toBe(hashState(b.state));
  });

  it('preserves start-active behavior when encounter metadata is absent', () => {
    const legacy = createSim({ seed: 1, level: BROOD_WARRENS, players: [{ heroId: 'vanguard' }], content: CONTENT });
    expect(legacy.state.encounters).toEqual([]);
    expect(legacy.state.generators.every((generator) => generator.active)).toBe(true);
    simTick(legacy, [EMPTY_INPUT]);
    expect(legacy.state.generators.every((generator) => generator.spawnCooldown === 29)).toBe(true);
  });

  it('keeps an encounter boss idle and objective-blocking until its stage wakes', () => {
    const bossLevel: LevelDef = {
      ...HOLLOW_THRONE,
      id: 'staged-boss-test',
      boss: { ...HOLLOW_THRONE.boss!, id: 'final-queen', encounterId: 'finale' },
      encounters: [{ id: 'finale', trigger: { kind: 'radius', tx: 15, ty: 8, radiusTiles: 1 } }]
    };
    const sim = createSim({ seed: 11, level: bossLevel, players: [{ heroId: 'vanguard' }], content: CONTENT });
    const boss = sim.state.boss!;
    const cooldown = boss.actionCooldown;
    simTick(sim, [EMPTY_INPUT]);
    expect(boss.active).toBe(false);
    expect(boss.actionCooldown).toBe(cooldown);
    expect(sim.state.phase).toBe('combat');

    sim.state.players[0]!.pos = { ...boss.pos };
    expect(simTick(sim, [EMPTY_INPUT])).toContainEqual({
      type: 'encounter-activated',
      encounterId: 'finale',
      tick: 1
    });
    expect(boss.active).toBe(true);
    expect(boss.actionCooldown).toBe(cooldown - 1);

    boss.hp = 0;
    const clear = simTick(sim, [EMPTY_INPUT]);
    expect(clear).toContainEqual({ type: 'encounter-cleared', encounterId: 'finale', tick: 2 });
    expect(clear).toContainEqual(expect.objectContaining({ type: 'exit-opened' }));
  });
});

describe('encounter authoring validation', () => {
  it('names duplicate ids, missing dependencies, cycles, invalid triggers, and empty encounters', () => {
    const invalid: LevelDef = {
      ...STAGED_LEVEL,
      generators: [
        { id: 'same', typeId: 'brood-node', tx: 2, ty: 5, encounterId: 'opening' },
        { id: 'same', typeId: 'husk-mound', tx: 24, ty: 15, encounterId: 'depths' }
      ],
      encounters: [
        { id: 'opening', requires: ['depths', 'missing'], trigger: { kind: 'radius', tx: 1, ty: 5, radiusTiles: 0 } },
        { id: 'depths', requires: ['opening'], trigger: { kind: 'region', minTx: 4, minTy: 4, maxTx: 3, maxTy: 3 } },
        { id: 'empty', trigger: { kind: 'radius', tx: 1, ty: 1, radiusTiles: 1 } }
      ]
    };
    const problems = validateLevel(invalid).join('\n');
    expect(problems).toContain('duplicate objective id "same"');
    expect(problems).toContain('requires missing encounter "missing"');
    expect(problems).toContain('dependency cycle');
    expect(problems).toContain('invalid radius trigger');
    expect(problems).toContain('invalid trigger region');
    expect(problems).toContain('encounter "empty" has no objective');
  });
});
