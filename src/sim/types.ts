/**
 * Core simulation types. This module (and everything under src/sim and
 * src/content) must stay free of Phaser and browser APIs: the simulation
 * is a deterministic fixed-timestep state machine driven only by input
 * commands and a seeded RNG, so it can later run in lockstep for online
 * co-op and be tested headlessly.
 */

export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;

export interface Vec2 {
  x: number;
  y: number;
}

/** Per-player input sampled once per tick. */
export interface InputCommand {
  moveX: number; // -1..1
  moveY: number; // -1..1
  attack: boolean;
  ability: boolean;
}

export const EMPTY_INPUT: InputCommand = Object.freeze({
  moveX: 0,
  moveY: 0,
  attack: false,
  ability: false
});

export type EntityId = number;

// ---------------------------------------------------------------------------
// Content definitions (data-driven; authored in src/content)
// ---------------------------------------------------------------------------

export interface MeleeAttackDef {
  kind: 'melee';
  damage: number;
  range: number;
  arcDeg: number;
  knockback: number;
  cooldownTicks: number;
}

export interface ProjectileAttackDef {
  kind: 'projectile';
  damage: number;
  /** Bolt speed in px/s. */
  speed: number;
  /** Bolt collision radius in px. */
  radius: number;
  /** Max flight distance in px. */
  range: number;
  cooldownTicks: number;
  /** Extra enemies a bolt passes through after its first hit. */
  pierce: number;
  knockback: number;
}

export type AttackDef = MeleeAttackDef | ProjectileAttackDef;

interface AbilityBase {
  id: string;
  name: string;
  cooldownTicks: number;
}

/** Area burst centered on (or offset ahead of) the caster. */
export interface BlastAbilityDef extends AbilityBase {
  kind: 'blast';
  damage: number;
  radius: number;
  knockback: number;
  /** Cast center offset along the facing, in px (default 0 = self-centered). */
  offsetPx?: number;
  /** Enemies hit are slowed for this many ticks (with slowMult applied). */
  slowTicks?: number;
  /** Movement-speed multiplier while slowed (e.g. 0.1 = near-rooted). */
  slowMult?: number;
}

/**
 * Reposition dash that sprays a fan of the hero's own projectile darts
 * backward along the dash. The dash is an instant, wall-clipped move (no
 * i-frames); the darts reuse the hero's projectile attack def.
 */
export interface DashVolleyAbilityDef extends AbilityBase {
  kind: 'dash-volley';
  /** Dash distance along the facing, in px (wall-clipped via moveCircle). */
  dashPx: number;
  /** Number of darts sprayed backward across the fan. */
  dartCount: number;
  /** Total angular spread of the backward fan, in degrees. */
  spreadDeg: number;
}

/**
 * Timed guard stance: while active, incoming damage is scaled down, movement
 * is slowed, and each blocked hit shoves the attacker back. Magnitudes are
 * data; the runtime effect lives on PlayerState.guardTicks.
 */
export interface GuardAbilityDef extends AbilityBase {
  kind: 'guard';
  /** How long the stance holds, in ticks. */
  durationTicks: number;
  /** Incoming-damage multiplier while guarding (e.g. 0.25). */
  damageMult: number;
  /** Move-speed multiplier while guarding (e.g. 0.5). */
  moveMult: number;
  /** Knockback impulse reflected onto an attacker whose hit is blocked. */
  reflectKnockback: number;
}

export type AbilityDef = BlastAbilityDef | DashVolleyAbilityDef | GuardAbilityDef;

/**
 * How a hero is recruited on the hero-select screen. A hero with no `unlock`
 * is available from the very first run (the default Vanguard must stay this
 * way so the e2e Enter-flow starts a Vanguard mission). Both gates may apply:
 * a hero can require missions cleared *and* a one-time gold purchase.
 */
export interface HeroUnlockDef {
  /** Missions that must be cleared before the hero can be recruited at all. */
  missionsCompleted?: number;
  /** One-time gold cost, spent from the meta bank, to permanently recruit. */
  goldCost?: number;
}

