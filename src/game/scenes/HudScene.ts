import Phaser from 'phaser';
import { audio } from '../audio';
import { playerAccent } from '../colors';
import { TEX, heroPortrait } from '../textures';
import type { HudInfo, MissionScene } from './MissionScene';

/**
 * Arcade HUD (issue #4): four fixed per-player panels along the top edge —
 * accent-colored frame, portrait, large health number, rolling gold counter,
 * kills, and an ability meter with a READY! flash. Empty slots render dimmed
 * JOIN placeholders as co-op groundwork. Rendered by a parallel scene so the
 * mission camera's zoom and scroll never distort it.
 */

const SLOTS = 4;
const PANEL_W = 225;
const PANEL_H = 54;
const PANEL_GAP = 8;
const PANEL_Y = 8;
const PANELS_X = (960 - (SLOTS * PANEL_W + (SLOTS - 1) * PANEL_GAP)) / 2;
const LOW_HP_FRACTION = 0.3;

interface Panel {
  border: Phaser.GameObjects.Rectangle;
  chip: Phaser.GameObjects.Rectangle;
  chipText: Phaser.GameObjects.Text;
  portrait: Phaser.GameObjects.Image;
  hpText: Phaser.GameObjects.Text;
  maxHpText: Phaser.GameObjects.Text;
  goldIcon: Phaser.GameObjects.Image;
  goldText: Phaser.GameObjects.Text;
  killsText: Phaser.GameObjects.Text;
  abilityBack: Phaser.GameObjects.Rectangle;
  abilityBar: Phaser.GameObjects.Rectangle;
  joinText: Phaser.GameObjects.Text;
}

export class HudScene extends Phaser.Scene {
  private panels: Panel[] = [];
  private goldShown = [0, 0, 0, 0];
  private prevAbilityCd = [0, 0, 0, 0];
  private objectiveBg!: Phaser.GameObjects.Rectangle;
  private objectiveText!: Phaser.GameObjects.Text;
  private prevObjective = '';
  private heraldBg!: Phaser.GameObjects.Rectangle;
  private heraldText!: Phaser.GameObjects.Text;
  private heraldQueue: { text: string; color: string }[] = [];
  private heraldBusy = false;
  private muteIcon!: Phaser.GameObjects.Text;

  constructor() {
    super('hud');
  }

