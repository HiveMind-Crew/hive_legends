import { moveCircle, circleHitsWall, tileCenter, type Blockage } from './level';
import { rngIntRange, rngNext, rngSeed } from './rng';
import {
  EMPTY_INPUT,
  NO_MODIFIERS,
  POWERUP_KINDS,
  TICK_DT,
  type AttackDef,
  type PowerUpKind,
  type BlastAbilityDef,
  type DashVolleyAbilityDef,
  type BossActionDef,
  type BossActionRef,
  type BossDef,
  type BossState,
  type EntityId,
  type EnemyBoltAttackDef,
  type EnemyDef,
  type EnemyState,
  type EnemyVolleyAttackDef,
  type GateState,
  type GuardAbilityDef,
  type SecretWallState,
  type GeneratorDef,
  type GeneratorState,
  type InputCommand,
  type HostileProjectileDef,
  type PickupState,
  type PlayerState,
  type ProjectileAttackDef,
  type PressureDef,
  type ProgressionDef,
  type ProjectileState,
  type PropState,
  type SimConfig,
  type SimEvent,
  type SimState,
  type Vec2
} from './types';

// Player i-frames, enemy hitstun and knockback decay are gameplay dials and
// live in content (`ContentDb.combat`, src/content/combat.ts) — see
// docs/COMBAT.md for how hero attack cadence is tuned against hitstun.
const EXIT_RADIUS = 26;
const PICKUP_RADIUS = 14;
const SECRET_WALL_HP = 60;
const SECRET_RADIUS = 15; // secret walls fill roughly a tile for attack collision

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
    // Banked XP carries in and sets the starting level (issue #46); its
    // bonuses stack on top of the bought upgrades.
    const xp = Math.max(0, pc.startXp ?? 0);
    const heroLevel = levelForXp(content.progression, xp);
    const maxHp = hero.maxHp + mods.maxHpBonus + levelMaxHpBonus(content.progression, heroLevel);
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
      power: emptyPowerTimers(),
      keys: 0,
      potions: 0,
      xp,
      level: heroLevel,
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
    power: p.power,
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

  const gates: GateState[] = (level.gates ?? []).map((g) => ({
    id: nextEntityId++,
    tx: g.tx,
    ty: g.ty,
    pos: tileCenter(level, g.tx, g.ty),
    locked: true
  }));

  const secrets: SecretWallState[] = (level.secrets ?? []).map((sw) => ({
    id: nextEntityId++,
    tx: sw.tx,
    ty: sw.ty,
    pos: tileCenter(level, sw.tx, sw.ty),
    hp: sw.hp ?? SECRET_WALL_HP,
    maxHp: sw.hp ?? SECRET_WALL_HP
  }));

  // The level's boss, if it has one (issue #25). She starts idle: the first
  // action waits out a full interval so the party gets to read the room.
  let boss: BossState | null = null;
  if (level.boss) {
    const bdef = content.bosses[level.boss.typeId];
    if (!bdef) throw new Error(`unknown boss: ${level.boss.typeId}`);
    boss = {
      id: nextEntityId++,
      typeId: bdef.id,
      pos: tileCenter(level, level.boss.tx, level.boss.ty),
      facing: { x: 0, y: 1 },
      hp: bdef.maxHp,
      maxHp: bdef.maxHp,
      phaseIndex: 0,
      actionCooldown: bdef.phases[0]?.actionIntervalTicks ?? 240,
      telegraphTicksLeft: 0,
      pendingAction: null,
      actionCursor: 0,
      chargeTicksLeft: 0,
      chargeDir: { x: 0, y: 1 },
      chargeSpeed: 0,
      chargeDamage: 0,
      touchCooldown: 0
    };
  }

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
      gates,
      secrets,
      projectiles: [],
      boss,
      pressureStage: 0,
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
  updateBoss(sim, events);
  updatePressure(sim, events);
  updateGenerators(sim, events);
  collectPickups(sim, events);
  updateGates(sim, events);
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
    for (const k of POWERUP_KINDS) if (p.power[k] > 0) p.power[k]--;

    // Movement (normalized so diagonals aren't faster). Guarding slows it,
    // the swiftness relic speeds it.
    let mx = clamp(input.moveX, -1, 1);
    let my = clamp(input.moveY, -1, 1);
    const mag = Math.hypot(mx, my);
    if (mag > 1e-6) {
      mx /= Math.max(1, mag);
      my /= Math.max(1, mag);
      p.facing = norm({ x: mx, y: my });
      const guard = hero.ability.kind === 'guard' && p.guardTicks > 0 ? hero.ability : null;
      const moveMult = (guard ? guard.moveMult : 1) * powerMult(sim, p, 'speedMult');
      const step = hero.moveSpeed * moveMult * TICK_DT;
      moveCircle(level, p.pos, hero.radius, mx * step, my * step, blockOf(sim, true));
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

    // Screen-clear potion (#41): a carried consumable, spent on a rising-edge
    // input. No cooldown — scarcity is the limiter (the input is edge-gated).
    if (input.usePotion && p.potions > 0) usePotion(sim, p, events);
  });
}

