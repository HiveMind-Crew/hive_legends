import { moveCircle, circleHitsWall, tileCenter } from './level';
import { rngIntRange, rngNext, rngSeed } from './rng';
import {
  EMPTY_INPUT,
  NO_MODIFIERS,
  TICK_DT,
  type AttackDef,
  type BlastAbilityDef,
  type DashVolleyAbilityDef,
  type EnemyRangedDef,
  type EnemyState,
  type GuardAbilityDef,
  type GeneratorDef,
  type GeneratorState,
  type InputCommand,
  type PickupState,
  type PlayerState,
  type ProjectileAttackDef,
  type ProjectileState,
  type PropState,
  type SimConfig,
  type SimEvent,
  type SimState,
  type Vec2
} from './types';

const PLAYER_HIT_INVULN_TICKS = 30;
const ENEMY_HITSTUN_TICKS = 10;
const KNOCKBACK_DECAY = 0.85;
const EXIT_RADIUS = 26;
const PICKUP_RADIUS = 14;

export interface Sim {
  state: SimState;
  config: SimConfig;
}

export function createSim(config: SimConfig): Sim {
  const { level, content } = config;
  let nextEntityId = 1;

  const players: PlayerState[] = config.players.map((pc, i) => {
    const hero = content.heroes[pc.heroId];
    if (!hero) throw new Error(`unknown hero: ${pc.heroId}`);
    const mods = pc.modifiers ?? NO_MODIFIERS;
    const spawn = level.playerSpawns[i % level.playerSpawns.length] ?? level.playerSpawns[0];
    if (!spawn) throw new Error('level has no player spawns');
    const maxHp = hero.maxHp + mods.maxHpBonus;
    return {
      id: nextEntityId++,
      heroId: hero.id,
      pos: tileCenter(level, spawn.tx, spawn.ty),
      facing: { x: 0, y: 1 },
      hp: maxHp,
      maxHp,
      gold: 0,
      kills: 0,
      attackCooldown: 0,
      abilityCooldown: 0,
      invulnTicks: 0,
      guardTicks: 0,
      alive: true
    };
  });

  const generators: GeneratorState[] = level.generators.map((g) => {
    const def = content.generators[g.typeId];
    if (!def) throw new Error(`unknown generator: ${g.typeId}`);
    return {
      id: nextEntityId++,
      typeId: def.id,
      pos: tileCenter(level, g.tx, g.ty),
      hp: def.maxHp,
      maxHp: def.maxHp,
      spawnCooldown: 30, // brief grace period, then the horde starts
      enrageTriggered: false,
      enrageTicksLeft: 0
    };
  });

  const pickups: PickupState[] = level.pickups.map((p) => ({
    id: nextEntityId++,
    kind: p.kind,
    amount: p.amount,
    pos: tileCenter(level, p.tx, p.ty)
  }));

  const props: PropState[] = (level.props ?? []).map((pr) => {
    const def = content.props[pr.typeId];
    if (!def) throw new Error(`unknown prop: ${pr.typeId}`);
    return {
      id: nextEntityId++,
      typeId: def.id,
      pos: tileCenter(level, pr.tx, pr.ty),
      hp: def.maxHp
    };
  });

  return {
    config,
    state: {
      tick: 0,
      rngState: rngSeed(config.seed),
      nextEntityId,
      phase: 'combat',
      players,
      enemies: [],
      generators,
      pickups,
      props,
      projectiles: [],
      exitPos: tileCenter(level, level.exit.tx, level.exit.ty)
    }
  };
}

/** Advances the simulation by one fixed tick. Returns the events it emitted. */
export function simTick(sim: Sim, inputs: readonly InputCommand[]): SimEvent[] {
  const events: SimEvent[] = [];
  const s = sim.state;
  if (s.phase === 'complete' || s.phase === 'failed') {
    s.tick++;
    return events;
  }
  updatePlayers(sim, inputs, events);
  updateProjectiles(sim, events);
  updateEnemies(sim, events);
  separateEnemies(sim);
  updateGenerators(sim, events);
  collectPickups(sim, events);
  updateObjective(sim, events);

  s.tick++;
  return events;
}

// ---------------------------------------------------------------------------

