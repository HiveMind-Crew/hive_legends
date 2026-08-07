import { describe, expect, it } from 'vitest';
import { CONTENT, HOLLOW_THRONE } from '../../src/content';
import { createSim, hashState, simTick, type Sim } from '../../src/sim/sim';
import { EMPTY_INPUT, type BossActionDef, type BossDef, type InputCommand, type SimEvent } from '../../src/sim/types';

/**
 * Mireveil, Mother of the Brood (issue #25). Tests drive the real content boss
 * through the deterministic sim: the telegraph contract, phase escalation, the
 * objective gate, a full scripted kill, and the "circling wins" tuning bar.
 */

const MIREVEIL = CONTENT.bosses['mireveil']!;

function actionById(boss: BossDef, id: string): BossActionDef {
  const action = boss.phases.flatMap((phase) => phase.actions).find((candidate) => candidate.id === id);
  if (!action) throw new Error(`missing boss action: ${id}`);
  return action;
}

function pendingAction(sim: Sim): BossActionDef | undefined {
  const boss = sim.state.boss;
  if (!boss?.pendingAction) return undefined;
  const def = sim.config.content.bosses[boss.typeId];
  return def?.phases[boss.pendingAction.phaseIndex]?.actions[boss.pendingAction.actionIndex];
}

function newSim(heroId = 'vanguard', seed = 77): Sim {
  const sim = createSim({ seed, level: HOLLOW_THRONE, players: [{ heroId }], content: CONTENT });
  // Mireveil is dormant behind the south approach's two sanctums until both
  // clear (#151; see hollowThrone.ts). These tests are about the fight
  // itself, already covered end-to-end by tests/sim/hollowThrone.test.ts's
  // sanctum and dormancy coverage, so start from "both sanctums already
  // cleared" — her boss-threshold encounter's own precondition — rather than
  // playing the approach here.
  sim.state.generators = [];
  sim.state.boss!.active = true;
  return sim;
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
    const charging = boss.chargeTicksLeft > 0 || pendingAction(sim)?.kind === 'charge';

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
      for (const action of phase.actions) {
        expect(action.id.length).toBeGreaterThan(0);
        expect(action.tell.length).toBeGreaterThan(0);
      }
    }
    const broodCall = actionById(MIREVEIL, 'brood-call');
    expect(broodCall.kind).toBe('summon');
    if (broodCall.kind === 'summon') expect(CONTENT.enemies[broodCall.enemyId]).toBeDefined();
  });

  it('telegraphs for at least the readability minimum (45 ticks)', () => {
    expect(MIREVEIL.telegraphTicks).toBeGreaterThanOrEqual(45);
  });

  it('the finale level plants her, dormant, behind the two approach sanctums (#151)', () => {
    expect(HOLLOW_THRONE.boss?.typeId).toBe('mireveil');
    // The approach's staged pre-boss objectives, not Mireveil's own spawners —
    // she still has none of her own; see tests/sim/hollowThrone.test.ts for
    // the sanctum cap and dormancy coverage.
    expect(HOLLOW_THRONE.generators).toHaveLength(2);
    expect(HOLLOW_THRONE.boss?.encounterId).toBe('boss-threshold');
    const fresh = createSim({ seed: 77, level: HOLLOW_THRONE, players: [{ heroId: 'vanguard' }], content: CONTENT });
    expect(fresh.state.boss?.active).toBe(false);
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
    const broodCall = actionById(MIREVEIL, 'brood-call');
    expect(events.some((e) => e.type === 'boss-telegraph' && e.actionId === 'brood-call')).toBe(true);
    if (broodCall.kind !== 'summon') throw new Error('Brood Call must use the summon primitive');
    expect(sim.state.enemies.length).toBeGreaterThanOrEqual(broodCall.count);
  });
});

describe('data-authored boss moves (#81)', () => {
  const GLASS_WEAVER: BossDef = {
    id: 'glass-weaver',
    name: 'The Glass Weaver',
    title: 'Heart of the Hollows',
    maxHp: 500,
    radius: 28,
    touchDamage: 8,
    touchCooldownTicks: 45,
    telegraphTicks: 45,
    phases: [
      {
        name: 'The Mirror Turns',
        hpFraction: 1,
        moveSpeed: 40,
        actionIntervalTicks: 1,
        actions: [
          {
            id: 'prism-rush',
            kind: 'charge',
            tell: 'THE PRISM SURGES!',
            speed: 300,
            durationTicks: 2,
            damage: 17
          },
          {
            id: 'splinter-crown',
            kind: 'volley',
            tell: 'THE CROWN SPLINTERS!',
            count: 7,
            spreadDeg: 120,
            projectileSpeed: 180,
            projectileRadius: 4,
            projectileDamage: 6,
            projectileRange: 360
          }
        ]
      }
    ],
    goldDrop: 100,
    xp: 400
  };

  function glassWeaverSim(seed: number): Sim {
    const sim = createSim({
      seed,
      level: { ...HOLLOW_THRONE, boss: { ...HOLLOW_THRONE.boss!, typeId: GLASS_WEAVER.id } },
      players: [{ heroId: 'vanguard' }],
      content: { ...CONTENT, bosses: { ...CONTENT.bosses, [GLASS_WEAVER.id]: GLASS_WEAVER } }
    });
    // Dormant behind the #151 boss threshold like every other sim in this
    // file — see the comment on newSim() above.
    sim.state.generators = [];
    sim.state.boss!.active = true;
    return sim;
  }

  it('runs unfamiliar action ids and presentation copy without sim branches', () => {
    const sim = glassWeaverSim(908);
    const events = runTicks(sim, 100);
    const tells = events.filter((event) => event.type === 'boss-telegraph');
    expect(tells.map((event) => event.actionId)).toEqual(['prism-rush', 'splinter-crown', 'prism-rush']);
    expect(tells.slice(0, 2).map((event) => event.tell)).toEqual(['THE PRISM SURGES!', 'THE CROWN SPLINTERS!']);
    expect(sim.state.projectiles.filter((bolt) => bolt.ownerId === sim.state.boss!.id)).toHaveLength(7);
  });

  it('keeps the authored round-robin deterministic', () => {
    const a = glassWeaverSim(909);
    const b = glassWeaverSim(909);
    runTicks(a, 240);
    runTicks(b, 240);
    expect(hashState(a.state)).toBe(hashState(b.state));
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

  it('a hoarded potion bites her and clears her brood (#41 x #25)', () => {
    const sim = newSim();
    const boss = sim.state.boss!;
    const p = sim.state.players[0]!;
    p.potions = 1;
    p.pos = { x: boss.pos.x - 40, y: boss.pos.y }; // inside the burst radius
    const before = boss.hp;
    const events = simTick(sim, [input({ usePotion: true })]);
    expect(events.some((e) => e.type === 'potion-used')).toBe(true);
    expect(boss.hp).toBeLessThan(before);
    expect(p.potions).toBe(0);
  });

  it('the finale arena stocks exactly one potion', () => {
    const potions = HOLLOW_THRONE.pickups.filter((pk) => pk.kind === 'potion');
    expect(potions).toHaveLength(1);
  });

  it('the fight stays deterministic', () => {
    const a = newSim('vanguard', 4242);
    const b = newSim('vanguard', 4242);
    duelBoss(a, 900);
    duelBoss(b, 900);
    expect(hashState(a.state)).toBe(hashState(b.state));
  });
});
