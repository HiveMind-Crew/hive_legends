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
import { audio } from '../audio';
import { TEX } from '../textures';

interface ResultsData {
  victory: boolean;
  gold: number;
  kills: number;
  ticks: number;
  /** Hero played this run; kept so replay and hero-select return to it. */
  heroId: string;
}

/** Mission results + the between-mission upgrade shop. */
export class ResultsScene extends Phaser.Scene {
  private profile!: Profile;
  private shopText!: Phaser.GameObjects.Text;
  private bankText!: Phaser.GameObjects.Text;
  private shownBank = 0;
  private bankTween: Phaser.Tweens.Tween | null = null;

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

    // Banner treatment: colored band + glow behind the verdict, title pops in.
    const bannerColor = data.victory ? 0x9fe06a : 0xe0524d;
    this.add.rectangle(width / 2, 90, width, 74, bannerColor, 0.1);
    this.add.rectangle(width / 2, 55, width, 2, bannerColor, 0.45);
    this.add.rectangle(width / 2, 125, width, 2, bannerColor, 0.45);
    this.add
      .image(width / 2, 90, TEX.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(bannerColor)
      .setScale(10, 2)
      .setAlpha(0.2);
    const seconds = (data.ticks / 60).toFixed(1);
    const banner = this.add
      .text(width / 2, 90, data.victory ? 'WARRENS CLEANSED' : 'THE HIVE PREVAILS', {
        fontFamily: 'monospace',
        fontSize: '42px',
        color: data.victory ? '#9fe06a' : '#e0524d',
        stroke: '#120c1a',
        strokeThickness: 5,
        fontStyle: 'bold'
      })
      .setOrigin(0.5)
      .setScale(0.6)
      .setAlpha(0);
    this.tweens.add({ targets: banner, scale: 1, alpha: 1, duration: 350, ease: 'Back.Out' });

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

    // Gold count-up: roll the bank from its pre-mission value to the new
    // total, with a few rising coin ticks along the way.
    this.shownBank = this.profile.bank - data.gold;
    this.refreshTexts();
    if (data.gold > 0) {
      const counter = { v: this.shownBank };
      this.bankTween = this.tweens.add({
        targets: counter,
        v: this.profile.bank,
        duration: 900,
        delay: 350,
        ease: 'Quad.Out',
        onUpdate: () => {
          this.shownBank = counter.v;
          this.refreshTexts();
        }
      });
      for (let i = 0; i < 5; i++) {
        this.time.delayedCall(350 + i * 160, () => audio.uiTick(760 + i * 60));
      }
    }

    audio.unlock();

    const kb = this.input.keyboard!;
    kb.on('keydown-ONE', () => this.tryBuy('vitality'));
    kb.on('keydown-TWO', () => this.tryBuy('might'));
    kb.on('keydown-M', () => audio.toggleMute());
    kb.once('keydown-R', () => {
      audio.uiConfirm();
      this.scene.start('mission', { heroId: data.heroId });
    });
    kb.once('keydown-H', () => {
      audio.uiConfirm();
      this.scene.start('hero-select', { heroId: data.heroId });
    });
  }

  private tryBuy(upgradeId: string): void {
    if (buyUpgrade(this.profile, upgradeId)) {
      this.cameras.main.flash(150, 255, 215, 94);
      audio.uiConfirm();
    } else {
      audio.uiTick(220); // low buzz on a failed purchase
    }
    this.bankTween?.stop();
    this.bankTween = null;
    this.shownBank = this.profile.bank; // purchases update instantly
    this.refreshTexts();
  }

  private refreshTexts(): void {
    this.bankText.setText(`Bank: ${Math.round(this.shownBank)} gold`);
    const lines = Object.values(UPGRADES).map((def, i) => {
      const level = upgradeLevel(this.profile, def.id);
      const cost = upgradeCost(this.profile, def.id);
      const price = cost === null ? 'MAXED' : `${cost}g`;
      return `[${i + 1}] ${def.name}  (rank ${level}/${def.maxLevel})  ${def.description}  — ${price}`;
    });
    this.shopText.setText(lines.join('\n'));
  }
}