function updatePlayers(sim: Sim, inputs: readonly InputCommand[], events: SimEvent[]): void {
  const s = sim.state;
  const { level, content } = sim.config;

  s.players.forEach((p, i) => {
    if (!p.alive) return;
    const hero = content.heroes[p.heroId];
    if (!hero) return;
    const input = inputs[i] ?? EMPTY_INPUT;

    if (p.attackCooldown > 0) p.attackCooldown--;
    if (p.abilityCooldown > 0) p.abilityCooldown--;
    if (p.invulnTicks > 0) p.invulnTicks--;
    if (p.guardTicks > 0) p.guardTicks--;

    // Movement (normalized so diagonals aren't faster). Guarding slows it.
    let mx = clamp(input.moveX, -1, 1);
    let my = clamp(input.moveY, -1, 1);
    const mag = Math.hypot(mx, my);
    if (mag > 1e-6) {
      mx /= Math.max(1, mag);
      my /= Math.max(1, mag);
      p.facing = norm({ x: mx, y: my });
      const guard = hero.ability.kind === 'guard' && p.guardTicks > 0 ? hero.ability : null;
      const moveMult = guard ? guard.moveMult : 1;
      const step = hero.moveSpeed * moveMult * TICK_DT;
      moveCircle(level, p.pos, hero.radius, mx * step, my * step);
      resolveStaticCircles(sim, p.pos, hero.radius);
    }

    if (input.attack && p.attackCooldown === 0) {
      const atk = playerAttack(sim, p);
      p.attackCooldown = atk.cooldownTicks;
      if (atk.kind === 'projectile') fireProjectile(sim, p, atk, events);
      else performMeleeAttack(sim, p, atk, events);
    }

    if (input.ability && p.abilityCooldown === 0) {
      p.abilityCooldown = hero.ability.cooldownTicks;
      performAbility(sim, p, events);
    }
  });
}

function performMeleeAttack(sim: Sim, p: PlayerState, atk: AttackDef, events: SimEvent[]): void {
  const { content } = sim.config;
  if (atk.kind !== 'melee') return;
  const damage = atk.damage + heroDamageBonus(sim, p);
  const cosHalfArc = Math.cos(((atk.arcDeg / 2) * Math.PI) / 180);
  events.push({ type: 'attack', playerId: p.id, pos: { ...p.pos }, facing: { ...p.facing } });

  for (const e of sim.state.enemies) {
    if (e.hp <= 0) continue;
    const def = content.enemies[e.typeId];
    if (!def) continue;
    const d = sub(e.pos, p.pos);
    const dist = Math.hypot(d.x, d.y);
    if (dist > atk.range + def.radius) continue;
    const dir = dist > 1e-6 ? { x: d.x / dist, y: d.y / dist } : { ...p.facing };
    if (dir.x * p.facing.x + dir.y * p.facing.y < cosHalfArc) continue;
    damageEnemy(sim, e, damage, dir, atk.knockback, p.id, events);
  }
  for (const g of sim.state.generators) {
    if (g.hp <= 0) continue;
    const gdef = content.generators[g.typeId];
    if (!gdef) continue;
    const d = sub(g.pos, p.pos);
    const dist = Math.hypot(d.x, d.y);
    if (dist > atk.range + gdef.radius) continue;
    const dir = dist > 1e-6 ? { x: d.x / dist, y: d.y / dist } : { ...p.facing };
    if (dir.x * p.facing.x + dir.y * p.facing.y < cosHalfArc) continue;
    damageGenerator(sim, g, damage, events);
  }
  for (const pr of sim.state.props) {
    const pdef = content.props[pr.typeId];
    if (!pdef) continue;
    const d = sub(pr.pos, p.pos);
    const dist = Math.hypot(d.x, d.y);
    if (dist > atk.range + pdef.radius) continue;
    const dir = dist > 1e-6 ? { x: d.x / dist, y: d.y / dist } : { ...p.facing };
    if (dir.x * p.facing.x + dir.y * p.facing.y < cosHalfArc) continue;
    damageProp(sim, pr, damage, events);
  }
}

