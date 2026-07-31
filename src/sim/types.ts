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
  /** Rising-edge: consume one carried potion this tick (screen-clear burst). */
  usePotion: boolean;
}

export const EMPTY_INPUT: InputCommand = Object.freeze({
  moveX: 0,
  moveY: 0,
  attack: false,
  ability: false,
  usePotion: false
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

/**
 * A weapon tier's stat overrides: a partial of either attack shape's numeric
 * fields (the `kind` is fixed by the hero and never overridden). Authored
 * overrides only ever touch fields of the hero's own attack kind.
 */
export type AttackOverrides = Partial<Omit<MeleeAttackDef, 'kind'>> &
  Partial<Omit<ProjectileAttackDef, 'kind'>>;

/**
 * A purchasable weapon tier for one hero. Tier 1 is the hero's built-in kit
 * (cost 0, empty overrides); tiers 2–3 override specific attack numbers. The
 * equipped weapon enters the sim only at createSim time, as a resolved
 * AttackDef on SimPlayerConfig — the sim never reads the profile.
 */
export interface WeaponDef {
  id: string;
  name: string;
  /** The hero this weapon belongs to; weapons are hero-gated. */
  heroId: string;
  tier: 1 | 2 | 3;
  description: string;
  /** Gold cost from the meta bank; tier 1 is 0 (owned by default). */
  cost: number;
  /** Fields merged over the hero's base attack def (matching its kind). */
  attackOverrides: AttackOverrides;
}

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

/** Motion and collision authored for a hostile projectile. */
export interface HostileProjectileDef {
  /** Bolt speed in px/s. */
  projectileSpeed: number;
  /** Bolt collision radius in px. */
  projectileRadius: number;
  /** Max flight distance in px. */
  projectileRange: number;
}

interface EnemyAttackBase {
  damage: number;
  /** Distance at which the enemy commits to the attack. */
  range: number;
  /** Recovery after release before another windup may begin. */
  cooldownTicks: number;
  /**
   * Telegraph before release. The enemy holds position while this counts down,
   * so every attack — including the first — remains dodgeable.
   */
  windupTicks: number;
}

export type EnemyContactAttackDef = EnemyAttackBase & {
  kind: 'contact';
  /** Frontal release arc; targets outside it flank the committed swing. */
  arcDeg: number;
  /** Immediate wall-clipped displacement applied away from the attacker. */
  pushPx: number;
};

export type EnemyLineAttackDef = EnemyAttackBase & {
  kind: 'line';
  /** Length and full width of the committed ground rupture, in pixels. */
  length: number;
  width: number;
  /** Immediate wall-clipped displacement along the rupture direction. */
  pushPx: number;
};

export type EnemyPounceAttackDef = EnemyAttackBase & {
  kind: 'pounce';
  /** Forward travel and full collision width of the committed leap, in pixels. */
  distance: number;
  width: number;
};

export type EnemyBoltAttackDef = EnemyAttackBase &
  HostileProjectileDef & {
    kind: 'bolt';
  };

export type EnemyVolleyAttackDef = EnemyAttackBase &
  HostileProjectileDef & {
    kind: 'volley';
    /** Number of evenly spaced hostile bolts released in one fan. */
    count: number;
    /** Full angle covered by the fan, in degrees. */
    spreadDeg: number;
  };

/** Complete, data-authored vocabulary for ordinary enemy attacks. */
export type EnemyAttackDef =
  | EnemyContactAttackDef
  | EnemyLineAttackDef
  | EnemyPounceAttackDef
  | EnemyBoltAttackDef
  | EnemyVolleyAttackDef;

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
  attack: EnemyAttackDef;
  goldMin: number;
  goldMax: number;
  /** XP awarded to the killer (issue #46). */
  xp: number;
  /**
   * Kiting (issue #23): back away while the target is closer than this
   * fraction of `attack.range`, so an artillery enemy reopens the gap instead
   * of planting itself and firing point-blank. Omit (or 0) to hold ground —
   * melee families never kite. A content test requires every projectile enemy
   * (`bolt` or `volley`) to author it.
   */
  keepDistanceFraction?: number;
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
  /** XP awarded for destroying it (issue #46). */
  xp: number;
  /** Optional enrage behavior; omit for generators that never enrage. */
  enrage?: GeneratorEnrageDef;
  /**
   * Optional one-shot spawn when this generator is destroyed — e.g. an elite
   * bursts from the wreckage. Fires once, at the generator's position, on death.
   */
  onDeathSpawn?: GeneratorDeathSpawnDef;
}

/** A single enemy birthed when a generator is destroyed. */
export interface GeneratorDeathSpawnDef {
  /** Enemy type id to spawn (must exist in the content enemy table). */
  enemyId: string;
}

// ---------------------------------------------------------------------------
// Boss (issue #25)
// ---------------------------------------------------------------------------

/**
 * Authored boss-action vocabulary (issue #81).
 *
 * `id` and `tell` are presentation data, while `kind` selects one reusable sim
 * primitive. A boss can therefore name and tune a completely different
 * moveset without adding boss-specific strings or payload fields to the sim.
 */
interface BossActionBase {
  /** Stable content id used in events, tests, and generated docs. */
  id: string;
  /** Short player-facing warning shown during the telegraph. */
  tell: string;
}

export interface BossSummonActionDef extends BossActionBase {
  kind: 'summon';
  enemyId: string;
  count: number;
}

export interface BossChargeActionDef extends BossActionBase {
  kind: 'charge';
  speed: number;
  durationTicks: number;
  damage: number;
}

export interface BossVolleyActionDef extends BossActionBase, HostileProjectileDef {
  kind: 'volley';
  count: number;
  spreadDeg: number;
  projectileDamage: number;
}

/** Complete data-authored vocabulary for boss actions. */
export type BossActionDef = BossSummonActionDef | BossChargeActionDef | BossVolleyActionDef;

/** Serializable pointer to the exact authored action currently winding up. */
export interface BossActionRef {
  phaseIndex: number;
  actionIndex: number;
}

/**
 * One stage of the fight, entered when the boss's HP fraction drops to
 * `hpFraction`. Phases are authored strongest-first (the first entry must use
 * 1 so it covers a full-health boss) and own their pace and move set.
 */
export interface BossPhaseDef {
  name: string;
  /** HP fraction at or below which this phase is active. */
  hpFraction: number;
  moveSpeed: number;
  /** Ticks between the end of one action and the start of the next. */
  actionIntervalTicks: number;
  /** Actions cycled, in order, while this phase is active. */
  actions: readonly BossActionDef[];
}

export interface BossDef {
  id: string;
  name: string;
  /** Flavour line announced when the fight opens. */
  title: string;
  maxHp: number;
  radius: number;
  /** Contact damage from the boss body, and its per-player rate limit. */
  touchDamage: number;
  touchCooldownTicks: number;
  /**
   * Telegraph held before every damaging action. The look & feel readability
   * rule requires >= 45 ticks; a content test enforces it.
   */
  telegraphTicks: number;
  phases: readonly BossPhaseDef[];
  goldDrop: number;
  /** XP awarded for felling the boss (issue #46). */
  xp: number;
}

/** Runtime boss state. At most one per level. */
export interface BossState {
  id: EntityId;
  typeId: string;
  pos: Vec2;
  facing: Vec2;
  hp: number;
  maxHp: number;
  /** Index into the def's phase list. */
  phaseIndex: number;
  /** Ticks until the next action is chosen. */
  actionCooldown: number;
  /** Ticks left in the current telegraph (0 = not telegraphing). */
  telegraphTicksLeft: number;
  /** Exact phase/action slot being telegraphed, released when it elapses. */
  pendingAction: BossActionRef | null;
  /** Rotating cursor into the active phase's action list. */
  actionCursor: number;
  /** Runtime copy of an active authored charge, which may outlive its phase. */
  chargeTicksLeft: number;
  chargeDir: Vec2;
  chargeSpeed: number;
  chargeDamage: number;
  touchCooldown: number;
}

/** Where a level plants its boss. */
export interface LevelBossDef {
  typeId: string;
  tx: number;
  ty: number;
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

/**
 * Per-level environment identity. A dedicated `tileSet` selects original
 * texture variants; optional multiplicative tints (0xRRGGBB) can instead
 * recolour the shared base. Omit a field to leave that layer unchanged.
 */
export interface LevelTheme {
  /**
   * Optional environment texture namespace. `amber-resin`, for example,
   * resolves `tile-amber-resin-wall` and `tile-amber-resin-floor-0..3`.
   */
  tileSet?: string;
  /** Tint applied to wall tops, inner walls, and front faces. */
  wall?: number;
  /** Tint applied to floor tiles. */
  floor?: number;
  /** Accent color for the exit portal glow and its drifting motes. */
  accent?: number;
}

export interface LevelDef {
  id: string;
  name: string;
  tileSize: number;
  /** Optional environment treatment; omit for the base violet tiles. */
  theme?: LevelTheme;
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
  /** Optional boss; while it lives the exit stays shut (issue #25). */
  boss?: LevelBossDef;
  exit: { tx: number; ty: number };
}

/**
 * One branch of the mission wheel (issue #53): three missions played in order,
 * capped by a boss encounter. Clearing all three opens the boss; felling the
 * boss opens the spoke that names this one in `requiresSpoke`.
 *
 * Progression state is *not* stored per-spoke — every rule derives from
 * `Profile.clearedLevels`, so adding a spoke is a pure content change and
 * existing saves never need migrating. See docs/PROGRESSION.md.
 */
export interface SpokeDef {
  id: string;
  /** Display name on the wheel, e.g. "The Azure Reach". */
  name: string;
  /**
   * The spoke's identity colour on the hub (0xRRGGBB). This is wheel dressing,
   * not an in-mission palette — levels keep their own `LevelDef.theme`, so a
   * blue spoke can still contain the amber Resin Galleries.
   */
  accent: number;
  /** Ordered mission level ids; each opens when the one before it is cleared. */
  missions: readonly string[];
  /** Level id of the boss encounter capping the spoke; must carry a `boss`. */
  boss: string;
  /** Spoke whose boss must fall before this one opens; omit for the first. */
  requiresSpoke?: string;
  /** Placement on the wheel, in degrees clockwise from the top. */
  angleDeg: number;
}

/**
 * A branch announced on the wheel but not yet authored (issue #63).
 *
 * Deliberately a separate shape from `SpokeDef` rather than a flag on it: a
 * teaser has no missions, no boss and no gate, so giving it those fields would
 * mean loosening the content invariants that make a real spoke trustworthy.
 * Promoting a teaser is then a deliberate move between two lists — author the
 * levels, delete the teaser, add a `SpokeDef` — rather than flipping a flag and
 * hoping the tests still mean anything.
 */
export interface TeaserSpokeDef {
  id: string;
  name: string;
  /** Identity colour on the wheel, as for a real spoke. */
  accent: number;
  /** Placement on the wheel; must not collide with a real spoke's. */
  angleDeg: number;
  /** One line of flavour, shown at the edge of authored content. */
  tagline: string;
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

/**
 * The screen-clear consumable (issue #41): a scarce, hoarded potion the player
 * carries and spends at will for a big self-centered burst. Numbers are data;
 * the sim reads them when a `usePotion` input fires with a potion in hand.
 */
export interface PotionDef {
  name: string;
  damage: number;
  radius: number;
  knockback: number;
}

/**
 * Hero levelling curve (issue #46). `xpToReach[i]` is the *total* XP needed to
 * be level i + 1, so index 0 is level 1 at 0 XP and the array length is the
 * level cap. Bonuses are applied per level gained, stacking with gold upgrades.
 */
export interface ProgressionDef {
  xpToReach: readonly number[];
  maxHpPerLevel: number;
  damagePerLevel: number;
  /**
   * Gold minted per point of XP earned past the cap — the veteran's dividend
   * (issue #103). The sim never reads this: levelling stops at the cap, and the
   * conversion happens once per run when `bankXp` writes the profile.
   */
  capOverflowGoldPerXp: number;
}

/**
 * Mission time pressure — "the hive rouses" (issue #41). The adapted answer to
 * the genre's health-drain: dawdling makes the brood *fiercer* rather than
 * starving the player, so the health economy and the boss fight stay intact.
 *
 * Escalation is deliberately weighted to potency over headcount. Spawners sit
 * at their alive-cap almost immediately, so shortening intervals alone barely
 * registers — and flooding the screen would blow the readability budget.
 */
export interface PressureDef {
  /** Ticks of grace before the first escalation; a clean clear never sees it. */
  gracePeriodTicks: number;
  /** Ticks between escalations after the grace period. */
  intervalTicks: number;
  /** Hard cap on stages, so a very slow run plateaus instead of running away. */
  maxStage: number;
  /** Additive per-stage fraction on enemy move speed (0.08 = +8% per stage). */
  moveSpeedPerStage: number;
  /** Additive per-stage fraction on enemy damage, contact and spat. */
  damagePerStage: number;
  /** Multiplicative per-stage spawn-interval scale; compounds across stages. */
  spawnIntervalMult: number;
}

/**
 * Shared combat constants (see docs/COMBAT.md). These are the numbers every
 * hero attack is tuned *against* rather than numbers any one hero owns, so
 * they live in content like the rest of the gameplay dials — engine code reads
 * them off `ContentDb.combat`.
 *
 * `enemyHitstunTicks` in particular is load-bearing: a hero whose attack
 * cooldown is at or below it can re-stun a target before the stun expires and
 * so lock it out permanently. Tune hero cadence and this value together.
 */
export interface CombatDef {
  /** I-frames granted to a player after any hit lands on them. */
  playerHitInvulnTicks: number;
  /** Ticks an enemy is frozen out of steering, attacking and windups per hit. */
  enemyHitstunTicks: number;
  /** Per-tick multiplier bleeding off an enemy's knockback impulse. */
  knockbackDecay: number;
  /**
   * Arc facing the nearest player that a generator avoids when choosing a
   * spawn point. Falls back to the first wall-safe point if every sampled
   * point is inside the arc, so cramped authored rooms cannot stop spawning.
   */
  generatorSpawnExclusionArcDeg: number;
}

/** Predictable meta-economy rewards paid on top of gold collected in a run. */
export interface EconomyDef {
  /** One-time bounty for the first victory on an ordinary mission. */
  firstClearMissionBonus: number;
  /** One-time bounty for the first victory on a boss mission. */
  firstClearBossBonus: number;
  /** Gold price of the first continue in a run (issue #99). */
  continueBaseCost: number;
  /** Added to the price for each continue already taken in the same run. */
  continueCostStep: number;
}

/**
 * The arcade continue (issue #99): what standing back up costs the *fight*,
 * as opposed to what it costs the bank (`EconomyDef`). The sim reads only
 * this half, so a revive stays a deterministic state transition.
 */
export interface ReviveDef {
  /** Fraction of max HP the hero stands up with. */
  hpFraction: number;
  /** Invulnerable ticks granted, so the swarm cannot instantly re-kill. */
  invulnTicks: number;
  /** Enemies within this radius of the death spot are shoved back. */
  clearRadius: number;
  /** Impulse applied to those enemies, in px/s. */
  knockback: number;
}

export interface ContentDb {
  heroes: Record<string, HeroDef>;
  enemies: Record<string, EnemyDef>;
  generators: Record<string, GeneratorDef>;
  props: Record<string, PropDef>;
  weapons: Record<string, WeaponDef>;
  powerups: Record<PowerUpKind, PowerUpDef>;
  potion: PotionDef;
  bosses: Record<string, BossDef>;
  progression: ProgressionDef;
  pressure: PressureDef;
  combat: CombatDef;
  economy: EconomyDef;
  /** What a continue restores when one is bought (issue #99). */
  revive: ReviveDef;
  /** Mission-wheel branches, in wheel order (issue #53). */
  spokes: readonly SpokeDef[];
  /** Announced-but-unauthored branches, drawn as locked teasers (issue #63). */
  teaserSpokes: readonly TeaserSpokeDef[];
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

export type PickupKind = 'gold' | 'health' | 'powerup' | 'key' | 'potion';

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
  /** Potions carried (spent for a screen-clear burst). See #41. */
  potions: number;
  /** Total XP carried into and earned during this run (issue #46). */
  xp: number;
  /** Level derived from `xp` against the progression curve; 1-based. */
  level: number;
  alive: boolean;
}

export interface EnemyState {
  id: EntityId;
  typeId: string;
  pos: Vec2;
  hp: number;
  attackCooldown: number;
  /** Ticks left in a committed attack windup (0 = not winding up). See #39. */
  windupTicksLeft: number;
  /** Locked release direction for committed contact, line, and pounce attacks. */
  windupDir?: Vec2;
  /** Wall-clipped length of a committed line or pounce attack. */
  windupLength?: number;
  hitstunTicks: number;
  knockback: Vec2;
  /** Ticks of movement slow remaining (0 = unslowed) and its multiplier. */
  slowTicks: number;
  slowMult: number;
  /** Generator that spawned this enemy (for the alive-cap), if any. */
  sourceGen: EntityId | null;
  /**
   * Ticks left routing around geometry instead of charging straight (#107).
   * Absent or 0 means the straight line is working and steering is unchanged;
   * it is set when a chase actually fails to make headway against a wall, and
   * held until the enemy can see its target again.
   */
  pathTicks?: number;
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
  /** The level's boss, or null on a boss-less mission. Dead bosses stay at hp 0. */
  boss: BossState | null;
  /** How roused the hive is, 0 = calm. Rises on the mission clock (#41). */
  pressureStage: number;
  exitPos: Vec2;
}

// ---------------------------------------------------------------------------
// Events (emitted each tick for the presentation layer; never read by the sim)
// ---------------------------------------------------------------------------

export type SimEvent =
  | {
      type: 'attack';
      playerId: EntityId;
      heroId: string;
      pos: Vec2;
      facing: Vec2;
      range: number;
      arcDeg: number;
      /** Authored base damage: stable gear-weight cue, before buffs/levels. */
      weight: number;
    }
  | {
      type: 'projectile-fired';
      playerId: EntityId;
      heroId: string;
      projectileId: EntityId;
      pos: Vec2;
      vel: Vec2;
      radius: number;
      pierce: number;
      /** Authored base damage: stable gear-weight cue, before buffs/levels. */
      weight: number;
    }
  | { type: 'enemy-shot'; enemyId: EntityId; projectileId: EntityId; pos: Vec2; vel: Vec2 }
  | {
      type: 'enemy-volley';
      enemyId: EntityId;
      family: EnemyFamily;
      pos: Vec2;
      dir: Vec2;
      count: number;
      spreadDeg: number;
      weight: number;
    }
  | { type: 'projectile-hit'; projectileId: EntityId; pos: Vec2 }
  | { type: 'projectile-expired'; projectileId: EntityId; pos: Vec2 }
  | { type: 'ability'; playerId: EntityId; pos: Vec2; radius: number }
  | { type: 'ability-dash'; playerId: EntityId; from: Vec2; to: Vec2 }
  | { type: 'ability-guard'; playerId: EntityId; pos: Vec2; durationTicks: number }
  | { type: 'guard-block'; playerId: EntityId; enemyId: EntityId; pos: Vec2 }
  | {
      type: 'enemy-windup';
      enemyId: EntityId;
      family: EnemyFamily;
      attackKind: EnemyAttackDef['kind'];
      pos: Vec2;
      durationTicks: number;
    }
  | {
      type: 'enemy-contact';
      enemyId: EntityId;
      family: EnemyFamily;
      pos: Vec2;
      dir: Vec2;
      range: number;
      arcDeg: number;
      weight: number;
    }
  | {
      type: 'enemy-pounce';
      enemyId: EntityId;
      family: EnemyFamily;
      from: Vec2;
      to: Vec2;
      width: number;
      weight: number;
    }
  | {
      type: 'enemy-line-attack';
      enemyId: EntityId;
      family: EnemyFamily;
      pos: Vec2;
      dir: Vec2;
      length: number;
      width: number;
      weight: number;
    }
  | { type: 'enemy-hit'; enemyId: EntityId; pos: Vec2; damage: number }
  | { type: 'enemy-died'; enemyId: EntityId; typeId: string; pos: Vec2; byPlayer: EntityId; damage: number }
  | { type: 'enemy-spawned'; enemyId: EntityId; typeId: string; pos: Vec2 }
  | {
      type: 'boss-telegraph';
      bossId: EntityId;
      actionId: string;
      actionKind: BossActionDef['kind'];
      tell: string;
      pos: Vec2;
      durationTicks: number;
    }
  | { type: 'boss-phase'; bossId: EntityId; phaseIndex: number; name: string; pos: Vec2 }
  | { type: 'boss-hit'; bossId: EntityId; pos: Vec2; damage: number }
  | { type: 'boss-died'; bossId: EntityId; pos: Vec2 }
  | { type: 'generator-hit'; generatorId: EntityId; pos: Vec2; damage: number }
  | { type: 'generator-enraged'; generatorId: EntityId; pos: Vec2 }
  | { type: 'generator-destroyed'; generatorId: EntityId; pos: Vec2 }
  | { type: 'prop-destroyed'; propId: EntityId; pos: Vec2 }
  | { type: 'gate-opened'; gateId: EntityId; pos: Vec2 }
  | { type: 'secret-hit'; secretId: EntityId; pos: Vec2; damage: number }
  | { type: 'secret-revealed'; secretId: EntityId; pos: Vec2 }
  | { type: 'pickup-collected'; playerId: EntityId; kind: PickupKind; amount: number; pos: Vec2 }
  | { type: 'powerup-gained'; playerId: EntityId; power: PowerUpKind; pos: Vec2 }
  | { type: 'potion-used'; playerId: EntityId; pos: Vec2; radius: number }
  | { type: 'player-leveled'; playerId: EntityId; level: number; pos: Vec2 }
  | { type: 'pressure-rose'; stage: number }
  | { type: 'player-hit'; playerId: EntityId; damage: number; pos: Vec2 }
  | { type: 'player-died'; playerId: EntityId; pos: Vec2 }
  /** A continue was bought and the hero stood back up (issue #99). */
  | { type: 'player-revived'; playerId: EntityId; pos: Vec2; hp: number }
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
  /**
   * Resolved attack for the equipped weapon tier (hero base attack merged with
   * the weapon's overrides). Omit to use the hero's built-in attack. This is
   * how a purchased weapon enters the sim — like modifiers, only at createSim.
   */
  attack?: AttackDef;
  /**
   * Banked XP the hero carries in (issue #46). The sim derives the starting
   * level from it against the progression curve — meta enters the sim here and
   * only here, exactly like `modifiers`.
   */
  startXp?: number;
}

export interface SimConfig {
  seed: number;
  level: LevelDef;
  players: SimPlayerConfig[];
  content: ContentDb;
}