export interface HeroDef {
  id: string;
  name: string;
  role: string;
  description: string;
  maxHp: number;
  moveSpeed: number; // world units (px) per second
  radius: number;
  attack: AttackDef;
  ability: AbilityDef;
  /** Recruitment gate; omit for a hero that is always available. */
  unlock?: HeroUnlockDef;
}

/**
 * Enemy visual grammar (issue #7): every enemy belongs to a silhouette
 * family and a palette tier. The texture generator composes family x tier,
 * so new enemies are pure content-data entries with zero drawing code.
 */
export const ENEMY_FAMILIES = ['skitter', 'husk', 'spitter'] as const;
export type EnemyFamily = (typeof ENEMY_FAMILIES)[number];

export const ENEMY_TIERS = ['common', 'veteran', 'elite'] as const;
export type EnemyTier = (typeof ENEMY_TIERS)[number];

/** A ranged enemy attack: at attackRange, the enemy spits a hostile bolt. */
export interface EnemyRangedDef {
  /** Bolt speed in px/s. */
  projectileSpeed: number;
  /** Bolt collision radius in px. */
  projectileRadius: number;
  projectileDamage: number;
  /** Max flight distance in px. */
  projectileRange: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  /** Silhouette family: owns the body shape and animation frames. */
  family: EnemyFamily;
  /** Palette/size tier within the family. */
  tier: EnemyTier;
  maxHp: number;
  moveSpeed: number;
  radius: number;
  touchDamage: number;
  attackRange: number;
  attackCooldownTicks: number;
  goldMin: number;
  goldMax: number;
  /** If present, the enemy fires hostile bolts at attackRange instead of meleeing. */
  ranged?: EnemyRangedDef;
}

/** One-shot frenzy when a generator first drops to low HP. */
export interface GeneratorEnrageDef {
  /** HP fraction at or below which the enrage triggers (e.g. 0.5). */
  hpFraction: number;
  /** Spawn-interval multiplier while enraged (e.g. 0.5 = twice as fast). */
  intervalMult: number;
  durationTicks: number;
}

export interface GeneratorDef {
  id: string;
  name: string;
  maxHp: number;
  radius: number;
  spawnsEnemyId: string;
  spawnIntervalTicks: number;
  /** Max simultaneously-alive enemies originating from one generator. */
  maxAlive: number;
  goldDrop: number;
  /** Optional enrage behavior; omit for generators that never enrage. */
  enrage?: GeneratorEnrageDef;
}

/** Small breakable prop: any damage destroys it; drops loot via seeded RNG. */
export interface PropDef {
  id: string;
  name: string;
  maxHp: number;
  radius: number;
  dropKind: PickupKind;
  dropMin: number;
  dropMax: number;
}

/** Non-colliding set dressing, rendered only (never enters the sim state). */
export const DECOR_KINDS = ['egg-cluster', 'resin-web', 'spore-patch'] as const;
export type DecorKind = (typeof DECOR_KINDS)[number];

export interface LevelDecorDef {
  kind: DecorKind;
  tx: number;
  ty: number;
}

export interface LevelPropDef {
  typeId: string;
  tx: number;
  ty: number;
}

export interface LevelPickupDef {
  kind: PickupKind;
  amount: number;
  /** Which buff a 'powerup' pickup grants (ignored for gold/health). */
  power?: PowerUpKind;
  /** Tile coordinates. */
  tx: number;
  ty: number;
}

export interface LevelGeneratorDef {
  typeId: string;
  tx: number;
  ty: number;
}

/** A key-locked gate that blocks its tile until a player spends a key. */
export interface LevelGateDef {
  tx: number;
  ty: number;
}

/**
 * A breakable secret wall: rendered as a normal wall and blocking movement,
 * but with HP — attacks crumble it into a passage. Sits on a floor tile.
 */
export interface LevelSecretDef {
  tx: number;
  ty: number;
  /** Optional HP override; defaults to a standard secret-wall toughness. */
  hp?: number;
}

