import Phaser from 'phaser';
import { CONTENT } from '../../content';
import { loadProfile, profileModifiers, upgradeLevel, UPGRADES } from '../../meta/save';
import { TEX } from '../textures';

const LOCKED_ROLES = ['Arcanist', 'Ranger', 'Sentinel'];

export class HeroSelectScene extends Phaser.Scene {
  constructor() {
    super('hero-select');
  }

  create(): void {
    const { width, height } = this.scale;
    const profile = loadProfile();
    const hero = CONTENT.heroes['vanguard']!;
    const mods = profileModifiers(profile);

    this.add
      .text(width / 2, 70, 'HIVE LEGENDS', {
        fontFamily: 'monospace',
        fontSize: '52px',
        color: '#ffd75e',
        stroke: '#4a3210',
        strokeThickness: 6
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 116, 'The Brood Warrens await', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#a89bb8'
      })
      .setOrigin(0.5);

    // Selected hero card.
    const cardX = width / 2 - 240;
    const card = this.add.rectangle(cardX, 320, 300, 300, 0x231a30).setStrokeStyle(2, 0xd9a441);
    void card;
    this.add.image(cardX, 240, TEX.hero).setScale(2.4);
    this.add
      .text(cardX, 300, `${hero.name}\nthe ${hero.role}`, {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#f4e3b2',
        align: 'center'
      })
      .setOrigin(0.5);
    this.add
      .text(
        cardX,
        392,
        `HP ${hero.maxHp + mods.maxHpBonus}   DMG ${hero.attack.damage + mods.damageBonus}\n` +
          `${hero.ability.name}: crowd-breaking slam`,
        { fontFamily: 'monospace', fontSize: '13px', color: '#a89bb8', align: 'center' }
      )
      .setOrigin(0.5);

    // Locked roster slots.
    LOCKED_ROLES.forEach((role, i) => {
      const x = width / 2 + 60 + i * 130;
      this.add.rectangle(x, 320, 110, 300, 0x1a1424).setStrokeStyle(1, 0x3a2f4a);
      this.add
        .text(x, 320, `${role}\n\nLOCKED`, {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#544868',
          align: 'center'
        })
        .setOrigin(0.5);
    });

    // Profile summary.
    const upgradesOwned = Object.keys(UPGRADES)
      .map((id) => ({ id, level: upgradeLevel(profile, id) }))
      .filter((u) => u.level > 0)
      .map((u) => `${UPGRADES[u.id]!.name} ${u.level}`)
      .join(', ');
    this.add
      .text(
        width / 2,
        510,
        `Bank: ${profile.bank} gold   Missions cleared: ${profile.missionsCompleted}` +
          (upgradesOwned ? `\nUpgrades: ${upgradesOwned}` : ''),
        { fontFamily: 'monospace', fontSize: '15px', color: '#ffd75e', align: 'center' }
      )
      .setOrigin(0.5);

    this.add
      .text(width / 2, height - 90, 'ENTER — begin the mission', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#64e6ff'
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height - 55, 'Move: WASD/Arrows   Attack: Space/J   Sunder Slam: Shift/K', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#a89bb8'
      })
      .setOrigin(0.5);

    this.input.keyboard?.once('keydown-ENTER', () => this.scene.start('mission'));
  }
}