function performAbility(sim: Sim, p: PlayerState, events: SimEvent[]): void {
  const hero = sim.config.content.heroes[p.heroId];
  if (!hero) return;
  if (hero.ability.kind === 'dash-volley') performDashVolley(sim, p, hero.ability, events);
  else if (hero.ability.kind === 'guard') performGuard(p, hero.ability, events);
  else performBlast(sim, p, hero.ability, events);
}

/** Bastion Wall: raise the guard stance. Its effects live on p.guardTicks. */
function performGuard(p: PlayerState, ab: GuardAbilityDef, events: SimEvent[]): void {
  p.guardTicks = ab.durationTicks;
  events.push({ type: 'ability-guard', playerId: p.id, pos: { ...p.pos }, durationTicks: ab.durationTicks });
}

/**
 * Volley Step: an instant, wall-clipped dash along the facing that leaves a
 * fan of the hero's own darts fired backward across the vacated ground. No
 * i-frames (kept simple, per design). Fully deterministic: fixed dash vector,
 * fixed fan angles, no RNG.
 */
function performDashVolley(sim: Sim, p: PlayerState, ab: DashVolleyAbilityDef, events: SimEvent[]): void {
  const { level, content } = sim.config;
  const hero = content.heroes[p.heroId];
  if (!hero) return;
  const dir = norm(p.facing);
  const from = { ...p.pos };
  moveCircle(level, p.pos, hero.radius, dir.x * ab.dashPx, dir.y * ab.dashPx);
  resolveStaticCircles(sim, p.pos, hero.radius);
  events.push({ type: 'ability-dash', playerId: p.id, from, to: { ...p.pos } });

  // Spray darts backward along the dash. Reuses the hero's equipped projectile
  // attack so the volley IS the same thorn dart (piercing, ranged) as the basic
  // shot — a weapon upgrade to the dart carries into the volley too.
  const atk = playerAttack(sim, p);
  if (atk.kind !== 'projectile') return;
  const baseAngle = Math.atan2(-dir.y, -dir.x);
  const spread = (ab.spreadDeg * Math.PI) / 180;
  for (let i = 0; i < ab.dartCount; i++) {
    const frac = ab.dartCount > 1 ? i / (ab.dartCount - 1) : 0.5;
    const angle = baseAngle + (frac - 0.5) * spread;
    spawnProjectile(sim, p, atk, { x: Math.cos(angle), y: Math.sin(angle) }, events);
  }
}

function performBlast(sim: Sim, p: PlayerState, ab: BlastAbilityDef, events: SimEvent[]): void {
  const { content } = sim.config;
  const damage = ab.damage + heroDamageBonus(sim, p);
  // Cast center: at the player, or projected along the facing (Resin Cage).
  const offset = ab.offsetPx ?? 0;
  const center = { x: p.pos.x + p.facing.x * offset, y: p.pos.y + p.facing.y * offset };
  events.push({ type: 'ability', playerId: p.id, pos: { ...center }, radius: ab.radius });

  for (const e of sim.state.enemies) {
    if (e.hp <= 0) continue;
    const def = content.enemies[e.typeId];
    if (!def) continue;
    const d = sub(e.pos, center);
    const dist = Math.hypot(d.x, d.y);
    if (dist > ab.radius + def.radius) continue;
    if (ab.slowTicks && ab.slowTicks > 0) {
      e.slowTicks = Math.max(e.slowTicks, ab.slowTicks);
      e.slowMult = ab.slowMult ?? 0.5;
    }
    const dir = dist > 1e-6 ? { x: d.x / dist, y: d.y / dist } : { x: 0, y: -1 };
    damageEnemy(sim, e, damage, dir, ab.knockback, p.id, events);
  }
  for (const g of sim.state.generators) {
    if (g.hp <= 0) continue;
    const gdef = content.generators[g.typeId];
    if (!gdef) continue;
    const dist = Math.hypot(g.pos.x - center.x, g.pos.y - center.y);
    if (dist > ab.radius + gdef.radius) continue;
    damageGenerator(sim, g, damage, events);
  }
  for (const pr of sim.state.props) {
    const pdef = content.props[pr.typeId];
    if (!pdef) continue;
    const dist = Math.hypot(pr.pos.x - center.x, pr.pos.y - center.y);
    if (dist > ab.radius + pdef.radius) continue;
    damageProp(sim, pr, damage, events);
  }
}

