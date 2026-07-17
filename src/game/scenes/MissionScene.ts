import Phaser from 'phaser';
import { BROOD_WARRENS, CONTENT } from '../../content';
import { loadProfile, profileModifiers } from '../../meta/save';
import { levelHeightPx, levelWidthPx } from '../../sim/level';
import { createSim, simTick, type Sim } from '../../sim/sim';
import { TICK_DT, type EntityId, type SimEvent } from '../../sim/types';
import { KeyboardCommander } from '../input';
import { TEX } from '../textures';

const MAX_STEPS_PER_FRAME = 5;

/** Runs the deterministic sim at a fixed tick rate and renders its state. */
export class MissionScene extends Phaser.Scene {
  private sim!: Sim;
  private commander!: KeyboardCommander;
  private accumulator = 0;
  private sprites = new Map<EntityId, Phaser.GameObjects.Image>();
  private genHpBars = new Map<EntityId, Phaser.GameObjects.Rectangle>();
  private exitSprite!: Phaser.GameObjects.Image;
  private ended = false;

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
    this.genHpBars.clear();
    this.commander = new KeyboardCommander(this);

    this.drawLevel();

    this.exitSprite = this.add
      .image(this.sim.state.exitPos.x, this.sim.state.exitPos.y, TEX.exit)
      .setDepth(1)
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
    level.walls.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) {
        const key = row[tx] === '#' ? TEX.wall : TEX.floor;
        this.add.image(tx * 32 + 16, ty * 32 + 16, key).setDepth(0);
      }
    });
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
  }

  // -------------------------------------------------------------------------

  private handleEvents(events: SimEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'attack':
          this.flashArc(ev.pos, ev.facing);
          break;
        case 'ability':
          this.flashRing(ev.pos, ev.radius, 0xd9a441);
          break;
        case 'enemy-hit':
        case 'generator-hit':
          this.tintFlash(this.spriteFor(ev), 0xffffff);
          break;
        case 'enemy-died':
          this.deathPuff(ev.pos, 0x9fe06a);
          break;
        case 'generator-destroyed':
          this.deathPuff(ev.pos, 0xa855c8, 1.8);
          this.cameras.main.shake(120, 0.008);
          break;
        case 'pickup-collected':
          this.floatText(ev.pos, ev.kind === 'gold' ? `+${ev.amount}` : `+${ev.amount} HP`, ev.kind === 'gold' ? '#ffd75e' : '#e0524d');
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

    for (const p of s.players) {
      seen.add(p.id);
      const spr = this.ensureSprite(p.id, TEX.hero, 3);
      spr.setPosition(p.pos.x, p.pos.y);
      spr.setAlpha(p.invulnTicks > 0 && p.invulnTicks % 10 < 5 ? 0.4 : 1);
      if (!p.alive) spr.setTint(0x555555);
      this.cameras.main.centerOn(p.pos.x, p.pos.y);
    }
    for (const e of s.enemies) {
      seen.add(e.id);
      this.ensureSprite(e.id, TEX.skitterling, 2).setPosition(e.pos.x, e.pos.y);
    }
    for (const g of s.generators) {
      seen.add(g.id);
      this.ensureSprite(g.id, TEX.broodNode, 1).setPosition(g.pos.x, g.pos.y);
      let bar = this.genHpBars.get(g.id);
      if (!bar) {
        bar = this.add.rectangle(g.pos.x, g.pos.y - 30, 40, 5, 0xa855c8).setDepth(5);
        this.genHpBars.set(g.id, bar);
      }
      bar.width = 40 * (g.hp / g.maxHp);
    }
    for (const pk of s.pickups) {
      seen.add(pk.id);
      this.ensureSprite(pk.id, pk.kind === 'gold' ? TEX.gold : TEX.health, 1).setPosition(pk.pos.x, pk.pos.y);
    }

    for (const [id, spr] of this.sprites) {
      if (!seen.has(id)) {
        spr.destroy();
        this.sprites.delete(id);
        const bar = this.genHpBars.get(id);
        if (bar) {
          bar.destroy();
          this.genHpBars.delete(id);
        }
      }
    }
  }

  private ensureSprite(id: EntityId, key: string, depth: number): Phaser.GameObjects.Image {
    let spr = this.sprites.get(id);
    if (!spr) {
      spr = this.add.image(0, 0, key).setDepth(depth);
      this.sprites.set(id, spr);
    }
    return spr;
  }

  // -------------------------------------------------------------------------
  // Feedback effects

  private flashArc(pos: { x: number; y: number }, facing: { x: number; y: number }): void {
    const angle = Math.atan2(facing.y, facing.x);
    const g = this.add.graphics({ x: pos.x, y: pos.y }).setDepth(4);
    g.fillStyle(0xf4e3b2, 0.55);
    g.slice(0, 0, 52, angle - 0.95, angle + 0.95);
    g.fillPath();
    this.tweens.add({ targets: g, alpha: 0, duration: 120, onComplete: () => g.destroy() });
  }

  private flashRing(pos: { x: number; y: number }, radius: number, color: number): void {
    const circle = this.add.circle(pos.x, pos.y, 12, color, 0.5).setDepth(4);
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
    this.time.delayedCall(60, () => spr.clearTint());
  }

  private deathPuff(pos: { x: number; y: number }, color: number, scale = 1): void {
    const circle = this.add.circle(pos.x, pos.y, 10 * scale, color, 0.7).setDepth(4);
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
      .setDepth(6);
    this.tweens.add({ targets: t, y: pos.y - 44, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }
}
