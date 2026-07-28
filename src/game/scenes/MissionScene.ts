import Phaser from 'phaser';
import { BROOD_WARRENS, CONTENT, LEVELS } from '../../content';
import { equippedAttack, loadProfile, profileModifiers } from '../../meta/save';
import { levelHeightPx, levelWidthPx } from '../../sim/level';
import { createSim, simTick, type Sim } from '../../sim/sim';
import { POWERUP_KINDS, TICK_DT, type EntityId, type PlayerState, type SimEvent, type Vec2 } from '../../sim/types';
import { audio } from '../audio';
import { playerAccent } from '../colors';
import { KeyboardCommander } from '../input';
import type { HudScene } from './HudScene';
import {
  FLOOR_VARIANTS,
  POWERUP_COLORS,
  TEX,
  bossFrame,
  broodNodeFrame,
  enemyFrame,
  facingDirIndex,
  floorVariant,
  heroFrame,
  powerupTexture,
  propTexture,
  type EnemyAnimFrame,
  type HeroPose
} from '../textures';

const MAX_STEPS_PER_FRAME = 5;

/**
 * XP needed to span the given level (from its start to the next), or null at
 * the cap — drives the HUD's XP bar (issue #46).
 */
function xpSpanForLevel(level: number): number | null {
  const curve = CONTENT.progression.xpToReach;
  if (level >= curve.length) return null;
  return (curve[level] ?? 0) - (curve[level - 1] ?? 0);
}

export interface HudPlayerInfo {
  heroId: string;
  heroName: string;
  hp: number;
  maxHp: number;
  gold: number;
  kills: number;
  abilityCooldown: number;
  abilityMax: number;
  /** Guard-stance ticks remaining and the stance's full duration (0 if none). */
  guardTicks: number;
  guardMax: number;
  keys: number;
  potions: number;
  /** Hero level and progress toward the next (issue #46). */
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForLevel: number | null;
  alive: boolean;
}

/** Boss status for the HUD's finale bar (issue #25). */
export interface HudBossInfo {
  name: string;
  title: string;
  hp: number;
  maxHp: number;
  phaseName: string;
}

export interface HudInfo {
  players: HudPlayerInfo[];
  generatorsLeft: number;
  /** How roused the hive is, 0 = calm (issue #41). */
  pressureStage: number;
  /** Present only on a boss realm, and only while she still stands. */
  boss: HudBossInfo | null;
  phase: string;
}

// Depth layers: floor 0, ground decals 1-3, dynamic entities y-sorted by
// world y (walls use their bottom edge so they occlude entities behind them),
// transient effects and bars above everything.
const DEPTH_SHADOW = 1;
const DEPTH_DECAL = 2;
const DEPTH_FX = 9000;
const DEPTH_TEXT = 9500;

// Renderer-side animation timing (visual only; the sim knows nothing of it).
const ATTACK_POSE_TICKS = 8; // how long after swinging the attack pose holds
const WALK_FRAME_TICKS = 8;
const CRAWL_FRAME_TICKS = 6;

// Combat-juice caps and camera feel (issue #3). Hit-stop pauses render
// stepping only — the sim accumulator holds, no ticks are ever skipped.
const HIT_STOP_MAX_MS = 90;
const MAX_ALIVE_PARTICLES = 300;
const MAX_FLOAT_TEXTS = 24;
const MAX_TRAIL_GHOSTS = 40;
const CAM_LOOKAHEAD = 36;
const CAM_LERP = 0.08;
const CAM_KICK_DECAY = 0.8;

// Generator presence (issue #6): pre-spawn bulge window and hatch-in time.
const PRESPAWN_BULGE_TICKS = 18;
const HATCH_TICKS = 10;