function heroDamageBonus(sim: Sim, p: PlayerState): number {
  const idx = sim.state.players.indexOf(p);
  return sim.config.players[idx]?.modifiers?.damageBonus ?? 0;
}

/**
 * The player's effective attack: the equipped weapon's resolved AttackDef from
 * config if present, otherwise the hero's built-in attack. The override is
 * baked in at createSim (src/meta resolves it), so the sim stays profile-free.
 */
function playerAttack(sim: Sim, p: PlayerState): AttackDef {
  const idx = sim.state.players.indexOf(p);
  const override = sim.config.players[idx]?.attack;
  if (override) return override;
  return sim.config.content.heroes[p.heroId]!.attack;
}

/** The active guard-stance def for a player, or null when not guarding. */
function guardDefFor(sim: Sim, p: PlayerState): GuardAbilityDef | null {
  if (p.guardTicks <= 0) return null;
  const ability = sim.config.content.heroes[p.heroId]?.ability;
  return ability?.kind === 'guard' ? ability : null;
}

function damageEnemy(
  sim: Sim,
  e: EnemyState,
  damage: number,
  dir: Vec2,
  knockback: number,
  byPlayer: number,
  events: SimEvent[]
): void {
  e.hp -= damage;
  e.hitstunTicks = ENEMY_HITSTUN_TICKS;
  e.knockback.x += dir.x * knockback;
  e.knockback.y += dir.y * knockback;
  if (e.hp <= 0) {
    events.push({ type: 'enemy-died', enemyId: e.id, typeId: e.typeId, pos: { ...e.pos }, byPlayer, damage });
    const killer = sim.state.players.find((p) => p.id === byPlayer);
    if (killer) killer.kills++;
    dropEnemyGold(sim, e);
    sim.state.enemies = sim.state.enemies.filter((x) => x !== e);
  } else {
    events.push({ type: 'enemy-hit', enemyId: e.id, pos: { ...e.pos }, damage });
  }
}

function dropEnemyGold(sim: Sim, e: EnemyState): void {
  const def = sim.config.content.enemies[e.typeId];
  if (!def || def.goldMax <= 0) return;
  const [amount, next] = rngIntRange(sim.state.rngState, def.goldMin, def.goldMax);
  sim.state.rngState = next;
  if (amount <= 0) return;
  sim.state.pickups.push({
    id: sim.state.nextEntityId++,
    kind: 'gold',
    amount,
    pos: { ...e.pos }
  });
}

function damageGenerator(sim: Sim, g: GeneratorState, damage: number, events: SimEvent[]): void {
  const def = sim.config.content.generators[g.typeId];
  g.hp -= damage;
  if (g.hp > 0 && def?.enrage && !g.enrageTriggered && g.hp <= g.maxHp * def.enrage.hpFraction) {
    g.enrageTriggered = true;
    g.enrageTicksLeft = def.enrage.durationTicks;
    // React immediately: the pending spawn is pulled in to the enraged pace.
    g.spawnCooldown = Math.min(g.spawnCooldown, enragedInterval(def));
    events.push({ type: 'generator-enraged', generatorId: g.id, pos: { ...g.pos } });
  }
  if (g.hp <= 0) {
    g.hp = 0;
    events.push({ type: 'generator-destroyed', generatorId: g.id, pos: { ...g.pos } });
    if (def && def.goldDrop > 0) {
      sim.state.pickups.push({
        id: sim.state.nextEntityId++,
        kind: 'gold',
        amount: def.goldDrop,
        pos: { ...g.pos }
      });
    }
    sim.state.generators = sim.state.generators.filter((x) => x !== g);
  } else {
    events.push({ type: 'generator-hit', generatorId: g.id, pos: { ...g.pos }, damage });
  }
}

function fireProjectile(sim: Sim, p: PlayerState, atk: ProjectileAttackDef, events: SimEvent[]): void {
  spawnProjectile(sim, p, atk, p.facing, events);
}

