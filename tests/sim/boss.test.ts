import { describe, expect, it } from 'vitest';
import { CONTENT, HOLLOW_THRONE } from '../../src/content';
import { createSim, hashState, simTick, type Sim } from '../../src/sim/sim';
import { BOSS_ACTIONS, EMPTY_INPUT, type InputCommand, type SimEvent } from '../../src/sim/types';

/**
 * Mireveil, Mother of the Brood (issue #25). Tests drive the real content boss
 * through the deterministic sim: the telegraph contract, phase escalation, the
 * objective gate, a full scripted kill, and the "circling wins" tuning bar.
 */

const MIREVEIL = CONTENT.bosses['mireveil']!;

function newSim(heroId = 'vanguard', seed = 77): Sim {
  return createSim({ seed, level: HOLLOW_THRONE, players: [{ heroId }], content: CONTENT });
}

function input(partial: Partial<InputCommand>): InputCommand {
  return { ...EMPTY_INPUT, ...partial };
}

function runTicks(sim: Sim, n: number, cmd: InputCommand = EMPTY_INPUT): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...simTick(sim, [cmd]));
  return events;
}

/**
 * A scripted duel: close and strike when the swing is ready, then back off
 * through the recovery — and always give ground while she is lunging. This is
 * the learnability bar from the issue: no healing, no relics, just reading her.
 *
 * Note the hero must *face* what it hits (facing follows movement), so a pure
 * tangential orbit can never land a melee swing — the dance is in and out.
 */
function duelBoss(sim: Sim, maxTicks: number): SimEvent[] {
  const events: SimEvent[] = [];
  const hero = CONTENT.heroes[sim.state.players[0]!.heroId]!;
  const reach = (hero.attack.kind === 'melee' ? hero.attack.range : 200) + MIREVEIL.radius;
  for (let i = 0; i < maxTicks; i++) {
    const p = sim.state.players[0]!;
    const boss = sim.state.boss;
    if (!p.alive || !boss || boss.hp <= 0) break;
    const dx = boss.pos.x - p.pos.x;
    const dy = boss.pos.y - p.pos.y;
    const dist = Math.hypot(dx, dy) || 1;
    const toward = { x: dx / dist, y: dy / dist };
    const ready = p.attackCooldown === 0;
    const charging = boss.lungeTicksLeft > 0 || boss.pendingAction === 'lunge';

    if (charging) {
      // Read the tell: slip sideways out of the charge lane.
      events.push(...simTick(sim, [input({ moveX: -toward.y, moveY: toward.x })]));
    } else if (ready) {
      // Close, facing her, and swing the instant she is in reach.
      events.push(...simTick(sim, [input({ moveX: toward.x, moveY: toward.y, attack: dist <= reach })]));
    } else {
      // Recover out of her contact range.
      events.push(...simTick(sim, [input({ moveX: -toward.x, moveY: -toward.y })]));
    }
  }
  return events;
}

describe('boss content (#25)', () => {
  it('defines Mireveil with an original name and three escalating phases', () => {
    expect(MIREVEIL.name.length).toBeGreaterThan(0);
    expect(MIREVEIL.phases).toHaveLength(3);
    // Authored strongest-first: the opening phase must cover full health.
    expect(MIREVEIL.phases[0]!.hpFraction).toBe(1);
    for (let i = 1; i < MIREVEIL.phases.length; i++) {
      expect(MIREVEIL.phases[i]!.hpFraction).toBeLessThan(MIREVEIL.phases[i - 1]!.hpFraction);
      // Each phase is faster than the last.
      expect(MIREVEIL.phases[i]!.actionIntervalTicks).toBeLessThan(MIREVEIL.phases[i - 1]!.actionIntervalTicks);
    }
    for (const phase of MIREVEIL.phases) {
      expect(phase.actions.length).toBeGreaterThan(0);
      for (const a of phase.actions) expect(BOSS_ACTIONS).toContain(a);
    }
    expect(CONTENT.enemies[MIREVEIL.broodCall.enemyId]).toBeDefined();
  });

  it('telegraphs for at least the readability minimum (45 ticks)', () => {
    expect(MIREVEIL.telegraphTicks).toBeGreaterThanOrEqual(45);
  });

  it('the finale level plants her and authors no spawners', () => {
    expect(HOLLOW_THRONE.boss?.typeId).toBe('mireveil');
    expect(HOLLOW_THRONE.generators).toHaveLength(0);
    const sim = newSim();
    expect(sim.state.boss?.hp).toBe(MIREVEIL.maxHp);
  });
});