function performMeleeAttack(sim: Sim, p: PlayerState, atk: AttackDef, events: SimEvent[]): void {
  const { content } = sim.config;
  if (atk.kind !== 'melee') return;
  const damage = heroDamage(sim, p, atk.damage);
  const cosHalfArc = Math.cos(((atk.arcDeg / 2) * Math.PI) / 180);
  events.push({
    type: 'attack',
    playerId: p.id,
    heroId: p.heroId,
    pos: { ...p.pos },
    facing: { ...p.facing },
    range: atk.range,
    arcDeg: atk.arcDeg,
    weight: atk.damage
  });

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
  for (const sw of sim.state.secrets) {
    const d = sub(sw.pos, p.pos);
    const dist = Math.hypot(d.x, d.y);
    if (dist > atk.range + SECRET_RADIUS) continue;
    const dir = dist > 1e-6 ? { x: d.x / dist, y: d.y / dist } : { ...p.facing };
    if (dir.x * p.facing.x + dir.y * p.facing.y < cosHalfArc) continue;
    damageSecret(sim, sw, damage, events);
  }
  const boss = livingBoss(sim);
  if (boss) {
    const bdef = content.bosses[boss.typeId];
    const d = sub(boss.pos, p.pos);
    const dist = Math.hypot(d.x, d.y);
    if (bdef && dist <= atk.range + bdef.radius) {
      const dir = dist > 1e-6 ? { x: d.x / dist, y: d.y / dist } : { ...p.facing };
      if (dir.x * p.facing.x + dir.y * p.facing.y >= cosHalfArc) damageBoss(sim, boss, damage, events);
    }
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
  moveCircle(level, p.pos, hero.radius, dir.x * ab.dashPx, dir.y * ab.dashPx, blockOf(sim, true));
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
  const damage = heroDamage(sim, p, ab.damage);
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
  for (const sw of sim.state.secrets) {
    const dist = Math.hypot(sw.pos.x - center.x, sw.pos.y - center.y);
    if (dist > ab.radius + SECRET_RADIUS) continue;
    damageSecret(sim, sw, damage, events);
  }
  const boss = livingBoss(sim);
  if (boss) {
    const bdef = content.bosses[boss.typeId];
    if (bdef && Math.hypot(boss.pos.x - center.x, boss.pos.y - center.y) <= ab.radius + bdef.radius) {
      damageBoss(sim, boss, damage, events);
    }
  }
}

/**
 * Spend one carried potion (#41): a self-centered screen-clear burst that
 * damages every enemy, generator, prop, and secret wall in its radius, with
 * heavy knockback on enemies. Unlike hero abilities it costs a consumable, not
 * a cooldown — the scarcity is the cost. Deals no self/ally harm.
 */
function usePotion(sim: Sim, p: PlayerState, events: SimEvent[]): void {
  const { content } = sim.config;
  const potion = content.potion;
  p.potions -= 1;
  const center = { ...p.pos };
  events.push({ type: 'potion-used', playerId: p.id, pos: center, radius: potion.radius });

  // Iterate over copies: damageEnemy/damageGenerator/damageProp mutate the
  // live arrays as things die.
  for (const e of [...sim.state.enemies]) {
    if (e.hp <= 0) continue;
    const def = content.enemies[e.typeId];
    if (!def) continue;
    const d = sub(e.pos, center);
    const dist = Math.hypot(d.x, d.y);
    if (dist > potion.radius + def.radius) continue;
    const dir = dist > 1e-6 ? { x: d.x / dist, y: d.y / dist } : { x: 0, y: -1 };
    damageEnemy(sim, e, potion.damage, dir, potion.knockback, p.id, events);
  }
  for (const g of [...sim.state.generators]) {
    if (g.hp <= 0) continue;
    const gdef = content.generators[g.typeId];
    if (!gdef) continue;
    if (Math.hypot(g.pos.x - center.x, g.pos.y - center.y) > potion.radius + gdef.radius) continue;
    damageGenerator(sim, g, potion.damage, events);
  }
  for (const pr of [...sim.state.props]) {
    const pdef = content.props[pr.typeId];
    if (!pdef) continue;
    if (Math.hypot(pr.pos.x - center.x, pr.pos.y - center.y) > potion.radius + pdef.radius) continue;
    damageProp(sim, pr, potion.damage, events);
  }
  for (const sw of [...sim.state.secrets]) {
    if (Math.hypot(sw.pos.x - center.x, sw.pos.y - center.y) > potion.radius + SECRET_RADIUS) continue;
    damageSecret(sim, sw, potion.damage, events);
  }
  // The burst bites the boss too — a hoarded potion is exactly the thing you
  // want to spend in the finale (issues #41 + #25).
  const boss = livingBoss(sim);
  if (boss) {
    const bdef = content.bosses[boss.typeId];
    if (bdef && Math.hypot(boss.pos.x - center.x, boss.pos.y - center.y) <= potion.radius + bdef.radius) {
      damageBoss(sim, boss, potion.damage, events);
    }
  }
}

// ---------------------------------------------------------------------------
// Hero levelling (issue #46)
// ---------------------------------------------------------------------------

/** The level a total XP amount buys, clamped to the curve's cap. */
export function levelForXp(prog: ProgressionDef, xp: number): number {
  let level = 1;
  for (let i = 0; i < prog.xpToReach.length; i++) {
    if (xp >= (prog.xpToReach[i] ?? Infinity)) level = i + 1;
  }
  return level;
}

/** Total XP required to reach the next level, or null at the cap. */
export function xpForNextLevel(prog: ProgressionDef, level: number): number | null {
  return level >= prog.xpToReach.length ? null : (prog.xpToReach[level] ?? null);
}

function levelMaxHpBonus(prog: ProgressionDef, level: number): number {
  return (level - 1) * prog.maxHpPerLevel;
}

function levelDamageBonus(prog: ProgressionDef, level: number): number {
  return (level - 1) * prog.damagePerLevel;
}

/**
 * Credits XP to a player and levels them up if it crosses a threshold. A level
 * grants max HP *and heals by the gain*, so it reads as a reward mid-fight;
 * damage rises through `heroDamage`. Multiple levels can land at once (a boss
 * kill early on), each announced.
 */
function awardXp(sim: Sim, p: PlayerState, amount: number, events: SimEvent[]): void {
  if (amount <= 0 || !p.alive) return;
  const prog = sim.config.content.progression;
  p.xp += amount;
  const earned = levelForXp(prog, p.xp);
  while (p.level < earned) {
    p.level++;
    p.maxHp += prog.maxHpPerLevel;
    p.hp = Math.min(p.maxHp, p.hp + prog.maxHpPerLevel); // the level-up heal
    events.push({ type: 'player-leveled', playerId: p.id, level: p.level, pos: { ...p.pos } });
  }
}

/** Credits XP to a player by id (kills carry the killer's id). */
function awardXpTo(sim: Sim, playerId: EntityId, amount: number, events: SimEvent[]): void {
  const p = sim.state.players.find((x) => x.id === playerId);
  if (p) awardXp(sim, p, amount, events);
}

/**
 * Objective XP (generators, the boss) goes to every living hero, so a co-op
 * party levels together rather than racing for last hits.
 */
function awardObjectiveXp(sim: Sim, amount: number, events: SimEvent[]): void {
  for (const p of sim.state.players) awardXp(sim, p, amount, events);
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

function emptyPowerTimers(): Record<PowerUpKind, number> {
  const timers = {} as Record<PowerUpKind, number>;
  for (const k of POWERUP_KINDS) timers[k] = 0;
  return timers;
}

/** Product of one multiplier field across every currently-active power-up. */
function powerMult(sim: Sim, p: PlayerState, field: 'damageMult' | 'speedMult' | 'damageTakenMult'): number {
  let mult = 1;
  for (const k of POWERUP_KINDS) {
    if (p.power[k] > 0) mult *= sim.config.content.powerups[k][field];
  }
  return mult;
}

/** Outgoing attack/ability damage after flat modifiers and the frenzy buff. */
function heroDamage(sim: Sim, p: PlayerState, base: number): number {
  const levelBonus = levelDamageBonus(sim.config.content.progression, p.level);
  return (base + heroDamageBonus(sim, p) + levelBonus) * powerMult(sim, p, 'damageMult');
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
  e.hitstunTicks = sim.config.content.combat.enemyHitstunTicks;
  e.knockback.x += dir.x * knockback;
  e.knockback.y += dir.y * knockback;
  if (e.hp <= 0) {
    events.push({ type: 'enemy-died', enemyId: e.id, typeId: e.typeId, pos: { ...e.pos }, byPlayer, damage });
    const killer = sim.state.players.find((p) => p.id === byPlayer);
    if (killer) killer.kills++;
    // XP goes to whoever landed the killing blow (issue #46).
    awardXpTo(sim, byPlayer, sim.config.content.enemies[e.typeId]?.xp ?? 0, events);
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
    awardObjectiveXp(sim, def?.xp ?? 0, events); // objective XP is shared
    if (def && def.goldDrop > 0) {
      sim.state.pickups.push({
        id: sim.state.nextEntityId++,
        kind: 'gold',
        amount: def.goldDrop,
        pos: { ...g.pos }
      });
    }
    spawnOnGeneratorDeath(sim, g, def, events);
    sim.state.generators = sim.state.generators.filter((x) => x !== g);
  } else {
    events.push({ type: 'generator-hit', generatorId: g.id, pos: { ...g.pos }, damage });
  }
}

/**
 * One-shot spawn when a generator dies (e.g. an elite bursting from the
 * wreckage). Data-driven via `GeneratorDef.onDeathSpawn`. The spawned enemy is
 * unparented (`sourceGen: null` — no dead generator to cap it) and starts on
 * cooldown, so it pauses to menace before its first windup rather than lunging
 * the instant it claws out on top of whoever cracked the generator open.
 */
function spawnOnGeneratorDeath(sim: Sim, g: GeneratorState, def: GeneratorDef | undefined, events: SimEvent[]): void {
  if (!def?.onDeathSpawn) return;
  const enemyDef = sim.config.content.enemies[def.onDeathSpawn.enemyId];
  if (!enemyDef) return;
  const enemy: EnemyState = {
    id: sim.state.nextEntityId++,
    typeId: enemyDef.id,
    pos: { ...g.pos },
    hp: enemyDef.maxHp,
    attackCooldown: enemyDef.attack.cooldownTicks,
    windupTicksLeft: 0,
    hitstunTicks: 0,
    knockback: { x: 0, y: 0 },
    slowTicks: 0,
    slowMult: 1,
    sourceGen: null
  };
  sim.state.enemies.push(enemy);
  events.push({ type: 'enemy-spawned', enemyId: enemy.id, typeId: enemy.typeId, pos: { ...enemy.pos } });
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
    damage: heroDamage(sim, p, atk.damage),
    knockback: atk.knockback,
    hitIds: [],
    hostile: false
  };
  sim.state.projectiles.push(projectile);
  events.push({
    type: 'projectile-fired',
    playerId: p.id,
    heroId: p.heroId,
    projectileId: projectile.id,
    pos: { ...projectile.pos },
    vel: { ...projectile.vel },
    radius: atk.radius,
    pierce: atk.pierce,
    weight: atk.damage
  });
}

/** Spawns one hostile bolt from an enemy toward a target position. */
function spawnEnemyProjectile(
  sim: Sim,
  e: EnemyState,
  attack: EnemyBoltAttackDef,
  radius: number,
  target: Vec2,
  events: SimEvent[]
): void {
  // A roused hive spits harder. Scaled here, at the enemy call site, so the
  // boss's glob — which shares this bolt plumbing — keeps its authored damage
  // and escalates through her own phase script instead (#41 x #25).
  spawnHostileBolt(
    sim,
    e.id,
    e.pos,
    radius,
    attack,
    attack.damage,
    norm(sub(target, e.pos)),
    events,
    pressureDamageMult(sim)
  );
}

/** Spawns one evenly spaced, target-centred fan from a Spitter. */
function spawnEnemyVolley(
  sim: Sim,
  e: EnemyState,
  attack: EnemyVolleyAttackDef,
  radius: number,
  target: Vec2,
  events: SimEvent[]
): void {
  const aim = norm(sub(target, e.pos));
  const base = Math.atan2(aim.y, aim.x);
  const spread = (attack.spreadDeg * Math.PI) / 180;
  for (let i = 0; i < attack.count; i++) {
    const fraction = attack.count > 1 ? i / (attack.count - 1) : 0.5;
    const angle = base + (fraction - 0.5) * spread;
    spawnHostileBolt(
      sim,
      e.id,
      e.pos,
      radius,
      attack,
      attack.damage,
      { x: Math.cos(angle), y: Math.sin(angle) },
      events,
      pressureDamageMult(sim),
      false
    );
  }
  events.push({
    type: 'enemy-volley',
    enemyId: e.id,
    family: sim.config.content.enemies[e.typeId]?.family ?? 'spitter',
    pos: { ...e.pos },
    dir: aim,
    count: attack.count,
    spreadDeg: attack.spreadDeg,
    weight: attack.damage
  });
}

/**
 * Spawns one hostile bolt from any attacker (enemy or boss) along a direction.
 * Single bolts report `enemy-shot`; a volley suppresses those per-bolt cues and
 * emits one `enemy-volley` event so its fan reads and sounds like one attack.
 */
function spawnHostileBolt(
  sim: Sim,
  ownerId: EntityId,
  origin: Vec2,
  originRadius: number,
  projectileDef: HostileProjectileDef,
  damage: number,
  dirIn: Vec2,
  events: SimEvent[],
  damageMult = 1,
  emitShotEvent = true
): void {
  const dir = norm(dirIn);
  const spawnDist = originRadius + projectileDef.projectileRadius + 1;
  const projectile: ProjectileState = {
    id: sim.state.nextEntityId++,
    ownerId,
    pos: { x: origin.x + dir.x * spawnDist, y: origin.y + dir.y * spawnDist },
    vel: { x: dir.x * projectileDef.projectileSpeed, y: dir.y * projectileDef.projectileSpeed },
    radius: projectileDef.projectileRadius,
    distanceLeft: projectileDef.projectileRange,
    pierceLeft: 0,
    damage: damage * damageMult,
    knockback: 0,
    hitIds: [],
    hostile: true
  };
  sim.state.projectiles.push(projectile);
  if (emitShotEvent) {
    events.push({
      type: 'enemy-shot',
      enemyId: ownerId,
      projectileId: projectile.id,
      pos: { ...projectile.pos },
      vel: { ...projectile.vel }
    });
  }
}

/** Advances bolts: fly, stop at walls, damage what they touch, pierce, expire. */
function updateProjectiles(sim: Sim, events: SimEvent[]): void {
  const s = sim.state;
  if (s.projectiles.length === 0) return;
  const { level, content } = sim.config;

  const surviving: ProjectileState[] = [];
  const barrier = blockOf(sim, false); // gates stop bolts; secrets take damage instead
  for (const bolt of s.projectiles) {
    const stepLen = Math.hypot(bolt.vel.x, bolt.vel.y) * TICK_DT;
    const next = { x: bolt.pos.x + bolt.vel.x * TICK_DT, y: bolt.pos.y + bolt.vel.y * TICK_DT };

    if (circleHitsWall(level, next, bolt.radius, barrier)) {
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

      // The boss is a solid target: a bolt striking her stops there.
      if (!dead) {
        const boss = livingBoss(sim);
        const bdef = boss ? content.bosses[boss.typeId] : undefined;
        if (boss && bdef && Math.hypot(boss.pos.x - bolt.pos.x, boss.pos.y - bolt.pos.y) <= bolt.radius + bdef.radius) {
          events.push({ type: 'projectile-hit', projectileId: bolt.id, pos: { ...bolt.pos } });
          damageBoss(sim, boss, bolt.damage, events);
          dead = true;
        }
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
      // Player bolts chip secret walls open too.
      if (!dead) {
        for (const sw of s.secrets) {
          if (Math.hypot(sw.pos.x - bolt.pos.x, sw.pos.y - bolt.pos.y) > bolt.radius + SECRET_RADIUS) continue;
          events.push({ type: 'projectile-hit', projectileId: bolt.id, pos: { ...bolt.pos } });
          damageSecret(sim, sw, bolt.damage, events);
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
    const damage = bolt.damage * (guard ? guard.damageMult : 1) * powerMult(sim, p, 'damageTakenMult');
    p.hp -= damage;
    p.invulnTicks = content.combat.playerHitInvulnTicks;
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
  const blk = blockOf(sim, true);

  for (const e of s.enemies) {
    const def = content.enemies[e.typeId];
    if (!def) continue;
    const attack = def.attack;
    if (e.attackCooldown > 0) e.attackCooldown--;
    if (e.slowTicks > 0) e.slowTicks--;

    // Knockback overrides steering while it is meaningful.
    const kbMag = Math.hypot(e.knockback.x, e.knockback.y);
    if (kbMag > 1) {
      moveCircle(level, e.pos, def.radius, e.knockback.x * TICK_DT, e.knockback.y * TICK_DT, blk);
      e.knockback.x *= content.combat.knockbackDecay;
      e.knockback.y *= content.combat.knockbackDecay;
    } else {
      e.knockback.x = 0;
      e.knockback.y = 0;
    }
    if (e.hitstunTicks > 0) {
      e.hitstunTicks--;
      continue;
    }

    const target = nearestLivingPlayer(s.players, e.pos);
    if (!target) {
      e.windupTicksLeft = 0; // no one to strike — drop any pending windup
      e.windupDir = undefined;
      e.windupLength = undefined;
      continue;
    }
    const d = sub(target.pos, e.pos);
    const dist = Math.hypot(d.x, d.y);

    // A committed attack windup: hold position, tick the telegraph down, and
    // resolve the strike when it lands. A melee swing whiffs if the target
    // slipped out of reach, so every hit — first contact included — is
    // dodgeable by reading the windup and stepping away.
    if (e.windupTicksLeft > 0) {
      e.windupTicksLeft--;
      if (e.windupTicksLeft === 0) executeEnemyAttack(sim, e, def, target, events);
      continue;
    }

    // Steering. Close the gap when out of range; kiting families instead give
    // ground while the target is inside their comfort band (issue #23), so
    // artillery reopens the range rather than firing point-blank. Steering and
    // attacking are independent, so a spitter can shoot while backing off.
    const keepDistance = attack.range * (def.keepDistanceFraction ?? 0);
    const step =
      def.moveSpeed * pressureSpeedMult(sim, sim.config.content.pressure) * (e.slowTicks > 0 ? e.slowMult : 1) * TICK_DT;
    if (dist > attack.range) {
      moveCircle(level, e.pos, def.radius, (d.x / dist) * step, (d.y / dist) * step, blk);
    } else if (dist < keepDistance && dist > 1e-6) {
      moveCircle(level, e.pos, def.radius, (-d.x / dist) * step, (-d.y / dist) * step, blk);
    }

    // Attacking, only from inside its range. Melee still respects i-frames.
    const ranged = attack.kind === 'bolt' || attack.kind === 'volley';
    if (dist <= attack.range && e.attackCooldown === 0 && (ranged || target.invulnTicks === 0)) {
      // Begin the telegraph instead of striking instantly. (No enemy ships a
      // zero windup, but a 0 would resolve the attack the same tick.)
      if (attack.windupTicks > 0) {
        e.windupTicksLeft = attack.windupTicks;
        e.windupDir = undefined;
        e.windupLength = undefined;
        if ((attack.kind === 'contact' || attack.kind === 'line' || attack.kind === 'pounce') && dist > 1e-6) {
          e.windupDir = { x: d.x / dist, y: d.y / dist };
          if (attack.kind === 'line') {
            e.windupLength = wallClippedEnemyLineLength(sim, e.pos, e.windupDir, attack.length);
          } else if (attack.kind === 'pounce') {
            e.windupLength = wallClippedEnemyPounceLength(sim, e.pos, e.windupDir, attack.distance, def.radius);
          }
        }
        events.push({
          type: 'enemy-windup',
          enemyId: e.id,
          family: def.family,
          attackKind: attack.kind,
          pos: { ...e.pos },
          durationTicks: attack.windupTicks
        });
      } else {
        executeEnemyAttack(sim, e, def, target, events);
      }
    }
  }
}

/**
 * Resolves a committed enemy attack (the release of a windup). Ranged families
 * always launch their glob; melee families connect only if the target is still
 * in reach and out of i-frames — otherwise the swing whiffs, but it still pays
 * its cooldown, so a dodged telegraph has real recovery. Mirrors the guard/ward
 * damage reduction and Bastion Wall knockback-reflect of the old inline strike.
 */
function executeEnemyAttack(sim: Sim, e: EnemyState, def: EnemyDef, target: PlayerState, events: SimEvent[]): void {
  const attack = def.attack;
  e.attackCooldown = attack.cooldownTicks;
  if (attack.kind === 'bolt') {
    spawnEnemyProjectile(sim, e, attack, def.radius, target.pos, events);
    return;
  }
  if (attack.kind === 'volley') {
    spawnEnemyVolley(sim, e, attack, def.radius, target.pos, events);
    return;
  }
  if (attack.kind === 'pounce') {
    executeEnemyPounceAttack(sim, e, attack, def, events);
    return;
  }
  if (attack.kind === 'line') {
    executeEnemyLineAttack(sim, e, attack, def, events);
    return;
  }
  const d = sub(target.pos, e.pos);
  const dist = Math.hypot(d.x, d.y);
  const dir = e.windupDir ?? (dist > 1e-6 ? { x: d.x / dist, y: d.y / dist } : { x: 1, y: 0 });
  e.windupDir = undefined;
  events.push({
    type: 'enemy-contact',
    enemyId: e.id,
    family: def.family,
    pos: { ...e.pos },
    dir,
    range: attack.range,
    arcDeg: attack.arcDeg,
    weight: attack.damage
  });
  if (dist > attack.range || target.invulnTicks > 0) return; // whiffed, or target immune
  const targetDir = dist > 1e-6 ? { x: d.x / dist, y: d.y / dist } : dir;
  const cosHalfArc = Math.cos(((attack.arcDeg / 2) * Math.PI) / 180);
  if (targetDir.x * dir.x + targetDir.y * dir.y < cosHalfArc) return; // flanked during the tell
  damagePlayerFromEnemy(sim, e, attack.damage, target, d, dist, attack.pushPx, events);
}

/**
 * Resolves the Skitter's committed leap. Direction and wall-clipped travel are
 * captured when the tell begins, so moving sideways wins while standing in
 * the lane is hit by the body sweeping from start to finish.
 */
function executeEnemyPounceAttack(
  sim: Sim,
  e: EnemyState,
  attack: Extract<EnemyDef['attack'], { kind: 'pounce' }>,
  def: EnemyDef,
  events: SimEvent[]
): void {
  const from = { ...e.pos };
  const dir = e.windupDir ?? { x: 1, y: 0 };
  const distance = e.windupLength ?? wallClippedEnemyPounceLength(sim, from, dir, attack.distance, def.radius);
  e.windupDir = undefined;
  e.windupLength = undefined;
  e.pos.x = from.x + dir.x * distance;
  e.pos.y = from.y + dir.y * distance;
  events.push({
    type: 'enemy-pounce',
    enemyId: e.id,
    family: def.family,
    from,
    to: { ...e.pos },
    width: attack.width,
    weight: attack.damage
  });

  for (const player of sim.state.players) {
    if (!player.alive || player.invulnTicks > 0) continue;
    const rel = sub(player.pos, from);
    const along = rel.x * dir.x + rel.y * dir.y;
    const closestAlong = Math.max(0, Math.min(distance, along));
    const closest = { x: from.x + dir.x * closestAlong, y: from.y + dir.y * closestAlong };
    const offset = sub(player.pos, closest);
    const playerRadius = sim.config.content.heroes[player.heroId]?.radius ?? 12;
    if (Math.hypot(offset.x, offset.y) > attack.width / 2 + playerRadius) continue;
    const dist = Math.hypot(rel.x, rel.y);
    damagePlayerFromEnemy(sim, e, attack.damage, player, rel, dist, 0, events);
  }
}

/** Resolves the Ravager's committed, wall-clipped line rupture. */
function executeEnemyLineAttack(
  sim: Sim,
  e: EnemyState,
  attack: Extract<EnemyDef['attack'], { kind: 'line' }>,
  def: EnemyDef,
  events: SimEvent[]
): void {
  const dir = e.windupDir ?? { x: 1, y: 0 };
  e.windupDir = undefined;
  const halfWidth = attack.width / 2;
  const length = e.windupLength ?? wallClippedEnemyLineLength(sim, e.pos, dir, attack.length);
  e.windupLength = undefined;
  events.push({
    type: 'enemy-line-attack',
    enemyId: e.id,
    family: def.family,
    pos: { ...e.pos },
    dir: { ...dir },
    length,
    width: attack.width,
    weight: attack.damage
  });

  for (const player of sim.state.players) {
    if (!player.alive || player.invulnTicks > 0) continue;
    const rel = sub(player.pos, e.pos);
    const along = rel.x * dir.x + rel.y * dir.y;
    if (along < 0 || along > length) continue;
    const perpendicular = Math.abs(rel.x * -dir.y + rel.y * dir.x);
    const playerRadius = sim.config.content.heroes[player.heroId]?.radius ?? 12;
    if (perpendicular > halfWidth + playerRadius) continue;
    const dist = Math.hypot(rel.x, rel.y);
    damagePlayerFromEnemy(sim, e, attack.damage, player, rel, dist, attack.pushPx, events, dir);
  }
}

function wallClippedEnemyLineLength(sim: Sim, pos: Vec2, dir: Vec2, maxLength: number): number {
  const blk = blockOf(sim, true);
  for (let distance = 4; distance <= maxLength; distance += 4) {
    const probe = { x: pos.x + dir.x * distance, y: pos.y + dir.y * distance };
    // Clip on the centre seam. The full visual width may brush an adjacent
    // wall without the committed line actually crossing it.
    if (circleHitsWall(sim.config.level, probe, 2, blk)) return Math.max(0, distance - 4);
  }
  return maxLength;
}

/** Returns the furthest safe point for the Skitter's full collision circle. */
function wallClippedEnemyPounceLength(
  sim: Sim,
  pos: Vec2,
  dir: Vec2,
  maxLength: number,
  radius: number
): number {
  const blk = blockOf(sim, true);
  let safeDistance = 0;
  for (let distance = 2; distance <= maxLength; distance += 2) {
    const probe = { x: pos.x + dir.x * distance, y: pos.y + dir.y * distance };
    if (circleHitsWall(sim.config.level, probe, radius, blk)) return safeDistance;
    safeDistance = distance;
  }
  if (safeDistance < maxLength) {
    const probe = { x: pos.x + dir.x * maxLength, y: pos.y + dir.y * maxLength };
    if (circleHitsWall(sim.config.level, probe, radius, blk)) return safeDistance;
  }
  return maxLength;
}

function damagePlayerFromEnemy(
  sim: Sim,
  e: EnemyState,
  attackDamage: number,
  target: PlayerState,
  d: Vec2,
  dist: number,
  pushPx: number,
  events: SimEvent[],
  pushDir?: Vec2
): void {
  const guard = guardDefFor(sim, target);
  const damage =
    attackDamage * pressureDamageMult(sim) * (guard ? guard.damageMult : 1) * powerMult(sim, target, 'damageTakenMult');
  target.hp -= damage;
  target.invulnTicks = sim.config.content.combat.playerHitInvulnTicks;
  if (pushPx > 0) {
    const dir = pushDir ?? (dist > 1e-6 ? { x: d.x / dist, y: d.y / dist } : { x: 0, y: 0 });
    const guardedPush = pushPx * (guard ? guard.damageMult : 1);
    moveCircle(
      sim.config.level,
      target.pos,
      sim.config.content.heroes[target.heroId]?.radius ?? 12,
      dir.x * guardedPush,
      dir.y * guardedPush,
      blockOf(sim, true)
    );
  }
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

/** Light pairwise push-apart so hordes read as a crowd, not a stack. */
function separateEnemies(sim: Sim): void {
  const { level, content } = sim.config;
  const blk = blockOf(sim, true);
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
      moveCircle(level, a.pos, ra, -nx * push, -ny * push, blk);
      moveCircle(level, b.pos, rb, nx * push, ny * push, blk);
    }
  }
}

// ---------------------------------------------------------------------------
// Mission time pressure — "the hive rouses" (issue #41)
// ---------------------------------------------------------------------------

/**
 * Advances the mission clock and rouses the hive a stage at a time. Purely a
 * function of `tick`, so it stays deterministic and replay-safe.
 */
function updatePressure(sim: Sim, events: SimEvent[]): void {
  const s = sim.state;
  const def = sim.config.content.pressure;
  if (s.pressureStage >= def.maxStage) return;
  if (s.tick < def.gracePeriodTicks) return;
  const elapsed = s.tick - def.gracePeriodTicks;
  const earned = Math.min(def.maxStage, 1 + Math.floor(elapsed / Math.max(1, def.intervalTicks)));
  if (earned > s.pressureStage) {
    s.pressureStage = earned;
    events.push({ type: 'pressure-rose', stage: earned });
  }
}

/** Enemy move-speed scale from the current pressure stage. */
function pressureSpeedMult(sim: Sim, def: PressureDef): number {
  return 1 + def.moveSpeedPerStage * sim.state.pressureStage;
}

/** Enemy damage scale from the current pressure stage (contact and spat). */
function pressureDamageMult(sim: Sim): number {
  const def = sim.config.content.pressure;
  return 1 + def.damagePerStage * sim.state.pressureStage;
}

/** Spawn-interval scale; compounds per stage, so spawners quicken as it rises. */
function pressureIntervalMult(sim: Sim): number {
  const def = sim.config.content.pressure;
  return Math.pow(def.spawnIntervalMult, sim.state.pressureStage);
}

// ---------------------------------------------------------------------------
// Boss (issue #25)
// ---------------------------------------------------------------------------

/** The phase whose HP threshold the boss has fallen to (authored 1 first). */
function bossPhaseIndex(def: BossDef, hpFraction: number): number {
  let idx = 0;
  for (let i = 0; i < def.phases.length; i++) {
    if (hpFraction <= def.phases[i]!.hpFraction) idx = i;
  }
  return idx;
}

/**
 * Drives the boss: phase escalation by HP, a telegraph-then-release action
 * cycle, authored charges, and body-contact damage. Every damaging action is
 * preceded by `telegraphTicks` of standing still, which is the whole fight —
 * read the tell, step away, punish the recovery.
 */
function updateBoss(sim: Sim, events: SimEvent[]): void {
  const s = sim.state;
  const boss = s.boss;
  if (!boss || boss.hp <= 0) return;
  const { level, content } = sim.config;
  const def = content.bosses[boss.typeId];
  if (!def) return;

  // Phase escalation. Entering a phase resets the action clock to its pace.
  const idx = bossPhaseIndex(def, boss.hp / boss.maxHp);
  if (idx !== boss.phaseIndex) {
    boss.phaseIndex = idx;
    boss.actionCursor = 0;
    boss.actionCooldown = Math.min(boss.actionCooldown, def.phases[idx]!.actionIntervalTicks);
    events.push({ type: 'boss-phase', bossId: boss.id, phaseIndex: idx, name: def.phases[idx]!.name, pos: { ...boss.pos } });
  }
  const phase = def.phases[boss.phaseIndex]!;

  if (boss.touchCooldown > 0) boss.touchCooldown--;
  const target = nearestLivingPlayer(s.players, boss.pos);
  if (target) boss.facing = norm(sub(target.pos, boss.pos));

  // An active authored charge overrides everything: the boss barrels along
  // its locked-in heading until it expires or a wall stops it.
  if (boss.chargeTicksLeft > 0) {
    boss.chargeTicksLeft--;
    const before = { ...boss.pos };
    const step = boss.chargeSpeed * TICK_DT;
    moveCircle(level, boss.pos, def.radius, boss.chargeDir.x * step, boss.chargeDir.y * step, blockOf(sim, true));
    if (Math.hypot(boss.pos.x - before.x, boss.pos.y - before.y) < step * 0.25) boss.chargeTicksLeft = 0; // hit a wall
    bossContactDamage(sim, boss, def, boss.chargeDamage, events);
    return;
  }

  // Winding up: hold still so the tell is unmistakable, then release.
  if (boss.telegraphTicksLeft > 0) {
    boss.telegraphTicksLeft--;
    if (boss.telegraphTicksLeft === 0) {
      const actionRef = boss.pendingAction;
      boss.pendingAction = null;
      boss.actionCooldown = phase.actionIntervalTicks;
      const action = actionRef ? bossActionAt(def, actionRef) : undefined;
      if (action) executeBossAction(sim, boss, def, action, events);
    }
    bossContactDamage(sim, boss, def, def.touchDamage, events);
    return;
  }

  // Otherwise: count down to the next action, lumbering after the party.
  if (boss.actionCooldown > 0) {
    boss.actionCooldown--;
  } else {
    const actionIndex = boss.actionCursor % phase.actions.length;
    const action = phase.actions[actionIndex];
    boss.actionCursor++;
    if (action) {
      boss.pendingAction = { phaseIndex: boss.phaseIndex, actionIndex };
      boss.telegraphTicksLeft = def.telegraphTicks;
      events.push({
        type: 'boss-telegraph',
        bossId: boss.id,
        actionId: action.id,
        actionKind: action.kind,
        tell: action.tell,
        pos: { ...boss.pos },
        durationTicks: def.telegraphTicks
      });
    }
  }

  if (target) {
    const d = sub(target.pos, boss.pos);
    const dist = Math.hypot(d.x, d.y);
    if (dist > def.radius * 0.5) {
      const step = phase.moveSpeed * TICK_DT;
      moveCircle(level, boss.pos, def.radius, (d.x / dist) * step, (d.y / dist) * step, blockOf(sim, true));
    }
  }
  bossContactDamage(sim, boss, def, def.touchDamage, events);
}

/** Body contact: hurts any player overlapping her, rate-limited by cooldown. */
function bossContactDamage(sim: Sim, boss: BossState, def: BossDef, damage: number, events: SimEvent[]): void {
  if (boss.touchCooldown > 0) return;
  for (const p of sim.state.players) {
    if (!p.alive || p.invulnTicks > 0) continue;
    const hero = sim.config.content.heroes[p.heroId];
    if (!hero) continue;
    if (Math.hypot(p.pos.x - boss.pos.x, p.pos.y - boss.pos.y) > def.radius + hero.radius) continue;
    const guard = guardDefFor(sim, p);
    const dealt = damage * (guard ? guard.damageMult : 1) * powerMult(sim, p, 'damageTakenMult');
    p.hp -= dealt;
    p.invulnTicks = sim.config.content.combat.playerHitInvulnTicks;
    boss.touchCooldown = def.touchCooldownTicks;
    events.push({ type: 'player-hit', playerId: p.id, damage: dealt, pos: { ...p.pos } });
    if (guard) events.push({ type: 'guard-block', playerId: p.id, enemyId: boss.id, pos: { ...p.pos } });
    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      events.push({ type: 'player-died', playerId: p.id, pos: { ...p.pos } });
    }
    return; // one victim per swing
  }
}

/** Resolves a serializable action pointer against the boss's authored phases. */
function bossActionAt(def: BossDef, ref: BossActionRef): BossActionDef | undefined {
  return def.phases[ref.phaseIndex]?.actions[ref.actionIndex];
}

/** Releases one telegraphed action through the reusable boss vocabulary. */
function executeBossAction(sim: Sim, boss: BossState, def: BossDef, action: BossActionDef, events: SimEvent[]): void {
  if (action.kind === 'charge') {
    boss.chargeDir = { ...boss.facing };
    boss.chargeTicksLeft = action.durationTicks;
    boss.chargeSpeed = action.speed;
    boss.chargeDamage = action.damage;
    return;
  }
  if (action.kind === 'volley') {
    const base = Math.atan2(boss.facing.y, boss.facing.x);
    const spread = (action.spreadDeg * Math.PI) / 180;
    for (let i = 0; i < action.count; i++) {
      const frac = action.count > 1 ? i / (action.count - 1) : 0.5;
      const angle = base + (frac - 0.5) * spread;
      spawnHostileBolt(
        sim,
        boss.id,
        boss.pos,
        def.radius,
        action,
        action.projectileDamage,
        { x: Math.cos(angle), y: Math.sin(angle) },
        events
      );
    }
    return;
  }
  summonBossEnemies(sim, boss, def, action, events);
}

/** Births an authored clutch of enemies on a ring around the boss. */
function summonBossEnemies(
  sim: Sim,
  boss: BossState,
  def: BossDef,
  action: Extract<BossActionDef, { kind: 'summon' }>,
  events: SimEvent[]
): void {
  const s = sim.state;
  const enemyDef = sim.config.content.enemies[action.enemyId];
  if (!enemyDef) return;
  for (let n = 0; n < action.count; n++) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const [v, next] = rngNext(s.rngState);
      s.rngState = next;
      const angle = v * Math.PI * 2;
      const dist = def.radius + enemyDef.radius + 8;
      const pos = { x: boss.pos.x + Math.cos(angle) * dist, y: boss.pos.y + Math.sin(angle) * dist };
      if (circleHitsWall(sim.config.level, pos, enemyDef.radius, blockOf(sim, true))) continue;
      const enemy: EnemyState = {
        id: s.nextEntityId++,
        typeId: enemyDef.id,
        pos,
        hp: enemyDef.maxHp,
        attackCooldown: 0,
        windupTicksLeft: 0,
        hitstunTicks: 0,
        knockback: { x: 0, y: 0 },
        slowTicks: 0,
        slowMult: 1,
        sourceGen: null // no generator owns these, so no alive-cap applies
      };
      s.enemies.push(enemy);
      events.push({ type: 'enemy-spawned', enemyId: enemy.id, typeId: enemy.typeId, pos: { ...pos } });
      break;
    }
  }
}

/** Player damage onto the boss. At zero HP she dies and drops her hoard. */
function damageBoss(sim: Sim, boss: BossState, damage: number, events: SimEvent[]): void {
  if (boss.hp <= 0) return;
  const def = sim.config.content.bosses[boss.typeId];
  boss.hp -= damage;
  if (boss.hp <= 0) {
    boss.hp = 0;
    boss.chargeTicksLeft = 0;
    boss.telegraphTicksLeft = 0;
    boss.pendingAction = null;
    events.push({ type: 'boss-died', bossId: boss.id, pos: { ...boss.pos } });
    awardObjectiveXp(sim, def?.xp ?? 0, events); // the finale payout, shared
    if (def && def.goldDrop > 0) {
      sim.state.pickups.push({
        id: sim.state.nextEntityId++,
        kind: 'gold',
        amount: def.goldDrop,
        pos: { ...boss.pos }
      });
    }
  } else {
    events.push({ type: 'boss-hit', bossId: boss.id, pos: { ...boss.pos }, damage });
  }
}

/** The living boss as a damageable target, or null. */
function livingBoss(sim: Sim): BossState | null {
  const b = sim.state.boss;
  return b && b.hp > 0 ? b : null;
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
      if (circleHitsWall(level, pos, enemyDef.radius, blockOf(sim, true))) continue;
      const enemy: EnemyState = {
        id: s.nextEntityId++,
        typeId: enemyDef.id,
        pos,
        hp: enemyDef.maxHp,
        attackCooldown: 0,
        windupTicksLeft: 0,
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
    const baseInterval = g.enrageTicksLeft > 0 ? enragedInterval(def) : def.spawnIntervalTicks;
    g.spawnCooldown = Math.max(1, Math.round(baseInterval * pressureIntervalMult(sim)));
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
        events.push({ type: 'pickup-collected', playerId: p.id, kind: pk.kind, amount: pk.amount, pos: { ...pk.pos } });
      } else if (pk.kind === 'powerup' && pk.power) {
        // (Re)start the buff timer; grabbing the same relic again refreshes it.
        p.power[pk.power] = content.powerups[pk.power].durationTicks;
        events.push({ type: 'powerup-gained', playerId: p.id, power: pk.power, pos: { ...pk.pos } });
      } else if (pk.kind === 'key') {
        p.keys += pk.amount;
        events.push({ type: 'pickup-collected', playerId: p.id, kind: pk.kind, amount: pk.amount, pos: { ...pk.pos } });
      } else if (pk.kind === 'potion') {
        p.potions += pk.amount;
        events.push({ type: 'pickup-collected', playerId: p.id, kind: pk.kind, amount: pk.amount, pos: { ...pk.pos } });
      } else {
        p.gold += pk.amount;
        events.push({ type: 'pickup-collected', playerId: p.id, kind: pk.kind, amount: pk.amount, pos: { ...pk.pos } });
      }
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

  // The way out opens once every spawner is down AND the level's boss (if any)
  // has fallen — on a boss realm she IS the objective (issue #25).
  if (s.phase === 'combat' && s.generators.length === 0 && livingBoss(sim) === null) {
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

/**
 * The current dynamic collision overlay (issue #17): locked gates always
 * block; intact secret walls block movement (`includeSecrets`) but not
 * projectiles (bolts damage them via an explicit collision instead, so a
 * secret can be shot open once its guarding gate is passed).
 */
function blockOf(sim: Sim, includeSecrets: boolean): Blockage {
  const s = sim.state;
  const width = sim.config.level.walls[0]?.length ?? 0;
  const blockedTiles: number[] = [];
  for (const g of s.gates) if (g.locked) blockedTiles.push(g.ty * width + g.tx);
  if (includeSecrets) for (const sw of s.secrets) blockedTiles.push(sw.ty * width + sw.tx);
  return { blockedTiles, width };
}

/** A player standing against a locked gate with a key in hand opens it. */
function updateGates(sim: Sim, events: SimEvent[]): void {
  const { content, level } = sim.config;
  for (const gate of sim.state.gates) {
    if (!gate.locked) continue;
    for (const p of sim.state.players) {
      if (!p.alive || p.keys <= 0) continue;
      const hero = content.heroes[p.heroId];
      if (!hero) continue;
      const reach = hero.radius + level.tileSize * 0.6;
      if (Math.hypot(p.pos.x - gate.pos.x, p.pos.y - gate.pos.y) > reach) continue;
      p.keys -= 1;
      gate.locked = false;
      events.push({ type: 'gate-opened', gateId: gate.id, pos: { ...gate.pos } });
      break;
    }
  }
}

/** A secret wall takes damage; at zero HP it crumbles into an open passage. */
function damageSecret(sim: Sim, sw: SecretWallState, damage: number, events: SimEvent[]): void {
  sw.hp -= damage;
  if (sw.hp <= 0) {
    events.push({ type: 'secret-revealed', secretId: sw.id, pos: { ...sw.pos } });
    sim.state.secrets = sim.state.secrets.filter((x) => x !== sw);
  } else {
    events.push({ type: 'secret-hit', secretId: sw.id, pos: { ...sw.pos }, damage });
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