/** Spawns one bolt from the player along an arbitrary direction. */
function spawnProjectile(sim: Sim, p: PlayerState, atk: ProjectileAttackDef, dirIn: Vec2, events: SimEvent[]): void {
  const hero = sim.config.content.heroes[p.heroId];
  if (!hero) return;
  const dir = norm(dirIn);
  const spawnDist = hero.radius + atk.radius + 1;
  const projectile: ProjectileState = {
    id: sim.state.nextEntityId++,
    ownerId: p.id,
    pos: { x: p.pos.x + dir.x * spawnDist, y: p.pos.y + dir.y * spawnDist },
    vel: { x: dir.x * atk.speed, y: dir.y * atk.speed },
    radius: atk.radius,
    distanceLeft: atk.range,
    pierceLeft: atk.pierce,
    damage: atk.damage + heroDamageBonus(sim, p),
    knockback: atk.knockback,
    hitIds: [],
    hostile: false
  };
  sim.state.projectiles.push(projectile);
  events.push({
    type: 'projectile-fired',
    playerId: p.id,
    projectileId: projectile.id,
    pos: { ...projectile.pos },
    vel: { ...projectile.vel }
  });
}

/** Spawns one hostile bolt from an enemy toward a target position. */
function spawnEnemyProjectile(sim: Sim, e: EnemyState, ranged: EnemyRangedDef, radius: number, target: Vec2, events: SimEvent[]): void {
  const dir = norm(sub(target, e.pos));
  const spawnDist = radius + ranged.projectileRadius + 1;
  const projectile: ProjectileState = {
    id: sim.state.nextEntityId++,
    ownerId: e.id,
    pos: { x: e.pos.x + dir.x * spawnDist, y: e.pos.y + dir.y * spawnDist },
    vel: { x: dir.x * ranged.projectileSpeed, y: dir.y * ranged.projectileSpeed },
    radius: ranged.projectileRadius,
    distanceLeft: ranged.projectileRange,
    pierceLeft: 0,
    damage: ranged.projectileDamage,
    knockback: 0,
    hitIds: [],
    hostile: true
  };
  sim.state.projectiles.push(projectile);
  events.push({
    type: 'enemy-shot',
    enemyId: e.id,
    projectileId: projectile.id,
    pos: { ...projectile.pos },
    vel: { ...projectile.vel }
  });
}

