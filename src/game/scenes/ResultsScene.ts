import Phaser from 'phaser';
import {
  buyUpgrade,
  loadProfile,
  saveProfile,
  upgradeCost,
  upgradeLevel,
  UPGRADES,
  type Profile
} from '../../meta/save';

interface ResultsData {
  victory: boolean;
  gold: number;
  kills: number;
  ticks: number;
}

/** Mission results + the between-mission upgrade shop. */
export class ResultsScene extends Phaser.Scene {
  private profile!: Profile;
  private shopText!: Phaser.GameObjects.Text;
  private bankText!: Phaser.GameObjects.Text;

  constructor() {
    super('results');
  }

  create(data: ResultsData): void {
    const { width, height } = this.scale;

    // Bank the run's gold exactly once, on scene entry.
    this.profile = loadProfile();
    this.profile.bank += data.gold;
    if (data.victory) {
      this.profile.missionsCompleted += 1;
      if (this.profile.bestClearTicks === null || data.ticks < this.profile.bestClearTicks) {
        this.profile.bestClearTicks = data.ticks;
      }
    }
    saveProfile(this.profile);

    const seconds = (data.ticks / 60).toFixed(1);
    this.add
      .text(width / 2, 90, data.victory ? 'WARRENS CLEANSED' : 'THE HIVE PREVAILS', {
        fontFamily: 'monospace',
        fontSize: '42px',
        color: data.victory ? '#9fe06a' : '#e0524d',
        stroke: '#120c1a',
        strokeThickness: 5
      })
      .setOrigin(0.5);

    this.add
      .text(
        width / 2,
        165,
        `Gold collected: ${data.gold}    Kills: ${data.kills}    Time: ${seconds}s`,
        { fontFamily: 'monospace', fontSize: '18px', color: '#f4e3b2' }
      )
      .setOrigin(0.5);

    this.bankText = this.add
      .text(width / 2, 205, '', { fontFamily: 'monospace', fontSize: '18px', color: '#ffd75e' })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 265, '— SPEND YOUR SPOILS —', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#a89bb8'
      })
      .setOrigin(0.5);

    this.shopText = this.add
      .text(width / 2, 340, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#f4e3b2',
        align: 'center',
        lineSpacing: 10
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height - 80, 'R — replay mission      H — hero select', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#64e6ff'
      })
      .setOrigin(0.5);

    this.refreshTexts();

    const kb = this.input.keyboard!;
    kb.on('keydown-ONE', () => this.tryBuy('vitality'));
    kb.on('keydown-TWO', () => this.tryBuy('might'));
    kb.once('keydown-R', () => this.scene.start('mission'));
    kb.once('keydown-H', () => this.scene.start('hero-select'));
  }

  private tryBuy(upgradeId: string): void {
    if (buyUpgrade(this.profile, upgradeId)) {
      this.cameras.main.flash(150, 255, 215, 94);
    }
    this.refreshTexts();
  }

  private refreshTexts(): void {
    this.bankText.setText(`Bank: ${this.profile.bank} gold`);
    const lines = Object.values(UPGRADES).map((def, i) => {
      const level = upgradeLevel(this.profile, def.id);
      const cost = upgradeCost(this.profile, def.id);
      const price = cost === null ? 'MAXED' : `${cost}g`;
      return `[${i + 1}] ${def.name}  (rank ${level}/${def.maxLevel})  ${def.description}  — ${price}`;
    });
    this.shopText.setText(lines.join('\n'));
  }
}
