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
  damage: number;
  range: number;
  arcDeg: number;
  knockback: number;
  cooldownTicks: number;
}

export interface AbilityDef {
  id: string;
  name: string;
  damage: number;
  radius: number;
  knockback: number;
  cooldownTicks: number;
}

export interface HeroDef {
  id: string;
  name: string;
  role: string;
  description: string;
  maxHp: number;
  moveSpeed: number; // world units (px) per second
  radius: number;
  attack: MeleeAttackDef;
  ability: AbilityDef;
}

export interface EnemyDef {
  id: string;
  name: string;
  maxHp: number;
  moveSpeed: number;
  radius: number;
  touchDamage: number;
  attackRange: number;
  attackCooldownTicks: number;
  goldMin: number;
  goldMax: number;
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
}

export interface LevelPickupDef {
  kind: PickupKind;
  amount: number;
  /** Tile coordinates. */
  tx: number;
  ty: number;
}

export interface LevelGeneratorDef {
  typeId: string;
  tx: number;
  ty: number;
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
  exit: { tx: number; ty: number };
}

export interface ContentDb {
  heroes: Record<string, HeroDef>;
  enemies: Record<string, EnemyDef>;
  generators: Record<string, GeneratorDef>;
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

export type PickupKind = 'gold' | 'health';

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
}

export interface PickupState {
  id: EntityId;
  kind: PickupKind;
  amount: number;
  pos: Vec2;
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
  exitPos: Vec2;
}

// ---------------------------------------------------------------------------
// Events (emitted each tick for the presentation layer; never read by the sim)
// ---------------------------------------------------------------------------

export type SimEvent =
  | { type: 'attack'; playerId: EntityId; pos: Vec2; facing: Vec2 }
  | { type: 'ability'; playerId: EntityId; pos: Vec2; radius: number }
  | { type: 'enemy-hit'; enemyId: EntityId; pos: Vec2; damage: number }
  | { type: 'enemy-died'; enemyId: EntityId; typeId: string; pos: Vec2; byPlayer: EntityId; damage: number }
  | { type: 'enemy-spawned'; enemyId: EntityId; typeId: string; pos: Vec2 }
  | { type: 'generator-hit'; generatorId: EntityId; pos: Vec2; damage: number }
  | { type: 'generator-destroyed'; generatorId: EntityId; pos: Vec2 }
  | { type: 'pickup-collected'; playerId: EntityId; kind: PickupKind; amount: number; pos: Vec2 }
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