/** Advances bolts: fly, stop at walls, damage what they touch, pierce, expire. */
function updateProjectiles(sim: Sim, events: SimEvent[]): void {
  const s = sim.state;
  if (s.projectiles.length === 0) return;
  const { level, content } = sim.config;

  const surviving: ProjectileState[] = [];
  for (const bolt of s.projectiles) {
    const stepLen = Math.hypot(bolt.vel.x, bolt.vel.y) * TICK_DT;
    const next = { x: bolt.pos.x + bolt.vel.x * TICK_DT, y: bolt.pos.y + bolt.vel.y * TICK_DT };

    if (circleHitsWall(level, next, bolt.radius)) {
      events.push({ type: 'projectile-expired', projectileId: bolt.id, pos: { ...bolt.pos } });
      continue;
    }
    bolt.pos = next;
    bolt.distanceLeft -= stepLen;

    let dead = false;
    const dir = norm(bolt.vel);

    if (bolt.hostile) {
      // Enemy fire: strikes the first living, vulnerable player it touches.
      dead = hostileBoltHitsPlayer(sim, bolt, events);
    } else {
      for (const e of s.enemies) {
        if (e.hp <= 0 || bolt.hitIds.includes(e.id)) continue;
        const def = content.enemies[e.typeId];
        if (!def) continue;
        if (Math.hypot(e.pos.x - bolt.pos.x, e.pos.y - bolt.pos.y) > bolt.radius + def.radius) continue;
        bolt.hitIds.push(e.id);
        events.push({ type: 'projectile-hit', projectileId: bolt.id, pos: { ...bolt.pos } });
        damageEnemy(sim, e, bolt.damage, dir, bolt.knockback, bolt.ownerId, events);
        if (bolt.pierceLeft <= 0) {
          dead = true;
          break;
        }
        bolt.pierceLeft--;
      }

      // Generators and props always stop a player bolt (no piercing structures).
      if (!dead) {
        for (const g of s.generators) {
          const gdef = content.generators[g.typeId];
          if (!gdef || g.hp <= 0) continue;
          if (Math.hypot(g.pos.x - bolt.pos.x, g.pos.y - bolt.pos.y) > bolt.radius + gdef.radius) continue;
          events.push({ type: 'projectile-hit', projectileId: bolt.id, pos: { ...bolt.pos } });
          damageGenerator(sim, g, bolt.damage, events);
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (const pr of s.props) {
          const pdef = content.props[pr.typeId];
          if (!pdef) continue;
          if (Math.hypot(pr.pos.x - bolt.pos.x, pr.pos.y - bolt.pos.y) > bolt.radius + pdef.radius) continue;
          events.push({ type: 'projectile-hit', projectileId: bolt.id, pos: { ...bolt.pos } });
          damageProp(sim, pr, bolt.damage, events);
          dead = true;
          break;
        }
      }
    }

    if (!dead && bolt.distanceLeft <= 0) {
      events.push({ type: 'projectile-expired', projectileId: bolt.id, pos: { ...bolt.pos } });
      dead = true;
    }
    if (!dead) surviving.push(bolt);
  }
  s.projectiles = surviving;
}

/**
 * A hostile bolt vs. players. Passes harmlessly through a player still in
 * i-frames (so spit can't stunlock); on a clean hit it deals damage — reduced
 * and announced as a block if the target is guarding — and dies.
 */
function hostileBoltHitsPlayer(sim: Sim, bolt: ProjectileState, events: SimEvent[]): boolean {
  const { content } = sim.config;
  for (const p of sim.state.players) {
    if (!p.alive || p.invulnTicks > 0) continue;
    const hero = content.heroes[p.heroId];
    if (!hero) continue;
    if (Math.hypot(p.pos.x - bolt.pos.x, p.pos.y - bolt.pos.y) > bolt.radius + hero.radius) continue;
    const guard = guardDefFor(sim, p);
    const damage = guard ? bolt.damage * guard.damageMult : bolt.damage;
    p.hp -= damage;
    p.invulnTicks = PLAYER_HIT_INVULN_TICKS;
    events.push({ type: 'projectile-hit', projectileId: bolt.id, pos: { ...bolt.pos } });
    events.push({ type: 'player-hit', playerId: p.id, damage, pos: { ...p.pos } });
    if (guard) events.push({ type: 'guard-block', playerId: p.id, enemyId: bolt.ownerId, pos: { ...p.pos } });
    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      events.push({ type: 'player-died', playerId: p.id, pos: { ...p.pos } });
    }
    return true;
  }
  return false;
}

/** Props shatter on any damage and drop loot rolled from the seeded RNG. */
function damageProp(sim: Sim, pr: PropState, damage: number, events: SimEvent[]): void {
  pr.hp -= damage;
  if (pr.hp > 0) return;
  events.push({ type: 'prop-destroyed', propId: pr.id, pos: { ...pr.pos } });
  const def = sim.config.content.props[pr.typeId];
  if (def) {
    const [amount, next] = rngIntRange(sim.state.rngState, def.dropMin, def.dropMax);
    sim.state.rngState = next;
    if (amount > 0) {
      sim.state.pickups.push({
        id: sim.state.nextEntityId++,
        kind: def.dropKind,
        amount,
        pos: { ...pr.pos }
      });
    }
  }
  sim.state.props = sim.state.props.filter((x) => x !== pr);
}

// ---------------------------------------------------------------------------

