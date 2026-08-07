import { HOLLOW_THRONE } from '../src/content/levels/hollowThrone';
import { createSim, simTick, type Sim } from '../src/sim/sim';
import {
  EMPTY_INPUT,
  TICK_RATE,
  type BossActionDef,
  type ContentDb,
  type HeroDef,
  type InputCommand,
  type LevelDef
} from '../src/sim/types';

/** Fixed seed and ceiling make the documented encounter a reproducible sim, not a stopwatch anecdote. */
export const MIREVEIL_BENCHMARK_SEED = 104;
export const MIREVEIL_BENCHMARK_MAX_TICKS = TICK_RATE * 90;

/**
 * Mireveil's arena is embedded inside the larger #151 approach at a fixed
 * offset (columns 5-34, rows 0-21 — see hollowThrone.ts's header), and she is
 * dormant there until the boss-threshold encounter fires. This benchmark
 * measures a pure arena duel, not a playthrough of the approach, so it
 * rebuilds the original enclosed 30x22 room by trimming the embedded arena
 * back to its own bounds. Re-walling just the shared south row is not
 * enough: the Ranger's Volley Step is an intentionally wall-clipped dash (a
 * single tile's thickness is exactly what it is built to cross —
 * `performDashVolley` checks only the landing point, not the path), so it
 * can hop a one-tile reseal straight into the approach's open geometry
 * beyond. Dropping the rows/columns outside the arena entirely closes that:
 * `level.walls[ny]?.[nx]` is `undefined`, and `isWallTile` treats an
 * undefined row as solid, exactly like the original level's own border did
 * pre-#151. The boss, spawn and exit coordinates below are therefore the
 * unchanged pre-#151 values, not the embedded ones.
 */
const ARENA_OFFSET_X = 5;
const ARENA_WIDTH = 30;
// Row 21 of the embedded arena is its south wall with the #151 breach carved
// through it (columns 18-21) — the live level's connection to the approach.
// Slicing it as-is would reopen exactly the leak this rebuild exists to
// close, so only rows 0-20 come from the real level; row 21 is rebuilt solid.
const ARENA_INTERIOR_HEIGHT = 21;
const BENCHMARK_ARENA: LevelDef = {
  ...HOLLOW_THRONE,
  walls: [
    ...HOLLOW_THRONE.walls
      .slice(0, ARENA_INTERIOR_HEIGHT)
      .map((row) => row.slice(ARENA_OFFSET_X, ARENA_OFFSET_X + ARENA_WIDTH)),
    '#'.repeat(ARENA_WIDTH)
  ],
  playerSpawns: [{ tx: 14, ty: 19 }],
  generators: [],
  encounters: [],
  gates: [],
  secrets: [],
  boss: { id: 'mireveil', typeId: 'mireveil', tx: 15, ty: 8 },
  exit: { tx: 15, ty: 1 },
  // HOLLOW_THRONE's own prop/pickup lists use the embedded (+5 column) offset
  // and include the whole approach besides — wrong coordinate space for this
  // trimmed arena, and props (unlike pickups) are never cleared below. These
  // are the exact pre-#151 arena props, unshifted, so a hero's swing can
  // still clip one exactly as it always could.
  props: [
    { typeId: 'amber-clutch', tx: 8, ty: 17 },
    { typeId: 'amber-clutch', tx: 21, ty: 17 },
    { typeId: 'resin-husk', tx: 8, ty: 3 },
    { typeId: 'resin-husk', tx: 21, ty: 3 }
  ],
  pickups: []
};

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
    level: BENCHMARK_ARENA,
    players: [{ heroId, startXp: 0 }],
    content
  });
  // BENCHMARK_ARENA's boss carries no `encounterId`, so she starts active
  // exactly as she did pre-#151 — no override needed.
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