export interface LevelDef {
  id: string;
  name: string;
  tileSize: number;
  /** One string per row; '#' = wall, '.' = floor. All rows equal length. */
  walls: readonly string[];
  playerSpawns: readonly { tx: number; ty: number }[];
  generators: readonly LevelGeneratorDef[];
  pickups: readonly LevelPickupDef[];
  /** Breakable props (sim entities). */
  props?: readonly LevelPropDef[];
  /** Key-locked gates guarding optional routes. */
  gates?: readonly LevelGateDef[];
  /** Breakable secret walls hiding treasure. */
  secrets?: readonly LevelSecretDef[];
  /** Visual set dressing (render-only). */
  decor?: readonly LevelDecorDef[];
  exit: { tx: number; ty: number };
}

/**
 * Temporary power-ups (issue #16): floor pickups that grant a timed buff.
 * Every def carries all three multipliers; the ones a given power-up doesn't
 * use stay at 1, so the sim can multiply uniformly with no per-kind branching.
 */
export const POWERUP_KINDS = ['frenzy', 'swiftness', 'ward'] as const;
export type PowerUpKind = (typeof POWERUP_KINDS)[number];

export interface PowerUpDef {
  kind: PowerUpKind;
  name: string;
  durationTicks: number;
  /** Outgoing-damage multiplier (frenzy). */
  damageMult: number;
  /** Move-speed multiplier (swiftness). */
  speedMult: number;
  /** Incoming-damage multiplier (ward). */
  damageTakenMult: number;
}