describe('telegraph contract', () => {
  it('every damaging action is preceded by a telegraph of the authored length', () => {
    const sim = newSim();
    // Idle at spawn (far from her) until she commits to her first action.
    let sawTelegraph = false;
    let ticksAfterTelegraph = 0;
    for (let i = 0; i < 600; i++) {
      const events = simTick(sim, [EMPTY_INPUT]);
      if (events.some((e) => e.type === 'boss-telegraph')) {
        sawTelegraph = true;
        expect(sim.state.boss!.telegraphTicksLeft).toBe(MIREVEIL.telegraphTicks);
        break;
      }
    }
    expect(sawTelegraph).toBe(true);
    // Nothing is released until the telegraph fully elapses.
    while (sim.state.boss!.telegraphTicksLeft > 0) {
      const before = sim.state.enemies.length;
      simTick(sim, [EMPTY_INPUT]);
      ticksAfterTelegraph++;
      if (sim.state.boss!.telegraphTicksLeft > 0) expect(sim.state.enemies.length).toBe(before);
    }
    expect(ticksAfterTelegraph).toBe(MIREVEIL.telegraphTicks);
  });

  it('the Brood Call births a clutch once the telegraph lands', () => {
    const sim = newSim();
    const events = runTicks(sim, 400);
    expect(events.some((e) => e.type === 'boss-telegraph' && e.action === 'brood-call')).toBe(true);
    expect(sim.state.enemies.length).toBeGreaterThanOrEqual(MIREVEIL.broodCall.count);
  });
});

describe('objective gating', () => {
  it('the exit stays shut while she lives, even with no spawners left', () => {
    const sim = newSim();
    expect(sim.state.generators).toHaveLength(0); // nothing else to clear
    runTicks(sim, 300);
    expect(sim.state.phase).toBe('combat'); // she is the objective
  });

  it('a killing blow announces her death and opens the way out', () => {
    const sim = newSim();
    const boss = sim.state.boss!;
    boss.hp = 1; // one swing from death
    // Step into reach, facing her, and strike.
    const p = sim.state.players[0]!;
    p.pos = { x: boss.pos.x - 50, y: boss.pos.y };
    p.facing = { x: 1, y: 0 };
    const events = runTicks(sim, 3, input({ moveX: 1, attack: true }));
    expect(events.some((e) => e.type === 'boss-died')).toBe(true);
    expect(sim.state.phase).toBe('exit-open');
  });
});

describe('the fight', () => {
  it('escalates through all three phases and dies to a circling hero', () => {
    const sim = newSim();
    // The learnability bar: no healing and no relics — strip them from the room.
    sim.state.pickups = [];
    const events = duelBoss(sim, 60 * 120); // up to two minutes of sim

    const phases = events.filter((e) => e.type === 'boss-phase').map((e) => (e as { phaseIndex: number }).phaseIndex);
    expect(phases).toContain(1);
    expect(phases).toContain(2);
    expect(events.some((e) => e.type === 'boss-died')).toBe(true);
    expect(sim.state.boss!.hp).toBe(0);
    expect(sim.state.players[0]!.alive).toBe(true); // survivable without healing
  });

  it('mission completes only after she falls', () => {
    const sim = newSim();
    sim.state.pickups = [];
    duelBoss(sim, 60 * 120);
    expect(sim.state.boss!.hp).toBe(0);
    expect(sim.state.phase).toBe('exit-open');
    // Walk to the exit to finish the realm.
    for (let i = 0; i < 60 * 40 && sim.state.phase !== 'complete'; i++) {
      const p = sim.state.players[0]!;
      const dx = sim.state.exitPos.x - p.pos.x;
      const dy = sim.state.exitPos.y - p.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      simTick(sim, [input({ moveX: dx / d, moveY: dy / d, attack: true })]);
    }
    expect(sim.state.phase).toBe('complete');
  });

  it('she drops her hoard on death', () => {
    const sim = newSim();
    sim.state.pickups = [];
    duelBoss(sim, 60 * 120);
    expect(sim.state.pickups.some((pk) => pk.kind === 'gold' && pk.amount === MIREVEIL.goldDrop)).toBe(true);
  });

  it('the fight stays deterministic', () => {
    const a = newSim('vanguard', 4242);
    const b = newSim('vanguard', 4242);
    duelBoss(a, 900);
    duelBoss(b, 900);
    expect(hashState(a.state)).toBe(hashState(b.state));
  });
});