function updateEnemies(sim: Sim, events: SimEvent[]): void {
  const s = sim.state;
  const { level, content } = sim.config;

  for (const e of s.enemies) {
    const def = content.enemies[e.typeId];
    if (!def) continue;
    if (e.attackCooldown > 0) e.attackCooldown--;
    if (e.slowTicks > 0) e.slowTicks--;

    // Knockback overrides steering while it is meaningful.
    const kbMag = Math.hypot(e.knockback.x, e.knockback.y);
    if (kbMag > 1) {
      moveCircle(level, e.pos, def.radius, e.knockback.x * TICK_DT, e.knockback.y * TICK_DT);
      e.knockback.x *= KNOCKBACK_DECAY;
      e.knockback.y *= KNOCKBACK_DECAY;
    } else {
      e.knockback.x = 0;
      e.knockback.y = 0;
    }
    if (e.hitstunTicks > 0) {
      e.hitstunTicks--;
      continue;
    }

    const target = nearestLivingPlayer(s.players, e.pos);
    if (!target) continue;
    const d = sub(target.pos, e.pos);
    const dist = Math.hypot(d.x, d.y);

    if (dist > def.attackRange) {
      const step = def.moveSpeed * (e.slowTicks > 0 ? e.slowMult : 1) * TICK_DT;
      moveCircle(level, e.pos, def.radius, (d.x / dist) * step, (d.y / dist) * step);
    } else if (e.attackCooldown === 0 && (def.ranged || target.invulnTicks === 0)) {
      e.attackCooldown = def.attackCooldownTicks;
      // Ranged families spit a hostile bolt; melee families strike on contact.
      if (def.ranged) {
        spawnEnemyProjectile(sim, e, def.ranged, def.radius, target.pos, events);
        continue;
      }
      // Bastion Wall: a guarding Sentinel soaks most of the hit and shoves the
      // attacker back on the block.
      const guard = guardDefFor(sim, target);
      const damage = guard ? def.touchDamage * guard.damageMult : def.touchDamage;
      target.hp -= damage;
      target.invulnTicks = PLAYER_HIT_INVULN_TICKS;
      events.push({ type: 'player-hit', playerId: target.id, damage, pos: { ...target.pos } });
      if (guard) {
        if (guard.reflectKnockback > 0 && dist > 1e-6) {
          e.knockback.x += (-d.x / dist) * guard.reflectKnockback;
          e.knockback.y += (-d.y / dist) * guard.reflectKnockback;
        }
        events.push({ type: 'guard-block', playerId: target.id, enemyId: e.id, pos: { ...e.pos } });
      }
      if (target.hp <= 0) {
        target.hp = 0;
        target.alive = false;
        events.push({ type: 'player-died', playerId: target.id, pos: { ...target.pos } });
      }
    }
  }
}

/** Light pairwise push-apart so hordes read as a crowd, not a stack. */
function separateEnemies(sim: Sim): void {
  const { level, content } = sim.config;
  const enemies = sim.state.enemies;
  for (let i = 0; i < enemies.length; i++) {
    for (let j = i + 1; j < enemies.length; j++) {
      const a = enemies[i];
      const b = enemies[j];
      if (!a || !b) continue;
      const ra = content.enemies[a.typeId]?.radius ?? 10;
      const rb = content.enemies[b.typeId]?.radius ?? 10;
      const d = sub(b.pos, a.pos);
      const dist = Math.hypot(d.x, d.y);
      const minDist = ra + rb;
      if (dist >= minDist || dist < 1e-6) continue;
      const push = (minDist - dist) / 2;
      const nx = d.x / dist;
      const ny = d.y / dist;
      moveCircle(level, a.pos, ra, -nx * push, -ny * push);
      moveCircle(level, b.pos, rb, nx * push, ny * push);
    }
  }
}

function updateGenerators(sim: Sim, events: SimEvent[]): void {
  const s = sim.state;
  const { level, content } = sim.config;

  for (const g of s.generators) {
    const def = content.generators[g.typeId];
    if (!def) continue;
    if (g.enrageTicksLeft > 0) g.enrageTicksLeft--;
    if (g.spawnCooldown > 0) {
      g.spawnCooldown--;
      continue;
    }
    const aliveFromThis = s.enemies.reduce((n, e) => n + (e.sourceGen === g.id ? 1 : 0), 0);
    if (aliveFromThis >= def.maxAlive) continue;

    const enemyDef = content.enemies[def.spawnsEnemyId];
    if (!enemyDef) continue;

    // Pick a spawn point on a ring around the generator; retry a few angles.
    let spawned = false;
    for (let attempt = 0; attempt < 6 && !spawned; attempt++) {
      const [v, next] = rngNext(s.rngState);
      s.rngState = next;
      const angle = v * Math.PI * 2;
      const dist = def.radius + enemyDef.radius + 6;
      const pos = { x: g.pos.x + Math.cos(angle) * dist, y: g.pos.y + Math.sin(angle) * dist };
      if (circleHitsWall(level, pos, enemyDef.radius)) continue;
      const enemy: EnemyState = {
        id: s.nextEntityId++,
        typeId: enemyDef.id,
        pos,
        hp: enemyDef.maxHp,
        attackCooldown: 0,
        hitstunTicks: 0,
        knockback: { x: 0, y: 0 },
        slowTicks: 0,
        slowMult: 1,
        sourceGen: g.id
      };
      s.enemies.push(enemy);
      events.push({ type: 'enemy-spawned', enemyId: enemy.id, typeId: enemy.typeId, pos: { ...pos } });
      spawned = true;
    }
    g.spawnCooldown = g.enrageTicksLeft > 0 ? enragedInterval(def) : def.spawnIntervalTicks;
  }
}

