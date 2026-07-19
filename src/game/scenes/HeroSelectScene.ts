import Phaser from 'phaser';
import { CONTENT } from '../../content';
import { loadProfile, profileModifiers, upgradeLevel, UPGRADES } from '../../meta/save';
import type { HeroDef, HeroModifiers } from '../../sim/types';
import { audio } from '../audio';
import { TEX, enemyFrame, heroFrame } from '../textures';

/**
 * Title / hero-select with attract-mode energy (issue #9): layered pulsing
 * logo, two ambient drift layers, a marching skitterling silhouette parade,
 * an animated hero card with stat bars and a looping ability demo, and
 * teasing locked slots. All generated art, no binary assets.
 */

// Future classes not yet in the roster get teaser slots. The four core
// heroes are all playable now, so there are none.
const LOCKED_ROLES: string[] = [];

// Stat bars normalize hero data against these slice-era ceilings.
const STAT_CEILING = { power: 50, speed: 260, toughness: 220, control: 600 };

/** Missions that must be cleared before a hero can be recruited. */
const HERO_UNLOCK_MISSIONS: Record<string, number> = { vanguard: 0, arcanist: 1, ranger: 2, sentinel: 3 };

function heroUnlocked(heroId: string, missionsCompleted: number): boolean {
  return missionsCompleted >= (HERO_UNLOCK_MISSIONS[heroId] ?? 0);
}

/**
 * A single "crowd control" score for the stat bar, however the ability
 * achieves it: knockback or slow strength for blasts, dash reach for the
 * skirmisher's reposition, or brace-and-reflect for the guard stance.
 */
function abilityControl(ability: HeroDef['ability']): number {
  if (ability.kind === 'dash-volley') return ability.dashPx + ability.dartCount * 20;
  if (ability.kind === 'guard') return ability.reflectKnockback + (1 - ability.damageMult) * 400;
  return Math.max(ability.knockback, (ability.slowTicks ?? 0) * 3.5);
}

export class HeroSelectScene extends Phaser.Scene {
  private parade: { img: Phaser.GameObjects.Image; speed: number }[] = [];
  private paradeFrame = 0;
  private heroSprite!: Phaser.GameObjects.Image;
  private heroFrameOn = false;
  private heroIndex = 0;

  constructor() {
    super('hero-select');
  }

