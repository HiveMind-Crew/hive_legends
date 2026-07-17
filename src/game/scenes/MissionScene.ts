import Phaser from 'phaser';
import { BROOD_WARRENS, CONTENT } from '../../content';
import { loadProfile, profileModifiers } from '../../meta/save';
import { levelHeightPx, levelWidthPx } from '../../sim/level';
import { createSim, simTick, type Sim } from '../../sim/sim';
import { TICK_DT, type EntityId, type PlayerState, type SimEvent, type Vec2 } from '../../sim/types';
import { playerAccent } from '../colors';
import { KeyboardCommander } from '../input';
import { TEX, facingDirIndex, heroFrame, skitterFrame, type HeroPose, type SkitterFrameId } from '../textures';

const MAX_STEPS_PER_FRAME = 5;

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
const WINDUP_TICKS = 12; // enemy cooldown remainder shown as a windup telegraph

// Combat-juice caps and camera feel (issue #3). Hit-stop pauses render
// stepping only — the sim accumulator holds, no ticks are ever skipped.
const HIT_STOP_MAX_MS = 90;
const MAX_ALIVE_PARTICLES = 300;
const MAX_FLOAT_TEXTS = 24;
const MAX_TRAIL_GHOSTS = 40;
const CAM_LOOKAHEAD = 36;
const CAM_LERP = 0.08;
const CAM_KICK_DECAY = 0.8;

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
  private exitSprite!: Phaser.GameObjects.Image;
  private ended = false;
  private hitStopMs = 0;
  private camFollow = { x: 0, y: 0 };
  private camKick = { x: 0, y: 0 };
  private trailCount = 0;
  private floatCount = 0;
  private ichorFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private shardFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparkFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dustFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private heartFx!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super('mission');
  }

  create(): void {
    const profile = loadProfile();
    this.sim = createSim({
      seed: (Date.now() ^ 0x5eed) >>> 0,
      level: BROOD_WARRENS,
      players: [{ heroId: 'vanguard', modifiers: profileModifiers(profile) }],
      content: CONTENT
    });
    this.accumulator = 0;
    this.ended = false;
    this.sprites.clear();
    this.shadows.clear();
    this.rings.clear();
    this.chevrons.clear();
    this.genHpBars.clear();
    this.lastPos.clear();
    this.movedAtTick.clear();
    this.hitStopMs = 0;
    this.camKick = { x: 0, y: 0 };
    this.trailCount = 0;
    this.floatCount = 0;
    const spawn = this.sim.state.players[0]?.pos ?? { x: 0, y: 0 };
    this.camFollow = { x: spawn.x, y: spawn.y };
    this.commander = new KeyboardCommander(this);

    this.drawLevel();
    this.createEmitters();

    this.exitSprite = this.add
      .image(this.sim.state.exitPos.x, this.sim.state.exitPos.y, TEX.exit)
      .setDepth(DEPTH_DECAL)
      .setVisible(false);

    const level = this.sim.config.level;
    this.cameras.main.setBounds(0, 0, levelWidthPx(level), levelHeightPx(level));
    this.cameras.main.setZoom(1.25);

    this.scene.launch('hud');

    // Read-only debug handle for automated end-to-end tests.
    (globalThis as Record<string, unknown>).__hive = {
      getState: () => JSON.parse(JSON.stringify(this.sim.state)) as unknown
    };
  }

  private drawLevel(): void {
    const level = this.sim.config.level;
    const ts = level.tileSize;
    level.walls.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) {
        if (row[tx] === '#') {
          // Walls y-sort by their bottom edge so they draw over entities
          // standing behind (north of) them.
          const bottomY = (ty + 1) * ts;
          this.add.image(tx * ts + ts / 2, ty * ts + ts / 2, TEX.wall).setDepth(bottomY);
          // South-facing wall edges get a front face, faking wall height.
          const below = level.walls[ty + 1];
          if (below && below[tx] === '.') {
            this.add.image(tx * ts + ts / 2, bottomY + 8, TEX.wallFace).setDepth(bottomY);
          }
        } else {
          this.add.image(tx * ts + ts / 2, ty * ts + ts / 2, TEX.floor).setDepth(0);
        }
      }
    });
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
  }

  /** Snapshot consumed by the parallel HUD scene each frame. */
  hudInfo(): {
    hp: number;
    maxHp: number;
    gold: number;
    kills: number;
    generatorsLeft: number;
    phase: string;
    abilityCooldown: number;
    abilityName: string;
  } | null {
    if (!this.sim) return null;
    const s = this.sim.state;
    const p = s.players[0];
    if (!p) return null;
    const hero = CONTENT.heroes[p.heroId];
    return {
      hp: p.hp,
      maxHp: p.maxHp,
      gold: p.gold,
      kills: p.kills,
      generatorsLeft: s.generators.length,
      phase: s.phase,
      abilityCooldown: p.abilityCooldown,
      abilityName: hero?.ability.name ?? ''
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

    if (this.exitSprite.visible) {
      const t = this.time.now;
      this.exitSprite.setScale(1 + 0.08 * Math.sin(t / 250));
      this.exitSprite.setRotation(t / 2000);
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
    for (const ev of events) {
      switch (ev.type) {
        case 'attack':
          this.flashArc(ev.pos, ev.facing);
          break;
        case 'ability':
          this.shockwave(ev.pos, ev.radius);
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
        case 'enemy-died':
          this.deathPuff(ev.pos, 0x9fe06a);
          this.damageNumber(ev.pos, ev.damage, '#ffd75e');
          this.burst(this.ichorFx, 10, ev.pos);
          this.hitStop(35);
          break;
        case 'generator-destroyed':
          this.deathPuff(ev.pos, 0xa855c8, 1.8);
          this.burst(this.shardFx, 14, ev.pos);
          this.burst(this.dustFx, 10, ev.pos);
          this.cameras.main.shake(200, 0.012);
          this.hitStop(60);
          break;
        case 'pickup-collected':
          this.floatText(ev.pos, ev.kind === 'gold' ? `+${ev.amount}` : `+${ev.amount} HP`, ev.kind === 'gold' ? '#ffd75e' : '#e0524d');
          this.burst(ev.kind === 'gold' ? this.sparkFx : this.heartFx, ev.kind === 'gold' ? 6 : 5, ev.pos);
          break;
        case 'player-hit':
          this.cameras.main.shake(80, 0.004);
          break;
        case 'exit-opened':
          this.exitSprite.setVisible(true);
          this.floatText(ev.pos, 'THE WAY OPENS', '#64e6ff');
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
    const p = this.sim.state.players[0]!;
    this.time.delayedCall(600, () => {
      this.scene.stop('hud');
      this.scene.start('results', {
        victory,
        gold: p.gold,
        kills: p.kills,
        ticks: this.sim.state.tick
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
      const spr = this.ensureSprite(p.id, heroFrame(2, 'w0'));
      spr.setTexture(heroFrame(facingDirIndex(p.facing.x, p.facing.y), this.heroPose(p, s.tick)));
      spr.setPosition(p.pos.x, p.pos.y).setDepth(p.pos.y);
      spr.setAlpha(p.invulnTicks > 0 && p.invulnTicks % 10 < 5 ? 0.4 : 1);
      if (!p.alive) spr.setTint(0x555555);

      this.ensureShadow(p.id).setPosition(p.pos.x, p.pos.y + 10);

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
      const spr = this.ensureSprite(e.id, skitterFrame('w0'));
      const prev = this.lastPos.get(e.id);
      if (prev) {
        const dx = e.pos.x - prev.x;
        const dy = e.pos.y - prev.y;
        if (Math.hypot(dx, dy) > 0.3) spr.setRotation(Math.atan2(dy, dx));
      }
      this.trackMovement(e.id, e.pos, s.tick);

      const def = CONTENT.enemies[e.typeId];
      const target = this.nearestLivingPlayer(e.pos);
      const windup =
        def !== undefined &&
        target !== null &&
        e.attackCooldown > 0 &&
        e.attackCooldown <= WINDUP_TICKS &&
        Math.hypot(target.pos.x - e.pos.x, target.pos.y - e.pos.y) <= def.attackRange * 1.5;

      let frame: SkitterFrameId;
      if (windup && target) {
        frame = 'windup';
        spr.setRotation(Math.atan2(target.pos.y - e.pos.y, target.pos.x - e.pos.x));
      } else {
        frame = (Math.floor(s.tick / CRAWL_FRAME_TICKS) + e.id) % 2 === 0 ? 'w0' : 'w1';
      }
      spr.setTexture(skitterFrame(frame));
      spr.setScale(windup ? 1.18 : 1);
      spr.setPosition(e.pos.x, e.pos.y).setDepth(e.pos.y);
      this.ensureShadow(e.id, 0.7).setPosition(e.pos.x, e.pos.y + 8);

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
      const spr = this.ensureSprite(g.id, TEX.broodNode);
      spr.setPosition(g.pos.x, g.pos.y).setDepth(g.pos.y);
      spr.setScale(1 + 0.03 * Math.sin(this.time.now / 400 + g.id));
      this.ensureShadow(g.id, 1.4).setPosition(g.pos.x, g.pos.y + 16);
      let bar = this.genHpBars.get(g.id);
      if (!bar) {
        bar = this.add.rectangle(g.pos.x, g.pos.y - 30, 40, 5, 0xa855c8).setDepth(DEPTH_FX);
        this.genHpBars.set(g.id, bar);
      }
      bar.width = 40 * (g.hp / g.maxHp);
    }

    for (const pk of s.pickups) {
      seen.add(pk.id);
      const spr = this.ensureSprite(pk.id, pk.kind === 'gold' ? TEX.gold : TEX.health);
      const bob = Math.sin(this.time.now / 280 + pk.id) * 2.5;
      spr.setPosition(pk.pos.x, pk.pos.y - 3 + bob).setDepth(pk.pos.y);
      this.ensureShadow(pk.id, 0.5).setPosition(pk.pos.x, pk.pos.y + 7);
    }

    for (const [id, spr] of this.sprites) {
      if (!seen.has(id)) {
        spr.destroy();
        this.sprites.delete(id);
        this.lastPos.delete(id);
        this.movedAtTick.delete(id);
        for (const map of [this.shadows, this.rings, this.chevrons]) {
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