/** Runs the deterministic sim at a fixed tick rate and renders its state. */
export class MissionScene extends Phaser.Scene {
  private sim!: Sim;
  private commander!: KeyboardCommander;
  private accumulator = 0;
  private sprites = new Map<EntityId, Phaser.GameObjects.Image>();
  private shadows = new Map<EntityId, Phaser.GameObjects.Image>();
  private rings = new Map<EntityId, Phaser.GameObjects.Image>();
  private chevrons = new Map<EntityId, Phaser.GameObjects.Image>();
  private genHpBars = new Map<EntityId, Phaser.GameObjects.Rectangle>();
  private lastPos = new Map<EntityId, Vec2>();
  private movedAtTick = new Map<EntityId, number>();
  private genPopAt = new Map<EntityId, number>(); // wall-clock ms of last spawn squash
  private hatchAtTick = new Map<EntityId, number>();
  private glows: { img: Phaser.GameObjects.Image; phase: number }[] = [];
  private exitGlow!: Phaser.GameObjects.Image;
  private moteFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private exitSprite!: Phaser.GameObjects.Image;
  private startXp = 0; // banked XP at mission start, for the results delta
  private heroId = 'vanguard';
  private levelId = BROOD_WARRENS.id;
  private slowedIds = new Set<EntityId>();
  private guardGlow = new Map<EntityId, Phaser.GameObjects.Image>();
  private powerAura = new Map<EntityId, Phaser.GameObjects.Image>();
  private ruptureGuides = new Map<EntityId, Phaser.GameObjects.Rectangle>();
  private ended = false;
  private hitStopMs = 0;
  private camFollow = { x: 0, y: 0 };
  private camKick = { x: 0, y: 0 };
  private trailCount = 0;
  private floatCount = 0;
  private lowHpHeralded = false;
  private ichorFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private shardFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparkFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dustFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private heartFx!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super('mission');
  }

  create(data?: { heroId?: string; levelId?: string }): void {
    const profile = loadProfile();
    // Hero choice flows in from hero select (and results replay); anything
    // unknown falls back to the default hero so the e2e Enter-flow is safe.
    this.heroId = data?.heroId && CONTENT.heroes[data.heroId] ? data.heroId : 'vanguard';
    // Level likewise flows in from the hub / next-mission flow; unknown ids
    // fall back to the Warrens so the e2e Enter-default lands there.
    this.levelId = data?.levelId && LEVELS[data.levelId] ? data.levelId : BROOD_WARRENS.id;
    const level = LEVELS[this.levelId]!;
    const hero = CONTENT.heroes[this.heroId]!;
    this.sim = createSim({
      seed: (Date.now() ^ 0x5eed) >>> 0,
      level,
      players: [
        {
          heroId: this.heroId,
          modifiers: profileModifiers(profile),
          attack: equippedAttack(profile, hero),
          startXp: profile.xp
        }
      ],
      content: CONTENT
    });
    this.startXp = profile.xp;
    this.accumulator = 0;
    this.ended = false;
    this.sprites.clear();
    this.shadows.clear();
    this.rings.clear();
    this.chevrons.clear();
    this.genHpBars.clear();
    this.lastPos.clear();
    this.movedAtTick.clear();
    this.genPopAt.clear();
    this.hatchAtTick.clear();
    this.slowedIds.clear();
    this.guardGlow.clear();
    this.powerAura.clear();
    this.ruptureGuides.clear();
    this.hitStopMs = 0;
    this.camKick = { x: 0, y: 0 };
    this.trailCount = 0;
    this.floatCount = 0;
    this.lowHpHeralded = false;
    const spawn = this.sim.state.players[0]?.pos ?? { x: 0, y: 0 };
    this.camFollow = { x: spawn.x, y: spawn.y };
    this.glows = [];
    this.commander = new KeyboardCommander(this);

    this.drawLevel();
    this.drawDecor();
    this.createEmitters();

    const exitPos = this.sim.state.exitPos;
    const exitAccent = level.theme?.accent ?? 0x64e6ff;
    this.exitSprite = this.add.image(exitPos.x, exitPos.y, TEX.exit).setDepth(DEPTH_DECAL).setVisible(false);
    this.exitGlow = this.add
      .image(exitPos.x, exitPos.y, TEX.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(exitAccent)
      .setAlpha(0.4)
      .setScale(1.8)
      .setDepth(DEPTH_DECAL)
      .setVisible(false);

    this.cameras.main.setBounds(0, 0, levelWidthPx(level), levelHeightPx(level));
    this.cameras.main.setZoom(1.25);

    this.scene.launch('hud');

    // Audio: the Enter press that started this scene is a valid gesture, so
    // resume the context and kick off the combat loop. M toggles mute.
    audio.unlock();
    audio.startMusic();
    this.input.keyboard?.on('keydown-M', () => {
      const muted = audio.toggleMute();
      (this.scene.get('hud') as HudScene).herald(muted ? 'SOUND OFF' : 'SOUND ON', '#a89bb8');
    });

    // Read-only debug handle for automated end-to-end tests.
    (globalThis as Record<string, unknown>).__hive = {
      getState: () => JSON.parse(JSON.stringify(this.sim.state)) as unknown
    };
  }

  private drawLevel(): void {
    const level = this.sim.config.level;
    const ts = level.tileSize;
    // Realm palette accent (issue #24): multiplicative tints reskin the shared
    // textures so each realm reads as a distinct place, with no new art.
    const wallTint = level.theme?.wall;
    const floorTint = level.theme?.floor;
    const isWall = (tx: number, ty: number): boolean => {
      const row = level.walls[ty];
      return row === undefined || row[tx] !== '.';
    };
    level.walls.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) {
        if (row[tx] === '#') {
          // Walls y-sort by their bottom edge so they draw over entities
          // standing behind (north of) them. Fully surrounded walls use the
          // flat inner variant so edges pop.
          const bottomY = (ty + 1) * ts;
          const inner = isWall(tx - 1, ty) && isWall(tx + 1, ty) && isWall(tx, ty - 1) && isWall(tx, ty + 1);
          const wallImg = this.add
            .image(tx * ts + ts / 2, ty * ts + ts / 2, inner ? TEX.wallInner : TEX.wall)
            .setDepth(bottomY);
          if (wallTint !== undefined) wallImg.setTint(wallTint);
          // South-facing wall edges get a front face, faking wall height.
          const below = level.walls[ty + 1];
          if (below && below[tx] === '.') {
            const face = this.add.image(tx * ts + ts / 2, bottomY + 8, TEX.wallFace).setDepth(bottomY);
            if (wallTint !== undefined) face.setTint(wallTint);
          }
        } else {
          // Deterministic variation: hash of the tile coordinate (not RNG),
          // so the same level always dresses identically.
          const hash = (((tx * 73856093) ^ (ty * 19349663)) >>> 0) % FLOOR_VARIANTS;
          const floorImg = this.add.image(tx * ts + ts / 2, ty * ts + ts / 2, floorVariant(hash)).setDepth(0);
          if (floorTint !== undefined) floorImg.setTint(floorTint);
        }
      }
    });
  }

  /** Non-colliding set dressing authored in the level data. */
  private drawDecor(): void {
    const level = this.sim.config.level;
    const ts = level.tileSize;
    for (const d of level.decor ?? []) {
      const x = d.tx * ts + ts / 2;
      const y = d.ty * ts + ts / 2;
      if (d.kind === 'egg-cluster') {
        this.add.image(x, y, TEX.decorEgg).setDepth(y); // has height: y-sorted
      } else if (d.kind === 'resin-web') {
        this.add.image(x, y, TEX.decorWeb).setDepth(DEPTH_DECAL);
      } else {
        this.add.image(x, y, TEX.decorSpore).setDepth(DEPTH_DECAL);
        const glow = this.add
          .image(x, y, TEX.glow)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(0x9fe06a)
          .setAlpha(0.3)
          .setScale(1.4)
          .setDepth(DEPTH_DECAL + 1);
        this.glows.push({ img: glow, phase: d.tx * 7 + d.ty * 13 });
      }
    }
  }

  /** Long-lived pooled emitters; effects fire via explode() with alive caps. */
  private createEmitters(): void {
    this.ichorFx = this.add
      .particles(0, 0, TEX.ichor, {
        speed: { min: 40, max: 140 },
        lifespan: { min: 200, max: 420 },
        scale: { start: 1, end: 0 },
        gravityY: 60,
        emitting: false
      })
      .setDepth(DEPTH_FX);
    this.shardFx = this.add
      .particles(0, 0, TEX.shard, {
        speed: { min: 80, max: 240 },
        lifespan: { min: 300, max: 600 },
        scale: { start: 1, end: 0.2 },
        rotate: { min: 0, max: 360 },
        gravityY: 120,
        emitting: false
      })
      .setDepth(DEPTH_FX);
    this.sparkFx = this.add
      .particles(0, 0, TEX.spark, {
        speed: { min: 30, max: 110 },
        lifespan: 350,
        scale: { start: 1, end: 0 },
        gravityY: -40,
        emitting: false
      })
      .setDepth(DEPTH_FX);
    this.dustFx = this.add
      .particles(0, 0, TEX.dust, {
        speed: { min: 20, max: 70 },
        lifespan: { min: 400, max: 800 },
        scale: { start: 1, end: 1.8 },
        alpha: { start: 0.5, end: 0 },
        emitting: false
      })
      .setDepth(DEPTH_FX - 1);
    this.heartFx = this.add
      .particles(0, 0, TEX.heart, {
        speed: { min: 15, max: 50 },
        lifespan: 500,
        scale: { start: 1, end: 0 },
        gravityY: -80,
        emitting: false
      })
      .setDepth(DEPTH_FX);
    // Continuous drift around the opened exit portal, in the realm's accent.
    const exitAccent = this.sim.config.level.theme?.accent ?? 0x64e6ff;
    this.moteFx = this.add
      .particles(0, 0, TEX.mote, {
        speed: { min: 5, max: 22 },
        lifespan: { min: 900, max: 1700 },
        alpha: { start: 0.9, end: 0 },
        scale: { start: 1, end: 0.2 },
        gravityY: -14,
        frequency: 90,
        tint: exitAccent,
        emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, 16), quantity: 1 },
        emitting: false
      })
      .setDepth(DEPTH_FX);
  }

  /** Snapshot consumed by the parallel HUD scene each frame. */
  hudInfo(): HudInfo | null {
    if (!this.sim) return null;
    const s = this.sim.state;
    return {
      players: s.players.map((p) => {
        const hero = CONTENT.heroes[p.heroId];
        return {
          heroId: p.heroId,
          heroName: hero?.name ?? p.heroId,
          hp: p.hp,
          maxHp: p.maxHp,
          gold: p.gold,
          kills: p.kills,
          abilityCooldown: p.abilityCooldown,
          abilityMax: hero?.ability.cooldownTicks ?? 1,
          guardTicks: p.guardTicks,
          guardMax: hero?.ability.kind === 'guard' ? hero.ability.durationTicks : 0,
          keys: p.keys,
          potions: p.potions,
          level: p.level,
          xp: p.xp,
          xpIntoLevel: p.xp - (CONTENT.progression.xpToReach[p.level - 1] ?? 0),
          xpForLevel: xpSpanForLevel(p.level),
          alive: p.alive
        };
      }),
      generatorsLeft: s.generators.length,
      pressureStage: s.pressureStage,
      boss: this.bossHudInfo(),
      phase: s.phase
    };
  }

  /** The finale bar's data, or null when there is no living boss. */
  private bossHudInfo(): HudBossInfo | null {
    const boss = this.sim.state.boss;
    if (!boss || boss.hp <= 0) return null;
    const def = CONTENT.bosses[boss.typeId];
    if (!def) return null;
    return {
      name: def.name,
      title: def.title,
      hp: boss.hp,
      maxHp: boss.maxHp,
      phaseName: def.phases[boss.phaseIndex]?.name ?? ''
    };
  }

  override update(_time: number, delta: number): void {
    if (this.ended) return;

    // Hit-stop: freeze the world for a few frames on big hits. The sim is
    // simply not stepped (and delta not accumulated), so no ticks are lost.
    if (this.hitStopMs > 0) {
      this.hitStopMs -= delta;
      this.updateCamera();
      return;
    }

    this.accumulator += delta / 1000;
    let steps = 0;
    while (this.accumulator >= TICK_DT && steps < MAX_STEPS_PER_FRAME) {
      const events = simTick(this.sim, [this.commander.sample()]);
      this.handleEvents(events);
      this.accumulator -= TICK_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0; // avoid spiral of death

    this.syncSprites();

    // The Herald warns once when the lead hero drops into the danger zone.
    const p0 = this.sim.state.players[0];
    if (p0 && p0.alive) {
      const frac = p0.hp / p0.maxHp;
      if (!this.lowHpHeralded && frac <= 0.3) {
        this.lowHpHeralded = true;
        (this.scene.get('hud') as HudScene).herald('HEALTH CRITICAL', '#ff5a4d');
      } else if (this.lowHpHeralded && frac > 0.45) {
        this.lowHpHeralded = false; // re-arm once recovered
      }
    }

    if (this.exitSprite.visible) {
      const t = this.time.now;
      this.exitSprite.setScale(1 + 0.08 * Math.sin(t / 250));
      this.exitSprite.setRotation(t / 2000);
      this.exitGlow.setAlpha(0.32 + 0.12 * Math.sin(t / 300));
    }
    for (const glow of this.glows) {
      glow.img.setAlpha(0.24 + 0.1 * Math.sin(this.time.now / 500 + glow.phase));
    }

    this.updateCamera();
  }

  /** Smoothed follow with facing lookahead plus a decaying melee-impact kick. */
  private updateCamera(): void {
    const p = this.sim.state.players[0];
    if (!p) return;
    const tx = p.pos.x + p.facing.x * CAM_LOOKAHEAD;
    const ty = p.pos.y + p.facing.y * CAM_LOOKAHEAD;
    this.camFollow.x += (tx - this.camFollow.x) * CAM_LERP;
    this.camFollow.y += (ty - this.camFollow.y) * CAM_LERP;
    this.camKick.x *= CAM_KICK_DECAY;
    this.camKick.y *= CAM_KICK_DECAY;
    this.cameras.main.centerOn(this.camFollow.x + this.camKick.x, this.camFollow.y + this.camKick.y);
  }

  // -------------------------------------------------------------------------

  private handleEvents(events: SimEvent[]): void {
    const hud = this.scene.get('hud') as HudScene;
    for (const ev of events) {
      audio.playEvent(ev); // one call, throttled per-sound inside the engine
      switch (ev.type) {
        case 'attack':
          this.flashArc(ev.pos, ev.facing);
          break;
        case 'ability': {
          // Slowing abilities read as a resin cage, impact abilities as a slam.
          const caster = this.sim.state.players.find((pl) => pl.id === ev.playerId);
          const ab = caster ? CONTENT.heroes[caster.heroId]?.ability : undefined;
          if (ab?.kind === 'blast' && ab.slowTicks) this.resinCage(ev.pos, ev.radius);
          else this.shockwave(ev.pos, ev.radius);
          break;
        }
        case 'ability-dash':
          this.dashTrail(ev.playerId, ev.from, ev.to);
          break;
        case 'player-leveled':
          // The mid-fight reward moment (issue #46): gold burst + announcement.
          this.floatText(ev.pos, `LEVEL ${ev.level}`, '#ffd75e');
          this.flashRing(ev.pos, 70, 0xffd75e);
          this.burst(this.sparkFx, 16, ev.pos);
          this.cameras.main.flash(90, 255, 215, 94);
          hud.herald(`LEVEL ${ev.level} — YOU GROW STRONGER`, '#ffd75e');
          break;
        case 'pressure-rose': {
          // Escalating call so the player feels the clock without a timer UI.
          const line = ev.stage === 1 ? 'THE HIVE ROUSES' : ev.stage >= 4 ? 'THE HIVE IS FRENZIED' : 'THE HIVE SEETHES';
          hud.herald(line, '#ff5a4d');
          this.cameras.main.shake(220, 0.006);
          break;
        }
        case 'potion-used':
          this.potionBurst(ev.pos, ev.radius);
          hud.herald('HIVE-FIRE UNLEASHED', '#9fe06a');
          break;
        case 'ability-guard':
          this.cameras.main.flash(60, 150, 175, 210);
          this.flashRing(ev.pos, 40, 0xc2c8d2);
          break;
        case 'guard-block':
          // Sparks off the shield plus a small camera nudge on the block.
          this.burst(this.sparkFx, 4, ev.pos);
          this.flashRing(ev.pos, 18, 0xdfe6f2);
          this.hitStop(20);
          break;
        case 'enemy-hit':
          this.tintFlash(this.spriteFor(ev), 0xffffff);
          this.damageNumber(ev.pos, ev.damage, '#f4e3b2');
          this.burst(this.ichorFx, 2, ev.pos);
          this.meleeKick();
          break;
        case 'generator-hit':
          this.tintFlash(this.spriteFor(ev), 0xffffff);
          this.damageNumber(ev.pos, ev.damage, '#e1a6f0');
          this.burst(this.shardFx, 2, ev.pos);
          this.meleeKick();
          break;
        case 'enemy-spawned': {
          // Egg-burst at the hatch point plus a squash-pop on the source node.
          this.burst(this.ichorFx, 5, ev.pos);
          this.flashRing(ev.pos, 24, 0x9fe06a);
          this.hatchAtTick.set(ev.enemyId, this.sim.state.tick);
          const spawned = this.sim.state.enemies.find((e) => e.id === ev.enemyId);
          if (spawned?.sourceGen != null) this.genPopAt.set(spawned.sourceGen, this.time.now);
          // The Herald calls out elite arrivals so the party can react.
          if (spawned && CONTENT.enemies[spawned.typeId]?.tier === 'elite') {
            hud.herald('AN ELITE STIRS', '#ff5a4d');
          }
          break;
        }
        case 'enemy-died':
          this.deathPuff(ev.pos, 0x9fe06a);
          this.damageNumber(ev.pos, ev.damage, '#ffd75e');
          this.burst(this.ichorFx, 10, ev.pos);
          this.hitStop(35);
          break;
        case 'boss-telegraph': {
          // Name the incoming move so the tell is learnable, not just visual.
          const label =
            ev.action === 'lunge' ? 'SHE CHARGES!' : ev.action === 'glob' ? 'SHE SPITS!' : 'SHE CALLS THE BROOD!';
          this.floatText(ev.pos, label, '#ff5a4d');
          this.flashRing(ev.pos, 90, 0xff5a4d);
          this.burst(this.dustFx, 8, ev.pos);
          break;
        }
        case 'boss-phase':
          hud.herald(ev.name.toUpperCase(), '#ff5a4d');
          this.cameras.main.flash(120, 200, 90, 110);
          this.cameras.main.shake(240, 0.01);
          this.burst(this.shardFx, 14, ev.pos);
          this.flashRing(ev.pos, 130, 0xff5a4d);
          break;
        case 'boss-hit':
          this.tintFlash(this.sprites.get(ev.bossId), 0xffffff);
          this.damageNumber(ev.pos, ev.damage, '#ffd0e0');
          this.burst(this.ichorFx, 3, ev.pos);
          this.meleeKick();
          break;
        case 'boss-died': {
          // Finale spectacle: the #6 destruction pattern, scaled way up.
          hud.herald('MIREVEIL FALLS', '#ffd75e');
          this.deathPuff(ev.pos, 0xa855c8, 3.4);
          this.burst(this.shardFx, 24, ev.pos);
          this.burst(this.ichorFx, 24, ev.pos);
          this.burst(this.dustFx, 18, ev.pos);
          this.cameras.main.shake(600, 0.02);
          this.cameras.main.flash(200, 244, 227, 178);
          this.hitStop(90);
          const at = { ...ev.pos };
          for (const delay of [180, 380, 620]) {
            this.time.delayedCall(delay, () => {
              this.burst(this.shardFx, 14, at);
              this.burst(this.ichorFx, 10, at);
              this.flashRing(at, 120, 0xe1a6f0);
              this.cameras.main.shake(180, 0.012);
            });
          }
          const scorch = this.add.circle(at.x, at.y, 54, 0x000000, 0.28).setDepth(DEPTH_DECAL + 1);
          this.tweens.add({ targets: scorch, alpha: 0, duration: 4000, onComplete: () => scorch.destroy() });
          break;
        }
        case 'generator-enraged':
          this.floatText(ev.pos, 'ENRAGED', '#ff5a4d');
          this.burst(this.shardFx, 6, ev.pos);
          this.cameras.main.shake(100, 0.006);
          break;
        case 'generator-destroyed': {
          this.deathPuff(ev.pos, 0xa855c8, 1.8);
          this.burst(this.shardFx, 14, ev.pos);
          this.burst(this.dustFx, 10, ev.pos);
          this.cameras.main.shake(250, 0.014);
          this.hitStop(70);
          // Second detonation stage + a scorch that lingers on the floor.
          const pos = { ...ev.pos };
          this.time.delayedCall(120, () => {
            this.burst(this.shardFx, 10, pos);
            this.burst(this.ichorFx, 8, pos);
            this.flashRing(pos, 70, 0xa855c8);
          });
          const scorch = this.add.circle(pos.x, pos.y, 26, 0x000000, 0.22).setDepth(DEPTH_DECAL + 1);
          this.tweens.add({ targets: scorch, alpha: 0, duration: 2500, onComplete: () => scorch.destroy() });
          break;
        }
        case 'pickup-collected': {
          const label =
            ev.kind === 'gold' ? `+${ev.amount}` : ev.kind === 'key' ? 'KEY' : ev.kind === 'potion' ? 'POTION' : `+${ev.amount} HP`;
          const color =
            ev.kind === 'gold' ? '#ffd75e' : ev.kind === 'key' ? '#e6c34a' : ev.kind === 'potion' ? '#7be08a' : '#e0524d';
          this.floatText(ev.pos, label, color);
          this.burst(ev.kind === 'health' ? this.heartFx : this.sparkFx, ev.kind === 'health' ? 5 : 6, ev.pos);
          if (ev.kind === 'key') hud.herald('YOU FOUND A KEY', '#e6c34a');
          if (ev.kind === 'potion') hud.herald('HIVE-FIRE DRAUGHT — [Q] TO QUAFF', '#7be08a');
          break;
        }
        case 'powerup-gained': {
          const name = CONTENT.powerups[ev.power].name;
          const color = POWERUP_COLORS[ev.power] ?? 0xffffff;
          const hex = `#${color.toString(16).padStart(6, '0')}`;
          this.floatText(ev.pos, name.toUpperCase(), hex);
          this.flashRing(ev.pos, 34, color);
          this.burst(this.sparkFx, 8, ev.pos);
          hud.herald(`${name.toUpperCase()} EMPOWERED`, hex);
          break;
        }
        case 'player-hit':
          this.cameras.main.shake(80, 0.004);
          break;
        case 'prop-destroyed':
          this.deathPuff(ev.pos, 0xd9b26a, 0.8);
          this.burst(this.sparkFx, 4, ev.pos);
          break;
        case 'gate-opened':
          this.burst(this.dustFx, 10, ev.pos);
          this.flashRing(ev.pos, 30, 0xe6c34a);
          hud.herald('THE GATE SWINGS OPEN', '#e6c34a');
          break;
        case 'secret-hit':
          this.tintFlash(this.spriteFor({ enemyId: ev.secretId }), 0xffffff);
          this.burst(this.dustFx, 3, ev.pos);
          break;
        case 'secret-revealed':
          this.deathPuff(ev.pos, 0x8a8298, 1.6);
          this.burst(this.dustFx, 14, ev.pos);
          this.cameras.main.shake(180, 0.006);
          hud.herald('A HIDDEN PASSAGE!', '#bdf4ff');
          break;
        case 'projectile-fired':
          this.burst(this.sparkFx, 2, ev.pos); // muzzle flick
          break;
        case 'enemy-shot':
          this.burst(this.ichorFx, 3, ev.pos); // bile muzzle spit
          break;
        case 'enemy-line-attack':
          this.ravagerRupture(ev.pos, ev.dir, ev.length, ev.width);
          break;
        case 'projectile-expired':
          this.burst(this.dustFx, 2, ev.pos);
          break;
        case 'exit-opened':
          this.exitSprite.setVisible(true);
          this.exitGlow.setVisible(true);
          this.moteFx.setPosition(ev.pos.x, ev.pos.y);
          this.moteFx.start();
          this.floatText(ev.pos, 'THE WAY OPENS', '#64e6ff');
          hud.herald('THE WAY IS OPEN — FLEE THE WARRENS', '#64e6ff');
          break;
        case 'mission-complete':
          this.endMission(true);
          break;
        case 'mission-failed':
          this.endMission(false);
          break;
        default:
          break;
      }
    }
  }

  private spriteFor(ev: { enemyId?: EntityId; generatorId?: EntityId }): Phaser.GameObjects.Image | undefined {
    const id = ev.enemyId ?? ev.generatorId;
    return id === undefined ? undefined : this.sprites.get(id);
  }

  private endMission(victory: boolean): void {
    this.ended = true;
    const hud = this.scene.get('hud') as HudScene;
    const levelName = this.sim.config.level.name;
    hud.herald(victory ? `${levelName.toUpperCase()} CLEANSED` : 'THE PARTY HAS FALLEN', victory ? '#9fe06a' : '#ff5a4d');
    hud.banner(victory ? 'REALM CLEARED' : 'THE HIVE PREVAILS', victory ? '#ffd75e' : '#ff5a4d');
    const p = this.sim.state.players[0]!;
    this.time.delayedCall(1400, () => {
      audio.stopMusic();
      this.scene.stop('hud');
      this.scene.start('results', {
        victory,
        gold: p.gold,
        kills: p.kills,
        ticks: this.sim.state.tick,
        xpEarned: Math.max(0, p.xp - this.startXp),
        heroLevel: p.level,
        heroId: this.heroId,
        levelId: this.levelId
      });
    });
  }

  // -------------------------------------------------------------------------

  private syncSprites(): void {
    const s = this.sim.state;
    const seen = new Set<EntityId>();

    s.players.forEach((p, index) => {
      seen.add(p.id);
      this.trackMovement(p.id, p.pos, s.tick);
      const spr = this.ensureSprite(p.id, heroFrame(p.heroId, 2, 'w0'));
      spr.setTexture(heroFrame(p.heroId, facingDirIndex(p.facing.x, p.facing.y), this.heroPose(p, s.tick)));
      spr.setPosition(p.pos.x, p.pos.y).setDepth(p.pos.y);
      spr.setAlpha(p.invulnTicks > 0 && p.invulnTicks % 10 < 5 ? 0.4 : 1);
      if (!p.alive) spr.setTint(0x555555);

      this.ensureShadow(p.id).setPosition(p.pos.x, p.pos.y + 10);

      // Bastion Wall: a steel shield-glow ring pulses beneath the hero while
      // the guard stance is up.
      const guarding = p.guardTicks > 0;
      let gg = this.guardGlow.get(p.id);
      if (!gg) {
        gg = this.add.image(0, 0, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xbcd0ee);
        this.guardGlow.set(p.id, gg);
      }
      gg.setVisible(guarding).setPosition(p.pos.x, p.pos.y).setDepth(p.pos.y - 1);
      if (guarding) gg.setScale(1.7).setAlpha(0.35 + 0.18 * Math.sin(this.time.now / 110));

      // Power-up aura: a soft glow tinted by whichever relic buff is active.
      const activeBuff = POWERUP_KINDS.find((k) => p.power[k] > 0);
      let aura = this.powerAura.get(p.id);
      if (!aura) {
        aura = this.add.image(0, 0, TEX.glow).setBlendMode(Phaser.BlendModes.ADD);
        this.powerAura.set(p.id, aura);
      }
      aura.setVisible(activeBuff !== undefined).setPosition(p.pos.x, p.pos.y).setDepth(p.pos.y - 1);
      if (activeBuff) {
        aura.setTint(POWERUP_COLORS[activeBuff] ?? 0xffffff);
        aura.setScale(1.4).setAlpha(0.3 + 0.14 * Math.sin(this.time.now / 130));
      }

      const accent = playerAccent(index);
      let ring = this.rings.get(p.id);
      if (!ring) {
        ring = this.add.image(0, 0, TEX.accentRing).setDepth(DEPTH_DECAL).setScale(1, 0.55).setAlpha(0.55);
        this.rings.set(p.id, ring);
      }
      ring.setTint(accent).setPosition(p.pos.x, p.pos.y + 9);

      let chev = this.chevrons.get(p.id);
      if (!chev) {
        chev = this.add.image(0, 0, TEX.chevron).setAlpha(0.9);
        this.chevrons.set(p.id, chev);
      }
      chev
        .setTint(accent)
        .setPosition(p.pos.x + p.facing.x * 22, p.pos.y + p.facing.y * 22)
        .setRotation(Math.atan2(p.facing.y, p.facing.x))
        .setDepth(p.pos.y + 1)
        .setVisible(p.alive);
    });

    for (const e of s.enemies) {
      seen.add(e.id);
      const def = CONTENT.enemies[e.typeId];
      const family = def?.family ?? 'skitter';
      const tier = def?.tier ?? 'common';
      const elite = tier === 'elite';
      const spr = this.ensureSprite(e.id, enemyFrame(family, tier, 'w0'));
      const prev = this.lastPos.get(e.id);
      if (prev) {
        const dx = e.pos.x - prev.x;
        const dy = e.pos.y - prev.y;
        if (Math.hypot(dx, dy) > 0.3) spr.setRotation(Math.atan2(dy, dx));
      }
      this.trackMovement(e.id, e.pos, s.tick);

      // The sim now owns the telegraph (#39): a real windup state drives the
      // pose, so the very first contact hit is foreshadowed too. Face whoever
      // it's winding up to strike.
      const target = this.nearestLivingPlayer(e.pos);
      const windup = e.windupTicksLeft > 0;

      let frame: EnemyAnimFrame;
      if (windup && target) {
        frame = 'windup';
        spr.setRotation(Math.atan2(target.pos.y - e.pos.y, target.pos.x - e.pos.x));
      } else {
        frame = (Math.floor(s.tick / CRAWL_FRAME_TICKS) + e.id) % 2 === 0 ? 'w0' : 'w1';
      }
      spr.setTexture(enemyFrame(family, tier, frame));
      const line = def?.melee?.kind === 'line' ? def.melee : undefined;
      let ruptureGuide = this.ruptureGuides.get(e.id);
      if (windup && line && e.windupDir) {
        const length = e.windupLength ?? line.length;
        const angle = Math.atan2(e.windupDir.y, e.windupDir.x);
        if (!ruptureGuide) {
          ruptureGuide = this.add.rectangle(0, 0, 1, 1, 0xff5a4d, 0.28).setDepth(DEPTH_DECAL + 1);
          this.ruptureGuides.set(e.id, ruptureGuide);
        }
        ruptureGuide
          .setPosition(e.pos.x + e.windupDir.x * (length / 2), e.pos.y + e.windupDir.y * (length / 2))
          .setSize(length, line.width)
          .setRotation(angle)
          .setAlpha(0.18 + 0.12 * Math.sin(this.time.now / 55));
      } else if (ruptureGuide) {
        ruptureGuide.destroy();
        this.ruptureGuides.delete(e.id);
      }
      // Resin-caged enemies read amber; clear the tint exactly once on expiry
      // so hit flashes aren't stomped every frame.
      if (e.slowTicks > 0) {
        spr.setTint(0xd9c46a);
        this.slowedIds.add(e.id);
      } else if (this.slowedIds.has(e.id)) {
        spr.clearTint();
        this.slowedIds.delete(e.id);
      }
      // Freshly-hatched enemies scale in from the egg-burst; elites run big.
      const hatchAge = s.tick - (this.hatchAtTick.get(e.id) ?? -Infinity);
      const hatchMul = hatchAge < HATCH_TICKS ? 0.25 + 0.75 * (hatchAge / HATCH_TICKS) : 1;
      spr.setScale((windup ? 1.18 : 1) * (elite ? 1.3 : 1) * hatchMul);
      spr.setPosition(e.pos.x, e.pos.y).setDepth(e.pos.y);
      this.ensureShadow(e.id, elite ? 0.95 : 0.7).setPosition(e.pos.x, e.pos.y + 8);

      // Elites carry a persistent ground ring so they stay trackable in a horde.
      let eliteRing = this.rings.get(e.id);
      if (!eliteRing && elite) {
        eliteRing = this.add.image(0, 0, TEX.accentRing).setDepth(DEPTH_DECAL).setScale(1.1, 0.6).setTint(0xff5a4d).setAlpha(0.6);
        this.rings.set(e.id, eliteRing);
      }
      if (eliteRing) eliteRing.setPosition(e.pos.x, e.pos.y + 7);

      // Motion streak while the knockback vector is meaningful.
      const kbMag = Math.hypot(e.knockback.x, e.knockback.y);
      if (kbMag > 60 && this.trailCount < MAX_TRAIL_GHOSTS && s.tick % 2 === 0) {
        this.trailCount++;
        const ghost = this.add
          .image(e.pos.x, e.pos.y, spr.texture.key)
          .setRotation(spr.rotation)
          .setAlpha(0.28)
          .setTint(0xbfe89a)
          .setDepth(e.pos.y - 1);
        this.tweens.add({
          targets: ghost,
          alpha: 0,
          duration: 140,
          onComplete: () => {
            ghost.destroy();
            this.trailCount--;
          }
        });
      }
    }

    for (const g of s.generators) {
      seen.add(g.id);
      const frac = g.hp / g.maxHp;
      const tier = frac > 2 / 3 ? 0 : frac > 1 / 3 ? 1 : 2;
      const spr = this.ensureSprite(g.id, broodNodeFrame(0));
      spr.setTexture(broodNodeFrame(tier));
      spr.setPosition(g.pos.x, g.pos.y).setDepth(g.pos.y);

      // Breathing (faster when enraged), pre-spawn bulge, and spawn squash-pop.
      const enraged = g.enrageTicksLeft > 0;
      const breath = (enraged ? 0.06 : 0.03) * Math.sin(this.time.now / (enraged ? 180 : 400) + g.id);
      const def = CONTENT.generators[g.typeId];
      const aliveFromThis = s.enemies.reduce((n, e) => n + (e.sourceGen === g.id ? 1 : 0), 0);
      const canSpawn = def !== undefined && aliveFromThis < def.maxAlive;
      const bulge =
        canSpawn && g.spawnCooldown <= PRESPAWN_BULGE_TICKS
          ? ((PRESPAWN_BULGE_TICKS - g.spawnCooldown) / PRESPAWN_BULGE_TICKS) * 0.12
          : 0;
      const pop = Math.max(0, 1 - (this.time.now - (this.genPopAt.get(g.id) ?? -Infinity)) / 140);
      spr.setScale(1 + breath + bulge + 0.16 * pop, 1 + breath + bulge - 0.1 * pop);

      this.ensureShadow(g.id, 1.4).setPosition(g.pos.x, g.pos.y + 16);

      // Enraged nodes get a pulsing red warning ring.
      let ring = this.rings.get(g.id);
      if (!ring && enraged) {
        ring = this.add.image(0, 0, TEX.accentRing).setDepth(DEPTH_DECAL).setScale(1.6, 0.9).setTint(0xff5a4d);
        this.rings.set(g.id, ring);
      }
      if (ring) {
        ring
          .setPosition(g.pos.x, g.pos.y + 8)
          .setVisible(enraged)
          .setAlpha(0.35 + 0.25 * Math.sin(this.time.now / 90));
      }

      let bar = this.genHpBars.get(g.id);
      if (!bar) {
        bar = this.add.rectangle(g.pos.x, g.pos.y - 30, 40, 5, 0xa855c8).setDepth(DEPTH_FX);
        this.genHpBars.set(g.id, bar);
      }
      bar.width = 40 * frac;
      bar.setFillStyle(tier === 0 ? 0xa855c8 : tier === 1 ? 0xf0a35e : 0xff5a4d);
    }

    // The boss (issue #25): damage-tier texture, a swelling telegraph tell, and
    // a hard tint while she is mid-charge.
    const boss = s.boss;
    if (boss && boss.hp > 0) {
      seen.add(boss.id);
      const bdef = CONTENT.bosses[boss.typeId];
      const frac = boss.hp / boss.maxHp;
      const tier = frac > 2 / 3 ? 0 : frac > 1 / 3 ? 1 : 2;
      const spr = this.ensureSprite(boss.id, bossFrame(boss.typeId, 0));
      spr.setTexture(bossFrame(boss.typeId, tier));
      spr.setPosition(boss.pos.x, boss.pos.y).setDepth(boss.pos.y);
      spr.setRotation(Math.atan2(boss.facing.y, boss.facing.x) - Math.PI / 2); // art faces south

      // Telegraph: she swells and flares red over the windup, so the tell is
      // unmistakable before anything lands.
      const tel = bdef ? boss.telegraphTicksLeft / Math.max(1, bdef.telegraphTicks) : 0;
      const charging = boss.lungeTicksLeft > 0;
      if (boss.telegraphTicksLeft > 0) {
        const swell = 1 + 0.14 * (1 - tel);
        spr.setScale(swell);
        spr.setTint(Phaser.Display.Color.GetColor(255, 190 - Math.round(120 * (1 - tel)), 190 - Math.round(120 * (1 - tel))));
      } else if (charging) {
        spr.setScale(1.06);
        spr.setTint(0xff8a7a);
      } else {
        spr.setScale(1 + 0.02 * Math.sin(this.time.now / 420));
        spr.clearTint();
      }

      this.ensureShadow(boss.id, 2.6).setPosition(boss.pos.x, boss.pos.y + 26);

      // A persistent ground ring marks her footprint; it pulses on the windup.
      let ring = this.rings.get(boss.id);
      if (!ring) {
        ring = this.add.image(0, 0, TEX.accentRing).setDepth(DEPTH_DECAL).setScale(2.3, 1.3).setTint(0xff5a4d);
        this.rings.set(boss.id, ring);
      }
      ring.setPosition(boss.pos.x, boss.pos.y + 18).setAlpha(boss.telegraphTicksLeft > 0 ? 0.35 + 0.4 * (1 - tel) : 0.28);

      // Charge trail while she barrels forward.
      if (charging && this.trailCount < MAX_TRAIL_GHOSTS && s.tick % 2 === 0) {
        this.trailCount++;
        const ghost = this.add
          .image(boss.pos.x, boss.pos.y, spr.texture.key)
          .setRotation(spr.rotation)
          .setAlpha(0.3)
          .setTint(0xff8a7a)
          .setDepth(boss.pos.y - 1);
        this.tweens.add({
          targets: ghost,
          alpha: 0,
          duration: 180,
          onComplete: () => {
            ghost.destroy();
            this.trailCount--;
          }
        });
      }
    }

    for (const pk of s.pickups) {
      seen.add(pk.id);
      const key =
        pk.kind === 'gold'
          ? TEX.gold
          : pk.kind === 'health'
            ? TEX.health
            : pk.kind === 'key'
              ? TEX.key
              : pk.kind === 'potion'
                ? TEX.potion
                : powerupTexture(pk.power ?? 'frenzy');
      const spr = this.ensureSprite(pk.id, key);
      const bob = Math.sin(this.time.now / 280 + pk.id) * 2.5;
      spr.setPosition(pk.pos.x, pk.pos.y - 3 + bob).setDepth(pk.pos.y);
      // Relics spin gently so they read as special.
      if (pk.kind === 'powerup') spr.setRotation(Math.sin(this.time.now / 600 + pk.id) * 0.4);
      this.ensureShadow(pk.id, 0.5).setPosition(pk.pos.x, pk.pos.y + 7);
    }

    for (const pr of s.props) {
      seen.add(pr.id);
      this.ensureSprite(pr.id, propTexture(pr.typeId)).setPosition(pr.pos.x, pr.pos.y).setDepth(pr.pos.y);
    }

    // Locked gates render as barred doors; unlocking drops them from `seen` so
    // the sprite is torn down. Secret walls masquerade as ordinary wall tops
    // until broken (then removed from state → sprite cleaned up).
    const ts = s ? this.sim.config.level.tileSize : 32;
    for (const gate of s.gates) {
      if (!gate.locked) continue;
      seen.add(gate.id);
      this.ensureSprite(gate.id, TEX.gate).setPosition(gate.pos.x, gate.pos.y).setDepth((gate.ty + 1) * ts);
    }
    for (const sw of s.secrets) {
      seen.add(sw.id);
      this.ensureSprite(sw.id, TEX.wall).setPosition(sw.pos.x, sw.pos.y).setDepth((sw.ty + 1) * ts);
    }

    for (const bolt of s.projectiles) {
      seen.add(bolt.id);
      const spr = this.ensureSprite(bolt.id, TEX.bolt);
      spr
        .setPosition(bolt.pos.x, bolt.pos.y)
        .setRotation(Math.atan2(bolt.vel.y, bolt.vel.x))
        // Enemy bile reads sickly-green; player bolts stay hot gold.
        .setTint(bolt.hostile ? 0x9fe06a : 0xffd75e)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(bolt.pos.y + 1);
    }

    for (const [id, spr] of this.sprites) {
      if (!seen.has(id)) {
        spr.destroy();
        this.sprites.delete(id);
        this.lastPos.delete(id);
        this.movedAtTick.delete(id);
        this.genPopAt.delete(id);
        this.hatchAtTick.delete(id);
        this.slowedIds.delete(id);
        for (const map of [this.shadows, this.rings, this.chevrons, this.guardGlow, this.powerAura, this.ruptureGuides]) {
          map.get(id)?.destroy();
          map.delete(id);
        }
        const bar = this.genHpBars.get(id);
        if (bar) {
          bar.destroy();
          this.genHpBars.delete(id);
        }
      }
    }
  }

  /** Records the last tick an entity's position changed (drives walk cycles). */
  private trackMovement(id: EntityId, pos: Vec2, tick: number): void {
    const prev = this.lastPos.get(id);
    if (!prev || Math.hypot(pos.x - prev.x, pos.y - prev.y) > 0.2) {
      this.movedAtTick.set(id, tick);
    }
    this.lastPos.set(id, { x: pos.x, y: pos.y });
  }

  private heroPose(p: PlayerState, tick: number): HeroPose {
    const cooldown = CONTENT.heroes[p.heroId]?.attack.cooldownTicks ?? 0;
    if (cooldown > 0 && p.attackCooldown > cooldown - ATTACK_POSE_TICKS) return 'atk';
    const walking = tick - (this.movedAtTick.get(p.id) ?? -Infinity) <= 2;
    if (!walking) return 'w0';
    return Math.floor(tick / WALK_FRAME_TICKS) % 2 === 0 ? 'w0' : 'w1';
  }

  private nearestLivingPlayer(from: Vec2): PlayerState | null {
    let best: PlayerState | null = null;
    let bestDist = Infinity;
    for (const p of this.sim.state.players) {
      if (!p.alive) continue;
      const dist = Math.hypot(p.pos.x - from.x, p.pos.y - from.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = p;
      }
    }
    return best;
  }

  private ensureSprite(id: EntityId, key: string): Phaser.GameObjects.Image {
    let spr = this.sprites.get(id);
    if (!spr) {
      spr = this.add.image(0, 0, key);
      this.sprites.set(id, spr);
    }
    return spr;
  }

  private ensureShadow(id: EntityId, scale = 1): Phaser.GameObjects.Image {
    let shadow = this.shadows.get(id);
    if (!shadow) {
      shadow = this.add.image(0, 0, TEX.shadow).setDepth(DEPTH_SHADOW).setScale(scale);
      this.shadows.set(id, shadow);
    }
    return shadow;
  }

  // -------------------------------------------------------------------------
  // Feedback effects

  private burst(fx: Phaser.GameObjects.Particles.ParticleEmitter, count: number, pos: Vec2): void {
    if (fx.getAliveParticleCount() > MAX_ALIVE_PARTICLES) return;
    fx.explode(count, pos.x, pos.y);
  }

  private hitStop(ms: number): void {
    this.hitStopMs = Math.min(HIT_STOP_MAX_MS, Math.max(this.hitStopMs, ms));
  }

  /** 2–3 px camera nudge in the player's facing when their melee connects. */
  private meleeKick(): void {
    const p = this.sim.state.players[0];
    if (!p) return;
    this.camKick.x = p.facing.x * 3;
    this.camKick.y = p.facing.y * 3;
  }

  private damageNumber(pos: Vec2, amount: number, color: string): void {
    if (this.floatCount >= MAX_FLOAT_TEXTS) return;
    this.floatCount++;
    const t = this.add
      .text(pos.x + (Math.random() - 0.5) * 12, pos.y - 10, String(Math.round(amount)), {
        fontFamily: 'monospace',
        fontSize: '12px',
        color,
        stroke: '#000000',
        strokeThickness: 3
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_TEXT);
    this.tweens.add({
      targets: t,
      y: t.y - 26,
      alpha: 0,
      duration: 500,
      onComplete: () => {
        t.destroy();
        this.floatCount--;
      }
    });
  }

  /** Resin Cage presentation: violet flash, ring, lingering hardened-web decal. */
  private resinCage(pos: Vec2, radius: number): void {
    this.cameras.main.flash(50, 190, 150, 235);
    this.cameras.main.shake(80, 0.004);
    this.flashRing(pos, radius, 0xa855c8);
    const web = this.add
      .image(pos.x, pos.y, TEX.decorWeb)
      .setScale((radius * 2) / 28)
      .setAlpha(0.7)
      .setTint(0xd9b26a)
      .setDepth(DEPTH_DECAL + 1);
    this.tweens.add({ targets: web, alpha: 0, duration: 2000, onComplete: () => web.destroy() });
    this.burst(this.dustFx, 8, pos);
  }

  /** Volley Step presentation: a fan of fading hero afterimages along the dash. */
  private dashTrail(playerId: EntityId, from: Vec2, to: Vec2): void {
    const spr = this.sprites.get(playerId);
    const key = spr?.texture.key ?? heroFrame(this.heroId, 2, 'w0');
    const accent = playerAccent(Math.max(0, this.sim.state.players.findIndex((pl) => pl.id === playerId)));
    const GHOSTS = 5;
    for (let i = 0; i < GHOSTS; i++) {
      const t = i / (GHOSTS - 1);
      const ghost = this.add
        .image(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, key)
        .setAlpha(0.45 * (1 - t * 0.5))
        .setTint(accent)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(to.y - 1);
      this.tweens.add({ targets: ghost, alpha: 0, duration: 260, onComplete: () => ghost.destroy() });
    }
    this.camKick.x = (to.x - from.x) * 0.06;
    this.camKick.y = (to.y - from.y) * 0.06;
    this.burst(this.dustFx, 6, from);
  }

  /** Sunder Slam presentation: screen flash, double shockwave, scorch, heavy shake. */
  private shockwave(pos: Vec2, radius: number): void {
    this.cameras.main.flash(60, 244, 227, 178);
    this.cameras.main.shake(160, 0.012);
    this.flashRing(pos, radius, 0xd9a441);
    const ring = this.add.circle(pos.x, pos.y, 14).setStrokeStyle(3, 0xf4e3b2, 0.9).setDepth(DEPTH_FX);
    this.tweens.add({ targets: ring, radius: radius * 1.15, alpha: 0, duration: 380, onComplete: () => ring.destroy() });
    const scorch = this.add.circle(pos.x, pos.y, radius * 0.55, 0x000000, 0.18).setDepth(DEPTH_DECAL + 1);
    this.tweens.add({ targets: scorch, alpha: 0, duration: 1200, onComplete: () => scorch.destroy() });
    this.burst(this.dustFx, 12, pos);
  }

  /** Gravebound Ravager: an instant wall-clipped fissure along its committed facing. */
  private ravagerRupture(pos: Vec2, dir: Vec2, length: number, width: number): void {
    if (length <= 0) return;
    const angle = Math.atan2(dir.y, dir.x);
    const cx = pos.x + dir.x * (length / 2);
    const cy = pos.y + dir.y * (length / 2);
    const crack = this.add
      .rectangle(cx, cy, length, Math.max(5, width * 0.35), 0x8f2f30, 0.72)
      .setRotation(angle)
      .setDepth(DEPTH_FX);
    const core = this.add
      .rectangle(cx, cy, length, 3, 0xff8a7a, 0.9)
      .setRotation(angle)
      .setDepth(DEPTH_FX + 1);
    this.tweens.add({ targets: [crack, core], alpha: 0, duration: 360, onComplete: () => {
      crack.destroy();
      core.destroy();
    } });
    this.cameras.main.shake(130, 0.009);
    this.burst(this.dustFx, 10, { x: pos.x + dir.x * length, y: pos.y + dir.y * length });
  }

  /** Potion (#41): a big green hive-fire detonation — flash, shockwave, scorch. */
  private potionBurst(pos: Vec2, radius: number): void {
    this.cameras.main.flash(90, 150, 224, 138);
    this.cameras.main.shake(220, 0.016);
    this.hitStop(60);
    this.flashRing(pos, radius, 0x9fe06a);
    const ring = this.add.circle(pos.x, pos.y, 16).setStrokeStyle(4, 0xd6ffd0, 0.9).setDepth(DEPTH_FX);
    this.tweens.add({ targets: ring, radius: radius * 1.05, alpha: 0, duration: 420, ease: 'Quad.Out', onComplete: () => ring.destroy() });
    const scorch = this.add.circle(pos.x, pos.y, radius * 0.5, 0x1c3a22, 0.22).setDepth(DEPTH_DECAL + 1);
    this.tweens.add({ targets: scorch, alpha: 0, duration: 1600, onComplete: () => scorch.destroy() });
    this.burst(this.sparkFx, 16, pos);
    this.burst(this.dustFx, 14, pos);
    this.burst(this.shardFx, 8, pos);
  }

  private flashArc(pos: { x: number; y: number }, facing: { x: number; y: number }): void {
    const angle = Math.atan2(facing.y, facing.x);
    const g = this.add.graphics({ x: pos.x, y: pos.y }).setDepth(DEPTH_FX);
    g.fillStyle(0xf4e3b2, 0.55);
    g.slice(0, 0, 52, angle - 0.95, angle + 0.95);
    g.fillPath();
    this.tweens.add({ targets: g, alpha: 0, duration: 120, onComplete: () => g.destroy() });
  }

  private flashRing(pos: { x: number; y: number }, radius: number, color: number): void {
    const circle = this.add.circle(pos.x, pos.y, 12, color, 0.5).setDepth(DEPTH_FX);
    this.tweens.add({
      targets: circle,
      radius,
      alpha: 0,
      duration: 250,
      onComplete: () => circle.destroy()
    });
  }

  private tintFlash(spr: Phaser.GameObjects.Image | undefined, color: number): void {
    if (!spr) return;
    spr.setTintFill(color);
    this.time.delayedCall(60, () => {
      if (spr.active) spr.clearTint();
    });
  }

  private deathPuff(pos: { x: number; y: number }, color: number, scale = 1): void {
    const circle = this.add.circle(pos.x, pos.y, 10 * scale, color, 0.7).setDepth(DEPTH_FX);
    this.tweens.add({
      targets: circle,
      scale: 2.2,
      alpha: 0,
      duration: 200,
      onComplete: () => circle.destroy()
    });
  }

  private floatText(pos: { x: number; y: number }, text: string, color: string): void {
    const t = this.add
      .text(pos.x, pos.y - 14, text, { fontFamily: 'monospace', fontSize: '13px', color })
      .setOrigin(0.5)
      .setDepth(DEPTH_TEXT);
    this.tweens.add({ targets: t, y: pos.y - 44, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }
}