  create(data?: { heroIndex?: number }): void {
    const { width, height } = this.scale;
    const profile = loadProfile();
    const roster = Object.values(CONTENT.heroes);
    this.heroIndex = Math.min(Math.max(data?.heroIndex ?? 0, 0), roster.length - 1);
    const hero = roster[this.heroIndex]!;
    const unlocked = heroUnlocked(hero.id, profile.missionsCompleted);
    const mods = profileModifiers(profile);
    this.parade = [];

    this.drawAmbient(width, height);
    this.drawTitle(width);
    this.drawHeroCard(width, hero, mods, unlocked, roster.length);
    this.drawLockedSlots(width);

    // Profile summary.
    const upgradesOwned = Object.keys(UPGRADES)
      .map((id) => ({ id, level: upgradeLevel(profile, id) }))
      .filter((u) => u.level > 0)
      .map((u) => `${UPGRADES[u.id]!.name} ${u.level}`)
      .join(', ');
    this.add
      .text(
        width / 2,
        524,
        `Bank: ${profile.bank} gold   Missions cleared: ${profile.missionsCompleted}` +
          (upgradesOwned ? `\nUpgrades: ${upgradesOwned}` : ''),
        { fontFamily: 'monospace', fontSize: '15px', color: '#ffd75e', align: 'center' }
      )
      .setOrigin(0.5);

    // Input affordance: pulsing prompt + bordered footer bar with key hints.
    const prompt = this.add
      .text(width / 2, height - 122, 'PRESS ENTER', {
        fontFamily: 'monospace',
        fontSize: '26px',
        color: '#64e6ff',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.35, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    this.add.rectangle(width / 2, height - 62, 700, 42, 0x120c1a, 0.8).setStrokeStyle(1, 0x3a2f4a);
    this.add
      .text(width / 2, height - 62, '←→ switch hero   Move WASD   Attack Space/J   Ability Shift/K   Mute M', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#a89bb8'
      })
      .setOrigin(0.5);

    const kb = this.input.keyboard;
    const cycle = (delta: number): void => {
      const next = (this.heroIndex + delta + roster.length) % roster.length;
      audio.unlock();
      audio.uiTick();
      this.scene.restart({ heroIndex: next });
    };
    kb?.on('keydown-LEFT', () => cycle(-1));
    kb?.on('keydown-RIGHT', () => cycle(1));
    kb?.on('keydown-A', () => cycle(-1));
    kb?.on('keydown-D', () => cycle(1));
    kb?.on('keydown-ENTER', () => {
      // First user gesture: unlock the audio context here so the mission's
      // music can start without tripping the browser autoplay policy.
      audio.unlock();
      if (!unlocked) {
        audio.uiTick(200); // locked: low buzz, stay on the roster
        return;
      }
      audio.uiConfirm();
      this.scene.start('mission', { heroId: hero.id });
    });
  }

  /** Two independent ambient layers + the silhouette parade. */
  private drawAmbient(width: number, height: number): void {
    // Layer 1: fine spores drifting upward.
    this.add.particles(0, 0, TEX.mote, {
      x: { min: 0, max: width },
      y: height + 10,
      lifespan: { min: 7000, max: 11000 },
      speedY: { min: -22, max: -10 },
      speedX: { min: -6, max: 6 },
      scale: { start: 1, end: 0.3 },
      alpha: { start: 0.45, end: 0 },
      tint: [0xa855c8, 0x9fe06a, 0x64e6ff],
      frequency: 140
    });
    // Layer 2: slow, larger haze motes sinking down.
    this.add.particles(0, 0, TEX.dust, {
      x: { min: 0, max: width },
      y: -10,
      lifespan: { min: 9000, max: 14000 },
      speedY: { min: 6, max: 14 },
      scale: { start: 1.6, end: 0.6 },
      alpha: { start: 0.16, end: 0 },
      tint: 0xa855c8,
      frequency: 420
    });

    // Layer 3: a marching skitterling silhouette parade along the bottom.
    for (let i = 0; i < 8; i++) {
      const img = this.add
        .image(i * 140 + 40, height - 20, enemyFrame('skitter', 'common', 'w0'))
        .setTint(0x1c1526)
        .setAlpha(0.9)
        .setFlipX(true) // drawn facing +x; parade marches left
        .setScale(1.25);
      this.parade.push({ img, speed: 26 + (i % 3) * 7 });
    }
    this.time.addEvent({
      delay: 150,
      loop: true,
      callback: () => {
        this.paradeFrame ^= 1;
        const key = enemyFrame('skitter', 'common', this.paradeFrame ? 'w1' : 'w0');
        for (const p of this.parade) p.img.setTexture(key);
      }
    });
  }

  private drawTitle(width: number): void {
    // Layered logo: dark under-layer, gold main layer, slow pulse/shimmer.
    this.add
      .text(width / 2 + 4, 74, 'HIVE LEGENDS', {
        fontFamily: 'monospace',
        fontSize: '52px',
        color: '#4a3210',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    const title = this.add
      .text(width / 2, 70, 'HIVE LEGENDS', {
        fontFamily: 'monospace',
        fontSize: '52px',
        color: '#ffd75e',
        stroke: '#4a3210',
        strokeThickness: 6,
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: title, scale: 1.03, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    const glow = this.add
      .image(width / 2, 70, TEX.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffd75e)
      .setScale(9, 2.2)
      .setAlpha(0.14);
    this.tweens.add({ targets: glow, alpha: 0.26, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    this.add
      .text(width / 2, 116, 'The Brood Warrens await', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#a89bb8'
      })
      .setOrigin(0.5);
  }

  private drawHeroCard(width: number, hero: HeroDef, mods: HeroModifiers, unlocked: boolean, rosterSize: number): void {
    // Sit left of centre when teaser slots share the row; centre when alone.
    const cardX = LOCKED_ROLES.length > 0 ? width / 2 - 240 : width / 2;
    this.add.rectangle(cardX, 320, 300, 320, 0x231a30).setStrokeStyle(2, unlocked ? 0xd9a441 : 0x544868);

    // Roster position indicator.
    this.add
      .text(cardX, 168, `◀  ${this.heroIndex + 1} / ${rosterSize}  ▶`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#a89bb8'
      })
      .setOrigin(0.5);

    // Animated hero: idle two-frame cycle from the issue #2 frame set.
    this.heroSprite = this.add.image(cardX, 218, heroFrame(hero.id, 2, 'w0')).setScale(2.4);
    if (!unlocked) this.heroSprite.setTint(0x0d0a14);
    this.time.addEvent({
      delay: 320,
      loop: true,
      callback: () => {
        this.heroFrameOn = !this.heroFrameOn;
        this.heroSprite.setTexture(heroFrame(hero.id, 2, this.heroFrameOn ? 'w1' : 'w0'));
      }
    });

    this.add
      .text(cardX, 282, `${hero.name}\nthe ${hero.role}`, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: unlocked ? '#f4e3b2' : '#7a6f92',
        align: 'center'
      })
      .setOrigin(0.5);

    if (!unlocked) {
      this.add.rectangle(cardX, 460, 260, 24, 0x120c1a).setStrokeStyle(1, 0xff5a4d);
      this.add
        .text(cardX, 460, 'LOCKED — clear a mission to recruit', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ff8a7a'
        })
        .setOrigin(0.5);
    }

    // Stat bars instead of raw numbers (modifier-adjusted). Control folds
    // knockback, crowd-binding, or dash reach into one score (see helper).
    const control = abilityControl(hero.ability);
    const stats: { label: string; value: number; max: number }[] = [
      { label: 'POWER', value: hero.attack.damage + mods.damageBonus, max: STAT_CEILING.power },
      { label: 'SPEED', value: hero.moveSpeed, max: STAT_CEILING.speed },
      { label: 'TOUGHNESS', value: hero.maxHp + mods.maxHpBonus, max: STAT_CEILING.toughness },
      { label: 'CONTROL', value: control, max: STAT_CEILING.control }
    ];
    stats.forEach((s, i) => {
      const y = 328 + i * 24;
      this.add.text(cardX - 130, y - 7, s.label, { fontFamily: 'monospace', fontSize: '11px', color: '#a89bb8' });
      this.add.rectangle(cardX - 30, y, 150, 9, 0x120c1a).setOrigin(0, 0.5);
      const frac = Math.max(0.08, Math.min(1, s.value / s.max));
      this.add.rectangle(cardX - 30, y, 150 * frac, 9, 0xd9a441).setOrigin(0, 0.5);
    });

    // Looping ability demo: the Sunder Slam shockwave, in miniature.
    this.add
      .text(cardX, 438, `${hero.ability.name}`, { fontFamily: 'monospace', fontSize: '13px', color: '#f4e3b2' })
      .setOrigin(0.5);
    const demoY = 218;
    this.time.addEvent({
      delay: 1500,
      loop: true,
      callback: () => {
        const ring = this.add.circle(cardX, demoY, 10).setStrokeStyle(3, 0xd9a441, 0.9);
        this.tweens.add({
          targets: ring,
          radius: 52,
          alpha: 0,
          duration: 500,
          ease: 'Quad.Out',
          onComplete: () => ring.destroy()
        });
      }
    });
  }

  private drawLockedSlots(width: number): void {
    LOCKED_ROLES.forEach((role, i) => {
      const x = width / 2 + 60 + i * 130;
      this.add.rectangle(x, 320, 110, 320, 0x1a1424).setStrokeStyle(1, 0x3a2f4a);
      // Darkened silhouette teasing the future hero rather than an empty box.
      this.add.image(x, 260, TEX.hero).setScale(1.9).setTint(0x0d0a14).setAlpha(0.9);
      this.add
        .text(x, 340, role, { fontFamily: 'monospace', fontSize: '15px', color: '#544868', fontStyle: 'bold' })
        .setOrigin(0.5);
      this.add.rectangle(x, 372, 96, 20, 0x120c1a).setStrokeStyle(1, 0x544868);
      this.add
        .text(x, 372, 'COMING SOON', { fontFamily: 'monospace', fontSize: '10px', color: '#7a6f92' })
        .setOrigin(0.5);
    });
  }

  override update(_time: number, delta: number): void {
    const width = this.scale.width;
    for (const p of this.parade) {
      p.img.x -= (p.speed * delta) / 1000;
      if (p.img.x < -30) p.img.x = width + 30;
    }
  }
}