function enragedInterval(def: GeneratorDef): number {
  return def.enrage ? Math.max(1, Math.round(def.spawnIntervalTicks * def.enrage.intervalMult)) : def.spawnIntervalTicks;
}

function collectPickups(sim: Sim, events: SimEvent[]): void {
  const s = sim.state;
  const { content } = sim.config;
  if (s.pickups.length === 0) return;

  const remaining: PickupState[] = [];
  for (const pk of s.pickups) {
    let collected = false;
    for (const p of s.players) {
      if (!p.alive) continue;
      const hero = content.heroes[p.heroId];
      if (!hero) continue;
      const dist = Math.hypot(pk.pos.x - p.pos.x, pk.pos.y - p.pos.y);
      if (dist > hero.radius + PICKUP_RADIUS) continue;
      if (pk.kind === 'health') {
        if (p.hp >= p.maxHp) continue; // leave food for when it matters
        p.hp = Math.min(p.maxHp, p.hp + pk.amount);
      } else {
        p.gold += pk.amount;
      }
      events.push({ type: 'pickup-collected', playerId: p.id, kind: pk.kind, amount: pk.amount, pos: { ...pk.pos } });
      collected = true;
      break;
    }
    if (!collected) remaining.push(pk);
  }
  s.pickups = remaining;
}

function updateObjective(sim: Sim, events: SimEvent[]): void {
  const s = sim.state;

  if (s.players.every((p) => !p.alive)) {
    s.phase = 'failed';
    events.push({ type: 'mission-failed' });
    return;
  }

  if (s.phase === 'combat' && s.generators.length === 0) {
    s.phase = 'exit-open';
    events.push({ type: 'exit-opened', pos: { ...s.exitPos } });
  }

  if (s.phase === 'exit-open') {
    for (const p of s.players) {
      if (!p.alive) continue;
      const dist = Math.hypot(p.pos.x - s.exitPos.x, p.pos.y - s.exitPos.y);
      if (dist <= EXIT_RADIUS) {
        s.phase = 'complete';
        events.push({ type: 'mission-complete' });
        return;
      }
    }
  }
}

/** Keeps players from walking through generators (immovable obstacles). */
function resolveStaticCircles(sim: Sim, pos: Vec2, radius: number): void {
  const { content } = sim.config;
  for (const g of sim.state.generators) {
    const gr = content.generators[g.typeId]?.radius ?? 20;
    const d = sub(pos, g.pos);
    const dist = Math.hypot(d.x, d.y);
    const minDist = radius + gr;
    if (dist >= minDist || dist < 1e-6) continue;
    pos.x = g.pos.x + (d.x / dist) * minDist;
    pos.y = g.pos.y + (d.y / dist) * minDist;
  }
}

function nearestLivingPlayer(players: PlayerState[], from: Vec2): PlayerState | null {
  let best: PlayerState | null = null;
  let bestDist = Infinity;
  for (const p of players) {
    if (!p.alive) continue;
    const dist = Math.hypot(p.pos.x - from.x, p.pos.y - from.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function norm(v: Vec2): Vec2 {
  const m = Math.hypot(v.x, v.y);
  return m > 1e-6 ? { x: v.x / m, y: v.y / m } : { x: 0, y: 1 };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Stable stringify of sim state for determinism checks and desync detection. */
export function hashState(s: SimState): string {
  return JSON.stringify(s);
}
