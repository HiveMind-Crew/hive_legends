import { describe, expect, it } from 'vitest';
import { ABILITY_SPECIALIZATIONS, BROOD_WARRENS, CONTENT } from '../../src/content';
import { buyAbilitySpecialization, defaultProfile, specializedAbility } from '../../src/meta/save';
import { createSim, hashState, simTick, type Sim } from '../../src/sim/sim';
import { EMPTY_INPUT, type EnemyState, type InputCommand, type SimEvent } from '../../src/sim/types';

function input(partial: Partial<InputCommand>): InputCommand {
  return { ...EMPTY_INPUT, ...partial };
}

function specializedSim(specializationId: string, seed = 108): Sim {
  const profile = defaultProfile();
  profile.bank = 10_000;
  expect(buyAbilitySpecialization(profile, specializationId)).toBe(true);
  const hero = CONTENT.heroes['vanguard']!;
  return createSim({
    seed,
    level: BROOD_WARRENS,
    players: [{ heroId: hero.id, ability: specializedAbility(profile, hero) }],
    content: CONTENT
  });
}

function target(sim: Sim, id: number, dx: number, dy: number): EnemyState {
  const p = sim.state.players[0]!;
  const enemy: EnemyState = {
    id,
    typeId: 'skitterling',
    pos: { x: p.pos.x + dx, y: p.pos.y + dy },
    hp: 1000,
    attackCooldown: 999,
    windupTicksLeft: 0,
    hitstunTicks: 0,
    knockback: { x: 0, y: 0 },
    slowTicks: 0,
    slowMult: 1,
    sourceGen: null
  };
  sim.state.enemies.push(enemy);
  return enemy;
}

describe('ability specializations in the deterministic sim (#108)', () => {
  it('rejects a config that crosses the hero ability archetype', () => {
    expect(() =>
      createSim({
        seed: 1,
        level: BROOD_WARRENS,
        players: [{ heroId: 'vanguard', ability: CONTENT.heroes['sentinel']!.ability }],
        content: CONTENT
      })
    ).toThrow(/must stay blast/);
  });

  it('two profiles using the Vanguard produce different spatial ability behavior', () => {
    const faultline = specializedSim('vanguard-faultline');
    const echo = specializedSim('vanguard-aftershock');
    faultline.state.generators = [];
    echo.state.generators = [];

    // Default facing is down (+y): one target is far ahead and one is beside
    // the hero. Faultline reaches the former; Echoing Crater surrounds the
    // caster and reaches the latter. Neither result is a stat-only difference.
    const faultlineFar = target(faultline, 9001, 0, 190);
    const faultlineSide = target(faultline, 9002, 80, 0);
    const echoFar = target(echo, 9001, 0, 190);
    const echoSide = target(echo, 9002, 80, 0);

    const faultlineEvents = simTick(faultline, [input({ ability: true })]);
    const echoEvents = simTick(echo, [input({ ability: true })]);

    expect(faultlineEvents.some((event) => event.type === 'ability-line')).toBe(true);
    expect(echoEvents.some((event) => event.type === 'ability')).toBe(true);
    expect(faultlineFar.hp).toBeLessThan(1000);
    expect(faultlineSide.hp).toBe(1000);
    expect(echoFar.hp).toBe(1000);
    expect(echoSide.hp).toBeLessThan(1000);
  });

  it('Echoing Crater leaves a delayed second impact in deterministic state', () => {
    const sim = specializedSim('vanguard-aftershock', 109);
    sim.state.enemies = [];
    const p = sim.state.players[0]!;
    const generator = sim.state.generators[0]!;
    sim.state.generators = [generator];
    generator.pos = { x: p.pos.x + 40, y: p.pos.y };
    generator.hp = 1000;
    generator.maxHp = 1000;
    generator.spawnCooldown = 999;

    simTick(sim, [input({ ability: true })]);
    const aftershock = ABILITY_SPECIALIZATIONS['vanguard-aftershock']!.ability;
    expect(aftershock.kind).toBe('blast');
    if (aftershock.kind !== 'blast' || !aftershock.aftershock) throw new Error('expected authored aftershock');
    expect(generator.hp).toBe(1000 - aftershock.damage);
    expect(sim.state.pendingBlasts).toHaveLength(1);
    expect(sim.state.pendingBlasts[0]!.ticksLeft).toBe(aftershock.aftershock.delayTicks);

    const events: SimEvent[] = [];
    for (let i = 0; i < aftershock.aftershock.delayTicks - 1; i++) events.push(...simTick(sim, [EMPTY_INPUT]));
    expect(generator.hp).toBe(1000 - aftershock.damage);
    expect(sim.state.pendingBlasts[0]!.ticksLeft).toBe(1);
    events.push(...simTick(sim, [EMPTY_INPUT]));
    expect(events.some((event) => event.type === 'ability' && event.effect === 'aftershock')).toBe(true);
    expect(generator.hp).toBe(1000 - aftershock.damage - aftershock.aftershock.damage);
    expect(sim.state.pendingBlasts).toHaveLength(0);
  });

  it('is deterministic per branch and divergent between branches', () => {
    const run = (id: string): string => {
      const sim = specializedSim(id, 777);
      sim.state.generators = [];
      target(sim, 9010, 0, 190);
      target(sim, 9011, 80, 0);
      for (let i = 0; i < 90; i++) simTick(sim, [input({ ability: i === 0 })]);
      return hashState(sim.state);
    };
    expect(run('vanguard-faultline')).toBe(run('vanguard-faultline'));
    expect(run('vanguard-aftershock')).toBe(run('vanguard-aftershock'));
    expect(run('vanguard-faultline')).not.toBe(run('vanguard-aftershock'));
  });
});
