import Phaser from 'phaser';
import type { MissionScene } from './MissionScene';

/**
 * Screen-space HUD rendered by a parallel scene so the mission camera's
 * zoom and scroll never distort it.
 */
export class HudScene extends Phaser.Scene {
  private hpBar!: Phaser.GameObjects.Rectangle;
  private hpText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private objectiveText!: Phaser.GameObjects.Text;
  private abilityText!: Phaser.GameObjects.Text;

  constructor() {
    super('hud');
  }

  create(): void {
    const mkText = (x: number, y: number, size: number, color: string) =>
      this.add.text(x, y, '', { fontFamily: 'monospace', fontSize: `${size}px`, color });

    this.add.rectangle(16, 16, 204, 22, 0x000000, 0.6).setOrigin(0, 0);
    this.hpBar = this.add.rectangle(18, 18, 200, 18, 0xe0524d).setOrigin(0, 0);
    this.hpText = mkText(24, 19, 13, '#ffffff');
    this.goldText = mkText(16, 44, 15, '#ffd75e');
    this.objectiveText = mkText(16, 68, 14, '#64e6ff');
    this.abilityText = mkText(16, this.scale.height - 30, 14, '#a89bb8');
  }

  override update(): void {
    const mission = this.scene.get('mission') as MissionScene;
    const info = mission.hudInfo();
    if (!info) return;
    this.hpBar.width = 200 * Math.max(0, info.hp / info.maxHp);
    this.hpText.setText(`${Math.ceil(info.hp)} / ${info.maxHp}`);
    this.goldText.setText(`Gold ${info.gold}   Kills ${info.kills}`);
    this.objectiveText.setText(
      info.phase === 'combat'
        ? `Destroy the Brood Nodes — ${info.generatorsLeft} remaining`
        : 'The way is open — reach the exit!'
    );
    this.abilityText.setText(
      info.abilityCooldown === 0
        ? `${info.abilityName} READY (Shift/K)`
        : `${info.abilityName} in ${Math.ceil(info.abilityCooldown / 60)}s`
    );
  }
}