export interface ContentDb {
  heroes: Record<string, HeroDef>;
  enemies: Record<string, EnemyDef>;
  generators: Record<string, GeneratorDef>;
  props: Record<string, PropDef>;
  powerups: Record<PowerUpKind, PowerUpDef>;
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

export type PickupKind = 'gold' | 'health' | 'powerup' | 'key';

export interface PlayerState {
  id: EntityId;
  heroId: string;
  pos: Vec2;
  facing: Vec2;
  hp: number;
  maxHp: number;
  gold: number;
  kills: number;
  attackCooldown: number;
  abilityCooldown: number;
  invulnTicks: number;
  /** Ticks of guard stance remaining (Sentinel's Bastion Wall; 0 = not guarding). */
  guardTicks: number;
  /** Ticks remaining on each temporary power-up (0 = inactive). */
  power: Record<PowerUpKind, number>;
  /** Keys held (spent to open gates). Party-shared semantics in solo. */
  keys: number;
  alive: boolean;
}

export interface EnemyState {
  id: EntityId;
  typeId: string;
  pos: Vec2;
  hp: number;
  attackCooldown: number;
  hitstunTicks: number;
  knockback: Vec2;
  /** Ticks of movement slow remaining (0 = unslowed) and its multiplier. */
  slowTicks: number;
  slowMult: number;
  /** Generator that spawned this enemy (for the alive-cap), if any. */
  sourceGen: EntityId | null;
}

export interface GeneratorState {
  id: EntityId;
  typeId: string;
  pos: Vec2;
  hp: number;
  maxHp: number;
  spawnCooldown: number;
  /** Enrage fires at most once per generator. */
  enrageTriggered: boolean;
  enrageTicksLeft: number;
}

export interface PickupState {
  id: EntityId;
  kind: PickupKind;
  amount: number;
  /** Which buff a 'powerup' pickup grants (undefined for gold/health). */
  power?: PowerUpKind;
  pos: Vec2;
}

export interface PropState {
  id: EntityId;
  typeId: string;
  pos: Vec2;
  hp: number;
}

export interface GateState {
  id: EntityId;
  tx: number;
  ty: number;
  pos: Vec2;
  locked: boolean;
}

export interface SecretWallState {
  id: EntityId;
  tx: number;
  ty: number;
  pos: Vec2;
  hp: number;
  maxHp: number;
}

/** A bolt in flight. Player-fired bolts strike enemies; hostile ones strike players. */
export interface ProjectileState {
  id: EntityId;
  ownerId: EntityId;
  pos: Vec2;
  /** Velocity in px/s. */
  vel: Vec2;
  radius: number;
  distanceLeft: number;
  pierceLeft: number;
  damage: number;
  knockback: number;
  /** Enemies already damaged by this bolt (a pierced bolt must not re-hit). */
  hitIds: EntityId[];
  /** True for enemy fire (hits players); false for player fire (hits enemies). */
  hostile: boolean;
}

export type MissionPhase = 'combat' | 'exit-open' | 'complete' | 'failed';

export interface SimState {
  tick: number;
  rngState: number;
  nextEntityId: number;
  phase: MissionPhase;
  players: PlayerState[];
  enemies: EnemyState[];
  generators: GeneratorState[];
  pickups: PickupState[];
  props: PropState[];
  gates: GateState[];
  secrets: SecretWallState[];
  projectiles: ProjectileState[];
  exitPos: Vec2;
}

// ---------------------------------------------------------------------------
// Events (emitted each tick for the presentation layer; never read by the sim)
// ---------------------------------------------------------------------------

export type SimEvent =
  | { type: 'attack'; playerId: EntityId; pos: Vec2; facing: Vec2 }
  | { type: 'projectile-fired'; playerId: EntityId; projectileId: EntityId; pos: Vec2; vel: Vec2 }
  | { type: 'enemy-shot'; enemyId: EntityId; projectileId: EntityId; pos: Vec2; vel: Vec2 }
  | { type: 'projectile-hit'; projectileId: EntityId; pos: Vec2 }
  | { type: 'projectile-expired'; projectileId: EntityId; pos: Vec2 }
  | { type: 'ability'; playerId: EntityId; pos: Vec2; radius: number }
  | { type: 'ability-dash'; playerId: EntityId; from: Vec2; to: Vec2 }
  | { type: 'ability-guard'; playerId: EntityId; pos: Vec2; durationTicks: number }
  | { type: 'guard-block'; playerId: EntityId; enemyId: EntityId; pos: Vec2 }
  | { type: 'enemy-hit'; enemyId: EntityId; pos: Vec2; damage: number }
  | { type: 'enemy-died'; enemyId: EntityId; typeId: string; pos: Vec2; byPlayer: EntityId; damage: number }
  | { type: 'enemy-spawned'; enemyId: EntityId; typeId: string; pos: Vec2 }
  | { type: 'generator-hit'; generatorId: EntityId; pos: Vec2; damage: number }
  | { type: 'generator-enraged'; generatorId: EntityId; pos: Vec2 }
  | { type: 'generator-destroyed'; generatorId: EntityId; pos: Vec2 }
  | { type: 'prop-destroyed'; propId: EntityId; pos: Vec2 }
  | { type: 'gate-opened'; gateId: EntityId; pos: Vec2 }
  | { type: 'secret-hit'; secretId: EntityId; pos: Vec2; damage: number }
  | { type: 'secret-revealed'; secretId: EntityId; pos: Vec2 }
  | { type: 'pickup-collected'; playerId: EntityId; kind: PickupKind; amount: number; pos: Vec2 }
  | { type: 'powerup-gained'; playerId: EntityId; power: PowerUpKind; pos: Vec2 }
  | { type: 'player-hit'; playerId: EntityId; damage: number; pos: Vec2 }
  | { type: 'player-died'; playerId: EntityId; pos: Vec2 }
  | { type: 'exit-opened'; pos: Vec2 }
  | { type: 'mission-complete' }
  | { type: 'mission-failed' };

// ---------------------------------------------------------------------------
// Sim configuration
// ---------------------------------------------------------------------------

export interface HeroModifiers {
  maxHpBonus: number;
  damageBonus: number;
}

export const NO_MODIFIERS: HeroModifiers = Object.freeze({ maxHpBonus: 0, damageBonus: 0 });

export interface SimPlayerConfig {
  heroId: string;
  modifiers?: HeroModifiers;
}

export interface SimConfig {
  seed: number;
  level: LevelDef;
  players: SimPlayerConfig[];
  content: ContentDb;
}