  create(): void {
    this.panels = [];
    this.goldShown = [0, 0, 0, 0];
    this.prevAbilityCd = [0, 0, 0, 0];
    this.prevObjective = '';
    this.heraldQueue = [];
    this.heraldBusy = false;
    this.drawVignette();
    for (let i = 0; i < SLOTS; i++) this.panels.push(this.buildPanel(i));

    this.objectiveBg = this.add.rectangle(480, 78, 340, 24, 0x000000, 0.55);
    this.objectiveText = this.add
      .text(480, 78, '', { fontFamily: 'monospace', fontSize: '15px', color: '#64e6ff', fontStyle: 'bold' })
      .setOrigin(0.5);

    // The Herald: a single announcement ribbon lower-centre. Messages queue so
    // they never overlap illegibly (issue #8).
    this.heraldBg = this.add.rectangle(480, 150, 520, 34, 0x120c1a, 0.72).setOrigin(0.5).setVisible(false);
    this.heraldBg.setStrokeStyle(2, 0x64e6ff, 0.5);
    this.heraldText = this.add
      .text(480, 150, '', { fontFamily: 'monospace', fontSize: '20px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setVisible(false);

    // Mute indicator, bottom-right; reflects the shared audio engine state.
    this.muteIcon = this.add
      .text(this.scale.width - 12, this.scale.height - 12, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#544868'
      })
      .setOrigin(1, 1);
  }

  /** Enqueue a Herald announcement; shown one at a time in arrival order. */
  herald(text: string, color = '#ffffff'): void {
    this.heraldQueue.push({ text, color });
    if (!this.heraldBusy) this.showNextHerald();
  }

  private showNextHerald(): void {
    const next = this.heraldQueue.shift();
    if (!next) {
      this.heraldBusy = false;
      this.heraldBg.setVisible(false);
      this.heraldText.setVisible(false);
      return;
    }
    this.heraldBusy = true;
    this.heraldText.setText(next.text).setColor(next.color).setVisible(true).setAlpha(0).setScale(0.85);
    this.heraldBg.setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(next.color).color, 0.6);
    this.heraldBg.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: [this.heraldText, this.heraldBg], alpha: 1, duration: 160, ease: 'Quad.Out' });
    this.tweens.add({ targets: this.heraldText, scale: 1, duration: 220, ease: 'Back.Out' });
    this.time.delayedCall(1600, () => {
      this.tweens.add({
        targets: [this.heraldText, this.heraldBg],
        alpha: 0,
        duration: 220,
        onComplete: () => this.showNextHerald()
      });
    });
  }

  /**
   * Soft screen-edge darkening drawn in screen space (this scene sits above
   * the mission camera, so zoom/scroll never move it). Overlapping strokes
   * build the gradient without shaders.
   */
  private drawVignette(): void {
    const g = this.add.graphics().setDepth(-10);
    const w = this.scale.width;
    const h = this.scale.height;
    for (let i = 0; i < 9; i++) {
      const inset = 2 + i * 7;
      g.lineStyle(14, 0x0a0710, 0.11 * (1 - i / 9));
      g.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
    }
  }

  private buildPanel(i: number): Panel {
    const x = PANELS_X + i * (PANEL_W + PANEL_GAP);
    const y = PANEL_Y;
    const accent = playerAccent(i);
    const mono = (tx: number, ty: number, size: number, color: string, style = '') =>
      this.add.text(x + tx, y + ty, '', { fontFamily: 'monospace', fontSize: `${size}px`, color, fontStyle: style });

    this.add.rectangle(x, y, PANEL_W, PANEL_H, 0x000000, 0.55).setOrigin(0, 0);
    const border = this.add.rectangle(x, y, PANEL_W, PANEL_H).setOrigin(0, 0).setStrokeStyle(2, accent);

    const chip = this.add.rectangle(x, y, 26, 16, accent).setOrigin(0, 0);
    const chipText = mono(4, 2, 11, '#101020', 'bold');
    chipText.setText(`P${i + 1}`);

    const portrait = this.add.image(x + 24, y + 34, TEX.hero).setScale(0.9);

    const hpText = mono(46, 6, 22, '#ffffff', 'bold');
    const maxHpText = mono(112, 15, 11, '#8a8298');
    const goldIcon = this.add.image(x + 52, y + 39, TEX.gold).setScale(0.7);
    const goldText = mono(60, 33, 12, '#ffd75e');
    const killsText = mono(140, 33, 12, '#a89bb8');

    const abilityBack = this.add.rectangle(x + 150, y + 8, 68, 8, 0x2a2438).setOrigin(0, 0);
    const abilityBar = this.add.rectangle(x + 150, y + 8, 68, 8, accent).setOrigin(0, 0);

    const joinText = mono(PANEL_W / 2 - 24, PANEL_H / 2 - 8, 14, '#55506a');
    joinText.setText('JOIN');
    joinText.setX(x + PANEL_W / 2 - joinText.width / 2);

    return { border, chip, chipText, portrait, hpText, maxHpText, goldIcon, goldText, killsText, abilityBack, abilityBar, joinText };
  }

  override update(): void {
    const mission = this.scene.get('mission') as MissionScene;
    const info = mission.hudInfo();
    if (!info) return;

    for (let i = 0; i < SLOTS; i++) {
      this.updatePanel(i, info);
    }
    this.updateObjective(info);
    this.muteIcon.setText(audio.isMuted ? '♪ muted (M)' : '♪ (M)');
  }

  private updatePanel(i: number, info: HudInfo): void {
    const panel = this.panels[i]!;
    const p = info.players[i];
    const active = p !== undefined;

    panel.joinText.setVisible(!active);
    panel.border.setAlpha(active ? 1 : 0.35);
    for (const obj of [panel.chip, panel.chipText, panel.portrait, panel.hpText, panel.maxHpText, panel.goldIcon, panel.goldText, panel.killsText, panel.abilityBack, panel.abilityBar]) {
      obj.setVisible(active);
    }
    if (!p) return;

    // Large health number with a low-health pulse.
    panel.hpText.setText(String(Math.ceil(p.hp)));
    panel.maxHpText.setText(`/ ${p.maxHp}`);
    const low = p.hp / p.maxHp <= LOW_HP_FRACTION;
    panel.hpText.setColor(p.alive ? (low ? '#ff5a4d' : '#ffffff') : '#666270');
    panel.hpText.setScale(low && p.alive ? 1 + 0.06 * Math.sin(this.time.now / 90) : 1);
    if (panel.portrait.texture.key !== heroPortrait(p.heroId)) panel.portrait.setTexture(heroPortrait(p.heroId));
    panel.portrait.setTint(p.alive ? 0xffffff : 0x555555);

    // Gold counter rolls up toward the real value.
    const shown = this.goldShown[i]!;
    if (shown !== p.gold) {
      const diff = p.gold - shown;
      this.goldShown[i] = Math.abs(diff) <= 1 ? p.gold : shown + Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * 0.18));
    }
    panel.goldText.setText(String(this.goldShown[i]));
    panel.killsText.setText(`Kills ${p.kills}`);

    // Ability meter: fills as the cooldown recovers; flashes READY! at full.
    const frac = p.abilityMax > 0 ? Math.max(0, Math.min(1, 1 - p.abilityCooldown / p.abilityMax)) : 1;
    panel.abilityBar.width = 68 * frac;
    panel.abilityBar.setFillStyle(p.abilityCooldown === 0 ? playerAccent(i) : 0x6a6480);
    if (this.prevAbilityCd[i]! > 0 && p.abilityCooldown === 0) this.readyFlash(panel.abilityBack.x + 34, panel.abilityBack.y + 4);
    this.prevAbilityCd[i] = p.abilityCooldown;
  }

  private updateObjective(info: HudInfo): void {
    const label =
      info.phase === 'combat'
        ? `BROOD NODES: ${info.generatorsLeft}`
        : info.phase === 'exit-open'
          ? 'FIND THE EXIT!'
          : '';
    this.objectiveBg.setVisible(label !== '');
    this.objectiveText.setVisible(label !== '');
    if (label !== this.prevObjective) {
      this.prevObjective = label;
      this.objectiveText.setText(label);
      this.objectiveText.setColor(info.phase === 'exit-open' ? '#ffd75e' : '#64e6ff');
      // Pop animation on every objective change — the future chime hook.
      this.objectiveText.setScale(1.35);
      this.tweens.add({ targets: this.objectiveText, scale: 1, duration: 220, ease: 'Back.Out' });
    }
  }

  private readyFlash(x: number, y: number): void {
    const t = this.add
      .text(x, y, 'READY!', { fontFamily: 'monospace', fontSize: '13px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setScale(0.5);
    this.tweens.add({ targets: t, scale: 1.3, y: y - 14, alpha: 0, duration: 600, onComplete: () => t.destroy() });
  }

  /** Full-screen mission-end banner, shown before the results transition. */
  banner(text: string, color: string): void {
    this.add.rectangle(480, 360, 960, 720, 0x000000, 0.45);
    const t = this.add
      .text(480, 340, text, { fontFamily: 'monospace', fontSize: '46px', color, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setScale(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 300, ease: 'Back.Out' });
  }
}
