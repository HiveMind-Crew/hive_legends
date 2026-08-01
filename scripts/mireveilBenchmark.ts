import { HOLLOW_THRONE } from '../src/content/levels/hollowThrone';
import { createSim, simTick, type Sim } from '../src/sim/sim';
import { EMPTY_INPUT, TICK_RATE, type BossActionDef, type ContentDb, type HeroDef, type InputCommand } from '../src/sim/types';

/** Fixed seed and ceiling make the documented encounter a reproducible sim, not a stopwatch anecdote. */
export const MIREVEIL_BENCHMARK_SEED = 104;
export const MIREVEIL_BENCHMARK_MAX_TICKS = TICK_RATE * 90;

export interface MireveilBenchmarkResult {
  heroId: string;
  heroName: string;
  role: string;
  ticks: number;
  seconds: number;
  hpRemaining: number;
}

function input(partial: Partial<InputCommand>): InputCommand {
  return { ...EMPTY_INPUT, ...partial };
}

function pendingAction(sim: Sim): BossActionDef | undefined {
  const boss = sim.state.boss;
  if (!boss?.pendingAction) return undefined;
  const def = sim.config.content.bosses[boss.typeId];
  return def?.phases[boss.pendingAction.phaseIndex]?.actions[boss.pendingAction.actionIndex];
}

/**
 * A shared, input-only boss script for the four base kits.
 *
 * It approaches under normal collision, fires only while the boss is inside
 * the authored reach, circles between attacks, and sidesteps a telegraphed or
 * active charge. Abilities follow their actual role: blasts fire in range,
 * Volley Step dashes away so its rear fan crosses Mireveil, and Bastion Wall
 * braces for close-range danger. There are no state teleports, invulnerability
 * edits, potions, pickups, weapon overrides, starting XP, or per-hero damage
 * modifiers.
 */
function scriptedInput(sim: Sim, hero: HeroDef): InputCommand {
  const p = sim.state.players[0]!;
  const boss = sim.state.boss!;
  const bossDef = sim.config.content.bosses[boss.typeId]!;
  const dx = boss.pos.x - p.pos.x;
  const dy = boss.pos.y - p.pos.y;
  const distance = Math.hypot(dx, dy) || 1;
  const toward = { x: dx / distance, y: dy / distance };
  const away = { x: -toward.x, y: -toward.y };
  const orbitSign = Math.floor(sim.state.tick / (TICK_RATE * 3)) % 2 === 0 ? 1 : -1;
  const tangent = { x: -toward.y * orbitSign, y: toward.x * orbitSign };
  const action = pendingAction(sim);
  const evadingCharge = boss.chargeTicksLeft > 0 || action?.kind === 'charge';
  const attackReach = hero.attack.range + bossDef.radius;

  if (evadingCharge) {
    return input({
      moveX: tangent.x,
      moveY: tangent.y,
      ability: hero.ability.kind === 'guard' && p.abilityCooldown === 0
    });
  }

  // Volley Step moves along the facing and throws its fan backward. Dashing
  // away is therefore both its intended escape and the way to cross the boss.
  if (
    hero.ability.kind === 'dash-volley' &&
    p.abilityCooldown === 0 &&
    distance <= Math.min(hero.attack.range, 300) + bossDef.radius
  ) {
    return input({ moveX: away.x, moveY: away.y, ability: true });
  }

  if (hero.ability.kind === 'blast' && p.abilityCooldown === 0) {
    const abilityReach = (hero.ability.offsetPx ?? 0) + hero.ability.radius + bossDef.radius;
    if (distance <= abilityReach) return input({ moveX: toward.x, moveY: toward.y, ability: true });
  }

  if (hero.ability.kind === 'guard' && p.abilityCooldown === 0 && distance <= attackReach + 18) {
    return input({ moveX: toward.x, moveY: toward.y, ability: true });
  }

  // Ranged kits hold a practical firing lane instead of exploiting the last
  // pixel of projectile lifetime. Melee kits dance just inside their arcs.
  const desiredDistance =
    hero.attack.kind === 'projectile' ? Math.min(280, hero.attack.range - 60) : hero.attack.range + bossDef.radius - 10;
  const canAttack = distance <= attackReach;

  if (p.attackCooldown === 0 && canAttack) {
    // Movement owns facing in the real controls, so step into the shot/swing.
    return input({ moveX: toward.x, moveY: toward.y, attack: true });
  }
  if (distance > desiredDistance + 10) return input({ moveX: toward.x, moveY: toward.y });
  if (distance < desiredDistance - 10) return input({ moveX: away.x, moveY: away.y });
  return input({ moveX: tangent.x, moveY: tangent.y });
}

/** Run one level-1, base-weapon, no-upgrade Mireveil clear for a hero. */
export function benchmarkMireveilHero(content: ContentDb, heroId: string): MireveilBenchmarkResult {
  const hero = content.heroes[heroId];
  if (!hero) throw new Error(`unknown benchmark hero: ${heroId}`);
  const sim = createSim({
    seed: MIREVEIL_BENCHMARK_SEED,
    level: HOLLOW_THRONE,
    players: [{ heroId, startXp: 0 }],
    content
  });
  // The encounter script measures base kits only. Removing room loot prevents
  // an accidental route over a relic, potion, or heal from changing the run.
  sim.state.pickups = [];

  for (let ticks = 1; ticks <= MIREVEIL_BENCHMARK_MAX_TICKS; ticks++) {
    simTick(sim, [scriptedInput(sim, hero)]);
    if ((sim.state.boss?.hp ?? 0) <= 0) {
      const player = sim.state.players[0]!;
      return {
        heroId,
        heroName: hero.name,
        role: hero.role,
        ticks,
        seconds: ticks / TICK_RATE,
        hpRemaining: player.hp
      };
    }
    if (!sim.state.players[0]!.alive) break;
  }

  const player = sim.state.players[0]!;
  throw new Error(
    `${hero.role} did not clear Mireveil within ${MIREVEIL_BENCHMARK_MAX_TICKS / TICK_RATE}s ` +
      `(boss hp ${sim.state.boss?.hp ?? 0}, player hp ${player.hp})`
  );
}

/** Roster-order results used by both regression tests and generated docs. */
export function benchmarkMireveilRoster(content: ContentDb): MireveilBenchmarkResult[] {
  return Object.values(content.heroes).map((hero) => benchmarkMireveilHero(content, hero.id));
}
